import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Badge from './Badge';
import { AchMeter } from './AchievementCard';
import { meterText, tierName, unitFor } from './achState';
import { ACHIEVEMENT_TOTAL, closestNext, earnedList, TIER_LABEL, TIERS, tierRank } from '../../content/achievements';
import { badgeLabel, shortEarnedDate, useAchievementEvaluations } from '../../lib/achievements';
import type { Progress } from '../../lib/progress';

const SHOW = 6;

/**
 * Today screen: the trophy shelf. Earned count with a tier census, the latest medals, and the closest
 * next badge with its meter, in one card laid out by achievements.css (`.today .ach-shelf`).
 */
export function AchievementsSummary({ p }: { p: Progress }) {
  const evs = useAchievementEvaluations(p);
  const earned = earnedList(p.achievements);
  const next = closestNext(evs);
  const nextStored = next ? p.achievements?.[next.achievement.id] : undefined;
  const census = TIERS.map((t) => ({ t, n: earned.filter((e) => e.tier !== 'standard' && tierRank(e.tier) >= tierRank(t)).length }));

  return (
    <section className="card ach-shelf" aria-labelledby="ach-shelf-title">
      <div className="td-head">
        <h2 id="ach-shelf-title" className="td-h2">
          Trophy shelf
        </h2>
        <Link className="ach-shelf-link" to="/achievements">
          All achievements <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="ach-shelf-grid">
        <div className="ach-shelf-count">
          <div className="lbl">Earned</div>
          <div className="ach-shelf-num num">
            {earned.length}
            <span>/{ACHIEVEMENT_TOTAL}</span>
          </div>
          <AchMeter value={earned.length} max={ACHIEVEMENT_TOTAL} label={`${earned.length} of ${ACHIEVEMENT_TOTAL} achievements earned`} />
          <ul className="ach-census-mini" aria-label="Tiered badges reaching each tier">
            {census.map(({ t, n }) => (
              <li key={t} className={`ach-${t}`} title={`${n} at ${TIER_LABEL[t]} or above`}>
                <i aria-hidden="true" />
                <span className="sr-only">{TIER_LABEL[t]}: </span>
                {n}
              </li>
            ))}
          </ul>
        </div>

        <div className="ach-shelf-latest">
          <div className="lbl">Latest medals</div>
          {earned.length ? (
            <ul className="ach-shelf-row" aria-label="Most recent achievements">
              {earned.slice(0, SHOW).map((e) => (
                <li key={e.id}>
                  <Link to="/achievements" aria-label={badgeLabel(e.achievement, e)} title={`${e.achievement.name} · ${tierName(e.tier)}`}>
                    <Badge art={e.achievement.art} tier={e.tier} size="sm" />
                    <span className="ach-shelf-nm" aria-hidden="true">
                      {e.achievement.name}
                    </span>
                    <span className="ach-shelf-dt" aria-hidden="true">
                      {shortEarnedDate(e.earnedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ach-shelf-empty">
              No medals yet. Mark a Learn section as read, solve a Try-it exercise or pass an exam to earn your first. Tiered badges climb
              from bronze to diamond.
            </p>
          )}
        </div>

        {next && (
          <Link className="ach-shelf-next" to="/achievements" aria-label={`Closest next badge: ${next.achievement.name}, ${meterText(next.ev, next.achievement.unit)}`}>
            <div className="lbl">Closest next</div>
            <div className="ach-shelf-next-row">
              <Badge art={next.achievement.art} tier={nextStored?.tier ?? 'standard'} locked={!nextStored?.tier} size="md" />
              <div className="ach-shelf-next-b">
                <b>
                  {next.achievement.name}
                  {TIER_LABEL[next.ev.next.tier] && <span className={`ach-to ach-${next.ev.next.tier}`}> → {TIER_LABEL[next.ev.next.tier]}</span>}
                </b>
                <span className="ach-shelf-req">{next.ev.requirement}</span>
              </div>
            </div>
            <span className="ach-num">
              <b className="num">{Math.min(next.ev.value, next.ev.next.goal)}</b> / {next.ev.next.goal} {unitFor(next.achievement.unit, next.ev.next.goal)}
            </span>
            <AchMeter value={next.ev.value} max={next.ev.next.goal} tier={next.ev.next.tier} label={`${next.achievement.name}: ${meterText(next.ev, next.achievement.unit)}`} />
          </Link>
        )}
      </div>
    </section>
  );
}
