import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rlhf-dpo.md', 'alignment-training.md'],
  blocks: [
    {
      title: 'RLHF vs RLAIF vs DPO',
      markdown: `| Factor | RLHF (PPO) | RLAIF / Constitutional AI | DPO |
|---|---|---|---|
| Preference signal | human-ranked pairs | a feedback model applying written principles | fixed human or AI pairs |
| Reward model | trained separately | trained on AI preferences | implicit in the log-prob ratio |
| Loop | online: sample, rate, retrain | online | offline supervised |
| Main failure | reward hacking | Goodhart remains; principles must be good | over-optimises the reference ratio |`,
    },
    {
      title: 'Pick a preference method',
      markdown: `| Method | Use when |
|---|---|
| DPO | a few thousand+ preference pairs, limited compute, many experiments |
| IPO | DPO's reward gap blows up / overfits on noisy pairs |
| KTO | only unpaired thumbs up / down |
| SimPO | answers keep getting longer (length bias); no reference model |
| ORPO | one stage straight from the base model, no SFT checkpoint |
| GRPO | verifiable rewards (maths, code) and online RL without a critic |
| RLHF (PPO) | many reward dimensions or an iterative online rating loop |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Reward climbs, human eval flat | reward hacking | stop early, raise β, broaden RM data |
| Answers get longer and longer | RM / preferences reward length | length-normalised reward, SimPO, length-balanced pairs |
| Policy barely changes | β too high | lower β |
| Gibberish that games the RM | β too low | raise β / target a fixed KL |
| Agrees with everything | sycophancy in the preference data | adversarial pairs, several reward models |
| Benchmarks drop after tuning | alignment tax / forgetting | mix in SFT or pre-training data, smaller LR |
| Chosen log-prob falls in DPO | both responses pushed down | watch \`rewards/chosen\`, not just margins; lower LR |`,
    },
    {
      title: 'Remember',
      markdown: `- Preference tuning cannot add capability or facts: the base model sets the floor.
- People compare two answers far more reliably than they score one.
- DPO needs four log-prob passes per pair: policy and reference × chosen and rejected.`,
    },
  ],
};

export default sheet;
