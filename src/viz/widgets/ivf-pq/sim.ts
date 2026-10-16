// Pure, deterministic IVF (inverted file) + PQ (product quantization) search on NPTS points in 2-D.
// No React; Node-testable.
//
// IVF (Faiss IndexIVFFlat): train k-means with nlist centroids (deterministic farthest-point init, then LLOYD_ITERS
// Lloyd iterations), store every vector in the inverted list of its nearest centroid (a Voronoi cell). Query: compute
// the distance to all nlist centroids, probe the nprobe nearest lists and scan only their vectors.
// PQ (Faiss IndexIVFPQ, toy): split each vector into m = 2 sub-vectors (x | y), train a 1-D codebook of 2^TOY_BITS
// centroids per sub-space, store a vector as m codes. At query time build one lookup table per sub-space (squared
// distance from the query's sub-vector to each code) and score a vector by m table lookups (asymmetric distance:
// the query stays exact, only the database vector is quantized). Faiss quantizes the residual x − centroid by
// default; the toy quantizes raw coordinates so the code grid is easy to see.
// Re-rank (Faiss IndexRefineFlat): take the RERANK_K best by PQ distance and recompute exact distances.
// Cost metric: "vectors measured" = centroid distances + vectors scored in the probed lists, vs NPTS for brute force.
import { rng, type BaseFrame } from '../../core';

export type QueryId = 'qa' | 'qb' | 'qc';
export type Mode = 'flat' | 'pq';

export interface Params {
  nlist: number;
  nprobe: number;
  query: QueryId;
  mode: Mode;
  rerank: boolean;
}

export const NPTS = 200;
export const K = 3;
export const NLIST_MIN = 4;
export const NLIST_MAX = 16;
export const LLOYD_ITERS = 8;
/** toy PQ: m = 2 sub-spaces (x and y), 2^3 = 8 codes each */
export const TOY_M = 2;
export const TOY_BITS = 3;
export const TOY_CODES = 2 ** TOY_BITS;
/** re-rank depth k' = 4 × k */
export const RERANK_K = 4 * K;
/** realistic preset shown in the side panel */
export const REAL = { d: 1536, m: 96, nbits: 8 };
export const REAL_FLOAT_BYTES = REAL.d * 4; // 6,144
export const REAL_PQ_BYTES = (REAL.m * REAL.nbits) / 8; // 96
export const REAL_RATIO = REAL_FLOAT_BYTES / REAL_PQ_BYTES; // 64
/** max frames spent on scanning lists (larger nprobe scans several lists per frame) */
const SCAN_FRAMES = 8;

export const DEFAULT_PARAMS: Params = {
  nlist: 8,
  nprobe: 1,
  query: 'qa',
  mode: 'flat',
  rerank: true,
};

export interface Pt {
  x: number;
  y: number;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));

/** 200 points in 5 Gaussian clusters (Box–Muller), fixed seed */
export const POINTS: Pt[] = (() => {
  const r = rng(11);
  const centres: [number, number, number][] = [
    [0.22, 0.25, 0.085],
    [0.74, 0.22, 0.08],
    [0.5, 0.55, 0.075],
    [0.22, 0.78, 0.08],
    [0.8, 0.76, 0.08],
  ];
  const pts: Pt[] = [];
  for (let i = 0; i < NPTS; i++) {
    const [cx, cy, sd] = centres[i % centres.length];
    const u = Math.max(1e-9, r());
    const v = r();
    const rad = Math.sqrt(-2 * Math.log(u)) * sd;
    pts.push({
      x: clamp(cx + rad * Math.cos(2 * Math.PI * v)),
      y: clamp(cy + rad * Math.sin(2 * Math.PI * v)),
    });
  }
  return pts;
})();

export const QUERIES: Record<QueryId, Pt & { label: string }> = {
  qa: { x: 0.5, y: 0.2, label: 'Query A (near a border)' },
  qb: { x: 0.8, y: 0.76, label: 'Query B (cluster core)' },
  qc: { x: 0.76, y: 0.48, label: 'Query C (between clusters)' },
};

