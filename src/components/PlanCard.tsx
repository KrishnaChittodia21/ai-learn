// Today's compact "Plan your journey" card (M6): the learning curve as a sparkline, the ETA and today's minutes.
import { Link } from 'react-router-dom';
import { ArrowRight, ChartSpline } from 'lucide-react';
import { PHASES, TOPICS } from '../content';
import { localDay, type Progress } from '../lib/progress';
import { computePace, fmtDay, hm } from '../lib/pace';
import { Sparkline } from './LearningCurve';

export function PlanCard({ p }: { p: Progress }) {
  const plan = p.studyPlan;
  if (!plan)
    return (
      <Link to="/plan" className="card td-plan td-plan-empty">
        <ChartSpline size={20} aria-hidden className="td-plan-ic" />
        <span>
          <b>Plan your journey</b>
          <small>Set minutes a day and a goal; every phase gets a date.</small>
        </span>
        <ArrowRight size={16} aria-hidden />
      </Link>
    );
  const today = localDay();
  const m = computePace(plan, p, TOPICS, PHASES, today);
  const warn = m.state === 'behind' && !plan.warningsOff;
  const [cls, chip] =
    m.state === 'done'
      ? ['', 'Goal reached']
      : warn
        ? ['warn', `behind by ${hm(m.gap)}`]
        : m.state === 'behind'
          ? ['quiet', 'Plan active']
          : m.state === 'ahead'
            ? ['', `${hm(-m.gap)} ahead`]
            : ['', m.fresh ? 'Day 1' : 'On pace'];
  const extra = plan.catchUp && today <= plan.catchUp.until ? plan.catchUp.extraMinutes : 0;
  const line = !m.todayMinutes ? 'Today is a rest day' : extra ? `Today: ${m.todayMinutes} min (${plan.dailyMinutes} + ${extra} catch-up)` : `Today: ${m.todayMinutes} min`;
  return (
    <section className="card glass td-plan" aria-labelledby="td-plan-h">
      <div className="td-plan-top">
        <span className="eyebrow">Plan your journey</span>
        <span className={`td-plan-chip ${cls}`}>{chip}</span>
      </div>
      <h2 id="td-plan-h" className="td-plan-h">
        {m.finish ? `ETA ${fmtDay(m.finish, true)}` : 'Goal reached'}
        <small> · {m.label}</small>
      </h2>
      <Sparkline m={m} />
      <div className="td-plan-foot">
        <span>{line}</span>
        <Link className="btn btn-sm" to="/plan">
          Open plan <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
