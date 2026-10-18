// Achievements (milestone badges): pure data + pure evaluation. No React and no runtime imports
// (types only), so the same code runs in the app and in plain node checks
// (scripts/validate-achievements.mjs).
//
// Every achievement is { id, name, description, group, art, tiers? | goal, measure, requirement, unit }.
//  - art: a glyph key resolved to a lucide icon by src/components/achievements/Badge.tsx
//  - tiers: [{ tier: 'bronze' | 'silver' | 'gold' | 'diamond', goal }] (goal may be a function of ctx)
//  - goal: for single-step badges (stored with tier 'standard')
//  - measure(progress, ctx) → number (the "34" in "34 / 50")
//  - requirement(goal, ctx) → short text for a locked badge ("Pass 5 topic exams on the first attempt")
//
// Every measure reads only what src/lib/progress.ts actually records:
//  sections   Learn sections marked read          (p.sections[topicId] = indexes)
//  cc         Code Lab challenges (cc[challenge.id]) and section "Try it" exercises (cc[`${topic}-s${i}-ex`])
//  drafts     quick-check picks (drafts[`qc:${topic}-s${i}-qc`] = chosen option index)
//  iq         interview self-ratings (nailed / partial / missed)
//  boe        estimation drills worked through
//  company    architecture challenges completed
//  tests      topic exam records (best, attempts, passedAt ISO, history of { at ISO, score }, last 10)
//  mcq        per exam-question outcome (wrong count, lastCorrect, lastAt ISO)
//  activityDays  local YYYY-MM-DD study days (last 120)
import type { Level, PhaseId, Topic } from '../types';
import type { Progress } from '../lib/progress';

export type Tier = 'bronze' | 'silver' | 'gold' | 'diamond';
/** 'standard' is the only step of a single-step badge */
export type EarnedTier = Tier | 'standard';

/** what progress.achievements stores per earned badge */
export interface StoredAchievement {
  tier: EarnedTier;
  /** when the current (highest) tier was earned, ms since epoch */
  earnedAt: number;
  /** when each tier was first earned */
  tiers?: Partial<Record<EarnedTier, number>>;
}

export type AchievementGroupId = 'start' | 'content' | 'practice' | 'understanding' | 'consistency' | 'fun';

export interface AchievementContext {
  topics: Topic[];
  phases: { id: PhaseId; number: number; title: string; level: Level }[];
  topicsByPhase: Map<PhaseId, Topic[]>;
  topicsByLevel: Map<Level, Topic[]>;
  /** architecture challenge ids */
  challenges: string[];
  totals: { sections: number; exercises: number; quickChecks: number; codeLab: number; boe: number; iq: number };
}

type Goal = number | ((ctx: AchievementContext) => number);

export interface Achievement {
  id: string;
  name: string;
  description: string;
  group: AchievementGroupId;
  art: string;
  tiers?: { tier: Tier; goal: Goal }[];
  goal?: Goal;
  measure: (p: Progress, ctx: AchievementContext) => number;
  requirement: (goal: number, ctx: AchievementContext) => string;
  unit: string;
}

export interface TierStep {
  tier: EarnedTier;
  goal: number;
}

export interface AchievementEvaluation {
  id: string;
  value: number;
  tiers: (TierStep & { reached: boolean })[];
  /** highest tier reached, or null */
  tier: EarnedTier | null;
  /** next tier to reach, or null when maxed */
  next: TierStep | null;
  /** 0..1 toward `next` */
  fraction: number;
  requirement: string;
}

export interface EarnedNow {
  id: string;
  /** highest tier now reached */
  tier: EarnedTier;
  /** every tier newly reached (a jump from nothing to gold lists bronze, silver and gold) */
  tiers: EarnedTier[];
}

export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'diamond'];
export const TIER_LABEL: Record<EarnedTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', diamond: 'Diamond', standard: '' };
/** rank for comparisons; 'standard' (single step) ranks with bronze */
export const tierRank = (tier: EarnedTier) => (tier === 'standard' ? 0 : TIERS.indexOf(tier));

