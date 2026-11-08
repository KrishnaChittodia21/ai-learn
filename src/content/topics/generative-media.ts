import type { Topic } from '../../types';

// Adapted (rewritten, not copied) from ai-engineering-from-scratch, Phase 8 lessons 06–11 and 13 (DDPM, latent
// diffusion, ControlNet/LoRA, inpainting and editing, video and audio generation, flow matching) and its cheatsheets
// diffusion-models.md, image-generation-compared.md, image-editing-control.md and audio-generation-alms.md
// (MIT, © 2026 Rohit Ghumare, github.com/rohitg00/ai-engineering-from-scratch). Facts checked against the primary papers.

const topic: Topic = {
  id: 'generative-media',
  phase: 'multimodal',
  order: 4,
  title: 'Generative Media',
  subtitle:
    'Diffusion, image, video and audio generation for engineers: what a sampling step costs, how prompts and guidance steer it, how to edit and control outputs, why video is so expensive, how audio becomes tokens, and how to ship it with provenance and rights checks.',
  estimatedMinutes: 60,
  sources: [
    'Ho, Jain and Abbeel 2020 — Denoising Diffusion Probabilistic Models (DDPM): https://arxiv.org/abs/2006.11239',
    'Rombach et al. 2022 — High-Resolution Image Synthesis with Latent Diffusion Models (CVPR 2022): https://arxiv.org/abs/2112.10752',
    'Ho and Salimans 2022 — Classifier-Free Diffusion Guidance: https://arxiv.org/abs/2207.12598',
    'Peebles and Xie 2023 — Scalable Diffusion Models with Transformers (DiT, ICCV 2023): https://arxiv.org/abs/2212.09748',
    'Zhang, Rao and Agrawala 2023 — Adding Conditional Control to Text-to-Image Diffusion Models (ControlNet, ICCV 2023): https://arxiv.org/abs/2302.05543',
    'C2PA — Content Credentials Technical Specification (manifests, signatures, hard and soft bindings): https://c2pa.org/specifications/',
    'Song, Meng and Ermon 2021 — Denoising Diffusion Implicit Models (DDIM): https://arxiv.org/abs/2010.02502',
    'Meng et al. 2022 — SDEdit: Guided Image Synthesis and Editing with Stochastic Differential Equations: https://arxiv.org/abs/2108.01073',
    'Hu et al. 2021 — LoRA: Low-Rank Adaptation of Large Language Models: https://arxiv.org/abs/2106.09685',
    'Ho et al. 2022 — Video Diffusion Models: https://arxiv.org/abs/2204.03458',
    'Brooks et al. 2024 — Video generation models as world simulators (OpenAI Sora technical report)',
    'Défossez et al. 2022 — High Fidelity Neural Audio Compression (EnCodec): https://arxiv.org/abs/2210.13438',
    'Copet et al. 2023 — Simple and Controllable Music Generation (MusicGen): https://arxiv.org/abs/2306.05284',
    'ai-engineering-from-scratch (MIT, © 2026 Rohit Ghumare), Phase 8 lessons 06–11 and 13 and cheatsheets diffusion-models, image-generation-compared, image-editing-control, audio-generation-alms, adapted and rewritten. github.com/rohitg00/ai-engineering-from-scratch',
  ],
  tags: ['diffusion', 'image-generation', 'latent-diffusion', 'dit', 'cfg', 'controlnet', 'lora', 'inpainting', 'video-generation', 'audio-generation', 'c2pa', 'provenance'],
  cheatSheet: [
    'Diffusion: train a network to predict the noise added to data (DDPM: linear β from 1e-4 to 0.02, T = 1000); sample by starting from pure noise and removing predicted noise step by step.',
    'Cost of one image ≈ steps × passes per step × cost per pass. DDPM used 1000 steps; DDIM-style samplers 20–50; distilled few-step models 1–4. CFG doubles the passes per step.',
    'Latent diffusion denoises a VAE latent (512×512×3 → 64×64×4, 48× fewer values) and decodes to pixels once at the end. Denoiser = U-Net with cross-attention, or a DiT over latent patches.',
    'Text conditioning: a text encoder (CLIP, T5) produces token embeddings that cross-attention reads at every step. CLIP-only pipelines truncate prompts at 77 tokens.',
    'Classifier-free guidance: ε = ε_uncond + w·(ε_cond − ε_uncond). Trades diversity for prompt fidelity; Stable Diffusion pipelines default to w = 7.5; negative prompts replace the unconditional branch.',
    'Editing: img2img/SDEdit noises the input to strength × T and denoises back (0 = unchanged, 1 = new image); inpainting regenerates only the mask; ControlNet adds spatial control through a trainable copy joined by zero convolutions; LoRA adds a small low-rank delta that must match its base model.',
    'Video: denoise all frames jointly (temporal attention or spacetime patches) or they flicker. 10 s of 1080p at 24 fps is 240 frames ≈ 1.5 GB raw; serve it as an async job.',
    'Audio: neural codecs (SoundStream, EnCodec) turn waveforms into residual-VQ tokens; generate them autoregressively (AudioLM, VALL-E, MusicGen) or diffuse a continuous latent (Stable Audio). Real time needs tokens/s ≥ frame rate × codebooks.',
    'Ship it: cache by a hash of every generation parameter including the seed, moderate prompt and output, attach C2PA Content Credentials and an invisible watermark, block real-person likeness without consent, check the model licence.',
    'C2PA is signed metadata: it proves where an asset came from when present, but stripping it is easy and "no manifest" means unknown, not human-made.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'How diffusion works — noise, denoise, latents and what a step costs',
      steps: {
        actors: [
          { id: 'data', kind: 'data', label: 'Training image', sub: 'x_0', x: 110, y: 70 },
          { id: 'noise', kind: 'data', label: 'Noisy sample', sub: 'x_t at step t', x: 340, y: 70 },
          { id: 'net', kind: 'llm', label: 'Denoiser', sub: 'U-Net or DiT', x: 570, y: 70 },
          { id: 'loss', kind: 'metric', label: 'MSE loss', sub: 'ε vs predicted ε', x: 800, y: 70 },
          { id: 'vae', kind: 'tool', label: 'VAE', sub: 'pixels ⇄ latent', x: 110, y: 230 },
          { id: 'sampler', kind: 'server', label: 'Sampler', sub: 'DDIM, DPM-Solver', x: 340, y: 230 },
          { id: 'gpu', kind: 'metric', label: 'GPU bill', sub: 'steps × passes', x: 570, y: 230 },
          { id: 'img', kind: 'document', label: 'Image', sub: 'decoded once', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Training: add noise, predict it',
            lines: [
              'Pick a random step t and add Gaussian noise to a real image in **one jump**.',
              'The denoiser sees the noisy sample and t, and predicts the noise that was added.',
              'The loss is plain squared error, so training is stable (no adversarial game).',
            ],
            script: [
              { say: 0 },
              { send: ['data', 'noise'], label: '+ noise' },
              { say: 1 },
              { send: ['noise', 'net'], label: 'x_t, t' },
              { badge: 'net', text: 'predict ε' },
              { say: 2 },
              { send: ['net', 'loss'], label: 'ε̂', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: where does generation start?',
            lines: ['At inference there is no training image, only the trained denoiser.'],
            task: {
              type: 'choose',
              question: 'What does sampling start from?',
              options: [
                { text: 'Pure Gaussian noise, denoised step by step by the sampler' },
                { text: 'The closest training image', why: 'A diffusion model stores no images to look up; it learned to remove noise.' },
                { text: 'A blank grey canvas', why: 'Sampling starts from random noise, which is why a different seed gives a different image.' },
              ],
              answer: 0,
            },
            solved: 'Sampling starts at pure noise; each step removes a little predicted noise.',
            then: [
              { send: ['sampler', 'net'], label: 'x_T', count: 3 },
              { badge: 'sampler', text: 'step by step', tone: 'ok' },
            ],
          },
          {
            kind: 'watch',
            title: 'Latent diffusion moves the work',
            lines: [
              'A VAE encodes 512×512×3 pixels to a 64×64×4 latent: **48× fewer values**.',
              'Every denoising step runs on the latent.',
              'The VAE decoder renders pixels **once**, at the end.',
            ],
            script: [
              { say: 0 },
              { lit: 'vae' },
              { badge: 'vae', text: '48× smaller' },
              { say: 1 },
              { send: ['sampler', 'net'], label: 'latent', count: 3 },
              { say: 2 },
              { send: ['net', 'img'], label: 'decode', tone: 'ok', curve: true },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: what drives the bill?',
            lines: ['A pipeline runs 30 steps with classifier-free guidance (2 passes per step).'],
            task: {
              type: 'pick',
              question: 'Which part multiplies the GPU time per image?',
              answer: 'sampler',
              hints: {
                vae: 'The VAE decode runs once per image; it is not multiplied by the step count.',
                img: 'The output is the result, not the cost driver.',
                loss: 'The loss exists only at training time.',
              },
            },
            solved: '30 steps × 2 passes = 60 denoiser calls; the sampler settings set the bill.',
            then: [
              { send: ['sampler', 'gpu'], label: '60 calls', tone: 'err' },
              { badge: 'gpu', text: '60 passes', tone: 'err' },
            ],
          },
          {
            kind: 'watch',
            title: 'Fewer steps',
            lines: [
              'DDPM used 1000 steps; DDIM-style samplers use 20–50 with the same trained model.',
              'Distilled models (consistency, turbo, schnell-class) generate in 1–4 steps.',
            ],
            script: [
              { say: 0 },
              { badge: 'sampler', text: '1000 → 25' },
              { say: 1 },
              { badge: 'gpu', text: '1–4 steps', tone: 'ok' },
            ],
          },
        ],
      },
      body: `The intuition (a sculptor working back from static) and the classifier-free guidance formula are in [Multimodal and Vision](#/topic/multimodal-vision). This section is the engineer's view: what the model computes and what each image costs.

**Forward process (training only).** DDPM (Ho et al. 2020) adds Gaussian noise over T = 1000 steps with a linear schedule β from 1e-4 to 0.02. Because the noise is Gaussian there is a closed form, so training jumps straight to any step: x_t = √ᾱ_t·x_0 + √(1 − ᾱ_t)·ε, where ᾱ_t is the running product of (1 − β). The network gets x_t and t and predicts ε; the loss is the mean squared error between the true and predicted noise. No discriminator, no adversarial game: that is a big reason diffusion displaced GANs for quality.

**Reverse process (sampling).** Start from x_T ~ N(0, I) and repeatedly subtract a scaled noise prediction. DDPM took all 1000 steps. DDIM (Song et al. 2021) showed the same trained model can be sampled in 20–50 steps; later solvers (DPM-Solver family) need fewer. **Distilled** models (consistency, adversarial or rectified-flow distillation) get to 1–4 steps but must be trained for it. Swapping the sampler needs no retraining; reducing to 1–4 steps does.

**Latent diffusion** (Rombach et al. 2022). A VAE compresses 512×512×3 = 786,432 values to a 64×64×4 = 16,384-value latent (48× fewer). Every step runs on the latent and the decoder renders pixels once. This is what Stable Diffusion is.

**The denoiser.**
- **U-Net:** convolutional down/up path with skip connections, timestep embedding, and cross-attention layers that read the text embedding (Stable Diffusion 1.x and SDXL).
- **DiT** (Peebles and Xie 2023): cut the latent into p×p patches and run a transformer over them. A 32×32 latent with p = 2 is 256 tokens; halving p quadruples the tokens. They showed sample quality improves steadily with more transformer compute, so newer image and video models are transformer-based. Many also train with **flow matching / rectified flow**, which learns a near-straight path from noise to data and samples well in fewer steps.

**Cost model.** GPU time per image ≈ steps × passes per step × cost of one pass (+ one VAE decode). CFG makes passes per step 2. Every lever below targets one of those three factors.`,
      example: `**Budgeting one 1024×1024 image.**
- SDXL-class pipeline: 30 sampler steps with CFG → 30 × 2 = **60 denoiser passes** + 1 VAE decode.
- Same model with a faster solver at 20 steps → 40 passes (one third less GPU time, no retraining).
- A distilled 4-step model run without CFG → **4 passes**: 15× fewer than the first setup, at some cost in fine detail and prompt adherence.

**Why the forward jump works.** With the DDPM linear schedule, ᾱ at t = 1000 is about e^(−10), roughly 4×10⁻⁵, so √ᾱ_T ≈ 0.006: x_T is essentially pure noise, and the sampler can start from N(0, I) without ever seeing a real image.`,
      diagram: `training:  x_0 ──(+ε, jump to t)──► x_t ──► denoiser(x_t, t, text) ──► ε̂ ──► ‖ε − ε̂‖²
sampling:  x_T ~ N(0,I) ──► [denoiser → sampler step] × N steps ──► z_0 ──► VAE decode ──► image
cost ≈ N steps × (2 if CFG else 1) passes × cost(pass) + 1 decode`,
      prosCons: {
        pros: [
          'Simple, stable training objective (MSE on noise) that scales with data and compute.',
          'Sampler choice is decoupled from training, so you can trade steps for quality at serve time.',
          'Latent diffusion makes high resolutions affordable; DiT backbones scale like other transformers.',
        ],
        cons: [
          { con: 'Many sequential denoiser passes make each image slow compared with a one-pass generator.', fix: 'Use a faster solver (20–30 steps), or a distilled few-step model for interactive features, and measure quality on a fixed prompt set before switching.' },
          { con: 'Cost scales with resolution: DiT token count grows with the square of the side divided by the patch size.', fix: 'Generate at the model’s native resolution and upscale with a cheaper super-resolution model, rather than sampling at the final size.' },
          { con: 'The VAE bottleneck loses fine detail such as small text and faces.', fix: 'Overlay text in your app, use a face or detail refiner pass on the crop, or pick a model with a higher-capacity latent.' },
        ],
      },
      keyPoints: [
        'Training noises data in one closed-form jump and regresses the noise.',
        'Sampling: pure noise → N denoiser passes → VAE decode.',
        'Latent diffusion: 48× fewer values per step at 512×512.',
        'Cost ≈ steps × passes per step × cost per pass.',
      ],
      exercise: {
        prompt: `Implement the DDPM forward process.

- **alphaBars(T, betaStart, betaEnd)** returns ᾱ_t for t = 1..T with a linear β schedule.
- **noiseTo(x0, eps, aBar)** returns √ᾱ·x0 + √(1 − ᾱ)·eps element-wise.

Acceptance: with T = 1000, 1e-4 → 0.02, ᾱ_1 ≈ 0.9999 and ᾱ_1000 < 1e-4; noiseTo([1], [0], 1) = [1].`,
        starter: {
          language: 'typescript',
          code: `export function alphaBars(T: number, betaStart = 1e-4, betaEnd = 0.02): number[] {
  // TODO
  return [];
}

export function noiseTo(x0: number[], eps: number[], aBar: number): number[] {
  // TODO
  return x0;
}`,
        },
        hints: ['β_t = betaStart + (betaEnd − betaStart) × (t − 1) / (T − 1).', 'ᾱ_t is a running product of (1 − β_t): keep a cumulative variable.'],
        solution: {
          language: 'typescript',
          code: `export function alphaBars(T: number, betaStart = 1e-4, betaEnd = 0.02): number[] {
  const out: number[] = [];
  let cum = 1;
  for (let i = 0; i < T; i++) {
    const beta = betaStart + ((betaEnd - betaStart) * i) / (T - 1);
    cum *= 1 - beta;
    out.push(cum);
  }
  return out;
}

export function noiseTo(x0: number[], eps: number[], aBar: number): number[] {
  if (x0.length !== eps.length) throw new Error('shape mismatch');
  const a = Math.sqrt(aBar);
  const b = Math.sqrt(1 - aBar);
  return x0.map((x, i) => a * x + b * eps[i]);
}

const ab = alphaBars(1000);
console.log(ab[0].toFixed(4), ab[999].toExponential(1)); // 0.9999 ~4e-5
console.log(noiseTo([1], [0], 1)); // [1]`,
        },
        explanation: 'Because every step adds independent Gaussian noise, the composition is one Gaussian with mean √ᾱ_t·x_0 and variance 1 − ᾱ_t. Training samples a random t and uses this jump, so it never simulates the chain. At t = 1000 almost no signal remains, which is why sampling can start from pure noise.',
      },
      quickCheck: {
        question: 'A team swaps its 50-step DDIM sampler for a 25-step DPM-Solver on the same checkpoint. What else must they do?',
        options: [
          'Retrain the denoiser for the new sampler',
          'Nothing structural: samplers reuse the trained noise predictor; just re-check quality on a fixed prompt set',
          'Retrain the VAE, because the latent changes',
        ],
        correct: 1,
        explanation: 'The training objective (predict the noise) is shared by these samplers, so the scheduler can be swapped at serve time. Only distillation to 1–4 steps needs extra training. Always compare outputs on fixed prompts and seeds before switching.',
      },
      short: {
        id: 'diffusion-steps-are-the-bill',
        title: 'Every step is a GPU pass',
        beats: [
          {
            type: 'counter',
            kicker: 'DDPM · Ho et al. 2020',
            value: 1000,
            unit: 'denoising steps per image in the original paper',
            sub: 'Each step is a full pass through the denoiser.',
          },
          {
            type: 'flow',
            kicker: 'Latent diffusion · one image',
            head: 'Noise in, *image out*',
            steps: ['Pure noise latent, 64×64×4', 'Denoiser pass × N steps', 'Sampler removes predicted noise', 'VAE decodes pixels once'],
          },
          {
            type: 'counter',
            kicker: '512×512×3 pixels → 64×64×4 latent',
            value: 48,
            suffix: '×',
            unit: 'fewer values in every step',
            sub: 'That is why **latent** diffusion runs on one GPU.',
          },
          {
            type: 'ladder',
            kicker: 'Denoiser passes per image',
            head: 'Same prompt, *different bill*',
            rungs: [
              { label: '30 steps with CFG', amount: 60 },
              { label: '20 steps with CFG', amount: 40 },
              { label: 'Distilled, 4 steps, no CFG', amount: 4 },
            ],
            unit: 'passes',
          },
          {
            type: 'quiz',
            kicker: '30 steps, guidance on',
            head: 'Which change cuts GPU time per image the most?',
            options: [
              { text: 'A distilled 4-step model without CFG', why: '60 passes become 4: a 15× cut, if the quality holds on your prompts.' },
              { text: 'A faster VAE decoder', why: 'The decoder runs once per image; the 60 denoiser passes dominate.' },
              { text: 'A shorter prompt', why: 'The text is encoded once; it does not change the number of passes.' },
            ],
            answer: 0,
          },
        ],
        takeaway: { head: 'Steps × passes × cost per pass', sub: 'Cut **steps** first (solver, distillation), then passes (CFG), then the pass itself.' },
      },
      source: 'Ho et al. 2020 — DDPM; Song et al. 2021 — DDIM; Rombach et al. 2022 — Latent Diffusion; Peebles and Xie 2023 — DiT',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Conditioning and guidance — text encoders, CFG scale, seeds',
      steps: {
        actors: [
          { id: 'user', kind: 'user', label: 'Prompt', sub: 'text + negative', x: 110, y: 70 },
          { id: 'enc', kind: 'embedder', label: 'Text encoder', sub: 'CLIP / T5', x: 340, y: 70 },
          { id: 'net', kind: 'llm', label: 'Denoiser', sub: 'cross-attention', x: 570, y: 70 },
          { id: 'img', kind: 'document', label: 'Image', sub: 'seed 1234', x: 800, y: 70 },
          { id: 'cond', kind: 'data', label: 'ε_cond', sub: 'with prompt', x: 340, y: 230 },
          { id: 'uncond', kind: 'data', label: 'ε_uncond', sub: 'empty or negative', x: 570, y: 230 },
          { id: 'cfg', kind: 'metric', label: 'Guidance w', sub: 'default 7.5 in SD', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Text enters through cross-attention',
            lines: [
              'A frozen text encoder turns the prompt into token embeddings.',
              'Cross-attention layers in the denoiser read them **at every step**.',
              'CLIP text encoders stop at **77 tokens**; longer prompts are cut.',
            ],
            script: [
              { say: 0 },
              { send: ['user', 'enc'], label: 'prompt' },
              { say: 1 },
              { send: ['enc', 'net'], label: 'tokens', count: 3 },
              { say: 2 },
              { badge: 'enc', text: '77 tokens max', tone: 'miss' },
            ],
          },
          {
            kind: 'watch',
            title: 'Two predictions per step',
            lines: [
              'Classifier-free guidance runs the denoiser with and without the prompt.',
              'Both go in **one batch of 2**, so latency rises less than cost.',
              'The mix pushes away from the unconditional guess by w.',
            ],
            script: [
              { say: 0 },
              { send: ['net', 'cond'], label: 'with' },
              { send: ['net', 'uncond'], label: 'without', tone: 'miss' },
              { say: 1 },
              { badge: 'net', text: 'batch of 2' },
              { say: 2 },
              { send: ['cond', 'cfg'] },
              { send: ['uncond', 'cfg'] },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the negative prompt',
            lines: ['A user types the negative prompt "blurry, watermark".'],
            task: {
              type: 'pick',
              question: 'Which prediction does the negative prompt replace?',
              answer: 'uncond',
              hints: {
                cond: 'The positive prompt still drives ε_cond.',
                cfg: 'w is a number; the negative prompt is text that is encoded.',
                img: 'It changes the guidance direction, not the decoded image directly.',
              },
            },
            solved: 'The negative prompt replaces the empty prompt in the unconditional branch, so guidance pushes away from it.',
            then: [{ send: ['user', 'uncond'], label: 'negative', tone: 'ok', curve: true }],
          },
          {
            kind: 'turn',
            title: 'Your turn: reproduce a result',
            lines: ['Marketing loved image #4812 and wants a variant tomorrow.'],
            task: {
              type: 'choose',
              question: 'What must you have stored to regenerate it exactly?',
              options: [
                { text: 'Model and version, prompt and negative, seed, sampler, steps, w, size' },
                { text: 'Only the prompt', why: 'A new random seed gives a different image from the same prompt.' },
                { text: 'The prompt and the seed', why: 'A different sampler, step count, w or model version changes the output.' },
              ],
              answer: 0,
            },
            solved: 'Store every generation parameter, including the seed, with the image.',
            then: [{ badge: 'img', text: 'replayable', tone: 'ok' }],
          },
        ],
      },
      body: `**Text encoders.** The prompt is encoded once by a frozen text encoder and its token embeddings are read through **cross-attention** in every denoiser block, at every step. Stable Diffusion 1.x uses the CLIP ViT-L/14 text encoder; SDXL concatenates two CLIP encoders; Stable Diffusion 3 adds a T5-XXL encoder. Google's Imagen paper (Saharia et al. 2022) found that a larger text encoder improved image-text alignment more than a larger image model. Practical consequence: CLIP's text encoder has a **77-token** context, so in CLIP-only pipelines the end of a long prompt is silently dropped. Put the subject first.

**Classifier-free guidance (CFG)** (Ho and Salimans 2022). During training the prompt is replaced by an empty one for a small fraction of examples (10–20% in the paper), so one network learns both a conditional and an unconditional prediction. At sampling time you mix them: ε = ε_uncond + w·(ε_cond − ε_uncond). The paper's main finding is a **trade-off**: higher w gives better prompt fidelity and less diversity. Engineering notes:
- **Two passes per step.** Implementations batch the conditional and unconditional inputs, so cost doubles and latency rises less (if the GPU has headroom).
- **Default scale.** Hugging Face diffusers' Stable Diffusion pipelines default to guidance_scale = 7.5; newer flow-matching models are typically run lower, and guidance-distilled models are often run with CFG off. Read the model card rather than reusing one number.
- **Negative prompts** replace the empty prompt in the unconditional branch, so guidance pushes *away* from "blurry, watermark".
- Too high a scale gives oversaturated, burnt images; sweep w on fixed seeds.

**Seeds and reproducibility.** The starting noise comes from a seeded generator. Same model weights, sampler, step count, w, resolution, prompt, negative prompt and seed gives the same image on the same software stack; GPU kernels and library versions can still introduce small differences. Store **all** of these with every output: they are your cache key, your audit trail and how you regenerate a variant the customer liked.

**Other conditioning.** Image prompts (reference-image adapters), class labels and timing (audio length) enter the same way, as extra embeddings; spatial control is next section.`,
      example: `**One request, recorded.** A product shot is generated with: model sdxl-base-1.0, prompt "studio photo of a ceramic mug on oak table, softbox lighting", negative "text, watermark, blurry", seed 1234, sampler DPM-Solver multistep, 25 steps, w = 7.5, 1024×1024.

- Per step the denoiser runs a batch of 2 (conditional, unconditional) → 50 passes per image.
- Sweeping w ∈ {3, 5, 7.5, 10} on seed 1234 shows the trade-off: at the low end the oak table may drop out of some images, at the high end colours start to burn; the team pins the value that looks best on its fixed seeds for this model.
- The next day, replaying the stored record reproduces the same image on the same stack, and changing only the seed produces variants of the approved composition.`,
      prosCons: {
        pros: [
          'CFG needs no separate classifier: one network gives both predictions.',
          'One knob (w) trades prompt fidelity for diversity at serve time.',
          'Seeded generation makes outputs replayable for audits, caching and variants.',
        ],
        cons: [
          { con: 'CFG doubles denoiser compute per step.', fix: 'Use a guidance-distilled model, apply guidance only in some steps if your pipeline supports it, or accept it and cut steps instead.' },
          { con: 'Long prompts are silently truncated by CLIP text encoders.', fix: 'Count tokens with the encoder’s tokenizer before sending, put the subject first, or use a model with a long-context T5 encoder.' },
          { con: 'Bit-exact reproducibility can break across GPUs, drivers or library versions.', fix: 'Pin model, library and container versions in the stored record, and keep the original output rather than relying on regeneration.' },
        ],
      },
      keyPoints: [
        'The prompt is encoded once and read by cross-attention at every step.',
        'CFG: two predictions per step, mixed by w; fidelity vs diversity.',
        'Negative prompt = the unconditional branch.',
        'Store every parameter and the seed with each output.',
      ],
      exercise: {
        prompt: `Write **generationKey(params)** that returns a stable SHA-256 hex key for a generation request, for caching and audit.

- Keys must not depend on object property order.
- Missing seed is an error (an unseeded request cannot be cached or replayed).
- Prompt whitespace is normalised (trim, collapse spaces) before hashing.

Acceptance: { prompt: 'a  mug', seed: 1, w: 7 } and { w: 7, seed: 1, prompt: 'a mug ' } give the same key; changing the seed changes it.`,
        hints: ['Sort the keys before JSON.stringify.', 'Use createHash from node:crypto.'],
        solution: {
          language: 'typescript',
          code: `import { createHash } from 'node:crypto';

type GenParams = { prompt: string; seed?: number; [k: string]: unknown };

export function generationKey(params: GenParams): string {
  if (!Number.isInteger(params.seed)) throw new Error('seed is required for a cacheable, replayable request');
  const norm: Record<string, unknown> = { ...params, prompt: params.prompt.trim().replace(/\\s+/g, ' ') };
  const canonical = JSON.stringify(Object.keys(norm).sort().map((k) => [k, norm[k]]));
  return createHash('sha256').update(canonical).digest('hex');
}

const a = generationKey({ prompt: 'a  mug', seed: 1, w: 7 });
const b = generationKey({ w: 7, seed: 1, prompt: 'a mug ' });
console.log(a === b, a === generationKey({ prompt: 'a mug', seed: 2, w: 7 })); // true false`,
        },
        explanation: 'Sorting keys makes the hash independent of property order, and normalising the prompt avoids cache misses on whitespace. Requiring a seed is the important rule: without it the same parameters produce different images, so a cache hit would return an image the request did not really specify.',
      },
      quickCheck: {
        question: 'A user adds the negative prompt "text, watermark". What changes inside classifier-free guidance?',
        options: [
          'A third denoiser pass is added for the negative prompt',
          'The negative prompt’s embedding replaces the empty prompt in the unconditional prediction',
          'The negative prompt is appended to the positive prompt with a minus sign',
        ],
        correct: 1,
        explanation: 'Guidance extrapolates away from the unconditional prediction. Conditioning that branch on the negative prompt makes the push go away from "text, watermark", with the same two passes per step.',
      },
      source: 'Ho and Salimans 2022 — Classifier-Free Diffusion Guidance; Rombach et al. 2022 — Latent Diffusion; Saharia et al. 2022 — Imagen',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Control and editing — img2img, inpainting, ControlNet and LoRA',
      steps: {
        actors: [
          { id: 'src', kind: 'document', label: 'Source image', sub: 'product photo', x: 110, y: 70 },
          { id: 'mask', kind: 'guard', label: 'Mask', sub: 'white = regenerate', x: 340, y: 70 },
          { id: 'net', kind: 'llm', label: 'Frozen base', sub: 'diffusion model', x: 570, y: 70 },
          { id: 'out', kind: 'document', label: 'Edited image', sub: 'rest kept', x: 800, y: 70 },
          { id: 'edges', kind: 'data', label: 'Edge or pose map', sub: 'canny, depth, pose', x: 110, y: 230 },
          { id: 'cn', kind: 'tool', label: 'ControlNet', sub: 'trainable copy', x: 340, y: 230 },
          { id: 'lora', kind: 'tool', label: 'LoRA', sub: 'W + B·A', x: 570, y: 230 },
          { id: 'strength', kind: 'metric', label: 'Strength', sub: '0 keep · 1 new', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'img2img: start halfway',
            lines: [
              'Encode the source, add noise up to **strength × T**, and denoise from there.',
              'Strength 0 returns the input; strength 1 is a fresh image.',
              'With 30 steps and strength 0.6, only 18 steps run.',
            ],
            script: [
              { say: 0 },
              { send: ['src', 'net'], label: 'noised' },
              { say: 1 },
              { lit: 'strength' },
              { say: 2 },
              { badge: 'strength', text: '0.6 → 18 steps' },
              { send: ['net', 'out'], tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: change only the background',
            lines: ['Keep the product pixel-exact, replace the kitchen with a beach.'],
            task: {
              type: 'pick',
              question: 'Which input makes the model regenerate only part of the image?',
              answer: 'mask',
              hints: {
                strength: 'img2img strength changes the whole image a little; it cannot protect the product.',
                lora: 'A LoRA changes style or subject everywhere, not one region.',
                edges: 'An edge map controls layout, not which pixels may change.',
              },
            },
            solved: 'Inpainting: the mask marks what to regenerate; pixels outside it are kept.',
            then: [
              { send: ['mask', 'net'], label: 'mask' },
              { badge: 'out', text: 'product kept', tone: 'ok' },
            ],
          },
          {
            kind: 'watch',
            title: 'ControlNet: layout from a map',
            lines: [
              'A **trainable copy** of the encoder reads an edge, depth or pose map.',
              'It joins the frozen model through **zero convolutions**.',
              'At the start of training it adds nothing, so the base is never damaged.',
            ],
            script: [
              { say: 0 },
              { send: ['edges', 'cn'], label: 'pose' },
              { say: 1 },
              { send: ['cn', 'net'], label: 'features', curve: true },
              { say: 2 },
              { badge: 'cn', text: 'starts at zero', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the brand style',
            lines: ['Every image must match the brand illustration style, learned from about 30 approved images.'],
            task: {
              type: 'choose',
              question: 'Which tool fits?',
              options: [
                { text: 'A LoRA trained on the approved images, loaded on the matching base model' },
                { text: 'ControlNet', why: 'ControlNet fixes spatial structure (edges, pose, depth), not a visual style.' },
                { text: 'Inpainting', why: 'Inpainting picks which region changes; it does not teach a style.' },
              ],
              answer: 0,
            },
            solved: 'Style or subject → LoRA; layout → ControlNet; region → inpainting; how much to change → strength.',
            then: [
              { send: ['lora', 'net'], label: 'low-rank Δ' },
              { badge: 'lora', text: 'same base only', tone: 'miss' },
            ],
          },
        ],
      },
      body: `Most product features are **edits**, not text-to-image from scratch. Four tools cover nearly all of them, and they compose.

**img2img (SDEdit, Meng et al. 2022).** Encode the source image, add noise up to step strength × T, and run the sampler from there. Low strength keeps structure and colours; high strength keeps only coarse layout; 1.0 ignores the input. In diffusers, only steps × strength denoising steps run, so img2img at strength 0.6 is also cheaper than a full generation. Typical use: restyle a sketch or photo.

**Inpainting and outpainting.** A mask marks what to regenerate (white) and what to keep. Two ways: (a) with any model, re-inject the noised source into the unmasked area at every step; (b) a dedicated inpainting checkpoint whose U-Net takes **9 input channels** (4 noisy latent, 4 masked-image latent, 1 mask), which sees the context and blends better. Dilate the mask by a few pixels to hide seams, and describe the **whole** scene in the prompt, not only the new object. Outpainting is the same with the mask inverted onto an extended canvas.

**ControlNet** (Zhang et al. 2023). Make a trainable copy of the denoiser's encoder, feed it a condition image (Canny edges, depth, human pose, scribble, segmentation), and add its outputs to the frozen model through **zero-initialised 1×1 convolutions**. At the start of training the control branch contributes exactly zero, so it cannot damage the pretrained model, and it trains well even on small datasets. Use it when composition must be exact. Each active ControlNet adds a large network to every step, so it raises the cost per pass; when stacking two, lower their weights so they do not overshoot.

**LoRA adapters** (Hu et al. 2021, applied to diffusion attention layers). Freeze W and learn W + B·A with a small rank r, so a style or subject adapter is a small file (megabytes, not gigabytes). Rules that save incidents: a LoRA works only on the **base model family it was trained on**; keep the adapter scale moderate (very high scales distort); and for multi-tenant serving, load adapters per request rather than fusing them into the base weights. Training details are in [Fine-Tuning](#/topic/fine-tuning).

**Choosing.** How much may change → strength. Where may it change → mask. Exact layout or pose → ControlNet. Style, product or character → LoRA (or a reference-image adapter when you have only one image).`,
      example: `**Background swap for an e-commerce catalogue.**
1. Segment the product to get a mask; invert it so the **background** is white; dilate by 8–16 px.
2. Inpaint with an inpainting checkpoint: prompt "product on white marble, soft daylight, minimal", w ≈ 6, 25 steps.
3. Add a depth ControlNet at weight 0.5 so the new surface lines up with the product's perspective.
4. Load the brand LoRA (trained on ~30 approved shots, same base model) at scale 0.8.

Outcome checks: the product pixels outside the mask are unchanged (a diff of the unmasked region should be zero after compositing back), the seam is invisible at 100% zoom, and the style matches the brand board.`,
      prosCons: {
        pros: [
          'Edits keep what the customer already approved instead of rolling the dice on a whole new image.',
          'ControlNet gives deterministic layout and pose control without retraining the base model.',
          'LoRA adapters are small, cheap to train and can be swapped per request on one base model.',
        ],
        cons: [
          { con: 'Visible seams or colour shifts at the mask edge.', fix: 'Dilate and feather the mask, use a dedicated inpainting checkpoint, and composite the original pixels back outside the mask.' },
          { con: 'A LoRA trained on a different base family silently does nothing or degrades output.', fix: 'Store the base model id with every adapter and refuse to load an adapter whose base does not match the serving model.' },
          { con: 'Each ControlNet adds per-step compute, and stacked controls can overshoot.', fix: 'Enable only the controls a request needs, keep combined weights around 1.0, and budget latency per active control.' },
        ],
      },
      keyPoints: [
        'Strength = how much changes; img2img runs steps × strength steps.',
        'Mask = where it changes; inpainting keeps the rest.',
        'ControlNet = layout/pose via a trainable copy and zero convolutions.',
        'LoRA = style/subject; must match its base model.',
      ],
      exercise: {
        prompt: `Write two helpers for an editing service.

1. **img2imgPlan(steps, strength)** → { stepsRun, startIndex } where stepsRun = min(floor(steps × strength), steps) and startIndex = steps − stepsRun. Throw if strength is outside [0, 1].
2. **dilate(mask, r)** for a 2-D boolean mask: a pixel becomes true if any pixel within Chebyshev distance r is true.

Acceptance: img2imgPlan(30, 0.6) → { stepsRun: 18, startIndex: 12 }; dilating a single true pixel by 1 gives a 3×3 block.`,
        hints: ['Use Math.floor for the step count, as diffusers does.', 'For dilate, loop over the neighbourhood with bounds checks; do not modify the input array while reading it.'],
        solution: {
          language: 'typescript',
          code: `export function img2imgPlan(steps: number, strength: number) {
  if (!(strength >= 0 && strength <= 1)) throw new Error('strength must be in [0, 1]');
  const stepsRun = Math.min(Math.floor(steps * strength), steps);
  return { stepsRun, startIndex: steps - stepsRun };
}

export function dilate(mask: boolean[][], r: number): boolean[][] {
  const h = mask.length;
  const w = mask[0]?.length ?? 0;
  const out = mask.map((row) => row.map(() => false));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) out[yy][xx] = true;
        }
    }
  return out;
}

console.log(img2imgPlan(30, 0.6)); // { stepsRun: 18, startIndex: 12 }
const m = [[false, false, false], [false, true, false], [false, false, false]];
console.log(dilate(m, 1).flat().every(Boolean)); // true`,
        },
        explanation: 'img2img skips the first part of the schedule because the input already provides the coarse structure, which is also why it is cheaper. Dilation grows the regenerated area slightly past the object edge so the model can blend the boundary instead of leaving a hard seam.',
      },
      quickCheck: {
        question: 'A user wants the same pose as a reference photo but a completely different character and style. Which combination fits?',
        options: [
          'Pose ControlNet from the reference + a prompt (and optionally a style LoRA)',
          'img2img on the reference at strength 0.2',
          'Inpainting the reference with an all-white mask and no other control',
        ],
        correct: 0,
        explanation: 'ControlNet transfers spatial structure such as pose without copying appearance. img2img at low strength keeps the old character and colours; an all-white mask is just a fresh generation with no pose control.',
      },
      source: 'Zhang et al. 2023 — ControlNet; Meng et al. 2022 — SDEdit; Hu et al. 2021 — LoRA; Rombach et al. 2022 — inpainting model',
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'Video generation — temporal consistency and the cost of time',
      steps: {
        actors: [
          { id: 'user', kind: 'user', label: 'Brief', sub: 'prompt + first frame', x: 110, y: 70 },
          { id: 'api', kind: 'server', label: 'Job API', sub: '202 + job id', x: 340, y: 70 },
          { id: 'queue', kind: 'data', label: 'Queue', sub: 'GPU workers', x: 570, y: 70 },
          { id: 'clip', kind: 'document', label: 'Clip', sub: 'stored + webhook', x: 800, y: 70 },
          { id: 'frames', kind: 'data', label: 'Per-frame', sub: 'independent noise', x: 110, y: 230 },
          { id: 'dit', kind: 'llm', label: 'Video model', sub: 'space + time attn', x: 340, y: 230 },
          { id: 'cost', kind: 'metric', label: 'Tokens', sub: 'T × H × W patches', x: 570, y: 230 },
          { id: 'qa', kind: 'judge', label: 'Frame QA', sub: 'flicker, identity', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Why frame-by-frame flickers',
            lines: [
              'Running an image model per frame draws **independent noise** for each frame.',
              'Shapes, lighting and identity drift from frame to frame: flicker.',
            ],
            script: [
              { say: 0 },
              { send: ['frames', 'dit'], label: 'frame 1..N', count: 3, tone: 'miss' },
              { say: 1 },
              { badge: 'frames', text: 'flicker', tone: 'err' },
            ],
          },
          {
            kind: 'watch',
            title: 'Denoise the frames together',
            lines: [
              'Video models denoise all frames **jointly**: temporal attention or spacetime patches.',
              'Tokens = frames × height × width in patches, so cost grows with duration **and** resolution.',
              'Factorised attention (space, then time) avoids full 3-D attention.',
            ],
            script: [
              { say: 0 },
              { lit: 'dit' },
              { badge: 'dit', text: 'joint denoise', tone: 'ok' },
              { say: 1 },
              { send: ['dit', 'cost'], label: 'tokens' },
              { say: 2 },
              { badge: 'cost', text: 'space × time' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: serving it',
            lines: ['Generating a 5-second clip takes minutes of GPU time.'],
            task: {
              type: 'choose',
              question: 'How should the API return it?',
              options: [
                { text: 'Accept the job (202 + id), run it on a queue, notify by webhook or polling' },
                { text: 'Hold the HTTP request open until the clip is ready', why: 'Gateways and clients time out long before minutes; retries then start duplicate GPU jobs.' },
                { text: 'Stream frames as they are generated', why: 'Joint denoising finishes all frames together; there is no early frame to stream.' },
              ],
              answer: 0,
            },
            solved: 'Video is a background job: idempotent submit, queue, store, notify.',
            then: [
              { send: ['user', 'api'], label: 'submit' },
              { send: ['api', 'queue'], label: 'job' },
              { send: ['queue', 'clip'], label: 'done', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: before release',
            lines: ['A clip finished rendering. Something must check it before a customer sees it.'],
            task: {
              type: 'pick',
              question: 'Which part catches identity drift and flicker?',
              answer: 'qa',
              hints: {
                cost: 'Token counts predict cost, not quality.',
                api: 'The API accepts jobs; it does not inspect frames.',
                queue: 'The queue schedules work; it does not judge it.',
              },
            },
            solved: 'Sample frames and check consistency, safety and provenance before release.',
            then: [{ send: ['clip', 'qa'], label: 'frames' }, { badge: 'qa', text: 'pass', tone: 'ok' }],
          },
        ],
      },
      body: `Understanding video (frame sampling, transcripts) is in [Audio and Video](#/topic/audio-video). Generating it is the same diffusion idea with one more axis, and that axis is what makes it hard.

**Temporal consistency.** Run an image model on each frame and every frame gets independent noise, so objects, lighting and faces change between frames: **flicker**. Video models couple the frames so they are denoised together:
- **Space-time U-Nets** with temporal attention layers (Ho et al. 2022, Video Diffusion Models).
- **Latent video models** that insert temporal layers into a pretrained image latent diffusion model and fine-tune on video (Blattmann et al. 2023).
- **Spacetime-patch transformers**: a video VAE compresses frames in space and time, the latent is cut into spacetime patches, and a DiT denoises the whole sequence. OpenAI's Sora report (2024) describes this approach, plus training on detailed re-generated captions.

**Why it costs so much.** Raw 10 s of 1080p at 24 fps is 240 × 1920 × 1080 × 3 ≈ 1.5 GB. Even after VAE compression, the token count is frames × height × width (in patches), so doubling duration doubles tokens, and attention cost grows faster than tokens. Full 3-D attention over N tokens costs on the order of N²; **factorised** attention (within each frame, then across frames at each position) cuts this to roughly S·T² + T·S² for S spatial positions and T time steps. Training and inference both run far above image models at the same quality bar, which is why products cap clips at seconds and resolutions at 720p–1080p.

**Controls you will meet.** Text-to-video, **image-to-video** (the first frame is given, so the subject is fixed), keyframes, camera and motion hints, and video-to-video edits. Long clips drift; generate shorter segments anchored on the last frame or keyframes.

**Serving.** A clip takes from tens of seconds to many minutes of GPU time, so treat it as a background job: accept with 202 and a job id, use an idempotency key so client retries do not start duplicate renders, queue on GPU workers, store the result, notify by webhook or polling (see [Reliability and Async](#/topic/reliability-async)). Check frames before release: consistency, safety classification, provenance.`,
      example: `**Token arithmetic for one clip.** 5 s at 24 fps, 1280×720. Assume a video VAE that compresses 8× in each spatial dimension and 4× in time, and 2×2 spatial patches.
- Latent: 120 frames / 4 = 30 time steps; 160 × 90 positions → patches 80 × 45 = 3,600 per time step.
- Tokens N = 30 × 3,600 = **108,000**.
- Full attention ∝ N² ≈ 1.2 × 10¹⁰ pairs per layer; factorised ∝ S·T² + T·S² = 3,600 × 900 + 30 × 3,600² ≈ 3.9 × 10⁸, about **30× fewer**.
- Doubling the clip to 10 s doubles T: full attention grows 4×, factorised spatial cost grows about 2×.

That is why a 10 s clip costs much more than two separate 5 s clips joined at a keyframe.`,
      prosCons: {
        pros: [
          'Joint denoising gives temporally consistent motion that per-frame generation cannot.',
          'Image-to-video and keyframes give strong control over subject and composition.',
          'The same diffusion and DiT machinery (and many tricks) carries over from images.',
        ],
        cons: [
          { con: 'Very high GPU cost and minutes of latency per clip.', fix: 'Run as async jobs with quotas, preview at low resolution and few steps, and render the final only after approval.' },
          { con: 'Long clips drift: identity and physics degrade over time.', fix: 'Generate short segments conditioned on the previous segment’s last frame or on keyframes, and check identity across segments.' },
          { con: 'Client retries on a slow endpoint start duplicate expensive renders.', fix: 'Require an idempotency key on submit and return the existing job for a repeated key.' },
        ],
      },
      keyPoints: [
        'Per-frame image generation flickers; video models denoise frames jointly.',
        'Tokens = time × height × width patches; attention cost grows faster.',
        'Factorised space/time attention avoids full 3-D attention.',
        'Serve video as an idempotent async job with frame QA.',
      ],
      exercise: {
        prompt: `Write **videoTokens(opts)** and **attentionCost(opts)** for capacity planning.

- Inputs: seconds, fps, width, height, spatial VAE factor, temporal VAE factor, patch size (spatial).
- videoTokens returns { T, S, N } with T latent time steps, S patches per step, N = T × S (use Math.ceil at each division).
- attentionCost returns { full: N², factorised: S·T² + T·S², ratio }.

Acceptance: 5 s, 24 fps, 1280×720, factors 8 and 4, patch 2 → T = 30, S = 3600, N = 108000.`,
        hints: ['frames = seconds × fps; T = ceil(frames / temporal).', 'Spatial patches: ceil(width / spatial / patch) × ceil(height / spatial / patch).'],
        solution: {
          language: 'typescript',
          code: `type VideoOpts = { seconds: number; fps: number; width: number; height: number; spatial: number; temporal: number; patch: number };

export function videoTokens(o: VideoOpts) {
  const T = Math.ceil((o.seconds * o.fps) / o.temporal);
  const S = Math.ceil(o.width / o.spatial / o.patch) * Math.ceil(o.height / o.spatial / o.patch);
  return { T, S, N: T * S };
}

export function attentionCost(o: VideoOpts) {
  const { T, S, N } = videoTokens(o);
  const full = N * N;
  const factorised = S * T * T + T * S * S;
  return { full, factorised, ratio: full / factorised };
}

const clip = { seconds: 5, fps: 24, width: 1280, height: 720, spatial: 8, temporal: 4, patch: 2 };
console.log(videoTokens(clip)); // { T: 30, S: 3600, N: 108000 }
console.log(attentionCost(clip).ratio.toFixed(0)); // ~30`,
        },
        explanation: 'Planning video capacity is mostly token arithmetic. The ratio shows why factorised attention is standard: full attention is quadratic in all tokens, while factorised attention is quadratic only within one frame or one position over time.',
      },
      quickCheck: {
        question: 'Why does generating each frame of a video separately with an image model give a flickering result?',
        options: [
          'Each frame starts from independent noise and nothing ties the frames together',
          'The VAE cannot decode more than one frame per second',
          'Classifier-free guidance only works on still images',
        ],
        correct: 0,
        explanation: 'Without a temporal coupling (temporal attention, spacetime patches or shared conditioning), every frame is a separate sample, so details change from frame to frame. Video models denoise frames jointly to keep them consistent.',
      },
      source: 'Ho et al. 2022 — Video Diffusion Models; Blattmann et al. 2023 — Align your Latents; Brooks et al. 2024 — Sora technical report',
    },
    // ---------------------------------------------------------------- 5
    {
      heading: 'Audio, speech and music generation — codec tokens and audio diffusion',
      steps: {
        actors: [
          { id: 'wave', kind: 'data', label: 'Waveform', sub: '24–48 kHz samples', x: 110, y: 70 },
          { id: 'codec', kind: 'tool', label: 'Neural codec', sub: 'EnCodec, SoundStream', x: 340, y: 70 },
          { id: 'tokens', kind: 'data', label: 'RVQ tokens', sub: '75 Hz × codebooks', x: 570, y: 70 },
          { id: 'lm', kind: 'llm', label: 'Token model', sub: 'VALL-E, MusicGen', x: 800, y: 70 },
          { id: 'prompt', kind: 'user', label: 'Text prompt', sub: 'or voice sample', x: 110, y: 230 },
          { id: 'diff', kind: 'llm', label: 'Audio diffusion', sub: 'continuous latent', x: 340, y: 230 },
          { id: 'rate', kind: 'metric', label: 'Real-time rate', sub: 'tokens/s needed', x: 570, y: 230 },
          { id: 'consent', kind: 'guard', label: 'Consent check', sub: 'voice owner', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Audio becomes tokens',
            lines: [
              'A neural codec encodes audio into frames (EnCodec 24 kHz: **75 per second**).',
              'Residual vector quantisation turns each frame into several codebook indices.',
              '8 codebooks × 75 Hz = **600 tokens per second** of audio.',
            ],
            script: [
              { say: 0 },
              { send: ['wave', 'codec'], label: 'samples' },
              { say: 1 },
              { send: ['codec', 'tokens'], label: 'RVQ', count: 3 },
              { say: 2 },
              { badge: 'tokens', text: '600 tok/s' },
            ],
          },
          {
            kind: 'watch',
            title: 'Two generator families',
            lines: [
              'Token models predict codec tokens like a language model, then the codec decodes them.',
              'Diffusion models denoise a continuous audio latent (Stable Audio).',
            ],
            script: [
              { say: 0 },
              { send: ['prompt', 'lm'], label: 'text', curve: true },
              { send: ['lm', 'tokens'], label: 'next tokens', tone: 'ok' },
              { say: 1 },
              { send: ['prompt', 'diff'], label: 'text + length' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: can it stream?',
            lines: ['A speech model needs 8 codebooks at 75 Hz. The GPU produces 450 tokens/s per user.'],
            task: {
              type: 'choose',
              question: 'Can it play audio in real time?',
              options: [
                { text: 'No: it needs 600 tokens/s; it falls behind by 25%' },
                { text: 'Yes: 450 is more than 75', why: 'Each audio frame needs one token per codebook: 8 × 75 = 600 tokens per second.' },
                { text: 'Yes, if the codec decodes faster', why: 'Decoding speed does not help when the generator itself cannot keep up.' },
              ],
              answer: 0,
            },
            solved: 'Real time needs generated tokens/s ≥ frame rate × codebooks.',
            then: [{ badge: 'rate', text: '450 < 600', tone: 'err' }],
          },
          {
            kind: 'turn',
            title: 'Your turn: cloning a voice',
            lines: ['A customer uploads 3 seconds of a celebrity interview and asks for a voiceover in that voice.'],
            task: {
              type: 'pick',
              question: 'Which part must stop this request?',
              answer: 'consent',
              hints: {
                lm: 'A model like VALL-E will happily clone from a 3-second sample; capability is the risk.',
                codec: 'The codec just encodes audio; it has no policy.',
                rate: 'Throughput is irrelevant to whether this is allowed.',
              },
            },
            solved: 'Voice cloning needs verified consent from the voice owner, plus labels and watermarks on the output.',
            then: [{ badge: 'consent', text: 'blocked', tone: 'err' }],
          },
        ],
      },
      body: `Speech-to-text, TTS voices and voice-agent latency are covered in [Audio and Video](#/topic/audio-video). This section is about how audio **generators** work, at the level you need to pick and run one.

**Codec tokens.** A raw waveform has tens of thousands of samples per second, too many to model directly. **Neural audio codecs** (SoundStream, Zeghidour et al. 2021; EnCodec, Défossez et al. 2022) encode audio into a lower-rate sequence of frames, then quantise each frame with **residual vector quantisation (RVQ)**: the first codebook captures the coarse signal, each next codebook the remaining error. EnCodec's 24 kHz model produces 75 frames per second; with 8 codebooks that is 600 tokens per second. More codebooks = higher bitrate and fidelity, more tokens to generate.

**Token-autoregressive generators.** Treat codec tokens like text tokens:
- **AudioLM** (Borsos et al. 2022) generates semantic tokens, then acoustic codec tokens.
- **VALL-E** (Wang et al. 2023) does text-to-speech as language modelling over codec tokens and can imitate a voice from a **3-second** enrolment recording. That capability is exactly why consent controls matter.
- **MusicGen** (Copet et al. 2023) generates music from text (optionally a melody) with one transformer over 4 EnCodec codebooks at 32 kHz, using a delay pattern to interleave codebooks instead of cascading models.

**Diffusion and flow generators.** Denoise a continuous audio latent instead of predicting tokens. **Stable Audio** (Evans et al. 2024) is a latent diffusion model conditioned on text and on timing (start and total seconds), so it can produce a requested length. These suit music and sound effects where the whole clip is generated at once.

**Engineering constraints.**
- **Streaming:** for real-time speech the generator must produce at least frame rate × codebooks tokens per second per user, plus time to first audio; slower and playback stutters.
- **Evaluation:** listen tests and preference ratings remain the reference; Fréchet Audio Distance compares embedding statistics of generated and real audio, and speech is also checked by transcribing it (word error rate) and by speaker similarity.
- **Rights and safety:** clone a voice only with recorded, verifiable consent; disclose synthetic voices; watermark output; check that music output and training data licences allow your use.`,
      example: `**Sizing a voiceover service.** A token-based TTS model emits 8 codebooks at 75 Hz (600 tokens per second of speech).
- One 30-second voiceover = 30 × 600 = **18,000 tokens** to generate.
- A GPU that generates 3,000 tokens/s across its batch can serve 3,000 / 600 = **5 real-time streams**, or render one 30 s clip offline in about 6 s.
- Using 4 codebooks instead of 8 halves the rate to 4 × 75 = 300 tokens per second of audio and doubles concurrent streams to 10, at a lower bitrate and audible quality loss on music.

**Consent record** stored with each custom voice: speaker id, signed consent, allowed uses, expiry, sample hash.`,
      prosCons: {
        pros: [
          'Codec tokens let audio reuse language-model machinery: batching, caching, sampling controls.',
          'Short enrolment samples make custom voices cheap to create.',
          'Latent diffusion with timing conditioning produces music and sound effects of a requested length.',
        ],
        cons: [
          { con: 'Token rate (frame rate × codebooks) can exceed what one GPU generates per user in real time.', fix: 'Use fewer codebooks for speech, a smaller or distilled model, or a delay-pattern model; measure tokens/s per stream before launch.' },
          { con: 'A few seconds of audio is enough to imitate someone, enabling impersonation and fraud.', fix: 'Require verified consent from the voice owner, block known public figures, watermark and label synthetic audio, and log every generation.' },
          { con: 'Generated music can echo copyrighted material or rely on unclear training-data licences.', fix: 'Choose models whose licence and training data allow commercial use, and run similarity checks against reference catalogues where available.' },
        ],
      },
      keyPoints: [
        'Neural codecs + RVQ turn audio into tokens (EnCodec 24 kHz: 75 frames/s).',
        'Token models (AudioLM, VALL-E, MusicGen) vs latent diffusion (Stable Audio).',
        'Real time needs tokens/s ≥ frame rate × codebooks.',
        'Voice cloning needs verified consent and watermarks.',
      ],
      exercise: {
        prompt: `Write **streamPlan(frameRateHz, codebooks, genTokensPerSec)** returning { tokensPerAudioSecond, realTimeFactor, streams } where realTimeFactor = genTokensPerSec / tokensPerAudioSecond (≥ 1 means real time) and streams = floor of it.

Acceptance: streamPlan(75, 8, 450) → { tokensPerAudioSecond: 600, realTimeFactor: 0.75, streams: 0 }; streamPlan(75, 8, 3000).streams = 5. Throw on non-positive inputs.`,
        hints: ['tokensPerAudioSecond = frameRateHz × codebooks.', 'Validate inputs before dividing.'],
        solution: {
          language: 'typescript',
          code: `export function streamPlan(frameRateHz: number, codebooks: number, genTokensPerSec: number) {
  if (!(frameRateHz > 0 && codebooks > 0 && genTokensPerSec > 0)) throw new Error('inputs must be positive');
  const tokensPerAudioSecond = frameRateHz * codebooks;
  const realTimeFactor = genTokensPerSec / tokensPerAudioSecond;
  return { tokensPerAudioSecond, realTimeFactor, streams: Math.floor(realTimeFactor) };
}

console.log(streamPlan(75, 8, 450)); // { tokensPerAudioSecond: 600, realTimeFactor: 0.75, streams: 0 }
console.log(streamPlan(75, 8, 3000).streams); // 5`,
        },
        explanation: 'Every second of audio needs one token per codebook per frame. If the generator produces fewer than that per second, playback must wait; a factor of 0.75 means each second of speech takes about 1.33 s to make, so a live stream stutters.',
      },
      quickCheck: {
        question: 'What does residual vector quantisation do in a neural audio codec?',
        options: [
          'Each codebook quantises the error left by the previous ones, so more codebooks add finer detail',
          'It removes silence before encoding',
          'It converts audio into a mel spectrogram image for a diffusion model',
        ],
        correct: 0,
        explanation: 'RVQ stacks quantisers: the first captures the coarse signal and each next one encodes the residual. Bitrate, fidelity and the number of tokens to generate all grow with the number of codebooks.',
      },
      source: 'Défossez et al. 2022 — EnCodec; Wang et al. 2023 — VALL-E; Copet et al. 2023 — MusicGen; Evans et al. 2024 — Stable Audio',
    },
    // ---------------------------------------------------------------- 6
    {
      heading: 'Shipping generative media safely — cost, latency, provenance and rights',
      steps: {
        actors: [
          { id: 'user', kind: 'user', label: 'Customer', sub: 'prompt + uploads', x: 110, y: 70 },
          { id: 'pre', kind: 'guard', label: 'Input checks', sub: 'policy, likeness', x: 340, y: 70 },
          { id: 'cache', kind: 'cache', label: 'Cache', sub: 'hash of params', x: 570, y: 70 },
          { id: 'gpu', kind: 'server', label: 'GPU workers', sub: 'batched queue', x: 800, y: 70 },
          { id: 'post', kind: 'guard', label: 'Output checks', sub: 'safety classifier', x: 110, y: 230 },
          { id: 'c2pa', kind: 'tool', label: 'Provenance', sub: 'C2PA + watermark', x: 340, y: 230 },
          { id: 'store', kind: 'data', label: 'Asset store', sub: 'record + params', x: 570, y: 230 },
          { id: 'cost', kind: 'metric', label: 'Cost per asset', sub: 'GPU-s × rate', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'The request path',
            lines: [
              'Check the prompt and uploads **before** spending GPU time.',
              'Hash all parameters (with the seed): a cache hit costs nothing.',
              'Misses go to a batched GPU queue.',
            ],
            script: [
              { say: 0 },
              { send: ['user', 'pre'], label: 'request' },
              { badge: 'pre', text: 'policy ok', tone: 'ok' },
              { say: 1 },
              { send: ['pre', 'cache'], label: 'key' },
              { say: 2 },
              { send: ['cache', 'gpu'], label: 'miss', tone: 'miss' },
            ],
          },
          {
            kind: 'watch',
            title: 'Before anyone sees it',
            lines: [
              'Classify the **output**: prompts that look safe can still produce unsafe images.',
              'Attach C2PA Content Credentials and an invisible watermark.',
              'Store the asset with its full generation record.',
            ],
            script: [
              { say: 0 },
              { send: ['gpu', 'post'], label: 'image', curve: true },
              { say: 1 },
              { send: ['post', 'c2pa'], tone: 'ok' },
              { badge: 'c2pa', text: 'signed manifest', tone: 'ok' },
              { say: 2 },
              { send: ['c2pa', 'store'] },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: a missing label',
            lines: ['A journalist finds one of your images on social media with no Content Credentials.'],
            task: {
              type: 'choose',
              question: 'What is the most likely explanation, and what still identifies it?',
              options: [
                { text: 'The platform stripped the metadata on upload; the invisible watermark may still identify it' },
                { text: 'C2PA manifests cannot be removed, so it is not yours', why: 'C2PA is metadata: re-encoding, screenshots and many upload pipelines drop it.' },
                { text: 'The watermark and manifest are the same thing', why: 'The manifest is signed metadata; a watermark is embedded in the pixels. They are complementary.' },
              ],
              answer: 0,
            },
            solved: 'Manifests are easy to strip; pair them with a watermark and your own generation log.',
            then: [{ badge: 'store', text: 'log lookup', tone: 'ok' }],
          },
          {
            kind: 'turn',
            title: 'Your turn: order the gates',
            lines: ['Put the release path in order for a new image request.'],
            task: {
              type: 'order',
              question: 'Order the steps from request to delivery.',
              items: ['Input policy and likeness checks', 'Cache lookup by parameter hash', 'Generate on GPU workers', 'Output safety classification', 'Attach C2PA and watermark, then deliver'],
              hint: 'Cheap rejections come before GPU time; labels go on only after the image has passed checks.',
            },
            solved: 'Reject early, reuse cached work, generate, check, label, deliver.',
            then: [{ send: ['store', 'cost'], label: 'GPU-s', tone: 'ok' }],
          },
        ],
      },
      body: `**Cost and latency.** Your unit cost is GPU-seconds per asset × the cost of a GPU-second (or the provider's per-image or per-second price). GPU-seconds come from the previous sections: steps × passes × cost per pass, times resolution and duration. Levers, in order:
- **Do less work:** fewer steps (better solver, distilled model), CFG only when needed, native resolution plus upscaling, previews at low quality and full renders only on approval.
- **Reuse work:** cache by a hash of every parameter including the seed; content-address stored files.
- **Batch:** images of the same size and model batch well on a GPU; keep a short batching window for throughput, and route interactive requests to a low-latency pool.
- **Async by default** for anything above a few seconds (video, long audio), with idempotency keys and quotas per user.

**Content safety.** Check prompts and uploaded images before generation (cheap rejection), and **classify outputs** too, because benign-looking prompts can produce unsafe images. Block sexual content involving minors absolutely, and treat real-person likeness as a separate gate.

**Provenance.** Two complementary mechanisms (details and limits in [Red Teaming and Responsible AI](#/topic/red-teaming-responsible-ai)):
- **C2PA Content Credentials:** a manifest of assertions (which tool, which model, what edits) cryptographically signed and bound to the asset by a hash. Anyone can verify it. But it is metadata: screenshots, re-encoding and many upload pipelines strip it, so a missing manifest means *unknown*, not human-made.
- **Invisible watermarks** (for example Google's SynthID) are embedded in the pixels or audio and survive many common edits, though not all, and only the vendor's detector can read them.
Use both, and keep your own generation log so you can answer "did we make this?".

**Rights and likeness.**
- **Model licence:** open-weights image and video models ship with different licences; some forbid commercial use or add conditions. Check before you build a product on one.
- **Training data and outputs:** copyright questions about training data and about outputs that imitate protected works are being litigated in several jurisdictions. Avoid prompts that name living artists or trademarks if your policy says so, and keep humans in the loop for commercial assets.
- **Likeness and deepfakes:** do not generate identifiable real people without documented consent. The EU AI Act's transparency rules (Article 50) require machine-readable marking of AI-generated content and disclosure of deepfakes.`,
      example: `**A launch checklist for an "AI product photo" feature.**
- Unit cost: suppose the team measures 4.2 GPU-seconds per 1024×1024 image at 25 steps with CFG on the team's GPU; with a 30% cache hit rate (customers re-running the same template) the effective figure is about 2.9 GPU-seconds per delivered image.
- Gates: prompt classifier and a named-person filter before generation; output safety classifier after; reject rate tracked daily.
- Labels: C2PA manifest signed with the company certificate ("created with AI, model X, edited: background replaced") plus an invisible watermark; every record (params, seed, user, manifest id) kept for 1 year.
- Rights: model licence reviewed for commercial use; product photos uploaded by sellers only, with terms confirming they own them.`,
      prosCons: {
        pros: [
          'Early, cheap rejection and caching cut GPU spend without hurting quality.',
          'Signed manifests give customers and platforms a verifiable origin record.',
          'A full generation log answers abuse reports and audits quickly.',
        ],
        cons: [
          { con: 'C2PA metadata is stripped by screenshots, re-encoding and many platforms.', fix: 'Pair it with an invisible watermark and keep a server-side log keyed by perceptual hash so you can still recognise your outputs.' },
          { con: 'Output classifiers miss some harmful or infringing images.', fix: 'Layer checks (prompt filter, output classifier, likeness detection), sample outputs for human review, and give users a report button with a fast takedown path.' },
          { con: 'Licence or likeness problems surface only after launch.', fix: 'Review the model licence and training-data terms before choosing a model, require consent records for any real person, and keep humans approving commercial assets.' },
        ],
      },
      keyPoints: [
        'Unit cost = GPU-seconds per asset × price; cut steps, cache, batch.',
        'Moderate input and output; likeness is its own gate.',
        'C2PA = signed, strippable metadata; watermark = embedded; use both + logs.',
        'Check model licences and consent before launch.',
      ],
      exercise: {
        prompt: `Write **releaseDecision(asset)** that returns { release: boolean, reasons: string[] } for a generated image.

Block when: the output safety verdict is missing or not 'safe'; there is no C2PA manifest id; the request depicts a named real person without a consent record id; or the model licence does not allow commercial use and the request is commercial. Collect **all** reasons, not just the first.`,
        starter: {
          language: 'typescript',
          code: `type Asset = {
  safety?: 'safe' | 'unsafe';
  c2paManifestId?: string;
  namedPerson?: string;
  consentId?: string;
  commercial: boolean;
  licenceAllowsCommercial: boolean;
};

export function releaseDecision(a: Asset) {
  return { release: a.safety === 'safe', reasons: [] as string[] };
}`,
        },
        hints: ['A missing safety verdict must block, not pass.', 'Push one reason per failed rule and decide at the end.'],
        solution: {
          language: 'typescript',
          code: `type Asset = {
  safety?: 'safe' | 'unsafe';
  c2paManifestId?: string;
  namedPerson?: string;
  consentId?: string;
  commercial: boolean;
  licenceAllowsCommercial: boolean;
};

export function releaseDecision(a: Asset) {
  const reasons: string[] = [];
  if (a.safety !== 'safe') reasons.push(a.safety ? 'output classified unsafe' : 'no output safety verdict');
  if (!a.c2paManifestId) reasons.push('missing C2PA manifest');
  if (a.namedPerson && !a.consentId) reasons.push('real person without consent: ' + a.namedPerson);
  if (a.commercial && !a.licenceAllowsCommercial) reasons.push('model licence forbids commercial use');
  return { release: reasons.length === 0, reasons };
}

console.log(releaseDecision({ safety: 'safe', c2paManifestId: 'm1', commercial: true, licenceAllowsCommercial: true }));
// { release: true, reasons: [] }
console.log(releaseDecision({ namedPerson: 'A. Person', commercial: true, licenceAllowsCommercial: false }).reasons.length); // 4`,
        },
        explanation: 'The gate fails closed: an unknown safety verdict blocks just like an unsafe one. Collecting every reason makes the review queue actionable, and keeping licence and consent as explicit inputs forces those facts to be recorded upstream.',
      },
      quickCheck: {
        question: 'An image found online has no C2PA manifest. What can you conclude?',
        options: [
          'It was made by a human',
          'Nothing definite: the manifest may never have existed or may have been stripped',
          'It was made by a model that does not support C2PA',
        ],
        correct: 1,
        explanation: 'C2PA proves origin when a valid manifest is present. Absence is uninformative because metadata is easily removed, so check watermarks and your own logs before drawing conclusions.',
      },
      source: 'C2PA Technical Specification; EU AI Act Article 50 (transparency obligations); Google DeepMind SynthID',
    },
  ],
  codeChallenges: [
    {
      id: 'generative-media-cc-1',
      title: 'An image endpoint that burns GPU on every click',
      context:
        'A marketing tool exposes the handler below. GPU spend tripled in a month: users click Generate repeatedly with identical settings, some send 2048×2048 at 150 steps, nothing is moderated, and nothing records how an image was made.',
      task: 'Make the handler cheap and accountable: validate and cap inputs, require or assign a seed, cache by a hash of all parameters, moderate the prompt before and the image after generation, and return a generation record with the image.',
      starter: {
        language: 'typescript',
        code: `type Req = { prompt: string; width: number; height: number; steps: number; guidance: number; seed?: number };
declare function generate(r: Req): Promise<Buffer>;

export async function handle(r: Req) {
  const png = await generate(r);
  return { png };
}`,
      },
      hints: [
        'Clamp steps and size to what the model was trained for, and reject the rest with a clear error.',
        'An unseeded request cannot be cached; assign a seed and return it.',
        'Moderation runs twice: on the prompt (cheap) and on the output (prompts can look benign).',
      ],
      solution: {
        language: 'typescript',
        code: `import { createHash, randomInt } from 'node:crypto';

type Req = { prompt: string; width: number; height: number; steps: number; guidance: number; seed?: number };
type Deps = {
  generate: (r: Required<Req>) => Promise<Buffer>;
  moderateText: (s: string) => Promise<boolean>;      // true = allowed
  moderateImage: (png: Buffer) => Promise<boolean>;
  cache: { get(k: string): Promise<Buffer | undefined>; set(k: string, v: Buffer): Promise<void> };
  modelId: string;
};

const SIZES = new Set(['1024x1024', '1152x896', '896x1152']); // native sizes for this model
const MAX_STEPS = 40;

export async function handle(r: Req, d: Deps) {
  const prompt = r.prompt.trim().replace(/\\s+/g, ' ');
  if (!prompt || prompt.length > 1000) throw new Error('prompt must be 1–1000 characters');
  if (!SIZES.has(r.width + 'x' + r.height)) throw new Error('unsupported size; generate natively and upscale');
  const steps = Math.min(Math.max(Math.round(r.steps), 1), MAX_STEPS);
  const guidance = Math.min(Math.max(r.guidance, 0), 12);
  const seed = Number.isInteger(r.seed) ? (r.seed as number) : randomInt(2 ** 31);
  const params = { model: d.modelId, prompt, width: r.width, height: r.height, steps, guidance, seed };

  if (!(await d.moderateText(prompt))) return { blocked: 'prompt' as const };

  const key = createHash('sha256').update(JSON.stringify(Object.entries(params).sort())).digest('hex');
  let png = await d.cache.get(key);
  const cached = Boolean(png);
  if (!png) {
    png = await d.generate({ ...params });
    if (!(await d.moderateImage(png))) return { blocked: 'output' as const };
    await d.cache.set(key, png);
  }
  return { png, record: { ...params, key, cached } };
}`,
      },
      explanation: `- **Caps:** steps above ~40 rarely help with modern solvers, and off-native sizes cost more and look worse; clamping and rejecting stop the expensive outliers.
- **Seed:** assigned when missing and returned, so the result is cacheable and reproducible.
- **Cache key** covers every parameter including model id and seed; identical clicks become free.
- **Two moderation points:** prompt before GPU time, image after, and only images that pass are cached.
- **Record** returned with the image becomes the audit trail and the input to provenance labelling.`,
      followUps: [
        { q: 'Users want "variations" that differ each click. Does the cache break that?', a: 'No. Variations are new seeds, so the client sends a fresh seed (or omits it and gets a random one back). The cache only short-circuits truly identical requests, which is exactly the waste we saw.' },
        { q: 'Where does C2PA signing go in this flow?', a: 'After output moderation and before returning or storing the final asset: build a manifest from the record (model, parameters, edits), sign it with the service certificate, and embed it. Sign the delivered file, not the cached raw output, if later steps such as resizing change it.' },
      ],
    },
    {
      id: 'generative-media-cc-2',
      title: 'An adapter loader that mixes base models',
      context:
        'A multi-tenant image service lets each brand upload LoRA adapters. The loader below fuses every requested adapter into the shared pipeline. Brands report off-style images, some adapters do nothing, and one brand’s style leaked into another brand’s request.',
      task: 'Rewrite the loader so adapters are checked against the serving base model, weights are bounded, and adapters are applied per request instead of being fused permanently into shared weights.',
      starter: {
        language: 'typescript',
        code: `type Adapter = { id: string; path: string; baseModel: string; ownerBrand: string };
declare const pipe: { loadLora(path: string): void; fuseLora(scale: number): void };

export function useAdapters(adapters: Adapter[], scale = 1.5) {
  for (const a of adapters) {
    pipe.loadLora(a.path);
    pipe.fuseLora(scale);
  }
}`,
      },
      hints: [
        'An adapter trained on another base model family must be refused, not loaded.',
        'Fusing changes the shared weights; the next request inherits them.',
        'Bound each scale and the total so stacked adapters do not distort the output.',
      ],
      solution: {
        language: 'typescript',
        code: `type Adapter = { id: string; path: string; baseModel: string; ownerBrand: string };
type Pipe = {
  setAdapters(ids: string[], weights: number[]): void; // per-request, no weight mutation
  loaded: Set<string>;
  load(id: string, path: string): void;
};

const MAX_SCALE = 1.0;
const MAX_TOTAL = 1.5;

export function useAdapters(pipe: Pipe, servingBase: string, brand: string, req: { adapter: Adapter; scale: number }[]) {
  const errors: string[] = [];
  for (const { adapter: a, scale } of req) {
    if (a.baseModel !== servingBase) errors.push(a.id + ': trained on ' + a.baseModel + ', serving ' + servingBase);
    if (a.ownerBrand !== brand) errors.push(a.id + ': belongs to another brand');
    if (!(scale > 0 && scale <= MAX_SCALE)) errors.push(a.id + ': scale must be in (0, ' + MAX_SCALE + ']');
  }
  const total = req.reduce((s, r) => s + r.scale, 0);
  if (total > MAX_TOTAL) errors.push('combined scale ' + total + ' exceeds ' + MAX_TOTAL);
  if (errors.length) throw new Error(errors.join('; '));

  for (const { adapter: a } of req) if (!pipe.loaded.has(a.id)) pipe.load(a.id, a.path);
  // active only for this request; the base weights stay untouched
  pipe.setAdapters(req.map((r) => r.adapter.id), req.map((r) => r.scale));
}`,
      },
      explanation: `- **Base check:** a LoRA is a low-rank delta for specific weight matrices of one base model; on another base it does nothing useful or damages output.
- **Tenant check:** the request may only activate its own brand's adapters.
- **Per-request activation** instead of fusing keeps the shared base clean, so one brand's style cannot leak into the next request.
- **Bounded scales:** very high scales distort; a total cap keeps stacked adapters stable.
- Fusing is still fine for a dedicated single-adapter deployment where its small speed gain matters.`,
      followUps: [
        { q: 'Hundreds of brands each have an adapter. How do you keep memory under control?', a: 'Keep the base model loaded once and adapters in an LRU set in GPU memory, loading on demand from fast storage; adapters are small, so many fit. Route requests for the same adapter to the same workers to raise hit rates.' },
        { q: 'How would you test that adapters cannot leak across tenants?', a: 'Run brand A then brand B requests on the same worker with fixed seeds and compare B’s output to a clean-process baseline; any difference means state leaked. Add it as a regression test in CI.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'generative-media-iq-01',
      difficulty: 'hard',
      question: 'Design an "AI product photo" feature for an e-commerce platform: sellers upload a product shot and get styled backgrounds.',
      context: 'About 50,000 sellers; peak a few thousand requests per hour; sellers expect results in under 15 seconds; images go on public listings.',
      whatInterviewerLooksFor: [
        'Chooses editing (segmentation + inpainting) over text-to-image so the product stays exact',
        'Has a cost model in GPU-seconds and concrete levers',
        'Moderation on input and output, likeness and IP policy',
        'Provenance labelling and an audit trail',
        'A quality evaluation plan',
      ],
      modelAnswer: `**Pipeline.** Segment the product (a segmentation model), invert and dilate the mask, then **inpaint the background** with a diffusion inpainting checkpoint, optionally a depth ControlNet so the surface matches the perspective, and composite the original product pixels back so the product is exact. Text-to-image would redraw the product, which is unacceptable for a listing.

**Serving.** A request takes a few GPU-seconds, so a synchronous call with a timeout works under 15 s, behind a queue so bursts wait instead of failing. Batch by size and model; 20–30 solver steps; preview at 512 px and full size only when the seller accepts. Cache by a hash of all parameters including the seed; seed variations on "try again".

**Cost.** Measure GPU-seconds per image on the target GPU and multiply by the GPU price; track it per seller with quotas.

**Safety.** Prompt filter and upload checks before generation; output safety classifier after. Sellers may not add people or trademarks through prompts; real-person likeness blocked.

**Provenance.** C2PA manifest ("background generated with model X, product photo by seller") signed with the platform certificate, plus an invisible watermark and a generation log, to satisfy marketplace transparency rules and AI-content disclosure obligations.

**Quality.** A fixed evaluation set of products with human ratings for realism, seam visibility and product fidelity (pixel diff outside the mask must be zero), plus seller acceptance rate and re-roll rate online.`,
      followUps: [
        { q: 'Sellers complain shadows look fake. What do you change?', a: 'Let the model regenerate a slightly larger area around the base of the product (a soft mask band), add a depth or normal-map ControlNet for lighting cues, or add a dedicated shadow-generation step; then re-run the human rating on the fixed set.' },
        { q: 'How do you keep cost flat as usage grows 10×?', a: 'Distilled few-step model for previews, caching of repeated templates, batching, and quotas per seller tier. Re-measure GPU-seconds per accepted image, not per generated image, since re-rolls are the hidden multiplier.' },
      ],
      pitfalls: [
        'Using text-to-image and letting the model redraw the product',
        'No output moderation because "the prompt was fine"',
        'No cost unit, so spend surprises appear only on the invoice',
      ],
    },
    {
      id: 'generative-media-iq-02',
      difficulty: 'medium',
      question: 'Your image generation takes 8 seconds per image and product wants under 1 second for an interactive editor. What are your options and their trade-offs?',
      whatInterviewerLooksFor: [
        'Decomposes latency into steps × passes × cost per pass',
        'Knows solver vs distillation vs CFG trade-offs',
        'Mentions resolution, hardware and batching effects',
        'Keeps a quality check in the loop',
      ],
      modelAnswer: `Latency ≈ steps × passes per step × time per pass + VAE decode + overheads. Work through each factor and measure quality on a fixed prompt-and-seed set at every change.

1. **Steps.** Switch to a faster solver (DPM-Solver-class) and drop from 50 to 20–25 steps with little change. To reach 1–4 steps you need a **distilled** model (consistency, adversarial or rectified-flow distillation, or an LCM-style adapter). That is the only way to an order of magnitude, at some cost in detail and prompt adherence.
2. **Passes per step.** CFG doubles them; guidance-distilled models run without it.
3. **Cost per pass.** Generate at a lower native resolution for the interactive preview and upscale or re-render the final; use half precision; compile the model; avoid stacking ControlNets in the interactive path.
4. **System.** Keep models warm, avoid cold loads, use a low-latency pool with small batches separate from the throughput pool.

A typical answer: interactive previews from a distilled 4-step model at 512–768 px in well under a second, then a high-quality render in the background when the user commits. Quality is checked with a human preference comparison on a fixed set, not just by eye.`,
      followUps: [
        { q: 'Why not just cut the original model to 4 steps?', a: 'A model trained for many-step sampling produces blurry or broken images at very few steps; the solver cannot take such large jumps accurately. Distillation trains a student specifically to jump far in one step.' },
        { q: 'How do you check the distilled model is good enough?', a: 'Generate the same fixed prompts and seeds with both models and run a blind human preference test, plus prompt-alignment checks; track re-roll rate after launch as an online signal.' },
      ],
      pitfalls: ['Only suggesting a bigger GPU', 'Ignoring that CFG doubles passes', 'No quality comparison after speeding up'],
    },
    {
      id: 'generative-media-iq-03',
      difficulty: 'medium',
      question: 'When would you use img2img, inpainting, ControlNet or a LoRA? Give a product example for each.',
      whatInterviewerLooksFor: [
        'Maps each tool to the dimension it controls (how much, where, layout, style)',
        'Knows the base-model compatibility rule for LoRA',
        'Knows ControlNet adds compute per step',
        'Can combine tools',
      ],
      modelAnswer: `Each tool controls a different thing:

- **img2img (strength)** controls **how much** of the input changes. Example: turn a rough sketch into a finished illustration at strength ~0.6–0.7, keeping composition. Low strength keeps colours and identity; 1.0 ignores the input.
- **Inpainting (mask)** controls **where** it changes. Example: replace a product photo's background, or remove a logo from a stock image, leaving everything else pixel-identical after compositing.
- **ControlNet (condition map)** controls **layout**: edges, depth, pose. Example: generate a model wearing a garment in exactly the pose of a reference photo; or keep a room's geometry while restyling it. It adds a network to every step and must match the base model.
- **LoRA (adapter)** controls **style or subject**. Example: a brand illustration style learned from ~30 approved images, or a specific product so it renders consistently. It only works on the base family it was trained on.

They compose: a furniture app can inpaint the floor area, use a depth ControlNet so the new sofa sits in perspective, and a LoRA of the actual sofa so it looks like the product.`,
      followUps: [
        { q: 'You have one reference image of a style, not thirty. What do you use?', a: 'A reference-image adapter (IP-Adapter style) that feeds image embeddings through cross-attention, no training needed; train a LoRA later once more examples exist.' },
        { q: 'Two ControlNets (pose and depth) give overcooked images. Why?', a: 'Their residuals add up in the same layers; at weight 1.0 each the control dominates. Lower the weights so they sum to about 1.0 and re-check.' },
      ],
      pitfalls: ['Treating LoRA as layout control', 'Forgetting base-model compatibility', 'Using img2img when only a region should change'],
    },
    {
      id: 'generative-media-iq-04',
      difficulty: 'hard',
      question: 'You are adding text-to-video and image-to-video to a creative app. How do you architect serving, and what drives cost?',
      whatInterviewerLooksFor: [
        'Async job design with idempotency and notifications',
        'Token arithmetic: duration × resolution, attention growth',
        'Preview-then-render to control cost',
        'Temporal QA and provenance',
      ],
      modelAnswer: `**Why it is different from images.** A video model denoises all frames jointly (temporal attention or spacetime patches) to avoid flicker. Tokens = latent time steps × spatial patches, so cost scales with duration and resolution, and attention grows faster than the token count. A clip takes from tens of seconds to minutes of GPU time.

**Serving.** POST /videos with an idempotency key returns 202 and a job id; a queue feeds GPU workers (often multi-GPU per job for large models); results go to object storage; clients get a webhook or poll; jobs have timeouts, retries with the same key, and per-user quotas. Progress is coarse (queued, rendering, checking, done) because frames finish together.

**Cost control.** Low-resolution, short, few-step **previews** first; full render only on approval. Cap duration per tier. Prefer image-to-video when the user has a key image: subject consistency is better, so fewer re-rolls. Long videos are stitched from short segments conditioned on the last frame.

**Quality and safety.** Sample frames for safety classification, check identity consistency (face or object embeddings across frames) and flicker; attach C2PA and a watermark; block real-person likeness without consent.

**Metrics.** GPU-seconds per accepted clip, queue wait p95, re-roll rate, rejection rate by gate.`,
      followUps: [
        { q: 'A user retries the submit three times because the page hung. What happens?', a: 'All three carry the same idempotency key, so the API returns the existing job each time; only one render runs. Without the key you would pay for three renders and the user would see three different clips.' },
        { q: 'Why does a 10-second clip cost more than twice a 5-second clip?', a: 'Doubling duration doubles the tokens, and attention cost over time grows quadratically in the number of time steps, so the temporal part grows about 4×. Two 5-second segments stitched at a keyframe avoid that.' },
      ],
      pitfalls: ['Synchronous HTTP for multi-minute jobs', 'No idempotency on submit', 'Generating frames independently with an image model'],
    },
    {
      id: 'generative-media-iq-05',
      difficulty: 'medium',
      question: 'Legal asks how we will label AI-generated images and audio we produce, and whether we can tell if an image online came from us. What do you propose?',
      whatInterviewerLooksFor: [
        'C2PA manifests: signed, verifiable, but strippable',
        'Invisible watermarks as a complement, with limits',
        'Internal generation logs',
        'Correct reading of "no signal"',
        'Awareness of disclosure obligations',
      ],
      modelAnswer: `**Three layers.**
1. **C2PA Content Credentials** on every file we deliver: a manifest of assertions (generated by our service, model, edits) signed with our certificate and bound to the file by a hash. Anyone with a C2PA verifier can check it, and editing tools can add their own steps to the chain. Limit: it is metadata, so screenshots, re-encoding and many platforms remove it.
2. **Invisible watermark** in the pixels or audio (our own or a vendor's, such as SynthID on that vendor's models). It survives many common transforms such as compression and resizing, but not all, and only the matching detector reads it.
3. **Generation log**: parameters, seed, user, manifest id and a perceptual hash, kept per our retention policy, so we can answer "did we make this?" even when both signals are gone.

**Reading results.** A valid manifest or watermark is strong evidence of origin. Absence means **unknown**, never "human-made", and we never accuse a user on a detector score alone.

**Disclosure.** We show a visible "AI-generated" label in our UI, and the machine-readable marking supports transparency obligations such as the EU AI Act's Article 50 for generated content and deepfakes. For voices we also keep consent records.`,
      followUps: [
        { q: 'Could someone forge our manifest to blame us for an image?', a: 'Not without our private signing key: verification checks the signature chain and the hash binding. Protect the key in an HSM or KMS, rotate it, and revoke it if compromised. A stripped-and-replaced manifest from someone else would show their identity, not ours.' },
        { q: 'Why not rely on the watermark alone?', a: 'Watermarks are proprietary, readable only by the matching detector, and can be weakened by heavy edits; manifests are an open standard anyone can verify and carry edit history. They fail in different ways, so together they cover more cases.' },
      ],
      pitfalls: ['Claiming C2PA cannot be removed', 'Treating "no watermark" as "human-made"', 'No internal log'],
    },
  ],
  envelopeQuestions: [
    {
      id: 'generative-media-est-1',
      question: 'Estimate the GPU time and GPU count needed to serve 100,000 images a day, and what switching to a distilled 4-step model would change.',
      assumptions: [
        'Baseline: 30 steps with CFG (2 passes per step) at 1024×1024',
        'Measured: one denoiser pass takes 50 ms on the serving GPU at batch 1; VAE decode 150 ms',
        'Traffic peaks at 3× the daily average; target GPU utilisation 60%',
        'Distilled model: 4 steps, no CFG, same cost per pass',
      ],
      steps: [
        { label: 'Baseline GPU time per image', calc: '30 × 2 × 50 ms + 150 ms = 3,000 + 150 = 3.15 s' },
        { label: 'Daily GPU time', calc: '100,000 × 3.15 s = 315,000 s ≈ 87.5 GPU-hours' },
        { label: 'Average then peak GPUs', calc: '315,000 / 86,400 ≈ 3.6 busy GPUs average; × 3 peak = 10.9; / 0.6 utilisation ≈ 18 GPUs' },
        { label: 'Distilled GPU time per image', calc: '4 × 1 × 50 ms + 150 ms = 350 ms (9× less)' },
        { label: 'Distilled fleet', calc: '100,000 × 0.35 s = 35,000 s/day → 0.41 average × 3 / 0.6 ≈ 2 GPUs' },
      ],
      answer: 'About 3.2 GPU-seconds per image and roughly 18 GPUs at peak for the baseline; a distilled 4-step model needs about 0.35 s per image and roughly 2 GPUs.',
      insight: 'Denoiser passes dominate (3.0 of 3.15 s), so steps and CFG are the levers; once steps are cut to 4, the VAE decode becomes almost half the time and is the next thing to optimise. Batching would lower all of these numbers further.',
      followUps: [
        { q: 'Batch of 4 runs at 120 ms per pass instead of 4 × 50 ms. What changes?', a: 'Per image a pass costs 30 ms instead of 50 ms, so the baseline drops to 30 × 2 × 30 + 150 = 1.95 s per image (about 38% less), at the price of waiting to fill batches, which adds latency for interactive users.' },
      ],
    },
    {
      id: 'generative-media-est-2',
      question: 'Estimate the raw size, latent token count and attention cost for a 10-second 720p video, and compare with two 5-second segments.',
      assumptions: [
        '1280×720, 24 fps, 3 bytes per pixel raw',
        'Video VAE compresses 8× per spatial side and 4× in time; 2×2 spatial patches',
        'Full attention cost ∝ N² over all tokens; compare per transformer layer',
      ],
      steps: [
        { label: 'Raw size', calc: '240 frames × 1280 × 720 × 3 B ≈ 663 MB' },
        { label: 'Latent grid', calc: 'T = 240 / 4 = 60; spatial 160 × 90 → patches 80 × 45 = 3,600' },
        { label: 'Tokens', calc: 'N = 60 × 3,600 = 216,000' },
        { label: 'Full attention, one 10 s clip', calc: 'N² ≈ 4.7 × 10¹⁰' },
        { label: 'Two 5 s segments', calc: '2 × (108,000)² ≈ 2.3 × 10¹⁰, half the 10 s cost' },
      ],
      answer: 'About 663 MB raw, 216,000 latent tokens, and full-attention cost about 4.7 × 10¹⁰ per layer; two 5 s segments cost about half of that.',
      insight: 'Attention cost grows with the square of duration, so long clips are disproportionately expensive. Factorised space-time attention and segmenting long videos at keyframes are the standard ways to keep cost near-linear in length.',
      followUps: [
        { q: 'What does going from 720p to 1080p do to the token count?', a: '1920×1080 has 2.25× the pixels, so spatial patches rise from 3,600 to about 8,100 (120 × 67.5) and N rises 2.25×; full attention cost rises about 5×.' },
      ],
    },
  ],
  test: [
    {
      id: 'generative-media-mcq-01',
      difficulty: 'medium',
      question: 'During DDPM training, what does the network learn to predict from a noisy sample and its timestep?',
      options: ['The noise that was added', 'The text prompt', 'The next timestep', 'A real-or-fake probability'],
      correct: [0],
      explanation: 'DDPM trains the network to predict the Gaussian noise ε added to a clean image, with a mean-squared-error loss. A real-or-fake probability is a GAN discriminator objective, not part of diffusion training.',
      followUps: [{ q: 'Why is predicting noise easier to train than a GAN?', a: 'It is a plain regression loss with a fixed target, so there is no two-player game that can oscillate or collapse to one mode.' }],
    },
    {
      id: 'generative-media-mcq-02',
      difficulty: 'medium',
      question: 'How many denoiser passes does this configuration run per image (ignore the VAE)?',
      code: {
        language: 'json',
        code: `{ "num_inference_steps": 25, "guidance_scale": 7.5, "controlnets": 0, "num_images": 1 }`,
      },
      options: ['25', '50', '7.5', '187'],
      correct: [1],
      explanation: 'With a guidance scale above 1, classifier-free guidance runs a conditional and an unconditional prediction per step, so 25 steps × 2 = 50 passes (usually batched together). The scale value itself does not change the pass count.',
      followUps: [{ q: 'What setting would halve the passes?', a: 'Turning guidance off (scale 1 or 0 depending on the library) or using a guidance-distilled model, so each step runs one pass. Expect weaker prompt adherence unless the model was distilled for it.' }],
    },
    {
      id: 'generative-media-mcq-03',
      difficulty: 'medium',
      question: 'Select ALL statements that are true of latent diffusion.',
      options: [
        'Denoising runs on a compressed VAE latent instead of pixels',
        'The VAE decoder runs once at the end of sampling',
        'At 512×512 the Stable Diffusion latent has 48× fewer values than the RGB image',
        'It removes the need for a sampler',
      ],
      correct: [0, 1, 2],
      explanation: 'Latent diffusion (Rombach et al. 2022) moves the iterative denoising into a 64×64×4 latent for a 512×512×3 image (786,432 / 16,384 = 48), then decodes once. A sampler is still needed to step from noise to a clean latent.',
      followUps: [{ q: 'What is lost by working in latent space?', a: 'Fine details the VAE cannot represent, such as small text or tiny faces, can blur or distort; refiner passes or higher-capacity latents help.' }],
    },
    {
      id: 'generative-media-mcq-04',
      difficulty: 'hard',
      question: 'In the DiT architecture, a 32×32×4 latent is patchified with patch size p. How many tokens does the transformer see for p = 2, and what happens if p is halved to 1?',
      options: ['256 tokens; halving p quadruples tokens to 1,024', '16 tokens; halving p doubles them', '1,024 tokens; halving p halves them', '64 tokens; p has no effect on tokens'],
      correct: [0],
      explanation: 'Tokens = (32 / p)². With p = 2 that is 16 × 16 = 256; with p = 1 it is 32 × 32 = 1,024. Peebles and Xie found smaller patches (more compute) improved quality, at a large cost because attention grows with the square of tokens.',
      followUps: [{ q: 'Why does that matter for serving?', a: 'Token count drives attention cost per pass; higher resolution or smaller patches multiply the cost of every one of the sampling steps.' }],
    },
    {
      id: 'generative-media-mcq-05',
      difficulty: 'medium',
      question: 'Select ALL true statements about classifier-free guidance.',
      options: [
        'One network learns both conditional and unconditional predictions by dropping the prompt for some training examples',
        'Raising the guidance scale trades sample diversity for prompt fidelity',
        'It requires a separately trained image classifier',
        'A negative prompt conditions the unconditional branch',
      ],
      correct: [0, 1, 3],
      explanation: 'Ho and Salimans 2022 train with the condition dropped for a fraction of examples, then mix the two predictions at sampling time; higher scale increases fidelity and reduces diversity. "Classifier-free" means no separate classifier is needed, unlike earlier classifier guidance.',
      followUps: [{ q: 'What do you see at very high scales?', a: 'Oversaturated colours, harsh contrast and artefacts, because the prediction is extrapolated far outside what the model saw during training.' }],
    },
    {
      id: 'generative-media-mcq-06',
      difficulty: 'medium',
      question: 'A 140-word prompt to a Stable Diffusion 1.5 pipeline ignores the details at the end. What is the most likely cause?',
      options: [
        'The CLIP text encoder has a 77-token context and the rest is truncated',
        'The guidance scale is too low',
        'The VAE cannot encode long prompts',
        'The sampler skips tokens after step 20',
      ],
      correct: [0],
      explanation: 'Stable Diffusion 1.x conditions on the CLIP ViT-L/14 text encoder, which has a 77-token context, so tokens beyond it are dropped. Put important content first or use a pipeline with a long-context text encoder.',
      followUps: [{ q: 'How would you detect this in your product?', a: 'Tokenise prompts with the same tokenizer before generation and warn the user, or log how often prompts exceed the limit to decide whether a different model is worth it.' }],
    },
    {
      id: 'generative-media-mcq-07',
      difficulty: 'hard',
      question: 'What does this img2img call do?',
      code: {
        language: 'typescript',
        code: `await img2img({
  image: sketch,
  prompt: 'watercolour painting of a lighthouse at dusk',
  strength: 0.6,
  numInferenceSteps: 30,
});`,
      },
      options: [
        'Noises the sketch to 60% of the schedule and runs about 18 denoising steps from there',
        'Runs 30 steps from pure noise, then blends 60% of the sketch back in',
        'Keeps 60% of the sketch pixels unchanged and regenerates the rest',
        'Runs 48 steps because strength adds steps',
      ],
      correct: [0],
      explanation: 'SDEdit-style img2img noises the input to strength × T and denoises from there; in diffusers only floor(30 × 0.6) = 18 steps run. It is not pixel blending: the whole image can change, more so as strength rises.',
      followUps: [{ q: 'The output lost the sketch’s composition. What do you adjust?', a: 'Lower the strength (for example to 0.4–0.5), or add an edge ControlNet from the sketch so layout is enforced while style changes.' }],
    },
    {
      id: 'generative-media-mcq-08',
      difficulty: 'medium',
      question: 'Why are ControlNet’s connections to the frozen model initialised as zero convolutions?',
      options: [
        'So the control branch adds nothing at the start of training and cannot damage the pretrained model',
        'So the control image is ignored at inference',
        'To halve the memory of the copy',
        'Because the condition image is always black at first',
      ],
      correct: [0],
      explanation: 'Zhang et al. 2023 connect a trainable copy of the encoder through 1×1 convolutions initialised to zero, so initially the output equals the base model’s. Training then grows the control signal gradually, which also makes small datasets workable.',
      followUps: [{ q: 'What does adding a ControlNet cost at inference?', a: 'An extra large network evaluated at every denoising step, so per-step time and memory rise; stacking several multiplies that.' }],
    },
    {
      id: 'generative-media-mcq-09',
      difficulty: 'hard',
      question: 'Select ALL problems in this adapter-loading code for a shared multi-tenant pipeline.',
      code: {
        language: 'typescript',
        code: `// servingBase = 'sdxl-base-1.0'
for (const a of request.adapters) {      // a.baseModel may be 'sd-1.5'
  pipe.loadLora(a.path);
  pipe.fuseLora(2.5);
}
return pipe.generate(request.prompt);`,
      },
      options: [
        'Adapters trained on another base model are loaded without a check',
        'Fusing modifies the shared weights, so later requests inherit this tenant’s adapters',
        'A scale of 2.5 is likely to distort output',
        'LoRA adapters cannot be used with SDXL at all',
      ],
      correct: [0, 1, 2],
      explanation: 'A LoRA is a delta for a specific base model; fusing bakes it into shared weights that the next request uses; very high scales overdrive the delta. LoRA works fine with SDXL when the adapter was trained for SDXL.',
      followUps: [{ q: 'When is fusing a good idea?', a: 'In a dedicated deployment that always serves the same single adapter, where the small speed gain from not applying the delta per request is worth it.' }],
    },
    {
      id: 'generative-media-mcq-10',
      difficulty: 'medium',
      question: 'Select ALL techniques that improve temporal consistency in generated video.',
      options: [
        'Denoising all frames jointly with temporal attention',
        'Spacetime-patch transformers over a video latent',
        'Conditioning on a given first frame or keyframes',
        'Generating each frame independently with a new random seed',
      ],
      correct: [0, 1, 2],
      explanation: 'Coupling frames during denoising (temporal layers or spacetime patches) and anchoring on given frames keep identity and lighting stable. Independent per-frame seeds are the cause of flicker, not a fix.',
      followUps: [{ q: 'How would you measure consistency automatically?', a: 'Embed the main subject (face or object embeddings) in sampled frames and track similarity across frames, plus frame-to-frame difference statistics to catch flicker.' }],
    },
    {
      id: 'generative-media-mcq-11',
      difficulty: 'hard',
      question: 'A codec runs at 75 frames per second with 8 RVQ codebooks. A generator produces 1,500 tokens per second on one GPU. How many real-time streams can it serve?',
      code: {
        language: 'typescript',
        code: `const frameRateHz = 75;
const codebooks = 8;
const genTokensPerSec = 1500;
const streams = Math.floor(genTokensPerSec / (frameRateHz * codebooks));`,
      },
      options: ['2', '20', '8', '1'],
      correct: [0],
      explanation: 'Each second of audio needs 75 × 8 = 600 tokens; 1,500 / 600 = 2.5, so 2 full real-time streams. Overheads such as time to first audio and codec decoding reduce this further in practice.',
      followUps: [{ q: 'How could you double the streams without a new GPU?', a: 'Use fewer codebooks (lower bitrate) for speech, a smaller or distilled model, or better batching; check audio quality and speaker similarity after each change.' }],
    },
    {
      id: 'generative-media-mcq-12',
      difficulty: 'medium',
      question: 'Which statement about C2PA Content Credentials is correct?',
      options: [
        'They are signed manifests bound to the file by a hash; they can be verified, but stripping the metadata removes them',
        'They are invisible watermarks embedded in pixels that survive screenshots',
        'Their absence proves an image was made by a human',
        'Only the original model vendor can verify them',
      ],
      correct: [0],
      explanation: 'C2PA defines cryptographically signed manifests with hard bindings to the asset; any compatible verifier can check them. Because they are metadata, re-encoding or screenshots drop them, so absence is uninformative. Pixel watermarks are a separate, complementary mechanism.',
      followUps: [{ q: 'What helps recover provenance after stripping?', a: 'A soft binding: an invisible watermark or a fingerprint that can be used to look up the manifest or your own generation log.' }],
    },
    {
      id: 'generative-media-mcq-13',
      difficulty: 'medium',
      question: 'Select ALL controls a team should have in place before launching a voice-cloning feature.',
      options: [
        'Verified consent from the owner of the voice, stored with the voice profile',
        'Labelling and watermarking of generated audio',
        'Logging of each generation with the voice profile used',
        'Accepting any uploaded clip as long as it is at least 3 seconds long',
      ],
      correct: [0, 1, 2],
      explanation: 'Models such as VALL-E can imitate a voice from a few seconds of audio, so length is no safeguard. Consent, disclosure and watermarking, and audit logs are the controls that address impersonation risk.',
      followUps: [{ q: 'How do you verify consent rather than just collect a checkbox?', a: 'Have the speaker record a randomised consent phrase in the same session, check it matches the enrolment voice, and store the recording with the profile.' }],
    },
  ],
};

export default topic;
