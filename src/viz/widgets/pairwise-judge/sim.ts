// Pure, deterministic pairwise LLM judge with order swap (no React, Node-testable).
// Two prompt versions (A = v12, B = v13, as in the LLM-as-a-Judge lesson) answer the same 8 inputs. The judge sees
// both answers in one order and picks the better one or "tie". Its position bias adds a bonus to whichever answer is
// shown FIRST. Each item is judged twice: (A, B) then swapped (B, A). A win counts only if both orders agree;
// otherwise it is a tie (the lesson's rule). The naive run uses only the (A, B) order.
// Win rate of B = (B wins + 0.5 × ties) / items.
import type { BaseFrame } from '../../core';
import type { FrameTurn as Turn } from '../_shared/yourTurn.ts';

export type Verdict = 'A' | 'B' | 'tie';

export interface Params {
  /** points of advantage the judge gives the answer shown first */
  bias: number;
}

export const DEFAULT_PARAMS: Params = { bias: 0.5 };
export const MIN_BIAS = 0;
export const MAX_BIAS = 3;
/** |perceived advantage| at or below this → the judge says tie */
export const TIE_BAND = 0.5;

export interface Item {
  input: string;
  /** true quality of B minus A (positive: B is really better) */
  gap: number;
}

export const ITEMS: Item[] = [
  { input: 'Refund for a late order', gap: 2.5 },
  { input: 'Reset 2FA on a new phone', gap: -1.5 },
  { input: 'Explain the invoice line', gap: 0.75 },
  { input: 'Cancel within trial', gap: -0.75 },
  { input: 'Change delivery address', gap: 1.25 },
  { input: 'Export data as CSV', gap: 0 },
  { input: 'Dispute a duplicate charge', gap: -2.5 },
  { input: 'Upgrade plan mid-cycle', gap: 1.75 },
];

/** Judge one order: `first` is shown first and gets the bias bonus. */
export function judge(gap: number, first: 'A' | 'B', bias: number): Verdict {
  const qFirst = first === 'B' ? gap : -gap; // quality of first minus second
  const adv = qFirst + bias;
  if (adv > TIE_BAND) return first;
  if (adv < -TIE_BAND) return first === 'A' ? 'B' : 'A';
  return 'tie';
}

/** Lesson rule: a win counts only if both orders agree; otherwise it is a tie. */
export const combine = (v1: Verdict, v2: Verdict): Verdict => (v1 === v2 ? v1 : 'tie');

export interface Row {
  input: string;
  gap: number;
  v1: Verdict | null;
  v2: Verdict | null;
  final: Verdict | null;
}

export interface Tally {
  A: number;
  B: number;
  tie: number;
}

export type Stage = 'intro' | 'first' | 'swap' | 'record' | 'naive' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** item being judged, -1 when none */
  item: number;
  /** order shown to the judge on this frame */
  order: 'AB' | 'BA' | null;
  rows: Row[];
  naive: Tally;
  consistent: Tally;
  /** pairs whose verdict changed when the order was swapped */
  flips: number;
  judgeCalls: number;
  yourTurn?: Turn;
}

