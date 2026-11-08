import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { LABELS, SCALED, attention, type Frame, type Params } from './sim.ts';

/** On the scaled-scores frame (before mask + softmax): which token gets the most attention weight? */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const qi = params.query;
  const w = attention(params.model).W[qi];
  const best = w.indexOf(Math.max(...w));
  // the four highest scores, masked future tokens included (they are the trap in a decoder)
  const ids = SCALED[qi]
    .map((s, j) => ({ s, j }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.j);
  if (!ids.includes(best)) ids[3] = best;
  const dec = params.model === 'decoder';
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'scale'),
    question: `After the ${dec ? 'mask and ' : ''}softmax, which token will "${LABELS[qi]}" attend to most?`,
    options: ids.sort((a, b) => a - b).map((j) => ({ id: String(j), label: LABELS[j] })),
    answer: String(best),
    why: `${LABELS[best]} gets ${(w[best] * 100).toFixed(0)}% of the weight: the highest score among the tokens "${LABELS[qi]}" may see${dec ? ' (later tokens are masked to 0)' : ''}.`,
  };
}
