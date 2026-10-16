// Pure, deterministic naive-RAG pipeline (no React, Node-testable).
// offline: documents → chunks → embeddings in a vector index
// online:  query → embed → top-k by cosine → (optional cross-encoder rerank of all candidates, keep top-k)
//          → prompt = system + question + chunks (in rank order, each only if it still fits) + reserved answer tokens
//          → LLM answers from the context and cites chunk numbers.
// The answer is correct only if the EU chunk (C3) made it into the prompt.
import type { BaseFrame } from '../../core';

export interface Params {
  topK: number;
  rerank: boolean;
  budget: number;
}

export const DEFAULT_PARAMS: Params = { topK: 2, rerank: false, budget: 1600 };
export const BUDGETS = [1000, 1600, 2500];
export const SYSTEM_TOKENS = 120;
export const QUESTION_TOKENS = 25;
export const ANSWER_RESERVE = 300;
export const QUESTION = 'What is the refund window for annual plans for customers in the EU?';

export interface Chunk {
  id: string;
  title: string;
  tokens: number;
  /** cosine similarity from the bi-encoder (query vs chunk embedding) */
  vec: number;
  /** cross-encoder relevance (reads query and chunk together) */
  rr: number;
}

export const CHUNKS: Chunk[] = [
  { id: 'C1', title: 'Standard refund policy: annual plans refundable within 30 days', tokens: 320, vec: 0.89, rr: 0.41 },
  { id: 'C2', title: 'Refund FAQ: refunds reach your card in 5–10 days', tokens: 290, vec: 0.86, rr: 0.22 },
  { id: 'C3', title: 'EU addendum: EU customers may cancel annual plans within 45 days', tokens: 380, vec: 0.84, rr: 0.93 },
  { id: 'C4', title: 'Monthly plans: no refunds, cancel any time', tokens: 260, vec: 0.81, rr: 0.35 },
  { id: 'C5', title: 'Enterprise: refunds follow the signed order form', tokens: 340, vec: 0.78, rr: 0.3 },
  { id: 'C6', title: 'EU VAT invoices and reverse charge', tokens: 300, vec: 0.74, rr: 0.18 },
  { id: 'C7', title: 'Annual plan pricing and discounts', tokens: 270, vec: 0.7, rr: 0.12 },
  { id: 'C8', title: 'Data residency for EU customers', tokens: 310, vec: 0.66, rr: 0.15 },
];
export const CORRECT = 'C3';

export type Stage = 'index' | 'query' | 'embed' | 'retrieve' | 'rerank' | 'frame' | 'add' | 'drop' | 'send' | 'answer' | 'check' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** chunks retrieved by vector search (ids, rank order) */
  retrieved: string[];
  /** order after optional rerank (the k kept) */
  kept: string[];
  /** chunk ids placed into the prompt so far */
  inPrompt: string[];
  dropped: string[];
  current: string | null;
  used: number;
  answer: string | null;
  correct: boolean | null;
}

const byId = (id: string) => CHUNKS.find((c) => c.id === id)!;

