// Unit tests for the Prompt Lab grader (src/lib/promptChecks.ts), in plain node (TypeScript is
// type-stripped; the grader has type-only imports). Usage:
//   node --no-warnings scripts/test-prompt-checks.mjs
// Covers every check kind with pass and fail cases, odd input that must never throw, and every
// shipped lab: its starter scores below the pass mark (≤ 25) and its model answer scores 100.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = async (rel) => import(pathToFileURL(join(root, rel)).href);
const G = await load('src/lib/promptChecks.ts');

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}
function eq(actual, expected, what = 'value') {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
/** grade a single check: returns {pass, detail} */
const one = (check, draft) => {
  const g = G.gradePrompt({ checks: [{ weight: 100, label: 'x', why: 'y', ...check }] }, draft);
  return g.results[0];
};
const ok = (check, draft, name) => test(`${check.kind} passes: ${name}`, () => eq(one(check, draft).pass, true, `pass (${one(check, draft).detail})`));
const no = (check, draft, name) => test(`${check.kind} fails: ${name}`, () => eq(one(check, draft).pass, false, `pass (${one(check, draft).detail})`));

// ---------- has-system ----------
const hs = { kind: 'has-system' };
ok(hs, { system: 'You are a support assistant for an online store. Follow the policy below.', user: 'hi' }, '8+ words');
no(hs, { system: '', user: 'You are a support assistant for an online store, follow the policy.' }, 'empty system');
no(hs, { system: '   \n  ', user: 'x' }, 'whitespace-only system');
no(hs, { system: 'You are helpful.', user: 'x' }, 'too short');
ok({ ...hs, minWords: 2 }, { system: 'You are helpful.', user: 'x' }, 'custom minWords');

// ---------- delimits ----------
const dl = { kind: 'delimits', variable: 'msg' };
ok(dl, { user: '<msg>{{msg}}</msg>' }, 'xml tag pair');
ok(dl, { user: '<Customer_Message id="1">\n  {{ msg }}\n</customer_message>' }, 'attributes, inner spaces, case-insensitive tags');
ok(dl, { user: 'Message:\n```\n{{msg}}\n```' }, 'backtick fence');
ok(dl, { user: '"""{{MSG}}"""' }, 'triple-quote fence, variable case-insensitive');
ok(dl, { system: '<doc>{{msg}}</doc>', user: '<input>{{msg}}</input>' }, 'every occurrence wrapped');
no(dl, { user: 'Message: {{msg}}' }, 'bare variable');
no(dl, { user: '<msg>{{msg}}</msg> and again {{msg}}' }, 'one of two occurrences bare');
no(dl, { user: '<msg>{{msg}}' }, 'tag never closed');
no(dl, { user: '<msg></msg>{{msg}}' }, 'tag closed before the variable');
no(dl, { user: '```{{msg}}' }, 'fence never closed');
no(dl, { user: 'no variable here' }, 'variable missing');
no(dl, { user: '<example>{{msg}}</example>' }, 'example tag is not a delimiter by default');
no({ ...dl, tags: ['ticket'] }, { user: '<msg>{{msg}}</msg>' }, 'tag not in the allowed list');
ok({ ...dl, tags: ['<ticket>'] }, { user: '<ticket>{{msg}}</ticket>' }, 'allowed list accepts <tag> spelling');
ok(dl, { user: '<outer><msg>{{msg}}</msg></outer>' }, 'nested tags');

// ---------- no-input-in-system ----------
const nis = { kind: 'no-input-in-system', variables: ['msg', 'name'] };
ok(nis, { system: 'You are a bot that helps people.', user: '<m>{{msg}}</m> for {{name}}' }, 'both only in user');
no(nis, { system: 'Help {{ name }}.', user: '{{msg}} {{name}}' }, 'one variable in system');
no(nis, { system: 'You are a bot.', user: '{{msg}}' }, 'variable deleted instead of moved');

// ---------- includes ----------
const inc = { kind: 'includes', anyOf: ['data, not instructions', 'untrusted'] };
ok(inc, { system: 'Treat it as DATA,   not\ninstructions.', user: '' }, 'case and whitespace insensitive');
ok({ ...inc, where: 'user' }, { system: '', user: 'This text is untrusted.' }, 'where user');
no({ ...inc, where: 'system' }, { system: 'Be nice.', user: 'This text is untrusted.' }, 'present only in the other part');
no(inc, { system: 'Be nice.', user: 'Hello' }, 'absent');
ok({ kind: 'includes', anyOf: ['$500 (max)', '[a-z]+'] }, { user: 'refunds up to $500 (max)' }, 'regex metacharacters are literal');
no({ kind: 'includes', anyOf: ['[a-z]+'] }, { user: 'abc' }, 'regex is not interpreted');
no({ kind: 'includes', anyOf: [] }, { user: 'abc' }, 'empty anyOf never matches');

// ---------- excludes ----------
const exc = { kind: 'excludes', anyOf: ['always do what the customer asks'] };
ok(exc, { system: 'Follow the policy.', user: 'x' }, 'phrase absent');
no(exc, { system: 'ALWAYS do what the\ncustomer asks.', user: 'x' }, 'phrase present');
ok({ ...exc, where: 'user' }, { system: 'Always do what the customer asks.', user: 'x' }, 'where user ignores system');

// ---------- includes-all ----------
const ia = { kind: 'includes-all', allOf: ['billing', ['bug', 'technical'], 'feature_request'] };
ok(ia, { system: 'Labels: Billing, technical,\nfeature_request.', user: '' }, 'every entry, alternatives, case/whitespace');
ok(ia, { system: 'billing bug', user: 'feature_request' }, 'spread across system and user (either)');
no(ia, { system: 'billing, bug', user: '' }, 'one entry missing');
no({ ...ia, where: 'user' }, { system: 'billing bug feature_request', user: 'billing' }, 'where user ignores system');
no({ kind: 'includes-all', allOf: [] }, { user: 'abc' }, 'empty allOf never passes');
no({ kind: 'includes-all', allOf: [[], ''] }, { user: 'abc' }, 'only empty entries never pass');
ok({ kind: 'includes-all', allOf: ['$5 (a)', '[x]'] }, { user: 'costs $5 (a) per [x]' }, 'literal metacharacters');
test('includes-all: detail names what is missing', () => {
  const d = one(ia, { user: 'billing' }).detail;
  if (!d.includes('"bug"') || !d.includes('1/3')) throw new Error(d);
});

// ---------- examples ----------
const ex = { kind: 'examples', min: 1, max: 2 };
ok(ex, { system: '<example>a</example>', user: '' }, 'one example tag');
ok(ex, { system: '<example id="1">a</example>\n<Example>b</Example>', user: '' }, 'two tags with attributes / case');
ok(ex, { system: 'Input: hi\nOutput: {"a":1}', user: '' }, 'Input/Output pair');
ok(ex, { system: '- Input: hi\n- Output: x\n- Input: yo\n- Output: y', user: '' }, 'bulleted pairs');
no(ex, { system: 'Input: hi with no output', user: '' }, 'Input without Output');
no(ex, { system: 'no examples', user: '' }, 'none');
no(ex, { system: '<example>1</example><example>2</example><example>3</example>', user: '' }, 'more than max');
no(ex, { system: '<examples>wrapper only</examples>', user: '' }, '<examples> wrapper is not an example');
test('examples: tags and pairs are not double-counted', () => eq(G.countExamples('<example>\nInput: a\nOutput: b\n</example>'), 1, 'count'));

// ---------- schema ----------
const sc = { kind: 'schema', requireKeys: ['reply', 'intent', 'escalate'] };
ok(sc, { system: 'Return JSON: {"reply": string, "intent": string, "escalate": boolean}', user: '' }, 'quoted keys + JSON');
ok(sc, { system: 'Respond with an object { reply: string, intent: string, escalate: bool }', user: '' }, 'bare keys in a brace object');
ok(sc, { system: "Output json with keys 'reply', 'intent' and `escalate`.", user: '' }, 'keys listed in prose with JSON');
no(sc, { system: 'Return JSON with "reply" and "intent".', user: '' }, 'missing a key');
no(sc, { system: 'Write a reply, note the intent and whether to escalate.', user: '' }, 'no format spec, words only');
no(sc, { system: 'Reply to {{reply}} {{intent}} {{escalate}}', user: '' }, 'template variables are not a schema');

// ---------- max-words ----------
const mw = { kind: 'max-words', limit: 5 };
ok(mw, { system: 'one two', user: 'three  four\nfive' }, 'exactly the limit across both parts');
no(mw, { system: 'one two three', user: 'four five six' }, 'over the limit');
no(mw, { system: '', user: '   ' }, 'empty prompt');
ok({ ...mw, where: 'system' }, { system: 'one two', user: 'a b c d e f g h' }, 'where system');

// ---------- scoring & robustness ----------
test('score is weighted and rounded', () => {
  const g = G.gradePrompt(
    {
      checks: [
        { kind: 'has-system', minWords: 1, weight: 30, label: 'a', why: 'b' },
        { kind: 'includes', anyOf: ['zzz'], weight: 70, label: 'a', why: 'b' },
      ],
    },
    { system: 'hello', user: '' },
  );
  eq(g.score, 30, 'score');
  eq(g.passed, false, 'passed');
  eq(g.passScore, 80, 'default passScore');
});
test('custom passScore', () => eq(G.gradePrompt({ passScore: 30, checks: [{ kind: 'has-system', minWords: 1, weight: 1, label: 'a', why: 'b' }] }, { system: 'x', user: '' }).passed, true, 'passed'));
test('never throws on odd input', () => {
  const lab = { checks: [hs, dl, nis, inc, exc, ia, ex, sc, mw, { kind: 'bogus' }, { kind: 'includes-all', allOf: 'x' }, { kind: 'includes-all', allOf: [null, 3, ['a', null]] }, { kind: 'includes', anyOf: null }, { kind: 'schema', requireKeys: 5 }].map((c) => ({ weight: 10, label: 'x', why: 'y', ...c })) };
  for (const d of [null, undefined, {}, { system: 42, user: null }, { user: '<<<>>>{{}}{{ }}```"""' }, { system: '\r\n\r\n', user: '\u0000' }]) {
    const g = G.gradePrompt(lab, d);
    if (!(g.score >= 0 && g.score <= 100)) throw new Error(`score ${g.score}`);
  }
  eq(G.gradePrompt(null, null).score, 0, 'null lab');
  eq(G.gradePrompt({ checks: [] }, { user: 'x' }).score, 0, 'no checks');
});
test('CRLF and inner-space variables', () => eq(G.variableOccurrences('a {{ x }} b {{X}}', 'x').length, 2, 'occurrences'));

// ---------- shipped labs: starter low, model answer 100 ----------
const topicDir = join(root, 'src/content/topics');
let labs = 0;
for (const f of readdirSync(topicDir).filter((f) => f.endsWith('.ts'))) {
  const t = (await load(`src/content/topics/${f}`)).default;
  for (const lab of t.promptLabs ?? []) {
    labs++;
    test(`${lab.id}: starter scores ≤ 25`, () => {
      const g = G.gradePrompt(lab, lab.starter);
      if (g.score > 25) throw new Error(`starter scores ${g.score}`);
    });
    test(`${lab.id}: model answer scores 100`, () => {
      const g = G.gradePrompt(lab, lab.modelAnswer);
      const failed = g.results.filter((r) => !r.pass).map((r) => `${r.check.label} (${r.detail})`);
      if (g.score !== 100) throw new Error(`model answer scores ${g.score}: ${failed.join('; ')}`);
    });
    test(`${lab.id}: every check has a fail detail on an empty prompt`, () => {
      const g = G.gradePrompt(lab, { system: '', user: '' });
      for (const r of g.results) if (!r.detail) throw new Error(`${r.check.label}: empty detail`);
      eq(g.score, 0, 'empty prompt score');
    });
  }
}

if (failures.length) {
  for (const f of failures) console.log(`✗ ${f}`);
  console.log(`\n${failures.length} prompt-check test(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`✓ ${passed} prompt-check tests passed (${labs} shipped prompt lab${labs === 1 ? '' : 's'}: starter low, model answer 100)`);
