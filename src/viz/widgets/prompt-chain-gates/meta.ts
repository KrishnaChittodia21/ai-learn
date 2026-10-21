import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'prompt-chain-gates',
  title: 'A prompt chain: extract → validate → write',
  blurb:
    'Follow an invoice email through a three-step chain. The extract prompt must return JSON that matches a contract; a code gate checks it, feeds the exact error back for one retry, and only valid data ever reaches the write prompt. Try a clean run, a retry and a hard failure.',
  placements: [{ topic: 'prompt-reasoning', heading: 'Prompt chaining' }],
};
