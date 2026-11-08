import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'indirect-injection',
  title: 'Indirect injection: follow the poisoned email',
  blurb:
    'A planted email is retrieved for a normal question, steers the model into a tool call and hides the result in an image URL the client loads. Switch on content isolation, a tool allow-list or URL filtering, predict where the attack stops, then run it.',
  placements: [{ topic: 'ai-security-injection', heading: 'Prompt Injection' }],
};
