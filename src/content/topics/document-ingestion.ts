import type { Topic } from '../../types';

const topic: Topic = {
  id: 'document-ingestion',
  phase: 'ingestion',
  order: 1,
  title: 'Document Ingestion, Parsing, Preprocessing and OCR',
  subtitle:
    'Turn messy PDFs, HTML, Office files and scans into clean, structured, traceable text, because retrieval can never be better than the text you feed it.',
  estimatedMinutes: 52,
  sources: [
    'Unstructured docs: partition, partition_pdf strategies (fast / hi_res / ocr_only) and chunk_by_title',
    'PyMuPDF documentation: page.get_text, find_tables; pymupdf4llm to_markdown',
    'pdfplumber README: extract_tables, table settings and visual debugging',
    'Auer et al. 2024, "Docling Technical Report" (arXiv 2408.09869), IBM Research',
    'applied-artificial-intelligence/pdf-parser-benchmark on GitHub (353-document parser comparison, TEDS table scores)',
    'Tesseract OCR documentation: page segmentation modes (--psm) and tessdata models',
    'AWS Textract, Google Document AI and Azure AI Document Intelligence product docs (layout, tables, forms)',
    'Anthropic docs: PDF support and vision (sending PDFs/images to Claude)',
  ],
  tags: ['ingestion', 'pdf', 'parsing', 'ocr', 'preprocessing', 'unstructured', 'docling', 'rag'],
  cheatSheet: [
    'Ingestion = load → detect type → parse → clean → enrich metadata → chunk → embed → index; make every stage idempotent and keyed by a content hash.',
    'Route by file type and by "does the PDF have a text layer?": digital PDFs → PyMuPDF/pdfplumber (fast); complex layouts or tables → Docling/unstructured hi_res; scans → OCR.',
    'PyMuPDF is the speed king (hundreds of pages/s); pdfplumber gives the best table control; Docling/unstructured hi_res give layout-aware structure at 10–100× the cost.',
    'Keep structure: emit Markdown with headings, lists and tables, plus metadata (source, page, section path, doc version, ACL); never just one flat string per file.',
    'Preprocessing checklist: Unicode NFKC, fix de-hyphenation, strip repeating headers/footers, collapse whitespace, drop boilerplate, exact + near-duplicate removal (MinHash).',
    'OCR: Tesseract at 300 DPI with the right --psm for free baseline; cloud OCR (Textract, Document AI, Azure DI) for forms/tables at roughly $1.50 per 1K pages (illustrative); vision LLMs for messy layouts and handwriting.',
    'Vision-LLM OCR can hallucinate plausible text: validate with confidence/cross-checks (totals add up, dates parse) and keep page images for audit.',
    'Measure parsing quality on a 30–50 doc golden set (text edit similarity, table TEDS, heading recall) before you tune chunking or embeddings.',
    'Store the raw file + parser version + content hash so you can re-parse when a better parser ships, without re-downloading.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Document Ingestion — the pipeline from raw files to indexable records',
      body: `**Intuition:** ingestion is the loading dock of a RAG system. Whatever arrives crooked — a scanned invoice, a 400-page PDF, a Confluence page full of navigation menus — gets straightened, labelled and shelved here. If the shelving is wrong, no clever retrieval later can find it.

**Mechanics.** A production ingestion pipeline has the same stages regardless of tooling:

| Stage | What happens | Typical tools |
|---|---|---|
| Connect / load | Pull files from S3, SharePoint, Google Drive, web crawls, DBs | LangChain/LlamaIndex loaders, custom connectors |
| Detect & route | MIME type, text layer present?, language | \`file-type\`, \`libmagic\`, PyMuPDF text check |
| Parse | Extract text + structure (headings, tables, pages) | PyMuPDF, pdfplumber, Docling, unstructured |
| Clean | Normalise, de-boilerplate, dedupe | regex, \`ftfy\`, MinHash |
| Enrich | Metadata: source URL, page, section, version, ACL, hash | your code |
| Chunk → embed → index | Covered in the next topics | splitters, embedding API, vector DB |

Three properties separate a demo from production: **idempotency** (re-running the job for the same content hash is a no-op), **incrementality** (only changed files are re-processed), and **traceability** (every chunk can be traced back to file, page and parser version so citations work and bad parses can be re-run).

**When to use what:** for a hackathon, a single loader and a splitter is fine. As soon as documents change, have permissions or feed citations, build the staged pipeline with a manifest table keyed by \`sha256(content)\`.`,
      example: `A support team ingests 12,000 files: 9,000 Confluence pages, 2,500 digital PDFs and 500 scanned contracts. Routing sends Confluence HTML to an HTML parser (1.2 s total per 100 pages), digital PDFs to PyMuPDF (~0.02 s/page) and scans to OCR (~1.5 s/page). A nightly re-run finds that only 140 files have a new sha256, so only 140 are re-parsed instead of 12,000, and the job drops from 3 h to 4 min. When a user later reports a wrong answer, the chunk's metadata \`{source: "contracts/acme-2024.pdf", page: 17, parser: "tesseract-5.4", hash: "9f2c…"}\` shows the clause came from a bad OCR page, which is re-processed in isolation.`,
      diagram: `  sources            route              parse           clean+enrich
 ┌────────┐      ┌───────────┐     ┌────────────┐    ┌──────────────┐
 │ S3     │─┐    │ MIME type │ pdf │ PyMuPDF    │    │ normalise    │
 │ Drive  │─┼──▶ │ text      │────▶│ Docling    │───▶│ dedupe       │
 │ Wiki   │─┘    │ layer?    │scan │ OCR        │    │ + metadata   │
 └────────┘      └───────────┘────▶└────────────┘    └──────┬───────┘
                       ▲ skip if sha256 unchanged           │
                 ┌─────┴──────┐                      ┌──────▼───────┐
                 │ manifest   │◀─────────────────────│ chunk/embed/ │
                 │ (hash,ver) │   record status      │ index        │
                 └────────────┘                      └──────────────┘`,
      code: [
        {
          language: 'typescript',
          title: 'Idempotent ingestion loop with a content-hash manifest',
          code: `import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const PARSER_VERSION = 'pymupdf-1.26+clean-v3'; // bump to force re-parse

type Parsed = { text: string; pages: number; meta: Record<string, unknown> };

export async function ingestFile(path: string, parse: (buf: Buffer) => Promise<Parsed>) {
  const buf = await readFile(path);
  const hash = createHash('sha256').update(buf).digest('hex');

  // Skip work if this exact content was already parsed with this parser version
  const { rows } = await db.query(
    'SELECT 1 FROM ingest_manifest WHERE source = $1 AND content_hash = $2 AND parser_version = $3',
    [path, hash, PARSER_VERSION],
  );
  if (rows.length) return { path, status: 'unchanged' as const };

  const parsed = await parse(buf);
  const tx = await db.connect(); // a transaction must run on ONE pooled connection
  try {
    await tx.query('BEGIN');
    // Replace old records for this source atomically (no stale chunks left behind)
    await tx.query('DELETE FROM documents WHERE source = $1', [path]);
    await tx.query(
      'INSERT INTO documents (source, content_hash, text, meta) VALUES ($1, $2, $3, $4)',
      [path, hash, parsed.text, { ...parsed.meta, pages: parsed.pages, parser: PARSER_VERSION }],
    );
    await tx.query(
      'INSERT INTO ingest_manifest (source, content_hash, parser_version, ingested_at) VALUES ($1, $2, $3, now()) ' +
        'ON CONFLICT (source) DO UPDATE SET content_hash = EXCLUDED.content_hash, parser_version = EXCLUDED.parser_version, ingested_at = now()',
      [path, hash, PARSER_VERSION],
    );
    await tx.query('COMMIT');
    return { path, status: 'ingested' as const };
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Content-hash manifests make re-runs cheap: only changed files are re-parsed and re-embedded.',
          'Per-stage routing lets you use a fast parser for 90% of files and an expensive one only where needed.',
          'Rich metadata (page, section, version, ACL) enables citations, filtering and permission-aware retrieval later.',
        ],
        cons: [
          {
            con: 'Deleted or renamed source files leave orphan chunks that keep getting retrieved.',
            fix: 'Run a reconciliation step each sync: diff the manifest against the source listing and delete records whose source no longer exists (tombstone + hard delete).',
          },
          {
            con: 'One poison file (corrupt PDF, 2 GB scan) crashes or stalls the whole batch.',
            fix: 'Process files as independent jobs in a queue with per-file timeouts, size limits and a dead-letter queue for failures.',
          },
          {
            con: 'Upgrading the parser silently changes text, so old and new chunks are inconsistent.',
            fix: 'Store parser_version in the manifest and metadata; bump it to trigger a controlled re-parse and compare outputs on a golden set first.',
          },
        ],
      },
      keyPoints: [
        'Ingestion stages: load → route → parse → clean → enrich → chunk → embed → index.',
        'Key every record by sha256(content) + parser version for idempotent, incremental runs.',
        'Replace a document\'s records atomically so no stale chunks survive an update.',
        'Metadata (source, page, section, ACL, version) is what makes citations and filters possible.',
      ],
      exercise: {
        prompt: `Write \`planSync(current, manifest)\` that compares the current source listing with the manifest and returns which files to **add**, **update** and **delete**.

Acceptance criteria:
- \`current\` and \`manifest\` are arrays of \`{ source: string; hash: string }\`.
- New source → add; same source with a different hash → update; source missing from \`current\` → delete; same hash → nothing.
- Runs in O(n) using Maps.`,
        starter: {
          language: 'typescript',
          code: `type Entry = { source: string; hash: string };

export function planSync(current: Entry[], manifest: Entry[]) {
  // TODO: index manifest by source
  // TODO: classify each current entry as add / update / unchanged
  // TODO: anything left in the manifest but not in current is a delete
  return { add: [] as string[], update: [] as string[], del: [] as string[] };
}`,
        },
        hints: [
          'Build `new Map(manifest.map(m => [m.source, m.hash]))` first.',
          'Track which manifest sources you saw while iterating `current`.',
          'Deletes are manifest keys that were never seen.',
        ],
        solution: {
          language: 'typescript',
          code: `type Entry = { source: string; hash: string };

export function planSync(current: Entry[], manifest: Entry[]) {
  const known = new Map(manifest.map((m) => [m.source, m.hash]));
  const seen = new Set<string>();
  const add: string[] = [];
  const update: string[] = [];

  for (const { source, hash } of current) {
    seen.add(source);
    const old = known.get(source);
    if (old === undefined) add.push(source);
    else if (old !== hash) update.push(source);
  }
  const del = [...known.keys()].filter((s) => !seen.has(s));
  return { add, update, del };
}

// planSync([{source:'a',hash:'1'},{source:'b',hash:'9'}], [{source:'b',hash:'2'},{source:'c',hash:'3'}])
// -> { add: ['a'], update: ['b'], del: ['c'] }`,
        },
        explanation:
          'Two passes over Maps give O(n) classification. The delete list is what most naive pipelines forget, and it is the source of "ghost" answers from documents that no longer exist.',
      },
      quickCheck: {
        question:
          'Your nightly job re-embeds all 50,000 documents even though only ~1% change daily. What is the most effective first fix?',
        options: [
          'Switch to a cheaper embedding model',
          'Keep a manifest keyed by content hash and only process files whose hash changed',
          'Increase the chunk size so there are fewer chunks to embed',
          'Run the job weekly instead of nightly',
        ],
        correct: 1,
        explanation:
          'Hash-based change detection cuts the work by ~99% without hurting quality or freshness. Cheaper models or bigger chunks change retrieval quality, and a weekly schedule trades away freshness.',
      },
      source: 'LlamaIndex docs — Ingestion Pipeline with document management (docstore hashing)',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Document Parsing — extracting text, layout and tables',
      body: `**Intuition:** a PDF is not a document, it is a set of instructions for where to paint glyphs on a page. Parsing means reconstructing reading order, headings and tables from those paint instructions, like reassembling a newspaper from a photo of it.

**Mechanics.** Parsers fall into three families:

| Family | Examples | Speed | Strength | Weakness |
|---|---|---|---|---|
| Text-layer extractors | PyMuPDF (\`fitz\`), pypdf, pdfminer | 100s of pages/s | Fast, exact characters | Reading order on multi-column pages; weak tables |
| Rule-based table tools | pdfplumber, Camelot | ~1–10 pages/s | Fine control of ruled tables | Tuning per layout; no OCR |
| Layout-model parsers | Docling, unstructured \`hi_res\`, Marker, LlamaParse | ~0.5–5 pages/s (CPU) | Headings, reading order, tables → Markdown | Slower; may need GPU |

\`pymupdf4llm.to_markdown()\` is a strong cheap default that emits Markdown with headings. Docling (IBM) runs layout and TableFormer models and exports Markdown/JSON with table structure. \`unstructured.partition\` returns typed elements (\`Title\`, \`NarrativeText\`, \`Table\`, \`ListItem\`) with page numbers, which feed directly into structure-aware chunking.

For HTML, strip \`nav\`, \`footer\`, \`script\` and cookie banners first (Readability-style extraction or \`trafilatura\`); for DOCX/PPTX, use the native XML structure rather than converting to PDF.

**When to use what:** start with PyMuPDF for digital PDFs and only escalate pages that fail cheap heuristics (many tables, multi-column, low text density) to Docling or hi_res. Published benchmarks disagree by document type (one 353-doc benchmark put pdfplumber's table TEDS at 93% vs Docling ~85%), so test on **your** documents.`,
      example: `A 2-column research PDF parsed with plain \`pypdf\` returns lines interleaved across columns: "Transformers use attention / Results on GLUE show / to weigh tokens…". PyMuPDF with \`sort=True\` fixes most of it. A pricing table that pypdf flattens into "Plan Seats Price Basic 5 $10 Pro 20 $35" comes out of Docling as a Markdown table:

| Plan | Seats | Price |
|---|---|---|
| Basic | 5 | $10 |
| Pro | 20 | $35 |

Now the question "how much is Pro?" retrieves a chunk where "Pro" and "$35" sit in the same row, and the LLM answers $35 instead of guessing $10.`,
      diagram: `         digital PDF page
                 │
     ┌───────────┼─────────────────────┐
     ▼           ▼                     ▼
 text layer   rule tables         layout model
 (PyMuPDF)    (pdfplumber)        (Docling / hi_res)
     │           │                     │
 chars+bbox   cells grid          regions: Title, Text,
     │           │                Table, Figure, List
     └───────────┴──────────┬──────────┘
                            ▼
          Markdown + elements[] {type, text, page, bbox}`,
      code: [
        {
          language: 'python',
          title: 'Cheap-first parsing with escalation to Docling',
          code: `import fitz  # PyMuPDF
import pymupdf4llm
from docling.document_converter import DocumentConverter

converter = DocumentConverter()  # loads layout + TableFormer models once

def needs_layout_model(page: fitz.Page) -> bool:
    text = page.get_text("text")
    tables = page.find_tables().tables       # PyMuPDF's built-in table finder
    blocks = page.get_text("blocks")
    xs = {round(b[0] / 50) for b in blocks}   # rough count of column start positions
    return len(tables) > 0 or len(xs) >= 3 or len(text) < 200

def parse_pdf(path: str) -> str:
    doc = fitz.open(path)
    hard_pages = [i for i, p in enumerate(doc) if needs_layout_model(p)]
    if len(hard_pages) / max(len(doc), 1) > 0.3:
        # Many hard pages: run the layout model on the whole file
        return converter.convert(path).document.export_to_markdown()
    # Otherwise the fast path: Markdown with headings, page by page
    pages = pymupdf4llm.to_markdown(path, page_chunks=True)
    out = []
    for i, page in enumerate(pages):
        md = page["text"]
        if i in hard_pages:
            md = converter.convert(path, page_range=(i + 1, i + 1)).document.export_to_markdown()
        out.append(f"<!-- page {i + 1} -->\\n{md}")
    return "\\n\\n".join(out)`,
        },
      ],
      prosCons: {
        pros: [
          'Layout-aware parsers keep headings and tables, which directly improves chunk quality and answer accuracy.',
          'Element-typed output (Title, Table, ListItem) enables structure-aware chunking and metadata filters.',
          'Cheap-first routing keeps cost close to PyMuPDF speed while fixing the hard pages.',
        ],
        cons: [
          {
            con: 'Multi-column pages come out in the wrong reading order, mixing sentences from two columns.',
            fix: 'Use block sorting (PyMuPDF sort=True) or a layout model (Docling, hi_res) that predicts reading order; verify on a sample.',
          },
          {
            con: 'Tables are flattened into a stream of cells, so values lose their row/column headers.',
            fix: 'Extract tables separately (pdfplumber, Docling TableFormer) and serialise them as Markdown or "Row: Pro | Seats: 20 | Price: $35" lines.',
          },
          {
            con: 'Layout models are 10–100× slower and may need a GPU for large backlogs.',
            fix: 'Route only hard pages to them, batch on GPU workers, and cache output by content hash so each page is parsed once.',
          },
        ],
      },
      keyPoints: [
        'PDFs store glyph positions, not paragraphs: parsing reconstructs structure.',
        'PyMuPDF/pymupdf4llm = fast default; pdfplumber = table control; Docling/unstructured hi_res = layout models.',
        'Output Markdown plus typed elements with page numbers, not one flat string.',
        'Benchmark parsers on your own documents; published rankings vary by document type.',
      ],
      exercise: {
        prompt: `Write \`tableToRows(table)\` that converts a parsed table (header row + body rows, as from pdfplumber's \`extract_tables()\`) into **self-describing lines** suitable for embedding, e.g. \`"Plan: Pro | Seats: 20 | Price: $35"\`.

Acceptance criteria:
- Skips empty rows; replaces \`None\` cells with an empty string.
- Repeats the header names on every row so each line is meaningful on its own.
- Optional \`caption\` is prefixed to each line ("Pricing table — Plan: Pro | ...").`,
        starter: {
          language: 'python',
          code: `def table_to_rows(table: list[list[str | None]], caption: str | None = None) -> list[str]:
    header, *body = table
    lines = []
    # TODO: clean header names
    # TODO: for each non-empty row build "Header: value | ..." pairs
    # TODO: prefix the caption if present
    return lines`,
        },
        hints: [
          'zip(header, row) pairs each cell with its column name.',
          'A row is empty if every cell is None or whitespace.',
          'Use (cell or "").strip() to handle None safely.',
        ],
        solution: {
          language: 'python',
          code: `def table_to_rows(table: list[list[str | None]], caption: str | None = None) -> list[str]:
    if not table:
        return []
    header, *body = table
    names = [(h or f"col{i}").strip() for i, h in enumerate(header)]
    lines = []
    for row in body:
        cells = [(c or "").strip() for c in row]
        if not any(cells):
            continue  # skip empty rows
        pairs = " | ".join(f"{n}: {v}" for n, v in zip(names, cells) if v)
        lines.append(f"{caption} — {pairs}" if caption else pairs)
    return lines

print(table_to_rows([["Plan", "Seats", "Price"], ["Basic", "5", "$10"], [None, None, None], ["Pro", "20", "$35"]], "Pricing"))
# ['Pricing — Plan: Basic | Seats: 5 | Price: $10', 'Pricing — Plan: Pro | Seats: 20 | Price: $35']`,
        },
        explanation:
          'Repeating column names on every row means a retrieved line still answers "price of Pro" even when the header row lands in a different chunk.',
      },
      quickCheck: {
        question:
          'Answers about a pricing table are often off by one row. Text extraction was done with a plain text-layer extractor. What is the most likely cause?',
        options: [
          'The embedding model is too small',
          'The table was flattened into a cell stream so values lost their row association',
          'The chunk overlap is too large',
          'The LLM temperature is too high',
        ],
        correct: 1,
        explanation:
          'Text-layer extractors emit cells in paint order, so "Pro" and "$35" may be far apart or interleaved. Extracting tables as structured rows fixes the root cause; the other options do not restore row structure.',
      },
      source: 'Auer et al. 2024 — Docling Technical Report (arXiv 2408.09869); PyMuPDF docs',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Data Preprocessing — cleaning, normalising and deduplicating text',
      body: `**Intuition:** preprocessing is washing vegetables before cooking. Headers on every page, broken hyphenation, \`ﬁ\` ligatures and five copies of the same policy are dirt that dilutes embeddings and wastes context tokens.

**Mechanics — the standard cleaning pass:**

1. **Unicode normalisation** — NFKC turns \`ﬁ\` → \`fi\`, full-width digits → ASCII, and non-breaking spaces → spaces. \`ftfy\` repairs mojibake (\`â€™\` → \`'\`).
2. **De-hyphenation** — join \`infor-\\nmation\` → \`information\` when a line ends with a hyphen followed by a lowercase letter.
3. **Repeating headers/footers** — lines that appear on > 50% of pages at the top or bottom ("Confidential — Acme Corp", "Page 3 of 40") are removed.
4. **Whitespace and boilerplate** — collapse runs of spaces, drop cookie banners, nav menus, legal footers, empty table cells.
5. **Deduplication** — exact duplicates via hash; near-duplicates (versions with a changed date) via **MinHash/LSH** on word shingles, Jaccard ≥ 0.9 typical.
6. **Filtering and enrichment** — language detection, minimum length, PII redaction if required (covered in the privacy topic), add \`lang\`, \`doc_type\`, \`effective_date\` metadata.

Keep preprocessing **deterministic and versioned**: the same input must produce byte-identical output so hashes and caches stay valid.

**When to use it:** always, but calibrate. Aggressive cleaning can delete meaning (e.g. removing all numbers in footers also removes "Section 4.2"). Inspect 20 random documents before and after each rule.`,
      example: `An HR corpus of 3,000 PDFs (~6M tokens). Running the cleaning pass:

- Repeating header "ACME CONFIDENTIAL — Internal use only" on all 41,000 pages: −410K tokens.
- "Page N of M" footers: −160K tokens.
- Exact duplicates (same file in 3 folders): 420 files removed.
- Near-duplicates (yearly re-issues with only the date changed, Jaccard 0.96): 310 files collapsed to the newest version.

Result: 6.0M → 4.1M tokens (−32%), embedding cost down proportionally, and top-5 results for "parental leave policy" no longer return 4 copies of the same paragraph.`,
      diagram: `raw text ─▶ NFKC + ftfy ─▶ de-hyphenate ─▶ strip headers/footers
                                                  │
     ┌────────────────────────────────────────────┘
     ▼
 collapse whitespace ─▶ exact dedupe (sha256) ─▶ near-dedupe (MinHash)
                                                  │
                                                  ▼
                      lang / length filter ─▶ metadata ─▶ clean text`,
      code: [
        {
          language: 'python',
          title: 'Deterministic cleaning pass with header/footer stripping',
          code: `import re
import unicodedata
from collections import Counter
import ftfy

def clean_pages(pages: list[str]) -> list[str]:
    # 1. Unicode repair + NFKC normalisation (ligatures, full-width chars, NBSP)
    pages = [unicodedata.normalize("NFKC", ftfy.fix_text(p)) for p in pages]

    # 2. Find lines repeated at the top/bottom of > 50% of pages
    edge_lines = Counter()
    for p in pages:
        lines = [l.strip() for l in p.splitlines() if l.strip()]
        for l in set(lines[:2] + lines[-2:]):
            edge_lines[re.sub(r"\\d+", "#", l)] += 1   # "Page 3 of 40" -> "Page # of #"
    boiler = {l for l, n in edge_lines.items() if n > len(pages) * 0.5}

    out = []
    for p in pages:
        kept = [l for l in p.splitlines() if re.sub(r"\\d+", "#", l.strip()) not in boiler]
        text = "\\n".join(kept)
        # 3. Join words hyphenated across line breaks: "infor-\\nmation" -> "information"
        text = re.sub(r"(\\w)-\\n(\\w)", r"\\1\\2", text)
        # 4. Single newlines inside paragraphs -> spaces; keep blank lines as paragraph breaks
        text = re.sub(r"(?<!\\n)\\n(?!\\n)", " ", text)
        text = re.sub(r"[ \\t]+", " ", text).strip()
        out.append(text)
    return out`,
        },
      ],
      prosCons: {
        pros: [
          'Removes 10–40% of tokens in typical enterprise corpora, cutting embedding and context cost.',
          'Deduplication stops top-k results being filled with copies of the same passage.',
          'Normalisation makes keyword/BM25 matching work ("ﬁle" now matches "file").',
        ],
        cons: [
          {
            con: 'Over-aggressive rules delete meaningful text (e.g. section numbers that look like page footers).',
            fix: 'Apply rules only to page edges, require high repetition thresholds (> 50% of pages), and diff 20 random docs before/after each rule change.',
          },
          {
            con: 'Near-duplicate removal can drop the version that is actually current.',
            fix: 'Within a duplicate cluster keep the newest by effective_date/version metadata, and store superseded versions with a "superseded" flag instead of deleting.',
          },
          {
            con: 'Non-deterministic cleaning breaks hash-based caching and incremental indexing.',
            fix: 'Make every rule pure and versioned (clean-v3) and include that version in the manifest key.',
          },
        ],
      },
      keyPoints: [
        'NFKC + ftfy fixes ligatures, mojibake and odd whitespace.',
        'Detect boilerplate by repetition across pages, with digits normalised.',
        'Exact dedupe by hash, near-dedupe by MinHash/LSH (Jaccard ~0.9).',
        'Keep cleaning deterministic and versioned so caches stay valid.',
      ],
      exercise: {
        prompt: `Implement \`nearDuplicates(docs, threshold)\` that returns pairs of document ids whose **word 3-shingle Jaccard similarity** is ≥ \`threshold\`.

Acceptance criteria:
- Lower-case and split on non-word characters.
- Shingles are 3 consecutive words joined by spaces.
- Returns \`[idA, idB, similarity]\` tuples with similarity rounded to 2 decimals (brute force O(n²) is fine for ≤ 1,000 docs).`,
        starter: {
          language: 'python',
          code: `import re

def shingles(text: str, k: int = 3) -> set[str]:
    # TODO
    ...

def near_duplicates(docs: dict[str, str], threshold: float = 0.9):
    # TODO: compare every pair with Jaccard = |A & B| / |A | B|
    ...`,
        },
        hints: [
          're.findall(r"\\w+", text.lower()) gives clean tokens.',
          'Shingles: {" ".join(words[i:i+k]) for i in range(len(words)-k+1)}.',
          'Use itertools.combinations over the dict items.',
        ],
        solution: {
          language: 'python',
          code: `import re
from itertools import combinations

def shingles(text: str, k: int = 3) -> set[str]:
    words = re.findall(r"\\w+", text.lower())
    return {" ".join(words[i:i + k]) for i in range(max(len(words) - k + 1, 1))}

def near_duplicates(docs: dict[str, str], threshold: float = 0.9):
    sh = {doc_id: shingles(t) for doc_id, t in docs.items()}
    out = []
    for (a, sa), (b, sb) in combinations(sh.items(), 2):
        union = len(sa | sb)
        sim = len(sa & sb) / union if union else 0.0
        if sim >= threshold:
            out.append((a, b, round(sim, 2)))
    return out

docs = {
    "v2023": "Employees receive 20 days of paid leave per year effective January 2023.",
    "v2024": "Employees receive 20 days of paid leave per year effective January 2024.",
    "travel": "Book flights through the travel portal at least 14 days ahead.",
}
print(near_duplicates(docs, 0.7))  # [('v2023', 'v2024', 0.82)]`,
        },
        explanation:
          'Shingling captures word order, so documents that differ only in a date share most shingles. At scale replace the O(n²) loop with MinHash signatures and LSH buckets (datasketch), which find candidates in near-linear time.',
      },
      quickCheck: {
        question:
          'After adding a "remove any line containing only digits and the word Page" rule, recall on questions about numbered clauses drops. What happened?',
        options: [
          'The embedding model cannot handle numbers',
          'The rule also matched body lines like "Page 4 limits apply to Section 12", removing real content',
          'Deduplication removed the clauses',
          'NFKC normalisation changed the digits',
        ],
        correct: 1,
        explanation:
          'Cleaning rules that are not restricted to page edges and high-repetition lines can delete body text. Scoping rules to header/footer positions and diffing samples catches this.',
      },
      source: 'Broder 1997 — On the resemblance and containment of documents (MinHash); ftfy docs',
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'OCR — getting text out of scans, photos and image-only PDFs',
      body: `**Intuition:** OCR is reading a photograph of a page. If a PDF has no text layer (scans, faxes, phone photos), every other parser returns an empty string, and your RAG system silently knows nothing about that document.

**Mechanics — detect, then choose an engine:**

- **Detect:** a page needs OCR if \`page.get_text()\` returns < ~50 characters but the page has images, or if extracted text is garbage (high ratio of non-dictionary tokens).
- **Pre-process images:** render at **300 DPI**, deskew, binarise, remove noise. Low DPI is the #1 cause of bad OCR.

| Engine | Cost | Strength | Weakness |
|---|---|---|---|
| Tesseract 5 (LSTM) | Free, CPU | Clean printed text, 100+ languages | Tables, handwriting, complex layouts |
| PaddleOCR / docTR / EasyOCR | Free, GPU helps | Better on photos, rotated text | Ops effort |
| Cloud OCR (AWS Textract, Google Document AI, Azure AI Document Intelligence) | ~$1.50 per 1K pages for plain text; forms/tables cost more (illustrative) | Tables, key-value forms, confidence scores | Data leaves your VPC; per-page cost |
| Vision LLMs (Claude, GPT, Gemini; or Docling/olmOCR-style VLM pipelines) | Highest per page | Messy layouts, handwriting, charts → Markdown | Can **hallucinate** fluent, wrong text; slower |

Tesseract's \`--psm\` (page segmentation mode) matters: \`6\` = single uniform block, \`4\` = single column of variable sizes, \`11\` = sparse text.

**When to use what:** Tesseract for clean scanned letters; cloud OCR for invoices, forms and tables at volume; a vision LLM for the 5% of pages the others fail on, with validation (totals add up, dates parse, confidence flags) and the page image kept for human review.`,
      example: `A 40-page scanned lease. PyMuPDF returns 0 characters on 38 pages → routed to OCR.

- Tesseract at 150 DPI: word accuracy ~88%; "$2,450/month" read as "$2,45O/rnonth".
- Re-rendered at 300 DPI + deskew: ~97%; the rent reads correctly.
- Page 31 is a handwritten addendum: Tesseract confidence 41% → escalated to a vision LLM, which returns "Tenant may sublet with written consent." Cost: 38 pages × Tesseract (free) + 1 page × vision LLM (~1,600 input tokens for the image ≈ $0.005 at an illustrative $3/1M).

Now "can I sublet?" retrieves the addendum chunk instead of answering "not mentioned".`,
      diagram: `page ──▶ text layer? ──yes──▶ normal parser
             │no
             ▼
   render 300 DPI ─▶ deskew/binarise ─▶ Tesseract / cloud OCR
                                          │
                                 confidence < 60%? ──no──▶ text + conf
                                          │yes
                                          ▼
                               vision LLM → Markdown
                                          │
                               validate (dates, totals) ─▶ flag for review`,
      code: [
        {
          language: 'python',
          title: 'Detect image-only pages, OCR with Tesseract, escalate low-confidence pages',
          code: `import io
import fitz  # PyMuPDF
import pytesseract
from PIL import Image

MIN_CHARS = 50
MIN_CONF = 60  # Tesseract word confidence, 0-100

def page_image(page: fitz.Page, dpi: int = 300) -> Image.Image:
    pix = page.get_pixmap(dpi=dpi)          # 300 DPI is the usual OCR sweet spot
    return Image.open(io.BytesIO(pix.tobytes("png")))

def ocr_page(img: Image.Image) -> tuple[str, float]:
    data = pytesseract.image_to_data(
        img, lang="eng", config="--oem 1 --psm 4", output_type=pytesseract.Output.DICT
    )
    words = [(w, float(c)) for w, c in zip(data["text"], data["conf"]) if w.strip() and float(c) >= 0]
    text = " ".join(w for w, _ in words)
    conf = sum(c for _, c in words) / len(words) if words else 0.0
    return text, conf

def extract(path: str, vision_fallback) -> list[dict]:
    out = []
    for i, page in enumerate(fitz.open(path)):
        text = page.get_text("text")
        if len(text.strip()) >= MIN_CHARS:
            out.append({"page": i + 1, "text": text, "method": "text-layer"})
            continue
        img = page_image(page)
        text, conf = ocr_page(img)
        if conf < MIN_CONF:  # handwriting, stamps, poor scans
            text, method = vision_fallback(img), "vision-llm"
        else:
            method = "tesseract"
        out.append({"page": i + 1, "text": text, "method": method, "ocr_conf": round(conf, 1)})
    return out`,
        },
      ],
      prosCons: {
        pros: [
          'Unlocks scanned and photographed documents that would otherwise be invisible to retrieval.',
          'Tiered OCR (free engine first, vision LLM only on failures) keeps cost low while handling hard pages.',
          'Cloud OCR and vision LLMs recover tables and key-value fields, not just words.',
        ],
        cons: [
          {
            con: 'Character errors ("O" vs "0", "rn" vs "m") corrupt numbers and names that users search for.',
            fix: 'Render at 300 DPI, deskew/binarise, use the right --psm, and post-validate numeric fields (regex for amounts, dates that parse).',
          },
          {
            con: 'Vision LLMs can produce fluent text that is not on the page.',
            fix: 'Use temperature 0, ask for verbatim transcription with [illegible] markers, cross-check against a classical OCR pass, and keep the page image for human review.',
          },
          {
            con: 'Cloud OCR sends sensitive documents outside your network and costs per page.',
            fix: 'Use a region-pinned, no-retention endpoint or self-hosted OCR (Tesseract/PaddleOCR) for sensitive data, and only escalate low-confidence pages.',
          },
        ],
      },
      keyPoints: [
        'Detect image-only pages by near-empty text layers, then OCR them.',
        '300 DPI + deskew + correct --psm fixes most Tesseract quality problems.',
        'Cloud OCR for forms/tables at volume; vision LLMs for the hardest pages.',
        'Always carry OCR confidence and method in metadata, and validate critical fields.',
      ],
      exercise: {
        prompt: `Write a **vision-LLM OCR fallback** in TypeScript using the Anthropic Messages API: given a PNG page image (Buffer), return a verbatim Markdown transcription.

Acceptance criteria:
- Sends the image as a base64 \`image\` content block plus instructions.
- Prompt demands verbatim text, Markdown tables for tables, and \`[illegible]\` instead of guesses.
- Reads the model id from \`process.env.LLM_MODEL\` (no sampling params: current Claude models reject non-default temperature).
- Returns the concatenated text blocks.`,
        hints: [
          'Content blocks: { type: "image", source: { type: "base64", media_type: "image/png", data } } then { type: "text", text: "..." }.',
          'Filter response.content for blocks with type === "text".',
          'Ask the model not to summarise or correct spelling.',
        ],
        solution: {
          language: 'typescript',
          code: `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';

const INSTRUCTIONS = [
  'Transcribe this page verbatim as Markdown.',
  '- Keep headings, lists and reading order.',
  '- Render tables as Markdown tables.',
  '- Do NOT summarise, translate or fix spelling.',
  '- If a word cannot be read, write [illegible]; never guess.',
  'Return only the transcription.',
].join('\\n');

export async function visionOcr(png: Buffer): Promise<string> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png.toString('base64') } },
          { type: 'text', text: INSTRUCTIONS },
        ],
      },
    ],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}`,
        },
        explanation:
          'Explicit "verbatim" and "[illegible]" instructions reduce the main risk of LLM OCR: confidently invented text. Placing the image before the instruction follows the provider guidance for vision prompts.',
      },
      quickCheck: {
        question:
          'Your RAG system answers "not found" for questions about 15% of contracts, and all of them were uploaded from a scanner. The parser is PyMuPDF. What should you check first?',
        options: [
          'Whether those PDFs have a text layer at all; if not, route them to OCR',
          'Whether the embedding dimension is too low',
          'Whether chunk overlap is zero',
          'Whether the reranker is enabled',
        ],
        correct: 0,
        explanation:
          'Scanner PDFs are often image-only, so text-layer parsers return empty strings and nothing is indexed. Retrieval settings cannot fix text that was never extracted.',
      },
      source: 'Tesseract docs — Improving the quality of the output (DPI, --psm); AWS Textract pricing page',
    },
  ],
  codeChallenges: [
    {
      id: 'document-ingestion-cc-1',
      title: 'Fix a loader that silently drops scanned pages and leaks boilerplate',
      context:
        'A team loads PDFs for RAG with pypdf and pushes each file as one string. Users report missing answers for scanned documents and every chunk starts with "ACME CONFIDENTIAL".',
      task: 'Rewrite the loader so it (1) keeps page numbers, (2) detects image-only pages and OCRs them, (3) strips repeating headers/footers, and (4) returns per-page records with metadata.',
      starter: {
        language: 'python',
        code: `from pypdf import PdfReader

def load(path):
    reader = PdfReader(path)
    text = ""
    for page in reader.pages:
        text += page.extract_text()
    return [{"text": text, "source": path}]`,
      },
      hints: [
        'Keep a list of per-page dicts instead of one concatenated string.',
        'A page with < 50 extracted characters is probably an image: render it and OCR it.',
        'Find lines that appear at the top or bottom of more than half the pages and remove them.',
      ],
      solution: {
        language: 'python',
        code: `import io
import re
from collections import Counter
import fitz
import pytesseract
from PIL import Image

def _ocr(page: fitz.Page) -> str:
    img = Image.open(io.BytesIO(page.get_pixmap(dpi=300).tobytes("png")))
    return pytesseract.image_to_string(img, config="--oem 1 --psm 4")

def load(path: str) -> list[dict]:
    doc = fitz.open(path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text", sort=True)  # sort fixes most column-order issues
        method = "text-layer"
        if len(text.strip()) < 50:
            text, method = _ocr(page), "tesseract"
        pages.append({"page": i + 1, "text": text, "method": method})

    # Boilerplate = edge lines repeated on > 50% of pages (digits normalised)
    norm = lambda l: re.sub(r"\\d+", "#", l.strip())
    counts = Counter()
    for p in pages:
        lines = [l for l in p["text"].splitlines() if l.strip()]
        counts.update({norm(l) for l in lines[:2] + lines[-2:]})
    boiler = {l for l, n in counts.items() if n > len(pages) / 2 and len(pages) > 2}

    records = []
    for p in pages:
        body = "\\n".join(l for l in p["text"].splitlines() if norm(l) not in boiler).strip()
        if body:
            records.append({
                "text": body,
                "metadata": {"source": path, "page": p["page"], "method": p["method"], "pages": len(pages)},
            })
    return records`,
      },
      explanation:
        'The original lost page numbers (no citations), returned empty text for scans (silent recall loss) and indexed the same header thousands of times. The fix keeps per-page records, OCRs image-only pages, removes repeated edge lines, and records which extraction method was used so bad pages can be audited.',
      followUps: [
        {
          q: 'How would you avoid OCRing a 500-page scan on the request path?',
          a: 'Ingestion runs in background workers from a queue; the upload API returns immediately with a job id, and pages are OCRed in parallel with per-page results cached by content hash.',
        },
        {
          q: 'What if a page has both a text layer and an embedded scanned image (e.g. a signature page)?',
          a: 'Compare text length with image area coverage; if images cover most of the page but text is short, OCR the image regions and merge with the text layer, de-duplicating overlapping words.',
        },
      ],
    },
    {
      id: 'document-ingestion-cc-2',
      title: 'Make a re-ingestion job idempotent and stop ghost documents',
      context:
        'A TypeScript sync job re-reads every file on each run and inserts new rows. After a month the vector table has 5× more rows than documents, and deleted policies still show up in answers.',
      task: 'Change the job so it skips unchanged files, replaces changed ones atomically, and deletes records for files that disappeared.',
      starter: {
        language: 'typescript',
        code: `import { readFile } from 'node:fs/promises';

export async function sync(files: string[], db: any, parse: (b: Buffer) => Promise<string>) {
  for (const f of files) {
    const text = await parse(await readFile(f));
    await db.query('INSERT INTO docs (source, text) VALUES ($1, $2)', [f, text]);
  }
}`,
      },
      hints: [
        'Hash the file bytes with sha256 and compare to a stored hash.',
        'Wrap delete + insert for one source in a transaction.',
        'After the loop, delete sources in the table that are not in `files`.',
      ],
      solution: {
        language: 'typescript',
        code: `import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

export async function sync(files: string[], db: Pool, parse: (b: Buffer) => Promise<string>) {
  const { rows } = await db.query<{ source: string; content_hash: string }>(
    'SELECT DISTINCT source, content_hash FROM docs',
  );
  const known = new Map(rows.map((r) => [r.source, r.content_hash]));
  const stats = { skipped: 0, upserted: 0, deleted: 0 };

  for (const f of files) {
    const buf = await readFile(f);
    const hash = createHash('sha256').update(buf).digest('hex');
    if (known.get(f) === hash) { stats.skipped++; continue; } // unchanged
    const text = await parse(buf);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM docs WHERE source = $1', [f]);
      await client.query('INSERT INTO docs (source, content_hash, text) VALUES ($1, $2, $3)', [f, hash, text]);
      await client.query('COMMIT');
      stats.upserted++;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('ingest failed', f, e); // keep going; one bad file must not stop the sync
    } finally {
      client.release();
    }
  }

  // Ghost cleanup: sources that no longer exist upstream
  const current = new Set(files);
  const gone = [...known.keys()].filter((s) => !current.has(s));
  if (gone.length) {
    const r = await db.query('DELETE FROM docs WHERE source = ANY($1)', [gone]);
    stats.deleted = r.rowCount ?? 0;
  }
  return stats;
}`,
      },
      explanation:
        'Hash comparison makes the job idempotent; delete-then-insert inside one transaction guarantees no duplicate or half-updated rows for a source; and the final reconciliation removes ghost documents. Per-file try/catch isolates poison files.',
      followUps: [
        {
          q: 'The listing of a large SharePoint drive takes 20 minutes. How do you make change detection cheaper?',
          a: 'Use the source system\'s change feed or delta API (e.g. Graph delta queries, S3 event notifications) and only fetch changed items, falling back to a full reconciliation weekly.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'document-ingestion-iq-1',
      difficulty: 'medium',
      question: 'Walk me through how you would design the ingestion pipeline for a company-wide RAG assistant over 200K mixed documents.',
      context: 'Sources: SharePoint (DOCX/PPTX/PDF), Confluence, a scanned-contracts archive. Documents change daily and have permissions.',
      whatInterviewerLooksFor: [
        'Clear stages with routing by file type and text-layer detection',
        'Idempotency and incremental updates via content hashes or change feeds',
        'Metadata for citations, filtering and ACLs',
        'Failure isolation (queues, DLQ, timeouts) and observability',
        'A plan to measure parsing quality',
      ],
      modelAnswer: `**Stages**
1. **Connectors** pull from SharePoint (Graph delta API), Confluence (REST, updated-since) and the archive (S3 events). Each emits \`{source, version, acl, bytes}\`.
2. **Router** by MIME type and text-layer check: DOCX/PPTX → native XML parsing; HTML → boilerplate-stripped Markdown; digital PDF → PyMuPDF, escalating table-heavy or multi-column pages to Docling; scans → OCR (Tesseract or cloud OCR, vision LLM on low confidence).
3. **Cleaning**: NFKC, de-hyphenation, header/footer removal, exact + MinHash dedupe.
4. **Enrichment**: \`source, page, section_path, doc_version, effective_date, acl_groups, lang, parser_version, content_hash\`.
5. **Chunk → embed → upsert** keyed by \`(source, chunk_index)\` with old chunks deleted in the same transaction.

**Operational design**
- Every file is an independent job on a queue (BullMQ/SQS) with per-file timeouts and size caps; failures go to a dead-letter queue with the error.
- A manifest table stores hash + parser version, so re-runs skip unchanged content and parser upgrades trigger controlled re-parses.
- Nightly reconciliation deletes chunks whose source vanished or lost permissions.

**Quality**
- A golden set of ~50 documents per type with expected Markdown; track text similarity and table accuracy per parser version in CI.
- Dashboards: files/hour, OCR rate, parse failures by type, average tokens per page (sudden drops mean empty extractions).

ACLs are copied into chunk metadata at ingestion time so retrieval can filter before the LLM ever sees restricted content.`,
      followUps: [
        {
          q: 'How do you handle a permission change on a document that has not changed content?',
          a: 'Treat ACL as part of the version: the connector emits permission-change events, and you update the acl metadata on existing chunks without re-embedding.',
        },
        {
          q: 'How would you prioritise the initial backfill?',
          a: 'Backfill most-used spaces first (by view counts), run OCR-heavy archives last on cheaper batch capacity, and expose coverage metrics so users know what is indexed.',
        },
      ],
      pitfalls: [
        'Treating ingestion as a one-off script rather than an incremental, idempotent system',
        'Forgetting deletions and permission changes',
        'Using one parser for every file type',
      ],
    },
    {
      id: 'document-ingestion-iq-2',
      difficulty: 'hard',
      question: 'Answers about numbers in financial reports are frequently wrong, though the right page is retrieved. How do you diagnose and fix it?',
      context: 'PDF annual reports with multi-page tables; PyMuPDF text extraction; 800-token chunks.',
      whatInterviewerLooksFor: [
        'Checks the parsed text before blaming retrieval or the LLM',
        'Recognises table flattening and column misalignment',
        'Proposes table-aware parsing and serialisation',
        'Handles tables split across pages and chunks',
      ],
      modelAnswer: `**Diagnose from the bottom up.** Pull the exact chunks fed to the LLM for 20 failing questions and compare them with the PDF. In most cases the text is the problem: PyMuPDF emits table cells in paint order, so a row like "Revenue | 2023 | 2024" becomes "Revenue 4.2 3.9 2023 2024" or columns from two tables interleave. The model then picks the wrong number.

**Fixes**
1. **Table-aware parsing.** Detect tables (PyMuPDF \`find_tables\`, pdfplumber, or Docling's TableFormer) and extract them as grids, separately from body text.
2. **Serialise for retrieval and reading.** Emit Markdown tables for the LLM, and for embedding also emit row-level lines that repeat headers ("Revenue | FY2024: 3.9bn | FY2023: 4.2bn").
3. **Keep tables whole.** Chunk tables as atomic units (or split by rows while repeating the header), attach the caption and units ("in USD millions") to every piece.
4. **Multi-page tables.** Merge continuation tables when the header repeats or columns align, before chunking.
5. **Validate.** Check that row totals equal reported totals; a mismatch flags a bad parse for review.

**Measure.** Build a 50-question numeric golden set; track exact-match accuracy before and after. Typical outcome: the parse change matters far more than any prompt tweak.`,
      followUps: [
        {
          q: 'Would you send the page image to a vision model instead?',
          a: 'For the hardest tables yes, but as a fallback: it is slower and can hallucinate digits, so cross-check against the text-layer numbers and prefer them when they agree.',
        },
        {
          q: 'How do you keep units like "in thousands" attached to the values?',
          a: 'Capture the caption and unit line during parsing and store them in table metadata, then prefix them to every serialised row or table chunk.',
        },
      ],
      pitfalls: [
        'Tuning the prompt or the retriever before looking at the parsed text',
        'Splitting tables mid-row across chunks',
        'Dropping captions and units',
      ],
    },
    {
      id: 'document-ingestion-iq-3',
      difficulty: 'hard',
      question: 'When would you choose a vision LLM for OCR over Tesseract or a cloud OCR service, and how do you make it safe?',
      whatInterviewerLooksFor: [
        'Cost/latency awareness per page',
        'Understanding of hallucination risk specific to generative OCR',
        'A tiered routing design',
        'Validation and auditability',
      ],
      modelAnswer: `**Choice by page type**

| Page | Best tool | Why |
|---|---|---|
| Clean printed scan | Tesseract / PaddleOCR | Free, fast, accurate enough |
| Forms, invoices, tables at volume | Cloud OCR (Textract, Document AI, Azure DI) | Key-value and table extraction, confidence scores, predictable per-page price |
| Handwriting, stamps, charts, complex multi-column layouts | Vision LLM | Understands layout and context, emits Markdown directly |

**Tiered routing.** Run the cheap engine first; escalate pages with low mean word confidence (< 60), high non-dictionary ratio, or detected handwriting. Typically only 2–10% of pages reach the vision model, so cost stays near the cheap tier.

**Making it safe**
- **Hallucination:** generative OCR can output fluent text that is not on the page, or "fix" numbers. Use temperature 0, require verbatim transcription with \`[illegible]\` markers, and forbid summarisation.
- **Cross-check:** compare numbers and names with the classical OCR output; disagreements are flagged.
- **Field validation:** totals add up, dates parse, IDs match checksums.
- **Audit:** store the page image, method and model version in metadata; show the image next to citations for high-stakes answers.
- **Privacy:** use no-retention, region-pinned endpoints or self-hosted VLMs for sensitive documents.`,
      followUps: [
        {
          q: 'How would you estimate the accuracy of each tier?',
          a: 'Hand-label ~200 pages across types, compute character/word error rate and field-level exact match per engine, and set routing thresholds from that data.',
        },
        {
          q: 'What about very long documents — send the whole PDF to the model?',
          a: 'Page-by-page is safer: smaller requests, parallelism, page-level citations, and a failure only affects one page rather than the document.',
        },
      ],
      pitfalls: [
        'Sending every page to a vision LLM by default',
        'Trusting vision-LLM output without validation',
        'Ignoring data residency for cloud OCR',
      ],
    },
    {
      id: 'document-ingestion-iq-4',
      difficulty: 'medium',
      question: 'Your top-5 retrieval results often contain three near-identical passages. Where in the pipeline do you fix this, and how?',
      whatInterviewerLooksFor: [
        'Identifies duplicates as an ingestion problem first',
        'Knows exact vs near-duplicate detection (hash, MinHash/LSH)',
        'Keeps the authoritative version',
        'Mentions retrieval-time diversification as a secondary fix',
      ],
      modelAnswer: `**Root cause:** the corpus contains copies: the same PDF in several folders, yearly re-issues of a policy that differ only in the date, or pages mirrored across wiki spaces. Each copy produces near-identical chunks with near-identical embeddings, so they crowd the top-k.

**Fix at ingestion (primary)**
1. **Exact duplicates:** sha256 of normalised text; keep one canonical record and store alternate source paths in metadata.
2. **Near duplicates:** MinHash signatures over 3–5 word shingles with LSH buckets; Jaccard ≥ ~0.9 forms a cluster.
3. **Pick the authority:** within a cluster keep the newest effective version (or the one from the authoritative space); mark others \`superseded\` so they can be excluded by a metadata filter rather than deleted outright.
4. Run dedupe at chunk level too: boilerplate paragraphs (disclaimers) repeated in thousands of docs should be removed or indexed once.

**Fix at retrieval (secondary)**
- Collapse results with the same \`cluster_id\` and apply MMR (maximal marginal relevance) to diversify the final context.

**Verify:** measure the duplicate rate in top-5 on a query sample before and after; it should drop to near zero while recall@5 rises because the freed slots carry new information.`,
      followUps: [
        {
          q: 'Why not just rely on MMR at query time?',
          a: 'MMR treats the symptom on every query, costs extra compute, and still wastes index space and embedding spend; removing duplicates once at ingestion fixes it for all queries.',
        },
        {
          q: 'What if two versions are both legitimately needed (e.g. old contract still in force)?',
          a: 'Keep both but make version metadata explicit (effective_date, status) and let filters or the query select the right one instead of merging them.',
        },
      ],
      pitfalls: [
        'Deleting the newest version of a duplicate cluster',
        'Only deduplicating exact byte-level copies',
        'Ignoring repeated boilerplate paragraphs',
      ],
    },
    {
      id: 'document-ingestion-iq-5',
      difficulty: 'expert',
      question: 'You must choose a PDF parser for 5M pages of mixed documents. How do you evaluate and decide?',
      context: 'Budget is limited; some pages are scans, some are dense tables, most are plain text.',
      whatInterviewerLooksFor: [
        'Builds a representative labelled sample instead of trusting public benchmarks',
        'Measures multiple quality dimensions and throughput/cost',
        'Proposes a routing mix rather than a single winner',
        'Computes cost at scale',
      ],
      modelAnswer: `**1. Representative sample.** Stratify 300–500 pages by type (plain text, multi-column, tables, forms, scans) in proportion to the corpus, oversampling hard types. Hand-label reference Markdown (or use a strong parser + human correction).

**2. Metrics per parser and per stratum**
- Text: normalised edit similarity vs reference.
- Reading order: fraction of paragraphs in the correct sequence.
- Tables: TEDS (tree-edit-distance similarity) or cell-level F1.
- Headings: recall of section titles (matters for structure-aware chunking).
- Throughput (pages/s on your hardware) and $ per 1K pages.
- **Downstream:** recall@5 on a 100-question QA set using each parser's output — the metric that matters.

**3. Candidates:** PyMuPDF/pymupdf4llm, pdfplumber (tables), Docling, unstructured hi_res, a cloud document AI, a vision-LLM fallback.

**4. Decide on a routing mix.** Public benchmarks disagree by document type (the same tool can score ~99% on contracts and ~50% on invoices), so the usual winner is: PyMuPDF for the ~80% plain pages, Docling for table/multi-column pages, OCR for scans, vision LLM for the residual.

**5. Cost at scale.** At ~200 pages/s, PyMuPDF processes 4M pages in under 6 CPU-hours. Docling at ~1 page/s on CPU for 800K hard pages needs ~220 CPU-hours (or far less on GPU). 200K scans via cloud OCR at an illustrative $1.50/1K pages is ~$300. The mix gives most of the quality for a fraction of "Docling everything".`,
      followUps: [
        {
          q: 'How do you keep the decision valid as parsers improve?',
          a: 'Keep the labelled set and harness in CI, rerun quarterly or on new parser releases, and use the parser_version manifest to re-parse only strata where a new parser wins.',
        },
        {
          q: 'How do you detect a parser regression in production without labels?',
          a: 'Monitor proxies: characters per page, share of empty pages, non-dictionary token rate, and table counts per document; alert when distributions shift.',
        },
      ],
      pitfalls: [
        'Picking a parser from a blog benchmark',
        'Measuring only text similarity and not downstream retrieval',
        'Ignoring throughput and cost at the full corpus size',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'document-ingestion-est-1',
      question: 'Estimate the time and cost to parse and OCR a 2M-page document backlog with a tiered pipeline.',
      assumptions: [
        '70% digital simple pages, 20% complex (tables/multi-column), 10% scans',
        'PyMuPDF: 100 pages/s per CPU core',
        'Docling on GPU: 5 pages/s per GPU; GPU at an illustrative $1.20/hour',
        'Cloud OCR: illustrative $1.50 per 1,000 pages; 5% of scans escalate to a vision LLM at $0.006/page',
        '32 CPU cores and 4 GPUs available',
      ],
      steps: [
        { label: 'Simple pages', calc: '2M × 0.7 = 1.4M pages ÷ (100 pages/s × 32 cores) = 437 s ≈ 7 min' },
        { label: 'Complex pages', calc: '2M × 0.2 = 400K pages ÷ (5 × 4 GPUs = 20 pages/s) = 20,000 s ≈ 5.6 h' },
        { label: 'Complex cost', calc: '5.6 h × 4 GPUs × $1.20 ≈ $27' },
        { label: 'Scans', calc: '2M × 0.1 = 200K pages × $1.50/1K = $300' },
        { label: 'Vision fallback', calc: '200K × 5% = 10K pages × $0.006 = $60' },
        { label: 'Total', calc: '≈ $390 and ~6 h wall clock (GPU tier is the critical path; OCR runs in parallel)' },
      ],
      answer: 'About $390 and roughly 6 hours, dominated in time by the layout-model tier and in money by cloud OCR.',
      insight:
        'Parsing is cheap compared with the cost of bad text. The tiering matters: running Docling on all 2M pages would take ~28 h on the same GPUs, and sending everything to a vision LLM would cost ~$12,000.',
      followUps: [
        {
          q: 'How does the estimate change if you self-host Tesseract for the scans?',
          a: 'At ~1 page/s per core, 200K pages need ~56 CPU-hours (≈1.7 h on 32 cores) and the $300 OCR bill disappears, at the cost of weaker table/form extraction.',
        },
      ],
    },
    {
      id: 'document-ingestion-est-2',
      question: 'How many tokens (and embedding dollars) does header/footer removal and deduplication save on a 50,000-document corpus?',
      assumptions: [
        '50,000 docs × 20 pages = 1M pages, ~500 tokens/page of body text',
        'Header + footer ≈ 25 tokens per page',
        '15% of documents are exact or near duplicates',
        'Embedding price: illustrative $0.02 per 1M tokens; chunks re-embedded on every full re-index, 12 re-indexes/year',
      ],
      steps: [
        { label: 'Raw tokens', calc: '1M pages × (500 + 25) = 525M tokens' },
        { label: 'After header/footer removal', calc: '1M × 500 = 500M tokens (−25M, ~4.8%)' },
        { label: 'After dedupe', calc: '500M × 0.85 = 425M tokens (−75M)' },
        { label: 'Saving per index run', calc: '(525M − 425M) = 100M tokens × $0.02/1M = $2' },
        { label: 'Yearly embedding saving', calc: '$2 × 12 = $24' },
        { label: 'Storage saving', calc: '100M tokens ÷ 500 tokens/chunk = 200K fewer chunks × 1536 dims × 4 B ≈ 1.2 GB of vectors' },
      ],
      answer: 'About 100M tokens (~19%) per index, worth only ~$24/year in embeddings but ~200K fewer vectors and much cleaner top-k results.',
      insight:
        'With cheap embedding models the money saving is trivial; the real wins are retrieval quality (no duplicate-filled top-k), smaller indexes, and fewer wasted context tokens at query time, which are 50–100× more expensive than embedding tokens.',
      followUps: [
        {
          q: 'Where would the same 19% reduction save serious money?',
          a: 'In LLM context: if each answer includes 4K retrieved tokens at an illustrative $3/1M input, removing duplicate passages that waste ~20% of context saves ~$0.0024/query, i.e. ~$2,400 per million queries.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'document-ingestion-mcq-01',
      difficulty: 'medium',
      question:
        'A digital PDF manual (no scans) of 300 pages must be ingested quickly for a demo. Text, headings and simple lists matter; there are almost no tables. Which choice is best?',
      options: [
        'Render every page to an image and run Tesseract',
        'Use PyMuPDF / pymupdf4llm to extract Markdown from the text layer',
        'Send every page to a vision LLM for transcription',
        'Run Docling with table recognition on all pages on CPU',
      ],
      correct: [1],
      explanation:
        'The text layer already holds exact characters, and pymupdf4llm emits headings as Markdown in seconds. OCR adds errors to a document that has perfect text; vision LLMs cost far more; Docling would work but is much slower with no table benefit here.',
      followUps: [
        {
          q: 'What signal would make you escalate some pages to a layout model?',
          a: 'Detected tables, multiple column start positions, or very low text density per page are cheap heuristics that flag pages where reading order or structure is likely to break.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-02',
      difficulty: 'hard',
      question: 'This ingestion step runs nightly. Which problems will it cause over time? (Select ALL that apply)',
      code: {
        language: 'typescript',
        code: `for (const file of await listFiles(bucket)) {
  const text = await parse(await download(file));
  const chunks = split(text);
  for (const c of chunks) {
    await vectors.insert({ id: crypto.randomUUID(), text: c, source: file });
  }
}`,
      },
      options: [
        'Every run duplicates all chunks, so top-k fills with copies',
        'Chunks from deleted files are never removed',
        'The random UUIDs make vector search approximate instead of exact',
        'Unchanged files are re-parsed and re-embedded every night',
      ],
      correct: [0, 1, 3],
      explanation:
        'Random ids plus insert (not upsert) duplicate every chunk each run; nothing reconciles deletions; and there is no hash check so all work repeats. Id format has nothing to do with whether the index is exact or approximate.',
      followUps: [
        {
          q: 'What deterministic id scheme fixes the duplication?',
          a: 'Use ids like sha256(source + ":" + chunkIndex) or source + "#" + chunkIndex and upsert, plus deleting chunk indexes beyond the new count when a document shrinks.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-03',
      difficulty: 'hard',
      question:
        'A two-column scientific PDF parsed with a basic extractor yields sentences that jump between unrelated topics mid-line. What is the most targeted fix?',
      options: [
        'Increase chunk overlap to 50%',
        'Use a parser that reconstructs reading order (block sorting or a layout model)',
        'Switch to a larger embedding model',
        'Lower-case and strip punctuation before embedding',
      ],
      correct: [1],
      explanation:
        'The text is interleaved across columns, so the defect is reading order. Overlap and bigger embedding models only process the already-scrambled text; normalising case does nothing for order.',
      followUps: [
        {
          q: 'How could you detect this problem automatically across a corpus?',
          a: 'Look for pages whose text blocks have two or more distinct x-start clusters, or measure sentence perplexity with a small language model; scrambled order sharply raises perplexity.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-04',
      difficulty: 'medium',
      question:
        'Your OCR output for scanned invoices contains errors like "S1,2O0" for "$1,200". The scans are rendered at 120 DPI. What should you change first?',
      options: [
        'Switch to a vision LLM for all invoices',
        'Re-render at ~300 DPI and deskew/binarise before OCR',
        'Add a spell checker after OCR',
        'Use a smaller chunk size for invoices',
      ],
      correct: [1],
      explanation:
        'Low resolution is the most common root cause of character confusions; 300 DPI with basic image cleanup fixes most of them for free. A spell checker cannot repair numbers, and jumping to a vision LLM for everything adds cost before fixing the input.',
      followUps: [
        {
          q: 'After fixing DPI, how would you protect amounts specifically?',
          a: 'Validate amounts with regex and arithmetic checks (line items sum to the total) and route invoices that fail validation to a stronger engine or human review.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-05',
      difficulty: 'hard',
      question: 'Which statements about vision-LLM OCR are accurate? (Select ALL that apply)',
      options: [
        'It can output fluent text that does not appear on the page',
        'It handles handwriting and complex layouts better than classical OCR in many cases',
        'It returns per-character confidence scores like Tesseract by default',
        'It usually costs more per page than classical or cloud OCR',
      ],
      correct: [0, 1, 3],
      explanation:
        'Generative models can hallucinate, are strong on messy layouts and handwriting, and are typically the most expensive per page. Chat APIs do not return per-character OCR confidences by default, which is one reason cross-checks are needed.',
      followUps: [
        {
          q: 'How can you get a confidence-like signal from a vision LLM?',
          a: 'Compare its transcription with a classical OCR pass, or run it twice and measure agreement; also ask it to mark unreadable words with [illegible] and count those markers.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-06',
      difficulty: 'expert',
      question: 'What does this header/footer detector get wrong?',
      code: {
        language: 'python',
        code: `from collections import Counter

def boilerplate(pages: list[str]) -> set[str]:
    counts = Counter()
    for p in pages:
        for line in p.splitlines():
            counts[line.strip()] += 1
    return {l for l, n in counts.items() if n > 3}`,
      },
      options: [
        'It counts lines anywhere on the page and uses an absolute threshold, so repeated body lines (e.g. table headers) get deleted',
        'It should use a set per page, otherwise footers are never detected',
        'Counter cannot count strings',
        'Stripping whitespace makes all lines identical',
      ],
      correct: [0],
      explanation:
        'Real boilerplate sits at page edges and repeats on a large fraction of pages. Counting all lines with a fixed threshold of 3 flags legitimate repeated lines such as table column headers or "Note:" lines. The detector also misses "Page 3 of 40" because digits are not normalised. Footers would still be detected without per-page sets; the other options are false.',
      followUps: [
        {
          q: 'Fix the threshold so it scales with document length.',
          a: 'Use a relative threshold such as n > 0.5 × number_of_pages, only consider the first and last two non-empty lines of each page, and replace digits with a placeholder before counting.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-07',
      difficulty: 'hard',
      question:
        'You switch from PyMuPDF to Docling for all PDFs. Retrieval quality improves on reports, but the nightly job now misses its window. What is the best next step?',
      options: [
        'Revert to PyMuPDF everywhere',
        'Route only table-heavy or multi-column pages to Docling and keep PyMuPDF for the rest, caching by content hash',
        'Reduce the number of documents indexed',
        'Run Docling only on weekends',
      ],
      correct: [1],
      explanation:
        'Routing keeps the quality gains where they matter and restores throughput. Caching by hash means unchanged pages are never re-parsed. Reverting loses quality; indexing less or less often trades away coverage and freshness.',
      followUps: [
        {
          q: 'What else besides routing reduces Docling cost?',
          a: 'Run it on GPU workers in batches, disable features you do not need (e.g. OCR for digital pages, picture classification), and parallelise across documents.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-08',
      difficulty: 'medium',
      question:
        'An HTML help-centre crawl produces chunks that start with "Home > Products > Help | Sign in | Cookie settings". Which fix addresses the cause?',
      options: [
        'Raise the similarity threshold at query time',
        'Extract the main content (strip nav, header, footer, scripts) before chunking',
        'Use a bigger chunk size so the menu is a smaller fraction',
        'Add the menu text to a stop-word list in the embedding model',
      ],
      correct: [1],
      explanation:
        'The crawler is indexing page chrome. Main-content extraction (Readability-style or trafilatura) removes it at the source. Bigger chunks dilute but do not remove it; embedding models have no stop-word list; query thresholds do not change what was indexed.',
      followUps: [
        {
          q: 'The breadcrumb is actually useful context. How do you keep it without polluting text?',
          a: 'Parse the breadcrumb into metadata (section_path) and optionally prepend a short "Section: Products > Help" line, rather than leaving raw navigation markup in the body.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-09',
      difficulty: 'expert',
      question: 'This page-routing check is used to decide whether to OCR. Which pages will be misrouted? (Select ALL that apply)',
      code: {
        language: 'python',
        code: `def needs_ocr(page) -> bool:
    return len(page.get_text("text")) == 0`,
      },
      options: [
        'Scanned pages with an invisible, garbage OCR layer added by the scanner',
        'Scanned pages that contain only a page number in the text layer',
        'Digital pages with a normal text layer',
        'Scans with a stamped text header (e.g. "RECEIVED") as real text and the body as an image',
      ],
      correct: [0, 1, 3],
      explanation:
        'Requiring exactly zero characters misses scans that carry a few real characters (page numbers, stamps) or a bad embedded OCR layer. Use a minimum character threshold, image coverage, and a garbage-text check. Normal digital pages are correctly routed to the text-layer path.',
      followUps: [
        {
          q: 'How do you detect a garbage OCR layer added by a scanner?',
          a: 'Compute the share of tokens that are dictionary words or the character n-gram perplexity; if most tokens are nonsense, ignore the layer and re-OCR the page image.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-10',
      difficulty: 'hard',
      question:
        'After upgrading your cleaning code, cache hit rate for "unchanged" documents drops to zero and every file is re-embedded. What is the most likely reason?',
      options: [
        'The vector database lost its index',
        'The manifest key includes the cleaned-text hash or cleaning version, which changed for every document',
        'The embedding model changed its dimension',
        'Documents were re-uploaded by users',
      ],
      correct: [1],
      explanation:
        'Changing cleaning logic changes output text, so hashes of cleaned text (or an explicit version key) all change. That is correct behaviour when the change is intentional, but it should be a deliberate, scheduled re-index rather than a surprise.',
      followUps: [
        {
          q: 'How do you roll out a cleaning change without re-embedding everything at once?',
          a: 'Version the cleaner, compare old vs new output on a sample, and re-process in throttled batches (or only document types the change affects) while the old index keeps serving.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-11',
      difficulty: 'expert',
      question:
        'Which metadata fields are most important to attach at ingestion time for a permission-aware, citation-capable RAG system? (Select ALL that apply)',
      options: [
        'Source URI and page number',
        'ACL groups or tenant id',
        'The embedding vector norm',
        'Document version or effective date',
      ],
      correct: [0, 1, 3],
      explanation:
        'Source and page enable citations; ACL/tenant enables pre-retrieval filtering so restricted text never reaches the LLM; version/effective date lets you prefer current policies. The vector norm is a property of the embedding, not useful metadata for filtering or citation.',
      followUps: [
        {
          q: 'Why filter on ACLs before retrieval instead of after generation?',
          a: 'Post-generation filtering is too late: the model may already have used restricted text in its answer. Pre-filtering guarantees restricted chunks are never in the context.',
        },
      ],
    },
    {
      id: 'document-ingestion-mcq-12',
      difficulty: 'medium',
      question:
        'Two versions of the travel policy (2023 and 2024) differ only in per-diem amounts. Both are indexed and the bot sometimes quotes 2023 numbers. What is the best ingestion-side fix?',
      options: [
        'Delete both and re-upload the 2024 version only, with no metadata',
        'Detect the near-duplicate pair, mark the older version as superseded in metadata and exclude superseded docs by default',
        'Increase top-k so both versions are always retrieved',
        'Lower the temperature of the LLM',
      ],
      correct: [1],
      explanation:
        'Near-duplicate detection plus explicit version metadata keeps history available but out of default retrieval. Deleting loses audit history; higher top-k gives the model both conflicting answers; temperature does not change which document is retrieved.',
      followUps: [
        {
          q: 'A user explicitly asks "what was the per diem in 2023?" — how is it handled?',
          a: 'A self-query or filter extractor detects the year and lifts the superseded exclusion for that query, filtering on effective_date = 2023.',
        },
      ],
    },
  ],
};

export default topic;
