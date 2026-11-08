// Plan your journey (M6): pace calculator, the learning curve ("training run") and a dated checkpoint per phase.
// Pace maths: src/lib/pace.ts. Design: ai-learn-designs/plan-journey/option-1-learning-curve.html
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { LEVELS, PHASES, TOPICS } from '../content';
import { ROLES } from '../content/roles';
import { localDay, setStudyPlan, useProgress, type StudyPlan } from '../lib/progress';
import {
  addDays,
  computePace,
  coveredMinutes,
  DAILY_MAX,
  DAILY_MIN,
  DAYS_PER_WEEK,
  fmtDay,
  hm,
  newPlan,
  rebase,
  repace,
  studyDaysBetween,
  weekday,
  withCatchUp,
  type Pace,
} from '../lib/pace';
import { LearningCurve } from '../components/LearningCurve';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pad2 = (n: number) => String(n).padStart(2, '0');

export default function PlanPage() {
  const p = useProgress();
  const today = localDay();
  const saved = p.studyPlan;
  // before a plan is started the inputs edit a draft, so trying numbers doesn't create a plan
  const [draft, setDraft] = useState<StudyPlan>(() => newPlan(coveredMinutes(p, TOPICS), today));
  const plan = saved ?? draft;
  const m = computePace(plan, p, TOPICS, PHASES, today);

  // a new pace applies from today: the pacer keeps its position, so a gap stays. Only "Move my finish date" resets it.
  const change = (next: Partial<StudyPlan>, newPace: boolean) => {
    const merged = { ...plan, ...next };
    if (!saved) return setDraft(merged);
    setStudyPlan(newPace ? repace(merged, m.expected, today) : merged);
  };
  const start = () => setStudyPlan(rebase({ ...plan, startedAt: today }, m.covered, today));
  const fill = ((plan.dailyMinutes - DAILY_MIN) / (DAILY_MAX - DAILY_MIN)) * 100;
  const daysLeft = m.finish ? studyDaysBetween(today, addDays(m.finish, 1), plan.daysPerWeek) : 0;
  const epoch = m.current < 0 ? m.checkpoints.length : m.current + 1;

  return (
    <div className="page pj-page">
      <header className="pj-head">
        <div>
          <span className="eyebrow">Plan your journey</span>
          <h1>
            Your <span className="gtext">training run</span>
          </h1>
          <p className="lede">Every study day trains your curve. The dashed pacer is the schedule; stay on or above it and every checkpoint lands on its date.</p>
        </div>
        <span className="pj-goal-chip">
          Goal <b>{m.label}</b>
        </span>
      </header>

      <div className="pj-grid">
        <section className="pj-hero card glass" aria-labelledby="pj-hero-h" data-guide="plan-curve">
          <div className="lc-top">
            <div>
              <span className="eyebrow">Training run · learning curve</span>
              <h2 id="pj-hero-h" className="lc-h">
                % of your goal covered, day by day
              </h2>
            </div>
            <Readout m={m} epoch={epoch} started={!!saved} />
          </div>
          <LearningCurve m={m} />
          <ul className="legend lc-legend" aria-hidden>
            <li>
              <i className="lg-you" />
              You
            </li>
            <li>
              <i className="lg-pac" />
              Pacer (the schedule)
            </li>
            <li>
              <i className="lg-proj" />
              Projected
            </li>
            <li>
              <b className="sw ahead" />
              ahead
            </li>
            <li>
              <b className="sw behind" />
              behind
            </li>
            <li>
              <span className="lg-cp">◆</span> covered · ◇ ahead
            </li>
          </ul>
        </section>

        <div className="pj-warn-slot" aria-live="polite" data-guide="plan-status">
          <Status m={m} plan={plan} saved={saved} today={today} />
        </div>

        <section className="pj-table-card card glass" aria-labelledby="pj-tbl-h" data-guide="plan-checkpoints">
          <div className="card-h">
            <h2 id="pj-tbl-h">Checkpoints &amp; dates</h2>
            <span className="eyebrow">one per phase</span>
          </div>
          <Checkpoints m={m} />
          <p className="pj-note">
            Covered counts each topic&rsquo;s minutes by how complete it is (sections read, practice and the exam); Shorts don&rsquo;t count. A new pace applies from
            today and keeps any gap; &ldquo;Move my finish date&rdquo; restarts the pacer from where you are, so earlier misses stop counting.{' '}
            <Link to="/contents">See every topic</Link>
          </p>
        </section>

        <aside className="pj-side" aria-label="Your plan">
          <section className="card glass" aria-labelledby="pj-pace-h" data-guide="plan-pace">
            <div className="card-h">
              <h2 id="pj-pace-h">Your pace</h2>
            </div>
            <label className="pj-field">
              <span className="pj-k">Time I can study per day</span>
              <span className="pj-mins">
                <b>{plan.dailyMinutes}</b> minutes
              </span>
              <input
                type="range"
                className="pj-range"
                min={DAILY_MIN}
                max={DAILY_MAX}
                step={5}
                value={plan.dailyMinutes}
                style={{ '--p': `${fill}%` } as CSSProperties}
                aria-describedby="pj-range-ends"
                onChange={(e) => change({ dailyMinutes: Number(e.target.value) }, true)}
              />
              <span className="pj-range-ends" id="pj-range-ends">
                <span>15 min</span>
                <span>3 h</span>
              </span>
            </label>
            <div className="pj-field">
              <span className="pj-k" id="pj-dpw">
                Days a week
              </span>
              <div className="pj-chips" role="radiogroup" aria-labelledby="pj-dpw">
                {DAYS_PER_WEEK.map((n) => (
                  <label key={n}>
                    <input type="radio" name="pj-dpw" value={n} checked={plan.daysPerWeek === n} onChange={() => change({ daysPerWeek: n }, true)} />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="pj-field">
              <span className="pj-k">Goal</span>
              <select className="pj-select" value={plan.goal} onChange={(e) => change({ goal: e.target.value }, false)}>
                <option value="all">The whole course</option>
                <optgroup label="Learning path">
                  {ROLES.map((r) => (
                    <option key={r.id} value={`role:${r.id}`}>
                      {r.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Level">
                  {LEVELS.map((l) => (
                    <option key={l.id} value={`level:${l.id}`}>
                      {l.title} level
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Phase">
                  {PHASES.map((ph) => (
                    <option key={ph.id} value={`phase:${ph.id}`}>
                      {ph.number}. {ph.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Topic">
                  {TOPICS.map((t) => (
                    <option key={t.id} value={`topic:${t.id}`}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <div className="pj-result" aria-live="polite">
              <span className="pj-k">Finish date</span>
              <div className="pj-big">
                {m.finish ? (
                  <>
                    by <span className="gtext">{fmtDay(m.finish, true)}</span>
                  </>
                ) : (
                  'Goal reached'
                )}
              </div>
              <p className="pj-sub">
                {m.finish ? `${hm(m.remaining)} left of ${hm(m.goalMinutes)} · ${hm(plan.dailyMinutes * plan.daysPerWeek)} a week` : 'Every checkpoint is covered.'}
              </p>
              <div className="pj-stats">
                <div className="pj-stat">
                  <b>{Math.round((m.you / Math.max(1, m.goalMinutes)) * 100)}%</b>
                  <span>covered</span>
                </div>
                <div className="pj-stat">
                  <b>
                    {epoch}/{m.checkpoints.length}
                  </b>
                  <span>checkpoint</span>
                </div>
                <div className="pj-stat">
                  <b>{daysLeft}</b>
                  <span>study days left</span>
                </div>
              </div>
            </div>
            {saved ? (
              <>
                <label className="pj-switch">
                  <input type="checkbox" role="switch" checked={!saved.warningsOff} onChange={(e) => setStudyPlan({ ...saved, warningsOff: !e.target.checked })} />
                  <span>{saved.warningsOff ? 'Behind-schedule warnings are off' : 'Behind-schedule warnings are on'}</span>
                </label>
                <button type="button" className="btn-ghost btn-sm pj-remove" onClick={() => setStudyPlan(undefined)}>
                  <Trash2 size={14} aria-hidden /> Remove plan
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary pj-start" onClick={start}>
                Start this plan
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Readout({ m, epoch, started }: { m: Pace; epoch: number; started: boolean }) {
  const delta =
    !started || m.fresh
      ? 'day 1'
      : m.state === 'done'
        ? 'goal reached'
        : m.state === 'ahead'
          ? `+${plural(m.daysDelta, 'day')} ahead`
          : m.state === 'behind'
            ? `${plural(Math.max(1, m.daysDelta), 'day')} behind`
            : 'on pace';
  return (
    <div className="pj-readout" aria-live="polite">
      <span>
        epoch{' '}
        <b>
          {epoch}/{m.checkpoints.length}
        </b>
      </span>
      <span aria-hidden>·</span>
      <span>
        ETA <b>{m.finish ? fmtDay(m.finish) : '—'}</b>
      </span>
      <span aria-hidden>·</span>
      <span className={started ? m.state : ''}>{delta}</span>
    </div>
  );
}

function Status({ m, plan, saved, today }: { m: Pace; plan: StudyPlan; saved?: StudyPlan; today: string }) {
  const box = (cls: string, ic: string, h: string, body: ReactNode, acts?: ReactNode) => (
    <section className={`pj-warn ${cls}`} role="status">
      <span className="pj-warn-ic" aria-hidden>
        {ic}
      </span>
      <div>
        <h2>{h}</h2>
        {body}
        {acts && <div className="pj-acts">{acts}</div>}
      </div>
    </section>
  );
  if (!saved)
    return box(
      'quiet',
      '▸',
      'Try a pace, then start the plan',
      <p>
        Nothing is saved until you press <b>Start this plan</b>. The pacer then starts today at {plan.dailyMinutes} min a day, {plan.daysPerWeek} days a week
        {m.finish ? `, finishing on ${fmtDay(m.finish, true)}` : ''}.
      </p>,
    );
  if (m.state === 'done') return box('ok', '◆', 'Goal reached: every checkpoint covered', <p>Pick a new goal to start the next run.</p>);
  if (m.fresh)
    return box(
      'ok',
      '▸',
      'Day 1 of your training run',
      <p>
        The pacer starts today at {saved.dailyMinutes} min a day, {saved.daysPerWeek} days a week. Keep this pace and you finish on <b>{fmtDay(m.finish!, true)}</b>.
      </p>,
    );
  if (m.state === 'behind' && saved.warningsOff)
    return box(
      'quiet',
      '·',
      'Behind-schedule warnings are off',
      <p>
        The pacer still runs. You&rsquo;re {hm(m.gap)} behind it; at this pace you finish on {fmtDay(m.finish!, true)}.
      </p>,
      <button type="button" className="btn" onClick={() => setStudyPlan({ ...saved, warningsOff: false })}>
        Turn warnings back on
      </button>,
    );
  if (m.state === 'behind') {
    const catching = saved.catchUp && today <= saved.catchUp.until;
    return box(
      '',
      '!',
      `You’re ${hm(m.gap)} behind the pacer`,
      <>
        {catching ? (
          <p>
            Catching up: +{saved.catchUp!.extraMinutes} min a day until {fmtDay(saved.catchUp!.until)} ({saved.dailyMinutes + saved.catchUp!.extraMinutes} instead of{' '}
            {saved.dailyMinutes}). Projected finish {fmtDay(m.finish!, true)}.
          </p>
        ) : (
          <p>
            {m.catchUpPerDay > 0 && (
              <>
                Add <b>{m.catchUpPerDay} min a day for the next 2 weeks</b> ({saved.dailyMinutes + m.catchUpPerDay} instead of {saved.dailyMinutes}) to get back on the
                pacer, or{' '}
              </>
            )}
            move your finish to <b>{fmtDay(m.slowFinish!)}</b>
            {m.extraDays ? ` (+${plural(m.extraDays, 'study day')})` : ''}.
          </p>
        )}
        <p className="missed">
          {m.lastActive ? `last studied ${weekday(m.lastActive)}` : 'no study recorded since the plan started'}
          {m.missedDays ? ` · ${plural(m.missedDays, 'study day')} missed` : ''}
        </p>
      </>,
      <>
        {!catching && m.catchUpPerDay > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => setStudyPlan(withCatchUp(saved, m.catchUpPerDay, today))}>
            Add {m.catchUpPerDay} min/day for 2 weeks
          </button>
        )}
        <button type="button" className="btn" onClick={() => setStudyPlan(rebase(saved, m.covered, today))}>
          Move my finish date
        </button>
        <button type="button" className="btn-ghost" onClick={() => setStudyPlan({ ...saved, warningsOff: true })}>
          Turn off warnings
        </button>
      </>,
    );
  }
  if (m.state === 'ahead')
    return box(
      'ok',
      '↑',
      `You’re ${plural(m.daysDelta, 'study day')} ahead (${hm(-m.gap)} banked)`,
      <p>
        You can take a rest day and stay on pace, or keep going and finish{' '}
        {m.pacerFinish && m.finish && m.pacerFinish > m.finish ? `on ${fmtDay(m.finish)}, before the pacer` : 'early'}.
      </p>,
    );
  return box(
    'ok',
    '✓',
    'Right on pace',
    <p>
      {m.todayMinutes ? `${m.todayMinutes} min today keeps you level with the pacer.` : 'Today is a rest day.'} {m.gap > 0 ? `You’re ${hm(m.gap)} behind it, within a session.` : ''}
    </p>,
  );
}

/** the checkpoint table: also the screen-reader version of the curve */
function Checkpoints({ m }: { m: Pace }) {
  return (
    <div className="pj-tablewrap">
      <table className="pj-table">
        <caption>
          {m.label}: {plural(m.checkpoints.length, 'checkpoint')}, {m.finish ? `finish ${fmtDay(m.finish, true)}` : 'all covered'}. ◆ covered · ▸ in training · ◇
          ahead.
        </caption>
        <thead>
          <tr>
            <th scope="col">Checkpoint (phase)</th>
            <th scope="col" className="r hide-sm">
              Topics
            </th>
            <th scope="col" className="r hide-sm">
              Time
            </th>
            <th scope="col" className="r">
              Status
            </th>
            <th scope="col" className="r">
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {m.checkpoints.map((c, i) => {
            const st = c.remaining <= 0 ? 'done' : i === m.current ? 'here' : 'ahead';
            return (
              <tr key={c.id} className={`${st}${i === m.checkpoints.length - 1 ? ' goal' : ''}`}>
                <td>
                  <span className={`pj-mark ${st}`} aria-hidden>
                    {{ done: '◆', here: '▸', ahead: '◇' }[st]}
                  </span>
                  <span className="ph-n">{pad2(c.number)}</span>
                  {c.title}
                </td>
                <td className="r hide-sm">{c.topics}</td>
                <td className="r hide-sm">{hm(c.minutes)}</td>
                <td className="r">
                  {st === 'done' ? 'covered' : st === 'here' ? `${Math.round((c.covered / c.minutes) * 100)}%` : <span className="muted">ahead</span>}
                </td>
                <td className="r d">{c.doneDay ? fmtDay(c.doneDay) : c.date ? fmtDay(c.date) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
