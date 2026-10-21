// Prompt Lab grading: offline, deterministic, structural checks on a {system, user} prompt.
// PURE (type-only imports, no DOM, no React) so node scripts can import it directly with type stripping:
// scripts/test-prompt-checks.mjs (unit tests) and scripts/validate-content.mjs (starter < pass, model = 100).
//
// Semantics (every function tolerates undefined / non-string input and never throws):
//  - Text matching is case-insensitive, collapses runs of whitespace to one space and is LITERAL
//    (needles are never compiled as regexes, so "$500" or "(" are safe).
//  - Template variables are written {{name}} with optional inner spaces: {{ name }}. Names compare
//    case-insensitively.
//  - where: 'system' | 'user' | 'either' (default) picks the text a check reads; 'either' = both.
//
//  has-system          the system prompt has at least `minWords` words (default 8): a real role/policy,
//                      not an empty or one-word placeholder.
//  delimits            {{variable}} appears at least once, and EVERY occurrence (system or user) sits
//                      inside an XML-style tag pair <tag …> … </tag> (allowed names = `tags`, or any tag
//                      except example/examples when omitted), or inside a ``` / """ fence pair.
//  no-input-in-system  none of `variables` appears in the system prompt, and each appears in the user
//                      turn (moving the input, not deleting it).
//  includes            at least one of `anyOf` appears (literal, case-insensitive) in `where`.
//  excludes            none of `anyOf` appears in `where`.
//  includes-all        EVERY entry of `allOf` appears in `where`. An entry is a phrase, or an array of
//                      alternative phrases that passes if any one of them appears (e.g. a closed label
//                      set, or the Thought / Action / Observation steps of a loop). Empty allOf fails.
//  examples            number of worked examples is within [min, max]. Examples = the larger of
//                      <example …> opening tags and "Input:" lines followed by an "Output:" line.
//  schema              the prompt specifies an output format (mentions JSON or has a { … } object that is
//                      not a {{variable}}) AND names every `requireKeys` key as a key: "key", 'key' or key:.
//  max-words           whitespace-separated word count of `where` is 1..limit (empty text fails).
//
// Score = round(100 × passed weight / total weight). Solved = score ≥ passScore (default 80).
import type { PromptCheck, PromptDraft, PromptLab, PromptPart } from '../types';

export const DEFAULT_PASS_SCORE = 80;
export const DEFAULT_SYSTEM_MIN_WORDS = 8;

export interface CheckResult {
  check: PromptCheck;
  pass: boolean;
  /** one line on what was found (or what is missing) */
  detail: string;
}

export interface Grade {
  /** 0..100 */
  score: number;
  passed: boolean;
  passScore: number;
  results: CheckResult[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n') : '');
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function wordCount(text: unknown): number {
  const t = str(text).trim();
  return t ? t.split(/\s+/).length : 0;
}

function pick(d: { system: string; user: string }, where: PromptPart | undefined): string {
  if (where === 'system') return d.system;
  if (where === 'user') return d.user;
  return `${d.system}\n${d.user}`;
}

const whereLabel = (where: PromptPart | undefined) => (where === 'system' ? 'the system prompt' : where === 'user' ? 'the user turn' : 'the prompt');

/** literal, case-insensitive, whitespace-insensitive matches of `needles` in `text` (deduplicated) */
export function findPhrases(text: string, needles: unknown): string[] {
  const hay = norm(str(text));
  const list = Array.isArray(needles) ? needles : [];
  const hits: string[] = [];
  for (const n of list) {
    const needle = norm(str(n));
    if (needle && hay.includes(needle) && !hits.includes(needle)) hits.push(needle);
  }
  return hits;
}

/** start indexes of {{name}} (inner spaces allowed, name case-insensitive) */
export function variableOccurrences(text: string, name: string): number[] {
  const v = str(name).trim();
  if (!v) return [];
  const re = new RegExp(`\\{\\{\\s*${escapeRe(v)}\\s*\\}\\}`, 'gi');
  return [...str(text).matchAll(re)].map((m) => m.index ?? 0);
}

const TAG_RE = /<(\/?)([A-Za-z][\w.:-]*)(?:\s[^<>]*)?>/g;
const DEFAULT_EXCLUDED_TAGS = new Set(['example', 'examples']);

/** names of the tags that are open at `pos` and closed again after it (innermost last) */
function enclosingTags(text: string, pos: number): string[] {
  const stack: string[] = [];
  TAG_RE.lastIndex = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const at = m.index ?? 0;
    if (at >= pos) break;
    if (m[0].endsWith('/>')) continue; // self-closing
    const name = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.lastIndexOf(name);
      if (i >= 0) stack.splice(i);
    } else stack.push(name);
  }
  const after = text.slice(pos).toLowerCase();
  return stack.filter((name) => after.includes(`</${name}>`) || new RegExp(`</${escapeRe(name)}\\s*>`).test(after));
}

