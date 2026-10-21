import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'react-prompt-trace',
  title: 'ReAct as a prompt: who writes each line, and what stops it',
  blurb:
    'Watch a ReAct prompt grow line by line: the model writes Thought and Action, generation halts at the "Observation:" stop sequence, the runtime pastes in the tool result, and three stop checks run after every step: a Final Answer, the step limit, and a repeated action.',
  placements: [{ topic: 'prompt-reasoning', heading: 'ReAct prompting' }],
};
