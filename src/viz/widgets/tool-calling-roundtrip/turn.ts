import { optionsOf, type ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame } from './sim.ts';

/** Before request #1: how many model calls until the loop ends, or does the max-iterations guard stop it? */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const end = frames[frames.length - 1];
  const stopped = end.outcome === 'stopped';
  return {
    kind: 'choice',
    at: frames.findIndex((f) => f.stage === 'request') - 1,
    question: 'How many model calls will this task take before the loop ends?',
    options: [...optionsOf([1, 2, 3], stopped ? 1 : end.modelCalls, (n) => `${n} call${n === 1 ? '' : 's'}`), { id: 'stopped', label: 'The guard stops it first' }],
    answer: stopped ? 'stopped' : String(end.modelCalls),
    why: stopped
      ? `The cap of ${end.modelCalls} is hit while the model still wants tools, so the guard ends the loop without an answer.`
      : `Each tool round costs one model call, plus one more for the final answer: ${end.modelCalls} in total.`,
  };
}
