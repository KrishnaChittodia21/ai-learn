import type { Company, CompanyQuestion } from '../types';

// AI Architecture Challenges capstone track. "Company" is reused as a challenge CATEGORY.
export const COMPANIES: Company[] = [
  {
    id: 'rag-systems',
    name: 'RAG & Search',
    focus: 'Retrieval quality at scale: ingestion and freshness, chunking, hybrid search, reranking, ACL-aware retrieval, citations, evaluation (recall@k, groundedness) and the cost of serving answers over millions of documents.',
    interviewStyle: 'Start by pinning down corpus size, update rate, permission model and answer-quality bar. Draw ingestion and query paths separately, size the index and token costs, then go deep on retrieval quality and ACL correctness. Always close with how you evaluate and what breaks first.',
  },
  {
    id: 'agents',
    name: 'Agents & Automation',
    focus: 'Tool-using LLM systems that take actions: planning loops, tool design, sandboxes, state and memory, human-in-the-loop, multi-agent orchestration, reliability (budgets, retries, idempotency) and safety of side effects.',
    interviewStyle: 'Clarify autonomy level, allowed actions and blast radius first. Choose the simplest pattern (chain, router, single agent, orchestrator-worker) and justify it. Show the agent loop, tool contracts and stop conditions, then discuss evaluation on task success, cost per task and how a human stays in control.',
  },
  {
    id: 'platform',
    name: 'AI Platform',
    focus: 'Shared infrastructure many teams build on: LLM gateways, routing and fallbacks, quotas and budgets, caching, observability and evals, control plane vs data plane, multi-tenancy and cost attribution.',
    interviewStyle: 'Treat internal teams as customers: ask about number of teams, providers, compliance and SLOs. Present a hub-and-spoke or control/data-plane design, quantify QPS, concurrency and storage, and address the hub as a single point of failure. Highlight governance and developer experience trade-offs.',
  },
  {
    id: 'multimodal',
    name: 'Multimodal & Voice',
    focus: 'Pipelines over audio, images and documents: streaming speech-to-text and text-to-speech, latency budgets measured in milliseconds, OCR and layout understanding, vision-language models and human review for low-confidence outputs.',
    interviewStyle: 'Write the latency or accuracy budget per stage before choosing models. Discuss streaming, turn-taking or document layout explicitly, size GPU and per-unit costs, and show how confidence scores route work to humans. Mention fallbacks when a modality model fails.',
  },
  {
    id: 'safety',
    name: 'Safety & Governance',
    focus: 'Systems where correctness and policy matter most: content moderation, compliance assistants, guardrails, audit trails, explainability, human review queues and regulatory constraints.',
    interviewStyle: 'Clarify the policy, the cost of false positives versus false negatives and the audit requirements. Design layered defences (cheap filters → classifiers → LLM judges → humans), show traceability from answer to source, and explain how policies are versioned, evaluated and rolled out.',
  },
];

