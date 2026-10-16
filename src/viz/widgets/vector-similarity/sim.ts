// Pure, deterministic 2-D embedding space (no React, Node-testable).
// Real embeddings have 384–3072 dimensions; 2-D keeps the geometry visible. Vector LENGTH here stands in
// for things like document length / term mass that some (unnormalised) models leak into the norm.
//   dot(a, b)       = Σ aᵢbᵢ                     (higher = more similar; grows with length)
//   cosine(a, b)    = dot / (|a|·|b|)            (angle only, in [-1, 1])
//   euclidean(a, b) = √Σ (aᵢ − bᵢ)²              (lower = more similar; sensitive to length)
// After L2-normalisation |a| = |b| = 1, so dot = cosine and euclidean² = 2 − 2·cosine: all three rank identically.
import type { BaseFrame } from '../../core';

export type Metric = 'cosine' | 'dot' | 'euclidean';
export type QueryId = 'password' | 'pizza' | 'security';

export interface Params {
  query: QueryId;
  metric: Metric;
  normalise: boolean;
}

export const DEFAULT_PARAMS: Params = { query: 'password', metric: 'dot', normalise: false };

export interface Doc {
  id: string;
  text: string;
  v: [number, number];
}

export const DOCS: Doc[] = [
  { id: 'A', text: 'How do I reset my password?', v: [2.6, 0.7] },
  { id: 'B', text: 'Forgot login', v: [1.0, 0.3] },
  { id: 'C', text: 'Admin handbook: password policy, SSO, audits… (40 pages)', v: [5.0, 2.4] },
  { id: 'D', text: 'Best pizza in Naples', v: [0.5, 2.4] },
  { id: 'E', text: 'Complete guide to Neapolitan pizza dough (long)', v: [1.6, 5.2] },
  { id: 'F', text: 'Turn on two-factor authentication', v: [2.0, 1.9] },
  { id: 'G', text: 'Weather in Rome today', v: [-1.4, 1.5] },
];

export const QUERIES: Record<QueryId, { text: string; v: [number, number] }> = {
  password: { text: 'reset password', v: [2.2, 0.55] },
  pizza: { text: 'pizza recipe', v: [0.75, 2.3] },
  security: { text: 'secure my account', v: [1.7, 1.45] },
};

export const METRICS: Metric[] = ['cosine', 'dot', 'euclidean'];

export const norm = (a: number[]) => Math.hypot(a[0], a[1]);
export const unit = (a: [number, number]): [number, number] => [a[0] / norm(a), a[1] / norm(a)];
export const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
export const cosine = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b));
export const euclid = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function score(m: Metric, q: number[], d: number[]) {
  return m === 'cosine' ? cosine(q, d) : m === 'dot' ? dot(q, d) : euclid(q, d);
}
/** higher-is-better for cosine/dot, lower-is-better for euclidean */
export function rank(m: Metric, q: [number, number], normalise: boolean): string[] {
  const qv = normalise ? unit(q) : q;
  const s = DOCS.map((d) => ({ id: d.id, s: score(m, qv, normalise ? unit(d.v) : d.v) }));
  s.sort((a, b) => (m === 'euclidean' ? a.s - b.s : b.s - a.s) || a.id.localeCompare(b.id));
  return s.map((x) => x.id);
}

export type Stage = 'intro' | 'query' | 'score' | 'rank' | 'compare' | 'flip' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** whether vectors are drawn L2-normalised in this frame */
  unitView: boolean;
  /** scores computed so far for the chosen metric (null = not yet) */
  scores: (number | null)[];
  current: number | null;
  ranking: string[] | null;
  /** rankings under every metric (stage compare/flip) for the current view */
  table: Record<Metric, string[]> | null;
}

const f2 = (x: number) => x.toFixed(2);
const vs = (v: number[]) => `(${f2(v[0])}, ${f2(v[1])})`;
/** wrap negatives in parentheses inside products: 2.20×(-1.40) */
const pf = (x: number) => (x < 0 ? `(${f2(x)})` : f2(x));
const better = (m: Metric) => (m === 'euclidean' ? 'smallest distance' : 'highest score');

