// Shared building blocks for interactive, step-by-step visualisations.
// Pattern: a pure `simulate(params) => Frame[]` produces every state up front, so stepping
// backwards, resetting and changing parameters are trivial and deterministic. Components
// only render the current frame.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react';
import {
  canShowAnswer,
  checkChoice,
  checkTune,
  isHeld,
  missCount,
  missFeedback,
  pickOption,
  turnKey,
  turnShownAt,
  type Turn,
} from './widgets/_shared/yourTurn.ts';
import './widgets/_shared/yourTurn.css';

export type { ChoiceTurn, FrameTurn, Turn, TuneTurn, TurnOption } from './widgets/_shared/yourTurn.ts';

export interface BaseFrame {
  /** one or two sentences narrating what just happened (read by screen readers) */
  caption: string;
  /** optional "what happens next?" prompt shown before advancing past this frame */
  predict?: string;
}

/** Placement of a visualisation inside a topic's Learn tab. */
export interface VizPlacement {
  topic: string;
  /** the section heading must START with this text */
  heading: string;
}

export interface VizMeta {
  id: string;
  title: string;
  /** one line: what the learner can explore */
  blurb: string;
  placements: VizPlacement[];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Steps through precomputed frames with play/pause/speed.
 * New frames (params changed) restart at step 1, unless `keepIndex`: then the current step is kept
 * (clamped), and only a change of `resetKey` (e.g. a different scenario) restarts. */
export function useFrames<F extends BaseFrame>(frames: F[], { keepIndex = false, resetKey }: { keepIndex?: boolean; resetKey?: unknown } = {}) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const last = frames.length - 1;
  const lastKey = useRef(resetKey);

