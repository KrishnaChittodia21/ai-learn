import type { Topic } from '../../types';

const topic: Topic = {
  id: 'vector-databases',
  phase: 'vector-search',
  order: 1,
  title: 'Vector Databases, Vector Indexing and Metadata Filtering',
  subtitle:
    'Store millions of embeddings, find neighbours in milliseconds, and filter by tenant, date or permission without losing recall.',
  estimatedMinutes: 44,
  sources: [
    'pgvector README (github.com/pgvector/pgvector): HNSW/IVFFlat options, halfvec/bit, iterative index scans (0.8.0+), filtering guidance',
    'Qdrant docs and article "A Complete Guide to Filtering in Vector Search" (filterable HNSW, payload indexes, query planner, ACORN)',
    'Qdrant docs: Multitenancy (is_tenant payload index)',
    'Pinecone docs: serverless indexes, namespaces and metadata filtering',
    'Weaviate docs: vector indexes (HNSW, flat, dynamic), filtering and hybrid search',
    'Milvus docs: index types (HNSW, IVF_FLAT, IVF_PQ, DiskANN, GPU indexes) and partition keys',
    'Malkov & Yashunin 2016/2018 — HNSW paper (arXiv 1603.09320)',
    'Subramanya et al. 2019 — DiskANN (NeurIPS)',
  ],
  tags: ['vector-database', 'pgvector', 'qdrant', 'pinecone', 'weaviate', 'milvus', 'hnsw', 'filtering'],
  cheatSheet: [
    'A vector DB = ANN index + storage + CRUD + metadata filtering + persistence/replication; a numpy array gives you only the first.',
    'pgvector: vectors next to your relational data with SQL, ACID and joins; great to ~10M vectors per node. Qdrant/Milvus/Weaviate: purpose-built, richer filtering and scale; Pinecone: fully managed serverless.',
    'Index types: flat (exact, O(N)), IVF (clusters, needs training), HNSW (graph, best recall/latency, RAM-hungry), DiskANN (SSD graph for billion-scale).',
    'Memory: 1M × 1,536-d float32 = 6.1 GB raw; halfvec halves it, int8 scalar quantization quarters it, binary is 32× smaller (rerank with full vectors).',
    'pgvector: build HNSW after bulk load, raise maintenance_work_mem so the graph fits in memory, use parallel workers; defaults m=16, ef_construction=64, ef_search=40.',
    'Post-filtering with ANN returns too few results: with ef_search 40 and a filter matching 10% of rows, pgvector returns ~4 rows on average. Fix: iterative scans (0.8+), partial indexes, partitions.',
    'Qdrant filters during graph traversal (filterable HNSW): create payload indexes before ingestion; the planner switches to exact search below full_scan_threshold.',
    'Multitenancy: one collection with a tenant payload index (Qdrant is_tenant), Pinecone namespaces, or Postgres partitions/RLS; avoid one collection per tenant at scale.',
    'Always measure recall@k of filtered queries against exact search (Qdrant exact: true, or a seq-scan in Postgres).',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Vector Databases — what they add and how the main options compare',
      body: `**Intuition:** a list of embeddings in memory is a pile of index cards on your desk. A vector database is a library: cards are shelved for fast lookup, you can add or withdraw cards while people are reading, every card has a catalogue entry (metadata) you can filter by, and the library survives a power cut.

**Mechanics — what a vector DB provides:**
- **ANN index** (HNSW, IVF, DiskANN) for millisecond top-k search over millions of vectors.
- **CRUD/upserts** by id while serving queries; deletes via tombstones + compaction.
- **Metadata (payload) + filters** on tenant, date, ACL, source.
- **Persistence, replication, sharding, backups**, and often **hybrid search** (dense + sparse/BM25).

| | pgvector | Qdrant | Pinecone | Weaviate | Milvus |
|---|---|---|---|---|---|
| Model | Postgres extension | OSS engine + cloud | Managed serverless | OSS + cloud | OSS (+ Zilliz Cloud) |
| Indexes | HNSW, IVFFlat | HNSW (+ quantization) | Managed | HNSW, flat, dynamic | HNSW, IVF*, DiskANN, GPU |
| Filtering | SQL WHERE (+ iterative scan) | Filterable HNSW, payload indexes | Metadata filters, namespaces | Filtered HNSW | Scalar filters, partition keys |
| Hybrid | via tsvector / sparsevec | Sparse vectors + fusion | Sparse-dense | BM25 + vector | Sparse + dense |
| Sweet spot | ≤ ~10M vectors, already on Postgres | Filter-heavy, self-host or cloud | No-ops, spiky traffic | Built-in modules/hybrid | Billion-scale, GPU |

**When to use what:** already on Postgres with ≤ ~10M vectors → **pgvector** (one database, transactions, joins with permissions). Heavy filtering or multitenancy → **Qdrant**. No ops team → **Pinecone**. Billions of vectors or GPU indexing → **Milvus**. Benchmark on your data; marketing benchmarks rarely include your filters.`,
      example: `A SaaS knowledge base: 3M chunks × 1,536 dims, 40 QPS, tenant + ACL filters, already on Postgres.

- **pgvector:** 3M × 6 KB ≈ 18 GB of vectors (≈ 9 GB as halfvec). HNSW (m=16) on a 64 GB instance: p95 ≈ 15–30 ms at recall@10 ≈ 0.95 with ef_search 100. ACL join is a plain SQL JOIN. One system to back up.
- **Qdrant:** similar latency with scalar quantization in ~5 GB RAM, payload indexes on tenant_id/acl, built-in filterable HNSW. Adds a second datastore to keep in sync.

Decision: pgvector now (simplest), with a written trigger to revisit at ~10M vectors or if filtered recall drops below target.`,
      diagram: `            ┌──────────────── vector database ────────────────┐
 upsert ───▶│ WAL / storage ──▶ segments ──▶ ANN index (HNSW)  │
 (id, vec,  │                       │                           │
  payload)  │                       └──▶ payload indexes        │
            │                            (tenant, date, acl)    │
 query ────▶│ planner: filter selectivity → graph / exact scan  │──▶ top-k
 (vec, k,   │ replication · sharding · snapshots · compaction   │   ids +
  filter)   └───────────────────────────────────────────────────┘   scores`,
      code: [
        {
          language: 'typescript',
          title: 'Same operations in pgvector and Qdrant',
          code: `import pg from 'pg';
import pgvector from 'pgvector/pg';
import { QdrantClient } from '@qdrant/js-client-rest';

// ---------- pgvector ----------
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
db.on('connect', (c) => pgvector.registerTypes(c)); // map JS arrays <-> vector type
await db.query('CREATE EXTENSION IF NOT EXISTS vector');
await db.query(
  'CREATE TABLE IF NOT EXISTS chunks (id text PRIMARY KEY, tenant_id text NOT NULL, ' +
    'body text NOT NULL, embedding vector(1536) NOT NULL)',
);

export async function pgSearch(tenant: string, q: number[], k = 10) {
  const { rows } = await db.query(
    'SELECT id, body, 1 - (embedding <=> $1) AS score FROM chunks ' +
      'WHERE tenant_id = $2 ORDER BY embedding <=> $1 LIMIT $3', // <=> = cosine distance
    [pgvector.toSql(q), tenant, k],
  );
  return rows;
}

// ---------- Qdrant ----------
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
await qdrant.createCollection('chunks', { vectors: { size: 1536, distance: 'Cosine' } });

export async function qdrantSearch(tenant: string, q: number[], k = 10) {
  const res = await qdrant.query('chunks', {
    query: q,
    limit: k,
    filter: { must: [{ key: 'tenant_id', match: { value: tenant } }] },
    with_payload: true,
  });
  return res.points.map((p) => ({ id: p.id, score: p.score, body: p.payload?.body }));
}`,
        },
      ],
      prosCons: {
        pros: [
          'Millisecond top-k over millions of vectors with live upserts and deletes.',
          'Metadata filtering makes tenant isolation, ACLs and freshness filters possible.',
          'Operational features (replication, snapshots, sharding) you would otherwise build yourself.',
        ],
        cons: [
          {
            con: 'A separate vector DB is another system to secure, back up and keep in sync with the source of truth.',
            fix: 'Start with pgvector when you already run Postgres, or drive the vector DB from an outbox/CDC stream with idempotent upserts keyed by chunk id.',
          },
          {
            con: 'HNSW indexes need RAM proportional to vectors × dimensions, which gets expensive at 10M+ vectors.',
            fix: 'Use halfvec or scalar/binary quantization with full-precision rescoring, or disk-based indexes (DiskANN, on-disk vectors).',
          },
          {
            con: 'Vendor benchmarks rarely reflect your data, filters and k.',
            fix: 'Run your own benchmark: real queries, real filters, recall@k against exact search, p95 latency at target QPS.',
          },
        ],
      },
      keyPoints: [
        'Vector DB = ANN index + CRUD + filters + persistence + operations.',
        'pgvector for Postgres shops up to ~10M vectors; Qdrant for heavy filtering; Pinecone for no-ops; Milvus for billion-scale.',
        'Raw vector memory = N × dims × 4 bytes before index overhead.',
        'Benchmark with your own filters and recall targets.',
      ],
      exercise: {
        prompt: `Write \`chooseVectorStore(req)\` that recommends a store and returns a short reason.

Acceptance criteria:
- Input: \`{ vectors: number; onPostgres: boolean; heavyFiltering: boolean; opsTeam: boolean; gpu: boolean }\`.
- > 500M vectors or (gpu and > 50M) → "milvus".
- No ops team → "pinecone".
- onPostgres and ≤ 10M vectors → "pgvector".
- heavyFiltering → "qdrant"; otherwise "qdrant" as the default self-hosted engine.
- Also compute and return raw float32 memory in GB for 1,536 dims.`,
        hints: [
          'Order the rules from most specific (scale) to most general.',
          'GB = vectors × 1536 × 4 / 1e9.',
          'Return { store, reason, rawGB }.',
        ],
        solution: {
          language: 'typescript',
          code: `type Req = { vectors: number; onPostgres: boolean; heavyFiltering: boolean; opsTeam: boolean; gpu: boolean };

export function chooseVectorStore(r: Req) {
  const rawGB = +((r.vectors * 1536 * 4) / 1e9).toFixed(1);
  if (r.vectors > 500e6 || (r.gpu && r.vectors > 50e6))
    return { store: 'milvus', reason: 'billion-scale / GPU indexes, DiskANN', rawGB };
  if (!r.opsTeam) return { store: 'pinecone', reason: 'fully managed serverless, no ops', rawGB };
  if (r.onPostgres && r.vectors <= 10e6)
    return { store: 'pgvector', reason: 'one database, SQL joins and transactions', rawGB };
  if (r.heavyFiltering) return { store: 'qdrant', reason: 'filterable HNSW + payload indexes', rawGB };
  return { store: 'qdrant', reason: 'solid default self-hosted engine', rawGB };
}

console.log(chooseVectorStore({ vectors: 3e6, onPostgres: true, heavyFiltering: true, opsTeam: true, gpu: false }));
// { store: 'pgvector', reason: 'one database, SQL joins and transactions', rawGB: 18.4 }`,
        },
        explanation:
          'Encoding the decision as rules makes the trade-offs explicit and reviewable; the memory number is the first sanity check for any choice.',
      },
      quickCheck: {
        question:
          'A team with an existing Postgres app needs semantic search over 800K chunks with per-user permissions stored in Postgres. What is the simplest sound choice?',
        options: [
          'A separate managed vector DB synced nightly',
          'pgvector in the same database, joining chunks to permission tables',
          'A FAISS index loaded in each API pod',
          'Elasticsearch with BM25 only',
        ],
        correct: 1,
        explanation:
          '800K vectors is well within pgvector\'s comfort zone, and permissions can be enforced with a SQL join in the same transaction. A separate DB adds sync lag; per-pod FAISS lacks persistence and live updates; BM25 alone is not semantic search.',
      },
      source: 'pgvector README; Qdrant, Pinecone, Weaviate and Milvus documentation',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Vector Indexing — index types, memory, build and maintenance',
      body: `**Intuition:** an index is a shortcut so you don't compare the query with every vector. Different shortcuts trade memory, build time, update cost and recall.

**Mechanics — the index catalogue:**

| Index | Idea | Recall/latency | Memory | Updates |
|---|---|---|---|---|
| Flat (brute force) | Compare with all N | Exact; O(N·d) | Vectors only | Trivial |
| IVF (IVFFlat) | k-means clusters; search a few | Good if nprobe tuned | Low overhead | Needs training; drifts |
| HNSW | Multi-layer proximity graph | Best trade-off | High (graph links) | Online inserts; deletes tombstoned |
| IVF-PQ / quantized | Compress vectors | Lower, rescore fixes | 10–60× smaller | Needs training |
| DiskANN / on-disk | Graph on SSD | Good at billion scale | RAM ≪ data | Batch-friendly |

Parameter tuning (\`M\`, \`efSearch\`, \`nlist\`, \`nprobe\`, PQ) is covered in the ANN Search topic.

**Compression options:** pgvector \`halfvec\` (16-bit, up to 4,000 dims indexed vs 2,000 for \`vector\`), binary quantization with \`bit\` + re-rank, Qdrant scalar (int8, 4×) / binary (32×) quantization with \`rescore\`.

**Operational rules**
- **Bulk load first, then build** the index (pgvector: \`CREATE INDEX\` after \`COPY\`; set \`maintenance_work_mem\` big enough for the graph, and \`max_parallel_maintenance_workers\`).
- **Index the operator you query with:** \`vector_cosine_ops\` for \`<=>\`, \`vector_l2_ops\` for \`<->\`, \`vector_ip_ops\` for \`<#>\`; a mismatch silently falls back to a sequential scan.
- **Deletes and updates** leave tombstones; vacuum/compaction (Postgres \`VACUUM\`, Qdrant optimizers) reclaims them.
- **Re-embedding** with a new model means a new index; build it alongside and switch atomically.

**When to use what:** < ~100K vectors → flat is often fast enough and exact. Interactive workloads → HNSW. Very large or memory-bound → quantization or DiskANN.`,
      example: `pgvector table with 5M × 1,536-d vectors:

- Raw vectors: 5M × 6,144 B ≈ 30.7 GB; HNSW (m=16) adds roughly 5M × 16 × 2 × 8 B ≈ 1.3 GB of links; total ≈ 32 GB → needs a 64 GB instance for the hot set.
- Same data as \`halfvec(1536)\`: ≈ 15.4 GB + links ≈ 17 GB; recall@10 drops < 0.5 points.
- Build: with \`maintenance_work_mem = '24GB'\` and 8 parallel workers ≈ 40 min; with the default 64 MB the graph spills to disk and the build takes many hours.
- Query plan check: \`EXPLAIN\` shows \`Index Scan using chunks_embedding_idx\` for \`ORDER BY embedding <=> $1 LIMIT 10\`; with \`vector_l2_ops\` built by mistake it shows \`Seq Scan\` and 2.5 s latency.`,
      diagram: `            exact ◀────────────────────────────▶ approximate
 Flat ─────── IVF ─────────── HNSW ─────────── IVF-PQ / binary
 O(N·d)       probe clusters  walk graph       compressed codes
 no build     k-means train   build O(N log N) train codebooks
 RAM: vecs    RAM: vecs       RAM: vecs+links  RAM: 10–60× less
                                               + rescore top-k
                     ▲ DiskANN: graph + vectors on SSD (billion-scale)`,
      code: [
        {
          language: 'sql',
          title: 'pgvector: bulk load, then build HNSW correctly',
          code: `-- 1) Table with half-precision vectors (2 bytes/dim, up to 4,000 dims indexable)
CREATE TABLE chunks (
  id         bigint PRIMARY KEY,
  tenant_id  text NOT NULL,
  body       text NOT NULL,
  embedding  halfvec(1536) NOT NULL
);

-- 2) Bulk load BEFORE creating the ANN index (much faster than incremental inserts)
-- \\copy chunks FROM 'chunks.csv' WITH (FORMAT csv)

-- 3) Give the build enough memory so the graph fits, and use parallel workers
SET maintenance_work_mem = '8GB';
SET max_parallel_maintenance_workers = 7;

-- 4) The opclass must match the query operator: <=> cosine -> halfvec_cosine_ops
CREATE INDEX CONCURRENTLY chunks_embedding_hnsw
  ON chunks USING hnsw (embedding halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5) Verify the planner uses it (look for "Index Scan using chunks_embedding_hnsw")
EXPLAIN ANALYZE
SELECT id FROM chunks
ORDER BY embedding <=> '[0.01, 0.02, ...]'::halfvec  -- full 1536-d literal in practice
LIMIT 10;

-- 6) Watch progress of long builds
SELECT phase, round(100.0 * blocks_done / nullif(blocks_total, 0), 1) AS pct
FROM pg_stat_progress_create_index;`,
        },
      ],
      prosCons: {
        pros: [
          'Indexes turn O(N) scans into millisecond lookups at millions of vectors.',
          'Quantization (halfvec, int8, binary) cuts memory 2–32× with small recall loss when rescoring is used.',
          'HNSW supports online inserts, so new documents are searchable immediately.',
        ],
        cons: [
          {
            con: 'HNSW builds are slow and memory-hungry; a build that spills to disk can take hours.',
            fix: 'Bulk load first, size maintenance_work_mem to the graph, use parallel workers, and build with CREATE INDEX CONCURRENTLY on a replica or off-peak.',
          },
          {
            con: 'Heavy updates/deletes leave tombstones that degrade recall and waste memory.',
            fix: 'Schedule VACUUM / compaction (Qdrant optimizers), and periodically rebuild the index for high-churn collections.',
          },
          {
            con: 'An opclass/metric mismatch silently disables the index.',
            fix: 'Match opclass to the operator (cosine_ops with <=>), and add an EXPLAIN check or latency alert to CI/monitoring.',
          },
        ],
      },
      keyPoints: [
        'Flat = exact; IVF = clusters; HNSW = graph; PQ/binary = compression; DiskANN = SSD graph.',
        'Bulk load, then build; give the build enough memory.',
        'Index opclass must match the distance operator you query with.',
        'Quantize with rescoring to cut memory 2–32×.',
      ],
      exercise: {
        prompt: `Write \`indexMemory({ n, dims, m, bytesPerDim })\` that estimates HNSW memory in GB: vectors (n × dims × bytesPerDim) + links (n × m × 2 × 8 bytes, a rough upper-layer-inclusive estimate) and returns both parts and the total.

Acceptance criteria:
- 5M vectors, 1,536 dims, m 16, 4 bytes → vectors ≈ 30.7 GB, links ≈ 1.3 GB, total ≈ 32.0 GB.
- Same with 2 bytes (halfvec) → total ≈ 16.6 GB.
- Round to 1 decimal.`,
        hints: [
          'Layer 0 has up to 2·M neighbours per node; ids are ~8 bytes in pgvector tuples (TIDs + overhead).',
          'Use 1e9 bytes per GB for simplicity.',
          'Return { vectorsGB, linksGB, totalGB }.',
        ],
        solution: {
          language: 'typescript',
          code: `type In = { n: number; dims: number; m: number; bytesPerDim: number };

export function indexMemory({ n, dims, m, bytesPerDim }: In) {
  const round = (x: number) => +x.toFixed(1);
  const vectors = n * dims * bytesPerDim;
  const links = n * m * 2 * 8; // layer-0 has up to 2*M neighbours; ~8 bytes per link
  return {
    vectorsGB: round(vectors / 1e9),
    linksGB: round(links / 1e9),
    totalGB: round((vectors + links) / 1e9),
  };
}

console.log(indexMemory({ n: 5e6, dims: 1536, m: 16, bytesPerDim: 4 })); // { 30.7, 1.3, 32.0 }
console.log(indexMemory({ n: 5e6, dims: 1536, m: 16, bytesPerDim: 2 })); // { 15.4, 1.3, 16.6 }`,
        },
        explanation:
          'At high dimensions the vectors dominate memory, so compressing them (halfvec, int8) matters far more than tuning M. The link term grows with M, which is why very high M values are reserved for recall-critical use cases.',
      },
      quickCheck: {
        question:
          'You created an HNSW index with vector_l2_ops but query with ORDER BY embedding <=> $1. Latency is 3 s at 2M rows. Why?',
        options: [
          'HNSW is slow above 1M rows',
          'The opclass does not match the cosine operator, so Postgres ignores the index and does a sequential scan',
          'ef_search is too high',
          'Cosine distance needs normalised vectors to use any index',
        ],
        correct: 1,
        explanation:
          'pgvector indexes serve only the operator their opclass defines. A cosine query cannot use an L2 index, so the planner falls back to scanning all rows. Rebuild with vector_cosine_ops (or query with <-> on normalised vectors).',
      },
      source: 'pgvector README — HNSW, IVFFlat, halfvec, index build tips',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Metadata Filtering — pre-filtering, post-filtering and filtered HNSW',
      body: `**Intuition:** "find the 10 most similar chunks **that belong to tenant 42 and were published after 2025**". Doing the similarity search and the filter in the wrong order either returns too few results or scans everything.

**Mechanics — three strategies:**

| Strategy | How | Problem |
|---|---|---|
| **Post-filter** | ANN top-k (or top-ef), then drop non-matching | Selective filters leave too few results; recall collapses |
| **Pre-filter** | Find matching ids, exact search over them | Exact, but slow when many rows match |
| **Filter during search** | Graph walk skips non-matching nodes but keeps traversing | Needs connectivity for matching nodes |

**pgvector:** with approximate indexes, the filter is applied *after* the index scan. With \`hnsw.ef_search = 40\` and a filter matching 10% of rows you get ~4 rows on average. Fixes: \`SET hnsw.iterative_scan = relaxed_order\` (0.8.0+, keeps scanning up to \`hnsw.max_scan_tuples\`, default 20,000); a **B-tree index** on the filter column so the planner can choose exact search for very selective filters; **partial indexes** for a few values; **partitioning** for many values (e.g. per tenant).

**Qdrant:** **filterable HNSW** adds extra graph edges between points sharing a value of an *indexed* payload field; the **query planner** estimates filter cardinality and uses exact search on the payload index when matches are few (below \`full_scan_threshold\`), and graph search otherwise. Create payload indexes **before** ingesting. Combined strict filters can still hurt recall; ACORN (v1.16+, off by default) explores neighbours-of-neighbours.

**Pinecone/Weaviate/Milvus** filter inside the engine too; Pinecone namespaces and Milvus partition keys physically separate tenants.

**When to use what:** tenant isolation → partition/namespace/tenant index; selective filters → pre-filter/exact; broad filters → filtered HNSW. Always verify filtered recall against exact search.`,
      example: `Table: 2M chunks, 50 tenants (each ~2%). Query top-10 for tenant 7.

- **pgvector, defaults (ef_search 40), post-filter:** index returns 40 candidates, ~2% match → **0–2 rows** returned. Users see "no results".
- **ef_search 400:** ~8 rows, p95 35 ms. Still under 10.
- **iterative_scan = relaxed_order:** keeps scanning until 10 matches: 10 rows, recall@10 0.96, p95 22 ms.
- **Partitioned by tenant_id (HNSW per partition):** 10 rows, recall 0.98, p95 6 ms because each partition holds only 40K vectors.
- **Qdrant with is_tenant payload index:** filterable HNSW returns 10 rows, recall 0.97, p95 ~8 ms.`,
      diagram: `POST-FILTER                       FILTER DURING SEARCH (Qdrant)
 query → ANN top-40               query → graph walk
          │                               │  visit node: tenant=7? ─ no → skip,
          ▼                               │  but keep exploring its neighbours
 filter tenant=7 (2%)                     │  extra edges link same-tenant nodes
          │                               ▼
 0–2 results  ✗                    10 results ✓

PRE-FILTER (selective)            PLANNER (Qdrant / Postgres)
 payload index → 3K ids           estimate matches:
 exact scan of 3K vectors ✓         few  → exact over payload index
                                    many → filtered HNSW`,
      code: [
        {
          language: 'typescript',
          title: 'Filtered search done right in pgvector and Qdrant',
          code: `import pg from 'pg';
import pgvector from 'pgvector/pg';
import { QdrantClient } from '@qdrant/js-client-rest';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function pgFiltered(tenant: string, after: string, q: number[], k = 10) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // pgvector 0.8+: keep scanning the HNSW index until enough rows pass the WHERE clause
    await client.query("SET LOCAL hnsw.iterative_scan = 'relaxed_order'");
    await client.query('SET LOCAL hnsw.ef_search = 100');
    const { rows } = await client.query(
      'SELECT id, body FROM chunks WHERE tenant_id = $1 AND published_at >= $2 ' +
        'ORDER BY embedding <=> $3 LIMIT $4',
      [tenant, after, pgvector.toSql(q), k],
    );
    await client.query('COMMIT');
    return rows; // relaxed_order may be slightly out of order: re-sort in app if needed
  } finally {
    client.release();
  }
}

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });

export async function setupQdrant() {
  // Create payload indexes BEFORE ingesting so filterable-HNSW edges are built
  await qdrant.createPayloadIndex('chunks', {
    field_name: 'tenant_id',
    field_schema: { type: 'keyword', is_tenant: true }, // co-locates a tenant's vectors
  });
  await qdrant.createPayloadIndex('chunks', { field_name: 'published_at', field_schema: 'datetime' });
}

export async function qdrantFiltered(tenant: string, after: string, q: number[], k = 10) {
  return qdrant.query('chunks', {
    query: q,
    limit: k,
    filter: {
      must: [
        { key: 'tenant_id', match: { value: tenant } },
        { key: 'published_at', range: { gte: after } },
      ],
    },
  });
}`,
        },
      ],
      prosCons: {
        pros: [
          'Enforces tenant isolation and permissions before the LLM sees any text.',
          'Filters on date, source or doc type sharpen relevance cheaply.',
          'Engines with filter-aware search (Qdrant, Weaviate, Milvus, pgvector iterative scans) keep recall high even with selective filters.',
        ],
        cons: [
          {
            con: 'Post-filtering silently returns fewer than k results for selective filters.',
            fix: 'Enable pgvector iterative scans, raise ef_search, or use an engine that filters during traversal; alert when results < k.',
          },
          {
            con: 'Filtering on unindexed fields forces full scans or loses filterable-HNSW edges.',
            fix: 'Create payload / B-tree indexes on every filtered field before ingestion, and rebuild HNSW if you add one later.',
          },
          {
            con: 'Combining several strict filters can fragment the graph and drop recall.',
            fix: 'Partition by the most selective dimension (tenant), use exact search for tiny result sets, or enable ACORN-style exploration; measure with exact: true.',
          },
        ],
      },
      keyPoints: [
        'Post-filter = too few results; pre-filter = exact but slow on broad filters; filter-during-search = best general approach.',
        'pgvector: ef_search 40 + 10% filter → ~4 rows; use iterative_scan, partial indexes or partitions.',
        'Qdrant: payload indexes before ingest; planner picks exact vs filtered HNSW by cardinality.',
        'Partition or namespace by tenant for isolation and speed.',
        'Validate filtered recall against exact search.',
      ],
      exercise: {
        prompt: `Simulate post-filtering vs pre-filtering on random data to **see** the recall collapse.

Acceptance criteria:
- 20,000 random 32-d vectors, each with a \`tenant\` in 0..49 (2% each).
- "ANN" = exact top-\`ef\` by cosine over all vectors (stand-in for an index), then filter by tenant; report how many of the true filtered top-10 you got.
- Pre-filter = exact search over only that tenant's vectors (ground truth).
- Print results for ef = 40, 200, 1000.`,
        starter: {
          language: 'typescript',
          code: `const N = 20000, D = 32, TENANTS = 50;
const rand = () => Math.random() * 2 - 1;
const vecs = Array.from({ length: N }, () => Array.from({ length: D }, rand));
const tenant = Array.from({ length: N }, (_, i) => i % TENANTS);

function cosine(a: number[], b: number[]) { /* TODO */ return 0; }
function topK(q: number[], ids: number[], k: number) { /* TODO: sort ids by cosine desc */ return [] as number[]; }

// TODO: ground truth = topK over ids with tenant === 7
// TODO: for ef in [40, 200, 1000]: candidates = topK over all ids, keep tenant 7, take 10, count overlap`,
        },
        hints: [
          'ids for a tenant: [...Array(N).keys()].filter(i => tenant[i] === 7).',
          'Overlap = postFiltered.filter(id => truth.includes(id)).length.',
          'Expect roughly ef × 2% matches: ~1 at ef 40, ~4 at 200, ~10 at 1000.',
        ],
        solution: {
          language: 'typescript',
          code: `const N = 20000, D = 32, TENANTS = 50;
const rand = () => Math.random() * 2 - 1;
const vecs = Array.from({ length: N }, () => Array.from({ length: D }, rand));
const tenant = Array.from({ length: N }, (_, i) => i % TENANTS);

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
}
function topK(q: number[], ids: number[], k: number) {
  return ids
    .map((id) => ({ id, s: cosine(q, vecs[id]) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.id);
}

const q = Array.from({ length: D }, rand);
const all = [...Array(N).keys()];
const truth = topK(q, all.filter((i) => tenant[i] === 7), 10); // pre-filter = exact

for (const ef of [40, 200, 1000]) {
  const post = topK(q, all, ef).filter((id) => tenant[id] === 7).slice(0, 10);
  const hit = post.filter((id) => truth.includes(id)).length;
  console.log('ef=' + ef + ': returned ' + post.length + ', recall@10 ' + hit / 10);
}
// typical: ef=40 → 0-2 rows; ef=200 → ~4; ef=1000 → ~10 rows, recall ~1.0`,
        },
        explanation:
          'With a 2% filter, post-filtering only keeps about ef × 0.02 candidates. Raising ef helps linearly but wastes work; filter-aware traversal or partitioning solves it structurally.',
      },
      quickCheck: {
        question:
          'In pgvector with default settings, a filter matches 10% of rows and you ask for LIMIT 10 using an HNSW index. About how many rows come back?',
        options: ['10', 'About 4', 'About 40', 'Zero, the filter disables the index'],
        correct: 1,
        explanation:
          'The index scan yields ef_search = 40 candidates, then the WHERE clause keeps ~10% of them, so ~4 rows. Iterative scans (0.8+) or a larger ef_search fix it.',
      },
      source: 'pgvector README — Filtering & iterative index scans; Qdrant — A Complete Guide to Filtering in Vector Search',
    },
  ],
  codeChallenges: [
    {
      id: 'vector-databases-cc-1',
      title: 'Tenant search that leaks data and returns empty pages',
      context:
        'A multi-tenant RAG API retrieves top-50 from Qdrant without a filter, then filters by tenant in application code and returns the first 5. Small tenants often get zero results, and a bug once returned another tenant\'s chunk.',
      task: 'Move the tenant filter into the query, add the right payload index, guarantee isolation, and detect under-filled results.',
      starter: {
        language: 'typescript',
        code: `export async function search(qdrant: any, tenant: string, vec: number[]) {
  const res = await qdrant.query('chunks', { query: vec, limit: 50, with_payload: true });
  return res.points.filter((p: any) => p.payload.tenant == tenant).slice(0, 5);
}`,
      },
      hints: [
        'Use filter.must with a match on tenant_id inside the query.',
        'Create a keyword payload index with is_tenant: true before ingesting.',
        'Validate the tenant id and log when fewer than k results come back.',
      ],
      solution: {
        language: 'typescript',
        code: `import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });

// One-off, before ingestion: index the tenant field (enables filterable HNSW + tenant co-location)
export async function ensureIndexes() {
  await qdrant.createPayloadIndex('chunks', {
    field_name: 'tenant_id',
    field_schema: { type: 'keyword', is_tenant: true },
    wait: true,
  });
}

export async function search(tenantId: string, vec: number[], k = 5) {
  if (!/^[a-z0-9-]{3,64}$/.test(tenantId)) throw new Error('invalid tenant id'); // never trust caller input
  const res = await qdrant.query('chunks', {
    query: vec,
    limit: k,
    filter: { must: [{ key: 'tenant_id', match: { value: tenantId } }] }, // filter INSIDE the search
    with_payload: ['body', 'source', 'tenant_id'],
  });
  const points = res.points.filter((p) => p.payload?.tenant_id === tenantId); // defence in depth
  if (points.length < k) console.warn('under-filled result', { tenantId, got: points.length, k });
  return points;
}`,
      },
      explanation:
        'Filtering inside the engine lets filterable HNSW (or exact search for small tenants) find the tenant\'s true top-k instead of hoping they appear in a global top-50. The payload index with is_tenant makes this fast; strict equality, input validation and an assertion provide defence in depth against leakage.',
      followUps: [
        {
          q: 'When would you use one collection per tenant instead?',
          a: 'Only for a small number of very large tenants that need separate configs or hard physical isolation; thousands of collections exhaust cluster resources, so Qdrant recommends payload-based multitenancy.',
        },
        {
          q: 'How would you enforce isolation in pgvector?',
          a: 'Add tenant_id to every query via Row-Level Security policies bound to a session variable, and optionally partition the table by tenant so each partition has its own index.',
        },
      ],
    },
    {
      id: 'vector-databases-cc-2',
      title: 'pgvector ingestion that takes 9 hours and never uses the index',
      context:
        'A script creates the HNSW index first, then inserts 3M rows one by one with autocommit. Queries use cosine distance but the index was built with the default L2 opclass, and filtered queries return 1–2 rows.',
      task: 'Rewrite schema and load so the build is fast, the index is used, and filtered queries return full results.',
      starter: {
        language: 'sql',
        code: `CREATE TABLE chunks (id serial, tenant_id text, body text, embedding vector(1536));
CREATE INDEX ON chunks USING hnsw (embedding vector_l2_ops);
-- app: for each row: INSERT INTO chunks (tenant_id, body, embedding) VALUES (...);
-- query:
SELECT id, body FROM chunks WHERE tenant_id = $1 ORDER BY embedding <=> $2 LIMIT 10;`,
      },
      hints: [
        'Load with COPY (or batched multi-row INSERTs in one transaction) before building the index.',
        'Match opclass to <=> (vector_cosine_ops) or halfvec_cosine_ops if you store halfvec.',
        'Add a B-tree index on tenant_id and enable iterative scans for filtered queries.',
      ],
      solution: {
        language: 'sql',
        code: `CREATE TABLE chunks (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  text NOT NULL,
  body       text NOT NULL,
  embedding  halfvec(1536) NOT NULL          -- half the memory, negligible recall loss
);

-- 1) Bulk load first (COPY is 10-100x faster than row-by-row autocommit inserts)
-- \\copy chunks (tenant_id, body, embedding) FROM 'chunks.csv' WITH (FORMAT csv)

-- 2) Build indexes after the load, with enough memory and workers
SET maintenance_work_mem = '12GB';
SET max_parallel_maintenance_workers = 7;
CREATE INDEX chunks_tenant_idx ON chunks (tenant_id);              -- lets the planner pre-filter tiny tenants
CREATE INDEX chunks_embedding_hnsw ON chunks
  USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
ANALYZE chunks;

-- 3) Query: same operator as the opclass; iterative scan fills LIMIT under filters (pgvector 0.8+)
SET hnsw.iterative_scan = relaxed_order;
SET hnsw.ef_search = 100;
SELECT id, body
FROM chunks
WHERE tenant_id = $1
ORDER BY embedding <=> $2::halfvec
LIMIT 10;`,
      },
      explanation:
        'Building HNSW on a full table with ample maintenance_work_mem is far faster than maintaining the graph across 3M single-row transactions. The cosine opclass makes the index usable for <=>. The tenant B-tree lets the planner choose exact search for small tenants, and iterative scans keep scanning until LIMIT is filled for larger ones.',
      followUps: [
        {
          q: 'With 2,000 tenants of very different sizes, what schema change helps most?',
          a: 'Partition by tenant (hash or list for big tenants) so each partition has a small HNSW index, queries touch only one partition, and large tenants can be tuned separately.',
        },
        {
          q: 'How do you rebuild the index without downtime after changing m?',
          a: 'CREATE INDEX CONCURRENTLY with a new name, verify with EXPLAIN, then DROP INDEX CONCURRENTLY the old one.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'vector-databases-iq-1',
      difficulty: 'medium',
      question: 'pgvector or a dedicated vector database — how do you decide for a new RAG product?',
      whatInterviewerLooksFor: [
        'Considers scale, filtering, ops maturity and existing stack',
        'Knows pgvector strengths (SQL, ACID, joins) and limits',
        'Knows what dedicated engines add',
        'Proposes a benchmark and migration trigger',
      ],
      modelAnswer: `**Start from requirements:** number of vectors (now and in 2 years), QPS and p95 target, filter complexity (tenants, ACLs, dates), update rate, team ops capacity, existing database.

**pgvector strengths**
- Vectors live next to relational data: permissions, documents and chunks in one transaction; ACL filters are SQL joins.
- One system to back up, secure and monitor; familiar tooling.
- HNSW and IVFFlat, halfvec/bit quantization, iterative scans for filtered queries (0.8+).
- Comfortable up to roughly ~10M vectors per node with enough RAM.

**Dedicated engines add**
- Filter-aware traversal and cardinality-based planning (Qdrant), built-in quantization with rescoring, sharding/replication designed for vectors, hybrid sparse+dense, GPU/DiskANN (Milvus), serverless no-ops (Pinecone).

**Decision**
- Already on Postgres, ≤ ~10M vectors, moderate QPS → **pgvector**.
- Heavy multi-tenant filtering, 10M–1B vectors, or vector-specific tuning needs → **Qdrant/Milvus/Weaviate**.
- No ops capacity, spiky traffic → **Pinecone**.

**Validate:** benchmark top 2 candidates with real queries and filters: recall@10 vs exact, p95 at target QPS, memory, cost. Write down a migration trigger (e.g. > 10M vectors or filtered recall < 0.9) and keep a storage abstraction so moving is a data migration, not a rewrite.`,
      followUps: [
        {
          q: 'What breaks first when pgvector outgrows a node?',
          a: 'Usually memory: the HNSW index no longer fits in RAM, latency spikes due to disk reads, and index builds take hours; read replicas help QPS but not index size.',
        },
        {
          q: 'How do you keep a dedicated vector DB consistent with Postgres?',
          a: 'Use an outbox table or CDC stream, idempotent upserts keyed by chunk id, deletes propagated as events, and periodic reconciliation counts per document.',
        },
      ],
      pitfalls: [
        'Picking a database from a vendor benchmark',
        'Ignoring the cost of syncing two stores',
        'Forgetting filtered-query performance',
      ],
    },
    {
      id: 'vector-databases-iq-2',
      difficulty: 'hard',
      question:
        'Users of a small tenant see "no relevant documents" while large tenants are fine. Same embedding model, same index. Diagnose.',
      context: 'pgvector HNSW, ef_search default, WHERE tenant_id = $1 ORDER BY embedding <=> $2 LIMIT 8.',
      whatInterviewerLooksFor: [
        'Recognises post-filtering after approximate index scan',
        'Explains the selectivity arithmetic',
        'Lists concrete fixes (iterative scan, partial/partition, B-tree for exact search)',
        'Adds monitoring',
      ],
      modelAnswer: `**Root cause: post-filtering after an approximate scan.** pgvector's HNSW scan returns about \`ef_search\` (default 40) nearest candidates from the whole table; the \`WHERE tenant_id\` filter is applied afterwards. A big tenant owning 30% of rows keeps ~12 of 40 candidates, enough for LIMIT 8. A small tenant with 0.5% of rows keeps 0.2 on average, so usually nothing.

**Confirm:** run the query with \`SET enable_indexscan = off\` (exact search) for the small tenant and compare; check result counts by tenant size in logs.

**Fixes**
1. **Iterative index scans (pgvector 0.8+):** \`SET hnsw.iterative_scan = relaxed_order\` keeps scanning until LIMIT is filled or \`hnsw.max_scan_tuples\` (default 20,000) is reached.
2. **B-tree on tenant_id + ANALYZE:** for tiny tenants the planner can choose an exact scan of their few thousand rows, which is fast and exact.
3. **Partitioning by tenant** (or partial indexes for a handful of big tenants): each partition gets its own small HNSW.
4. **Raise ef_search** as a stop-gap (costs latency for everyone).
5. Or move to an engine with filter-aware traversal (Qdrant with an \`is_tenant\` payload index).

**Monitor:** emit \`results_returned < k\` as a metric by tenant, and run a nightly filtered-recall check against exact search.`,
      followUps: [
        {
          q: 'Why "relaxed_order" rather than "strict_order"?',
          a: 'Relaxed order allows slightly out-of-order results in exchange for better recall and speed; you can re-sort the final few rows by exact distance in a wrapping query or in the app.',
        },
        {
          q: 'What happens if max_scan_tuples is hit before LIMIT is filled?',
          a: 'The scan stops and you still get fewer rows; for very selective filters exact search via a B-tree or partition is the right path.',
        },
      ],
      pitfalls: [
        'Blaming the embedding model',
        'Only raising ef_search globally',
        'Not checking against exact search',
      ],
    },
    {
      id: 'vector-databases-iq-3',
      difficulty: 'hard',
      question: 'Design multitenancy for 5,000 tenants on a vector database. Collection per tenant, shared collection, or something else?',
      whatInterviewerLooksFor: [
        'Trade-offs between isolation, resource overhead and performance',
        'Knows engine-specific features (Qdrant is_tenant, Pinecone namespaces, Milvus partition keys, Postgres partitions/RLS)',
        'Handles skewed tenant sizes',
        'Security: enforce filter server-side',
      ],
      modelAnswer: `**Collection per tenant** gives hard isolation and per-tenant tuning, but 5,000 collections means 5,000 indexes, segment sets and metadata entries: memory overhead, slow cluster operations, and many tiny inefficient indexes. Qdrant explicitly recommends against it at this scale.

**Shared collection with a tenant key** is the usual answer:
- **Qdrant:** keyword payload index on \`tenant_id\` with \`is_tenant: true\` (co-locates a tenant's vectors and optimises per-tenant search); every query carries \`must: tenant_id = X\`.
- **Pinecone:** one namespace per tenant (physically partitioned, cheap, queries scoped to the namespace).
- **Milvus:** partition key on tenant_id.
- **pgvector:** partitioning by tenant (list/hash) plus Row-Level Security bound to a session variable.

**Skew:** typically a few tenants hold most data. Promote the top N tenants to dedicated shards/collections/partitions with tuned parameters; keep the long tail shared.

**Security**
- The tenant filter is injected by the server from the authenticated principal, never accepted from the client.
- Defence in depth: assert tenant_id on returned payloads; audit logs.
- Deletion (GDPR): delete-by-filter on tenant_id, then compaction.

**Validate:** per-tenant recall vs exact, p95 per size bucket, and memory per tenant.`,
      followUps: [
        {
          q: 'A regulated customer demands physical isolation. What do you do?',
          a: 'Give them a dedicated collection or cluster (or a separate Postgres database), with separate encryption keys, while the rest stay on the shared model.',
        },
        {
          q: 'How do you bill or quota tenants?',
          a: 'Track vector counts and query counts per tenant from the payload index or partition stats and enforce limits at the ingestion API.',
        },
      ],
      pitfalls: [
        'One collection per tenant at thousands of tenants',
        'Trusting a client-supplied tenant filter',
        'Ignoring tenant size skew',
      ],
    },
    {
      id: 'vector-databases-iq-4',
      difficulty: 'medium',
      question: 'Walk through what happens to an HNSW-based index when you update and delete lots of vectors.',
      whatInterviewerLooksFor: [
        'Tombstones / marked deletions',
        'Graph quality degradation and memory waste',
        'Compaction / vacuum / rebuild',
        'Practical mitigation for high-churn workloads',
      ],
      modelAnswer: `**Deletes** in most HNSW implementations are **soft**: the node is marked deleted (tombstone) but stays in the graph as a routing hop so neighbours remain connected. Searches skip it in results but still traverse it.

**Updates** are typically delete + insert: the old node becomes a tombstone and a new node is linked in.

**Consequences of heavy churn**
- Memory and disk grow with tombstones.
- Search does wasted work on dead nodes; if many results are tombstones, the effective candidate list shrinks and **recall drops**.
- Graph structure built for old data may become less optimal.

**Engine mechanics**
- **Postgres/pgvector:** \`VACUUM\` removes dead tuples and repairs the HNSW graph (can be slow on big indexes); \`REINDEX CONCURRENTLY\` rebuilds it.
- **Qdrant:** segments with many deleted points are vacuumed/merged by optimizers (\`deleted_threshold\`), rebuilding the index for that segment.
- **Milvus/Weaviate:** compaction merges segments and drops deleted entries.

**Mitigations**
- Batch updates instead of constant single-row churn.
- Re-embed into a new collection/table and switch aliases for model migrations.
- Monitor deleted-ratio and recall; schedule rebuilds for high-churn tenants.
- Keep ids stable so unchanged chunks are not rewritten (content-hash diffing upstream).`,
      followUps: [
        {
          q: 'How do you migrate to a new embedding model with zero downtime?',
          a: 'Build a new collection or column with the new vectors in the background, dual-write new documents, verify recall, then switch the query alias and drop the old index.',
        },
        {
          q: 'Why not hard-delete nodes immediately?',
          a: 'Removing a node breaks paths through it; repairing neighbours is expensive, so engines defer it to batch vacuum/compaction.',
        },
      ],
      pitfalls: [
        'Assuming deletes free memory immediately',
        'Re-embedding unchanged chunks on every sync',
      ],
    },
    {
      id: 'vector-databases-iq-5',
      difficulty: 'expert',
      question:
        'Your filtered queries combine tenant, document type and date range. Recall is 0.97 for each filter alone but 0.71 when all three are combined. Explain and fix.',
      context: 'Qdrant, payload indexes on all three fields, 30M points.',
      whatInterviewerLooksFor: [
        'Understands per-field filterable-HNSW edges and graph fragmentation under combined filters',
        'Knows the query planner and full_scan_threshold',
        'Proposes ACORN, partitioning, exact fallback, or schema changes',
        'Measures with exact search',
      ],
      modelAnswer: `**Why combined filters hurt.** Filterable HNSW adds extra edges between points sharing a value of each indexed field, so a walk restricted to one tenant (or one doc type) stays connected. Edges are built **per field, not per combination**. When tenant ∧ type ∧ date match only, say, 0.05% of points, the matching nodes are sparse in the graph and the walk can get stuck in regions where neighbours fail the filter, so it terminates with poor candidates.

The planner helps only at the extremes: if the estimated matching count is small enough (under \`full_scan_threshold\`), Qdrant does an exact search via payload indexes; if matches are plentiful, graph search works. The **middle zone** (too many for exact, too few for the graph) is where recall falls.

**Fixes**
1. **ACORN (Qdrant 1.16+)**: when a neighbour fails the filter, also explore its neighbours; enable for queries with low estimated selectivity (\`max_selectivity\`).
2. **Raise \`full_scan_threshold\`** so more mid-selectivity queries use exact search over payload-index candidates (latency trade-off).
3. **Restructure:** make tenant the partition/shard key (is_tenant) so the graph search is per tenant and the remaining filters are less selective inside it.
4. **Coarsen filters:** date as month buckets in a keyword field instead of fine ranges, if acceptable.
5. **Raise hnsw_ef** for these queries.

**Measure:** compare against \`exact: true\` on a sample of real combined-filter queries, bucketed by estimated selectivity; pick per-bucket strategies.`,
      followUps: [
        {
          q: 'Why build payload indexes before ingesting data in Qdrant?',
          a: 'The extra filter-aware edges are created when the HNSW graph is built; an index added later works for filtering but the graph lacks those edges until it is rebuilt.',
        },
        {
          q: 'How would you do the same analysis in pgvector?',
          a: 'Compare iterative-scan results with an exact query (index scans disabled) for combined filters, check rows returned vs LIMIT, and consider partitioning by tenant with B-tree indexes on type and date.',
        },
      ],
      pitfalls: [
        'Assuming payload indexes guarantee recall for any filter combination',
        'Not measuring by selectivity bucket',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'vector-databases-est-1',
      question: 'Size the RAM for a 20M-chunk index with text-embedding-3-small vectors in Qdrant or pgvector.',
      assumptions: [
        '20M vectors × 1,536 dims',
        'HNSW m = 16 → ~2·m links per node at layer 0, ~4 bytes per link (Qdrant) to ~8 (pgvector incl. overhead)',
        'Payload/metadata ~300 bytes per point in RAM-indexed fields',
        'Options: float32, float16/halfvec, int8 scalar quantization (with originals on disk)',
      ],
      steps: [
        { label: 'float32 vectors', calc: '20M × 1,536 × 4 B = 122.9 GB' },
        { label: 'halfvec / float16', calc: '20M × 1,536 × 2 B = 61.4 GB' },
        { label: 'int8 scalar quantization', calc: '20M × 1,536 × 1 B = 30.7 GB (float32 originals on disk for rescoring)' },
        { label: 'HNSW links', calc: '20M × 32 links × 4–8 B = 2.6–5.1 GB' },
        { label: 'Payload indexes', calc: '20M × 300 B = 6 GB' },
        { label: 'Totals', calc: 'float32 ≈ 130–134 GB; float16 ≈ 70–73 GB; int8 ≈ 39–42 GB + SSD for originals' },
      ],
      answer: '~130 GB of RAM uncompressed vs ~40 GB with int8 quantization and on-disk originals.',
      insight:
        'Vector bytes dominate everything else; quantization (with rescoring from disk) is the main lever, turning a multi-node cluster into a single 64 GB machine at a small recall cost.',
      followUps: [
        {
          q: 'What does binary quantization give here?',
          a: '1 bit per dim → 20M × 192 B ≈ 3.8 GB in RAM; recall on its own is low, so oversample (e.g. 4×) and rescore with float vectors from disk.',
        },
      ],
    },
    {
      id: 'vector-databases-est-2',
      question: 'How many queries per second can a single pgvector node serve for a filtered top-10 search, and how many nodes do you need for 600 QPS?',
      assumptions: [
        '5M halfvec(1536) vectors fully in RAM (index + data ≈ 17 GB on a 64 GB, 16-vCPU instance)',
        'HNSW ef_search 100 → ~8 ms CPU per query; filter via iterative scan adds ~50% on average',
        'Target CPU utilisation 60% for headroom',
        'Read replicas serve queries; primary handles writes',
      ],
      steps: [
        { label: 'CPU per query', calc: '8 ms × 1.5 = 12 ms' },
        { label: 'Queries per core', calc: '1,000 ms ÷ 12 ms ≈ 83 QPS/core' },
        { label: 'Per node at 60%', calc: '83 × 16 cores × 0.6 ≈ 800 QPS' },
        { label: 'For 600 QPS', calc: '1 replica suffices on CPU; use 2 replicas for HA and p95 headroom' },
        { label: 'Latency', calc: '~12 ms in DB + network/app ≈ 20–30 ms p50' },
      ],
      answer: 'Roughly 800 QPS per 16-vCPU replica, so 2 replicas (for HA) cover 600 QPS.',
      insight:
        'For millions of vectors fully in RAM, the database is rarely the bottleneck in RAG; the LLM call (seconds) dominates. The thing to protect is RAM: once the index spills to disk, latency jumps by 10× or more.',
      followUps: [
        {
          q: 'What changes if the index no longer fits in RAM?',
          a: 'Random graph traversal triggers disk reads; p95 can go from ~15 ms to hundreds of ms. Add RAM, quantize (halfvec/binary + rescoring), or partition across nodes.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'vector-databases-mcq-01',
      difficulty: 'medium',
      question:
        'Which capability does a vector database provide that a numpy array plus brute-force search does NOT?',
      options: [
        'Computing cosine similarity',
        'Persistent storage with live upserts/deletes and metadata-filtered ANN search',
        'Storing float32 numbers',
        'Returning top-k results',
      ],
      correct: [1],
      explanation:
        'A numpy array can compute similarities and top-k (exactly, in O(N)). It lacks persistence, concurrent updates, filtered approximate indexes, replication and backups, which are what a database adds.',
      followUps: [
        {
          q: 'When is brute-force numpy actually the right choice?',
          a: 'For small static corpora (tens of thousands of vectors) where an exact O(N) scan takes a few milliseconds and there is no need for persistence or filters.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-02',
      difficulty: 'hard',
      question: 'Why is this query slow even though an HNSW index exists?',
      code: {
        language: 'sql',
        code: `CREATE INDEX ON items USING hnsw (embedding vector_ip_ops);

SELECT id FROM items
ORDER BY embedding <=> '[...]'
LIMIT 10;`,
      },
      options: [
        'HNSW indexes cannot be used with LIMIT',
        'The index is built for inner product (<#>) but the query orders by cosine distance (<=>), so it cannot be used',
        'The vector literal needs to be normalised',
        'HNSW only works with L2 distance',
      ],
      correct: [1],
      explanation:
        'pgvector indexes serve the operator matching their opclass: vector_ip_ops for <#>, vector_cosine_ops for <=>, vector_l2_ops for <->. A mismatch forces a sequential scan.',
      followUps: [
        {
          q: 'If vectors are normalised, which operators give the same ranking?',
          a: 'For unit vectors, cosine distance, L2 distance and negative inner product all produce the same ordering, so you can pick the cheapest (inner product) consistently in index and query.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-03',
      difficulty: 'hard',
      question: 'Which practices speed up building an HNSW index on 10M rows in pgvector? (Select ALL that apply)',
      options: [
        'Load data first with COPY, then CREATE INDEX',
        'Increase maintenance_work_mem so the graph fits in memory',
        'Insert rows one by one in autocommit mode after creating the index',
        'Use max_parallel_maintenance_workers for a parallel build',
      ],
      correct: [0, 1, 3],
      explanation:
        'Bulk loading before indexing, enough maintenance memory and parallel workers all speed up builds. Row-by-row inserts into an existing HNSW index pay graph maintenance per row plus transaction overhead, which is the slowest path.',
      followUps: [
        {
          q: 'What happens if maintenance_work_mem is too small?',
          a: 'pgvector warns that the graph no longer fits and continues building on disk, which is dramatically slower; the notice tells you to raise the setting.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-04',
      difficulty: 'hard',
      question:
        'A Qdrant collection is filtered on "department", but the payload index for that field was created after 8M points were ingested. Filtered recall is mediocre. Why?',
      options: [
        'Payload indexes only work for numeric fields',
        'The filterable-HNSW extra edges for that field are built with the graph; adding the index later enables filtering but not those edges until the HNSW index is rebuilt',
        'Qdrant ignores filters on large collections',
        'Filtering requires exact: true',
      ],
      correct: [1],
      explanation:
        'Qdrant builds filter-aware edges when constructing the HNSW graph. An index created later supports filtering and cardinality estimates, but traversal under the filter lacks those connections until a rebuild.',
      followUps: [
        {
          q: 'How do you trigger the rebuild safely?',
          a: 'Recreate or re-optimise the collection (e.g. update HNSW config to force re-indexing, or migrate to a new collection and switch an alias), off-peak.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-05',
      difficulty: 'expert',
      question: 'Which statements about post-filtering with an approximate index are true? (Select ALL that apply)',
      options: [
        'The expected number of results is roughly candidates × filter selectivity',
        'It can return fewer than k results even when k matching rows exist',
        'It always returns the exact filtered top-k if ef ≥ k',
        'Raising the candidate count (ef_search) improves it at a latency cost',
      ],
      correct: [0, 1, 3],
      explanation:
        'Post-filtering keeps only matching candidates, about ef × selectivity, so selective filters return too few rows. Increasing ef helps linearly but costs latency. ef ≥ k guarantees nothing once a filter is applied.',
      followUps: [
        {
          q: 'With a 1% filter, roughly what ef_search would post-filtering need for 10 results?',
          a: 'About 1,000 candidates on average (10 / 0.01), and more for a reliable guarantee, which is why filter-aware search or exact pre-filtering is preferred.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-06',
      difficulty: 'medium',
      question: 'Which multitenancy design is generally recommended for thousands of small tenants in Qdrant?',
      options: [
        'One collection per tenant',
        'One shared collection with a keyword payload index on tenant_id marked is_tenant, and a mandatory tenant filter',
        'One cluster per tenant',
        'No filter; rely on the LLM to ignore other tenants\' text',
      ],
      correct: [1],
      explanation:
        'A shared collection with a tenant payload index keeps resource use bounded and search efficient. Thousands of collections or clusters waste resources; relying on the LLM for isolation is a data leak.',
      followUps: [
        {
          q: 'How do you make sure the filter is always applied?',
          a: 'Inject it server-side from the authenticated identity in a single data-access function, and add tests and runtime assertions that returned payloads match the tenant.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-07',
      difficulty: 'hard',
      question: 'This pgvector query returns 2 rows instead of 10 for a small tenant. Which changes fix it? (Select ALL that apply)',
      code: {
        language: 'sql',
        code: `-- hnsw index on embedding; ef_search = 40 (default)
SELECT id FROM chunks
WHERE tenant_id = 'acme'
ORDER BY embedding <=> $1
LIMIT 10;`,
      },
      options: [
        "SET hnsw.iterative_scan = 'relaxed_order' (pgvector 0.8+)",
        'Partition the table by tenant_id so each tenant has its own small index',
        'Add a B-tree index on tenant_id so the planner can choose an exact scan for tiny tenants',
        'Change LIMIT 10 to LIMIT 2',
      ],
      correct: [0, 1, 2],
      explanation:
        'Iterative scans keep reading the index until LIMIT is filled; partitioning confines search to the tenant; a B-tree lets the planner pick exact search for selective filters. Lowering LIMIT hides the problem.',
      followUps: [
        {
          q: 'What guards against iterative scans running too long?',
          a: 'hnsw.max_scan_tuples (default 20,000) caps how many tuples are visited, so very selective filters may still under-fill and should use exact search.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-08',
      difficulty: 'medium',
      question:
        'You store 1,536-d vectors in pgvector as halfvec instead of vector. What is the main effect?',
      options: [
        'Recall drops by ~50%',
        'Vector storage and index memory roughly halve with negligible recall loss for typical embeddings',
        'Queries must use a different distance metric',
        'Indexes are no longer supported',
      ],
      correct: [1],
      explanation:
        'halfvec stores 16-bit floats (2 bytes/dim), halving memory, and supports indexing up to 4,000 dims. Embedding precision far exceeds what retrieval needs, so recall changes are typically tiny.',
      followUps: [
        {
          q: 'Why might halfvec matter for a 3,072-d model?',
          a: 'pgvector indexes vector up to 2,000 dims, but halfvec up to 4,000, so halfvec is what makes a 3,072-d HNSW index possible.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-09',
      difficulty: 'expert',
      question:
        'A Qdrant query filters to ~0.1% of 30M points (~30K points). Latency is fine but recall is 0.75. What is the most targeted fix?',
      code: {
        language: 'typescript',
        code: `await qdrant.query('chunks', {
  query: vec, limit: 10,
  filter: { must: [
    { key: 'tenant_id', match: { value: 't-9' } },
    { key: 'doc_type', match: { value: 'contract' } },
  ] },
});`,
      },
      options: [
        'Remove the payload indexes so Qdrant scans everything',
        'Enable ACORN for low-selectivity queries (or raise full_scan_threshold so this cardinality uses exact search), then verify with exact: true',
        'Increase the vector dimension',
        'Switch distance from Cosine to Dot',
      ],
      correct: [1],
      explanation:
        'This sits in the middle zone: too many matches for exact search under the default threshold, too few for the per-field filterable edges to keep the combined-filter walk connected. ACORN explores beyond filtered-out neighbours; a higher threshold routes it to exact search. Removing indexes, changing dimensions or metric does not address traversal.',
      followUps: [
        {
          q: 'How do you measure the recall here?',
          a: 'Run the same query with params exact: true for a sample of real queries and compute overlap@10 between the approximate and exact results.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-10',
      difficulty: 'hard',
      question: 'Which are valid reasons to choose pgvector over a dedicated vector database? (Select ALL that apply)',
      options: [
        'You need transactional consistency between documents, permissions and embeddings',
        'Your team already operates Postgres and the corpus is a few million vectors',
        'You need GPU-accelerated indexing for 5 billion vectors',
        'You want ACL filtering via SQL joins with existing tables',
      ],
      correct: [0, 1, 3],
      explanation:
        'ACID with relational data, existing Postgres skills at moderate scale, and SQL joins for permissions are classic pgvector advantages. Billion-scale GPU indexing is Milvus territory.',
      followUps: [
        {
          q: 'What would make you migrate off pgvector later?',
          a: 'Index size outgrowing a node\'s RAM, filtered recall/latency targets you cannot meet with iterative scans and partitioning, or a need for vector-specific scaling such as sharding.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-11',
      difficulty: 'medium',
      question:
        'After a large re-ingestion that deleted and re-inserted 40% of points, recall and memory both got worse. What is the most likely cause?',
      options: [
        'The embedding model changed silently',
        'Tombstoned (soft-deleted) nodes remain in the graph until vacuum/compaction, wasting memory and degrading search',
        'Metadata filters were dropped',
        'HNSW cannot accept new inserts',
      ],
      correct: [1],
      explanation:
        'Deletes in HNSW are typically soft; until compaction or vacuum removes them, they consume memory and traversal effort. Unchanged chunks should not be rewritten at all, and compaction should run after big churn.',
      followUps: [
        {
          q: 'How would you avoid this in the ingestion design?',
          a: 'Diff by content hash so unchanged chunks keep their ids and are not rewritten, and for full re-embeds build a new collection and switch an alias.',
        },
      ],
    },
    {
      id: 'vector-databases-mcq-12',
      difficulty: 'expert',
      question:
        'You must enforce document-level permissions in RAG over 2M chunks where each user belongs to ~20 of 5,000 groups. Which approach is most robust?',
      options: [
        'Retrieve top-50 without filters and drop chunks the user cannot see before prompting',
        'Store allowed group ids on each chunk, index that field, and filter inside the vector search with the user\'s groups (any-of), verifying filtered recall',
        'Ask the LLM not to reveal restricted content',
        'Create one index per user',
      ],
      correct: [1],
      explanation:
        'Filtering inside the search with an indexed ACL field returns the user\'s true top-k and never exposes restricted text. Post-filtering under-fills results; prompt instructions are not security; per-user indexes explode storage.',
      followUps: [
        {
          q: 'Group membership changes hourly. Where do you resolve it?',
          a: 'Resolve the user\'s current groups at query time from the identity provider or a cache, and keep group ids (not user ids) on chunks so membership changes need no re-indexing.',
        },
      ],
    },
  ],
};

export default topic;
