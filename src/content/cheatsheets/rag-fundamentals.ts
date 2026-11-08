import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag.md', 'rag-production.md'],
  blocks: [
    {
      title: 'Starting defaults',
      markdown: `| Setting | Start with | Note |
|---|---|---|
| Chunk size | 256–512 tokens | Tune per document type on an eval set |
| Candidates | top 50 (hybrid) | BM25 + dense, fused with RRF \`k = 60\` |
| After rerank | top 5 | 5–10 chunks is a few thousand tokens of context |
| Refusal | Low top score → "I don't know" | Calibrate the threshold on labelled queries |
| Citation anchor | \`[doc_id:chunk_index]\` | Lets you check every cited id was retrieved |`,
    },
    {
      title: 'One production chat turn',
      markdown: `1. **Input guard**: block known-bad patterns before any retrieval.
2. **Access filter**: tenant + role as a pre-filter, before any score.
3. **Hybrid retrieve**, then **rerank** to the top few.
4. **Prompt layout**: system prompt, policy, then context; the question goes last so the stable prefix can be cached.
5. **Generate**: answer with citations or say you are unsure.
6. **Output check**: validate citations, scrub PII, log the turn.`,
    },
    {
      title: 'Use RAG when…',
      markdown: `| Need | Pick |
|---|---|
| Fresh or private facts | RAG |
| Answers must cite a source | RAG |
| Style, tone, output format | Prompting first, fine-tuning if that fails |
| A reasoning pattern or skill | Fine-tuning (or few-shot) |
| Small, static, shared corpus | Long context + prompt caching |`,
    },
    {
      title: 'Common questions',
      markdown: `- **Why measure recall@k first?** The generator can ignore a bad chunk; it cannot use one it never saw.
- **Why does an edited policy still get cited?** The index lags the source: re-ingest changed docs and delete removed ones.
- **Does a valid citation prove the answer?** No — the cited chunk can still be irrelevant or outdated.
- **Why put the question last?** Everything before it is a reusable, cacheable prefix.`,
    },
  ],
};

export default sheet;
