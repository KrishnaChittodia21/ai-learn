import type { Topic } from '../../types';

const topic: Topic = {
  id: 'multi-agent-systems',
  phase: 'agents',
  order: 4,
  title: 'Agentic Workflows, Multi-Agent Systems & Orchestration',
  subtitle:
    'The five workflow patterns, when (and when not) to split work across agents, and how to orchestrate them with state, checkpoints and budgets',
  estimatedMinutes: 77,
  sources: [
    'Anthropic Engineering — Building effective agents (Dec 2024)',
    'Anthropic Engineering — How we built our multi-agent research system (Jun 2025)',
    'LangChain docs — Multi-agent: subagents, handoffs, router, custom workflow (docs.langchain.com/oss/javascript/langchain/multi-agent)',
    'LangChain docs — langgraph-supervisor migration guide (supervisor library no longer actively maintained; use subagents-as-tools)',
    'LangGraph JS docs — Graph API: StateGraph, Send, Command, checkpointers',
    'Cognition — Don\'t Build Multi-Agents (Jun 2025)',
    'Cemri et al. 2025 — Why Do Multi-Agent LLM Systems Fail? (MAST taxonomy)',
    'Du et al. 2023 — Improving Factuality and Reasoning in Language Models through Multiagent Debate, arXiv:2305.14325 (ICML 2024)',
    'Wang et al. 2022 — Self-Consistency Improves Chain of Thought Reasoning in Language Models',
    'Castro & Liskov 1999 — Practical Byzantine Fault Tolerance (OSDI)',
    'Hayes-Roth 1985 — A Blackboard Architecture for Control (Artificial Intelligence journal)',
    'Park et al. 2023 — Generative Agents: Interactive Simulacra of Human Behavior, arXiv:2304.03442 (UIST 2023)',
    'ai-engineering-from-scratch (MIT, © 2026 Rohit Ghumare) — Phase 16 lessons 07, 13–15, 17 and 23, adapted and rewritten',
  ],
  tags: ['agents', 'workflows', 'multi-agent', 'orchestration', 'langgraph', 'supervisor', 'handoffs'],
  cheatSheet: [
    'Workflow = code decides the path; agent = the LLM decides the path. Start with a workflow; add autonomy only where steps cannot be predicted.',
    'Five workflow patterns: prompt chaining (sequential + gates), routing (classify → specialist), parallelisation (sectioning or voting), orchestrator-workers (dynamic fan-out), evaluator-optimizer (generate → critique loop).',
    'Multi-agent pays off for breadth-first, parallelisable work (research, many files); it hurts for tightly coupled work (one coherent code change) where agents lose shared context.',
    'Topologies: supervisor (central router, workers as tools), swarm/handoff (agents transfer control peer-to-peer), hierarchical (supervisors of supervisors).',
    'Anthropic reported multi-agent research used ~15x the tokens of chat (single agents ~4x); token spend explained ~80% of performance variance — budget for it.',
    'Subagents return condensed results (e.g. ≤ 500 tokens), not full transcripts: context isolation is the main benefit of splitting.',
    'Orchestration needs: typed shared state, explicit transitions, checkpoints per step (thread_id), retries with idempotent workers, step/token/$ budgets, and a stop condition.',
    'LangGraph: Send(node, payload) fans out map-reduce workers; a reducer (e.g. concat) merges their results; Command({ goto, update }) does routing + state update in one return.',
    'Evaluator-optimizer loops need a max-iteration cap and a numeric pass threshold, or they oscillate and burn budget.',
    'Most multi-agent failures are spec/coordination failures (role confusion, lost context, premature stop), not model capability — fix with clear task specs and verification steps.',
  ],
  sections: [
    {
      heading: 'Agentic Workflows — the five composable patterns',
      steps: {
        actors: [
          { id: 'user', kind: 'user', label: 'Ticket', sub: 'charged twice + crash', x: 110, y: 70 },
          { id: 'router', kind: 'llm', label: 'Router', sub: 'small model', x: 340, y: 70 },
          { id: 'billing', kind: 'llm', label: 'Billing', sub: 'specialist prompt', x: 570, y: 70 },
          { id: 'bug', kind: 'llm', label: 'Bug', sub: 'specialist prompt', x: 570, y: 230 },
          { id: 'gate', kind: 'guard', label: 'Gate', sub: 'code check', x: 790, y: 70 },
          { id: 'judge', kind: 'judge', label: 'Evaluator', sub: 'scores, cap = 3', x: 790, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Your code fixes the order',
            lines: [
              'In a **workflow**, your code fixes the order of steps; the LLM thinks inside each step.',
              '**Routing**: a cheap classifier returns the intents `billing` and `bug`.',
              '**Sectioning**: both specialists run at once, so wall time is 2.1 s instead of 3.9 s.',
            ],
            script: [
              { say: 0 },
              { send: ['user', 'router'], label: 'ticket' },
              { say: 1 },
              { badge: 'router', text: 'billing, bug' },
              { say: 2 },
              { send: ['router', 'billing'], label: 'billing' },
              { send: ['router', 'bug'], label: 'bug' },
              { badge: 'billing', text: '1.8 s', tone: 'ok' },
              { badge: 'bug', text: '2.1 s', tone: 'ok' },
            ],
          },
          {
            kind: 'watch',
            title: 'Gates and an evaluator loop',
            lines: [
              'A **gate** is code between steps: an order id like `#8812`, no refund over the order total.',
              'Gates stop error propagation early.',
              '**Evaluator-optimizer**: the judge scores tone 3/5, one rewrite scores 5/5, the loop stops.',
              'Every loop needs a hard cap (here 3).',
            ],
            script: [
              { say: 0 },
              { send: ['billing', 'gate'], label: 'draft' },
              { badge: 'gate', text: 'pass', tone: 'ok' },
              { say: 1 },
              { say: 2 },
              { send: ['gate', 'judge'], label: 'merged reply' },
              { badge: 'judge', text: 'tone 3/5', tone: 'miss' },
              { badge: 'judge', text: 'rewrite: 5/5', tone: 'ok' },
              { say: 3 },
              { badge: 'judge', text: 'cap = 3' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: pick the pattern',
            lines: ['Five building blocks: chaining, routing, parallelisation, orchestrator-workers, evaluator-optimizer.'],
            task: {
              type: 'choose',
              question: 'Inputs fall into distinct classes (refund vs bug vs sales), each needing its own specialist. Which pattern?',
              options: [
                { text: 'Routing' },
                {
                  text: 'Prompt chaining',
                  why: 'Chaining is for a task that splits into fixed stages (outline → draft → translate).',
                },
                {
                  text: 'Voting',
                  why: 'Voting runs the same task N times for confidence; it does not pick a specialist.',
                },
                {
                  text: 'Orchestrator-workers',
                  why: 'That is for subtasks unknown in advance; these classes are known.',
                },
              ],
              answer: 0,
            },
            solved: 'Distinct input classes → routing: a cheap classifier picks one specialist.',
            then: [
              { send: ['user', 'router'], label: 'ticket' },
              { send: ['router', 'billing'], label: 'billing', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: workflow or agent?',
            lines: ['Most production "agents" are really workflows with one or two agentic steps.'],
            task: {
              type: 'choose',
              question: 'When should you move from a workflow to an agent?',
              options: [
                { text: 'Only when the number and order of steps truly cannot be fixed' },
                {
                  text: 'As soon as a task needs more than one LLM call',
                  why: 'Several calls in a fixed order is a workflow: testable, cheap and predictable.',
                },
                {
                  text: 'Always: agents are more capable',
                  why: 'Try the simplest thing first; in an agent the LLM picks each step, which is harder to test.',
                },
              ],
              answer: 0,
            },
            solved: 'Simplest first: one call + retrieval, then a workflow, and an agent only when steps cannot be fixed.',
          },
        ],
      },
      body: `**Intuition:** an agentic workflow is a recipe where *your code* fixes the order of steps and the LLM does the thinking inside each step. It is an assembly line, not a free-roaming worker.

Anthropic's taxonomy gives five building blocks you can combine:

| Pattern | Mechanics | Use when |
|---|---|---|
| **Prompt chaining** | Step N's output is step N+1's input; programmatic *gates* check in between | Task decomposes into fixed stages (outline → draft → translate) |
| **Routing** | A cheap classifier picks one specialist prompt/model | Distinct input classes (refund vs bug vs sales) |
| **Parallelisation** | *Sectioning*: independent subtasks at once. *Voting*: same task N times, aggregate | Speed, or confidence through diversity (e.g. 3 safety reviewers, flag if ≥ 2) |
| **Orchestrator-workers** | An LLM plans subtasks at runtime, fans out to workers, synthesises | Subtasks unknown in advance (which files to edit) |
| **Evaluator-optimizer** | Generator drafts, evaluator scores against criteria, loop until pass or cap | Clear rubric and measurable gain from iteration |

The key distinction: in a **workflow** the control flow is in code, so it is testable, cheap and predictable. In an **agent** the LLM chooses the next step in a loop. Most production "agents" are really workflows with one or two agentic steps.

**When to use:** always try the simplest thing first (one call + retrieval). Move to a workflow when a single prompt is overloaded; move to an agent only when the number and order of steps truly cannot be fixed.`,
      example: `**Support triage (routing + chaining + gate).** Input: "I was charged twice for order #8812 and the app crashes on checkout."

1. **Router** (small model, ~150 tokens, ~300 ms) returns \`{"intents":["billing","bug"]}\`.
2. **Parallel sectioning**: billing specialist drafts a refund reply; bug specialist extracts a crash report. Both run at once → wall time ≈ max(1.8 s, 2.1 s) = 2.1 s instead of 3.9 s sequentially.
3. **Gate**: code checks the billing draft contains an order id matching \`/#\\d{4,}/\` and no refund amount over the order total ($42.00). It passes.
4. **Evaluator-optimizer** on the merged reply: the judge scores tone 3/5 ("too terse"); one rewrite scores 5/5; loop stops (cap = 3).

Total: 5 LLM calls, ~6K tokens, every step individually unit-testable.`,
      diagram: `  PROMPT CHAINING            ROUTING                 PARALLELISATION
  in → [A] → gate → [B]      in → [router] ─┬→ [X]   in ─┬→ [A] ─┐
                 ✗→ fail                    └→ [Y]       └→ [B] ─┴→ merge

  ORCHESTRATOR-WORKERS                 EVALUATOR-OPTIMIZER
  in → [orchestrator] ─┬→ [w1] ─┐      in → [generator] → draft
          (plans at    ├→ [w2] ─┼→ synth       ↑            │
           runtime)    └→ [wN] ─┘              └─ feedback ← [evaluator]
                                               (stop: score ≥ 4 or i = 3)`,
      code: [
        {
          language: 'typescript',
          title: 'Routing + parallel sectioning + evaluator loop with the Anthropic SDK',
          code: `import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const client = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';
const FAST = process.env.FAST_MODEL ?? 'claude-haiku-4-5';

async function llm(prompt: string, model = MODEL): Promise<string> {
  const res = await client.messages.create({
    model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }],
  });
  const block = res.content.find((b) => b.type === 'text'); // skip any leading thinking block
  return block?.type === 'text' ? block.text : '';
}

const Route = z.object({ intents: z.array(z.enum(['billing', 'bug', 'sales'])).min(1) });

export async function handle(ticket: string): Promise<string> {
  // 1) ROUTING with a cheap model; validate, fall back to a safe default
  const raw = await llm('Classify intents. Reply JSON {"intents":[...]} only.\\n' + ticket, FAST);
  const parsed = Route.safeParse(JSON.parse(raw.match(/\\{[\\s\\S]*\\}/)?.[0] ?? '{}'));
  const intents = parsed.success ? parsed.data.intents : ['billing' as const];

  // 2) PARALLEL SECTIONING: one specialist per intent, run concurrently
  const parts = await Promise.all(
    intents.map((i) => llm('You are the ' + i + ' specialist. Draft your part of the reply.\\n' + ticket)),
  );
  let draft = await llm('Merge into one reply:\\n' + parts.join('\\n---\\n'));

  // 3) EVALUATOR-OPTIMIZER with a hard iteration cap
  for (let i = 0; i < 3; i++) {
    const verdict = await llm('Score 1-5 for accuracy and tone. Reply "SCORE: n" then feedback.\\n' + draft, FAST);
    const score = Number(verdict.match(/SCORE:\\s*(\\d)/)?.[1] ?? 0);
    if (score >= 4) break; // pass threshold
    draft = await llm('Revise using this feedback:\\n' + verdict + '\\n\\nDraft:\\n' + draft);
  }
  return draft;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Control flow lives in code: deterministic, unit-testable per step, and easy to trace.',
          'Each step gets a focused prompt, which usually beats one overloaded mega-prompt on accuracy.',
          'Cheap steps (routing, scoring) can use small models, cutting cost 3–10x on those calls.',
          'Parallel sectioning cuts wall-clock latency to roughly the slowest branch.',
        ],
        cons: [
          { con: 'Errors compound across a chain: 95% accuracy per step over 5 steps ≈ 77% end-to-end.', fix: 'Add programmatic gates between steps (schema validation, regex/business checks) and fail fast or retry only the failing step.' },
          { con: 'Rigid: a fixed pipeline cannot handle inputs that need an unplanned step.', fix: 'Add a routing fallback ("other" → general agent) or make one step an orchestrator that plans dynamically.' },
          { con: 'Evaluator-optimizer loops can oscillate (fix A breaks B) and burn tokens.', fix: 'Cap iterations (2–3), require a numeric threshold, keep the best-scoring draft rather than the last one.' },
          { con: 'More calls means more latency and more tokens than a single prompt.', fix: 'Parallelise independent steps, use a small model for classifiers/judges, and cache stable prefixes with prompt caching.' },
        ],
      },
      keyPoints: [
        'Workflow = predefined code paths; agent = LLM-directed loop. Prefer the former when you can.',
        'Gates between chain steps stop error propagation early.',
        'Voting parallelisation trades tokens for confidence; sectioning trades nothing but concurrency for speed.',
        'Every loop (evaluator-optimizer, retries) needs a hard cap.',
      ],
      exercise: {
        prompt: `Implement \`vote(question, n)\`: the **voting** variant of parallelisation. Call a classifier \`n\` times concurrently (it returns \`"SAFE"\` or \`"UNSAFE"\`) and return \`{ label, agreement }\` where label is the majority and agreement = majority count / n.

Acceptance: runs calls concurrently with \`Promise.all\`; ties resolve to \`"UNSAFE"\` (fail closed); unparseable answers count as \`"UNSAFE"\`.`,
        starter: {
          language: 'typescript',
          code: `type Label = 'SAFE' | 'UNSAFE';
declare function classify(q: string): Promise<string>; // returns raw model text

export async function vote(question: string, n = 3): Promise<{ label: Label; agreement: number }> {
  // TODO: run n classifications concurrently
  // TODO: normalise each answer to a Label (unknown → 'UNSAFE')
  // TODO: majority with ties → 'UNSAFE'
  throw new Error('not implemented');
}`,
        },
        hints: [
          'Use Array.from({ length: n }, () => classify(question)) inside Promise.all.',
          'Normalise with a regex test on the trimmed upper-cased text: only an exact SAFE counts as SAFE.',
          'Count SAFE; label is SAFE only if safe > n - safe.',
        ],
        solution: {
          language: 'typescript',
          code: `type Label = 'SAFE' | 'UNSAFE';
declare function classify(q: string): Promise<string>;

const toLabel = (raw: string): Label => (/^\\s*SAFE\\b/i.test(raw) ? 'SAFE' : 'UNSAFE');

export async function vote(question: string, n = 3): Promise<{ label: Label; agreement: number }> {
  const answers = await Promise.all(Array.from({ length: n }, () => classify(question)));
  const labels = answers.map(toLabel);
  const safe = labels.filter((l) => l === 'SAFE').length;
  const unsafe = n - safe;
  // Fail closed: SAFE needs a strict majority
  const label: Label = safe > unsafe ? 'SAFE' : 'UNSAFE';
  return { label, agreement: Math.max(safe, unsafe) / n };
}`,
        },
        explanation: 'Concurrency keeps latency at one call, not n. Mapping anything ambiguous to UNSAFE and requiring a strict SAFE majority makes the vote fail closed, the right default for guardrails. Agreement doubles as a confidence signal: route agreement < 0.67 to a human.',
      },
      quickCheck: {
        question: 'You must refactor a codebase where the files needing changes are only known after reading the issue. Which pattern fits best?',
        options: ['Prompt chaining', 'Routing', 'Orchestrator-workers', 'Voting parallelisation'],
        correct: 2,
        explanation: 'Orchestrator-workers lets an LLM plan the subtasks at runtime and fan them out. Chaining and routing assume the steps or categories are known up front; voting repeats the same task.',
      },
      source: 'Anthropic Engineering — Building effective agents',
    },
    {
      heading: 'Multi-Agent Systems — supervisor, handoff (swarm) and hierarchical',
      steps: {
        actors: [
          { id: 'lead', kind: 'agent', label: 'Lead agent', sub: 'supervisor', x: 450, y: 70 },
          { id: 's1', kind: 'agent', label: 'Subagent 1', sub: 'own context window', x: 110, y: 230 },
          { id: 's2', kind: 'agent', label: 'Subagent 2', sub: 'own context window', x: 340, y: 230 },
          { id: 's3', kind: 'agent', label: 'Subagent 3', sub: 'own context window', x: 570, y: 230 },
          { id: 's4', kind: 'agent', label: 'Subagent 4', sub: 'own context window', x: 790, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'A team of specialists',
            lines: [
              'Each agent has its own prompt, tools and **its own context window**.',
              'Research on 4 competitors: the lead writes 4 task specs and fans them out.',
              'The subagents run in parallel; wall time ≈ the slowest one.',
            ],
            script: [
              { say: 0 },
              { lit: 'lead' },
              { say: 1 },
              { send: ['lead', 's1'], label: 'task spec' },
              { send: ['lead', 's2'], label: 'task spec' },
              { send: ['lead', 's3'], label: 'task spec' },
              { send: ['lead', 's4'], label: 'task spec' },
              { say: 2 },
              { badge: 's4', text: '4 minutes' },
            ],
          },
          {
            kind: 'watch',
            title: 'Condensed results come back',
            lines: [
              'Each subagent burns ~60K tokens in its own window…',
              '…but returns only ~500 tokens, never the raw transcript.',
              "The lead's context stays at ~12K: **context isolation**.",
            ],
            script: [
              { say: 0 },
              { badge: 's1', text: '~60K tokens' },
              { badge: 's3', text: '~60K tokens' },
              { say: 1 },
              { send: ['s1', 'lead'], label: '~500', tone: 'ok' },
              { send: ['s2', 'lead'], label: '~500', tone: 'ok' },
              { send: ['s3', 'lead'], label: '~500', tone: 'ok' },
              { send: ['s4', 'lead'], label: '~500', tone: 'ok' },
              { say: 2 },
              { badge: 'lead', text: '~12K context', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: name the topology',
            lines: ['Supervisor = workers as tools. Hierarchical = supervisors of supervisors.'],
            task: {
              type: 'choose',
              question: 'The active agent passes control with a `transfer_to_x` tool, and the user then talks to x. Which topology?',
              options: [
                { text: 'Handoff / swarm' },
                {
                  text: 'Supervisor',
                  why: 'A supervisor calls workers as tools and gets condensed results back; control never leaves it.',
                },
                { text: 'Hierarchical', why: 'Hierarchical means nested supervisors (team leads).' },
              ],
              answer: 0,
            },
            solved: 'Handoff transfers control; lower latency, but loops between agents are harder to reason about.',
          },
          {
            kind: 'turn',
            title: 'Your turn: split it or not?',
            lines: ['The win is context isolation and parallelism, not "more intelligence".'],
            task: {
              type: 'choose',
              question: 'Three agents each write one layer of a feature (DB, API, UI). Good split?',
              options: [
                { text: 'No: it is one coherent artifact, so keep it with one agent' },
                {
                  text: 'Yes: parallel agents are always faster',
                  why: 'They made conflicting implicit decisions: `userId` vs `user_id`.',
                },
                {
                  text: 'Yes, as long as each returns condensed results',
                  why: 'Condensing helps context, but the layers are coupled and still drift apart.',
                },
              ],
              answer: 0,
            },
            solved: 'Breadth-first, independent parts suit many agents; coupled work belongs to one agent.',
          },
          {
            kind: 'watch',
            title: 'The trade',
            lines: [
              'Single agent: 180K tokens of context, findings lost in the middle, 14 minutes.',
              'Supervisor + 4: 4 × 60K + 30K lead ≈ 270K tokens, 4 minutes.',
              '1.5x tokens for 3.5x speed and better coverage.',
            ],
            script: [
              { say: 0 },
              { badge: 'lead', text: '14 min alone', tone: 'miss' },
              { say: 1 },
              { send: ['lead', 's1'], label: 'spec' },
              { send: ['lead', 's4'], label: 'spec' },
              { send: ['s1', 'lead'], label: 'summary', tone: 'ok' },
              { send: ['s4', 'lead'], label: 'summary', tone: 'ok' },
              { say: 2 },
              { badge: 'lead', text: '3.5x faster', tone: 'ok' },
            ],
          },
        ],
      },
      body: `**Intuition:** a multi-agent system is a team of specialists, each with its own prompt, tools and *its own context window*. The win is not "more intelligence"; it is **context isolation and parallelism**: each agent sees only what it needs.

**Three topologies:**

| Topology | Who decides next | Strength | Weakness |
|---|---|---|---|
| **Supervisor** (subagents as tools) | Central agent calls workers as tools and gets condensed results back | Single point of control, easy to trace | Supervisor is a bottleneck; extra hop per step |
| **Handoff / swarm** | Active agent transfers control with a \`transfer_to_x\` tool; the user then talks to x | Lower latency, natural for conversational routing | Harder to reason about; loops between agents |
| **Hierarchical** | Supervisors of supervisors (team leads) | Scales to many tools/domains | Deep call trees, latency and cost multiply |

LangChain now recommends the **subagents-as-tools** pattern (\`createAgent\` + a tool wrapping each subagent); the older \`langgraph-supervisor\` library is no longer actively maintained in Python.

**Economics:** Anthropic's research system (Opus lead + Sonnet subagents) beat single-agent Opus by 90.2% on an internal breadth-first research eval, but used ~15x the tokens of a chat. Cognition's counterpoint: for tightly coupled work (a coherent code change) parallel agents make conflicting implicit decisions.

**When to use:** breadth-first tasks that split into independent parts, tool sets too large for one prompt (> ~20 tools), or strict permission separation. Otherwise, one agent with good tools wins.`,
      example: `**Due-diligence research on 4 competitors.**

- *Single agent*: reads 40 pages sequentially; context hits 180K tokens, early findings get "lost in the middle"; 14 minutes.
- *Supervisor + 4 subagents*: lead writes 4 task specs ("Company X: pricing, funding, last 3 launches; return ≤ 400 words with URLs"). Each subagent burns ~60K tokens in its own window but returns ~500 tokens. Lead's context stays at ~12K. Wall time ≈ slowest subagent = 4 minutes.

Cost: 4 × 60K + 30K lead ≈ 270K tokens vs ~180K single-agent — 1.5x tokens for 3.5x speed and better coverage.

Counter-example: asking 3 agents to each write one layer of a feature (DB, API, UI) produced mismatched field names (\`userId\` vs \`user_id\`): a coupled task that should have stayed with one agent.`,
      diagram: `  SUPERVISOR                 HANDOFF / SWARM            HIERARCHICAL
     user                      user                        user
      │                         │                           │
  [supervisor]            [triage]──transfer──►[billing] [top supervisor]
   │   │   │                 ▲                   │        │          │
  [a] [b] [c]                └────transfer───────┘    [lead A]    [lead B]
  (tools; return                                      │    │      │    │
   summaries)            active agent owns the turn  [a1] [a2]  [b1] [b2]`,
      code: [
        {
          language: 'typescript',
          title: 'Supervisor via subagents-as-tools (LangChain v1 createAgent)',
          code: `import { createAgent, tool } from 'langchain';
import { z } from 'zod';

const MODEL = process.env.LLM_MODEL ?? 'anthropic:claude-sonnet-5-5';
const WORKER = process.env.WORKER_MODEL ?? 'anthropic:claude-haiku-4-5';

// Each subagent has its own prompt, tools and (crucially) its own context window
const researcher = createAgent({
  model: WORKER,
  tools: [/* webSearch, fetchPage */],
  systemPrompt: 'Research the given company. Return at most 400 words with source URLs.',
});

const researchTool = tool(
  async ({ company, focus }) => {
    const out = await researcher.invoke({
      messages: [{ role: 'user', content: company + ' — focus: ' + focus }],
    });
    // Only the condensed final answer flows back to the supervisor
    return out.messages.at(-1)?.text ?? '';
  },
  {
    name: 'research_company',
    description: 'Delegate research on ONE company to a specialist. Call in parallel for many companies.',
    schema: z.object({ company: z.string(), focus: z.string() }),
  },
);

export const supervisor = createAgent({
  model: MODEL,
  tools: [researchTool],
  systemPrompt:
    'You are a research lead. Split the request into one research_company call per company, ' +
    'then synthesise a comparison table. Never research yourself.',
});

// const res = await supervisor.invoke({ messages: [{ role: 'user', content: 'Compare Acme, Globex, Initech' }] });`,
        },
      ],
      prosCons: {
        pros: [
          'Context isolation: each subagent explores in a fresh window and returns a compact summary.',
          'Parallel subagents cut wall-clock time for breadth-first tasks.',
          'Per-agent tool scoping enforces least privilege (the research agent cannot send email).',
          'Specialists can use cheaper models; only the lead needs the frontier model.',
        ],
        cons: [
          { con: 'Token cost multiplies (often 3–15x a single chat).', fix: 'Reserve multi-agent for high-value tasks, cap subagents per request, and use small models for workers.' },
          { con: 'Subagents make conflicting implicit decisions on coupled tasks.', fix: 'Keep tightly coupled work in one agent; share a written spec/contract (schemas, names) with every subagent.' },
          { con: 'Vague delegation causes duplicated or missing work.', fix: 'Have the lead write explicit task specs: objective, output format, tool hints and boundaries ("do not cover pricing").' },
          { con: 'Handoff swarms can ping-pong between agents forever.', fix: 'Track handoff count in state and force a fallback agent or a human after N transfers.' },
        ],
      },
      keyPoints: [
        'The main benefit of multiple agents is context isolation plus parallelism, not extra IQ.',
        'Supervisor = workers as tools; handoff = control transfer; hierarchical = nested supervisors.',
        'Return condensed results, never raw subagent transcripts.',
        'Coupled tasks (one coherent artifact) usually belong to one agent.',
      ],
      exercise: {
        prompt: `Build a **handoff guard** for a swarm. Implement \`nextAgent(state, requested)\` where \`state = { active: string; handoffs: number; history: string[] }\`.

Acceptance:
- Unknown agent names are rejected (stay on the current agent).
- More than 4 handoffs in a conversation routes to \`'human'\`.
- A→B→A→B ping-pong (the last 3 entries in \`history\` alternate) routes to \`'human'\`.
- Otherwise returns the requested agent and updated state.`,
        starter: {
          language: 'typescript',
          code: `const AGENTS = new Set(['triage', 'billing', 'tech', 'human']);
type S = { active: string; handoffs: number; history: string[] };

export function nextAgent(state: S, requested: string): S {
  // TODO: validate name
  // TODO: max handoffs
  // TODO: ping-pong detection
  return state;
}`,
        },
        hints: [
          'Return a new object; never mutate state (checkpointers may hold references).',
          'Ping-pong: with h = [...history, requested], check h.at(-1) === h.at(-3) && h.at(-2) === h.at(-4).',
          'Increment handoffs only on an accepted transfer.',
        ],
        solution: {
          language: 'typescript',
          code: `const AGENTS = new Set(['triage', 'billing', 'tech', 'human']);
type S = { active: string; handoffs: number; history: string[] };
const MAX_HANDOFFS = 4;

const go = (s: S, to: string): S => ({
  active: to, handoffs: s.handoffs + 1, history: [...s.history, to],
});

export function nextAgent(state: S, requested: string): S {
  if (!AGENTS.has(requested) || requested === state.active) return state; // reject unknown / no-op
  if (state.handoffs + 1 > MAX_HANDOFFS) return go(state, 'human');
  const h = [...state.history, requested];
  const pingPong = h.length >= 4 && h.at(-1) === h.at(-3) && h.at(-2) === h.at(-4);
  return pingPong ? go(state, 'human') : go(state, requested);
}`,
        },
        explanation: 'Swarms put control in the agents\' hands, so the code must own the safety rails: an allow-list of targets, a global handoff budget and loop detection, with a human as the terminal fallback.',
      },
      quickCheck: {
        question: 'Why does a supervisor return only a ≤ 400-word summary from each subagent instead of its full transcript?',
        options: [
          'To keep the supervisor\'s context small and focused, which is the core benefit of splitting',
          'Because tools cannot return more than 400 words',
          'So the subagent can be a cheaper model',
          'To make the subagents run in parallel',
        ],
        correct: 0,
        explanation: 'Context isolation is the point: subagents can burn 50K+ tokens exploring while the lead only absorbs the distilled result. Tool output limits, model choice and parallelism are unrelated to summary length.',
      },
      source: 'Anthropic Engineering — How we built our multi-agent research system',
    },
    {
      heading: 'Agent Orchestration — state, fan-out, checkpoints and budgets',
      steps: {
        actors: [
          { id: 'plan', kind: 'agent', label: 'Plan node', sub: '12 sub-questions', x: 110, y: 70 },
          { id: 'workers', kind: 'agent', label: 'worker × 12', sub: 'Send fan-out', x: 340, y: 70 },
          { id: 'state', kind: 'data', label: 'Shared state', sub: 'findings: concat', x: 570, y: 70 },
          { id: 'synth', kind: 'llm', label: 'Synthesise', sub: 'the report', x: 790, y: 70 },
          { id: 'ckpt', kind: 'data', label: 'Checkpointer', sub: 'thread_id: rpt-42', x: 340, y: 230 },
          { id: 'budget', kind: 'guard', label: 'Budget guard', sub: '250K token cap', x: 680, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Fan out, fan in',
            lines: [
              'The plan node produces 12 sub-questions.',
              '`Send` launches 12 worker runs in one **superstep**.',
              'Each appends `{ q, answer, tokens }` to `findings` through a concat reducer.',
            ],
            script: [
              { say: 0 },
              { lit: 'plan' },
              { say: 1 },
              { send: ['plan', 'workers'], label: 'Send', count: 3 },
              { badge: 'workers', text: '12 runs' },
              { say: 2 },
              { send: ['workers', 'state'], label: 'append', tone: 'ok', count: 3 },
            ],
          },
          {
            kind: 'watch',
            title: 'Retries and checkpoints',
            lines: [
              'Worker 9 hits a 429; its retry policy (3 attempts, 1 s → 2 s → 4 s) succeeds on try 2.',
              'State is saved after each superstep under a `thread_id`.',
              'The pod is redeployed: the run resumes from the last checkpoint, and finished workers are not re-run.',
            ],
            script: [
              { say: 0 },
              { badge: 'workers', text: '429', tone: 'err' },
              { badge: 'workers', text: 'try 2: ok', tone: 'ok' },
              { say: 1 },
              { send: ['state', 'ckpt'], label: 'save' },
              { say: 2 },
              { down: 'workers' },
              { wait: 600 },
              { down: 'workers', on: false },
              { send: ['ckpt', 'workers'], label: 'resume', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: who stops a runaway?',
            lines: ['Every orchestrated run needs a step limit, a budget and a partial-result path.'],
            task: {
              type: 'pick',
              question: 'Which part checks the run against its token cap before synthesis?',
              answer: 'budget',
              hints: {
                ckpt: 'The checkpointer saves state so you can resume; it does not stop anything.',
                state: 'State holds `tokensUsed`, but something has to read it and decide.',
                synth: 'Synthesis is where the run goes after the check.',
              },
            },
            solved: 'The budget guard reads tokensUsed = 212K against the 250K cap and allows synthesis.',
            then: [
              { send: ['state', 'budget'], label: '212K' },
              { badge: 'budget', text: 'under cap', tone: 'ok' },
              { send: ['budget', 'synth'], label: 'go', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: over budget',
            lines: ['A naive loop restarts from scratch or runs forever; a graph has a plan for both.'],
            task: {
              type: 'choose',
              question: 'Had tokensUsed exceeded the cap, what should happen?',
              options: [
                { text: 'Jump straight to `synthesise` with partial findings, marked "partial (9/12 sources)"' },
                {
                  text: 'Restart the whole run from scratch',
                  why: 'That throws away finished work; the partial-result path uses it.',
                },
                {
                  text: 'Keep looping until all 12 workers finish',
                  why: 'That is the runaway the budget exists to stop.',
                },
              ],
              answer: 0,
            },
            solved: 'Over budget → synthesise what you have and mark the report partial.',
            then: [
              { badge: 'budget', text: 'over cap', tone: 'err' },
              { send: ['budget', 'synth'], label: 'partial', tone: 'miss' },
            ],
          },
        ],
      },
      body: `**Intuition:** orchestration is the air-traffic control around your agents: who runs next, what they see, what happens when one crashes, and when to stop.

A production orchestrator provides:

1. **Typed shared state** — one schema every node reads and writes, with *reducers* for fields many workers append to (e.g. \`findings: concat\`).
2. **Explicit transitions** — static edges for fixed steps, conditional edges / \`Command({ goto })\` for decisions.
3. **Fan-out / fan-in** — LangGraph's \`Send(node, payload)\` launches N worker instances in one *superstep*; the graph waits for all, then reducers merge.
4. **Checkpoints** — state is saved after each superstep under a \`thread_id\`. A crash at worker 7 of 10 resumes without redoing 1–6 (with a durable checkpointer such as Postgres).
5. **Budgets and stop conditions** — max steps (LangGraph \`recursionLimit\`), token/$ budget in state, wall-clock timeout.
6. **Failure policy** — per-node retries with backoff, idempotent side effects, partial-result synthesis when some workers fail.

| Concern | Naive loop | Orchestrated graph |
|---|---|---|
| Crash mid-run | restart from scratch | resume from last checkpoint |
| 10 workers | sequential or ad-hoc Promise.all | Send fan-out + reducer |
| Runaway | infinite loop | recursionLimit + budget guard |
| Debugging | console logs | replay any checkpoint |

**When to use:** whenever a run has more than ~3 steps, any parallelism, long waits, or side effects you must not repeat.`,
      example: `**Report generator over 12 sources.** Plan node produces 12 sub-questions. \`Send\` fans out 12 \`worker\` runs in one superstep; each appends \`{ q, answer, tokens }\` to \`findings\` via a concat reducer.

Worker 9 hits a 429 rate limit. Its node retry policy (3 attempts, exponential backoff 1 s → 2 s → 4 s) succeeds on try 2. Meanwhile the pod is redeployed: on restart, \`graph.invoke(null, { configurable: { thread_id: 'rpt-42' } })\` resumes from the last checkpoint; already-finished workers are not re-run.

The budget guard reads \`tokensUsed = 212K\` against a 250K cap → allows synthesis. Had it exceeded, the router would jump straight to \`synthesise\` with partial findings and mark the report "partial (9/12 sources)".`,
      diagram: `        START
          │
       [plan] ── creates N sub-questions
          │  Send('worker', q1) … Send('worker', qN)   (one superstep)
    ┌─────┼─────┬──────────┐
 [worker][worker][worker] … [worker]   retry 3x, backoff
    └─────┴──┬──┴──────────┘
             │ findings: concat reducer
     [budget_check] ── over budget? ──► [synthesise(partial)]
             │ ok
        [synthesise] ──► END
  checkpoint saved after every superstep → resume by thread_id`,
      code: [
        {
          language: 'typescript',
          title: 'Orchestrator-workers in LangGraph JS with Send, reducers and a checkpointer',
          code: `import { StateGraph, Annotation, Send, START, END, MemorySaver } from '@langchain/langgraph';

type Finding = { q: string; answer: string; tokens: number };

const State = Annotation.Root({
  topic: Annotation<string>(),
  questions: Annotation<string[]>(),
  // Reducer: parallel workers append instead of overwriting each other
  findings: Annotation<Finding[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  report: Annotation<string>(),
});

declare function planQuestions(topic: string): Promise<string[]>;
declare function answer(q: string): Promise<Finding>;
declare function synthesise(f: Finding[]): Promise<string>;
const TOKEN_BUDGET = 250_000;

const graph = new StateGraph(State)
  .addNode('plan', async (s) => ({ questions: await planQuestions(s.topic) }))
  // Worker receives the Send payload, not the whole state
  .addNode('worker', async (p: { q: string }) => ({ findings: [await answer(p.q)] }), {
    retryPolicy: { maxAttempts: 3, initialInterval: 1000, backoffFactor: 2 },
  })
  .addNode('synthesise', async (s) => {
    const used = s.findings.reduce((n, f) => n + f.tokens, 0);
    const partial = used > TOKEN_BUDGET ? ' (partial: budget hit)' : '';
    return { report: (await synthesise(s.findings)) + partial };
  })
  .addEdge(START, 'plan')
  // Fan-out: one Send per question, all run in the same superstep
  .addConditionalEdges('plan', (s) => s.questions.map((q) => new Send('worker', { q })))
  .addEdge('worker', 'synthesise') // fan-in: waits for every worker
  .addEdge('synthesise', END)
  .compile({ checkpointer: new MemorySaver() }); // use PostgresSaver in production

// const out = await graph.invoke({ topic: 'EU AI Act obligations' },
//   { configurable: { thread_id: 'rpt-42' }, recursionLimit: 40 });`,
        },
      ],
      prosCons: {
        pros: [
          'Checkpointing makes long runs resumable and debuggable (time-travel to any step).',
          'Send + reducers give safe parallel fan-out without hand-rolled locking.',
          'Explicit edges make the control flow reviewable and testable like normal code.',
          'Budgets and recursion limits turn runaway loops into controlled, reportable failures.',
        ],
        cons: [
          { con: 'Retries or resumes can repeat side effects (double emails, double charges).', fix: 'Make side-effecting nodes idempotent with an idempotency key derived from thread_id + node + item.' },
          { con: 'Two parallel workers writing the same non-reducer key raises an update conflict.', fix: 'Give every key written by parallel branches an explicit reducer (concat, merge-by-id, max).' },
          { con: 'In-memory checkpointers lose state on restart.', fix: 'Use a durable checkpointer (PostgresSaver / Redis) and set a retention policy for old threads.' },
          { con: 'Unbounded fan-out (planner emits 200 sub-questions) explodes cost and hits rate limits.', fix: 'Clamp the plan (e.g. max 12 items), and limit concurrency (maxConcurrency in run config or a semaphore).' },
        ],
      },
      keyPoints: [
        'Typed state + reducers + explicit edges = an orchestrator you can reason about.',
        'Send fans out N workers in one superstep; reducers fan the results back in.',
        'Checkpoint per step under a thread_id; resume instead of restarting.',
        'Every orchestrated run needs a step limit, a budget and a partial-result path.',
      ],
      exercise: {
        prompt: `Write a **budget-aware router** for an orchestration loop. \`route(state)\` returns \`'worker' | 'synthesise' | 'abort'\`.

State: \`{ pending: number; tokensUsed: number; budget: number; steps: number; maxSteps: number; findings: number }\`.

Acceptance:
- \`steps >= maxSteps\` or \`tokensUsed >= budget\`: \`'synthesise'\` if at least 1 finding, else \`'abort'\`.
- \`pending > 0\`: \`'worker'\`.
- Otherwise \`'synthesise'\`.
- Include a tiny test with 3 asserts.`,
        hints: [
          'Check the hard limits first: they override everything.',
          'Partial results are better than nothing, but zero findings is an abort.',
          'Use node:assert/strict for the asserts.',
        ],
        solution: {
          language: 'typescript',
          code: `import assert from 'node:assert/strict';

type S = { pending: number; tokensUsed: number; budget: number; steps: number; maxSteps: number; findings: number };
type Next = 'worker' | 'synthesise' | 'abort';

export function route(s: S): Next {
  const outOfBudget = s.steps >= s.maxSteps || s.tokensUsed >= s.budget;
  if (outOfBudget) return s.findings > 0 ? 'synthesise' : 'abort'; // limits win
  if (s.pending > 0) return 'worker';
  return 'synthesise';
}

const base: S = { pending: 3, tokensUsed: 10_000, budget: 100_000, steps: 2, maxSteps: 20, findings: 1 };
assert.equal(route(base), 'worker');
assert.equal(route({ ...base, tokensUsed: 120_000 }), 'synthesise');
assert.equal(route({ ...base, steps: 20, findings: 0 }), 'abort');`,
        },
        explanation: 'Putting the hard limits first guarantees termination regardless of what the planner produced. Plug this function into addConditionalEdges so the policy is pure, testable code rather than an LLM decision.',
      },
      quickCheck: {
        question: 'Five parallel workers each return { findings: [x] } but your state field `findings` has no reducer. What happens?',
        options: [
          'Results are concatenated automatically',
          'The graph raises an invalid concurrent update error (or only one value survives, depending on the version), so you need a reducer',
          'Only the first worker runs',
          'The checkpointer merges them',
        ],
        correct: 1,
        explanation: 'Without a reducer a key is last-value-wins, and LangGraph rejects multiple writes to such a key in one superstep. Declare a concat reducer so the parallel writes are merged deterministically.',
      },
      source: 'LangGraph JS docs — Graph API (Send, reducers, retry policies, persistence)',
    },
    {
      heading: 'Debate, voting and consensus — when several answers beat one',
      steps: {
        actors: [
          { id: 'q', kind: 'document', label: 'Contract', sub: 'notice period?', x: 110, y: 150 },
          { id: 'a1', kind: 'agent', label: 'Agent A', sub: 'model 1', x: 340, y: 70 },
          { id: 'a2', kind: 'agent', label: 'Agent B', sub: 'model 2', x: 570, y: 70 },
          { id: 'a3', kind: 'agent', label: 'Agent C', sub: 'model 1, other prompt', x: 455, y: 230 },
          { id: 'judge', kind: 'judge', label: 'Judge', sub: 'threshold ≥ 0.6', x: 790, y: 70 },
          { id: 'human', kind: 'user', label: 'Human review', sub: 'escalation', x: 790, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Self-consistency: the baseline',
            lines: [
              'Sample one model N times at temperature > 0 and take the majority answer.',
              'Cheap and strong when there is one checkable answer…',
              "…but the samples share the model's biases, so gains flatten as N grows.",
            ],
            script: [
              { say: 0 },
              { send: ['q', 'a1'], label: 'sample', count: 3 },
              { badge: 'a1', text: 'majority' },
              { say: 1 },
              { badge: 'a1', text: '91% (N = 5)', tone: 'ok' },
              { say: 2 },
              { badge: 'a1', text: 'shared biases', tone: 'miss' },
            ],
          },
          {
            kind: 'watch',
            title: 'Debate',
            lines: [
              'N agents answer; for R rounds each reads the others and revises.',
              'A majority vote or a judge decides.',
              'Cost ≈ N × R calls, and context grows every round.',
            ],
            script: [
              { say: 0 },
              { send: ['q', 'a1'], label: 'ask' },
              { send: ['q', 'a2'], label: 'ask', curve: true },
              { send: ['q', 'a3'], label: 'ask' },
              { send: ['a1', 'a2'], label: 'reasoning' },
              { send: ['a2', 'a3'], label: 'reasoning' },
              { send: ['a3', 'a1'], label: 'reasoning' },
              { say: 1 },
              { send: ['a2', 'judge'], label: 'answers' },
              { badge: 'judge', text: '94%', tone: 'ok' },
              { say: 2 },
              { badge: 'a3', text: 'N × R calls', tone: 'miss' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: same blind spot',
            lines: ['Copies of one model can agree on the same mistake: **correlated errors**.'],
            task: {
              type: 'choose',
              question: 'Three copies of one model keep agreeing on a wrong answer. Best fix?',
              options: [
                { text: 'Heterogeneity: different models, prompts, sources or tools' },
                { text: 'Add a fourth copy of the same model', why: 'Another copy shares the same blind spot.' },
                {
                  text: 'Let the most confident agent decide',
                  why: 'That is conformity: agents drift to the most confident voice even when it is wrong.',
                },
              ],
              answer: 0,
            },
            solved: 'Diversity beats headcount: a different model usually adds more than one more copy.',
          },
          {
            kind: 'watch',
            title: 'Consensus with a threshold',
            lines: [
              'Group equivalent answers ("4.2%" and "4.2 percent" are the same) and weight each group.',
              'Accept the top group only if it clears a threshold (e.g. ≥ 60% of the weight).',
              'Otherwise **escalate**: a stronger model, a tool check or a human.',
            ],
            script: [
              { say: 0 },
              { send: ['a1', 'judge'], label: 'answer', curve: true },
              { send: ['a2', 'judge'], label: 'answer' },
              { send: ['a3', 'judge'], label: 'answer' },
              { say: 1 },
              { badge: 'judge', text: '≥ 0.6: accept', tone: 'ok' },
              { say: 2 },
              { send: ['judge', 'human'], label: 'not sure', tone: 'miss' },
              { badge: 'human', text: '9% escalated' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: does agreement prove it?',
            lines: ['PBFT-style consensus assumes faults are independent and that agreement equals correctness.'],
            task: {
              type: 'choose',
              question: 'All agents agree on an answer. What does that tell you?',
              options: [
                { text: 'It is evidence, not proof: verify with tests, retrieval or a calculator when you can' },
                {
                  text: 'It is correct: consensus protocols guarantee it',
                  why: 'Agents built on one model can be honestly and identically wrong.',
                },
                { text: 'Nothing: agreement is meaningless', why: 'Agreement is evidence; pair it with verification.' },
              ],
              answer: 0,
            },
            solved: 'Agreement is evidence, not proof; cheap voting plus escalation beat expensive debate here.',
          },
        ],
      },
      body: `**Intuition:** ask one expert and you get their blind spots. Ask three who must defend their answers to each other and errors get caught — unless all three went to the same school and share the same blind spot.

**Three ways to combine answers (cheapest first):**
1. **Self-consistency** (Wang et al. 2022): sample one model N times at temperature > 0 and take the majority answer. Cheap and strong on questions with one checkable answer, but the samples share the model's biases, so gains flatten as N grows.
2. **Multi-agent debate** (Du et al. 2023): N agents answer; for R rounds each one reads the others' answers and reasoning and revises; then take a majority vote. The paper found both more agents and more rounds helped on reasoning and factuality tasks. Cost is roughly N × R calls, with context growing every round.
3. **Consensus with a threshold:** group equivalent answers ("4.2%" and "4.2 percent" are the same), weight each group (by count, or by calibrated confidence), accept the top group only if it clears a threshold (e.g. ≥ 60% of the weight), otherwise **escalate** to a stronger model, a tool check or a human.

**Why debate fails (and fixes):**
- **Conformity** — agents drift toward the most confident voice, even when it is wrong. Fix: keep rounds to 2–3, make one agent argue the opposite position, and let a separate judge decide from the arguments, not the headcount.
- **Correlated errors** — copies of one model agree on the same mistake. Fix: **heterogeneity** — different models, prompts, retrieved sources or tools. A different model usually adds more than one more copy of the same model.
- **Budget** — studies of debate variants report that at equal compute, simple self-consistency is often as good. Measure against it before shipping debate.

**A note on classic consensus.** Distributed-systems protocols such as PBFT (Castro and Liskov 1999) tolerate f faulty nodes out of n ≥ 3f + 1, but they assume faults are **independent** and that agreement equals correctness. LLM agents built on the same model break both: they can be honestly and identically wrong. Agreement is evidence, not proof — pair it with verification (tests, retrieval, a calculator) whenever one exists.

**When to use:** questions with a checkable answer and a real cost of being wrong (medical coding, financial extraction, hard maths). Skip it for open-ended writing — the agents just converge on the blandest draft — and for easy questions where one call is already right.`,
      example: `**Extracting the "termination notice period" from 400 contracts.**

| Method | Calls per contract | Accuracy on a 400-contract labelled set |
|---|---|---|
| One call | 1 | 88% |
| Self-consistency, N = 5, majority | 5 | 91% |
| Debate, 3 agents (2 models), 2 rounds + judge | 7 | 94% |
| Consensus ≥ 0.6, else human review | 5 + 9% to humans | 99% on auto-accepted, 9% escalated |

The team shipped the last row: the threshold made the system say "not sure" on exactly the clauses with odd wording, and humans handled those. Illustrative numbers; the shape — cheap voting plus escalation beats expensive debate on everything — is common.`,
      code: [
        {
          language: 'typescript',
          title: 'Bounded debate with heterogeneous agents, then a separate judge',
          code: `type Agent = (prompt: string) => Promise<string>;

export async function debate(question: string, agents: Agent[], judge: Agent, rounds = 2) {
  let answers = await Promise.all(agents.map((a) => a('Question: ' + question + '\\nAnswer with reasoning, final line "ANSWER: ..."')));
  for (let r = 1; r < rounds; r++) {
    answers = await Promise.all(
      agents.map((a, i) => {
        const others = answers.filter((_, j) => j !== i).map((x, k) => '<answer id="' + k + '">' + x + '</answer>').join('\\n');
        // re-state the question every round to limit drift
        return a('Question: ' + question + '\\nOther agents said:\\n' + others +
          '\\nCheck their reasoning. Change your answer only if you find a concrete error. Final line "ANSWER: ...".');
      }),
    );
  }
  return judge('Question: ' + question + '\\nCandidate answers:\\n' + answers.join('\\n---\\n') +
    '\\nPick the best-supported answer, judging the reasoning, not how many agents agree.');
}`,
        },
      ],
      prosCons: {
        pros: [
          'Catches individual mistakes when agents are diverse.',
          'A threshold turns disagreement into a useful "not sure" signal for escalation.',
          'Works with any model; no training needed.',
        ],
        cons: [
          { con: 'Cost grows with agents × rounds and context grows each round.', fix: 'Cap rounds at 2–3, run debate only when a cheap first pass is uncertain, and compare against self-consistency at the same budget.' },
          { con: 'Agents conform to the loudest or most confident peer.', fix: 'Assign a devil\'s-advocate role, hide agent identities, and let an independent judge decide on reasoning.' },
          { con: 'Agents sharing a base model agree on the same wrong answer.', fix: 'Mix models, prompts and evidence sources, and verify with tools (tests, calculators, retrieval) when possible.' },
        ],
      },
      keyPoints: [
        'Self-consistency: one model, N samples, majority vote — the baseline to beat.',
        'Debate: N agents, R rounds of reading each other, then vote or judge.',
        'Consensus = cluster equivalent answers, weight them, accept above a threshold, else escalate.',
        'Diversity beats headcount; agreement is evidence, not proof.',
        'Cap rounds to limit conformity and cost.',
      ],
      exercise: {
        prompt: `Write **\`consensus(answers, threshold)\`**.

**Acceptance:**
- \`answers\`: \`{ text, confidence }[]\` with confidence in [0, 1].
- Normalise text for grouping: lower-case, trim, collapse whitespace, drop a trailing period.
- The weight of a group is the sum of its confidences. If the top group's share of the total weight is ≥ \`threshold\`, return \`{ status: 'accept', answer, share }\`; otherwise \`{ status: 'escalate', share }\`.
- An empty list or zero total weight → \`{ status: 'escalate', share: 0 }\`.`,
        hints: [
          'Use a Map from normalised text to { weight, original }.',
          'share = top weight / total weight.',
        ],
        solution: {
          language: 'typescript',
          code: `type Ans = { text: string; confidence: number };
const norm = (s: string) => s.toLowerCase().trim().replace(/\\s+/g, ' ').replace(/\\.$/, '');

export function consensus(answers: Ans[], threshold = 0.6) {
  const groups = new Map<string, { weight: number; answer: string }>();
  let total = 0;
  for (const a of answers) {
    const k = norm(a.text);
    const g = groups.get(k) ?? { weight: 0, answer: a.text.trim() };
    g.weight += a.confidence;
    groups.set(k, g);
    total += a.confidence;
  }
  if (total <= 0) return { status: 'escalate' as const, share: 0 };
  const top = [...groups.values()].sort((a, b) => b.weight - a.weight)[0];
  const share = top.weight / total;
  return share >= threshold ? { status: 'accept' as const, answer: top.answer, share } : { status: 'escalate' as const, share };
}

console.log(consensus([{ text: '90 days', confidence: 0.9 }, { text: '90 Days.', confidence: 0.7 }, { text: '60 days', confidence: 0.6 }]));
// accept '90 days', share ≈ 0.73`,
        },
        explanation:
          'Grouping equivalent answers and weighting them is what makes a vote meaningful; the threshold is what makes it safe. In production replace string normalisation with a canonicaliser (parse numbers and units) or embedding similarity, and calibrate the confidences on a labelled set.',
      },
      quickCheck: {
        question: 'Five copies of the same model debate and unanimously agree on an answer. What can you conclude?',
        options: [
          'The answer is correct, since unanimity beats any threshold',
          'Only that the model is consistent; shared training means they can be wrong together, so verify independently if it matters',
          'The debate needs more rounds until someone disagrees',
          'Unanimity proves no prompt injection happened',
        ],
        correct: 1,
        explanation:
          'Copies of one model have correlated errors. Unanimity shows consistency, not correctness. Diverse models, sources or a tool-based check give real independent evidence.',
      },
      source: 'Du et al. 2023 — Improving Factuality and Reasoning in Language Models through Multiagent Debate (arXiv:2305.14325); Wang et al. 2022 — Self-Consistency',
    },
    {
      heading: 'Shared state and simulations — blackboard architecture and generative agents',
      steps: {
        actors: [
          { id: 'metrics', kind: 'agent', label: 'Metrics agent', sub: 'posts signals', x: 110, y: 70 },
          { id: 'logs', kind: 'agent', label: 'Log agent', sub: 'posts signals', x: 110, y: 230 },
          { id: 'board', kind: 'data', label: 'Blackboard', sub: 'signals · hypotheses', x: 450, y: 70 },
          { id: 'checks', kind: 'data', label: 'checks', sub: 'verifier posts here', x: 450, y: 230 },
          { id: 'reasoner', kind: 'agent', label: 'Reasoning agent', sub: 'proposes causes', x: 790, y: 70 },
          { id: 'verifier', kind: 'judge', label: 'Verifier', sub: 'read-only on board', x: 790, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Everyone writes to one board',
            lines: [
              'Specialists do not message each other: each reads the board and posts what it knows.',
              'The metrics agent posts "p99 latency 4.1 s from 10:02".',
              'The log agent posts "connection pool exhausted, 10:01:57".',
            ],
            script: [
              { say: 0 },
              { lit: 'board' },
              { say: 1 },
              { send: ['metrics', 'board'], label: 'p99 4.1 s' },
              { say: 2 },
              { send: ['logs', 'board'], label: 'pool exhausted' },
            ],
          },
          {
            kind: 'watch',
            title: 'A hypothesis with provenance',
            lines: [
              'The reasoning agent reads `signals` and posts H1, "DB pool exhaustion after deploy 4812", citing both entries.',
              'Every write carries **provenance**: author, time, sources cited.',
              'Agents read only the sections they subscribe to: ~6K tokens each instead of 40K+.',
            ],
            script: [
              { say: 0 },
              { send: ['board', 'reasoner'], label: 'signals' },
              { send: ['reasoner', 'board'], label: 'H1 + sources' },
              { say: 1 },
              { badge: 'board', text: 'author, sources' },
              { say: 2 },
              { badge: 'reasoner', text: '~6K tokens', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: catch the bad hypothesis',
            lines: ['A second hypothesis cites a log line that does not exist.'],
            task: {
              type: 'pick',
              question: 'Which agent catches it?',
              answer: 'verifier',
              hints: {
                reasoner: 'It wrote the hypothesis; the check should be independent.',
                metrics: 'It posts signals; it does not re-check hypotheses.',
                board: 'The board stores entries; it does not check them.',
              },
            },
            solved: 'A read-only verifier re-checks entries against their sources and reports to `checks`, never back onto the board.',
            then: [
              { send: ['board', 'verifier'], label: 'H1, H2', curve: true },
              { badge: 'verifier', text: 'H1 pass', tone: 'ok' },
              { send: ['verifier', 'checks'], label: 'H2 failed', tone: 'err' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: stop the poison',
            lines: ['One agent writes "42%" instead of "4.2%", and downstream agents treat it as fact.'],
            task: {
              type: 'choose',
              question: 'Which defence keeps the fix auditable?',
              options: [
                { text: 'Append-only entries: the correction is a new entry that supersedes the old one' },
                {
                  text: 'Let any agent overwrite the entry in place',
                  why: 'Overwrites erase history, and two agents can overwrite each other; use versioned, append-only writes.',
                },
                { text: 'Nothing: anything on the board is trusted', why: 'That is exactly how poisoning spreads.' },
              ],
              answer: 0,
            },
            solved: 'Provenance, append-only entries, versioned writes and a read-only verifier stop poisoning.',
          },
        ],
      },
      body: `**Intuition:** a hospital ward whiteboard. Specialists do not message each other one by one; each reads the board, adds what they know ("bloods back: low potassium"), and the next specialist reacts. Nobody owns the whole plan, but the board holds it.

**Blackboard architecture.** An old AI pattern (Hearsay-II speech understanding in the 1970s; formalised by Hayes-Roth in 1985) that fits LLM agents well:
- **Blackboard** — shared, structured state, usually split into sections or topics (\`facts\`, \`hypotheses\`, \`open_questions\`, \`draft\`).
- **Knowledge sources** — specialist agents that watch sections they care about and post contributions.
- **Control** — decides which agent acts next (a scheduler, a supervisor model, or simple subscriptions).

Compared with a group chat where everyone reads everything, agents read only the sections they subscribe to, so context stays small as agents are added.

**The big risk: poisoning.** One agent writes a hallucinated "42%" instead of "4.2%", and every downstream agent treats it as fact. Defences:
- **Provenance on every write** — author, time, sources cited.
- **Append-only entries** — a correction is a new entry that supersedes the old one, so history is auditable.
- **Versioned writes** — reject a write based on a stale version (optimistic concurrency) to avoid two agents overwriting each other.
- **A read-only verifier** — an agent that re-checks entries against their sources and reports to a separate channel, never back onto the board.

**Generative agents** (Park et al. 2023) used a related idea for *simulation*: 25 agents living in a small town ("Smallville"), each with
- a **memory stream** of observations, retrieved by recency, importance and relevance (see Agent Memory & Tools);
- **reflection** — periodically turning recent memories into higher-level beliefs ("Klaus is passionate about his research");
- **planning** — a day plan broken into hourly and finer actions, revised when observations conflict.

Seeded with one agent wanting to throw a Valentine's Day party, the others spread invitations, and several showed up at the right time — coordination nobody scripted. Ablations in the paper showed removing observation, reflection or planning made behaviour less believable. Known problems: agents breaking physical or social norms (entering closed shops), reflections that invent facts, and memory costs that grow with run length.

**When to use:** a blackboard for many specialists working on one evolving artefact (research reports, incident analysis). Generative-agent architectures for simulations, game characters and user-behaviour prototypes — treating results as hypotheses, not as real user data.`,
      example: `**Incident-analysis board for a production outage.**

Sections: \`signals\` (log, metrics and trace agents post findings), \`hypotheses\` (a reasoning agent proposes causes), \`checks\` (a verifier posts pass/fail per hypothesis), \`report\`.

- The metrics agent posts "p99 latency 4.1 s from 10:02, source: dashboard link". The log agent posts "connection pool exhausted, 10:01:57".
- The reasoning agent posts H1 "DB pool exhaustion after deploy 4812" citing both entries.
- The verifier (read-only on the board) re-queries the pool metric, confirms, and posts to \`checks\`. A second hypothesis, citing a log line that does not exist, is marked failed.
- Only verified hypotheses flow into \`report\`.

Seven agents, but each one's context holds only its sections: about 6K tokens instead of 40K+ in a shared group chat.`,
      code: [
        {
          language: 'typescript',
          title: 'Append-only blackboard with provenance, versions and topic subscriptions',
          code: `interface Entry { id: number; topic: string; author: string; text: string; sources: string[]; supersedes?: number; at: number }
type Listener = (e: Entry) => void;

export class Blackboard {
  private entries: Entry[] = [];
  private subs = new Map<string, Listener[]>();

  version(topic: string) { return this.entries.filter((e) => e.topic === topic).length; }

  post(e: Omit<Entry, 'id' | 'at'>, expectedVersion: number) {
    if (this.version(e.topic) !== expectedVersion) return { ok: false as const, reason: 'stale version: re-read ' + e.topic };
    const entry = { ...e, id: this.entries.length + 1, at: Date.now() };
    this.entries.push(entry);                       // never mutate old entries
    for (const fn of this.subs.get(e.topic) ?? []) fn(entry);
    return { ok: true as const, id: entry.id };
  }

  // current view: entries not superseded by a later one
  read(topic: string) {
    const replaced = new Set(this.entries.map((e) => e.supersedes).filter(Boolean));
    return this.entries.filter((e) => e.topic === topic && !replaced.has(e.id));
  }

  subscribe(topic: string, fn: Listener) { this.subs.set(topic, [...(this.subs.get(topic) ?? []), fn]); }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Agents stay decoupled: add a specialist by subscribing it to a section.',
          'Each agent reads only relevant sections, keeping context small.',
          'Provenance and append-only entries make the reasoning auditable.',
        ],
        cons: [
          { con: 'One hallucinated entry spreads to every reader.', fix: 'Require cited sources on writes, add a read-only verifier that re-checks entries, and let only verified entries reach the final output.' },
          { con: 'Concurrent writers overwrite or contradict each other.', fix: 'Use versioned writes (reject stale versions), topic ownership, or a single writer that serialises updates.' },
          { con: 'Generative-agent simulations look convincing but may not match real people.', fix: 'Use them to generate hypotheses, validate against real user data, and log memory retrieval so invented reflections can be traced.' },
        ],
      },
      keyPoints: [
        'Blackboard = shared structured state + specialist knowledge sources + control.',
        'Subscriptions keep each agent\'s context small.',
        'Provenance, append-only entries, versions and a read-only verifier stop poisoning.',
        'Generative agents: memory stream + reflection + planning produced unscripted coordination.',
        'Simulation output is a hypothesis, not user evidence.',
      ],
      exercise: {
        prompt: `Add **\`verifyEntry(board, id, check)\`** to the blackboard idea, as a standalone function over an entries array.

**Acceptance:**
- \`check(entry)\` is async and returns \`{ ok, note }\` (e.g. re-fetches the cited sources).
- Entries without sources fail immediately with note \`'no sources'\`, without calling \`check\`.
- Results go to a **separate** \`verdicts\` map (id → { ok, note }); the entries array must not change.
- Return the verdict.`,
        hints: [
          'Find the entry by id; return a failing verdict if it does not exist.',
          'Do not push anything onto the entries array — that is the point of a read-only verifier.',
        ],
        solution: {
          language: 'typescript',
          code: `interface Entry { id: number; topic: string; author: string; text: string; sources: string[] }
type Verdict = { ok: boolean; note: string };

export async function verifyEntry(
  entries: readonly Entry[],
  verdicts: Map<number, Verdict>,
  id: number,
  check: (e: Entry) => Promise<Verdict>,
): Promise<Verdict> {
  const e = entries.find((x) => x.id === id);
  const v: Verdict = !e ? { ok: false, note: 'no such entry' }
    : !e.sources.length ? { ok: false, note: 'no sources' }
    : await check(e);
  verdicts.set(id, v); // separate channel, never written back to the board
  return v;
}`,
        },
        explanation:
          'If the verifier wrote onto the board, a poisoned board could poison the verifier\'s own inputs. Keeping verdicts in a separate channel, and refusing unsourced claims outright, is what makes the check independent.',
      },
      quickCheck: {
        question: 'In Park et al.\'s generative agents, what does reflection do?',
        options: [
          'It deletes old memories to save space',
          'It periodically turns recent memories into higher-level beliefs that are stored back in the memory stream',
          'It lets one agent read another agent\'s memories',
          'It fine-tunes the model on the day\'s events',
        ],
        correct: 1,
        explanation:
          'Reflections are new, more abstract memories ("Klaus cares about his research") created from many observations and retrieved like any other memory. They shape later plans; nothing is fine-tuned.',
      },
      source: 'Hayes-Roth 1985 — A Blackboard Architecture for Control; Park et al. 2023 — Generative Agents: Interactive Simulacra of Human Behavior (UIST 2023)',
    },
    {
      heading: 'Why multi-agent systems fail — the MAST taxonomy and what to do about each',
      steps: {
        actors: [
          { id: 'planner', kind: 'agent', label: 'Planner', sub: 'coding crew', x: 110, y: 70 },
          { id: 'coder', kind: 'agent', label: 'Coder', sub: 'coding crew', x: 340, y: 70 },
          { id: 'tester', kind: 'agent', label: 'Tester', sub: 'coding crew', x: 570, y: 70 },
          { id: 'reviewer', kind: 'agent', label: 'Reviewer', sub: 'coding crew', x: 790, y: 70 },
          { id: 'harness', kind: 'guard', label: 'Harness', sub: 'runs tests, says done', x: 340, y: 230 },
          { id: 'labeller', kind: 'judge', label: 'MAST labels', sub: 'traces by category', x: 680, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: '14 modes, 3 categories',
            lines: [
              'MAST groups **14 failure modes** into **3 categories**.',
              '**Specification**: the setup was wrong before any agent spoke.',
              '**Inter-agent misalignment**: agents work against each other.',
              '**Verification and termination**: nobody checks properly.',
            ],
            script: [
              { say: 0 },
              { send: ['planner', 'coder'], label: 'plan' },
              { say: 1 },
              { badge: 'reviewer', text: 'never stops', tone: 'err' },
              { say: 2 },
              { send: ['tester', 'coder'], label: 'failing case' },
              { badge: 'coder', text: 'ignored', tone: 'err' },
              { say: 3 },
              { badge: 'tester', text: 'tests never run', tone: 'err' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: label a failure',
            lines: ['18 of 120 failed traces: the coder also "tested" and reported pass.'],
            task: {
              type: 'choose',
              question: 'Which MAST category is "disobeyed role"?',
              options: [
                { text: 'Specification and system design' },
                {
                  text: 'Inter-agent misalignment',
                  why: 'Misalignment is agents working against each other; here one agent broke its own role.',
                },
                {
                  text: 'Not a coordination failure: just a weak model',
                  why: 'Failures come from setup and coordination, not only model capability.',
                },
              ],
              answer: 0,
            },
            solved: 'Disobeying the role specification is a specification failure; fix it with role contracts.',
          },
          {
            kind: 'watch',
            title: 'Structural fixes',
            lines: [
              'The harness, not an agent, runs the test suite and decides "done".',
              'The reviewer gets a 2-round cap and a checklist.',
              "The coder's tools no longer include the test runner.",
              'The next 300 runs failed 38% less often.',
            ],
            script: [
              { say: 0 },
              { send: ['coder', 'harness'], label: 'code' },
              { badge: 'harness', text: 'tests run', tone: 'ok' },
              { say: 1 },
              { badge: 'reviewer', text: '2-round cap' },
              { say: 2 },
              { badge: 'coder', text: 'no test runner' },
              { say: 3 },
              { badge: 'harness', text: '38% fewer fails', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: make it a routine',
            lines: ['Prompt tweaks help only partly; count failures to know which structural fix matters.'],
            task: {
              type: 'order',
              question: 'Put the release routine in order.',
              items: ['Sample traces', 'Label failures with MAST', 'Count by category', 'Fix the biggest bucket'],
              hint: 'Measure first, then fix where most failures land.',
            },
            solved: 'Sample, label, count, fix the biggest bucket, then repeat every release.',
            then: [{ send: ['harness', 'labeller'], label: 'traces' }, { badge: 'labeller', text: 'by category' }],
          },
        ],
      },
      short: {
        id: 'why-agent-teams-fail',
        title: 'Why agent teams fail',
        beats: [
          {
            type: 'grid',
            kicker: 'MAST · Cemri et al. 2025',
            head: '14 failure modes, *3 categories*',
            cells: 14,
            hot: 5,
            caption: '5 of 14 modes are specification: wrong before any agent spoke',
            sub: 'The rest: **inter-agent misalignment** and **verification and termination**.',
          },
          {
            type: 'ladder',
            kicker: 'Coding crew · 120 failed traces',
            head: 'Where it *broke*',
            rungs: [
              { label: 'Tests never actually run', amount: 31 },
              { label: 'Reviewer kept asking for style changes', amount: 26 },
              { label: 'Premature termination', amount: 24 },
              { label: 'Coder skipped the tester’s failing case', amount: 21 },
              { label: 'Coder also tested and reported pass', amount: 18 },
            ],
            unit: 'traces',
          },
          {
            type: 'toggles',
            kicker: 'Structural fixes',
            head: 'Change the *structure*, not the prompt',
            items: [
              { label: 'The harness runs tests and decides done', keep: true },
              { label: 'Reviewer: 2-round cap + checklist', keep: true },
              { label: 'Coder loses the test runner', keep: true },
              { label: 'Just tweak the role prompts' },
            ],
            keepLabel: 'FIX',
            sub: 'In the paper, prompt tweaks helped **only partly**.',
          },
          {
            type: 'counter',
            kicker: 'The next 300 runs',
            value: 38,
            suffix: '%',
            unit: 'fewer failures',
            sub: 'What remained was mostly **hard tasks**, not coordination.',
          },
          {
            type: 'flow',
            kicker: 'Every release',
            head: 'Count, then *fix*',
            steps: ['Sample traces', 'Label failures with MAST', 'Count by category', 'Fix the biggest bucket'],
          },
          {
            type: 'quiz',
            kicker: 'Your turn',
            head: 'A reviewer agent declares the task complete without running the tests. Which category?',
            answer: 2,
            options: [
              { text: 'Specification and system design', why: 'The setup was fine; the failure is that nobody checked.' },
              { text: 'Inter-agent misalignment', why: 'No agent worked against another; the check simply never happened.' },
              { text: 'Task verification and termination', why: 'Declaring success without checking is a verification failure: let a harness-run suite decide done.' },
            ],
          },
        ],
        takeaway: {
          head: 'Agent teams fail like *human* teams.',
          sub: 'Unclear briefs, miscommunication, nobody checking: let **code** decide when a task is done.',
        },
      },
      body: `**Intuition:** most failed projects with several people fail on unclear briefs, miscommunication and nobody checking the work — not because one person was incompetent. Multi-agent LLM systems fail the same way.

**MAST** (Multi-Agent System failure Taxonomy, Cemri et al. 2025, "Why Do Multi-Agent LLM Systems Fail?") was built by annotating execution traces from several open-source multi-agent frameworks. It groups **14 failure modes** into **3 categories**:

**1. Specification and system design** — the setup was wrong before any agent spoke:
- disobeying the task specification; disobeying the role specification;
- step repetition; loss of conversation history;
- not knowing when to stop (unaware of termination conditions).

**2. Inter-agent misalignment** — agents work against each other:
- conversation reset; failing to ask for clarification; task derailment;
- withholding information another agent needed; ignoring another agent's input;
- reasoning that does not match the action taken.

**3. Task verification and termination** — nobody checks properly:
- premature termination; no or incomplete verification; incorrect verification.

**Lessons from the paper:** failures spread across all three categories, so no single fix (a better model, a bigger prompt) removes them. Simple interventions — clearer role prompts, better orchestration — helped only partly; the authors argue for structural fixes. They also built an LLM-as-judge annotator to label traces at scale.

**Mitigation map**

| Category | Structural fixes |
|---|---|
| Specification | Role contracts that say what each agent does **and does not** do; explicit acceptance criteria per task; explicit stop conditions and budgets in code |
| Misalignment | Typed hand-offs (schemas, not prose); a clarify-or-proceed rule; shared state with provenance; keep the original goal in every agent's context |
| Verification | An independent verifier with its own tools (tests, retrieval); "done" decided by checks in code, not by an agent saying so; outcome-based evals |

**Make it a routine:** sample traces every release, label failures with MAST (by hand at first, then with an LLM judge you have checked against your labels), count by category, fix the biggest bucket, repeat. Also watch slow-failure signals that do not crash anything: rising message counts, falling agreement, repeated tool calls.

**When to use:** whenever you debug or review a multi-agent design. If you cannot point to a mitigation for each category, the design is not ready — and often a single agent with good tools would fail less.`,
      example: `**Coding crew (planner, coder, tester, reviewer) — 120 failed traces labelled with MAST.**

| Failure mode (category) | Count |
|---|---|
| Unaware of termination: reviewer kept requesting style changes (spec) | 26 |
| Disobeyed role: coder also "tested" and reported pass (spec) | 18 |
| Ignored other agent's input: coder skipped tester's failing case (misalignment) | 21 |
| No or incomplete verification: tests never actually run (verification) | 31 |
| Premature termination (verification) | 24 |

Fixes: the harness, not an agent, runs the test suite and decides "done"; the reviewer gets a 2-round cap and a checklist; the coder's tools no longer include the test runner. The next 300 runs failed 38% less often, with the remaining failures mostly in hard tasks rather than coordination.`,
      code: [
        {
          language: 'typescript',
          title: 'MAST labels for trace review, with a fix per category',
          code: `export const MAST = {
  specification: ['disobey-task-spec', 'disobey-role-spec', 'step-repetition', 'loss-of-history', 'unaware-of-termination'],
  misalignment: ['conversation-reset', 'no-clarification', 'task-derailment', 'information-withholding', 'ignored-input', 'reasoning-action-mismatch'],
  verification: ['premature-termination', 'no-or-incomplete-verification', 'incorrect-verification'],
} as const;

export const FIRST_FIX: Record<keyof typeof MAST, string> = {
  specification: 'tighten role contracts, acceptance criteria and code-enforced stop conditions',
  misalignment: 'typed hand-offs, shared state with provenance, clarify-or-proceed rule',
  verification: 'independent verifier with its own tools; harness decides "done"',
};

// a trace review record: one trace can have several labels
export interface TraceLabel { traceId: string; modes: string[]; note?: string }`,
        },
      ],
      prosCons: {
        pros: [
          'A shared vocabulary turns "the agents got confused" into countable categories.',
          'Points to structural fixes instead of endless prompt tweaks.',
          'Works as a design checklist before launch and a triage tool after.',
        ],
        cons: [
          { con: 'Labelling traces by hand is slow.', fix: 'Label a seed set by hand, then use an LLM judge checked against those labels for the rest, and re-check agreement each release.' },
          { con: 'Modes overlap, so labels are subjective.', fix: 'Allow several labels per trace, write short definitions with examples, and measure agreement between two reviewers.' },
          { con: 'Silent failures (plausible but wrong output) never appear in error logs.', fix: 'Add outcome evals on golden tasks and track drift signals such as message counts and verifier pass rates.' },
        ],
      },
      keyPoints: [
        'MAST: 14 failure modes in 3 categories — specification, inter-agent misalignment, verification/termination.',
        'Failures come from setup and coordination, not only model capability.',
        'Prompt tweaks help partly; structural fixes (contracts, typed hand-offs, independent verification) matter more.',
        'Let code, not an agent\'s claim, decide when a task is done.',
        'Label traces regularly and fix the biggest category first.',
      ],
      exercise: {
        prompt: `Write **\`mastReport(labels)\`** for a release review.

**Acceptance:**
- Input: \`{ traceId, modes: string[] }[]\` using the mode names from the code above.
- Output: \`{ byCategory, unknown, top }\` where \`byCategory\` counts **traces** per category (a trace with two specification modes counts once for specification), \`unknown\` lists mode names not in MAST, and \`top\` is the category with the most traces (ties: first in the order specification, misalignment, verification).`,
        hints: [
          'Build a mode → category lookup from the MAST object first.',
          'Use a Set of categories per trace so each trace counts once per category.',
        ],
        solution: {
          language: 'typescript',
          code: `const MAST = {
  specification: ['disobey-task-spec', 'disobey-role-spec', 'step-repetition', 'loss-of-history', 'unaware-of-termination'],
  misalignment: ['conversation-reset', 'no-clarification', 'task-derailment', 'information-withholding', 'ignored-input', 'reasoning-action-mismatch'],
  verification: ['premature-termination', 'no-or-incomplete-verification', 'incorrect-verification'],
} as const;
type Cat = keyof typeof MAST;
const CATS = Object.keys(MAST) as Cat[];
const CAT_OF = new Map<string, Cat>(CATS.flatMap((c) => MAST[c].map((m) => [m, c] as [string, Cat])));

export function mastReport(labels: { traceId: string; modes: string[] }[]) {
  const byCategory: Record<Cat, number> = { specification: 0, misalignment: 0, verification: 0 };
  const unknown = new Set<string>();
  for (const t of labels) {
    const cats = new Set<Cat>();
    for (const m of t.modes) {
      const c = CAT_OF.get(m);
      if (c) cats.add(c); else unknown.add(m);
    }
    for (const c of cats) byCategory[c]++;
  }
  const top = CATS.reduce((a, b) => (byCategory[b] > byCategory[a] ? b : a));
  return { byCategory, unknown: [...unknown], top };
}`,
        },
        explanation:
          'Counting traces (not labels) per category tells you how many runs a fix could save. Reporting unknown labels keeps the taxonomy honest when reviewers invent new names, and the top category tells you where to spend the next sprint.',
      },
      quickCheck: {
        question: 'A "reviewer" agent declares the task complete without running the tests, and the bug ships. Which MAST category is this?',
        options: [
          'Specification and system design',
          'Inter-agent misalignment',
          'Task verification and termination',
          'It is a model capability failure outside MAST',
        ],
        correct: 2,
        explanation:
          'Declaring success without checking is a verification failure (no or incomplete verification, often with premature termination). The structural fix is a harness-run test suite that decides "done".',
      },
      source: 'Cemri et al. 2025 — Why Do Multi-Agent LLM Systems Fail? (arXiv:2503.13657)',
    },
  ],
  codeChallenges: [
    {
      id: 'multi-agent-systems-cc-1',
      title: 'Harden a naive multi-agent research loop',
      context: 'A prototype lets a lead agent spawn subagents in a while(true) loop and pastes every subagent transcript into the lead\'s prompt. In production it ran for 40 minutes, hit a 200K-token context error and spent $38 on one request.',
      task: 'Rewrite it so that: subagents run in parallel, the number of subagents is clamped, each subagent returns a condensed result, there is a token budget and an iteration cap, and a failing subagent does not crash the run.',
      starter: {
        language: 'typescript',
        code: `declare function lead(prompt: string): Promise<{ done: boolean; tasks: string[]; answer?: string }>;
declare function subagent(task: string): Promise<{ transcript: string }>;

export async function research(question: string) {
  let notes = '';
  while (true) {
    const plan = await lead(question + '\\n' + notes);
    if (plan.done) return plan.answer;
    for (const t of plan.tasks) {
      const r = await subagent(t);           // sequential
      notes += r.transcript;                 // full transcript grows unbounded
    }
  }
}`,
      },
      hints: [
        'Clamp plan.tasks with slice(0, MAX_SUBAGENTS) and use Promise.allSettled.',
        'Ask the subagent for a summary capped in tokens, and estimate tokens as chars / 4.',
        'Exit the loop on iteration cap or budget and return a partial answer with a flag.',
      ],
      solution: {
        language: 'typescript',
        code: `declare function lead(prompt: string): Promise<{ done: boolean; tasks: string[]; answer?: string }>;
declare function subagent(task: string, opts: { maxSummaryTokens: number }): Promise<{ summary: string; tokensUsed: number }>;

const MAX_ITER = 4;
const MAX_SUBAGENTS = 5;
const TOKEN_BUDGET = 300_000;
const est = (s: string) => Math.ceil(s.length / 4);

export async function research(question: string) {
  const notes: string[] = [];
  let used = 0;
  for (let i = 0; i < MAX_ITER; i++) {
    const prompt = question + '\\n\\nFindings so far:\\n' + notes.join('\\n');
    used += est(prompt);
    const plan = await lead(prompt);
    if (plan.done) return { answer: plan.answer, partial: false, used };
    const tasks = plan.tasks.slice(0, MAX_SUBAGENTS); // clamp fan-out
    const results = await Promise.allSettled(tasks.map((t) => subagent(t, { maxSummaryTokens: 500 })));
    results.forEach((r, k) => {
      if (r.status === 'fulfilled') {
        notes.push('- [' + tasks[k] + '] ' + r.value.summary); // condensed, not transcript
        used += r.value.tokensUsed;
      } else notes.push('- [' + tasks[k] + '] FAILED: ' + String(r.reason).slice(0, 120));
    });
    if (used > TOKEN_BUDGET) break; // budget guard
  }
  const final = await lead(question + '\\nBudget exhausted. Answer from:\\n' + notes.join('\\n') + '\\nMark gaps explicitly.');
  return { answer: final.answer, partial: true, used };
}`,
      },
      explanation: 'The rewrite bounds every dimension that blew up: iterations (4), fan-out (5), context growth (≤ 500-token summaries instead of transcripts) and total spend (300K tokens). Promise.allSettled turns a subagent failure into a recorded gap instead of a crash, and the final call always produces an answer flagged as partial.',
      followUps: [
        { q: 'How would you make this resumable after a crash at iteration 3?', a: 'Persist notes, used and the iteration index after each iteration (a checkpoint keyed by a run id), or move the loop into LangGraph with a durable checkpointer so invoke(null, thread) resumes from the last superstep.' },
        { q: 'Subagents often duplicate each other\'s searches. How do you reduce that?', a: 'Make the lead write disjoint task specs with explicit boundaries, pass the list of already-covered queries/URLs into each subagent, and dedupe sources in the notes before the next planning round.' },
      ],
    },
    {
      id: 'multi-agent-systems-cc-2',
      title: 'Fix a router that sends everything to the expensive agent',
      context: 'A routing workflow sends tickets to billing, tech or general agents. The router prompt returns free text; the code does `if (out.includes("tech"))`. Tickets mentioning "technically I was billed twice" go to the tech agent, and malformed router output silently goes to an expensive general agent on the frontier model.',
      task: 'Make routing robust: structured output validated with zod, an explicit confidence, a low-confidence fallback to a cheap clarifying step, and logging of route decisions for evaluation.',
      starter: {
        language: 'typescript',
        code: `declare function llm(prompt: string, model?: string): Promise<string>;
declare const agents: Record<'billing' | 'tech' | 'general', (t: string) => Promise<string>>;

export async function route(ticket: string) {
  const out = await llm('Which team? billing, tech or general.\\n' + ticket);
  if (out.includes('billing')) return agents.billing(ticket);
  if (out.includes('tech')) return agents.tech(ticket);
  return agents.general(ticket);
}`,
      },
      hints: [
        'Ask for JSON {"route": ..., "confidence": 0-1} and validate with z.object + z.enum.',
        'On parse failure retry once, then fall back to a cheap clarifier instead of the frontier agent.',
        'Log { ticketId, route, confidence } so you can build a routing eval set later.',
      ],
      solution: {
        language: 'typescript',
        code: `import { z } from 'zod';
declare function llm(prompt: string, model?: string): Promise<string>;
declare const agents: Record<'billing' | 'tech' | 'general', (t: string) => Promise<string>>;
declare function askClarifyingQuestion(t: string): Promise<string>;
declare const log: { info: (o: object) => void };

const FAST = process.env.FAST_MODEL ?? 'claude-haiku-4-5';
const Decision = z.object({ route: z.enum(['billing', 'tech', 'general']), confidence: z.number().min(0).max(1) });

async function classify(ticket: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llm(
      'Classify the PRIMARY intent. JSON only: {"route":"billing|tech|general","confidence":0-1}.\\n' +
        'Billing = charges, refunds, invoices. Tech = errors, crashes, login.\\nTicket:\\n' + ticket,
      FAST,
    );
    const json = raw.match(/\\{[\\s\\S]*\\}/)?.[0];
    const parsed = json ? Decision.safeParse(JSON.parse(json)) : null;
    if (parsed?.success) return parsed.data;
  }
  return null;
}

export async function route(ticket: string, ticketId: string) {
  const d = await classify(ticket);
  log.info({ ticketId, route: d?.route ?? 'unparsed', confidence: d?.confidence ?? 0 });
  if (!d || d.confidence < 0.6) return askClarifyingQuestion(ticket); // cheap, not frontier
  return agents[d.route](ticket);
}`,
      },
      explanation: 'Substring matching on free text is both brittle and injectable. A zod-validated enum removes ambiguity, the definitions in the prompt fix the "technically billed" confusion, a confidence threshold catches unsure cases, and the fallback is a cheap clarifying question instead of the most expensive agent. Logged decisions become a labelled routing eval set.',
      followUps: [
        { q: 'How would you evaluate the router before shipping a prompt change?', a: 'Build a labelled set of ~200 historical tickets including edge cases, compute accuracy and a confusion matrix per route, and block deploys that drop accuracy or raise the misroute rate to the expensive path.' },
        { q: 'When would you replace the LLM router with an embedding classifier?', a: 'When routes are stable and you have labelled data: a nearest-centroid or logistic classifier on embeddings costs ~1 ms and nearly nothing per call, with the LLM kept only as a fallback for low-margin cases.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'multi-agent-systems-iq-1',
      difficulty: 'hard',
      question: 'A PM wants "a team of 6 agents" (planner, coder, tester, reviewer, doc-writer, PM agent) for a feature-building assistant. How do you decide whether multi-agent is justified?',
      context: 'The product generates small features in an existing codebase. Budget per task is about $2.',
      whatInterviewerLooksFor: [
        'Starts from the simplest architecture and adds agents only for a measured reason',
        'Distinguishes parallelisable breadth tasks from coupled tasks',
        'Quantifies token/cost multipliers against the budget',
        'Proposes an eval to compare single vs multi-agent',
      ],
      modelAnswer: `**Start with the failure mode, not the org chart.** Six role-play agents mirror a human team, but agents don't have the same constraints as humans; the useful question is *what does splitting buy us?*

**Reasons that justify splitting**
- **Context isolation:** a subtask needs to read lots of material that the main thread doesn't need (e.g. searching 30 files to find call sites).
- **Parallelism:** independent breadth-first subtasks.
- **Permission isolation:** a tester sandbox with shell access, separate from an agent with repo-write access.

**Reasons against here**
- Feature code is **tightly coupled**: planner, coder and doc-writer must share many implicit decisions (names, schemas). Splitting them creates mismatches.
- **Cost:** multi-agent setups commonly use 4–15x the tokens of chat. At $2/task, six agents with handoffs leaves little room.

**Proposal**
1. One coding agent with good tools (search, edit, run tests) and a written plan step.
2. Add **subagents as tools** only for isolated, read-heavy jobs: "find all usages of X and summarise" returns ≤ 300 tokens.
3. An **evaluator** step (tests + lint as deterministic gates, an LLM review only on diff) rather than a reviewer *agent*.

**Decide with data:** build 50 representative tasks, measure pass rate (tests green + human review), cost and latency for single-agent vs. single+subagents vs. the 6-agent design. Ship the cheapest design within 2 points of the best pass rate.`,
      followUps: [
        { q: 'What if the single agent keeps running out of context on big repos?', a: 'Add a search/explore subagent that returns condensed findings, enable context compaction or a scratchpad file, and tighten tool outputs (truncate logs, return file excerpts) before adding more agents.' },
        { q: 'How would you let a reviewer catch problems without a full agent?', a: 'Run deterministic checks first (types, tests, lint), then one LLM review call on the diff with a rubric, feeding issues back to the coder for at most two revision rounds.' },
      ],
      pitfalls: [
        'Copying a human org chart into agents without a context or parallelism reason',
        'Ignoring the token multiplier against a fixed per-task budget',
        'Choosing an architecture without a comparative eval',
      ],
    },
    {
      id: 'multi-agent-systems-iq-2',
      difficulty: 'hard',
      question: 'Compare supervisor and handoff (swarm) architectures for a customer-service assistant with billing, tech-support and account agents. Which would you pick and why?',
      whatInterviewerLooksFor: [
        'Clear mechanics of each topology (who holds control, what context moves)',
        'Latency and UX trade-offs for conversational flows',
        'Safety rails: handoff limits, allow-lists, fallback to human',
        'State/memory handling across agents',
      ],
      modelAnswer: `**Mechanics**
- **Supervisor:** every user turn goes to a central agent that calls specialists as tools and composes the reply. Control always returns to the supervisor.
- **Handoff/swarm:** the active agent owns the conversation; it calls \`transfer_to_billing\`, and from then on the billing agent answers the user directly until it hands off again. State records \`activeAgent\`.

**Trade-offs**

| | Supervisor | Handoff |
|---|---|---|
| Latency per turn | +1 LLM hop (supervisor) | Direct |
| Consistency of voice | High (one composer) | Varies by agent |
| Multi-intent turns | Easy: call 2 tools | Awkward: sequential transfers |
| Debuggability | One decision point | Distributed decisions |
| Risk | Supervisor bottleneck | Ping-pong loops |

**Pick for customer service:** usually **handoff**, because conversations are long and mostly single-intent per phase; dropping a hop saves ~0.5–1.5 s per turn, and the specialist can hold its own detailed prompt. Add rails: allow-listed transfer targets, max ~4 transfers per conversation, loop detection, and a human-escalation agent.

If tickets are frequently multi-intent ("refund AND reset my password") or brand voice must be uniform, use a **supervisor** with parallel tool calls.

**State:** keep a shared message history plus structured fields (customerId, verified: bool) so a transfer doesn't re-ask for identity; the receiving agent gets a short handoff note rather than the whole transcript.`,
      followUps: [
        { q: 'How do you avoid re-verifying identity after a handoff?', a: 'Store verification results as structured state (verified, customerId, method, timestamp) that the receiving agent reads, rather than relying on the transcript, and gate sensitive tools on that flag.' },
        { q: 'How would you measure whether routing/handoffs are working?', a: 'Track misroute rate (transfer within one turn of arrival), transfers per conversation, resolution rate per agent and escalations to humans, plus an offline labelled set for the triage decision.' },
      ],
      pitfalls: [
        'Claiming one topology is always better',
        'No guard against infinite transfers',
        'Passing full transcripts on every handoff, blowing up context',
      ],
    },
    {
      id: 'multi-agent-systems-iq-3',
      difficulty: 'expert',
      question: 'Your orchestrated research pipeline (plan → 10 parallel workers → synthesis) occasionally produces reports where two sections contradict each other and costs vary from $0.40 to $9 per run. Diagnose and fix.',
      context: 'LangGraph, Send fan-out, in-memory checkpointer, no budgets, workers each run a ReAct loop with web search.',
      whatInterviewerLooksFor: [
        'Separates the quality issue (contradictions) from the cost-variance issue',
        'Identifies unbounded worker loops and planner fan-out as cost drivers',
        'Adds a reconciliation/verification step before synthesis',
        'Uses traces to find the long-tail runs',
      ],
      modelAnswer: `**Two problems, two root-cause hunts.**

**1. Cost variance ($0.40 → $9)**
Pull traces for the top 5% most expensive runs and group tokens by node. Typical culprits:
- **Unbounded worker loops:** a ReAct worker that keeps searching because the stop criterion is vague. Fix: per-worker step cap (e.g. 8 tool calls) and token cap; instruct "stop when you have 3 corroborating sources".
- **Planner fan-out:** sometimes the plan has 25 questions, not 10. Fix: clamp in code and validate the plan schema (max 10 items).
- **Retries without idempotency:** crash → restart from zero because the checkpointer is in-memory. Fix: PostgresSaver so resumes skip finished workers.
- Add a **run-level budget** in state; the router jumps to synthesis with partial findings when exceeded.

**2. Contradictory sections**
Workers are isolated by design, so they reach different conclusions from different sources (e.g. different years of a statistic). Synthesis just concatenates.
- Make workers return **structured claims**: \`{ claim, value, source, date }\`.
- Add a **reconcile node** before synthesis: detect conflicting claims on the same entity/metric (string match + LLM check), then either pick the most recent authoritative source or run a targeted verification worker.
- Synthesis prompt requires stating the conflict explicitly when unresolved.

**Verify:** a regression set of 30 topics; track contradiction rate (LLM judge + spot checks), p50/p95 cost, and pass rate. Target p95 cost ≤ 3x p50.`,
      followUps: [
        { q: 'Why not just give all workers a shared memory to avoid contradictions?', a: 'Shared mutable memory reintroduces context bloat and ordering races; structured outputs plus an explicit reconcile step keep isolation while resolving conflicts deterministically.' },
        { q: 'Which metric would you alert on in production?', a: 'p95 cost per run and p95 tool calls per worker, plus the fraction of runs hitting the budget guard; a rise usually signals a prompt or search-quality regression.' },
      ],
      pitfalls: [
        'Fixing cost by switching models without finding the long-tail runs',
        'Assuming synthesis can resolve contradictions it cannot see',
        'Leaving an in-memory checkpointer in production',
      ],
    },
    {
      id: 'multi-agent-systems-iq-4',
      difficulty: 'medium',
      question: 'Explain the difference between an agentic workflow and an autonomous agent, and give one production example where you would deliberately choose each.',
      whatInterviewerLooksFor: [
        'Precise definition: who controls the path',
        'Concrete examples with reasons',
        'Awareness of testability, cost and risk differences',
      ],
      modelAnswer: `**Definition**
- **Agentic workflow:** the *code* defines the steps and their order; LLMs fill in each step. Example shape: classify → retrieve → draft → validate.
- **Autonomous agent:** the *LLM* decides which tool to call next and when it is done, in a loop, with the environment's feedback (tool results) as input.

**Why it matters**

| | Workflow | Agent |
|---|---|---|
| Predictability | High | Variable |
| Testing | Per-step unit tests | Trajectory evals |
| Cost | Bounded, known | Variable, needs caps |
| Flexibility | Low | High |

**Choose a workflow:** invoice processing. Steps are known (OCR → extract fields with schema → validate totals → post to ERP). An agent adds risk (skipped validation) with no benefit.

**Choose an agent:** an on-call debugging assistant. The steps depend on what it finds: read logs, then maybe query metrics, then inspect a deploy diff. You cannot hardcode the path, so give it read-only tools, a step cap (e.g. 15), and human approval for any write action.

**Hybrid is common:** a workflow with one agentic node (e.g. "investigate" inside a fixed triage → investigate → report pipeline). That keeps the control plane deterministic while allowing autonomy where it pays.`,
      followUps: [
        { q: 'How do you evaluate the agent version differently?', a: 'Score final outcomes plus trajectories: task success, number of steps, tool-call errors, forbidden actions attempted and cost, across a fixed scenario set with mocked tools for reproducibility.' },
        { q: 'What makes you upgrade a workflow to an agent?', a: 'A growing share of inputs that fall into the fallback path because they need steps the pipeline cannot express, measured on real traffic, not intuition.' },
      ],
      pitfalls: [
        'Calling any LLM pipeline an agent',
        'Choosing an agent for a fully known process',
        'No step cap or approval gates on the agent',
      ],
    },
    {
      id: 'multi-agent-systems-iq-5',
      difficulty: 'expert',
      question: 'Design the orchestration layer for a long-running "migrate 300 services to a new logging library" agent system that must survive deploys, rate limits and partial failure.',
      context: 'Each service migration is a PR produced by a coding agent; CI runs ~10 minutes; humans approve merges.',
      whatInterviewerLooksFor: [
        'Durable state and checkpoints with resumability',
        'Bounded concurrency and rate-limit handling',
        'Idempotent side effects (PR creation)',
        'Progress tracking, retries and escalation to humans',
      ],
      modelAnswer: `**Shape:** orchestrator-workers with a durable queue, not one giant agent loop.

**State model** (Postgres): one row per service: \`status ∈ {pending, in_progress, pr_open, ci_failed, needs_human, merged}\`, attempts, prUrl, lastError. The orchestrator graph is checkpointed per service thread (\`thread_id = 'migrate:' + service\`).

**Flow per service**
1. \`plan\` (read-only agent): find logger usages, produce a change plan.
2. \`code\` (coding agent in a sandbox): apply changes, run unit tests locally.
3. \`open_pr\`: **idempotent**: look up an existing branch/PR by deterministic name \`migrate-logging/<service>\` before creating.
4. \`await_ci\`: don't poll inside the LLM; a webhook resumes the thread when CI finishes.
5. On CI failure: feed the failing log excerpt (truncated to ~2K tokens) back to \`code\`, max 2 retries, then \`needs_human\`.
6. Human approval gate before merge.

**Concurrency and limits:** a worker pool with max 10 services in flight; a token-bucket rate limiter shared across workers for the LLM API; exponential backoff with jitter on 429s.

**Resilience:** durable checkpointer → a deploy mid-run resumes each thread from its last step. Each node has retries; non-retryable errors (repo archived) go straight to \`needs_human\`.

**Observability:** dashboard of counts per status, cost per service (p50/p95), top failure reasons. Kill switch to pause new work.

**Rollout:** run 5 pilot services, review PR quality, then ramp concurrency.`,
      followUps: [
        { q: 'How do you stop the system from opening duplicate PRs after a crash between "create PR" and "save state"?', a: 'Use deterministic branch names and check for an existing PR before creating one, so the create step is idempotent; the checkpoint then records the found or created PR URL.' },
        { q: 'Where would you spend the frontier model vs a cheaper one?', a: 'Frontier model for the code edits and CI-failure repair, a smaller model for planning searches, summarising logs and classifying failures, which are high-volume and easier.' },
      ],
      pitfalls: [
        'A single long-lived agent process holding all progress in memory',
        'LLM-driven polling loops for CI status',
        'Non-idempotent PR creation on retry',
      ],
    },
    {
      id: 'multi-agent-systems-iq-6',
      difficulty: 'hard',
      question: 'A four-agent research system (planner, two researchers, writer) produces confident reports that sometimes contain wrong numbers, and runs occasionally loop until the budget is gone. How do you diagnose and fix it?',
      context: 'Agents share one group chat. The writer decides when the report is finished. All agents use the same model.',
      whatInterviewerLooksFor: [
        'Uses a failure taxonomy (MAST) on real traces instead of guessing',
        'Separates specification, coordination and verification problems',
        'Addresses shared-state poisoning with provenance and an independent verifier',
        'Moves termination and "done" decisions into code; adds diversity where voting is used',
      ],
      modelAnswer: `**Diagnose first.** Pull ~100 failing traces and label them with MAST. My expectation from the symptoms:
- *Wrong numbers* → a verification failure plus poisoning of shared state: one researcher misreads "4.2%" as "42%", the writer copies it, nobody re-checks.
- *Loops* → specification failure: unaware of termination; the writer decides "done" with no cap.

**Fix specification.** Each agent gets a role contract (does / does not do), the planner emits typed tasks with acceptance criteria, and the harness enforces caps (messages, tokens, time) and records the stop reason.

**Fix coordination.** Replace the open group chat with a **blackboard**: researchers post findings to a \`facts\` section with the source URL and quote; entries are append-only and versioned; the writer reads only \`facts\` and \`outline\`, keeping its context small.

**Fix verification.** Add a **read-only verifier** that re-fetches each cited source and checks the quoted number; only verified facts can reach the report. "Done" = all report claims map to verified facts, checked in code.

**Diversity where it helps.** If the researchers vote on ambiguous figures, use different models or sources so their errors are not correlated, and escalate on disagreement.

**Measure.** Outcome evals on golden topics (numeric accuracy against references), failures by MAST category per release, and cost per report.`,
      followUps: [
        { q: 'Why not just add a third researcher and vote?', a: 'Copies of the same model share errors, so a vote can confidently agree on the wrong number. An independent check against the source is cheaper and more reliable.' },
        { q: 'Would a single agent be better here?', a: 'Possibly. If the tasks are sequential and the context fits, one agent with search and a verification step avoids most coordination failures; I would benchmark it against the multi-agent version on the same evals.' },
      ],
      pitfalls: [
        'Adding agents or rounds without labelling failures',
        'Letting an agent declare its own work done',
        'A verifier that writes back into the shared state it checks',
        'Voting among identical models and treating agreement as proof',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'multi-agent-systems-est-1',
      question: 'Estimate the cost per request and daily spend of a supervisor + subagent research assistant serving 2,000 requests/day, versus a single-agent design.',
      assumptions: [
        'Multi-agent: lead on a frontier model (illustrative price $3 / 1M input, $15 / 1M output); 4 subagents on a small model ($1 / 1M input, $5 / 1M output)',
        'Each subagent: 60K input tokens (accumulated tool results across ~8 turns), 3K output tokens',
        'Lead: 25K input, 3K output (planning + synthesis)',
        'Single agent: 150K input, 6K output on the frontier model',
      ],
      steps: [
        { label: 'Subagent cost each', calc: '60K × $1/1M + 3K × $5/1M = $0.060 + $0.015 = $0.075' },
        { label: '4 subagents', calc: '4 × $0.075 = $0.30' },
        { label: 'Lead cost', calc: '25K × $3/1M + 3K × $15/1M = $0.075 + $0.045 = $0.12' },
        { label: 'Multi-agent per request', calc: '$0.30 + $0.12 = $0.42' },
        { label: 'Single agent per request', calc: '150K × $3/1M + 6K × $15/1M = $0.45 + $0.09 = $0.54' },
        { label: 'Daily', calc: 'Multi: 2,000 × $0.42 = $840/day; Single: 2,000 × $0.54 = $1,080/day' },
      ],
      answer: 'About $0.42 per request ($840/day) for multi-agent with small-model workers vs $0.54 ($1,080/day) for a single frontier agent; total tokens are higher for multi-agent (≈ 277K vs 156K) but cheaper per token.',
      insight: 'Multi-agent is not automatically more expensive: it uses more tokens, but pushing the token-heavy exploration onto cheap workers and keeping the expensive lead\'s context small can make it cheaper and faster. If workers ran on the frontier model too, multi-agent would cost ≈ 4 × $0.225 + $0.12 = $1.02 per request.',
      followUps: [
        { q: 'What if prompt caching gives a 90% discount on 50K of each subagent\'s repeated input?', a: 'Each subagent saves 50K × $1/1M × 0.9 = $0.045, so 4 subagents save $0.18 and the request drops to about $0.24, roughly $480/day.' },
      ],
    },
    {
      id: 'multi-agent-systems-est-2',
      question: 'Estimate end-to-end latency for an orchestrator-workers pipeline with 12 workers under a provider limit of 4 concurrent requests, versus sequential execution.',
      assumptions: [
        'Planner call: 2 s',
        'Each worker: 3 LLM calls of ~2.5 s each plus 2 tool calls of ~0.8 s = 9.1 s',
        'Synthesis call: 6 s (long output)',
        'Concurrency capped at 4 workers in flight',
      ],
      steps: [
        { label: 'Worker duration', calc: '3 × 2.5 + 2 × 0.8 = 7.5 + 1.6 = 9.1 s' },
        { label: 'Sequential workers', calc: '12 × 9.1 = 109.2 s' },
        { label: 'Waves at concurrency 4', calc: 'ceil(12 / 4) = 3 waves × 9.1 s = 27.3 s' },
        { label: 'Total sequential', calc: '2 + 109.2 + 6 = 117.2 s ≈ 2 min' },
        { label: 'Total with 4-way concurrency', calc: '2 + 27.3 + 6 = 35.3 s' },
        { label: 'Unlimited concurrency (ideal)', calc: '2 + 9.1 + 6 = 17.1 s' },
      ],
      answer: '≈ 35 s with 4-way concurrency vs ≈ 117 s sequential; the floor with unlimited concurrency is ≈ 17 s, dominated by the slowest worker and synthesis.',
      insight: 'Once workers are parallel, the critical path is planner + slowest worker + synthesis. Further speed comes from raising the concurrency limit, shortening the slowest worker (step caps), and streaming the synthesis to the user.',
      followUps: [
        { q: 'One worker in ten takes 30 s due to retries. What happens to p95 latency and how do you protect it?', a: 'A 30 s straggler in any wave pushes that wave to 30 s, so p95 jumps toward 2 + 30 + 18.2 + 6 ≈ 56 s; set a per-worker timeout and synthesise with partial results, or hedge by re-issuing slow workers.' },
      ],
    },
  ],
  test: [
    {
      id: 'multi-agent-systems-mcq-01',
      difficulty: 'medium',
      question: 'A legal team needs every contract summary translated into French, but only if the English summary passes a "no missing clause" check. Which workflow pattern is this?',
      options: ['Routing', 'Prompt chaining with a gate', 'Voting parallelisation', 'Orchestrator-workers'],
      correct: [1],
      explanation: 'The steps are fixed and sequential (summarise → check → translate) with a programmatic check between them, which is prompt chaining with a gate. Routing picks one branch by input class, voting repeats one task, and orchestrator-workers plans subtasks dynamically.',
      followUps: [{ q: 'What should happen when the gate fails?', a: 'Fail fast with a reason, optionally retry only the summarise step with the gate\'s feedback, and never pass an unchecked summary to translation.' }],
    },
    {
      id: 'multi-agent-systems-mcq-02',
      difficulty: 'hard',
      question: 'Select ALL situations where splitting work across multiple agents is likely to help.',
      options: [
        'Researching 8 independent companies, each needing dozens of page reads',
        'Writing one cohesive 2,000-line feature where every layer shares types',
        'An assistant with 60 tools across unrelated domains that keeps picking wrong tools',
        'Answering a short FAQ question from a 3-page document',
      ],
      correct: [0, 2],
      explanation: 'Independent breadth-first research benefits from parallelism and context isolation, and splitting a huge tool set across specialists improves tool selection. A cohesive feature is tightly coupled (agents make conflicting implicit decisions), and a short FAQ needs a single call.',
      followUps: [{ q: 'What is an alternative to multi-agent for the 60-tool problem?', a: 'Dynamic tool selection: retrieve the top 5–10 relevant tools per request via embeddings on tool descriptions, so one agent sees a small, relevant set.' }],
    },
    {
      id: 'multi-agent-systems-mcq-03',
      difficulty: 'hard',
      question: 'What happens when this graph runs with 5 questions?',
      code: {
        language: 'typescript',
        code: `const State = Annotation.Root({
  questions: Annotation<string[]>(),
  findings: Annotation<string[]>(), // no reducer
});
graph
  .addConditionalEdges('plan', (s) => s.questions.map((q) => new Send('worker', { q })))
  .addNode('worker', async ({ q }) => ({ findings: [await answer(q)] }));`,
      },
      options: [
        'All 5 findings are concatenated in order',
        'The superstep fails with an invalid concurrent update because 5 branches write a last-value key',
        'Only the last worker runs',
        'Workers run sequentially and each overwrites the previous',
      ],
      correct: [1],
      explanation: 'Send runs all 5 workers in the same superstep. A channel without a reducer accepts only one write per step, so LangGraph raises an invalid concurrent graph update error. Adding reducer: (a, b) => a.concat(b) fixes it. Nothing is silently concatenated, and workers are not serialised.',
      followUps: [{ q: 'How would you keep findings in question order?', a: 'Return { q, answer, index } from each worker and sort by index in the synthesis node, because parallel completion order is not guaranteed.' }],
    },
    {
      id: 'multi-agent-systems-mcq-04',
      difficulty: 'expert',
      question: 'A handoff-based support swarm logs conversations with 30+ transfers between "billing" and "account". Which fix addresses the root cause rather than the symptom?',
      options: [
        'Raise the recursion limit so conversations can finish',
        'Clarify ownership in both agents\' prompts (who handles refunds for closed accounts) and add a transfer cap that escalates to a human',
        'Switch both agents to a larger model',
        'Remove the transfer tools and let both agents answer everything',
      ],
      correct: [1],
      explanation: 'Ping-pong usually means overlapping or missing ownership for an edge case. Clarifying boundaries removes the cause, and a cap with human escalation bounds the damage. A higher recursion limit only lets the loop run longer; a bigger model may still disagree on ownership; removing transfers destroys the specialisation.',
      followUps: [{ q: 'How would you find which edge cases cause the loops?', a: 'Cluster the first user message of looping conversations (embeddings + k-means or an LLM labeller) and inspect the top clusters for ownership gaps.' }],
    },
    {
      id: 'multi-agent-systems-mcq-05',
      difficulty: 'hard',
      question: 'Select ALL properties a checkpointer gives a LangGraph orchestration.',
      options: [
        'Resume a crashed run from the last completed superstep using the same thread_id',
        'Automatic deduplication of external side effects (e.g. emails) on retry',
        'Inspection of state history for debugging and time-travel',
        'Persistence needed to pause for human input and resume later',
      ],
      correct: [0, 2, 3],
      explanation: 'Checkpoints save state per superstep, enabling resume, history inspection/time-travel and interrupts for human input. They do not make external side effects idempotent: a node that sent an email and then crashed before its checkpoint will run again, so you still need idempotency keys.',
      followUps: [{ q: 'Which checkpointer would you use in production on Postgres?', a: 'PostgresSaver from @langchain/langgraph-checkpoint-postgres, calling setup() once to create tables, with a retention job to prune old threads.' }],
    },
    {
      id: 'multi-agent-systems-mcq-06',
      difficulty: 'expert',
      question: 'What is wrong with this evaluator-optimizer loop?',
      code: {
        language: 'typescript',
        code: `let draft = await generate(task);
while (true) {
  const { score, feedback } = await evaluate(draft); // 1-5
  if (score === 5) break;
  draft = await revise(draft, feedback);
}
return draft;`,
      },
      options: [
        'Nothing; it stops once the draft is perfect',
        'It has no iteration cap and requires a perfect score, so it may never terminate, and it returns the last draft rather than the best one',
        'It should evaluate before generating',
        'evaluate and revise must use the same model',
      ],
      correct: [1],
      explanation: 'LLM judges are noisy and revisions can oscillate, so a perfect-score-only exit can loop forever. Add a cap (2–3), accept a threshold such as ≥ 4, and keep the best-scoring draft. Order of evaluate/generate is fine, and using different models for judge and generator is often better.',
      followUps: [{ q: 'Why might the score go down after a revision?', a: 'The reviser fixes the named issue but introduces new ones or drifts from the original constraints, and judge variance adds noise, which is why you track the best draft.' }],
    },
    {
      id: 'multi-agent-systems-mcq-07',
      difficulty: 'medium',
      question: 'A supervisor agent calls 3 subagents as tools. Which design keeps the supervisor\'s context smallest?',
      options: [
        'Return each subagent\'s full message list to the supervisor',
        'Return each subagent\'s final, length-capped answer only',
        'Share one message history among all agents',
        'Have subagents write directly into the supervisor\'s system prompt',
      ],
      correct: [1],
      explanation: 'A length-capped final answer gives the supervisor what it needs without the exploration noise. Full transcripts or a shared history defeat context isolation, and editing the system prompt per call breaks caching and mixes concerns.',
      followUps: [{ q: 'When might you return more than a summary?', a: 'When the supervisor must cite or verify details: return structured data (claims with source URLs) or store artifacts externally and pass a reference the supervisor can fetch.' }],
    },
    {
      id: 'multi-agent-systems-mcq-08',
      difficulty: 'hard',
      question: 'Select ALL changes that reduce the risk of runaway cost in an orchestrated agent run.',
      options: [
        'Clamp the planner\'s fan-out to a maximum number of workers in code',
        'Track a token budget in graph state and route to synthesis when exceeded',
        'Increase max_tokens on every call so answers are complete in one shot',
        'Set a recursion/step limit and a per-worker tool-call cap',
      ],
      correct: [0, 1, 3],
      explanation: 'Clamping fan-out, budget-aware routing and step caps all bound spend. Raising max_tokens does nothing to bound loops and can increase cost per call.',
      followUps: [{ q: 'What should the user see when the budget guard fires?', a: 'A useful partial result that clearly lists what was covered and what was not, with an option to continue (and spend more) explicitly.' }],
    },
    {
      id: 'multi-agent-systems-mcq-09',
      difficulty: 'hard',
      question: 'Your router uses a small model and a free-text answer. Misroutes are 9%. Which change most directly reduces misroutes while keeping cost low?',
      options: [
        'Replace the router with the frontier model',
        'Require a zod-validated enum with route definitions and few-shot edge cases, plus a confidence threshold with a clarify fallback',
        'Send every ticket to all specialists and pick the longest answer',
        'Remove routing and use one general agent',
      ],
      correct: [1],
      explanation: 'Most misroutes come from ambiguous categories and unparsed output. Structured enums, definitions, edge-case examples and a low-confidence path fix those cheaply. A frontier router costs more and may not fix ambiguity; broadcasting multiplies cost; removing routing loses specialisation.',
      followUps: [{ q: 'How do you know the change worked?', a: 'Compare accuracy and the confusion matrix on a held-out labelled set of historical tickets before and after, and monitor transfer-within-one-turn in production.' }],
    },
    {
      id: 'multi-agent-systems-mcq-10',
      difficulty: 'expert',
      question: 'A worker node charges a customer and then the pod is killed before the superstep checkpoint is written. On resume, what happens and what is the correct mitigation?',
      code: {
        language: 'typescript',
        code: `.addNode('charge', async (s) => {
  const r = await stripe.charges.create({ amount: s.amount, currency: 'usd', customer: s.cid });
  return { chargeId: r.id };
})`,
      },
      options: [
        'The checkpointer remembers the charge, so it is skipped',
        'The node re-runs and charges again; pass an idempotency key derived from thread_id + node so the provider dedupes',
        'LangGraph rolls back the external charge automatically',
        'The graph refuses to resume until a human intervenes',
      ],
      correct: [1],
      explanation: 'Checkpoints are written after the superstep completes, so a node interrupted mid-way re-executes on resume. External side effects must be idempotent: Stripe and most payment APIs accept an Idempotency-Key header. LangGraph cannot roll back external systems, and it does not block resume.',
      followUps: [{ q: 'Besides idempotency keys, what structural pattern helps?', a: 'Split side effects into their own small nodes placed after an approval or validation step, and record intent (pending charge row) before calling the provider so reconciliation can detect half-done work.' }],
    },
    {
      id: 'multi-agent-systems-mcq-11',
      difficulty: 'medium',
      question: 'Select ALL valid uses of the voting form of parallelisation.',
      options: [
        'Running 3 independent safety classifiers and flagging content if 2 say unsafe',
        'Splitting a 50-page report into 10 sections summarised concurrently',
        'Generating 5 SQL candidates and executing the one most often produced',
        'Translating a document once into French',
      ],
      correct: [0, 2],
      explanation: 'Voting runs the same task several times and aggregates (majority, self-consistency). Safety classification and SQL self-consistency fit. Summarising different sections is sectioning, not voting, and a single translation has no aggregation.',
      followUps: [{ q: 'What is the main cost of voting and how do you limit it?', a: 'It multiplies calls by n; use a small model, keep n at 3–5, and only escalate to voting when a first cheap pass is uncertain.' }],
    },
    {
      id: 'multi-agent-systems-mcq-12',
      difficulty: 'hard',
      question: 'Why does this subagent tool make the supervisor worse over a long session?',
      code: {
        language: 'typescript',
        code: `const research = tool(async ({ q }) => {
  const out = await researcher.invoke({ messages: [{ role: 'user', content: q }] });
  return JSON.stringify(out.messages); // everything, including tool results
}, { name: 'research', description: 'research', schema: z.object({ q: z.string() }) });`,
      },
      options: [
        'JSON.stringify is slow',
        'It dumps the whole subagent transcript (tens of thousands of tokens) into the supervisor\'s context, and the vague description hurts tool selection',
        'Subagents cannot be invoked inside tools',
        'The schema must use z.string().min(1)',
      ],
      correct: [1],
      explanation: 'Returning all messages defeats context isolation: the supervisor\'s context fills with raw search results, raising cost and degrading attention. Return a capped final answer and write a descriptive tool description. Invoking agents in tools is a supported pattern, and serialisation speed is irrelevant.',
      followUps: [{ q: 'What would a good description for this tool say?', a: 'What it does, when to use it and what it returns, e.g. "Research one company or question on the web; call in parallel for several; returns ≤ 400 words with source URLs."' }],
    },
    {
      id: 'multi-agent-systems-mcq-13',
      difficulty: 'medium',
      question: 'Your debate setup uses three copies of one model for 5 rounds and accuracy is no better than simple majority voting. Which change is most likely to help?',
      options: [
        'Increase to 10 rounds so the agents fully converge',
        'Use different models or evidence sources, keep 2–3 rounds and add an independent judge',
        'Let the most confident agent overrule the others',
        'Lower the temperature to zero for every agent',
      ],
      correct: [1],
      explanation:
        'Copies of one model have correlated errors and long debates encourage conformity. Heterogeneous agents, bounded rounds and a judge that weighs reasoning address both; more rounds or deferring to confidence make conformity worse.',
      followUps: [{ q: 'What baseline must debate beat before you ship it?', a: 'Self-consistency with the same model at the same total budget (same number of calls or tokens), measured on a labelled set.' }],
    },
    {
      id: 'multi-agent-systems-mcq-14',
      difficulty: 'hard',
      question: 'Which measures reduce memory poisoning on a shared blackboard used by several agents? Select ALL that apply.',
      options: [
        'Record author and cited sources on every entry',
        'Make entries append-only, with corrections superseding old entries',
        'Let the verifier agent overwrite entries it thinks are wrong',
        'Keep a read-only verifier that re-checks entries against their sources and reports elsewhere',
      ],
      correct: [0, 1, 3],
      explanation:
        'Provenance, append-only history and an independent read-only verifier contain bad entries and keep an audit trail. A verifier that writes to the board becomes another writer that can itself be wrong or poisoned.',
      followUps: [{ q: 'How do you stop two agents overwriting each other\'s updates?', a: 'Versioned writes with optimistic concurrency: each write states the version it read, and a stale write is rejected so the agent re-reads and retries.' }],
    },
    {
      id: 'multi-agent-systems-mcq-15',
      difficulty: 'medium',
      question: 'In the MAST taxonomy, a coder agent ignores the tester agent\'s report of a failing case and carries on. Which category does this fall under?',
      options: [
        'Specification and system design',
        'Inter-agent misalignment',
        'Task verification and termination',
        'Infrastructure failure',
      ],
      correct: [1],
      explanation:
        'Ignoring another agent\'s input is an inter-agent misalignment mode. Typed hand-offs, where a failing test result blocks the next step in code, fix it better than a prompt asking the coder to pay attention.',
      followUps: [{ q: 'What are the other two MAST categories?', a: 'Specification and system design (bad roles, tasks or stop conditions) and task verification and termination (missing, wrong or premature checks).' }],
    },
  ],
};

export default topic;
