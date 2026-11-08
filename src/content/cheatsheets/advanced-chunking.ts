import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag.md'],
  blocks: [
    {
      title: 'Which advanced strategy',
      markdown: `| Problem | Strategy | Cost |
|---|---|---|
| Topics shift inside long text | Semantic chunking | One embedding per sentence at ingest |
| Docs have headings, tables, code | Structure-aware | Parser per format |
| Need precise match and full context | Parent-child | Docstore + parent dedupe |
| Chunks lose who / what / when | Contextual chunking | One LLM call per chunk (cache the doc) |
| Need context without an LLM pass | Late chunking | Long-context embedder |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Tiny fragments from semantic chunking | No size floor | Enforce min and max tokens |
| One huge chunk | Threshold never fires | Max-token cap, recurse inside |
| Prompt repeats the same parent | Several children hit one parent | Dedupe by \`parent_id\` before generation |
| Table rows lose their meaning | Header dropped on split | Repeat the header in each piece |
| Context sentence invents facts | Prompt allows guessing | Ask only to situate the chunk, from the document |`,
    },
    {
      title: 'Rollout order',
      markdown: `1. Baseline: recursive or structure-aware, measure recall@5.
2. Add parent-child if answers lack surrounding context.
3. Add contextual chunking if chunks are ambiguous out of context.
4. Keep each step only if recall and answer accuracy improve on the eval set.`,
    },
  ],
};

export default sheet;
