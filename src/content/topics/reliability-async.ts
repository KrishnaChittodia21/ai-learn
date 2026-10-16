import type { Topic } from '../../types';

const topic: Topic = {
  id: 'reliability-async',
  phase: 'llmops',
  order: 3,
  title: 'Rate Limits, Retries, Async Processing and Job Queues',
  subtitle:
    'Keep LLM features up when providers throttle, stall or fail: token-bucket limits for RPM/TPM, 429-aware backoff, timeouts that work with streaming, idempotent async jobs with BullMQ.',
  estimatedMinutes: 52,
  sources: [
    'OpenAI docs — Rate limits (RPM, TPM, x-ratelimit-* headers, retrying with exponential backoff): https://platform.openai.com/docs/guides/rate-limits',
    'Anthropic docs — Rate limits (token bucket, anthropic-ratelimit-* headers, retry-after) and Errors (429, 529 overloaded): https://platform.claude.com/docs/en/api/rate-limits',
    'OpenAI Node SDK README — timeout, maxRetries, per-request options: https://github.com/openai/openai-node',
    'Anthropic TypeScript SDK README — retries and timeouts: https://github.com/anthropics/anthropic-sdk-typescript',
    'AWS Architecture Blog — Exponential Backoff and Jitter (Marc Brooker): https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/',
    'BullMQ docs — Retrying failing jobs, rate limiting, concurrency, UnrecoverableError: https://docs.bullmq.io/',
    'OpenAI docs — Background mode for the Responses API and webhooks: https://platform.openai.com/docs/guides/background',
    'Stripe engineering — Designing robust and predictable APIs with idempotency: https://stripe.com/blog/idempotency',
  ],
  tags: ['llmops', 'reliability', 'rate-limiting', 'retries', 'timeouts', 'async', 'bullmq', 'queues', 'idempotency'],
  cheatSheet: [
    'Provider limits are per org/project and model: RPM (requests/min), TPM (tokens/min; Anthropic splits input and output TPM). The first one you hit returns HTTP 429.',
    'Token bucket: capacity C refills at r tokens/s; a request needing n tokens proceeds if bucket ≥ n. Size n = estimated input + max_tokens, then reconcile with actual usage.',
    'Enforce limits client-side in a shared store (Redis Lua script, atomic) across all pods, with per-tenant buckets nested under the global provider bucket.',
    'Retry only retryable errors: 408, 409, 429, 5xx, 529 overloaded, connection resets. Never retry 400/401/403/404/422 (bad request, auth, content policy).',
    'Backoff: delay = random(0, min(cap, base × 2^attempt)) (full jitter); if the response has retry-after / retry-after-ms, wait at least that long.',
    'Official SDKs already retry (default maxRetries 2) with 10-minute default timeouts: set explicit timeouts and avoid stacking your own retries on top (2 × 3 × 3 = 18 calls).',
    'Streaming needs two timeouts: time-to-first-token and an idle (inter-chunk) timeout; a total timeout alone kills long healthy answers or waits forever on stalled ones.',
    'Idempotency: one key per logical operation, stored with the result; retries and duplicate deliveries return the stored result instead of calling the LLM again.',
    'Long work (> ~30 s) goes async: 202 + job id, then poll or webhook/SSE; queue with BullMQ (attempts, exponential backoff + jitter, limiter, DLQ, removeOnComplete).',
    'Queue workers: concurrency sized to provider limits, UnrecoverableError for permanent failures, graceful shutdown (worker.close()) and stalled-job recovery.',
  ],
  sections: [
    {
      heading: 'Rate Limiting — token buckets for RPM and TPM',
      body: `**Intuition:** a provider rate limit is a water tank that refills at a fixed rate. Every request drinks from it; if you drink faster than it refills, the tap shuts (HTTP 429). Client-side rate limiting means *you* watch the tank level and queue requests instead of hammering a closed tap.

**What providers limit**
| Limit | Meaning | Typical surprise |
|---|---|---|
| RPM | requests per minute | many tiny classification calls |
| TPM (input/output) | tokens per minute | long RAG prompts; max_tokens may be counted up front |
| Concurrency / daily | parallel or daily caps | batch backfills |

Limits apply per organisation/project and per model, so all your pods share them.

**Token bucket mechanics:** a bucket of capacity C refills continuously at r = limit / 60 per second. A request needing n units proceeds if the bucket holds ≥ n, else waits (or is rejected). Run one bucket for requests and one for tokens; estimate tokens as input estimate + max_tokens and reconcile afterwards with actual usage.

**Distributed enforcement:** keep buckets in Redis and update them with an atomic Lua script so 40 pods share one view. Nest them: **global provider bucket** (stay at ~90% of the real limit) → **per-tenant bucket** (fairness, so one tenant's backfill cannot starve others) → **per-user** limits on your own API.

**Read the headers:** OpenAI returns \`x-ratelimit-remaining-tokens\` / \`x-ratelimit-reset-tokens\`; Anthropic returns \`anthropic-ratelimit-*-remaining\` and \`retry-after\`. Use them to correct your local estimate.

**When to use:** as soon as more than one process calls a provider, or any tenant can trigger bulk work.`,
      example: `Limit: 2,000,000 TPM and 5,000 RPM for a model. Requests average 6,000 input + 500 max output = 6,500 tokens.
- TPM caps you at 2,000,000 / 6,500 ≈ **307 requests/min**, far below 5,000 RPM, so TPM is the binding limit.
- Run the shared bucket at 90%: refill 1.8M / 60 = 30,000 tokens/s, capacity 300,000 (≈ 10 s burst).
- Tenant "acme" starts a 20,000-document backfill. Without per-tenant buckets it consumes the whole 1.8M TPM and interactive users get 429s for ~70 minutes. With a per-tenant cap of 25% (450K TPM), acme's backfill takes ~4.8 h but everyone else keeps ~1.35M TPM.`,
      diagram: `request (est. 6,500 tok)
     │
     ▼
 per-tenant bucket  acme: 450K TPM ── empty? ─▶ wait / 429 to caller
     │ ok
     ▼
 global bucket (Redis, Lua, atomic)  1.8M TPM = 90% of provider limit
     │ ok                 refill 30,000 tok/s, capacity 300,000
     ▼
 provider API ─▶ headers: remaining-tokens, reset ─▶ adjust bucket
     │
     └─▶ actual usage 5,200 tok ─▶ refund 1,300 to buckets`,
      code: [
        {
          language: 'typescript',
          title: 'token-bucket.ts — distributed token bucket in Redis (atomic Lua) for TPM and RPM',
          code: `import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

// KEYS[1] bucket key; ARGV: capacity, refillPerSec, cost, nowMs
// Returns 0 if allowed, otherwise milliseconds to wait.
const LUA = [
  'local cap, rate, cost, now = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])',
  "local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')",
  'local tokens = tonumber(b[1]) or cap',
  'local ts = tonumber(b[2]) or now',
  'tokens = math.min(cap, tokens + (now - ts) / 1000 * rate)', // refill since last call
  'local wait = 0',
  'if tokens >= cost then tokens = tokens - cost else wait = math.ceil((cost - tokens) / rate * 1000) end',
  "redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)",
  "redis.call('PEXPIRE', KEYS[1], 120000)",
  'return wait',
].join('\\n');

export async function take(key: string, capacity: number, perMinute: number, cost: number): Promise<number> {
  return (await redis.eval(LUA, 1, key, capacity, perMinute / 60, cost, Date.now())) as number;
}

// Acquire both RPM and TPM before calling the provider; wait if needed.
export async function acquire(tenant: string, estTokens: number, signal?: AbortSignal) {
  for (;;) {
    if (signal?.aborted) throw new Error('aborted while waiting for rate limit');
    const waits = await Promise.all([
      take('rl:tenant:' + tenant + ':tpm', 75_000, 450_000, estTokens),
      take('rl:global:tpm', 300_000, 1_800_000, estTokens),
      take('rl:global:rpm', 500, 4_500, 1),
    ]);
    const wait = Math.max(...waits);
    if (wait === 0) return;
    // NOTE: buckets that succeeded were debited; production code refunds them (see exercise)
    await new Promise((r) => setTimeout(r, Math.min(wait, 5_000)));
  }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Turns provider 429 storms into smooth, predictable queueing.',
          'Per-tenant buckets give fairness: one tenant’s bulk job cannot starve interactive users.',
          'Atomic Redis scripts keep 1 or 100 pods consistent with a single round trip per check.',
        ],
        cons: [
          {
            con: 'Token estimates before the call are wrong (unknown output length), so buckets drift from reality.',
            fix: 'Reserve input estimate + max_tokens, then refund (or debit) the difference using actual usage from the response; correct drift from provider remaining-tokens headers.',
          },
          {
            con: 'Checking several buckets separately can debit one and fail another, leaking capacity.',
            fix: 'Check-and-debit all buckets in one Lua script (all or nothing), or refund the buckets that succeeded when another fails.',
          },
          {
            con: 'Redis becomes a single point of failure for every LLM call.',
            fix: 'Use Redis with replication/failover and fail open to a conservative per-pod local limiter (global limit / pod count) if Redis is unreachable.',
          },
        ],
      },
      keyPoints: [
        'Know your binding limit: usually TPM for RAG, RPM for many tiny calls.',
        'Shared, atomic buckets in Redis at ~90% of the provider limit.',
        'Nest global → tenant → user buckets for fairness.',
        'Reserve estimated tokens, reconcile with actual usage and headers.',
      ],
      exercise: {
        prompt: `Implement an in-memory \`TokenBucket\` class with \`tryTake(cost, nowMs)\` returning \`{ ok: boolean; waitMs: number }\` and \`refund(amount)\`. Capacity and refill rate (units/s) are constructor args. Acceptance: capacity 100, rate 10/s; at t=0 \`tryTake(80)\` ok; \`tryTake(50)\` at t=0 → not ok with waitMs 3000; at t=3000 \`tryTake(50)\` ok; refund never exceeds capacity.`,
        starter: {
          language: 'typescript',
          code: `export class TokenBucket {
  private tokens: number;
  private last = 0;
  constructor(private capacity: number, private ratePerSec: number) {
    this.tokens = capacity;
  }
  tryTake(cost: number, nowMs: number): { ok: boolean; waitMs: number } {
    // TODO: refill based on elapsed time, cap at capacity
    // TODO: debit if enough, otherwise compute wait
    return { ok: false, waitMs: 0 };
  }
  refund(amount: number) {
    // TODO
  }
}`,
        },
        hints: [
          'Refill: tokens = min(capacity, tokens + (now − last) / 1000 × rate).',
          'Wait = (cost − tokens) / rate seconds, rounded up to ms.',
          'Reject costs larger than capacity outright, or they wait forever.',
        ],
        solution: {
          language: 'typescript',
          code: `export class TokenBucket {
  private tokens: number;
  private last = 0;
  constructor(private capacity: number, private ratePerSec: number) {
    this.tokens = capacity;
  }
  private refill(nowMs: number) {
    const elapsed = Math.max(0, nowMs - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerSec);
    this.last = nowMs;
  }
  tryTake(cost: number, nowMs: number): { ok: boolean; waitMs: number } {
    if (cost > this.capacity) throw new Error('cost exceeds bucket capacity');
    this.refill(nowMs);
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return { ok: true, waitMs: 0 };
    }
    return { ok: false, waitMs: Math.ceil(((cost - this.tokens) / this.ratePerSec) * 1000) };
  }
  refund(amount: number) {
    this.tokens = Math.min(this.capacity, this.tokens + amount);
  }
}

const b = new TokenBucket(100, 10);
console.log(b.tryTake(80, 0)); // { ok: true, waitMs: 0 }  -> 20 left
console.log(b.tryTake(50, 0)); // { ok: false, waitMs: 3000 } needs 30 more at 10/s
console.log(b.tryTake(50, 3000)); // { ok: true, waitMs: 0 }`,
        },
        explanation:
          'Lazy refill on each call avoids timers. Returning waitMs lets callers sleep exactly as long as needed instead of polling. Rejecting oversize costs prevents a request bigger than the bucket from waiting forever, which in LLM terms means a single prompt larger than your burst capacity: split it or raise capacity.',
      },
      quickCheck: {
        question:
          'Your limit is 400K TPM and 10K RPM. Requests average 8K tokens. Which limit binds, and roughly how many requests per minute can you sustain?',
        options: ['RPM, about 10,000', 'TPM, about 50', 'TPM, about 400', 'Neither; about 10,000'],
        correct: 1,
        explanation:
          '400,000 / 8,000 = 50 requests per minute, far below 10,000 RPM, so TPM binds. The 400 option divides by 1,000 instead of 8,000. With long RAG prompts, TPM is almost always the constraint.',
      },
      source: 'OpenAI and Anthropic rate limit documentation',
    },
    {
      heading: 'Retries and Timeouts — backoff with jitter, Retry-After and streaming idle timeouts',
      body: `**Intuition:** retrying is like redialling a busy phone line. Redial instantly and so does everyone else, so the line stays jammed. Wait a random, growing amount and respect "call back in 20 seconds" when you are told.

**Classify errors first**
| Retry | Do not retry |
|---|---|
| 429 rate limit, 408 timeout, 409 conflict, 500/502/503/504, 529 overloaded, ECONNRESET | 400 bad request, 401/403 auth, 404 model not found, 413/422 too large/invalid, content-policy refusals |

**Backoff with full jitter:** delay = random(0, min(cap, base × 2^attempt)), e.g. base 500 ms, cap 30 s, max 4–5 attempts. If the response includes \`retry-after\` (seconds) or \`retry-after-ms\`, wait at least that. Jitter de-synchronises clients so they do not retry in lockstep.

**Timeouts.** SDK defaults are long (10 minutes), so set your own per feature:
- non-streaming: total timeout ≈ p99 latency × 1.5 (e.g. 30 s);
- streaming: a **first-token timeout** (e.g. 10 s) and an **idle timeout** between chunks (e.g. 15–20 s), plus a generous overall cap. A total timeout alone either kills long healthy answers or waits forever on a stalled connection.

**Retry budgets and layering.** The OpenAI and Anthropic SDKs retry twice by default. If your code retries 3× and a gateway retries 3×, one user click can become 2 × 3 × 3 = 18 calls. Pick *one* layer to own retries and cap total retry traffic (e.g. ≤ 10% of requests).

**Idempotency.** Retrying a non-idempotent step (send email, charge card, write to CRM) after a timeout can duplicate side effects. Use an idempotency key per operation and store results.

**When to use:** every provider call. After N failures, stop retrying and fall back (another region/model) or fail fast with a clear error.`,
      example: `A request gets 429 with \`retry-after: 7\`. Policy: base 500 ms, cap 20 s, 5 attempts, full jitter.
- Attempt 1 fails (429, retry-after 7 s) → computed jitter 0–0.5 s, but retry-after wins → wait **7.0 s**.
- Attempt 2 fails (503, no header) → random(0, 1 s) = **0.6 s**.
- Attempt 3 fails (ECONNRESET) → random(0, 2 s) = **1.4 s**.
- Attempt 4 succeeds. Total extra latency ≈ 9.0 s.
Streaming case: TTFT normally 800 ms; one stream emits 120 tokens then stalls. With a 20 s idle timeout the client aborts at +20 s and retries; without it the request hung until the 10-minute SDK default.`,
      diagram: `attempt ─▶ call provider ─▶ ok ─▶ return
              │ error
              ▼
       retryable? (429/408/409/5xx/529/conn) ── no ─▶ throw (no retry)
              │ yes
              ▼
      attempts left? ── no ─▶ fallback model/region or fail
              │ yes
              ▼
   wait = max(retry-after, random(0, min(cap, base·2^n)))
              │
              └──────────────▶ next attempt
stream: [first token ≤ 10 s] then [gap between chunks ≤ 20 s]`,
      code: [
        {
          language: 'typescript',
          title: 'retry.ts — retry with full jitter, Retry-After, and a streaming idle timeout',
          code: `import OpenAI from 'openai';

// SDK retries disabled: this layer owns retries. Explicit timeout instead of the long default.
const openai = new OpenAI({ maxRetries: 0, timeout: 30_000 });
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, maxAttempts = 5, baseMs = 500, capMs = 20_000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: any) {
      const status: number | undefined = err?.status;
      // no status = network error or SDK timeout (retryable) unless the caller aborted on purpose
      const retryable = err?.idle === true || (status === undefined ? !(err instanceof OpenAI.APIUserAbortError) : RETRYABLE.has(status));
      if (!retryable || attempt + 1 >= maxAttempts) throw err;
      const h = err?.headers;
      const ra = Number(h?.get?.('retry-after-ms') ?? NaN) || Number(h?.get?.('retry-after') ?? NaN) * 1000 || 0;
      const jitter = Math.random() * Math.min(capMs, baseMs * 2 ** attempt); // full jitter
      await sleep(Math.max(ra, jitter));
    }
  }
}

// Streaming with an idle timeout between chunks
export async function streamAnswer(prompt: string, onText: (t: string) => void, idleMs = 20_000) {
  return withRetry(async () => {
    const ac = new AbortController();
    let timer = setTimeout(() => ac.abort(), idleMs); // also covers time-to-first-chunk
    try {
      const stream = await openai.chat.completions.create(
        { model: process.env.LLM_MODEL ?? 'gpt-5-mini', stream: true, messages: [{ role: 'user', content: prompt }] },
        { signal: ac.signal, timeout: 120_000 },
      );
      for await (const chunk of stream) {
        clearTimeout(timer);
        timer = setTimeout(() => ac.abort(), idleMs); // reset on every chunk
        onText(chunk.choices[0]?.delta?.content ?? '');
      }
    } catch (e: any) {
      if (ac.signal.aborted) Object.assign(e, { idle: true }); // mark idle stall as retryable
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });
}`,
        },
      ],
      prosCons: {
        pros: [
          'Full jitter spreads retries and prevents synchronised retry storms after a provider blip.',
          'Respecting Retry-After recovers fastest without being throttled further.',
          'Idle timeouts catch stalled streams in seconds instead of minutes.',
        ],
        cons: [
          {
            con: 'Retries multiply load during an outage and can turn a partial outage into a full one.',
            fix: 'Use a retry budget (e.g. retries ≤ 10% of requests per minute) and a circuit breaker that stops calling a failing provider and switches to a fallback.',
          },
          {
            con: 'Retrying a streamed answer after partial output shows the user duplicated or restarted text.',
            fix: 'Retry silently only before the first token; after partial output, surface an error with a "continue" option or resume by sending the partial answer as an assistant prefix.',
          },
          {
            con: 'Retries layered in SDK, app and gateway multiply calls and costs.',
            fix: 'Set maxRetries: 0 in the SDK when your own retry layer exists (or vice versa) and document which layer owns retries.',
          },
          {
            con: 'Timed-out requests may still be processed and billed by the provider.',
            fix: 'Set timeouts from latency percentiles, not guesses, record timed-out attempts in the cost ledger, and use idempotency keys for side effects.',
          },
        ],
      },
      keyPoints: [
        'Retry only transient errors; fail fast on 4xx validation/auth errors.',
        'Full jitter + cap + max attempts; Retry-After takes precedence.',
        'Streaming needs first-token and idle timeouts, not just a total timeout.',
        'One layer owns retries; budget them; fall back after N failures.',
      ],
      exercise: {
        prompt: `Write \`backoffDelay(attempt, opts, retryAfterHeader?)\` returning milliseconds: full jitter \`random(0, min(cap, base × 2^attempt))\`, but never less than Retry-After (header can be seconds like "7" or an HTTP date). Inject the random function for testability. Acceptance: attempt 3, base 500, cap 20000, rand 0.5 → 2000; same with header "7" → 7000; attempt 10 is capped (rand 1 → 20000).`,
        hints: [
          'base × 2^3 = 4000; × 0.5 = 2000.',
          'Header parsing: if Number(header) is finite use seconds × 1000, else Date.parse(header) − now.',
          'Clamp negative date differences to 0.',
        ],
        solution: {
          language: 'typescript',
          code: `type Opts = { baseMs: number; capMs: number; rand?: () => number; now?: () => number };

export function backoffDelay(attempt: number, o: Opts, retryAfter?: string | null): number {
  const rand = o.rand ?? Math.random;
  const now = o.now ?? Date.now;
  const ceiling = Math.min(o.capMs, o.baseMs * 2 ** attempt);
  const jitter = Math.floor(rand() * ceiling); // full jitter
  let ra = 0;
  if (retryAfter) {
    const secs = Number(retryAfter);
    ra = Number.isFinite(secs) ? secs * 1000 : Math.max(0, Date.parse(retryAfter) - now()) || 0; // unparseable -> 0, never NaN
  }
  return Math.max(jitter, ra);
}

const o = { baseMs: 500, capMs: 20000, rand: () => 0.5 };
console.log(backoffDelay(3, o)); // 2000
console.log(backoffDelay(3, o, '7')); // 7000
console.log(backoffDelay(10, { ...o, rand: () => 1 })); // 20000 (capped)`,
        },
        explanation:
          'Full jitter (uniform between 0 and the exponential ceiling) gives the lowest total work and fastest completion under contention in the classic AWS analysis. Retry-After is the server telling you when capacity returns, so it is a floor. Injecting rand and now makes the policy deterministic in tests.',
      },
      quickCheck: {
        question:
          'Which response should NOT be retried automatically?',
        options: [
          '429 with retry-after: 3',
          '529 overloaded_error',
          '400 invalid_request_error: max_tokens exceeds model limit',
          '503 service unavailable',
        ],
        correct: 2,
        explanation:
          'A 400 is deterministic: the same request will fail again, so retrying only wastes time and quota. 429 and 529 are capacity signals and 503 is transient, all worth retrying with backoff.',
      },
      source: 'AWS Architecture Blog — Exponential Backoff and Jitter',
    },
    {
      heading: 'Async Processing — 202 + job id, polling, webhooks and SSE for long LLM tasks',
      body: `**Intuition:** for a 3-second answer you wait at the counter. For a 6-minute report you get a ticket number and a buzzer. Async processing hands the client a **job id** immediately and delivers the result later, so no HTTP connection, load balancer or browser tab has to stay open for minutes.

**When to go async:** work longer than ~30 s (deep research agents, long document summaries, batch extraction), work that must survive restarts, or fan-out across many LLM calls. Load balancers and serverless platforms commonly cut idle connections at 30–60 s, and mobile clients drop.

**Patterns**
| Pattern | How | Best for |
|---|---|---|
| Polling | POST → 202 {jobId}; GET /jobs/:id every 2–5 s (with backoff) | simple clients, any infra |
| Webhook | you POST the result to the caller's URL, signed (HMAC) and retried | server-to-server integrations |
| SSE / WebSocket progress | client subscribes to job events (queued, step 2/5, done) | interactive UIs |
| Provider-side async | Batch APIs; OpenAI Responses \`background: true\` then retrieve/poll or webhook | long single model runs |

**Mechanics:** (1) validate and persist the job with status \`queued\` and an **idempotency key** (same request twice → same job); (2) enqueue; (3) workers update status/progress; (4) store results with a retention period; (5) notify. Jobs need a state machine (\`queued → running → succeeded | failed | cancelled\`) and cancellation that actually stops the LLM calls (AbortController).

**When not to:** short interactive answers; streaming is the better UX there.`,
      example: `"Generate a 20-page due-diligence report" takes ~4 min (12 retrieval + LLM steps).
- Sync attempt: the ALB's 60 s idle timeout kills 100% of requests; users retry and spawn duplicate jobs (3.4 per user on average, tripling cost).
- Async: POST /reports with header \`Idempotency-Key: 9b1…\` → 202 \`{ jobId: "rep_42", status: "queued" }\`. The client opens SSE on /reports/rep_42/events and sees \`step 3/12: analysing financials\`. Duplicate clicks return the same rep_42.
- Partner integration: result POSTed to their webhook with \`X-Signature: sha256=…\`; first delivery gets 500, retried at 30 s, 2 min, 10 min; succeeds on the 2nd try.
Result: zero timeouts, duplicate jobs down to ~0, cost per report back to 1×.`,
      diagram: `client                API                 queue        worker
  │ POST /reports       │                     │             │
  │ Idempotency-Key: K  │                     │             │
  │────────────────────▶│ upsert job(K) ─────▶│ add(jobId)  │
  │◀── 202 {jobId} ─────│                     │────────────▶│ run steps
  │                     │                     │             │ progress →
  │ GET /jobs/id (poll) │◀──── status/progress (DB/Redis) ──│
  │  or SSE /events     │                     │             │ result
  │◀── done + result ───│                     │             │
  │                     │── webhook POST (HMAC-signed, retried) ─▶ partner`,
      code: [
        {
          language: 'typescript',
          title: 'jobs-api.ts — idempotent 202 + job id with polling (Express + BullMQ)',
          code: `import express from 'express';
import { Queue } from 'bullmq';
import { randomUUID, createHash } from 'node:crypto';

const app = express();
app.use(express.json());
const connection = { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 };
const reports = new Queue('reports', { connection });

app.post('/reports', async (req, res) => {
  const key = req.get('Idempotency-Key') ?? randomUUID();
  const tenant = String(req.get('X-Tenant-Id'));
  // deterministic job id: the same tenant + key always maps to the same job
  const jobId = 'rep_' + createHash('sha256').update(tenant + ':' + key).digest('hex').slice(0, 24);
  const existing = await reports.getJob(jobId);
  if (!existing) {
    await reports.add('generate', { tenant, input: req.body }, {
      jobId, // BullMQ ignores add() for an existing jobId -> natural dedupe
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000, jitter: 0.5 },
      removeOnComplete: { age: 7 * 24 * 3600 }, // keep results for 7 days
    });
  }
  res.status(202).location('/reports/' + jobId).json({ jobId, status: existing ? await existing.getState() : 'waiting' });
});

app.get('/reports/:id', async (req, res) => {
  const job = await reports.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const state = await job.getState(); // waiting | active | completed | failed | delayed
  res.set('Retry-After', state === 'completed' || state === 'failed' ? '0' : '3'); // poll hint
  res.json({ jobId: job.id, state, progress: job.progress, result: state === 'completed' ? job.returnvalue : undefined });
});

app.listen(3000);`,
        },
      ],
      prosCons: {
        pros: [
          'No long-held HTTP connections; immune to proxy/load balancer idle timeouts.',
          'Jobs survive client disconnects and server restarts, and can be retried independently.',
          'Natural place for idempotency, progress reporting and cancellation.',
        ],
        cons: [
          {
            con: 'Polling adds load and latency (a result may sit for one poll interval).',
            fix: 'Return a Retry-After poll hint, use backoff on the client, or switch interactive clients to SSE/WebSocket push for completion events.',
          },
          {
            con: 'Webhooks fail silently when the receiver is down or rejects the payload.',
            fix: 'Sign payloads with HMAC and a timestamp, retry with exponential backoff for up to ~24 h, record deliveries, and provide a GET endpoint so receivers can reconcile.',
          },
          {
            con: 'Cancelled jobs keep burning tokens if the worker does not notice.',
            fix: 'Check a cancellation flag between steps and wire it to an AbortController passed into every LLM call.',
          },
        ],
      },
      keyPoints: [
        'Go async beyond ~30 s or when work must survive restarts.',
        'Return 202 + job id; dedupe with an idempotency key.',
        'Polling for simplicity, SSE for UX, signed + retried webhooks for servers.',
        'Model jobs as a state machine with real cancellation.',
      ],
      exercise: {
        prompt: `Implement webhook signing and verification: \`sign(secret, body, ts)\` returns \`"t=<ts>,v1=<hex hmac-sha256 of ts + '.' + body>"\`; \`verify(secret, body, header, nowSec, toleranceSec = 300)\` returns true only if the signature matches (constant-time compare) and the timestamp is within tolerance. Acceptance: a valid header verifies; a modified body fails; a header older than 5 minutes fails.`,
        hints: [
          'Use createHmac("sha256", secret).update(ts + "." + body).digest("hex").',
          'Parse header parts by splitting on "," then "=".',
          'Use timingSafeEqual on equal-length Buffers to avoid timing leaks.',
        ],
        solution: {
          language: 'typescript',
          code: `import { createHmac, timingSafeEqual } from 'node:crypto';

export function sign(secret: string, body: string, ts: number): string {
  const mac = createHmac('sha256', secret).update(ts + '.' + body).digest('hex');
  return 't=' + ts + ',v1=' + mac;
}

export function verify(secret: string, body: string, header: string, nowSec: number, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false; // replay protection
  const expected = createHmac('sha256', secret).update(ts + '.' + body).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1 ?? '', 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const now = 1_760_000_000;
const body = JSON.stringify({ jobId: 'rep_42', state: 'completed' });
const h = sign('whsec_test', body, now);
console.log(verify('whsec_test', body, h, now + 10)); // true
console.log(verify('whsec_test', body + ' ', h, now + 10)); // false (tampered)
console.log(verify('whsec_test', body, h, now + 301)); // false (too old)`,
        },
        explanation:
          'Signing the timestamp with the body prevents attackers replaying an old valid delivery; the tolerance window bounds replay. timingSafeEqual avoids leaking how many bytes matched. Receivers should also dedupe on a delivery id, because your retries can deliver the same event twice.',
      },
      quickCheck: {
        question:
          'A 5-minute LLM report endpoint runs synchronously behind a load balancer with a 60 s idle timeout. Users click retry after the error. What happens to cost?',
        options: [
          'Nothing; failed requests are not billed',
          'Cost multiplies, because the original server-side work often keeps running and each retry starts another full job',
          'Cost drops, because the load balancer cancels the provider call',
          'Cost is unchanged, because the provider dedupes identical prompts',
        ],
        correct: 1,
        explanation:
          'The load balancer closes the client connection, but the server usually continues its LLM calls (and is billed), and each user retry starts a new full job. Providers do not dedupe identical prompts. Async jobs with idempotency keys fix both problems.',
      },
      source: 'OpenAI docs — Background mode and webhooks',
    },
    {
      heading: 'Background Jobs and Queues — BullMQ workers, concurrency, retries and DLQs',
      body: `**Intuition:** a queue is a restaurant ticket rail. Orders (jobs) are pinned up instantly; cooks (workers) take them at a sustainable pace; failed dishes get remade a limited number of times; dishes that keep failing go to the manager's tray (dead-letter queue) instead of blocking the kitchen.

**BullMQ (Redis-backed) essentials**
| Concern | Setting |
|---|---|
| Throughput per worker | \`concurrency: 8\` (parallel jobs per process; LLM calls are I/O bound) |
| Provider-friendly pace | \`limiter: { max: 50, duration: 1000 }\` (jobs/s per queue) or manual \`worker.rateLimit(ms)\` on 429 |
| Retries | \`attempts: 5, backoff: { type: 'exponential', delay: 2000, jitter: 0.5 }\` |
| Permanent failure | throw \`UnrecoverableError\` (no further attempts) |
| Dead letters | on final failure, copy job to a \`*-dlq\` queue with error + attempts for inspection and replay |
| Memory | \`removeOnComplete\` / \`removeOnFail\` by age or count |
| Dedupe | deterministic \`jobId\` (or deduplication option) |
| Pipelines | FlowProducer parent/child jobs: chunk → embed → upsert |
| Crash safety | stalled-job detection re-queues jobs whose worker died; make processors idempotent |

**Sizing concurrency:** total in-flight calls = workers × concurrency must fit provider limits. Little's law: in-flight ≈ throughput × latency. 300 req/min (5/s) at 8 s each needs ~40 concurrent calls.

**Separate queues by priority and tenant class** (interactive follow-ups vs nightly backfills) so bulk work cannot starve urgent work.

**When to use:** ingestion and embedding pipelines, summarisation backfills, eval runs, webhooks delivery, any multi-step agent job.`,
      example: `Nightly job: summarise 30,000 support tickets with an LLM (avg 6 s per call, 4,000 tokens). Provider budget for this job: 600K TPM.
- TPM allows 600,000 / 4,000 = 150 calls/min = 2.5/s. In-flight needed ≈ 2.5 × 6 = 15 → 3 workers × concurrency 5.
- Runtime ≈ 30,000 / 150 = **200 min**.
- Failures: 2% hit 429/5xx and succeed on retry; 0.3% (90 tickets) contain unparseable attachments → \`UnrecoverableError\` → DLQ after 1 attempt instead of wasting 5 attempts each.
- One worker pod OOM-killed at 02:14: its 5 active jobs were detected as stalled and re-processed; idempotent upserts keyed by ticket id prevented duplicate summaries.`,
      diagram: `producers ──add(jobId)──▶ [ summarise queue (Redis) ]
                                │       ▲ stalled jobs re-queued
            ┌───────────────────┼───────┴─────────┐
            ▼                   ▼                 ▼
      worker A (c=5)      worker B (c=5)    worker C (c=5)
       limiter 150/min shared across workers
            │ ok                 │ retryable error      │ UnrecoverableError
            ▼                    ▼                      ▼
     upsert summary       backoff exp+jitter      failed ─▶ [ summarise-dlq ]
     (idempotent)         attempt 2..5                     inspect / replay`,
      code: [
        {
          language: 'typescript',
          title: 'worker.ts — BullMQ worker with limiter, retries, UnrecoverableError, DLQ and graceful shutdown',
          code: `import { Queue, Worker, UnrecoverableError } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { upsertSummary, loadTicket } from './db';

const connection = { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 };
const dlq = new Queue('summarise-dlq', { connection });
const client = new Anthropic({ maxRetries: 0, timeout: 60_000 }); // BullMQ owns retries

const worker = new Worker(
  'summarise',
  async (job) => {
    const ticket = await loadTicket(job.data.ticketId);
    if (!ticket) throw new UnrecoverableError('ticket not found'); // no point retrying
    try {
      const res = await client.messages.create({
        model: process.env.LLM_MODEL ?? 'claude-haiku-5-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: 'Summarise this support ticket:\\n' + ticket.text }],
      });
      const text = res.content.find((b) => b.type === 'text');
      await upsertSummary(ticket.id, text && text.type === 'text' ? text.text : ''); // idempotent by ticket id
      return { tokens: res.usage.output_tokens };
    } catch (err: any) {
      if (err?.status === 400) throw new UnrecoverableError('bad request: ' + err.message);
      throw err; // 429/5xx/timeouts -> retried with backoff from job options
    }
  },
  { connection, concurrency: 5, limiter: { max: 150, duration: 60_000 } },
);

worker.on('failed', async (job, err) => {
  if (!job) return;
  const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (final) await dlq.add('dead', { original: job.data, error: err.message, attempts: job.attemptsMade });
});

// Producer side: new Queue('summarise').add('t', { ticketId }, { jobId: 'sum:' + ticketId,
//   attempts: 5, backoff: { type: 'exponential', delay: 2000, jitter: 0.5 }, removeOnComplete: 1000 })

process.on('SIGTERM', async () => {
  await worker.close(); // finish active jobs, take no new ones
  process.exit(0);
});`,
        },
      ],
      prosCons: {
        pros: [
          'Smooths bursty demand into a steady, provider-friendly rate.',
          'Built-in retries with backoff, delayed jobs, priorities, rate limiting and parent/child flows.',
          'Crash recovery: stalled jobs are re-queued instead of lost.',
          'DLQs make permanent failures visible and replayable.',
        ],
        cons: [
          {
            con: 'At-least-once delivery means a job can run twice (stalls, retries after partial success).',
            fix: 'Make processors idempotent: deterministic ids, upserts, and check-before-side-effect records keyed by job id.',
          },
          {
            con: 'One huge tenant backfill can monopolise workers and delay urgent jobs.',
            fix: 'Separate queues (or priorities) for interactive vs bulk work, per-tenant concurrency caps or groups, and dedicated worker pools.',
          },
          {
            con: 'Redis memory grows unbounded with completed and failed jobs.',
            fix: 'Set removeOnComplete / removeOnFail by age or count, store large payloads and results in S3/DB and keep only references in the job.',
          },
          {
            con: 'Retries with the same poison input waste tokens (e.g. a prompt that always exceeds the context window).',
            fix: 'Classify errors: throw UnrecoverableError for 400/validation errors and route to the DLQ after one attempt.',
          },
        ],
      },
      keyPoints: [
        'Workers × concurrency must fit provider RPM/TPM (Little’s law).',
        'attempts + exponential backoff with jitter; UnrecoverableError for permanent failures.',
        'DLQ for final failures; idempotent processors for at-least-once delivery.',
        'Separate queues for interactive vs bulk; clean up completed jobs.',
      ],
      exercise: {
        prompt: `Write a pure function \`planWorkers({ jobs, avgLatencySec, tokensPerJob, tpmBudget, rpmBudget, concurrencyPerWorker })\` that returns \`{ ratePerMin, inFlight, workers, runtimeMin }\`: rate = min(TPM-bound, RPM-bound) jobs/min; in-flight = rate/60 × latency (ceil); workers = ceil(inFlight / concurrencyPerWorker); runtime = jobs / rate. Acceptance: 30,000 jobs, 6 s, 4,000 tokens, 600K TPM, 1,000 RPM, concurrency 5 → rate 150, inFlight 15, workers 3, runtime 200.`,
        hints: [
          'TPM-bound rate = tpmBudget / tokensPerJob; RPM-bound = rpmBudget.',
          'Little’s law: L = λ × W, with λ per second.',
          'Round up workers; round runtime to one decimal.',
        ],
        solution: {
          language: 'typescript',
          code: `type In = { jobs: number; avgLatencySec: number; tokensPerJob: number; tpmBudget: number; rpmBudget: number; concurrencyPerWorker: number };

export function planWorkers(i: In) {
  const ratePerMin = Math.min(i.tpmBudget / i.tokensPerJob, i.rpmBudget); // binding limit wins
  const inFlight = Math.ceil((ratePerMin / 60) * i.avgLatencySec); // Little's law
  const workers = Math.ceil(inFlight / i.concurrencyPerWorker);
  const runtimeMin = Math.round((i.jobs / ratePerMin) * 10) / 10;
  return { ratePerMin, inFlight, workers, runtimeMin };
}

console.log(planWorkers({ jobs: 30000, avgLatencySec: 6, tokensPerJob: 4000, tpmBudget: 600000, rpmBudget: 1000, concurrencyPerWorker: 5 }));
// { ratePerMin: 150, inFlight: 15, workers: 3, runtimeMin: 200 }`,
        },
        explanation:
          'Adding workers beyond the rate limit does not speed anything up; it only creates 429s. The provider budget sets throughput, latency sets how many calls must be in flight to reach it, and concurrency per worker sets the pod count. Configure the BullMQ limiter to the same rate so bursts stay within budget.',
      },
      quickCheck: {
        question:
          'A BullMQ job summarises a document and then emails the summary. The worker crashes after sending the email but before the job is marked complete. What happens and what is the fix?',
        options: [
          'Nothing; BullMQ guarantees exactly-once processing',
          'The job is detected as stalled and re-run, sending a duplicate email; record the send keyed by job id and skip if already sent',
          'The job is lost forever; add more replicas',
          'The job moves straight to failed; increase attempts',
        ],
        correct: 1,
        explanation:
          'BullMQ is at-least-once: a job whose lock expires because its worker died is moved back to wait and processed again. Without an idempotency record, side effects repeat. Exactly-once is not provided by the queue; you build effectively-once with idempotent operations.',
      },
      source: 'BullMQ docs — Workers, concurrency, rate limiting, retrying failing jobs',
    },
  ],
  codeChallenges: [
    {
      id: 'reliability-async-cc-1',
      title: 'Harden a naive LLM call loop against 429s and stalls',
      context:
        'A batch script enriches 50,000 product descriptions. During a provider brownout it sent 1.2M requests in 10 minutes, got banned for an hour, and several calls hung for 10 minutes each.',
      task: 'Rewrite the call so it retries only retryable errors with capped exponential backoff + full jitter, respects Retry-After, has an explicit timeout, does not stack with SDK retries, and caps concurrency.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();

async function enrich(text: string): Promise<string> {
  while (true) {
    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: 'Improve: ' + text }],
      });
      return r.choices[0].message.content ?? '';
    } catch (e) {
      console.log('retrying', e); // retry immediately, forever
    }
  }
}

