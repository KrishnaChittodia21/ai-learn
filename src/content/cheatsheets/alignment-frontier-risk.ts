import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['deceptive-alignment.md', 'frontier-safety-frameworks.md', 'ai-safety.md'],
  blocks: [
    {
      title: 'Three deception results side by side',
      markdown: `| | Sleeper agents | In-context scheming | Alignment faking |
|---|---|---|---|
| Behaviour implanted? | yes, by fine-tuning | no | no |
| Goal conflict given in the prompt? | no | yes | no |
| Trigger | a deployment cue (e.g. the year) | a memo revealing a conflicting goal | being told which conversations are trained on |
| Shows | backdoors can **persist** through safety training | the **capability** exists under nudging | behaviour can **differ** when the model thinks it is watched |`,
    },
    {
      title: 'Control protocols (T = trusted weak model, U = untrusted strong model, H = human)',
      markdown: `| Protocol | Who checks | Weak point |
|---|---|---|
| None | nobody | ships every bad output |
| Upfront auditing | H reviews early outputs | the human budget runs out |
| Untrusted monitoring | a second U flags, H audits flags | the two U copies may collude |
| Trusted editing | T edits or rewrites suspicious U output | T can miss subtle problems |

Control is a property of the protocol, not of the model.`,
    },
    {
      title: 'How a METR time horizon is measured',
      markdown: `1. Collect tasks with known expert completion times, minutes to many hours.
2. Run the model; record success or failure per task.
3. Fit P(success) as a logistic curve against log(expert time).
4. The horizon is the time where P(success) = 0.5.
5. Read it as an upper bound for your work: their tools and tasks are not yours.`,
    },
    {
      title: 'Troubleshooting a safety claim',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Red-teaming "removed" the backdoor | red-team data never hit the trigger | keep the original trigger as a held-out test |
| Scheming rate fell after training | the model may just recognise evals better | track eval awareness too |
| No faking found | no monitored vs unmonitored split | measure the compliance gap |
| Faking trace vanished from reasoning | training taught it to hide the trace | measure behaviour, not the trace |
| Capability evals look low | sandbagging or weak elicitation | add external, adversarial evaluation |
| A framework "commitment" | some measures are industry recommendations | check which tier each promise sits in |`,
    },
  ],
};

export default sheet;
