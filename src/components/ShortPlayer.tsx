// The Shorts player (M5, ported from system-design-learn, restyled to Neural Aurora): beats one at a time with progress
// bars, Back / Next, tap zones, hold or Space to pause, reading speed, a quiz that blocks Next until answered, and an
// end card linking to the lesson. The timing rules live in the pure reducer `playerStep` (src/lib/shorts.ts).
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { BookOpen, Check, ChevronLeft, ChevronRight, CirclePlay, Pause, Play, RotateCcw, X } from 'lucide-react';
import { barFill, PLAYER_START, playerStep, quizBlocks, type PlayerAction, type PlayerState, type ShortEntry } from '../lib/shorts';
import { SaveButton } from './SaveButton';
import type { ShortBeat, ShortStat } from '../types';

/** `*words*` → gradient words, `**words**` → bold */
function marks(text: string | undefined): ReactNode {
  if (!text) return null;
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part.startsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : <Fragment key={i}>{part}</Fragment>,
  );
}

const fmt = (n: number, decimals = 0) => (decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-GB'));
const d = (ms: number) => ({ ['--d' as string]: `${ms}ms` });

function Stats({ stats, delay }: { stats?: ShortStat[]; delay: number }) {
  if (!stats?.length) return null;
  return (
    <div className="b-stats in" style={d(delay)}>
      {stats.map((s) => (
        <span className="b-stat" key={s.label}>
          {typeof s.value === 'number' ? <b data-count={s.value}>{fmt(s.value)}</b> : <b>{s.value}</b>}
          <small>{s.label}</small>
        </span>
      ))}
    </div>
  );
}

function Quiz({ beat, solved, onSolve }: { beat: Extract<ShortBeat, { type: 'quiz' }>; solved: boolean; onSolve: (firstTry: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(solved ? beat.answer : null);
  const missed = useRef(false);
  const right = solved || picked === beat.answer;
  return (
    <>
      <div className="q-opts in" style={d(250)} role="group" aria-label="Your answer">
        {beat.options.map((o, i) => (
          <button
            key={`${i}-${picked === i ? 'p' : ''}`}
            type="button"
            className={`q-opt${right && i === beat.answer ? ' right' : ''}${!right && picked === i ? ' wrong shake' : ''}${right && i !== beat.answer ? ' dim' : ''}`}
            disabled={right}
            onClick={() => {
              setPicked(i);
              if (i === beat.answer) onSolve(!missed.current);
              else missed.current = true;
            }}
          >
            <span className="k" aria-hidden>
              {String.fromCharCode(65 + i)}
            </span>
            {o.text}
          </button>
        ))}
      </div>
      <p className={`q-fb${right ? ' ok' : picked !== null ? ' no' : ''}`} aria-live="polite">
        {right ? (
          <>
            <b>Right.</b> {beat.options[beat.answer].why} Press Next to continue.
          </>
        ) : picked !== null ? (
          <>
            <b>Not that one.</b> {beat.options[picked].why}
          </>
        ) : null}
      </p>
      {!right && <p className="q-gate">Answer to continue</p>}
    </>
  );
}

function Beat({ beat, solved, onSolve }: { beat: ShortBeat; solved: boolean; onSolve: (firstTry: boolean) => void }) {
  const kicker = <p className="bt-eye in">{beat.kicker}</p>;
  const head = beat.head && (
    <h2 className="bt-h in" style={d(120)}>
      {marks(beat.head)}
    </h2>
  );
  const sub = (delay = 1400) => beat.sub && (
    <p className="bt-sub in" style={d(delay)}>
      {marks(beat.sub)}
    </p>
  );
  switch (beat.type) {
    case 'counter':
      return (
        <>
          {kicker}
          {head}
          <p className="b-num in" style={d(200)}>
            {beat.prefix}
            <span data-count={beat.value} data-dec={beat.decimals ?? 0}>
              {fmt(beat.value, beat.decimals)}
            </span>
            {beat.suffix}
            <small>{beat.unit}</small>
          </p>
          <Stats stats={beat.stats} delay={900} />
          {sub(1100)}
        </>
      );
    case 'spike':
      return (
        <>
          {kicker}
          {head}
          <svg className="b-spike in" style={d(300)} viewBox="0 0 320 150" aria-hidden>
            <defs>
              <linearGradient id="b-spike-g" x1="0" x2="1">
                <stop offset="0" stopColor="#7c5cff" />
                <stop offset=".6" stopColor="#22e4ff" />
                <stop offset="1" stopColor="#ff8fc8" />
              </linearGradient>
            </defs>
            <path d="M0 140 H320" stroke="rgb(255 255 255 / .18)" />
            <path className="draw" pathLength={1} d="M0 128 C 60 126, 90 122, 120 118 S 160 110, 175 60 S 200 20, 215 22 S 260 30, 320 34" fill="none" stroke="url(#b-spike-g)" strokeWidth={4} strokeLinecap="round" />
            <circle className="pop-in" style={d(1900)} cx={178} cy={52} r={6} fill="#ff8fc8" />
            <text className="in" style={d(2100)} x={190} y={72} fill="#ff8fc8">
              {beat.mark}
            </text>
          </svg>
          <Stats stats={beat.stats} delay={1200} />
          {sub()}
        </>
      );
    case 'race':
      return (
        <>
          {kicker}
          {head}
          <div className="b-race in" style={d(300)}>
            {beat.lanes.map((l) => (
              <div className="lane" key={l.label}>
                <span>{l.label}</span>
                <span className="track">
                  <i className={`t-${l.tone}`} style={{ animationDuration: `${l.seconds}s`, animationDelay: `${0.9 + (l.after ?? 0)}s` }} />
                </span>
              </div>
            ))}
          </div>
          <Stats stats={beat.stats} delay={1200} />
          {sub(1600)}
        </>
      );
    case 'grid':
      return (
        <>
          {kicker}
          {head}
          <div className="b-grid in" style={d(300)}>
            {Array.from({ length: beat.cells }, (_, i) => (
              <i key={i} className={i < (beat.hot ?? 0) ? 'hot' : ''} style={d(800 + i * 60)} />
            ))}
          </div>
          <p className="bt-cap in" style={d(1200)}>
            {marks(beat.caption)}
          </p>
          {sub(1600)}
        </>
      );
    case 'ladder': {
      const max = Math.max(...beat.rungs.map((r) => Math.abs(r.amount)), 1e-9);
      return (
        <>
          {kicker}
          {head}
          <div className="b-ladder">
            {beat.rungs.map((r, i) => (
              <div className="rung in" key={r.label} style={d(600 + i * 550)}>
                <span>{r.label}</span>
                <span className="bar">
                  <i style={{ ...d(800 + i * 550), ['--s' as string]: Math.abs(r.amount) / max }} />
                </span>
                <b>
                  {r.amount.toLocaleString('en-GB')} {beat.unit}
                </b>
              </div>
            ))}
          </div>
          {sub(800 + beat.rungs.length * 550)}
        </>
      );
    }
    case 'toggles': {
      let off = 0;
      return (
        <>
          {kicker}
          {head}
          <div className="b-toggles in" style={d(300)}>
            {beat.items.map((it) =>
              it.keep ? (
                <div className="tg keep" key={it.label}>
                  <span className="sw" aria-hidden />
                  {it.label}
                  <span className="shield">{beat.keepLabel ?? 'KEEP'}</span>
                </div>
              ) : (
                <div className="tg shed" key={it.label} style={d(1200 + off++ * 650)}>
                  <span className="sw" aria-hidden />
                  <span className="txt">{it.label}</span>
                  <span className="sr-only"> (switched off)</span>
                </div>
              ),
            )}
          </div>
          {sub(1400 + off * 650)}
        </>
      );
    }
    case 'flow':
      return (
        <>
          {kicker}
          {head}
          <ol className="b-flow">
            {beat.steps.map((s, i) => (
              <li key={s} className={`in${beat.broken === i ? ' broken' : ''}`} style={d(600 + i * 550)}>
                <span className="n" aria-hidden>
                  {beat.broken === i ? '✕' : i + 1}
                </span>
                {s}
                {beat.broken === i && <span className="sr-only"> (where it went wrong)</span>}
              </li>
            ))}
          </ol>
          {sub(800 + beat.steps.length * 550)}
        </>
      );
    case 'tokens': {
      const [win] = beat.picks;
      return (
        <>
          {kicker}
          {head}
          <p className="tok-out in" style={d(300)}>
            <span className="p">{beat.prompt}</span>
            <span className="t" style={d(2600)}>
              {win.token}
            </span>
            <span className="caret" aria-hidden />
          </p>
          <div className="cands">
            {beat.picks.map((c, i) => (
              <div className={`cand in${i === 0 ? ' win' : ''}`} key={c.token} style={d(700 + i * 200)}>
                <span className="w">{c.token.trim()}</span>
                <span className="bar">
                  <i style={{ ...d(900 + i * 200), ['--s' as string]: c.p }} />
                </span>
                <span className="pv">{c.p.toFixed(2)}</span>
              </div>
            ))}
          </div>
          {sub(2900)}
        </>
      );
    }
    case 'retrieve':
      return (
        <>
          {kicker}
          {head}
          <p className="bubble user in" style={d(300)}>
            <span className="who">Query</span>
            {beat.query}
          </p>
          <ol className="b-chunks">
            {beat.chunks.map((c, i) => (
              <li key={c.text} className={`in${i < beat.k ? ' top' : ''}`} style={d(800 + i * 350)}>
                <span className="txt">{c.text}</span>
                <span className="bar">
                  <i style={{ ...d(1000 + i * 350), ['--s' as string]: c.score }} />
                </span>
                <b>{c.score.toFixed(2)}</b>
                {i < beat.k && <span className="sr-only"> (sent to the model)</span>}
              </li>
            ))}
          </ol>
          <p className="bt-cap in" style={d(1200 + beat.chunks.length * 350)}>
            Top {beat.k} go to the model
          </p>
          {sub(1500 + beat.chunks.length * 350)}
        </>
      );
    case 'claims':
      return (
        <>
          {kicker}
          {head}
          <ul className="b-claims">
            {beat.claims.map((c, i) => (
              <li key={c.text} className={`claim in ${c.ok ? 'ok' : 'no'}`} style={d(600 + i * 700)}>
                <span className="vd" aria-hidden style={d(1100 + i * 700)}>
                  {c.ok ? '✓' : '✕'}
                </span>
                <span>
                  <span className="txt">{c.text}</span>
                  <span className="tag">
                    <span className="sr-only">{c.ok ? 'Supported' : 'Not supported'}: </span>
                    {c.note}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {sub(1000 + beat.claims.length * 700)}
        </>
      );
    case 'quiz':
      return (
        <>
          {kicker}
          <h2 className="bt-h in" style={d(120)}>
            {marks(beat.head)}
          </h2>
          <Quiz beat={beat} solved={solved} onSolve={onSolve} />
        </>
      );
  }
}

/** The next Short when playing a list (Saved → Play all) */
export interface UpNext {
  href: string;
  title: string;
  /** "2 of 5" */
  position: string;
}

const UP_NEXT_SECONDS = 5;

/**
 * Plays one Short. `onFinish` fires once, when the end card is reached; `onQuiz` when the quiz is answered right.
 * With `next`, the end card moves on to it after a few seconds.
 */
export function ShortPlayer({
  entry,
  onClose,
  onFinish,
  onQuiz,
  onNext,
  next: upNext,
}: {
  entry: ShortEntry;
  onClose: () => void;
  onFinish?: () => void;
  onQuiz?: (firstTry: boolean) => void;
  onNext?: () => void;
  next?: UpNext;
}) {
  const { short, topic, section } = entry;
  const beats = short.beats;
  const END = beats.length;
  const reduce = useReducedMotion();
  // the reducer state lives in a ref (the clock ticks every frame); React re-renders only when something visible changes
  const [s, setS] = useState<PlayerState>(PLAYER_START);
  const ref = useRef<PlayerState>(PLAYER_START);
  const send = useCallback(
    (a: PlayerAction) => {
      const prev = ref.current;
      const n = playerStep(beats, prev, a);
      if (n === prev) return;
      ref.current = n;
      if (a.type !== 'tick' || n.cur !== prev.cur) setS(n);
    },
    [beats],
  );
  const stage = useRef<HTMLDivElement>(null);
  const bars = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const beat = s.cur < END ? beats[s.cur] : null;
  const waiting = quizBlocks(beats, s);
  const stopped = s.paused || s.held;

  useEffect(() => root.current?.focus(), []);

  const finished = useRef(false);
  useEffect(() => {
    if (s.cur === END && !finished.current) {
      finished.current = true;
      onFinish?.();
    }
  }, [s.cur, END, onFinish]);

  // playing a list: the end card counts down to the next Short (pausing stops it)
  const [countdown, setCountdown] = useState(UP_NEXT_SECONDS);
  useEffect(() => {
    if (!upNext || s.cur !== END || stopped) return;
    if (countdown <= 0) {
      onNext?.();
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [upNext, s.cur, END, stopped, countdown, onNext]);

  // the clock: fills the bars and counts numbers up
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      send({ type: 'tick', dt: now - last });
      last = now;
      const st = ref.current;
      bars.current?.querySelectorAll<HTMLElement>('i').forEach((el, i) => (el.style.transform = `scaleX(${barFill(beats, st, i)})`));
      stage.current?.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
        const t = reduce ? 1 : Math.max(0, Math.min(1, (st.elapsed * st.speed - 400) / 1600));
        el.textContent = fmt(Number(el.dataset.count) * (1 - (1 - t) ** 3), Number(el.dataset.dec ?? 0));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beats, send, reduce]);

  // keyboard: ← → move, Space pauses, Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      const t = e.target instanceof Element ? e.target : document.body;
      if (t.closest('input, textarea, select, [contenteditable], .cmdk-panel')) return;
      if (e.key === 'ArrowRight') send({ type: 'next' });
      else if (e.key === 'ArrowLeft') send({ type: 'back' });
      // Space on a button or link presses it instead
      else if (e.key === ' ' && !t.closest('button, a')) {
        e.preventDefault();
        send({ type: 'pause' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [send, onClose]);

  // a tap on a side moves; a long press holds until released (like Stories)
  const press = useRef({ timer: 0, held: false });
  const zone = (a: PlayerAction) => ({
    onPointerDown: () => {
      press.current.held = false;
      press.current.timer = window.setTimeout(() => {
        press.current.held = true;
        send({ type: 'hold', on: true });
      }, 260);
    },
    onPointerUp: () => {
      clearTimeout(press.current.timer);
      if (press.current.held) send({ type: 'hold', on: false });
      else send(a);
    },
    onPointerLeave: () => {
      clearTimeout(press.current.timer);
      if (press.current.held) send({ type: 'hold', on: false });
    },
    // keyboard activation (pointer events don't fire for Enter / Space on a focused button)
    onClick: (e: { detail: number }) => e.detail === 0 && send(a),
  });

  const lesson = `/topic/${topic.id}?tab=learn&s=${section}`;
  const sectionTitle = topic.sections[section]?.heading.split(' — ')[0] ?? topic.title;

  return (
    <div className="sp-wrap">
      <button type="button" className="sp-side" onClick={() => send({ type: 'back' })} disabled={s.cur === 0} aria-label="Previous beat">
        <ChevronLeft size={22} aria-hidden />
      </button>
      <div ref={root} tabIndex={-1} className={`sp${s.held ? ' held' : ''}${s.paused ? ' paused' : ''}`} role="region" aria-roledescription="short video" aria-label={short.title}>
        <div className="sp-top">
          <div className="sp-bars" ref={bars} aria-hidden>
            {[...beats, null].map((b, i) => (
              <div key={i} className={`sp-bar${b?.type === 'quiz' ? ' q' : ''}`}>
                <i />
              </div>
            ))}
          </div>
          <div className="sp-head">
            <span className="sp-topic">
              <span className="av" aria-hidden>
                <CirclePlay size={16} />
              </span>
              <span>
                <b>{short.title}</b>
                <small>
                  {Math.min(s.cur, END) + 1}/{END + 1} · {topic.title}
                </small>
              </span>
            </span>
            <button type="button" className="sp-tb speed" onClick={() => send({ type: 'speed' })} aria-label={`Reading speed ${s.speed}×. Change speed`} title="Reading speed">
              {s.speed}×
            </button>
            <button type="button" className="sp-tb" onClick={() => send({ type: 'pause' })} aria-label={s.paused ? 'Play' : 'Pause'} aria-pressed={s.paused}>
              {s.paused ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
            </button>
            <SaveButton kind="short" refId={short.id} topicId={topic.id} title={short.title} compact />
            <button type="button" className="sp-tb" onClick={onClose} aria-label="Close the Short (Esc)">
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        {beat && <button type="button" className="sp-zone l" aria-label="Previous beat" tabIndex={-1} {...zone({ type: 'back' })} />}
        {beat && !waiting && <button type="button" className="sp-zone r" aria-label="Next beat" tabIndex={-1} {...zone({ type: 'next' })} />}

        <div className="sp-body" ref={stage} key={s.run} aria-live="polite">
          <p className="sr-only">{beat ? `Beat ${s.cur + 1} of ${END}` : 'End of the Short'}</p>
          {beat ? (
            <Beat beat={beat} solved={s.solved.includes(s.cur)} onSolve={(firstTry) => (send({ type: 'solve' }), onQuiz?.(firstTry))} />
          ) : (
            <div className="b-end">
              <span className="end-ring in" aria-hidden>
                <Check size={28} strokeWidth={3} />
              </span>
              <h2 className="bt-h in" style={d(120)}>
                {marks(short.takeaway.head)}
              </h2>
              <p className="bt-sub in" style={d(250)}>
                {marks(short.takeaway.sub)}
              </p>
              <div className="learn in" style={d(400)}>
                <p className="lbl">Learn it properly · §{section + 1}</p>
                <b>{sectionTitle}</b>
                <Link className={`btn ${upNext ? '' : 'btn-primary'}`} to={lesson}>
                  <BookOpen size={15} aria-hidden /> Read the lesson
                </Link>
              </div>
              {upNext && (
                <button type="button" className="btn btn-primary end-next" onClick={onNext}>
                  <Play size={15} aria-hidden /> Next Short ({upNext.position}){stopped ? '' : ` in ${countdown} s`}
                  <small>{upNext.title}</small>
                </button>
              )}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCountdown(UP_NEXT_SECONDS);
                  send({ type: 'replay' });
                }}
              >
                <RotateCcw size={15} aria-hidden /> Watch again
              </button>
            </div>
          )}
        </div>

        {s.held && <div className="sp-paused">Paused · release to play</div>}
        {s.paused && !s.held && beat && <div className="sp-paused">Paused · Space or ▶ to play</div>}

        <div className="sp-foot">
          <button type="button" className="sp-nav" onClick={() => send({ type: 'back' })} disabled={s.cur === 0}>
            <ChevronLeft size={15} aria-hidden /> Back
          </button>
          <button type="button" className="sp-nav" onClick={() => send({ type: 'next' })} disabled={s.cur >= END || waiting} title={waiting ? 'Answer the question first' : undefined}>
            Next <ChevronRight size={15} aria-hidden />
          </button>
        </div>
      </div>
      <button type="button" className="sp-side" onClick={() => send({ type: 'next' })} disabled={s.cur >= END || waiting} aria-label="Next beat">
        <ChevronRight size={22} aria-hidden />
      </button>
      <p className="sp-help" aria-hidden>
        <span>
          <kbd>←</kbd> <kbd>→</kbd> beats
        </span>
        <span>
          <kbd>Space</kbd> pause · hold to pause
        </span>
        <span>
          <kbd>Esc</kbd> close
        </span>
      </p>
    </div>
  );
}