await Promise.all(products.map((p) => enrich(p.text))); // 50,000 at once`,
      },
      hints: [
        'Disable SDK retries (maxRetries: 0) if you own retries, and set timeout explicitly.',
        'Check err.status against a retryable set; throw immediately on 400/401/403/404/422.',
        'Use a small concurrency pool (e.g. p-limit or a manual semaphore) instead of Promise.all over 50,000 items.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';

const openai = new OpenAI({ maxRetries: 0, timeout: 45_000 }); // we own retries; no 10-min hangs
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(err: any): number {
  const h = err?.headers;
  const ms = Number(h?.get?.('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const s = Number(h?.get?.('retry-after'));
  return Number.isFinite(s) && s > 0 ? s * 1000 : 0;
}

async function enrich(text: string, maxAttempts = 6): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await openai.chat.completions.create({
        model: process.env.LLM_MODEL ?? 'gpt-5-mini',
        max_completion_tokens: 300,
        messages: [{ role: 'user', content: 'Improve this product description:\\n' + text }],
      });
      return r.choices[0].message.content ?? '';
    } catch (err: any) {
      const status = err?.status as number | undefined;
      const retryable = status === undefined || RETRYABLE.has(status); // undefined = network/timeout
      if (!retryable || attempt + 1 >= maxAttempts) throw err;
      const backoff = Math.random() * Math.min(30_000, 1_000 * 2 ** attempt); // full jitter
      await sleep(Math.max(backoff, retryAfterMs(err)));
    }
  }
}