export const GROUPS: { id: AchievementGroupId; title: string; blurb: string }[] = [
  { id: 'start', title: 'Getting started', blurb: 'The first sparks: one section, one exercise, one exam.' },
  { id: 'content', title: 'Lessons & phases', blurb: 'Read the course, light up phases and graduate each level.' },
  { id: 'practice', title: 'Practice', blurb: 'Try-it exercises, the Code Lab, estimation drills, interviews and architecture challenges.' },
  { id: 'understanding', title: 'Understanding', blurb: 'Quick checks right, first-try passes, perfect scores and mistakes fixed.' },
  { id: 'consistency', title: 'Consistency', blurb: 'Show up, day after day.' },
  { id: 'fun', title: 'Just for fun', blurb: 'Small surprises hidden in your study record.' },
];

// ---------- measuring helpers (all read the real progress shape) ----------
const isPassed = (p: Progress, topicId: string) => !!p.tests[topicId]?.passedAt;
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const time = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN);
const sumTopics = (ctx: AchievementContext, f: (t: Topic) => number) => ctx.topics.reduce((n, t) => n + f(t), 0);

/** Learn sections marked read, counting only sections that still exist */
const sectionsReadIn = (p: Progress, t: Topic) => new Set((p.sections[t.id] ?? []).filter((i) => i >= 0 && i < t.sections.length)).size;
const sectionsRead = (p: Progress, ctx: AchievementContext) => sumTopics(ctx, (t) => sectionsReadIn(p, t));

/** section "Try it" exercises marked solved */
const exercisesSolved = (p: Progress, ctx: AchievementContext) =>
  sumTopics(ctx, (t) => t.sections.filter((s, i) => s.exercise && p.cc[`${t.id}-s${i}-ex`]).length);

/** quick checks whose saved pick is the right option */
function quickChecksRight(p: Progress, ctx: AchievementContext) {
  return sumTopics(ctx, (t) =>
    t.sections.filter((s, i) => {
      if (!s.quickCheck) return false;
      const d = p.drafts[`qc:${t.id}-s${i}-qc`];
      return d !== undefined && d !== '' && Number(d) === s.quickCheck.correct;
    }).length,
  );
}

const codeLabSolved = (p: Progress, ctx: AchievementContext) => sumTopics(ctx, (t) => t.codeChallenges.filter((c) => p.cc[c.id]).length);
const drillsDone = (p: Progress, ctx: AchievementContext) => sumTopics(ctx, (t) => t.envelopeQuestions.filter((q) => p.boe[q.id]).length);
const interviewsRated = (p: Progress, ctx: AchievementContext, only?: 'nailed') =>
  sumTopics(ctx, (t) => t.interviewQuestions.filter((q) => (only ? p.iq[q.id] === only : !!p.iq[q.id])).length);
const examsPassed = (p: Progress, topics: Topic[]) => topics.filter((t) => isPassed(p, t.id)).length;

/**
 * Attempts of a topic exam that failed before it was first passed. recordTest stamps passedAt just
 * before the passing attempt's history entry, so every entry strictly earlier than passedAt failed.
 * Returns null when the exam is not passed or the attempt history was trimmed (it keeps 10).
 */
export function failsBeforePass(p: Progress, topicId: string): number | null {
  const rec = p.tests[topicId];
  const passed = time(rec?.passedAt);
  if (!rec || !Number.isFinite(passed) || !rec.history?.length) return null;
  const before = rec.history.filter((h) => time(h.at) < passed).length;
  if (rec.attempts !== rec.history.length && before === 0) return null; // the earliest attempts were trimmed
  return before;
}

/** every part of a topic done: sections, Code Lab, interview ratings, drills and the exam (mirrors topicCompletion) */
function topicComplete(p: Progress, t: Topic) {
  return (
    isPassed(p, t.id) &&
    sectionsReadIn(p, t) >= t.sections.length &&
    t.codeChallenges.every((c) => p.cc[c.id]) &&
    t.interviewQuestions.every((q) => p.iq[q.id]) &&
    t.envelopeQuestions.every((q) => p.boe[q.id])
  );
}

const DAY_MS = 86_400_000;
/** "2026-10-15" → a day number (UTC midnight, so DST never breaks a run) */
const dayNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / DAY_MS;

