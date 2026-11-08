import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['context-engineering.md'],
  blocks: [
    {
      title: 'Assemble context per query',
      markdown: `1. **Classify intent** of the query.
2. **Select tools** for that intent only, under a token cap for tool definitions.
3. **Retrieve** documents; drop those under a relevance threshold.
4. **Reorder**: best items first and last, weakest in the middle.
5. **History**: summarise the oldest turns once history passes its cap.
6. **Budget**: trim each slot to its cap and to the space left, keeping an output reserve.`,
    },
    {
      title: 'Slot by slot',
      markdown: `| Slot | Keep it lean by |
|---|---|
| System prompt | Stable, first, cacheable; no per-request data |
| Tool definitions | Only tools for this intent; every definition costs tokens on every call |
| Retrieved docs | Threshold, dedupe, rerank; curated beats dumped |
| Memory | A few scored facts, not the whole store |
| History | Rolling summary plus the last few turns verbatim |
| Output reserve | Subtract it before you fill anything else |

Rough English estimate with no tokenizer at hand: tokens ≈ words × 1.3. Enforce budgets with the real tokenizer.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Model ignores a fact in the middle | Lost in the middle | Key facts first, question last; repeat the key point at the end |
| Tools crowd out documents | Every tool sent on every call | Classify intent and prune tools |
| Quality drops as the chat grows | Context rot | Compact: summarise and restart the window |
| Answers cite the wrong source | Source ids lost in compression | Never compress ids, numbers or quotes lossily |
| Cache never hits | Variable data before the stable prefix | Move per-request data after the stable part |`,
    },
  ],
};

export default sheet;
