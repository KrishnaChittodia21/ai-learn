import type { Topic } from '../../types';

const topic: Topic = {
  id: 'ai-testing-benchmarking',
  phase: 'evaluation',
  order: 4,
  title: 'AI Testing and Benchmarking',
  subtitle:
    'Deterministic tests around a non-deterministic core (mocked models, property and snapshot tests) and how to read, distrust and build benchmarks: MMLU, GPQA, SWE-bench, HumanEval pass@k, contamination and Arena ratings.',
  estimatedMinutes: 36,
  sources: [
    'Hendrycks et al. 2021 — Measuring Massive Multitask Language Understanding (MMLU), arXiv:2009.03300',
    'Wang et al. 2024 — MMLU-Pro: A More Robust and Challenging Multi-Task Language Understanding Benchmark, arXiv:2406.01574',
    'Rein et al. 2023 — GPQA: A Graduate-Level Google-Proof Q&A Benchmark, arXiv:2311.12022',
    'Jimenez et al. 2024 — SWE-bench: Can Language Models Resolve Real-World GitHub Issues? (ICLR 2024)',
    'OpenAI 2024 — Introducing SWE-bench Verified (openai.com/index/introducing-swe-bench-verified)',
    'Chen et al. 2021 — Evaluating Large Language Models Trained on Code (HumanEval, unbiased pass@k), arXiv:2107.03374',
    'Chiang et al. 2024 — Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference, arXiv:2403.04132',
    'LMArena blog — Arena-Rank: open-sourcing the leaderboard methodology (Bradley-Terry, style control)',
    'Vitest docs — Mocking (vi.fn, vi.mock) and snapshot testing; fast-check docs — property-based testing',
    'Sainz et al. 2023 — NLP Evaluation in trouble: on the need to measure LLM data contamination',
  ],
  tags: ['testing', 'vitest', 'mocking', 'property-based testing', 'snapshot testing', 'benchmarks', 'MMLU', 'GPQA', 'SWE-bench', 'HumanEval', 'pass@k', 'contamination', 'Chatbot Arena', 'Elo'],
  cheatSheet: [
    'LLM test pyramid: many fast deterministic tests with a mocked model → fewer contract tests against the real API → a small nightly eval suite with scored outputs.',
    'Mock the model at the client boundary (inject a fake that returns canned responses); test YOUR code: prompt assembly, parsing, tool dispatch, retries, fallbacks.',
    'Property tests (fast-check) generate hundreds of inputs: "parser never throws", "prompt never exceeds N tokens", "redactor removes every email".',
    'Snapshot the assembled prompt / request body, not the model output — a prompt diff in code review is a cheap regression alarm.',
    'temperature 0 is NOT deterministic (batching, GPU float order, MoE routing); for live tests assert properties/thresholds, run k samples, and report pass rate.',
    'pass@k unbiased estimator: 1 − C(n−c, k)/C(n, k) with n samples and c correct per problem; average over problems. Never compute it as 1 − (1−p)^k from a single run.',
    'Benchmarks: MMLU (57 subjects, 4-choice, saturated ~90%), MMLU-Pro (10 options, ~12K Qs, more reasoning), GPQA Diamond (198 Google-proof grad-level Qs, experts ~65–81%), HumanEval (164 Python fns), SWE-bench Verified (500 human-validated GitHub issues).',
    'Contamination = test items in pre-training data; detect with n-gram overlap, canary strings, perturbed/rephrased variants and post-cutoff dates (LiveCodeBench-style).',
    'Chatbot Arena / LMArena: pairwise human votes → Bradley-Terry ratings (Elo-scaled, ~100 pts ≈ 64% win rate) with confidence intervals and style control for length/markdown bias.',
    'Public benchmarks pick a shortlist; a private, versioned, task-specific benchmark (100–500 items from your traffic) picks the winner.',
  ],
  sections: [
    {
      heading: 'AI Testing — deterministic tests around a non-deterministic model',
      body: `**Intuition:** you don't test the weather; you test that your umbrella opens. The model is the weather. Most bugs in LLM apps live in *your* code around it: prompt assembly, parsing, tool dispatch, retries, truncation, redaction. All of that can be tested deterministically by **mocking the model**.

**The LLM test pyramid**

| Layer | What runs | Speed / cost | Asserts |
|---|---|---|---|
| Unit (most) | your code + fake model client | ms, $0 | exact values, errors, call args |
| Property | fast-check generates 100s of inputs | ms, $0 | invariants ("never throws", "≤ 4K tokens") |
| Snapshot | assembled prompt / request body | ms, $0 | diff shows any prompt change in review |
| Contract (few) | real API, cheap model | seconds, cents | schema valid, tool call shape OK |
| Eval suite (nightly) | real model on a dataset | minutes, dollars | scored pass rate ≥ threshold |

**Mechanics.** Inject the client (constructor parameter or \`vi.mock\`) so a test can return canned responses: valid JSON, malformed JSON, a 429, a tool call with an unknown name. **Snapshot the prompt, not the answer**: model output changes run to run; your prompt should only change when you change it.

**Flakiness.** \`temperature: 0\` does not make outputs reproducible: batched inference, floating-point reduction order and MoE routing all add jitter, and \`seed\` is best-effort at most. For any test that hits a real model, assert *properties* (valid schema, contains the order id, under 120 words), sample k times and require a pass rate, and quarantine rather than retry-until-green.

**When to use:** every LLM feature gets unit + property + snapshot tests in CI on every commit; the scored dataset evaluation (covered in LLM Evaluation) runs nightly or on prompt changes.`,
      example: `A support bot extracts \`{ orderId, intent }\` from emails. The team writes 14 unit tests with a fake client: 6 valid JSON responses, 3 malformed (trailing prose, markdown-fenced JSON, missing field), 2 rate-limit errors, 3 refusals. They run in 40 ms total, $0. A fast-check property test feeds 500 random emails (unicode, 20K chars, empty strings) to the prompt builder and asserts the prompt stays under 3,000 tokens; it finds that a 20K-char email blows the budget because truncation ran *after* template interpolation. A snapshot of the request body catches a teammate's refactor that silently dropped the system prompt (the snapshot diff showed \`system: undefined\`). The nightly real-model suite runs 200 emails x 3 samples: 97.3% schema-valid, gating at ≥ 95%.`,
      diagram: `            ▲  slow, $$, probabilistic
           / \\   Eval suite (nightly): real model, scored dataset
          /---\\  Contract tests: real API, cheap model, schema
         /-----\\  Snapshot: assembled prompt / request body
        /-------\\  Property (fast-check): invariants, 100s inputs
       /---------\\  Unit: fake client → parse, retry, dispatch
      ▼  fast, $0, deterministic

  your code ──► [ LLMClient interface ] ──► real SDK   (prod / contract)
                          └──────────────► FakeClient (unit / property)`,
      code: [
        {
          language: 'typescript',
          title: 'extract.test.ts — unit + snapshot tests with an injected fake model (vitest)',
          code: `import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

// Production code depends on this tiny interface, not the SDK directly
interface LLMClient { complete(req: { system: string; user: string }): Promise<string> }

const Order = z.object({ orderId: z.string().regex(/^ORD-\\d{6}$/), intent: z.enum(['refund', 'status', 'other']) });

export function buildRequest(email: string) {
  const body = email.slice(0, 8000); // truncate BEFORE interpolation
  return { system: 'Extract orderId and intent as JSON only.', user: 'Email:\\n' + body };
}

export async function extract(llm: LLMClient, email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llm.complete(buildRequest(email));
    const json = raw.replace(/^\`\`\`(json)?|\`\`\`$/gm, '').trim(); // strip markdown fences
    const parsed = Order.safeParse(safeJson(json));
    if (parsed.success) return parsed.data;
  }
  return null; // caller routes to a human
}
const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };

describe('extract', () => {
  it('parses fenced JSON', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('\`\`\`json\\n{"orderId":"ORD-123456","intent":"refund"}\\n\`\`\`') };
    expect(await extract(llm, 'refund pls')).toEqual({ orderId: 'ORD-123456', intent: 'refund' });
  });
  it('retries once on malformed output, then gives up', async () => {
    const llm = { complete: vi.fn().mockResolvedValue('Sure! Here it is: {orderId:') };
    expect(await extract(llm, 'x')).toBeNull();
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });
  it('request shape is stable', () => {
    expect(buildRequest('Where is ORD-000001?')).toMatchSnapshot(); // prompt diff shows up in code review
  });
});`,
        },
      ],
      prosCons: {
        pros: [
          'Mocked tests run in milliseconds for $0, so they can gate every commit.',
          'They cover the failure modes real models rarely produce on demand: malformed JSON, 429s, unknown tool names, refusals.',
          'Prompt snapshots turn invisible prompt drift into a reviewable diff.',
          'Property tests find edge cases (huge, empty, unicode inputs) humans never write by hand.',
        ],
        cons: [
          { con: 'Mocks encode your assumptions about the model, so they can pass while the real API has changed shape.', fix: 'Add a handful of contract tests against the real API (cheap model, schema-only assertions) on a schedule and before releases.' },
          { con: 'Snapshot tests get rubber-stamped with -u and stop catching anything.', fix: 'Snapshot only small, meaningful payloads (the request body), keep them inline, and require reviewer sign-off on snapshot diffs via CODEOWNERS.' },
          { con: 'Live-model tests flake because temperature 0 is not deterministic.', fix: 'Assert properties instead of exact strings, sample k=3–5 times with a pass-rate threshold, and quarantine flaky cases instead of retrying until green.' },
          { con: 'Unit tests say nothing about answer quality.', fix: 'Pair them with a scored eval suite (golden dataset + graders) run nightly and on every prompt change.' },
        ],
      },
      keyPoints: [
        'Test your code around the model deterministically; evaluate the model probabilistically.',
        'Inject an LLMClient interface so tests can return canned good, bad and failing responses.',
        'Snapshot the prompt/request, never the model answer.',
        'Property tests assert invariants over hundreds of generated inputs.',
        'temperature 0 ≠ deterministic: use thresholds and k samples for live tests.',
      ],
      exercise: {
        prompt: `Write a **fast-check property test** for \`buildPrompt(docs, question)\`, which packs retrieved docs into a prompt.

Acceptance criteria:
- For any array of 0–50 docs (strings up to 5,000 chars) and any question, the prompt is **≤ 12,000 chars** (a proxy for ~3K tokens).
- The question always appears **verbatim** in the prompt.
- \`buildPrompt\` never throws.
- Fix \`buildPrompt\` so the property passes.`,
        starter: {
          language: 'typescript',
          code: `import { it, expect } from 'vitest';
import fc from 'fast-check';

const BUDGET = 12_000;

export function buildPrompt(docs: string[], question: string): string {
  // BUG: no budget handling
  return 'Answer using the context.\\n\\n' + docs.join('\\n---\\n') + '\\n\\nQuestion: ' + question;
}

it('prompt respects budget and keeps the question', () => {
  // TODO: fc.assert(fc.property(...arbitraries..., (docs, q) => { ...assertions... }))
});`,
        },
        hints: [
          'Arbitraries: fc.array(fc.string({ maxLength: 5000 }), { maxLength: 50 }) and fc.string({ maxLength: 500 }).',
          'Reserve the question and header first, then add docs while they fit in the remaining budget.',
          'If a long question alone exceeds the budget, truncate docs to zero but never cut the question (bound it at input validation instead).',
        ],
        solution: {
          language: 'typescript',
          code: `import { it, expect } from 'vitest';
import fc from 'fast-check';

const BUDGET = 12_000;
const HEADER = 'Answer using the context.\\n\\n';
const SEP = '\\n---\\n';

export function buildPrompt(docs: string[], question: string): string {
  const tail = '\\n\\nQuestion: ' + question;
  let remaining = BUDGET - HEADER.length - tail.length; // reserve fixed parts first
  const kept: string[] = [];
  for (const d of docs) {
    const cost = d.length + (kept.length ? SEP.length : 0);
    if (cost > remaining) break; // docs are ranked: stop at the first that doesn't fit
    kept.push(d);
    remaining -= cost;
  }
  return HEADER + kept.join(SEP) + tail;
}

it('prompt respects budget and keeps the question', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string({ maxLength: 5000 }), { maxLength: 50 }),
      fc.string({ maxLength: 500 }),
      (docs, q) => {
        const p = buildPrompt(docs, q);
        expect(p.length).toBeLessThanOrEqual(BUDGET);
        expect(p.endsWith('Question: ' + q)).toBe(true);
      },
    ),
    { numRuns: 300 },
  );
});`,
        },
        explanation: 'The fixed header and the question are reserved first, so docs fill only what is left; the loop stops at the first doc that does not fit, preserving rank order. fast-check generates 300 random cases (including empty and maximal ones) and shrinks any failure to a minimal counterexample, which is how you would have found the original overflow.',
      },
      quickCheck: {
        question: 'A teammate wants to snapshot the model\'s answer in a unit test that calls the real API at temperature 0. What is the main problem?',
        options: [
          'Snapshots cannot store strings longer than 1,000 characters.',
          'Outputs are not reproducible even at temperature 0, so the test will flake; snapshot the request instead and assert properties of live answers.',
          'Temperature 0 makes the model refuse more often, so the snapshot will contain refusals.',
          'Vitest snapshots only work for objects, not strings.',
        ],
        correct: 1,
        explanation: 'Batching, floating-point order and routing make outputs vary even at temperature 0. The deterministic thing you control is the request; snapshot that and use property/threshold assertions for live outputs.',
      },
      source: 'Vitest docs — Mocking and Snapshot testing; fast-check docs — Property-based testing',
    },
    {
      heading: 'AI Benchmarking — MMLU, GPQA, SWE-bench, HumanEval, contamination and Arena',
      body: `**Intuition:** a benchmark is a standardised exam. It is great for comparing students who sat the same paper, useless if they saw the paper beforehand (**contamination**) or if everyone now scores 95% (**saturation**).

| Benchmark | What it measures | Size / format | Status (2026) |
|---|---|---|---|
| MMLU | broad knowledge, 57 subjects | ~14K 4-choice Qs | saturated (~90%), some label errors |
| MMLU-Pro | harder knowledge + reasoning | ~12K Qs, **10 options** | still discriminates mid-tier |
| GPQA Diamond | grad-level science, "Google-proof" | 198 Qs | experts ~65%, skilled non-experts with web ~34% |
| HumanEval | Python function synthesis | 164 problems, unit tests | saturated; use pass@k |
| SWE-bench Verified | fix real GitHub issues in repos | 500 human-validated tasks (of 2,294) | agentic coding headline metric |
| Chatbot Arena / LMArena | human preference, open-ended | millions of pairwise votes | ratings with CIs, style control |

**pass@k** (HumanEval): sample n ≥ k solutions per problem, count c that pass, compute **1 − C(n−c, k) / C(n, k)** and average over problems. This unbiased estimator has much lower variance than literally drawing k samples once.

**Arena ratings**: each vote is a match; a **Bradley-Terry** model fits strengths so that P(A beats B) = 1 / (1 + 10^((R_B − R_A)/400)); a 100-point gap ≈ 64% win rate. Read the confidence intervals: overlapping CIs = statistical tie. **Style control** regresses out length and markdown so verbose answers don't win by looking thorough.

**Contamination detection:** n-gram overlap with known corpora, canary strings, accuracy drop on paraphrased/perturbed items, and comparing performance on items created after the model's cutoff.

**When to use:** public benchmarks to shortlist 3–4 models; then your **private benchmark** (100–500 items from real traffic, never published, versioned) to choose.`,
      example: `Choosing a model for a code-review assistant. Public numbers shortlist three models: SWE-bench Verified 71%, 68%, 52%; the third is cut. The team builds a private benchmark: 150 real PR diffs from their monorepo with known bugs (mined from reverted commits after the models' cutoffs), graded by hidden unit tests. With n=10 samples per item: model A has c=6 on a task → pass@1 = 1 − C(4,1)/C(10,1) = 1 − 4/10 = 0.60; pass@5 = 1 − C(4,5)/C(10,5) = 1 − 0 = 1.0 (only 4 failures, so any 5 contain a pass). Averaged: A pass@1 = 0.58, B = 0.63, despite A leading on SWE-bench. A paraphrase check shows A drops 9 points on reworded SWE-bench issues vs 2 for B, a contamination hint. They pick B.`,
      diagram: `  Public benchmarks                    Private benchmark (yours)
  ┌──────────────────────┐             ┌──────────────────────────┐
  │ MMLU-Pro  GPQA-D     │  shortlist  │ 100–500 items from real  │
  │ SWE-bench-V  Arena   │ ──────────► │ traffic, post-cutoff,    │
  │ (contamination? sat?)│  3–4 models │ hidden, versioned v1.3   │
  └──────────────────────┘             └────────────┬─────────────┘
                                                    │ n samples/item
                                                    ▼
                         graders (unit tests / exact match / rubric)
                                                    │
                                 pass@1, pass@k, cost, p95 latency
                                                    ▼
                                         pick model + record CI`,
      code: [
        {
          language: 'python',
          title: 'pass_at_k.py — unbiased estimator (Chen et al. 2021) + bootstrap CI',
          code: `import numpy as np

def pass_at_k(n: int, c: int, k: int) -> float:
    """Probability that at least one of k samples (drawn from n, c correct) passes."""
    if n - c < k:          # fewer failures than k: any k-subset contains a pass
        return 1.0
    # 1 - C(n-c, k)/C(n, k) computed as a stable product
    return 1.0 - np.prod(1.0 - k / np.arange(n - c + 1, n + 1))

def benchmark_pass_at_k(results: list[tuple[int, int]], k: int) -> float:
    return float(np.mean([pass_at_k(n, c, k) for n, c in results]))

def bootstrap_ci(results, k, iters=2000, seed=0):
    rng = np.random.default_rng(seed)
    scores = np.array([pass_at_k(n, c, k) for n, c in results])
    boots = [rng.choice(scores, size=len(scores), replace=True).mean() for _ in range(iters)]
    return np.percentile(boots, [2.5, 97.5])   # resample PROBLEMS, not samples

# (n samples, c correct) per problem
results = [(10, 6), (10, 0), (10, 10), (10, 3), (10, 9)]
print("pass@1", round(benchmark_pass_at_k(results, 1), 3))   # 0.56
print("pass@5", round(benchmark_pass_at_k(results, 5), 3))
print("95% CI pass@1", bootstrap_ci(results, 1))`,
        },
      ],
      prosCons: {
        pros: [
          'Standardised, reproducible comparison across models and versions on the same items.',
          'Cheap shortlist: public leaderboards remove obviously weak candidates before you spend on custom evals.',
          'Execution-graded benchmarks (HumanEval, SWE-bench) have objective pass/fail with no judge bias.',
          'Arena captures open-ended human preference that static tests miss.',
        ],
        cons: [
          { con: 'Contamination inflates scores when test items leaked into training data.', fix: 'Prefer post-cutoff or rolling benchmarks (LiveCodeBench-style), test on paraphrased/perturbed variants, and check n-gram overlap and canary strings.' },
          { con: 'Saturation: top models cluster at 88–92% and differences are noise.', fix: 'Move to harder successors (MMLU-Pro, GPQA Diamond, SWE-bench Verified) and always report confidence intervals.' },
          { con: 'Public benchmarks don\'t match your task, data or format.', fix: 'Build a private, versioned benchmark from real traffic with task-specific graders and keep it out of any public repo.' },
          { con: 'Arena rewards style (length, markdown) and reflects the voter population, not your users.', fix: 'Use the style-controlled leaderboard, check CIs, and treat it as a tiebreaker after your private eval.' },
        ],
      },
      keyPoints: [
        'Shortlist with public benchmarks, decide with a private one.',
        'pass@k = 1 − C(n−c,k)/C(n,k) averaged over problems; report n.',
        'Saturated + contaminated benchmarks stop discriminating: check CIs and paraphrase drops.',
        'Arena ratings are Bradley-Terry fits: 100 points ≈ 64% win rate; overlapping CIs = tie.',
        'Harness details (prompt format, few-shot, CoT, scaffold) can move scores more than the model.',
      ],
      exercise: {
        prompt: `Write a **contamination check** in TypeScript: \`ngramOverlap(testItem, corpusDocs, n = 13)\` returns the fraction of the test item's word 13-grams that appear anywhere in the corpus.

Acceptance criteria:
- Lowercase and collapse punctuation/whitespace before tokenising.
- Return 0 for items shorter than n words.
- Flag (return \`{ score, contaminated: true }\`) when overlap ≥ 0.5.
- Corpus n-grams built once into a Set (O(total words)).`,
        hints: [
          'Normalise with toLowerCase() and replace(/[^a-z0-9]+/g, " ").',
          'Build a Set of joined n-gram strings from all corpus docs, then count test n-grams present.',
          '13-grams follow the GPT-3 / Llama contamination analyses: long enough that matches are rarely accidental.',
        ],
        solution: {
          language: 'typescript',
          code: `const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

function ngrams(words: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(' '));
  return out;
}

export function buildIndex(corpusDocs: string[], n = 13): Set<string> {
  const idx = new Set<string>();
  for (const d of corpusDocs) for (const g of ngrams(norm(d), n)) idx.add(g);
  return idx;
}

export function ngramOverlap(testItem: string, index: Set<string>, n = 13) {
  const grams = ngrams(norm(testItem), n);
  if (grams.length === 0) return { score: 0, contaminated: false };
  const hits = grams.filter((g) => index.has(g)).length;
  const score = hits / grams.length;
  return { score, contaminated: score >= 0.5 };
}

// usage
const index = buildIndex(['... scraped web text that copied the benchmark question verbatim ...']);
console.log(ngramOverlap('Which of the following best describes the role of ATP synthase in ...', index));`,
        },
        explanation: 'Normalisation makes trivial formatting differences irrelevant; a Set of corpus n-grams gives O(1) lookups, so the check scales to millions of docs. Long n-grams (13) rarely match by chance, so high overlap is strong evidence the item was seen. It only detects verbatim leaks; paraphrased contamination needs perturbation tests.',
      },
      quickCheck: {
        question: 'Model X scores 91% on MMLU but drops to 78% on a paraphrased version of the same questions; model Y goes from 89% to 87%. What is the most likely explanation?',
        options: [
          'Model X has a smaller context window.',
          'Model X likely memorised MMLU items (contamination); Y\'s knowledge generalises better.',
          'Paraphrasing always makes questions harder by about 13 points.',
          'Model Y was evaluated with chain-of-thought and X without.',
        ],
        correct: 1,
        explanation: 'A large drop on meaning-preserving rewrites, much larger than a comparable model\'s, is a classic contamination signal: X matched surface forms it had seen rather than reasoning about the content.',
      },
      source: 'Chen et al. 2021 (HumanEval, pass@k); Rein et al. 2023 (GPQA); OpenAI 2024 — SWE-bench Verified; Chiang et al. 2024 (Chatbot Arena)',
    },
  ],
  codeChallenges: [
    {
      id: 'ai-testing-benchmarking-cc-1',
      title: 'Make an untestable LLM function testable',
      context: 'A summariser constructs the OpenAI client inside the function, and its only test calls the real API and compares the output string. CI fails ~1 run in 6 and costs money on every push.',
      task: 'Refactor so the model is injected, write deterministic unit tests (happy path, empty response, API error), and snapshot the request instead of the answer.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import { it, expect } from 'vitest';

export async function summarise(text: string) {
  const client = new OpenAI(); // hard-wired: tests hit the network
  const res = await client.chat.completions.create({
    model: 'gpt-5-mini',
    temperature: 0,
    messages: [{ role: 'user', content: 'Summarise in 2 sentences: ' + text }],
  });
  return res.choices[0].message.content; // may be null
}

it('summarises', async () => {
  const out = await summarise('The quarterly revenue rose 12% driven by ...');
  expect(out).toBe('Revenue rose 12% this quarter. Growth was driven by ...'); // flaky
});`,
      },
      hints: [
        'Define a minimal interface with just the create method you need and accept it as a parameter.',
        'Use vi.fn() to return a fake completion object with the same shape as the SDK response.',
        'Handle null content and thrown errors explicitly; test both.',
      ],
      solution: {
        language: 'typescript',
        code: `import { it, expect, vi } from 'vitest';

type ChatCreate = (req: {
  model: string; temperature?: number; max_tokens?: number;
  messages: { role: 'system' | 'user'; content: string }[];
}) => Promise<{ choices: { message: { content: string | null } }[] }>;

const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

export function buildSummaryRequest(text: string) {
  return {
    model: MODEL,
    max_tokens: 200,
    messages: [
      { role: 'system' as const, content: 'Summarise the user text in at most 2 sentences.' },
      { role: 'user' as const, content: text.slice(0, 20_000) },
    ],
  };
}

export async function summarise(create: ChatCreate, text: string): Promise<string> {
  const res = await create(buildSummaryRequest(text));
  const content = res.choices[0]?.message.content?.trim();
  if (!content) throw new Error('EMPTY_COMPLETION'); // explicit, testable failure
  return content;
}

const fake = (content: string | null): ChatCreate => vi.fn().mockResolvedValue({ choices: [{ message: { content } }] });

it('returns trimmed content', async () => {
  expect(await summarise(fake('  Revenue rose 12%.  '), 'x')).toBe('Revenue rose 12%.');
});
it('throws on empty completion', async () => {
  await expect(summarise(fake(null), 'x')).rejects.toThrow('EMPTY_COMPLETION');
});
it('propagates API errors', async () => {
  const create: ChatCreate = vi.fn().mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));
  await expect(summarise(create, 'x')).rejects.toThrow('rate limited');
});
it('request is stable', () => {
  expect(buildSummaryRequest('Quarterly revenue rose 12%')).toMatchSnapshot();
});
// production: summarise((req) => new OpenAI().chat.completions.create(req), text)`,
      },
      explanation: 'Dependency injection moves the network to the edge, so unit tests are deterministic, instant and free. The request builder is pure and snapshotted, so prompt changes show up in review. Null content and errors become explicit, tested paths instead of runtime surprises. Answer quality moves to a separate nightly eval rather than an exact-string assertion that can never be stable.',
      followUps: [
        { q: 'How do you still catch the SDK changing its response shape?', a: 'Run a small contract test suite against the real API on a schedule and before releases, asserting only structure (choices[0].message.content is a string, usage fields present), not wording.' },
        { q: 'Would vi.mock("openai") be better than injection?', a: 'It works, but module mocking couples tests to import paths and SDK internals. Injecting a narrow function type keeps tests simple and lets you swap providers without rewriting tests.' },
      ],
    },
    {
      id: 'ai-testing-benchmarking-cc-2',
      title: 'Fix a biased benchmark harness',
      context: 'A team compares two models on 40 coding problems. The harness draws one sample per problem at temperature 0.8, reports pass@1 and computes "pass@10" as 1 − (1 − pass@1)^10. Model A "wins" 0.55 vs 0.50 and they plan to switch.',
      task: 'Rewrite the harness to use n samples per problem, the unbiased pass@k estimator, and a paired bootstrap CI on the difference between models so the decision is statistically defensible.',
      starter: {
        language: 'python',
        code: `import random

def run(model, problems):
    passed = 0
    for p in problems:
        code = model.generate(p.prompt, temperature=0.8)   # 1 sample
        passed += p.run_tests(code)
    p1 = passed / len(problems)
    p10 = 1 - (1 - p1) ** 10      # assumes independence across problems
    return p1, p10

a = run(model_a, problems); b = run(model_b, problems)
print("A wins" if a[0] > b[0] else "B wins")`,
      },
      hints: [
        'Draw n ≥ k samples per problem (e.g. n=20 for k up to 10) and record c per problem.',
        'pass@k must be computed per problem with 1 − C(n−c,k)/C(n,k), then averaged.',
        'Bootstrap over problems, computing A−B on the same resampled problems each iteration (paired).',
      ],
      solution: {
        language: 'python',
        code: `import numpy as np

def pass_at_k(n: int, c: int, k: int) -> float:
    if n - c < k:
        return 1.0
    return 1.0 - float(np.prod(1.0 - k / np.arange(n - c + 1, n + 1)))

def counts(model, problems, n=20, temperature=0.8):
    out = []
    for p in problems:
        c = sum(p.run_tests(model.generate(p.prompt, temperature=temperature)) for _ in range(n))
        out.append(c)
    return np.array(out)                       # c per problem

def scores(cs, n, k):
    return np.array([pass_at_k(n, int(c), k) for c in cs])

def paired_diff_ci(ca, cb, n, k, iters=5000, seed=0):
    sa, sb = scores(ca, n, k), scores(cb, n, k)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(sa), size=(iters, len(sa)))   # resample problems
    diffs = (sa[idx] - sb[idx]).mean(axis=1)                # same problems for both
    return (sa - sb).mean(), np.percentile(diffs, [2.5, 97.5])

N = 20
ca, cb = counts(model_a, problems, N), counts(model_b, problems, N)
for k in (1, 10):
    d, (lo, hi) = paired_diff_ci(ca, cb, N, k)
    verdict = "A better" if lo > 0 else "B better" if hi < 0 else "no significant difference"
    print(f"pass@{k}: A-B = {d:+.3f}  95% CI [{lo:+.3f}, {hi:+.3f}] -> {verdict}")`,
      },
      explanation: 'One sample per problem at temperature 0.8 is extremely noisy, and (1 − p)^10 wrongly assumes every problem has the same success probability; easy problems are solved every time and hard ones never, so true pass@10 is much lower than the formula claims. The unbiased estimator uses n samples per problem. Paired bootstrap over problems gives a CI on the difference; with 40 problems a 5-point gap is usually inside the noise.',
      followUps: [
        { q: 'Why resample problems rather than individual samples?', a: 'Problems are the unit you want to generalise over; samples within a problem are correlated. Resampling problems captures the variance from which tasks happened to be in your benchmark.' },
        { q: 'How many problems would you need to detect a 5-point difference?', a: 'Roughly: per-problem score SD ~0.4 and paired differences correlated, so standard error ~0.3/sqrt(N); to get SE ≈ 0.02 you need N ≈ 225, so 40 problems is far too few for that effect size.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'ai-testing-benchmarking-iq-01',
      difficulty: 'medium',
      question: 'How would you structure the automated test suite for an LLM-powered feature so CI is fast, cheap and not flaky?',
      context: 'A new team has one test that calls the real model and compares strings; it fails randomly and nobody trusts it.',
      whatInterviewerLooksFor: [
        'Separates deterministic code tests from probabilistic model evaluation',
        'Uses dependency injection / mocks at the model boundary',
        'Mentions property and snapshot testing with sensible targets',
        'Handles live-model non-determinism with thresholds and sampling',
        'Places each layer in CI (per commit vs nightly)',
      ],
      modelAnswer: `**Principle:** test *my code* deterministically; *evaluate the model* statistically.

**Layers**
1. **Unit tests (per commit, ms, $0):** inject an \`LLMClient\` interface; a fake returns canned responses: valid output, fenced JSON, missing fields, refusals, 429/500, tool calls with unknown names. Assert parsing, retries, fallbacks, tool dispatch.
2. **Property tests (per commit):** fast-check generates hundreds of inputs; assert invariants: prompt ≤ token budget, redactor removes all emails, parser never throws, retrieved docs are always cited by id.
3. **Snapshot tests (per commit):** snapshot the assembled request (system prompt, tools, message order). Any prompt change shows as a diff in review. Never snapshot model output.
4. **Contract tests (daily / pre-release):** 5–10 calls to the real API with a cheap model, asserting only shape: schema-valid JSON, tool call structure.
5. **Eval suite (nightly + on prompt change):** a scored dataset with graders, gated on pass rate (covered under LLM evaluation).

**Flakiness:** temperature 0 is not deterministic (batching, float order, MoE routing). For anything live, assert properties not strings, run k samples, require e.g. ≥ 4/5, and quarantine flaky cases rather than auto-retrying until green.

**Result:** 95% of tests are deterministic and run in seconds; quality signal comes from the eval suite with confidence intervals.`,
      followUps: [
        { q: 'What do you do when the snapshot changes on every PR?', a: 'The snapshot is too big or contains volatile data (timestamps, ids). Inject a clock/id generator, snapshot only the request body, and use inline snapshots so reviewers actually read them.' },
        { q: 'Where do you test tool-calling logic?', a: 'With a fake model that emits scripted tool calls in sequence, asserting the dispatcher calls the right handler with validated args, handles unknown tools and stops after the max iteration count.' },
      ],
      pitfalls: [
        'Trying to make live model tests deterministic with temperature 0 and exact string matching',
        'Snapshotting model answers and blindly updating with -u',
        'Having no contract test, so mocks drift from the real API',
      ],
    },
    {
      id: 'ai-testing-benchmarking-iq-02',
      difficulty: 'hard',
      question: 'A vendor claims their new model beats yours by 6 points on MMLU and 4 on HumanEval. Your PM wants to switch next sprint. How do you evaluate the claim?',
      whatInterviewerLooksFor: [
        'Knows MMLU and HumanEval are saturated and contamination-prone',
        'Asks about harness settings (few-shot, CoT, prompt format, n samples)',
        'Insists on confidence intervals and statistical significance',
        'Proposes a private task-specific benchmark plus cost/latency',
        'Mentions contamination probes such as paraphrase drops',
      ],
      modelAnswer: `**1. Discount the headline numbers.** MMLU (~14K 4-choice questions) and HumanEval (164 problems) are saturated and widely leaked into training data. HumanEval has only 164 items, so a 4-point gap is ~7 problems: within noise at pass@1 from a single run.

**2. Check the harness.** Were both models run with the same few-shot count, chain-of-thought, prompt template, answer extraction and temperature? Was pass@1 from n samples with the unbiased estimator? Harness differences often move scores 3–10 points.

**3. Look at harder, fresher benchmarks.** MMLU-Pro (10 options), GPQA Diamond (198 Google-proof questions), SWE-bench Verified (500 validated issues), and post-cutoff sets like LiveCodeBench reduce contamination. Check the Arena style-controlled rating and whether CIs overlap.

**4. Probe contamination.** Paraphrase 100 benchmark items; a large accuracy drop vs our current model suggests memorisation.

**5. Run our private benchmark.** 200–500 items from real traffic, graded the same way as production, n samples each, paired bootstrap CI on the difference. Add **cost per task** and **p95 latency**, plus a safety/regression slice.

**6. Decide with a shadow/A-B.** If the private eval shows a significant win, shadow traffic for a week, then a small A/B on business metrics.

Switching costs (prompt re-tuning, tool-call quirks) are real, so the bar is a significant win on *our* task, not a leaderboard.`,
      followUps: [
        { q: 'What if the private benchmark shows a tie but the new model is 40% cheaper?', a: 'Then the decision is about cost: confirm the tie with a non-inferiority margin (e.g. lower CI bound > −2 points), check latency and failure modes, then migrate behind a flag with rollback.' },
        { q: 'How big should the private benchmark be?', a: 'Enough to detect the effect size you care about: for ~5-point differences on binary pass/fail, a few hundred items with paired comparison; smaller sets only detect large gaps.' },
        { q: 'How do you stop your private benchmark from getting contaminated?', a: 'Never publish it or send it to vendors for tuning, store it with access controls, add canary strings, and refresh a portion each quarter from new traffic.' },
      ],
      pitfalls: [
        'Taking vendor-reported numbers at face value without checking harness parity',
        'Ignoring sample size and confidence intervals on small benchmarks',
        'Ignoring cost, latency and migration effort',
      ],
    },
    {
      id: 'ai-testing-benchmarking-iq-03',
      difficulty: 'hard',
      question: 'Explain how Chatbot Arena (LMArena) turns pairwise votes into a leaderboard, and what its blind spots are for choosing an enterprise model.',
      whatInterviewerLooksFor: [
        'Explains pairwise anonymous battles and Bradley-Terry fitting',
        'Can interpret rating gaps as win probabilities and use confidence intervals',
        'Knows about style/length bias and style control',
        'Identifies population, task-mix and gaming blind spots',
      ],
      modelAnswer: `**Mechanics**
- Users submit a prompt; two anonymous models answer; the user votes A, B, tie or both bad. Identities are revealed only after voting.
- Each vote is a match. A **Bradley-Terry** model fits a strength per model such that P(A beats B) = 1 / (1 + 10^((R_B − R_A)/400)), fitted by maximum likelihood over all votes (more stable than online Elo, which depends on vote order).
- Ratings are reported with **bootstrap confidence intervals**; a 100-point gap ≈ 64% expected win rate, and models with overlapping CIs are effectively tied.
- **Style control** adds covariates (response length, markdown headers, bold, lists) to the regression so the rating reflects content rather than formatting.

**Blind spots for an enterprise decision**
| Issue | Why it matters |
|---|---|
| Voter population | Enthusiasts asking general/creative/coding questions, not your users |
| Task mix | Few long-context, RAG-grounded, tool-calling or domain-specific prompts |
| Single-turn preference | Rarely tests correctness that requires verification |
| Style bias | Longer, formatted answers win unless style-controlled |
| Gaming | Labs can test many private variants and publish the best |

**How I use it:** as a tiebreaker for general chat quality and a sanity check on shortlisting, alongside category leaderboards (coding, hard prompts), then decide on a private benchmark from our traffic.`,
      followUps: [
        { q: 'Why is Bradley-Terry preferred over online Elo for a static leaderboard?', a: 'Online Elo updates depend on match order and K-factor, so ratings drift; Bradley-Terry fits all votes jointly by maximum likelihood, giving order-independent ratings with proper confidence intervals.' },
        { q: 'Could you run an internal arena?', a: 'Yes: show employees side-by-side anonymised answers on real tasks, collect votes, fit Bradley-Terry with style covariates. It needs hundreds of votes per pair and guarding against reviewer fatigue.' },
      ],
      pitfalls: [
        'Treating a 10-point rating gap as meaningful without looking at CIs',
        'Ignoring that verbose answers win without style control',
        'Assuming Arena voters represent your user base',
      ],
    },
    {
      id: 'ai-testing-benchmarking-iq-04',
      difficulty: 'expert',
      question: 'Design a private benchmark for an agentic coding assistant used on your company\'s monorepo. How do you build, grade, version and protect it?',
      whatInterviewerLooksFor: [
        'SWE-bench-style task construction from real history with executable grading',
        'Contamination and leakage controls (post-cutoff, private storage)',
        'Hermetic, reproducible execution environments',
        'Versioning, refresh cadence and statistics (n samples, CIs)',
        'Tracks cost/latency/steps alongside success',
      ],
      modelAnswer: `**Task construction (SWE-bench style)**
- Mine merged PRs that fix a linked issue and add/modify tests. Each task = repo snapshot at the parent commit + issue text; the gold patch is hidden.
- **FAIL_TO_PASS** tests (fail before, pass after) define success; **PASS_TO_PASS** tests catch regressions.
- Human-validate like SWE-bench Verified: drop tasks whose issue is underspecified or whose tests check implementation details. Expect to discard 30–60%.
- Stratify: bug fixes, small features, refactors; easy (<15 min) to hard (>1 h); languages/services.

**Grading and environment**
- Hermetic Docker image per task with pinned deps and no network; run the agent with a fixed scaffold, tool set, step budget (e.g. 50) and token budget.
- Score = resolved rate; also record cost, wall time, steps, and patch size.
- n = 3–5 runs per task; report pass@1 with bootstrap CIs and pass^k (all k succeed) for reliability.

**Contamination and leakage**
- Prefer PRs merged after model cutoffs; keep the set in a private bucket, never in prompts sent for fine-tuning; add canary strings; rotate 20% per quarter.

**Versioning**
- \`bench-v2026.10\` with a manifest (task ids, commit SHAs, image digests, harness version). Never compare scores across versions without re-running baselines.

**Size:** 150–300 tasks lets you detect ~8–10 point differences; use it to compare models, scaffolds and prompt changes.`,
      followUps: [
        { q: 'Why report pass^k as well as pass@k?', a: 'pass@k measures whether any of k attempts succeeds (useful with a verifier); pass^k measures whether all k succeed, i.e. reliability, which matters when users get one shot without a verifier.' },
        { q: 'How do you handle flaky tests in the repo itself?', a: 'Run each task\'s tests several times on the gold patch during curation and drop tasks whose tests are nondeterministic; otherwise model scores inherit the flakiness.' },
      ],
      pitfalls: [
        'Using pre-cutoff public PRs that the model may have trained on',
        'Grading with an LLM judge when executable tests are available',
        'Letting the harness, image or step budget change silently between runs',
      ],
    },
    {
      id: 'ai-testing-benchmarking-iq-05',
      difficulty: 'medium',
      question: 'Your nightly live-model test suite fails on a random 2–5% of cases each night, different ones every time. Engineers want to add automatic retries. What do you do instead?',
      whatInterviewerLooksFor: [
        'Understands sources of non-determinism even at temperature 0',
        'Moves from per-case pass/fail to aggregate thresholds with statistics',
        'Distinguishes genuine flakiness from real regressions',
        'Uses quarantine and tracking instead of masking failures',
      ],
      modelAnswer: `Auto-retry hides real failure rates: a case that fails 30% of the time would pass 91% of retried runs and production users would still see the 30%.

**Diagnose**
- Non-determinism is expected: batching and floating-point reduction order, MoE routing, provider model updates, and \`seed\` being best-effort. Temperature 0 reduces but doesn't eliminate variance.
- Log for each failure: model version string, request id, latency, output. Check whether failures cluster on one slice (long inputs, a tool) — that's a real bug, not flakiness.

**Restructure the suite**
1. **Assert properties, not exact text:** schema-valid, mentions the order id, ≤ 120 words, cites a provided source.
2. **Sample k times per case** (k=3–5) and record a per-case pass rate.
3. **Gate on aggregates:** overall pass rate ≥ threshold with a CI, e.g. lower bound ≥ 93%, and per-slice minimums; compare to the last green baseline.
4. **Track per-case history:** a case that passes 2/5 consistently is a weak spot, worth a prompt fix or an eval item, not a retry.
5. **Quarantine** genuinely nondeterministic cases with an owner and expiry, instead of retrying silently.
6. **Pin model snapshots** (dated model ids) so provider updates show up as explicit diffs.

The suite then answers the question that matters: "did quality regress beyond noise?"`,
      followUps: [
        { q: 'How would you set the threshold?', a: 'Measure the baseline over ~10 nightly runs to get mean and variance, then set the gate at a level that a genuine 2–3 point regression would breach while normal noise would not, and review it quarterly.' },
        { q: 'When is a retry legitimate?', a: 'For transport failures (timeouts, 429, 5xx) at the client layer, with backoff and logged counts; never to re-roll a wrong answer in a test.' },
      ],
      pitfalls: [
        'Retrying until green, which masks real failure rates',
        'Believing temperature 0 or a seed guarantees reproducibility',
        'Gating on per-case pass/fail instead of aggregate rates',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'ai-testing-benchmarking-est-1',
      question: 'Estimate the cost and wall-clock time to run SWE-bench Verified with an agent: 500 tasks, 3 runs each, to compare two models.',
      assumptions: [
        '500 tasks x 3 runs x 2 models = 3,000 agent runs',
        'Average agent run: 30 steps; context grows, average 40K input tokens per step, 1K output tokens per step',
        'Illustrative price: $3 per 1M input, $15 per 1M output; 70% of input tokens hit the prompt cache at 10% price',
        'Average 25 s per step (model + tool execution); 50 runs in parallel',
      ],
      steps: [
        { label: 'Input tokens per run', calc: '30 steps x 40K = 1.2M input tokens' },
        { label: 'Effective input cost per run', calc: 'uncached 0.36M x $3/M = $1.08; cached 0.84M x $0.30/M = $0.25 → $1.33' },
        { label: 'Output cost per run', calc: '30 x 1K = 30K x $15/M = $0.45' },
        { label: 'Cost per run', calc: '$1.33 + $0.45 ≈ $1.78' },
        { label: 'Total cost', calc: '3,000 x $1.78 ≈ $5,340' },
        { label: 'Wall time per run', calc: '30 x 25 s = 750 s ≈ 12.5 min' },
        { label: 'Total wall time', calc: '3,000 runs / 50 parallel = 60 waves x 12.5 min = 750 min ≈ 12.5 h' },
      ],
      answer: 'About $5K and half a day of wall time at 50-way parallelism; without prompt caching input cost alone would be ~$3.60/run, pushing the total to ~$12K.',
      insight: 'Agentic benchmarks are expensive because context grows every step; prompt caching and a step budget dominate cost. Run the full suite for release decisions, and a stratified 100-task subset for day-to-day iteration.',
      followUps: [
        { q: 'How small can the iteration subset be?', a: 'With ~100 stratified tasks and 3 runs, standard error on resolve rate is roughly 3 points, enough to catch 8–10 point regressions cheaply (~$350 per model) while the full 500 confirms finer gains.' },
      ],
    },
    {
      id: 'ai-testing-benchmarking-est-2',
      question: 'How many test items do you need for a 95% confidence interval of ±3 points on a benchmark accuracy around 80%, and how many samples for pass@10 on HumanEval?',
      assumptions: [
        'Binary pass/fail items, independent',
        'Accuracy near p = 0.8',
        '95% CI half-width = 1.96 x sqrt(p(1−p)/N)',
        'HumanEval has 164 problems; pass@k needs n ≥ k samples per problem, n = 2k recommended for low variance',
      ],
      steps: [
        { label: 'Variance per item', calc: 'p(1−p) = 0.8 x 0.2 = 0.16' },
        { label: 'Solve for N', calc: '0.03 = 1.96 x sqrt(0.16/N) → sqrt(0.16/N) = 0.0153 → 0.16/N = 0.000234 → N ≈ 683' },
        { label: 'Compare HumanEval', calc: '164 items → half-width = 1.96 x sqrt(0.16/164) = 1.96 x 0.0312 ≈ ±6.1 points' },
        { label: 'Samples for pass@10', calc: 'n = 20 per problem x 164 = 3,280 generations' },
        { label: 'Token cost (illustrative)', calc: '3,280 x (300 in + 400 out) → 0.98M in x $3 + 1.31M out x $15 ≈ $3 + $20 = $23' },
      ],
      answer: '~680 items for ±3 points at 80% accuracy; HumanEval\'s 164 problems only give about ±6 points, and pass@10 needs ~3,300 generations (~$23 at illustrative prices).',
      insight: 'Small benchmarks cannot distinguish models a few points apart; a "4-point win on HumanEval" is within the CI. Size private benchmarks to the effect you need to detect and use paired comparisons to tighten intervals.',
      followUps: [
        { q: 'How does a paired comparison reduce the required N?', a: 'Both models answer the same items, so item difficulty cancels; only disagreements carry information. If models agree on 85% of items, the variance of the difference falls sharply, often halving the N needed.' },
      ],
    },
  ],
  test: [
    {
      id: 'ai-testing-benchmarking-mcq-01',
      difficulty: 'medium',
      question: 'Which of these belongs in the per-commit, mocked-model layer of an LLM app\'s test suite rather than the nightly eval suite?',
      options: [
        'Measuring whether summaries are faithful to the source document',
        'Verifying that a 429 from the model triggers exactly one backoff retry and then a fallback model',
        'Comparing helpfulness of two candidate models on 300 real tickets',
        'Measuring hallucination rate on a golden dataset',
      ],
      correct: [1],
      explanation: 'Retry/fallback behaviour is deterministic logic in your code; a fake client can throw a 429 on demand. Faithfulness, helpfulness and hallucination rate are properties of real model outputs and need the scored eval suite with a real model.',
      followUps: [{ q: 'How would you simulate the 429 in vitest?', a: 'Use vi.fn().mockRejectedValueOnce(Object.assign(new Error("rate"), { status: 429 })).mockResolvedValueOnce(ok) and assert call counts and that the fallback client was invoked.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-02',
      difficulty: 'hard',
      question: 'A team sets temperature: 0 and seed: 42 and expects byte-identical outputs across nightly runs. Which statements are true? (Select ALL that apply)',
      options: [
        'Batched inference and floating-point reduction order can change logits slightly, flipping near-tied tokens.',
        'Provider-side model or infrastructure updates can change outputs even for the same model alias.',
        'With temperature 0 and a seed, outputs are guaranteed identical by every major API.',
        'Mixture-of-experts routing can vary with batch composition, adding non-determinism.',
      ],
      correct: [0, 1, 3],
      explanation: 'Greedy decoding still depends on logits computed with non-associative float arithmetic across varying batch shapes, MoE routing can depend on other requests in the batch, and aliases move to new snapshots. Seeds are documented as best-effort; no major API guarantees byte-identical results.',
      followUps: [{ q: 'What do you assert instead?', a: 'Properties and thresholds: schema validity, required facts present, length bounds, and an aggregate pass rate over k samples compared against a baseline with a confidence interval.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-03',
      difficulty: 'hard',
      question: 'This property test passes 100 runs locally. What important weakness does it have?',
      code: {
        language: 'typescript',
        code: `fc.assert(fc.property(fc.string({ maxLength: 50 }), (email) => {
  const prompt = buildPrompt(email);          // packs email into a template
  return countTokens(prompt) <= 4000;
}));`,
      },
      options: [
        'fc.property cannot return booleans; it must use expect().',
        'The generator only produces inputs up to 50 chars, so it never exercises the long-input path that could exceed the budget.',
        'Property tests must run with a real model to be meaningful.',
        'countTokens is non-deterministic, so the test will be flaky.',
      ],
      correct: [1],
      explanation: 'A property test is only as good as its input distribution. With maxLength 50 the budget can never be exceeded, so the test passes vacuously. Generate realistic extremes (e.g. up to 50K chars, unicode, empty). Returning booleans is valid in fast-check, and token counting with a fixed tokenizer is deterministic.',
      followUps: [{ q: 'How do you make sure extremes are generated?', a: 'Use fc.oneof to mix normal strings with very large ones (fc.string({ minLength: 10000, maxLength: 60000 })), include fc.fullUnicodeString, and add explicit examples via the examples option.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-04',
      difficulty: 'medium',
      question: 'What is the most useful thing to snapshot in a unit test for an LLM feature?',
      options: [
        'The model\'s answer at temperature 0',
        'The fully assembled request: system prompt, message order, tool schemas and parameters',
        'The raw HTTP headers including the API key',
        'The latency of the model call',
      ],
      correct: [1],
      explanation: 'The request is deterministic and fully under your control, so a snapshot diff reliably flags accidental prompt or tool-schema changes in code review. Model answers vary run to run, headers contain secrets, and latency is not stable.',
      followUps: [{ q: 'How do you keep request snapshots stable?', a: 'Inject clocks and id generators, sort tool arrays, strip volatile metadata, and keep snapshots inline and small so reviewers actually read the diffs instead of blindly updating.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-05',
      difficulty: 'hard',
      question: 'For one HumanEval problem you draw n = 10 samples and c = 2 pass. What does the unbiased estimator give for pass@3?',
      code: {
        language: 'python',
        code: `from math import comb
n, c, k = 10, 2, 3
print(1 - comb(n - c, k) / comb(n, k))`,
      },
      options: ['0.20', '0.488', '0.533', '0.600'],
      correct: [2],
      explanation: 'C(8,3) = 56 and C(10,3) = 120, so pass@3 = 1 − 56/120 = 0.533. 0.20 is pass@1 (c/n), 0.488 is the naive 1 − (1 − 0.2)^3 which assumes sampling with replacement, and 0.60 is just 3 x 0.2.',
      followUps: [{ q: 'Why not compute pass@k by drawing exactly k samples once?', a: 'A single draw of k gives a 0/1 outcome per problem with high variance; the estimator uses all n samples to compute the expected value over every k-subset, giving a far lower-variance estimate.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-06',
      difficulty: 'hard',
      question: 'Which are recognised signals or techniques for detecting benchmark contamination? (Select ALL that apply)',
      options: [
        'High 13-gram overlap between test items and the training corpus',
        'A large accuracy drop on paraphrased or option-shuffled versions of the same items',
        'The model can reproduce a benchmark\'s canary string or the exact next question when prompted with the dataset name',
        'The model scores higher with chain-of-thought than without',
      ],
      correct: [0, 1, 2],
      explanation: 'Verbatim n-gram overlap, sensitivity to meaning-preserving perturbations, and the ability to regurgitate dataset contents all indicate memorisation. Improving with chain-of-thought is normal reasoning behaviour and says nothing about leakage.',
      followUps: [{ q: 'How do post-cutoff benchmarks help?', a: 'Items created after the model\'s training cutoff (e.g. new contest problems or recent GitHub issues) cannot have been seen in pre-training, so comparing scores on pre- vs post-cutoff items exposes memorisation.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-07',
      difficulty: 'medium',
      question: 'Why was SWE-bench Verified created from the original SWE-bench?',
      options: [
        'To translate the tasks from Python into multiple languages',
        'To keep a human-validated 500-task subset whose issues are well specified and whose tests fairly judge correct fixes',
        'To replace unit-test grading with LLM-as-a-judge grading',
        'To shorten tasks so agents need fewer steps',
      ],
      correct: [1],
      explanation: 'Annotators found many original tasks had underspecified issues or tests that rejected valid solutions, understating model ability. Verified keeps 500 screened tasks and still grades by executing the repository\'s tests; it remains Python-only.',
      followUps: [{ q: 'What do FAIL_TO_PASS and PASS_TO_PASS tests mean?', a: 'FAIL_TO_PASS tests fail before the fix and must pass after it, proving the issue is resolved; PASS_TO_PASS tests passed before and must still pass, catching regressions introduced by the patch.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-08',
      difficulty: 'expert',
      question: 'On the Arena leaderboard, model A is rated 1352 (95% CI ±6) and model B 1341 (±7). What is the best interpretation?',
      options: [
        'A beats B in about 65% of battles, a clear win.',
        'Expected win rate for A is only ~52–53% and the intervals overlap, so treat them as statistically tied.',
        'A is 11% better than B on all tasks.',
        'B is better because its interval is wider.',
      ],
      correct: [1],
      explanation: 'With the Bradley-Terry/Elo scale, an 11-point gap gives P = 1/(1 + 10^(−11/400)) ≈ 0.516. The intervals overlap (1346–1358 vs 1334–1348), so the ranking is not significant. 65% corresponds to roughly 100+ points; rating points are not percentages.',
      followUps: [{ q: 'What would change your mind towards A?', a: 'A gap that persists under style control, non-overlapping CIs, and consistent wins in the category leaderboards relevant to your use case, then confirmation on your own private benchmark.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-09',
      difficulty: 'hard',
      question: 'Which statements about current knowledge benchmarks are accurate? (Select ALL that apply)',
      options: [
        'MMLU-Pro uses 10 answer options per question, lowering the random-guess baseline to 10%.',
        'GPQA Diamond is designed so that skilled non-experts with web access still score far below domain experts.',
        'MMLU remains the best benchmark for separating frontier models because it has 57 subjects.',
        'Frontier models cluster near the top of MMLU, so small gaps there are mostly noise and label errors.',
      ],
      correct: [0, 1, 3],
      explanation: 'MMLU-Pro moved to 10 options and harder reasoning items; GPQA was written to be "Google-proof" (experts ~65%, non-experts with web ~34%). MMLU is saturated around 90% with known labelling errors, so breadth of subjects no longer makes it discriminative at the frontier.',
      followUps: [{ q: 'Why does a 10-option format help?', a: 'It cuts the guess rate from 25% to 10% and reduces the effectiveness of elimination shortcuts, spreading scores and making them more sensitive to real reasoning ability and less to prompt format.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-10',
      difficulty: 'expert',
      question: 'This harness reports a model\'s benchmark accuracy. Which change would most improve the trustworthiness of comparisons between two models?',
      code: {
        language: 'python',
        code: `def evaluate(model, items):
    correct = 0
    for it in items:
        out = model.generate(PROMPT.format(q=it.q), temperature=0.7)
        correct += out.strip().startswith(it.answer)   # e.g. "B"
    return correct / len(items)`,
      },
      options: [
        'Raise temperature to 1.0 to explore more answers.',
        'Use a robust answer extractor (parse a required final-answer format), fix temperature or sample n times, and report a CI from a paired bootstrap against the other model.',
        'Shuffle items before evaluating so order effects cancel.',
        'Remove the prompt template so the model sees only the raw question.',
      ],
      correct: [1],
      explanation: 'startswith misgrades answers like "The answer is B" (false negative) or "Because..." vs "B" mismatches; one sample at 0.7 adds variance; no CI means no idea if differences are real. Item order does not affect independent calls, and removing the template changes the task rather than fixing measurement.',
      followUps: [{ q: 'Why is answer extraction a big deal on MCQ benchmarks?', a: 'Scores can shift several points purely from parsing: models that explain before answering get marked wrong. Harnesses specify an output format (e.g. "Answer: X") and extract with regex, or compare option log-probabilities.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-11',
      difficulty: 'expert',
      question: 'You are building a private benchmark from production data for model selection. Which practices are sound? (Select ALL that apply)',
      options: [
        'Prefer items created after the candidate models\' training cutoffs and keep the set out of public repositories.',
        'Version the set with a manifest (item ids, grader version) and re-run baselines whenever the version changes.',
        'Pick items the current model fails on, so the new model looks clearly better.',
        'Stratify by task type and difficulty so a slice-level regression is visible.',
      ],
      correct: [0, 1, 3],
      explanation: 'Post-cutoff private items resist contamination, versioning keeps scores comparable, and stratification exposes regressions hidden by averages. Selecting only items the incumbent fails creates selection bias (regression to the mean) that favours any challenger.',
      followUps: [{ q: 'How often should you refresh the benchmark?', a: 'Rotate a portion (e.g. 20%) quarterly from new traffic to track distribution shift, keeping a frozen core so you can still compare against historical results.' }],
    },
    {
      id: 'ai-testing-benchmarking-mcq-12',
      difficulty: 'medium',
      question: 'What does this vitest test verify, and what does it NOT verify?',
      code: {
        language: 'typescript',
        code: `const llm = { complete: vi.fn()
  .mockResolvedValueOnce('{"tool":"get_weather","args":{"city":"Paris"}}')
  .mockResolvedValueOnce('It is 18°C in Paris.') };
const weather = vi.fn().mockResolvedValue({ tempC: 18 });
const out = await runAgent(llm, { get_weather: weather }, 'Weather in Paris?');
expect(weather).toHaveBeenCalledWith({ city: 'Paris' });
expect(out).toContain('18');`,
      },
      options: [
        'It verifies the model will choose get_weather for this question in production.',
        'It verifies the agent loop dispatches a scripted tool call with the right args and feeds the result back, but not whether a real model would make that call.',
        'It verifies the weather API returns correct temperatures.',
        'It verifies nothing because mocks always pass.',
      ],
      correct: [1],
      explanation: 'The fake model scripts the tool call, so the test proves your dispatch and loop wiring, not model behaviour; tool selection quality needs an eval with the real model. The weather function is also mocked, so real API correctness is untested. Mocks fail when your loop mishandles them.',
      followUps: [{ q: 'What other scripted cases would you add?', a: 'An unknown tool name, invalid args failing schema validation, a tool that throws, and a model that never stops calling tools, asserting the max-iteration guard ends the loop.' }],
    },
  ],
};

export default topic;
