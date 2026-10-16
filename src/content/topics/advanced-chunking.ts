import type { Topic } from '../../types';

const topic: Topic = {
  id: 'advanced-chunking',
  phase: 'ingestion',
  order: 3,
  title: 'Advanced Chunking: Semantic, Structure-Aware, Parent-Child and Contextual',
  subtitle:
    'Go beyond fixed windows: cut where the topic changes, follow the document\'s own outline, search small but answer big, and give every chunk the context it lost.',
  estimatedMinutes: 52,
  sources: [
    'Anthropic Engineering (Sept 2024): Introducing Contextual Retrieval',
    'LangChain docs: SemanticChunker (langchain_experimental), breakpoint_threshold_type percentile/standard_deviation/interquartile/gradient',
    'LangChain docs: MarkdownHeaderTextSplitter, HTMLHeaderTextSplitter, RecursiveCharacterTextSplitter.from_language',
    'LangChain docs: ParentDocumentRetriever; LlamaIndex HierarchicalNodeParser and AutoMergingRetriever',
    'Greg Kamradt — 5 Levels of Text Splitting (semantic chunking origin)',
    'Günther et al. 2024, "Late Chunking: Contextual Chunk Embeddings Using Long-Context Embedding Models" (Jina AI, arXiv 2409.04701)',
    'Chroma Research 2024: Evaluating Chunking Strategies for Retrieval',
    'Anthropic docs: Prompt caching (cache_control, cache read pricing)',
  ],
  tags: ['chunking', 'semantic-chunking', 'markdown', 'parent-child', 'contextual-retrieval', 'rag'],
  cheatSheet: [
    'Semantic chunking: embed sentences, compute distance between neighbours, cut where distance exceeds the 95th percentile (LangChain SemanticChunker default).',
    'Semantic chunking costs one embedding per sentence (or sentence window) at ingestion and yields uneven sizes: always enforce min/max token bounds.',
    'Structure-aware chunking: split by headings/HTML sections/code units first, recurse inside oversize sections, and store the heading path ("Billing > Refunds > EU") in metadata.',
    'Never split tables, code blocks or lists mid-way; keep them atomic or split by rows while repeating the header.',
    'Parent-child: index small children (100–300 tokens) for precise matching, return their larger parent (1,000–2,000 tokens or a section) for generation.',
    'Store parent text once in a docstore keyed by parent_id; children carry parent_id and are the only things embedded.',
    'Contextual chunking (Anthropic): an LLM writes 50–100 tokens situating each chunk in its document; prepend it before embedding and BM25 indexing.',
    'Anthropic reported top-20 retrieval failure 5.7% → 3.7% (−35%) with contextual embeddings, → 2.9% (−49%) adding contextual BM25, → 1.9% (−67%) with reranking.',
    'Prompt caching makes contextualisation cheap: Anthropic estimated ~$1.02 per 1M document tokens one-off.',
    'Late chunking (Jina) is the model-side alternative: embed the whole document with a long-context model, then pool token embeddings per chunk.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Semantic Chunking — cutting where the topic changes',
      body: `**Intuition:** instead of cutting every N tokens, read the text and cut where the subject changes, like a good editor inserting section breaks. Embeddings let a program "notice" a topic shift: consecutive sentences about refunds sit close in vector space; the first sentence about shipping jumps away.

**Mechanics (Kamradt-style, as in LangChain's \`SemanticChunker\`):**
1. Split into sentences; optionally group each with its neighbours (a "buffer" of 1) to smooth noise.
2. Embed each sentence group.
3. Compute cosine **distance** between consecutive groups: \`d_i = 1 − cos(e_i, e_{i+1})\`.
4. Mark a breakpoint where \`d_i\` exceeds a threshold. Threshold types: **percentile** (default 95th), standard deviation, interquartile, or gradient.
5. Join sentences between breakpoints into chunks, then enforce **min/max token bounds** (merge tiny chunks, recursively split huge ones).

**Costs and caveats.** One embedding call per sentence group at ingestion (a 10K-sentence corpus = 10K embeddings, cheap with small models). Chunk sizes become uneven. Gains are corpus-dependent: on well-structured documents, recursive or header-based splitting often matches it, and some benchmarks (e.g. Chroma's 2024 study) found modest differences. It shines on **unstructured, topic-hopping text**: transcripts, chat logs, scraped articles without headings.

**When to use it:** when there are no reliable structural seams and your eval shows recursive chunks mixing topics.`,
      example: `Transcript of a support call (8 sentences). Consecutive cosine distances:

| Pair | Distance |
|---|---|
| s1→s2 (refund ↔ refund) | 0.08 |
| s2→s3 | 0.11 |
| s3→s4 (refund → delivery delay) | **0.47** |
| s4→s5 | 0.09 |
| s5→s6 | 0.13 |
| s6→s7 (delivery → password reset) | **0.52** |
| s7→s8 | 0.10 |

95th-percentile threshold ≈ 0.45 → breakpoints after s3 and s6 → chunks: [s1–s3] refund, [s4–s6] delivery, [s7–s8] login. A fixed 3-sentence splitter would have produced [s1–s3], [s4–s6], [s7–s8] only by luck; with 4-sentence windows it mixes refund and delivery.`,
      diagram: `sentences:  s1   s2   s3 │ s4   s5   s6 │ s7   s8
distance:     .08  .11 .47   .09  .13 .52   .10
                        ▲               ▲
threshold (p95 ≈ .45) ──┴───────────────┴──── cut here

           ┌─────────┐ ┌──────────┐ ┌─────────┐
chunks:    │ refund  │ │ delivery │ │ login   │
           └─────────┘ └──────────┘ └─────────┘`,
      code: [
        {
          language: 'typescript',
          title: 'Percentile-breakpoint semantic chunker with size bounds',
          code: `import OpenAI from 'openai';

const openai = new OpenAI();
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-small';

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / Math.sqrt(na * nb);
};

export async function semanticChunks(text: string, percentile = 95, maxChars = 2000) {
  const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
  const sents = [...seg.segment(text)].map((s) => s.segment.trim()).filter(Boolean);
  if (sents.length < 3) return [sents.join(' ')];

  // Buffer of 1: embed each sentence with its neighbours to smooth noise
  const windows = sents.map((_, i) => sents.slice(Math.max(0, i - 1), i + 2).join(' '));
  const { data } = await openai.embeddings.create({ model: EMBED_MODEL, input: windows });
  const vecs = data.map((d) => d.embedding);

  const dist = vecs.slice(0, -1).map((v, i) => 1 - cosine(v, vecs[i + 1]));
  const sorted = [...dist].sort((a, b) => a - b);
  const threshold = sorted[Math.floor((percentile / 100) * (sorted.length - 1))];

  const chunks: string[] = [];
  let cur: string[] = [sents[0]];
  for (let i = 1; i < sents.length; i++) {
    const tooBig = cur.join(' ').length + sents[i].length > maxChars; // hard upper bound
    if (dist[i - 1] > threshold || tooBig) { chunks.push(cur.join(' ')); cur = []; }
    cur.push(sents[i]);
  }
  chunks.push(cur.join(' '));
  return chunks;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Chunks align with topics, so each embedding represents one idea.',
          'Works on text with no headings or formatting (transcripts, chats, scraped pages).',
          'Thresholds are relative (percentile), so they adapt per document.',
        ],
        cons: [
          {
            con: 'One embedding per sentence group adds ingestion cost and latency.',
            fix: 'Use a small, cheap embedding model for breakpoint detection (it does not have to be the retrieval model) and batch requests.',
          },
          {
            con: 'Sizes are uneven: a single long topic becomes a 3,000-token chunk, a short aside a 20-token chunk.',
            fix: 'Enforce min/max token bounds: merge chunks below the minimum into neighbours, recursively split those above the maximum.',
          },
          {
            con: 'Gains over good recursive/structural splitting are often small on well-formatted documents.',
            fix: 'Use structure-aware splitting where structure exists and reserve semantic chunking for unstructured sources; confirm with an eval.',
          },
        ],
      },
      keyPoints: [
        'Cut where cosine distance between neighbouring sentences spikes.',
        'Percentile thresholds (default 95th) adapt to each document.',
        'Always add min/max size bounds.',
        'Best for unstructured, topic-hopping text.',
      ],
      exercise: {
        prompt: `Write a **pure** function \`breakpoints(distances, percentile)\` (no API calls) that returns the indices after which to cut.

Acceptance criteria:
- Threshold = the sorted distances at index \`floor(p / 100 × (n − 1))\` (the rule used by the chunker above).
- Returns indices \`i\` where \`distances[i] > threshold\`.
- For \`[0.08, 0.11, 0.47, 0.09, 0.13, 0.52, 0.10]\` and percentile 80 → \`[2, 5]\`.
- Also write \`applyBreakpoints(sentences, cuts)\` returning the joined chunks.`,
        hints: [
          'Sort a copy of the array; threshold = sorted[floor(p/100 × (n−1))].',
          'A cut at index i means a boundary between sentence i and i+1.',
          'Slice sentences between successive cut indices + 1.',
        ],
        solution: {
          language: 'typescript',
          code: `export function breakpoints(distances: number[], percentile: number): number[] {
  if (!distances.length) return [];
  const sorted = [...distances].sort((a, b) => a - b);
  const threshold = sorted[Math.floor((percentile / 100) * (sorted.length - 1))];
  return distances.flatMap((d, i) => (d > threshold ? [i] : []));
}

export function applyBreakpoints(sentences: string[], cuts: number[]): string[] {
  const out: string[] = [];
  let start = 0;
  for (const c of cuts) {
    out.push(sentences.slice(start, c + 1).join(' '));
    start = c + 1;
  }
  out.push(sentences.slice(start).join(' '));
  return out.filter(Boolean);
}

const d = [0.08, 0.11, 0.47, 0.09, 0.13, 0.52, 0.10];
console.log(breakpoints(d, 80)); // threshold = sorted[4] = 0.13 → [2, 5]
console.log(applyBreakpoints(['s1','s2','s3','s4','s5','s6','s7','s8'], [2, 5]));
// [ 's1 s2 s3', 's4 s5 s6', 's7 s8' ]`,
        },
        explanation:
          'Separating the threshold logic from embedding calls makes it unit-testable and lets you tune the percentile on cached distances without re-embedding.',
      },
      quickCheck: {
        question:
          'You lower the percentile threshold from 95 to 70 in a semantic chunker. What happens?',
        options: [
          'Fewer, larger chunks',
          'More breakpoints, so more and smaller chunks',
          'No change: the threshold only affects embedding quality',
          'Chunks start overlapping',
        ],
        correct: 1,
        explanation:
          'A lower percentile means a lower distance threshold, so more neighbour pairs exceed it and more cuts are made, producing more, smaller chunks.',
      },
      source: 'LangChain docs — SemanticChunker; Greg Kamradt — 5 Levels of Text Splitting',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Structure-Aware Chunking — following headings, sections, tables and code',
      body: `**Intuition:** authors already chunked their document when they wrote headings, sections, list items and functions. Structure-aware chunking reuses that outline instead of guessing.

**Mechanics.**
1. **Parse to structure first** (Markdown from Docling/pymupdf4llm, HTML DOM, unstructured elements, code AST).
2. **Split on structural units:** \`MarkdownHeaderTextSplitter\` on \`#\`, \`##\`, \`###\`; \`HTMLHeaderTextSplitter\` / \`HTMLSectionSplitter\` on \`h1–h3\`; unstructured's \`chunk_by_title\`; code via \`RecursiveCharacterTextSplitter.from_language\` or AST (tree-sitter) on classes and functions.
3. **Carry the breadcrumb:** each chunk gets metadata \`{h1: "Billing", h2: "Refunds", h3: "EU"}\` and, ideally, a text prefix "Billing > Refunds > EU" so the embedding knows where it lives.
4. **Recurse inside large sections** with a recursive splitter; **merge tiny sections** (a heading with one sentence) into the next.
5. **Atomic elements:** tables, code blocks and lists are never split mid-way; huge tables are split by rows with the header repeated.

| Format | Splitter |
|---|---|
| Markdown | MarkdownHeaderTextSplitter → recursive |
| HTML | HTMLHeaderTextSplitter / HTMLSectionSplitter |
| PDF via unstructured | partition → chunk_by_title(max_characters, combine_text_under_n_chars) |
| Code | from_language / tree-sitter functions |

**When to use it:** whenever the source has trustworthy structure: docs sites, wikis, manuals, contracts with numbered clauses, code. It is usually the single biggest chunking upgrade after the recursive baseline.`,
      example: `A docs page in Markdown:

"# Billing\\n## Refunds\\n### EU customers\\nYou may cancel within 14 days…\\n### US customers\\nRefunds within 30 days…"

Recursive 512-token splitting puts "EU" and "US" refund rules in one chunk with no heading, and the query "refund window for EU" retrieves a chunk where 30 days appears first; the model answers 30 days (wrong).

Header splitting yields two chunks:
- \`{h1: Billing, h2: Refunds, h3: EU customers}\` "Billing > Refunds > EU customers: You may cancel within 14 days…"
- \`{h1: Billing, h2: Refunds, h3: US customers}\` "…Refunds within 30 days…"

The EU chunk now scores 0.86 vs 0.71 for the US one, and the answer is 14 days.`,
      diagram: `# Billing
├── ## Invoices ──────────────▶ chunk {h1:Billing,h2:Invoices}
└── ## Refunds
    ├── ### EU customers ─────▶ chunk "Billing > Refunds > EU ..."
    ├── ### US customers ─────▶ chunk "Billing > Refunds > US ..."
    └── ### Policy table ─────▶ atomic table chunk (header kept)
                │ section > max tokens?
                ▼
         recursive split inside section, breadcrumb on every piece`,
      code: [
        {
          language: 'python',
          title: 'Markdown header split → recursive split → breadcrumb prefix',
          code: `from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

headers = [("#", "h1"), ("##", "h2"), ("###", "h3")]
md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers, strip_headers=False)

inner = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base", chunk_size=400, chunk_overlap=40,
    separators=["\\n\\n", "\\n", ". ", " ", ""],
)

def structure_chunks(markdown: str, source: str) -> list[dict]:
    sections = md_splitter.split_text(markdown)      # Documents with h1/h2/h3 metadata
    pieces = inner.split_documents(sections)           # recurse only inside big sections
    out = []
    for i, doc in enumerate(pieces):
        path = " > ".join(doc.metadata[k] for k in ("h1", "h2", "h3") if k in doc.metadata)
        out.append({
            "id": f"{source}#{i}",
            # Breadcrumb in the text so the embedding "knows" where the chunk lives
            "text": f"{path}\\n\\n{doc.page_content}" if path else doc.page_content,
            "metadata": {**doc.metadata, "source": source, "section_path": path, "chunk_index": i},
        })
    return out

md = "# Billing\\n## Refunds\\n### EU customers\\nYou may cancel within 14 days.\\n### US customers\\nRefunds within 30 days."
for c in structure_chunks(md, "billing.md"):
    print(c["metadata"]["section_path"], "|", c["text"][:60].replace("\\n", " "))`,
        },
      ],
      prosCons: {
        pros: [
          'Chunks match the author\'s logical units, so each one answers a coherent question.',
          'Heading breadcrumbs disambiguate similar text in different sections (EU vs US rules).',
          'Section metadata enables filtering ("only search the API reference") and better citations.',
        ],
        cons: [
          {
            con: 'Depends on parse quality: PDFs converted without headings give it nothing to follow.',
            fix: 'Use a layout-aware parser (Docling, unstructured hi_res) to recover headings, and fall back to recursive or semantic chunking when no headings are detected.',
          },
          {
            con: 'Sections vary from one line to thousands of tokens.',
            fix: 'Merge sections under a minimum size into their neighbour and recursively split those above the maximum, repeating the breadcrumb on every piece.',
          },
          {
            con: 'Large tables or code blocks may exceed the chunk limit even as atomic units.',
            fix: 'Split tables by row groups with the header row repeated, and code by function/class via AST, keeping the file path and signature in each piece.',
          },
        ],
      },
      keyPoints: [
        'Split on headings/sections first, then recurse inside large ones.',
        'Put the heading path in metadata and in the chunk text.',
        'Keep tables, code blocks and lists atomic.',
        'Biggest upgrade over recursive splitting when structure is reliable.',
      ],
      exercise: {
        prompt: `Write a TypeScript \`splitMarkdownByHeaders(md, maxLevel)\` without libraries.

Acceptance criteria:
- Tracks the current heading path for levels 1..\`maxLevel\` (a new \`##\` resets deeper levels).
- Emits \`{ path: string[], text: string }\` for each section with non-empty body.
- Lines inside fenced code blocks (lines starting with three backticks toggle the state) are never treated as headings.
- Example: "# A\\nx\\n## B\\ny\\n# C\\nz" → paths [A], [A,B], [C].`,
        hints: [
          'Match headings with /^(#{1,6})\\s+(.*)$/ and compare the level to maxLevel.',
          'path = path.slice(0, level − 1) then push the new title.',
          'Keep a boolean inFence toggled by lines that start with the fence marker.',
        ],
        solution: {
          language: 'typescript',
          code: `type Section = { path: string[]; text: string };
const FENCE = '\\u0060\\u0060\\u0060'; // three backticks

export function splitMarkdownByHeaders(md: string, maxLevel = 3): Section[] {
  const out: Section[] = [];
  let path: string[] = [];
  let body: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = body.join('\\n').trim();
    if (text) out.push({ path: [...path], text });
    body = [];
  };

  for (const line of md.split('\\n')) {
    if (line.trimStart().startsWith(FENCE)) inFence = !inFence;
    const m = !inFence ? line.match(/^(#{1,6})\\s+(.*)$/) : null;
    if (m && m[1].length <= maxLevel) {
      flush();
      const level = m[1].length;
      path = [...path.slice(0, level - 1), m[2].trim()]; // reset deeper levels
    } else {
      body.push(line);
    }
  }
  flush();
  return out;
}

console.log(splitMarkdownByHeaders('# A\\nx\\n## B\\ny\\n# C\\nz'));
// [ {path:['A'],text:'x'}, {path:['A','B'],text:'y'}, {path:['C'],text:'z'} ]`,
        },
        explanation:
          'Slicing the path to level − 1 implements heading hierarchy correctly, and fence tracking prevents "# comment" lines in Python or shell snippets from being mistaken for headings, a classic bug in naive Markdown splitters.',
      },
      quickCheck: {
        question:
          'Two sections ("EU refunds" and "US refunds") have nearly identical wording except the number of days. What most improves retrieval of the right one?',
        options: [
          'Larger chunk overlap',
          'Splitting by headers and prefixing each chunk with its heading path',
          'A higher-dimensional embedding model',
          'Lowering top-k to 1',
        ],
        correct: 1,
        explanation:
          'The heading path injects the distinguishing word (EU vs US) into each chunk\'s text and metadata, so the query matches the right section. Overlap and bigger embeddings do not add the missing signal.',
      },
      source: 'LangChain docs — MarkdownHeaderTextSplitter; Unstructured docs — chunk_by_title',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Parent-Child Chunking — search small, answer big',
      body: `**Intuition:** small chunks are like index entries: precise to find. Large chunks are like book pages: useful to read. Parent-child chunking keeps both: you search the index entries and hand the model the page they point to.

**Mechanics.**
1. Split each document into **parents** (a section, or 1,000–2,000 tokens).
2. Split each parent into **children** (100–300 tokens, or single sentences).
3. Embed and index **only children**, each with \`parent_id\` in metadata.
4. Store parent text once in a **docstore** (Postgres table, Redis, S3) keyed by \`parent_id\`.
5. At query time: retrieve top-k children → collect distinct \`parent_id\`s → fetch parents → send parents (deduplicated, in rank order) to the LLM.

Variants: **three levels** (LlamaIndex \`HierarchicalNodeParser\` with sizes like 2048/512/128 plus \`AutoMergingRetriever\`, which swaps children for their parent when enough siblings are retrieved); **sentence-window** (child = one sentence, parent = ±k sentences). The retrieval-side mechanics are covered in the Advanced Retrieval topic; here the focus is building the hierarchy at ingestion.

**Sizing the trade-off:** children must be small enough to match specific questions but not so small that they lose meaning; parents must fit the prompt budget: \`k_parents × parent_tokens\` ≤ context budget.

**When to use it:** long documents where questions are specific but answers need surrounding context: contracts, manuals, research papers, policy handbooks.`,
      example: `Employee handbook, 120 pages. Parents = sections (avg 1,400 tokens, 180 parents). Children = 200 tokens (avg 7 per parent, 1,260 children).

Query: "Can I carry over unused vacation days?"
- Child hits: #c-0412 (score 0.88, "Up to 5 unused days may be carried over…"), #c-0413 (0.81), #c-0981 (0.64, sick leave).
- Parents: c-0412 and c-0413 both belong to p-059 "Vacation Policy" → deduplicated → [p-059, p-140].
- Prompt gets 2 parents ≈ 2,800 tokens, including the clause after the hit: "…unless your manager approves an exception in writing."

With plain 200-token chunks the model would have seen the rule but not the exception.`,
      diagram: `            Parent p-059 "Vacation Policy" (1,400 tok)  → docstore
   ┌──────────┬──────────┬──────────┬──────────┬───────┐
   │ c-0410   │ c-0411   │ c-0412   │ c-0413   │ ...   │ → vector index
   └──────────┴──────────┴────▲─────┴────▲─────┴───────┘   (children only)
                              │ hit      │ hit
query ──▶ top-k children ─────┴──────────┘
                │ distinct parent_ids
                ▼
        fetch p-059 from docstore ──▶ LLM context`,
      code: [
        {
          language: 'typescript',
          title: 'Building parents and children at ingestion (pgvector)',
          code: `import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import OpenAI from 'openai';
import pg from 'pg';
import { toSql } from 'pgvector';

const openai = new OpenAI();
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// ~4 chars/token: 6,000 chars ≈ 1,500 tokens; 800 chars ≈ 200 tokens
const parentSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 6000, chunkOverlap: 0 });
const childSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 100 });

export async function indexDocument(source: string, text: string) {
  const parents = await parentSplitter.splitText(text);
  for (const [pi, parentText] of parents.entries()) {
    const parentId = source + '#p' + pi;
    // Parent stored once, NOT embedded
    await db.query(
      'INSERT INTO parents (id, source, text) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text',
      [parentId, source, parentText],
    );
    const children = await childSplitter.splitText(parentText);
    const { data } = await openai.embeddings.create({ model: 'text-embedding-3-small', input: children });
    for (const [ci, childText] of children.entries()) {
      await db.query(
        'INSERT INTO children (id, parent_id, text, embedding) VALUES ($1, $2, $3, $4) ' +
          'ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding',
        [parentId + '-c' + ci, parentId, childText, toSql(data[ci].embedding)],
      );
    }
  }
}

// Query side (brief): top children → distinct parents, rank order preserved
export const parentQuery =
  'SELECT p.id, p.text, max(1 - (c.embedding <=> $1)) AS score FROM children c ' +
  'JOIN parents p ON p.id = c.parent_id GROUP BY p.id, p.text ORDER BY score DESC LIMIT $2';`,
        },
      ],
      prosCons: {
        pros: [
          'Precise matching from small children plus full context from parents.',
          'Parents are stored once, so context size grows without multiplying embeddings.',
          'Retrieved context keeps qualifiers, definitions and exceptions near the hit.',
        ],
        cons: [
          {
            con: 'Large parents can blow the prompt budget when several are retrieved.',
            fix: 'Cap the number of distinct parents (e.g. 3), size parents to fit k × parent_tokens ≤ budget, or trim parents to a window around the hit children.',
          },
          {
            con: 'Several children from one parent waste top-k slots and reduce diversity.',
            fix: 'Retrieve more children (k = 20–30), group by parent_id and keep the best score per parent before choosing the final parents.',
          },
          {
            con: 'Two stores (vectors + docstore) can drift out of sync on updates and deletes.',
            fix: 'Write parents and children in one transaction (same Postgres database) or delete-by-source in both stores as one idempotent job.',
          },
        ],
      },
      keyPoints: [
        'Index children (100–300 tokens); return parents (section or 1–2K tokens).',
        'Children carry parent_id; parents live in a docstore and are not embedded.',
        'Group hits by parent and keep the best score per parent.',
        'Size parents against the prompt budget.',
      ],
      exercise: {
        prompt: `Write \`selectParents(hits, maxParents)\` that turns child hits into a ranked, deduplicated parent list.

Acceptance criteria:
- \`hits\` is \`{ childId, parentId, score }[]\` (already sorted by score desc, but don't rely on it).
- Parent score = max child score; also return \`hitCount\` (number of children that matched).
- Sort by score desc, tie-break by hitCount desc; return at most \`maxParents\`.`,
        starter: {
          language: 'typescript',
          code: `type Hit = { childId: string; parentId: string; score: number };
type ParentPick = { parentId: string; score: number; hitCount: number };

export function selectParents(hits: Hit[], maxParents: number): ParentPick[] {
  // TODO: group by parentId, keep max score and count hits
  // TODO: sort and slice
  return [];
}`,
        },
        hints: [
          'A Map<string, ParentPick> accumulates per parent.',
          'score = Math.max(existing.score, hit.score).',
          'Sort with (a, b) => b.score - a.score || b.hitCount - a.hitCount.',
        ],
        solution: {
          language: 'typescript',
          code: `type Hit = { childId: string; parentId: string; score: number };
type ParentPick = { parentId: string; score: number; hitCount: number };

export function selectParents(hits: Hit[], maxParents: number): ParentPick[] {
  const byParent = new Map<string, ParentPick>();
  for (const h of hits) {
    const p = byParent.get(h.parentId);
    if (p) {
      p.score = Math.max(p.score, h.score);
      p.hitCount += 1;
    } else {
      byParent.set(h.parentId, { parentId: h.parentId, score: h.score, hitCount: 1 });
    }
  }
  return [...byParent.values()]
    .sort((a, b) => b.score - a.score || b.hitCount - a.hitCount)
    .slice(0, maxParents);
}

console.log(selectParents([
  { childId: 'c412', parentId: 'p059', score: 0.88 },
  { childId: 'c413', parentId: 'p059', score: 0.81 },
  { childId: 'c981', parentId: 'p140', score: 0.64 },
], 3));
// [ {parentId:'p059',score:0.88,hitCount:2}, {parentId:'p140',score:0.64,hitCount:1} ]`,
        },
        explanation:
          'Grouping prevents one parent from occupying several slots, and the hit count is a useful secondary signal: a parent matched by many children is usually highly relevant.',
      },
      quickCheck: {
        question: 'In parent-child chunking, which text is embedded into the vector index?',
        options: [
          'Only the parents',
          'Only the children; parents are fetched by id after retrieval',
          'Both, concatenated into one vector',
          'Neither; parents are found with BM25',
        ],
        correct: 1,
        explanation:
          'Children are embedded for precise matching; parents sit in a docstore and are looked up through the parent_id carried by each child.',
      },
      source: 'LangChain docs — ParentDocumentRetriever; LlamaIndex docs — HierarchicalNodeParser',
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'Contextual Chunking — prepending document context to every chunk',
      body: `**Intuition:** a chunk that says "The company's revenue grew 3% over the previous quarter" is useless on its own: which company, which quarter? Contextual chunking asks an LLM, which can see the whole document, to write a one-to-two sentence label for each chunk, like a librarian annotating index cards.

**Mechanics (Anthropic's Contextual Retrieval, ingestion side):**
1. For each chunk, send the **whole document** plus the chunk to a small, cheap model with a prompt like: *"Here is the document… Here is the chunk… Give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval. Answer only with the succinct context."*
2. The model returns **50–100 tokens** of context, e.g. "From ACME's Q2 2023 SEC filing; previous quarter revenue was $314M."
3. **Prepend** the context to the chunk and use the combined text for **both** the embedding and the BM25 index; keep the original chunk for display.
4. Use **prompt caching**: the document is the cached prefix, so each extra chunk only pays for the chunk and the output. Anthropic estimated **~$1.02 per 1M document tokens** (800-token chunks, 8K-token docs).

**Reported results** (top-20 retrieval failure rate): baseline 5.7% → **3.7%** with contextual embeddings (−35%) → **2.9%** adding contextual BM25 (−49%) → **1.9%** with reranking (−67%). Query-time fusion and reranking belong to the Contextual Retrieval topic.

**Alternative:** *late chunking* (Jina) embeds the whole document with a long-context embedding model, then mean-pools token vectors per chunk, so chunk vectors carry document context without an LLM call.

**When to use it:** corpora full of chunks that rely on context (financial reports, contracts, multi-part manuals), once the basics are tuned.`,
      example: `Chunk (from a 9K-token 10-Q): "Revenue increased 3% over the previous quarter, driven by subscription growth."

Generated context (62 tokens): "This chunk is from ACME Corp's Q2 2023 10-Q, section 'Results of Operations', describing Q2 revenue versus Q1 2023 ($314M)."

Embedded text = context + "\\n\\n" + chunk.

Query: "ACME revenue growth Q2 2023"
- Plain chunk: cosine 0.41 (no company, no quarter) → rank 37, missed in top-20.
- Contextualised chunk: cosine 0.79 → rank 2. BM25 now also matches "ACME" and "Q2 2023".

Cost for this document: 12 chunks × (9K cached doc read + 800 chunk + 60 output tokens), and with caching the 9K prefix is billed at a fraction of the normal input price after the first chunk.`,
      diagram: `             whole document (cached prefix)
                 ┌──────────────────────┐
 chunk_i ──────▶ │ small LLM            │──▶ "From ACME Q2 2023 10-Q;
                 │ "situate this chunk" │      compares to Q1 $314M"
                 └──────────────────────┘           (50–100 tok)
                                                      │
              context + chunk_i  ◀────────────────────┘
                 │                 │
                 ▼                 ▼
          embedding index      BM25 index        original chunk kept
                                                  for display/citation`,
      code: [
        {
          language: 'typescript',
          title: 'Contextualise chunks with Claude and prompt caching',
          code: `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.CONTEXT_MODEL ?? 'claude-haiku-4-5';

export async function contextualise(docText: string, chunks: string[]) {
  const out: { context: string; chunk: string; indexed: string }[] = [];
  for (const chunk of chunks) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: '<document>\\n' + docText + '\\n</document>',
            cache_control: { type: 'ephemeral' }, // same prefix for every chunk → cache hits
          },
          {
            type: 'text',
            text:
              'Here is the chunk we want to situate within the whole document\\n<chunk>\\n' + chunk +
              '\\n</chunk>\\nPlease give a short succinct context to situate this chunk within the overall ' +
              'document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.',
          },
        ],
      }],
    });
    const context = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    // usage.cache_read_input_tokens > 0 on chunks 2..n confirms caching works
    out.push({ context, chunk, indexed: context + '\\n\\n' + chunk }); // embed + BM25 the 'indexed' text
  }
  return out;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Restores missing entities, dates and section context, the most common cause of retrieval misses.',
          'Large, published gains: −35% failures for embeddings alone, −49% with contextual BM25.',
          'Cheap with prompt caching (~$1 per 1M document tokens) and done once at ingestion.',
        ],
        cons: [
          {
            con: 'One LLM call per chunk adds ingestion latency and cost, and re-runs on every document change.',
            fix: 'Use a small model, prompt caching on the document prefix, batch/async processing, and cache contexts by (chunk hash, doc hash).',
          },
          {
            con: 'Documents longer than the model context (or very large) cannot be sent whole.',
            fix: 'Send the section plus a document summary and table of contents instead of the full text, or use late chunking with a long-context embedding model.',
          },
          {
            con: 'The LLM can write wrong or speculative context that misleads retrieval.',
            fix: 'Use temperature 0, instruct it to use only facts from the document, keep the original chunk for display, and spot-check contexts on a sample.',
          },
        ],
      },
      keyPoints: [
        'An LLM writes 50–100 tokens situating each chunk in its document.',
        'Prepend context for both embedding and BM25; display the original chunk.',
        'Prompt caching on the document makes it ~$1 per 1M doc tokens.',
        'Reported failure reduction: 35% (embeddings), 49% (+BM25), 67% (+rerank).',
      ],
      exercise: {
        prompt: `Write \`buildContextBatchRequests(docId, docText, chunks)\` that returns request objects for the **Anthropic Message Batches API** (50% cheaper, async), one per chunk.

Acceptance criteria:
- Each item is \`{ custom_id, params }\` with \`custom_id = docId + "-" + index\`.
- \`params\` is a valid Messages request: model from env, max_tokens 150, a cached document block, and the situate-this-chunk instruction.
- Throws if any chunk is empty.`,
        hints: [
          'Batch items look like { custom_id: string, params: { model, max_tokens, messages } }.',
          'Put cache_control on the document block so all requests in the batch share the prefix.',
          'Validate with chunks.some(c => !c.trim()).',
        ],
        solution: {
          language: 'typescript',
          code: `const MODEL = process.env.CONTEXT_MODEL ?? 'claude-haiku-4-5';

const INSTRUCTION =
  'Please give a short succinct context to situate this chunk within the overall document ' +
  'for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.';

export function buildContextBatchRequests(docId: string, docText: string, chunks: string[]) {
  if (chunks.some((c) => !c.trim())) throw new Error('empty chunk in ' + docId);
  return chunks.map((chunk, i) => ({
    custom_id: docId + '-' + i, // used to match results back to chunks
    params: {
      model: MODEL,
      max_tokens: 150,
      messages: [{
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: '<document>\\n' + docText + '\\n</document>', cache_control: { type: 'ephemeral' as const } },
          { type: 'text' as const, text: '<chunk>\\n' + chunk + '\\n</chunk>\\n' + INSTRUCTION },
        ],
      }],
    },
  }));
}

// Usage: await client.messages.batches.create({ requests: buildContextBatchRequests('10q-2023q2', doc, chunks) });`,
        },
        explanation:
          'Contextualisation is offline work, so the batch API is a natural fit: half price, no rate-limit juggling, and custom_id maps each result back to its chunk.',
      },
      quickCheck: {
        question:
          'After contextualising chunks you embed the context+chunk text but keep BM25 on the raw chunk. What do you lose?',
        options: [
          'Nothing; BM25 cannot benefit from context',
          'Exact-term matches on entities and dates that only appear in the generated context',
          'The ability to rerank',
          'Prompt caching',
        ],
        correct: 1,
        explanation:
          'Keyword search benefits as much as embeddings: words like "ACME" or "Q2 2023" added by the context let BM25 match. Anthropic\'s results improved further (−35% → −49% failures) when BM25 also used the contextualised text.',
      },
      source: 'Anthropic Engineering — Introducing Contextual Retrieval (2024)',
    },
  ],
  codeChallenges: [
    {
      id: 'advanced-chunking-cc-1',
      title: 'Header splitter that loses context and breaks code blocks',
      context:
        'A docs-site RAG splits Markdown on lines starting with "#". Python snippets containing "# comment" lines create bogus sections, and chunks have no idea which page or section they came from.',
      task: 'Rewrite the splitter to respect fenced code blocks, keep a heading hierarchy, prefix each chunk with its breadcrumb, and cap section size by recursing into large sections.',
      starter: {
        language: 'python',
        code: `def split(md: str):
    chunks, cur = [], []
    for line in md.splitlines():
        if line.startswith("#"):
            if cur:
                chunks.append("\\n".join(cur))
            cur = []
        cur.append(line)
    chunks.append("\\n".join(cur))
    return chunks`,
      },
      hints: [
        'Track a boolean in_fence toggled by lines starting with three backticks.',
        'A heading needs "#" characters followed by a space: re.match(r"^(#{1,6})\\s+(.*)", line).',
        'Keep a path list; on a level-n heading, truncate the path to n−1 and append.',
      ],
      solution: {
        language: 'python',
        code: `import re
from langchain_text_splitters import RecursiveCharacterTextSplitter

FENCE = "\\u0060" * 3  # three backticks
inner = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base", chunk_size=400, chunk_overlap=40,  # default encoder is gpt2
)

def split(md: str, source: str, max_level: int = 3) -> list[dict]:
    sections, path, body, in_fence = [], [], [], False

    def flush():
        text = "\\n".join(body).strip()
        if text:
            sections.append((list(path), text))
        body.clear()

    for line in md.splitlines():
        if line.lstrip().startswith(FENCE):
            in_fence = not in_fence
        m = None if in_fence else re.match(r"^(#{1,6})\\s+(.*)", line)
        if m and len(m.group(1)) <= max_level:
            flush()
            level = len(m.group(1))
            path[:] = path[: level - 1] + [m.group(2).strip()]
        else:
            body.append(line)
    flush()

    chunks = []
    for sec_path, text in sections:
        crumb = " > ".join(sec_path)
        for piece in inner.split_text(text):   # recurse only when a section is too big
            chunks.append({
                "id": f"{source}#{len(chunks)}",
                "text": f"{crumb}\\n\\n{piece}" if crumb else piece,
                "metadata": {"source": source, "section_path": crumb},
            })
    return chunks`,
      },
      explanation:
        'The fix distinguishes real headings from code comments, preserves hierarchy, injects the breadcrumb into the embedded text, and bounds chunk size. Code blocks may still be split by the inner splitter only if one section is larger than the limit; raising the limit for code-heavy pages or splitting code by function avoids that.',
      followUps: [
        {
          q: 'Why put the breadcrumb in the text and not only in metadata?',
          a: 'Embeddings and BM25 only see the text; metadata helps filtering and citations but does not change the vector, so the breadcrumb must be in the indexed text to affect matching.',
        },
        {
          q: 'How do you avoid splitting a long code block in half?',
          a: 'Treat fenced blocks as atomic units when merging; if one exceeds the limit, split it by function/class with tree-sitter and repeat the file path and signature in each piece.',
        },
      ],
    },
    {
      id: 'advanced-chunking-cc-2',
      title: 'Contextualiser that costs 20× too much and hallucinates context',
      context:
        'A job generates context for every chunk by sending the full document each time without caching, at temperature 1, with a vague prompt, and replaces the chunk text with the model output.',
      task: 'Fix cost (caching/batching), determinism, prompt quality, and data handling (keep the original chunk, store context separately, skip unchanged chunks).',
      starter: {
        language: 'typescript',
        code: `export async function addContext(client: any, doc: string, chunks: string[]) {
  return Promise.all(chunks.map(async (c) => {
    const r = await client.messages.create({
      model: 'claude-opus-latest', max_tokens: 1024, temperature: 1,
      messages: [{ role: 'user', content: 'Document: ' + doc + ' Chunk: ' + c + ' Improve this chunk.' }],
    });
    return r.content[0].text; // replaces chunk
  }));
}`,
      },
      hints: [
        'Put the document in its own content block with cache_control so chunks 2..n read it from cache.',
        'Use a small model, temperature 0, max_tokens ~150 and the "situate this chunk" instruction.',
        'Return { chunk, context, indexed } and key a cache on hash(doc) + hash(chunk).',
      ],
      solution: {
        language: 'typescript',
        code: `import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import pLimit from 'p-limit';

const client = new Anthropic();
const MODEL = process.env.CONTEXT_MODEL ?? 'claude-haiku-4-5';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const limit = pLimit(4); // bounded concurrency; first call warms the cache

export async function addContext(doc: string, chunks: string[], cache: Map<string, string>) {
  const docHash = sha(doc);
  const docBlock = { type: 'text' as const, text: '<document>\\n' + doc + '\\n</document>', cache_control: { type: 'ephemeral' as const } };

  const one = async (chunk: string) => {
    const key = docHash + ':' + sha(chunk);
    let context = cache.get(key);
    if (!context) {
      const r = await client.messages.create({
        model: MODEL, max_tokens: 150, temperature: 0,
        messages: [{ role: 'user', content: [docBlock, { type: 'text', text:
          '<chunk>\\n' + chunk + '\\n</chunk>\\nGive a short succinct context (1-2 sentences) that situates this chunk ' +
          'within the document to improve search retrieval. Use only facts stated in the document. Answer only with the context.' }] }],
      });
      context = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      cache.set(key, context);
    }
    return { chunk, context, indexed: context + '\\n\\n' + chunk }; // original chunk kept for display
  };

  const [first, ...rest] = chunks;
  if (first === undefined) return [];
  const head = await one(first);             // write the cache before fanning out
  return [head, ...(await Promise.all(rest.map((c) => limit(() => one(c)))))];
}`,
      },
      explanation:
        'Caching the document prefix turns n full-document reads into one write plus n cheap cache reads; a small model at temperature 0 with a precise prompt yields short, grounded context; the original chunk is preserved; and a content-hash cache skips unchanged chunks on re-ingestion.',
      followUps: [
        {
          q: 'Why make the first request before starting the parallel calls?',
          a: 'The cache entry is created by the first request; firing all calls at once means many of them miss the cache and pay full price for the document.',
        },
        {
          q: 'When would you prefer the Message Batches API here?',
          a: 'For large backfills where latency does not matter: batches are ~50% cheaper and avoid rate-limit management, at the cost of results arriving asynchronously.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'advanced-chunking-iq-1',
      difficulty: 'medium',
      question: 'Compare semantic chunking with structure-aware chunking. When would you pick each?',
      whatInterviewerLooksFor: [
        'Accurate mechanics of both',
        'Cost and determinism differences',
        'Picks based on whether the source has reliable structure',
        'Mentions size bounds and evaluation',
      ],
      modelAnswer: `**Semantic chunking** embeds sentences (often with a neighbour buffer), measures distance between consecutive ones and cuts at spikes above a percentile threshold. It discovers topic boundaries from content.

**Structure-aware chunking** follows boundaries the author created: headings, HTML sections, list items, table and code units. It carries the heading path as metadata and text prefix.

| | Semantic | Structure-aware |
|---|---|---|
| Needs | Embeddings per sentence | A parser that recovers structure |
| Cost | Extra embedding calls | Nearly free once parsed |
| Determinism | Depends on model + threshold | Fully deterministic |
| Best on | Transcripts, chats, scraped prose | Docs, wikis, manuals, contracts, code |
| Risks | Uneven sizes, noisy breaks | Bad parses, giant sections |

**My default:** structure-aware first whenever headings exist, with recursive splitting inside big sections and the breadcrumb prefixed. Semantic chunking for sources without structure, or inside very long sections that mix topics. In both cases enforce min/max token bounds and check the choice against an eval set; semantic chunking does not always beat a good recursive baseline.`,
      followUps: [
        {
          q: 'Can you combine them?',
          a: 'Yes: split by headings first, then apply semantic breakpoints only within sections that exceed the max size, which keeps structure and adds topic-aware cuts where needed.',
        },
        {
          q: 'Which embedding model would you use for breakpoint detection?',
          a: 'A small, cheap model is usually enough because only relative distances between neighbours matter; it does not have to match the retrieval model.',
        },
      ],
      pitfalls: [
        'Claiming semantic chunking is always better',
        'Forgetting size bounds',
      ],
    },
    {
      id: 'advanced-chunking-iq-2',
      difficulty: 'hard',
      question:
        'Design the parent-child chunking scheme for a 50K-contract repository where lawyers ask clause-level questions but need full-clause context.',
      whatInterviewerLooksFor: [
        'Chooses parents by legal structure (clause/section) rather than fixed tokens',
        'Sensible child sizing',
        'Storage and consistency design',
        'Prompt budget and deduplication at query time',
      ],
      modelAnswer: `**Parents = clauses**, not fixed windows. Contracts have numbered structure (1, 1.1, 1.1(a)). After layout-aware parsing I build a clause tree and make each top-level clause (or sub-clause if > ~1,500 tokens) a parent, with metadata \`{contract_id, party, effective_date, clause_number, clause_title}\`.

**Children = sentences or 100–200-token windows** within a clause, each prefixed with the clause path ("Section 9 Termination > 9.2") so the embedding knows the context, and carrying \`parent_id\`.

**Storage**
- Postgres: \`parents(id, contract_id, clause_number, text)\` and \`children(id, parent_id, text, embedding vector)\` in the same database so ingestion updates both in one transaction.
- Delete-by-contract when a contract is amended; amendments become new parents with \`supersedes\` metadata.

**Query time (light)**
- Retrieve top-30 children with metadata filters (contract, party), group by \`parent_id\`, keep best score per parent, return the top 3–5 clauses.
- Budget: 5 clauses × ~800 tokens = 4K tokens.
- Cite clause numbers from parent metadata.

**Evaluation:** clause-retrieval recall@5 on lawyer-written questions, plus a check that answers include exceptions/provisos, which is the failure parent-child exists to fix.`,
      followUps: [
        {
          q: 'A clause is 6,000 tokens long. What now?',
          a: 'Make its sub-clauses the parents, or trim the parent to a window around the matched children while keeping the clause header, so the prompt stays within budget.',
        },
        {
          q: 'How do you handle definitions referenced across the contract?',
          a: 'Extract the definitions section once and attach the definitions used in a clause as extra context (or metadata) when that clause is returned.',
        },
      ],
      pitfalls: [
        'Using fixed token parents that cut clauses mid-way',
        'Storing parents in a separate system with no consistency plan',
        'Returning many duplicate parents',
      ],
    },
    {
      id: 'advanced-chunking-iq-3',
      difficulty: 'hard',
      question: 'Explain contextual chunking as described by Anthropic. What does it cost, what does it buy, and what are its limits?',
      whatInterviewerLooksFor: [
        'Correct mechanism: LLM-generated 50–100 token context prepended before embedding and BM25',
        'Cost reasoning with prompt caching',
        'Reported numbers',
        'Limits and alternatives (late chunking)',
      ],
      modelAnswer: `**Mechanism.** Chunks lose context: "Revenue grew 3% over the previous quarter" lacks company and period. For each chunk, a small model receives the whole document plus the chunk and writes a 50–100-token "situating" context. That context is prepended to the chunk for **both** the embedding index and the BM25 index; the original chunk is still what users see.

**Cost.** One LLM call per chunk, but the document is the same prefix for all its chunks, so prompt caching makes it cheap. Anthropic estimated about **$1.02 per million document tokens** (800-token chunks, 8K-token documents). A 100M-token corpus is roughly $100 one-off plus some ingestion latency. The Batch API halves it further.

**What it buys (Anthropic's evaluation, top-20 failure rate):** 5.7% → 3.7% with contextual embeddings (−35%), → 2.9% with contextual BM25 too (−49%), → 1.9% with reranking (−67%).

**Limits**
- Documents that do not fit the model context need a summary/TOC or section-level context instead.
- Re-contextualise when documents change (cache by doc+chunk hash).
- The model can add wrong context; use temperature 0 and "only facts from the document".
- Index size grows ~10–15% (100 extra tokens per 800-token chunk).

**Alternative:** late chunking embeds the full document with a long-context embedding model and pools token embeddings per chunk, giving context-aware vectors without LLM calls, but no BM25 benefit.`,
      followUps: [
        {
          q: 'Is contextual chunking useful for a corpus of short, self-contained FAQs?',
          a: 'Little: each FAQ already carries its own context, so the gain is small; spend effort on hybrid search or reranking instead.',
        },
        {
          q: 'How would you measure the improvement on your data?',
          a: 'Run the same eval set for retrieval recall@20 (or failure rate) with and without contexts, for embeddings only and for hybrid BM25+embeddings, keeping chunking identical.',
        },
      ],
      pitfalls: [
        'Replacing the chunk with the generated context',
        'Forgetting to apply the context to BM25',
        'Not using prompt caching and overpaying ~10×',
      ],
    },
    {
      id: 'advanced-chunking-iq-4',
      difficulty: 'medium',
      question: 'A Markdown docs site has pages where one "##" section is 7,000 tokens and others are 30 tokens. How do you chunk it?',
      whatInterviewerLooksFor: [
        'Header-first splitting',
        'Recursive split for oversized sections with repeated breadcrumb',
        'Merging tiny sections',
        'Atomic code blocks and tables',
      ],
      modelAnswer: `**Step 1: split on headings** (\`#\`, \`##\`, \`###\`) with a fence-aware splitter so comments in code blocks are not mistaken for headings. Each section gets a breadcrumb \`Page > Section > Subsection\`.

**Step 2: handle the giant section (7,000 tokens)**
- First try deeper structure: \`###\`/\`####\` headings, then list items or paragraphs.
- Then a recursive token splitter (e.g. 400–500 tokens, ~10% overlap) inside the section.
- Repeat the breadcrumb at the top of every piece so "Configuration > Environment variables" stays attached to each chunk.
- Keep code blocks and tables atomic; split huge tables by row groups with the header repeated.

**Step 3: handle tiny sections (30 tokens)**
- Merge with the next sibling (or the parent intro) until a minimum (e.g. 100 tokens) is reached, combining breadcrumbs ("Install > macOS; Install > Linux").
- Alternatively attach them to the parent section as context.

**Step 4: metadata** \`{url, section_path, heading_level, chunk_index}\` for citations ("see Install > Linux") and optional filters.

**Step 5: evaluate** with questions targeting both the giant section and the small ones.`,
      followUps: [
        {
          q: 'Why not just recursive-split the whole page?',
          a: 'You would lose the section boundaries and breadcrumbs, mixing unrelated sections in one chunk and making answers and citations less precise.',
        },
        {
          q: 'Where would parent-child help here?',
          a: 'Make the 7,000-token section a parent and its 400-token pieces children, so a precise hit can expand to the whole section when the question needs it, within budget.',
        },
      ],
      pitfalls: [
        'Splitting on every line beginning with "#"',
        'Leaving 30-token chunks that embed poorly',
      ],
    },
    {
      id: 'advanced-chunking-iq-5',
      difficulty: 'expert',
      question:
        'You have budget for one advanced chunking upgrade on a mixed corpus (PDF reports, Markdown docs, call transcripts). How do you decide which one, and roll it out?',
      whatInterviewerLooksFor: [
        'Failure analysis before choosing a technique',
        'Maps techniques to failure types',
        'Per-source routing',
        'Measured rollout with eval and cost tracking',
      ],
      modelAnswer: `**1. Diagnose failures, don't pick a technique first.** Take 100 failed or low-rated questions and label why retrieval failed:
- *Chunk lacks entity/date context* ("the company", "this quarter") → **contextual chunking**.
- *Answer needs surrounding text/exceptions* → **parent-child**.
- *Chunk mixes sections; heading lost* → **structure-aware**.
- *Topic-hopping transcripts* → **semantic chunking**.

**2. Map to sources.** Typically: PDF reports suffer from missing context (tables and paragraphs referring to "the period"); Markdown docs suffer from lost headings; transcripts from topic mixing.

**3. Pick by expected impact × cost.** If 45% of failures are missing context in reports, contextual chunking on reports alone is the upgrade (~$1/1M tokens with caching, one-off). Structure-aware splitting is nearly free, so it is often worth doing alongside.

**4. Roll out safely**
- Build the new index for one source in parallel (shadow index), keep chunk ids stable.
- Compare recall@k, MRR and answer correctness on the eval set for that source and overall.
- A/B online (thumbs-up rate, citation clicks) before switching traffic.
- Track ingestion cost/latency and index size changes.

**5. Iterate:** re-run failure labelling after the change; the dominant failure type usually shifts, which tells you the next upgrade.`,
      followUps: [
        {
          q: 'How do you label failure reasons at scale?',
          a: 'Use an LLM judge with a fixed taxonomy on (question, gold passage, retrieved chunks), then hand-check a sample to calibrate it.',
        },
        {
          q: 'What if the gains are within noise?',
          a: 'Increase the eval set size, look at per-source slices where the effect should concentrate, and only ship changes that are significant or clearly cheaper.',
        },
      ],
      pitfalls: [
        'Applying every technique to every source',
        'Rolling out without a shadow index and eval',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'advanced-chunking-est-1',
      question: 'What does contextual chunking cost for a 40M-token corpus, with and without prompt caching?',
      assumptions: [
        'Average document 8,000 tokens → 5,000 documents; chunks 800 tokens → 10 chunks/doc, 50,000 chunks',
        'Each call: document (8,000) + chunk & instruction (~850) input, 80 output tokens',
        'Illustrative small-model prices: input $1/1M, output $5/1M, cache write 1.25× input, cache read 0.1× input',
      ],
      steps: [
        { label: 'No caching: input', calc: '50,000 × 8,850 = 442.5M tokens × $1/1M = $442.5' },
        { label: 'Output', calc: '50,000 × 80 = 4M × $5/1M = $20' },
        { label: 'No caching total', calc: '≈ $463' },
        { label: 'Caching: doc writes', calc: '5,000 × 8,000 = 40M × $1.25/1M = $50' },
        { label: 'Caching: doc reads', calc: '5,000 × 9 × 8,000 = 360M × $0.10/1M = $36' },
        { label: 'Caching: chunk input', calc: '50,000 × 850 = 42.5M × $1/1M = $42.5' },
        { label: 'Caching total', calc: '$50 + $36 + $42.5 + $20 output ≈ $149 (≈ $3.7 per 1M doc tokens)' },
      ],
      answer: 'About $460 without caching vs ~$150 with caching (≈3× cheaper); batch processing would roughly halve it again.',
      insight:
        'The document prefix dominates cost, so caching is essential. With a cheaper model like the one in Anthropic\'s example, the same arithmetic lands near ~$1 per 1M document tokens, a negligible one-off cost relative to the retrieval gain.',
      followUps: [
        {
          q: 'How does doubling chunk size to 1,600 tokens change the cost?',
          a: 'Chunks halve to 25,000 → cache reads drop to ~4 per doc (160M tokens, $16) and chunk input stays ~40M tokens, so total falls to roughly $50 + $16 + $42 + $10 ≈ $118.',
        },
      ],
    },
    {
      id: 'advanced-chunking-est-2',
      question: 'Storage and prompt budget for parent-child chunking on a 10M-token corpus.',
      assumptions: [
        'Parents 1,500 tokens (no overlap); children 200 tokens with 20 overlap',
        'Children embedded with 1,024-dim float32 vectors; parents not embedded',
        'Text stored at ~4 bytes per token',
        'Query returns top 4 distinct parents',
      ],
      steps: [
        { label: 'Parents', calc: '10M ÷ 1,500 ≈ 6,700 parents; text ≈ 10M × 4 B = 40 MB' },
        { label: 'Children', calc: '10M ÷ (200 − 20) ≈ 55,600 children' },
        { label: 'Child vectors', calc: '55,600 × 1,024 × 4 B ≈ 228 MB' },
        { label: 'Child text', calc: '55,600 × 200 × 4 B ≈ 44 MB' },
        { label: 'Prompt per query', calc: '4 parents × 1,500 = 6,000 tokens' },
        { label: 'Compare flat 1,500-token chunks', calc: '~6,700 vectors (27 MB) but much lower precision; flat 200-token chunks give 4 × 200 = 800 prompt tokens and lose context' },
      ],
      answer: '~56K child vectors (~230 MB), ~85 MB of text, and ~6K prompt tokens per query.',
      insight:
        'Parent-child spends vector storage on small, precise children while paying the prompt cost of large parents only for the few that are retrieved; the prompt budget, not storage, is the constraint to size against.',
      followUps: [
        {
          q: 'How would you cut the 6K-token prompt without losing context?',
          a: 'Return 3 parents instead of 4, or trim each parent to a window (e.g. ±2 children) around the matched children while keeping the section heading.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'advanced-chunking-mcq-01',
      difficulty: 'medium',
      question:
        'Which source benefits most from semantic chunking compared with header-based chunking?',
      options: [
        'A Markdown API reference with consistent ## headings',
        'A 90-minute meeting transcript with no headings that drifts across topics',
        'A spreadsheet exported to CSV',
        'A Python repository',
      ],
      correct: [1],
      explanation:
        'Transcripts have no structural seams, so embedding-distance breakpoints are the only way to find topic changes. Markdown references already have reliable headings; CSV and code need format-specific handling.',
      followUps: [
        {
          q: 'What extra signal could improve transcript chunking?',
          a: 'Speaker turns and timestamps (long pauses, agenda items) can be combined with embedding distance to place breakpoints and to add metadata for citations.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-02',
      difficulty: 'hard',
      question: 'A teammate ships this breakpoint detector for transcripts. Why do some documents come out as one huge chunk while others shatter into fragments?',
      code: {
        language: 'python',
        code: `def chunk(sentences, embeddings, threshold=0.3):
    chunks, cur = [], [sentences[0]]
    for i in range(1, len(sentences)):
        sim = cosine(embeddings[i - 1], embeddings[i])
        if sim < threshold:
            chunks.append(" ".join(cur)); cur = []
        cur.append(sentences[i])
    chunks.append(" ".join(cur))
    return chunks`,
      },
      options: [
        'Cosine similarity cannot be used between sentence embeddings',
        'A fixed absolute threshold with no size bounds: depending on model and document it yields one giant chunk or hundreds of fragments',
        'It should compare each sentence to the first sentence of the document',
        'It must embed words, not sentences',
      ],
      correct: [1],
      explanation:
        'Similarity scales differ by embedding model and document, so an absolute 0.3 can be never or always crossed. Relative thresholds (percentile) plus min/max size bounds make it robust. Comparing neighbours is correct.',
      followUps: [
        {
          q: 'Name two relative threshold strategies.',
          a: 'Percentile of the distance distribution (e.g. 95th), or mean plus k standard deviations; interquartile and gradient methods are other options.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-03',
      difficulty: 'hard',
      question: 'Which practices belong in a structure-aware chunker? (Select ALL that apply)',
      options: [
        'Carry the heading path into metadata and the chunk text',
        'Keep tables and code blocks atomic where possible',
        'Split every heading into its own chunk regardless of size, even if it has one sentence',
        'Recursively split sections that exceed the size limit',
      ],
      correct: [0, 1, 3],
      explanation:
        'Breadcrumbs, atomic structural elements and recursive splitting of oversize sections are standard. One-sentence sections should be merged with neighbours, not emitted as tiny chunks that embed poorly.',
      followUps: [
        {
          q: 'How should a merged chunk of two tiny sections express its headings?',
          a: 'Include both breadcrumbs (e.g. "Install > macOS; Install > Linux") in the text and keep a list of section paths in metadata so citations stay accurate.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-04',
      difficulty: 'expert',
      question:
        'With parent-child retrieval, top-10 child hits come from only 2 parents, and answers miss information from a third relevant section. What is the best fix?',
      options: [
        'Reduce child size to single words',
        'Retrieve more children (e.g. 30), group by parent, and pick the top distinct parents by best child score',
        'Embed the parents as well and average the two scores',
        'Increase the parent size to the whole document',
      ],
      correct: [1],
      explanation:
        'Several children from the same parent consume the top-k. Over-retrieving and grouping by parent restores diversity. Word-level children lose meaning; whole-document parents blow the budget; averaging parent and child scores blurs precision.',
      followUps: [
        {
          q: 'What secondary signal can rank parents with equal best scores?',
          a: 'The number of matching children (hit count) or the sum of child scores, which favours sections that match the query in several places.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-05',
      difficulty: 'hard',
      question:
        'In Anthropic\'s contextual retrieval experiments, what did adding contextual BM25 on top of contextual embeddings change?',
      options: [
        'Top-20 failure rate went from 3.7% to 2.9%, a total 49% reduction from the 5.7% baseline',
        'Nothing measurable; BM25 is redundant once embeddings have context',
        'Failure rate went up because BM25 adds noise',
        'It replaced the need for chunking',
      ],
      correct: [0],
      explanation:
        'Contextual embeddings alone cut failures 5.7% → 3.7% (−35%); adding contextual BM25 lowered it to 2.9% (−49%); reranking brought it to 1.9% (−67%). Keyword matching benefits from added entities and dates.',
      followUps: [
        {
          q: 'Why does BM25 benefit from the generated context?',
          a: 'The context adds exact identifiers (company names, periods, section titles) absent from the raw chunk, so exact-term queries now match.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-06',
      difficulty: 'expert',
      question: 'This contextualisation loop is slow and expensive. Which changes would help? (Select ALL that apply)',
      code: {
        language: 'typescript',
        code: `for (const chunk of chunks) {
  await client.messages.create({
    model: BIG_MODEL, max_tokens: 1024, temperature: 0.8,
    messages: [{ role: 'user', content: 'Doc: ' + doc + '\\nChunk: ' + chunk + '\\nWrite context.' }],
  });
}`,
      },
      options: [
        'Move the document into its own content block with cache_control so it is read from cache after the first call',
        'Use a small model with max_tokens around 150 and temperature 0',
        'Put the chunk before the document so the cache prefix is the chunk',
        'Use the Message Batches API or bounded concurrency for backfills',
      ],
      correct: [0, 1, 3],
      explanation:
        'Caching works on an identical prefix, so the document must come first and be marked cacheable; putting the varying chunk first breaks caching entirely. A small model with short output fits a 50–100 token task, and batches or bounded concurrency raise throughput and cut price.',
      followUps: [
        {
          q: 'How do you verify caching is working?',
          a: 'Check usage fields on responses: cache_creation_input_tokens on the first call and cache_read_input_tokens on the following calls for the same document.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-07',
      difficulty: 'medium',
      question:
        'What does the breadcrumb prefix "Billing > Refunds > EU" add when prepended to a structure-aware chunk?',
      options: [
        'It reduces the vector dimension',
        'It adds disambiguating terms to the indexed text so embeddings and BM25 distinguish similar sections',
        'It enables exact nearest-neighbour search',
        'It removes the need for metadata',
      ],
      correct: [1],
      explanation:
        'The embedding and keyword index only see text, so adding the heading path injects the words that separate EU from US refund rules. Metadata is still useful for filters and citations.',
      followUps: [
        {
          q: 'Could the breadcrumb ever hurt retrieval?',
          a: 'If breadcrumbs are long and identical across many chunks, they dominate short chunks\' embeddings; keep them concise and the chunk body substantial.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-08',
      difficulty: 'hard',
      question:
        'Which statements about late chunking are correct? (Select ALL that apply)',
      options: [
        'It runs the whole document through a long-context embedding model and pools token embeddings per chunk',
        'It requires an LLM call per chunk',
        'Chunk vectors carry context from the rest of the document',
        'It does not add context words to a BM25 index',
      ],
      correct: [0, 2, 3],
      explanation:
        'Late chunking embeds first and chunks afterwards (pooling token vectors), so chunk vectors reflect the whole document without LLM calls. Because no text is added, keyword indexes do not benefit, unlike LLM-generated contextual prefixes.',
      followUps: [
        {
          q: 'What limits late chunking on very long documents?',
          a: 'The embedding model\'s context window (e.g. 8K tokens); longer documents must be processed in large windows, which limits how much context reaches each chunk.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-09',
      difficulty: 'expert',
      question: 'This parent-child query returns the same parent several times. Why, and what is the fix?',
      code: {
        language: 'sql',
        code: `SELECT p.id, p.text, 1 - (c.embedding <=> $1) AS score
FROM children c JOIN parents p ON p.id = c.parent_id
ORDER BY c.embedding <=> $1
LIMIT 5;`,
      },
      options: [
        'The join is wrong; parents should be joined on text',
        'Each matching child yields a row, so a parent with several hits repeats; group by parent and keep the max score',
        'The <=> operator returns similarity, so ORDER BY must be DESC',
        'LIMIT should be applied before the join',
      ],
      correct: [1],
      explanation:
        'Rows are per child, so parents with several matching children appear multiple times and crowd out others. Group by parent and use max(1 − distance), or over-retrieve children in a subquery and then deduplicate. In pgvector <=> is cosine distance, so ascending order is correct.',
      followUps: [
        {
          q: 'Why might you retrieve children in a subquery with a larger LIMIT first?',
          a: 'So the vector index serves an ordered top-N of children efficiently (e.g. 40), then grouping picks the top distinct parents from that candidate set.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-10',
      difficulty: 'hard',
      question:
        'Your contextual chunking job generated context like "This chunk likely discusses the 2022 merger" for a document that never mentions a merger. What should you change?',
      options: [
        'Increase max_tokens so the model can explain more',
        'Use temperature 0 and instruct the model to use only facts stated in the document, then spot-check outputs',
        'Remove the document from the prompt to save tokens',
        'Prepend the context only to the BM25 index',
      ],
      correct: [1],
      explanation:
        'Speculative context is a hallucination; deterministic decoding and a grounding instruction reduce it, and sampling outputs catches regressions. Removing the document makes hallucination worse; more tokens or BM25-only do not address it.',
      followUps: [
        {
          q: 'How could you automatically flag hallucinated context?',
          a: 'Check that named entities and numbers in the generated context appear in the document text; contexts with unseen entities are flagged for review or regenerated.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-11',
      difficulty: 'medium',
      question: 'Which pairing of problem → chunking technique is most appropriate?',
      options: [
        'Chunks lack the company name and period they refer to → contextual chunking',
        'Code functions split in half → semantic chunking',
        'Answers need surrounding exceptions → smaller chunks only',
        'Transcripts mix topics → larger overlap',
      ],
      correct: [0],
      explanation:
        'Missing entity and date context is exactly what contextual chunking fixes. Split functions need AST/structure-aware splitting; missing exceptions need parent-child or neighbour expansion; topic mixing needs semantic breakpoints rather than overlap.',
      followUps: [
        {
          q: 'Which technique fits "answers need surrounding exceptions" best, and why?',
          a: 'Parent-child chunking: small children match precisely and the returned parent includes the nearby exceptions and qualifiers.',
        },
      ],
    },
    {
      id: 'advanced-chunking-mcq-12',
      difficulty: 'expert',
      question:
        'You add contextual prefixes (~90 tokens) to 800-token chunks. Which side effects should you plan for? (Select ALL that apply)',
      options: [
        'Index text grows by roughly 11%',
        'Re-ingestion must regenerate contexts when the surrounding document changes, even if the chunk itself did not',
        'Vector dimension increases by 90',
        'Displayed citations should show the original chunk, not the generated prefix',
      ],
      correct: [0, 1, 3],
      explanation:
        '90/800 ≈ 11% more text to embed and store. Context depends on the whole document, so cache keys must include the document hash. Users should see source text, not model-written context. Vector dimension is fixed by the embedding model.',
      followUps: [
        {
          q: 'Should the context be sent to the LLM at answer time as well?',
          a: 'Optionally: it can help the generator interpret the chunk, but label it as generated context separate from the quoted source text so citations remain faithful.',
        },
      ],
    },
  ],
};

export default topic;