  useEffect(() => {
    const keep = keepIndex && Object.is(lastKey.current, resetKey);
    lastKey.current = resetKey;
    setI((x) => (keep ? Math.min(x, frames.length - 1) : 0));
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames]);

  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setI((x) => Math.min(last, x + 1)), 1100 / speed);
    return () => clearTimeout(t);
  }, [playing, i, last, speed]);

  return {
    i,
    frame: frames[Math.min(i, last)],
    total: frames.length,
    playing,
    speed,
    setSpeed,
    play: () => {
      if (i >= last) setI(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    next: () => {
      setPlaying(false);
      setI((x) => Math.min(last, x + 1));
    },
    prev: () => {
      setPlaying(false);
      setI((x) => Math.max(0, x - 1));
    },
    reset: () => {
      setPlaying(false);
      setI(0);
    },
    seek: (n: number) => {
      setPlaying(false);
      setI(Math.max(0, Math.min(last, n)));
    },
  };
}

export type Stepper = ReturnType<typeof useFrames<BaseFrame>>;

/** Card chrome: title, parameter controls, the drawing, transport controls and narration. */
export function VizFrame({
  title,
  blurb,
  stepper,
  controls,
  children,
  legend,
  turn,
}: {
  title: string;
  blurb?: string;
  stepper: Stepper;
  /** parameter sliders/toggles */
  controls?: ReactNode;
  /** the SVG drawing */
  children: ReactNode;
  legend?: ReactNode;
  /** optional "Your turn" step (predict on one frame, or tune a control); Next/Play wait for an answer */
  turn?: Turn;
}) {
  const { frame, i, total, playing, speed } = stepper;
  const turnHere = turnShownAt(turn, i);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const held = isHeld(turn, i, done);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => setRevealed(false), [i]);
  // autoplay stops on an unanswered turn
  const { pause } = stepper;
  useEffect(() => {
    if (held && playing) pause();
  }, [held, playing, pause]);
  const next = held ? () => {} : stepper.next;
  const play = held ? () => {} : stepper.play;

  // keyboard: ←/→ step, space play/pause (only when focus is inside this card, not on a control)
  const onKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') stepper.prev();
    else if (e.key === ' ' && tag !== 'BUTTON') {
      e.preventDefault();
      if (playing) stepper.pause();
      else play();
    } else return;
    e.stopPropagation();
  };
  const heldTitle = held ? 'Answer the question first (or Skip)' : undefined;
  const pad = (n: number) => String(n).padStart(Math.max(2, String(total).length), '0');

  return (
    <figure className="viz" ref={rootRef} tabIndex={0} onKeyDown={onKey} aria-label={`${title} interactive visualisation`}>
      <div className="viz-bar">
        <div className="viz-eyebrow">
          <span className="viz-fig">Fig</span>
          <span className="viz-eyebrow-opt" aria-hidden>
            ·
          </span>
          <span className="viz-eyebrow-opt">Interactive</span>
          <span aria-hidden>·</span>
          <span>
            {total} step{total === 1 ? '' : 's'}
          </span>
        </div>
        <div className="viz-transport-main" role="group" aria-label="Playback">
          <button type="button" className="viz-btn" onClick={stepper.prev} disabled={i === 0} aria-label="Previous step" title="Previous step (←)">
            <ChevronLeft size={16} strokeWidth={2.4} aria-hidden />
          </button>
          {playing ? (
            <button type="button" className="viz-btn viz-btn-play on" onClick={stepper.pause} aria-label="Pause" title="Pause (space)">
              <Pause size={14} fill="currentColor" aria-hidden />
            </button>
          ) : (
            <button type="button" className="viz-btn viz-btn-play" onClick={play} disabled={held} aria-label="Play" title={heldTitle ?? 'Play (space)'}>
              <Play size={14} fill="currentColor" aria-hidden />
            </button>
          )}
          <button type="button" className="viz-btn" onClick={next} disabled={held || i === total - 1} aria-label="Next step" title={heldTitle ?? 'Next step (→)'}>
            <ChevronRight size={16} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      </div>
      <figcaption className="viz-head">
        <div className="viz-title">{title}</div>
        {blurb && <div className="viz-blurb">{blurb}</div>}
      </figcaption>
      {controls && <div className="viz-controls">{controls}</div>}
      <div className="viz-stage">{children}</div>
      {legend && <div className="viz-legend">{legend}</div>}
      <div className="viz-caption" aria-live="polite">
        <span className="viz-stepno">
          Step {i + 1} / {total} —
        </span>{' '}
        <span className="viz-caption-text">{frame.caption}</span>
      </div>
      {turnHere && (
        <YourTurn
          key={turnKey(turn)}
          turn={turn}
          stepper={stepper}
          done={done.includes(turnKey(turn))}
          onDone={() => setDone((d) => (d.includes(turnKey(turn)) ? d : [...d, turnKey(turn)]))}
        />
      )}
      {frame.predict && !(turnHere && turn.kind === 'choice') && (
        <div className="viz-predict">
          <span className="viz-predict-label">Predict</span>
          <span className="viz-predict-text">
            {frame.predict}{' '}
            {!revealed ? (
              <button type="button" className="link-btn" onClick={() => setRevealed(true)}>
                Think, then reveal →
              </button>
            ) : i < total - 1 ? (
              <button type="button" className="link-btn" onClick={next}>
                See what happens →
              </button>
            ) : null}
          </span>
        </div>
      )}
      <div className="viz-transport" role="group" aria-label="Timeline">
        <button type="button" className="viz-btn viz-btn-sm" onClick={stepper.reset} aria-label="Reset" title="Reset">
          <RotateCcw size={13} aria-hidden />
        </button>
        <input
          className="viz-scrub"
          type="range"
          min={0}
          max={total - 1}
          value={i}
          onChange={(e) => stepper.seek(Number(e.target.value))}
          aria-label="Scrub through steps"
          aria-valuetext={`Step ${i + 1} of ${total}`}
          style={{ ['--viz-pct' as string]: `${total > 1 ? (i / (total - 1)) * 100 : 100}%` }}
        />
        <span className="viz-count" aria-hidden>
          {pad(i + 1)}
          <span>/{pad(total)}</span>
        </span>
        <label className="viz-speed">
          <span>Speed</span>
          <select value={speed} onChange={(e) => stepper.setSpeed(Number(e.target.value))}>
            {[0.5, 1, 2, 4].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </figure>
  );
}

/** "Your turn": pick an answer (click or keys 1–9) or check a tuned control, get right/wrong + why, then continue.
 * A miss shows a hint; two misses offer the answer; Skip moves on. VizFrame holds Next/Play until `done`. */
