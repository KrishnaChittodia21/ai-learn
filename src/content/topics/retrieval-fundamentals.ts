import type { Topic } from '../../types';

const topic: Topic = {
  id: 'retrieval-fundamentals',
  phase: 'retrieval',
  order: 1,
  title: 'Retrieval Fundamentals: Keyword, BM25, Dense, Sparse and Hybrid',
  subtitle: 'How search engines find the right passages, and why production RAG combines lexical and semantic retrieval',
  estimatedMinutes: 68,
  sources: [
    'Manning, Raghavan and Schütze — Introduction to Information Retrieval (Cambridge, 2008)',
    'Robertson and Zaragoza 2009 — The Probabilistic Relevance Framework: BM25 and Beyond',
    'Apache Lucene docs — BM25Similarity (k1 = 1.2, b = 0.75; IDF = ln(1 + (N − n + 0.5)/(n + 0.5)))',
    'Karpukhin et al. 2020 — Dense Passage Retrieval for Open-Domain Question Answering (DPR)',
    'Formal et al. 2021 — SPLADE: Sparse Lexical and Expansion Model for First Stage Ranking; SPLADE v2',
    'Chen et al. 2024 — BGE M3-Embedding: multi-lingual, multi-functionality (dense, sparse, multi-vector)',
    'Thakur et al. 2021 — BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of IR Models',
    'PostgreSQL docs — Full Text Search (tsvector, websearch_to_tsquery, ts_rank_cd); pgvector README',
    'Qdrant docs — Hybrid queries with the Query API (prefetch + RRF fusion), sparse vectors',
    'Anthropic (Sep 2024) — Introducing Contextual Retrieval (embeddings + BM25 hybrid)',
  ],
  tags: ['information retrieval', 'inverted index', 'keyword search', 'BM25', 'dense retrieval', 'SPLADE', 'sparse vectors', 'hybrid search'],
  cheatSheet: [
    'IR = given a query, return a ranked list of relevant items from a corpus; quality is measured with precision, recall, MRR and NDCG.',
    'Inverted index: term → posting list of (docId, tf, positions); the backbone of keyword search, fast even over billions of docs.',
    'Keyword search needs analysis: lowercase, tokenise, stopwords, stemming or lemmatisation; the same analyser for docs and queries.',
    'BM25 = Σ IDF(t) · tf·(k1+1) / (tf + k1·(1 − b + b·dl/avgdl)); k1 ≈ 1.2 controls tf saturation, b = 0.75 controls length normalisation.',
    'BM25 IDF (Lucene) = ln(1 + (N − n + 0.5)/(n + 0.5)): rare terms weigh far more than common ones.',
    'Dense retrieval: bi-encoder embeds query and docs into one vector space; ANN search (HNSW) finds nearest neighbours; great for paraphrase, weak on exact IDs.',
    'Learned sparse (SPLADE, bge-m3 sparse, ELSER): a transformer outputs weights over the vocabulary, including expansion terms, served from an inverted index.',
    'Hybrid = lexical + dense in parallel, fused (RRF k = 60 by default), then reranked; robust across query types.',
    'BEIR showed BM25 is a strong zero-shot baseline that many dense models failed to beat out of domain.',
    'Evaluate retrieval separately from generation: recall@K for the candidate stage, NDCG@10 for ranking.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Information Retrieval — finding the right needle, ranked',
      body: `**Information retrieval (IR)** is the science of finding relevant items in a large collection for a query, and **ranking** them so the best come first. A librarian who hears "something on refund rules for broken items" and hands you the three best pages, in order, is doing IR.

**Core vocabulary**

| Term | Meaning |
|---|---|
| Corpus | the documents or chunks you search |
| Index | a precomputed structure that makes search fast (inverted index, vector index) |
| Query | the user's need, often short and ambiguous |
| Relevance | does this document satisfy the need? (graded or binary) |
| Ranking function | assigns each candidate a score: BM25, cosine, a reranker |

**The inverted index** maps each term to a *posting list* of the documents that contain it, plus term frequencies and positions. A query touches only the posting lists of its terms, which is why keyword search stays fast at billions of documents.

**Two families of retrievers:** *lexical* (match words: keyword search, BM25, learned sparse) and *semantic* (match meaning: dense embeddings). The rest of this topic covers both, then combines them.

**In RAG**, retrieval quality caps answer quality: if the right chunk is not retrieved, the LLM cannot cite it. Measure recall@K (did we find it?) and precision/NDCG (is it near the top?).`,
      example: `Corpus of 3 chunks:
- d1: "Refunds for damaged items are issued within 30 days."
- d2: "Shipping takes 3-5 business days."
- d3: "Damaged packaging should be reported to the courier."

Inverted index after lowercasing and stopword removal: \`refunds → [d1]\`, \`damaged → [d1, d3]\`, \`items → [d1]\`, \`shipping → [d2]\`, \`packaging → [d3]\`, …

Query "damaged refunds" reads 2 posting lists: d1 matches both terms, d3 matches one. Ranked output: **d1, d3**. d2 is never touched. With 10M chunks the same query might read 2 posting lists of 40K and 8K entries rather than scanning 10M documents.`,
      diagram: `             OFFLINE (indexing)                    ONLINE (query)
 docs ─► analyse ─► tokens ─► inverted index     query ─► analyse ─► terms
                              ┌──────────────┐                  │
                              │ damaged → d1,d3 ◄───────────────┤ lookup
                              │ refunds → d1    ◄───────────────┘
                              │ shipping→ d2  │
                              └──────────────┘
                                     │ candidates (d1, d3)
                                     ▼
                           score (BM25 / cosine) ─► ranked list ─► top-K`,
      code: [
        {
          language: 'typescript',
          title: 'A tiny inverted index with term frequencies',
          code: `const STOP = new Set(['the', 'a', 'an', 'for', 'are', 'is', 'be', 'to', 'of', 'within', 'should']);

export const analyse = (text: string) =>
  text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

type Posting = { docId: string; tf: number };

export function buildIndex(docs: Record<string, string>) {
  const index = new Map<string, Posting[]>();
  for (const [docId, text] of Object.entries(docs)) {
    const tf = new Map<string, number>();
    for (const t of analyse(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, count] of tf) {
      if (!index.has(term)) index.set(term, []);
      index.get(term)!.push({ docId, tf: count }); // posting list per term
    }
  }
  return index;
}

// OR query: count how many query terms each doc matches
export function search(index: Map<string, Posting[]>, query: string) {
  const hits = new Map<string, number>();
  for (const term of analyse(query))
    for (const p of index.get(term) ?? []) hits.set(p.docId, (hits.get(p.docId) ?? 0) + 1);
  return [...hits].sort((a, b) => b[1] - a[1]);
}`,
        },
      ],
      prosCons: {
        pros: [
          'Inverted indexes are fast, compact and mature (Lucene, Elasticsearch, OpenSearch, Postgres FTS).',
          'Ranking makes results usable: the user (or LLM) sees the best few first.',
          'Clear metrics (recall@K, NDCG) let you improve retrieval independently of the LLM.',
        ],
        cons: [
          {
            con: 'Users phrase queries differently from documents (vocabulary mismatch).',
            fix: 'Add semantic retrieval (dense or learned sparse) and query expansion alongside lexical search.',
          },
          {
            con: 'Without labelled data you cannot tell whether retrieval is getting better or worse.',
            fix: 'Build a golden set of 200–500 queries with known relevant chunks (from logs or synthetic questions) and track recall@K on every change.',
          },
        ],
      },
      keyPoints: [
        'IR = find and rank relevant items for a query.',
        'The inverted index maps term → posting list; queries touch only their terms\' lists.',
        'Lexical retrievers match words; dense retrievers match meaning.',
        'Retrieval recall is a hard ceiling on RAG answer quality.',
      ],
      exercise: {
        prompt: `Extend the tiny index to support an **AND query**: \`andSearch(index, query)\` returns only documents that contain **every** query term, sorted by the sum of term frequencies (descending).

Acceptance: for the example corpus, \`andSearch(idx, 'damaged refunds')\` returns \`['d1']\`, and \`andSearch(idx, 'damaged')\` returns d1 and d3. An unknown term returns \`[]\`.`,
        starter: {
          language: 'typescript',
          code: `type Posting = { docId: string; tf: number };
declare function analyse(text: string): string[];

export function andSearch(index: Map<string, Posting[]>, query: string): string[] {
  // TODO: intersect posting lists, sum tf, sort
  return [];
}`,
        },
        hints: [
          'Start from the shortest posting list; intersection can only shrink.',
          'Keep a Map<docId, tfSum> and delete docs missing from any list.',
          'Return [] immediately if any term has no posting list.',
        ],
        solution: {
          language: 'typescript',
          code: `type Posting = { docId: string; tf: number };
declare function analyse(text: string): string[];

export function andSearch(index: Map<string, Posting[]>, query: string): string[] {
  const lists = analyse(query).map((t) => index.get(t) ?? []);
  if (!lists.length || lists.some((l) => l.length === 0)) return [];
  lists.sort((a, b) => a.length - b.length); // shortest first = fewer checks

  let acc = new Map(lists[0].map((p) => [p.docId, p.tf]));
  for (const list of lists.slice(1)) {
    const next = new Map<string, number>();
    for (const p of list) if (acc.has(p.docId)) next.set(p.docId, acc.get(p.docId)! + p.tf);
    acc = next; // keep only docs present in every list
  }
  return [...acc].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}`,
        },
        explanation:
          'Intersecting posting lists, starting with the rarest term, is how search engines execute conjunctive queries efficiently. The tf sum is a crude score; BM25 (later in this topic) replaces it with a principled one.',
      },
      quickCheck: {
        question: 'Why is an inverted index fast for keyword queries over millions of documents?',
        options: [
          'It stores documents sorted alphabetically',
          'A query reads only the posting lists of its own terms instead of scanning every document',
          'It compresses documents into a single vector',
          'It caches every possible query in advance',
        ],
        correct: 1,
        explanation:
          'Each term points directly to the documents containing it, so query cost depends on posting-list lengths, not corpus size. Alphabetical storage and vectors do not give this property, and caching all queries is impossible.',
      },
      source: 'Manning, Raghavan and Schütze — Introduction to Information Retrieval, ch. 1–2',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Keyword Search — analysers, TF-IDF and exact matching',
      body: `Keyword (lexical) search matches the **words** of the query against the words of documents. It works like Ctrl+F with ranking: unbeatable when the user types the exact term (an error code, a SKU, a person's name).

**Text analysis** decides what counts as a "word":
1. **Tokenise:** split "E-1043/firmware" into tokens.
2. **Normalise:** lowercase, strip accents.
3. **Stopwords:** drop "the", "of" (optional; can hurt phrase queries).
4. **Stem or lemmatise:** "refunds", "refunded" → "refund".

Docs and queries **must use the same analyser**, or "Refunds" never matches "refund".

**TF-IDF** is the classic ranking: *term frequency* (more occurrences, more relevant) × *inverse document frequency* (rare terms are more informative): idf = log(N / df). Its weaknesses, unbounded tf and no length control, are what BM25 fixes next.

**Where you meet it:** Elasticsearch/OpenSearch \`match\` queries, Postgres full-text search (\`tsvector\`, \`websearch_to_tsquery\`, \`ts_rank_cd\`), SQLite FTS5 (which ranks with BM25).

**When to use it:** identifiers, codes, names, legal citations, and as half of hybrid search. Avoid it as the only retriever for natural-language questions with paraphrases.`,
      example: `Query: \`ERR_CONN_RESET chrome\` over a 50K-chunk support KB.

- Keyword search (Postgres FTS): the 3 chunks containing **err_conn_reset** rank top 3; rank score 0.61, 0.48, 0.33.
- Dense-only search returned "network timeout troubleshooting" and "browser crashes" first; the exact error-code page was #9.

TF-IDF view: \`err_conn_reset\` appears in 3 of 50K docs → idf = ln(50000/3) ≈ **9.7**; \`chrome\` in 4,000 docs → idf ≈ **2.5**. The rare code dominates the score, which is exactly what the user wanted.`,
      diagram: `"Refunds for DAMAGED items!"            query: "damaged refund"
          │ tokenise                             │
          ▼                                      ▼
 [Refunds, for, DAMAGED, items]          [damaged, refund]
          │ lowercase + stopwords + stem         │ (same analyser!)
          ▼                                      ▼
 [refund, damag, item]  ───── match ─────  [damag, refund]
          │
   score = Σ tf(t,d) × idf(t)      idf = log(N / df)`,
      code: [
        {
          language: 'sql',
          title: 'Postgres full-text search with a stored tsvector and GIN index',
          code: `-- 1. Generated tsvector column (same 'english' analyser for docs and queries)
ALTER TABLE chunks
  ADD COLUMN tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||   -- title matters more
    setweight(to_tsvector('english', coalesce(body,  '')), 'B')
  ) STORED;

-- 2. Inverted index over the tsvector
CREATE INDEX chunks_tsv_idx ON chunks USING GIN (tsv);

-- 3. Query: websearch syntax supports "quoted phrases", OR, and -exclusions
SELECT id, title,
       ts_rank_cd(tsv, q) AS rank        -- cover-density ranking (not BM25)
FROM chunks, websearch_to_tsquery('english', $1) AS q
WHERE tsv @@ q                           -- uses the GIN index
ORDER BY rank DESC
LIMIT 20;`,
        },
      ],
      prosCons: {
        pros: [
          'Exact, explainable matches: you can show which words matched.',
          'Excellent for IDs, codes, names and rare jargon.',
          'Cheap: no GPU, no embedding calls, mature tooling.',
        ],
        cons: [
          {
            con: 'Vocabulary mismatch: "laptop won\'t turn on" misses "device fails to power up".',
            fix: 'Pair it with dense retrieval in hybrid search, or add synonyms / LLM query expansion.',
          },
          {
            con: 'Default analysers mangle codes and mixed text ("E-1043" becomes "e" and "1043").',
            fix: 'Add a keyword sub-field or custom tokenizer that preserves identifiers, and query both fields.',
          },
          {
            con: 'Postgres ts_rank is not BM25 and ignores corpus-wide statistics.',
            fix: 'Use a BM25-capable engine (Elasticsearch/OpenSearch, ParadeDB pg_search, SQLite FTS5) when ranking quality matters.',
          },
        ],
      },
      keyPoints: [
        'Same analyser at index and query time, always.',
        'IDF makes rare terms count more; that is why exact codes win.',
        'TF-IDF has unbounded tf and no length normalisation; BM25 fixes both.',
        'Keyword search is half of every good hybrid system.',
      ],
      exercise: {
        prompt: `Implement \`tfidfRank(docs, query)\` returning document ids sorted by TF-IDF score.

- tf = raw count of the term in the doc; idf = \`Math.log(N / df)\` (df = docs containing the term; skip terms with df = 0).
- Lowercase and split on non-alphanumerics.
- Acceptance: with docs \`{a: 'refund refund policy', b: 'refund shipping', c: 'shipping policy'}\` and query \`'refund policy'\`, the order is **a, b, c**.`,
        hints: [
          'Precompute df per term with a Map over unique tokens per doc.',
          'N = number of docs; idf(refund) = ln(3/2) ≈ 0.405.',
          'a: 2×0.405 + 1×0.405 = 1.216; b: 0.405; c: 0.405 — break ties by id.',
        ],
        solution: {
          language: 'typescript',
          code: `const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function tfidfRank(docs: Record<string, string>, query: string): string[] {
  const ids = Object.keys(docs);
  const N = ids.length;
  const toks = Object.fromEntries(ids.map((id) => [id, tokens(docs[id])]));
  const df = new Map<string, number>();
  for (const id of ids) for (const t of new Set(toks[id])) df.set(t, (df.get(t) ?? 0) + 1);

  const score = (id: string) =>
    tokens(query).reduce((s, t) => {
      const d = df.get(t);
      if (!d) return s; // term unseen in corpus
      const tf = toks[id].filter((x) => x === t).length;
      return s + tf * Math.log(N / d);
    }, 0);

  return ids
    .map((id) => ({ id, s: score(id) }))
    .sort((x, y) => y.s - x.s || x.id.localeCompare(y.id)) // stable tie-break
    .map((x) => x.id);
}`,
        },
        explanation:
          'Document a wins because "refund" appears twice, and b and c tie at 0.405 each (one matching term with the same idf), with the id tie-break putting b first. Notice that tf grows linearly: a doc repeating "refund" 50 times would score 50x, which is the flaw BM25 saturation addresses.',
      },
      quickCheck: {
        question:
          'Your index stems "refunds" → "refund", but the query path skips stemming. What happens for the query "refunds"?',
        options: [
          'It still matches because search engines stem automatically at query time',
          'It looks up the token "refunds", which does not exist in the index, so relevant docs are missed',
          'It matches more documents than before',
          'It only affects the ranking, not which documents match',
        ],
        correct: 1,
        explanation:
          'The index contains "refund", but the unstemmed query token is "refunds"; no posting list matches. Index and query analysers must be identical. Engines stem queries only when you configure the same analyser for the query.',
      },
      source: 'PostgreSQL docs — Full Text Search; Manning et al. — IR book, ch. 6 (tf-idf)',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'BM25 — term frequency, saturation and length normalisation',
      body: `**BM25** (Best Matching 25) is TF-IDF with two common-sense fixes, and it is still the default ranking in Lucene, Elasticsearch, OpenSearch and most lexical engines.

**Formula** for query Q and document D:

score(D, Q) = Σ over terms t in Q of IDF(t) · tf · (k1 + 1) / (tf + k1 · (1 − b + b · |D| / avgdl))

with **IDF(t) = ln(1 + (N − n + 0.5) / (n + 0.5))** (Lucene), where N = number of docs and n = docs containing t.

**The two knobs**
- **k1 (≈ 1.2–2.0, Lucene 1.2): tf saturation.** The first occurrence matters most; the tenth adds little. With k1 = 1.2 and an average-length doc, the tf factor is 1.0 for tf = 1, 1.57 for tf = 3, 1.96 for tf = 10, approaching a cap of 2.2. Keyword stuffing stops paying.
- **b (0–1, default 0.75): length normalisation.** Long documents naturally contain more terms, so their tf is discounted. b = 0 disables normalisation; b = 1 normalises fully.

**When to tune:** short, uniform chunks (RAG) often do well with lower b (0.3–0.5); very repetitive technical docs may want lower k1. Tune on a labelled set, never by feel.

**When to use it:** the baseline lexical retriever and the sparse half of hybrid search. It remains a strong zero-shot baseline across domains.`,
      example: `Query "refund damaged". N = 1,000 chunks, avgdl = 100, k1 = 1.2, b = 0.75.
IDF(refund), n = 50: ln(1 + 950.5/50.5) = **2.987**. IDF(damaged), n = 10: ln(1 + 990.5/10.5) = **4.557**.

**Doc A** (80 words, refund×3, damaged×1): length factor 1 − 0.75 + 0.75·0.8 = 0.85, so k1·0.85 = 1.02.
- refund: 2.987 × (3·2.2)/(3 + 1.02) = 2.987 × 1.642 = **4.90**
- damaged: 4.557 × 2.2/2.02 = **4.96** → total **9.87**

**Doc B** (200 words, refund×6, damaged×0): length factor 1.75, so k1·1.75 = 2.1.
- refund: 2.987 × 13.2/8.1 = **4.87** → total **4.87**

A wins clearly: it covers the rare term, and B's six "refund"s saturate and are discounted for length.`,
      diagram: `tf factor = tf·(k1+1) / (tf + k1)   (avg-length doc, k1 = 1.2)

 2.2 ┤- - - - - - - - - - - - - - - - - - -  cap = k1 + 1
 2.0 ┤                    ●─────────●
 1.8 ┤             ●
 1.6 ┤       ●                         saturation: extra repeats
 1.4 ┤    ●                            of a term add little
 1.0 ┤ ●
     └─┬──┬──┬─────┬──────┬─────────┬──► tf
       1  2  3     5     10        20
 length: K = k1·(1 − b + b·dl/avgdl)  → longer doc ⇒ bigger K ⇒ smaller score`,
      code: [
        {
          language: 'typescript',
          title: 'BM25 from scratch (Lucene-style IDF)',
          code: `type Doc = { id: string; tokens: string[] };

export function bm25Index(docs: Doc[], k1 = 1.2, b = 0.75) {
  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.tokens.length, 0) / N;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);

  // rare terms get a high IDF; never negative thanks to the 1 + ... form
  const idf = (t: string) => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };

  return function score(query: string[], d: Doc): number {
    const K = k1 * (1 - b + (b * d.tokens.length) / avgdl); // length normalisation
    let s = 0;
    for (const t of new Set(query)) {
      const tf = d.tokens.filter((x) => x === t).length;
      if (tf === 0) continue;
      s += idf(t) * (tf * (k1 + 1)) / (tf + K); // saturating tf
    }
    return s;
  };
}

// const score = bm25Index(docs); docs.map(d => [d.id, score(['refund','damaged'], d)])`,
        },
      ],
      prosCons: {
        pros: [
          'Strong, robust baseline with no training; often beats untuned dense models out of domain.',
          'Two interpretable parameters (k1, b).',
          'Fast on inverted indexes; supported natively by Lucene-based engines and SQLite FTS5.',
        ],
        cons: [
          {
            con: 'Pure lexical matching: zero score for synonyms and paraphrases.',
            fix: 'Combine with dense or learned-sparse retrieval (hybrid), or expand queries with synonyms or LLM-generated terms.',
          },
          {
            con: 'IDF and avgdl are corpus statistics; per-shard or per-tenant statistics can skew scores.',
            fix: 'Use global statistics (Elasticsearch dfs_query_then_fetch) or keep tenants in separate, adequately sized indexes.',
          },
          {
            con: 'Default k1/b may not fit short RAG chunks.',
            fix: 'Grid-search k1 ∈ [0.6, 2.0] and b ∈ [0.3, 0.9] on a labelled set and keep the best NDCG@10.',
          },
        ],
      },
      keyPoints: [
        'BM25 = IDF × saturating, length-normalised tf.',
        'k1 controls saturation (cap = k1 + 1); b controls length normalisation.',
        'Defaults: k1 = 1.2, b = 0.75; tune on labelled data.',
        'Rare query terms dominate the score through IDF.',
      ],
      exercise: {
        prompt: `Using \`bm25Index\` from the section, write \`compareB(docs, query)\` that returns the top doc id for **b = 0**, **b = 0.75** and **b = 1**.

Build a corpus where the answer changes: a **short** doc with "refund" once (10 tokens) and a **long** doc with "refund" three times (300 tokens), plus 8 filler docs without "refund" (100 tokens each). Show that with b = 0 the long doc wins, but with b = 0.75 the short doc wins.`,
        hints: [
          'Make filler docs with Array(100).fill("filler").',
          'With b = 0 the length term vanishes, so higher tf wins.',
          'avgdl ≈ (10 + 300 + 800) / 10 = 111.',
        ],
        solution: {
          language: 'typescript',
          code: `type Doc = { id: string; tokens: string[] };
declare function bm25Index(docs: Doc[], k1?: number, b?: number): (q: string[], d: Doc) => number;

const pad = (n: number) => Array(n).fill('filler');
const docs: Doc[] = [
  { id: 'short', tokens: ['refund', ...pad(9)] },                 // 10 tokens, tf = 1
  { id: 'long', tokens: ['refund', 'refund', 'refund', ...pad(297)] }, // 300 tokens, tf = 3
  ...Array.from({ length: 8 }, (_, i) => ({ id: 'f' + i, tokens: pad(100) })),
];

export function compareB(ds: Doc[], query: string[]) {
  return [0, 0.75, 1].map((b) => {
    const score = bm25Index(ds, 1.2, b);
    const top = [...ds].sort((x, y) => score(query, y) - score(query, x))[0];
    return { b, top: top.id, score: score(query, top).toFixed(3) };
  });
}

console.log(compareB(docs, ['refund']));
// b=0    -> long  (tf 3 beats tf 1 when length is ignored)
// b=0.75 -> short (the 300-token doc is heavily discounted)
// b=1    -> short`,
        },
        explanation:
          'With b = 0 the denominator is tf + k1 for every doc, so tf = 3 beats tf = 1. With b = 0.75, the long doc\'s K becomes 1.2 × (0.25 + 0.75 × 2.7) ≈ 2.73 and the short doc\'s ≈ 0.38, so one occurrence in a short doc outscores three in a long one: a concentrated mention is stronger evidence.',
      },
      quickCheck: {
        question: 'A spammy page repeats "cheap flights" 200 times. Why does BM25 not rank it far above a page mentioning it 3 times?',
        options: [
          'BM25 ignores term frequency entirely',
          'The tf component saturates towards k1 + 1, and length normalisation discounts long documents',
          'IDF becomes negative for repeated terms',
          'BM25 removes duplicate words before scoring',
        ],
        correct: 1,
        explanation:
          'tf·(k1+1)/(tf + K) approaches k1 + 1 as tf grows, so 200 repeats score only slightly more than a few, and the page\'s length increases K. IDF depends on document frequency, not repeats, and BM25 does use tf.',
      },
      source: 'Robertson and Zaragoza 2009 — The Probabilistic Relevance Framework: BM25 and Beyond; Lucene BM25Similarity',
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'Dense Retrieval — matching meaning with embeddings',
      body: `**Dense retrieval** turns queries and documents into vectors with an embedding model so that similar meanings land close together. It is like organising a library by topic rather than by title words: "laptop won't power on" sits next to "device fails to boot".

**How it works (bi-encoder):**
1. Offline, embed every chunk (e.g. \`text-embedding-3-small\`, 1536-d; \`bge-m3\`, 1024-d; \`all-MiniLM-L6-v2\`, 384-d) and store vectors in an ANN index (HNSW in pgvector, Qdrant and others).
2. Online, embed the query with the **same model** and fetch the nearest neighbours by cosine or dot product.

DPR (Karpukhin et al. 2020) showed trained dual encoders beat BM25 by 9–19 points in top-20 passage accuracy on open-domain QA. BEIR (Thakur et al. 2021) then showed many dense models **underperform BM25 out of domain**, which is why modern systems use strong general-purpose embedders and hybrid search.

**Strengths:** paraphrase, synonyms, cross-lingual matching, natural-language questions.
**Weaknesses:** exact identifiers ("SKU-88213"), rare names, negation, numbers, and new jargon the model never saw.

**Practical rules:** some models need prefixes ("query: " / "passage: " for E5) or instructions; normalise vectors for cosine; re-embed everything when you change models.

**When to use it:** conversational and question-style queries, multilingual corpora, and as the semantic half of hybrid search.`,
      example: `Query: "How do I get my money back for a broken blender?"

| Chunk | BM25 | Cosine (illustrative) |
|---|---|---|
| "Refunds for damaged items are issued within 30 days" | 0.0 (no shared terms after stopwords) | **0.58** |
| "Blender model X200 user manual: cleaning the jar" | **6.1** ("blender") | 0.41 |
| "Shipping times for kitchen appliances" | 0.0 | 0.33 |

Dense retrieval surfaces the refund policy at #1 despite zero word overlap. Now query "X200-B error E4": BM25 ranks the X200 manual first, while dense ranks a generic "blender troubleshooting" page above it, showing why you want both.`,
      diagram: `OFFLINE                                  ONLINE
chunks ─► [embedding model] ─► vectors    query ─► [same model] ─► q⃗
                                  │                                │
                                  ▼                                ▼
                          ┌──────────────┐   nearest neighbours  ┌──────┐
                          │ ANN index    │◄──────────────────────│ q⃗    │
                          │ (HNSW)       │   cosine / dot        └──────┘
                          └──────┬───────┘
                                 ▼
                     top-K chunks by similarity`,
      code: [
        {
          language: 'typescript',
          title: 'Dense retrieval with OpenAI embeddings and pgvector',
          code: `import OpenAI from 'openai';
import pg from 'pg';
import pgvector from 'pgvector/pg';

const openai = new OpenAI();
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small'; // 1536-d
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.on('connect', (client) => pgvector.registerTypes(client));

// Schema: CREATE TABLE chunks (id text primary key, body text, embedding vector(1536));
//         CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);

export async function denseSearch(query: string, k = 20) {
  const { data } = await openai.embeddings.create({ model: EMBED_MODEL, input: query });
  const qv = data[0].embedding; // same model as used for the chunks!

  const client = await pool.connect(); // SET is per-connection: run both on the same one
  try {
    await client.query('SET hnsw.ef_search = 100'); // recall/latency knob (default 40)
    const { rows } = await client.query(
      'SELECT id, body, 1 - (embedding <=> $1) AS cosine ' + // <=> is cosine distance
        'FROM chunks ORDER BY embedding <=> $1 LIMIT $2',
      [pgvector.toSql(qv), k],
    );
    return rows as { id: string; body: string; cosine: number }[];
  } finally {
    client.release();
  }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Matches meaning: synonyms, paraphrases and even other languages.',
          'Works well for natural-language questions with no keyword overlap.',
          'One vector per chunk; mature ANN indexes give millisecond search at scale.',
        ],
        cons: [
          {
            con: 'Misses exact identifiers, codes and rare names.',
            fix: 'Run BM25 in parallel (hybrid search) or add learned sparse vectors; route ID-looking queries to keyword search.',
          },
          {
            con: 'Out-of-domain jargon degrades quality (BEIR finding).',
            fix: 'Evaluate several embedders on your own golden set, add domain context to chunks (contextual retrieval), or fine-tune the embedder on in-domain pairs.',
          },
          {
            con: 'Changing the embedding model invalidates every stored vector.',
            fix: 'Store the model id with each vector, re-embed into a new index and switch over with a dual-read or blue/green migration.',
          },
        ],
      },
      keyPoints: [
        'Bi-encoder: same model embeds queries and chunks into one space.',
        'Great for paraphrase; weak on exact IDs and numbers.',
        'BEIR: dense is not automatically better than BM25 out of domain.',
        'Respect model-specific prefixes and normalisation.',
      ],
      exercise: {
        prompt: `Write \`topKCosine(query, chunks, k, filter?)\` that does **exact** (brute-force) dense search in memory:

- \`chunks\` have \`{ id, vector, meta }\`; vectors may **not** be normalised;
- apply the optional \`filter(meta)\` **before** scoring;
- return the top-k as \`{ id, score }\` with cosine similarity, highest first.

Use it as a ground-truth checker for ANN recall later.`,
        starter: {
          language: 'typescript',
          code: `type Chunk = { id: string; vector: number[]; meta: Record<string, unknown> };

export function topKCosine(
  query: number[],
  chunks: Chunk[],
  k: number,
  filter?: (m: Chunk['meta']) => boolean,
) {
  // TODO: normalise, filter, score, partial sort
  return [] as { id: string; score: number }[];
}`,
        },
        hints: [
          'cos(a, b) = a·b / (|a||b|); precompute |query| once.',
          'Guard against zero-length vectors (return score 0).',
          'For small corpora a full sort is fine; for large ones keep a min-heap of size k.',
        ],
        solution: {
          language: 'typescript',
          code: `type Chunk = { id: string; vector: number[]; meta: Record<string, unknown> };

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a: number[]) => Math.sqrt(dot(a, a));

export function topKCosine(
  query: number[],
  chunks: Chunk[],
  k: number,
  filter?: (m: Chunk['meta']) => boolean,
) {
  const qn = norm(query) || 1;
  return chunks
    .filter((c) => !filter || filter(c.meta)) // pre-filter: never lose filtered recall
    .map((c) => {
      const cn = norm(c.vector);
      return { id: c.id, score: cn ? dot(query, c.vector) / (qn * cn) : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}`,
        },
        explanation:
          'Brute-force search is exact, so it is the reference for measuring ANN recall (recall@10 = overlap between ANN and exact top-10). Filtering before scoring guarantees you get k results that satisfy the filter, the behaviour you want from a vector DB\'s filtered search.',
      },
      quickCheck: {
        question: 'Users search for "PO-2024-118833" (a purchase-order number) and dense retrieval returns other purchase orders. Why?',
        options: [
          'The HNSW index is corrupted',
          'Embeddings capture the general meaning ("a purchase order") rather than the exact digit string',
          'Cosine similarity cannot compare numbers',
          'The query must be longer than 10 tokens',
        ],
        correct: 1,
        explanation:
          'Embedding models compress text into semantic features; similar-looking IDs map to nearby vectors, so the exact match is not guaranteed to rank first. Exact identifiers are a job for keyword or BM25 search (or a metadata filter).',
      },
      source: 'Karpukhin et al. 2020 — DPR; Thakur et al. 2021 — BEIR',
    },
    // ---------------------------------------------------------------- 5
    {
      heading: 'Sparse Retrieval — from BM25 to learned sparse vectors (SPLADE)',
      body: `A **sparse vector** has one dimension per vocabulary term (~30K) but only a handful are non-zero, like a shopping list that names only what you need from a huge catalogue. BM25 is a sparse retriever whose weights are *counted*. **Learned sparse** retrievers have weights *predicted* by a transformer.

**SPLADE** (Formal et al. 2021) runs text through a BERT masked-language-model head, then computes for each vocabulary term w = max over tokens of log(1 + ReLU(logit)). Two things happen:
- **Re-weighting:** important terms get higher weights than plain tf would give.
- **Expansion:** related terms that never appear in the text get weight ("refund" → "reimbursement", "return", "money").

A FLOPS regulariser keeps vectors sparse (typically 100–300 non-zero terms per passage), so they still live in an **inverted index** and score by dot product.

| | BM25 | Learned sparse (SPLADE, bge-m3 sparse, Elastic ELSER) | Dense |
|---|---|---|---|
| Weights | counted | learned | learned |
| Synonyms | no | partly (expansion) | yes |
| Exact terms | yes | yes | weak |
| Index | inverted | inverted (larger) | ANN |
| Explainable | yes | yes (terms) | no |

**When to use it:** you want semantic recall with keyword-level precision and explainability, or a better sparse half for hybrid search. Supported by Qdrant and Milvus sparse vectors, Elasticsearch/OpenSearch, Pinecone and Vespa.`,
      example: `Illustrative SPLADE output (the shape you get from naver/splade-cocondenser-ensembledistil) for the passage "Refunds for damaged items are issued within 30 days" (top weights):

\`refund 2.41, damaged 2.18, 30 1.55, days 1.32, issued 0.97, **return 0.88**, **damage 0.84**, **money 0.41**, **reimbursement 0.37**\`, …(about 80 non-zero terms)

Query "can I get reimbursed for a broken toaster" expands to \`reimbursement 1.6, broken 1.9, damaged 0.7, refund 0.6, toaster 2.3…\`. The dot product over shared terms (reimbursement, damaged, refund) gives 1.6×0.37 + 0.7×2.18 + 0.6×2.41 ≈ **3.6**, so the passage is retrieved even though "reimbursed" and "broken" never appear in it. BM25 scored it **0**.`,
      diagram: `text ─► BERT MLM head ─► logits [seq_len × 30,522 vocab]
                               │  log(1 + ReLU(x)), max over tokens
                               ▼
        sparse vector:  {refund: 2.4, damaged: 2.2, return: 0.9, ...}
                               │  ~100–300 non-zeros (FLOPS regulariser)
                               ▼
                 inverted index   term → [(doc, weight), ...]
                               │
        query sparse vector ───┴──► score = Σ q_w · d_w over shared terms`,
      code: [
        {
          language: 'python',
          title: 'Compute SPLADE sparse vectors with transformers',
          code: `# pip install transformers torch
import torch
from transformers import AutoTokenizer, AutoModelForMaskedLM

NAME = "naver/splade-cocondenser-ensembledistil"
tok = AutoTokenizer.from_pretrained(NAME)
model = AutoModelForMaskedLM.from_pretrained(NAME).eval()

def splade(text: str) -> dict[str, float]:
    enc = tok(text, return_tensors="pt", truncation=True, max_length=256)
    with torch.no_grad():
        logits = model(**enc).logits                       # [1, seq, vocab]
    weights = torch.log1p(torch.relu(logits))              # positive, dampened
    weights = weights * enc["attention_mask"].unsqueeze(-1)  # ignore padding
    vec = weights.max(dim=1).values.squeeze(0)             # max-pool over tokens
    idx = vec.nonzero().squeeze(1)
    return {tok.convert_ids_to_tokens(int(i)): round(float(vec[i]), 2) for i in idx}

def score(q: dict[str, float], d: dict[str, float]) -> float:
    return sum(w * d[t] for t, w in q.items() if t in d)   # sparse dot product

doc = splade("Refunds for damaged items are issued within 30 days")
qry = splade("can I get reimbursed for a broken toaster")
print(len(doc), sorted(doc.items(), key=lambda x: -x[1])[:10])
print(round(score(qry, doc), 2))`,
        },
      ],
      prosCons: {
        pros: [
          'Vocabulary expansion fixes many synonym misses of BM25.',
          'Keeps exact-term precision and term-level explainability.',
          'Served from inverted indexes; often a stronger sparse half for hybrid than BM25.',
        ],
        cons: [
          {
            con: 'Needs model inference at index and query time (GPU helps), unlike BM25.',
            fix: 'Use inference-free or efficient variants (SPLADE-doc / efficient SPLADE, OpenSearch neural sparse doc-only mode) that expand only documents offline.',
          },
          {
            con: 'Indexes are larger and slower than BM25 because of expansion terms.',
            fix: 'Prune low weights (e.g. keep top 128–256 terms per doc) and tune the FLOPS regularisation strength.',
          },
          {
            con: 'English-trained SPLADE models do poorly in other languages.',
            fix: 'Use a multilingual learned sparse model such as bge-m3\'s sparse output, or fall back to language-specific BM25 analysers.',
          },
        ],
      },
      keyPoints: [
        'Sparse = weights over vocabulary terms, mostly zeros, served by inverted index.',
        'BM25 weights are counted; SPLADE weights are learned and include expansions.',
        'Score = dot product over shared terms.',
        'Learned sparse sits between BM25 and dense: semantic-ish and explainable.',
      ],
      exercise: {
        prompt: `Implement in TypeScript a minimal **sparse vector index**:

- \`add(id, vec: Record<string, number>)\` stores a doc into an inverted index (term → [docId, weight][]);
- \`search(query: Record<string, number>, k)\` returns top-k \`{ id, score }\` by dot product, reading **only** the posting lists of query terms;
- \`prune(vec, maxTerms)\` keeps only the highest-weight \`maxTerms\` entries (use it in \`add\`).`,
        hints: [
          'Use Map<string, Array<[string, number]>> for postings.',
          'Accumulate scores in a Map<docId, number> while walking posting lists.',
          'prune: Object.entries, sort by weight desc, slice, Object.fromEntries.',
        ],
        solution: {
          language: 'typescript',
          code: `type Sparse = Record<string, number>;

export const prune = (vec: Sparse, maxTerms: number): Sparse =>
  Object.fromEntries(Object.entries(vec).sort((a, b) => b[1] - a[1]).slice(0, maxTerms));

export class SparseIndex {
  private postings = new Map<string, Array<[string, number]>>();

  add(id: string, vec: Sparse, maxTerms = 256) {
    for (const [term, w] of Object.entries(prune(vec, maxTerms))) {
      if (!this.postings.has(term)) this.postings.set(term, []);
      this.postings.get(term)!.push([id, w]);
    }
  }

  search(query: Sparse, k = 10) {
    const acc = new Map<string, number>();
    for (const [term, qw] of Object.entries(query)) {
      for (const [id, dw] of this.postings.get(term) ?? []) {
        acc.set(id, (acc.get(id) ?? 0) + qw * dw); // dot product over shared terms
      }
    }
    return [...acc].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score).slice(0, k);
  }
}`,
        },
        explanation:
          'This is exactly how engines serve SPLADE and BM25: score accumulation over the posting lists of query terms. Pruning bounds index size and query cost, the main operational knob for learned sparse retrieval.',
      },
      quickCheck: {
        question: 'Why can SPLADE retrieve a passage that shares no literal words with the query?',
        options: [
          'It converts both texts to dense vectors and uses cosine similarity',
          'Its MLM head assigns weight to related vocabulary terms (expansion), so query and passage overlap on expanded terms',
          'It ignores the query and returns popular passages',
          'It uses character n-grams to match misspellings',
        ],
        correct: 1,
        explanation:
          'SPLADE predicts weights over the whole vocabulary, including terms not present in the text. Shared expansion terms create a non-zero dot product. It remains sparse (not dense cosine) and is not n-gram based.',
      },
      source: 'Formal et al. 2021 — SPLADE (SIGIR) and SPLADE v2',
    },
    // ---------------------------------------------------------------- 6
    {
      heading: 'Hybrid Search — lexical and semantic, together',
      body: `**Hybrid search** runs a lexical retriever (BM25 or learned sparse) and a dense retriever in parallel and merges their results. It is like asking both a proof-reader who checks exact words and a subject expert who understands meaning: each catches what the other misses.

**Pipeline**
1. Run BM25 (top 50) and dense (top 50) **in parallel**.
2. **Fuse** the two lists. The robust default is Reciprocal Rank Fusion (Σ 1/(60 + rank)); the next-but-one topic, *Reranking and Result Fusion*, covers RRF and score fusion in depth.
3. **Rerank** the fused top 50–100 with a cross-encoder and send the top 5–20 to the LLM.

**Why it works:** failure modes are complementary. BM25 nails "E1043", "SKU-88213" and names; dense nails "my money back for a broken blender". Anthropic's Contextual Retrieval study reported that adding BM25 to contextual embeddings cut top-20 retrieval failures from 3.7% to 2.9%.

**Where to run it:**

| Option | How |
|---|---|
| Qdrant / Milvus / Weaviate / Elasticsearch | native hybrid queries with built-in fusion |
| Postgres | tsvector or pg_search + pgvector, fused in SQL or app code |
| App-level | two clients + your own RRF |

**When to use it:** by default for production RAG over mixed content (docs with codes, names and prose). Pure dense is fine only for purely conversational corpora with no identifiers.`,
      example: `Illustrative internal benchmark: golden set of 300 support questions (40% contain an error code or product ID), recall@20:

| Retriever | ID-style queries | Natural-language queries | Overall |
|---|---|---|---|
| BM25 only | **94%** | 71% | 80% |
| Dense only | 68% | **89%** | 81% |
| Hybrid (RRF) | 93% | 88% | **90%** |
| Hybrid + rerank (recall@5) | — | — | 86% @5 vs 72% @5 dense-only |

Hybrid loses at most a point on each slice but wins overall by about 9–10 points. Latency rose from 35 ms to 48 ms because the two searches run in parallel.`,
      diagram: `                ┌──► BM25 / sparse (top 50) ──┐
 query ─────────┤                              ├──► fuse (RRF k=60) ─► top 100
   │ embed      └──► dense ANN   (top 50) ──┘                │
   └────────────────────────▲                                ▼
                                               cross-encoder rerank
                                                             │
                                                   top 5–20 ─► LLM`,
      code: [
        {
          language: 'typescript',
          title: 'Hybrid query in Qdrant (dense + sparse prefetch, RRF fusion)',
          code: `import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });

// Collection created with named vectors:
//   vectors: { dense: { size: 1536, distance: 'Cosine' } }
//   sparse_vectors: { sparse: { modifier: 'idf' } }   // IDF applied server-side (BM25-like)

declare function embed(text: string): Promise<number[]>;
declare function sparseEncode(text: string): Promise<{ indices: number[]; values: number[] }>;

export async function hybridSearch(query: string, limit = 10) {
  const [dense, sparse] = await Promise.all([embed(query), sparseEncode(query)]);
  const res = await qdrant.query('docs', {
    prefetch: [
      { query: dense, using: 'dense', limit: 50 },   // semantic candidates
      { query: sparse, using: 'sparse', limit: 50 }, // lexical candidates
    ],
    query: { fusion: 'rrf' }, // reciprocal rank fusion of the two prefetches
    limit,
    with_payload: true,
  });
  return res.points.map((p) => ({ id: p.id, score: p.score, text: p.payload?.text }));
}`,
        },
      ],
      prosCons: {
        pros: [
          'Robust across query types: identifiers and paraphrases both work.',
          'Typically several points higher recall than either retriever alone.',
          'Parallel execution keeps the added latency small.',
        ],
        cons: [
          {
            con: 'Two indexes to build, keep in sync and pay for.',
            fix: 'Use an engine with native hybrid support (Qdrant, Weaviate, Elasticsearch, Milvus) so one upsert writes both representations.',
          },
          {
            con: 'Naively adding raw BM25 and cosine scores lets one dominate.',
            fix: 'Fuse with RRF (rank-based) or normalise scores before a weighted combination.',
          },
          {
            con: 'Fusion alone does not fix ordering inside the top 10.',
            fix: 'Add a cross-encoder reranker over the fused top 50–100.',
          },
        ],
      },
      keyPoints: [
        'Run lexical and dense in parallel, fuse, then rerank.',
        'Complementary failure modes are the whole reason it works.',
        'RRF (k = 60) is the safe default fusion.',
        'Measure per-slice recall (ID queries vs natural language).',
      ],
      exercise: {
        prompt: `Write \`hybrid(query)\` in TypeScript given two async retrievers \`bm25(q, k)\` and \`dense(q, k)\` that each return \`{ id, text }[]\` best first.

- Call both **in parallel** with k = 50.
- Fuse with RRF (k = 60), deduplicating by id.
- If either retriever throws, **degrade gracefully** to the other one's results instead of failing.
- Return the top 10 with their fused scores.`,
        starter: {
          language: 'typescript',
          code: `type Hit = { id: string; text: string };
declare function bm25(q: string, k: number): Promise<Hit[]>;
declare function dense(q: string, k: number): Promise<Hit[]>;

export async function hybrid(query: string) {
  // TODO: parallel calls with graceful degradation, RRF fusion, top 10
}`,
        },
        hints: [
          'Promise.allSettled lets you inspect each result independently.',
          'Treat a rejected promise as an empty list, but throw if both fail.',
          'RRF contribution for 0-based index i is 1 / (60 + i + 1).',
        ],
        solution: {
          language: 'typescript',
          code: `type Hit = { id: string; text: string };
declare function bm25(q: string, k: number): Promise<Hit[]>;
declare function dense(q: string, k: number): Promise<Hit[]>;

export async function hybrid(query: string) {
  const settled = await Promise.allSettled([bm25(query, 50), dense(query, 50)]);
  const lists = settled.map((s) => (s.status === 'fulfilled' ? s.value : []));
  if (settled.every((s) => s.status === 'rejected')) throw new Error('both retrievers failed');

  const fused = new Map<string, { hit: Hit; score: number }>();
  for (const list of lists) {
    list.forEach((hit, i) => {
      const prev = fused.get(hit.id);
      fused.set(hit.id, { hit, score: (prev?.score ?? 0) + 1 / (60 + i + 1) });
    });
  }
  return [...fused.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ hit, score }) => ({ ...hit, score }));
}`,
        },
        explanation:
          'allSettled turns one retriever outage into a quality degradation rather than an error, which matters because BM25 and vector stores are often separate services. Deduplication by id plus rank-based fusion avoids the raw-score scale trap.',
      },
      quickCheck: {
        question: 'Which query most benefits from adding BM25 to an existing dense retriever?',
        options: [
          '"How can I make my laptop battery last longer?"',
          '"What does error 0x80070643 mean during Windows Update?"',
          '"Explain the difference between leasing and buying a car"',
          '"Tips for writing a polite follow-up email"',
        ],
        correct: 1,
        explanation:
          'The exact error code is a rare, high-IDF token that BM25 matches precisely while embeddings blur it with similar codes. The other queries are natural-language questions where dense retrieval already does well.',
      },
      source: 'Qdrant docs — Hybrid queries; Anthropic 2024 — Contextual Retrieval (embeddings + BM25)',
    },
  ],
  codeChallenges: [
    {
      id: 'retrieval-fundamentals-cc-1',
      title: 'Keyword search that misses half the corpus',
      context:
        'A support bot uses SQL LIKE for "keyword search". Searches for "Refunds" miss documents saying "refund", queries take 2 s on 3M rows, error codes like "E-1043" match "E-10430", and user input is concatenated into SQL.',
      task: 'Replace it with proper full-text search: an analysed tsvector with a GIN index, parameterised websearch queries, ranking, and an exact-match path for identifiers.',
      starter: {
        language: 'typescript',
        code: `import pg from 'pg';
const pool = new pg.Pool();

export async function keywordSearch(q: string) {
  const sql = "SELECT id, body FROM chunks WHERE body LIKE '%" + q + "%' LIMIT 20";
  const { rows } = await pool.query(sql);
  return rows;
}`,
      },
      hints: [
        'Add a generated tsvector column with to_tsvector(\'english\', body) and a GIN index.',
        'Use websearch_to_tsquery with a $1 parameter and rank with ts_rank_cd.',
        'Detect ID-shaped queries with a regex and match them against a dedicated identifiers column with word boundaries.',
      ],
      solution: {
        language: 'typescript',
        code: `import pg from 'pg';
const pool = new pg.Pool();

// Migration (run once):
//   ALTER TABLE chunks ADD COLUMN tsv tsvector
//     GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED;
//   CREATE INDEX chunks_tsv_idx ON chunks USING GIN (tsv);
//   -- identifiers extracted at ingestion, e.g. {E-1043, SKU-88213}
//   ALTER TABLE chunks ADD COLUMN ids text[];
//   CREATE INDEX chunks_ids_idx ON chunks USING GIN (ids);

const ID_PATTERN = /^[A-Z]{1,5}-?\\d{2,}$/i; // E-1043, SKU88213, PO-118833

export async function keywordSearch(q: string, limit = 20) {
  const query = q.trim().slice(0, 500); // bound input size
  if (!query) return [];

  if (ID_PATTERN.test(query)) {
    // exact identifier path: array containment, no stemming, no prefix matches
    const { rows } = await pool.query(
      'SELECT id, body, 1.0 AS rank FROM chunks WHERE ids @> ARRAY[upper($1)] LIMIT $2',
      [query, limit],
    );
    if (rows.length) return rows;
  }

  const { rows } = await pool.query(
    'SELECT id, body, ts_rank_cd(tsv, q) AS rank ' +
      "FROM chunks, websearch_to_tsquery('english', $1) q " +
      'WHERE tsv @@ q ORDER BY rank DESC LIMIT $2',
    [query, limit], // parameterised: no SQL injection
  );
  return rows;
}`,
      },
      explanation:
        'LIKE with a leading wildcard cannot use a B-tree index, so it scans all 3M rows; it does no stemming, so "Refunds" misses "refund"; and substring matching makes E-1043 match E-10430. The fix analyses text once into a tsvector with a GIN inverted index, ranks results, parameterises input (closing the SQL injection hole), and routes identifier-shaped queries to an exact-match column.',
      followUps: [
        {
          q: 'ts_rank_cd is not BM25. When would you switch engines?',
          a: 'When ranking quality matters at scale, or you want corpus-level IDF and tunable k1/b: move to Elasticsearch/OpenSearch, or use ParadeDB pg_search to keep BM25 inside Postgres. Validate the switch with NDCG@10 on a labelled set.',
        },
        {
          q: 'How would you support multiple languages?',
          a: 'Store a language column, build the tsvector with the matching text search configuration per row (or one column per language), and detect query language to pick the configuration; fall back to the simple configuration for unknown languages.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-cc-2',
      title: 'Dense retrieval with silent model mismatches',
      context:
        'A team indexed 2M chunks with bge-base-en-v1.5 (768-d) and later switched query embedding to text-embedding-3-small to "improve quality". Errors were caught and swallowed, so the endpoint returns random-looking results. They also never normalise vectors and embed queries one at a time inside a loop for multi-query search.',
      task: 'Make dense retrieval safe: pin and verify the embedding model and dimension, normalise vectors, batch embeddings, and fail loudly on mismatches.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();
declare function annSearch(v: number[], k: number): Promise<{ id: string; score: number }[]>;

export async function multiDense(queries: string[]) {
  const out = [];
  for (const q of queries) {
    try {
      const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: q });
      out.push(...(await annSearch(r.data[0].embedding, 10)));
    } catch {}
  }
  return out;
}`,
      },
      hints: [
        'Store the index model id and dimension in config or index metadata, and check them at startup.',
        'Call the embeddings API once with input: string[] and map results by index.',
        'L2-normalise vectors if the index uses inner product, and do not swallow errors.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();

declare function annSearch(v: number[], k: number): Promise<{ id: string; score: number }[]>;
declare function getIndexMeta(): Promise<{ model: string; dim: number }>; // written at indexing time

const EMBED_MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small';
const EXPECTED_DIM = Number(process.env.EMBED_DIM ?? 1536);

const l2 = (v: number[]) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

export async function assertIndexCompatible() {
  const meta = await getIndexMeta();
  if (meta.model !== EMBED_MODEL || meta.dim !== EXPECTED_DIM) {
    // vectors from different models live in different spaces: never mix them
    throw new Error('Embedding mismatch: index=' + meta.model + '/' + meta.dim + ' query=' + EMBED_MODEL + '/' + EXPECTED_DIM);
  }
}

export async function multiDense(queries: string[], k = 10) {
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: queries }); // one batched call
  const vectors = res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (vectors.some((v) => v.length !== EXPECTED_DIM)) throw new Error('unexpected embedding dimension');

  const lists = await Promise.all(vectors.map((v) => annSearch(l2(v), k))); // parallel searches
  const best = new Map<string, number>();
  for (const list of lists) for (const h of list) best.set(h.id, Math.max(best.get(h.id) ?? -Infinity, h.score));
  return [...best].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}`,
      },
      explanation:
        'Vectors from different embedding models are not comparable even when dimensions happen to match, so the model must be pinned and checked against index metadata at startup. Swallowed errors hid the failure; now mismatches fail fast. Batching cuts N API calls to one, normalisation keeps inner-product scores equal to cosine, and deduplication by id with max score merges the multi-query lists.',
      followUps: [
        {
          q: 'How do you migrate 2M chunks to a new embedding model without downtime?',
          a: 'Embed into a new collection in the background (batched, rate-limited), dual-write new documents to both, evaluate recall@K on the golden set, then flip reads with a feature flag and keep the old index for rollback until the new one is proven.',
        },
        {
          q: 'Is max-score the right way to merge the lists?',
          a: 'It is simple, but cosine scores from different queries are not perfectly comparable. RRF across the per-query lists is usually more robust, and a reranker over the merged candidates fixes the final order anyway.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'retrieval-fundamentals-iq-1',
      difficulty: 'medium',
      question: 'Walk me through BM25: what each part of the formula does, and how you would tune it for a RAG corpus of 300-token chunks.',
      whatInterviewerLooksFor: [
        'Correct formula with IDF, tf saturation (k1) and length normalisation (b)',
        'Intuition for why saturation and normalisation exist',
        'Knows default values and that short uniform chunks change the picture',
        'Tunes with a labelled set and a ranking metric',
      ],
      modelAnswer: `**Formula:** score = Σₜ IDF(t) · tf·(k1+1) / (tf + k1·(1 − b + b·dl/avgdl)), with IDF(t) = ln(1 + (N − n + 0.5)/(n + 0.5)).

**Parts**
- **IDF:** rare terms carry more evidence. A term in 10 of 1,000 docs gets ~4.6, one in 500 docs ~0.7.
- **tf saturation (k1):** the tf factor rises quickly then flattens towards k1 + 1. k1 = 1.2 means three occurrences already give ~70% of the maximum, so keyword stuffing does not pay.
- **Length normalisation (b):** long documents contain more words by chance; b = 0.75 discounts tf in proportion to dl/avgdl. b = 0 turns it off.

**Tuning for 300-token chunks**
- Chunks are short and similar in length, so dl/avgdl ≈ 1 and **b matters less**; a lower b (0.3–0.5) often helps when some chunks are tables or short headers.
- Grid-search k1 ∈ {0.6, 0.9, 1.2, 1.5, 2.0} × b ∈ {0.3, 0.5, 0.75, 0.9} on 200–500 labelled queries, optimising NDCG@10 or recall@50 (if a reranker follows).
- Also tune the analyser (stemming, identifier tokenisation): it often matters more than k1/b.
- Prepend titles or section headers to chunks (or add a weighted title field) so short chunks carry context terms.`,
      followUps: [
        {
          q: 'Why does Lucene use ln(1 + …) for IDF?',
          a: 'The classic Robertson–Spärck Jones IDF, ln((N − n + 0.5)/(n + 0.5)), goes negative for terms in more than half of the documents, which would penalise matches. Adding 1 inside the log keeps IDF positive.',
        },
        {
          q: 'What changes in a multi-tenant index?',
          a: 'IDF and avgdl are computed over the shared index or shard, so a large tenant\'s vocabulary skews scores for small tenants. Use per-tenant indexes for big tenants, or global term statistics, and filter by tenant.',
        },
      ],
      pitfalls: [
        'Describing BM25 as "TF-IDF with a different name"',
        'Tuning k1/b by eye without a labelled set',
        'Ignoring the analyser, which often matters more than k1/b',
      ],
    },
    {
      id: 'retrieval-fundamentals-iq-2',
      difficulty: 'hard',
      question:
        'Your RAG over internal engineering docs uses dense retrieval only. Engineers complain that searches for ticket IDs, function names and error codes fail. Diagnose and fix.',
      whatInterviewerLooksFor: [
        'Explains why embeddings blur exact identifiers',
        'Proposes hybrid search with BM25 or learned sparse',
        'Considers analyser and tokenisation for code identifiers',
        'Adds query routing or metadata extraction and an evaluation slice',
      ],
      modelAnswer: `**Diagnosis**
- Embedding models map text to semantic features; "JIRA-4412" and "JIRA-4421" land almost on top of each other, and \`getUserById\` sits near any user-lookup prose. Exact identity is not what dense vectors encode.
- Tokenisers split identifiers into sub-word pieces, further diluting them.

**Fix**
1. **Hybrid retrieval:** add BM25 (or SPLADE) in parallel with dense and fuse with RRF. Identifiers are rare, high-IDF tokens, so BM25 ranks exact matches first.
2. **Identifier-aware analysis:** a custom tokenizer or sub-field that keeps \`JIRA-4412\`, \`getUserById\` and \`0x80070643\` intact, plus camelCase/snake_case splitting for partial matches.
3. **Extract identifiers at ingestion** into metadata (ticket ids, function names) and match ID-shaped queries with an exact filter or boost.
4. **Rerank** the fused candidates with a cross-encoder.

**Evaluation**
- Build a golden set with an **ID slice** (exact lookups) and a **natural-language slice**.
- Track recall@20 per slice: expect the ID slice to jump from ~60–70% to 90%+ with little or no regression on natural-language queries.
- Monitor zero-result and low-confidence queries in production.`,
      followUps: [
        {
          q: 'Would fine-tuning the embedding model fix this instead?',
          a: 'Partly at best. Fine-tuning can sharpen domain semantics, but dense vectors remain poor at exact string identity. Lexical matching is the cheaper, more reliable tool for identifiers; use both.',
        },
        {
          q: 'How would you route queries?',
          a: 'A regex or tiny classifier detects identifier-shaped tokens; if present, boost the lexical list (weighted RRF) or run an exact-match lookup first, while natural-language queries use equal weights.',
        },
      ],
      pitfalls: [
        'Increasing top-K for dense retrieval and hoping the ID shows up',
        'Using a default English analyser that splits identifiers',
        'No per-slice evaluation',
      ],
    },
    {
      id: 'retrieval-fundamentals-iq-3',
      difficulty: 'hard',
      question: 'Compare BM25, learned sparse (SPLADE) and dense retrieval. Which would you choose for a 50M-document multilingual e-commerce catalogue, and why?',
      context: 'Queries mix product names, SKUs, attributes ("red waterproof jacket size M") and natural-language intents; latency budget 100 ms p95.',
      whatInterviewerLooksFor: [
        'Accurate trade-offs: weights, index type, expansion, explainability, cost',
        'Considers multilingual needs and storage at 50M scale',
        'Proposes a hybrid architecture with metadata filters',
        'Mentions evaluation and latency budget allocation',
      ],
      modelAnswer: `**Comparison**

| | BM25 | SPLADE / learned sparse | Dense |
|---|---|---|---|
| Matching | exact terms | terms + learned expansion | semantics |
| SKUs, names | excellent | excellent | weak |
| Synonyms/paraphrase | none | partial | strong |
| Multilingual | per-language analysers | needs multilingual model (bge-m3 sparse) | multilingual embedders |
| Index | inverted, small | inverted, 2–4x larger | ANN; 50M × 1024-d fp32 ≈ 200 GB before compression |
| Inference | none | encoder at index + query | encoder at index + query |

**Choice for the catalogue: hybrid + structured filters**
1. **Structured attributes** (size, colour, category, price) extracted into fields and applied as filters; "red waterproof jacket size M" should mostly be a filter plus a short semantic query.
2. **BM25 with language-specific analysers** for names, brands and SKUs (plus an exact SKU path).
3. **Multilingual dense** (e.g. bge-m3 or a multilingual API model) with quantised vectors (int8 or binary + rescoring) to make 50M vectors affordable.
4. Optionally swap BM25 for bge-m3's sparse output to get one multilingual model producing both.
5. **RRF fusion → lightweight reranker** on the top 50 within the latency budget (retrieval ~30 ms in parallel, rerank ~40 ms).

**Validate** with per-language and per-query-type recall@50 and NDCG@10, plus online CTR and conversion.`,
      followUps: [
        {
          q: 'How would you cut dense storage at 50M vectors?',
          a: 'Use smaller dimensions (Matryoshka truncation to 256–512), int8 or binary quantisation with full-precision rescoring of the top candidates, and product quantisation in IVF-PQ for the coldest data.',
        },
        {
          q: 'Why not just SPLADE everywhere?',
          a: 'English SPLADE models are weak multilingually, inference adds cost at 50M documents, and the index is larger than BM25. A multilingual sparse model or BM25 per language may be cheaper with similar quality; measure.',
        },
      ],
      pitfalls: [
        'Treating attribute constraints as a semantic search problem',
        'Ignoring storage cost of dense vectors at scale',
        'Choosing one retriever without per-slice evaluation',
      ],
    },
    {
      id: 'retrieval-fundamentals-iq-4',
      difficulty: 'medium',
      question: 'A stakeholder says "embeddings understand meaning, so keyword search is obsolete." How do you respond, with evidence?',
      whatInterviewerLooksFor: [
        'Cites BEIR or similar evidence on BM25 strength out of domain',
        'Explains complementary failure modes with concrete examples',
        'Mentions that hybrid is standard in production (vector DBs ship it)',
        'Proposes measuring on the team\'s own data',
      ],
      modelAnswer: `**Short answer:** embeddings and keyword search fail in different places, so the strongest systems use both.

**Evidence**
- **BEIR (Thakur et al. 2021):** across 18 zero-shot datasets, BM25 remained a strong baseline that many dense retrievers trained on MS MARCO failed to beat out of domain.
- **Anthropic's Contextual Retrieval (2024):** adding BM25 to contextual embeddings further reduced top-20 retrieval failures (3.7% → 2.9%).
- Every major vector database (Qdrant, Weaviate, Milvus, Elasticsearch, Pinecone) now ships hybrid search because customers need it.

**Where keyword search wins:** exact identifiers (SKUs, error codes, ticket ids), names and rare jargon, new terms the embedder never saw, and explainability (you can show which words matched).

**Where embeddings win:** paraphrases, synonyms, natural-language questions, cross-lingual queries.

**Proposal:** run a two-week bake-off on our own golden set (300 queries, sliced by type): BM25, dense, hybrid and hybrid + rerank. Decide on recall@20, NDCG@10 and latency, not on intuition.`,
      followUps: [
        {
          q: 'What if the bake-off shows dense-only is as good as hybrid?',
          a: 'Then keep the simpler system but monitor slices, especially identifier queries and new jargon, and keep the option to add a lexical leg cheaply if those slices regress as content changes.',
        },
        {
          q: 'How would you build the golden set quickly?',
          a: 'Sample real queries from logs, label relevant chunks with an LLM plus human spot checks, and add synthetic questions generated from chunks for coverage, making sure to include ID-style and paraphrase-style queries.',
        },
      ],
      pitfalls: [
        'Arguing from opinion instead of benchmarks and own-data evaluation',
        'Dismissing dense retrieval entirely',
        'Forgetting explainability and exact-match requirements',
      ],
    },
    {
      id: 'retrieval-fundamentals-iq-5',
      difficulty: 'expert',
      question:
        'Design the retrieval layer for a RAG system over 20M chunks with a 120 ms p95 retrieval budget (before the LLM), supporting tenant isolation and fresh documents within 5 minutes.',
      whatInterviewerLooksFor: [
        'Hybrid architecture with parallel legs and fusion',
        'Latency budget split across embedding, search, fusion and rerank',
        'Tenant filtering strategy that does not wreck recall',
        'Incremental indexing for freshness and consistency between indexes',
        'Evaluation and monitoring plan',
      ],
      modelAnswer: `**Architecture**
- **Query path:** embed the query (self-hosted embedder ~10–15 ms, or an API ~50 ms) → in parallel: BM25 (Elasticsearch/OpenSearch, ~15 ms) and dense ANN (HNSW, ef_search tuned, ~10–20 ms) → RRF (k = 60) over 50 + 50 → cross-encoder rerank of top 50 on GPU (~40 ms) → top 8.
- **Budget (p95):** embed 20 + search 25 + fusion 2 + rerank 45 + network 15 ≈ **107 ms**.

**Tenant isolation**
- Every chunk carries \`tenant_id\`; both legs filter on it **inside** the search (pre-filtering), never after, to avoid empty results.
- Large tenants get dedicated shards or collections; small tenants share with payload-indexed filters (Qdrant payload index, Elasticsearch filter context). BM25 statistics per tenant shard avoid IDF skew.

**Freshness (< 5 min)**
- CDC or an event queue → ingestion workers (parse, chunk, embed in batches) → upsert into both indexes with the same chunk id and version.
- Elasticsearch refresh interval ~1 s; HNSW supports incremental inserts. Deletes are tombstoned in both.
- A reconciliation job compares chunk-id sets across the two indexes nightly.

**Quality and ops**
- Golden set per tenant tier; recall@50 and NDCG@10 in CI for any index or model change.
- Dashboards: per-leg latency, empty-result rate, rerank score distribution, index lag.
- Degrade gracefully: if one leg times out (60 ms), fuse what returned.`,
      followUps: [
        {
          q: 'What happens to HNSW recall with very selective tenant filters?',
          a: 'With pre-filtering, the graph traversal may struggle to find enough matching neighbours, lowering recall or raising latency. Mitigations: payload-aware indexes (Qdrant builds extra links for indexed payloads), per-tenant collections for large tenants, or brute-force search when the filtered set is small.',
        },
        {
          q: 'How do you keep the two indexes consistent?',
          a: 'Use one ingestion pipeline that writes both with the same chunk id and version, make writes idempotent, retry failures from a queue, and run a reconciliation job; the query path drops results whose version does not match the latest.',
        },
      ],
      pitfalls: [
        'Post-filtering by tenant after retrieving top-K',
        'Sequential instead of parallel retrieval legs',
        'No plan for keeping lexical and vector indexes in sync',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'retrieval-fundamentals-est-1',
      question:
        'Estimate storage for 10M chunks of ~300 tokens under three options: BM25 inverted index, dense vectors (1536-d float32 + HNSW), and SPLADE sparse vectors.',
      assumptions: [
        '~300 tokens ≈ 1,200 characters of text per chunk; raw text 10M × 1.2 KB = 12 GB',
        'Compressed BM25 inverted index ≈ 30–50% of raw text size (postings + positions)',
        'HNSW with M = 16 adds ~2 × M links × 4 bytes ≈ 128 bytes per vector (layer 0) plus overhead',
        'SPLADE: ~200 non-zero terms per chunk, 4-byte term id + 4-byte weight',
      ],
      steps: [
        { label: 'BM25 index', calc: '12 GB × 0.3–0.5 ≈ 4–6 GB' },
        { label: 'Dense vectors', calc: '10M × 1536 × 4 bytes = 61.4 GB' },
        { label: 'HNSW links', calc: '10M × ~150 bytes ≈ 1.5 GB → total ≈ 63 GB' },
        { label: 'SPLADE postings', calc: '10M × 200 × 8 bytes = 16 GB (≈ 3x BM25)' },
        { label: 'Dense with int8 quantisation', calc: '10M × 1536 × 1 byte ≈ 15 GB (+ originals on disk for rescoring)' },
      ],
      answer: 'BM25 ≈ 5 GB, SPLADE ≈ 16 GB, dense float32 + HNSW ≈ 63 GB (≈ 15 GB in RAM with int8 quantisation).',
      insight:
        'Dense vectors dominate memory, and HNSW wants them in RAM. Quantisation or smaller dimensions (Matryoshka 512-d) is usually required at this scale, while the lexical leg of hybrid search is comparatively cheap.',
      followUps: [
        {
          q: 'What if you truncate text-embedding-3-small to 512 dimensions?',
          a: '10M × 512 × 4 bytes ≈ 20 GB float32, or about 5 GB with int8: a 3x saving. Check recall@K on the golden set because shorter Matryoshka embeddings lose a little quality.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-est-2',
      question:
        'A hybrid search API serves 400 QPS at peak. Estimate the daily query-embedding cost via an API and the per-request latency of the retrieval path.',
      assumptions: [
        'Average 3x lower traffic off-peak: daily average ≈ 130 QPS',
        'Average query 15 tokens; illustrative embedding price $0.02 per 1M tokens',
        'Embedding API latency 40–80 ms; BM25 15 ms; HNSW 12 ms; RRF fusion 1 ms; network overhead 10 ms',
        'BM25 and dense search run in parallel after embedding (BM25 could start immediately)',
      ],
      steps: [
        { label: 'Queries/day', calc: '130 × 86,400 ≈ 11.2M queries/day' },
        { label: 'Tokens/day', calc: '11.2M × 15 ≈ 168M tokens' },
        { label: 'Embedding cost/day', calc: '168M × $0.02 / 1M ≈ $3.4/day (~$100/month)' },
        { label: 'Latency (dense leg)', calc: 'embed 60 + HNSW 12 = 72 ms' },
        { label: 'Latency (BM25 leg, started immediately)', calc: '15 ms, overlaps the dense leg' },
        { label: 'Total retrieval p50', calc: 'max(72, 15) + fusion 1 + network 10 ≈ 83 ms' },
      ],
      answer: 'About $3–4 per day for query embeddings; roughly 80–90 ms retrieval latency, dominated by the embedding API call.',
      insight:
        'Query embedding is cheap in dollars but expensive in latency. If the budget is tight, self-host a small embedder (10–15 ms on GPU) or cache embeddings for frequent queries; start the BM25 leg immediately so it overlaps the embedding call.',
      followUps: [
        {
          q: 'How much would an embedding cache with a 35% hit rate help?',
          a: 'It cuts embedding calls by 35% (cost becomes negligible either way) and, more importantly, removes ~60 ms from 35% of requests, lowering p50 latency noticeably; p95 is still bounded by misses.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'retrieval-fundamentals-mcq-01',
      difficulty: 'medium',
      question:
        'Using BM25 with k1 = 1.2 and b = 0.75, two documents have the same length and each contains the query term; one has tf = 2, the other tf = 20. Roughly how do their tf factors compare?',
      options: [
        'The tf = 20 document scores about 10x higher',
        'The tf = 20 document scores only about 1.5x higher because tf saturates',
        'Both score exactly the same',
        'The tf = 2 document scores higher because of length normalisation',
      ],
      correct: [1],
      explanation:
        'For an average-length document the factor is tf·2.2/(tf + 1.2): 1.375 for tf = 2 and 2.075 for tf = 20, about 1.5x. Saturation is the point of k1. Equal length means normalisation does not differentiate them, and linear scaling is TF-IDF behaviour.',
      followUps: [
        {
          q: 'What k1 value would make tf matter more?',
          a: 'A larger k1 (for example 2.0–3.0) delays saturation, so repeated occurrences keep adding score for longer; k1 = 0 makes tf irrelevant (binary matching).',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-02',
      difficulty: 'medium',
      question: 'Which query types typically favour lexical (BM25) retrieval over dense retrieval? Select ALL that apply.',
      options: [
        'Exact error codes such as "0x80070643"',
        'Product SKUs and order numbers',
        'Paraphrased questions with no words in common with the answer',
        'Rare personal or company names',
      ],
      correct: [0, 1, 3],
      explanation:
        'Codes, SKUs and rare names are high-IDF tokens that BM25 matches exactly, while embeddings blur them with similar strings. Paraphrased questions without shared words are exactly where dense retrieval wins and BM25 scores zero.',
      followUps: [
        {
          q: 'How can a single system handle both kinds well?',
          a: 'Hybrid search: run BM25 and dense in parallel, fuse with RRF, then rerank, optionally boosting the lexical leg when the query contains identifier-shaped tokens.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-03',
      difficulty: 'hard',
      question: 'This BM25 implementation ranks long documents too highly. What is the bug?',
      code: {
        language: 'typescript',
        code: `function termScore(tf: number, dl: number, avgdl: number, idf: number, k1 = 1.2, b = 0.75) {
  const K = k1 * (1 - b + b * (avgdl / dl));
  return idf * (tf * (k1 + 1)) / (tf + K);
}`,
      },
      options: [
        'IDF should be multiplied by k1',
        'The length ratio is inverted: it should be dl / avgdl, so longer documents get a larger K',
        'b should be added, not multiplied',
        'tf should be squared',
      ],
      correct: [1],
      explanation:
        'BM25 uses dl/avgdl so long documents increase K and lower the score. Using avgdl/dl gives long documents a smaller K, boosting them, the opposite of the intent. The other changes are not part of BM25.',
      followUps: [
        {
          q: 'What does setting b = 0 do in the correct formula?',
          a: 'It removes length normalisation: K becomes k1 for every document, so a long document with more occurrences is no longer discounted.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-04',
      difficulty: 'hard',
      question:
        'After switching query embeddings from model A to model B (same 768 dimensions) without re-indexing, retrieval quality collapses but no errors appear. Why?',
      options: [
        'HNSW indexes only accept normalised vectors',
        'Different models produce different vector spaces, so distances between B-queries and A-documents are meaningless',
        'Model B has a smaller context window',
        'Cosine similarity requires 1536 dimensions',
      ],
      correct: [1],
      explanation:
        'Equal dimensionality does not mean compatible spaces; each model learns its own geometry. Queries and documents must be embedded by the same model (and version). Normalisation, context window and dimension count are not the cause.',
      followUps: [
        {
          q: 'How do you prevent this in production?',
          a: 'Store the embedding model id and version in index metadata, assert compatibility at startup, and migrate models by re-embedding into a new index with a controlled cut-over.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-05',
      difficulty: 'hard',
      question: 'Which statements about SPLADE-style learned sparse retrieval are true? Select ALL that apply.',
      options: [
        'It can assign weight to terms that do not appear in the text',
        'Its vectors can be served from an inverted index',
        'It needs no neural inference at indexing time',
        'A sparsity regulariser keeps the number of non-zero terms manageable',
      ],
      correct: [0, 1, 3],
      explanation:
        'SPLADE expands text with related vocabulary terms, stays sparse thanks to a FLOPS regulariser, and is served by inverted indexes. It does require running a transformer to compute document weights at indexing time, unlike BM25.',
      followUps: [
        {
          q: 'Which variants reduce query-time inference cost?',
          a: 'Document-only (inference-free) learned sparse models expand documents offline and use simple tokenisation for queries, as in OpenSearch neural sparse doc-only mode or SPLADE-doc variants.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-06',
      difficulty: 'hard',
      question: 'What problem does this hybrid search code have?',
      code: {
        language: 'typescript',
        code: `const lexical = await bm25Search(q, 50);        // 15 ms
const vector = await denseSearch(await embed(q), 50); // 70 ms
const fused = rrf([lexical, vector]);
return fused.slice(0, 10);`,
      },
      options: [
        'RRF cannot fuse lists of equal length',
        'The two retrieval legs run sequentially, adding latency that parallel execution would avoid',
        'BM25 must always run after dense search',
        'slice(0, 10) returns the 10 worst results',
      ],
      correct: [1],
      explanation:
        'Awaiting BM25 before starting the embedding and dense search serialises the legs (~85 ms instead of ~70 ms). Use Promise.all so both run concurrently. RRF handles any list lengths, the order of legs is irrelevant, and the slice returns the top results.',
      followUps: [
        {
          q: 'How do you make it resilient as well as fast?',
          a: 'Use Promise.allSettled with per-leg timeouts, fuse whichever legs returned, and log degraded responses so you can alert if one leg fails often.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-07',
      difficulty: 'hard',
      question:
        'Your BM25 index uses the English stemmer at index time. Which changes would break matching for some queries? Select ALL that apply.',
      options: [
        'Applying no stemming to queries',
        'Applying a different language analyser to queries',
        'Lowercasing both documents and queries',
        'Removing stopwords from queries with a different stopword list than the index',
      ],
      correct: [0, 1, 3],
      explanation:
        'Query and index analysis must match. Unstemmed or differently analysed query tokens will not find stemmed posting lists, and mismatched stopword lists can drop or keep tokens inconsistently (hurting phrase queries). Consistent lowercasing on both sides is correct.',
      followUps: [
        {
          q: 'How do engines like Elasticsearch enforce consistency?',
          a: 'A field\'s analyser is used for both indexing and match queries by default (unless a search_analyzer override is set), so querying through the field mapping keeps analysis consistent.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-08',
      difficulty: 'medium',
      question: 'Why does BM25 IDF give "the" almost no weight but "E1043" a large weight?',
      options: [
        'Because "the" is shorter',
        'IDF falls as the number of documents containing a term rises; "the" is in nearly all docs, "E1043" in very few',
        'Because numbers are boosted by default',
        'Because stopwords are always given negative weight',
      ],
      correct: [1],
      explanation:
        'IDF = ln(1 + (N − n + 0.5)/(n + 0.5)) shrinks towards 0 as n approaches N and grows for rare terms. Token length and digits do not matter, and Lucene\'s form never goes negative.',
      followUps: [
        {
          q: 'What happens to IDF in a tiny corpus of 20 documents?',
          a: 'Statistics are noisy: a term in one document gets a high IDF by chance, so scores are unstable. Small or per-tenant indexes may need global statistics or smoothing.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-09',
      difficulty: 'expert',
      question:
        'A dense retriever trained on MS MARCO performs worse than BM25 on your biomedical corpus. Which actions are most likely to help? Select ALL that apply.',
      options: [
        'Add BM25 in a hybrid with RRF fusion',
        'Evaluate general-purpose or biomedical embedders on your own golden set and pick the best',
        'Increase HNSW M from 16 to 64 to fix the domain gap',
        'Fine-tune the embedder on in-domain query–passage pairs (including synthetic ones)',
      ],
      correct: [0, 1, 3],
      explanation:
        'The issue is domain shift (the BEIR finding), fixed by hybrid search, a better-suited embedder, or in-domain fine-tuning. HNSW M affects ANN recall relative to exact search, not whether the embedding space captures biomedical relevance.',
      followUps: [
        {
          q: 'How would you generate in-domain training pairs without labels?',
          a: 'Use an LLM to generate questions for sampled passages (synthetic queries), mine hard negatives with BM25, and filter low-quality pairs with a cross-encoder before fine-tuning.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-10',
      difficulty: 'expert',
      question:
        'With filtered vector search for tenant_id = X (0.1% of 20M chunks), your app takes the global top-100 nearest neighbours and then filters by tenant. Users of small tenants often get zero results. Why, and what fixes it?',
      code: {
        language: 'typescript',
        code: `const hits = await vectorDb.search({ vector: qv, limit: 100 });
return hits.filter((h) => h.payload.tenant_id === tenantId).slice(0, 10);`,
      },
      options: [
        'The ANN index is too small; increase limit to 150',
        'Post-filtering: the global top-100 rarely contains the tenant\'s chunks; filter inside the search (pre-filter) or use per-tenant collections',
        'Cosine similarity ignores payloads, so tenant data cannot be retrieved',
        'Tenants must use separate embedding models',
      ],
      correct: [1],
      explanation:
        'With 0.1% of data, about 0.1 of the top-100 global neighbours belongs to the tenant on average, so filtering afterwards usually leaves nothing. Push the filter into the search (payload-indexed filtering) or isolate large tenants. Raising the limit to 150 barely helps, and neither payloads nor models are the issue.',
      followUps: [
        {
          q: 'Is post-filtering ever acceptable?',
          a: 'Only when the filter is unselective (keeps most documents) and you over-fetch accordingly; for selective filters such as tenancy or permissions, filter in the index.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-11',
      difficulty: 'hard',
      question:
        'Which statements about bi-encoder dense retrieval are correct? Select ALL that apply.',
      options: [
        'Document embeddings can be computed once offline and indexed',
        'Queries and documents must be embedded with the same model',
        'Some embedding models expect task prefixes or instructions (e.g. "query: " / "passage: ")',
        'Dense retrieval guarantees exact matches for identifiers',
      ],
      correct: [0, 1, 2],
      explanation:
        'Bi-encoders allow offline document embedding, require a shared model, and some (E5, BGE, instruction-tuned embedders) need prefixes for best results. They do not guarantee exact identifier matches; that is a known weakness.',
      followUps: [
        {
          q: 'What happens if you forget the "query: " prefix with an E5 model?',
          a: 'Retrieval quality drops measurably, because the model was trained to produce query and passage embeddings with those prefixes; mismatched usage shifts the vectors.',
        },
      ],
    },
    {
      id: 'retrieval-fundamentals-mcq-12',
      difficulty: 'expert',
      question:
        'In a multi-tenant Elasticsearch cluster, the same document text ranks differently for two tenants with BM25 even though the queries are identical. What is the most likely reason?',
      options: [
        'BM25 is non-deterministic',
        'Term statistics (document frequency, avgdl) differ between the shards or indexes holding each tenant\'s data, changing IDF and length normalisation',
        'Elasticsearch caches results per tenant',
        'Stemming differs per tenant automatically',
      ],
      correct: [1],
      explanation:
        'IDF and avgdl are computed from the shard or index statistics, so different document populations produce different scores for identical text. BM25 is deterministic, caching does not change scores, and analysers do not vary per tenant unless configured.',
      followUps: [
        {
          q: 'How can you make scores more consistent?',
          a: 'Use dfs_query_then_fetch to compute global term statistics, keep tenants in appropriately sized dedicated indexes, or rely on a reranker for final ordering.',
        },
      ],
    },
  ],
};

export default topic;
