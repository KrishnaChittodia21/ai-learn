// Study plan maths (pure, M6): covered minutes, the pacer, behind/ahead, catch-up advice, checkpoint dates and the
// day-by-day series the learning curve draws. Ported from system-design-learn src/lib/pace.ts; days are local
// YYYY-MM-DD strings, so they compare as strings. Design: ai-learn-designs/plan-journey/option-1-learning-curve.html
import { PACE_BEHIND_MIN } from '../content/achievements.ts';
import { ROLE_BY_ID } from '../content/roles.ts';
import type { Level, PhaseId, TopicMeta } from '../types';
import { localDay, PLAN_LOG_MAX, type Progress, type StudyPlan } from './progress.ts';
import { topicCompletion } from './stats.ts';

export const DAILY_MIN = 15;
export const DAILY_MAX = 180;
export const DAYS_PER_WEEK = [3, 4, 5, 6, 7];
const CATCH_UP_DAYS = 14;
/** stop walking the calendar after ~10 years (only reachable with absurd inputs) */
const MAX_WALK = 3650;
// study days run Monday onwards: 5 days a week = Mon–Fri
const STUDY_DOW = [1, 2, 3, 4, 5, 6, 0];

export interface PhaseLike {
  id: PhaseId;
  number: number;
  title: string;
  level: Level;
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

/** calendar days from a to b (DST-safe) */
export const dayDiff = (a: string, b: string) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86_400_000);
const ymd = (d: string): [number, number, number] => [Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))];

export function isStudyDay(day: string, daysPerWeek: number): boolean {
  return STUDY_DOW.slice(0, daysPerWeek).includes(parseDay(day).getDay());
}

/** study days in [from, to) */
export function studyDaysBetween(from: string, to: string, daysPerWeek: number): number {
  let n = 0;
  for (let d = from, i = 0; d < to && i < MAX_WALK; d = addDays(d, 1), i++) if (isStudyDay(d, daysPerWeek)) n++;
  return n;
}

/** planned minutes on a day, including any catch-up minutes */
function minutesOn(plan: StudyPlan, day: string, withCatchUp = true): number {
  if (!isStudyDay(day, plan.daysPerWeek)) return 0;
  const extra = withCatchUp && plan.catchUp && day <= plan.catchUp.until ? plan.catchUp.extraMinutes : 0;
  return plan.dailyMinutes + extra;
}

/** the day on which `need` more minutes are done, studying from `from` (inclusive) */
function dayAfter(plan: StudyPlan, from: string, need: number, withCatchUp = true): string {
  let left = need;
  let d = from;
  for (let i = 0; i < MAX_WALK; i++, d = addDays(d, 1)) {
    left -= minutesOn(plan, d, withCatchUp);
    if (left <= 0) return d;
  }
  return d;
}

/** study time already covered: each topic's minutes × its completion (sections, practice and exam). Shorts are
 *  not part of a topic's completion, so a watched Short never counts towards plan minutes. */
export function coveredMinutes(p: Progress, topics: TopicMeta[]): number {
  return Math.round(topics.reduce((a, t) => a + (t.estimatedMinutes * topicCompletion(p, t)) / 100, 0));
}

// ---- goals ----

const LEVEL_TITLE: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** A goal is 'all', 'level:<id>', 'phase:<id>', 'topic:<id>' or 'role:<id>' (a learning path, C4).
 *  Unknown or empty goals are the whole course. */
export function goalTopics(goal: string, topics: TopicMeta[], phases: PhaseLike[]): TopicMeta[] {
  const [kind, id] = goal.split(':');
  const levelOf = (t: TopicMeta) => phases.find((ph) => ph.id === t.phase)?.level;
  const picked =
    kind === 'level'
      ? topics.filter((t) => levelOf(t) === id)
      : kind === 'phase'
        ? topics.filter((t) => t.phase === id)
        : kind === 'topic'
          ? topics.filter((t) => t.id === id)
          : kind === 'role'
            ? topics.filter((t) => ROLE_BY_ID.get(id)?.topics.includes(t.id))
            : topics;
  return picked.length ? picked : topics;
}

export function goalLabel(goal: string, topics: TopicMeta[], phases: PhaseLike[]): string {
  const [kind, id] = goal.split(':');
  // an unknown goal falls back to the course (the same array back)
  if (goalTopics(goal, topics, phases) === topics) return 'The whole course';
  if (kind === 'level') return `${LEVEL_TITLE[id as Level]} level`;
  const ph = phases.find((x) => x.id === id);
  if (kind === 'phase' && ph) return `Phase ${ph.number}: ${ph.title}`;
  const t = topics.find((x) => x.id === id);
  if (kind === 'topic' && t) return t.title;
  const role = ROLE_BY_ID.get(id);
  if (kind === 'role' && role) return `${role.title} path`;
  return 'The whole course';
}

// ---- the pace ----

export type PaceState = 'behind' | 'on' | 'ahead' | 'done';

