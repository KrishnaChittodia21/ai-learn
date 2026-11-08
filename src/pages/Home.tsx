import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CirclePlay, HardDriveDownload, Play } from 'lucide-react';
import { COMPANY_QUESTIONS, LEVEL_OF_TOPIC, LEVELS, PHASES, TOPICS, TOPIC_BY_ID } from '../content';
import { localDay, useProgress, type Progress } from '../lib/progress';
import { companyUnlocked, topicCompletion, topicStatus } from '../lib/stats';
import { weakTopics } from '../lib/weak';
import { nextStep } from '../lib/nextStep';
import { roleTopicIds } from '../content/roles';
import { getUiPrefs, saveUiPrefs, useUiPrefs } from '../lib/uiPrefs';
import { backupDue } from '../lib/backup';
import { exportNow } from '../lib/exportNow';
import { studyStreak } from '../lib/streak';
import { shiftDay } from '../lib/metrics';
import { ProgressPanel } from '../components/ProgressPanel';
import { DashboardMetrics } from '../components/DashboardMetrics';
import { WeakReattempt } from '../components/WeakReattempt';
import { AchievementsSummary } from '../components/achievements/AchievementsSummary';
import { NeuralCoverage } from '../components/NeuralCoverage';
import { ShortThumb } from '../components/ShortThumb';
import { PlanCard } from '../components/PlanCard';
import { SaveButton } from '../components/SaveButton';
import { shortLength } from '../lib/shorts';
import { useShorts } from '../lib/useShorts';
import { useInViewPause } from '../lib/useInViewPause';
import { countPlan } from '../lib/motion';
import { CountUp } from '../components/CountUp';
import { HeadingReveal } from '../components/HeadingReveal';

const TAB_LABELS: Record<string, string> = {
  learn: 'Read',
  code: 'Code Lab',
  'prompt-lab': 'Prompt Lab',
  interview: 'Questions',
  envelope: 'Estimation',
  cheat: 'Cheat sheet',
  capstone: 'Capstone',
  exam: 'Exam',
};
const PAGE_LABELS: Record<string, string> = {
  '/contents': 'Syllabus',
  '/weak-areas': 'Weak areas',
  '/challenges': 'Architecture challenges',
  '/settings': 'Settings',
};
const HOW = [
  ['Read', 'a short section: one idea, a worked example, the trade-offs and how to fix each weakness.'],
  ['Do', 'the coding exercise and the quick check under every section.'],
  ['Drill', 'the Code Lab, scenario questions and estimation problems.'],
  ['Pass', 'the timed exam. The topic is then marked covered and its star lights up.'],
];
/** "Chunking Fundamentals: Strategies, Size…" → "Chunking Fundamentals" */
const shortTitle = (title: string) => title.split(/: | — /)[0];
const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Human label for a saved location, e.g. "Embeddings · Read · §3 Vector Similarity" (topic left out when it is `current`). */
function describeLocation(loc: string, current?: string): string | null {
  const [path, search = ''] = loc.split('?');
  const params = new URLSearchParams(search);
  const topic = /^\/topic\/([^/]+)/.exec(path);
  if (topic) {
    const t = TOPIC_BY_ID.get(topic[1]);
    if (!t) return null;
    const tab = params.get('tab') ?? 'learn';
    const s = Number(params.get('s'));
    const sec = tab === 'learn' && params.has('s') && t.sections[s] ? ` · §${s + 1} ${t.sections[s].heading.split(' — ')[0]}` : '';
    if (t.id === current) return sec ? sec.slice(3) : `${TAB_LABELS[tab] ?? 'Read'} · ${shortTitle(t.title)}`;
    return `${shortTitle(t.title)} · ${TAB_LABELS[tab] ?? 'Read'}${sec}`;
  }
  const cq = /^\/challenges\/(.+)$/.exec(path);
  if (cq) return COMPANY_QUESTIONS.find((q) => q.id === cq[1])?.title ?? null;
  return PAGE_LABELS[path] ?? null;
}

