import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['agent-planning.md', 'delegation-feedback.md'],
  blocks: [
    {
      title: 'Pick a planner',
      markdown: `| Planner | Who decides | Use when |
|---|---|---|
| Fixed workflow | Engineers | You can list the steps; compliance-bound |
| HTN (task networks) + LLM fallback | Symbolic rules; LLM only when no method matches | Scheduling or policy-bound work needing provable plans |
| Evolutionary search | A machine-checkable score | A fast, deterministic evaluator exists |
| ReAct / ReWOO / plan-and-execute | The model | Open-ended tasks where the next step depends on the last result |

Start with direct API calls; reach for ReAct or ReWOO before HTN.`,
    },
    {
      title: 'A good work item',
      markdown: `- **Id**: stable, for dependencies and handoff.
- **Change**: the smallest behaviour change.
- **Evidence**: facts that justify it.
- **Dependencies**: what must be true first.
- **Proof**: the exact check that closes it.

Items whose dependencies are all done form a **wave** and run in parallel. Delegate only units with disjoint files and different unknowns; keep work serial when it shares files or an open decision.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Re-plans until the budget runs out | Planner never sees the error | Pass the last error into the re-plan prompt |
| Step budget hit after re-plans | Each re-plan adds steps | Shorter plans; reuse finished steps |
| Planner returns an empty plan | No recovery path for that error | Add a fallback or escalate |
| Dependency cycle | Hidden disagreement between items | Resolve the decision, then split |
| Evolution does not converge | An LLM judges "is this better?" | Use a deterministic, fast evaluator |
| Integrator rewrites most results | Wrong decomposition | Re-split by ownership and contract |

Emit a plan diff on each revision; never rewrite the plan silently.`,
    },
  ],
};

export default sheet;