// Bounded concurrency pool: at most 16 calls in flight
async function mapPool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>) {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]).then((value) => ({ status: 'fulfilled', value }) as const, (reason) => ({ status: 'rejected', reason }) as const);
    }
  };
  await Promise.all(Array.from({ length: limit }, run));
  return out;
}

const results = await mapPool(products, 16, (p: { text: string }) => enrich(p.text));
const failed = results.filter((r) => r.status === 'rejected').length; // send these to a retry file/DLQ
console.log({ ok: results.length - failed, failed });`,
      },
      explanation:
        'The original retried every error forever with no delay (including permanent 400s), launched 50,000 concurrent requests, used the SDK default timeout (minutes) and silently stacked on the SDK’s own retries. The fix bounds attempts, retries only transient failures, spreads retries with full jitter while honouring Retry-After, sets a 45 s timeout, limits concurrency to 16 and collects failures for later replay instead of crashing the whole run.',
      followUps: [
        {
          q: 'How would you pick 16 as the concurrency?',
          a: 'From the rate limit and latency via Little’s law: if TPM allows ~2 requests/s and each takes ~6 s, about 12 should be in flight; add a little headroom and let the token bucket or 429 backoff absorb the rest.',
        },
        {
          q: 'This is a 50,000-item offline job. What would you change architecturally?',
          a: 'Use the provider Batch API for ~50% lower cost and separate limits, or a BullMQ queue with a limiter, retries and DLQ so the job is resumable instead of one long-running script.',
        },
      ],
    },
    {
      id: 'reliability-async-cc-2',
      title: 'Make a webhook-triggered agent job idempotent and crash-safe',
      context:
        'A CRM sends a webhook when a deal closes; your handler runs an LLM to draft a welcome email and sends it. The CRM retries webhooks on timeouts, and customers have received up to 4 identical emails.',
      task: 'Acknowledge fast, enqueue exactly one job per CRM event, make the processor idempotent across retries and crashes, and route permanent failures to a DLQ.',
      starter: {
        language: 'typescript',
        code: `app.post('/webhooks/deal-closed', async (req, res) => {
  const deal = req.body;
  const draft = await llm.draft(deal); // 10-25 s
  await mailer.send(deal.contactEmail, draft);
  res.sendStatus(200); // CRM times out after 10 s and retries
});`,
      },
      hints: [
        'Respond 2xx immediately after durably enqueueing; do the slow work in a worker.',
        'Use the CRM’s event id as the BullMQ jobId to dedupe redeliveries.',
        'Record "email sent for event X" before/atomically with sending and check it on re-runs; ideally pass an idempotency key to the mail provider.',
      ],
      solution: {
        language: 'typescript',
        code: `import { Queue, Worker, UnrecoverableError } from 'bullmq';

