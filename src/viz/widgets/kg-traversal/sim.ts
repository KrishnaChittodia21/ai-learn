// Pure, deterministic multi-hop traversal over a small knowledge graph (no React, Node-testable).
// Question (the lesson's supply-chain example): "Which of our suppliers depend on a factory in a sanctioned region?"
// The answer is a 3-hop path: Us ← SUPPLIES ← BoltCo → SOURCES_FROM → Factory-17 → LOCATED_IN → Region-X.
// NutCorp's chain is an illustrative extra so the walk has a branch that ends in a non-sanctioned region.
import type { BaseFrame } from '../../core';

export type Strategy = 'graph' | 'vector';

export interface Params {
  strategy: Strategy;
  /** hop budget for the traversal */
  maxHops: number;
}

export const DEFAULT_PARAMS: Params = { strategy: 'graph', maxHops: 3 };
export const MAX_HOPS = 3;

export const QUESTION = 'Which of our suppliers depend on a factory in a sanctioned region?';

export type NodeId = 'Us' | 'BoltCo' | 'NutCorp' | 'Ana' | 'Factory-17' | 'Factory-9' | 'Region-X' | 'Region-Y';
export type Rel = 'SUPPLIES' | 'SOURCES_FROM' | 'LOCATED_IN' | 'WORKS_AT';

export const NODES: { id: NodeId; type: string; status?: 'sanctioned' | 'clear' }[] = [
  { id: 'Us', type: 'Organization' },
  { id: 'BoltCo', type: 'Organization' },
  { id: 'NutCorp', type: 'Organization' },
  { id: 'Ana', type: 'Person' },
  { id: 'Factory-17', type: 'Facility' },
  { id: 'Factory-9', type: 'Facility' },
  { id: 'Region-X', type: 'Region', status: 'sanctioned' },
  { id: 'Region-Y', type: 'Region', status: 'clear' },
];

export interface Edge {
  s: NodeId;
  p: Rel;
  o: NodeId;
}

export const EDGES: Edge[] = [
  { s: 'BoltCo', p: 'SUPPLIES', o: 'Us' },
  { s: 'NutCorp', p: 'SUPPLIES', o: 'Us' },
  { s: 'Ana', p: 'WORKS_AT', o: 'BoltCo' },
  { s: 'BoltCo', p: 'SOURCES_FROM', o: 'Factory-17' },
  { s: 'NutCorp', p: 'SOURCES_FROM', o: 'Factory-9' },
  { s: 'Factory-17', p: 'LOCATED_IN', o: 'Region-X' },
  { s: 'Factory-9', p: 'LOCATED_IN', o: 'Region-Y' },
];

/** the query pattern: which relation each hop follows, and in which direction from the frontier */
export const PATTERN: { p: Rel; dir: 'in' | 'out' }[] = [
  { p: 'SUPPLIES', dir: 'in' },
  { p: 'SOURCES_FROM', dir: 'out' },
  { p: 'LOCATED_IN', dir: 'out' },
];

export const edgeKey = (e: Edge) => `${e.s}-${e.p}-${e.o}`;

export type Stage = 'intro' | 'hop' | 'check' | 'answer' | 'retrieve';

export interface Frame extends BaseFrame {
  stage: Stage;
  hop: number;
  /** nodes reached so far */
  visited: NodeId[];
  /** nodes reached on this hop */
  frontier: NodeId[];
  /** edges walked so far */
  walked: string[];
  /** edges looked at and ignored (relation not in the pattern) */
  ignored: string[];
  /** the evidence path, once found */
  path: string[];
  answer: NodeId[] | null;
  /** vector mode: retrieved chunks */
  chunks: { text: string; score: number; kept: boolean }[];
}

export const VECTOR_CHUNKS = [
  { text: 'BoltCo supply contract (BoltCo supplies Us, sources from Factory-17)', score: 0.81, kept: true },
  { text: 'Registry entry: Factory-17 located in Region-X', score: 0.42, kept: false },
];

const statusOf = (id: NodeId) => NODES.find((n) => n.id === id)?.status;

/** one hop of the traversal from `frontier`, following PATTERN[hop] */
export function step(frontier: NodeId[], hop: number) {
  const { p, dir } = PATTERN[hop];
  const next: NodeId[] = [];
  const walked: Edge[] = [];
  const ignored: Edge[] = [];
  for (const n of frontier)
    for (const e of EDGES) {
      const touches = dir === 'in' ? e.o === n : e.s === n;
      const other = dir === 'in' ? e.s : e.o;
      if (e.p === p && touches) {
        walked.push(e);
        next.push(other);
      } else if ((e.s === n || e.o === n) && e.p !== p && !PATTERN.slice(0, hop).some((q) => q.p === e.p)) ignored.push(e);
    }
  return { next, walked, ignored };
}

