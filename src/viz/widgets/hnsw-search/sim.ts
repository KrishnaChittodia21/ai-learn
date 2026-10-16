// Pure, deterministic HNSW search on NPTS points in 2-D (no React, Node-testable).
// Graph: each node gets a level ℓ = ⌊−ln(U)·mL⌋ (mL = 1/ln 4, fixed seed, capped at 2) and is INSERTED one by one
// as in HNSW (Malkov & Yashunin, Alg. 1 + 4): greedy descent to its level, then on each of its layers a beam
// search (efConstruction = EF_CONSTRUCTION) finds candidates, and the neighbour-selection heuristic keeps up to M
// of them, skipping a candidate that is closer to an already-kept neighbour than to the new node. That heuristic
// keeps a few long "bridge" links between clusters, which plain nearest-M linking would lose (and with it the
// graph's connectivity). Links are bidirectional; a list over its cap (M, or 2M on layer 0 = M_max0) is re-pruned
// with the same heuristic.
// Search (Malkov & Yashunin, Alg. 2/5):
//   upper layers: greedy, ef = 1: hop to any neighbour closer to q until none is closer, then descend.
//   layer 0:      best-first beam search keeping the efSearch closest nodes found (W) and a candidate queue C;
//                 stop when the closest candidate is farther than the worst of W. Return the top K of W.
// Cost metric: DISTINCT vectors whose distance to q was computed (a node met again on a lower layer reuses its
// cached distance), compared with brute force, which computes all NPTS distances.
import type { BaseFrame } from '../../core';

export type QueryId = 'q1' | 'q2' | 'q3';

export interface Params {
  ef: number;
  M: number;
  query: QueryId;
}

export const DEFAULT_PARAMS: Params = { ef: 3, M: 3, query: 'q2' };
export const EF_MIN = 3;
export const EF_MAX = 24;
export const K = 3;
export const NPTS = 200;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Pt {
  x: number;
  y: number;
  level: number;
}

const SEED = 7;
export const POINTS: Pt[] = (() => {
  const r = mulberry(SEED);
  const mL = 1 / Math.log(4);
  const centres = [
    [0.22, 0.25],
    [0.75, 0.22],
    [0.3, 0.75],
    [0.78, 0.72],
  ];
  const pts: Pt[] = [];
  for (let i = 0; i < NPTS; i++) {
    const [cx, cy] = centres[i % 4];
    const ang = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * 0.22;
    const x = Math.min(0.97, Math.max(0.03, cx + Math.cos(ang) * rad));
    const y = Math.min(0.97, Math.max(0.03, cy + Math.sin(ang) * rad));
    const level = Math.min(2, Math.floor(-Math.log(1 - r()) * mL));
    pts.push({ x, y, level });
  }
  return pts;
})();
export const TOP = Math.max(...POINTS.map((p) => p.level));
export const ENTRY = POINTS.findIndex((p) => p.level === TOP);

export const QUERIES: Record<QueryId, { x: number; y: number; label: string }> = {
  q1: { x: 0.86, y: 0.8, label: 'Query A' },
  q2: { x: 0.18, y: 0.84, label: 'Query B' },
  q3: { x: 0.52, y: 0.42, label: 'Query C' },
};

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export const EF_CONSTRUCTION = 32;

/** HNSW neighbour-selection heuristic: candidates sorted nearest-first; keep c only if it is closer to `base`
 * than to every neighbour kept so far (so links spread out in different directions). */
function selectNeighbours(base: number, sortedCands: number[], m: number): number[] {
  const kept: number[] = [];
  for (const c of sortedCands) {
    if (kept.length >= m) break;
    const dc = dist(POINTS[c], POINTS[base]);
    if (kept.every((k) => dist(POINTS[c], POINTS[k]) > dc)) kept.push(c);
  }
  return kept;
}

/** beam search on one layer during construction; returns up to ef node ids, nearest first */
function searchLayer(target: number, entries: number[], ef: number, adj: number[][]): number[] {
  const dq = (i: number) => dist(POINTS[i], POINTS[target]);
  const seen = new Set(entries);
  const C = [...entries];
  let W = [...entries].sort((a, b) => dq(a) - dq(b));
  while (C.length) {
    C.sort((a, b) => dq(a) - dq(b));
    const c = C.shift()!;
    if (dq(c) > dq(W[W.length - 1])) break;
    for (const nb of adj[c]) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      if (W.length < ef || dq(nb) < dq(W[W.length - 1])) {
        C.push(nb);
        W = [...W, nb].sort((a, b) => dq(a) - dq(b) || a - b).slice(0, ef);
      }
    }
  }
  return W;
}

