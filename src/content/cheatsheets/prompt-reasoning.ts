import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['agent-reasoning-patterns.md'],
  blocks: [
    {
      title: 'Pick a technique',
      markdown: `| Technique | Calls | Use when |
|---|---|---|
| Zero-shot CoT | 1 | Quick boost on a non-reasoning model |
| Few-shot CoT | 1 | You also need a fixed reasoning and answer format |
| Self-consistency | N | Short, comparable answers (numbers, labels) and high stakes |
| Self-Refine | 2+ per round | No external checker; one model drafts and critiques |
| CRITIC | 2+ per round | An external checker exists: search, code, tests, a calculator |
| Tree of thoughts | grows as branching^depth | Search or planning problems with a reliable scorer |
| PAL | 1 + interpreter | Arithmetic or logic that code computes exactly |

On a reasoning model, skip CoT scripts and tune effort instead.`,
    },
    {
      title: 'Loop limits',
      markdown: `- Stop a refine loop when the checker passes, and cap it with a max iteration count.
- Keep tree branching small (3–5); cost multiplies at every level.
- Self-Refine keeps earlier drafts and critiques in the prompt; without them it repeats mistakes.
- Self-consistency needs varied samples; at temperature 0 on a non-reasoning model every path is the same.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Critique always says "looks good" | Same prompt marks its own work | Different critic prompt, or an external checker |
| Search returns a high-scoring wrong answer | Noisy scorer | Use search only with a scorer you trust |
| Votes split evenly | Ambiguous task or too few samples | Abstain or escalate; don't pick at random |
| Answer contradicts its reasoning | Reasoning written after the answer | Reasoning first, answer last, in separate tags |`,
    },
  ],
};

export default sheet;
