// Pure, deterministic Reciprocal Rank Fusion (no React, Node-testable).
//   RRF(d) = Σ over ranked lists L of 1 / (k + rank_L(d))     (rank starts at 1; absent from L → contributes 0)
// Only ranks are used, so BM25 scores (unbounded, ~0–20) and cosine scores (~0–1) never need calibrating.
// Small k (0–2) → the #1 of any single list dominates; large k (60 is the paper's default) → agreement across lists wins.
import type { BaseFrame } from '../../core';

export type QueryId = 'error' | 'cancel';

export interface Params {
  k: number;
  query: QueryId;
}

export const DEFAULT_PARAMS: Params = { k: 60, query: 'error' };

export interface Hit {
  id: string;
  score: number;
}

export interface Scenario {
  query: string;
  docs: Record<string, string>;
  bm25: Hit[];
  dense: Hit[];
  /** the doc that is mid-ranked in both lists */
  consensus: string;
  bm25Why: string;
  denseWhy: string;
}

export const SCENARIOS: Record<QueryId, Scenario> = {
  error: {
    query: 'error E1234 when exporting PDF',
    docs: {
      D1: 'Fixing PDF export error E1234 (fonts not embedded)',
      D2: 'PDF export settings and page sizes',
      D3: 'Error code list: E1000–E1999',
      D4: 'Exported documents come out blank or corrupted',
      D5: 'Release notes 4.2: E1234 logging added',
      D6: 'Printing to PDF from the browser',
      D7: 'Export error messages explained',
      D8: 'Troubleshooting failed downloads',
    },
    bm25: [
      { id: 'D3', score: 14.2 },
      { id: 'D5', score: 12.9 },
      { id: 'D1', score: 11.7 },
      { id: 'D7', score: 9.4 },
      { id: 'D6', score: 6.1 },
      { id: 'D2', score: 4.8 },
    ],
    dense: [
      { id: 'D4', score: 0.86 },
      { id: 'D2', score: 0.84 },
      { id: 'D8', score: 0.83 },
      { id: 'D1', score: 0.79 },
      { id: 'D6', score: 0.77 },
      { id: 'D7', score: 0.74 },
    ],
    consensus: 'D1',
    bm25Why: 'BM25 rewards the rare exact token "E1234": an error-code list and release notes rank above the actual fix.',
    denseWhy: 'Dense retrieval matches meaning ("export fails") but is blind to the exact code, so a generic "blank export" page tops it.',
  },
  cancel: {
    query: 'how do I stop being charged every month',
    docs: {
      D1: 'Cancel your subscription and stop monthly billing',
      D2: 'Monthly billing cycle explained',
      D3: 'Being charged twice? Duplicate payment refunds',
      D4: 'Manage plan: pause, downgrade or cancel',
      D5: 'Every month we ship new features',
      D6: 'Stop email notifications',
      D7: 'Charged after cancelling? Contact support',
      D8: 'Ending a free trial without being billed',
    },
    bm25: [
      { id: 'D5', score: 10.8 },
      { id: 'D3', score: 10.1 },
      { id: 'D1', score: 9.6 },
      { id: 'D6', score: 8.2 },
      { id: 'D7', score: 7.7 },
      { id: 'D2', score: 6.9 },
    ],
    dense: [
      { id: 'D4', score: 0.88 },
      { id: 'D8', score: 0.85 },
      { id: 'D7', score: 0.84 },
      { id: 'D1', score: 0.81 },
      { id: 'D2', score: 0.76 },
      { id: 'D3', score: 0.72 },
    ],
    consensus: 'D1',
    bm25Why: 'BM25 counts word overlap: "every month" and "being charged" pull in a feature blog post and a duplicate-payment page.',
    denseWhy: 'Dense retrieval understands "stop being charged" ≈ cancel, but ranks the broader "manage plan" page first.',
  },
};

export function rankOf(list: Hit[], id: string): number | null {
  const i = list.findIndex((h) => h.id === id);
  return i < 0 ? null : i + 1;
}

