// Practice "from scratch" drills (C4): graded TypeScript exercises whose tests run in the browser
// (src/lib/drillRunner.ts). Adapted from ai-engineering-from-scratch/practice (MIT, © 2026 Rohit Ghumare),
// ported from Python/numpy to plain TypeScript over number arrays.
//
// The list below is small and loads with the app (topic pages link their drill); each drill's body
// (problem, starter, solution, tests) is its own file, `./<id>.ts`, loaded on demand by loadDrill.
// tests/drills.test.ts checks that the list and the files match, every solution passes and every mutant fails.

export interface DrillMeta {
  id: string;
  title: string;
  /** one sentence for the list */
  summary: string;
  difficulty: 'easy' | 'medium' | 'hard';
  minutes: number;
  /** the topic in this app that teaches it; its Code Lab tab links here */
  topic: string;
}

/** A function the learner writes; the tests call it with plain arrays and numbers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrillFn = (...args: any[]) => any;

/** What a drill's tests get besides the learner's functions. Every check names a "why" that teaches. */
export interface DrillHarness {
  /** one named test: `fn` throws (via close / equal / ok) when it fails, and the learner sees `why` */
  check: (name: string, why: string, fn: () => void) => void;
  /** numbers or nested number arrays within `tol` (relative to the expected size, at least absolute) */
  close: (got: unknown, want: unknown, what: string, tol?: number) => void;
  /** deep equality (JSON) for ints, strings, lists and objects */
  equal: (got: unknown, want: unknown, what: string) => void;
  ok: (cond: unknown, message: string) => void;
  /** a seeded random generator in [0, 1), for property checks that must be repeatable */
  rng: (seed: number) => () => number;
}

export interface DrillBody {
  id: string;
  /** the function names the learner defines (kept from the starter) */
  entry: string[];
  /** markdown: task, input and output, constraints, examples */
  problem: string;
  /** TypeScript shown in the editor */
  starter: string;
  /** TypeScript reference; shown after every test passes or on an explicit "Show solution" */
  solution: string;
  /** a nudge first, the key idea last */
  hints: string[];
  /** markdown shown after passing: why it works, where it goes next */
  notes: string;
  /**
   * The checks. Self-contained: it may use only its two parameters and globals, because it is sent to the
   * worker as source text (Function#toString). Never reference a module-level constant from inside it.
   */
  tests: (sub: Record<string, DrillFn>, t: DrillHarness) => void;
}

export type Drill = DrillMeta & DrillBody;

export const DRILLS: DrillMeta[] = [
  { id: 'cosine-top-k', title: 'Cosine similarity top-k search', summary: 'Normalize embedding rows, score queries against documents with cosine similarity, and return the top k documents with a fixed tie rule.', difficulty: 'easy', minutes: 15, topic: 'embeddings' },
  { id: 'bm25', title: 'BM25 ranking', summary: 'Score tokenized documents with BM25: idf, term-frequency saturation with k1, length normalization with b, and a ranked list.', difficulty: 'medium', minutes: 25, topic: 'retrieval-fundamentals' },
  { id: 'reciprocal-rank-fusion', title: 'Reciprocal rank fusion', summary: 'Merge several ranked lists of document ids into one ranking with reciprocal rank fusion, optional list weights and a fixed tie rule.', difficulty: 'easy', minutes: 12, topic: 'reranking-fusion' },
  { id: 'bpe-merge-step', title: 'BPE pair counts and merges', summary: 'Count weighted adjacent pairs, pick the best pair with a fixed tie rule, merge it without overlap and train a BPE merge list.', difficulty: 'medium', minutes: 30, topic: 'transformers-tokenization' },
  { id: 'top-k-top-p-sampling', title: 'Temperature, top-k and top-p sampling', summary: 'Scale logits by temperature, keep the top k or the top p mass, renormalize, and draw one token with a seeded random source.', difficulty: 'medium', minutes: 30, topic: 'genai-fundamentals' },
  { id: 'softmax-cross-entropy', title: 'Stable softmax and cross-entropy', summary: 'Batched softmax, mean cross-entropy and its gradient, without overflow for large logits.', difficulty: 'easy', minutes: 20, topic: 'fine-tuning' },
  { id: 'scaled-dot-product-attention', title: 'Scaled dot-product attention with a mask', summary: 'softmax(QKᵀ/√d_k)·V with an optional boolean mask, plus the causal mask that a decoder uses.', difficulty: 'medium', minutes: 25, topic: 'transformer-internals' },
  { id: 'clip-contrastive-loss', title: 'CLIP contrastive loss', summary: 'Normalize image and text embeddings, build the temperature-scaled similarity matrix, and compute the symmetric InfoNCE loss and its gradient.', difficulty: 'medium', minutes: 30, topic: 'multimodal-vision' },
  { id: 'tool-call-parser', title: 'Tool-call parser', summary: 'Parse tool calls from a raw model reply and validate their arguments against a JSON Schema subset, with JSON-pointer error paths.', difficulty: 'hard', minutes: 50, topic: 'structured-outputs-tools' },
  { id: 'speculative-decoding-acceptance', title: 'Speculative decoding acceptance', summary: 'The min(1, p/q) acceptance rule and the residual distribution that keep speculative decoding exactly equal to the target model.', difficulty: 'hard', minutes: 35, topic: 'inference-optimization' },
];

export const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));
export const drillsForTopic = (topicId: string) => DRILLS.filter((d) => d.topic === topicId);

/** The full drill: its body loads as a small chunk of its own, only when a drill page opens. */
export async function loadDrill(id: string): Promise<Drill | undefined> {
  const meta = DRILL_BY_ID.get(id);
  // import.meta.glob is compiled by Vite; this function never runs in node (tests read the files directly)
  const load = import.meta.glob<{ default: DrillBody }>(['./*.ts', '!./index.ts'])[`./${id}.ts`];
  if (!meta || !load) return undefined;
  return { ...meta, ...(await load()).default };
}
