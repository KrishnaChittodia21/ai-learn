// Pure, deterministic chunking of a short policy document (no React, Node-testable).
// For readability 1 word = 1 token here (real BPE tokenizers average ~0.75 words per token).
// fixed:     window of `size` tokens, next window starts `size − overlap` tokens later, regardless of sentences.
// recursive: LangChain-style RecursiveCharacterTextSplitter on separators [paragraph, sentence, word]:
//            split by the coarsest separator, keep pieces that fit, recurse into pieces that are too big,
//            then greedily merge adjacent small pieces up to `size`, carrying trailing whole pieces
//            (≤ overlap tokens) into the next chunk as overlap.
import type { BaseFrame } from '../../core';

export type Strategy = 'fixed' | 'recursive';

export interface Params {
  strategy: Strategy;
  size: number;
  overlap: number;
}

export const DEFAULT_PARAMS: Params = { strategy: 'fixed', size: 40, overlap: 10 };
export const SIZE_MIN = 20;
export const SIZE_MAX = 50;

export const PARAGRAPHS = [
  'Acme Cloud offers refunds on annual plans within 30 days of purchase. Monthly plans are not refundable, but you can cancel at any time and keep access until the end of the billing period. To request a refund, open the billing page and choose Request refund. Refunds go back to the original payment method within 5 to 10 business days.',
  'Enterprise contracts follow the terms in the signed order form. If the order form does not mention refunds, the standard 30 day policy applies. Credits for service outages are calculated separately under the service level agreement. An outage credit is 10 percent of the monthly fee for every hour below 99.9 percent uptime, capped at 50 percent.',
  'Accounts closed for abuse are never refunded. Chargebacks filed with a bank suspend the account until the dispute is resolved. For questions, contact billing support, which answers within one business day. Support cannot change prices, but it can apply coupons that sales has approved in writing.',
];

export interface Word {
  w: string;
  sentence: number;
  para: number;
}

export const WORDS: Word[] = (() => {
  const out: Word[] = [];
  let s = 0;
  PARAGRAPHS.forEach((p, pi) => {
    for (const w of p.split(' ')) {
      out.push({ w, sentence: s, para: pi });
      if (w.endsWith('.')) s++;
    }
  });
  return out;
})();
export const N = WORDS.length;
export const SENTENCES: { s: number; e: number }[] = (() => {
  const r: { s: number; e: number }[] = [];
  WORDS.forEach((w, i) => {
    if (!r[w.sentence]) r[w.sentence] = { s: i, e: i + 1 };
    else r[w.sentence].e = i + 1;
  });
  return r;
})();
/** the sentence that answers the test question */
export const QUESTION = 'How big is the outage credit per hour?';
export const ANSWER_SENTENCE = SENTENCES.findIndex((r) => WORDS[r.s].w === 'An' && WORDS[r.s + 1].w === 'outage');

export interface Chunk {
  s: number;
  e: number;
}

export function clampOverlap(size: number, overlap: number) {
  return Math.max(0, Math.min(overlap, Math.floor(size / 2)));
}

export function fixedChunks(size: number, overlap: number): Chunk[] {
  const step = size - overlap;
  const out: Chunk[] = [];
  for (let s = 0; ; s += step) {
    const e = Math.min(N, s + size);
    out.push({ s, e });
    if (e >= N) break;
  }
  return out;
}

