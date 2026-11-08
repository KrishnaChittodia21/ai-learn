import { nearby, optionsOf, type ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame } from './sim.ts';

/** Predict the chain's total LLM calls, asked on the input frame, read off the last frame. */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const last = frames[frames.length - 1];
  const n = last.llmCalls;
  return {
    kind: 'choice',
    at: 0,
    question: 'Extract and write are LLM calls; the gate is code. How many LLM calls will this item cost in total?',
    options: optionsOf(nearby(n, [-1, 1, 2]).filter((v) => v > 0), n),
    answer: String(n),
    why:
      last.outcome === 'human'
        ? `Two extract attempts both fail the gate, so the item goes to a human and the write step never runs: ${n} calls.`
        : `${last.attempt} extract attempt${last.attempt === 1 ? '' : 's'} + 1 write = ${n} calls; the gate itself costs no tokens.`,
  };
}