export function rrf(s: Scenario, k: number): { id: string; score: number; rb: number | null; rd: number | null }[] {
  const ids = [...new Set([...s.bm25.map((h) => h.id), ...s.dense.map((h) => h.id)])];
  return ids
    .map((id) => {
      const rb = rankOf(s.bm25, id);
      const rd = rankOf(s.dense, id);
      return { id, rb, rd, score: (rb ? 1 / (k + rb) : 0) + (rd ? 1 / (k + rd) : 0) };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export type Stage = 'intro' | 'bm25' | 'dense' | 'naive' | 'score' | 'fused' | 'kcompare' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  showBm25: boolean;
  showDense: boolean;
  /** RRF contributions computed so far: id → score */
  scored: { id: string; score: number; rb: number | null; rd: number | null }[];
  current: string | null;
  fused: string[] | null;
  /** fused top-3 for several k values (stage kcompare) */
  kTable: { k: number; top: string[] }[] | null;
}

const f4 = (x: number) => x.toFixed(4);

export function simulate({ k, query }: Params): Frame[] {
  const s = SCENARIOS[query];
  const fused = rrf(s, k);
  const frames: Frame[] = [];
  const base = { showBm25: false, showDense: false, scored: [] as Frame['scored'], current: null, fused: null, kTable: null };
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => frames.push({ ...base, ...f } as Frame);

  push({
    stage: 'intro',
    caption: `Hybrid search for "${s.query}": a keyword retriever (BM25) and a dense (embedding) retriever each return a top-6. Reciprocal Rank Fusion merges them using ranks only.`,
  });
  push({ stage: 'bm25', showBm25: true, caption: `BM25 top-6, #1 = ${s.bm25[0].id} "${s.docs[s.bm25[0].id]}". ${s.bm25Why}` });
  push({
    stage: 'dense',
    showBm25: true,
    showDense: true,
    caption: `Dense top-6, #1 = ${s.dense[0].id} "${s.docs[s.dense[0].id]}". ${s.denseWhy}`,
    predict: `${s.consensus} is only #${rankOf(s.bm25, s.consensus)} in BM25 and #${rankOf(s.dense, s.consensus)} in dense. With k = ${k}, which document ends up first after fusion?`,
  });
  push({
    stage: 'naive',
    showBm25: true,
    showDense: true,
    caption: `Why not just add the raw scores? BM25 scores here run ${s.bm25[s.bm25.length - 1].score}–${s.bm25[0].score} while cosine runs ${s.dense[s.dense.length - 1].score}–${s.dense[0].score}: BM25 would swamp dense entirely. RRF sidesteps calibration by using 1/(k + rank).`,
  });
  const scored: Frame['scored'] = [];
  const order = [...new Set([...s.bm25.map((h) => h.id), ...s.dense.map((h) => h.id)])];
  for (const id of order) {
    const r = fused.find((x) => x.id === id)!;
    scored.push(r);
    const parts = [r.rb ? `1/(${k}+${r.rb})` : 'BM25: absent → 0', r.rd ? `1/(${k}+${r.rd})` : 'dense: absent → 0'];
    push({
      stage: 'score',
      showBm25: true,
      showDense: true,
      scored: [...scored],
      current: id,
      caption: `${id}: ${parts.join(' + ')} = ${f4(r.score)}.${r.rb && r.rd ? ' Found by both retrievers.' : ' Found by only one retriever.'}`,
    });
  }
  const top = fused[0];
  const cons = fused.find((x) => x.id === s.consensus)!;
  const consPos = fused.indexOf(cons) + 1;
  push({
    stage: 'fused',
    showBm25: true,
    showDense: true,
    scored: [...scored],
    fused: fused.map((x) => x.id),
    caption:
      top.id === s.consensus
        ? `Fused ranking: ${fused.slice(0, 4).map((x) => x.id).join(' > ')}. ${s.consensus} wins with ${f4(cons.score)} without topping either list: being decent in both beats being #1 in one (${s.bm25[0].id}: ${f4(fused.find((x) => x.id === s.bm25[0].id)!.score)}, ${s.dense[0].id}: ${f4(fused.find((x) => x.id === s.dense[0].id)!.score)}).`
        : `Fused ranking: ${fused.slice(0, 4).map((x) => x.id).join(' > ')}. With k = ${k} the 1/(k + rank) curve is steep, so a single #1 (${top.id}, ${f4(top.score)}) beats ${s.consensus}'s #${cons.rb} + #${cons.rd} (${f4(cons.score)}, now #${consPos}).`,
  });
  const ks = [0, 1, 10, 60];
  push({
    stage: 'kcompare',
    showBm25: true,
    showDense: true,
    scored: [...scored],
    fused: fused.map((x) => x.id),
    kTable: ks.map((kk) => ({ k: kk, top: rrf(s, kk).slice(0, 3).map((x) => x.id) })),
    caption: `Top-3 for different k: ${ks.map((kk) => `k=${kk}: ${rrf(s, kk).slice(0, 3).map((x) => x.id).join(',')}`).join(' · ')}. Larger k flattens 1/(k + rank) so agreement across lists matters more than any one #1.`,
    predict: `If a third retriever (e.g. a title-only BM25) also ranked ${s.consensus} #3, what would happen to its lead?`,
  });
  push({
    stage: 'done',
    showBm25: true,
    showDense: true,
    scored: [...scored],
    fused: fused.map((x) => x.id),
    caption: `Adding another list that contains ${s.consensus} adds another 1/(k + rank) and widens its lead. In practice: fetch top 50–100 from each retriever, fuse with k = 60, then pass the fused top-20 to a cross-encoder reranker.`,
  });
  return frames;
}
