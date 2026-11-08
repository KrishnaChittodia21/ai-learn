import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['progressive-delivery.md', 'sre-for-ai.md'],
  blocks: [
    {
      title: 'Rollout sequence',
      markdown: `1. **Shadow**: the candidate gets copies of real requests; outputs go to logs, never to users. Catches cost, length, refusal and error changes, not quality.
2. **Canary**: shift a small share of traffic in steps; check the gates at every step before moving on.
3. **A/B** (optional): only when the new version is meant to change user behaviour, with one pre-registered metric.
4. **Promote** when every gate holds; **roll back** by flipping the flag back to the pinned previous snapshot.`,
    },
    {
      title: 'Canary gates',
      markdown: `| Gate | Compare to | Watch out |
|---|---|---|
| Error rate (5xx + refusals) | control | count explicit refusals, not just HTTP errors |
| p99 latency | control | tails move before the mean |
| Cost per request | control | a better model can cost several times more per call |
| p99 output length | control | runaway verbosity drives cost and latency |
| Thumbs-down / escalation rate | control | sparse at small traffic shares: pause longer per step |

Set each threshold above the run-to-run noise floor, or the canary false-alarms.`,
    },
    {
      title: 'A/B test traps',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| 50/50 split arrives as 47/53 | sample ratio mismatch: assignment is broken | fix the hashing before reading results |
| Never reaches significance | sampling noise shrinks the effective sample | plan a larger sample up front |
| "Winner" after daily peeking | repeated looks inflate false positives | fixed horizon or a sequential test |
| 1 of 20 metrics is significant | multiple comparisons | one primary metric; correct the rest |`,
    },
    {
      title: 'Incident actions an agent may take',
      markdown: `| Without approval | Needs human approval |
|---|---|
| read: get, list, describe, query metrics and logs | delete, exec, change resource limits |
| restart one pod | deploy new code |
| revert one specific deploy | change topology, IAM or databases |
| scale inside pre-approved bounds | scale outside them |

Log every command considered, run or approved, and who approved it. When two triage paths disagree on the root cause, escalate with both hypotheses visible.`,
    },
  ],
};

export default sheet;
