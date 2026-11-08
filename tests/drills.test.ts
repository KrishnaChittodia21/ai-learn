// From-scratch drills (C4): every drill's reference solution passes its tests, the starter fails them cleanly,
// and every ported mutant (tests/drill-mutants/<id>.ts: [find, replace] edits on the solution; test-only, never shipped) fails at least one test. Runs the same grading core the browser
// worker runs (src/lib/drillRunner.ts), on the same compiled code.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { DRILLS, type DrillBody } from '../src/content/drills/index.ts';
import { compile, workerSource, type TestResult } from '../src/lib/drillRunner.ts';
import { emptyProgress, TOPICS } from './helpers.ts';
import { exportBackup, mergeProgress, parseBackup } from '../src/lib/backup.ts';

const dir = new URL('../src/content/drills/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');
const BODIES: DrillBody[] = await Promise.all(files.map(async (f) => (await import(new URL(f, dir).href)).default as DrillBody));
const mutantDir = new URL('./drill-mutants/', import.meta.url);
const MUTANTS: Record<string, Record<string, [string, string][]>> = Object.fromEntries(
  await Promise.all(readdirSync(mutantDir).map(async (f) => [f.replace(/\.ts$/, ''), (await import(new URL(f, mutantDir).href)).default])),
);

/** run the exact worker script the browser runs, with a stand-in `self` that catches the posted results */
function gradeLikeWorker(js: string, entry: string[], testsSrc: string): TestResult[] {
  let posted: TestResult[] = [];
  new Function('self', workerSource(js, entry, testsSrc))({ postMessage: (r: TestResult[]) => (posted = r) });
  return posted;
}
async function run(code: string, body: DrillBody) {
  const out = await compile(code);
  assert.ok('js' in out, `${body.id}: does not compile: ${'error' in out ? out.error : ''}`);
  return gradeLikeWorker(out.js, body.entry, body.tests.toString());
}

test('the drill list and the drill files match; each links a real topic', () => {
  assert.deepEqual(BODIES.map((b) => b.id).sort(), DRILLS.map((d) => d.id).sort());
  for (const b of BODIES) assert.equal(`${b.id}.ts`, files[BODIES.indexOf(b)], `${b.id}: file name matches id`);
  const topics = new Set(TOPICS.map((t) => t.id));
  for (const d of DRILLS) {
    assert.ok(topics.has(d.topic), `${d.id}: topic ${d.topic} exists`);
    assert.ok(d.summary.length <= 160, `${d.id}: summary is 160 characters or fewer`);
  }
  assert.equal(new Set(DRILLS.map((d) => d.id)).size, DRILLS.length, 'ids are unique');
});

for (const body of BODIES) {
  test(`${body.id}: the solution passes every test`, async () => {
    const results = await run(body.solution, body);
    assert.ok(results.length >= 5, `${body.id}: at least 5 tests`);
    for (const r of results) assert.ok(r.pass, `${body.id}: "${r.name}" failed: ${r.message}`);
    assert.ok(body.hints.length >= 2 && body.notes.trim() && body.problem.trim(), `${body.id}: hints, notes and problem`);
    for (const e of body.entry) assert.match(body.starter, new RegExp(`function ${e}\\(`), `${body.id}: starter defines ${e}`);
    assert.ok(!body.problem.includes(body.solution.split('\n').find((l) => l.trim().length > 30) ?? '\u0000'), `${body.id}: the problem does not give the solution away`);
  });

  test(`${body.id}: the starter fails every test, with a message`, async () => {
    const results = await run(body.starter, body);
    for (const r of results) {
      assert.ok(!r.pass, `${body.id}: "${r.name}" passes on the starter`);
      assert.ok(r.message.length > 10, `${body.id}: "${r.name}" explains the failure`);
    }
  });

  const mutants = Object.entries(MUTANTS[body.id] ?? {});
  test(`${body.id}: every mutant fails at least one test (${mutants.length} mutants)`, async () => {
    assert.ok(mutants.length >= 3, `${body.id}: at least 3 mutants`);
    for (const [name, edits] of mutants) {
      let code = body.solution;
      for (const [find, replace] of edits) {
        assert.ok(code.includes(find), `${body.id}/${name}: "${find}" is in the solution`);
        code = code.replace(find, replace);
      }
      const results = await run(code, body);
      assert.ok(results.some((r) => !r.pass), `${body.id}/${name}: every test passed on a wrong solution`);
    }
  });
}

test('grade: syntax errors carry a line, load errors and missing functions are reported, not thrown', async () => {
  const bad = await compile('function f(a: number) {\n  return a +;\n}');
  assert.ok('error' in bad && /^Line 2, column \d+:/.test(bad.error), JSON.stringify(bad));
  assert.equal(gradeLikeWorker('throw new Error("boom")', ['f'], '() => {}')[0].pass, false);
  assert.match(gradeLikeWorker('function g() {}', ['f'], '() => {}')[0].message, /Missing: f/);
  const r = gradeLikeWorker('function f(x) { return x * 2 }', ['f'], '(sub, t) => { t.check("doubles", "why", () => t.close(sub.f(2), 5, "f(2)")) }');
  assert.deepEqual(r, [{ name: 'doubles', pass: false, message: 'f(2): expected 5, got 4. why' }]);
});

test('backup: drill records round-trip, bad fields are rejected, merge keeps the earliest pass and reveal', () => {
  const p = emptyProgress({ drills: { bm25: { passedAt: '2026-11-02T00:00:00.000Z' }, 'cosine-top-k': { revealedAt: '2026-11-01T00:00:00.000Z' } } });
  const back = parseBackup(JSON.stringify(exportBackup(p)));
  assert.ok(back.ok);
  assert.deepEqual(back.ok && back.progress.drills, p.drills);
  const bad = exportBackup(emptyProgress()) as unknown as { progress: Record<string, unknown> };
  bad.progress.drills = { bm25: { passedAt: 5 } };
  assert.equal(parseBackup(JSON.stringify(bad)).ok, false);
  bad.progress.drills = { bm25: { code: 'x' } };
  assert.equal(parseBackup(JSON.stringify(bad)).ok, false);
  const merged = mergeProgress(p, emptyProgress({ drills: { bm25: { passedAt: '2026-11-01T00:00:00.000Z', revealedAt: '2026-11-03T00:00:00.000Z' } } }));
  assert.deepEqual(merged.drills?.bm25, { passedAt: '2026-11-01T00:00:00.000Z', revealedAt: '2026-11-03T00:00:00.000Z' });
  assert.equal(mergeProgress(emptyProgress(), emptyProgress()).drills, undefined);
});

test('the worker script never evaluates strings, so the CSP needs no unsafe-eval (M10)', () => {
  assert.doesNotMatch(workerSource('function f() {}', ['f'], '() => {}'), /new Function|\beval\(/);
});
