import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['agent-state-graphs.md', 'delegation-feedback.md'],
  blocks: [
    {
      title: 'Pause, approve, resume',
      markdown: `1. **Pause** on the edge into the side-effecting node, with a checkpointer and a stable thread id.
2. **Respond** to the caller: "awaiting approval", with the exact pending action.
3. **Reviewer** reads the saved state (pending tool calls, args).
4. **Approve**: resume on the same thread id.
5. **Edit**: resume with corrected args.
6. **Deny**: write a rejection message into state, then resume so the agent can adapt.`,
    },
    {
      title: 'Durable execution facts',
      markdown: `| Fact | Consequence |
|---|---|
| Execution is at least once, not exactly once | Every side effect needs an idempotency key or a stored receipt |
| A worker holds a job by lease | An expired lease lets another worker reclaim it |
| Stale workers can finish late | Fence completions by version or lease |
| Resume replays from a checkpoint | Capture seeds, clock and API replies so replays match |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Harm before approval | Pause placed after the side effect | Interrupt before the side-effecting node |
| Cannot resume or time-travel | No checkpointer | In-memory saver in tests, durable store in prod |
| Messages lost between nodes | Field overwritten, no append reducer | Use an append reducer for message lists |
| Resume gives a different result | Non-deterministic node | Record external replies and randomness |
| Duplicate email or charge after a crash | Retry repeated the effect | Idempotency key per action |
| Correction keeps recurring | Fixed the symptom, not the owning layer | Move the fix to the earliest layer: test, context, policy or tool |`,
    },
  ],
};

export default sheet;
