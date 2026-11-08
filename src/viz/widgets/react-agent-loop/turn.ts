import { frameWhere, nearby, type ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame, Params } from './sim.ts';

/** Predict how the loop ends (answer after N calls, or the guard), asked on the prompt frame, read off the last frame. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const last = frames[frames.length - 1];
  const stopped = last.outcome === 'stopped';
  // candidate call counts the learner might expect, all within the guard
  const counts = (stopped ? [params.maxSteps - 1, params.maxSteps] : [last.iteration, ...nearby(last.iteration, [-1, 1])]).filter((n) => n >= 1 && n <= params.maxSteps);
  const options = [...new Set(counts)].sort((a, b) => a - b).map((n) => ({ id: String(n), label: `Answers after ${n} LLM call${n === 1 ? '' : 's'}` }));
  options.push({ id: 'guard', label: `Stopped by the ${params.maxSteps}-step guard` });
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'prompt'),
    question: `With max steps = ${params.maxSteps}, how does this run end?`,
    options,
    answer: stopped ? 'guard' : String(last.iteration),
    why: stopped
      ? `It reaches ${params.maxSteps} LLM calls without a final answer, so the guard stops it. Every tool call (including a failed one) costs an LLM call to decide on.`
      : `One LLM call per Thought/Action (failed tool calls included) plus one for the final answer: ${last.iteration} calls, within the ${params.maxSteps}-step limit.`,
  };
}
