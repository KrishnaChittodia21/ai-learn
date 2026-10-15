import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'hub-and-spoke',
  title: 'Hub-and-spoke: routing, policy, fallbacks and the hub bottleneck',
  blurb:
    'Send a request through a central hub that checks policy, routes to a RAG, SQL or code agent and falls back when a spoke fails behind a circuit breaker, then ramp up load and watch the shared hub become the bottleneck.',
  placements: [
    { topic: 'ai-architecture-patterns', heading: 'Hub-and-Spoke Architecture' },
    { topic: 'ai-architecture-patterns', heading: 'Router Pattern' },
  ],
};