/** longest run of consecutive study days ever recorded */
export function longestStreak(days: string[] = []): number {
  const nums = [...new Set(days.map(dayNum))].filter(Number.isFinite).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] - nums[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** weekends (a Saturday + the following Sunday) with study on both days */
export function fullWeekends(days: string[] = []): number {
  const set = new Set(days.map(dayNum).filter(Number.isFinite));
  // day number 0 = Thu 1 Jan 1970, so (n + 4) % 7 === 6 is a Saturday
  return [...set].filter((n) => (((n + 4) % 7) + 7) % 7 === 6 && set.has(n + 1)).length;
}

/** exam attempts and exam answers stamped between 00:00 and 03:59 local time */
function lateNightCount(p: Progress): number {
  const stamps = [...Object.values(p.tests).flatMap((t) => (t.history ?? []).map((h) => h.at)), ...Object.values(p.mcq).map((m) => m.lastAt)];
  return stamps.filter((at) => {
    const d = new Date(at);
    return !Number.isNaN(d.getTime()) && d.getHours() < 4;
  }).length;
}

/** the most topic exams first passed on a single local day */
function bestPassDay(p: Progress, ctx: AchievementContext): number {
  const perDay = new Map<string, number>();
  for (const t of ctx.topics) {
    const d = new Date(p.tests[t.id]?.passedAt ?? '');
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...perDay.values());
}

/** Precomputes the content-dependent lists every measure needs. */
export function buildAchievementContext({
  topics,
  phases,
  challenges,
}: {
  topics: Topic[];
  phases: { id: PhaseId; number: number; title: string; level: Level }[];
  challenges: { id: string }[];
}): AchievementContext {
  const topicsByPhase = new Map<PhaseId, Topic[]>();
  for (const t of topics) topicsByPhase.set(t.phase, [...(topicsByPhase.get(t.phase) ?? []), t]);
  const topicsByLevel = new Map<Level, Topic[]>();
  for (const ph of phases) topicsByLevel.set(ph.level, [...(topicsByLevel.get(ph.level) ?? []), ...(topicsByPhase.get(ph.id) ?? [])]);
  const sum = (f: (t: Topic) => number) => topics.reduce((n, t) => n + f(t), 0);
  return {
    topics,
    phases,
    topicsByPhase,
    topicsByLevel,
    challenges: challenges.map((c) => c.id),
    totals: {
      sections: sum((t) => t.sections.length),
      exercises: sum((t) => t.sections.filter((s) => s.exercise).length),
      quickChecks: sum((t) => t.sections.filter((s) => s.quickCheck).length),
      codeLab: sum((t) => t.codeChallenges.length),
      boe: sum((t) => t.envelopeQuestions.length),
      iq: sum((t) => t.interviewQuestions.length),
    },
  };
}

/** phases with at least one topic whose every topic exam is passed */
const phasesGraduated = (p: Progress, ctx: AchievementContext) =>
  ctx.phases.filter((ph) => {
    const ts = ctx.topicsByPhase.get(ph.id) ?? [];
    return ts.length > 0 && ts.every((t) => isPassed(p, t.id));
  }).length;
const phasesWithTopics = (ctx: AchievementContext) => ctx.phases.filter((ph) => (ctx.topicsByPhase.get(ph.id) ?? []).length > 0).length;

// ---------- level graduates ----------
// [level, badge name, glyph, what passing the level proves]
const LEVEL_BADGES: [Level, string, string, string][] = [
  ['beginner', 'Prompt Whisperer', 'level-1', 'Beginner: how LLMs work, prompting and LLM APIs, embeddings'],
  ['intermediate', 'Retrieval Engineer', 'level-2', 'Intermediate: ingestion, vector search, retrieval, RAG and evaluation'],
  ['advanced', 'Production Architect', 'level-3', 'Advanced: agents, MCP, fine-tuning, security, LLMOps, inference and architecture'],
];
const LEVEL_TITLE: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

const levelGraduate = ([level, name, art, proves]: [Level, string, string, string]): Achievement => ({
  id: `level-${level}`,
  name,
  description: `Passed every topic exam in ${proves}.`,
  group: 'content',
  art,
  goal: (ctx) => ctx.topicsByLevel.get(level)?.length || 1,
  measure: (p, ctx) => examsPassed(p, ctx.topicsByLevel.get(level) ?? []),
  requirement: (goal) => `Pass all ${plural(goal, 'topic exam')} in the ${LEVEL_TITLE[level]} level`,
  unit: 'exams passed',
});

export const ACHIEVEMENTS: Achievement[] = [
  // ---- getting started ----
  {
    id: 'first-light',
    name: 'First Light',
    description: 'Marked your first Learn section as read.',
    group: 'start',
    art: 'sparkles',
    goal: 1,
    measure: sectionsRead,
    requirement: () => 'Mark any Learn section as read',
    unit: 'sections',
  },
  {
    id: 'hello-model',
    name: 'Hello, Model',
    description: 'Solved your first Try-it exercise or Code Lab challenge.',
    group: 'start',
    art: 'terminal',
    goal: 1,
    measure: (p, ctx) => exercisesSolved(p, ctx) + codeLabSolved(p, ctx),
    requirement: () => 'Mark any Try-it exercise or Code Lab challenge as solved',
    unit: 'solved',
  },
  {
    id: 'quick-study',
    name: 'Quick Study',
    description: 'Got your first section quick check right.',
    group: 'start',
    art: 'zap',
    goal: 1,
    measure: quickChecksRight,
    requirement: () => 'Answer any section quick check correctly',
    unit: 'right',
  },
  {
    id: 'signal-acquired',
    name: 'Signal Acquired',
    description: 'Passed your first full topic exam.',
    group: 'start',
    art: 'check',
    goal: 1,
    measure: (p, ctx) => examsPassed(p, ctx.topics),
    requirement: () => 'Pass any full-length topic exam',
    unit: 'exams passed',
  },

  // ---- lessons & phases ----
  {
    id: 'deep-reader',
    name: 'Deep Reader',
    description: 'Learn sections read across the course.',
    group: 'content',
    art: 'book',
    tiers: [
      { tier: 'bronze', goal: 10 },
      { tier: 'silver', goal: 50 },
      { tier: 'gold', goal: 120 },
      { tier: 'diamond', goal: (ctx) => ctx.totals.sections },
    ],
    measure: sectionsRead,
    requirement: (goal) => `Mark ${plural(goal, 'Learn section')} as read`,
    unit: 'sections',
  },
  {
    id: 'exam-ladder',
    name: 'Covered Ground',
    description: 'Topic exams passed. Diamond means every topic is covered.',
    group: 'content',
    art: 'cap',
    tiers: [
      { tier: 'bronze', goal: 5 },
      { tier: 'silver', goal: 15 },
      { tier: 'gold', goal: 30 },
      { tier: 'diamond', goal: (ctx) => ctx.topics.length },
    ],
    measure: (p, ctx) => examsPassed(p, ctx.topics),
    requirement: (goal, ctx) => (goal >= ctx.topics.length ? `Pass all ${goal} topic exams` : `Pass ${plural(goal, 'topic exam')}`),
    unit: 'exams passed',
  },
  {
    id: 'constellation',
    name: 'Constellation',
    description: 'Phases graduated: every topic exam in the phase passed.',
    group: 'content',
    art: 'stars',
    tiers: [
      { tier: 'bronze', goal: 1 },
      { tier: 'silver', goal: 4 },
      { tier: 'gold', goal: 8 },
      { tier: 'diamond', goal: phasesWithTopics },
    ],
    measure: phasesGraduated,
    requirement: (goal, ctx) =>
      goal >= phasesWithTopics(ctx) ? `Graduate all ${goal} phases` : `Pass every topic exam in ${plural(goal, 'phase')}`,
    unit: 'phases',
  },
  ...LEVEL_BADGES.map(levelGraduate),
  {
    id: 'full-spectrum',
    name: 'Full Spectrum',
    description: 'Topics finished 100%: every section, Code Lab challenge, interview question and drill, plus the exam.',
    group: 'content',
    art: 'rainbow',
    tiers: [
      { tier: 'bronze', goal: 1 },
      { tier: 'silver', goal: 5 },
      { tier: 'gold', goal: 15 },
    ],
    measure: (p, ctx) => ctx.topics.filter((t) => topicComplete(p, t)).length,
    requirement: (goal) => (goal === 1 ? 'Finish one topic 100%, every tab and the exam' : `Finish ${goal} topics 100%`),
    unit: 'topics',
  },

  // ---- practice ----
  {
    id: 'tinkerer',
    name: 'Tinkerer',
    description: 'Try-it exercises under Learn sections marked solved.',
    group: 'practice',
    art: 'flask',
    tiers: [
      { tier: 'bronze', goal: 5 },
      { tier: 'silver', goal: 25 },
      { tier: 'gold', goal: 75 },
      { tier: 'diamond', goal: (ctx) => ctx.totals.exercises },
    ],
    measure: exercisesSolved,
    requirement: (goal) => `Solve ${plural(goal, 'Try-it exercise')}`,
    unit: 'exercises',
  },
  {
    id: 'code-lab',
    name: 'Lab Regular',
    description: 'Code Lab challenges solved.',
    group: 'practice',
    art: 'code',
    tiers: [
      { tier: 'bronze', goal: 3 },
      { tier: 'silver', goal: 15 },
      { tier: 'gold', goal: 40 },
      { tier: 'diamond', goal: (ctx) => ctx.totals.codeLab },
    ],
    measure: codeLabSolved,
    requirement: (goal) => `Solve ${plural(goal, 'Code Lab challenge')}`,
    unit: 'challenges',
  },
  {
    id: 'napkin-math',
    name: 'Napkin Math',
    description: 'Estimation drills worked through to the answer.',
    group: 'practice',
    art: 'calculator',
    tiers: [
      { tier: 'bronze', goal: 3 },
      { tier: 'silver', goal: 15 },
      { tier: 'gold', goal: 40 },
      { tier: 'diamond', goal: (ctx) => ctx.totals.boe },
    ],
    measure: drillsDone,
    requirement: (goal) => `Work through ${plural(goal, 'estimation drill')}`,
    unit: 'drills',
  },
  {
    id: 'on-the-record',
    name: 'On the Record',
    description: 'Interview questions answered out loud and self-rated.',
    group: 'practice',
    art: 'message',
    tiers: [
      { tier: 'bronze', goal: 10 },
      { tier: 'silver', goal: 50 },
      { tier: 'gold', goal: 120 },
      { tier: 'diamond', goal: (ctx) => ctx.totals.iq },
    ],
    measure: (p, ctx) => interviewsRated(p, ctx),
    requirement: (goal) => `Practise and rate ${plural(goal, 'interview answer')}`,
    unit: 'answers',
  },
  {
    id: 'system-designer',
    name: 'System Designer',
    description: 'Architecture challenges completed as mock interviews.',
    group: 'practice',
    art: 'network',
    tiers: [
      { tier: 'bronze', goal: 1 },
      { tier: 'silver', goal: 4 },
      { tier: 'gold', goal: 8 },
      { tier: 'diamond', goal: (ctx) => ctx.challenges.length },
    ],
    measure: (p, ctx) => ctx.challenges.filter((id) => p.company[id]).length,
    requirement: (goal, ctx) =>
      goal >= ctx.challenges.length ? `Complete all ${goal} architecture challenges` : `Complete ${plural(goal, 'architecture challenge')}`,
    unit: 'challenges',
  },

  // ---- understanding ----
  {
    id: 'sharp-recall',
    name: 'Sharp Recall',
    description: 'Section quick checks answered correctly.',
    group: 'understanding',
    art: 'target',
    tiers: [
      { tier: 'bronze', goal: 10 },
      { tier: 'silver', goal: 50 },
      { tier: 'gold', goal: 120 },
      { tier: 'diamond', goal: (ctx) => ctx.totals.quickChecks },
    ],
    measure: quickChecksRight,
    requirement: (goal) => `Get ${plural(goal, 'quick check')} right`,
    unit: 'right',
  },
  {
    id: 'one-shot',
    name: 'One Shot',
    description: 'Topic exams passed on the very first attempt.',
    group: 'understanding',
    art: 'badge-check',
    tiers: [
      { tier: 'bronze', goal: 1 },
      { tier: 'silver', goal: 5 },
      { tier: 'gold', goal: 15 },
      // not "all": one failed exam would otherwise lock diamond forever
      { tier: 'diamond', goal: (ctx) => Math.min(30, ctx.topics.length) },
    ],
    measure: (p, ctx) => ctx.topics.filter((t) => failsBeforePass(p, t.id) === 0).length,
    requirement: (goal) => `Pass ${plural(goal, 'topic exam')} on the first attempt`,
    unit: 'first-try passes',
  },
  {
    id: 'flawless',
    name: 'Flawless',
    description: 'Topic exams with a perfect 100% score.',
    group: 'understanding',
    art: 'gem',
    tiers: [
      { tier: 'bronze', goal: 1 },
      { tier: 'silver', goal: 5 },
      { tier: 'gold', goal: 15 },
    ],
    measure: (p, ctx) => ctx.topics.filter((t) => (p.tests[t.id]?.best ?? 0) >= 100).length,
    requirement: (goal) => (goal === 1 ? 'Score 100% on a full topic exam' : `Score 100% on ${goal} different topic exams`),
    unit: 'perfect exams',
  },
  {
    id: 'nailed-it',
    name: 'Nailed It',
    description: 'Interview answers you rated “nailed it”.',
    group: 'understanding',
    art: 'mic',
    tiers: [
      { tier: 'bronze', goal: 10 },
      { tier: 'silver', goal: 40 },
      { tier: 'gold', goal: 100 },
      { tier: 'diamond', goal: 200 },
    ],
    measure: (p, ctx) => interviewsRated(p, ctx, 'nailed'),
    requirement: (goal) => `Rate ${plural(goal, 'interview answer')} “nailed it”`,
    unit: 'nailed',
  },
  {
    id: 'error-correction',
    name: 'Error Correction',
    description: 'Exam questions you once got wrong and now answer correctly: weak areas cleared.',
    group: 'understanding',
    art: 'eraser',
    tiers: [
      { tier: 'bronze', goal: 5 },
      { tier: 'silver', goal: 25 },
      { tier: 'gold', goal: 100 },
    ],
    measure: (p) => Object.values(p.mcq).filter((m) => m.wrong > 0 && m.lastCorrect).length,
    requirement: (goal) => `Fix ${plural(goal, 'exam question')} you had wrong (answer it right again)`,
    unit: 'fixed',
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    description: 'Passed a topic exam after failing it first.',
    group: 'understanding',
    art: 'refresh',
    goal: 1,
    measure: (p, ctx) => ctx.topics.filter((t) => (failsBeforePass(p, t.id) ?? 0) >= 1).length,
    requirement: () => 'Pass a topic exam you failed before',
    unit: 'comebacks',
  },

  // ---- consistency ----
  {
    id: 'steady-orbit',
    name: 'Steady Orbit',
    description: 'Days studied in a row (your longest streak).',
    group: 'consistency',
    art: 'flame',
    tiers: [
      { tier: 'bronze', goal: 3 },
      { tier: 'silver', goal: 7 },
      { tier: 'gold', goal: 30 },
      { tier: 'diamond', goal: 100 },
    ],
    measure: (p) => longestStreak(p.activityDays),
    requirement: (goal) => `Study ${goal} days in a row`,
    unit: 'days',
  },
  {
    id: 'regular',
    name: 'Regular',
    description: 'Days with any study activity, in total.',
    group: 'consistency',
    art: 'calendar',
    tiers: [
      { tier: 'bronze', goal: 5 },
      { tier: 'silver', goal: 20 },
      { tier: 'gold', goal: 50 },
      // activityDays keeps the last 120 days, so the top step stays below that cap
      { tier: 'diamond', goal: 100 },
    ],
    measure: (p) => new Set(p.activityDays ?? []).size,
    requirement: (goal) => `Study on ${plural(goal, 'different day')}`,
    unit: 'days',
  },

  // ---- fun ----
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Answered exam questions between midnight and 4 am.',
    group: 'fun',
    art: 'moon',
    goal: 1,
    measure: lateNightCount,
    requirement: () => 'Answer an exam between 00:00 and 03:59',
    unit: 'late answers',
  },
  {
    id: 'weekend-warrior',
    name: 'Weekend Warrior',
    description: 'Studied on both the Saturday and the Sunday of a weekend.',
    group: 'fun',
    art: 'coffee',
    goal: 1,
    measure: (p) => fullWeekends(p.activityDays),
    requirement: () => 'Study on a Saturday and the Sunday after it',
    unit: 'weekends',
  },
  {
    id: 'hat-trick',
    name: 'Hat Trick',
    description: 'Passed three different topic exams on the same day.',
    group: 'fun',
    art: 'rocket',
    goal: 3,
    measure: bestPassDay,
    requirement: () => 'Pass 3 topic exams on the same day',
    unit: 'passes in a day',
  },
];

