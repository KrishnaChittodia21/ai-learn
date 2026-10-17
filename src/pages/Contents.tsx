// Syllabus: every level, phase, topic and section of the course as one searchable index.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, CirclePlay, Search } from 'lucide-react';
import { COMPANY_QUESTIONS, LEVELS, PHASES, TOPICS } from '../content';
import { PROJECTS, projectsForTopic } from '../content/projects';
import { useProgress } from '../lib/progress';
import { companyUnlocked, topicCompletion, topicStatus, type TopicStatus } from '../lib/stats';
import { codeLabLabel } from '../lib/nextStep';
import { currentlyWrong, weakTopics } from '../lib/weak';
import { VIZ, vizForSection } from '../viz/registry';
import type { Topic } from '../types';

/** section → has an interactive visualisation (computed once) */
const VIZ_SECTIONS = new Map(TOPICS.map((t) => [t.id, t.sections.map((s) => vizForSection(t.id, s.heading).length > 0)]));

const TOTALS: [string, number][] = [
  ['Phases', PHASES.filter((ph) => TOPICS.some((t) => t.phase === ph.id)).length],
  ['Topics', TOPICS.length],
  ['Sections', TOPICS.reduce((a, t) => a + t.sections.length, 0)],
  ['Animations', VIZ.length],
  ['Coding exercises', TOPICS.reduce((a, t) => a + t.sections.filter((s) => s.exercise).length, 0)],
  ['Code labs', TOPICS.reduce((a, t) => a + t.codeChallenges.length, 0)],
  ['Interview Qs', TOPICS.reduce((a, t) => a + t.interviewQuestions.length, 0)],
  ['Estimation drills', TOPICS.reduce((a, t) => a + t.envelopeQuestions.length, 0)],
  ['Exam questions', TOPICS.reduce((a, t) => a + t.test.length, 0)],
  ['Challenges', COMPANY_QUESTIONS.length],
];

const NUMERALS = ['I', 'II', 'III'];
const STATUS_LABEL: Record<TopicStatus, string> = {
  passed: 'Covered',
  'in-progress': 'In progress',
  new: 'Not started',
};
const pad = (n: number) => String(n).padStart(2, '0');