type Unit = Chunk;
function units(r: Chunk, level: number): Unit[] {
  if (level === 2) return Array.from({ length: r.e - r.s }, (_, k) => ({ s: r.s + k, e: r.s + k + 1 }));
  const key = (i: number) => (level === 0 ? WORDS[i].para : WORDS[i].sentence);
  const out: Unit[] = [];
  for (let i = r.s; i < r.e; i++) {
    if (i === r.s || key(i) !== key(i - 1)) out.push({ s: i, e: i + 1 });
    else out[out.length - 1].e = i + 1;
  }
  return out;
}
const len = (u: Unit) => u.e - u.s;
function merge(us: Unit[], size: number, overlap: number): Chunk[] {
  const out: Chunk[] = [];
  let cur: Unit[] = [];
  let total = 0;
  for (const u of us) {
    if (cur.length && total + len(u) > size) {
      out.push({ s: cur[0].s, e: cur[cur.length - 1].e });
      while (total > overlap || (total > 0 && total + len(u) > size)) {
        total -= len(cur[0]);
        cur = cur.slice(1);
      }
    }
    cur.push(u);
    total += len(u);
  }
  if (cur.length) out.push({ s: cur[0].s, e: cur[cur.length - 1].e });
  return out;
}
function rec(r: Chunk, level: number, size: number, overlap: number): Chunk[] {
  const out: Chunk[] = [];
  let good: Unit[] = [];
  for (const u of units(r, level)) {
    if (len(u) <= size) good.push(u);
    else {
      if (good.length) out.push(...merge(good, size, overlap));
      good = [];
      out.push(...rec(u, level + 1, size, overlap));
    }
  }
  if (good.length) out.push(...merge(good, size, overlap));
  return out;
}
export function recursiveChunks(size: number, overlap: number): Chunk[] {
  return rec({ s: 0, e: N }, 0, size, overlap);
}

export function chunksFor(strategy: Strategy, size: number, overlap: number) {
  return strategy === 'fixed' ? fixedChunks(size, overlap) : recursiveChunks(size, overlap);
}

/** sentences with a chunk boundary strictly inside them */
export function cutSentences(chunks: Chunk[]): number[] {
  const bounds = new Set<number>();
  chunks.forEach((c) => {
    bounds.add(c.s);
    bounds.add(c.e);
  });
  return SENTENCES.map((r, i) => ({ r, i }))
    .filter(({ r }) => [...bounds].some((b) => b > r.s && b < r.e))
    .map(({ i }) => i);
}
/** sentences not wholly contained in any single chunk */
export function brokenSentences(chunks: Chunk[]): number[] {
  return SENTENCES.map((r, i) => ({ r, i }))
    .filter(({ r }) => !chunks.some((c) => c.s <= r.s && c.e >= r.e))
    .map(({ i }) => i);
}
export function duplicated(chunks: Chunk[]) {
  return chunks.reduce((a, c) => a + (c.e - c.s), 0) - N;
}

export type Stage = 'intro' | 'plan' | 'chunk' | 'cuts' | 'dupes' | 'question' | 'answer' | 'compare' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  chunks: Chunk[];
  current: number | null;
  showCuts: boolean;
  showDupes: boolean;
  /** chunk ids that contain the whole answer sentence (stage answer) */
  answerHits: number[] | null;
  highlightAnswer: boolean;
}

