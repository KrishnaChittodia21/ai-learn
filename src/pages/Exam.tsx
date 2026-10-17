import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { MCQ_TOPIC, TOPICS, TOPIC_BY_ID } from '../content';
import { Check, CircleCheck, CircleX, Flag } from 'lucide-react';
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
        <Link to={`/topic/${topic.id}`} className="muted small">
          ← {topic.title}
        </Link>
        <StudyLock topic={topic} what="exam" />
      </div>
    );
  }
  return (
    <Exam
      key={topic.id}
      title={topic.title}
      questions={topic.test}
      recordTopicId={topic.id}
      backHref={`/topic/${topic.id}?tab=exam`}
    />
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
      recordAnswers(items.map((it) => ({ id: it.q.id, correct: sameSet(answers[it.q.id] ?? [], it.q.correct) })));
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

  // keyboard: 1-5 (or A-E) choose, ←/→ navigate, f flag
  useEffect(() => {
    if (phase !== 'running') return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const item = items[cur];
      if (!item) return;
      const key = e.key.toLowerCase();
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
  }, [phase, items, cur, toggle, toggleFlag, locked]);

  if (phase === 'setup') {
    const perQ = Math.round((minutes * 60) / Math.max(1, count));
    return (
      <div className="page narrow exam-setup">
        <Link to={backHref} className="paper-back">
          ← Back
        </Link>
        <p className="eyebrow">{kind}</p>
        <h1>{title}</h1>
        <p className="lead">
          {total} question{total === 1 ? '' : 's'} on the paper.{' '}
          {recordTopicId
            ? `Pass mark ${p.settings.passMark}%. Only a full-length attempt counts towards passing the topic.`
            : 'A drill updates your weak areas but never affects an exam pass.'}
        </p>

        <div className="setup-sheet">
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
                <input type="checkbox" checked={shuffleOn} onChange={(e) => setShuffleOn(e.target.checked)} />
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
                <input type="checkbox" checked={interviewMode} onChange={(e) => setInterviewMode(e.target.checked)} />
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
            </div>
          </div>
        </div>

        <div className="setup-go">
          <button className="btn btn-primary btn-lg" type="button" onClick={start}>
            Start {recordTopicId ? 'exam' : 'drill'} · {minutes} min
          </button>
          <span className="setup-hint">
            {count} question{count === 1 ? '' : 's'} · pass mark {p.settings.passMark}% · auto-submits at 00:00
          </span>
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
    const qLabelId = `q-${item.q.id}`;
    return (
      <div className="page paper">
        <div className="paper-bar">
          <div className="paper-bar-inner">
            <div className="paper-bar-title">
              <span className="paper-bar-kind">{kind}</span>
              <strong>{title}</strong>
            </div>
            <div className="paper-bar-stats" aria-live="off">
              <span>
                <b>{answered}</b>/{items.length} answered
              </span>
              {flagged.size > 0 && (
                <span>
                  <b>{flagged.size}</b> flagged
                </span>
              )}
            </div>
            <div className={`paper-clock ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`Time remaining ${formatClock(remaining)}`}>
              <span className="paper-clock-label">{urgent ? 'Last minute' : 'Time left'}</span>
              <span className="paper-clock-time">{formatClock(remaining)}</span>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                const un = items.length - answered;
                if (!un || window.confirm(`${un} question(s) unanswered. Submit anyway?`)) submit();
              }}
            >
              Submit
            </button>
          </div>
          <div
            className="paper-progress"
            role="progressbar"
            aria-label="Questions answered"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={answered}
          >
            <span style={{ width: `${(answered / items.length) * 100}%` }} />
          </div>
        </div>

        <div className="paper-grid">
          <article className="paper-main" aria-labelledby={qLabelId}>
            <header className="paper-qhead">
              <span className="paper-qnum">
                Q {pad(cur + 1)} <span>/ {pad(items.length)}</span>
              </span>
              <span className="paper-qmeta">
                {multi && <span className="paper-multi">Select all that apply</span>}
                <DifficultyBadge d={item.q.difficulty} />
              </span>
            </header>
            <div className="paper-question" id={qLabelId}>
              <Markdown>{item.q.question}</Markdown>
            </div>
            {item.q.code && <CodeBlock snippet={item.q.code} />}
            <div
              className="paper-options"
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
                    className={`paper-opt ${multi ? 'multi' : ''} ${on ? 'on' : ''} ${verdict}`}
                    onClick={() => {
                      if (!isLocked) toggle(item, orig);
                    }}
                  >
                    <span className="paper-key" aria-hidden>
                      {multi && on ? <Check size={13} strokeWidth={3} /> : letter(di)}
                    </span>
                    <span className="paper-opt-text">
                      <Markdown>{item.q.options[orig]}</Markdown>
                    </span>
                    {isLocked && isC && <CircleCheck size={17} aria-label={on ? 'your pick, correct' : 'correct answer you did not pick'} className="paper-opt-icon" />}
                    {isLocked && on && !isC && <CircleX size={17} aria-label="your wrong pick" className="paper-opt-icon" />}
                  </button>
                );
              })}
            </div>
            {interviewMode && !isLocked && (
              <div className="paper-lock">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!selected.length}
                  onClick={() => setLocked((l) => new Set(l).add(item.q.id))}
                >
                  Lock answer &amp; hear the follow-up
                </button>
                <span className="paper-hint">{selected.length ? 'Locked answers cannot be changed.' : 'Pick an answer first.'}</span>
              </div>
            )}
            {isLocked && (
              <div className={`paper-feedback ${gotIt ? 'ok' : 'bad'}`} aria-live="polite">
                <p className="paper-feedback-verdict">{gotIt ? 'Correct.' : 'Not quite.'}</p>
                <Markdown>{item.q.explanation}</Markdown>
                <FollowUps key={item.q.id} items={item.q.followUps} />
              </div>
            )}
            <footer className="paper-foot">
              <button className="btn" type="button" disabled={cur === 0} onClick={() => setCur(cur - 1)}>
                ← Prev
              </button>
              <button
                className={`btn-ghost paper-flag ${isFlagged ? 'on' : ''}`}
                type="button"
                aria-pressed={isFlagged}
                onClick={() => toggleFlag(item.q.id)}
              >
                <Flag size={15} aria-hidden fill={isFlagged ? 'currentColor' : 'none'} /> {isFlagged ? 'Flagged' : 'Flag for review'}
              </button>
              {cur < items.length - 1 ? (
                <button className="btn" type="button" onClick={() => setCur(cur + 1)}>
                  Next →
                </button>
              ) : (
                <button className="btn" type="button" disabled>
                  Last question
                </button>
              )}
            </footer>
          </article>

          <nav className="paper-rail" aria-label="Question navigator">
            <div className="paper-rail-head">
              <span>Paper</span>
              <span>
                {answered}/{items.length}
              </span>
            </div>
            <ol className="paper-cells">
              {items.map((it, i) => {
                const ans = (answers[it.q.id] ?? []).length > 0;
                const fl = flagged.has(it.q.id);
                const state = [ans ? 'answered' : 'unanswered', fl ? 'flagged' : ''].filter(Boolean).join(', ');
                return (
                  <li key={it.q.id}>
                    <button
                      type="button"
                      className={`paper-cell ${i === cur ? 'cur' : ''} ${ans ? 'ans' : ''} ${fl ? 'flag' : ''}`}
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
            <ul className="paper-legend" aria-hidden>
              <li>
                <span className="paper-cell mini ans" /> answered
              </li>
              <li>
                <span className="paper-cell mini" /> open
              </li>
              <li>
                <span className="paper-cell mini flag" /> flagged
              </li>
              <li>
                <span className="paper-cell mini cur" /> current
              </li>
            </ul>
            <p className="paper-rail-keys">
              <kbd>1</kbd>–<kbd>5</kbd> pick · <kbd>←</kbd>
              <kbd>→</kbd> move · <kbd>F</kbd> flag
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
      <Link to={backHref} className="paper-back">
        ← Back
      </Link>
      <section className={`verdict ${passed ? 'pass' : 'fail'}`} aria-labelledby="verdict-title">
        <p className="eyebrow">
          {kind} · {title}
        </p>
        <div className="verdict-grid">
          <div className="verdict-score" aria-label={`Score ${score} percent`}>
            {score}
            <span>%</span>
          </div>
          <div className="verdict-body">
            <p className="verdict-stamp">{passed ? 'Pass' : 'Below pass mark'}</p>
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
            <dd>
              {correctCount}/{items.length}
            </dd>
          </div>
          <div>
            <dt>Time used</dt>
            <dd>{formatClock(elapsed)}</dd>
          </div>
          <div>
            <dt>Pass mark</dt>
            <dd>{p.settings.passMark}%</dd>
          </div>
          <div>
            <dt>Counts to pass</dt>
            <dd>{full ? 'Yes' : 'No, practice'}</dd>
          </div>
        </dl>
        <div className="verdict-actions">
          {missed.length > 0 && (
            <Link className={`btn ${nextTopic ? '' : 'btn-primary'}`} to={recordTopicId ? `/practice?topic=${recordTopicId}` : '/practice'}>
              Practise the {missed.length} I missed
            </Link>
          )}
          <button className={`btn ${missed.length || nextTopic ? '' : 'btn-primary'}`} type="button" onClick={() => setPhase('setup')}>
            Retake
          </button>
          <Link className="btn-ghost" to="/weak-areas">
            All weak areas →
          </Link>
        </div>
      </section>
      {passed && full && recordTopicId && <NextTopic topicId={recordTopicId} />}
      <AttemptAnalysis items={items.map((it) => it.q)} missed={missed} />

      <section className="review" aria-labelledby="review-title">
        <div className="review-head">
          <h2 id="review-title">Review</h2>
          <div className="row gap-s" role="group" aria-label="Filter review">
            <button type="button" className={`chip ${reviewFilter === 'all' ? 'on' : ''}`} aria-pressed={reviewFilter === 'all'} onClick={() => setReviewFilter('all')}>
              All {items.length}
            </button>
            <button
              type="button"
              className={`chip ${reviewFilter === 'wrong' ? 'on' : ''}`}
              aria-pressed={reviewFilter === 'wrong'}
              onClick={() => setReviewFilter('wrong')}
            >
              Wrong only {items.length - correctCount}
            </button>
          </div>
        </div>
        {!shown.length && <p className="review-empty">Nothing wrong in this attempt.</p>}
        <ol className="review-list">
          {shown.map((it) => {
            const sel = answers[it.q.id] ?? [];
            const ok = sameSet(sel, it.q.correct);
            const n = items.indexOf(it) + 1;
            const verdict = ok ? 'Correct' : sel.length ? 'Incorrect' : 'Unanswered';
            return (
              <li key={it.q.id} className={`review-item ${ok ? 'ok' : sel.length ? 'bad' : 'skip'}`}>
                <div className="review-item-head">
                  <span className="paper-qnum small">Q {pad(n)}</span>
                  <span className="review-verdict">{verdict}</span>
                  {it.q.correct.length > 1 && <span className="paper-multi">Select all</span>}
                  <DifficultyBadge d={it.q.difficulty} />
                </div>
                <div className="review-q">
                  <Markdown>{it.q.question}</Markdown>
                </div>
                {it.q.code && <CodeBlock snippet={it.q.code} compact />}
                <ul className="review-opts-list">
                  {it.order.map((orig, di) => {
                    const isC = it.q.correct.includes(orig);
                    const isS = sel.includes(orig);
                    return (
                      <li key={orig} className={`review-opt ${isC ? 'c' : ''} ${isC && !isS ? 'missed' : ''} ${isS && !isC ? 'w' : ''}`}>
                        <span className="paper-key" aria-hidden>
                          {letter(di)}
                        </span>
                        <span className="review-opt-text">
                          <Markdown>{it.q.options[orig]}</Markdown>
                        </span>
                        <span className="review-opt-tag">
                          {isC && isS && 'your pick · correct'}
                          {isC && !isS && 'correct · not picked'}
                          {!isC && isS && 'your pick'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="review-why">
                  <span className="review-why-label">Why</span>
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
    <section className="loss" aria-labelledby="loss-title">
      <h2 id="loss-title">{missed.length ? 'Where you lost marks' : 'No weak spots in this attempt'}</h2>
      <div className="loss-grid">
        <table className="loss-table">
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
                  <td className="loss-num">
                    {ok}/{qs.length}
                  </td>
                  <td className="loss-bar" aria-hidden>
                    <span style={{ width: `${rate}%` }} />
                  </td>
                  <td className="loss-num">{rate}%</td>
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
                          Revise §{ws.index + 1}
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
