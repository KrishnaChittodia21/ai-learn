import type { TuneTurn } from '../_shared/yourTurn.ts';
import { run, totals, type Params } from './sim.ts';

/** every value the threshold slider can take (0.80…0.98, step 0.01) */
export const THRESHOLDS = Array.from({ length: 19 }, (_, k) => Math.round((0.8 + k * 0.01) * 100) / 100);

/** the largest saving any slider setting reaches with zero false hits */
export function bestSafeSaving(stream: Params['stream']): number {
  return Math.max(...THRESHOLDS.map((t) => totals(run(stream, t))).filter((x) => x.falseHits === 0).map((x) => x.saved));
}

/** Tune the threshold slider: the most savings with zero false hits, checked against the sim at the current params. */
export function buildTurn(params: Params): TuneTurn {
  const T = totals(run(params.stream, params.threshold));
  return {
    kind: 'tune',
    question: 'Move the similarity threshold to save the most money while serving zero wrong answers (false hits).',
    hit: T.falseHits === 0 && T.saved >= bestSafeSaving(params.stream) - 1e-9,
    status: `threshold ${params.threshold.toFixed(2)}: ${T.hits} hits, ${T.falseHits} false, $${T.saved.toFixed(3)} saved`,
    why: 'Lower and a look-alike question gets a wrong cached answer; higher and real paraphrases miss the cache.',
  };
}
