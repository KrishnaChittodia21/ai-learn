import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'self-consistency-vote',
  title: 'Self-consistency: N reasoning paths, one majority vote',
  blurb:
    'Sample the same chain-of-thought prompt N times, watch the paths disagree, predict which answer wins the vote, then see a tie turn into an abstain and an open-ended task where voting has nothing to count. The cost counter grows with every sample.',
  placements: [{ topic: 'prompt-reasoning', heading: 'Self-consistency' }],
};
