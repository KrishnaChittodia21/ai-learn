import type { Topic } from '../../types';

const topic: Topic = {
  id: 'ai-applications',
  phase: 'multimodal',
  order: 3,
  title: 'AI Applications: Text-to-SQL, Chatbots and Enterprise Search',
  subtitle: 'Three production patterns you will be asked to build, and the guard rails that keep them safe',
  estimatedMinutes: 44,
  sources: [
    'Yu et al. 2018 — Spider: a large-scale cross-domain Text-to-SQL benchmark',
    'Li et al. 2023 — BIRD: Can LLM Already Serve as a Database Interface? (big-bench for text-to-SQL)',
    'Lei et al. 2024 — Spider 2.0: evaluating LLMs on real-world enterprise text-to-SQL workflows',
    'PostgreSQL docs — Roles and privileges, default_transaction_read_only, statement_timeout, Row Level Security',
    'node-sql-parser — npm package (AST parsing and table lists)',
    'Anthropic — Building effective agents (routing and workflows)',
    'Microsoft — Copilot / Graph connectors and security trimming documentation',
    'Elastic / OpenSearch docs — document-level security',
  ],
  tags: ['text-to-sql', 'chatbots', 'enterprise-search', 'acl', 'rag', 'sql-safety', 'session-state'],
  cheatSheet: [
    'Text-to-SQL = schema linking (pick relevant tables/columns) → generate SQL → validate AST → execute read-only → summarise.',
    'Never trust generated SQL: read-only role, SELECT-only AST check, table allowlist, LIMIT injection, statement_timeout ~5 s.',
    'Row-level security (RLS) in the database enforces tenant isolation even if the model writes a bad WHERE clause.',
    'Feed the model a compact schema: table + column names, types, FK hints, sample values and business glossary — not the full DDL of 900 tables.',
    'Execution errors are training signal: feed the DB error back for one or two self-correction attempts.',
    'Chatbot = router + session state + memory (summary + retrieved facts) + tools + escalation; keep state outside the LLM.',
    'Escalate to a human on low confidence, repeated failure, explicit request, angry sentiment or regulated topics — with the full context handed over.',
    'Enterprise search: connectors → chunk + embed with ACL metadata → hybrid retrieval with permission pre-filter → rerank → cited answer.',
    'ACL check at query time with the caller\'s groups; post-filtering top-k leaks result counts and can return empty pages.',
    'Track permission sync lag: a revoked user must lose access within minutes, so sync ACL changes faster than content.',
  ],
  sections: [
    {
      heading: 'Text-to-SQL — schema linking, generation and query guarding',
      body: `**Intuition:** text-to-SQL is a junior analyst who knows SQL but not your database. Give them the right part of the schema, a few worked examples and a strictly read-only login, and check their query before it runs.

**Pipeline.**
1. **Schema linking:** from hundreds of tables, retrieve the 3–8 relevant ones (embed table/column descriptions; match entity values like "Berlin" to city columns).
2. **Prompt:** compact schema (names, types, FKs, sample values), a business glossary ("active customer = order in last 90 days"), 3–5 few-shot question→SQL pairs retrieved by similarity, dialect.
3. **Generate** SQL (structured output: {sql, tables_used, assumptions}).
4. **Validate:** parse to an AST; allow only a single SELECT; tables in an allowlist; inject LIMIT; reject functions like pg_sleep or dblink.
5. **Execute** with a read-only role, statement_timeout and row-level security.
6. **Repair:** on a DB error, send the error back once or twice.
7. **Answer:** summarise rows and show the SQL for transparency.

**Defence in depth.**
| Layer | Stops |
|---|---|
| Read-only DB role + default_transaction_read_only | DROP/UPDATE even if validation misses it |
| AST allowlist | multi-statements, non-SELECT, unknown tables |
| statement_timeout + LIMIT | runaway cross-joins |
| Row-level security | cross-tenant data leaks |

**Benchmarks.** Spider (cross-domain), BIRD (dirty real values, efficiency) and Spider 2.0 (enterprise-scale schemas) — accuracy drops sharply as schemas grow, which is why schema linking matters most.

**When to use.** Self-serve analytics over well-modelled warehouses. Prefer a semantic layer (metrics definitions) or predefined parameterised queries when numbers must be audited.`,
      example: `**Question:** "Top 3 products by revenue in Germany last quarter."

- Schema linking picks orders, order_items, products, customers (from 240 tables) — prompt shrinks from ~60k to ~1.8k tokens.
- Generated: SELECT p.name, SUM(oi.qty * oi.unit_price) AS revenue FROM order_items oi JOIN orders o … WHERE c.country = 'DE' AND o.created_at >= '2026-04-01' AND o.created_at < '2026-07-01' GROUP BY p.name ORDER BY revenue DESC LIMIT 3
- First attempt used c.country = 'Germany' → 0 rows. Sample values in the schema ("country: 'DE','FR','US'") fixed it.
- Validator: single SELECT ✔, tables in allowlist ✔, LIMIT present ✔. Ran in 140 ms under the analyst_ro role.`,
      diagram: `question ─► schema linker (embeddings + value index) ─► 5 of 240 tables
                                     │
            few-shot examples ──────►├─► LLM ─► {sql, assumptions}
            glossary + dialect ─────►┘              │
                                                    ▼
                      AST validator: SELECT only, allowlist, LIMIT
                                                    │ ok
                                                    ▼
           read-only role + statement_timeout + RLS ─► rows ─► summary
                    ▲                                   │ error
                    └──────── repair (≤2 tries) ◄──────┘`,
      code: [
        {
          language: 'typescript',
          title: 'Validate and execute model-generated SQL safely',
          code: `import pkg from 'node-sql-parser';
import pg from 'pg';

const { Parser } = pkg;
const parser = new Parser();
const ALLOWED = new Set(['orders', 'order_items', 'products', 'customers']);
const pool = new pg.Pool({ connectionString: process.env.ANALYTICS_RO_URL }); // read-only role

export function guardSql(sql: string, maxRows = 500): string {
  const opt = { database: 'PostgreSQL' };
  const ast = parser.astify(sql, opt);
  const stmts = Array.isArray(ast) ? ast : [ast];
  if (stmts.length !== 1 || stmts[0].type !== 'select') throw new Error('only a single SELECT is allowed');
  // tableList entries look like "select::null::orders"
  for (const t of parser.tableList(sql, opt)) {
    const [op, , table] = t.split('::');
    if (op !== 'select' || !ALLOWED.has(table)) throw new Error('table not allowed: ' + table);
  }
  if (/\\b(pg_sleep|dblink|pg_read_file|lo_import)\\b/i.test(sql)) throw new Error('forbidden function');
  // wrap rather than edit: guarantees a LIMIT even with nested queries
  return 'SELECT * FROM (' + sql.replace(/;\\s*$/, '') + ') AS q LIMIT ' + maxRows;
}

export async function runSafe(sql: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const res = await client.query(guardSql(sql));
    await client.query('COMMIT');
    return res.rows;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e; // caller feeds the error message back to the LLM for repair
  } finally {
    client.release();
  }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Business users get answers without waiting for an analyst.',
          'SQL is inspectable: show it with the answer so experts can verify.',
          'Execution errors give a precise, automatic repair signal.',
        ],
        cons: [
          { con: 'Large schemas overwhelm the prompt and confuse the model.', fix: 'Schema linking with embeddings over table/column descriptions plus a value index; send only the top tables.' },
          { con: 'Syntactically valid SQL with wrong business logic ("revenue" including refunds).', fix: 'Provide a glossary or semantic layer with certified metric definitions and few-shot examples using them.' },
          { con: 'Destructive or expensive queries.', fix: 'Read-only role, AST allowlist, LIMIT wrapping, statement_timeout, and run against a replica.' },
          { con: 'Cross-tenant leakage via missing WHERE clauses.', fix: 'Enforce tenant isolation with Postgres row-level security keyed on a session variable, not prompt instructions.' },
        ],
      },
      keyPoints: [
        'Schema linking is the biggest accuracy lever on real databases.',
        'Validate the AST, then execute with least privilege — both, not either.',
        'Feed DB errors back for bounded self-repair.',
        'Show the SQL; certify metric definitions in a semantic layer.',
      ],
      exercise: {
        prompt: `Write **isSafeSelect(sql)** using a lightweight approach (no parser) as a pre-check.

Acceptance criteria:
- Reject if there is more than one statement (a semicolon not at the very end).
- Reject if the first keyword is not SELECT or WITH.
- Reject if any of INSERT, UPDATE, DELETE, DROP, ALTER, GRANT, TRUNCATE, COPY appear as whole words outside string literals.
- isSafeSelect("SELECT name FROM t WHERE note = 'drop it'") → true; isSafeSelect('SELECT 1; DROP TABLE t') → false.`,
        starter: {
          language: 'typescript',
          code: `export function isSafeSelect(sql: string): boolean {
  // TODO: strip string literals so 'drop it' does not trigger the denylist
  // TODO: check statement count, first keyword, and forbidden words
  return false;
}`,
        },
        hints: [
          'Replace string literals with a placeholder: sql.replace(/\'(?:[^\']|\'\')*\'/g, "\'\'").',
          'Trim and remove one trailing semicolon, then check if any ";" remains.',
          'This is a pre-check only — the AST validator and read-only role remain the real controls.',
        ],
        solution: {
          language: 'typescript',
          code: `const FORBIDDEN = /\\b(insert|update|delete|drop|alter|grant|truncate|copy|create)\\b/i;

export function isSafeSelect(sql: string): boolean {
  const noStrings = sql.replace(/'(?:[^']|'')*'/g, "''");          // remove literal contents
  const noComments = noStrings.replace(/--.*$/gm, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
  const body = noComments.trim().replace(/;\\s*$/, '');
  if (body.includes(';')) return false;                              // multiple statements
  if (!/^(select|with)\\b/i.test(body)) return false;
  return !FORBIDDEN.test(body);
}

console.log(isSafeSelect("SELECT name FROM t WHERE note = 'drop it'")); // true
console.log(isSafeSelect('SELECT 1; DROP TABLE t'));                     // false
console.log(isSafeSelect('WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x')); // false`,
        },
        explanation: 'Stripping literals and comments avoids false positives and hidden payloads, and the CTE example shows why checking only the first keyword is insufficient (data-modifying CTEs). Regex checks are a fast first filter; least-privilege DB roles are what actually guarantee safety.',
      },
      quickCheck: {
        question: 'Your text-to-SQL validator only allows SELECT. Why do you still need a read-only database role?',
        options: [
          'Because SELECT statements are slower without it',
          'Because validators have gaps (data-modifying CTEs, side-effect functions), and the role enforces safety even when validation fails',
          'Because the LLM can see the role name and will behave better',
        ],
        correct: 1,
        explanation: 'Parsers and regexes miss edge cases; a read-only role (plus read-only transactions) is enforced by the database itself. Defence in depth means each layer still holds when another fails.',
      },
      source: 'BIRD benchmark; PostgreSQL docs — privileges and RLS',
    },
    {
      heading: 'AI Chatbots — session state, memory, routing and escalation',
      body: `**Intuition:** a production chatbot is not "an LLM in a chat box"; it is a small service with a receptionist (router), a notebook (state and memory), specialists (tools and RAG) and a manager to call (human escalation).

**Architecture.**
- **Session state** (Redis/Postgres): conversation id, user id and entitlements, current intent, slots filled (order id, email), turn count, escalation flags. The LLM reads it; your code owns it.
- **Memory:** last N turns verbatim + a rolling **summary** of older turns + long-term facts (preferences, past tickets) retrieved per turn. Keep the prompt bounded (e.g. ≤ 6k tokens).
- **Router:** a cheap classifier or small model maps the message to intents (billing, order status, technical, chit-chat, out-of-scope) and picks the handler, model and tools.
- **Handlers:** RAG over help docs, tool calls to backend APIs (with the user's auth, not a god token), or scripted flows for regulated steps (refunds, cancellations).
- **Guardrails:** input moderation and injection checks, output policy checks, PII handling.
- **Escalation:** handoff to a human with transcript, summary, intent and slots when confidence is low, the user asks, sentiment turns negative, or the same intent fails twice.

**Metrics.** Containment (resolved without humans), CSAT, escalation precision (were handoffs necessary?), first-contact resolution, hallucination rate from sampled reviews, p95 latency.

**When to use.** High-volume, repetitive support and internal helpdesks. Keep humans for judgement, exceptions and empathy-heavy cases.`,
      example: `**Turn 7 of a delivery-issue chat.**

State: {intent: 'order_status', order_id: 'A-1042', failures: 1, sentiment: -0.6}
User: "This is the third time I'm asking. Where is my parcel??"

- Router: intent order_status (0.93).
- Tool getShipment(A-1042) → "lost in transit".
- Policy: failures ≥ 1 and sentiment < −0.5 and lost parcel ⇒ **escalate**.
- Bot: "I'm sorry — your parcel is marked lost. I'm connecting you to an agent who can reissue it now."
- Agent receives: 3-line summary, order id, tool results, full transcript. Average handle time fell from 6.5 to 3.9 minutes because agents no longer re-ask questions.`,
      diagram: `user msg ─► guard (moderation, injection) ─► router (intent, conf)
                                                   │
          ┌─────────────┬───────────────┬──────────┴─────┐
          ▼             ▼               ▼                ▼
       FAQ RAG     tool flows       scripted flow     escalate ─► human
          │        (user-scoped)    (refund/cancel)       ▲ summary+state
          └───────► LLM answer ◄────────┘                 │
                        │                                 │
  session store ◄──── update state / memory ──── policy: low conf,
  (Redis: slots,       summary every 10 turns          2 fails, anger
   summary, flags)`,
      code: [
        {
          language: 'typescript',
          title: 'Bounded memory, routing and an escalation policy',
          code: `import Redis from 'ioredis';
import Anthropic from '@anthropic-ai/sdk';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const llm = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';
const SMALL = process.env.SMALL_MODEL ?? 'claude-haiku-4-5';

type Turn = { role: 'user' | 'assistant'; content: string };
type Session = { summary: string; turns: Turn[]; failures: number; intent?: string };

async function load(id: string): Promise<Session> {
  const raw = await redis.get('chat:' + id);
  return raw ? JSON.parse(raw) : { summary: '', turns: [], failures: 0 };
}

async function compact(s: Session) {
  if (s.turns.length <= 12) return;               // keep the last 12 turns verbatim
  const old = s.turns.splice(0, s.turns.length - 12);
  const r = await llm.messages.create({ model: SMALL, max_tokens: 300, messages: [{ role: 'user',
    content: 'Update this support-chat summary with the new turns. Keep ids, amounts, promises.\\n' +
      'Summary: ' + s.summary + '\\nTurns: ' + JSON.stringify(old) }] });
  s.summary = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('') || s.summary;
}

export function shouldEscalate(s: Session, msg: string, confidence: number) {
  return /\\b(human|agent|person)\\b/i.test(msg) || s.failures >= 2 || confidence < 0.5;
}

export async function chat(id: string, msg: string, confidence: number) {
  const s = await load(id);
  if (shouldEscalate(s, msg, confidence)) return { handoff: true, summary: s.summary, turns: s.turns };
  s.turns.push({ role: 'user', content: msg });
  const r = await llm.messages.create({
    model: MODEL, max_tokens: 500,
    system: 'You are Acme support. Conversation summary so far: ' + (s.summary || 'none'),
    messages: s.turns,
  });
  const text = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('') || '';
  s.turns.push({ role: 'assistant', content: text });
  await compact(s);
  await redis.set('chat:' + id, JSON.stringify(s), 'EX', 60 * 60 * 24); // 24 h session TTL
  return { handoff: false, text };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Contains a large share of repetitive contacts 24/7 at a fraction of agent cost.',
          'Explicit state makes behaviour testable and auditable.',
          'Good handoffs make human agents faster, not just less busy.',
        ],
        cons: [
          { con: 'Unbounded history raises cost and latency every turn.', fix: 'Keep the last N turns plus a rolling summary, and retrieve long-term facts on demand.' },
          { con: 'Bot confidently invents policies or promises.', fix: 'Ground answers in retrieved policy docs with citations and route money-moving actions through scripted, tool-validated flows.' },
          { con: 'Users get stuck in loops with no way out.', fix: 'Escalation policy: explicit request, two failures on the same intent, negative sentiment or low router confidence.' },
          { con: 'Tools run with excessive privilege.', fix: 'Call backend APIs with the end user\'s scoped token and enforce authorisation server-side.' },
        ],
      },
      keyPoints: [
        'Your code owns state; the LLM reads it.',
        'Memory = recent turns + summary + retrieved facts, with a token budget.',
        'Route by intent to RAG, tools or scripted flows.',
        'Escalate early with full context; measure containment and CSAT together.',
      ],
      exercise: {
        prompt: `Implement **buildPrompt(session, budgetTokens)** that assembles chat messages under a token budget.

Acceptance criteria:
- session = { summary: string, facts: string[], turns: {role, content}[] }.
- Always include the summary and facts in the system prompt.
- Add turns from newest to oldest until the budget (≈ chars/4) would be exceeded; output them in chronological order.
- The latest user turn must always be included even if it alone exceeds the budget.`,
        hints: [
          'Estimate tokens with Math.ceil(text.length / 4).',
          'Iterate turns from the end, unshift into a result array.',
        ],
        solution: {
          language: 'typescript',
          code: `type Turn = { role: 'user' | 'assistant'; content: string };
type Session = { summary: string; facts: string[]; turns: Turn[] };
const tok = (s: string) => Math.ceil(s.length / 4);

export function buildPrompt(s: Session, budgetTokens: number) {
  const system = 'Summary: ' + (s.summary || 'none') + '\\nKnown facts:\\n- ' + s.facts.join('\\n- ');
  let used = tok(system);
  const kept: Turn[] = [];
  for (let i = s.turns.length - 1; i >= 0; i--) {
    const t = s.turns[i];
    const cost = tok(t.content);
    const isLatest = i === s.turns.length - 1;
    if (!isLatest && used + cost > budgetTokens) break; // stop at first turn that does not fit
    kept.unshift(t);
    used += cost;
  }
  return { system, messages: kept, usedTokens: used };
}`,
        },
        explanation: 'Newest turns carry the most relevant context, so the window is filled backwards; older information survives through the summary and facts. Guaranteeing the latest user turn avoids silently answering the wrong question.',
      },
      quickCheck: {
        question: 'A support bot keeps the full transcript in every request. After 40 turns, replies take 6 s and contradict earlier promises. What is the best fix?',
        options: [
          'Switch to a model with a larger context window',
          'Keep recent turns verbatim, a rolling summary of older turns with key commitments, and retrieved facts',
          'Delete history after 10 turns',
        ],
        correct: 1,
        explanation: 'A bounded window plus a summary that explicitly preserves ids, amounts and promises keeps prompts small and consistent. A bigger window keeps cost and latency growing; deleting history loses commitments.',
      },
      source: 'Anthropic — Building effective agents',
    },
    {
      heading: 'Enterprise Search — connectors, hybrid retrieval and ACL-aware answers',
      body: `**Intuition:** enterprise search is RAG with a bouncer. The same question ("what is our 2027 pricing plan?") must return different results for the CFO and an intern, and must never leak that a hidden document exists.

**Pipeline.**
1. **Connectors** pull content and **permissions** from SharePoint, Google Drive, Confluence, Slack, Jira, CRM — via webhooks/delta APIs for freshness.
2. **Normalise ACLs** to principals: user ids and group ids (expand nested groups via the identity provider). Store allowed_principals on every chunk.
3. **Index**: chunk + embed; hybrid index (BM25 + vectors) with metadata (source, owner, updated_at, ACL).
4. **Query**: resolve the caller's principals (user + groups, cached ~5 min) → retrieval with a **pre-filter** allowed_principals ∈ caller principals → rerank → LLM answer with citations → optional re-check of ACL at render time against the source system.
5. **Freshness and recency**: boost recent documents; prefer canonical sources (policy portal > Slack thread).

**Why pre-filter.** Post-filtering top-k after retrieval can return zero results (all top-50 were forbidden) and leaks signal through counts, snippets or answer content. Filter inside the index query.

| Risk | Control |
|---|---|
| Revoked access still searchable | ACL sync faster than content sync; deny-wins re-check at answer time |
| Oversharing ("Everyone" links) | Detect broad sharing; exclude sensitive labels |
| LLM mixing sources | Answer only from permitted chunks; cite each claim |

**When to use.** Knowledge-heavy organisations where answers are scattered across tools. Start with a few high-value sources and measure answer quality per source.`,
      example: `**Query by Priya (groups: eng, eng-platform): "On-call escalation policy for P1 incidents."**

- Principals: [user:priya, group:eng, group:eng-platform, group:all-staff].
- Hybrid retrieval with filter allowed_principals ANY OF principals → 50 candidates from Confluence + Slack.
- Rerank → top 5; the newest Confluence page (updated 12 days ago) outranks a 2023 Slack thread due to recency boost.
- Answer: "P1: page primary on-call immediately; escalate to the secondary after 15 minutes…" [1][2].
- Same query by a contractor without group:eng returns only the public incident-comms page — and the answer does not mention that an internal policy exists.`,
      diagram: `SharePoint/Drive/Confluence/Slack ─► connectors (content + ACL deltas)
                                              │
                         normalise ACL → principals (user, groups)
                                              ▼
           chunks + embeddings + {allowed_principals, source, updated_at}
                                              │ hybrid index
 user ─► IdP: groups (cache 5 min) ─► query + filter(principals) ─► top-50
                                                                    │
                                    rerank ─► LLM (cited) ─► re-check ACL ─► answer`,
      code: [
        {
          language: 'typescript',
          title: 'Permission pre-filtered vector search with Qdrant',
          code: `import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL ?? 'http://localhost:6333' });
const openai = new OpenAI();
const EMBED = 'text-embedding-3-small'; // 1536-d

type Caller = { userId: string; groups: string[] };

export async function searchForUser(caller: Caller, query: string, k = 20) {
  const principals = ['user:' + caller.userId, ...caller.groups.map((g) => 'group:' + g)];
  const emb = await openai.embeddings.create({ model: EMBED, input: query });
  const hits = await qdrant.search('enterprise_chunks', {
    vector: emb.data[0].embedding,
    limit: k,
    // pre-filter INSIDE the ANN search: forbidden chunks are never candidates
    filter: {
      must: [{ key: 'allowed_principals', match: { any: principals } }],
      must_not: [{ key: 'sensitivity', match: { value: 'restricted' } }],
    },
    with_payload: true,
  });
  return hits.map((h) => ({
    score: h.score,
    text: String(h.payload?.text ?? ''),
    source: String(h.payload?.url ?? ''),
    updatedAt: String(h.payload?.updated_at ?? ''),
  }));
}`,
        },
      ],
      prosCons: {
        pros: [
          'One question box across many tools, with cited answers.',
          'Pre-filtered retrieval enforces permissions without leaking existence.',
          'Hybrid retrieval handles both exact terms (ticket ids) and paraphrases.',
        ],
        cons: [
          { con: 'Permission changes lag behind the source system.', fix: 'Sync ACL deltas on webhooks within minutes, cache group membership briefly, and re-check permissions at answer time.' },
          { con: 'Nested and dynamic groups are hard to expand.', fix: 'Resolve principals through the identity provider (transitive membership APIs) and store group ids, not expanded user lists, on chunks.' },
          { con: 'Stale or duplicate documents give outdated answers.', fix: 'Recency boosts, canonical-source weighting, de-duplication, and showing last-updated dates in citations.' },
          { con: 'Overshared content becomes easily discoverable.', fix: 'Respect sensitivity labels, exclude "anyone with the link" shares from indexing, and audit broad-access documents before launch.' },
        ],
      },
      keyPoints: [
        'Index permissions with content; filter inside retrieval.',
        'Resolve principals at query time from the identity provider.',
        'Sync ACL changes faster than content and re-check before showing.',
        'Answer only from permitted chunks, with citations and dates.',
      ],
      exercise: {
        prompt: `Implement **filterByAcl(chunks, caller)** as an in-memory reference implementation and **leakTest()** that proves post-filtering is worse.

Acceptance criteria:
- chunk = { id, score, allowed: string[] }; caller principals as in the section.
- filterByAcl returns the top-k (k=3) permitted chunks by score from the full set (pre-filter semantics).
- postFilter takes the global top-k first and then removes forbidden ones.
- leakTest shows a case where postFilter returns fewer than k results while filterByAcl returns k.`,
        hints: [
          'A chunk is allowed if allowed.some(p => principals.includes(p)).',
          'Build a dataset where the 3 highest-scoring chunks are all restricted.',
        ],
        solution: {
          language: 'typescript',
          code: `type Chunk = { id: string; score: number; allowed: string[] };
const can = (c: Chunk, principals: string[]) => c.allowed.some((p) => principals.includes(p));
const top = (xs: Chunk[], k: number) => [...xs].sort((a, b) => b.score - a.score).slice(0, k);

export const filterByAcl = (chunks: Chunk[], principals: string[], k = 3) =>
  top(chunks.filter((c) => can(c, principals)), k);

export const postFilter = (chunks: Chunk[], principals: string[], k = 3) =>
  top(chunks, k).filter((c) => can(c, principals));

export function leakTest() {
  const chunks: Chunk[] = [
    { id: 'board-1', score: 0.95, allowed: ['group:board'] },
    { id: 'board-2', score: 0.93, allowed: ['group:board'] },
    { id: 'board-3', score: 0.91, allowed: ['group:board'] },
    { id: 'wiki-1', score: 0.80, allowed: ['group:all-staff'] },
    { id: 'wiki-2', score: 0.78, allowed: ['group:all-staff'] },
    { id: 'wiki-3', score: 0.70, allowed: ['group:all-staff'] },
  ];
  const me = ['user:sam', 'group:all-staff'];
  return { pre: filterByAcl(chunks, me).map((c) => c.id), post: postFilter(chunks, me).map((c) => c.id) };
}

console.log(leakTest()); // { pre: ['wiki-1','wiki-2','wiki-3'], post: [] }`,
        },
        explanation: 'Post-filtering spends the top-k budget on documents the user cannot see, returning nothing useful, and the empty result itself hints that restricted content matched. Pre-filtering inside the index query returns the best permitted results.',
      },
      quickCheck: {
        question: 'An employee leaves the finance group at 09:00. At 09:30 they still get answers citing finance documents. What is the most likely gap?',
        options: [
          'The embedding model memorised finance documents',
          'ACL/group membership sync or caching lags behind the identity provider',
          'The reranker ignores permissions',
        ],
        correct: 1,
        explanation: 'Permissions are applied by filtering on principals; if group membership is cached too long or ACL deltas are not synced, revoked users still match. Fix with short caches, webhook-driven sync and an answer-time re-check.',
      },
      source: 'Microsoft Graph connectors — security trimming; Elastic document-level security',
    },
  ],
  codeChallenges: [
    {
      id: 'ai-applications-cc-1',
      title: 'Text-to-SQL endpoint running as the database owner',
      context: 'An analytics bot sends the user question to an LLM and runs whatever SQL comes back using the app\'s main connection string (owner privileges). A user asked "clean up test orders" and the bot ran DELETE.',
      task: 'Make the endpoint safe: read-only connection, AST validation, LIMIT and timeout, tenant isolation, and a bounded repair loop.',
      starter: {
        language: 'typescript',
        code: `import pg from 'pg';
import OpenAI from 'openai';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL }); // owner role
const openai = new OpenAI();

export async function ask(tenantId: string, question: string) {
  const r = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [{ role: 'user', content: 'Schema: ' + FULL_DDL + '\\nTenant ' + tenantId + '. Write SQL for: ' + question }],
  });
  const sql = r.choices[0].message.content!;
  return (await db.query(sql)).rows;
}`,
      },
      hints: [
        'Use a separate pool with a role that only has SELECT on analytics views.',
        'Set the tenant in a session variable and rely on row-level security, not the prompt.',
        'On a DB error, return the error text to the model once or twice.',
      ],
      solution: {
        language: 'typescript',
        code: `import pg from 'pg';
import OpenAI from 'openai';
import pkg from 'node-sql-parser';

const { Parser } = pkg;
const parser = new Parser();
const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
// analytics_ro: GRANT SELECT on analytics views only; RLS policy uses current_setting('app.tenant_id')
const ro = new pg.Pool({ connectionString: process.env.ANALYTICS_RO_URL });
const ALLOWED = new Set(['v_orders', 'v_order_items', 'v_products']);

function guard(sql: string): string {
  const ast = parser.astify(sql, { database: 'PostgreSQL' });
  const list = Array.isArray(ast) ? ast : [ast];
  if (list.length !== 1 || list[0].type !== 'select') throw new Error('Only one SELECT statement is allowed.');
  for (const t of parser.tableList(sql, { database: 'PostgreSQL' })) {
    const name = t.split('::')[2];
    if (!ALLOWED.has(name)) throw new Error('Unknown or forbidden table: ' + name);
  }
  return 'SELECT * FROM (' + sql.replace(/;\\s*$/, '') + ') q LIMIT 200';
}

async function execute(tenantId: string, sql: string) {
  const c = await ro.connect();
  try {
    await c.query('BEGIN READ ONLY');
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]); // RLS key, txn-local
    await c.query("SET LOCAL statement_timeout = '5s'");
    const res = await c.query(guard(sql));
    await c.query('COMMIT');
    return res.rows;
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

export async function ask(tenantId: string, question: string, schemaSnippet: string) {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: 'Write one PostgreSQL SELECT over these views only. Return only SQL.\\n' + schemaSnippet },
    { role: 'user', content: question },
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await openai.chat.completions.create({ model: MODEL, messages });
    const sql = (r.choices[0].message.content ?? '').replace(/^\\s*sql\\s*/i, '').trim();
    try {
      return { sql, rows: await execute(tenantId, sql) };
    } catch (e: any) {
      messages.push({ role: 'assistant', content: sql }, { role: 'user', content: 'Error: ' + e.message + '. Fix the query.' });
    }
  }
  throw new Error('Could not produce a valid query; please rephrase.');
}`,
      },
      explanation: 'Safety now comes from the database, not the prompt: a SELECT-only role on curated views, read-only transactions, timeouts and RLS keyed on a transaction-local tenant setting. The AST guard rejects multi-statements and unknown tables with error messages the model can learn from, and the repair loop is bounded to three attempts.',
      followUps: [
        { q: 'Why use views instead of base tables?', a: 'Views hide sensitive columns, encode joins and business definitions once, and give a small stable surface for both the allowlist and the prompt schema.' },
        { q: 'How do you stop expensive but valid queries?', a: 'Run EXPLAIN first and reject plans above a cost threshold, use a replica, and combine LIMIT with statement_timeout and per-user rate limits.' },
      ],
    },
    {
      id: 'ai-applications-cc-2',
      title: 'Enterprise search that filters permissions after retrieval',
      context: 'A search assistant retrieves the global top-10 chunks, asks the LLM to answer, and then hides citations the user cannot open. Users report answers that quote board-only documents.',
      task: 'Move permission checks before generation: resolve principals, pre-filter retrieval, and re-check ACLs on cited sources.',
      starter: {
        language: 'typescript',
        code: `export async function answer(user: { id: string }, q: string) {
  const hits = await index.search(q, { limit: 10 });          // no ACL filter
  const text = await llm.answer(q, hits.map((h) => h.text));  // LLM sees everything
  const visible = hits.filter((h) => h.acl.includes(user.id)); // filter only citations
  return { text, citations: visible.map((h) => h.url) };
}`,
      },
      hints: [
        'Get the user\'s groups from the identity provider and build principals.',
        'Pass a filter to the search call so forbidden chunks are never candidates.',
        'Before returning, verify each cited document is still accessible (deny wins).',
      ],
      solution: {
        language: 'typescript',
        code: `type Hit = { id: string; text: string; url: string; allowed: string[] };
type Deps = {
  groupsOf(userId: string): Promise<string[]>;                        // IdP, cached ~5 min
  search(q: string, opts: { limit: number; anyOf: string[] }): Promise<Hit[]>;
  canRead(userId: string, url: string): Promise<boolean>;             // live source check
  llmAnswer(q: string, ctx: { n: number; text: string }[]): Promise<{ text: string; cited: number[] }>;
};

export async function answer(deps: Deps, userId: string, q: string) {
  const principals = ['user:' + userId, ...(await deps.groupsOf(userId)).map((g) => 'group:' + g)];
  const hits = await deps.search(q, { limit: 10, anyOf: principals }); // pre-filter in the index
  if (!hits.length) return { text: 'I could not find anything you have access to on that.', citations: [] };

  // deny wins: drop anything revoked since the last ACL sync BEFORE the LLM sees it
  const checks = await Promise.all(hits.map((h) => deps.canRead(userId, h.url)));
  const allowed = hits.filter((_, i) => checks[i]);
  const ctx = allowed.map((h, i) => ({ n: i + 1, text: h.text }));
  const out = await deps.llmAnswer(q, ctx);
  return { text: out.text, citations: out.cited.map((n) => allowed[n - 1]?.url).filter(Boolean) };
}`,
      },
      explanation: 'Once forbidden text reaches the LLM, hiding citations is cosmetic — the answer already leaks content. Filtering by principals inside the index and re-checking live permissions before generation guarantees the model only sees what the user may read; the empty-result message reveals nothing about hidden documents.',
      followUps: [
        { q: 'The live canRead check adds 300 ms. How do you reduce it?', a: 'Batch the checks per source, cache positive results for a short TTL, and rely on webhook-driven ACL sync so live checks are a safety net only for the top cited documents.' },
        { q: 'How would you test this for leaks?', a: 'Seed canary documents restricted to a test group, run a query suite as users outside it, and assert that no canary text, title or citation appears in any answer or log.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'ai-applications-iq-01',
      difficulty: 'hard',
      question: 'Your text-to-SQL assistant works on the demo schema (12 tables) but accuracy collapses on the production warehouse (900 tables). What do you change?',
      whatInterviewerLooksFor: [
        'Identifies schema size and ambiguity as the core issue',
        'Proposes schema linking with retrieval over metadata and values',
        'Adds business semantics (glossary, semantic layer, curated views)',
        'Builds an execution-based evaluation set',
      ],
      modelAnswer: `**Diagnosis.** With 900 tables the schema either does not fit or drowns the model; many tables have similar names (orders, orders_v2, orders_archive), and business meaning ("active", "revenue") lives in people's heads.

**Fixes.**
1. **Curate the surface:** expose ~40 documented views/marts rather than raw tables; mark deprecated tables out of scope.
2. **Schema linking:** embed table and column descriptions; build a **value index** (distinct values of low-cardinality columns such as country codes, plan names). Retrieve the top 5–8 tables per question plus FK paths.
3. **Semantics:** glossary and certified metric definitions (semantic layer such as dbt metrics); few-shot examples retrieved by similarity from a library of verified question→SQL pairs.
4. **Generation discipline:** ask for assumptions; on ambiguous questions, ask a clarifying question instead of guessing.
5. **Execution feedback:** run EXPLAIN/dry-run, feed errors back for ≤2 repairs.

**Evaluation.** 200 real questions with gold SQL; score **execution accuracy** (result sets match), not string match; slice by difficulty and domain. Track schema-linking recall separately — if the right table is not retrieved, generation cannot succeed.`,
      followUps: [
        { q: 'How do you get the gold question/SQL pairs?', a: 'Mine analyst query logs and dashboards, have analysts write questions for them, and verify by execution; grow the set from production failures.' },
        { q: 'When would you not use free-form text-to-SQL at all?', a: 'For audited KPIs and regulated reporting, map questions to parameterised, pre-approved queries or semantic-layer metrics so numbers are always computed one certified way.' },
      ],
      pitfalls: [
        'Sending the entire DDL and hoping long context solves it',
        'Measuring exact SQL string match instead of execution results',
        'No clarifying questions for ambiguous metrics',
      ],
    },
    {
      id: 'ai-applications-iq-02',
      difficulty: 'expert',
      question: 'A multi-tenant SaaS wants "chat with your data" over a shared Postgres database. How do you guarantee one tenant never sees another\'s rows?',
      whatInterviewerLooksFor: [
        'Does not rely on prompt instructions for isolation',
        'Uses row-level security and per-request session context',
        'Least-privilege role, read-only, timeouts',
        'Testing for cross-tenant leaks',
      ],
      modelAnswer: `**Principle:** isolation must be enforced by the database, independent of anything the model writes.

**Implementation.**
- Create a role analytics_ro with SELECT only on tenant-scoped views; no access to base tables, system catalogs beyond need, or functions with side effects.
- Enable **row-level security** on every tenant table: USING (tenant_id = current_setting('app.tenant_id')::uuid). Force RLS so even table owners obey it.
- Per request: BEGIN READ ONLY; set_config('app.tenant_id', tenantId, true) (transaction-local, so pooled connections cannot leak it); SET LOCAL statement_timeout.
- The tenant id comes from the authenticated session — never from the user message or model output.
- AST validation as a second layer (single SELECT, allowlisted views, LIMIT).

**Defence against the model.** Even if it writes WHERE tenant_id = '<other tenant>' or omits the filter, RLS returns only the caller's rows.

**Testing.** Automated suite: for each of two seeded tenants, run adversarial questions ("show all tenants' revenue", "ignore the tenant filter") and assert zero foreign rows; include connection-pool reuse tests; review RLS on every new table in CI.`,
      followUps: [
        { q: 'Why transaction-local set_config instead of SET?', a: 'With pooled connections a session-level setting can persist into the next request for another tenant; transaction-local settings reset automatically at COMMIT or ROLLBACK.' },
        { q: 'What about very large tenants that need their own database?', a: 'Route them to dedicated databases or schemas via the connection layer; the same read-only and validation controls apply, and RLS remains a backstop for shared tables.' },
      ],
      pitfalls: [
        'Putting "only query tenant X" in the prompt as the control',
        'Taking tenant id from the request body',
        'Session-level settings on pooled connections',
      ],
    },
    {
      id: 'ai-applications-iq-03',
      difficulty: 'medium',
      question: 'Design the escalation strategy for a customer-support chatbot. When should it hand off, and what should the human receive?',
      whatInterviewerLooksFor: [
        'Concrete, measurable escalation triggers',
        'Context-rich handoff that avoids repeat questions',
        'Balances containment against customer experience',
        'Measures escalation quality',
      ],
      modelAnswer: `**Triggers (any one):**
- User explicitly asks for a human ("agent", "person").
- Same intent fails twice (tool error, "that didn't help", repeated question).
- Router or answer confidence below threshold, or retrieval returns nothing relevant.
- Negative sentiment trend or abusive language.
- Regulated or high-risk topics: legal threats, medical, account security, large refunds above policy limits.
- VIP or vulnerable-customer flags from CRM.

**Handoff payload.** A 3–5 line summary, detected intent, filled slots (order id, email verified?), tool results, what the bot already tried, sentiment, and the full transcript. Agents should never need to re-ask.

**UX.** Tell the user what happens next and the expected wait; offer callback or email if queues are long; the bot stays silent once a human joins.

**Metrics.** Containment rate *and* CSAT for contained vs escalated; **escalation precision** (sampled review: was escalation needed?) and **missed escalations** (contained chats with low CSAT or reopen within 7 days); agent handle time after handoff.

**Tuning.** Start conservative (escalate more), then loosen thresholds where reviews show unnecessary handoffs.`,
      followUps: [
        { q: 'How do you detect "missed escalations"?', a: 'Look for contained conversations followed by a repeat contact, low CSAT, a complaint, or negative sentiment at the end, and review a sample to refine triggers.' },
        { q: 'Should the LLM decide escalation itself?', a: 'It can propose escalation, but hard triggers such as explicit requests, regulated topics and failure counts should be deterministic rules in code.' },
      ],
      pitfalls: [
        'Optimising containment alone and trapping users',
        'Handoff without context so customers repeat themselves',
      ],
    },
    {
      id: 'ai-applications-iq-04',
      difficulty: 'hard',
      question: 'Your enterprise search assistant answers a question about layoffs using an HR document that the asker should not see. Walk through the incident response and the permanent fix.',
      whatInterviewerLooksFor: [
        'Immediate containment steps',
        'Root-cause analysis across connector, ACL sync and retrieval layers',
        'Pre-filtering and deny-wins re-checks',
        'Leak testing and monitoring going forward',
      ],
      modelAnswer: `**Contain (first hours).** Disable indexing/answers for the HR source; purge cached answers; identify affected queries from logs (who saw which chunk ids); notify security/legal per policy.

**Root cause candidates.**
1. **Connector** stored ACL incorrectly (e.g. broken inheritance, "anyone in org with link" mapped to all-staff).
2. **Sync lag**: document was restricted recently but the index still had the old ACL.
3. **Retrieval** post-filtered after the LLM saw chunks, or a cache keyed only by query (not by principal set) served another user's answer.
4. **Group expansion**: nested groups resolved too broadly.

**Permanent fixes.**
- Pre-filter by principals inside the index query; never let unpermitted chunks reach the LLM.
- Cache keys include the principal set hash; or cache retrieval, not answers.
- ACL deltas via webhooks with an SLA (e.g. < 5 min) and a deny-wins live check for cited documents.
- Sensitivity labels: exclude "highly confidential" HR/legal content entirely unless explicitly onboarded.
- Canary documents and an automated leak test suite in CI; alert on access to labelled content.`,
      followUps: [
        { q: 'Why is an answer cache dangerous here?', a: 'Two users with different permissions can ask the same question; a cache keyed only on query text serves the privileged answer to the unprivileged user.' },
        { q: 'How do you prove the fix works?', a: 'Run the canary leak suite across user personas, replay the incident queries as the original user, and monitor that zero restricted chunk ids appear in their retrieval logs.' },
      ],
      pitfalls: [
        'Only hiding citations rather than fixing retrieval',
        'Ignoring caches as a leak path',
      ],
    },
    {
      id: 'ai-applications-iq-05',
      difficulty: 'medium',
      question: 'How would you evaluate an internal chatbot before rolling it out to 10,000 employees?',
      whatInterviewerLooksFor: [
        'Offline golden set across intents',
        'Separate retrieval, answer and safety metrics',
        'Staged rollout with online metrics',
        'Feedback loop into the eval set',
      ],
      modelAnswer: `**Offline.**
- Golden set of ~300 real questions sampled from helpdesk tickets, stratified by intent (IT, HR, finance, out-of-scope) with reference answers and source docs.
- Metrics: retrieval Recall@5, answer correctness and groundedness (LLM-as-judge calibrated against human labels), citation accuracy, refusal correctness for out-of-scope, escalation correctness.
- Safety: prompt-injection and data-leak probes, PII handling, permission personas.
- Latency p50/p95 and cost per conversation.

**Staged rollout.** Pilot 200 users in two departments → 10% → 100%, with feature flags.

**Online metrics.** Thumbs up/down with reasons, containment (no ticket within 48 h), escalation rate, repeat questions, p95 latency, cost per resolved question.

**Loop.** Every thumbs-down and escalation is triaged weekly; recurring failures become new golden cases and doc fixes (often the content is wrong, not the bot). Regression-test the golden set on every prompt/model/index change and block deploys on drops.`,
      followUps: [
        { q: 'How do you trust an LLM judge?', a: 'Calibrate it on a few hundred human-labelled examples, measure agreement, use pairwise or rubric scoring, and spot-check disagreements regularly.' },
        { q: 'What is a good containment metric for internal IT?', a: 'Share of conversations with no ticket opened by the same user on the same topic within 48 hours, sampled for quality to avoid counting abandoned users as successes.' },
      ],
      pitfalls: [
        'Only measuring thumbs-up rate',
        'Synthetic-only test sets that miss real phrasing',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'ai-applications-est-1',
      question: 'Monthly LLM cost of a text-to-SQL assistant serving 2,000 analysts at 15 questions per day each.',
      assumptions: [
        '22 working days/month',
        'Prompt per attempt: 1,800 schema-linked tokens + 600 few-shot + 100 question = 2,500 input; 200 output',
        'Average 1.3 attempts per question (repairs); plus a 300-in/150-out summary call',
        'Illustrative prices: $3 / 1M input, $15 / 1M output; 60% of input hits a prompt cache at 10% price',
      ],
      steps: [
        { label: 'Questions/month', calc: '2,000 × 15 × 22 = 660,000' },
        { label: 'Input tokens', calc: '660k × (1.3 × 2,500 + 300) = 660k × 3,550 ≈ 2.34B' },
        { label: 'Output tokens', calc: '660k × (1.3 × 200 + 150) = 660k × 410 ≈ 271M' },
        { label: 'Input cost with cache', calc: '2.34B × (0.4 × $3 + 0.6 × $0.3)/1M = 2,340 × $1.38 ≈ $3,230' },
        { label: 'Output cost', calc: '271 × $15 ≈ $4,060' },
      ],
      answer: '≈ $7.3k/month, roughly $0.011 per question.',
      insight: 'Output tokens rival input once caching is on; terse SQL output and short summaries matter. Schema linking keeps input small enough that caching the stable part pays off.',
      followUps: [
        { q: 'What if you sent the full 60k-token schema instead of linking?', a: 'Input per attempt rises ~24×, to roughly 52B tokens/month; even with caching that is tens of thousands of dollars and usually lower accuracy.' },
      ],
    },
    {
      id: 'ai-applications-est-2',
      question: 'Index size and ACL-sync load for enterprise search over 5M documents.',
      assumptions: [
        'Average 8 chunks per document; text-embedding-3-small 1536-d float32',
        'HNSW overhead ~1.5× raw vectors; payload (text + metadata + ACL) ~2 KB per chunk',
        '0.5% of documents change permissions per day, 2% change content per day',
      ],
      steps: [
        { label: 'Chunks', calc: '5M × 8 = 40M' },
        { label: 'Raw vectors', calc: '40M × 1,536 × 4 B ≈ 246 GB' },
        { label: 'With HNSW overhead', calc: '246 × 1.5 ≈ 369 GB' },
        { label: 'Payload', calc: '40M × 2 KB = 80 GB' },
        { label: 'ACL updates/day', calc: '5M × 0.5% = 25k docs × 8 = 200k payload updates (no re-embedding)' },
        { label: 'Content re-embeds/day', calc: '5M × 2% × 8 = 800k chunks/day ≈ 9 per second' },
      ],
      answer: '≈ 450 GB index; ~200k cheap ACL payload updates and ~800k re-embeddings per day.',
      insight: 'ACL changes should update payload metadata only (fast, no embedding), so permission sync can run near-real-time. Quantising vectors (int8 or binary) would cut the 369 GB substantially.',
      followUps: [
        { q: 'How does int8 scalar quantisation change memory?', a: 'Vectors drop from 4 bytes to 1 byte per dimension, so ~246 GB raw becomes ~62 GB, usually with full-precision rescoring of top candidates to keep recall.' },
      ],
    },
  ],
  test: [
    {
      id: 'ai-applications-mcq-01',
      difficulty: 'medium',
      question: 'What is "schema linking" in text-to-SQL?',
      options: [
        'Selecting the tables, columns and values relevant to the question before generating SQL',
        'Creating foreign keys between tables automatically',
        'Joining every table into one wide view for the model',
        'Linking the SQL result back to the question for citation',
      ],
      correct: [0],
      explanation: 'Schema linking maps question phrases ("German customers") to schema elements (customers.country = \'DE\') and prunes the schema to what matters. It is the main accuracy lever on large databases; it does not change the database itself.',
      followUps: [{ q: 'Why include sample values in the linked schema?', a: 'They reveal encodings such as ISO country codes or enum spellings, preventing queries that are valid SQL but filter on values that never occur.' }],
    },
    {
      id: 'ai-applications-mcq-02',
      difficulty: 'hard',
      question: 'Which controls still protect the database if the SQL validator has a bug? Select ALL that apply.',
      options: [
        'A database role with SELECT-only grants on curated views',
        'BEGIN READ ONLY transactions with statement_timeout',
        'Row-level security keyed on the authenticated tenant',
        'A system-prompt instruction saying "never modify data"',
      ],
      correct: [0, 1, 2],
      explanation: 'Grants, read-only transactions, timeouts and RLS are enforced by Postgres regardless of the query text. A prompt instruction can be ignored or overridden and is not a security control.',
      followUps: [{ q: 'Which of these also prevents cross-tenant reads?', a: 'Row-level security, because it filters rows by tenant inside the database even when the generated SQL omits or forges the tenant condition.' }],
    },
    {
      id: 'ai-applications-mcq-03',
      difficulty: 'hard',
      question: 'This guard passes the query below. Why is that a problem?',
      code: {
        language: 'typescript',
        code: `const ok = (sql: string) => sql.trim().toLowerCase().startsWith('select');
ok("SELECT 1; UPDATE accounts SET balance = 0");
// also passes:
ok("select * from users where id = 1 union select password_hash, null from admins");`,
      },
      options: [
        'Prefix checks miss stacked statements and access to unapproved tables',
        'It is case-sensitive',
        'It rejects valid CTE queries only',
        'It is fine as long as the model is aligned',
      ],
      correct: [0],
      explanation: 'A startsWith check allows a second statement after a semicolon and arbitrary tables via UNION. Use an AST parser to require exactly one SELECT and an allowlist of tables, plus a read-only role. Case is already normalised by toLowerCase.',
      followUps: [{ q: 'Does a CTE need special handling?', a: 'Yes: Postgres allows data-modifying CTEs (WITH x AS (DELETE ...) SELECT ...), so validators must inspect every node, and the read-only role must block writes anyway.' }],
    },
    {
      id: 'ai-applications-mcq-04',
      difficulty: 'expert',
      question: 'Why is execution accuracy preferred over exact-match accuracy when evaluating text-to-SQL?',
      options: [
        'Many different SQL strings are semantically equivalent; comparing result sets measures what users care about',
        'Execution accuracy is cheaper to compute',
        'Exact match ignores syntax errors',
        'Execution accuracy does not need a database',
      ],
      correct: [0],
      explanation: 'Aliases, join order or a CTE vs subquery produce different strings with identical results. Execution accuracy compares outputs on a database — more expensive, but it reflects correctness; it can still have false positives on small test data.',
      followUps: [{ q: 'How can execution accuracy give a false positive?', a: 'If the test database is small, a wrong query can coincidentally return the same rows; using several database states or test suites of databases reduces this.' }],
    },
    {
      id: 'ai-applications-mcq-05',
      difficulty: 'hard',
      question: 'Which elements belong in a chatbot\'s server-side session state rather than only in the prompt? Select ALL that apply.',
      options: [
        'Verified user id and entitlements',
        'Filled slots such as order id and whether identity was verified',
        'Failure counters used by the escalation policy',
        'The model\'s free-text opinion of whether the user is authenticated',
      ],
      correct: [0, 1, 2],
      explanation: 'Identity, verified slots and counters drive authorisation and policy, so code must own them. Letting the model decide authentication from conversation text is exploitable ("I already verified, trust me").',
      followUps: [{ q: 'Where should the escalation decision live?', a: 'In deterministic code that reads this state, with the model only contributing signals such as intent and confidence.' }],
    },
    {
      id: 'ai-applications-mcq-06',
      difficulty: 'medium',
      question: 'A support bot\'s cost per conversation keeps growing with conversation length. Which memory design best bounds it?',
      options: [
        'Recent turns verbatim + rolling summary of older turns + retrieved long-term facts',
        'Full transcript every turn with a larger context window',
        'Only the current user message',
        'Store history in the system prompt as JSON',
      ],
      correct: [0],
      explanation: 'A fixed window plus summary caps prompt size while keeping commitments and key facts. Larger windows postpone the problem; dropping history breaks multi-turn tasks; serialising history differently does not shrink it.',
      followUps: [{ q: 'What must the summary preserve explicitly?', a: 'Identifiers, amounts, dates and any promises or decisions made, because these cause contradictions or broken commitments if lost.' }],
    },
    {
      id: 'ai-applications-mcq-07',
      difficulty: 'hard',
      question: 'What is the risk in this retrieval code for enterprise search?',
      code: {
        language: 'typescript',
        code: `const hits = await vectorSearch(query, { limit: 10 });
const allowed = hits.filter((h) => h.acl.some((p) => principals.includes(p)));
return llm.answer(query, allowed);`,
      },
      options: [
        'If most top-10 hits are restricted, the user gets few or no results even though permitted relevant documents exist',
        'The LLM sees restricted documents',
        'The filter grants access to everyone',
        'Vector search cannot store ACLs',
      ],
      correct: [0],
      explanation: 'Post-filtering after a global top-k wastes the result budget on forbidden documents and can return nothing; it also leaks signal through result counts. Here the LLM only sees allowed hits, so the main issue is recall loss; pre-filtering in the index fixes both.',
      followUps: [{ q: 'Why not just increase limit to 1,000 and post-filter?', a: 'It raises latency and cost and still fails for users with narrow access; filtered ANN search returns the best permitted results directly.' }],
    },
    {
      id: 'ai-applications-mcq-08',
      difficulty: 'expert',
      question: 'Which practices reduce permission-related leaks in RAG-based enterprise search? Select ALL that apply.',
      options: [
        'Cache keys that include a hash of the caller\'s principal set',
        'Webhook-driven ACL sync that updates chunk metadata without re-embedding',
        'Deny-wins live permission re-check for documents about to be cited',
        'Expanding groups to user lists once at indexing time and never refreshing',
      ],
      correct: [0, 1, 2],
      explanation: 'Principal-aware caches prevent cross-user cache hits, metadata-only ACL updates make sync fast, and live re-checks cover sync lag. Expanding groups once freezes membership, so leavers keep access.',
      followUps: [{ q: 'Why store group ids rather than expanded user lists on chunks?', a: 'Group membership changes far more often than document ACLs; resolving groups at query time from the identity provider keeps access current without reindexing.' }],
    },
    {
      id: 'ai-applications-mcq-09',
      difficulty: 'hard',
      question: 'A text-to-SQL query for "revenue last month" returns a number 8% higher than the finance dashboard. Most likely cause?',
      options: [
        'The model\'s definition of revenue differs from the certified one (e.g. includes refunds or tax)',
        'The database rounded values',
        'The LLM hallucinated rows',
        'The LIMIT clause cut rows',
      ],
      correct: [0],
      explanation: 'Valid SQL with the wrong business definition is the classic failure. Provide certified metric definitions via a semantic layer or glossary and few-shot examples. The model cannot invent rows; a LIMIT would usually make an aggregate unaffected or lower.',
      followUps: [{ q: 'How do you make the assistant consistent with dashboards?', a: 'Route metric questions to the same semantic-layer definitions the dashboards use, so the model chooses metrics and filters rather than writing the formula.' }],
    },
    {
      id: 'ai-applications-mcq-10',
      difficulty: 'medium',
      question: 'Which escalation trigger should be a hard-coded rule rather than left to model judgement?',
      options: [
        'The user explicitly asks to speak to a human',
        'The answer could be phrased more warmly',
        'The user used an emoji',
        'The conversation is longer than 3 turns',
      ],
      correct: [0],
      explanation: 'Explicit human requests must always be honoured, deterministically. Tone and emojis are not escalation reasons, and a fixed turn count would escalate many healthy conversations.',
      followUps: [{ q: 'Name another trigger that should be deterministic.', a: 'Regulated or high-risk topics such as legal threats or refunds above a limit, detected by classifiers or rules, should always route to a human.' }],
    },
    {
      id: 'ai-applications-mcq-11',
      difficulty: 'expert',
      question: 'Why does this tenant setup leak data under connection pooling, and what fixes it? Select ALL that apply.',
      code: {
        language: 'sql',
        code: `-- per request, on a pooled connection
SET app.tenant_id = '42';
SELECT * FROM v_orders;  -- RLS: tenant_id = current_setting('app.tenant_id')`,
      },
      options: [
        'A session-level SET persists on the pooled connection and can apply to the next request if it forgets to set the tenant',
        'Use set_config(\'app.tenant_id\', $1, true) inside a transaction so it resets at COMMIT/ROLLBACK',
        'Make the RLS policy fail closed when the setting is missing (current_setting with missing_ok returning NULL matches no rows)',
        'RLS does not work with views, so drop RLS',
      ],
      correct: [0, 1, 2],
      explanation: 'Session settings survive across pooled requests; transaction-local settings and a fail-closed policy prevent stale or missing tenants from matching rows. RLS on base tables applies through views when configured correctly (e.g. security_invoker views), so dropping it is wrong.',
      followUps: [{ q: 'How do you test this?', a: 'Run concurrent requests for two tenants over a small pool, including one code path that skips setting the tenant, and assert that no rows from the other tenant ever appear.' }],
    },
    {
      id: 'ai-applications-mcq-12',
      difficulty: 'hard',
      question: 'Your enterprise search ranks a 2022 Slack thread above the current policy page for "travel per diem". Which fixes help? Select ALL that apply.',
      options: [
        'Add a recency boost and a canonical-source weight to ranking',
        'Show last-updated dates in citations and prefer the newest canonical document in the prompt',
        'De-duplicate near-identical content and mark superseded documents',
        'Increase the embedding dimension from 1536 to 3072',
      ],
      correct: [0, 1, 2],
      explanation: 'Staleness is a ranking and curation problem: boosts, source authority, superseded flags and visible dates address it. A larger embedding model does not know which document is current.',
      followUps: [{ q: 'How might you detect superseded documents automatically?', a: 'Cluster near-duplicate chunks by embedding similarity and title, then mark older versions as superseded when a newer document from a canonical source covers the same topic.' }],
    },
  ],
};

export default topic;
