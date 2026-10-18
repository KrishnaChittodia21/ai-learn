// App wiring for the pure achievements catalogue (src/content/achievements.ts): the real content as
// its context, a memoised evaluation hook for pages, and small label helpers.
import { useMemo } from 'react';
import { buildAchievementContext, evaluateAll, TIER_LABEL, type Achievement, type AchievementEvaluation, type StoredAchievement } from '../content/achievements';
import { COMPANY_QUESTIONS, PHASES, TOPICS } from '../content';
import type { Progress } from './progress';

export const achievementCtx = buildAchievementContext({ topics: TOPICS, phases: PHASES, challenges: COMPANY_QUESTIONS });

/** { [id]: evaluation } for the current progress (memoised on the progress object). */
export function useAchievementEvaluations(p: Progress) {
  return useMemo(() => evaluateAll(p, achievementCtx), [p]);
}

export const formatEarnedDate = (ts?: number) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** "Today" / "12 Oct" */
export function shortEarnedDate(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Accessible one-line description: "Deep Reader — gold, earned 12 Oct 2026" / "Deep Reader. Locked: mark 10 Learn sections as read". */
export function badgeLabel(a: Achievement, stored?: StoredAchievement, ev?: AchievementEvaluation) {
  if (stored?.tier) {
    const tier = TIER_LABEL[stored.tier] ? `${TIER_LABEL[stored.tier].toLowerCase()}, ` : '';
    return `${a.name} — ${tier}earned ${formatEarnedDate(stored.earnedAt)}`;
  }
  const req = ev?.requirement ?? '';
  return `${a.name}. Locked: ${req.charAt(0).toLowerCase()}${req.slice(1)}`;
}
