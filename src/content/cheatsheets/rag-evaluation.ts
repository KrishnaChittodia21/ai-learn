import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag.md', 'rag-production.md', 'llm-evaluation.md'],
  blocks: [
    {
      title: 'Read the metric pattern',
      markdown: `| Symptom | Likely cause | Fix |
|---|---|---|
| Low recall@k | Chunk cut the answer, or retriever misses it | Fix chunk boundaries, add BM25 / dense |
| Good recall, low MRR | Right chunk is not near the top | Add a reranker |
| High MRR, low faithfulness | Generator invents content | Cite-or-refuse prompt, groundedness check |
| High faithfulness, low relevancy | Grounded but off-topic | Rewrite the query |
| Mean looks fine, users complain | Average hides a failing slice | Slice by query type |`,
    },
    {
      title: 'Golden-set size (95% CI on an 80% metric)',
      markdown: `| Questions | ± points |
|---|---|
| 50 | ≈ 11 |
| 100 | ≈ 8 |
| 200 | ≈ 5.5 |
| 400 | ≈ 4 |
| 700 | ≈ 3 |

Half-width ≈ 1.96 · √(p(1 − p) / n) with p = 0.8 (normal approximation). Compare systems on the same questions.`,
    },
    {
      title: 'Run tiers',
      markdown: `- **Every PR**: a small smoke set — fast, catches breakage.
- **Nightly**: the full golden set, sliced by query type.
- **Before a ranking change ships**: per-query diff of baseline vs candidate; fail on regressions.`,
    },
    {
      title: 'Judge hygiene',
      markdown: `- Use a different model family from the generator; pin its version and prompt.
- Anchor each score to observable behaviour in the rubric.
- Treat unparseable judge output as a failure, not a dropped row.
- Unjudged docs in the top k count as zero gain — label them.`,
    },
  ],
};

export default sheet;
