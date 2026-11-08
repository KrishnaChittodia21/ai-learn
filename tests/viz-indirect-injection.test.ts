// M8 widget: indirect prompt-injection path (src/viz/widgets/indirect-injection/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PARAMS, STAGES, simulate, stopStage, type Params } from '../src/viz/widgets/indirect-injection/sim.ts';

const all: Params[] = [false, true].flatMap((isolation) => [false, true].flatMap((allowlist) => [false, true].map((urlFilter) => ({ isolation, allowlist, urlFilter }))));

test('deterministic and every caption is non-empty', () => {
  for (const p of all) {
    assert.deepEqual(simulate(p), simulate(p));
    for (const f of simulate(p)) assert.ok(f.caption.trim().length > 20, f.caption);
  }
});

test('no defences: every stage is compromised and data leaks', () => {
  const frames = simulate(DEFAULT_PARAMS);
  const last = frames.at(-1)!;
  assert.equal(stopStage(DEFAULT_PARAMS), null);
  assert.equal(last.leaked, true);
  assert.ok(last.states.every((s) => s === 'compromised'));
  assert.equal(frames.filter((f) => f.leaked).length, 2, 'only the client fetch and the recap show the leak');
});

test('the first enabled defence on the path is where the attack stops', () => {
  assert.equal(stopStage({ isolation: true, allowlist: true, urlFilter: true }), 'model');
  assert.equal(stopStage({ isolation: false, allowlist: true, urlFilter: true }), 'tool');
  assert.equal(stopStage({ isolation: false, allowlist: false, urlFilter: true }), 'render');
  for (const p of all) {
    const stop = stopStage(p);
    const last = simulate(p).at(-1)!;
    assert.equal(last.leaked, stop === null);
    assert.ok(last.done);
    if (stop) {
      const k = STAGES.findIndex((s) => s.id === stop);
      assert.equal(last.states[k], 'blocked');
      assert.ok(last.states.slice(k + 1).every((s) => s === 'idle'), 'nothing runs after the block');
      assert.ok(last.states.slice(0, k).every((s) => s === 'compromised'), 'stages before the block carried the attack');
    }
  }
});

test('earlier stops mean fewer frames; retrieval is never a stop', () => {
  const n = (p: Params) => simulate(p).length;
  assert.ok(n({ isolation: true, allowlist: false, urlFilter: false }) < n({ isolation: false, allowlist: true, urlFilter: false }));
  assert.ok(n({ isolation: false, allowlist: true, urlFilter: false }) < n({ isolation: false, allowlist: false, urlFilter: true }));
  for (const p of all) for (const f of simulate(p)) assert.notEqual(f.states[1], 'blocked');
});

test('recap names backup layers for defence in depth', () => {
  const last = simulate({ isolation: true, allowlist: true, urlFilter: false }).at(-1)!;
  assert.match(last.caption, /Tool allow-list would also have stopped it/);
});
