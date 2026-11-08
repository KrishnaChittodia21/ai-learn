import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { REQUESTS, SPOKES, type Frame, type Params } from './sim.ts';

/** Predict who answers the user, asked at the input policy check, revealed by the first response frame. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const served = frames.find((f) => f.response)!.servedBy;
  const spoke = SPOKES[REQUESTS[params.type].spoke].label;
  const answer = served === 'hub' ? 'hub' : served === 'fallback' ? 'fallback' : 'spoke';
  const why: Record<string, string> = {
    hub: params.failure && params.type === 'unsafe'
      ? 'The guardrail is down, so the hub fails closed and rejects: unchecked input never reaches a spoke.'
      : 'The input policy check blocks it in the hub before routing, so no spoke ever sees it.',
    fallback: `${spoke} times out, so the hub serves a marked, degraded fallback instead of an error.`,
    spoke: `It passes policy, the router picks ${spoke}, and its answer goes back through the output check.`,
  };
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'policy-in'),
    question: 'Who ends up answering this request?',
    options: [
      { id: 'spoke', label: spoke },
      { id: 'fallback', label: 'A degraded fallback' },
      { id: 'hub', label: 'The hub rejects it' },
    ],
    answer,
    why: why[answer],
  };
}
