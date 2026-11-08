import type { ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame, Params } from './sim.ts';

/** Predict which stop condition ends the loop, asked on the intro frame, read off the last frame's outcome. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const last = frames[frames.length - 1];
  const why: Record<string, string> = {
    answered: `The model writes "Final Answer:" on call ${last.calls}, within the step limit, so the success condition fires first.`,
    'max-steps': `The task needs more model calls than the limit of ${params.maxSteps} allows, so the step limit stops it before any Final Answer.`,
    repeat: 'The second search is identical to the first, so the repeated-action check stops the loop early instead of spending the remaining steps.',
  };
  return {
    kind: 'choice',
    at: 0,
    question: `Step limit ${params.maxSteps}. Which stop condition will end this run?`,
    options: [
      { id: 'answered', label: 'Final Answer written' },
      { id: 'max-steps', label: 'Step limit reached' },
      { id: 'repeat', label: 'Same action repeated' },
    ],
    answer: last.outcome,
    why: why[last.outcome] ?? '',
  };
}
