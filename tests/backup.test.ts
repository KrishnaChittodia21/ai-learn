// Export / Import (M2): versioned file, strict validation (bad files are rejected and change nothing),
// replace round-trip, merge keeping both sides, and the backup reminder.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupDue, exportBackup, mergeProgress, parseBackup, summarize } from '../src/lib/backup.ts';
import { normalize, SAVED_MAX, type Progress } from '../src/lib/progress.ts';
import { emptyProgress, passedTest } from './helpers.ts';

const full = (): Progress =>
  normalize(
    emptyProgress({
      tests: { rag: { ...passedTest(92), history: [{ at: '2026-01-01T00:00:00.000Z', score: 92 }] } },
      sections: { rag: [0, 2], embeddings: [1] },
      iq: { 'iq-1': 'nailed' },
      boe: { 'boe-1': true },
      cc: { 'cc-1': true },
      drafts: { 'iq:iq-1': 'my answer' },
      mcq: { m1: { seen: 2, wrong: 1, lastCorrect: true, lastAt: '2026-01-02T00:00:00.000Z' } },
      activityDays: ['2026-01-01', '2026-01-02'],
      achievements: { 'first-steps': { tier: 'standard', earnedAt: 1 } },
      promptLabs: { pl1: { system: 's', user: 'u', best: 80, solvedAt: '2026-01-02T00:00:00.000Z' } },
      saved: [
        { kind: 'section', ref: 'rag:2', topicId: 'rag', addedAt: '2026-01-01T00:00:00.000Z' },
        { kind: 'interview', ref: 'iq-1', topicId: 'rag', addedAt: '2026-01-02T00:00:00.000Z', doneAt: '2026-01-03T00:00:00.000Z' },
        { kind: 'short', ref: 'rag-in-90-seconds', topicId: 'rag-fundamentals', addedAt: '2026-01-02T00:00:00.000Z' },
      ],
      shorts: { 'rag-in-90-seconds': { watchedAt: '2026-01-02T00:00:00.000Z', answeredAt: '2026-01-02T00:00:00.000Z', firstTry: true } },
      studyPlan: {
        dailyMinutes: 45,
        daysPerWeek: 5,
        goal: 'phase:rag',
        startedAt: '2026-01-01',
        baselineAt: '2026-01-02',
        baselineCovered: 40,
        catchUp: { extraMinutes: 15, until: '2026-01-15' },
        warningsOff: true,
        log: { '2026-01-01': [0, 0], '2026-01-02': [30, 45] },
      },
      steps: { 'rag-fundamentals:0': { missed: 1, at: '2026-01-02T00:00:00.000Z' } },
    }),
  );
const file = (progress: unknown, over: Record<string, unknown> = {}) => JSON.stringify({ app: 'ai-learn', version: 1, exportedAt: '2026-11-08T00:00:00.000Z', progress, ...over });
const bad = (text: string) => {
  const r = parseBackup(text);
  assert.equal(r.ok, false, text.slice(0, 120));
  return (r as { error: string }).error;
};

test('export is a versioned envelope', () => {
  const b = exportBackup(full(), new Date('2026-11-08T10:00:00Z'));
  assert.equal(b.app, 'ai-learn');
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, '2026-11-08T10:00:00.000Z');
  assert.ok(b.progress.saved);
});

test('export → import (replace) round-trips every field', () => {
  const p = full();
  const r = parseBackup(JSON.stringify(exportBackup(p)));
  assert.ok(r.ok);
  // as stored (JSON drops undefined optional fields)
  assert.deepEqual(JSON.parse(JSON.stringify(r.progress)), JSON.parse(JSON.stringify(p)));
  assert.deepEqual(r.summary, { ...summarize(p), exportedAt: r.summary.exportedAt });
  assert.deepEqual({ ...r.summary, exportedAt: '' }, { topicsPassed: 1, sectionsRead: 3, saved: 3, labs: 2, exportedAt: '' });
});

