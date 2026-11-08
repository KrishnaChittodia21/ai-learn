// Topic cheatsheets (C4): every file is keyed by a real topic id, has blocks, stays under the word cap and has
// no fenced code; plus the checker itself rejects bad input.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { CHEAT_WORD_CAP, checkCheatsheet, cheatWords, type TopicCheatsheet } from '../src/lib/cheatsheets.ts';
import { TOPICS } from './helpers.ts';

const dir = new URL('../src/content/cheatsheets/', import.meta.url);
const ids = new Set(TOPICS.map((t) => t.id));
const SHEETS = await Promise.all(
  readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map(async (f) => ({ id: f.replace(/\.ts$/, ''), cs: (await import(new URL(f, dir).href)).default as TopicCheatsheet })),
);

test('cheatsheets exist and each passes the integrity check', () => {
  assert.ok(SHEETS.length >= 20, `only ${SHEETS.length} cheatsheets`);
  for (const { id, cs } of SHEETS) assert.deepEqual(checkCheatsheet(id, cs, ids), [], id);
});

test('the checker rejects unknown ids, empty blocks, fences and long sheets', () => {
  const ok: TopicCheatsheet = { blocks: [{ title: 'Defaults', markdown: '- use `k=5`' }], source: ['rag.md'] };
  const id = TOPICS[0].id;
  assert.deepEqual(checkCheatsheet(id, ok, ids), []);
  assert.match(checkCheatsheet('no-such-topic', ok, ids).join(), /not a topic id/);
  assert.match(checkCheatsheet(id, { ...ok, blocks: [] }, ids).join(), /no blocks/);
  assert.match(checkCheatsheet(id, { ...ok, blocks: [{ title: 'x', markdown: '```py\nx\n```' }] }, ids).join(), /fenced/);
  assert.match(checkCheatsheet(id, { ...ok, source: [] }, ids).join(), /source/);
  const long = { ...ok, blocks: [{ title: 'x', markdown: 'word '.repeat(CHEAT_WORD_CAP + 1) }] };
  assert.match(checkCheatsheet(id, long, ids).join(), /words/);
});

test('table pipes and rules do not count as words', () => {
  assert.equal(cheatWords({ blocks: [{ title: 'T', markdown: '| a | b |\n|---|---|\n| c | d |' }], source: [] }), 5);
});
