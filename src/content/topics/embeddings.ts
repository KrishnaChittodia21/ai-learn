import type { Topic } from '../../types';

const topic: Topic = {
  id: 'embeddings',
  phase: 'embeddings',
  order: 1,
  title: 'Embeddings & Vector Similarity',
  subtitle: 'Turn text into coordinates of meaning, pick the right embedding model, and measure closeness correctly',
  estimatedMinutes: 44,
  sources: [
    'OpenAI docs — Embeddings guide (text-embedding-3-small / -large, dimensions parameter, normalised outputs)',
    'OpenAI blog (Jan 2024) — New embedding models and API updates',
    'Kusupati et al. 2022 — Matryoshka Representation Learning (arXiv:2205.13147)',
    'Muennighoff et al. 2022 — MTEB: Massive Text Embedding Benchmark (arXiv:2210.07316)',
    'Hugging Face — MTEB leaderboard (huggingface.co/spaces/mteb/leaderboard)',
    'Reimers & Gurevych 2019 — Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks',
    'Wang et al. 2022 — Text Embeddings by Weakly-Supervised Contrastive Pre-training (E5)',
    'Chen et al. 2024 — BGE M3-Embedding: multi-lingual, multi-functionality, multi-granularity',
    'Supabase blog — Matryoshka embeddings: faster OpenAI vector search using Adaptive Retrieval',
    'Microsoft Azure SQL devblog (Dec 2024) — Embedding models and dimensions: optimizing the performance/resource ratio',
  ],
  tags: ['embeddings', 'vectors', 'cosine similarity', 'MTEB', 'Matryoshka', 'semantic search', 'bi-encoder'],
  cheatSheet: [
    'Embedding = fixed-length vector of floats where texts with similar meaning land close together; same model must embed both query and documents.',
    'Bi-encoder: query and document are embedded independently, so documents can be embedded once, offline, and searched in milliseconds.',
    'text-embedding-3-small: 1536-d, ~$0.02 per 1M tokens; text-embedding-3-large: 3072-d, ~$0.13 per 1M tokens; both accept up to 8,191 input tokens (illustrative prices).',
    'Open models: all-MiniLM-L6-v2 (384-d, fast, English), e5 / bge families (384–1024-d), bge-m3 (1024-d, 100+ languages, 8K tokens).',
    'Choose models on the MTEB *Retrieval* column and your own 50–200 labelled queries, not the overall average.',
    'Matryoshka (MRL) models front-load information: truncate 3072 → 256 dims and renormalise for ~12x less storage with a small quality drop.',
    'Asymmetric models need the right prefix / input type: e5 uses "query: " / "passage: ", Cohere/Voyage use input_type query vs document.',
    'For unit vectors: cosine = dot product, and ||a − b||² = 2 − 2·cos, so all three give the same ranking.',
    'Changing model, dimensions, chunking or prefixes means re-embedding the whole corpus; never mix vectors from two models in one index.',
    'Raw similarity scores are model-specific: calibrate any "is relevant" threshold per model on labelled data.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Embeddings — turning meaning into coordinates',
      body: `**Intuition:** an embedding is a GPS coordinate for meaning. A model reads a piece of text and returns a list of numbers (a *vector*), and texts that mean similar things get coordinates that sit close together, even when they share no words. "How do I get my money back?" lands next to "Refund policy", far from "Office opening hours".

**Mechanics.** An embedding model is a transformer encoder trained with *contrastive learning*: it sees millions of (question, matching answer) pairs and is pushed to place matching pairs close and non-matching pairs far apart. The output is a fixed-length vector (384, 768, 1024, 1536 or 3072 numbers) regardless of whether you feed it 3 words or 3 pages.

Because the query and the documents are embedded **independently** (a *bi-encoder*), you can embed your whole corpus once, offline, store the vectors, and at query time embed only the short query and look for its nearest neighbours.

| Search style | Matches on | Finds "refund" for "money back"? |
|---|---|---|
| Keyword (BM25) | shared words | No |
| Embeddings | shared meaning | Yes |

**When to use:** semantic search, RAG retrieval, deduplication, clustering, recommendations and classification with few labels. Embeddings are weaker at exact identifiers (SKU \`AB-1234\`), negation ("not cancel") and rare jargon, which is why production systems pair them with keyword search (covered in retrieval topics).`,
      example: `A support bot embeds three FAQ entries with \`text-embedding-3-small\` (1536 numbers each, ~$0.02 per 1M tokens, so three entries cost a fraction of a cent).

Query: **"I want my money back for a broken kettle"** (11 tokens). Typical cosine similarities:

| FAQ entry | Cosine |
|---|---|
| "Refunds: damaged items can be returned within 30 days" | **0.62** |
| "Shipping takes 3–5 working days" | 0.31 |
| "Our office is open 9am–5pm" | 0.14 |

The refund entry wins although it shares no keyword with "money back" or "broken". A keyword search would have scored it zero. (Exact values vary by model; what matters is the ranking.)`,
      diagram: `  OFFLINE (once)                         ONLINE (per query)
  +-----------+    +-----------+          +---------+    +-----------+
  | documents |--->| embedding |---+      |  query  |--->| embedding |
  +-----------+    |   model   |   |      +---------+    |   model   |
                   +-----------+   v                     +-----------+
                          +----------------+                   |
                          | vector store   |<--- nearest ------+
                          | [0.12,-0.4,..] |     neighbours
                          +----------------+          |
                                                      v
                                            top-k most similar docs`,
      code: [
        {
          language: 'typescript',
          title: 'Embed texts and rank them against a query',
          code: `import OpenAI from 'openai';

const client = new OpenAI(); // reads OPENAI_API_KEY
const MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small';

const docs = [
  'Refunds: damaged items can be returned within 30 days',
  'Shipping takes 3-5 working days',
  'Our office is open 9am-5pm',
];

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  // One request can carry many inputs: results come back in the same order.
  const res = await client.embeddings.create({ model: MODEL, input: docs });
  const docVecs = res.data.map((d) => d.embedding);

  const q = await client.embeddings.create({
    model: MODEL, // MUST be the same model as the documents
    input: 'I want my money back for a broken kettle',
  });
  const qVec = q.data[0].embedding;

  const ranked = docs
    .map((text, i) => ({ text, score: cosine(qVec, docVecs[i]) }))
    .sort((x, y) => y.score - x.score);
  console.table(ranked);
  console.log('dims:', qVec.length, 'tokens billed:', res.usage.total_tokens);
}

main();`,
        },
      ],
      prosCons: {
        pros: [
          'Finds matches by meaning: synonyms, paraphrases and even other languages with multilingual models.',
          'Documents are embedded once offline; a query costs one cheap embedding call plus a fast vector lookup.',
          'One representation powers search, clustering, deduplication, recommendations and lightweight classification.',
        ],
        cons: [
          {
            con: 'Weak on exact tokens such as product codes, error IDs and names the model never saw.',
            fix: 'Use hybrid search: run BM25 alongside vectors and fuse the rankings (e.g. Reciprocal Rank Fusion).',
          },
          {
            con: 'Treats "cancel my plan" and "do not cancel my plan" as near-identical because negation barely moves the vector.',
            fix: 'Rerank the top 20–50 candidates with a cross-encoder or LLM reranker that reads query and document together.',
          },
          {
            con: 'One vector per long document blurs many topics into an average that matches nothing well.',
            fix: 'Chunk documents into 200–800 token passages and embed each chunk separately.',
          },
        ],
      },
      keyPoints: [
        'An embedding is a fixed-length vector; close vectors mean similar meaning.',
        'Bi-encoders embed query and documents separately, so the corpus is embedded once.',
        'Query and documents must use the exact same model (and version).',
        'Embeddings complement, not replace, keyword search for exact identifiers.',
      ],
      exercise: {
        prompt: `Build a tiny **semantic FAQ matcher**. Given 5 FAQ strings and a user question, return the best FAQ and its score.

Acceptance criteria:
- Embed all FAQs in **one** API call (batch input).
- Implement \`cosine\` yourself.
- Return \`{ faq, score }\` for the best match; if the best score is below \`minScore\` (default 0.3), return \`null\` so the bot can say "I don't know".`,
        starter: {
          language: 'typescript',
          code: `import OpenAI from 'openai';
const client = new OpenAI();
const MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small';

const FAQS = [
  'How do I reset my password?',
  'What is your refund policy?',
  'How long does delivery take?',
  'Can I change my delivery address?',
  'How do I delete my account?',
];

function cosine(a: number[], b: number[]): number {
  // TODO
  return 0;
}

export async function bestFaq(question: string, minScore = 0.3) {
  // TODO: embed FAQS in one call, embed question, pick max cosine
}`,
        },
        hints: [
          'client.embeddings.create accepts input as an array; res.data[i].embedding matches input[i].',
          'Cosine = dot(a, b) / (|a| * |b|). Compute all three sums in one loop.',
          'Cache the FAQ vectors in a module-level variable so repeated questions do not re-embed them.',
        ],
        solution: {
          language: 'typescript',
          code: `import OpenAI from 'openai';
const client = new OpenAI();
const MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small';

const FAQS = [
  'How do I reset my password?',
  'What is your refund policy?',
  'How long does delivery take?',
  'Can I change my delivery address?',
  'How do I delete my account?',
];

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1); // guard zero vectors
}

let faqVecs: number[][] | null = null; // cache: FAQs embedded once

export async function bestFaq(question: string, minScore = 0.3) {
  if (!faqVecs) {
    const res = await client.embeddings.create({ model: MODEL, input: FAQS });
    faqVecs = res.data.map((d) => d.embedding);
  }
  const q = await client.embeddings.create({ model: MODEL, input: question });
  const qv = q.data[0].embedding;

  let best = { faq: FAQS[0], score: -1 };
  faqVecs.forEach((v, i) => {
    const s = cosine(qv, v);
    if (s > best.score) best = { faq: FAQS[i], score: s };
  });
  return best.score >= minScore ? best : null;
}

// bestFaq('I forgot my login').then(console.log);
// -> { faq: 'How do I reset my password?', score: ~0.5 }`,
        },
        explanation: `Batching the FAQs into one request cuts latency and request overhead; caching means the corpus is embedded once, exactly like a real index. The \`minScore\` gate is a crude relevance threshold: it must be tuned per model because raw cosine ranges differ between models.`,
      },
      quickCheck: {
        question: 'You embedded your documents with model A last month. Today you embed user queries with model B, which outputs the same number of dimensions. What happens?',
        options: [
          'Search works normally because the vector lengths match',
          'Results are close to random, because the two models place meanings in unrelated coordinate systems',
          'The vector store throws a dimension-mismatch error',
          'Scores are slightly lower but rankings are preserved',
        ],
        correct: 1,
        explanation: 'Each model learns its own coordinate system. Equal dimension counts let the maths run without errors, but comparing coordinates from two different maps is meaningless, so rankings become near-random. Always embed queries and documents with the same model.',
      },
      source: 'Reimers & Gurevych 2019 — Sentence-BERT; OpenAI Embeddings guide',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Embedding Models — choosing, prefixes and Matryoshka dimensions',
      body: `**Intuition:** picking an embedding model is like picking a map projection: every map shows the world, but some are better for sailing, some for city walking. You want the one that is accurate for *your* territory, at a size you can afford to store.

**What to compare:**

| Model (examples) | Dims | Max tokens | Notes |
|---|---|---|---|
| all-MiniLM-L6-v2 | 384 | 256 | tiny, fast, English, local |
| e5 / bge (small–large) | 384–1024 | 512 | open, needs prefixes |
| bge-m3 | 1024 | 8,192 | 100+ languages, dense + sparse |
| text-embedding-3-small | 1536 | 8,191 | API, ~$0.02 / 1M tokens |
| text-embedding-3-large | 3072 | 8,191 | API, ~$0.13 / 1M tokens |

**MTEB** (Massive Text Embedding Benchmark) scores models across retrieval, classification, clustering, STS and more. For search, read the **Retrieval** column (nDCG@10), not the overall average, then confirm on 50–200 of your own labelled queries.

**Asymmetric inputs.** Short questions and long passages look different, so many models want a hint: e5 expects \`"query: "\` / \`"passage: "\` prefixes; Cohere and Voyage take \`input_type\`. Forgetting it silently costs several points of recall.

**Matryoshka (MRL) embeddings** are trained so the first *k* dimensions are a good embedding on their own, like nested dolls. OpenAI's text-embedding-3 models support a \`dimensions\` parameter: 3-large at 256 dims still beat ada-002 at 1536 on MTEB. If you truncate yourself, **renormalise**.

**When to use what:** an API model to start fast; an open model when data cannot leave your network, volume is huge, or you need fine-tuning.`,
      example: `A team indexes 1M chunks and compares options on 150 labelled support queries (Recall@10):

| Option | Recall@10 | Storage (float32) |
|---|---|---|
| all-MiniLM-L6-v2, 384-d | 0.71 | 1.5 GB |
| text-embedding-3-small, 1536-d | 0.83 | 6.1 GB |
| text-embedding-3-large, 3072-d | 0.86 | 12.3 GB |
| text-embedding-3-large, **dimensions: 512** | 0.84 | **2.0 GB** |

Storage = 1M × dims × 4 bytes. The Matryoshka-shortened large model keeps almost all the quality at a sixth of the full-size storage, so they ship it. (Numbers are illustrative of typical gaps; run your own eval.)`,
      diagram: `  Matryoshka embedding (text-embedding-3-large, 3072 dims)
  [ d1 ... d256 | d257 ... d1024 | d1025 ........... d3072 ]
    \\__________/
     coarse meaning: usable alone (renormalise!)
    \\__________________________/
     finer detail
    \\_________________________________________________/
     full precision

  Asymmetric model (e5):  "query: refund damaged item"     -> q-vector
                          "passage: Refunds are issued..." -> d-vector`,
      code: [
        {
          language: 'python',
          title: 'Open model with the right prefixes (sentence-transformers, e5)',
          code: `from sentence_transformers import SentenceTransformer

# e5-small-v2: 384 dims, 512 max tokens, trained WITH prefixes
model = SentenceTransformer("intfloat/e5-small-v2")

passages = [
    "Refunds: damaged items can be returned within 30 days.",
    "Delivery normally takes 3-5 working days.",
    "Passwords can be reset from the login page.",
]
query = "my kettle arrived broken, can I get my money back?"

# Asymmetric model: prefixes tell it which side of the pair it is encoding.
p_emb = model.encode(["passage: " + p for p in passages], normalize_embeddings=True)
q_emb = model.encode("query: " + query, normalize_embeddings=True)

# Vectors are unit length, so dot product == cosine similarity.
scores = p_emb @ q_emb
for p, s in sorted(zip(passages, scores), key=lambda x: -x[1]):
    print(f"{s:.3f}  {p}")
print("dims:", p_emb.shape[1])  # 384`,
        },
        {
          language: 'typescript',
          title: 'Matryoshka: ask the API for fewer dimensions',
          code: `import OpenAI from 'openai';
const client = new OpenAI();

// The API shortens AND renormalises for you.
const res = await client.embeddings.create({
  model: 'text-embedding-3-large',
  input: ['Refunds: damaged items can be returned within 30 days'],
  dimensions: 256, // 3072 -> 256: 12x less storage
});
const v = res.data[0].embedding;
const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
console.log(v.length, norm.toFixed(3)); // 256 1.000`,
        },
      ],
      prosCons: {
        pros: [
          'API models (text-embedding-3) give strong multilingual quality with zero infrastructure.',
          'Open models (e5, bge, bge-m3) run locally: data stays private, cost is GPU time, and they can be fine-tuned.',
          'Matryoshka truncation lets you trade a little quality for large storage and latency savings without retraining.',
        ],
        cons: [
          {
            con: 'The MTEB overall leader is often not the best model for your domain or language.',
            fix: 'Shortlist 3–4 models on the MTEB Retrieval column, then measure Recall@10 / nDCG@10 on 50–200 of your own labelled queries.',
          },
          {
            con: 'Long documents beyond the max token limit are silently truncated or rejected (e.g. 256 tokens for MiniLM).',
            fix: 'Chunk below the model limit and count tokens with the model tokenizer before embedding.',
          },
          {
            con: 'Switching models later forces a full re-embed of the corpus.',
            fix: 'Store model name, version and dims next to each vector, and migrate by building a new index in parallel before cutting over.',
          },
          {
            con: 'Truncating a non-Matryoshka model (e.g. MiniLM) destroys its quality.',
            fix: 'Only truncate models documented as MRL-trained; otherwise use quantisation (int8/binary) to save space.',
          },
        ],
      },
      keyPoints: [
        'Compare models on MTEB Retrieval plus your own labelled queries.',
        'Check dims (storage), max tokens (chunk size), languages and price.',
        'Use the documented query/document prefixes or input_type for asymmetric models.',
        'Matryoshka models can be shortened via the dimensions parameter; renormalise if you cut manually.',
        'Record model + version + dims with every stored vector.',
      ],
      exercise: {
        prompt: `Measure what Matryoshka truncation costs you. Write \`overlapAtK(texts, query, k)\` that:
- embeds \`texts\` and \`query\` with \`text-embedding-3-large\` at **full size (3072)** and at **256 dims** (use the \`dimensions\` parameter),
- ranks the texts by cosine for each size,
- returns the fraction of the full-size top-k that also appears in the 256-d top-k (e.g. 0.8 means 4 of 5 shared).`,
        starter: {
          language: 'typescript',
          code: `import OpenAI from 'openai';
const client = new OpenAI();

async function embed(input: string[], dimensions?: number): Promise<number[][]> {
  // TODO: call client.embeddings.create with model text-embedding-3-large
  return [];
}

function topK(q: number[], docs: number[][], k: number): number[] {
  // TODO: return indexes of the k highest dot products (vectors are unit length)
  return [];
}

export async function overlapAtK(texts: string[], query: string, k = 5) {
  // TODO
}`,
        },
        hints: [
          'Put the query and texts in the same request: input = [query, ...texts]; slot 0 is the query.',
          'OpenAI embeddings are already unit length, and the dimensions parameter renormalises, so dot product equals cosine.',
          'Overlap = size of the intersection of the two top-k index sets divided by k.',
        ],
        solution: {
          language: 'typescript',
          code: `import OpenAI from 'openai';
const client = new OpenAI();
const MODEL = 'text-embedding-3-large';

async function embed(input: string[], dimensions?: number): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: MODEL,
    input,
    ...(dimensions ? { dimensions } : {}), // omit for the full 3072
  });
  return res.data.map((d) => d.embedding);
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

function topK(q: number[], docs: number[][], k: number): number[] {
  return docs
    .map((d, i) => ({ i, s: dot(q, d) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.i);
}

export async function overlapAtK(texts: string[], query: string, k = 5) {
  const [full, small] = await Promise.all([
    embed([query, ...texts]),
    embed([query, ...texts], 256),
  ]);
  const a = new Set(topK(full[0], full.slice(1), k));
  const b = topK(small[0], small.slice(1), k);
  const shared = b.filter((i) => a.has(i)).length;
  return shared / k; // 1.0 = identical top-k
}`,
        },
        explanation: `Comparing top-k overlap is a cheap proxy for "how much does truncation change what users see". Typical results are 0.8–1.0 at 256–512 dims; if overlap drops sharply on your data, keep more dimensions or add a rescoring step with full vectors.`,
      },
      quickCheck: {
        question: 'Your e5-based search has mediocre recall. Documents were embedded as "passage: ..." but queries are sent raw. What is the most likely fix?',
        options: [
          'Switch from cosine to Euclidean distance',
          'Prefix every query with "query: " so it matches how the model was trained',
          'Increase the vector dimension of the index',
          'Remove the "passage: " prefix from documents but keep raw queries',
        ],
        correct: 1,
        explanation: 'e5 was trained with "query: " / "passage: " prefixes, so the query side must carry its prefix too. Changing the metric or index size does not fix an input-format mismatch, and stripping document prefixes would require a full re-embed and still be off-distribution.',
      },
      source: 'Kusupati et al. 2022 — Matryoshka Representation Learning; Muennighoff et al. 2022 — MTEB; Wang et al. 2022 — E5',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Vector Similarity — cosine, dot product and Euclidean distance',
      body: `**Intuition:** two arrows from the same origin. *Cosine* asks "do they point the same way?" (angle only). *Dot product* asks "same way, and how long are they?". *Euclidean distance* asks "how far apart are their tips?".

| Metric | Formula | Range | Higher = closer? |
|---|---|---|---|
| Cosine similarity | a·b / (‖a‖‖b‖) | −1 … 1 | yes |
| Dot product | Σ aᵢbᵢ | unbounded | yes |
| Euclidean (L2) | √Σ(aᵢ−bᵢ)² | 0 … ∞ | no (lower = closer) |

**Normalisation is the key.** Divide a vector by its length and it becomes a *unit vector* (‖v‖ = 1). For unit vectors:
- cosine = dot product (the denominator is 1), and
- ‖a − b‖² = 2 − 2·cos(a, b), so Euclidean distance ranks results in exactly the same order.

So once vectors are normalised, the three metrics agree, and dot product is the cheapest to compute (no square roots). OpenAI embeddings come back unit length already; sentence-transformers needs \`normalize_embeddings=True\`.

**When they differ:** on *unnormalised* vectors, dot product rewards long vectors (often long or "popular" documents), which some models trained for dot product deliberately exploit. Rule: **use the metric the model card says it was trained with**, and configure the same metric in your vector database (pgvector \`<=>\` cosine, \`<#>\` negative inner product, \`<->\` L2).

Absolute scores are not probabilities: 0.45 may be a strong match for one model and noise for another.`,
      example: `Take a = [3, 4] and b = [6, 8] (same direction, b twice as long) and c = [4, 3].

| Pair | Cosine | Dot | Euclidean |
|---|---|---|---|
| a, b | **1.00** | 50 | 5.00 |
| a, c | 0.96 | 24 | 1.41 |

Cosine says a and b are identical in meaning; Euclidean says c is *closer* to a than b is. Now normalise: a → [0.6, 0.8], b → [0.6, 0.8], c → [0.8, 0.6]. Then a·b = 1.00, ‖a − b‖ = 0; a·c = 0.96, ‖a − c‖ = √(2 − 2·0.96) = 0.28. All three metrics now agree: b is the nearest neighbour.`,
      diagram: `        ^                         unit circle (after normalising)
      8 |        * b [6,8]               ^
        |       /                        |   * a,b [.6,.8]
      4 |  * a /                         |  /  * c [.8,.6]
        |  /  /   * c [4,3]              | / /
        | /  / .-'                       |//
        +------------------->            +------------->
   cosine: angle only        after normalising: cosine = dot,
   euclid: tip distance      euclid^2 = 2 - 2*cos -> same order`,
      code: [
        {
          language: 'python',
          title: 'Three metrics, before and after normalising',
          code: `import numpy as np

a = np.array([3.0, 4.0])
b = np.array([6.0, 8.0])   # same direction as a, twice as long
c = np.array([4.0, 3.0])   # slightly different direction

def cosine(x, y):
    return x @ y / (np.linalg.norm(x) * np.linalg.norm(y))

def report(label, x, y):
    print(f"{label}: cos={cosine(x, y):.2f} dot={x @ y:.2f} l2={np.linalg.norm(x - y):.2f}")

report("raw a,b", a, b)   # cos=1.00 dot=50.00 l2=5.00
report("raw a,c", a, c)   # cos=0.96 dot=24.00 l2=1.41  <- L2 prefers c!

def normalise(v):
    return v / np.linalg.norm(v)   # unit length

an, bn, cn = normalise(a), normalise(b), normalise(c)
report("unit a,b", an, bn)  # cos=1.00 dot=1.00 l2=0.00
report("unit a,c", an, cn)  # cos=0.96 dot=0.96 l2=0.28

# Identity for unit vectors: ||a-c||^2 == 2 - 2*cos
assert np.isclose(np.linalg.norm(an - cn) ** 2, 2 - 2 * (an @ cn))`,
        },
      ],
      prosCons: {
        pros: [
          'Cosine ignores vector length, so a short query and a long passage compare fairly.',
          'With normalised vectors, dot product gives cosine results with the fewest operations, which is why many vector DBs prefer it.',
          'The 2 − 2·cos identity lets you use any L2-only index for cosine search by normalising first.',
        ],
        cons: [
          {
            con: 'Using dot product on unnormalised vectors from a cosine-trained model favours long or high-norm vectors and skews ranking.',
            fix: 'Normalise every vector at write and query time, or configure the index metric to cosine.',
          },
          {
            con: 'Using a hard threshold such as "score > 0.8 = relevant" copied from another model returns nothing or everything.',
            fix: 'Calibrate thresholds per model on labelled pairs (pick the score that hits your target precision), and re-calibrate after any model change.',
          },
          {
            con: 'Manually truncated Matryoshka vectors are no longer unit length, so dot product stops equalling cosine.',
            fix: 'Renormalise after truncating, or request shortened vectors via the API dimensions parameter.',
          },
        ],
      },
      keyPoints: [
        'Cosine = angle, dot = angle × lengths, Euclidean = distance between tips.',
        'Normalise to unit length and all three give the same ranking.',
        'For unit vectors, dot product is the cheapest way to compute cosine.',
        'Use the metric the model was trained for and set the same metric in the index.',
        'Raw scores are model-specific; calibrate thresholds.',
      ],
      exercise: {
        prompt: `Prove the "normalise and the metrics agree" rule in code. Write \`rankBy(metric, query, docs)\` in TypeScript for \`'cosine' | 'dot' | 'l2'\`, plus \`normalise(v)\`.

Acceptance criteria:
- On the raw vectors below, cosine and L2 rankings **differ**.
- After normalising query and docs, all three rankings are **identical**.
- Print both cases.`,
        starter: {
          language: 'typescript',
          code: `type Metric = 'cosine' | 'dot' | 'l2';

const query = [3, 4];
const docs = [[6, 8], [4, 3], [1, 0.5]];

function normalise(v: number[]): number[] {
  // TODO
  return v;
}

function score(metric: Metric, a: number[], b: number[]): number {
  // TODO: return a value where HIGHER = more similar for every metric
  return 0;
}

function rankBy(metric: Metric, q: number[], ds: number[][]): number[] {
  // TODO: indexes sorted best-first
  return [];
}`,
        },
        hints: [
          'For L2, return the negative distance so "higher is better" holds for every metric.',
          'normalise: divide each component by Math.hypot(...v).',
          'Compare rankings with JSON.stringify of the index arrays.',
        ],
        solution: {
          language: 'typescript',
          code: `type Metric = 'cosine' | 'dot' | 'l2';

const query = [3, 4];
const docs = [[6, 8], [4, 3], [1, 0.5]];

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const len = (v: number[]) => Math.hypot(...v);

function normalise(v: number[]): number[] {
  const n = len(v) || 1;
  return v.map((x) => x / n);
}

function score(metric: Metric, a: number[], b: number[]): number {
  if (metric === 'dot') return dot(a, b);
  if (metric === 'cosine') return dot(a, b) / (len(a) * len(b));
  return -len(a.map((x, i) => x - b[i])); // negate: higher = closer
}

function rankBy(metric: Metric, q: number[], ds: number[][]): number[] {
  return ds
    .map((d, i) => ({ i, s: score(metric, q, d) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.i);
}

const metrics: Metric[] = ['cosine', 'dot', 'l2'];
console.log('raw', metrics.map((m) => m + '=' + JSON.stringify(rankBy(m, query, docs))));
// raw: cosine=[0,1,2] dot=[0,1,2] l2=[1,2,0]  <- L2 disagrees

const qn = normalise(query);
const dn = docs.map(normalise);
console.log('unit', metrics.map((m) => m + '=' + JSON.stringify(rankBy(m, qn, dn))));
// unit: all three = [0,1,2]`,
        },
        explanation: `Raw L2 punishes [6, 8] for being long, even though it points exactly the same way as the query. After normalising, every vector sits on the unit circle, length differences vanish, and the identity ‖a − b‖² = 2 − 2·cos makes all metrics order the documents identically.`,
      },
      quickCheck: {
        question: 'All your vectors are unit length. A colleague proposes switching the index from cosine to inner product "for better relevance". What changes in the results?',
        options: [
          'Rankings improve because dot product uses vector length information',
          'Nothing in the ranking changes; the inner product is just cheaper to compute',
          'Rankings reverse because inner product is a distance, not a similarity',
          'Results degrade because inner product ignores direction',
        ],
        correct: 1,
        explanation: 'For unit vectors the denominator of cosine is 1, so cosine and dot product are the same number. There is no length information left to exploit; the only gain is fewer operations.',
      },
      source: 'OpenAI Embeddings guide (normalised outputs, cosine vs dot product); pgvector README (distance operators)',
    },
  ],
  codeChallenges: [
    {
      id: 'embeddings-cc-1',
      title: 'Harden a naive corpus indexer',
      context: `A startup embeds its 40,000-article help centre with the script below. It takes 3 hours, crashes on a few long articles with a 400 error, fails at random on 429 rate limits, and nobody knows which model produced the stored vectors.`,
      task: `Rewrite \`indexAll\` so it (1) batches inputs, (2) keeps every input under the model token limit, (3) retries 429/5xx with exponential backoff, and (4) stores the model name and dimensions with every vector.`,
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const client = new OpenAI();

type Article = { id: string; text: string };
const store: { id: string; vector: number[] }[] = [];

export async function indexAll(articles: Article[]) {
  for (const a of articles) {
    // one HTTP request per article, whole article as input
    const res = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: a.text,
    });
    store.push({ id: a.id, vector: res.data[0].embedding });
  }
}`,
      },
      hints: [
        'One request can carry many inputs (keep each request well under the per-request token cap, e.g. 100–500 inputs).',
        'Approximate tokens as chars / 4 and split anything above ~8,000 tokens into chunks (or use a real tokenizer such as tiktoken).',
        'Wrap the API call in a retry loop that backs off 1s, 2s, 4s... with jitter on 429 and 5xx only.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const client = new OpenAI({ timeout: 30_000, maxRetries: 0 }); // we retry ourselves
const MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small';
const DIMS = 1536;
const BATCH = 256;            // inputs per request
const MAX_CHARS = 8000 * 4;   // ~8K tokens at ~4 chars/token, safely under 8,191

type Article = { id: string; text: string };
type Row = { id: string; chunk: number; vector: number[]; model: string; dims: number };
export const store: Row[] = [];

function split(a: Article) {
  const parts: { id: string; chunk: number; text: string }[] = [];
  for (let i = 0, n = 0; i < a.text.length; i += MAX_CHARS, n++) {
    parts.push({ id: a.id, chunk: n, text: a.text.slice(i, i + MAX_CHARS) });
  }
  return parts;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable || attempt >= tries - 1) throw err;
      const delay = 1000 * 2 ** attempt + Math.random() * 250; // backoff + jitter
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function indexAll(articles: Article[]) {
  const pieces = articles.flatMap(split);
  for (let i = 0; i < pieces.length; i += BATCH) {
    const batch = pieces.slice(i, i + BATCH);
    const res = await withRetry(() =>
      client.embeddings.create({ model: MODEL, input: batch.map((p) => p.text) }),
    );
    res.data.forEach((d, j) => {
      const p = batch[d.index ?? j]; // map by returned index, not by assumption
      store.push({ id: p.id, chunk: p.chunk, vector: d.embedding, model: MODEL, dims: DIMS });
    });
  }
}`,
      },
      explanation: `Batching 256 inputs turns 40,000 sequential round trips into ~160 requests, cutting wall time from hours to minutes. Splitting by a token budget removes the 400 errors (in production, split on paragraph boundaries rather than raw characters). Retrying only transient errors with jittered backoff survives rate limits without hammering the API. Storing \`model\` and \`dims\` per row makes future migrations and debugging possible: you can always tell which vectors are comparable.`,
      followUps: [
        {
          q: 'How would you make re-runs cheap when only 200 articles change per day?',
          a: 'Store a content hash (e.g. SHA-256 of the chunk text plus model name) with each row and skip chunks whose hash is unchanged. Only new or edited chunks are re-embedded and upserted.',
        },
        {
          q: 'The job is still slow. What is the next lever after batching?',
          a: 'Run several batches concurrently (e.g. 4–8 in flight with a limiter sized to your tokens-per-minute quota), or use the Batch API at roughly half price when the indexing is not latency-sensitive.',
        },
      ],
    },
    {
      id: 'embeddings-cc-2',
      title: 'Fix a search function that returns the wrong documents',
      context: `A team moved from OpenAI embeddings to the open \`intfloat/e5-base-v2\` model (768-d) to keep data in-house, and also truncates vectors to 256 dims "to save memory". Search quality collapsed. Here is their query-time code.`,
      task: 'Find every bug that hurts ranking and rewrite `search` so it ranks correctly for an e5 model stored at reduced size.',
      starter: {
        language: 'python',
        code: `import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("intfloat/e5-base-v2")

# doc_vecs: (N, 256) float32, built as:
#   model.encode(docs)[:, :256]       <- no prefix, truncated, not normalised

def search(query: str, doc_vecs: np.ndarray, k: int = 5):
    q = model.encode(query)[:256]
    dists = np.linalg.norm(doc_vecs - q, axis=1)   # Euclidean on raw vectors
    return np.argsort(-dists)[:k]                  # "highest first"`,
      },
      hints: [
        'e5 was trained with "query: " and "passage: " prefixes.',
        'e5-base-v2 is not documented as Matryoshka-trained: slicing to 256 dims throws away information arbitrarily.',
        'For Euclidean distance, smaller means closer. Check the sort direction.',
      ],
      solution: {
        language: 'python',
        code: `import numpy as np
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("intfloat/e5-base-v2")  # 768-d, NOT Matryoshka-trained

def build_index(docs: list[str]) -> np.ndarray:
    # 1) passage prefix, 2) keep all 768 dims, 3) unit-normalise
    vecs = model.encode(["passage: " + d for d in docs], normalize_embeddings=True)
    # Need less memory? Quantise (int8 / binary + rescoring) instead of slicing dims.
    return vecs.astype(np.float32)

def search(query: str, doc_vecs: np.ndarray, k: int = 5) -> np.ndarray:
    q = model.encode("query: " + query, normalize_embeddings=True)
    scores = doc_vecs @ q                 # unit vectors: dot == cosine
    top = np.argpartition(-scores, k)[:k] # O(N) partial sort
    return top[np.argsort(-scores[top])]  # best first`,
      },
      explanation: `Four bugs stacked up: (1) no "query: " / "passage: " prefixes, so inputs were off-distribution; (2) slicing a non-Matryoshka model to 256 dims discarded most of the signal; (3) unnormalised vectors with Euclidean distance mixed length into similarity; (4) \`argsort(-dists)\` returned the **farthest** documents. The fix keeps full dimensions, normalises, uses dot product and sorts descending by similarity. To save memory, quantise (int8 or binary with rescoring) or switch to a model that is actually MRL-trained.`,
      followUps: [
        {
          q: 'They really need 256-d vectors. What model choice would make truncation safe?',
          a: 'Pick a model trained with Matryoshka Representation Learning (e.g. OpenAI text-embedding-3 via the dimensions parameter, or open MRL models such as nomic-embed or several bge/gte variants that document supported sizes) and renormalise after truncating.',
        },
        {
          q: 'How would you prove the fix worked before shipping?',
          a: 'Build a small labelled set (50–200 queries with known relevant docs), compute Recall@10 and nDCG@10 for the old and new pipelines, and gate the release on the new numbers beating the old ones.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'embeddings-iq-01',
      difficulty: 'medium',
      question: 'Halfway through migrating from text-embedding-ada-002 to text-embedding-3-small, search quality fell off a cliff. Both produce 1536-d vectors and nothing errored. Diagnose and fix.',
      whatInterviewerLooksFor: [
        'Recognises that vectors from different models live in incompatible spaces',
        'Explains why equal dimensions hide the bug',
        'Proposes a safe migration: parallel index, backfill, cut-over',
        'Adds metadata/guards so it cannot happen again',
      ],
      modelAnswer: `**Diagnosis.** The index now holds a mix of ada-002 and 3-small vectors, and queries are embedded with only one of them. Each model learns its own coordinate system: dimension 17 means something completely different in each. Because both are 1536-d, the database happily computes cosine between them, so there is no error, just near-random similarity for every cross-model pair. Roughly half the corpus became unfindable.

**Confirm it:**
- Query a few known documents and log which model produced the stored vector versus the query vector.
- Compare score distributions: same-model pairs score in a normal band; cross-model pairs cluster near 0.

**Fix (blue/green migration):**
1. Create a **new index/collection** (or a new column) for 3-small vectors.
2. Backfill the entire corpus into it with batching and rate limiting; new writes go to **both** indexes while the backfill runs.
3. Evaluate on a labelled query set (Recall@10, nDCG@10) against the old index.
4. Flip the read path to the new index behind a flag; keep the old one for quick rollback, then delete it.

**Prevent it:**
- Store \`model\`, \`version\` and \`dims\` with every vector, and have the query path **assert** the query model equals the index model.
- Name indexes after the model (\`kb_te3small_1536\`) so mixing is visible.
- Treat the embedding model as part of the index schema: changing it is a migration, not a config tweak.`,
      followUps: [
        {
          q: 'The corpus is 50M chunks and re-embedding takes a week. How do you keep serving?',
          a: 'Keep reads on the old index until the new one is complete, dual-write new content to both, and backfill newest/most-queried content first so you can validate early. Cut over only after the full backfill and evaluation pass.',
        },
        {
          q: 'Could you learn a mapping from old to new vectors instead of re-embedding?',
          a: 'A linear adapter trained on paired embeddings can approximate the mapping and is a stopgap for huge corpora, but it loses quality versus re-embedding. Validate it on your eval set and still plan a full re-embed.',
        },
      ],
      pitfalls: [
        'Assuming equal dimensions means compatible vectors',
        'Migrating in place, leaving a mixed index during the backfill',
        'Cutting over without an offline evaluation',
      ],
    },
    {
      id: 'embeddings-iq-02',
      difficulty: 'medium',
      question: 'You must choose an embedding model for a support knowledge base in English, German and Japanese, about 2M chunks, with a modest budget. Walk me through your decision.',
      whatInterviewerLooksFor: [
        'Uses requirements (languages, privacy, volume, latency) before benchmarks',
        'Uses MTEB correctly (retrieval and multilingual subsets) as a shortlist only',
        'Builds a domain evaluation set',
        'Considers dims/storage, max tokens and total cost',
      ],
      modelAnswer: `**1. Requirements first.**
- Languages: EN/DE/JA, so the model must be multilingual and ideally handle cross-lingual queries (a German question finding an English article).
- Privacy: can the text leave our network? If not, only self-hosted models qualify.
- Volume and latency: 2M chunks to index once, plus steady query traffic; query embedding must be ~tens of ms.
- Chunk length: support articles chunked at ~300–500 tokens, so a 512-token limit is enough.

**2. Shortlist with MTEB.** Look at the **Retrieval** and **multilingual** subsets, not the overall average (which mixes clustering and classification). A typical shortlist: an API model (e.g. text-embedding-3-small/large), an open multilingual model (e.g. bge-m3, multilingual-e5), and one strong recent open model.

**3. Evaluate on our data.** Build 100–200 real queries per language with labelled relevant chunks, from search logs or tickets. Measure Recall@10 and nDCG@10 per language; Japanese often separates good from great.

**4. Cost and storage.**
- Index: 2M × 400 tokens = 800M tokens; at ~$0.02/1M that is ~$16 one-off.
- Storage: 2M × 1536 × 4 bytes ≈ 12 GB raw; with Matryoshka at 512 dims ≈ 4 GB.

**5. Decide** on the cheapest option within ~1–2 points of the best score, and record model + version with every vector so the choice can be revisited.`,
      followUps: [
        {
          q: 'Japanese recall is much worse than English for every candidate. What do you check?',
          a: 'Check chunking (Japanese has no spaces, so character-based chunkers may cut mid-word), token limits (Japanese uses more tokens per character), and whether queries mix scripts. Then consider adding sparse/BM25 with a Japanese analyzer for hybrid search.',
        },
        {
          q: 'When would you fine-tune an embedding model?',
          a: 'When domain jargon is poorly separated by general models and you have thousands of (query, relevant passage) pairs; fine-tuning an open model with contrastive loss often adds several points of recall on niche domains.',
        },
      ],
      pitfalls: [
        'Picking the top overall MTEB model without a domain eval',
        'Ignoring cross-lingual retrieval needs',
        'Forgetting storage cost scales with dimensions',
      ],
    },
    {
      id: 'embeddings-iq-03',
      difficulty: 'hard',
      question: 'Users searching "how do I NOT get charged after the trial" get the article "How to start your paid plan after the trial". Why does embedding search do this and what would you change?',
      whatInterviewerLooksFor: [
        'Explains that embeddings capture topic more than logic such as negation',
        'Knows bi-encoders compress the whole text into one vector before seeing the query',
        'Proposes reranking and hybrid search with concrete numbers',
        'Measures the fix',
      ],
      modelAnswer: `**Why.** A bi-encoder squeezes each text into a single vector *before* it ever sees the query. Both texts are about "trial", "charged", "paid plan", so they land in the same neighbourhood. A small word like "not" flips the intent but barely moves the vector, because training data rarely forces the model to separate near-identical texts that differ only by negation. Cosine similarity then ranks the topically closest article first.

**What to change:**
1. **Rerank.** Retrieve the top 30–50 candidates by vector search, then rescore with a **cross-encoder** (or a small LLM) that reads query and document *together*, so it can attend to "not" against "start". Cost: one extra model call of ~50–200 ms for the batch.
2. **Hybrid search.** Add BM25 and fuse with RRF; a title like "Cancel before your trial ends" matches "charged" and "trial" lexically and boosts the right article.
3. **Content fix.** Make sure an article explicitly titled "Cancel your trial to avoid charges" exists; embeddings cannot find what is not written.
4. **Query rewriting** for intent-heavy questions (e.g. an LLM rewrites to "cancel trial before billing").

**Measure.** Add negation and "opposite intent" queries to the eval set and track Recall@5 and MRR before and after; rerankers typically fix most of these cases.`,
      followUps: [
        {
          q: 'Why not just use the cross-encoder for the whole corpus?',
          a: 'A cross-encoder must run once per (query, document) pair at query time. Over 1M documents that is 1M forward passes per query, which is far too slow, so it only reranks a short candidate list from the bi-encoder.',
        },
        {
          q: 'Would a bigger embedding model alone fix this?',
          a: 'It may help a little, but the single-vector bottleneck remains. Reranking addresses the root cause much more reliably for the cost.',
        },
      ],
      pitfalls: [
        'Blaming the similarity metric instead of the bi-encoder architecture',
        'Proposing to rerank the whole corpus',
        'Shipping a fix without negation cases in the eval set',
      ],
    },
    {
      id: 'embeddings-iq-04',
      difficulty: 'hard',
      question: 'Your vector index for 100M chunks (text-embedding-3-large, 3072-d float32) costs too much RAM. Cut memory by at least 8x while losing little recall. Explain your plan.',
      whatInterviewerLooksFor: [
        'Computes the baseline memory correctly',
        'Uses Matryoshka shortening and quantisation, and knows the difference',
        'Uses a two-stage search with rescoring',
        'Validates with recall measurements',
      ],
      modelAnswer: `**Baseline.** 100M × 3072 × 4 bytes ≈ **1.23 TB** of raw vectors, before index overhead. Too much RAM.

**Lever 1: Matryoshka shortening.** text-embedding-3-large is MRL-trained, so request \`dimensions: 1024\` (or truncate and renormalise). 3072 → 1024 is **3x** smaller (≈ 410 GB) with a small quality drop; OpenAI reported that even 256 dims beat ada-002 at 1536 on MTEB.

**Lever 2: quantisation.**
- **int8 scalar**: 4 bytes → 1 byte per dim, another **4x** (≈ 102 GB). Recall loss is usually around 1%.
- **Binary**: 1 bit per dim, **32x** vs float32. Too lossy alone, but excellent as a first-stage filter.

**Lever 3: two-stage search with rescoring.**
1. Keep 1024-d **binary** codes in RAM: 100M × 128 bytes ≈ 12.8 GB. Hamming-distance search returns the top ~200 candidates.
2. **Rescore** those 200 with int8 or full-precision vectors kept on SSD (or memory-mapped), returning the top 10.

Total RAM ≈ 13 GB for codes plus the graph index: roughly **90x** less than the baseline, and published experiments report most of the original recall retained when rescoring is used.

**Validate.** Measure Recall@10 against exact full-precision search on 1,000 sampled queries for each configuration, and pick the cheapest one within your recall budget (e.g. ≥ 0.95 of baseline).`,
      followUps: [
        {
          q: 'Which of these levers needs a full re-embed?',
          a: 'Quantisation can be applied to existing vectors offline. Shortening via the API dimensions parameter needs new calls, but for an MRL model you can truncate the stored 3072-d vectors yourself and renormalise without calling the API again.',
        },
        {
          q: 'Why oversample to 200 candidates instead of 10?',
          a: 'Binary codes are coarse, so the true top 10 may sit at rank 30–150 in the binary ranking. Oversampling gives the precise rescoring stage a chance to recover them.',
        },
      ],
      pitfalls: [
        'Truncating a model that is not Matryoshka-trained',
        'Forgetting to renormalise after manual truncation',
        'Quantising to binary without a rescoring stage',
      ],
    },
    {
      id: 'embeddings-iq-05',
      difficulty: 'expert',
      question: 'A teammate set the pgvector index to inner product, while the model card says "trained with cosine similarity, outputs are not normalised". Explain what goes wrong, how you would detect it, and the correct configuration.',
      whatInterviewerLooksFor: [
        'Explains how vector norm leaks into dot-product scores',
        'Knows the cosine / dot / L2 equivalence for unit vectors',
        'Knows pgvector operators and that query and index metric must match',
        'Gives a concrete detection method',
      ],
      modelAnswer: `**What goes wrong.** Dot product = ‖a‖·‖b‖·cos θ. If vectors are not unit length, the score multiplies true semantic similarity by the document's norm. Norms often correlate with text length or token frequency, so long or boilerplate-heavy chunks get a systematic boost and outrank more relevant short ones. The model was trained to make the *angle* meaningful, not the length, so this boost is noise.

**How to detect it:**
- Compute vector norms across the corpus. If they vary (e.g. 0.8 to 1.4) the metric choice matters.
- For 200 sample queries, compare top-10 by inner product vs exact cosine. Low overlap (say < 0.8) confirms the skew.
- Check whether top results are dominated by long chunks.

**Correct configuration (pick one):**
1. **Normalise everything** at write and query time; then inner product = cosine and is the fastest option. In pgvector, use the \`<#>\` operator (negative inner product) with a \`vector_ip_ops\` index.
2. Keep vectors as-is and use cosine: \`vector_cosine_ops\` index and the \`<=>\` operator in queries.

**Gotchas:**
- The query operator must match the index ops class, otherwise Postgres will not use the HNSW index and falls back to a slow scan.
- After any manual Matryoshka truncation, renormalise again.
- Some models (e.g. certain msmarco "dot" models) *are* trained for unnormalised dot product; there, do the opposite and do not normalise. The model card decides.`,
      followUps: [
        {
          q: 'Is Euclidean (L2) a safe choice instead?',
          a: 'Only after normalising: then ||a − b||² = 2 − 2·cos and the ranking matches cosine. On raw vectors, L2 also mixes length into the score and has the same problem.',
        },
        {
          q: 'Why does pgvector return a negative inner product?',
          a: 'Postgres index scans order by ascending distance, so pgvector negates the inner product so that the most similar vectors (largest dot product) sort first.',
        },
      ],
      pitfalls: [
        'Assuming cosine and dot product are always interchangeable',
        'Mismatching the query operator and the index operator class',
        'Normalising vectors from a model trained for raw dot product',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'embeddings-est-1',
      question: 'A legal-tech startup wants semantic search over 8M contract clauses using text-embedding-3-small at full 1536 dimensions. How much RAM do the float32 vectors need, what does the API bill come to, and how much does dropping to 512 Matryoshka dimensions save?',
      assumptions: [
        'Average clause ≈ 500 tokens, one vector per clause',
        'text-embedding-3-small: 1536 dims, illustrative price $0.02 per 1M tokens',
        'float32 storage = 4 bytes per dimension; index overhead ~1.5x raw',
        '50K lawyer searches per day, average query ≈ 15 tokens; 30 days per month',
      ],
      steps: [
        { label: 'Corpus tokens', calc: '8,000,000 clauses × 500 tokens = 4 × 10^9 tokens (4B)' },
        { label: 'Indexing cost', calc: '4,000 M tokens × $0.02 / 1M = $80 one-off' },
        { label: 'Number of vectors', calc: '8M clauses → 8M vectors' },
        { label: 'Raw storage', calc: '8M × 1,536 × 4 B = 49.2 GB' },
        { label: 'With index overhead', calc: '49.2 GB × 1.5 ≈ 74 GB' },
        { label: 'Query tokens / month', calc: '50,000 × 15 × 30 = 22.5M tokens' },
        { label: 'Query cost / month', calc: '22.5 M × $0.02 / 1M = $0.45' },
        { label: 'Matryoshka 512-d alternative', calc: '8M × 512 × 4 B = 16.4 GB raw (~25 GB with overhead)' },
      ],
      answer: '≈ $80 to embed the corpus once, ≈ 49 GB raw (≈ 74 GB indexed) of vectors, and under $1/month for query embeddings. Shrinking to 512 dims cuts storage to ≈ 16 GB raw.',
      insight: 'Embedding API spend is negligible; the real recurring cost is RAM/storage for the vectors, which scales linearly with dimensions. Dimension reduction and quantisation matter far more than the per-token embedding price.',
      followUps: [
        {
          q: 'What if you add 20% chunk overlap and re-embed the corpus monthly after content updates?',
          a: '20% overlap means ~1.2x tokens and vectors: ≈ $96 per full re-embed and ≈ 59 GB raw. Monthly full re-embeds cost ~$1,150/year; with content hashing you only re-embed changed chunks, typically a few percent.',
        },
      ],
    },
    {
      id: 'embeddings-est-2',
      question: 'Without an ANN index, how long does an exact (brute-force) similarity search take over 1M vectors of 768 dims on one CPU core, and can it serve 100 QPS?',
      assumptions: [
        'float32 vectors, unit-normalised, dot product as the score',
        'One core sustains ~20 GFLOP/s with SIMD; memory bandwidth ~20 GB/s per core',
        'One multiply-add = 2 FLOPs; ignore top-k selection cost',
      ],
      steps: [
        { label: 'Data to scan', calc: '1M × 768 × 4 B = 3.07 GB per query' },
        { label: 'Compute', calc: '1M × 768 × 2 FLOPs = 1.54 GFLOP → 1.54 / 20 ≈ 77 ms' },
        { label: 'Memory bound', calc: '3.07 GB / 20 GB/s ≈ 154 ms (dominates)' },
        { label: 'Throughput per core', calc: '1 / 0.154 s ≈ 6.5 QPS' },
        { label: 'Cores for 100 QPS', calc: '100 / 6.5 ≈ 16 cores fully busy' },
        { label: 'Binary-quantised alternative', calc: '1M × 96 B = 96 MB to scan → ≈ 5 ms; ~200 QPS per core' },
      ],
      answer: 'About 150 ms per query, memory-bound, so ~6–7 QPS per core; 100 QPS needs ~16 dedicated cores. An ANN index (HNSW) or binary quantisation brings it to single-digit milliseconds.',
      insight: 'Exact search is fine for prototypes up to roughly 100K vectors, but at millions of vectors you need an ANN index or compressed vectors, because scanning memory, not maths, is the bottleneck.',
      followUps: [
        {
          q: 'How would a GPU change the picture?',
          a: 'A GPU with ~1–2 TB/s memory bandwidth scans 3 GB in ~2–3 ms, and batching many queries reuses each loaded vector, so exact search over 1M vectors can serve thousands of QPS, at a much higher hardware cost.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'embeddings-mcq-01',
      difficulty: 'medium',
      question: 'Using a good general-purpose embedding model, which document will most likely score highest for the query "I forgot my login credentials"?',
      options: [
        '"How to reset your password"',
        '"How to reset your router to factory settings"',
        '"Login page redesign: release notes"',
        '"Credentials for the guest Wi-Fi are on the fridge"',
      ],
      correct: [0],
      explanation: 'Embeddings capture intent: forgetting credentials means needing a password reset, even with zero shared keywords. The router reset shares the verb "reset" but a different topic; the release notes and Wi-Fi note share keywords ("login", "credentials") but not the user need, which is exactly where keyword search would go wrong.',
      followUps: [
        {
          q: 'Which retrieval approach would most likely rank the Wi-Fi note highly, and why?',
          a: 'Keyword search such as BM25, because "credentials" is a fairly rare word shared with the query, and BM25 rewards rare shared terms regardless of meaning.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-02',
      difficulty: 'hard',
      question: 'What does this script print?',
      code: {
        language: 'python',
        code: `import numpy as np
a = np.array([3.0, 4.0])
b = np.array([6.0, 8.0])
cos = a @ b / (np.linalg.norm(a) * np.linalg.norm(b))
l2 = np.linalg.norm(a - b)
print(round(cos, 2), a @ b, round(l2, 2))`,
      },
      options: ['1.0 50.0 5.0', '0.5 50.0 5.0', '1.0 25.0 0.0', '0.96 50.0 2.5'],
      correct: [0],
      explanation: 'b = 2a, so they point the same way: cosine is exactly 1.0. The dot product is 3·6 + 4·8 = 50, and the Euclidean distance is the length of a − b = [−3, −4], i.e. 5. Option "1.0 25.0 0.0" assumes normalised vectors; "0.96" is the cosine of a with [4, 3], not with b.',
      followUps: [
        {
          q: 'What would the three numbers be after normalising both vectors?',
          a: 'Both become [0.6, 0.8], so cosine is 1.0, the dot product is 1.0 and the Euclidean distance is 0.0: all three agree they are identical.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-03',
      difficulty: 'hard',
      question: 'Which of these changes force you to re-embed the entire document corpus? Select ALL that apply.',
      options: [
        'Switching from text-embedding-3-small to bge-m3',
        'Changing chunk size from 300 to 800 tokens',
        'Raising the HNSW efSearch parameter from 40 to 200',
        'Starting to add the "passage: " prefix to documents for an e5 model',
      ],
      correct: [0, 1, 3],
      explanation: 'A new model means a new vector space; new chunk boundaries mean new texts to embed; adding the passage prefix changes every input string, so every vector changes. efSearch is a query-time search parameter of the index: it changes recall and latency but not the stored vectors.',
      followUps: [
        {
          q: 'Which index setting would require rebuilding the index but not re-embedding?',
          a: 'Build-time graph parameters such as HNSW M or efConstruction, or changing the distance metric, require rebuilding the index from the existing vectors, but no new embedding calls.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-04',
      difficulty: 'hard',
      question: 'To save memory, this code truncates stored text-embedding-3-large vectors and searches with a dot-product index. What is the problem?',
      code: {
        language: 'typescript',
        code: `const full = (await client.embeddings.create({
  model: 'text-embedding-3-large',
  input: chunks,
})).data.map((d) => d.embedding);          // 3072-d, unit length

const short = full.map((v) => v.slice(0, 256)); // keep first 256 dims
await index.upsert(short, { metric: 'dot' });`,
      },
      options: [
        'The sliced vectors are no longer unit length, so dot-product scores mix in each vector\'s norm and ranking skews',
        'Matryoshka models cannot be truncated after the fact; the API must be called with dimensions',
        'Slicing keeps the wrong end: Matryoshka information is concentrated in the last dimensions',
        'Nothing; truncating to 256 dims keeps vectors unit length because the model is normalised',
      ],
      correct: [0],
      explanation: 'MRL models front-load information, so slicing the first 256 dims is valid, but the slice has a norm below 1 that varies per vector. Dot product then rewards vectors with more mass in the first dims. Renormalise after slicing, or request dimensions: 256 from the API, which renormalises for you. Manual truncation is allowed, so the "must call the API" option is wrong.',
      followUps: [
        {
          q: 'If you switched this index to cosine instead of dot, would the bug go away?',
          a: 'Yes for ranking: cosine divides out each vector\'s norm, so non-normalised slices rank correctly. Renormalising is still better because it lets you use the cheaper dot product.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-05',
      difficulty: 'medium',
      question: 'You picked the model with the highest overall MTEB average, but it retrieves legal clauses worse than a smaller model you tried. What is the most likely explanation?',
      options: [
        'The overall average mixes tasks like classification and clustering, and general web data differs from your legal domain',
        'MTEB only measures English, so it says nothing about legal text',
        'Larger embedding models always overfit and generalise worse',
        'MTEB scores are measured with Euclidean distance, which disagrees with cosine',
      ],
      correct: [0],
      explanation: 'The MTEB average blends many task types; a model can lead on clustering or classification yet be weaker at retrieval, and leaderboard datasets rarely look like your legal corpus. Read the Retrieval column and test on your own queries. MTEB has multilingual tracks, bigger models do not "always" overfit, and the metric choice is not the issue.',
      followUps: [
        {
          q: 'How many labelled queries do you need for a useful in-house comparison?',
          a: 'Even 50–200 real queries with labelled relevant passages usually separate models clearly; it is far better than relying on public leaderboard averages.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-06',
      difficulty: 'hard',
      question: 'An e5 model was used to index documents with "passage: " prefixes. The query service sends raw user questions with no prefix. What is the most likely effect?',
      options: [
        'A silent recall drop, because queries are encoded off the distribution the model was trained on',
        'An API error, because the model requires a prefix on every input',
        'No effect, since the prefix is stripped by the tokenizer',
        'Better recall, because the query is shorter without the prefix',
      ],
      correct: [0],
      explanation: 'Asymmetric models learn different roles for "query: " and "passage: ". Without the prefix the query vector lands in a slightly wrong region, quietly costing recall. Nothing errors and the tokenizer does not strip it, so the bug often goes unnoticed until someone measures.',
      followUps: [
        {
          q: 'What is the API-model equivalent of these prefixes?',
          a: 'Parameters like Cohere and Voyage input_type ("search_query" vs "search_document", or "query" vs "document") or Gemini task_type RETRIEVAL_QUERY vs RETRIEVAL_DOCUMENT.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-07',
      difficulty: 'expert',
      question: 'All vectors in your index are unit-normalised. Which scoring rules return exactly the same nearest-neighbour ranking? Select ALL that apply.',
      options: [
        'Cosine similarity, highest first',
        'Dot product, highest first',
        'Euclidean (L2) distance, lowest first',
        'Manhattan (L1) distance, lowest first',
      ],
      correct: [0, 1, 2],
      explanation: 'For unit vectors cosine equals the dot product, and ||a − b||² = 2 − 2·cos, so L2 is a monotonic transform of cosine and gives the same ranking. Manhattan distance has no such identity with the angle, so it can order neighbours differently.',
      followUps: [
        {
          q: 'Why do many vector databases recommend dot product for normalised embeddings?',
          a: 'It gives the same ranking as cosine but skips computing norms and square roots, so it is the cheapest operation per comparison.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-08',
      difficulty: 'hard',
      question: 'A team embeds each 40-page contract as a single vector with text-embedding-3-small and finds that specific clause questions retrieve the wrong contracts. What is the best explanation?',
      options: [
        'Inputs beyond ~8K tokens fail or must be cut, and one vector averages many topics so no single clause is well represented',
        'Cosine similarity cannot compare vectors produced from texts of different lengths',
        'text-embedding-3-small only works on single sentences',
        'Contracts need a 3072-d model because they are long',
      ],
      correct: [0],
      explanation: 'A 40-page contract is ~20K+ tokens, beyond the 8,191 limit, so it errors or gets truncated, and even within limits a single vector blurs dozens of clauses into an average. Chunking into clause-sized passages fixes both. Cosine handles length differences fine and more dimensions do not solve dilution.',
      followUps: [
        {
          q: 'After chunking, how do you still return the whole contract to the user?',
          a: 'Store the contract id as metadata on every chunk, retrieve chunks, then group by contract id (or use parent-document retrieval) to show the contract and highlight the matched clause.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-09',
      difficulty: 'expert',
      question: 'Search results are nonsense, but there are no errors. Why?',
      code: {
        language: 'typescript',
        code: `// indexer.ts (ran last year)
const DOC_MODEL = 'text-embedding-ada-002';      // 1536-d
// search.ts (deployed today)
const QUERY_MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small'; // 1536-d

const q = await client.embeddings.create({ model: QUERY_MODEL, input: userQuery });
const hits = await pgClient.query(
  'SELECT id FROM chunks ORDER BY embedding <=> $1 LIMIT 5',
  [toSql(q.data[0].embedding)],
);`,
      },
      options: [
        'Query and documents come from different models that share a dimension count, so the database compares incompatible vector spaces without complaint',
        'The <=> operator is Euclidean distance, which is wrong for OpenAI embeddings',
        'ada-002 vectors are not normalised, so cosine distance fails',
        'LIMIT 5 is applied before ordering, so random rows are returned',
      ],
      correct: [0],
      explanation: 'Both models output 1536 numbers, so pgvector accepts the query, but each model has its own coordinate system and cross-model similarities are meaningless. In pgvector <=> is cosine distance (correct here), OpenAI vectors are normalised, and SQL applies ORDER BY before LIMIT.',
      followUps: [
        {
          q: 'What guard would have caught this at deploy time?',
          a: 'Store the model name with the index (a table comment, metadata column or index name) and have the search service assert that its configured query model matches before serving traffic.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-10',
      difficulty: 'hard',
      question: 'You need to cut vector memory several-fold with minimal recall loss on a text-embedding-3-large index. Which techniques help? Select ALL that apply.',
      options: [
        'Request fewer dimensions (e.g. 512) via the Matryoshka-aware dimensions parameter',
        'Store int8 scalar-quantised vectors instead of float32',
        'Use binary quantisation for a first pass, then rescore the top candidates with full vectors',
        'Switch the index metric from cosine to Euclidean distance',
      ],
      correct: [0, 1, 2],
      explanation: 'Fewer MRL dimensions shrink every vector linearly, int8 cuts bytes per dimension by 4x, and binary codes plus rescoring cut RAM up to 32x while keeping most recall. Changing the distance metric does not change how many bytes each vector takes.',
      followUps: [
        {
          q: 'Which of these can you apply to vectors you have already stored without any API calls?',
          a: 'All three: quantisation works on existing vectors, and because the model is Matryoshka-trained you can slice stored 3072-d vectors to 512 and renormalise locally.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-11',
      difficulty: 'medium',
      question: 'A blog post says "cosine above 0.8 means relevant". With your new embedding model, almost no results exceed 0.6, though the rankings look right. What should you do?',
      options: [
        'Calibrate a threshold for this model using labelled relevant and irrelevant pairs',
        'Switch models, since scores below 0.8 mean the model is weak',
        'Multiply all scores by a constant so they exceed 0.8',
        'Remove normalisation so that scores become larger',
      ],
      correct: [0],
      explanation: 'Similarity score ranges differ by model and training: one model packs relevant pairs at 0.4–0.6, another at 0.75–0.9. Ranking quality is what matters; any cut-off must be tuned per model on labelled data. Rescaling or removing normalisation just hides the issue or breaks the metric.',
      followUps: [
        {
          q: 'How do you choose the threshold from labelled pairs?',
          a: 'Score a few hundred labelled pairs, plot precision and recall against the threshold, and pick the value that meets your target, e.g. 95% precision for an "I don\'t know" fallback.',
        },
      ],
    },
    {
      id: 'embeddings-mcq-12',
      difficulty: 'expert',
      question: 'This code builds a dense retrieval index for a model whose card says "trained with dot-product similarity; do NOT normalise". What happens?',
      code: {
        language: 'python',
        code: `from sentence_transformers import SentenceTransformer
model = SentenceTransformer("sentence-transformers/msmarco-distilbert-base-tas-b")
docs = model.encode(passages, normalize_embeddings=True)
q = model.encode(query, normalize_embeddings=True)
scores = docs @ q`,
      },
      options: [
        'Ranking degrades, because normalising discards the vector-length signal the model learned to use for relevance',
        'Nothing changes, because dot product and cosine always rank identically',
        'It raises an error, because dot-product models cannot be normalised',
        'Ranking improves, because normalising always removes noise',
      ],
      correct: [0],
      explanation: 'Dot-product-trained models encode part of the relevance signal in vector length, and normalising throws it away, effectively turning the score into cosine. Cosine and dot only coincide when vectors are already unit length. The model card decides the metric, not a universal rule.',
      followUps: [
        {
          q: 'Which index metric should you configure for this model in pgvector?',
          a: 'Inner product: create the HNSW index with vector_ip_ops and query with the <#> operator (negative inner product), storing raw, unnormalised vectors.',
        },
      ],
    },
  ],
};

export default topic;