export function YourTurn({ turn, stepper, done, onDone }: { turn: Turn; stepper: Stepper; done: boolean; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [shown, setShown] = useState(false);
  // tune: the status at the last Check (its result is stale once the controls move), and misses so far
  const [checked, setChecked] = useState<string | null>(null);
  const [tuneMisses, setTuneMisses] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const qid = useId();
  const choice = turn.kind === 'choice' ? turn : null;
  const misses = choice ? missCount(choice, picked) : tuneMisses;
  const gates = turn.kind === 'choice' || turn.at !== undefined;
  const last = picked.at(-1);

  const pick = (id: string) => {
    if (!choice || done) return;
    const p = pickOption(choice, picked, id);
    if (p.length === picked.length) return;
    setPicked(p);
    if (id === choice.answer) onDone();
  };
  const check = () => {
    if (turn.kind !== 'tune') return;
    turn.onCheck?.();
    setChecked(turn.status);
    if (turn.hit) onDone();
    else setTuneMisses((m) => m + 1);
  };
  const showAnswer = () => {
    setShown(true);
    if (turn.kind === 'tune') turn.onShowAnswer?.();
    onDone();
  };
  // keep keyboard focus inside the card when the clicked button unmounts
  const keepFocus = (e: React.MouseEvent<HTMLElement>) => (e.currentTarget.closest('figure') as HTMLElement | null)?.focus();

  // keys 1–9 pick an option while focus is anywhere inside this card (not in a field)
  useEffect(() => {
    const fig = ref.current?.closest('figure');
    if (!fig || !choice) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
      const o = choice.options[Number(e.key) - 1];
      if (!o) return;
      e.preventDefault();
      pick(o.id);
    };
    fig.addEventListener('keydown', onKey);
    return () => fig.removeEventListener('keydown', onKey);
  });

  let feedback: ReactNode = null;
  if (choice) {
    if (done && picked.includes(choice.answer))
      feedback = (
        <p className="right">
          <strong>{misses ? 'Got it.' : 'Right.'}</strong> {choice.why}
        </p>
      );
    else if (done)
      feedback = (
        <p className="right">
          <strong>Here it is.</strong> {checkChoice(choice, '').feedback}
        </p>
      );
    else if (last)
      feedback = (
        <p className="wrong">
          <strong>Not quite.</strong> {missFeedback(choice, last)}
        </p>
      );
  } else if (turn.kind === 'tune') {
    const r = checked === turn.status || (done && shown) ? checkTune(turn) : null;
    feedback = (
      <>
        {r && (
          <p className={r.correct ? 'right' : 'wrong'}>
            <strong>{r.correct ? (shown ? 'Here it is.' : 'Right.') : 'Not quite.'}</strong> {r.feedback}
          </p>
        )}
        {!done && misses > 0 && turn.hint && <p className="viz-turn-hint">{turn.hint}</p>}
      </>
    );
  }

  return (
    <div className="viz-turn" role="group" aria-labelledby={qid} ref={ref}>
      <div className="viz-turn-head">
        <span className="viz-turn-label">Your turn</span>
        <span className="viz-turn-q" id={qid}>
          {turn.question}
        </span>
      </div>
      {choice ? (
        <div className="viz-turn-opts">
          {choice.options.map((o, j) => {
            const mine = picked.includes(o.id);
            const look = mine ? (o.id === choice.answer ? 'right' : 'wrong') : done ? (o.id === choice.answer ? 'right' : 'dim') : '';
            return (
              <button
                key={o.id}
                type="button"
                className={`chip viz-turn-opt ${look}`}
                aria-pressed={mine}
                aria-disabled={done || mine}
                onClick={() => pick(o.id)}
              >
                {look === 'right' && <Check size={14} aria-hidden />}
                {look === 'wrong' && <X size={14} aria-hidden />}
                {j < 9 && <kbd aria-hidden>{j + 1}</kbd>}
                {o.label}
              </button>
            );
          })}
        </div>
      ) : (
        turn.kind === 'tune' && (
          <div className="viz-turn-opts">
            <span className="viz-turn-status">Now: {turn.status}</span>
            <button type="button" className="chip viz-turn-opt" onClick={check}>
              {turn.checkLabel ?? 'Check'}
            </button>
          </div>
        )
      )}
      <div className="viz-turn-feedback" aria-live="polite">
        {feedback}
      </div>
      {gates && (
        <div className="viz-turn-actions">
          {done ? (
            ((turn.kind === 'choice' && turn.onContinue) || stepper.i < stepper.total - 1) && (
              <button
                type="button"
                className="link-btn"
                onClick={(e) => {
                  keepFocus(e);
                  if (turn.kind === 'choice' && turn.onContinue) turn.onContinue();
                  else stepper.next();
                }}
              >
                {(turn.kind === 'choice' && turn.continueLabel) || 'Continue →'}
              </button>
            )
          ) : (
            <>
              {canShowAnswer(misses, done) && (choice || (turn.kind === 'tune' && turn.onShowAnswer)) && (
                <button type="button" className="btn btn-sm" onClick={showAnswer}>
                  Show me the answer
                </button>
              )}
              {stepper.i < stepper.total - 1 && <span className="viz-turn-note">Next is held until you answer</span>}
              {stepper.i < stepper.total - 1 && (
                <button
                  type="button"
                  className="link-btn viz-turn-skip"
                  onClick={(e) => {
                    keepFocus(e);
                    onDone();
                    stepper.next();
                  }}
                >
                  Skip
                </button>
              )}
              {misses > 0 && (
                <span className="viz-turn-note">
                  {misses} miss{misses > 1 ? 'es' : ''}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Labelled range input for simulation parameters. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="viz-slider">
      <span className="viz-slider-label">
        {label}: <strong>{format(value)}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Segmented choice control. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="viz-choice" role="group" aria-label={label}>
      <span className="viz-choice-label">{label}:</span>
      {options.map((o) => (
        <button key={o.value} type="button" className={`chip ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export { rng } from './widgets/_shared/rng.ts';

/** Run a pure simulation, re-running only when the (JSON-serialisable) params change. */
export function useSimulation<P, F extends BaseFrame>(simulate: (p: P) => F[], params: P): F[] {
  const key = JSON.stringify(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => simulate(params), [key]);
}
