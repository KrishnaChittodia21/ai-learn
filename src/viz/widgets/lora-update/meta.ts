import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'lora-update',
  title: 'LoRA: a frozen W plus a trainable low-rank update (α/r)·B·A',
  blurb:
    'Attach rank-r adapters to a frozen weight matrix, see why B = 0 makes training start exactly at the base model, take a few training steps, then merge W + (α/r)BA. Live counters scale it to Llama-3.1-8B: trainable params, % of the model and training memory for full FT vs LoRA vs QLoRA.',
  placements: [
    { topic: 'fine-tuning', heading: 'LoRA' },
    { topic: 'fine-tuning', heading: 'QLoRA' },
  ],
};
