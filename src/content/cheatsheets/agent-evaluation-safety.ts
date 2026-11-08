import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['eval-driven-agents.md', 'agent-benchmarks.md', 'agent-failure-modes.md'],
  blocks: [
    {
      title: 'Three evaluation layers',
      markdown: `| Layer | Examples | Use for | Watch for |
|---|---|---|---|
| Public benchmarks | SWE-bench Verified, GAIA, τ-bench | Comparing models | Contamination, saturation |
| Custom offline | Code graders, trajectory checks, LLM judge | Your product's tasks | Judges hallucinate too |
| Online | Session replays, guardrail alerts | Production behaviour | Turn each failure into a new offline case |`,
    },
    {
      title: 'Before you trust a score',
      markdown: `- **Benchmark and split** named (e.g. Verified vs full SWE-bench).
- **Contamination**: was the benchmark released after the model's training cutoff?
- **Baseline**: a single-LLM and a simple baseline, not an untuned copy of the same system.
- **Repeats**: N trials with a confidence interval; one run misleads.
- **Cost**: tokens and wall clock per task as P50 / P95, not one number.
- **Same config**: same dataset, model settings and call budget for every compared run.
- **Paired by case**: an average can hide a serious regression on one case.`,
    },
    {
      title: 'Failure modes',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| "Done" after a 400 error | Success hallucination | Re-check the real state before accepting |
| One bad call triggers many more | Cascading error | Verification gate after each step |
| Downstream load spikes | Retry storm | Circuit breaker, capped retries per request |
| Slow accuracy decay, no crash | Memory poisoning | Append-only log with provenance |
| Retrieved page overrides the system prompt | Indirect prompt injection | Tool output is data; gate side effects |
| Evals pass, production fails | Over-fitting to the eval set | Rotate cases; add production failures |
| CI flags flaky regressions | Non-deterministic cases | Pin seeds and snapshot state |

Keep the CI gate deterministic: same artifacts, same verdict, so no LLM judge inside the gate itself.`,
    },
  ],
};

export default sheet;