const connection = { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 };
const q = new Queue('welcome-email', { connection });
const dlq = new Queue('welcome-email-dlq', { connection });

app.post('/webhooks/deal-closed', async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);
  const eventId = String(req.body.eventId);
  await q.add('draft-and-send', { deal: req.body }, {
    jobId: 'deal-closed:' + eventId, // redelivered webhook -> same jobId -> no duplicate job
    attempts: 5,
    backoff: { type: 'exponential', delay: 10_000, jitter: 0.5 },
    removeOnComplete: { age: 30 * 24 * 3600 },
  });
  res.sendStatus(202); // fast ack, well inside the CRM's 10 s timeout
});

new Worker('welcome-email', async (job) => {
  const { deal } = job.data;
  if (!deal.contactEmail) throw new UnrecoverableError('missing contact email');
  // step 1: draft is cached per job so retries do not pay for the LLM twice
  let draft = await db.getDraft(job.id!);
  if (!draft) {
    draft = await llm.draft(deal);
    await db.saveDraft(job.id!, draft);
  }
  // step 2: side effect guarded by an idempotency record + provider idempotency key
  if (await db.wasSent(job.id!)) return { skipped: true };
  await mailer.send(deal.contactEmail, draft, { idempotencyKey: job.id });
  await db.markSent(job.id!);
  return { sent: true };
}, { connection, concurrency: 10 })
  .on('failed', async (job, err) => {
    if (job && (err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1))) {
      await dlq.add('dead', { jobId: job.id, data: job.data, error: err.message });
    }
  });`,
      },
      explanation:
        'Doing 10–25 s of work inside the webhook made the CRM time out and redeliver, and each delivery drafted and sent again. Now the handler verifies, enqueues with a deterministic jobId (dedupes redeliveries) and acks in milliseconds. The worker checkpoints the expensive LLM draft, guards the email with a sent-record and the mail provider’s idempotency key (covering a crash between send and markSent), and dead-letters permanent failures.',
      followUps: [
        {
          q: 'There is still a tiny window: crash after mailer.send but before markSent. How is it covered?',
          a: 'By the idempotency key passed to the mail provider: on re-run it recognises the same key and does not send again. Without provider support you accept at-least-once or use an outbox pattern where sending is a separate deduped step.',
        },
        {
          q: 'Why keep completed jobs for 30 days?',
          a: 'BullMQ dedupes by jobId only while the job exists; if it is removed, a late redelivery with the same id would create a new job. Retention must exceed the sender’s maximum redelivery window.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'reliability-async-iq-1',
      difficulty: 'hard',
      question: 'Design rate limiting for a multi-tenant LLM platform where 300 tenants share one provider quota of 10M TPM. How do you guarantee fairness and avoid 429s?',
      whatInterviewerLooksFor: [
        'Distributed token buckets for TPM and RPM in a shared store',
        'Hierarchical limits: global ≤ provider, per-tenant quotas, priority classes',
        'Reservation with max_tokens and reconciliation with actual usage',
        'Behaviour when limits are hit: queue, shed, degrade',
        'Use of provider headers and multiple keys/regions for headroom',
      ],
      modelAnswer: `**Layers**
