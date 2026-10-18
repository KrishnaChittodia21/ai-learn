import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import Badge from './Badge';
import { cardState, meterText, tierName, unitFor } from './achState';
import { TIER_LABEL, tierRank, type Achievement, type AchievementEvaluation, type EarnedTier, type StoredAchievement } from '../../content/achievements';
import { badgeLabel, formatEarnedDate, shortEarnedDate } from '../../lib/achievements';

/** Progress toward a badge's next step: a thin glowing bar exposed as a labelled progressbar. */
export function AchMeter({ value, max, label, tier }: { value: number; max: number; label: string; tier?: string }) {
  const v = Math.min(value, max);
  const pct = max ? (v / max) * 100 : 0;
  return (
    <div className={`ach-meter ${tier ? `ach-to-${tier}` : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={v} aria-label={label}>
      <span style={{ width: `${Math.max(v ? 3 : 0, pct)}%` }} />
    </div>
  );
}

/** Tier ladder (bronze → diamond) with each tier's goal; reached tiers lit, the next one ringed. */
export function TierLadder({ ev, stored }: { ev: AchievementEvaluation; stored?: StoredAchievement }) {
  const steps = ev.tiers.filter((t) => t.tier !== 'standard');
  if (!steps.length) return null;
  return (
    <ol className="ach-ladder" aria-label="Tiers">
      {steps.map((t) => {
        const got = (!!stored?.tier && tierRank(stored.tier) >= tierRank(t.tier)) || t.reached;
        const nx = !got && ev.next?.tier === t.tier;
        const when = got ? stored?.tiers?.[t.tier] : undefined;
        return (
          <li
            key={t.tier}
            className={`ach-step ach-${t.tier}${got ? ' got' : ''}${nx ? ' nx' : ''}`}
            title={`${TIER_LABEL[t.tier]}: ${t.goal}${when ? ` · earned ${formatEarnedDate(when)}` : ''}`}
          >
            <i aria-hidden="true" />
            <b>{t.goal}</b>
            <small>
              {TIER_LABEL[t.tier]}
              <span className="sr-only">{got ? ', earned' : nx ? ', next' : ''}</span>
            </small>
          </li>
        );
      })}
    </ol>
  );
}

/** The tier / status pill: "Gold" · "Earned" · "In progress" · "Locked". */
export function TierPill({ tier, state }: { tier?: EarnedTier; state: 'earned' | 'prog' | 'locked' }) {
  if (state === 'earned' && tier) return <span className={`ach-tpill ach-${tier}`}>{tierName(tier)}</span>;
  if (state === 'prog') return <span className="ach-tpill ach-prog">In progress</span>;
  return <span className="ach-tpill ach-locked">Locked</span>;
}

/** One badge card: orb, name, tier pill + date, description / requirement, ladder, progress meter. */
export function AchievementCard({
  achievement: a,
  stored,
  ev,
  index = 0,
}: {
  achievement: Achievement;
  stored?: StoredAchievement;
  ev: AchievementEvaluation;
  index?: number;
}) {
  const state = cardState(stored, ev);
  const earned = state === 'earned';
  const label = badgeLabel(a, stored, ev);
  const tiered = ev.tiers.some((t) => t.tier !== 'standard');
  return (
    <li className="ach-li" data-state={state}>
      <article className={`ach-card is-${state} rise`} style={{ '--i': Math.min(index, 6) } as CSSProperties} aria-label={label}>
        <div className="ach-card-top">
          <Badge art={a.art} tier={stored?.tier ?? 'standard'} locked={!earned} size="md" />
          <div className="ach-card-id">
            <h3 className="ach-card-name">{a.name}</h3>
            <div className="ach-card-meta">
              <TierPill tier={stored?.tier} state={state} />
              {earned && stored && <span className="ach-date">{shortEarnedDate(stored.earnedAt)}</span>}
            </div>
          </div>
        </div>
        {earned ? (
          <p className="ach-card-desc">{a.description}</p>
        ) : (
          <p className="ach-card-desc ach-req">
            <span className="lbl">Requirement</span>
            {ev.requirement}
          </p>
        )}
        {tiered && <TierLadder ev={ev} stored={stored} />}
        {ev.next ? (
          <div className="ach-card-meter">
            <span className="ach-num">
              <b className="num">{Math.min(ev.value, ev.next.goal)}</b> / {ev.next.goal} {unitFor(a.unit, ev.next.goal)}
              {TIER_LABEL[ev.next.tier] && <span className={`ach-to ach-${ev.next.tier}`}> → {TIER_LABEL[ev.next.tier]}</span>}
            </span>
            <AchMeter value={ev.value} max={ev.next.goal} tier={ev.next.tier} label={`${a.name}: ${meterText(ev, a.unit)}`} />
          </div>
        ) : (
          <div className="ach-card-done">
            <Check size={14} strokeWidth={2.6} aria-hidden="true" />
            <span>
              {ev.value} {unitFor(a.unit, ev.value)}
              {tiered ? ' · top tier reached' : ''}
            </span>
          </div>
        )}
      </article>
    </li>
  );
}
