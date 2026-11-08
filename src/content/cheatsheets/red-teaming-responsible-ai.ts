import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['ai-governance.md', 'constitutional-classifiers.md', 'fairness-privacy.md', 'security-compliance.md'],
  blocks: [
    {
      title: 'Fairness criteria (Ŷ = decision, Y = truth, A = group)',
      markdown: `| Criterion | Equal across groups | Use when the claim is |
|---|---|---|
| Demographic parity | P(Ŷ=1 given A) | equal acceptance rates |
| Equalized odds | true- and false-positive rates | equal error rates |
| Predictive parity | precision (PPV) | a positive decision means the same thing for everyone |
| Counterfactual | the decision after swapping name, gender or dialect | the attribute must not matter at all |

With unequal base rates you cannot satisfy all group criteria at once: pick one and state it as policy. Test intersections (e.g. gender × race), not one attribute at a time.`,
    },
    {
      title: 'Which document',
      markdown: `| Card | Documents |
|---|---|
| Model card | intended use, evaluation factors, metrics broken down by group, limits |
| Datasheet / data card | why the data exists, composition, collection, labelling, maintenance |
| System card | the deployed system: safeguards, injection and exfiltration defences, incident response |

A card states claims; back the important ones with evals or attestations someone else can check.`,
    },
    {
      title: 'Three defence layers',
      markdown: `| Layer | Acts on | Good at | Misses |
|---|---|---|---|
| Training (constitution, RLHF / RLAIF) | what the model prefers | unseen close analogues | ambiguity, drift |
| Input/output classifiers | every turn | fast rejects of obvious misuse | lookalike characters, smuggled text, paraphrase |
| Rules on the response | the candidate output | contractual constraints, e.g. "a refusal offers a next step" | structural rewrites |

Normalise text before classifying; add dialog-level checks for requests that drift over many turns.`,
    },
    {
      title: 'Governance traps',
      markdown: `| Symptom | Fix |
|---|---|
| The lab evaluates only its own model | add external evaluators |
| Deployed in several jurisdictions | map controls once; meet the strictest applicable rule |
| Erasure request for data already in the weights | honour opt-outs at collection; unlearning is partial |
| Logs keep raw prompts | log hashes, model version, tokens, cost and guardrail trips; keep raw text only with consent |
| Regulation dates in your slides | cite the version you read; timelines get revised |`,
    },
  ],
};

export default sheet;