export const COMPANY_QUESTIONS: CompanyQuestion[] = [
  {
    id: 'arch-support-rag-chatbot',
    company: 'rag-systems',
    title: 'Customer-support RAG chatbot over 10M documents',
    frequency: 'very-high',
    level: 'Senior',
    prompt: 'Design a customer-support chatbot for a large SaaS company that answers questions from 10M help-center articles, release notes, internal runbooks and resolved tickets, with citations, escalation to human agents and support for 2M conversations per month.',
    clarifyingQuestions: [
      'Which sources are customer-visible versus internal-only (runbooks, tickets), and must the bot ever use internal sources for customers?',
      'How fresh must answers be after a doc or release note changes (minutes, hours)?',
      'Should the bot take actions (refunds, password resets) or only answer questions?',
      'Which languages and channels (web widget, email, in-app) are required?',
      'What is the target deflection rate and the acceptable wrong-answer rate?',
      'Is there per-customer context (plan, product version, region) the answer depends on?',
    ],
    functional: [
      'Answer questions grounded in the knowledge base with inline citations',
      'Use customer context (plan, product version) to filter and personalise answers',
      'Escalate to a human with a conversation summary when confidence is low or the user asks',
      'Collect feedback (thumbs, resolved/not) and feed it into evaluation',
      'Keep the index in sync with doc changes within 15 minutes',
    ],
    nonFunctional: [
      'Time to first token p95 < 1.5 s; full answer p95 < 6 s',
      'Groundedness ≥ 95% on the golden set; zero internal-only content shown to customers',
      '99.9% availability with graceful degradation to search results if the LLM is down',
      'Cost under $0.02 per conversation on average',
      'PII in conversations redacted from logs and never sent to unapproved providers',
    ],
    estimation: [
      { label: 'Index size', calc: '10M docs × ~4 chunks = 40M chunks; 1024-d int8 → 40M × 1 KB = 41 GB × 1.5 HNSW ≈ 61 GB per replica' },
      { label: 'Traffic', calc: '2M conversations/month × 4 turns = 8M turns/month ≈ 267K/day ≈ 3.1 QPS avg, ~12 QPS peak' },
      { label: 'Tokens per turn', calc: 'system 800 + history 1,200 + 6 chunks × 350 = 2,100 → ~4,100 input, 300 output' },
      { label: 'LLM cost', calc: '70% small model ($0.25/$1 per 1M): 4,100×0.25/1M + 300×1/1M ≈ $0.0013; 30% frontier ($3/$15): ≈ $0.0168; blend ≈ $0.0060/turn × 4 = $0.024/conversation (illustrative)' },
      { label: 'With prompt caching', calc: 'static 800-token system prompt cached at ~10% price and ~30% semantic-cache hits on FAQs → ≈ $0.016/conversation, under budget' },
    ],
    highLevelDesign: `**Two paths: ingestion and conversation.**

**Ingestion (async, queue-driven).** Connectors pull help-center articles, release notes, runbooks and resolved tickets through change feeds. Each document passes parsing (HTML/markdown/PDF), cleaning, structure-aware chunking (300–500 tokens with headings as breadcrumbs), contextual enrichment, and batch embedding. Metadata on every chunk: source, **audience (public/internal)**, product, version range, language, updated_at, and doc status. Resolved tickets go through a PII scrubber and a quality filter (only tickets marked resolved with high CSAT) before indexing. The index is hybrid (BM25 + HNSW vectors) behind a blue/green alias.

**Conversation path.** The chat widget streams via SSE to a **conversation orchestrator**. Each turn:
1. **Guardrail sidecar** checks input (injection, abuse, PII redaction for logs).
2. **Router** classifies intent: FAQ/how-to, account-specific (needs tools like order lookup), bug report, or "talk to a human".
3. **Query rewriting** turns the latest turn plus history into a standalone query, and adds filters from customer context (plan, product version, audience = public).
4. **Hybrid retrieval** (top 50) → **cross-encoder rerank** → top 6 chunks within a token budget.
5. Generation through the **LLM gateway** using a model alias: a small model for simple FAQ intents, a frontier model for complex troubleshooting. The prompt demands citations by chunk id and "I don't know" when context is insufficient.
6. **Groundedness check** (NLI or small judge) verifies cited claims; low confidence → offer escalation.
7. Response streamed with citations linking to the source article.

**Escalation.** A handoff service creates a ticket in the helpdesk with a summary, retrieved sources and customer context so the human does not restart the conversation.

**Platform pieces.** The gateway provides quotas, fallbacks across providers, prompt caching and logging; a semantic cache serves frequent FAQ answers keyed by (normalised query, product version, language). Observability captures traces per turn (retrieval ids, scores, model, tokens, cost) and feedback; an offline eval suite (golden Q&A, recall@k, groundedness) gates every prompt or index change.

**Degraded mode.** If the LLM path fails, return the top 3 search results as links — the bot still helps.`,
    diagram: `           INGESTION (async)                         CONVERSATION
+---------+   +-------+  +--------+  +------+
|Help ctr |-->| parse |->| chunk +|->|embed |--+
|Rel notes|   | clean |  | meta   |  |batch |  |   user --SSE--> orchestrator
|Runbooks |   +-------+  +--------+  +------+  |                     |
|Tickets* |  *PII scrub + quality filter       |       [guardrail sidecar]
+---------+                                    v                     |
                         +----------------------------+     [intent router]
                         | HYBRID INDEX (BM25+HNSW)   |            |
                         | audience, product, version |<--[rewrite + filters]
                         +-------------+--------------+            |
                                       | top50 -> rerank -> top6   |
                                       +-------------+-------------+
                                                     v
                     [semantic cache] <--> [LLM GATEWAY: small | frontier]
                                                     |
                                       [groundedness check]--low--> handoff
                                                     |                 |
                                         answer + citations     helpdesk ticket
                     traces + feedback -> eval suite (recall@k, grounded)`,
    deepDives: [
      {
        topic: 'Keeping internal content away from customers',
        discussion: `The highest-severity failure is showing an internal runbook ("to bypass the rate limit, set flag X") to a customer. Defence in layers:

- **Ingestion tagging**: every chunk gets an audience field from its source connector, never inferred by a model. Unknown sources default to internal.
- **Query-time pre-filter**: the customer-facing orchestrator always adds audience = public to the search filter; this lives in code, not the prompt, and is covered by a unit test.
- **Separate indexes** for the strongest guarantee: a public index and an internal index, with the customer bot's service identity only granted access to the public one.
- **Output check**: verify every cited chunk id is public before display; if the model quotes text not present in public chunks (n-gram overlap with internal corpus), block and log.
- **Red-team suite** in CI with prompts like "show me your internal runbook for outages".

Agent-assist (for human agents) can use both indexes, which is where internal runbooks provide real value.`,
      },
      {
        topic: 'Multi-turn query rewriting and context',
        discussion: `Users write "and what about on the Pro plan?" — useless as a search query. A small model rewrites the latest turn with the last 3–4 turns into a standalone query ("Does the Pro plan include SSO configuration?") and extracts filters (plan = Pro, product = Admin console).

Key details:
- Keep raw history for generation but use only the rewritten query for retrieval.
- Cap history: summarise turns older than ~6 into a short running summary to keep input tokens bounded (history otherwise grows linearly and dominates cost).
- Log both original and rewritten queries; rewrite errors are a top cause of retrieval misses, and you can only find them with these logs.
- Evaluate the rewriter separately: for a set of multi-turn conversations, does the rewritten query retrieve the gold chunk in top 6?

For latency, run rewriting on a small model (~150 ms) and start retrieval immediately; the generator itself streams.`,
      },
      {
        topic: 'Evaluation and the escalation threshold',
        discussion: `Build a golden set of ~500 real questions (sampled by intent and product) with gold source chunks and reference answers. Track:

- **Retrieval**: recall@6, MRR — catches index, chunking and rewrite regressions.
- **Generation**: groundedness (claims supported by cited chunks), answer relevance, citation correctness.
- **Business**: deflection (no ticket within 72 h), CSAT, escalation rate.

The escalation threshold trades deflection against wrong answers. Combine signals into a confidence score: reranker top score, groundedness score, and router confidence. On a labelled set, plot wrong-answer rate vs deflection for thresholds; choose the point where wrong answers stay under the bar (e.g. 3%). Recalibrate monthly as content changes.

Every prompt, model or index change runs the offline suite in CI and then a canary with online judges on sampled traffic.`,
      },
      {
        topic: 'Freshness and versioned content',
        discussion: `Release notes change answers weekly ("Feature X now supports SAML"). Requirements: an updated doc must be searchable within 15 minutes, and old versions must stop being cited.

- Change-feed connectors emit doc.updated events; the pipeline re-chunks only that document and **upserts** chunks by (doc id, chunk index), deleting orphaned chunks from the old version.
- Each chunk carries version ranges (applies to product v5.2+) so the retriever filters by the customer's product version.
- Semantic-cache entries store source doc ids; a doc update invalidates the dependent cache entries.
- A freshness monitor samples recently updated docs and checks they are retrievable by their title within the SLA, alerting on lag.

Full re-indexing (new embedding model) uses blue/green indexes with recall comparison before switching the alias.`,
      },
    ],
    tradeoffs: [
      'Small vs frontier model per intent: routing saves ~60–70% cost but adds a classifier and risk of misroutes on hard questions.',
      'Including resolved tickets boosts coverage of long-tail issues but brings PII and outdated workarounds; requires scrubbing and recency weighting.',
      'Semantic caching cuts cost and latency for FAQs but risks stale or mismatched answers; scope keys by product version and invalidate on doc updates.',
      'Strict groundedness checks reduce hallucinations but increase escalations and latency (+200–400 ms).',
      'Separate public/internal indexes give strong isolation at the cost of duplicate infrastructure for shared docs.',
    ],
    followUps: [
      { q: 'Deflection is high but CSAT dropped. What do you investigate?', a: 'High deflection with lower CSAT suggests confident but unhelpful or wrong answers that users abandon instead of escalating. Sample low-CSAT conversations, label failure types (wrong version, missing info, refusing too much) and check whether the escalation path is too hidden. Also measure ticket creation through other channels within 72 hours.' },
      { q: 'How would you support 12 languages?', a: 'Use a multilingual embedding model so queries match across languages, or translate queries to the corpus language before retrieval. Generate in the user’s language and keep citations to the original article. Build golden sets per top language, because quality usually drops for lower-resource languages.' },
      { q: 'The bot should now process refunds. What changes architecturally?', a: 'Add a tool with strict schemas, run it with the authenticated customer’s identity, enforce business rules (limits, eligibility) in code rather than the prompt, and require explicit user confirmation. Log every action with an idempotency key, add human approval above a threshold amount, and expand evals to cover action correctness.' },
    ],
    relatedTopics: ['rag-fundamentals', 'advanced-chunking', 'retrieval-fundamentals', 'reranking-fusion', 'query-transformation', 'rag-evaluation', 'groundedness-hallucinations', 'cost-caching', 'ai-reference-architectures'],
  },
  {
    id: 'arch-enterprise-search-acl',
    company: 'rag-systems',
    title: 'Enterprise search over Confluence, Drive and Slack with ACLs',
    frequency: 'high',
    level: 'Staff',
    prompt: 'Design an AI-powered enterprise search and answer engine for a 50,000-employee company that indexes Confluence, Google Drive, Slack and Jira, returns permission-correct results and generated answers with citations, and reflects permission changes within minutes.',
    clarifyingQuestions: [
      'How many documents and how much churn per day across sources?',
      'What is the permission model per source (groups, sharing links, private channels, page restrictions)?',
      'What is the maximum acceptable delay for a revoked permission to take effect?',
      'Are there data-residency or sensitivity labels that must exclude content from LLM processing?',
      'Is the primary UX search results, generated answers, or both?',
      'Do we need per-department customisation (boosting, synonyms)?',
    ],
    functional: [
      'Index content and permissions from 4+ SaaS sources with incremental sync',
      'Return ranked search results and a generated answer with citations, both permission-filtered',
      'Respect sensitivity labels (e.g. exclude "restricted" docs from LLM context)',
      'Support filters by source, author, date and space/channel',
      'Admin console for connector health, sync lag and access audits',
    ],
    nonFunctional: [
      'Permission revocations reflected in < 5 minutes p95; zero known ACL leaks',
      'Search results p95 < 400 ms; answer TTFT p95 < 2 s',
      'Index 200M items with daily churn of 2M',
      'Full audit trail of who retrieved which documents',
      '99.9% availability; connector failures must not corrupt the index',
    ],
    estimation: [
      { label: 'Corpus', calc: 'Slack 150M messages + 30M Drive/Confluence/Jira docs; chunk docs to ~5 chunks, group Slack into threads (~25M thread chunks) → ~175M chunks' },
      { label: 'Vector storage', calc: '175M × 768-d int8 = 134 GB × 1.5 HNSW ≈ 200 GB per replica; binary quantisation + rescoring ≈ 25 GB in RAM' },
      { label: 'Ingestion load', calc: '2M changed items/day ≈ 23/s avg; embedding 2M × 400 tokens = 800M tokens/day ≈ $16/day at $0.02/1M (illustrative)' },
      { label: 'Query load', calc: '50K employees × 6 searches/day = 300K/day ≈ 3.5 QPS avg, ~15 QPS peak; 40% request an answer → 120K LLM calls/day' },
      { label: 'Permission events', calc: 'group membership + sharing changes ≈ 200K/day ≈ 2.3/s; each may touch thousands of docs → must avoid per-doc re-writes (use group ids)' },
    ],
    highLevelDesign: `**Core principle: permissions are data, enforced inside the search engine.**

**Connectors.** One connector per source runs full crawls plus incremental syncs (webhooks/change APIs: Confluence events, Drive changes API, Slack Events API, Jira webhooks). Each emits normalised events: item.upserted, item.deleted, acl.changed, group.changed onto a durable queue (Kafka) partitioned by source item id. Connectors are isolated workers per tenant-source with their own rate limits (respecting SaaS API quotas) and checkpointing.

**Identity and ACL service.** A central **principal graph** maps users ↔ groups (from the IdP: Okta/Azure AD, plus source-specific groups such as Confluence groups and Slack channels). Every indexed item stores **ACL principals** — group ids, user ids and "domain-wide" markers — not expanded user lists. At query time, the user's principals (user id + all transitive groups, cached for ~1 minute and invalidated on group.changed) are passed as a filter. This keeps permission updates cheap: a user joining a group needs zero document rewrites.

**Processing pipeline.** Parse (HTML, Google Docs export, PDF), chunk structure-aware (Slack: thread-level), add contextual headers (space, title, channel), embed, and write to a **hybrid index** (BM25 + vector with filterable payloads). Sensitivity labels mark restricted content as search-only (snippet visible to authorised users) but excluded from LLM context.

**Query path.** User → API (SSO) → resolve principals → **query understanding** (rewrite, detect filters like "in the payments space last month") → hybrid retrieval with **ACL pre-filter** → rerank → results page immediately; the answer service builds context from top chunks (excluding restricted) and calls the **LLM gateway** for a cited answer streamed after results.

**Defence in depth.** Before rendering, a **late-binding permission check** verifies the top results against the source's live API for high-sensitivity sources (or against the freshest ACL cache), catching revocations not yet propagated. All retrievals are audit-logged (user, item ids).

**Operations.** Admin console shows per-connector lag, error rates and ACL sync freshness; blue/green index rebuilds; eval set of queries per department with recall@10 and answer groundedness.`,
    diagram: `+-----------+  webhooks/   +-----------+   +----------------------------+
|Confluence |  change APIs | CONNECTOR |   | KAFKA: item.* acl.* group.*|
|Drive      |------------->| workers   |-->| partitioned by item id     |
|Slack/Jira |              | (per src) |   +------+--------------+------+
+-----------+              +-----------+          |              |
                                                  v              v
+----------+              +-----------------+ +----------+ +-----------+
| IdP/Okta |------------->| PRINCIPAL GRAPH | |parse/    | |ACL updater|
+----------+ users<->grps | user -> groups  | |chunk/emb | +-----+-----+
                          +--------+--------+ +----+-----+       |
                                   |               v             v
                                   |      +------------------------------+
                                   |      | HYBRID INDEX: BM25 + vectors |
                                   |      | payload: acl principals,     |
                                   |      | sensitivity labels           |
                                   |      +--------------+---------------+
 user --SSO--> [API] <-principals--+                     ^ ACL pre-filter
                 |                                       |
                 v                                       |
        [rewrite] -> [retrieve + rerank] ----------------+
                              |
                [late ACL check] -> [LLM GATEWAY] -> cited answer
                audit log: user -> item ids`,
    deepDives: [
      {
        topic: 'ACL modelling without per-document fan-out',
        discussion: `Naively storing expanded user lists per document explodes: one group change (5,000 members) touching 100K docs means 500M updates. Instead:

- Store **principals** on each item: a small set of group ids, user ids and special markers (anyone-in-domain, anyone-with-link). Typical items have under 20 principals.
- At query time compute the user's principal set: user id + transitive group closure from the principal graph (cached per user ~60 s). A typical employee has 50–300 group memberships.
- Index principals as a keyword payload and filter with "any of" semantics inside the ANN search (Qdrant/Elasticsearch/OpenSearch support filtered vector search).
- Group membership changes update only the principal graph; document ACL changes (re-sharing) update only that item's principal list.

Edge cases: Drive "anyone with the link" should not make docs searchable to everyone — treat as accessible only to users who have opened it (from activity logs) or exclude. Slack private channels map to channel-membership principals.`,
      },
      {
        topic: 'Revocation latency under 5 minutes',
        discussion: `Revocation paths: user removed from a group, doc unshared, channel made private, employee offboarded.

- **Event-driven**: IdP and source webhooks produce acl.changed and group.changed events, processed with priority over content updates (separate high-priority Kafka topic and consumer group).
- **Principal cache invalidation**: group.changed invalidates cached principal sets for affected users immediately.
- **Polling backstop**: some sources lack reliable webhooks; run incremental permission scans every few minutes for recently modified items and a slower full ACL reconciliation nightly.
- **Late-binding check** for the top ~10 results on sensitive sources: call the source permission API (with caching) before showing. This covers any lag in the index at the cost of ~50–150 ms.
- **Offboarding**: a disabled IdP account fails authentication outright — the strongest and fastest control.

Measure it: synthetic probes revoke access to a canary doc every 10 minutes and time until it disappears from results.`,
      },
      {
        topic: 'Ranking across heterogeneous sources',
        discussion: `Slack messages, Jira tickets and Confluence pages have very different lengths and value. Approaches:

- **Hybrid retrieval with RRF** to merge BM25 and vector lists; BM25 handles exact identifiers (ticket keys, error codes).
- **Cross-encoder reranker** on top 50–100 candidates, with features appended: source type, recency, author authority, engagement (views, reactions), and whether the user is in the space/channel.
- **Learning-to-rank** later, trained on click and dwell data, with position-bias correction.
- **Diversity**: cap results per source/thread so 8 Slack messages from one thread do not flood the page.

For generated answers prefer authoritative sources (Confluence pages over Slack chatter) unless the question is about a recent discussion; include dates in citations so users judge staleness.

Evaluate ranking per department with NDCG@10 on judged queries, because a ranking that suits engineers (Jira-heavy results) may bury the policy pages HR users need.`,
      },
    ],
    tradeoffs: [
      'Principal-based ACLs vs expanded user lists: far cheaper updates, but query-time group resolution adds a cache dependency.',
      'Late-binding permission checks give near-zero leak risk at the cost of latency and source API quota usage.',
      'Excluding restricted docs from LLM context protects data but makes answers incomplete for authorised users; show search snippets instead.',
      'Binary quantisation shrinks memory 32× but needs rescoring to recover recall.',
      'Indexing Slack improves recall of tribal knowledge but adds noise and privacy concerns; thread-level chunks and channel opt-outs help.',
    ],
    followUps: [
      { q: 'A department wants their HR space excluded from AI answers but still searchable. How?', a: 'Apply a sensitivity label at the space level during ingestion, marking chunks as search-only. The answer service filters them out of LLM context while the results page still shows title and snippet to authorised users. Audit both paths and make the label manageable from the admin console.' },
      { q: 'How do you evaluate permission correctness at scale?', a: 'Create synthetic users with known group memberships and seeded documents with known ACLs, then run automated queries asserting that each user sees exactly the allowed set. Run this in CI and continuously in production, and add honeytoken documents that alert if they ever appear for the wrong principal.' },
      { q: 'What happens when a connector bug deletes half the Confluence index?', a: 'Index writes go through the pipeline with sanity checks such as aborting if a sync would delete more than a set percentage of a source. Keep index snapshots and blue/green aliases so you can roll back to the last good snapshot, then replay events from Kafka retention.' },
    ],
    relatedTopics: ['ai-applications', 'vector-databases', 'retrieval-fundamentals', 'reranking-fusion', 'data-pipelines-indexing', 'privacy-guardrails', 'ai-reference-architectures', 'ann-search'],
  },
  {
    id: 'arch-coding-agent',
    company: 'agents',
    title: 'Autonomous coding agent that turns issues into pull requests',
    frequency: 'very-high',
    level: 'Staff',
    prompt: 'Design a coding agent that takes a GitHub issue for any of 3,000 internal repositories, explores the codebase, edits files, runs tests in a sandbox and opens a pull request for human review. Target 5,000 tasks per day.',
    clarifyingQuestions: [
      'What languages, build systems and repo sizes must be supported (monorepo up to how many files)?',
      'What can the agent touch: only code, or also CI config, dependencies and secrets?',
      'Is the agent fully asynchronous (issue → PR), or also interactive in the IDE?',
      'What is the acceptance bar: tests pass, reviewer merges without edits, or merged within N days?',
      'Can the sandbox access the internet or internal package registries?',
      'What is the per-task cost and time budget?',
    ],
    functional: [
      'Accept tasks from issues or a CLI with repo, branch and description',
      'Explore the repository (search, read files, symbol lookup) and plan changes',
      'Edit files and run builds, linters and tests inside an isolated sandbox',
      'Iterate on failures until tests pass or the budget is exhausted',
      'Open a PR with a summary, rationale and test evidence; respond to review comments',
    ],
    nonFunctional: [
      'Strong isolation: each task in an ephemeral microVM with no access to production or secrets',
      'Median task completion < 20 minutes; hard cap 60 minutes and a token budget per task',
      'Every action logged and replayable for audit and debugging',
      'Merge rate of agent PRs ≥ 40% on eligible issues, with zero direct pushes to protected branches',
      'Cost per task under $3 on average',
    ],
    estimation: [
      { label: 'Task volume', calc: '5,000 tasks/day ≈ 3.5 tasks/min avg; peak 3× ≈ 10/min; avg duration 15 min → ~150 concurrent sandboxes at peak' },
      { label: 'Tokens per task', calc: '~40 agent steps × (25K context in + 800 out) = 1M input + 32K output tokens (context re-read each step)' },
      { label: 'Prompt caching', calc: 'stable prefix (system + tools + repo map ≈ 15K) cached at ~10% price → effective input ≈ 15K×0.1 + 10K = 11.5K per step → 460K effective input/task' },
      { label: 'Cost per task', calc: '460K × $3/1M + 32K × $15/1M = $1.38 + $0.48 ≈ $1.86 (illustrative frontier prices)' },
      { label: 'Sandbox compute', calc: '150 concurrent × 4 vCPU = 600 vCPU at peak; 5,000 × 15 min = 1,250 sandbox-hours/day' },
    ],
    highLevelDesign: `**Shape: a task queue feeding agent workers, each owning one sandbox; a tool layer mediates everything the model can do.**

**Intake.** A webhook from the issue tracker (label "agent-ok") or CLI creates a task record (repo, base commit, description, budget) in Postgres and enqueues it. A **router** first classifies eligibility: well-scoped bug fixes, small features, dependency bumps and test additions are accepted; vague or cross-repo tasks are bounced back with clarifying questions.

**Sandbox.** Each task gets an **ephemeral microVM** (Firecracker/gVisor) built from a per-repo image with toolchains and cached dependencies. The repo is cloned at the base commit. Network egress is restricted to internal package mirrors; no production credentials; CPU/memory/time limits. Snapshots allow resuming after worker crashes.

**Agent loop (single agent, ReAct-style).** The orchestrator runs a loop: model → tool calls → observations, with tools:
- search_code (ripgrep + semantic index over symbols), read_file (with line ranges), list_dir
- edit_file (apply a diff or exact string replacement; rejects ambiguous edits)
- run_command (allow-listed: build, test, lint; output truncated with head/tail)
- git_diff, submit_pr

A **repo map** (tree + key symbols, ~10K tokens) is the stable prompt prefix for caching. Context management: summarise old tool outputs, keep the latest diff and failing test output in full.

**Verification.** Before submit_pr, the harness itself (not the model) runs the repo's test suite and linters; failures are fed back. PR text includes the plan, the diff summary and test results. A human reviewer approves — the agent cannot merge.

**Review loop.** Review comments create follow-up tasks on the same branch with the comment thread as context.

**Platform.** All model calls go through the **LLM gateway** (budgets per team, fallbacks). Every step is traced (prompt hash, tool call, output, tokens) for replay. Evals: an internal benchmark of 300 historical issues with their merged fixes (SWE-bench style) gates every model, prompt or tool change.`,
    diagram: `issue (label agent-ok) / CLI
        |
        v
+---------------+   +-------------+   +--------------------------------+
| TASK SERVICE  |-->| eligibility |-->| QUEUE (priority, per-team cap) |
| Postgres      |   | router      |   +----------------+---------------+
+---------------+   +-------------+                    |
                                                       v
            +---------------- AGENT WORKER (xN) --------------------+
            |  loop: LLM --> tool call --> observation --> LLM     |
            |  budget: steps, tokens, wall-clock                   |
            +----+---------------------------------------+---------+
                 | tools (mediated, logged)              | model calls
                 v                                       v
      +---------------------------+            +------------------+
      | SANDBOX microVM (per task)|            | LLM GATEWAY      |
      | repo@base, toolchain,     |            | caching, budgets |
      | egress: pkg mirror only   |            +------------------+
      +-------------+-------------+
                    | harness runs tests + lint
                    v
              [PR opened] --> human review --> comments --> follow-up task
       traces --> replay viewer; eval suite (300 historical issues)`,
    deepDives: [
      {
        topic: 'Tool design for reliable edits',
        discussion: `Most agent failures come from tools, not the model. Lessons:

- **Edits**: prefer exact-string replacement (old text must occur exactly once) or unified diffs validated before applying. Whole-file rewrites waste tokens and silently drop code in large files. Return a clear error ("old_str matched 3 times") so the model can self-correct.
- **Reads**: support line ranges and return line numbers; cap file size and tell the model when output is truncated.
- **Commands**: allow-list build/test/lint commands; stream output into a buffer and return the head and tail (e.g. first 50 and last 150 lines) plus exit code; time out long runs.
- **Search**: ripgrep for exact identifiers, plus a semantic symbol index for "where is retry logic implemented".
- **Descriptions**: write tool docs like for a junior engineer — when to use, examples, edge cases. Poka-yoke the interface (absolute paths only) to remove whole classes of mistakes.

Track tool error rates per tool; a spike usually means an interface problem.`,
      },
      {
        topic: 'Sandbox security and supply chain',
        discussion: `The agent executes arbitrary code (tests, build scripts) generated or modified by a model and possibly influenced by malicious issue text (prompt injection). Treat it as untrusted.

- **Isolation**: one microVM per task, destroyed afterwards; no shared filesystem; seccomp and resource limits.
- **Network**: default deny; allow only internal package mirrors that proxy and scan dependencies. This blocks exfiltration and dependency-confusion attacks.
- **Secrets**: none inside the sandbox. PR creation happens outside, from the harness, with a narrowly scoped bot token (create branch + PR, no merge, no admin).
- **Protected paths**: edits to CI workflows, CODEOWNERS or dependency manifests require extra human approval labels.
- **Injection**: issue and code content are untrusted data; the agent cannot change its own permissions, and anything leaving the sandbox (the PR) goes through human review.

Audit: all commands and network attempts logged; anomalies (attempted egress) flag the task.`,
      },
      {
        topic: 'Evaluation and the cost/quality loop',
        discussion: `Build an internal benchmark: 300 historical issues with the merged fix and the tests that verify it (hidden from the agent). Metrics:

- **Resolve rate**: hidden tests pass.
- **Reviewer acceptance**: in production, merged without major edits.
- **Cost and time per task**, steps per task, tool error rates.

Use the benchmark as a CI gate for every change to model, prompts or tools; changes must not reduce resolve rate beyond noise (run 3 seeds — agent runs are stochastic).

Cost levers: prompt caching for the stable prefix, summarising stale tool outputs, a smaller model for exploration steps and a frontier model for editing, and early stopping when the agent loops (same failing test 3 times → stop and report). Track pass^k (consistency across repeated runs), not just pass@1, because users experience the variance.`,
      },
    ],
    tradeoffs: [
      'Single agent vs multi-agent: a single agent keeps coherent context for code changes; parallel sub-agents help mostly for exploration across huge repos.',
      'Exact-string edits are safer than whole-file rewrites but need more tool calls on large refactors.',
      'Restricting network improves security but breaks builds that fetch dependencies; mitigated by internal mirrors and prebuilt images.',
      'Longer budgets raise resolve rate with diminishing returns; cap steps and stop on loops to control cost.',
      'Human review on every PR limits throughput but is essential for accountability and catching subtle bugs.',
    ],
    followUps: [
      { q: 'How do you handle a 5M-line monorepo where the repo map does not fit in context?', a: 'Use hierarchical maps (top-level directories, then per-package summaries generated offline), retrieval over a symbol index, and let the agent drill down with search tools. Scope tasks to an owning package via CODEOWNERS and run only that package’s tests to keep feedback loops fast.' },
      { q: 'The agent passes tests by deleting the failing assertions. How do you prevent this?', a: 'Detect test-file modifications that remove assertions or skip tests and flag them in the PR. Run hidden or original tests from the base commit in the harness, and require human approval for test deletions. Add this behaviour to the eval suite as a negative case.' },
      { q: 'How would you add interactive IDE use?', a: 'Reuse the same tool layer and agent loop, but run tools against the developer’s local workspace via an IDE extension with per-action approval for writes and commands. Stream steps to the UI and keep the async sandbox path for long-running tasks.' },
    ],
    relatedTopics: ['agent-fundamentals', 'planning-decomposition', 'agent-memory-tools', 'hitl-state-machines', 'ai-security-injection', 'llm-evaluation', 'cost-caching', 'mcp'],
  },
  {
    id: 'arch-multi-agent-research',
    company: 'agents',
    title: 'Multi-agent deep research assistant',
    frequency: 'high',
    level: 'Senior',
    prompt: 'Design a research assistant that answers complex questions ("compare the EU and US regulatory approach to AI in healthcare") by searching the web and internal documents, reading dozens of sources and producing a cited report in under 5 minutes, for 20,000 reports per day.',
    clarifyingQuestions: [
      'Which sources are allowed: public web, paid databases, internal documents (with ACLs)?',
      'What length and format is the report, and how strict must citations be?',
      'Is the user involved during research (clarify scope, approve plan) or fire-and-forget?',
      'What is the cost ceiling per report?',
      'How should conflicting sources be handled?',
    ],
    functional: [
      'Clarify ambiguous questions and propose a research plan',
      'Run parallel sub-researchers over web search and internal retrieval',
      'Synthesise a structured report with inline citations to exact source passages',
      'Show progress updates while research runs',
      'Allow follow-up questions that reuse gathered sources',
    ],
    nonFunctional: [
      'p50 completion < 3 min, p95 < 5 min',
      'Citation precision ≥ 95% (cited passage supports the claim)',
      'Cost ≤ $1.50 per report on average',
      'Internal documents respect user ACLs',
      'Resilient to individual sub-agent or search API failures',
    ],
    estimation: [
      { label: 'Traffic', calc: '20K reports/day; peak hour 12% → 2,400/h ≈ 0.67 reports/s' },
      { label: 'Tokens per report', calc: 'lead: plan 3K + synthesis 40K in/4K out; 4 sub-agents × (30K in / 2K out) → 163K in, 12K out' },
      { label: 'Cost per report', calc: 'lead frontier: 43K×$3/1M + 4K×$15/1M = $0.19; subs mid-tier ($0.8/$4): 120K×0.8/1M + 8K×4/1M = $0.13 → ≈ $0.32 + search APIs 30 × $0.005 = $0.15 → ≈ $0.47' },
      { label: 'Concurrency', calc: '0.67 reports/s × 4 sub-agents × 90 s ≈ 240 concurrent sub-agents at peak; search API ≈ 0.67 × 30 = 20 QPS' },
      { label: 'Storage', calc: 'per report ~40 fetched pages × 30 KB = 1.2 MB cached text → 24 GB/day; keep 30 days ≈ 720 GB' },
    ],
    highLevelDesign: `**Pattern: orchestrator-worker with a shared source store, run as a durable workflow.**

**1. Scoping.** A lead agent (frontier model) checks whether the question is ambiguous and, if needed, asks 1–2 clarifying questions. It then writes a **research plan**: 3–6 sub-questions, each with an objective, suggested sources, and an output schema (findings with claim, evidence quote, source URL, confidence). The plan is shown to the user (optional edit).

**2. Parallel research.** A **durable workflow engine** (Temporal or a LangGraph graph with checkpointing) fans out sub-agents — one per sub-question — with a concurrency cap and per-agent budgets (≤ 12 tool calls, ≤ 40K tokens, 120 s). Each sub-agent loops: search (web search API, internal RAG platform with the user's ACLs) → fetch → read → extract evidence → decide whether more searching is needed. Fetched pages are cleaned (boilerplate removal) and stored in a **source store** (object storage + metadata), keyed by URL hash, so other agents and follow-ups reuse them. Sub-agents return **compact structured findings**, not raw pages.

**3. Gap check.** The lead reviews findings: contradictions, missing sub-questions, weak evidence. It may spawn one more bounded round.

**4. Synthesis.** The lead writes the report from findings, citing evidence ids. A **citation verifier** (NLI or small judge model) checks each cited sentence against its evidence quote; unsupported sentences are rewritten or removed.

**5. Delivery.** Progress events stream to the UI over SSE ("Searching EU AI Act provisions…"). The final report is stored with its source list; follow-up questions reuse the source store before searching again.

**Platform.** All model calls via the **LLM gateway** (budgets per user/plan, fallbacks); search API calls behind a rate limiter and cache; full traces per report for debugging; an eval set of 200 research questions with rubric-based LLM-judge grading plus human spot checks. Cost per report and citation precision are tracked per release, and a router in front sends simple questions to a cheaper single-agent path.`,
    diagram: `user question
     |
     v
+-----------------+  clarify?   +----------------------------------------+
| LEAD AGENT      |<----------->| user (approve / edit plan)             |
| plan: 3-6 subQs |             +----------------------------------------+
+--------+--------+
         | durable workflow (Temporal / LangGraph checkpoints)
   +-----+---------+--------------+--------------+
   v               v              v              v
+--------+    +--------+     +--------+     +--------+   budget per agent:
|SUB-AGT1|    |SUB-AGT2|     |SUB-AGT3|     |SUB-AGT4|   12 tools, 40K tok
+---+----+    +---+----+     +---+----+     +---+----+
    | search/fetch/read           |              |
    v                             v              v
 [web search API]  [internal RAG (user ACLs)]  [SOURCE STORE: pages, hash]
    |                             |              |
    +---------- findings: claim, quote, url, confidence ----------+
                                  v
                    [LEAD: gap check -> optional round 2]
                                  v
                    [SYNTHESIS] -> [CITATION VERIFIER] -> report
       progress events --SSE--> UI;  traces + eval rubric`,
    deepDives: [
      {
        topic: 'Context management between lead and sub-agents',
        discussion: `The lead must never ingest raw pages from every sub-agent — 4 agents × 10 pages × 8K tokens would be 320K tokens and destroy synthesis quality.

- Sub-agents return **structured findings**: claim (one sentence), evidence quote (≤ 60 words, verbatim), source id, date, confidence. Typically 10–20 findings ≈ 1.5–3K tokens per agent.
- Full text stays in the source store; the lead can fetch a specific passage by evidence id if needed.
- The plan and findings are persisted in workflow state (checkpoints), so a crashed lead resumes without redoing research.
- Sub-agents get only their objective plus a short global brief, not the lead's full history — narrow context keeps them focused and cheap.

This mirrors Anthropic's multi-agent research system: subagents act as intelligent filters that compress information for the lead.`,
      },
      {
        topic: 'Citation verification',
        discussion: `Citation errors are the most damaging failure: a fluent claim attributed to a source that does not say it.

Pipeline:
1. During synthesis, every sentence with a factual claim must reference evidence ids.
2. A verifier checks (sentence, evidence quote) pairs with an NLI model or small LLM judge: supported / partially / not supported.
3. Unsupported sentences are sent back for rewrite with the instruction to only use the evidence; if still unsupported, remove them and note the gap.
4. Quotes must exist verbatim in the stored page (string match) — catches fabricated quotes cheaply.

Metrics: citation precision (supported/total) and citation recall (claims needing citations that have one). Target ≥ 95% precision. Verification adds ~10–20 s for a long report but runs in parallel per paragraph.`,
      },
      {
        topic: 'Reliability, budgets and failure handling',
        discussion: `Long multi-step workflows fail in many places: search API timeouts, paywalled pages, model 529s, sub-agents looping.

- **Durable execution**: each step is an activity with retries and timeouts; workflow state survives worker restarts.
- **Budgets** per sub-agent (tool calls, tokens, time) and per report (dollar cap). On exhaustion, return partial findings flagged as incomplete.
- **Loop detection**: repeated identical searches or fetches end the sub-agent.
- **Partial success**: synthesis proceeds if at least N−1 sub-agents return; the report states which aspects lack coverage.
- **Rate limiting**: a shared limiter for search APIs and the gateway prevents bursty fan-out from triggering provider throttling.
- **Idempotency**: fetches are cached by URL hash, so retries do not re-download.

Monitor per-stage latency; p95 is usually dominated by one slow sub-agent, so add a straggler timeout and synthesise without it.`,
      },
    ],
    tradeoffs: [
      'Multi-agent parallelism cuts wall-clock time and broadens coverage but uses several times more tokens than a single agent.',
      'Frontier lead + mid-tier sub-agents balances quality and cost; all-frontier is better on hard topics but ~2× the price.',
      'Asking clarifying questions improves relevance but adds a round trip; skip for unambiguous queries.',
      'Citation verification raises trust but adds latency and cost; run it per paragraph in parallel.',
      'Caching fetched pages saves money and time but risks stale content for fast-moving topics; respect TTLs by domain.',
    ],
    followUps: [
      { q: 'How would you evaluate report quality at scale?', a: 'Use a rubric (coverage of key aspects, factual accuracy, citation precision, balance, clarity) scored by an LLM judge calibrated against human ratings on 100 reports. Track citation precision automatically, run the 200-question eval set on every change, and sample production reports weekly for human review.' },
      { q: 'A user asks a simple factual question. Does it go through the whole pipeline?', a: 'No. A router in front classifies complexity; simple questions go to a single-agent search and answer path that takes seconds and costs cents. Only multi-faceted questions trigger the multi-agent workflow, which keeps average cost low. It also keeps latency low for most users, since in practice the majority of questions are simple lookups rather than multi-faceted research tasks.' },
      { q: 'How do internal documents and the web mix safely?', a: 'Internal retrieval runs through the RAG platform with the user’s ACLs, and web content is treated as untrusted (prompt-injection risk) and clearly labelled. The final report marks internal citations so it is not shared outside the permitted audience by accident.' },
    ],
    relatedTopics: ['multi-agent-systems', 'planning-decomposition', 'advanced-rag-patterns', 'groundedness-hallucinations', 'hitl-state-machines', 'reliability-async', 'ai-architecture-patterns'],
  },
  {
    id: 'arch-text-to-sql-copilot',
    company: 'agents',
    title: 'Text-to-SQL analytics copilot',
    frequency: 'high',
    level: 'Senior',
    prompt: 'Design an analytics copilot that lets 5,000 business users ask questions in natural language over a Snowflake warehouse with 2,000 tables, returning correct SQL, results and charts, while respecting data permissions.',
    clarifyingQuestions: [
      'Is there a semantic layer (dbt metrics, LookML) with certified metric definitions?',
      'How are data permissions enforced today (row-level/column-level security, roles)?',
      'Should users see and edit the SQL, or only results?',
      'What query cost and runtime limits apply in the warehouse?',
      'How is correctness judged — do we have historical question/SQL pairs?',
      'Which questions are out of scope (writes, PII-heavy tables)?',
    ],
    functional: [
      'Translate questions into SQL against the right tables and certified metrics',
      'Execute read-only queries with the user’s own warehouse permissions',
      'Return results with a chart, the SQL and a plain-language explanation of assumptions',
      'Support follow-up questions that refine the previous query',
      'Let data teams curate examples, synonyms and metric definitions',
    ],
    nonFunctional: [
      'Execution accuracy ≥ 85% on a curated eval set; certified metrics must match the BI tool exactly',
      'p50 time to SQL < 4 s; queries auto-cancelled after 60 s or above a scan budget',
      'Zero write operations possible; PII columns masked per policy',
      'Full audit of question, SQL, user and rows returned',
      'Cost per question < $0.05 in LLM spend',
    ],
    estimation: [
      { label: 'Traffic', calc: '5,000 users × 8 questions/day = 40K questions/day ≈ 0.5 QPS avg, ~3 QPS peak' },
      { label: 'Schema context', calc: '2,000 tables × ~40 columns = 80K columns; full DDL ≈ 1.5M tokens → must retrieve: top 8 tables × ~600 tokens = ~5K tokens' },
      { label: 'Tokens per question', calc: 'system + rules 1.5K + schema 5K + 4 examples 1.2K + history 1K ≈ 8.7K in, 400 out; plus 1 repair attempt in 20% of cases' },
      { label: 'LLM cost', calc: '1.2 × (8.7K × $3/1M + 400 × $15/1M) = 1.2 × ($0.026 + $0.006) ≈ $0.038/question (illustrative) → $1,520/day' },
      { label: 'Warehouse guard', calc: 'cap scan at 50 GB/query; at ~$5/TB scanned (illustrative) worst case $0.25/query; dry-run EXPLAIN before execution' },
    ],
    highLevelDesign: `**Key idea: retrieval over schema + semantic layer, generate SQL, validate deterministically, execute with the user's identity, and explain.**

**Offline: knowledge build.**
- Crawl the warehouse information schema, dbt/semantic-layer metadata (descriptions, metric definitions, joins), table usage stats and query logs.
- Build **table/column documents** (name, description, sample values for low-cardinality columns, common joins) and embed them into a **schema index**.
- Curate a **golden example bank**: verified question → SQL pairs from analysts and query logs, embedded for few-shot retrieval.
- Glossary: business synonyms ("ARR" → metric annual_recurring_revenue; "EMEA" → region in list).

**Online: per question.**
1. **Router**: is it answerable via a certified metric in the semantic layer? If yes, generate a **semantic-layer query** (metric + dimensions + filters) — far more reliable than raw SQL.
2. Otherwise **schema linking**: hybrid retrieval over the schema index picks ~8 candidate tables; an LLM step prunes to the needed tables/columns.
3. **Few-shot retrieval**: top 4 similar golden examples.
4. **SQL generation** via the LLM gateway with dialect-specific rules (Snowflake), output as JSON {sql, assumptions}.
5. **Validation**: parse with a SQL parser (reject non-SELECT, multiple statements), check referenced tables/columns exist, enforce LIMIT, run EXPLAIN / dry-run for cost. On error, one **repair loop** with the error message.
6. **Execution** with the **user's own warehouse role** (OAuth), so row- and column-level security apply; query timeout and scan cap.
7. **Answer**: results table, auto-chart choice, the SQL and a short explanation of assumptions ("revenue = net of refunds; last quarter = Q2 FY26").

**Feedback loop.** Thumbs and analyst corrections create new golden examples after review. Eval set of 400 questions measures **execution accuracy** (result sets match) on every change. Usage analytics show which tables and metrics are asked about most, guiding the data team on what to document or certify next, and audit logs record user, question, SQL and rows returned.`,
    diagram: ` OFFLINE (knowledge build)               ONLINE (per question)
+-------------+  +----------------+      question + user (SSO)
| info schema |  | semantic layer |              |
| dbt docs    |  | metrics, joins |     +--------v---------+
| query logs  |  +-------+--------+     | ROUTER: metric?  |
+------+------+          |              +---+----------+---+
       v                 v          metric  |          | free-form
+--------------+  +---------------+         v          v
| SCHEMA INDEX |  | EXAMPLE BANK  |  [semantic-layer  [schema linking +
| tables, cols |  | Q -> SQL      |   query builder]   few-shot examples]
+------+-------+  +-------+-------+         |          |
       |                  |                 |    [LLM GATEWAY: gen SQL]
       +------------------+--> retrieval ---+----------+
                                            v
                  [VALIDATE: parse AST, SELECT only, columns exist,
                   LIMIT, EXPLAIN cost] --fail--> repair x1
                                            v
                  [EXECUTE as user role: RLS/CLS, timeout, scan cap]
                                            v
                  results + chart + SQL + assumptions
         feedback -> analyst review -> example bank`,
    deepDives: [
      {
        topic: 'Schema linking over 2,000 tables',
        discussion: `Feeding 2,000 tables is impossible and even 50 confuses the model. Schema linking is usually the biggest accuracy lever.

- Represent each table as a rich document: business description, column names with descriptions, sample values, row counts, owner, and "commonly joined with". Embed and also index with BM25 (exact column names matter).
- Retrieve top ~20 tables, then a cheap LLM pass prunes to the needed 3–8 with reasons.
- Boost **certified/gold tables** and demote deprecated or staging schemas — many warehouses contain five near-duplicate "orders" tables.
- Use query-log statistics: tables frequently queried together for similar questions.
- Evaluate linking separately: recall of gold tables in the selected set. If linking recall is 80%, end-to-end accuracy cannot exceed 80%.

Column-level pruning keeps prompts small: include only relevant columns plus keys for joins.`,
      },
      {
        topic: 'Safety: permissions, writes and runaway queries',
        discussion: `Never execute with a shared superuser service account — that bypasses every permission the warehouse already enforces.

- **Identity**: OAuth to Snowflake as the end user (or role switching to the user's role) so row access policies and masking policies apply automatically.
- **Read-only**: parse the SQL AST, allow only a single SELECT/WITH statement; additionally use a role with no write grants (defence in depth).
- **Cost**: dry-run/EXPLAIN to estimate bytes scanned; reject above budget or ask the user to add filters; enforce statement timeouts and LIMIT on result rows.
- **PII**: masking policies at the warehouse level; the LLM sees only schema and aggregated results by default, not raw PII rows.
- **Prompt injection via data**: column values returned to the model (for the explanation) are treated as data and truncated.

Audit logs store user, question, SQL, rows returned and cost for compliance.`,
      },
      {
        topic: 'Correctness and explaining assumptions',
        discussion: `Text-to-SQL errors are dangerous because they look right: a number in a chart is trusted.

- Prefer the **semantic layer** for certified metrics (revenue, ARR, active users): the LLM picks metric + dimensions + filters and the semantic layer compiles SQL, guaranteeing definitions match dashboards.
- Every answer lists **assumptions** explicitly: time window, metric definition, filters applied, tables used. Users catch wrong interpretations quickly.
- **Ambiguity detection**: if the question maps to multiple plausible metrics ("sales" = bookings or revenue?), ask a clarifying question instead of guessing.
- **Sanity checks**: compare results with known aggregates (e.g. total revenue within ±X% of the BI dashboard), flag empty results or suspicious magnitudes.
- **Evaluation**: execution accuracy on 400 curated questions (compare result sets, not SQL strings), broken down by difficulty (joins, window functions, time logic).`,
      },
    ],
    tradeoffs: [
      'Semantic-layer queries are reliable but limited to modelled metrics; free-form SQL is flexible but less accurate.',
      'Executing as the user preserves governance but requires OAuth plumbing and makes caching per-user.',
      'Showing SQL builds trust with analysts but can overwhelm business users; collapse it by default.',
      'Repair loops raise accuracy (+5–10 pts) at the cost of latency and tokens.',
      'Clarifying questions reduce wrong answers but add friction; trigger only on detected ambiguity.',
    ],
    followUps: [
      { q: 'How do you handle follow-ups like "now break it down by region"?', a: 'Keep the previous question, SQL and assumptions in conversation state. The model edits the prior query rather than starting over, and validation re-runs. Show a diff of the assumptions so the user sees what changed. If the follow-up is ambiguous about which earlier query it refers to, ask rather than guess.' },
      { q: 'Accuracy is 70% on joins across 4+ tables. What do you try?', a: 'Add curated join paths from the semantic layer or query logs to the prompt, provide few-shot examples with similar join shapes, decompose the generation (plan joins, then write SQL) and add a validator that checks join keys against declared foreign keys. Measure on the hard-join slice specifically.' },
      { q: 'Can you cache answers?', a: 'Cache generated SQL by normalised question and schema version, but execute per user because permissions differ. Result caching is only safe per role or user and with short TTLs tied to table freshness. Invalidate SQL caches whenever the schema index is rebuilt, because renamed or deprecated tables would otherwise produce failing queries.' },
    ],
    relatedTopics: ['ai-applications', 'structured-outputs-tools', 'agent-fundamentals', 'retrieval-fundamentals', 'llm-evaluation', 'privacy-guardrails', 'ai-security-injection'],
  },
  {
    id: 'arch-llm-gateway-200-teams',
    company: 'platform',
    title: 'LLM gateway for 200 internal teams',
    frequency: 'very-high',
    level: 'Staff',
    prompt: 'Design a central LLM gateway used by 200 internal teams to access OpenAI, Anthropic, Bedrock and self-hosted models, with authentication, quotas and budgets, routing and fallbacks, caching, PII controls, logging and cost attribution. Peak 3,000 requests per second.',
    clarifyingQuestions: [
      'Which APIs must be supported: chat, embeddings, batch, realtime/audio, image?',
      'Do teams need provider-specific features (prompt caching, tool use, reasoning parameters) or only a common API?',
      'What data classes may go to which providers (e.g. PII only to self-hosted or zero-retention endpoints)?',
      'What latency overhead and availability SLO are acceptable?',
      'How should budgets behave at the limit: hard block, soft alert or downgrade to a cheaper model?',
      'Is logging of full prompts allowed, and for how long?',
    ],
    functional: [
      'OpenAI-compatible API (chat, embeddings) plus pass-through for provider-native endpoints',
      'Virtual keys per team/app with RPM, TPM and monthly dollar budgets',
      'Logical model aliases with weighted routing, retries, fallbacks and circuit breakers',
      'Optional exact and semantic caching; pass-through of provider prompt caching',
      'PII detection/redaction and data-class routing policies',
      'Usage logging with team, app, feature and trace id; cost dashboards and alerts',
    ],
    nonFunctional: [
      'Gateway overhead p99 < 20 ms (excluding provider time); streaming pass-through',
      '99.95% availability, multi-zone, no single dependency that blocks all traffic',
      'Peak 3,000 RPS and ~15,000 concurrent streams',
      'Budgets enforced within 1% accuracy under concurrency',
      'Audit-grade logs retained 1 year; prompts stored only when policy allows',
    ],
    estimation: [
      { label: 'Concurrency', calc: '3,000 RPS × average 5 s stream duration = 15,000 concurrent connections (Little’s law)' },
      { label: 'Gateway replicas', calc: 'one 4-vCPU replica handles ~1,500 concurrent streams at ~50% CPU → 15,000 / 1,500 = 10, plus N+50% across 3 zones → 15 replicas' },
      { label: 'Redis ops', calc: 'per request: key lookup (cached in-process), 2 rate-limit ops, 2 budget ops → ~4 ops × 3,000 = 12K ops/s — trivial for a small Redis cluster' },
      { label: 'Log volume', calc: 'avg 1,000 RPS × 86,400 = 86M requests/day × 2 KB metadata = 173 GB/day ≈ 63 TB/year raw (≈ 8 TB columnar compressed)' },
      { label: 'Spend under management', calc: '86M requests × avg 2,500 tokens × blended $2/1M ≈ $430K/day — a 10% routing/caching saving pays for the platform team many times over' },
    ],
    highLevelDesign: `**Hub-and-spoke: the gateway is the hub; providers, self-hosted models and policy services are spokes. It has a control plane and a data plane.**

**Data plane (stateless gateway pods, ×15, 3 zones).** Each request runs a filter chain:
1. **Auth**: virtual key or workload identity (mTLS/OIDC) → team, app, data-class entitlement. Key metadata cached in-process (TTL 60 s, revocation via pub/sub).
2. **Rate limits and budgets**: token-bucket RPM/TPM per key in Redis; budget pre-reservation of estimated cost (input tokens + max_tokens × price), reconciled after the response with atomic increments.
3. **Policy**: data-class routing (requests tagged PII may go only to zero-retention or self-hosted endpoints), model allow-lists per team, PII detection/redaction for flagged keys (fail closed).
4. **Cache**: optional exact-match cache (hash of model + messages + params) and opt-in semantic cache, scoped per team.
5. **Routing**: alias → ordered targets with weights (e.g. default-chat → 80% provider A, 20% provider B), health-based selection, per-target **circuit breakers**, retries with jitter on 429/5xx, cross-provider **fallback** with request translation (OpenAI ↔ Anthropic message formats).
6. **Proxy**: streaming SSE pass-through with connection pooling (HTTP/2, keep-alive) to providers.
7. **Telemetry**: async emit of usage events (tokens, cost, latency, TTFT, status, team, feature, trace id) to Kafka → warehouse + real-time aggregator.

**Control plane.** Admin API and UI for teams, keys, budgets, aliases, routing weights, policies and price tables; config stored in Postgres, published as **versioned snapshots** that pods cache (last-known-good on failure). Changes go through review and canary rollout.

**Self-service.** Teams get keys, budgets and dashboards through a portal; SDK wrappers set metadata headers automatically.

**Cost platform.** Usage events feed spend dashboards per team/feature/model, anomaly alerts (spend spike vs 7-day baseline), and monthly chargeback.

**Resilience.** Redis failure → local approximate limits; telemetry failure → buffer to disk; control plane failure → keep snapshot; provider outage → breaker + fallback. A break-glass direct path exists for tier-0 services with async audit.`,
    diagram: `     200 teams: services, agents, notebooks (OpenAI-compatible SDK)
                          |  virtual key / workload identity
                          v
+--------------------------- DATA PLANE (x15, 3 zones) ---------------+
| auth -> RPM/TPM + budget -> policy/PII -> cache -> route -> proxy  |
|   ^         ^ Redis            ^ sidecar     ^ Redis   | breakers,  |
|   | key cache                  | fail closed           | fallbacks  |
+---+------------------------------------------------------+---------+
    | config snapshots (versioned)        usage events     |
+---+--------------------+          +----------------+     |
| CONTROL PLANE          |          | KAFKA -> OLAP  |<----+ (async)
| teams, keys, budgets,  |          | cost, latency, |
| aliases, policies,     |          | anomaly alerts |
| price tables, rollouts |          +----------------+
+------------------------+
              spokes:  +--------+ +-----------+ +---------+ +-----------+
                       | OpenAI | | Anthropic | | Bedrock | | vLLM pool |
                       +--------+ +-----------+ +---------+ +-----------+`,
    deepDives: [
      {
        topic: 'Accurate budgets under concurrency',
        discussion: `Naive read-check-call-write budget logic undercounts when hundreds of requests run concurrently, and long streams can blow past limits.

Approach: **reserve, then reconcile**.
- Before forwarding, estimate cost = input tokens (tokenised locally) × input price + max_tokens × output price. Atomically INCRBY the reservation on the budget key in Redis via a Lua script that also checks the limit; reject (or downgrade) if it would exceed.
- After the response, compute the actual cost from provider usage and apply the delta (actual − reserved).
- For streams cancelled mid-way, reconcile using tokens delivered.
- Budgets roll up hierarchically (feature → team → org), so the Lua script checks multiple keys in one round trip.

Behaviour at the limit is configurable per key: hard 429, soft (allow + alert), or **downgrade** to a cheaper alias (a budget fallback, as in LiteLLM). Alerts at 50/80/100% go to team channels.`,
      },
      {
        topic: 'Cross-provider fallback without breaking clients',
        discussion: `Fallback across providers is only useful if responses are interchangeable for the caller.

- Normalise to the OpenAI Chat Completions schema at the edge; translators convert to Anthropic Messages or Bedrock formats, including tool definitions, tool-call results and streaming events.
- Only fall back between targets declared **compatible** in the alias (similar capability tier, context window, tool support). An alias that needs 200K context must not fall back to a 32K model.
- Retry policy: retry the same target on transient 5xx once with jitter; on 429 or breaker open, move to the next target immediately; never retry after the stream has started sending tokens to the client (avoid duplicated output) — instead return an error event.
- Mark the served target in a response header so teams can debug quality differences.
- Run evals per alias across all targets, so a fallback does not silently degrade quality beyond an agreed threshold.`,
      },
      {
        topic: 'Keeping the hub from becoming the outage',
        discussion: `The gateway is on the critical path of every AI feature, so its failure modes matter more than its features.

- **Stateless pods** with all shared state in Redis/Postgres; config served from memory snapshots.
- **Dependency classification**: auth and PII fail closed (with in-process caches to survive blips); rate-limit/budget stores degrade to local approximate counters; telemetry and caches fail open.
- **Bulkheads**: separate connection pools and concurrency limits per provider and per team tier, so one team's runaway batch job cannot exhaust shared sockets.
- **Load shedding**: when saturated, reject low-priority traffic (batch keys) first with 429 + Retry-After.
- **Progressive delivery**: gateway releases and config changes canary to one zone first.
- **Federation**: very large orgs run regional or business-unit gateways with a shared control plane, limiting blast radius.

SLOs are measured on gateway overhead and gateway-caused errors separately from provider errors.`,
      },
    ],
    tradeoffs: [
      'Central gateway gives governance and cost visibility but adds a hop and a critical dependency; mitigate with stateless scaling and break-glass paths.',
      'OpenAI-compatible normalisation simplifies clients but hides provider-specific features; offer pass-through endpoints.',
      'Semantic caching saves money but risks wrong answers; make it opt-in and scoped per team.',
      'Logging full prompts aids debugging and evals but raises privacy risk; default to metadata only with sampled, redacted prompt capture.',
      'Hard budget blocks protect spend but can break production features; downgrade-on-budget is often a better default.',
    ],
    followUps: [
      { q: 'How do you support provider prompt caching through the gateway?', a: 'Pass cache-control hints through for Anthropic and keep request prefixes byte-stable (no per-request timestamps in system prompts). Route requests sharing a prefix to the same provider and region with sticky routing by prefix hash, and report cached-token counts in usage events so teams see the savings.' },
      { q: 'A team needs realtime voice through the gateway. What changes?', a: 'Realtime uses WebSockets or WebRTC with long-lived sessions. The gateway issues short-lived ephemeral tokens after auth and policy checks, meters usage from provider session events, and either proxies the WebSocket or lets clients connect directly with the ephemeral token to avoid adding latency to audio.' },
      { q: 'How do you migrate 200 teams onto the gateway?', a: 'Ship SDK wrappers and accept provider-native model names mapped to aliases. Migrate high-spend teams first for quick cost visibility, publish dashboards as the carrot, then block direct egress to provider domains at the network layer after a deadline, with exceptions reviewed case by case.' },
    ],
    relatedTopics: ['ai-architecture-fundamentals', 'ai-architecture-patterns', 'model-serving-routing', 'reliability-async', 'cost-caching', 'observability', 'privacy-guardrails', 'production-deployment'],
  },
  {
    id: 'arch-semantic-cache-cost-platform',
    company: 'platform',
    title: 'Semantic cache and LLM cost-optimisation platform',
    frequency: 'medium',
    level: 'Senior',
    prompt: 'LLM spend is $1.2M per month across 40 products and growing 15% monthly. Design a platform that cuts cost by at least 30% without hurting quality, including a semantic cache, prompt caching, model routing and cost visibility.',
    clarifyingQuestions: [
      'What is the breakdown of spend by product, model and input vs output tokens?',
      'How repetitive is traffic (FAQ-like vs unique, personalised requests)?',
      'What quality metrics exist per product, and who signs off on changes?',
      'Are responses personalised or permission-dependent (affects cacheability)?',
      'What latency budgets do products have (does an extra cache lookup matter)?',
    ],
    functional: [
      'Attribute every dollar to product, feature and model, with anomaly alerts',
      'Opt-in semantic cache with per-product thresholds and scoping',
      'Prompt-prefix caching guidance and enforcement via the gateway',
      'Model routing (cheap vs frontier) with per-route quality gates',
      'Experiment framework to prove savings at equal quality',
    ],
    nonFunctional: [
      'Cache lookup adds < 15 ms p95',
      'Wrong-cache-hit rate < 0.5% on audited samples',
      'No cross-tenant or cross-permission cache hits, ever',
      'Savings measured continuously against a counterfactual baseline',
      'Cost dashboards refreshed within 15 minutes',
    ],
    estimation: [
      { label: 'Baseline', calc: '$1.2M/month; suppose 65% input tokens, 35% output tokens by cost' },
      { label: 'Prompt caching', calc: '40% of input tokens are stable prefixes; cached at ~10% price → input saving 0.65 × 0.40 × 0.9 ≈ 23% of spend ≈ $281K' },
      { label: 'Semantic cache', calc: '3 FAQ-like products = 30% of spend with 25% hit rate → 7.5% of spend ≈ $90K (minus embedding + vector costs ≈ $2K)' },
      { label: 'Model routing', calc: '50% of remaining traffic routed to a model 8× cheaper: remaining spend ≈ $830K × 0.5 × (1 − 1/8) ≈ $363K' },
      { label: 'Total', calc: '$281K + $88K + $363K ≈ $732K → ≈ 61% reduction (overlaps mean plan for ~40–50% real)' },
    ],
    highLevelDesign: `**Three levers behind the existing LLM gateway, plus visibility and experimentation.**

**1. Visibility first.** The gateway emits usage events (team, product, feature, model, input/output/cached tokens, cost, latency, cache status, prompt version). A cost service aggregates them into dashboards and **unit economics** (cost per conversation, per document, per active user). Anomaly detection compares hourly spend to a seasonal baseline and alerts owners (e.g. a retry loop tripling spend).

**2. Prompt caching (cheapest win).** Many products send a large stable prefix (system prompt, tool definitions, few-shot examples, documents). The platform lints prompts for cache-breaking patterns (timestamps or user ids at the top), restructures templates as static prefix + dynamic suffix, sets cache breakpoints for providers that need them, and routes requests sharing a prefix to the same provider/region (sticky routing) to maximise hit rate. Cached-token ratios are tracked per product.

**3. Semantic cache (for repetitive traffic).** A gateway plugin, opt-in per product:
- Key = embedding of the normalised user query, **scoped** by namespace = (tenant, product, prompt version, model alias, ACL fingerprint, locale).
- Lookup in a vector index (Redis/Qdrant) with a per-product similarity threshold (e.g. 0.95), optional cheap verifier (small model: "does cached answer address this query?") for borderline scores.
- TTLs per product and invalidation hooks when source documents change.
- Never cache personalised, tool-using or time-sensitive responses (flags from the product).

**4. Model routing.** A router (classifier trained on logged traffic labelled by "did the cheap model's answer match quality?") sends easy requests to a small model and escalates hard ones. Quality gates per product: offline eval + online A/B with judge scores.

**5. Experimentation.** Each optimisation ships as an experiment: control vs treatment traffic split, tracking cost per unit and quality metrics; savings reported against the control, not against last month. All levers sit in the gateway, so products adopt them through configuration rather than code changes, and the cost service shows each product its savings and remaining opportunities.`,
    diagram: `   products (40) ---> LLM GATEWAY
                         |
   +---------------------v----------------------------------------+
   | 1 attribution tags | 2 prompt-cache lint + sticky routing      |
   | 3 SEMANTIC CACHE (opt-in)          4 MODEL ROUTER             |
   |   embed q -> scoped ANN lookup       easy -> small model      |
   |   ns=(tenant,product,promptV,acl)    hard -> frontier         |
   |   sim >= 0.95 ? verify : miss        quality gates per route  |
   +------+-----------------------+-------------------+-----------+
          | hit                   | miss              |
          v                       v                   v
     cached answer        [providers / vLLM]   usage events (Kafka)
                                                      |
                     +--------------------------------v-------------+
                     | COST SERVICE: dashboards, unit economics,     |
                     | anomaly alerts, experiment savings vs control |
                     +-----------------------------------------------+`,
    deepDives: [
      {
        topic: 'Semantic cache correctness',
        discussion: `The risk with semantic caching is serving a confident wrong answer: "How do I cancel my order?" and "How do I cancel my subscription?" can embed above 0.9 similarity.

Mitigations:
- **Scoping** is mandatory: namespace by tenant, product, prompt version, model alias, locale and ACL fingerprint. Without it you leak data across users.
- **Per-product thresholds** tuned on labelled pairs: plot precision of hits vs hit rate and pick the threshold meeting the wrong-hit target (< 0.5%).
- **Entity guard**: extract key entities/numbers from both queries; if they differ (order vs subscription, plan names, dates) treat as a miss.
- **Verifier** for scores in a grey band (0.90–0.95): a small model checks applicability — costs ~1% of a frontier call.
- **Invalidation**: store source doc ids with entries; doc updates purge dependents; TTLs bound staleness.
- **Auditing**: sample 1% of hits for human or judge review continuously.`,
      },
      {
        topic: 'Proving savings without hurting quality',
        discussion: `Cost cuts that silently degrade quality are worse than no cuts. Every lever runs as an experiment:

- Split traffic (e.g. 90/10) at the gateway by stable user hash so users get consistent behaviour.
- Primary metric: cost per unit of value (per resolved conversation, per processed document) — not cost per request, which caching can game.
- Guardrail metrics: online judge scores, thumbs-down rate, escalation rate, task success, latency.
- Run long enough for significance (often 1–2 weeks for sparse feedback); use sequential testing to stop early on clear regressions.
- Report savings vs the concurrent control group, since traffic growth (15%/month) makes month-over-month comparisons meaningless.

Product owners sign off on the quality metrics; the platform team owns the mechanism.`,
      },
      {
        topic: 'Routing to cheaper models',
        discussion: `Routing usually yields the biggest saving but needs evidence per product.

- Collect logged requests with frontier responses; replay a sample through the cheap model and have a judge (or human labels) mark whether the cheap answer is acceptable.
- Train a lightweight router (embedding + logistic regression or a small fine-tuned classifier) predicting "cheap model sufficient". RouteLLM-style approaches show large cost reductions on chat benchmarks with little quality loss.
- Calibrate the threshold per product to a quality target (e.g. ≥ 98% of frontier judge score).
- Add **cascades**: answer with the cheap model, run a verifier (schema, groundedness, confidence), escalate to frontier on failure.
- Re-train monthly; traffic mix and model prices change. Publish per-product savings next to quality deltas so product owners can see the trade-off before opting more traffic into the cheap route, and keep a kill switch that sends everything back to the frontier model instantly.`,
      },
    ],
    tradeoffs: [
      'Higher semantic-cache thresholds are safer but reduce hit rate; per-product tuning beats a global value.',
      'Cascades save money but increase latency on escalated requests.',
      'Aggressive prompt compression reduces tokens but can drop critical instructions; validate with evals.',
      'Central enforcement (gateway) gives consistency; product-level optimisation captures domain-specific savings.',
      'Batch APIs halve cost for offline workloads but add hours of latency.',
    ],
    followUps: [
      { q: 'Which lever do you ship first and why?', a: 'Attribution first, because you cannot prioritise what you cannot see, followed by prompt caching. It needs no quality trade-off (same model, same output), mostly requires template restructuring, and often cuts input cost substantially for products with large stable prefixes. The savings are also measurable within days from cached-token counts.' },
      { q: 'How do you use batch APIs?', a: 'Identify non-interactive workloads such as nightly summarisation, evaluations and backfills, and route them through provider batch endpoints at a discount, typically around 50%. The gateway exposes a batch alias with a deadline-based SLA and the same attribution tags. Separating batch traffic also protects interactive quotas at peak.' },
      { q: 'A product’s cost tripled overnight. How do you debug?', a: 'Break the spend down by feature, model, prompt version and token type in the dashboard. Typical causes are a prompt release that broke caching, a retry loop, a context-window bug that appends full history, or a routing change; correlate with deploy and config change events.' },
    ],
    relatedTopics: ['cost-caching', 'model-serving-routing', 'observability', 'llm-evaluation', 'ai-architecture-fundamentals', 'embeddings'],
  },
  {
    id: 'arch-eval-observability-platform',
    company: 'platform',
    title: 'LLM evaluation and observability platform',
    frequency: 'high',
    level: 'Senior',
    prompt: 'Design an internal platform that gives every AI product team tracing, cost and latency monitoring, offline evaluation in CI, online quality scoring of production traffic, and dataset management. 30 products, 50M LLM calls per month.',
    clarifyingQuestions: [
      'Which frameworks and languages do teams use (LangGraph, LlamaIndex, plain SDKs)?',
      'Can prompts and responses be stored, and under which retention and redaction rules?',
      'Do teams have golden datasets today, and who labels data?',
      'What should block a deployment (hard gates) versus inform it?',
      'Build vs buy: are hosted tools (Langfuse, LangSmith, Arize) acceptable?',
    ],
    functional: [
      'SDK/OpenTelemetry-based tracing of LLM calls, retrieval, tools and agent steps',
      'Dashboards for latency (TTFT, total), tokens, cost, errors per product and version',
      'Dataset management: golden sets, production samples, human labels, versioning',
      'Offline eval runs in CI with metrics (LLM-as-judge, RAG metrics, exact checks) and gates',
      'Online evaluation: sampled production traces scored by judges, with drift alerts',
    ],
    nonFunctional: [
      'Instrumentation overhead < 2 ms per span, async export, no impact on user requests when the platform is down',
      'Ingest 50M LLM calls/month plus ~4 spans per call',
      'PII redaction before storage; per-product retention policies',
      'CI eval run for 500 cases completes in < 10 minutes',
      'Judge metrics calibrated against human labels (agreement tracked)',
    ],
    estimation: [
      { label: 'Span volume', calc: '50M calls/month × 5 spans = 250M spans/month ≈ 96 spans/s avg, ~500/s peak' },
      { label: 'Storage', calc: 'LLM span with redacted prompt/response ≈ 6 KB; other spans ≈ 1 KB → 50M × 6 KB + 200M × 1 KB = 500 GB/month raw; ~100 GB compressed in ClickHouse' },
      { label: 'Online eval cost', calc: 'sample 2% = 1M traces/month × judge 2K in / 150 out on a small model ($0.25/$1) ≈ 1M × $0.00065 = $650/month' },
      { label: 'CI eval cost', calc: '30 products × 20 runs/month × 500 cases × (generation $0.004 + judge $0.002) ≈ $1,800/month' },
      { label: 'Ingest compute', calc: '500 spans/s peak → 2 collector replicas + Kafka (6 partitions) + 3-node ClickHouse cluster' },
    ],
    highLevelDesign: `**Three loops share one data model: traces (what happened), datasets (what should happen) and scores (how good it was).**

**Instrumentation.** A thin SDK on top of **OpenTelemetry** with GenAI semantic conventions (model, input/output tokens, operation) plus app attributes (product, prompt version, user hash, retrieval doc ids, tool names). Auto-instrumentation for common SDKs and frameworks; the LLM gateway also emits spans, so even uninstrumented apps get basic coverage. Export is async and batched; if the collector is down, spans are dropped after a bounded buffer — never blocking requests.

**Ingestion and storage.** OTel collectors → **redaction processor** (PII and secrets removed, per-product policy) → Kafka → ClickHouse (columnar, fast aggregations over hundreds of millions of spans) for traces and metrics; large payloads (full prompts, documents) in object storage referenced by id; retention per product.

**Observability UI.** Trace explorer (tree of spans per request), dashboards (TTFT/latency percentiles, tokens, cost, error rates by product/model/prompt version), and alerts (SLO burn, cost anomalies).

**Datasets.** Versioned datasets per product: golden sets curated by experts, production samples (one click from a trace to a dataset), and human labels via an annotation queue. Each dataset version is immutable for reproducible evals.

**Offline evaluation (CI).** A runner executes the product's pipeline against a dataset version, then scorers: deterministic checks (schema, regex, exact match), RAG metrics (context recall/precision, faithfulness), LLM-as-judge rubrics (pairwise or pointwise), cost and latency. Results compare against the baseline on main; **gates** fail the PR if a metric drops beyond a threshold with statistical confidence.

**Online evaluation.** A sampler picks ~2% of production traces (stratified by product/route, oversampling thumbs-down), runs judge scorers asynchronously and writes scores back to traces. Drift detectors watch score distributions, input topic mix and refusal rates; alerts link to example traces.

**Judge governance.** Every judge prompt is versioned and calibrated against human labels (Cohen's kappa tracked); a judge change triggers re-baselining.`,
    diagram: `  apps (SDK/OTel)     LLM gateway spans
        |                   |
        +---------+---------+
                  v
       [OTel collectors] -> [REDACTION: PII, secrets] -> Kafka
                                                          |
             +--------------------------------------------+
             v                                            v
  +---------------------+                     +-----------------------+
  | CLICKHOUSE: traces, |<--- scores ---------| ONLINE EVAL           |
  | metrics, scores     |                     | sample 2% -> judges   |
  +----+----------------+                     | drift detectors       |
       |                                      +-----------------------+
       v
  [UI: trace explorer, dashboards, alerts]
       | "add to dataset"
       v
  +------------------+   versioned   +---------------------------------+
  | DATASETS + human |-------------->| OFFLINE EVAL RUNNER (CI)        |
  | annotation queue |               | checks, RAG metrics, judges ->  |
  +------------------+               | compare to baseline -> GATE PR  |
                                     +---------------------------------+`,
    deepDives: [
      {
        topic: 'Making LLM-as-judge trustworthy',
        discussion: `Judges are models with biases (position, verbosity, self-preference), so treat them like any measurement instrument.

- Prefer **specific, binary or low-cardinality rubrics** ("Does the answer cite a source for every factual claim? yes/no") over vague 1–10 scores.
- **Calibrate** each judge on 200–300 human-labelled examples; track agreement (kappa or accuracy) and only use judges above a bar (e.g. 0.7 kappa) for gating.
- Pairwise comparisons: randomise order and run both orders to cancel position bias.
- Use a different model family than the generator when possible to reduce self-preference.
- Version judge prompts and models; a judge change requires re-scoring the baseline so comparisons stay apples-to-apples.
- Report confidence intervals; with 500 cases, a 2-point difference may be noise. Re-run calibration whenever the product's domain or the judge model changes.`,
      },
      {
        topic: 'Privacy and redaction of traces',
        discussion: `Traces contain the most sensitive data in the company: user questions, retrieved documents, tool outputs.

- Redact at the **collector**, before data hits durable storage: regex + NER for emails, phone numbers, card numbers, national ids; secret scanners for API keys.
- Per-product policies: some products may store only metadata (tokens, latency, scores) and hashed inputs; others store full redacted text for debugging.
- Access control on the UI by product team; break-glass access to raw payloads is logged.
- Retention: e.g. 30 days for full payloads, 13 months for metadata and scores.
- Deletion requests (GDPR) propagate by user hash across traces and datasets.
- Datasets created from production traces inherit the redaction and are reviewed before use in shared evals. Redaction quality itself is evaluated with seeded synthetic PII so leaks are caught before release.`,
      },
      {
        topic: 'CI gates that teams will not bypass',
        discussion: `Gates fail if they are slow, flaky or noisy.

- **Fast tiers**: a smoke set (50 cases, < 2 min) on every PR; the full set (500 cases) on merge to main and before release.
- **Statistical gates**: block only when the drop is significant (bootstrap confidence intervals or paired tests on the same cases), not on any decrease.
- **Determinism**: temperature 0 where possible, cached generations for unchanged components, fixed dataset versions.
- **Actionable output**: the PR comment shows metric deltas and links to the 10 worst regressed cases with side-by-side outputs.
- **Ownership**: product teams choose metrics and thresholds; the platform provides defaults and tooling.
- **Escape hatch**: an override requires a justification and is audited. Track how often gates are overridden; a rising rate signals that thresholds or datasets need attention.`,
      },
    ],
    tradeoffs: [
      'Build vs buy: hosted tools ship faster; in-house gives data control and custom gates. Many companies run open-source (Langfuse/Phoenix) self-hosted.',
      'Storing full prompts helps debugging and dataset creation but increases privacy risk and storage cost.',
      'Higher online-eval sampling detects drift sooner but costs more; stratify and oversample negative feedback.',
      'Strict CI gates protect quality but slow iteration; use tiered suites and statistical thresholds.',
      'LLM judges scale cheaply but carry bias; human labels are accurate but slow and expensive.',
    ],
    followUps: [
      { q: 'How do you detect quality drift when there are no labels in production?', a: 'Combine signals: online judge scores on sampled traffic, user feedback rates, behavioural proxies such as regenerate, copy and escalation rates, input-distribution drift (embedding clusters and topic mix), and refusal or empty-answer rates. Alert on changes against a rolling baseline and route examples to human review.' },
      { q: 'How do you trace a multi-agent workflow across services?', a: 'Propagate W3C trace context through every hop, including queue messages, with one root span per user task and child spans per agent step, LLM call and tool call. Add attributes for agent name, step number and budget used so the UI can render the agent tree.' },
      { q: 'What would you show on the executive dashboard?', a: 'Per product: cost per unit of value, quality score trend with confidence bands, latency SLO attainment, incident count and adoption. Keep raw token counts off it; executives need outcomes and trends. Link each tile to the owning team’s detailed dashboard so leaders can drill down when a trend moves.' },
    ],
    relatedTopics: ['observability', 'llm-evaluation', 'rag-evaluation', 'ai-testing-benchmarking', 'production-deployment', 'privacy-guardrails', 'groundedness-hallucinations'],
  },
  {
    id: 'arch-voice-agent-800ms',
    company: 'multimodal',
    title: 'Real-time voice agent with sub-800 ms response latency',
    frequency: 'high',
    level: 'Staff',
    prompt: 'Design a phone and web voice agent for appointment booking and customer service that responds within 800 ms of the user finishing speaking, handles interruptions, calls backend tools, and scales to 5,000 concurrent calls.',
    clarifyingQuestions: [
      'Telephony (PSTN/SIP) and web (WebRTC) or only one channel?',
      'Which languages and accents; any domain vocabulary (drug names, addresses)?',
      'What actions are needed (calendar booking, payments) and do they need confirmation?',
      'Is 800 ms measured end-of-speech to first audio, at p50 or p95?',
      'Recording and transcript retention rules (consent, PCI for card numbers)?',
      'When should calls transfer to a human?',
    ],
    functional: [
      'Streaming speech-to-text, LLM reasoning with tools, streaming text-to-speech',
      'Turn detection (end-of-utterance) and barge-in (user interrupts the agent)',
      'Tool calls to calendar/CRM with confirmation of critical details',
      'Warm transfer to human agents with a summary',
      'Transcripts, recordings (with consent) and analytics',
    ],
    nonFunctional: [
      'End-of-speech to first agent audio p50 < 600 ms, p95 < 800 ms',
      '5,000 concurrent calls; graceful degradation under provider latency spikes',
      'Word error rate < 8% on domain test set; correct slot capture ≥ 97% after confirmation',
      'PCI/PII: card numbers never reach the LLM or logs',
      '99.9% availability; no dropped calls on single-node failure',
    ],
    estimation: [
      { label: 'Latency budget', calc: 'network/telephony 80 + endpointing 200 + STT finalise 50 + LLM TTFT 250 + first TTS audio 120 + jitter buffer 50 = 750 ms' },
      { label: 'Concurrency', calc: '5,000 concurrent calls × 1 STT stream each = 5,000 streams; LLM turns every ~6 s → ~830 LLM requests/s at peak' },
      { label: 'LLM tokens', calc: 'per turn ~2,500 in (system + tools + history) / 60 out → 830 × 2,500 ≈ 2.1M input tok/s → prompt caching essential' },
      { label: 'GPU sizing (self-hosted STT/TTS)', calc: 'if one GPU serves ~100 real-time STT streams and ~60 TTS streams: 5,000/100 + (5,000 × 40% speaking)/60 ≈ 50 + 34 = 84 GPUs + 30% headroom ≈ 110' },
      { label: 'Cost per minute', calc: 'STT $0.006 + TTS $0.015 + LLM 10 turns/min × ~$0.001 + telephony $0.01 ≈ $0.04/min (illustrative)' },
    ],
    highLevelDesign: `**Two architectures exist: a cascaded pipeline (STT → LLM → TTS) and speech-to-speech realtime models. For tool-heavy, auditable business flows choose the cascade, streamed end to end; keep speech-to-speech as an option for casual conversation.**

**Media edge.** Calls enter via SIP trunk (PSTN) or WebRTC into regional **media servers** (e.g. LiveKit/Pipecat-style), which handle codecs, jitter buffers and echo cancellation. Each call is pinned to a **voice session worker** in the same region as the models.

**Session worker (one per call, stateful).** Holds the conversation state machine and streams:
1. **VAD + streaming STT**: partial transcripts every ~100 ms; a **turn detector** (VAD silence + semantic end-of-utterance model) decides when the user finished — the biggest latency/quality trade-off.
2. **Speculative LLM start**: on a likely end-of-turn, start the LLM with the partial transcript; cancel if the user continues.
3. **LLM via the gateway** (small/fast model with low TTFT, cached system prompt + tools). Responses stream; the first clause goes to TTS as soon as it is complete (sentence chunking).
4. **Streaming TTS** returns audio chunks within ~100–150 ms; audio is streamed back to the media server.
5. **Barge-in**: if VAD detects user speech while the agent talks, stop TTS playback immediately, truncate the assistant message in history to what was actually spoken, and process the new utterance.

**Tools.** Calendar/CRM calls run asynchronously; the agent says a filler ("Let me check that for you") while waiting, avoiding dead air. Critical slots (date, name, phone) are **read back for confirmation** before booking.

**Payments/PCI.** When collecting a card, the media server switches to **DTMF capture or a secure IVR segment**; digits go directly to the payment processor, never to STT logs or the LLM.

**Handoff.** A transfer tool connects a human with a generated summary on their screen.

**Ops.** Per-turn latency breakdown traces (endpointing, STT, TTFT, TTS), WER and task-completion evals on recorded test calls, regional autoscaling by concurrent sessions.`,
    diagram: `caller (PSTN/SIP | WebRTC)
        |  audio 20 ms frames
        v
+----------------------+     regional, call pinned to one worker
| MEDIA SERVER         |<-----------------------------------------+
| codec, jitter, AEC   |                                          |
+----------+-----------+                                          |
           v                                                      |
+---------------------- SESSION WORKER (1 per call) ------------+ |
| [VAD] -> [STREAMING STT] -partials-> [TURN DETECTOR]          | |
|                                        | end-of-turn (spec.)  | |
|                                        v                      | |
|   barge-in: stop TTS,     [LLM via GATEWAY: fast model,       | |
|   truncate history         cached prompt, tools] --stream-->  | |
|                                        | first clause         | |
|                                        v                      | |
|                             [STREAMING TTS] --audio chunks------+-+
|  tools (async + filler): calendar, CRM | transfer -> human     |
+---------------------------------------------------------------+
 card capture: DTMF -> payment processor (bypasses STT/LLM/logs)
 budget: net 80 | endpoint 200 | STT 50 | TTFT 250 | TTS 120 | 50`,
    deepDives: [
      {
        topic: 'Turn detection: the hidden latency budget',
        discussion: `Most "slow" voice agents are slow because they wait too long to decide the user has finished. A fixed 800 ms silence threshold alone blows the budget.

- Combine **VAD** (silence 200–300 ms) with a **semantic end-of-utterance model** that reads the partial transcript: "I want to book for…" is incomplete; "Tuesday at 3 works." is complete.
- **Speculative execution**: start the LLM on a probable end of turn; if the user keeps talking, cancel and restart. Wasted tokens are cheap compared to latency.
- Adapt thresholds per context: longer when the agent asked for a phone number (users pause between digit groups), shorter after yes/no questions.
- Measure both latency and **false interruptions** (agent talks over the user); tune on recorded calls.

Endpointing typically saves 200–400 ms versus naive silence detection, more than any model swap.`,
      },
      {
        topic: 'Barge-in and conversation state consistency',
        discussion: `When the user interrupts, three things must happen within ~100 ms: stop audio playback, cancel in-flight TTS and LLM generation, and fix the conversation history.

The subtle bug: the LLM generated "Your appointment is booked for Tuesday at 3 pm, and I've also sent a confirmation to…" but the user interrupted after "Tuesday". If history keeps the full text, the model believes it said things the user never heard. Track **playback position** (audio timestamps mapped to text) and truncate the assistant message to what was actually played.

Also distinguish real interruptions from backchannels ("mm-hm", "okay") using a short-utterance classifier, so the agent does not stop for acknowledgements. Test barge-in explicitly in the simulated-call suite, including interruptions mid-tool-call. Echo cancellation prevents the agent's own voice from triggering VAD on speakerphones.`,
      },
      {
        topic: 'Cascade vs speech-to-speech models',
        discussion: `**Cascaded (STT → LLM → TTS)**: each component swappable and best-of-breed; text transcripts make tools, guardrails, logging and PCI redaction straightforward; latency is the sum of streamed stages (~500–800 ms achievable).

**Speech-to-speech (realtime multimodal models)**: lower latency potential and more natural prosody, captures tone; but less control over each stage, harder auditing, fewer model choices, and tool-heavy flows can be less predictable.

Decision for appointment booking and service: cascade for control, compliance and tool reliability, with careful streaming. A hybrid also works: a realtime model for conversational turns with text transcripts mirrored to a policy layer. Either way, design the session worker so the model layer is replaceable and evaluate with the same call test-suite. Track cost per minute as well: speech-to-speech pricing per audio token can differ markedly from a cascade of specialised components.`,
      },
    ],
    tradeoffs: [
      'Aggressive endpointing cuts latency but increases interruptions of slow speakers.',
      'Smaller, faster LLMs meet TTFT budgets but handle complex requests worse; escalate hard turns or use filler phrases.',
      'Self-hosted STT/TTS reduces per-minute cost and latency variance at the price of GPU operations.',
      'Reading back critical details improves accuracy but lengthens calls.',
      'Speech-to-speech models feel natural but reduce control and auditability versus a cascade.',
    ],
    followUps: [
      { q: 'p95 latency jumps to 1.6 s at peak. Where do you look?', a: 'Break traces down by stage. Common culprits are LLM TTFT under provider load (add regional fallback or a self-hosted fast model), cold TTS voices, queueing in session workers due to CPU saturation, and cross-region hops when a call is pinned far from its models. Fix the largest contributor first.' },
      { q: 'How do you evaluate a voice agent before launch?', a: 'Build a simulated caller (a TTS-voiced LLM persona with scenarios and accents) to run hundreds of calls, and measure task success, slot accuracy, latency percentiles, interruptions and policy compliance. Complement this with human test calls and a staged rollout with live monitoring.' },
      { q: 'How do you handle noisy environments and accents?', a: 'Use noise suppression at the media layer, STT models with domain vocabulary boosting, and confidence-based confirmation: low-confidence slots are read back or spelled out. Track WER by accent and channel cohorts to find gaps. Feed misrecognised terms back into the vocabulary list and the evaluation set.' },
    ],
    relatedTopics: ['audio-video', 'llm-apis-streaming', 'model-serving-routing', 'inference-optimization', 'hitl-state-machines', 'privacy-guardrails'],
  },
  {
    id: 'arch-invoice-processing-pipeline',
    company: 'multimodal',
    title: 'Invoice document-processing pipeline with OCR and LLM extraction',
    frequency: 'high',
    level: 'Mid',
    prompt: 'Design a pipeline that ingests 1 million invoices per month (PDFs, scans, photos, emails) from thousands of vendors, extracts header fields and line items into an ERP, and routes uncertain documents to human review, with ≥ 99% field accuracy after review.',
    clarifyingQuestions: [
      'What fraction are digital PDFs vs scans/photos, and which languages?',
      'Which fields are mandatory (vendor, invoice number, dates, totals, tax, line items, PO number)?',
      'What latency is required: minutes or same day?',
      'Are there existing vendor master data and purchase orders to validate against?',
      'What is the human review capacity per day?',
      'What are the data-residency and retention requirements?',
    ],
    functional: [
      'Ingest from email, upload portal, SFTP and API; deduplicate documents',
      'Classify document type (invoice, credit note, receipt, other) and split multi-invoice PDFs',
      'OCR and layout analysis for scans; extract header fields and line items to a schema',
      'Validate against business rules and master data (vendor, PO, totals) and route low-confidence items to reviewers',
      'Post approved invoices to the ERP and learn from corrections',
    ],
    nonFunctional: [
      'Throughput 1M invoices/month, peak 5× at month-end',
      'Straight-through processing ≥ 70% with ≥ 99% field accuracy after review',
      'p95 processing time < 10 minutes for non-reviewed invoices',
      'Exactly-once posting to the ERP (no duplicate payments)',
      'Full audit trail: original file, extracted values, model versions, reviewer edits',
    ],
    estimation: [
      { label: 'Volume', calc: '1M/month ≈ 33K/day; month-end peak 5× ≈ 165K/day ≈ 1.9/s' },
      { label: 'Pages and OCR', calc: 'avg 2 pages → 2M pages/month; 40% scanned → 800K OCR pages × $1.5/1K pages (illustrative) ≈ $1,200/month' },
      { label: 'LLM extraction', calc: 'per invoice ~3,000 input tokens (layout text) + 600 output; mid-tier model $0.8/$4 per 1M → $0.0024 + $0.0024 = $0.0048 → ~$4,800/month' },
      { label: 'Human review', calc: '30% review rate × 1M = 300K/month; at 90 s each = 7,500 reviewer-hours/month ≈ 47 FTE — the dominant cost; each +10 pts STP saves ~16 FTE' },
      { label: 'Storage', calc: '1M files × 400 KB = 400 GB/month originals; 7-year retention ≈ 34 TB in object storage (cold tier)' },
    ],
    highLevelDesign: `**A queue-driven prompt-chaining pipeline with deterministic validation gates and a human-in-the-loop review stage.**

**1. Ingestion.** Email (parsing attachments), portal, SFTP and API land files in object storage; an ingestion service computes a content hash for **deduplication**, records metadata and emits document.received to a queue. Each stage below is a consumer group, scaled on queue lag (month-end bursts).

**2. Pre-processing and classification.** Detect file type; digital PDFs → text + layout extracted directly (no OCR); images/scans → deskew, denoise, then **OCR with layout** (cloud document AI or open-source OCR + layout model) producing words with bounding boxes and reading order. A small classifier (or VLM) labels type (invoice, credit note, statement, other) and splits multi-document PDFs.

**3. Extraction.** An LLM (or VLM for complex layouts) receives the layout-preserving text (tables rendered as markdown) and returns JSON validated against a strict schema (structured outputs): vendor, invoice number, dates, currency, subtotal, tax, total, PO number and line items. Vendor-specific few-shot examples are retrieved for known vendors. Each field carries a confidence from model log-probs or agreement between two extraction passes, plus its bounding-box location for the review UI.

**4. Validation gates (deterministic).** Line items sum to subtotal; subtotal + tax = total (± rounding); dates plausible; vendor matched to master data (fuzzy match on name + VAT id + bank account); PO exists and amounts within tolerance (**3-way match**); duplicate detection on (vendor, invoice number, amount).

**5. Routing.** All gates pass and confidences high → **straight-through** to ERP posting. Otherwise → **review queue**, prioritised by due date and amount, with fields pre-filled and failing checks highlighted on the document image.

**6. Posting.** An ERP connector posts with an **idempotency key** (vendor + invoice number + hash) for exactly-once semantics.

**7. Learning loop.** Reviewer corrections are stored as labelled examples, feed vendor-specific few-shots, and periodically fine-tune a smaller extraction model; accuracy dashboards per vendor and field.`,
    diagram: `email/portal/SFTP/API
        |
        v
+---------------+  hash dedupe   +-----------------------------------+
| INGEST -> S3  |--------------->| QUEUE: document.received          |
+---------------+                +----------------+------------------+
                                                  v
                 +--------------------------------------------------+
                 | PRE-PROCESS: digital PDF -> text+layout          |
                 |              scan/photo -> deskew -> OCR+layout  |
                 | CLASSIFY: invoice | credit note | other; split   |
                 +------------------------+-------------------------+
                                          v
                 +--------------------------------------------------+
                 | EXTRACT: LLM/VLM -> JSON schema + confidences    |
                 |          (vendor few-shots retrieved)            |
                 +------------------------+-------------------------+
                                          v
                 +--------------------------------------------------+
                 | VALIDATE: sums, dates, vendor master, PO 3-way,  |
                 |           duplicate check                        |
                 +-------------+--------------------------+---------+
                    all pass   |                          | fail / low conf
                               v                          v
                  [ERP POST, idempotency key]   [REVIEW UI: doc + boxes]
                               ^                          |
                               +-------- approved --------+
                     corrections -> examples -> fine-tune / few-shots`,
    deepDives: [
      {
        topic: 'Confidence and straight-through processing',
        discussion: `Human review is the biggest cost, so the system lives or dies on **calibrated confidence**: send to review exactly the documents likely to be wrong.

Signals per field: token log-probabilities of the extracted value, OCR word confidence in the source region, agreement between two extraction methods (LLM vs template/regex for known vendors), and validation results. Combine them in a small model (logistic regression) trained on reviewer corrections to predict "field is correct".

Set thresholds per field by cost: a wrong total or bank account is expensive (low threshold for review), a wrong line-item description is cheap. Plot accuracy vs STP rate on a held-out set and choose the operating point meeting 99% post-review accuracy.

Track STP rate and post-STP error rate (audited samples) per vendor — new vendors start in review until confidence data accumulates.`,
      },
      {
        topic: 'Line-item tables',
        discussion: `Line items are the hardest part: multi-page tables, merged cells, wrapped descriptions, subtotals mid-table.

- Use layout-aware OCR that outputs table structure (rows/cells) rather than plain text; render tables to markdown with explicit cell boundaries for the LLM.
- For very complex layouts, a **vision-language model** reading the page image directly often beats text pipelines; use it as a second opinion when sums do not match.
- Validate arithmetic per line (qty × unit price = amount) and overall sums; a mismatch pinpoints which row is wrong for the reviewer.
- For multi-page tables, process page by page with carried-over headers and merge, de-duplicating repeated header rows.
- Keep bounding boxes for each extracted cell so reviewers click a field and see its source on the image.`,
      },
      {
        topic: 'Exactly-once posting and auditability',
        discussion: `Paying an invoice twice is the most expensive failure. Queues are at-least-once, reviewers may double-submit, and vendors resend invoices.

- **Business duplicate check** before posting: same vendor + invoice number, or same vendor + amount + date within a window, flags a probable duplicate for review.
- **Technical idempotency**: the ERP posting call uses an idempotency key derived from (vendor id, invoice number, document hash); the connector records posted keys in a table with a unique constraint and checks before calling.
- **Outbox pattern**: the state change "approved" and the outbox record are written in one transaction; a relay posts to the ERP and marks completion.
- **Audit**: store the original file (immutable, hashed), OCR output, model and prompt versions, extracted JSON, validation results, reviewer edits with user ids and timestamps. Auditors can reconstruct every decision.`,
      },
    ],
    tradeoffs: [
      'LLM extraction generalises to unseen vendors; template-based extraction is cheaper and more precise for top vendors — use both.',
      'VLMs on page images handle complex layouts but cost more per page than text-based extraction.',
      'Lower review thresholds raise accuracy but increase reviewer headcount; tune per field by error cost.',
      'Fine-tuning a small model cuts per-invoice cost but adds an MLOps lifecycle.',
      'Batch processing at month-end is cheaper (batch APIs) but delays payment workflows.',
    ],
    followUps: [
      { q: 'How do you onboard a new large vendor with a weird layout?', a: 'Route its first invoices to review, collect 20–50 corrected examples, add vendor-specific few-shot examples or a template, and monitor field accuracy until the confidence model allows straight-through processing. Alert if a known vendor’s layout changes, detectable as a sudden confidence drop.' },
      { q: 'How would you detect invoice fraud?', a: 'Flag bank-account changes against the vendor master, invoices from new vendors with urgent terms, amounts just under approval thresholds, duplicates with small variations and image tampering signals. These go to a separate fraud review queue with stricter approval. Every flag is logged with its triggering signals for audit and model tuning.' },
      { q: 'Should you use one VLM call instead of OCR + LLM?', a: 'For many documents a strong VLM extracts directly from images with good accuracy and a simpler pipeline. Costs and latency per page are higher and you lose word-level boxes and OCR confidences, so a hybrid is common: OCR + LLM by default and a VLM for low-confidence or complex pages.' },
    ],
    relatedTopics: ['document-ingestion', 'structured-outputs-tools', 'multimodal-vision', 'hitl-state-machines', 'reliability-async', 'fine-tuning', 'ai-architecture-patterns'],
  },
  {
    id: 'arch-content-moderation',
    company: 'safety',
    title: 'AI content-moderation system for a social platform',
    frequency: 'high',
    level: 'Senior',
    prompt: 'Design a content-moderation system for a social platform with 50M daily posts (text, images, short video) that enforces a 20-category policy, blocks the worst content before publication, supports appeals, and adapts quickly to new abuse trends.',
    clarifyingQuestions: [
      'Which categories must be blocked pre-publication (CSAM, violent extremism) vs reviewed post-publication?',
      'What latency is acceptable before a post goes live?',
      'What is the human moderator capacity and are there wellness constraints on exposure?',
      'Which markets and languages, and any legal requirements (DSA transparency, notice-and-action)?',
      'How often does the policy change?',
    ],
    functional: [
      'Classify every post against 20 policy categories with severity',
      'Pre-publication blocking for highest-severity categories; post-publication actions (downrank, label, remove) for others',
      'Hash matching against known-bad media databases',
      'Human review queues with prioritisation, and an appeals workflow',
      'Policy versioning and rapid rollout of new rules',
    ],
    nonFunctional: [
      'Pre-publication decision p95 < 300 ms for text, < 2 s for images',
      'Recall ≥ 99% on the most severe categories; precision tuned per category',
      'Handle 50M posts/day (≈ 580/s avg, 2,000/s peak)',
      'Auditability: every action traceable to policy version, model version and reviewer',
      'Cost per post under $0.0005 on average',
    ],
    estimation: [
      { label: 'Traffic', calc: '50M/day ≈ 580/s avg, ~2,000/s peak; 70% text-only, 25% image, 5% video' },
      { label: 'Tier 1 (hash + small classifiers)', calc: 'all posts; small multi-label classifier on GPU: 1 GPU ≈ 2,000 texts/s → 2–3 GPUs for text with headroom' },
      { label: 'Tier 2 (LLM/VLM judge)', calc: 'only ambiguous posts ~3% → 1.5M/day × ~800 tokens ≈ 1.2B tokens/day; at $0.15/1M on a self-hosted or small model ≈ $180/day' },
      { label: 'Human review', calc: '0.3% of posts → 150K/day; at 30 s each = 1,250 hours/day ≈ 160 moderators per day across shifts' },
      { label: 'Cost per post', calc: '(GPU ~$100/day + tier 2 $180/day + video sampling ~$400/day) / 50M ≈ $0.000014, far below budget; humans dominate total cost' },
    ],
    highLevelDesign: `**Layered funnel: cheap, fast checks on everything; expensive judgement on the few; humans on the hardest and highest-impact cases.**

**Tier 0 — hash matching.** Perceptual hashes of images and video frames are matched against industry and internal hash databases of known illegal or previously removed content. Matches are blocked instantly and reported where legally required.

**Tier 1 — fast classifiers (synchronous, pre-publication).** A multi-label text classifier (fine-tuned small transformer) and an image classifier score all 20 categories in milliseconds. Per-category thresholds map scores to actions: **block** (high-severity, high-confidence), **allow**, or **uncertain**. Video: sample keyframes plus audio transcription, processed asynchronously with temporary limited distribution.

**Tier 2 — LLM/VLM policy judge (async or near-sync).** Uncertain items go to an LLM (text) or VLM (images) prompted with the **current policy text** for the relevant categories, few-shot examples and context (thread, account history signals). It returns a structured verdict: category, severity, rationale, policy clause. Because the policy lives in the prompt, new rules roll out in hours instead of retraining weeks. Its labels also become training data for tier 1.

**Tier 3 — human review.** Items with low judge confidence, high reach (viral posts), sensitive categories, or appeals go to moderator queues prioritised by severity × reach. Tools blur graphic content by default (wellness), show model rationale and policy clauses, and record decisions with reasons.

**Actions and appeals.** An enforcement service applies actions (remove, label, downrank, restrict account) idempotently, notifies the user with the policy reason, and opens an appeals flow reviewed by a different moderator.

**Adaptation loop.** Trend detection clusters newly flagged content (embeddings) to discover emerging abuse patterns; red-team prompts and adversarial examples (leetspeak, coded language, text in images) feed evaluation sets; tier-1 models retrain weekly on fresh judge and human labels.

**Governance.** Policy versions, model versions and thresholds are managed in a **control plane** with canary rollouts and per-category precision/recall dashboards; transparency reports are generated from the action log.`,
    diagram: `   new post (text | image | video)
          |
          v
 +------------------+  match   +---------------------------+
 | T0 HASH MATCH    |--------->| BLOCK + legal reporting   |
 +--------+---------+          +---------------------------+
          v no match
 +------------------+  block/allow (high confidence)
 | T1 FAST CLASSIF. |------------------------------> ENFORCEMENT
 | 20 categories,   |                                 |  ^
 | ms latency       |  uncertain (~3%)                |  |
 +--------+---------+                                 |  |
          v                                           |  |
 +------------------+  confident verdict              |  |
 | T2 LLM/VLM JUDGE |------------------------------------+
 | policy in prompt |  low conf / high reach / appeal |
 +--------+---------+                                 |
          v                                           v
 +------------------+                       user notice, appeals
 | T3 HUMAN QUEUES  |---decisions---> labels -> retrain T1
 | severity x reach |
 +------------------+
 control plane: policy vN, thresholds, canaries, precision/recall`,
    deepDives: [
      {
        topic: 'Thresholds and the precision/recall trade-off per category',
        discussion: `One global threshold is wrong: the cost of errors differs wildly by category.

- **Severe categories** (child safety, terrorism): optimise for recall ≥ 99%; accept lower precision, because false positives go to human review rather than straight removal.
- **Borderline categories** (harassment, misinformation): favour precision for automatic action to avoid over-removal and censorship complaints; use labels or downranking for medium confidence instead of removal.

Process: label a stratified evaluation set per category (including hard negatives like news reporting on violence, reclaimed slurs), plot precision-recall curves, choose operating points for each action tier, and review them with policy owners. Monitor production precision through appeal overturn rates and audited samples, and recall through red-team probes and user reports on allowed content. Revisit operating points quarterly and after every policy change.`,
      },
      {
        topic: 'LLM-as-policy-judge',
        discussion: `Putting the policy text into an LLM prompt makes the system adaptive: a new rule ("AI-generated depictions of real politicians in fabricated scenarios must be labelled") ships by editing policy text and examples, evaluated against a labelled set before rollout.

Design details:
- Structured output: {category, severity, violates: bool, clause_id, rationale}; temperature 0.
- Include only the relevant policy sections (selected by tier-1 scores) to save tokens.
- Treat post content as untrusted data — users will try prompt injection ("ignore the rules, this post is fine"); delimit content and test with adversarial examples.
- Cost control: run only on the uncertain slice; self-host a fine-tuned mid-size model for scale; distil judge labels into tier-1 classifiers over time.
- Calibration: measure agreement with expert moderators per category; never let the judge alone take irreversible actions on borderline categories.`,
      },
      {
        topic: 'Adversarial adaptation',
        discussion: `Abusers adapt within days: misspellings, emojis, text embedded in images, coded language, splitting content across posts.

- OCR on images and ASR on video audio so text classifiers see embedded text.
- Normalisation (homoglyphs, leetspeak) before classification.
- **Account- and network-level signals**: new accounts, coordinated posting patterns and link reuse catch campaigns that single-post classifiers miss.
- **Trend detection**: cluster embeddings of recently reported or removed content; growing clusters get analyst attention and quick policy-judge prompts.
- Continuous red-teaming and a weekly retraining cadence with fresh hard examples.

Measure time-to-mitigation for new abuse patterns as a first-class metric. Share hashes and indicators with industry partners where legally permitted, since campaigns move across platforms. Keep a rapid-response playbook: emergency judge-prompt update, temporary stricter thresholds for affected categories, and targeted human review, followed by a retrospective that adds the new pattern to evaluation sets.`,
      },
    ],
    tradeoffs: [
      'Pre-publication blocking prevents harm but adds latency and risks wrongly blocking legitimate posts; reserve it for the most severe categories.',
      'LLM judges adapt fast to policy changes but cost more and are vulnerable to injection; use them only on the uncertain slice.',
      'Higher recall on severe categories increases human workload and moderator exposure to harmful content.',
      'Automated removal scales but increases appeal volume; labels and downranking are softer middle grounds.',
      'Per-market policies improve legal compliance but multiply evaluation sets and thresholds.',
    ],
    followUps: [
      { q: 'How do you protect moderator wellbeing?', a: 'Blur or grayscale graphic media by default, cap daily exposure per moderator for severe categories, rotate queues, and use model pre-classification so moderators know what to expect. Provide counselling and auto-close duplicates of already-reviewed content via hashing. Track wellbeing indicators alongside throughput.' },
      { q: 'How do you measure the system is working?', a: 'Track prevalence (the share of views on violating content, estimated by sampling), precision via appeal overturn rates, recall via red-team probes and audited allowed samples, time-to-action and moderator throughput. Report per category and market, with prevalence as the north-star metric.' },
      { q: 'A new policy must be enforced tomorrow. What do you do?', a: 'Write the policy text and 30–50 labelled examples, evaluate the LLM judge on them, deploy the updated judge prompt via the control plane in canary mode with human review of its decisions, then promote. Collect labels for a tier-1 classifier update in the following weeks.' },
    ],
    relatedTopics: ['red-teaming-responsible-ai', 'privacy-guardrails', 'ai-security-injection', 'multimodal-vision', 'llm-evaluation', 'hitl-state-machines', 'model-serving-routing'],
  },
  {
    id: 'arch-graphrag-compliance',
    company: 'safety',
    title: 'GraphRAG compliance assistant for regulations and internal controls',
    frequency: 'medium',
    level: 'Staff',
    prompt: 'Design an assistant for a global bank’s compliance team that answers questions like "which of our controls address DORA Article 11 and which business units have open findings against them?" by combining regulations, internal policies, controls and audit findings, with fully traceable answers.',
    clarifyingQuestions: [
      'Which corpora: regulations (DORA, GDPR, Basel), internal policies, control library, audit findings, risk register?',
      'Are there existing mappings (regulation → policy → control) in a GRC tool?',
      'How often do regulations and internal documents change, and are effective dates important?',
      'Who are the users and what are their access restrictions (findings may be confidential)?',
      'Must every answer be reproducible for regulators (same question, same evidence)?',
    ],
    functional: [
      'Answer questions spanning multiple linked entities (regulation ↔ policy ↔ control ↔ finding ↔ business unit)',
      'Provide citations to specific articles, policy clauses and control ids',
      'Support gap analysis: requirements without mapped controls',
      'Track versions and effective dates of regulations and policies',
      'Allow compliance analysts to confirm or correct extracted relationships',
    ],
    nonFunctional: [
      'Every claim traceable to a source passage or graph edge with provenance',
      'Answer p95 < 15 s for multi-hop questions',
      'Access control on findings and confidential policies',
      'Reproducibility: answers logged with graph snapshot and model versions',
      'Extracted-relationship precision ≥ 95% before relationships become “confirmed”',
    ],
    estimation: [
      { label: 'Corpus', calc: '40 regulations × ~300 articles = 12K articles; 3K internal policy docs × 20 clauses = 60K clauses; 8K controls; 25K findings' },
      { label: 'Graph size', calc: 'nodes ≈ 12K + 60K + 8K + 25K + 500 BUs ≈ 106K; edges (maps_to, implements, has_finding, owned_by) ≈ 10 per node ≈ 1M — small for Neo4j/Neptune' },
      { label: 'Extraction cost', calc: '72K text units × ~1,500 tokens in / 400 out with frontier model ($3/$15) ≈ 72K × $0.0105 ≈ $760 one-off; monthly delta ~5% ≈ $40' },
      { label: 'Query cost', calc: '500 analysts × 10 questions/day = 5K/day; ~4 LLM calls × 6K tokens ≈ 24K in / 1.5K out → ≈ $0.095/question ≈ $475/day (illustrative)' },
      { label: 'Vector index', calc: '72K units × 4 chunks × 1024-d float32 ≈ 1.2 GB — fits in memory on one node' },
    ],
    highLevelDesign: `**Hybrid GraphRAG: a curated knowledge graph for relationships plus vector/BM25 retrieval for text, combined by an agentic query planner.**

**Knowledge graph build.**
- **Structured sources first**: the GRC tool already holds control ids, owners, business units and findings — import them as nodes and edges with high confidence. This is the backbone.
- **LLM extraction for unstructured links**: regulations and policies are chunked by article/clause (structure-aware). An LLM extracts entities (requirement, obligation, deadline) and proposes relationships such as policy clause → addresses → regulation article, control → implements → policy clause, with evidence quotes.
- **Entity resolution** merges duplicates ("ICT risk framework" vs "ICT Risk Management Framework") using names, embeddings and ids.
- **Human confirmation**: proposed edges carry status (proposed/confirmed), confidence and provenance (document, version, quote, extractor version). Analysts review proposed edges in a queue; only confirmed edges are used for regulatory-grade answers (proposed ones shown with a warning).
- **Versioning**: nodes have effective dates; regulation amendments create new versions linked by supersedes edges.

**Query path.**
1. **Query planner** (LLM with tools) decomposes the question: identify entities (DORA Art. 11), decide on graph traversal vs text search.
2. **Graph tools**: parameterised Cypher templates (not free-form generation) — e.g. controls_for_article(article_id), open_findings_for_controls(control_ids, as_of_date) — with ACL filters applied server-side.
3. **Text retrieval**: hybrid search over articles and clauses for interpretive questions ("what does Art. 11 require for backup testing?").
4. **Synthesis** with citations to graph paths (Article → Policy clause → Control → Finding) and text passages.
5. **Verification**: every cited id must exist in the retrieved subgraph or passages; unsupported claims removed.

**Audit.** Each answer stores the question, plan, graph snapshot version, queries executed, evidence and model versions — reproducible for regulators. Access controls on confidential findings apply both in graph tools and text retrieval, and a feedback button lets analysts flag wrong relationships directly into the review queue.`,
    diagram: `  BUILD                                      QUERY
+---------------+  import (high confidence)   analyst question (SSO)
| GRC tool:     |--------------+                     |
| controls, BUs,|              v                     v
| findings      |     +-----------------+   +-------------------+
+---------------+     | KNOWLEDGE GRAPH |   | QUERY PLANNER     |
+---------------+     | Article-Clause- |<--| (LLM + tools)     |
| Regulations   |     | Control-Finding-|   +----+---------+----+
| Policies      |--+  | BU, versions,   |        |         |
+---------------+  |  | provenance      |  graph tools   text search
                   |  +--------^--------+  (Cypher       (hybrid over
   chunk by article|           | confirmed  templates,    articles/
                   v           |  edges     ACL filters)  clauses)
        +------------------+   |                 |         |
        | LLM EXTRACTION + |---+                 v         v
        | entity resolution|  proposed  [SYNTHESIS with path + text
        +--------+---------+  edges      citations] -> [VERIFY ids]
                 v                                         |
        [ANALYST REVIEW QUEUE]            answer + audit record
                                          (graph snapshot, queries)`,
    deepDives: [
      {
        topic: 'Why a graph, and why not only vector RAG',
        discussion: `Questions like "which controls address Art. 11 and which BUs have open findings against them" are **multi-hop joins**: article → clauses → controls → findings → business units, filtered by status and date. Vector retrieval finds passages similar to the question, but it cannot reliably enumerate every control linked to an article or aggregate across 25K findings — it returns the top k similar chunks, missing items and giving no guarantee of completeness.

A graph makes relationships explicit and queryable, gives **complete** answers for enumerations and aggregations, and provides **traceable paths** that compliance teams and regulators can audit. Vector/BM25 retrieval remains essential for interpretive questions over the actual regulation text. The hybrid is what makes the assistant both complete and explanatory. Microsoft's GraphRAG popularised LLM-built graphs with community summaries for global questions; here, much of the graph comes from authoritative structured data, with LLM extraction filling gaps under human review.`,
      },
      {
        topic: 'Safe graph querying',
        discussion: `Letting an LLM write arbitrary Cypher is risky (wrong joins, expensive traversals, bypassed ACLs, injection).

- Expose **parameterised query templates** as tools: controls_for_article, findings_for_controls, gaps_for_regulation, path_between(entity_a, entity_b, max_hops = 4). The model chooses tools and fills ids; the server owns the query text.
- Entity linking first: map "DORA Article 11" to a node id via a lookup tool (exact + fuzzy + embedding), and ask the user if ambiguous.
- **ACL filters** injected server-side: confidential findings only for authorised roles.
- Limits: max hops, max rows, timeouts.
- For rare advanced needs, allow read-only generated Cypher in an analyst mode with validation (parse, read-only, LIMIT) and display the query.

Evaluate tool-selection accuracy and answer completeness on a set of 150 analyst questions with gold answers derived from the GRC system.`,
      },
      {
        topic: 'Governance of extracted relationships',
        discussion: `An incorrect "control X implements Art. 11" edge can mislead a regulatory submission, so extracted knowledge needs a lifecycle.

- Every edge stores provenance: source document and version, evidence quote, extractor model and prompt version, confidence, and reviewer.
- States: proposed → confirmed or rejected; regulatory-grade answers use only confirmed edges and state the confirmation date.
- Review prioritisation: edges touching high-risk regulations or many downstream findings first.
- Change management: when a regulation is amended, impacted edges are re-proposed and flagged for review; the graph snapshot version changes.
- Measure extraction precision and recall on a labelled sample each release; regressions block deployment of new extraction prompts. Rejected edges are kept with reasons, so the same false link is not re-proposed by the next extraction run.`,
      },
    ],
    tradeoffs: [
      'A curated graph gives completeness and traceability but needs ongoing human curation effort.',
      'LLM-extracted edges scale coverage quickly but require review before regulatory use.',
      'Template graph tools are safe and predictable but less flexible than free-form Cypher generation.',
      'Point-in-time versioning supports audits but complicates queries and storage.',
      'Frontier models improve extraction quality at higher one-off cost, which is small at this corpus size.',
    ],
    followUps: [
      { q: 'How do you answer "what changed for us when DORA came into force"?', a: 'Use effective-dated versions: diff the subgraph of requirements and mapped controls before and after the effective date, list new requirements without mapped controls as gaps, and have the LLM summarise the diff with citations to each changed node and edge.' },
      { q: 'How do you evaluate completeness?', a: 'For enumeration questions, derive gold answers directly from the GRC system and measure set recall and precision of returned entities. For interpretive questions, use expert-written reference answers with citation checks. Track both per regulation. Report detected gaps to analysts so missing edges enter the review queue.' },
      { q: 'Would you use community summaries like Microsoft GraphRAG?', a: 'They help global questions such as main themes across all audit findings this year. Build them over finding clusters as a secondary capability, but keep regulatory answers grounded in explicit paths and passages rather than generated summaries. Label summaries clearly as generated overviews.' },
    ],
    relatedTopics: ['graphrag-multimodal-rag', 'knowledge-graphs', 'retrieval-fundamentals', 'advanced-retrieval', 'groundedness-hallucinations', 'red-teaming-responsible-ai', 'hitl-state-machines'],
  },
];