test('rejects files that are not JSON or not ours', () => {
  assert.match(bad('{nope'), /not valid JSON/);
  assert.match(bad(''), /not valid JSON/);
  assert.match(bad('[]'), /not an ai-learn backup/);
  assert.match(bad('null'), /not an ai-learn backup/);
  assert.match(bad(file({}, { app: 'dsa-js' })), /not an ai-learn backup/);
  assert.match(bad(file({}, { version: 99 })), /newer version/);
  assert.match(bad(file({}, { version: '1' })), /version/);
  assert.match(bad(file({}, { extra: 1 })), /unknown field "extra"/);
  assert.match(bad(file(undefined)), /no progress/);
});

test('rejects wrong types', () => {
  assert.match(bad(file({ sections: { rag: 'all' } })), /sections\.rag should be a list/);
  assert.match(bad(file({ sections: { rag: [-1] } })), /sections\.rag\[0\]/);
  assert.match(bad(file({ tests: { rag: { best: '90', last: 90, attempts: 1 } } })), /tests\.rag\.best/);
  assert.match(bad(file({ iq: { a: 'great' } })), /iq\.a/);
  assert.match(bad(file({ cc: { a: 1 } })), /cc\.a should be true/);
  assert.match(bad(file({ saved: [{ kind: 'video', ref: 'x', topicId: 't', addedAt: 'x' }] })), /saved\[0\]\.kind/);
  assert.match(bad(file({ settings: { theme: 'neon' } })), /settings\.theme/);
  assert.match(bad(file({ activityDays: ['yesterday'] })), /activityDays\[0\]/);
  assert.match(bad(file({ junk: true })), /unknown field "junk"/);
  assert.match(bad(file({ shorts: { a: { watchedAt: 5 } } })), /shorts\.a\.watchedAt should be text/);
  assert.match(bad(file({ shorts: { a: { firstTry: 'yes' } } })), /shorts\.a\.firstTry/);
  assert.match(bad(file({ shorts: { a: { seen: true } } })), /unknown field "seen"/);
  assert.match(bad(file({ mcq: { a: { seen: 1, wrong: 0, lastCorrect: 'yes', lastAt: 'x' } } })), /lastCorrect/);
});

test('rejects a malformed study plan or steps record', () => {
  const plan = full().studyPlan!;
  assert.match(bad(file({ studyPlan: { ...plan, startedAt: 'yesterday' } })), /studyPlan.startedAt/);
  assert.match(bad(file({ studyPlan: { ...plan, dailyMinutes: -5 } })), /studyPlan.dailyMinutes/);
  assert.match(bad(file({ studyPlan: { ...plan, log: { '2026-01-01': [1] } } })), /covered, expected/);
  assert.match(bad(file({ studyPlan: { ...plan, log: { nope: [1, 2] } } })), /should be a date/);
  assert.match(bad(file({ studyPlan: { ...plan, admin: true } })), /unknown field/);
  assert.match(bad(file({ steps: { 'x:0': { missed: 'lots', at: '' } } })), /steps.x:0.missed/);
});

test('rejects huge arrays, long text and oversize files', () => {
  const many = Array.from({ length: SAVED_MAX + 1 }, (_, i) => ({ kind: 'topic', ref: `t${i}`, topicId: `t${i}`, addedAt: '2026-01-01' }));
  assert.match(bad(file({ saved: many })), /saved has 501 entries/);
  assert.match(bad(file({ activityDays: Array(121).fill('2026-01-01') })), /activityDays has 121/);
  assert.match(bad(file({ drafts: { a: 'x'.repeat(60_000) } })), /drafts\.a should be text/);
  assert.match(bad(' '.repeat(5_000_001)), /too large/);
});

test('ignores __proto__ / constructor keys without polluting prototypes', () => {
  const text = file({ __proto__: { polluted: true }, sections: { __proto__: [1], constructor: [2], rag: [0] }, settings: { __proto__: { isAdmin: true } } }).replace(
    '"progress":{',
    '"progress":{"__proto__":{"polluted":true},',
  );
  const r = parseBackup(text);
  assert.ok(r.ok);
  assert.deepEqual(r.progress.sections, { rag: [0] });
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(({} as Record<string, unknown>).isAdmin, undefined);
  assert.equal(Object.getPrototypeOf(r.progress.sections), Object.prototype);
});