const tally = (vs: (Verdict | null)[]): Tally => ({
  A: vs.filter((v) => v === 'A').length,
  B: vs.filter((v) => v === 'B').length,
  tie: vs.filter((v) => v === 'tie').length,
});
export const winRateB = (t: Tally) => {
  const n = t.A + t.B + t.tie;
  return n ? (t.B + 0.5 * t.tie) / n : 0.5;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const name = (v: Verdict) => (v === 'tie' ? 'tie' : `${v} wins`);

export function simulate(params: Params): Frame[] {
  const bias = Math.max(MIN_BIAS, Math.min(MAX_BIAS, params.bias));
  const rows: Row[] = ITEMS.map((it) => ({ input: it.input, gap: it.gap, v1: null, v2: null, final: null }));
  const frames: Frame[] = [];
  let judgeCalls = 0;
  const push = (f: Pick<Frame, 'stage' | 'caption' | 'item' | 'order'> & { yourTurn?: Turn }) =>
    frames.push({
      ...f,
      rows: rows.map((r) => ({ ...r })),
      naive: tally(rows.map((r) => r.v1)),
      consistent: tally(rows.map((r) => r.final)),
      flips: rows.filter((r) => r.final !== null && r.v1 !== r.v2).length,
      judgeCalls,
    });

  // Your turn goes on the first pair that flips (the interesting case), else the first pair
  const flipAt = ITEMS.findIndex((it) => judge(it.gap, 'A', bias) !== judge(it.gap, 'B', bias));
  const turnAt = flipAt >= 0 ? flipAt : 0;

  push({
    stage: 'intro',
    item: -1,
    order: null,
    caption: `Prompt v12 (A) vs v13 (B) on ${ITEMS.length} support questions. The judge picks the better answer or "tie", but it gives the answer shown first a bonus of ${bias} point${bias === 1 ? '' : 's'} (position bias). Each pair is judged in both orders.`,
  });

  ITEMS.forEach((it, k) => {
    const r = rows[k];
    r.v1 = judge(it.gap, 'A', bias);
    judgeCalls++;
    push({
      stage: 'first',
      item: k,
      order: 'AB',
      caption: `"${it.input}", order (A, B): A is shown first. Verdict: ${name(r.v1)}.`,
    });
    r.v2 = judge(it.gap, 'B', bias);
    judgeCalls++;
    const fin = combine(r.v1, r.v2);
    const flipped = r.v1 !== r.v2;
    if (k === turnAt) {
      push({
        stage: 'swap',
        item: k,
        order: 'BA',
        caption: `Swapped, order (B, A): now B is shown first. Verdict: ${name(r.v2)}${flipped ? ', which differs from the first order' : ', the same as the first order'}.`,
        yourTurn: {
          question: `Order (A, B) said ${name(r.v1)}; order (B, A) says ${name(r.v2)}. What goes in the tally?`,
          options: (['A', 'B', 'tie'] as Verdict[]).map((v) => ({
            text: name(v).replace(/^./, (c) => c.toUpperCase()),
            correct: v === fin,
            why:
              v === fin
                ? flipped
                  ? 'The orders disagree, so the verdict depends on position, not quality: record a tie.'
                  : 'Both orders agree, so the win is not an artefact of position: record it.'
                : flipped
                  ? 'A win counts only if both orders agree; this one changed with the order.'
                  : 'Both orders gave the same verdict, so that verdict is what counts.',
          })),
        },
      });
      r.final = fin;
      push({
        stage: 'record',
        item: k,
        order: 'BA',
        caption: `Recorded for "${it.input}": ${name(fin)}.${flipped ? ' A flip between orders is position bias, not a preference.' : ' Both orders agreed, so the verdict stands.'}`,
      });
    } else {
      r.final = fin;
      push({
        stage: 'swap',
        item: k,
        order: 'BA',
        caption: `Swapped, order (B, A): verdict ${name(r.v2)}. ${flipped ? `The verdict flipped, so it is recorded as a tie.` : `Both orders agree: ${name(fin)}.`}`,
      });
    }
  });

  const last = frames[frames.length - 1];
  const nv = last.naive;
  const cs = last.consistent;
  push({
    stage: 'naive',
    item: -1,
    order: null,
    caption: `A naive single-order run (A always first) would report A ${nv.A}, B ${nv.B}, ties ${nv.tie}: B's win rate ${pct(winRateB(nv))}. With the swap and only consistent verdicts: A ${cs.A}, B ${cs.B}, ties ${cs.tie}.`,
  });
  push({
    stage: 'recap',
    item: -1,
    order: null,
    caption: `${last.flips} of ${ITEMS.length} pairs flipped with the order (${pct(last.flips / ITEMS.length)}). B's win rate = (${cs.B} + 0.5 × ${cs.tie}) / ${ITEMS.length} = ${pct(winRateB(cs))}, for ${judgeCalls} judge calls (2 per pair). ${bias === 0 ? 'With no position bias, nothing flips.' : 'Raise or lower the bias and watch ties grow or shrink.'}`,
  });
  return frames;
}
