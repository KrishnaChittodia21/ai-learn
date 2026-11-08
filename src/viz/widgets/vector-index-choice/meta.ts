import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'vector-index-choice',
  title: 'Choosing a vector index: memory, recall and the RAM budget',
  blurb:
    'Set the collection size, dimensions, HNSW M and the machine’s RAM. Watch what Flat, IVF, HNSW, halfvec and quantization each need in memory, then pick the index you would deploy before the verdict appears.',
  placements: [{ topic: 'vector-databases', heading: 'Vector Indexing' }],
};
