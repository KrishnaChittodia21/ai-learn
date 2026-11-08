import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['genai-observability.md', 'sre-for-ai.md'],
  blocks: [
    {
      title: 'More gen_ai attributes',
      markdown: `| Attribute | Holds | Why |
|---|---|---|
| \`gen_ai.operation.name\` | \`chat\`, \`embeddings\`, \`execute_tool\`, \`invoke_agent\` | groups spans by kind of work |
| \`gen_ai.response.model\` | the model that actually served the call | routers and aliases can differ from the request |
| \`gen_ai.response.id\` | provider response id | correlate with provider logs and support tickets |
| \`gen_ai.tool.name\`, \`gen_ai.tool.call.id\` | tool and one call of it | find which tool call was slow or failed |
| \`gen_ai.data_source.id\` | corpus or index a RAG step read | ties bad answers to a stale index |

Span kind: **CLIENT** when the call crosses a process boundary (provider API, remote agent); **INTERNAL** for the in-process agent loop and local tool execution.`,
    },
    {
      title: 'Reading a slow trace',
      markdown: `1. Validate the tree: every child has a known parent and sits inside its parent's time window.
2. **Exclusive time** = span duration − the union of its children's intervals (merge overlaps, don't sum parallel children).
3. The span with the largest exclusive time is where the time went.
4. Diff against a good baseline trace: wall time, tokens and error count per span.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| PII or secrets in the trace store | full prompts captured on spans | keep content opt-in or in a separate store; put a reference id on the span |
| Orphaned tool spans | context not propagated | pass the parent context into every tool and worker |
| MCP server missing from the trace | stdio has no HTTP headers | carry \`traceparent\` in the request's \`_meta\` |
| Dashboards break after an SDK upgrade | semconv attribute renames | pin the semconv version and opt in explicitly |
| Can't tell which prompt caused a regression | prompt version not recorded | put the prompt version on the root span |
| Rare error line missing from an assistant's log summary | uniform sampling under a small budget | keep rare log templates first, then sample the common ones |`,
    },
  ],
};

export default sheet;
