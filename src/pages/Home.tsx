import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CirclePlay, HardDriveDownload, Play } from 'lucide-react';
import { COMPANY_QUESTIONS, LEVEL_OF_TOPIC, LEVELS, PHASES, TOPICS, TOPIC_BY_ID } from '../content';
import { useProgress, type Progress } from '../lib/progress';
import { topicCompletion, topicStatus } from '../lib/stats';
import { weakTopics } from '../lib/weak';
import { nextStep } from '../lib/nextStep';
import { roleTopicIds } from '../content/roles';
import { getUiPrefs, saveUiPrefs, useUiPrefs } from '../lib/uiPrefs';
import { backupDue } from '../lib/backup';
import { exportNow } from '../lib/exportNow';
import { NeuralCoverage } from '../components/NeuralCoverage';
import { ShortThumb } from '../components/ShortThumb';
import { SaveButton } from '../components/SaveButton';
import { shortLength } from '../lib/shorts';
import { useShorts } from '../lib/useShorts';
import { useInViewPause } from '../lib/useInViewPause';
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

/** Human label for a saved location, e.g. "Embeddings · Read · Section 3: Vector Similarity" (topic left out when it is `current`). */
function describeLocation(loc: string, current?: string): string | null {
  const [path, search = ''] = loc.split('?');
  const params = new URLSearchParams(search);
  const topic = /^\/topic\/([^/]+)/.exec(path);
  if (topic) {
    const t = TOPIC_BY_ID.get(topic[1]);
    if (!t) return null;
    const tab = params.get('tab') ?? 'learn';
    const s = Number(params.get('s'));
    const sec = tab === 'learn' && params.has('s') && t.sections[s] ? ` · Section ${s + 1}: ${t.sections[s].heading.split(' — ')[0]}` : '';
    if (t.id === current) return sec ? sec.slice(3) : `${TAB_LABELS[tab] ?? 'Read'} · ${shortTitle(t.title)}`;
    return `${shortTitle(t.title)} · ${TAB_LABELS[tab] ?? 'Read'}${sec}`;
  }
  const cq = /^\/challenges\/(.+)$/.exec(path);
  if (cq) return COMPANY_QUESTIONS.find((q) => q.id === cq[1])?.title ?? null;
  return PAGE_LABELS[path] ?? null;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Dashboard (#/): the next step, getting started, today's Short and what's open. Progress tracking is on Track. */
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
  const status = useMemo(() => new Map(TOPICS.map((t) => [t.id, topicStatus(p, t)])), [p]);
  const passed = TOPICS.filter((t) => status.get(t.id) === 'passed').length;
  const coveredPct = pct(passed, TOPICS.length);
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
              {fresh && topic ? `${plural(topic.sections.length, 'short section')} · start with section 1: ${topic.sections[0]?.heading.split(' — ')[0] ?? ''}` : sectionsLine ? `${sectionsLine} · up next: ${step.kind === 'read' ? step.title.replace(/^Read /, '').split(' — ')[0] : step.title}` : step.detail}
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

    </div>
  );
}

/** Today's Short: once watched it stays up (ticked) until tomorrow's pick. */
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
              <Check size={14} aria-hidden /> Watched · a new pick tomorrow, or browse them all
            </p>
            <Link className="small" to={`/topic/${entry.topic.id}?tab=learn&s=${entry.section}`}>
              Learn it: section {entry.section + 1} →
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

