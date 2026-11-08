// M8 widget: context window budget (src/viz/widgets/context-budget/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAYOUT, WINDOWS_K, simulate, type Params } from '../src/viz/widgets/context-budget/sim.ts';

const ALL: Params[] = WINDOWS_K.flatMap((windowK) => [2, 4, 8].map((reserveK) => ({ windowK, reserveK })));

test('deterministic, captions non-empty, final frame is the layout', () => {
  for (const p of ALL) {
    const a = simulate(p);
    assert.deepEqual(a, simulate(p));
    for (const f of a) assert.ok(f.caption.trim().length > 20);
    assert.equal(a.at(-1)!.stage, 'layout');
  }
});

test("raw demand matches the lesson's 92K example (+ small pinned slots)", () => {
  const big = simulate({ windowK: 128, reserveK: 4 })[0].slots.filter((s) => !s.pinned);
  assert.equal(big.reduce((a, s) => a + s.tokensK, 0), 92);
});

test('reserve comes first; the final input always fits the budget for these windows', () => {
  for (const p of ALL) {
    const frames = simulate(p);
    assert.equal(frames[0].reserveK, 0);
    assert.equal(frames[1].stage, 'reserve');
    const last = frames.at(-1)!;
    assert.equal(last.budgetK, p.windowK - p.reserveK);
    assert.ok(last.fits && last.inputK <= last.budgetK, `${p.windowK}/${p.reserveK}`);
  }
});

test('pinned slots are never trimmed and slot order stays the layout order', () => {
  for (const p of ALL) {
    for (const f of simulate(p)) {
      assert.deepEqual(f.slots.map((s) => s.id), LAYOUT.map((s) => s.id));
      for (const s of f.slots.filter((x) => x.pinned)) assert.equal(s.trimmed, false);
    }
  }
});

test('input never grows, and trimming stops as soon as it fits', () => {
  for (const p of ALL) {
    const frames = simulate(p);
    for (let i = 1; i < frames.length; i++) assert.ok(frames[i].inputK <= frames[i - 1].inputK);
    const trims = frames.filter((f) => f.stage === 'trim');
    trims.slice(0, -1).forEach((f) => assert.equal(f.fits, false));
  }
});

test('smaller window or bigger reserve → at least as many trims', () => {
  const trims = (p: Params) => simulate(p).at(-1)!.trimsApplied;
  assert.equal(trims({ windowK: 128, reserveK: 8 }), 0);
  assert.equal(trims({ windowK: 32, reserveK: 4 }), 4);
  assert.equal(trims({ windowK: 16, reserveK: 2 }), 4);
  assert.equal(trims({ windowK: 16, reserveK: 8 }), 6);
  for (const reserveK of [2, 4, 8]) {
    const counts = WINDOWS_K.map((windowK) => trims({ windowK, reserveK }));
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
  }
  assert.ok(trims({ windowK: 16, reserveK: 8 }) >= trims({ windowK: 16, reserveK: 2 }));
});

test('first trim is the least-loss one (tool-result JSON projection)', () => {
  const t = simulate({ windowK: 64, reserveK: 4 }).find((f) => f.stage === 'trim')!;
  assert.equal(t.focus, 'toolResults');
});

test('Your turn on the reserve frame, exactly one correct option, question depends on fit', () => {
  for (const p of ALL) {
    const turns = simulate(p).filter((f) => f.yourTurn);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].stage, 'reserve');
    assert.equal(turns[0].yourTurn!.options.filter((o) => o.correct).length, 1);
  }
  assert.match(simulate({ windowK: 128, reserveK: 4 })[1].yourTurn!.question, /fits/);
  assert.match(simulate({ windowK: 32, reserveK: 4 })[1].yourTurn!.question, /over budget/);
});
