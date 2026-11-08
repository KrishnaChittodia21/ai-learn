import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['diffusion-models.md', 'image-generation-compared.md', 'image-editing-control.md', 'audio-generation-alms.md'],
  blocks: [
    {
      title: 'Samplers and steps',
      markdown: `| Sampler | Typical steps | Retrain? |
|---|---|---|
| DDPM | 1000 (paper) | — |
| DDIM | 20–50 | no |
| DPM-Solver family | 10–30 | no |
| Flow matching, Euler | fewer on straight paths | trained that way |
| Distilled (consistency, turbo, LCM) | 1–4 | yes |`,
    },
    {
      title: 'Editing knobs',
      markdown: `| Knob | Controls | Start at |
|---|---|---|
| img2img \`strength\` | how much changes | 0.5–0.7 for restyling |
| Inpaint mask | where it changes | dilate 8–16 px |
| ControlNet weight | layout / pose / depth | sum of weights ≈ 1.0 |
| LoRA scale | style / subject | ≤ 1; same base model |
| \`guidance_scale\` | prompt fidelity vs diversity | read the model card (SD pipelines: 7.5) |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Saturated, burnt image | guidance too high | lower the scale, sweep on fixed seeds |
| LoRA has no effect | trained on another base | match the base model |
| Seam at the mask | naive reinjection | dilate mask, inpainting checkpoint |
| Subject loses identity in img2img | strength too high | lower strength or add ControlNet |
| Can't load a second LoRA | adapter was fused | unfuse, or set adapters per request |
| Video flickers | frames sampled independently | joint (temporal) denoising, keyframes |
| Speech stutters when streaming | tokens/s < frame rate × codebooks | fewer codebooks, smaller model |`,
    },
    {
      title: 'Numbers',
      markdown: `- Latent: 512×512×3 → 64×64×4 = 48× fewer values.
- CFG doubles denoiser passes per step.
- EnCodec 24 kHz: 75 frames/s; 8 codebooks = 600 tokens/s.
- 10 s of 1080p at 24 fps ≈ 1.5 GB raw.`,
    },
  ],
};

export default sheet;