export interface Ivf {
  /** centroids after 0, 1, 2 and LLOYD_ITERS iterations */
  history: Pt[][];
  /** largest centroid move in each Lloyd iteration (moves[0] = iteration 1) */
  moves: number[];
  centroids: Pt[];
  /** assign[i] = list id of point i */
  assign: number[];
  lists: number[][];
  /** Voronoi cell of each centroid, clipped to the unit square */
  cells: Pt[][];
  /** colour slot (0..CELL_COLOURS-1) per cell; neighbouring cells get different slots where possible */
  colour: number[];
}

export const CELL_COLOURS = 5;

/** Welsh–Powell greedy colouring of the cell adjacency graph (cells that share a Voronoi edge) */
function colourCells(cells: Pt[][]): number[] {
  const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
  const adj = cells.map((c, j) => cells.map((o, k) => k !== j && c.filter((p) => o.some((q) => same(p, q))).length >= 2));
  const order = cells.map((_, j) => j).sort((a, b) => adj[b].filter(Boolean).length - adj[a].filter(Boolean).length || a - b);
  const col = cells.map(() => -1);
  for (const j of order) {
    const used = new Set(adj[j].flatMap((on, k) => (on && col[k] >= 0 ? [col[k]] : [])));
    let c = 0;
    while (used.has(c) && c < CELL_COLOURS - 1) c++;
    col[j] = c;
  }
  return col;
}

function nearest(p: Pt, cs: Pt[]): number {
  let best = 0;
  for (let j = 1; j < cs.length; j++) if (dist(p, cs[j]) < dist(p, cs[best])) best = j;
  return best;
}

