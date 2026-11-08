import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'context-budget',
  title: 'Packing the context window: reserve, budget, trim, order',
  blurb:
    'Take the lesson’s 92K-token support copilot and fit it into a window: reserve the output first, then trim least-loss first (project the tool JSON, route tools, summarise old turns, rerank docs) until it fits, with system rules and the question pinned. Change the window and the reserve and see what has to go.',
  placements: [{ topic: 'context-engineering', heading: 'Context Engineering' }],
};
