import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['prompt-engineering.md'],
  blocks: [
    {
      title: 'Assemble the window per request',
      markdown: `1. **Reserve** output tokens first: available = context limit − generation reserve.
2. **System prompt**: role, rules, output contract; stable, so it caches.
3. **Tools**: only those the request's intent needs; every schema costs tokens.
4. **Documents**: drop chunks below a relevance threshold (bad retrieval is worse than none); best ones first or last.
5. **History**: summarise old turns, keep recent turns verbatim.
6. **User question** last.`,
    },
    {
      title: 'Iteration loop',
      markdown: `| Step | Rule |
|---|---|
| Test settings | lowest randomness the model allows, so you see prompt effects, not sampling noise |
| Change | one thing per version; bump the version id |
| Compare | same cases; read the ones that flipped |
| Ship | only if the held-out slice agrees |
| Model upgrade | rerun everything; delete old-model workarounds |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Self-consistency votes are all identical | samples drawn with no randomness | sample independently at the model's default or a higher temperature |
| Votes can't be counted | no fixed answer format | end with a parseable line, e.g. \`<answer>…</answer>\` |
| Template renders "undefined" | missing variable rendered silently | fail fast on missing variables |
| User text breaks the template | your reserved tags appear in input | escape reserved tags before rendering |
| Prod differs from the playground | model or parameters not pinned | log prompt version, model snapshot and params per call |
| Cache hit rate near zero | variable content near the top | move per-request data below the stable prefix |`,
    },
  ],
};

export default sheet;
