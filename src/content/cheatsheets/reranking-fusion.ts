import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag.md', 'embeddings-vector-search.md'],
  blocks: [
    {
      title: 'RRF worked example',
      markdown: `With \`k = 60\` and ranks starting at 1:

| Doc | BM25 rank | Dense rank | RRF score |
|---|---|---|---|
| A | 1 | 3 | 1/61 + 1/63 ≈ 0.0323 |
| B | 2 | 1 | 1/62 + 1/61 ≈ 0.0325 |
| C | — | 2 | 1/62 ≈ 0.0161 |

C ranks 2nd in one list yet trails A and B, which both lists found. Per-list weights multiply each term.`,
    },
    {
      title: 'Bi- vs cross-encoder',
      markdown: `| Factor | Bi-encoder | Cross-encoder |
|---|---|---|
| Input | Query and doc apart | Query + doc together |
| Precompute docs | Yes | No |
| Scales to | Whole corpus | Top 50–150 candidates |
| Role | Recall | Precision |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Reranker shows no lift | Pool N equals final K | Rerank at least 3× K candidates |
| Good recall, poor MRR | Right chunk not at position 1 | Add or tune a cross-encoder |
| One retriever always wins | Raw scores summed | Use RRF or normalise first |
| Relevant chunk dropped after rerank | Reranker off-domain | Evaluate on your queries; try another model |
| Rerank latency spikes | Pool too large | Cap N; cache by query |`,
    },
    {
      title: 'Pin together',
      markdown: `Retriever model, reranker model, pool size N and final K change each other's results — version them as one config and re-run the eval when any one changes.`,
    },
  ],
};

export default sheet;
