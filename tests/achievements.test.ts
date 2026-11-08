// Achievement evaluation (src/content/achievements.ts) against the real content.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { achievementById, buildAchievementContext, evaluateAchievement, evaluateAll, mergeEarned, newlyEarned } from '../src/content/achievements.ts';
import { COMPANY_QUESTIONS } from '../src/content/companies.ts';
import { PHASES } from '../src/content/phases.ts';
import { emptyProgress, TOPICS } from './helpers.ts';

const ctx = buildAchievementContext({ topics: TOPICS, phases: PHASES, challenges: COMPANY_QUESTIONS });
const labs = TOPICS.flatMap((t) => t.promptLabs ?? []);

test('empty progress earns nothing', () => {
  const ev = evaluateAll(emptyProgress(), ctx);
  for (const [id, e] of Object.entries(ev)) {
    assert.equal(e.value, 0, `${id} value`);
    assert.equal(e.tier, null, `${id} tier`);
  }
  assert.deepEqual(newlyEarned(ev, undefined), []);
});

test('Prompt Smith counts only labs solved before the model answer was revealed', () => {
  assert.ok(labs.length >= 4, 'needs at least 4 shipped prompt labs');
  const [solo, revealedAfter, revealedBefore, unsolved] = labs;
  const p = emptyProgress({
    promptLabs: {
      [solo.id]: { system: '', user: '', best: 100, solvedAt: '2026-01-02T10:00:00Z' },
      [revealedAfter.id]: { system: '', user: '', best: 100, solvedAt: '2026-01-02T10:00:00Z', revealedAt: '2026-01-02T11:00:00Z' },
      [revealedBefore.id]: { system: '', user: '', best: 100, solvedAt: '2026-01-02T10:00:00Z', revealedAt: '2026-01-02T09:00:00Z' },
      [unsolved.id]: { system: 'draft', user: '', best: 40 },
    },
  });
  const e = evaluateAchievement(achievementById['prompt-smith'], p, ctx);
  assert.equal(e.value, 2);
  assert.equal(e.tier, 'bronze');
  assert.deepEqual(e.next, { tier: 'silver', goal: 3 });
});

test('earned tiers are never re-awarded or downgraded', () => {
  const one = emptyProgress({ promptLabs: { [labs[0].id]: { system: '', user: '', best: 100, solvedAt: '2026-01-02T10:00:00Z' } } });
  const earned = newlyEarned(evaluateAll(one, ctx), {});
  assert.deepEqual(
    earned.filter((e) => e.id === 'prompt-smith').map((e) => e.tier),
    ['bronze'],
  );
  const stored = mergeEarned({}, earned, 1);
  assert.deepEqual(newlyEarned(evaluateAll(one, ctx), stored), []);
  assert.deepEqual(newlyEarned(evaluateAll(emptyProgress(), ctx), stored), []);
  assert.equal(mergeEarned(stored, [], 2)['prompt-smith'].tier, 'bronze');
});

// ---------- round two (M4): Premiere and Curator ----------
const shortIds = TOPICS.flatMap((t) => t.sections.flatMap((s) => (s.short ? [s.short.id] : [])));
const savedItems = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'topic' as const, ref: `t${i}`, topicId: `t${i}`, addedAt: '2026-01-01T00:00:00.000Z' }));

test('Premiere: the first Short watched to the end, once', () => {
  assert.ok(shortIds.length >= 12);
  const answeredOnly = emptyProgress({ shorts: { [shortIds[0]]: { answeredAt: '2026-11-08T10:00:00Z', firstTry: true } } });
  assert.equal(evaluateAchievement(achievementById.premiere, answeredOnly, ctx).tier, null, 'answering the quiz is not the end card');
  assert.equal(evaluateAchievement(achievementById.premiere, emptyProgress({ shorts: { 'not-a-short': { watchedAt: '2026-11-08T10:00:00Z' } } }), ctx).value, 0, 'unknown ids do not count');
  const watched = emptyProgress({ shorts: { [shortIds[0]]: { watchedAt: '2026-11-08T10:00:00Z' } } });
  const earned = newlyEarned(evaluateAll(watched, ctx), {}).filter((e) => e.id === 'premiere');
  assert.deepEqual(earned, [{ id: 'premiere', tier: 'standard', tiers: ['standard'] }]);
  const stored = mergeEarned({}, earned, 1);
  const two = emptyProgress({ shorts: { [shortIds[0]]: { watchedAt: 'x' }, [shortIds[1]]: { watchedAt: 'y' } } });
  assert.deepEqual(newlyEarned(evaluateAll(two, ctx), stored).filter((e) => e.id === 'premiere'), [], 'never re-awarded');
});

test('Curator: tiers 5 / 25 / 75 / 200 items saved, never downgraded when items are removed', () => {
  const at = (n: number) => evaluateAchievement(achievementById.curator, emptyProgress({ saved: savedItems(n) }), ctx);
  assert.equal(at(4).tier, null);
  assert.equal(at(5).tier, 'bronze');
  assert.deepEqual(at(26).next, { tier: 'gold', goal: 75 });
  assert.equal(at(200).tier, 'diamond');
  const silver = newlyEarned(evaluateAll(emptyProgress({ saved: savedItems(30) }), ctx), {}).find((e) => e.id === 'curator');
  assert.deepEqual(silver, { id: 'curator', tier: 'silver', tiers: ['bronze', 'silver'] }, 'a jump lists every tier passed');
  const stored = mergeEarned({}, [silver!], 1);
  assert.deepEqual(newlyEarned(evaluateAll(emptyProgress({ saved: savedItems(3) }), ctx), stored).filter((e) => e.id === 'curator'), []);
  assert.equal(mergeEarned(stored, [{ id: 'curator', tier: 'bronze', tiers: ['bronze'] }], 2).curator.tier, 'silver');
});

test('quiet backfill: a save from before achievements stores Premiere / Curator without new unlocks', () => {
  // useAchievements: no stored map → backfill everything earned, then nothing is "new"
  const old = emptyProgress({ shorts: { [shortIds[0]]: { watchedAt: '2026-11-01T10:00:00Z' } }, saved: savedItems(6) });
  assert.equal(old.achievements, undefined);
  const earned = newlyEarned(evaluateAll(old, ctx), old.achievements);
  assert.deepEqual(earned.map((e) => e.id).sort(), ['curator', 'premiere']);
  const stored = mergeEarned(old.achievements ?? {}, earned, 1);
  assert.deepEqual(newlyEarned(evaluateAll(old, ctx), stored), []);
});

test('the catalogue keeps the 30 earlier badges and adds Pacesetter (M6), Frame by Frame (M7) and Path Finisher (C4)', () => {
  const ids = Object.keys(achievementById);
  assert.equal(ids.length, 34); // + From Scratch (drills) and Path Finisher (C4)
  for (const id of ['premiere', 'curator', 'prompt-smith', 'first-light', 'hat-trick', 'pacesetter', 'frame-by-frame', 'path-finisher']) assert.ok(ids.includes(id), id);
});
