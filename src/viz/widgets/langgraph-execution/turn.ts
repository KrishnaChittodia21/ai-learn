import { frameWhere, nearby, optionsOf, type ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame } from './sim.ts';

/** Predict how many times the agent node (one LLM call each) runs, asked at invoke(), counted from the sim's runs. */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const runs = frames[frames.length - 1].runs;
  const n = runs.filter((r) => r.node === 'agent').length;
  const errored = frames.some((f) => f.status === 'error');
  const replays = new Set(runs.map((r) => r.branch)).size > 1;
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'invoke'),
    question: 'By the end of this run, how many times will the agent node (one LLM call each) have executed?',
    options: optionsOf(nearby(n, [-1, 1, 2]), n),
    answer: String(n),
    why: errored
      ? `The router never returns END, so agent and tools alternate until recursionLimit stops the run: ${n} agent supersteps out of ${runs.length}.`
      : replays
        ? `Replaying and forking from an earlier checkpoint re-executes the nodes after it, so agent runs ${n} times in total, not just once per turn.`
        : `agent runs once per model reply (${runs.map((r) => r.node).join(' → ')}); tools and human_review make no LLM call.`,
  };
}
