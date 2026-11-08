// Pure, deterministic approval-gate state machine (no React, Node-testable).
// The lesson's refund agent: refunds ≤ $50 auto-approve; above that the gate node calls interrupt(), a checkpoint is
// saved and a reviewer decides approve / edit / reject. Command({ resume }) re-runs the gate node from its first line.
// No answer before the SLA → a sweeper resumes with { type: 'timeout' } → escalate to a second reviewer → auto-reject.
import type { BaseFrame } from '../../core';

export type Decision = 'approve' | 'edit' | 'reject' | 'timeout';

export interface Params {
  /** refund the agent proposes, $ */
  amount: number;
  decision: Decision;
}

export const DEFAULT_PARAMS: Params = { amount: 249, decision: 'edit' };
export const AUTO_LIMIT = 50;
/** what the customer actually paid for the item (shipping is non-refundable) */
export const ORDER_TOTAL = 219;
export const MIN_AMOUNT = 20;
export const MAX_AMOUNT = 400;
export const SLA_HOURS = 2;
export const ORDER_ID = 'A-1932';
export const THREAD_ID = 'refund-A-1932';

export type StateId = 'PROPOSED' | 'RISK_GATE' | 'PENDING' | 'APPROVED' | 'EDITED' | 'REJECTED' | 'TIMED_OUT' | 'ESCALATED' | 'AUTO_REJECTED' | 'EXECUTED' | 'AGENT';

export const DECISION_STATE: Record<Decision, StateId> = { approve: 'APPROVED', edit: 'EDITED', reject: 'REJECTED', timeout: 'TIMED_OUT' };

export interface Frame extends BaseFrame {
  state: StateId;
  /** states visited so far, in order */
  trail: StateId[];
  /** run is paused at interrupt() with a saved checkpoint */
  paused: boolean;
  /** amount that will actually be refunded (null until decided) */
  refund: number | null;
  /** hours since the interrupt */
  waited: number;
  done: boolean;
}

/** what a careful reviewer should do with this proposal (used by the Your-turn step) */
export function bestDecision(amount: number): Decision {
  return amount > ORDER_TOTAL ? 'edit' : 'approve';
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function simulate(p: Params): Frame[] {
  const amount = Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, Math.round(p.amount)));
  const frames: Frame[] = [];
  const trail: StateId[] = [];
  let waited = 0;
  let refund: number | null = null;
  const go = (state: StateId, caption: string, extra: Partial<Frame> = {}) => {
    trail.push(state);
    frames.push({ state, trail: [...trail], paused: false, refund, waited, done: false, caption, ...extra });
  };

  go('PROPOSED', `User: "Refund my order #${ORDER_ID}, the blender arrived broken." The agent proposes issue_refund({ orderId: '${ORDER_ID}', amount: ${amount} }).`, {
    predict: `Policy: refunds ≤ $${AUTO_LIMIT} auto-approve. Will this one pause for a human?`,
  });

  if (amount <= AUTO_LIMIT) {
    go('RISK_GATE', `Risk gate: ${money(amount)} ≤ $${AUTO_LIMIT}, low risk. No interrupt: gating every small refund would train reviewers to click "approve" blindly.`);
    refund = amount;
    go('EXECUTED', `execute: issue_refund runs once with idempotency key "${THREAD_ID}:refund". ${money(amount)} refunded, no human involved.`, { refund, done: true });
    return frames;
  }

  go('RISK_GATE', `Risk gate: ${money(amount)} > $${AUTO_LIMIT}, so the gate node calls interrupt({ action: 'issue_refund', args, reason: 'amount over $${AUTO_LIMIT}' }).`);
  go(
    'PENDING',
    `Paused. A checkpoint is saved for thread "${THREAD_ID}" and the API returns __interrupt__. A pending row with an SLA of ${SLA_HOURS} h feeds the reviewer queue. The run can wait minutes or days.`,
    { paused: true },
  );

  const d = p.decision;
  const resume = (t: string) => `invoke(new Command({ resume: ${t} }), { thread_id: '${THREAD_ID}' }): the gate node re-runs from its first line and interrupt() now returns the decision.`;
  if (d === 'approve') {
    waited = 0.05;
    refund = amount;
    go('APPROVED', `The reviewer approves. ${resume("{ type: 'approve' }")}`, { refund });
  } else if (d === 'edit') {
    waited = 0.05;
    refund = Math.min(amount, ORDER_TOTAL);
    go(
      'EDITED',
      `The reviewer sees the order total was ${money(ORDER_TOTAL)} and edits the args to ${money(refund)}${refund === amount ? ' (the same amount: an edit that changes nothing is an approve)' : ''}. ${resume(`{ type: 'edit', args: { amount: ${refund} } }`)}`,
      { refund },
    );
  } else if (d === 'reject') {
    waited = 0.05;
    go('REJECTED', `The reviewer rejects with a reason. ${resume("{ type: 'reject', reason }")} Nothing is refunded.`);
    go('AGENT', 'Reject routes back to the agent with the feedback, so it can explain or propose something else. No side effect ran.', { done: true });
  } else {
    waited = SLA_HOURS;
    go('TIMED_OUT', `${SLA_HOURS} h pass with no answer. Without an SLA the run would stall forever; the sweeper resumes it with { type: 'timeout' }.`);
    waited = SLA_HOURS * 2;
    go('ESCALATED', `The graph maps timeout to escalate: the approval moves to a second reviewer's queue with a new ${SLA_HOURS} h SLA.`, { paused: true });
    go('AUTO_REJECTED', 'The second SLA also passes: auto-reject with a message to the customer. A clear "no" beats a run stuck forever.', { done: true });
  }

  if (d === 'approve' || d === 'edit') {
    go(
      'EXECUTED',
      `execute: issue_refund({ orderId: '${ORDER_ID}', amount: ${refund} }) with idempotency key "${THREAD_ID}:refund", so a retry can't pay twice. Audit log: { proposed: ${amount}, approved: ${refund} }.`,
      { done: true },
    );
  }

  const last = frames[frames.length - 1];
  frames.push({
    ...last,
    predict: undefined,
    caption:
      last.state === 'EXECUTED'
        ? `Done: ${money(last.refund!)} refunded${last.refund !== amount ? ` instead of ${money(amount)}` : ''}. Edit and reject rates are the evidence that the gate earns its cost.`
        : last.state === 'AGENT'
          ? 'Done: rejected, nothing refunded, the agent has the reason. Gate by risk tier, measure edit / reject rates, and add timeouts.'
          : 'Done: escalated, then auto-rejected after both SLAs. The timeout path is what keeps a durable approval from waiting forever.',
  });
  return frames;
}