/** one checkpoint: a phase with something in the goal, measured in goal minutes */
export interface Checkpoint {
  id: string;
  number: number;
  title: string;
  topics: number;
  minutes: number;
  start: number;
  end: number;
  covered: number;
  remaining: number;
  /** projected day it is reached (null once covered) */
  date: string | null;
  /** first day the curve shows it covered (approximate: from the course-wide log) */
  doneDay: string | null;
}

export interface Pace {
  covered: number;
  /** where the plan says you'd be by the start of today (the pacer), course minutes */
  expected: number;
  /** expected − covered, in minutes (negative = ahead) */
  gap: number;
  state: PaceState;
  label: string;
  /** goal minutes: its size, covered, still to do */
  goalMinutes: number;
  you: number;
  remaining: number;
  /** projected finish from your real position (with any catch-up minutes) */
  finish: string | null;
  /** when the pacer finishes */
  pacerFinish: string | null;
  /** study days later than the pacer's finish if you keep the base pace, and that finish */
  extraDays: number;
  slowFinish: string | null;
  /** suggested extra minutes a day for the next two weeks */
  catchUpPerDay: number;
  lastActive?: string;
  /** study days missed since the last study day (counted from the baseline at the earliest) */
  missedDays: number;
  todayMinutes: number;
  /** the pacer on the goal's scale today */
  pacerNow: number;
  checkpoints: Checkpoint[];
  /** index of the checkpoint being worked on (-1 when done) */
  current: number;
  /** day by day from the plan's start to today, in goal minutes */
  past: { day: string; you: number; pacer: number }[];
  /** from today to the goal: your projection (with catch-up) and the pacer's */
  proj: { day: string; v: number }[];
  pacerFut: { day: string; v: number }[];
  /** the plan started today with nothing logged yet */
  fresh: boolean;
  /** |gap| in study days at the daily pace */
  daysDelta: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** [covered, expected] on each day from `from` to `to`: logged values, with `now` on `to`; covered steps (it only
 *  changes when the app is used, which logs that day), expected is interpolated between entries. */
function history(log: Record<string, [number, number]>, from: string, to: string, now: [number, number]) {
  const known = Object.entries({ ...log, [to]: now })
    .filter(([d]) => d >= from && d <= to)
    .sort(([a], [b]) => a.localeCompare(b));
  const out: { day: string; c: number; e: number }[] = [];
  let k = 0;
  for (let d = from, i = 0; d <= to && i < MAX_WALK; d = addDays(d, 1), i++) {
    while (k + 1 < known.length && known[k + 1][0] <= d) k++;
    const [d0, [c0, e0]] = known[k];
    if (d < d0) {
      out.push({ day: d, c: c0, e: e0 });
      continue;
    }
    const next = known[k + 1];
    const e = next ? e0 + ((next[1][1] - e0) * dayDiff(d0, d)) / dayDiff(d0, next[0]) : e0;
    out.push({ day: d, c: c0, e });
  }
  return out;
}

/** the pacer: where the plan expects you by the start of `today`, in course minutes */
export function expectedMinutes(plan: StudyPlan, topics: TopicMeta[], today = localDay()): number {
  const total = topics.reduce((a, t) => a + t.estimatedMinutes, 0);
  return Math.min(total, plan.baselineCovered + studyDaysBetween(plan.baselineAt, today, plan.daysPerWeek) * plan.dailyMinutes);
}

export function computePace(plan: StudyPlan, p: Progress, topics: TopicMeta[], phases: PhaseLike[], today = localDay()): Pace {
  const goal = goalTopics(plan.goal, topics, phases);
  const covered = coveredMinutes(p, topics);
  const expected = expectedMinutes(plan, topics, today);
  const gap = Math.round(expected - covered);
  const coveredIn = (t: TopicMeta) => (t.estimatedMinutes * topicCompletion(p, t)) / 100;
  const goalMinutes = goal.reduce((a, t) => a + t.estimatedMinutes, 0);
  const you = Math.round(goal.reduce((a, t) => a + coveredIn(t), 0));
  const remaining = Math.max(0, goalMinutes - you);
  const done = remaining <= 0;
  const state: PaceState = done ? 'done' : gap >= PACE_BEHIND_MIN ? 'behind' : -gap >= plan.dailyMinutes ? 'ahead' : 'on';

  const finish = done ? null : dayAfter(plan, today, remaining);
  const pacerFinish = done ? null : dayAfter(plan, today, Math.max(1, remaining - Math.max(0, gap)), false);
  const slowFinish = done ? null : dayAfter(plan, today, remaining, false);
  const extraDays = slowFinish && pacerFinish && slowFinish > pacerFinish ? studyDaysBetween(pacerFinish, slowFinish, plan.daysPerWeek) : 0;

  const window = Math.max(1, studyDaysBetween(today, addDays(today, CATCH_UP_DAYS), plan.daysPerWeek));
  const catchUpPerDay = gap > 0 ? Math.min(DAILY_MAX - plan.dailyMinutes, Math.max(5, Math.ceil(gap / window / 5) * 5)) : 0;

  const lastActive = [...(p.activityDays ?? [])].reverse().find((d) => d < today);
  const missedFrom = lastActive && addDays(lastActive, 1) > plan.baselineAt ? addDays(lastActive, 1) : plan.baselineAt;
  const missedDays = state !== 'behind' ? 0 : studyDaysBetween(missedFrom, today, plan.daysPerWeek);
  const pacerNow = clamp(you + gap, 0, goalMinutes);

  // shortcut: the log is course-wide, so the past curve assumes study went into the goal; a per-goal log would fix it
  const past = history(plan.log ?? {}, plan.startedAt > today ? today : plan.startedAt, today, [covered, expected]).map((h) => {
    const y = clamp(you - (covered - h.c), 0, goalMinutes);
    return { day: h.day, you: y, pacer: clamp(y + h.e - h.c, 0, goalMinutes) };
  });

  let at = 0;
  let left = 0;
  const checkpoints: Checkpoint[] = [];
  for (const ph of phases) {
    const list = goal.filter((t) => t.phase === ph.id);
    if (!list.length) continue;
    const minutes = list.reduce((a, t) => a + t.estimatedMinutes, 0);
    const cov = list.reduce((a, t) => a + coveredIn(t), 0);
    const rem = Math.max(0, Math.round(minutes - cov));
    left += rem;
    const end = at + minutes;
    checkpoints.push({
      id: ph.id,
      number: ph.number,
      title: ph.title,
      topics: list.length,
      minutes,
      start: at,
      end,
      covered: Math.round(cov),
      remaining: rem,
      date: rem <= 0 ? null : dayAfter(plan, today, left),
      doneDay: rem <= 0 ? (past.find((x) => x.you >= end - 0.5)?.day ?? today) : null,
    });
    at = end;
  }
  const current = checkpoints.findIndex((c) => c.remaining > 0);

  const walk = (from: number, withCatchUp: boolean) => {
    const out = [{ day: today, v: from }];
    let v = from;
    for (let d = today, i = 0; v < goalMinutes && i < MAX_WALK; i++) {
      v = Math.min(goalMinutes, v + minutesOn(plan, d, withCatchUp));
      d = addDays(d, 1);
      out.push({ day: d, v });
    }
    return out;
  };

  return {
    covered,
    expected,
    gap,
    state,
    label: goalLabel(plan.goal, topics, phases),
    goalMinutes,
    you,
    remaining,
    finish,
    pacerFinish,
    extraDays,
    slowFinish,
    catchUpPerDay: Math.max(0, catchUpPerDay),
    lastActive,
    missedDays,
    todayMinutes: minutesOn(plan, today),
    pacerNow,
    checkpoints,
    current,
    past,
    proj: done ? [{ day: today, v: goalMinutes }] : walk(you, true),
    pacerFut: done ? [{ day: today, v: goalMinutes }] : walk(pacerNow, false),
    fresh: plan.startedAt === today && Object.keys(plan.log ?? {}).every((d) => d === today),
    daysDelta: Math.round(Math.abs(gap) / plan.dailyMinutes),
  };
}

export function newPlan(covered: number, today = localDay()): StudyPlan {
  return { dailyMinutes: 45, daysPerWeek: 5, goal: 'all', startedAt: today, baselineAt: today, baselineCovered: covered };
}

/** pace changed: the pacer keeps its position (so any gap stays) and runs at the new pace from today */
export function repace(plan: StudyPlan, expected: number, today = localDay()): StudyPlan {
  return { ...plan, baselineAt: today, baselineCovered: expected };
}

/** finish date moved (or plan started): the pacer restarts from today at your real position, so old misses stop counting */
export function rebase(plan: StudyPlan, covered: number, today = localDay()): StudyPlan {
  const { catchUp: _drop, ...rest } = plan;
  return { ...rest, baselineAt: today, baselineCovered: covered };
}

export function withCatchUp(plan: StudyPlan, extraMinutes: number, today = localDay()): StudyPlan {
  return { ...plan, catchUp: { extraMinutes, until: addDays(today, CATCH_UP_DAYS - 1) } };
}

/** the plan with today's log entry brought up to date (the same plan when nothing changed) */
export const planWithLog = (plan: StudyPlan, p: Progress, topics: TopicMeta[], today = localDay()) =>
  logPace(plan, coveredMinutes(p, topics), expectedMinutes(plan, topics, today), today);

/** today's end-of-day entry in the plan log; the same plan back when nothing changed (no write, no loop) */
export function logPace(plan: StudyPlan, covered: number, expected: number, today = localDay()): StudyPlan {
  const cur = plan.log?.[today];
  if (cur && cur[0] === covered && cur[1] === expected) return plan;
  const days = Object.keys(plan.log ?? {}).filter((d) => d !== today).sort().slice(-(PLAN_LOG_MAX - 1));
  const log: Record<string, [number, number]> = {};
  for (const d of days) log[d] = plan.log![d];
  log[today] = [covered, expected];
  return { ...plan, log };
}

/** "2 h 15 m", "40 m" */
export function hm(mins: number): string {
  const m = Math.round(Math.abs(mins));
  const h = Math.floor(m / 60);
  return h ? `${h} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} m`;
}

export function fmtDay(day: string, year = false): string {
  return parseDay(day).toLocaleDateString('en-GB', year ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

export const weekday = (day: string) => parseDay(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
