import { Link } from 'react-router-dom';
import { Lock, LockOpen } from 'lucide-react';
import type { TopicMeta } from '../types';
import type { Progress } from '../lib/progress';
import { localDay } from '../lib/progress';
import { studyStreak } from '../lib/streak';
import {
  activeDaysLastWeek,
  activityGrid,
  attemptTimeline,
  averageBest,
  examScores,
  mcqAccuracy,
  practiceVolume,
} from '../lib/metrics';
import { CountUp } from './CountUp';
import { ChartCard } from './charts/ChartCard';
import { StatTile } from './charts/StatTile';
import { BarList } from './charts/BarList';
import { LineChart } from './charts/LineChart';
import { Heatmap } from './charts/Heatmap';

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Track's "Study record": a row of ledger figures plus a grid of ruled chart panels. Topics covered and
 * the study streak already sit in the ledger at the top of the page, so they are not repeated here.
 */
export function DashboardMetrics({
  p,
  topics,
  readiness,
  companyTotal,
  companyUnlocked,
  firstExamHref,
}: {
  p: Progress;
  topics: TopicMeta[];
  readiness: number;
  companyTotal: number;
  companyUnlocked: boolean;
  firstExamHref: string;
}) {
  const today = localDay();
  const scores = examScores(p, topics);
  const avg = averageBest(p, topics);
  const acc = mcqAccuracy(p, topics);
  const accPct = acc.seen ? Math.round((acc.correct / acc.seen) * 100) : null;
  const timeline = attemptTimeline(p, topics);
  const streak = studyStreak(p.activityDays, today);
  const week = activeDaysLastWeek(p.activityDays, today);
  const grid = activityGrid(p.activityDays, today, 12);
  const studied12 = grid.flat().filter((c) => c.active).length;
  const volume = practiceVolume(p, topics, companyTotal);
  const passMark = p.settings.passMark;
  const takeExam = (
    <Link className="btn" to={firstExamHref}>
      Take your first exam
    </Link>
  );

  return (
    <div className="dv-record">
      <div className="dv-kpis">
        <StatTile label="Readiness" value={<CountUp value={readiness} suffix="%" />} meter={readiness} hint="average completion of every topic" />
        <StatTile
          label="Average best score"
          value={avg === null ? '—' : <CountUp value={avg} suffix="%" />}
          meter={avg ?? undefined}
          mark={passMark}
          hint={scores.length ? `over ${scores.length} exam${scores.length === 1 ? '' : 's'} · pass mark ${passMark}%` : 'no exams yet'}
        />
        <StatTile
          label="Exam accuracy"
          value={accPct === null ? '—' : <CountUp value={accPct} suffix="%" />}
          meter={accPct ?? undefined}
          hint={acc.seen ? `${acc.correct}/${acc.seen} latest answers right` : 'answer a question to see this'}
        />
      </div>

      <div className="dv-grid-cards">
        <ChartCard
          title="Score trend"
          subtitle={timeline.length >= 2 ? `Your last ${timeline.length} full-length exam attempts, oldest → newest` : undefined}
          empty={
            timeline.length >= 2 ? undefined : (
              <>
                <p>{timeline.length ? 'One attempt so far. Take another full exam to see your trend.' : 'Take two full exams to see your score trend.'}</p>
                {takeExam}
              </>
            )
          }
          table={{
            columns: ['Date', 'Topic', 'Score'],
            rows: timeline.map((a) => [shortDate(a.at), a.title, `${a.score}%`]),
          }}
        >
          <LineChart
            seriesLabel="Exam score per attempt"
            reference={{ value: passMark, label: 'Pass' }}
            points={timeline.map((a, i) => ({ id: `${a.topicId}-${i}`, value: a.score, x: shortDate(a.at), label: a.title }))}
          />
        </ChartCard>

        <ChartCard
          title="Study activity"
          subtitle={
            <>
              Last 12 weeks · {studied12} day{studied12 === 1 ? '' : 's'} studied · {week} of the last 7 ·{' '}
              <strong>{streak ? `${streak}-day streak` : 'no current streak'}</strong>
            </>
          }
          table={{
            columns: ['Week starting', 'Days studied', 'Days'],
            rows: grid.map((w) => [shortDate(`${w[0].day}T12:00:00`), w.filter((c) => c.active).length, w.filter((c) => c.active).map((c) => shortDate(`${c.day}T12:00:00`)).join(', ') || '—']),
          }}
        >
          <Heatmap weeks={grid} />
          <p className="small muted dv-heat-note">
            <span className="dv-key dv-key-rect dv-key-on" aria-hidden />
            <span>studied</span>
            <span className="dv-key dv-key-rect dv-key-empty" aria-hidden />
            <span>no study</span>
            <span className="dv-key dv-key-rect dv-key-today" aria-hidden />
            <span>today</span>
          </p>
        </ChartCard>

        <ChartCard
          title="Practice done"
          subtitle={
            <>
              Share of each kind of practice completed ·{' '}
              <span className={`dv-lock ${companyUnlocked ? 'on' : ''}`}>
                {companyUnlocked ? <LockOpen size={12} aria-hidden /> : <Lock size={12} aria-hidden />} architecture challenges {companyUnlocked ? 'unlocked' : 'locked'}
              </span>
            </>
          }
          table={{ columns: ['Practice', 'Done', 'Total', 'Share'], rows: volume.map((v) => [v.label, v.done, v.total, `${v.pct}%`]) }}
        >
          <BarList
            seriesLabel="Practice completed by kind"
            rows={volume.map((v) => ({
              id: v.id,
              label: v.label,
              value: v.pct,
              display: `${v.done}/${v.total}`,
              detail: v.id === 'company' && !companyUnlocked ? `${v.pct}% · unlocks after every exam is passed` : `${v.pct}% done`,
              href: v.href,
            }))}
          />
        </ChartCard>
      </div>
    </div>
  );
}
