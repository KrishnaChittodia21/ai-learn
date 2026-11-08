// M8 widget: trace span tree (src/viz/widgets/span-tree/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PARAMS, MAX_TOOL_MS, MIN_TOOL_MS, buildTrace, costOf, priciest, simulate, slowest, totalCost, type Params } from '../src/viz/widgets/span-tree/sim.ts';

const rag: Params = { scenario: 'rag', toolMs: 300 };

test('deterministic and every caption is non-empty', () => {
  for (const p of [DEFAULT_PARAMS, rag, { scenario: 'agent', toolMs: 2500 } as Params]) {
    assert.deepEqual(simulate(p), simulate(p));
    for (const f of simulate(p)) assert.ok(f.caption.trim().length > 20, f.caption);
  }
});

test('RAG trace matches the lesson example (2.31 s total, chat 1.92 s, 3,120 in / 64 out)', () => {
  const tr = buildTrace(rag);
  assert.equal(tr.root.ms, 2310);
  const chat = tr.spans.find((s) => s.kind === 'llm')!;
  assert.equal(chat.ms, 1920);
  assert.equal(chat.inTok, 3120);
  assert.equal(chat.outTok, 64);
  assert.equal(slowest(tr).id, 'chat');
});

test('children are sequential, inside the root, and only LLM spans are priced', () => {
  for (const p of [rag, DEFAULT_PARAMS]) {
    const tr = buildTrace(p);
    tr.spans.forEach((s, k) => {
      assert.equal(s.start, k ? tr.spans[k - 1].start + tr.spans[k - 1].ms : 0);
      assert.equal(s.cost > 0, s.kind === 'llm');
    });
    const end = tr.spans.at(-1)!;
    assert.ok(end.start + end.ms <= tr.root.ms);
    assert.ok(Math.abs(totalCost(tr) - tr.spans.reduce((a, s) => a + costOf(s.inTok, s.outTok), 0)) < 1e-12);
  }
});

test('a slow tool becomes the slowest span but not the most expensive', () => {
  const fast = buildTrace({ scenario: 'agent', toolMs: 300 });
  const slow = buildTrace({ scenario: 'agent', toolMs: 2500 });
  assert.equal(slowest(fast).id, 'chat2');
  assert.equal(slowest(slow).id, 'tool');
  assert.equal(priciest(fast).id, 'chat2');
  assert.equal(priciest(slow).id, 'chat2', 'the second LLM call re-sends context and writes more output');
  assert.equal(slow.root.ms - fast.root.ms, 2200);
  assert.equal(buildTrace({ scenario: 'agent', toolMs: 99999 }).spans.find((s) => s.id === 'tool')!.ms, MAX_TOOL_MS);
  assert.equal(buildTrace({ scenario: 'agent', toolMs: 0 }).spans.find((s) => s.id === 'tool')!.ms, MIN_TOOL_MS);
});

test('frames: root, one per span, the Your-turn frame, then the reveal', () => {
  const frames = simulate(DEFAULT_PARAMS);
  const n = buildTrace(DEFAULT_PARAMS).spans.length;
  assert.equal(frames.length, n + 3);
  assert.deepEqual(frames.map((f) => f.shown), [0, ...Array.from({ length: n }, (_, k) => k + 1), n, n]);
  assert.equal(frames.filter((f) => f.stage === 'turn').length, 1);
  assert.ok(frames.slice(0, -1).every((f) => !f.reveal), 'costs stay hidden until the last frame');
  const last = frames.at(-1)!;
  assert.ok(last.reveal && last.rootClosed);
  assert.match(last.caption, /Most expensive: chat gpt-5-mini #2/);
});
