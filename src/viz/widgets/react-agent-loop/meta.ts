import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'react-agent-loop',
  title: 'The ReAct loop: Thought → Action → Observation',
  blurb:
    'Step through an agent solving a task with tools, see a tool error come back as an observation and get recovered from, watch the prompt grow every step, and trip the max-steps guard on a task that cannot be solved.',
  placements: [{ topic: 'agent-fundamentals', heading: 'ReAct' }],
};
