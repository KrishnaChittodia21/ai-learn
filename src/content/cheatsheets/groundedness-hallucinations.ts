import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['summarization-qa-nli.md'],
  blocks: [
    {
      title: 'NLI as a grounding gate',
      markdown: `- **Premise** = the retrieved chunk; **hypothesis** = one atomic claim from the answer.
- Labels: entailment (supported), neutral (not verifiable), contradiction. Only entailment passes.
- Pick the threshold on labelled in-domain pairs, not a default.
- Sentence-level NLI models degrade on long premises: split the context or use a document-level model.
- The same trick does zero-shot classification: each label becomes a hypothesis, the highest entailment wins.`,
    },
    {
      title: 'Extractive or abstractive',
      markdown: `| Use | When |
|---|---|
| Extractive (quote or select sentences) | legal, medical, financial, anything where a changed number is harmful |
| Abstractive (rewrite) | readability matters and a factuality check runs after |
| Map-reduce over chunks | input is longer than the window; never silently truncate |`,
    },
    {
      title: 'Answer-matching gotchas',
      markdown: `- Normalise before exact match: lowercase, drop articles and punctuation.
- "29 June 2007" vs "June 29, 2007": exact match 0, token F1 1.0. Report both.
- "June 29th, 2007" vs "June 29, 2007": token F1 0.67. Normalise ordinals and dates if they matter.
- Reference-overlap scores (ROUGE) reward wording, not truth: pair them with a faithfulness check.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Summary names the wrong person | entity swap in abstractive output | flag entities that are not in the source |
| "25,000" became "25 million" | number drift | extract numbers verbatim; check them in code |
| An answer for an unanswerable question | the reader always returns a span | allow an empty answer and an abstain threshold |
| Generator looks bad | retriever missed the passage | measure retrieval recall at k first |
| NLI detector great on the benchmark, weak in prod | benchmark hypotheses leak the label through words like "not" | validate on your own labelled data |
| Zero-shot labels swing with template wording | hypothesis wording sensitivity | test and fix the template wording |`,
    },
  ],
};

export default sheet;
