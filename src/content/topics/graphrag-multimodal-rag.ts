import type { Topic } from '../../types';

const topic: Topic = {
  id: 'graphrag-multimodal-rag',
  phase: 'rag',
  order: 3,
  title: 'GraphRAG and Multimodal RAG',
  subtitle:
    'Go beyond flat text chunks: build an entity graph with community summaries to answer "what are the themes across everything?" questions, and retrieve charts, tables and scanned pages directly with captioning, multi-vector and ColPali-style page-image retrieval.',
  estimatedMinutes: 36,
  sources: [
    'Edge et al. 2024 — From Local to Global: A Graph RAG Approach to Query-Focused Summarization (arXiv 2404.16130)',
    'Microsoft GraphRAG docs — Getting started, indexing dataflow, global / local / DRIFT search (microsoft.github.io/graphrag)',
    'Microsoft Research blog 2024 — LazyGraphRAG: Setting a new standard for quality and cost',
    'Traag et al. 2019 — From Louvain to Leiden: guaranteeing well-connected communities',
    'Faysse et al. 2024 — ColPali: Efficient Document Retrieval with Vision Language Models (arXiv 2407.01449)',
    'Qdrant docs and course — Multivector search and how ColPali works (MaxSim comparator)',
    'LangChain docs — MultiVectorRetriever (index summaries, return raw documents)',
    'OpenAI API docs — Images and vision inputs in Chat Completions',
  ],
  tags: ['graphrag', 'knowledge-graph', 'community-detection', 'leiden', 'multimodal-rag', 'colpali', 'multi-vector', 'vision'],
  cheatSheet: [
    'GraphRAG indexing: text units → LLM extracts entities + relationships (+ claims) → merge/summarise descriptions → Leiden hierarchical communities → LLM community reports.',
    'Global search = map-reduce over community reports: each report yields rated partial answers (map), the best are synthesised (reduce). For "what are the main themes?" questions.',
    'Local search = find query-relevant entities (via description embeddings), pull their neighbours, relationships, source text units and community reports into one context.',
    'DRIFT search starts from community-level context, generates follow-up questions and refines with local searches — a blend of global breadth and local detail.',
    'GraphRAG indexing is LLM-heavy (every chunk passes through extraction, every community gets a report); LazyGraphRAG defers summarisation to query time to cut indexing cost.',
    'Multimodal RAG options: (1) caption/summarise images and tables into text, (2) shared image-text embeddings (CLIP-style), (3) page-image retrieval with a VLM retriever (ColPali).',
    'ColPali embeds each page image into ~1,030 patch vectors of 128-d and scores queries by late-interaction MaxSim (sum over query tokens of the best-matching patch).',
    'Multi-vector retriever pattern: index a text summary for search, but return the raw image/table to a vision-language model for answering.',
    'Multi-vector page indexes are big (≈ 0.5 MB per page in float32); binary quantisation, token pooling and first-stage single-vector filtering make them practical.',
    'Choose by question type: specific facts → vector RAG; dataset-wide themes → GraphRAG global; visually rich PDFs → page-image retrieval.',
  ],
  sections: [
    {
      heading: 'GraphRAG — entity graphs, community summaries, local vs global search',
      body: `**Intuition:** vector RAG is a librarian who finds the five most similar paragraphs. That fails for *"What are the main risks discussed across these 4,000 incident reports?"* — no single paragraph contains the answer. GraphRAG first reads everything, builds a map of *who/what is connected to whom*, groups it into neighbourhoods, and writes a summary of each neighbourhood. Questions about the whole corpus are answered from those summaries.

**Indexing pipeline (Microsoft GraphRAG, Edge et al. 2024):**
1. Split documents into **text units** (chunks).
2. An LLM extracts **entities** (name, type, description), **relationships** (source, target, description, strength) and optionally **claims**.
3. Duplicate entities are merged and their descriptions summarised.
4. **Leiden** community detection builds a **hierarchy** of communities (level 0 = broad, deeper levels = finer).
5. An LLM writes a **community report** (title, summary, key findings, rating) for each community, bottom-up.
6. Entity descriptions, text units and reports are embedded.

**Query modes:**

| Mode | How | Best for |
|---|---|---|
| **Global** | map over community reports → rated partial answers → reduce | corpus-wide themes, "summarise everything about X" |
| **Local** | match entities → expand to neighbours, relationships, text units, reports | specific entity questions ("Who does Acme partner with?") |
| **DRIFT** | community-level primer → follow-up questions → local searches | specific questions that benefit from broader context |

**When to use:** sensemaking over large, entity-rich corpora (investigations, research, intelligence, incident history). For single-fact lookups, plain vector/hybrid RAG is cheaper and as good. Indexing cost is the main barrier — try a small sample and a cheap model first, or LazyGraphRAG.`,
      example: `Corpus: 1,800 post-incident reviews (≈ 2.4M tokens).

**Indexing:** 8,000 text units → 21,000 raw entity mentions merged into 6,400 entities (services, teams, vendors, failure modes) and 15,000 relationships. Leiden yields 14 level-0 communities and 310 leaf communities, each with a report.

**Global query:** *"What are the recurring root-cause themes?"*
- Map: 14 level-0 reports → each returns points rated 0–100 ("certificate expiry recurs in payments and auth" — 85).
- Reduce: top-rated points → answer listing 5 themes, each citing report ids.
Vector RAG on the same question returned five random incidents and named only 2 themes.

**Local query:** *"Which teams depend on the ledger-service?"* → entity \`LEDGER-SERVICE\` → 1-hop neighbours (\`PAYMENTS-TEAM\`, \`BILLING-API\`, \`RISK-ENGINE\`) + 6 source text units → precise answer with citations.`,
      diagram: `  INDEX                                   QUERY
  docs ─► text units                      global: reports(level L)
     │                                       │ map: partial answers
     ▼ LLM extract                           │      + helpfulness 0-100
  entities ──── relationships                ▼ reduce: final answer
     │   (merge + summarise)
     ▼                                    local: query ─► entity match
  graph ─► Leiden ─► communities             ─► neighbours + edges
                     (C0 ⊃ C1 ⊃ C2)          ─► text units + reports
                         │                   ─► one context ─► LLM
                         ▼ LLM
                  community reports       drift: primer ─► follow-ups
                                                 ─► local searches`,
      code: [
        {
          language: 'bash',
          title: 'Microsoft GraphRAG CLI: index a folder, then query globally and locally',
          code: `pip install graphrag

mkdir -p ./ragtest/input
cp ./postmortems/*.txt ./ragtest/input/   # plain text or CSV inputs
cd ./ragtest

graphrag init       # writes settings.yaml, .env (API key), prompts/
# Tip: in settings.yaml choose a cheap chat model for extraction on the first run,
# and index a small sample first: GraphRAG makes many LLM calls per chunk.
graphrag index      # extraction -> graph -> Leiden -> community reports (parquet in ./output)

# Corpus-wide sensemaking: map-reduce over community reports
graphrag query "What are the recurring root-cause themes across incidents?"

# Entity-focused question: local search over entities, edges and text units
graphrag query "Which teams depend on the ledger-service?" --method local

# Specific question that benefits from community context
graphrag query "How did certificate-expiry incidents affect payments?" --method drift`,
        },
        {
          language: 'typescript',
          title: 'The core idea in miniature: LLM entity/relationship extraction with a schema',
          code: `import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

const Graph = z.object({
  entities: z.array(z.object({ name: z.string(), type: z.enum(['SERVICE', 'TEAM', 'VENDOR', 'FAILURE_MODE']), description: z.string() })),
  relationships: z.array(z.object({ source: z.string(), target: z.string(), description: z.string(), strength: z.number() })),
});

export async function extract(textUnit: string) {
  const r = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      { role: 'system', content: 'Extract entities and relationships. Use UPPERCASE canonical names. strength is 1-10.' },
      { role: 'user', content: textUnit },
    ],
    response_format: zodResponseFormat(Graph, 'graph'),
  });
  return r.choices[0].message.parsed ?? { entities: [], relationships: [] };
}
// Next steps (what GraphRAG automates): merge entities by name, summarise their
// descriptions, run Leiden on the relationship graph, write one report per community.`,
        },
      ],
      prosCons: {
        pros: [
          'Answers global, corpus-wide questions that top-k chunk retrieval structurally cannot.',
          'Community reports give comprehensive, diverse answers (the paper reports large win rates over vector RAG on comprehensiveness and diversity for global questions).',
          'The entity graph doubles as an explorable knowledge map for analysts.',
        ],
        cons: [
          { con: 'Indexing is expensive: every text unit goes through LLM extraction and every community gets an LLM report.', fix: 'Index a sample first, use a small cheap model for extraction, tune chunk size, cache LLM calls, or use LazyGraphRAG which defers summarisation to query time.' },
          { con: 'Incremental updates are hard: new documents can change entities, communities and reports.', fix: 'Batch updates (e.g. nightly), re-run community detection only for affected subgraphs where supported, and keep vector RAG for fresh content in the meantime.' },
          { con: 'Entity extraction errors (duplicates, missed aliases) fragment the graph.', fix: 'Tune extraction prompts with domain entity types and few-shot examples, and add an entity-resolution pass (normalise names, merge aliases).' },
          { con: 'Global search is slow and token-hungry because it maps over many reports.', fix: 'Query a higher (coarser) community level, cap the number of reports, and route only true sensemaking questions to global search.' },
        ],
      },
      keyPoints: [
        'Index = entities + relationships + Leiden communities + LLM community reports.',
        'Global search map-reduces over community reports; local search expands from matched entities.',
        'DRIFT mixes community context with follow-up local searches.',
        'Use GraphRAG for sensemaking; keep vector RAG for point lookups.',
      ],
      exercise: {
        prompt: `Implement a tiny **local search** context builder over an in-memory graph.

**Acceptance criteria:**
- \`localContext(query, graph, maxNeighbours)\` finds seed entities whose name appears (case-insensitive) in the query.
- For each seed, include up to \`maxNeighbours\` neighbours sorted by relationship \`strength\` (desc).
- Return \`{ entities, relationships, textUnitIds }\`: unique entity names (seeds first), the relationships used, and the union of \`textUnitIds\` of all included entities (deduplicated).
- If no seed matches, return empty arrays.`,
        starter: {
          language: 'typescript',
          code: `type Entity = { name: string; textUnitIds: string[] };
type Rel = { source: string; target: string; strength: number };
type Graph = { entities: Entity[]; relationships: Rel[] };

export function localContext(query: string, g: Graph, maxNeighbours = 3) {
  // TODO: find seeds, expand neighbours by strength, collect text units
  return { entities: [] as string[], relationships: [] as Rel[], textUnitIds: [] as string[] };
}`,
        },
        hints: [
          'Seeds: g.entities.filter(e => query.toLowerCase().includes(e.name.toLowerCase())).',
          'A relationship touches a seed if source or target equals the seed name; the neighbour is the other end.',
          'Use Sets to deduplicate entity names and text unit ids while preserving insertion order.',
        ],
        solution: {
          language: 'typescript',
          code: `type Entity = { name: string; textUnitIds: string[] };
type Rel = { source: string; target: string; strength: number };
type Graph = { entities: Entity[]; relationships: Rel[] };

export function localContext(query: string, g: Graph, maxNeighbours = 3) {
  const q = query.toLowerCase();
  const byName = new Map(g.entities.map((e) => [e.name, e]));
  const seeds = g.entities.filter((e) => q.includes(e.name.toLowerCase()));
  const names = new Set<string>(seeds.map((s) => s.name));
  const rels: Rel[] = [];
  for (const s of seeds) {
    const touching = g.relationships
      .filter((r) => r.source === s.name || r.target === s.name)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxNeighbours);
    for (const r of touching) {
      rels.push(r);
      names.add(r.source === s.name ? r.target : r.source); // the neighbour
    }
  }
  const units = new Set<string>();
  for (const n of names) for (const id of byName.get(n)?.textUnitIds ?? []) units.add(id);
  return { entities: [...names], relationships: rels, textUnitIds: [...units] };
}`,
        },
        explanation:
          'This is the skeleton of GraphRAG local search: anchor on entities, expand along the strongest edges, and ground the answer in the source text units of everything you included. Real implementations match entities by embedding similarity of descriptions and add community reports, then rank everything to fit a token budget.',
      },
      quickCheck: {
        question: 'Which question is the best fit for GraphRAG global search rather than vector RAG?',
        options: [
          'What is the refund window for damaged items?',
          'Across 3,000 customer interviews, what are the top five unmet needs and how do they relate?',
          'What is the API rate limit for the Pro plan?',
          'Who is the owner of the billing-api service?',
        ],
        correct: 1,
        explanation:
          'Corpus-wide thematic synthesis has no single matching chunk; community reports summarise the whole dataset, so map-reduce over them answers it. The others are point lookups (the last one suits local search or plain vector RAG).',
      },
      source: 'Edge et al. 2024 — From Local to Global: A Graph RAG Approach to Query-Focused Summarization',
    },
    {
      heading: 'Multimodal RAG — captions, multi-vector retrieval and ColPali page-image search',
      body: `**Intuition:** half the knowledge in a PDF lives in charts, tables, diagrams and scans that text extraction mangles. Multimodal RAG retrieves those visual elements and lets a vision-language model (VLM) read them.

**Three architectures:**

| Approach | Index | Retrieve | Answer with | Trade-off |
|---|---|---|---|---|
| **Caption / text-ify** | VLM-written captions and table markdown, embedded as text | text search | text LLM (or VLM on the original) | simple, reuses text stack; captions lose detail |
| **Shared embedding** | CLIP-style image + text vectors in one space | cross-modal kNN | VLM | good for photos, weak on dense text pages |
| **Page-image retrieval (ColPali)** | each page screenshot → ~1,030 patch vectors (128-d) | late-interaction MaxSim | VLM reads the top pages | no OCR/layout pipeline; large index |

**Multi-vector retriever pattern:** index a *summary* (text caption of a chart or table) for search, but store a pointer to the *raw* element; at answer time pass the original image to the VLM. Search quality of text, fidelity of pixels.

**ColPali (Faysse et al. 2024):** a PaliGemma-based VLM fine-tuned so every image patch and every query token gets its own 128-d vector. Score = for each query token, take the max similarity over page patches, then sum (ColBERT's MaxSim). It beat OCR + text-embedding pipelines on the ViDoRe visual-document benchmark.

**When to use:** financial reports, slide decks, manuals with diagrams, scanned forms. If documents are mostly prose, a good parser plus text RAG is cheaper. Combine: text RAG for prose + page-image retrieval for visual pages.`,
      example: `Question: *"What was EMEA gross margin in Q3 FY25?"* over 900 investor-deck pages.

- **Text pipeline:** OCR of the bar chart yields "EMEA APAC NA 41 38 44 Q1 Q2 Q3" — the numbers lose their labels; top chunk is a narrative paragraph mentioning "margin pressure". Wrong answer.
- **ColPali:** query has 12 token vectors; page 412 (the margin chart) scores 18.7 by MaxSim vs 14.2 for the narrative page. The top 3 page images (~1,500 image tokens each) go to a VLM, which reads the bar: **"EMEA gross margin was 41% in Q3 FY25 (slide 37)."**

Index size: 900 pages × 1,030 vectors × 128 dims × 2 bytes (bf16) ≈ 237 MB; with binary quantisation ≈ 15 MB.`,
      diagram: `  PDF page ─┬─► text parser ─► chunks ──────────► text vectors ──┐
            ├─► VLM caption (chart/table) ─► summary vector ─┐   │
            │        (multi-vector: summary ↔ raw image id)  │   │
            └─► page image ─► ColPali ─► 1,030 × 128-d ──┐   │   │
                                                         ▼   ▼   ▼
  query ─► query token vectors ─► MaxSim / kNN ─► top pages/elements
                                                         │
                         raw page images + text ─► VLM ─► cited answer`,
      code: [
        {
          language: 'python',
          title: 'ColPali: embed page images and queries, score with MaxSim',
          code: `import torch
from PIL import Image
from colpali_engine.models import ColPali, ColPaliProcessor

name = "vidore/colpali-v1.2"
model = ColPali.from_pretrained(name, torch_dtype=torch.bfloat16, device_map="cuda:0").eval()
processor = ColPaliProcessor.from_pretrained(name)

pages = [Image.open(f"deck/page_{i}.png") for i in range(1, 5)]   # page screenshots
queries = ["EMEA gross margin Q3 FY25", "headcount by region"]

with torch.no_grad():
    page_emb = model(**processor.process_images(pages).to(model.device))     # [4, ~1030, 128]
    query_emb = model(**processor.process_queries(queries).to(model.device)) # [2, n_tokens, 128]

# Late interaction: for each query token take its best page patch, then sum
scores = processor.score_multi_vector(query_emb, page_emb)   # [2 queries, 4 pages]
best = scores.argmax(dim=1)
for q, idx, row in zip(queries, best.tolist(), scores):
    print(q, "-> page", idx + 1, "scores", [round(float(s), 1) for s in row])
# Next: send the top-k page images to a VLM with the question and ask for a cited answer.`,
        },
        {
          language: 'typescript',
          title: 'Multi-vector pattern: caption a chart for search, answer from the raw image',
          code: `import OpenAI from 'openai';
const openai = new OpenAI();
const VLM = process.env.VLM_MODEL ?? 'gpt-5-mini';

type Element = { id: string; pngBase64: string; page: number };

// INDEX: write a retrieval-friendly summary; store summary vector -> element id
export async function summarise(el: Element): Promise<string> {
  const r = await openai.chat.completions.create({
    model: VLM,
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Describe this chart/table for search: title, axes, series, all key numbers.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + el.pngBase64 } },
    ] }],
  });
  return r.choices[0].message.content ?? '';
}

// ANSWER: retrieval found element ids via summaries; give the VLM the ORIGINAL pixels
export async function answerFromImages(question: string, els: Element[]) {
  const r = await openai.chat.completions.create({
    model: VLM,
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Answer from the images only; cite as (page N). Question: ' + question },
      ...els.flatMap((e) => [
        { type: 'text' as const, text: 'Page ' + e.page + ':' }, // label each image so citations are real
        { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,' + e.pngBase64 } },
      ]),
    ] }],
  });
  return r.choices[0].message.content;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Answers questions whose evidence is in charts, tables, diagrams and scans that text-only RAG misses.',
          'Page-image retrieval removes fragile OCR/layout-parsing pipelines from indexing.',
          'Multi-vector pattern combines cheap text search with full-fidelity visual answering.',
        ],
        cons: [
          { con: 'Multi-vector page indexes are large (≈ 0.5 MB per page in float32) and MaxSim is costlier than single-vector kNN.', fix: 'Use binary or int8 quantisation, token pooling (merge similar patches), and a two-stage search: single-vector prefilter then MaxSim rerank on the top 100–200 pages.' },
          { con: 'Captions drop details (exact numbers, small labels), so caption-only search misses or misstates values.', fix: 'Prompt captions to list all numbers and labels, store tables as markdown, and always answer from the original image rather than the caption.' },
          { con: 'VLM answering is expensive: each page image costs on the order of a thousand or more input tokens.', fix: 'Send only the top 2–4 pages, downscale or crop to the relevant region, and route text-only questions to the text pipeline.' },
        ],
      },
      keyPoints: [
        'Three approaches: text-ify with captions, shared image-text embeddings, page-image retrieval.',
        'ColPali: ~1,030 patch vectors × 128-d per page, scored with late-interaction MaxSim.',
        'Index summaries for search, answer from the raw element (multi-vector retriever).',
        'Quantise and two-stage multi-vector search to control index size and latency.',
      ],
      exercise: {
        prompt: `Implement \`maxSim(query, page)\` — ColPali/ColBERT late-interaction scoring.

**Acceptance criteria:**
- \`query\` is an array of query-token vectors, \`page\` an array of patch vectors (all same dimension, assumed L2-normalised so dot product = cosine).
- Score = Σ over query vectors of max over page vectors of dot(q, p).
- Also implement \`rankPages(query, pages, k)\` returning the top-k page indexes by score.
- Check: query [[1,0],[0,1]], page [[0.8,0.6],[0,1]] → 0.8 + 1.0 = 1.8.`,
        starter: {
          language: 'typescript',
          code: `type Vec = number[];

export function maxSim(query: Vec[], page: Vec[]): number {
  // TODO
  return 0;
}

export function rankPages(query: Vec[], pages: Vec[][], k: number): number[] {
  // TODO
  return [];
}`,
        },
        hints: [
          'Write a dot(a, b) helper with a for loop.',
          'For each query vector, compute Math.max over page vectors; add it to the total.',
          'rankPages: map to {i, score}, sort descending, slice k, map to i.',
        ],
        solution: {
          language: 'typescript',
          code: `type Vec = number[];

const dot = (a: Vec, b: Vec) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function maxSim(query: Vec[], page: Vec[]): number {
  let total = 0;
  for (const q of query) {
    let best = -Infinity;
    for (const p of page) best = Math.max(best, dot(q, p)); // best-matching patch for this token
    total += best === -Infinity ? 0 : best;
  }
  return total;
}

export function rankPages(query: Vec[], pages: Vec[][], k: number): number[] {
  return pages
    .map((p, i) => ({ i, score: maxSim(query, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.i);
}
// maxSim([[1,0],[0,1]], [[0.8,0.6],[0,1]]) === 1.8`,
        },
        explanation:
          'Each query token independently finds the patch that best matches it (e.g. "EMEA" matches the legend, "margin" the axis title), and the sum rewards pages that match many query tokens somewhere. Cost is O(query tokens × patches × dim) per page — the reason production systems prefilter candidates before MaxSim.',
      },
      quickCheck: {
        question: 'Why does the multi-vector retriever pattern pass the ORIGINAL chart image to the VLM instead of the caption that was used for retrieval?',
        options: [
          'Captions cannot be embedded',
          'The caption is a lossy summary; the image preserves exact values and labels the answer may need',
          'VLMs refuse text input',
          'It makes retrieval faster',
        ],
        correct: 1,
        explanation:
          'Captions are good search keys but may omit or misstate details; the raw image is the full-fidelity evidence. Captions embed fine, VLMs accept text, and the choice of what to send at answer time does not affect retrieval speed.',
      },
      source: 'Faysse et al. 2024 — ColPali; LangChain docs — MultiVectorRetriever',
    },
  ],
  codeChallenges: [
    {
      id: 'graphrag-multimodal-rag-cc-1',
      title: 'Fix a naive entity-graph builder that fragments and explodes',
      context:
        'A team builds a knowledge graph for GraphRAG-style retrieval. After indexing 5,000 docs, "Acme Corp", "ACME", "Acme Corporation" are three separate nodes, relationship lists contain self-loops, and the extraction loop crashed twice on malformed JSON, losing hours of LLM spend.',
      task: 'Normalise and merge entity names, drop self-loops and duplicate edges (summing strength), validate the LLM output with a schema, and cache extraction results per text unit so re-runs do not re-pay.',
      starter: {
        language: 'typescript',
        code: `const nodes: Record<string, string[]> = {};
const edges: { s: string; t: string; w: number }[] = [];

for (const unit of textUnits) {
  const out = JSON.parse(await llm('Extract entities and relationships as JSON: ' + unit.text));
  for (const e of out.entities) (nodes[e.name] ??= []).push(e.description);
  for (const r of out.relationships) edges.push({ s: r.source, t: r.target, w: r.strength });
}`,
      },
      hints: [
        'Write a canonical(name) that uppercases, strips punctuation and suffixes like CORP/INC/CORPORATION, and applies an alias map.',
        'Key edges by sorted "a|b" and accumulate weight in a Map; skip a === b.',
        'Use zod safeParse and a Map (or disk/Redis) cache keyed by a hash of the text unit.',
      ],
      solution: {
        language: 'typescript',
        code: `import { createHash } from 'node:crypto';
import { z } from 'zod';

const Out = z.object({
  entities: z.array(z.object({ name: z.string().min(1), description: z.string() })),
  relationships: z.array(z.object({ source: z.string(), target: z.string(), strength: z.number().min(0).max(10) })),
});
type Out = z.infer<typeof Out>;

const ALIASES: Record<string, string> = { 'ACME': 'ACME', 'ACME CORPORATION': 'ACME' };
const canonical = (n: string) => {
  const base = n.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\\b(CORP|CORPORATION|INC|LTD|LLC)\\b/g, '').replace(/\\s+/g, ' ').trim();
  return ALIASES[base] ?? base;
};

const cache = new Map<string, Out>(); // swap for Redis/disk in production
const nodes = new Map<string, Set<string>>();
const edges = new Map<string, { s: string; t: string; w: number }>();

for (const unit of textUnits) {
  const key = createHash('sha256').update(unit.text).digest('hex');
  let out = cache.get(key);
  if (!out) {
    const parsed = Out.safeParse(JSON.parse((await llm('Extract entities and relationships as JSON: ' + unit.text)) || '{}'));
    if (!parsed.success) { console.warn('skip unit', unit.id, parsed.error.issues[0]?.message); continue; }
    out = parsed.data;
    cache.set(key, out);
  }
  for (const e of out.entities) {
    const n = canonical(e.name);
    if (!nodes.has(n)) nodes.set(n, new Set());
    nodes.get(n)!.add(e.description); // later: LLM-summarise descriptions per node
  }
  for (const r of out.relationships) {
    const [a, b] = [canonical(r.source), canonical(r.target)].sort();
    if (!a || a === b) continue; // drop empty names and self-loops
    const k = a + '|' + b;
    const cur = edges.get(k);
    edges.set(k, { s: a, t: b, w: (cur?.w ?? 0) + r.strength }); // merge duplicate edges
  }
}`,
      },
      explanation:
        'Entity resolution (canonical names + aliases) keeps the graph connected so community detection finds real clusters; merged, loop-free, weighted edges give Leiden meaningful structure; schema validation turns crashes into skipped units; content-hash caching makes reruns cheap. A JSON.parse on garbage still throws, so in production wrap it or use structured outputs to guarantee valid JSON.',
      followUps: [
        { q: 'How would you resolve aliases you cannot list by hand?', a: 'Embed entity names plus descriptions, cluster candidates above a similarity threshold, and confirm merges with an LLM or string similarity (e.g. Jaro-Winkler) before collapsing nodes.' },
        { q: 'Why sort the endpoints when keying edges?', a: 'For an undirected co-occurrence graph, A→B and B→A are the same relationship; sorting makes both map to one key so strengths accumulate instead of duplicating.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-cc-2',
      title: 'Make a multimodal PDF retriever affordable and accurate',
      context:
        'A prototype sends every page of a 300-page report to a VLM for every question ("let the model find it"). Each question costs ~$1.20 and takes 40 s, and answers sometimes cite the wrong page because pages are not labelled.',
      task: 'Add a retrieval stage (text + page-image scores), send only the top pages with explicit page labels, downscale images, and route text-only questions away from the VLM.',
      starter: {
        language: 'typescript',
        code: `export async function ask(question: string, pages: { png: string }[]) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: [
      { type: 'text', text: question },
      ...pages.map(p => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + p.png } })),
    ] }],
  });
  return r.choices[0].message.content;
}`,
      },
      hints: [
        'Retrieve with a page-level index first (e.g. MaxSim scores from ColPali or captions + text).',
        'Interleave a text label "Page N:" before each image so the model can cite correctly.',
        'Use image_url.detail = "low" or pre-resized images for cheaper tokens when fine detail is not needed.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();
const VLM = process.env.VLM_MODEL ?? 'gpt-5-mini';
const TEXT_LLM = process.env.LLM_MODEL ?? 'gpt-5-mini';

// png is downscaled at ingest (e.g. long side <= 1536 px) so each image costs fewer tokens
type Page = { n: number; png: string; text: string; visual: boolean };
declare function searchPages(q: string, k: number): Promise<{ page: Page; score: number }[]>; // hybrid text + ColPali

export async function ask(question: string) {
  const hits = (await searchPages(question, 4)).filter((h) => h.score > 0.2);
  if (!hits.length) return "I couldn't find this in the report.";

  if (hits.every((h) => !h.page.visual)) {
    // text-only evidence: cheap text model, no images
    const ctx = hits.map((h) => 'Page ' + h.page.n + ':\\n' + h.page.text).join('\\n\\n');
    const r = await openai.chat.completions.create({ model: TEXT_LLM, messages: [
      { role: 'user', content: 'Answer only from these pages and cite (page N).\\n' + ctx + '\\n\\nQ: ' + question } ] });
    return r.choices[0].message.content;
  }

  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: 'Answer only from the labelled pages; cite (page N). If not shown, say so. Q: ' + question },
  ];
  for (const h of hits.slice(0, 3)) {
    content.push({ type: 'text', text: 'Page ' + h.page.n + ':' }); // label precedes each image
    content.push({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + h.page.png, detail: 'high' } });
  }
  const r = await openai.chat.completions.create({ model: VLM, messages: [{ role: 'user', content }] }, { timeout: 30_000 });
  return r.choices[0].message.content;
}`,
      },
      explanation:
        'Retrieval cuts image input from 300 pages to at most 3, which drops cost and latency by roughly two orders of magnitude and reduces distraction; explicit "Page N:" labels make citations reliable; routing text-only evidence to a text model avoids paying for vision at all; a score floor gives an honest "not found".',
      followUps: [
        { q: 'When should you use low detail instead of high?', a: 'For layout or coarse-visual questions (which slide has the org chart) low detail is enough; for reading small numbers in tables or charts keep high detail or crop to the region of interest.' },
        { q: 'How do you decide a page is "visual"?', a: 'At ingest, flag pages with charts, images or tables from the parser/layout model, or when extracted text is sparse relative to page area (a hint of scans or graphics).' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'graphrag-multimodal-rag-iq-1',
      difficulty: 'hard',
      question: 'A product leader wants GraphRAG "because it is better than RAG". How do you decide whether it is worth it for our 200K-document support knowledge base?',
      whatInterviewerLooksFor: [
        'Distinguishes global sensemaking questions from point lookups',
        'Estimates indexing cost and update cadence',
        'Proposes an evaluation on real question types',
        'Considers cheaper alternatives (LazyGraphRAG, hybrid routing)',
      ],
      modelAnswer: `**1. Classify the questions.** Sample 500 real queries. Support traffic is usually >90% point lookups ("how do I reset 2FA?"), where hybrid vector RAG with reranking is as good and far cheaper. GraphRAG's advantage is **global, corpus-wide** questions ("what are the top complaint themes this quarter?") and **entity-relationship** questions.

**2. Estimate indexing cost.** 200K docs × ~1,000 tokens = 200M tokens. Extraction reads every token at least once (plus prompt overhead and gleaning passes), and every community needs a report. Even with a cheap model that is hundreds to thousands of dollars per full index, plus hours of runtime — and support content changes daily, so update cadence matters.

**3. Pilot on a sample.** Index 5–10K docs; build a test set mixing global and local questions; compare GraphRAG global/local/DRIFT vs hybrid RAG on correctness, comprehensiveness (LLM judge pairwise), citations, latency and cost.

**4. Decide by routing, not replacement.** Likely outcome: keep hybrid RAG as the default, add GraphRAG (or LazyGraphRAG, which defers summarisation to query time) for analyst-facing sensemaking questions, behind a router.

**5. Operational plan.** Nightly incremental indexing, cost alerts, and monitoring of entity-resolution quality (duplicate entities fragment communities).`,
      followUps: [
        { q: 'What metric shows GraphRAG wins on global questions?', a: 'Pairwise LLM-judge win rate on comprehensiveness, diversity and empowerment versus vector RAG (the paper\'s method), validated with a human-rated sample.' },
        { q: 'How do you keep the graph fresh?', a: 'Batch new or changed documents, re-extract only those text units, merge entities, and recompute communities and reports for affected parts on a schedule, with vector RAG covering the freshest content.' },
      ],
      pitfalls: [
        'Assuming GraphRAG improves every question type',
        'Ignoring indexing cost and update frequency',
        'Replacing the existing pipeline instead of routing',
      ],
    },
    {
      id: 'graphrag-multimodal-rag-iq-2',
      difficulty: 'expert',
      question: 'Explain how GraphRAG global search works end to end, and why it can answer questions that top-k retrieval cannot.',
      whatInterviewerLooksFor: [
        'Community hierarchy from Leiden and pre-generated reports',
        'Map step with rated partial answers',
        'Reduce step with ranking under a token budget',
        'The query-focused summarisation framing',
      ],
      modelAnswer: `**Why top-k fails:** a question like "What are the main themes?" is a **query-focused summarisation** over the whole corpus. Any top-k retrieval returns a small, similarity-biased sample — the answer is not *in* any chunk.

**Index-time preparation**
- LLM extraction builds an entity/relationship graph.
- **Leiden** clustering partitions it into a **hierarchy** of communities (coarse at the root, fine at the leaves).
- For each community an LLM writes a **report**: title, summary, key findings, importance rating — generated bottom-up so higher levels summarise lower ones.

**Query time (map-reduce)**
1. Choose a community level (coarser = cheaper, more abstract; finer = more detail, more calls).
2. **Map:** shuffle reports into context-sized batches; for each batch, the LLM produces partial answers as points, each with a **helpfulness score (0–100)**; points scored 0 are dropped.
3. **Reduce:** sort all points by score, pack the best into the context window, and generate the final answer with references to reports.

**Why it works:** the reports pre-summarise *every* part of the corpus, so the map step "visits" all of it within bounded context. The paper found substantial win rates over naive vector RAG on comprehensiveness and diversity for such questions.

**Costs:** many LLM calls per query (one per batch), so it is slow and pricey; use coarse levels and route only global questions here.`,
      followUps: [
        { q: 'How does DRIFT differ?', a: 'DRIFT starts from community-level context to form a broad primer answer, generates follow-up questions, and resolves them with local searches, combining global breadth with entity-level detail at lower cost than full global search.' },
        { q: 'Why rate points 0–100 in the map step?', a: 'Ratings let the reduce step prioritise the most helpful evidence under a fixed token budget and discard irrelevant communities entirely.' },
      ],
      pitfalls: [
        'Describing global search as graph traversal from a seed entity (that is local search)',
        'Forgetting reports are generated at index time',
        'Ignoring query-time cost',
      ],
    },
    {
      id: 'graphrag-multimodal-rag-iq-3',
      difficulty: 'hard',
      question: 'Design a RAG system for 50,000 scanned engineering manuals full of diagrams and tables. Which multimodal approach do you choose and why?',
      context: 'Users ask things like "What torque spec is shown for bolt B7 in the pump assembly diagram?"',
      whatInterviewerLooksFor: [
        'Compares captioning, shared embeddings and page-image retrieval',
        'Addresses index size and quantisation',
        'Includes a VLM answering step with page citations',
        'Plans evaluation on visual questions',
      ],
      modelAnswer: `**Options**
- *OCR + text RAG:* fragile on scans and diagrams; labels lose spatial relationships ("B7" and "45 Nm" are separated).
- *Captioning:* better, but captions summarise and may skip the exact value for one bolt among 30.
- *Page-image retrieval (ColPali-style):* embeds the page as patches; query tokens like "B7" and "torque" match the relevant patch regions directly. No OCR/layout pipeline.

**Choice: hybrid with page-image retrieval as the backbone**
1. Ingest: render pages at ~150 DPI; run ColPali to get ~1,030 × 128-d vectors per page; also extract OCR text for keyword search on part numbers.
2. Index: multivector collection (MaxSim) with binary quantisation; plus BM25 over OCR text. 50K manuals × ~80 pages = 4M pages → float32 would be ~2 TB; binary ≈ 4M × 1,030 × 16 bytes ≈ 66 GB — feasible.
3. Retrieve: BM25 (part numbers) + single-vector prefilter → MaxSim rerank → top 3 pages.
4. Answer: VLM gets labelled page images (high detail, optionally cropped), must cite (manual, page) and say "not shown" when absent.

**Evaluate** with 300 real technician questions with gold pages and values: page recall@3, exact-value accuracy, citation correctness, p95 latency and per-question cost.`,
      followUps: [
        { q: 'How do you keep MaxSim fast at 4M pages?', a: 'Two-stage retrieval: a cheap single-vector or BM25 stage to get a few hundred candidates, then exact MaxSim over their multi-vectors; plus quantisation and token pooling.' },
        { q: 'What about tables that span pages?', a: 'Retrieve neighbouring pages together (page window), or stitch continued tables at ingest using the parser, so the VLM sees the full table.' },
      ],
      pitfalls: [
        'Choosing OCR-only for diagram-heavy scans',
        'Ignoring multi-vector storage size',
        'Letting the VLM answer without page citations',
      ],
    },
    {
      id: 'graphrag-multimodal-rag-iq-4',
      difficulty: 'medium',
      question: 'What is the multi-vector retriever pattern, and how would you apply it to tables in financial reports?',
      whatInterviewerLooksFor: [
        'Separation of search representation and answer representation',
        'Concrete storage layout (summary vectors ↔ doc store ids)',
        'Table-specific handling (markdown/HTML, numbers in summaries)',
        'Awareness of summary drift and cost',
      ],
      modelAnswer: `**Pattern:** store *one or more search-friendly representations* of an item in the vector index (summaries, captions, hypothetical questions), each pointing to an id in a separate **doc store** that holds the *raw* item. Search matches on the representation; the answer step receives the raw item.

**For financial tables**
1. Parse each table (layout model) into HTML/markdown **and** keep a cropped image.
2. Generate a summary with an LLM: table title, period, row/column headers, units, and key figures ("Revenue by segment FY24–FY25, USD m; EMEA 1,240 → 1,410").
3. Optionally generate 3–5 hypothetical questions the table answers.
4. Embed summary + questions → vector index with \`table_id\`.
5. At query time, retrieve by summary, then pass the **full markdown table** (or image for complex layouts) to the model.

**Why:** raw tables embed poorly (numbers and pipes dilute meaning) and can be too large for one chunk; summaries embed well. But summaries are lossy, so answering from them causes wrong numbers — hence returning the raw table.

**Watch-outs:** summary quality (prompt to include units and periods), cost of summarising thousands of tables (use a cheap model, cache by content hash), and keeping ids consistent when documents are re-ingested.`,
      followUps: [
        { q: 'Would you embed the raw table as well?', a: 'Often yes, as an extra representation for keyword-heavy queries (exact line items), combined via hybrid search; the doc store still returns one canonical raw table.' },
        { q: 'How do you evaluate table QA?', a: 'Build questions with exact numeric answers, measure table recall@k and exact-match accuracy of the extracted value, and check units and periods.' },
      ],
      pitfalls: [
        'Answering from the summary instead of the raw table',
        'Summaries that omit units and periods',
        'Losing the link between summary vectors and raw items on re-ingest',
      ],
    },
    {
      id: 'graphrag-multimodal-rag-iq-5',
      difficulty: 'expert',
      question: 'Your GraphRAG pilot gives vague, generic global answers and misses well-known relationships. Diagnose the likely causes in the indexing pipeline.',
      whatInterviewerLooksFor: [
        'Entity extraction quality and entity types',
        'Entity resolution and graph fragmentation',
        'Community level choice and report quality',
        'Chunk size and gleaning effects',
      ],
      modelAnswer: `**Inspect the artefacts, not just the answers.** GraphRAG writes entities, relationships, communities and reports to tables you can query.

**Likely causes**
1. **Wrong or generic entity types**: default types (person, organisation, geo, event) miss domain concepts (services, failure modes, drugs). → Customise the extraction prompt with domain types and few-shot examples (GraphRAG supports prompt tuning).
2. **Fragmented entities**: "ledger-service", "Ledger Svc", "LEDGER" as separate nodes split communities, so related facts never meet. → Entity resolution: normalisation, alias lists, embedding-based merging.
3. **Missed relationships due to large chunks**: one extraction pass over long text units under-extracts. → Smaller text units and/or additional gleaning passes.
4. **Too-coarse community level**: level-0 reports are abstract summaries, so answers are generic. → Query a finer level (more calls, more detail), or use DRIFT for specific questions.
5. **Weak reports**: a cheap model wrote shallow reports. → Use a stronger model for report generation only (fewer calls than extraction).
6. **Wrong mode**: entity-specific questions sent to global search. → Route them to local search.

**Verify** each fix with a small set of known relationships ("A depends on B") — check they exist as edges, land in one community, and appear in its report.`,
      followUps: [
        { q: 'Which stage would you spend a stronger model on first?', a: 'Community report generation: it has far fewer calls than extraction and directly determines global answer quality, so upgrades there are cheap and visible.' },
        { q: 'How do you measure graph fragmentation?', a: 'Count near-duplicate entity names (string or embedding similarity), and track the share of singleton or tiny communities; a spike indicates resolution problems.' },
      ],
      pitfalls: [
        'Only tweaking the query prompt',
        'Ignoring entity resolution',
        'Using global search for entity-specific questions',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'graphrag-multimodal-rag-est-1',
      question: 'How much LLM spend does a full GraphRAG index of a 10M-token corpus take, compared with simply embedding it for vector RAG?',
      assumptions: [
        'Text units of 600 tokens → ~16,700 units',
        'Extraction prompt overhead 1,500 tokens per call; output 800 tokens; one gleaning pass doubles extraction calls',
        'Entity description summarisation: 8,000 entities × 600 input + 150 output tokens',
        'Communities: 1,200 reports × 6,000 input + 1,000 output tokens',
        'Illustrative prices: $0.25 per 1M input, $2 per 1M output; embeddings $0.02 per 1M',
      ],
      steps: [
        { label: 'Extraction input', calc: '16,700 × 2 passes × (600 + 1,500) = 70.1M tokens → 70.1 × $0.25 = $17.5' },
        { label: 'Extraction output', calc: '16,700 × 2 × 800 = 26.7M → 26.7 × $2 = $53.4' },
        { label: 'Description summaries', calc: '8,000 × 600 = 4.8M in → $1.2; 8,000 × 150 = 1.2M out → $2.4' },
        { label: 'Community reports', calc: '1,200 × 6,000 = 7.2M in → $1.8; 1,200 × 1,000 = 1.2M out → $2.4' },
        { label: 'GraphRAG total', calc: '$17.5 + $53.4 + $3.6 + $4.2 ≈ $79 (plus embeddings ≈ $0.3)' },
        { label: 'Vector RAG total', calc: '10M tokens × $0.02 / 1M = $0.20' },
      ],
      answer: 'Roughly $80 for GraphRAG versus about $0.20 for plain embedding — ~400× more, dominated by extraction output tokens.',
      insight:
        'Extraction output tokens are the cost driver, so prompt for terse descriptions, skip gleaning when recall is already good, and use a cheap model for extraction while spending on reports. At 1B tokens the same ratio means ~$8K per full re-index, which is why incremental updates and LazyGraphRAG matter.',
      followUps: [
        { q: 'What if you use a 5× pricier model for everything?', a: 'Cost scales linearly to about $400 per index for 10M tokens; better to use the stronger model only for the 1,200 reports (~$21 instead of ~$4) and keep extraction cheap.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-est-2',
      question: 'Size a ColPali page-image index for 2M pages in float32, bf16 and binary, and say whether it fits in RAM.',
      assumptions: [
        '1,030 patch vectors per page, 128 dimensions each',
        'float32 = 4 bytes/dim, bf16 = 2 bytes/dim, binary = 1 bit/dim',
        'Token pooling (factor 3) optional',
        'A single server has 256 GB RAM',
      ],
      steps: [
        { label: 'Vectors', calc: '2,000,000 × 1,030 = 2.06B patch vectors' },
        { label: 'float32', calc: '2.06B × 128 × 4 B = 1,054.7 GB ≈ 1.05 TB' },
        { label: 'bf16', calc: '2.06B × 128 × 2 B ≈ 527 GB' },
        { label: 'binary', calc: '2.06B × 128 / 8 B = 2.06B × 16 B ≈ 33 GB' },
        { label: 'binary + pooling ÷3', calc: '33 GB / 3 ≈ 11 GB' },
      ],
      answer: 'float32 ≈ 1.05 TB, bf16 ≈ 527 GB, binary ≈ 33 GB (≈ 11 GB with 3× pooling). Only the quantised variants fit in 256 GB RAM.',
      insight:
        'Multi-vector retrieval multiplies storage by ~1,000 versus one vector per page, so quantisation and pooling are mandatory at scale. A common design keeps binary vectors in RAM for candidate search and full-precision vectors on disk to rescore the top few hundred.',
      followUps: [
        { q: 'How much does a single-vector-per-page index (1536-d float32) need for comparison?', a: '2M × 1,536 × 4 B ≈ 12.3 GB — similar to the binary+pooled multi-vector index, which is why binary ColPali indexes are considered practical.' },
      ],
    },
  ],
  test: [
    {
      id: 'graphrag-multimodal-rag-mcq-01',
      difficulty: 'medium',
      question: 'In Microsoft GraphRAG, which artefact does global search primarily read at query time?',
      options: [
        'Raw text units ranked by embedding similarity',
        'Pre-generated community reports at a chosen hierarchy level',
        'The full entity graph traversed from the most similar entity',
        'Claims extracted from each document',
      ],
      correct: [1],
      explanation:
        'Global search map-reduces over community reports written at index time. Ranking raw text units is vector RAG, traversing from a matched entity is local search, and claims are optional covariates, not the main input.',
      followUps: [
        { q: 'What trade-off does the community level control?', a: 'Coarser levels mean fewer, more abstract reports (cheaper, more generic answers); finer levels mean more reports with more detail (more LLM calls, higher cost).' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-02',
      difficulty: 'hard',
      question: 'Select ALL steps that are part of the standard GraphRAG indexing pipeline.',
      options: [
        'LLM extraction of entities and relationships from text units',
        'Hierarchical community detection with the Leiden algorithm',
        'LLM-generated reports summarising each community',
        'Fine-tuning the generator on the extracted triples',
      ],
      correct: [0, 1, 2],
      explanation:
        'Extraction, Leiden communities and community reports are core indexing steps. GraphRAG does not fine-tune any model; it uses prompting throughout.',
      followUps: [
        { q: 'Why Leiden rather than Louvain?', a: 'Leiden guarantees well-connected communities and fixes Louvain\'s tendency to produce badly connected or disconnected communities, while remaining fast on large graphs.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-03',
      difficulty: 'hard',
      question: 'What does this function compute, and what retrieval method uses it?',
      code: {
        language: 'typescript',
        code: `function score(q: number[][], d: number[][]) {
  return q.reduce((sum, qv) =>
    sum + Math.max(...d.map(dv => qv.reduce((s, x, i) => s + x * dv[i], 0))), 0);
}`,
      },
      options: [
        'Mean pooled cosine similarity, used by single-vector bi-encoders',
        'Late-interaction MaxSim: for each query vector, the best dot product over document vectors, summed — used by ColBERT and ColPali',
        'BM25 term saturation',
        'Cross-encoder relevance logits',
      ],
      correct: [1],
      explanation:
        'Each query vector takes its maximum dot product over document (patch) vectors, and these maxima are summed: the MaxSim operator. Mean pooling would average vectors first, BM25 works on term counts, and cross-encoders score a jointly encoded pair.',
      followUps: [
        { q: 'What is the cost of MaxSim per document?', a: 'O(|q| × |d| × dim) — for ColPali roughly 20 query tokens × 1,030 patches × 128 dims per page, which is why candidates are prefiltered first.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-04',
      difficulty: 'medium',
      question: 'Your multimodal pipeline captions every chart and answers from the captions. Users report wrong numbers for specific data points. What is the most effective change?',
      options: [
        'Use longer captions only',
        'Keep captions for retrieval but pass the original chart image (or extracted table) to a VLM for answering',
        'Switch to a larger text-only LLM',
        'Increase top-k from 3 to 10 captions',
      ],
      correct: [1],
      explanation:
        'Captions are lossy; answering from the original pixels or the structured table restores exact values. Longer captions help a bit but still omit details; a larger text LLM cannot recover numbers not in the caption; more captions add noise.',
      followUps: [
        { q: 'What do you lose with this change?', a: 'Cost and latency: VLM calls with images cost more tokens than text, so limit to the top 2–3 elements and crop to the relevant region.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-05',
      difficulty: 'expert',
      question: 'Select ALL techniques that reduce the memory footprint of a ColPali-style multi-vector index without discarding pages.',
      options: [
        'Binary quantisation of patch vectors',
        'Token pooling that merges similar patch vectors',
        'Storing full-precision vectors on disk and only quantised vectors in RAM',
        'Raising HNSW efSearch',
      ],
      correct: [0, 1, 2],
      explanation:
        'Quantisation shrinks each vector, pooling reduces the number of vectors, and tiered storage keeps only compact vectors in RAM. efSearch is a query-time search breadth parameter; raising it increases recall and latency but does not reduce memory.',
      followUps: [
        { q: 'How do you recover accuracy lost to binary quantisation?', a: 'Rescore the top few hundred candidates with full-precision (or int8) vectors loaded from disk — oversample then rescore.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-06',
      difficulty: 'hard',
      question: 'A user asks "Which vendors does the payments team rely on, and for what?" Which GraphRAG query mode fits best?',
      options: [
        'Global search, because it reads every community',
        'Local search, anchored on the PAYMENTS TEAM entity and its relationships and source text',
        'No retrieval; the LLM knows the vendors',
        'Global search at the finest community level only',
      ],
      correct: [1],
      explanation:
        'The question is about a specific entity\'s relationships, which is exactly local search: match the entity, expand to neighbours and pull supporting text units. Global search is costly and abstract for this; the LLM cannot know private vendor relationships.',
      followUps: [
        { q: 'What does local search add beyond neighbours?', a: 'Relationship descriptions, the original text units that mention the entities, and relevant community reports, all ranked into a token budget.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-07',
      difficulty: 'hard',
      question: 'What is the bug in this multi-vector retriever?',
      code: {
        language: 'typescript',
        code: `// index: summaries embedded, metadata.docId points to the raw table
const hits = await vectorStore.search(embed(question), 3);
const context = hits.map(h => h.text).join('\\n');   // h.text = the summary
return llm('Answer using:\\n' + context + '\\nQ: ' + question);`,
      },
      options: [
        'It should search with the raw question text, not an embedding',
        'It answers from the summaries instead of fetching raw tables by docId from the doc store, defeating the pattern',
        'k = 3 is too small for multi-vector retrieval',
        'Summaries cannot be stored in a vector store',
      ],
      correct: [1],
      explanation:
        'The point of the multi-vector pattern is to search with summaries but answer with the raw items; this code never looks up metadata.docId, so the LLM sees only lossy summaries. Embedding the query is correct; k is a tuning choice; summaries are stored as normal text vectors.',
      followUps: [
        { q: 'What should happen if two summaries point to the same raw table?', a: 'Deduplicate by docId after retrieval so the raw table is included once, keeping the best rank.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-08',
      difficulty: 'medium',
      question: 'Why does ColPali avoid an OCR and layout-parsing pipeline at indexing time?',
      options: [
        'It requires documents to be born-digital',
        'It embeds the rendered page image directly into patch vectors, so text, layout and visuals are captured by the vision model',
        'It only indexes the page title',
        'It converts pages to audio first',
      ],
      correct: [1],
      explanation:
        'ColPali feeds page screenshots to a VLM-based encoder that outputs per-patch embeddings, capturing text and visual layout without explicit OCR. It works on scans as well as born-digital PDFs and indexes the whole page.',
      followUps: [
        { q: 'When might you still run OCR?', a: 'For BM25 keyword search on exact part numbers or codes, for text snippets in citations, and for downstream text-only processing.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-09',
      difficulty: 'expert',
      question: 'Select ALL reasons GraphRAG global answers can become vague or miss known relationships.',
      options: [
        'Duplicate entity names fragment the graph so related facts land in different communities',
        'Queries are answered from very coarse community levels whose reports are abstract',
        'Generic entity types in the extraction prompt miss domain concepts',
        'The vector index uses cosine instead of dot product similarity',
      ],
      correct: [0, 1, 2],
      explanation:
        'Fragmentation, coarse levels and generic extraction all degrade the graph or reports that global search depends on. Global search does not rely on a similarity metric choice over text chunks, so cosine vs dot product is not the cause.',
      followUps: [
        { q: 'Which of these is cheapest to test first?', a: 'Querying a finer community level: it needs no re-indexing, only a query-time parameter change, and quickly shows whether detail exists in the index.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-10',
      difficulty: 'hard',
      question: 'Look at this message construction for a VLM answering step. What problem will appear in citations?',
      code: {
        language: 'typescript',
        code: `const content = [
  { type: 'text', text: 'Cite the page number. Q: ' + q },
  ...topPages.map(p => ({ type: 'image_url', image_url: { url: p.dataUrl } })),
];`,
      },
      options: [
        'Images must come before text in OpenAI messages',
        'The model has no page numbers to cite, so it guesses or uses image order, producing wrong page citations',
        'data URLs are not allowed for images',
        'Only one image is allowed per message',
      ],
      correct: [1],
      explanation:
        'Nothing tells the model which page each image is, so citations are unreliable; interleave "Page N:" text parts before each image. Order of parts is flexible, base64 data URLs are supported, and multiple images per message are allowed.',
      followUps: [
        { q: 'Besides labels, how can you verify the cited page?', a: 'Check that the cited page number is one of the pages sent and, optionally, that its OCR text or a second VLM check contains the stated value.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-11',
      difficulty: 'expert',
      question: 'Select ALL statements that correctly contrast GraphRAG with plain vector RAG.',
      options: [
        'GraphRAG is far more expensive to index because of LLM extraction and report generation',
        'GraphRAG excels at corpus-wide thematic questions; vector RAG excels at specific lookups',
        'GraphRAG removes the need for any embeddings',
        'Updating GraphRAG after new documents arrive is harder than re-embedding new chunks',
      ],
      correct: [0, 1, 3],
      explanation:
        'Indexing cost, the sensemaking vs lookup split, and harder incremental updates are all real differences. GraphRAG still embeds entity descriptions, text units and reports for local search, so embeddings remain.',
      followUps: [
        { q: 'How does LazyGraphRAG change the cost picture?', a: 'It defers LLM summarisation to query time and uses lighter-weight indexing, bringing indexing cost close to vector RAG while keeping much of the global-question quality.' },
      ],
    },
    {
      id: 'graphrag-multimodal-rag-mcq-12',
      difficulty: 'medium',
      question: 'A corpus is mostly prose policy documents with a few simple tables. Which architecture is the most sensible starting point?',
      options: [
        'ColPali page-image retrieval for every page',
        'A good parser that converts tables to markdown, plus text hybrid RAG; add visual retrieval only if evaluation shows misses',
        'GraphRAG global search for all questions',
        'Sending entire PDFs to a VLM per question',
      ],
      correct: [1],
      explanation:
        'Prose-heavy content is well served by text RAG, and simple tables survive parsing to markdown. Page-image retrieval adds storage and VLM cost without benefit here; GraphRAG global search targets thematic questions; whole-PDF VLM calls are expensive and slow.',
      followUps: [
        { q: 'What evaluation signal would justify adding visual retrieval?', a: 'A cluster of failed questions whose gold evidence sits in charts, diagrams or complex tables that the parser mangles, measured as low recall on those question types.' },
      ],
    },
  ],
};

export default topic;
