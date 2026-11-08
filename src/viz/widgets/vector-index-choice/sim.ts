// Pure, deterministic index chooser for a vector database (no React, Node-testable).
// Memory model, all from the Vector Indexing lesson (GB = 1e9 bytes):
//   raw vectors   N × d × 4 B (float32); halfvec 2 B; int8 scalar quantization 1 B (4×); binary 1 bit (32×)
//   HNSW links    N × M × 2 × 8 B (layer-0 neighbour lists, as in the lesson's 5M × 16 example)
//   quantized indexes keep full vectors on disk for rescoring, so only codes + links need RAM
// Rule of thumb (lesson example: a 32 GB index needs a 64 GB instance): the index should use at most half the RAM.
// Choice: < 100K vectors → flat; else the first HNSW variant that fits (float32, halfvec, int8, binary); else
// DiskANN (graph + vectors on SSD). pgvector indexes `vector` only up to 2,000 dims (halfvec up to 4,000).
import type { BaseFrame } from '../../core';

export const N_OPTIONS = [50_000, 1_000_000, 5_000_000, 50_000_000] as const;
export const D_OPTIONS = [384, 768, 1536, 3072] as const;
export const M_OPTIONS = [8, 16, 32] as const;
export const RAM_OPTIONS = [16, 32, 64, 128] as const;

export interface Params {
  n: number;
  dims: number;
  M: number;
  ramGB: number;
}

export const DEFAULT_PARAMS: Params = { n: 5_000_000, dims: 1536, M: 16, ramGB: 64 };
export const FLAT_MAX = 100_000;
export const PGVECTOR_MAX_DIMS = 2000;

export type RowId = 'flat' | 'ivf' | 'hnsw' | 'halfvec' | 'int8' | 'binary';
export type Pick = 'flat' | 'hnsw' | 'halfvec' | 'quantized' | 'diskann';

export interface Row {
  id: RowId;
  label: string;
  /** RAM the index needs, GB */
  ramGB: number;
  /** what you get, from the lesson's index table */
  note: string;
  fits: boolean;
}

export const GB = 1e9;
export const linksGB = (n: number, M: number) => (n * M * 2 * 8) / GB;
export const rawGB = (n: number, d: number, bytesPerDim: number) => (n * d * bytesPerDim) / GB;

export function rows({ n, dims, M, ramGB }: Params): Row[] {
  const L = linksGB(n, M);
  const budget = ramGB / 2;
  const mk = (id: RowId, label: string, need: number, note: string): Row => ({ id, label, ramGB: need, note, fits: need <= budget + 1e-9 });
  return [
    mk('flat', 'Flat (brute force)', rawGB(n, dims, 4), `exact, compares all ${fmtN(n)} vectors per query; no build`),
    mk('ivf', 'IVF', rawGB(n, dims, 4), 'k-means clusters, search a few; needs training, drifts with updates'),
    mk('hnsw', 'HNSW · float32', rawGB(n, dims, 4) + L, 'best recall/latency trade-off; online inserts, deletes tombstoned'),
    mk('halfvec', 'HNSW · halfvec', rawGB(n, dims, 2) + L, '16-bit: half the vectors, recall@10 drops < 0.5 points'),
    mk('int8', 'HNSW · int8 + rescore', rawGB(n, dims, 1) + L, 'scalar quantization 4× smaller; rescore with full vectors'),
    mk('binary', 'Binary + rescore', rawGB(n, dims, 1 / 8) + L, '32× smaller codes; lower recall, rescore fixes it'),
  ];
}

export interface Verdict {
  pick: Pick;
  row: RowId | null;
  reason: string;
}

export function choose(p: Params): Verdict {
  const R = rows(p);
  const by = (id: RowId) => R.find((r) => r.id === id)!;
  if (p.n < FLAT_MAX) return { pick: 'flat', row: 'flat', reason: `under ~100K vectors flat is often fast enough, and it is exact` };
  const tooWide = p.dims > PGVECTOR_MAX_DIMS;
  if (!tooWide && by('hnsw').fits) return { pick: 'hnsw', row: 'hnsw', reason: `HNSW in full precision fits in half the RAM (${gb(by('hnsw').ramGB)} ≤ ${gb(p.ramGB / 2)})` };
  if (by('halfvec').fits)
    return {
      pick: 'halfvec',
      row: 'halfvec',
      reason: tooWide
        ? `${p.dims} dims is over pgvector's 2,000-dim limit for vector; halfvec indexes up to 4,000 and fits (${gb(by('halfvec').ramGB)})`
        : `full precision needs ${gb(by('hnsw').ramGB)}, over the ${gb(p.ramGB / 2)} budget; halfvec fits (${gb(by('halfvec').ramGB)}) for < 0.5 points of recall`,
    };
  for (const id of ['int8', 'binary'] as const)
    if (by(id).fits) return { pick: 'quantized', row: id, reason: `only quantized codes fit (${gb(by(id).ramGB)} ≤ ${gb(p.ramGB / 2)}); keep full vectors on disk and rescore the top-k` };
  return { pick: 'diskann', row: null, reason: `even binary codes plus graph links (${gb(by('binary').ramGB)}) exceed ${gb(p.ramGB / 2)}: put the graph and vectors on SSD (DiskANN) or add RAM` };
}

