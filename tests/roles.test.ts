// Learning paths by role (C4): path integrity, the role:<id> plan goal, Today's next-step preference, certificate
// eligibility, the Path Finisher badge and Export / Import of the new progress keys.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathsCertified, pathStatus, ROLE_BY_ID, ROLES, roleTopicIds } from '../src/content/roles.ts';
import { achievementById, buildAchievementContext, evaluateAchievement } from '../src/content/achievements.ts';
import { COMPANY_QUESTIONS } from '../src/content/companies.ts';
import { PHASES } from '../src/content/phases.ts';
import { goalLabel, goalTopics } from '../src/lib/pace.ts';
import { nextStep } from '../src/lib/nextStep.ts';
import { exportBackup, mergeProgress, parseBackup } from '../src/lib/backup.ts';
import { normalize } from '../src/lib/progress.ts';
import { emptyProgress, passedTest, TOPICS } from './helpers.ts';

const ids = new Set(TOPICS.map((t) => t.id));
const courseIndex = new Map(TOPICS.map((t, i) => [t.id, i]));

test('7 paths with unique ids, every topic exists, no duplicates, 6–20 topics in course order', () => {
  assert.equal(ROLES.length, 7);
  assert.equal(new Set(ROLES.map((r) => r.id)).size, ROLES.length);
  for (const r of ROLES) {
    assert.ok(r.title.trim() && r.summary.trim(), r.id);
    assert.ok(r.goodFitIf.length > 0 && r.responsibilities.length > 0, r.id);
    assert.ok(r.topics.length >= 6 && r.topics.length <= 20, `${r.id}: ${r.topics.length} topics`);
    assert.equal(new Set(r.topics).size, r.topics.length, `${r.id}: duplicate topic`);
    for (const id of r.topics) assert.ok(ids.has(id), `${r.id}: unknown topic ${id}`);
    // course order puts prerequisites first
    const order = r.topics.map((id) => courseIndex.get(id)!);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${r.id}: topics out of course order`);
  }
  assert.deepEqual(roleTopicIds(undefined), []);
  assert.deepEqual(roleTopicIds('nope'), []);
});

test('plan goal role:<id> picks the path topics and labels it; unknown role is the whole course', () => {
  const r = ROLES[0];
  const picked = goalTopics(`role:${r.id}`, TOPICS, PHASES);
  assert.deepEqual(new Set(picked.map((t) => t.id)), new Set(r.topics));
  assert.equal(goalLabel(`role:${r.id}`, TOPICS, PHASES), `${r.title} path`);
  assert.equal(goalTopics('role:nope', TOPICS, PHASES), TOPICS);
  assert.equal(goalLabel('role:nope', TOPICS, PHASES), 'The whole course');
});

test('next step prefers the next unfinished topic in the followed path, then falls back', () => {
  const r = ROLE_BY_ID.get('model-context-protocol')!;
  const path = r.topics;
  // fresh learner on a path starts with the path's first topic
  const s0 = nextStep(emptyProgress(), TOPICS, { path });
  assert.equal(s0.kind, 'start');
  assert.equal(s0.topic?.id, path[0]);
  // the first two path topics passed → the third, even though earlier course topics are unpassed
  const tests = { [path[0]]: passedTest(), [path[1]]: passedTest() };
  const s1 = nextStep(emptyProgress({ tests }), TOPICS, { path });
  assert.equal(s1.topic?.id, path[2]);
  // without a path the course order applies
  const s2 = nextStep(emptyProgress({ tests }), TOPICS);
  assert.equal(s2.topic?.id, TOPICS.find((t) => !tests[t.id])!.id);
  // whole path passed → back to the course's first unpassed topic
  const all = Object.fromEntries(path.map((id) => [id, passedTest()]));
  const s3 = nextStep(emptyProgress({ tests: all }), TOPICS, { path });
  assert.equal(s3.topic?.id, TOPICS.find((t) => !all[t.id])!.id);
});

test('certificate: only when every path exam is passed; date is the last first-pass', () => {
  const r = { topics: ['a', 'b'] };
  assert.deepEqual(pathStatus(emptyProgress(), r), { passed: 0, total: 2, certified: false, completedAt: undefined });
  const one = emptyProgress({ tests: { a: passedTest() } });
  assert.equal(pathStatus(one, r).certified, false);
  // attempted but not passed does not count
  const failed = emptyProgress({ tests: { a: passedTest(), b: { best: 40, last: 40, attempts: 1 } } });
  assert.equal(pathStatus(failed, r).certified, false);
  const both = emptyProgress({ tests: { a: { ...passedTest(), passedAt: '2026-03-01T00:00:00.000Z' }, b: { ...passedTest(), passedAt: '2026-02-01T00:00:00.000Z' } } });
  assert.deepEqual(pathStatus(both, r), { passed: 2, total: 2, certified: true, completedAt: '2026-03-01T00:00:00.000Z' });
  assert.equal(pathStatus(emptyProgress(), { topics: [] }).certified, false);
});

test('Path Finisher counts certified paths in tiers', () => {
  const ctx = buildAchievementContext({ topics: TOPICS, phases: PHASES, challenges: COMPANY_QUESTIONS });
  const a = achievementById['path-finisher'];
  assert.ok(a);
  assert.equal(evaluateAchievement(a, emptyProgress(), ctx).tier, null);
  const tests = Object.fromEntries(ROLES[0].topics.map((id) => [id, passedTest()]));
  const p = emptyProgress({ tests });
  assert.equal(pathsCertified(p), 1);
  assert.equal(evaluateAchievement(a, p, ctx).tier, 'bronze');
  const all = emptyProgress({ tests: Object.fromEntries(TOPICS.map((t) => [t.id, passedTest()])) });
  assert.equal(evaluateAchievement(a, all, ctx).tier, 'diamond');
});

const file = (progress: unknown) => JSON.stringify({ app: 'ai-learn', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', progress });

test('backup carries rolePath and certName, validates them and merges (this device wins)', () => {
  const p = normalize(emptyProgress({ rolePath: 'mcp-x', certName: 'Ada Lovelace' }));
  const back = parseBackup(JSON.stringify(exportBackup(p)));
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(back.progress.rolePath, 'mcp-x');
    assert.equal(back.progress.certName, 'Ada Lovelace');
  }
  for (const bad of [{ rolePath: 'Bad Id!' }, { rolePath: 7 }, { rolePath: 'x'.repeat(65) }, { certName: 'x'.repeat(81) }, { certName: {} }]) {
    const r = parseBackup(file({ ...emptyProgress(), ...bad }));
    assert.equal(r.ok, false, JSON.stringify(bad).slice(0, 40));
  }
  const cur = normalize(emptyProgress({ rolePath: 'applied-ai-engineer' }));
  const inc = normalize(emptyProgress({ rolePath: 'model-context-protocol', certName: 'Ada' }));
  const m = mergeProgress(cur, inc);
  assert.equal(m.rolePath, 'applied-ai-engineer');
  assert.equal(m.certName, 'Ada');
  assert.equal('rolePath' in mergeProgress(normalize(emptyProgress()), normalize(emptyProgress())), false);
});
