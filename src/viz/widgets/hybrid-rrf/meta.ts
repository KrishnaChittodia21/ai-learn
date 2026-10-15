import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'hybrid-rrf',
  title: 'Hybrid search with Reciprocal Rank Fusion',
  blurb:
    'Fuse a BM25 list and a dense list with RRF = Σ 1/(k + rank), watch a document that is only mid-ranked in both beat each list\'s #1, and see how the k constant changes who wins.',
  placements: [
    { topic: 'reranking-fusion', heading: 'Reciprocal Rank Fusion (RRF)' },
    { topic: 'retrieval-fundamentals', heading: 'Hybrid Search' },
  ],
};
