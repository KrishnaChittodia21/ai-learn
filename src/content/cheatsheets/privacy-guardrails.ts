import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['guardrails-moderation.md', 'fairness-privacy.md'],
  blocks: [
    {
      title: 'Filter stack, cheapest first',
      markdown: `1. **Length cap** and **per-user rate limit**: free, stop abuse early.
2. **Topic classifier**: reject off-topic input before paying for the model.
3. **PII detector**: redact, tokenise or reject.
4. **Injection detector**: one signal, never the only defence.
5. **LLM call**: the expensive step.
6. **Output safety classifier** → **PII scrubber** → **relevance / grounding check** → **schema validation**.

Run output checks alongside streaming and hold back the final chunk until they pass.`,
    },
    {
      title: 'Route verdicts by severity',
      markdown: `| Severity | Action | Example |
|---|---|---|
| High | block: drop output, return a policy refusal | card number or national ID in the output |
| Medium | redact the matched spans | an email address |
| Low | allow, log and maybe add a notice | mild toxicity hit |
| None | ship and log | — |

Several classifiers fire? The **most severe** action wins.`,
    },
    {
      title: 'Bypasses and blind spots',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Lookalike letters or emoji-smuggled text passes | classifier sees raw, unnormalised text | NFKC-normalise and map homoglyphs first |
| Encoded attack slips through | input moderation only | moderate output as well |
| Every input reaches the model | output moderation only | moderate input as well |
| "You are not a [slur]" gets blocked | no negation handling | check a short window before the match |
| Part of a long secret still shows | nested matches redacted separately | merge overlapping spans, redact the union |
| PII in traces and eval sets | redaction only on the user path | redact before logging and dataset export |
| Users re-identified from a "safe" model | confidence scores leak membership | don't expose raw scores; round or omit them |`,
    },
    {
      title: 'Guard model options',
      markdown: `| Option | Use when |
|---|---|
| Hosted moderation endpoint | you want a managed text/image classifier with no ops |
| Open-weights guard (e.g. Llama Guard) | you self-host, need a fixed hazard taxonomy, or want to fine-tune |
| Your own small classifier | a narrow, domain-specific policy the general taxonomies miss |

Guard classifiers alone have been bypassed by adaptive attacks: keep layers.`,
    },
  ],
};

export default sheet;