1. **Global bucket** per provider/model in Redis at ~90% of 10M TPM (9M), plus an RPM bucket. Atomic Lua check-and-debit.
2. **Per-tenant buckets** from their plan (e.g. free 50K TPM, pro 500K, enterprise contract). Sum of guarantees ≤ global; unused capacity is borrowable (work-conserving), like weighted fair queuing.
3. **Priority classes**: interactive requests take from the global bucket first; batch/backfill jobs go through queues that only consume capacity above a reserved interactive floor (e.g. batch capped at 40% of global).

**Accounting.** Reserve input estimate + max_tokens before the call; refund the difference after the response. Correct drift with provider headers (remaining tokens, reset times).

**When exhausted.** Interactive: short wait (≤ 2 s) then a 429 to *our* client with Retry-After, or degrade to a smaller model with separate quota. Batch: stays in the queue; the worker limiter slows down.

**Headroom.** Multiple provider projects/regions (or cloud-provider-hosted endpoints) with their own quotas behind a gateway; batch APIs with separate pools for offline work.

**Observability.** Per-tenant consumption vs quota, 429s from provider (should be ~0), wait time in limiter, rejected requests by tenant. Alert when the global bucket is > 85% for 10 minutes: time to request a quota increase.`,
      followUps: [
        {
          q: 'An enterprise tenant pays for guaranteed 2M TPM. How do you honour it under contention?',
          a: 'Reserve it: other tenants can only borrow from it when idle and must yield first, e.g. a separate bucket for that tenant carved from the global quota, or weighted fair queuing with preemption of batch traffic.',
        },
        {
          q: 'Redis is down. What happens?',
          a: 'Fail open with conservative local limiters (global quota divided by pod count) and rely on 429 backoff; failing closed would take the whole product down for an infrastructure hiccup.',
        },
      ],
      pitfalls: [
        'Per-pod in-memory limiters that ignore the shared quota',
        'Counting only requests, not tokens',
        'No separation between interactive and batch traffic',
      ],
    },
    {
      id: 'reliability-async-iq-2',
      difficulty: 'medium',
      question: 'Walk me through your retry and timeout policy for an LLM-backed API. What do you retry, how long do you wait, and when do you give up?',
      whatInterviewerLooksFor: [
        'Retryable vs non-retryable classification',
        'Exponential backoff with jitter, cap, max attempts, Retry-After',
        'Timeout values derived from latency percentiles; streaming idle timeouts',
        'Awareness of SDK default retries and retry amplification',
        'Fallback and circuit breaking after giving up',
      ],
      modelAnswer: `**Classify.** Retry: 408, 409, 429, 500–504, 529, connection resets, my own idle-stream aborts. Never: 400, 401/403, 404, 413/422, content policy errors (deterministic).

