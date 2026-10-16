import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'tool-calling-roundtrip',
  title: 'A tool call, round trip: model ↔ your code ↔ tool',
  blurb:
    'Step through the messages that flow when a model calls a tool: schemas out, a call with an id back, argument validation, execution, a result with the matching id, and the final answer. Try parallel calls, a schema violation the model recovers from, the max-iterations guard, and strict structured output with no tools at all.',
  placements: [
    { topic: 'structured-outputs-tools', heading: 'Tool Calling' },
    { topic: 'structured-outputs-tools', heading: 'Function Calling' },
    { topic: 'structured-outputs-tools', heading: 'Structured Outputs' },
  ],
};
