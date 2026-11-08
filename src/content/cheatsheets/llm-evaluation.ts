import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['llm-evaluation.md', 'generative-evaluation.md'],
  blocks: [
    {
      title: 'Pick the grader by task',
      markdown: `| Task | Grader | Normalize first |
|---|---|---|
| Short factual answer | exact match | trim, lowercase |
| Multiple choice | exact match on the letter | extract the first \`A\`–\`E\` |
| Generated code | run unit tests: pass@1, pass@k | extract the code block, time-limit the run |
| Extraction / JSON | schema check + field-level F1 | parse, sort keys |
| Summary, tone, helpfulness | LLM judge with an anchored rubric | — |
| Speech-to-text | WER = (S + D + I) / N | lowercase, strip punctuation; report the rule |`,
    },
    {
      title: 'Formulas',
      markdown: `- **pass@k**: \`1 − C(n−c, k) / C(n, k)\` for c passes in n samples; always report pass@1 too.
- **Token F1**: \`2PR / (P + R)\` over token overlap; take the best over all references.
- **Perplexity**: \`exp(mean negative log-likelihood per token)\`; count only non-pad tokens.
- **ECE**: per confidence bin, |confidence − accuracy| weighted by bin size, summed.
- **Brier**: \`mean((p − y)²)\`; catches spread that ECE misses.
- **Elo expected score**: \`1 / (1 + 10^((r_b − r_a)/400))\`.`,
    },
    {
      title: 'How many cases (95% CI at a 90% pass rate)',
      markdown: `| Cases | ± points |
|---|---|
| 50 | ±8.3 |
| 100 | ±5.9 |
| 200 | ±4.2 |
| 500 | ±2.6 |
| 1000 | ±1.9 |

From \`±1.96·√(p(1−p)/n)\`. Paired comparisons on the same items need fewer cases than these unpaired bounds suggest.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Judge scores silently missing | bad JSON parsed as NaN, the mean drops it | count parse failures as explicit fails |
| Judge favours its own model | self-preference | judge with a different model family |
| Pairwise judge picks answer A | position bias | run both orders, disagreement = tie |
| Mean looks fine, users complain | rare catastrophic failures hidden in the mean | read the bottom quantile and per-slice scores |
| One task dominates the average | scores on different scales | return fractions in [0, 1] |
| Passes needle-in-a-haystack, fails real docs | NIAH only tests lookup | add multi-hop questions over real documents |
| Scores jump after a judge update | judge model drifted | pin the judge model and prompt version |`,
    },
  ],
};

export default sheet;
