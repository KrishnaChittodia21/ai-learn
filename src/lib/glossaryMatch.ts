// Glossary hover definitions (C4): find glossary terms in lesson text. Pure, so tests can run it on plain trees.
// Whole word, case-insensitive (except names like "ReAct" or "GPT" with inner capitals), simple plurals,
// first occurrence per term only, never inside code, links, headings or tables.

export interface TermSource {
  id: string;
  term: string;
  aliases?: string[];
  hover?: false;
}

export interface TermIndex {
  re: RegExp;
  /** lower-cased name → term id and whether the case must match exactly */
  names: Map<string, { id: string; exact: string | null }>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildTermIndex(terms: TermSource[]): TermIndex {
  const names = new Map<string, { id: string; exact: string | null }>();
  for (const t of terms) {
    if (t.hover === false) continue;
    for (const n of [t.term, ...(t.aliases ?? [])]) {
      // "ReAct", "GPT", "LoRA": a capital after the first letter in a single word means the case matters
      const exact = !/[\s-]/.test(n) && /[A-Z]/.test(n.slice(1)) ? n : null;
      if (!names.has(n.toLowerCase())) names.set(n.toLowerCase(), { id: t.id, exact });
    }
  }
  const alts = [...names.keys()].sort((a, b) => b.length - a.length).map(escape);
  const re = new RegExp(`(?<![\\w@-])(${alts.join('|') || '(?!)'})(?:e?s)?(?![\\w@-])`, 'gi');
  return { re, names };
}

export type Piece = string | { id: string; text: string };

/** split `text` into plain pieces and the first match of each term not yet in `seen` (which it updates) */
export function splitTerms(text: string, index: TermIndex, seen: Set<string>): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  index.re.lastIndex = 0;
  for (let m = index.re.exec(text); m; m = index.re.exec(text)) {
    const hit = index.names.get(m[1].toLowerCase());
    if (!hit || seen.has(hit.id) || (hit.exact && m[1] !== hit.exact)) continue;
    seen.add(hit.id);
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ id: hit.id, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** a minimal hast node: what react-markdown hands a rehype plugin */
export interface HNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HNode[];
}

const SKIP = new Set(['code', 'pre', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'button', 'kbd']);

/** wrap the first occurrence of each term in `<span data-gloss="id">` (mutates the tree) */
export function markTerms(tree: HNode, index: TermIndex, seen = new Set<string>()): void {
  const kids = tree.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (k.type === 'element') {
      if (!SKIP.has(k.tagName ?? '')) markTerms(k, index, seen);
    } else if (k.type === 'text' && k.value) {
      const pieces = splitTerms(k.value, index, seen);
      if (pieces.length === 1 && typeof pieces[0] === 'string') continue;
      const nodes: HNode[] = pieces.map((p) =>
        typeof p === 'string' ? { type: 'text', value: p } : { type: 'element', tagName: 'span', properties: { dataGloss: p.id }, children: [{ type: 'text', value: p.text }] },
      );
      kids.splice(i, 1, ...nodes);
      i += nodes.length - 1;
    }
  }
}
