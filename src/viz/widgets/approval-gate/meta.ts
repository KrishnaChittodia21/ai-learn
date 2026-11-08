import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'approval-gate',
  title: 'Approval gate: pause, decide, resume',
  blurb:
    'A refund agent proposes issue_refund. Small amounts pass the risk gate; larger ones interrupt, save a checkpoint and wait. Be the reviewer: approve, edit, reject or let it time out, then watch Command({ resume }) re-run the gate and the run end in a refund, a rejection or an escalation.',
  placements: [{ topic: 'hitl-state-machines', heading: 'Human-in-the-Loop' }],
};
