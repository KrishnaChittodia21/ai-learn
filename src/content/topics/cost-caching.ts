import type { Topic } from '../../types';

const topic: Topic = {
  id: 'cost-caching',
  phase: 'llmops',
  order: 2,
  title: 'Cost Optimization, Semantic Caching and Prompt Caching',
  subtitle:
    'Cut LLM spend 50–90% without hurting quality: model tiering, token budgets, batch APIs, semantic caches that do not lie, and provider prompt caching done right.',
  estimatedMinutes: 44,
  sources: [
    'Anthropic docs — Prompt caching (cache_control, TTLs, pricing multipliers, minimum lengths, usage fields): https://platform.claude.com/docs/en/build-with-claude/prompt-caching',
    'Anthropic docs — Message Batches API: https://platform.claude.com/docs/en/build-with-claude/batch-processing',
    'OpenAI docs — Prompt caching (automatic prefix caching, prompt_cache_key, cached_tokens): https://developers.openai.com/api/docs/guides/prompt-caching',
    'OpenAI docs — Batch API (50% discount, 24 h completion window): https://platform.openai.com/docs/guides/batch',
    'Redis — Semantic caching for LLM apps (RedisVL SemanticCache): https://redis.io/docs/latest/develop/ai/redisvl/',
    'GPTCache (Zilliz) — semantic cache design and similarity evaluation: https://github.com/zilliztech/GPTCache',
    'Chen, Zaharia, Zou 2023 — FrugalGPT: How to Use LLMs While Reducing Cost and Improving Performance (model cascades): https://arxiv.org/abs/2305.05176',
    'Ong et al. 2024 — RouteLLM: Learning to Route LLMs with Preference Data: https://arxiv.org/abs/2406.18665',
  ],
  tags: ['llmops', 'cost', 'caching', 'semantic-cache', 'prompt-caching', 'batch-api', 'model-routing'],
  cheatSheet: [
    'Cost = calls × (input tokens × input price + output tokens × output price); output tokens often cost 4–8× input tokens, so cap and shorten outputs first.',
    'Biggest levers in order: right-size the model (tiering/routing), cut tokens (context, history, max_tokens), cache (prompt + semantic), batch non-urgent work (~50% off).',
    'Batch APIs (OpenAI Batch, Anthropic Message Batches): ~50% discount, results within 24 h; use for evals, backfills, enrichment, nightly summaries.',
    'Semantic cache = embed query → nearest cached query within the same tenant/model/prompt version → return answer if cosine ≥ threshold (often 0.92–0.97, tuned on labelled pairs).',
    'Semantic cache pitfalls: negations and entities ("cancel" vs "don’t cancel", "order 123" vs "order 124"), personalised answers, stale answers after doc updates, cross-tenant leaks.',
    'Anthropic prompt caching: cache_control {type:"ephemeral"} breakpoints (max 4), prefix order tools → system → messages, 5 min default TTL or "1h"; writes 1.25× (5 min) / 2× (1 h), reads ~0.1× base input.',
    'OpenAI prompt caching is automatic for prompts ≥ 1,024 tokens; hits show in usage.prompt_tokens_details.cached_tokens; prompt_cache_key improves routing/attribution.',
    'Cache-friendly layout: static first (tools, system, few-shot, documents), variable last (user turn, timestamps, user name). One dynamic token early in the prompt invalidates everything after it.',
    'Measure cache hit rate and cost per request per feature; a cache that hits 5% may cost more (writes, embeddings, lookups) than it saves.',
    'Never optimise blind: every cost change must pass the same eval suite as a quality change.',
  ],
  sections: [
    {
      heading: 'Cost Optimization — the levers and their order',
      body: `**Intuition:** an LLM bill is a taxi meter with two rates: one for the luggage you load (input tokens) and a much higher one for the distance driven (output tokens). You save most by taking a cheaper car for short trips, carrying less luggage and not driving further than needed.

**The cost equation:** monthly cost = Σ over features of calls × (input tokens × p_in + cached tokens × p_cache + output tokens × p_out). Every lever attacks one factor.

| Lever | Typical saving | Risk |
|---|---|---|
| Model tiering / routing (small model for easy requests, escalate hard ones) | 40–80% | quality drop on misrouted requests |
| Trim input: fewer/shorter chunks, summarised history, compact tool schemas | 20–60% | lost context |
| Cap output: max_tokens, "answer in ≤ 3 sentences", structured outputs | 10–50% | truncation (finish_reason = length) |
| Prompt caching of static prefixes | up to ~90% of cached input | needs stable prefix |
| Semantic/exact response caching | 100% of hit calls | stale or wrong hits |
| Batch API for async work | ~50% | up to 24 h latency |
| Fewer calls: merge steps, cap agent iterations, avoid retry storms | varies | — |

**Process:** (1) attribute cost per feature (see token tracking), (2) pick the top 2–3 features, (3) apply the lever, (4) run the eval suite to prove quality is unchanged, (5) watch cost per request in production.

**When to use which:** routing for mixed-difficulty traffic; caching for repeated prefixes or questions; batching for anything a human is not waiting on.`,
      example: `Support assistant: 1M requests/month, 3,500 input + 400 output tokens each, all on a premium model (illustrative $3 in / $15 out per 1M).
- Baseline: 1M × (3,500 × 3 + 400 × 15) / 1M = $10,500 + $6,000 = **$16,500/month**.
- Route 70% of traffic to a small model ($0.25 / $2): 700K × (875 + 800)/1M ≈ $1,173; remaining 300K on premium = $4,950 → $6,123.
- Cache the 3,000-token static prefix (reads ~0.1×): premium input drops from $3,150 to ~$720; small-model input from $613 to ~$140 → ≈ **$3,220/month**.
- Shorten answers to 250 tokens: output falls a further ~37%.
Total ≈ 80% saving, gated by an eval showing resolution rate within 1 pt of baseline.`,
      diagram: `request ─▶ exact/semantic cache ──hit──▶ answer ($0)
              │ miss
              ▼
           router (cheap classifier or small LLM)
         easy │                    │ hard
              ▼                    ▼
        small model           premium model
   (cached system prefix)  (cached system prefix)
              │  low confidence?   ▲
              └──── escalate ──────┘
non-urgent jobs ─▶ Batch API (~50% off, ≤ 24 h)`,
      code: [
        {
          language: 'typescript',
          title: 'cascade.ts — try the small model first, escalate only when it is unsure',
          code: `import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI();
const SMALL = process.env.SMALL_MODEL ?? 'gpt-5-mini';
const LARGE = process.env.LARGE_MODEL ?? 'gpt-5';

const Answer = z.object({ answer: z.string(), confidence: z.number().min(0).max(1) });

async function ask(model: string, q: string, ctx: string, maxTokens: number) {
  const res = await openai.chat.completions.create({
    model,
    max_completion_tokens: maxTokens, // hard cap on the expensive side of the bill (includes reasoning tokens)
    reasoning_effort: 'minimal', // keep hidden reasoning from eating the small cap
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Answer from the context in at most 3 sentences. Reply as JSON {"answer": string, "confidence": 0..1}.' },
      { role: 'user', content: 'Context:\\n' + ctx + '\\n\\nQuestion: ' + q },
    ],
  });
  let data: unknown = null;
  try { data = JSON.parse(res.choices[0].message.content ?? ''); } catch { /* truncated or non-JSON -> escalate */ }
  return { parsed: Answer.safeParse(data), usage: res.usage };
}

export async function cascade(q: string, ctx: string) {
  const small = await ask(SMALL, q, ctx, 250);
  // escalate on invalid output or low self-reported confidence (calibrate threshold on evals!)
  if (small.parsed.success && small.parsed.data.confidence >= 0.75) {
    return { ...small.parsed.data, model: SMALL };
  }
  const large = await ask(LARGE, q, ctx, 400);
  if (!large.parsed.success) throw new Error('Large model returned invalid JSON');
  return { ...large.parsed.data, model: LARGE, escalated: true };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Tiering and output caps usually deliver the largest savings with no infrastructure change.',
          'Batch APIs halve cost for evals, backfills and enrichment with a one-line workflow change.',
          'Savings compound: routing × caching × shorter outputs multiply, not add.',
        ],
        cons: [
          {
            con: 'Self-reported confidence from LLMs is poorly calibrated, so a cascade may keep wrong small-model answers.',
            fix: 'Calibrate the escalation threshold on a labelled eval set, or use a trained router (RouteLLM-style) or verifier signals (schema validity, retrieval score, judge) instead of raw self-confidence.',
          },
          {
            con: 'Aggressive max_tokens truncates answers mid-sentence.',
            fix: 'Instruct concise output explicitly, monitor finish_reason = length rate per feature, and alert above ~1%.',
          },
          {
            con: 'Cost cuts silently degrade quality because nobody re-ran evals.',
            fix: 'Gate every cost change behind the same offline eval suite and an online A/B on resolution/feedback metrics.',
          },
        ],
      },
      keyPoints: [
        'Attribute cost per feature first; optimise the top spenders.',
        'Output tokens are the expensive side: cap and shorten them.',
        'Route easy traffic to small models; escalate on calibrated signals.',
        'Batch anything nobody is waiting for (~50% off).',
        'Prove quality is unchanged with evals before shipping a saving.',
      ],
      exercise: {
        prompt: `Write \`monthlyCost(f)\` for a feature described by \`{ callsPerMonth, inTok, outTok, cachedTok, priceIn, priceCachedRead, priceOut, batchShare }\` (prices $/1M; \`cachedTok\` is part of \`inTok\`; \`batchShare\` = fraction of calls sent via a Batch API at 50% off). Acceptance: \`{callsPerMonth: 1e6, inTok: 3000, outTok: 300, cachedTok: 2000, priceIn: 3, priceCachedRead: 0.3, priceOut: 15, batchShare: 0}\` → 3000 + 600 + 4500 = $8,100; with batchShare 0.5 → $6,075.`,
        hints: [
          'Per call: (inTok − cachedTok) × priceIn + cachedTok × priceCachedRead + outTok × priceOut, divided by 1e6.',
          'Batch discount applies only to the batched share: multiply by (1 − 0.5 × batchShare).',
          'Return a number rounded to cents.',
        ],
        solution: {
          language: 'typescript',
          code: `type Feature = {
  callsPerMonth: number; inTok: number; outTok: number; cachedTok: number;
  priceIn: number; priceCachedRead: number; priceOut: number; batchShare: number;
};

export function monthlyCost(f: Feature): number {
  const perCall =
    ((f.inTok - f.cachedTok) * f.priceIn + f.cachedTok * f.priceCachedRead + f.outTok * f.priceOut) / 1e6;
  const discount = 1 - 0.5 * f.batchShare; // batch APIs ~50% off
  return Math.round(perCall * f.callsPerMonth * discount * 100) / 100;
}

const base = { callsPerMonth: 1e6, inTok: 3000, outTok: 300, cachedTok: 2000, priceIn: 3, priceCachedRead: 0.3, priceOut: 15, batchShare: 0 };
console.log(monthlyCost(base)); // 8100
console.log(monthlyCost({ ...base, batchShare: 0.5 })); // 6075`,
        },
        explanation:
          'Per call: 1,000 × 3 + 2,000 × 0.3 + 300 × 15 = 3,000 + 600 + 4,500 = 8,100 per million calls → $8,100. Half the calls at half price removes 25% → $6,075. A model like this makes the trade-offs (which lever, which feature) explicit before you touch code. Real batch requests cannot also rely on short-TTL prompt caches, so treat combined discounts conservatively.',
      },
      quickCheck: {
        question:
          'A feature uses 2,000 input and 600 output tokens per call on a model priced $1 in / $8 out per 1M. Which single change saves the most?',
        options: [
          'Cut input to 1,000 tokens',
          'Cut output to 300 tokens',
          'Cache 1,500 input tokens at 0.1× price',
          'Remove the system prompt (200 tokens)',
        ],
        correct: 1,
        explanation:
          'Output costs 600 × 8 = 4,800 vs input 2,000 × 1 = 2,000 (per 1M calls, in $). Halving output saves 2,400; halving input saves 1,000; caching 1,500 tokens saves 1,350; dropping 200 tokens saves 200. Expensive output tokens are usually the first target.',
      },
      source: 'Chen et al. 2023 — FrugalGPT (LLM cascades)',
    },
    {
      heading: 'Semantic Caching — reuse answers for similar questions, safely',
      body: `**Intuition:** an exact cache only helps if someone types the identical question. A semantic cache recognises that "How do I reset my password?" and "forgot password, how to reset" mean the same thing, and serves the stored answer for free in ~10 ms.

**Mechanics**
1. Normalise the query (trim, lowercase, strip greetings) and try an **exact** hash cache first (cheapest).
2. Embed the query (e.g. text-embedding-3-small, 1536-d).
3. Vector search the cache **scoped by tenant, model, prompt version and locale**, with an expiry filter.
4. If the best cosine similarity ≥ threshold, return the cached answer; else call the LLM and store \`(embedding, query, answer, scope, expires_at)\`.

**Choosing the threshold.** Build 300–500 labelled query pairs (same intent / different intent), sweep the threshold, and pick the point where false-hit rate is below your tolerance (e.g. < 1%). Typical values land between 0.92 and 0.97, but they depend on the embedding model.

**What goes wrong**
| Pitfall | Example | Mitigation |
|---|---|---|
| False hits on negation/entities | "cancel my order" vs "don't cancel my order" (cos 0.95) | entity/number check, cross-encoder verify, higher threshold |
| Personalised answers | "what's my balance?" | never cache user-specific or tool-derived answers |
| Staleness | policy updated, cache still says 30 days | TTL + invalidate by source doc ids |
| Tenant leaks | tenant A's answer served to tenant B | tenant id in the cache key/filter, always |

**When to use:** FAQ-like, high-repeat traffic (support, docs search, internal help desks). Skip for conversational multi-turn prompts or agentic flows where context makes every request unique.`,
      example: `An HR help bot gets 40K questions/day; offline analysis of a week of logs with threshold 0.95 shows 31% of queries would hit.
- Labelled 400 pairs: at 0.93 false-hit rate was 3.2% ("parental leave UK" ≈ "parental leave US", cos 0.94); at 0.95 it fell to 0.6%; at 0.97 hit rate dropped to 18%. Chose 0.95 + a rule that numbers/countries in the query must match.
- Per hit: saves one LLM call (~$0.004) and ~2.5 s; costs one embedding (~$0.000002) and a ~8 ms vector lookup.
- 12,400 hits/day × $0.004 ≈ **$50/day saved**, p50 latency for hits 15 ms.
- Answers carry source doc ids; when the leave policy doc is re-ingested, its 1,900 dependent cache entries are invalidated.`,
      diagram: `query ─▶ normalise ─▶ exact hash hit? ──yes──▶ answer
                          │ no
                          ▼
                 embed (1536-d)
                          ▼
   vector search WHERE tenant=? AND model=? AND prompt_v=?
                 AND expires_at > now()  LIMIT 1
                          ▼
        cos ≥ 0.95 AND entities match? ──yes──▶ cached answer
                          │ no
                          ▼
              LLM call ─▶ store (emb, answer, scope,
                                 source_doc_ids, expires_at)`,
      code: [
        {
          language: 'typescript',
          title: 'semantic-cache.ts — pgvector-backed, tenant-scoped semantic cache with TTL',
          code: `import OpenAI from 'openai';
import { Pool } from 'pg';

const openai = new OpenAI();
const pg = new Pool();
const THRESHOLD = Number(process.env.SEM_CACHE_THRESHOLD ?? 0.95);
// table: sem_cache(id serial, tenant text, scope text, query text, answer text,
//        embedding vector(1536), source_ids text[], expires_at timestamptz)

async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
  return r.data[0].embedding;
}
const numbers = (s: string) => (s.match(/\\d+/g) ?? []).join(',');

export async function cachedAnswer(tenant: string, scope: string, query: string, generate: () => Promise<{ answer: string; sourceIds: string[] }>) {
  const q = query.trim().toLowerCase();
  const vec = JSON.stringify(await embed(q)); // pgvector accepts '[0.1,0.2,...]'
  const { rows } = await pg.query(
    'SELECT query, answer, 1 - (embedding <=> $1::vector) AS sim FROM sem_cache ' +
      'WHERE tenant = $2 AND scope = $3 AND expires_at > now() ' + // isolation + TTL
      'ORDER BY embedding <=> $1::vector LIMIT 1',
    [vec, tenant, scope],
  );
  const best = rows[0];
  // similarity alone is not enough: "order 123" vs "order 124" are near-identical vectors
  if (best && best.sim >= THRESHOLD && numbers(best.query) === numbers(q)) {
    return { answer: best.answer as string, cached: true, sim: Number(best.sim) };
  }
  const fresh = await generate();
  await pg.query(
    "INSERT INTO sem_cache (tenant, scope, query, answer, embedding, source_ids, expires_at) VALUES ($1,$2,$3,$4,$5::vector,$6, now() + interval '24 hours')",
    [tenant, scope, q, fresh.answer, vec, fresh.sourceIds],
  );
  return { answer: fresh.answer, cached: false };
}`,
        },
      ],
      prosCons: {
        pros: [
          'A hit costs one cheap embedding plus a lookup (~10 ms) instead of a multi-second, multi-cent LLM call.',
          'Consistent answers for the same question, which users and auditors like.',
          'Absorbs traffic spikes (outage announcements, launch days) where many users ask the same thing.',
        ],
        cons: [
          {
            con: 'False hits: semantically close but different questions (negation, different entity or number) get a confidently wrong answer.',
            fix: 'Tune the threshold on labelled pairs, require exact match of extracted entities/numbers, and optionally verify near-threshold hits with a cross-encoder.',
          },
          {
            con: 'Stale answers after the underlying documents change.',
            fix: 'Store source doc ids with each entry and invalidate on re-ingestion, plus a TTL (hours to days) as a backstop.',
          },
          {
            con: 'Cross-tenant or cross-user leakage of private answers.',
            fix: 'Scope every lookup by tenant (and prompt/model version), and never cache answers that depend on user-specific data or tool calls.',
          },
          {
            con: 'Low hit rates make the cache a net cost (embedding + storage + latency on every miss).',
            fix: 'Measure the potential hit rate offline on real logs before building, and disable the cache for features below ~10% hits.',
          },
        ],
      },
      keyPoints: [
        'Exact cache first, semantic second.',
        'Scope by tenant, model and prompt version; add TTL and doc-based invalidation.',
        'Tune the threshold on labelled pairs; watch false-hit rate, not just hit rate.',
        'Never cache personalised or tool-derived answers.',
      ],
      exercise: {
        prompt: `Given labelled pairs \`{ sim: number; same: boolean }[]\` (cosine similarity and whether the two queries truly share intent), write \`pickThreshold(pairs, maxFalseHit)\` that returns the **lowest** threshold (scanning 0.80 → 0.99 in 0.01 steps) whose false-hit rate (different-intent pairs with sim ≥ t, divided by all pairs with sim ≥ t) is ≤ maxFalseHit, along with the resulting hit rate (same-intent pairs with sim ≥ t divided by all same-intent pairs). Acceptance: returns null if no threshold qualifies.`,
        hints: [
          'Loop t from 0.80 to 0.99, rounding to 2 decimals to avoid float drift.',
          'Hits at threshold t = pairs with sim ≥ t; false hits are those with same = false.',
          'Lowest qualifying threshold maximises hit rate.',
        ],
        solution: {
          language: 'typescript',
          code: `type Pair = { sim: number; same: boolean };

export function pickThreshold(pairs: Pair[], maxFalseHit: number) {
  const positives = pairs.filter((p) => p.same).length;
  for (let i = 80; i <= 99; i++) {
    const t = i / 100;
    const served = pairs.filter((p) => p.sim >= t);
    if (served.length === 0) continue;
    const falseHits = served.filter((p) => !p.same).length;
    const falseHitRate = falseHits / served.length;
    if (falseHitRate <= maxFalseHit) {
      const hitRate = positives ? served.filter((p) => p.same).length / positives : 0;
      return { threshold: t, falseHitRate, hitRate };
    }
  }
  return null;
}

const pairs: Pair[] = [
  { sim: 0.97, same: true }, { sim: 0.96, same: true }, { sim: 0.95, same: false },
  { sim: 0.94, same: true }, { sim: 0.93, same: false }, { sim: 0.9, same: true },
];
console.log(pickThreshold(pairs, 0.0)); // { threshold: 0.96, falseHitRate: 0, hitRate: 0.5 }`,
        },
        explanation:
          'The threshold is a precision/recall knob: lower thresholds catch more paraphrases but serve more wrong answers. Picking the lowest threshold that meets a false-hit budget maximises savings within your risk tolerance. Recompute whenever you change the embedding model, because similarity scales differ between models.',
      },
      quickCheck: {
        question:
          'Your semantic cache shows a 45% hit rate, and complaints about wrong answers rose after launch. What is the best first diagnostic?',
        options: [
          'Lower the threshold to raise the hit rate further',
          'Sample cache hits near the threshold and label whether the cached question truly matches the new one',
          'Switch to a larger embedding model immediately',
          'Shorten the TTL to one minute',
        ],
        correct: 1,
        explanation:
          'Rising complaints with a high hit rate suggest false hits. Labelling a sample of near-threshold hits measures the false-hit rate and shows the failure pattern (negations, entities, staleness) before you choose a fix. Lowering the threshold makes it worse; changing models or TTL blindly may not address the cause.',
      },
      source: 'Redis docs — RedisVL SemanticCache; GPTCache design notes',
    },
    {
      heading: 'Prompt Caching — provider-side prefix caching and cache-friendly prompts',
      body: `**Intuition:** the model re-reads your 10-page manual on every request. Prompt caching lets the provider remember its internal state (the KV cache) for the *unchanged beginning* of the prompt, so it only processes the new part: cheaper and faster.

**It is a prefix match.** The cache key is the exact token sequence from the start. Change one token early (a timestamp in the system prompt) and everything after it misses.

| | Anthropic (Messages API) | OpenAI |
|---|---|---|
| How | explicit \`cache_control: {type: "ephemeral"}\` on up to 4 blocks, or top-level automatic caching | automatic for prompts ≥ 1,024 tokens |
| Prefix order | tools → system → messages | tools, instructions, messages as sent |
| TTL | 5 min default (refreshed on each hit), optional \`ttl: "1h"\` | minutes of inactivity; extended retention options on some models |
| Price | write 1.25× (5 min) or 2× (1 h); read ≈ 0.1× base input (lower on some newer models) | read heavily discounted; check model pricing |
| Usage fields | cache_creation_input_tokens, cache_read_input_tokens | prompt_tokens_details.cached_tokens |
| Min size | model-dependent (≈ 512–4,096 tokens) | 1,024 tokens |

**Cache-friendly layout:** static → slow-changing → per-request. Tools and system instructions first, then few-shot examples and large documents, then conversation history, then the new user message. Put timestamps, user names and request ids at the end (or not at all). Keep tool definitions in a stable order and serialisation.

**Break-even (Anthropic 5-min TTL):** first request pays 1.25×, each hit pays ~0.1×, so caching pays off from the second request that reuses the prefix within the TTL.

**When to use:** long system prompts, document Q&A over the same document, agent loops (the growing conversation is the prefix), few-shot heavy prompts.`,
      example: `A contract-analysis tool sends a 40K-token contract + 2K-token instructions, then 10 questions within 3 minutes. Illustrative $3/1M input.
- No caching: 10 × 42K = 420K input tokens → **$1.26**.
- With a breakpoint after the contract: first call writes 42K at 1.25× = $0.1575; 9 hits read 42K at 0.1× = 9 × $0.0126 = $0.1134; plus ~50 new tokens per question (negligible) → **≈ $0.27**, a 79% saving.
- Usage on call 2: \`cache_read_input_tokens: 42000, cache_creation_input_tokens: 0, input_tokens: 48\`.
- TTFT fell from ~3.1 s to ~0.9 s because the 42K-token prefill was skipped.
A teammate then added "Current time: 14:03:27" to the top of the system prompt: cache reads dropped to 0 and cost returned to ~$1.58 (writes on every call).`,
      diagram: `  request N                       request N+1
 ┌───────────────────────┐       ┌───────────────────────┐
 │ tools (static)        │ ═══▶  │ tools                 │ cached
 │ system instructions   │ ═══▶  │ system instructions   │ (read
 │ 40K contract  [BP ●]  │ ═══▶  │ 40K contract  [BP ●]  │  ~0.1×)
 ├───────────────────────┤       ├───────────────────────┤
 │ history               │       │ history + answer N    │ new
 │ user question N       │       │ user question N+1     │ (1×)
 └───────────────────────┘       └───────────────────────┘
 ✗ timestamp at the top ⇒ prefix differs ⇒ every call is a miss`,
      code: [
        {
          language: 'typescript',
          title: 'prompt-cache.ts — Anthropic cache_control breakpoints with a cache-friendly layout',
          code: `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';

export async function askAboutContract(contract: string, history: Anthropic.MessageParam[], question: string) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [
      { type: 'text', text: 'You are a contract analyst. Cite clause numbers. Be concise.' },
      {
        type: 'text',
        text: '<contract>\\n' + contract + '\\n</contract>',
        // breakpoint: everything up to here (tools + system) is cached
        cache_control: { type: 'ephemeral' }, // or { type: 'ephemeral', ttl: '1h' }
      },
    ],
    messages: [
      ...history, // grows over the session; could carry a second breakpoint on its last block
      { role: 'user', content: question }, // the only part that changes every call
    ],
  });
  const u = res.usage;
  console.log({
    written: u.cache_creation_input_tokens, // > 0 on first call (billed ~1.25x)
    read: u.cache_read_input_tokens, // > 0 on hits (billed ~0.1x)
    uncached: u.input_tokens, // tokens after the last breakpoint
  });
  const text = res.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? text.text : '';
}`,
        },
      ],
      prosCons: {
        pros: [
          'Large savings on repeated long prefixes (cached reads ~90% cheaper) with no quality risk: the model sees the same tokens.',
          'Lower TTFT because the cached prefix skips prefill.',
          'Works naturally for agent loops and multi-turn chat, where each turn extends the previous prompt.',
        ],
        cons: [
          {
            con: 'Any change early in the prompt (timestamp, user name, reordered tools, non-deterministic JSON key order) silently kills the hit rate.',
            fix: 'Put volatile content last, serialise tools and documents deterministically, and alert when cache_read tokens / total input drops below a baseline.',
          },
          {
            con: 'Cache writes cost more than normal input (1.25× or 2× on Anthropic), so one-off prompts get more expensive.',
            fix: 'Only add breakpoints where reuse within the TTL is likely; use the 1 h TTL only when gaps between reuses exceed 5 minutes.',
          },
          {
            con: 'Prompts below the minimum cacheable length are never cached, with no error returned.',
            fix: 'Check usage fields in tests: if both cache fields are 0, the prefix is too short or changed; consolidate static content above the minimum.',
          },
        ],
      },
      keyPoints: [
        'Prompt caching is exact prefix matching: static first, volatile last.',
        'Anthropic: explicit cache_control breakpoints (max 4), 5 min or 1 h TTL, write premium, cheap reads.',
        'OpenAI: automatic above 1,024 tokens; check cached_tokens in usage.',
        'Track cache read share of input tokens as a first-class metric.',
      ],
      exercise: {
        prompt: `Write \`cacheSavings({ prefixTokens, suffixTokens, callsWithinTtl, priceIn, writeMult, readMult })\` that returns \`{ withoutCache, withCache, savingPct }\` in dollars for a burst of calls sharing one prefix (first call writes, the rest read). Acceptance: prefix 40,000, suffix 100, 10 calls, $3/1M, write 1.25, read 0.1 → withoutCache ≈ $1.203, withCache ≈ $0.261, saving ≈ 78.3%. Also return the break-even number of calls (smallest n where withCache < withoutCache).`,
        hints: [
          'withoutCache = calls × (prefix + suffix) × price.',
          'withCache = prefix × writeMult + (calls − 1) × prefix × readMult, plus calls × suffix, all × price.',
          'Loop n from 1 upward to find break-even.',
        ],
        solution: {
          language: 'typescript',
          code: `type In = { prefixTokens: number; suffixTokens: number; callsWithinTtl: number; priceIn: number; writeMult: number; readMult: number };

function costs(i: In, n: number) {
  const p = i.priceIn / 1e6;
  const without = n * (i.prefixTokens + i.suffixTokens) * p;
  const withC = (i.prefixTokens * i.writeMult + (n - 1) * i.prefixTokens * i.readMult + n * i.suffixTokens) * p;
  return { without, withC };
}

export function cacheSavings(i: In) {
  const { without, withC } = costs(i, i.callsWithinTtl);
  let breakEven = 1;
  while (costs(i, breakEven).withC >= costs(i, breakEven).without && breakEven < 1000) breakEven++;
  return {
    withoutCache: Number(without.toFixed(4)),
    withCache: Number(withC.toFixed(4)),
    savingPct: Number((100 * (1 - withC / without)).toFixed(1)),
    breakEven,
  };
}

console.log(cacheSavings({ prefixTokens: 40000, suffixTokens: 100, callsWithinTtl: 10, priceIn: 3, writeMult: 1.25, readMult: 0.1 }));
// { withoutCache: 1.203, withCache: 0.261, savingPct: 78.3, breakEven: 2 }`,
        },
        explanation:
          'One call with caching costs 1.25× (worse); two calls cost 1.25 + 0.1 = 1.35× vs 2×, so break-even is the second call. With the 1 h TTL (2× write) the second call is still slightly worse (2.1 vs 2), so break-even moves to the third call (2.2 vs 3). The real risk is not the maths but reuse falling outside the TTL.',
      },
      quickCheck: {
        question:
          'Which prompt layout gets the best cache hit rate for a multi-tenant assistant with per-tenant docs and per-user names?',
        options: [
          'User name → system instructions → tenant docs → question',
          'System instructions → tenant docs → user name → question',
          'Tenant docs → question → system instructions',
          'Question → system instructions → tenant docs',
        ],
        correct: 1,
        explanation:
          'Order from most shared to least shared: global instructions (shared by everyone), tenant docs (shared within a tenant), then per-user and per-request content. Starting with the user name makes the prefix unique per user, and putting the question early makes it unique per request.',
      },
      source: 'Anthropic docs — Prompt caching; OpenAI docs — Prompt caching',
    },
  ],
  codeChallenges: [
    {
      id: 'cost-caching-cc-1',
      title: 'Repair a semantic cache that leaks and lies',
      context:
        'A B2B support platform added this in-memory semantic cache. Hit rate is 52%, but a customer reported seeing another company’s refund terms, and others get answers about the wrong order number.',
      task: 'Make the cache tenant-isolated, version-aware, TTL-bound and resistant to entity/number false hits, and skip caching for personalised answers.',
      starter: {
        language: 'typescript',
        code: `const cache: { emb: number[]; answer: string }[] = [];

export async function answer(q: string, userId: string, tenantId: string) {
  const emb = await embed(q);
  for (const c of cache) {
    if (cosine(c.emb, emb) > 0.85) return c.answer; // first match wins
  }
  const a = await llm(q, { userId, tenantId }); // may call account tools
  cache.push({ emb, answer: a.text });
  return a.text;
}`,
      },
      hints: [
        'Key every entry by tenant, model and prompt version; the threshold should come from labelled data, not a guess.',
        'Take the best match, not the first one above threshold, and compare extracted numbers/IDs.',
        'If the LLM used user-specific tools (account lookups), do not store the answer.',
      ],
      solution: {
        language: 'typescript',
        code: `type Entry = { emb: number[]; query: string; answer: string; scope: string; expiresAt: number; sourceIds: string[] };

const THRESHOLD = Number(process.env.SEM_CACHE_THRESHOLD ?? 0.95); // tuned on labelled pairs
const TTL_MS = 24 * 3600 * 1000;
const PROMPT_VERSION = process.env.PROMPT_VERSION ?? 'v7';
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
const store = new Map<string, Entry[]>(); // tenant -> entries (use a vector DB in production)

const ids = (s: string) => (s.match(/[A-Z]{2,}-?\\d+|\\d+/gi) ?? []).map((x) => x.toLowerCase()).sort().join('|');

export async function answer(q: string, userId: string, tenantId: string) {
  const scope = MODEL + ':' + PROMPT_VERSION;
  const norm = q.trim().toLowerCase();
  const emb = await embed(norm);
  const now = Date.now();
  const entries = (store.get(tenantId) ?? []).filter((e) => e.expiresAt > now && e.scope === scope);
  store.set(tenantId, entries); // evict expired / old-version entries lazily

  let best: Entry | undefined;
  let bestSim = -1;
  for (const e of entries) {
    const s = cosine(e.emb, emb);
    if (s > bestSim) { bestSim = s; best = e; }
  }
  if (best && bestSim >= THRESHOLD && ids(best.query) === ids(norm)) return best.answer;

  const a = await llm(q, { userId, tenantId });
  // personalised answers (account tools used) must never be shared
  if (!a.usedUserTools) {
    entries.push({ emb, query: norm, answer: a.text, scope, expiresAt: now + TTL_MS, sourceIds: a.sourceIds });
  }
  return a.text;
}

export function invalidateBySource(tenantId: string, docId: string) {
  store.set(tenantId, (store.get(tenantId) ?? []).filter((e) => !e.sourceIds.includes(docId)));
}`,
      },
      explanation:
        'The original shared one global list across tenants (data leak), used a guessed low threshold of 0.85 with first-match semantics (false hits), cached answers derived from account tools (privacy leak), never expired entries and ignored prompt/model changes. The fix partitions by tenant, scopes by model and prompt version, tunes the threshold, compares order numbers and other identifiers, refuses to cache personalised outputs, and supports TTL plus source-based invalidation.',
      followUps: [
        {
          q: 'How do you move this from in-memory to multi-instance production?',
          a: 'Use a shared vector store (Redis with vector search, pgvector or Qdrant) with tenant and scope as indexed filter fields, a TTL/expires_at column, and an index on source_ids for invalidation; in-memory caches per pod fragment the hit rate.',
        },
        {
          q: 'How would you validate the 0.95 threshold after launch?',
          a: 'Log similarity and both queries for a sample of hits, label them weekly, track false-hit rate by similarity bucket, and alert on increased thumbs-down rate for cached answers versus fresh ones.',
        },
      ],
    },
    {
      id: 'cost-caching-cc-2',
      title: 'Turn a cache-hostile prompt into a cache-friendly one',
      context:
        'An agent sends ~18K tokens per turn (tools + 12K-token product catalog + history). Usage shows cache_read_input_tokens = 0 on almost every request and the bill is 6× the estimate.',
      task: 'Restructure the request so the static prefix is cached across users and turns, add breakpoints in the right places, and expose a cache-hit metric.',
      starter: {
        language: 'typescript',
        code: `const res = await client.messages.create({
  model: MODEL,
  max_tokens: 800,
  tools: Object.values(toolRegistry), // registry order varies between pods
  system:
    'Today is ' + new Date().toISOString() + '. User: ' + user.name + '.\\n' +
    'You are a shopping assistant.\\n' + JSON.stringify(catalog),
  messages: history.concat({ role: 'user', content: input }),
});`,
      },
      hints: [
        'The timestamp and user name at the very start make every request a unique prefix.',
        'Object.values on a registry built from async imports can change tool order between processes.',
        'Use system as an array of blocks and put cache_control on the last static block; consider a second breakpoint at the end of history.',
      ],
      solution: {
        language: 'typescript',
        code: `import Anthropic from '@anthropic-ai/sdk';
import { metrics } from '@opentelemetry/api';

const client = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';
const cacheShare = metrics.getMeter('llm').createHistogram('app.llm.cache_read_share');

// Deterministic tool order and serialisation
const TOOLS = Object.keys(toolRegistry).sort().map((k) => toolRegistry[k]);
const CATALOG = stableStringify(catalog); // sorted keys, rebuilt only when catalog version changes

export async function turn(user: { name: string }, history: Anthropic.MessageParam[], input: string) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    tools: TOOLS,
    system: [
      { type: 'text', text: 'You are a shopping assistant.' },
      // breakpoint 1: tools + instructions + catalog, shared by ALL users
      { type: 'text', text: '<catalog>' + CATALOG + '</catalog>', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ],
    messages: [
      ...history,
      {
        role: 'user',
        content: [
          // volatile facts go last, next to the question
          { type: 'text', text: 'Context: today is ' + new Date().toISOString().slice(0, 10) + ', user ' + user.name + '.' },
          { type: 'text', text: input, cache_control: { type: 'ephemeral' } }, // breakpoint 2: conversation so far
        ],
      },
    ],
  });
  const u = res.usage;
  const total = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  cacheShare.record(total ? (u.cache_read_input_tokens ?? 0) / total : 0, { 'gen_ai.request.model': MODEL });
  return res;
}`,
      },
      explanation:
        'The ISO timestamp (changing every millisecond) and the user name sat at the very start, so no two requests shared a prefix; tool order also varied by pod. The fix orders content from global to per-request, serialises tools and catalog deterministically, uses a 1 h breakpoint for the catalog shared across users (reused often but with gaps), a 5 min breakpoint for the growing conversation, moves date and name next to the question with date-level granularity, and records the cache-read share so regressions are visible.',
      followUps: [
        {
          q: 'Why is a 1 h TTL appropriate for the catalog but the default for the conversation breakpoint?',
          a: 'The catalog prefix is shared by all users and must survive quiet periods, so paying a 2× write occasionally beats frequent 1.25× rewrites after expiry; a single conversation’s turns usually arrive within minutes, so the cheaper 5 min write is enough.',
        },
        {
          q: 'The catalog changes hourly. What happens and how do you handle it?',
          a: 'Each catalog version creates a new prefix and one cache write per TTL window; keep the version stable for the hour, avoid tiny incremental edits, and if updates are frequent move volatile fields (stock, prices) out of the cached block and fetch them via a tool.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'cost-caching-iq-1',
      difficulty: 'hard',
      question: 'Your CFO asks you to cut a $120K/month LLM bill by 50% within a quarter without hurting customer satisfaction. Walk through your plan.',
      whatInterviewerLooksFor: [
        'Starts from cost attribution, not guesses',
        'Ranks levers by savings vs risk (routing, token trimming, caching, batching)',
        'Gates every change with offline evals and online metrics',
        'Puts guardrails in place so cost does not creep back',
      ],
      modelAnswer: `**Week 1–2: measure.** Usage ledger by feature × model × token type. Typical picture: 2–3 features are 70% of spend; output tokens are 40–60% of cost; cache read share is low; one agent flow averages many calls per request.

**Quick wins (low risk)**
- **Prompt caching:** reorder prompts static-first, add breakpoints; target cache-read share > 60% of input on long-prompt features.
- **Output caps:** max_tokens per feature, concise style instructions, structured outputs instead of prose.
- **Batch APIs** for evals, backfills, nightly reports (~50% off).
- **Context trimming:** top_k 20 → 6 with a reranker, summarised history.

**Medium risk**
- **Model tiering/routing:** small model for classification, extraction and FAQ-style questions; premium only for complex reasoning. Use a router trained/calibrated on labelled traffic or a cascade with validated escalation signals.
- **Semantic cache** where offline replay shows ≥ 15–20% potential hits and false-hit rate < 1%.
- **Agent loop limits**: cap iterations, cache tool results, merge planner/critic calls.

**Safety net.** Every change goes through the golden eval suite (task success, faithfulness) and a staged online A/B watching CSAT, resolution rate and escalation to humans. Roll out per feature behind flags.

**Keep it down.** Per-feature budgets and cost-per-request alerts, prompt-change PRs showing token deltas, monthly cost review. Realistic outcome: caching + output caps ≈ 25–35%, routing ≈ 20–40% on top.`,
      followUps: [
        {
          q: 'Routing to a small model dropped CSAT by 2 points on one feature. What next?',
          a: 'Analyse the misrouted cases, retrain or recalibrate the router on them, raise the escalation threshold for that feature, or exclude it from routing; a 2-point CSAT loss may cost more than the savings.',
        },
        {
          q: 'How do you prevent cost from creeping back after the project?',
          a: 'Budget and cost-per-request alerts per feature, CI checks that report token deltas on prompt changes, cache-hit-rate alerts, and ownership: each feature team sees its own LLM spend monthly.',
        },
      ],
      pitfalls: [
        'Switching every feature to the cheapest model without evals',
        'Optimising input tokens while ignoring the more expensive output side',
        'Building a semantic cache before measuring the potential hit rate',
      ],
    },
    {
      id: 'cost-caching-iq-2',
      difficulty: 'expert',
      question: 'Design a semantic cache for a multi-tenant enterprise search assistant. How do you guarantee it never serves a wrong or leaked answer at scale?',
      context: '600 tenants, 5M queries/day, documents change hourly, some answers depend on the user’s permissions.',
      whatInterviewerLooksFor: [
        'Tenant and permission scoping in the cache key',
        'Invalidation tied to source documents plus TTL',
        'Threshold tuning on labelled data and secondary verification',
        'Clear policy on what is cacheable',
        'Monitoring false hits in production',
      ],
      modelAnswer: `**What is cacheable.** Only answers whose inputs are fully captured by the cache key: (tenant, permission set hash, locale, model, prompt version, normalised query). Answers using per-user tools (my tickets, my balance) are never cached.

**Permissions.** Users with different ACLs may retrieve different docs. Key by a hash of the *effective permission groups* (bounded set), or cache retrieval results per group rather than final answers.

**Storage.** Vector store (Redis/pgvector/Qdrant) with filterable fields tenant, perm_hash, scope, expires_at, source_doc_ids. HNSW per tenant partition for large tenants.

**Lookup.** Exact hash → ANN top-3 within scope → accept if sim ≥ τ (tuned per embedding model on ~500 labelled pairs, false-hit ≤ 0.5%) **and** extracted entities/numbers match. Near-threshold band (τ to τ+0.02) is verified by a cross-encoder; reject if it disagrees.

**Freshness.** On document re-ingest, the pipeline emits doc-updated events; the cache deletes entries whose source_doc_ids include that doc. TTL (e.g. 12 h) as a backstop.

**Monitoring.** Hit rate, false-hit rate on a labelled weekly sample, feedback on cached vs fresh answers, invalidation lag. Kill switch per tenant.

**Scale.** 5M/day ≈ 58 QPS average; embeddings are already computed for retrieval, so reuse them. Expect 20–35% hits on enterprise search.`,
      followUps: [
        {
          q: 'Why might caching retrieval results be safer than caching final answers?',
          a: 'Retrieved chunk ids can be re-filtered against the current user’s permissions and freshness at serve time and the answer regenerated cheaply, whereas a final answer bakes in content the next user might not be allowed to see.',
        },
        {
          q: 'How do you choose the TTL?',
          a: 'From document change frequency and the cost of staleness: measure how often answers for a query change when re-generated, set TTL below that interval for volatile domains, and rely on event-based invalidation for correctness.',
        },
      ],
      pitfalls: [
        'Keying only by query embedding, ignoring tenant and permissions',
        'Relying only on TTL for freshness',
        'Using a single global threshold copied from a blog post',
      ],
    },
    {
      id: 'cost-caching-iq-3',
      difficulty: 'hard',
      question: 'Explain how provider prompt caching works under the hood and how you would maximise hit rate for a multi-turn agent with 20 tools.',
      whatInterviewerLooksFor: [
        'KV cache reuse of an exact token prefix',
        'Provider differences (explicit breakpoints vs automatic) and TTL/pricing',
        'Concrete layout rules and deterministic serialisation',
        'Measuring hit rate via usage fields',
      ],
      modelAnswer: `**Mechanism.** During prefill the model computes key/value tensors for every prompt token. If a new request starts with exactly the same tokens, the provider can reload the stored KV tensors for that prefix and only prefill the new tokens. Hence: exact prefix match, cheaper reads, lower TTFT, and nothing changes in output quality.

**Providers.** Anthropic: explicit \`cache_control\` on up to 4 blocks (or top-level automatic caching), hierarchy tools → system → messages, 5 min TTL refreshed on hit or 1 h, writes 1.25×/2×, reads ~0.1×. OpenAI: automatic for prompts ≥ 1,024 tokens, \`prompt_cache_key\` to improve routing for shared prefixes, \`cached_tokens\` in usage.

**Agent layout**
1. Tools: 20 definitions sorted by name, stable JSON key order, no per-request descriptions (no "user's timezone is…" in tool descriptions).
2. System prompt: static instructions; then semi-static context (tenant policies) with a breakpoint.
3. Conversation: each turn appends tool calls/results; place a breakpoint on the latest message so the next turn reuses the whole history.
4. Volatile data (time, user name) inside the latest user message, not the system prompt.
5. Avoid changing tool lists mid-session (dynamic tool loading invalidates everything after tools); prefer enabling/disabling via instructions or tool_choice where possible.

**Measure.** cache_read / total input per feature, cost per turn, TTFT; alert on drops. Sessions idle > 5 min lose the cache: consider the 1 h TTL for long-thinking agents.`,
      followUps: [
        {
          q: 'Your agent edits the system prompt mid-session to add a scratchpad. Impact?',
          a: 'Everything after the system block (all conversation history) is invalidated and re-written at the write premium; put the scratchpad in a message at the end instead.',
        },
        {
          q: 'Does prompt caching help output token cost?',
          a: 'No; it only discounts and speeds up input prefill. Output tokens are generated fresh at full price, so output caps and routing remain separate levers.',
        },
      ],
      pitfalls: [
        'Thinking caching changes model outputs or quality',
        'Ignoring tool definition order and serialisation',
        'Not verifying hits through usage fields',
      ],
    },
    {
      id: 'cost-caching-iq-4',
      difficulty: 'medium',
      question: 'When would you use a Batch API instead of real-time calls, and what changes in your system design?',
      whatInterviewerLooksFor: [
        'Identifies latency-tolerant workloads',
        'Knows the ~50% discount and up-to-24 h window',
        'Designs submission, polling/webhook, result mapping and partial failures',
        'Considers rate-limit pool separation',
      ],
      modelAnswer: `**Good fits:** offline evals and LLM-as-judge runs, backfilling summaries/metadata/embeddings for a corpus, nightly report generation, synthetic data generation, re-classification of tickets, migration re-processing. Rule: if no human is waiting and results are useful within hours, batch it.

**Economics.** Batch APIs (OpenAI Batch, Anthropic Message Batches) give roughly 50% off input and output, separate (higher) rate-limit pools, and complete within 24 h (often much faster).

**Design changes**
1. **Submission job:** build requests with a stable \`custom_id\` per item (e.g. doc id + task version), chunk into batches within size limits, store batch ids.
2. **Completion:** poll status on a schedule (or use provider notifications where available), then download results.
3. **Result mapping:** results may come back in any order; join on custom_id, never on position.
4. **Partial failures:** some items error or expire; re-submit only those, with a cap on attempts.
5. **Idempotent writes:** upsert results keyed by custom_id so re-processing a result file is safe.
6. **Observability:** batch-level metrics (items, errors, turnaround), cost recorded at batch price.

**Not for:** interactive features, anything with SLA under hours, or chains where step 2 depends on step 1 quickly (each hop could take hours).`,
      followUps: [
        {
          q: 'A 100K-item backfill must be done by morning. How do you reduce the risk of missing the deadline?',
          a: 'Split into several batches submitted early, monitor progress, and have a fallback that sends remaining items through the real-time API with rate limiting if batches are not done by a cutoff time.',
        },
        {
          q: 'Can you combine prompt caching with batches?',
          a: 'Some providers apply caching discounts inside batches, but hits are best-effort because requests run at unpredictable times; put the shared prefix first anyway and treat any cache savings as a bonus.',
        },
      ],
      pitfalls: [
        'Joining results by position instead of custom_id',
        'No handling for expired or errored items',
        'Using batch for multi-step chains with tight latency needs',
      ],
    },
    {
      id: 'cost-caching-iq-5',
      difficulty: 'hard',
      question: 'Compare exact caching, semantic caching, prompt caching and retrieval caching. Where would you put each in a RAG system?',
      whatInterviewerLooksFor: [
        'Clear definition of what each caches and its key',
        'Risk profile of each (none for prompt caching, false hits for semantic)',
        'Placement in the request flow',
        'Invalidation strategy per layer',
      ],
      modelAnswer: `| Layer | Caches | Key | Risk | Invalidation |
|---|---|---|---|---|
| Exact response cache | final answer | hash(normalised query, tenant, scope) | low (stale) | TTL, doc events |
| Semantic cache | final answer | query embedding + scope | false hits, leaks | TTL, doc events, threshold |
| Retrieval cache | top-k chunk ids for a query | hash(query, filters, index version) | stale ids | index version bump |
| Embedding cache | query/document vectors | hash(text, embedding model) | none | model change |
| Prompt (KV) cache | provider-side prefix computation | exact token prefix | none for quality | automatic TTL |

**Placement in a RAG request:** exact cache → semantic cache → (embedding cache) → retrieval cache → rerank → LLM call with a cache-friendly prompt (static instructions first, retrieved context after, question last).

**Reasoning.** Prompt caching is free quality-wise, so always design for it. Exact and embedding caches are near-zero risk. Semantic caching has the highest payoff per hit but the highest risk; deploy only where repeat questions are common and with tight scoping. Retrieval caching helps when retrieval (hybrid search + rerank) is slow, and is safe if keyed by index version.

Note: retrieved context changes per query, so in RAG the cacheable prefix is mostly the system prompt and tools; for long shared documents (one-doc Q&A) caching pays much more.`,
      followUps: [
        {
          q: 'Why include index version in the retrieval cache key?',
          a: 'After re-indexing or an embedding migration, old chunk ids may be deleted or re-chunked; versioning the key makes old entries unreachable automatically instead of serving dangling or stale ids.',
        },
        {
          q: 'Which layer would you add first for a new product?',
          a: 'Prompt-cache-friendly layout (free) plus an embedding cache; then measure repeat rates from logs before deciding on exact or semantic response caches.',
        },
      ],
      pitfalls: [
        'Treating all caches as equally risky',
        'Forgetting index/model versions in cache keys',
        'Putting retrieved context before static instructions',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'cost-caching-est-1',
      question: 'Is a semantic cache worth it for a support bot at 200K queries/day? Estimate daily savings and costs.',
      assumptions: [
        'LLM call cost per miss: 3,000 input + 300 output tokens on a model at $1 / $8 per 1M (illustrative) = $0.0054',
        'Embedding: 20 tokens/query at $0.02 per 1M',
        'Expected hit rate from log replay: 25%',
        'Vector store for 2M cached entries × 1536-d float32 + metadata: managed cost ~$15/day',
        'False hits cost a human escalation: $3 each; false-hit rate 0.5% of hits',
      ],
      steps: [
        { label: 'Hits per day', calc: '200,000 × 0.25 = 50,000' },
        { label: 'LLM savings', calc: '50,000 × $0.0054 = $270/day' },
        { label: 'Embedding cost (all queries)', calc: '200,000 × 20 = 4M tokens × $0.02/1M = $0.08/day' },
        { label: 'Vector storage size', calc: '2M × 1536 × 4 B ≈ 12.3 GB (+ index overhead) → ~$15/day' },
        { label: 'False-hit cost', calc: '50,000 × 0.005 × $3 = $750/day' },
        { label: 'Net', calc: '$270 − $0.08 − $15 − $750 ≈ −$495/day' },
      ],
      answer: 'At a 0.5% false-hit rate the cache loses ~$495/day: escalations ($750) dwarf LLM savings ($270). At 0.05% false hits it saves ~$180/day.',
      insight:
        'The real cost of semantic caching is wrong answers, not infrastructure. Push the false-hit rate down (higher threshold, entity checks, verification) even at the price of a lower hit rate; the LLM call you avoid is cheap compared with a bad answer.',
      followUps: [
        {
          q: 'What if the model were 10× more expensive ($0.054 per call)?',
          a: 'Savings become $2,700/day, so even at 0.5% false hits the cache nets ~$1,935/day; expensive models raise the value of hits, but you should still reduce false hits for user trust.',
        },
      ],
    },
    {
      id: 'cost-caching-est-2',
      question: 'An agent runs 15 turns per session; each turn re-sends tools (4K tokens) + system (3K) + growing history (avg 6K). Estimate input cost per session with and without Anthropic prompt caching.',
      assumptions: [
        'Illustrative input price $3 per 1M; cache write 1.25×, cache read 0.1×',
        'Turns arrive within the 5-minute TTL',
        'Each turn adds ~800 new tokens to history (tool results + messages); history averages 6K over the session',
        'Breakpoint on the last message each turn, so all previous content is a cache read next turn',
      ],
      steps: [
        { label: 'Input per turn without caching', calc: '4K + 3K + 6K = 13K tokens' },
        { label: 'Session without caching', calc: '15 × 13K = 195K tokens × $3/1M = $0.585' },
        { label: 'With caching: reads per turn', calc: '≈ 13K − 0.8K new = 12.2K read × 0.1 = 1.22K equivalent tokens' },
        { label: 'With caching: writes per turn', calc: '≈ 0.8K new × 1.25 = 1.0K equivalent tokens' },
        { label: 'First turn full write', calc: '7K (tools+system) × 1.25 = 8.75K equivalent' },
        { label: 'Session with caching', calc: '8.75K + 15 × (1.22K + 1.0K) ≈ 42K equivalent tokens × $3/1M ≈ $0.126' },
      ],
      answer: '≈ $0.59 per session without caching vs ≈ $0.13 with caching: about 78% less input cost.',
      insight:
        'Agents are the best case for prompt caching because each turn is the previous prompt plus a little more. Any change to tools or system mid-session throws that away, so keep the prefix immutable for the session.',
      followUps: [
        {
          q: 'Users often pause 10 minutes between turns. What changes?',
          a: 'With the 5 min TTL most turns would re-write the whole prefix at 1.25×, costing more than no caching; switch to the 1 h TTL (2× write, still ~0.1× reads), which keeps the savings across pauses.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'cost-caching-mcq-01',
      difficulty: 'medium',
      question: 'Which workload is the best candidate for a provider Batch API?',
      options: [
        'Live chat replies for a customer support widget',
        'Nightly LLM-as-judge scoring of 50,000 production traces',
        'Autocomplete suggestions while a user types',
        'A voice assistant answering in real time',
      ],
      correct: [1],
      explanation:
        'Batch APIs trade latency (results within up to 24 h) for roughly 50% lower prices and separate rate limits, ideal for offline evaluation. All the other options have users waiting in real time, where hours of latency are unacceptable.',
      followUps: [
        {
          q: 'How do you match batch results back to traces?',
          a: 'Give each request a custom_id derived from the trace id and judge version, then join results on custom_id; result order is not guaranteed to match submission order.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-02',
      difficulty: 'hard',
      question: 'Why does this prompt almost never get a cache hit on either Anthropic or OpenAI?',
      code: {
        language: 'typescript',
        code: `const system =
  'Request ' + crypto.randomUUID() + '\\n' +
  POLICY_TEXT_8K_TOKENS + '\\n' +
  FEW_SHOT_EXAMPLES_3K_TOKENS;
await llm({ system, messages: [{ role: 'user', content: question }] });`,
      },
      options: [
        'The system prompt is too long to be cached',
        'A unique value at the very start makes every prefix different',
        'Few-shot examples are excluded from caching',
        'Caching requires temperature 0',
      ],
      correct: [1],
      explanation:
        'Prompt caches match on an exact token prefix from the beginning; a random UUID in the first line means no two requests share even the first few tokens. 11K tokens is well above minimum cache sizes, any content type can be cached, and sampling temperature does not affect prefix reuse.',
      followUps: [
        {
          q: 'Where should a request id go if the model needs it?',
          a: 'At the end of the prompt (e.g. in the final user message) or, better, nowhere in the prompt at all: keep it in request metadata and logs.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL safeguards that reduce wrong answers from a semantic cache.',
      options: [
        'Requiring extracted numbers and IDs in the query to match the cached query',
        'Scoping lookups by tenant, model and prompt version',
        'Lowering the similarity threshold so more paraphrases match',
        'Invalidating entries when their source documents are re-ingested',
      ],
      correct: [0, 1, 3],
      explanation:
        'Entity/number checks stop "order 123" being answered with "order 124"; scoping prevents answers from another tenant or an older prompt; source-based invalidation prevents stale policy answers. Lowering the threshold increases hits but also increases false hits, which is the opposite of a safeguard.',
      followUps: [
        {
          q: 'Which safeguard also prevents a security incident, not just a quality one?',
          a: 'Tenant scoping, because without it one tenant’s confidential answer can be served to another tenant, which is a data leak.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-04',
      difficulty: 'medium',
      question: 'With Anthropic 5-minute prompt caching (write 1.25×, read 0.1×), how many requests sharing the same prefix within the TTL are needed before caching costs less than not caching?',
      options: ['1', '2', '5', '10'],
      correct: [1],
      explanation:
        'One request: 1.25× vs 1× (worse). Two requests: 1.25 + 0.1 = 1.35× vs 2× (better). So the second reuse within the TTL breaks even and beyond. Five and ten are far more pessimistic than the actual multipliers imply.',
      followUps: [
        {
          q: 'What about the 1-hour TTL with a 2× write?',
          a: 'Two requests cost 2 + 0.1 = 2.1× vs 2× (slightly worse); three cost 2.2× vs 3× (better), so break-even moves to the third request.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-05',
      difficulty: 'expert',
      question: 'You inspect a response from the Anthropic Messages API: input_tokens 120, cache_creation_input_tokens 9,500, cache_read_input_tokens 0. On the very next identical-prefix request 30 seconds later you see the same numbers again. What is the most likely cause?',
      options: [
        'The prefix is below the minimum cacheable length',
        'The prefix differs between the two requests (e.g. non-deterministic serialisation before the breakpoint)',
        'The TTL already expired',
        'Cache reads are only reported in the streaming API',
      ],
      correct: [1],
      explanation:
        'A cache write of 9,500 tokens proves the prefix is long enough and the cache works; a second write instead of a read within 30 s means the prefix bytes changed, typically unordered JSON keys, tool ordering or an embedded timestamp before the breakpoint. 30 s is well within the 5 min TTL, and usage is reported for both streaming and non-streaming calls.',
      followUps: [
        {
          q: 'How would you find the differing bytes quickly?',
          a: 'Log a hash of each block before the breakpoint (tools, each system block) per request and diff the blocks whose hash changes between consecutive requests.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-06',
      difficulty: 'hard',
      question: 'Select ALL items that belong at the END of a prompt for the best prompt-cache hit rate.',
      options: [
        'The current date and time',
        'Tool definitions',
        'The retrieved chunks for this specific query',
        'The user’s new message',
      ],
      correct: [0, 2, 3],
      explanation:
        'Anything that changes per request (time, per-query retrieved context, the new message) should come after the static prefix. Tool definitions are static and sit at the very beginning of the cache hierarchy; moving them later or varying them invalidates everything after.',
      followUps: [
        {
          q: 'Retrieved chunks change per query. Is there any way to cache them?',
          a: 'Only when many queries share the same documents (e.g. a single-document Q&A session); then put the document before the conversation with a breakpoint, otherwise accept that RAG context is uncached.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-07',
      difficulty: 'hard',
      question: 'What is the main flaw in this semantic cache lookup?',
      code: {
        language: 'typescript',
        code: `const { rows } = await pg.query(
  'SELECT answer, 1 - (embedding <=> $1) AS sim FROM sem_cache ' +
  'ORDER BY embedding <=> $1 LIMIT 1', [vec]);
if (rows[0]?.sim > 0.95) return rows[0].answer;`,
      },
      options: [
        'The <=> operator returns similarity, not distance, so the maths is inverted',
        'There is no tenant, version or expiry filter, so answers leak across tenants and never go stale',
        'LIMIT 1 makes the query slower than LIMIT 10',
        'pgvector cannot order by a distance operator',
      ],
      correct: [1],
      explanation:
        'In pgvector <=> is cosine distance, so 1 − distance is similarity and the maths is right; ordering by it uses the vector index. The real problem is the missing WHERE clause: any tenant can receive any other tenant’s cached answer, prompt/model changes are ignored and entries never expire.',
      followUps: [
        {
          q: 'Does adding WHERE tenant = $2 affect HNSW index performance?',
          a: 'Filtered ANN can lose recall or fall back to scans when the filter is very selective; use partial indexes or partitions per large tenant, or pgvector iterative scans, and test recall at your tenant distribution.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-08',
      difficulty: 'expert',
      question: 'Select ALL changes that reduce cost WITHOUT changing what the model sees for a given request.',
      options: [
        'Enabling provider prompt caching for the static prefix',
        'Sending non-urgent requests through the Batch API',
        'Routing simple requests to a smaller model',
        'Reducing top_k from 10 to 4 retrieved chunks',
      ],
      correct: [0, 1],
      explanation:
        'Prompt caching reuses computation for identical tokens and batch processing only changes scheduling and price, so outputs are statistically unchanged. Routing changes the model and reducing top_k changes the context, both of which can alter quality and need evals.',
      followUps: [
        {
          q: 'Why do the zero-risk levers still need monitoring?',
          a: 'Their savings can silently disappear (cache hit rate drops after a prompt edit, batch jobs fail and fall back to real-time), so you monitor hit rate and batch completion rather than quality.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-09',
      difficulty: 'medium',
      question: 'A cascade sends every request to a small model and escalates to a large one when confidence < 0.8. Logs show 85% of requests escalate. What does this imply?',
      options: [
        'The cascade is saving about 85%',
        'The cascade likely costs MORE than always using the large model',
        'The threshold is too strict only if latency rose',
        'The small model should be removed for latency reasons only',
      ],
      correct: [1],
      explanation:
        'With 85% escalation you pay the small model on 100% of requests plus the large model on 85%, so total cost approaches or exceeds large-only, and latency rises for escalated requests. Recalibrate the threshold, use a better router, or skip the cascade for this feature.',
      followUps: [
        {
          q: 'What escalation rate makes a cascade worthwhile?',
          a: 'Roughly when small-cost + escalation-rate × large-cost is clearly below large-cost; with a 10× cheaper small model, escalation must stay well under ~90% and in practice under ~30–40% to justify the latency and complexity.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-10',
      difficulty: 'hard',
      question: 'Select ALL true statements about OpenAI prompt caching.',
      options: [
        'It applies automatically to sufficiently long prompts without code changes',
        'Cached token counts appear in the usage details of the response',
        'It guarantees a hit for identical prompts sent an hour apart',
        'A prompt_cache_key can help requests that share a long prefix land on the same cache',
      ],
      correct: [0, 1, 3],
      explanation:
        'OpenAI caches prefixes of long-enough prompts (1,024+ tokens) automatically, reports cached tokens in usage details, and accepts prompt_cache_key to improve routing. Hits are best-effort and entries are evicted after minutes of inactivity (longer only with extended retention), so an hour gap is not guaranteed to hit.',
      followUps: [
        {
          q: 'How do you verify caching is working in production?',
          a: 'Record cached_tokens / prompt_tokens per feature as a metric and alert on drops; a sudden fall usually traces back to a prompt or tool-ordering change.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-11',
      difficulty: 'expert',
      question: 'This cost model is used to choose between models. What is wrong with it?',
      code: {
        language: 'typescript',
        code: `function costPerCall(m: Model, promptTokens: number) {
  return (promptTokens * (m.priceIn + m.priceOut)) / 1e6;
}
// pick the cheapest model that passes evals
models.sort((a, b) => costPerCall(a, 2000) - costPerCall(b, 2000));`,
      },
      options: [
        'It should divide by 1e3 instead of 1e6',
        'It assumes output tokens equal input tokens and ignores caching and verbosity differences',
        'Sorting by cost is meaningless for LLMs',
        'Prices should be multiplied, not added',
      ],
      correct: [1],
      explanation:
        'Prices are per 1M tokens, so 1e6 is right. The bug is modelling output as equal to prompt size: real workloads often have 2,000 input and 200–500 output tokens, models differ in verbosity (and hidden reasoning tokens), and cached input is billed at a fraction. Use measured per-model token distributions from evals.',
      followUps: [
        {
          q: 'How do reasoning models complicate this?',
          a: 'They bill hidden reasoning tokens as output, which can be several times the visible answer; measure output tokens including reasoning per task, and control them with reasoning effort settings.',
        },
      ],
    },
    {
      id: 'cost-caching-mcq-12',
      difficulty: 'hard',
      question: 'After switching the embedding model behind your semantic cache, the hit rate jumps from 20% to 48% with the same 0.93 threshold. What should you conclude?',
      options: [
        'The new embedding model understands paraphrases much better, so savings doubled',
        'Similarity score distributions differ between models; the threshold must be re-tuned and old entries re-embedded or dropped',
        'The cache now has more entries, so a higher hit rate is expected',
        'Thresholds are model-independent; nothing needs to change',
      ],
      correct: [1],
      explanation:
        'Different embedding models produce different similarity distributions (some cluster everything around 0.8–0.95). A fixed threshold therefore means something different, and the jump probably includes many false hits. Old vectors from the previous model are not comparable at all. Re-tune on labelled pairs and rebuild the cache.',
      followUps: [
        {
          q: 'How would you rebuild the cache without a cold-start cost spike?',
          a: 'Re-embed stored queries with the new model in a background job (cheap: queries are short) and swap the index once complete, keeping answers and metadata.',
        },
      ],
    },
  ],
};

export default topic;