/** inside a ``` or """ fence: an odd number of markers before `pos` and at least one after */
function insideFence(text: string, pos: number): string | null {
  for (const fence of ['```', '"""']) {
    const before = text.slice(0, pos).split(fence).length - 1;
    if (before % 2 === 1 && text.indexOf(fence, pos) >= 0) return fence;
  }
  return null;
}

function delimiterAt(text: string, pos: number, allowed: Set<string> | null): string | null {
  const tags = enclosingTags(text, pos).filter((t) => (allowed ? allowed.has(t) : !DEFAULT_EXCLUDED_TAGS.has(t)));
  if (tags.length) return `<${tags[tags.length - 1]}>`;
  return insideFence(text, pos);
}

/** worked examples: max(<example> opening tags, Input:/Output: line pairs) */
export function countExamples(text: string): number {
  const t = str(text);
  const tags = [...t.matchAll(/<example(?:\s[^<>]*)?>/gi)].length;
  let pairs = 0;
  let open = false;
  for (const line of t.split('\n')) {
    const l = line.trim().replace(/^[-*>\s]+/, '').toLowerCase();
    if (l.startsWith('input:')) open = true;
    else if (l.startsWith('output:') && open) {
      pairs++;
      open = false;
    }
  }
  return Math.max(tags, pairs);
}

function namesKey(text: string, key: string): boolean {
  const k = escapeRe(str(key).trim());
  if (!k) return true;
  return new RegExp(`["'\`]${k}["'\`]|(^|[^\\w{])${k}\\s*:`, 'i').test(text);
}

function hasFormatSpec(text: string): boolean {
  if (/\bjson\b/i.test(text)) return true;
  // a { … } object that is not a {{template variable}}
  const withoutVars = text.replace(/\{\{[^{}]*\}\}/g, ' ');
  return /\{[^{}]*:[^{}]*\}/.test(withoutVars);
}

