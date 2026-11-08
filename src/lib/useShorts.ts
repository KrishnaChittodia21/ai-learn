// The Shorts catalog (built from the topics) and the learner's view of it: which are open, today's pick, what unlocks next.
import { TOPICS } from '../content';
import { localDay, useProgress } from './progress';
import { shortOfTheDay, shortsFrom, unlockedShorts, unlockedToday } from './shorts';

export const SHORTS = shortsFrom(TOPICS);
export const SHORT_BY_ID = new Map(SHORTS.map((e) => [e.short.id, e]));

export function useShorts() {
  const p = useProgress();
  const today = localDay();
  const open = unlockedShorts(SHORTS, p, today);
  const sotd = shortOfTheDay(SHORTS, p.shorts, today);
  const fresh = unlockedToday(SHORTS, p, today);
  return {
    p,
    open,
    sotd,
    /** unlocked by today's study and not watched yet */
    newToday: fresh && !p.shorts?.[fresh.short.id]?.watchedAt ? fresh.short.id : undefined,
    /** the next Short a study day will unlock */
    nextLocked: SHORTS.find((e) => !open.has(e.short.id)),
    studiedToday: !!p.activityDays?.includes(today),
    watched: (id: string) => !!p.shorts?.[id]?.watchedAt,
  };
}
