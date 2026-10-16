import type { Topic } from '../../types';

const topic: Topic = {
  id: 'ann-search',
  phase: 'vector-search',
  order: 2,
  title: 'ANN Search: HNSW, IVF and Product Quantization',
  subtitle:
    'Trade a sliver of recall for 100× speed: how approximate nearest-neighbour indexes work and which knobs to turn.',
  estimatedMinutes: 44,
  sources: [
    'Malkov & Yashunin 2018 — Efficient and robust approximate nearest neighbor search using HNSW graphs (arXiv 1603.09320)',
    'Jégou, Douze & Schmid 2011 — Product Quantization for Nearest Neighbor Search (IEEE TPAMI)',
    'Faiss wiki: Guidelines to choose an index; Faiss indexes (IndexHNSWFlat, IndexIVFFlat, IndexIVFPQ, IndexRefineFlat)',
    'hnswlib README: parameters M, ef_construction, ef',
    'pgvector README: HNSW (m, ef_construction, hnsw.ef_search) and IVFFlat (lists, ivfflat.probes) guidance',
    'ann-benchmarks.com (Aumüller, Bernhardsson & Faithfull) — recall vs QPS comparisons',
    'Subramanya et al. 2019 — DiskANN: Fast Accurate Billion-point Nearest Neighbor Search on a Single Node',
  ],
  tags: ['ann', 'hnsw', 'ivf', 'product-quantization', 'faiss', 'recall', 'vector-search'],
  cheatSheet: [
    'Exact kNN costs O(N·d) per query: 10M × 1,536 dims ≈ 15 GFLOP, roughly 1–2 s single-threaded; ANN answers in ~1–10 ms.',
    'Measure ANN quality as recall@k = |ANN top-k ∩ exact top-k| / k on a few hundred real queries; target 0.90–0.99.',
    'HNSW: multi-layer graph, greedy descent from the top layer, beam search of width efSearch at layer 0.',
    'HNSW knobs: M 16 (8–64) links per node; efConstruction 64–400 (build quality); efSearch ≥ k, 40–200 typical (query recall/latency). pgvector defaults: m 16, ef_construction 64, ef_search 40.',
    'HNSW memory ≈ N × (d × 4 + M × 2 × 4) bytes; inserts are online, deletes are tombstones.',
    'IVF: k-means into nlist clusters (≈ √N to 4√N; pgvector: rows/1000 up to 1M rows), search the nprobe nearest (start √nlist); needs training and drifts as data changes.',
    'PQ: split vector into m sub-vectors, 8-bit codebook each → 1,536-d float32 (6,144 B) becomes 96 B with m = 96 (64×).',
    'Compressed search loses recall; oversample (e.g. 4× k) and re-rank with full-precision vectors to recover it.',
    'Rule of thumb: < 100K vectors → flat; interactive + RAM available → HNSW; memory-bound → IVF-PQ or quantized HNSW; billions on SSD → DiskANN.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'ANN Search — trading exactness for speed, and measuring the trade',
      body: `**Intuition:** finding the closest vector by comparing against every one is like checking every house in a country to find the nearest café. ANN (approximate nearest neighbour) search uses a map: look only in the right neighbourhood, accept that you occasionally miss the very closest café, and get an answer 100–1,000× faster.

**Mechanics.**
- **Exact (flat) search:** compute the distance to all N vectors → O(N·d). 1M × 1,536 dims ≈ 1.5 GFLOP per query: fine with BLAS/GPU for small corpora, too slow at high QPS or 10M+ vectors.
- **ANN families:** *graph-based* (HNSW, DiskANN, which walk a proximity graph), *partition-based* (IVF, which searches a few clusters), *compression* (PQ, scalar, binary), which shrinks vectors so more fit in RAM/cache. Production systems combine them (IVF-PQ, HNSW + quantization).
- **The trade-off is a curve, not a point:** every index has a knob (efSearch, nprobe) that moves along a recall vs latency curve (see ann-benchmarks.com).
- **Recall@k** = overlap between ANN top-k and exact top-k ÷ k. Compute ground truth with a flat index on 200–1,000 real queries.

**What recall to aim for:** RAG pipelines typically retrieve 20–100 candidates and rerank; recall@10 of 0.95 means the 10th-best chunk is occasionally swapped for the 11th, which rarely changes answers. Below ~0.9 you start losing relevant evidence. Metadata-filter interplay is covered in Vector Databases.

**When to use it:** whenever N × QPS makes brute force too slow or expensive, typically beyond ~100K–1M vectors.`,
      example: `1M chunks × 768 dims (float32, 3 GB), 300 test queries, k = 10, single CPU core:

| Method | Latency p50 | Recall@10 |
|---|---|---|
| Flat (exact, numpy/BLAS) | 95 ms | 1.000 |
| HNSW M=16, efSearch=32 | 0.4 ms | 0.90 |
| HNSW M=16, efSearch=128 | 1.2 ms | 0.98 |
| IVF nlist=4096, nprobe=16 | 1.8 ms | 0.93 |
| IVF-PQ m=48, nprobe=32, rerank 40 | 1.1 ms | 0.95 |

HNSW at efSearch 128 is ~80× faster than exact while missing on average 0.2 of the true top-10.`,
      diagram: `recall@10
 1.00 ┤                                   ● flat (exact, slow)
 0.98 ┤                     ●───● HNSW ef=128..256
 0.95 ┤             ●──────╱      IVF-PQ + rerank
 0.90 ┤      ●─────╱  HNSW ef=32
 0.80 ┤  ●──╱  IVF nprobe=1
      └──┬──────┬──────┬──────┬──────┬──────▶ latency (ms, log)
        0.1    0.5     1      5     20    100`,
      code: [
        {
          language: 'python',
          title: 'Ground truth with a flat index, then measure ANN recall@k',
          code: `import time
import numpy as np
import faiss

d, n, nq, k = 768, 200_000, 300, 10
rng = np.random.default_rng(0)
xb = rng.standard_normal((n, d)).astype("float32")
xq = rng.standard_normal((nq, d)).astype("float32")
faiss.normalize_L2(xb); faiss.normalize_L2(xq)   # cosine == inner product on unit vectors

# 1) Exact ground truth
flat = faiss.IndexFlatIP(d)
flat.add(xb)
t = time.perf_counter(); _, gt = flat.search(xq, k); t_flat = (time.perf_counter() - t) / nq

# 2) ANN index (HNSW) — same metric
hnsw = faiss.IndexHNSWFlat(d, 16, faiss.METRIC_INNER_PRODUCT)
hnsw.hnsw.efConstruction = 128
hnsw.add(xb)

def recall_at_k(found: np.ndarray, truth: np.ndarray) -> float:
    return float(np.mean([len(set(f) & set(t)) / k for f, t in zip(found, truth)]))

for ef in (16, 32, 64, 128, 256):
    hnsw.hnsw.efSearch = ef                         # query-time knob
    t = time.perf_counter(); _, ids = hnsw.search(xq, k); dt = (time.perf_counter() - t) / nq
    print(f"ef={ef:4d} recall@10={recall_at_k(ids, gt):.3f} "
          f"latency={dt*1e3:.2f} ms speedup={t_flat/dt:.0f}x")`,
        },
      ],
      prosCons: {
        pros: [
          'Orders-of-magnitude lower latency and CPU than brute force at millions of vectors.',
          'A single knob (efSearch / nprobe) lets you pick your point on the recall-latency curve per query type.',
          'Combining ANN with compression fits 10–100× more vectors per machine.',
        ],
        cons: [
          {
            con: 'Results are approximate: some true neighbours are silently missed.',
            fix: 'Measure recall@k against flat-index ground truth on real queries, set a target (e.g. ≥ 0.95), and tune efSearch/nprobe to meet it.',
          },
          {
            con: 'Recall measured on random vectors misleads; real embedding distributions behave differently.',
            fix: 'Benchmark on your actual embeddings and logged queries, and re-check after model or corpus changes.',
          },
          {
            con: 'Index build time and memory add operational cost.',
            fix: 'Use flat search below ~100K vectors, build indexes offline/in parallel, and use quantization when memory-bound.',
          },
        ],
      },
      keyPoints: [
        'Exact kNN is O(N·d); ANN trades a little recall for 100×+ speed.',
        'Recall@k = overlap with exact top-k ÷ k, measured on real queries.',
        'Every ANN index has a knob that moves along a recall-latency curve.',
        'For RAG, recall@10 ≈ 0.95+ with reranking is a common target.',
      ],
      exercise: {
        prompt: `Write \`recallAtK(annIds, exactIds, k)\` and \`pickEf(results, target)\`.

Acceptance criteria:
- \`recallAtK\` takes two arrays of id arrays (one per query) and returns mean overlap@k ÷ k.
- \`pickEf\` takes \`[{ ef, recall, p95Ms }]\` and returns the entry with the **lowest p95** whose recall ≥ target, or the highest-recall entry if none meet it.
- For results ef 32 (0.90, 0.8 ms), 64 (0.95, 1.1 ms), 128 (0.98, 1.9 ms) and target 0.95 → ef 64.`,
        hints: [
          'Use a Set per query for the exact ids.',
          'Filter by recall ≥ target, then sort by p95Ms ascending.',
          'Fallback: sort all by recall descending and take the first.',
        ],
        solution: {
          language: 'typescript',
          code: `export function recallAtK(annIds: number[][], exactIds: number[][], k: number): number {
  let total = 0;
  annIds.forEach((ids, q) => {
    const truth = new Set(exactIds[q].slice(0, k));
    total += ids.slice(0, k).filter((id) => truth.has(id)).length / k;
  });
  return total / annIds.length;
}

type Point = { ef: number; recall: number; p95Ms: number };

export function pickEf(results: Point[], target: number): Point {
  const ok = results.filter((r) => r.recall >= target).sort((a, b) => a.p95Ms - b.p95Ms);
  if (ok.length) return ok[0];
  return [...results].sort((a, b) => b.recall - a.recall)[0]; // best effort
}

console.log(recallAtK([[1, 2, 3], [4, 5, 9]], [[1, 2, 3], [4, 5, 6]], 3)); // (1 + 2/3) / 2 = 0.833
console.log(pickEf([
  { ef: 32, recall: 0.90, p95Ms: 0.8 },
  { ef: 64, recall: 0.95, p95Ms: 1.1 },
  { ef: 128, recall: 0.98, p95Ms: 1.9 },
], 0.95)); // { ef: 64, ... }`,
        },
        explanation:
          'Turning tuning into "cheapest setting that meets the recall SLO" makes the choice reproducible and easy to re-run when data or hardware changes.',
      },
      quickCheck: {
        question:
          'An ANN index returns 9 of the true top-10 neighbours on average. What is its recall@10, and is that usually acceptable for RAG with a reranker?',
        options: [
          '0.09; unacceptable',
          '0.90; usually acceptable if you retrieve a wider candidate set and rerank',
          '0.90; always unacceptable because answers will be wrong',
          '1.0; ANN is exact for top-10',
        ],
        correct: 1,
        explanation:
          'Recall@10 = 9/10 = 0.90. Missing one of ten near-equal candidates rarely matters when you over-retrieve and rerank, though many teams target ≥ 0.95.',
      },
      source: 'ann-benchmarks.com; Faiss wiki — Guidelines to choose an index',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'HNSW and IVF — how they work and how to tune M, ef, nlist and nprobe',
      body: `**HNSW intuition:** a multi-level road network. The top layer has a few long highways between distant cities; lower layers add regional roads; layer 0 has every street. You drive greedily toward the destination on the highways, then refine on smaller roads.

**HNSW mechanics.** Each vector gets a random top level (exponentially fewer nodes per layer). Search starts at the entry point on the top layer, greedily moves to the closest neighbour, drops a layer, and at layer 0 runs a beam search keeping the best **efSearch** candidates.
- **M** — links per node (layer 0 has 2·M). 16 is the default; 32–64 for high-dim data or high-recall needs. Memory ≈ N × (d×4 + 2·M×4) bytes.
- **efConstruction** — beam width while building (64–400). Higher = better graph, slower build.
- **efSearch** — beam width at query time; must be ≥ k. 40–200 typical. The main runtime knob.
- Inserts are online; deletes are tombstones (repair via vacuum/rebuild).

**IVF intuition:** sort the library into nlist shelves by topic (k-means centroids); to answer a query, check only the nprobe nearest shelves.

**IVF mechanics.** **Train** k-means on a sample, assign every vector to its nearest centroid (inverted lists). At query time, compare with centroids, then scan the **nprobe** closest lists.
- **nlist** ≈ √N to 4√N (Faiss), or pgvector's rows/1000 up to 1M rows and √rows above.
- **nprobe** — start at √nlist; recall rises and speed falls as it grows.
- Needs training data representative of the corpus; re-train when distribution drifts.

| | HNSW | IVF |
|---|---|---|
| Recall at given latency | Best | Good |
| Memory | Higher (graph) | Lower (+ pairs with PQ) |
| Build | Slower, no training | Fast after k-means training |
| Updates | Online inserts | Inserts OK; drift needs re-train |

**When to use what:** HNSW by default for interactive RAG when RAM allows; IVF (especially IVF-PQ) for very large or memory-constrained corpora and GPU batch search.`,
      example: `pgvector, 2M × 768-d chunks, k = 10:

- **HNSW** \`m=16, ef_construction=64\`: build 14 min (8 workers). \`ef_search=40\` → recall 0.91, 3 ms; \`ef_search=100\` → 0.97, 6 ms; \`ef_search=200\` → 0.985, 11 ms.
- **HNSW** \`m=32, ef_construction=200\`: build 41 min, memory +0.26 GB; \`ef_search=100\` → 0.985, 7 ms.
- **IVFFlat** \`lists=1414\` (√2M): build 3 min. \`probes=1\` → 0.52 recall, 1 ms; \`probes=38\` (≈√lists) → 0.94, 8 ms; \`probes=80\` → 0.97, 15 ms.

Choice: HNSW m=16 with ef_search 100 meets the 0.95 target at 6 ms; IVF needs 2.5× the latency for the same recall but builds 5× faster.`,
      diagram: `HNSW                                   IVF
layer 2   A ─────────────── B           centroids: C1  C2  C3 ... C_nlist
           \\                             query → nearest nprobe = 2
layer 1   A ── D ──── E ── B                    ↓       ↓
           \\   |      |                    ┌───────┐ ┌───────┐
layer 0   A─D─F─G─q*─H─E─B (all nodes)     │list C2│ │list C5│ scan
          greedy at top, beam of            │ v v v │ │ v v v │ exact
          efSearch at layer 0               └───────┘ └───────┘
                                          other lists never touched`,
      code: [
        {
          language: 'python',
          title: 'Build and sweep HNSW (efSearch) and IVF (nprobe) in Faiss',
          code: `import numpy as np
import faiss

d, n, k = 768, 500_000, 10
xb = np.random.default_rng(1).standard_normal((n, d)).astype("float32")
xq = xb[:200] + 0.05 * np.random.default_rng(2).standard_normal((200, d)).astype("float32")
gt = faiss.IndexFlatL2(d); gt.add(xb); _, truth = gt.search(xq, k)

def recall(ids):  # mean overlap@k with exact results
    return np.mean([len(set(a) & set(b)) / k for a, b in zip(ids, truth)])

# ---- HNSW: M links per node, efConstruction at build, efSearch at query
hnsw = faiss.IndexHNSWFlat(d, 16)
hnsw.hnsw.efConstruction = 128
hnsw.add(xb)                                   # no training needed
for ef in (16, 64, 128):
    hnsw.hnsw.efSearch = ef
    print("HNSW efSearch", ef, "recall", round(recall(hnsw.search(xq, k)[1]), 3))

# ---- IVF: nlist clusters (k-means), nprobe clusters scanned per query
nlist = int(4 * np.sqrt(n))                    # ~2,828 lists
quantizer = faiss.IndexFlatL2(d)
ivf = faiss.IndexIVFFlat(quantizer, d, nlist)
ivf.train(xb[np.random.default_rng(3).choice(n, 100_000, replace=False)])  # train on a sample
ivf.add(xb)
for nprobe in (1, 16, 64):
    ivf.nprobe = nprobe
    print("IVF nprobe", nprobe, "recall", round(recall(ivf.search(xq, k)[1]), 3))`,
        },
        {
          language: 'sql',
          title: 'The same knobs in pgvector',
          code: `-- HNSW: build-time m / ef_construction, query-time ef_search (must be >= LIMIT)
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
SET hnsw.ef_search = 100;

-- IVFFlat: build AFTER loading data; lists = rows/1000 (<= 1M rows) or sqrt(rows)
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1414);
SET ivfflat.probes = 38;   -- start near sqrt(lists), raise for recall`,
        },
      ],
      prosCons: {
        pros: [
          'HNSW gives the best recall-latency trade-off on most embedding benchmarks and supports online inserts.',
          'IVF builds quickly, uses little extra memory and pairs naturally with PQ and GPUs.',
          'Both expose one query-time knob (efSearch / nprobe) you can tune per request.',
        ],
        cons: [
          {
            con: 'HNSW memory grows with M and the graph must stay in RAM for good latency.',
            fix: 'Keep M at 16 unless recall demands more, store vectors as float16/int8 with rescoring, or move to DiskANN for SSD-resident graphs.',
          },
          {
            con: 'IVF recall collapses with nprobe = 1 (pgvector default) and clusters drift as new data arrives.',
            fix: 'Set probes near √lists and tune up, train on a representative sample after bulk load, and re-train (rebuild) when data distribution shifts.',
          },
          {
            con: 'efSearch below k (or below a filter-adjusted candidate count) silently caps results.',
            fix: 'Always set efSearch ≥ k (often 2–10× k) and raise it for queries with filters or large k.',
          },
        ],
      },
      keyPoints: [
        'HNSW: greedy descent through layers; M (links), efConstruction (build), efSearch (query).',
        'IVF: k-means lists; nlist ≈ √N–4√N, nprobe ≈ √nlist to start.',
        'HNSW = best recall/latency, more RAM; IVF = cheaper memory/build, needs training.',
        'Tune the query-time knob against a recall target, not by feel.',
      ],
      exercise: {
        prompt: `Write \`hnswPlan({ n, dims, k, recallTarget })\` that proposes HNSW parameters and a memory estimate.

Acceptance criteria:
- M = 16 by default; 32 if dims > 1,024 and recallTarget ≥ 0.98.
- efConstruction = max(64, 4 × M) (128 when M = 32).
- efSearch = max(k × 4, 40), doubled if recallTarget ≥ 0.98.
- memoryGB = n × (dims × 4 + 2 × M × 4) / 1e9, rounded to 1 decimal.
- \`{ n: 2e6, dims: 1536, k: 10, recallTarget: 0.98 }\` → M 32, efConstruction 128, efSearch 80, memoryGB 12.8.`,
        hints: [
          'Compute M first; everything else depends on it.',
          'Use Math.max for the floors.',
          '2e6 × (1536 × 4 + 64 × 4) = 2e6 × 6,400 = 12.8 GB.',
        ],
        solution: {
          language: 'typescript',
          code: `type PlanIn = { n: number; dims: number; k: number; recallTarget: number };

export function hnswPlan({ n, dims, k, recallTarget }: PlanIn) {
  const highRecall = recallTarget >= 0.98;
  const M = dims > 1024 && highRecall ? 32 : 16;
  const efConstruction = Math.max(64, 4 * M);
  let efSearch = Math.max(k * 4, 40);
  if (highRecall) efSearch *= 2;
  const bytesPerNode = dims * 4 + 2 * M * 4; // float32 vector + layer-0 links (4-byte ids)
  return { M, efConstruction, efSearch, memoryGB: +((n * bytesPerNode) / 1e9).toFixed(1) };
}

console.log(hnswPlan({ n: 2e6, dims: 1536, k: 10, recallTarget: 0.98 }));
// { M: 32, efConstruction: 128, efSearch: 80, memoryGB: 12.8 }
console.log(hnswPlan({ n: 2e6, dims: 768, k: 10, recallTarget: 0.95 }));
// { M: 16, efConstruction: 64, efSearch: 40, memoryGB: 6.4 }`,
        },
        explanation:
          'These are starting points, not answers: the plan gives a defensible first configuration and a memory budget, and the recall sweep from the previous section confirms or adjusts efSearch.',
      },
      quickCheck: {
        question: 'You raise HNSW efSearch from 40 to 200 without rebuilding. What changes?',
        options: [
          'Memory usage grows 5×',
          'Recall rises and query latency increases; the graph itself is unchanged',
          'The index must be rebuilt before the change takes effect',
          'Build time increases',
        ],
        correct: 1,
        explanation:
          'efSearch is a query-time beam width: a wider beam explores more nodes, improving recall at a latency cost. M and efConstruction are build-time parameters that affect memory and build time.',
      },
      source: 'Malkov & Yashunin 2018 — HNSW; Faiss wiki; pgvector README',
    },
    // ---------------------------------------------------------------- 3 (extra)
    {
      heading: 'Putting it together: Product Quantization, re-ranking and choosing an index',
      body: `**Intuition:** product quantization (PQ) is like describing a face by picking the closest match from a catalogue of 256 noses, 256 eyes, 256 mouths… and storing only the catalogue numbers. You lose detail but the description is tiny, and distances can be computed from lookup tables.

**Mechanics.**
- Split each d-dim vector into **m sub-vectors** (d must be divisible by m).
- Run k-means with **256 centroids (8 bits)** per sub-space → each sub-vector becomes one byte.
- 1,536-d float32 = 6,144 B → **m = 96 → 96 B (64×)**; m = 192 → 192 B (32×).
- Query time: precompute a table of distances from the query's sub-vectors to every centroid (asymmetric distance), then each database vector's distance is m table lookups.
- **IVF-PQ**: IVF chooses lists, PQ compresses vectors within them (Faiss \`IndexIVFPQ\`); also common: HNSW over PQ/scalar-quantized vectors.
- **Re-ranking (refine):** compressed distances are approximate, so retrieve k' = 4–10 × k candidates, then recompute exact distances with the full vectors (from RAM, SSD or the DB) and keep the top-k. Faiss \`IndexRefineFlat\`, Qdrant \`rescore\` + \`oversampling\`, pgvector binary \`bit\` index + re-rank query.
- Other compressors: **scalar int8** (4×, tiny recall loss), **binary** (32×, needs heavy oversampling; works best with high-dim models).

**Choosing an index:**

| N vectors | RAM | Choice |
|---|---|---|
| < 100K | any | Flat (exact) |
| 100K–50M | plenty | HNSW (float32 or float16) |
| 10M–1B | tight | HNSW + int8/binary + rescoring, or IVF-PQ + refine |
| 1B+ | SSD | DiskANN / IVF-PQ on GPU |`,
      example: `50M chunks × 1,024 dims:

- float32 HNSW: 50M × (4,096 + 128) B ≈ 211 GB RAM → several large nodes.
- IVF-PQ (nlist 16,384, m = 64 × 8-bit): 50M × 64 B = 3.2 GB codes + ~0.4 GB ids/lists ≈ 3.6 GB RAM. Recall@10 alone ≈ 0.70.
- Add refine: fetch top-100 candidates by PQ distance, re-score with float32 vectors stored on NVMe (100 × 4 KB = 400 KB per query, ~0.2 ms on SSD) → recall@10 ≈ 0.96, p95 ≈ 9 ms.

Same quality target at ~1/50th of the RAM.`,
      diagram: `1,536-d float32 vector (6,144 B)
┌──────┬──────┬──────┬─── ... ───┬──────┐
│ 16-d │ 16-d │ 16-d │           │ 16-d │   m = 96 sub-vectors
└──┬───┴──┬───┴──┬───┴─── ... ───┴──┬───┘
   ▼      ▼      ▼                  ▼     nearest of 256 centroids
  [17]   [203]  [5]      ...       [88]   = 96 bytes (64× smaller)

query ─▶ PQ distance (table lookups) ─▶ top-100 ─▶ exact re-rank ─▶ top-10`,
      code: [
        {
          language: 'python',
          title: 'IVF-PQ with exact re-ranking in Faiss',
          code: `import numpy as np
import faiss

d, n, k = 768, 1_000_000, 10
rng = np.random.default_rng(0)
xb = rng.standard_normal((n, d)).astype("float32")
xq = xb[:300] + 0.05 * rng.standard_normal((300, d)).astype("float32")

nlist, m, nbits = 4096, 48, 8                 # 768 / 48 = 16 dims per sub-vector
quantizer = faiss.IndexFlatL2(d)
ivfpq = faiss.IndexIVFPQ(quantizer, d, nlist, m, nbits)
ivfpq.train(xb[rng.choice(n, 200_000, replace=False)])   # k-means for lists + PQ codebooks
ivfpq.nprobe = 32
print("bytes/vector:", m * nbits // 8, "vs float32:", d * 4)   # 48 vs 3,072

# Refine wrapper: keeps raw vectors and re-scores k_factor * k PQ candidates exactly
refined = faiss.IndexRefineFlat(ivfpq)
refined.k_factor = 10                         # retrieve 100 by PQ distance, return best 10
refined.add(xb)                               # adds PQ codes to ivfpq AND raw copies for refine

gt = faiss.IndexFlatL2(d); gt.add(xb); _, truth = gt.search(xq, k)
for name, idx in (("IVF-PQ", ivfpq), ("IVF-PQ + refine", refined)):
    _, ids = idx.search(xq, k)
    r = np.mean([len(set(a) & set(b)) / k for a, b in zip(ids, truth)])
    print(f"{name:16s} recall@10={r:.3f}")`,
        },
      ],
      prosCons: {
        pros: [
          'PQ shrinks vectors 16–64×, fitting hundreds of millions of vectors in RAM or on one GPU.',
          'Distance via lookup tables is fast and cache-friendly.',
          'Oversampling + exact re-ranking recovers most of the lost recall at small cost.',
        ],
        cons: [
          {
            con: 'Raw PQ distances are coarse; recall@10 can drop to ~0.6–0.8.',
            fix: 'Oversample (k\' = 4–10 × k) and re-rank with full-precision vectors (IndexRefineFlat, Qdrant rescore).',
          },
          {
            con: 'PQ and IVF need training and degrade when the data distribution shifts (new domain, new embedding model).',
            fix: 'Train on a representative sample after bulk load, monitor recall on a fixed query set, and retrain/rebuild on drift or model change.',
          },
          {
            con: 'Re-ranking needs the full vectors somewhere, adding storage and I/O.',
            fix: 'Keep originals on NVMe or in the primary DB and fetch only the oversampled candidates; use int8 instead of PQ when RAM allows.',
          },
        ],
      },
      keyPoints: [
        'PQ: m sub-vectors × 8-bit codes → m bytes per vector.',
        'IVF-PQ combines cluster pruning with compression.',
        'Oversample and re-rank with full vectors to recover recall.',
        'Pick the index by N, RAM budget and recall target.',
      ],
      exercise: {
        prompt: `Write \`pqPlan(dims, targetBytes)\` that chooses the PQ sub-vector count \`m\` and reports compression.

Acceptance criteria:
- \`m\` must divide \`dims\` exactly and use 8-bit codes (bytes = m).
- Choose the **largest** valid m with m ≤ targetBytes.
- Return \`{ m, subDim, bytes, ratio }\` where ratio = (dims × 4) / bytes rounded to 1 decimal.
- \`pqPlan(1536, 100)\` → m 96, subDim 16, bytes 96, ratio 64.
- Throw if no divisor fits.`,
        hints: [
          'Loop m from targetBytes down to 1 and stop at the first divisor of dims.',
          'subDim = dims / m.',
          'ratio = dims * 4 / m.',
        ],
        solution: {
          language: 'typescript',
          code: `export function pqPlan(dims: number, targetBytes: number) {
  for (let m = Math.min(targetBytes, dims); m >= 1; m--) {
    if (dims % m === 0) {
      return { m, subDim: dims / m, bytes: m, ratio: +((dims * 4) / m).toFixed(1) };
    }
  }
  throw new Error('no valid m for ' + dims + ' dims within ' + targetBytes + ' bytes');
}

console.log(pqPlan(1536, 100)); // { m: 96, subDim: 16, bytes: 96, ratio: 64 }
console.log(pqPlan(768, 50));   // { m: 48, subDim: 16, bytes: 48, ratio: 64 }
console.log(pqPlan(1024, 200)); // { m: 128, subDim: 8, bytes: 128, ratio: 32 }`,
        },
        explanation:
          'Sub-vectors of ~8–16 dims are typical: too few dims per sub-space wastes bytes, too many makes 256 centroids too coarse. The ratio shows how much RAM you are trading for recall, which re-ranking then buys back.',
      },
      quickCheck: {
        question:
          'IVF-PQ gives recall@10 = 0.72. Without changing the index, what is the most effective way to raise it to ~0.95?',
        options: [
          'Lower nprobe to 1',
          'Retrieve ~100 candidates by PQ distance and re-rank them with full-precision vectors',
          'Normalise the query vector twice',
          'Reduce k to 5',
        ],
        correct: 1,
        explanation:
          'The true neighbours are usually within a larger PQ candidate set; exact re-scoring of that set restores the correct order. Lowering nprobe reduces recall; re-normalising or shrinking k does not fix approximation error.',
      },
      source: 'Jégou et al. 2011 — Product Quantization; Faiss wiki — IndexIVFPQ and IndexRefineFlat',
    },
  ],
  codeChallenges: [
    {
      id: 'ann-search-cc-1',
      title: 'An hnswlib service with hidden recall and capacity bugs',
      context:
        'A Python microservice serves semantic search with hnswlib. It returns fewer results than requested for k = 50, recall is poor, and it crashes when the corpus grows.',
      task: 'Fix efSearch vs k, metric choice, capacity handling and persistence, and add a recall self-check against brute force.',
      starter: {
        language: 'python',
        code: `import hnswlib
import numpy as np

index = hnswlib.Index(space="l2", dim=1536)       # embeddings are cosine-trained
index.init_index(max_elements=100_000, M=4, ef_construction=10)

def add(ids, vecs):
    index.add_items(vecs, ids)

def search(q, k=50):
    index.set_ef(10)
    labels, dists = index.knn_query(q, k=k)
    return labels[0]`,
      },
      hints: [
        'efSearch must be at least k (hnswlib requires ef ≥ k for full results).',
        'Use space="cosine" (or normalise and use "ip") for cosine-trained embeddings; M 16 and ef_construction ≥ 100 are saner.',
        'Call resize_index before exceeding max_elements, and save_index/load_index for persistence.',
      ],
      solution: {
        language: 'python',
        code: `import threading
import hnswlib
import numpy as np

DIM = 1536
index = hnswlib.Index(space="cosine", dim=DIM)    # match the embedding's training metric
index.init_index(max_elements=200_000, M=16, ef_construction=200, allow_replace_deleted=True)
lock = threading.Lock()

def add(ids: np.ndarray, vecs: np.ndarray) -> None:
    with lock:
        needed = index.get_current_count() + len(ids)
        if needed > index.get_max_elements():
            index.resize_index(int(needed * 1.5))  # grow ahead instead of crashing
        index.add_items(vecs, ids, replace_deleted=True)

def search(q: np.ndarray, k: int = 50) -> np.ndarray:
    index.set_ef(max(2 * k, 100))                # ef must be >= k; 2-4x k for good recall
    labels, _ = index.knn_query(q.reshape(1, -1), k=k)
    return labels[0]

def self_check(sample: np.ndarray, all_vecs: np.ndarray, all_ids: np.ndarray, k: int = 10) -> float:
    # brute-force cosine ground truth on a small query sample
    a = all_vecs / np.linalg.norm(all_vecs, axis=1, keepdims=True)
    hits = 0.0
    for q in sample:
        exact = all_ids[np.argsort(-(a @ (q / np.linalg.norm(q))))[:k]]
        hits += len(set(search(q, k)) & set(exact)) / k
    return hits / len(sample)                    # alert if below e.g. 0.95

def persist(path: str) -> None:
    with lock:
        index.save_index(path)                   # reload with index.load_index(path, max_elements=...)`,
      },
      explanation:
        'ef = 10 with k = 50 cannot return 50 good results; M = 4 / ef_construction = 10 builds a poorly connected graph; L2 on cosine-trained, unnormalised vectors ranks differently; a fixed capacity crashes on growth. The fix aligns metric, uses sane build parameters, sets ef ≥ k, grows capacity, persists the index and continuously verifies recall.',
      followUps: [
        {
          q: 'Why does M = 4 hurt so much on 1,536-d data?',
          a: 'High-dimensional data needs more links per node to stay navigable; with very few links greedy search gets trapped in local minima and misses true neighbours regardless of ef.',
        },
        {
          q: 'How would you scale this beyond one process?',
          a: 'Move to a vector database or shard the index by id range with scatter-gather queries, since hnswlib is an in-process library without replication.',
        },
      ],
    },
    {
      id: 'ann-search-cc-2',
      title: 'IVF index trained on the wrong data with nprobe = 1',
      context:
        'A batch job builds a Faiss IVF index by training on the first 1,000 vectors (all from one product category) with nlist = 65,536 for a 2M-vector corpus, and queries with the default nprobe = 1. Recall is 0.4.',
      task: 'Fix training sample, nlist, nprobe and add a recall sweep that picks nprobe for a 0.95 target.',
      starter: {
        language: 'python',
        code: `import faiss

def build(xb):
    d = xb.shape[1]
    q = faiss.IndexFlatL2(d)
    index = faiss.IndexIVFFlat(q, d, 65536)
    index.train(xb[:1000])
    index.add(xb)
    return index`,
      },
      hints: [
        'Faiss wants roughly 30–256 training points per centroid; 1,000 points cannot train 65,536 centroids.',
        'nlist ≈ 4·√N for 2M vectors is ~5,600; train on a random sample of ~200K.',
        'Sweep nprobe over powers of two and pick the smallest meeting the recall target.',
      ],
      solution: {
        language: 'python',
        code: `import numpy as np
import faiss

def build(xb: np.ndarray, seed: int = 0) -> faiss.IndexIVFFlat:
    n, d = xb.shape
    nlist = int(4 * np.sqrt(n))                          # ~5,657 for 2M vectors
    train_n = min(n, max(50 * nlist, 100_000))           # >= ~50 points per centroid
    sample = xb[np.random.default_rng(seed).choice(n, train_n, replace=False)]  # random, all categories
    index = faiss.IndexIVFFlat(faiss.IndexFlatL2(d), d, nlist)
    index.train(sample)
    index.add(xb)
    return index

def tune_nprobe(index, xb, queries, k=10, target=0.95):
    gt = faiss.IndexFlatL2(xb.shape[1]); gt.add(xb)
    _, truth = gt.search(queries, k)
    for nprobe in (1, 2, 4, 8, 16, 32, 64, 128, 256):
        index.nprobe = nprobe
        _, ids = index.search(queries, k)
        r = np.mean([len(set(a) & set(b)) / k for a, b in zip(ids, truth)])
        print(f"nprobe={nprobe:4d} recall@{k}={r:.3f}")
        if r >= target:
            return nprobe
    return 256`,
      },
      explanation:
        'Training 65,536 centroids on 1,000 single-category points produces meaningless clusters, so most queries probe the wrong list; with nprobe = 1 there is no second chance. A representative random sample, nlist sized to √N scale, and a measured nprobe restore recall while keeping the search a small fraction of the corpus.',
      followUps: [
        {
          q: 'Six months later recall drops to 0.85 with the same nprobe. Why?',
          a: 'New data shifted the distribution, so centroids no longer partition it well and lists are unbalanced; retrain on a fresh sample and rebuild, or move to HNSW which does not need training.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'ann-search-iq-1',
      difficulty: 'medium',
      question: 'Explain how HNSW search works and what M, efConstruction and efSearch control.',
      whatInterviewerLooksFor: [
        'Layered graph and greedy descent',
        'Beam search at layer 0',
        'Correct build-time vs query-time split of parameters',
        'Memory and latency consequences',
      ],
      modelAnswer: `**Structure.** HNSW builds a multi-layer proximity graph. Every vector is in layer 0; a random, exponentially decreasing subset also appears in higher layers, which therefore contain few nodes connected by long-range links (like highways).

**Search.**
1. Start at the entry point in the top layer.
2. Greedily move to the neighbour closest to the query until no neighbour is closer; drop to the next layer from there.
3. At layer 0, run a best-first beam search that keeps the **efSearch** best candidates, expanding their neighbours until no improvement; return the top-k.

**Parameters**
- **M** (build time): number of links per node (2·M at layer 0). Higher M → better navigability and recall for high-dimensional data, more memory (≈ 2·M × 4 bytes per node at layer 0) and slower builds. 16 default, 32–64 for hard data.
- **efConstruction** (build time): beam width when inserting nodes. Higher → better-quality graph, slower build (64–400).
- **efSearch** (query time): beam width during search; must be ≥ k. Higher → higher recall, more latency. The main runtime knob, tunable per query.

**Properties:** query cost roughly logarithmic in N; online inserts; deletes are tombstones; the graph should live in RAM. In pgvector the names are \`m\`, \`ef_construction\` (defaults 16/64) and \`hnsw.ef_search\` (default 40).`,
      followUps: [
        {
          q: 'Why are higher layers useful at all?',
          a: 'They provide long jumps that bring the search near the query region in a few hops, so layer 0 beam search starts close to the answer instead of wandering across the whole graph.',
        },
        {
          q: 'Which parameter would you change first if recall is low?',
          a: 'efSearch, because it needs no rebuild; if raising it gives diminishing returns, rebuild with higher M or efConstruction.',
        },
      ],
      pitfalls: [
        'Mixing up build-time and query-time parameters',
        'Claiming HNSW is exact',
      ],
    },
    {
      id: 'ann-search-iq-2',
      difficulty: 'hard',
      question: 'HNSW or IVF-PQ for 300M vectors of 768 dims with a p95 target of 20 ms and a limited hardware budget? Justify with numbers.',
      whatInterviewerLooksFor: [
        'Memory arithmetic for both options',
        'Recall recovery via re-ranking',
        'Latency reasoning',
        'Mentions alternatives (quantized HNSW, DiskANN, sharding)',
      ],
      modelAnswer: `**Memory first**
- float32 HNSW: 300M × (768 × 4 + 32 × 4) ≈ 300M × 3,200 B ≈ **960 GB RAM** → many large nodes or shards.
- HNSW with int8 vectors: 300M × (768 + 128) ≈ 270 GB → still multiple nodes.
- IVF-PQ, m = 64 (64 B/vector): 300M × 64 B ≈ **19 GB** codes + ids (~2.4 GB) ≈ 22 GB → fits on one machine or one GPU.

**Recall and latency**
- IVF-PQ alone: recall@10 maybe 0.6–0.8. With nlist ≈ 65K and nprobe 64, scanning ~0.1% of the codes is a few ms on CPU (sub-ms batched on GPU).
- **Re-rank:** take top-200 by PQ distance, fetch float32 vectors from NVMe (200 × 3 KB = 600 KB, a few ms of SSD reads in parallel), recompute exact distances → recall@10 ≈ 0.95.
- p95 ≈ 5 ms (IVF-PQ) + 5–10 ms (re-rank I/O) ≈ within 20 ms.

**Decision:** IVF-PQ + refine on a single large node (or GPU) meets the target at a fraction of HNSW's hardware cost. If the budget allowed ~1 TB of RAM across shards, HNSW would give simpler ops and better recall per ms.

**Alternatives:** DiskANN keeps a graph plus PQ codes in RAM and full vectors on SSD, often the best fit at this scale; Qdrant/Milvus offer quantized HNSW with on-disk originals.

**Validate** with recall@10 against exact search on 1,000 sampled queries and a load test at target QPS.`,
      followUps: [
        {
          q: 'What breaks IVF-PQ over time?',
          a: 'Distribution drift: new data falls into a few lists or poorly fitting codebooks; retrain and rebuild periodically and monitor list balance and recall.',
        },
        {
          q: 'How would you shard if you chose HNSW?',
          a: 'Shard by id hash across nodes, query all shards in parallel with top-k each, then merge; latency becomes the slowest shard, so keep shards balanced.',
        },
      ],
      pitfalls: [
        'Ignoring RAM cost of float32 HNSW at this scale',
        'Using raw PQ without re-ranking',
      ],
    },
    {
      id: 'ann-search-iq-3',
      difficulty: 'medium',
      question: 'How do you measure and monitor the recall of an ANN index in production?',
      whatInterviewerLooksFor: [
        'Ground truth via exact search on sampled queries',
        'recall@k definition',
        'Continuous monitoring and triggers',
        'Distinguishes ANN recall from end-to-end retrieval quality',
      ],
      modelAnswer: `**Definition:** recall@k = |ANN top-k ∩ exact top-k| / k, averaged over queries. It measures the index's approximation error only, not whether the embeddings are good.

**Offline**
1. Sample 500–1,000 real (logged) queries; embed them.
2. Compute exact top-k with a flat index (Faiss IndexFlat, pgvector with index scans disabled, Qdrant \`exact: true\`).
3. Sweep the query knob (efSearch / nprobe) and plot recall vs p95 latency; choose the cheapest setting meeting the SLO (e.g. ≥ 0.95).
4. Include filtered queries; they behave differently.

**Production monitoring**
- A nightly job re-runs a fixed query set plus fresh sampled queries against exact search and emits \`ann_recall_at_10\`.
- Alert on drops (e.g. < 0.93), which often follow: heavy deletes (tombstones), data drift (IVF/PQ), changed filters, or parameter regressions in deploys.
- Track results returned < k as a separate signal.

**Separate from retrieval quality:** an index can have recall 0.99 against exact search while the system retrieves the wrong passages because embeddings or chunking are poor. Use labelled relevance metrics (recall@k vs gold passages, MRR) for that.`,
      followUps: [
        {
          q: 'Exact search over 50M vectors for 1,000 queries is expensive. How do you make it affordable?',
          a: 'Run it on GPU (Faiss GPU flat), batch queries for BLAS efficiency, or use a random subset of the corpus for a relative trend metric.',
        },
        {
          q: 'Why use logged queries rather than random vectors?',
          a: 'Real queries concentrate in particular regions of the space and have neighbours with specific density; random vectors give misleading recall estimates.',
        },
      ],
      pitfalls: [
        'Confusing ANN recall with relevance',
        'Testing only on random or synthetic vectors',
      ],
    },
    {
      id: 'ann-search-iq-4',
      difficulty: 'hard',
      question: 'Your HNSW index p95 latency doubled after the corpus grew from 5M to 12M vectors, while recall stayed the same. What happened and what do you do?',
      context: 'Single node, 64 GB RAM, 1,536-d float32 vectors, M = 16.',
      whatInterviewerLooksFor: [
        'Memory arithmetic showing the index no longer fits in RAM',
        'Understands random access pattern of graph traversal',
        'Options: quantization, more RAM, sharding, disk-based index',
        'Verifies with metrics (page faults, cache hit ratio)',
      ],
      modelAnswer: `**Arithmetic.** 12M × (1,536 × 4 + 32 × 4) ≈ 12M × 6,272 B ≈ **75 GB**, more than the 64 GB machine (which also needs OS and DB memory). At 5M vectors it was ~31 GB and fit comfortably.

**Why latency, not recall.** HNSW traversal is random access: each hop touches a different node's vector and neighbour list. Once part of the index is on disk, many hops become page faults or buffer misses, adding milliseconds each. The algorithm visits the same nodes, so recall is unchanged but each visit is slower.

**Verify:** OS page-fault rate, Postgres buffer-cache hit ratio for the index (or Qdrant's memory metrics), disk read IOPS during queries.

**Fixes**
1. **Shrink vectors:** float16/halfvec halves memory (≈ 38 GB); int8 scalar quantization quarters it, with rescoring from originals on disk.
2. **Binary quantization + rescoring** for high-dim models: 32× smaller vectors, oversample and re-rank.
3. **Scale up RAM** (128 GB) if simplicity matters more than cost.
4. **Shard** across nodes with scatter-gather.
5. **Disk-optimised index** (DiskANN, Qdrant on-disk vectors with in-RAM quantized copies).

Then re-run the recall/latency sweep to re-confirm efSearch.`,
      followUps: [
        {
          q: 'Why not just lower efSearch to restore latency?',
          a: 'It reduces hops but each hop is still slow when memory-bound, and recall would drop; fixing the memory fit addresses the cause.',
        },
        {
          q: 'How would you plan capacity to avoid this next time?',
          a: 'Track bytes per vector × projected count, alert at ~70% of available RAM, and schedule quantization or scaling before crossing it.',
        },
      ],
      pitfalls: [
        'Retuning efSearch without checking memory',
        'Assuming latency growth comes from O(log N) search alone',
      ],
    },
    {
      id: 'ann-search-iq-5',
      difficulty: 'expert',
      question: 'Explain product quantization end to end: training, encoding, asymmetric distance computation, and why re-ranking is needed.',
      whatInterviewerLooksFor: [
        'Sub-space decomposition and per-sub-space k-means',
        'Encoding into m bytes',
        'Asymmetric distance via lookup tables',
        'Error sources and re-ranking/oversampling',
      ],
      modelAnswer: `**Training.** Split d dims into m contiguous sub-spaces of d/m dims. For each sub-space run k-means with 2^nbits centroids (usually 256 → 8 bits) on a training sample. Result: m codebooks of 256 centroids each.

**Encoding.** For each database vector, in each sub-space find the nearest centroid and store its index (1 byte). A vector becomes m bytes: 768-d float32 (3,072 B) with m = 48 → 48 B (64×).

**Asymmetric distance computation (ADC).** At query time the query is **not** quantized. For each sub-space j, compute the distance from the query's sub-vector to all 256 centroids → an m × 256 lookup table. The approximate distance to a database vector is the sum over j of table[j][code_j]: m table lookups and adds, which is very fast and cache-friendly. With IVF-PQ, PQ usually encodes the residual (vector minus its IVF centroid), improving accuracy.

**Error sources**
- Each sub-vector is replaced by its centroid: quantization error.
- Sub-spaces are assumed independent; correlated dimensions waste codebook capacity (OPQ rotates the space to reduce this).
- Many candidates end up with near-identical approximate distances, so ordering at the top is noisy.

**Why re-rank.** The true neighbours are usually inside the PQ top-(4–10)·k, just mis-ordered. Fetch those candidates' full vectors and compute exact distances to restore order: recall@10 often rises from ~0.7 to ~0.95 for a small I/O cost.

**Choosing m:** sub-vectors of ~8–16 dims are typical; larger m means better accuracy, more bytes.`,
      followUps: [
        {
          q: 'How does scalar int8 quantization differ?',
          a: 'It maps each dimension independently to 8 bits (4× compression) with little recall loss and no codebooks, while PQ achieves 16–64× by quantizing groups of dimensions jointly.',
        },
        {
          q: 'What is OPQ?',
          a: 'Optimized PQ learns a rotation applied before splitting so variance is balanced across sub-spaces, reducing quantization error at the same code size.',
        },
      ],
      pitfalls: [
        'Saying the query is quantized too (symmetric is possible but less accurate)',
        'Forgetting codebooks need representative training data',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'ann-search-est-1',
      question: 'How much faster is HNSW than brute force for 10M × 1,536-d vectors, and how many CPU cores does each need for 200 QPS?',
      assumptions: [
        'Brute force: 2 FLOPs per dim per vector; one core sustains ~20 GFLOP/s with SIMD BLAS',
        'HNSW: ~1,500 distance computations per query at efSearch 100 (M 16)',
        'Each distance = 1,536 × 2 FLOPs, but memory-bound: ~0.5 µs per distance with cache misses',
      ],
      steps: [
        { label: 'Brute-force FLOPs/query', calc: '10M × 1,536 × 2 ≈ 30.7 GFLOP' },
        { label: 'Brute-force time/query', calc: '30.7 GFLOP ÷ 20 GFLOP/s ≈ 1.5 s per core' },
        { label: 'Brute-force cores for 200 QPS', calc: '200 × 1.5 s = 300 core-seconds/s → ~300 cores (also memory-bandwidth bound: 61 GB scanned per query)' },
        { label: 'HNSW time/query', calc: '1,500 × 0.5 µs ≈ 0.75 ms (+ overhead ≈ 1 ms)' },
        { label: 'HNSW cores for 200 QPS', calc: '200 × 1 ms = 0.2 core-seconds/s → 1 core busy; 2–4 cores for headroom' },
        { label: 'Speed-up', calc: '1.5 s ÷ 1 ms ≈ 1,500×' },
      ],
      answer: 'Brute force needs ~300 cores (and enormous memory bandwidth); HNSW serves the same load on 2–4 cores, about 1,500× less work per query.',
      insight:
        'ANN turns an infrastructure problem into a rounding error; the cost to watch shifts to RAM for the index, not CPU.',
      followUps: [
        {
          q: 'When does brute force on a GPU become competitive?',
          a: 'An A100-class GPU at ~1.5 TB/s memory bandwidth scans 61 GB in ~40 ms, so batched exact search is viable for offline jobs or ground-truth computation, but not cost-effective for low-latency serving at this scale.',
        },
      ],
    },
    {
      id: 'ann-search-est-2',
      question: 'Size an IVF-PQ index with re-ranking for 1B × 768-d vectors and estimate per-query work.',
      assumptions: [
        'PQ: m = 48 sub-vectors, 8 bits → 48 B/vector; ids 8 B',
        'nlist = 2^17 = 131,072 lists (≈ 4√N), nprobe = 64',
        'Re-rank top-200 with float32 originals on NVMe (3,072 B each)',
        'NVMe random read ~100 µs per 4 KB, 32 parallel reads',
      ],
      steps: [
        { label: 'Codes in RAM', calc: '1B × (48 + 8) B = 56 GB' },
        { label: 'Originals on SSD', calc: '1B × 3,072 B ≈ 3.1 TB' },
        { label: 'Vectors scanned/query', calc: '1B ÷ 131,072 ≈ 7,600 per list × 64 lists ≈ 490K codes' },
        { label: 'PQ scan time', calc: '490K × 48 lookups ≈ 23.5M lookups ≈ 5–10 ms on one core (faster multi-threaded / GPU)' },
        { label: 'Re-rank I/O', calc: '200 reads ÷ 32 parallel × 100 µs ≈ 0.6 ms (+ queueing ≈ 1–2 ms)' },
        { label: 'Totals', calc: '~56 GB RAM + 3.1 TB SSD; ~10 ms per query' },
      ],
      answer: 'About 56 GB RAM for codes plus ~3 TB of NVMe for originals, at ~10 ms per query with re-ranking.',
      insight:
        'Billion-scale search fits on one large machine only because of compression; float32 HNSW would need ~3.2 TB of RAM. Re-ranking from SSD is what keeps recall acceptable.',
      followUps: [
        {
          q: 'How would doubling nprobe affect the numbers?',
          a: 'Codes scanned double to ~980K, roughly doubling PQ scan time to ~10–20 ms, with a modest recall gain; re-rank cost is unchanged since it depends on the candidate count.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'ann-search-mcq-01',
      difficulty: 'medium',
      question: 'Which parameter can you change at query time without rebuilding an HNSW index?',
      options: ['M', 'efConstruction', 'efSearch', 'The distance metric'],
      correct: [2],
      explanation:
        'efSearch is the query-time beam width. M and efConstruction shape the graph at build time, and the metric is baked into how the graph was built, so changing any of those requires a rebuild.',
      followUps: [
        {
          q: 'Can efSearch differ between two concurrent queries?',
          a: 'Yes: most engines allow it per query or per session (hnsw.ef_search via SET LOCAL in pgvector, hnsw_ef in Qdrant search params), so you can spend more on hard or filtered queries.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-02',
      difficulty: 'hard',
      question: 'This search reaches only ~0.8 recall@100. What is the main cause?',
      code: {
        language: 'python',
        code: `index = faiss.IndexHNSWFlat(d, 16)
index.hnsw.efConstruction = 200
index.add(xb)
index.hnsw.efSearch = 16
D, I = index.search(xq, 100)`,
      },
      options: [
        'efConstruction is too high',
        'efSearch (16) is far below k (100); even if the library clamps the beam up to k, a beam exactly k wide leaves no slack',
        'IndexHNSWFlat does not support k > 10',
        'M must equal k',
      ],
      correct: [1],
      explanation:
        'The layer-0 beam keeps efSearch candidates. Libraries such as Faiss and hnswlib use max(efSearch, k), so the beam is at best exactly 100 wide, with no spare candidates to correct greedy mistakes. Set efSearch to 2–4× k. efConstruction 200 is fine, and k > 10 and M are unrelated.',
      followUps: [
        {
          q: 'Why does a beam wider than k improve recall?',
          a: 'Extra candidates let the search keep exploring alternative paths around local minima, so true neighbours that are reached late can still displace worse ones before the top-k is returned.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-03',
      difficulty: 'hard',
      question: 'Which statements about IVF indexes are correct? (Select ALL that apply)',
      options: [
        'They must be trained (k-means) before vectors are added',
        'nprobe = 1 is fast but can miss neighbours that sit in an adjacent cluster',
        'They need no training if the data is normalised',
        'Recall can degrade as new data drifts away from the trained centroids',
      ],
      correct: [0, 1, 3],
      explanation:
        'IVF needs centroids from k-means training, probes only nprobe lists (missing border neighbours when low), and suffers when the data distribution changes. Normalisation does not remove the need for centroids.',
      followUps: [
        {
          q: 'Why does pgvector advise creating IVFFlat indexes after loading data?',
          a: 'The lists are computed from the rows present at build time; building on an empty or tiny table yields centroids that do not represent the real data and poor recall.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-04',
      difficulty: 'expert',
      question:
        'You need recall@10 ≥ 0.97 on 1,536-d embeddings. HNSW with M = 16 plateaus at 0.95 even with efSearch = 800. What is the best next step?',
      options: [
        'Raise efSearch to 5,000',
        'Rebuild with higher M (e.g. 32–48) and efConstruction (200–400), then re-sweep efSearch',
        'Switch to IVF with nprobe = 1',
        'Reduce the embedding dimension to 64 with PCA',
      ],
      correct: [1],
      explanation:
        'A plateau despite large efSearch means the graph itself is the limit: high-dimensional data needs more links and better construction. Higher efSearch gives diminishing returns at large cost; nprobe = 1 lowers recall; aggressive PCA destroys information.',
      followUps: [
        {
          q: 'What is the cost of raising M from 16 to 48 for 10M vectors?',
          a: 'Layer-0 links grow from 32 to 96 per node: about +10M × 64 × 4 B ≈ 2.6 GB of extra memory, and noticeably slower builds and inserts.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-05',
      difficulty: 'medium',
      question: 'A product quantizer with m = 64 sub-vectors and 8-bit codes encodes a 1,024-d float32 vector. How large is each code and what is the compression ratio?',
      options: ['64 bytes, 64×', '128 bytes, 32×', '1,024 bytes, 4×', '8 bytes, 512×'],
      correct: [0],
      explanation:
        'One byte per sub-vector gives 64 bytes. The original is 1,024 × 4 = 4,096 bytes, so the ratio is 4,096 / 64 = 64×.',
      followUps: [
        {
          q: 'How many dimensions does each sub-vector cover?',
          a: '1,024 / 64 = 16 dimensions per sub-vector, each replaced by the index of its nearest of 256 centroids.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-06',
      difficulty: 'hard',
      question: 'Which techniques recover recall lost to vector compression? (Select ALL that apply)',
      options: [
        'Oversampling candidates (e.g. 4–10× k) from the compressed index',
        'Re-scoring candidates with full-precision vectors',
        'Lowering nprobe or efSearch',
        'Using OPQ (a learned rotation) before product quantization',
      ],
      correct: [0, 1, 3],
      explanation:
        'Oversampling plus exact re-scoring fixes ordering errors, and OPQ reduces quantization error at the same code size. Lowering nprobe/efSearch reduces the candidate set and makes recall worse.',
      followUps: [
        {
          q: 'Where are full-precision vectors kept for re-scoring in Qdrant?',
          a: 'Originals can stay on disk while quantized vectors are in RAM; search params like quantization rescore=true and oversampling control the re-scoring step.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-07',
      difficulty: 'expert',
      question: 'What is wrong with this recall measurement?',
      code: {
        language: 'python',
        code: `xq = np.random.randn(100, d).astype("float32")
_, ann = hnsw.search(xq, 10)
_, exact = hnsw.search(xq, 100)
recall = np.mean([len(set(a) & set(e[:10])) / 10 for a, e in zip(ann, exact)])`,
      },
      options: [
        'Recall must be computed with k = 100',
        'The "exact" results come from the same approximate index, and the queries are random rather than real embeddings',
        'np.mean cannot average Python floats',
        'Sets cannot hold numpy int64 values',
      ],
      correct: [1],
      explanation:
        'Ground truth must come from exact (flat) search; comparing an ANN index with itself at a larger k measures self-consistency, not recall. Random queries also misrepresent the real query distribution. The Python mechanics are fine.',
      followUps: [
        {
          q: 'Write the correct ground-truth line.',
          a: 'flat = faiss.IndexFlatL2(d); flat.add(xb); _, exact = flat.search(xq_real, 10), using a sample of real embedded user queries for xq_real.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-08',
      difficulty: 'hard',
      question: 'You are filling in the placeholders for a 2M-row pgvector table. Which values follow the documented starting points?',
      code: {
        language: 'sql',
        code: `-- table already loaded: 2,000,000 rows
CREATE INDEX ON chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = :lists);
SET ivfflat.probes = :probes;`,
      },
      options: [
        'lists = 100, probes = 1',
        'lists ≈ √2M ≈ 1,414, probes ≈ √1,414 ≈ 38',
        'lists = 2M, probes = 2M',
        'lists = 10, probes = 10',
      ],
      correct: [1],
      explanation:
        'pgvector suggests rows/1000 lists up to 1M rows and √rows above that, with probes starting at √lists. Too few lists means scanning huge lists; lists = rows defeats clustering; the defaults (probes 1) give poor recall.',
      followUps: [
        {
          q: 'What happens to latency if you set probes = lists?',
          a: 'Every list is scanned, so the query becomes an exact search over all vectors plus centroid overhead, i.e. slower than a sequential scan.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-09',
      difficulty: 'hard',
      question: 'Which statements about HNSW are true? (Select ALL that apply)',
      options: [
        'Search starts at an entry point in the top layer and descends greedily',
        'Layer 0 contains every vector',
        'Deleting a vector immediately removes it and repairs all links',
        'Memory grows with both vector dimension and M',
      ],
      correct: [0, 1, 3],
      explanation:
        'HNSW descends from a top-layer entry point, includes all nodes in layer 0, and stores vectors plus up to 2·M links per node. Deletes are typically tombstones repaired later by vacuum/compaction or rebuild.',
      followUps: [
        {
          q: 'Why might a tombstoned node still be useful?',
          a: 'It keeps graph connectivity: paths through it still lead to live neighbours, so removing it outright could strand parts of the graph.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-10',
      difficulty: 'medium',
      question: 'You have 60,000 chunks and 5 QPS. Which index choice is most sensible?',
      options: [
        'IVF-PQ with 65,536 lists',
        'Flat (exact) search, possibly with a small HNSW later if latency requires',
        'DiskANN on NVMe',
        'A GPU cluster',
      ],
      correct: [1],
      explanation:
        'At 60K vectors an exact scan takes a few milliseconds and gives perfect recall with no build or tuning. Complex indexes add training, memory and operational cost without benefit at this size.',
      followUps: [
        {
          q: 'Roughly how long does exact search over 60K × 1,536-d take on one core?',
          a: 'About 60K × 1,536 × 2 ≈ 184 MFLOP, so roughly 10 ms at ~20 GFLOP/s, which is fine for low QPS.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-11',
      difficulty: 'expert',
      question:
        'After switching to a new embedding model, an IVF-PQ index rebuilt with the OLD codebooks and centroids shows recall@10 = 0.35. Which explanations apply? (Select ALL that apply)',
      options: [
        'Centroids and PQ codebooks were trained on the old embedding space and do not partition or encode the new space well',
        'New vectors may be assigned to unbalanced lists, so nprobe covers the wrong regions',
        'PQ requires the embedding dimension to be a power of two',
        'Re-training IVF and PQ on a sample of new embeddings is required',
      ],
      correct: [0, 1, 3],
      explanation:
        'Trained structures are specific to a vector distribution; reusing them on a new model\'s embeddings breaks both list assignment and encoding, so re-training is mandatory. PQ needs the dimension divisible by m, not a power of two.',
      followUps: [
        {
          q: 'Does HNSW have the same problem after a model change?',
          a: 'It has no trained codebooks, but the graph is built from the old vectors, so you must re-embed and rebuild the index anyway; vectors from different models are never comparable.',
        },
      ],
    },
    {
      id: 'ann-search-mcq-12',
      difficulty: 'expert',
      question:
        'An HNSW index fits in RAM; p95 is 4 ms at efSearch 64 with recall 0.93. Product wants 0.97 without exceeding 10 ms. What is the best plan?',
      options: [
        'Sweep efSearch (e.g. 96, 128, 192) and choose the smallest meeting 0.97 under 10 ms; rebuild with higher M only if the sweep plateaus',
        'Rebuild immediately with M = 128',
        'Switch to IVF-PQ for better recall',
        'Reduce k to 3',
      ],
      correct: [0],
      explanation:
        'efSearch is the cheapest lever and needs no rebuild; latency typically grows sub-linearly, so 0.97 often fits within budget. M = 128 is excessive and costly; IVF-PQ usually has lower recall per ms; reducing k changes the product, not the index quality.',
      followUps: [
        {
          q: 'How do you make the result robust to traffic changes?',
          a: 'Load-test at peak QPS with the chosen efSearch, set an SLO alert on p95 and a nightly recall check, and keep the next step (higher M rebuild) ready.',
        },
      ],
    },
  ],
};

export default topic;
