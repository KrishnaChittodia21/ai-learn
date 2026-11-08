import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'llm-streaming',
  title: 'Streaming: time to first token vs total latency',
  blurb:
    'Send the same request streamed and not streamed. Predict when the first word appears, watch SSE deltas fill the screen, and see what happens to the bill when the user closes the tab with and without an upstream abort.',
  placements: [{ topic: 'llm-apis-streaming', heading: 'Streaming Responses' }],
};
