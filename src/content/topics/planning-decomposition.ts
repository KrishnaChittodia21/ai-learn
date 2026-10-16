import type { Topic } from '../../types';

const topic: Topic = {
  id: 'planning-decomposition',
  phase: 'agents',
  order: 2,
  title: 'Planning and Task Decomposition',
  subtitle:
    'Plan-and-execute, ReWOO, LLMCompiler-style DAGs, re-planning and decomposition strategies that make agents faster, cheaper and easier to control',
  estimatedMinutes: 36,
  sources: [
    'Wang et al. 2023 — Plan-and-Solve Prompting (arXiv:2305.04091)',
    'Xu et al. 2023 — ReWOO: Decoupling Reasoning from Observations for Efficient Augmented Language Models (arXiv:2305.18323)',
    'Kim et al. 2024 — An LLM Compiler for Parallel Function Calling (ICML 2024, arXiv:2312.04511)',
    'Zhou et al. 2023 — Least-to-Most Prompting Enables Complex Reasoning in Large Language Models (ICLR 2023)',
    'Yao et al. 2023 — ReAct: Synergizing Reasoning and Acting in Language Models (ICLR 2023)',
    'Anthropic Engineering — Building effective agents (orchestrator-workers pattern), Dec 2024',
    'LangChain blog — Plan-and-Execute Agents (plan-and-execute, ReWOO, LLMCompiler in LangGraph)',
    'Zod documentation — schemas, superRefine and z.toJSONSchema (v4)',
  ],
  tags: ['agents', 'planning', 'plan-and-execute', 'rewoo', 'llmcompiler', 'task-decomposition', 'dag', 're-planning', 'orchestrator-worker'],
  cheatSheet: [
    'Plan-and-execute = 1 planner call that writes a step list + an executor that runs steps (often with a cheaper model) + a re-planner that edits the remaining plan.',
    'ReAct interleaves think→act→observe on every step: adaptive but pays the full prompt each turn, so tokens grow roughly quadratically with step count.',
    'ReWOO: Planner writes all steps with placeholders (#E1, #E2), Workers fill them by calling tools, Solver answers once; ~5x fewer tokens than ReAct on HotpotQA in the paper.',
    'LLMCompiler: planner emits a DAG of tool calls, a task-fetching unit dispatches every step whose deps are done; up to 3.7x lower latency and 6.7x lower cost vs ReAct (paper maxima).',
    'Validate every plan before running it: zod schema for shape, then custom checks for unknown tools, dangling/forward deps, cycles and step budget.',
    'Re-plan on signals, not on every step: tool error after retries, empty/contradicting observation, violated precondition, budget threshold, or user change.',
    'Always cap loops: max steps, max re-plans (2–3), max tokens/$, and wall-clock deadline; on exhaustion return a partial answer with what is missing.',
    'Least-to-most: first decompose into ordered sub-questions, then solve them in order feeding earlier answers forward; hierarchical planning repeats this at multiple levels.',
    'Orchestrator-worker: an LLM decides subtasks at runtime and fans them out to workers, then synthesises; use when subtasks cannot be predicted in advance.',
    'Granularity rule of thumb: a subtask should be one tool call or one focused LLM call with a checkable output; finer adds overhead, coarser hides failures.',
  ],
  sections: [
    {
      heading: 'Planning and Execution — plan-and-execute, ReWOO, LLMCompiler and re-planning',
      body: `**Intuition:** a ReAct agent is a hiker deciding each footstep while looking at the ground; a plan-and-execute agent first draws the route on a map, then walks it, and only re-draws when the trail is washed out. (Basic ReAct: see *Agent Fundamentals*.)

**Mechanics.** Separate *thinking about what to do* from *doing it*:

1. **Planner** (strong model, one call) turns the goal into a structured list of steps: tool, arguments, dependencies.
2. **Validator** (code, not an LLM) rejects plans with unknown tools, dangling dependencies, cycles or too many steps.
3. **Executor** runs steps (tool calls, or a cheaper model per step) and records results.
4. **Re-planner** is called only on a *trigger*: a step fails after retries, an observation is empty or contradicts the plan's assumption, a budget threshold is crossed, or the user changes the goal. It sees completed steps and rewrites only the remaining ones.

Three well-known variants:

| Pattern | LLM calls | Adapts mid-run? | Parallel tools? |
|---|---|---|---|
| ReAct | 1 per step | every step | no (sequential) |
| Plan-and-execute | 1 plan + per-step + re-plans | via re-planner | optional |
| ReWOO | planner + solver (2) | no (plan is blind) | yes, if no deps |
| LLMCompiler | planner (streams DAG) + joiner | joiner may re-plan | yes, DAG-driven |

**ReWOO** writes steps with evidence variables such as \`#E2 = Search[population of #E1]\`; workers substitute earlier results, and a solver produces the answer from plan + evidence.

**When to use it:** multi-step tasks whose structure is predictable (research reports, data pipelines, form filling) where you want lower cost, parallelism and an auditable plan you can show a human before execution. Stay with ReAct when each step genuinely depends on what you just saw (debugging, exploratory browsing).`,
      example: `Goal: *"Which is bigger: the population of the capital of Australia or of the capital of Canada?"*

ReWOO planner output (one call, ~180 output tokens):
- #E1 = Search[capital of Australia] → "Canberra"
- #E2 = Search[capital of Canada] → "Ottawa"
- #E3 = Search[population of #E1] → "~470,000 (2024)"
- #E4 = Search[population of #E2] → "~1.1 million (2024)"

DAG: E1 and E2 run in parallel; E3 waits for E1, E4 for E2. With 1.2 s per search, wall clock is 2.4 s instead of 4.8 s sequential. Solver gets plan + evidence (~900 tokens) → "Ottawa (~1.1M) is larger than Canberra (~0.47M)." A ReAct agent needs 5 LLM calls re-reading a growing transcript (~9K input tokens total) versus ~2.5K for ReWOO.`,
      diagram: `            goal
              |
        +-----v------+        invalid -> retry planner (max 2)
        |  PLANNER   |-----> validate (zod + graph checks)
        +-----+------+
              | plan = DAG of steps
     +--------v---------+     ready steps run in parallel
     |   EXECUTOR       |---> [E1 search] [E2 search]
     | (task fetcher)   |---> [E3 dep E1] [E4 dep E2]
     +--------+---------+
              | results / failure / budget signal
        +-----v------+   trigger?  yes -> RE-PLANNER (keeps done
        |  JOINER    |-----------------> steps, rewrites the rest)
        +-----+------+
              | no
           answer`,
      code: [
        {
          language: 'typescript',
          title: 'Plan-and-execute with a forced plan schema and bounded re-planning',
          code: `import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const client = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';
const TOOLS = { search: async (q: string) => 'result for ' + q }; // your real tools
type ToolName = keyof typeof TOOLS;

const Step = z.object({ id: z.string(), tool: z.enum(['search']), input: z.string(), deps: z.array(z.string()) });
const Plan = z.object({ steps: z.array(Step).min(1).max(8) }); // step budget enforced by schema
type PlanT = z.infer<typeof Plan>;

async function makePlan(goal: string, done: Record<string, string> = {}): Promise<PlanT> {
  // Structured outputs constrain the reply to the schema (current Claude models reject a forced tool_choice)
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    output_config: { format: zodOutputFormat(Plan) },
    messages: [{ role: 'user', content: 'Goal: ' + goal + '\\nCompleted steps: ' + JSON.stringify(done) +
      '\\nPlan only the REMAINING steps. Refer to earlier results as #<id>.' }],
  });
  return Plan.parse(res.parsed_output); // throws on bad shape (e.g. a refusal with no output)
}

export async function run(goal: string, maxReplans = 2) {
  const results: Record<string, string> = {};
  let plan = await makePlan(goal);
  for (let replans = 0; ; ) {
    try {
      for (const s of plan.steps) {
        const input = s.input.replace(/#(\\w+)\\b/g, (_, id) => results[id] ?? '#' + id); // fill evidence
        const out = await TOOLS[s.tool as ToolName](input);
        if (!out.trim()) throw new Error('empty observation for ' + s.id); // re-plan trigger
        results[s.id] = out;
      }
      return results;
    } catch (err) {
      if (++replans > maxReplans) return { partial: results, error: String(err) }; // bounded
      plan = await makePlan(goal, results); // keep completed work, rewrite the rest
    }
  }
}`,
        },
      ],
      prosCons: {
        pros: [
          'Far fewer large-model calls: one planning call replaces N reasoning turns, so token cost drops (ReWOO reports ~5x on HotpotQA).',
          'The plan is an inspectable artifact: you can validate it, log it, show it to a human for approval, and diff it across prompt versions.',
          'Independent steps can run in parallel (LLMCompiler-style DAG), cutting wall-clock latency.',
          'Execution can use cheaper models or plain code per step, reserving the strong model for planning.',
        ],
        cons: [
          {
            con: 'The plan is written before any observation, so it can be wrong when reality differs (e.g. a search returns nothing).',
            fix: 'Add explicit re-plan triggers (empty/contradicting observation, tool error after retries) and a re-planner that sees completed steps and rewrites only the rest.',
          },
          {
            con: 'LLM-generated plans can reference tools that do not exist, steps that are not defined, or contain cycles.',
            fix: 'Force the plan through a tool/JSON schema, parse with zod, then run graph checks (known tools, deps exist, topological order) before executing anything.',
          },
          {
            con: 'Re-planning can loop forever on an impossible goal, burning budget.',
            fix: 'Cap re-plans (2–3), total steps and $ spend; on exhaustion return a partial answer that lists missing pieces.',
          },
          {
            con: 'Up-front planning adds latency before the first useful action for very short tasks.',
            fix: 'Route: send 1–2 step requests straight to a single tool call or ReAct, and use the planner only above a complexity threshold.',
          },
        ],
      },
      keyPoints: [
        'Split planner (strong model, once) from executor (tools or cheap model, many times).',
        'Validate the plan with code before you run a single step.',
        'Re-plan on triggers, keep completed results, rewrite only remaining steps.',
        'ReWOO = blind plan with #E variables; LLMCompiler = DAG with parallel dispatch.',
        'Every loop needs hard caps on steps, re-plans, tokens and time.',
      ],
      exercise: {
        prompt: `Write \`validatePlan(plan, allowedTools, maxSteps)\` that returns a list of human-readable errors (empty list = valid).

Acceptance criteria:
- errors for: more than \`maxSteps\` steps, duplicate step ids, a tool not in \`allowedTools\`, a dependency on a step id that does not exist, and a dependency cycle;
- \`[{id:'a',tool:'search',deps:[]},{id:'b',tool:'search',deps:['a']}]\` is valid;
- \`[{id:'a',tool:'search',deps:['b']},{id:'b',tool:'search',deps:['a']}]\` reports a cycle.`,
        starter: {
          language: 'typescript',
          code: `type Step = { id: string; tool: string; deps: string[] };

export function validatePlan(plan: Step[], allowedTools: Set<string>, maxSteps: number): string[] {
  const errors: string[] = [];
  // TODO 1: step budget
  // TODO 2: duplicate ids
  // TODO 3: unknown tools and dangling deps
  // TODO 4: cycle detection (Kahn's algorithm or DFS)
  return errors;
}`,
        },
        hints: [
          'Build a Map from id to step first; duplicates are ids you see twice.',
          'For cycles, compute in-degree per step, repeatedly remove steps with in-degree 0; if anything remains, there is a cycle.',
          'Ignore dangling deps when computing in-degree so one error does not cascade into a fake cycle report.',
        ],
        solution: {
          language: 'typescript',
          code: `type Step = { id: string; tool: string; deps: string[] };

export function validatePlan(plan: Step[], allowedTools: Set<string>, maxSteps: number): string[] {
  const errors: string[] = [];
  if (plan.length > maxSteps) errors.push('plan has ' + plan.length + ' steps (max ' + maxSteps + ')');

  const byId = new Map<string, Step>();
  for (const s of plan) {
    if (byId.has(s.id)) errors.push('duplicate step id ' + s.id);
    byId.set(s.id, s);
  }
  for (const s of plan) {
    if (!allowedTools.has(s.tool)) errors.push(s.id + ': unknown tool ' + s.tool);
    for (const d of s.deps) if (!byId.has(d)) errors.push(s.id + ': depends on missing step ' + d);
  }

  // Kahn's algorithm: in-degree counts only deps that exist
  const indeg = new Map<string, number>();
  for (const s of byId.values()) indeg.set(s.id, s.deps.filter((d) => byId.has(d)).length);
  const queue = [...indeg].filter(([, n]) => n === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited++;
    for (const s of byId.values()) {
      if (s.deps.includes(id)) {
        const n = indeg.get(s.id)! - 1;
        indeg.set(s.id, n);
        if (n === 0) queue.push(s.id);
      }
    }
  }
  if (visited < byId.size) errors.push('dependency cycle among: ' + [...indeg].filter(([, n]) => n > 0).map(([id]) => id).join(', '));
  return errors;
}`,
        },
        explanation:
          'A zod schema checks shape, but graph properties (references and acyclicity) need code. Kahn\'s algorithm removes nodes with no unmet dependencies; anything left over must sit on a cycle. Returning a list of errors (rather than throwing on the first) lets you feed all problems back to the planner in one repair prompt.',
      },
      quickCheck: {
        question:
          'A ReWOO plan says "#E2 = Search[CEO of #E1]", but the worker for #E1 returns an empty result. What happens in vanilla ReWOO?',
        options: [
          'The worker for #E2 automatically re-plans because it notices the empty input',
          '#E2 still runs with an empty or useless query, because the plan was fixed before any observation',
          'The solver is skipped and the planner is called again',
          'ReWOO detects the empty result and switches to ReAct for the rest of the task',
        ],
        correct: 1,
        explanation:
          'ReWOO decouples reasoning from observations: the plan is written once and workers just substitute evidence. There is no built-in feedback loop, which is why production systems add re-plan triggers (as LLMCompiler\'s joiner or a plan-and-execute re-planner does).',
      },
      source: 'Xu et al. 2023 — ReWOO (arXiv:2305.18323); Kim et al. 2024 — LLMCompiler (arXiv:2312.04511)',
    },
    {
      heading: 'Task Decomposition — least-to-most, hierarchical and orchestrator-worker splits',
      body: `**Intuition:** decomposition is what a good tech lead does with an epic: break it into tickets small enough that each has a clear "done" check, note which tickets block which, and hand independent tickets to different people at once.

**Mechanics.** Four strategies, from simplest to most dynamic:

| Strategy | Who decides subtasks | Shape | Good for |
|---|---|---|---|
| Fixed chain (prompt chaining) | you, in code | linear | known pipelines (extract → translate → format) |
| Least-to-most | LLM, once | ordered list; each answer feeds the next | reasoning/maths where later parts need earlier ones |
| Hierarchical | LLM, recursively | tree: goal → subgoals → steps | long projects (reports, codebase migrations) |
| Orchestrator-worker | LLM at runtime | fan-out/fan-in | unpredictable subtasks (which files to change, which sources to read) |

A decomposition is good when each subtask has: **one responsibility**, **explicit inputs** (which earlier outputs it uses, i.e. its edges in the dependency graph), **a checkable output** (schema, test, citation), and **a budget** (tokens, tool calls, time).

**Granularity** is the key trade-off. Too coarse and a single worker hides failure inside a long answer; too fine and you pay orchestration overhead (each subtask re-sends instructions and context) and lose coherence. A practical target: one subtask ≈ one tool call or one focused LLM call of a few thousand tokens, with 3–10 subtasks per level and at most 2–3 levels.

Recursion stops when a node is "atomic" (directly executable) or a depth/budget cap is hit.

**When to use it:** whenever a request is too big for one call's context or one model's attention, needs different tools/models per part, or benefits from parallelism. Don't decompose tasks a single call already does well: every split is another place to lose context.`,
      example: `Request: *"Write a competitive brief on our 3 rivals' pricing and summarise risks."*

Orchestrator (1 call, ~600 output tokens) emits:
- t1 research(A pricing), t2 research(B pricing), t3 research(C pricing) — no deps
- t4 table(compare t1,t2,t3) — deps t1,t2,t3
- t5 risks(t4) — dep t4
- t6 write_brief(t4,t5)

Execution: t1–t3 run in parallel (each ~8 s with 3 searches), then t4 (3 s), t5 (4 s), t6 (6 s) → ~21 s wall clock versus ~45 s sequential. Each worker returns zod-validated JSON like {vendor, plans:[{name, usdPerSeat}], sources:[url]}; t2 returns no sources, so the validator rejects it and only t2 is retried, not the whole brief. Total: 6 subtasks, 1 level deep — fine-grained enough to retry locally, coarse enough to keep overhead under ~15% of tokens.`,
      diagram: `   least-to-most (sequential)        orchestrator-worker (fan-out)

   Q -> [decompose]                         goal
        q1 -> a1                              |
        q2 + a1 -> a2                   [orchestrator]
        q3 + a1,a2 -> a3            /        |        \\
        Q + a1..a3 -> answer     [w:A]     [w:B]     [w:C]   parallel
                                    \\        |        /
   hierarchical (tree)              [table: deps A,B,C]
   goal                                      |
    +- subgoal 1 -> step, step          [risks] -> [write brief]
    +- subgoal 2 -> step, step
         (stop at depth 2-3 or when atomic)`,
      code: [
        {
          language: 'typescript',
          title: 'DAG executor: run every ready subtask in parallel, fill #id references',
          code: `type Task = { id: string; deps: string[]; run: (inputs: Record<string, string>) => Promise<string> };

export async function runDag(tasks: Task[], maxParallel = 4): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  const pending = new Map(tasks.map((t) => [t.id, t]));

  while (pending.size) {
    // ready = every dependency already has a result
    const ready = [...pending.values()].filter((t) => t.deps.every((d) => d in results));
    if (!ready.length) throw new Error('deadlock: cycle or missing dep among ' + [...pending.keys()].join(','));

    const batch = ready.slice(0, maxParallel); // respect provider rate limits
    const outs = await Promise.allSettled(
      batch.map((t) => t.run(Object.fromEntries(t.deps.map((d) => [d, results[d]])))),
    );
    outs.forEach((o, i) => {
      const t = batch[i];
      if (o.status === 'rejected') throw new Error('task ' + t.id + ' failed: ' + o.reason); // or trigger re-plan
      results[t.id] = o.value;
      pending.delete(t.id);
    });
  }
  return results;
}

// Substitute ReWOO-style references safely: #E1 must not match inside #E10
export const fill = (text: string, results: Record<string, string>) =>
  text.replace(/#(E\\d+)\\b/g, (m, id) => results[id] ?? m);`,
        },
      ],
      prosCons: {
        pros: [
          'Each subtask fits comfortably in context and gets the model\'s full attention, improving quality on long tasks.',
          'Independent branches run in parallel, so latency tracks the critical path rather than the step count.',
          'Failures are local: validate and retry one subtask instead of regenerating everything.',
          'Different subtasks can use different models and tools (cheap model for extraction, strong model for synthesis).',
        ],
        cons: [
          {
            con: 'Context is lost between subtasks, so workers duplicate effort or contradict each other.',
            fix: 'Give every worker a shared brief (goal, constraints, glossary) plus only the outputs of its declared deps, and make the synthesis step reconcile conflicts explicitly.',
          },
          {
            con: 'Over-decomposition multiplies calls and overhead (repeated system prompts, orchestration turns).',
            fix: 'Set a granularity target (one tool call or one focused LLM call per subtask), cap subtasks per level (≤10) and depth (≤3), and use prompt caching for the shared prefix.',
          },
          {
            con: 'The decomposer can miss a required subtask, so the final answer is silently incomplete.',
            fix: 'Add a coverage check: a verifier compares the original requirements against subtask outputs and adds missing subtasks before synthesis.',
          },
          {
            con: 'Parallel fan-out can blow through rate limits and budgets.',
            fix: 'Bound concurrency (semaphore of 4–8), give each subtask a token/tool-call budget, and stop scheduling new branches once the global budget hits 80%.',
          },
        ],
      },
      keyPoints: [
        'Good subtasks have one responsibility, explicit inputs, a checkable output and a budget.',
        'Least-to-most solves sub-questions in order, feeding earlier answers forward.',
        'Orchestrator-worker decides subtasks at runtime; fixed chains decide them in code.',
        'Latency follows the critical path of the dependency graph, not the subtask count.',
        'Cap depth and fan-out; every split is another place to lose context.',
      ],
      exercise: {
        prompt: `Implement \`leastToMost(question, ask)\` where \`ask(prompt)\` returns the model's text.

Acceptance criteria:
- first call asks the model to list sub-questions, one per line, simplest first (max 5);
- then answers each sub-question in order, including all previous Q/A pairs in the prompt;
- finally answers the original question using all Q/A pairs;
- returns \`{ subQuestions, answers, final }\` and makes exactly \`n + 2\` calls for \`n\` sub-questions.`,
        starter: {
          language: 'typescript',
          code: `type Ask = (prompt: string) => Promise<string>;

export async function leastToMost(question: string, ask: Ask) {
  // TODO 1: decompose into <= 5 sub-questions
  // TODO 2: solve them in order, accumulating Q/A context
  // TODO 3: final answer
}`,
        },
        hints: [
          'Split the decomposition output on newlines, strip numbering like "1." and drop empty lines, then slice(0, 5).',
          'Keep a running string of "Q: ... A: ..." pairs and prepend it to each new sub-question prompt.',
          'The final prompt is the same running context plus the original question.',
        ],
        solution: {
          language: 'typescript',
          code: `type Ask = (prompt: string) => Promise<string>;

export async function leastToMost(question: string, ask: Ask) {
  const decomposition = await ask(
    'Break this problem into at most 5 simpler sub-questions, simplest first, one per line, no answers.\\n' +
      'Problem: ' + question,
  );
  const subQuestions = decomposition
    .split('\\n')
    .map((l) => l.replace(/^\\s*\\d+[.)]\\s*/, '').trim()) // strip "1." / "2)"
    .filter(Boolean)
    .slice(0, 5);

  const answers: string[] = [];
  let context = '';
  for (const q of subQuestions) {
    const a = await ask(context + 'Q: ' + q + '\\nA (short):');
    answers.push(a.trim());
    context += 'Q: ' + q + '\\nA: ' + a.trim() + '\\n'; // earlier answers feed later ones
  }
  const final = await ask(context + 'Using the answers above, answer: ' + question);
  return { subQuestions, answers, final: final.trim() };
}`,
        },
        explanation:
          'Least-to-most has two stages: decomposition, then sequential solving where each sub-answer is appended to the context. This is what lets it generalise to problems harder than the few-shot examples. The 5-question cap is a budget; without it a verbose model can produce 15 trivial sub-questions.',
      },
      quickCheck: {
        question:
          'A decomposition has 8 subtasks: 6 independent research tasks (5 s each) feeding 1 compare task (4 s) feeding 1 write task (6 s). With unlimited parallelism, what is the approximate wall-clock time?',
        options: ['40 s', '15 s', '20 s', '30 s'],
        correct: 1,
        explanation:
          'Latency follows the critical path: one research task (5 s, all 6 run in parallel) + compare (4 s) + write (6 s) = 15 s. 40 s is the sequential sum; the subtask count does not matter when branches are independent.',
      },
      source: 'Zhou et al. 2023 — Least-to-Most Prompting; Anthropic — Building effective agents (orchestrator-workers)',
    },
  ],
  codeChallenges: [
    {
      id: 'planning-decomposition-cc-1',
      title: 'Harden a naive plan-and-execute loop',
      context:
        'A support agent asks the model for a JSON plan, then executes it. In production it crashed on malformed JSON, called a non-existent "delete_account" tool, and once re-planned 140 times on an impossible request, costing $38.',
      task: 'Make the loop safe: structured plan output, schema + tool allowlist validation, bounded re-planning, a token budget, and a graceful partial result.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();

export async function agent(goal: string, tools: Record<string, (a: any) => Promise<string>>) {
  while (true) {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Return a JSON plan [{tool, args}] for: ' + goal }],
    });
    const plan = JSON.parse(r.choices[0].message.content!); // may throw
    try {
      const out = [];
      for (const step of plan) out.push(await tools[step.tool](step.args)); // unknown tool -> crash
      return out;
    } catch {
      continue; // re-plan forever
    }
  }
}`,
      },
      hints: [
        'Use response_format with a JSON schema (or a forced tool call) and parse with zod safeParse.',
        'Check every step.tool against Object.keys(tools) before executing anything.',
        'Track replans and usage.total_tokens; stop when either cap is reached and return what you have.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
const Plan = z.object({
  steps: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()) })).min(1).max(6),
});

type Tools = Record<string, (a: Record<string, unknown>) => Promise<string>>;

export async function agent(goal: string, tools: Tools, maxReplans = 2, maxTokens = 20_000) {
  const done: { tool: string; result: string }[] = [];
  let tokens = 0;
  let feedback = '';
  for (let attempt = 0; attempt <= maxReplans; attempt++) {
    const r = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_schema', json_schema: { name: 'plan', schema: z.toJSONSchema(Plan) } },
      messages: [
        { role: 'system', content: 'Allowed tools: ' + Object.keys(tools).join(', ') + '. Plan only remaining steps.' },
        { role: 'user', content: 'Goal: ' + goal + '\\nDone: ' + JSON.stringify(done) + '\\n' + feedback },
      ],
    });
    tokens += r.usage?.total_tokens ?? 0;
    if (tokens > maxTokens) break; // budget guard

    const parsed = Plan.safeParse(JSON.parse(r.choices[0].message.content ?? '{}'));
    if (!parsed.success) { feedback = 'Previous plan invalid: ' + parsed.error.message; continue; }
    const unknown = parsed.data.steps.filter((s) => !(s.tool in tools)).map((s) => s.tool);
    if (unknown.length) { feedback = 'Unknown tools: ' + unknown.join(', '); continue; } // never execute

    try {
      for (const s of parsed.data.steps) done.push({ tool: s.tool, result: await tools[s.tool](s.args) });
      return { status: 'complete' as const, done, tokens };
    } catch (e) {
      feedback = 'Step failed: ' + String(e); // re-plan with the error, keep completed work
    }
  }
  return { status: 'partial' as const, done, tokens, reason: 'replan or token budget exhausted' };
}`,
      },
      explanation:
        'The fixed loop never executes an unvalidated plan: shape is enforced by JSON schema + zod, and tools by an allowlist (so "delete_account" cannot run even if hallucinated). Re-planning is bounded by attempts and tokens, feeds the specific error back to the planner, and keeps completed steps so work is not redone. Exhaustion returns a typed partial result instead of looping.',
      followUps: [
        {
          q: 'Steps already executed had side effects (an email was sent) before a later step failed. How do you avoid sending it twice after re-planning?',
          a: 'Pass completed steps to the re-planner and tell it to plan only remaining work, and make side-effecting tools idempotent with an idempotency key derived from (run id, step id) so a duplicate call is a no-op.',
        },
        {
          q: 'Would you put a human approval step anywhere here?',
          a: 'Yes for irreversible or high-risk tools: validate the plan, show it to the user, and only execute after approval; read-only steps can run automatically. Plan-and-execute makes this easy because the whole plan exists before execution.',
        },
      ],
    },
    {
      id: 'planning-decomposition-cc-2',
      title: 'Fix a slow, buggy ReWOO worker',
      context:
        'A ReWOO worker executes 12 evidence steps strictly one after another (~18 s per request) although most are independent. Users also report wrong answers whenever a plan has 10+ steps: #E1\'s value appears inside #E10\'s query.',
      task: 'Execute steps as a DAG with bounded parallelism, derive dependencies from #E references, and fix the substitution bug.',
      starter: {
        language: 'typescript',
        code: `type Step = { id: string; tool: string; input: string }; // input may contain #E1, #E2...

export async function work(steps: Step[], tools: Record<string, (q: string) => Promise<string>>) {
  const ev: Record<string, string> = {};
  for (const s of steps) {
    let q = s.input;
    for (const [k, v] of Object.entries(ev)) q = q.replaceAll('#' + k, v); // bug for #E1 vs #E10
    ev[s.id] = await tools[s.tool](q); // strictly sequential
  }
  return ev;
}`,
      },
      hints: [
        'Dependencies are exactly the #E ids referenced in the input: extract them with a regex.',
        'Use a word-boundary regex /#(E\\d+)\\b/g with a replacer function so #E1 never matches the prefix of #E10.',
        'Loop: pick steps whose deps are all resolved, run up to N with Promise.all, repeat; throw if nothing is ready.',
      ],
      solution: {
        language: 'typescript',
        code: `type Step = { id: string; tool: string; input: string };
type Tools = Record<string, (q: string) => Promise<string>>;

const REF = /#(E\\d+)\\b/g; // \\b stops #E1 matching inside #E10
const depsOf = (s: Step) => [...s.input.matchAll(REF)].map((m) => m[1]);

export async function work(steps: Step[], tools: Tools, maxParallel = 4) {
  const ev: Record<string, string> = {};
  const pending = new Map(steps.map((s) => [s.id, s]));
  while (pending.size) {
    const ready = [...pending.values()].filter((s) => depsOf(s).every((d) => d in ev));
    if (!ready.length) throw new Error('unresolvable refs in: ' + [...pending.keys()].join(','));
    const batch = ready.slice(0, maxParallel);
    const outs = await Promise.all(
      batch.map((s) => {
        const q = s.input.replace(REF, (m, id) => ev[id] ?? m); // single pass, exact ids
        return tools[s.tool](q);
      }),
    );
    batch.forEach((s, i) => { ev[s.id] = outs[i]; pending.delete(s.id); });
  }
  return ev;
}`,
      },
      explanation:
        'Dependencies are derived from the references themselves, so the executor never needs the planner to list them (and cannot disagree with them). Ready steps run in parallel batches, so latency follows the critical path: a 12-step plan with depth 3 drops from ~18 s to ~4.5 s at 1.5 s per tool. A single regex pass with a word boundary fixes the prefix-collision bug and also prevents a substituted value that itself contains "#E2" from being re-substituted.',
      followUps: [
        {
          q: 'A tool result contains the literal text "#E3" (e.g. a scraped web page). Is your substitution still safe?',
          a: 'Yes, because substitution happens in a single replace pass over the planner-written input only; inserted values are never scanned again. Iterative replace loops would be vulnerable to this kind of injection.',
        },
        {
          q: 'How would you make the solver robust when one evidence step fails?',
          a: 'Record failures as explicit evidence ("#E4: ERROR timeout") instead of throwing, let independent branches finish, and instruct the solver to answer with caveats or trigger a re-plan if a required piece is missing.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'planning-decomposition-iq-01',
      difficulty: 'hard',
      question:
        'Your travel-booking agent planned "search flights → pick flight → book hotel near arrival airport → email itinerary". Flight search failed, yet it still booked a hotel. Diagnose and redesign.',
      context: 'The agent uses plan-and-execute with a fixed plan; the executor just runs steps in order.',
      whatInterviewerLooksFor: [
        'Identifies missing dependency edges and missing re-plan triggers',
        'Distinguishes reversible and irreversible actions',
        'Proposes validation, preconditions and human approval',
        'Bounds re-planning and handles partial completion',
      ],
      modelAnswer: `**Diagnosis.** Two missing mechanisms:
1. **No dependencies**: "book hotel" implicitly needs the arrival airport from "pick flight", but the plan is a flat list, so the executor ran it regardless.
2. **No re-plan trigger**: a failed step was logged and ignored instead of stopping downstream work.

**Redesign.**
- **Plan as a DAG**: each step declares \`deps\` and the executor only runs a step when all deps succeeded. A failed node marks its descendants as *blocked*, not runnable.
- **Preconditions/postconditions**: each tool declares what it needs (\`arrivalAirport\` non-empty) and returns typed output validated with zod; an empty search result is a failure, not success.
- **Re-plan triggers**: tool error after retries (with backoff), empty or contradictory results, violated preconditions. The re-planner receives the goal, completed steps and the error, and rewrites only remaining steps (e.g. widen dates, try another airport).
- **Side-effect gating**: classify tools as read-only vs irreversible. Booking and payment run only after the whole read-only part of the plan succeeded and a human approved the final itinerary. Use idempotency keys per (run, step).
- **Bounds**: at most 2–3 re-plans and a $/time budget; on exhaustion return "couldn't find flights; here are the options I tried" rather than partially booking.

**Verification.** Add regression cases to the eval set: failed search, empty search, price change between search and booking. Assert that no booking tool is called in those traces.`,
      followUps: [
        {
          q: 'The hotel was already booked when the failure was detected. What now?',
          a: 'Run a compensating action (cancel booking) following the saga pattern, record it in the trace, and inform the user. Design tools in pairs (book/cancel) so compensation is always possible.',
        },
        {
          q: 'How do you stop the re-planner from proposing the same failing plan again?',
          a: 'Include the failed attempts and their errors in the re-plan prompt, hash plans to detect repeats, and reject a re-plan that is identical to a previous failed one before executing it.',
        },
      ],
      pitfalls: [
        'Only adding a retry, which does not help when the plan itself is wrong',
        'Letting irreversible actions run before the read-only part of the plan is verified',
        'Unbounded re-planning loops',
      ],
    },
    {
      id: 'planning-decomposition-iq-02',
      difficulty: 'expert',
      question:
        'A user asks "Compare Q3 revenue, headcount and guidance for our 5 main competitors". The current ReAct agent takes 70 s. How do you get it under 20 s without losing accuracy?',
      whatInterviewerLooksFor: [
        'Recognises the task as embarrassingly parallel',
        'Proposes a DAG planner (LLMCompiler-style) with bounded concurrency',
        'Reasons about the critical path and rate limits',
        'Keeps accuracy via validation and a synthesis step',
      ],
      modelAnswer: `**Why ReAct is slow:** it runs ~15 tool calls (5 companies × 3 facts) sequentially, with a full LLM reasoning turn before each, and every turn re-reads the growing transcript. Latency ≈ 15 × (LLM turn ~2.5 s + tool ~1.5 s) ≈ 60–70 s.

**Redesign as a DAG:**
1. **Planner** (one strong-model call, ~2–3 s) emits steps: 15 independent fetch steps (or 5 per-company steps that fetch all three facts), one \`compare\` step depending on all of them, one \`write\` step. Better still, stream the plan so execution starts as soon as the first steps are emitted, as LLMCompiler does.
2. **Executor** dispatches all ready steps with a concurrency limit (e.g. 8) to respect API rate limits. Extraction from fetched documents uses a small, fast model with a zod schema \`{company, metric, value, period, source}\`.
3. **Joiner/synthesiser** builds the table and writes the answer.

**Critical path:** plan 3 s + fetch 1.5 s + extract 2 s + compare/write 5 s ≈ 12 s, so ~5x faster. LLMCompiler reports up to 3.7x speedup and 6.7x cost savings versus ReAct on parallelisable tasks.

**Keeping accuracy:**
- Validate every extracted value (period must be Q3 of the right year, a source URL required).
- The joiner re-plans just the failed cells instead of the whole task.
- Cache per-company fetches for the day; other users ask similar questions.
- Track an eval set of comparison questions so you can verify that correctness did not drop when moving off ReAct.`,
      followUps: [
        {
          q: 'What if one competitor is private and has no public revenue?',
          a: 'The fetch returns an explicit "not available" with a reason; the validator accepts this as a terminal result instead of re-planning forever, and the final table shows "n/a (private)".',
        },
        {
          q: 'Why not just use the provider\'s native parallel tool calling inside ReAct?',
          a: 'That helps within a single turn, but the model still re-reasons between turns and can only parallelise what it emits at once. A DAG planner exposes multi-level dependencies explicitly and lets cheaper models handle each node.',
        },
      ],
      pitfalls: [
        'Unbounded fan-out that triggers 429 rate-limit errors',
        'Ignoring the synthesis step on the critical path',
        'Claiming the speedup without measuring accuracy on an eval set',
      ],
    },
    {
      id: 'planning-decomposition-iq-03',
      difficulty: 'hard',
      question: 'How do you choose between ReAct, plan-and-execute and ReWOO for a new agent feature?',
      whatInterviewerLooksFor: [
        'Frames the decision around observation dependence, cost and latency',
        'Knows the token profile of each pattern',
        'Mentions hybrids and routing',
        'Backs the decision with evals',
      ],
      modelAnswer: `I decide with three questions:

**1. How much does each step depend on what the previous step returned?**
- High (debugging, exploratory browsing, interactive troubleshooting): **ReAct**. The plan cannot be known in advance, so adaptivity is worth the cost.
- Low or predictable (multi-hop lookups, report generation, data gathering): a planning approach.

**2. What matters most: cost, latency or robustness?**
- **ReWOO**: one planner call + one solver call, workers are plain tool calls. Cheapest (the paper reports ~5x fewer tokens than ReAct on HotpotQA) and robust to a single tool failure being visible to the solver, but blind: no mid-course correction.
- **Plan-and-execute with re-planner**: slightly more calls, but recovers from surprises. A good default for business workflows.
- **LLMCompiler/DAG**: best latency when there is parallelism.

**3. How risky are the actions?** Planning patterns produce an inspectable plan to validate and approve before side effects. ReAct decides actions one at a time, so each risky call needs its own approval gate.

**Hybrids are common:** plan at the top level, run ReAct inside a step that needs exploration, and route trivial requests (1–2 steps) to a single tool call.

**Validate the choice:** build a golden set of 50–100 tasks and compare success rate, tokens, p95 latency and number of tool calls per pattern. Pick the cheapest pattern within the accuracy target.`,
      followUps: [
        {
          q: 'Token cost of ReAct grows how with step count, and why?',
          a: 'Roughly quadratically: each step resends the whole transcript (all previous thoughts and observations), so total input tokens is about n times the average context length. Prompt caching softens the cost but not the latency.',
        },
        {
          q: 'Where does ReWOO typically fail?',
          a: 'When an early observation invalidates the plan (empty search, ambiguous entity). Because the plan is fixed, later steps run on bad inputs and the solver must cope with garbage evidence.',
        },
      ],
      pitfalls: [
        'Treating one pattern as universally best',
        'Ignoring action risk and approval needs',
        'Choosing without measuring on representative tasks',
      ],
    },
    {
      id: 'planning-decomposition-iq-04',
      difficulty: 'expert',
      question:
        'You must migrate 300 TypeScript files from an old logging library to a new one using LLM agents. Design the task decomposition.',
      whatInterviewerLooksFor: [
        'Uses deterministic code for discovery, LLM for transformation',
        'Chooses sensible granularity (file or module level) with verification per unit',
        'Handles dependencies and ordering (shared utils first)',
        'Budgets, parallelism and rollback',
      ],
      modelAnswer: `**Level 0 — discovery (no LLM):** grep/AST scan finds the 300 files and the import graph. Deterministic tools beat LLM planning here: cheaper and complete.

**Level 1 — plan (orchestrator):** group files into work units by module, ordered by the import graph so shared wrappers (\`logger.ts\`, helpers) migrate first. The orchestrator writes a short *migration spec* once: API mapping (\`log.warn(msg, meta)\` → \`logger.warn(meta, msg)\`), conventions and examples. Every worker gets this spec as a cached shared prefix.

**Level 2 — workers:** one worker per file (or small group of tightly coupled files, ≤ ~1,500 lines). Each worker:
- receives the spec + file + type signatures of its dependencies;
- returns a patch;
- is verified by **code**: type-check, lint, the file's unit tests. Failing units retry up to 2 times with the compiler error, then escalate to a human queue.

**Parallelism and budget:** run 8–16 workers concurrently within rate limits; budget ~20K tokens per file, ~6M total; stop scheduling if the failure rate exceeds 15% (signals a spec problem; fix the spec, not 300 files).

**Integration:** after all units pass, run the full test suite; open one PR per module so review and rollback stay small.

**Why this granularity:** per-file units fit easily in context, have a cheap objective check (compiler/tests), and fail locally. Module-wide units would be too big to verify; per-function units would lose file context and multiply overhead.`,
      followUps: [
        {
          q: 'Workers keep making the same mistake in 40 files. What do you change?',
          a: 'Treat it as a spec bug: add the failing pattern and its correct transformation to the shared migration spec (few-shot), then re-run only the failed units. Do not hand-fix 40 outputs.',
        },
        {
          q: 'How do you keep the 300 workers consistent in style?',
          a: 'One shared spec with examples, a formatter (prettier/eslint --fix) applied after each patch, and a final consistency review step on a sample of diffs per module.',
        },
      ],
      pitfalls: [
        'Asking one LLM call to plan or edit the whole codebase',
        'No objective per-unit verification',
        'Ignoring dependency order between shared and dependent modules',
      ],
    },
    {
      id: 'planning-decomposition-iq-05',
      difficulty: 'hard',
      question: 'How would you evaluate the planner of a plan-and-execute agent separately from its executor?',
      whatInterviewerLooksFor: [
        'Defines plan-level metrics separate from final-answer metrics',
        'Uses golden plans or constraints rather than exact match',
        'Uses deterministic checks plus LLM-as-judge for plan quality',
        'Ties plan metrics to cost and success',
      ],
      modelAnswer: `End-to-end success mixes planner and executor errors, so I isolate the planner with a **plan eval set**: 100–200 goals, each with the expected properties of a good plan rather than one exact plan (many plans are valid).

**Deterministic metrics (cheap, every commit):**
- **Validity rate**: parses with the schema, tools exist, deps resolve, no cycles.
- **Required-step coverage**: must-have tools/steps present (e.g. a "verify payment" step before "ship").
- **Forbidden actions**: no irreversible tool before approval.
- **Efficiency**: step count versus golden reference (flag plans > 1.5x longer), and parallelism (critical-path length).

**Judged metrics (LLM-as-judge with a rubric, calibrated against ~50 human labels):** logical order, minimality, appropriate granularity.

**Counterfactual execution:** run the plan with *mocked tools* returning recorded outputs, so you measure "would this plan succeed if every tool behaved as expected?" independent of live tool flakiness.

**Re-planning eval:** inject failures (empty search, timeout) in mocked tools and check the re-planner recovers within the re-plan budget and keeps completed steps.

Track all of these per prompt/model version in CI; a planner change ships only if validity ≥ 99%, coverage does not regress, and average steps do not grow.`,
      followUps: [
        {
          q: 'Why not compare plans to a single golden plan by exact match?',
          a: 'Many plans are equally valid (different order of independent steps, different but equivalent tools). Exact match would punish correct plans; property-based checks and DAG-aware comparisons are more faithful.',
        },
        {
          q: 'What is a cheap online signal of planner quality in production?',
          a: 'Re-plan rate and plan-validation failure rate per request type. A rising re-plan rate means plans increasingly do not match reality, even before user complaints appear.',
        },
      ],
      pitfalls: [
        'Only measuring final answers, so planner regressions are hidden by robust executors',
        'Exact-match plan scoring',
        'Running live tools in plan evals, which adds flakiness',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'planning-decomposition-est-1',
      question:
        'A research agent typically needs 6 tool calls. Estimate token cost per task for ReAct vs ReWOO, and the daily difference at 100K tasks/day.',
      assumptions: [
        'System prompt + tool definitions: 2,000 tokens',
        'Each ReAct thought + action: 150 output tokens; each observation: 800 tokens',
        'ReWOO plan: 6 steps × 60 tokens = 360 output tokens; solver prompt overhead 1,000 tokens; final answer 200 tokens',
        'Illustrative price: $3 per 1M input tokens, $15 per 1M output tokens; no prompt caching',
      ],
      steps: [
        { label: 'ReAct calls', calc: '6 tool steps + 1 final answer = 7 LLM calls' },
        { label: 'ReAct input tokens', calc: 'call k input = 2,000 + (k−1)×(150+800); sum k=1..7 = 7×2,000 + 950×(0+1+…+6) = 14,000 + 950×21 = 33,950' },
        { label: 'ReAct output tokens', calc: '7 × 150 = 1,050' },
        { label: 'ReAct cost', calc: '33,950×$3/1M + 1,050×$15/1M = $0.102 + $0.016 ≈ $0.118' },
        { label: 'ReWOO input tokens', calc: 'planner 2,000 + solver (1,000 + 360 plan + 6×800 evidence = 6,160) = 8,160' },
        { label: 'ReWOO output tokens', calc: '360 plan + 200 answer = 560' },
        { label: 'ReWOO cost', calc: '8,160×$3/1M + 560×$15/1M = $0.024 + $0.008 ≈ $0.033' },
        { label: 'Daily at 100K tasks', calc: 'ReAct $11,800 vs ReWOO $3,300 → ~$8,500/day saved (~3.6x)' },
      ],
      answer: 'About $0.12 per task for ReAct vs $0.03 for ReWOO; at 100K tasks/day that is ~$11.8K vs ~$3.3K, saving ~$8.5K/day.',
      insight:
        'ReAct cost grows with the square of step count because every turn re-sends the transcript; ReWOO reads each observation once. The gap widens for longer tasks, so planning patterns pay off most on 5+ step tasks, as long as the plan rarely needs correction.',
      followUps: [
        {
          q: 'How does prompt caching change this comparison?',
          a: 'Caching the growing ReAct prefix (cache reads ~10% of base price) cuts ReAct input cost by roughly 70–80%, shrinking the gap to well under 2x, but ReAct still makes 7 sequential calls, so its latency stays much higher.',
        },
      ],
    },
    {
      id: 'planning-decomposition-est-2',
      question:
        'A brief-writing task fetches data on 4 companies, summarises each, compares them and writes a brief. Estimate wall-clock latency for sequential ReAct, sequential plan-and-execute and a parallel DAG.',
      assumptions: [
        'Planner call: 2 s; search tool: 1.5 s; per-company summary LLM call: 3 s; compare: 4 s; write: 5 s',
        'ReAct adds a 1.2 s reasoning turn before each of its 10 actions',
        'DAG concurrency limit 4 (enough for all companies at once)',
      ],
      steps: [
        { label: 'Work items', calc: '4 searches + 4 summaries + compare + write = 10 actions' },
        { label: 'Sequential action time', calc: '4×1.5 + 4×3 + 4 + 5 = 6 + 12 + 9 = 27 s' },
        { label: 'ReAct', calc: '27 s + 10 reasoning turns × 1.2 s = 39 s' },
        { label: 'Plan-and-execute (sequential)', calc: '2 s plan + 27 s = 29 s' },
        { label: 'DAG critical path', calc: '2 plan + 1.5 search + 3 summary + 4 compare + 5 write = 15.5 s' },
        { label: 'Speedup', calc: '39 / 15.5 ≈ 2.5x vs ReAct; 29 / 15.5 ≈ 1.9x vs sequential plan' },
      ],
      answer: 'About 39 s for ReAct, 29 s for sequential plan-and-execute and ~15.5 s for the DAG executor.',
      insight:
        'After parallelising, the critical path is dominated by the sequential synthesis steps (compare + write = 9 s of 15.5 s). Further gains come from streaming the final write, running compare on a faster model, or streaming the plan so fetches start before planning finishes.',
      followUps: [
        {
          q: 'At 50 concurrent users, how many in-flight LLM/tool calls must your rate limits handle at peak?',
          a: 'During the fan-out phase each user has up to 4 parallel calls, so up to 50 × 4 = 200 in flight; you need provider concurrency/RPM headroom for that or a global semaphore that queues excess work.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'planning-decomposition-mcq-01',
      difficulty: 'medium',
      question:
        'An agent generates a weekly sales report: pull CRM data, pull ad spend, compute ROI per channel, write summary. Steps rarely change. Which design fits best?',
      options: [
        'ReAct, so the model can reconsider after each observation',
        'Plan-and-execute (or a fixed chain) with schema-validated steps and a re-planner for failures',
        'A single LLM call with all raw data pasted into the prompt',
        'A swarm of peer agents that negotiate who does each step',
      ],
      correct: [1],
      explanation:
        'The structure is predictable, so planning up front (or even hard-coding the chain) is cheaper, faster and auditable, with a re-planner for the rare surprise. ReAct pays a reasoning turn per step for adaptivity this task does not need; one giant call risks context overflow and arithmetic errors; a swarm adds coordination overhead with no benefit.',
      followUps: [
        {
          q: 'When would you drop the LLM planner entirely here?',
          a: 'When the steps never change: encode the chain in code (prompt chaining) and use the LLM only for the summary. A planner adds value only when the step list varies by request.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-02',
      difficulty: 'hard',
      question: 'This ReWOO worker gives wrong answers on long plans. What is the bug?',
      code: {
        language: 'typescript',
        code: `let q = step.input; // e.g. "Compare #E1 with #E10"
for (const [id, val] of Object.entries(evidence)) {
  q = q.split('#' + id).join(val); // id = 'E1', 'E2', ... 'E10'
}`,
      },
      options: [
        'split/join only replaces the first occurrence of each placeholder',
        '"#E1" also matches the prefix of "#E10", so #E10 becomes "<value of E1>0" before E10 is processed',
        'Object.entries returns evidence in random order, so substitution is non-deterministic',
        'Strings are immutable in JavaScript, so q never changes',
      ],
      correct: [1],
      explanation:
        'Plain string replacement without a word boundary turns "#E10" into E1\'s value followed by "0". split/join replaces every occurrence, so "first occurrence only" is wrong; Object.entries follows insertion order for string keys; reassigning q works fine despite string immutability. Fix: one regex pass /#(E\\d+)\\b/g with a lookup function.',
      followUps: [
        {
          q: 'Why is a single-pass replace also a security improvement?',
          a: 'Values inserted in one pass are not scanned again, so a tool result containing "#E3" (e.g. a malicious web page) cannot pull other evidence into the query.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-03',
      difficulty: 'hard',
      question:
        'Which events are good triggers for calling the re-planner in a plan-and-execute agent? (Select ALL that apply)',
      options: [
        'A tool still fails after its retry/backoff policy is exhausted',
        'Every step completes successfully, so the plan should be re-checked',
        'An observation contradicts an assumption the remaining plan depends on (e.g. product discontinued)',
        'Cumulative spend crosses 80% of the task budget with significant work left',
      ],
      correct: [0, 2, 3],
      explanation:
        'Re-planning should be event-driven: unrecoverable tool errors, invalidated assumptions and budget pressure all mean the remaining plan is no longer appropriate. Re-planning after every successful step turns plan-and-execute back into ReAct-level cost without a reason; successful steps should just continue the plan.',
      followUps: [
        {
          q: 'What should the re-planner receive as input?',
          a: 'The original goal, completed steps with their results, the trigger reason (error/contradiction/budget), the remaining budget and previously failed plans, and it should output only the remaining steps.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-04',
      difficulty: 'hard',
      question:
        'Where does most of LLMCompiler\'s latency improvement over ReAct come from on parallelisable tasks?',
      options: [
        'It uses a smaller, faster model for every reasoning step',
        'It caches tool results across users',
        'Its planner emits a dependency graph, and a task-fetching unit dispatches every call whose inputs are ready concurrently',
        'It compresses observations before sending them back to the model',
      ],
      correct: [2],
      explanation:
        'LLMCompiler (ICML 2024) has a planner that streams a DAG of tasks, a task-fetching unit and an executor that runs independent function calls in parallel, giving up to 3.7x lower latency vs ReAct. Model size, cross-user caching and observation compression are orthogonal optimisations that the paper does not rely on.',
      followUps: [
        {
          q: 'Why does streaming the plan help further?',
          a: 'Tasks can be dispatched as soon as the planner emits them and their deps are ready, overlapping planning with execution instead of waiting for the full plan.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-05',
      difficulty: 'expert',
      question: 'What happens when this DAG runner receives a plan where step b depends on c and c depends on b?',
      code: {
        language: 'typescript',
        code: `while (pending.size) {
  const ready = [...pending.values()].filter((t) => t.deps.every((d) => d in results));
  await Promise.all(ready.map(async (t) => {
    results[t.id] = await t.run();
    pending.delete(t.id);
  }));
}`,
      },
      options: [
        'It throws a "cycle detected" error from Promise.all',
        'It runs b and c in parallel because Promise.all ignores dependencies',
        'After running the other steps, ready becomes empty forever and the loop spins without awaiting anything (100% CPU hang)',
        'It runs b first because it appears earlier in the plan',
      ],
      correct: [2],
      explanation:
        'Neither b nor c is ever ready, so ready is [], Promise.all([]) resolves immediately and the loop repeats forever: a busy hang that burns CPU but makes no progress. Nothing throws, and dependencies are respected (so b and c never run). Fix: if ready is empty while pending is non-empty, throw or re-plan, and validate acyclicity before execution.',
      followUps: [
        {
          q: 'Where should cycle detection live: the validator or the executor?',
          a: 'Both. The validator rejects cyclic plans before any side effects happen (cheap Kahn/DFS check), and the executor keeps a no-progress guard as defence in depth against plans mutated by re-planning.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-06',
      difficulty: 'hard',
      question:
        'A Plan zod schema is z.object({ steps: z.array(z.object({ id: z.string(), tool: z.string(), deps: z.array(z.string()) })) }). Which problems will Plan.parse NOT catch on its own? (Select ALL that apply)',
      options: [
        'A step with deps: "s1" (a string instead of an array)',
        'A step depending on an id that no step has',
        'Two steps that depend on each other',
        'A step whose tool name is not in your tool registry',
      ],
      correct: [1, 2, 3],
      explanation:
        'Zod validates the shape: a string where an array is expected fails parse. Cross-field and graph properties (existing references, acyclicity, membership in a registry) are invisible to this plain schema. Add them via superRefine, z.enum over tool names, or a separate graph validator.',
      followUps: [
        {
          q: 'How can you make the tool-name check part of the schema itself?',
          a: 'Use z.enum([...toolNames]) for the tool field, built from the registry at startup. It also flows into the JSON schema sent to the model, so constrained decoding can prevent unknown tools entirely.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-07',
      difficulty: 'medium',
      question: 'What distinguishes least-to-most prompting from simply asking the model to "think step by step"?',
      options: [
        'Least-to-most uses a larger model for each sub-question',
        'It explicitly decomposes the problem into ordered sub-questions first, then solves them sequentially, feeding each answer into the next',
        'It samples many reasoning paths and takes the majority vote',
        'It removes the need for few-shot examples entirely',
      ],
      correct: [1],
      explanation:
        'Least-to-most (Zhou et al. 2023) has a decomposition stage and a sequential solving stage where earlier answers become context for later sub-questions, which helped it generalise to harder problems than its examples. Majority voting is self-consistency; it still typically uses few-shot examples for both stages; model size is unrelated.',
      followUps: [
        {
          q: 'What is a failure mode of least-to-most in production?',
          a: 'An early wrong sub-answer propagates to every later step. Mitigate by verifying intermediate answers (tool checks, schema, or a judge) before feeding them forward.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-08',
      difficulty: 'expert',
      question:
        'An orchestrator splits a 2-page summarisation task into 25 subtasks of one paragraph each. Quality drops and cost triples. What is the most likely cause and fix?',
      options: [
        'The worker model is too small; switch all workers to the largest model',
        'Over-decomposition: each worker resends the shared instructions and loses cross-paragraph context; merge into a few section-level subtasks or a single call',
        'Parallelism causes race conditions in the summaries; run subtasks sequentially',
        'The orchestrator needs a higher temperature to create better subtasks',
      ],
      correct: [1],
      explanation:
        'A 2-page document fits in one call. Splitting it 25 ways repeats the instructions 25 times and destroys context that links paragraphs, so the synthesis is incoherent. Bigger worker models increase cost without fixing missing context; there is no shared state for races; temperature does not address granularity.',
      followUps: [
        {
          q: 'Give a rule of thumb for when to decompose at all.',
          a: 'Decompose when the task exceeds one call\'s effective context, needs different tools/models per part, or has independent parts worth parallelising; otherwise one well-prompted call usually wins.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-09',
      difficulty: 'hard',
      question: 'This loop is meant to cap re-planning. Why did a production run still cost $40?',
      code: {
        language: 'typescript',
        code: `let steps = 0;
let plan = await makePlan(goal);
while (steps < 20) {
  const step = plan.shift();
  if (!step) break;
  try { await execute(step); steps++; }
  catch (e) { plan = await makePlan(goal, String(e)); } // re-plan
}`,
      },
      options: [
        'plan.shift() mutates the plan, so steps are skipped',
        'steps only increments on success, so a step that always fails triggers unlimited re-plans',
        'makePlan is awaited, so the loop is blocked on network calls',
        'The break statement exits before the last step executes',
      ],
      correct: [1],
      explanation:
        'Failures never advance the counter, so a permanently failing step causes an endless failure → re-plan loop, each re-plan a full planner call. shift() consuming the plan is intended; awaiting is required; break only fires on an empty plan. Fix: count re-plans separately (max 2–3) and track total tokens/$ against a budget.',
      followUps: [
        {
          q: 'Besides a re-plan counter, what else makes the budget robust?',
          a: 'A token/$ meter fed from response usage, a wall-clock deadline, and detection of repeated identical plans or errors so the agent stops early with a partial result.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-10',
      difficulty: 'hard',
      question:
        'Which properties make a subtask well-specified for a worker agent? (Select ALL that apply)',
      options: [
        'Explicit inputs: which earlier outputs it may use',
        'A checkable output contract, such as a schema, tests or required citations',
        'Access to the full transcript of every other worker so it has maximum context',
        'Its own budget for tokens, tool calls or time',
      ],
      correct: [0, 1, 3],
      explanation:
        'Clear inputs, a verifiable output and a budget let workers run independently and fail locally. Dumping every other worker\'s transcript into each worker defeats decomposition: it inflates tokens, adds noise and couples workers; pass only the outputs of declared dependencies plus a shared brief.',
      followUps: [
        {
          q: 'What goes in the "shared brief" every worker receives?',
          a: 'The overall goal, constraints (format, tone, scope), key definitions or glossary, and conventions, kept short and placed first so it can be prompt-cached across workers.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-11',
      difficulty: 'expert',
      question:
        'A hierarchical planner (goal → subgoals → steps) is producing poor results on long tasks. Which mitigations address real failure modes of hierarchical decomposition? (Select ALL that apply)',
      options: [
        'Cap depth at 2–3 levels and stop recursing once a node maps to a single tool call',
        'Run a coverage check that compares original requirements against leaf outputs before synthesis',
        'Let every level re-plan its children independently with no global budget',
        'Pass each subgoal the parent goal and constraints so leaves do not drift off-topic',
      ],
      correct: [0, 1, 3],
      explanation:
        'Deep trees multiply overhead and drift; depth caps and atomicity checks bound them. Coverage checks catch requirements dropped during splitting, and propagating parent constraints keeps leaves aligned. Independent re-planning at every level without a global budget is the classic way hierarchical agents explode in cost.',
      followUps: [
        {
          q: 'How would you allocate a global budget down the tree?',
          a: 'Give each child a share proportional to its estimated size, keep a reserve (e.g. 20%) for re-plans and synthesis, and let unused budget flow back to the parent when a child finishes early.',
        },
      ],
    },
    {
      id: 'planning-decomposition-mcq-12',
      difficulty: 'medium',
      question:
        'In the orchestrator-workers pattern described in Anthropic\'s "Building effective agents", how does it differ from parallelisation (sectioning)?',
      options: [
        'Orchestrator-workers always runs workers sequentially',
        'In orchestrator-workers the subtasks are decided by an LLM at runtime from the input; in sectioning they are predefined in code',
        'Sectioning requires a vector database while orchestrator-workers does not',
        'Orchestrator-workers cannot synthesise results; only sectioning can',
      ],
      correct: [1],
      explanation:
        'Both may run workers in parallel and both can combine results. The key difference is flexibility: sectioning splits work along lines fixed by the developer, while the orchestrator inspects the input and decides which subtasks exist (e.g. which files to change). Vector databases are unrelated.',
      followUps: [
        {
          q: 'Give an example where the subtasks cannot be predefined.',
          a: 'A coding change request: the number and identity of files to edit depends on the request and codebase, so an orchestrator must inspect them and decide the subtasks dynamically.',
        },
      ],
    },
  ],
};

export default topic;