/** Wrap every case-insensitive occurrence of `q` in <mark>. */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  for (let at = lower.indexOf(q, i); at >= 0; at = lower.indexOf(q, i)) {
    out.push(text.slice(i, at), <mark key={at}>{text.slice(at, at + q.length)}</mark>);
    i = at + q.length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

interface TopicView {
  topic: Topic;
  /** section indexes to show */
  sections: number[];
  /** the filter matched individual sections, so list them without being asked */
  showSections: boolean;
}

type PlanetState = 'passed' | 'now' | 'ahead';
const PLANET_LABEL: Record<PlanetState, string> = {
  passed: 'covered',
  now: 'in progress',
  ahead: 'ahead',
};
/** orbit diameter as a share of the galaxy, inner → outer (I, II, III) */
const ORBIT_SIZE = [30, 61, 91];

export default function ContentsPage() {
  const p = useProgress();
  const nav = useNavigate();
  const { hash } = useLocation();
  const [query, setQuery] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyViz, setOnlyViz] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const q = useDeferredValue(query.trim().toLowerCase());
  const filtering = !!q || onlyUnread || onlyViz;

  const phases = useMemo(() => {
    return PHASES.map((ph) => {
      const phaseHit = !!q && (ph.title.toLowerCase().includes(q) || ph.blurb.toLowerCase().includes(q));
      const views: TopicView[] = [];
      for (const t of TOPICS.filter((x) => x.phase === ph.id)) {
        const read = new Set(p.sections[t.id] ?? []);
        const topicHit =
          phaseHit ||
          !q ||
          t.title.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q) ||
          t.tags.some((g) => g.toLowerCase().includes(q));
        const sections = t.sections
          .map((_, i) => i)
          .filter((i) => (!onlyUnread || !read.has(i)) && (!onlyViz || VIZ_SECTIONS.get(t.id)?.[i]))
          .filter((i) => topicHit || t.sections[i].heading.toLowerCase().includes(q));
        if (sections.length || (topicHit && !onlyUnread && !onlyViz))
          views.push({
            topic: t,
            sections,
            showSections: sections.length > 0 && (onlyUnread || onlyViz || !topicHit),
          });
      }
      return {
        ph,
        views,
        total: TOPICS.filter((x) => x.phase === ph.id).length,
      };
    }).filter((x) => x.total > 0);
  }, [p.sections, q, onlyUnread, onlyViz]);

  /** per-phase progress for the galaxy and the level panels */
  const { rows: orbit, current } = useMemo(() => {
    const rows = PHASES.map((ph) => {
      const ts = TOPICS.filter((t) => t.phase === ph.id);
      const st = ts.map((t) => topicStatus(p, t));
      const passed = st.filter((s) => s === 'passed').length;
      const touched = st.some((s) => s !== 'new');
      // a passed topic counts in full; the rest by how much of their work is done
      const meter = ts.length ? Math.round(ts.reduce((a, t, i) => a + (st[i] === 'passed' ? 100 : topicCompletion(p, t)), 0) / ts.length) : 0;
      return {
        ph,
        total: ts.length,
        passed,
        touched,
        meter,
        state: 'ahead' as PlanetState,
      };
    }).filter((r) => r.total > 0);
    const firstOpen = rows.find((r) => r.passed < r.total);
    for (const r of rows) r.state = r.passed === r.total ? 'passed' : r.touched || r === firstOpen ? 'now' : 'ahead';
    return { rows, current: firstOpen?.ph.id };
  }, [p]);

  const matchCount = phases.reduce((a, x) => a + x.views.length, 0);
  const covered = TOPICS.filter((t) => topicStatus(p, t) === 'passed').length;
  const coveredPct = Math.round((covered / Math.max(1, TOPICS.length)) * 100);

  // deep links (/contents#phase-<id>) jump straight there; the jump bar scrolls smoothly itself
  const jumping = useRef(false);
  useEffect(() => {
    if (!hash || jumping.current) {
      jumping.current = false;
      return;
    }
    const raf = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(raf);
  }, [hash]);

  const jump = (id: string) => {
    jumping.current = true;
    nav({ hash: id }, { replace: true });
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // a collapsed phase opens when you jump to it
    if (id.startsWith('phase-')) setCollapsed((c) => ({ ...c, [id.slice(6)]: false }));
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'start',
      }),
    );
  };
  const setAll = (value: boolean) => setCollapsed(Object.fromEntries(PHASES.map((ph) => [ph.id, value])));
  const phaseCount = orbit.length;

  return (
    <div className="page syllabus">
      <header className="syl-head">
        <div className="syl-head-text">
          <p className="syl-kicker">
            Syllabus · {LEVELS.length} levels · {phaseCount} phases · {TOPICS.length} topics
          </p>
          <h1>
            <span className="gtext">The GenAI universe</span>
          </h1>
          <p className="syl-lead">
            {covered} of {TOPICS.length} topics covered. Search it, filter it, or open any tab of a topic directly.
          </p>
        </div>
        <div className="syl-search-wrap" role="search">
          <label className="syl-search glass">
            <Search size={18} aria-hidden />
            <span className="sr-only">Search the syllabus</span>
            <input type="search" placeholder="Search topics, sections, keywords…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      </header>

      {!filtering && (
        <>
          <figure className="syl-galaxy" aria-labelledby="syl-galaxy-cap">
            <figcaption id="syl-galaxy-cap" className="sr-only">
              Galaxy map: {coveredPct}% of topics covered.{' '}
              {LEVELS.map((lv, li) => {
                const rows = orbit.filter((r) => r.ph.level === lv.id);
                const done = rows.filter((r) => r.state === 'passed').length;
                return `${['Inner', 'Middle', 'Outer'][li]} orbit, ${lv.title}: ${rows.length} phases, ${done} covered. `;
              })}
            </figcaption>
            <div className="syl-sky" aria-hidden>
              {LEVELS.map((lv, li) => {
                const rows = orbit.filter((r) => r.ph.level === lv.id);
                return (
                  <div key={lv.id} className={`syl-orbit o-${li + 1}`} style={{ '--size': `${ORBIT_SIZE[li] ?? 91}%` } as CSSProperties}>
                    {rows.map((r, i) => {
                      const a = (i / rows.length) * Math.PI * 2 - Math.PI / 2;
                      return (
                        <button
                          key={r.ph.id}
                          type="button"
                          tabIndex={-1}
                          className={`syl-planet p-${r.state}`}
                          style={{
                            left: `${50 + 50 * Math.cos(a)}%`,
                            top: `${50 + 50 * Math.sin(a)}%`,
                          }}
                          title={`${pad(r.ph.number)} ${r.ph.title}: ${r.passed}/${r.total} ${PLANET_LABEL[r.state]}`}
                          onClick={() => jump(`phase-${r.ph.id}`)}
                        >
                          <span>{pad(r.ph.number)}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <div className="syl-core">
                <span className="syl-core-num">{coveredPct}%</span>
                <span className="syl-core-lbl">covered</span>
              </div>
            </div>
            <ul className="syl-legend" aria-hidden>
              {LEVELS.map((lv, li) => (
                <li key={lv.id} className={`lv-${li + 1}`}>
                  <span className="syl-legend-dot" />
                  {['inner', 'middle', 'outer'][li]} orbit · {NUMERALS[li]} {lv.title}
                </li>
              ))}
              <li className="syl-legend-states">
                <span className="syl-mini p-passed" /> covered
                <span className="syl-mini p-now" /> in progress
                <span className="syl-mini p-ahead" /> ahead
              </li>
            </ul>
          </figure>

          <div className="syl-overview">
            {LEVELS.map((lv, li) => {
              const rows = orbit.filter((r) => r.ph.level === lv.id);
              const passed = rows.reduce((a, r) => a + r.passed, 0);
              const total = rows.reduce((a, r) => a + r.total, 0);
              return (
                <section key={lv.id} className={`syl-panel lv-${li + 1}`} aria-labelledby={`syl-ov-${lv.id}`}>
                  <header className="syl-panel-head">
                    <span className="syl-panel-num" aria-hidden>
                      {NUMERALS[li]}
                    </span>
                    <h2 id={`syl-ov-${lv.id}`}>
                      <span className="sr-only">Level {NUMERALS[li]}: </span>
                      {lv.title}
                    </h2>
                    <span className="syl-panel-count">
                      {passed}/{total}
                      <span className="sr-only"> topics covered</span>
                    </span>
                  </header>
                  <ul className="syl-prows">
                    {rows.map((r) => (
                      <li key={r.ph.id}>
                        <a
                          href={`#phase-${r.ph.id}`}
                          className={`syl-prow s-${r.state} ${r.ph.id === current ? 'cur' : ''}`}
                          aria-current={r.ph.id === current ? 'location' : undefined}
                          onClick={(e) => {
                            e.preventDefault();
                            jump(`phase-${r.ph.id}`);
                          }}
                        >
                          <span className="syl-prow-num">{pad(r.ph.number)}</span>
                          <span className="syl-prow-title">{r.ph.title}</span>
                          <span className="syl-meter" aria-hidden>
                            <span style={{ width: `${r.meter}%` }} />
                          </span>
                          <span className="syl-prow-count">
                            {r.passed}/{r.total}
                            <span className="sr-only"> topics covered, {PLANET_LABEL[r.state]}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <dl className="syl-totals" aria-label="Course totals">
            {TOTALS.map(([label, n]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{n}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <div className="syl-tools" role="group" aria-label="Filters">
        <div className="syl-filters">
          <button type="button" className={`chip ${onlyUnread ? 'on' : ''}`} aria-pressed={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>
            Only unread
          </button>
          <button type="button" className={`chip ${onlyViz ? 'on' : ''}`} aria-pressed={onlyViz} onClick={() => setOnlyViz((v) => !v)}>
            <CirclePlay size={14} aria-hidden /> Only with animations
          </button>
          {filtering && (
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={() => {
                setQuery('');
                setOnlyUnread(false);
                setOnlyViz(false);
              }}
            >
              Clear
            </button>
          )}
          <span className="syl-filters-end">
            <span className="syl-match" aria-live="polite">
              {filtering ? `${matchCount} topic${matchCount === 1 ? '' : 's'} match` : ''}
            </span>
            <button type="button" className="link-btn small" onClick={() => setAll(false)} disabled={filtering}>
              Expand all
            </button>
            <button type="button" className="link-btn small" onClick={() => setAll(true)} disabled={filtering}>
              Collapse all
            </button>
          </span>
        </div>
      </div>

      <nav className="syl-jump" aria-label="Jump to phase">
        <ol>
          {phases.map(({ ph, views }) => {
            const st = orbit.find((r) => r.ph.id === ph.id)?.state ?? 'ahead';
            return (
              <li key={ph.id}>
                <button
                  type="button"
                  className={`j-${st} ${filtering && !views.length ? 'dim' : ''}`}
                  onClick={() => jump(`phase-${ph.id}`)}
                  title={ph.title}
                  aria-label={`Phase ${ph.number}: ${ph.title}`}
                >
                  {pad(ph.number)}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="syl-jump-tools" onClick={() => jump('phase-tools')}>
              Practice &amp; tools
            </button>
          </li>
        </ol>
      </nav>

      {filtering && matchCount === 0 && <p className="syl-empty">Nothing in the syllabus matches. Try a shorter search or clear the filters.</p>}

      {LEVELS.map((lv, li) => {
        const lvPhases = phases.filter((x) => x.ph.level === lv.id && (!filtering || x.views.length));
        if (!lvPhases.length) return null;
        const lvTopics = TOPICS.filter((t) => PHASES.some((ph) => ph.level === lv.id && ph.id === t.phase));
        const lvPassed = lvTopics.filter((t) => topicStatus(p, t) === 'passed').length;
        return (
          <section key={lv.id} className={`syl-level lv-${li + 1}`} aria-labelledby={`syl-level-${lv.id}`}>
            <header className="syl-level-head">
              <span className="syl-numeral" aria-hidden>
                {NUMERALS[li]}
              </span>
              <div>
                <h2 id={`syl-level-${lv.id}`}>
                  <span className="sr-only">Level {NUMERALS[li]}: </span>
                  {lv.title}
                </h2>
                <p>{lv.blurb}</p>
              </div>
              <span className="syl-count">
                {lvPassed}/{lvTopics.length} covered
              </span>
            </header>

            {lvPhases.map(({ ph, views, total }) => {
              const passed = TOPICS.filter((t) => t.phase === ph.id && topicStatus(p, t) === 'passed').length;
              const open = filtering || !collapsed[ph.id];
              const st = orbit.find((r) => r.ph.id === ph.id)?.state ?? 'ahead';
              return (
                <section key={ph.id} id={`phase-${ph.id}`} className={`syl-phase s-${st}`} aria-labelledby={`syl-ph-${ph.id}`}>
                  <h3 className="syl-phase-h">
                    <button
                      type="button"
                      id={`syl-ph-${ph.id}`}
                      className="syl-phase-head"
                      aria-expanded={open}
                      aria-controls={`syl-body-${ph.id}`}
                      disabled={filtering}
                      onClick={() => setCollapsed((c) => ({ ...c, [ph.id]: !c[ph.id] }))}
                    >
                      <span className="syl-phase-num">{pad(ph.number)}</span>
                      <span className="syl-phase-text">
                        <span className="syl-phase-title">
                          <Hl text={ph.title} q={q} />
                        </span>
                        <span className="syl-phase-blurb">
                          <Hl text={ph.blurb} q={q} />
                        </span>
                      </span>
                      <span className={`syl-phase-count ${passed === total ? 'done' : ''}`}>
                        {passed}/{total}
                        <span className="sr-only"> topics covered</span>
                      </span>
                      <ChevronDown size={16} aria-hidden className={`syl-chev ${open ? 'open' : ''}`} />
                    </button>
                  </h3>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        key="body"
                        id={`syl-body-${ph.id}`}
                        className="collapse-anim"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                      >
                        <TopicTable phaseNumber={ph.number} phaseTitle={ph.title} views={views} q={q} quietHead={ph.id !== lvPhases[0].ph.id} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              );
            })}
          </section>
        );
      })}

      <ToolsGroup />
    </div>
  );
}

function TopicTable({
  phaseNumber,
  phaseTitle,
  views,
  q,
  quietHead,
}: {
  phaseNumber: number;
  phaseTitle: string;
  views: TopicView[];
  q: string;
  /** column heads are printed once per level; later tables keep them for screen readers only */
  quietHead: boolean;
}) {
  return (
    <table className="syl-table">
      <caption className="sr-only">
        Topics in phase {phaseNumber}, {phaseTitle}
      </caption>
      <thead className={quietHead ? 'quiet' : undefined}>
        <tr>
          <th scope="col" className="c-num">
            No.
          </th>
          <th scope="col" className="c-topic">
            Topic
          </th>
          <th scope="col" className="c-sec">
            Read
          </th>
          <th scope="col" className="c-status">
            Status
          </th>
          <th scope="col" className="c-best">
            Best exam
          </th>
          <th scope="col" className="c-open">
            Open
          </th>
        </tr>
      </thead>
      <tbody>
        {views.map((v) => (
          <TopicRow key={v.topic.id} view={v} phaseNumber={phaseNumber} q={q} />
        ))}
      </tbody>
    </table>
  );
}

function TopicRow({ view, phaseNumber, q }: { view: TopicView; phaseNumber: number; q: string }) {
  const p = useProgress();
  const { topic: t, sections, showSections } = view;
  const [expanded, setExpanded] = useState(false);
  const read = new Set(p.sections[t.id] ?? []);
  const readCount = t.sections.filter((_, i) => read.has(i)).length;
  const st = topicStatus(p, t);
  const rec = p.tests[t.id];
  const capstones = projectsForTopic(t.id).length;
  const base = `/topic/${t.id}`;
  const open = showSections || expanded;
  const listed = showSections ? sections : t.sections.map((_, i) => i);
  const links: { label: string; long: string; to: string; show: boolean }[] = [
    { label: 'Read', long: 'Read', to: `${base}?tab=learn`, show: true },
    {
      label: 'Lab',
      long: codeLabLabel(t),
      to: `${base}?tab=code`,
      show: t.codeChallenges.length > 0,
    },
    {
      label: 'Questions',
      long: 'Interview questions',
      to: `${base}?tab=interview`,
      show: t.interviewQuestions.length > 0,
    },
    {
      label: 'Estimation',
      long: 'Estimation',
      to: `${base}?tab=envelope`,
      show: t.envelopeQuestions.length > 0,
    },
    {
      label: 'Exam',
      long: 'Exam',
      to: `${base}?tab=exam`,
      show: t.test.length > 0,
    },
    {
      label: 'Capstone',
      long: 'Capstone',
      to: `${base}?tab=capstone`,
      show: capstones > 0,
    },
  ];
  return (
    <>
      <tr className={`syl-row st-${st}`}>
        <td className="c-num">
          {phaseNumber}.{t.order}
        </td>
        <th scope="row" className="c-topic">
          <Link to={base} className="syl-topic-link">
            <Hl text={t.title} q={q} />
          </Link>
          <span className="syl-topic-sub">
            <Hl text={t.subtitle} q={q} />
          </span>
        </th>
        <td className="c-sec">
          <button
            type="button"
            className="syl-sec-toggle"
            aria-expanded={open}
            disabled={showSections}
            onClick={() => setExpanded((e) => !e)}
            aria-label={`${readCount} of ${t.sections.length} sections read. ${open ? 'Hide' : 'Show'} sections of ${t.title}`}
          >
            <span>
              {readCount}/{t.sections.length}
            </span>
            <ChevronDown size={13} aria-hidden className={`syl-chev ${open ? 'open' : ''}`} />
          </button>
        </td>
        <td className="c-status">
          <span className={`syl-status ${st}`}>
            <span className="syl-tick" aria-hidden />
            {STATUS_LABEL[st]}
          </span>
        </td>
        <td className={`c-best ${st === 'passed' ? 'good' : ''}`}>
          {rec ? (
            `${rec.best}%`
          ) : (
            <span className="syl-none">
              —<span className="sr-only">no attempt</span>
            </span>
          )}
        </td>
        <td className="c-open">
          <ul className="syl-links">
            {links
              .filter((l) => l.show)
              .map((l) => (
                <li key={l.label}>
                  <Link to={l.to} aria-label={`${l.long}: ${t.title}`}>
                    {l.label}
                  </Link>
                </li>
              ))}
          </ul>
        </td>
      </tr>
      {open && listed.length > 0 && (
        <tr className="syl-secrow">
          <td colSpan={6}>
            <ol className="syl-sections">
              {listed.map((i) => (
                <li key={i} className={read.has(i) ? 'read' : ''}>
                  <Link to={`${base}?tab=learn&s=${i}`}>
                    <span className="syl-sec-num">§{i + 1}</span>
                    <span className="syl-sec-title">
                      <Hl text={t.sections[i].heading} q={q} />
                    </span>
                    {VIZ_SECTIONS.get(t.id)?.[i] && <CirclePlay size={14} className="syl-sec-viz" aria-label="Has an interactive animation" />}
                    {read.has(i) && <Check size={14} className="syl-sec-read" aria-label="Read" />}
                  </Link>
                </li>
              ))}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}

function ToolsGroup() {
  const p = useProgress();
  const { unlocked, remaining } = companyUnlocked(p, TOPICS);
  const companyDone = COMPANY_QUESTIONS.filter((q) => p.company[q.id]).length;
  const weak = weakTopics(p, TOPICS).length;
  const mistakes = TOPICS.reduce((a, t) => a + currentlyWrong(p, t).length, 0);
  const rows: {
    to: string;
    title: string;
    desc: string;
    state: string;
    flag?: boolean;
  }[] = [
    {
      to: '/challenges',
      title: 'Architecture challenges',
      desc: `${COMPANY_QUESTIONS.length} end-to-end GenAI system design challenges with a mock-interview timer.`,
      state: unlocked
        ? `${companyDone}/${COMPANY_QUESTIONS.length} done`
        : `Locked · ${remaining.length} exam${remaining.length === 1 ? '' : 's'} to pass`,
    },
    {
      to: '/weak-areas',
      title: 'Weak areas',
      desc: 'The sections behind the questions you miss.',
      state: weak ? `${weak} topic${weak === 1 ? '' : 's'} need work` : 'Nothing yet',
      flag: weak > 0,
    },
    {
      to: '/practice',
      title: 'Practice',
      desc: 'A timed drill of every exam question you currently get wrong.',
      state: `${mistakes} question${mistakes === 1 ? '' : 's'}`,
      flag: mistakes > 0,
    },
    {
      to: '/settings',
      title: 'Settings',
      desc: 'Pass mark, exam timing, study-first lock, theme, coach tips, guide and reset.',
      state: '',
    },
  ];
  return (
    <section id="phase-tools" className="syl-tools-group" aria-labelledby="syl-tools-title">
      <header className="syl-level-head">
        <span className="syl-numeral" aria-hidden>
          §
        </span>
        <div>
          <h2 id="syl-tools-title">Practice &amp; tools</h2>
          <p>Everything outside the topic pages.</p>
        </div>
      </header>
      <ul className="syl-toollist">
        {rows.map((r) => (
          <li key={r.to}>
            <Link to={r.to} className="syl-tool-title">
              {r.title}
            </Link>
            <span className="syl-tool-desc">{r.desc}</span>
            <span className={`syl-tool-state ${r.flag ? 'flag' : ''}`}>{r.state}</span>
          </li>
        ))}
        {PROJECTS.length > 0 && (
          <li>
            <span className="syl-tool-title">Capstone projects</span>
            <span className="syl-tool-desc">
              Real code projects in this repo, judged by tests:{' '}
              {PROJECTS.map((pr, i) => (
                <span key={pr.id}>
                  {i > 0 && ', '}
                  <Link to={`/topic/${pr.topics[0]}?tab=capstone`}>{pr.title}</Link>
                </span>
              ))}
              .
            </span>
            <span className="syl-tool-state">{PROJECTS.length}</span>
          </li>
        )}
      </ul>
    </section>
  );
}
