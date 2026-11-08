import type { TuneTurn } from '../_shared/yourTurn.ts';
import { K, outcome, type Params } from './sim.ts';

/** Smallest nprobe that reaches the best recall this setup can get (K/K unless PQ without re-rank caps it). */
export function minNprobe(params: Params): { nprobe: number; recall: number } {
  const best = outcome({ ...params, nprobe: params.nlist }).recall;
  for (let n = 1; n <= params.nlist; n++) if (outcome({ ...params, nprobe: n }).recall === best) return { nprobe: n, recall: best };
  return { nprobe: params.nlist, recall: best };
}

/** Tune nprobe: find the fewest lists to scan that still reach the best recall. Computed by the sim's own outcome(). */
export function buildTurn(params: Params): TuneTurn {
  const o = outcome(params);
  const goal = minNprobe(params);
  return {
    kind: 'tune',
    question: `Move nprobe to the smallest value that still gets recall ${goal.recall}/${K} for this query.`,
    hit: params.nprobe === goal.nprobe,
    status: `nprobe ${params.nprobe} of ${params.nlist} · recall ${o.recall}/${K} · ${o.measured} distances`,
    why:
      goal.recall < K
        ? `PQ without re-rank caps recall at ${goal.recall}/${K} here; turn re-rank on to win the rest back.`
        : `Fewer lists miss a neighbour just across a cell border; more lists only add distance computations.`,
  };
}
