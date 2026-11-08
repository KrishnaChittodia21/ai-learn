// lib/progress: loading saves (empty / garbage / old), one-off migrations and reset.
// progress.ts reads localStorage once at import, so each case stubs storage and imports a fresh copy.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as ProgressModule from '../src/lib/progress.ts';

const KEY = 'genai-progress-v1';
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

let n = 0;
/** import progress.ts fresh with `raw` as the saved value (undefined = nothing saved) */
async function loadWith(raw?: string): Promise<typeof ProgressModule> {
  store.clear();
  if (raw !== undefined) store.set(KEY, raw);
  return import(`../src/lib/progress.ts?case=${++n}`);
}
const saved = () => JSON.parse(store.get(KEY)!);
const MIGRATIONS = ['fund-estimation-toolkit', 'prompt-engineering-split'];

test('no save: defaults, every migration already marked applied', async () => {
  const p = (await loadWith()).getProgress();
  assert.deepEqual(p.sections, {});
  assert.deepEqual(p.tests, {});
  assert.deepEqual(p.achievements, {});
  assert.deepEqual(p.migrations, MIGRATIONS);
  assert.equal(p.settings.passMark, 70);
});

test('garbage save falls back to defaults without throwing', async () => {
  for (const raw of ['{not json', '']) {
    const p = (await loadWith(raw)).getProgress();
    assert.deepEqual(p.sections, {});
    assert.deepEqual(p.migrations, MIGRATIONS);
  }
});

test('old save: missing keys get defaults, partial settings are merged, achievements stay undefined', async () => {
  const p = (await loadWith(JSON.stringify({ sections: { 'what-is-genai': [0, 2] }, settings: { passMark: 80 } }))).getProgress();
  assert.deepEqual(p.sections, { 'what-is-genai': [0, 2] });
  assert.deepEqual(p.mcq, {});
  assert.deepEqual(p.promptLabs, {});
  assert.equal(p.settings.passMark, 80);
  assert.equal(p.settings.secondsPerQuestion, 90);
  // undefined tells the badge detector to backfill quietly instead of celebrating
  assert.equal(p.achievements, undefined);
  assert.deepEqual(p.migrations, MIGRATIONS);
});

test('fund-estimation-toolkit: read indexes ≥ 1 shift up by one', async () => {
  const p = (await loadWith(JSON.stringify({ sections: { 'fund-estimation': [0, 1, 3] } }))).getProgress();
  assert.deepEqual(p.sections['fund-estimation'], [0, 2, 4]);
});

test('prompt-engineering-split: old index 0 dropped, index 1 → 0 across sections, drafts and cc', async () => {
  const T = 'prompt-engineering';
  const old = {
    sections: { [T]: [0, 1, 2, 3], other: [0, 1] },
    drafts: {
      [`qc:${T}-s0-qc`]: 'a',
      [`qc:${T}-s1-qc`]: 'b',
      [`qc:${T}-s2-qc`]: 'c',
      [`ex:${T}-s0-ex`]: 'old exercise',
      [`ex:${T}-s1-ex`]: 'templates exercise',
      'qc:other-s1-qc': 'untouched',
    },
    cc: { [`${T}-s0-ex`]: true, [`${T}-s1-ex`]: true, 'other-s1-ex': true },
    migrations: ['fund-estimation-toolkit'],
  };
  const p = (await loadWith(JSON.stringify(old))).getProgress();
  assert.deepEqual(p.sections[T], [0]);
  assert.deepEqual(p.sections.other, [0, 1]);
  assert.deepEqual(p.drafts, {
    [`qc:${T}-s0-qc`]: 'b',
    [`qc:${T}-s2-qc`]: 'c',
    [`ex:${T}-s0-ex`]: 'templates exercise',
    'qc:other-s1-qc': 'untouched',
  });
  assert.deepEqual(p.cc, { [`${T}-s0-ex`]: true, 'other-s1-ex': true });
  assert.deepEqual(p.migrations, MIGRATIONS);
});

test('prompt-engineering-split: a read list without index 1 ends up empty', async () => {
  const p = (await loadWith(JSON.stringify({ sections: { 'prompt-engineering': [0, 2] } }))).getProgress();
  assert.deepEqual(p.sections['prompt-engineering'], []);
});

test('migrations run once: an already-migrated save is left alone', async () => {
  const T = 'prompt-engineering';
  const save = {
    sections: { [T]: [0, 1], 'fund-estimation': [1] },
    drafts: { [`qc:${T}-s0-qc`]: 'x', [`qc:${T}-s1-qc`]: 'y' },
    cc: { [`${T}-s0-ex`]: true },
    migrations: MIGRATIONS,
  };
  const p = (await loadWith(JSON.stringify(save))).getProgress();
  assert.deepEqual(p.sections, save.sections);
  assert.deepEqual(p.drafts, save.drafts);
  assert.deepEqual(p.cc, save.cc);
  assert.deepEqual(p.migrations, MIGRATIONS);
});

test('a fresh save written by the app carries the migration ids, so reloading does not re-migrate', async () => {
  const m = await loadWith();
  m.toggleSectionRead('prompt-engineering', 0);
  assert.deepEqual(saved().migrations, MIGRATIONS);
  const p = (await loadWith(store.get(KEY))).getProgress();
  assert.deepEqual(p.sections['prompt-engineering'], [0]);
});

test('resetProgress clears study data but keeps settings', async () => {
  const m = await loadWith(JSON.stringify({ sections: { a: [0] }, tests: { a: { best: 90, last: 90, attempts: 1 } }, settings: { passMark: 85, theme: 'dark' } }));
  m.resetProgress();
  const p = m.getProgress();
  assert.deepEqual(p.sections, {});
  assert.deepEqual(p.tests, {});
  assert.deepEqual(p.migrations, MIGRATIONS);
  assert.equal(p.settings.passMark, 85);
  assert.equal(p.settings.theme, 'dark');
  assert.deepEqual(saved().sections, {});
});
