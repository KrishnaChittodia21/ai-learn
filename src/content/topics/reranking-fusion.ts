import type { Topic } from '../../types';

const topic: Topic = {
  id: 'reranking-fusion',
  phase: 'retrieval',
  order: 4,
  title: 'Reranking and Result Fusion',
  subtitle: 'Retrieve wide, rerank precisely, fuse lists sensibly and pick the right K',
  estimatedMinutes: 68,
  sources: [
    'Nogueira and Cho 2019 — Passage Re-ranking with BERT',
    'Reimers and Gurevych 2019 — Sentence-BERT (bi-encoders) and sentence-transformers CrossEncoder docs',
    'Hugging Face model cards — cross-encoder/ms-marco-MiniLM-L-6-v2, BAAI/bge-reranker-v2-m3',
    'Cohere docs — Rerank v2 API (rerank-v4.0-pro, rerank-v4.0-fast, rerank-v3.5)',
    'Sun et al. 2023 — Is ChatGPT Good at Search? Investigating LLMs as Re-Ranking Agents (RankGPT)',
    'Cormack, Clarke and Büttcher 2009 — Reciprocal Rank Fusion outperforms Condorcet and individual rank learning methods (SIGIR)',
    'Weaviate docs and blog — Hybrid search fusion algorithms (rankedFusion vs relativeScoreFusion)',
    'Elastic docs — Reciprocal rank fusion (rank_constant default 60)',
    'Anthropic (Sep 2024) — Introducing Contextual Retrieval (top-20 vs 10 vs 5; rerank 150 → 20)',
  ],
  tags: ['reranking', 'cross-encoder', 'bi-encoder', 'Cohere Rerank', 'RRF', 'score fusion', 'top-k', 'hybrid search'],
  cheatSheet: [
    'Two-stage retrieval: cheap recall stage (BM25/vector, top 50–150) → expensive precision stage (reranker) → top 5–20 to the LLM.',
    'Bi-encoder: query and doc embedded separately, precomputable, fast. Cross-encoder: [query, doc] read jointly, far more accurate, cost scales with candidates.',
    'Common rerankers: Cohere rerank-v4.0-pro/fast (API), BAAI/bge-reranker-v2-m3 (open, multilingual), cross-encoder/ms-marco-MiniLM-L-6-v2 (tiny, CPU-friendly).',
    'LLM rerankers: pointwise (score each), pairwise, listwise (RankGPT sliding window of 20, step 10). Watch for position bias and cost.',
    'RRF: score(d) = Σ 1 / (k + rank_i(d)), k = 60 by default; uses ranks only, so no score normalisation is needed.',
    'Score fusion: normalise first (min-max or z-score), then combine α·dense + (1−α)·sparse; Weaviate relativeScoreFusion is min-max based.',
    'Never add raw BM25 (0–30+) to cosine (0–1): the larger scale silently dominates.',
    'Top-K: recall rises with K, precision and faithfulness eventually fall; Anthropic found 20 chunks beat 10 and 5 in its tests.',
    'Use a reranker score threshold plus min/max K bounds to make K dynamic per query.',
    'Evaluate each stage separately: recall@100 for the first stage, NDCG@10 / MRR after reranking, answer accuracy end to end.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Reranking — a second, smarter pass over candidates',
      body: `A first-stage retriever is a fast but rough sieve; a **reranker** is the expert who reads the shortlist carefully. You retrieve wide (50–150 candidates) for **recall**, then reorder with a stronger model for **precision**, and send only the top few to the LLM.

**Why not just use the strong model everywhere?** It is too slow to score millions of documents per query. The first stage uses precomputed indexes (HNSW, inverted index); the reranker only touches the shortlist.

| Stage | Model | Candidates | Latency (illustrative) | Optimises |
|---|---|---|---|---|
| 1. Retrieve | BM25, bi-encoder, hybrid | millions → 100 | 5–50 ms | recall@100 |
| 2. Rerank | cross-encoder or LLM | 100 → 10 | 50–400 ms | NDCG@10, precision |
| 3. Generate | LLM | 10 chunks | 0.5–3 s | faithful answer |

**Kinds of rerankers:** cross-encoders (next section), LLM-based rerankers, and lightweight rule-based rerankers (recency boosts, source authority, dedupe, diversity via MMR).

**When to use it:** almost always in production RAG. It is usually the single biggest quality win per line of code. Skip it only when latency budgets are under ~50 ms or the corpus is tiny.`,
      example: `Query: "Can I carry over unused vacation days to next year?"

First stage (vector, top 50) puts at #1 "Vacation request process" (cos 0.84), #2 "Holiday calendar 2026" (0.83) and the right answer, "Carry-over policy: max 5 days until March 31", at **#7** (0.79).

A cross-encoder reranker scores the 50 pairs: carry-over policy **0.97**, vacation request process 0.41, holiday calendar 0.08. The right chunk moves from #7 to **#1**. With top-5 sent to the LLM, the answer goes from "I couldn't find a policy" to "Yes, up to 5 days, used by March 31." Cost: about 120 ms extra latency.`,
      diagram: `query
  │
  ▼
┌────────────────┐ millions  ┌──────────────┐  top 100  ┌──────────────┐ top 8
│ index (BM25 /  │──────────►│ candidates   │──────────►│  reranker    │──────► LLM
│ HNSW vectors)  │  fast,    │ recall@100   │  slow,    │ (cross-enc / │
└────────────────┘  rough    └──────────────┘  precise  │  LLM)        │
                                                        └──────────────┘
        stage 1: cheap, precomputed          stage 2: expensive, per-query`,
      code: [
        {
          language: 'typescript',
          title: 'Retrieve wide, rerank, keep the best (pluggable reranker)',
          code: `type Doc = { id: string; text: string; source: string; updatedAt: string };
type Scored = Doc & { score: number };

// Any reranker: cross-encoder service, Cohere API, LLM, ...
type Reranker = (query: string, docs: Doc[]) => Promise<number[]>;

declare function vectorSearch(query: string, k: number): Promise<Doc[]>;

export async function retrieve(query: string, rerank: Reranker, finalK = 8): Promise<Scored[]> {
  const candidates = await vectorSearch(query, 100); // stage 1: optimise recall

  // dedupe by id before paying for reranking
  const unique = [...new Map(candidates.map((d) => [d.id, d])).values()];

  const scores = await rerank(query, unique); // stage 2: optimise precision
  return unique
    .map((d, i) => ({ ...d, score: scores[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, finalK);
}`,
        },
      ],
      prosCons: {
        pros: [
          'Large precision gains (often +10–30% NDCG@10) for little code.',
          'Lets the first stage be cheap and recall-oriented.',
          'Model-agnostic: works on top of BM25, vectors or hybrid results.',
        ],
        cons: [
          {
            con: 'Adds latency proportional to the number of candidates.',
            fix: 'Rerank 30–100 candidates rather than 500, truncate passages to ~256–512 tokens, batch on GPU, and use a fast model (MiniLM, rerank-v4.0-fast) for interactive paths.',
          },
          {
            con: 'Cannot recover documents the first stage never retrieved.',
            fix: 'Measure first-stage recall@100 separately; improve it with hybrid search or query expansion before tuning the reranker.',
          },
          {
            con: 'Generic rerankers may misjudge domain jargon.',
            fix: 'Fine-tune an open cross-encoder on a few thousand labelled (query, relevant, hard-negative) triples from your logs.',
          },
        ],
      },
      keyPoints: [
        'Stage 1 maximises recall; stage 2 maximises precision.',
        'Rerank tens to low hundreds of candidates, never the whole corpus.',
        'A reranker cannot fix missing recall.',
        'Dedupe before reranking to avoid paying twice.',
      ],
      exercise: {
        prompt: `Add a **business-rule rerank** after the model reranker: \`applyBoosts(docs)\` should

- multiply the score by **1.15** if \`source === 'policy-portal'\` (authoritative);
- multiply by **0.7** if \`updatedAt\` is older than 365 days;
- drop documents whose final score is below **0.2**;
- return them sorted by final score, descending.

Use a fixed \`now\` parameter so the function is testable.`,
        starter: {
          language: 'typescript',
          code: `type Scored = { id: string; source: string; updatedAt: string; score: number };

export function applyBoosts(docs: Scored[], now: Date): Scored[] {
  // TODO: authority boost, staleness penalty, threshold, sort
  return docs;
}`,
        },
        hints: [
          'Compute age in days: (now.getTime() - new Date(d.updatedAt).getTime()) / 86_400_000.',
          'Apply both multipliers, then filter, then sort.',
          'Return new objects rather than mutating the inputs.',
        ],
        solution: {
          language: 'typescript',
          code: `type Scored = { id: string; source: string; updatedAt: string; score: number };

const DAY = 86_400_000;

export function applyBoosts(docs: Scored[], now: Date): Scored[] {
  return docs
    .map((d) => {
      let s = d.score;
      if (d.source === 'policy-portal') s *= 1.15; // authoritative source
      const ageDays = (now.getTime() - new Date(d.updatedAt).getTime()) / DAY;
      if (ageDays > 365) s *= 0.7; // stale content
      return { ...d, score: s };
    })
    .filter((d) => d.score >= 0.2) // threshold after boosts
    .sort((a, b) => b.score - a.score);
}`,
        },
        explanation:
          'Model rerankers judge semantic relevance; business rules encode things the model cannot see, such as authority and freshness. Applying them as multipliers keeps the model ordering mostly intact, and thresholding after boosting removes weak candidates.',
      },
      quickCheck: {
        question:
          'Recall@100 of your first stage is 62%. A stronger reranker is proposed. What is the realistic upper bound of what reranking can achieve?',
        options: [
          'It can raise recall@10 to nearly 100%',
          'It can only reorder what was retrieved, so at most 62% of questions can have the right document in the final top-K',
          'It improves recall@100 directly because it rescans the index',
          'It doubles recall because it uses a cross-encoder',
        ],
        correct: 1,
        explanation:
          'A reranker only reorders the candidate set. If the relevant document is missing from the top 100 for 38% of queries, no reranker can surface it. Fix first-stage recall (hybrid search, query expansion) first.',
      },
      source: 'Nogueira and Cho 2019 — Passage Re-ranking with BERT',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Cross-Encoder Reranking — reading query and document together',
      body: `A **bi-encoder** embeds the query and each document separately and compares vectors, like matching two people's CVs. A **cross-encoder** puts them in the same room: it feeds \`[CLS] query [SEP] document\` through one transformer, so every query token attends to every document token, and outputs one relevance score.

| | Bi-encoder | Cross-encoder |
|---|---|---|
| Input | query, doc separately | (query, doc) pair |
| Precompute docs? | yes, store vectors | no, run per query |
| Cost per query | 1 encoder pass + ANN | N passes (N = candidates) |
| Accuracy | good | notably better on fine distinctions |
| Use | first stage | reranking stage |

**Popular models (2026):**
- \`cross-encoder/ms-marco-MiniLM-L-6-v2\`: 22M params, English, CPU-friendly, a solid baseline.
- \`BAAI/bge-reranker-v2-m3\`: ~568M params, multilingual, open weights, self-hostable.
- **Cohere Rerank** (\`rerank-v4.0-pro\`, \`rerank-v4.0-fast\`, \`rerank-v3.5\`): managed API, multilingual, semi-structured (JSON) docs.

Scores are **relative** within a query (logits or 0–1 after a sigmoid); calibrate any threshold on your own data.

**When to use it:** the default reranker for production RAG; choose MiniLM for latency, bge-m3 or Cohere for multilingual or harder domains.`,
      example: `Query: "python list sort descending". Candidates:
- A: "Use sorted(items, reverse=True) to sort a list in descending order."
- B: "Descending stairs safely: hold the handrail..."
- C: "Python lists support append, pop and sort methods."

Bi-encoder cosine: A 0.71, C 0.69, **B 0.52** (the shared word "descending" helps B).
Cross-encoder (ms-marco-MiniLM logits, illustrative): **A 9.8**, C 3.1, B −10.9.

On 100 candidates of ~300 tokens, MiniLM-L6 took about 90 ms on a single T4 GPU and about 600 ms on 8 CPU cores (illustrative). bge-reranker-v2-m3 was roughly 5–8x slower but better on German and Hindi queries.`,
      diagram: `Bi-encoder (first stage)              Cross-encoder (rerank)
 query ─► [Encoder] ─► q⃗               [CLS] query [SEP] doc [SEP]
 doc   ─► [Encoder] ─► d⃗  (offline)              │
            cos(q⃗, d⃗) = score              [Transformer: full
                                            cross-attention]
 fast: docs pre-encoded                         │
 weak: no token interaction               ─► relevance logit
                                          slow: 1 pass per pair`,
      code: [
        {
          language: 'python',
          title: 'Rerank with sentence-transformers CrossEncoder',
          code: `# pip install sentence-transformers
from sentence_transformers import CrossEncoder

# Small English baseline; swap for "BAAI/bge-reranker-v2-m3" for multilingual
model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)

query = "Can I carry over unused vacation days?"
docs = [
    "Carry-over policy: up to 5 unused days may be used until March 31.",
    "To request vacation, submit a form in the HR portal 2 weeks ahead.",
    "Holiday calendar 2026: offices close on Dec 25 and Jan 1.",
]

# rank() scores every (query, doc) pair and sorts them
ranked = model.rank(query, docs, top_k=2, return_documents=True)
for r in ranked:
    print(round(float(r["score"]), 2), r["text"][:50])

# Raw scores for a batch of pairs (batching matters on GPU)
scores = model.predict([(query, d) for d in docs], batch_size=32)`,
        },
        {
          language: 'typescript',
          title: 'Same idea with the Cohere Rerank API',
          code: `import { CohereClientV2 } from 'cohere-ai';

const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });
const RERANK_MODEL = process.env.RERANK_MODEL ?? 'rerank-v4.0-fast';

export async function cohereRerank(query: string, docs: string[], topN = 8) {
  const res = await cohere.rerank({ model: RERANK_MODEL, query, documents: docs, topN });
  // results: [{ index, relevanceScore }] sorted by relevance
  return res.results.map((r) => ({ text: docs[r.index], score: r.relevanceScore }));
}`,
        },
      ],
      prosCons: {
        pros: [
          'Token-level interaction catches negation, word order and exact intent that vectors blur.',
          'Off-the-shelf models work well zero-shot on many domains.',
          'Open models (MiniLM, bge-reranker) can run on CPU or a small GPU with no data leaving your network.',
        ],
        cons: [
          {
            con: 'Cost is O(candidates × length): 200 candidates of 512 tokens is slow on CPU.',
            fix: 'Cap candidates at 50–100, truncate passages to 256–512 tokens around the best-matching span, and batch on GPU (or use ONNX/int8 quantised models).',
          },
          {
            con: 'Raw logits are not comparable across queries, so a fixed threshold misbehaves.',
            fix: 'Apply a sigmoid and calibrate thresholds on labelled data, or combine a threshold with min/max K bounds.',
          },
          {
            con: 'Long documents exceed max_length and get truncated.',
            fix: 'Rerank chunks (not whole documents) and aggregate to the document level with the max chunk score.',
          },
        ],
      },
      keyPoints: [
        'Bi-encoders for recall at scale; cross-encoders for precision on a shortlist.',
        'Cross-encoders cannot precompute document representations.',
        'MiniLM-L6 for speed, bge-reranker-v2-m3 or Cohere for multilingual quality.',
        'Scores are relative per query; calibrate before thresholding.',
      ],
      exercise: {
        prompt: `Write \`rerankLongDocs(query, docs)\` in Python where each doc may be 5,000+ tokens.

- Split each doc into passages of ~200 words with 50-word overlap.
- Score every (query, passage) pair with a \`CrossEncoder\` in **one** batched \`predict\` call.
- Each document's score = **max** passage score; return \`[(doc_id, score, best_passage)]\` sorted descending.`,
        starter: {
          language: 'python',
          code: `from sentence_transformers import CrossEncoder

model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)

def passages(text: str, size: int = 200, overlap: int = 50) -> list[str]:
    # TODO: sliding window over words
    ...

def rerank_long_docs(query: str, docs: dict[str, str]):
    # TODO: build all pairs, predict once, aggregate by max
    ...`,
        },
        hints: [
          'Window start positions: range(0, max(len(words) - overlap, 1), size - overlap).',
          'Keep a parallel list of owners [(doc_id, passage)] aligned with the pairs.',
          'Track best[doc_id] = (score, passage), updating when a higher score appears.',
        ],
        solution: {
          language: 'python',
          code: `from sentence_transformers import CrossEncoder

model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)

def passages(text: str, size: int = 200, overlap: int = 50) -> list[str]:
    words = text.split()
    step = size - overlap
    return [" ".join(words[i:i + size]) for i in range(0, max(len(words) - overlap, 1), step)]

def rerank_long_docs(query: str, docs: dict[str, str]):
    owners, pairs = [], []
    for doc_id, text in docs.items():
        for p in passages(text):
            owners.append((doc_id, p))
            pairs.append((query, p))

    scores = model.predict(pairs, batch_size=64)  # one batched call

    best: dict[str, tuple[float, str]] = {}
    for (doc_id, p), s in zip(owners, scores):
        if doc_id not in best or s > best[doc_id][0]:
            best[doc_id] = (float(s), p)  # max-passage aggregation

    return sorted(((d, s, p) for d, (s, p) in best.items()), key=lambda x: x[1], reverse=True)`,
        },
        explanation:
          'Cross-encoders have a max input length, so long documents must be split. MaxP aggregation (document score = best passage score) is a standard, strong baseline, and returning the best passage gives you the snippet to show or send to the LLM.',
      },
      quickCheck: {
        question: 'Why can a cross-encoder not replace the vector index for first-stage retrieval over 10M chunks?',
        options: [
          'It needs a GPU, which vector databases do not support',
          'It must run a full forward pass for every (query, chunk) pair at query time, so 10M passes per query',
          'Its scores are always between 0 and 1',
          'It only works with English text',
        ],
        correct: 1,
        explanation:
          'Cross-encoders cannot precompute document vectors because the score depends on the query and document jointly. Scoring 10M pairs per query is computationally impossible at interactive latency, which is why they rerank a shortlist.',
      },
      source: 'sentence-transformers docs — Cross-Encoders; Cohere docs — Rerank',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'LLM-Based Reranking — using a general LLM as the judge',
      body: `Instead of a dedicated reranker, you can ask an LLM to judge relevance, like asking a senior colleague to sort the shortlist. It can follow nuanced instructions ("prefer documents valid for the EU region", "the user is an admin").

**Three styles:**

| Style | Prompt | Calls | Notes |
|---|---|---|---|
| Pointwise | "Rate the relevance of this doc 0–10" | N | parallel, simple, poorly calibrated |
| Pairwise | "Which of A or B is more relevant?" | O(N log N)+ | accurate, expensive |
| Listwise | "Rank these 20 passages by relevance" | few | RankGPT style; sees documents in context |

**RankGPT** (Sun et al. 2023) showed GPT-4 listwise reranking is competitive with or better than supervised rerankers on TREC-DL and BEIR. Because a list must fit in the prompt, it uses a **sliding window**: rank passages 80–100 first, then slide back by 10, so strong passages "bubble up" to the top.

**Pitfalls:** position bias (passages listed first get favoured), output parsing errors, and latency and cost much higher than a cross-encoder.

**When to use it:** complex relevance criteria, low QPS, offline labelling or distillation (use LLM judgements to train a cheaper cross-encoder), or a final pass over 10–20 candidates after a cross-encoder.`,
      example: `Query: "Which laptop policy applies to contractors in Germany?" After a cross-encoder, the top 10 include a global laptop policy, an EU-specific contractor addendum and an employee-only laptop policy.

A listwise LLM prompt with the user role and region outputs \`[4] > [1] > [7] > ...\`, putting the **EU contractor addendum** first. The cross-encoder had ranked it 3rd because the employee policy shared more terms.

Cost (illustrative): 10 passages × 250 tokens + instructions ≈ 3K input tokens, ~40 output tokens; at $1 per 1M input tokens that is $0.003 per query and adds about 700 ms.`,
      diagram: `Sliding-window listwise reranking (window 20, step 10), 60 candidates

pass 1:            [ 41 ............ 60 ]   rank, best move to front
pass 2:      [ 21 ............ 40 ]          (window overlaps by 10)
pass 3: [ 1 ............ 20 ]                strong docs bubble up
          ▲
  final top-20 = best of the whole list`,
      code: [
        {
          language: 'typescript',
          title: 'Listwise LLM reranking with validated JSON output',
          code: `import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
const Ranking = z.object({ ranking: z.array(z.number().int()) });

export async function llmRerank(query: string, passages: string[]): Promise<number[]> {
  const listed = passages.map((p, i) => '[' + i + '] ' + p.slice(0, 1200)).join('\\n');
  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You rank passages by how well they answer the query. Return JSON {"ranking": [ids, best first]} containing every id exactly once.' },
      { role: 'user', content: 'Query: ' + query + '\\n\\nPassages:\\n' + listed },
    ],
  });
  const parsed = Ranking.safeParse(JSON.parse(res.choices[0].message.content ?? '{}'));
  const ids = parsed.success ? parsed.data.ranking : [];

  // Repair: keep valid unique ids, then append any the model forgot (in original order)
  const seen = new Set<number>();
  const valid = ids.filter((i) => i >= 0 && i < passages.length && !seen.has(i) && seen.add(i));
  return [...valid, ...passages.map((_, i) => i).filter((i) => !seen.has(i))];
}`,
        },
      ],
      prosCons: {
        pros: [
          'Follows rich, instruction-level relevance criteria (role, region, recency).',
          'Strong zero-shot quality; listwise sees documents side by side.',
          'Great teacher for distilling a cheaper cross-encoder.',
        ],
        cons: [
          {
            con: 'Position bias: documents shown first tend to be ranked higher.',
            fix: 'Feed candidates in the first-stage order or shuffle and average two permutations; for high stakes, run pairwise comparisons in both orders.',
          },
          {
            con: 'Malformed or incomplete outputs (missing ids, duplicates, hallucinated ids).',
            fix: 'Use structured outputs / JSON schema, validate with zod, and repair by appending missing ids in their original order.',
          },
          {
            con: '10–50x the cost and latency of a cross-encoder.',
            fix: 'Apply it only to the top 10–20 after a cross-encoder, use a small fast model, cache by (query hash, doc ids), or distil it into a cross-encoder.',
          },
        ],
      },
      keyPoints: [
        'Pointwise is parallel; listwise is more accurate per call; pairwise is most expensive.',
        'Sliding windows let listwise reranking handle more candidates than fit in one prompt.',
        'Always validate and repair the LLM output.',
        'Use LLM reranking as the final, small-N pass or as a labeller.',
      ],
      exercise: {
        prompt: `Implement \`slidingWindowRerank(ids, rankWindow, windowSize = 20, step = 10)\`.

- \`rankWindow(ids)\` (given) returns the same ids reordered best first.
- Start with the window at the **end** of the list and move it towards the front by \`step\` each pass, replacing the window slice with its ranked order.
- Stop after the window covering index 0 is processed. Return the final ordering.
- For 60 ids, size 20, step 10 you should call \`rankWindow\` 5 times (windows 40–59, 30–49, 20–39, 10–29, 0–19).`,
        starter: {
          language: 'typescript',
          code: `export async function slidingWindowRerank(
  ids: number[],
  rankWindow: (ids: number[]) => Promise<number[]>,
  windowSize = 20,
  step = 10,
): Promise<number[]> {
  const out = [...ids];
  // TODO: start = max(0, out.length - windowSize); loop while true; splice ranked slice back in
  return out;
}`,
        },
        hints: [
          'Compute end = start + windowSize and slice out.slice(start, end).',
          'Replace in place with out.splice(start, ranked.length, ...ranked).',
          'Break after processing start === 0, otherwise start = Math.max(0, start - step).',
        ],
        solution: {
          language: 'typescript',
          code: `export async function slidingWindowRerank(
  ids: number[],
  rankWindow: (ids: number[]) => Promise<number[]>,
  windowSize = 20,
  step = 10,
): Promise<number[]> {
  const out = [...ids];
  let start = Math.max(0, out.length - windowSize);
  while (true) {
    const window = out.slice(start, start + windowSize);
    const ranked = await rankWindow(window); // best first
    out.splice(start, window.length, ...ranked); // write back in place
    if (start === 0) break;
    start = Math.max(0, start - step); // slide towards the front
  }
  return out;
}`,
        },
        explanation:
          'Moving from back to front with overlapping windows lets a strong document found late in the list be carried forward pass by pass, like a bubble sort with large steps. The overlap (windowSize − step) is what allows documents to travel between windows.',
      },
      quickCheck: {
        question:
          'A pointwise LLM reranker scores each passage 0–10 independently. Many passages tie at 8. What is the main reason listwise reranking often does better here?',
        options: [
          'Listwise uses fewer output tokens per passage',
          'Listwise compares passages against each other in one context, so it can break ties by relative quality',
          'Listwise prompts are cached automatically',
          'Pointwise scoring cannot use JSON output',
        ],
        correct: 1,
        explanation:
          'Pointwise scores are produced without seeing the alternatives, so coarse scales produce many ties and calibration drift. Listwise sees all candidates at once and outputs a relative order. Token counts and JSON support are not the reason.',
      },
      source: 'Sun et al. 2023 — RankGPT (EMNLP 2023)',
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'Reciprocal Rank Fusion (RRF) — merging ranked lists by position',
      body: `When you have several ranked lists (BM25, dense, multi-query variants), you need one final list. **RRF** ignores raw scores and rewards documents that rank highly in *any* list, like a sports league that awards points by finishing position rather than by lap time.

**Formula** (Cormack et al. 2009):

score(d) = Σ over lists i of 1 / (k + rankᵢ(d))

with ranks starting at 1 and **k = 60** (the paper's value and the default in Elasticsearch, OpenSearch and most libraries). A document missing from a list contributes 0 from that list.

**Why k = 60?** It flattens the curve: rank 1 gets 1/61 ≈ 0.0164 and rank 10 gets 1/70 ≈ 0.0143, so one list's top hit cannot dominate; agreement across lists wins. A smaller k (such as 10) makes the top positions matter much more.

**Properties:** no normalisation needed (BM25 0–30 and cosine 0–1 never meet), robust to outlier scores, trivial to implement, and supports weights (multiply each list's term).

**When to use it:** the default for hybrid search and multi-query retrieval when you have no labelled data to tune weights. Follow it with a reranker for precision.`,
      example: `Query "reset MFA token". k = 60.

| Doc | BM25 rank | Dense rank | RRF score |
|---|---|---|---|
| D1 | 1 | 2 | 1/61 + 1/62 = 0.01639 + 0.01613 = **0.03252** |
| D3 | 3 | 1 | 1/63 + 1/61 = 0.01587 + 0.01639 = **0.03227** |
| D2 | 2 | — | 1/62 = **0.01613** |
| D4 | — | 3 | 1/63 = **0.01587** |

Fused order: **D1, D3, D2, D4**. D1 wins because it is near the top of both lists, even though D3 was dense #1. D2 (BM25 #2 only) drops below D3, which both retrievers liked.`,
      diagram: `BM25 list        Dense list
 1 D1             1 D3
 2 D2             2 D1          RRF (k=60): Σ 1/(60 + rank)
 3 D3             3 D4
   │                │           D1 = 1/61 + 1/62 = .03252
   └──────┬─────────┘           D3 = 1/63 + 1/61 = .03227
          ▼                     D2 = 1/62        = .01613
   fused: D1, D3, D2, D4        D4 = 1/63        = .01587`,
      code: [
        {
          language: 'typescript',
          title: 'Weighted RRF over any number of ranked lists',
          code: `type Ranked = { ids: string[]; weight?: number }; // ids best-first

export function rrf(lists: Ranked[], k = 60, topN = 20): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const { ids, weight = 1 } of lists) {
    const seen = new Set<string>();
    ids.forEach((id, idx) => {
      if (seen.has(id)) return; // count each doc once per list (its best rank)
      seen.add(id);
      const rank = idx + 1; // ranks are 1-based
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + rank));
    });
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// rrf([{ ids: ['D1','D2','D3'] }, { ids: ['D3','D1','D4'] }])
// -> D1 0.03252, D3 0.03227, D2 0.01613, D4 0.01587`,
        },
      ],
      prosCons: {
        pros: [
          'No score normalisation or calibration needed.',
          'Robust: a single list with weird score scales cannot dominate.',
          'Works for any number of lists (hybrid, multi-query, multi-index).',
          'Strong default without labelled data.',
        ],
        cons: [
          {
            con: 'Throws away score magnitude: a confident 0.95 match and a marginal 0.51 match at the same rank count equally.',
            fix: 'When you have labelled queries, compare against normalised score fusion (min-max or z-score with a tuned α) and keep whichever wins on NDCG@10.',
          },
          {
            con: 'Equal weighting may be wrong when one retriever is much better for your data.',
            fix: 'Use weighted RRF (for example dense weight 1.0, BM25 0.6) tuned on a validation set, or route per query type.',
          },
          {
            con: 'Fused scores are not meaningful relevance probabilities, so thresholds on them are fragile.',
            fix: 'Threshold on a downstream reranker score instead, and use RRF only for ordering.',
          },
        ],
      },
      keyPoints: [
        'score = Σ 1/(k + rank), ranks 1-based, k = 60 by default.',
        'Agreement across lists beats a single first place.',
        'Smaller k sharpens the advantage of top ranks.',
        'Fuse first, then rerank the fused shortlist.',
      ],
      exercise: {
        prompt: `Three query variants produced these lists (best first):

- q1: [A, B, C]
- q2: [B, A, D]
- q3: [C, B, E]

Write \`fuse(lists, k)\` returning ids in fused order, then use it to show that with **k = 60** the winner is **B**, and print each document's score rounded to 5 decimals. Then try **k = 1** and report whether the order changes.`,
        hints: [
          'B appears at ranks 2, 1, 2: 1/62 + 1/61 + 1/62.',
          'A appears at ranks 1 and 2 only; C at 3 and 1.',
          'With k = 1, rank 1 is worth 0.5 and rank 2 is worth 0.333.',
        ],
        solution: {
          language: 'typescript',
          code: `function fuse(lists: string[][], k: number) {
  const s = new Map<string, number>();
  for (const list of lists) list.forEach((id, i) => s.set(id, (s.get(id) ?? 0) + 1 / (k + i + 1)));
  return [...s].sort((a, b) => b[1] - a[1]).map(([id, v]) => [id, Number(v.toFixed(5))] as const);
}

const lists = [['A', 'B', 'C'], ['B', 'A', 'D'], ['C', 'B', 'E']];
console.log(fuse(lists, 60));
// B 0.04865 (1/62+1/61+1/62), A 0.03252, C 0.03227, D 0.01587, E 0.01587
console.log(fuse(lists, 1));
// B 1.16667 (1/3+1/2+1/3), A 0.83333, C 0.75, D 0.25, E 0.25
// Order is the same; with k = 1 the gaps between ranks are much larger.`,
        },
        explanation:
          'B never ranks worse than 2nd in any list, so it accumulates the most reciprocal-rank mass under both settings. Small k exaggerates gaps between rank 1 and rank 2, which makes RRF behave more like "whoever came first anywhere wins".',
      },
      quickCheck: {
        question: 'BM25 scores range 0–35 and cosine scores 0–1. Why does RRF not need normalisation to fuse them?',
        options: [
          'It divides every score by the maximum score in its list',
          'It only uses each document\'s rank position, never the raw score',
          'It converts scores to z-scores internally',
          'It uses k = 60 to rescale BM25 into the 0–1 range',
        ],
        correct: 1,
        explanation:
          'RRF depends only on rank positions, so score scales are irrelevant. k is a smoothing constant on ranks, not a rescaling of scores. Min-max and z-score are what score fusion needs.',
      },
      source: 'Cormack, Clarke and Büttcher 2009 — Reciprocal Rank Fusion (SIGIR)',
    },
    // ---------------------------------------------------------------- 5
    {
      heading: 'Retrieval Score Fusion — normalise, then combine',
      body: `Score fusion keeps the **magnitudes** that RRF throws away. Think of combining exam marks from two teachers who grade on different scales: you must put them on the same scale before averaging.

**Step 1 — normalise each list:**
- **Min-max:** s' = (s − min) / (max − min) → 0..1 within the result list. Simple; sensitive to outliers and to how many results you fetched.
- **Z-score:** s' = (s − μ) / σ → "how many standard deviations above average". More robust to scale; can be negative.

**Step 2 — combine:** fused = α · dense' + (1 − α) · sparse' (convex combination). A document missing from one list gets 0 for that component (or the list minimum).

**Tuning α:** sweep 0.0–1.0 on labelled queries and maximise NDCG@10. Keyword-heavy corpora (part numbers, error codes) prefer lower α; conversational queries prefer higher α.

**In products:** Weaviate offers \`rankedFusion\` (RRF-like) and \`relativeScoreFusion\` (min-max, the default since v1.24), with \`alpha\` (1 = pure vector). Elasticsearch and OpenSearch support RRF and normalisation-based hybrid pipelines.

**When to use it:** when you have evaluation data to tune α and score magnitudes carry signal (a clear 0.92 dense match should beat a lukewarm one). Otherwise start with RRF.`,
      example: `Query "error E1043 on firmware update". α = 0.5.

| Doc | BM25 | min-max | Cosine | min-max | Fused |
|---|---|---|---|---|---|
| A | 12.4 | 1.000 | 0.61 | 0.000 | **0.500** |
| B | 8.1 | 0.543 | 0.82 | 1.000 | **0.771** |
| C | 3.0 | 0.000 | 0.79 | 0.857 | **0.429** |

BM25 normalisation: (x − 3.0) / 9.4; cosine: (x − 0.61) / 0.21.
Fused order **B, A, C**. If you had naively added raw scores, A (13.01) would win purely because BM25 has a bigger scale. With α = 0.3 (favour keywords for an error-code query): A = 0.700, B = 0.680, C = 0.257, so A edges ahead.`,
      diagram: `BM25: 12.4, 8.1, 3.0         Cosine: 0.61, 0.82, 0.79
        │ min-max                     │ min-max
        ▼                             ▼
     1.00, .54, 0.00              0.00, 1.00, .86
        │  × (1 − α)                  │  × α
        └──────────────┬──────────────┘
                       ▼
          fused = α·dense' + (1−α)·sparse'
                       ▼
                 sort descending`,
      code: [
        {
          language: 'typescript',
          title: 'Min-max or z-score fusion with α weighting',
          code: `type Hit = { id: string; score: number };
type Norm = 'minmax' | 'zscore';

function normalise(hits: Hit[], method: Norm): Map<string, number> {
  const xs = hits.map((h) => h.score);
  if (method === 'minmax') {
    const min = Math.min(...xs), max = Math.max(...xs);
    const range = max - min || 1; // all-equal scores: avoid divide-by-zero
    return new Map(hits.map((h) => [h.id, (h.score - min) / range]));
  }
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  return new Map(hits.map((h) => [h.id, (h.score - mean) / sd]));
}

export function scoreFusion(dense: Hit[], sparse: Hit[], alpha = 0.5, method: Norm = 'minmax'): Hit[] {
  const d = normalise(dense, method);
  const s = normalise(sparse, method);
  // missing-from-list value: 0 for min-max; the list minimum for z-score
  const dMiss = method === 'minmax' ? 0 : Math.min(...d.values());
  const sMiss = method === 'minmax' ? 0 : Math.min(...s.values());
  const ids = new Set([...d.keys(), ...s.keys()]);
  return [...ids]
    .map((id) => ({ id, score: alpha * (d.get(id) ?? dMiss) + (1 - alpha) * (s.get(id) ?? sMiss) }))
    .sort((a, b) => b.score - a.score);
}`,
        },
      ],
      prosCons: {
        pros: [
          'Keeps score magnitude, so a decisive match in one retriever can win.',
          'α is an intuitive, tunable knob per corpus or query type.',
          'Often beats RRF slightly when tuned on labelled data.',
        ],
        cons: [
          {
            con: 'Min-max depends on the result set: one outlier squashes everyone else towards 0.',
            fix: 'Use z-score normalisation, or clip scores at a percentile before min-max, and fetch a fixed candidate count per list.',
          },
          {
            con: 'α tuned on one query mix degrades when traffic changes (more code lookups, fewer questions).',
            fix: 'Route by query type (an ID/code regex → low α; natural language → high α) or learn α per intent, and re-tune quarterly.',
          },
          {
            con: 'Missing-document handling silently biases results.',
            fix: 'Fetch the same K from each retriever and use an explicit floor (0 or the list minimum) for missing entries; test both on your eval set.',
          },
        ],
      },
      keyPoints: [
        'Never sum raw BM25 and cosine scores.',
        'Min-max: simple, outlier-sensitive; z-score: robust, unbounded.',
        'fused = α·dense′ + (1−α)·sparse′, α tuned for NDCG@10.',
        'No labels yet? Start with RRF; switch when you can measure.',
      ],
      exercise: {
        prompt: `Write \`tuneAlpha(queries, retrieve, relevant)\` that sweeps α ∈ {0, 0.1, …, 1.0} and returns the α with the highest **mean recall@5**.

- \`retrieve(q)\` returns \`{ dense: Hit[], sparse: Hit[] }\`.
- \`relevant[q]\` is the set of relevant ids for query q.
- Reuse \`scoreFusion(dense, sparse, alpha)\` from the section.
- Return \`{ alpha, recall }\` and break ties in favour of α closer to 0.5.`,
        starter: {
          language: 'typescript',
          code: `type Hit = { id: string; score: number };
declare function scoreFusion(dense: Hit[], sparse: Hit[], alpha: number): Hit[];

export async function tuneAlpha(
  queries: string[],
  retrieve: (q: string) => Promise<{ dense: Hit[]; sparse: Hit[] }>,
  relevant: Record<string, Set<string>>,
) {
  // TODO: retrieve once per query (cache), sweep alpha, compute mean recall@5
}`,
        },
        hints: [
          'Retrieve once per query and reuse the results across all α values.',
          'recall@5 = |top5 ∩ relevant| / |relevant|.',
          'Generate α values with Array.from({ length: 11 }, (_, i) => i / 10).',
        ],
        solution: {
          language: 'typescript',
          code: `type Hit = { id: string; score: number };
declare function scoreFusion(dense: Hit[], sparse: Hit[], alpha: number): Hit[];

export async function tuneAlpha(
  queries: string[],
  retrieve: (q: string) => Promise<{ dense: Hit[]; sparse: Hit[] }>,
  relevant: Record<string, Set<string>>,
) {
  const cached = await Promise.all(queries.map(async (q) => ({ q, ...(await retrieve(q)) })));
  let best = { alpha: 0.5, recall: -1 };
  for (const alpha of Array.from({ length: 11 }, (_, i) => i / 10)) {
    const recalls = cached.map(({ q, dense, sparse }) => {
      const top5 = scoreFusion(dense, sparse, alpha).slice(0, 5).map((h) => h.id);
      const rel = relevant[q];
      return rel.size ? top5.filter((id) => rel.has(id)).length / rel.size : 0;
    });
    const recall = recalls.reduce((a, b) => a + b, 0) / recalls.length;
    const better = recall > best.recall + 1e-9;
    const tieCloser = Math.abs(recall - best.recall) <= 1e-9 && Math.abs(alpha - 0.5) < Math.abs(best.alpha - 0.5);
    if (better || tieCloser) best = { alpha, recall };
  }
  return best;
}`,
        },
        explanation:
          'Caching retrieval makes the sweep cheap: only fusion runs 11 times. Preferring α near 0.5 on ties avoids over-committing to one retriever on a small validation set, which generalises better.',
      },
      quickCheck: {
        question:
          'With min-max normalisation, one BM25 hit scores 40 and the rest score 6–9. What happens to the other BM25 hits in fusion?',
        options: [
          'They all become 1.0',
          'They are squeezed near 0, so the dense component dominates for them',
          'They are removed from the list',
          'Nothing; min-max is robust to outliers',
        ],
        correct: 1,
        explanation:
          'Min-max divides by (max − min) = 34, so hits at 6–9 land between 0 and 0.09; their BM25 signal is effectively erased. Z-score or clipping reduces this. Min-max is notably not outlier-robust.',
      },
      source: 'Weaviate blog — Hybrid search fusion algorithms (rankedFusion vs relativeScoreFusion)',
    },
    // ---------------------------------------------------------------- 6
    {
      heading: 'Top-K Retrieval — choosing how many chunks reach the LLM',
      body: `K is the size of your shortlist at each stage. Too small and you miss the answer; too large and you pay for and distract the LLM with noise. It is like packing for a trip: bring enough to cover likely needs, not your whole wardrobe.

**There are really three Ks:**

| K | Typical | Optimise for |
|---|---|---|
| Retrieval K (per retriever) | 50–150 | recall@K |
| Rerank K (input to reranker) | 50–100 | latency vs recall |
| Context K (to the LLM) | 5–20 | answer accuracy, cost |

**Trade-off:** recall@K rises with K and then plateaus; answer accuracy usually rises, peaks, then falls as distractors and lost-in-the-middle kick in. Anthropic's Contextual Retrieval experiments found passing **20 chunks beat 10 and 5**, retrieving 150 and reranking down to 20; your optimum depends on chunk size and model.

**Dynamic K:** instead of a fixed number, keep chunks whose reranker score ≥ a threshold, bounded by min K (to always give some context) and max K (to cap cost). Also cap by token budget, not just count.

**When to tune it:** whenever chunk size, embedding model, reranker or LLM changes. Plot recall@K and answer accuracy against K on a golden set and choose the knee.`,
      example: `Golden set of 400 questions, 400-token chunks, cross-encoder reranker:

| Context K | recall@K | Answer accuracy | Input tokens |
|---|---|---|---|
| 3 | 71% | 68% | 1.2K |
| 5 | 82% | 77% | 2.0K |
| 10 | 90% | 81% | 4.0K |
| 20 | 94% | 80% | 8.0K |
| 40 | 96% | 74% | 16K |

Knee at K ≈ 10. Dynamic K (score ≥ 0.35, min 3, max 12) averaged **6.4 chunks**, hit **81%** accuracy and used 2.6K tokens, the same accuracy as K = 10 at 35% fewer tokens.`,
      diagram: `accuracy
   │            ●──●         recall@K keeps rising...
   │        ●        ●
   │    ●               ●    ...but answer accuracy peaks,
   │ ●                     ●  then distractors hurt
   └──┬───┬───┬────┬────┬──► K (to LLM)
      3   5  10   20   40
               ▲
          choose the knee; or dynamic K:
          keep score ≥ τ, clamp to [minK, maxK], fit token budget`,
      code: [
        {
          language: 'typescript',
          title: 'Dynamic K: threshold + bounds + token budget',
          code: `type Ranked = { id: string; text: string; score: number }; // sorted by reranker score desc

const tok = (s: string) => Math.ceil(s.length / 4);

export function selectContext(
  ranked: Ranked[],
  { threshold = 0.35, minK = 3, maxK = 12, tokenBudget = 5000 } = {},
): Ranked[] {
  const out: Ranked[] = [];
  let used = 0;
  for (const r of ranked) {
    if (out.length >= maxK) break;
    // below threshold: only accept while we still need the minimum
    if (r.score < threshold && out.length >= minK) break;
    const t = tok(r.text);
    if (used + t > tokenBudget) continue; // too big, try the next one
    out.push(r);
    used += t;
  }
  return out;
}`,
        },
      ],
      prosCons: {
        pros: [
          'A tuned K is a free accuracy and cost win.',
          'Dynamic K adapts: easy queries use few chunks, broad ones more.',
          'Token-budgeted K prevents context overflows.',
        ],
        cons: [
          {
            con: 'A fixed K ignores query difficulty, sending noise on easy queries and too little on broad ones.',
            fix: 'Use dynamic K with a reranker-score threshold and min/max bounds, or classify query type and set K per type.',
          },
          {
            con: 'Thresholds on uncalibrated scores break when the reranker model changes.',
            fix: 'Re-calibrate the threshold on the golden set for each reranker version and store it alongside the model id in config.',
          },
          {
            con: 'Large K with large chunks blows the token budget and latency.',
            fix: 'Budget by tokens, not count, and use smaller chunks with parent expansion for precision.',
          },
        ],
      },
      keyPoints: [
        'Separate retrieval K, rerank K and context K.',
        'Recall rises with K; answer accuracy peaks then falls.',
        'Dynamic K = threshold + min/max + token budget.',
        'Re-tune K whenever the chunking, reranker or LLM changes.',
      ],
      exercise: {
        prompt: `Given per-query results \`{ k: number; correct: boolean; tokens: number }[]\` from a sweep over K ∈ {3, 5, 10, 20, 40}, write \`chooseK(results, maxAccuracyDrop = 0.01)\`:

- compute accuracy and mean tokens per K;
- find the best accuracy;
- return the **smallest K** whose accuracy is within \`maxAccuracyDrop\` of the best, with its accuracy and mean tokens.`,
        hints: [
          'Group results by k with a Map<number, { correct: number; n: number; tokens: number }>.',
          'Sort the K values ascending before scanning.',
          'Compare acc >= bestAcc - maxAccuracyDrop.',
        ],
        solution: {
          language: 'typescript',
          code: `type R = { k: number; correct: boolean; tokens: number };

export function chooseK(results: R[], maxAccuracyDrop = 0.01) {
  const g = new Map<number, { c: number; n: number; t: number }>();
  for (const r of results) {
    const s = g.get(r.k) ?? { c: 0, n: 0, t: 0 };
    s.c += Number(r.correct);
    s.n += 1;
    s.t += r.tokens;
    g.set(r.k, s);
  }
  const stats = [...g]
    .map(([k, s]) => ({ k, accuracy: s.c / s.n, meanTokens: s.t / s.n }))
    .sort((a, b) => a.k - b.k);
  const best = Math.max(...stats.map((s) => s.accuracy));
  return stats.find((s) => s.accuracy >= best - maxAccuracyDrop)!; // smallest K near the best
}`,
        },
        explanation:
          'Picking the smallest K within a tolerance of the best accuracy formalises "choose the knee": you give up at most 1 point of accuracy for potentially large token and latency savings.',
      },
      quickCheck: {
        question: 'Raising context K from 10 to 30 increased recall@K from 90% to 95% but answer accuracy dropped. What is the best next step?',
        options: [
          'Keep K = 30 because recall is what matters',
          'Retrieve and rerank 30, but pass only the top ~10 reranked chunks (or a thresholded dynamic K) to the LLM',
          'Lower the temperature to fix the accuracy drop',
          'Switch from RRF to min-max fusion',
        ],
        correct: 1,
        explanation:
          'Use the larger K for recall in the candidate stage, then let the reranker pick a small high-precision context. Temperature does not address distractors, and changing the fusion method does not reduce the noise reaching the LLM.',
      },
      source: 'Anthropic 2024 — Introducing Contextual Retrieval (top-K experiments)',
    },
  ],
  codeChallenges: [
    {
      id: 'reranking-fusion-cc-1',
      title: 'Hybrid search that adds raw scores',
      context:
        'A hybrid endpoint merges BM25 and vector results by summing their raw scores. Users complain that semantic questions return keyword-stuffed pages, and that the same document sometimes appears twice in the context.',
      task: 'Replace the naive merge with RRF (k = 60), dedupe ids, request the same candidate count from both retrievers, and rerank the fused top 50 down to 8.',
      starter: {
        language: 'typescript',
        code: `type Hit = { id: string; text: string; score: number };
declare function bm25(q: string, k: number): Promise<Hit[]>;
declare function vector(q: string, k: number): Promise<Hit[]>;

export async function hybrid(q: string) {
  const a = await bm25(q, 10);
  const b = await vector(q, 100);
  const all = [...a, ...b];
  for (const h of all) {
    const twin = all.find((x) => x.id === h.id && x !== h);
    if (twin) h.score += twin.score; // BM25 (0-30) + cosine (0-1)
  }
  return all.sort((x, y) => y.score - x.score).slice(0, 8);
}`,
      },
      hints: [
        'Run the two retrievers in parallel with Promise.all and the same K (e.g. 50).',
        'Fuse with Σ 1/(60 + rank) keyed by id; keep one text per id.',
        'Send the fused top 50 to a reranker and return its top 8.',
      ],
      solution: {
        language: 'typescript',
        code: `type Hit = { id: string; text: string; score: number };
declare function bm25(q: string, k: number): Promise<Hit[]>;
declare function vector(q: string, k: number): Promise<Hit[]>;
declare function rerank(q: string, texts: string[]): Promise<number[]>; // cross-encoder

const RRF_K = 60;
const CANDIDATES = 50;
const FINAL_K = 8;

export async function hybrid(q: string): Promise<Hit[]> {
  // same K from both, fetched in parallel
  const [a, b] = await Promise.all([bm25(q, CANDIDATES), vector(q, CANDIDATES)]);

  const fused = new Map<string, { hit: Hit; rrf: number }>();
  for (const list of [a, b]) {
    list.forEach((h, i) => {
      const prev = fused.get(h.id);
      const add = 1 / (RRF_K + i + 1); // rank-based: no scale mixing
      fused.set(h.id, { hit: prev?.hit ?? h, rrf: (prev?.rrf ?? 0) + add }); // dedupe by id
    });
  }

  const shortlist = [...fused.values()].sort((x, y) => y.rrf - x.rrf).slice(0, CANDIDATES);
  const scores = await rerank(q, shortlist.map((s) => s.hit.text));
  return shortlist
    .map((s, i) => ({ ...s.hit, score: scores[i] }))
    .sort((x, y) => y.score - x.score)
    .slice(0, FINAL_K);
}`,
      },
      explanation:
        'Raw BM25 scores are an order of magnitude larger than cosine similarities, so the original sum was effectively "BM25 only", and the in-place loop double-counted and kept duplicates. RRF uses ranks, so scales do not matter; deduping by id fixes repeated context; equal candidate counts keep the lists comparable; and the reranker restores precision.',
      followUps: [
        {
          q: 'How would you check that hybrid + rerank is actually better than vector-only?',
          a: 'Run both pipelines on a labelled set and compare recall@50 for the candidate stage and NDCG@10 / MRR after reranking, plus end-to-end answer accuracy. Slice results by query type (codes and IDs vs natural language) because hybrid gains concentrate on keyword-heavy queries.',
        },
        {
          q: 'Latency budget is 150 ms total. What do you cut first?',
          a: 'Reduce rerank candidates from 50 to 20–30, truncate passages to 256 tokens, and use a smaller reranker (MiniLM-L6 or a fast API tier). Retrievers already run in parallel, so the reranker is usually the biggest lever.',
        },
      ],
    },
    {
      id: 'reranking-fusion-cc-2',
      title: 'An LLM reranker that trusts whatever comes back',
      context:
        'A team reranks the top 20 passages by asking an LLM to "return the best 5 ids, comma-separated". In production, 3% of requests crash on parseInt(NaN), some answers cite passages that do not exist, and p95 latency is 4 s because every query is reranked by a large model.',
      task: 'Make the LLM reranker robust and affordable: structured output with validation, id repair, a cross-encoder fallback on failure, a timeout, and caching.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();

export async function llmTop5(query: string, passages: string[]) {
  const prompt = 'Query: ' + query + '\\n' + passages.map((p, i) => i + ': ' + p).join('\\n') +
    '\\nReturn the best 5 ids, comma-separated.';
  const res = await openai.chat.completions.create({
    model: 'gpt-5', messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content!.split(',').map((x) => passages[parseInt(x)]);
}`,
      },
      hints: [
        'Request JSON {"ids": number[]} and validate it with zod; drop out-of-range and duplicate ids.',
        'Wrap the call in AbortSignal.timeout and fall back to a cross-encoder ordering on any error.',
        'Cache results by a hash of the query and the passage ids.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import { z } from 'zod';
import { createHash } from 'node:crypto';

const openai = new OpenAI();
const MODEL = process.env.RERANK_LLM ?? 'gpt-5-mini'; // small, fast model
const Out = z.object({ ids: z.array(z.number().int()).min(1) });
const cache = new Map<string, number[]>(); // swap for Redis in production

declare function crossEncoderOrder(query: string, passages: string[]): Promise<number[]>;

export async function llmTopN(query: string, passages: { id: string; text: string }[], n = 5) {
  const key = createHash('sha256').update(query + '|' + passages.map((p) => p.id).join(',')).digest('hex');
  let order = cache.get(key);
  if (!order) {
    try {
      const res = await openai.chat.completions.create(
        {
          model: MODEL,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Rank passages by relevance to the query. Reply as JSON {"ids": [best first]}. Use only the given ids.' },
            { role: 'user', content: 'Query: ' + query + '\\n' + passages.map((p, i) => '[' + i + '] ' + p.text.slice(0, 1000)).join('\\n') },
          ],
        },
        { signal: AbortSignal.timeout(1500) }, // hard latency cap
      );
      const parsed = Out.parse(JSON.parse(res.choices[0].message.content ?? '{}'));
      const seen = new Set<number>();
      order = parsed.ids.filter((i) => i >= 0 && i < passages.length && !seen.has(i) && seen.add(i));
      if (order.length < n) throw new Error('too few valid ids');
    } catch {
      order = await crossEncoderOrder(query, passages.map((p) => p.text)); // graceful fallback
    }
    cache.set(key, order);
  }
  return order.slice(0, n).map((i) => passages[i]);
}`,
      },
      explanation:
        'The original trusted free text: whitespace, extra words or hallucinated ids produced NaN or undefined passages. The fix constrains the format (JSON + zod), repairs ids (range check, dedupe), bounds latency with a timeout, degrades to a deterministic cross-encoder on any failure, uses a smaller model, and caches repeated queries, cutting both crashes and p95 latency.',
      followUps: [
        {
          q: 'How would you detect that the LLM reranker is position-biased?',
          a: 'Rerank the same candidates in original and reversed (or shuffled) order and measure rank correlation (Kendall tau) between outputs. Low agreement, or a strong correlation with input position, indicates bias; mitigate by averaging permutations or feeding a consistent first-stage order.',
        },
        {
          q: 'When would you drop the LLM reranker entirely?',
          a: 'When an offline comparison shows a tuned cross-encoder matches its NDCG@10 within noise. Use the LLM to label a few thousand pairs, fine-tune a cross-encoder on them, and serve that at a fraction of the cost and latency.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'reranking-fusion-iq-1',
      difficulty: 'medium',
      question: 'Explain bi-encoders versus cross-encoders, and design a retrieval pipeline that uses both.',
      whatInterviewerLooksFor: [
        'Correct architecture difference: separate encoding vs joint encoding',
        'Understands the precompute and latency implications',
        'Proposes the two-stage pattern with concrete K values',
        'Names real models and how to evaluate each stage',
      ],
      modelAnswer: `**Bi-encoder:** encodes query and document independently into vectors; relevance = cosine/dot product. Document vectors are precomputed and indexed (HNSW), so search over millions takes milliseconds. Weakness: no token-level interaction, so negation, word order and fine intent get blurred.

**Cross-encoder:** feeds the (query, document) pair through one transformer with full cross-attention and outputs a relevance score. Much more accurate, but nothing can be precomputed: cost is one forward pass per candidate per query.

**Pipeline**
1. **Stage 1 (recall):** hybrid search, BM25 + bi-encoder (e.g. \`text-embedding-3-small\` or \`bge-m3\`), 50 each, fused with RRF → top 100.
2. **Stage 2 (precision):** cross-encoder (\`bge-reranker-v2-m3\` self-hosted or Cohere \`rerank-v4.0-fast\`) over the 100, passages truncated to ~400 tokens, batched on GPU → ~60–150 ms.
3. **Selection:** dynamic K, score ≥ calibrated threshold, 3–10 chunks within a 5K-token budget.

**Evaluation per stage**
- Stage 1: recall@100 (did the answer make the shortlist?).
- Stage 2: NDCG@10, MRR.
- End to end: answer accuracy and faithfulness on a golden set.

**Rule of thumb:** if recall@100 is low, no reranker helps; fix stage 1 first.`,
      followUps: [
        {
          q: 'Could you fine-tune either model on your data? Which first?',
          a: 'Yes. Fine-tuning the cross-encoder is usually cheaper and higher impact: a few thousand (query, positive, hard negative) triples mined from logs, no re-indexing needed. Fine-tuning the bi-encoder improves recall but requires re-embedding the whole corpus.',
        },
        {
          q: 'What is a late-interaction model like ColBERT, and where does it fit?',
          a: 'ColBERT stores per-token document vectors and scores with MaxSim between query and document tokens, giving accuracy closer to a cross-encoder while still allowing precomputation. It costs much more storage and fits as a first stage or a cheap reranker.',
        },
      ],
      pitfalls: [
        'Claiming cross-encoders can be used directly for full-corpus search',
        'Forgetting to measure first-stage recall',
        'Reranking hundreds of long documents without truncation',
      ],
    },
    {
      id: 'reranking-fusion-iq-2',
      difficulty: 'hard',
      question:
        'Your hybrid search uses RRF. A PM asks why you do not just average the scores. Compare RRF and normalised score fusion, and say when you would choose each.',
      whatInterviewerLooksFor: [
        'Explains why raw averaging is wrong (different scales and distributions)',
        'Correct RRF formula and the role of k',
        'Knows min-max vs z-score and their failure modes',
        'Chooses based on availability of labelled data and evaluation',
      ],
      modelAnswer: `**Why not average raw scores?** BM25 is unbounded (0 to 30+, depending on query length and IDF); cosine sits in a narrow band (often 0.6–0.9). Averaging lets BM25 dominate, and the dominance changes per query.

**RRF:** score(d) = Σ 1/(k + rankᵢ(d)), k = 60.
- Uses ranks only, so no calibration is needed.
- Robust to outliers and to adding more lists (multi-query).
- Loses magnitude: a decisive top match counts the same as a marginal one at the same rank.

**Normalised score fusion:** normalise each list (min-max or z-score), then α·dense + (1−α)·sparse.
- Keeps magnitude, and α is tunable.
- Min-max is outlier-sensitive and depends on the result-set size; z-score is more stable but unbounded.
- Missing documents need an explicit floor.

**Choosing**
| Situation | Pick |
|---|---|
| No labelled data, many lists | RRF |
| Labelled queries, two retrievers, stable traffic | tuned score fusion |
| Reranker downstream anyway | RRF (fusion only orders candidates) |

**Process:** start with RRF, build a 200–500 query eval set, sweep α for score fusion, and switch only if NDCG@10 improves beyond noise.`,
      followUps: [
        {
          q: 'What happens to RRF if you change k from 60 to 5?',
          a: 'Top ranks become much more valuable (1/6 vs 1/7 compared with 1/61 vs 1/62), so a single list\'s first place can outweigh agreement across lists. The fused ranking behaves more like "best rank anywhere".',
        },
        {
          q: 'How does a downstream reranker change the importance of the fusion method?',
          a: 'With a reranker, fusion only needs to put relevant documents in the top 50–100, so recall of the fused list matters more than its ordering. Differences between RRF and score fusion usually shrink.',
        },
      ],
      pitfalls: [
        'Saying RRF uses normalised scores',
        'Tuning α on the test set',
        'Ignoring how missing documents are scored in score fusion',
      ],
    },
    {
      id: 'reranking-fusion-iq-3',
      difficulty: 'hard',
      question:
        'After adding a Cohere reranker, NDCG@10 improved, but p95 latency went from 180 ms to 900 ms. Bring it back under 300 ms without losing most of the gain.',
      whatInterviewerLooksFor: [
        'Profiles where the latency comes from (candidate count, passage length, network)',
        'Concrete knobs: fewer candidates, truncation, faster model tier, self-hosting',
        'Uses caching and parallelism',
        'Validates the quality trade-off with metrics',
      ],
      modelAnswer: `**1. Profile.** Break latency into retrieval, network to the rerank API, and rerank compute. Typical culprits: 200 candidates × 1,500-token chunks, sent sequentially.

**2. Reduce work**
- Candidates 200 → 50: measure recall@50 vs recall@200 of the fused list; usually a loss of under 1–2 pts.
- Truncate each passage to ~300–500 tokens around the matched span (or rerank child chunks).
- Use the fast tier (\`rerank-v4.0-fast\`) instead of pro.

**3. Change where it runs**
- Self-host \`bge-reranker-v2-m3\` or MiniLM on a GPU in the same region: no internet round trip, batched inference in ~30–80 ms for 50 passages.
- Quantise to int8/ONNX for CPU serving if GPUs are scarce.

**4. Overlap and cache**
- Start the reranker as soon as the faster retriever returns? Usually not worth it, but do run retrievers in parallel.
- Cache rerank results for popular queries (by normalised query + candidate ids).

**5. Adaptive reranking.** Skip reranking when the first-stage top-1 score margin is large (an exact SKU match), and rerank only ambiguous queries.

**Validate:** report NDCG@10 and p95 for each change; choose the combination with p95 < 300 ms and NDCG within ~1 pt of the slow version.`,
      followUps: [
        {
          q: 'How would you decide the candidate count objectively?',
          a: 'Plot recall@N of the fused list for N in {20, 30, 50, 100, 200} on the golden set and pick the smallest N whose recall is within about 1 point of the maximum; reranking can never exceed that ceiling.',
        },
        {
          q: 'What risk does skipping reranking on "confident" queries introduce?',
          a: 'Confidence heuristics can be wrong for adversarial or ambiguous queries. Monitor answer quality on skipped queries separately and tune the margin threshold so the skip rate does not reduce accuracy.',
        },
      ],
      pitfalls: [
        'Removing the reranker entirely',
        'Reducing candidates without checking recall',
        'Ignoring network round trips to a hosted API',
      ],
    },
    {
      id: 'reranking-fusion-iq-4',
      difficulty: 'expert',
      question:
        'You want to use GPT-class LLM reranking for a legal research product but cost must stay under $0.002 per query. Design the approach.',
      context: 'Queries are complex; relevance depends on jurisdiction and date validity. 50K queries per day.',
      whatInterviewerLooksFor: [
        'Recognises cost of naive listwise reranking over many passages',
        'Uses cascades: cheap reranker first, LLM only on a small set or a subset of queries',
        'Considers distillation from LLM judgements into a cross-encoder',
        'Handles position bias and structured output',
        'Does the cost arithmetic',
      ],
      modelAnswer: `**Naive cost.** Listwise over 50 passages × 300 tokens = 15K input tokens per query. At an illustrative $1 per 1M tokens that is $0.015/query, 7.5x over budget.

**Design: a cascade plus distillation**
1. **Metadata filters first:** jurisdiction and effective-date filters in the vector DB remove invalid documents before any reranking (free and exact).
2. **Cross-encoder stage:** \`bge-reranker-v2-m3\` (self-hosted) reduces 100 candidates to 10. GPU cost is fractions of a cent per query.
3. **LLM listwise on the top 10** with short passages (200 tokens each): ~2.5K input tokens with a small model at $0.4 per 1M ≈ $0.001/query, plus a few output tokens.
4. **Gate it:** run the LLM stage only when the cross-encoder's top scores are close (ambiguous), say 40% of queries → average ≈ $0.0004.

**Distillation loop:** log LLM rankings, sample disagreements with the cross-encoder for lawyer review, and fine-tune the cross-encoder monthly. Over time the LLM gate fires less often.

**Robustness:** JSON schema output with id validation; feed candidates in cross-encoder order to limit position-bias damage; a timeout with cross-encoder fallback.

**Measure:** NDCG@10 on a lawyer-labelled set, cost per query, and the gate rate.`,
      followUps: [
        {
          q: 'Why put jurisdiction in a filter rather than in the LLM prompt?',
          a: 'Filters are exact, cheap and auditable; asking the LLM to respect jurisdiction is probabilistic and costs tokens. Use the LLM for nuanced relevance, not for hard constraints that metadata can enforce.',
        },
        {
          q: 'How do you choose the ambiguity gate threshold?',
          a: 'On a labelled set, measure where the LLM stage changes the top-3 and improves NDCG. Choose the score-gap threshold that captures most of the improvement while keeping the gate rate within the cost budget.',
        },
      ],
      pitfalls: [
        'Listwise reranking over 50+ long passages per query',
        'Encoding hard constraints only in prompts',
        'No fallback when the LLM times out',
      ],
    },
    {
      id: 'reranking-fusion-iq-5',
      difficulty: 'medium',
      question: 'How do you choose top-K for a RAG system, and should it be fixed?',
      whatInterviewerLooksFor: [
        'Distinguishes retrieval K, rerank K and context K',
        'Describes an empirical sweep on a golden set',
        'Knows the accuracy-vs-K curve shape and why it falls',
        'Proposes dynamic K with threshold, bounds and token budget',
      ],
      modelAnswer: `**Three Ks**
- **Retrieval K** (per retriever): large, 50–150, chosen by recall@K.
- **Rerank K:** the candidate count fed to the reranker, chosen by latency vs recall.
- **Context K:** chunks given to the LLM, typically 5–20, chosen by answer accuracy and cost.

**How to choose context K**
1. Build a golden set (300+ questions with known supporting chunks).
2. Sweep K ∈ {3, 5, 10, 20, 40}; measure recall@K, answer accuracy, faithfulness and tokens.
3. Expect recall to rise monotonically and accuracy to peak then dip (distractors, lost in the middle).
4. Choose the smallest K within ~1 point of peak accuracy.

Reference point: Anthropic's Contextual Retrieval tests found 20 chunks beat 10 and 5, retrieving 150 and reranking down to 20. Chunk size matters: 20 × 200 tokens is very different from 20 × 1,000.

**Should it be fixed?** Usually not. Use **dynamic K**: keep chunks with reranker score ≥ τ, clamp to [3, 12], and cap at a token budget. Broad questions ("summarise all changes in 2026") get more chunks; pinpoint questions get fewer.

**Re-tune** whenever chunking, embeddings, reranker or LLM change.`,
      followUps: [
        {
          q: 'A question needs information from 15 different documents. What does dynamic K do, and what else helps?',
          a: 'If scores stay above the threshold, dynamic K expands up to maxK, but a hard cap may still cut it off. Better: detect aggregation intent and switch to a map-reduce flow (summarise per document, then combine) or query decomposition instead of a giant context.',
        },
        {
          q: 'What is the danger of a minK of 3 with a threshold?',
          a: 'For out-of-scope questions, minK forces three irrelevant chunks into the context, which can induce confident wrong answers. Pair it with an abstain rule: if the top score is below a floor, answer "not found" instead.',
        },
      ],
      pitfalls: [
        'Choosing K by intuition with no sweep',
        'Equating higher recall with better answers',
        'Counting chunks instead of tokens',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'reranking-fusion-est-1',
      question:
        'Size a self-hosted cross-encoder reranking tier: 2M queries/day, 100 candidates per query, 350 tokens per (query + passage) pair, bge-reranker-v2-m3 on L4-class GPUs.',
      assumptions: [
        'Peak QPS = 3x average',
        'One L4-class GPU processes ~1,500 pairs/s for a ~568M-param reranker at 350 tokens with fp16 batching (illustrative)',
        'Target GPU utilisation 60% at peak, plus N+1 redundancy',
        'Illustrative cost $0.80 per GPU-hour',
      ],
      steps: [
        { label: 'Average QPS', calc: '2M / 86,400 ≈ 23 QPS' },
        { label: 'Peak QPS', calc: '23 × 3 ≈ 70 QPS' },
        { label: 'Pairs/s at peak', calc: '70 × 100 = 7,000 pairs/s' },
        { label: 'Usable throughput per GPU', calc: '1,500 × 0.6 = 900 pairs/s' },
        { label: 'GPUs', calc: '7,000 / 900 ≈ 7.8 → 8, +1 redundancy = 9' },
        { label: 'Monthly cost', calc: '9 × $0.80 × 24 × 30 ≈ $5.2K/month' },
      ],
      answer: 'About 9 GPUs, roughly $5K per month, at 100 candidates per query.',
      insight:
        'Cost scales linearly with candidates × tokens. Halving candidates to 50 and truncating passages to 256 tokens cuts the fleet by more than half, so measure recall@N before choosing 100.',
      followUps: [
        {
          q: 'What if you switch to ms-marco-MiniLM-L-6-v2 (22M params)?',
          a: 'Throughput per GPU rises roughly 10–20x, so one or two GPUs (or a CPU pool) suffice. Check on your eval set whether the quality drop, especially for non-English queries, is acceptable.',
        },
      ],
    },
    {
      id: 'reranking-fusion-est-2',
      question:
        'Compare monthly cost of a hosted rerank API vs LLM listwise reranking for 300K queries/day, 40 candidates of 250 tokens each.',
      assumptions: [
        'Hosted rerank API: illustrative $2 per 1,000 searches (one search = one query with up to 100 documents)',
        'LLM listwise: illustrative $0.40 per 1M input tokens, $1.60 per 1M output tokens; 300-token instructions; 60 output tokens',
        'Sliding window of 20 with step 10 over 40 candidates → 3 LLM calls per query',
        '30 days per month',
      ],
      steps: [
        { label: 'API: searches/month', calc: '300K × 30 = 9M searches' },
        { label: 'API: cost/month', calc: '9M / 1,000 × $2 = $18K/month' },
        { label: 'LLM: input tokens per window', calc: '20 × 250 + 300 = 5,300 tokens' },
        { label: 'LLM: per query (3 windows)', calc: 'input 15.9K × $0.40/1M = $0.00636; output 180 × $1.60/1M = $0.00029; ≈ $0.0067' },
        { label: 'LLM: cost/month', calc: '$0.0067 × 9M ≈ $60K/month' },
      ],
      answer: 'Hosted rerank API about $18K/month vs LLM listwise about $60K/month, with the LLM also adding about 1–2 s of latency.',
      insight:
        'LLM reranking is roughly 3x more expensive here and much slower; reserve it for a small top-N after a cross-encoder, for a gated subset of queries, or for offline labelling.',
      followUps: [
        {
          q: 'How would the comparison change if LLM reranking ran only on the top 10 for 30% of queries?',
          a: 'One window of 10 × 250 + 300 = 2.8K tokens ≈ $0.0012 per query; × 2.7M gated queries ≈ $3.2K/month on top of the rerank API, a modest add-on for nuanced relevance.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'reranking-fusion-mcq-01',
      difficulty: 'medium',
      question:
        'Your first stage returns 100 candidates and a cross-encoder picks the final 8. Which metric best tells you whether the first stage is the bottleneck?',
      options: ['NDCG@10 after reranking', 'Recall@100 of the first stage', 'Answer BLEU score', 'Average cosine similarity of the top 8'],
      correct: [1],
      explanation:
        'The reranker can only reorder what stage 1 retrieved, so recall@100 is the ceiling. NDCG@10 mixes both stages, BLEU measures text overlap of answers, and average cosine says nothing about whether relevant documents were found.',
      followUps: [
        {
          q: 'Recall@100 is 95% but NDCG@10 is poor. Where do you look?',
          a: 'At the reranker: domain mismatch, truncated passages, the wrong language model, or score thresholds cutting good results. Consider fine-tuning it on hard negatives.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-02',
      difficulty: 'medium',
      question: 'Using k = 60, what is the RRF score of a document ranked 1st in list A and 4th in list B?',
      options: ['1/61 + 1/64 ≈ 0.03202', '1/60 + 1/63 ≈ 0.03254', '(1 + 4) / 60 ≈ 0.0833', '1/(61 × 64) ≈ 0.00026'],
      correct: [0],
      explanation:
        'Ranks are 1-based and the formula sums 1/(k + rank): 1/61 = 0.01639 and 1/64 = 0.01563, totalling 0.03202. Using 1/60 treats ranks as 0-based, and the other options misapply the formula.',
      followUps: [
        {
          q: 'How would a document ranked 2nd in both lists compare?',
          a: '1/62 + 1/62 = 0.03226, slightly higher than 0.03202, showing that consistent agreement can beat one first place under k = 60.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-03',
      difficulty: 'hard',
      question: 'What is wrong with this hybrid fusion code?',
      code: {
        language: 'typescript',
        code: `const bm25 = await keywordSearch(q, 50);   // scores 0..35
const dense = await vectorSearch(q, 50);   // cosine 0..1
const merged = new Map<string, number>();
for (const h of [...bm25, ...dense]) {
  merged.set(h.id, (merged.get(h.id) ?? 0) + h.score);
}
const top = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 10);`,
      },
      options: [
        'Map cannot hold string keys',
        'Raw scores on different scales are added, so BM25 dominates the ranking',
        'It should fetch 500 candidates from each retriever',
        'Sorting descending puts the worst documents first',
      ],
      correct: [1],
      explanation:
        'BM25 scores up to 35 swamp cosine values below 1, so the dense signal barely affects the order. Use RRF or normalise both lists before a weighted combination. Map handles string keys, the sort is correct, and fetching more candidates would not fix the scale problem.',
      followUps: [
        {
          q: 'Give a minimal change that fixes it.',
          a: 'Replace h.score with 1 / (60 + rank) using each hit\'s position in its own list (RRF), or min-max normalise each list before adding with an α weight.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-04',
      difficulty: 'hard',
      question:
        'Which statements about cross-encoder rerankers are true? Select ALL that apply.',
      options: [
        'They process the query and passage together, so attention spans both',
        'Document representations can be precomputed and stored in a vector index',
        'Inference cost grows with the number of candidates times passage length',
        'Raw output scores need calibration before you use a fixed threshold across model versions',
      ],
      correct: [0, 2, 3],
      explanation:
        'Cross-encoders jointly encode each pair, so cost is per pair and scales with candidates and length; their logits are relative and model-specific, so thresholds need calibration. Precomputing document vectors is what bi-encoders do, which is exactly what cross-encoders cannot.',
      followUps: [
        {
          q: 'Which architecture sits between the two, allowing precomputation with token-level matching?',
          a: 'Late-interaction models such as ColBERT, which store per-token document embeddings and score with MaxSim against query token embeddings.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-05',
      difficulty: 'hard',
      question:
        'In a z-score fusion, a dense list returns 50 hits but the BM25 list returns only 3 (rare terms). What problem is most likely?',
      options: [
        'Z-scores of the 3 BM25 hits are computed from a tiny sample and can be extreme or unstable',
        'Z-score cannot handle negative values',
        'RRF would produce exactly the same ordering',
        'The dense list will be ignored because it is longer',
      ],
      correct: [0],
      explanation:
        'Normalisation statistics from 3 values are noisy: the mean and standard deviation can be distorted, producing outsized z-scores that dominate fusion. Negative values are normal for z-scores; RRF orders differently because it ignores magnitudes; list length does not cause one list to be ignored.',
      followUps: [
        {
          q: 'How would you make this robust?',
          a: 'Use corpus-level or historical score statistics for normalisation, clip z-scores, or fall back to RRF when a list has fewer than about 10 hits.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-06',
      difficulty: 'hard',
      question:
        'A listwise LLM reranker gives very different orderings when the same 20 passages are presented in reversed order. Which mitigations make sense? Select ALL that apply.',
      options: [
        'Present candidates in a consistent first-stage order rather than random order',
        'Run two permutations and aggregate the rankings (for example by average rank)',
        'Raise temperature to 1.5 so the model explores more orderings',
        'Use the LLM only on a small top-N after a cross-encoder, limiting the impact of bias',
      ],
      correct: [0, 1, 3],
      explanation:
        'Position bias is reduced by consistent ordering, averaging permutations, and limiting the LLM to a small shortlist where the cross-encoder has already done the heavy lifting. Higher temperature adds randomness rather than removing bias.',
      followUps: [
        {
          q: 'Which metric quantifies agreement between the two orderings?',
          a: 'Kendall tau or Spearman rank correlation between the two output rankings; values near 1 mean the order is stable and the bias is small.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-07',
      difficulty: 'hard',
      question: 'What does this selection function return for scores [0.91, 0.62, 0.30, 0.22, 0.18] with the defaults shown?',
      code: {
        language: 'typescript',
        code: `function pick(scores: number[], tau = 0.4, minK = 3, maxK = 4) {
  const out: number[] = [];
  for (const s of scores) {
    if (out.length >= maxK) break;
    if (s < tau && out.length >= minK) break;
    out.push(s);
  }
  return out;
}`,
      },
      options: ['[0.91, 0.62]', '[0.91, 0.62, 0.30]', '[0.91, 0.62, 0.30, 0.22]', '[0.91, 0.62, 0.30, 0.22, 0.18]'],
      correct: [1],
      explanation:
        '0.91 and 0.62 pass the threshold. 0.30 is below τ but only two items are selected, so minK forces it in. At 0.22 the list already has 3 (minK) and the score is below τ, so the loop stops. maxK = 4 is never reached.',
      followUps: [
        {
          q: 'What is the risk of minK here for an out-of-scope question?',
          a: 'It forces low-relevance chunks (0.30) into the context, which can encourage a confident wrong answer. Add an abstain rule when the top score is below a floor.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-08',
      difficulty: 'hard',
      question:
        'Which changes reduce cross-encoder reranking latency with the least quality loss? Select ALL that apply.',
      options: [
        'Truncate passages to the ~300 tokens around the best keyword or vector match',
        'Rerank 40 instead of 200 candidates after confirming recall@40 is close to recall@200',
        'Rerank the whole document instead of chunks for better context',
        'Batch all pairs into one GPU call instead of one call per pair',
      ],
      correct: [0, 1, 3],
      explanation:
        'Shorter inputs, fewer candidates (validated by recall) and batching all cut latency while preserving most quality. Whole documents are longer, slower and get truncated at max_length anyway, typically hurting both speed and quality.',
      followUps: [
        {
          q: 'What else can you do at the infrastructure level?',
          a: 'Serve the model with ONNX Runtime or TensorRT in fp16/int8, co-locate it with the retriever to avoid network hops, and cache results for repeated queries.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-09',
      difficulty: 'expert',
      question:
        'You switch RRF from k = 60 to k = 1 on a three-retriever system (BM25, dense, multi-query). What behaviour change should you expect?',
      options: [
        'Documents found by all three retrievers at middling ranks gain relative to single-list winners',
        'A document ranked first by any single retriever gains a lot relative to documents agreed on by several lists',
        'Scores become normalised between 0 and 1',
        'Nothing changes, since k only affects score magnitudes, not order',
      ],
      correct: [1],
      explanation:
        'With k = 1, rank 1 is worth 0.5 and rank 3 only 0.25, so single first places dominate; with k = 60 the curve is flat (0.0164 vs 0.0159) and agreement wins. k changes ordering, not just magnitudes, and RRF scores are never normalised to 0–1.',
      followUps: [
        {
          q: 'When might a small k be preferable?',
          a: 'When one retriever is highly precise at the top (exact ID or code matches via BM25) and its first result should almost always win; a small k or a higher weight on that list expresses that.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-10',
      difficulty: 'expert',
      question:
        'Your min-max hybrid fusion works offline but degrades online. Logs show the BM25 list is often empty or has one hit for conversational queries. Which issues does this cause? Select ALL that apply.',
      code: {
        language: 'typescript',
        code: `const norm = (xs: number[]) => {
  const min = Math.min(...xs), max = Math.max(...xs);
  return xs.map((x) => (x - min) / (max - min));
};`,
      },
      options: [
        'With one hit, max − min = 0, so the normalised score is NaN',
        'With an empty list, Math.min() returns Infinity and the map produces nothing, so the sparse weight is wasted',
        'Documents present only in the dense list are compared against a sparse component that is missing or NaN',
        'Min-max makes BM25 scores negative',
      ],
      correct: [0, 1, 2],
      explanation:
        'A single score gives 0/0 = NaN, which poisons sorting; an empty list yields no scores, so (1 − α) of the fused score is effectively zero for everyone; and missing-component handling becomes inconsistent. Min-max outputs 0–1, never negative values.',
      followUps: [
        {
          q: 'How do you harden it?',
          a: 'Guard range === 0 (map to 1 or 0.5), treat an empty list as all-zero with a renormalised α (use dense only), or fall back to RRF when either list has fewer than a few hits.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-11',
      difficulty: 'medium',
      question:
        'Which situations favour an LLM-based reranker over a cross-encoder? Select ALL that apply.',
      options: [
        'Relevance depends on instructions such as the user\'s role, region and policy effective dates',
        'A 50 ms p95 latency budget at 2,000 QPS',
        'Generating relevance labels offline to fine-tune a cheaper reranker',
        'A low-traffic expert tool where quality matters more than cost',
      ],
      correct: [0, 2, 3],
      explanation:
        'LLM rerankers shine when instruction-following matters, for offline labelling and distillation, and in low-QPS, quality-first products. A 50 ms p95 at 2,000 QPS is far beyond what LLM reranking can deliver affordably; that is a job for a small cross-encoder or none.',
      followUps: [
        {
          q: 'How can you still use LLM judgement in the high-QPS case?',
          a: 'Distil it: label a few thousand query-passage pairs with the LLM, fine-tune a small cross-encoder on them, and serve the cross-encoder online.',
        },
      ],
    },
    {
      id: 'reranking-fusion-mcq-12',
      difficulty: 'expert',
      question:
        'Two pipelines have equal NDCG@10. Pipeline A sends a fixed 20 chunks to the LLM; pipeline B uses a reranker threshold with minK 2 and maxK 12. B has higher answer accuracy on out-of-scope and narrow questions but lower accuracy on "summarise everything about X" questions. What is the best explanation and fix?',
      options: [
        'B\'s threshold removes distractors on narrow queries but truncates broad aggregation queries; detect aggregation intent and raise maxK or use map-reduce summarisation for those',
        'B uses a worse embedding model; switch it to A\'s model',
        'NDCG@10 is wrong; use BLEU instead',
        'A has lost-in-the-middle problems on narrow queries only; reorder A\'s chunks alphabetically',
      ],
      correct: [0],
      explanation:
        'Dynamic K helps precision-oriented questions but caps the context for broad questions that need many sources. Route by intent: aggregation queries get a higher maxK or a map-reduce flow. Both pipelines share retrieval, BLEU is not a retrieval metric, and alphabetical ordering does nothing useful.',
      followUps: [
        {
          q: 'How would you detect aggregation intent cheaply?',
          a: 'A small classifier or a few-shot prompt on a fast model labels queries as lookup vs aggregation; keyword cues such as "all", "summarise", "list every" or "compare" give a quick baseline.',
        },
      ],
    },
  ],
};

export default topic;
