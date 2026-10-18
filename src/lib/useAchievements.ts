import { useCallback, useEffect, useRef, useState } from 'react';
import { evaluateAll, newlyEarned, tierRank, type EarnedTier } from '../content/achievements';
import { achievementCtx } from './achievements';
import { backfillAchievements, earnAchievements, type Progress } from './progress';
import { showToast } from './toast';

// wait for a burst of updates (an exam's answers + result, a reset) to settle before evaluating
const SETTLE_MS = 600;

export interface Unlocked {
  id: string;
  tier: EarnedTier;
}

/**
 * Achievement detection, used once in Layout. After progress changes it evaluates the catalogue,
 * stores newly earned badges / tier-ups and queues them for the celebration overlay. Everything found
 * in one evaluation lands in the queue together and is shown as ONE celebration; anything already
 * stored is never celebrated again, and stored badges are never revoked.
 *
 * First load for an existing learner: a save from before achievements existed has no
 * `progress.achievements` key. Its first evaluation is a quiet backfill: everything that progress
 * already earned is stored (stamped now) and announced with one calm toast, with no overlay and no
 * confetti, so nobody is ambushed by a 20-badge burst on opening the app. Brand-new learners start
 * with an empty map, so their very first badge is celebrated; after "Reset progress" the map is empty
 * again and badges can be re-earned (and celebrated).
 */
export function useAchievementDetection(p: Progress) {
  const [queue, setQueue] = useState<Unlocked[]>([]);
  // `${id}:${tier}` already stored in this session (guards StrictMode's double effects and the
  // window before the store's update comes back round)
  const sent = useRef(new Set<string>());
  const backfilled = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const earned = newlyEarned(evaluateAll(p, achievementCtx), p.achievements);
      if (p.achievements === undefined) {
        if (backfilled.current) return;
        backfilled.current = true;
        for (const e of earned) sent.current.add(`${e.id}:${e.tier}`);
        backfillAchievements(earned);
        if (earned.length) {
          showToast(
            `Achievements are here: ${earned.length} already earned`,
            'Your progress so far earned these badges. Find them under Achievements.',
            7000,
            'good',
          );
        }
        return;
      }
      const fresh = earned.filter((e) => !sent.current.has(`${e.id}:${e.tier}`));
      if (!fresh.length) return;
      for (const e of fresh) sent.current.add(`${e.id}:${e.tier}`);
      earnAchievements(fresh);
      setQueue((q) => {
        const next = [...q];
        for (const e of fresh) {
          const i = next.findIndex((x) => x.id === e.id);
          if (i === -1) next.push({ id: e.id, tier: e.tier });
          else if (tierRank(e.tier) > tierRank(next[i].tier)) next[i] = { id: e.id, tier: e.tier };
        }
        return next;
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [p]);

  // a reset wipes the stored badges, so they may be earned (and celebrated) again
  useEffect(() => {
    if (p.achievements && !Object.keys(p.achievements).length) sent.current.clear();
  }, [p.achievements]);

  const dismiss = useCallback(() => setQueue([]), []);
  return { queue, dismiss };
}
