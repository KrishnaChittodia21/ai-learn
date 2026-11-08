// M8 widget: next-token sampler (src/viz/widgets/next-token-sampler/sim.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PARAMS, PROMPTS, STAGES, TUNE_TARGET, distribution, drawIndex, drawMany, simulate } from '../src/viz/widgets/next-token-sampler/sim.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('deterministic, one frame per stage, captions non-empty', () => {
  const a = simulate(DEFAULT_PARAMS);
  assert.deepEqual(a, simulate(DEFAULT_PARAMS));
  assert.deepEqual(a.map((f) => f.stage), STAGES);
  for (const f of a) assert.ok(f.caption.trim().length > 20, f.stage);
});

test('softmax sums to 1, renormalised survivors sum to 1, cut tokens get 0', () => {
  for (const p of ['fact', 'story'] as const)
    for (const T of [0.1, 0.5, 1, 2])
      for (const k of [1, 3, 8])
        for (const tp of [0.05, 0.5, 0.9, 1]) {
          const d = distribution(p, T, k, tp);
          assert.ok(Math.abs(sum(d.prob) - 1) < 1e-9);
          assert.ok(Math.abs(sum(d.renorm) - 1) < 1e-9);
          assert.equal(d.n, Math.min(d.nK, d.nP));
          assert.ok(d.n >= 1);
          d.renorm.forEach((x, i) => (i >= d.n ? assert.equal(x, 0) : assert.ok(x > 0)));
          // top-p keeps the smallest prefix reaching p
          assert.ok(sum(d.prob.slice(0, d.nP)) >= Math.min(tp, 1) - 1e-9);
          if (d.nP > 1) assert.ok(sum(d.prob.slice(0, d.nP - 1)) < tp);
        }
});

test('temperature: lower T sharpens, higher T flattens, T = 1 keeps logits', () => {
  const t1 = distribution('fact', 1, 8, 1);
  assert.deepEqual(t1.scaled, PROMPTS.fact.cands.map((c) => c.logit));
  assert.ok(distribution('fact', 0.3, 8, 1).prob[0] > 0.98);
  assert.ok(distribution('fact', 2, 8, 1).prob[0] < t1.prob[0]);
  assert.ok(distribution('fact', 2, 8, 1).prob[7] > t1.prob[7]);
});

test('top-k = 1 is greedy: every draw is the favourite', () => {
  const d = distribution('fact', 2, 1, 1);
  assert.equal(d.n, 1);
  assert.deepEqual(new Set(drawMany(d, 5, 50)), new Set([0]));
});

test('draw lands on the cumulative bar segment containing r', () => {
  const d = distribution('fact', 1, 8, 1);
  assert.equal(drawIndex(d, 0), 0);
  assert.equal(drawIndex(d, d.renorm[0] - 1e-9), 0);
  assert.equal(drawIndex(d, d.renorm[0] + 1e-9), 1);
  assert.equal(drawIndex(d, 0.999999999), d.n - 1);
});

test('final frame: picked token, seed changes the roll, turns only on the factual prompt', () => {
  const fr = simulate(DEFAULT_PARAMS);
  const last = fr[fr.length - 1];
  assert.equal(last.pick, drawIndex(last.dist, last.r));
  assert.ok(last.r >= 0 && last.r < 1);
  assert.equal(fr[0].turn, 'predict');
  assert.equal(last.turn, 'tune');
  const rs = new Set(Array.from({ length: 6 }, (_, s) => simulate({ ...DEFAULT_PARAMS, seed: s }).at(-1)!.r));
  assert.ok(rs.size > 1);
  assert.ok(simulate({ ...DEFAULT_PARAMS, prompt: 'story' }).every((f) => !f.turn));
});

test('tune turn: default dials miss the target, T = 0.3 (the shown answer) meets it', () => {
  assert.ok(distribution('fact', 1, 8, 0.9).renorm[0] < TUNE_TARGET);
  assert.ok(distribution('fact', 0.3, 8, 0.9).renorm[0] >= TUNE_TARGET);
});
