import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['lora-fine-tuning.md'],
  blocks: [
    {
      title: 'Choose a method by GPU memory',
      markdown: `| Method | Base weights | Rough memory | Use when |
|---|---|---|---|
| Full fine-tune | trained, bf16 | ≈16 bytes/param + activations | many GPUs and a big behaviour change |
| LoRA | frozen, bf16 | ≈2 bytes/param + small adapter state | the bf16 model fits with headroom |
| QLoRA | frozen, 4-bit NF4 | ≈0.5–0.6 bytes/param + adapters | one consumer / single datacenter GPU |

Worked example: one 4096×4096 matrix at \`r = 16\` trains \`2·16·4096 = 131,072\` of 16,777,216 params (0.78%).`,
    },
    {
      title: 'Pick a rank',
      markdown: `| Rank | Use for |
|---|---|
| \`r = 8–16\` | format, tone, instruction following, classification |
| \`r = 32–64\` | code, maths, complex reasoning, a new domain |

Raising rank helps only if the targets are right: cover all linear layers (attention + MLP) before going above 64.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| NaN loss / padding errors | no pad token set | set one (often reuse EOS) and mask it |
| Loss flat | LoRA learning rate too low | try \`1e-4\`–\`2e-4\` |
| Train loss falls, eval quality poor | overfitting | fewer epochs, more data, early stop on eval |
| Model echoes the instruction | no loss mask | labels \`-100\` on prompt and padding |
| Never stops generating | missing EOS / end-of-turn in targets | end every answer with it |
| Weak on hard tasks | rank too low or attention-only targets | raise r, add MLP layers |
| General skills drop | LR too high / too many epochs | lower LR, 1–3 epochs, check a general benchmark |
| OOM on long sequences | optimiser states and activations | paged 8-bit AdamW, gradient checkpointing, shorter max length |`,
    },
    {
      title: 'Do not fine-tune when',
      markdown: `- a better prompt or few-shot examples already pass your eval;
- the gap is missing facts (use RAG);
- you have only a few hundred noisy examples and no held-out set.

Always compare base + strong prompt vs base + adapter on the same held-out examples.`,
    },
  ],
};

export default sheet;
