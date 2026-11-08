import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['production-llm-app.md', 'tool-calling.md'],
  blocks: [
    {
      title: 'What to do on each failure',
      markdown: `| Failure | Retry? | Then |
|---|---|---|
| 429 rate limit | yes, backoff + jitter, honour \`retry-after\` | queue, or a fallback model |
| 5xx / overloaded | yes, a few times | switch to the fallback model |
| Timeout | once | shorter prompt or smaller model |
| 400 / 401 / 403 / 404 | no | fix the request or credentials |
| Malformed structured output | once, with the validation error | typed error to the caller |
| Guardrail block | no | explain the block to the user |
| Vector store / cache down | — | degrade: answer without RAG / call the model directly |
| Whole chain fails | — | cached answer, then a clear apology |`,
    },
    {
      title: 'Streaming in production',
      markdown: `- Use \`fetch\` + POST and read the body stream; browser \`EventSource\` is GET-only and puts input in logged URLs.
- Once you have sent HTTP 200 you cannot change the status: report a mid-stream failure as an \`error\` event.
- Give events ids; on reconnect send \`Last-Event-ID\` and replay only later events.
- Decode bytes with a streaming UTF-8 decoder: multi-byte characters split across chunks.
- Tool-call arguments stream as partial JSON: join per call, parse at the end-of-block event.
- Error body for clients: \`code\`, \`message\`, \`hint\`, \`request_id\`.`,
    },
    {
      title: 'Protect the endpoint',
      markdown: `| Guard | Example |
|---|---|
| Request body cap | reject large bodies with 413 before parsing |
| Input length cap | 422 when text is over your limit |
| Per-user rate limit | token bucket → 429 with \`Retry-After\` |
| Daily spend / call cap | 503 with \`Retry-After\` when reached |
| Timeouts | per upstream call, plus an overall deadline |`,
    },
  ],
};

export default sheet;
