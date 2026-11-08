import { Suspense, useEffect, useState } from 'react';
import { RouteSkeleton } from '../components/RouteSkeleton';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PHASES, TOPICS, TOPIC_BY_ID } from '../content';
import type { CodeChallenge, EnvelopeQuestion, InterviewQuestion, Topic } from '../types';
import {
  rateIQ,
  setDraft,
  markAllSectionsRead,
  recordSteps,
  setFlag,
  toggleSectionRead,
  useProgress,
  type Rating,
} from '../lib/progress';
import { Badge, CodeBlock, CodeEditor, Diagram, DifficultyBadge, FollowUps, Markdown, ProgressBar, Reveal } from '../components/ui';
import { practiceLocked, topicCompletion, topicStatus } from '../lib/stats';
import { topicSteps } from '../lib/nextStep';
import { StudyPath, type TabId } from '../components/StudyPath';
import { CoachTip } from '../components/CoachTip';
import { NextUp } from '../components/NextUp';
import { ArrowLeft, BookOpen, Check, ChevronDown, CirclePlay, Crosshair, Library, Lightbulb, Lock, Play } from 'lucide-react';
import { getUiPrefs, saveUiPrefs, useUiPrefs } from '../lib/uiPrefs';
import { cameFrom, pageLabel } from '../lib/navHistory';
import { PREREQS } from '../content/prereqs';
import { drillsForTopic } from '../content/drills';
import { projectsForTopic } from '../content/projects';
import { CapstoneTab } from '../components/Capstone';
import { vizForSection } from '../viz/registry';
import { SectionPractice } from '../components/SectionPractice';
import { PromptLabTab } from '../components/PromptLab';
import { SaveButton } from '../components/SaveButton';
import { ShortThumb } from '../components/ShortThumb';
import { shortLength } from '../lib/shorts';
import { SHORTS, useShorts } from '../lib/useShorts';
import { currentlyWrong, weakSections } from '../lib/weak';
import { CoreView, GoDeeper, ModeSwitch } from '../components/ReadViewLearn';
import { StepLesson } from '../components/steps/StepLesson';
import { showToast } from '../lib/toast';
import { useTopic } from '../lib/useTopic';
import { CheatExtra } from '../components/CheatExtra';

const TAB_IDS: TabId[] = ['learn', 'code', 'prompt-lab', 'interview', 'envelope', 'cheat', 'capstone', 'exam'];

/** First-time tips, one per tab type (Settings → "Show coach tips"). */
const TIPS: Record<TabId, { title: string; text: string }> = {
  learn: {
    title: 'How to use Learn:',
    text: 'each section is short: read it, study the worked example and the pros/cons (every con comes with its fix), then do the "Try it" coding exercise and the quick check. Tick "Read" when you are done. Sections with an interactive animation let you play with the idea.',
  },
  code: {
    title: 'How to use the lab:',
    text: 'edit the starter in place (it saves automatically), open hints one at a time, then compare with the reference solution and mark it done.',
  },
  'prompt-lab': {
    title: 'How to use the Prompt Lab:',
    text: 'rewrite the weak prompt in the SYSTEM and USER boxes and watch the live scorecard: each check flips as your prompt gains structure. It grades offline, so it checks structure, not real model behaviour. Reach the pass mark, then compare with the model answer.',
  },
  interview: {
    title: 'How to practise:',
    text: 'answer out loud or type a draft before revealing anything, then rate yourself honestly. "Partially" and "Missed" ratings feed Weak Areas.',
  },
  envelope: {
    title: 'How to drill estimates:',
    text: 'estimate tokens, cost, latency or GPU memory yourself first, then reveal the assumptions and each step to check your maths and the design insight.',
  },
  cheat: { title: 'Cheat sheet:', text: 'a quick revision list to skim before the exam or a GenAI interview, not a replacement for the lessons.' },
  capstone: {
    title: 'Capstones:',
    text: 'build the project in your editor, run its judge command, and the test results appear here automatically.',
  },
  exam: {
    title: 'About the exam:',
    text: 'timed and shuffled. Only full-length attempts at or above the pass mark count. Questions you miss show up in Weak Areas.',
  },
};

export default function TopicPage() {
  const { id = '' } = useParams();
  const topic = useTopic(id);
  if (topic === null) {
    return (
      <div className="page">
        <h1>Topic not found</h1>
        <Link to="/">← Back to dashboard</Link>
      </div>
    );
  }
  // keyed by topic, so moving to another topic remounts the view (fresh Read/Steps choices and Back origin)
  return topic ? <TopicView key={topic.id} topic={topic} /> : <RouteSkeleton />;
}