test('a rejected import leaves the current data untouched', async () => {
  const store = new Map<string, string>([['genai-progress-v1', JSON.stringify(full())]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
  const m: typeof import('../src/lib/progress.ts') = await import('../src/lib/progress.ts?backup=1');
  const before = store.get('genai-progress-v1');
  for (const t of ['{', file({ sections: 5 }), file({}, { app: 'x' })]) {
    const r = parseBackup(t);
    if (r.ok) m.replaceProgress(r.progress);
  }
  assert.equal(store.get('genai-progress-v1'), before);
  assert.deepEqual(m.getProgress().sections, full().sections);
});

test('an old file without newer keys imports with defaults and runs migrations', () => {
  const r = parseBackup(file({ sections: { 'fund-estimation': [1] } }));
  assert.ok(r.ok);
  assert.deepEqual(r.progress.sections['fund-estimation'], [2]);
  assert.deepEqual(r.progress.mcq, {});
  assert.equal(r.progress.shorts, undefined, 'no Shorts state yet: stays absent');
  assert.equal(r.progress.settings.passMark, 70);
});

test('merge keeps both sides sensibly', () => {
  const cur = full();
  const inc = normalize(
    emptyProgress({
      tests: { rag: { best: 70, last: 70, attempts: 3, passedAt: '2025-12-01T00:00:00.000Z' }, agents: passedTest(80) },
      sections: { rag: [1, 2], vectors: [0] },
      iq: { 'iq-1': 'missed', 'iq-2': 'partial' },
      cc: { 'cc-2': true },
      drafts: { 'iq:iq-1': 'other answer', 'iq:iq-2': 'new' },
      mcq: { m1: { seen: 9, wrong: 9, lastCorrect: false, lastAt: '2026-03-01T00:00:00.000Z' } },
      activityDays: ['2025-12-31', '2026-01-02'],
      promptLabs: { pl1: { system: 'S', user: 'U', best: 95, solvedAt: '2025-12-01T00:00:00.000Z' } },
      saved: [
        { kind: 'section', ref: 'rag:2', topicId: 'rag', addedAt: '2025-06-01T00:00:00.000Z', doneAt: '2025-06-02T00:00:00.000Z' },
        { kind: 'topic', ref: 'agents', topicId: 'agents', addedAt: '2026-02-01T00:00:00.000Z' },
      ],
      shorts: {
        'rag-in-90-seconds': { watchedAt: '2025-12-01T00:00:00.000Z', answeredAt: '2026-03-01T00:00:00.000Z', firstTry: false },
        'mcp-in-90-seconds': { answeredAt: '2026-02-01T00:00:00.000Z', firstTry: true },
      },
      studyPlan: { dailyMinutes: 90, daysPerWeek: 7, goal: 'all', startedAt: '2025-12-01', baselineAt: '2025-12-01', baselineCovered: 0, log: { '2025-12-31': [5, 90], '2026-01-02': [99, 99] } },
      steps: { 'rag-fundamentals:0': { missed: 0, at: '2026-03-01T00:00:00.000Z' }, 'agent-fundamentals:2': { missed: 2, at: '2026-02-01T00:00:00.000Z' } },
      settings: { ...emptyProgress().settings, passMark: 90 },
    }),
  );
  const m = mergeProgress(cur, inc);
  assert.equal(m.studyPlan!.dailyMinutes, 45, "this device's plan wins");
  assert.deepEqual(m.studyPlan!.log, { '2025-12-31': [5, 90], '2026-01-01': [0, 0], '2026-01-02': [30, 45] }, 'logs merge; current wins a day');
  assert.equal(mergeProgress(normalize(emptyProgress()), inc).studyPlan!.dailyMinutes, 90, 'a device without a plan takes the imported one');
  assert.deepEqual(m.steps, { 'rag-fundamentals:0': { missed: 0, at: '2026-03-01T00:00:00.000Z' }, 'agent-fundamentals:2': { missed: 2, at: '2026-02-01T00:00:00.000Z' } }, 'latest run per section');
  assert.deepEqual(m.shorts, {
    'rag-in-90-seconds': { watchedAt: '2025-12-01T00:00:00.000Z', answeredAt: '2026-01-02T00:00:00.000Z', firstTry: true },
    'mcp-in-90-seconds': { answeredAt: '2026-02-01T00:00:00.000Z', firstTry: true },
  }, 'earliest watch and earliest answer (with its first-try flag) kept; incoming fills gaps');
  assert.deepEqual(m.sections, { rag: [0, 1, 2], embeddings: [1], vectors: [0] });
  assert.equal(m.tests.rag.best, 92);
  assert.equal(m.tests.rag.attempts, 3);
  assert.equal(m.tests.rag.passedAt, '2025-12-01T00:00:00.000Z', 'earliest pass kept');
  assert.ok(m.tests.agents.passedAt);
  assert.equal(m.iq['iq-1'], 'nailed', 'current wins a conflict');
  assert.equal(m.iq['iq-2'], 'partial', 'incoming fills a gap');
  assert.equal(m.drafts['iq:iq-1'], 'my answer');
  assert.deepEqual(Object.keys(m.cc).sort(), ['cc-1', 'cc-2']);
  assert.equal(m.mcq.m1.seen, 9, 'newer answer record kept');
  assert.deepEqual(m.activityDays, ['2025-12-31', '2026-01-01', '2026-01-02']);
  assert.equal(m.promptLabs!.pl1.best, 95);
  assert.equal(m.promptLabs!.pl1.system, 's', 'current draft kept');
  assert.deepEqual(
    m.saved!.map((s) => `${s.kind}|${s.ref}|${s.doneAt ? 'done' : 'open'}`),
    ['section|rag:2|open', 'interview|iq-1|done', 'short|rag-in-90-seconds|open', 'topic|agents|open'],
  );
  assert.equal(m.settings.passMark, 70, 'this device keeps its settings');
});

test('merge never exceeds the saved cap (done items go first)', () => {
  const mk = (pre: string, n: number, done: boolean) =>
    Array.from({ length: n }, (_, i) => ({ kind: 'topic' as const, ref: `${pre}${i}`, topicId: 'x', addedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(), ...(done ? { doneAt: '2026-02-01T00:00:00.000Z' } : {}) }));
  const m = mergeProgress(normalize(emptyProgress({ saved: mk('a', 300, false) })), normalize(emptyProgress({ saved: [...mk('d', 50, true), ...mk('b', 250, false)] })));
  assert.equal(m.saved!.length, SAVED_MAX);
  assert.equal(m.saved!.filter((s) => s.doneAt).length, 0);
});

test('backup reminder: after 14 days with new progress, dismissible', () => {
  const p = (days: string[]) => emptyProgress({ activityDays: days });
  const now = new Date('2026-11-08T12:00:00');
  assert.equal(backupDue(p([]), undefined, undefined, now), false, 'nothing to back up');
  assert.equal(backupDue(p(['2026-11-01']), undefined, undefined, now), false, 'started a week ago');
  assert.equal(backupDue(p(['2026-10-01', '2026-11-07']), undefined, undefined, now), true, 'never exported, 5 weeks of study');
  assert.equal(backupDue(p(['2026-10-01', '2026-11-07']), '2026-11-01T00:00:00Z', undefined, now), false, 'exported last week');
  assert.equal(backupDue(p(['2026-10-01', '2026-11-07']), '2026-10-10T00:00:00Z', undefined, now), true, 'old export, newer study');
  assert.equal(backupDue(p(['2026-10-01', '2026-10-05']), '2026-10-10T00:00:00Z', undefined, now), false, 'nothing new since export');
  assert.equal(backupDue(p(['2026-10-01', '2026-11-07']), undefined, '2026-11-01T00:00:00Z', now), false, 'dismissed a week ago');
  assert.equal(backupDue(p(['2026-10-01', '2026-11-07']), undefined, '2026-10-01T00:00:00Z', now), true, 'dismissed long ago');
});
