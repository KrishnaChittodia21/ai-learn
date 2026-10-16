import type { Topic } from '../../types';

const topic: Topic = {
  id: 'rag-evaluation',
  phase: 'evaluation',
  order: 1,
  title: 'RAG Evaluation and Retrieval Metrics',
  subtitle:
    'Measure a RAG system the way you debug it: split retrieval from generation, score answers with RAGAS (faithfulness, answer relevancy, context precision and recall), and compute Precision@K, Recall@K, MRR and NDCG by hand until they feel obvious.',
  estimatedMinutes: 60,
  sources: [
    'Es et al. 2023 — RAGAS: Automated Evaluation of Retrieval Augmented Generation (arXiv 2309.15217)',
    'Ragas docs — Evaluate a simple RAG system; metrics: Faithfulness, Response Relevancy, Context Precision, Context Recall (docs.ragas.io)',
    'Manning, Raghavan & Schütze — Introduction to Information Retrieval, ch. 8 (Evaluation in IR)',
    'Järvelin & Kekäläinen 2002 — Cumulated gain-based evaluation of IR techniques (NDCG)',
    'Thakur et al. 2021 — BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of IR Models (nDCG@10 as headline metric)',
    'ranx — Python library for ranking evaluation (Qrels, Run, evaluate)',
    'Saad-Falcon et al. 2024 — ARES: An Automated Evaluation Framework for RAG Systems',
  ],
  tags: ['evaluation', 'ragas', 'precision-at-k', 'recall-at-k', 'mrr', 'ndcg', 'golden-dataset', 'retrieval-metrics'],
  cheatSheet: [
    'Evaluate in two halves: retrieval (did the right chunks come back?) and generation (did the answer use them correctly?). End-to-end scores alone cannot tell you which half broke.',
    'RAGAS core four: faithfulness (claims supported by context), answer/response relevancy (answer addresses the question), context precision (relevant chunks ranked high), context recall (context covers the reference answer).',
    'Precision@K = relevant in top K ÷ K. Recall@K = relevant in top K ÷ total relevant for the query.',
    'Hit rate@K = share of queries with at least one relevant result in the top K — the most useful single number for RAG with one gold chunk per question.',
    'MRR = mean over queries of 1 ÷ rank of the first relevant result (0 if none). Rewards getting the first hit early.',
    'NDCG@K = DCG ÷ ideal DCG, with DCG = Σ rel_i ÷ log2(i + 1). Handles graded relevance and position.',
    'For RAG, track recall/hit rate at the K you actually send to the LLM (e.g. @5), and recall at the candidate depth (e.g. @50) before reranking.',
    'A 100-question golden set gives ±8-point 95% confidence on an 80% metric; ~700 questions are needed for ±3 points.',
    'LLM-judged metrics are noisy: fix the judge model and prompt, validate against human labels, and compare systems on the same questions (paired).',
    'Slice results by question type (keyword, multi-hop, temporal, unanswerable) — averages hide regressions.',
  ],
  sections: [
    {
      heading: 'RAG Evaluation — component vs end-to-end, golden sets and RAGAS metrics',
      body: `**Intuition:** a RAG answer can fail because the librarian brought the wrong books (retrieval) or because the writer misread the right ones (generation). Evaluation must check both, separately.

**What to measure:**

| Layer | Metric | Needs | Question it answers |
|---|---|---|---|
| Retrieval | Recall@K, Hit@K, MRR, NDCG | gold chunk ids | Is the evidence in the top K? |
| Retrieval (LLM-judged) | **Context precision** | question, contexts, reference | Are relevant chunks ranked above irrelevant ones? |
| Retrieval (LLM-judged) | **Context recall** | contexts, reference answer | Do contexts cover every claim in the reference? |
| Generation | **Faithfulness** | answer, contexts | Are the answer's claims supported by the contexts? |
| Generation | **Answer (response) relevancy** | question, answer | Does the answer address the question? |
| End-to-end | Answer correctness | answer, reference | Is it right? |

**RAGAS mechanics (Es et al. 2023):** faithfulness breaks the answer into claims and checks each against the context (supported ÷ total). Response relevancy asks an LLM to generate questions from the answer and averages their embedding similarity to the original question (evasive or off-topic answers score low). Context precision averages precision@k over the positions of relevant chunks; context recall checks which reference-answer claims are attributable to the contexts.

**Golden set:** 100–500 real questions with reference answers and gold chunk/document ids, covering question types and including unanswerable ones. Bootstrap with LLM-generated questions from chunks, then have humans review.

**When to use what:** offline golden-set evaluation on every change (CI); online, sample production traffic for reference-free metrics (faithfulness, relevancy) plus user feedback. Detailed groundedness and hallucination detection is covered in the next topic.`,
      example: `One golden item: *"How long do refunds take for damaged items?"* Reference: "Refunds for damaged items are issued within 5 business days after the photo is approved."

Retrieved contexts (in rank order): C1 refund timing ✔, C2 shipping rates ✘, C3 damaged-item photo rule ✔, C4 gift cards ✘, C5 refund method ✔.
- **Context precision** = (P@1·1 + P@3·1 + P@5·1) ÷ 3 = (1/1 + 2/3 + 3/5) ÷ 3 = (1 + 0.667 + 0.6) ÷ 3 = **0.756**.
- **Context recall**: reference has 2 claims (5 business days; after photo approval); both attributable → **1.0**.
- Answer: "Refunds take 5 business days after photo approval, usually to the original card, and you also get a 10% voucher." 4 claims, the voucher claim unsupported → **faithfulness 3/4 = 0.75**.
- **Response relevancy**: 3 generated questions with cosine 0.93, 0.90, 0.87 → **0.90**.`,
      diagram: `   golden item: question + reference + gold ids
        │
        ▼
   ┌─────────┐ contexts ┌──────────┐ answer
   │RETRIEVER├─────────►│GENERATOR ├────────►
   └────┬────┘          └────┬─────┘
        │                    │
  Recall@K, MRR,        Faithfulness (answer vs contexts)
  NDCG (vs gold ids)    Response relevancy (answer vs question)
  Context precision /   Answer correctness (answer vs reference)
  recall (vs reference)`,
      code: [
        {
          language: 'python',
          title: 'Evaluate RAG outputs with Ragas (v0.2+ API)',
          code: `from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas import EvaluationDataset, evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics import (Faithfulness, ResponseRelevancy,
                           LLMContextPrecisionWithReference, LLMContextRecall)
import os

judge = LangchainLLMWrapper(ChatOpenAI(model=os.getenv("JUDGE_MODEL", "gpt-5-mini"), temperature=0))
emb = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model="text-embedding-3-small"))

rows = [{
    "user_input": "How long do refunds take for damaged items?",
    "retrieved_contexts": [
        "Refunds are issued within 5 business days.",
        "Standard shipping costs $4.99.",
        "Damaged items require a photo; refunds start after the photo is approved.",
    ],
    "response": "Refunds take 5 business days after the photo is approved.",
    "reference": "Refunds for damaged items are issued within 5 business days after photo approval.",
}]  # in practice: run your pipeline over the whole golden set to fill these

result = evaluate(
    dataset=EvaluationDataset.from_list(rows),
    metrics=[Faithfulness(), ResponseRelevancy(),
             LLMContextPrecisionWithReference(), LLMContextRecall()],
    llm=judge, embeddings=emb,
)
print(result)                       # aggregate scores per metric
df = result.to_pandas()             # per-question scores for slicing and debugging
print(df.sort_values("faithfulness").head())`,
        },
      ],
      prosCons: {
        pros: [
          'Separates retrieval failures from generation failures, so you fix the right component.',
          'Reference-free metrics (faithfulness, relevancy) can run on live traffic without labels.',
          'A golden set turns every pipeline change into a measurable A/B comparison.',
        ],
        cons: [
          { con: 'LLM-judged metrics vary with the judge model and prompt, and can drift when the judge is upgraded.', fix: 'Pin the judge model and temperature 0, validate against 50–100 human-labelled items, and re-baseline when the judge changes.' },
          { con: 'Golden sets go stale as documents and user questions change.', fix: 'Refresh monthly from sampled production queries, version the set, and tie gold ids to document versions.' },
          { con: 'Averages hide failures on specific question types.', fix: 'Tag every golden item (keyword, multi-hop, temporal, unanswerable) and report metrics per tag.' },
        ],
      },
      keyPoints: [
        'Retrieval metrics need gold ids; RAGAS context metrics need a reference answer.',
        'Faithfulness = supported claims ÷ total claims in the answer.',
        'Response relevancy penalises evasive or off-topic answers, not wrong ones.',
        'Version the golden set and slice results by question type.',
      ],
      exercise: {
        prompt: `Implement RAGAS-style **context precision** from relevance verdicts.

**Acceptance criteria:**
- \`contextPrecision(verdicts)\` takes an array of 0/1 relevance verdicts in rank order.
- Returns Σ_k (precision@k × v_k) ÷ (number of relevant items); 0 if there are none.
- \`contextPrecision([1,0,1,0,1])\` ≈ 0.756; \`contextPrecision([0,0,1])\` ≈ 0.333; \`contextPrecision([1,1,0])\` = 1.`,
        starter: {
          language: 'typescript',
          code: `export function contextPrecision(verdicts: number[]): number {
  // TODO: running count of relevant items, precision@k at relevant positions
  return 0;
}`,
        },
        hints: [
          'Keep a running count of relevant items seen so far.',
          'At each position k (1-based) where v_k = 1, add hits / k.',
          'Divide by the total number of relevant items.',
        ],
        solution: {
          language: 'typescript',
          code: `export function contextPrecision(verdicts: number[]): number {
  let hits = 0;
  let sum = 0;
  verdicts.forEach((v, i) => {
    if (v !== 1) return;
    hits++;
    sum += hits / (i + 1); // precision@k at this relevant position
  });
  return hits === 0 ? 0 : sum / hits;
}

// contextPrecision([1,0,1,0,1]) -> (1 + 2/3 + 3/5) / 3 = 0.7556
// contextPrecision([0,0,1])     -> (1/3) / 1 = 0.3333
// contextPrecision([1,1,0])     -> (1 + 1) / 2 = 1`,
        },
        explanation:
          'This is average precision over the retrieved list: it is 1 when all relevant chunks come before any irrelevant one and drops as relevant chunks slide down. It measures ranking quality, which is what decides whether the best evidence survives the cut to the prompt.',
      },
      quickCheck: {
        question: 'Faithfulness is 0.95 but answer correctness is 0.55. What is the most likely diagnosis?',
        options: [
          'The generator hallucinates heavily',
          'The answers faithfully repeat retrieved context that is wrong or incomplete — a retrieval (or content) problem',
          'The response relevancy metric is broken',
          'The judge model is too strict',
        ],
        correct: 1,
        explanation:
          'High faithfulness means the answers are well supported by what was retrieved; low correctness then points at what was retrieved (wrong document, outdated version, missing content). Heavy hallucination would lower faithfulness; relevancy and judge strictness do not explain this pattern.',
      },
      source: 'Es et al. 2023 — RAGAS; Ragas docs',
    },
    {
      heading: 'Retrieval Evaluation — qrels, hit rate and building a labelled query set',
      body: `**Intuition:** before grading the essay, check whether the student was handed the right pages. Retrieval evaluation compares the retriever's ranked list against a list of known-relevant documents for each query.

**Ingredients (classic IR vocabulary):**
- **Queries** — real user questions (sampled from logs) plus synthetic ones.
- **Qrels** (query relevance judgements) — for each query, which doc/chunk ids are relevant, optionally graded (0 = not, 1 = partial, 2 = relevant, 3 = perfect).
- **Run** — your system's ranked results with scores for each query.
- **Metrics** — computed from qrels + run at cut-off K.

**Getting labels cheaply:**
1. **Synthetic questions from chunks:** ask an LLM to write a question each chunk answers; that chunk becomes the gold. Fast, but biased toward lexical overlap — mix in real queries.
2. **Pooling:** run several retrievers (BM25, dense, hybrid), take the union of their top 10, and have humans or an LLM judge label the pool.
3. **Production signals:** clicked citations, thumbs-up answers (noisy, but plentiful).

**Which metric:**

| Situation | Metric |
|---|---|
| One gold chunk per question (typical RAG) | Hit@K / Recall@K, MRR |
| Several relevant chunks needed | Recall@K, Precision@K |
| Graded relevance, ranking quality | NDCG@K |

**Evaluate at two depths:** candidate depth (e.g. Recall@50, before reranking — sets the ceiling) and context depth (e.g. Recall@5 — what the LLM sees).`,
      example: `Golden set: 300 queries (200 from logs, 100 synthetic), one or more gold chunk ids each.

| Pipeline | Hit@5 | Recall@50 | MRR |
|---|---|---|---|
| Dense only | 0.71 | 0.88 | 0.58 |
| Hybrid (BM25 + dense, RRF) | 0.79 | 0.94 | 0.64 |
| Hybrid + cross-encoder rerank | 0.87 | 0.94 | 0.76 |

Reading it: hybrid raises the ceiling (Recall@50 0.88 → 0.94); reranking does not change Recall@50 (same candidates) but moves gold chunks up (Hit@5 0.79 → 0.87, MRR 0.64 → 0.76). The remaining 6% missing at depth 50 are content or chunking problems — no reranker can fix them.`,
      diagram: `  queries ──► RETRIEVER ──► run: {q1: [d7, d2, d9 ...], q2: [...]}
                                     │
  qrels: {q1: {d2: 1, d5: 1}, ...} ──┤
                                     ▼
                       metrics @K: Hit, P, R, MRR, NDCG
                                     │
                ┌────────────────────┴────────────────────┐
           @50 (candidate ceiling)                @5 (what the LLM sees)`,
      code: [
        {
          language: 'python',
          title: 'Retrieval metrics with ranx (qrels + run)',
          code: `from ranx import Qrels, Run, evaluate, compare

# Gold judgements: query id -> {doc id: relevance grade}
qrels = Qrels({
    "q1": {"d2": 1, "d5": 1},
    "q2": {"d9": 3, "d4": 1},
    "q3": {"d1": 1},
})

def run_from(results: dict[str, list[str]], name: str) -> Run:
    # ranx expects scores; convert a ranked list into descending pseudo-scores
    return Run({q: {d: 1.0 / (i + 1) for i, d in enumerate(docs)}
                for q, docs in results.items()}, name=name)

dense = run_from({"q1": ["d7", "d2", "d3"], "q2": ["d4", "d9", "d8"], "q3": ["d6", "d8", "d0"]}, "dense")
hybrid = run_from({"q1": ["d2", "d5", "d7"], "q2": ["d9", "d4", "d1"], "q3": ["d1", "d6", "d8"]}, "hybrid")

metrics = ["hit_rate@3", "precision@3", "recall@3", "mrr", "ndcg@3"]
print(evaluate(qrels, dense, metrics))
# Side-by-side table with a significance test between runs
print(compare(qrels, runs=[dense, hybrid], metrics=metrics, max_p=0.05))`,
        },
      ],
      prosCons: {
        pros: [
          'Cheap and deterministic once qrels exist: thousands of queries evaluated in seconds, ideal for CI.',
          'Pinpoints whether a miss is a ceiling problem (not in top 50) or a ranking problem (in top 50, not top 5).',
          'Standard metrics make embedding models, chunkers and rerankers directly comparable.',
        ],
        cons: [
          { con: 'Synthetic questions copy chunk wording, inflating dense and BM25 scores.', fix: 'Prompt the generator to paraphrase and use user-style language, and keep at least half the set from real logs.' },
          { con: 'Unlabelled relevant documents are counted as misses (incomplete qrels).', fix: 'Use pooling across several retrievers and periodically have an LLM judge label new top-ranked documents not in the qrels.' },
          { con: 'Chunk-id gold labels break when you re-chunk the corpus.', fix: 'Store gold at document + character-span level and map spans to the new chunks automatically.' },
        ],
      },
      keyPoints: [
        'Qrels = labelled relevance per query; run = your ranked output.',
        'Hit@K is the go-to RAG metric with one gold chunk per query.',
        'Measure at candidate depth and at context depth.',
        'Mix real and synthetic queries; label with pooling.',
      ],
      exercise: {
        prompt: `Write \`hitRateAtK(run, qrels, k)\` and \`missBreakdown(run, qrels, k, depth)\`.

**Acceptance criteria:**
- \`run\`: \`Record<queryId, string[]>\` ranked doc ids; \`qrels\`: \`Record<queryId, Set<string>>\` relevant ids.
- \`hitRateAtK\` = fraction of queries with ≥ 1 relevant doc in the top k (queries missing from run count as misses).
- \`missBreakdown\` returns \`{ hit, rankingMiss, ceilingMiss }\` counts: hit = relevant in top k; rankingMiss = first relevant at rank in (k, depth]; ceilingMiss = none in top depth.`,
        starter: {
          language: 'typescript',
          code: `type Run = Record<string, string[]>;
type Qrels = Record<string, Set<string>>;

export function hitRateAtK(run: Run, qrels: Qrels, k: number): number {
  // TODO
  return 0;
}

export function missBreakdown(run: Run, qrels: Qrels, k: number, depth: number) {
  // TODO
  return { hit: 0, rankingMiss: 0, ceilingMiss: 0 };
}`,
        },
        hints: [
          'Iterate over Object.keys(qrels), not over the run, so missing queries are counted.',
          'Find the first relevant index with findIndex(d => rel.has(d)).',
          'Classify the index: < k → hit, < depth → rankingMiss, otherwise ceilingMiss.',
        ],
        solution: {
          language: 'typescript',
          code: `type Run = Record<string, string[]>;
type Qrels = Record<string, Set<string>>;

const firstRelevant = (docs: string[] | undefined, rel: Set<string>) => (docs ?? []).findIndex((d) => rel.has(d));

export function hitRateAtK(run: Run, qrels: Qrels, k: number): number {
  const qs = Object.keys(qrels);
  if (!qs.length) return 0;
  const hits = qs.filter((q) => {
    const i = firstRelevant(run[q], qrels[q]);
    return i >= 0 && i < k;
  }).length;
  return hits / qs.length;
}

export function missBreakdown(run: Run, qrels: Qrels, k: number, depth: number) {
  const out = { hit: 0, rankingMiss: 0, ceilingMiss: 0 };
  for (const q of Object.keys(qrels)) {
    const i = firstRelevant(run[q], qrels[q]);
    if (i >= 0 && i < k) out.hit++;
    else if (i >= k && i < depth) out.rankingMiss++; // fix with reranking
    else out.ceilingMiss++; // fix with hybrid search, query rewriting, chunking or content
  }
  return out;
}`,
        },
        explanation:
          'Iterating over qrels makes missing runs count as failures (otherwise a crashing retriever looks perfect). The breakdown converts a single number into an action: ranking misses call for rerankers, ceiling misses for better candidate generation or new content.',
      },
      quickCheck: {
        question: 'Adding a cross-encoder reranker over the top 50 changes which metric the LEAST?',
        options: ['Hit@5', 'MRR', 'Recall@50', 'NDCG@10'],
        correct: 2,
        explanation:
          'Reranking reorders the same 50 candidates, so the set in the top 50 — and therefore Recall@50 — is unchanged. Hit@5, MRR and NDCG@10 all depend on order within the top ranks, which is exactly what the reranker improves.',
      },
      source: 'Manning et al. — Introduction to IR, ch. 8; ranx docs',
    },
    {
      heading: 'Precision@K — how much of what you returned is relevant',
      body: `**Intuition:** you hand the model K chunks; Precision@K is the fraction of them that are actually useful. Low precision = the model is wading through noise.

**Formula:** Precision@K = (number of relevant results in the top K) ÷ K.

It ignores order *within* the top K and ignores relevant documents ranked below K. Average it over queries for a system score.

**Behaviour as K grows:** usually decreases — you add lower-ranked, less relevant results. It also has a *ceiling* when a query has fewer relevant docs than K: with 2 relevant docs, P@10 can be at most 0.2 even for a perfect ranking. That is why precision alone is misleading for RAG questions with one gold chunk.

**Why it matters for RAG:** every irrelevant chunk costs tokens and can distract or mislead the generator (lost-in-the-middle, mixed versions). Precision at the context depth (e.g. P@5) is a proxy for context cleanliness; RAGAS context precision is a rank-weighted cousin.

| Use Precision@K when… | Prefer something else when… |
|---|---|
| several relevant chunks exist and noise is costly | one gold chunk per query (use Hit@K / MRR) |
| comparing rerankers or score thresholds | you care whether *all* evidence was found (Recall@K) |`,
      example: `Query: *"refund policy for damaged items"*. The corpus has **5 relevant chunks**. The retriever's top 10, with relevance (1 = relevant):

| Rank | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| rel | 1 | 0 | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 |

- P@1 = 1 ÷ 1 = **1.00**
- P@3 = 2 ÷ 3 = **0.667**
- P@5 = 3 ÷ 5 = **0.60**
- P@10 = 4 ÷ 10 = **0.40**

Averaged with a second query whose P@5 is 0.20: mean P@5 = (0.60 + 0.20) ÷ 2 = **0.40**.`,
      diagram: `  top-K window (K = 5)
  ┌───┬───┬───┬───┬───┐───┬───┬───┬───┬───
  │ ✔ │ ✘ │ ✔ │ ✔ │ ✘ │ ✘ │ ✔ │ ✘ │ ✘ │ ✘
  └───┴───┴───┴───┴───┘───┴───┴───┴───┴───
     relevant inside window = 3
     P@5 = 3 / 5 = 0.60   (rank 7 ✔ is invisible to P@5)`,
      code: [
        {
          language: 'typescript',
          title: 'Precision@K per query and averaged',
          code: `type Ranked = string[];
type Relevant = Set<string>;

export function precisionAtK(ranked: Ranked, relevant: Relevant, k: number): number {
  if (k <= 0) return 0;
  const top = ranked.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / k; // divide by K, not by top.length: short lists are penalised
}

export function meanPrecisionAtK(
  runs: { ranked: Ranked; relevant: Relevant }[],
  k: number,
): number {
  if (!runs.length) return 0;
  return runs.reduce((s, r) => s + precisionAtK(r.ranked, r.relevant, k), 0) / runs.length;
}

// Worked example
const ranked = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];
const relevant = new Set(['c1', 'c3', 'c4', 'c7', 'c42']); // c42 never retrieved
for (const k of [1, 3, 5, 10]) console.log('P@' + k, precisionAtK(ranked, relevant, k).toFixed(3));
// P@1 1.000, P@3 0.667, P@5 0.600, P@10 0.400`,
        },
      ],
      prosCons: {
        pros: [
          'Simple, intuitive measure of context noise at the exact K you send to the LLM.',
          'Directly reflects token waste: (1 − P@K) × K chunks are irrelevant.',
          'Good for tuning score thresholds and reranker cut-offs.',
        ],
        cons: [
          { con: 'Capped by the number of relevant documents: with 1 gold chunk, P@5 ≤ 0.2 even for a perfect system.', fix: 'Use Hit@K or MRR for single-gold datasets, or report R-precision (precision at K = number of relevant docs).' },
          { con: 'Ignores order inside the top K.', fix: 'Pair it with a rank-aware metric such as MRR, NDCG or RAGAS context precision.' },
          { con: 'Incomplete labels count unlabelled-but-relevant chunks as noise.', fix: 'Pool and judge newly surfaced top-K chunks (human or LLM judge) to keep qrels complete.' },
        ],
      },
      keyPoints: [
        'P@K = relevant in top K ÷ K.',
        'Divide by K even if fewer than K results were returned.',
        'Upper bound = min(1, #relevant ÷ K).',
        'Measures context cleanliness; says nothing about missed evidence.',
      ],
      exercise: {
        prompt: `Implement \`rPrecision(ranked, relevant)\` and \`bestK(ranked, relevant, maxK)\`.

**Acceptance criteria:**
- R-precision = precision at K = |relevant| (0 if none relevant).
- \`bestK\` returns the K in 1..maxK that maximises **F1** of P@K and R@K (ties → smaller K).
- For ranked [c1..c10] with relevant {c1,c3,c4,c7,c42}: R-precision = P@5 = 0.6; bestK(…, 10) = 4 (P = 0.75, R = 0.6, F1 ≈ 0.667).`,
        starter: {
          language: 'typescript',
          code: `export function rPrecision(ranked: string[], relevant: Set<string>): number {
  // TODO
  return 0;
}

export function bestK(ranked: string[], relevant: Set<string>, maxK: number): number {
  // TODO: compute P@K, R@K, F1 for each K
  return 1;
}`,
        },
        hints: [
          'R-precision uses K = relevant.size.',
          'Recall@K = hits in top K ÷ relevant.size.',
          'F1 = 2PR ÷ (P + R), 0 when P + R = 0; only replace the best when strictly greater.',
        ],
        solution: {
          language: 'typescript',
          code: `const hitsAt = (ranked: string[], rel: Set<string>, k: number) =>
  ranked.slice(0, k).filter((d) => rel.has(d)).length;

export function rPrecision(ranked: string[], relevant: Set<string>): number {
  const r = relevant.size;
  return r === 0 ? 0 : hitsAt(ranked, relevant, r) / r;
}

export function bestK(ranked: string[], relevant: Set<string>, maxK: number): number {
  let best = 1;
  let bestF1 = -1;
  for (let k = 1; k <= maxK; k++) {
    const h = hitsAt(ranked, relevant, k);
    const p = h / k;
    const r = relevant.size ? h / relevant.size : 0;
    const f1 = p + r === 0 ? 0 : (2 * p * r) / (p + r);
    if (f1 > bestF1 + 1e-12) { bestF1 = f1; best = k; } // ties keep the smaller K
  }
  return best;
}
// K=4: P=3/4=0.75, R=3/5=0.6, F1=0.667; K=7: P=4/7=0.571, R=0.8, F1=0.667 -> tie, keep 4`,
        },
        explanation:
          'R-precision removes the cap problem by choosing K equal to the number of relevant documents. Sweeping K for F1 shows the precision/recall trade-off concretely; in this example K = 4 and K = 7 tie, and the smaller K is preferred because it costs fewer tokens.',
      },
      quickCheck: {
        question: 'A query has exactly one relevant chunk, and your retriever ranks it #1. What is P@5?',
        options: ['1.0', '0.2', '0.5', 'Undefined'],
        correct: 1,
        explanation:
          'P@5 = 1 relevant ÷ 5 = 0.2, even though the ranking is perfect. That cap is why Hit@K, MRR or R-precision are better for single-gold questions.',
      },
      source: 'Manning et al. — Introduction to IR, ch. 8.4',
    },
    {
      heading: 'Recall@K — how much of the needed evidence you found',
      body: `**Intuition:** if the answer needs three facts and your top K contains two of them, the model can at best give two-thirds of the answer. Recall@K measures how much of the needed evidence made it into the window.

**Formula:** Recall@K = (relevant results in the top K) ÷ (total relevant results for the query).

Recall@K never decreases as K grows and reaches 1.0 once every relevant item is retrieved. With a single gold chunk, Recall@K equals **Hit@K** (0 or 1 per query).

**Why it is the primary RAG retrieval metric:** the generator cannot use evidence it never sees, so recall at the context depth bounds answer completeness and correctness. Recall at a deeper candidate depth (e.g. @50) tells you the ceiling a reranker can reach.

**Precision vs recall trade-off:**

| K sent to LLM | Recall | Precision | Effect |
|---|---|---|---|
| small (3) | lower | higher | cheap, clean, may miss evidence |
| large (20) | higher | lower | more complete, more noise and tokens |

The standard way out: **retrieve wide for recall (K = 30–100), rerank narrow for precision (top 3–8).**

**Caveat:** Recall needs the *total* number of relevant items, so qrels must be complete for each query — missing labels inflate recall (smaller denominator) or deflate precision.`,
      example: `Same query as before, 5 relevant chunks in the corpus, relevance by rank [1,0,1,1,0,0,1,0,0,0]:

- R@1 = 1 ÷ 5 = **0.20**
- R@3 = 2 ÷ 5 = **0.40**
- R@5 = 3 ÷ 5 = **0.60**
- R@10 = 4 ÷ 5 = **0.80** (the 5th relevant chunk is not in the top 10)

Dataset view (3 queries, K = 5): query A 3/5 = 0.60, query B 1/1 = 1.00, query C 0/2 = 0.00 → mean Recall@5 = (0.60 + 1.00 + 0.00) ÷ 3 = **0.533**. Micro-averaged instead: (3 + 1 + 0) ÷ (5 + 1 + 2) = 4 ÷ 8 = **0.50** — say which one you report.`,
      diagram: `  relevant set (5):  c1  c3  c4  c7  c42
                      │   │   │   │    │
  top-5:  c1 c2 c3 c4 c5               │
          ✔     ✔  ✔                   │
  R@5 = 3/5 = 0.60                     │
  top-10 adds c7 ✔  → R@10 = 4/5 = 0.80
  c42 never retrieved → ceiling problem (chunking / query / content)`,
      code: [
        {
          language: 'typescript',
          title: 'Recall@K: macro vs micro average and a recall curve',
          code: `type Q = { ranked: string[]; relevant: Set<string> };

export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return NaN; // undefined: exclude unanswerable queries from recall
  const hits = ranked.slice(0, k).filter((d) => relevant.has(d)).length;
  return hits / relevant.size;
}

export function macroRecall(qs: Q[], k: number): number {
  const vals = qs.map((q) => recallAtK(q.ranked, q.relevant, k)).filter((v) => !Number.isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; // each query weighs the same
}

export function microRecall(qs: Q[], k: number): number {
  let hits = 0, total = 0;
  for (const q of qs) {
    hits += q.ranked.slice(0, k).filter((d) => q.relevant.has(d)).length;
    total += q.relevant.size; // queries with many relevant docs weigh more
  }
  return total ? hits / total : 0;
}

// Recall curve: where does adding more context stop paying off?
export const recallCurve = (qs: Q[], ks = [1, 3, 5, 10, 20, 50]) =>
  ks.map((k) => ({ k, recall: Number(macroRecall(qs, k).toFixed(3)) }));`,
        },
      ],
      prosCons: {
        pros: [
          'Directly bounds what the generator can possibly answer — the most important retrieval number for RAG.',
          'Monotonic in K, so a recall curve shows exactly how much context you need.',
          'Equals Hit@K for single-gold datasets, making it easy to explain.',
        ],
        cons: [
          { con: 'Requires knowing all relevant items; incomplete qrels make recall unreliable.', fix: 'Label with pooling across several retrievers and audit a sample for missing relevant chunks.' },
          { con: 'Ignores rank: a relevant chunk at position 5 counts the same as position 1.', fix: 'Report MRR or NDCG alongside, and use reordering so key evidence is at the context edges.' },
          { con: 'Macro and micro averages can disagree, confusing comparisons.', fix: 'Pick one (macro is standard per query), state it explicitly, and keep it fixed across experiments.' },
        ],
      },
      keyPoints: [
        'R@K = relevant in top K ÷ all relevant for the query.',
        'Recall@context-depth bounds answer completeness; Recall@candidate-depth bounds rerankers.',
        'Single gold chunk → Recall@K = Hit@K.',
        'Exclude unanswerable queries from recall and evaluate them separately (refusal rate).',
      ],
      exercise: {
        prompt: `Find the smallest K that reaches a recall target.

**Acceptance criteria:**
- \`minKForRecall(qs, target, maxK)\` returns the smallest K in 1..maxK where macro Recall@K ≥ target, or \`null\` if never reached.
- Use per-query recall = hits@K ÷ |relevant|; skip queries with no relevant items.
- Example: queries {ranked [a,b,c], rel {a}}, {ranked [x,y,z], rel {z}} → recall@1 = 0.5, @2 = 0.5, @3 = 1.0 → minKForRecall(…, 0.9, 3) = 3.`,
        starter: {
          language: 'typescript',
          code: `type Q = { ranked: string[]; relevant: Set<string> };

export function minKForRecall(qs: Q[], target: number, maxK: number): number | null {
  // TODO
  return null;
}`,
        },
        hints: [
          'Filter out queries with relevant.size === 0 first.',
          'Loop K from 1 to maxK and compute the mean recall.',
          'Return as soon as the mean ≥ target.',
        ],
        solution: {
          language: 'typescript',
          code: `type Q = { ranked: string[]; relevant: Set<string> };

export function minKForRecall(qs: Q[], target: number, maxK: number): number | null {
  const valid = qs.filter((q) => q.relevant.size > 0);
  if (!valid.length) return null;
  for (let k = 1; k <= maxK; k++) {
    const mean =
      valid.reduce((s, q) => s + q.ranked.slice(0, k).filter((d) => q.relevant.has(d)).length / q.relevant.size, 0) /
      valid.length;
    if (mean >= target) return k; // recall is monotonic in K, so the first hit is the minimum
  }
  return null;
}`,
        },
        explanation:
          'Because recall never decreases with K, the first K reaching the target is the minimum context size that meets your recall goal — a data-driven way to set top-k instead of guessing. Run it before and after reranking to see how much context reranking saves.',
      },
      quickCheck: {
        question: 'Recall@5 is 0.62 and Recall@50 is 0.64. What is the best next investment?',
        options: [
          'A cross-encoder reranker over the top 50',
          'Improving candidate generation: hybrid search, query rewriting, chunking or missing content',
          'Sending 50 chunks to the LLM',
          'Switching to a bigger generator',
        ],
        correct: 1,
        explanation:
          'Only 2 points separate @5 and @50, so reranking has almost nothing to promote: the evidence is mostly absent from the candidates. Fix what gets retrieved. Sending 50 chunks adds noise for a 2-point gain, and a bigger generator cannot use missing evidence.',
      },
      source: 'Manning et al. — Introduction to IR, ch. 8',
    },
    {
      heading: 'MRR and NDCG — rewarding relevant results that appear early',
      body: `**Intuition:** finding the answer at rank 1 is better than at rank 9, even though both count as a "hit". MRR and NDCG add a *position discount*.

**MRR (Mean Reciprocal Rank):** for each query, take 1 ÷ rank of the **first** relevant result (0 if none in the list or cut-off), then average. Rank 1 → 1, rank 2 → 0.5, rank 3 → 0.333, rank 10 → 0.1. Ideal when users (or the LLM) mainly need *one* good result.

**NDCG@K (Normalised Discounted Cumulative Gain):** supports **graded** relevance and **multiple** relevant results.
- DCG@K = Σ_{i=1..K} rel_i ÷ log2(i + 1)  (discounts: rank 1 → 1, rank 2 → 1/1.585, rank 3 → 1/2, rank 4 → 1/2.322, rank 5 → 1/2.585)
- IDCG@K = DCG of the ideal ordering (all judged documents sorted by grade).
- NDCG@K = DCG@K ÷ IDCG@K ∈ [0, 1].
A common variant uses gain 2^rel − 1 to reward highly relevant docs more; state which one you use.

| Metric | Graded? | Multiple relevant? | Use for |
|---|---|---|---|
| MRR | no | only first counts | QA/RAG with one gold chunk, navigation |
| NDCG@K | yes | yes | ranking quality, comparing rerankers, BEIR-style benchmarks (nDCG@10) |

**When to use:** MRR to judge rerankers in single-answer RAG; NDCG@10 when you have graded labels or several useful chunks per question.`,
      example: `**MRR over 4 queries** — first relevant result at ranks 1, 3, none, 2:
RR = 1, 1/3 = 0.333, 0, 1/2 = 0.5 → MRR = (1 + 0.333 + 0 + 0.5) ÷ 4 = 1.833 ÷ 4 = **0.458**.

**NDCG@5** — judged docs for the query have grades 3, 2, 1 (others 0). System ranking grades: [0, 2, 3, 0, 1].
- DCG = 0/1 + 2/1.585 + 3/2 + 0/2.322 + 1/2.585 = 0 + 1.262 + 1.500 + 0 + 0.387 = **3.149**
- Ideal [3, 2, 1, 0, 0]: IDCG = 3/1 + 2/1.585 + 1/2 = 3 + 1.262 + 0.5 = **4.762**
- NDCG@5 = 3.149 ÷ 4.762 = **0.661**

A reranked list [2, 3, 0, 1, 0]: DCG = 2 + 3/1.585 + 0 + 1/2.322 + 0 = 2 + 1.893 + 0.431 = 4.323 → NDCG@5 = 4.323 ÷ 4.762 = **0.908**.`,
      diagram: `  rank i:      1      2      3      4      5
  discount:  1/1.0  1/1.585 1/2.0 1/2.322 1/2.585
  grades:      0      2      3      0      1
  gain:       0.0   1.262  1.500   0.0   0.387   DCG  = 3.149
  ideal:       3      2      1      0      0
  gain:       3.0   1.262  0.500   0.0   0.0     IDCG = 4.762
                                         NDCG@5 = 3.149 / 4.762 = 0.661`,
      code: [
        {
          language: 'typescript',
          title: 'MRR and NDCG@K (linear gain) from scratch',
          code: `// MRR: ranks of the first relevant result per query (null = not found)
export function mrr(firstRelevantRanks: (number | null)[]): number {
  if (!firstRelevantRanks.length) return 0;
  const sum = firstRelevantRanks.reduce<number>((s, r) => s + (r ? 1 / r : 0), 0);
  return sum / firstRelevantRanks.length;
}

const dcg = (grades: number[], k: number) =>
  grades.slice(0, k).reduce((s, g, i) => s + g / Math.log2(i + 2), 0); // i is 0-based -> log2(rank + 1)

// grades: relevance of the returned docs in rank order
// judged: grades of ALL judged docs for the query (used to build the ideal ranking)
export function ndcgAtK(grades: number[], judged: number[], k: number): number {
  const ideal = [...judged].sort((a, b) => b - a);
  const idcg = dcg(ideal, k);
  return idcg === 0 ? 0 : dcg(grades, k) / idcg;
}

console.log(mrr([1, 3, null, 2]).toFixed(3));                    // 0.458
console.log(ndcgAtK([0, 2, 3, 0, 1], [3, 2, 1], 5).toFixed(3));  // 0.661
console.log(ndcgAtK([2, 3, 0, 1, 0], [3, 2, 1], 5).toFixed(3));  // 0.908`,
        },
      ],
      prosCons: {
        pros: [
          'Both reward putting relevant evidence early — what matters when only the top few chunks reach the LLM.',
          'NDCG handles graded relevance and multiple relevant documents in one normalised score.',
          'MRR is easy to explain: 0.5 ≈ "the first good result is typically at rank 2".',
        ],
        cons: [
          { con: 'MRR ignores everything after the first relevant hit, so it misses multi-evidence questions.', fix: 'Use NDCG@K or Recall@K for questions needing several chunks, and report MRR only alongside them.' },
          { con: 'NDCG depends on the ideal ranking, so incomplete or inconsistent grades distort it.', fix: 'Grade with a written rubric (0–3), compute IDCG from all judged docs for the query, and audit inter-annotator agreement.' },
          { con: 'Linear vs exponential gain variants give different numbers, making comparisons invalid.', fix: 'Fix one formula (and the log base) in your evaluation library and record it with every result.' },
        ],
      },
      keyPoints: [
        'MRR = mean of 1 ÷ rank of the first relevant result.',
        'DCG discounts gain by log2(rank + 1); NDCG divides by the ideal DCG.',
        'IDCG comes from all judged docs for the query, not just the retrieved ones.',
        'nDCG@10 is the standard headline metric on BEIR-style retrieval benchmarks.',
      ],
      exercise: {
        prompt: `Implement \`ndcgExpAtK(grades, judged, k)\` using the **exponential gain** variant and compare it with linear gain.

**Acceptance criteria:**
- Gain = 2^grade − 1; discount = log2(rank + 1).
- IDCG computed from \`judged\` sorted descending; return 0 when IDCG = 0.
- For grades [0,2,3,0,1], judged [3,2,1], k = 5: DCG = 0 + 3/1.585 + 7/2 + 0 + 1/2.585 = 1.893 + 3.5 + 0.387 = 5.780; IDCG = 7 + 3/1.585 + 1/2 = 9.393; NDCG ≈ 0.615.`,
        starter: {
          language: 'typescript',
          code: `export function ndcgExpAtK(grades: number[], judged: number[], k: number): number {
  // TODO: exponential gain DCG / ideal DCG
  return 0;
}`,
        },
        hints: [
          'gain(g) = Math.pow(2, g) - 1.',
          'Use index i (0-based) with Math.log2(i + 2).',
          'Reuse the same DCG function for the ideal list.',
        ],
        solution: {
          language: 'typescript',
          code: `const dcgExp = (grades: number[], k: number) =>
  grades.slice(0, k).reduce((s, g, i) => s + (Math.pow(2, g) - 1) / Math.log2(i + 2), 0);

export function ndcgExpAtK(grades: number[], judged: number[], k: number): number {
  const idcg = dcgExp([...judged].sort((a, b) => b - a), k);
  return idcg === 0 ? 0 : dcgExp(grades, k) / idcg;
}

// ndcgExpAtK([0,2,3,0,1], [3,2,1], 5) -> 5.780 / 9.393 = 0.615 (linear gain gave 0.661)`,
        },
        explanation:
          'Exponential gain makes a grade-3 document worth 7 versus 3 for grade 2, so missing the best document at rank 1 hurts more (0.615 vs 0.661 with linear gain). Neither is "right" — pick one and keep it fixed so scores stay comparable.',
      },
      quickCheck: {
        question: 'System A has MRR 0.80 and NDCG@10 0.55; system B has MRR 0.65 and NDCG@10 0.70. Your questions typically need 3–4 chunks of evidence. Which should you prefer?',
        options: [
          'A, because the first relevant result appears earlier',
          'B, because it ranks the full set of relevant (and highly graded) chunks better within the top 10',
          'Neither; MRR and NDCG cannot be compared',
          'A, because MRR is always more reliable than NDCG',
        ],
        correct: 1,
        explanation:
          'For multi-evidence questions, what matters is getting all the useful chunks high in the list, which NDCG captures; MRR only looks at the first hit. A wins on single-answer lookups, but that is not the workload described.',
      },
      source: 'Järvelin & Kekäläinen 2002 — Cumulated gain-based evaluation; BEIR (Thakur et al. 2021)',
    },
  ],
  codeChallenges: [
    {
      id: 'rag-evaluation-cc-1',
      title: 'Fix a retrieval evaluation script that reports impossible scores',
      context:
        'A teammate\'s eval script reports Recall@5 = 0.97 for a new retriever, but users still see wrong answers. Review shows it iterates over the run (so crashed queries vanish), divides by the number of returned results, counts duplicate chunk ids twice, and silently treats queries with no labels as perfect.',
      task: 'Rewrite the evaluator so every labelled query counts, duplicates are removed, recall divides by the number of relevant items, unlabelled queries are excluded and reported, and per-slice results are returned.',
      starter: {
        language: 'typescript',
        code: `export function evaluate(run: Record<string, string[]>, qrels: Record<string, string[]>, k = 5) {
  let total = 0;
  for (const [q, docs] of Object.entries(run)) {
    const rel = qrels[q] ?? [];
    const top = docs.slice(0, k);
    const hits = top.filter(d => rel.includes(d)).length;
    total += rel.length ? hits / top.length : 1;
  }
  return total / Object.keys(run).length;
}`,
      },
      hints: [
        'Loop over the labelled queries (qrels), and treat a missing run entry as an empty list.',
        'Deduplicate the ranked list while preserving order before slicing to k.',
        'Recall divides by the number of relevant items; collect unlabelled query ids separately.',
      ],
      solution: {
        language: 'typescript',
        code: `type Slice = string;
type Item = { relevant: string[]; slice?: Slice };

export function evaluate(run: Record<string, string[]>, qrels: Record<string, Item>, k = 5) {
  const perQuery: { q: string; recall: number; hit: number; rr: number; slice: Slice }[] = [];
  const unlabelled: string[] = [];
  for (const [q, item] of Object.entries(qrels)) {
    const rel = new Set(item.relevant);
    if (rel.size === 0) { unlabelled.push(q); continue; } // evaluate refusals separately
    const ranked = [...new Set(run[q] ?? [])];             // missing run = empty; dedupe keeps first rank
    const top = ranked.slice(0, k);
    const hits = top.filter((d) => rel.has(d)).length;
    const first = ranked.findIndex((d) => rel.has(d));
    perQuery.push({
      q,
      recall: hits / rel.size,                             // divide by relevant, not by returned
      hit: hits > 0 ? 1 : 0,
      rr: first >= 0 && first < k ? 1 / (first + 1) : 0,  // MRR@k
      slice: item.slice ?? 'all',
    });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const summarise = (rows: typeof perQuery) => ({
    n: rows.length,
    recallAtK: mean(rows.map((r) => r.recall)),
    hitAtK: mean(rows.map((r) => r.hit)),
    mrrAtK: mean(rows.map((r) => r.rr)),
  });
  const slices: Record<string, ReturnType<typeof summarise>> = {};
  for (const s of new Set(perQuery.map((r) => r.slice))) slices[s] = summarise(perQuery.filter((r) => r.slice === s));
  return { overall: summarise(perQuery), slices, unlabelled, worst: perQuery.sort((a, b) => a.recall - b.recall).slice(0, 10) };
}`,
      },
      explanation:
        'Iterating over qrels makes failures visible; dividing by |relevant| is the actual definition of recall (dividing by returned results is precision with a shrinking denominator); deduping prevents one chunk counting twice; unlabelled queries no longer score a free 1.0; slices and the worst-10 list turn a single number into a debugging tool.',
      followUps: [
        { q: 'Why can deduplication change MRR?', a: 'If a duplicate of an irrelevant chunk occupied rank 2, removing it moves later chunks up, so the first relevant result may get a better rank; the metric then reflects distinct evidence rather than index duplication.' },
        { q: 'How would you add confidence intervals?', a: 'Bootstrap: resample queries with replacement ~1,000 times, recompute the mean each time, and report the 2.5th–97.5th percentiles; for comparing two systems, bootstrap the paired per-query differences.' },
      ],
    },
    {
      id: 'rag-evaluation-cc-2',
      title: 'Make an LLM-judge faithfulness scorer reproducible and robust',
      context:
        'A RAG team scores faithfulness with one LLM call: "Rate 1-10 how faithful this answer is". Scores jump by ±1.5 between runs, the judge sometimes returns prose, and long contexts get truncated silently.',
      task: 'Rewrite it RAGAS-style: extract atomic claims, verify each against the context with a structured verdict, compute supported ÷ total, pin temperature, validate JSON, and handle empty answers and long contexts.',
      starter: {
        language: 'typescript',
        code: `export async function faithfulness(answer: string, context: string) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Rate 1-10 how faithful this answer is to the context.\\n' + context + '\\n' + answer }],
  });
  return Number(r.choices[0].message.content) / 10;
}`,
      },
      hints: [
        'Two steps: claims = extract(answer); verdicts = verify(claims, context).',
        'Use structured outputs (zod) so the judge must return arrays of verdicts.',
        'Score = supported ÷ total; return null for answers with zero claims (e.g. refusals).',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const openai = new OpenAI();
const JUDGE = process.env.JUDGE_MODEL ?? 'gpt-5-mini';
const MAX_CONTEXT_CHARS = 24_000;

const Claims = z.object({ claims: z.array(z.string()) });
const Verdicts = z.object({ verdicts: z.array(z.object({ claim: z.string(), supported: z.boolean(), reason: z.string() })) });

async function judge<T extends z.ZodTypeAny>(schema: T, name: string, prompt: string): Promise<z.infer<T>> {
  const r = await openai.chat.completions.parse({
    model: JUDGE,
    // temperature 0 for reproducibility; gpt-5 reasoning models reject it, so only send it to others
    ...(JUDGE.startsWith('gpt-5') ? {} : { temperature: 0 }),
    messages: [{ role: 'user', content: prompt }],
    response_format: zodResponseFormat(schema, name),
  });
  const parsed = r.choices[0].message.parsed;
  if (!parsed) throw new Error('judge refused or returned invalid JSON');
  return schema.parse(parsed); // re-validate at runtime; also gives the exact z.infer<T> type
}

export async function faithfulness(answer: string, context: string): Promise<number | null> {
  if (!answer.trim()) return null;
  if (context.length > MAX_CONTEXT_CHARS) throw new Error('context too long: chunk it instead of truncating');
  const { claims } = await judge(Claims, 'claims',
    'Split the ANSWER into short, self-contained factual claims. Ignore greetings and hedges.\\nANSWER:\\n' + answer);
  if (!claims.length) return null; // refusal or no factual content: not scored
  const { verdicts } = await judge(Verdicts, 'verdicts',
    'For each claim, decide if it can be directly inferred from the CONTEXT. Do not use outside knowledge.\\n' +
    'CONTEXT:\\n' + context + '\\nCLAIMS:\\n' + claims.map((c, i) => i + 1 + '. ' + c).join('\\n'));
  const supported = verdicts.filter((v) => v.supported).length;
  return supported / claims.length; // RAGAS-style: supported / total claims
}`,
      },
      explanation:
        'Decomposing into claims and judging each one is far more stable than a holistic 1–10 rating, and it produces actionable output (which claim is unsupported and why). Structured outputs eliminate prose responses, temperature 0 and a pinned model reduce variance, refusals are excluded rather than scored 0 or 1, and over-long contexts fail loudly instead of being silently truncated.',
      followUps: [
        { q: 'How do you check the judge itself is trustworthy?', a: 'Label 100 claim/context pairs by hand, compute the judge\'s precision and recall for "unsupported", and only trust the metric if agreement is high (e.g. Cohen\'s kappa ≥ 0.7); re-run this check whenever the judge model changes.' },
        { q: 'Why exclude refusals instead of scoring them 1.0?', a: 'A refusal contains no claims, so faithfulness is undefined; scoring it 1.0 rewards systems that refuse too often. Track refusal rate as a separate metric.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'rag-evaluation-iq-1',
      difficulty: 'medium',
      question: 'You are asked to "add evaluation" to an existing RAG chatbot with no labelled data. What do you build in the first two weeks?',
      whatInterviewerLooksFor: [
        'Golden set bootstrapping strategy (real + synthetic, human review)',
        'Separate retrieval and generation metrics',
        'CI integration and baselines',
        'Online signals and sampling',
      ],
      modelAnswer: `**Week 1 — dataset and baseline**
1. **Sample 300 real questions** from logs, stratified by intent; tag each (keyword, how-to, multi-part, temporal, unanswerable).
2. **Label**: for each, find gold document/chunk ids via pooling (BM25 + dense + current system top 10) and write a short reference answer. Use an LLM to draft, humans to verify (≈ 1–2 min per item).
3. **Add 100 synthetic questions** generated from under-covered documents, paraphrased away from chunk wording.
4. **Baseline**: Hit@5, Recall@50, MRR for retrieval; RAGAS faithfulness, response relevancy, context precision/recall and answer correctness for generation; latency and cost.

**Week 2 — automation**
- A CLI/CI job that runs the pipeline over the golden set and fails the PR if key metrics drop beyond a threshold (e.g. Hit@5 −3 pts, faithfulness −0.05).
- Per-slice reports and a "worst 20" list with traces.
- Judge validation: compare LLM-judge verdicts with 50 human labels.
- **Online**: sample 1–5% of traffic for reference-free metrics (faithfulness, relevancy) plus thumbs-up/down and citation clicks; route low scores to a review queue that feeds the golden set.`,
      followUps: [
        { q: 'How large should the golden set be?', a: 'Enough for the precision you need: ~100 items give roughly ±8 points 95% CI on an 80% metric, ~700 give ±3 points; paired comparisons on the same questions need fewer.' },
        { q: 'How do you keep it fresh?', a: 'Add reviewed failures from production monthly, retire items tied to deleted documents, and version the set so scores are comparable across time.' },
      ],
      pitfalls: [
        'Only synthetic questions copied from chunk text',
        'One end-to-end score with no retrieval metrics',
        'No validation of the LLM judge',
      ],
    },
    {
      id: 'rag-evaluation-iq-2',
      difficulty: 'hard',
      question: 'Your new embedding model improves NDCG@10 by 6 points on the benchmark but answer correctness in production does not move. Explain possible reasons.',
      whatInterviewerLooksFor: [
        'Benchmark vs in-domain distribution mismatch',
        'Metric depth vs context depth mismatch',
        'Downstream bottlenecks (reranker, generator, prompt)',
        'Statistical significance and slicing',
      ],
      modelAnswer: `**1. Wrong yardstick.** A public benchmark (e.g. BEIR) is not your domain; gains there may not transfer. Re-measure on the in-domain golden set.

**2. Wrong depth.** NDCG@10 improved, but the LLM sees the top 5 *after reranking*. If the reranker reorders candidates anyway, first-stage improvements within the top 50 barely change what reaches the prompt. Check Recall@50 (candidate ceiling) and Hit@5 *after* reranking.

**3. Bottleneck elsewhere.** If Hit@5 was already ~0.9, answer failures come from generation (faithfulness, incomplete synthesis), content gaps, or stale documents — retrieval improvements cannot move correctness.

**4. Noise.** With 150 questions, a 1–2 point correctness change is within noise. Use paired bootstrap on per-question differences.

**5. Averages hide trade-offs.** The new model may help paraphrased questions and hurt keyword/ID queries. Slice by question type.

**Action plan:** evaluate the full pipeline stage by stage on the in-domain set — Recall@50 → Hit@5 after rerank → faithfulness → correctness — and find where the 6 points disappear.`,
      followUps: [
        { q: 'When would a first-stage improvement still matter with a reranker?', a: 'When it raises Recall@candidate-depth, i.e. brings in relevant chunks that were previously outside the top 50; the reranker can then promote them.' },
        { q: 'How do you test significance on paired results?', a: 'Compute per-question metric differences, bootstrap or use a paired t-test / Wilcoxon signed-rank, and report a confidence interval for the mean difference.' },
      ],
      pitfalls: [
        'Trusting public benchmarks as a proxy for production',
        'Ignoring the reranker between retrieval and the prompt',
        'Declaring wins without significance testing',
      ],
    },
    {
      id: 'rag-evaluation-iq-3',
      difficulty: 'hard',
      question: 'Walk me through how RAGAS computes faithfulness, response relevancy, context precision and context recall, and what each one can and cannot detect.',
      whatInterviewerLooksFor: [
        'Correct computation of each metric',
        'Which inputs each metric needs (reference or not)',
        'Failure modes each metric misses',
        'Awareness of LLM-judge variance',
      ],
      modelAnswer: `| Metric | Computation | Needs | Detects | Misses |
|---|---|---|---|---|
| **Faithfulness** | split answer into claims; judge each against contexts; supported ÷ total | answer, contexts | hallucinated or unsupported claims | answers that faithfully repeat *wrong* context |
| **Response relevancy** | LLM generates N questions from the answer; mean cosine similarity to the real question | question, answer (+ embeddings) | off-topic, evasive, incomplete answers | factual errors (a wrong but on-topic answer scores high) |
| **Context precision** | relevance verdict per retrieved chunk; average precision@k at relevant positions | question, contexts, reference | noisy context and relevant chunks ranked low | missing evidence |
| **Context recall** | split reference into claims; check which are attributable to contexts; attributed ÷ total | contexts, reference | missing evidence (retrieval incompleteness) | noise in the context |

**Reading them together**
- Low context recall → fix retrieval/content.
- High recall, low precision → add reranking/compression.
- Good context, low faithfulness → generation/prompt problem.
- Good faithfulness, low correctness → wrong or stale sources.

**Caveats:** every metric uses an LLM judge — pin the model and prompt, set temperature 0 where supported, validate against human labels, and compare systems on the same questions.`,
      followUps: [
        { q: 'Which metrics can run on live traffic without references?', a: 'Faithfulness and response relevancy; context precision has a reference-free variant that judges chunk relevance against the response, while context recall requires a reference answer.' },
        { q: 'Why might response relevancy penalise a correct answer?', a: 'If the answer adds long caveats or extra unrelated detail, the questions generated from it drift from the original question, lowering similarity even though the core answer is correct.' },
      ],
      pitfalls: [
        'Claiming faithfulness measures correctness',
        'Not knowing which metrics need a reference',
        'Treating LLM-judged metrics as exact',
      ],
    },
    {
      id: 'rag-evaluation-iq-4',
      difficulty: 'expert',
      question: 'Design an evaluation gate in CI that prevents RAG regressions without blocking every PR on noise.',
      context: 'The team ships prompt, chunking and model changes several times a week. Evaluation runs cost money and take time.',
      whatInterviewerLooksFor: [
        'Tiered evaluation (fast smoke vs full suite)',
        'Paired comparison and confidence intervals',
        'Per-slice guardrails and must-pass items',
        'Cost and determinism controls',
      ],
      modelAnswer: `**Tiers**
1. **Smoke (every PR, < 3 min):** 50 must-pass questions (critical policies, prior incidents) + deterministic retrieval metrics on the full golden set (Hit@5, Recall@50, MRR — cheap, no LLM judge). Fail on any must-pass regression.
2. **Full (on merge to main / nightly):** all 500 items with RAGAS metrics and answer correctness using a pinned judge.

**Decision rule (avoid noise)**
- Compare **paired** per-question scores between main and the PR on the same items; bootstrap a 95% CI of the difference.
- Block only when the CI is entirely below −δ (e.g. −2 pts) for a key metric, or any slice drops more than its own threshold.
- Warn (don't block) when the point estimate drops but the CI crosses zero.

**Determinism and cost**
- Cache pipeline outputs and judge verdicts keyed by (input hash, model, prompt version) — unchanged components are not re-judged.
- Temperature 0 where supported; pinned model versions; fixed seeds for sampling.
- Cheap judge for smoke; strong judge nightly; periodic human audit of judge agreement.

**Reporting:** PR comment with metric deltas, CIs, per-slice table and links to the five most changed questions with traces.`,
      followUps: [
        { q: 'How do you handle intentional behaviour changes (e.g. a new refusal policy)?', a: 'Update the affected golden items and must-pass expectations in the same PR, reviewed like code; the gate compares against the updated expectations.' },
        { q: 'What if the judge model is deprecated?', a: 'Run old and new judges side by side on the full set, measure agreement and offset, re-baseline historic scores, and only then switch.' },
      ],
      pitfalls: [
        'Absolute thresholds on noisy averages',
        'Running the full LLM-judged suite on every commit',
        'No must-pass set for critical questions',
      ],
    },
    {
      id: 'rag-evaluation-iq-5',
      difficulty: 'medium',
      question: 'Explain MRR and NDCG to a product manager, with a numeric example, and say when you would report each.',
      whatInterviewerLooksFor: [
        'Plain-English intuition with position discount',
        'Correct arithmetic',
        'Graded vs binary relevance',
        'Which fits single-answer vs multi-evidence RAG',
      ],
      modelAnswer: `**MRR — "how far down is the first good result?"** For each question, score 1 if the first useful result is at rank 1, 1/2 at rank 2, 1/3 at rank 3, and 0 if missing; average over questions.
Example: first hits at ranks 1, 2, 4 and one miss → (1 + 0.5 + 0.25 + 0) ÷ 4 = **0.4375**. Roughly: on average the first good chunk sits around rank 2–3.

**NDCG — "how close is our ordering to the perfect ordering?"** Each result has a usefulness grade (0–3). Each position's credit is discounted (rank 1 full credit, rank 2 ≈ 63%, rank 3 = 50%, …). Add it up (DCG) and divide by the best possible score (ideal DCG).
Example: grades in our order [2, 0, 3]; ideal [3, 2, 0].
- DCG = 2/1 + 0 + 3/2 = 3.5
- IDCG = 3/1 + 2/1.585 + 0 = 4.262
- NDCG = 3.5 ÷ 4.262 = **0.821** — we got 82% of the ideal ordering's value; the best document sat at rank 3 instead of 1.

**When to report which**
- **MRR** for single-answer lookups (FAQ, one gold chunk), and to judge rerankers in that setting.
- **NDCG@K** when several chunks matter or relevance is graded (research, multi-part answers).
- Always alongside **Recall/Hit@K** at the number of chunks we actually send to the model.`,
      followUps: [
        { q: 'Is an MRR of 0.5 good?', a: 'It depends on K and the product: with only the top 3 chunks sent to the model, 0.5 means the first hit is often at rank 2, which is fine if recall@3 is high; compare against your baseline rather than an absolute bar.' },
        { q: 'Why normalise DCG?', a: 'Queries have different numbers and grades of relevant documents, so raw DCG is not comparable across queries; dividing by the ideal DCG maps every query to 0–1.' },
      ],
      pitfalls: [
        'Using MRR when several chunks are needed',
        'Computing IDCG from the retrieved list only',
        'No numeric example or wrong discounts',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'rag-evaluation-est-1',
      question: 'What does a nightly LLM-judged RAGAS run over a 500-question golden set cost per month with a strong judge versus a cheap judge?',
      assumptions: [
        'Per question — faithfulness: claim extraction 1,000 in / 200 out + verification 3,500 in / 300 out',
        'Response relevancy: 500 in / 150 out (3 generated questions); embedding cost negligible',
        'Context precision: 5 chunk verdicts × 900 in / 50 out; context recall: 3,500 in / 300 out',
        'Strong judge illustrative price $3 / 1M in, $15 / 1M out; cheap judge $0.25 / 1M in, $2 / 1M out; 30 runs/month',
      ],
      steps: [
        { label: 'Input tokens per question', calc: '1,000 + 3,500 + 500 + 5 × 900 + 3,500 = 13,000' },
        { label: 'Output tokens per question', calc: '200 + 300 + 150 + 5 × 50 + 300 = 1,200' },
        { label: 'Per run', calc: '500 × 13,000 = 6.5M input; 500 × 1,200 = 0.6M output' },
        { label: 'Strong judge per run', calc: '6.5 × $3 + 0.6 × $15 = $19.5 + $9 = $28.5' },
        { label: 'Cheap judge per run', calc: '6.5 × $0.25 + 0.6 × $2 = $1.63 + $1.20 = $2.83' },
        { label: 'Monthly (30 runs)', calc: 'strong: $855; cheap: ≈ $85' },
      ],
      answer: 'About $855/month with a strong judge versus ~$85/month with a cheap judge (plus the cost of running the RAG pipeline itself).',
      insight:
        'Context precision dominates input tokens (one call per chunk), so batching all chunk verdicts into one call or caching verdicts for unchanged (question, chunk) pairs cuts cost more than switching judges. A common pattern: cheap judge nightly, strong judge weekly, and human audit of both.',
      followUps: [
        { q: 'How much would caching save if only 20% of answers change per night?', a: 'Judging only the 100 changed items cuts per-run cost by ~80%: about $5.7 per strong-judge run, or ~$171/month instead of $855.' },
      ],
    },
    {
      id: 'rag-evaluation-est-2',
      question: 'How many golden questions do you need to measure Hit@5 (≈ 80%) to within ±3 points, and how wide is the uncertainty with only 100 questions?',
      assumptions: [
        'Hit@5 per question is a 0/1 outcome with p ≈ 0.8',
        'Normal approximation; 95% confidence → z = 1.96',
        'Questions independent; unpaired estimate of a single system',
      ],
      steps: [
        { label: 'Standard error', calc: 'SE = sqrt(p(1 − p) / n) = sqrt(0.16 / n)' },
        { label: 'Half-width at n = 100', calc: '1.96 × sqrt(0.16 / 100) = 1.96 × 0.04 = 0.078 → ±7.8 points' },
        { label: 'Solve for ±3 points', calc: 'n = 1.96² × 0.16 / 0.03² = 3.8416 × 0.16 / 0.0009 = 0.6147 / 0.0009 ≈ 683' },
        { label: 'Solve for ±5 points', calc: 'n = 0.6147 / 0.0025 ≈ 246' },
      ],
      answer: 'About 683 questions for ±3 points (≈ 246 for ±5); with 100 questions the 95% interval is ±7.8 points.',
      insight:
        'Small golden sets cannot detect small improvements, so a "+2 points" claim on 100 questions is noise. Paired comparisons (both systems on the same questions) need far fewer items because they cancel per-question difficulty — always evaluate A/B on identical questions and bootstrap the differences.',
      followUps: [
        { q: 'Why do paired comparisons need fewer questions?', a: 'Most questions are solved (or failed) by both systems; only discordant questions carry information, so the variance of the difference is much smaller than the variance of each system\'s score.' },
      ],
    },
  ],
  test: [
    {
      id: 'rag-evaluation-mcq-01',
      difficulty: 'medium',
      question: 'A query has 4 relevant chunks. Your top 5 contains 2 of them, at ranks 2 and 5. What are P@5, R@5 and the reciprocal rank?',
      options: [
        'P@5 = 0.4, R@5 = 0.5, RR = 0.5',
        'P@5 = 0.5, R@5 = 0.4, RR = 0.5',
        'P@5 = 0.4, R@5 = 0.5, RR = 0.2',
        'P@5 = 0.4, R@5 = 0.4, RR = 1.0',
      ],
      correct: [0],
      explanation:
        'P@5 = 2 ÷ 5 = 0.4; R@5 = 2 ÷ 4 = 0.5; the first relevant result is at rank 2 so RR = 1/2 = 0.5. Swapping P and R or using the last relevant rank (1/5) are the classic slips.',
      followUps: [
        { q: 'What is R-precision for this query?', a: 'Precision at K = 4 (the number of relevant chunks): only the rank-2 hit is in the top 4, so R-precision = 1 ÷ 4 = 0.25.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-02',
      difficulty: 'hard',
      question: 'What does this function return for ndcg([1, 0, 2], [2, 1], 3), and is the implementation correct?',
      code: {
        language: 'typescript',
        code: `const dcg = (g: number[], k: number) =>
  g.slice(0, k).reduce((s, x, i) => s + x / Math.log2(i + 2), 0);
const ndcg = (got: number[], judged: number[], k: number) =>
  dcg(got, k) / dcg([...judged].sort((a, b) => b - a), k);`,
      },
      options: [
        '≈ 0.76, and the implementation is correct for every possible input',
        '≈ 0.76 — the formula is right, but it returns NaN when every judged grade is 0 (IDCG = 0)',
        '1.0 — the ideal list is built from the retrieved grades, so it always matches',
        '≈ 0.50 — Math.log2 makes the discounts too steep',
      ],
      correct: [1],
      explanation:
        'DCG = 1/1 + 0/1.585 + 2/2 = 2.0; IDCG = 2/1 + 1/1.585 = 2.631; NDCG = 2.0 / 2.631 = 0.760. The formula is right, but with all-zero judged grades IDCG = 0 and 0/0 gives NaN, which poisons any average — guard it. The ideal list comes from the judged grades (not the retrieved ones), and log2(rank + 1) is the standard discount.',
      followUps: [
        { q: 'What should NDCG return when IDCG is 0?', a: 'Conventionally 0 (or exclude the query), because there is no relevant document to rank; document whichever convention you use.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL metrics that require a reference (ground-truth) answer or gold labels.',
      options: [
        'Context recall (RAGAS)',
        'Faithfulness (RAGAS)',
        'Recall@K against gold chunk ids',
        'Response relevancy (RAGAS)',
      ],
      correct: [0, 2],
      explanation:
        'Context recall checks reference-answer claims against the contexts, and Recall@K needs gold ids. Faithfulness compares the answer to the retrieved contexts and response relevancy compares the answer to the question — both are reference-free and can run on live traffic.',
      followUps: [
        { q: 'Which of the reference-free metrics would catch a confident answer built on the wrong policy document?', a: 'Neither reliably: faithfulness would be high (the answer matches the wrong context) and relevancy would be high (it addresses the question); you need correctness against a reference or a document-version check.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-04',
      difficulty: 'medium',
      question: 'Your RAG system answers with high faithfulness (0.94) but low context recall (0.48). What is the most likely user-visible symptom?',
      options: [
        'Answers contain invented facts',
        'Answers are well grounded but incomplete or miss key parts of the expected answer',
        'Answers are off-topic',
        'Answers are slow',
      ],
      correct: [1],
      explanation:
        'High faithfulness means the model sticks to its context; low context recall means that context lacks much of the needed information. The result is grounded but incomplete answers. Invented facts would lower faithfulness; off-topic answers show in relevancy; latency is unrelated.',
      followUps: [
        { q: 'Which levers raise context recall?', a: 'Hybrid search, query decomposition or multi-query, larger candidate depth plus reranking, better chunking, and adding missing content to the corpus.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-05',
      difficulty: 'hard',
      question: 'Select ALL statements about MRR that are correct.',
      options: [
        'It only considers the rank of the first relevant result per query',
        'A query with no relevant result in the list contributes 0',
        'It rewards systems that retrieve all relevant documents for multi-part questions',
        'An MRR of 0.25 is consistent with the first relevant result typically appearing around rank 4',
      ],
      correct: [0, 1, 3],
      explanation:
        'MRR uses 1 ÷ rank of the first hit, gives 0 when there is none, and 0.25 corresponds to rank 4 on average (as a rough reading). It ignores later relevant documents, so it does not reward complete retrieval for multi-part questions — that is NDCG or recall territory.',
      followUps: [
        { q: 'Why is "MRR 0.25 ≈ rank 4" only a rough reading?', a: 'MRR is a mean of reciprocals, so mixtures matter: half the queries at rank 1 and half missing also give 0.5, very different from all at rank 2.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-06',
      difficulty: 'expert',
      question: 'This evaluation loop reports Recall@5 = 1.0 for a retriever that crashes on 30% of queries. Why?',
      code: {
        language: 'typescript',
        code: `let sum = 0, n = 0;
for (const [q, ranked] of Object.entries(run)) {   // run only has successful queries
  const rel = qrels[q];
  sum += ranked.slice(0, 5).filter(d => rel.has(d)).length / rel.size;
  n++;
}
console.log('Recall@5', sum / n);`,
      },
      options: [
        'slice(0, 5) includes six items',
        'It iterates over the run, so failed queries are never counted; it should iterate over qrels and treat missing runs as empty',
        'Dividing by rel.size overestimates recall',
        'Object.entries reorders the ranked list',
      ],
      correct: [1],
      explanation:
        'Queries absent from the run silently drop out of both numerator and denominator, so the metric only reflects successful queries. Iterate over the labelled queries and score missing ones as 0. slice(0, 5) returns five items, dividing by |relevant| is the correct definition, and Object.entries does not reorder array values.',
      followUps: [
        { q: 'What else should the report include to catch this?', a: 'The count of evaluated queries versus labelled queries, and an error-rate metric, so coverage gaps are visible next to the score.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-07',
      difficulty: 'hard',
      question: 'You add a cross-encoder reranker over the top 50 and send the top 5 to the LLM. Which metric pattern do you expect?',
      options: [
        'Recall@50 up, Hit@5 unchanged',
        'Recall@50 unchanged, Hit@5 and MRR up',
        'Everything unchanged, only latency changes',
        'Recall@50 down, NDCG@10 up',
      ],
      correct: [1],
      explanation:
        'Reranking reorders the same 50 candidates, so Recall@50 is fixed while relevant chunks move into the top ranks, raising Hit@5 and MRR. Recall@50 can only change if candidate generation changes.',
      followUps: [
        { q: 'What does it mean if Hit@5 barely improves after reranking?', a: 'Either relevant chunks were already at the top, or they are absent from the 50 candidates (low Recall@50); check Recall@50 to tell which.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-08',
      difficulty: 'medium',
      question: 'Your golden set was generated by asking an LLM to write one question per chunk. Dense retrieval scores Hit@5 = 0.96 on it but users report misses. What is the most likely issue?',
      options: [
        'Hit@5 is the wrong metric for RAG',
        'Synthetic questions reuse chunk wording, so they are much easier than real user questions',
        'The LLM generated too many questions',
        'Dense retrieval cannot be evaluated offline',
      ],
      correct: [1],
      explanation:
        'Questions written while looking at a chunk share its vocabulary and structure, inflating retrieval scores. Real queries are shorter, vaguer and use different terms. Mix in real logged questions and prompt the generator to paraphrase.',
      followUps: [
        { q: 'How can you make synthetic questions harder?', a: 'Ask for user-style phrasing without copying key terms, generate multi-chunk and multi-hop questions, and filter out questions with high lexical overlap with their source chunk.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-09',
      difficulty: 'expert',
      question: 'Select ALL practices that make LLM-judged RAG metrics more trustworthy.',
      options: [
        'Pinning the judge model version and prompt, with temperature 0 where supported',
        'Validating judge verdicts against a human-labelled sample and tracking agreement',
        'Using the same model as both generator and only judge to keep scoring consistent',
        'Comparing systems on the same questions and bootstrapping per-question differences',
      ],
      correct: [0, 1, 3],
      explanation:
        'Pinning reduces variance, human validation measures judge accuracy, and paired comparison with bootstrapping separates real changes from noise. Using the generator as its own sole judge risks self-preference bias; prefer a different or validated judge.',
      followUps: [
        { q: 'What agreement statistic would you report?', a: 'Cohen\'s kappa (or Krippendorff\'s alpha) between judge and human labels, plus precision and recall of the judge on the "unsupported/irrelevant" class.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-10',
      difficulty: 'hard',
      question: 'Given these per-query results, what do the macro and micro Recall@5 averages come out to?',
      code: {
        language: 'typescript',
        code: `const results = [
  { query: 'A', hitsInTop5: 3, totalRelevant: 5 },
  { query: 'B', hitsInTop5: 1, totalRelevant: 1 },
  { query: 'C', hitsInTop5: 0, totalRelevant: 2 },
];`,
      },
      options: [
        'Macro 0.533, micro 0.500',
        'Macro 0.500, micro 0.533',
        'Macro 0.533, micro 0.533',
        'Macro 0.600, micro 0.500',
      ],
      correct: [0],
      explanation:
        'Macro = mean of per-query recalls = (0.6 + 1.0 + 0) ÷ 3 = 0.533. Micro = total hits ÷ total relevant = (3 + 1 + 0) ÷ (5 + 1 + 2) = 4 ÷ 8 = 0.5. They differ because micro weights queries with more relevant chunks more heavily.',
      followUps: [
        { q: 'Which average is standard for retrieval benchmarks?', a: 'Macro (per-query) averaging, so each question counts equally regardless of how many relevant documents it has.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-11',
      difficulty: 'expert',
      question: 'Select ALL situations where NDCG@K is a better choice than MRR.',
      options: [
        'Relevance labels are graded 0–3 and partially relevant chunks still help',
        'Answers typically need evidence from several chunks',
        'Each question has exactly one gold chunk and only the first hit matters',
        'You are comparing rerankers on how well they order all useful chunks in the top 10',
      ],
      correct: [0, 1, 3],
      explanation:
        'NDCG uses graded gains and credits every relevant result with a position discount, so it suits graded labels, multi-evidence questions and full-ordering comparisons. With one gold chunk and first-hit semantics, MRR is simpler and equally informative.',
      followUps: [
        { q: 'What does NDCG reduce to with binary labels and one relevant document?', a: 'With a single relevant document, IDCG = 1 and NDCG = 1 ÷ log2(rank + 1), a gentler discount than MRR\'s 1 ÷ rank, but rank-equivalent for comparing systems on one query.' },
      ],
    },
    {
      id: 'rag-evaluation-mcq-12',
      difficulty: 'medium',
      question: 'Which pattern best indicates a generation-side problem rather than a retrieval problem?',
      options: [
        'Low Recall@50 and low context recall',
        'High Hit@5 and high context recall, but low faithfulness',
        'Low context precision with high recall',
        'High faithfulness and low answer correctness',
      ],
      correct: [1],
      explanation:
        'When the right evidence is retrieved (high Hit@5 and context recall) yet answers contain unsupported claims (low faithfulness), the generator or prompt is at fault. Low recall is retrieval; low precision is ranking/noise; high faithfulness with low correctness points to wrong sources.',
      followUps: [
        { q: 'What fixes would you try first for low faithfulness?', a: 'Stricter grounding instructions with mandatory citations, less noisy context via reranking, lower temperature, and a post-generation claim check that removes or flags unsupported sentences.' },
      ],
    },
  ],
};

export default topic;
