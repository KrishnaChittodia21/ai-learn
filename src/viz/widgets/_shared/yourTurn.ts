// "Your turn" steps (M8): the learner predicts or tunes something, gets right/wrong + why, then continues.
// Pure (no JSX) so tests/viz-your-turn.test.ts can check answers against each widget's sim.
// Every widget builds its turn from its own sim frames (see <widget>/turn.ts), never from hard-coded answers.

export interface TurnOption {
  id: string;
  label: string;
  /** feedback when this (wrong) option is picked */
  why?: string;
}

/** Predict: shown on frame `at`, before the frame that reveals the answer. */
export interface ChoiceTurn {
  kind: 'choice';
  /** frame index where the question appears */
  at: number;
  question: string;
  options: TurnOption[];
  /** id of the correct option */
  answer: string;
  /** why the answer is right (shown once answered) */
  why: string;
  /** shown after a miss */
  hint?: string;
  /** state key: a new id asks again (default: at|question|answer) */
  id?: string;
  /** Continue action once answered (default: next step) */
  onContinue?: () => void;
  continueLabel?: string;
}

/** Tune: the learner moves the widget's own control until `hit` (computed from the sim at the current params). */
export interface TuneTurn {
  kind: 'tune';
  question: string;
  /** does the current setting meet the goal? */
  hit: boolean;
  /** live readout of the current setting, e.g. "recall 2/3 · 14 hops" */
  status: string;
  why: string;
  /** show only on this frame, and hold Next/Play there until hit (default: every frame, never held) */
  at?: number;
  hint?: string;
  id?: string;
  checkLabel?: string;
  /** side effect of pressing Check (e.g. draw samples) */
  onCheck?: () => void;
  /** offered after two misses: set the controls to a passing setting */
  onShowAnswer?: () => void;
}

export type Turn = ChoiceTurn | TuneTurn;

export interface TurnResult {
  correct: boolean;
  feedback: string;
}

export function checkChoice(turn: ChoiceTurn, picked: string): TurnResult {
  const correct = picked === turn.answer;
  const right = turn.options.find((o) => o.id === turn.answer)?.label ?? turn.answer;
  return { correct, feedback: correct ? turn.why : `The answer is ${right}. ${turn.why}` };
}

export function checkTune(turn: TuneTurn): TurnResult {
  return { correct: turn.hit, feedback: turn.hit ? `${turn.status}. ${turn.why}` : `${turn.status}: keep adjusting and check again.` };
}

/** First frame index matching `pred`, or -1. */
export function frameWhere<F>(frames: F[], pred: (f: F, i: number) => boolean): number {
  return frames.findIndex(pred);
}

/** Options from candidate values: de-duplicated, the correct one always included, numbers sorted ascending. */
export function optionsOf(values: (string | number)[], correct: string | number, label: (v: string | number) => string = String): TurnOption[] {
  const all = [...new Set([...values, correct].map(String))];
  if (typeof correct === 'number') all.sort((a, b) => Number(a) - Number(b));
  return all.map((v) => ({ id: v, label: label(typeof correct === 'number' ? Number(v) : v) }));
}

/** Two to three plausible numeric distractors around `n` (never negative). */
export function nearby(n: number, deltas: number[] = [-2, -1, 1, 2]): number[] {
  return deltas.map((d) => n + d).filter((v) => v >= 0 && v !== n);
}

/** A turn carried on a sim frame, with per-option correctness and why (mcp-handshake, supervisor-handoff, context-budget, pairwise-judge). */
export interface FrameTurn {
  question: string;
  options: { text: string; correct: boolean; why: string }[];
}

export function fromFrameTurn(t: FrameTurn, at: number): ChoiceTurn {
  const k = t.options.findIndex((o) => o.correct);
  return {
    kind: 'choice',
    at,
    question: t.question,
    options: t.options.map((o, j) => ({ id: String(j), label: o.text, why: o.why })),
    answer: String(k),
    why: t.options[k]?.why ?? '',
  };
}

// --- gating and miss counting (used by core.tsx YourTurn / VizFrame) ---

/** after this many misses, "Show me the answer" is offered */
export const MISSES_FOR_ANSWER = 2;

export function turnKey(t: Turn): string {
  return t.id ?? (t.kind === 'choice' ? `${t.at}|${t.question}|${t.answer}` : `${t.at ?? ''}|${t.question}`);
}

export function turnShownAt(t: Turn | undefined, i: number): t is Turn {
  return !!t && (t.at === undefined ? t.kind === 'tune' : t.at === i);
}

/** Next/Play/→ are held on an unanswered choice turn, or a tune turn pinned to a frame. The scrubber is never held. */
export function isHeld(t: Turn | undefined, i: number, done: readonly string[]): boolean {
  return turnShownAt(t, i) && (t.kind === 'choice' || t.at !== undefined) && !done.includes(turnKey(t));
}

/** Picks so far, in order. Repeats, unknown ids and picks after the answer are ignored. */
export function pickOption(t: ChoiceTurn, picked: readonly string[], id: string): string[] {
  if (picked.includes(t.answer) || picked.includes(id) || !t.options.some((o) => o.id === id)) return [...picked];
  return [...picked, id];
}

export function missCount(t: ChoiceTurn, picked: readonly string[]): number {
  return picked.filter((id) => id !== t.answer).length;
}

export function canShowAnswer(misses: number, done: boolean): boolean {
  return !done && misses >= MISSES_FOR_ANSWER;
}

/** What to say after a miss: the picked option's why and/or the turn's hint. */
export function missFeedback(t: ChoiceTurn, picked: string): string {
  return [t.options.find((o) => o.id === picked)?.why, t.hint].filter(Boolean).join(' ') || 'Try another option.';
}
