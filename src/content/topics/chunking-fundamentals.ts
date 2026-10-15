import type { Topic } from '../../types';

const topic: Topic = {
  id: 'chunking-fundamentals',
  phase: 'ingestion',
  order: 2,
  title: 'Chunking Fundamentals: Strategies, Size, Overlap and Recursive Splitting',
  subtitle:
    'Cut documents into pieces that are small enough to retrieve precisely and big enough to make sense on their own.',
  estimatedMinutes: 44,
  sources: [
    'LangChain JS docs: @langchain/textsplitters, RecursiveCharacterTextSplitter and TokenTextSplitter',
    'LangChain Python docs: Text splitters (RecursiveCharacterTextSplitter.from_tiktoken_encoder)',
    'Pinecone Learn: Chunking strategies for LLM applications',
    'LlamaIndex docs: SentenceSplitter and the default chunk_size=1024 / chunk_overlap=20',
    'OpenAI docs: Embeddings (text-embedding-3-small, 8,191-token input limit)',
    'BAAI bge-m3 model card (8,192-token input) and sentence-transformers all-MiniLM-L6-v2 (256 word-piece truncation)',
    'Chroma Research 2024: Evaluating Chunking Strategies for Retrieval',
  ],
  tags: ['chunking', 'text-splitting', 'rag', 'langchain', 'tokens', 'overlap'],
  cheatSheet: [
    'A chunk is the unit you embed, retrieve and paste into the prompt; it must be meaningful on its own.',
    'Strategies, simplest first: fixed-size → sentence/paragraph → recursive → document-specific (Markdown/code) → semantic/structural (advanced topic).',
    'Measure size in tokens, not characters: ~4 chars ≈ 1 token in English, much less for code, CJK and numbers.',
    'Sane defaults: 256–512 tokens for fact lookup, 512–1,024 for explanatory text; overlap 10–20% of chunk size.',
    'Never exceed the embedding model\'s max input: all-MiniLM-L6-v2 truncates at 256 word pieces; text-embedding-3-* accepts 8,191 tokens; bge-m3 8,192.',
    'RecursiveCharacterTextSplitter tries separators in order ["\\n\\n", "\\n", " ", ""] and only falls to the next one when a piece is still too big.',
    'LangChain chunkSize/chunkOverlap are characters by default; use a token lengthFunction (or from_tiktoken_encoder in Python) to count tokens.',
    'Overlap is insurance against boundary cuts, not a cure: it multiplies storage by 1/(1 − overlap/size) and creates near-duplicate hits.',
    'Tune chunk size with an eval set (recall@k + answer accuracy), not intuition: try 256 / 512 / 1,024 and keep the winner per document type.',
    'Always store metadata on each chunk: source, page, chunk index, start offset, heading path.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Chunking Strategies — fixed, sentence, paragraph, recursive and document-specific',
      body: `**Intuition:** you cannot hand a 200-page manual to the model for every question, so you cut it into index cards. The question is where to cut: every 500 characters (scissors without looking), at sentence ends, at paragraph ends, or along the document's own sections.

**Mechanics — the main strategies:**

| Strategy | How it cuts | Good for | Risk |
|---|---|---|---|
| Fixed-size | Every N tokens/chars | Uniform logs, quick baselines | Splits mid-sentence and mid-word |
| Sentence | Sentence tokenizer, pack sentences up to N | FAQs, short articles | Very short or very long sentences |
| Paragraph | Split on blank lines | Well-written prose | Paragraphs vary from 10 to 2,000 tokens |
| Recursive | Try paragraph → line → sentence → word until under N | General default | Ignores headings and tables |
| Document-specific | Markdown headers, HTML tags, code functions | Docs, wikis, code | Needs a parser per format |
| Semantic / structural / parent-child | Embedding breakpoints, hierarchy | Mixed, long documents | More compute (see Advanced Chunking) |

Every strategy trades **precision** (small, focused chunks match specific questions) against **context** (larger chunks carry the surrounding explanation the LLM needs).

**When to use what:** start with recursive splitting at ~512 tokens with ~10–15% overlap as a baseline; switch to document-specific splitters when your source has reliable structure (Markdown, HTML, code); reach for semantic or parent-child approaches only when an eval shows the baseline failing.`,
      example: `Text: "Refunds are issued within 14 days. Items must be unused. Damaged items: contact support within 48 hours for a replacement."

- **Fixed 60 chars:** chunk 1 = "Refunds are issued within 14 days. Items must be unused. Da", chunk 2 = "maged items: contact support within 48 hours for a replacem…". The query "damaged item policy" embeds against a chunk starting with "maged", scoring 0.61.
- **Sentence-packed to 60 chars:** chunk 1 = first two sentences, chunk 2 = "Damaged items: contact support within 48 hours for a replacement." The same query now scores 0.83 against chunk 2, and the answer cites the 48-hour rule.`,
      diagram: `Document
   │
   ├─ fixed-size ─────▶ |████|████|████|  cuts anywhere
   ├─ sentence ───────▶ [s1 s2][s3][s4 s5] packs whole sentences
   ├─ paragraph ──────▶ [¶1][¶2 ......][¶3] uneven sizes
   ├─ recursive ──────▶ ¶ → line → sentence → word until ≤ N
   └─ doc-specific ───▶ # H1 / ## H2 / def fn(): boundaries`,
      code: [
        {
          language: 'typescript',
          title: 'Fixed-size vs sentence-packed chunking side by side',
          code: `// Naive: cut every maxChars characters (will split words and sentences)
export function fixedSize(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
  return out;
}

// Better: split into sentences, then pack whole sentences up to maxChars
export function sentencePacked(text: string, maxChars: number): string[] {
  // Intl.Segmenter handles "Dr.", "e.g." and non-English punctuation better than a regex
  const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
  const sentences = [...seg.segment(text)].map((s) => s.segment.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if (current && current.length + 1 + s.length > maxChars) {
      chunks.push(current);
      current = s;
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current) chunks.push(current); // an oversized single sentence stays whole here
  return chunks;
}

const text = 'Refunds are issued within 14 days. Items must be unused. ' +
  'Damaged items: contact support within 48 hours for a replacement.';
console.log(fixedSize(text, 60));
console.log(sentencePacked(text, 60));`,
        },
      ],
      prosCons: {
        pros: [
          'Fixed-size is trivial, fast and predictable for capacity planning.',
          'Sentence/paragraph packing keeps ideas intact, giving cleaner embeddings and better citations.',
          'Document-specific splitting reuses structure authors already created (headings, functions).',
        ],
        cons: [
          {
            con: 'Fixed-size cuts mid-sentence, so neither half embeds the full idea.',
            fix: 'Use recursive or sentence-packed splitting and add 10–20% overlap as a safety net.',
          },
          {
            con: 'Paragraph splitting produces wildly uneven chunks (one-liners and 2,000-token walls).',
            fix: 'Merge tiny paragraphs up to a minimum size and recursively split oversized ones below the maximum.',
          },
          {
            con: 'No single strategy suits PDFs, code and chat logs at once.',
            fix: 'Route by document type to different splitters and keep per-type chunk settings in config.',
          },
        ],
      },
      keyPoints: [
        'Chunking trades retrieval precision against context completeness.',
        'Recursive splitting at ~512 tokens is the standard baseline.',
        'Use document-specific splitters when the source has reliable structure.',
        'Pick strategies per document type and verify with an eval set.',
      ],
      exercise: {
        prompt: `Write \`paragraphPack(text, minChars, maxChars)\` that splits on blank lines, **merges** consecutive paragraphs until they reach at least \`minChars\`, and **never** emits a chunk above \`maxChars\` (if a single paragraph is larger, split it with \`sentencePacked\` from the example).

Acceptance criteria:
- No empty chunks; paragraphs joined with a blank line.
- A 2,000-char paragraph with \`maxChars = 800\` becomes ≥ 3 chunks.
- Short paragraphs ("Note:", "See below.") are merged into neighbours.`,
        starter: {
          language: 'typescript',
          code: `import { sentencePacked } from './chunkers';

export function paragraphPack(text: string, minChars: number, maxChars: number): string[] {
  const paras = text.split(/\\n\\s*\\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = '';
  // TODO: for each paragraph, split it if too big, otherwise append to buf
  // TODO: flush buf when adding would exceed maxChars or when buf >= minChars
  return out;
}`,
        },
        hints: [
          'Handle the oversized-paragraph case first: flush buf, then push each sentencePacked piece.',
          'Only flush when adding the next paragraph would exceed maxChars, or when buf already reached minChars.',
          'Remember to flush the remaining buffer after the loop.',
        ],
        solution: {
          language: 'typescript',
          code: `import { sentencePacked } from './chunkers';

export function paragraphPack(text: string, minChars: number, maxChars: number): string[] {
  const paras = text.split(/\\n\\s*\\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };

  for (const p of paras) {
    if (p.length > maxChars) {        // oversized paragraph: split by sentences
      flush();
      out.push(...sentencePacked(p, maxChars));
      continue;
    }
    const joined = buf ? buf + '\\n\\n' + p : p;
    if (joined.length > maxChars) {   // would overflow: emit what we have
      flush();
      buf = p;
    } else {
      buf = joined;
      if (buf.length >= minChars) flush(); // big enough to stand alone
    }
  }
  flush();
  return out;
}`,
        },
        explanation:
          'Merging below a minimum avoids useless one-line chunks that embed poorly; the maximum guard keeps every chunk under the embedding model limit; falling back to sentence packing for walls of text keeps sentences whole.',
      },
      quickCheck: {
        question:
          'A support FAQ has one question-and-answer pair per paragraph, each 40–120 tokens. Which strategy fits best?',
        options: [
          'Fixed-size 1,024-token chunks',
          'Paragraph-based chunks, one Q&A pair each (merging only very short ones)',
          'Character-level chunks of 100 characters',
          'One chunk per whole FAQ page',
        ],
        correct: 1,
        explanation:
          'Each Q&A pair is a natural, self-contained unit. 1,024-token or whole-page chunks blend many answers into one embedding, and 100-character cuts break pairs apart.',
      },
      source: 'Pinecone Learn — Chunking strategies for LLM applications',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Chunk Size and Overlap — choosing numbers you can defend',
      body: `**Intuition:** chunk size is the zoom level of your search. Zoomed in (128 tokens) you find exact sentences but lose the surrounding story; zoomed out (2,000 tokens) every chunk mentions everything and the embedding becomes a blurry average. Overlap is the tape that stops a key sentence falling into the crack between two cards.

**Mechanics.**
- **Measure in tokens.** ~4 characters ≈ 1 token for English prose, but code, URLs, numbers and CJK text are far denser. A "1,000-character" chunk is ~250 tokens of prose but ~400 of JSON.
- **Respect the embedding limit.** Text beyond the model's window is silently truncated: \`all-MiniLM-L6-v2\` stops at 256 word pieces, many BERT-style models at 512, \`text-embedding-3-*\` at 8,191, \`bge-m3\` at 8,192. A long window does not mean long chunks embed well.
- **Typical ranges.** 256–512 tokens for fact lookup (FAQs, policies), 512–1,024 for explanatory/technical text. LlamaIndex defaults to 1,024 with 20 overlap; many LangChain examples use 1,000 characters with 200 overlap.
- **Overlap.** 10–20% of chunk size. Storage grows by \`size / (size − overlap)\`: 512 with 128 overlap stores ~1.33× the tokens.
- **Context budget.** \`top_k × chunk_tokens\` must fit your prompt budget: 8 × 512 = 4K tokens; 8 × 2,048 = 16K tokens per query.

**When to use what:** pick a size from the ranges, then run 3 configurations (e.g. 256/512/1,024) against a 50–100 question eval set and keep the winner per document type.`,
      example: `A 100-page policy handbook (~50K tokens), eval set of 60 questions, top-k = 5:

| Size / overlap | Chunks | Recall@5 | Prompt tokens |
|---|---|---|---|
| 128 / 0 | 391 | 0.71 | 640 |
| 512 / 64 | 112 | 0.88 | 2,560 |
| 1,024 / 128 | 56 | 0.82 | 5,120 |
| 2,048 / 256 | 28 | 0.69 | 10,240 |

512/64 wins: 128-token chunks lose qualifying sentences ("unless…"), and 2,048-token chunks blend several policies into one vector. It also costs half the prompt tokens of 1,024.`,
      diagram: `size = 512, overlap = 64, stride = 448

tokens: 0        448       512      896      960      1344
        |---- chunk 1 -----|
                  |---- chunk 2 -----|
                           |  64  |   ← shared tokens
                                     |---- chunk 3 -----|

storage factor = 512 / (512 - 64) ≈ 1.14×`,
      code: [
        {
          language: 'typescript',
          title: 'Token-accurate sliding window with overlap',
          code: `import { encoding_for_model } from 'tiktoken';

// cl100k_base / o200k_base tokenizers approximate most modern embedding models
const enc = encoding_for_model('text-embedding-3-small');

export function tokenWindows(text: string, size = 512, overlap = 64) {
  if (overlap >= size) throw new Error('overlap must be smaller than size');
  const ids = enc.encode(text);
  const stride = size - overlap;
  const chunks: { text: string; startToken: number; tokens: number }[] = [];

  for (let start = 0; start < ids.length; start += stride) {
    const slice = ids.slice(start, start + size);
    chunks.push({
      text: new TextDecoder().decode(enc.decode(slice)), // decode returns bytes
      startToken: start,
      tokens: slice.length,
    });
    if (start + size >= ids.length) break; // last window reached the end
  }
  return chunks;
}

const doc = 'Employees accrue 1.5 vacation days per month. '.repeat(200);
const chunks = tokenWindows(doc, 512, 64);
const stored = chunks.reduce((n, c) => n + c.tokens, 0);
console.log(chunks.length, 'chunks; storage factor', (stored / enc.encode(doc).length).toFixed(2));`,
        },
      ],
      prosCons: {
        pros: [
          'Token-based sizing guarantees chunks fit the embedding model and the prompt budget.',
          'Moderate overlap rescues facts that straddle a boundary.',
          'A small sweep (3 sizes) on an eval set gives a defensible, data-backed choice.',
        ],
        cons: [
          {
            con: 'Large overlap inflates storage and fills top-k with near-duplicate chunks.',
            fix: 'Keep overlap at 10–20%, and de-duplicate or merge adjacent chunks from the same document at retrieval time.',
          },
          {
            con: 'Character-based sizes produce very different token counts for code, tables and non-English text.',
            fix: 'Measure length with the tokenizer (lengthFunction / from_tiktoken_encoder) and set limits in tokens.',
          },
          {
            con: 'A single global size is wrong for some document types (FAQs vs long manuals).',
            fix: 'Configure size per document type and re-evaluate each one separately.',
          },
        ],
      },
      keyPoints: [
        'Size in tokens; ~4 chars per token only holds for English prose.',
        '256–512 tokens for facts, 512–1,024 for explanations, overlap 10–20%.',
        'Storage factor = size / (size − overlap).',
        'top_k × chunk size must fit the prompt budget.',
        'Choose with an eval sweep, not intuition.',
      ],
      exercise: {
        prompt: `Write \`chunkBudget({ docTokens, size, overlap, topK, dims })\` that returns: number of chunks, stored tokens, storage factor, vector storage in MB (float32), and prompt tokens per query.

Acceptance criteria:
- chunks = \`ceil((docTokens − overlap) / (size − overlap))\` (at least 1).
- vector MB = chunks × dims × 4 bytes / 1,048,576, rounded to 1 decimal.
- Throws if overlap ≥ size.
- For 10M tokens, 512/64, topK 8, 1,536 dims → ~22,322 chunks, ~130.8 MB, 4,096 prompt tokens.`,
        hints: [
          'stride = size − overlap.',
          'Stored tokens ≈ chunks × size (last chunk may be shorter, ignore that).',
          'Prompt tokens = topK × size.',
        ],
        solution: {
          language: 'typescript',
          code: `type Input = { docTokens: number; size: number; overlap: number; topK: number; dims: number };

export function chunkBudget({ docTokens, size, overlap, topK, dims }: Input) {
  if (overlap >= size) throw new Error('overlap must be < size');
  const stride = size - overlap;
  const chunks = Math.max(1, Math.ceil((docTokens - overlap) / stride));
  const storedTokens = chunks * size;
  return {
    chunks,
    storedTokens,
    storageFactor: +(storedTokens / docTokens).toFixed(2),
    vectorMB: +((chunks * dims * 4) / 1_048_576).toFixed(1),
    promptTokensPerQuery: topK * size,
  };
}

console.log(chunkBudget({ docTokens: 10_000_000, size: 512, overlap: 64, topK: 8, dims: 1536 }));
// { chunks: 22322, storedTokens: 11428864, storageFactor: 1.14, vectorMB: 130.8, promptTokensPerQuery: 4096 }`,
        },
        explanation:
          'Having this arithmetic in code lets you compare chunk configurations on cost and capacity before running a quality eval, so you only test options you can afford.',
      },
      quickCheck: {
        question:
          'You use all-MiniLM-L6-v2 embeddings with 1,000-token chunks. Recall is poor for facts near the end of chunks. Why?',
        options: [
          'Overlap is too small',
          'The model truncates input around 256 word pieces, so the end of each chunk is never embedded',
          'Cosine similarity cannot handle long chunks',
          'The vector index is approximate',
        ],
        correct: 1,
        explanation:
          'Text beyond the embedding model\'s max sequence length is silently dropped. Facts in the tail of the chunk do not influence the vector at all. Keep chunks under the model limit or switch models.',
      },
      source: 'Chroma Research 2024 — Evaluating Chunking Strategies for Retrieval; OpenAI Embeddings docs',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Recursive Chunking — RecursiveCharacterTextSplitter in practice',
      body: `**Intuition:** cut along the biggest natural seam first. Try to split at paragraph breaks; if a piece is still too big, split it at line breaks; then at spaces; only as a last resort cut through a word. It is like breaking a chocolate bar along its grooves before reaching for a knife.

**Mechanics.** LangChain's \`RecursiveCharacterTextSplitter\` (package \`@langchain/textsplitters\` in JS, \`langchain-text-splitters\` in Python):

1. Takes an ordered \`separators\` list, default \`["\\n\\n", "\\n", " ", ""]\`.
2. Splits on the first separator present; pieces still above \`chunkSize\` are recursively split with the next separator.
3. **Merges** small pieces back together up to \`chunkSize\`, adding \`chunkOverlap\` from the previous chunk.
4. \`lengthFunction\` decides what "size" means. The default is **characters**; pass a tokenizer-based function (JS) or use \`from_tiktoken_encoder\` (Python) for tokens.

Useful options: \`RecursiveCharacterTextSplitter.fromLanguage('markdown' | 'python' | 'js' | ...)\` loads separators such as headings, \`class\`, \`def\`, \`function\`. \`keepSeparator\` controls whether the separator stays attached. Add sentence punctuation (\`". "\`, \`"? "\`) before \`" "\` to prefer sentence boundaries. \`createDocuments(texts, metadatas)\` copies metadata onto every chunk.

**When to use it:** the default first splitter for prose, PDFs converted to text and most wiki content. Move to structure-aware or semantic chunkers when headings, tables or topic shifts matter (Advanced Chunking).`,
      example: `Input (1,450 chars): three paragraphs of 300, 950 and 200 chars; \`chunkSize: 500, chunkOverlap: 50\`.

1. Split on "\\n\\n" → [300, 950, 200].
2. 300 fits. 950 is too big → split on "\\n" → it has no line breaks → split on ". " → sentences of 180, 220, 260, 290 chars.
3. Merge up to 500: [300], [180+220=400], [260], [290+200=490].
4. Overlap: each chunk starts with up to ~50 chars of the previous chunk's tail (whole pieces only).

Result: 4 chunks, every one ending at a sentence or paragraph boundary, none above 500 chars. Fixed-size 500 cutting would have produced 3 chunks, two of them ending mid-word.`,
      diagram: `text
 │ split "\\n\\n"
 ├── ¶1 (300) ✓ fits
 ├── ¶2 (950) ✗ too big
 │     │ split "\\n" → no change
 │     │ split ". "
 │     ├── s1 180 ┐
 │     ├── s2 220 ┘ merge → 400 ✓
 │     ├── s3 260 ✓
 │     └── s4 290 ┐
 └── ¶3 (200) ───┘ merge → 490 ✓`,
      code: [
        {
          language: 'typescript',
          title: 'Token-aware RecursiveCharacterTextSplitter with metadata',
          code: `import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { encoding_for_model } from 'tiktoken';

const enc = encoding_for_model('text-embedding-3-small');

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,          // now measured in TOKENS because of lengthFunction
  chunkOverlap: 64,        // ~12.5% overlap
  separators: ['\\n\\n', '\\n', '. ', '? ', '! ', '; ', ' ', ''], // prefer sentence ends over spaces
  lengthFunction: (t: string) => enc.encode(t).length,
});

const handbook = await (await fetch('https://example.com/handbook.txt')).text();

// createDocuments copies each metadata object onto every chunk produced from that text
const docs = await splitter.createDocuments(
  [handbook],
  [{ source: 'handbook.txt', version: '2026-03' }],
);

docs.forEach((d, i) => {
  d.metadata.chunkIndex = i; // stable index for citations and upserts
});

const sizes = docs.map((d) => enc.encode(d.pageContent).length);
console.log(docs.length, 'chunks; max tokens', Math.max(...sizes));
console.log(docs[0].metadata); // { source, version, loc: { lines: { from, to } }, chunkIndex: 0 }`,
        },
      ],
      prosCons: {
        pros: [
          'Respects paragraph and sentence boundaries without any model calls; fast and deterministic.',
          'Separators are configurable per language and format (fromLanguage presets for Markdown and code).',
          'Guarantees a maximum size, unlike pure paragraph splitting.',
        ],
        cons: [
          {
            con: 'Default lengthFunction counts characters, so "chunkSize: 512" is ~128 tokens of prose and surprises everyone.',
            fix: 'Pass a tokenizer-based lengthFunction (JS) or use from_tiktoken_encoder (Python) and document the unit in config.',
          },
          {
            con: 'It is blind to headings, tables and topic shifts, so a chunk can start mid-section without its title.',
            fix: 'Use Markdown/HTML header splitters first and recurse inside sections, or prepend the heading path to each chunk.',
          },
          {
            con: 'The default separators fall from newline straight to spaces, so chunks can end mid-sentence.',
            fix: 'Insert sentence punctuation separators (". ", "? ", "! ") before " " in the list.',
          },
        ],
      },
      keyPoints: [
        'Recursive splitting tries big seams first: paragraph → line → sentence → word → character.',
        'Small pieces are merged back up to chunkSize with chunkOverlap.',
        'chunkSize is characters unless you supply a token lengthFunction.',
        'fromLanguage presets add Markdown/code separators.',
      ],
      exercise: {
        prompt: `Implement your own \`recursiveSplit(text, maxLen, separators)\` **without** LangChain.

Acceptance criteria:
- Split on the first separator that occurs in the text; recursively split any piece longer than \`maxLen\` using the remaining separators.
- Merge adjacent small pieces greedily up to \`maxLen\` (re-joining with the separator used).
- The empty-string separator means "cut into characters"; no output piece exceeds \`maxLen\`.
- \`recursiveSplit('aaa bbb\\n\\nccc ddd eee', 8, ['\\n\\n', ' ', ''])\` → \`['aaa bbb', 'ccc ddd', 'eee']\`.`,
        starter: {
          language: 'typescript',
          code: `export function recursiveSplit(text: string, maxLen: number, separators: string[]): string[] {
  if (text.length <= maxLen) return [text];
  // TODO: pick the first separator that appears in text ('' always matches)
  // TODO: split, recurse into pieces that are still too long with the remaining separators
  // TODO: greedily merge small pieces using the chosen separator
  return [];
}`,
        },
        hints: [
          'const idx = separators.findIndex(s => s === "" || text.includes(s)).',
          'For "", text.split("") gives characters; still merge them back up to maxLen.',
          'Merge: keep a buffer; if buffer + sep + piece fits, append, else push buffer and start over.',
        ],
        solution: {
          language: 'typescript',
          code: `export function recursiveSplit(text: string, maxLen: number, separators: string[]): string[] {
  if (text.length <= maxLen) return [text];
  const idx = separators.findIndex((s) => s === '' || text.includes(s));
  if (idx === -1) return [text];
  const sep = separators[idx];
  const rest = separators.slice(idx + 1);

  // 1) split and recurse into oversized pieces
  const pieces: string[] = [];
  for (const p of text.split(sep).filter((x) => x.length > 0)) {
    if (p.length > maxLen && rest.length) pieces.push(...recursiveSplit(p, maxLen, rest));
    else pieces.push(p);
  }

  // 2) greedily merge small neighbours back together
  const out: string[] = [];
  let buf = '';
  for (const p of pieces) {
    const joined = buf ? buf + sep + p : p;
    if (joined.length <= maxLen) buf = joined;
    else {
      if (buf) out.push(buf);
      buf = p;
    }
  }
  if (buf) out.push(buf);
  return out;
}

console.log(recursiveSplit('aaa bbb\\n\\nccc ddd eee', 8, ['\\n\\n', ' ', '']));
// [ 'aaa bbb', 'ccc ddd', 'eee' ]`,
        },
        explanation:
          'This is the core of LangChain\'s splitter minus overlap: seams are tried from coarsest to finest, and merging prevents an explosion of tiny fragments. Adding overlap means prefixing each chunk with the tail pieces of the previous one up to the overlap budget.',
      },
      quickCheck: {
        question:
          'You set chunkSize: 1000 on RecursiveCharacterTextSplitter (default lengthFunction) for an English manual. Roughly how many tokens is each chunk?',
        options: ['About 1,000 tokens', 'About 250 tokens', 'About 4,000 tokens', 'It depends only on the separators'],
        correct: 1,
        explanation:
          'The default length is measured in characters, and English prose averages ~4 characters per token, so 1,000 characters ≈ 250 tokens.',
      },
      source: 'LangChain docs — How to recursively split text by characters',
    },
  ],
  codeChallenges: [
    {
      id: 'chunking-fundamentals-cc-1',
      title: 'Fix a chunker that splits mid-word and loses provenance',
      context:
        'A prototype slices each document every 2,000 characters with no overlap and stores only the text. Answers often miss qualifying clauses, and citations cannot point to a page.',
      task: 'Replace it with a token-aware recursive splitter that keeps sentences whole, uses ~12% overlap, stays under the embedding model limit, and attaches source/page/chunkIndex metadata to every chunk.',
      starter: {
        language: 'typescript',
        code: `export function chunk(pages: string[]) {
  const text = pages.join('');
  const out: string[] = [];
  for (let i = 0; i < text.length; i += 2000) out.push(text.slice(i, i + 2000));
  return out;
}`,
      },
      hints: [
        'Chunk page by page so each chunk keeps a page number.',
        'Use RecursiveCharacterTextSplitter with a tiktoken lengthFunction and sentence separators.',
        'Use createDocuments(texts, metadatas) and add chunkIndex afterwards.',
      ],
      solution: {
        language: 'typescript',
        code: `import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { encoding_for_model } from 'tiktoken';

const enc = encoding_for_model('text-embedding-3-small');
const MAX_TOKENS = 512;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: MAX_TOKENS,
  chunkOverlap: 64,
  separators: ['\\n\\n', '\\n', '. ', '? ', '! ', ' ', ''],
  lengthFunction: (t: string) => enc.encode(t).length,
});

export async function chunk(source: string, pages: string[]) {
  const docs = await splitter.createDocuments(
    pages,
    pages.map((_, i) => ({ source, page: i + 1 })), // one metadata object per page
  );
  return docs.map((d, i) => {
    const tokens = enc.encode(d.pageContent).length;
    if (tokens > MAX_TOKENS) throw new Error('chunk over limit: ' + tokens); // defensive check
    return {
      id: source + '#' + i,          // deterministic id → safe upserts
      text: d.pageContent,
      metadata: { ...d.metadata, chunkIndex: i, tokens },
    };
  });
}`,
      },
      explanation:
        'The original cut words in half, measured characters instead of tokens, joined pages without separators (merging the last word of one page with the first of the next) and dropped provenance. The fix splits per page on natural seams, enforces a token limit, adds overlap, and emits deterministic ids and citation metadata.',
      followUps: [
        {
          q: 'A paragraph spans pages 4 and 5 and is now split across two chunks. How do you handle it?',
          a: 'Concatenate pages with a page-marker, split the whole document, and map each chunk\'s character offset back to page ranges (page_start, page_end) so the paragraph stays whole and citations stay correct.',
        },
        {
          q: 'Why are deterministic ids important here?',
          a: 'They let a re-run upsert the same chunk instead of inserting duplicates, and make it possible to delete trailing chunks when a document gets shorter.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-cc-2',
      title: 'Overlap bug: the sliding window never terminates and duplicates the tail',
      context:
        'A hand-rolled token window chunker sometimes hangs in production and, when it finishes, emits several tiny trailing chunks that repeat the last sentence.',
      task: 'Find both bugs and rewrite the function so it validates parameters, always makes progress, and does not emit tail chunks that are entirely contained in the previous chunk.',
      starter: {
        language: 'typescript',
        code: `export function windows(tokens: number[], size: number, overlap: number) {
  const out: number[][] = [];
  let start = 0;
  while (start < tokens.length) {
    out.push(tokens.slice(start, start + size));
    start = start + size - overlap;
  }
  return out;
}`,
      },
      hints: [
        'What happens when overlap >= size?',
        'After a window reaches the end of the array, the loop still continues with a smaller start.',
        'Break as soon as start + size >= tokens.length.',
      ],
      solution: {
        language: 'typescript',
        code: `export function windows(tokens: number[], size: number, overlap: number) {
  if (!Number.isInteger(size) || size <= 0) throw new Error('size must be a positive integer');
  if (overlap < 0 || overlap >= size) throw new Error('need 0 <= overlap < size'); // else no progress
  const stride = size - overlap;
  const out: number[][] = [];
  for (let start = 0; start < tokens.length; start += stride) {
    out.push(tokens.slice(start, start + size));
    if (start + size >= tokens.length) break; // this window already covers the tail
  }
  return out;
}

// 1,000 tokens, size 512, overlap 64 → windows at 0, 448 (covers to 960), 896 (covers to 1,000)
console.log(windows(Array.from({ length: 1000 }, (_, i) => i), 512, 64).map((w) => [w[0], w.length]));`,
      },
      explanation:
        'With overlap >= size the stride is zero or negative, so the loop never advances. Without the early break, windows starting inside the final chunk produce tiny duplicates that repeat its tail and pollute top-k. Validation plus the break fixes both.',
      followUps: [
        {
          q: 'The final window is only 40 tokens. Is that a problem?',
          a: 'Tiny chunks embed poorly and win on keyword-like matches; merge a final window below ~25% of size into the previous chunk or shift the last window back to end exactly at the document end.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'chunking-fundamentals-iq-1',
      difficulty: 'medium',
      question: 'How do you choose chunk size and overlap for a new RAG system, and how do you know you chose well?',
      whatInterviewerLooksFor: [
        'Ties size to question type, document type and embedding model limits',
        'Talks in tokens and knows realistic ranges',
        'Uses an eval set with retrieval metrics to decide',
        'Considers prompt budget and storage cost',
      ],
      modelAnswer: `**Start from constraints**
- **Embedding limit:** never exceed it (256 word pieces for MiniLM, 512 for many BERT models, ~8K for text-embedding-3 or bge-m3).
- **Prompt budget:** if I pass top-8 chunks and can afford ~4K context tokens, chunks should be ~512 tokens.
- **Question type:** fact lookup ("what is the notice period?") likes 256–512 tokens; "explain how X works" likes 512–1,024.

**Pick a baseline:** recursive splitting, 512 tokens, 64 overlap (~12%), sentence separators enabled.

**Evaluate, don't guess**
1. Build 50–100 questions with the chunk/passage that answers each (synthetic questions generated per passage are fine to start, then add real user queries).
2. Sweep 3–4 configurations: 256/32, 512/64, 1,024/128.
3. Measure recall@k and MRR for retrieval, plus answer correctness for an end-to-end check.
4. Check cost: chunk count (storage), prompt tokens per query.

**Read the failures.** If answers miss qualifiers ("except during probation"), chunks are too small or cut badly. If the right chunk ranks low, chunks are too big and averaging away the specific topic.

Settings are per document type: FAQs may win at 256, manuals at 768. I re-run the sweep when the corpus or embedding model changes.`,
      followUps: [
        {
          q: 'Where would you get eval questions if you have no users yet?',
          a: 'Generate 2–3 questions per sampled chunk with an LLM, filter low-quality ones, and hand-check a subset; then replace them gradually with real logged queries.',
        },
        {
          q: 'What does a very high overlap (50%) usually indicate?',
          a: 'That boundaries are bad. Fix the splitter (sentence/structure seams) rather than paying 2× storage and duplicate hits to paper over it.',
        },
      ],
      pitfalls: [
        'Quoting one magic number without evaluation',
        'Mixing up characters and tokens',
        'Ignoring the embedding model\'s max input length',
      ],
    },
    {
      id: 'chunking-fundamentals-iq-2',
      difficulty: 'hard',
      question:
        'Users complain that answers omit exceptions like "unless approved by a director". The exception is in the source. Diagnose the chunking issue.',
      context: 'Fixed 200-token chunks, no overlap, top-k = 3.',
      whatInterviewerLooksFor: [
        'Recognises boundary cuts separating rules from exceptions',
        'Proposes sentence/paragraph-aware splitting and overlap',
        'Mentions verifying with the actual retrieved chunks',
        'Considers neighbour expansion or larger context windows',
      ],
      modelAnswer: `**Likely cause:** with 200-token fixed cuts and no overlap, the rule ("Expenses over $500 are not reimbursed") and its exception ("unless approved by a director") often land in different chunks. The query matches the rule chunk strongly; the exception chunk scores lower (it has less overlap with the query wording) and falls outside top-3.

**Verify first:** log the retrieved chunks for 10 failing questions and check where the exception sits relative to chunk boundaries.

**Fixes, in order**
1. **Boundary-aware splitting:** recursive splitter with paragraph and sentence separators so a rule and its "unless" clause in the same paragraph stay together.
2. **Larger chunks for policy text:** 400–512 tokens keeps a rule with its qualifiers.
3. **Overlap 10–20%:** catches exceptions in the following sentence.
4. **Neighbour expansion at retrieval:** when a chunk is retrieved, also include chunk i+1 from the same document (cheap and very effective for clauses).
5. **Raise k or rerank:** retrieve 20 and rerank to 5 so the exception chunk survives.

Re-run the eval set and specifically track a "qualifier" subset of questions.`,
      followUps: [
        {
          q: 'Why might overlap alone not fix it?',
          a: 'If the exception is more than the overlap distance away from the boundary, or in the next paragraph, overlap does not copy it; boundary-aware splitting or neighbour expansion is needed.',
        },
        {
          q: 'How would parent-child chunking help?',
          a: 'You retrieve with small child chunks for precision but return the larger parent section, which contains both the rule and its exception.',
        },
      ],
      pitfalls: [
        'Blaming the LLM before inspecting retrieved text',
        'Only increasing top-k without fixing boundaries',
      ],
    },
    {
      id: 'chunking-fundamentals-iq-3',
      difficulty: 'medium',
      question: 'Explain how RecursiveCharacterTextSplitter works and the configuration mistakes you see most often.',
      whatInterviewerLooksFor: [
        'Correct description of separator recursion and merging',
        'Knows chunkSize is characters by default',
        'Knows how to add sentence separators and language presets',
        'Mentions metadata propagation',
      ],
      modelAnswer: `**How it works**
1. Given separators (default \`"\\n\\n"\`, \`"\\n"\`, \`" "\`, \`""\`), split on the first one present.
2. Any piece still longer than \`chunkSize\` is split recursively with the next separator.
3. Pieces are then merged greedily back up to \`chunkSize\`, and each new chunk begins with up to \`chunkOverlap\` worth of the previous chunk's trailing pieces.
4. \`createDocuments(texts, metadatas)\` copies metadata onto each chunk and adds line locations.

**Common mistakes**
- **Characters vs tokens:** \`chunkSize: 1000\` is ~250 English tokens; teams think they have 1K-token chunks. Fix: tokenizer \`lengthFunction\` (JS) or \`from_tiktoken_encoder\` (Python).
- **No sentence separators:** after \`"\\n"\` it falls back to \`" "\`, so chunks end mid-sentence. Add \`". "\`, \`"? "\`, \`"! "\`.
- **Overlap ≥ chunk size** or huge overlaps: errors or massive duplication.
- **Wrong preset:** splitting Python code with prose separators breaks functions; use \`fromLanguage('python')\`.
- **Splitting the concatenated corpus:** joining all docs first loses document boundaries and metadata; split per document.
- **Dropping metadata:** no source/page → no citations.`,
      followUps: [
        {
          q: 'Why does the splitter merge after splitting?',
          a: 'Splitting on paragraphs or sentences produces many tiny pieces; merging them up to chunkSize keeps chunks dense enough to embed well and avoids thousands of fragments.',
        },
        {
          q: 'When would you not use it?',
          a: 'When documents have strong structure (Markdown headings, HTML, code) or topic shifts that matter; then header/structure-aware or semantic chunkers do better.',
        },
      ],
      pitfalls: [
        'Assuming chunkSize is tokens',
        'Not mentioning the merge step',
      ],
    },
    {
      id: 'chunking-fundamentals-iq-4',
      difficulty: 'hard',
      question:
        'Your corpus mixes English prose, Japanese manuals and JSON API references. A single 1,500-character chunk size performs badly on two of the three. Why, and what do you do?',
      whatInterviewerLooksFor: [
        'Understands token density differs by language and format',
        'Measures in tokens per type',
        'Uses format-specific separators',
        'Routes by document type with separate configs and evals',
      ],
      modelAnswer: `**Why one character size fails**
- **English prose:** ~4 chars/token → 1,500 chars ≈ 375 tokens. Fine.
- **Japanese:** often ~1–1.5 chars/token with common tokenizers → 1,500 chars ≈ 1,000–1,500 tokens. Chunks are much bigger in tokens, may exceed smaller embedding limits, and blend topics. There are also no spaces, so the \`" "\` separator never fires; splits fall straight to characters mid-sentence.
- **JSON:** braces, quotes and keys tokenize densely (~2–3 chars/token) and splitting on spaces breaks objects apart, producing chunks like \`"type": "string" }, {\` with no meaning.

**What I do**
1. **Measure in tokens** with the embedding model's tokenizer for every type.
2. **Format-specific separators:** Japanese sentence enders (\`"。"\`, \`"！"\`, \`"？"\`), and for JSON split per endpoint/object (parse it and chunk by path, e.g. one chunk per operation with its schema).
3. **Per-type configs** in a routing table: prose 512/64, Japanese 384/48 tokens, API reference = one chunk per endpoint with the path in metadata.
4. **Multilingual embedding model** (e.g. bge-m3) if queries cross languages.
5. **Separate eval sets per type** so one type's gain does not hide another's regression.`,
      followUps: [
        {
          q: 'How do you chunk a 30,000-token OpenAPI spec?',
          a: 'Parse it and emit one chunk per operation (method + path + summary + parameters + simplified schema), resolving $refs inline, with tags and path as metadata.',
        },
        {
          q: 'What breaks if you translate everything to English before chunking?',
          a: 'You add translation cost and errors, lose exact terms users search for in the original language, and citations no longer match the source text.',
        },
      ],
      pitfalls: [
        'Assuming 4 characters per token everywhere',
        'Splitting JSON as if it were prose',
      ],
    },
    {
      id: 'chunking-fundamentals-iq-5',
      difficulty: 'expert',
      question:
        'Leadership asks whether to double chunk size from 512 to 1,024 tokens "so the model gets more context". Make the case with numbers.',
      context: '20M-token corpus, 200K queries/day, top-k = 6, illustrative input price $3 per 1M tokens.',
      whatInterviewerLooksFor: [
        'Separates retrieval precision from generation context',
        'Computes prompt-cost impact',
        'Offers alternatives (parent-child, neighbour expansion, reranking)',
        'Proposes an experiment to decide',
      ],
      modelAnswer: `**Cost side**
- Prompt tokens per query: 6 × 512 = 3,072 → 6 × 1,024 = 6,144 (+3,072).
- Daily: 200K × 3,072 extra = 614M tokens × $3/1M ≈ **$1,840/day ≈ $55K/month** extra.
- Latency: more input tokens increases time-to-first-token, roughly a few hundred ms at this size.
- Index: chunk count halves (≈ 44K → 22K for 20M tokens with overlap), which is a small saving.

**Quality side**
- Bigger chunks **help** when answers need surrounding explanation, but **hurt** retrieval precision: a 1,024-token vector averages more topics, so specific questions rank the right chunk lower.
- "More context" and "better retrieval" are separate goals, so they deserve separate mechanisms.

**Better options**
1. **Small-to-big:** retrieve 512-token (or smaller) chunks, then expand to the parent section or neighbours only for the top 2–3 hits.
2. **Rerank:** retrieve 30, rerank, send top 4 instead of 6.
3. **Per-type sizes:** larger for tutorials, smaller for policies.

**Decide by experiment:** A/B on the eval set (recall@6, answer correctness, faithfulness) and an online test. Only switch if quality rises enough to justify ~$55K/month, which small-to-big usually achieves at a fraction of the cost.`,
      followUps: [
        {
          q: 'What metric would show that bigger chunks hurt retrieval?',
          a: 'Recall@k and MRR on questions whose answer is a single sentence; a drop there while broad "explain" questions improve shows precision loss.',
        },
        {
          q: 'How would prompt caching change the cost argument?',
          a: 'Retrieved chunks vary per query, so caching helps little for them; it mainly reduces the cost of the static system prompt, so the chunk-size cost argument largely stands.',
        },
      ],
      pitfalls: [
        'Equating more context with better answers',
        'Ignoring the per-query cost multiplier',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'chunking-fundamentals-est-1',
      question:
        'How many chunks, how much vector storage and what one-off embedding cost for a 5,000-document knowledge base at 512/64 chunking?',
      assumptions: [
        '5,000 docs × 12 pages × 450 tokens/page',
        'Chunk size 512 tokens, overlap 64 (stride 448)',
        'text-embedding-3-small: 1,536 dims float32; illustrative $0.02 per 1M tokens',
        'Metadata + text stored ≈ 3 KB per chunk',
      ],
      steps: [
        { label: 'Corpus tokens', calc: '5,000 × 12 × 450 = 27M tokens' },
        { label: 'Chunks', calc: '27M ÷ 448 ≈ 60,300 chunks' },
        { label: 'Embedded tokens', calc: '60,300 × 512 ≈ 30.9M tokens (1.14× corpus due to overlap)' },
        { label: 'Embedding cost', calc: '30.9M × $0.02 / 1M ≈ $0.62' },
        { label: 'Vector storage', calc: '60,300 × 1,536 × 4 B ≈ 370 MB' },
        { label: 'Text + metadata', calc: '60,300 × 3 KB ≈ 181 MB; total ≈ 0.55 GB before index overhead' },
      ],
      answer: '~60K chunks, ~0.55 GB of vectors + text, and well under $1 to embed.',
      insight:
        'Embedding a mid-size corpus is almost free; the budget lines that matter are the vector index RAM (HNSW adds graph overhead on top of 370 MB) and the per-query prompt tokens that chunk size drives.',
      followUps: [
        {
          q: 'What if you switch to 256/32 chunks?',
          a: 'Stride 224 → ~120,500 chunks, ~740 MB of vectors (2×), still under $1 to embed, but twice the index RAM and more, smaller hits per query.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-est-2',
      question: 'What does raising overlap from 10% to 50% cost on a 100M-token corpus re-embedded monthly?',
      assumptions: [
        'Chunk size 512 tokens',
        '10% overlap = 51 tokens; 50% overlap = 256 tokens',
        'Illustrative embedding price $0.13 per 1M tokens (large model)',
        '3,072-dim float32 vectors',
      ],
      steps: [
        { label: 'Storage factor 10%', calc: '512 / (512 − 51) ≈ 1.11 → 111M embedded tokens, 100M/461 ≈ 217K chunks' },
        { label: 'Storage factor 50%', calc: '512 / 256 = 2.0 → 200M embedded tokens, 100M/256 ≈ 391K chunks' },
        { label: 'Monthly embedding cost', calc: '111M × $0.13/1M ≈ $14.4 vs 200M × $0.13/1M = $26' },
        { label: 'Vector storage', calc: '217K × 3,072 × 4 B ≈ 2.7 GB vs 391K × 12,288 B ≈ 4.8 GB' },
        { label: 'Yearly delta', calc: '($26 − $14.4) × 12 ≈ $139 more embedding; +2.1 GB RAM for vectors' },
      ],
      answer: 'About 1.8× more vectors and embedding spend: ~$139/year more and ~2 GB more index memory.',
      insight:
        'The money is small, but 50% overlap nearly doubles index RAM and makes adjacent near-duplicate chunks crowd top-k. Fix boundaries instead of buying overlap.',
      followUps: [
        {
          q: 'How would you reduce duplicate hits if you must keep high overlap?',
          a: 'Collapse results by (doc_id, adjacent chunk index) or apply MMR so only the best of overlapping neighbours is returned.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'chunking-fundamentals-mcq-01',
      difficulty: 'medium',
      question:
        'A team uses 2,000-token chunks and top-k = 10 with an 8K-token context budget for retrieved text. What happens first?',
      options: [
        'Retrieval becomes exact instead of approximate',
        'Retrieved text (20K tokens) exceeds the budget, so chunks get truncated or dropped',
        'Embeddings become more precise for specific questions',
        'Overlap is automatically disabled',
      ],
      correct: [1],
      explanation:
        'top_k × chunk size = 20,000 tokens, far above the 8K budget, so the pipeline must cut chunks or drop results, often losing the best evidence. Larger chunks also make embeddings less specific, not more.',
      followUps: [
        {
          q: 'Give two ways to fit the budget without losing recall.',
          a: 'Retrieve more smaller chunks and rerank down to the best 4–6, or keep large chunks but compress/extract only the relevant sentences before generation.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-02',
      difficulty: 'hard',
      question: 'What does this splitter configuration actually produce for English prose?',
      code: {
        language: 'typescript',
        code: `const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 64,
});
const docs = await splitter.createDocuments([manual]);`,
      },
      options: [
        'Chunks of roughly 512 tokens with 64-token overlap',
        'Chunks of at most 512 characters (~128 tokens) with up to 64 characters of overlap',
        'Chunks of exactly 512 words',
        'A single chunk, because createDocuments ignores chunkSize',
      ],
      correct: [1],
      explanation:
        'Without a custom lengthFunction, length is measured in characters, so 512 characters ≈ 128 tokens of English. Chunk sizes are maxima, not exact counts.',
      followUps: [
        {
          q: 'How do you make it count tokens in JS?',
          a: 'Pass lengthFunction: (t) => enc.encode(t).length using a tiktoken encoder that matches (or approximates) your embedding model\'s tokenizer.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-03',
      difficulty: 'hard',
      question: 'Which statements about chunk overlap are true? (Select ALL that apply)',
      options: [
        'It reduces the chance that a fact is split across a boundary without context',
        'Storage grows by roughly size / (size − overlap)',
        'It removes the need for sentence-aware separators',
        'It can cause near-duplicate chunks to occupy several top-k slots',
      ],
      correct: [0, 1, 3],
      explanation:
        'Overlap is a safety margin at boundaries, costs storage in proportion to size/(size − overlap), and makes neighbouring chunks similar enough to crowd results. It does not replace good boundaries: the cut can still land mid-sentence.',
      followUps: [
        {
          q: 'What retrieval-time step limits the duplicate effect?',
          a: 'Merge or collapse adjacent hits from the same document (or apply MMR) before building the prompt, so one passage occupies one slot.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-04',
      difficulty: 'expert',
      question:
        'Recall@5 on short factual questions is 0.62 with 1,500-token chunks and 0.84 with 400-token chunks, but "explain the architecture" questions get worse with 400. What is the best design?',
      options: [
        'Use 1,500-token chunks and increase top-k to 20',
        'Retrieve with small chunks, then expand top hits to their parent section or neighbours before generation',
        'Use 400-token chunks and set overlap to 75%',
        'Average the two embeddings for each chunk',
      ],
      correct: [1],
      explanation:
        'Small chunks give precise matching; expanding the best hits restores the broader context explanatory answers need. Large chunks with high k floods the prompt; 75% overlap quadruples storage without restoring section context; averaging embeddings blurs both.',
      followUps: [
        {
          q: 'What metadata must you store to support the expansion?',
          a: 'A parent/section id and chunk index (or start/end offsets) on every chunk, so you can fetch the parent text or neighbours i−1 and i+1 quickly.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-05',
      difficulty: 'hard',
      question: 'What is wrong with this chunking step? (Select ALL that apply)',
      code: {
        language: 'typescript',
        code: `const corpus = docs.map((d) => d.text).join(' ');
const chunks = await splitter.splitText(corpus);
await store.addDocuments(chunks.map((c) => ({ pageContent: c, metadata: {} })));`,
      },
      options: [
        'Chunks can span two unrelated documents',
        'Source and page metadata are lost, so citations and filters are impossible',
        'splitText cannot handle more than one paragraph',
        'Re-ingesting a single changed document requires re-splitting the whole corpus',
      ],
      correct: [0, 1, 3],
      explanation:
        'Joining documents first erases boundaries, so a chunk may mix the end of one policy with the start of another, metadata is empty, and there is no way to update one document in isolation. splitText handles multi-paragraph input fine.',
      followUps: [
        {
          q: 'Rewrite the core line correctly.',
          a: 'Call splitter.createDocuments(docs.map(d => d.text), docs.map(d => ({ source: d.source }))) so each document is split separately with its metadata.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-06',
      difficulty: 'medium',
      question:
        'Your embedding model accepts 512 tokens. Your splitter produces chunks up to 700 tokens. What happens to those chunks?',
      options: [
        'The API always rejects them with an error',
        'Depending on the model/library, they are truncated and the last ~190 tokens do not influence the vector, or the call errors',
        'The model automatically averages two windows',
        'Nothing; models handle longer input at lower precision',
      ],
      correct: [1],
      explanation:
        'Most sentence-transformer pipelines silently truncate at max_seq_length; some APIs reject over-limit input. Either way, content past the limit is not represented. Few models average windows automatically.',
      followUps: [
        {
          q: 'How do you guarantee this never happens?',
          a: 'Measure chunk length with the embedding model\'s own tokenizer, set chunkSize below the limit with a margin, and assert the limit before calling the embedding API.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-07',
      difficulty: 'hard',
      question:
        'Separators are ["\\n\\n", "\\n", " ", ""]. A 3,000-character paragraph with no line breaks is split at chunkSize 1,000. Where do the cuts fall?',
      options: [
        'At sentence ends, because the splitter detects periods',
        'At spaces between words, possibly mid-sentence',
        'Exactly every 1,000 characters, possibly mid-word',
        'Nowhere: the paragraph is returned whole',
      ],
      correct: [1],
      explanation:
        'No "\\n\\n" or "\\n" exists inside, so the next separator is a space: the text is split into words and merged back up to 1,000 characters, so cuts fall between words but not necessarily at sentence ends. Adding ". " before " " fixes that.',
      followUps: [
        {
          q: 'When does the empty-string separator matter?',
          a: 'Only when a single token without spaces exceeds chunkSize, such as a giant URL, base64 blob or text in scripts without spaces; then it cuts characters.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-08',
      difficulty: 'expert',
      question:
        'Which signals suggest your chunks are too large? (Select ALL that apply)',
      options: [
        'The right document is retrieved but its chunk ranks low for very specific questions',
        'Answers frequently miss nearby qualifiers in the following sentence',
        'Retrieved chunks contain several unrelated sub-topics',
        'Prompt token usage per query is high relative to the evidence actually used',
      ],
      correct: [0, 2, 3],
      explanation:
        'Large chunks dilute embeddings (low rank for specific queries), mix topics, and waste prompt tokens. Missing qualifiers in the next sentence is a symptom of chunks that are too small or badly bounded, not too large.',
      followUps: [
        {
          q: 'How would you confirm the dilution hypothesis?',
          a: 'Re-chunk a sample smaller, re-run the same queries and compare the similarity score and rank of the gold passage; a big rank improvement confirms dilution.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-09',
      difficulty: 'hard',
      question: 'Which outcome does this Python configuration produce?',
      code: {
        language: 'python',
        code: `from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
    encoding_name="cl100k_base", chunk_size=400, chunk_overlap=50,
)
chunks = splitter.split_text(open("policy.txt").read())`,
      },
      options: [
        'Chunks of up to 400 characters split on tokens',
        'Chunks of up to ~400 cl100k tokens, merged from recursive splits, with up to ~50 tokens of overlap',
        'Exactly 400-token windows that ignore paragraph boundaries',
        'An error, because overlap must be a percentage',
      ],
      correct: [1],
      explanation:
        'from_tiktoken_encoder swaps the length function for a token counter but keeps recursive separators, so chunks respect seams and stay under ~400 tokens. It is not a fixed window (that is TokenTextSplitter); overlap is an absolute count.',
      followUps: [
        {
          q: 'Can a chunk still exceed 400 tokens?',
          a: 'Yes, rarely: if a single piece cannot be split further with the configured separators, the recursive splitter may emit it oversized, so assert sizes before embedding.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-10',
      difficulty: 'medium',
      question:
        'Which document type is the weakest fit for plain recursive character splitting with default separators?',
      options: [
        'A blog post with clear paragraphs',
        'A Python codebase where functions and classes should stay intact',
        'A plain-text FAQ with one answer per paragraph',
        'A transcript with one speaker turn per line',
      ],
      correct: [1],
      explanation:
        'Default separators know nothing about code structure, so functions get split mid-body. Use language-aware presets (fromLanguage) or AST-based chunking. The other formats have paragraph/line seams the defaults respect.',
      followUps: [
        {
          q: 'What does fromLanguage("python") change?',
          a: 'It prepends separators like "\\nclass ", "\\ndef " and "\\n\\tdef " so splits prefer class and function boundaries before falling back to blank lines and spaces.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-11',
      difficulty: 'hard',
      question:
        'You must choose chunk settings for a new corpus. Which steps belong in a sound selection process? (Select ALL that apply)',
      options: [
        'Build an eval set of questions with known supporting passages',
        'Compare 3–4 size/overlap configurations on recall@k and answer quality',
        'Pick the configuration with the most chunks because more chunks means more recall',
        'Check prompt-token and storage cost of each candidate',
      ],
      correct: [0, 1, 3],
      explanation:
        'A labelled eval set, a small sweep and cost checks give a defensible choice. More chunks is not inherently better: tiny chunks lose context and add near-duplicates and index cost.',
      followUps: [
        {
          q: 'How many questions are enough for a first sweep?',
          a: 'About 50–100 well-labelled questions usually separates configurations whose recall differs by 5+ points; use more if differences are small.',
        },
      ],
    },
    {
      id: 'chunking-fundamentals-mcq-12',
      difficulty: 'expert',
      question:
        'After switching from 1,000-character to 512-token chunks, the vector count drops by half but recall improves. What best explains both effects?',
      options: [
        'Token counting made chunks larger (≈2,000 chars) yet sentence separators now keep them coherent',
        'The vector database deduplicated half of the chunks',
        'Token chunks are always more accurate than character chunks',
        'The embedding model became more precise for longer inputs',
      ],
      correct: [0],
      explanation:
        '512 tokens ≈ 2,000 English characters, so each chunk doubled in size and the count halved. Recall improved because the old 250-token chunks cut qualifiers off and the new configuration also added better separators. Tokens are a unit, not inherently "more accurate".',
      followUps: [
        {
          q: 'How would you separate the effect of size from the effect of separators?',
          a: 'Run an ablation: change only one variable at a time (size with old separators, separators with old size) on the same eval set.',
        },
      ],
    },
  ],
};

export default topic;
