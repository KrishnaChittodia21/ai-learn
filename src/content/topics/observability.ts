import type { Topic } from '../../types';

const topic: Topic = {
  id: 'observability',
  phase: 'llmops',
  order: 1,
  title: 'LLM Observability, Tracing, Tokens and Latency',
  subtitle:
    'See inside every LLM request: OpenTelemetry gen_ai spans, RAG traces, per-tenant token and cost attribution, and TTFT/TPOT/p95 latency SLOs.',
  estimatedMinutes: 52,
  sources: [
    'OpenTelemetry — Semantic conventions for generative AI (gen_ai.* spans, metrics, Anthropic/OpenAI pages): https://opentelemetry.io/docs/specs/semconv/gen-ai/',
    'OpenTelemetry GenAI semantic conventions repository: https://github.com/open-telemetry/semantic-conventions-genai',
    'Langfuse docs — Tracing, observations, sessions, cost tracking: https://langfuse.com/docs',
    'LangSmith docs — Observability and tracing: https://docs.smith.langchain.com/',
    'Arize Phoenix docs — OpenInference tracing: https://arize.com/docs/phoenix',
    'Anthropic docs — Prompt caching (usage fields cache_creation_input_tokens / cache_read_input_tokens): https://platform.claude.com/docs/en/build-with-claude/prompt-caching',
    'OpenAI docs — Prompt caching (usage cached_tokens): https://developers.openai.com/api/docs/guides/prompt-caching',
    'Google SRE Workbook — Implementing SLOs and error budgets: https://sre.google/workbook/implementing-slos/',
    'vLLM docs — Production metrics (TTFT, TPOT / inter-token latency): https://docs.vllm.ai/en/latest/usage/metrics.html',
  ],
  tags: ['llmops', 'observability', 'opentelemetry', 'tracing', 'langfuse', 'tokens', 'cost', 'latency', 'slo'],
  cheatSheet: [
    'Observability = traces (what happened, step by step) + metrics (how often / how slow / how costly) + evals & feedback (was it good). Logs alone cannot answer "why was this answer wrong".',
    'OTel GenAI span name = "{gen_ai.operation.name} {gen_ai.request.model}", e.g. "chat gpt-5-mini"; key attrs: gen_ai.provider.name, gen_ai.request.model, gen_ai.response.model, gen_ai.usage.input_tokens/output_tokens, gen_ai.response.finish_reasons.',
    'GenAI semconv is still "Development" status: pin the semconv version you emit and opt in (OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental) so dashboards do not break on renames.',
    'A RAG trace = root span (request) → embed → retrieve → rerank → generate (+ guardrail) spans; each carries its own latency, inputs/outputs (redacted) and token usage.',
    'Never put tenant_id or user_id as a metric label with unbounded cardinality in Prometheus; put them on spans/ledger rows and aggregate tenant cost in a warehouse.',
    'Anthropic input_tokens EXCLUDES cache reads/writes: total input = input_tokens + cache_read_input_tokens + cache_creation_input_tokens. OpenAI cached_tokens is a SUBSET of prompt/input tokens.',
    'Cost = Σ tokens × price per token type (uncached input, cache write, cache read, output, reasoning). Store the price table version with each ledger row.',
    'Latency for LLMs = TTFT (queue + prefill) + (output_tokens − 1) × TPOT (decode). Track p50/p95/p99, never the mean.',
    'SLO example: 95% of chat requests TTFT < 1.5 s over 28 days → error budget 5% ≈ 50K slow requests per 1M; alert on burn rate (e.g. 14.4× over 1 h).',
    'Sample traces smartly: keep 100% of errors, slow and negative-feedback traces; head-sample the happy path (e.g. 10%).',
  ],
  sections: [
    {
      heading: 'LLM Observability — what to capture and why logs are not enough',
      body: `**Intuition:** a normal API is a vending machine (same input → same output). An LLM app is a chef: same order, slightly different dish every time, and the dish can look fine while being wrong. Observability is the kitchen camera that lets you replay *exactly* what the chef saw and did.

**Four signals for GenAI systems**

| Signal | Answers | Example |
|---|---|---|
| Traces | What happened, step by step? | retrieve 120 ms → rerank 80 ms → generate 2.1 s |
| Metrics | How often, how slow, how costly? | p95 TTFT, tokens/min, 429 rate |
| Evals / feedback | Was the output good? | faithfulness 0.82, thumbs-down rate 4% |
| Logs / events | Raw details for forensics | prompt version, finish_reason = length |

**Mechanics.** Instrument at the boundaries that matter: every model call, retrieval, tool call and guardrail. Use the **OpenTelemetry GenAI semantic conventions** so any backend (Langfuse, LangSmith, Phoenix, Datadog, Grafana Tempo) understands the data. Attach *business context* (tenant, feature, prompt version, model version) to the root span so you can slice everything by it later.

**Tool landscape:** Langfuse (open source, OTel-native, prompt management + evals), LangSmith (deep LangChain/LangGraph integration), Arize Phoenix (open source, OpenInference conventions, strong eval UX), plus classic APMs that now accept gen_ai spans.

**When to use:** from day one. Retro-fitting tracing after an incident means you cannot debug the incident.`,
      example: `A support bot's thumbs-down rate jumps from 3% to 9% on Tuesday. Logs show only "200 OK, 2.3 s". The trace view, filtered by \`feedback = negative\`, shows 71% of bad traces have \`prompt.version = v14\` (shipped Tuesday) and the generate span's \`gen_ai.response.finish_reasons = ["length"]\` — v14 lowered \`max_tokens\` from 800 to 300, truncating answers mid-step. Rolling back to v13 restores 3.1% within an hour. Without prompt version on the span and finish_reason on the generation, this is a multi-day guess.`,
      diagram: `   app code (SDK calls)                     backends
 ┌──────────────────────┐   OTLP     ┌───────────────────────┐
 │ root span: /chat     │──────────▶│ OTel Collector         │
 │  ├ embed             │           │  - redact PII          │
 │  ├ retrieve          │           │  - tail sampling       │
 │  ├ rerank            │           └──────┬────────┬───────┘
 │  └ chat gpt-5-mini   │                  │        │
 │     gen_ai.* attrs   │           ┌──────▼──┐ ┌───▼──────────┐
 └──────────────────────┘           │Langfuse │ │Prometheus/   │
   + feedback, eval scores          │/Phoenix │ │Grafana (SLOs)│
                                    └─────────┘ └──────────────┘`,
      code: [
        {
          language: 'typescript',
          title: 'otel.ts — bootstrap OpenTelemetry and wrap one LLM call with gen_ai attributes',
          code: `import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import OpenAI from 'openai';

// Exports to an OTel Collector (or Langfuse/Phoenix OTLP endpoint)
const sdk = new NodeSDK({
  serviceName: 'support-bot',
  traceExporter: new OTLPTraceExporter({ url: process.env.OTLP_URL ?? 'http://localhost:4318/v1/traces' }),
});
sdk.start();

const tracer = trace.getTracer('support-bot', '1.4.0');
const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

export async function chat(question: string, promptVersion: string) {
  // Span name convention: "{operation} {model}"
  return tracer.startActiveSpan('chat ' + MODEL, { kind: SpanKind.CLIENT }, async (span) => {
    span.setAttributes({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openai',
      'gen_ai.request.model': MODEL,
      'gen_ai.request.max_tokens': 800,
      'app.prompt.version': promptVersion, // business context, your own namespace
    });
    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 800, // GPT-5 family rejects the deprecated max_tokens
        messages: [{ role: 'user', content: question }],
      });
      span.setAttributes({
        'gen_ai.response.model': res.model, // the snapshot actually served
        'gen_ai.response.id': res.id,
        'gen_ai.usage.input_tokens': res.usage?.prompt_tokens ?? 0,
        'gen_ai.usage.output_tokens': res.usage?.completion_tokens ?? 0,
        'gen_ai.response.finish_reasons': [res.choices[0].finish_reason],
      });
      return res.choices[0].message.content;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end(); // always end, or the span is lost
    }
  });
}`,
        },
      ],
      prosCons: {
        pros: [
          'Vendor-neutral: gen_ai.* attributes are understood by Langfuse, Phoenix, Datadog, Grafana and others, so you can switch backends without re-instrumenting.',
          'Turns "the bot got worse" into a query: filter traces by prompt version, model, tenant or finish_reason.',
          'One trace links latency, cost and quality for the same request, which logs scattered across services cannot do.',
        ],
        cons: [
          {
            con: 'GenAI semantic conventions are still in Development status, so attribute names change between versions (gen_ai.system became gen_ai.provider.name).',
            fix: 'Pin the semconv version in your instrumentation, set OTEL_SEMCONV_STABILITY_OPT_IN deliberately, and map old→new names in the Collector with a transform processor.',
          },
          {
            con: 'Capturing full prompts and completions leaks PII and secrets into your tracing backend.',
            fix: 'Record content as opt-in span events, redact in the OTel Collector (regex/NER processor), and restrict retention (e.g. 14 days) for content-bearing traces.',
          },
          {
            con: 'Tracing every request at high QPS is expensive in storage and egress.',
            fix: 'Tail-sample in the Collector: keep 100% of errors, slow (>p95) and negative-feedback traces, and 5–10% of healthy ones.',
          },
        ],
      },
      keyPoints: [
        'Traces + metrics + evals/feedback + logs: you need all four for non-deterministic systems.',
        'Instrument model calls, retrieval, tools and guardrails with gen_ai.* attributes.',
        'Attach business context (tenant, feature, prompt/model version) to the root span.',
        'Record gen_ai.response.model: aliases resolve to snapshots that can change under you.',
      ],
      exercise: {
        prompt: `Write \`withGenAiSpan(meta, fn)\`: a helper that wraps any LLM call in an OTel span named \`"{operation} {model}"\`, sets \`gen_ai.operation.name\`, \`gen_ai.provider.name\`, \`gen_ai.request.model\`, runs \`fn\`, and then sets usage attributes from the returned \`{ inputTokens, outputTokens, finishReason }\`. Acceptance: spans always end (even on throw), errors set status ERROR and record the exception, and the helper returns \`fn\`'s result.`,
        starter: {
          language: 'typescript',
          code: `import { trace, SpanStatusCode } from '@opentelemetry/api';
const tracer = trace.getTracer('llm');

type Meta = { operation: 'chat' | 'embeddings'; provider: string; model: string };
type Usage = { inputTokens: number; outputTokens: number; finishReason?: string };

export async function withGenAiSpan<T extends { usage: Usage }>(meta: Meta, fn: () => Promise<T>): Promise<T> {
  // TODO: startActiveSpan with the right name
  // TODO: set request attributes, call fn, set usage attributes
  // TODO: handle errors and always end the span
  return fn();
}`,
        },
        hints: [
          'tracer.startActiveSpan(name, async (span) => { ... }) makes child spans nest automatically.',
          'Use try / catch / finally: recordException + setStatus in catch, span.end() in finally.',
          'finish_reasons is an array attribute: wrap the single reason in [ ].',
        ],
        solution: {
          language: 'typescript',
          code: `import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
const tracer = trace.getTracer('llm');

type Meta = { operation: 'chat' | 'embeddings'; provider: string; model: string };
type Usage = { inputTokens: number; outputTokens: number; finishReason?: string };

export async function withGenAiSpan<T extends { usage: Usage }>(meta: Meta, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(meta.operation + ' ' + meta.model, { kind: SpanKind.CLIENT }, async (span) => {
    span.setAttributes({
      'gen_ai.operation.name': meta.operation,
      'gen_ai.provider.name': meta.provider,
      'gen_ai.request.model': meta.model,
    });
    try {
      const out = await fn();
      span.setAttributes({
        'gen_ai.usage.input_tokens': out.usage.inputTokens,
        'gen_ai.usage.output_tokens': out.usage.outputTokens,
      });
      if (out.usage.finishReason) span.setAttribute('gen_ai.response.finish_reasons', [out.usage.finishReason]);
      return out;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}`,
        },
        explanation:
          'startActiveSpan puts the span in context, so retrieval or tool spans started inside fn become children. The finally block guarantees the span is exported even when the provider throws a 429, and recording the exception makes error traces searchable.',
      },
      quickCheck: {
        question:
          'Your traces show gen_ai.request.model = "gpt-5-mini" on every span, but answers changed style last week with no deploy. Which attribute would most directly confirm a provider-side model change?',
        options: [
          'gen_ai.usage.output_tokens',
          'gen_ai.response.model',
          'gen_ai.operation.name',
          'gen_ai.request.max_tokens',
        ],
        correct: 1,
        explanation:
          'The request model is what you asked for (often an alias); gen_ai.response.model is the concrete snapshot the provider served. A change in that value with no deploy is the fingerprint of a provider update. Output token counts may shift too, but they are a symptom, not a confirmation.',
      },
      source: 'OpenTelemetry — Semantic conventions for generative AI systems',
    },
    {
      heading: 'Tracing and Logging — a RAG request as a span tree',
      body: `**Intuition:** a trace is a parcel-tracking timeline for one request. Each stop (embed, retrieve, rerank, generate) is a **span** with a start, an end, inputs, outputs and attributes. Nested spans form a tree, so you can see which step was slow or wrong.

**Mechanics for a RAG request**

1. **Root span** \`POST /ask\`: tenant, user (hashed), session/conversation id, prompt version, feature flag variant.
2. **embed** span: embedding model, input token count.
3. **retrieve** span: index name, top_k, filter, returned doc ids and scores (ids, not full text).
4. **rerank** span: reranker model, kept ids, score cut-off.
5. **chat {model}** span: gen_ai.* attributes, finish reason, usage; prompt/completion as redacted events.
6. **guardrail** span (optional): which checks ran, verdict.

Langfuse calls the LLM step a *generation* and groups traces into *sessions*; LangSmith calls them *runs*; Phoenix uses OpenInference span kinds (RETRIEVER, RERANKER, LLM). All accept OTLP today, so instrument once with OTel and pick the UI.

**Logging discipline:** structured JSON logs that carry the \`trace_id\`, so a log line jumps to its trace. Log *decisions* (cache hit, fallback model used, guardrail blocked) not just errors. Keep content out of plain logs; put it in the trace with redaction and shorter retention.

**When to use:** every multi-step pipeline. Retrieval bugs (wrong doc, stale version, empty filter) are invisible without the retrieve span's doc ids.`,
      example: `User asks "What is the refund window for damaged items?" and gets "30 days" (policy says 14). Trace:
- retrieve (95 ms): top_k=20, filter \`{tenant:'acme'}\`, ids \`[pol-2023-v2#4, pol-2025-v5#2, …]\`
- rerank (140 ms): kept \`pol-2023-v2#4\` (0.91) first, \`pol-2025-v5#2\` (0.88) second
- chat gpt-5-mini (1.9 s): 3,120 input / 64 output tokens, finish \`stop\`

Diagnosis in 2 minutes: the 2023 policy was never tombstoned, and the reranker preferred its wording. Fix: add \`status = 'current'\` to the retrieval filter and delete superseded versions at ingest.`,
      diagram: `trace 7f3a…  POST /ask  tenant=acme  prompt=v14          total 2.31 s
├─ embed text-embedding-3-small         38 ms   12 tok
├─ retrieve qdrant:policies            95 ms   top_k=20 hits=20
├─ rerank bge-reranker-v2             140 ms   kept=5
├─ chat gpt-5-mini                   1.92 s   in=3120 out=64
│    TTFT 610 ms   finish=stop
└─ guardrail pii-output                 40 ms   verdict=pass
   + score: user_feedback = -1   eval.faithfulness = 0.41`,
      code: [
        {
          language: 'typescript',
          title: 'rag-trace.ts — nested OTel spans for retrieve → rerank → generate',
          code: `import { trace, context } from '@opentelemetry/api';
import { search, rerank, generate } from './rag'; // your own functions

const tracer = trace.getTracer('rag');

export async function answer(q: string, tenant: string) {
  return tracer.startActiveSpan('POST /ask', async (root) => {
    root.setAttributes({ 'app.tenant': tenant, 'app.prompt.version': 'v14' });
    try {
      const hits = await tracer.startActiveSpan('retrieve', async (s) => {
        const r = await search(q, { tenant, topK: 20 });
        // store ids + scores, not chunk text (size + privacy)
        s.setAttributes({ 'retrieval.top_k': 20, 'retrieval.doc_ids': r.map((h) => h.id) });
        s.end();
        return r;
      });
      const kept = await tracer.startActiveSpan('rerank', async (s) => {
        const r = await rerank(q, hits, 5);
        s.setAttribute('rerank.kept_ids', r.map((h) => h.id));
        s.end();
        return r;
      });
      // generate() creates its own "chat {model}" span as a child of root
      const out = await generate(q, kept);
      // log line carries the trace id so you can jump from logs to the trace
      console.log(JSON.stringify({ level: 'info', msg: 'answered', trace_id: root.spanContext().traceId, kept: kept.length }));
      return out;
    } finally {
      root.end();
    }
  });
}`,
        },
      ],
      prosCons: {
        pros: [
          'Pinpoints which stage failed: retrieval returned the wrong doc, rerank dropped the right one, or the model ignored good context.',
          'Waterfall view shows where latency goes (often rerank or a slow vector filter, not the LLM).',
          'Traces become eval datasets: export bad traces with their inputs to build regression tests.',
        ],
        cons: [
          {
            con: 'Async code loses parent context, producing orphan spans that do not nest under the request.',
            fix: 'Use startActiveSpan / context.with(), and the AsyncLocalStorage context manager that NodeSDK installs by default; pass context explicitly into queue jobs via W3C traceparent.',
          },
          {
            con: 'Storing full retrieved chunks on every span bloats traces to megabytes.',
            fix: 'Store chunk ids, scores and a short hash; fetch the text from the index on demand in the UI, or store content only for sampled traces.',
          },
          {
            con: 'Background jobs (ingestion, async generations) appear as disconnected traces.',
            fix: 'Inject the traceparent header into the job payload and create a span link (or child) when the worker picks it up.',
          },
        ],
      },
      keyPoints: [
        'One trace per request; child spans for embed, retrieve, rerank, generate, guardrail.',
        'Record doc ids and scores on retrieval spans: most RAG bugs live there.',
        'Structured logs must carry trace_id; log decisions, not just errors.',
        'Propagate context across queues with traceparent so async work stays connected.',
      ],
      exercise: {
        prompt: `A BullMQ worker processes "summarise document" jobs, but its spans show up as separate traces from the HTTP request that enqueued them. Write \`enqueueWithTrace(queue, data)\` that injects the current trace context into the job data, and \`runWithTrace(job, fn)\` for the worker that extracts it and runs \`fn\` inside a child span named \`job summarise\`. Acceptance: worker spans share the trace id of the request.`,
        hints: [
          'propagation.inject(context.active(), carrier) writes a traceparent into a plain object.',
          'propagation.extract(ROOT_CONTEXT, carrier) returns a context you can pass to tracer.startActiveSpan(name, {}, ctx, fn).',
          'Store the carrier as job.data._otel so it serialises with the job.',
        ],
        solution: {
          language: 'typescript',
          code: `import { context, propagation, trace, ROOT_CONTEXT } from '@opentelemetry/api';
import type { Queue, Job } from 'bullmq';

const tracer = trace.getTracer('jobs');

export async function enqueueWithTrace(queue: Queue, data: Record<string, unknown>) {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier); // adds { traceparent: '00-<traceId>-<spanId>-01' }
  return queue.add('summarise', { ...data, _otel: carrier });
}

export async function runWithTrace<T>(job: Job, fn: () => Promise<T>): Promise<T> {
  const parentCtx = propagation.extract(ROOT_CONTEXT, job.data._otel ?? {});
  return tracer.startActiveSpan('job summarise', { attributes: { 'job.id': job.id ?? '' } }, parentCtx, async (span) => {
    try {
      return await fn();
    } finally {
      span.end();
    }
  });
}`,
        },
        explanation:
          'W3C trace context is just a string header; serialising it into the job payload lets the worker continue the same trace. For fan-out jobs that outlive the request you may prefer a span link instead of a parent, but the propagation mechanics are identical.',
      },
      quickCheck: {
        question:
          'Users report wrong answers, but the generate span shows the model faithfully quoting its context. Where should you look next in the trace?',
        options: [
          'The root span latency, to see if the request timed out',
          'The retrieve and rerank spans, to see which documents were selected and why',
          'The guardrail span, to see if it modified the answer',
          'The token usage attributes, to check for truncation',
        ],
        correct: 1,
        explanation:
          'If the model is faithful to its context but the answer is wrong, the context was wrong: inspect the retrieved ids, filters and rerank order. Truncation would show finish_reason=length, and a timeout would be an error, not a wrong answer.',
      },
      source: 'Langfuse docs — Tracing data model (traces, observations, generations, sessions)',
    },
    {
      heading: 'Token Usage Tracking — per-tenant token and cost attribution',
      body: `**Intuition:** tokens are your electricity meter. Without a meter per apartment (tenant, feature, user) you get one big bill and no idea who ran the air conditioning.

**Mechanics**

1. **Read usage from the provider response**, never estimate it with a tokenizer after the fact. Field names differ:

| Provider | Uncached input | Cached input | Output |
|---|---|---|---|
| OpenAI Chat Completions | prompt_tokens − cached | prompt_tokens_details.cached_tokens (subset) | completion_tokens (incl. reasoning) |
| Anthropic Messages | input_tokens (excludes cache) | cache_read_input_tokens, cache_creation_input_tokens | output_tokens |

2. **Price it** with a versioned price table: uncached input, cache write, cache read, output. Store \`price_table_version\` with each row so historical cost stays reproducible when prices change.
3. **Write a usage ledger row** per call: request id, trace id, tenant, feature, model served, token breakdown, cost. Append-only, idempotent on request id.
4. **Emit metrics** (\`gen_ai.client.token.usage\` histogram with \`gen_ai.token.type\` = input/output) labelled by model and feature, *not* by tenant (cardinality). Aggregate per-tenant cost from the ledger.
5. **Enforce budgets**: a Redis counter per tenant per day checked before the call; soft limit alerts, hard limit downgrades model or rejects.

**Streaming gotcha:** OpenAI streams only include usage if you set \`stream_options: { include_usage: true }\` (final chunk); Anthropic sends input usage in \`message_start\` and cumulative output in \`message_delta\`.

**When to use:** any multi-tenant or chargeback scenario, and as the input to every cost-optimisation decision.`,
      example: `Anthropic call, illustrative prices per 1M tokens: input $3, cache write $3.75, cache read $0.30, output $15.
Usage: input_tokens 900, cache_creation_input_tokens 0, cache_read_input_tokens 6,000, output_tokens 400.
- uncached input: 900 × 3/1M = $0.00270
- cache read: 6,000 × 0.30/1M = $0.00180
- output: 400 × 15/1M = $0.00600
- total = **$0.0105**

A naive tracker that used only \`input_tokens\` would report 900 input tokens and miss 6,000 cached ones; one that priced all 6,900 at full price would over-report input cost by 4.6× ($0.0207 vs $0.0045).`,
      diagram: `LLM response.usage ──▶ normalise() ──▶ price(table v2026-10)
                          │                    │
                          ▼                    ▼
      metrics: gen_ai.client.token.usage   ledger row (Postgres)
      labels: model, feature, token.type   tenant, feature, trace_id,
      (no tenant label!)                   in/cache_r/cache_w/out, $
                                               │
                         budget check ◀── Redis INCRBYFLOAT
                         tenant:acme:2026-10-15 = $41.20 / $50`,
      code: [
        {
          language: 'typescript',
          title: 'usage.ts — normalise provider usage, price it, write a ledger row and update a budget',
          code: `import Redis from 'ioredis';
import { Pool } from 'pg';

const redis = new Redis(process.env.REDIS_URL!);
const pg = new Pool();

type Norm = { uncachedIn: number; cacheRead: number; cacheWrite: number; out: number };
// Illustrative prices in $ per 1M tokens, versioned
const PRICES: Record<string, { in: number; cw: number; cr: number; out: number }> = {
  'claude-sonnet-5-5': { in: 3, cw: 3.75, cr: 0.3, out: 15 },
  'gpt-5-mini': { in: 0.25, cw: 0.25, cr: 0.025, out: 2 },
};
const PRICE_VERSION = '2026-10';

export function fromAnthropic(u: any): Norm {
  // Anthropic input_tokens already EXCLUDES cached tokens
  return { uncachedIn: u.input_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, out: u.output_tokens };
}
export function fromOpenAI(u: any): Norm {
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0; // subset of prompt_tokens
  return { uncachedIn: u.prompt_tokens - cached, cacheRead: cached, cacheWrite: 0, out: u.completion_tokens };
}

export async function record(reqId: string, tenant: string, feature: string, model: string, n: Norm) {
  const p = PRICES[model];
  const cost = (n.uncachedIn * p.in + n.cacheWrite * p.cw + n.cacheRead * p.cr + n.out * p.out) / 1e6;
  // ON CONFLICT makes retries of the same request idempotent
  await pg.query(
    'INSERT INTO llm_usage (req_id, tenant, feature, model, in_tok, cache_r, cache_w, out_tok, cost_usd, price_version) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (req_id) DO NOTHING',
    [reqId, tenant, feature, model, n.uncachedIn, n.cacheRead, n.cacheWrite, n.out, cost, PRICE_VERSION],
  );
  const key = 'budget:' + tenant + ':' + new Date().toISOString().slice(0, 10);
  await redis.multi().incrbyfloat(key, cost).expire(key, 3 * 86400).exec();
  return cost;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Enables chargeback/showback and per-tenant pricing tiers based on real usage.',
          'Finds the expensive features: often one agent loop or one verbose prompt is 60% of spend.',
          'Budget guards stop a runaway loop or abusive tenant before the monthly invoice does.',
        ],
        cons: [
          {
            con: 'Provider usage semantics differ (cached tokens subset vs separate), so naive sums double-count or under-count.',
            fix: 'Normalise every response into one internal shape (uncached input, cache read, cache write, output, reasoning) with unit tests per provider.',
          },
          {
            con: 'Tenant id as a Prometheus label explodes series cardinality with thousands of tenants.',
            fix: 'Keep metrics labelled by model/feature only; write tenant-level rows to a ledger table or warehouse and query aggregates there.',
          },
          {
            con: 'Streaming responses that are aborted by the client never report usage, so cost leaks unmeasured.',
            fix: 'Request usage in the stream (include_usage), and on abort estimate output tokens by counting streamed text with a tokenizer, flagged as estimated.',
          },
          {
            con: 'Price changes silently rewrite historical cost if you compute it at query time.',
            fix: 'Store token counts AND computed cost with a price_table_version on each row; recompute only deliberately.',
          },
        ],
      },
      keyPoints: [
        'Use provider-reported usage; normalise field semantics per provider.',
        'Price by token type: uncached input, cache write, cache read, output.',
        'Ledger rows per call (idempotent on request id) carry tenant and feature.',
        'Keep tenant out of metric labels; aggregate in the ledger/warehouse.',
        'Streaming needs explicit usage reporting and an abort fallback.',
      ],
      exercise: {
        prompt: `Implement \`costOf(model, usage, provider)\` returning dollars, for both OpenAI Chat Completions usage and Anthropic Messages usage, using a price table with \`in\`, \`cacheWrite\`, \`cacheRead\`, \`out\` ($/1M). Acceptance: OpenAI \`{prompt_tokens: 10000, completion_tokens: 500, prompt_tokens_details: {cached_tokens: 8000}}\` on a model priced in 1 / cacheRead 0.1 / out 4 → $0.0048; Anthropic \`{input_tokens: 2000, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0, output_tokens: 500}\` at the same prices → $0.0048.`,
        hints: [
          'OpenAI: uncached = prompt_tokens − cached_tokens.',
          'Anthropic: input_tokens is already uncached.',
          'Divide the sum of token×price by 1,000,000.',
        ],
        solution: {
          language: 'typescript',
          code: `type Price = { in: number; cacheWrite: number; cacheRead: number; out: number };
const PRICES: Record<string, Price> = { demo: { in: 1, cacheWrite: 1.25, cacheRead: 0.1, out: 4 } };

export function costOf(model: string, usage: any, provider: 'openai' | 'anthropic'): number {
  const p = PRICES[model];
  if (!p) throw new Error('No price for ' + model);
  let uncached: number, read: number, write: number, out: number;
  if (provider === 'openai') {
    read = usage.prompt_tokens_details?.cached_tokens ?? 0;
    uncached = usage.prompt_tokens - read; // cached is a subset
    write = 0;
    out = usage.completion_tokens;
  } else {
    uncached = usage.input_tokens; // excludes cache reads/writes
    read = usage.cache_read_input_tokens ?? 0;
    write = usage.cache_creation_input_tokens ?? 0;
    out = usage.output_tokens;
  }
  return (uncached * p.in + write * p.cacheWrite + read * p.cacheRead + out * p.out) / 1e6;
}

// 2000*1 + 8000*0.1 + 500*4 = 2000 + 800 + 2000 = 4800 / 1e6 = 0.0048
console.log(costOf('demo', { prompt_tokens: 10000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 8000 } }, 'openai'));
console.log(costOf('demo', { input_tokens: 2000, cache_read_input_tokens: 8000, cache_creation_input_tokens: 0, output_tokens: 500 }, 'anthropic'));`,
        },
        explanation:
          'The same 10,000-token prompt with 8,000 cached tokens is reported differently by the two providers, but after normalisation the cost is identical. Throwing on unknown models prevents silently recording $0 for a newly added model.',
      },
      quickCheck: {
        question:
          'An Anthropic response reports input_tokens = 300 and cache_read_input_tokens = 12,000. What is the total prompt size the model processed?',
        options: ['300 tokens', '12,000 tokens', '12,300 tokens', '11,700 tokens'],
        correct: 2,
        explanation:
          'Anthropic reports uncached input separately from cache reads and writes, so total input = 300 + 12,000 + cache_creation (0) = 12,300. Treating input_tokens as the total (300) is the classic under-count; subtracting (11,700) applies OpenAI subset semantics to Anthropic.',
      },
      source: 'OpenTelemetry GenAI semconv — Anthropic page (input token accounting); Anthropic prompt caching docs',
    },
    {
      heading: 'Latency Monitoring — TTFT, TPOT, p95 and SLOs',
      body: `**Intuition:** a streaming answer is like a waiter: users judge you first by how fast the waiter arrives (**TTFT**, time to first token), then by how fast plates keep coming (**TPOT**, time per output token). A 6-second answer that starts in 400 ms feels faster than a 3-second answer that starts at 2.5 s.

**The latency model**

end-to-end ≈ pre-LLM work (retrieve, rerank) + TTFT + (output_tokens − 1) × TPOT + post-processing

- **TTFT** = network + queueing + prefill. Grows with prompt length and provider load.
- **TPOT** (inter-token latency) = decode speed, typically 10–30 ms/token on hosted APIs (≈ 30–100 tokens/s).
- Output length dominates total time: halving output tokens often beats switching providers.

**Measure percentiles, not means.** Latency is long-tailed; the mean hides the 5% of users waiting 12 s. Record histograms (\`gen_ai.client.operation.duration\`, plus your own TTFT histogram; servers expose \`gen_ai.server.time_to_first_token\` / \`time_per_output_token\`) and read p50/p95/p99 by model and feature.

**SLOs** turn this into a contract: *"95% of chat requests have TTFT < 1.5 s over 28 days."* The 5% is the **error budget**. Alert on **burn rate** (how fast the budget is consumed), e.g. page if the 1 h burn rate > 14.4× (2% of a 30-day budget in 1 h), ticket if 6 h burn > 6×.

**When to use:** every user-facing LLM endpoint. Separate SLOs for interactive chat (TTFT) and batch/async jobs (completion time).`,
      example: `A RAG endpoint: retrieve 90 ms + rerank 150 ms + TTFT 650 ms + 350 output tokens at 22 ms TPOT. Decode = 349 × 22 ms = 7.68 s, so end-to-end ≈ **8.6 s**, while time-to-first-visible-token ≈ **0.89 s**.
Options ranked by impact:
1. Cap/shorten answers to 150 tokens → decode 3.3 s (−4.4 s).
2. Stream to the UI → perceived wait 0.89 s.
3. Move rerank to a smaller model → −100 ms.
p95 TTFT was 2.4 s at peak because 12% of prompts exceeded 20K tokens of context; trimming top_k from 20 to 8 chunks cut p95 TTFT to 1.3 s.`,
      diagram: `t=0      240ms        890ms                                8.6s
|─retrieve/rerank─|─TTFT─|▁▁▁▁▁ decode: 349 tok × 22ms ▁▁▁▁▁|
                  ▲      ▲                                   ▲
            LLM call  first token                        last token
                      (user sees text)
SLO: p95(TTFT) < 1.5 s  │  error budget 5% / 28 d
burn rate = observed bad ratio / 0.05  →  page if > 14.4 over 1 h`,
      code: [
        {
          language: 'typescript',
          title: 'latency.ts — measure TTFT, TPOT and total for a streamed OpenAI call into OTel histograms',
          code: `import OpenAI from 'openai';
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('llm');
const ttftH = meter.createHistogram('app.llm.ttft', { unit: 's' });
const tpotH = meter.createHistogram('app.llm.tpot', { unit: 's' });
const durH = meter.createHistogram('gen_ai.client.operation.duration', { unit: 's' });
const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

export async function streamWithTiming(prompt: string, feature: string, onToken: (t: string) => void) {
  const t0 = performance.now();
  let tFirst = 0;
  let outTokens = 0;
  const stream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    stream_options: { include_usage: true }, // final chunk carries usage
    messages: [{ role: 'user', content: prompt }],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      if (!tFirst) tFirst = performance.now(); // first visible token
      onToken(delta);
    }
    if (chunk.usage) outTokens = chunk.usage.completion_tokens;
  }
  const tEnd = performance.now();
  const attrs = { 'gen_ai.request.model': MODEL, 'app.feature': feature }; // low cardinality only
  const ttft = (tFirst - t0) / 1000;
  ttftH.record(ttft, attrs);
  if (outTokens > 1) tpotH.record((tEnd - tFirst) / 1000 / (outTokens - 1), attrs);
  durH.record((tEnd - t0) / 1000, attrs);
  return { ttft, total: (tEnd - t0) / 1000, outTokens };
}`,
        },
      ],
      prosCons: {
        pros: [
          'TTFT/TPOT split tells you whether to fix the prompt size (prefill) or the output length/model (decode).',
          'Percentile SLOs with error budgets give a clear rule for when to stop shipping features and fix reliability.',
          'Burn-rate alerts page on real user impact instead of noisy single spikes.',
        ],
        cons: [
          {
            con: 'Reasoning models emit hidden thinking tokens, so the first visible token can arrive many seconds after the request with no error.',
            fix: 'Track time-to-first-visible-token separately from TTFT of any chunk, set per-model SLOs, and show a progress indicator or stream reasoning summaries.',
          },
          {
            con: 'Averages and per-instance percentiles cannot be combined correctly across pods.',
            fix: 'Record histograms (buckets) and compute percentiles centrally, e.g. histogram_quantile over summed buckets in Prometheus.',
          },
          {
            con: 'Long-tail latency is dominated by a few huge prompts or long outputs, which an overall p95 hides.',
            fix: 'Slice latency by input-token bucket and output length; enforce max context (top_k, history trimming) and max_tokens per feature.',
          },
        ],
      },
      keyPoints: [
        'End-to-end ≈ pre-LLM + TTFT + (output tokens − 1) × TPOT.',
        'Output length is usually the biggest latency lever; streaming hides it from users.',
        'Use histograms and p95/p99, never averages.',
        'SLO + error budget + multi-window burn-rate alerts.',
      ],
      exercise: {
        prompt: `Write \`burnRate(events, sloTarget, thresholdMs)\` where events are \`{ ttftMs: number }[]\` from the last hour. Return \`{ badRatio, burnRate, page }\` where bad = TTFT above threshold, burnRate = badRatio / (1 − sloTarget), and page = burnRate > 14.4. Acceptance: 1,000 events with 80 above 1,500 ms and target 0.95 → badRatio 0.08, burnRate 1.6, page false; with 800 bad → burnRate 16, page true.`,
        hints: [
          'Error budget fraction = 1 − sloTarget (0.05 for a 95% SLO).',
          'Guard against an empty window: return zeros, do not divide by zero.',
          'Round to avoid floating-point noise in assertions.',
        ],
        solution: {
          language: 'typescript',
          code: `type Ev = { ttftMs: number };

export function burnRate(events: Ev[], sloTarget: number, thresholdMs: number) {
  if (events.length === 0) return { badRatio: 0, burnRate: 0, page: false };
  const bad = events.filter((e) => e.ttftMs > thresholdMs).length;
  const badRatio = bad / events.length;
  const budget = 1 - sloTarget; // 0.05 for a 95% objective
  const rate = Math.round((badRatio / budget) * 1000) / 1000;
  return { badRatio, burnRate: rate, page: rate > 14.4 };
}

const mk = (bad: number) => Array.from({ length: 1000 }, (_, i) => ({ ttftMs: i < bad ? 2000 : 600 }));
console.log(burnRate(mk(80), 0.95, 1500)); // { badRatio: 0.08, burnRate: 1.6, page: false }
console.log(burnRate(mk(800), 0.95, 1500)); // { badRatio: 0.8, burnRate: 16, page: true }`,
        },
        explanation:
          'A burn rate of 1 consumes the budget exactly over the SLO window. 14.4 over one hour spends 2% of a 30-day budget in that hour, severe enough to page. Production setups pair it with a short window (5 min) to confirm the burn is still happening and avoid stale pages.',
      },
      quickCheck: {
        question:
          'p95 TTFT is fine (700 ms) but p95 end-to-end latency rose from 5 s to 11 s after a prompt change. What is the most likely cause?',
        options: [
          'The provider is queueing requests longer',
          'The new prompt makes the model produce much longer answers',
          'The vector database got slower',
          'Prompt caching stopped working',
        ],
        correct: 1,
        explanation:
          'TTFT covers queueing, prefill and anything before the call (a slower vector DB or lost cache would raise time to first token). Unchanged TTFT with a doubled total points at decode time, i.e. more output tokens. Check gen_ai.usage.output_tokens and set max_tokens or tighten length instructions.',
      },
      source: 'Google SRE Workbook — Alerting on SLOs (multi-window burn rate)',
    },
  ],
  codeChallenges: [
    {
      id: 'observability-cc-1',
      title: 'Make a blind LLM wrapper observable and cost-attributed',
      context:
        'A multi-tenant SaaS calls Anthropic through this wrapper. Finance cannot attribute the $38K monthly bill to tenants, and on-call cannot tell which prompt version or model snapshot produced a bad answer.',
      task: 'Rewrite the wrapper so each call produces a gen_ai span with request/response attributes and correct usage (including cache tokens), writes an idempotent usage record per tenant and feature, and never leaks the raw prompt into logs.',
      starter: {
        language: 'typescript',
        code: `import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

export async function ask(tenant: string, prompt: string) {
  console.log('LLM request', tenant, prompt); // full prompt in logs
  const res = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  // "tokens used" for billing
  const tokens = res.usage.input_tokens + res.usage.output_tokens;
  console.log('tokens', tokens);
  return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('') || '';
}`,
      },
      hints: [
        'Wrap the call in tracer.startActiveSpan("chat " + model) and set gen_ai.* attributes before and after.',
        'Anthropic input_tokens excludes cache_read_input_tokens and cache_creation_input_tokens.',
        'Pass a requestId and feature in, and insert usage with ON CONFLICT DO NOTHING.',
      ],
      solution: {
        language: 'typescript',
        code: `import Anthropic from '@anthropic-ai/sdk';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { recordUsage } from './ledger'; // INSERT ... ON CONFLICT (req_id) DO NOTHING

const client = new Anthropic();
const tracer = trace.getTracer('llm', '2.0.0');
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';

type Ctx = { requestId: string; tenant: string; feature: string; promptVersion: string };

export async function ask(ctx: Ctx, prompt: string): Promise<string> {
  return tracer.startActiveSpan('chat ' + MODEL, { kind: SpanKind.CLIENT }, async (span) => {
    span.setAttributes({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.request.model': MODEL,
      'gen_ai.request.max_tokens': 1024,
      'app.tenant': ctx.tenant,
      'app.feature': ctx.feature,
      'app.prompt.version': ctx.promptVersion,
      'app.prompt.chars': prompt.length, // size, not content
    });
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });
      const u = res.usage;
      const cacheRead = u.cache_read_input_tokens ?? 0;
      const cacheWrite = u.cache_creation_input_tokens ?? 0;
      span.setAttributes({
        'gen_ai.response.model': res.model,
        'gen_ai.response.id': res.id,
        'gen_ai.response.finish_reasons': [res.stop_reason ?? 'unknown'],
        // semconv: input_tokens should be the TOTAL input, so add cache tokens back
        'gen_ai.usage.input_tokens': u.input_tokens + cacheRead + cacheWrite,
        'gen_ai.usage.cache_read.input_tokens': cacheRead,
        'gen_ai.usage.output_tokens': u.output_tokens,
      });
      await recordUsage({
        reqId: ctx.requestId, tenant: ctx.tenant, feature: ctx.feature, model: res.model,
        uncachedIn: u.input_tokens, cacheRead, cacheWrite, out: u.output_tokens,
      });
      const block = res.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text : '';
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}`,
      },
      explanation:
        'The original logged raw prompts (PII leak), summed tokens without price types (cache reads billed as full input, output priced like input), had no tenant/feature dimension beyond a log line and no idempotency, so retries double-billed. The rewrite emits a standard gen_ai span, records the served snapshot and stop reason for debugging, normalises Anthropic cache semantics, and writes a ledger row keyed by request id that finance can aggregate per tenant.',
      followUps: [
        {
          q: 'Recording the ledger synchronously adds a Postgres round trip to every request. How would you remove it from the hot path?',
          a: 'Push usage events to a durable queue or stream (Kafka, Redis Streams, BullMQ) and have a consumer batch-insert them; idempotency on request id still prevents double counting when the consumer retries.',
        },
        {
          q: 'Why put tenant on the span but not on the latency histogram?',
          a: 'Spans are stored individually and indexed, so high-cardinality attributes are fine; every distinct metric label combination becomes a new time series, so thousands of tenants would explode Prometheus memory and cost.',
        },
      ],
    },
    {
      id: 'observability-cc-2',
      title: 'Fix a TTFT metric that lies',
      context:
        'Dashboards report p95 "TTFT" of 180 ms for a reasoning-model chat feature, yet users complain about 8-second blank screens. The metric code is below.',
      task: 'Find the measurement bugs and produce correct TTFT (first visible text), total duration and output-token metrics, recorded as histograms with low-cardinality labels, and robust to aborted streams.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();
let ttftSum = 0, count = 0;

export async function chat(userId: string, prompt: string) {
  const start = Date.now();
  const stream = await openai.chat.completions.create({
    model: 'gpt-5-mini', stream: true,
    messages: [{ role: 'user', content: prompt }],
  });
  // time until the stream object is returned
  ttftSum += Date.now() - start; count++;
  metrics.gauge('ttft_avg_' + userId, ttftSum / count);
  let text = '';
  for await (const c of stream) text += c.choices[0]?.delta?.content ?? '';
  return text;
}`,
      },
      hints: [
        'create() resolves when response headers arrive, not when the first token does.',
        'The first chunks of a stream can be role-only or empty deltas.',
        'A running average in a gauge per user is both statistically wrong and high-cardinality.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import { metrics } from '@opentelemetry/api';

const openai = new OpenAI();
const meter = metrics.getMeter('chat');
const ttftH = meter.createHistogram('app.llm.time_to_first_visible_token', { unit: 's' });
const totalH = meter.createHistogram('gen_ai.client.operation.duration', { unit: 's' });
const outH = meter.createHistogram('gen_ai.client.token.usage', { unit: '{token}' });
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

export async function chat(feature: string, prompt: string, signal?: AbortSignal) {
  const start = performance.now();
  let firstVisible = 0;
  let outcome = 'ok';
  let text = '';
  const attrs = { 'gen_ai.request.model': MODEL, 'app.feature': feature }; // no user id
  try {
    const stream = await openai.chat.completions.create(
      { model: MODEL, stream: true, stream_options: { include_usage: true }, messages: [{ role: 'user', content: prompt }] },
      { signal },
    );
    for await (const c of stream) {
      const d = c.choices[0]?.delta?.content;
      if (d && !firstVisible) firstVisible = performance.now(); // skip empty/role-only chunks
      if (d) text += d;
      if (c.usage) outH.record(c.usage.completion_tokens, { ...attrs, 'gen_ai.token.type': 'output' });
    }
    return text;
  } catch (e) {
    outcome = signal?.aborted ? 'aborted' : 'error';
    throw e;
  } finally {
    const end = performance.now();
    if (firstVisible) ttftH.record((firstVisible - start) / 1000, { ...attrs, outcome });
    totalH.record((end - start) / 1000, { ...attrs, outcome });
  }
}`,
      },
      explanation:
        'The original timed only until headers arrived (~180 ms) and ignored the reasoning phase before visible text; averaged in a gauge (hiding the tail); and created one metric name per user (cardinality explosion). The fix records first visible token, uses histograms for percentiles, labels by model/feature/outcome only, uses a monotonic clock, captures usage from the final chunk, and still records duration on errors and aborts.',
      followUps: [
        {
          q: 'How would you alert on this metric without paging on a single slow request?',
          a: 'Define an SLO such as 95% of requests under 3 s to first visible token and alert on multi-window burn rate (e.g. 1 h and 5 min both above 14.4×), which needs sustained budget consumption before paging.',
        },
        {
          q: 'Users abort when TTFT is long, so aborted requests have no first token. Does excluding them bias the metric?',
          a: 'Yes, it survivorship-biases TTFT downward. Count aborted-before-first-token requests as SLO violations (bad events) in the SLI even though they have no TTFT value.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'observability-iq-1',
      difficulty: 'hard',
      question: 'Design end-to-end observability for a multi-tenant RAG assistant serving 2M requests/day. What do you instrument, where does the data go, and what do you sample?',
      context: 'Three LLM providers, a vector DB, a reranker, guardrails; product wants quality dashboards, finance wants per-tenant cost, SRE wants SLOs.',
      whatInterviewerLooksFor: [
        'Separates traces, metrics, evals/feedback and logs with a clear purpose for each',
        'Uses OTel GenAI conventions and a Collector for vendor neutrality, redaction and sampling',
        'Handles cardinality: tenant on spans/ledger, not metric labels',
        'Concrete sampling policy that keeps errors, slow and negative-feedback traces',
        'Links online quality signals (feedback, async evals) back to traces',
      ],
      modelAnswer: `**Instrumentation.** OTel SDK in every service. Root span per request carrying tenant, feature, prompt version, flag variant and hashed user id. Child spans: embed, retrieve (index, filter, top_k, doc ids + scores), rerank (kept ids), \`chat {model}\` with gen_ai.* attributes (provider, request vs response model, usage incl. cache tokens, finish reasons), guardrail verdicts and tool calls. Context propagates across queues via traceparent.

**Pipeline.** Apps → OTel Collector (agent + gateway). The gateway redacts PII in content events, applies tail sampling and fans out: traces to Langfuse/Phoenix (LLM-aware UI) and an APM; metrics to Prometheus; usage events to Kafka → warehouse.

**Metrics** (low cardinality: model, feature, provider, outcome): request rate, error and 429 rate, TTFT / TPOT / total histograms, token usage by type, cache hit rate, fallback rate. SLOs on TTFT p95 and availability with burn-rate alerts.

**Cost.** A usage ledger row per LLM call (idempotent on request id, price-table version) → per-tenant and per-feature cost in the warehouse; Redis daily budgets for enforcement.

**Quality.** Thumbs and implicit feedback attached as trace scores; async LLM-as-judge on a 1–2% sample (faithfulness, answer relevance) written back as scores; drift dashboards on those scores by prompt version.

**Sampling.** 2M/day ≈ 23 req/s. Keep 100% of errors, latency > p95, negative feedback, guardrail blocks; 10% of the rest. Content-bearing spans retained 14 days, metadata 90 days.`,
      followUps: [
        {
          q: 'Tail sampling needs the whole trace before deciding. What does that cost you?',
          a: 'The Collector gateway must buffer spans in memory for a decision window (e.g. 10–30 s), and all spans of a trace must reach the same gateway instance, so you need trace-id-aware load balancing (loadbalancing exporter) and memory headroom.',
        },
        {
          q: 'How do you debug one specific customer complaint if their trace was sampled out?',
          a: 'Always keep metadata (ids, latencies, usage) in the ledger and logs with trace id; allow per-tenant or per-request debug flags that force 100% sampling, and keep negative-feedback traces unsampled.',
        },
      ],
      pitfalls: [
        'Putting tenant_id or user_id as Prometheus labels',
        'Storing full prompts/completions forever without redaction',
        'Only measuring average latency and total tokens',
      ],
    },
    {
      id: 'observability-iq-2',
      difficulty: 'medium',
      question: 'Your monthly LLM bill doubled but request volume grew only 10%. Walk through how you find the cause using your telemetry.',
      whatInterviewerLooksFor: [
        'Decomposes cost into requests × tokens per request × price per token type',
        'Slices by feature, model, tenant and prompt version',
        'Checks cache hit rate and output tokens, not just input',
        'Considers agent loops / retries as multipliers',
      ],
      modelAnswer: `**1. Decompose.** cost = requests × (tokens per request by type) × price. Volume explains +10%, so either tokens per request, the token mix or the price per token changed.

**2. Slice the ledger** by week × feature × model. Typical findings:
- One feature's **output tokens/request** jumped (new prompt asks for "detailed explanations"; reasoning effort raised).
- **Model mix** shifted: a router change or fallback sent 30% of traffic to the premium model (check \`gen_ai.response.model\`, fallback-rate metric).
- **Cache hit rate fell**: a timestamp or user name was added at the top of the system prompt, breaking the cacheable prefix; cache reads drop, uncached input rises.
- **Calls per request** rose: an agent loop now averages 7 LLM calls instead of 3, or retries on 429s are re-sending full prompts (check calls per root span).
- **Context bloat**: top_k raised from 5 to 20 chunks, input tokens/request ×3.

**3. Confirm with traces**: pick expensive traces (sort by cost) and compare against last month's.

**4. Fix and guard**: per-feature budgets and alerts on cost/request, prompt-change review that shows the token delta, cache-hit-rate alert, max iterations on agents.`,
      followUps: [
        {
          q: 'Which single dashboard panel would have caught this earliest?',
          a: 'Cost per request (or tokens per request by type) per feature, with an alert on week-over-week change; it isolates per-request efficiency from volume growth, which a total-spend panel mixes together.',
        },
        {
          q: 'The culprit is a premium model fallback that triggers on timeouts. What do you change?',
          a: 'Fix the timeout cause (often too-short timeout or provider latency), cap fallback rate with a circuit breaker, prefer a same-tier fallback in another region or provider, and alert on fallback rate as its own SLI.',
        },
      ],
      pitfalls: [
        'Looking only at total tokens instead of the input/output/cached mix',
        'Ignoring retries and agent iterations as cost multipliers',
        'Guessing without slicing by feature and model',
      ],
    },
    {
      id: 'observability-iq-3',
      difficulty: 'hard',
      question: 'Define latency SLOs for a streaming chat product and an async document-summary product. How do you alert on them?',
      whatInterviewerLooksFor: [
        'Different SLIs for interactive (TTFT/TPOT) vs async (completion time, freshness)',
        'Percentile targets with an explicit window and error budget',
        'Multi-window burn-rate alerting',
        'Accounts for aborted requests and reasoning models',
      ],
      modelAnswer: `**Interactive chat.** SLIs measured at the server edge:
- *Time to first visible token*: 95% < 1.5 s, 99% < 4 s over 28 days.
- *Streaming smoothness*: p95 inter-token gap < 100 ms (TPOT), plus a "stall" SLI: no gap > 5 s.
- *Availability*: 99.5% of requests finish without a 5xx or stream error.
Aborted-before-first-token requests count as bad events.

**Async summaries.** Users do not watch a spinner, so the SLI is completion: 99% of jobs finished within 10 minutes of submission, plus queue age p95 < 2 minutes. Measure from enqueue time, not worker pickup, so queue backlog is included.

**Error budget.** 95% target → 5% of requests may be slow. Spend it consciously: if budget is gone, freeze risky prompt/model changes.

**Alerting** (Google SRE multi-window, multi-burn-rate):
- Page: burn rate > 14.4 over 1 h AND > 14.4 over 5 min.
- Page: > 6 over 6 h AND 30 min.
- Ticket: > 1 over 3 days.

**Model specifics.** Reasoning models need their own SLO (e.g. 95% < 8 s first visible token) or a progress UX; mixing them into one SLI produces permanent violations.`,
      followUps: [
        {
          q: 'Why use two windows for each burn-rate alert?',
          a: 'The long window proves the burn is significant; the short window proves it is still happening, so the alert resets quickly after recovery instead of firing for an hour on stale data.',
        },
        {
          q: 'Where do you measure TTFT: client, gateway or provider?',
          a: 'Gateway/server edge for the SLO because you control it and it includes retrieval and queueing; add client RUM for network effects. Provider-reported timings alone miss your own pre-processing.',
        },
      ],
      pitfalls: [
        'Using mean latency as the SLI',
        'Measuring async jobs from worker pickup and hiding queue time',
        'One SLO across very different models and features',
      ],
    },
    {
      id: 'observability-iq-4',
      difficulty: 'expert',
      question: 'Answers from your assistant got noticeably worse overnight, with no deploy on your side. How do you use observability to prove the root cause and respond?',
      context: 'You call a provider alias (not a pinned snapshot). Error rate and latency look normal.',
      whatInterviewerLooksFor: [
        'Checks gen_ai.response.model / provider fingerprints for silent model changes',
        'Uses quality signals (feedback, online evals) segmented by time and model',
        'Rules out own-side changes: data, index, prompts, config flags',
        'Short-term mitigation (pin snapshot, roll back) and long-term guard (canary evals on model updates)',
      ],
      modelAnswer: `**1. Confirm it is real.** Negative-feedback rate and online judge scores (faithfulness, relevance) by hour. A step change at 02:00 is real; a slow slide suggests data drift.

**2. Diff the request side** (things you control, often forgotten):
- Prompt version, feature flags and config (traces carry app.prompt.version and flag variant).
- Retrieval: index version/alias, ingestion job that ran overnight, doc ids appearing in retrieve spans before vs after.
- Tool or guardrail changes.

**3. Diff the model side.** Group traces by \`gen_ai.response.model\` (and \`system_fingerprint\` where available). A new snapshot id at 02:00 is a provider update behind your alias. Also compare output token distribution, finish reasons and refusal rate; those shift with model updates.

**4. Prove causality.** Replay 200 golden prompts from yesterday's traces against the old pinned snapshot vs the current one with the same retrieved context; score with your eval suite. If old > new with significance, you have your answer.

**5. Respond.** Pin to the previous snapshot if still available; otherwise adjust prompts and run the regression suite. Long term: always pin snapshots in production, treat model upgrades like deploys (canary + eval gate), and alert on gen_ai.response.model changes.`,
      followUps: [
        {
          q: 'The provider does not expose snapshot ids. How else can you detect a silent change?',
          a: 'Run a fixed canary prompt set on a schedule with temperature 0 and track output embeddings, lengths, refusal rates and judge scores; a step change in these distributions with no change on your side indicates a model update.',
        },
        {
          q: 'How do you replay production traces safely for evaluation?',
          a: 'Export traces with redacted or consented content, freeze the retrieved context from the original spans so you test the model rather than today’s index, and run in an isolated eval project with its own budget.',
        },
      ],
      pitfalls: [
        'Assuming the provider changed without ruling out your own data/index changes',
        'Calling unpinned aliases in production with no record of the served model',
        'Relying on latency/error metrics to detect quality regressions',
      ],
    },
    {
      id: 'observability-iq-5',
      difficulty: 'medium',
      question: 'Langfuse, LangSmith, Phoenix or your existing APM: how do you choose an LLM tracing backend, and how do you avoid lock-in?',
      whatInterviewerLooksFor: [
        'Criteria: hosting/data residency, OTel support, eval and prompt features, cost at volume',
        'Instrument with OpenTelemetry, route via Collector',
        'Mentions framework fit (LangGraph → LangSmith) without making it decisive',
      ],
      modelAnswer: `**Criteria**

| Criterion | Question |
|---|---|
| Data control | Self-host needed (PII, residency)? Langfuse and Phoenix are open source and self-hostable. |
| Standards | Accepts OTLP with gen_ai / OpenInference attributes? |
| LLM features | Trace UI for generations, sessions, prompt management, datasets, online evals, human annotation queues |
| Framework fit | LangChain/LangGraph users get near-zero-effort tracing in LangSmith |
| Scale & cost | Pricing per trace/span at your volume, retention controls |
| Integration | Can it coexist with the APM (Datadog, Grafana) SRE already uses? |

**Avoiding lock-in.** Instrument with the OTel SDK and GenAI conventions (or OpenInference, which maps to OTel), never vendor-only decorators in core code. Send everything to an OTel Collector; vendors are just exporters. Keep the usage ledger and eval datasets in your own store. Then switching backends is a Collector config change.

**Common outcome.** APM for infrastructure metrics and SLOs, plus one LLM-native tool (Langfuse or Phoenix self-hosted, or LangSmith for LangGraph-heavy teams) for trace inspection, prompt versions and evals, both fed from the same Collector.`,
      followUps: [
        {
          q: 'What is OpenInference and how does it relate to OTel GenAI conventions?',
          a: 'OpenInference is Arize’s set of semantic conventions and instrumentations built on OpenTelemetry, with span kinds like LLM, RETRIEVER and RERANKER; it travels over OTLP and overlaps with gen_ai.* attributes, and mapping between them is mostly attribute renaming.',
        },
        {
          q: 'Your security team forbids prompts leaving the VPC. What changes?',
          a: 'Self-host the tracing backend (Langfuse/Phoenix) inside the VPC, or export only metadata spans externally while content events are dropped or redacted in the Collector before export.',
        },
      ],
      pitfalls: [
        'Choosing on UI demos alone without checking OTel ingestion',
        'Scattering vendor SDK decorators through business logic',
        'Ignoring data residency for prompt content',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'observability-est-1',
      question: 'Estimate monthly trace storage for a RAG assistant at 3M requests/day if you trace everything vs with tail sampling.',
      assumptions: [
        '6 spans per request (root, embed, retrieve, rerank, chat, guardrail)',
        'Average span without content: 1.5 KB; chat span with redacted prompt+completion events: +12 KB',
        'Tail sampling keeps 100% of the 4% "interesting" traces (errors, slow, negative feedback) and 10% of the rest',
        '30-day retention; storage backend compression ~4×',
      ],
      steps: [
        { label: 'Bytes per full trace', calc: '6 × 1.5 KB + 12 KB = 21 KB' },
        { label: 'Daily raw (trace everything)', calc: '3,000,000 × 21 KB = 63 GB/day' },
        { label: 'Monthly raw, compressed', calc: '63 GB × 30 / 4 ≈ 473 GB' },
        { label: 'Fraction kept with sampling', calc: '0.04 + 0.96 × 0.10 = 0.136' },
        { label: 'Monthly with sampling', calc: '473 GB × 0.136 ≈ 64 GB' },
      ],
      answer: '≈ 470 GB/month compressed tracing everything vs ≈ 65 GB/month with tail sampling (~7× less), while keeping every error, slow and negative-feedback trace.',
      insight:
        'Content (prompts/completions) is ~57% of each trace. Dropping content on sampled-in happy paths, or keeping it only 7 days, cuts storage more than tuning span counts; metrics, not traces, should carry aggregate questions.',
      followUps: [
        {
          q: 'What if retrieved chunk text (8 chunks × 1 KB) is also stored on the retrieve span?',
          a: 'Each trace grows by ~8 KB to 29 KB (+38%), so storage rises roughly proportionally; store chunk ids and hashes instead and resolve text from the index on demand.',
        },
      ],
    },
    {
      id: 'observability-est-2',
      question: 'Your p95 end-to-end latency target is 4 s for a RAG answer. Given the pipeline below, what output length budget can you afford at p95?',
      assumptions: [
        'p95 retrieval (embed + vector search) = 180 ms; p95 rerank = 220 ms',
        'p95 TTFT for ~4K-token prompts = 900 ms',
        'p95 TPOT = 25 ms/token',
        'Post-processing (guardrail) = 100 ms; treat p95s as additive (conservative)',
      ],
      steps: [
        { label: 'Fixed overhead', calc: '180 + 220 + 900 + 100 = 1,400 ms' },
        { label: 'Remaining for decode', calc: '4,000 − 1,400 = 2,600 ms' },
        { label: 'Tokens affordable', calc: '2,600 / 25 ≈ 104 tokens (+1 first token) ≈ 105' },
        { label: 'Words', calc: '105 tokens × 0.75 ≈ 79 words' },
      ],
      answer: 'About 100 output tokens (~75–80 words) fit the 4 s p95 budget; anything longer must stream or the SLO must be on first-visible-token instead.',
      insight:
        'Decode dominates: a 300-token answer alone needs 7.5 s. For long answers, set the SLO on TTFT (here ~1.3 s to first token) and stream; for short-answer features, enforce max_tokens and concise instructions.',
      followUps: [
        {
          q: 'How would prompt caching change this budget?',
          a: 'Caching a large static prefix reduces prefill work and can cut TTFT substantially for long prompts (e.g. 900 ms → ~500 ms), freeing ~400 ms, i.e. about 16 more output tokens at 25 ms each; it does not speed up decode.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'observability-mcq-01',
      difficulty: 'medium',
      question: 'Which pair of attributes lets you tell what model you asked for versus what model actually served the request?',
      options: [
        'gen_ai.provider.name and gen_ai.operation.name',
        'gen_ai.request.model and gen_ai.response.model',
        'gen_ai.request.model and gen_ai.response.id',
        'gen_ai.operation.name and gen_ai.response.model',
      ],
      correct: [1],
      explanation:
        'gen_ai.request.model is the requested name (often an alias like a "latest" tag) and gen_ai.response.model is the concrete model or snapshot returned by the provider. Provider and operation describe the kind of call, and response.id identifies the response, not the model.',
      followUps: [
        {
          q: 'Why does this distinction matter for incident response?',
          a: 'Silent provider-side snapshot changes behind an alias are a common cause of quality regressions; a changing response.model with a constant request.model pinpoints the moment of change.',
        },
      ],
    },
    {
      id: 'observability-mcq-02',
      difficulty: 'hard',
      question: 'This code records cost for an Anthropic call. What is wrong with the resulting numbers when prompt caching is active?',
      code: {
        language: 'typescript',
        code: `const u = res.usage;
const inputCost = u.input_tokens * PRICE.input / 1e6;
const outputCost = u.output_tokens * PRICE.output / 1e6;
ledger.add(tenant, inputCost + outputCost);`,
      },
      options: [
        'It double-counts cached tokens because input_tokens already includes them',
        'It omits cache read and cache write tokens, so input cost is under-reported',
        'It is correct; caching only affects latency, not billing',
        'It over-reports because output_tokens includes cache reads',
      ],
      correct: [1],
      explanation:
        'Anthropic reports input_tokens as only the uncached tokens after the last breakpoint; cache_read_input_tokens and cache_creation_input_tokens are separate and billed at their own rates (cheap reads, premium writes). Ignoring them under-reports cost, badly so on cache-write-heavy traffic. Double counting would be the OpenAI-subset mistake applied in reverse.',
      followUps: [
        {
          q: 'How would you make this robust across providers?',
          a: 'Normalise every usage object into uncached input, cache read, cache write, output (and reasoning) with per-provider adapters and unit tests, then price each type from a versioned table.',
        },
      ],
    },
    {
      id: 'observability-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL attributes that are appropriate as Prometheus metric labels on an LLM latency histogram for a 5,000-tenant SaaS.',
      options: ['gen_ai.request.model', 'tenant_id', 'app.feature (8 features)', 'trace_id'],
      correct: [0, 2],
      explanation:
        'Labels must be low cardinality: a handful of models and features produce a manageable number of series. tenant_id multiplies every series by 5,000 and trace_id is unique per request, which would explode memory. Those belong on spans and ledger rows, or on exemplars that link a bucket to a sample trace.',
      followUps: [
        {
          q: 'How do you still get per-tenant latency for your top customers?',
          a: 'Query spans or the request log in the trace backend/warehouse grouped by tenant, or add a bounded label like tenant_tier (free/pro/enterprise), or a label only for an allow-list of top-20 tenants with "other" for the rest.',
        },
      ],
    },
    {
      id: 'observability-mcq-04',
      difficulty: 'medium',
      question: 'A streaming endpoint has TTFT p95 of 600 ms and an average of 400 output tokens at 20 ms TPOT. Roughly how long until the last token at a typical request?',
      options: ['About 1 s', 'About 4 s', 'About 8.6 s', 'About 20 s'],
      correct: [2],
      explanation:
        'Total ≈ TTFT + (tokens − 1) × TPOT = 0.6 s + 399 × 0.02 s ≈ 8.6 s. The 1 s answer ignores decode time; 4 s halves the decode; 20 s confuses tokens with characters or doubles TPOT.',
      followUps: [
        {
          q: 'Which lever cuts this the most without changing the model?',
          a: 'Reducing output tokens (concise instructions, structured short answers, max_tokens) since decode is ~8 s of the 8.6 s; streaming improves perceived latency but not completion time.',
        },
      ],
    },
    {
      id: 'observability-mcq-05',
      difficulty: 'hard',
      question: 'In your traces, every LLM span appears as a separate root trace instead of under the HTTP request. What is the most likely cause in this code?',
      code: {
        language: 'typescript',
        code: `app.post('/ask', async (req, res) => {
  const span = tracer.startSpan('POST /ask');
  const docs = await retrieve(req.body.q);
  const answer = await llmChat(docs, req.body.q); // creates its own span
  span.end();
  res.json({ answer });
});`,
      },
      options: [
        'startSpan creates the span but does not make it active, so child spans have no parent in context',
        'span.end() is called before res.json, which drops the children',
        'Express is not supported by OpenTelemetry',
        'The LLM SDK uses HTTP/2, which breaks propagation',
      ],
      correct: [0],
      explanation:
        'tracer.startSpan returns a span but does not set it in the active context; spans created later inside llmChat look up the active context, find none, and start new traces. Use startActiveSpan or context.with(trace.setSpan(context.active(), span), fn). Ending the parent before responding does not orphan already-created children.',
      followUps: [
        {
          q: 'Would HTTP auto-instrumentation alone fix it?',
          a: 'Auto-instrumentation would create an active server span for the request, so llmChat spans would nest under it; the manual POST /ask span would then still be a sibling unless made active.',
        },
      ],
    },
    {
      id: 'observability-mcq-06',
      difficulty: 'hard',
      question: 'Select ALL changes that are likely to reduce p95 TTFT (not total time) for a RAG chat endpoint.',
      options: [
        'Reducing retrieved context from 20 chunks to 6',
        'Lowering max_tokens from 1,000 to 300',
        'Placing static instructions first so the provider prompt cache hits',
        'Running retrieval and the user-profile lookup in parallel before the LLM call',
      ],
      correct: [0, 2, 3],
      explanation:
        'TTFT includes everything before the first token: pre-LLM work and prefill. Fewer input tokens and cached prefixes shrink prefill; parallelising pre-LLM lookups shortens the wait before the call. max_tokens only limits how long decode can run, so it affects total time, not time to first token.',
      followUps: [
        {
          q: 'Which of these also reduces cost?',
          a: 'Fewer chunks (fewer input tokens) and prompt caching (cheaper cache reads) both reduce cost; parallelising lookups does not change tokens billed.',
        },
      ],
    },
    {
      id: 'observability-mcq-07',
      difficulty: 'expert',
      question: 'This streaming code feeds a TTFT histogram. Which bug makes reported TTFT systematically too low for a reasoning model?',
      code: {
        language: 'typescript',
        code: `const t0 = performance.now();
const stream = await client.chat.completions.create({ model, stream: true, messages });
let first = 0;
for await (const chunk of stream) {
  if (!first) first = performance.now();
  render(chunk.choices[0]?.delta?.content ?? '');
}
ttft.record((first - t0) / 1000);`,
      },
      options: [
        'performance.now() is not monotonic',
        'The first chunk can be an empty/role-only delta that arrives before any visible text',
        'TTFT should be measured from after create() resolves',
        'for await buffers the whole stream before iterating',
      ],
      correct: [1],
      explanation:
        'The first SSE chunk often carries only the role or empty content (and reasoning models may think for seconds before visible text). Timestamping it measures connection setup, not user-visible output. Check that delta.content is non-empty. performance.now() is monotonic, and measuring after create() would make the error worse.',
      followUps: [
        {
          q: 'Should you exclude reasoning time from TTFT then?',
          a: 'No: users wait through it. Report time to first visible token as the user-facing SLI, and optionally a separate time to first chunk for transport debugging.',
        },
      ],
    },
    {
      id: 'observability-mcq-08',
      difficulty: 'hard',
      question: 'Select ALL traces a good tail-sampling policy should keep at 100% for an LLM application.',
      options: [
        'Traces with an error status or a provider 429',
        'Traces where the user gave negative feedback',
        'Traces whose latency exceeds the p95 threshold',
        'Traces from health-check endpoints',
      ],
      correct: [0, 1, 2],
      explanation:
        'Errors, negative feedback and slow requests are exactly what you debug, and they are rare, so keeping them all is cheap. Health checks are high-volume, low-value noise and are usually dropped entirely. Note that feedback often arrives after the trace ends, so it needs either a long decision window or late "keep" marking in the backend.',
      followUps: [
        {
          q: 'Feedback arrives minutes after the trace completed. How can you still keep that trace?',
          a: 'Store all traces briefly (e.g. 24 h hot buffer) and promote those that receive negative feedback to long retention, or keep full metadata always and content only for flagged traces.',
        },
      ],
    },
    {
      id: 'observability-mcq-09',
      difficulty: 'medium',
      question: 'Your SLO is "95% of requests have TTFT < 1.5 s over 28 days". This hour, 40% of requests are slower than 1.5 s. What is the 1-hour burn rate?',
      options: ['0.4', '2', '8', '40'],
      correct: [2],
      explanation:
        'Burn rate = observed bad fraction / allowed bad fraction = 0.40 / 0.05 = 8. At 8×, a 28-day budget would be gone in 3.5 days. 0.4 is just the bad fraction; 40 confuses percent with ratio.',
      followUps: [
        {
          q: 'Should this page someone at 3 a.m. under the common 14.4× / 1 h rule?',
          a: 'Not by the 1 h fast-burn rule (8 < 14.4), but it exceeds the 6× slow-burn threshold, so if it persists over the 6 h and 30 min windows it should page.',
        },
      ],
    },
    {
      id: 'observability-mcq-10',
      difficulty: 'expert',
      question: 'Select ALL statements that are true about the OpenTelemetry GenAI semantic conventions in 2026.',
      options: [
        'They are still marked Development (experimental), so attribute names can change between releases',
        'The recommended span name pattern is "{gen_ai.operation.name} {gen_ai.request.model}"',
        'Capturing full prompt and completion content is on by default in instrumentations because it is required for the conventions',
        'gen_ai.provider.name replaced the older gen_ai.system attribute',
      ],
      correct: [0, 1, 3],
      explanation:
        'The GenAI conventions remain in Development status, use "{operation} {model}" span names, and renamed gen_ai.system to gen_ai.provider.name. Content capture is opt-in (sensitive data), typically enabled via an environment flag, not on by default or required.',
      followUps: [
        {
          q: 'How do you protect dashboards from future attribute renames?',
          a: 'Pin instrumentation and semconv versions, use the stability opt-in setting deliberately, and normalise names in the Collector (transform processor) so backends see a stable schema.',
        },
      ],
    },
    {
      id: 'observability-mcq-11',
      difficulty: 'hard',
      question: 'Per-tenant cost in your ledger is 3% higher than the provider invoice each month. Which cause is most consistent with that pattern?',
      options: [
        'Retried requests write a second ledger row with a new id each time',
        'The ledger ignores output tokens',
        'Tenant ids are hashed in traces',
        'The invoice includes batch API discounts the ledger already applies',
      ],
      correct: [0],
      explanation:
        'Over-reporting by a small steady percentage matches retries being recorded as separate rows: when a write or downstream step fails after a successful LLM call and the whole handler retries, the same billed usage lands twice under new ids. Using the original request id with ON CONFLICT DO NOTHING fixes double inserts. Ignoring output tokens would under-report hugely; hashing ids does not change sums.',
      followUps: [
        {
          q: 'A timed-out request may still be billed by the provider. How do you account for it?',
          a: 'Record the attempt with status "timeout" and estimated tokens (input known, output unknown/estimated), reconcile monthly against provider usage exports, and keep the reconciliation delta as a tracked metric.',
        },
      ],
    },
    {
      id: 'observability-mcq-12',
      difficulty: 'expert',
      question: 'A queue worker generates summaries. What does this code do to the trace of the original HTTP request?',
      code: {
        language: 'typescript',
        code: `// producer
await queue.add('sum', { docId, traceparent: getTraceparent() });
// worker
new Worker('sum', async (job) => {
  const ctx = propagation.extract(ROOT_CONTEXT, { traceparent: job.data.traceparent });
  await tracer.startActiveSpan('job sum', {}, ctx, async (s) => { await summarise(job.data.docId); s.end(); });
});`,
      },
      options: [
        'The worker span becomes a child in the same trace as the HTTP request',
        'The worker span starts a new unrelated trace because ROOT_CONTEXT discards the parent',
        'The worker span replaces the HTTP root span',
        'Nothing is recorded because spans cannot cross processes',
      ],
      correct: [0],
      explanation:
        'propagation.extract parses the traceparent into a context containing the remote parent span; passing it to startActiveSpan creates a child in the same trace. ROOT_CONTEXT is just the empty base the extracted values are added to. Cross-process propagation is precisely what W3C trace context exists for.',
      followUps: [
        {
          q: 'When might you prefer a span link over a parent-child relation here?',
          a: 'When the job runs long after the request ended or one job aggregates many requests; a link records causality without stretching the request trace duration to hours.',
        },
      ],
    },
  ],
};

export default topic;
