import type { Topic } from '../../types';

const topic: Topic = {
  id: 'ai-architecture-fundamentals',
  phase: 'architecture',
  order: 1,
  title: 'AI Architecture Fundamentals',
  subtitle: 'From one prompt to a governed system: application anatomy, layers, compound AI systems and the LLM gateway',
  estimatedMinutes: 52,
  sources: [
    'Zaharia, Khattab et al. (BAIR, 2024) — The Shift from Models to Compound AI Systems: https://bair.berkeley.edu/blog/2024/02/18/compound-ai-systems/',
    'Anthropic (2024) — Building effective agents: https://www.anthropic.com/engineering/building-effective-agents',
    'LiteLLM docs — Proxy (LLM gateway): virtual keys, budgets, fallbacks: https://docs.litellm.ai/docs/simple_proxy',
    'LiteLLM docs — Budget fallbacks: https://docs.litellm.ai/docs/proxy/budget_fallbacks',
    'Kong developer docs — AI Gateway and AI PII Sanitizer plugin: https://developer.konghq.com/plugins/ai-sanitizer/',
    'Portkey docs — AI Gateway (routing, fallbacks, caching, guardrails): https://portkey.ai/docs',
    'Khattab et al. (2023) — DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines: https://arxiv.org/abs/2310.03714',
    'AWS Well-Architected — Generative AI Lens: https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/',
  ],
  tags: ['architecture', 'system design', 'compound ai', 'llm gateway', 'layers', 'governance', 'litellm', 'portkey'],
  cheatSheet: [
    'An AI application = UI + orchestration + context (retrieval/memory/tools) + model(s) + guardrails + evals/observability; the model is ~10% of the code.',
    'Layers: experience → orchestration → knowledge/retrieval → model access (gateway) → platform/ops/governance; each layer talks only to the one below through a contract.',
    'Keep prompts, model ids and thresholds in versioned config, never hard-coded; every layer emits trace spans with the same trace id.',
    'Compound AI system (BAIR 2024): many interacting components (model calls, retrievers, tools, verifiers) beat a single bigger model on quality, cost and control.',
    'Compound systems are optimised end to end: evaluate the whole pipeline, then tune each component (DSPy-style prompt optimisation, retriever k, verifier thresholds).',
    'LLM gateway = one OpenAI-compatible endpoint in front of all providers: auth/virtual keys, quotas/budgets, routing/fallbacks, caching, PII redaction, logging.',
    'Gateway is on the hot path: keep it stateless, horizontally scaled, adding < 10–20 ms p99; push state to Redis/Postgres.',
    'Fail open vs fail closed: availability features (cache, logging) fail open; safety features (PII redaction, auth) fail closed.',
    'Cost attribution needs metadata on every call: team, app, feature, user — tagged at the gateway, not reconstructed later.',
    'Start simple (single call + retrieval), add components only when evals prove the gain — every hop adds latency, cost and a failure mode.',
  ],
  sections: [
    {
      heading: 'AI Application Architecture — the anatomy of a production LLM app',
      body: `Think of an LLM like a brilliant contractor who forgets everything between visits: the **architecture** is the office around them — the receptionist (UI), the project manager (orchestration), the filing cabinet (retrieval and memory), the toolbox (APIs), the safety officer (guardrails) and the auditor (evals and logs).

A production request flows through six concerns:

| Concern | Job | Typical tech |
|---|---|---|
| Experience | chat/stream UI, auth, feedback buttons | React, SSE, WebSockets |
| Orchestration | prompt assembly, tool loop, state | LangGraph, plain TS, workflow engine |
| Context | retrieval, memory, tool results | pgvector, Qdrant, Redis |
| Model access | provider call, retries, fallback | gateway, SDKs |
| Guardrails | input/output validation, PII, policy | classifiers, Zod schemas |
| Ops | traces, cost, evals, prompt versions | OpenTelemetry, Langfuse, CI evals |

The key mindset shift: the **model is a stateless function** (text in, text out) and everything that makes the product reliable lives *around* it. Your code owns state, permissions, data freshness and correctness checks; the model owns language.

Two rules keep the system evolvable. First, **externalise what changes**: prompt templates, model ids, temperature and retrieval k live in versioned config so you can roll forward and back without a deploy. Second, **make every step observable**: one trace id from the browser to the provider call, with token counts and latency per span.

Use this anatomy as a checklist whenever you design or review an AI feature: if a concern has no owner, it will fail in production first.`,
      example: `**Support assistant request:** user asks "Can I return a laptop after 40 days?"
1. Experience: SSE stream opened, user id + tenant from JWT, trace id t-91f.
2. Orchestration: loads prompt "support-answer@v14" from config.
3. Context: hybrid search returns 5 chunks (2,100 tokens) from "returns-policy-2026.pdf"; order history tool returns purchase date (52 days ago).
4. Model access: 2,600 input + 180 output tokens, TTFT 420 ms, total 2.1 s.
5. Guardrails: output schema check passes; citation [returns-policy §3] present.
6. Ops: trace shows retrieval 140 ms, model 2.1 s, cost $0.004 (illustrative price). Answer: "No — laptops have a 30-day window; you are at 52 days. You can request a warranty repair instead."`,
      diagram: `   User
    |  HTTPS / SSE
    v
+-----------------+     +--------------------------------------+
| Experience      |     |  Ops: traces . cost . evals . config |
| UI, auth, stream|     +------------------+-------------------+
+--------+--------+                        | (spans from all)
         v                                 |
+-----------------+   +--------------+     |
| Orchestration   |-->| Guardrails   |<----+
| prompt, tools,  |   | in / out     |
| state machine   |   +--------------+
+--+-----------+--+
   |           |
   v           v
+--------+  +-------------------+
|Context |  | Model access      |---> OpenAI / Anthropic / vLLM
|RAG,mem,|  | retries, fallback |
|tools   |  +-------------------+
+--------+`,
      code: [
        {
          language: 'typescript',
          title: 'Thin, layered request handler with config + tracing',
          code: `import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Config lives outside code: prompt version, model id, retrieval k
const cfg = {
  model: process.env.LLM_MODEL ?? 'claude-sonnet-5-5',
  promptVersion: 'support-answer@v14',
  topK: 5,
};
const client = new Anthropic();
const Answer = z.object({ answer: z.string(), citations: z.array(z.string()).min(1) });

type Retriever = (q: string, k: number) => Promise<{ id: string; text: string }[]>;

export async function handle(question: string, retrieve: Retriever, traceId: string) {
  const t0 = Date.now();
  const chunks = await retrieve(question, cfg.topK);            // context layer
  const context = chunks.map((c) => '[' + c.id + '] ' + c.text).join('\\n');
  const res = await client.messages.create({                    // model layer
    model: cfg.model,
    max_tokens: 600,
    system: 'Answer only from the context. Return JSON {answer, citations}.',
    messages: [{ role: 'user', content: 'Context:\\n' + context + '\\n\\nQ: ' + question }],
  });
  const text = res.content[0].type === 'text' ? res.content[0].text : '';
  const parsed = Answer.safeParse(JSON.parse(text));            // guardrail layer
  console.log(JSON.stringify({ traceId, prompt: cfg.promptVersion, ms: Date.now() - t0,
    inTok: res.usage.input_tokens, outTok: res.usage.output_tokens, ok: parsed.success }));
  return parsed.success ? parsed.data : { answer: 'I could not verify an answer.', citations: [] };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Clear ownership per concern makes reviews and incident triage fast ("is it retrieval or the model?").',
          'Externalised config lets you swap models or prompt versions without redeploying code.',
          'Per-span tracing turns vague "it is slow" complaints into a concrete latency budget.',
        ],
        cons: [
          { con: 'More moving parts than a single API call, which slows early prototyping.', fix: 'Start with the same layers as plain functions in one service; split into services only when scale or team boundaries demand it.' },
          { con: 'Concerns blur over time (prompt strings creep into UI code, retrieval logic into handlers).', fix: 'Enforce boundaries with module interfaces and lint rules (e.g. only the orchestration package may import the LLM SDK).' },
          { con: 'JSON.parse on raw model text can throw and take down the request.', fix: 'Use structured outputs / tool schemas plus a try/catch with one repair retry before the safe fallback.' },
        ],
      },
      keyPoints: [
        'The model is a stateless function; reliability lives in the code around it.',
        'Six concerns: experience, orchestration, context, model access, guardrails, ops.',
        'Version prompts and model ids in config, not code.',
        'One trace id end to end, with tokens and latency per span.',
      ],
      exercise: {
        prompt: `Write \`buildRequestPlan(feature)\` that returns, for a feature spec, which of the six concerns it must implement. Rules: every feature needs experience, orchestration, model and ops; add **context** if \`usesPrivateData\`; add **guardrails** if \`userFacing\` or \`takesActions\`. Return the concerns in pipeline order.`,
        starter: {
          language: 'typescript',
          code: `type Concern = 'experience' | 'orchestration' | 'context' | 'model' | 'guardrails' | 'ops';
interface Feature { usesPrivateData: boolean; userFacing: boolean; takesActions: boolean }

export function buildRequestPlan(f: Feature): Concern[] {
  // TODO: return concerns in this order: experience, orchestration, context, model, guardrails, ops
  return [];
}`,
        },
        hints: [
          'Start from the fixed order array and filter it.',
          'Compute two booleans: needsContext and needsGuardrails.',
        ],
        solution: {
          language: 'typescript',
          code: `type Concern = 'experience' | 'orchestration' | 'context' | 'model' | 'guardrails' | 'ops';
interface Feature { usesPrivateData: boolean; userFacing: boolean; takesActions: boolean }

const ORDER: Concern[] = ['experience', 'orchestration', 'context', 'model', 'guardrails', 'ops'];

export function buildRequestPlan(f: Feature): Concern[] {
  const needsContext = f.usesPrivateData;
  const needsGuardrails = f.userFacing || f.takesActions;
  return ORDER.filter((c) =>
    c === 'context' ? needsContext : c === 'guardrails' ? needsGuardrails : true,
  );
}

// buildRequestPlan({ usesPrivateData: true, userFacing: true, takesActions: false })
// -> ['experience','orchestration','context','model','guardrails','ops']`,
        },
        explanation: 'Filtering a fixed, ordered list keeps the pipeline order stable and makes the rules explicit and testable — the same idea as an architecture checklist in a design review.',
      },
      quickCheck: {
        question: 'Your support bot gave a wrong answer. The trace shows retrieval returned the 2023 policy and the model quoted it faithfully. Which layer owns the fix?',
        options: ['Model access — switch to a larger model', 'Context/retrieval — fix freshness or filtering of the indexed documents', 'Experience — add a disclaimer in the UI', 'Guardrails — block all answers about returns'],
        correct: 1,
        explanation: 'The model behaved correctly given its input; the defect is stale or unfiltered context. A bigger model would quote the same wrong policy, and UI disclaimers or blanket blocks hide the bug rather than fix it.',
      },
      source: 'AWS Well-Architected Generative AI Lens; Anthropic — Building effective agents (2024)',
    },
    {
      heading: 'Layered AI Architecture — experience, orchestration, knowledge, model, platform',
      body: `A layered architecture is like a building: tenants (users) never touch the plumbing (GPUs), and each floor only uses the services of the floor below through well-defined pipes.

The five layers most enterprise GenAI platforms converge on:

| Layer | Owns | Contract it exposes |
|---|---|---|
| 1. Experience | chat UI, copilots in apps, APIs, Slack bots | user intent + identity |
| 2. Orchestration | workflows, agents, prompt templates, tool loop | \`run(task, ctx)\` |
| 3. Knowledge / retrieval | ingestion, indexes, ACL filters, memory, tools/MCP | \`search(q, user, filters)\` |
| 4. Model | gateway, routing, fallbacks, self-hosted and API models | OpenAI-compatible \`/chat/completions\` |
| 5. Platform / ops / governance | identity, secrets, observability, evals, cost, policy, audit | cross-cutting services |

Why layers? **Independent change.** You can swap Pinecone for pgvector (layer 3) or GPT for Claude (layer 4) without touching the UI. Teams map onto layers too: product squads own layer 1–2, a data team owns layer 3, a platform team owns 4–5.

Rules that make it work:
- **Downward calls only**; upward communication via events or callbacks.
- **Identity flows through every layer**: retrieval must filter by the *end user's* ACLs, not the service account's.
- **Governance is cross-cutting**, not a layer you call optionally: tracing, PII policy and budgets are enforced in the gateway and retrieval APIs so no team can skip them.

Use layering once you have more than one AI feature or team. A single prototype can collapse layers 2–4 into one file — but keep the seams so you can split later.`,
      example: `**Bank with 3 AI features** (support chat, analyst copilot, document summariser):
- Without layers: each team embeds docs separately (3 copies of 4M chunks ≈ 3 × 25 GB of vectors), uses its own OpenAI key (no budget control), logs nothing centrally. An audit asks "which features sent account numbers to a provider?" — nobody can answer.
- With layers: one retrieval service (25 GB, ACL-filtered), one gateway with per-team virtual keys and PII redaction, one trace store. Swapping the summariser from a frontier model to a self-hosted 8B model is a routing-rule change in layer 4: cost drops from ~$9K to ~$2K/month (illustrative) and no product code changes. The audit becomes a single query over gateway logs.`,
      diagram: `+------------------------------------------------------------+
| 1 EXPERIENCE   web chat | IDE copilot | Slack bot | API     |
+------------------------------+-----------------------------+
                               | intent + user identity (JWT)
+------------------------------v-----------------------------+
| 2 ORCHESTRATION  workflows | agents | prompts | tool loop   |
+--------------+-------------------------------+-------------+
               | search(q, user)               | chat(msgs)
+--------------v---------------+  +------------v-------------+
| 3 KNOWLEDGE / RETRIEVAL      |  | 4 MODEL ACCESS           |
| ingest | vector+BM25 | ACLs  |  | LLM gateway | routing    |
| memory | MCP tools           |  | API models | vLLM pool   |
+--------------+---------------+  +------------+-------------+
               |                               |
+--------------v-------------------------------v-------------+
| 5 PLATFORM / OPS / GOVERNANCE  (cross-cutting)              |
| identity | secrets | traces | evals | cost | policy | audit |
+------------------------------------------------------------+`,
      code: [
        {
          language: 'typescript',
          title: 'Layer contracts as TypeScript interfaces (swap implementations freely)',
          code: `// Layer 3 contract: retrieval always receives the END USER identity
export interface UserCtx { userId: string; tenantId: string; groups: string[] }
export interface Retriever {
  search(q: string, user: UserCtx, opts?: { k?: number; filters?: Record<string, string> }):
    Promise<{ id: string; text: string; score: number }[]>;
}

// Layer 4 contract: an OpenAI-compatible chat call via the gateway
export interface ModelClient {
  chat(req: { model: string; messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    metadata: { team: string; feature: string; traceId: string } }): Promise<{ text: string; tokens: number }>;
}

// Layer 2 depends only on the contracts, never on Qdrant or OpenAI directly
export class AnswerWorkflow {
  constructor(private retriever: Retriever, private model: ModelClient) {}

  async run(question: string, user: UserCtx, traceId: string) {
    const docs = await this.retriever.search(question, user, { k: 6 });
    const context = docs.map((d) => d.text).join('\\n---\\n');
    return this.model.chat({
      model: 'default-chat',            // logical alias resolved by the gateway
      messages: [
        { role: 'system', content: 'Answer from context only.' },
        { role: 'user', content: context + '\\n\\nQuestion: ' + question },
      ],
      metadata: { team: 'support', feature: 'answer', traceId },
    });
  }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Components are swappable behind contracts (vector DB, model provider, UI channel).',
          'Governance enforced once in shared layers instead of re-implemented per team.',
          'Team topology maps cleanly onto layers, reducing coordination overhead.',
        ],
        cons: [
          { con: 'Extra network hops between layer services add latency (5–30 ms each).', fix: 'Co-locate layers 2–4 in one region, use keep-alive/HTTP2 and collapse layers into libraries where a hop gives no isolation benefit.' },
          { con: 'Leaky abstractions: provider-specific features (prompt caching, tool formats) do not fit a lowest-common-denominator contract.', fix: 'Allow typed "extensions" in the contract (e.g. cacheControl hints) that the gateway translates per provider.' },
          { con: 'Identity gets dropped between layers, so retrieval runs as a service account and leaks documents.', fix: 'Make UserCtx a required parameter of every retrieval and tool call, and propagate a signed on-behalf-of token.' },
        ],
      },
      keyPoints: [
        'Five layers: experience, orchestration, knowledge, model, platform/governance.',
        'Downward calls only; contracts between layers make components swappable.',
        'End-user identity must reach the retrieval layer for ACL filtering.',
        'Governance is enforced in shared layers so nobody can skip it.',
      ],
      exercise: {
        prompt: `Implement an in-memory \`Retriever\` that enforces ACLs: each doc has \`allowedGroups\`; return only docs where the user shares at least one group, ranked by a naive keyword-overlap score, top k. Acceptance: a user in \`['hr']\` never sees a doc with \`allowedGroups: ['finance']\`.`,
        starter: {
          language: 'typescript',
          code: `interface UserCtx { userId: string; groups: string[] }
interface Doc { id: string; text: string; allowedGroups: string[] }

export function makeRetriever(docs: Doc[]) {
  return {
    search(q: string, user: UserCtx, k = 3) {
      // TODO: ACL filter, score by keyword overlap, sort desc, slice k
      return [] as { id: string; score: number }[];
    },
  };
}`,
        },
        hints: [
          'Filter BEFORE scoring so unauthorised docs never enter the candidate set.',
          'Score = number of query words (lower-cased) that appear in the doc text.',
          'Drop docs with score 0.',
        ],
        solution: {
          language: 'typescript',
          code: `interface UserCtx { userId: string; groups: string[] }
interface Doc { id: string; text: string; allowedGroups: string[] }

export function makeRetriever(docs: Doc[]) {
  return {
    search(q: string, user: UserCtx, k = 3) {
      const terms = q.toLowerCase().split(/\\W+/).filter(Boolean);
      return docs
        .filter((d) => d.allowedGroups.some((g) => user.groups.includes(g))) // ACL first
        .map((d) => {
          const text = d.text.toLowerCase();
          return { id: d.id, score: terms.filter((t) => text.includes(t)).length };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}`,
        },
        explanation: 'Applying the ACL as a pre-filter inside the knowledge layer guarantees that no caller (or prompt injection) can retrieve unauthorised content — the orchestration layer never even sees it.',
      },
      quickCheck: {
        question: 'A team wants to move from OpenAI to a self-hosted Llama model for one feature. In a well-layered design, what must change?',
        options: ['The UI and orchestration code that call the OpenAI SDK', 'Only the routing rule for that feature’s model alias in the gateway (layer 4)', 'The retrieval index, because embeddings are model-specific', 'Every layer, because the prompt format differs'],
        correct: 1,
        explanation: 'Orchestration calls a logical alias through an OpenAI-compatible contract, so only layer-4 routing changes (plus re-running evals). Chat models do not affect the embedding index, and prompt tweaks live in versioned config rather than layer code.',
      },
      source: 'AWS Well-Architected Generative AI Lens; Microsoft Azure — Baseline OpenAI end-to-end chat reference architecture',
    },
    {
      heading: 'Compound AI Systems — many components beat one bigger model',
      body: `A compound AI system is a **team instead of a soloist**: rather than asking one giant model to do everything, you combine several model calls, retrievers, tools and checkers that each do one job well.

The term comes from Berkeley BAIR's 2024 post *The Shift from Models to Compound AI Systems* (Zaharia, Khattab et al.): state-of-the-art results increasingly come from systems with **multiple interacting components** — AlphaCode 2 generates up to a million candidate programs and filters them; production apps combine retrieval (Databricks reported ~60% of LLM apps use RAG) with multi-step chains (~30%).

Why compound systems win:
- **Some tasks improve faster with system design than with scaling** — sample 10 answers and pick by a verifier instead of paying for a 3× bigger model.
- **Dynamic knowledge**: retrieval gives fresh, private data a frozen model cannot have.
- **Control and trust**: a verifier, a citation checker or a rule filter is easier to audit than model weights.
- **Cost/quality dial**: route easy queries to a small model, hard ones to a frontier model.

The new challenges: the **design space explodes** (which retriever, how many samples, which model per step), **optimisation is end to end** (a better retriever may need a different prompt), and **ops is harder** (each component can drift). Tools like DSPy treat the pipeline as a program whose prompts and few-shot examples are *compiled* against an eval metric.

Use a compound design when a single call misses your quality bar *and* evals show which extra component fixes the gap. Add one component at a time and measure.`,
      example: `**Contract-clause extraction** (goal: 95% field accuracy on 500 labelled contracts):
- Single frontier call: 86% accuracy, $0.06/contract (illustrative).
- Compound v1 = retrieve the 3 relevant sections (cuts input from 30K to 4K tokens) + mid-size model extraction: 89%, $0.012.
- v2 = add a schema validator + a rule check ("termination date must be after start date") with one repair retry: 93%.
- v3 = sample 3 extractions on low-confidence fields and majority-vote: **95.4%**, $0.017.
The compound system is both more accurate and ~3.5× cheaper than the single big call, and each failure can be attributed to a component.`,
      diagram: `             query
               |
     +---------v---------+
     |  Router (small LM) |-- easy --> small model --> answer
     +---------+---------+
               | hard
     +---------v---------+      +-----------+
     |  Retriever (k=8)  |----->| Reranker  |
     +-------------------+      +-----+-----+
                                      | top 4
                    +-----------------v------------------+
                    | Generator: sample N=3 candidates   |
                    +-----------------+------------------+
                                      |
                    +-----------------v------------------+
                    | Verifier: citations? schema? rules?|
                    +--------+-------------------+-------+
                        pass |                   | fail
                             v                   v
                          answer        repair / escalate`,
      code: [
        {
          language: 'typescript',
          title: 'Generate-then-verify: sample N, keep the best verified candidate',
          code: `import OpenAI from 'openai';

const client = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

type Verifier = (candidate: string) => Promise<{ ok: boolean; score: number }>;

export async function generateAndVerify(prompt: string, verify: Verifier, n = 3) {
  // Fan out N independent samples in parallel (temperature > 0 gives diversity)
  const samples = await Promise.all(
    Array.from({ length: n }, () =>
      client.chat.completions.create({
        model: MODEL,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }],
      }),
    ),
  );
  const candidates = samples.map((s) => s.choices[0].message.content ?? '');

  // Verify each candidate; verifier can be rules, a schema, tests or an LLM judge
  const checked = await Promise.all(candidates.map(async (c) => ({ c, ...(await verify(c)) })));
  const passing = checked.filter((x) => x.ok).sort((a, b) => b.score - a.score);

  if (passing.length === 0) return { status: 'escalate' as const, candidates };
  return { status: 'ok' as const, answer: passing[0].c, agreed: passing.length };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Higher quality per dollar than scaling a single model for many tasks.',
          'Fresh and private knowledge via retrieval and tools.',
          'Components such as verifiers and filters are auditable and independently testable.',
          'Lets you mix small and large models by step difficulty.',
        ],
        cons: [
          { con: 'Latency stacks up across sequential components.', fix: 'Parallelise independent steps (sampling, retrieval fan-out), stream the final step, and set a per-step latency budget.' },
          { con: 'Huge design space and coupled components make manual tuning slow.', fix: 'Optimise end to end against an eval set with programmatic optimisers (DSPy-style) and change one component at a time.' },
          { con: 'Errors compound: a 95%-reliable retriever times a 95% generator is ~90%.', fix: 'Add verification and fallback paths at weak links and track per-component metrics, not just the final score.' },
        ],
      },
      keyPoints: [
        'BAIR (2024): SOTA increasingly comes from systems of models, retrievers, tools and verifiers.',
        'Sampling + verification is often cheaper than a bigger model.',
        'Optimise and evaluate the pipeline end to end, then per component.',
        'Add one component at a time, justified by evals.',
      ],
      exercise: {
        prompt: `Write \`majorityVote(answers)\` for a self-consistency step: normalise answers (trim, lower-case), return the most frequent one and its agreement ratio. If the top agreement is below 0.5, return \`{ answer: null, agreement }\` so the caller can escalate. Ties: pick the answer that appeared first.`,
        starter: {
          language: 'typescript',
          code: `export function majorityVote(answers: string[]): { answer: string | null; agreement: number } {
  // TODO
  return { answer: null, agreement: 0 };
}`,
        },
        hints: [
          'Use a Map to count normalised answers; Map preserves insertion order for ties.',
          'agreement = topCount / answers.length.',
          'Guard against an empty array.',
        ],
        solution: {
          language: 'typescript',
          code: `export function majorityVote(answers: string[]): { answer: string | null; agreement: number } {
  if (answers.length === 0) return { answer: null, agreement: 0 };
  const counts = new Map<string, number>();
  for (const a of answers) {
    const key = a.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [k, c] of counts) if (c > bestCount) { best = k; bestCount = c; } // first wins ties
  const agreement = bestCount / answers.length;
  return agreement < 0.5 ? { answer: null, agreement } : { answer: best, agreement };
}

// majorityVote(['42', ' 42', '41']) -> { answer: '42', agreement: 0.666... }`,
        },
        explanation: 'Self-consistency is the simplest compound pattern: N samples plus a cheap aggregator. Returning null below a threshold turns disagreement into a routing signal (escalate to a stronger model or a human).',
      },
      quickCheck: {
        question: 'Your single-call extractor is 88% accurate. Evals show most errors are dates that violate obvious business rules. Which compound change is most targeted?',
        options: ['Switch to a model with a 1M-token context window', 'Add a rule-based verifier with one repair retry on violations', 'Add a second retriever over a web search API', 'Raise temperature to increase diversity'],
        correct: 1,
        explanation: 'The failure mode is rule-checkable, so a deterministic verifier plus repair directly targets it. A bigger context window or web retrieval does not address date logic, and higher temperature adds noise.',
      },
      source: 'Zaharia, Khattab et al. — The Shift from Models to Compound AI Systems (BAIR, Feb 2024)',
    },
    {
      heading: 'LLM Gateway — one governed front door to every model',
      body: `An LLM gateway is the **airport security + air-traffic control** for model calls: every request passes one checkpoint that verifies who you are, how much you may spend, where the request should fly, and records the trip.

It is a reverse proxy exposing one (usually OpenAI-compatible) API in front of many providers — OpenAI, Anthropic, Bedrock, Vertex, self-hosted vLLM. Products in this space include **LiteLLM Proxy** (open source: virtual keys, per-team budgets, fallbacks, spend tracking), **Portkey** (routing configs, fallbacks, caching, guardrails) and **Kong AI Gateway** (Kong plugins such as AI Proxy, rate limiting and an AI PII Sanitizer).

Core responsibilities:

| Concern | What the gateway does |
|---|---|
| Auth | virtual keys per team/app mapped to real provider keys (never shipped to clients) |
| Quotas | requests/min, tokens/min, $ budgets per key/team, with alerts |
| Routing | logical aliases (default-chat) → provider/model; weighted, latency- or cost-based |
| Reliability | retries with backoff, timeouts, fallbacks, circuit breakers |
| Caching | exact-match and semantic caches; pass-through of provider prompt caching |
| Safety | PII redaction, prompt-injection and content filters, allow-listed models |
| Logging | per-call tokens, cost, latency, metadata (team, feature, trace id) |

Design rules: keep it **stateless** and horizontally scaled (state in Redis/Postgres), keep overhead under ~10–20 ms p99, **stream** responses through without buffering, decide per feature whether it **fails open or closed**, and treat the gateway's config as code with review and rollback.

Use a gateway as soon as more than one team or provider is involved — it is the single policy point that makes cost, safety and audit tractable.`,
      example: `**200 internal teams, 3 providers.** Team "search-ux" calls \`model: default-chat\` with virtual key sk-team-search-…:
1. Auth: key → team search-ux, monthly budget $4,000, spent $3,910.
2. Quota: 1,850 input + 300 output tokens estimated; within the 200K TPM limit.
3. Safety: PII sanitizer replaces "john.doe@acme.com" with a placeholder.
4. Routing: alias → primary provider; p95 latency is healthy so no failover.
5. Response streams back; log row: 2,150 tokens, $0.0061 (illustrative), 1.3 s, trace t-77a.
Spend now $3,910.006 — when it crosses $4,000 the budget-fallback rule reroutes this key to a cheaper model instead of returning 429, and the team gets a Slack alert.`,
      diagram: `  team apps / agents / copilots (OpenAI-compatible SDKs)
        |         |          |
        +---------+----------+
                  v
+----------------------------------------------------+
|                 LLM GATEWAY (stateless xN)          |
|  auth(virtual key) -> quota/budget -> PII redact   |
|  -> cache lookup -> route(alias) -> retry/fallback |
|  -> stream back -> log(tokens,$,latency,team)      |
+-----+---------------+---------------+--------------+
      |               |               |       ^
      v               v               v       |
  +--------+    +-----------+   +---------+   |  Redis: rate limits,
  | OpenAI |    | Anthropic |   | vLLM    |   |  cache, spend counters
  +--------+    +-----------+   | (self)  |   |  Postgres: keys, budgets
                                +---------+   |  OTel -> traces/cost DB`,
      code: [
        {
          language: 'typescript',
          title: 'Minimal gateway core: virtual key, budget check, alias routing with fallback',
          code: `import OpenAI from 'openai';

interface KeyInfo { team: string; budgetUsd: number; spentUsd: number }
const KEYS = new Map<string, KeyInfo>([['sk-team-search', { team: 'search', budgetUsd: 4000, spentUsd: 0 }]]);

// Logical alias -> ordered list of [baseURL, model]; first healthy wins
const ROUTES: Record<string, { baseURL: string; model: string; key: string }[]> = {
  'default-chat': [
    { baseURL: 'https://api.openai.com/v1', model: 'gpt-5-mini', key: process.env.OPENAI_KEY ?? '' },
    { baseURL: 'http://vllm.internal:8000/v1', model: 'llama-3.3-70b', key: 'none' },
  ],
};
const PRICE_PER_1K = 0.002; // illustrative blended $ per 1K tokens

export async function gatewayChat(virtualKey: string, body: { model: string; messages: OpenAI.ChatCompletionMessageParam[] }) {
  const info = KEYS.get(virtualKey);
  if (!info) throw Object.assign(new Error('invalid key'), { status: 401 });   // fail closed
  if (info.spentUsd >= info.budgetUsd) throw Object.assign(new Error('budget exceeded'), { status: 429 });

  const targets = ROUTES[body.model];
  if (!targets) throw Object.assign(new Error('unknown model alias'), { status: 400 });

  let lastErr: unknown;
  for (const t of targets) {
    try {
      const client = new OpenAI({ baseURL: t.baseURL, apiKey: t.key, timeout: 20_000, maxRetries: 1 });
      const res = await client.chat.completions.create({ model: t.model, messages: body.messages });
      const tokens = res.usage?.total_tokens ?? 0;
      info.spentUsd += (tokens / 1000) * PRICE_PER_1K;  // production: atomic INCRBYFLOAT in Redis
      console.log(JSON.stringify({ team: info.team, target: t.model, tokens }));
      return res;
    } catch (e) {
      lastErr = e;                                       // try next target (fallback)
    }
  }
  throw lastErr;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Single policy point: auth, budgets, PII and model allow-lists enforced once for every team.',
          'Provider independence through logical aliases and an OpenAI-compatible API.',
          'Complete cost and usage attribution by team, feature and user.',
          'Central reliability features: retries, fallbacks, circuit breakers, caching.',
        ],
        cons: [
          { con: 'Hub on the hot path: a gateway outage takes down every AI feature (SPOF).', fix: 'Run it stateless across zones behind a load balancer, autoscale on concurrency, and give critical apps a break-glass direct route with audit.' },
          { con: 'Adds latency and can break streaming if it buffers responses.', fix: 'Stream SSE chunks straight through, keep policy checks in-memory or Redis (< 5 ms), and benchmark p99 overhead in CI.' },
          { con: 'Lowest-common-denominator API hides provider features (prompt caching, reasoning params, batch).', fix: 'Support pass-through of provider-specific fields and native endpoints for advanced users, still logged and authenticated.' },
          { con: 'Budget counters race under concurrency, so teams overshoot limits.', fix: 'Pre-reserve estimated tokens with an atomic Redis increment, then reconcile with actual usage after the response.' },
        ],
      },
      keyPoints: [
        'Gateway = auth, quotas, routing, reliability, caching, safety, logging in one place.',
        'Expose logical model aliases; map them to providers in config.',
        'Stateless, horizontally scaled, streaming pass-through, < 20 ms overhead.',
        'Safety checks fail closed; cache and logging fail open.',
      ],
      exercise: {
        prompt: `Implement a token-per-minute limiter for the gateway: \`allow(key, tokens, nowMs)\` returns true and records usage if the key's tokens in the last 60 s plus the new tokens stay within its limit, otherwise false. Use a sliding window of timestamps. Acceptance: with limit 1000, calls of 600 then 500 within a minute → second is rejected; after 60 s it is allowed.`,
        starter: {
          language: 'typescript',
          code: `export function makeTpmLimiter(limits: Record<string, number>) {
  const log = new Map<string, { t: number; n: number }[]>();
  return {
    allow(key: string, tokens: number, nowMs: number): boolean {
      // TODO: drop entries older than 60s, sum, compare, record
      return true;
    },
  };
}`,
        },
        hints: [
          'Unknown keys should be rejected (fail closed).',
          'Filter the array to entries with t > nowMs - 60_000 before summing.',
          'Only push the new entry when the request is allowed.',
        ],
        solution: {
          language: 'typescript',
          code: `export function makeTpmLimiter(limits: Record<string, number>) {
  const log = new Map<string, { t: number; n: number }[]>();
  return {
    allow(key: string, tokens: number, nowMs: number): boolean {
      const limit = limits[key];
      if (limit === undefined) return false;                  // unknown key: fail closed
      const recent = (log.get(key) ?? []).filter((e) => e.t > nowMs - 60_000);
      const used = recent.reduce((s, e) => s + e.n, 0);
      if (used + tokens > limit) { log.set(key, recent); return false; }
      recent.push({ t: nowMs, n: tokens });
      log.set(key, recent);
      return true;
    },
  };
}

// const l = makeTpmLimiter({ a: 1000 });
// l.allow('a', 600, 0) -> true; l.allow('a', 500, 1000) -> false; l.allow('a', 500, 61_000) -> true`,
        },
        explanation: 'A sliding window is exact and easy to reason about; in production you would store it in Redis (sorted set or a token bucket via Lua) so all gateway replicas share one view of usage.',
      },
      quickCheck: {
        question: 'The PII-redaction service behind your gateway times out. What should the gateway do for a request from an HR app that handles employee records?',
        options: ['Forward the request unredacted to keep the app available', 'Fail closed: reject or queue the request, because redaction is a safety control', 'Serve a semantic-cache hit from another tenant instead', 'Retry the provider call three times'],
        correct: 1,
        explanation: 'Safety controls fail closed — sending raw PII to an external provider is a compliance breach. Availability features like caching and logging can fail open, but cross-tenant cache serving would be a separate leak, and provider retries do not address the redaction outage.',
      },
      source: 'LiteLLM Proxy docs; Kong AI Gateway / AI PII Sanitizer docs; Portkey AI Gateway docs',
    },
  ],
  codeChallenges: [
    {
      id: 'ai-architecture-fundamentals-cc-1',
      title: 'Hard-coded provider calls scattered across features',
      context: 'Three product features each import the OpenAI SDK directly with a shared secret key, hard-coded model names and no metadata. Finance cannot attribute spend and a provider outage takes all three features down.',
      task: 'Refactor into a single model-access client that calls the internal gateway with a per-feature virtual key, a logical model alias, a timeout, and cost-attribution metadata. Keep the call site to one line.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';

// feature A
const a = new OpenAI({ apiKey: 'sk-prod-shared-123' });
export async function summarise(text: string) {
  const r = await a.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Summarise: ' + text }] });
  return r.choices[0].message.content;
}

// feature B (copy-pasted)
const b = new OpenAI({ apiKey: 'sk-prod-shared-123' });
export async function classify(text: string) {
  const r = await b.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: 'Classify: ' + text }] });
  return r.choices[0].message.content;
}`,
      },
      hints: [
        'Point the OpenAI SDK at the gateway with baseURL; the gateway holds the real provider keys.',
        'Use logical aliases (e.g. "fast-chat") instead of provider model ids.',
        'Attach team/feature/trace metadata so the gateway can attribute cost.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';

type Feature = 'summarise' | 'classify';

// One client per feature: each has its own virtual key (budget + audit), never a provider key
function clientFor(feature: Feature) {
  const key = process.env['GW_KEY_' + feature.toUpperCase()];
  if (!key) throw new Error('missing gateway key for ' + feature);
  return new OpenAI({
    baseURL: process.env.LLM_GATEWAY_URL ?? 'https://llm-gw.internal/v1',
    apiKey: key,
    timeout: 15_000,   // fail fast; the gateway handles provider fallbacks
    maxRetries: 1,
  });
}
const clients = { summarise: clientFor('summarise'), classify: clientFor('classify') };

export async function chat(feature: Feature, alias: 'fast-chat' | 'smart-chat', prompt: string, traceId = randomUUID()) {
  const r = await clients[feature].chat.completions.create(
    { model: alias, messages: [{ role: 'user', content: prompt }] },
    { headers: { 'x-team': 'docs', 'x-feature': feature, 'x-trace-id': traceId } }, // attribution
  );
  return r.choices[0].message.content ?? '';
}

export const summarise = (t: string) => chat('summarise', 'smart-chat', 'Summarise: ' + t);
export const classify = (t: string) => chat('classify', 'fast-chat', 'Classify: ' + t);`,
      },
      explanation: 'Secrets leave application code, the gateway can enforce budgets per feature, provider outages are absorbed by gateway fallbacks behind the alias, and every call carries attribution metadata. Swapping models becomes a gateway config change.',
      followUps: [
        { q: 'How do you migrate 40 services to this client without a big-bang release?', a: 'Ship the client as an internal package, then have the gateway accept both old provider-style model names (mapped to aliases) and new aliases. Migrate service by service, and finally revoke the shared provider key so stragglers fail loudly in staging first.' },
        { q: 'Why one virtual key per feature rather than per service?', a: 'Budgets, rate limits and incident blast radius are naturally per feature: a runaway summariser loop should be throttled without starving the classifier. Per-feature keys also make spend reports map directly to product owners.' },
      ],
    },
    {
      id: 'ai-architecture-fundamentals-cc-2',
      title: 'Compound pipeline with no per-component observability',
      context: 'A retrieve → generate → verify pipeline returns wrong answers 12% of the time. It logs only the final answer, so nobody knows which component fails, and the verifier swallows its own errors.',
      task: 'Add per-step spans (name, duration, key outputs), propagate a trace id, make verifier errors explicit, and return a structured result that says which step failed.',
      starter: {
        language: 'typescript',
        code: `export async function answer(q: string, deps: any) {
  const docs = await deps.retrieve(q);
  const draft = await deps.generate(q, docs);
  let ok = true;
  try { ok = await deps.verify(draft, docs); } catch {}
  console.log(draft);
  return ok ? draft : 'Sorry, I do not know.';
}`,
      },
      hints: [
        'Wrap each step in a helper that records start/end and attributes.',
        'A verifier exception is not a pass — treat it as a distinct failure.',
        'Type the dependencies instead of using any.',
      ],
      solution: {
        language: 'typescript',
        code: `interface Doc { id: string; text: string }
interface Deps {
  retrieve(q: string): Promise<Doc[]>;
  generate(q: string, docs: Doc[]): Promise<string>;
  verify(draft: string, docs: Doc[]): Promise<boolean>;
}
interface Span { name: string; ms: number; attrs: Record<string, unknown>; error?: string }

async function step<T>(spans: Span[], name: string, fn: () => Promise<T>, attrs: (r: T) => Record<string, unknown>) {
  const t0 = performance.now();
  try {
    const r = await fn();
    spans.push({ name, ms: Math.round(performance.now() - t0), attrs: attrs(r) });
    return r;
  } catch (e) {
    spans.push({ name, ms: Math.round(performance.now() - t0), attrs: {}, error: String(e) });
    throw Object.assign(new Error(name + ' failed'), { step: name });
  }
}

export async function answer(q: string, deps: Deps, traceId: string) {
  const spans: Span[] = [];
  try {
    const docs = await step(spans, 'retrieve', () => deps.retrieve(q), (d) => ({ n: d.length, ids: d.map((x) => x.id) }));
    if (docs.length === 0) return { traceId, status: 'no_context' as const, spans };
    const draft = await step(spans, 'generate', () => deps.generate(q, docs), (t) => ({ chars: t.length }));
    const ok = await step(spans, 'verify', () => deps.verify(draft, docs), (v) => ({ pass: v }));
    return ok ? { traceId, status: 'ok' as const, answer: draft, spans } : { traceId, status: 'unverified' as const, spans };
  } catch (e) {
    return { traceId, status: 'error' as const, failedStep: (e as { step?: string }).step, spans };
  } finally {
    console.log(JSON.stringify({ traceId, spans })); // ship to OTel/Langfuse in production
  }
}`,
      },
      explanation: 'Each component now reports latency and the outputs needed for diagnosis (retrieved ids, verifier verdict). Distinct statuses (no_context, unverified, error + failedStep) let dashboards break the 12% error rate down by component, which is the prerequisite for optimising a compound system.',
      followUps: [
        { q: 'The spans show retrieval returns the right doc but verify fails 40% of the time. What next?', a: 'Sample failing traces and label them: is the generator ignoring the doc (prompt/model issue) or is the verifier too strict (false negatives)? Measure verifier precision/recall on a labelled set before changing the generator.' },
        { q: 'How would you map these spans to OpenTelemetry GenAI conventions?', a: 'Create one parent span per request and child spans per step, with attributes such as gen_ai.request.model, gen_ai.usage.input_tokens and output_tokens on model spans, plus custom attributes for retrieved doc ids and verifier verdicts.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'ai-architecture-fundamentals-iq-1',
      difficulty: 'hard',
      question: 'Your company has 30 teams calling LLM providers directly. The CFO wants spend by team, security wants PII controls, and SRE wants fewer outages. Propose an architecture.',
      whatInterviewerLooksFor: [
        'Identifies an LLM gateway as the single policy point',
        'Virtual keys and metadata-based cost attribution',
        'Fail-open vs fail-closed reasoning per control',
        'Addresses gateway SPOF and latency overhead',
        'Incremental migration plan',
      ],
      modelAnswer: `**Core idea:** put an **LLM gateway** (LiteLLM/Portkey/Kong-style, or in-house) in front of every provider and make it the only path out.

**Components**
- **Virtual keys** per team/feature, mapped to provider keys held only by the gateway (secrets manager).
- **Quotas and budgets**: TPM/RPM limits and monthly $ budgets per key, with alerts at 80% and a budget-fallback to a cheaper model at 100%.
- **Routing**: logical aliases (fast-chat, smart-chat) → providers, with retries, timeouts, circuit breakers and cross-provider fallbacks — this is what reduces outages.
- **PII**: detection/redaction (regex + NER) on prompts for keys flagged sensitive; **fail closed** if the redactor is down.
- **Logging**: every call records team, feature, model, tokens, cost, latency, trace id → warehouse → spend dashboards for the CFO.

**Reliability of the gateway itself**: stateless replicas across zones, state in Redis/Postgres, streaming pass-through, p99 overhead budget ~15 ms, load-tested; break-glass path for tier-0 apps.

**Migration**: publish an SDK wrapper, accept legacy model names mapped to aliases, migrate teams over a quarter, then block direct egress to provider domains at the network layer.

**Metrics of success**: 100% of spend attributed, zero raw PII to external providers in audits, provider-incident user impact reduced by fallback hit rate.`,
      followUps: [
        { q: 'A team says the gateway adds 40 ms. How do you investigate?', a: 'Trace gateway spans: auth lookup, Redis quota calls, PII redaction and connection setup to the provider. Typical fixes are in-memory key caches, pipelined Redis calls, connection pooling/HTTP2 to providers, and running PII only for flagged keys.' },
        { q: 'Should the gateway also do semantic caching?', a: 'Optionally, per key and opt-in: caching must be scoped by tenant and prompt version, with similarity thresholds tuned per use case. It is risky for personalised or time-sensitive answers, so default it off and enable it for FAQ-like traffic.' },
      ],
      pitfalls: [
        'Proposing a gateway without addressing it as a SPOF',
        'Treating PII redaction as fail-open',
        'Relying on provider invoices for per-team attribution',
      ],
    },
    {
      id: 'ai-architecture-fundamentals-iq-2',
      difficulty: 'medium',
      question: 'Explain what a compound AI system is and when you would choose one over simply upgrading to a bigger model.',
      whatInterviewerLooksFor: [
        'Correct definition (multiple interacting components)',
        'Concrete examples: RAG, sampling + verification, routing',
        'Evidence-driven decision using evals and cost',
        'Awareness of added latency and complexity',
      ],
      modelAnswer: `A **compound AI system** solves a task with **multiple interacting components** — several model calls, retrievers, tools, verifiers, routers — instead of one monolithic model call. The framing comes from BAIR's 2024 post by Zaharia, Khattab and colleagues, which observed that leading results (AlphaCode 2, AlphaGeometry, production RAG apps) come from systems, not single models.

**Choose compound when:**
- The gap is **knowledge**, not reasoning → retrieval or tools (a bigger model still does not know your private data).
- Errors are **checkable** → generate + verify (schemas, unit tests, rules) often beats a bigger model at lower cost.
- Traffic is **mixed difficulty** → a router sends 70–80% of easy queries to a small model.
- You need **control and auditability** → explicit components are inspectable.

**Choose the bigger model when** the failures are genuine reasoning or language-quality gaps, there is nothing to retrieve or verify, and latency budgets cannot absorb extra hops.

**Decision process:** build an eval set, run the single-call baseline, categorise errors, then add the one component that targets the largest error bucket and re-measure quality, p95 latency and cost per request. Stop when the marginal component no longer pays for itself.`,
      followUps: [
        { q: 'How do you optimise prompts across a 4-step pipeline?', a: 'Optimise against the end-to-end metric with a framework like DSPy that tunes instructions and few-shot examples per module, while also tracking per-step metrics to detect regressions hidden by an improving total.' },
        { q: 'What is the reliability maths of chaining components?', a: 'Success probabilities multiply when steps are independent: three 95% steps give about 86%. That is why you add verification and retries at weak links rather than just adding steps.' },
      ],
      pitfalls: [
        'Defining compound AI as "using multiple providers"',
        'Adding components without measuring each one',
        'Ignoring latency stacking',
      ],
    },
    {
      id: 'ai-architecture-fundamentals-iq-3',
      difficulty: 'hard',
      question: 'A layered GenAI platform leaks a confidential board memo into an intern\'s chat answer. Walk through where the layering failed and how to fix it.',
      context: 'Retrieval runs behind an internal API; the chat app calls it with a service account token.',
      whatInterviewerLooksFor: [
        'Identifies identity propagation failure (service account vs end user)',
        'ACL enforcement inside the retrieval layer, pre-filter not post-filter',
        'Ingestion-time ACL sync and freshness',
        'Defence in depth plus audit',
      ],
      modelAnswer: `**Root cause:** the experience layer authenticated the intern, but the orchestration layer called retrieval with a **service account**, so the knowledge layer searched everything. Identity was dropped at a layer boundary.

**Fixes, layer by layer**
1. **Identity propagation**: orchestration passes an on-behalf-of token (or signed UserCtx: user id, groups, tenant) on every retrieval and tool call. The retrieval API rejects calls without it.
2. **ACL enforcement in the knowledge layer**: store ACL metadata (allowed groups/users) on every chunk at ingestion; apply it as a **pre-filter** in the vector/BM25 query, not by post-filtering top-k (post-filtering can still leak through summaries and also hurts recall).
3. **ACL freshness**: sync permission changes from the source (Drive/SharePoint/Confluence) via webhooks or frequent incremental jobs; a revoked permission must propagate within minutes.
4. **Defence in depth**: output check that every cited doc id is in the user's permitted set; sensitivity labels (e.g. "board-confidential") excluded from general assistants entirely.
5. **Governance layer**: audit log of user → retrieved doc ids, alerting on access to high-sensitivity labels, plus a red-team test in CI ("intern asks for board memo").

**Process**: incident review, rotate any exposed content, and add the scenario to the regression eval suite.`,
      followUps: [
        { q: 'Why is post-filtering top-k results insufficient?', a: 'If you retrieve top 10 and then remove unauthorised ones, you may end up with zero relevant chunks (recall loss) and any intermediate step that saw the unfiltered list (reranker logs, caching) can leak. Pre-filtering keeps unauthorised data out of the pipeline entirely.' },
        { q: 'How do you handle a group with 50,000 members in filters?', a: 'Filter on group ids rather than expanding to user ids: store allowed group ids per chunk and pass the user\'s group memberships (resolved from the IdP and cached) as the filter set.' },
      ],
      pitfalls: [
        'Blaming the model or adding a "do not reveal" prompt instruction',
        'Post-filtering instead of pre-filtering',
        'Ignoring ACL sync latency',
      ],
    },
    {
      id: 'ai-architecture-fundamentals-iq-4',
      difficulty: 'expert',
      question: 'Design the failure behaviour of an LLM gateway: which features fail open, which fail closed, and how do you keep the gateway from becoming the outage?',
      whatInterviewerLooksFor: [
        'Explicit fail-open/closed classification with reasoning',
        'Stateless scaling and multi-zone deployment',
        'Circuit breakers and fallbacks per provider',
        'Degraded modes and break-glass with audit',
      ],
      modelAnswer: `**Classify every gateway feature by what failure costs:**

| Feature | On dependency failure | Why |
|---|---|---|
| Auth (key lookup) | closed, but cache keys locally for minutes | unauthenticated calls are a security breach |
| PII redaction | closed for sensitive keys | raw PII to a provider is a compliance breach |
| Budgets/quotas | open briefly with local approximate counters | brief overspend beats a total outage |
| Semantic cache | open (skip cache) | pure optimisation |
| Logging/metrics | open, buffer to local disk/queue | do not drop user traffic for telemetry |
| Content filters | depends on the app's risk tier | configure per key |

**Keeping the gateway up:**
- Stateless replicas in ≥3 zones; Redis/Postgres replicated; config cached in-process so a control-plane outage does not stop the data plane.
- Per-provider **circuit breakers** (open after e.g. 50% errors over 20 calls) and ordered fallbacks across providers/regions.
- Request **timeouts** and max concurrency per key (bulkheads) so one team's runaway job cannot exhaust connection pools.
- **Streaming pass-through** to avoid memory blow-ups.
- Canary config rollouts with automatic rollback on error-rate increase.
- **Break-glass**: tier-0 services can use a pre-approved direct client that still logs asynchronously.

**Test it**: chaos drills (kill Redis, block a provider, slow PII service) with expected behaviour asserted.`,
      followUps: [
        { q: 'Redis is down: how do quotas behave?', a: 'Each replica switches to local in-memory counters set to limit divided by replica count, which approximately enforces the quota, logs a degraded-mode alert, and reconciles spend from logs once Redis recovers.' },
        { q: 'How do you roll out a routing change safely?', a: 'Config as code with review, then canary: apply the new route to 5% of traffic or one team, compare error rate, latency and eval scores, and auto-revert on regression before ramping up.' },
      ],
      pitfalls: [
        'Making everything fail closed (total outage on telemetry failures)',
        'Making everything fail open (silent PII leaks)',
        'No bulkheads between tenants',
      ],
    },
    {
      id: 'ai-architecture-fundamentals-iq-5',
      difficulty: 'medium',
      question: 'You are reviewing a prototype where the React frontend calls the LLM provider directly with an API key bundled in the JavaScript. List the architectural problems and the target design.',
      whatInterviewerLooksFor: [
        'Secret exposure and abuse risk',
        'No server-side orchestration, guardrails or retrieval with ACLs',
        'Missing observability and cost control',
        'Concrete target layering',
      ],
      modelAnswer: `**Problems**
1. **Leaked secret**: any user can extract the key from the bundle and run unlimited calls on your bill.
2. **No trust boundary**: the prompt is assembled client-side, so users can rewrite the system prompt, remove guardrails or request any model.
3. **No private context safely**: retrieval would need to happen in the browser, exposing documents and bypassing ACLs.
4. **No governance**: no rate limits per user, no budgets, no PII controls, no audit trail.
5. **No observability**: no traces, token counts or latency data; no way to run evals on real traffic.
6. **Vendor lock-in** in UI code.

**Target design**
- **Experience**: React streams from your backend via SSE; auth with session/JWT.
- **Orchestration (backend)**: owns versioned prompt templates, tool loop and output validation; the client sends only user intent.
- **Knowledge**: retrieval service with ACL pre-filters using the user's identity.
- **Model access**: backend calls an LLM gateway with a server-side virtual key, logical model alias, per-user rate limits and budgets.
- **Ops**: OpenTelemetry traces, cost per user/feature, feedback buttons wired to an eval dataset.

**Immediate action**: rotate the leaked key, and add a provider-side spending cap while the backend is built.`,
      followUps: [
        { q: 'Can a short-lived token make direct browser calls acceptable?', a: 'Ephemeral, narrowly scoped tokens (as used for some realtime voice APIs) reduce the blast radius, but you still need a backend to mint them, enforce per-user limits and keep prompt and tool control server-side.' },
        { q: 'How do you rate-limit fairly per user?', a: 'Use a token bucket keyed by user id at the backend or gateway, sized in tokens rather than requests, with a higher tier for paid plans and a global cap to protect the budget.' },
      ],
      pitfalls: [
        'Only saying "move the key to .env" (still shipped to the browser)',
        'Forgetting prompt tampering',
        'Not rotating the leaked key',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'ai-architecture-fundamentals-est-1',
      question: 'Size an internal LLM gateway for 200 teams: peak QPS, number of gateway replicas, and log storage per year.',
      assumptions: [
        '200 teams, average 25K LLM calls per team per day',
        'Peak traffic = 4× the daily average rate',
        'One gateway replica (2 vCPU) sustains ~400 concurrent streams; average call duration 4 s',
        'Each log row ≈ 1.5 KB (metadata, token counts, cost; prompts not stored)',
        'Target headroom: run at ≤ 60% of capacity, N+2 replicas across 3 zones',
      ],
      steps: [
        { label: 'Daily calls', calc: '200 × 25,000 = 5,000,000 calls/day' },
        { label: 'Average QPS', calc: '5,000,000 / 86,400 ≈ 58 QPS' },
        { label: 'Peak QPS', calc: '58 × 4 ≈ 232 QPS' },
        { label: 'Peak concurrency (Little\'s law)', calc: '232 QPS × 4 s ≈ 928 concurrent streams' },
        { label: 'Replicas', calc: '928 / (400 × 0.6) ≈ 3.9 → 4, plus N+2 → 6 replicas (2 per zone)' },
        { label: 'Log storage', calc: '5M × 1.5 KB = 7.5 GB/day × 365 ≈ 2.7 TB/year (≈ 0.5 TB compressed columnar)' },
      ],
      answer: '~230 peak QPS, ~930 concurrent streams, 6 small replicas across 3 zones, ~2.7 TB/year raw logs.',
      insight: 'Gateway compute is cheap; concurrency (long-lived streams), not QPS, is the sizing driver — and logs grow into terabytes, so store metadata in columnar storage and sample full prompts only where policy allows.',
      followUps: [
        { q: 'What if average call duration doubles to 8 s because of reasoning models?', a: 'Concurrency doubles to ~1,860 streams, so you need about 8 replicas plus N+2 = 10. Connection limits to providers and file-descriptor limits become the next constraints to check.' },
      ],
    },
    {
      id: 'ai-architecture-fundamentals-est-2',
      question: 'A compound pipeline (router → retrieval → generator → verifier) replaces a single frontier call. Estimate cost per 1K requests and p50 latency for both designs.',
      assumptions: [
        'Illustrative prices: frontier $3 in / $15 out per 1M tokens; small model $0.25 in / $1 out per 1M',
        'Single call: 6,000 input tokens (stuffed docs), 400 output, latency 4.0 s',
        'Compound: router small model 300 in / 5 out, 150 ms; retrieval 120 ms',
        'Generator frontier with 2,500 in / 400 out, 2.6 s; verifier small model 2,900 in / 50 out, 400 ms',
        '70% of requests are routed to the small model as generator instead (2,500 in / 400 out, 1.2 s)',
      ],
      steps: [
        { label: 'Single call cost', calc: '6,000 × $3/1M + 400 × $15/1M = $0.018 + $0.006 = $0.024 → $24 per 1K' },
        { label: 'Router + verifier cost', calc: 'router 300×0.25/1M + 5×1/1M ≈ $0.00008; verifier 2,900×0.25/1M + 50×1/1M ≈ $0.00078 → ≈ $0.00086' },
        { label: 'Generator cost (blended)', calc: 'frontier 2,500×3/1M + 400×15/1M = $0.0135; small 2,500×0.25/1M + 400×1/1M = $0.001; blend 0.3×0.0135 + 0.7×0.001 = $0.00475' },
        { label: 'Compound cost', calc: '$0.00475 + $0.00086 ≈ $0.0056 → ≈ $5.6 per 1K (≈ 4.3× cheaper)' },
        { label: 'Compound p50 latency', calc: 'small path: 0.15 + 0.12 + 1.2 + 0.4 = 1.87 s; frontier path: 0.15 + 0.12 + 2.6 + 0.4 = 3.27 s → p50 ≈ 1.9 s vs 4.0 s' },
      ],
      answer: 'Compound ≈ $5.6 per 1K requests vs $24, and p50 ≈ 1.9 s vs 4.0 s, as long as routing keeps quality on the 70% easy path.',
      insight: 'Most savings come from routing and from trimming context with retrieval, not from the verifier; the verifier is cheap insurance. The design only holds if evals confirm the small model is good enough for the routed slice.',
      followUps: [
        { q: 'What if the verifier rejects 15% of answers and triggers a frontier retry?', a: 'Add 0.15 × $0.0135 ≈ $0.002 per request (≈ $7.6 per 1K total) and about 2.6 s extra on those requests, which pushes p95 latency up; consider streaming partial output or a cheaper repair prompt.' },
      ],
    },
  ],
  test: [
    {
      id: 'ai-architecture-fundamentals-mcq-01',
      difficulty: 'medium',
      question: 'In a five-layer GenAI platform, where should end-user document permissions be enforced so that no orchestration bug or prompt injection can bypass them?',
      options: [
        'In the experience layer, by hiding sensitive answers in the UI',
        'In the knowledge/retrieval layer, as a pre-filter using the propagated end-user identity',
        'In the model layer, via a system prompt telling the model not to reveal secrets',
        'In the platform layer, by reviewing audit logs weekly',
      ],
      correct: [1],
      explanation: 'Only enforcement inside retrieval keeps unauthorised content out of the context entirely. UI hiding and system prompts act after the data has already reached the model (and prompts can be overridden by injection); weekly audits detect leaks but do not prevent them.',
      followUps: [{ q: 'What must the orchestration layer pass to make this work?', a: 'A verifiable end-user context (on-behalf-of token or signed user id, groups and tenant) on every retrieval and tool call, never a shared service-account identity.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-02',
      difficulty: 'hard',
      question: 'Which statements about compound AI systems are accurate? (Select ALL that apply)',
      options: [
        'They combine multiple interacting components such as model calls, retrievers, tools and verifiers',
        'Sampling several candidates and filtering with a verifier can beat a larger single model on checkable tasks',
        'They always reduce latency compared with a single model call',
        'They should be evaluated end to end as well as per component',
      ],
      correct: [0, 1, 3],
      explanation: 'The BAIR definition is about multiple interacting components; generate-and-verify is a canonical win (AlphaCode 2 style), and both end-to-end and per-component evaluation are needed. Latency usually increases with extra hops unless steps run in parallel or routing sends traffic to faster models, so "always reduce latency" is false.',
      followUps: [{ q: 'When can a compound system be faster than a single call?', a: 'When a router sends most traffic to a small fast model, or retrieval trims a huge stuffed context down to a few relevant chunks, reducing prefill time more than the extra hops add.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-03',
      difficulty: 'hard',
      question: 'This gateway snippet enforces monthly budgets across 8 replicas. What is the main bug under load?',
      code: {
        language: 'typescript',
        code: `const spent = Number(await redis.get('spend:' + key)) || 0;
if (spent >= budget) return reply(429, 'budget exceeded');
const res = await callProvider(body);
const cost = priceOf(res.usage);
await redis.set('spend:' + key, String(spent + cost));
return reply(200, res);`,
      },
      options: [
        'Read-modify-write race: concurrent requests overwrite each other\'s spend, undercounting cost',
        'Redis GET is too slow for a gateway hot path',
        'The 429 status code is wrong for budget errors; it must be 402',
        'priceOf should be computed before calling the provider',
      ],
      correct: [0],
      explanation: 'Two replicas read the same spent value, both add their own cost and the last SET wins, so spend is undercounted and budgets overshoot. Use atomic INCRBYFLOAT (optionally pre-reserving estimated cost). Redis latency is sub-millisecond, 429 is a common and acceptable choice, and exact cost needs actual usage after the call.',
      followUps: [{ q: 'How do you stop a single long request from blowing far past the budget?', a: 'Pre-reserve an estimate (input tokens plus max_tokens times price) atomically before the call, reject if it would exceed the budget, then reconcile with actual usage after the response.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-04',
      difficulty: 'medium',
      question: 'A product team asks why they should call a logical alias like "smart-chat" through the gateway instead of a concrete provider model id. What is the strongest reason?',
      options: [
        'Aliases produce shorter request payloads',
        'Routing, fallbacks and model upgrades become config changes owned centrally, with no application redeploy',
        'Providers charge less for aliased requests',
        'Aliases disable streaming, which lowers cost',
      ],
      correct: [1],
      explanation: 'Indirection is the point: the platform team can switch providers, run canaries and add fallbacks behind the alias. Payload size and provider pricing are unaffected, and aliases have nothing to do with streaming.',
      followUps: [{ q: 'What is the risk of aliases?', a: 'Behaviour can change under a team without them noticing; mitigate with alias versioning or pinned aliases, change announcements and per-team eval gates before a route change is rolled out.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-05',
      difficulty: 'expert',
      question: 'Which gateway features should typically FAIL OPEN when their backing dependency is down? (Select ALL that apply)',
      options: [
        'Semantic cache lookup',
        'Usage logging to the analytics pipeline (buffer locally instead)',
        'PII redaction for keys tagged as handling customer data',
        'Virtual-key authentication',
      ],
      correct: [0, 1],
      explanation: 'Caching and telemetry are optimisations, so skipping them preserves availability with no safety cost (logs can be buffered). PII redaction and authentication are security controls: failing open would send raw PII to providers or allow anonymous use, so they fail closed (auth may use a short-lived local key cache).',
      followUps: [{ q: 'How do you make auth resilient without failing open?', a: 'Cache validated key metadata in-process with a short TTL and a revocation channel, so a database blip does not reject known keys but unknown keys are still refused.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-06',
      difficulty: 'hard',
      question: 'Your gateway buffers the full provider response before returning it. Users complain the chat "feels slow" although total latency is unchanged. What happened?',
      options: [
        'Buffering increased output token count',
        'Buffering destroyed time-to-first-token: users now wait for the whole generation before seeing anything',
        'Buffering disabled prompt caching at the provider',
        'Buffering forced a fallback to a slower model',
      ],
      correct: [1],
      explanation: 'Perceived latency is driven by TTFT. With SSE pass-through users see tokens after ~0.5 s; with buffering they wait the full 5–10 s. Buffering does not change token counts, provider-side caching or routing decisions.',
      followUps: [{ q: 'How can the gateway still apply output filtering while streaming?', a: 'Run incremental checks on a sliding window of streamed text, hold back a small buffer (for example one sentence), and terminate the stream with a safe message if a violation is detected.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-07',
      difficulty: 'hard',
      question: 'What is wrong with this layered design?',
      code: {
        language: 'typescript',
        code: `// orchestration layer
const SERVICE_TOKEN = process.env.RETRIEVAL_SVC_TOKEN!;
export async function answer(user: User, q: string) {
  const docs = await fetch(RETRIEVAL_URL + '/search', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + SERVICE_TOKEN },
    body: JSON.stringify({ q, k: 8 }),
  }).then((r) => r.json());
  return llm(user, q, docs);
}`,
      },
      options: [
        'k = 8 is too many chunks',
        'Retrieval runs as a service account without the end user\'s identity, so ACLs cannot be enforced',
        'fetch should be replaced with gRPC',
        'The LLM should be called before retrieval',
      ],
      correct: [1],
      explanation: 'The end user is dropped at the layer boundary; retrieval sees only the service identity and can return any document. k = 8 is a tuning choice, transport protocol is irrelevant to correctness, and retrieval must come before generation in RAG.',
      followUps: [{ q: 'What would you send instead?', a: 'An on-behalf-of token or signed user context (user id, groups, tenant) alongside the service credential, which the retrieval service verifies and turns into a metadata pre-filter.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-08',
      difficulty: 'medium',
      question: 'Which responsibilities belong in an LLM gateway rather than in each application? (Select ALL that apply)',
      options: [
        'Per-team token quotas and dollar budgets',
        'Provider failover and retries behind a model alias',
        'Writing the domain-specific prompt for the refund workflow',
        'Central logging of tokens, cost and latency with team metadata',
      ],
      correct: [0, 1, 3],
      explanation: 'Quotas, failover and cost logging are cross-cutting policies that every team needs identically, which is why they centralise well. The refund prompt is product logic that belongs to the orchestration layer of the owning team; centralising it would couple the gateway to business features.',
      followUps: [{ q: 'Where should prompt templates live then?', a: 'In a versioned prompt registry or config owned by the product team, loaded by their orchestration layer, with eval gates in CI before a new version is promoted.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-09',
      difficulty: 'expert',
      question: 'A three-step chain has independent per-step success rates of 97%, 94% and 92%. Leadership wants ≥ 90% end-to-end. Which single change gets closest with the least complexity?',
      options: [
        'Add a fourth step that rewrites the final answer for style',
        'Add verification + one retry on the 92% step, raising it to ~98%',
        'Replace the 97% step with a bigger model reaching 99%',
        'Run the whole chain twice and keep the longer answer',
      ],
      correct: [1],
      explanation: 'Baseline = 0.97 × 0.94 × 0.92 ≈ 0.839. Fixing the weakest link to 0.98 gives 0.97 × 0.94 × 0.98 ≈ 0.894; improving the strongest step to 0.99 gives only ≈ 0.856. An extra rewrite step can only lower reliability, and "keep the longer answer" is not a quality signal.',
      followUps: [{ q: 'What else would push it over 90%?', a: 'Also improve the 94% step (for example better retrieval or a reranker); at 0.97 × 0.97 × 0.98 the pipeline reaches about 0.92.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-10',
      difficulty: 'hard',
      question: 'Review this request handler. Which issues would block it from production? (Select ALL that apply)',
      code: {
        language: 'typescript',
        code: `export async function chat(req: Req) {
  const client = new OpenAI({ apiKey: 'sk-live-abc' });
  const r = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'system', content: req.body.system }, { role: 'user', content: req.body.msg }],
  });
  return JSON.parse(r.choices[0].message.content!);
}`,
      },
      options: [
        'Hard-coded live secret and provider model id in code',
        'The system prompt is supplied by the client, so users can override all instructions',
        'Unguarded JSON.parse on free-text model output',
        'Using the messages array instead of a single prompt string',
      ],
      correct: [0, 1, 2],
      explanation: 'Secrets and model ids belong in a secret store and config or gateway; a client-controlled system prompt removes the trust boundary; JSON.parse on unconstrained output will throw on prose. The messages array is the correct Chat Completions shape.',
      followUps: [{ q: 'How do you get reliable JSON?', a: 'Use structured outputs or a tool schema, validate with Zod, and on failure do one repair retry with the validation error before returning a safe fallback.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-11',
      difficulty: 'medium',
      question: 'Which layer typically owns evals, prompt version history and cost dashboards?',
      options: [
        'Experience layer',
        'Knowledge/retrieval layer',
        'Platform/ops/governance layer (cross-cutting)',
        'Model provider',
      ],
      correct: [2],
      explanation: 'Evals, versioning, cost and audit are cross-cutting platform services used by every feature. The experience and retrieval layers emit data into them but do not own them, and providers only see their own usage, not your features or prompt versions.',
      followUps: [{ q: 'Why should product teams still own their eval datasets?', a: 'Only they know what good output looks like for their domain; the platform provides the harness, storage and CI gates while teams curate golden examples and thresholds.' }],
    },
    {
      id: 'ai-architecture-fundamentals-mcq-12',
      difficulty: 'hard',
      question: 'After introducing a stateless gateway with 6 replicas, p99 latency for all apps rose by 300 ms during peak. CPU is 20%. What is the most likely cause?',
      options: [
        'Model tokens per second dropped because of the gateway',
        'Connection exhaustion or no keep-alive to providers, forcing new TLS handshakes or queueing',
        'The gateway is computing embeddings for every request',
        'Replicas are too many, causing load-balancer thrash',
      ],
      correct: [1],
      explanation: 'Low CPU with added tail latency points to I/O waits: small connection pools, no HTTP keep-alive or HTTP/2, or per-request client construction causing TLS handshakes (~100–300 ms). The gateway cannot change model decode speed, embeddings would show CPU or extra calls, and more replicas do not cause thrash.',
      followUps: [{ q: 'How would you confirm it?', a: 'Break the gateway span into DNS, connect, TLS and wait phases (or check pool metrics); if connect and TLS dominate at peak, reuse clients, raise pool sizes and enable keep-alive.' }],
    },
  ],
};

export default topic;
