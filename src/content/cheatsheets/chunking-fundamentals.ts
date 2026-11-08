import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag.md', 'rag-production.md'],
  blocks: [
    {
      title: 'Pick a splitter',
      markdown: `| Content | Splitter | Why |
|---|---|---|
| Plain prose, no structure | Recursive | Strongest simple baseline |
| Markdown, API docs, RFCs | Split at headings, recurse inside | Keeps sections whole |
| Long single-topic paragraphs | Sentence-based | Clean boundaries |
| Source code | By function / class | Fixed windows cut mid-symbol |
| Anything | Fixed window | Use only as a control in your eval |`,
    },
    {
      title: 'Overlap maths',
      markdown: `- **Stride** = size − overlap. A 512-token chunk with 64 overlap advances 448 tokens.
- **Chunk count** ≈ doc tokens ÷ stride.
- **Storage factor** = size ÷ stride = 1 / (1 − overlap/size): 20% overlap stores 1.25× the text.
- **Tokens, not characters**: pass a token length function, or "512" means 512 characters.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Answer split across two chunks | Boundary cut | Structure-aware split or more overlap |
| Same passage retrieved twice | Big overlap | Lower overlap or dedupe hits by offset |
| Tiny fragment chunks | No size floor | Merge pieces below a minimum token count |
| Code chunk ends mid-function | Fixed window on code | Split on code units |
| Long chunk matches nothing | One vector averages many topics | Smaller chunks |
| Text silently cut off | Chunk over the model's max input | Cap size below the embedder limit |`,
    },
    {
      title: 'Evaluate a chunker',
      markdown: `1. Fix 50+ labelled queries with their gold passages.
2. Chunk with each candidate config (256 / 512 / 1,024).
3. Report recall@1, @3, @5 per config, per document type.
4. Keep the winner; record its config in the chunk metadata.`,
    },
  ],
};

export default sheet;
