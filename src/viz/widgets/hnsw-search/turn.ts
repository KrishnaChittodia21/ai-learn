import { frameWhere, optionsOf, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { K, NPTS, type Frame } from './sim.ts';

/** Predict recall@K, asked on the "result" frame, revealed by the brute-force frame. */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const brute = frames.find((f) => f.stage === 'brute')!;
  const hit = brute.found!.filter((x) => brute.truth!.includes(x)).length;
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'result'),
    question: `How many of the true ${K} nearest neighbours did HNSW return?`,
    options: optionsOf(
      Array.from({ length: K + 1 }, (_, i) => i),
      hit,
      (v) => `${v} of ${K}`,
    ),
    answer: String(hit),
    why:
      hit === K
        ? `Brute force agrees: recall@${K} = ${K}/${K}, after measuring only ${brute.ndist} of ${NPTS} vectors.`
        : `Recall@${K} = ${hit}/${K}: the beam stopped in a local region. Raise efSearch or M and try again.`,
  };
}