function runCheck(check: PromptCheck, d: { system: string; user: string }): { pass: boolean; detail: string } {
  switch (check.kind) {
    case 'has-system': {
      const min = check.minWords ?? DEFAULT_SYSTEM_MIN_WORDS;
      const n = wordCount(d.system);
      if (!n) return { pass: false, detail: 'No system prompt yet.' };
      return n >= min
        ? { pass: true, detail: `System prompt has ${plural(n, 'word')}.` }
        : { pass: false, detail: `System prompt has only ${plural(n, 'word')} (needs ${min}+ to set a role and rules).` };
    }
    case 'delimits': {
      const allowed = Array.isArray(check.tags) && check.tags.length ? new Set(check.tags.map((t) => str(t).toLowerCase().replace(/[<>/]/g, '').trim())) : null;
      const v = `{{${check.variable}}}`;
      const parts: [string, string][] = [
        ['system prompt', d.system],
        ['user turn', d.user],
      ];
      let total = 0;
      const found = new Set<string>();
      for (const [where, text] of parts) {
        for (const pos of variableOccurrences(text, check.variable)) {
          total++;
          const delim = delimiterAt(text, pos, allowed);
          if (!delim) return { pass: false, detail: `${v} in the ${where} is not wrapped in ${allowed ? [...allowed].map((t) => `<${t}>`).join(' / ') : 'a tag pair or fence'}.` };
          found.add(delim);
        }
      }
      if (!total) return { pass: false, detail: `${v} is missing: the prompt must still include the input.` };
      return { pass: true, detail: `${total === 1 ? v : `All ${total} uses of ${v}`} wrapped in ${[...found].join(', ')}.` };
    }
    case 'no-input-in-system': {
      const vars = (Array.isArray(check.variables) ? check.variables : []).map((x) => str(x)).filter(Boolean);
      const inSystem = vars.filter((x) => variableOccurrences(d.system, x).length > 0);
      if (inSystem.length) return { pass: false, detail: `${inSystem.map((x) => `{{${x}}}`).join(', ')} is pasted into the system prompt.` };
      const missing = vars.filter((x) => variableOccurrences(d.user, x).length === 0);
      if (missing.length) return { pass: false, detail: `${missing.map((x) => `{{${x}}}`).join(', ')} is missing from the user turn.` };
      return { pass: true, detail: `${vars.map((x) => `{{${x}}}`).join(', ')} only in the user turn.` };
    }
    case 'includes': {
      const hits = findPhrases(pick(d, check.where), check.anyOf);
      return hits.length
        ? { pass: true, detail: `Found "${hits[0]}" in ${whereLabel(check.where)}.` }
        : { pass: false, detail: `Not found in ${whereLabel(check.where)}.` };
    }
    case 'excludes': {
      const hits = findPhrases(pick(d, check.where), check.anyOf);
      return hits.length
        ? { pass: false, detail: `Remove "${hits[0]}" from ${whereLabel(check.where)}.` }
        : { pass: true, detail: `None found in ${whereLabel(check.where)}.` };
    }
    case 'includes-all': {
      const text = pick(d, check.where);
      const groups = (Array.isArray(check.allOf) ? check.allOf : [])
        .map((g) => (Array.isArray(g) ? g : [g]).map((x) => str(x)).filter((x) => norm(x)))
        .filter((g) => g.length);
      if (!groups.length) return { pass: false, detail: 'Nothing to look for.' };
      const missing = groups.filter((g) => !findPhrases(text, g).length);
      if (!missing.length) return { pass: true, detail: `All ${groups.length} found in ${whereLabel(check.where)}.` };
      const shown = missing.slice(0, 3).map((g) => `"${norm(g[0])}"`).join(', ');
      return { pass: false, detail: `Missing ${shown}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''} in ${whereLabel(check.where)} (${groups.length - missing.length}/${groups.length} found).` };
    }
    case 'examples': {
      const n = countExamples(pick(d, 'either'));
      const max = check.max ?? Infinity;
      if (n < check.min) return { pass: false, detail: `${plural(n, 'example')} found (needs ${check.min}${Number.isFinite(max) ? `–${max}` : '+'}).` };
      if (n > max) return { pass: false, detail: `${plural(n, 'example')}: too many (keep ${check.min}–${max}).` };
      return { pass: true, detail: `${plural(n, 'example')} found.` };
    }
    case 'schema': {
      const text = pick(d, 'either');
      const keys = (Array.isArray(check.requireKeys) ? check.requireKeys : []).map((k) => str(k)).filter(Boolean);
      if (!hasFormatSpec(text)) return { pass: false, detail: 'No output format: ask for JSON and name its keys.' };
      const missing = keys.filter((k) => !namesKey(text, k));
      return missing.length
        ? { pass: false, detail: `Format names no ${missing.map((k) => `"${k}"`).join(', ')} key.` }
        : { pass: true, detail: `Output format names ${keys.map((k) => `"${k}"`).join(', ')}.` };
    }
    case 'max-words': {
      const n = wordCount(pick(d, check.where));
      if (!n) return { pass: false, detail: 'Nothing written yet.' };
      return n <= check.limit
        ? { pass: true, detail: `${n} / ${check.limit} words.` }
        : { pass: false, detail: `${n} words: trim ${n - check.limit} to stay within ${check.limit}.` };
    }
    default:
      return { pass: false, detail: 'Unknown check.' };
  }
}

/** Grade a prompt against a lab's checks. Never throws. */
export function gradePrompt(lab: Pick<PromptLab, 'checks' | 'passScore'>, draft: Partial<PromptDraft> | null | undefined): Grade {
  const d = { system: str(draft?.system), user: str(draft?.user) };
  const checks = Array.isArray(lab?.checks) ? lab.checks : [];
  const passScore = typeof lab?.passScore === 'number' ? lab.passScore : DEFAULT_PASS_SCORE;
  const results: CheckResult[] = checks.map((check) => {
    try {
      return { check, ...runCheck(check, d) };
    } catch {
      return { check, pass: false, detail: 'Could not evaluate this check.' };
    }
  });
  const total = results.reduce((a, r) => a + (Number(r.check.weight) || 0), 0);
  const got = results.reduce((a, r) => a + (r.pass ? Number(r.check.weight) || 0 : 0), 0);
  const score = total > 0 ? Math.round((got / total) * 100) : 0;
  return { score, passed: score >= passScore, passScore, results };
}
