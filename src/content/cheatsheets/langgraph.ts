import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['agent-state-graphs.md', 'agent-frameworks-compared.md'],
  blocks: [
    {
      title: 'LangGraph or something else?',
      markdown: `| Problem shape | Pick |
|---|---|
| Two LLM calls and a tool | Plain code, no framework |
| Typed state, approvals, resume, parallel fan-out | LangGraph |
| Proposer and critic talking it out | A chat-style multi-agent framework |
| Short role-driven plan | A crew / role framework |
| Topology unknown until runtime | An agent loop, not a fixed graph |

LangGraph's worst fit is a topology you cannot draw up front.`,
    },
    {
      title: 'Pick a stream mode',
      markdown: `| Mode | Yields | Use for |
|---|---|---|
| \`updates\` | Per-node state delta | Progress in the UI |
| \`messages\` | LLM tokens with metadata | Typing effect |
| \`values\` | Full state after each step | Evals and debugging |
| \`custom\` | Whatever a node writes | Tool progress, partial results |`,
    },
    {
      title: 'Design tips',
      markdown: `- Name the nodes first: each decision or side effect is its own node.
- Keep task fields (plan, budget) in their own state keys, not inside messages.
- Prefer linear chains with a few branches over dense graphs.
- Put approvals on the edge into a side-effecting node.
- Invoking with \`null\` input and an old checkpoint config replays from there.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Half the messages vanish | List key has no reducer, last write wins | Use the messages reducer |
| No resume or time travel | Compiled without a checkpointer | Memory saver in tests, Postgres in prod |
| Approval comes after the harm | Interrupt placed after the side effect | Interrupt before that node |
| Side effect runs twice on resume | Node re-runs from its first line | Make code before \`interrupt()\` idempotent |
| Replay differs from the original | Non-deterministic node | Record clock, randomness and API replies |`,
    },
  ],
};

export default sheet;
