import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['llm-routing-gateways.md', 'inference-load-testing.md', 'progressive-delivery.md'],
  blocks: [
    {
      title: 'Fallback and retry maths',
      markdown: `- **Fallback chain availability** = \`1 − p₁·p₂·…\` if failures are independent. At a 3% error rate each: one provider 97%, two 99.91%, three 99.997%.
- Independence is the catch: two deployments in the same region or behind the same provider share failures. Put the fallback in a different failure domain.
- **Worst-case calls** = clients × max attempts. A shared retry budget caps it: 20 clients, 4 attempts, budget 12 → at most 20 + 12 = 32 calls instead of 80.
- **Capped backoff** without jitter, base 10 ms, cap 25 ms: waits 10, 20, 25, 25. Every client waits the same, so add jitter.`,
    },
    {
      title: 'Hedged requests',
      markdown: `| Rule | Why |
|---|---|
| Hedge only safe, idempotent reads | a duplicate write or LLM call with side effects is not free |
| Send at most one backup, after a delay near the normal p95 | hedging every request doubles load |
| Only a valid success can win | a fast 500 must not beat a slow 200 |
| Cancel the loser, but count its server work | cancel rarely stops work already started upstream |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Every client retries at the same instant | synchronized exponential waits | full jitter plus a shared retry budget |
| Provider 429s turn into an outage | gateway and SDK retries multiply concurrency | retry in one layer only; count retries against a budget |
| Fallbacks quietly raise the bill | fallback model is pricier and unmetered | track fallback-use rate and cost per request |
| An alias goes down with its provider | the chain has one failure domain | add a second provider or region |
| Fallback answers look wrong | prompt tuned for the primary model | keep an equivalent, tested prompt per model in the chain |
| Load test passed, prod still throttled | test prompts all identical and cached | replay realistic prompt sizes and content |

Alert first on fallback-use rate, then on gateway p99 latency.`,
    },
  ],
};

export default sheet;
