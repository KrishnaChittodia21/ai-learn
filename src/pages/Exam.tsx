import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { MCQ_TOPIC, TOPICS, TOPIC_BY_ID } from '../content';
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, Flag, Lock, RotateCcw, Target } from 'lucide-react';
import { NextUp } from '../components/NextUp';
import type { Difficulty, MCQ } from '../types';
import { recordAnswers, recordTest, useProgress } from '../lib/progress';
import { weakSections } from '../lib/weak';
import { practiceLocked } from '../lib/stats';
import { StudyLock } from './Topic';
import { CodeBlock, DifficultyBadge, FollowUps, Markdown, formatClock } from '../components/ui';

interface Item {
  q: MCQ;
  /** order[displayIndex] = original option index */
  order: number[];
}

type Answers = Record<string, number[]>;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
/** display letter for an option position: A, B, C… */
const letter = (i: number) => String.fromCharCode(65 + i);
/** zero-padded question number: 03 */
const pad = (n: number) => String(n).padStart(2, '0');

export default function ExamPage() {
  const { id = '' } = useParams();
  const p = useProgress();
  const topic = TOPIC_BY_ID.get(id);
  if (!topic) return <div className="page">Topic not found</div>;
  if (practiceLocked(p, topic, 'exam')) {
    return (
      <div className="page">
        <Link to={`/topic/${topic.id}`} className="exam-back">
          <ArrowLeft size={14} aria-hidden /> {topic.title}
        </Link>
        <StudyLock topic={topic} what="exam" />
      </div>
    );
  }
  return (
    <Exam key={topic.id} title={topic.title} questions={topic.test} recordTopicId={topic.id} backHref={`/topic/${topic.id}?tab=exam`} />
  );
}

export interface ExamProps {
  title: string;
  questions: MCQ[];
  /** full-length attempts count towards this topic's pass; omit for practice drills */
  recordTopicId?: string;
  backHref: string;
}

