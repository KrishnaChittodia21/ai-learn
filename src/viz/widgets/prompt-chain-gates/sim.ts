// Pure, deterministic prompt chain (no React, Node-testable).
// Step 1 (LLM) extracts JSON from a document. Step 2 (code) is a validation gate: JSON parses, the schema
// matches, and a business rule holds. On failure the exact errors are fed back for ONE retry; a second
// failure routes the item to a human. Step 3 (LLM) writes the output from the validated JSON only.
import type { BaseFrame } from '../../core';

export type ScenarioId = 'clean' | 'retry' | 'fail';
export type StepId = 'extract' | 'validate' | 'write';
export type CheckStatus = 'pending' | 'pass' | 'fail';

export interface Params {
  scenario: ScenarioId;
}

export const DEFAULT_PARAMS: Params = { scenario: 'retry' };
export const MAX_ATTEMPTS = 2;

export const CHECK_LABELS = ['JSON parses', 'schema: id, vendor, total:number, due:date', 'rule: Σ line_items = total'] as const;

interface Attempt {
  json: string[];
  /** status of each check, in CHECK_LABELS order (later checks are skipped once one fails) */
  results: CheckStatus[];
  error?: string;
}

export interface Scenario {
  label: string;
  document: string;
  attempts: Attempt[];
  written?: string;
}

const VALID = [
  '{ "invoice_id": "INV-2207",',
  '  "vendor": "Northwind",',
  '  "total": 1200,',
  '  "due_date": "2026-11-30",',
  '  "line_items": [{ "qty": 3, "unit": 400 }] }',
];

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  clean: {
    label: 'Clean run',
    document: 'Hi! Invoice INV-2207 from Northwind: 3 licences at $400 each, total $1,200, due 30 Nov 2026.',
    attempts: [{ json: VALID, results: ['pass', 'pass', 'pass'] }],
    written: 'Approve INV-2207: Northwind, $1,200.00 due 2026-11-30 (3 × $400).',
  },
  retry: {
    label: 'Gate fails, retry fixes it',
    document: 'Hi! Invoice INV-2207 from Northwind: 3 licences at $400 each, total $1.200,00, due 30 Nov.',
    attempts: [
      {
        json: ['{ "invoice_id": "INV-2207",', '  "vendor": "Northwind",', '  "total": "1.200,00",', '  "due_date": "30 Nov",', '  "line_items": [{ "qty": 3, "unit": 400 }] }'],
        results: ['pass', 'fail', 'pending'],
        error: 'total: expected number, got string; due_date: expected YYYY-MM-DD',
      },
      { json: VALID, results: ['pass', 'pass', 'pass'] },
    ],
    written: 'Approve INV-2207: Northwind, $1,200.00 due 2026-11-30 (3 × $400).',
  },
  fail: {
    label: 'Source is inconsistent',
    document: 'Invoice INV-2207, Northwind: 3 licences at $400 + setup $150. Total due: $1,200 by 30 Nov 2026.',
    attempts: [
      {
        json: ['{ "invoice_id": "INV-2207",', '  "vendor": "Northwind",', '  "total": 1200,', '  "due_date": "2026-11-30",', '  "line_items": [3 × 400, 1 × 150] }'],
        results: ['pass', 'pass', 'fail'],
        error: 'line_items sum to 1350 but total is 1200',
      },
      {
        json: ['{ "invoice_id": "INV-2207",', '  "vendor": "Northwind",', '  "total": 1200,', '  "due_date": "2026-11-30",', '  "line_items": [3 × 400, 1 × 150] }'],
        results: ['pass', 'pass', 'fail'],
        error: 'line_items sum to 1350 but total is 1200',
      },
    ],
  },
};

export interface Check {
  label: string;
  status: CheckStatus;
}

export interface Frame extends BaseFrame {
  active: StepId | null;
  attempt: number;
  payload: string[];
  checks: Check[];
  /** the error text fed back into the retry prompt */
  feedback: string | null;
  output: string | null;
  llmCalls: number;
  outcome: 'running' | 'ok' | 'human';
}

