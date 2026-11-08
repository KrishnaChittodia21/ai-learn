import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'span-tree',
  title: 'Span tree: where did the time and money go?',
  blurb:
    'One request becomes a root span with child spans for retrieval, LLM calls, tools and guardrails, drawn as a waterfall. Step through it, slow the tool down, then find the most expensive span before the costs are revealed.',
  placements: [{ topic: 'observability', heading: 'Tracing and Logging' }],
};