**Backoff.** Full jitter: random(0, min(20 s, 500 ms × 2^n)), max 4 attempts for interactive, 8 for background jobs. Retry-After (or retry-after-ms) is a floor. Interactive requests also have a **deadline**: if the remaining time is less than the next backoff, give up now.

**Timeouts.** From measured latency: non-streaming total ≈ 1.5 × p99 (e.g. 30 s). Streaming: first-token timeout (e.g. 10 s for normal models, 60 s for reasoning models), idle gap timeout 20 s, overall cap 3–5 min. Never rely on the SDK's 10-minute default.

**One owner.** SDK maxRetries = 0 when the app/gateway retries; otherwise 2 retries × app retries × gateway retries amplify load during incidents. Global retry budget: retries ≤ 10% of traffic.

**After giving up.** Circuit breaker per provider/model: if error rate > 50% over 30 s, open the circuit and route to a fallback model/region for 60 s, then half-open probe. Return a clear error to users; never hang.

**Streaming nuance.** Retry silently only before the first token; after partial output, surface the error or resume.`,
      followUps: [
        {
          q: 'Why full jitter rather than fixed exponential backoff?',
          a: 'Fixed exponential backoff keeps clients synchronised, so they retry in waves that re-trigger throttling; randomising across the whole interval spreads load and empirically minimises total work and completion time.',
        },
        {
          q: 'How do you test this policy?',
          a: 'Fault-injection tests with a mock provider returning 429 with Retry-After, 503s, stalled streams and slow first tokens; assert attempt counts, delays (with injected randomness) and that 400s are not retried.',
        },
      ],
      pitfalls: [
        'Retrying 400s and content-policy errors',
        'Infinite retries or no deadline for interactive calls',
        'Only a total timeout for streaming responses',
      ],
    },
    {
      id: 'reliability-async-iq-3',
      difficulty: 'hard',
      question: 'A "deep research" feature runs an agent for 2–10 minutes. Design the API and execution model end to end.',
      context: 'Web and mobile clients; some enterprise customers want results delivered to their systems.',
      whatInterviewerLooksFor: [
        'Async job API with idempotency',
        'Durable queue/workflow with checkpoints per step',
        'Progress streaming and multiple delivery options',
        'Cancellation, timeouts, budgets and failure handling',
      ],
      modelAnswer: `**API**
- POST /research (Idempotency-Key) → 202 { jobId, statusUrl, eventsUrl }.
- GET /research/:id → state, progress, partial results, final result.
- GET /research/:id/events → SSE stream of progress (step started, sources found, draft ready).
- DELETE /research/:id → cancel.
- Optional webhook URL per tenant (HMAC-signed, retried with backoff for 24 h).

**Execution.** Job persisted in Postgres (source of truth) and enqueued in BullMQ (or a workflow engine like Temporal for long multi-step flows). The agent runs as steps: plan → search × N (fan-out as child jobs) → read → synthesise → cite-check. Each step **checkpoints** its output so a crash or deploy resumes from the last completed step instead of restarting (and re-paying).

**Limits.** Per-job budget (max tokens, max tool calls, wall-clock 15 min), per-tenant concurrency (e.g. 3 running jobs), provider token buckets shared with interactive traffic but at lower priority.

**Failure handling.** Step-level retries with backoff; non-retryable failures end the job with a partial result and an explanation; DLQ for unexpected errors. Cancellation flag checked between steps and wired to AbortController for in-flight LLM calls.

**Mobile.** Push notification on completion because the app may be backgrounded; SSE reconnects with Last-Event-ID.`,
      followUps: [
        {
          q: 'When would you choose a workflow engine like Temporal over BullMQ?',
          a: 'When jobs have many steps, long durations, human-in-the-loop waits, or need durable timers and exact replay semantics; Temporal persists every step’s result and resumes deterministically, whereas with BullMQ you build checkpoints yourself.',
        },
        {
          q: 'How does the SSE stream survive a deploy of the API servers?',
          a: 'Events are published to Redis/pub-sub and stored briefly; the client reconnects with Last-Event-ID and the new server replays missed events from the store, since job state lives outside the API process.',
        },
      ],
      pitfalls: [
        'Holding an HTTP request open for minutes',
        'No checkpoints, so failures restart and re-pay the whole run',
        'Cancellation that does not stop in-flight LLM calls',
      ],
    },
    {
      id: 'reliability-async-iq-4',
      difficulty: 'expert',
      question: 'Your queue-based ingestion workers caused a 429 storm that took down the interactive chatbot for 40 minutes. Diagnose and redesign.',
      context: '20 worker pods × concurrency 20 call the same embedding + chat models and project as the chatbot. BullMQ attempts: 10, backoff fixed 1 s.',
      whatInterviewerLooksFor: [
        'Identifies shared quota and unbounded concurrency as root causes',
        'Explains retry amplification from fixed backoff and high attempts',
        'Proposes isolation: separate projects/quotas, priority, limiters',
        'Adds adaptive concurrency / circuit breaking and monitoring',
      ],
      modelAnswer: `**What happened.** 400 concurrent calls from ingestion (20 × 20) consumed the shared TPM. Each 429 was retried after a fixed 1 s, synchronised across workers, up to 10 times, so offered load stayed far above the limit. The chatbot shared the same project quota, so its users got 429s too. Retries also delayed recovery because every reset window was immediately saturated again.

**Redesign**
1. **Isolation.** Separate provider project/API key (own quota) for batch ingestion, or Batch API for embeddings/LLM enrichment. Interactive traffic gets a reserved share.
2. **Rate-aware workers.** BullMQ limiter (or a shared Redis token bucket) sized from the ingestion quota; concurrency derived via Little's law, not guessed.
3. **Backoff.** Exponential with jitter, honour Retry-After, attempts 5; on a 429 call worker.rateLimit(ms) so the whole queue pauses instead of each job retrying independently.
4. **Adaptive concurrency.** AIMD: increase concurrency slowly while 429-free, halve on 429 bursts.
5. **Circuit breaker / priority.** If interactive 429 rate > 1%, automatically pause the ingestion queue (queue.pause()) until it recovers.
6. **Observability.** Provider 429 rate per project, queue depth and age, limiter wait time; alert on any interactive 429s.

