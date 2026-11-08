import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame } from './sim.ts';

/** Once every sample is in, predict the vote: which answer wins, or does the voter abstain? Revealed by the verdict frame. */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const verdictFrame = frames.find((f) => f.stage === 'verdict')!;
  const v = verdictFrame.verdict!;
  const answer = v.answer ?? 'abstain';
  const labels = verdictFrame.tally.slice(0, 3).map((t) => t.label);
  return {
    kind: 'choice',
    // the last sample frame: all answers are in, the verdict is not
    at: frameWhere(frames, (f, i) => f.stage === 'sample' && frames[i + 1]?.stage !== 'sample'),
    question: 'All samples are in. What does the voter return?',
    options: [...labels.map((l) => ({ id: l, label: l })), { id: 'abstain', label: 'Abstain (no clear winner)' }],
    answer,
    why:
      v.kind === 'majority'
        ? `${v.answer} wins with ${v.reason}: right paths converge, slips scatter.`
        : v.kind === 'single'
          ? `With one sample there is nothing to vote on: the voter returns ${v.answer} as is.`
          : `The voter abstains: ${v.reason}. A coin-flip winner would be worse than a human review.`,
  };
}
