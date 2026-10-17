// Shared building blocks for interactive, step-by-step visualisations.
// Pattern: a pure `simulate(params) => Frame[]` produces every state up front, so stepping
// backwards, resetting and changing parameters are trivial and deterministic. Components
// only render the current frame.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';

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

/** Steps through precomputed frames with play/pause/speed. */
export function useFrames<F extends BaseFrame>(frames: F[]) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const last = frames.length - 1;

  // new simulation (params changed) → start over
  useEffect(() => {
    setI(0);
    setPlaying(false);
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
}: {
  title: string;
  blurb?: string;
  stepper: Stepper;
  /** parameter sliders/toggles */
  controls?: ReactNode;
  /** the SVG drawing */
  children: ReactNode;
  legend?: ReactNode;
}) {
  const { frame, i, total, playing, speed } = stepper;
  const [revealed, setRevealed] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => setRevealed(false), [i]);

  // keyboard: ←/→ step, space play/pause (only when focus is inside this card)
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') stepper.next();
    else if (e.key === 'ArrowLeft') stepper.prev();
    else if (e.key === ' ') {
      e.preventDefault();
      if (playing) stepper.pause();
      else stepper.play();
    } else return;
    e.stopPropagation();
  };
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
            <button type="button" className="viz-btn viz-btn-play" onClick={stepper.play} aria-label="Play" title="Play (space)">
              <Play size={14} fill="currentColor" aria-hidden />
            </button>
          )}
          <button type="button" className="viz-btn" onClick={stepper.next} disabled={i === total - 1} aria-label="Next step" title="Next step (→)">
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
      {frame.predict && (
        <div className="viz-predict">
          <span className="viz-predict-label">Predict</span>
          <span className="viz-predict-text">
            {frame.predict}{' '}
            {!revealed ? (
              <button type="button" className="link-btn" onClick={() => setRevealed(true)}>
                Think, then reveal →
              </button>
            ) : i < total - 1 ? (
              <button type="button" className="link-btn" onClick={stepper.next}>
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

/** Deterministic PRNG (mulberry32) so simulations replay identically. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run a pure simulation, re-running only when the (JSON-serialisable) params change. */
export function useSimulation<P, F extends BaseFrame>(simulate: (p: P) => F[], params: P): F[] {
  const key = JSON.stringify(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => simulate(params), [key]);
}