function TopicView({ topic }: { topic: Topic }) {
  const [params, setParams] = useSearchParams();
  const p = useProgress();
  const tab = (TAB_IDS.find((t) => t === params.get('tab')) ?? 'learn') as TabId;
  const phase = PHASES.find((ph) => ph.id === topic.phase);
  const idx = TOPICS.findIndex((t) => t.id === topic.id);
  const nav = useNavigate();
  const { key, pathname } = useLocation();
  // Back: to wherever the learner came from (named on the button); on a fresh deep link, to this topic's phase
  // in the Syllabus, opened. The origin is read once, when the topic opens.
  const [from] = useState(() => (key !== 'default' ? cameFrom(pathname) : null));
  const fromLabel = (from && pageLabel(from, (id) => TOPICS.find((t) => t.id === id)?.title)) || 'Syllabus';
  const back = () => (from ? nav(-1) : nav(phase ? `/contents#phase-${phase.id}` : '/contents'));
  const prev = TOPICS[idx - 1];
  const next = TOPICS[idx + 1];
  const capstones = projectsForTopic(topic.id);
  const steps = topicSteps(p, topic, capstones.length);
  const locks: Partial<Record<TabId, boolean>> = {
    interview: practiceLocked(p, topic, 'interview'),
    exam: practiceLocked(p, topic, 'exam'),
  };
  const pct = topicCompletion(p, topic);
  const selectTab = (t: TabId) => setParams({ tab: t }, { replace: true });
  const at = params.get('at');
  // "Next up" target after the current tab: the following study-path step, else the next topic
  const stepIds = steps.map((s) => s.id as TabId);
  const after = tab === 'cheat' ? (stepIds.includes('exam') ? 'exam' : undefined) : stepIds[stepIds.indexOf(tab) + 1];
  const afterLabel = steps.find((s) => s.id === after)?.label;
  const nextUp = after ? (
    <NextUp
      lead={
        <>
          <strong>{tab === 'learn' ? 'Finished reading?' : 'Done here?'}</strong> Next: {afterLabel}
          {after === 'exam' && <span className="muted small"> · pass mark {p.settings.passMark}%</span>}
        </>
      }
      label={`Go to ${afterLabel}`}
      onClick={() => {
        selectTab(after);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    />
  ) : next ? (
    <NextUp
      lead={
        <>
          <strong>{topicStatus(p, topic) === 'passed' ? 'Topic done.' : 'Finished this topic?'}</strong> Next topic: {next.title}
        </>
      }
      label={`Next topic: ${next.title}`}
      to={`/topic/${next.id}`}
    />
  ) : (
    <NextUp lead={<strong>That was the last topic.</strong>} label="Architecture Challenges" to="/challenges" />
  );

  const passed = topicStatus(p, topic) === 'passed';
  // "Retrieval Fundamentals: Keyword, BM25…" → big gradient head + a quieter second line
  const colon = topic.title.indexOf(': ');
  const titleMain = colon > 0 ? topic.title.slice(0, colon) : topic.title;
  const titleRest = colon > 0 ? topic.title.slice(colon + 2) : '';
  const levelNum = phase ? ({ beginner: 'I', intermediate: 'II', advanced: 'III' } as Record<string, string>)[phase.level] : undefined;

  return (
    <div className="page tp">
      <div className="tp-topbar">
        <button type="button" className="btn btn-sm tp-back" onClick={back}>
          <ArrowLeft size={15} aria-hidden /> Back to {fromLabel}
        </button>
        <p className="tp-here" aria-current="page">
          You&apos;re on <strong>{titleMain}</strong>
        </p>
      </div>

      <header className="tp-hero glass">
        <div className="tp-hero-glow" aria-hidden />
        <div className="tp-hero-row">
          <div className="tp-hero-text">
            <div className="tp-hero-chips">
              {phase && (
                <span className={`tp-chip level ${phase.level}`}>
                  {levelNum ? `${levelNum} · ` : ''}
                  {phase.level}
                </span>
              )}
              <span className="tp-chip">
                {topic.estimatedMinutes} min · {topic.sections.length} section{topic.sections.length === 1 ? '' : 's'}
                {topic.test.length > 0 && ` · ${topic.test.length}-Q exam`}
              </span>
            </div>
            <h1 className="tp-title">
              <span className="gtext">{titleMain}</span>
              {titleRest && <span className="tp-title-rest">{titleRest}</span>}
            </h1>
            {topic.subtitle && <p className="tp-subtitle">{topic.subtitle}</p>}
            <div className="tp-hero-save">
              <SaveButton kind="topic" refId={topic.id} topicId={topic.id} title={topic.title} />
            </div>
          </div>
          <ProgressRing pct={pct} passed={passed} />
        </div>
      </header>

      <StudyPath steps={steps} active={tab} locks={locks} onSelect={selectTab} />

      <CoachTip id={`tab-${tab}`} title={TIPS[tab].title}>
        {TIPS[tab].text}
      </CoachTip>

      {at && <ScrollToItem key={`${tab}:${at}`} domId={at} />}
      {tab === 'learn' && <LearnTab topic={topic} />}
      {tab !== 'learn' && (
        <div className="tp-tab-panel">
          {tab === 'code' &&
            drillsForTopic(topic.id).map((d) => (
              <p key={d.id} className="tp-ex-bar">
                <span>
                  From-scratch drill: <Link to={`/drills/${d.id}`}>{d.title}</Link> (graded in your browser, {d.minutes} min)
                </span>
                {p.drills?.[d.id]?.passedAt && <Badge tone="good">Passed</Badge>}
              </p>
            ))}
          {tab === 'code' && topic.codeChallenges.map((c, i) => <ChallengeCard key={c.id} c={c} n={i + 1} topicId={topic.id} />)}
          {tab === 'prompt-lab' && (topic.promptLabs?.length ? <PromptLabTab labs={topic.promptLabs} topicId={topic.id} /> : <p className="muted">This topic has no prompt labs yet.</p>)}
          {tab === 'interview' && (locks.interview ? <StudyLock topic={topic} what="interview questions" /> : <InterviewTab topic={topic} />)}
          {tab === 'envelope' && topic.envelopeQuestions.map((q, i) => <EnvelopeCard key={q.id} q={q} n={i + 1} topicId={topic.id} />)}
          {tab === 'cheat' && <CheatSheet topic={topic} />}
          {tab === 'capstone' && <CapstoneTab projects={capstones} />}
          {tab === 'exam' && (locks.exam ? <StudyLock topic={topic} what="exam" /> : <ExamIntro topic={topic} />)}
        </div>
      )}
      {!(tab === 'interview' && locks.interview) && !(tab === 'exam' && locks.exam) && nextUp}

      {(topic.sources.length > 0 || topic.tags.length > 0) && (
        <footer className="tp-colophon">
          {topic.tags.length > 0 && (
            <p>
              <span className="label">Keywords</span>
              {topic.tags.join(' · ')}
            </p>
          )}
          {topic.sources.length > 0 && (
            <details>
              <summary>
                <span className="label">Sources</span> {topic.sources.length} references used for this topic
              </summary>
              <ol>
                {topic.sources.map((src) => (
                  <li key={src}>{src}</li>
                ))}
              </ol>
            </details>
          )}
        </footer>
      )}

      <nav className="tp-topic-pager" aria-label="Topics">
        {prev ? (
          <Link to={`/topic/${prev.id}`} className="tp-topic-link prev">
            <span className="tp-topic-k">← Previous topic</span>
            <span className="tp-topic-t">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/topic/${next.id}`} className="tp-topic-link next">
            <span className="tp-topic-k">Next topic →</span>
            <span className="tp-topic-t">{next.title}</span>
          </Link>
        ) : (
          <Link to="/challenges" className="tp-topic-link next">
            <span className="tp-topic-k">Then →</span>
            <span className="tp-topic-t">Architecture Challenges</span>
          </Link>
        )}
      </nav>
    </div>
  );
}

/** Deep link to one card (`?at=<element id>`, from the Saved page): scroll it into view and flash it once. */
function ScrollToItem({ domId }: { domId: string }) {
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(domId);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1800);
    });
    return () => cancelAnimationFrame(raf);
  }, [domId]);
  return null;
}

/** % complete as a glowing conic ring (real data from topicCompletion). */
function ProgressRing({ pct, passed }: { pct: number; passed: boolean }) {
  const value = passed ? 100 : pct;
  return (
    <div className={`tp-ring ${passed ? 'passed' : ''}`} role="img" aria-label={passed ? 'Topic covered' : `Topic progress ${pct} percent`}>
      <div className="tp-ring-arc" style={{ ['--p' as string]: `${value}%` }} aria-hidden />
      <div className="tp-ring-label" aria-hidden>
        <div className="tp-ring-num">{passed ? <Check size={34} strokeWidth={2.6} /> : `${pct}%`}</div>
        <div className="tp-ring-cap">{passed ? 'Covered' : 'Complete'}</div>
      </div>
    </div>
  );
}

const headingParts = (h: string) => {
  const [title, ...rest] = h.split(' — ');
  return { title, sub: rest.join(' — ') };
};
const sectionNo = (i: number) => String(i + 1).padStart(2, '0');
const scrollToSection = (i: number) => document.getElementById(`s-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** Index of the section the reader is in (the one crossing the upper third of the viewport). */
function useActiveSection(count: number) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const els = Array.from({ length: count }, (_, i) => document.getElementById(`s-${i}`)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number(e.target.id.slice(2)));
        }
      },
      { rootMargin: '-28% 0px -66% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [count]);
  return active;
}

function LearnTab({ topic }: { topic: Topic }) {
  const p = useProgress();
  const read = new Set(p.sections[topic.id] ?? []);
  const [params] = useSearchParams();
  const target = params.get('s');
  const active = useActiveSection(topic.sections.length);
  const [tocOpen, setTocOpen] = useState(false);
  const n = topic.sections.length;
  const { watched } = useShorts();
  const shorts = SHORTS.filter((e) => e.topic.id === topic.id);
  // Read or Steps is chosen per section (keyed by topic so another topic starts fresh); every section opens on Read
  // remembered in this browser per section, so a section you switched to Steps opens on Steps next time
  const stepsOn = useUiPrefs().stepsSections ?? {};
  const modeOf = (i: number) => (stepsOn[`${topic.id}:${i}`] ? 'steps' : 'read');
  const setModeAt = (i: number, m: 'read' | 'steps') => {
    const next = { ...(getUiPrefs().stepsSections ?? {}) };
    if (m === 'steps') next[`${topic.id}:${i}`] = true;
    else delete next[`${topic.id}:${i}`];
    saveUiPrefs({ stepsSections: next });
  };
  // the animation lives in the Read view: switch to it, then scroll there
  const toViz = (i: number) => {
    setModeAt(i, 'read');
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`viz-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  };

  // deep link from weak-area reports: /topic/:id?tab=learn&s=<section index>
  useEffect(() => {
    if (target === null) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`s-${target}`);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1800);
    });
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // the rail's glowing line fills up to the furthest section read
  const furthest = Math.max(-1, ...topic.sections.map((_, i) => (read.has(i) ? i : -1)));
  const fill = n > 1 && furthest >= 0 ? (furthest / (n - 1)) * 100 : 0;

  return (
    <div className="tp-learn">
      <nav className={`tp-rail ${tocOpen ? 'open' : ''}`} aria-label="Sections in this topic" data-guide="sections">
        <button type="button" className="tp-rail-title" aria-expanded={tocOpen} onClick={() => setTocOpen((o) => !o)}>
          <span>
            Contents · {read.size}/{n} read
          </span>
          <ChevronDown size={16} aria-hidden className="tp-rail-chev" />
        </button>
        <ol className="tp-rail-list" style={{ ['--fill' as string]: `${fill}%` }}>
          {topic.sections.map((s, i) => {
            const state = read.has(i) ? 'done' : 'ahead';
            return (
              <li key={s.heading} className={`${state} ${i === active ? 'current' : ''}`}>
                <button
                  type="button"
                  aria-current={i === active ? 'location' : undefined}
                  onClick={() => {
                    scrollToSection(i);
                    setTocOpen(false);
                  }}
                >
                  <span className="tp-node" aria-hidden />
                  <span className="tp-rail-text">{headingParts(s.heading).title}</span>
                  {s.short && <CirclePlay size={13} className="tp-rail-short" aria-label="has a Short" />}
                  <span className="sr-only">{read.has(i) ? ' (read)' : ''}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="tp-read">
        {shorts.length > 0 && (
          <section className="tp-shorts" aria-labelledby="tp-shorts-h">
            <div className="strip-head">
              <h2 id="tp-shorts-h">
                <CirclePlay size={16} aria-hidden /> Shorts for this topic
              </h2>
              <Link to="/shorts">All Shorts</Link>
            </div>
            <div className="strip">
              {shorts.map((e) => {
                const id = e.short.id;
                return (
                  <ShortThumb key={id} entry={e} state={watched(id) ? 'watched' : undefined} />
                );
              })}
            </div>
          </section>
        )}
        {topic.sections.map((s, i) => {
          const { title, sub } = headingParts(s.heading);
          const prevS = topic.sections[i - 1];
          const nextS = topic.sections[i + 1];
          return (
            <article key={s.heading} id={`s-${i}`} className={`tp-sec ${i === active ? 'is-active' : ''}`} aria-labelledby={`s-${i}-h`}>
              <header className="tp-sec-head">
                <div className="tp-sec-titles">
                  <div className="tp-sec-no">Section {sectionNo(i)}</div>
                  <h2 id={`s-${i}-h`}>{title}</h2>
                  {sub && <p className="tp-sec-sub">{sub}</p>}
                </div>
                {s.short && (
                  <Link className="watch-short" to={`/short/${s.short.id}`}>
                    <span className="pp" aria-hidden>
                      <Play size={13} />
                    </span>
                    <span>
                      Watch the Short <small>{shortLength(s.short)}</small>
                    </span>
                  </Link>
                )}
                <div className="tp-sec-acts" data-guide={i === 0 ? 'section-save' : undefined}>
                  <SaveButton kind="section" refId={`${topic.id}:${i}`} topicId={topic.id} title={title} />
                  <label className={`tp-read-toggle ${read.has(i) ? 'on' : ''}`}>
                    <input type="checkbox" checked={read.has(i)} onChange={() => toggleSectionRead(topic.id, i)} />
                    {read.has(i) ? 'Read' : 'Mark as read'}
                  </label>
                </div>
              </header>
              {s.steps && <ModeSwitch id={`s-${i}`} s={s} mode={modeOf(i)} onChange={(m) => setModeAt(i, m)} />}
              {s.steps && modeOf(i) === 'steps' ? (
                <div id={`s-${i}-panel`} role="tabpanel" aria-labelledby={`s-${i}-tab-steps`}>
                  <StepLesson
                    lesson={s.steps}
                    name={`${topic.title.split(/[:(]/)[0].trim()}, section ${i + 1}`}
                    onRead={() => setModeAt(i, 'read')}
                    onFinish={(missed) => {
                      recordSteps(topic.id, i, missed);
                      showToast(
                        `Section ${i + 1} finished in Steps`,
                        missed ? `${missed} Your-turn step${missed === 1 ? '' : 's'} needed help: it is in Weak areas until a clean run.` : 'Every Your turn right first time. Marked as read.',
                        5000,
                        'good',
                      );
                      if (i + 1 < n) scrollToSection(i + 1);
                    }}
                  />
                </div>
              ) : (
                <div id={`s-${i}-panel`} className="tp-panel" role={s.steps ? 'tabpanel' : undefined} aria-labelledby={s.steps ? `s-${i}-tab-read` : undefined}>
                  {s.source && (
                    <div className="source">
                      <BookOpen size={13} aria-hidden /> {s.source}
                    </div>
                  )}
                  <PrereqLinks topicId={topic.id} heading={s.heading} />
                  {s.core ? (
                    <CoreView s={s} />
                  ) : (
                    <>
                      <div className="tp-body">
                        <Markdown defs>{s.body}</Markdown>
                      </div>
                      {s.diagram && <Diagram text={s.diagram} />}
                    </>
                  )}
                  <div id={`viz-${i}`} className="tp-viz-anchor" />
                  <SectionViz topic={topic} sectionIndex={i} />
                  {!s.core && s.code?.map((c, j) => <CodeBlock key={j} snippet={c} />)}
                  {!s.core && s.keyPoints && s.keyPoints.length > 0 && (
                    <div className="keypoints">
                      <div className="keypoints-title">Key points</div>
                      <ul>
                        {s.keyPoints.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <SectionPractice topicId={topic.id} index={i} section={s} folded={!!s.core} />
                </div>
              )}
              {(s.core || s.steps) && <GoDeeper topic={topic} i={i} onViz={() => toViz(i)} onNext={() => scrollToSection(i + 1)} />}
              <nav className="tp-sec-pager" aria-label={`After section ${i + 1}`}>
                {prevS ? (
                  <button type="button" className="tp-sec-prev" onClick={() => scrollToSection(i - 1)}>
                    ← {i}. {headingParts(prevS.heading).title}
                  </button>
                ) : (
                  <span />
                )}
                {nextS && (
                  <button type="button" className={`btn ${i === active ? 'btn-primary' : ''} tp-sec-next`} onClick={() => scrollToSection(i + 1)}>
                    {i + 2}. {headingParts(nextS.heading).title} →
                  </button>
                )}
              </nav>
            </article>
          );
        })}
        {read.size < n && (
          <div className="tp-cta">
            <div>
              <strong>
                {read.size}/{n} sections ticked as read.
              </strong>{' '}
              Tick each one when you finish it, or mark them all if you already know this topic.
            </div>
            <button className="btn" type="button" onClick={() => markAllSectionsRead(topic.id, n)}>
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChallengeCard({ c, n, topicId }: { c: CodeChallenge; n: number; topicId: string }) {
  const p = useProgress();
  const draftKey = `cc:${c.id}`;
  const code = p.drafts[draftKey] ?? c.starter.code;
  const [hints, setHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const done = !!p.cc[c.id];
  return (
    <article id={`cc-${c.id}`} className={`tp-card tp-lab ${done ? 'done' : ''}`}>
      <div className="tp-card-head">
        <div>
          <div className="tp-card-no">Lab {sectionNo(n - 1)}</div>
          <h2>{c.title}</h2>
        </div>
        <div className="tp-card-acts">
          {done && <Badge tone="good">Completed</Badge>}
          <SaveButton kind="code" refId={c.id} topicId={topicId} title={c.title} compact />
        </div>
      </div>
      <Markdown>{c.context}</Markdown>
      <div className="task">
        <div className="tp-kicker solar">Your task</div>
        <Markdown>{c.task}</Markdown>
      </div>
      <div className="tp-ex-bar">
        <span>
          {c.starter.language === 'text' ? 'Rewrite the answer below.' : 'Edit the code below.'} Your changes are saved automatically.{' '}
          {c.starter.title && `(${c.starter.title})`}
        </span>
        <button className="btn-ghost btn-xs" type="button" onClick={() => setDraft(draftKey, c.starter.code)}>
          Reset to starter
        </button>
      </div>
      <CodeEditor value={code} onChange={(v) => setDraft(draftKey, v)} language={c.starter.language} />
      <div className="hints">
        {c.hints.slice(0, hints).map((h, i) => (
          <div key={i} className="hint">
            <Lightbulb size={15} aria-hidden className="inline-icon" /> <strong>Hint {i + 1}:</strong> {h}
          </div>
        ))}
        <div className="tp-ex-actions">
          {hints < c.hints.length && (
            <button className="btn" type="button" onClick={() => setHints((h) => h + 1)}>
              Show hint {hints + 1}/{c.hints.length}
            </button>
          )}
          <button className="btn" type="button" onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? 'Hide solution' : 'Compare with reference solution'}
          </button>
          <button className={`btn tp-ex-solve ${done ? '' : 'btn-primary'}`} type="button" onClick={() => setFlag('cc', c.id, !done)}>
            {done ? 'Mark not done' : 'Mark as done'}
          </button>
        </div>
      </div>
      {showSolution && (
        <div className="solution">
          <CodeBlock snippet={c.solution} />
          <Markdown>{c.explanation}</Markdown>
          <FollowUps items={c.followUps} />
        </div>
      )}
    </article>
  );
}

function InterviewTab({ topic }: { topic: Topic }) {
  const p = useProgress();
  const rated = topic.interviewQuestions.filter((q) => p.iq[q.id]).length;
  return (
    <div>
      <div className="tp-intro">
        <strong>How to practise:</strong> answer out loud or type your answer <em>before</em> revealing anything, as you would in a
        real interview. Then compare with what the interviewer is looking for and the model answer, work through the follow-ups
        and rate yourself honestly. <span className="muted">({rated}/{topic.interviewQuestions.length} rated)</span>
      </div>
      {topic.interviewQuestions.map((q, i) => (
        <InterviewCard key={q.id} q={q} n={i + 1} topicId={topic.id} />
      ))}
    </div>
  );
}

export function InterviewCard({ q, n, topicId }: { q: InterviewQuestion; n: number; topicId: string }) {
  const p = useProgress();
  const draftKey = `iq:${q.id}`;
  const [answer, setAnswer] = useState(false);
  const [fu, setFu] = useState(0);
  const rating = p.iq[q.id];
  const rate = (r: Rating) => rateIQ(q.id, rating === r ? null : r);
  return (
    <article id={`iq-${q.id}`} className={`tp-card iq ${rating ? `rated-${rating}` : ''}`}>
      <div className="tp-card-head">
        <div>
          <div className="tp-card-no">Question {sectionNo(n - 1)}</div>
          <h3>{q.question}</h3>
        </div>
        <div className="tp-card-acts">
          <DifficultyBadge d={q.difficulty} />
          <SaveButton kind="interview" refId={q.id} topicId={topicId} title={q.question} compact />
        </div>
      </div>
      {q.context && <div className="context">{q.context}</div>}
      <textarea
        className="answer-box"
        placeholder="Draft your answer: clarify requirements, estimate, design, trade-offs…"
        value={p.drafts[draftKey] ?? ''}
        onChange={(e) => setDraft(draftKey, e.target.value)}
        rows={5}
      />
      <Reveal label="What the interviewer is looking for">
        <ul>
          {q.whatInterviewerLooksFor.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Reveal>
      {!answer ? (
        <div className="tp-ex-actions">
          <button className="btn" type="button" onClick={() => setAnswer(true)}>
            Reveal model answer
          </button>
        </div>
      ) : (
        <div className="model-answer">
          <div className="label">Model answer</div>
          <Markdown>{q.modelAnswer}</Markdown>
        </div>
      )}
      {answer && (
        <div className="followups">
          <div className="label">Interviewer follow-ups</div>
          {q.followUps.slice(0, fu).map((f, i) => (
            <div key={i} className="followup">
              <div className="fq">↳ {f.q}</div>
              <Reveal label="Show answer">
                <Markdown>{f.a}</Markdown>
              </Reveal>
            </div>
          ))}
          {fu < q.followUps.length && (
            <button className="btn-ghost" type="button" onClick={() => setFu((x) => x + 1)}>
              + Next follow-up ({fu}/{q.followUps.length})
            </button>
          )}
          <Reveal label="Pitfalls: what weak candidates say">
            <ul className="pitfalls">
              {q.pitfalls.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      )}
      <div className="rating">
        <span className="tp-rating-q">How did you do?</span>
        {(['nailed', 'partial', 'missed'] as Rating[]).map((r) => (
          <button key={r} type="button" className={`chip chip-${r} ${rating === r ? 'on' : ''}`} onClick={() => rate(r)}>
            {r === 'nailed' ? 'Nailed it' : r === 'partial' ? 'Partially' : 'Missed it'}
          </button>
        ))}
      </div>
    </article>
  );
}

function EnvelopeCard({ q, n, topicId }: { q: EnvelopeQuestion; n: number; topicId: string }) {
  const p = useProgress();
  const draftKey = `boe:${q.id}`;
  // stage 0: question only · 1: assumptions · 2..k+1: steps · k+2: answer
  const [stage, setStage] = useState(0);
  const total = q.steps.length + 2;
  const done = !!p.boe[q.id];
  return (
    <article id={`boe-${q.id}`} className={`tp-card boe ${done ? 'done' : ''}`}>
      <div className="tp-card-head">
        <div>
          <div className="tp-card-no">
            Estimate {sectionNo(n - 1)} · stage {Math.min(stage, total)}/{total}
          </div>
          <h3>{q.question}</h3>
        </div>
        <div className="tp-card-acts">
          {done && <Badge tone="good">Done</Badge>}
          <SaveButton kind="drill" refId={q.id} topicId={topicId} title={q.question} compact />
        </div>
      </div>
      <textarea
        className="answer-box mono"
        placeholder="Your estimate: write down assumptions and arithmetic…"
        value={p.drafts[draftKey] ?? ''}
        onChange={(e) => setDraft(draftKey, e.target.value)}
        rows={4}
      />
      {stage >= 1 && (
        <div className="assumptions">
          <div className="label">Assumptions</div>
          <ul>
            {q.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {stage >= 2 && (
        <ol className="steps">
          {q.steps.slice(0, stage - 1).map((s, i) => (
            <li key={i}>
              <span className="step-label">{s.label}</span>
              <code className="step-calc">{s.calc}</code>
            </li>
          ))}
        </ol>
      )}
      {stage >= total && (
        <div className="boe-answer">
          <div className="label">Answer</div>
          <Markdown>{q.answer}</Markdown>
          <div className="insight">
            <Crosshair size={15} aria-hidden className="inline-icon" /> <strong>Design insight:</strong> {q.insight}
          </div>
          <FollowUps items={q.followUps} />
        </div>
      )}
      <div className="tp-ex-actions">
        {stage < total && (
          <button className="btn" type="button" onClick={() => setStage((s) => s + 1)}>
            {stage === 0 ? 'Reveal assumptions' : stage < total - 1 ? `Reveal step ${stage}/${q.steps.length}` : 'Reveal answer'}
          </button>
        )}
        {stage < total && (
          <button className="btn-ghost" type="button" onClick={() => setStage(total)}>
            Show everything
          </button>
        )}
        <button className={`btn tp-ex-solve ${done ? '' : 'btn-primary'}`} type="button" onClick={() => setFlag('boe', q.id, !done)}>
          {done ? 'Mark not done' : 'Mark as done'}
        </button>
      </div>
    </article>
  );
}

function CheatSheet({ topic }: { topic: Topic }) {
  return (
    <div className="tp-card tp-cheat">
      <div className="tp-card-no">Cheat sheet · {topic.cheatSheet.length} lines</div>
      <h2>Last-minute revision</h2>
      <ul className="cheat">
        {topic.cheatSheet.map((c) => (
          <li key={c}>
            <Markdown>{c}</Markdown>
          </li>
        ))}
      </ul>
      <CheatExtra topicId={topic.id} />
    </div>
  );
}

function ExamIntro({ topic }: { topic: Topic }) {
  const p = useProgress();
  const nav = useNavigate();
  const rec = p.tests[topic.id];
  const minutes = Math.ceil((topic.test.length * p.settings.secondsPerQuestion) / 60);
  const multi = topic.test.filter((q) => q.correct.length > 1).length;
  const wrong = currentlyWrong(p, topic);
  const weak = weakSections(topic, wrong);
  return (
    <div className="tp-card exam-intro">
      <div className="tp-card-no">Timed exam · {topic.test.length} questions · {minutes} min</div>
      <h2>Timed exam: {topic.title}</h2>
      <ul>
        <li>
          <strong>{topic.test.length}</strong> scenario-based questions ({multi} are "select all that apply", which need an exact match
          to score)
        </li>
        <li>
          Default time: <strong>{minutes} min</strong> ({p.settings.secondsPerQuestion}s/question). You can change it on the next
          screen.
        </li>
        <li>
          Pass mark: <strong>{p.settings.passMark}%</strong>. Only full-length attempts count towards unlocking the architecture challenges.
        </li>
        <li>The exam auto-submits when time runs out. Each explanation says why the tempting wrong options are wrong.</li>
        <li>
          <strong>Interview mode</strong> (on by default): lock in each answer to see instant feedback and the interviewer&apos;s
          follow-up questions, just like a real round.
        </li>
      </ul>
      {rec && (
        <p className="tp-exam-rec">
          Attempts: {rec.attempts} · Best: <strong>{rec.best}%</strong> · Last: {rec.last}%{' '}
          {rec.passedAt && <Badge tone="good">Passed</Badge>}
        </p>
      )}
      <div className="row gap-s wrap">
        <button className="btn btn-primary" type="button" onClick={() => nav(`/topic/${topic.id}/exam`)}>
          Set up exam →
        </button>
        {wrong.length > 0 && (
          <button className="btn" type="button" onClick={() => nav(`/practice?topic=${topic.id}`)}>
            Practise my {wrong.length} mistakes
          </button>
        )}
      </div>
      {weak.length > 0 && (
        <div className="weak-card inline">
          <div className="label">Your weak sections in this topic</div>
          <ul className="weak-sections">
            {weak.map((ws) => (
              <li key={ws.index}>
                <span className="weak-count">{ws.missed.length} missed</span>
                <span className="weak-heading">{ws.heading}</span>
                <Link to={`/topic/${topic.id}?tab=learn&s=${ws.index}`} className="small">
                  Revise section →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** "Learn this first" links from a Miscellaneous concept to the in-depth lesson that teaches it. */
function PrereqLinks({ topicId, heading }: { topicId: string; heading: string }) {
  const links = PREREQS[topicId]?.[heading];
  if (!links?.length) return null;
  return (
    <div className="prereq">
      <span className="prereq-label">
        <Library size={14} aria-hidden className="inline-icon" /> Learn this first:
      </span>
      {links.map((l) => {
        const t = TOPIC_BY_ID.get(l.topic);
        const sec = t?.sections[l.section];
        if (!t || !sec) return null;
        return (
          <Link key={`${l.topic}-${l.section}`} to={`/topic/${l.topic}?tab=learn&s=${l.section}`} className="prereq-link">
            {t.title} → {sec.heading}
          </Link>
        );
      })}
    </div>
  );
}

/** Shown instead of practice tabs until every Learn section is marked read (Settings → study-first lock). */
export function StudyLock({ topic, what }: { topic: Topic; what: string }) {
  const p = useProgress();
  const nav = useNavigate();
  const read = new Set(p.sections[topic.id] ?? []);
  const unread = topic.sections.map((s, i) => ({ s, i })).filter((x) => !read.has(x.i));
  const goRead = (i: number) => nav(`/topic/${topic.id}?tab=learn&s=${i}`);
  return (
    <div className="tp-card study-lock">
      <h2>
        <Lock size={20} aria-hidden className="inline-icon" /> Study first
      </h2>
      <p>
        This topic&apos;s {what} opens once you&apos;ve read every section, so the questions always come after the explanation.
      </p>
      <div className="topic-progress">
        <ProgressBar value={(read.size / Math.max(1, topic.sections.length)) * 100} />
        <span className="small muted">
          {read.size}/{topic.sections.length} sections read
        </span>
      </div>
      <div className="label">Still to read</div>
      <ol className="unread">
        {unread.map(({ s, i }) => (
          <li key={i}>
            <button type="button" className="link-btn" onClick={() => goRead(i)}>
              {i + 1}. {s.heading}
            </button>
          </li>
        ))}
      </ol>
      <div className="row gap-s wrap">
        {unread.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => goRead(unread[0].i)}>
            Continue reading →
          </button>
        )}
        <button
          type="button"
          className="btn-ghost small"
          onClick={() => {
            if (window.confirm('Mark every section of this topic as read and unlock its practice?')) {
              markAllSectionsRead(topic.id, topic.sections.length);
            }
          }}
        >
          I&apos;ve already studied this: mark all as read
        </button>
      </div>
      <p className="muted small">
        Tick &quot;Read&quot; on each section as you finish it. You can change or turn off this lock in <Link to="/settings">Settings</Link>.
      </p>
    </div>
  );
}

/**
 * Interactive visualisations placed on this section (lazy-loaded). A visualisation placed on
 * several sections of the same topic renders once, at its first placement; later sections link back.
 */
function SectionViz({ topic, sectionIndex }: { topic: Topic; sectionIndex: number }) {
  const vizzes = vizForSection(topic.id, topic.sections[sectionIndex].heading);
  if (!vizzes.length) return null;
  const firstIndex = (id: string) =>
    topic.sections.findIndex((s) => vizForSection(topic.id, s.heading).some((v) => v.meta.id === id));
  return (
    <>
      {vizzes.map(({ meta, Component }) => {
        const first = firstIndex(meta.id);
        if (first !== sectionIndex) {
          return (
            <button
              key={meta.id}
              type="button"
              className="viz-backlink"
              onClick={() => document.getElementById(`s-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              <CirclePlay size={15} aria-hidden className="inline-icon" /> Interactive: {meta.title} (in section {first + 1} above), revisit it
              with this section in mind
            </button>
          );
        }
        return (
          <Suspense key={meta.id} fallback={<RouteSkeleton kind="viz" label={`Loading interactive: ${meta.title}`} />}>
            <Component />
          </Suspense>
        );
      })}
    </>
  );
}
