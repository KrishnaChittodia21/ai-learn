import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['dialogue-systems.md'],
  blocks: [
    {
      title: 'Chatbot paradigms',
      markdown: `| Paradigm | Strength | Fails when |
|---|---|---|
| Rules: intents + slot filling | predictable, auditable | the user leaves the script |
| Retrieval of stored answers (FAQ) | no hallucination, cheap | the question is new |
| LLM agent with tools | flexible, multi-step | no step budget or guarded tools |
| Hybrid router | FAQ first, agent for the rest, human for risky actions | the router threshold is never tuned |`,
    },
    {
      title: 'Dialogue state tracking',
      markdown: `- **Slot**: a parameter the backend needs (order id, date, party size).
- Update rules: never reset slots the turn didn't mention; a correction overwrites; "never mind the date" clears it.
- LLM tracker: re-emit the **whole state** each turn as schema-validated JSON, with enums for closed slots.
- **Joint goal accuracy** = turns where every slot is right / all turns. All or nothing, so one bad slot fails the turn.`,
    },
    {
      title: 'Agent loop guards',
      markdown: `1. Cap steps (e.g. 5); when exhausted, say so instead of looping.
2. Unknown tool name or non-object arguments: append an error message and continue, don't crash.
3. Detect destructive requests (cancel, refund, delete) and route them to confirmation or a human.
4. A reply without a tool call is the final answer.`,
    },
    {
      title: 'Context per turn',
      markdown: `System prompt → only the tools this intent needs → relevant documents (best at the start and end) → summarised old turns + recent turns → the user's message, with output tokens reserved first.`,
    },
  ],
};

export default sheet;