**Result.** Ingestion slows down gracefully (hours instead of minutes), the chatbot stays within its SLO.`,
      followUps: [
        {
          q: 'What does worker.rateLimit do differently from per-job retries?',
          a: 'It tells the queue to stop handing out jobs to that worker for the given duration, so all jobs wait together; per-job retries keep each job independently hammering the provider after its own delay.',
        },
        {
          q: 'How would you size the reserved interactive share?',
          a: 'From peak interactive TPM (e.g. p99 of per-minute usage over the last 30 days) plus headroom (~30%); batch gets the remainder, and the reservation is revisited when traffic grows.',
        },
      ],
      pitfalls: [
        'Blaming the provider instead of offered load',
        'Raising attempts as the fix',
        'Keeping batch and interactive on the same quota with no priority',
      ],
    },
    {
      id: 'reliability-async-iq-5',
      difficulty: 'medium',
      question: 'Explain idempotency for LLM workflows. Where do you need it, and how do you implement it?',
      whatInterviewerLooksFor: [
        'Retries, redeliveries and double clicks as sources of duplicates',
        'Idempotency keys scoped to a logical operation and stored with results',
        'Side-effect protection (emails, payments, tickets, DB writes)',
        'Concurrency handling (two identical requests at the same time)',
      ],
      modelAnswer: `**Why.** At-least-once is the norm: clients retry on timeouts, users double-click, webhooks are redelivered, queue jobs re-run after stalls. For LLM workflows duplicates cost money (tokens) and can repeat side effects (two refunds, two emails, two tickets).

**Implementation**
1. **Key.** Client sends Idempotency-Key per logical operation (or derive one: hash(tenant, event id, operation version)).
2. **Store.** Table/Redis entry: key → status (in_progress / done / failed), request hash, response, expires_at (e.g. 24 h–7 days).
3. **Flow.** On request: atomically insert key with in_progress (INSERT … ON CONFLICT DO NOTHING / SET NX). If it existed and is done → return stored response; if in_progress → 409 or wait; if the request hash differs → 422 (key reuse with different payload).
4. **Side effects.** Each external effect gets its own derived key (jobId + "email") and uses the downstream provider's idempotency support when available; otherwise a "sent" record checked before and written after.
5. **Queues.** Deterministic jobId from the business event; retention longer than the sender's redelivery window.

