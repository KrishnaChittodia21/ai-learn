import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['product-discovery.md', 'progressive-delivery.md'],
  blocks: [
    {
      title: 'Scoring formulas',
      markdown: `- **Assumption risk** = impact × uncertainty + irreversibility (each 1–5). Test the highest open risk first.
- **Slice score** = (value + uncertainty reduced) / (effort + risk penalty). A slice that does not cover the required proof is ineligible, however cheap.
- **Evidence ladder**: direct behaviour > artifact > reported > inferred. Only the first two prove what people do today.`,
    },
    {
      title: 'Who decides: locked, bounded, delegated',
      markdown: `| Mode | The agent or team may | Use for |
|---|---|---|
| Locked | not choose; a human checkpoint decides | safety, authority, public compatibility |
| Bounded | choose inside written limits | search budgets, retry counts, cost caps |
| Delegated | own the choice and explain it | names, reversible refactors |

Locked and bounded decisions need a written reason.`,
    },
    {
      title: 'Spec and metric smells',
      markdown: `| Smell | Means | Fix |
|---|---|---|
| Outcome names a chatbot, model or vector DB | solution leaked into the frame | state the observable result |
| Non-goals empty | the slice has no boundary | list tempting adjacent work you reject |
| Only outcome metrics | nothing stops a harmful "win" | add a guardrail, e.g. production writes = 0 |
| Thresholds set after results | the metric bends to the data | write pass, fail and ambiguous before running |
| Every result says "keep building" | the slice is not an experiment | add a stop rule |`,
    },
    {
      title: 'Rollout ladder for a pilot',
      markdown: `1. **Offline replay** on recorded cases: does the mechanism work at all?
2. **Shadow**: real inputs, outputs logged not shown; catches cost, length and refusal shifts, not quality.
3. **Canary / bounded pilot**: small audience, a human owner, rollback by flag, audit trail.
4. **Production**: SLO, on-call owner, security review, monitoring, and a retirement path.

Rollback must be a config flip, never a redeploy.`,
    },
  ],
};

export default sheet;
