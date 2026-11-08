// M9 motion presets for motion/react, mirroring the CSS tokens in src/styles/tokens.css, plus the small pure
// decisions behind the M9 motion (count-up deltas, typing pace, deck fling, once-per-session gating).
// No React or DOM imports: tests run this file directly under node.

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.77, 0, 0.175, 1],
  drawer: [0.32, 0.72, 0, 1],
} as const;

/** seconds, for motion/react (CSS uses the ms tokens of the same name) */
export const dur = { press: 0.12, fast: 0.15, base: 0.18, slow: 0.25, enter: 0.32, count: 0.7 } as const;

export const spring = {
  /** UI movement: no bounce (dock pill, perspective row) */
  ui: { type: 'spring', duration: 0.4, bounce: 0 },
  /** drag release / snap-back */
  bounce: { type: 'spring', duration: 0.45, bounce: 0.2 },
} as const;

export const stagger = 0.04;

/** The reduced-motion stand-in for any entrance: a short opacity fade. */
export const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: dur.fast, ease: 'easeOut' } } as const;

/** Full motion, or the 150 ms fade when the user asked for reduced motion. */
export function pick<T>(reduce: boolean | null | undefined, full: T): T | typeof fade {
  return reduce ? fade : full;
}

/** Count-up from the last value seen to now: no animation when nothing changed or under reduced motion. */
export function countPlan(from: number | undefined, to: number, reduce: boolean) {
  const start = from ?? to;
  return { from: start, delta: to - start, animate: !reduce && start !== to };
}

/** Typing reveal: ms per token-sized chunk, so the whole text takes at most 1.6 s. */
export function typeDelay(chunks: number): number {
  return Math.min(28, 1600 / Math.max(1, chunks));
}

/** Token-sized pieces (runs of spaces, or up to 4 non-space characters). */
export function typeChunks(text: string): string[] {
  return text.match(/\s+|[^\s]{1,4}/g) ?? [];
}

/** Loading placeholders stay invisible this long, so fast loads never flash a skeleton. */
export const SKELETON_DELAY = 200;

/**
 * True until `key` has been marked in this session store (sessionStorage in the app); blocked storage → true.
 * `mark: false` only reads (React may run a state initializer twice; mark from an effect).
 */
export function firstThisSession(key: string, store: Pick<Storage, 'getItem' | 'setItem'> | undefined, mark = true): boolean {
  try {
    if (!store) return true;
    if (store.getItem(key)) return false;
    if (mark) store.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}
