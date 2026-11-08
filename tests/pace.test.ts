// Plan your journey (M6): pace maths ported from system-design-learn (tests/app.test.ts), plus goals, checkpoint
// dates, the plan log behind the learning curve and the Pacesetter badge.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as pace from '../src/lib/pace.ts';
import { achievementById, buildAchievementContext, daysOnPace, evaluateAchievement, mergeEarned, newlyEarned, evaluateAll } from '../src/content/achievements.ts';
import { COMPANY_QUESTIONS } from '../src/content/companies.ts';
import { PHASES } from '../src/content/phases.ts';
import type { Progress, StudyPlan } from '../src/lib/progress.ts';
import { emptyProgress, TOPICS } from './helpers.ts';

const fresh = (activityDays: string[] = [], over: Partial<Progress> = {}) => emptyProgress({ activityDays, ...over });
// Mon 26 Oct 2026 → Mon 2 Nov 2026: one week, five study days on a 5-day plan
const MON = '2026-10-26';
const NEXT_MON = '2026-11-02';
const plan: StudyPlan = { ...pace.newPlan(0, MON), dailyMinutes: 45, daysPerWeek: 5 };
const at = (pl: StudyPlan, p: Progress = fresh(), today = NEXT_MON) => pace.computePace(pl, p, TOPICS, PHASES, today);
/** read whole topics until about `mins` course minutes are covered */
const coveredAbout = (mins: number): Progress => {
  const sections: Record<string, number[]> = {};
  let left = mins;
  for (const t of TOPICS) {
    // sections read are 1/5 of a topic's completion
    const per = t.estimatedMinutes / 5 / t.sections.length;
    const n = Math.min(t.sections.length, Math.round(left / per));
    if (n <= 0) break;
    sections[t.id] = Array.from({ length: n }, (_, i) => i);
    left -= n * per;
  }
  return fresh([], { sections });
};

test('rest days are not study days and plan no minutes', () => {
  assert.equal(pace.studyDaysBetween(MON, NEXT_MON, 5), 5);
  assert.equal(pace.studyDaysBetween(MON, NEXT_MON, 7), 7);
  assert.equal(at(plan, fresh(), '2026-10-31').todayMinutes, 0, 'Saturday on a 5-day plan');
  assert.equal(at(plan).todayMinutes, 45);
});

test('covered / expected / behind: behind, on and ahead of the pacer', () => {
  const behind = at(plan);
  assert.equal(behind.covered, 0);
  assert.equal(behind.expected, 5 * 45);
  assert.equal(behind.gap, 225);
  assert.equal(behind.state, 'behind');
  assert.ok(behind.catchUpPerDay > 0 && behind.catchUpPerDay % 5 === 0);
  const on = at({ ...plan, baselineCovered: -225 + 10 });
  assert.equal(on.state, 'on', 'a gap under 15 minutes is on pace');
  assert.equal(at({ ...plan, baselineCovered: -225 - 45 }).state, 'ahead', 'a day ahead');
});

test('covered counts topic completion; a watched Short adds no plan minutes', () => {
  const p = coveredAbout(100);
  const c = pace.coveredMinutes(p, TOPICS);
  assert.ok(c > 60 && c < 140, `about 100 minutes, got ${c}`);
  const shortId = TOPICS.flatMap((t) => t.sections.flatMap((s) => (s.short ? [s.short.id] : [])))[0];
  const watched = { ...p, shorts: { [shortId]: { watchedAt: '2026-11-01T10:00:00Z', answeredAt: '2026-11-01T10:00:00Z', firstTry: true } } };
  assert.equal(pace.coveredMinutes(watched, TOPICS), c);
  assert.equal(at(plan, watched).gap, at(plan, p).gap);
});

test('missed days count from the last active day, skipping rest days', () => {
  assert.equal(at(plan).missedDays, 5, 'never active: from the baseline');
  // active Wed and Thu: only Friday is missed (the weekend is rest)
  assert.equal(at(plan, fresh(['2026-10-28', '2026-10-29'])).missedDays, 1);
  assert.equal(at(plan, fresh(['2026-10-28', '2026-10-29'])).lastActive, '2026-10-29');
  // activity before the baseline does not reach back past it
  assert.equal(at(plan, fresh(['2026-10-01'])).missedDays, 5);
});

test('pace change keeps the gap; only "Move my finish date" resets it', () => {
  const before = at(plan);
  const repaced = pace.repace({ ...plan, dailyMinutes: 90 }, before.expected, NEXT_MON);
  assert.equal(at(repaced).gap, 225, 'a new pace runs from today and keeps the gap');
  assert.equal(at(repaced, fresh(), '2026-11-03').expected, 225 + 90, 'and runs at the new pace');
  const rebased = pace.rebase(pace.withCatchUp(plan, 15, MON), 0, NEXT_MON);
  const after = at(rebased);
  assert.equal(after.gap, 0);
  assert.equal(after.missedDays, 0);
  assert.equal(rebased.catchUp, undefined);
});

test('catch-up minutes are added for two weeks and bring the finish forward', () => {
  const p = pace.withCatchUp(plan, 20, NEXT_MON);
  assert.equal(at(p).todayMinutes, 65);
  assert.equal(p.catchUp?.until, '2026-11-15');
  assert.ok(at(p).finish! < at(plan).finish!);
  assert.equal(at(plan).extraDays > 0, true, 'keeping the base pace finishes later than the pacer');
});