export function simulate({ strategy, size, overlap: rawOverlap }: Params): Frame[] {
  const overlap = clampOverlap(size, rawOverlap);
  const all = chunksFor(strategy, size, overlap);
  const frames: Frame[] = [];
  const base = { chunks: [] as Chunk[], current: null, showCuts: false, showDupes: false, answerHits: null, highlightAnswer: false };
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => frames.push({ ...base, ...f } as Frame);
  const other: Strategy = strategy === 'fixed' ? 'recursive' : 'fixed';
  const otherChunks = chunksFor(other, size, overlap);
  const cuts = cutSentences(all);
  const broken = brokenSentences(all);
  const dup = duplicated(all);

  push({
    stage: 'intro',
    caption: `A ${N}-token refund policy: ${PARAGRAPHS.length} paragraphs, ${SENTENCES.length} sentences (1 word ≈ 1 token here). We split it into chunks of at most ${size} tokens with ${overlap} tokens of overlap${overlap !== rawOverlap ? ` (overlap capped at half the chunk size)` : ''}.`,
  });
  push({
    stage: 'plan',
    caption:
      strategy === 'fixed'
        ? `Fixed-size: a window of ${size} tokens; each next window starts ${size - overlap} tokens later. It never looks at sentence or paragraph boundaries.`
        : `Recursive: try paragraphs first; any paragraph over ${size} tokens is split into sentences, any sentence over ${size} into words. Adjacent pieces are merged back up to ${size}; overlap reuses whole trailing sentences (≤ ${overlap} tokens).`,
    predict: `With ${size}-token chunks and ${overlap} overlap, how many chunks will the ${N}-token document produce?`,
  });
  all.forEach((c, i) => {
    const prev = all[i - 1];
    const ov = prev ? Math.max(0, prev.e - c.s) : 0;
    const startsMid = c.s > 0 && WORDS[c.s].sentence === WORDS[c.s - 1].sentence;
    const endsMid = c.e < N && WORDS[c.e].sentence === WORDS[c.e - 1].sentence;
    const first = WORDS.slice(c.s, Math.min(c.e, c.s + 4)).map((w) => w.w).join(' ');
    const last = WORDS.slice(Math.max(c.s, c.e - 3), c.e).map((w) => w.w).join(' ');
    push({
      stage: 'chunk',
      chunks: all.slice(0, i + 1),
      current: i,
      caption: `Chunk ${i + 1}: tokens ${c.s + 1}–${c.e} (${c.e - c.s} tokens) "${first} … ${last}".${ov ? ` Repeats ${ov} tokens from chunk ${i}.` : ''}${startsMid || endsMid ? ` ✂ It ${startsMid ? 'starts' : ''}${startsMid && endsMid ? ' and ' : ''}${endsMid ? 'ends' : ''} mid-sentence.` : ' Clean sentence boundaries.'}`,
    });
  });
  push({
    stage: 'cuts',
    chunks: all,
    showCuts: true,
    caption: cuts.length
      ? `${all.length} chunks. ${cuts.length} of ${SENTENCES.length} sentences have a boundary inside them (✂). ${broken.length ? `${broken.length} sentence${broken.length > 1 ? 's are' : ' is'} not wholly inside any chunk: no single chunk can carry that fact.` : 'Overlap rescues them: each still appears whole in some chunk.'}`
      : `${all.length} chunks and no sentence is cut: every boundary falls between sentences.`,
  });
  push({
    stage: 'dupes',
    chunks: all,
    showCuts: true,
    showDupes: true,
    caption: dup
      ? `Overlap duplicates ${dup} tokens (${((dup / N) * 100).toFixed(0)}% extra to embed and store). It is insurance for facts that straddle a boundary.`
      : `No duplicated tokens: ${overlap ? 'the recursive splitter only carries whole trailing sentences, and here none fit within both the overlap and the chunk size' : 'overlap is 0'}. Cheaper, but a fact on a boundary has no second chance.`,
  });
  const hits = all.map((c, i) => ({ c, i })).filter(({ c }) => c.s <= SENTENCES[ANSWER_SENTENCE].s && c.e >= SENTENCES[ANSWER_SENTENCE].e).map(({ i }) => i);
  push({
    stage: 'question',
    chunks: all,
    showCuts: true,
    highlightAnswer: true,
    caption: `Retrieval test: "${QUESTION}" The answer is one sentence (highlighted): "An outage credit is 10 percent … capped at 50 percent."`,
    predict: `Will any single chunk contain that whole sentence, so the retriever can return the full answer in one hit?`,
  });
  push({
    stage: 'answer',
    chunks: all,
    showCuts: true,
    highlightAnswer: true,
    answerHits: hits,
    caption: hits.length
      ? `Yes: chunk ${hits.map((h) => h + 1).join(' and ')} contain${hits.length > 1 ? '' : 's'} the whole sentence, so one retrieved chunk answers the question.`
      : `No: the sentence is split across chunks, so the top hit holds "10 percent of the monthly fee" without the "capped at 50 percent" part (or vice versa). The LLM answers from half a fact.`,
  });
  const oc = cutSentences(otherChunks).length;
  push({
    stage: 'compare',
    chunks: all,
    showCuts: true,
    caption: `Same size and overlap with ${other} chunking: ${otherChunks.length} chunks, ${oc} cut sentence${oc === 1 ? '' : 's'}, ${duplicated(otherChunks)} duplicated tokens (vs ${all.length}, ${cuts.length}, ${dup} here). Recursive chunks vary in length but respect structure.`,
  });
  push({
    stage: 'done',
    chunks: all,
    showCuts: true,
    caption: `Typical starting point: 256–512 tokens with 10–20% overlap, recursive or structure-aware splitting, then tune on a retrieval eval (recall@k). Too small loses context; too large dilutes the embedding and wastes prompt tokens.`,
  });
  return frames;
}
