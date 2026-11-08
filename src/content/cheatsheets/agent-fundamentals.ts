import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['agent-reasoning-patterns.md', 'agent-harness.md'],
  blocks: [
    {
      title: 'Pick a loop',
      markdown: `| Pattern | Use when | Main failure |
|---|---|---|
| ReAct | Short task, unknown environment, needs to react to errors | Loop length explodes; context grows every step |
| ReWOO / plan-and-execute | Known tools, evidence can be fetched in parallel | Static plan; add a replan step after partial results |
| Reflexion | Clear pass/fail signal on a task class that repeats | Memory rot: stale reflections pile up |
| Tree of thoughts / LATS | A cheap, reliable scorer exists; correctness beats latency | Noisy scorer picks a good-looking wrong branch |

Start with the simplest: one tool call plus a summary needs no planner.`,
    },
    {
      title: 'Harness checklist',
      markdown: `- **One state function**: change loop state in one place so the legal transitions live together.
- **Budgets**: max turns, max tool calls, wall clock, tokens; on a hit, pause and let the caller extend or close.
- **Per-tool timeout**, with retries only for timeouts and transient errors, never for schema errors.
- **Idempotency key** per side-effecting call (\`step_id:tool:hash(args)\`), so a retry cannot write twice.
- **Gates in order, cheap first**: allowlist → schema → permission → human approval; a deny stops the chain.
- **Deterministic gates**: same inputs, same verdict, so no LLM judge inside a gate.
- **Trace every step** (\`gen_ai.*\` OpenTelemetry spans) so you can replay a bad run.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Agent claims success after a 400 | Error never reached the model | Return each error as an observation string |
| A web page gives the agent orders | Trust boundary collapse | Only the user's direct instructions grant permission |
| A write runs twice | Retry raced an in-flight call | Idempotency key; no retry on a non-idempotent timeout |
| Same tool, same args, again and again | No repeat detection | Detect repeats and stop or replan |
| Schema error retried forever | Deterministic failure treated as transient | Send the error back once; fix the arguments |
| Costs climb every step | Full history re-sent each turn | Truncate observations, cache the stable prefix |`,
    },
  ],
};

export default sheet;
