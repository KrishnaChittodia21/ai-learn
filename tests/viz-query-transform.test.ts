// M8 widget: HyDE vs multi-query (src/viz/widgets/query-transform/sim.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PARAMS, HYDE, MULTI, fuse, rrf, simulate } from '../src/viz/widgets/query-transform/sim.ts';

test('deterministic and captioned in both modes, one turn each', () => {
  for (const mode of ['hyde', 'multi'] as const) {
    const a = simulate({ ...DEFAULT_PARAMS, mode });
    assert.deepEqual(a, simulate({ ...DEFAULT_PARAMS, mode }));
    for (const f of a) assert.ok(f.caption.trim().length > 20, `${mode} ${f.stage}`);
    assert.equal(a.filter((f) => f.turn).length, 1);
  }
});

test('RRF with k = 60 reproduces the lesson table (0.0640 / 0.0318 / 0.0164)', () => {
  const { scores, order } = fuse(60);
  assert.deepEqual(scores.map((s) => s.toFixed(4)), ['0.0640', '0.0318', '0.0164']);
  assert.deepEqual(order, [0, 1, 2]);
  assert.equal(rrf([null, null], 60), 0);
});

test('the original query alone ranks the laptop FAQ first; fusion fixes it for any k', () => {
  assert.equal(fuse(60, 1).order[0], 2);
  for (let k = 1; k <= 100; k++) assert.equal(fuse(k).order[0], 0);
  // smaller k spreads scores further apart
  assert.ok(fuse(1).scores[0] - fuse(1).scores[2] > fuse(60).scores[0] - fuse(60).scores[2]);
});

test('multi frames reveal lists one by one and end fused', () => {
  const a = simulate({ mode: 'multi', rrfK: 60 });
  const lists = a.map((f) => f.lists);
  for (let i = 1; i < lists.length; i++) assert.ok(lists[i] >= lists[i - 1]);
  const t = a.findIndex((f) => f.turn === 'multi-top');
  assert.equal(a[t].fused, null);
  assert.equal(a[t].lists, MULTI.variants.length + 1);
  assert.deepEqual(a.at(-1)!.fused, fuse(60));
  assert.ok(simulate({ mode: 'multi', rrfK: 5 }).some((f) => f.caption.includes('k = 5')));
});

test('HyDE: passage is shown before its vector, turn comes before the reveal, final rank is #1', () => {
  const a = simulate({ ...DEFAULT_PARAMS, mode: 'hyde' });
  const t = a.findIndex((f) => f.turn === 'hyde-pick');
  assert.ok(a[t].passage);
  assert.equal(a[t].vectors, 1);
  assert.equal(a.at(-1)!.vectors, 3);
  assert.ok(HYDE.vectors[1].rank < HYDE.vectors[0].rank && HYDE.vectors[1].cos > HYDE.vectors[0].cos);
  assert.ok(HYDE.passage.includes('5 to 10') && HYDE.truth.includes('5–7'));
});
