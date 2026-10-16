import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'ivf-pq',
  title: 'IVF and IVF-PQ: probe a few k-means lists, score compressed codes, re-rank',
  blurb:
    'Train k-means lists on 200 vectors, probe the nprobe nearest lists for a query, and watch a neighbour across a cell border get missed. Then switch to IVF-PQ: compress vectors to codes, score them with lookup tables, and re-rank with full vectors to win recall back.',
  placements: [
    { topic: 'ann-search', heading: 'HNSW and IVF' },
    {
      topic: 'ann-search',
      heading: 'Putting it together: Product Quantization',
    },
  ],
};