const graphCache = new Map<number, number[][][]>();

/** adjacency per layer (layers[l][i] = neighbour ids of node i on layer l), built by HNSW insertion */
export function buildGraph(M: number): number[][][] {
  const hit = graphCache.get(M);
  if (hit) return hit;
  const layers: number[][][] = Array.from({ length: TOP + 1 }, () => POINTS.map(() => [] as number[]));
  let entry = -1;
  let top = -1;
  POINTS.forEach((p, i) => {
    if (entry < 0) {
      entry = i;
      top = p.level;
      return;
    }
    let eps = [entry];
    for (let l = top; l > p.level; l--) eps = searchLayer(i, eps, 1, layers[l]).slice(0, 1);
    for (let l = Math.min(top, p.level); l >= 0; l--) {
      const W = searchLayer(i, eps, EF_CONSTRUCTION, layers[l]);
      const cap = l === 0 ? 2 * M : M;
      const nbs = selectNeighbours(i, W, M);
      layers[l][i] = nbs;
      for (const n of nbs) {
        const list = [...layers[l][n], i];
        layers[l][n] =
          list.length > cap ? selectNeighbours(n, list.sort((a, b) => dist(POINTS[n], POINTS[a]) - dist(POINTS[n], POINTS[b]) || a - b), cap) : list;
      }
      eps = W;
    }
    if (p.level > top) {
      entry = i;
      top = p.level;
    }
  });
  graphCache.set(M, layers);
  return layers;
}

export type Stage = 'intro' | 'entry' | 'greedy' | 'descend' | 'beam' | 'result' | 'brute' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  layer: number;
  current: number | null;
  /** nodes whose distance to q has been computed */
  visited: number[];
  /** hops taken (from → to, layer) */
  path: { a: number; b: number; l: number }[];
  /** layer-0 candidate queue (ids) */
  candidates: number[];
  /** layer-0 best-ef result set W (ids, nearest first) */
  results: number[];
  /** distance computations so far (all layers) */
  ndist: number;
  /** final top-K and ground truth (stage result+) */
  found: number[] | null;
  truth: number[] | null;
}

const f3 = (x: number) => x.toFixed(3);

