import type { Topic } from '../../types';

const topic: Topic = {
  id: 'model-serving-routing',
  phase: 'models',
  order: 4,
  title: 'Model Serving, Routing, Selection and Fallbacks',
  subtitle: 'Serve models efficiently, send each request to the cheapest model that can handle it, and stay up when providers fail',
  estimatedMinutes: 52,
  sources: [
    'Kwon et al. 2023 — Efficient Memory Management for LLM Serving with PagedAttention (vLLM, arXiv:2309.06180)',
    'vLLM docs — OpenAI-compatible server, engine arguments, LoRA, prefix caching, metrics',
    'Zheng et al. 2024 — SGLang: Efficient Execution of Structured Language Model Programs (RadixAttention, arXiv:2312.07104)',
    'Hugging Face TGI docs — maintenance-mode notice recommending vLLM / SGLang (Dec 2025)',
    'NVIDIA TensorRT-LLM docs — trtllm-serve, in-flight batching, FP8/FP4',
    'Ong et al. 2024 — RouteLLM: Learning to Route LLMs with Preference Data (arXiv:2406.18665) and LMSYS blog',
    'Chen et al. 2023 — FrugalGPT: How to Use LLMs While Reducing Cost (cascades, arXiv:2305.05176)',
    'Martin Fowler — Circuit Breaker; AWS Builders Library — Timeouts, retries and backoff with jitter',
    'OpenAI & Anthropic API docs — error codes, rate limits (429), overloaded (529) responses',
  ],
  tags: ['serving', 'vllm', 'sglang', 'tensorrt-llm', 'routing', 'routellm', 'model-selection', 'fallback', 'circuit-breaker'],
  cheatSheet: [
    'Serving metrics: TTFT (time to first token), ITL/TPOT (time per output token), throughput (tokens/s), goodput (requests meeting SLOs).',
    'vLLM = PagedAttention (KV cache in fixed blocks, <4% waste vs 60–80% in naive allocators) + continuous batching + OpenAI-compatible server.',
    'Key vLLM knobs: --max-model-len, --gpu-memory-utilization (0.9), --max-num-seqs, --tensor-parallel-size, --quantization / --kv-cache-dtype fp8, --enable-lora.',
    'Engines: vLLM (broadest hardware/models), SGLang (RadixAttention prefix reuse, structured outputs, agents), TensorRT-LLM (peak NVIDIA perf, compile step); TGI is in maintenance mode since Dec 2025.',
    'Routing = send each request to the cheapest model likely to succeed: rules, classifier, embedding kNN, LLM router, or cascade (cheap first, escalate on low confidence/validation failure).',
    'RouteLLM-style routers (trained on preference data) cut cost by >2× on MT Bench while keeping ~95% of the strong model\'s quality; calibrate the threshold to a target strong-model share.',
    'Selection matrix: hard constraints first (context, modality, licence, residency), then score quality on YOUR eval, p95 latency, cost per successful task, and reliability.',
    'Compare cost per successful task, not per token: cheap models that need retries or human fixes can cost more.',
    'Fallback chain: same model on another region/provider → different provider\'s comparable model → smaller model → cached/static answer; each hop has its own timeout.',
    'Circuit breaker: closed → open after N failures/error-rate → half-open probe after cool-down; plus a retry budget (≤10–20% extra load) and jittered backoff.',
  ],
  sections: [
    {
      heading: 'Model Serving — vLLM, SGLang, TensorRT-LLM and the metrics that matter',
      body: `**Intuition:** a model server is a restaurant kitchen. Requests arrive at random, some orders are tiny, some huge; a good kitchen keeps every burner busy (batching) and never reserves a whole table for a party of one (memory management).

**What an inference server does:** tokenise, schedule requests into GPU batches, run prefill (process the prompt) and decode (generate tokens one at a time), manage the KV cache, stream tokens back, and expose metrics.

**Two ideas that made modern serving fast:**
- **Continuous batching:** new requests join the running batch at every decode step and finished ones leave immediately, instead of waiting for the whole batch to finish. Typical gains: several-fold higher throughput than static batching.
- **PagedAttention (vLLM):** the KV cache is stored in fixed-size blocks like OS virtual memory, so memory is allocated on demand. The vLLM paper measured under 4% KV waste versus 60–80% for contiguous pre-allocation, which translates into larger batches and 2–4× throughput over earlier systems.

| Engine | Strengths | Watch out |
|---|---|---|
| vLLM | broadest model + hardware support, multi-LoRA, prefix caching | tune memory flags per model |
| SGLang | RadixAttention prefix reuse, fast structured outputs, agent workloads | smaller ecosystem |
| TensorRT-LLM | peak NVIDIA performance, FP8/FP4 | engine build step, NVIDIA-only |
| TGI | HF integration | maintenance mode since Dec 2025; plan migration |

**Metrics:** TTFT (dominated by queueing + prefill), ITL/TPOT (decode speed per user), throughput (tokens/s per GPU) and **goodput** (requests/s meeting both TTFT and ITL SLOs). Throughput and per-user latency trade off through batch size (\`--max-num-seqs\`).

**When to use:** self-host when you run open weights at steady volume or need data control; otherwise managed APIs or serverless endpoints avoid the ops work.`,
      example: `Serving Llama-3.1-8B (bf16) on one H100 80 GB with vLLM for a chat app (prompts ~1,500 tokens, outputs ~300). Load test results:
- \`--max-num-seqs 16\`: 1,900 output tok/s, p95 TTFT 310 ms, ITL 9 ms.
- \`--max-num-seqs 128\`: 6,800 output tok/s, p95 TTFT 1.4 s, ITL 19 ms.
- \`--max-num-seqs 64\` + \`--enable-prefix-caching\` (shared 900-token system prompt): 5,600 tok/s, p95 TTFT 420 ms, ITL 14 ms.
With an SLO of TTFT < 500 ms and ITL < 25 ms, the third config has the highest goodput: ~5,600 / 300 ≈ 18 requests/s per GPU, so 120 req/s peak needs 7 GPUs plus 1–2 for headroom.`,
      diagram: `  clients --HTTP/SSE--> [ API server (OpenAI-compatible) ]
                                  |
                                  v
                       [ scheduler: continuous batching ]
                         waiting q --> running batch <-- finished leave
                                  |
             +--------------------+--------------------+
             v                                         v
      prefill (prompt, compute-bound)        decode (1 token/step/seq)
             |                                         |
             +---------> KV cache in 16-token blocks <-+
                         (PagedAttention block table)
                                  |
                       metrics: TTFT, ITL, tokens/s, queue length`,
      code: [
        {
          language: 'bash',
          title: 'Launch vLLM with production-minded flags',
          code: `# OpenAI-compatible server on :8000
vllm serve meta-llama/Llama-3.1-8B-Instruct \\
  --max-model-len 16384 \\
  --gpu-memory-utilization 0.90 \\
  --max-num-seqs 64 \\
  --enable-prefix-caching \\
  --kv-cache-dtype fp8 \\
  --api-key "$VLLM_API_KEY" \\
  --port 8000

# Notes:
#  --max-model-len      caps context so the KV pool is not sized for 128k
#  --gpu-memory-utilization  fraction of VRAM for weights + KV blocks
#  --max-num-seqs       max concurrent sequences per step (latency vs throughput)
#  --kv-cache-dtype fp8 doubles KV capacity on FP8-capable GPUs
# Prometheus metrics at http://localhost:8000/metrics
#   (vllm:time_to_first_token_seconds, vllm:num_requests_waiting, ...)`,
        },
        {
          language: 'typescript',
          title: 'Measure TTFT and inter-token latency from the client side',
          code: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? 'http://localhost:8000/v1',
  apiKey: process.env.VLLM_API_KEY ?? 'x',
});
const MODEL = process.env.LLM_MODEL ?? 'meta-llama/Llama-3.1-8B-Instruct';

export async function timedCompletion(prompt: string) {
  const t0 = performance.now();
  let first = 0;
  let last = 0;
  let chunks = 0;
  const stream = await client.chat.completions.create({
    model: MODEL,
    stream: true,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  for await (const c of stream) {
    if (!c.choices[0]?.delta?.content) continue;
    const now = performance.now();
    if (!first) first = now;          // first content chunk = TTFT
    last = now;
    chunks++;
  }
  const ttftMs = first - t0;
  const itlMs = chunks > 1 ? (last - first) / (chunks - 1) : 0; // ~1 token per chunk
  return { ttftMs, itlMs, chunks };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Continuous batching + paged KV cache deliver several times the throughput of naive serving on the same GPU.',
          'OpenAI-compatible APIs let you swap engines or move between self-hosted and managed with a base-URL change.',
          'Rich metrics (TTFT, queue depth, KV usage) make autoscaling and SLOs measurable.',
        ],
        cons: [
          { con: 'Large batches raise throughput but hurt TTFT and per-user speed.', fix: 'Tune --max-num-seqs and chunked prefill against an explicit goodput SLO from a load test with realistic prompt/output lengths.' },
          { con: 'Defaults size the KV pool for the model\'s max context, starving concurrency.', fix: 'Set --max-model-len to what you actually need and use FP8 KV cache to double capacity.' },
          { con: 'Engine choice and versions change fast; performance differs per model.', fix: 'Benchmark vLLM and SGLang on your model and traffic shape before committing; pin engine versions and re-benchmark on upgrade.' },
          { con: 'Self-hosting adds ops: autoscaling, GPU failures, cold starts of tens of GB.', fix: 'Keep warm minimum replicas, pre-pull weights to local NVMe, scale on queue depth/KV usage rather than CPU, or use a managed endpoint.' },
        ],
      },
      keyPoints: [
        'Continuous batching + PagedAttention are the core of modern serving.',
        'Optimise goodput (SLO-meeting requests), not raw tokens/s.',
        'Cap max-model-len; KV memory decides concurrency.',
        'Benchmark engines on your own traffic; TGI is in maintenance mode.',
      ],
      exercise: {
        prompt: `Given an array of per-request measurements \`{ ttftMs, itlMs, outputTokens }\`, write \`summarise(samples, slo)\` returning p50/p95 TTFT, p50 ITL, and **goodput fraction** (share of requests with \`ttftMs <= slo.ttftMs\` and \`itlMs <= slo.itlMs\`).

Acceptance: percentiles use nearest-rank; an empty input returns zeros; goodput is between 0 and 1.`,
        starter: {
          language: 'typescript',
          code: `type Sample = { ttftMs: number; itlMs: number; outputTokens: number };
type Slo = { ttftMs: number; itlMs: number };

function percentile(xs: number[], p: number): number {
  // TODO: nearest-rank percentile
  return 0;
}

export function summarise(samples: Sample[], slo: Slo) {
  // TODO
}`,
        },
        hints: [
          'Sort a copy ascending; nearest-rank index is ceil(p/100 × n) − 1.',
          'Clamp the index to [0, n−1].',
          'Goodput = count of samples meeting both SLOs / n.',
        ],
        solution: {
          language: 'typescript',
          code: `type Sample = { ttftMs: number; itlMs: number; outputTokens: number };
type Slo = { ttftMs: number; itlMs: number };

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

export function summarise(samples: Sample[], slo: Slo) {
  const n = samples.length;
  if (n === 0) return { p50Ttft: 0, p95Ttft: 0, p50Itl: 0, goodput: 0 };
  const ttft = samples.map((s) => s.ttftMs);
  const itl = samples.map((s) => s.itlMs);
  const ok = samples.filter((s) => s.ttftMs <= slo.ttftMs && s.itlMs <= slo.itlMs).length;
  return {
    p50Ttft: percentile(ttft, 50),
    p95Ttft: percentile(ttft, 95),
    p50Itl: percentile(itl, 50),
    goodput: ok / n,
  };
}`,
        },
        explanation: 'Goodput captures what users experience: a config with higher raw throughput can have lower goodput if queueing pushes TTFT past the SLO. Load-test several --max-num-seqs values and pick the one maximising goodput × requests/s.',
      },
      quickCheck: {
        question: 'Raising --max-num-seqs from 32 to 256 doubles tokens/s but p95 TTFT goes from 400 ms to 3 s. Your SLO is TTFT < 800 ms. What should you do?',
        options: [
          'Keep 256 because throughput is what reduces cost',
          'Pick the highest setting that still meets the TTFT/ITL SLO in load tests, and add replicas for the remaining load',
          'Set it to 1 to minimise latency',
          'Disable continuous batching to make TTFT predictable',
        ],
        correct: 1,
        explanation: 'Throughput that violates the SLO is not useful: maximise goodput, then scale out. Batch size 1 wastes the GPU, and disabling continuous batching hurts both throughput and latency.',
      },
      source: 'Kwon et al. 2023 — PagedAttention/vLLM; vLLM docs; SGLang paper',
    },
    {
      heading: 'Model Routing — sending each request to the cheapest model that can handle it',
      body: `**Intuition:** a hospital triage desk. Most patients need a nurse, a few need a specialist. Routing sends easy prompts to a cheap, fast model and hard ones to the expensive model, so you pay specialist prices only when needed.

**Router types:**

| Router | How it decides | Latency added | Notes |
|---|---|---|---|
| Rules | task type, prompt length, tenant tier | ~0 ms | transparent; brittle |
| Classifier | small model (BERT/logistic) predicts "strong model needed" | 5–20 ms | needs labelled data |
| Embedding kNN | similar past prompts and which model won | 10–30 ms | easy to update |
| LLM router | small LLM rates difficulty / picks a model | 200–500 ms | flexible, costs tokens |
| Cascade | cheap model answers first; escalate if validation/confidence fails | cheap call on escalated requests | no training needed |

**RouteLLM** (LMSYS, 2024) trained routers (matrix factorisation, BERT, causal LLM) on ~55k Chatbot Arena preference pairs plus augmentation. On MT Bench the best router kept ~95% of GPT-4's quality while cutting cost by over 85% versus GPT-4-only (with judge-augmented data needing only 14% GPT-4 calls).

**Threshold calibration:** a router outputs \`p_strong\` ∈ [0,1]. Pick the threshold on a validation set so that, e.g., 25% of traffic goes to the strong model, then check quality on your eval at that operating point. Recalibrate when traffic shifts.

**Cascades** use a *validator* instead of a predictor: JSON schema validity, unit tests, self-reported confidence, or a judge. They work best when validation is cheap and reliable.

**When to use:** mixed-difficulty traffic with a large price gap (10–30×) between tiers. Skip it if almost every request needs the strong model or volume is too low to matter.`,
      example: `A coding assistant gets 1M requests/month (avg 2k input + 500 output tokens). Illustrative prices: strong model $3/$15 per 1M in/out, small model $0.15/$0.60.
- All-strong: 1M × (2k × $3 + 500 × $15)/1M = $6,000 + $7,500 = **$13,500/month**.
- Small-only: $300 + $300 = $600, but eval pass rate drops from 86% to 64%.
- Router calibrated to 30% strong: 0.3 × $13,500 + 0.7 × $600 + router (~$50) ≈ **$4,520**; eval pass rate 84%.
So routing recovers ~91% of the quality gap (84% vs 64–86% range) at one-third of the cost. Raising the strong share to 40% gives 85.3% at ~$5,800.`,
      diagram: `             request
                |
                v
        +---------------+   features: length, task, embedding,
        |    router     |   tenant tier, tool use needed?
        +-------+-------+
      p_strong < t   |   p_strong >= t
         +-----------+------------+
         v                        v
   [small model]            [strong model]
         |
   validator ok? --no--> escalate to strong (cascade)
         | yes
         v
      response  --> log (route, cost, outcome) --> recalibrate t`,
      code: [
        {
          language: 'typescript',
          title: 'Router with calibrated threshold plus cascade escalation on validation failure',
          code: `import OpenAI from 'openai';
import { z } from 'zod';

const client = new OpenAI({ baseURL: process.env.GATEWAY_URL, apiKey: process.env.GATEWAY_KEY });
const SMALL = process.env.SMALL_MODEL ?? 'gpt-5-mini';
const STRONG = process.env.STRONG_MODEL ?? 'claude-sonnet-5-5';
const THRESHOLD = Number(process.env.ROUTER_THRESHOLD ?? 0.62); // calibrated offline

// cheap heuristic + classifier score; replace scoreDifficulty with your trained router
async function scoreDifficulty(prompt: string): Promise<number> {
  const long = Math.min(prompt.length / 20_000, 1);           // long prompts are harder
  const hard = /prove|refactor|architecture|multi-step|why/i.test(prompt) ? 0.4 : 0;
  return Math.min(1, 0.3 * long + hard + 0.2);
}

const Answer = z.object({ answer: z.string().min(1), confidence: z.number().min(0).max(1) });

async function call(model: string, prompt: string) {
  const r = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Reply as JSON {"answer": string, "confidence": 0..1}.' },
      { role: 'user', content: prompt },
    ],
  });
  return Answer.safeParse(JSON.parse(r.choices[0]?.message?.content ?? '{}'));
}

export async function route(prompt: string) {
  const p = await scoreDifficulty(prompt);
  if (p >= THRESHOLD) return { model: STRONG, ...(await call(STRONG, prompt)) };
  const small = await call(SMALL, prompt);
  // cascade: escalate when output is invalid or the small model is unsure
  if (!small.success || small.data.confidence < 0.6) {
    return { model: STRONG, escalated: true, ...(await call(STRONG, prompt)) };
  }
  return { model: SMALL, ...small };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Cuts cost 2–5× on mixed-difficulty traffic with little quality loss.',
          'Lowers median latency because most requests hit a faster model.',
          'Cascades need no training data: validators (schema, tests) decide escalation.',
        ],
        cons: [
          { con: 'Misrouted hard prompts silently get worse answers.', fix: 'Log route decisions with outcomes, sample-evaluate small-model answers daily, and recalibrate the threshold on fresh labelled traffic.' },
          { con: 'Self-reported confidence is poorly calibrated.', fix: 'Prefer objective validators (schema, tests, retrieval grounding checks) or a trained router; calibrate confidence against eval outcomes.' },
          { con: 'Cascades add latency for escalated requests (two calls).', fix: 'Route obviously hard requests straight to the strong model, and stream the strong answer immediately on escalation.' },
          { con: 'Different models need different prompts and output quirks.', fix: 'Maintain per-model prompt variants behind the router and run the eval suite per route.' },
        ],
      },
      keyPoints: [
        'Route by predicted difficulty; escalate by validated failure.',
        'Calibrate the threshold to a target strong-model share, then verify quality.',
        'Measure cost per successful task across routes.',
        'Recalibrate as traffic and models change.',
      ],
      exercise: {
        prompt: `Write \`calibrateThreshold(scores, strongShare)\` that returns the threshold \`t\` such that about \`strongShare\` (e.g. 0.25) of validation scores satisfy \`score >= t\`. Then write \`evaluate(scores, smallOk, t)\` returning \`{ strongShare, qualityProxy }\` where quality is 1 for strong-routed items and \`smallOk[i]\` for small-routed items.

Acceptance: for scores [0.1,0.2,…,1.0] and strongShare 0.3, t = 0.8 and three items route strong.`,
        hints: [
          'Sort scores descending; the threshold is the score at index ceil(share × n) − 1.',
          'Ties may push the share slightly above target; that is acceptable.',
          'Assume the strong model always succeeds for the quality proxy.',
        ],
        solution: {
          language: 'typescript',
          code: `export function calibrateThreshold(scores: number[], strongShare: number): number {
  const s = [...scores].sort((a, b) => b - a);
  const k = Math.max(1, Math.ceil(strongShare * s.length));
  return s[Math.min(k, s.length) - 1];
}

export function evaluate(scores: number[], smallOk: boolean[], t: number) {
  let strong = 0;
  let good = 0;
  scores.forEach((sc, i) => {
    if (sc >= t) { strong++; good++; }        // strong assumed correct
    else if (smallOk[i]) good++;
  });
  return { strongShare: strong / scores.length, qualityProxy: good / scores.length };
}

const scores = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const t = calibrateThreshold(scores, 0.3);   // 0.8
console.log(t, evaluate(scores, scores.map((s) => s < 0.5), t));`,
        },
        explanation: 'Calibrating on a target share turns an uncalibrated router score into a cost knob. Sweeping strongShare and plotting qualityProxy against cost gives the cost–quality curve from which product chooses an operating point, as RouteLLM does with its strong-model percentage.',
      },
      quickCheck: {
        question: 'Your cascade escalates to the strong model when the small model\'s self-reported confidence is below 0.6. Escalations are rare, but audits show many confident wrong answers. What is the best fix?',
        options: [
          'Lower the confidence threshold to 0.3',
          'Replace self-reported confidence with objective validators or a trained router, and calibrate on labelled outcomes',
          'Ask the small model to be more humble in the prompt',
          'Always call both models and pick the longer answer',
        ],
        correct: 1,
        explanation: 'LLM self-confidence is poorly calibrated, so it misses confident errors. Objective validators (schema, tests, grounding checks) or a router trained on outcomes predict failure better. Lowering the threshold escalates even less, prompting for humility is unreliable, and longer answers are not more correct.',
      },
      source: 'Ong et al. 2024 — RouteLLM; Chen et al. 2023 — FrugalGPT',
    },
    {
      heading: 'Model Selection — a selection matrix driven by your own evals',
      body: `**Intuition:** choosing a model is like hiring: the CV (public benchmarks) gets candidates shortlisted, but the job trial (your eval on your data) decides, and the salary (cost) and notice period (latency, rate limits) matter too.

**Two-stage process:**
1. **Hard constraints** (pass/fail): context window ≥ need, modality (vision, audio), tool calling / structured output support, data residency and retention terms, licence (for open weights), rate limits at your peak QPS, deployment target (API, VPC, on-prem).
2. **Weighted scoring** on the survivors:

| Criterion | Measure | Typical weight |
|---|---|---|
| Task quality | pass rate on your 200–500 case eval | 40–50% |
| Latency | p95 TTFT and total time at your prompt sizes | 15–25% |
| Cost | $ per *successful* task (incl. retries) | 15–25% |
| Reliability | error/429 rate, schema validity | 10% |
| Ops/strategic | vendor lock-in, fine-tunability, deprecation policy | 5–10% |

**Cost per successful task** = (tokens × price) / success rate, plus the cost of handling failures (retries, human review). A model at half the price with a 20-point lower pass rate is often more expensive overall.

**Pareto view:** plot quality vs cost; discard models that are worse on both axes (dominated). Then choose per *use case*: the extraction pipeline and the reasoning-heavy agent can use different models, joined by a router.

**Re-select regularly:** new releases every few months shift the frontier. Keep the eval harness and matrix automated so a new candidate is scored in hours, and record the exact model id/version used.

**When to use:** at project start, on every major model release, and whenever cost or latency targets change.`,
      example: `Use case: invoice field extraction, 40k docs/day, ~3k input + 300 output tokens, p95 latency < 4 s, EU residency required.
| Model (illustrative) | Pass rate | p95 | $/1M in/out | $ per success |
|---|---|---|---|---|
| Frontier A | 96% | 3.1 s | 3 / 15 | (0.009 + 0.0045) / 0.96 = $0.0141 |
| Mid B | 93% | 1.8 s | 0.40 / 1.60 | (0.0012 + 0.00048) / 0.93 = $0.0018 |
| Small C | 81% | 1.1 s | 0.10 / 0.40 | (0.0003 + 0.00012) / 0.81 = $0.0005 |
Small C fails 19%, each failure needs ~$0.20 of human review → effective ~$0.038 per task; Mid B: 7% × $0.20 + $0.0018 ≈ $0.016; Frontier A: 4% × $0.20 + $0.0141 ≈ $0.022. **Mid B wins**, and A is kept as a router fallback for low-confidence docs.`,
      diagram: `  candidates (10+)
       |
       v  hard constraints: context, modality, residency, licence, QPS
  survivors (3-5)
       |
       v  run YOUR eval set (same prompts, temp, harness)
  +-----------------------------------------------+
  | quality | p95 latency | $/success | errors    |
  +-----------------------------------------------+
       |
       v  drop Pareto-dominated, weight remaining criteria
  choice per use case  -->  pin model id/version  --> re-run on new releases`,
      code: [
        {
          language: 'typescript',
          title: 'Selection matrix: hard constraints, cost per success, Pareto filter, weighted score',
          code: `type Candidate = {
  id: string; contextK: number; euResidency: boolean;
  passRate: number; p95Ms: number;             // from YOUR eval run
  inPerM: number; outPerM: number;              // illustrative $ per 1M tokens
};
type Need = { contextK: number; euResidency: boolean; inTok: number; outTok: number;
              failureCost: number; p95BudgetMs: number };

const costPerTask = (c: Candidate, n: Need) =>
  (n.inTok * c.inPerM + n.outTok * c.outPerM) / 1e6 + (1 - c.passRate) * n.failureCost;

export function select(cands: Candidate[], need: Need) {
  const ok = cands.filter((c) => c.contextK >= need.contextK &&
    (!need.euResidency || c.euResidency) && c.p95Ms <= need.p95BudgetMs);
  const rows = ok.map((c) => ({ ...c, cost: costPerTask(c, need) }));
  // Pareto: drop anything another candidate beats on both quality and cost
  const pareto = rows.filter((a) => !rows.some((b) =>
    b !== a && b.passRate >= a.passRate && b.cost <= a.cost &&
    (b.passRate > a.passRate || b.cost < a.cost)));
  const maxCost = Math.max(...pareto.map((r) => r.cost));
  return pareto
    .map((r) => ({ id: r.id, cost: +r.cost.toFixed(4), passRate: r.passRate,
      score: 0.5 * r.passRate + 0.3 * (1 - r.cost / maxCost) + 0.2 * (1 - r.p95Ms / need.p95BudgetMs) }))
    .sort((a, b) => b.score - a.score);
}`,
        },
      ],
      prosCons: {
        pros: [
          'Turns model choice into a repeatable, auditable decision instead of opinion.',
          'Cost per successful task exposes hidden costs of cheap-but-unreliable models.',
          'Per-use-case selection lets each workload use the best-value model.',
        ],
        cons: [
          { con: 'Public leaderboards rarely match your task distribution.', fix: 'Use leaderboards only to shortlist; decide on a 200–500 case eval built from real traffic.' },
          { con: 'Evals go stale and models get silently updated behind aliases.', fix: 'Pin dated model versions, re-run the matrix on each release and monthly on a fresh traffic sample.' },
          { con: 'Weights in the scoring are subjective.', fix: 'Agree weights with product up front and show the Pareto chart so the trade-off is visible, not hidden in a single score.' },
        ],
      },
      keyPoints: [
        'Hard constraints first, then scored trade-offs.',
        'Quality from your eval; cost per successful task; p95 latency.',
        'Drop Pareto-dominated options before weighting.',
        'Pin versions and re-select on every major release.',
      ],
      exercise: {
        prompt: `Write \`paretoFront(rows)\` where each row has \`{ id, quality, cost }\` (higher quality better, lower cost better). Return ids of non-dominated rows sorted by cost ascending.

Acceptance: for A(0.96, 0.022), B(0.93, 0.016), C(0.81, 0.038), D(0.93, 0.020) → ["B", "A"] (C and D are dominated by B).`,
        hints: [
          'Row a is dominated if some b has quality ≥ a.quality and cost ≤ a.cost, strictly better in at least one.',
          'Check every pair; n is small so O(n²) is fine.',
          'Sort the survivors by cost before mapping to ids.',
        ],
        solution: {
          language: 'typescript',
          code: `type Row = { id: string; quality: number; cost: number };

export function paretoFront(rows: Row[]): string[] {
  const dominated = (a: Row) =>
    rows.some((b) => b !== a && b.quality >= a.quality && b.cost <= a.cost &&
      (b.quality > a.quality || b.cost < a.cost));
  return rows.filter((r) => !dominated(r)).sort((a, b) => a.cost - b.cost).map((r) => r.id);
}

console.log(paretoFront([
  { id: 'A', quality: 0.96, cost: 0.022 },
  { id: 'B', quality: 0.93, cost: 0.016 },
  { id: 'C', quality: 0.81, cost: 0.038 },
  { id: 'D', quality: 0.93, cost: 0.020 },
])); // [ 'B', 'A' ]`,
        },
        explanation: 'Dominated options can never be the right choice under any weighting, so removing them first simplifies the decision to a trade-off along the frontier (here: pay ~$0.006 more per task for +3 points with A).',
      },
      quickCheck: {
        question: 'Model X costs $0.002 per task with 70% success; model Y costs $0.010 with 95% success. Each failure costs $0.10 in human review. Which is cheaper per task overall?',
        options: [
          'X: $0.032 vs Y: $0.015, so Y is cheaper',
          'X: $0.002 vs Y: $0.010, so X is cheaper',
          'They cost the same',
          'X: $0.012 vs Y: $0.020, so X is cheaper',
        ],
        correct: 0,
        explanation: 'X = 0.002 + 0.30 × 0.10 = $0.032; Y = 0.010 + 0.05 × 0.10 = $0.015. Token price alone hides failure handling, which dominates here.',
      },
      source: 'FrugalGPT (Chen et al. 2023); provider model pages and pricing (illustrative)',
    },
    {
      heading: 'Fallback Models — fallback chains, circuit breakers and retry budgets',
      body: `**Intuition:** a fallback chain is a backup generator: when mains power (your primary model) fails, the lights stay on, maybe dimmer. A circuit breaker is the fuse that stops you hammering a failing provider and making things worse.

**Failure modes to plan for:** 429 rate limits, 5xx / overloaded (e.g. 529), regional outages, timeouts and stalled streams, content-filter refusals, and silent quality regressions after a model update.

**A typical chain:**
1. Primary model, primary region (timeout: TTFT 2–5 s, total 30–60 s).
2. **Same model** via another region or provider (e.g. vendor API → cloud marketplace), with identical prompts and nearly identical behaviour.
3. **Comparable model** from another vendor, with its own tested prompt variant.
4. **Smaller/cheaper model** with a degraded-mode notice, or a cached/static response for read-only questions.

**Circuit breaker per (provider, model):**
- **Closed:** calls flow; track failures in a rolling window.
- **Open:** after e.g. 5 consecutive failures or >50% errors in 30 s, skip this hop immediately for a cool-down (30–60 s).
- **Half-open:** let one probe through; success closes, failure re-opens.

**Retries:** only on retryable errors (429, 5xx, timeouts, connection resets), with exponential backoff + jitter, honouring \`retry-after\`, and a **retry budget** (e.g. retries ≤ 10–20% of requests) so a provider outage does not become a self-inflicted traffic storm. Never retry 400/401/content-policy errors.

**Streaming caveat:** once tokens have been sent to the user, switching models mid-stream is visible; fall back only before the first token or restart the answer explicitly.

**When to use:** every production LLM feature with an availability target. Monitor fallback rate and quality per hop: a fallback that is never exercised will fail when you need it.`,
      example: `On a Monday, the primary provider returns 529 "overloaded" for 22 minutes on 60% of calls. Without breakers: each request tries primary (2 retries, 1 s + 2 s backoff, 10 s timeout) before falling back, so p95 latency jumps from 3 s to 24 s and retries triple load on the struggling provider. With a breaker (open after 50% errors in 20 s, 45 s cool-down, half-open probe): after ~20 s the breaker opens, requests go straight to the secondary (same model via a cloud marketplace), p95 is 3.6 s, and only one probe per 45 s hits the primary. Fallback rate dashboard: 61% for 22 minutes, then back to 0.4%; no user-visible errors.`,
      diagram: `  request
     |
     v
  [hop 1: primary]--breaker open?--yes--+
     | no                               |
     v                                  |
  call (TTFT timeout 3s, 1 retry) --fail+--> [hop 2: same model, other region]
     | ok                                          | fail / open
     v                                             v
  response                       [hop 3: other vendor model + its prompt]
                                                   | fail / open
                                                   v
                                [hop 4: small model / cached answer + notice]

  breaker: CLOSED --N failures--> OPEN --cool-down--> HALF-OPEN --ok--> CLOSED`,
      code: [
        {
          language: 'typescript',
          title: 'Fallback chain with per-hop circuit breakers, timeouts and retryable-error checks',
          code: `import OpenAI from 'openai';

type Hop = { name: string; client: OpenAI; model: string; timeoutMs: number };

class Breaker {
  private failures = 0;
  private openedAt = 0;
  constructor(private threshold = 5, private coolDownMs = 45_000) {}
  canPass(now = Date.now()) {
    if (this.failures < this.threshold) return true;            // closed
    return now - this.openedAt >= this.coolDownMs;              // half-open probe
  }
  success() { this.failures = 0; }
  failure(now = Date.now()) {
    this.failures++;
    if (this.failures >= this.threshold) this.openedAt = now;  // (re)open
  }
}
const breakers = new Map<string, Breaker>();
const retryable = (e: unknown) => {
  const s = (e as { status?: number }).status;
  return s === undefined || s === 408 || s === 429 || s >= 500;  // network/timeout too
};

export async function completeWithFallback(hops: Hop[], messages: OpenAI.ChatCompletionMessageParam[]) {
  const errors: string[] = [];
  for (const hop of hops) {
    const br = breakers.get(hop.name) ?? new Breaker();
    breakers.set(hop.name, br);
    if (!br.canPass()) { errors.push(hop.name + ': breaker open'); continue; }
    try {
      const res = await hop.client.chat.completions.create(
        { model: hop.model, messages },
        { timeout: hop.timeoutMs, maxRetries: 1 },               // per-hop budget
      );
      br.success();
      return { hop: hop.name, text: res.choices[0]?.message?.content ?? '' };
    } catch (e) {
      if (!retryable(e)) throw e;                                // 400/401/policy: don't mask
      br.failure();
      errors.push(hop.name + ': ' + String((e as Error).message));
    }
  }
  throw new Error('All hops failed: ' + errors.join(' | '));
}`,
        },
      ],
      prosCons: {
        pros: [
          'Keeps the feature available through provider outages, rate limits and regional incidents.',
          'Breakers protect both your latency and the struggling provider from retry storms.',
          'Degraded modes (smaller model, cached answers) are better than errors for most users.',
        ],
        cons: [
          { con: 'Fallback models behave differently: formats, tool-call quirks, refusals.', fix: 'Keep a tested prompt variant per hop and run the eval suite on every hop in CI, not just the primary.' },
          { con: 'Retries multiply load during incidents.', fix: 'Use a retry budget, exponential backoff with jitter, honour retry-after, and let breakers short-circuit failing hops.' },
          { con: 'Silent degradation: users get worse answers and nobody notices.', fix: 'Emit metrics per hop (fallback rate, quality sample scores) and alert when fallback exceeds a threshold for minutes.' },
          { con: 'Data residency or contracts may not allow every fallback provider.', fix: 'Build chains per tenant/region from an allowlist of approved providers.' },
        ],
      },
      keyPoints: [
        'Prefer "same model, different region/provider" as the first fallback.',
        'Breaker per hop: closed → open → half-open.',
        'Retry only retryable errors, with backoff, jitter and a budget.',
        'Monitor and test every hop; fall back before the first streamed token.',
      ],
      exercise: {
        prompt: `Implement a \`RetryBudget\` class that allows retries only while \`retries / requests <= ratio\` over a sliding window of the last \`windowMs\` milliseconds.

API: \`recordRequest(now)\`, \`canRetry(now): boolean\` (which also records the retry when it returns true).

Acceptance: with ratio 0.1, after 100 requests in the window at most 10 retries are allowed; old events outside the window no longer count.`,
        starter: {
          language: 'typescript',
          code: `export class RetryBudget {
  private requests: number[] = [];
  private retries: number[] = [];
  constructor(private ratio = 0.1, private windowMs = 10_000) {}

  recordRequest(now = Date.now()) {
    // TODO
  }

  canRetry(now = Date.now()): boolean {
    // TODO: prune old events, check ratio, record retry if allowed
    return false;
  }
}`,
        },
        hints: [
          'Store timestamps and drop those older than now − windowMs before checking.',
          'Allow the retry if (retries + 1) / max(requests, 1) <= ratio.',
          'Record the retry timestamp only when you allow it.',
        ],
        solution: {
          language: 'typescript',
          code: `export class RetryBudget {
  private requests: number[] = [];
  private retries: number[] = [];
  constructor(private ratio = 0.1, private windowMs = 10_000) {}

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter((t) => t > cutoff);
    this.retries = this.retries.filter((t) => t > cutoff);
  }

  recordRequest(now = Date.now()) {
    this.requests.push(now);
  }

  canRetry(now = Date.now()): boolean {
    this.prune(now);
    const allowed = (this.retries.length + 1) / Math.max(this.requests.length, 1) <= this.ratio;
    if (allowed) this.retries.push(now);
    return allowed;
  }
}

const b = new RetryBudget(0.1, 10_000);
for (let i = 0; i < 100; i++) b.recordRequest(0);
let ok = 0;
for (let i = 0; i < 50; i++) if (b.canRetry(1)) ok++;
console.log(ok); // 10`,
        },
        explanation: 'A retry budget caps extra load at a fixed fraction of normal traffic, so during an outage retries add at most ~10% load instead of multiplying it. Combined with breakers, it turns a provider incident into a quick, controlled failover rather than a cascading failure.',
      },
      quickCheck: {
        question: 'Your primary provider starts returning 400 "invalid request" errors after you changed a tool schema. What should the fallback layer do?',
        options: [
          'Retry three times with backoff, then fall back to the next provider',
          'Surface the error (no retry, no fallback) and alert, because it is a client bug that every hop would reject or mask',
          'Open the circuit breaker for the primary provider',
          'Switch permanently to the fallback provider',
        ],
        correct: 1,
        explanation: '4xx validation errors are deterministic client bugs: retrying wastes calls, falling back may hide the bug or fail identically, and opening a breaker punishes a healthy provider. Fail fast and alert.',
      },
      source: 'Martin Fowler — Circuit Breaker; AWS Builders Library — Timeouts, retries and backoff with jitter',
    },
  ],
  codeChallenges: [
    {
      id: 'model-serving-routing-cc-1',
      title: 'Turn a naive multi-provider client into a resilient fallback chain',
      context: 'A support bot calls one provider and, on any error, immediately calls a second provider with the same prompt. During a provider incident, latency hit 90 s, costs doubled, and some 400 errors from a malformed request were "fixed" by the fallback silently returning a different model\'s answer.',
      task: 'Add per-attempt timeouts, retry only retryable errors with backoff and jitter, circuit breakers per provider, per-provider prompt/model config, and metrics on which hop served the request.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';

const primary = new OpenAI({ apiKey: process.env.A_KEY, baseURL: process.env.A_URL });
const backup = new OpenAI({ apiKey: process.env.B_KEY, baseURL: process.env.B_URL });

export async function reply(messages: any[]) {
  try {
    const r = await primary.chat.completions.create({ model: 'model-a', messages });
    return r.choices[0].message.content;
  } catch {
    const r = await backup.chat.completions.create({ model: 'model-a', messages });
    return r.choices[0].message.content;
  }
}`,
      },
      hints: [
        'Default SDK timeouts are long (minutes); set explicit per-hop timeouts.',
        'Classify errors: 408/429/5xx/network are retryable, 400/401/403/422 are not.',
        'The backup provider may not host "model-a"; give each hop its own model id and prompt adapter.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';

type Msg = OpenAI.ChatCompletionMessageParam;
type Hop = { name: string; client: OpenAI; model: string; timeoutMs: number;
             adapt?: (m: Msg[]) => Msg[] };

const hops: Hop[] = [
  { name: 'A', client: new OpenAI({ apiKey: process.env.A_KEY, baseURL: process.env.A_URL }),
    model: process.env.A_MODEL ?? 'model-a', timeoutMs: 15_000 },
  { name: 'B', client: new OpenAI({ apiKey: process.env.B_KEY, baseURL: process.env.B_URL }),
    model: process.env.B_MODEL ?? 'model-b', timeoutMs: 15_000,
    adapt: (m) => [{ role: 'system', content: 'Answer concisely in plain text.' }, ...m] },
];

const state = new Map<string, { fails: number; openUntil: number }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (e: any) => e?.status === undefined || [408, 409, 429].includes(e.status) || e.status >= 500;

export async function reply(messages: Msg[], metrics = console) {
  for (const hop of hops) {
    const st = state.get(hop.name) ?? { fails: 0, openUntil: 0 };
    state.set(hop.name, st);
    if (Date.now() < st.openUntil) continue;                  // breaker open
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await hop.client.chat.completions.create(
          { model: hop.model, messages: hop.adapt ? hop.adapt(messages) : messages },
          { timeout: hop.timeoutMs, maxRetries: 0 },          // we own retries
        );
        st.fails = 0;
        metrics.info({ event: 'llm_reply', hop: hop.name, attempt });
        return r.choices[0]?.message?.content ?? '';
      } catch (e: any) {
        if (!retryable(e)) throw e;                           // never mask client bugs
        st.fails++;
        if (st.fails >= 5) { st.openUntil = Date.now() + 45_000; break; }
        const retryAfter = Number(e?.headers?.['retry-after']) * 1000;
        await sleep(retryAfter || 250 * 2 ** attempt + Math.random() * 250); // jitter
      }
    }
  }
  throw new Error('LLM unavailable: all providers failed or open');
}`,
      },
      explanation: `The original waited on default (very long) timeouts, retried every error including client bugs, sent the wrong model id to the backup, and gave no visibility. The rewrite uses per-hop timeouts, retries only retryable errors with jittered backoff honouring retry-after, opens a breaker after repeated failures so incidents fail over in milliseconds, adapts prompts per provider, and logs which hop served each request.`,
      followUps: [
        { q: 'How do you handle streaming responses in this chain?', a: 'Apply a TTFT timeout to the first chunk and only fall back before any token is forwarded to the client; after the first token, either finish or return an explicit error and let the user retry.' },
        { q: 'How would you share breaker state across 30 pods?', a: 'Keep breakers local for fast reaction but publish error rates to a shared store (e.g. Redis) or rely on the LLM gateway, so all pods converge on an open breaker within seconds.' },
      ],
    },
    {
      id: 'model-serving-routing-cc-2',
      title: 'Fix a vLLM deployment that OOMs and has terrible tail latency',
      context: 'A team serves a 70B model on 4 × A100 80 GB. The pod sometimes fails to start with "not enough KV cache memory", and when it runs, p95 TTFT is 9 s at modest load. Most prompts are under 6k tokens and share a 2k-token system prompt.',
      task: 'Rewrite the launch config with sensible context limits, parallelism, prefix caching and concurrency, and explain each change.',
      starter: {
        language: 'bash',
        code: `vllm serve meta-llama/Llama-3.3-70B-Instruct \\
  --tensor-parallel-size 2 \\
  --pipeline-parallel-size 2 \\
  --gpu-memory-utilization 0.98 \\
  --max-num-seqs 512
# max-model-len left at the model default (131072)`,
      },
      hints: [
        'A 128k max length makes vLLM require room for at least one 128k sequence in the KV pool.',
        'On a single node, tensor parallelism across all 4 GPUs is usually better for latency than TP2 × PP2.',
        'A shared 2k system prompt is the textbook case for prefix caching; 512 concurrent sequences inflate queueing and ITL.',
      ],
      solution: {
        language: 'bash',
        code: `vllm serve meta-llama/Llama-3.3-70B-Instruct \\
  --tensor-parallel-size 4 \\
  --max-model-len 16384 \\
  --gpu-memory-utilization 0.90 \\
  --enable-prefix-caching \\
  --enable-chunked-prefill \\
  --max-num-batched-tokens 8192 \\
  --max-num-seqs 128 \\
  --kv-cache-dtype fp8 \\
  --port 8000
# Why:
#  TP=4 on one NVLink node: every GPU works on every token -> lower latency than TP2xPP2
#  max-model-len 16k: covers the 6k prompts + outputs; KV pool no longer sized for 128k
#  0.90 utilisation leaves headroom for CUDA graphs / activations (0.98 OOMs at start)
#  prefix caching: the shared 2k system prompt is prefilled once, cutting TTFT
#  chunked prefill + batched-token cap: long prefills don't stall running decodes
#  max-num-seqs 128 + load test: bounded queueing; scale replicas for more load
#  fp8 KV (A100 stores fp8 KV; compute stays bf16): ~2x KV capacity`,
      },
      explanation: `Leaving max-model-len at 131k forces the KV pool to fit a full-length sequence, which together with 0.98 utilisation causes start-up OOMs. TP=4 inside one node is the latency-friendly layout; pipeline parallelism adds bubbles and is better reserved for multi-node models. Prefix caching removes repeated prefill of the shared system prompt, chunked prefill keeps decode smooth under long prompts, and a realistic max-num-seqs trades a little peak throughput for a sane tail latency.`,
      followUps: [
        { q: 'How do you confirm prefix caching is working?', a: 'Check vLLM metrics for prefix-cache hit rate (vllm:prefix_cache_hits / queries) and compare TTFT for requests with and without the shared prefix in a load test.' },
        { q: 'When would pipeline parallelism be the right choice?', a: 'When the model does not fit within one node\'s NVLink domain: use TP within each node and PP across nodes, because PP communicates far less than TP over slower inter-node links.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'model-serving-routing-iq-1',
      difficulty: 'hard',
      question: 'Your self-hosted vLLM cluster meets average latency targets but p99 TTFT spikes to 8 s several times an hour. How do you investigate and fix it?',
      whatInterviewerLooksFor: [
        'Uses server metrics: queue length, KV usage, preemptions',
        'Recognises long-prompt prefill interference',
        'Knows chunked prefill, max-num-seqs, admission control',
        'Considers autoscaling signals and routing',
      ],
      modelAnswer: `**Hypotheses for TTFT tail spikes:** queueing (bursty load beyond capacity), long prompts whose prefill blocks other requests, KV-cache exhaustion causing preemption/recompute, and cold replicas after autoscaling.

**Investigate with metrics** (vLLM Prometheus): \`num_requests_waiting\`, KV cache usage %, preemption counts, prompt-length histogram, and TTFT broken down by replica and prompt size. Correlate spikes with: arrival bursts, very long prompts (e.g. 30k-token RAG contexts), or scale-up events.

**Fixes by cause:**
- **Prefill interference:** enable chunked prefill and cap \`max-num-batched-tokens\` so a 30k prompt is processed in chunks interleaved with decodes; route very long prompts to a dedicated pool (or disaggregated prefill).
- **KV exhaustion/preemption:** lower \`max-model-len\`, use FP8 KV cache, reduce \`max-num-seqs\`, or add replicas; preemption shows as sudden latency cliffs.
- **Bursts:** admission control (queue with a max wait, return 429 with retry-after rather than queueing forever), autoscale on queue depth and KV usage rather than GPU utilisation, keep warm spare replicas because loading 140 GB of weights takes minutes.
- **Load balancing:** use least-outstanding-requests or KV-aware routing instead of round-robin; prefix-aware routing keeps cache hits.

**Validate** with a replay load test of real traffic before/after, tracking goodput at the SLO.`,
      followUps: [
        { q: 'Why is GPU utilisation a poor autoscaling metric for LLM serving?', a: 'GPUs look busy whether the batch is healthy or the queue is exploding; queue depth, KV-cache utilisation and TTFT directly reflect user-facing saturation.' },
        { q: 'What is disaggregated prefill/decode in one sentence?', a: 'Running prompt prefill and token decode on separate GPU pools and transferring the KV cache, so long prefills never stall decoding users and each pool is sized independently.' },
      ],
      pitfalls: [
        'Only looking at averages.',
        'Adding GPUs without finding the cause.',
        'Round-robin load balancing across replicas with very different queue depths.',
      ],
    },
    {
      id: 'model-serving-routing-iq-2',
      difficulty: 'hard',
      question: 'Finance asks you to cut LLM spend by 60% without users noticing. Design a routing strategy and explain how you would prove quality was preserved.',
      whatInterviewerLooksFor: [
        'Analyses traffic mix and cost drivers first',
        'Proposes router/cascade with calibrated threshold',
        'Defines quality metrics and offline + online evaluation',
        'Includes caching and prompt optimisation as complements',
      ],
      modelAnswer: `**1. Understand spend.** Break cost down by feature, prompt size, output size and model. Often 2–3 features and long contexts account for most spend.

**2. Cheap wins first:** prompt caching for long shared prefixes, trimming context (top-k retrieval tuning), max_tokens limits, and semantic caching for repeated questions; these can cut 20–40% with no model change.

**3. Routing.** Build a labelled set from real traffic (5k prompts) where both the small and strong models answer, judged by an LLM judge + human spot checks. Train a router (start with embedding kNN or a small classifier; RouteLLM-style matrix factorisation if preference data exists). Calibrate the threshold to hit the cost target: e.g. 25% strong share. Add a cascade on objective failures (schema invalid, tool error) for safety.

**4. Prove quality offline:** on a held-out set, compare routed vs all-strong: pass rate, judge win rate (target: non-inferior within 2 points), and per-segment checks (languages, enterprise tenants, long prompts).

**5. Prove online:** A/B test 10% of traffic for 2 weeks with guardrail metrics: thumbs-down rate, escalation to humans, task completion, retention. Use a non-inferiority test rather than "no significant difference".

**6. Operate:** dashboard of route share, cost/request, quality samples per route; recalibrate monthly and on model releases.`,
      followUps: [
        { q: 'The router sends 90% of enterprise traffic to the small model and they complain. Fix?', a: 'Add tenant tier as a feature or a policy override (enterprise → higher strong share), and evaluate per segment so averages do not hide high-value-customer regressions.' },
        { q: 'How do you avoid the router becoming stale?', a: 'Log outcomes per route, sample-judge small-model answers continuously, retrain/recalibrate when the measured quality gap moves or new models change prices.' },
      ],
      pitfalls: [
        'Jumping to routing before cheap caching/prompt wins.',
        'Evaluating only on averages.',
        'Treating "not statistically different" as proof of equal quality.',
      ],
    },
    {
      id: 'model-serving-routing-iq-3',
      difficulty: 'expert',
      question: 'Design the fallback strategy for a customer-facing assistant with a 99.95% availability SLO that currently depends on one LLM provider.',
      context: 'Peak 300 requests/s, streaming responses, EU customers require EU data residency.',
      whatInterviewerLooksFor: [
        'Computes the availability gap and need for redundancy',
        'Multi-region / multi-provider chain respecting residency',
        'Circuit breakers, retry budgets, streaming-aware failover',
        'Testing fallbacks (chaos drills) and monitoring',
        'Capacity reservation for failover traffic',
      ],
      modelAnswer: `**Availability maths.** 99.95% allows ~22 minutes of downtime per month. Single providers have had multi-hour incidents, so one dependency cannot meet the SLO; two independent paths at 99.5% each give ~99.9975% if failures are independent.

**Chain (EU tenants):**
1. Primary model in provider EU region.
2. Same model via a cloud marketplace in another EU region (independent infrastructure, same behaviour).
3. Different vendor's comparable model hosted in the EU, with its own tested prompt variant.
4. Self-hosted open-weights model (e.g. on reserved EU GPUs) in degraded mode, plus cached answers for top FAQs.
Non-EU tenants get a wider allowlist. The chain is configured per tenant from an approved-provider list.

**Mechanics:** gateway-level breakers per (provider, region, model) with shared state; TTFT timeout of ~3 s for streams, failover only before the first token; retry budget 10%; respect retry-after; idempotency keys for tool side effects.

**Capacity:** failover hops must absorb 300 req/s: reserve provisioned throughput or rate limits on hop 2 sized for 100% of peak, and hop 3 for at least 50%.

**Monitoring:** per-hop success, TTFT, fallback rate, judge-sampled quality per hop; alert when fallback > 5% for 5 minutes.

**Testing:** monthly game days that force-open hop 1 in production for a slice of traffic; CI evals run on every hop so prompts stay compatible.`,
      followUps: [
        { q: 'Why is "same model, different provider/region" preferred as the first hop?', a: 'Behaviour, prompts, tool formats and evals carry over unchanged, so failover is invisible to users; switching vendors risks format differences and quality shifts.' },
        { q: 'How do you avoid correlated failures?', a: 'Check that hops do not share the same underlying cloud region, quota pool or upstream; independent infrastructure is what makes the availability multiplication valid.' },
      ],
      pitfalls: [
        'Fallbacks that violate data residency.',
        'Never testing fallback paths until an incident.',
        'Not reserving capacity on the fallback for full traffic.',
      ],
    },
    {
      id: 'model-serving-routing-iq-4',
      difficulty: 'hard',
      question: 'A new model claims to beat your current one on public benchmarks at half the price. How do you decide whether to switch?',
      whatInterviewerLooksFor: [
        'Skepticism of public benchmarks vs own eval',
        'Measures cost per successful task and latency at real prompt sizes',
        'Checks constraints: residency, rate limits, tool calling, context',
        'Plans shadow/A-B rollout with rollback',
      ],
      modelAnswer: `**1. Constraints check (hours):** context window, tool calling/structured outputs, data retention and residency terms, rate limits at our peak, SLAs, deprecation policy. Fail any → stop.

**2. Offline eval (1–2 days):** run our eval suite (e.g. 400 cases across features and segments) with the same harness, prompts adapted minimally. Measure pass rate, schema validity, refusal rate, p50/p95 latency at our real prompt sizes, and **cost per successful task** (token counts differ across tokenizers: the same text can be 10–20% more tokens, so "half the price" may be less).

**3. Look for regressions per segment:** languages, long context, tool-use flows. A +2 average with −10 on one segment may be unacceptable.

**4. Shadow traffic (1 week):** mirror a sample of production requests, judge outputs pairwise against the current model, compare latency and error rates under real load.

**5. Canary/A-B:** 5% → 25% → 100% with guardrail metrics (thumbs-down, escalations, task success) and an instant rollback switch at the gateway.

**6. Record:** pinned model version, eval report, decision rationale in the model registry; keep the old model as a fallback hop for a while.`,
      followUps: [
        { q: 'Why can "half the price" be misleading?', a: 'Tokenizers differ, so the same prompt can cost more tokens; reasoning models may emit many hidden thinking tokens; and lower success rates add retry and human-review costs.' },
        { q: 'What if quality is equal but latency is worse?', a: 'Check whether latency matters for that feature: route latency-sensitive interactive traffic to the old model and batch/async workloads to the cheaper one.' },
      ],
      pitfalls: [
        'Switching based on leaderboard scores.',
        'Comparing price per token instead of cost per success.',
        'No rollback path.',
      ],
    },
    {
      id: 'model-serving-routing-iq-5',
      difficulty: 'expert',
      question: 'Compare vLLM, SGLang and TensorRT-LLM for a workload of multi-turn agent conversations with long shared tool definitions, and explain which engine features matter most.',
      whatInterviewerLooksFor: [
        'Identifies prefix reuse as the dominant optimisation',
        'Explains RadixAttention vs vLLM automatic prefix caching',
        'Mentions structured outputs / tool-call constrained decoding',
        'Benchmarks with realistic traces; considers ops and hardware',
      ],
      modelAnswer: `**Workload shape:** each turn resends a long, mostly identical prefix (system prompt + 5–10k tokens of tool schemas + conversation history) and appends a few hundred tokens. Without reuse, every turn re-prefills thousands of tokens, so TTFT and GPU cost are dominated by redundant prefill.

**Engine features that matter:**
- **Prefix caching:** SGLang's RadixAttention keeps KV blocks in a radix tree across requests and reuses the longest matching prefix automatically, with cache-aware scheduling; vLLM's automatic prefix caching (hash-based blocks) achieves similar reuse. TensorRT-LLM supports KV-cache reuse too.
- **Cache-aware routing:** across replicas, route a conversation to the replica that holds its prefix (session affinity or prefix-hash routing), otherwise hit rates collapse as you scale out.
- **Structured outputs:** agents need valid tool-call JSON; SGLang and vLLM support grammar/JSON-schema constrained decoding (xgrammar-style backends) with low overhead.
- **Throughput at peak:** TensorRT-LLM often leads raw performance on NVIDIA with FP8/FP4 engines, at the cost of an engine build step and narrower model/hardware support.

**Recommendation:** benchmark SGLang and vLLM with replayed agent traces (measure prefix-hit rate, TTFT, goodput); choose SGLang if its prefix reuse and structured-output speed win on our traces, vLLM if we need broader model support, multi-LoRA or hardware variety. Consider TensorRT-LLM only for a stable, single-model, NVIDIA-only fleet where peak efficiency justifies the build pipeline. TGI is out: maintenance mode.`,
      followUps: [
        { q: 'How would provider-side prompt caching change this analysis for API models?', a: 'The same principle applies: keep tool definitions and system prompts as a stable prefix in a fixed order so provider prompt caching hits, cutting TTFT and input cost for cached tokens.' },
        { q: 'What breaks prefix caching accidentally?', a: 'Anything that changes early tokens: timestamps or request ids in the system prompt, reordering tool definitions, or per-user content placed before the shared prefix.' },
      ],
      pitfalls: [
        'Benchmarking with single-turn synthetic prompts.',
        'Ignoring cache-aware routing across replicas.',
        'Putting dynamic content at the start of the prompt.',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'model-serving-routing-est-1',
      question: 'How many H100 GPUs do you need to serve an 8B model at a peak of 150 requests/s, with 1,200-token prompts and 250-token outputs, under a TTFT < 500 ms and ITL < 25 ms SLO?',
      assumptions: [
        'Load test: one H100 running vLLM sustains ~6,000 output tokens/s within the SLO (at ~64 concurrent sequences)',
        'Prefill throughput is far higher (~40k prompt tokens/s per GPU) and interleaved via chunked prefill',
        'Target ≤ 70% utilisation at peak for headroom; N+1 for failures',
      ],
      steps: [
        { label: 'Output tokens/s at peak', calc: '150 req/s × 250 tokens = 37,500 tokens/s' },
        { label: 'Prompt tokens/s at peak', calc: '150 × 1,200 = 180,000 tokens/s → 180k / 40k ≈ 4.5 GPU-equivalents of prefill capacity, overlapping with decode' },
        { label: 'Decode GPUs', calc: '37,500 / 6,000 ≈ 6.25 GPUs' },
        { label: 'Headroom', calc: '6.25 / 0.7 ≈ 8.9 → 9 GPUs' },
        { label: 'Redundancy', calc: '9 + 1 = 10 GPUs (sanity check: the 6,000 tok/s figure already includes interleaved prefill in the load test)' },
      ],
      answer: 'About 10 H100s (9 for load at 70% utilisation plus one spare), assuming the measured per-GPU goodput of ~6,000 output tokens/s already includes interleaved prefill.',
      insight: 'Capacity planning must use goodput measured under the SLO with realistic prompt/output lengths. Prompt-heavy traffic makes prefill a large share of GPU time, which is why prefix caching (shared system prompts) or disaggregated prefill can cut GPU count noticeably.',
      followUps: [
        { q: 'If 70% of the prompt is a shared 840-token system prompt, what changes?', a: 'With prefix caching, only ~360 tokens per request need prefill, cutting prefill work by ~70%; per-GPU goodput rises, so the fleet could drop to roughly 7–8 GPUs; verify with a load test.' },
      ],
    },
    {
      id: 'model-serving-routing-est-2',
      question: 'Estimate monthly savings from routing 3M requests/month between a strong and a small model, including router overhead and escalations.',
      assumptions: [
        'Average request: 1,500 input + 400 output tokens',
        'Illustrative prices: strong $3 / $15 per 1M in/out; small $0.20 / $0.80',
        'Router (embedding + classifier) costs ~$0.00002 per request',
        'Router sends 35% to strong; cascade escalates 8% of the small-routed requests to strong (those pay for both calls)',
      ],
      steps: [
        { label: 'Strong cost per request', calc: '1,500 × $3/1M + 400 × $15/1M = $0.0045 + $0.0060 = $0.0105' },
        { label: 'Small cost per request', calc: '1,500 × $0.20/1M + 400 × $0.80/1M = $0.0003 + $0.00032 = $0.00062' },
        { label: 'All-strong baseline', calc: '3M × $0.0105 = $31,500/month' },
        { label: 'Routed', calc: '0.35 × 3M × 0.0105 = $11,025; 0.65 × 3M × 0.00062 = $1,209; escalations 0.08 × 0.65 × 3M × 0.0105 = $1,638; router 3M × 0.00002 = $60' },
        { label: 'Total and savings', calc: '$11,025 + $1,209 + $1,638 + $60 ≈ $13,930 → saves ≈ $17,570 (56%)' },
      ],
      answer: 'About $13.9k/month vs $31.5k all-strong, saving roughly $17.6k (56%), with the strong-model share (35% + 5.2% escalations ≈ 40%) as the main cost driver.',
      insight: 'Savings depend almost entirely on the strong-model share; small-model and router costs are rounding errors. Improving the router to safely move 10 more points of traffic to the small model is worth ~$3k/month here, which tells you how much engineering effort routing quality deserves.',
      followUps: [
        { q: 'What if escalation rate doubles to 16%?', a: 'Escalation cost rises to ~$3,276, total ≈ $15.6k, savings drop to ~50%; still worthwhile, but the cascade validator or router needs attention.' },
      ],
    },
  ],
  test: [
    {
      id: 'model-serving-routing-mcq-01',
      difficulty: 'medium',
      question: 'Which techniques are central to vLLM\'s throughput advantage over naive HF generate() serving? Select ALL that apply.',
      options: [
        'Continuous (iteration-level) batching of requests',
        'PagedAttention: KV cache stored in fixed-size blocks allocated on demand',
        'Training a smaller draft model automatically for every deployment',
        'An OpenAI-compatible HTTP API',
      ],
      correct: [0, 1],
      explanation: 'Continuous batching keeps the GPU busy as requests come and go, and PagedAttention nearly eliminates KV fragmentation, enabling bigger batches. The OpenAI-compatible API is convenient but does not affect throughput, and vLLM does not train draft models automatically.',
      followUps: [
        { q: 'What KV waste did the vLLM paper report versus prior systems?', a: 'Under 4% waste with PagedAttention compared with roughly 60–80% wasted KV memory from contiguous pre-allocation and fragmentation in earlier systems.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-02',
      difficulty: 'medium',
      question: 'Users complain the chat "takes long to start answering" but then streams quickly. Which metric captures this and what usually drives it?',
      options: [
        'TTFT, driven by queueing and prompt prefill time',
        'ITL, driven by decode speed',
        'Throughput, driven by GPU count',
        'Output length, driven by max_tokens',
      ],
      correct: [0],
      explanation: 'Time to first token covers waiting in the queue plus prefilling the prompt. Fast streaming afterwards means inter-token latency is fine; throughput and output length do not describe the start delay.',
      followUps: [
        { q: 'Name two fixes for high TTFT with long shared system prompts.', a: 'Enable prefix caching (or provider prompt caching) so the shared prefix is not re-prefilled, and use chunked prefill/admission control so bursts do not queue behind long prompts.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-03',
      difficulty: 'hard',
      question: 'This vLLM pod crash-loops at start-up with an error that the KV cache cannot hold one full-length sequence. Which change most directly fixes it?',
      code: {
        language: 'bash',
        code: `vllm serve Qwen/Qwen3-32B --gpu-memory-utilization 0.85
# 1 x H100 80 GB, model default context 131072 tokens`,
      },
      options: [
        'Add --max-model-len 32768 so the KV pool only needs to fit 32k-token sequences',
        'Lower --gpu-memory-utilization to 0.5',
        'Add --max-num-seqs 512',
        'Add --enable-prefix-caching',
      ],
      correct: [0],
      explanation: 'vLLM must be able to hold at least one max-length sequence. With ~65 GB of bf16 weights, ~3 GB remains for KV, far less than a 131k context needs (~256 KB/token → ~32 GB). Capping max-model-len (or FP8 weights/KV) fixes it. Lowering utilisation shrinks the KV pool further, more sequences need more memory, and prefix caching does not change the minimum requirement.',
      followUps: [
        { q: 'How much KV room does 32k need for Qwen3-32B in fp16?', a: '64 layers × 2 × 8 KV heads × 128 × 2 B = 256 KB per token, so 32,768 tokens ≈ 8.6 GB; still too much for ~3 GB, so you would also use FP8 weights (~33 GB) or a 2-GPU tensor-parallel setup.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-04',
      difficulty: 'hard',
      question: 'Which statements about LLM routers and cascades are correct? Select ALL that apply.',
      options: [
        'A predictive router decides before calling any model; a cascade calls the cheap model first and escalates on validated failure',
        'Router thresholds should be calibrated to a target strong-model share and re-checked on quality',
        'Cascades always reduce latency compared with calling the strong model directly',
        'RouteLLM-style routers can be trained on human preference data such as Chatbot Arena comparisons',
      ],
      correct: [0, 1, 3],
      explanation: 'Routers predict, cascades verify; thresholds act as a cost dial that must be validated for quality; RouteLLM trained on Arena preference data. Cascades add latency for escalated requests (two sequential calls), so they do not always reduce latency.',
      followUps: [
        { q: 'When is a cascade preferable to a predictive router?', a: 'When you have a cheap, reliable validator (schema checks, unit tests, grounding checks) but no labelled data to train a router.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-05',
      difficulty: 'hard',
      question: 'What is wrong with this router calibration?',
      code: {
        language: 'typescript',
        code: `// scores from the router on 2,000 validation prompts
const sorted = [...scores].sort((a, b) => a - b);    // ascending
const threshold = sorted[Math.floor(0.25 * sorted.length)];
// route to STRONG when score >= threshold, intending 25% strong traffic`,
      },
      options: [
        'With ascending order, the 25th-percentile value sends ~75% of traffic to the strong model; it should use the 75th percentile (or sort descending)',
        'Nothing; this sends 25% to the strong model',
        'Thresholds must always be 0.5',
        'Math.floor should be Math.round',
      ],
      correct: [0],
      explanation: 'Scores ≥ the 25th percentile are the top 75% of traffic, tripling the strong-model share and cost. For a 25% strong share, use the value at the 75th percentile of ascending scores. A fixed 0.5 ignores calibration, and rounding is not the issue.',
      followUps: [
        { q: 'How do you catch this class of bug in production?', a: 'Monitor the realised strong-route share and cost per request against the calibration target and alert if they drift beyond a tolerance.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-06',
      difficulty: 'hard',
      question: 'Which items belong in the "hard constraints" stage of a model selection process rather than the weighted score? Select ALL that apply.',
      options: [
        'EU data residency required by contract',
        'Minimum 64k context window for the document workflow',
        '2 points higher pass rate on the eval',
        'Native image input for a receipts feature',
      ],
      correct: [0, 1, 3],
      explanation: 'Residency, a required context length and required modalities are pass/fail: a model that fails them cannot be used regardless of score. Eval pass rate is a continuous trade-off that belongs in the weighted comparison.',
      followUps: [
        { q: 'Why separate constraints from scores at all?', a: 'Otherwise a high score on other criteria can compensate for a disqualifying gap, and you end up "choosing" a model you are not allowed to use.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-07',
      difficulty: 'hard',
      question: 'Your primary provider has a 15-minute outage. Without circuit breakers, each request tries primary with 3 retries before falling back. What happens?',
      options: [
        'Latency balloons because every request waits through timeouts and retries on the dead provider, and retry traffic amplifies load',
        'Nothing changes because the fallback is used eventually',
        'Costs fall because failed calls are free',
        'The SDK automatically opens a breaker after the first failure',
      ],
      correct: [0],
      explanation: 'Each request pays the full timeout × retry cost before reaching the fallback, so p95 latency explodes and the provider sees up to 4× traffic. Breakers skip a known-bad hop instantly. "Eventually" is too slow for users, and standard SDKs retry but do not implement breakers for you.',
      followUps: [
        { q: 'What triggers half-open state?', a: 'A cool-down timer after opening; the next request becomes a probe, and its success closes the breaker while failure re-opens it for another cool-down.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-08',
      difficulty: 'medium',
      question: 'Which errors should a fallback layer typically retry or fail over on? Select ALL that apply.',
      options: ['429 Too Many Requests', '503 / 529 overloaded', '401 Unauthorized', 'Request timeout / connection reset'],
      correct: [0, 1, 3],
      explanation: 'Rate limits, overload and transient network failures are retryable (with backoff and retry-after). 401 is a configuration error that will fail identically on retry; it should alert, not be masked.',
      followUps: [
        { q: 'What about a content-policy refusal error?', a: 'Do not blindly fail over: another provider may produce disallowed content, and policy errors are deterministic. Handle them explicitly (user message, review queue).' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-09',
      difficulty: 'hard',
      question: 'You fall back from Model A to Model B mid-stream after 120 tokens were already sent to the user, restarting generation on B. What is the main problem?',
      options: [
        'The user sees a partial answer followed by a different, possibly contradictory answer; failover should happen before the first token or the restart must be explicit',
        'Model B cannot accept the same messages',
        'Streaming does not support fallbacks at all',
        'Model B will charge for the 120 tokens already generated',
      ],
      correct: [0],
      explanation: 'Once tokens are shown, a silent switch produces duplicated or inconsistent text. Use a TTFT timeout to fail over before streaming starts; after that, finish, or clear the message and restart visibly. Message compatibility and billing are not the core issue.',
      followUps: [
        { q: 'Could you continue the partial answer on Model B instead?', a: 'Yes, by sending the partial text as an assistant prefix where supported, but style and facts may shift, so it is usually reserved for long generations where restarting is costly.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-10',
      difficulty: 'expert',
      question: 'This breaker never reopens once it has opened. Why?',
      code: {
        language: 'typescript',
        code: `class Breaker {
  fails = 0; openedAt = 0;
  canPass() { return this.fails < 5 || Date.now() - this.openedAt > 30_000; }
  onSuccess() { this.fails = 0; }
  onFailure() { this.fails++; if (this.fails === 5) this.openedAt = Date.now(); }
}`,
      },
      options: [
        'After the cool-down, a failed half-open probe makes fails = 6, so openedAt is never updated and canPass stays true forever',
        'canPass should use >= instead of >',
        'onSuccess should not reset fails',
        'Date.now() is not monotonic, so the breaker cannot work',
      ],
      correct: [0],
      explanation: 'openedAt is only set when fails equals exactly 5. A failing probe pushes fails to 6, leaving openedAt stale, so Date.now() − openedAt stays > 30 s and every request passes: the breaker is effectively closed while the provider is down. Use fails >= threshold when re-opening. The comparison operator and Date.now() precision are minor details.',
      followUps: [
        { q: 'Why add a cap on half-open probes?', a: 'Without it, every request arriving after the cool-down becomes a probe, sending a burst to a provider that may still be down; allow one (or a few) probes at a time.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-11',
      difficulty: 'expert',
      question: 'Which practices improve prefix-cache hit rates in a multi-replica serving deployment? Select ALL that apply.',
      options: [
        'Prefix- or session-affinity routing so related requests land on the replica holding their KV blocks',
        'Placing a per-request timestamp at the very start of the system prompt',
        'Keeping tool definitions in a stable order at the beginning of the prompt',
        'Using round-robin load balancing to spread conversations evenly',
      ],
      correct: [0, 2],
      explanation: 'Caches match exact token prefixes per replica, so affinity routing and stable prefix ordering raise hit rates. A timestamp at the start changes the first tokens of every request (zero reuse), and round-robin scatters a conversation across replicas so each misses.',
      followUps: [
        { q: 'Where should per-request dynamic data go instead?', a: 'At the end of the prompt (after the shared system prompt, tools and history), so the long common prefix stays identical and cacheable.' },
      ],
    },
    {
      id: 'model-serving-routing-mcq-12',
      difficulty: 'expert',
      question: 'You run TP=2 × PP=2 for a 70B model on one 4-GPU NVLink node and see poor latency. Why is TP=4 usually better here?',
      options: [
        'Pipeline parallelism introduces stage bubbles and sequential stage latency per token, while TP over fast NVLink splits every layer across all 4 GPUs',
        'PP is not supported by vLLM',
        'TP=4 uses less total GPU memory for weights',
        'TP removes the need for a KV cache',
      ],
      correct: [0],
      explanation: 'Within one NVLink node, tensor parallelism\'s all-reduces are cheap and each token uses all GPUs in parallel. PP processes layers in sequence across stages, adding per-token latency and bubbles at low batch. PP is supported and is useful across nodes; TP does not reduce total weight memory or remove the KV cache.',
      followUps: [
        { q: 'When is PP preferable?', a: 'Across nodes connected by slower networks (InfiniBand/Ethernet), where TP\'s frequent all-reduces would be too costly: TP inside each node, PP between nodes.' },
      ],
    },
  ],
};

export default topic;
