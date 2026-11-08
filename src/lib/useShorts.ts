// The Shorts catalog (built from the topics) and the learner's view of it: today's pick and what's watched.
// Every Short is open: progress lives in this browser only, so a daily unlock gated nothing worth gating.
import { TOPICS } from '../content';
import { localDay, useProgress } from './progress';
import { shortOfTheDay, shortsFrom } from './shorts';

export const SHORTS = shortsFrom(TOPICS);
export const SHORT_BY_ID = new Map(SHORTS.map((e) => [e.short.id, e]));

export function useShorts() {
  const p = useProgress();
  return {
    p,
    sotd: shortOfTheDay(SHORTS, p.shorts, localDay()),
    watched: (id: string) => !!p.shorts?.[id]?.watchedAt,
  };
}