test('goals: whole course, level, phase, topic; unknown is the whole course', () => {
  const total = TOPICS.reduce((a, t) => a + t.estimatedMinutes, 0);
  assert.equal(at(plan).goalMinutes, total);
  assert.equal(at(plan).label, 'The whole course');
  const beginner = TOPICS.filter((t) => PHASES.find((p) => p.id === t.phase)!.level === 'beginner');
  const lvl = at({ ...plan, goal: 'level:beginner' });
  assert.equal(lvl.goalMinutes, beginner.reduce((a, t) => a + t.estimatedMinutes, 0));
  assert.equal(lvl.label, 'Beginner level');
  const rag = at({ ...plan, goal: 'phase:rag' });
  assert.equal(rag.checkpoints.length, 1);
  assert.equal(rag.label, 'Phase 7: RAG Architectures');
  const topic = TOPICS[3];
  const t = at({ ...plan, goal: `topic:${topic.id}` });
  assert.equal(t.goalMinutes, topic.estimatedMinutes);
  assert.equal(t.label, topic.title);
  assert.equal(at({ ...plan, goal: 'topic:no-such-topic' }).goalMinutes, total);
  assert.equal(at({ ...plan, goal: 'role:agentic' }).label, 'The whole course', 'role paths wait for C4 and fall back to the course');
  assert.ok(t.finish! < at(plan).finish!, 'a smaller goal finishes sooner');
});

test('finish and phase dates: one checkpoint per phase, dated in order, the last on the finish date', () => {
  const m = at(plan);
  assert.equal(m.checkpoints.length, PHASES.length);
  const dates = m.checkpoints.map((c) => c.date!);
  assert.deepEqual([...dates].sort(), dates);
  assert.equal(dates.at(-1), m.finish);
  // 45 min on 5 days a week from Mon 2 Nov: the first phase's minutes need ceil(min / 45) study days
  const first = m.checkpoints[0];
  const days = Math.ceil(first.minutes / 45);
  let d = NEXT_MON;
  for (let n = 0; ; d = pace.addDays(d, 1)) if (pace.isStudyDay(d, 5) && ++n === days) break;
  assert.equal(first.date, d);
  // a covered phase has no date and counts as saved
  const done = fresh([], { sections: Object.fromEntries(TOPICS.filter((t) => t.phase === 'foundations').map((t) => [t.id, t.sections.map((_, i) => i)])) });
  assert.ok(at(plan, done).checkpoints[0].remaining < first.remaining);
});

test('the curve: past from the plan start to today, projections reach the goal', () => {
  const pl = { ...plan, log: { [MON]: [0, 0], '2026-10-28': [100, 90] } as Record<string, [number, number]> };
  const m = at(pl, coveredAbout(100));
  assert.equal(m.past[0].day, MON);
  assert.equal(m.past.at(-1)!.day, NEXT_MON);
  assert.equal(m.past.length, 8);
  assert.ok(m.past[0].you <= m.past.at(-1)!.you);
  assert.equal(m.proj[0].day, NEXT_MON);
  assert.equal(m.proj.at(-1)!.v, m.goalMinutes);
  assert.equal(m.pacerFut.at(-1)!.v, m.goalMinutes);
});

test('plan log: one entry a day, unchanged values do not write, capped', () => {
  const a = pace.logPace(plan, 10, 45, NEXT_MON);
  assert.deepEqual(a.log, { [NEXT_MON]: [10, 45] });
  assert.equal(pace.logPace(a, 10, 45, NEXT_MON), a, 'same values: the same plan back');
  assert.deepEqual(pace.logPace(a, 30, 45, NEXT_MON).log, { [NEXT_MON]: [30, 45] });
  let big: StudyPlan = plan;
  for (let i = 0; i < 420; i++) big = pace.logPace(big, i, i, pace.addDays('2025-01-01', i));
  assert.equal(Object.keys(big.log!).length, 400);
});

test('Pacesetter: a week on pace, earned once, never downgraded', () => {
  const ctx = buildAchievementContext({ topics: TOPICS, phases: PHASES, challenges: COMPANY_QUESTIONS });
  const day = (i: number) => pace.addDays(MON, i);
  const log = (gaps: number[]) => Object.fromEntries(gaps.map((g, i) => [day(i), [100, 100 + g] as [number, number]]));
  assert.equal(daysOnPace(log([0, 0, 0, 0, 0, 0, 0])), 6, 'seven entries span six days');
  assert.equal(daysOnPace(log([0, 0, 0, 0, 0, 0, 0, 0])), 7);
  assert.equal(daysOnPace(log([0, 0, 0, 30, 0, 0, 0, 0])), 3, 'a behind day restarts the run');
  assert.equal(daysOnPace({ [day(0)]: [0, 0], [day(7)]: [315, 315] }), 7, 'days between entries are bridged');
  const withLog = (gaps: number[]) => emptyProgress({ studyPlan: { ...plan, log: log(gaps) } });
  const a = achievementById.pacesetter;
  assert.equal(evaluateAchievement(a, withLog([0, 0, 0, 0, 0, 0, 0]), ctx).tier, null);
  const week = withLog([0, -60, 0, 5, 0, 0, 0, 0]);
  assert.equal(evaluateAchievement(a, week, ctx).tier, 'standard');
  const stored = mergeEarned({}, newlyEarned(evaluateAll(week, ctx), {}), 1);
  assert.equal(stored.pacesetter.tier, 'standard');
  // falling behind or removing the plan later does not take it away or award it again
  assert.deepEqual(newlyEarned(evaluateAll(withLog([90]), ctx), stored).filter((e) => e.id === 'pacesetter'), []);
  assert.deepEqual(newlyEarned(evaluateAll(emptyProgress(), ctx), stored), []);
});
