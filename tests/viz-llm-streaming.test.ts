// M8 widget: streaming vs non-streaming (src/viz/widgets/llm-streaming/sim.ts)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANSWER, DEFAULT_PARAMS, firstVisible, simulate, totalTime, type Leave, type Mode } from '../src/viz/widgets/llm-streaming/sim.ts';

const all = (['stream', 'block'] as Mode[]).flatMap((mode) => (['stay', 'abort', 'no-abort'] as Leave[]).map((leave) => ({ ...DEFAULT_PARAMS, mode, leave })));

test('deterministic, captioned, time and tokens never go backwards, turn on frame 1', () => {
  for (const p of all) {
    const a = simulate(p);
    assert.deepEqual(a, simulate(p));
    assert.equal(a[0].turn, 'first-word');
    assert.equal(a.filter((f) => f.turn).length, 1);
    for (let i = 0; i < a.length; i++) {
      assert.ok(a[i].caption.trim().length > 20);
      if (i) {
        assert.ok(a[i].t >= a[i - 1].t - 1e-9, `${p.mode}/${p.leave} t`);
        assert.ok(a[i].generated >= a[i - 1].generated);
      }
      assert.ok(a[i].generated <= p.outTokens);
    }
  }
});

test('lesson example: 640 tokens at 80 tok/s, TTFT 0.55 s → ≈ 8.6 s total', () => {
  assert.ok(Math.abs(totalTime(DEFAULT_PARAMS) - 8.55) < 1e-9);
  assert.equal(firstVisible(DEFAULT_PARAMS), 0.55);
  assert.equal(firstVisible({ ...DEFAULT_PARAMS, mode: 'block' }), totalTime(DEFAULT_PARAMS));
});

test('streaming shows text from the first delta; non-streaming only at the end; both finish at the same time', () => {
  const s = simulate(DEFAULT_PARAMS);
  const b = simulate({ ...DEFAULT_PARAMS, mode: 'block' });
  assert.ok(s.findIndex((f) => f.visible > 0) < b.findIndex((f) => f.visible > 0));
  assert.ok(b.filter((f) => !f.done).every((f) => f.visible === 0));
  assert.equal(s.at(-1)!.t, b.at(-1)!.t);
  assert.equal(s.at(-1)!.visible, ANSWER.length);
  assert.equal(b.at(-1)!.visible, ANSWER.length);
  assert.ok(s.at(-1)!.events.at(-1)!.includes('message_stop'));
  assert.ok(s.at(-1)!.events.some((e) => e.includes('content_block_delta')));
  assert.equal(b.at(-1)!.events.length, 0);
});

test('leaving: abort stops billing half-way, no abort bills every token', () => {
  const ab = simulate({ ...DEFAULT_PARAMS, leave: 'abort' }).at(-1)!;
  const no = simulate({ ...DEFAULT_PARAMS, leave: 'no-abort' }).at(-1)!;
  assert.ok(ab.done && ab.gone && no.gone);
  assert.ok(ab.generated < DEFAULT_PARAMS.outTokens);
  assert.equal(no.generated, DEFAULT_PARAMS.outTokens);
  assert.ok(no.visible < ANSWER.length);
});

test('faster decoding shortens total time but not TTFT', () => {
  const slow = simulate({ ...DEFAULT_PARAMS, tps: 40 }).at(-1)!.t;
  const fast = simulate({ ...DEFAULT_PARAMS, tps: 150 }).at(-1)!.t;
  assert.ok(fast < slow);
  assert.equal(firstVisible({ ...DEFAULT_PARAMS, tps: 150 }), firstVisible({ ...DEFAULT_PARAMS, tps: 40 }));
});
