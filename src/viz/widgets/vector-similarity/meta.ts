import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'vector-similarity',
  title: 'Cosine vs dot product vs euclidean in an embedding space',
  blurb:
    'Embed a query among seven texts, score every document with the metric you pick, and see how vector length makes dot product and euclidean disagree with cosine until you L2-normalise.',
  placements: [
    { topic: 'embeddings', heading: 'Vector Similarity' },
    { topic: 'embeddings', heading: 'Embeddings' },
  ],
};
