import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'next-token-sampler',
  title: 'How an LLM picks the next token: logits → softmax → sample',
  blurb:
    'Predict the next token, watch one being chosen, then turn the dials every API exposes. Temperature reshapes the odds; top-k and top-p cut the long tail; a random draw does the rest.',
  placements: [{ topic: 'genai-fundamentals', heading: 'LLM Fundamentals' }],
};
