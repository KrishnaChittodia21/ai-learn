import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['llm-cost-caching.md'],
  blocks: [
    {
      title: 'Prompt cache break-even (write 1.25×, read 0.1×)',
      markdown: `| Calls in the TTL | Cost vs uncached |
|---|---|
| 1 write + 1 read | \`(1.25 + 0.1) / 2 ≈ 0.68×\` |
| 1 write + 10 reads | \`(1.25 + 1.0) / 11 ≈ 0.20×\` |
| 1 write, never read | 1.25×: caching cost you more |

Rule of thumb: mark a block cacheable only if it is re-read several times inside its TTL.`,
    },
    {
      title: 'Which cache',
      markdown: `| Cache | Matches on | Use when |
|---|---|---|
| Provider prompt cache | identical token prefix | long, stable system prompt / tools / documents reused across turns |
| Exact-match response cache | identical request (temperature 0) | repeated identical calls, e.g. retries, popular queries |
| Semantic cache | similar meaning above a tuned threshold | many paraphrased FAQ-style questions, non-personal answers |
| Batch API | — (discount, not a cache) | evals, backfills, nightly jobs that can wait hours |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Hit rate near zero | timestamp, request id or user name early in the prompt | move dynamic text after the cached prefix |
| N parallel calls → N cache writes | calls race the first write | send one request first, then fan out |
| Block never caches | prefix below the provider minimum | make the cached block longer, or skip caching |
| Hits stop after a deploy | tool order or template changed | serialise tools and templates in a fixed order |
| Semantic cache serves wrong answers | threshold too low; entity / negation differences | raise threshold; key on tenant + entities |
| "cached" bigger than input in reports | cached counted as extra tokens | cached tokens are a subset of input |`,
    },
    {
      title: 'Cost hygiene',
      markdown: `- Tag every call with tenant, feature, route and user at creation time.
- Split tokens by kind: system, tools, memory/history, retrieved docs, output.
- Track cost per resolved task, not $ per million tokens.
- Check cache-read fields in CI so a prompt refactor can't silently kill hits.`,
    },
  ],
};

export default sheet;
