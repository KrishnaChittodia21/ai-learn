import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['prompt-engineering.md'],
  blocks: [
    {
      title: 'Pick a technique',
      markdown: `| Technique | Use when | Cost |
|---|---|---|
| Zero-shot | the task is clear and common | 1 call |
| Few-shot | format or edge cases come out wrong | 1 call, longer prompt |
| Chain-of-thought | multi-step reasoning on a non-reasoning model | 1 call, more output tokens |
| Self-consistency | high-stakes answers that can be compared exactly | N calls |
| Prompt chaining | the task splits into steps with checkable outputs | one call per step |
| ReAct | the answer needs tools or fresh data | several calls |

Start at the top; move down only when an eval shows the need.`,
    },
    {
      title: 'Write the task clearly',
      markdown: `- State format, length, audience, what to include and exclude.
- Phrase rules as positive ("always cite the ticket id"), negative ("do not mention prices") or conditional ("if no date is given, write \`unknown\`").
- Pick few-shot examples close to real inputs and cover every label.
- Put critical instructions first and the question last; in long prompts the middle is read worst.
- Keep stable parts at the top and variable parts at the bottom so the prefix caches.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Generic, middle-of-the-road output | vague task, generic role | name the audience, format and length |
| Follows one rule, drops another | rules contradict each other | audit the prompt for conflicts |
| Quality drops as rules pile up | a wall of instructions | cut to the rules that change behaviour; test each |
| User text overrides your rules | input sits outside delimiters | tag input, say it is data, validate output |
| Key fact ignored | buried mid-context | move it first or last |
| Classifier favours one label | unbalanced or ordered examples | balance and shuffle the examples |`,
    },
  ],
};

export default sheet;
