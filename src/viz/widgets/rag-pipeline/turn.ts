import type { TuneTurn } from '../_shared/yourTurn.ts';
import { BUDGETS, CORRECT, type Frame, type Params } from './sim.ts';

/** Tune top-k / rerank so the answer is correct even at the smallest context budget; judged by the sim's last frame. */
export function buildTurn(frames: Frame[], params: Params): TuneTurn {
  const last = frames[frames.length - 1];
  const smallest = Math.min(...BUDGETS);
  const where = last.inPrompt.includes(CORRECT) ? 'in prompt' : last.dropped.includes(CORRECT) ? 'dropped (overflow)' : 'not retrieved';
  return {
    kind: 'tune',
    question: `Set the budget to ${smallest} tokens, then change top-k and rerank until the model answers correctly (45 days).`,
    hit: !!last.correct && params.budget === smallest,
    status: `budget ${params.budget} · ${CORRECT} ${where} · answer ${last.correct ? 'correct' : 'wrong'}`,
    why: `With little room, rank order decides what fits: the reranker puts ${CORRECT} first, so it is packed before the cut.`,
  };
}
