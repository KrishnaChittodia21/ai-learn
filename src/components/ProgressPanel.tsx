import { Link } from 'react-router-dom';
import { LEVELS, LEVEL_OF_TOPIC, TOPICS } from '../content';
import type { Progress } from '../lib/progress';
import { topicStatus } from '../lib/stats';
import { ChartCard } from './charts/ChartCard';
import { useTip } from './charts/hooks';
import { ChartTip, TipRow } from './charts/tooltip';

// Status is ordinal (not started → in progress → covered), so it is encoded as one ink ramp, light → dark,
// matching the course ticks; legends, direct labels and the table view carry identity too.
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

/** Dashboard summary: topics by status (donut), status per level (stacked bars) and practice figures. */
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

  // practice figures from real progress
  let sections = 0;
  let sectionsRead = 0;
  let exercises = 0;
  let exercisesDone = 0;
  let checks = 0;
  let checksAnswered = 0;
  let checksRight = 0;
  for (const t of TOPICS) {
    const read = new Set(p.sections[t.id] ?? []);
    t.sections.forEach((s, i) => {
      sections++;
      if (read.has(i)) sectionsRead++;
      if (s.exercise) {
        exercises++;
        if (p.cc[`${t.id}-s${i}-ex`]) exercisesDone++;
      }
      if (s.quickCheck) {
        checks++;
        const d = p.drafts[`qc:${t.id}-s${i}-qc`];
        if (d !== undefined && d !== '') {
          checksAnswered++;
          if (Number(d) === s.quickCheck.correct) checksRight++;
        }
      }
    });
  }
  const figures = [
    { label: 'Sections read', value: sectionsRead, of: sections, hint: 'Tick “Read” at the top of each section.' },
    { label: 'Coding exercises done', value: exercisesDone, of: exercises, hint: 'The “Try it” block under every section.' },
    {
      label: 'Quick checks right',
      value: checksRight,
      of: checks,
      hint: checksAnswered ? `${checksAnswered} answered · ${Math.round((checksRight / checksAnswered) * 100)}% right.` : 'One question at the end of every section.',
    },
  ];

  return (
    <section className="progress-panel" aria-labelledby="progress-title">
      <div className="section-rule-head">
        <h2 id="progress-title" className="section-rule-title">
          Progress at a glance
        </h2>
        <p className="muted small">
          A topic is covered once its exam is passed. <Link to="/contents">Open the syllabus</Link>
        </p>
      </div>
      <div className="progress-grid">
        <ChartCard
          title="Topics by status"
          subtitle={`${total} topics`}
          legend={STATES.map((s) => ({ label: s.label, color: s.color }))}
          table={{ columns: ['Status', 'Topics', 'Share'], rows: STATES.map((s) => [s.label, all[s.id], `${Math.round((all[s.id] / total) * 100)}%`]) }}
        >
          <StatusDonut counts={all} total={total} />
        </ChartCard>
        <ChartCard
          title="By level"
          subtitle="Status of each level's topics"
          legend={STATES.map((s) => ({ label: s.label, color: s.color }))}
          table={{
            columns: ['Level', 'Covered', 'In progress', 'Not started', 'Topics'],
            rows: levels.map((lv) => [lv.title, lv.counts.passed, lv.counts['in-progress'], lv.counts.new, lv.total]),
          }}
        >
          <LevelBars levels={levels} />
        </ChartCard>
        <div className="progress-figures" aria-label="Practice">
          {figures.map((f) => (
            <div key={f.label} className="progress-figure">
              <div className="label">{f.label}</div>
              <div className="progress-figure-value">
                {f.value}
                <span>/{f.of}</span>
              </div>
              <div className="progress-figure-meter" aria-hidden>
                <span style={{ width: `${f.of ? (f.value / f.of) * 100 : 0}%` }} />
              </div>
              <p className="small muted">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const { ref, tip, bind } = useTip();
  const size = 188;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = STATES.filter((s) => counts[s.id] > 0);
  const gap = shown.length > 1 ? 2 : 0; // 2px surface gap between segments
  let offset = 0;
  const pct = Math.round((counts.passed / total) * 100);
  const summary = STATES.map((s) => `${counts[s.id]} ${s.label.toLowerCase()}`).join(', ');
  return (
    <div className="dv-plot donut-plot" ref={ref}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Topics by status: ${summary}, of ${total}.`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {shown.map((s) => {
            const len = (counts[s.id] / total) * c;
            const el = (
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
                strokeDashoffset={-offset}
                tabIndex={0}
                aria-label={`${s.label}: ${counts[s.id]} of ${total}`}
                {...bind(<TipRow value={counts[s.id]} label={`${s.label} · ${Math.round((counts[s.id] / total) * 100)}%`} color={s.color} />)}
              />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" className="donut-value">
          {pct}%
        </text>
        <text x={size / 2} y={size / 2 + 26} textAnchor="middle" className="donut-label">
          covered
        </text>
      </svg>
      <ul className="donut-direct" aria-hidden>
        {STATES.map((s) => (
          <li key={s.id}>
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
            <span className="level-bar-numeral" aria-hidden>
              {lv.numeral}
            </span>
            <span className="level-bar-title">{lv.title}</span>
            <span className="level-bar-count">
              {lv.counts.passed}/{lv.total} covered
            </span>
          </div>
          <div className="level-bar" role="img" aria-label={`${lv.title}: ${STATES.map((s) => `${lv.counts[s.id]} ${s.label.toLowerCase()}`).join(', ')}`}>
            {STATES.filter((s) => lv.counts[s.id] > 0).map((s) => (
              <span
                key={s.id}
                className="level-bar-seg"
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
