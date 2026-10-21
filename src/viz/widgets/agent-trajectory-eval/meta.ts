import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'agent-trajectory-eval',
  title: 'Grading an agent run: outcome vs trajectory',
  blurb:
    'Step through a refund agent’s trajectory (thought → tool call → observation) while a grader marks every call: right tool, wrong arguments, redundant, or an unsafe action the harness blocked. Then compare an outcome-only grade with a trajectory-aware one on the same run.',
  placements: [{ topic: 'agent-evaluation-safety', heading: 'Evaluating agents' }],
};
