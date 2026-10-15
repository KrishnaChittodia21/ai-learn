import type { Topic } from '../../types';

const topic: Topic = {
  id: 'ai-reference-architectures',
  phase: 'architecture',
  order: 3,
  title: 'AI Reference Architectures',
  subtitle: 'Blueprints with components, data flow, scaling numbers and failure modes: enterprise RAG, copilots, multi-tenant agent platforms, control vs data plane',
  estimatedMinutes: 52,
  sources: [
    'GitHub blog (2023) — How GitHub Copilot is getting better at understanding your code (neighboring tabs, fill-in-the-middle): https://github.blog/ai-and-ml/github-copilot/how-github-copilot-is-getting-better-at-understanding-your-code/',
    'Microsoft Azure Architecture Center — Baseline OpenAI end-to-end chat reference architecture: https://learn.microsoft.com/azure/architecture/ai-ml/architecture/baseline-openai-e2e-chat',
    'AWS — Multi-tenant generative AI / SaaS tenant isolation guidance (AWS SaaS Lens): https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/',
    'Anthropic (2024) — Introducing Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval',
    'Model Context Protocol specification: https://modelcontextprotocol.io/specification',
    'Kubernetes docs — Control plane components; Envoy/Istio data plane vs control plane concepts: https://kubernetes.io/docs/concepts/overview/components/',
    'vLLM docs — continuous batching and PagedAttention: https://docs.vllm.ai/',
    'OWASP Top 10 for LLM Applications (2025): https://genai.owasp.org/llm-top-10/',
  ],
  tags: ['architecture', 'reference architecture', 'enterprise rag', 'copilot', 'multi-tenant', 'control plane', 'data plane', 'agents', 'scaling'],
  cheatSheet: [
    'Enterprise RAG = connectors → parse/chunk → embed → hybrid index with ACL metadata → query service (rewrite, hybrid retrieve, rerank, ACL pre-filter) → generate with citations → evals/feedback.',
    'Enterprise RAG failure modes: stale ACLs, stale content, parsing garbage (tables/PDFs), wrong version cited, retrieval misses; fix with incremental sync, structure-aware parsing, metadata filters and evals.',
    'Copilot = in-app context gathering (cursor, selection, open files, app state) + fast suggestion path (small model, < 500 ms) + slow chat/agent path (frontier model, tools) + telemetry on acceptance.',
    'Copilot north-star metric: suggestion acceptance/retention rate; latency budgets dominate design (debounce, cancel stale requests, cache, speculative prefetch).',
    'Multi-tenant agent platform: tenant-scoped everything — identity, data partitions, vector namespaces, tool credentials, quotas, sandboxes, logs and cache keys.',
    'Isolation tiers: silo (dedicated stack), bridge (shared compute, separate data stores) and pool (shared everything with tenant_id filters) — choose per tier and compliance need.',
    'Noisy neighbours: per-tenant token buckets, weighted fair queuing and concurrency caps at the gateway.',
    'Control plane = config, policy, model registry, prompt versions, keys, tenants, rollouts (low QPS, strong consistency). Data plane = serving requests (high QPS, low latency, stateless).',
    'Data plane must keep serving with last-known-good config when the control plane is down; config pushes are versioned, canaried and roll-backable.',
    'Every reference architecture needs: numbers (QPS, tokens, storage, GPUs), named failure modes with mitigations, and an evaluation loop.',
  ],
  sections: [
    {
      heading: 'Enterprise RAG Platform — one governed retrieval platform for every team',
      body: `An enterprise RAG platform is a **company library with a librarian who checks your badge**: it collects documents from every system, keeps them current, and only hands you what you are allowed to read — with page references.

**Components**
1. **Connectors**: SharePoint, Confluence, Drive, Jira, S3, databases; full sync plus incremental (webhooks/change feeds), pulling **ACLs** with content.
2. **Ingestion pipeline** (queue-driven): parse (layout-aware PDF/table extraction, OCR), clean, chunk (structure-aware, 300–800 tokens), contextualise, embed; dead-letter on failures.
3. **Index**: hybrid — vector (HNSW) + BM25 — with metadata (source, version, ACL groups, sensitivity, timestamps); per-tenant or per-domain namespaces.
4. **Query service**: rewrite → hybrid retrieve with **ACL pre-filter** → rerank (cross-encoder) → context assembly within a token budget.
5. **Generation** through the LLM gateway with citations; groundedness check before display.
6. **Feedback and evals**: thumbs, citation clicks, offline golden sets, retrieval recall@k dashboards.

**Scaling numbers** (typical mid-size enterprise): 10–50M chunks; at 1024-d float32 that is ~4 KB/vector → 40–200 GB raw (HNSW overhead adds ~1.5×); quantisation (int8/binary) cuts it 4–32×. Query p95 targets: retrieval < 300 ms, first token < 1.5 s.

**Failure modes → mitigations**
| Failure | Mitigation |
|---|---|
| Revoked access still retrievable | ACL sync every few minutes + pre-filter + output citation check |
| Outdated policy cited | version metadata, "latest only" filter, freshness boosts |
| Tables garbled | layout-aware parsers, table-to-markdown |
| Index rebuild downtime | blue/green index aliases |

Use the platform pattern once 3+ teams build RAG; it removes duplicated pipelines and centralises ACL correctness.`,
      example: `**Insurer, 6M documents → 28M chunks.**
- Ingestion: 1.2M changed pages/month via change feeds; parsing cluster processes ~40 pages/s; embedding 28M × 500 tokens = 14B tokens once (~$280 at an illustrative $0.02/1M), then ~$12/month incremental.
- Index: 28M × 1024-d int8 ≈ 29 GB + HNSW graph ≈ 45 GB, 3 replicas.
- Query: "Is flood damage covered under policy HX-2024 for Texas?" → rewrite adds filters {product: HX, state: TX, status: current} → 50 hybrid candidates (85 ms) → reranker top 6 (120 ms) → answer with 2 citations, TTFT 1.1 s.
- Eval: recall@6 rose from 0.71 to 0.88 after adding the "status: current" version filter that removed superseded policies.`,
      diagram: `SOURCES          INGESTION (async, queue-driven)        INDEX
+----------+    +------+   +-------+   +-------+     +-------------------+
|SharePoint|--->|parse |-->|chunk +|-->|embed  |---->| vector (HNSW)     |
|Confluence|    |OCR   |   |context|   |batch  |     | + BM25            |
|Drive/Jira|    +--+---+   +-------+   +-------+     | meta: acl, ver,   |
+----+-----+       | DLQ                             | tenant, sensitivity|
     | ACLs + change feeds ----------------------->  +---------+---------+
                                                               |
QUERY PATH                                                     |
user -> [authn] -> [rewrite] -> [hybrid search + ACL pre-filter]
                                      |
                              [rerank top 50 -> 6]
                                      v
                  [prompt + citations] -> LLM GATEWAY -> [grounded?]
                                                              |
                                  answer + sources <----------+
                  feedback/evals -> recall@k, groundedness dashboards`,
      code: [
        {
          language: 'typescript',
          title: 'Query service: ACL pre-filtered hybrid retrieval with Qdrant + rerank',
          code: `import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const openai = new OpenAI({ baseURL: process.env.LLM_GATEWAY_URL });   // via gateway
interface User { id: string; tenant: string; groups: string[] }
declare function rerank(q: string, docs: { id: string; text: string }[]): Promise<{ id: string; text: string; score: number }[]>;

export async function retrieve(q: string, user: User, k = 6) {
  const [emb] = (await openai.embeddings.create({ model: 'text-embedding-3-small', input: q })).data;
  const hits = await qdrant.search('chunks_' + user.tenant, {      // per-tenant collection
    vector: emb.embedding,
    limit: 50,
    with_payload: true,
    filter: {
      must: [
        { key: 'acl_groups', match: { any: user.groups } },       // ACL PRE-filter inside ANN
        { key: 'status', match: { value: 'current' } },           // never cite superseded versions
      ],
    },
  });
  const docs = hits.map((h) => ({ id: String(h.id), text: String(h.payload?.text ?? '') }));
  const ranked = await rerank(q, docs);                           // cross-encoder top-k
  return ranked.slice(0, k);
}`,
        },
      ],
      prosCons: {
        pros: [
          'One pipeline and index per domain instead of a copy per team; ACL logic centralised and tested once.',
          'Consistent quality levers (hybrid search, reranking, contextual chunks) available to every product.',
          'Central evals and feedback reveal retrieval regressions across all consumers.',
        ],
        cons: [
          { con: 'ACL drift: permissions change at the source faster than the index updates.', fix: 'Subscribe to permission-change events, re-sync ACL metadata within minutes, and verify cited doc ids against the source ACL for high-sensitivity labels.' },
          { con: 'Shared platform becomes a bottleneck for team-specific needs (custom chunking, domain filters).', fix: 'Expose pluggable pipeline stages and per-collection configs, with the platform owning connectors, ACLs and SLAs.' },
          { con: 'Re-embedding 28M chunks for a new embedding model is slow and risky.', fix: 'Blue/green indexes behind an alias, dual-write during migration, compare recall on a golden set and then switch the alias.' },
        ],
      },
      keyPoints: [
        'Connectors → parse/chunk/embed → hybrid index with ACL/version metadata → query service → gateway.',
        'Enforce ACLs as pre-filters inside the search, never after generation.',
        'Size the index: chunks × dims × bytes, plus HNSW overhead and replicas.',
        'Track recall@k and groundedness continuously; version every index.',
      ],
      exercise: {
        prompt: `Write \`indexSizeGB({ chunks, dims, bytesPerDim, hnswOverhead, replicas })\` returning total storage in GB (1 GB = 1e9 bytes), and use it to compare float32 vs int8 for 28M chunks × 1024 dims, HNSW overhead 1.5, 3 replicas. Acceptance: float32 ≈ 516 GB, int8 ≈ 129 GB.`,
        starter: {
          language: 'typescript',
          code: `interface IndexSpec { chunks: number; dims: number; bytesPerDim: number; hnswOverhead: number; replicas: number }

export function indexSizeGB(s: IndexSpec): number {
  // TODO
  return 0;
}`,
        },
        hints: [
          'Raw bytes = chunks × dims × bytesPerDim.',
          'Multiply by the HNSW overhead factor and by replicas.',
          'Round to one decimal place for display.',
        ],
        solution: {
          language: 'typescript',
          code: `interface IndexSpec { chunks: number; dims: number; bytesPerDim: number; hnswOverhead: number; replicas: number }

export function indexSizeGB(s: IndexSpec): number {
  const raw = s.chunks * s.dims * s.bytesPerDim;           // vector payload
  const total = raw * s.hnswOverhead * s.replicas;         // graph links + HA copies
  return Math.round((total / 1e9) * 10) / 10;
}

const base = { chunks: 28e6, dims: 1024, hnswOverhead: 1.5, replicas: 3 };
console.log(indexSizeGB({ ...base, bytesPerDim: 4 }));     // 516.1 (float32)
console.log(indexSizeGB({ ...base, bytesPerDim: 1 }));     // 129   (int8 scalar quantisation)`,
        },
        explanation: 'Index sizing drives the hardware bill and whether the index fits in RAM. Quantisation is the biggest lever (4× for int8, up to 32× for binary with rescoring), which is why large enterprise RAG platforms almost always quantise.',
      },
      quickCheck: {
        question: 'An employee loses access to a project folder at 10:00 but still gets answers quoting it at 15:00. Which component failed?',
        options: ['The LLM ignored its system prompt', 'The connector/ACL sync did not propagate the permission change to index metadata', 'The reranker scored the document too highly', 'The embedding model is outdated'],
        correct: 1,
        explanation: 'Retrieval enforces whatever ACL metadata the index holds; if the sync is slow or broken, revoked access persists. The model, reranker and embeddings only see documents that passed the stale filter.',
      },
      source: 'Microsoft — Baseline OpenAI end-to-end chat reference architecture; Anthropic — Contextual Retrieval (2024)',
    },
    {
      heading: 'AI Copilot Architecture — in-app context, a fast path and a slow path',
      body: `A copilot is a **co-driver who sees your dashboard**: it is embedded where you work, reads what is on your screen, suggests the next move instantly, and takes over bigger tasks when asked — but you keep the wheel.

**Two paths with very different budgets**

| Path | Example | Model | Budget |
|---|---|---|---|
| Fast (inline) | code completion, next-sentence, form autofill | small/medium, often fill-in-the-middle | p50 < 300 ms, p95 < 600 ms |
| Slow (chat/agent) | "refactor this module", "draft the QBR deck" | frontier + tools | seconds to minutes, streamed |

**Components**
1. **Client context engine**: cursor position, prefix/suffix, selection, open tabs, recent edits, app state (current record, user role). GitHub reported that adding matching snippets from **neighbouring open tabs** lifted acceptance ~5% and **fill-in-the-middle** prompts gave ~10% relative improvement.
2. **Context ranking and budget**: pick the most relevant snippets (similarity, recency, symbol graph) into a fixed token budget.
3. **Copilot service**: auth, request cancellation, caching, routing fast vs slow, via the LLM gateway.
4. **Tools/actions** (slow path): app APIs or MCP servers, executed with the **user's permissions** and confirmation for writes.
5. **Post-processing**: dedupe, syntax/schema checks, block secrets/licensed snippets, trim to the useful span.
6. **Telemetry**: shown → accepted → retained-after-30-s rates per model and context strategy; this drives A/B tests.

Latency tricks: debounce keystrokes (~75–150 ms), **cancel stale requests**, cache by prefix hash, stream, and speculatively prefetch the next suggestion.

Failure modes: suggestions that compile but are wrong (fix with tests and review UX), leaking data across tenants via shared caches (tenant-scoped keys), and actions taken without consent (explicit approval for side effects).`,
      example: `**CRM copilot for 30K sales reps.**
- Inline: rep types in an email body → client sends prefix (600 tokens) + account context (deal stage, last 3 notes, 400 tokens) → small model returns a 25-token continuation, p50 210 ms. 18 requests per email; debounce + cancellation drop it to 7 actual calls.
- Slow path: "Prepare me for tomorrow's call with Acme" → agent calls CRM API (opportunities), calendar, and the RAG platform (latest contract) → 1-page brief in 14 s, streamed.
- Metrics: inline acceptance 27%, retained-after-30-s 21%; switching context ranking to include "last edited note" raised acceptance to 31% in an A/B test over 2 weeks.`,
      diagram: `+---------------------------- HOST APP (IDE / CRM / Docs) -----------------+
|  editor / record view                                                   |
|  +-------------------------+    keystrokes (debounced, cancellable)     |
|  | CONTEXT ENGINE          |------------------------------+             |
|  | prefix/suffix, open tabs|                              |             |
|  | selection, app state    |   chat / "do it" commands --+|             |
|  +-------------------------+                             ||             |
+----------------------------------------------------------||-------------+
                                                           vv
                         +---------------------------------------------+
                         | COPILOT SERVICE: auth, route, cache, cancel |
                         +----------+--------------------+-------------+
                     FAST (<300ms)  |                    | SLOW (s-min)
                   +----------------v--+        +--------v--------------+
                   | small FIM model   |        | agent: frontier model |
                   | (self-host/vLLM)  |        | + tools/MCP (user     |
                   +----------------+--+        | perms, confirm writes)|
                                    |           +--------+--------------+
                    post-process: dedupe, secrets, syntax, trim
                                    v
               telemetry: shown -> accepted -> retained -> A/B tests`,
      code: [
        {
          language: 'typescript',
          title: 'Client-side inline suggestion loop: debounce, cancel stale requests, prefix cache',
          code: `type Ctx = { prefix: string; suffix: string; neighbors: string[] };

const cache = new Map<string, string>();
let inflight: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const key = (c: Ctx) => c.prefix.slice(-400) + '|' + c.suffix.slice(0, 100);

export function onKeystroke(ctx: Ctx, show: (s: string) => void) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {                    // debounce ~100 ms
    const k = key(ctx);
    const hit = cache.get(k);
    if (hit) return show(hit);
    inflight?.abort();                                // cancel the stale request
    inflight = new AbortController();
    try {
      const res = await fetch('/copilot/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: ctx.prefix.slice(-6000), suffix: ctx.suffix.slice(0, 1500),
          neighbors: ctx.neighbors.slice(0, 3) }),   // ranked snippets from open tabs
        signal: inflight.signal,
      });
      const { completion } = (await res.json()) as { completion: string };
      cache.set(k, completion);
      show(completion);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.warn('suggest failed', e); // aborts are expected
    }
  }, 100);
}`,
        },
      ],
      prosCons: {
        pros: [
          'Meets users where they work, with rich implicit context they do not have to type.',
          'Fast/slow split matches model cost and latency to the task.',
          'Acceptance telemetry gives a clear, measurable quality signal for A/B tests.',
        ],
        cons: [
          { con: 'Tight latency budgets make large models impractical for inline suggestions.', fix: 'Use small FIM-trained models self-hosted near users, prefix caching, speculative decoding, and cancel stale requests aggressively.' },
          { con: 'Context gathering can leak sensitive data (secrets in open files, other customers’ records).', fix: 'Client-side secret scrubbing, content exclusion rules per repo or object, and tenant-scoped caches and logs.' },
          { con: 'Agentic actions can make unwanted changes in the host app.', fix: 'Run tools with the user’s own permissions, show diffs or previews, and require explicit confirmation for writes with an undo path.' },
        ],
      },
      keyPoints: [
        'Two paths: fast inline (< 300 ms, small model) and slow chat/agent (frontier + tools).',
        'Context engine is the moat: prefix/suffix, open tabs, app state, ranked into a budget.',
        'Debounce, cancel, cache and stream to survive keystroke-level traffic.',
        'Measure acceptance and retention, not just thumbs-up.',
      ],
      exercise: {
        prompt: `Write \`packContext(snippets, budgetTokens)\` for the context engine: each snippet has \`{ text, score }\`; estimate tokens as \`Math.ceil(text.length / 4)\`; greedily add the highest-score snippets that still fit, and return them in original order. Acceptance: never exceeds the budget; a high-score snippet that does not fit is skipped while smaller ones can still be added.`,
        starter: {
          language: 'typescript',
          code: `interface Snip { text: string; score: number }

export function packContext(snippets: Snip[], budgetTokens: number): Snip[] {
  // TODO
  return [];
}`,
        },
        hints: [
          'Sort indexes by score descending, but remember the original position.',
          'Skip (do not stop) when a snippet does not fit.',
          'Sort the chosen indexes ascending before returning.',
        ],
        solution: {
          language: 'typescript',
          code: `interface Snip { text: string; score: number }
const tokens = (s: string) => Math.ceil(s.length / 4);   // ~4 chars per token heuristic

export function packContext(snippets: Snip[], budgetTokens: number): Snip[] {
  const order = snippets.map((s, i) => i).sort((a, b) => snippets[b].score - snippets[a].score);
  const chosen: number[] = [];
  let used = 0;
  for (const i of order) {
    const t = tokens(snippets[i].text);
    if (used + t > budgetTokens) continue;               // skip, a smaller one may still fit
    chosen.push(i);
    used += t;
  }
  return chosen.sort((a, b) => a - b).map((i) => snippets[i]);
}`,
        },
        explanation: 'Greedy-by-score knapsack packing is the standard pragmatic approach for prompt budgets; restoring the original order keeps code or document structure coherent for the model.',
      },
      quickCheck: {
        question: 'Inline suggestion p95 latency is 1.4 s and acceptance is falling. Traces show many requests complete after the user has typed further. What is the highest-impact fix?',
        options: ['Switch the inline path to the frontier model', 'Debounce keystrokes and cancel in-flight requests when new input arrives, and use a smaller FIM model', 'Increase the context to 32K tokens', 'Disable streaming'],
        correct: 1,
        explanation: 'Stale requests waste capacity and arrive too late to be useful; debounce and cancellation cut load, and a small FIM model fits the budget. A frontier model or larger context makes latency worse, and streaming is not the bottleneck for short completions.',
      },
      source: 'GitHub blog (2023) — How GitHub Copilot is getting better at understanding your code',
    },
    {
      heading: 'Multi-Tenant Agent Platform — many customers, shared infrastructure, zero cross-talk',
      body: `A multi-tenant agent platform is an **apartment building**: tenants share the foundations, lifts and plumbing (compute, models, gateway) but each apartment has its own lock, mailbox and meter (data, credentials, quotas, logs).

**What must be tenant-scoped (the isolation checklist)**
- **Identity**: tenant id in every token; agents act on behalf of a user within a tenant.
- **Data**: separate vector collections/namespaces or row-level security with mandatory tenant filters; per-tenant encryption keys (BYOK) for regulated customers.
- **Tools and credentials**: per-tenant OAuth tokens for Slack/Salesforce/MCP servers, stored in a vault, never in prompts.
- **Execution**: code-running agents in **sandboxes** (gVisor/Firecracker microVMs) with no cross-tenant filesystem or network.
- **Memory and caches**: cache keys and long-term memory prefixed by tenant (a shared semantic cache is a classic leak).
- **Quotas and fairness**: token buckets per tenant and plan; weighted fair queuing so one tenant's batch job cannot starve others.
- **Observability and billing**: per-tenant traces, token metering, cost reports, audit logs and data deletion.

**Isolation tiers**

| Tier | Model | Use |
|---|---|---|
| Pool | shared everything + tenant_id filters | SMB, low cost |
| Bridge | shared compute, separate data stores/keys | mid-market |
| Silo | dedicated stack/VPC | regulated enterprise |

**Scaling numbers**: 2,000 tenants × average 3 concurrent agent runs = 6,000 runs; with 8 LLM calls per run, every 1 s of p50 model latency matters — the gateway enforces per-tenant concurrency.

Failure modes: cross-tenant retrieval via a missing filter, prompt injection through one tenant's data steering tool use, noisy neighbours, and runaway agent loops burning a tenant's budget.`,
      example: `**Agent platform with 1,800 tenants.**
- Tenant "Globex" (enterprise, silo tier) gets its own Postgres schema, KMS key and dedicated vLLM pool; 1,750 SMB tenants share pooled infrastructure with Postgres row-level security (RLS) on tenant_id.
- A pooled tenant launches a 40,000-document bulk agent job at 09:00. Per-tenant limit = 200K TPM and 20 concurrent runs; weighted fair queuing keeps p95 latency for other tenants at 3.1 s (vs 11 s in the pre-fairness incident).
- Pen-test: an agent prompt says "search all customers' tickets". The retrieval tool derives tenant id from the signed session, not from the prompt, so results stay within the tenant.
- Runaway loop guard: max 25 tool calls per run, cost cap $2 → a looping agent stopped at $1.98.`,
      diagram: `   tenant A users    tenant B users     tenant C (silo, enterprise)
        |                 |                       |
+-------v-----------------v--------+     +--------v-----------------+
| API + AUTH: tenant_id in JWT     |     | dedicated stack / VPC    |
+---------------+------------------+     | own DB, KMS key, GPUs    |
                |                        +--------------------------+
+---------------v---------------------------------------------------+
| AGENT RUNTIME (pooled)                                            |
|  run queue: weighted fair per tenant | limits: steps, $, time     |
|  sandboxes (microVM per run) | tool creds from vault[tenant]      |
+-------+-----------------+-----------------+-----------------+-----+
        |                 |                 |                 |
+-------v------+ +--------v-------+ +-------v-------+ +-------v------+
| LLM GATEWAY  | | DATA: RLS by   | | VECTOR: ns per| | OBS/BILLING  |
| quota/tenant | | tenant_id      | | tenant        | | meter/tenant |
+--------------+ +----------------+ +---------------+ +--------------+`,
      code: [
        {
          language: 'typescript',
          title: 'Tenant context enforced server-side: RLS session variable + scoped tools',
          code: `import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
interface Session { tenantId: string; userId: string; plan: 'free' | 'pro' | 'enterprise' }

// Postgres RLS policy (run once):
//   ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY tenant_iso ON tickets USING (tenant_id = current_setting('app.tenant_id'));
export async function withTenant<T>(s: Session, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [s.tenantId]); // tx-local
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Tool exposed to the agent: tenant comes from the SESSION, never from model arguments
export function makeSearchTicketsTool(s: Session) {
  return {
    name: 'search_tickets',
    description: 'Search support tickets for the current customer account',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async (args: { query: string }) =>
      withTenant(s, (c) => c.query('SELECT id, title FROM tickets WHERE title ILIKE $1 LIMIT 20', ['%' + args.query + '%'])),
  };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Shared models, gateway and runtime give large economies of scale.',
          'Tiered isolation lets you sell silo deployments to regulated customers on the same codebase.',
          'Central metering enables usage-based billing and per-tenant cost visibility.',
        ],
        cons: [
          { con: 'A single missing tenant filter leaks data across customers.', fix: 'Enforce isolation in the data layer (RLS, per-tenant namespaces) rather than in application queries, plus automated cross-tenant leak tests in CI.' },
          { con: 'Noisy neighbours degrade latency for everyone.', fix: 'Per-tenant token buckets and concurrency caps at the gateway, weighted fair queuing in the run queue, and separate pools for batch jobs.' },
          { con: 'Agents executing code or tools can escape their tenant boundary.', fix: 'Per-run microVM sandboxes with egress allow-lists, per-tenant vault credentials and tool arguments that never carry tenant ids.' },
          { con: 'Shared caches and memory leak answers between tenants.', fix: 'Prefix every cache and memory key with tenant id (and ACL scope), and disable cross-tenant semantic caching entirely.' },
        ],
      },
      keyPoints: [
        'Scope everything by tenant: identity, data, tools, sandboxes, caches, quotas, logs.',
        'Derive tenant id from the authenticated session, never from model output.',
        'Pick pool, bridge or silo isolation per customer tier.',
        'Fairness and runaway-loop limits protect both platform and tenant budgets.',
      ],
      exercise: {
        prompt: `Implement a **weighted fair scheduler** for agent runs: \`enqueue(tenant, run)\` and \`next()\`. Each tenant has a weight (enterprise 3, pro 2, free 1). \`next()\` picks, among tenants with queued runs, the one with the lowest \`served / weight\`, increments its served count and returns its oldest run. Acceptance: with A(weight 2) and B(weight 1) both backlogged, 6 calls serve A 4 times and B 2 times.`,
        starter: {
          language: 'typescript',
          code: `export function makeScheduler(weights: Record<string, number>) {
  const queues = new Map<string, string[]>();
  const served = new Map<string, number>();
  return {
    enqueue(tenant: string, run: string) { /* TODO */ },
    next(): string | null { /* TODO */ return null; },
  };
}`,
        },
        hints: [
          'Default unknown tenants to weight 1.',
          'Only consider tenants whose queue is non-empty.',
          'Break ties by tenant name for determinism.',
        ],
        solution: {
          language: 'typescript',
          code: `export function makeScheduler(weights: Record<string, number>) {
  const queues = new Map<string, string[]>();
  const served = new Map<string, number>();
  return {
    enqueue(tenant: string, run: string) {
      if (!queues.has(tenant)) queues.set(tenant, []);
      queues.get(tenant)!.push(run);
    },
    next(): string | null {
      let best: string | null = null;
      let bestScore = Infinity;
      for (const [t, q] of [...queues.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        if (q.length === 0) continue;
        const score = (served.get(t) ?? 0) / (weights[t] ?? 1);   // normalised service so far
        if (score < bestScore) { best = t; bestScore = score; }
      }
      if (!best) return null;
      served.set(best, (served.get(best) ?? 0) + 1);
      return queues.get(best)!.shift()!;
    },
  };
}`,
        },
        explanation: 'Normalising service by weight gives each tenant a share proportional to its plan while guaranteeing even free tenants make progress, which is the core of noisy-neighbour protection in a shared agent runtime.',
      },
      quickCheck: {
        question: 'An agent tool accepts a tenant_id argument that the model fills from the conversation. What is the risk?',
        options: ['Higher token usage', 'A prompt injection can make the model pass another tenant’s id and read their data', 'The tool becomes slower', 'There is no risk if the system prompt says to use the right tenant'],
        correct: 1,
        explanation: 'Model-controlled tenant ids turn every prompt injection into a cross-tenant breach. The tenant must come from the authenticated session server-side. Token cost and speed are minor, and system-prompt instructions are not a security boundary.',
      },
      source: 'AWS SaaS Lens — tenant isolation (silo, bridge, pool); OWASP Top 10 for LLM Applications (2025)',
    },
    {
      heading: 'Control Plane vs Data Plane for AI — decide slowly, serve fast',
      body: `Air-traffic control decides routes, slots and rules; the aircraft actually fly the passengers. If the control tower has a brief outage, planes already in the air keep flying their filed plans. AI platforms split the same way.

| | Control plane | Data plane |
|---|---|---|
| Job | decide *how* requests should be served | serve each request |
| Contents | model registry, prompt versions, routing rules, guardrail policies, tenants, keys, quotas, eval gates, rollout state | gateway, orchestrators, retrieval, model servers (vLLM), guardrail sidecars, caches |
| Traffic | low QPS, human/CI-driven | high QPS, latency-critical |
| Priorities | correctness, auditability, strong consistency | availability, latency, horizontal scale |
| Failure impact | cannot *change* config | users affected immediately |

**Core rules**
1. **Data plane never calls the control plane on the hot path.** It caches a versioned config snapshot (pushed via watch/stream or polled) and serves from memory.
2. **Static stability**: if the control plane is down, the data plane keeps serving with the last-known-good snapshot.
3. **Config is code**: every change (new prompt, route weight, policy) is versioned, reviewed, evaluated (eval gates), canaried to a slice of the data plane and auto-rolled back on SLO regression.
4. **Telemetry flows back**: the data plane emits metrics, traces and eval samples that the control plane uses for rollout decisions and drift alerts.

This mirrors Kubernetes (API server/controllers vs kubelets) and service meshes (Istio control plane vs Envoy proxies). For AI the "config" is unusually behaviour-changing: a one-line prompt edit can change outputs for millions of users, so **eval gates and canaries in the control plane** matter more than in classic infra.

Use the split once you run multiple models, prompts or tenants in production — it is what lets you ship changes daily without outages.`,
      example: `**Platform serving 400 RPS across 12 features.**
- Control plane change: prompt "support-answer" v14 → v15. CI eval gate: groundedness 0.91 → 0.93, answer relevance flat → pass.
- Rollout: snapshot #8812 pushed to 5% of gateway pods; data plane reports per-version metrics. After 30 min, thumbs-down rate is 4.1% (v15) vs 4.3% (v14), p95 latency unchanged → ramp to 50% → 100%.
- Incident: control-plane database is down for 25 min during a migration. Data plane keeps serving snapshot #8812 from memory, 0 failed user requests; only config changes are blocked.
- Contrast: a previous design fetched the prompt from the config DB per request — the same outage caused 100% errors.`,
      diagram: `                 CONTROL PLANE (low QPS, consistent, audited)
+----------------------------------------------------------------------+
| model registry | prompt versions | routes | policies | tenants/keys  |
| eval gates (CI) -> rollout manager (canary %, auto-rollback)         |
+------------------------------+---------------------------------------+
        versioned snapshot     |  push/watch          ^ metrics, traces,
        (#8812, signed)        v                      | eval samples
+------------------------------+----------------------+----------------+
|                  DATA PLANE (high QPS, stateless, cached config)      |
|  [gateway pods] -> [orchestrators] -> [retrieval] -> [vLLM / APIs]   |
|  [guardrail sidecars]  [caches]   each pod: config in memory         |
+----------------------------------------------------------------------+
   control plane down  => data plane keeps serving last-known-good
   data plane pod down => LB routes around it; control plane unaffected`,
      code: [
        {
          language: 'typescript',
          title: 'Data-plane config agent: poll versioned snapshots, keep last-known-good, never block requests',
          code: `import { z } from 'zod';

const Snapshot = z.object({
  version: z.number().int(),
  routes: z.record(z.string(), z.object({ model: z.string(), weight: z.number() }).array()),
  prompts: z.record(z.string(), z.string()),
});
type Snapshot = z.infer<typeof Snapshot>;

let current: Snapshot | null = null;               // in-memory, read on every request

async function refresh(url: string) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (!r.ok) throw new Error('status ' + r.status);
    const next = Snapshot.parse(await r.json());    // validate before swapping
    if (!current || next.version > current.version) {
      current = next;                               // atomic reference swap
      console.log('config applied', next.version);
    }
  } catch (e) {
    // control plane unavailable or bad snapshot: keep last-known-good (static stability)
    console.warn('config refresh failed, serving version', current?.version, String(e));
  }
}

export function startConfigAgent(url: string, everyMs = 10_000) {
  void refresh(url);
  setInterval(() => void refresh(url), everyMs);
}

export function getConfig(): Snapshot {
  if (!current) throw new Error('no config yet: fail readiness probe, do not take traffic');
  return current;                                   // hot path: memory read only
}`,
        },
      ],
      prosCons: {
        pros: [
          'Data plane stays available during control-plane outages (static stability).',
          'Behaviour changes (prompts, routes, policies) ship safely with eval gates, canaries and rollback.',
          'Each plane scales and is secured according to its own needs.',
        ],
        cons: [
          { con: 'Config propagation delay: pods run different versions for seconds to minutes.', fix: 'Stamp config version on every response and trace, make changes backward compatible, and use push/watch for faster convergence.' },
          { con: 'A bad snapshot pushed everywhere causes a global incident.', fix: 'Schema-validate snapshots, require eval gates, roll out progressively by percentage and region, and auto-rollback on SLO regression.' },
          { con: 'New pods cannot start if the control plane is down at boot.', fix: 'Persist the last snapshot to a local volume or object storage and bootstrap from it, failing readiness only if no snapshot exists.' },
        ],
      },
      keyPoints: [
        'Control plane decides (registry, prompts, routes, policy); data plane serves.',
        'No control-plane calls on the request hot path; config is cached in memory.',
        'Last-known-good config keeps serving through control-plane outages.',
        'AI config changes behaviour, so gate them with evals and canaries.',
      ],
      exercise: {
        prompt: `Implement \`pickRoute(routes, rand)\` for the data plane: given weighted targets like \`[{ model: 'v14', weight: 95 }, { model: 'v15', weight: 5 }]\` and a random number in [0, 1), return the model. Then write \`shouldRollback(base, canary)\` that returns true if the canary's error rate exceeds base by more than 1 percentage point or its p95 latency is more than 20% higher. Acceptance: rand 0.96 → 'v15'; (2% vs 3.5% errors) → rollback.`,
        starter: {
          language: 'typescript',
          code: `type Target = { model: string; weight: number };
type Stats = { errorRate: number; p95Ms: number };

export function pickRoute(routes: Target[], rand: number): string {
  // TODO
  return routes[0].model;
}

export function shouldRollback(base: Stats, canary: Stats): boolean {
  // TODO
  return false;
}`,
        },
        hints: [
          'Normalise weights by their sum and walk a cumulative total.',
          'Error rates are fractions: 1 percentage point = 0.01.',
          'Guard the last target against floating-point rounding.',
        ],
        solution: {
          language: 'typescript',
          code: `type Target = { model: string; weight: number };
type Stats = { errorRate: number; p95Ms: number };

export function pickRoute(routes: Target[], rand: number): string {
  const total = routes.reduce((s, r) => s + r.weight, 0);
  let acc = 0;
  for (const r of routes) {
    acc += r.weight / total;
    if (rand < acc) return r.model;
  }
  return routes[routes.length - 1].model;          // floating-point safety
}

export function shouldRollback(base: Stats, canary: Stats): boolean {
  const errorRegression = canary.errorRate - base.errorRate > 0.01;
  const latencyRegression = canary.p95Ms > base.p95Ms * 1.2;
  return errorRegression || latencyRegression;
}

// pickRoute([{model:'v14',weight:95},{model:'v15',weight:5}], 0.96) -> 'v15'
// shouldRollback({errorRate:0.02,p95Ms:900},{errorRate:0.035,p95Ms:950}) -> true`,
        },
        explanation: 'Weighted routing in the data plane plus automated rollback criteria in the control plane is the minimal canary loop; in production you would also compare quality signals (eval scores, thumbs-down rate) and require statistical significance.',
      },
      quickCheck: {
        question: 'Your gateway fetches the current prompt template from the config database on every request. What architectural principle does this violate, and what is the consequence?',
        options: ['Least privilege; prompts leak', 'Control/data plane separation; a config DB outage takes down all serving traffic', 'Idempotency; duplicate prompts are sent', 'Data locality; embeddings become stale'],
        correct: 1,
        explanation: 'The data plane depends synchronously on the control plane, so its availability is capped by the config DB. Caching versioned snapshots in memory restores static stability. The other options describe unrelated concerns.',
      },
      source: 'Kubernetes docs — cluster components; Istio/Envoy control-plane vs data-plane architecture; AWS — static stability (Builders’ Library)',
    },
  ],
  codeChallenges: [
    {
      id: 'ai-reference-architectures-cc-1',
      title: 'Post-filtered RAG that leaks across ACLs and tenants',
      context: 'A shared RAG query service searches one global collection for top 8, then filters out chunks the user may not see. Users often get "no answer" and a security review found that cached answers are shared across tenants.',
      task: 'Move ACL and tenant enforcement into the search as a pre-filter, scope the cache key by tenant and ACL fingerprint, and handle the empty-result case honestly.',
      starter: {
        language: 'typescript',
        code: `const cache = new Map<string, string>();

export async function ask(q: string, user: { tenant: string; groups: string[] }) {
  if (cache.has(q)) return cache.get(q)!;
  const hits = await vectorSearch('all_chunks', await embed(q), 8);
  const allowed = hits.filter((h) => h.tenant === user.tenant && h.groups.some((g) => user.groups.includes(g)));
  const answer = await generate(q, allowed);
  cache.set(q, answer);
  return answer;
}
declare function embed(q: string): Promise<number[]>;
declare function vectorSearch(c: string, v: number[], k: number): Promise<{ text: string; tenant: string; groups: string[] }[]>;
declare function generate(q: string, ctx: { text: string }[]): Promise<string>;`,
      },
      hints: [
        'Pass tenant and group filters into the search call so the ANN index only returns allowed chunks.',
        'Build the cache key from tenant, a hash of sorted groups and the normalised question.',
        'If nothing is retrieved, return an explicit "no accessible sources" answer instead of calling the model.',
      ],
      solution: {
        language: 'typescript',
        code: `import { createHash } from 'node:crypto';

type Filter = { tenant: string; anyGroups: string[] };
declare function embed(q: string): Promise<number[]>;
declare function vectorSearch(c: string, v: number[], k: number, f: Filter): Promise<{ id: string; text: string }[]>;
declare function generate(q: string, ctx: { id: string; text: string }[]): Promise<string>;

const cache = new Map<string, { answer: string; at: number }>();
const TTL_MS = 10 * 60_000;

export async function ask(q: string, user: { tenant: string; groups: string[] }) {
  const norm = q.trim().toLowerCase();
  const aclFp = createHash('sha256').update([...user.groups].sort().join(',')).digest('hex').slice(0, 16);
  const key = user.tenant + ':' + aclFp + ':' + norm;           // tenant + ACL scoped cache
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.answer;

  // PRE-filter: the index only considers chunks this user may see
  const hits = await vectorSearch('chunks_' + user.tenant, await embed(norm), 8,
    { tenant: user.tenant, anyGroups: user.groups });
  if (hits.length === 0) return 'I could not find any documents you have access to that answer this.';

  const answer = await generate(q, hits);
  cache.set(key, { answer, at: Date.now() });
  return answer;
}`,
      },
      explanation: 'Pre-filtering keeps recall high (top 8 are all usable) and keeps unauthorised text out of the pipeline. Scoping cache keys by tenant and ACL fingerprint eliminates cross-tenant and cross-permission cache leaks, and the TTL bounds staleness after permission changes.',
      followUps: [
        { q: 'Why does post-filtering hurt recall, not just security?', a: 'If 6 of the top 8 are unauthorised, only 2 chunks remain and the answer is missing context; the relevant authorised chunks ranked 9–30 were never fetched. Pre-filtered ANN search returns the best 8 among allowed chunks.' },
        { q: 'How do you invalidate cached answers when a document changes?', a: 'Store the source chunk ids with each cache entry and maintain a reverse index from doc id to cache keys; on a document update or ACL change event, delete the affected keys, with a TTL as a safety net.' },
      ],
    },
    {
      id: 'ai-reference-architectures-cc-2',
      title: 'Data plane that depends on the control plane at request time',
      context: 'Each gateway request reads routing rules and the prompt template from the control-plane API. During a control-plane deploy, 100% of user requests failed for 8 minutes.',
      task: 'Introduce an in-memory, versioned config snapshot with background refresh, validation, last-known-good fallback, bootstrap from disk, and the config version stamped on every response.',
      starter: {
        language: 'typescript',
        code: `export async function handle(req: { feature: string; input: string }) {
  const cfg = await fetch('http://control-plane/config/' + req.feature).then((r) => r.json());
  const prompt = cfg.prompt.replace('{input}', req.input);
  return callModel(cfg.model, prompt);
}
declare function callModel(model: string, prompt: string): Promise<string>;`,
      },
      hints: [
        'Load all features in one snapshot with a version number.',
        'Refresh on an interval in the background; on failure keep the old snapshot.',
        'Write each good snapshot to disk and read it at startup.',
      ],
      solution: {
        language: 'typescript',
        code: `import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const Snap = z.object({ version: z.number(), features: z.record(z.string(), z.object({ model: z.string(), prompt: z.string() })) });
type Snap = z.infer<typeof Snap>;
const DISK = '/var/cache/ai-config.json';
let snap: Snap | null = null;

async function refresh() {
  try {
    const r = await fetch('http://control-plane/config/snapshot', { signal: AbortSignal.timeout(2000) });
    const next = Snap.parse(await r.json());
    if (!snap || next.version > snap.version) {
      snap = next;
      await writeFile(DISK, JSON.stringify(next));          // persist last-known-good
    }
  } catch { /* keep serving the current snapshot */ }
}

export async function boot() {
  try { snap = Snap.parse(JSON.parse(await readFile(DISK, 'utf8'))); } catch { /* first boot */ }
  await refresh();
  setInterval(() => void refresh(), 15_000);
  if (!snap) throw new Error('no config available: stay unready');
}

export async function handle(req: { feature: string; input: string }) {
  const f = snap?.features[req.feature];
  if (!f) throw Object.assign(new Error('unknown feature'), { status: 404 });
  const output = await callModel(f.model, f.prompt.split('{input}').join(req.input));
  return { output, configVersion: snap!.version };          // traceable behaviour
}
declare function callModel(model: string, prompt: string): Promise<string>;`,
      },
      explanation: 'The hot path now reads memory only, so control-plane outages block changes but not traffic. Validation prevents a malformed snapshot from replacing a good one, disk bootstrap lets new pods start during an outage, and the version stamp makes mixed-version rollouts debuggable.',
      followUps: [
        { q: 'How would you push config faster than a 15 s poll?', a: 'Add a watch or stream channel (SSE, gRPC stream or a pub/sub topic) that notifies pods of a new version so they fetch immediately, keeping the poll as a fallback for missed notifications.' },
        { q: 'How do you canary a snapshot to 5% of pods?', a: 'The control plane assigns a target version per pod group or uses a hash of pod id; the rollout manager compares metrics by configVersion and promotes or reverts automatically.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'ai-reference-architectures-iq-1',
      difficulty: 'hard',
      question: 'Five business units each built their own RAG chatbot with separate pipelines and vector stores. As platform architect, how do you consolidate them into an enterprise RAG platform without breaking anyone?',
      whatInterviewerLooksFor: [
        'Clear platform boundary (what is shared vs team-owned)',
        'ACL and tenancy model',
        'Migration plan with eval parity checks',
        'SLOs and ownership',
      ],
      modelAnswer: `**Platform boundary**
- *Platform owns*: connectors and sync (with ACLs), parsing/OCR, chunking and embedding pipelines, hybrid index, query API (rewrite, retrieve, rerank, ACL pre-filter), gateway integration, observability and eval harness.
- *Teams own*: prompts, answer UX, domain-specific filters, golden datasets and acceptance thresholds.

**Data model**: one collection (or namespace) per domain with metadata {source, doc id, version, status, acl groups, sensitivity, BU}; ACLs synced from source systems within minutes.

**APIs**: \`search(query, userCtx, filters, k)\` and \`answer(...)\` with citations; pluggable chunking profiles per collection.

**Migration (strangler pattern)**
1. Inventory sources; dedupe overlapping corpora (often 30–50% overlap across BUs).
2. Build each BU's golden set (100–300 questions) and measure their current recall@k and answer quality.
3. Index into the platform in parallel; **shadow** BU traffic to the platform and compare results offline.
4. Cut over per BU once metrics are at parity or better; keep the old stack read-only for 30 days.

**SLOs**: retrieval p95 < 300 ms, freshness < 15 min for content and ACLs, 99.9% availability; per-BU dashboards.

**Wins to report**: storage and embedding cost savings, one ACL implementation audited once, faster new use cases (weeks → days).`,
      followUps: [
        { q: 'One BU needs a different embedding model for code. Does that break the platform?', a: 'No: collections carry their own embedding config, so the platform supports a small menu of approved models per collection type, and the query API embeds with the collection’s model. Governance limits the menu to keep operations manageable.' },
        { q: 'How do you prevent one BU\'s ingestion backlog from delaying others?', a: 'Use per-BU queues or priority lanes in the ingestion pipeline with fair scheduling, autoscale workers per lane, and give each BU freshness SLO alerts.' },
      ],
      pitfalls: [
        'Big-bang migration without parity evals',
        'Centralising prompts and UX (over-reach)',
        'Forgetting ACL sync',
      ],
    },
    {
      id: 'ai-reference-architectures-iq-2',
      difficulty: 'hard',
      question: 'Design the architecture of an in-product AI copilot for a spreadsheet/BI tool used by 2M monthly users. Cover inline suggestions and chat-driven actions.',
      whatInterviewerLooksFor: [
        'Fast vs slow path separation with latency budgets',
        'Context engine design',
        'Safe action execution with user permissions and confirmation',
        'Metrics: acceptance and retention',
        'Cost controls',
      ],
      modelAnswer: `**Fast path — inline formula and cell suggestions**
- Client context engine collects: active cell, neighbouring headers and sample values, sheet schema, recently typed formulas.
- Debounce ~120 ms, cancel stale requests, cache by context hash.
- Small model (self-hosted, fine-tuned on formulas) behind the gateway; p50 < 250 ms. Validate suggestions by parsing the formula client-side before showing.

**Slow path — chat and actions** ("build a pivot of revenue by region", "explain this drop")
- Orchestrator with a frontier model and tools: read range, write range, create chart, run query on the connected warehouse (Text-to-SQL with read-only role).
- **Actions are proposals**: the model returns a plan and a diff (cells/charts to change); the user previews and confirms; everything is undoable.
- Tools execute with the user's permissions; data connectors respect row-level security.

**Shared services**: LLM gateway (quotas per workspace, routing), guardrails (PII in sheets, injection via cell content), telemetry.

**Scale**: 2M MAU, ~10% daily active → 200K DAU; inline ~50 requests per active user per day → 10M/day ≈ 115 QPS average, ~500 peak — cheap with a small model. Chat ~3 per user per day → 600K/day, the main cost driver: cap context size and use prompt caching for the static system/tool prompt.

**Metrics**: acceptance and retention of inline suggestions, action confirm rate, undo rate (a quality smell), time-to-insight.`,
      followUps: [
        { q: 'How do you defend against prompt injection in cell contents?', a: 'Treat sheet data as untrusted: delimit it as data, never execute tool calls proposed solely from data content without user confirmation, restrict tools to the current workbook and scan for injection patterns before sending.' },
        { q: 'Why validate formulas client-side?', a: 'Showing an unparseable or erroring formula destroys trust and acceptance. A local parser check is nearly free and can trigger a silent regenerate or suppression instead.' },
      ],
      pitfalls: [
        'One path for everything (frontier model on every keystroke)',
        'Letting the agent write cells without preview/undo',
        'No acceptance telemetry',
      ],
    },
    {
      id: 'ai-reference-architectures-iq-3',
      difficulty: 'expert',
      question: 'You run a multi-tenant agent platform. A security researcher shows that tenant A\'s agent returned a snippet of tenant B\'s data. Walk through your investigation and the architectural fixes.',
      whatInterviewerLooksFor: [
        'Systematic enumeration of leak vectors',
        'Use of audit logs and traces to scope impact',
        'Data-layer enforcement rather than app-level filters',
        'Incident response and disclosure',
      ],
      modelAnswer: `**Immediate response**: contain (disable the implicated feature or cache), preserve logs, start incident process; legal/disclosure clock may start.

**Enumerate leak vectors and check each with traces**
1. **Retrieval**: missing tenant filter in a code path (e.g. a new hybrid BM25 path that forgot the filter), shared collection with filter bug.
2. **Caches**: semantic or exact cache keyed by prompt only → tenant B's answer served to A. Very common.
3. **Memory**: long-term memory store keyed by user id that collides across tenants.
4. **Tools**: tool accepting tenant id from model arguments; shared OAuth credentials.
5. **Sandboxes**: reused containers with leftover files between runs.
6. **Logs/evals**: tenant B's traces used as few-shot examples or fine-tuning data for shared models.
7. **Provider side**: unlikely, but check prompt-caching scopes and data retention settings.

**Scope impact**: query audit logs for all responses whose source ids belong to a tenant other than the requester's — this requires that every retrieval logs (tenant, doc ids).

**Architectural fixes**
- Enforce isolation in the data layer: per-tenant namespaces or Postgres RLS; the service account cannot query without a tenant context.
- Tenant id only from the authenticated session; tools never accept it as an argument.
- All cache and memory keys prefixed by tenant + ACL fingerprint; semantic cache never crosses tenants.
- Fresh microVM sandbox per run.
- Never use tenant data in shared prompts or training without contractual consent.
- **Continuous verification**: canary tenants with honeytoken documents and CI tests that try cross-tenant retrieval through every code path.`,
      followUps: [
        { q: 'What is a honeytoken document here?', a: 'A unique, unguessable string planted in a synthetic tenant’s data. If it ever appears in another tenant’s responses or logs, an alert fires, giving continuous detection of cross-tenant leaks.' },
        { q: 'When would you move a customer to a silo tier?', a: 'When contracts or regulations require physical separation (dedicated keys, VPC or region), when their load profile would dominate pooled resources, or when they need custom models trained on their data.' },
      ],
      pitfalls: [
        'Fixing only the one code path found',
        'Not being able to scope impact due to missing audit logs',
        'Relying on prompts for isolation',
      ],
    },
    {
      id: 'ai-reference-architectures-iq-4',
      difficulty: 'hard',
      question: 'Explain control plane vs data plane for an AI platform and design how a new prompt version goes from a pull request to 100% of traffic.',
      whatInterviewerLooksFor: [
        'Correct responsibilities of each plane',
        'Static stability',
        'Eval gates and progressive delivery',
        'Automated rollback criteria',
      ],
      modelAnswer: `**Planes**
- *Control plane*: model registry, prompt registry, routing rules, guardrail policies, tenants/keys/quotas, eval results, rollout manager. Low QPS, strongly consistent, audited.
- *Data plane*: gateway, orchestrators, retrieval, model servers, sidecars. High QPS, stateless, reads config from an in-memory snapshot; keeps serving last-known-good if the control plane is down.

**Prompt release pipeline**
1. **PR** edits the prompt file (with owner review). CI renders it against fixtures (lint: variables present, token length).
2. **Offline eval gate**: run golden set (e.g. 300 cases) + regression suite; require groundedness ≥ baseline − 0.5 pt, no safety regressions, cost per request within +10%.
3. **Merge** → control plane registers \`support-answer@v15\` (immutable, content-hashed).
4. **Shadow** (optional): data plane runs v15 on mirrored traffic without showing users; compare judge scores.
5. **Canary**: 5% of traffic via weighted routes in the next snapshot; each response stamped with prompt version.
6. **Automated analysis** for 30–60 min: error rate, p95 latency, thumbs-down rate, online judge scores, guardrail block rate vs control.
7. **Ramp** 25% → 50% → 100%, or **auto-rollback** by pushing the previous snapshot (seconds).

**Audit**: who changed what, eval evidence and rollout timeline stored with the version.`,
      followUps: [
        { q: 'Why stamp the prompt version on each response?', a: 'During rollout, pods and users see mixed versions; per-version metrics are only possible if every trace and feedback event carries the version, which also makes incident forensics exact.' },
        { q: 'Thumbs-down is too sparse to detect regressions in 30 minutes. What then?', a: 'Use denser proxy signals such as online LLM-judge scores on sampled traffic, regenerate and copy rates and refusal rate, and extend the canary duration for low-traffic features.' },
      ],
      pitfalls: [
        'Data plane reading prompts from a DB per request',
        'No offline eval gate',
        'Manual rollback only',
      ],
    },
    {
      id: 'ai-reference-architectures-iq-5',
      difficulty: 'medium',
      question: 'For each of the four reference architectures (enterprise RAG, copilot, multi-tenant agent platform, control/data plane), name the single most dangerous failure mode and its mitigation.',
      whatInterviewerLooksFor: [
        'Prioritises by impact, not frequency alone',
        'Concrete, implementable mitigations',
        'Detection, not only prevention',
      ],
      modelAnswer: `| Architecture | Most dangerous failure | Mitigation | Detection |
|---|---|---|---|
| Enterprise RAG | **ACL leakage** — revoked or restricted documents retrievable | ACL sync from source within minutes, pre-filter inside search, citation ACL re-check for sensitive labels | Audit logs of (user, doc ids), red-team queries in CI |
| Copilot | **Unwanted side effects** — agent edits code/records the user did not intend | Proposals with preview/diff, explicit confirmation for writes, user-scoped permissions, undo | Undo-rate and revert metrics, action audit trail |
| Multi-tenant agent platform | **Cross-tenant data exposure** (filters, caches, memory, tools) | Data-layer isolation (RLS/namespaces), tenant from session only, tenant-scoped caches, per-run sandboxes | Honeytoken docs, cross-tenant leak tests |
| Control/data plane | **Global bad config push** — one prompt/route change degrades every request | Eval gates, canary rollouts by %, auto-rollback on SLO regressions, version stamping | Per-version metrics, rollout dashboards |

**Why these**: each is either a security/compliance breach or a fleet-wide quality outage — low frequency but catastrophic impact. Latency and cost issues matter but are recoverable.

**Common thread**: enforce at the lowest layer possible (data layer, server-side), detect continuously, and make every change reversible.`,
      followUps: [
        { q: 'What is the second most important risk for enterprise RAG?', a: 'Stale or superseded content being cited confidently. Mitigate with version and status metadata, latest-only filters, freshness SLOs, and groundedness checks that show citations so users can verify.' },
        { q: 'How would you test the copilot’s action safety before launch?', a: 'Build an adversarial suite of ambiguous and injected instructions, run the agent in a sandboxed app instance, and assert that no write happens without a confirmation event and that every write can be undone.' },
      ],
      pitfalls: [
        'Listing latency as the top risk everywhere',
        'Mitigations that rely on prompts',
        'No detection mechanism',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'ai-reference-architectures-est-1',
      question: 'Estimate monthly cost and capacity for an enterprise RAG platform: 15M chunks indexed, 300K queries/day across all business units.',
      assumptions: [
        'Chunk 500 tokens; embedding price $0.02 per 1M tokens (illustrative); 5% of chunks change per month',
        '1024-d vectors, int8 quantised, HNSW overhead 1.5×, 3 replicas',
        'Per query: 1 embedding (30 tokens), rerank 50 candidates, generation 3,500 input / 350 output tokens',
        'Illustrative LLM price $1 per 1M input, $4 per 1M output tokens',
        'Peak QPS = 3× average',
      ],
      steps: [
        { label: 'Initial embedding', calc: '15M × 500 = 7.5B tokens × $0.02/1M = $150 (one-off)' },
        { label: 'Monthly re-embedding', calc: '5% × 7.5B = 375M tokens × $0.02/1M = $7.50/month' },
        { label: 'Index memory', calc: '15M × 1024 B = 15.4 GB × 1.5 = 23 GB per replica × 3 = 69 GB' },
        { label: 'Query QPS', calc: '300,000 / 86,400 ≈ 3.5 QPS avg → ~10.5 QPS peak' },
        { label: 'Generation cost', calc: 'per query 3,500 × $1/1M + 350 × $4/1M = $0.0035 + $0.0014 = $0.0049; × 300K × 30 = $44,100/month' },
      ],
      answer: 'Embedding ≈ $150 once + ~$8/month, index ≈ 70 GB RAM across 3 replicas, ~10 QPS peak, and ≈ $44K/month in generation — generation is >99% of the variable cost.',
      insight: 'Embedding and vector storage are cheap; LLM generation dominates. The highest-leverage optimisations are smaller context (better reranking → fewer chunks), routing easy queries to cheaper models, and prompt/semantic caching — not vector DB tuning.',
      followUps: [
        { q: 'If reranking lets you cut context from 3,500 to 2,000 input tokens, what is the saving?', a: 'Input cost per query drops from $0.0035 to $0.002, so total per query is $0.0034 instead of $0.0049; at 9M queries per month that saves about $13.5K/month (~31%).' },
      ],
    },
    {
      id: 'ai-reference-architectures-est-2',
      question: 'A copilot inline-completion path is moved to self-hosted GPUs. Estimate the number of GPUs needed for 40K concurrent developers.',
      assumptions: [
        '40K developers active at peak; each triggers an inline request every 8 s after debounce/cancellation',
        'Per request: 1,500 prompt tokens (prefill), 30 generated tokens',
        'One H100 serving a ~7B FIM model with vLLM sustains ~25,000 prefill tok/s and ~3,000 decode tok/s aggregate at the target latency (illustrative)',
        'Run GPUs at ≤ 60% utilisation for latency headroom; N+20% for failures and zones',
      ],
      steps: [
        { label: 'Request rate', calc: '40,000 / 8 s = 5,000 requests/s' },
        { label: 'Prefill load', calc: '5,000 × 1,500 = 7.5M tok/s → 7.5M / 25K = 300 GPU-equivalents' },
        { label: 'Decode load', calc: '5,000 × 30 = 150K tok/s → 150K / 3K = 50 GPU-equivalents' },
        { label: 'Combined at 60% target', calc: '(300 + 50) / 0.6 ≈ 583 GPUs' },
        { label: 'With prefix caching (60% prompt reuse)', calc: 'prefill 300 × 0.4 = 120 → (120 + 50) / 0.6 ≈ 283 GPUs; +20% → ~340 GPUs' },
      ],
      answer: '~700 H100s naively (583 + 20%), ~340 with prefix caching — prefill, not decode, is the dominant cost for inline completions.',
      insight: 'Completions are prefill-heavy (long context, short output), so prefix caching, smaller context windows and better debounce or cancellation move the GPU count far more than faster decoding does.',
      followUps: [
        { q: 'If better cancellation raises the interval to 12 s per developer, how many GPUs?', a: 'Request rate drops to about 3,333/s, scaling everything by two-thirds: roughly 190 GPUs before the 20% headroom and about 230 after it, using the cached-prefill assumption.' },
      ],
    },
  ],
  test: [
    {
      id: 'ai-reference-architectures-mcq-01',
      difficulty: 'medium',
      question: 'In an enterprise RAG platform, which components belong on the ingestion (offline/async) side rather than the query path? (Select ALL that apply)',
      options: ['Connector sync of content and ACLs', 'Layout-aware parsing and OCR', 'Cross-encoder reranking of candidates', 'Chunk embedding in batches'],
      correct: [0, 1, 3],
      explanation: 'Syncing, parsing/OCR and batch embedding prepare the index asynchronously. Reranking scores candidates for a specific query, so it must run on the query path (only the query embedding is computed online).',
      followUps: [{ q: 'Why is ingestion queue-driven?', a: 'Volumes are bursty (bulk imports, re-syncs), parsing fails on some files, and queues give retries, dead-lettering and independent scaling of parse and embed workers without affecting query latency.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-02',
      difficulty: 'hard',
      question: 'Recall@6 on your golden set is 0.71. Analysis shows many misses retrieve an older, superseded version of the right policy. What is the most targeted fix?',
      options: ['Increase k to 20', 'Add version/status metadata at ingestion and filter to current documents (or boost recency) at query time', 'Switch to a larger embedding model', 'Lower the HNSW efSearch'],
      correct: [1],
      explanation: 'Old and new versions embed almost identically, so semantics cannot separate them — metadata can. Larger k adds noise and tokens, a bigger embedding model still sees near-duplicates, and lowering efSearch reduces recall.',
      followUps: [{ q: 'What if users sometimes need historical versions?', a: 'Default to current-only, but let the query rewriter detect time references such as "policy as of 2023" and switch the filter to an effective-date range.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-03',
      difficulty: 'hard',
      question: 'What is the main problem with this copilot client code?',
      code: {
        language: 'typescript',
        code: `editor.onChange(async (ctx) => {
  const res = await fetch('/copilot/complete', {
    method: 'POST',
    body: JSON.stringify(ctx),
  });
  showGhostText((await res.json()).completion);
});`,
      },
      options: [
        'It uses POST instead of GET',
        'Every keystroke fires a request with no debounce or cancellation, so stale completions arrive late and can overwrite newer ones',
        'JSON.stringify is too slow for editor context',
        'Ghost text should be rendered server-side',
      ],
      correct: [1],
      explanation: 'Without debounce and AbortController, typing 8 characters sends 8 requests; responses arrive out of order and show suggestions for text the user already changed, wasting GPU capacity. POST is appropriate for large bodies, serialisation cost is negligible, and ghost text is a client UI concern.',
      followUps: [{ q: 'Besides cancellation, how do you discard out-of-order responses?', a: 'Attach a monotonically increasing request id or document version to each request and ignore any response whose id is older than the latest one sent.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-04',
      difficulty: 'medium',
      question: 'Which metric best captures whether inline copilot suggestions are actually useful?',
      options: ['Number of suggestions shown per hour', 'Acceptance rate combined with retention (accepted text still present after N seconds)', 'Average model output length', 'GPU utilisation'],
      correct: [1],
      explanation: 'Acceptance shows users took the suggestion; retention filters out accept-then-delete. Volume shown, output length and GPU utilisation measure activity or cost, not usefulness.',
      followUps: [{ q: 'Why might acceptance rise while value falls?', a: 'Shorter, trivial suggestions such as closing brackets get accepted more often but save little time; track characters retained or time saved alongside the raw acceptance rate.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-05',
      difficulty: 'expert',
      question: 'Which of the following are cross-tenant leak vectors in a pooled multi-tenant agent platform? (Select ALL that apply)',
      options: [
        'A semantic cache keyed only by the prompt embedding',
        'A tool whose tenant_id parameter is filled by the model',
        'Per-tenant token buckets at the gateway',
        'Reusing a code-execution container across runs of different tenants',
      ],
      correct: [0, 1, 3],
      explanation: 'A prompt-keyed cache serves tenant B\'s answer to tenant A, model-filled tenant ids are injectable, and reused containers can retain files or environment variables. Per-tenant token buckets are a fairness control, not a leak vector.',
      followUps: [{ q: 'How do you make a semantic cache safe in a multi-tenant system?', a: 'Partition the cache by tenant and ACL fingerprint (separate namespace or a mandatory filter), include prompt and model version in the key, and exclude personalised responses.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-06',
      difficulty: 'hard',
      question: 'A regulated bank customer demands that its data never shares storage or encryption keys with other customers, but your platform is pooled. Which isolation tier fits, and what stays shared?',
      options: [
        'Pool tier; everything stays shared with tenant_id filters',
        'Silo (or bridge with dedicated stores and keys); the codebase and control plane can stay shared while data stores, keys and optionally compute are dedicated',
        'No tier can satisfy this; build a separate product',
        'Pool tier with a stronger system prompt',
      ],
      correct: [1],
      explanation: 'Silo or bridge tiers dedicate data stores and KMS keys (and optionally compute) per tenant while the same software and control plane manage them. Pool tier shares storage, a separate product is unnecessary, and prompts are not an isolation boundary.',
      followUps: [{ q: 'What does this do to operations?', a: 'Every silo is another deployment to upgrade and monitor, so automate provisioning with infrastructure-as-code and roll out via the same control plane with per-silo canaries.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-07',
      difficulty: 'hard',
      question: 'Review this multi-tenant retrieval tool. What is the vulnerability?',
      code: {
        language: 'typescript',
        code: `const tool = {
  name: 'search_docs',
  parameters: { type: 'object', properties: {
    tenant_id: { type: 'string' }, query: { type: 'string' } } },
  run: (a: { tenant_id: string; query: string }) =>
    db.query('SELECT text FROM docs WHERE tenant_id = $1 AND text ILIKE $2',
      [a.tenant_id, '%' + a.query + '%']),
};`,
      },
      options: [
        'SQL injection through the query parameter',
        'The model controls tenant_id, so a prompt injection can read another tenant\'s documents',
        'ILIKE is too slow',
        'The tool lacks a description',
      ],
      correct: [1],
      explanation: 'Values are parameterised, so classic SQL injection is prevented, but tenant_id comes from model arguments — any injected instruction can change it. Tenant must be bound from the authenticated session (closure or RLS). ILIKE performance and the missing description are minor issues.',
      followUps: [{ q: 'What defence-in-depth would you add beneath the fix?', a: 'Postgres row-level security keyed on a session variable set from the authenticated tenant, so even a buggy query without a tenant filter cannot return other tenants’ rows.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-08',
      difficulty: 'medium',
      question: 'Which items belong to the AI control plane rather than the data plane? (Select ALL that apply)',
      options: ['Prompt registry and version history', 'vLLM model server pods', 'Rollout manager with canary percentages', 'Tenant quota definitions'],
      correct: [0, 2, 3],
      explanation: 'Registries, rollout state and quota definitions decide how traffic should be served — control plane. Model servers handle requests and are data plane; they enforce quotas and routes that the control plane defines.',
      followUps: [{ q: 'Where are quota counters (current usage) kept?', a: 'In the data plane’s fast state store, for example Redis next to the gateway; the control plane holds the limits, while the counters change on every request and must be low-latency.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-09',
      difficulty: 'expert',
      question: 'Your control-plane database is down. With a correctly designed AI platform, what happens?',
      options: [
        'All inference requests fail until the database recovers',
        'Requests keep being served using the last-known-good config snapshot; only config changes and new rollouts are blocked',
        'The data plane switches to default prompts embedded in the binary',
        'Gateways stop enforcing quotas and policies',
      ],
      correct: [1],
      explanation: 'Static stability means the data plane holds a validated snapshot in memory (and on disk for new pods) and keeps serving. Falling back to default prompts changes behaviour silently, and dropping policy enforcement would be a safety failure.',
      followUps: [{ q: 'What could still break during a long control-plane outage?', a: 'Time-bound items such as expiring credentials or keys, new tenants that cannot be onboarded, and urgent rollbacks that cannot be pushed; keep a break-glass path to deliver a snapshot directly.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-10',
      difficulty: 'hard',
      question: 'This data-plane config refresh has a dangerous behaviour. Which one?',
      code: {
        language: 'typescript',
        code: `setInterval(async () => {
  try {
    const next = await (await fetch(CP_URL + '/snapshot')).json();
    current = next;                       // swap in whatever we received
  } catch {
    current = DEFAULT_CONFIG;             // reset on failure
  }
}, 10_000);`,
      },
      options: [
        'The 10 s interval is too frequent',
        'It applies unvalidated snapshots and, on failure, replaces a good config with defaults instead of keeping last-known-good',
        'fetch should be replaced with gRPC',
        'setInterval leaks memory',
      ],
      correct: [1],
      explanation: 'A malformed or older snapshot is applied blindly, and any transient control-plane error resets production behaviour to defaults — two ways to cause a fleet-wide incident. Validate (schema, version monotonicity) and keep the current snapshot on failure. The interval and transport are fine.',
      followUps: [{ q: 'Why check version monotonicity?', a: 'Caches or proxies can return an older snapshot; refusing versions lower than the current one prevents accidental rollbacks unless the control plane explicitly issues a signed rollback.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-11',
      difficulty: 'expert',
      question: 'Which practices make a behaviour-changing AI config push (new prompt, new model route) safe? (Select ALL that apply)',
      options: [
        'Offline eval gate on a golden set before the change is registered',
        'Progressive rollout by traffic percentage with per-version metrics',
        'Applying the change to all regions simultaneously to avoid version skew',
        'Automatic rollback when error rate, latency or quality signals regress',
      ],
      correct: [0, 1, 3],
      explanation: 'Eval gates catch regressions before users do, progressive rollout limits blast radius, and auto-rollback bounds recovery time. Global simultaneous rollout maximises blast radius; version skew is handled by stamping versions and making changes backward compatible.',
      followUps: [{ q: 'Which quality signal reacts fastest during a canary?', a: 'Online LLM-judge scores or guardrail block rates on sampled canary traffic react within minutes, whereas thumbs-down feedback is sparse and slow.' }],
    },
    {
      id: 'ai-reference-architectures-mcq-12',
      difficulty: 'medium',
      question: 'Back-of-envelope for an enterprise RAG platform shows embeddings at ~$8/month, vector storage at ~70 GB and generation at ~$44K/month. Where should cost optimisation start?',
      options: [
        'Switch to a cheaper vector database',
        'Reduce generation cost: tighter reranked context, routing easy queries to smaller models, prompt and semantic caching',
        'Use a smaller embedding model',
        'Reduce HNSW replicas from 3 to 1',
      ],
      correct: [1],
      explanation: 'Generation is over 99% of variable cost, so even a 20% reduction there dwarfs eliminating all embedding cost. Vector DB and embedding changes save little, and dropping replicas sacrifices availability for negligible savings.',
      followUps: [{ q: 'What is the risk of cutting context aggressively?', a: 'Recall loss: if the needed chunk falls out of the reduced set, answers degrade or hallucinate. Validate context cuts against recall@k and groundedness on the golden set first.' }],
    },
  ],
};

export default topic;
