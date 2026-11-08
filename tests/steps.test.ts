// Read less, view more, learn more (M7): the Read · Steps switch is remembered, finishing steps marks the section
// read, misses feed Weak areas, the validator rejects bad steps and long cores, and Frame by Frame is earnable.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCore, checkSteps, CORE_MAX_WORDS, orderShown, wordCount } from '../src/lib/steps.ts';
import { weakTopics } from '../src/lib/weak.ts';
import { achievementById, buildAchievementContext, evaluateAchievement, mergeEarned, newlyEarned, evaluateAll } from '../src/content/achievements.ts';
import { COMPANY_QUESTIONS } from '../src/content/companies.ts';
import { PHASES } from '../src/content/phases.ts';
import type * as ProgressModule from '../src/lib/progress.ts';
import type * as UiPrefsModule from '../src/lib/uiPrefs.ts';
import type { StepLesson } from '../src/types.ts';
import { emptyProgress, TOPICS } from './helpers.ts';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});
let n = 0;

const withSteps = TOPICS.flatMap((t) => t.sections.flatMap((s, i) => (s.steps ? [{ t, i, s }] : [])));

test('the first three step lessons ship, with cores, and pass the validator', () => {
  assert.deepEqual(
    withSteps.map(({ t, i }) => `${t.id}:${i}`),
    ['prompt-fundamentals:0', 'rag-fundamentals:0', 'agent-fundamentals:2'],
  );
  for (const { t, i, s } of withSteps) {
    assert.deepEqual(checkSteps(s.steps!, `${t.id} §${i + 1}`), []);
    assert.ok(s.core && wordCount(s.core) <= CORE_MAX_WORDS);
    assert.ok(s.body.length > s.core!.length, 'the full text is still there');
  }
  assert.equal(TOPICS.flatMap((t) => t.sections).filter((s) => s.core || s.steps).length, 3, 'every other section is unchanged');
});

test('validator rejects bad steps', () => {
  const good = withSteps[0].s.steps!;
  const bad = (mut: (l: StepLesson) => void, re: RegExp) => {
    const l = structuredClone(good);
    mut(l);
    const errs = checkSteps(l, 'x');
    assert.ok(errs.some((e) => re.test(e)), `${re} in ${errs.join(' | ')}`);
  };
  bad((l) => (l.actors[0].kind = 'robot' as never), /unknown kind/);
  bad((l) => (l.actors[1].x = l.actors[0].x), /overlap/);
  bad((l) => (l.actors[0].x = 20), /sticks out/);
  bad((l) => (l.actors[0].label = 'A label far too long for a box'), /too long/);
  bad((l) => (l.steps = l.steps.filter((s) => s.kind === 'watch')), /Your turn/);
  bad((l) => (l.steps = [l.steps.find((s) => s.kind === 'turn')!, ...l.steps]), /open with a Watch/);
  bad((l) => (l.steps = l.steps.slice(0, 2)), /needs 4–12/);
  bad((l) => {
    const w = l.steps.find((s) => s.kind === 'watch')!;
    if (w.kind === 'watch') w.script.push({ say: 9 });
  }, /say 9/);
  bad((l) => {
    const w = l.steps.find((s) => s.kind === 'watch')!;
    if (w.kind === 'watch') w.script.push({ send: [l.actors[0].id, 'ghost'] });
  }, /unknown actor "ghost"/);
  bad((l) => {
    const t = l.steps.find((s) => s.kind === 'turn')!;
    if (t.kind === 'turn') t.task = { type: 'choose', question: 'q', options: [{ text: 'a' }, { text: 'b' }], answer: 0 };
  }, /needs a why/);
  bad((l) => {
    const t = l.steps.find((s) => s.kind === 'turn')!;
    if (t.kind === 'turn') t.task = { type: 'order', question: 'q', items: ['a', 'a', 'b'], hint: 'h' };
  }, /distinct items/);
  bad((l) => {
    const t = l.steps.find((s) => s.kind === 'turn')!;
    if (t.kind === 'turn') t.task = { type: 'pick', question: 'q', answer: l.actors[0].id, hints: {} };
  }, /at least one wrong actor/);
});

