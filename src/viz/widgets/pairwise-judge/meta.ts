import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'pairwise-judge',
  title: 'Pairwise LLM judge: swap the order, catch position bias',
  blurb:
    'A judge compares prompt v12 (A) and v13 (B) on 8 inputs, once with A first and once with B first. Tune how much it favours the answer shown first, decide what to record when the verdict flips, and compare the naive single-order tally with the consistent one.',
  placements: [{ topic: 'llm-evaluation', heading: 'LLM-as-a-Judge' }],
};
