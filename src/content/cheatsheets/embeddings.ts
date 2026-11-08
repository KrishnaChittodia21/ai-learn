import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['embeddings-vector-search.md', 'word-embeddings.md'],
  blocks: [
    {
      title: 'Static vs contextual vectors',
      markdown: `| Factor | Word2Vec / GloVe | FastText | Transformer embedder |
|---|---|---|---|
| Unit | One vector per word | Word = sum of char n-grams | Whole sentence / chunk |
| Unseen word | No vector | Built from n-grams | Handled by subword tokens |
| "bank" (river / money) | One vector | One vector | Depends on context |
| Use for | Teaching, tiny features | Misspellings, rich morphology | RAG and semantic search |`,
    },
    {
      title: 'Size maths (float32)',
      markdown: `- Bytes per vector = dims × 4: 384 → 1.5 KB, 1,536 → 6 KB, 3,072 → 12 KB.
- 10M vectors × 1,536 dims ≈ 61 GB before any index overhead.
- Binary quantisation: 1 bit per dim, 32× smaller — rescore the top candidates with full vectors.
- Matryoshka cut: keep the first n dims, then **renormalise**.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Recall lower than the model card | Missing query / passage prefix | Use the prefix or \`input_type\` from the card |
| Truncated vectors rank badly | Not renormalised after the cut | Divide by the norm again |
| Recall falls after truncation | Cut too far, or model not Matryoshka-trained | Validate each size on your eval set |
| \`dim mismatch\` error | Two models or sizes mixed | One model, one size per index |
| Neighbours change between tools | Cosine and L2 conventions mixed | Normalise and use the metric the model expects |
| Long docs match nothing | One vector averages many topics | Chunk before embedding |`,
    },
    {
      title: 'Swapping models',
      markdown: `- Benchmark on your own queries; leaderboard rank is a shortlist, not a decision.
- Report recall@1, @5 and @10 side by side, plus p99 latency.
- Switch only for a clear win on your domain — a switch means re-embedding everything.`,
    },
  ],
};

export default sheet;