export const achievementById: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENT_TOTAL = ACHIEVEMENTS.length;

const resolve = (goal: Goal | undefined, ctx: AchievementContext) => (typeof goal === 'function' ? goal(ctx) : (goal ?? 1));

/** The tier ladder of one achievement with goals resolved. */
export function tierLadder(a: Achievement, ctx: AchievementContext): TierStep[] {
  if (a.tiers) {
    const out: TierStep[] = [];
    for (const t of a.tiers) {
      const goal = resolve(t.goal, ctx);
      // a content-sized goal ("all") never sits at or below an earlier fixed step
      if (!out.length || goal > out[out.length - 1].goal) out.push({ tier: t.tier, goal });
    }
    return out;
  }
  return [{ tier: 'standard', goal: resolve(a.goal, ctx) }];
}

export function evaluateAchievement(a: Achievement, p: Progress, ctx: AchievementContext): AchievementEvaluation {
  const value = a.measure(p, ctx) || 0;
  const ladder = tierLadder(a, ctx).map((t) => ({ ...t, reached: value >= t.goal }));
  const reached = ladder.filter((t) => t.reached);
  const top = reached[reached.length - 1] ?? null;
  const next = ladder.find((t) => !t.reached) ?? null;
  return {
    id: a.id,
    value,
    tiers: ladder,
    tier: top?.tier ?? null,
    next: next && { tier: next.tier, goal: next.goal },
    fraction: next ? Math.min(1, value / next.goal) : 1,
    requirement: a.requirement((next ?? ladder[ladder.length - 1]).goal, ctx),
  };
}

