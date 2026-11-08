import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag.md'],
  blocks: [
    {
      title: 'Route the query to a transform',
      markdown: `| Query shape | Transform |
|---|---|
| Follow-up ("what about contractors?") | Rewrite to standalone |
| Two questions joined by "and" | Decompose into sub-queries |
| Short, vague, few document words | HyDE or expansion |
| Ambiguous wording | Multi-query, fuse with RRF |
| Has attributes (price, date, colour) | Self-query → validated filter |
| Already specific and standalone | Nothing — skip the LLM call |`,
    },
    {
      title: 'HyDE wiring',
      markdown: `1. LLM writes a short hypothetical answer passage.
2. **Dense** search embeds the passage.
3. **BM25** searches the original query — invented words do not reach the keyword index.
4. Fuse both lists with RRF, then rerank against the original query.

Why a wrong passage still helps: the retriever uses its *words*, not its facts.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| HyDE drops the right doc | Passage invents an ID or name | Cap passage length, keep the original query in the fusion |
| Sub-queries return the same chunks | Decomposition too shallow | Ask for distinct, answerable parts |
| Latency doubled | Transform on every turn | Classify first; cache by normalised query |
| Rewrite changed the meaning | Entities paraphrased | Keep names and numbers verbatim |
| Filter error or empty results | Unvalidated LLM filter | Schema + allow-list check, fall back to no filter |`,
    },
  ],
};

export default sheet;
