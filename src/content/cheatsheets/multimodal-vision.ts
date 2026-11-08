import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['vlm-architectures.md', 'vlm-model-families.md'],
  blocks: [
    {
      title: 'Vision → LLM bridges',
      markdown: `| Bridge | Visual tokens | Use when |
|---|---|---|
| MLP projector (Linear–GELU–Linear) | one per patch (e.g. 24×24 = 576) | quality per token matters; the common default |
| Q-Former / Perceiver resampler | fixed small set of learned queries | token budget is tight (many images, video) |
| Gated cross-attention (Flamingo-style) | none in the sequence; text attends to image features | many interleaved images, few-shot |
| Native multimodal pre-training | as designed | you can afford pre-training and text skills must not regress |`,
    },
    {
      title: 'Training stages',
      markdown: `1. **Alignment**: freeze the vision encoder and LLM; train only the projector on image–caption pairs.
2. **Instruction tuning**: train projector + LLM on (image, question, answer) data.
3. **Task tuning** (optional): your documents, screens or domain images.

Post-hoc recipes (1→2) keep the LLM swappable; you retrain only the projector for a new LLM.`,
    },
    {
      title: 'Resolution vs tokens',
      markdown: `| Strategy | Effect |
|---|---|
| Square resize to the encoder size | cheap, but squashes text and chart labels |
| Tiling (AnyRes): tiles + a thumbnail | keeps detail; tokens ≈ (tiles + 1) × tokens per tile |
| Native aspect ratio with a max-pixels cap | detail without tile overhead; set the cap to control cost |
| Video | tokens ≈ frames × tokens per frame; lower fps or pool frames to fit the budget |`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Misreads small text | too few visual tokens / downscaled | crop the region or raise resolution |
| Wrong above/below, wrong counts | VLMs are weak at spatial reasoning and counting | detection / OCR / geometry tools for exact answers |
| Confident objects that aren't there | weakly grounded training pairs | ask for evidence (boxes, quotes); verify with a tool |
| Context fills fast with many images | each image costs hundreds+ tokens | fewer, cropped images; a resampler model |
| Text skills drop after VLM tuning | multimodal tuning drifted the LLM | mix in text-only data |`,
    },
  ],
};

export default sheet;
