import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['inference-load-testing.md', 'agent-benchmarks.md'],
  blocks: [
    {
      title: 'Load-test metrics',
      markdown: `- **TTFT** = queue + network + prefill, before the first token streams.
- **TPOT** (inter-token latency) = decode time / tokens produced. Tools differ on whether TTFT is included: state the tool and the definition.
- **E2E** ≈ TTFT + TPOT × output tokens; long answers are decode-dominated.
- **Throughput** = output tokens / second: fleet efficiency only.
- **Goodput** = share of requests that meet TTFT **and** TPOT **and** E2E targets. Gate deploys on goodput and p95/p99, not the mean.`,
    },
    {
      title: 'Four load shapes',
      markdown: `| Shape | Traffic | Catches |
|---|---|---|
| Steady | constant RPS | baseline regressions |
| Ramp | 0 → target RPS | capacity breakpoint, warm-up issues |
| Spike | sudden multiple of normal, then back | autoscaling lag, queue saturation, cold starts |
| Soak | steady for hours | memory leaks, connection-pool drift |`,
    },
    {
      title: 'Why a load test lies',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Held in test, fell over in prod | identical prompts hit the prefix cache | sample prompt lengths and content from real traffic |
| Client reports high latency, server is fine | the load generator is the bottleneck | use a streaming-aware, compiled harness |
| Mean latency fine, users complain | right-skewed tail | report p50, p90, p99 |
| All clients retry together | synchronized backoff | add jitter and a shared retry budget |
| Hedged requests look free | cancel does not stop server work | count server work, not just latency |`,
    },
    {
      title: 'Before you trust a benchmark claim',
      markdown: `- **Split**: which variant (e.g. SWE-bench Verified vs a harder, newer set)? Numbers on different splits are not comparable.
- **Contamination**: was the set published before the model's training cutoff? Compare seen vs held-out accuracy; quote held-out.
- **Gate**: SWE-bench "resolved" = every fail-to-pass test now passes **and** no pass-to-pass test broke.
- **Baselines**: a single-LLM and a random baseline, not an untuned copy of the same system.
- **Repeats**: n runs with a confidence interval; one run misleads.
- **Cost**: tokens and wall-clock per task, as percentiles.
- **Same config**: identical dataset, model settings and call budget for every row.`,
    },
  ],
};

export default sheet;