export function simulate({ ef, M, query }: Params): Frame[] {
  const G = buildGraph(M);
  const q = QUERIES[query];
  const d = (i: number) => dist(POINTS[i], q);
  const frames: Frame[] = [];
  /** every node whose distance to q is known (computed once, then cached) */
  const visited = new Set<number>();
  let ndist = 0;
  const measure = (i: number) => {
    if (!visited.has(i)) {
      visited.add(i);
      ndist++;
    }
  };
  const path: Frame['path'] = [];
  const base = () => ({ ndist, visited: [...visited], path: [...path], candidates: [] as number[], results: [] as number[], found: null, truth: null });
  const push = (f: Partial<Frame> & { stage: Stage; caption: string; layer: number; current: number | null }) => frames.push({ ...base(), ...f } as Frame);
  const truth = POINTS.map((_, i) => i)
    .sort((a, b) => d(a) - d(b))
    .slice(0, K);
  const counts = [0, 1, 2].map((l) => POINTS.filter((p) => p.level >= l).length);

  push({
    stage: 'intro',
    layer: TOP,
    current: null,
    caption: `${NPTS} vectors in an HNSW graph with ${TOP + 1} layers: ${counts.slice(0, TOP + 1).map((c, l) => `layer ${l}: ${c} nodes`).reverse().join(', ')}. Upper layers are sparse "express lanes"; every node lives on layer 0. M = ${M} (layer 0 keeps up to ${2 * M} links).`,
  });

  let cur = ENTRY;
  measure(cur);
  push({
    stage: 'entry',
    layer: TOP,
    current: cur,
    caption: `${q.label} arrives. Search always starts at the single entry point on the top layer: node ${cur} (distance ${f3(d(cur))}).`,
    predict: `On the top layer we only greedily hop to closer neighbours. Which node will we stop at before descending?`,
  });
  for (let l = TOP; l >= 1; l--) {
    let improved = true;
    while (improved) {
      improved = false;
      let best = cur;
      for (const nb of G[l][cur]) {
        measure(nb);
        if (d(nb) < d(best)) best = nb;
      }
      if (best !== cur) {
        path.push({ a: cur, b: best, l });
        push({
          stage: 'greedy',
          layer: l,
          current: best,
          caption: `Layer ${l}: compare q with node ${cur}'s ${G[l][cur].length} neighbours; hop to node ${best} (distance ${f3(d(cur))} → ${f3(d(best))}).`,
        });
        cur = best;
        improved = true;
      }
    }
    push({
      stage: 'descend',
      layer: l - 1,
      current: cur,
      caption: `Layer ${l}: no neighbour of node ${cur} is closer, a local minimum. Drop down to layer ${l - 1} and continue from node ${cur}.`,
      predict:
        l === 1
          ? `Layer 0 runs a beam search keeping efSearch = ${ef} best nodes. ${ef === 1 ? 'With a beam of 1 it is pure greedy again: will it reach the true nearest neighbour?' : 'How many distance computations do you expect before it stops (brute force needs ' + NPTS + ')?'}`
          : undefined,
    });
  }

  // layer-0 beam search (its own visited set, as in HNSW's SEARCH-LAYER)
  const seen = new Set<number>([cur]);
  const C = new Set<number>([cur]);
  let W: number[] = [cur];
  const sortW = () => (W = W.sort((a, b) => d(a) - d(b)));
  const events: { c: number; added: number[]; stop: boolean }[] = [];
  while (C.size) {
    const c = [...C].sort((a, b) => d(a) - d(b))[0];
    C.delete(c);
    if (d(c) > d(W[W.length - 1])) {
      events.push({ c, added: [], stop: true });
      break;
    }
    const added: number[] = [];
    for (const nb of G[0][c]) {
      if (seen.has(nb)) continue;
      seen.add(nb);
      measure(nb);
      if (W.length < ef || d(nb) < d(W[W.length - 1])) {
        C.add(nb);
        W.push(nb);
        sortW();
        if (W.length > ef) W.pop();
        added.push(nb);
      }
    }
    events.push({ c, added, stop: false });
    const snapW = [...W];
    const snapC = [...C].sort((a, b) => d(a) - d(b));
    frames.push({
      ...base(),
      stage: 'beam',
      layer: 0,
      current: c,
      candidates: snapC,
      results: snapW,
      caption: `Layer 0: expand node ${c} (${G[0][c].length} links). ${added.length ? `Closer-than-worst neighbours join the beam: ${added.join(', ')}.` : 'No neighbour beats the current worst result.'} W = [${snapW.join(', ')}]; ${ndist} of ${NPTS} vectors measured so far.`,
    });
  }
  // compress if too many beam frames
  const beamIdx = frames.map((f, i) => (f.stage === 'beam' ? i : -1)).filter((i) => i >= 0);
  const budget = 22;
  if (beamIdx.length > budget) {
    const keepEvery = Math.ceil(beamIdx.length / budget);
    const drop = new Set(beamIdx.filter((_, k) => k % keepEvery !== keepEvery - 1 && k !== beamIdx.length - 1));
    const kept = frames.filter((_, i) => !drop.has(i));
    frames.length = 0;
    frames.push(...kept);
  }
  const lastC = events[events.length - 1];
  const found = W.slice(0, K);
  const hit = found.filter((x) => truth.includes(x)).length;
  push({
    stage: 'result',
    layer: 0,
    current: null,
    results: [...W],
    found,
    caption: `${lastC?.stop ? `Stop: the closest remaining candidate (node ${lastC.c}) is farther than the worst of W.` : 'Stop: the candidate queue is empty.'} Return the top ${K} of W: [${found.join(', ')}]. ${ndist} distinct distance computations in total.`,
    predict: `Brute force compares q with all ${NPTS} vectors. How many of the true ${K} nearest neighbours did HNSW return?`,
  });
  push({
    stage: 'brute',
    layer: 0,
    current: null,
    results: [...W],
    found,
    truth,
    caption: `Exact top ${K}: [${truth.join(', ')}]. Recall@${K} = ${hit}/${K} = ${(hit / K).toFixed(2)} using ${ndist} distance computations vs ${NPTS} for brute force (${Math.round((1 - ndist / NPTS) * 100)}% fewer).${hit < K ? ` Missed ${truth.filter((x) => !found.includes(x)).join(', ')}: the beam stopped in a local region before reaching it. Raise efSearch (wider beam) or M (more links).` : ''}`,
  });
  push({
    stage: 'done',
    layer: 0,
    current: null,
    results: [...W],
    found,
    truth,
    caption: `Trade-off: larger efSearch (query time) and M (memory, build time) raise recall but compute more distances. Here HNSW measured ${ndist} of ${NPTS} vectors; the saving grows with scale because hops grow ~log(N): at 10M vectors HNSW typically touches a few thousand nodes for ~95–99% recall. IVF instead scans only the nprobe nearest clusters.`,
  });
  return frames;
}