export function Exam({ title, questions, recordTopicId, backHref }: ExamProps) {
  const p = useProgress();
  const total = questions.length;
  const [phase, setPhase] = useState<'setup' | 'running' | 'done'>('setup');
  const [count, setCount] = useState(total);
  const [minutes, setMinutes] = useState(Math.ceil((total * p.settings.secondsPerQuestion) / 60));
  const [shuffleOn, setShuffleOn] = useState(p.settings.shuffle);
  // interview mode: lock each answer, then see feedback and the interviewer's follow-ups at once
  const [interviewMode, setInterviewMode] = useState(true);
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Item[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [cur, setCur] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [limit, setLimit] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const deadline = useRef(0);
  const startedAt = useRef(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong'>('all');
  const kind = recordTopicId ? 'Timed exam' : 'Mistakes drill';

  const start = () => {
    const qs = shuffleOn ? shuffle(questions) : questions;
    const chosen = qs.slice(0, count).map((q) => {
      const idx = q.options.map((_, i) => i);
      return { q, order: shuffleOn ? shuffle(idx) : idx };
    });
    setItems(chosen);
    setAnswers({});
    setFlagged(new Set());
    setLocked(new Set());
    setCur(0);
    const secs = Math.max(1, minutes) * 60;
    startedAt.current = Date.now();
    deadline.current = Date.now() + secs * 1000;
    setRemaining(secs);
    setLimit(secs);
    setPhase('running');
    window.scrollTo({ top: 0 });
  };

  const score = useMemo(() => {
    if (!items.length) return 0;
    const correct = items.filter((it) => sameSet(answers[it.q.id] ?? [], it.q.correct)).length;
    return Math.round((correct / items.length) * 100);
  }, [items, answers]);

  const submit = useCallback(() => {
    setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
    setPhase('done');
    window.scrollTo({ top: 0 });
  }, []);

  // record result once when finishing a full-length exam
  const recorded = useRef(false);
  useEffect(() => {
    if (phase === 'running') recorded.current = false;
    if (phase === 'done' && !recorded.current) {
      recorded.current = true;
      recordAnswers(
        items.map((it) => ({
          id: it.q.id,
          correct: sameSet(answers[it.q.id] ?? [], it.q.correct),
        })),
      );
      if (recordTopicId && items.length === total) recordTest(recordTopicId, score);
    }
  }, [phase, items, answers, total, recordTopicId, score]);

  // countdown
  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => {
      const left = Math.round((deadline.current - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) submit();
    }, 250);
    return () => clearInterval(t);
  }, [phase, submit]);

  // guard against leaving mid-exam
  const blocker = useBlocker(phase === 'running');
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('Leave the exam? Your progress in this attempt will be lost.')) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    if (phase !== 'running') return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [phase]);

  const toggle = useCallback((item: Item, original: number) => {
    setAnswers((a) => {
      const prev = a[item.q.id] ?? [];
      const multi = item.q.correct.length > 1;
      const next = multi ? (prev.includes(original) ? prev.filter((x) => x !== original) : [...prev, original]) : [original];
      return { ...a, [item.q.id]: next };
    });
  }, []);

  const toggleFlag = useCallback((qid: string) => {
    setFlagged((f) => {
      const s = new Set(f);
      if (s.has(qid)) s.delete(qid);
      else s.add(qid);
      return s;
    });
  }, []);

  const lockIn = useCallback((qid: string) => setLocked((l) => new Set(l).add(qid)), []);

  const confirmSubmit = () => {
    const un = items.filter((it) => !(answers[it.q.id] ?? []).length).length;
    if (!un || window.confirm(`${un} question(s) unanswered. Submit anyway?`)) submit();
  };

  // keyboard: 1-5 (or A-E) choose, ←/→ navigate, f flag, Enter locks in (interview mode)
  useEffect(() => {
    if (phase !== 'running') return;
    const h = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.tagName === 'INPUT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const item = items[cur];
      if (!item) return;
      const key = e.key.toLowerCase();
      if (e.key === 'Enter') {
        // Enter on another control (Submit, Prev, a link…) keeps its own meaning
        if (target?.closest('button, a, summary') && !target.closest('.opt')) return;
        if (interviewMode && !locked.has(item.q.id) && (answers[item.q.id] ?? []).length) {
          e.preventDefault();
          lockIn(item.q.id);
        }
        return;
      }
      const byLetter = key.length === 1 && key >= 'a' && key <= 'e' ? key.charCodeAt(0) - 96 : NaN;
      const n = Number.isNaN(byLetter) ? Number(e.key) : byLetter;
      if (n >= 1 && n <= item.order.length) {
        if (!locked.has(item.q.id)) toggle(item, item.order[n - 1]);
      } else if (e.key === 'ArrowRight') setCur((c) => Math.min(items.length - 1, c + 1));
      else if (e.key === 'ArrowLeft') setCur((c) => Math.max(0, c - 1));
      else if (key === 'f') toggleFlag(item.q.id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [phase, items, cur, toggle, toggleFlag, locked, answers, interviewMode, lockIn]);

  if (phase === 'setup') {
    const perQ = Math.round((minutes * 60) / Math.max(1, count));
    const counts = !!recordTopicId && count === total;
    return (
      <div className="page exam-setup">
        <Link to={backHref} className="exam-back">
          <ArrowLeft size={14} aria-hidden /> Back
        </Link>
        <div className="setup-layout">
          <div className="setup-main">
            <header className="setup-head rise">
              <p className="eyebrow">
                <span className="setup-live" aria-hidden />
                {kind}
                {recordTopicId ? '' : ' · built from your misses'}
              </p>
              <h1>
                <span className="gtext">{title}</span>
              </h1>
              <p className="lead">
                {total} question{total === 1 ? '' : 's'} on the paper.{' '}
                {recordTopicId
                  ? `Pass mark ${p.settings.passMark}%. Only a full-length attempt counts towards passing the topic.`
                  : 'A drill updates your weak areas but never affects an exam pass.'}
              </p>
            </header>

            <div className="setup-sheet glass rise d1">
              <div className="setup-row">
                <div className="setup-key">
                  <span className="setup-num">01</span>
                  <label htmlFor="exam-minutes">Time limit</label>
                </div>
                <div className="setup-val">
                  <div className="setup-time">
                    <span className="setup-input">
                      <input
                        id="exam-minutes"
                        type="number"
                        min={1}
                        max={240}
                        value={minutes}
                        onChange={(e) => setMinutes(Number(e.target.value) || 1)}
                      />
                      <span>min</span>
                    </span>
                    <span className="setup-presets" role="group" aria-label="Preset time limits">
                      {[5, 10, 15, 20, 30].map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`chip ${minutes === m ? 'on' : ''}`}
                          aria-pressed={minutes === m}
                          onClick={() => setMinutes(m)}
                        >
                          {m}m
                        </button>
                      ))}
                    </span>
                  </div>
                  <p className="setup-hint">≈ {perQ}s per question</p>
                </div>
              </div>

              <div className="setup-row">
                <div className="setup-key">
                  <span className="setup-num">02</span>
                  <label htmlFor="exam-count">Questions</label>
                </div>
                <div className="setup-val">
                  <div className="setup-range">
                    <input
                      id="exam-count"
                      type="range"
                      min={Math.min(5, total)}
                      max={total}
                      value={count}
                      style={
                        {
                          '--fill': `${total > Math.min(5, total) ? ((count - Math.min(5, total)) / (total - Math.min(5, total))) * 100 : 100}%`,
                        } as CSSProperties
                      }
                      onChange={(e) => setCount(Number(e.target.value))}
                    />
                    <output htmlFor="exam-count" className="setup-count">
                      {pad(count)} <span>/ {pad(total)}</span>
                    </output>
                  </div>
                  {recordTopicId ? (
                    count < total ? (
                      <p className="setup-hint warn">Practice run: only full-length attempts count towards passing.</p>
                    ) : (
                      <p className="setup-hint">Full length: this attempt counts towards passing.</p>
                    )
                  ) : (
                    <p className="setup-hint">Practice drill: updates your weak areas, never affects exam passes.</p>
                  )}
                </div>
              </div>

              <div className="setup-row">
                <div className="setup-key">
                  <span className="setup-num">03</span>
                  <span>Order</span>
                </div>
                <div className="setup-val">
                  <label className="setup-check">
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={shuffleOn}
                      onChange={(e) => setShuffleOn(e.target.checked)}
                    />
                    <span>
                      <strong>Shuffle questions and options</strong>
                      <span className="setup-hint">A fresh order each attempt, so you learn the idea rather than the position.</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="setup-row">
                <div className="setup-key">
                  <span className="setup-num">04</span>
                  <span>Mode</span>
                </div>
                <div className="setup-val">
                  <label className="setup-check">
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={interviewMode}
                      onChange={(e) => setInterviewMode(e.target.checked)}
                    />
                    <span>
                      <strong>Interview mode</strong>
                      <span className="setup-hint">
                        Lock each answer to get instant feedback and the interviewer&apos;s follow-ups, like a real interview round.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="setup-row">
                <div className="setup-key">
                  <span className="setup-num">05</span>
                  <span>Keys</span>
                </div>
                <div className="setup-val setup-keys">
                  <span>
                    <kbd>1</kbd>–<kbd>5</kbd> or <kbd>A</kbd>–<kbd>E</kbd> select
                  </span>
                  <span>
                    <kbd>←</kbd> <kbd>→</kbd> navigate
                  </span>
                  <span>
                    <kbd>F</kbd> flag for review
                  </span>
                  {interviewMode && (
                    <span>
                      <kbd>Enter</kbd> lock in
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="setup-go-wrap rise d2">
            <aside className="setup-go gborder" aria-label="Start">
              <div className="gborder-in setup-go-in">
                <p className="lbl">Ready when you are</p>
                <dl className="setup-sum">
                  <div>
                    <dt>Questions</dt>
                    <dd className="num">{pad(count)}</dd>
                  </div>
                  <div>
                    <dt>Minutes</dt>
                    <dd className="num">{minutes}</dd>
                  </div>
                  <div>
                    <dt>Pass mark</dt>
                    <dd className="num">
                      {p.settings.passMark}
                      <small>%</small>
                    </dd>
                  </div>
                </dl>
                <ul className="setup-flags">
                  <li className={interviewMode ? 'on' : ''}>Interview mode {interviewMode ? 'on' : 'off'}</li>
                  <li className={shuffleOn ? 'on' : ''}>Shuffle {shuffleOn ? 'on' : 'off'}</li>
                  <li className={counts ? 'on' : ''}>
                    {counts ? 'Counts towards passing' : recordTopicId ? 'Practice run' : 'Drill: never affects a pass'}
                  </li>
                </ul>
                <button className="btn btn-primary btn-lg setup-start" type="button" onClick={start}>
                  Start {recordTopicId ? 'exam' : 'drill'} · {minutes} min <ArrowRight size={18} aria-hidden />
                </button>
                <p className="setup-hint">Auto-submits at 00:00</p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'running') {
    const item = items[cur];
    const selected = answers[item.q.id] ?? [];
    const multi = item.q.correct.length > 1;
    const answered = items.filter((it) => (answers[it.q.id] ?? []).length > 0).length;
    const urgent = remaining <= 60;
    const isLocked = interviewMode && locked.has(item.q.id);
    const gotIt = sameSet(selected, item.q.correct);
    const isFlagged = flagged.has(item.q.id);
    const isLast = cur === items.length - 1;
    const needsLock = interviewMode && !isLocked;
    const qLabelId = `q-${item.q.id}`;
    const left = Math.max(0, Math.min(1, remaining / Math.max(1, limit)));
    const n = item.order.length;
    return (
      <div className="page exam-run">
        <header className="hud glass" aria-label="Exam status">
          <div className="hud-title">
            <span className="hud-kind">
              {kind}
              {interviewMode ? ' · Interview mode' : ''}
            </span>
            <h1 className="hud-topic">{title}</h1>
          </div>
          <div className="hud-prog">
            <div
              className={`hud-segs ${items.length > 24 ? 'dense' : ''}`}
              style={{ '--n': items.length } as CSSProperties}
              role="progressbar"
              aria-label="Questions answered"
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={answered}
              aria-valuetext={`Question ${cur + 1} of ${items.length}. ${answered} answered.`}
            >
              {items.map((it, i) => {
                const ans = (answers[it.q.id] ?? []).length > 0;
                return (
                  <span
                    key={it.q.id}
                    className={`seg ${ans ? 'ans' : ''} ${i === cur ? 'cur' : ''} ${flagged.has(it.q.id) ? 'flag' : ''}`}
                  />
                );
              })}
            </div>
            <p className="hud-stats">
              <span>
                <b>{answered}</b> answered
              </span>
              {flagged.size > 0 && (
                <span>
                  <b>{flagged.size}</b> flagged
                </span>
              )}
              <span className="hud-pass">pass mark {p.settings.passMark}%</span>
            </p>
          </div>
          <div
            className={`hud-timer ${urgent ? 'urgent' : ''}`}
            role="timer"
            aria-label={`Time remaining ${formatClock(remaining)}`}
            style={{ '--p': `${left * 100}%` } as CSSProperties}
          >
            <span className="hud-ring" aria-hidden />
            <span className="hud-time">{formatClock(remaining)}</span>
          </div>
          <button className="btn hud-submit" type="button" onClick={confirmSubmit}>
            Submit
          </button>
        </header>

        <div className="exam-grid">
          <article className="qcard glass" aria-labelledby={qLabelId}>
            <div className="qcard-glow" aria-hidden />
            <div className="qcard-body" key={item.q.id}>
              <header className="qhead">
                <span className="qnum">
                  Q {pad(cur + 1)} <span>/ {pad(items.length)}</span>
                </span>
                <DifficultyBadge d={item.q.difficulty} />
                {multi && <span className="badge badge-ion">Select all that apply</span>}
                {isFlagged && (
                  <span className="badge qflag">
                    <Flag size={11} aria-hidden fill="currentColor" /> Flagged
                  </span>
                )}
              </header>
              <div className="qtext" id={qLabelId}>
                <Markdown>{item.q.question}</Markdown>
              </div>
              {item.q.code && <CodeBlock snippet={item.q.code} />}
              <div
                className={`opts ${isLocked ? 'is-locked' : ''}`}
                role={multi ? 'group' : 'radiogroup'}
                aria-labelledby={qLabelId}
                aria-describedby={multi ? `${qLabelId}-multi` : undefined}
              >
                {multi && (
                  <span id={`${qLabelId}-multi`} className="sr-only">
                    Select all that apply. Every correct option is needed to score.
                  </span>
                )}
                {item.order.map((orig, di) => {
                  const on = selected.includes(orig);
                  const isC = item.q.correct.includes(orig);
                  const verdict = isLocked ? (isC ? (on ? 'is-correct' : 'is-correct is-missed') : on ? 'is-wrong' : 'is-dim') : '';
                  return (
                    <button
                      key={orig}
                      type="button"
                      role={multi ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      aria-disabled={isLocked || undefined}
                      className={`opt ${multi ? 'multi' : ''} ${on ? 'on' : ''} ${verdict}`}
                      onClick={() => {
                        if (!isLocked) toggle(item, orig);
                      }}
                    >
                      <span className="opt-k" aria-hidden>
                        {multi && on && !isLocked ? <Check size={15} strokeWidth={3} /> : letter(di)}
                      </span>
                      <span className="opt-text">
                        <Markdown>{item.q.options[orig]}</Markdown>
                      </span>
                      {isLocked && isC && (
                        <CircleCheck
                          size={19}
                          aria-label={on ? 'your pick, correct' : 'correct answer you did not pick'}
                          className="opt-icon"
                        />
                      )}
                      {isLocked && on && !isC && <CircleX size={19} aria-label="your wrong pick" className="opt-icon" />}
                    </button>
                  );
                })}
              </div>

              {isLocked && (
                <div className={`qfeedback ${gotIt ? 'tint-good ok' : 'tint-bad bad'}`} aria-live="polite">
                  <p className="qfeedback-verdict">
                    {gotIt ? <CircleCheck size={18} aria-hidden /> : <CircleX size={18} aria-hidden />}
                    {gotIt ? 'Correct.' : 'Not quite.'}
                  </p>
                  <Markdown>{item.q.explanation}</Markdown>
                  <FollowUps key={item.q.id} items={item.q.followUps} />
                </div>
              )}

              <footer className="qfoot">
                <button className="btn" type="button" disabled={cur === 0} onClick={() => setCur(cur - 1)}>
                  <ArrowLeft size={16} aria-hidden /> Previous
                </button>
                <button
                  className={`btn qflag-btn ${isFlagged ? 'on' : ''}`}
                  type="button"
                  aria-pressed={isFlagged}
                  onClick={() => toggleFlag(item.q.id)}
                >
                  <Flag size={15} aria-hidden fill={isFlagged ? 'currentColor' : 'none'} /> {isFlagged ? 'Flagged' : 'Flag'}
                </button>
                <span className="qfoot-go">
                  {needsLock && !isLast && (
                    <button className="btn-ghost" type="button" onClick={() => setCur(cur + 1)}>
                      Skip <ArrowRight size={15} aria-hidden />
                    </button>
                  )}
                  {needsLock ? (
                    <button className="btn btn-primary btn-lg" type="button" disabled={!selected.length} onClick={() => lockIn(item.q.id)}>
                      <Lock size={16} aria-hidden /> Lock in answer
                    </button>
                  ) : isLast ? (
                    <button className="btn btn-primary btn-lg" type="button" onClick={confirmSubmit}>
                      Submit {recordTopicId ? 'exam' : 'drill'} <ArrowRight size={18} aria-hidden />
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-lg" type="button" onClick={() => setCur(cur + 1)}>
                      Next question <ArrowRight size={18} aria-hidden />
                    </button>
                  )}
                </span>
              </footer>
              {needsLock && (
                <p className="qhint">
                  {selected.length ? 'Locked answers cannot be changed.' : 'Pick an answer, then lock it in to hear the follow-up.'}
                </p>
              )}
            </div>
          </article>

          <nav className="navi glass" aria-label="Question navigator">
            <div className="navi-head">
              <span className="lbl">Navigator</span>
              <span className="navi-count">
                {answered}/{items.length}
              </span>
            </div>
            <ol className="navi-cells">
              {items.map((it, i) => {
                const ans = (answers[it.q.id] ?? []).length > 0;
                const fl = flagged.has(it.q.id);
                const lk = interviewMode && locked.has(it.q.id);
                const ok = lk && sameSet(answers[it.q.id] ?? [], it.q.correct);
                const state = [ans ? 'answered' : 'unanswered', lk ? (ok ? 'correct' : 'wrong') : '', fl ? 'flagged' : '']
                  .filter(Boolean)
                  .join(', ');
                return (
                  <li key={it.q.id}>
                    <button
                      type="button"
                      className={`cell ${i === cur ? 'cur' : ''} ${ans ? 'ans' : ''} ${fl ? 'flag' : ''} ${lk ? (ok ? 'ok' : 'bad') : ''}`}
                      aria-current={i === cur ? 'step' : undefined}
                      aria-label={`Question ${i + 1}, ${state}`}
                      onClick={() => setCur(i)}
                    >
                      {pad(i + 1)}
                    </button>
                  </li>
                );
              })}
            </ol>
            <ul className="navi-legend" aria-hidden>
              <li>
                <span className="lg lg-ans" /> Answered
              </li>
              <li>
                <span className="lg lg-cur" /> Current
              </li>
              <li>
                <span className="lg lg-flag" /> Flagged
              </li>
              {interviewMode && (
                <li>
                  <span className="lg lg-bad" /> Locked wrong
                </li>
              )}
            </ul>
            <p className="navi-keys">
              <kbd>1</kbd>–<kbd>{n}</kbd> pick · <kbd>F</kbd> flag · <kbd>←</kbd>
              <kbd>→</kbd> move
              {interviewMode && (
                <>
                  {' '}
                  · <kbd>Enter</kbd> lock in
                </>
              )}
            </p>
          </nav>
        </div>
      </div>
    );
  }

  // done
  const passed = score >= p.settings.passMark;
  const correctCount = items.filter((it) => sameSet(answers[it.q.id] ?? [], it.q.correct)).length;
  const full = !!recordTopicId && items.length === total;
  const missed = items.filter((it) => !sameSet(answers[it.q.id] ?? [], it.q.correct)).map((it) => it.q);
  const shown = items.filter((it) => reviewFilter === 'all' || !sameSet(answers[it.q.id] ?? [], it.q.correct));
  const heading = passed ? (full ? 'Passed.' : 'Above the pass mark.') : 'Not yet. Review and retake.';
  const nextTopic = passed && full && recordTopicId ? TOPICS[TOPICS.findIndex((t) => t.id === recordTopicId) + 1] : undefined;
  return (
    <div className="page exam-result">
      <Link to={backHref} className="exam-back">
        <ArrowLeft size={14} aria-hidden /> Back
      </Link>
      <div className="rise">
        <section className={`verdict gborder ${passed ? 'pass' : 'fail'}`} aria-labelledby="verdict-title">
          <div className="gborder-in verdict-in">
            <div className="verdict-glow" aria-hidden />
            <p className="eyebrow">
              {kind} · {title}
            </p>
            <div className="verdict-grid">
              <div className="verdict-score num" aria-label={`Score ${score} percent`}>
                <span className={passed ? 'gtext' : 'verdict-score-fail'}>{score}</span>
                <small>%</small>
              </div>
              <div className="verdict-body">
                <p className={`verdict-stamp ${passed ? 'pass' : 'fail'}`}>
                  {passed ? <CircleCheck size={15} aria-hidden /> : <Target size={15} aria-hidden />}
                  {passed ? 'Pass' : 'Below pass mark'}
                </p>
                <h1 id="verdict-title">{heading}</h1>
                <div className="verdict-scale" aria-hidden>
                  <span className="verdict-scale-fill" style={{ width: `${score}%` }} />
                  <span className="verdict-scale-mark" style={{ left: `${p.settings.passMark}%` }}>
                    <span>pass {p.settings.passMark}</span>
                  </span>
                </div>
              </div>
            </div>
            <dl className="verdict-facts">
              <div>
                <dt>Correct</dt>
                <dd className="num">
                  {correctCount}
                  <small>/{items.length}</small>
                </dd>
              </div>
              <div>
                <dt>Time used</dt>
                <dd className="num">{formatClock(elapsed)}</dd>
              </div>
              <div>
                <dt>Pass mark</dt>
                <dd className="num">
                  {p.settings.passMark}
                  <small>%</small>
                </dd>
              </div>
              <div>
                <dt>Counts to pass</dt>
                <dd className="num">{full ? 'Yes' : <small className="verdict-no">No, practice</small>}</dd>
              </div>
            </dl>
            <div className="verdict-actions">
              {missed.length > 0 && (
                <Link
                  className={`btn btn-lg ${nextTopic ? '' : 'btn-primary'}`}
                  to={recordTopicId ? `/practice?topic=${recordTopicId}` : '/practice'}
                >
                  Practise the {missed.length} I missed <ArrowRight size={17} aria-hidden />
                </Link>
              )}
              <button
                className={`btn btn-lg ${missed.length || nextTopic ? '' : 'btn-primary'}`}
                type="button"
                onClick={() => setPhase('setup')}
              >
                <RotateCcw size={16} aria-hidden /> Retake
              </button>
              <Link className="btn-ghost btn-lg" to="/weak-areas">
                All weak areas <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </div>
      {passed && full && recordTopicId && <NextTopic topicId={recordTopicId} />}
      <AttemptAnalysis items={items.map((it) => it.q)} missed={missed} />

      <section className="review" aria-labelledby="review-title">
        <div className="review-head">
          <div>
            <p className="lbl">Every answer, explained</p>
            <h2 id="review-title">Review</h2>
          </div>
          <div className="row gap-s" role="group" aria-label="Filter review">
            <button
              type="button"
              className={`chip ${reviewFilter === 'all' ? 'on' : ''}`}
              aria-pressed={reviewFilter === 'all'}
              onClick={() => setReviewFilter('all')}
            >
              All <span className="chip-n">{items.length}</span>
            </button>
            <button
              type="button"
              className={`chip ${reviewFilter === 'wrong' ? 'on' : ''}`}
              aria-pressed={reviewFilter === 'wrong'}
              onClick={() => setReviewFilter('wrong')}
            >
              Wrong only <span className="chip-n">{items.length - correctCount}</span>
            </button>
          </div>
        </div>
        {!shown.length && (
          <p className="review-empty tint-good">
            <CircleCheck size={18} aria-hidden /> Nothing wrong in this attempt.
          </p>
        )}
        <ol className="review-list">
          {shown.map((it) => {
            const sel = answers[it.q.id] ?? [];
            const ok = sameSet(sel, it.q.correct);
            const n = items.indexOf(it) + 1;
            const verdict = ok ? 'Correct' : sel.length ? 'Incorrect' : 'Unanswered';
            const tone = ok ? 'ok' : sel.length ? 'bad' : 'skip';
            return (
              <li key={it.q.id} className={`review-item ${tone}`}>
                <div className="review-item-head">
                  <span className="qnum small">Q {pad(n)}</span>
                  <span className={`badge review-verdict ${tone}`}>
                    {ok ? <CircleCheck size={12} aria-hidden /> : sel.length ? <CircleX size={12} aria-hidden /> : null}
                    {verdict}
                  </span>
                  {it.q.correct.length > 1 && <span className="badge badge-ion">Select all</span>}
                  <DifficultyBadge d={it.q.difficulty} />
                  {flagged.has(it.q.id) && (
                    <span className="badge qflag">
                      <Flag size={11} aria-hidden fill="currentColor" /> Flagged
                    </span>
                  )}
                </div>
                <div className="review-q">
                  <Markdown>{it.q.question}</Markdown>
                </div>
                {it.q.code && <CodeBlock snippet={it.q.code} compact />}
                <ul className="review-opts">
                  {it.order.map((orig, di) => {
                    const isC = it.q.correct.includes(orig);
                    const isS = sel.includes(orig);
                    return (
                      <li key={orig} className={`review-opt ${isC ? 'c' : ''} ${isC && !isS ? 'missed' : ''} ${isS && !isC ? 'w' : ''}`}>
                        <span className="opt-k" aria-hidden>
                          {letter(di)}
                        </span>
                        <span className="review-opt-text">
                          <Markdown>{it.q.options[orig]}</Markdown>
                        </span>
                        {(isC || isS) && (
                          <span className="review-opt-tag">
                            {isC && isS && 'your pick · correct'}
                            {isC && !isS && 'correct · not picked'}
                            {!isC && isS && 'your pick'}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="review-why">
                  <span className="lbl">Why</span>
                  <Markdown>{it.q.explanation}</Markdown>
                </div>
                <FollowUps items={it.q.followUps} startOpen={0} />
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** After a passed exam: point straight at the next topic (or the architecture challenges after the last one). */
function NextTopic({ topicId }: { topicId: string }) {
  const i = TOPICS.findIndex((t) => t.id === topicId);
  const next = TOPICS[i + 1];
  return next ? (
    <NextUp lead={<strong>Topic passed. Keep the momentum going.</strong>} label={`Next topic: ${next.title}`} to={`/topic/${next.id}`} />
  ) : (
    <NextUp lead={<strong>That was the last topic.</strong>} label="Architecture Challenges" to="/challenges" />
  );
}

/** Weak areas for one attempt: missed questions grouped by topic section, plus a difficulty breakdown. */
function AttemptAnalysis({ items, missed }: { items: MCQ[]; missed: MCQ[] }) {
  const byTopic = new Map<string, MCQ[]>();
  for (const q of missed) {
    const t = MCQ_TOPIC.get(q.id);
    if (t) byTopic.set(t.id, [...(byTopic.get(t.id) ?? []), q]);
  }
  const levels: Difficulty[] = ['medium', 'hard', 'expert'];
  const missedIds = new Set(missed.map((q) => q.id));
  const multiTopic = byTopic.size > 1;
  return (
    <section className="loss glass rise d1" aria-labelledby="loss-title">
      <p className="lbl">{missed.length ? `${missed.length} mark${missed.length === 1 ? '' : 's'} dropped` : 'Clean sheet'}</p>
      <h2 id="loss-title">{missed.length ? 'Where you lost marks' : 'No weak spots in this attempt'}</h2>
      <div className={`loss-grid ${missed.length ? '' : 'solo'}`}>
        <table className="meter-table">
          <caption>By difficulty</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Difficulty</th>
              <th scope="col">Correct</th>
              <th scope="col">Share</th>
              <th scope="col">Percent</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((d) => {
              const qs = items.filter((q) => q.difficulty === d);
              if (!qs.length) return null;
              const ok = qs.filter((q) => !missedIds.has(q.id)).length;
              const rate = Math.round((ok / qs.length) * 100);
              return (
                <tr key={d} className={rate < 60 ? 'low' : ''}>
                  <th scope="row">
                    <DifficultyBadge d={d} />
                  </th>
                  <td className="meter-n">
                    {ok}/{qs.length}
                  </td>
                  <td className="meter" aria-hidden>
                    <span style={{ width: `${rate}%` }} />
                  </td>
                  <td className="meter-pct">{rate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {missed.length > 0 && (
          <div className="loss-sections">
            {[...byTopic].map(([topicId, qs]) => {
              const topic = TOPIC_BY_ID.get(topicId)!;
              return (
                <div key={topicId}>
                  <p className="loss-caption">{multiTopic ? topic.title : 'Sections to revise'}</p>
                  <ul className="rev-list">
                    {weakSections(topic, qs).map((ws) => (
                      <li key={ws.index}>
                        <span className="rev-count">{ws.missed.length} missed</span>
                        <span className="rev-heading">{ws.heading}</span>
                        <Link to={`/topic/${topic.id}?tab=learn&s=${ws.index}`} className="rev-link">
                          Revise §{ws.index + 1} <ArrowRight size={13} aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="loss-note">
              Sections are matched automatically from each question&apos;s wording. The review below has the exact reasoning.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
