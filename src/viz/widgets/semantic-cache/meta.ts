import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'semantic-cache',
  title: 'Semantic caching: similarity threshold, hits, false hits and dollars saved',
  blurb:
    'Stream queries through an embedding-based cache, compare each one to its nearest cached neighbour against a threshold, and see paraphrases hit, look-alike questions turn into false hits, and the cost counter move as you tune the threshold.',
  placements: [{ topic: 'cost-caching', heading: 'Semantic Caching' }],
};