/** Evaluate the whole catalogue: { [id]: evaluation }. */
export function evaluateAll(p: Progress, ctx: AchievementContext): Record<string, AchievementEvaluation> {
  const out: Record<string, AchievementEvaluation> = {};
  for (const a of ACHIEVEMENTS) out[a.id] = evaluateAchievement(a, p, ctx);
  return out;
}

/**
 * Compare evaluations with what is stored in progress.achievements and list what is newly earned.
 * Stored tiers are never revoked, downgraded or re-awarded.
 */
export function newlyEarned(evaluations: Record<string, AchievementEvaluation>, stored: Record<string, StoredAchievement> = {}): EarnedNow[] {
  const out: EarnedNow[] = [];
  for (const a of ACHIEVEMENTS) {
    const ev = evaluations[a.id];
    if (!ev?.tier) continue;
    const have = stored[a.id];
    const haveRank = have?.tier ? tierRank(have.tier) : -1;
    if (tierRank(ev.tier) <= haveRank) continue;
    const fresh = ev.tiers.filter((t) => t.reached && tierRank(t.tier) > haveRank).map((t) => t.tier);
    out.push({ id: a.id, tier: ev.tier, tiers: fresh });
  }
  return out;
}

/** Merge newly earned badges into the stored map (pure; never downgrades). */
export function mergeEarned(stored: Record<string, StoredAchievement> = {}, earned: EarnedNow[], at: number): Record<string, StoredAchievement> {
  const next = { ...stored };
  for (const e of earned) {
    const prev = next[e.id];
    if (prev?.tier && tierRank(prev.tier) >= tierRank(e.tier)) continue;
    const tiers = { ...(prev?.tiers ?? {}) };
    for (const t of e.tiers.length ? e.tiers : [e.tier]) if (!tiers[t]) tiers[t] = at;
    next[e.id] = { ...prev, tier: e.tier, earnedAt: at, tiers };
  }
  return next;
}

