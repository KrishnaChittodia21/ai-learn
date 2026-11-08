import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['embeddings-vector-search.md', 'rag-production.md'],
  blocks: [
    {
      title: 'Capacity sketch (1,536 dims)',
      markdown: `| Storage | Bytes / vector | 10M vectors |
|---|---|---|
| float32 | 6,144 | ≈ 61 GB |
| float16 (\`halfvec\`) | 3,072 | ≈ 31 GB |
| int8 | 1,536 | ≈ 15 GB |
| binary | 192 | ≈ 2 GB |

Add index overhead (HNSW links) and metadata on top. Keep full vectors on disk for rescoring.`,
    },
    {
      title: 'Choose a store',
      markdown: `| Situation | Pick |
|---|---|
| Already on Postgres, millions of vectors | pgvector |
| Heavy filtering, large scale, self-hosted | Qdrant / Milvus / Weaviate |
| No ops team, pay per use | Managed (e.g. Pinecone) |
| Prototype, under ~100K vectors | In-memory flat index |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Filtered query returns too few rows | Post-filter after ANN | Filter during search, iterative scans, partitions |
| User sees another tenant's chunk | ACL applied after scoring | Tenant + ACL as a pre-filter in the query |
| Filtered search slow | No payload / metadata index | Index filter fields before ingest |
| Bulk load takes hours | Index built row by row | Load first, build the index after |
| Stale answers after edits | Upserts without deletes | Delete old chunk ids on update |`,
    },
  ],
};

export default sheet;
