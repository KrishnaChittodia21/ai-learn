import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Badge from '../components/achievements/Badge';
import { cardState, meterText, tierName, unitFor, type CardState } from '../components/achievements/achState';
import { AchievementCard, AchMeter, TierLadder } from '../components/achievements/AchievementCard';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_TOTAL,
  closestNext,
  earnedList,
  GROUPS,
  TIER_LABEL,
  TIERS,
  tierRank,
  type Achievement,
  type AchievementEvaluation,
  type EarnedTier,
} from '../content/achievements';
import { badgeLabel, formatEarnedDate, shortEarnedDate, useAchievementEvaluations } from '../lib/achievements';
import { useProgress } from '../lib/progress';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'earned', label: 'Earned' },
  { id: 'prog', label: 'In progress' },
  { id: 'locked', label: 'Locked' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const isTiered = (ev: AchievementEvaluation) => ev.tiers.some((t) => t.tier !== 'standard');
const EMPTY: Record<Exclude<Filter, 'all'>, string> = {
  earned: 'No badges earned yet. Mark a Learn section as read, solve a Try-it exercise or pass an exam to earn your first.',
  prog: 'Nothing in progress right now: every badge you have started is already earned.',
  locked: 'Every badge has been started. Keep climbing the tiers.',
};

export default function AchievementsPage() {
  const p = useProgress();
  const evs = useAchievementEvaluations(p);
  const stored = useMemo(() => p.achievements ?? {}, [p.achievements]);
  const [filter, setFilter] = useState<Filter>('all');

  const state = (a: Achievement): CardState => cardState(stored[a.id], evs[a.id]);
  const counts = useMemo(() => {
    const c = { earned: 0, prog: 0, locked: 0 };
    ACHIEVEMENTS.forEach((a) => c[cardState(stored[a.id], evs[a.id])]++);
    return c;
  }, [stored, evs]);
  const visible = (a: Achievement) => filter === 'all' || state(a) === filter;

  const earned = earnedList(stored);
  const latest = earned[0];
  const next = closestNext(evs);
  const runners = useMemo(
    () =>
      ACHIEVEMENTS.filter((a) => evs[a.id]?.next && a.id !== next?.achievement.id && evs[a.id].value > 0)
        .sort((x, y) => evs[y.id].fraction - evs[x.id].fraction)
        .slice(0, 3),
    [evs, next],
  );

  // tier census: single-step badges earned, then how many tiered badges reached each tier
  const census = useMemo(() => {
    const single = ACHIEVEMENTS.filter((a) => !isTiered(evs[a.id]));
    const tiered = ACHIEVEMENTS.filter((a) => isTiered(evs[a.id]));
    const rows: { tier: EarnedTier; got: number; of: number }[] = [
      { tier: 'standard', got: single.filter((a) => stored[a.id]?.tier).length, of: single.length },
      ...TIERS.map((t) => {
        const has = tiered.filter((a) => evs[a.id].tiers.some((s) => s.tier === t));
        return { tier: t as EarnedTier, got: has.filter((a) => stored[a.id]?.tier && tierRank(stored[a.id].tier) >= tierRank(t)).length, of: has.length };
      }),
    ];
    let steps = 0;
    let stepsOf = 0;
    ACHIEVEMENTS.forEach((a) => {
      stepsOf += evs[a.id].tiers.length;
      const s = stored[a.id];
      steps += s?.tier ? evs[a.id].tiers.filter((t) => tierRank(t.tier) <= tierRank(s.tier)).length : 0;
    });
    return { rows, steps, stepsOf };
  }, [evs, stored]);

  const nextStored = next ? stored[next.achievement.id] : undefined;
  const nextPct = next ? Math.round(next.ev.fraction * 100) : 0;
  const groupEarned = (gid: string) => ACHIEVEMENTS.filter((a) => a.group === gid && stored[a.id]?.tier).length;
  const groupTotal = (gid: string) => ACHIEVEMENTS.filter((a) => a.group === gid).length;
  const jump = (gid: string) =>
    document
      .getElementById(`ach-g-${gid}`)
      ?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const shown = ACHIEVEMENTS.filter(visible).length;

  return (
    <div className="page ach-page">
      {/* ---------- header readout ---------- */}
      <header className="ach-head">
        <p className="ach-kicker rise d1">
          Achievements · {ACHIEVEMENT_TOTAL} badges · {GROUPS.length} groups · {TIERS.length} tiers
        </p>
        <h1 className="ach-title rise d2">
          <span className="gtext">Your trophy sky</span>
        </h1>
        <p className="ach-lead rise d3">
          Badges for the milestones along the way. Tiered ones climb from <b className="ach-to ach-bronze">bronze</b> through{' '}
          <b className="ach-to ach-silver">silver</b> and <b className="ach-to ach-gold">gold</b> to <b className="ach-to ach-diamond">diamond</b>,
          and an earned tier is never taken back.
        </p>
        <dl className="ach-readout glass rise d4">
          <div className="ach-ro">
            <dt className="lbl">Earned</dt>
            <dd>
              <span className="ach-ro-num num">
                {earned.length}
                <small>/{ACHIEVEMENT_TOTAL}</small>
              </span>
              <AchMeter value={earned.length} max={ACHIEVEMENT_TOTAL} label={`${earned.length} of ${ACHIEVEMENT_TOTAL} achievements earned`} />
            </dd>
          </div>
          <div className="ach-ro">
            <dt className="lbl">Tier steps</dt>
            <dd>
              <span className="ach-ro-num num">
                {census.steps}
                <small>/{census.stepsOf}</small>
              </span>
              <AchMeter value={census.steps} max={census.stepsOf} label={`${census.steps} of ${census.stepsOf} tier steps reached`} />
            </dd>
          </div>
          <div className="ach-ro ach-ro-census">
            <dt className="lbl">Tier census</dt>
            <dd>
              <ul className="ach-census" aria-label="Tier census">
                {census.rows.map((r) => (
                  <li key={r.tier} className={`ach-${r.tier}`} title={`${tierName(r.tier)}: ${r.got} of ${r.of}`}>
                    <i aria-hidden="true" />
                    <span className="ach-census-n num">
                      {r.got}
                      <small>/{r.of}</small>
                    </span>
                    <span className="ach-census-l">{r.tier === 'standard' ? 'Single' : TIER_LABEL[r.tier]}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
          <div className="ach-ro ach-ro-latest">
            <dt className="lbl">Latest unlock</dt>
            <dd>
              {latest ? (
                <span className="ach-latest">
                  <Badge art={latest.achievement.art} tier={latest.tier} size="sm" />
                  <span>
                    <b>{latest.achievement.name}</b>
                    <span className="ach-date">
                      {tierName(latest.tier)} · {shortEarnedDate(latest.earnedAt)}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="ach-none">Nothing yet. Your first badge is one section away.</span>
              )}
            </dd>
          </div>
        </dl>
      </header>

      <div className="ach-top">
        {/* ---------- closest next: the one spinning-border card on this screen ---------- */}
        <div className="gborder ach-next-border rise d3">
          <section className="gborder-in ach-next" aria-labelledby="ach-next-t">
            {next ? (
              <>
                <div className="ach-next-head">
                  <span className="lbl">Closest next badge</span>
                  <span className="badge badge-ion">{nextPct}% there</span>
                </div>
                <div className="ach-next-hero">
                  <Badge
                    art={next.achievement.art}
                    tier={nextStored?.tier ?? 'standard'}
                    locked={!nextStored?.tier}
                    size="lg"
                    label={badgeLabel(next.achievement, nextStored, next.ev)}
                  />
                  {next.ev.next.tier !== 'standard' && (
                    <>
                      <ArrowRight className="ach-next-arrow" size={22} aria-hidden="true" />
                      <span className="ach-next-ghost" aria-hidden="true">
                        <Badge art={next.achievement.art} tier={next.ev.next.tier} size="md" />
                      </span>
                    </>
                  )}
                  <div className="ach-next-copy">
                    <h2 id="ach-next-t" className="ach-next-name">
                      {next.achievement.name}
                      {TIER_LABEL[next.ev.next.tier] && <span className={`ach-tpill ach-${next.ev.next.tier}`}>{TIER_LABEL[next.ev.next.tier]}</span>}
                    </h2>
                    <p className="ach-next-req">{next.ev.requirement}</p>
                  </div>
                </div>
                <div className="ach-card-meter">
                  <span className="ach-num">
                    <b className="num">{Math.min(next.ev.value, next.ev.next.goal)}</b> / {next.ev.next.goal} {unitFor(next.achievement.unit, next.ev.next.goal)}
                    {TIER_LABEL[next.ev.next.tier] && <span className={`ach-to ach-${next.ev.next.tier}`}> → {TIER_LABEL[next.ev.next.tier]}</span>}
                  </span>
                  <AchMeter value={next.ev.value} max={next.ev.next.goal} tier={next.ev.next.tier} label={`${next.achievement.name}: ${meterText(next.ev, next.achievement.unit)}`} />
                </div>
                <TierLadder ev={next.ev} stored={nextStored} />
                <p className="ach-next-tip">
                  <b>
                    {next.gap} more{next.gap === 1 ? '' : ` ${next.achievement.unit}`}
                  </b>{' '}
                  to {TIER_LABEL[next.ev.next.tier] ? `reach ${TIER_LABEL[next.ev.next.tier]}` : 'earn it'}.
                </p>
                {runners.length > 0 && (
                  <div className="ach-runners">
                    <span className="lbl">Also within reach</span>
                    <ul>
                      {runners.map((a) => {
                        const ev = evs[a.id];
                        const s = stored[a.id];
                        return (
                          <li key={a.id}>
                            <Badge art={a.art} tier={s?.tier ?? 'standard'} locked={!s?.tier} size="xs" />
                            <span className="ach-runner-n">{a.name}</span>
                            <span className="ach-runner-v mono">
                              {Math.min(ev.value, ev.next!.goal)}/{ev.next!.goal}
                              {TIER_LABEL[ev.next!.tier] ? ` → ${TIER_LABEL[ev.next!.tier]}` : ''}
                            </span>
                            <AchMeter value={ev.value} max={ev.next!.goal} tier={ev.next!.tier} label={`${a.name}: ${meterText(ev, a.unit)}`} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ach-next-head">
                  <span className="lbl">Closest next badge</span>
                  <span className="badge badge-good">Complete</span>
                </div>
                <h2 id="ach-next-t" className="ach-next-name">
                  Every tier earned.
                </h2>
                <p className="ach-next-req">Nothing left to unlock. The whole sky is lit.</p>
              </>
            )}
          </section>
        </div>

        {/* ---------- recently unlocked ---------- */}
        <section className="card ach-recent rise d4" aria-labelledby="ach-recent-t">
          <div className="ach-sec-head">
            <h2 id="ach-recent-t" className="ach-h2">
              Recently unlocked
            </h2>
            <span className="lbl">Newest first</span>
          </div>
          {earned.length ? (
            <ol className="ach-recent-list">
              {earned.slice(0, 6).map((e, i) => (
                <li key={e.id} className={i === 0 ? 'is-new' : undefined}>
                  <Badge art={e.achievement.art} tier={e.tier} size="sm" />
                  <span className="ach-recent-b">
                    <b>{e.achievement.name}</b>
                    <span className="ach-date">
                      {evs[e.id]?.value ?? 0} {unitFor(e.achievement.unit, evs[e.id]?.value ?? 0)}
                    </span>
                  </span>
                  <span className={`ach-tpill ach-${e.tier}`}>{tierName(e.tier)}</span>
                  <time className="ach-recent-when" dateTime={new Date(e.earnedAt).toISOString()} title={formatEarnedDate(e.earnedAt)}>
                    {shortEarnedDate(e.earnedAt)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ach-none">No badges yet. Mark a Learn section as read, solve a Try-it exercise or pass an exam to earn your first one.</p>
          )}
        </section>
      </div>

      {/* ---------- filters ---------- */}
      <div className="ach-filters" role="toolbar" aria-label="Filter achievements">
        <div className="ach-filter-set">
          <span className="lbl">Show</span>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`chip${filter === f.id ? ' on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="ach-chip-n mono">{f.id === 'all' ? ACHIEVEMENT_TOTAL : counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="ach-filter-set">
          <span className="lbl">Jump to</span>
          {GROUPS.map((g) => (
            <button key={g.id} type="button" className="chip ach-jump" onClick={() => jump(g.id)}>
              {g.title}
              <span className="ach-chip-n mono">
                {groupEarned(g.id)}/{groupTotal(g.id)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {filter === 'all' ? '' : `Showing ${shown} ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} achievements`}
      </p>

      {GROUPS.map((g, gi) => {
        const all = ACHIEVEMENTS.filter((a) => a.group === g.id);
        const list = all.filter(visible);
        if (!list.length) return null;
        const got = all.filter((a) => stored[a.id]?.tier).length;
        return (
          <section key={g.id} className="ach-group" id={`ach-g-${g.id}`} aria-labelledby={`ach-g-${g.id}-t`}>
            <header className="ach-group-head">
              <span className="ach-group-no mono">{pad2(gi + 1)}</span>
              <div className="ach-group-text">
                <h2 className="ach-h2" id={`ach-g-${g.id}-t`}>
                  {g.title}
                </h2>
                <p>{g.blurb}</p>
              </div>
              <div className="ach-group-count">
                <span>
                  <b className="num">{got}</b> / {all.length} earned
                </span>
                <AchMeter value={got} max={all.length} label={`${g.title}: ${got} of ${all.length} earned`} />
              </div>
            </header>
            <ul className="ach-grid">
              {list.map((a, i) => (
                <AchievementCard key={a.id} achievement={a} stored={stored[a.id]} ev={evs[a.id]} index={i} />
              ))}
            </ul>
          </section>
        );
      })}
      {filter !== 'all' && counts[filter] === 0 && <p className="card ach-empty">{EMPTY[filter]}</p>}
    </div>
  );
}
