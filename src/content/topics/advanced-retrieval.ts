import type { Topic } from '../../types';

const topic: Topic = {
  id: 'advanced-retrieval',
  phase: 'retrieval',
  order: 3,
  title: 'Advanced Retrieval Patterns',
  subtitle: 'Small-to-big retrieval, multi-step retrieval, retrieval on demand, and chunks that carry their own context',
  estimatedMinutes: 68,
  sources: [
    'LangChain docs — ParentDocumentRetriever (child splitter, parent splitter, docstore)',
    'LlamaIndex docs — SentenceWindowNodeParser and MetadataReplacementPostProcessor',
    'Yang et al. 2018 — HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering',
    'Xiong et al. 2021 — Answering Complex Open-Domain Questions with Multi-Hop Dense Retrieval (MDR)',
    'Trivedi et al. 2023 — Interleaving Retrieval with Chain-of-Thought Reasoning (IRCoT)',
    'Shao et al. 2023 — Enhancing Retrieval-Augmented LLMs with Iterative Retrieval-Generation Synergy (ITER-RETGEN)',
    'Jiang et al. 2023 — Active Retrieval Augmented Generation (FLARE)',
    'Jeong et al. 2024 — Adaptive-RAG: Learning to Adapt Retrieval-Augmented LLMs through Question Complexity (NAACL)',
    'Mallen et al. 2023 — When Not to Trust Language Models (popularity-based adaptive retrieval)',
    'Anthropic (Sep 2024) — Introducing Contextual Retrieval; Anthropic contextual embeddings cookbook',
  ],
  tags: ['parent document retrieval', 'sentence window', 'multi-hop', 'iterative retrieval', 'adaptive retrieval', 'contextual retrieval', 'small-to-big'],
  cheatSheet: [
    'Small-to-big: search on small, precise units; give the LLM the bigger unit around them (parent chunk or sentence window).',
    'Parent document retrieval: index ~100–400-token child chunks, return their ~1–2K-token parent; dedupe parents that several children point to.',
    'Sentence-window retrieval: embed single sentences, replace each hit with ±k neighbouring sentences (LlamaIndex window_size = 3) before generation.',
    'Multi-hop: answers need facts from several documents linked by a bridge entity (HotpotQA); retrieve hop 1, extract the bridge, retrieve hop 2.',
    'Iterative retrieval: interleave reasoning and retrieval (IRCoT, ITER-RETGEN) until enough evidence; always cap iterations.',
    'Adaptive retrieval: decide whether and how much to retrieve per query (Adaptive-RAG classifier: none / single-step / multi-step; FLARE retrieves when confidence drops).',
    'Contextual Retrieval (Anthropic): prepend a 50–100-token, LLM-written context to each chunk before embedding and BM25 indexing.',
    'Reported top-20 failure rates: 5.7% baseline → 3.7% contextual embeddings (−35%) → 2.9% + contextual BM25 (−49%) → 1.9% + reranking (−67%).',
    'Contextualisation cost ≈ $1.02 per 1M document tokens one-off, made cheap by prompt caching the full document across its chunks.',
    'All these patterns trade extra indexing or query-time work for recall and context quality; measure recall@K and answer accuracy before adopting.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Parent Document Retrieval — search small, return big',
      body: `Chunk size has a built-in conflict: **small chunks** embed precisely (one idea per vector) but give the LLM too little context; **big chunks** carry context but their embeddings blur many ideas together. **Parent document retrieval** resolves it: index small *child* chunks, but when one matches, return its larger *parent*. It is like finding the right sentence via a book's index, then reading the whole page.

**Mechanics**
1. Split documents into parents (e.g. 1,500–2,000 tokens, or whole sections).
2. Split each parent into children (100–400 tokens); embed only the children, storing \`parent_id\` in their metadata.
3. Store parents in a docstore (key–value: Redis, Postgres, S3).
4. Query: search children (top 20–50) → map to parent ids → **dedupe** → fetch parents → keep the top few (by best child score).

LangChain ships this as \`ParentDocumentRetriever\` (child splitter, optional parent splitter, vector store + docstore); LlamaIndex's auto-merging retriever is a hierarchical variant that merges sibling chunks into their parent when enough of them match. (Chunking strategies themselves are covered in the *Advanced Chunking* topic.)

**When to use it:** long structured documents (policies, manuals, contracts) where the answer needs surrounding conditions, exceptions and definitions. Watch the token budget: five 2K-token parents is already 10K tokens.`,
      example: `Query: **"Can contractors expense home internet?"**

Child chunk hit (180 tokens, cosine 0.86): "Home internet: up to $50/month reimbursable for remote employees."

Returned alone, the LLM answers "Yes, up to $50/month". Wrong: the parent section (1,600 tokens) continues: "...Contractors are not eligible for any reimbursement under §4; see the Contractor Agreement."

With parent retrieval, the top 3 children map to **2 unique parents** (two children came from the same section), 3.1K tokens in total, and the answer becomes "No. The $50/month allowance covers remote employees only; contractors are excluded under §4." Recall of the answer-bearing text on a 200-question policy set: 74% → **88%** (illustrative).`,
      diagram: `INDEX TIME                              QUERY TIME
 document                                query ─► search CHILD vectors
   ├─ parent P1 (1.6K tok) ──► docstore            │ top 20 children
   │    ├─ child c1 (200) ─► vector{parent:P1}     ▼
   │    ├─ child c2 (200) ─► vector{parent:P1}   map child → parent_id
   │    └─ child c3 (200) ─► vector{parent:P1}     │ dedupe (c1,c2 → P1)
   └─ parent P2 ...                                ▼
                                           fetch parents P1, P7 ─► LLM`,
      code: [
        {
          language: 'typescript',
          title: 'Parent document retrieval with dedupe and a token budget',
          code: `type Child = { id: string; parentId: string; score: number };
type Parent = { id: string; text: string; title: string };

declare function searchChildren(query: string, k: number): Promise<Child[]>; // vector index of children
declare function getParents(ids: string[]): Promise<Parent[]>;             // docstore (Redis / Postgres)

const tok = (s: string) => Math.ceil(s.length / 4);

export async function parentRetrieve(query: string, maxParents = 4, tokenBudget = 6000) {
  const children = await searchChildren(query, 30);

  // best child score per parent: parents with several strong children rank high
  const best = new Map<string, number>();
  for (const c of children) best.set(c.parentId, Math.max(best.get(c.parentId) ?? 0, c.score));

  const rankedIds = [...best].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, maxParents * 2);
  const parents = await getParents(rankedIds);
  const byId = new Map(parents.map((p) => [p.id, p]));

  const out: (Parent & { score: number })[] = [];
  let used = 0;
  for (const id of rankedIds) {
    const p = byId.get(id);
    if (!p || out.length >= maxParents) continue;
    if (used + tok(p.text) > tokenBudget) continue; // skip parents that do not fit
    out.push({ ...p, score: best.get(id)! });
    used += tok(p.text);
  }
  return out;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Precise matching from small chunks plus complete context from parents.',
          'Fixes answers that miss conditions or exceptions just outside a small chunk.',
          'Simple to add: one extra docstore lookup per query.',
        ],
        cons: [
          {
            con: 'Large parents blow up the context and dilute relevant text.',
            fix: 'Cap parent size (1–2K tokens, split big sections), limit the number of parents, and enforce a token budget; optionally compress parents to relevant passages.',
          },
          {
            con: 'Several children from one parent waste top-K slots and duplicate context.',
            fix: 'Dedupe by parent id, scoring each parent by its best (or summed) child score, and retrieve more children (20–50) to get enough distinct parents.',
          },
          {
            con: 'Two stores (vectors + docstore) can drift out of sync on updates.',
            fix: 'Write parents and children in one ingestion job keyed by document version, and delete all children of a parent when it changes.',
          },
        ],
      },
      keyPoints: [
        'Embed children; return parents.',
        'Always dedupe parents and respect a token budget.',
        'Children 100–400 tokens, parents ~1–2K tokens or a logical section.',
        'Keep both stores versioned together.',
      ],
      exercise: {
        prompt: `Write \`splitParentsAndChildren(docId, text, parentTokens = 1500, childTokens = 250)\`.

- Split \`text\` into paragraphs (blank lines). Greedily pack paragraphs into **parents** up to \`parentTokens\` (≈ chars/4).
- Split each parent into **children** by packing sentences up to \`childTokens\`.
- Return \`{ parents: { id, text }[], children: { id, parentId, text }[] }\` with ids like \`docId + ':p0'\` and \`docId + ':p0:c0'\`.
- Never split a sentence across children.`,
        hints: [
          'Write one generic pack(units, maxTokens, joiner) helper and use it twice.',
          'Split sentences with /(?<=[.!?])\\s+/.',
          'If a single unit is larger than the limit, emit it alone rather than looping forever.',
        ],
        solution: {
          language: 'typescript',
          code: `const tok = (s: string) => Math.ceil(s.length / 4);

function pack(units: string[], maxTokens: number, joiner: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let used = 0;
  for (const u of units) {
    const t = tok(u);
    if (cur.length && used + t > maxTokens) {
      out.push(cur.join(joiner));
      cur = [];
      used = 0;
    }
    cur.push(u); // an oversized unit is emitted alone on the next flush
    used += t;
  }
  if (cur.length) out.push(cur.join(joiner));
  return out;
}

export function splitParentsAndChildren(docId: string, text: string, parentTokens = 1500, childTokens = 250) {
  const paragraphs = text.split(/\\n\\s*\\n/).map((p) => p.trim()).filter(Boolean);
  const parents = pack(paragraphs, parentTokens, '\\n\\n').map((t, i) => ({ id: docId + ':p' + i, text: t }));
  const children = parents.flatMap((p) =>
    pack(p.text.split(/(?<=[.!?])\\s+/), childTokens, ' ').map((t, j) => ({
      id: p.id + ':c' + j,
      parentId: p.id,
      text: t,
    })),
  );
  return { parents, children };
}`,
        },
        explanation:
          'Parents follow paragraph boundaries so they stay coherent; children follow sentence boundaries so each embedding covers complete statements. The id scheme encodes the hierarchy, making it trivial to map a child hit back to its parent and to delete all children when a parent changes.',
      },
      quickCheck: {
        question: 'Why not just embed the 1,500-token parents directly and skip the children?',
        options: [
          'Vector databases cannot store vectors for long texts',
          'One embedding of a long, multi-topic passage averages many ideas, so specific questions match it less precisely',
          'Parents cannot be stored in a docstore',
          'Embedding models refuse inputs longer than 200 tokens',
        ],
        correct: 1,
        explanation:
          'A single vector for a long passage is a blend of all its topics, which lowers similarity to a narrow question. Small children give sharp matches, and the parent restores context. Storage and model limits are not the issue at 1,500 tokens.',
      },
      source: 'LangChain docs — ParentDocumentRetriever',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Sentence-Window Retrieval — match a sentence, read its neighbourhood',
      body: `Sentence-window retrieval is the finest-grained form of small-to-big: embed **individual sentences** for maximum precision, then, before generation, replace each hit with a **window** of surrounding sentences. Think of using a highlighter to find the key sentence and then reading the lines around it.

**Mechanics (LlamaIndex)**
- \`SentenceWindowNodeParser\` creates one node per sentence and stores the surrounding sentences (\`window_size = 3\` → 3 before and 3 after) in metadata (\`window\`), keeping the sentence itself in \`original_text\`.
- Only the sentence is embedded.
- At query time \`MetadataReplacementPostProcessor(target_metadata_key="window")\` swaps each retrieved sentence for its window, so the LLM sees ~7 sentences of context.
- Rerank *after* the replacement so the reranker judges the full window.

**Compared with parent retrieval**

| | Sentence window | Parent document |
|---|---|---|
| Unit embedded | 1 sentence | 100–400-token child |
| Context returned | ±k sentences (~150–300 tokens) | whole parent (~1–2K) |
| Best for | dense factual prose, FAQs | sections with conditions and exceptions |
| Index size | many more vectors | fewer vectors |

**When to use it:** precise fact lookup in narrative text (reports, articles, transcripts). Avoid it for tables, code and lists, where sentence splitting breaks structure, and watch index size: one vector per sentence can mean 10–20x more vectors than chunk-level indexing.`,
      example: `Annual report, 40K sentences. Query: **"What was the operating margin in Q3?"**

Top sentence hit (cosine 0.88): "Operating margin improved to 18.4%."

With window_size = 2, the LLM receives:
"Q3 revenue grew 12% year over year to $2.1B. Cost of sales fell as a share of revenue. **Operating margin improved to 18.4%.** This excludes a one-off $40M restructuring charge. Including it, margin was 16.5%."

Without the window the answer is "18.4%"; with it, "18.4% excluding a one-off $40M charge (16.5% including it)". Index size: 40K sentence vectors vs 3K for 400-token chunks (~13x), about 240 MB vs 18 MB at 1536-d float32.`,
      diagram: `sentences: s1 s2 s3 [s4] s5 s6 s7      (s4 is the hit)
                        │
  embed ONLY s4 ──► vector search ──► hit s4
                        │  metadata.window = s1..s7 (window_size = 3)
                        ▼
  replace s4 with window ──► rerank windows ──► LLM sees s1 … s7`,
      code: [
        {
          language: 'python',
          title: 'LlamaIndex sentence-window retrieval with metadata replacement',
          code: `# pip install llama-index
from llama_index.core import Document, VectorStoreIndex
from llama_index.core.node_parser import SentenceWindowNodeParser
from llama_index.core.postprocessor import MetadataReplacementPostProcessor

parser = SentenceWindowNodeParser.from_defaults(
    window_size=3,                              # 3 sentences on each side
    window_metadata_key="window",               # stored, not embedded
    original_text_metadata_key="original_text",
)

docs = [Document(text=open("annual_report.txt").read())]
nodes = parser.get_nodes_from_documents(docs)   # one node per sentence
index = VectorStoreIndex(nodes)                 # embeds the single sentences

query_engine = index.as_query_engine(
    similarity_top_k=6,
    node_postprocessors=[
        # swap each sentence for its window BEFORE the LLM sees it
        MetadataReplacementPostProcessor(target_metadata_key="window"),
    ],
)
print(query_engine.query("What was the operating margin in Q3?"))`,
        },
      ],
      prosCons: {
        pros: [
          'Very precise matches: each vector represents one statement.',
          'Small, focused context windows keep token use low.',
          'Easy to tune: window_size is a single knob.',
        ],
        cons: [
          {
            con: 'Index size explodes (one vector per sentence), raising memory and cost.',
            fix: 'Use it only for prose-heavy collections, quantise vectors (int8), or embed sentence pairs instead of single sentences.',
          },
          {
            con: 'Overlapping windows from adjacent hits duplicate text in the context.',
            fix: 'Merge overlapping or adjacent windows from the same document before sending them to the LLM.',
          },
          {
            con: 'Sentence splitting breaks tables, lists and code.',
            fix: 'Route structured content to structure-aware chunks and use sentence windows only for narrative text.',
          },
        ],
      },
      keyPoints: [
        'Embed sentences; generate from windows.',
        'Replace before reranking so the reranker sees full context.',
        'Merge overlapping windows.',
        'Great for prose, poor for tables and code.',
      ],
      exercise: {
        prompt: `Hits are sentence indices within one document. Write \`mergeWindows(hits, windowSize, totalSentences)\` that returns **merged, non-overlapping ranges** \`[start, end]\` (inclusive) covering each hit ± windowSize, clamped to \`[0, totalSentences - 1]\`.

Example: hits \`[10, 12, 40]\`, windowSize 2, total 100 → \`[[8, 14], [38, 42]]\`.`,
        hints: [
          'Map each hit to [max(0, h − w), min(total − 1, h + w)].',
          'Sort ranges by start.',
          'Merge when the next start ≤ current end + 1 (adjacent ranges merge too).',
        ],
        solution: {
          language: 'typescript',
          code: `export function mergeWindows(hits: number[], windowSize: number, totalSentences: number): [number, number][] {
  const ranges = hits
    .map((h) => [Math.max(0, h - windowSize), Math.min(totalSentences - 1, h + windowSize)] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e); // overlapping or adjacent
    else merged.push([s, e]);
  }
  return merged;
}

// mergeWindows([10, 12, 40], 2, 100) -> [[8, 14], [38, 42]]`,
        },
        explanation:
          'Adjacent hits are common (consecutive sentences discuss the same point). Merging their windows avoids sending the same sentences twice, saving tokens and keeping the passage readable as one continuous excerpt.',
      },
      quickCheck: {
        question: 'Why should a reranker run after the window replacement rather than before it?',
        options: [
          'Rerankers cannot process single sentences',
          'The reranker should judge the context the LLM will actually see, which includes qualifying neighbouring sentences',
          'Replacement changes the embedding vectors',
          'It makes the vector search faster',
        ],
        correct: 1,
        explanation:
          'A single sentence may look relevant while its neighbourhood reveals it is about something else (or contains the real answer). Scoring the full window aligns reranking with what the LLM reads. Embeddings and search speed are unaffected.',
      },
      source: 'LlamaIndex docs — SentenceWindowNodeParser, MetadataReplacementPostProcessor',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Multi-Hop Retrieval — following the chain across documents',
      body: `Some questions need facts that live in **different documents linked by an intermediate entity**: "In which city was the founder of the company that acquired Figma born?" No single chunk contains the answer. **Multi-hop retrieval** follows the chain: retrieve for hop 1, extract the *bridge entity*, retrieve again with it. Like a detective following one lead to the next.

**Two classic question types (HotpotQA, Yang et al. 2018)**
- **Bridge:** A → bridge entity → B ("director of the film that won X").
- **Comparison:** facts about two entities, then compare ("Which was founded first, A or B?"). Comparison can run in parallel; bridge must be sequential.

**Approaches**
1. **Decompose-then-retrieve:** an LLM writes hop questions up front (needs the bridge at runtime, see Query Decomposition).
2. **Query reformulation per hop:** concatenate the question with the retrieved passage and retrieve again; Multi-hop Dense Retrieval (MDR, Xiong et al. 2021) trains exactly this.
3. **Entity/graph hopping:** extract entities from hop-1 passages and follow links in a knowledge graph (see GraphRAG).

**Practical rules:** cap hops (2–3), keep a per-hop evidence trail with citations, stop with "unanswerable" when a hop has no supported answer, and beam-search a few candidates per hop (top-2 bridges) rather than committing to one.

**When to use it:** enterprise questions spanning systems (incident → service → owner), research and compliance questions, and anything with "the X of the Y that…".`,
      example: `Question: **"Who is the on-call lead for the service that caused incident INC-4471?"**

- Hop 1: retrieve "INC-4471 root cause" → postmortem chunk: "Root cause: a bad config push to **ledger-sync**." Bridge entity = \`ledger-sync\`.
- Hop 2: retrieve "ledger-sync on-call lead" → service catalogue chunk: "ledger-sync — owner: Payments Core; on-call lead: **Priya N.**"
- Answer with both citations.

Single-shot retrieval with the original question returned the postmortem (#1) and generic on-call rotation pages, but not the ledger-sync catalogue entry (rank 37): answer accuracy on 80 similar bridge questions went from 41% (single-shot) to **78%** (two hops, top-2 bridges); illustrative numbers.`,
      diagram: `question ─► retrieve hop 1 ─► passage ─► extract bridge entity
                                             "ledger-sync"
                                                  │
                         query hop 2 = "ledger-sync on-call lead"
                                                  │
                                           retrieve hop 2 ─► passage
                                                  │
                       answer + evidence trail [hop1 cite][hop2 cite]
   (beam: keep top-2 bridges; stop if a hop has no supported answer)`,
      code: [
        {
          language: 'typescript',
          title: 'Two-hop retrieval with bridge extraction and a small beam',
          code: `import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
type Hit = { id: string; text: string; score: number };
declare function retrieve(q: string, k: number): Promise<Hit[]>;

const Bridge = z.object({ entities: z.array(z.string()).max(3), nextQuery: z.string() });

async function extractBridge(question: string, hits: Hit[]) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content:
      'Question: ' + question + '\\nPassages:\\n' + hits.map((h) => '[' + h.id + '] ' + h.text).join('\\n') +
      '\\nWhich entities from the passages must be looked up next to answer the question? ' +
      'Return JSON {"entities": [...], "nextQuery": "search query using the top entity"}. ' +
      'Use only entities that appear in the passages; return [] if none.' }],
  });
  return Bridge.safeParse(JSON.parse(res.choices[0].message.content ?? '{}'));
}

export async function twoHopRetrieve(question: string) {
  const hop1 = await retrieve(question, 5);
  const bridge = await extractBridge(question, hop1);
  if (!bridge.success || bridge.data.entities.length === 0) return { status: 'no-bridge', hop1 };

  // beam of up to 2 bridge entities, retrieved in parallel
  const queries = bridge.data.entities.slice(0, 2).map((e) => e + ' ' + bridge.data.nextQuery);
  const hop2 = (await Promise.all(queries.map((q) => retrieve(q, 5)))).flat();
  return { status: 'ok', bridge: bridge.data.entities, evidence: [...hop1.slice(0, 3), ...hop2] };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Answers questions no single chunk can support.',
          'Produces an auditable evidence chain (hop by hop).',
          'Works with existing indexes; no special training required.',
        ],
        cons: [
          {
            con: 'Errors compound: a wrong bridge entity sends hop 2 in the wrong direction.',
            fix: 'Keep a small beam (top 2–3 bridges), require each bridge to appear verbatim in retrieved text, and verify the final answer against all hops\' evidence.',
          },
          {
            con: 'Latency and cost grow with each hop (LLM call + retrieval).',
            fix: 'Cap hops at 2–3, use a small model for bridge extraction, and route only multi-hop questions (classifier) to this path.',
          },
          {
            con: 'Bridge entities may be spelled differently across systems ("ledger-sync" vs "Ledger Sync service").',
            fix: 'Normalise entities with an alias table or entity-resolution step, and add BM25 to hop 2 for exact names.',
          },
        ],
      },
      keyPoints: [
        'Bridge questions are sequential; comparison questions can be parallel.',
        'Extract the bridge entity from evidence, not from the LLM\'s memory.',
        'Beam a few bridges; cap hops.',
        'Keep a cited evidence trail per hop.',
      ],
      exercise: {
        prompt: `Write \`verifyBridge(entity, passages)\`: a guard that accepts a bridge entity only if it appears in at least one hop-1 passage.

- Case-insensitive; ignore hyphens, underscores and extra spaces ("Ledger Sync" matches "ledger-sync").
- Return \`{ ok: boolean; passageId?: string }\` with the id of the first supporting passage.`,
        hints: [
          'Normalise with toLowerCase().replace(/[-_\\s]+/g, " ").trim().',
          'Apply the same normalisation to passages before includes().',
          'Return early on the first match.',
        ],
        solution: {
          language: 'typescript',
          code: `type Passage = { id: string; text: string };

const norm = (s: string) => s.toLowerCase().replace(/[-_\\s]+/g, ' ').trim();

export function verifyBridge(entity: string, passages: Passage[]): { ok: boolean; passageId?: string } {
  const e = norm(entity);
  if (e.length < 2) return { ok: false };
  for (const p of passages) {
    if (norm(p.text).includes(e)) return { ok: true, passageId: p.id }; // grounded bridge
  }
  return { ok: false }; // likely hallucinated from parametric memory
}

// verifyBridge('Ledger Sync', [{ id: 'pm-1', text: 'Root cause: bad config push to ledger-sync.' }])
// -> { ok: true, passageId: 'pm-1' }`,
        },
        explanation:
          'LLMs sometimes "know" a plausible bridge from training data that is wrong for your organisation. Requiring the entity to appear in retrieved evidence keeps the chain grounded, and the supporting passage id becomes part of the citation trail.',
      },
      quickCheck: {
        question: 'Why does single-shot dense retrieval often fail on bridge questions?',
        options: [
          'Embeddings cannot represent named entities',
          'The second document is about the bridge entity, which is not mentioned in the original question, so it is not similar to the query',
          'Vector databases limit results to one document per query',
          'Bridge questions are always longer than the embedding model context',
        ],
        correct: 1,
        explanation:
          'The hop-2 document (e.g. the ledger-sync catalogue entry) shares little with the original question, because the question never names ledger-sync. Only after hop 1 reveals the bridge can you write a query that matches it.',
      },
      source: 'Yang et al. 2018 — HotpotQA; Xiong et al. 2021 — Multi-Hop Dense Retrieval',
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'Iterative Retrieval — retrieve, reason, retrieve again',
      body: `Multi-hop has a known structure; many questions do not. **Iterative retrieval** loops: retrieve, let the model reason over what it has, decide what is still missing, retrieve again, until there is enough evidence or a budget runs out. It is how a researcher works: read, notice a gap, search again.

**Research patterns**
- **IRCoT** (Trivedi et al. 2023): interleave chain-of-thought with retrieval; each new reasoning sentence becomes the next query. Reported large retrieval and QA gains on HotpotQA, 2WikiMultihopQA, MuSiQue and IIRC.
- **ITER-RETGEN** (Shao et al. 2023): generate a draft answer, use it (plus the question) to retrieve again, regenerate; repeat a few times.
- **FLARE** (Jiang et al. 2023): while generating, if upcoming tokens have low confidence, use the tentative sentence as a query and retrieve before continuing.

**Production loop**
1. Retrieve for the question.
2. Ask the LLM: "Is the evidence sufficient? If not, what single query would fill the gap?" (structured output).
3. Stop on *sufficient*, on **max iterations (2–4)**, on a token budget, or when a new query returns nothing new (no novel chunk ids).
4. Answer with all accumulated evidence, deduplicated.

**When to use it:** research assistants, complex support cases, agentic RAG. It is overkill for FAQs: each loop adds ~0.5–2 s.`,
      example: `Question: **"Did the 2026 pricing change affect enterprise customers on legacy contracts?"**

- Iteration 1: query = question → "2026 pricing update: list prices +8% for all tiers." Sufficiency check: *missing: legacy contract terms*. Next query: "legacy enterprise contract price protection clause".
- Iteration 2 → "Contracts signed before 2024 include price protection until renewal." *Missing: does the 2026 update override price protection?* Next: "2026 pricing update exceptions price protection".
- Iteration 3 → "Customers with price protection keep current rates until renewal." Sufficient, stop.

Answer: "No, not until renewal." 3 iterations, 9 unique chunks, ~2.4 s. Single-shot retrieval gave "Yes, +8%".`,
      diagram: `          ┌──────────────────────────────────────────────┐
          ▼                                              │
 query ─► retrieve ─► evidence pool (dedupe) ─► LLM: sufficient?
                                                  │         │ no: next query
                                            yes / limits    └──────────┘
                                                  ▼
                            answer from all evidence (cited)
 stop if: sufficient · iterations ≥ 3 · token budget hit · no new chunks`,
      code: [
        {
          language: 'typescript',
          title: 'Bounded iterative retrieval with a sufficiency check',
          code: `import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
type Hit = { id: string; text: string };
declare function retrieve(q: string, k: number): Promise<Hit[]>;

const Check = z.object({ sufficient: z.boolean(), nextQuery: z.string().optional() });

export async function iterativeRetrieve(question: string, maxIters = 3, maxChunks = 15) {
  const pool = new Map<string, Hit>();
  const queries: string[] = [];
  let query = question;

  for (let i = 0; i < maxIters; i++) {
    queries.push(query);
    const hits = await retrieve(query, 5);
    const fresh = hits.filter((h) => !pool.has(h.id));
    fresh.forEach((h) => pool.set(h.id, h));
    if (fresh.length === 0 || pool.size >= maxChunks) break; // nothing new, or budget hit

    const res = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content:
        'Question: ' + question + '\\nEvidence:\\n' + [...pool.values()].map((h) => '[' + h.id + '] ' + h.text).join('\\n') +
        '\\nPrevious queries: ' + queries.join(' | ') +
        '\\nIs the evidence sufficient to answer? If not, give ONE new search query for the missing fact. ' +
        'JSON {"sufficient": boolean, "nextQuery"?: string}' }],
    });
    const check = Check.safeParse(JSON.parse(res.choices[0].message.content ?? '{}'));
    if (!check.success || check.data.sufficient || !check.data.nextQuery) break;
    if (queries.includes(check.data.nextQuery)) break; // avoid loops
    query = check.data.nextQuery;
  }
  return { evidence: [...pool.values()], queries };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Finds evidence for open-ended questions whose structure is unknown upfront.',
          'Self-corrects: gaps noticed in one round are filled in the next.',
          'Query trail makes the search process inspectable.',
        ],
        cons: [
          {
            con: 'Unbounded loops burn latency and money, or oscillate between similar queries.',
            fix: 'Hard caps on iterations, chunks and tokens; stop when no new chunk ids appear; reject repeated queries.',
          },
          {
            con: 'The sufficiency judge can stop too early (overconfident) or never stop.',
            fix: 'Require explicit missing facts in the judge output, test the judge on labelled examples, and always cap iterations.',
          },
          {
            con: 'Evidence pool grows and dilutes the final context.',
            fix: 'Rerank the accumulated pool against the original question and keep the top N within a token budget for the final answer.',
          },
        ],
      },
      keyPoints: [
        'Loop: retrieve → judge sufficiency → new query.',
        'IRCoT, ITER-RETGEN and FLARE are the reference patterns.',
        'Always bound iterations, chunks and tokens.',
        'Stop when no new evidence appears.',
      ],
      exercise: {
        prompt: `Add **novelty-based stopping** to an iterative loop: write \`isNovel(newHits, pool, minNew = 2, maxSim = 0.92, cos)\` returning true only if at least \`minNew\` new hits are **not near-duplicates** of anything already in the pool.

- A hit is a near-duplicate if its id is in the pool **or** its vector has cosine ≥ \`maxSim\` with any pool vector.
- Hits and pool items have \`{ id, vector }\`.`,
        hints: [
          'Pool can be an array of { id, vector }; build a Set of ids for the fast check.',
          'Count hits that pass both checks.',
          'Return count >= minNew.',
        ],
        solution: {
          language: 'typescript',
          code: `type V = { id: string; vector: number[] };

export function isNovel(
  newHits: V[],
  pool: V[],
  minNew = 2,
  maxSim = 0.92,
  cos: (a: number[], b: number[]) => number = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
): boolean {
  const ids = new Set(pool.map((p) => p.id));
  let novel = 0;
  for (const h of newHits) {
    if (ids.has(h.id)) continue; // exact duplicate
    if (pool.some((p) => cos(h.vector, p.vector) >= maxSim)) continue; // near-duplicate (same passage, other version)
    novel++;
  }
  return novel >= minNew;
}`,
        },
        explanation:
          'Stopping on "no new ids" misses near-duplicates such as the same paragraph in two document versions. Semantic novelty detects when further iterations only rediscover what you already have, a reliable signal to stop and answer.',
      },
      quickCheck: {
        question: 'An iterative retriever keeps alternating between two similar queries until it hits the iteration cap. What is the simplest effective guard?',
        options: [
          'Increase the cap so it eventually converges',
          'Reject a next query that repeats (or nearly repeats) a previous one, and stop when a round adds no new evidence',
          'Lower the embedding dimension',
          'Retrieve fewer chunks per round',
        ],
        correct: 1,
        explanation:
          'Oscillation means the loop is not gaining information. Detecting repeated queries and zero-novelty rounds stops it early. A bigger cap wastes more; dimensions and K do not address the loop logic.',
      },
      source: 'Trivedi et al. 2023 — IRCoT; Shao et al. 2023 — ITER-RETGEN; Jiang et al. 2023 — FLARE',
    },
    // ---------------------------------------------------------------- 5
    {
      heading: 'Adaptive Retrieval — deciding whether and how much to retrieve',
      body: `Not every question needs retrieval, and not every question needs the heavy multi-step path. **Adaptive retrieval** chooses the strategy per query: no retrieval, single-shot, or iterative/multi-hop. It is triage: a nurse does not send every patient to surgery.

**Signals for the decision**
- **Query complexity classifier:** Adaptive-RAG (Jeong et al. 2024) trained a small T5 classifier to label queries as A (answer directly), B (single-step retrieval) or C (multi-step), improving the efficiency/accuracy trade-off over always using one strategy.
- **Entity popularity:** Mallen et al. (2023) found LLMs answer questions about popular entities well from memory, while retrieval helps most for long-tail entities.
- **Model confidence:** FLARE triggers retrieval when token probabilities drop; you can also ask the model to self-assess.
- **Domain rules:** anything about *your* company's private or changing data always retrieves; small talk and pure reasoning ("rewrite this email") never does.

**A practical router**

| Class | Example | Strategy | Latency |
|---|---|---|---|
| No retrieval | "Summarise this text", "thanks!" | LLM only | lowest |
| Single-step | "What is our refund window?" | hybrid + rerank | +100–300 ms |
| Multi-step | "Which customers on legacy plans are affected by the 2026 change?" | iterative / decomposition | +1–5 s |

**When to use it:** mixed-traffic assistants where many turns are conversational or simple, and cost or latency matters. Bias the router towards retrieval for private-data domains: a missed retrieval produces a confident hallucination.`,
      example: `Internal assistant, 100K queries/day, measured traffic mix after adding a router (small classifier, ~15 ms):

| Class | Share | Accuracy before (always single-step) | After |
|---|---|---|---|
| No retrieval (chit-chat, rewrite tasks) | 31% | 96% | 97% |
| Single-step | 58% | 84% | 84% |
| Multi-step | 11% | 47% | **71%** |

Retrieval calls fell 31%, while hard questions gained 24 points from the iterative path. Average latency barely moved: the savings on no-retrieval turns paid for the slower multi-step turns. Illustrative numbers.`,
      diagram: `query ─► [router: classifier + rules] ─┬─► A: no retrieval ─► LLM
                                       │
                                       ├─► B: single-step ─► hybrid+rerank ─► LLM
                                       │
                                       └─► C: multi-step ─► iterative / multi-hop ─► LLM
 rules first: private-data intents → never A;  small talk → always A`,
      code: [
        {
          language: 'typescript',
          title: 'Rules + LLM classifier router with a safe default',
          code: `import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI();
const ROUTER_MODEL = process.env.ROUTER_MODEL ?? 'gpt-5-mini';
const Route = z.object({ route: z.enum(['none', 'single', 'multi']), reason: z.string().max(200) });
type RouteName = z.infer<typeof Route>['route'];

const SMALL_TALK = /^(hi|hello|thanks|thank you|ok|great)\\b/i;
const PRIVATE_CUES = /\\b(our|policy|customer|contract|invoice|incident|ticket|internal)\\b/i;

export async function chooseRoute(query: string): Promise<RouteName> {
  if (SMALL_TALK.test(query.trim()) && query.length < 40) return 'none'; // cheap rule
  try {
    const res = await openai.chat.completions.create(
      {
        model: ROUTER_MODEL,
        response_format: { type: 'json_object' },
        max_completion_tokens: 80,
        reasoning_effort: 'minimal', // reasoning tokens also count toward the cap
        messages: [
          { role: 'system', content: 'Classify how to answer a question for a company assistant. none: no company data needed. ' +
            'single: one lookup in company docs. multi: needs several lookups or combining facts. JSON {"route","reason"}.' },
          { role: 'user', content: query },
        ],
      },
      { signal: AbortSignal.timeout(800) },
    );
    const parsed = Route.parse(JSON.parse(res.choices[0].message.content ?? '{}'));
    // safety bias: anything that smells like private data must retrieve
    if (parsed.route === 'none' && PRIVATE_CUES.test(query)) return 'single';
    return parsed.route;
  } catch {
    return 'single'; // default to retrieval when unsure
  }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Saves cost and latency on queries that do not need retrieval.',
          'Spends extra effort (multi-step) only where it pays off.',
          'Often improves accuracy on simple questions by avoiding distracting context.',
        ],
        cons: [
          {
            con: 'A false "no retrieval" decision on a private-data question yields a confident hallucination.',
            fix: 'Bias towards retrieval: rules that force retrieval for private-data intents, a conservative threshold, and default to single-step on errors or timeouts.',
          },
          {
            con: 'The router adds its own latency and can drift as traffic changes.',
            fix: 'Use rules plus a tiny classifier (fine-tuned small model or embedding + logistic regression, < 20 ms), and retrain on logged outcomes monthly.',
          },
          {
            con: 'Hard to evaluate: you need labels for the "right" route.',
            fix: 'Label routes offline by running all strategies on a sample and taking the cheapest one that answers correctly, as Adaptive-RAG did to build its classifier training data.',
          },
        ],
      },
      keyPoints: [
        'Route per query: none, single-step or multi-step.',
        'Signals: complexity, entity popularity, confidence, domain rules.',
        'Bias towards retrieval for private or changing data.',
        'Label routes by "cheapest strategy that answers correctly".',
      ],
      exercise: {
        prompt: `You ran all three strategies on 500 logged questions. Each record is \`{ q, correct: { none: boolean, single: boolean, multi: boolean } }\`.

Write \`labelRoutes(records)\` that assigns each question the **cheapest correct** route (none < single < multi). If no strategy was correct, label it \`'multi'\` (the most thorough). Also return the label distribution, e.g. \`{ none: 140, single: 300, multi: 60 }\`.`,
        hints: [
          'Iterate over the routes in cost order and pick the first with correct = true.',
          'Fallback is "multi".',
          'Count labels with a Record<string, number>.',
        ],
        solution: {
          language: 'typescript',
          code: `type RouteName = 'none' | 'single' | 'multi';
type Rec = { q: string; correct: Record<RouteName, boolean> };

const COST_ORDER: RouteName[] = ['none', 'single', 'multi'];

export function labelRoutes(records: Rec[]) {
  const counts: Record<RouteName, number> = { none: 0, single: 0, multi: 0 };
  const labelled = records.map((r) => {
    const route = COST_ORDER.find((s) => r.correct[s]) ?? 'multi'; // cheapest that works
    counts[route]++;
    return { q: r.q, route };
  });
  return { labelled, counts };
}`,
        },
        explanation:
          'This turns expensive offline experiments into training data for a cheap router: a classifier learns to predict the cheapest sufficient strategy. Labelling unsolved questions as multi keeps the router conservative for hard cases.',
      },
      quickCheck: {
        question: 'Your adaptive router sends "What is our parental leave policy?" to the no-retrieval route and the model answers with a generic policy. What is the best fix?',
        options: [
          'Use a larger generator model',
          'Force retrieval for questions about company-specific or private data, regardless of the classifier',
          'Lower the temperature of the generator',
          'Remove the router and never retrieve',
        ],
        correct: 1,
        explanation:
          'Company-specific facts are not in the model\'s weights, so skipping retrieval guarantees a generic or hallucinated answer. Rules that force retrieval for private-data intents fix this class of error. Model size or temperature cannot supply missing private knowledge.',
      },
      source: 'Jeong et al. 2024 — Adaptive-RAG; Mallen et al. 2023 — When Not to Trust Language Models',
    },
    // ---------------------------------------------------------------- 6
    {
      heading: 'Contextual Retrieval — chunks that explain themselves',
      body: `A chunk like "The company's revenue grew by 3% over the previous quarter" is ambiguous on its own: which company, which quarter? When chunked, documents lose the context that made each passage meaningful, so both embeddings and BM25 miss it. **Contextual Retrieval** (Anthropic, 2024) fixes this at indexing time: an LLM reads the **whole document** and writes a short context (usually **50–100 tokens**) situating each chunk, which is **prepended** to the chunk before **embedding** (contextual embeddings) and before **BM25 indexing** (contextual BM25). It is like adding a caption to every photo cut out of an album.

**Reported results** (top-20 retrieval failure rate = 1 − recall@20, averaged across domains):

| Setup | Failure rate | Reduction |
|---|---|---|
| Baseline embeddings + chunks | 5.7% | — |
| Contextual embeddings | 3.7% | −35% |
| + contextual BM25 | 2.9% | −49% |
| + reranking (150 → 20) | 1.9% | −67% |

**Cost:** with **prompt caching**, the document is cached once and reused for each of its chunks, giving about **$1.02 per million document tokens** one-off (800-token chunks, 8K-token documents). Anthropic used Claude 3 Haiku; any small, cheap model works. (The *Advanced Chunking* topic covers the chunking side of this idea.)

**When to use it:** corpora where chunks rely on document-level context (financial filings, policies with many versions, multi-product docs). For very small corpora (< ~200K tokens), Anthropic suggests simply putting everything in the prompt with caching.`,
      example: `Chunk from an ACME Q2-2023 10-Q: "The company's revenue grew by 3% over the previous quarter."

Generated context (Haiku-class model, 38 tokens): "This chunk is from ACME Corp's SEC filing for Q2 2023; the previous quarter's revenue was $314M, and this section discusses operating results."

Indexed text = context + chunk. Query: **"ACME revenue growth Q2 2023"**
- Plain chunk: BM25 score 2.1 (only "revenue", "growth"), cosine 0.61 → rank **31**.
- Contextual chunk: BM25 9.4 ("ACME", "Q2", "2023" now match), cosine 0.79 → rank **2**.

Indexing cost for 40M document tokens ≈ 40 × $1.02 ≈ **$41**, one-off.`,
      diagram: `document (8K tokens) ──► [cache full document in prompt]
       │ chunk                        │
       ▼                              ▼
 chunk_i ──────────────► LLM: "situate this chunk in the document"
                                      │ 50–100 token context
                                      ▼
          "context_i + chunk_i" ──┬──► embed ──► vector index
                                  └──► BM25 index
 query ─► hybrid (contextual emb + contextual BM25) ─► rerank 150→20 ─► LLM`,
      code: [
        {
          language: 'typescript',
          title: 'Generate chunk contexts with prompt caching (Anthropic Messages API)',
          code: `import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();
const CONTEXT_MODEL = process.env.CONTEXT_MODEL ?? 'claude-haiku-4-5'; // small, cheap model

export async function contextualizeChunks(docText: string, chunks: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const chunk of chunks) { // sequential so later calls hit the warm cache
    const res = await anthropic.messages.create({
      model: CONTEXT_MODEL,
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: '<document>\\n' + docText + '\\n</document>',
            cache_control: { type: 'ephemeral' }, // same document reused for every chunk
          },
          {
            type: 'text',
            text: 'Here is the chunk we want to situate within the whole document\\n<chunk>\\n' + chunk +
              '\\n</chunk>\\nPlease give a short succinct context to situate this chunk within the overall document ' +
              'for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.',
          },
        ],
      }],
    });
    const context = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    out.push(context + '\\n\\n' + chunk); // index THIS text for both embeddings and BM25
  }
  return out;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Large measured recall gains (−35% to −67% failures) with no change to the query path.',
          'Improves both dense and lexical retrieval because missing entities and dates are added to the chunk.',
          'One-off indexing cost, kept low by prompt caching.',
        ],
        cons: [
          {
            con: 'Indexing time and cost: one LLM call per chunk.',
            fix: 'Use a small model with prompt caching, batch documents (Batch APIs at reduced cost), and only re-contextualise chunks whose document changed.',
          },
          {
            con: 'Generated context can be wrong or include hallucinated details that mislead retrieval.',
            fix: 'Keep the prompt strict ("only situate, do not add facts"), cap length at ~100 tokens, and spot-check contexts; retrieval-only use limits the blast radius.',
          },
          {
            con: 'Documents longer than the model context cannot be cached whole.',
            fix: 'Use the containing section plus a document summary (title, date, entities) as the context source for very long documents.',
          },
        ],
      },
      keyPoints: [
        'Prepend a 50–100-token, document-aware context to each chunk.',
        'Use the contextualised text for both embeddings and BM25.',
        'Reported failure reduction: 35% (embeddings), 49% (+BM25), 67% (+rerank).',
        'Prompt caching makes it about $1 per 1M document tokens.',
      ],
      exercise: {
        prompt: `Make contextualisation **incremental**: write \`planContextJobs(docs, store)\` where each doc has \`{ id, version, chunks: { id, text }[] }\` and \`store.get(chunkId)\` returns \`{ docVersion, textHash } | undefined\`.

Return the list of chunk ids that need (re)contextualising: a chunk needs work if it is new, its text hash changed, **or** its document version changed (the surrounding context may differ even if the chunk text did not). Use \`sha256\` from \`node:crypto\` for hashes.`,
        hints: [
          'createHash("sha256").update(text).digest("hex").',
          'Compare both the stored docVersion and the stored textHash.',
          'Collect ids into an array; order does not matter.',
        ],
        solution: {
          language: 'typescript',
          code: `import { createHash } from 'node:crypto';

type Doc = { id: string; version: string; chunks: { id: string; text: string }[] };
type Stored = { docVersion: string; textHash: string };

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function planContextJobs(docs: Doc[], store: { get(id: string): Stored | undefined }): string[] {
  const jobs: string[] = [];
  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      const prev = store.get(chunk.id);
      const changed =
        !prev ||                              // new chunk
        prev.textHash !== sha(chunk.text) ||  // chunk text edited
        prev.docVersion !== doc.version;      // surrounding document changed
      if (changed) jobs.push(chunk.id);
    }
  }
  return jobs;
}`,
        },
        explanation:
          'Context depends on the whole document, so a chunk whose text is unchanged can still need a new context when the document changes (a new title, date or definitions). Tracking both hashes avoids paying to re-contextualise an entire corpus on every sync while keeping contexts correct.',
      },
      quickCheck: {
        question: 'Why does Anthropic apply the generated context to the BM25 index as well as to embeddings?',
        options: [
          'BM25 requires every chunk to be at least 100 tokens long',
          'The context adds missing literal terms (company names, dates, section names) that exact-match queries need',
          'Embeddings ignore prepended text',
          'It halves the cost of contextualisation',
        ],
        correct: 1,
        explanation:
          'Many queries contain entities that the raw chunk never mentions ("ACME", "Q2 2023"). Prepending context puts those exact tokens into the chunk so BM25 can match them, which is where the extra drop from 3.7% to 2.9% failures came from.',
      },
      source: 'Anthropic 2024 — Introducing Contextual Retrieval',
    },
  ],
  codeChallenges: [
    {
      id: 'advanced-retrieval-cc-1',
      title: 'Parent retrieval that floods the context',
      context:
        'A team implemented small-to-big retrieval by returning the parent of each of the top 10 child hits. Users see repeated passages, prompts hit 40K tokens, and some answers cite a parent that was deleted from the docstore last week (crash: cannot read property text of undefined).',
      task: 'Fix it: dedupe parents, rank them by child evidence, enforce a token budget, handle missing parents, and keep child-level citations.',
      starter: {
        language: 'typescript',
        code: `type Child = { id: string; parentId: string; score: number; text: string };
declare function searchChildren(q: string, k: number): Promise<Child[]>;
declare function getParent(id: string): Promise<{ id: string; text: string }>;

export async function smallToBig(q: string) {
  const children = await searchChildren(q, 10);
  const parents = [];
  for (const c of children) parents.push(await getParent(c.parentId)); // sequential, duplicated
  return parents.map((p) => p.text).join('\\n\\n');
}`,
      },
      hints: [
        'Group children by parentId and keep the best score plus the matched child ids.',
        'Fetch unique parents in parallel and skip (and log) missing ones.',
        'Fill a token budget in score order and include matched child ids for citations.',
      ],
      solution: {
        language: 'typescript',
        code: `type Child = { id: string; parentId: string; score: number; text: string };
type Parent = { id: string; text: string };
declare function searchChildren(q: string, k: number): Promise<Child[]>;
declare function getParent(id: string): Promise<Parent | null>;
declare function logWarn(msg: string, meta: object): void;

const tok = (s: string) => Math.ceil(s.length / 4);

export async function smallToBig(q: string, budget = 6000, maxParents = 4) {
  const children = await searchChildren(q, 30); // more children → enough distinct parents

  const groups = new Map<string, { best: number; childIds: string[] }>();
  for (const c of children) {
    const g = groups.get(c.parentId) ?? { best: 0, childIds: [] };
    g.best = Math.max(g.best, c.score);
    g.childIds.push(c.id);
    groups.set(c.parentId, g);
  }
  const ranked = [...groups].sort((a, b) => b[1].best - a[1].best).slice(0, maxParents * 2);

  const fetched = await Promise.all(ranked.map(([pid]) => getParent(pid))); // parallel
  const out: { parentId: string; text: string; matchedChildren: string[] }[] = [];
  let used = 0;
  ranked.forEach(([pid, g], i) => {
    const p = fetched[i];
    if (!p) { logWarn('missing parent (stale child vectors?)', { pid }); return; } // no crash
    if (out.length >= maxParents || used + tok(p.text) > budget) return;
    out.push({ parentId: pid, text: p.text, matchedChildren: g.childIds }); // child ids for citations
    used += tok(p.text);
  });

  if (!out.length) return children.slice(0, 5).map((c) => ({ parentId: c.parentId, text: c.text, matchedChildren: [c.id] }));
  return out;
}`,
      },
      explanation:
        'Deduping by parent removes repeated passages; ranking by best child score keeps the strongest evidence first; the token budget bounds prompt size; missing parents are skipped and logged (pointing at stale child vectors to clean up) instead of crashing; parallel fetches cut latency; and if no parent is usable, the function falls back to the children themselves.',
      followUps: [
        {
          q: 'How do you stop stale children from pointing to deleted parents?',
          a: 'Delete children by parent id in the same ingestion transaction that removes or updates a parent (or tombstone parents and filter children by a valid version field), plus a nightly reconciliation job that removes orphan child vectors.',
        },
        {
          q: 'When would you return the child plus a neighbouring window instead of the whole parent?',
          a: 'When parents are long (several thousand tokens) or the budget is tight: return the matched children plus a few surrounding sentences or paragraphs, which keeps most of the context benefit at a fraction of the tokens.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-cc-2',
      title: 'Contextual retrieval indexing that costs 10x too much',
      context:
        'A contextual-retrieval indexer sends the full document with every chunk to a large model, in parallel, without caching. Indexing 50M tokens cost far more than planned, rate limits triggered, failed chunks were silently dropped, and the contexts were only used for embeddings.',
      task: 'Rewrite the indexer: small model, prompt caching of the document, bounded concurrency per document with retries, length-capped contexts, and index the contextual text into both the vector and BM25 indexes.',
      starter: {
        language: 'typescript',
        code: `import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();
declare function upsertVector(id: string, text: string): Promise<void>;

export async function indexDoc(doc: { id: string; text: string; chunks: string[] }) {
  await Promise.all(doc.chunks.map(async (chunk, i) => {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-opus-4-1', max_tokens: 1000,
        messages: [{ role: 'user', content: doc.text + '\\n\\nDescribe this chunk: ' + chunk }],
      });
      const ctx = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('') || '';
      await upsertVector(doc.id + ':' + i, ctx + chunk);
    } catch {}
  }));
}`,
      },
      hints: [
        'Put the document in its own content block with cache_control and keep it byte-identical across chunks.',
        'Warm the cache with the first chunk, then process the rest with a small concurrency limit and retries with backoff.',
        'Write the same contextual text to both indexes, and record failures for a retry queue.',
      ],
      solution: {
        language: 'typescript',
        code: `import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ maxRetries: 4 }); // SDK retries 429/5xx with backoff
const MODEL = process.env.CONTEXT_MODEL ?? 'claude-haiku-4-5';
const CONCURRENCY = 4;

declare function upsertVector(id: string, text: string): Promise<void>;
declare function upsertBm25(id: string, text: string): Promise<void>;
declare function enqueueRetry(docId: string, chunkIndex: number, err: unknown): Promise<void>;

async function contextFor(docText: string, chunk: string): Promise<string> {
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 120, // contexts are 50-100 tokens
    messages: [{ role: 'user', content: [
      { type: 'text', text: '<document>\\n' + docText + '\\n</document>', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: '<chunk>\\n' + chunk + '\\n</chunk>\\nGive a short succinct context that situates this chunk ' +
        'within the document to improve search retrieval. Do not add facts not in the document. Answer only with the context.' },
    ] }],
  });
  return r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim().slice(0, 600);
}

export async function indexDoc(doc: { id: string; text: string; chunks: string[] }) {
  const run = async (i: number) => {
    try {
      const ctx = await contextFor(doc.text, doc.chunks[i]);
      const text = ctx + '\\n\\n' + doc.chunks[i];
      await Promise.all([upsertVector(doc.id + ':' + i, text), upsertBm25(doc.id + ':' + i, text)]); // both indexes
    } catch (err) {
      await enqueueRetry(doc.id, i, err); // never drop silently
    }
  };

  if (!doc.chunks.length) return;
  await run(0); // first call writes the cache; later calls read it
  for (let i = 1; i < doc.chunks.length; i += CONCURRENCY) {
    await Promise.all(doc.chunks.slice(i, i + CONCURRENCY).map((_, j) => run(i + j))); // bounded concurrency
  }
}`,
      },
      explanation:
        'Caching the document makes each chunk call pay full price only for the chunk and instructions, and a small model with max_tokens 120 cuts output cost. Warming the cache with one call before fanning out avoids every parallel call missing the cache. Bounded concurrency with SDK retries respects rate limits, failures go to a retry queue rather than vanishing, and the contextual text feeds both the vector and BM25 indexes, which is where the full gain comes from.',
      followUps: [
        {
          q: 'How would you estimate the cost before running the job?',
          a: 'Sum document tokens and chunk counts: cache writes ≈ one document per doc at the write price, cache reads ≈ (chunks − 1) × document tokens at the read price, plus chunk + instruction input and ~100 output tokens per chunk; Anthropic\'s published example works out to about $1.02 per 1M document tokens.',
        },
        {
          q: 'How do you validate that contextualisation actually helped your corpus?',
          a: 'Index a sample both ways and compare recall@20 (failure rate) on a golden set, separately for the embedding leg, the BM25 leg and the hybrid with reranking, mirroring Anthropic\'s ablation.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'advanced-retrieval-iq-1',
      difficulty: 'medium',
      question: 'Compare parent document retrieval and sentence-window retrieval. How would you choose between them for a corpus of HR policies?',
      whatInterviewerLooksFor: [
        'Explains the small-to-big principle behind both',
        'Accurate mechanics: children → parents vs sentence → window',
        'Trade-offs: index size, context size, structure handling',
        'A reasoned choice for policies with an evaluation plan',
      ],
      modelAnswer: `**Shared idea:** retrieve on small units for precise similarity, then give the LLM a larger surrounding unit for context.

**Parent document retrieval**
- Embed 100–400-token children; map hits to 1–2K-token parents (or whole sections) from a docstore; dedupe parents.
- Returns complete sections: conditions, exceptions and definitions stay together.
- Costs more context tokens per hit; needs a docstore kept in sync.

**Sentence-window retrieval**
- Embed single sentences; at query time replace each hit with ±k sentences (LlamaIndex window_size, MetadataReplacementPostProcessor).
- Very precise and token-light; many more vectors (10–20x); weak on tables and lists.

**For HR policies:** policies are structured into sections where the answer often depends on qualifiers a few paragraphs away ("…except contractors", "…after probation"). Parent retrieval with **section-level parents** fits best. Sentence windows of ±3 sentences frequently miss exceptions stated elsewhere in the section.

**Plan:** chunk by headings into parents, split into ~200-token children, top-30 children → dedupe → 3–4 parents within a 6K-token budget → reranker. Evaluate both approaches on 200 policy questions, including exception-heavy ones: recall of the answer-bearing text, answer accuracy and tokens per query.`,
      followUps: [
        {
          q: 'A single policy section is 8K tokens. What do you do?',
          a: 'Split it into sub-sections as parents (by sub-headings or ~1.5K tokens), or return the matched child plus neighbouring paragraphs, so one hit does not consume the whole budget.',
        },
        {
          q: 'How does reranking interact with parent retrieval?',
          a: 'Rerank at the parent level (or the matched child plus window) so the reranker sees what the LLM will see; reranking children and then expanding can promote parents whose best child is relevant but whose bulk is not.',
        },
      ],
      pitfalls: [
        'Forgetting to dedupe parents',
        'Choosing sentence windows for content where exceptions live far from the matched sentence',
        'No token budget',
      ],
    },
    {
      id: 'advanced-retrieval-iq-2',
      difficulty: 'hard',
      question: 'Explain Anthropic\'s Contextual Retrieval and its reported impact. How would you roll it out on a 200M-token corpus?',
      whatInterviewerLooksFor: [
        'Accurate mechanism: LLM-generated context prepended before embedding and BM25',
        'Correct reported numbers and what the metric means',
        'Cost reasoning with prompt caching and batch processing',
        'Incremental re-indexing and evaluation plan',
      ],
      modelAnswer: `**Mechanism.** For each chunk, an LLM reads the full document plus the chunk and writes a 50–100-token context situating it ("From ACME's Q2 2023 10-Q; discusses operating results…"). The context is prepended to the chunk, and that text is indexed in **both** the embedding index (contextual embeddings) and the BM25 index (contextual BM25).

**Reported impact** (failure rate = 1 − recall@20, averaged across datasets):
- 5.7% → 3.7% with contextual embeddings (−35%)
- → 2.9% adding contextual BM25 (−49%)
- → 1.9% adding a reranker over the top 150, keeping 20 (−67%)

**Cost.** With prompt caching, Anthropic estimated ~$1.02 per million document tokens. 200M tokens ≈ **~$200** one-off, plus re-embedding (200M + ~10–20% extra context tokens).

**Rollout**
1. **Pilot:** contextualise a 2M-token sample; compare recall@20 for embeddings, BM25 and hybrid + rerank on a golden set.
2. **Pipeline:** per-document job: cache the document, warm with the first chunk, bounded concurrency, retries, failure queue; use Batch APIs for the backfill.
3. **Blue/green index:** build a new index alongside the old; switch reads with a flag once metrics are confirmed.
4. **Incremental:** re-contextualise chunks when chunk text **or** document version changes.
5. **Monitor:** spot-check contexts for hallucinated details, track context length distribution and retrieval metrics.`,
      followUps: [
        {
          q: 'What if documents are longer than the model\'s context window?',
          a: 'Use the containing section plus a document-level summary (title, date, parties, key entities) as the context source; the goal is situating the chunk, not reading every page.',
        },
        {
          q: 'Could you skip contextualisation and just prepend the document title and section heading?',
          a: 'That cheap baseline captures part of the gain (entity names, section names) and is worth trying first; LLM-written context adds disambiguation such as periods, referents and implicit subjects. Measure both on your golden set.',
        },
      ],
      pitfalls: [
        'Only applying context to embeddings, not BM25',
        'Quoting the reductions as accuracy improvements of the final answers',
        'Re-running the whole corpus on every update',
      ],
    },
    {
      id: 'advanced-retrieval-iq-3',
      difficulty: 'hard',
      question:
        'Questions like "Which customers are affected by the outage caused by last Tuesday\'s deploy?" fail in your RAG system. Design a retrieval approach.',
      context: 'Data lives in deploy logs, incident postmortems, a service catalogue and a customer-to-service mapping table.',
      whatInterviewerLooksFor: [
        'Recognises a multi-hop bridge chain across sources',
        'Sequential retrieval with bridge extraction and grounding',
        'Uses structured lookups where data is tabular',
        'Bounds hops, handles failures, and evaluates',
      ],
      modelAnswer: `**Chain:** deploy (Tuesday) → which service? → which incident and impact? → which customers use that service?

**Design**
1. **Hop 1 (deploy logs):** time-filtered retrieval (self-query: date = last Tuesday, resolved in code) → deploy records → extract service names (bridge entities), verified to appear in the retrieved text.
2. **Hop 2 (postmortems):** retrieve "incident caused by deploy of <service> on <date>" with hybrid search (BM25 for service names) → confirm causality and impacted components.
3. **Hop 3 (structured):** customer mapping is a table, so do not embed it; call a SQL tool with parameterised queries: customers WHERE service IN (…).
4. **Answer** with an evidence trail: deploy id, incident id, query result.

**Controls**
- Beam of 2 bridge services, max 3 hops, stop with "unanswerable" when a hop has no grounded result.
- Per-hop timeouts; cache hop-1 results for the incident window.
- Permission checks on customer data.

**Evaluation:** 50 historical incidents with known affected customers; measure hop-level accuracy (correct service, correct incident) and final precision/recall of the customer list.`,
      followUps: [
        {
          q: 'Why not embed the customer mapping table too?',
          a: 'Exact set membership over thousands of rows is a database query, not a similarity search; embeddings would return approximate, incomplete lists. Use a structured tool with exact filters.',
        },
        {
          q: 'How would an agentic approach differ?',
          a: 'An agent would choose tools and hops dynamically rather than following a fixed chain, which handles more question shapes but needs stronger guardrails: step limits, tool allow-lists and evidence verification.',
        },
      ],
      pitfalls: [
        'Expecting single-shot retrieval to find all hops',
        'Letting the LLM supply the bridge entity from memory',
        'Embedding tabular relationship data',
      ],
    },
    {
      id: 'advanced-retrieval-iq-4',
      difficulty: 'expert',
      question:
        'Your assistant handles chit-chat, simple policy lookups and complex research questions. Design an adaptive retrieval strategy and explain how you would train and validate the router.',
      whatInterviewerLooksFor: [
        'Defines strategy tiers and their costs',
        'Router design combining rules and a learned classifier',
        'Training labels via "cheapest correct strategy"',
        'Safety bias for private data and monitoring for drift',
      ],
      modelAnswer: `**Tiers**
- **A, no retrieval:** chit-chat, rewriting, general knowledge (~0 extra latency).
- **B, single-step:** hybrid + rerank, top 5–8 (~+200 ms).
- **C, multi-step:** decomposition or iterative retrieval, max 3 rounds (~+1–4 s).

**Router**
1. **Rules first:** greetings → A; private-data cues (our, policy, customer ids) → never A; identifier lookups → B with BM25 boost.
2. **Classifier** for the rest: a small fine-tuned model or embedding + logistic regression (< 20 ms), in the spirit of Adaptive-RAG's T5 complexity classifier.
3. **Fallbacks:** classifier error or low confidence → B. If B's top rerank score is low, escalate to C (cheap second chance).

**Training data**
- Sample 2–5K real queries; run A, B and C offline; judge correctness (LLM judge + human spot checks).
- Label = cheapest strategy that is correct; unsolved → C.
- Train, then tune the decision threshold to keep false-A on private-data questions near zero.

**Validation**
- Offline: per-class precision/recall, plus end-to-end accuracy and cost against "always B" and "always C".
- Online: A/B test; monitor escalation rate, answer feedback, latency p95.
- Drift: weekly sample of routes reviewed; retrain monthly.`,
      followUps: [
        {
          q: 'Which router error is worst, and how do you weigh it?',
          a: 'Routing a private-data question to A (no retrieval) causes confident hallucinations, so weight that error heavily: asymmetric loss or a high threshold for A, and rules that forbid A for private-data intents.',
        },
        {
          q: 'How does FLARE-style retrieval complement the router?',
          a: 'It gives a second, in-generation trigger: even if the router chose A or B, retrieval fires when the model\'s token confidence drops, catching questions the router underestimated.',
        },
      ],
      pitfalls: [
        'Defaulting to no retrieval on errors',
        'Training labels from guesses rather than outcome-based experiments',
        'No escalation path from single-step to multi-step',
      ],
    },
    {
      id: 'advanced-retrieval-iq-5',
      difficulty: 'medium',
      question: 'What is iterative retrieval and how do you stop it from running forever or wasting tokens?',
      whatInterviewerLooksFor: [
        'Explains the retrieve–reason–retrieve loop and references (IRCoT, ITER-RETGEN, FLARE)',
        'Concrete stopping criteria',
        'Evidence pool management and final reranking',
        'Latency awareness and when not to use it',
      ],
      modelAnswer: `**What it is.** A loop where the system retrieves, reasons about the evidence, identifies what is missing, and issues a new query. IRCoT uses each chain-of-thought step as the next query; ITER-RETGEN uses the draft answer to retrieve again; FLARE retrieves when the model becomes uncertain mid-generation.

**Stopping criteria (use several)**
1. **Sufficiency judgement:** a structured check ("sufficient: true/false, missing: …").
2. **Hard caps:** max 3–4 iterations, max N chunks, max token budget, wall-clock deadline.
3. **Novelty:** stop if a round adds no new chunk ids (or only near-duplicates).
4. **Query repetition:** reject a next query that matches a previous one.

**Evidence management**
- Deduplicate the pool by id and near-duplicate vectors.
- Rerank the pool against the original question before answering; keep the top 8–12 within budget.
- Keep the query trail for debugging.

**When not to use it:** simple lookups and FAQ traffic (each loop adds 0.5–2 s). Route only complex questions to it.`,
      followUps: [
        {
          q: 'How would you evaluate whether the extra iterations help?',
          a: 'Compare answer accuracy and evidence recall at max iterations 1, 2, 3 and 4 on a set of complex questions, with latency and cost; pick the smallest cap after which accuracy stops improving.',
        },
        {
          q: 'What goes wrong if the sufficiency judge is the same model that answers?',
          a: 'It may be overconfident and stop early, especially on questions it can answer plausibly from memory. Require it to cite evidence for each needed fact, or use a separate, calibrated judge prompt.',
        },
      ],
      pitfalls: [
        'Relying only on the LLM to decide when to stop',
        'Passing the entire evidence pool to the final answer',
        'Using iterative retrieval for every query',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'advanced-retrieval-est-1',
      question:
        'Estimate the one-off cost of Contextual Retrieval for 120M document tokens, plus the extra embedding cost, using Anthropic\'s published figure.',
      assumptions: [
        'Contextualisation ≈ $1.02 per 1M document tokens with prompt caching (Anthropic\'s estimate: 800-token chunks, 8K-token docs, 100-token contexts)',
        'Chunks of 800 tokens → 150K chunks; each gains ~100 context tokens',
        'Illustrative embedding price $0.02 per 1M tokens',
      ],
      steps: [
        { label: 'Contextualisation', calc: '120 × $1.02 ≈ $122' },
        { label: 'Chunks', calc: '120M / 800 = 150K chunks' },
        { label: 'Extra tokens to embed', calc: '150K × 100 = 15M tokens (+12.5%)' },
        { label: 'Total embedding tokens', calc: '120M + 15M = 135M × $0.02/1M ≈ $2.70' },
        { label: 'Total one-off', calc: '≈ $125' },
      ],
      answer: 'About $125 one-off: ~$122 for context generation and ~$3 for embeddings.',
      insight:
        'The one-off cost is tiny compared with the reported 35–67% reduction in retrieval failures; the real costs are pipeline complexity and keeping contexts fresh as documents change.',
      followUps: [
        {
          q: 'What happens to cost without prompt caching?',
          a: 'Each chunk call would pay full input price for the entire 8K-token document: 150K chunks × 8K tokens = 1.2B input tokens, roughly 10x more input than the corpus itself, so cost rises by about an order of magnitude.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-est-2',
      question:
        'Sentence-window vs parent retrieval: estimate index size and per-query context tokens for a 30M-token corpus.',
      assumptions: [
        'Average sentence ≈ 25 tokens; parent retrieval uses 250-token children and 1,500-token parents',
        'Vectors: 1536-d float32 (6 KB each)',
        'Sentence window: top 6 hits, window ±3 sentences (7 sentences ≈ 175 tokens), ~20% overlap removed by merging',
        'Parent retrieval: top 3 unique parents',
      ],
      steps: [
        { label: 'Sentence vectors', calc: '30M / 25 = 1.2M vectors × 6 KB ≈ 7.4 GB' },
        { label: 'Child vectors', calc: '30M / 250 = 120K vectors × 6 KB ≈ 0.74 GB' },
        { label: 'Sentence-window context', calc: '6 × 175 = 1,050 × 0.8 ≈ 840 tokens' },
        { label: 'Parent context', calc: '3 × 1,500 = 4,500 tokens' },
      ],
      answer: 'Sentence windows: ~7.4 GB of vectors but ~840 context tokens per query; parent retrieval: ~0.74 GB of vectors but ~4.5K context tokens per query.',
      insight:
        'The trade-off is index size (paid once, in RAM) versus context tokens (paid on every query). At high QPS, sentence windows can be cheaper overall, while parent retrieval wins when answers need whole sections.',
      followUps: [
        {
          q: 'At 1M queries/day with an illustrative $3 per 1M input tokens, what is the daily context-cost difference?',
          a: '(4,500 − 840) × 1M = 3.66B tokens/day × $3/1M ≈ $11K/day more for parent retrieval, which would pay for a lot of extra RAM, unless parent context measurably improves accuracy.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'advanced-retrieval-mcq-01',
      difficulty: 'medium',
      question:
        'A small-to-big retriever finds ten matching small passages, but they belong to just three larger sections. What is the right output for the LLM?',
      options: [
        '10 copies of parents, one per child hit, to preserve the scores',
        'The 3 unique parents, ordered by their best child score',
        'Only the single best child chunk',
        'All parents in the document, to be safe',
      ],
      correct: [1],
      explanation:
        'Deduplicating to unique parents avoids repeated text, and ordering by the strongest child keeps the best evidence first. Repeating parents wastes tokens; returning only one child loses context; returning all parents ignores relevance and the budget.',
      followUps: [
        {
          q: 'How could you score parents other than by the best child?',
          a: 'Sum or average the top child scores per parent, or count matched children; summing favours sections with many relevant passages, which helps broad questions.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-02',
      difficulty: 'medium',
      question: 'In LlamaIndex sentence-window retrieval, what is embedded and what is sent to the LLM?',
      options: [
        'The window is embedded; the single sentence is sent to the LLM',
        'The single sentence is embedded; the surrounding window (from metadata) is sent to the LLM',
        'Both are embedded and averaged',
        'Neither is embedded; BM25 is used',
      ],
      correct: [1],
      explanation:
        'SentenceWindowNodeParser embeds individual sentences for precision and stores neighbours in metadata; MetadataReplacementPostProcessor swaps in the window before generation. The other options reverse or invent the mechanism.',
      followUps: [
        {
          q: 'What does window_size = 3 mean?',
          a: 'Three sentences on each side of the matched sentence are stored in the window metadata, so the LLM sees up to seven sentences.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-03',
      difficulty: 'hard',
      question:
        'Which statements about Anthropic\'s Contextual Retrieval results are accurate? Select ALL that apply.',
      options: [
        'Contextual embeddings alone reduced the top-20 retrieval failure rate by about 35%',
        'Adding contextual BM25 brought the total reduction to about 49%',
        'Adding a reranker brought the total reduction to about 67%',
        'The generated context replaced the original chunk text in the index',
      ],
      correct: [0, 1, 2],
      explanation:
        'Failure rates went 5.7% → 3.7% (−35%) → 2.9% (−49%) → 1.9% with reranking (−67%). The context is prepended to the chunk, not used instead of it.',
      followUps: [
        {
          q: 'What exactly does "failure rate" measure here?',
          a: '1 minus recall@20: the share of queries for which the relevant chunk is not among the top 20 retrieved chunks, not the accuracy of final answers.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-04',
      difficulty: 'hard',
      question: 'What is wrong with this contextualisation call if it runs for 200 chunks of the same document?',
      code: {
        language: 'typescript',
        code: `await anthropic.messages.create({
  model: CONTEXT_MODEL, max_tokens: 120,
  messages: [{ role: 'user', content: [
    { type: 'text', text: 'Chunk ' + i + ':\\n' + chunk + '\\n<document>' + doc + '</document>',
      cache_control: { type: 'ephemeral' } },
  ] }],
});`,
      },
      options: [
        'max_tokens is too small for a context',
        'The chunk text comes before the document in the cached block, so the prefix differs per chunk and the document is never served from cache',
        'cache_control is not allowed on user messages',
        'Haiku-class models cannot read documents',
      ],
      correct: [1],
      explanation:
        'Prompt caching matches identical prefixes. Putting the varying chunk (and its index) before the document makes every prefix unique, so every call pays full price for the document. Put the document in its own first block with cache_control, then the chunk in a later block. 120 tokens is ample for a 50–100-token context.',
      followUps: [
        {
          q: 'How would you restructure the content blocks?',
          a: 'Block 1: the document wrapped in tags with cache_control; block 2: the chunk plus instructions, without cache_control. Every call then shares the same cached prefix.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-05',
      difficulty: 'hard',
      question:
        'Which questions require sequential multi-hop retrieval (not just parallel retrieval)? Select ALL that apply.',
      options: [
        '"Where was the CEO of the company that acquired our vendor educated?"',
        '"Compare the uptime SLAs of Product A and Product B"',
        '"What is the escalation contact for the team that owns the service in incident INC-212?"',
        '"Which office has the earlier founding year, Berlin or Austin?"',
      ],
      correct: [0, 2],
      explanation:
        'Bridge questions need the first answer (the acquirer, then its CEO; the owning team) before the next query can be written. Comparison questions about named entities can be retrieved in parallel and compared afterwards.',
      followUps: [
        {
          q: 'How many hops does the first question need?',
          a: 'Three: vendor → acquiring company, acquiring company → CEO, CEO → education. Each hop introduces a new bridge entity.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-06',
      difficulty: 'hard',
      question:
        'An adaptive router labels 25% of queries as "no retrieval". Support reports confident wrong answers about internal policies. Which changes are appropriate? Select ALL that apply.',
      options: [
        'Force retrieval for queries with private-data cues regardless of the classifier',
        'Default to single-step retrieval when the router errors or is uncertain',
        'Raise the decision threshold for the "no retrieval" class',
        'Increase generation temperature so the model hedges more',
      ],
      correct: [0, 1, 2],
      explanation:
        'Confident wrong answers on internal topics mean the "no retrieval" route is firing where it should not. Rules, a safe default and a stricter threshold reduce those errors. Temperature does not supply missing private knowledge.',
      followUps: [
        {
          q: 'How do you measure this error rate continuously?',
          a: 'Sample "no retrieval" decisions, re-run them with retrieval, and have a judge compare answers; track the fraction where retrieval changes the answer, and alert if it rises.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-07',
      difficulty: 'hard',
      question: 'This iterative loop sometimes runs all 10 iterations on simple questions. What is the main problem?',
      code: {
        language: 'typescript',
        code: `for (let i = 0; i < 10; i++) {
  const hits = await retrieve(query, 5);
  hits.forEach((h) => pool.push(h));
  query = await llm('Write a better search query for: ' + question + ' given ' + JSON.stringify(pool));
}
return answer(question, pool);`,
      },
      options: [
        'retrieve should return 50 hits',
        'There is no sufficiency or novelty stop condition, so it always runs to the cap and accumulates duplicate chunks',
        'The loop should use while instead of for',
        'JSON.stringify cannot serialise hits',
      ],
      correct: [1],
      explanation:
        'Nothing checks whether the evidence is already sufficient or whether new hits are novel, and pool.push keeps duplicates. Add a structured sufficiency check, stop on no new chunks, dedupe the pool and lower the cap. The loop construct and K are irrelevant.',
      followUps: [
        {
          q: 'What final step should run before answer()?',
          a: 'Deduplicate and rerank the pool against the original question, then keep the top N within a token budget, so the answer is not drowned in loosely related evidence.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-08',
      difficulty: 'expert',
      question:
        'Sentence-window retrieval works well on reports but poorly on API reference pages full of tables and code. What is the most likely reason and fix?',
      options: [
        'Embeddings cannot encode code; switch to BM25 only',
        'Sentence splitting fragments tables and code blocks into meaningless units; use structure-aware chunks (tables and code blocks kept whole) for those pages',
        'window_size is too small; set it to 50',
        'Reports are shorter, so the index is smaller',
      ],
      correct: [1],
      explanation:
        'Sentence segmentation assumes prose. Table rows and code lines become isolated "sentences" without headers or context. Route structured content to structure-aware chunking. A huge window just returns large fragments of broken structure, and BM25-only throws away semantic matching.',
      followUps: [
        {
          q: 'How would you route documents to different strategies?',
          a: 'Classify at ingestion by content type (HTML/Markdown structure, table and code density), store a strategy tag, and apply the corresponding chunker; retrieval can query both indexes and fuse.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-09',
      difficulty: 'expert',
      question:
        'Which mitigations reduce error compounding in multi-hop retrieval? Select ALL that apply.',
      code: {
        language: 'typescript',
        code: `const hop1 = await retrieve(question, 5);
const bridge = await llm('Name the entity to look up next: ' + question); // no evidence passed
const hop2 = await retrieve(bridge, 5);`,
      },
      options: [
        'Pass hop-1 evidence to the bridge extractor and require the bridge to appear verbatim in it',
        'Keep the top 2–3 candidate bridges (a small beam) instead of one',
        'Stop with "unanswerable" when no grounded bridge is found',
        'Increase hop-2 top-K to 500 so the right document is always included',
      ],
      correct: [0, 1, 2],
      explanation:
        'The code asks the LLM for a bridge without evidence, inviting answers from memory. Grounding the bridge, beaming a few candidates and stopping when no grounded bridge exists all limit compounding errors. A huge K adds noise without fixing a wrong bridge.',
      followUps: [
        {
          q: 'How would you score beams to choose the final answer?',
          a: 'Combine hop-1 support (does the bridge appear in high-scoring passages) with hop-2 reranker scores, and prefer the chain whose final answer is supported by citations at every hop.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-10',
      difficulty: 'medium',
      question:
        'Which observation best motivates adaptive retrieval according to Mallen et al. (2023)?',
      options: [
        'Retrieval always hurts accuracy for every question',
        'LLMs recall facts about popular entities well, while retrieval helps most for long-tail entities',
        'Embeddings are unreliable for questions longer than 20 words',
        'Rerankers make retrieval unnecessary',
      ],
      correct: [1],
      explanation:
        'Their study found that parametric memory works for popular knowledge, while non-parametric retrieval matters most for less popular facts; retrieving for everything can even add noise. The other statements are not their findings.',
      followUps: [
        {
          q: 'Does that finding apply to enterprise data?',
          a: 'Mostly not: private company facts are "long-tail" by definition because the model never saw them, so enterprise assistants should retrieve for nearly all domain questions and skip retrieval only for generic tasks.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-11',
      difficulty: 'hard',
      question:
        'After deploying Contextual Retrieval, which checks belong in your validation plan? Select ALL that apply.',
      options: [
        'Recall@20 on a golden set for the embedding leg, the BM25 leg and the hybrid with reranking',
        'Spot-checks of generated contexts for added facts that are not in the document',
        'Re-contextualisation of chunks when their document version changes',
        'Removing BM25, since contextual embeddings make it redundant',
      ],
      correct: [0, 1, 2],
      explanation:
        'Per-leg recall mirrors the published ablation, hallucination spot-checks catch misleading contexts, and version-aware refresh keeps contexts valid. BM25 provided a large part of the gain (3.7% → 2.9%), so removing it throws that away.',
      followUps: [
        {
          q: 'What cheap baseline should you compare against?',
          a: 'Prepending the document title and section heading to each chunk, which costs nothing and captures part of the gain; it shows how much the LLM-written context adds on your corpus.',
        },
      ],
    },
    {
      id: 'advanced-retrieval-mcq-12',
      difficulty: 'expert',
      question:
        'A team combines parent retrieval (1.5K-token parents, top 5) with iterative retrieval (3 rounds). Prompts reach 25K tokens and accuracy drops. What is the best redesign?',
      options: [
        'Switch to a model with a 1M-token window',
        'Iterate over child chunks, accumulate a deduplicated pool, rerank against the question, and expand only the final top 3–4 to parents within a token budget',
        'Remove iterative retrieval and use top-50 parents',
        'Concatenate all parents and let the model find the answer',
      ],
      correct: [1],
      explanation:
        'Expanding to parents inside every iteration multiplies tokens. Keep iterations cheap on children, rerank the accumulated pool, and expand only the final winners under a budget. A bigger window does not fix distraction, and top-50 parents or concatenation make it worse.',
      followUps: [
        {
          q: 'Where should the token budget be enforced?',
          a: 'At final context assembly, after reranking: fill parents (or child plus window) in score order until the budget is reached, leaving room for instructions and the output reserve.',
        },
      ],
    },
  ],
};

export default topic;
