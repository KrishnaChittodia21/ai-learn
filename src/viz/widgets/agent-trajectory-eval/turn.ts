import type { ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame, Params } from './sim.ts';

/** Predict the grader's verdict, asked on the final-state check, revealed by the verdict frame. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const last = frames[frames.length - 1];
  const grader = params.mode === 'outcome' ? 'outcome-only' : 'trajectory';
  return {
    kind: 'choice',
    at: frames.length - 2,
    question: `You've seen the whole run. Will the ${grader} grader pass it?`,
    options: [
      { id: 'pass', label: 'Pass' },
      { id: 'fail', label: 'Fail' },
    ],
    answer: last.verdict,
    why: last.reasons.length
      ? `It fails on: ${last.reasons.join(', ')}.`
      : params.mode === 'outcome'
        ? 'An outcome-only grader looks at the final state alone, and that state is correct.'
        : 'Right tools, right args, no unsafe calls, and the final state checks out.',
  };
}
