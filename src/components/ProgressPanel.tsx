import { Link } from 'react-router-dom';
import { LEVELS, LEVEL_OF_TOPIC, TOPICS } from '../content';
import type { Progress } from '../lib/progress';
import { topicStatus } from '../lib/stats';
import { ChartCard } from './charts/ChartCard';
import { useTip } from './charts/hooks';
import { ChartTip, TipRow } from './charts/tooltip';

// Status: covered glows ion, in progress pulsar, not started stays dim (the --st-* tokens);
// the direct legend, tooltips and the table view carry identity too.
const STATES = [
  { id: 'passed', label: 'Covered', color: 'var(--st-covered)' },
  { id: 'in-progress', label: 'In progress', color: 'var(--st-progress)' },
  { id: 'new', label: 'Not started', color: 'var(--st-new)' },
] as const;
const NUMERALS = ['I', 'II', 'III'];

function countByStatus(p: Progress, ids: string[]) {
  const counts = { passed: 0, 'in-progress': 0, new: 0 };
  for (const t of TOPICS) if (ids.includes(t.id)) counts[topicStatus(p, t)]++;
  return counts;
}

/** Dashboard summary: topics by status (donut + legend) and status per level (stacked bars), each with a table view. */
export function ProgressPanel({ p }: { p: Progress }) {
  const all = countByStatus(
    p,
    TOPICS.map((t) => t.id),
  );
  const total = TOPICS.length;
  const levels = LEVELS.map((lv, i) => {
    const ids = TOPICS.filter((t) => LEVEL_OF_TOPIC.get(t.id) === lv.id).map((t) => t.id);
    return { ...lv, numeral: NUMERALS[i], total: ids.length, counts: countByStatus(p, ids) };
  });

  return (
    <section className="progress-panel" aria-labelledby="progress-title">
      <h2 id="progress-title" className="sr-only">
        Course progress
      </h2>
      <div className="progress-grid">
        <ChartCard
          title="Progress at a glance"
          subtitle={
            <>
              {total} topics · a topic is covered when its exam is passed · <Link to="/contents">Open the syllabus</Link>
            </>
          }
          className="pp-card pp-status"
          table={{ columns: ['Status', 'Topics', 'Share'], rows: STATES.map((s) => [s.label, all[s.id], `${Math.round((all[s.id] / total) * 100)}%`]) }}
        >
          <StatusDonut counts={all} total={total} />
        </ChartCard>
        <ChartCard
          title="By level"
          subtitle={<span className="pp-key-line">covered · in progress · not started</span>}
          className="pp-card pp-levels"
          table={{
            columns: ['Level', 'Covered', 'In progress', 'Not started', 'Topics'],
            rows: levels.map((lv) => [lv.title, lv.counts.passed, lv.counts['in-progress'], lv.counts.new, lv.total]),
          }}
        >
          <LevelBars levels={levels} />
        </ChartCard>
      </div>
    </section>
  );
}

function StatusDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const { ref, tip, bind } = useTip();
  const size = 200;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = STATES.filter((s) => counts[s.id] > 0);
  const gap = shown.length > 1 ? 3 : 0; // small gap between segments
  const lens = shown.map((s) => (counts[s.id] / total) * c);
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  const summary = STATES.map((s) => `${counts[s.id]} ${s.label.toLowerCase()}`).join(', ');
  return (
    <div className="dv-plot donut-plot" ref={ref}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Topics by status: ${summary}, of ${total}.`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {shown.map((s, i) => {
            const len = lens[i];
            return (
              <circle
                key={s.id}
                className="donut-seg"
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-offsets[i]}
                tabIndex={0}
                aria-label={`${s.label}: ${counts[s.id]} of ${total}`}
                {...bind(<TipRow value={counts[s.id]} label={`${s.label} · ${Math.round((counts[s.id] / total) * 100)}%`} color={s.color} />)}
              />
            );
          })}
        </g>
        <text x={size / 2} y={size / 2 + 8} textAnchor="middle" className="donut-value">
          {counts.passed}
        </text>
        <text x={size / 2} y={size / 2 + 30} textAnchor="middle" className="donut-label">
          OF {total}
        </text>
      </svg>
      <ul className="donut-direct" aria-hidden>
        {STATES.map((s) => (
          <li key={s.id} className={`donut-key-${s.id}`}>
            <span className="donut-key" style={{ background: s.color }} />
            <strong>{counts[s.id]}</strong> {s.label.toLowerCase()}
          </li>
        ))}
      </ul>
      <ChartTip tip={tip} />
    </div>
  );
}

function LevelBars({ levels }: { levels: { id: string; title: string; numeral: string; total: number; counts: Record<string, number> }[] }) {
  const { ref, tip, bind } = useTip();
  return (
    <div className="dv-plot level-bars" ref={ref}>
      {levels.map((lv) => (
        <div key={lv.id} className="level-bar-row">
          <div className="level-bar-head">
            <span className="level-bar-numeral gtext still" aria-hidden>
              {lv.numeral}
            </span>
            <span className="level-bar-title">{lv.title}</span>
            <span className="level-bar-count">
              {lv.counts.passed} / {lv.total}
              <span className="sr-only"> covered</span>
            </span>
          </div>
          <div className="level-bar" role="img" aria-label={`${lv.title}: ${STATES.map((s) => `${lv.counts[s.id]} ${s.label.toLowerCase()}`).join(', ')}`}>
            {STATES.filter((s) => lv.counts[s.id] > 0).map((s) => (
              <span
                key={s.id}
                className={`level-bar-seg seg-${s.id}`}
                style={{ flexGrow: lv.counts[s.id], background: s.color }}
                tabIndex={0}
                {...bind(<TipRow value={lv.counts[s.id]} label={`${lv.title} · ${s.label.toLowerCase()}`} color={s.color} />)}
              />
            ))}
          </div>
        </div>
      ))}
      <ChartTip tip={tip} />
    </div>
  );
}
