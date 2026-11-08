import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag.md', 'embeddings-vector-search.md'],
  blocks: [
    {
      title: 'Use which retriever',
      markdown: `| Query looks like | Best first stage |
|---|---|
| Error codes, SKUs, names, IDs (\`E-4021\`) | BM25 / keyword |
| Paraphrases, "how do I…" questions | Dense |
| Out-of-domain corpus, no labels | BM25 baseline first |
| Mixed traffic | Hybrid: BM25 + dense, RRF |
| Need expansion terms but an inverted index | Learned sparse (SPLADE) |`,
    },
    {
      title: 'BM25 knobs',
      markdown: `| Knob | Default | Effect |
|---|---|---|
| \`k1\` | ≈ 1.2 | Higher → repeated terms keep adding score |
| \`b\` | 0.75 | 0 ignores length, 1 fully normalises by length |
| Field boost | title > body | Repeat or weight title / symbol tokens |
| Analyser | same for docs and queries | A mismatch silently kills matches |`,
    },
    {
      title: 'Similarity facts',
      markdown: `- **Cosine** ranges −1 to 1 and ignores length; **cosine distance** = 1 − cos (0 to 2).
- **Dot product** equals cosine on unit vectors — normalise once and use dot.
- **Brute force** at 1M × 1,536 dims ≈ 1.5 billion multiply-adds per query: why ANN exists.
- **RRF** uses ranks, so unbounded BM25 scores and bounded cosine scores combine safely.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Exact code or ID missed | Embedding treats it as noise | Add BM25, fuse with RRF |
| Paraphrase missed | Keyword-only | Add dense retrieval |
| Long docs win every query | No length normalisation | Check \`b\`, chunk the docs |
| One failing query | Unknown which side failed | Diff the sparse and dense rankings |`,
    },
  ],
};

export default sheet;