export const PICK_LABEL: Record<Pick, string> = {
  flat: 'Flat',
  hnsw: 'HNSW',
  halfvec: 'HNSW + halfvec',
  quantized: 'Quantized + rescore',
  diskann: 'DiskANN (on SSD)',
};

export type Stage = 'intro' | RowId | 'choose' | 'verdict' | 'ops';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** rows revealed so far */
  shown: number;
  verdict: Verdict | null;
  turn?: 'choose';
}

export function fmtN(n: number) {
  return n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}K`;
}
export function gb(x: number) {
  return x >= 10 ? `${x.toFixed(1)} GB` : x >= 0.1 ? `${x.toFixed(2)} GB` : `${(x * 1000).toFixed(0)} MB`;
}

export function simulate(p: Params): Frame[] {
  const R = rows(p);
  const v = choose(p);
  const L = linksGB(p.n, p.M);
  const frames: Frame[] = [];
  const push = (f: Frame) => frames.push(f);
  push({
    stage: 'intro',
    shown: 0,
    verdict: null,
    caption: `Workload: ${fmtN(p.n)} vectors × ${p.dims} dims on a ${p.ramGB} GB machine. As float32 that is ${fmtN(p.n)} × ${p.dims} × 4 B = ${gb(R[0].ramGB)} of raw vectors. Rule of thumb: the index should take at most half the RAM (${gb(p.ramGB / 2)}).`,
  });
  const cap: Record<RowId, string> = {
    flat: `Flat compares the query with every vector: exact, nothing to build, memory = the vectors (${gb(R[0].ramGB)}). Cost grows with N, so it only stays fast for small collections.`,
    ivf: `IVF clusters the vectors with k-means and searches only a few clusters (nprobe). Low memory overhead (${gb(R[1].ramGB)}), but it needs training and its clusters drift as you upsert.`,
    hnsw: `HNSW adds a multi-layer proximity graph: ${fmtN(p.n)} × M ${p.M} × 2 × 8 B ≈ ${gb(L)} of links on top of the vectors, ${gb(R[2].ramGB)} in all. Best trade-off; inserts go straight into the graph.${p.dims > PGVECTOR_MAX_DIMS ? ` Note: pgvector cannot index ${p.dims}-dim vector columns (max 2,000).` : ''}`,
    halfvec: `Store the vectors as halfvec (16-bit): ${gb(rawGB(p.n, p.dims, 2))} + ${gb(L)} links = ${gb(R[3].ramGB)}. Recall@10 drops by less than half a point.`,
    int8: `int8 scalar quantization keeps a 1-byte code per dimension (4× smaller): ${gb(R[4].ramGB)} with links. Rescore the shortlist with the full vectors kept on disk.`,
    binary: `Binary quantization keeps 1 bit per dimension (32× smaller): ${gb(R[5].ramGB)} with links. Recall is lower, so rescoring is not optional.`,
  };
  (['flat', 'ivf', 'hnsw', 'halfvec', 'int8', 'binary'] as RowId[]).forEach((id, i) => push({ stage: id, shown: i + 1, verdict: null, caption: cap[id] }));
  push({
    stage: 'choose',
    shown: R.length,
    verdict: null,
    turn: 'choose',
    caption: `All options are on the table. Bars in green fit the ${gb(p.ramGB / 2)} budget. Which index would you deploy for an interactive app?`,
  });
  push({ stage: 'verdict', shown: R.length, verdict: v, caption: `Pick: ${PICK_LABEL[v.pick]}, because ${v.reason}.` });
  push({
    stage: 'ops',
    shown: R.length,
    verdict: v,
    caption: `Running it: bulk-load first, then build (give the build enough maintenance_work_mem or the graph spills to disk). Deletes leave tombstones that vacuum/compaction reclaims, and a new embedding model means building a second index and switching atomically.`,
  });
  return frames;
}
