// M8 widget: multi-hop knowledge-graph traversal (src/viz/widgets/kg-traversal/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PARAMS, EDGES, PATTERN, edgeKey, simulate, step, type Params } from '../src/viz/widgets/kg-traversal/sim.ts';

const variants: Params[] = [DEFAULT_PARAMS, { strategy: 'graph', maxHops: 1 }, { strategy: 'graph', maxHops: 2 }, { strategy: 'vector', maxHops: 3 }];

test('deterministic and every caption is non-empty', () => {
  for (const p of variants) {
    assert.deepEqual(simulate(p), simulate(p));
    for (const f of simulate(p)) assert.ok(f.caption.trim().length > 20, f.caption);
  }
});

test('each hop follows only its pattern relation and ignores Ana WORKS_AT', () => {
  assert.deepEqual(step(['Us'], 0).next, ['BoltCo', 'NutCorp']);
  const h2 = step(['BoltCo', 'NutCorp'], 1);
  assert.deepEqual(h2.next, ['Factory-17', 'Factory-9']);
  assert.deepEqual(h2.ignored.map(edgeKey), ['Ana-WORKS_AT-BoltCo']);
  assert.deepEqual(step(['Factory-17', 'Factory-9'], 2).next, ['Region-X', 'Region-Y']);
});

test('full budget: the answer is BoltCo with the 3-hop evidence path', () => {
  const frames = simulate(DEFAULT_PARAMS);
  const last = frames.at(-1)!;
  assert.deepEqual(last.answer, ['BoltCo']);
  assert.deepEqual(new Set(last.path), new Set(['BoltCo-SUPPLIES-Us', 'BoltCo-SOURCES_FROM-Factory-17', 'Factory-17-LOCATED_IN-Region-X']));
  assert.equal(last.path.length, PATTERN.length);
  assert.ok(!last.visited.includes('Ana'), 'the walk never visits a node outside the pattern');
  assert.ok(last.path.every((k) => EDGES.some((e) => edgeKey(e) === k)));
  // hops are monotonic and visited only grows
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].hop >= frames[i - 1].hop);
    assert.ok(frames[i].visited.length >= frames[i - 1].visited.length);
  }
  assert.equal(frames.filter((f) => f.stage === 'hop' && f.hop === 1).length, 1, 'exactly one Your-turn frame');
});

test('a hop budget below 3 finds nothing', () => {
  for (const maxHops of [1, 2]) {
    const frames = simulate({ strategy: 'graph', maxHops });
    const last = frames.at(-1)!;
    assert.deepEqual(last.answer, []);
    assert.equal(Math.max(...frames.map((f) => f.hop)), maxHops);
    assert.ok(!last.visited.includes('Region-X'));
  }
  assert.ok(simulate({ strategy: 'graph', maxHops: 1 }).length < simulate(DEFAULT_PARAMS).length);
});

test('vector RAG keeps the contract (0.81), drops the registry entry (0.42), finds nothing', () => {
  const last = simulate({ strategy: 'vector', maxHops: 3 }).at(-1)!;
  assert.deepEqual(
    last.chunks.map((c) => [c.score, c.kept]),
    [
      [0.81, true],
      [0.42, false],
    ],
  );
  assert.deepEqual(last.answer, []);
  assert.equal(last.walked.length, 0);
});