test('validator caps the core', () => {
  assert.deepEqual(checkCore('A short core.', 'x'), []);
  assert.match(checkCore(Array(CORE_MAX_WORDS + 1).fill('word').join(' '), 'x')[0], /at most 180/);
  assert.match(checkCore('  ', 'x')[0], /non-empty/);
  assert.equal(wordCount('**Bold** | table | `code` — dash'), 4);
});

test('order tasks never show their items already in order', () => {
  for (const { s } of withSteps)
    for (const st of s.steps!.steps)
      if (st.kind === 'turn' && st.task.type === 'order') assert.notDeepEqual(orderShown(st.task.items, st.task.question), st.task.items.map((_, k) => k));
});

test('the Read · Steps switch is remembered', async () => {
  store.clear();
  let m: typeof UiPrefsModule = await import(`../src/lib/uiPrefs.ts?steps=${++n}`);
  assert.equal(m.getUiPrefs().lessonMode, undefined, 'Read by default');
  m.saveUiPrefs({ lessonMode: 'steps' });
  m = await import(`../src/lib/uiPrefs.ts?steps=${++n}`);
  assert.equal(m.getUiPrefs().lessonMode, 'steps');
});

test('finishing steps marks the section read; misses feed Weak areas until a clean run', async () => {
  store.clear();
  const P: typeof ProgressModule = await import(`../src/lib/progress.ts?steps=${++n}`);
  const rag = TOPICS.find((t) => t.id === 'rag-fundamentals')!;
  P.recordSteps(rag.id, 0, 2, new Date('2026-11-08T10:00:00Z'));
  const p = P.getProgress();
  assert.deepEqual(p.sections[rag.id], [0]);
  assert.deepEqual(p.steps, { 'rag-fundamentals:0': { missed: 2, at: '2026-11-08T10:00:00.000Z' } });
  assert.ok(p.activityDays?.length, 'a study action');
  const w = weakTopics(p, TOPICS).find((x) => x.topic.id === rag.id);
  assert.deepEqual(w?.shakySteps, [{ index: 0, heading: rag.sections[0].heading, missed: 2 }]);
  P.recordSteps(rag.id, 0, 0);
  assert.equal(weakTopics(P.getProgress(), TOPICS).find((x) => x.topic.id === rag.id), undefined, 'a clean run clears it');
  assert.deepEqual(P.getProgress().sections[rag.id], [0], 'read once, not twice');
});

test('Frame by Frame: sections finished in Steps view, unlocks once, never downgrades', () => {
  const ctx = buildAchievementContext({ topics: TOPICS, phases: PHASES, challenges: COMPANY_QUESTIONS });
  const a = achievementById['frame-by-frame'];
  const done = (keys: string[]) => emptyProgress({ steps: Object.fromEntries(keys.map((k) => [k, { missed: 0, at: '2026-11-08T10:00:00Z' }])) });
  const keys = withSteps.map(({ t, i }) => `${t.id}:${i}`);
  assert.equal(evaluateAchievement(a, done(['rag-fundamentals:3', 'nope:0']), ctx).value, 0, 'only sections that have steps');
  assert.equal(evaluateAchievement(a, done(keys.slice(0, 1)), ctx).tier, 'bronze');
  assert.equal(evaluateAchievement(a, done(keys), ctx).tier, 'gold');
  const stored = mergeEarned({}, newlyEarned(evaluateAll(done(keys), ctx), {}), 1);
  assert.equal(stored['frame-by-frame'].tier, 'gold');
  assert.deepEqual(newlyEarned(evaluateAll(done(keys.slice(0, 1)), ctx), stored), []);
});