const pending = (): Check[] => CHECK_LABELS.map((label) => ({ label, status: 'pending' }));

export function simulate({ scenario }: Params): Frame[] {
  const s = SCENARIOS[scenario];
  const frames: Frame[] = [];
  let llmCalls = 0;
  const push = (f: Omit<Frame, 'llmCalls' | 'outcome'> & { outcome?: Frame['outcome'] }) => frames.push({ llmCalls, outcome: 'running', ...f });

  push({
    active: null,
    attempt: 0,
    payload: [],
    checks: pending(),
    feedback: null,
    output: null,
    caption: `Input document: "${s.document}" Instead of one big prompt ("read this and write an approval note"), the chain splits the job into a small extract prompt, a code gate and a small write prompt.`,
    predict: 'Which step should be allowed to read the raw email: extract, write, or both?',
  });

  let feedback: string | null = null;
  for (let a = 0; a < s.attempts.length && a < MAX_ATTEMPTS; a++) {
    const at = s.attempts[a];
    llmCalls++;
    push({
      active: 'extract',
      attempt: a + 1,
      payload: at.json,
      checks: pending(),
      feedback,
      output: null,
      caption:
        a === 0
          ? 'Step 1, extract (LLM call 1): "Return only JSON with keys invoice_id, vendor, total (number), due_date (YYYY-MM-DD), line_items." The model reads the email inside <document> tags.'
          : `Retry (LLM call ${llmCalls}): the same extract prompt plus the gate's exact error: "${feedback}". A specific error is far more useful to the model than "try again".`,
    });
    const checks = CHECK_LABELS.map((label, k) => ({ label, status: at.results[k] }));
    const failed = at.results.includes('fail');
    push({
      active: 'validate',
      attempt: a + 1,
      payload: at.json,
      checks,
      feedback,
      output: null,
      caption: failed
        ? `Step 2, gate (code, no LLM): ${checks.map((c) => `${c.label} ${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '–'}`).join(' · ')}. Error: ${at.error}.`
        : 'Step 2, gate (code, no LLM): JSON parses ✓, schema matches ✓, line items add up to the total ✓. The contract holds, so the data may move on.',
      predict: failed && a === 0 ? 'The gate failed. Should the chain retry, pass the data on anyway, or stop?' : undefined,
    });
    if (!failed) break;
    feedback = at.error ?? 'validation failed';
    if (a === MAX_ATTEMPTS - 1) {
      push({
        active: null,
        attempt: a + 1,
        payload: at.json,
        checks,
        feedback,
        output: null,
        outcome: 'human',
        caption: `The gate failed twice with the same error. Retrying again would only burn tokens: the email itself is inconsistent. The item goes to a human review queue; the write step never runs on bad data.`,
      });
    }
  }

  if (s.written) {
    llmCalls++;
    const last = s.attempts[s.attempts.length - 1];
    push({
      active: 'write',
      attempt: s.attempts.length,
      payload: last.json,
      checks: CHECK_LABELS.map((label) => ({ label, status: 'pass' })),
      feedback: null,
      output: s.written,
      outcome: 'ok',
      caption: `Step 3, write (LLM call ${llmCalls}): a short prompt sees ONLY the validated JSON, not the raw email, and drafts: "${s.written}"`,
    });
  }

  const ok = !!s.written;
  push({
    active: null,
    attempt: Math.min(s.attempts.length, MAX_ATTEMPTS),
    payload: s.attempts[Math.min(s.attempts.length, MAX_ATTEMPTS) - 1].json,
    checks: frames[frames.length - 1].checks,
    feedback: null,
    output: s.written ?? null,
    outcome: ok ? 'ok' : 'human',
    caption: ok
      ? `Recap: ${llmCalls} LLM calls. Each prompt does one job, each step can be tested and swapped on its own, and the JSON contract between them is checked in code. ${s.attempts.length > 1 ? 'One retry with the exact error fixed the format slip.' : ''}`
      : `Recap: ${llmCalls} LLM calls, then a human. A single big prompt would have written a confident approval note for an invoice that does not add up; the gate turned a silent error into a visible one.`,
  });
  return frames;
}
