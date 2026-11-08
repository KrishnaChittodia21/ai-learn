// M8 widget: pairwise LLM judge with order swap (src/viz/widgets/pairwise-judge/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEMS, combine, judge, simulate, winRateB } from '../src/viz/widgets/pairwise-judge/sim.ts';

const BIASES = [0, 0.5, 1, 1.5, 2, 2.5, 3];

test('deterministic, captions non-empty, final frame is the recap', () => {
  for (const bias of BIASES) {
    const a = simulate({ bias });
    assert.deepEqual(a, simulate({ bias }));
    for (const f of a) assert.ok(f.caption.trim().length > 20);
    assert.equal(a.at(-1)!.stage, 'recap');
  }
});

test('lesson rule: win only when both orders agree, otherwise tie', () => {
  assert.equal(combine('A', 'A'), 'A');
  assert.equal(combine('B', 'B'), 'B');
  assert.equal(combine('A', 'B'), 'tie');
  assert.equal(combine('A', 'tie'), 'tie');
  assert.equal(combine('tie', 'tie'), 'tie');
});

test('the bias favours whichever answer is shown first', () => {
  assert.equal(judge(0, 'A', 2), 'A');
  assert.equal(judge(0, 'B', 2), 'B');
  assert.equal(judge(0, 'A', 0), 'tie');
  assert.equal(judge(3, 'A', 0), 'B');
});

test('no bias → no flips, and recorded verdicts follow true quality', () => {
  const last = simulate({ bias: 0 }).at(-1)!;
  assert.equal(last.flips, 0);
  assert.deepEqual(last.naive, last.consistent);
  for (const r of last.rows) assert.equal(r.final, r.gap > 0.5 ? 'B' : r.gap < -0.5 ? 'A' : 'tie');
});

test('more bias → at least as many flips and ties; naive run drifts towards A (always first)', () => {
  const lasts = BIASES.map((bias) => simulate({ bias }).at(-1)!);
  for (let i = 1; i < lasts.length; i++) {
    assert.ok(lasts[i].flips >= lasts[i - 1].flips);
    assert.ok(lasts[i].consistent.tie >= lasts[i - 1].consistent.tie);
    assert.ok(lasts[i].naive.A >= lasts[i - 1].naive.A);
  }
  assert.ok(lasts.at(-1)!.flips > 0);
});

test('final frame: every pair judged twice, tallies add up, win rate formula', () => {
  for (const bias of BIASES) {
    const last = simulate({ bias }).at(-1)!;
    assert.equal(last.judgeCalls, 2 * ITEMS.length);
    assert.ok(last.rows.every((r) => r.v1 && r.v2 && r.final === combine(r.v1, r.v2)));
    const c = last.consistent;
    assert.equal(c.A + c.B + c.tie, ITEMS.length);
    assert.equal(winRateB(c), (c.B + 0.5 * c.tie) / ITEMS.length);
    assert.equal(last.flips, last.rows.filter((r) => r.v1 !== r.v2).length);
  }
});

test('Your turn: one per run, on a flipping pair when there is one, answer = combine()', () => {
  for (const bias of BIASES) {
    const frames = simulate({ bias });
    const t = frames.filter((f) => f.yourTurn);
    assert.equal(t.length, 1);
    const f = t[0];
    const row = f.rows[f.item];
    assert.equal(row.final, null, 'not recorded before the learner answers');
    const correct = f.yourTurn!.options.filter((o) => o.correct);
    assert.equal(correct.length, 1);
    assert.equal(correct[0].text.toLowerCase(), combine(row.v1!, row.v2!) === 'tie' ? 'tie' : `${combine(row.v1!, row.v2!).toLowerCase()} wins`);
    if (frames.at(-1)!.flips > 0) assert.notEqual(row.v1, row.v2);
  }
});