/** practice figures from real progress: sections read, section exercises solved, quick checks right */
function practiceFigures(p: Progress) {
  const f = { sections: 0, sectionsRead: 0, exercises: 0, exercisesDone: 0, checks: 0, checksRight: 0 };
  for (const t of TOPICS) {
    const read = new Set(p.sections[t.id] ?? []);
    t.sections.forEach((s, i) => {
      f.sections++;
      if (read.has(i)) f.sectionsRead++;
      if (s.exercise) {
        f.exercises++;
        if (p.cc[`${t.id}-s${i}-ex`]) f.exercisesDone++;
      }
      if (s.quickCheck) {
        f.checks++;
        const d = p.drafts[`qc:${t.id}-s${i}-qc`];
        if (d !== undefined && d !== '' && Number(d) === s.quickCheck.correct) f.checksRight++;
      }
    });
  }
  return f;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function Home() {
  const p = useProgress();
  const weak = useMemo(() => weakTopics(p, TOPICS), [p]);
  const weakest = weak.find((w) => w.sections.length > 0);
  const step = nextStep(p, TOPICS, {
    companyTotal: COMPANY_QUESTIONS.length,
    path: roleTopicIds(p.rolePath),
    weak: weakest ? { topic: weakest.topic, index: weakest.sections[0].index, heading: weakest.sections[0].heading } : null,
  });
  const last = getUiPrefs().lastStudyLocation;
  const fresh = step.kind === 'start';
  const firstUntested = TOPICS.find((t) => !p.tests[t.id]) ?? TOPICS[0];
  const firstExamHref = firstUntested ? `/topic/${firstUntested.id}?tab=exam` : '/contents';
  const answered = Object.keys(p.mcq).length;
  const mistakes = Object.values(p.mcq).filter((r) => !r.lastCorrect).length;
  const status = useMemo(() => new Map(TOPICS.map((t) => [t.id, topicStatus(p, t)])), [p]);
  const passed = TOPICS.filter((t) => status.get(t.id) === 'passed').length;
  const coveredPct = pct(passed, TOPICS.length);
  const fig = useMemo(() => practiceFigures(p), [p]);
  const inProgress = TOPICS.filter((t) => status.get(t.id) === 'in-progress')
    .map((t) => ({ t, pct: topicCompletion(p, t) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  // ---------- the next mission ----------
  const topic = step.topic;
  const phase = topic ? PHASES.find((ph) => ph.id === topic.phase) : undefined;
  const level = phase ? LEVELS.find((lv) => lv.id === phase.level) : undefined;
  const heroTitle = topic ? shortTitle(topic.title) : step.title;
  const eyebrow = phase ? `Next mission · Phase ${pad(phase.number)}` : step.kind === 'done' ? 'Course complete' : 'Next mission · Architecture challenges';
  const read = topic ? (p.sections[topic.id] ?? []).filter((i) => i < topic.sections.length).length : 0;
  const sectionsLine = topic ? `${read} of ${topic.sections.length} sections read` : null;
  const lede = topic ? `${topic.subtitle.replace(/\.?$/, '.')} ${fresh ? `${plural(topic.sections.length, 'short section')} to start with.` : `You are ${read} of ${topic.sections.length} sections in.`}` : step.detail;
  const minutesLeft = topic ? Math.round(topic.estimatedMinutes * (1 - topicCompletion(p, topic) / 100)) : 0;
  const lastLabel = last ? describeLocation(last, topic?.id) : null;
  const resumeHere = last && lastLabel && last !== step.href ? { href: last, label: lastLabel } : null;
  const ctaLabel = fresh ? 'Start the first lesson' : step.kind === 'done' ? 'Drill weak areas' : 'Resume mission';

  // ---------- coverage per level (summary label of the neural-network figure) ----------
  const levels = LEVELS.map((lv) => {
    const ts = TOPICS.filter((t) => LEVEL_OF_TOPIC.get(t.id) === lv.id);
    const done = ts.filter((t) => status.get(t.id) === 'passed').length;
    return { title: lv.title, done, total: ts.length };
  });
  const ringsLabel = `Course progress: ${coveredPct} percent covered. ${levels.map((l) => `${l.title} ${l.done} of ${l.total}`).join(', ')}.`;

  // tiles count up from what the learner saw when they last left Today (saved on leave, so a reload doesn't recount)
  const [seen] = useState(() => getUiPrefs().lastSeenFigures ?? {});
  const figures = { passed, sections: fig.sectionsRead, exercises: fig.exercisesDone, mistakes };
  const figRef = useRef(figures);
  useEffect(() => {
    figRef.current = figures;
  });
  useEffect(() => {
    const save = () => saveUiPrefs({ lastSeenFigures: figRef.current });
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, []);
  const heroRef = useRef<HTMLDivElement>(null);
  useInViewPause(heroRef);

  return (
    <div className="page today">
      <section className="td-hero" aria-labelledby="today-title">
        <div className="td-hero-card beam" ref={heroRef}>
          <div className="td-hero-copy">
            <p className="td-eyebrow rise d1">
              <span className="td-eyebrow-dot" aria-hidden />
              <span>
                {eyebrow}
                {level && <span className="td-eyebrow-level"> · {level.title}</span>}
              </span>
            </p>
            <h1 id="today-title" className={`td-title${heroTitle.length > 32 ? ' td-title-long' : ''}`}>
              <HeadingReveal text={heroTitle} />
            </h1>
            <p className="td-lede rise d3">{lede}</p>
            <p className="td-mlede">
              {fresh && topic ? `${plural(topic.sections.length, 'short section')} · start with §1 ${topic.sections[0]?.heading.split(' — ')[0] ?? ''}` : sectionsLine ? `${sectionsLine} · up next: ${step.kind === 'read' ? step.title.replace(/^Read /, '').split(' — ')[0] : step.title}` : step.detail}
            </p>
            <NeuralCoverage compact className="td-nn-phone" status={status} nextId={topic?.id} pct={coveredPct} label={ringsLabel} />
            <div className="td-actions rise d4" data-guide="mission">
              <Link className="btn btn-primary btn-lg td-cta" to={step.href}>
                {ctaLabel} <ArrowRight size={18} aria-hidden />
              </Link>
              <Link className="btn btn-lg td-ghost" to="/contents">
                Open the syllabus
              </Link>
            </div>
            <dl className="td-meta rise d5">
              <div>
                <dt>{resumeHere ? 'Where you left off' : 'Up next'}</dt>
                <dd>{resumeHere ? <Link to={resumeHere.href}>{resumeHere.label}</Link> : step.title}</dd>
              </div>
              {minutesLeft > 0 && (
                <div>
                  <dt>Est. time left</dt>
                  <dd>{minutesLeft >= 90 ? `${Math.round(minutesLeft / 6) / 10} h` : `${minutesLeft} min`}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <NeuralCoverage className="td-nn-hero rise d2" status={status} nextId={topic?.id} pct={coveredPct} label={ringsLabel} />
      </section>

      <section className="td-tiles" aria-label="Practice figures">
        <StatFigure label="Topics covered" short="Covered" value={passed} seen={seen.passed} of={TOPICS.length} tone="ion" i={1} />
        <StatFigure
          label="Sections read"
          short="Sections"
          value={fig.sectionsRead}
          seen={seen.sections}
          of={fig.sections}
          tone="nebula"
          i={2}
          hint={`${fig.checksRight}/${fig.checks} quick checks right`}
          className="td-tile-sections"
        />
        <StatFigure label="Exercises solved" short="Exercises" value={fig.exercisesDone} seen={seen.exercises} of={fig.exercises} tone="pulsar" i={3} />
        <div className="card td-tile td-tile-mistakes rise d4">
          <div className="lbl">
            <span className="td-tile-long">Mistakes to drill</span>
            <span className="td-tile-short">Mistakes</span>
          </div>
          <div className={`td-tile-value num${mistakes ? ' hot' : ''}`}>
            <CountUp value={mistakes} from={seen.mistakes ?? mistakes} duration={0.7} />
            <Delta value={mistakes} seen={seen.mistakes} />
          </div>
          {mistakes ? (
            <Link className="td-tile-link" to="/practice">
              Start drill <ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <p className="td-tile-hint">{answered ? 'Every latest answer is right.' : 'Answer exam questions to fill this.'}</p>
          )}
        </div>
      </section>

      {fresh && (
        <section className="card td-how" aria-labelledby="how-title">
          <h2 id="how-title" className="td-h2">
            How this works
          </h2>
          <ol className="td-how-steps">
            {HOW.map(([verb, rest], i) => (
              <li key={verb}>
                <span className="td-how-num">{pad(i + 1)}</span>
                <p>
                  <strong>{verb}</strong> {rest}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <BackupNudge p={p} />

      <ShortOfTheDay />

      <PlanCard p={p} />

      <ProgressPanel p={p} />

      <Constellation status={status} currentPhase={phase?.id} />

      {inProgress.length > 0 && (
        <section className="card td-desk" aria-labelledby="open-title">
          <h2 id="open-title" className="td-h2">
            On your desk
          </h2>
          <ul className="td-desk-list">
            {inProgress.map(({ t, pct: done }) => (
              <li key={t.id}>
                <Link to={`/topic/${t.id}`} title={t.title}>
                  {shortTitle(t.title)}
                </Link>
                <span className="td-desk-bar" aria-hidden>
                  <span style={{ width: `${done}%` }} />
                </span>
                <span className="td-desk-pct">{done}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="td-pair" aria-label="Weak spot and study activity">
        <WeakReattempt weak={weak} answered={answered} passMark={p.settings.passMark} firstExamHref={firstExamHref} />
        <Activity days={p.activityDays} />
      </section>

      <AchievementsSummary p={p} />

      <section className="td-record" aria-labelledby="record-title">
        <div className="td-head">
          <h2 id="record-title" className="td-h2">
            Study record
          </h2>
          <p className="td-head-note">Scores, accuracy and practice volume, each with a table view.</p>
        </div>
        <DashboardMetrics
          p={p}
          topics={TOPICS}
          readiness={Math.round(TOPICS.reduce((a, t) => a + topicCompletion(p, t), 0) / Math.max(1, TOPICS.length))}
          companyTotal={COMPANY_QUESTIONS.length}
          companyUnlocked={companyUnlocked(p, TOPICS).unlocked}
          firstExamHref={firstExamHref}
        />
      </section>
    </div>
  );
}

/** Today's Short: always open; once watched it says a new one unlocks on the next study day. */
function ShortOfTheDay() {
  const { sotd } = useShorts();
  if (!sotd) return null;
  const { entry, watched } = sotd;
  return (
    <article className={`card sotd${watched ? ' compact' : ''}`} aria-labelledby="sotd-title" data-guide="short-of-the-day">
      <ShortThumb entry={entry} state={watched ? 'watched' : undefined} />
      <div>
        <p className="eyebrow">
          <CirclePlay size={14} aria-hidden /> Short of the day{watched ? '' : ` · ${shortLength(entry.short)}`}
        </p>
        <h2 id="sotd-title">{entry.short.title}</h2>
        {watched ? (
          <>
            <p className="done-note">
              <Check size={14} aria-hidden /> Watched · a new one unlocks on your next study day
            </p>
            <Link className="small" to={`/topic/${entry.topic.id}?tab=learn&s=${entry.section}`}>
              Learn it: §{entry.section + 1} →
            </Link>{' '}
            · <Link className="small" to="/shorts">All Shorts</Link>
          </>
        ) : (
          <>
            <p>{entry.topic.title}</p>
            <div className="row wrap">
              <Link className="btn btn-primary btn-sm" to={`/short/${entry.short.id}`}>
                <Play size={14} aria-hidden /> Watch
              </Link>
              <SaveButton kind="short" refId={entry.short.id} topicId={entry.topic.id} title={entry.short.title} />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

/** Every couple of weeks of new progress: a quiet reminder that everything lives in this browser only. */
function BackupNudge({ p }: { p: Progress }) {
  const prefs = useUiPrefs();
  if (!backupDue(p, prefs.lastExportAt, prefs.backupNudgeDismissedAt)) return null;
  return (
    <aside className="backup-nudge tint-ion" aria-label="Backup reminder">
      <HardDriveDownload size={18} aria-hidden />
      <p>
        <strong>Export a backup?</strong> Your progress lives only in this browser. A backup file keeps it safe if site data is cleared.
      </p>
      <button type="button" className="btn btn-sm btn-primary" onClick={exportNow}>
        Export a backup
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => saveUiPrefs({ backupNudgeDismissedAt: new Date().toISOString() })}>
        Not now
      </button>
    </aside>
  );
}

/** "+6" / "−2" since the last visit to Today; nothing when unchanged or on a first visit */
function Delta({ value, seen }: { value: number; seen?: number }) {
  const d = countPlan(seen, value, false).delta;
  if (!d) return null;
  return (
    <span className={`td-delta${d < 0 ? ' down' : ''}`} aria-label={`${d > 0 ? 'up' : 'down'} ${Math.abs(d)} since your last visit`}>
      {d > 0 ? `+${d}` : `−${-d}`}
    </span>
  );
}

function StatFigure({
  label,
  short,
  value,
  seen,
  of,
  tone,
  i,
  hint,
  className = '',
}: {
  label: string;
  short: string;
  value: number;
  /** the value when Today was last left (undefined on a first visit: no count, no delta) */
  seen?: number;
  of: number;
  tone: 'ion' | 'nebula' | 'pulsar';
  i: number;
  hint?: string;
  className?: string;
}) {
  const to = value ? Math.max(0.02, value / Math.max(1, of)) : 0;
  const start = seen === undefined ? to : seen ? Math.max(0.02, seen / Math.max(1, of)) : 0;
  // the bar starts where the learner last saw it, then its scaleX transitions to now (CSS, transform only)
  const [bar, setBar] = useState(start);
  useEffect(() => {
    const r = requestAnimationFrame(() => setBar(to));
    return () => cancelAnimationFrame(r);
  }, [to]);
  return (
    <div className={`card td-tile rise ${className}`} style={{ '--i': i } as CSSProperties}>
      <div className="lbl">
        <span className="td-tile-long">{label}</span>
        <span className="td-tile-short">{short}</span>
      </div>
      <div className="td-tile-value num">
        <CountUp value={value} from={seen ?? value} duration={0.7} />
        <span className="td-tile-of">/{of}</span>
        <Delta value={value} seen={seen} />
      </div>
      <div className={`td-tile-bar td-tile-bar-${tone}`} aria-hidden>
        <span style={{ transform: `scaleX(${bar})` }} />
      </div>
      {hint && <p className="td-tile-hint">{hint}</p>}
    </div>
  );
}

// ---------- constellation: 16 phases along a path ----------
// fixed vertical rhythm (in % of the plot height) so the path zig-zags like the mockup
const NODE_Y = [70, 40, 60, 30, 50, 23, 57, 37, 67, 43, 20, 50, 77, 40, 63, 30];

function Constellation({ status, currentPhase }: { status: Map<string, string>; currentPhase?: string }) {
  const n = PHASES.length;
  const nodes = PHASES.map((ph, i) => {
    const ts = TOPICS.filter((t) => t.phase === ph.id);
    const done = ts.filter((t) => status.get(t.id) === 'passed').length;
    const touched = ts.some((t) => status.get(t.id) !== 'new');
    const state: 'done' | 'now' | 'todo' = ts.length && done === ts.length ? 'done' : touched ? 'now' : 'todo';
    const x = n > 1 ? 4 + (i * 94) / (n - 1) : 50;
    const y = NODE_Y[i % NODE_Y.length];
    return { ph, i, x, y, state, done, total: ts.length };
  });
  const lastLit = nodes.reduce((m, nd) => (nd.state !== 'todo' ? nd.i : m), -1);
  const litStop = n > 1 ? Math.max(0, lastLit) / (n - 1) : 0;
  const labelled = new Set([0, n - 1, nodes.findIndex((nd) => nd.ph.id === currentPhase), lastLit].filter((i) => i >= 0));
  const passedPhases = nodes.filter((nd) => nd.state === 'done').length;
  const STATE_TEXT = { done: 'passed', now: 'in progress', todo: 'ahead' };

  return (
    <section className="card td-constellation" aria-labelledby="constellation-title">
      <div className="td-head">
        <h2 id="constellation-title" className="td-h2">
          Your constellation
        </h2>
        <p className="td-head-note">
          {passedPhases ? `${passedPhases} of ${n} phases lit` : `${n} phases light up as you pass their exams`}
        </p>
      </div>
      <div className="td-sky">
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="td-sky-path" aria-hidden>
          <defs>
            <linearGradient id="td-sky-grad" x1="0" x2="1">
              <stop offset="0" stopColor="var(--c-ion)" />
              <stop offset={Math.max(0.001, litStop)} stopColor="var(--c-pulsar)" />
              <stop offset={Math.min(1, litStop + 0.08)} stopColor="var(--rule-strong)" />
              <stop offset="1" stopColor="var(--rule-strong)" />
            </linearGradient>
          </defs>
          <polyline
            points={nodes.map((nd) => `${nd.x * 10},${nd.y * 3}`).join(' ')}
            fill="none"
            stroke="url(#td-sky-grad)"
            strokeWidth="1.6"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <ol className="td-sky-nodes">
          {nodes.map((nd) => (
            <li key={nd.ph.id} style={{ left: `${nd.x}%`, top: `${nd.y}%` }}>
              <Link
                to={`/contents#phase-${nd.ph.id}`}
                className={`td-node ${nd.state}`}
                aria-label={`Phase ${nd.ph.number}, ${nd.ph.title}: ${STATE_TEXT[nd.state]}, ${nd.done} of ${nd.total} topics covered`}
                title={`${pad(nd.ph.number)} ${nd.ph.title} · ${nd.done}/${nd.total} covered`}
              />
              {labelled.has(nd.i) && (
                <span className={`td-node-label ${nd.state}${nd.x > 80 ? ' end' : ''}${nd.y < 45 ? ' above' : ''}${nd.ph.id === currentPhase ? ' current' : ''}`} aria-hidden>
                  {pad(nd.ph.number)} {nd.ph.title.split(/ [&,]| and /)[0]}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
      <ul className="td-sky-legend" aria-label="Legend">
        <li>
          <span className="td-key done" aria-hidden />
          Passed
        </li>
        <li>
          <span className="td-key now" aria-hidden />
          In progress
        </li>
        <li>
          <span className="td-key todo" aria-hidden />
          Ahead
        </li>
      </ul>
    </section>
  );
}

// ---------- study activity: the last 4 weeks + streak ----------
function Activity({ days }: { days: string[] | undefined }) {
  const today = localDay();
  const set = new Set(days ?? []);
  const streak = studyStreak(days, today);
  const streakDays = new Set(Array.from({ length: streak }, (_, i) => shiftDay(set.has(today) ? today : shiftDay(today, -1), -i)));
  const cells = Array.from({ length: 28 }, (_, i) => {
    const day = shiftDay(today, i - 27);
    return { day, on: set.has(day), today: day === today, streak: streakDays.has(day) };
  });
  const studied = cells.filter((c) => c.on).length;
  const fmt = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const todayDone = set.has(today);
  return (
    <section className="card td-activity" aria-labelledby="activity-title" data-guide="activity">
      <h2 id="activity-title" className="lbl">
        Study activity · last 4 weeks
      </h2>
      <div className="td-heat" role="img" aria-label={`Activity: studied on ${studied} of the last 28 days${streak ? `, including the last ${streak} in a row` : ''}.`}>
        {cells.map((c) => (
          <span
            key={c.day}
            className={`td-heat-cell${c.on ? ' on' : ''}${c.streak ? ' streak' : ''}${c.today ? ' today' : ''}`}
            title={`${fmt(c.day)}${c.today ? ' (today)' : ''}: ${c.on ? 'studied' : 'no study'}`}
          />
        ))}
      </div>
      <p className="td-activity-note">
        {streak ? (
          <>
            <strong>{plural(streak, 'day')} in a row.</strong> {todayDone ? 'Today is in the bag. Come back tomorrow to keep it going.' : 'Study anything today to keep the streak alive.'}
          </>
        ) : studied ? (
          <>
            <strong>{plural(studied, 'study day')} this month.</strong> Read one section today to start a new streak.
          </>
        ) : (
          <>
            <strong>No study days yet.</strong> Read your first section and today lights up.
          </>
        )}
      </p>
    </section>
  );
}
