import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'claim-check',
  title: 'Claim check: split the answer, stamp every claim',
  blurb:
    'An answer is split into atomic claims and each one is checked against the source: SUPPORTED (with the evidence span highlighted), CONTRADICTED or NOT FOUND. Predict each stamp before it lands and watch the faithfulness score move. Compare a faithful answer, a wrong number and an invented extra fact.',
  placements: [{ topic: 'groundedness-hallucinations', heading: 'Faithfulness and Groundedness' }],
};
