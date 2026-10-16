import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'speculative-decoding',
  title: 'Speculative decoding: draft k tokens cheaply, verify them in one target pass',
  blurb:
    'A small draft model proposes k tokens; the big target model scores all of them in one forward pass and keeps the longest accepted prefix (accept with probability min(1, p_target/p_draft), resample a rejection from the residual, bonus token when all pass). Change k, draft quality and draft cost and watch tokens per pass and speed-up, and check that the output distribution is exactly the target\'s.',
  placements: [{ topic: 'inference-optimization', heading: 'Speculative Decoding' }],
};
