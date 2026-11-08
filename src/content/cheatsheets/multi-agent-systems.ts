import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['orchestration-patterns.md', 'multi-agent.md'],
  blocks: [
    {
      title: 'Topologies side by side',
      markdown: `| Topology | Who routes | Fits | Weak point |
|---|---|---|---|
| Supervisor–worker | One central LLM | 2–4 specialists; research with fresh context per worker | Supervisor is the bottleneck |
| Swarm / handoff | Agents hand off directly | Latency over reasoning clarity | Hard to reason about and debug |
| Hierarchical | Supervisors of supervisors | Real independent sub-teams | Decomposition drift; keep depth ≤ 2 |
| Debate | Parallel proposers critique each other | Accuracy matters more than cost | Cost; bound to 2–3 rounds |
| Blackboard | Agents publish to topics | Many agents on long runs | Shared state can be poisoned |`,
    },
    {
      title: 'Decision order',
      markdown: `1. **Single agent or workflow** first.
2. **Supervisor–worker** when you have 2–4 specialists.
3. **Swarm** when latency beats clarity.
4. **Hierarchical** only when the supervisor's context budget fails.
5. **Debate or voting** when accuracy beats cost; mix base models rather than copies of one.

Use sequential, not parallel, when step 2 needs step 1's output.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Precise answers to the wrong question | Lead's plan drifted from the query | Log the plan and diff it against the query |
| User never sees a conflict | Synthesis silently picks a side | Re-ask, or report the disagreement |
| Two agents hand back and forth | Handoff loop | Hop counter and max steps |
| One agent talks every turn | Selector favours one speaker | Balance speakers in the selector |
| Majority is wrong together | Same base model everywhere | Diverse models or prompts |
| A wrong fact spreads to every agent | Poisoned shared state | Append-only log with provenance; read-only verifier |
| Task runs twice after a crash | Worker died mid-run | Idempotent workers, durable queue |

MAST groups failures as specification, coordination and verification problems; specification is the largest share, so write clear task specs before adding agents.`,
    },
  ],
};

export default sheet;
