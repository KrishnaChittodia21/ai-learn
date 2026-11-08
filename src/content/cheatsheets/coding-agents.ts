import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['coding-agents.md', 'agent-harness.md'],
  blocks: [
    {
      title: 'JSON tool calls or CodeAct',
      markdown: `| | JSON tool calls | CodeAct (actions as code) |
|---|---|---|
| One action is | One structured call | A whole program |
| Audit | Easy, one action per turn | Harder, wide blast radius |
| Composition | Limited | Loops, chains tools, catches errors |
| Safety | Validator on every call | Needs a hardened sandbox |
| Use when | Each action needs its own check | One step must touch many files |`,
    },
    {
      title: 'Pick a shape',
      markdown: `| Shape | Use when | Gate before the PR |
|---|---|---|
| Terminal agent | CLI in, PR out, a human watching the plan | Tests pass |
| Issue-to-PR bot | A label on an issue starts it; no live loop | Full CI in the sandbox |
| Migration agent | Same change across many repos; tests are ground truth | Tests pass, coverage not down |

Run deterministic codemods first; let the agent handle what they miss. Every shape needs turn, cost and wall-clock caps, plus a sandbox or worktree per task.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Loop chokes on a huge search result | Untruncated tool output | Cap each tool result; return a summary and a pointer |
| A destructive command reaches the sandbox | No pre-tool guard | Deny rule or hook that blocks it in every mode |
| Great benchmark score, weak on your repo | Benchmark tasks are easier than your backlog | Score a sample of your own real tasks |
| Patch fails to apply | Old text missing or not unique | Edit by one unique exact string |
| Agent writes outside the repo | Path escapes the root | Resolve paths and reject anything outside |
| Safety check vanished in production | Check written as \`assert\` | Use explicit \`if\` + raise; \`python -O\` strips asserts |
| Next session redoes finished work | No handoff file | Write the handoff with \`next_action\` before stopping |`,
    },
  ],
};

export default sheet;
