// Pure, deterministic HyDE vs multi-query walkthrough (no React, Node-testable).
// Numbers are the Query Transformation lesson's own (illustrative) examples:
//   HyDE: "how long do refunds take" over 8K help-centre chunks; rank / cosine of the true policy chunk for
//         query-only (6, 0.52), HyDE passage (1, 0.83), mean(query, HyDE) (1, 0.78).
//   Multi-query: "Why is my build slow?" + 3 LLM variants; each list's rank of three tracked docs, fused with
//         Reciprocal Rank Fusion: score(d) = Σ over lists 1 / (k + rank). With k = 60 this gives the lesson's
//         0.0640 / 0.0318 / 0.0164.
import type { BaseFrame } from '../../core';

export type Mode = 'hyde' | 'multi';

export interface Params {
  mode: Mode;
  /** RRF constant k (multi-query) */
  rrfK: number;
}

export const DEFAULT_PARAMS: Params = { mode: 'hyde', rrfK: 60 };
export const K_MIN = 1;
export const K_MAX = 100;

// ---------- HyDE ----------
export const HYDE = {
  query: 'how long do refunds take',
  passage:
    'Refunds are typically processed within 5 to 10 business days after we receive the returned item. Once approved, the amount is credited to the original payment method…',
  truth: 'Refunds are processed within 5–7 business days of receipt.',
  vectors: [
    { id: 'query', label: 'Query only', rank: 6, cos: 0.52 },
    { id: 'hyde', label: 'HyDE passage', rank: 1, cos: 0.83 },
    { id: 'mean', label: 'Mean(query, HyDE)', rank: 1, cos: 0.78 },
  ],
} as const;

// ---------- multi-query ----------
export const MULTI = {
  query: 'Why is my build slow?',
  variants: ['CI pipeline performance troubleshooting', 'reduce Docker image build time cache layers', 'Gradle build speed optimisation'],
  docs: ['Build caching guide', 'Docker layer caching', 'Slow laptop FAQ'],
  /** ranks[doc][list] for lists [original, v1, v2, v3]; null = not in that list's top results */
  ranks: [
    [4, 1, 2, 3],
    [null, 5, 1, null],
    [1, null, null, null],
  ] as (number | null)[][],
};

export function rrf(ranks: (number | null)[], k: number): number {
  return ranks.reduce<number>((s, r) => (r === null ? s : s + 1 / (k + r)), 0);
}

/** fused order (doc indices, best first) and scores after the first `lists` lists */
export function fuse(k: number, lists = 4) {
  const scores = MULTI.ranks.map((r) => rrf(r.slice(0, lists), k));
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
  return { scores, order };
}

export type Stage = 'intro' | 'query' | 'generate' | 'embed' | 'mean' | 'facts' | 'list' | 'predict' | 'fuse' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** HyDE: vectors revealed (0–3), passage shown */
  vectors: number;
  passage: boolean;
  /** multi: lists retrieved (0–4: original + 3 variants), variants shown, fused scores */
  lists: number;
  variants: boolean;
  fused: { scores: number[]; order: number[] } | null;
  turn?: 'hyde-pick' | 'multi-top';
}

const blank = { vectors: 0, passage: false, lists: 0, variants: false, fused: null };

export function simulate({ mode, rrfK }: Params): Frame[] {
  const k = Math.max(K_MIN, Math.min(K_MAX, Math.round(rrfK)));
  const F: Frame[] = [];
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => F.push({ ...blank, ...(F.at(-1) ?? {}), turn: undefined, predict: undefined, ...f } as Frame);
  if (mode === 'hyde') {
    const [q, h, m] = HYDE.vectors;
    push({ stage: 'intro', caption: `Question: "${HYDE.query}". The policy chunk says "${HYDE.truth}" Short questions and long answer passages look different, so their embeddings sit apart.` });
    push({ stage: 'query', vectors: 1, caption: `Embed the question and search the 8K chunks: the true policy chunk only comes in at rank ${q.rank} (cosine ${q.cos.toFixed(2)}).` });
    push({
      stage: 'generate',
      passage: true,
      turn: 'hyde-pick',
      caption: `HyDE asks an LLM to write a plausible answer passage first. Note "5 to 10 business days": the policy says 5–7, so this passage is wrong on the facts.`,
    });
    push({ stage: 'embed', vectors: 2, caption: `Embed the hypothetical passage instead: answer-shaped text matches answer-shaped text. The true chunk jumps to rank ${h.rank} (cosine ${h.cos.toFixed(2)}).` });
    push({ stage: 'mean', vectors: 3, caption: `Averaging the query and passage embeddings (as in the paper) keeps rank ${m.rank} (cosine ${m.cos.toFixed(2)}) and pulls back toward the question if the passage drifts.` });
    push({
      stage: 'facts',
      caption: `The wrong "5 to 10 days" never reaches the user: the passage only steers retrieval, and the answer cites the REAL chunk (5–7 days). Cost: one extra LLM generation (often 300–1,000 ms) before retrieval starts. Avoid HyDE for exact lookups and topics the LLM knows nothing about.`,
    });
    return F;
  }
  const fz = fuse(k);
  const name = (i: number) => MULTI.docs[i];
  push({ stage: 'intro', caption: `Question: "${MULTI.query}" over engineering docs. One query is one guess at how the answer is phrased.` });
  push({ stage: 'list', lists: 1, caption: `The original query alone ranks "Slow laptop FAQ" #1 (wrong topic) and the "Build caching guide" only #4.` });
  push({ stage: 'generate', variants: true, caption: `An LLM writes ${MULTI.variants.length} variants with different vocabulary and angle. All retrievals then run in parallel, so they add little latency.` });
  MULTI.variants.forEach((v, j) =>
    push({
      stage: 'list',
      lists: j + 2,
      caption: `Variant ${j + 1} "${v}": ${MULTI.ranks
        .map((r, d) => (r[j + 1] === null ? null : `"${name(d)}" #${r[j + 1]}`))
        .filter(Boolean)
        .join(', ')}${MULTI.ranks.every((r) => r[j + 1] === null) ? 'none of the tracked docs' : ''}.`,
    }),
  );
  push({ stage: 'predict', turn: 'multi-top', caption: `Four ranked lists are in. Reciprocal Rank Fusion adds 1 / (k + rank) for every list a document appears in (k = ${k}).` });
  push({
    stage: 'fuse',
    fused: fz,
    caption: `RRF (k = ${k}): ${fz.order.map((d) => `"${name(d)}" ${fz.scores[d].toFixed(4)}`).join(', ')}. The build caching guide wins because every list found it; the laptop FAQ was #1 in only one list.`,
  });
  push({
    stage: 'recap',
    caption: `On a 150-question set, recall@10 rose from 71% to 82%. Cost: one LLM call (~200–600 ms) plus more candidates for the reranker. Skip it for precise lookups ("SKU-88213 price"), where variants only add noise.`,
  });
  return F;
}