export function simulate({ strategy, maxHops }: Params): Frame[] {
  const hops = Math.max(1, Math.min(MAX_HOPS, Math.round(maxHops)));
  const frames: Frame[] = [];
  const blank = { hop: 0, visited: [] as NodeId[], frontier: [] as NodeId[], walked: [] as string[], ignored: [] as string[], path: [] as string[], answer: null, chunks: [] };

  if (strategy === 'vector') {
    frames.push({
      stage: 'intro',
      ...blank,
      caption: `Question: "${QUESTION}" Plain vector RAG embeds the question and pulls the most similar chunks.`,
      predict: 'The facts are spread over a contract and a registry entry. Will similarity search bring back both?',
    });
    frames.push({
      stage: 'retrieve',
      ...blank,
      chunks: VECTOR_CHUNKS,
      caption: 'The BoltCo contract is similar to the question (0.81) and is retrieved. The registry entry linking Factory-17 to Region-X scores 0.42: it shares almost no words with the question, so it is left out.',
    });
    frames.push({
      stage: 'answer',
      ...blank,
      chunks: VECTOR_CHUNKS,
      answer: [],
      caption: 'Answer: "no suppliers found". The fact chain was spread across 3 documents and no single chunk contained it. Switch to graph traversal to walk the chain instead.',
    });
    return frames;
  }

  const visited: NodeId[] = ['Us'];
  const walked: Edge[] = [];
  const ignored: Edge[] = [];
  const snap = (stage: Stage, hop: number, frontier: NodeId[], caption: string, extra: Partial<Frame> = {}): Frame => ({
    ...blank,
    stage,
    hop,
    visited: [...visited],
    frontier,
    walked: walked.map(edgeKey),
    ignored: ignored.map(edgeKey),
    caption,
    ...extra,
  });

  frames.push(
    snap('intro', 0, ['Us'], `Question: "${QUESTION}" Entity linking maps "our" to the node Us: the seed. The query pattern is Us ← SUPPLIES ← supplier → SOURCES_FROM → factory → LOCATED_IN → region {status: sanctioned}. Hop budget: ${hops}.`, {
      predict: 'How many hops away from Us is the fact that decides the answer?',
    }),
  );

  let frontier: NodeId[] = ['Us'];
  const desc = [
    'Hop 1 follows SUPPLIES edges into Us: BoltCo and NutCorp are suppliers.',
    'Hop 2 follows SOURCES_FROM out of each supplier: BoltCo → Factory-17, NutCorp → Factory-9. Ana WORKS_AT BoltCo is not in the pattern, so the walk ignores it.',
    'Hop 3 follows LOCATED_IN out of each factory: Factory-17 → Region-X, Factory-9 → Region-Y.',
  ];
  for (let h = 0; h < hops; h++) {
    const r = step(frontier, h);
    walked.push(...r.walked);
    ignored.push(...r.ignored);
    frontier = r.next;
    visited.push(...frontier);
    frames.push(snap('hop', h + 1, [...frontier], desc[h]));
  }

  if (hops < PATTERN.length) {
    frames.push(
      snap('answer', hops, [], `Hop budget reached after ${hops} hop${hops === 1 ? '' : 's'}: the walk never reaches a region, so it cannot check the sanctions status. Answer: "no suppliers found". This chain needs ${PATTERN.length} hops.`, {
        answer: [],
      }),
    );
    return frames;
  }

  const hit = frontier.filter((r) => statusOf(r) === 'sanctioned');
  frames.push(snap('check', hops, hit, `Check the regions: Region-X has status "sanctioned", Region-Y does not. Walk back along the edges that led to Region-X.`));
  // walk back from the sanctioned region(s) to the suppliers
  const path: Edge[] = [];
  let back: NodeId[] = hit;
  for (let h = PATTERN.length - 1; h >= 0; h--) {
    const es = walked.filter((e) => e.p === PATTERN[h].p && back.includes(PATTERN[h].dir === 'in' ? e.s : e.o));
    path.push(...es);
    back = es.map((e) => (PATTERN[h].dir === 'in' ? e.o : e.s));
  }
  const suppliers = [...new Set(path.filter((e) => e.p === 'SUPPLIES').map((e) => e.s))];
  frames.push(
    snap('answer', hops, [], `Answer: ${suppliers.join(', ')}, with the path as evidence: Us ← SUPPLIES ← BoltCo → SOURCES_FROM → Factory-17 → LOCATED_IN → Region-X. A graph database returns this in about 20 ms, and every hop is an explainable fact.`, {
      path: path.map(edgeKey),
      answer: suppliers,
    }),
  );
  return frames;
}
