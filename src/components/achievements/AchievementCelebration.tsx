import { useEffect, useRef, type CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import Badge from './Badge';
import { tierName } from './achState';
import { achievementById, tierRank, TIER_LABEL, type EarnedTier } from '../../content/achievements';
import { useAchievementEvaluations } from '../../lib/achievements';
import { useProgress } from '../../lib/progress';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { achievementBurst } from '../../lib/celebrate';
import type { Unlocked } from '../../lib/useAchievements';

/** the glow token each tier adds to the confetti */
const TIER_TOKEN: Record<EarnedTier, string> = {
  standard: '--c-nebula',
  bronze: '--c-solar',
  silver: '--c-ion',
  gold: '--c-pulsar',
  diamond: '--c-ion',
};

/**
 * "Achievement unlocked" dialog. One item → the orb rises large inside orbiting aurora rings;
 * several → one combined grid ("3 new badges"). Focus-trapped; Escape, the close button, a backdrop
 * click or "Keep going" dismiss it. Reduced motion: no confetti, no orbit, no pop; it simply fades in.
 */
export default function AchievementCelebration({ items, onClose, onViewAll }: { items: Unlocked[]; onClose: () => void; onViewAll: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const p = useProgress();
  const evs = useAchievementEvaluations(p);
  useFocusTrap(ref, true, onClose);

  const list = items
    .flatMap((i) => (achievementById[i.id] ? [{ ...i, a: achievementById[i.id] }] : []))
    .sort((x, y) => tierRank(y.tier) - tierRank(x.tier));
  const single = list.length === 1;
  const first = list[0];
  const firstEv = first ? evs[first.id] : undefined;

  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    achievementBurst([...new Set(items.map((i) => TIER_TOKEN[i.tier]))], items.length > 1);
  }, [items]);

  if (!first) return null;
  const top = list[0].tier;

  return (
    <div className="modal-backdrop ach-cel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        ref={ref}
        className={`modal ach-cel ${single ? 'is-single' : 'is-many'} ach-cel-${top}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ach-cel-title"
        aria-describedby="ach-cel-desc"
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0.2 } : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      >
        <button type="button" className="btn-ghost btn-icon ach-cel-close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>

        {single ? (
          <div className="ach-cel-single">
            <div className="ach-cel-stage" aria-hidden="true">
              <span className="ach-cel-halo" />
              <span className="ach-cel-ring r1">
                <span className="orbit slow">
                  <span className="orbit-dot" />
                </span>
              </span>
              <span className="ach-cel-ring r2">
                <span className="orbit rev">
                  <span className="orbit-dot" />
                </span>
              </span>
              <motion.span
                className="ach-cel-orb"
                initial={reduce ? false : { scale: 0.4, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.12 }}
              >
                <Badge art={first.a.art} tier={first.tier} size="xl" />
              </motion.span>
            </div>
            <p className="ach-cel-kicker">
              <Sparkles size={14} aria-hidden="true" /> Achievement unlocked
            </p>
            <h2 className="ach-cel-title" id="ach-cel-title">
              <span className="gtext">{first.a.name}</span>
            </h2>
            <span className={`ach-tpill ach-${first.tier}`}>{TIER_LABEL[first.tier] ? `${TIER_LABEL[first.tier]} tier` : 'Earned'}</span>
            <p className="ach-cel-desc" id="ach-cel-desc">
              {first.a.description}
            </p>
            {firstEv && (firstEv.value > 1 || firstEv.next) && (
              <p className="ach-cel-stat">
                <b className="num">{firstEv.value}</b> {first.a.unit}
                {firstEv.next && (
                  <>
                    {' '}
                    · next: {firstEv.next.goal} for {TIER_LABEL[firstEv.next.tier] || 'the next step'}
                  </>
                )}
              </p>
            )}
          </div>
        ) : (
          <div className="ach-cel-multi">
            <p className="ach-cel-kicker">
              <Sparkles size={14} aria-hidden="true" /> Achievements unlocked
            </p>
            <h2 className="ach-cel-title" id="ach-cel-title">
              <span className="gtext">{list.length} new badges</span>
            </h2>
            <p className="ach-cel-desc" id="ach-cel-desc">
              Look at that. Here is everything your progress just unlocked.
            </p>
            <ul className="ach-cel-grid">
              {list.map((i, n) => (
                <motion.li
                  key={i.id}
                  style={{ '--i': n } as CSSProperties}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3, delay: reduce ? 0 : 0.08 + Math.min(n, 12) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Badge art={i.a.art} tier={i.tier} size="md" />
                  <b>{i.a.name}</b>
                  <span className={`ach-tpill ach-${i.tier}`}>{tierName(i.tier)}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        )}

        <div className="ach-cel-acts">
          <button type="button" className="btn" onClick={onViewAll}>
            View all achievements <ArrowRight size={15} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
            Keep going
          </button>
        </div>
      </motion.div>
    </div>
  );
}
