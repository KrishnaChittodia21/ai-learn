import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'query-transform',
  title: 'HyDE vs multi-query: two ways to rewrite before you retrieve',
  blurb:
    'HyDE embeds a made-up answer instead of the question; multi-query searches several phrasings and fuses them with RRF. Predict which vector finds the policy and which document wins the fusion, then tune RRF’s k.',
  placements: [{ topic: 'query-transformation', heading: 'HyDE' }],
};