export function simulate({ topK, rerank, budget }: Params): Frame[] {
  const frames: Frame[] = [];
  const st = { retrieved: [] as string[], kept: [] as string[], inPrompt: [] as string[], dropped: [] as string[], used: 0 };
  const push = (f: { stage: Stage; caption: string; predict?: string; current?: string | null; answer?: string | null; correct?: boolean | null }) =>
    frames.push({ ...st, retrieved: [...st.retrieved], kept: [...st.kept], inPrompt: [...st.inPrompt], dropped: [...st.dropped], current: null, answer: null, correct: null, ...f });

  const byVec = [...CHUNKS].sort((a, b) => b.vec - a.vec).map((c) => c.id);
  const candidates = rerank ? byVec : byVec.slice(0, topK);
  const kept = rerank ? [...candidates].sort((a, b) => byId(b).rr - byId(a).rr).slice(0, topK) : candidates;

  push({ stage: 'index', caption: `Offline: the help-centre docs were split into ${CHUNKS.length} chunks (260–380 tokens each), embedded, and stored in a vector index.` });
  push({ stage: 'query', caption: `A user asks: "${QUESTION}"` });
  push({ stage: 'embed', caption: `The query is embedded with the same bi-encoder as the chunks, giving one vector. Query and chunks were encoded separately, so the score only compares their overall gist.` });
  push({
    stage: 'embed',
    caption: `The index scores every chunk by cosine(query, chunk): ${byVec.map((id) => `${id} ${byId(id).vec.toFixed(2)}`).join(', ')}. Scores are bunched within ${(byId(byVec[0]).vec - byId(byVec[2]).vec).toFixed(2)} at the top: the bi-encoder sees "refund + annual plan" everywhere.`,
  });
  st.retrieved = candidates;
  const c3rank = byVec.indexOf(CORRECT) + 1;
  push({
    stage: 'retrieve',
    caption: rerank
      ? `Vector search returns all ${candidates.length} candidates by cosine (with a reranker you over-fetch, e.g. top 50, then keep k). The EU chunk C3 is only #${c3rank} (${byId(CORRECT).vec}): "refund" + "annual" pull C1 and C2 above it.`
      : `Vector search keeps the top ${topK} by cosine: ${candidates.join(', ')}. The EU chunk C3 is #${c3rank} by cosine (${byId(CORRECT).vec})${c3rank <= topK ? ', so it just makes the cut.' : `, so it is not retrieved at all.`}`,
    predict: `Top-1 is C1 "${byId('C1').title}". If the LLM mostly trusts its first chunk, what refund window will it give an EU customer?`,
  });
  st.kept = kept;
  push({
    stage: 'rerank',
    caption: rerank
      ? `A cross-encoder reads question + chunk together and rescores: C3 → ${byId(CORRECT).rr}, C1 → ${byId('C1').rr}. It notices "EU" matters. Keep top ${topK}: ${kept.join(', ')}.`
      : `No reranker: the cosine order is used as-is (${kept.join(', ')}). Cheap and fast, but bi-encoder scores are coarse, and near-duplicates of the topic outrank the precise answer.`,
  });
  const fixed = SYSTEM_TOKENS + QUESTION_TOKENS + ANSWER_RESERVE;
  st.used = fixed;
  push({
    stage: 'frame',
    caption: `Prompt assembly with a ${budget}-token window: system prompt ${SYSTEM_TOKENS} + question ${QUESTION_TOKENS} + ${ANSWER_RESERVE} reserved for the answer = ${fixed}. ${budget - fixed} tokens remain for context.`,
    predict: `The kept chunks total ${kept.reduce((a, id) => a + byId(id).tokens, 0)} tokens. Will they all fit in the ${budget - fixed} tokens left?`,
  });
  kept.forEach((id, i) => {
    const c = byId(id);
    if (st.used + c.tokens <= budget) {
      st.inPrompt.push(id);
      st.used += c.tokens;
      push({ stage: 'add', current: id, caption: `Add [${st.inPrompt.length}] ${id} (rank ${i + 1}, ${c.tokens} tokens) "${c.title}". Used ${st.used}/${budget}.` });
    } else {
      st.dropped.push(id);
      push({
        stage: 'drop',
        current: id,
        caption: `Context overflow: ${id} needs ${c.tokens} tokens but only ${budget - st.used} are left. It is dropped${id === CORRECT ? ': the one chunk with the answer never reaches the model' : ''}. (Truncating mid-chunk instead could cut the key sentence.)`,
      });
    }
  });
  const hasCorrect = st.inPrompt.includes(CORRECT);
  const cite = (id: string) => st.inPrompt.indexOf(id) + 1;
  push({
    stage: 'send',
    caption: `Send a ${st.used - ANSWER_RESERVE}-token prompt (plus ${ANSWER_RESERVE} reserved for the answer = ${st.used}/${budget}) with the instruction "answer only from the context and cite [n]". Context: ${st.inPrompt.map((id, i) => `[${i + 1}] ${id}`).join(', ') || 'nothing'}.`,
  });
  const answer = hasCorrect
    ? `EU customers can cancel an annual plan within 45 days [${cite(CORRECT)}]${st.inPrompt.includes('C1') ? ` (the standard 30-day window [${cite('C1')}] does not apply in the EU)` : ''}.`
    : st.inPrompt.includes('C1')
      ? `Annual plans are refundable within 30 days [${cite('C1')}].`
      : `The context does not say; I cannot answer.`;
  push({
    stage: 'answer',
    answer,
    correct: hasCorrect,
    caption: `LLM: "${answer}"`,
  });
  push({
    stage: 'check',
    answer,
    correct: hasCorrect,
    caption: hasCorrect
      ? `Correct and grounded: the citation points at C3, which really says 45 days for the EU. ${rerank ? 'The reranker put it first, so even a small budget keeps it.' : 'It survived only because k and the budget were large enough.'}`
      : `Wrong, yet "grounded": the citation is real, C1 really says 30 days, but it is the standard (non-EU) policy. The model was faithful to the wrong context. ${st.dropped.includes(CORRECT) ? 'Cause: context overflow dropped C3.' : 'Cause: retrieval never surfaced C3.'}`,
  });
  push({
    stage: 'done',
    answer,
    correct: hasCorrect,
    caption: `Naive RAG fails silently at retrieval and packing, not generation. Fixes: rerank before packing, budget context explicitly, measure recall@k on a golden set, and let the model say "not in context".`,
  });
  return frames;
}
