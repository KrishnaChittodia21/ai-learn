// M8 widget: vector index chooser (src/viz/widgets/vector-index-choice/sim.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PARAMS, D_OPTIONS, M_OPTIONS, N_OPTIONS, RAM_OPTIONS, choose, linksGB, rawGB, rows, simulate } from '../src/viz/widgets/vector-index-choice/sim.ts';

test('deterministic, captions non-empty, one turn before the verdict', () => {
  const a = simulate(DEFAULT_PARAMS);
  assert.deepEqual(a, simulate(DEFAULT_PARAMS));
  for (const f of a) assert.ok(f.caption.trim().length > 20, f.stage);
  const t = a.findIndex((f) => f.turn === 'choose');
  assert.ok(t > 0);
  assert.equal(a[t].verdict, null);
  assert.ok(a[t + 1].verdict);
  assert.equal(a.filter((f) => f.turn).length, 1);
});

test('matches the lesson example: 5M × 1,536 float32 ≈ 30.7 GB + 1.28 GB links (M 16) → HNSW on 64 GB', () => {
  assert.ok(Math.abs(rawGB(5e6, 1536, 4) - 30.72) < 1e-9);
  assert.ok(Math.abs(linksGB(5e6, 16) - 1.28) < 1e-9);
  const r = rows(DEFAULT_PARAMS);
  assert.ok(Math.abs(r.find((x) => x.id === 'halfvec')!.ramGB - 16.64) < 1e-9); // lesson: ≈ 17 GB
  assert.equal(choose(DEFAULT_PARAMS).pick, 'hnsw');
});

test('memory ordering: float32 ≥ halfvec ≥ int8 ≥ binary; more M = more links', () => {
  for (const n of N_OPTIONS)
    for (const dims of D_OPTIONS) {
      const r = rows({ n, dims, M: 16, ramGB: 64 });
      const g = (id: string) => r.find((x) => x.id === id)!.ramGB;
      assert.ok(g('hnsw') > g('halfvec') && g('halfvec') > g('int8') && g('int8') > g('binary'));
      assert.ok(g('hnsw') > g('flat'));
    }
  assert.ok(linksGB(1e6, 32) > linksGB(1e6, 8));
});

test('verdict rules: small → flat; shrinking RAM never picks a bigger index; >2,000 dims skips float32', () => {
  const rank = { flat: 0, hnsw: 1, halfvec: 2, quantized: 3, diskann: 4 } as const;
  assert.equal(choose({ ...DEFAULT_PARAMS, n: 50_000 }).pick, 'flat');
  for (const n of N_OPTIONS.filter((x) => x >= 100_000))
    for (const dims of D_OPTIONS)
      for (const M of M_OPTIONS) {
        let prev = -1;
        for (const ramGB of [...RAM_OPTIONS].reverse()) {
          const v = choose({ n, dims, M, ramGB });
          assert.ok(rank[v.pick] >= prev);
          prev = rank[v.pick];
          if (v.row) assert.ok(rows({ n, dims, M, ramGB }).find((r) => r.id === v.row)!.fits);
        }
      }
  assert.notEqual(choose({ n: 1_000_000, dims: 3072, M: 16, ramGB: 128 }).pick, 'hnsw');
  assert.equal(choose({ n: 1_000_000, dims: 3072, M: 16, ramGB: 128 }).pick, 'halfvec');
  assert.equal(choose({ ...DEFAULT_PARAMS, ramGB: 32 }).pick, 'quantized');
  assert.equal(choose({ ...DEFAULT_PARAMS, n: 50_000_000, ramGB: 16 }).pick, 'diskann');
});

test('final frame carries the verdict with every row shown', () => {
  const a = simulate({ ...DEFAULT_PARAMS, ramGB: 32 });
  const last = a.at(-1)!;
  assert.equal(last.shown, 6);
  assert.deepEqual(last.verdict, choose({ ...DEFAULT_PARAMS, ramGB: 32 }));
});