/** Stored entries as a list of earned badges, most recent first (unknown ids are ignored). */
export function earnedList(stored: Record<string, StoredAchievement> = {}) {
  return Object.entries(stored)
    .filter(([id, s]) => achievementById[id] && s?.tier)
    .map(([id, s]) => ({ id, ...s, achievement: achievementById[id] }))
    .sort((a, b) => (b.earnedAt || 0) - (a.earnedAt || 0) || tierRank(b.tier) - tierRank(a.tier) || ACHIEVEMENTS.indexOf(a.achievement) - ACHIEVEMENTS.indexOf(b.achievement));
}

/** The locked or still-climbing badge closest to its next step (highest fraction, ties → smaller gap). */
export function closestNext(evaluations: Record<string, AchievementEvaluation>) {
  let best: { achievement: Achievement; ev: AchievementEvaluation & { next: TierStep }; gap: number } | null = null;
  for (const a of ACHIEVEMENTS) {
    const ev = evaluations[a.id];
    if (!ev?.next) continue;
    const gap = ev.next.goal - ev.value;
    if (!best || ev.fraction > best.ev.fraction || (ev.fraction === best.ev.fraction && gap < best.gap)) {
      best = { achievement: a, ev: ev as AchievementEvaluation & { next: TierStep }, gap };
    }
  }
  return best;
}
