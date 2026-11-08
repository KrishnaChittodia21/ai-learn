import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['llm-routing-gateways.md', 'serving-engines-compared.md'],
  blocks: [
    {
      title: 'Routing patterns',
      markdown: `| Factor | Pre-route | Cascade | Ensemble |
|---|---|---|---|
| How | classifier picks the model up front | cheap model first, escalate on low confidence / failed validation | cheap and strong in parallel |
| Latency | lowest | higher on escalated requests | parallel calls |
| Cost | lowest if the classifier is right | cheap + strong on escalations | highest |
| Use when | the classifier is accurate on your eval | a quality floor matters | rare, critical comparisons |`,
    },
    {
      title: 'Gateway: use X when',
      markdown: `- **No gateway**: single-model prototype; call the API directly.
- **Self-hosted OSS gateway (e.g. LiteLLM)**: you want aliases, fallbacks and keys under your control.
- **Managed gateway**: you want guardrails, PII redaction and dashboards without running it.
- **Edge gateway**: JavaScript apps at the edge, zero ops.
- Gateway job list: aliases → fallback chains, rate limits, retries with a budget, PII scrub before dispatch, per-request cost and latency logs.`,
    },
    {
      title: 'Fallback availability',
      markdown: `Independent providers each failing with probability \`p\`: success = \`1 − pⁿ\`.

| Providers (p = 3%) | Success |
|---|---|
| 1 | 97% |
| 2 | 99.91% |
| 3 | 99.997% |

Only true if failures are independent: put each hop in a different failure domain (region / provider).`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Escalation rate keeps climbing | cheap model over-routed | raise the threshold; route less to it |
| Quality drops with no alarm | cheap-model drift | gate routes on online metrics: thumbs, sampled LLM-judge, refusal rate |
| Fallbacks double the bill | retries without a budget | count retries against a budget |
| Low prefix-cache hit rate | dynamic content early in the prompt | static parts first, fixed template order |
| Decode stalls during long prompts | prefill blocks decode | chunked prefill |

Alert first on fallback-use rate, then gateway p99 latency.`,
    },
  ],
};

export default sheet;