/** clip a convex polygon to the half-plane of points closer to a than to b */
function clipHalf(poly: Pt[], a: Pt, b: Pt): Pt[] {
  // keep p with (p − m)·(b − a) ≤ 0, m = midpoint
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const s = (p: Pt) => (p.x - mx) * nx + (p.y - my) * ny;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = s(p);
    const sq = s(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return out;
}

const ivfCache = new Map<number, Ivf>();

export function buildIvf(nlist: number): Ivf {
  const hit = ivfCache.get(nlist);
  if (hit) return hit;
  // farthest-point init from point 0 (deterministic stand-in for k-means++)
  let cs: Pt[] = [POINTS[0]];
  while (cs.length < nlist) {
    let far = 0;
    let farD = -1;
    POINTS.forEach((p, i) => {
      const d = Math.min(...cs.map((c) => dist(p, c)));
      if (d > farD) {
        farD = d;
        far = i;
      }
    });
    cs.push(POINTS[far]);
  }
  cs = cs.map((c) => ({ x: c.x, y: c.y }));
  const history: Pt[][] = [cs];
  const moves: number[] = [];
  for (let it = 1; it <= LLOYD_ITERS; it++) {
    const asg = POINTS.map((p) => nearest(p, cs));
    const prev = cs;
    cs = cs.map((c, j) => {
      const mine = POINTS.filter((_, i) => asg[i] === j);
      return mine.length
        ? {
            x: mine.reduce((s, p) => s + p.x, 0) / mine.length,
            y: mine.reduce((s, p) => s + p.y, 0) / mine.length,
          }
        : c;
    });
    moves.push(Math.max(...cs.map((c, j) => dist(c, prev[j]))));
    if (it === 1 || it === 2 || it === LLOYD_ITERS) history.push(cs);
  }
  const assign = POINTS.map((p) => nearest(p, cs));
  const lists = cs.map((_, j) => POINTS.map((_, i) => i).filter((i) => assign[i] === j));
  const box: Pt[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const cells = cs.map((c, j) => cs.reduce((poly, o, k) => (k === j || poly.length === 0 ? poly : clipHalf(poly, c, o)), box));
  const res = {
    history,
    moves,
    centroids: cs,
    assign,
    lists,
    cells,
    colour: colourCells(cells),
  };
  ivfCache.set(nlist, res);
  return res;
}

export interface Pq {
  /** 1-D codebooks: cx[code], cy[code], sorted ascending */
  cx: number[];
  cy: number[];
  /** codes[i] = [x code, y code] */
  codes: [number, number][];
}

function kmeans1d(vals: number[], k: number): number[] {
  const s = [...vals].sort((a, b) => a - b);
  let c = Array.from({ length: k }, (_, j) => s[Math.floor(((j + 0.5) / k) * s.length)]);
  for (let it = 0; it < 15; it++) {
    const sum = c.map(() => 0);
    const n = c.map(() => 0);
    for (const v of s) {
      let b = 0;
      for (let j = 1; j < k; j++) if (Math.abs(v - c[j]) < Math.abs(v - c[b])) b = j;
      sum[b] += v;
      n[b]++;
    }
    c = c.map((cj, j) => (n[j] ? sum[j] / n[j] : cj));
  }
  return c.sort((a, b) => a - b);
}

let pqCache: Pq | null = null;
export function buildPq(): Pq {
  if (pqCache) return pqCache;
  const cx = kmeans1d(
    POINTS.map((p) => p.x),
    TOY_CODES,
  );
  const cy = kmeans1d(
    POINTS.map((p) => p.y),
    TOY_CODES,
  );
  const near1 = (v: number, c: number[]) => c.reduce((b, cj, j) => (Math.abs(v - cj) < Math.abs(v - c[b]) ? j : b), 0);
  const codes = POINTS.map((p) => [near1(p.x, cx), near1(p.y, cy)] as [number, number]);
  pqCache = { cx, cy, codes };
  return pqCache;
}

export type Stage =
  'data' | 'init' | 'lloyd' | 'lists' | 'query' | 'rank' | 'select' | 'codebook' | 'encode' | 'lut' | 'scan' | 'result' | 'rerank' | 'brute' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** which centroid snapshot to draw (index into Ivf.history) */
  hist: number;
  /** show Voronoi cells / colour points by list */
  showCells: boolean;
  /** centroid ids nearest-first (once ranked) */
  ranking: number[];
  /** lists chosen for probing */
  probed: number[];
  /** lists already scanned */
  scanned: number[];
  /** vectors scored so far in scanned lists */
  scannedPts: number[];
  /** centroid distances computed */
  ncent: number;
  /** current running top (by exact distance in flat mode, PQ distance in PQ mode) */
  top: number[];
  /** PQ candidates kept for re-ranking (k' best by PQ distance) */
  candidates: number[];
  /** exact distances recomputed during re-rank */
  nrerank: number;
  /** show the PQ code grid / reconstructions / lookup table */
  pqGrid: boolean;
  pqRecon: boolean;
  lut: boolean;
  found: number[] | null;
  truth: number[] | null;
}

const f3 = (x: number) => x.toFixed(3);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** exact top-k of all points (ground truth) */
export function exactTopK(q: Pt, k = K): number[] {
  return POINTS.map((_, i) => i)
    .sort((a, b) => dist(POINTS[a], q) - dist(POINTS[b], q) || a - b)
    .slice(0, k);
}

/** PQ (ADC) squared distance via the two lookup tables */
export function pqDist2(i: number, q: Pt): number {
  const { cx, cy, codes } = buildPq();
  const [a, b] = codes[i];
  return (q.x - cx[a]) ** 2 + (q.y - cy[b]) ** 2;
}

/** summary numbers for a parameter set (also used by tests) */
export function outcome({ nlist, nprobe, query, mode, rerank }: Params) {
  const ivf = buildIvf(nlist);
  const q = QUERIES[query];
  const ranking = ivf.centroids.map((_, j) => j).sort((a, b) => dist(ivf.centroids[a], q) - dist(ivf.centroids[b], q) || a - b);
  const probed = ranking.slice(0, Math.min(nprobe, nlist));
  const scanned = probed.flatMap((j) => ivf.lists[j]);
  const exact = (i: number) => dist(POINTS[i], q);
  const byExact = (ids: number[]) => [...ids].sort((a, b) => exact(a) - exact(b) || a - b);
  const byPq = (ids: number[]) => [...ids].sort((a, b) => pqDist2(a, q) - pqDist2(b, q) || a - b);
  const truth = exactTopK(q);
  const flatFound = byExact(scanned).slice(0, K);
  const cands = byPq(scanned).slice(0, RERANK_K);
  const pqFound = cands.slice(0, K);
  const rerankFound = byExact(cands).slice(0, K);
  const found = mode === 'flat' ? flatFound : rerank ? rerankFound : pqFound;
  const rec = (f: number[]) => f.filter((x) => truth.includes(x)).length;
  return {
    ranking,
    probed,
    scanned,
    truth,
    found,
    cands,
    flatFound,
    pqFound,
    rerankFound,
    recall: rec(found),
    recallFlat: rec(flatFound),
    recallPq: rec(pqFound),
    recallRerank: rec(rerankFound),
    measured: nlist + scanned.length,
  };
}

export function simulate(params: Params): Frame[] {
  const nlist = Math.max(NLIST_MIN, Math.min(NLIST_MAX, Math.round(params.nlist)));
  const nprobe = Math.max(1, Math.min(nlist, Math.round(params.nprobe)));
  const { query, mode, rerank } = params;
  const pq = mode === 'pq';
  const ivf = buildIvf(nlist);
  const P = buildPq();
  const q = QUERIES[query];
  const o = outcome({ nlist, nprobe, query, mode, rerank });
  const exact = (i: number) => dist(POINTS[i], q);
  const frames: Frame[] = [];
  const base: Omit<Frame, 'caption' | 'stage'> = {
    hist: ivf.history.length - 1,
    showCells: false,
    ranking: [],
    probed: [],
    scanned: [],
    scannedPts: [],
    ncent: 0,
    top: [],
    candidates: [],
    nrerank: 0,
    pqGrid: false,
    pqRecon: false,
    lut: false,
    found: null,
    truth: null,
  };
  let state = { ...base };
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => {
    state = { ...state, ...f, predict: undefined } as Frame;
    frames.push({ ...state, predict: f.predict } as Frame);
  };
  const sizes = ivf.lists.map((l) => l.length);

  // ---------------- training
  push({
    stage: 'data',
    hist: 0,
    caption: `${NPTS} vectors (2-D here, 768–1,536-D in practice). Brute force would compute all ${NPTS} distances for every query; IVF first groups them into nlist = ${nlist} lists with k-means.`,
  });
  push({
    stage: 'init',
    hist: 0,
    caption: `k-means initialisation: ${nlist} starting centroids, each picked as the vector farthest from those already chosen, so they spread over the data.`,
  });
  push({
    stage: 'lloyd',
    hist: 1,
    showCells: true,
    caption: `Lloyd iteration 1: assign every vector to its nearest centroid, then move each centroid to the mean of its vectors (largest move ${f3(ivf.moves[0])}).`,
  });
  push({
    stage: 'lloyd',
    hist: 2,
    showCells: true,
    caption: `Iteration 2: the centroids keep sliding toward the cluster centres (largest move ${f3(ivf.moves[1])}); the cell borders shift with them.`,
  });
  push({
    stage: 'lloyd',
    hist: 3,
    showCells: true,
    caption: `After ${LLOYD_ITERS} iterations the centroids have settled (${ivf.moves[LLOYD_ITERS - 1] < 5e-4 ? `converged: iteration ${LLOYD_ITERS} moved no centroid` : `iteration ${LLOYD_ITERS} moved them at most ${f3(ivf.moves[LLOYD_ITERS - 1])}`}). Each centroid owns a Voronoi cell: every point closer to it than to any other centroid.`,
  });
  push({
    stage: 'lists',
    showCells: true,
    caption: `Inverted lists: each vector is stored in its cell's list. List sizes range from ${Math.min(...sizes)} to ${Math.max(...sizes)} (mean ${(NPTS / nlist).toFixed(1)}). This is the index; training is done.`,
  });

  // ---------------- query
  const truthCells = [...new Set(o.truth.map((t) => ivf.assign[t]))];
  push({
    stage: 'query',
    showCells: true,
    caption: `${q.label} arrives. IVF never looks at all ${NPTS} vectors: it will compare q with the ${nlist} centroids and scan only the nprobe = ${nprobe} nearest ${nprobe === 1 ? 'list' : 'lists'}.`,
    predict: `Its 3 nearest neighbours may not all live in the cell that contains q. With nprobe = ${nprobe}, will IVF find all 3?`,
  });
  const r0 = o.ranking;
  push({
    stage: 'rank',
    showCells: true,
    ranking: r0,
    ncent: nlist,
    caption: `Step 1, coarse search: ${nlist} centroid distances. Nearest: c${r0[0]} (${f3(dist(ivf.centroids[r0[0]], q))}), then c${r0[1]} (${f3(dist(ivf.centroids[r0[1]], q))}), c${r0[2]} (${f3(dist(ivf.centroids[r0[2]], q))}).`,
  });
  const probedPts = o.probed.reduce((s, j) => s + sizes[j], 0);
  push({
    stage: 'select',
    showCells: true,
    probed: o.probed,
    caption: `Probe the nprobe = ${nprobe} nearest ${nprobe === 1 ? 'list' : 'lists'} (${o.probed
      .slice(0, 5)
      .map((j) => 'c' + j)
      .join(
        ', ',
      )}${nprobe > 5 ? ', …' : ''}): ${probedPts} of ${NPTS} vectors. ${nlist === nprobe ? 'Every list is scanned: this is brute force plus the centroid overhead.' : nlist - nprobe === 1 ? 'The remaining list is never touched.' : `The other ${nlist - nprobe} lists are never touched.`}`,
  });

  // ---------------- PQ setup
  if (pq) {
    push({
      stage: 'codebook',
      showCells: true,
      pqGrid: true,
      caption: `Product quantization (toy, m = ${TOY_M}): split each vector into sub-vectors x | y and train a codebook of ${TOY_CODES} centroids per sub-space (${TOY_BITS}-bit codes). Real setup: d = ${REAL.d.toLocaleString('en-US')} split into m = ${REAL.m} sub-vectors of ${REAL.d / REAL.m} dims, 256 codes each.`,
      predict: `A ${REAL.d.toLocaleString('en-US')}-d float32 vector takes ${REAL_FLOAT_BYTES.toLocaleString('en-US')} bytes. Stored as m = ${REAL.m} codes of ${REAL.nbits} bits, how many bytes, and how many times smaller?`,
    });
    push({
      stage: 'encode',
      showCells: true,
      pqGrid: true,
      pqRecon: true,
      caption: `Encode: each vector is replaced by its nearest code per sub-space (squares = reconstructions). Toy: ${TOY_M} codes × ${TOY_BITS} bits = ${TOY_M * TOY_BITS} bits. Real: ${REAL.m} × ${REAL.nbits} bits = ${REAL_PQ_BYTES} B vs ${REAL_FLOAT_BYTES.toLocaleString('en-US')} B float32, ${REAL_RATIO}× smaller.`,
    });
    const lx = P.cx.map((c) => (q.x - c) ** 2);
    const ly = P.cy.map((c) => (q.y - c) ** 2);
    const bx = lx.indexOf(Math.min(...lx));
    const by = ly.indexOf(Math.min(...ly));
    push({
      stage: 'lut',
      showCells: true,
      pqGrid: true,
      pqRecon: true,
      lut: true,
      caption: `Asymmetric distance: q stays exact. Precompute ${TOY_M} lookup tables of ${TOY_CODES} squared distances (q.x to each x-code, q.y to each y-code); closest codes are x${bx} and y${by}. Scoring a vector is now ${TOY_M} lookups + 1 add (real: ${REAL.m} lookups, no ${REAL.d.toLocaleString('en-US')}-d maths).`,
    });
  }

  // ---------------- scan probed lists (chunked so the scan takes ≤ SCAN_FRAMES frames)
  const chunk = Math.ceil(o.probed.length / SCAN_FRAMES);
  const scannedLists: number[] = [];
  const scannedPts: number[] = [];
  const score = (i: number) => (pq ? pqDist2(i, q) : exact(i));
  for (let s = 0; s < o.probed.length; s += chunk) {
    const part = o.probed.slice(s, s + chunk);
    scannedLists.push(...part);
    const newPts = part.flatMap((j) => ivf.lists[j]);
    scannedPts.push(...newPts);
    const top = [...scannedPts].sort((a, b) => score(a) - score(b) || a - b).slice(0, K);
    const listDesc = part.map((j) => `c${j} (${sizes[j]})`).join(', ');
    push({
      stage: 'scan',
      showCells: true,
      pqGrid: pq,
      pqRecon: pq,
      lut: pq,
      scanned: [...scannedLists],
      scannedPts: [...scannedPts],
      top,
      caption: `Scan ${part.length === 1 ? 'list' : 'lists'} ${listDesc}: ${pq ? `${newPts.length} PQ codes scored by table lookup` : `${newPts.length} exact distances`}. Best ${K} so far: [${top.join(', ')}]; ${nlist + scannedPts.length} of ${NPTS} vectors measured (${nlist} centroids + ${scannedPts.length} in lists).`,
    });
  }

  const missed = o.truth.filter((t) => !o.found.includes(t));
  const flatMissed = o.truth.filter((t) => !o.flatFound.includes(t));
  if (!pq) {
    push({
      stage: 'result',
      showCells: true,
      top: o.flatFound,
      found: o.flatFound,
      caption: `Return the top ${K} of the ${o.scanned.length} scanned vectors: [${o.flatFound.join(', ')}]. Distances inside the probed lists are exact, so any error comes only from lists that were skipped.`,
      predict: `Brute force compares q with all ${NPTS} vectors. How many of the true ${K} nearest neighbours did IVF return?`,
    });
  } else {
    push({
      stage: 'result',
      showCells: true,
      pqGrid: true,
      pqRecon: true,
      lut: true,
      top: o.pqFound,
      candidates: o.cands,
      caption: `By PQ distance the top ${K} are [${o.pqFound.join(', ')}], but vectors that share a code square get identical PQ distances, so this ranking is only approximate. The ${o.cands.length} best by PQ distance (k′ = 4 × k = ${RERANK_K}) are kept as candidates.`,
      predict: rerank
        ? `Re-ranking recomputes exact distances for just these ${o.cands.length} candidates. Will that recover the true top ${K}?`
        : `PQ distances are approximate. How many of the true ${K} neighbours survive without re-ranking?`,
    });
    if (rerank) {
      push({
        stage: 'rerank',
        showCells: true,
        pqGrid: true,
        pqRecon: true,
        lut: true,
        top: o.rerankFound,
        candidates: o.cands,
        nrerank: o.cands.length,
        found: o.rerankFound,
        caption: `Re-rank: fetch the ${o.cands.length} full vectors and compute exact distances (${o.cands.length} extra, vs ${NPTS} for brute force). New top ${K}: [${o.rerankFound.join(', ')}]${o.rerankFound.join() === o.pqFound.join() ? ', the same order PQ gave' : `, replacing PQ's [${o.pqFound.join(', ')}]`}.`,
      });
    } else {
      state = { ...state, found: o.pqFound };
    }
  }

  const measured = o.measured;
  const pct = Math.round((1 - measured / NPTS) * 100);
  const cost =
    measured < NPTS
      ? `${measured} of ${NPTS} vectors measured (${pct}% fewer than brute force)`
      : `${measured} vectors measured, ${measured - NPTS} more than brute force's ${NPTS}: probing almost every list adds the ${nlist} centroid checks on top`;
  let why = '';
  if (missed.length) {
    const m0 = missed[0];
    const cell = ivf.assign[m0];
    const rank = o.ranking.indexOf(cell) + 1;
    if (flatMissed.includes(m0)) {
      why = ` Missed ${m0}: it sits just across the border in list c${cell}, the ${rank === 2 ? '2nd' : rank === 3 ? '3rd' : rank + 'th'}-nearest centroid, so nprobe = ${rank} would find it.`;
    } else {
      why = ` Missed ${missed.join(', ')}: ${pq && !rerank ? 'it was in a probed list but PQ ranked it too low; turn re-rank on.' : `it was not among the ${RERANK_K} PQ candidates.`}`;
    }
  }
  const pqNote = pq
    ? ` PQ alone: ${o.recallPq}/${K}; ${rerank ? `after re-rank: ${o.recallRerank}/${K}` : `with re-rank it would be ${o.recallRerank}/${K}`}; IVF-Flat with the same lists: ${o.recallFlat}/${K}.`
    : '';
  push({
    stage: 'brute',
    showCells: true,
    found: o.found,
    truth: o.truth,
    caption: `Exact top ${K}: [${o.truth.join(', ')}] (in ${plural(truthCells.length, 'list')}). Recall@${K} = ${o.recall}/${K} with ${cost}.${why}${pqNote}`,
  });
  push({
    stage: 'done',
    showCells: true,
    found: o.found,
    truth: o.truth,
    caption: pq
      ? `IVF-PQ: nprobe trades speed for recall, PQ shrinks each vector ${REAL_RATIO}× (${REAL_PQ_BYTES} B instead of ${REAL_FLOAT_BYTES.toLocaleString('en-US')} B at d = ${REAL.d.toLocaleString('en-US')}), and re-ranking k′ = 4–10 × k candidates with full vectors buys back the recall PQ loses.`
      : `nprobe is the query-time knob: here ${nprobe} of ${nlist} lists gave recall ${o.recall}/${K}. At scale use nlist ≈ √N to 4√N and start nprobe near √nlist; pgvector's default probes = 1 is exactly this border-miss risk.`,
  });
  return frames;
}