export function simulate({ query, metric, normalise }: Params): Frame[] {
  const Q = QUERIES[query];
  const qv = normalise ? unit(Q.v) : Q.v;
  const dv = DOCS.map((d) => (normalise ? unit(d.v) : d.v));
  const frames: Frame[] = [];
  const base = { unitView: normalise, scores: DOCS.map(() => null), current: null, ranking: null, table: null };
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => frames.push({ ...base, ...f } as Frame);
  const label = (id: string) => `${id} "${DOCS.find((d) => d.id === id)!.text}"`;

  push({
    stage: 'intro',
    caption: `Seven texts embedded into a toy 2-D space (real models use 384–3072 dims). Direction ≈ topic: passwords point right, pizza points up. ${normalise ? 'Normalisation is ON: every vector is scaled to length 1, so only direction remains.' : 'Normalisation is OFF: long documents (C, E) have long vectors.'}`,
  });
  push({
    stage: 'query',
    caption: `Query "${Q.text}" is embedded with the same model: q = ${vs(qv)}, |q| = ${f2(norm(qv))}. We rank documents by ${metric} similarity.`,
    predict: `Using ${metric}${normalise ? ' on unit vectors' : ''}, which document will rank #1 for "${Q.text}"?`,
  });
  const scores: (number | null)[] = DOCS.map(() => null);
  DOCS.forEach((d, i) => {
    const s = score(metric, qv, dv[i]);
    scores[i] = s;
    const v = dv[i];
    const detail =
      metric === 'dot'
        ? `q·${d.id} = ${pf(qv[0])}×${pf(v[0])} + ${pf(qv[1])}×${pf(v[1])} = ${f2(s)}`
        : metric === 'cosine'
          ? `cos(q, ${d.id}) = ${f2(dot(qv, v))} / (${f2(norm(qv))}×${f2(norm(v))}) = ${f2(s)}`
          : `‖q − ${d.id}‖ = √((${f2(qv[0] - v[0])})² + (${f2(qv[1] - v[1])})²) = ${f2(s)}`;
    push({ stage: 'score', scores: [...scores], current: i, caption: `${d.id} "${d.text}": ${detail}.` });
  });
  const r = rank(metric, Q.v, normalise);
  push({
    stage: 'rank',
    scores: [...scores],
    ranking: r,
    caption: `Ranking by ${better(metric)}: ${r.slice(0, 3).map((id, k) => `#${k + 1} ${id}`).join(', ')}. Top hit: ${label(r[0])}.`,
  });
  const tableNow = Object.fromEntries(METRICS.map((m) => [m, rank(m, Q.v, normalise)])) as Record<Metric, string[]>;
  const agree = METRICS.every((m) => tableNow[m].join() === tableNow.cosine.join());
  const tops = METRICS.map((m) => `${m} → ${tableNow[m][0]}`).join(', ');
  push({
    stage: 'compare',
    scores: [...scores],
    ranking: r,
    table: tableNow,
    caption: agree
      ? `Same query, all three metrics: identical ranking (${tableNow.cosine.slice(0, 4).join(' > ')}). On unit vectors dot = cosine and euclidean² = 2 − 2·cosine, so they are interchangeable.`
      : `Same query, three metrics, different answers: ${tops}. Dot product rewards long vectors (${tableNow.dot[0] === 'C' || tableNow.dot[0] === 'E' ? `${tableNow.dot[0]} is a long document` : 'magnitude adds score'}); euclidean punishes vectors whose length differs from the query's even when the angle matches.`,
    predict: normalise
      ? `What would change if we turned normalisation OFF and the long documents kept their long vectors?`
      : `If every vector is L2-normalised to length 1 first, will the three metrics still disagree?`,
  });
  const tableFlip = Object.fromEntries(METRICS.map((m) => [m, rank(m, Q.v, !normalise)])) as Record<Metric, string[]>;
  const agreeFlip = METRICS.every((m) => tableFlip[m].join() === tableFlip.cosine.join());
  push({
    stage: 'flip',
    unitView: !normalise,
    table: tableFlip,
    ranking: tableFlip[metric],
    caption: !normalise
      ? `Normalised: every vector lies on the unit circle, so only the angle counts. ${agreeFlip ? `All three metrics now agree: ${tableFlip.cosine.slice(0, 4).join(' > ')}.` : 'Rankings converge.'} Cosine never changes, because it already ignored length.`
      : `Unnormalised: long documents stretch out. ${agreeFlip ? 'Here the rankings happen to agree.' : `Now the metrics disagree: ${METRICS.map((m) => `${m} → ${tableFlip[m][0]}`).join(', ')}.`} Cosine is unchanged, because it ignores length anyway.`,
  });
  push({
    stage: 'done',
    unitView: !normalise,
    table: tableFlip,
    ranking: tableFlip[metric],
    caption: `Rule of thumb: use the metric the embedding model was trained with. Many text models (e.g. OpenAI's) return unit vectors, and others are normalised at index time; then use dot product (fastest; equals cosine). Never mix normalised and unnormalised vectors in one index.`,
  });
  return frames;
}
