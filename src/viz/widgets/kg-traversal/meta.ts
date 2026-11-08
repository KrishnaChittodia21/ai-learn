import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'kg-traversal',
  title: 'Multi-hop traversal: walk the chain no chunk contains',
  blurb:
    'Answer "which suppliers depend on a factory in a sanctioned region?" by walking a small knowledge graph hop by hop: SUPPLIES, then SOURCES_FROM, then LOCATED_IN. Pick the next edge yourself, shrink the hop budget, and compare with vector RAG that misses the registry entry.',
  placements: [{ topic: 'knowledge-graphs', heading: 'Knowledge Graphs — entities' }],
};
