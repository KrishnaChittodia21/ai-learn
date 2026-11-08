import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { DOCS, METRICS, QUERIES, rank, type Frame, type Params } from './sim.ts';

const short = (t: string) => (t.length > 26 ? t.slice(0, 25) + '…' : t);

/** On the query frame (before any score): which document ranks #1 under the chosen metric? */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const q = QUERIES[params.query].v;
  const r = rank(params.metric, q, params.normalise);
  // the #1 under every metric and normalisation, plus the runner-up: the plausible picks
  const pool = [...new Set([r[0], ...METRICS.flatMap((m) => [rank(m, q, false)[0], rank(m, q, true)[0]]), r[1]])].slice(0, 4);
  const lengthy = !params.normalise && params.metric !== 'cosine';
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'query'),
    question: `Using ${params.metric}${params.normalise ? ' on unit vectors' : ''}, which document ranks #1 for "${QUERIES[params.query].text}"?`,
    options: pool.sort().map((id) => ({ id, label: `${id} · ${short(DOCS.find((d) => d.id === id)!.text)}` })),
    answer: r[0],
    why: lengthy
      ? params.metric === 'dot'
        ? `${r[0]} wins: dot product grows with vector length, so long documents get a boost.`
        : `${r[0]} wins: euclidean distance punishes vectors whose length differs from the query's.`
      : `${r[0]} wins: its direction is closest to the query's, and length is ignored.`,
  };
}
