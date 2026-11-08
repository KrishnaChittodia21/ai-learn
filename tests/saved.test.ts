// Saved for later (M2): save / unsave / done / undo / the 500 cap, and saved items surviving old-save migrations.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as ProgressModule from '../src/lib/progress.ts';
import { addSavedItem, SAVED_MAX, type SavedItem } from '../src/lib/progress.ts';

const KEY = 'genai-progress-v1';
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});
let n = 0;
async function loadWith(raw?: string): Promise<typeof ProgressModule> {
  store.clear();
  if (raw !== undefined) store.set(KEY, raw);
  return import(`../src/lib/progress.ts?saved=${++n}`);
}
const item = (i: number, done = false): SavedItem => ({
  kind: 'interview',
  ref: `q${i}`,
  topicId: 't',
  addedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  ...(done ? { doneAt: new Date(Date.UTC(2026, 1, 1, 0, 0, i)).toISOString() } : {}),
});

test('save, unsave, and saving twice keeps one entry', async () => {
  const m = await loadWith();
  assert.equal(m.saveItem('section', 'rag:2', 'rag'), true);
  assert.equal(m.saveItem('section', 'rag:2', 'rag'), true);
  assert.equal(m.getProgress().saved!.length, 1);
  assert.equal(m.isSaved(m.getProgress(), 'section', 'rag:2'), true);
  assert.equal(m.isSaved(m.getProgress(), 'topic', 'rag:2'), false, 'kind is part of the identity');
  const removed = m.removeSaved('section', 'rag:2');
  assert.equal(removed?.ref, 'rag:2');
  assert.deepEqual(m.getProgress().saved, []);
  assert.equal(m.removeSaved('section', 'rag:2'), undefined);
  // persisted
  assert.deepEqual(JSON.parse(store.get(KEY)!).saved, []);
});

test('saving is not study activity (no streak day)', async () => {
  const m = await loadWith();
  m.saveItem('topic', 'rag', 'rag');
  assert.equal(m.getProgress().activityDays, undefined);
});

test('done and undo done; re-saving a done item moves it back to the list', async () => {
  const m = await loadWith();
  m.saveItem('code', 'cc-1', 't');
  m.setSavedDone('code', 'cc-1', true, new Date('2026-03-01T00:00:00Z'));
  assert.equal(m.getProgress().saved![0].doneAt, '2026-03-01T00:00:00.000Z');
  assert.equal(m.isSaved(m.getProgress(), 'code', 'cc-1'), false);
  m.setSavedDone('code', 'cc-1', false);
  assert.equal('doneAt' in m.getProgress().saved![0], false);
  m.setSavedDone('code', 'cc-1', true);
  m.saveItem('code', 'cc-1', 't');
  assert.equal(m.isSaved(m.getProgress(), 'code', 'cc-1'), true);
  assert.equal(m.getProgress().saved!.length, 1);
});

test('undo remove restores the exact item in added order', async () => {
  const m = await loadWith();
  m.saveItem('drill', 'a', 't', new Date('2026-01-01T00:00:00Z'));
  m.saveItem('drill', 'b', 't', new Date('2026-01-02T00:00:00Z'));
  m.saveItem('drill', 'c', 't', new Date('2026-01-03T00:00:00Z'));
  const b = m.removeSaved('drill', 'b')!;
  assert.equal(m.restoreSaved(b), true);
  assert.deepEqual(
    m.getProgress().saved!.map((s) => s.ref),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(m.getProgress().saved![1], b);
});

test('cap: at 500 the oldest done item makes room', () => {
  const list = Array.from({ length: SAVED_MAX }, (_, i) => item(i, i === 7 || i === 3));
  const res = addSavedItem(list, item(9999));
  assert.equal(res.full, undefined);
  assert.equal(res.list.length, SAVED_MAX);
  assert.equal(res.list.some((s) => s.ref === 'q3'), false, 'oldest done (q3) trimmed');
  assert.equal(res.list.some((s) => s.ref === 'q7'), true);
  assert.equal(res.list.at(-1)!.ref, 'q9999');
});

test('cap: at 500 with nothing done, saving is blocked and nothing is dropped', async () => {
  const list = Array.from({ length: SAVED_MAX }, (_, i) => item(i));
  const res = addSavedItem(list, item(9999));
  assert.equal(res.full, true);
  assert.equal(res.list, list);
  const m = await loadWith(JSON.stringify({ saved: list }));
  assert.equal(m.saveItem('topic', 'rag', 'rag'), false);
  assert.equal(m.getProgress().saved!.length, SAVED_MAX);
  // an item already saved is still a no-op success
  assert.equal(addSavedItem(list, item(5)).full, undefined);
});

test('saved survives the existing migrations and loads unchanged', async () => {
  const saved = [item(1), item(2, true), { kind: 'section', ref: 'prompt-engineering:1', topicId: 'prompt-engineering', addedAt: '2026-01-05T00:00:00.000Z' }];
  const m = await loadWith(JSON.stringify({ sections: { 'fund-estimation': [1], 'prompt-engineering': [0, 1] }, saved }));
  const p = m.getProgress();
  assert.deepEqual(p.saved, saved);
  assert.deepEqual(p.sections['fund-estimation'], [2], 'migration still ran');
  assert.deepEqual(p.migrations, ['fund-estimation-toolkit', 'prompt-engineering-split']);
});

test('old saves without `saved` load fine and can start saving', async () => {
  const m = await loadWith(JSON.stringify({ sections: { x: [0] } }));
  assert.equal(m.getProgress().saved, undefined);
  assert.equal(m.isSaved(m.getProgress(), 'topic', 'x'), false);
  m.saveItem('topic', 'x', 'x');
  assert.equal(m.getProgress().saved!.length, 1);
});
