// Architecture challenges: the index (category chips, glowing rows; locked until every topic exam is passed)
// and the worksheet for one challenge (timer ring, whiteboard, a stage rail revealed one step at a time).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { COMPANIES, COMPANY_QUESTIONS, TOPICS, TOPIC_BY_ID } from '../content';
import { setDraft, setFlag, setSettings, useProgress } from '../lib/progress';
import { companyUnlocked } from '../lib/stats';
import { Diagram, Markdown, Reveal, formatClock } from '../components/ui';
import { ArrowLeft, ArrowRight, Check, Lock, Pause, Play, RotateCcw } from 'lucide-react';
import type { CompanyQuestion } from '../types';

const FREQ_LABEL: Record<CompanyQuestion['frequency'], string> = { 'very-high': 'Very high', high: 'High', medium: 'Medium' };
const pad = (n: number) => String(n).padStart(2, '0');
const categoryName = (id: string) => COMPANIES.find((c) => c.id === id)?.name ?? id;

/** The challenge index as a list of glowing rows. Locked: rows are listed but cannot be opened yet. */
function ChallengeList({ qs, locked, done }: { qs: CompanyQuestion[]; locked: boolean; done: Record<string, true> }) {
  return (
    <ol className={`ch-list ${locked ? 'locked' : ''}`} aria-label={`Architecture challenges${locked ? ' (locked)' : ''}`}>
      {qs.map((q) => {
        const i = COMPANY_QUESTIONS.indexOf(q);
        const isDone = !!done[q.id];
        const body = (
          <>
            <span className="ch-row-num">{pad(i + 1)}</span>
            <span className="ch-row-main">
              <span className="ch-title">{q.title}</span>
              <span className="ch-row-meta">
                <span>{categoryName(q.company)}</span>
                <span aria-hidden>·</span>
                <span>{q.level}</span>
                <span aria-hidden>·</span>
                <span className={`ch-freq f-${q.frequency}`}>asked {FREQ_LABEL[q.frequency].toLowerCase()}</span>
              </span>
            </span>
            <span className={`ch-state ${locked ? 'locked' : isDone ? 'done' : 'open'}`}>
              {locked ? (
                <>
                  <Lock size={12} aria-hidden /> Locked
                </>
              ) : isDone ? (
                <>
                  <Check size={13} strokeWidth={3} aria-hidden /> Done
                </>
              ) : (
                <>
                  Open <ArrowRight size={13} aria-hidden />
                </>
              )}
            </span>
          </>
        );
        return (
          <li key={q.id} className={isDone ? 'done' : ''}>
            {locked ? (
              <div className="ch-row">{body}</div>
            ) : (
              <Link to={`/challenges/${q.id}`} className="ch-row">
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Head({ children, lead }: { children?: ReactNode; lead: ReactNode }) {
  return (
    <header className="ch-head">
      <p className="ch-kicker">Final track · {COMPANY_QUESTIONS.length} challenges</p>
      <h1>
        <span className="gtext">Architecture challenges</span>
      </h1>
      <p className="lead">{lead}</p>
      {children}
    </header>
  );
}

function Locked({ detail = false }: { detail?: boolean }) {
  const p = useProgress();
  const { remaining } = companyUnlocked(p, TOPICS);
  const done = TOPICS.length - remaining.length;
  const pct = Math.round((done / Math.max(1, TOPICS.length)) * 100);
  const next = remaining[0];
  return (
    <div className="page challenges">
      {detail && (
        <Link to="/challenges" className="ch-back">
          <ArrowLeft size={14} aria-hidden /> Architecture challenges
        </Link>
      )}
      <Head
        lead={
          <>
            {COMPANY_QUESTIONS.length} end-to-end GenAI system design challenges in {COMPANIES.length} categories, each worked as a design review
            against a mock-interview timer.
          </>
        }
      />

      <section className="ch-lock glass" aria-labelledby="ch-lock-title">
        <div className="ch-lock-orb" aria-hidden>
          <Lock size={26} />
        </div>
        <div className="ch-lock-text">
          <h2 id="ch-lock-title">{detail ? 'This challenge is still locked' : 'Locked until every topic exam is passed'}</h2>
          <p className="ch-lock-why">
            Each challenge draws on the whole course, so the track opens once you pass <strong>every</strong> topic exam at full length with at
            least {p.settings.passMark}%. {remaining.length === 1 ? 'One exam to go.' : `${remaining.length} exams to go.`}
          </p>
          <div className="ch-lock-meter">
            <span className="ch-lock-count">
              <span className="num">{done}</span>/{TOPICS.length} exams passed
            </span>
            <span className="ch-lock-bar" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="ch-lock-pct num">{pct}%</span>
          </div>
          {next && (
            <Link to={`/topic/${next.id}?tab=exam`} className="btn btn-primary">
              Next exam: {next.title} <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
      </section>

      <section className="ch-remaining-wrap" aria-labelledby="ch-remaining-title">
        <h2 id="ch-remaining-title" className="ch-label">
          Remaining exams · {remaining.length}
        </h2>
        <ul className="ch-remaining">
          {remaining.map((t) => {
            const rec = p.tests[t.id];
            return (
              <li key={t.id}>
                <Link to={`/topic/${t.id}?tab=exam`}>
                  <span className="ch-rem-title">{t.title}</span>
                  <span className={`ch-best ${rec ? 'tried' : ''}`}>{rec ? `best ${rec.best}%` : 'not taken'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ch-index" aria-labelledby="ch-preview-title">
        <div className="ch-section-head">
          <h2 id="ch-preview-title">What unlocks</h2>
          <p className="muted small">{COMPANIES.map((c) => c.name).join(' · ')}</p>
        </div>
        <ChallengeList qs={COMPANY_QUESTIONS} locked done={p.company} />
      </section>
    </div>
  );
}

export function CompaniesPage() {
  const p = useProgress();
  const [filter, setFilter] = useState<string>('all');
  if (!companyUnlocked(p, TOPICS).unlocked) return <Locked />;
  const company = COMPANIES.find((c) => c.id === filter);
  const qs = COMPANY_QUESTIONS.filter((q) => filter === 'all' || q.company === filter);
  const doneCount = COMPANY_QUESTIONS.filter((q) => p.company[q.id]).length;
  return (
    <div className="page challenges">
      <Head lead="Pick a category to see what it tests and how to approach it, then design the system against the clock.">
        <dl className="ch-facts">
          <div>
            <dt>Challenges</dt>
            <dd>{COMPANY_QUESTIONS.length}</dd>
          </div>
          <div>
            <dt>Categories</dt>
            <dd>{COMPANIES.length}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>
              {doneCount}
              <span>/{COMPANY_QUESTIONS.length}</span>
            </dd>
          </div>
          <div>
            <dt>Mock timer</dt>
            <dd>
              {p.settings.mockMinutes}
              <span> min</span>
            </dd>
          </div>
        </dl>
      </Head>

      <div className="ch-filter" role="group" aria-label="Filter by category">
        <button type="button" className={`chip ${filter === 'all' ? 'on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All <span className="ch-chip-n">{COMPANY_QUESTIONS.length}</span>
        </button>
        {COMPANIES.map((c) => {
          const n = COMPANY_QUESTIONS.filter((q) => q.company === c.id).length;
          return (
            <button key={c.id} type="button" className={`chip ${filter === c.id ? 'on' : ''}`} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.name} <span className="ch-chip-n">{n}</span>
            </button>
          );
        })}
      </div>

      {company && (
        <dl className="ch-brief" aria-label={`${company.name}: brief`}>
          <div className="tint-ion">
            <dt>What it tests</dt>
            <dd>{company.focus}</dd>
          </div>
          <div className="tint-pulsar">
            <dt>How to approach it</dt>
            <dd>{company.interviewStyle}</dd>
          </div>
        </dl>
      )}

      <section className="ch-index" aria-label="Challenges">
        <ChallengeList qs={qs} locked={false} done={p.company} />
      </section>
    </div>
  );
}

const STAGES = ['Clarifying questions', 'Requirements', 'Estimation', 'High-level design', 'Deep dives', 'Trade-offs', 'Follow-ups'] as const;

/** A revealed stage of the worksheet: a glass card with a numbered running head. */
function Stage({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="ws-stage card" aria-labelledby={`ws-stage-${n}`}>
      <p className="ws-stage-num">Stage {pad(n)}</p>
      <h2 id={`ws-stage-${n}`}>{title}</h2>
      {children}
    </section>
  );
}

/** Time left as a ring that empties clockwise. */
function TimerRing({ left, full, running }: { left: number; full: number; running: boolean }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / Math.max(1, full)));
  const urgent = left <= 300 && running;
  return (
    <div className={`ws-ring ${urgent ? 'urgent' : ''} ${running ? 'running' : ''}`}>
      <svg viewBox="0 0 128 128" aria-hidden>
        <defs>
          <linearGradient id="ws-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--act-1)' }} />
            <stop offset="55%" style={{ stopColor: 'var(--act-2)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--act-3)' }} />
          </linearGradient>
        </defs>
        <circle className="ws-ring-track" cx="64" cy="64" r={r} />
        <circle
          className="ws-ring-fill"
          cx="64"
          cy="64"
          r={r}
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - frac) } as CSSProperties}
        />
      </svg>
      <div className="ws-ring-text">
        <span className="ws-clock num" role="timer" aria-label="Time left">
          {formatClock(left)}
        </span>
        <span className="ws-ring-lbl">{running ? (urgent ? 'final 5 min' : 'running') : left < full && left > 0 ? 'paused' : left <= 0 ? "time's up" : 'ready'}</span>
      </div>
    </div>
  );
}

export function CompanyQuestionPage() {
  const { qid = '' } = useParams();
  const p = useProgress();
  const q = COMPANY_QUESTIONS.find((x) => x.id === qid);
  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(p.settings.mockMinutes * 60);
  const deadline = useRef(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const l = Math.round((deadline.current - Date.now()) / 1000);
      setLeft(l);
      if (l <= 0) setRunning(false);
    }, 250);
    return () => clearInterval(t);
  }, [running]);

  if (!companyUnlocked(p, TOPICS).unlocked) return <Locked detail />;
  if (!q)
    return (
      <div className="page challenges">
        <Link to="/challenges" className="ch-back">
          <ArrowLeft size={14} aria-hidden /> Architecture challenges
        </Link>
        <h1>Challenge not found</h1>
        <p className="lead">
          That challenge does not exist. <Link to="/challenges">See all challenges</Link>.
        </p>
      </div>
    );
  const company = COMPANIES.find((c) => c.id === q.company);
  const draftKey = `co:${q.id}`;
  const done = !!p.company[q.id];
  const full = p.settings.mockMinutes * 60;

  const startTimer = () => {
    const secs = left > 0 ? left : full;
    deadline.current = Date.now() + secs * 1000;
    setLeft(secs);
    setRunning(true);
  };

  return (
    <div className="page challenges worksheet">
      <Link to="/challenges" className="ch-back">
        <ArrowLeft size={14} aria-hidden /> Architecture challenges
      </Link>
      <header className="ws-head">
        <p className="ws-meta">
          <span className="badge badge-ion">{company?.name}</span>
          <span className="badge">{q.level}</span>
          <span className={`badge ${q.frequency === 'very-high' ? 'badge-medium' : ''}`}>Asked: {FREQ_LABEL[q.frequency]}</span>
          {done && (
            <span className="badge badge-good ws-done-mark">
              <Check size={12} strokeWidth={3} aria-hidden /> Completed
            </span>
          )}
        </p>
        <h1>{q.title}</h1>
      </header>

      <div className="ws-top">
        <section className="ws-brief card" aria-labelledby="ws-brief-label">
          <h2 id="ws-brief-label" className="ch-label">
            The brief
          </h2>
          <Markdown>{q.prompt}</Markdown>
        </section>

        <section className="ws-timer glass" aria-label="Mock interview timer">
          <TimerRing left={left} full={full} running={running} />
          <div className="ws-timer-side">
            <div className="ws-timer-set">
              <label htmlFor="ws-minutes" className="ch-label">
                Mock interview
              </label>
              <span className="ws-minutes">
                <input
                  id="ws-minutes"
                  type="number"
                  min={5}
                  max={120}
                  value={p.settings.mockMinutes}
                  disabled={running}
                  onChange={(e) => {
                    const m = Number(e.target.value) || 45;
                    setSettings({ mockMinutes: m });
                    setLeft(m * 60);
                  }}
                />
                <span>min</span>
              </span>
            </div>
            <div className="ws-timer-actions">
              {!running ? (
                <button className="btn btn-primary btn-sm" type="button" onClick={startTimer}>
                  <Play size={14} aria-hidden /> {left < full && left > 0 ? 'Resume' : 'Start'}
                </button>
              ) : (
                <button className="btn btn-sm" type="button" onClick={() => setRunning(false)}>
                  <Pause size={14} aria-hidden /> Pause
                </button>
              )}
              <button
                className="btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  setRunning(false);
                  setLeft(full);
                }}
              >
                <RotateCcw size={14} aria-hidden /> Reset
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="ws-board" aria-labelledby="ws-board-label">
        <label id="ws-board-label" htmlFor="ws-draft" className="ch-label">
          Your whiteboard
        </label>
        <textarea
          id="ws-draft"
          className="answer-box tall"
          placeholder="Requirements → estimation → API → data model → architecture → deep dives → trade-offs"
          value={p.drafts[draftKey] ?? ''}
          onChange={(e) => setDraft(draftKey, e.target.value)}
          rows={12}
        />
        <p className="ws-hint">Saved as you type. Reveal the model answer one stage at a time and compare it with yours before moving on.</p>
      </section>

      <nav className="ws-stages" aria-label="Model answer stages">
        <ol>
          {STAGES.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                className={`ws-stage-btn ${i < stage ? 'done' : ''} ${i === stage ? 'next' : ''}`}
                aria-current={i === stage - 1 ? 'step' : undefined}
                onClick={() => setStage(i + 1)}
              >
                <span className="ws-stage-n">{i < stage ? <Check size={13} strokeWidth={3} aria-hidden /> : i + 1}</span>
                <span className="ws-stage-label">{s}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="ws-stage-count" aria-live="polite">
          {stage}/{STAGES.length} revealed
        </p>
      </nav>

      {stage >= 1 && (
        <Stage n={1} title="Clarifying questions to ask">
          <ol className="ws-list">
            {q.clarifyingQuestions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </Stage>
      )}
      {stage >= 2 && (
        <Stage n={2} title="Requirements">
          <div className="ws-req">
            <div className="tint-ion">
              <h3 className="ch-label">Functional</h3>
              <ul className="ws-list">
                {q.functional.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="tint-pulsar">
              <h3 className="ch-label">Non-functional</h3>
              <ul className="ws-list">
                {q.nonFunctional.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </Stage>
      )}
      {stage >= 3 && (
        <Stage n={3} title="Estimation">
          <div className="ws-est-wrap">
            <table className="ws-est">
              <caption className="sr-only">Back-of-the-envelope estimation steps</caption>
              <thead>
                <tr>
                  <th scope="col" className="c-num">
                    Step
                  </th>
                  <th scope="col" className="c-qty">
                    Quantity
                  </th>
                  <th scope="col">Working</th>
                </tr>
              </thead>
              <tbody>
                {q.estimation.map((s, i) => (
                  <tr key={i}>
                    <td className="c-num">{pad(i + 1)}</td>
                    <th scope="row" className="c-qty">
                      {s.label}
                    </th>
                    <td className="c-calc">
                      <code>{s.calc}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Stage>
      )}
      {stage >= 4 && (
        <Stage n={4} title="High-level design">
          <div className="ws-prose">
            <Markdown>{q.highLevelDesign}</Markdown>
          </div>
          {q.diagram && <Diagram text={q.diagram} />}
        </Stage>
      )}
      {stage >= 5 && (
        <Stage n={5} title="Deep dives">
          <div className="ws-dives">
            {q.deepDives.map((d) => (
              <Reveal key={d.topic} label={d.topic} defaultOpen>
                <Markdown>{d.discussion}</Markdown>
              </Reveal>
            ))}
          </div>
        </Stage>
      )}
      {stage >= 6 && (
        <Stage n={6} title="Trade-offs to state out loud">
          <ul className="ws-list ws-tradeoffs">
            {q.tradeoffs.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Stage>
      )}
      {stage >= 7 && (
        <Stage n={7} title="Interviewer follow-ups">
          <ol className="ws-followups">
            {q.followUps.map((f) => (
              <li key={f.q} className="followup">
                <p className="fq">{f.q}</p>
                <Reveal label="Show answer">
                  <Markdown>{f.a}</Markdown>
                </Reveal>
              </li>
            ))}
          </ol>
        </Stage>
      )}

      <div className="ws-actions">
        {stage < STAGES.length && (
          <button className="btn" type="button" onClick={() => setStage((s) => s + 1)}>
            Reveal stage {stage + 1}: {STAGES[stage]} <ArrowRight size={15} aria-hidden />
          </button>
        )}
        <button className={`btn ${done ? '' : 'btn-primary'}`} type="button" onClick={() => setFlag('company', q.id, !done)}>
          {done ? (
            'Mark not done'
          ) : (
            <>
              <Check size={15} strokeWidth={3} aria-hidden /> Mark as completed
            </>
          )}
        </button>
      </div>

      {q.relatedTopics.length > 0 && (
        <section className="ws-related" aria-labelledby="ws-related-label">
          <h2 id="ws-related-label" className="ch-label">
            Revise related topics
          </h2>
          <ul>
            {q.relatedTopics
              .map((id) => TOPIC_BY_ID.get(id))
              .filter((t) => !!t)
              .map((t) => (
                <li key={t!.id}>
                  <Link to={`/topic/${t!.id}`} className="chip">
                    {t!.title}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
