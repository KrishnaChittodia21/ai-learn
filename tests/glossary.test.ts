// Glossary and Myths (C4): data integrity, and the lesson term matcher (first occurrence, whole word, skips code).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOSSARY, GLOSSARY_CATEGORIES } from '../src/content/glossary.ts';
import { MYTHS } from '../src/content/myths.ts';
import { buildTermIndex, markTerms, splitTerms, type HNode } from '../src/lib/glossaryMatch.ts';
import { TOPICS } from './helpers.ts';

const topicIds = new Set(TOPICS.map((t) => t.id));
const words = (s: string) => s.trim().split(/\s+/).length;

test('glossary: at least 150 terms, unique kebab-case ids, known categories', () => {
  assert.ok(GLOSSARY.length >= 150, `${GLOSSARY.length} terms`);
  const ids = new Set<string>();
  for (const t of GLOSSARY) {
    assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, t.id);
    assert.ok(!ids.has(t.id), `duplicate ${t.id}`);
    ids.add(t.id);
    assert.ok((GLOSSARY_CATEGORIES as readonly string[]).includes(t.category), `${t.id}: ${t.category}`);
  }
});

test('glossary: short ≤ 35 words, a body, related ids resolve, learn topics exist, no links to the source', () => {
  const ids = new Set(GLOSSARY.map((t) => t.id));
  for (const t of GLOSSARY) {
    assert.ok(t.short && words(t.short) <= 35, `${t.id}: short has ${words(t.short)} words`);
    assert.ok(t.body.length > t.short.length - 1, `${t.id}: body`);
    for (const r of t.related) assert.ok(ids.has(r) && r !== t.id, `${t.id}: related ${r}`);
    if (t.learn) assert.ok(topicIds.has(t.learn), `${t.id}: learn ${t.learn}`);
    assert.doesNotMatch(t.body, /\.\.\/phases|\]\(/, `${t.id}: link in body`);
  }
});

test('glossary: no two terms share a name or alias', () => {
  const seen = new Map<string, string>();
  for (const t of GLOSSARY)
    for (const n of [t.term, ...(t.aliases ?? [])]) {
      const k = n.toLowerCase();
      assert.ok(!seen.has(k) || seen.get(k) === t.id, `"${n}" in ${t.id} and ${seen.get(k)}`);
      seen.set(k, t.id);
    }
});

test('myths: unique ids, every field, learn topics exist', () => {
  assert.ok(MYTHS.length >= 10);
  const ids = new Set<string>();
  for (const m of MYTHS) {
    assert.ok(!ids.has(m.id), `duplicate ${m.id}`);
    ids.add(m.id);
    assert.ok(m.myth && m.reality.length > 60 && m.whyItMatters, m.id);
    if (m.learn) assert.ok(topicIds.has(m.learn), `${m.id}: learn ${m.learn}`);
  }
});

const index = buildTermIndex([
  { id: 'rag', term: 'RAG', aliases: ['Retrieval-Augmented Generation'] },
  { id: 'token', term: 'Token' },
  { id: 'kv-cache', term: 'KV Cache' },
  { id: 'react', term: 'ReAct' },
  { id: 'feature', term: 'Feature', hover: false },
]);
const ids = (pieces: ReturnType<typeof splitTerms>) => pieces.filter((p) => typeof p !== 'string').map((p) => (p as { id: string }).id);

test('matcher: first occurrence only, whole word, plurals, case rules', () => {
  const seen = new Set<string>();
  const pieces = splitTerms('Tokens fill the KV cache; each token costs. RAG and Retrieval-Augmented Generation.', index, seen);
  assert.deepEqual(ids(pieces), ['token', 'kv-cache', 'rag']);
  assert.equal(pieces.map((p) => (typeof p === 'string' ? p : p.text)).join(''), 'Tokens fill the KV cache; each token costs. RAG and Retrieval-Augmented Generation.');
  assert.deepEqual(ids(splitTerms('tokenizer, detokens and my-token stay plain', index, new Set())), []);
  assert.deepEqual(ids(splitTerms('a react component, then ReAct', index, new Set())), ['react']);
  assert.equal((splitTerms('the ReAct loop', index, new Set())[1] as { text: string }).text, 'ReAct');
  assert.deepEqual(ids(splitTerms('a new feature', index, new Set())), [], 'hover: false terms are not marked');
  assert.deepEqual(ids(splitTerms('rag cloth', index, new Set())), [], 'all-caps acronyms match exactly');
});

test('markTerms: skips code, links and headings; marks once per tree', () => {
  const t = (value: string): HNode => ({ type: 'text', value });
  const el = (tagName: string, ...children: HNode[]): HNode => ({ type: 'element', tagName, properties: {}, children });
  const tree: HNode = {
    type: 'root',
    children: [el('h2', t('Token basics')), el('p', el('code', t('token')), t(' A '), el('a', t('token')), t(' link, then a token and another token.')), el('p', t('One more token, then RAG.'))],
  };
  markTerms(tree, index);
  const marked: string[] = [];
  const walk = (n: HNode, inside: string[]) => {
    if (n.type === 'element' && n.properties?.dataGloss) marked.push(`${n.properties.dataGloss}@${inside.join('>')}`);
    for (const c of n.children ?? []) walk(c, n.tagName ? [...inside, n.tagName] : inside);
  };
  walk(tree, []);
  assert.deepEqual(marked, ['token@p', 'rag@p']);
  assert.equal(tree.children![0].children![0].value, 'Token basics', 'heading untouched');
});
