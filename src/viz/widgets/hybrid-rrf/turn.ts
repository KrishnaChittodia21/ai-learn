import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { SCENARIOS, rankOf, type Frame, type Params } from './sim.ts';

/** Predict the fused #1, asked once both lists are shown, revealed by the "fused" frame. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const s = SCENARIOS[params.query];
  const top = frames.find((f) => f.stage === 'fused')!.fused![0];
  const ids = [...new Set([s.bm25[0].id, s.dense[0].id, s.consensus, top])].sort();
  const where = (id: string) => [rankOf(s.bm25, id) && `BM25 #${rankOf(s.bm25, id)}`, rankOf(s.dense, id) && `dense #${rankOf(s.dense, id)}`].filter(Boolean).join(', ');
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'dense'),
    question: `With k = ${params.k}, which document is #1 after Reciprocal Rank Fusion?`,
    options: ids.map((id) => ({ id, label: `${id} (${where(id)})` })),
    answer: top,
    why:
      top === s.consensus
        ? `Being decent in both lists beats being #1 in one: with k = ${params.k} the 1/(k + rank) curve is flat, so agreement wins.`
        : `With k = ${params.k} the 1/(k + rank) curve is steep, so a single #1 outweighs ${s.consensus}'s two mid ranks.`,
  };
}