**LLM-specific.** Outputs are non-deterministic, so "same request → same answer" only holds if you return the stored result, not if you re-run the model. Store the generation, not just a flag.`,
      followUps: [
        {
          q: 'Two identical requests arrive within 5 ms. What stops both from calling the LLM?',
          a: 'The atomic insert of the idempotency key: only one wins the INSERT/SET NX and proceeds; the other sees in_progress and either waits for the stored result or gets a 409 telling it to retry later.',
        },
        {
          q: 'Should the idempotency key include the prompt text?',
          a: 'No, it should identify the logical operation; store a hash of the request body alongside it to detect accidental key reuse with a different payload.',
        },
      ],
      pitfalls: [
        'Assuming the queue gives exactly-once delivery',
        'Re-running the LLM on duplicate requests and returning a different answer',
        'Expiring idempotency records before the retry window ends',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'reliability-async-est-1',
      question: 'How many worker pods and how long to re-summarise 400,000 documents within a 2M TPM budget reserved for batch work?',
      assumptions: [
        'Each job: 3,500 input + 500 output tokens = 4,000 tokens',
        'Average LLM latency 7 s per job',
        'Run the limiter at 90% of the budget',
        'Each worker pod runs concurrency 10',
        '3% of calls need one retry (extra tokens)',
      ],
      steps: [
        { label: 'Usable TPM', calc: '2,000,000 × 0.9 = 1,800,000' },
        { label: 'Effective tokens per job incl. retries', calc: '4,000 × 1.03 = 4,120' },
        { label: 'Jobs per minute', calc: '1,800,000 / 4,120 ≈ 437' },
        { label: 'Concurrent calls (Little’s law)', calc: '437 / 60 × 7 s ≈ 51' },
        { label: 'Worker pods', calc: '51 / 10 → 6 pods' },
        { label: 'Runtime', calc: '400,000 / 437 ≈ 915 min ≈ 15.3 h' },
      ],
      answer: '≈ 6 pods at concurrency 10, about 15 hours of runtime, bounded by TPM rather than by compute.',
      insight:
        'Adding pods beyond ~6 only produces 429s; to finish faster you need more quota (another project/region) or the Batch API with its separate pool, which also halves cost.',
      followUps: [
        {
          q: 'Using a Batch API instead, what changes?',
          a: 'Throughput is no longer bounded by your real-time TPM (separate batch quota), cost drops ~50%, and completion is within 24 h (often a few hours); you trade predictability of finish time for cost and simplicity.',
        },
      ],
    },
    {
      id: 'reliability-async-est-2',
      question: 'Estimate retry amplification during a provider brownout: SDK retries 2, your service retries 3 attempts, gateway retries 2 attempts, 1,000 user requests/min, 80% failing.',
      assumptions: [
        'SDK maxRetries 2 → up to 3 calls per SDK invocation',
        'Service: up to 3 attempts per request, each an SDK invocation',
        'Gateway: up to 2 attempts per service call',
        'Failures are independent with p = 0.8 per provider call',
      ],
      steps: [
        { label: 'Worst-case calls per user request', calc: '3 (SDK) × 3 (service) × 2 (gateway) = 18' },
        { label: 'Expected calls per SDK invocation', calc: '1 + 0.8 + 0.8² = 2.44' },
        { label: 'Probability an SDK invocation fails', calc: '0.8³ = 0.512' },
        { label: 'Expected service attempts', calc: '1 + 0.512 + 0.512² ≈ 1.78 → calls ≈ 1.78 × 2.44 ≈ 4.34' },
        { label: 'Probability service call fails', calc: '0.512³ ≈ 0.134 → gateway attempts ≈ 1.134' },
        { label: 'Expected provider calls per request', calc: '1.134 × 4.34 ≈ 4.9 → 1,000/min becomes ~4,900/min' },
      ],
      answer: 'Expected load rises ~4.9× (worst case 18×) exactly when the provider is struggling: ~4,900 calls/min instead of 1,000.',
      insight:
        'Layered retries multiply. Pick one retry owner, cap attempts, add a retry budget and a circuit breaker so load drops, rather than rises, during brownouts.',
      followUps: [
        {
          q: 'With only the service retrying (3 attempts, SDK and gateway off), what is the expected load?',
          a: 'Expected calls = 1 + 0.8 + 0.64 = 2.44 per request, so ~2,440/min, half of the layered case, and a retry budget can cap it further.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'reliability-async-mcq-01',
      difficulty: 'medium',
      question: 'A RAG endpoint sends 12K-token prompts. The account limit is 1M TPM and 3,000 RPM. Users see 429s at about 80 requests/min. Why?',
      options: [
        'The RPM limit is being hit',
        'The TPM limit is being hit: 80 × 12K ≈ 960K tokens/min, plus output reservation',
        'The provider is down',
        'The SDK is misconfigured with too few retries',
      ],
      correct: [1],
      explanation:
        '80 requests × 12K input tokens ≈ 960K TPM before counting output tokens or reservations, right at the 1M TPM ceiling, while 80 RPM is far below 3,000. Long prompts make TPM the binding limit; reducing context or prompt caching helps.',
      followUps: [
        {
          q: 'Name two ways to raise effective throughput without a quota increase.',
          a: 'Shrink input (fewer/shorter chunks, summarised history) and route some traffic to another model, project or region with its own quota; prompt caching may also reduce counted tokens depending on provider rules.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-02',
      difficulty: 'hard',
      question: 'What is the most serious problem with this retry helper under a provider outage?',
      code: {
        language: 'typescript',
        code: `async function call(req) {
  for (let i = 0; i < 8; i++) {
    try { return await client.messages.create(req); }
    catch (e) { await sleep(1000 * 2 ** i); }
  }
}`,
      },
      options: [
        'It retries too few times',
        'It retries every error (including 400s), has no jitter so clients retry in lockstep, and silently returns undefined after the last failure',
        'Exponential backoff is not recommended for LLM APIs',
        'sleep should be synchronous',
      ],
      correct: [1],
      explanation:
        'Three bugs: no error classification (permanent 400s are retried 8 times), no jitter (all clients wake up together and re-trigger throttling), and the function falls off the loop returning undefined instead of throwing. It also ignores Retry-After and with the SDK default stacks 3 calls per attempt. Exponential backoff itself is correct practice.',
      followUps: [
        {
          q: 'Roughly how long can this block a request in the worst case?',
          a: 'Sleeps sum to 1+2+4+…+128 = 255 s, plus 8 call durations (and SDK internal retries), so over 4 minutes: far beyond any interactive deadline.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL errors that a production LLM client should normally retry with backoff.',
      options: [
        '429 rate_limit_error',
        '529 overloaded_error from Anthropic',
        '401 authentication_error',
        'ECONNRESET during the request',
      ],
      correct: [0, 1, 3],
      explanation:
        '429 and 529 are capacity signals that clear with time, and connection resets are transient network failures. A 401 means the key is invalid or revoked; retrying cannot fix it and may trigger abuse protections, so fail fast and alert.',
      followUps: [
        {
          q: 'How should a 529 differ from a 429 in your handling?',
          a: 'A 429 is your own quota (respect Retry-After, slow down); a 529 is provider-wide overload, so after a couple of retries it is often better to fail over to another region or model than to keep waiting.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-04',
      difficulty: 'expert',
      question: 'This streaming handler sometimes hangs for 10 minutes. Which change fixes it best?',
      code: {
        language: 'typescript',
        code: `const stream = await openai.chat.completions.create(
  { model, stream: true, messages },
  { timeout: 600_000 },
);
for await (const chunk of stream) res.write(chunk.choices[0]?.delta?.content ?? '');
res.end();`,
      },
      options: [
        'Lower the total timeout to 15 s',
        'Add an idle timeout that aborts if no chunk arrives within ~20 s, reset on every chunk, plus a first-token timeout',
        'Increase maxRetries to 5',
        'Switch to non-streaming mode',
      ],
      correct: [1],
      explanation:
        'Stalled streams send nothing for long periods while the connection stays open, so only a gap-based (idle) timeout detects them quickly without killing long healthy answers. A 15 s total timeout would cut off normal long responses; more retries do not help a hang; non-streaming worsens perceived latency and still needs a timeout.',
      followUps: [
        {
          q: 'After an idle abort with 300 tokens already shown, should you retry automatically?',
          a: 'Not transparently: the user already saw partial text. Show an error with "continue", or resume by sending the partial output as an assistant prefix and asking the model to continue.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-05',
      difficulty: 'hard',
      question: 'Select ALL statements that are true about BullMQ job processing.',
      options: [
        'A job whose worker crashed mid-processing can be detected as stalled and processed again',
        'Throwing UnrecoverableError moves the job to failed without using remaining attempts',
        'BullMQ guarantees each job’s side effects happen exactly once',
        'Adding a job with an existing jobId does not create a duplicate job',
      ],
      correct: [0, 1, 3],
      explanation:
        'Stalled-job detection re-queues jobs whose lock expired, UnrecoverableError skips further retries, and custom jobIds dedupe additions while the job exists. Delivery is at-least-once, so exactly-once side effects must come from idempotent processors, not from the queue.',
      followUps: [
        {
          q: 'What determines how quickly a stalled job is detected?',
          a: 'The worker lock duration and stalled check interval: if a worker stops renewing its lock (crash, blocked event loop), the job is considered stalled after the lock expires and the next stalled check runs.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-06',
      difficulty: 'medium',
      question: 'Which endpoint design is most appropriate for an LLM task that takes 3–8 minutes?',
      options: [
        'Synchronous POST that returns the result when done',
        'POST returning 202 with a job id, plus polling or SSE/webhook for completion',
        'Synchronous POST with a 10-minute load balancer timeout',
        'WebSocket that holds the connection and retries the whole task on disconnect',
      ],
      correct: [1],
      explanation:
        'Async jobs decouple work from the connection: the client gets a durable handle and the result is delivered by polling, SSE or webhook. Raising proxy timeouts is fragile (mobile, deploys, other proxies), and restarting the whole task on disconnect wastes tokens.',
      followUps: [
        {
          q: 'How should the job id relate to the client’s idempotency key?',
          a: 'Derive it deterministically from tenant + idempotency key (or store the mapping) so repeated submissions return the same job instead of starting a new one.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-07',
      difficulty: 'expert',
      question: 'With 6 workers each at concurrency 25 and a provider limit allowing 2 requests/s at ~10 s latency, what happens?',
      options: [
        'Throughput rises to 150 concurrent requests and the job finishes 7× faster',
        'Only ~20 calls can usefully be in flight; the rest generate 429s and retries, adding load without adding throughput',
        'Nothing; the provider queues excess requests',
        'Latency drops because more connections are open',
      ],
      correct: [1],
      explanation:
        'Little’s law: in-flight = 2/s × 10 s = 20. With 150 concurrent slots, 130 calls exceed the quota and return 429s, which (with retries) amplifies load. Providers reject rather than queue over-limit requests. Size concurrency to the limit or add a limiter.',
      followUps: [
        {
          q: 'How could workers discover the right concurrency automatically?',
          a: 'Adaptive concurrency (AIMD): add one slot per success window, halve on 429 bursts, optionally guided by remaining-tokens headers, so the system converges near the provider limit.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-08',
      difficulty: 'hard',
      question: 'Select ALL valid reasons to add per-tenant rate limits even when the global provider limit is never reached.',
      options: [
        'To stop one tenant’s bulk job from adding latency for others',
        'To enforce plan tiers and cost caps',
        'To make provider responses deterministic',
        'To contain abuse such as a leaked API key generating traffic',
      ],
      correct: [0, 1, 3],
      explanation:
        'Per-tenant limits provide fairness (noisy neighbours), commercial enforcement and blast-radius control for abuse. They have nothing to do with output determinism, which is a sampling property of the model.',
      followUps: [
        {
          q: 'How should a tenant-level 429 differ from a provider 429 for your API clients?',
          a: 'Return your own 429 with Retry-After and a clear error code (tenant quota exceeded) and plan limits in headers, so clients can back off or upgrade, rather than leaking provider errors.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-09',
      difficulty: 'hard',
      question: 'What does this BullMQ configuration do when a job keeps throwing a 503 error?',
      code: {
        language: 'typescript',
        code: `await queue.add('embed', data, {
  attempts: 4,
  backoff: { type: 'exponential', delay: 2000, jitter: 0.5 },
});`,
      },
      options: [
        'Retries forever every 2 s',
        'Runs up to 4 times total, waiting roughly 2 s, 4 s, 8 s (each randomised by jitter) between attempts, then moves to failed',
        'Runs 5 times: 1 + 4 retries, with fixed 2 s gaps',
        'Fails immediately because 503 is not retryable in BullMQ',
      ],
      correct: [1],
      explanation:
        'attempts counts total runs, and exponential backoff waits 2^(attemptsMade−1) × delay (2 s, 4 s, 8 s), with jitter randomising each wait downwards by up to 50%. After the 4th failure the job goes to the failed set. BullMQ does not inspect HTTP codes; any thrown error is retried unless it is UnrecoverableError.',
      followUps: [
        {
          q: 'How would you send it to a DLQ after the 4th failure?',
          a: 'Listen to the worker’s failed event and, when attemptsMade ≥ opts.attempts (or the error is UnrecoverableError), add the job data and error to a separate dead-letter queue for inspection and replay.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-10',
      difficulty: 'expert',
      question: 'Select ALL causes of duplicate LLM-generated emails in a webhook → queue → worker flow.',
      options: [
        'The webhook sender redelivers because your handler took longer than its timeout',
        'Jobs are enqueued with random ids, so redeliveries create new jobs',
        'A worker crashes after sending but before completing, and the stalled job re-runs',
        'The LLM uses temperature 0.7',
      ],
      correct: [0, 1, 2],
      explanation:
        'Slow acknowledgements trigger redelivery, random job ids defeat dedupe, and at-least-once processing re-runs crashed jobs, all producing duplicates unless side effects are idempotent. Temperature changes the wording of each draft but does not create additional sends.',
      followUps: [
        {
          q: 'Which single change removes the most duplicates fastest?',
          a: 'Ack immediately and use the sender’s event id as the jobId, which removes redelivery duplicates; then add a sent-record or provider idempotency key for crash re-runs.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-11',
      difficulty: 'medium',
      question: 'Your service already wraps every OpenAI call in its own retry loop with 4 attempts. What should you set on the SDK client?',
      options: [
        'maxRetries: 10 for extra safety',
        'maxRetries: 0 and an explicit timeout, so retries happen in one place',
        'Leave defaults; SDK retries never overlap with application retries',
        'timeout: 0 to disable timeouts',
      ],
      correct: [1],
      explanation:
        'The SDK retries by default, so 4 application attempts × 3 SDK calls = up to 12 calls per request. Making one layer own retries keeps behaviour predictable, and an explicit timeout replaces the long SDK default. Disabling timeouts allows hangs.',
      followUps: [
        {
          q: 'When might you keep SDK retries and drop your own loop instead?',
          a: 'For simple services where the SDK’s built-in exponential backoff and Retry-After handling are sufficient and you do not need custom fallback, deadlines or retry budgets.',
        },
      ],
    },
    {
      id: 'reliability-async-mcq-12',
      difficulty: 'hard',
      question: 'This Redis token bucket is shared by 30 pods. What is the bug?',
      code: {
        language: 'typescript',
        code: `const tokens = Number(await redis.get('tpm')) || CAP;
if (tokens >= cost) {
  await redis.set('tpm', tokens - cost);
  return true;
}
return false;`,
      },
      options: [
        'Redis GET is too slow for rate limiting',
        'Read-modify-write is not atomic: concurrent pods read the same value and all debit it, overspending the limit; also the bucket never refills',
        'Numbers cannot be stored in Redis',
        'It should use DECR on every request regardless of cost',
      ],
      correct: [1],
      explanation:
        'Between GET and SET other pods read the same token count, so many requests pass on the same tokens (lost updates). It also has no refill logic, and a stored 0 falls back to CAP via ||. Use a Lua script (or MULTI with WATCH) that refills and debits atomically.',
      followUps: [
        {
          q: 'Why is a Lua script preferred over WATCH/MULTI here?',
          a: 'Lua runs atomically on the Redis server in one round trip without optimistic-lock retries, which matters under heavy contention from many pods.',
        },
      ],
    },
  ],
};

export default topic;
