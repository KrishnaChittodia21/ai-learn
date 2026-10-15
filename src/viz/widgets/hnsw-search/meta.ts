import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'hnsw-search',
  title: 'HNSW search: greedy descent through the layers, then a beam on layer 0',
  blurb:
    'Follow a query from the top-layer entry point down an 80-vector HNSW graph, watch the efSearch beam on layer 0, and compare recall and distance computations against brute force as you change efSearch and M.',
  placements: [{ topic: 'ann-search', heading: 'HNSW and IVF' }],
};
