// Drill runner (C4): the learner's TypeScript → sucrase strips the types (loaded on demand, so it lives only in the
// drills chunk) → a Web Worker made from a Blob URL runs the code and the drill's tests, with no DOM, no network
// APIs and a hard timeout. The grading core (`grade`) is a self-contained function: the worker gets its source
// text, and tests/drills.test.ts runs the same function in node on every solution and mutant.
//
// Security (M10): the worker comes from a blob: URL, so a future Content-Security-Policy must allow `worker-src blob:`.
import type { DrillBody, DrillHarness } from '../content/drills';

export interface TestResult {
  name: string;
  pass: boolean;
  message: string;
}

export type RunOutcome = { ok: true; results: TestResult[] } | { ok: false; error: string };

export const TIMEOUT_MS = 3000;

/**
 * Run compiled learner code and the drill's tests; never throws. Self-contained on purpose (only its parameters and
 * globals): the worker receives it as source text.
 */
export function grade(load: () => Record<string, unknown>, entry: string[], tests: (sub: Record<string, unknown>, harness: DrillHarness) => void): TestResult[] {
  const text = (e: unknown) => (e instanceof Error ? (e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message) : String(e));
  let sub: Record<string, unknown>;
  try {
    sub = load();
  } catch (e) {
    return [{ name: 'Your code loads', pass: false, message: `${text(e)}. Fix this first: no test can run until the code loads.` }];
  }
  const missing = entry.filter((n) => typeof sub[n] !== 'function');
  if (missing.length) return [{ name: 'Your code defines every function', pass: false, message: `Missing: ${missing.join(', ')}. Keep the names from the starter.` }];

  const results: TestResult[] = [];
  class Miss extends Error {}
  const fail = (m: string): never => {
    throw new Miss(m);
  };
  const show = (v: unknown) => {
    const s = JSON.stringify(v, (_k, x) => (typeof x === 'number' ? (Number.isFinite(x) ? Number(x.toPrecision(8)) : String(x)) : x)) ?? String(v);
    return s.length > 240 ? `${s.slice(0, 240)}…` : s;
  };
  const near = (a: unknown, b: unknown, tol: number): boolean => {
    if (typeof a === 'number' && typeof b === 'number') {
      if (Number.isNaN(b)) return Number.isNaN(a);
      if (!Number.isFinite(b)) return a === b;
      return Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    }
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => near(x, b[i], tol));
  };
  const toList = (v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v);
  const harness: DrillHarness = {
    check(name, why, fn) {
      try {
        fn();
        results.push({ name, pass: true, message: '' });
      } catch (e) {
        results.push({ name, pass: false, message: e instanceof Miss ? `${e.message}. ${why}` : `Your code threw: ${text(e)}. ${why}` });
      }
    },
    close(got, want, what, tol = 1e-6) {
      const g = toList(got);
      if (!near(g, want, tol)) fail(`${what}: expected ${show(want)}, got ${show(g)}`);
    },
    equal(got, want, what) {
      if (JSON.stringify(toList(got)) !== JSON.stringify(want)) fail(`${what}: expected ${show(want)}, got ${show(toList(got))}`);
    },
    ok(cond, message) {
      if (!cond) fail(message);
    },
    rng(seed) {
      // mulberry32
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let r = Math.imul(s ^ (s >>> 15), 1 | s);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    },
  };
  try {
    tests(sub, harness);
  } catch (e) {
    results.push({ name: 'The tests ran to the end', pass: false, message: text(e) });
  }
  return results;
}

/** TypeScript → JavaScript (types stripped, lines kept). Syntax errors come back with their line and column. */
export async function compile(code: string): Promise<{ js: string } | { error: string }> {
  const { transform } = await import('sucrase');
  try {
    return { js: transform(code, { transforms: ['typescript'] }).code };
  } catch (e) {
    const loc = (e as { loc?: { line: number; column: number } }).loc;
    const msg = (e instanceof Error ? e.message : String(e)).replace(/\s*\(\d+:\d+\)$/, '');
    return { error: loc ? `Line ${loc.line}, column ${loc.column + 1}: ${msg}` : msg };
  }
}

/** The whole worker script: network APIs removed, then the learner's code and the tests are written into the script
 *  itself (no eval / new Function), so the CSP needs only `worker-src blob:`, not 'unsafe-eval'. */
export function workerSource(js: string, entry: string[], testsSrc: string): string {
  const out = entry.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ');
  return `"use strict";
for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches']) {
  try { Object.defineProperty(self, k, { value: undefined }); } catch { /* not configurable */ }
}
const grade = ${grade.toString()};
const load = () => {
${js}
;return { ${out} };
};
self.postMessage(grade(load, ${JSON.stringify(entry)}, (${testsSrc})));`;
}

/** Compile and grade the learner's code in a throwaway worker; terminated after TIMEOUT_MS. */
export async function runDrill(code: string, drill: Pick<DrillBody, 'entry' | 'tests'>, timeoutMs = TIMEOUT_MS): Promise<RunOutcome> {
  const compiled = await compile(code);
  if ('error' in compiled) return { ok: false, error: compiled.error };
  const url = URL.createObjectURL(new Blob([workerSource(compiled.js, drill.entry, drill.tests.toString())], { type: 'text/javascript' }));
  const worker = new Worker(url);
  return new Promise((resolve) => {
    const done = (r: RunOutcome) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, error: `Timed out after ${timeoutMs / 1000} s: an infinite loop? The run was stopped.` }), timeoutMs);
    worker.onmessage = (e: MessageEvent<TestResult[]>) => done({ ok: true, results: e.data });
    worker.onerror = (e) => {
      e.preventDefault();
      done({ ok: false, error: e.message || 'The code crashed the runner.' });
    };
  });
}
