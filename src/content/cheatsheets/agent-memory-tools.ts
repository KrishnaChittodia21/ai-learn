import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['context-engineering.md', 'agent-tool-use-skills.md'],
  blocks: [
    {
      title: 'Memory designs',
      markdown: `| Design | Use it when | Main risk |
|---|---|---|
| MemGPT two tiers (main context + archival) | Data is larger than the window | Memory rot, poisoning |
| Letta memory blocks | Some facts must always stay in the prompt | Block bloat, silent drift |
| Mem0-style hybrid (vector + key-value + graph) | Queries mix similarity, exact lookup and relations | Embedding drift, graph growth |
| Files in the repo (JSON + schema) | State must outlive the chat (task, touched files, next action) | Partial writes |

Fusion score = weighted sum of relevance, importance and recency; tune the weights per product.`,
    },
    {
      title: 'Memory troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Retrieval drowns in stale facts | Memory rot | Consolidate in a background (sleep-time) pass; mark old facts invalid |
| Agent obeys an old injected note | Memory poisoning | Treat retrieved memory as untrusted data |
| Agent recalls but cannot cite | Source not stored | Save session id and turn id with each write |
| Block hits its cap | Block bloat | Summarise before the write that crosses the cap |
| One user sees another's facts | Scopes mixed | One tenant + user scope on every write and read |
| Resumes on corrupt state | Non-atomic write | Temp file, \`fsync\`, then rename |`,
    },
    {
      title: 'Tool-call failures',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| \`unknown tool\` | Model invented a tool | Return the error as a result; it usually corrects |
| Missing field / value outside enum | Bad arguments | Validate against the schema, return a specific error |
| Wrong tool picked | Vague description | Say what it does, when to use it and when not |
| Result attached to the wrong call | Mixed-up call ids | Match every result to its \`tool_use\` id |
| Skill search worsens as the library grows | Too many similar skills | Add tag filters and hard constraints |`,
    },
  ],
};

export default sheet;
