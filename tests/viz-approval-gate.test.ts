// M8 widget: approval-gate state machine (src/viz/widgets/approval-gate/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTO_LIMIT, DEFAULT_PARAMS, ORDER_TOTAL, bestDecision, simulate, type Decision, type Params } from '../src/viz/widgets/approval-gate/sim.ts';

const decisions: Decision[] = ['approve', 'edit', 'reject', 'timeout'];
const states = (p: Params) => simulate(p).at(-1)!.trail;

test('deterministic and every caption is non-empty', () => {
  for (const amount of [20, 50, 51, 120, 249, 400])
    for (const decision of decisions) {
      const p = { amount, decision };
      assert.deepEqual(simulate(p), simulate(p));
      for (const f of simulate(p)) assert.ok(f.caption.trim().length > 20, f.caption);
    }
});

test('≤ $50 never interrupts, whatever the reviewer would do', () => {
  for (const decision of decisions) {
    const frames = simulate({ amount: AUTO_LIMIT, decision });
    assert.deepEqual(frames.at(-1)!.trail, ['PROPOSED', 'RISK_GATE', 'EXECUTED']);
    assert.ok(frames.every((f) => !f.paused));
    assert.equal(frames.at(-1)!.refund, AUTO_LIMIT);
  }
});

test('above $50 the run pauses at PENDING, then each decision takes its own branch', () => {
  assert.deepEqual(states({ amount: 249, decision: 'approve' }), ['PROPOSED', 'RISK_GATE', 'PENDING', 'APPROVED', 'EXECUTED']);
  assert.deepEqual(states({ amount: 249, decision: 'edit' }), ['PROPOSED', 'RISK_GATE', 'PENDING', 'EDITED', 'EXECUTED']);
  assert.deepEqual(states({ amount: 249, decision: 'reject' }), ['PROPOSED', 'RISK_GATE', 'PENDING', 'REJECTED', 'AGENT']);
  assert.deepEqual(states({ amount: 249, decision: 'timeout' }), ['PROPOSED', 'RISK_GATE', 'PENDING', 'TIMED_OUT', 'ESCALATED', 'AUTO_REJECTED']);
  for (const decision of decisions) {
    const frames = simulate({ amount: 249, decision });
    assert.equal(frames.filter((f) => f.state === 'PENDING').length, 1, 'exactly one Your-turn frame');
    assert.equal(frames[2].state, 'PENDING', 'PENDING sits at the same index for every decision (the widget resumes there)');
    assert.ok(frames[2].paused);
  }
});

test('refund amounts: edit caps at the order total; reject and timeout refund nothing', () => {
  assert.equal(simulate({ amount: 249, decision: 'approve' }).at(-1)!.refund, 249);
  assert.equal(simulate({ amount: 249, decision: 'edit' }).at(-1)!.refund, ORDER_TOTAL);
  assert.equal(simulate({ amount: 120, decision: 'edit' }).at(-1)!.refund, 120);
  assert.equal(simulate({ amount: 249, decision: 'reject' }).at(-1)!.refund, null);
  assert.equal(simulate({ amount: 249, decision: 'timeout' }).at(-1)!.refund, null);
  assert.equal(simulate({ amount: 249, decision: 'timeout' }).at(-1)!.waited, 4, 'two SLAs of 2 h');
});

test('best reviewer decision and the final frame', () => {
  assert.equal(bestDecision(249), 'edit');
  assert.equal(bestDecision(ORDER_TOTAL), 'approve');
  assert.equal(bestDecision(120), 'approve');
  const last = simulate(DEFAULT_PARAMS).at(-1)!;
  assert.ok(last.done);
  assert.equal(last.state, 'EXECUTED');
  assert.match(last.caption, /\$219\.00 refunded instead of \$249\.00/);
  // trails only ever grow
  for (const decision of decisions) {
    const frames = simulate({ amount: 249, decision });
    for (let i = 1; i < frames.length; i++) assert.ok(frames[i].trail.length >= frames[i - 1].trail.length);
  }
});
