import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['structured-outputs.md', 'tool-calling.md'],
  blocks: [
    {
      title: 'Levels of output control',
      markdown: `| Level | Guarantees | Use when |
|---|---|---|
| Prompt "reply in JSON" | nothing | never in production |
| JSON mode | valid JSON syntax | shape is loose; you validate everything |
| Schema / strict structured outputs | matches your JSON Schema | hosted APIs, default choice |
| Constrained decoding (grammar / FSM logit mask) | valid by construction | self-hosted models (e.g. guided JSON in vLLM) |
| Parse → validate → retry (Instructor-style) | eventually valid or a typed error | providers without schema mode |

None of them proves the **values** are true: a schema catches the wrong type, not an invented number.`,
    },
    {
      title: 'Structured output or tool call?',
      markdown: `- **Structured output**: the JSON *is* the final answer (extraction, classification, a form).
- **Tool call**: the model asks your code to *act* or fetch, and expects a result back.
- Several possible output shapes? Expose each as a tool and let the model pick.`,
    },
    {
      title: 'Tool schema design',
      markdown: `- Name: \`snake_case\`, verb + noun: \`get_order_status\`.
- Description: "Use when … Do not use for …" — the second sentence prevents wrong-tool picks.
- Put every closed set in an \`enum\`; make key fields required and nullable instead of optional.
- Split a tool whose \`action\` argument has many modes into atomic tools.
- Expose only the tools this user and task need.
- Put a reasoning / evidence field before the answer field when you ask for both.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| 400 error with strict mode | strict-schema rule broken | every property in \`required\`, \`additionalProperties: false\`, no unsupported keywords |
| Invented value for a missing field | field not allowed to be empty | allow \`null\` and say when to use it |
| Wrong tool picked | overlapping descriptions | add "Do not use for …" lines |
| \`JSON.parse\` throws mid-stream | arguments arrive as partial JSON | concatenate, parse at the end-of-block event |
| Result attached to the wrong call | matched by name, not id | return each result with its call id |
| Same validation error retried forever | deterministic error | send the error path and message to the model; cap retries |
| Refusal treated as a parse failure | refusal not handled | handle it as its own typed outcome; don't retry |`,
    },
  ],
};

export default sheet;
