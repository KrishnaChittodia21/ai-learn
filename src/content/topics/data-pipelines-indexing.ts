import type { Topic } from '../../types';

const topic: Topic = {
  id: 'data-pipelines-indexing',
  phase: 'llmops',
  order: 5,
  title: 'Data Pipelines, Incremental Indexing, Versioning, Embedding Migration and Synthetic Data',
  subtitle:
    'Keep a RAG index fresh, reproducible and cheap: CDC-driven pipelines, hash-based incremental updates with tombstones, versioned indexes behind aliases, zero-downtime embedding migrations and filtered synthetic Q&A for evals.',
  estimatedMinutes: 60,
  sources: [
    'Debezium docs — Change data capture event format (op c/u/d, before/after): https://debezium.io/documentation/reference/stable/connectors/postgresql.html',
    'Qdrant docs — Points (upsert, delete by filter), payload indexes and collection aliases: https://qdrant.tech/documentation/concepts/collections/#collection-aliases',
    'LlamaIndex docs — Ingestion pipeline with document management (docstore hashes, upserts): https://docs.llamaindex.ai/en/stable/module_guides/loading/ingestion_pipeline/',
    'LangChain docs — Indexing API with RecordManager (incremental / full cleanup): https://python.langchain.com/docs/how_to/indexing/',
    'OpenAI docs — Embeddings (text-embedding-3 models, dimensions parameter) and Batch API: https://platform.openai.com/docs/guides/embeddings',
    'DVC docs — Data versioning: https://dvc.org/doc/use-cases/versioning-data-and-models',
    'lakeFS / Delta Lake time travel — versioned data lakes: https://docs.delta.io/latest/delta-batch.html#query-an-older-snapshot-of-a-table-time-travel',
    'Ragas docs — Testset generation (synthetic questions from documents): https://docs.ragas.io/en/stable/concepts/test_data_generation/',
    'Alberti et al. 2019 — Synthetic QA Corpora Generation with Roundtrip Consistency: https://arxiv.org/abs/1906.05416',
    'Wang et al. 2023 — Self-Instruct: Aligning Language Models with Self-Generated Instructions: https://arxiv.org/abs/2212.10560',
  ],
  tags: ['llmops', 'data-pipelines', 'cdc', 'incremental-indexing', 'versioning', 'embeddings', 'migration', 'synthetic-data', 'rag'],
  cheatSheet: [
    'Ingestion pipeline: source/CDC → parse → clean → chunk → (enrich) → embed → upsert + delete; every stage idempotent, retryable and observable.',
    'CDC (Debezium, webhooks, Drive/Confluence change APIs) gives create/update/delete events; full re-crawls are the fallback and the reconciliation check.',
    'Incremental indexing: hash normalised document content; skip unchanged docs; for changed docs, diff chunk hashes and embed only new chunks.',
    'Deletes need tombstones: a delete event (or a doc missing from the latest full listing) must remove all its chunks, or RAG keeps citing deleted content.',
    'Deterministic chunk ids (hash of doc id + chunk content or position) make upserts idempotent and replays safe.',
    'Version everything that shapes the index: source snapshot, parser, chunker config, embedding model + dimensions, and record it in an index manifest and on each chunk’s payload.',
    'Serve through an alias (kb_current → kb_v12); build the new version alongside, evaluate, then swap the alias atomically; keep the old one for rollback.',
    'Embedding migration: new model ⇒ vectors incompatible ⇒ re-embed everything; dual-write new changes to both indexes, backfill, shadow-eval recall@k, cut over, then retire old.',
    'Re-embedding cost = total tokens × price (e.g. 2B tokens × $0.02/1M = $40; Batch API ≈ half); the bigger costs are throughput time, vector storage and the eval effort.',
    'Synthetic Q&A: generate from chunks, then filter (dedupe, answerable from source, roundtrip retrieval, judge groundedness), then spot-check with humans; never trust raw generations.',
  ],
  sections: [
    {
      heading: 'Data Pipelines — CDC → parse → chunk → embed → upsert',
      body: `**Intuition:** a RAG index is a library catalogue. The pipeline is the librarian who notices new, changed and removed books and updates the catalogue. If the librarian only works once a quarter, the assistant quotes withdrawn policies.

**Stages**
1. **Change detection** — CDC from databases (Debezium emits create/update/delete events with before/after rows), webhooks or change APIs from SaaS sources (Confluence, Google Drive, SharePoint), or scheduled crawls with modified timestamps.
2. **Fetch + parse** — download, convert PDF/HTML/DOCX to clean text with structure (headings, tables), keep metadata: source id, URL, ACL groups, updated_at, language.
3. **Chunk** — structure-aware splitting with deterministic settings (version them).
4. **Enrich** (optional) — contextual headers, summaries, entity tags.
5. **Embed** — batch requests (e.g. 100–2,000 inputs per call), respect rate limits, retry with backoff.
6. **Upsert + delete** — write vectors with payload (doc id, chunk hash, ACL, versions) and remove chunks no longer present.

**Engineering rules**
- Every stage **idempotent** (re-running an event yields the same state) and **retryable**; use a queue between stages so a slow embedder does not block parsing.
- Carry **ACLs** from source to chunk payload: retrieval must filter by the user's groups.
- **Observability**: lag from source change to searchable (freshness SLO, e.g. p95 < 15 min), failures per stage, documents in DLQ.
- **Reconciliation**: a nightly full listing compares source ids vs index ids to catch missed events.

**When to use:** any RAG system whose sources change more than rarely. One-off static corpora can use a single batch job.`,
      example: `Confluence space, 48,000 pages; ~1,200 page edits/day, ~40 deletions/day.
- Webhook "page_updated" for page 8812 → fetch (220 ms) → parse to 3,400 tokens → chunk into 7 chunks of ≤ 512 tokens → embed 7 chunks in one call (90 ms) → upsert 7 points, delete 1 obsolete chunk.
- Freshness: p95 change-to-searchable 4.2 min (SLO 15 min).
- A webhook outage dropped 300 events overnight; the 02:00 reconciliation found 296 pages whose \`updated_at\` was newer than the indexed version and 4 deleted pages still indexed, re-queued all 300.
- Embedding cost per day: 1,200 pages × ~3,400 tokens ≈ 4.1M tokens × $0.02/1M (illustrative) ≈ **$0.08/day**; the pipeline’s cost is engineering and compute, not embeddings.`,
      diagram: `sources                       queue stages (idempotent, retried)
 Postgres ─CDC (Debezium)─┐
 Confluence ─webhooks─────┼─▶ [changes] ─▶ fetch+parse ─▶ [docs] ─▶ chunk
 Drive ─changes API───────┘        ▲                                  │
 nightly full listing ─ reconcile ─┘                                  ▼
                                    upsert/delete ◀─ [vectors] ◀─ embed (batch)
                                          │
                                  vector DB (payload: doc_id, chunk_hash,
                                  acl, parser_v, chunker_v, embed_model)
 metrics: lag p95, DLQ size, docs/min, failures by stage`,
      code: [
        {
          language: 'typescript',
          title: 'pipeline.ts — process one CDC event end to end (parse → chunk → embed → upsert/delete in Qdrant)',
          code: `import OpenAI from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'node:crypto';
import { fetchAndParse, chunk } from './parsing'; // your parser + structure-aware chunker

const openai = new OpenAI();
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
const COLLECTION = 'kb_current'; // alias -> versioned collection
const VERSIONS = { parser: 'p3', chunker: 'rec-512-64-v2', embed: 'text-embedding-3-small' };

type ChangeEvent = { op: 'c' | 'u' | 'd'; docId: string; url?: string; acl?: string[] };

// Qdrant point ids must be UUIDs or integers: derive a UUID-shaped id from a hash
const pointId = (s: string) => {
  const h = createHash('sha256').update(s).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
};
const byDoc = (docId: string) => ({ must: [{ key: 'doc_id', match: { value: docId } }] });

export async function handle(ev: ChangeEvent) {
  if (ev.op === 'd') {
    await qdrant.delete(COLLECTION, { wait: true, filter: byDoc(ev.docId) }); // tombstone: remove all chunks
    return { deleted: true };
  }
  const doc = await fetchAndParse(ev.url!);
  const chunks = chunk(doc.text, { maxTokens: 512, overlap: 64 });
  const emb = await openai.embeddings.create({ model: VERSIONS.embed, input: chunks }); // one batched call
  const points = chunks.map((text, i) => ({
    id: pointId(ev.docId + ':' + i), // deterministic -> replays overwrite, never duplicate
    vector: emb.data[i].embedding,
    payload: { doc_id: ev.docId, chunk_index: i, text, acl: ev.acl ?? [], ...VERSIONS, updated_at: doc.updatedAt },
  }));
  await qdrant.upsert(COLLECTION, { wait: true, points });
  // remove trailing chunks if the document got shorter
  await qdrant.delete(COLLECTION, {
    wait: true,
    filter: { must: [{ key: 'doc_id', match: { value: ev.docId } }, { key: 'chunk_index', range: { gte: chunks.length } }] },
  });
  return { upserted: points.length };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Event-driven updates keep answers fresh within minutes instead of the next full rebuild.',
          'Queue-separated stages scale independently (parsing is CPU-heavy, embedding is rate-limited I/O).',
          'Versions and ACLs on every chunk make retrieval auditable and permission-safe.',
        ],
        cons: [
          {
            con: 'Events get lost (webhook outages, connector restarts), so the index silently diverges from the source.',
            fix: 'Run a periodic reconciliation that compares source listings (ids + updated_at or hashes) with the index and re-queues differences.',
          },
          {
            con: 'Out-of-order events can overwrite a newer version with an older one.',
            fix: 'Carry the source version/updated_at in each event and skip writes older than what the index holds (compare-and-set on payload version).',
          },
          {
            con: 'Bad parser releases corrupt thousands of chunks before anyone notices.',
            fix: 'Version the parser, canary new versions on a sample of documents with quality checks (empty text, garbled characters, table loss), and keep the previous index for rollback.',
          },
        ],
      },
      keyPoints: [
        'CDC/webhooks for freshness, nightly reconciliation for correctness.',
        'Stages are idempotent queue consumers with retries and a DLQ.',
        'Chunk payload carries doc id, ACL, versions and source timestamp.',
        'Track a freshness SLO: change-to-searchable lag.',
      ],
      exercise: {
        prompt: `Write \`reconcile(sourceDocs, indexedDocs)\` where both are \`{ id: string; updatedAt: string }[]\`. Return \`{ toUpsert: string[]; toDelete: string[] }\`: ids missing from the index or with a newer source \`updatedAt\` go to toUpsert; ids in the index but missing from the source go to toDelete. Acceptance: O(n) with Maps; ISO timestamps compared as dates.`,
        hints: [
          'Build a Map from id to updatedAt for the index.',
          'Iterate the source; then iterate the index to find ids absent from the source.',
          'Date.parse(a) > Date.parse(b) handles ISO strings with different time zones.',
        ],
        solution: {
          language: 'typescript',
          code: `type Doc = { id: string; updatedAt: string };

export function reconcile(source: Doc[], indexed: Doc[]) {
  const idx = new Map(indexed.map((d) => [d.id, Date.parse(d.updatedAt)]));
  const src = new Set<string>();
  const toUpsert: string[] = [];
  for (const d of source) {
    src.add(d.id);
    const have = idx.get(d.id);
    if (have === undefined || Date.parse(d.updatedAt) > have) toUpsert.push(d.id);
  }
  const toDelete = indexed.filter((d) => !src.has(d.id)).map((d) => d.id); // tombstones
  return { toUpsert, toDelete };
}

console.log(reconcile(
  [{ id: 'a', updatedAt: '2026-10-01T10:00:00Z' }, { id: 'b', updatedAt: '2026-10-14T09:00:00Z' }, { id: 'c', updatedAt: '2026-10-15T08:00:00Z' }],
  [{ id: 'a', updatedAt: '2026-10-01T10:00:00Z' }, { id: 'b', updatedAt: '2026-10-10T09:00:00Z' }, { id: 'z', updatedAt: '2026-09-01T00:00:00Z' }],
)); // { toUpsert: ['b', 'c'], toDelete: ['z'] }`,
        },
        explanation:
          'Reconciliation is the safety net for every event-driven pipeline: it is cheap (ids and timestamps only), catches missed creates, updates and deletes, and re-queues them through the same idempotent stages. Guard deletions: if the source listing is suspiciously small (API error returning an empty list), abort instead of wiping the index.',
      },
      quickCheck: {
        question:
          'Users report the assistant still cites a policy page that was deleted two weeks ago. The pipeline handles create and update webhooks correctly. What is the most likely gap?',
        options: [
          'The embedding model is outdated',
          'Delete events are not handled (no tombstone/delete-by-doc-id), and there is no reconciliation catching orphaned chunks',
          'The chunk size is too large',
          'The reranker prefers older documents',
        ],
        correct: 1,
        explanation:
          'Deleted sources leave orphaned chunks unless the pipeline deletes all points for that doc id on a delete event, and a periodic reconciliation removes ids no longer present at the source. Embedding model, chunk size and reranking do not resurrect deleted documents.',
      },
      source: 'Debezium docs — change event structure',
    },
    {
      heading: 'Incremental Indexing — content hashes, chunk diffs and tombstones',
      body: `**Intuition:** don't repaint the whole house because one window changed. Hash each document and each chunk; if the fingerprint is the same, skip it; if it changed, re-embed only the chunks that are actually new.

**Mechanics**
1. **Normalise** before hashing (strip volatile bits: "last viewed" footers, timestamps, tracking params) or every crawl looks like a change.
2. **Document hash** = sha256(normalised text + parser/chunker/embed versions). Unchanged → skip entirely (no parse, no embed).
3. **Chunk hashes** for changed docs: chunk again, hash each chunk's text; compare with the stored set for that doc.
   - In new set, not in old → embed + upsert.
   - In old set, not in new → delete (tombstone).
   - In both → keep (no embedding cost).
4. **Chunk ids from content hash** (doc id + chunk hash), so unchanged chunks keep their ids even if positions shift.
5. **Record manager** (a small table: doc_id, doc_hash, chunk_ids, indexed_at) stores what is in the index, like LangChain's RecordManager or LlamaIndex's docstore.

**Deletes and tombstones.** A delete event or a doc missing from a full listing removes all its chunks. Soft-delete first (payload \`deleted=true\`, filtered out at query time) if you need fast undo, then hard-delete later.

**Gotcha: boundary shift.** With fixed-size chunking, inserting one paragraph near the top changes every later chunk boundary, so all chunk hashes change. Structure-aware chunking (split on headings/paragraphs) keeps most chunks stable.

**When to use:** any corpus re-processed more than once. It typically cuts embedding work by 90%+ on daily syncs.`,
      example: `Nightly sync of 200,000 docs (avg 2,500 tokens, 6 chunks each).
- Full rebuild: 500M tokens embedded per night.
- Document hashes: 3,100 docs changed (1.55%); everything else skipped after a cheap hash compare.
- Chunk diff on the 3,100 changed docs (18,600 chunks): 4,050 new/changed chunks, 14,550 unchanged, plus deletions of 3,950 stale chunks (with heading-based chunking; fixed-size chunking would have changed ~15,000).
- Tokens embedded: 4,050 × ~420 ≈ 1.7M vs 500M → **~300× less**, runtime 3 min vs 9 h.
- One doc deleted at the source → its 6 chunk ids removed via the record manager.`,
      diagram: `doc ─▶ normalise ─▶ doc_hash ── same as record? ──yes──▶ skip
                         │ no
                         ▼
                  chunk ─▶ {h1,h2,h3,h5}   stored: {h1,h2,h4}
                         │
      new = {h3,h5} ─▶ embed + upsert (ids = hash(doc, h))
      gone = {h4}   ─▶ delete (tombstone)
      kept = {h1,h2}─▶ untouched (0 tokens)
                         ▼
     record manager: doc_id │ doc_hash │ chunk_ids │ versions │ indexed_at`,
      code: [
        {
          language: 'typescript',
          title: 'incremental.ts — hash-based skip and chunk-level diff with a Postgres record manager',
          code: `import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const pg = new Pool();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const PIPELINE_VERSION = 'p3|rec-512-64-v2|te3-small'; // part of the hash: version bump = reindex

// strip volatile content so cosmetic changes do not trigger re-embedding
const normalise = (t: string) => t.replace(/Last (viewed|updated):.*$/gim, '').replace(/\\s+/g, ' ').trim();

type Store = { embedAndUpsert(docId: string, chunks: { id: string; text: string }[]): Promise<void>; deleteIds(ids: string[]): Promise<void> };

export async function indexDoc(docId: string, text: string, chunker: (t: string) => string[], store: Store) {
  const norm = normalise(text);
  const docHash = sha(PIPELINE_VERSION + norm);
  const { rows } = await pg.query('SELECT doc_hash, chunk_ids FROM index_records WHERE doc_id = $1', [docId]);
  if (rows[0]?.doc_hash === docHash) return { skipped: true }; // unchanged: zero cost

  const chunks = chunker(norm).map((c) => ({ id: sha(docId + ':' + sha(c)).slice(0, 32), text: c }));
  const oldIds = new Set<string>(rows[0]?.chunk_ids ?? []);
  const newIds = new Set(chunks.map((c) => c.id));
  const toEmbed = chunks.filter((c) => !oldIds.has(c.id)); // only genuinely new chunk content
  const toDelete = [...oldIds].filter((id) => !newIds.has(id)); // tombstones

  if (toEmbed.length) await store.embedAndUpsert(docId, toEmbed);
  if (toDelete.length) await store.deleteIds(toDelete);
  // record AFTER the index write succeeded, so a crash means "redo", never "skip wrongly"
  await pg.query(
    'INSERT INTO index_records (doc_id, doc_hash, chunk_ids, indexed_at) VALUES ($1, $2, $3, now()) ' +
      'ON CONFLICT (doc_id) DO UPDATE SET doc_hash = EXCLUDED.doc_hash, chunk_ids = EXCLUDED.chunk_ids, indexed_at = now()',
    [docId, docHash, [...newIds]],
  );
  return { embedded: toEmbed.length, deleted: toDelete.length, kept: chunks.length - toEmbed.length };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Cuts embedding cost and pipeline runtime by orders of magnitude on routine syncs.',
          'Content-addressed chunk ids make replays and retries idempotent.',
          'Explicit tombstones keep deleted content out of answers.',
        ],
        cons: [
          {
            con: 'Volatile content (timestamps, view counters, session ids) makes every document look changed.',
            fix: 'Normalise before hashing (strip known volatile patterns, canonicalise whitespace) and monitor the "changed docs" ratio for suspicious spikes.',
          },
          {
            con: 'Fixed-size chunking shifts all boundaries after an edit, so most chunks re-embed anyway.',
            fix: 'Use structure-aware chunking on headings/paragraphs so edits only affect the local section.',
          },
          {
            con: 'The record manager and the vector index can drift apart after partial failures.',
            fix: 'Write the record only after the index write succeeds, and run periodic consistency checks (count chunk ids per doc in both) with automatic repair.',
          },
          {
            con: 'A pipeline change (new chunker or embedding model) is invisible to content hashes.',
            fix: 'Include pipeline versions in the document hash so a version bump forces re-processing, ideally into a new index version.',
          },
        ],
      },
      keyPoints: [
        'Normalise, then hash documents; skip unchanged ones.',
        'Diff chunk hashes; embed only new chunks; delete stale ones.',
        'Content-addressed ids + record manager = idempotent incremental indexing.',
        'Include pipeline versions in hashes.',
      ],
      exercise: {
        prompt: `Write \`diffChunks(oldIds: string[], newChunks: { id: string; text: string }[])\` returning \`{ toEmbed, toDelete, keptCount }\`, and \`chunkId(docId, text)\` = first 32 hex chars of sha256(docId + ':' + sha256(text)). Acceptance: if a doc's chunks go from [A, B, C] to [A, B', C, D] then toEmbed = [B', D], toDelete = [id(B)], keptCount = 2. Duplicate chunk texts within one doc must not produce duplicate ids (append an occurrence counter).`,
        hints: [
          'Use Sets for O(1) membership checks.',
          'Track how many times each text hash has appeared and include the count in the id input for repeats.',
          'keptCount = new chunks whose id already existed.',
        ],
        solution: {
          language: 'typescript',
          code: `import { createHash } from 'node:crypto';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function chunkIds(docId: string, texts: string[]): { id: string; text: string }[] {
  const seen = new Map<string, number>();
  return texts.map((text) => {
    const h = sha(text);
    const n = seen.get(h) ?? 0; // repeated boilerplate gets #1, #2...
    seen.set(h, n + 1);
    return { id: sha(docId + ':' + h + (n ? '#' + n : '')).slice(0, 32), text };
  });
}

export function diffChunks(oldIds: string[], newChunks: { id: string; text: string }[]) {
  const old = new Set(oldIds);
  const fresh = new Set(newChunks.map((c) => c.id));
  const toEmbed = newChunks.filter((c) => !old.has(c.id));
  const toDelete = oldIds.filter((id) => !fresh.has(id));
  return { toEmbed, toDelete, keptCount: newChunks.length - toEmbed.length };
}

const before = chunkIds('doc1', ['A', 'B', 'C']);
const after = chunkIds('doc1', ['A', "B'", 'C', 'D']);
const d = diffChunks(before.map((c) => c.id), after);
console.log(d.toEmbed.map((c) => c.text), d.toDelete.length, d.keptCount); // [ "B'", 'D' ] 1 2`,
        },
        explanation:
          'Content-addressed ids make chunk identity independent of position, so inserting D at the end or editing B leaves A and C untouched. The occurrence counter handles repeated boilerplate (e.g. identical disclaimers) that would otherwise collide on one id and silently drop a chunk.',
      },
      quickCheck: {
        question:
          'After switching to hash-based incremental indexing, 100% of documents are detected as changed every night. What is the most likely cause?',
        options: [
          'sha256 is non-deterministic',
          'The fetched content includes volatile parts (timestamps, tracking ids) that are hashed without normalisation',
          'The vector database lost the data',
          'Chunk overlap is too large',
        ],
        correct: 1,
        explanation:
          'A hash of raw content changes whenever anything in the bytes changes, including "Generated at 02:00" footers or session ids in links. Normalise and strip volatile content before hashing. sha256 is deterministic, and overlap affects chunks, not whether the document hash changes.',
      },
      source: 'LangChain docs — Indexing API (RecordManager); LlamaIndex docs — document management',
    },
    {
      heading: 'Data Versioning — manifests, lineage and index aliases',
      body: `**Intuition:** when a RAG answer is wrong, you need to answer "what exactly did the system know at that moment, and how was it built?" Data versioning is the receipt: which source snapshot, which parser, which chunker settings, which embedding model produced the chunks that were retrieved.

**What to version**
| Layer | Example version info |
|---|---|
| Source data | snapshot id / commit (DVC, lakeFS, Delta/Iceberg time travel), or per-doc updated_at + hash |
| Processing code | parser version, chunker config (size, overlap, splitter), enrichment prompt version |
| Embeddings | model id, dimensions, normalisation |
| Index | collection name kb_v12, HNSW params, payload schema |
| Eval data | golden set version used to approve the index |

**Mechanics**
1. **Index manifest** per build: \`{ index: 'kb_v12', sourceSnapshot, parser, chunker, embedModel, dims, docCount, chunkCount, evalScores, createdAt }\` stored in git or a registry.
2. **Lineage on every chunk** payload: doc_id, doc_hash, source_version, pipeline versions. Traces record chunk ids, so any answer can be traced back to the exact source text and build.
3. **Aliases**: applications query \`kb_current\`; a release flips it from \`kb_v11\` to \`kb_v12\` atomically after evals pass. Rollback = flip back.
4. **Retention**: keep N previous index versions (or snapshots) for rollback and audits.

Incremental updates within a version are fine; a **change of pipeline version** (chunker, embedder) means a new index version.

**When to use:** regulated domains (finance, health, legal), any system with audits, and any team that changes chunking or embeddings more than once.`,
      example: `An auditor asks why the bank's assistant told a customer on 3 June that the overdraft fee was £15 (it is £12).
- Trace 3 June → retrieved chunk ids → payload: \`doc_id=fees-uk, doc_hash=9c1…, source_version=confluence:v41, parser=p2, index=kb_v9\`.
- Manifest kb_v9: source snapshot 2026-05-28, chunker rec-512-64-v1, embed text-embedding-3-small.
- Confluence history: v41 (May) said £15; v42 (1 June) changed it to £12; the incremental sync for v42 failed (DLQ) and was never replayed.
Answer in 20 minutes, with evidence. Fix: alert on DLQ age and a freshness SLO for "fee" pages. Without lineage, this investigation would have been guesswork.`,
      diagram: `               index manifest kb_v12 (git / registry)
  ┌─────────────────────────────────────────────────────────────┐
  │ source: lakeFS commit 7e2a  parser p3  chunker rec-512-64-v2 │
  │ embed: text-embedding-3-small/1536  chunks 1.21M  eval R@5 .87│
  └─────────────────────────────────────────────────────────────┘
 app ──▶ alias kb_current ──▶ kb_v12   (kb_v11 kept for rollback)
 trace: answer ─▶ chunk ids ─▶ payload {doc_id, doc_hash,
                                 source_version, pipeline versions}`,
      code: [
        {
          language: 'typescript',
          title: 'versioning.ts — write an index manifest and flip a Qdrant alias atomically with rollback',
          code: `import { QdrantClient } from '@qdrant/js-client-rest';
import { writeFile } from 'node:fs/promises';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });

type Manifest = {
  index: string; sourceSnapshot: string; parser: string; chunker: string;
  embedModel: string; dims: number; chunkCount: number; evalRecallAt5: number; createdAt: string;
};

export async function publishIndex(m: Manifest, alias = 'kb_current', minRecall = 0.85) {
  if (m.evalRecallAt5 < minRecall) throw new Error('eval gate failed: recall@5 ' + m.evalRecallAt5);
  const info = await qdrant.getCollection(m.index);
  if ((info.points_count ?? 0) < m.chunkCount * 0.99) throw new Error('index incomplete'); // sanity check

  // remember the previous target for rollback
  const all = await qdrant.getAliases();
  const previous = all.aliases.find((a) => a.alias_name === alias)?.collection_name;

  // delete + create in ONE request: readers never see a missing alias
  await qdrant.updateCollectionAliases({
    actions: [
      ...(previous ? [{ delete_alias: { alias_name: alias } }] : []),
      { create_alias: { collection_name: m.index, alias_name: alias } },
    ],
  });
  await writeFile('manifests/' + m.index + '.json', JSON.stringify({ ...m, previous }, null, 2));
  return { live: m.index, rollbackTo: previous };
}

export async function rollback(alias: string, to: string) {
  await qdrant.updateCollectionAliases({
    actions: [{ delete_alias: { alias_name: alias } }, { create_alias: { collection_name: to, alias_name: alias } }],
  });
}`,
        },
      ],
      prosCons: {
        pros: [
          'Every answer is reproducible and auditable down to source text and pipeline versions.',
          'Alias swaps give instant, atomic releases and rollbacks of whole index versions.',
          'Comparing manifests explains quality changes between versions (chunker vs data vs embedder).',
        ],
        cons: [
          {
            con: 'Keeping several full index versions doubles or triples vector storage cost.',
            fix: 'Retain only the current and previous versions online, snapshot older ones to object storage, and drop them after the audit retention period.',
          },
          {
            con: 'Incremental updates applied to the live index after the alias flip are not in the old version, so rollback loses recent changes.',
            fix: 'Dual-write incremental updates to both current and previous versions during the rollback window, or replay the change log after rolling back.',
          },
          {
            con: 'Lineage fields bloat payloads and are inconsistent if each pipeline invents its own.',
            fix: 'Define a small mandatory payload schema (doc_id, doc_hash, source_version, pipeline_version, index_version) validated at upsert time.',
          },
        ],
      },
      keyPoints: [
        'Version source data, processing code, embeddings, index and eval set together.',
        'Manifest per index build; lineage on every chunk.',
        'Serve via alias; flip atomically after eval gates; keep the previous version.',
        'Pipeline version change ⇒ new index version.',
      ],
      exercise: {
        prompt: `Write \`needsNewIndexVersion(current, proposed)\` comparing two pipeline configs \`{ parser, chunker, embedModel, dims, sourceSnapshot }\`. Return \`{ rebuild: boolean; reasons: string[] }\`: a change in parser, chunker, embedModel or dims requires a new index version (full rebuild); a change in sourceSnapshot alone can be applied incrementally. Acceptance: changing only sourceSnapshot → rebuild false; changing dims 1536 → 512 → rebuild true with reason "dims".`,
        hints: [
          'List the fields that alter how chunks/vectors are produced.',
          'Collect every differing field as a reason.',
          'Source changes are handled by incremental indexing within the version.',
        ],
        solution: {
          language: 'typescript',
          code: `type PipelineConfig = { parser: string; chunker: string; embedModel: string; dims: number; sourceSnapshot: string };

const STRUCTURAL: (keyof PipelineConfig)[] = ['parser', 'chunker', 'embedModel', 'dims'];

export function needsNewIndexVersion(current: PipelineConfig, proposed: PipelineConfig) {
  const reasons = STRUCTURAL.filter((k) => current[k] !== proposed[k]);
  return { rebuild: reasons.length > 0, reasons, incremental: reasons.length === 0 && current.sourceSnapshot !== proposed.sourceSnapshot };
}

const cur = { parser: 'p3', chunker: 'rec-512-64-v2', embedModel: 'text-embedding-3-small', dims: 1536, sourceSnapshot: 's41' };
console.log(needsNewIndexVersion(cur, { ...cur, sourceSnapshot: 's42' })); // rebuild false, incremental true
console.log(needsNewIndexVersion(cur, { ...cur, dims: 512 })); // rebuild true, reasons ['dims']`,
        },
        explanation:
          'Structural changes alter every chunk or vector, so mixing them into the live index creates an inconsistent hybrid (some chunks old-style, some new; or incompatible vectors). They go into a new index version built side by side and released via alias. Content changes alone flow through incremental indexing.',
      },
      quickCheck: {
        question:
          'Why should an application query an alias like kb_current instead of the physical collection kb_v12?',
        options: [
          'Aliases make vector search faster',
          'Releases and rollbacks become an atomic pointer change with no application deploy',
          'Aliases compress vectors',
          'Physical collection names are limited to 8 characters',
        ],
        correct: 1,
        explanation:
          'An alias decouples the app from physical index versions: you build kb_v13 alongside, evaluate it and swap the alias in one atomic operation; rollback is the same swap backwards. Aliases do not change search speed or storage.',
      },
      source: 'Qdrant docs — Collection aliases; DVC docs — Data versioning',
    },
    {
      heading: 'Embedding Migration — blue-green re-embedding with dual-write and shadow evals',
      body: `**Intuition:** changing the embedding model is like changing the language of the library catalogue. Old entries in English are useless to a reader who only speaks French: vectors from different models live in **different spaces** and cannot be mixed. You must translate (re-embed) everything, and keep the old catalogue open until the new one is complete and checked.

**Why migrate:** better retrieval quality (new model scores higher on your eval), lower cost or dimensions (e.g. 3072 → 1024 with Matryoshka-style truncation), multilingual needs, or the old model being deprecated.

**Blue-green migration plan**
1. **Evaluate first** on your golden queries: recall@k / nDCG for old vs new on a sample index. No gain, no migration.
2. **Create the green index** (new collection, new dims, tuned HNSW params).
3. **Dual-write**: from now on the pipeline writes every change to both blue and green, so green does not fall behind during backfill.
4. **Backfill**: re-embed all existing chunks (reuse stored chunk text; no re-parsing), batched, rate-limited, resumable via checkpoints; Batch APIs cut cost ~50%.
5. **Verify**: counts per doc match, sample consistency, then **shadow reads**: run live queries against both and compare recall on labelled sets plus overlap@k on live traffic.
6. **Cut over** by flipping the alias (and query embedding model at the same time). Query and document embeddings must come from the same model.
7. **Keep blue** for a rollback window (dual-write continues), then decommission.

**Cost maths:** tokens × price. 50M chunks × 400 tokens = 20B tokens; at $0.02/1M = $400 (≈ $200 batched). The real costs: throughput time against rate limits, temporary double storage, and eval work.

**When to use:** only with measured gains; plan it like a database migration.`,
      example: `Corpus: 8M chunks × 350 tokens = 2.8B tokens. Old: 1536-d model; new: model with 1024-d output, recall@10 on 500 golden queries 0.81 → 0.88.
- Embedding cost: 2.8B × $0.02/1M (illustrative) = **$56** sync, ~$28 via Batch API.
- Throughput at 3M TPM limit: 2.8B / 3M ≈ 933 min ≈ **15.6 h** of continuous backfill (batch API: within 24 h, separate quota).
- Storage: green 8M × 1024 × 4 B ≈ 32.8 GB raw vectors (+HNSW graph) alongside blue's 49 GB during the overlap.
- Shadow week: overlap@10 between blue and green results 58% (expected: different models), green recall on labelled set 0.88, thumbs-down on a 10% canary flat. Alias flipped; blue retained 14 days, then deleted.`,
      diagram: `             ┌──────────── pipeline (changes) ────────────┐
             ▼ dual-write                                 ▼
      blue: kb_v12 (model A, 1536-d)            green: kb_v13 (model B, 1024-d)
             ▲                                            ▲
 queries ── alias kb_current (embed with A)      backfill: stored chunk text
             │                                    → batch embed B → upsert
             └── shadow: embed with B, query green, compare recall/overlap
 cutover: flip alias + switch query embedder to B together ─▶ keep blue N days`,
      code: [
        {
          language: 'typescript',
          title: 'migrate.ts — resumable backfill of stored chunks into the green index with checkpoints',
          code: `import OpenAI from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import Redis from 'ioredis';

const openai = new OpenAI({ maxRetries: 5 });
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
const redis = new Redis(process.env.REDIS_URL!);
const BLUE = 'kb_v12';
const GREEN = 'kb_v13';
const NEW_MODEL = process.env.NEW_EMBED_MODEL ?? 'text-embedding-3-large';
const DIMS = 1024; // text-embedding-3 models support a 'dimensions' parameter

export async function backfill(batchSize = 256) {
  // resume from the last checkpoint (Qdrant scroll offset), so crashes do not restart from zero
  let offset: any = JSON.parse((await redis.get('migrate:' + GREEN + ':offset')) ?? 'null');
  let done = Number(await redis.get('migrate:' + GREEN + ':done')) || 0;
  for (;;) {
    const page = await qdrant.scroll(BLUE, { limit: batchSize, offset: offset ?? undefined, with_payload: true, with_vector: false });
    if (!page.points.length) break;
    const texts = page.points.map((p) => String((p.payload as any).text));
    const emb = await openai.embeddings.create({ model: NEW_MODEL, input: texts, dimensions: DIMS });
    await qdrant.upsert(GREEN, {
      wait: true,
      points: page.points.map((p, i) => ({
        id: p.id, // same ids in both indexes: easy count checks and shadow comparisons
        vector: emb.data[i].embedding,
        payload: { ...(p.payload as object), embed_model: NEW_MODEL, dims: DIMS },
      })),
    });
    done += page.points.length;
    offset = page.next_page_offset ?? null;
    await redis.mset('migrate:' + GREEN + ':offset', JSON.stringify(offset), 'migrate:' + GREEN + ':done', String(done));
    if (offset === null) break;
  }
  const [b, g] = await Promise.all([qdrant.count(BLUE, { exact: true }), qdrant.count(GREEN, { exact: true })]);
  return { done, blue: b.count, green: g.count, complete: b.count === g.count };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Zero downtime: users keep querying blue until green is complete and proven.',
          'Instant rollback by flipping the alias back while dual-write keeps both current.',
          'Re-embedding stored chunk text avoids re-parsing and re-chunking (cheaper, isolates the variable).',
        ],
        cons: [
          {
            con: 'Mixing old and new vectors (or embedding queries with a different model than documents) silently destroys retrieval quality.',
            fix: 'Store embed_model on every point and in the manifest, switch the query embedder and the alias in the same release, and assert model equality at query time.',
          },
          {
            con: 'Backfill competes with live traffic for embedding rate limits and takes many hours.',
            fix: 'Use a separate project quota or the Batch API for backfill, rate-limit it below interactive needs, and checkpoint so it can pause and resume.',
          },
          {
            con: 'Changes during the backfill window are missed by green.',
            fix: 'Start dual-write before the backfill begins, make upserts idempotent, and run a final reconciliation (ids + doc hashes) before cutover.',
          },
          {
            con: 'Thresholds and tuned parameters (similarity cut-offs, semantic cache thresholds, hybrid weights) were calibrated for the old model.',
            fix: 'Re-tune score thresholds and fusion weights on labelled data for the new model before cutover.',
          },
        ],
      },
      keyPoints: [
        'Vectors from different models are incompatible: re-embed everything.',
        'Evaluate first; migrate only for measured gains.',
        'Green index + dual-write + resumable backfill + shadow evals + alias cutover.',
        'Switch query embedder and alias together; re-tune thresholds.',
      ],
      exercise: {
        prompt: `Write \`migrationPlan({ chunks, avgTokens, pricePer1M, batchDiscount, tpm, dims, bytesPerDim })\` returning \`{ tokens, costUsd, costBatchUsd, hoursAtTpm, vectorGB }\`. Acceptance: 8M chunks, 350 tokens, $0.02, discount 0.5, 3M TPM, 1024 dims, 4 bytes → tokens 2.8e9, cost 56, batch 28, hours ≈ 15.6, vectorGB ≈ 32.8 (decimal GB, raw vectors only).`,
        hints: [
          'tokens = chunks × avgTokens; cost = tokens / 1e6 × price.',
          'minutes = tokens / tpm; hours = minutes / 60.',
          'bytes = chunks × dims × bytesPerDim; GB = bytes / 1e9.',
        ],
        solution: {
          language: 'typescript',
          code: `type P = { chunks: number; avgTokens: number; pricePer1M: number; batchDiscount: number; tpm: number; dims: number; bytesPerDim: number };

export function migrationPlan(p: P) {
  const tokens = p.chunks * p.avgTokens;
  const costUsd = (tokens / 1e6) * p.pricePer1M;
  const costBatchUsd = costUsd * (1 - p.batchDiscount);
  const hoursAtTpm = tokens / p.tpm / 60;
  const vectorGB = (p.chunks * p.dims * p.bytesPerDim) / 1e9; // excludes HNSW graph + payload
  const r = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
  return { tokens, costUsd: r(costUsd, 2), costBatchUsd: r(costBatchUsd, 2), hoursAtTpm: r(hoursAtTpm), vectorGB: r(vectorGB) };
}

console.log(migrationPlan({ chunks: 8e6, avgTokens: 350, pricePer1M: 0.02, batchDiscount: 0.5, tpm: 3e6, dims: 1024, bytesPerDim: 4 }));
// { tokens: 2800000000, costUsd: 56, costBatchUsd: 28, hoursAtTpm: 15.6, vectorGB: 32.8 }`,
        },
        explanation:
          'For small embedding models the token bill is often trivial; throughput (hours against your rate limit) and temporary double storage dominate planning. HNSW graphs add roughly M × 2 × 4 bytes per vector per layer-0 link set plus payload, so budget well above raw vector size; int8 or binary quantisation can shrink green substantially.',
      },
      quickCheck: {
        question:
          'Halfway through a migration, someone points the query embedder at the new model while the alias still points to the old index. What happens?',
        options: [
          'Retrieval quality improves immediately',
          'Retrieval returns near-random results because query vectors and document vectors come from different embedding spaces',
          'The vector DB automatically converts the vectors',
          'Nothing; cosine similarity is model-independent',
        ],
        correct: 1,
        explanation:
          'Embedding spaces of different models are not aligned, and dimensions may not even match (which errors). Similarity between a model-B query and model-A documents is meaningless, so results are effectively random. Query model and index model must switch together.',
      },
      source: 'OpenAI docs — Embeddings (dimensions parameter); Qdrant docs — aliases',
    },
    {
      heading: 'Synthetic Data Generation — Q&A for evals and fine-tuning, with quality filtering',
      body: `**Intuition:** you need hundreds of realistic question/answer pairs to evaluate retrieval or fine-tune a model, but users have not asked them yet (or you cannot use their data). An LLM can write questions from your documents, like a teacher writing an exam from a textbook. But teachers write bad questions too, so you **filter hard**.

**Generation**
1. **Sample chunks** stratified by source, topic cluster and document type (not only the first pages).
2. **Generate** per chunk with structured output: question, answer, evidence quote, type (factual, multi-hop, comparison, unanswerable), difficulty. Vary personas and phrasing ("as a new employee…", typos, short queries) so questions look like real traffic, not like the text.
3. **Multi-hop**: give two related chunks and ask for a question needing both.

**Filtering (where quality comes from)**
| Filter | Removes |
|---|---|
| Schema + length checks | malformed, trivial or huge items |
| Evidence check | answers whose quote is not literally in the chunk |
| Answerability / groundedness judge | questions not answerable from the source, answers adding facts |
| Roundtrip retrieval | questions whose source chunk is not in the top-k (ambiguous or leaking wording); also keep a slice of "hard" ones for evals |
| Dedupe (embeddings, cos > 0.92) | near-duplicate questions |
| Lexical-overlap cap | questions copying long spans of the chunk (too easy for retrieval) |
| Human spot-check (5–10%) | systematic problems; measure acceptance rate |

**Uses:** retrieval eval sets (question → expected chunk ids), end-to-end RAG evals, and fine-tuning data (SFT pairs, embedding fine-tuning with question ↔ chunk positives). Keep synthetic and real data labelled separately, and validate any conclusion on real queries.

**When to use:** cold start before real traffic, coverage of rare topics, privacy-restricted domains.`,
      example: `Policy corpus, 6,000 chunks → sampled 1,200 (stratified by 25 topic clusters) → 2 questions each = 2,400 raw items.
- Schema/length: −60. Evidence quote not found in chunk: −210. Judge "not answerable from source": −190.
- Roundtrip (source chunk in top-10 with the current retriever): 1,640 pass; 300 fail → 150 kept as a labelled "hard" slice after human review, 150 dropped as ambiguous.
- Dedupe at cos > 0.92: −220. Lexical-overlap cap (≥ 70% of tokens copied): −80.
- Final: ~1,490 items; human spot-check of 150: 93% acceptable.
Cost (illustrative small model, ~1,100 tokens per generation + judge calls): ≈ 2,400 × 2 calls × 1,100 tokens ≈ 5.3M tokens → **≈ $3–5**, far cheaper than 40 hours of manual writing.`,
      diagram: `chunks ─▶ stratified sample ─▶ LLM generate (JSON: q, a, evidence, type)
                                        │  personas, phrasing variety
                                        ▼
  schema ✓ ─▶ evidence ⊂ chunk ✓ ─▶ judge: answerable & grounded ✓
        ─▶ roundtrip: retrieve(q) top-k ∋ source?  ✓ keep │ ✗ hard-slice / drop
        ─▶ dedupe (cos > 0.92) ─▶ overlap cap ─▶ human spot-check 5–10%
                                        ▼
         eval set v3 (q, a, source_chunk_ids, type, synthetic=true)`,
      code: [
        {
          language: 'typescript',
          title: 'synth.ts — generate Q&A from a chunk with structured output, then filter by evidence and roundtrip retrieval',
          code: `import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI();
const GEN_MODEL = process.env.GEN_MODEL ?? 'gpt-5-mini';

const QA = z.object({
  items: z.array(z.object({
    question: z.string().min(10).max(300),
    answer: z.string().min(1).max(800),
    evidence: z.string().min(10), // verbatim quote from the chunk
    type: z.enum(['factual', 'procedural', 'comparison', 'unanswerable']),
  })).max(3),
});

export async function generate(chunk: { id: string; text: string }, persona: string) {
  const res = await openai.chat.completions.create({
    model: GEN_MODEL,
    temperature: 0.9, // diversity in phrasing
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Write realistic user questions about the passage, as asked by: ' + persona + '. ' +
        'Do not copy phrases from the passage. Answer only from the passage and include a verbatim evidence quote. ' +
        'Return JSON {"items":[{question,answer,evidence,type}]} with at most 3 items.' },
      { role: 'user', content: chunk.text },
    ],
  });
  const parsed = QA.safeParse(JSON.parse(res.choices[0].message.content ?? '{}'));
  return parsed.success ? parsed.data.items.map((it) => ({ ...it, sourceId: chunk.id })) : [];
}

type Item = Awaited<ReturnType<typeof generate>>[number];
const norm = (s: string) => s.toLowerCase().replace(/\\s+/g, ' ').trim();

export async function filter(items: Item[], chunkText: (id: string) => string, retrieve: (q: string, k: number) => Promise<string[]>) {
  const kept: (Item & { hard: boolean })[] = [];
  for (const it of items) {
    if (!norm(chunkText(it.sourceId)).includes(norm(it.evidence))) continue; // hallucinated evidence
    const top = await retrieve(it.question, 10);
    // roundtrip: the generating chunk should be retrievable; failures form a reviewed "hard" slice
    kept.push({ ...it, hard: !top.includes(it.sourceId) });
  }
  return kept; // next: judge answerability, dedupe by embedding, human spot-check
}`,
        },
      ],
      prosCons: {
        pros: [
          'Hundreds of labelled eval items in hours for a few dollars, with known source chunks (perfect retrieval labels).',
          'Covers rare topics and new documents before any user asks about them.',
          'Avoids using sensitive production queries for evals or training.',
        ],
        cons: [
          {
            con: 'Synthetic questions mirror document wording, so retrieval scores look much better than on real queries.',
            fix: 'Prompt for paraphrase and personas, cap lexical overlap with the chunk, and calibrate against a small real-query set before trusting absolute numbers.',
          },
          {
            con: 'Generated answers include hallucinated facts or are not answerable from the source.',
            fix: 'Require verbatim evidence and verify it, run a groundedness/answerability judge, and spot-check a sample with humans.',
          },
          {
            con: 'Using the same model to generate, answer and judge inflates scores (self-preference).',
            fix: 'Use a different model family for judging than for generation and for the system under test, and calibrate the judge on human labels.',
          },
          {
            con: 'Fine-tuning on unfiltered synthetic data amplifies errors and reduces diversity (model collapse effects).',
            fix: 'Filter aggressively, dedupe, mix with real data, and hold out real examples to validate the fine-tuned model.',
          },
        ],
      },
      keyPoints: [
        'Stratify chunk sampling; vary personas and phrasing.',
        'Structured output with verbatim evidence.',
        'Filter: evidence check, judge, roundtrip retrieval, dedupe, overlap cap, human sample.',
        'Label data as synthetic; validate conclusions on real queries.',
      ],
      exercise: {
        prompt: `Write \`dedupe(items, embed, threshold = 0.92)\` that removes near-duplicate questions: process items in order, keep an item only if its question embedding has cosine < threshold with every already-kept item. Also write \`overlapRatio(question, chunk)\` = share of question word tokens (lowercased, length > 3) that appear in the chunk, and drop items with ratio ≥ 0.7. Acceptance: two paraphrases with cos 0.95 → one kept; a question copied from the chunk → dropped.`,
        hints: [
          'Pre-compute embeddings for all questions in one batched call.',
          'Normalise vectors once so cosine = dot product.',
          'For overlap, build a Set of chunk words and count question words found in it.',
        ],
        solution: {
          language: 'typescript',
          code: `type Item = { question: string; sourceText: string };

const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);

export function overlapRatio(question: string, chunk: string): number {
  const cw = new Set(words(chunk));
  const qw = words(question);
  return qw.length ? qw.filter((w) => cw.has(w)).length / qw.length : 0;
}

export async function dedupe(items: Item[], embed: (texts: string[]) => Promise<number[][]>, threshold = 0.92) {
  const candidates = items.filter((it) => overlapRatio(it.question, it.sourceText) < 0.7); // too-literal questions out
  const vecs = (await embed(candidates.map((c) => c.question))).map(unit);
  const kept: number[] = [];
  candidates.forEach((_, i) => {
    if (kept.every((j) => dot(vecs[i], vecs[j]) < threshold)) kept.push(i);
  });
  return kept.map((i) => candidates[i]);
}`,
        },
        explanation:
          'Greedy dedupe is O(n²) in comparisons but fine for a few thousand items; for larger sets use an ANN index. The overlap cap removes questions that a keyword search would trivially solve, which otherwise inflate retrieval metrics and teach a fine-tuned embedder to match surface wording rather than meaning.',
      },
      quickCheck: {
        question:
          'Your retriever scores recall@5 = 0.96 on a synthetic eval set but users complain it misses relevant documents. What is the most likely reason?',
        options: [
          'The vector index is corrupted',
          'Synthetic questions reuse document wording, so they are much easier than real user queries',
          'Recall@5 is the wrong metric for RAG',
          'The embedding model is too large',
        ],
        correct: 1,
        explanation:
          'Questions generated from a chunk tend to copy its vocabulary, making retrieval easy. Real users use different words, abbreviations and context. Cap lexical overlap, generate with personas and paraphrasing, and validate on a sample of real queries. A corrupted index would hurt synthetic scores too.',
      },
      source: 'Alberti et al. 2019 — roundtrip consistency; Ragas — testset generation',
    },
  ],
  codeChallenges: [
    {
      id: 'data-pipelines-indexing-cc-1',
      title: 'Turn a nightly full re-index into an incremental, idempotent sync',
      context:
        'A cron job wipes the collection and re-embeds 300,000 documents every night (7 hours, ~$30/night, and search returns empty results while it runs). Deleted docs are handled only because everything is wiped.',
      task: 'Replace it with an incremental sync: skip unchanged docs via hashes, re-embed only changed chunks with deterministic ids, remove deleted docs and stale chunks, never leave the index empty, and be safe to re-run after a crash.',
      starter: {
        language: 'typescript',
        code: `export async function nightly() {
  await qdrant.deleteCollection('kb');
  await qdrant.createCollection('kb', { vectors: { size: 1536, distance: 'Cosine' } });
  for (const doc of await source.listAll()) {
    const chunks = split(doc.text, 1000);
    for (const c of chunks) {
      const e = await openai.embeddings.create({ model: 'text-embedding-3-small', input: c });
      await qdrant.upsert('kb', { points: [{ id: crypto.randomUUID(), vector: e.data[0].embedding, payload: { doc: doc.id, text: c } }] });
    }
  }
}`,
      },
      hints: [
        'Keep a record table: doc_id → doc_hash, chunk_ids. Compare with the source listing.',
        'Content-hash chunk ids make re-runs overwrite instead of duplicating.',
        'Batch embeddings (many inputs per call) and guard against an empty source listing before removing anything.',
      ],
      solution: {
        language: 'typescript',
        code: `import { createHash } from 'node:crypto';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const uuid = (h: string) => [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
const PIPE = 'p3|heading-512|te3-small';
const COLLECTION = 'kb_current'; // alias; never dropped during sync

export async function sync() {
  const docs = await source.listAll(); // [{ id, text, updatedAt }]
  const records = await db.loadRecords(); // Map<docId, { docHash, chunkIds: string[] }>
  if (docs.length < records.size * 0.9) throw new Error('source listing shrank >10%: refusing to remove docs'); // safety

  const seen = new Set<string>();
  for (const doc of docs) {
    seen.add(doc.id);
    const docHash = sha(PIPE + normalise(doc.text));
    const rec = records.get(doc.id);
    if (rec?.docHash === docHash) continue; // unchanged: no cost

    const chunks = splitByHeadings(doc.text, 512).map((t) => ({ id: uuid(sha(doc.id + ':' + sha(t))), text: t }));
    const old = new Set(rec?.chunkIds ?? []);
    const fresh = chunks.filter((c) => !old.has(c.id));
    for (let i = 0; i < fresh.length; i += 256) {
      const batch = fresh.slice(i, i + 256);
      const e = await openai.embeddings.create({ model: 'text-embedding-3-small', input: batch.map((c) => c.text) });
      await qdrant.upsert(COLLECTION, {
        wait: true,
        points: batch.map((c, j) => ({ id: c.id, vector: e.data[j].embedding, payload: { doc_id: doc.id, text: c.text, doc_hash: docHash } })),
      });
    }
    const keep = new Set(chunks.map((c) => c.id));
    const stale = [...old].filter((id) => !keep.has(id));
    if (stale.length) await qdrant.delete(COLLECTION, { wait: true, points: stale });
    await db.saveRecord(doc.id, docHash, [...keep]); // after index writes succeed
  }
  // tombstones: documents removed at the source
  for (const [docId, rec] of records) {
    if (seen.has(docId)) continue;
    await qdrant.delete(COLLECTION, { wait: true, points: rec.chunkIds });
    await db.removeRecord(docId);
  }
}`,
      },
      explanation:
        'The original dropped the live collection (empty search for 7 hours), re-embedded everything one chunk per call, and used random ids (any re-run duplicates). The sync keeps the alias serving throughout, skips ~98% of documents by hash, embeds only new chunk content in batches of 256, removes stale chunks and deleted documents explicitly, writes the record only after successful index writes (crash → redo, never skip), and refuses mass removal when the source listing looks truncated.',
      followUps: [
        {
          q: 'When would you still do a full rebuild?',
          a: 'When the pipeline itself changes (parser, chunker, embedding model, index parameters): build a new versioned collection side by side, evaluate it and flip the alias, rather than mutating the live index.',
        },
        {
          q: 'How do you make this sync parallel without races?',
          a: 'Partition work by doc id (e.g. queue jobs keyed by doc id with a per-doc lock or BullMQ job id), since all writes for a document must be serialised; different documents can be processed concurrently.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-cc-2',
      title: 'Fix an embedding migration that silently broke retrieval',
      context:
        'The team switched EMBED_MODEL from a 1536-d model to a new 1536-d model in config. New and updated documents are embedded with the new model; old ones were not touched. Retrieval quality dropped ~30% and nobody got an error.',
      task: 'Explain the failure and implement a safe migration: green collection, dual-write, resumable backfill, a shadow evaluation comparing recall@k on labelled queries, and an atomic cutover of alias and query model together.',
      starter: {
        language: 'typescript',
        code: `const EMBED_MODEL = process.env.EMBED_MODEL; // changed from old-model to new-model

export async function upsertChunk(c) {
  const v = await embed(EMBED_MODEL, c.text);
  await qdrant.upsert('kb', { points: [{ id: c.id, vector: v, payload: c }] });
}

export async function search(q) {
  const v = await embed(EMBED_MODEL, q);
  return qdrant.search('kb', { vector: v, limit: 10 });
}`,
      },
      hints: [
        'Same dimensions do not mean the same vector space: the index now mixes two spaces.',
        'Tie each collection to exactly one embedding model and store it in a manifest.',
        'Write to both collections during the migration; read from one, chosen by alias, with the matching query model.',
      ],
      solution: {
        language: 'typescript',
        code: `type IndexVersion = { collection: string; model: string; dims: number };
const BLUE: IndexVersion = { collection: 'kb_v12', model: 'old-embed-model', dims: 1536 };
const GREEN: IndexVersion = { collection: 'kb_v13', model: 'new-embed-model', dims: 1536 };

// Single source of truth: which version serves reads (flag/config, flipped with the alias)
async function active(): Promise<IndexVersion> {
  return (await flags.get('kb.active')) === 'green' ? GREEN : BLUE;
}
const migrating = () => flags.get('kb.dualWrite'); // true from before backfill until blue is retired

export async function upsertChunk(c: { id: string; text: string; [k: string]: unknown }) {
  const targets = (await migrating()) ? [BLUE, GREEN] : [await active()];
  await Promise.all(targets.map(async (t) => {
    const v = await embed(t.model, c.text, t.dims);
    await qdrant.upsert(t.collection, { wait: true, points: [{ id: c.id, vector: v, payload: { ...c, embed_model: t.model } }] });
  }));
}

export async function search(q: string) {
  const t = await active(); // query model ALWAYS matches the collection being searched
  const v = await embed(t.model, q, t.dims);
  return qdrant.search(t.collection, { vector: v, limit: 10 });
}

// Shadow evaluation before flipping kb.active
export async function shadowEval(labelled: { q: string; relevantIds: string[] }[], k = 10) {
  const recall = async (t: IndexVersion) => {
    let hit = 0;
    for (const { q, relevantIds } of labelled) {
      const res = await qdrant.search(t.collection, { vector: await embed(t.model, q, t.dims), limit: k });
      const ids = new Set(res.map((r) => String(r.id)));
      hit += relevantIds.filter((id) => ids.has(id)).length / relevantIds.length;
    }
    return hit / labelled.length;
  };
  const [b, g] = await Promise.all([recall(BLUE), recall(GREEN)]);
  return { blue: b, green: g, promote: g >= b + 0.01 };
}
// Plan: dualWrite=true → backfill GREEN from stored chunk text (resumable) → counts match
//       → shadowEval → flip kb.active + alias together → keep dualWrite N days → retire BLUE`,
      },
      explanation:
        'Vectors from two different models were mixed in one collection; with equal dimensions nothing errored, but similarity between spaces is meaningless, so new queries matched old documents poorly (and vice versa). The fix binds each collection to one model, dual-writes during migration, keeps reads on one consistent version chosen by a single flag, evaluates green against blue on labelled queries, and flips the read path atomically, with blue kept current for rollback.',
      followUps: [
        {
          q: 'How would you detect this class of bug automatically in the future?',
          a: 'Store embed_model on every point and assert at query time that the query model equals the collection’s model (from the manifest); add a nightly job sampling points to verify a single model per collection and a canary retrieval eval that alerts on recall drops.',
        },
        {
          q: 'Recall improved by only 0.5 points. Do you still migrate?',
          a: 'Probably not unless there are other reasons (cost, dimensions, deprecation, multilingual support); the migration has real costs (backfill time, double storage, re-tuning thresholds) that a negligible gain does not justify.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'data-pipelines-indexing-iq-1',
      difficulty: 'hard',
      question: 'Design the ingestion pipeline for an enterprise RAG assistant over Confluence, SharePoint and a Postgres product catalogue, with a 15-minute freshness SLO and document-level permissions.',
      whatInterviewerLooksFor: [
        'Change detection per source (CDC, webhooks, delta APIs) plus reconciliation',
        'Staged, idempotent, queue-based processing with retries and DLQ',
        'ACL propagation and permission-aware retrieval',
        'Incremental indexing with hashes and tombstones',
        'Freshness and quality monitoring',
      ],
      modelAnswer: `**Change detection**
- Postgres: Debezium CDC → Kafka topic (op c/u/d with before/after rows).
- Confluence: webhooks (page created/updated/removed) + delta polling as backup.
- SharePoint: Graph delta queries on a schedule (e.g. every 5 min).
- Nightly reconciliation per source: full id + updated_at listing vs record manager.

**Processing** (each stage a queue consumer, idempotent, at-least-once):
1. **Fetch** latest content (never trust stale event payloads), resolve **ACLs** (groups/users allowed).
2. **Parse** to structured text (headings, tables), versioned parser.
3. **Hash/diff**: skip unchanged docs; chunk structure-aware; diff chunk hashes.
4. **Embed** new chunks in batches, rate-limited via token bucket; retries with backoff; DLQ.
5. **Upsert/remove** in the vector index (via alias) with payload: doc_id, chunk hash, ACL groups, source, updated_at, pipeline versions. Record manager updated last.

**Permissions.** Retrieval filters on acl_groups ∩ user's groups (payload index). Permission changes are events too: re-stamp ACLs on chunks without re-embedding.

**Freshness SLO.** Measure source change time → searchable time per doc; p95 < 15 min; alert on queue age, DLQ size and reconciliation diffs.

**Ordering.** Use per-doc keys (Kafka partition key / job id per doc) and compare source version before writing so out-of-order events cannot regress content.`,
      followUps: [
        {
          q: 'A user loses access to a space. How fast must retrieval reflect it, and how?',
          a: 'Ideally within minutes: process permission-change events with priority and update ACL payloads by filter (no re-embedding), and additionally check permissions at query time against the source or an ACL cache for sensitive content.',
        },
        {
          q: 'How do you handle a 2 GB PDF upload?',
          a: 'Route it to a separate large-document queue with higher memory workers, stream-parse page by page, chunk incrementally and checkpoint progress, so one document cannot block or crash the main pipeline.',
        },
      ],
      pitfalls: [
        'Relying only on webhooks without reconciliation',
        'Dropping ACLs during ingestion',
        'Full re-index as the update mechanism',
      ],
    },
    {
      id: 'data-pipelines-indexing-iq-2',
      difficulty: 'expert',
      question: 'Plan a zero-downtime migration of a 120M-chunk vector index to a new embedding model. Include cost, timeline, risks and rollback.',
      whatInterviewerLooksFor: [
        'Evaluation before committing',
        'Blue-green with dual-write and resumable backfill',
        'Quantified cost, throughput and storage',
        'Shadow evaluation and atomic cutover of query model + alias',
        'Re-tuning thresholds and clean rollback',
      ],
      modelAnswer: `**0. Justify.** Build a 1M-chunk sample index with the new model and compare recall@10/nDCG on 1,000 labelled queries (plus real-query sample). Proceed only for a meaningful gain (e.g. +4 pts) or forced deprecation.

**1. Numbers.** 120M chunks × 300 tokens = 36B tokens. At $0.02/1M → $720 (≈ $360 via Batch API); at $0.13/1M → $4,680. Throughput: with a 10M TPM quota → 3,600 min ≈ 60 h; batch jobs over a few days. Storage: 120M × 1024 × 4 B ≈ 492 GB raw (+ HNSW, payload); consider int8/binary quantisation; budget for blue + green side by side.

**2. Execution**
- Create green collection (new dims, HNSW params, payload indexes).
- Enable **dual-write** in the pipeline before backfill starts.
- **Backfill** from stored chunk text (no re-parsing), partitioned by id range, checkpointed, rate-limited separately from interactive embedding (separate project or Batch API).
- **Verify**: counts per partition, random sample of ids present in both, per-doc chunk counts.

**3. Validate**
- Offline eval on the full green index; **shadow reads** on 5% of live queries (log overlap@10 and score distributions); re-tune similarity thresholds, hybrid fusion weights, semantic-cache thresholds.
- Canary: 5% of users read from green with the new query model, compare feedback and answer quality.

**4. Cutover**: flip alias and query embedder in one release. Keep dual-write and blue for 2 weeks for rollback; then stop dual-write, snapshot blue to object storage, retire it.

**Risks**: mixed-space queries (assert model per collection), quota contention, missed updates (dual-write + final reconciliation), threshold drift.`,
      followUps: [
        {
          q: 'Could you avoid re-embedding by learning a linear mapping from old to new vectors?',
          a: 'Adapters can approximate a mapping and are useful for gradual transitions, but they lose quality versus true re-embedding; at these costs re-embedding is usually cheaper than the quality risk, so mappings are a stopgap at most.',
        },
        {
          q: 'What do you do with the semantic cache during the migration?',
          a: 'Version it by embedding model: start a fresh cache keyed to the new model at cutover (or re-embed cached queries in the background) and re-tune its threshold, since similarity distributions differ between models.',
        },
      ],
      pitfalls: [
        'Re-embedding documents but not switching the query model (or vice versa)',
        'Backfilling without dual-write, losing updates made during the backfill',
        'Retiring blue immediately after cutover',
      ],
    },
    {
      id: 'data-pipelines-indexing-iq-3',
      difficulty: 'hard',
      question: 'A compliance team asks you to prove which source documents and pipeline versions produced a specific answer from six months ago. What must your system have recorded, and how do you reconstruct it?',
      whatInterviewerLooksFor: [
        'Trace with retrieved chunk ids and release/index ids',
        'Chunk lineage payload and index manifests',
        'Source versioning (snapshots or document history)',
        'Retention policies aligned with audit requirements',
      ],
      modelAnswer: `**What must exist**
1. **Trace/answer log** (retained per policy, e.g. 1–7 years): request time, release id (prompt + model snapshot), index version/alias target, retrieved chunk ids with scores, final answer and citations.
2. **Chunk lineage**: each chunk carries doc_id, doc_hash, source_version (e.g. Confluence page version or lakeFS commit), parser/chunker/embedder versions, indexed_at.
3. **Index manifests**: one per index version with pipeline config and source snapshot, plus eval results that approved it.
4. **Source history**: versioned source (CMS page history, object-store versioning, lakeFS/Delta time travel) so the exact text at that version is retrievable.
5. **Prompt/model registry**: immutable prompt versions and model snapshot ids.

**Reconstruction**
- Look up the trace → release id and chunk ids.
- If the old index version was archived: restore snapshot and fetch the chunks. Otherwise use lineage (doc_id + source_version) to retrieve source text from history and re-run the versioned parser/chunker to regenerate the chunk text deterministically (verify via doc_hash).
- Re-render the exact prompt with the prompt version and retrieved text; optionally replay on the pinned model if still available.

**Policy.** Align retention for traces, manifests and source history with the audit period; index snapshots can be pruned if source history + deterministic pipelines allow regeneration.`,
      followUps: [
        {
          q: 'Traces contain user PII and must be purged after 90 days, but audits need 2 years. How do you reconcile?',
          a: 'Split storage: keep a minimal audit record (ids, versions, chunk ids, answer hash or redacted answer) for 2 years and purge raw user content after 90 days, or encrypt content with per-user keys that can be destroyed on request.',
        },
        {
          q: 'Why does deterministic chunking matter here?',
          a: 'If re-running the same parser and chunker versions on the same source version reproduces identical chunks (verified by hashes), you do not need to archive every index snapshot to reconstruct what was retrieved.',
        },
      ],
      pitfalls: [
        'Logging answers but not retrieved chunk ids',
        'No source version on chunks',
        'Mutable prompts without version history',
      ],
    },
    {
      id: 'data-pipelines-indexing-iq-4',
      difficulty: 'medium',
      question: 'How would you build an evaluation set for a new RAG product with no users yet, and how do you keep it trustworthy?',
      whatInterviewerLooksFor: [
        'Synthetic generation from stratified chunks with structured outputs',
        'Multi-stage filtering and human review',
        'Mix of question types including unanswerable and multi-hop',
        'Calibration against real queries as they arrive',
      ],
      modelAnswer: `**Seed**
- Collect 30–100 real questions from domain experts, support tickets or search logs of an existing system: the calibration anchor.

**Generate**
- Stratified sample of chunks across sources, clusters and doc types.
- LLM generation with structured output (question, answer, evidence quote, type), personas and phrasing variety; multi-hop items from related chunk pairs; ~10% unanswerable questions (to test refusals).

**Filter**
- Evidence quote must appear in the chunk; judge (different model family) checks answerability and groundedness.
- Roundtrip retrieval: source chunk in top-k → normal item; not found → candidate "hard" item after review.
- Embedding dedupe (cos > 0.92) and lexical-overlap cap.
- Human spot-check of 10%; if acceptance < 85%, fix the prompt and regenerate.

**Store and version**: eval set v1 with fields synthetic=true/false, type, source chunk ids, created_with (model + prompt version).

**Keep it honest**
- Report metrics separately for synthetic and real items; compare their gap.
- As real traffic arrives, sample and label real queries (especially failures and negative feedback) and grow the real share over time.
- Regenerate items for new documents; retire items whose source docs were removed.`,
      followUps: [
        {
          q: 'How do you create good unanswerable questions?',
          a: 'Ask the generator for plausible questions on the same topic whose answer is not in the passage (or perturb an answerable question’s key entity), then verify with a judge and retrieval that no chunk in the corpus answers it.',
        },
        {
          q: 'Should the same model generate the questions and power the RAG system?',
          a: 'Preferably not: shared biases make the task easier for that model; use a different model family for generation and judging, or at least validate on real questions.',
        },
      ],
      pitfalls: [
        'Trusting raw synthetic generations without filtering',
        'Only factual single-chunk questions',
        'Never validating against real user queries',
      ],
    },
    {
      id: 'data-pipelines-indexing-iq-5',
      difficulty: 'hard',
      question: 'Your nightly incremental sync processed 0 removals for a month, then one night wiped 40% of the index. Diagnose and redesign the removal logic.',
      context: 'Removals are inferred: any indexed doc missing from the source listing is removed.',
      whatInterviewerLooksFor: [
        'Identifies partial/failed source listing as the cause',
        'Safety guards on mass removal',
        'Explicit delete events and soft deletes',
        'Monitoring and recovery plan',
      ],
      modelAnswer: `**Likely cause.** The source listing API paginated and failed mid-way (timeout, auth expiry, rate limit), returning a partial list without an error. The sync treated every doc missing from that partial list as removed. The zero removals before suggest real deletions were also not being caught (e.g. archived pages still listed).

**Immediate recovery.** Stop the sync; restore from the previous index version or snapshot (alias flip), or re-run ingestion for the affected doc ids from the record manager.

**Redesign**
1. **Explicit delete events** where available (CDC op=d, webhook "removed", delta APIs with deleted flags) as the primary signal.
2. **Inferred removals only from a complete listing**: verify pagination completed, compare total count with the source-reported count, fail the run on any page error.
3. **Mass-removal guard**: if inferred removals > 2% of the index (or > N docs), do not apply; alert a human.
4. **Soft delete first**: mark deleted=true (filtered at query time) and purge after 7 days unless restored, making mistakes reversible.
5. **Tombstone double-check**: confirm individually (GET doc → 404/410) before removing each inferred doc.
6. **Monitoring**: removals per run with anomaly alerts; index size trend; freshness and reconciliation reports.

Archived-vs-deleted semantics should be defined with the content owners (archived pages may need to stay searchable or be excluded explicitly).`,
      followUps: [
        {
          q: 'How does soft delete interact with retrieval performance?',
          a: 'A filter on deleted=false with a payload index is cheap; keep the soft-deleted fraction small by purging after the grace period so HNSW does not spend effort on many filtered-out points.',
        },
        {
          q: 'How would you test the guard?',
          a: 'Integration tests with a mocked source returning truncated pages, errors mid-pagination and an empty list, asserting that no removals are applied and an alert fires.',
        },
      ],
      pitfalls: [
        'Treating an empty or partial listing as authoritative',
        'Purging immediately with no undo',
        'No alerting on unusual removal volume',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'data-pipelines-indexing-est-1',
      question: 'Daily sync cost and time: 2M documents, 1.5% change daily. Compare a full nightly re-embed with hash-based incremental indexing.',
      assumptions: [
        'Average document 3,000 tokens → 7 chunks of ~430 tokens',
        'Embedding price $0.02 per 1M tokens (illustrative); embedding throughput limited to 5M TPM',
        'With structure-aware chunking, a changed doc has on average 2 of 7 chunks actually changed',
        'Hash comparison cost negligible (metadata reads)',
      ],
      steps: [
        { label: 'Full re-embed tokens', calc: '2,000,000 × 3,000 = 6B tokens/day' },
        { label: 'Full re-embed cost and time', calc: '6,000 × $0.02 = $120/day; 6B / 5M TPM = 1,200 min = 20 h' },
        { label: 'Changed docs', calc: '2,000,000 × 0.015 = 30,000' },
        { label: 'Incremental tokens', calc: '30,000 × 2 chunks × 430 ≈ 25.8M tokens' },
        { label: 'Incremental cost and time', calc: '25.8 × $0.02 ≈ $0.52/day; 25.8M / 5M ≈ 5.2 min' },
      ],
      answer: 'Full: ~$120/day and ~20 hours (does not even fit a nightly window). Incremental: ~$0.50/day and ~5 minutes, about 230× cheaper and faster.',
      insight:
        'The full rebuild is infeasible on time before it is expensive. Incremental indexing also makes near-real-time freshness possible: 30,000 changes/day spread over the day is ~21 docs/min.',
      followUps: [
        {
          q: 'With fixed-size chunking, edits shift boundaries so ~6 of 7 chunks change. New numbers?',
          a: '30,000 × 6 × 430 ≈ 77M tokens ≈ $1.55/day and ~15 min: still cheap, but 3× more work and churn in chunk ids, which also invalidates caches and lineage more often.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-est-2',
      question: 'Cost and size of a synthetic eval set: generate and filter Q&A from 3,000 chunks to end up with ~2,000 accepted items.',
      assumptions: [
        'Generation: 1 call per chunk, ~600 input + 350 output tokens, 2 items per call',
        'Judge: 1 call per item, ~900 input + 80 output tokens',
        'Roundtrip retrieval: 1 query embedding per item (~20 tokens) + vector search',
        'Illustrative prices: generator $0.25 in / $2 out per 1M; judge $1 in / $8 out per 1M',
        'Overall acceptance rate after all filters ≈ 33%',
      ],
      steps: [
        { label: 'Raw items', calc: '3,000 chunks × 2 = 6,000 items → 6,000 × 0.33 ≈ 2,000 accepted' },
        { label: 'Generation cost', calc: '3,000 × (600 × 0.25 + 350 × 2) / 1M = 3,000 × 850 / 1M ≈ $2.55' },
        { label: 'Judge cost', calc: '6,000 × (900 × 1 + 80 × 8) / 1M = 6,000 × 1,540 / 1M ≈ $9.24' },
        { label: 'Embedding cost', calc: '6,000 × 20 = 120K tokens → ≈ $0.002' },
        { label: 'Human spot-check (10% of accepted)', calc: '200 items × 1 min ≈ 3.3 h' },
      ],
      answer: '≈ $12 in model calls (judging dominates) plus ~3 hours of human review for ~2,000 filtered items.',
      insight:
        'Model cost is negligible; the scarce resource is human review time and the trustworthiness of filters. Spend effort on judge calibration and the real-query anchor set rather than on cheaper generation.',
      followUps: [
        {
          q: 'How would you cut judge cost if you scale to 100,000 items?',
          a: 'Apply cheap filters first (evidence string match, dedupe, overlap cap, roundtrip retrieval) so only surviving items reach the judge, and use a smaller calibrated judge or the Batch API for ~50% off.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'data-pipelines-indexing-mcq-01',
      difficulty: 'medium',
      question: 'Which component makes repeated runs of an ingestion job for the same document idempotent?',
      options: [
        'Random UUIDs for each chunk',
        'Deterministic chunk ids derived from document id and chunk content',
        'Increasing the HNSW M parameter',
        'Running the job only once per day',
      ],
      correct: [1],
      explanation:
        'Deterministic, content-derived ids mean a replay writes the same ids, so upserts overwrite rather than duplicate. Random UUIDs create duplicates on every run. HNSW parameters and scheduling do not affect idempotency.',
      followUps: [
        {
          q: 'Why hash the content rather than use the chunk position?',
          a: 'Position-based ids shift when text is inserted earlier in the document, causing unnecessary re-embedding and id churn; content hashes keep unchanged chunks stable.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-02',
      difficulty: 'hard',
      question: 'What is the bug in this delete-event handler for a CDC stream?',
      code: {
        language: 'typescript',
        code: `if (event.op === 'd') {
  await qdrant.delete('kb_current', {
    points: [pointId(event.docId + ':0')],
  });
}`,
      },
      options: [
        'Qdrant cannot remove points by id',
        'It removes only the first chunk; the document’s other chunks remain searchable',
        'Delete events should be ignored in RAG pipelines',
        'It should target the physical collection instead of the alias',
      ],
      correct: [1],
      explanation:
        'A document maps to many chunks; removing only chunk 0 leaves the rest as orphans that keep appearing in answers. Remove by a doc_id payload filter (with a payload index) or by the chunk id list from the record manager. Writing via an alias is fine.',
      followUps: [
        {
          q: 'Why add a payload index on doc_id?',
          a: 'Filtered removals and per-document lookups then avoid scanning all points, which matters with millions of chunks and frequent updates.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL changes that require building a new index version rather than updating the current index in place.',
      options: [
        'Switching from 512-token to 300-token chunks',
        'A Confluence page’s text was edited',
        'Changing the embedding model',
        'Upgrading the PDF parser to a version that extracts tables differently',
      ],
      correct: [0, 2, 3],
      explanation:
        'Chunker, embedding model and parser changes alter every chunk or vector; mixing old and new outputs in one index makes it inconsistent, so build side by side and flip an alias. A single page edit is ordinary content change handled by incremental indexing.',
      followUps: [
        {
          q: 'How do incremental updates during the rebuild reach the new version?',
          a: 'Dual-write: the pipeline applies each change to both the current and the new index until cutover (or replays the change log since the rebuild snapshot).',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-04',
      difficulty: 'medium',
      question: 'Re-embedding 50M chunks of 400 tokens with a model priced at $0.02 per 1M tokens costs roughly how much at standard (non-batch) prices?',
      options: ['$40', '$400', '$4,000', '$40,000'],
      correct: [1],
      explanation:
        '50M × 400 = 20B tokens = 20,000 × 1M tokens; × $0.02 = $400 (about $200 via a batch API). $40 and $4,000 are off by 10×. Embedding bills are usually small next to storage and engineering time.',
      followUps: [
        {
          q: 'At a 5M TPM rate limit, how long does it take?',
          a: '20B / 5M = 4,000 minutes ≈ 67 hours of continuous embedding, which is why backfills need checkpoints, separate quota or a batch API.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-05',
      difficulty: 'expert',
      question: 'During an embedding migration, which sequence avoids losing updates and allows instant rollback?',
      options: [
        'Backfill green → enable dual-write → flip alias → retire blue',
        'Enable dual-write → backfill green → verify + shadow eval → flip alias and query model together → keep blue (still dual-written) for a rollback window',
        'Flip alias → backfill green while serving → retire blue',
        'Switch query model → backfill green → flip alias',
      ],
      correct: [1],
      explanation:
        'Dual-write must start before backfill or changes made during the backfill never reach green. Reads switch only after verification, and the query model must switch with the alias. Keeping blue updated preserves rollback. Serving from a half-filled index or switching the query model early breaks retrieval.',
      followUps: [
        {
          q: 'What final check do you run immediately before the flip?',
          a: 'Reconciliation of ids and doc hashes between blue and green (and against the record manager), to catch any writes missed during backfill or dual-write failures.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-06',
      difficulty: 'hard',
      question: 'Select ALL reasons a hash-based incremental indexer might re-embed far more chunks than actually changed.',
      options: [
        'Hashing raw HTML that contains per-request tokens or timestamps',
        'Fixed-size chunking, where an early insertion shifts every later boundary',
        'Using sha256 instead of md5',
        'Including the pipeline version in the hash after a chunker upgrade',
      ],
      correct: [0, 1, 3],
      explanation:
        'Volatile bytes make documents look changed; fixed-size chunk boundaries cascade after insertions; and a version bump intentionally invalidates all hashes (correct behaviour, but it re-embeds everything). The hash function choice does not affect change detection.',
      followUps: [
        {
          q: 'Which of these is desirable rather than a bug?',
          a: 'Including the pipeline version: a chunker upgrade should re-process every document, ideally into a new index version.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-07',
      difficulty: 'hard',
      question: 'This record-manager update runs before the vector upsert. What can go wrong?',
      code: {
        language: 'typescript',
        code: `await db.saveRecord(doc.id, newHash, newChunkIds);
await embedAndUpsert(changedChunks); // may throw
await removeStale(staleIds);`,
      },
      options: [
        'Nothing; the order does not matter',
        'If the upsert fails, the record already says the new hash is indexed, so the next run skips the doc and the index keeps stale content forever',
        'The database will deadlock',
        'Embedding will run twice',
      ],
      correct: [1],
      explanation:
        'Writing the record first claims success before it happened. After a failure, the next sync sees a matching hash and skips the document. Record state after successful index writes (crash → redo), or use a status field (pending → done).',
      followUps: [
        {
          q: 'If the record is written last and the process crashes after the upsert, what happens on the next run?',
          a: 'The doc is processed again; deterministic ids make the upsert overwrite identical points and stale removal is repeated harmlessly, so the outcome is correct, just with some redundant work.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-08',
      difficulty: 'expert',
      question: 'Select ALL filters that improve the quality of LLM-generated Q&A pairs for a retrieval eval set.',
      options: [
        'Verifying the evidence quote appears verbatim in the source chunk',
        'Dropping questions whose wording heavily overlaps the chunk text',
        'Keeping only questions the generator rated as "easy"',
        'Checking that retrieving the question returns the source chunk in the top-k (roundtrip), reviewing failures separately',
      ],
      correct: [0, 1, 3],
      explanation:
        'Evidence checks catch hallucinated answers, overlap caps remove trivially keyword-matchable questions, and roundtrip retrieval flags ambiguous questions or real retrieval failures. Keeping only "easy" items makes the set less informative and relies on the generator’s unreliable self-rating.',
      followUps: [
        {
          q: 'Why review roundtrip failures instead of always dropping them?',
          a: 'Some are ambiguous or bad questions, but others are genuine retrieval failures on valid questions, the most valuable items for finding retriever weaknesses.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-09',
      difficulty: 'medium',
      question: 'Why carry ACL groups from the source system into each chunk’s payload?',
      options: [
        'To reduce embedding cost',
        'So retrieval can filter to chunks the requesting user is allowed to see',
        'Because vector databases require an ACL field',
        'To improve the reranker’s accuracy',
      ],
      correct: [1],
      explanation:
        'Without ACLs on chunks, the retriever can surface content the user cannot access in the source, leaking it via the LLM answer. Filtering by the user’s groups at query time enforces permissions. ACLs do not affect cost or reranking, and no database mandates them.',
      followUps: [
        {
          q: 'What must happen when a document’s permissions change but its text does not?',
          a: 'Update the ACL payload of all its chunks (by doc_id filter) promptly, without re-embedding; permission changes need their own events and freshness SLO.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-10',
      difficulty: 'expert',
      question: 'What does this migration code get wrong?',
      code: {
        language: 'typescript',
        code: `// both models output 1536-d vectors
const v = await embed(NEW_MODEL, chunk.text);
await qdrant.upsert('kb_current', { points: [{ id: chunk.id, vector: v, payload: chunk }] });
// queries still use OLD_MODEL until the backfill finishes`,
      },
      options: [
        'Nothing; equal dimensions make vectors interchangeable',
        'It writes new-model vectors into the live index queried with the old model, mixing two embedding spaces so updated documents become effectively unfindable',
        'Qdrant rejects vectors from different models',
        'It should normalise vectors first, which fixes the mismatch',
      ],
      correct: [1],
      explanation:
        'Equal dimensions only make the write succeed; the spaces are not aligned, so old-model queries against new-model vectors score randomly. Normalisation does not align spaces. New-model vectors belong in a separate green collection until cutover.',
      followUps: [
        {
          q: 'Which runtime assertion would have caught this?',
          a: 'Store embed_model in each point payload and in the collection manifest, and reject upserts or queries whose model differs from the collection’s declared model.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-11',
      difficulty: 'hard',
      question: 'A source listing call returns only 1,200 of 48,000 documents because of a silent pagination error. Select ALL safeguards that prevent a mass removal from the index.',
      options: [
        'Refuse to apply inferred removals when they exceed a small percentage of the index',
        'Compare the listed count with the source’s reported total before reconciling',
        'Soft-delete first and purge only after a grace period',
        'Increase the embedding batch size',
      ],
      correct: [0, 1, 2],
      explanation:
        'Removal thresholds, completeness checks and soft deletes each stop or make reversible a catastrophic inferred removal. Embedding batch size is unrelated to removal logic.',
      followUps: [
        {
          q: 'Which safeguard also helps with accidental deletions at the source?',
          a: 'Soft delete with a grace period: content removed by mistake at the source can be restored without re-ingestion if it comes back within the window.',
        },
      ],
    },
    {
      id: 'data-pipelines-indexing-mcq-12',
      difficulty: 'hard',
      question: 'You fine-tune an embedding model on 50,000 synthetic question → chunk pairs. Offline recall on a held-out synthetic set rises from 0.78 to 0.93, but real-query recall barely moves (0.71 → 0.72). What is the most plausible explanation?',
      options: [
        'The model was trained for too few epochs',
        'The synthetic questions share wording and style with chunks, so the model learned to match generator-style questions rather than real user phrasing',
        'Recall is the wrong metric for embeddings',
        'Real queries are always unanswerable',
      ],
      correct: [1],
      explanation:
        'Synthetic data that mirrors the documents teaches the model a distribution real users do not produce, so gains on synthetic held-out data do not transfer. Diversify phrasing with personas and paraphrase, cap overlap, mix in real queries and always evaluate on real traffic. More epochs would likely widen the gap.',
      followUps: [
        {
          q: 'How would you make the synthetic questions closer to real ones?',
          a: 'Few-shot the generator with real user queries (style, length, typos, abbreviations), generate from personas, add short keyword-style queries, and filter by similarity to the real-query distribution.',
        },
      ],
    },
  ],
};

export default topic;
