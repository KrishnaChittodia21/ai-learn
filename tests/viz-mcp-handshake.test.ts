// M8 widget: MCP handshake → tools/list → tools/call (src/viz/widgets/mcp-handshake/sim.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate, type Outcome, type Params, type Spec } from '../src/viz/widgets/mcp-handshake/sim.ts';

const SPECS: Spec[] = ['2025-11-25', '2026-07-28'];
const OUTCOMES: Outcome[] = ['ok', 'toolError', 'unknownTool'];
const ALL: Params[] = SPECS.flatMap((spec) => OUTCOMES.map((outcome) => ({ spec, outcome })));

test('deterministic and every frame has a caption', () => {
  for (const p of ALL) {
    const a = simulate(p);
    assert.deepEqual(a, simulate(p));
    for (const f of a) assert.ok(f.caption.trim().length > 20, `${p.spec}/${p.outcome} ${f.stage}`);
  }
});

test('2025-11-25 opens with initialize → result → notifications/initialized before tools/list', () => {
  const log = simulate({ spec: '2025-11-25', outcome: 'ok' }).at(-1)!.log;
  assert.deepEqual(
    log.slice(0, 4).map((m) => [m.kind, m.label.split(' ')[0]]),
    [['request', 'initialize'], ['result', 'result:'], ['notification', 'notifications/initialized'], ['request', 'tools/list']],
  );
  assert.equal(log[2].id, null, 'a notification has no id');
});

test('2026-07-28 has no handshake: first message is tools/list', () => {
  const frames = simulate({ spec: '2026-07-28', outcome: 'ok' });
  const log = frames.at(-1)!.log;
  assert.ok(log[0].label.startsWith('tools/list'));
  assert.ok(!log.some((m) => /initialize/.test(m.label)));
  assert.ok(frames.every((f) => f.handshakeDone));
  assert.ok(frames.length < simulate({ spec: '2025-11-25', outcome: 'ok' }).length);
});

test('every request is answered by exactly one response with the same id; nothing pending at the end', () => {
  for (const p of ALL) {
    const frames = simulate(p);
    const log = frames.at(-1)!.log;
    const reqIds = log.filter((m) => m.kind === 'request').map((m) => m.id);
    const resIds = log.filter((m) => m.kind === 'result' || m.kind === 'error').map((m) => m.id);
    assert.deepEqual([...resIds].sort(), [...reqIds].sort());
    assert.equal(new Set(reqIds).size, reqIds.length, 'ids are unique');
    assert.deepEqual(frames.at(-1)!.pending, []);
  }
});

test('consent comes before tools/call; outcomes end in the right status', () => {
  for (const p of ALL) {
    const log = simulate(p).at(-1)!.log;
    const consent = log.findIndex((m) => m.label === 'user approves');
    const call = log.findIndex((m) => m.label.startsWith('tools/call'));
    assert.ok(consent >= 0 && consent < call);
  }
  assert.equal(simulate({ spec: '2025-11-25', outcome: 'ok' }).at(-1)!.status, 'done');
  assert.equal(simulate({ spec: '2025-11-25', outcome: 'toolError' }).at(-1)!.status, 'toolError');
  const unknown = simulate({ spec: '2025-11-25', outcome: 'unknownTool' }).at(-1)!;
  assert.equal(unknown.status, 'protocolError');
  assert.ok(unknown.log.some((m) => m.kind === 'error'));
  assert.ok(!simulate({ spec: '2025-11-25', outcome: 'toolError' }).at(-1)!.log.some((m) => m.kind === 'error'), 'tool failure is a result, not an error');
});

test('Your turn: each widget run has at least one, every one has exactly one correct option', () => {
  for (const p of ALL) {
    const turns = simulate(p).flatMap((f) => (f.yourTurn ? [f.yourTurn] : []));
    assert.ok(turns.length >= 1);
    for (const t of turns) {
      assert.equal(t.options.filter((o) => o.correct).length, 1);
      assert.ok(t.options.every((o) => o.why.length > 10));
    }
  }
  assert.equal(simulate({ spec: '2025-11-25', outcome: 'ok' }).filter((f) => f.yourTurn).length, 2);
});

test('final frame is the recap', () => {
  for (const p of ALL) assert.equal(simulate(p).at(-1)!.stage, 'recap');
});
