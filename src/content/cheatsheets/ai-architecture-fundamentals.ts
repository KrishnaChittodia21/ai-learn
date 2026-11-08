import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['production-llm-app.md', 'llm-routing-gateways.md'],
  blocks: [
    {
      title: 'Graceful degradation by failure',
      markdown: `| Failure | Retry? | Degrade to |
|---|---|---|
| 429 rate limit | yes, with backoff and \`Retry-After\` | queue the request |
| 5xx from the provider | a few times | next model in the fallback chain |
| Timeout | once | shorter prompt or a smaller model |
| Malformed output | once, with the validation error | fixed error message |
| Guardrail block | never | explain the block |
| Vector store down | — | answer without retrieval, and say so |
| Cache down | — | call the model directly |
| Every model fails | — | cached answer, then a fixed apology |`,
    },
    {
      title: 'Harden a public endpoint',
      markdown: `| Check | Response |
|---|---|
| Body too large | 413, before parsing |
| Not JSON | 415 / 400 |
| Text too long or has control characters | 422 |
| Per-client token bucket empty | 429 with \`Retry-After\` |
| Daily spend or call cap reached | 503 with \`Retry-After\` |
| Missing access token on a demo | 401 |`,
    },
    {
      title: 'Do you need a gateway?',
      markdown: `| Situation | Choice |
|---|---|
| Single-model prototype | call the API directly |
| Several models or providers, shared keys, cost tracking | a gateway with aliases and fallback chains |
| Strict data residency | self-hosted gateway |
| Edge-served web app, no ops team | a managed edge gateway |

Route by **alias** ("smart", "fast"), not raw model ids, so swaps happen in config.`,
    },
  ],
};

export default sheet;
