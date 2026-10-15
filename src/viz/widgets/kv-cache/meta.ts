import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'kv-cache',
  title: 'KV cache: linear decode instead of quadratic, paid for in memory',
  blurb:
    'Generate tokens with and without a KV cache and watch recomputation pile up, compute the cache size from layers × KV heads × head_dim for real model presets, scale it to long contexts, and reuse a shared prompt prefix.',
  placements: [{ topic: 'inference-optimization', heading: 'KV Cache' }],
};
