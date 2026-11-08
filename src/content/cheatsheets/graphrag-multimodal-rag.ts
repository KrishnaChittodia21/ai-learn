import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['multimodal-rag.md', 'graphs-knowledge-graphs.md'],
  blocks: [
    {
      title: 'Page-image vs text retrieval',
      markdown: `| Factor | ColPali-style | Pooled page vector (VisRAG) | Text RAG |
|---|---|---|---|
| Vectors per page | Many patch vectors | One | One per chunk |
| Scoring | MaxSim | Single-vector similarity | Cosine on chunks |
| OCR step | None | None | Yes |
| Storage | Largest | Small | Smallest |
| Charts, tables, layout | Kept | Partly kept | Often lost |
| Use for | Quality on rich PDFs | Scale | Plain-text corpora |`,
    },
    {
      title: 'Use X when',
      markdown: `- **Text RAG**: wikis, chat logs, very large archives, or when regulation needs extractable text.
- **Page-image retrieval**: financial reports, papers, contracts — the answer lives in a chart or table.
- **CLIP / SigLIP-style shared space**: text ↔ image search; CLAP for text ↔ audio.
- **Simple weighted score fusion** across modalities first; a learned router only if an A/B shows a clear win.`,
    },
    {
      title: 'Answers you will be asked',
      markdown: `- **Why MaxSim, not mean similarity?** Irrelevant patches would wash out the mean; each query token keeps only its best patch.
- **How do you cite mixed sources?** Text \`[1]\`, image \`[img 3]\`, audio \`[audio 2 at 0:34]\` — plus a bounding box on the source page when you can.
- **How do you grade cross-modal RAG?** Recall@k per modality, then accuracy of the fused top-k.
- **Graph or vector memory?** Vectors for fuzzy recall, a graph for typed relationships and time-bounded facts — many systems keep both.`,
    },
  ],
};

export default sheet;
