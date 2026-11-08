// M8 widget: supervisor vs handoff (swarm) multi-agent run (src/viz/widgets/supervisor-handoff/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_HANDOFFS, RETURN_K, LEAD_START_K, WORKER_K, multiTotalK, nextAgent, simulate, singleTotalK, type Params } from '../src/viz/widgets/supervisor-handoff/sim.ts';

const ALL: Params[] = [2, 3, 4].map((workers) => ({ pattern: 'supervisor' as const, workers })).concat([
  { pattern: 'handoff', workers: 4 },
  { pattern: 'pingpong', workers: 4 },
]);

test('deterministic, captions non-empty, final frame is the recap', () => {
  for (const p of ALL) {
    const a = simulate(p);
    assert.deepEqual(a, simulate(p));
    for (const f of a) assert.ok(f.caption.trim().length > 20);
    assert.equal(a.at(-1)!.stage, 'recap');
  }
});

test('supervisor: workers fill their own windows, the lead only grows by the summaries', () => {
  for (const n of [2, 3, 4]) {
    const frames = simulate({ pattern: 'supervisor', workers: n });
    const last = frames.at(-1)!;
    assert.equal(last.agents.length, n + 1);
    assert.ok(last.agents.slice(1).every((a) => a.ctxK === WORKER_K && a.state === 'done'));
    assert.equal(last.agents[0].ctxK, LEAD_START_K + n * RETURN_K);
    assert.equal(last.tokensK, multiTotalK(n));
    assert.equal(last.outcome, 'answered');
    const ret = frames.find((f) => f.stage === 'return')!;
    assert.equal(ret.arrows.length, n);
    assert.ok(ret.arrows.every((a) => a.to === 'lead' && a.kind === 'return'));
  }
});

test("supervisor matches the lesson's example for 4 companies (270K vs 180K, lead ~12K)", () => {
  assert.equal(multiTotalK(4), 270);
  assert.equal(singleTotalK(4), 180);
  assert.equal(simulate({ pattern: 'supervisor', workers: 4 }).at(-1)!.agents[0].ctxK, 12);
});

test('worker count is clamped to 2..4', () => {
  assert.equal(simulate({ pattern: 'supervisor', workers: 9 }).at(-1)!.agents.length, 5);
  assert.equal(simulate({ pattern: 'supervisor', workers: 0 }).at(-1)!.agents.length, 3);
});

test('handoff guard (lesson exercise): unknown stays, ping-pong and the budget route to human', () => {
  const s0 = { active: 'triage', handoffs: 0, history: ['triage'] };
  assert.equal(nextAgent(s0, 'sales'), s0);
  assert.equal(nextAgent(s0, 'triage'), s0);
  assert.deepEqual(nextAgent(s0, 'billing'), { active: 'billing', handoffs: 1, history: ['triage', 'billing'] });
  const pp = { active: 'billing', handoffs: 3, history: ['triage', 'billing', 'tech', 'billing'] };
  assert.equal(nextAgent(pp, 'tech').active, 'human');
  const full = { active: 'tech', handoffs: MAX_HANDOFFS, history: ['a', 'b', 'c', 'd', 'tech'] };
  assert.equal(nextAgent(full, 'billing').active, 'human');
});

test('clean handoff resolves; ping-pong ends with a human after the guard', () => {
  const h = simulate({ pattern: 'handoff', workers: 4 }).at(-1)!;
  assert.equal(h.outcome, 'answered');
  assert.deepEqual(h.history, ['triage', 'billing', 'tech']);
  const pp = simulate({ pattern: 'pingpong', workers: 4 });
  assert.equal(pp.at(-1)!.outcome, 'human');
  assert.equal(pp.at(-1)!.history.at(-1), 'human');
  assert.equal(pp.at(-1)!.handoffs, 4);
  const guard = pp.findIndex((f) => f.stage === 'guard');
  assert.ok(guard > 0 && pp[guard].outcome === 'running' && pp[guard + 1].owner === 'human');
});

test('exactly one agent owns the turn in a swarm, and it is the latest in history', () => {
  for (const pattern of ['handoff', 'pingpong'] as const) {
    for (const f of simulate({ pattern, workers: 4 })) {
      assert.equal(f.agents.filter((a) => a.state === 'active').length, 1);
      assert.equal(f.owner, f.history.at(-1));
    }
  }
});

test('Your turn: present in every pattern, exactly one correct option', () => {
  for (const p of ALL) {
    const turns = simulate(p).flatMap((f) => (f.yourTurn ? [f.yourTurn] : []));
    assert.equal(turns.length, 1, p.pattern);
    assert.equal(turns[0].options.filter((o) => o.correct).length, 1);
  }
});
