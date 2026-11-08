import type { Topic } from '../../types';

const topic: Topic = {
  id: 'transformer-internals',
  phase: 'internals',
  order: 1,
  title: 'Transformer Internals and Attention',
  subtitle: 'Follow one token through a modern decoder layer: embeddings, RoPE, residual stream, norms, attention variants and FlashAttention; then scaling laws, mixture-of-experts and long-context attention',
  estimatedMinutes: 66,
  sources: [
    'Vaswani et al. 2017 — Attention Is All You Need (arXiv:1706.03762)',
    'Su et al. 2021 — RoFormer: Enhanced Transformer with Rotary Position Embedding (arXiv:2104.09864)',
    'Zhang & Sennrich 2019 — Root Mean Square Layer Normalization (arXiv:1910.07467)',
    'Shazeer 2020 — GLU Variants Improve Transformer (SwiGLU, arXiv:2002.05202)',
    'Shazeer 2019 — Fast Transformer Decoding: One Write-Head is All You Need (MQA, arXiv:1911.02150)',
    'Ainslie et al. 2023 — GQA: Training Generalized Multi-Query Transformer Models (arXiv:2305.13245)',
    'Dao et al. 2022 — FlashAttention (arXiv:2205.14135); Dao 2023 — FlashAttention-2; Shah et al. 2024 — FlashAttention-3',
    'Meta — Llama 3 model card / config (hidden 4096, 32 layers, 32 heads, 8 KV heads, RoPE theta 500,000)',
    'Elhage et al. 2021 — A Mathematical Framework for Transformer Circuits (residual stream view)',
    'DeepSeek-AI 2024 — DeepSeek-V2 (Multi-head Latent Attention, arXiv:2405.04434)',
    'Kaplan et al. 2020 — Scaling Laws for Neural Language Models (arXiv:2001.08361)',
    'Hoffmann et al. 2022 — Training Compute-Optimal Large Language Models, "Chinchilla" (arXiv:2203.15556)',
    'Sardana & Frankle 2024 — Beyond Chinchilla-Optimal: Accounting for Inference in Language Model Scaling Laws (arXiv:2401.00448)',
    'Snell et al. 2024 — Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters (arXiv:2408.03314)',
    'Schaeffer et al. 2023 — Are Emergent Abilities of Large Language Models a Mirage? (arXiv:2304.15004)',
    'Shazeer et al. 2017 — Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer (arXiv:1701.06538)',
    'Fedus et al. 2021 — Switch Transformers (arXiv:2101.03961)',
    'Jiang et al. 2024 — Mixtral of Experts (arXiv:2401.04088)',
    'DeepSeek-AI 2024 — DeepSeek-V3 Technical Report (arXiv:2412.19437)',
    'Jiang et al. 2023 — Mistral 7B (sliding-window attention, arXiv:2310.06825)',
    'Google DeepMind — Gemma 2 and Gemma 3 technical reports (interleaved local/global attention)',
    'Katharopoulos et al. 2020 — Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention (arXiv:2006.16236)',
    'Gu & Dao 2023 — Mamba: Linear-Time Sequence Modeling with Selective State Spaces (arXiv:2312.00752)',
    'ai-engineering-from-scratch (MIT, © 2026 Rohit Ghumare) — Phase 7 lessons 11 (MoE), 13 (scaling laws), 15 (attention variants), adapted and rewritten',
  ],
  tags: ['transformer', 'attention', 'rope', 'residual-stream', 'rmsnorm', 'swiglu', 'gqa', 'mqa', 'flashattention', 'pytorch', 'scaling-laws', 'chinchilla', 'mixture-of-experts', 'sliding-window', 'state-space-models'],
  cheatSheet: [
    'Decoder layer (Llama-style): x = x + Attn(RMSNorm(x)); x = x + SwiGLU_MLP(RMSNorm(x)); repeat L times, final RMSNorm, LM head → logits over vocab.',
    'The residual stream is the d_model-wide "bus" every layer reads from and adds to; pre-norm keeps it trainable at depth.',
    'RoPE rotates each (even, odd) pair of q/k dims by angle m·θ_i with θ_i = base^(−2i/d); q_m·k_n then depends only on m − n. Applied to Q and K, never V.',
    'Attention(Q,K,V) = softmax(QKᵀ/√d_k + mask) V; causal mask sets future positions to −∞ BEFORE the softmax.',
    'MHA: n_kv = n_heads; MQA: n_kv = 1; GQA: 1 < n_kv < n_heads (Llama-3-8B: 32 Q heads, 8 KV heads → 4× smaller KV cache).',
    'Params per layer ≈ attention (2·d² + 2·d·n_kv·d_head with GQA) + MLP (3·d·d_ff); Llama-3-8B: ~218M/layer × 32 + 1.05B embeddings/head ≈ 8.0B.',
    'Naive attention materialises an N×N score matrix per head: 32 heads × 32k² × 2 B ≈ 69 GB per layer: impossible without FlashAttention.',
    'FlashAttention is exact: tiles Q/K/V into on-chip SRAM and uses an online softmax (running max + running sum), so memory is O(N) and HBM traffic drops sharply.',
    'Scaling by √d_k keeps logits at unit variance so softmax does not saturate; forgetting it makes attention nearly one-hot and gradients vanish.',
    'Context extension for RoPE models: raise the base (NTK-aware) or use YaRN/position interpolation, then fine-tune briefly on long sequences.',
    'Scaling: training ≈ 6·N·D FLOPs, inference ≈ 2·N per token; Chinchilla-optimal ≈ 20 tokens/parameter; heavily used models are over-trained on purpose (Llama 3 8B: ~15T tokens).',
    'MoE: router picks top-k of E expert MLPs per token per layer; compute follows active params, memory follows total (Mixtral 8x7B: ~12.9B active / 46.7B total).',
    'KV cache bytes = 2 × layers × n_kv_heads × head_dim × bytes × tokens; sliding-window layers cap it at W, hybrids keep full KV only in global layers, SSMs keep a fixed state.',
  ],
  sections: [
    {
      heading: 'Transformer Internals — embeddings, RoPE, residual stream, norms and the MLP',
      body: `**Intuition:** think of the residual stream as a shared whiteboard, one per token. Every layer reads the whiteboard, writes a small correction on top (it *adds*, never overwrites), and passes it on. Attention lets a token copy notes from other tokens' whiteboards; the MLP looks things up in its own memory.

**A modern decoder-only layer (Llama/Qwen/Mistral style), per token vector x (size d_model):**
1. **Embedding:** token id → row of a \`vocab × d\` matrix (Llama 3: 128,256 × 4096).
2. **Pre-norm:** \`RMSNorm(x) = x / rms(x) · g\`: cheaper than LayerNorm (no mean subtraction) and, applied *before* each sub-block, keeps gradients healthy in deep stacks.
3. **Attention:** project to Q, K, V; apply **RoPE** to Q and K (rotate dimension pairs by an angle proportional to position, so q·k depends on *relative* distance); causal attention; output projection; **add** to x.
4. **MLP (SwiGLU):** \`W_down( SiLU(W_gate x) ⊙ W_up x )\` with d_ff ≈ 3.5 × d; **add** to x. MLPs hold ~2/3 of the parameters.
5. After L layers: final RMSNorm → LM head (\`d × vocab\`) → logits → softmax → next-token distribution.

**Parameter maths** (d = 4096, 32 Q heads, 8 KV heads × 128, d_ff = 14,336):

| Block | Formula | Params |
|---|---|---|
| Q + O | 2 · d · d | 33.6M |
| K + V (GQA) | 2 · d · 1024 | 8.4M |
| MLP | 3 · d · d_ff | 176.2M |
| **Per layer** | | **218.1M** |
| 32 layers | | 6.98B |
| Embedding + LM head (untied) | 2 · 128,256 · d | 1.05B |

Total ≈ **8.03B**, matching Llama-3-8B.

**When this matters:** memory/FLOP estimates, LoRA targets, numerical debugging and context extension.`,
      example: `Follow the token "Paris" at position 5 through Llama-3-8B. Embedding lookup gives a 4,096-d vector with RMS ~0.01. Layer 1 pre-norm rescales it to RMS ~1 for the attention block; Q and K for position 5 are rotated by RoPE: dimension pair 0 uses θ_0 = 1 rad per position (angle 5 rad), while the last pair uses θ_63 = 500,000^(−126/128) ≈ 2.4e-6 rad per position, almost no rotation, which is how RoPE encodes both short and long range. Attention adds information from "capital of France"; the MLP adds features like "city", "French". After 32 layers, the final hidden state times the 4,096 × 128,256 LM head gives logits; softmax puts e.g. 0.62 on " is" and 0.11 on ",". Only ~1/4096 of the computation per token is the embedding lookup; ~2 × 8B ≈ 16 GFLOPs go into the matmuls.`,
      diagram: `   token ids
      |
      v
  [Embedding  vocab x d]
      |
      v        residual stream x (d = 4096 per token)
  +---+----------------------------------------------+
  |   |                                              |  x L layers
  |   +--> RMSNorm --> Q,K,V --RoPE(Q,K)--> causal   |
  |   |                attention --> W_o --+         |
  |   x <------------------- (+) ----------+         |
  |   +--> RMSNorm --> SwiGLU MLP (d -> 3.5d -> d) --+
  |   x <------------------- (+) ----------+         |
  +---+----------------------------------------------+
      |
  RMSNorm --> LM head (d x vocab) --> logits --> softmax`,
      code: [
        {
          language: 'python',
          title: 'A minimal Llama-style decoder block in PyTorch (RMSNorm, RoPE, GQA, SwiGLU)',
          code: `import torch, torch.nn as nn, torch.nn.functional as F

class RMSNorm(nn.Module):
    def __init__(self, d, eps=1e-5):
        super().__init__(); self.g = nn.Parameter(torch.ones(d)); self.eps = eps
    def forward(self, x):
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.g

def rope(x, pos, base=500_000.0):            # x: (B, H, T, Dh)
    dh = x.shape[-1]
    inv = base ** (-torch.arange(0, dh, 2, dtype=torch.float32) / dh)  # theta_i
    ang = pos[:, None].float() * inv[None, :]                          # (T, Dh/2)
    cos, sin = ang.cos(), ang.sin()
    x1, x2 = x[..., 0::2], x[..., 1::2]                               # pairs
    return torch.stack([x1 * cos - x2 * sin, x1 * sin + x2 * cos], -1).flatten(-2)

class Block(nn.Module):
    def __init__(self, d=512, n_heads=8, n_kv=2, d_ff=1408):
        super().__init__()
        self.h, self.kv, self.dh = n_heads, n_kv, d // n_heads
        self.q = nn.Linear(d, d, bias=False)
        self.k = nn.Linear(d, n_kv * self.dh, bias=False)   # GQA: fewer K/V heads
        self.v = nn.Linear(d, n_kv * self.dh, bias=False)
        self.o = nn.Linear(d, d, bias=False)
        self.gate, self.up = nn.Linear(d, d_ff, bias=False), nn.Linear(d, d_ff, bias=False)
        self.down = nn.Linear(d_ff, d, bias=False)
        self.n1, self.n2 = RMSNorm(d), RMSNorm(d)

    def forward(self, x):                                   # x: (B, T, d)
        B, T, _ = x.shape
        pos = torch.arange(T, device=x.device)
        h = self.n1(x)
        q = self.q(h).view(B, T, self.h, self.dh).transpose(1, 2)
        k = self.k(h).view(B, T, self.kv, self.dh).transpose(1, 2)
        v = self.v(h).view(B, T, self.kv, self.dh).transpose(1, 2)
        q, k = rope(q, pos), rope(k, pos)                   # RoPE on Q and K only
        a = F.scaled_dot_product_attention(q, k, v, is_causal=True, enable_gqa=True)
        x = x + self.o(a.transpose(1, 2).reshape(B, T, -1))  # residual add
        h = self.n2(x)
        return x + self.down(F.silu(self.gate(h)) * self.up(h))  # SwiGLU + residual

print(Block()(torch.randn(2, 16, 512)).shape)   # torch.Size([2, 16, 512])`,
        },
      ],
      prosCons: {
        pros: [
          'Residual stream + pre-norm make 30–120-layer stacks trainable and let each layer make small, composable edits.',
          'RoPE gives relative-position behaviour with no learned position table and extends to longer contexts with scaling tricks.',
          'Uniform repeated blocks make parameter, memory and FLOP estimates simple arithmetic.',
        ],
        cons: [
          { con: 'Quality degrades sharply beyond the trained context length with RoPE.', fix: 'Use RoPE scaling (NTK-aware base increase, YaRN, or Llama 3.1-style frequency scaling) and briefly fine-tune on long sequences.' },
          { con: 'Activation outliers in the residual stream make low-bit quantisation hard.', fix: 'Use outlier-aware quantisation (AWQ, SmoothQuant-style scaling) or keep sensitive layers at higher precision.' },
          { con: 'MLP-heavy parameter count makes inference memory-bound at small batch.', fix: 'Batch requests, quantise weights, or use MoE layers so each token activates only a subset of MLP experts.' },
        ],
      },
      keyPoints: [
        'Pre-norm: x = x + f(Norm(x)), twice per layer.',
        'RoPE rotates Q and K by position; dot products depend on relative offset.',
        'MLP ≈ 2/3 of parameters; attention mixes information across tokens.',
        'Params/layer ≈ 2d² + 2d·d_kv + 3·d·d_ff.',
      ],
      exercise: {
        prompt: `Implement RoPE in **numpy** for a single vector and prove its key property.

Write \`rope_vec(x, m, base=10000)\` that rotates each pair \`(x[2i], x[2i+1])\` by angle \`m · base^(−2i/d)\`. Then show numerically that \`rope_vec(q, m) · rope_vec(k, n)\` is the same for (m, n) = (3, 1) and (10, 8), i.e. depends only on m − n, and that the vector norm is unchanged.

Acceptance: both dot products match to 1e-9 and \`np.linalg.norm\` is preserved.`,
        starter: {
          language: 'python',
          code: `import numpy as np

def rope_vec(x, m, base=10000.0):
    d = x.shape[0]
    # TODO: theta_i for i in 0..d/2-1
    # TODO: rotate pairs (x[0::2], x[1::2]) by angle m * theta_i
    ...

rng = np.random.default_rng(0)
q, k = rng.normal(size=8), rng.normal(size=8)
# TODO: compare dot products for (3,1) and (10,8); check norms`,
        },
        hints: [
          'theta = base ** (-np.arange(0, d, 2) / d) gives d/2 frequencies.',
          'For each pair: (a, b) → (a·cos − b·sin, a·sin + b·cos).',
          'Interleave the rotated pairs back with an empty array and slicing [0::2], [1::2].',
        ],
        solution: {
          language: 'python',
          code: `import numpy as np

def rope_vec(x, m, base=10000.0):
    d = x.shape[0]
    theta = base ** (-np.arange(0, d, 2) / d)
    ang = m * theta
    a, b = x[0::2], x[1::2]
    out = np.empty_like(x)
    out[0::2] = a * np.cos(ang) - b * np.sin(ang)
    out[1::2] = a * np.sin(ang) + b * np.cos(ang)
    return out

rng = np.random.default_rng(0)
q, k = rng.normal(size=8), rng.normal(size=8)
d1 = rope_vec(q, 3) @ rope_vec(k, 1)
d2 = rope_vec(q, 10) @ rope_vec(k, 8)
print(d1, d2)
assert abs(d1 - d2) < 1e-9                                 # depends only on m - n
assert abs(np.linalg.norm(rope_vec(q, 7)) - np.linalg.norm(q)) < 1e-12  # rotation`,
        },
        explanation: 'Each pair is rotated by R(mθ) for q and R(nθ) for k; since Rᵀ(mθ)R(nθ) = R((n−m)θ), the dot product only sees the offset. Rotations preserve length, so RoPE injects position without changing the vector\'s magnitude, and it is applied to Q and K only because only their dot product needs position.',
      },
      quickCheck: {
        question: 'Why do modern LLMs use pre-norm (x + f(Norm(x))) instead of post-norm (Norm(x + f(x)))?',
        options: [
          'Pre-norm uses fewer parameters',
          'The identity path through the residual stream stays un-normalised, so gradients flow directly through dozens of layers and training is stable without careful warm-up',
          'Pre-norm removes the need for attention masking',
          'Post-norm cannot be used with RoPE',
        ],
        correct: 1,
        explanation: 'With pre-norm, the residual path is a clean sum from input to output, so gradients reach early layers unimpeded; post-norm puts a normalisation on that path, which made deep models unstable without warm-up tricks. Parameter counts are the same, and norm placement is unrelated to masking or RoPE.',
      },
      source: 'Vaswani et al. 2017; Su et al. 2021 — RoFormer; Shazeer 2020 — SwiGLU; Llama 3 config',
    },
    {
      heading: 'Attention Mechanisms — scaled dot-product, causal masks, MHA/MQA/GQA and FlashAttention',
      body: `**Intuition:** each token asks a question (query); every token advertises what it contains (key) and what it hands over (value). Attention scores each key against the query, softmaxes the scores into weights, and returns the weighted mix of values.

**Scaled dot-product attention:** \`softmax(Q Kᵀ / √d_k + M) V\`.
- **√d_k scaling:** dot products of random d_k-dim vectors have variance ≈ d_k; dividing keeps logits around unit scale so softmax does not saturate into one-hot (vanishing gradients).
- **Causal mask M:** 0 on and below the diagonal, −∞ above, added **before** softmax, so token t only attends to positions ≤ t. That is what makes next-token training and KV caching possible.

**Heads and KV sharing:**

| Variant | KV heads | KV cache (relative) | Quality |
|---|---|---|---|
| MHA | = query heads (32) | 1× | baseline |
| GQA | groups (8) | 1/4 | ≈ MHA |
| MQA | 1 | 1/32 | small drop |
| MLA (DeepSeek) | low-rank latent | ~1/10–1/30 | ≈ MHA |

Heads specialise (syntax, coreference, copying). GQA shares each K/V head across a group of query heads, cutting the KV cache and memory bandwidth in decode with little quality loss, which is why Llama 3, Qwen and Mistral use it.

**FlashAttention:** naive attention writes the full N×N score matrix to GPU HBM and reads it back. FlashAttention tiles Q, K, V into blocks that fit in on-chip SRAM, computes scores block by block and uses an **online softmax** (running max and running sum, rescaling partial results), so the N×N matrix never exists in HBM. Result: exact attention, O(N) extra memory, several-fold speed-ups (FA2 ~2× FA1; FA3 reaches ~75% of H100 peak in FP16).

**When this matters:** choosing long-context models (KV size), debugging masks/padding, and understanding why long prompts are expensive.`,
      example: `Three tokens, d_k = 2. Keys K = [1,0], [0,1], [1,1]; values V = [1,0], [0,2], [3,1].
**Token 3** (query [1,0]) sees all three: scores = [1, 0, 1] / √2 = [0.707, 0, 0.707]; exp → [2.028, 1.000, 2.028]; sum 5.056 → weights **[0.401, 0.198, 0.401]**. Output = 0.401·[1,0] + 0.198·[0,2] + 0.401·[3,1] = **[1.604, 0.797]**.
**Token 2** (query [0,1]) under the causal mask: scores = [0, 0.707, −∞]; exp → [1, 2.028, 0]; weights **[0.330, 0.670, 0]**; output = [0.330, 1.340].
Without √2 scaling, token 3's weights would be [0.42, 0.16, 0.42]; at d_k = 128 the unscaled logits grow ~11× larger and softmax becomes almost one-hot.`,
      diagram: `   Q (T x d_k)     K^T (d_k x T)          causal mask (T=4)
      |               |                  [ 0  -inf -inf -inf ]
      +----- QK^T / sqrt(d_k) ---+       [ 0   0   -inf -inf ]
                                 |  +    [ 0   0    0   -inf ]
                                 v       [ 0   0    0    0   ]
                            softmax (row-wise)
                                 |
                                 v
                       weights (T x T) @ V (T x d_v) --> out (T x d_v)

  GQA: Q heads  q1 q2 q3 q4 | q5 q6 q7 q8     (8 query heads)
       KV heads    kv1      |    kv2          (2 shared K/V heads)

  FlashAttention: for each Q tile -> loop K/V tiles in SRAM,
                  keep running max m, sum l, acc; never store T x T`,
      code: [
        {
          language: 'python',
          title: 'Attention from scratch in numpy (reproduces the worked example) and checked against PyTorch',
          code: `import numpy as np
import torch, torch.nn.functional as F

def softmax(x, axis=-1):
    x = x - x.max(axis=axis, keepdims=True)          # numerical stability
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)

def attention(Q, K, V, causal=True):
    T, dk = Q.shape
    scores = Q @ K.T / np.sqrt(dk)                    # (T, T)
    if causal:
        mask = np.triu(np.ones((T, T), dtype=bool), k=1)   # True above diagonal
        scores = np.where(mask, -np.inf, scores)            # mask BEFORE softmax
    w = softmax(scores)
    return w @ V, w

Q = np.array([[1., 1.], [0., 1.], [1., 0.]])          # queries for tokens 1..3
K = np.array([[1., 0.], [0., 1.], [1., 1.]])
V = np.array([[1., 0.], [0., 2.], [3., 1.]])
out, w = attention(Q, K, V)
np.set_printoptions(precision=3, suppress=True)
print(w)        # row 2: [0.33 0.67 0.  ], row 3: [0.401 0.198 0.401]
print(out)      # row 3: [1.604 0.797]

ref = F.scaled_dot_product_attention(
    *(torch.tensor(a)[None, None] for a in (Q, K, V)), is_causal=True)
assert np.allclose(ref[0, 0].numpy(), out, atol=1e-6)`,
        },
      ],
      prosCons: {
        pros: [
          'Every token can draw directly on any earlier token in one step: no recurrence bottleneck.',
          'Fully parallel over the sequence during training and prefill, mapping well onto GPU matmuls.',
          'GQA/MQA/MLA and FlashAttention make long contexts practical in memory and speed.',
        ],
        cons: [
          { con: 'Compute grows quadratically with sequence length (N² scores per head per layer).', fix: 'Use FlashAttention for memory, sliding-window or hybrid local/global attention for very long inputs, and keep prompts lean with retrieval.' },
          { con: 'The KV cache grows linearly with context and batch, dominating decode memory.', fix: 'Choose GQA/MLA models, quantise the KV cache to FP8, and cap max context per deployment.' },
          { con: 'Mask and padding bugs silently leak future tokens or attend to padding.', fix: 'Use library kernels (is_causal=True, attention_mask) and add a unit test that perturbing future tokens does not change earlier outputs.' },
        ],
      },
      keyPoints: [
        'softmax(QKᵀ/√d_k + mask)V; mask before the softmax.',
        'GQA shares K/V heads: 4–8× smaller KV cache at ≈ MHA quality.',
        'FlashAttention is exact; it saves memory traffic, not FLOPs.',
        'Online softmax: running max + running sum with rescaling.',
      ],
      exercise: {
        prompt: `Implement the core of FlashAttention for **one query vector**: \`online_attention(q, K, V, block=2)\` that processes K/V in blocks, keeping only a running max \`m\`, running denominator \`l\` and running weighted sum \`acc\`.

Acceptance: the result equals full \`softmax(q·Kᵀ/√d) V\` to 1e-9 for random inputs with T = 7 and block sizes 1, 2 and 3, and you never build the full score vector at once.`,
        starter: {
          language: 'python',
          code: `import numpy as np

def online_attention(q, K, V, block=2):
    d = q.shape[0]
    m, l, acc = -np.inf, 0.0, np.zeros(V.shape[1])
    for s in range(0, K.shape[0], block):
        scores = K[s:s + block] @ q / np.sqrt(d)
        # TODO: new max, rescale old l and acc, add this block's contribution
        ...
    return acc / l`,
        },
        hints: [
          'm_new = max(m, scores.max()); the correction factor for old values is exp(m − m_new).',
          'p = exp(scores − m_new); l = l·corr + p.sum(); acc = acc·corr + p @ V_block.',
          'np.exp(-np.inf) is 0, so the first block works without special-casing.',
        ],
        solution: {
          language: 'python',
          code: `import numpy as np

def online_attention(q, K, V, block=2):
    d = q.shape[0]
    m, l, acc = -np.inf, 0.0, np.zeros(V.shape[1])
    for s in range(0, K.shape[0], block):
        scores = K[s:s + block] @ q / np.sqrt(d)
        m_new = max(m, scores.max())
        corr = np.exp(m - m_new)             # rescale previous partial sums
        p = np.exp(scores - m_new)
        l = l * corr + p.sum()
        acc = acc * corr + p @ V[s:s + block]
        m = m_new
    return acc / l

rng = np.random.default_rng(1)
q, K, V = rng.normal(size=4), rng.normal(size=(7, 4)), rng.normal(size=(7, 3))
s = K @ q / 2.0
w = np.exp(s - s.max()); w /= w.sum()
for b in (1, 2, 3):
    assert np.allclose(online_attention(q, K, V, b), w @ V, atol=1e-9)`,
        },
        explanation: 'Softmax needs the global max and sum, but both can be maintained incrementally: whenever a larger max appears, previous exponentials are rescaled by exp(old_max − new_max). FlashAttention applies this per tile of queries on-chip, which is why it is exact while never writing the T×T matrix to HBM.',
      },
      quickCheck: {
        question: 'Llama-3-8B has 32 query heads and 8 KV heads. Compared with an MHA version of the same model, what does GQA change?',
        options: [
          'Attention FLOPs for computing QKᵀ drop 4×',
          'The KV cache and the K/V memory read per decode step shrink 4×, with each K/V head shared by 4 query heads',
          'Each query head sees only a quarter of the sequence',
          'The number of query heads drops to 8',
        ],
        correct: 1,
        explanation: 'GQA reduces the number of stored K/V heads (32 → 8), so KV memory and bandwidth shrink 4×. All 32 query heads still compute scores against the full sequence (FLOPs largely unchanged), and the query head count stays 32.',
      },
      source: 'Vaswani et al. 2017; Ainslie et al. 2023 — GQA; Dao et al. 2022 — FlashAttention',
    },
    {
      heading: 'Scaling Laws — compute-optimal training, over-training and test-time compute',
      body: `**Intuition:** a training budget buys two things, a bigger brain (parameters N) and more reading (tokens D). Scaling laws are the empirical price list that says which mix gives the lowest loss for the money, and they changed their answer once.

**The budget equation:** training compute C ≈ **6·N·D** FLOPs (≈ 2 for the forward pass and 4 for the backward pass, per parameter per token). Inference costs ≈ **2·N** FLOPs per token.

**Kaplan et al. 2020 (OpenAI):** test loss falls as a smooth power law in N, D and C across many orders of magnitude. Their fits said extra compute should go mostly into a bigger model. GPT-3 (175B parameters, ~300B tokens) is roughly that recipe.

**Hoffmann et al. 2022 (DeepMind, "Chinchilla"):** re-ran the study with learning-rate schedules matched to each run's length and found N and D should grow **in equal proportion** with compute: about **20 tokens per parameter**. Chinchilla (70B, 1.4T tokens) beat the 280B Gopher trained on the same compute. Their loss fit has the form L(N, D) = E + A/N^α + B/D^β: an irreducible floor E plus one term that shrinks with size and one that shrinks with data.

**Over-training on purpose:** compute-optimal minimises *training* cost for a given loss. A deployed model is then run for trillions of tokens, and every one of them costs 2·N. So it pays to train a smaller model far past 20 tokens/parameter: Llama 3 8B saw ~15T tokens (~1,900 per parameter). Sardana & Frankle 2024 formalised this: once you count expected inference demand, the optimal model is smaller and trained longer.

**Test-time compute:** the newest axis spends FLOPs at inference instead: longer reasoning chains (reasoning models such as OpenAI o1, 2024), sampling many answers and picking with a verifier, or search. Snell et al. 2024 showed that on some tasks a smaller model given well-allocated test-time compute can match a much larger one. The price moves from a one-off training bill to a per-query bill and to latency.

**Caveats:**
- Laws predict **loss**, not specific skills; abilities that look like they "emerge" at a size often reflect a pass/fail metric (Schaeffer et al. 2023).
- Data quality, tokenizer and architecture (MoE, next section) shift the constants.
- High-quality text is finite, so data, not compute, is becoming the binding constraint.

**Why an AI engineer cares:** it explains why small open models are so strong, why "8B trained on 15T" is a design for cheap serving, and why reasoning effort is a cost dial you set per request.`,
      example: `Chinchilla's budget: C = 6 × 70e9 × 1.4e12 ≈ **5.9e23 FLOPs**. With D = 20·N, C = 120·N², so N = √(5.9e23 / 120) ≈ **70B** and D ≈ **1.4T**: the rule reproduces the paper's model.
Llama 3 8B: C = 6 × 8e9 × 15e12 = **7.2e23 FLOPs**, about 1.2× the same budget, spent on a model ~9× smaller.
- Plugging both into the published Chinchilla fit (E 1.69, A 406.4, B 410.7, α 0.34, β 0.28) gives predicted losses of 1.937 vs 1.949: nearly the same.
- Serving cost per token: 2 × 70e9 = 140 GFLOPs vs 2 × 8e9 = 16 GFLOPs, **~8.75× cheaper**, and it fits on a single consumer GPU.
- The extra 1.3e23 training FLOPs are paid back after about **1.1T served tokens** (1.3e23 / (140e9 − 16e9)), which a popular model passes quickly.`,
      diagram: `loss
 │╲  bigger N, same D: data term B/D^β stops falling
 │ ╲___________
 │  ╲          ‾‾‾‾‾‾‾‾‾‾  ← under-trained (Kaplan-style, ~1.7 tok/param)
 │   ╲
 │    ╲___  compute-optimal frontier (D ≈ 20·N)
 │        ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
 │ - - - - - - - - - - - - - - - - - -  E: irreducible loss
 └──────────────────────────────────▶ training compute C ≈ 6·N·D

 where compute goes:  pretraining (6ND, once) → serving (2N per token, forever)
                      → test-time reasoning (more tokens per query)`,
      code: [
        {
          language: 'python',
          title: 'chinchilla.py — compute-optimal split vs an over-trained small model',
          code: `import math

# Hoffmann et al. 2022, approach 3 fit: L(N, D) = E + A / N^alpha + B / D^beta
E, A, B, ALPHA, BETA = 1.69, 406.4, 410.7, 0.34, 0.28

def loss(n, d):
    return E + A / n**ALPHA + B / d**BETA

def chinchilla_split(c, tokens_per_param=20):
    n = math.sqrt(c / (6 * tokens_per_param))   # C = 6 N D and D = 20 N  ->  C = 120 N^2
    return n, tokens_per_param * n

c = 6 * 70e9 * 1.4e12                           # Chinchilla's training budget, ~5.9e23 FLOPs
n, d = chinchilla_split(c)
print(f"compute-optimal: N={n/1e9:.0f}B  D={d/1e12:.2f}T  loss={loss(n, d):.3f}")

# similar compute, spent on a much smaller model trained far longer (Llama-3-8B style)
n8, d8 = 8e9, 15e12
print(f"over-trained:    N=8B   D=15T   C={6*n8*d8:.2e}  loss={loss(n8, d8):.3f}  tokens/param={d8/n8:.0f}")
print(f"decode FLOPs per token: 70B={2*n/1e9:.0f} GFLOPs, 8B={2*n8/1e9:.0f} GFLOPs")
# compute-optimal: N=70B  D=1.40T  loss=1.937
# over-trained:    N=8B   D=15T   C=7.20e+23  loss=1.949  tokens/param=1875
# decode FLOPs per token: 70B=140 GFLOPs, 8B=16 GFLOPs`,
        },
      ],
      prosCons: {
        pros: [
          'Loss is predictable from small runs, so labs size big runs before spending the money.',
          'The 6·N·D and 2·N rules give quick, defensible estimates of training and serving cost.',
          'Over-training produces small models that are cheap and fast to serve with modest quality loss.',
          'Test-time compute adds a per-request quality dial without retraining.',
        ],
        cons: [
          {
            con: 'Loss curves do not tell you when a specific capability (multi-step maths, tool use) will appear.',
            fix: 'Track task evals with continuous scores (log-likelihood of the right answer, partial credit) alongside loss, not only pass/fail benchmarks.',
          },
          {
            con: 'The 20 tokens/parameter rule ignores inference demand, so it picks models that are too big to serve cheaply.',
            fix: 'Include expected served tokens in the budget (train + 2·N per served token) and pick the smallest model that meets the quality bar.',
          },
          {
            con: 'Test-time compute raises cost and latency on every query.',
            fix: 'Route: give reasoning budget only to hard requests (difficulty classifier or a cascade) and cap reasoning tokens per tier.',
          },
        ],
      },
      keyPoints: [
        'Training ≈ 6·N·D FLOPs; inference ≈ 2·N FLOPs per token.',
        'Kaplan 2020: smooth power laws; favoured bigger models.',
        'Chinchilla 2022: scale N and D together, ~20 tokens per parameter.',
        'Popular models are over-trained on purpose to cut serving cost.',
        'Test-time compute trades per-query cost for quality.',
      ],
      exercise: {
        prompt: `Write \`chinchilla_split(c)\` returning compute-optimal \`(N, D)\` at 20 tokens/parameter, and \`breakeven_tokens(big, small)\` returning how many **served tokens** it takes before an over-trained small model uses less lifetime compute (training 6·N·D plus 2·N per served token) than a bigger compute-optimal one.

Acceptance: \`chinchilla_split(5.88e23)\` ≈ (70e9, 1.4e12) within 1%; \`breakeven_tokens((70e9, 1.4e12), (8e9, 15e12))\` is between 1.0e12 and 1.1e12.`,
        starter: {
          language: 'python',
          code: `import math

def chinchilla_split(c, tokens_per_param=20):
    ...

def breakeven_tokens(big, small):
    (nb, db), (ns, ds) = big, small
    ...`,
        },
        hints: [
          'Substitute D = 20·N into C = 6·N·D: C = 120·N², so N = √(C / 120).',
          'Extra training paid by the small model: 6·ns·ds − 6·nb·db.',
          'Saved per served token: 2·nb − 2·ns. Divide the first by the second (and never return a negative number).',
        ],
        solution: {
          language: 'python',
          code: `import math

def chinchilla_split(c, tokens_per_param=20):
    n = math.sqrt(c / (6 * tokens_per_param))
    return n, tokens_per_param * n

def breakeven_tokens(big, small):
    """Served tokens after which the over-trained small model costs less lifetime compute."""
    (nb, db), (ns, ds) = big, small
    extra_train = 6 * ns * ds - 6 * nb * db
    saved_per_token = 2 * nb - 2 * ns
    return max(0.0, extra_train / saved_per_token)

n, d = chinchilla_split(5.88e23)
assert abs(n - 70e9) / 70e9 < 0.01 and abs(d - 1.4e12) / 1.4e12 < 0.01
t = breakeven_tokens((70e9, 1.4e12), (8e9, 15e12))
assert 1.0e12 < t < 1.1e12
print(f"{t:.3e}")  # 1.065e+12`,
        },
        explanation:
          'The small model pays ~1.3e23 extra FLOPs up front but saves 124 GFLOPs on every served token, so it wins after ~1.07T tokens. A model with millions of users serves that in weeks, which is why open-weight families ship heavily over-trained small sizes. The calculation ignores quality differences: it only holds when both models clear your eval bar.',
      },
      quickCheck: {
        question: 'Llama 3 8B was trained on about 15T tokens, roughly 90× the Chinchilla ratio. What is the main reason?',
        options: [
          'Chinchilla scaling was shown to be wrong for models under 10B parameters',
          'It trades extra one-off training compute for a smaller model that is much cheaper to serve on every token',
          'More tokens increase the context window the model supports',
          'Tokens are cheaper than parameters in the 6·N·D formula',
        ],
        correct: 1,
        explanation:
          'Chinchilla optimises training compute only. Inference costs ~2·N FLOPs per token forever, so a smaller model trained far longer reaches similar loss with much cheaper serving. Chinchilla was not refuted for small models, training length does not set the context window, and N and D carry equal weight in 6·N·D.',
      },
      source: 'Kaplan et al. 2020 — Scaling Laws for Neural Language Models; Hoffmann et al. 2022 — Training Compute-Optimal LLMs (Chinchilla); Sardana & Frankle 2024; Snell et al. 2024',
    },
    {
      heading: 'Mixture of Experts — routers, top-k experts, total vs active parameters',
      body: `**Intuition:** a hospital does not send every patient to every specialist. A triage nurse (the **router**) reads each case and sends it to the two most relevant doctors (the **top-k experts**). The hospital employs many doctors (total parameters) but each patient only takes up a couple of them (active parameters).

**Mechanics:** in an MoE transformer, the dense MLP in each layer is replaced by **E expert MLPs** plus a small **router** (one linear layer, d_model → E). For each token:
1. router logits → softmax → pick the **top-k** experts (k is 1 or 2 in classic designs, 8 in fine-grained ones),
2. run the token through only those experts,
3. output = gate-weighted sum of their outputs (gates renormalised over the chosen k), added to the residual stream.
Attention, norms and embeddings stay dense and shared. Routing happens per token *and per layer*, so one sentence can use different experts at every layer.

**Total vs active parameters:**

| Model | Experts per layer | Active per token | Total | Active |
|---|---|---|---|---|
| Mixtral 8x7B | 8 | top-2 | 46.7B | ~12.9B |
| DeepSeek-V3 | 1 shared + 256 routed | shared + top-8 | 671B | 37B |

"8x7B" is not 56B: only the MLPs are duplicated, attention and embeddings are shared.

**Load balancing:** routers collapse: a few experts get most tokens, the rest stay untrained. Fixes:
- an **auxiliary balance loss** (Switch Transformer, Fedus et al. 2021) that penalises uneven routing,
- an **expert capacity** limit per batch, with overflow tokens dropped or passed through,
- DeepSeek-V3's **auxiliary-loss-free** method: a per-expert bias added to the scores only when *selecting* experts, nudged up or down after each step according to load.

**Memory vs compute:** compute per token follows **active** parameters; memory follows **total** parameters, because every expert must be resident. Mixtral generates at roughly the speed of a ~13B dense model but needs memory for ~47B (≈ 93 GB in bf16). At large batch sizes different tokens hit different experts, so all experts are read each step anyway; the win is FLOPs per token, not memory. Large MoEs are served with **expert parallelism** (experts sharded across GPUs), which adds all-to-all communication.

**When MoE fits:** high-traffic serving where quality per FLOP matters and you have the memory (or a provider runs it). It fits poorly on edge devices with tight memory, and fine-tuning and quantising it is fiddlier (router stability, rarely used experts).`,
      example: `Mixtral 8x7B from its config: d = 4096, 32 layers, SwiGLU d_ff = 14,336, 8 experts, top-2, 32 query / 8 KV heads (head_dim 128), vocab 32,000.
- One expert: 3 × 4096 × 14,336 = **176.2M**; 8 experts × 32 layers = **45.1B**.
- Attention per layer: Q + O = 2 × 4096² = 33.6M, K + V = 2 × 4096 × 1024 = 8.4M → 41.9M × 32 = **1.34B**.
- Embedding + LM head: 2 × 32,000 × 4096 = **0.26B**; router 4096 × 8 × 32 ≈ 1M.
- **Total ≈ 46.7B. Active** = 2 experts × 176.2M × 32 (11.3B) + 1.34B + 0.26B ≈ **12.9B**.
So per token Mixtral does the matmul work of a ~13B dense model, while its weights need ~93 GB in bf16, or ~23 GB at 4-bit.`,
      diagram: `            token h (d_model)
                 │
            router: softmax(h · W_r)  →  [0.05 0.41 0.02 0.08 0.30 0.04 0.06 0.04]
                 │ top-2: expert 2 (0.41), expert 5 (0.30)
        ┌────────┴────────┐          gates renormalised: 0.58, 0.42
        ▼                 ▼
   Expert 2 (MLP)    Expert 5 (MLP)      Experts 1,3,4,6,7,8: idle for this token
        │                 │              (still loaded in memory)
        └── 0.58·e2 + 0.42·e5 ──▶ add to residual stream

 Attention, norms, embeddings: dense and shared by every token`,
      code: [
        {
          language: 'python',
          title: 'moe_layer.py — top-2 routing, gate-weighted experts and a Switch-style balance loss',
          code: `import numpy as np

rng = np.random.default_rng(0)
T, d, E, k = 512, 64, 8, 2                      # tokens, hidden size, experts, experts per token
x = rng.normal(size=(T, d))
W_router = rng.normal(size=(d, E)) * 0.1
W_router[:, 3] += 0.3                           # a skewed router: expert 3 looks good to everyone
experts = [rng.normal(size=(d, d)) / np.sqrt(d) for _ in range(E)]   # one matrix per expert, for brevity

def softmax(z):
    z = z - z.max(-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(-1, keepdims=True)

probs = softmax(x @ W_router)                   # (T, E) router probabilities
topk = np.argsort(-probs, axis=1)[:, :k]        # chosen experts per token
gates = np.take_along_axis(probs, topk, 1)
gates /= gates.sum(1, keepdims=True)            # renormalise over the k chosen (Mixtral-style)

out = np.zeros_like(x)
for e in range(E):
    rows, slot = np.nonzero(topk == e)          # tokens routed to expert e
    out[rows] += gates[rows, slot, None] * (x[rows] @ experts[e])

f = np.bincount(topk.ravel(), minlength=E) / (T * k)   # share of routed slots per expert
P = probs.mean(0)                                      # mean router probability per expert
aux = E * np.sum(f * P)                                # Switch-style balance loss: 1.0 when uniform
print("load per expert:", np.round(f, 3))              # expert 3 takes ~0.20 vs 0.125 fair share
print(f"aux loss = {aux:.3f} (1.0 = perfectly balanced)")  # 1.093`,
        },
      ],
      prosCons: {
        pros: [
          'Much more knowledge capacity per FLOP: total parameters grow without growing per-token compute.',
          'Decode speed close to a dense model the size of the active parameters.',
          'Experts can be sharded across GPUs (expert parallelism) to scale serving.',
        ],
        cons: [
          {
            con: 'Memory follows total parameters, so an MoE needs far more VRAM than its speed suggests.',
            fix: 'Quantise expert weights (4–8 bit), shard experts across GPUs, or offload rarely used experts; for small deployments pick a dense model of the same active size.',
          },
          {
            con: 'Router collapse leaves experts idle and wastes capacity.',
            fix: 'Train with an auxiliary balance loss or bias-based balancing, set a capacity factor, and monitor per-expert load during training and serving.',
          },
          {
            con: 'Expert parallelism adds all-to-all traffic and makes outputs depend on batch composition.',
            fix: 'Use serving engines with optimised MoE kernels (vLLM, SGLang), keep expert groups within fast NVLink domains, and do not assume bitwise-reproducible outputs across batches.',
          },
        ],
      },
      keyPoints: [
        'MoE swaps the dense MLP for E experts and a router; attention stays dense.',
        'Top-k routing per token per layer; gates weight the chosen experts.',
        'Compute follows active parameters; memory follows total parameters.',
        'Mixtral 8x7B: 46.7B total, ~12.9B active (top-2 of 8).',
        'Balance the load: aux loss, capacity limits or bias-based routing.',
      ],
      exercise: {
        prompt: `Write \`moe_params(d, layers, d_ff, n_experts, top_k, n_heads, n_kv_heads, vocab)\` returning \`(total, active)\` parameter counts for a Llama-style MoE with SwiGLU experts, GQA attention, a router per layer and untied embeddings (ignore norms).

Acceptance (Mixtral 8x7B config: d 4096, 32 layers, d_ff 14,336, 8 experts, top-2, 32 heads, 8 KV heads, vocab 32,000): total rounds to **46.7B**, active to **12.9B**.`,
        hints: [
          'head_dim = d / n_heads; attention = Q and O (d × n_heads·head_dim each) + K and V (d × n_kv_heads·head_dim each).',
          'One SwiGLU expert = 3 × d × d_ff (gate, up, down). The router is d × n_experts.',
          'Active counts top_k experts per layer; everything else is the same in both totals.',
        ],
        solution: {
          language: 'python',
          code: `def moe_params(d, layers, d_ff, n_experts, top_k, n_heads, n_kv_heads, vocab):
    head_dim = d // n_heads
    attn = 2 * d * n_heads * head_dim + 2 * d * n_kv_heads * head_dim   # Q, O + K, V
    expert = 3 * d * d_ff                                               # SwiGLU: gate, up, down
    router = d * n_experts
    embed = 2 * vocab * d                                               # input embedding + LM head
    total = layers * (attn + n_experts * expert + router) + embed
    active = layers * (attn + top_k * expert + router) + embed
    return total, active

total, active = moe_params(4096, 32, 14336, 8, 2, 32, 8, 32000)
print(f"total {total/1e9:.1f}B, active {active/1e9:.1f}B")   # total 46.7B, active 12.9B
assert round(total / 1e9, 1) == 46.7 and round(active / 1e9, 1) == 12.9`,
        },
        explanation:
          'Experts are ~97% of Mixtral\'s weights, so total parameters are dominated by n_experts × expert while active parameters use top_k × expert. The shared attention and embeddings (~1.6B) are why "8x7B" lands at 46.7B rather than 56B, and why the active count is ~12.9B rather than 14B.',
      },
      quickCheck: {
        question: 'You move from a dense 13B model to Mixtral 8x7B (top-2 of 8 experts). What happens to per-token compute and to weight memory?',
        options: [
          'Both stay about the same, since only ~13B parameters are active',
          'Compute stays near the 13B model; weight memory grows about 3.6× because all experts must be loaded',
          'Compute grows 8×; memory stays the same',
          'Both grow about 8×',
        ],
        correct: 1,
        explanation:
          'Active parameters (~12.9B) set the FLOPs per token, so compute is similar to the dense 13B. But all 46.7B parameters must sit in memory: ~3.6× the dense model. Experts are not computed for every token, and they are never loaded on demand from disk per token in normal serving.',
      },
      source: 'Shazeer et al. 2017 — Sparsely-Gated MoE; Fedus et al. 2021 — Switch Transformer; Jiang et al. 2024 — Mixtral of Experts; DeepSeek-AI 2024 — DeepSeek-V3',
    },
    {
      heading: 'Beyond Full Attention — KV-cache sizing, sliding windows, hybrids and state-space models',
      body: `**Intuition:** full attention lets every token reread the whole conversation, and the KV cache is the stack of notes that makes rereading possible. The variants below keep fewer notes (sliding windows) or replace them with a fixed-size summary (state-space models).

**KV-cache size** (per sequence): **2 × layers × n_kv_heads × head_dim × bytes × tokens** (the 2 is K and V).
- Llama-3-8B (32 layers, 8 KV heads, head_dim 128, bf16): **128 KiB per token**: 1 GiB at 8k tokens, 4 GiB at 32k. The MHA version would need 512 KiB per token, which is why GQA (previous section) matters.
- Multiply by the batch: concurrency × context, not model size, is usually what runs a GPU out of memory.

**Sliding-window attention (SWA):** each token attends only to the last W tokens. Compute drops from O(N²) to O(N·W), and each layer's cache becomes a **rolling buffer of W tokens**. Information still travels further through depth (layer 2 sees what layer 1 saw), but it fades, so pure SWA is weak at exact recall from far back. Mistral 7B used a 4,096-token window.

**Hybrid local/global:** interleave SWA layers with a few full-attention layers. Gemma 2 alternates local and global layers; Gemma 3 uses five local layers per global one. Only the global layers keep the whole context, so the KV cache shrinks several-fold while long-range recall survives.

**FlashAttention is not a variant:** it computes the same exact attention, just IO-aware (tiled in SRAM, no N×N matrix in HBM). It saves memory traffic, not FLOPs, and windowed or causal masks run inside the same kernels.

**Linear attention and state-space models:** drop the softmax over all past tokens and keep a **fixed-size state** updated per token, so time is O(N) and decode memory is constant per sequence.
- *Linear attention* (Katharopoulos et al. 2020) rewrites attention with a kernel feature map so it becomes a running sum.
- *Mamba* (Gu & Dao 2023) uses a selective state-space layer whose updates depend on the input.
- Weakness: a fixed state cannot store everything, so exact copying and needle-in-a-haystack recall lag full attention. Hybrids (Jamba mixes Mamba and attention layers) keep a few attention layers for that.

| Approach | Compute | KV / state per sequence | Long-range exact recall |
|---|---|---|---|
| Full (MHA/GQA) | O(N²) | grows with N | strong |
| Sliding window | O(N·W) | capped at W per layer | weak alone |
| Hybrid local/global | between | grows only in global layers | strong |
| Linear / SSM | O(N) | constant | weaker |`,
      example: `Serve a Llama-3-8B-shaped model at **32k context, 16 concurrent sequences** in bf16. KV per token per layer = 2 × 8 × 128 × 2 B = **4 KiB**.
- Full attention in all 32 layers: 4 KiB × 32 × 32,768 = **4 GiB per sequence**, **64 GiB** for the batch: more than the weights (~16 GB).
- Hypothetical hybrid with the same shape: 24 sliding-window layers (W = 1,024) + 8 global layers.
  - Global: 4 KiB × 8 × 32,768 = 1 GiB. Local: 4 KiB × 24 × 1,024 = 96 MiB.
  - **≈ 1.09 GiB per sequence, 17.5 GiB for the batch: 3.7× smaller**, freeing room for about 3.7× the concurrency.
- A pure SSM of similar size would keep a fixed state of a few MB per sequence regardless of context, but would be the weakest of the three at quoting a line from 30k tokens back.`,
      diagram: `causal full (N=8)        sliding window W=3        hybrid stack
  0 1 2 3 4 5 6 7          0 1 2 3 4 5 6 7          L1 local  ─┐
0 x                      0 x                        L2 local   │ KV capped at W
1 x x                    1 x x                      L3 local   │
2 x x x                  2 x x x                    L4 GLOBAL ─┘ KV grows with N
3 x x x x                3   x x x                  L5 local
4 x x x x x              4     x x x                ...
5 x x x x x x            5       x x x
6 x x x x x x x          6         x x x          SSM: state(t) = f(state(t-1), x_t)
7 x x x x x x x x        7           x x x             fixed size, O(N) time`,
      code: [
        {
          language: 'python',
          title: 'kv_and_window.py — KV-cache sizing and a sliding-window mask with PyTorch SDPA',
          code: `import torch, torch.nn.functional as F

def kv_cache_bytes(layers, n_kv_heads, head_dim, tokens, batch=1, bytes_per=2, window=None):
    """K and V for every layer; a sliding-window layer keeps at most \`window\` tokens."""
    kept = tokens if window is None else min(tokens, window)
    return 2 * layers * n_kv_heads * head_dim * bytes_per * kept * batch

GiB = 2**30
print("Llama-3-8B per token:", kv_cache_bytes(32, 8, 128, 1) // 1024, "KiB")            # 128 KiB
print("MHA version per token:", kv_cache_bytes(32, 32, 128, 1) // 1024, "KiB")          # 512 KiB
print("32k ctx x 16 seqs:", kv_cache_bytes(32, 8, 128, 32768, batch=16) / GiB, "GiB")   # 64.0 GiB

def sliding_window_mask(n, window):
    i = torch.arange(n)[:, None]
    j = torch.arange(n)[None, :]
    return (j <= i) & (j > i - window)            # True = may attend (causal and inside the window)

q = k = v = torch.randn(1, 4, 8, 16)               # (batch, heads, tokens, head_dim)
out = F.scaled_dot_product_attention(q, k, v, attn_mask=sliding_window_mask(8, window=3))
print(sliding_window_mask(8, 3).int())             # the banded matrix in the diagram
# a window as long as the sequence reproduces plain causal attention
assert torch.allclose(F.scaled_dot_product_attention(q, k, v, attn_mask=sliding_window_mask(8, 8)),
                      F.scaled_dot_product_attention(q, k, v, is_causal=True), atol=1e-6)`,
        },
      ],
      prosCons: {
        pros: [
          'Sliding windows cap per-layer KV memory and make attention cost linear in sequence length.',
          'Hybrid local/global stacks keep most of full attention\'s recall at a fraction of the KV cache.',
          'Linear attention and SSMs give constant-memory decode, attractive for very long streams.',
          'All of these compose with GQA, KV quantisation and FlashAttention-style kernels.',
        ],
        cons: [
          {
            con: 'Pure sliding-window models lose exact recall of tokens outside the window.',
            fix: 'Use hybrids with periodic global layers, or retrieve the relevant passage back into the window instead of relying on long context.',
          },
          {
            con: 'SSM and linear-attention models compress history into a fixed state and miss exact copying and needle-in-a-haystack lookups.',
            fix: 'Pick hybrid models that keep some attention layers, and evaluate on your own long-context retrieval tasks before switching.',
          },
          {
            con: 'Serving engines and prefix caches assume one KV layout; mixed window/global layers complicate memory managers.',
            fix: 'Use engine versions with explicit support for the model\'s layer types and check that the configured sliding_window is honoured (compare outputs with the reference implementation).',
          },
        ],
      },
      keyPoints: [
        'KV bytes = 2 × layers × n_kv_heads × head_dim × bytes × tokens × batch.',
        'Llama-3-8B: 128 KiB per token in bf16; 4 GiB at 32k.',
        'Sliding window: O(N·W) compute, KV capped at W per layer.',
        'Hybrids keep a few global layers for long-range recall.',
        'FlashAttention is exact attention with less memory traffic, not an approximation.',
        'Linear attention / SSMs: O(N), fixed state, weaker exact recall.',
      ],
      exercise: {
        prompt: `Write \`kv_cache_gib(windows, n_kv_heads, head_dim, tokens, batch=1, bytes_per=2)\` where \`windows\` has one entry per layer: \`None\` for a global layer, or an int window size for a sliding-window layer.

Acceptance (8 KV heads, head_dim 128, 32,768 tokens, bf16): 32 global layers → **4.0** GiB; the pattern \`[1024, 1024, 1024, None] × 8\` (24 local + 8 global) → **1.09375** GiB.`,
        starter: {
          language: 'python',
          code: `def kv_cache_gib(windows, n_kv_heads, head_dim, tokens, batch=1, bytes_per=2):
    ...

full = kv_cache_gib([None] * 32, 8, 128, 32768)
hybrid = kv_cache_gib(([1024] * 3 + [None]) * 8, 8, 128, 32768)`,
        },
        hints: [
          'Bytes per token per layer = 2 (K and V) × n_kv_heads × head_dim × bytes_per.',
          'A layer keeps tokens if it is global, else min(tokens, window).',
          'Sum the kept tokens over layers, multiply by the per-token bytes and the batch, divide by 2**30.',
        ],
        solution: {
          language: 'python',
          code: `def kv_cache_gib(windows, n_kv_heads, head_dim, tokens, batch=1, bytes_per=2):
    per_tok_layer = 2 * n_kv_heads * head_dim * bytes_per
    kept = sum(tokens if w is None else min(tokens, w) for w in windows)
    return per_tok_layer * kept * batch / 2**30

full = kv_cache_gib([None] * 32, 8, 128, 32768)
hybrid = kv_cache_gib(([1024] * 3 + [None]) * 8, 8, 128, 32768)
print(full, hybrid, round(full / hybrid, 2))   # 4.0 1.09375 3.66
assert full == 4.0 and abs(hybrid - 1.09375) < 1e-9`,
        },
        explanation:
          'Global layers store every token (8 × 32,768 × 4 KiB = 1 GiB); local layers store at most 1,024 tokens each (24 × 1,024 × 4 KiB = 96 MiB). The cache is now dominated by the few global layers, which is why hybrid models choose a high local-to-global ratio. The same function sizes a serving deployment: multiply by the concurrency you need and compare with GPU memory left after the weights.',
      },
      quickCheck: {
        question: 'A model uses sliding-window attention with W = 4,096 in every layer. A user asks about a sentence 20,000 tokens earlier in the prompt. What is the most likely behaviour?',
        options: [
          'Exact recall, because FlashAttention makes the window irrelevant',
          'Weak or failed exact recall: information from that far back only reaches the token indirectly through stacked layers and fades',
          'An error, because the prompt is longer than the window',
          'Exact recall, because the KV cache stores every token anyway',
        ],
        correct: 1,
        explanation:
          'Each layer only looks W tokens back, so distant tokens influence the current one only through chains of windows across layers, and detail is lost along the way. FlashAttention does not change which tokens are attended, the model accepts long prompts without error, and the rolling KV cache keeps only the last W tokens per layer.',
      },
      source: 'Jiang et al. 2023 — Mistral 7B (sliding window); Gemma 2 / Gemma 3 technical reports; Katharopoulos et al. 2020 — Transformers are RNNs; Gu & Dao 2023 — Mamba; Dao et al. 2022 — FlashAttention',
    },
  ],
  codeChallenges: [
    {
      id: 'transformer-internals-cc-1',
      title: 'Fix a buggy hand-written causal self-attention',
      context: 'A custom attention module trains, but loss plateaus high, and a leakage test shows outputs at position 3 change when token 7 changes. Long sequences also produce NaNs in fp16.',
      task: 'Find and fix every bug so the module matches F.scaled_dot_product_attention with is_causal=True.',
      starter: {
        language: 'python',
        code: `import torch

def attn(q, k, v):                     # q, k, v: (B, H, T, Dh)
    scores = q @ k                     # (B, H, T, T)?
    w = torch.softmax(scores, dim=-2)
    T = q.shape[-2]
    mask = torch.tril(torch.ones(T, T))
    w = w * mask                       # remove future positions
    return w @ v`,
      },
      hints: [
        'k must be transposed on its last two dims, and the scores need 1/√Dh scaling.',
        'Softmax normalises over keys, which is the last dimension.',
        'Masking after the softmax leaves rows that no longer sum to 1; mask with −inf before the softmax. Compute in fp32 for stability.',
      ],
      solution: {
        language: 'python',
        code: `import math, torch
import torch.nn.functional as F

def attn(q, k, v):                                   # (B, H, T, Dh)
    B, H, T, Dh = q.shape
    scores = (q.float() @ k.float().transpose(-2, -1)) / math.sqrt(Dh)
    future = torch.triu(torch.ones(T, T, dtype=torch.bool, device=q.device), diagonal=1)
    scores = scores.masked_fill(future, float("-inf"))   # mask BEFORE softmax
    w = torch.softmax(scores, dim=-1)                    # normalise over keys
    return (w @ v.float()).to(q.dtype)

q, k, v = (torch.randn(2, 4, 16, 32, dtype=torch.float16) for _ in range(3))
ref = F.scaled_dot_product_attention(q.float(), k.float(), v.float(), is_causal=True)
assert torch.allclose(attn(q, k, v).float(), ref, atol=2e-3)

# leakage test: changing a future token must not change earlier outputs
k2, v2 = k.clone(), v.clone(); k2[..., 10, :] += 5; v2[..., 10, :] += 5
assert torch.allclose(attn(q, k, v)[..., :10, :], attn(q, k2, v2)[..., :10, :])`,
      },
      explanation: `Bugs: (1) \`q @ k\` without transposing K is the wrong product; (2) no \`1/√Dh\` scaling saturates the softmax; (3) softmax over \`dim=-2\` normalises across queries, not keys; (4) masking *after* softmax both leaks (future keys already shaped the normaliser) and leaves rows not summing to 1; (5) fp16 exponentials overflow on long sequences. The fix computes in fp32, masks with −inf before a last-dim softmax, and adds a leakage regression test.`,
      followUps: [
        { q: 'How do you add a padding mask for left-padded batches?', a: 'Build a (B, 1, 1, T) boolean mask that is True on pad keys, OR it with the causal mask, and fill those scores with −inf; also ensure fully masked rows (pad queries) are handled to avoid NaNs.' },
        { q: 'Why do production kernels not need the fp32 upcast of the whole matrix?', a: 'FlashAttention computes scores tile by tile with fp32 accumulators and an online softmax in registers/SRAM, so stability is preserved without materialising a full fp32 T×T matrix.' },
      ],
    },
    {
      id: 'transformer-internals-cc-2',
      title: 'Repair incremental decoding with a KV cache and RoPE',
      context: 'A hand-rolled generation loop with a KV cache produces fluent text for the first few tokens and then degrades into repetition. Without the cache (recomputing everything) outputs are fine.',
      task: 'Fix positional handling and cache usage so cached decoding matches full recomputation exactly.',
      starter: {
        language: 'python',
        code: `def decode_step(layer, x_new, cache):
    # x_new: (B, 1, d) hidden state of the newest token
    q, k, v = layer.qkv(x_new)                 # each (B, H, 1, Dh)
    pos = torch.arange(1)                      # position of the new token
    q, k, v = rope(q, pos), rope(k, pos), rope(v, pos)
    cache["k"] = k                             # store this step's keys
    cache["v"] = v
    return F.scaled_dot_product_attention(q, cache["k"], cache["v"], is_causal=True)`,
      },
      hints: [
        'The new token\'s position is the current cache length, not 0.',
        'RoPE belongs on Q and K only; V carries content, not position.',
        'Append to the cache instead of overwriting, and the single new query may attend to all cached keys, so is_causal=True is wrong for a 1×T score matrix.',
      ],
      solution: {
        language: 'python',
        code: `import torch
import torch.nn.functional as F

def decode_step(layer, x_new, cache):
    q, k, v = layer.qkv(x_new)                         # (B, H, 1, Dh)
    past = 0 if cache.get("k") is None else cache["k"].shape[2]
    pos = torch.tensor([past], device=x_new.device)    # absolute position
    q, k = rope(q, pos), rope(k, pos)                  # V is NOT rotated
    if cache.get("k") is None:
        cache["k"], cache["v"] = k, v
    else:
        cache["k"] = torch.cat([cache["k"], k], dim=2) # append along time
        cache["v"] = torch.cat([cache["v"], v], dim=2)
    # one query vs all past keys: everything cached is in the past -> no mask
    return F.scaled_dot_product_attention(q, cache["k"], cache["v"], is_causal=False)

# Test: for a prompt of T tokens, running prefill on T-1 then decode_step on the
# last token must equal the last row of full causal attention over T tokens.`,
      },
      explanation: `Three bugs broke cached decoding: (1) every new token got position 0, so RoPE told the model all tokens were at the same place; (2) rotating V corrupted content vectors; (3) the cache was overwritten, so each step only attended to itself. Also, \`is_causal=True\` with a 1-row query and T keys masks the wrong entries in PyTorch (it aligns the mask top-left), so the single query must attend to all cached keys without a mask.`,
      followUps: [
        { q: 'Why is torch.cat on every step a performance problem in real servers?', a: 'It reallocates and copies the whole cache each token (O(T²) memory traffic overall); servers preallocate or page the cache (PagedAttention blocks) and write new K/V in place.' },
        { q: 'How does a server handle different positions across a batch?', a: 'Each sequence carries its own position ids and cache length; kernels take per-sequence lengths (or block tables) so RoPE and attention use the right offsets for each request.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'transformer-internals-iq-1',
      difficulty: 'hard',
      question: 'Walk me through exactly what happens to one token\'s vector inside a single Llama-style decoder layer during generation, including shapes.',
      context: 'Assume Llama-3-8B: d = 4096, 32 query heads, 8 KV heads, head_dim 128, d_ff = 14,336.',
      whatInterviewerLooksFor: [
        'Correct order: norm → attention → residual → norm → MLP → residual',
        'Shapes for Q/K/V under GQA',
        'RoPE placement and KV cache usage',
        'SwiGLU structure and sizes',
      ],
      modelAnswer: `**Input:** residual vector x ∈ ℝ⁴⁰⁹⁶ for the new token at position p; KV cache holds K, V for positions 0..p−1 (8 heads × 128 each).

**Attention sub-block:**
1. h = RMSNorm(x) (4096).
2. Q = W_q h → 4096 = 32 heads × 128; K = W_k h → 1024 = 8 × 128; V = W_v h → 1024.
3. RoPE rotates Q and K by position p (64 frequency pairs per head). V untouched.
4. Append K, V to the cache (now p+1 positions).
5. For each of the 32 query heads, use its group's KV head (head i uses KV head ⌊i/4⌋): scores = q·Kᵀ/√128 over p+1 positions, softmax, weighted sum of V → 128 per head.
6. Concatenate 32 × 128 = 4096 → W_o (4096 × 4096) → added to x (residual).

**MLP sub-block:**
7. h = RMSNorm(x).
8. g = W_gate h, u = W_up h (each 14,336); a = SiLU(g) ⊙ u.
9. W_down a → 4096; added to x.

**Output:** updated x goes to the next layer. Per token this layer does ~2 × 218M ≈ 0.44 GFLOPs of matmul plus attention over p+1 cached positions (≈ 4 · 32 · 128 · (p+1) FLOPs), and reads all 218M weights (436 MB in bf16), which is why decode is memory-bound.`,
      followUps: [
        { q: 'What changes during prefill compared with this decode step?', a: 'All prompt tokens are processed at once as a T×d matrix: matmuls become large GEMMs (compute-bound), attention uses a causal mask over T×T scores, and K/V for all T positions are written to the cache.' },
        { q: 'Where would LoRA adapters typically attach in this layer?', a: 'On the linear projections: W_q, W_k, W_v, W_o and the MLP\'s gate, up and down projections ("all-linear").' },
      ],
      pitfalls: [
        'Putting RoPE on V or after attention.',
        'Forgetting GQA head grouping in shapes.',
        'Describing post-norm order for a modern LLM.',
      ],
    },
    {
      id: 'transformer-internals-iq-2',
      difficulty: 'hard',
      question: 'Why does FlashAttention speed up attention even though it performs the same (or slightly more) FLOPs than the naive implementation?',
      whatInterviewerLooksFor: [
        'GPU memory hierarchy: HBM vs SRAM bandwidth',
        'Naive attention is memory-bound on the N×N matrix',
        'Tiling + online softmax + kernel fusion',
        'Recomputation in the backward pass',
      ],
      modelAnswer: `**The bottleneck is memory traffic, not arithmetic.** A GPU has tens of MB of fast on-chip SRAM (tens of TB/s) and tens of GB of HBM (~2–3 TB/s on A100/H100). Naive attention runs separate kernels: write S = QKᵀ (N×N) to HBM, read it for softmax, write P, read P for P·V. For N = 8k and 32 heads that is 32 × 64M elements per layer moved several times: the kernel spends its time waiting on HBM.

**FlashAttention's fixes:**
1. **Tiling:** load a block of Q and stream blocks of K and V through SRAM; compute partial scores on-chip.
2. **Online softmax:** keep a running max and running sum per query row, rescaling the partial output when a new max appears, so softmax can be computed block by block exactly.
3. **Kernel fusion:** matmul, mask, softmax and the P·V product happen in one kernel; the N×N matrix is never written to HBM. Extra memory is O(N) for the softmax statistics.
4. **Backward pass:** instead of storing P, it recomputes the needed blocks from Q, K, V and the saved statistics, trading cheap FLOPs for expensive memory reads.

**Results:** several-fold wall-clock speed-ups and linear memory in sequence length, enabling long-context training. FA2 improved work partitioning (~2× FA1); FA3 uses Hopper features (asynchronous TMA, warp specialisation, FP8) to reach ~75% of H100 peak in FP16.`,
      followUps: [
        { q: 'Does FlashAttention change the model\'s outputs?', a: 'No. It computes exact attention; differences are only floating-point rounding from a different summation order, within normal numerical tolerance.' },
        { q: 'How does it interact with decode (one query token)?', a: 'With a single query there is little to tile over queries, so decode kernels (e.g. FlashDecoding, paged attention kernels) split over the key/sequence dimension in parallel and combine partial softmaxes, using the same online-softmax maths.' },
      ],
      pitfalls: [
        'Claiming FlashAttention is approximate.',
        'Saying it reduces FLOPs.',
        'Not mentioning the online softmax.',
      ],
    },
    {
      id: 'transformer-internals-iq-3',
      difficulty: 'expert',
      question: 'A model trained with RoPE at 8k context must support 128k. What breaks if you just feed longer inputs, and what techniques fix it?',
      whatInterviewerLooksFor: [
        'Out-of-distribution rotation angles for low frequencies',
        'Position interpolation, NTK-aware base scaling, YaRN, Llama 3.1-style frequency-dependent scaling',
        'Need for long-context fine-tuning data',
        'Evaluation with long-context probes; KV-cache cost',
      ],
      modelAnswer: `**What breaks.** RoPE uses frequencies θ_i = base^(−2i/d). High-frequency pairs complete many rotations within 8k, so they have seen all angles; **low-frequency pairs** rotate only a fraction of a turn over 8k. Beyond 8k they reach angles never seen in training, attention scores become out-of-distribution, and perplexity explodes; the model "loses its place".

**Fixes:**
- **Position interpolation (PI):** scale positions by 8k/128k so all angles stay in the trained range; simple but compresses high frequencies too, hurting local resolution unless fine-tuned.
- **NTK-aware scaling:** increase the base (e.g. 10k → ~500k+), stretching mainly low frequencies while keeping high ones nearly intact; works partially even without fine-tuning.
- **YaRN / frequency-dependent scaling (Llama 3.1 style):** interpolate low frequencies, leave high frequencies untouched, blend in between, and adjust attention temperature; then a short fine-tune on long sequences (a few billion tokens or less) recovers quality.
- Train with a large base from the start (Llama 3 uses 500,000).

**Then validate:** needle-in-a-haystack at multiple depths, multi-needle and long-document QA (e.g. RULER-style), plus short-context benchmarks to confirm no regression.

**Don't forget cost:** 128k context on an 8B GQA model is ~16 GB of fp16 KV cache per sequence, so serving needs FP8 KV, paged memory and limits on concurrency.`,
      followUps: [
        { q: 'Why might a model pass needle-in-a-haystack but fail real long-document QA?', a: 'Retrieval of a single distinct string is easy; multi-hop reasoning across distant passages, aggregation and distractors are harder, so you need richer long-context evals than NIAH.' },
        { q: 'How does sliding-window attention relate?', a: 'It caps attention to a local window (e.g. 4k) in some or all layers, bounding compute and KV memory; hybrid models interleave local and global layers to keep long-range access while reducing cost.' },
      ],
      pitfalls: [
        'Assuming RoPE extrapolates for free.',
        'Ignoring short-context regressions after scaling.',
        'Forgetting KV-cache memory at long contexts.',
      ],
    },
    {
      id: 'transformer-internals-iq-4',
      difficulty: 'hard',
      question: 'Compare MHA, MQA, GQA and MLA from the perspective of someone choosing a model for a high-concurrency, long-context service.',
      whatInterviewerLooksFor: [
        'KV-cache size formula and per-variant reduction',
        'Decode is memory-bandwidth bound, so KV reads matter',
        'Quality trade-offs',
        'Practical implications: batch size, context, tensor parallel sharding',
      ],
      modelAnswer: `**KV cache per token** = layers × 2 × n_kv_heads × head_dim × bytes. It decides how many concurrent long sequences fit and how many bytes each decode step must read.

| Variant | KV heads (32 Q heads, d_h 128, 32 layers, fp16) | KV/token | Quality |
|---|---|---|---|
| MHA | 32 | 512 KB | baseline |
| GQA-8 | 8 | 128 KB | ≈ MHA (Llama 3, Qwen, Mistral) |
| MQA | 1 | 16 KB | measurable drop, less stable training |
| MLA | latent (~512-d compressed + RoPE part) | ~ tens of KB | ≈ MHA (DeepSeek V2/V3) |

**Implications for serving:**
- With 40 GB for KV, MHA fits ~78k tokens total (e.g. 9 users × 8k); GQA-8 fits ~312k (39 users); MQA/MLA several times more.
- Decode attention reads the whole KV cache per token, so smaller KV also means faster decode at long context.
- **Tensor parallelism:** KV heads shard across GPUs; with MQA the single KV head must be replicated on every GPU, eroding its advantage at TP>1; GQA-8 shards cleanly up to TP=8.
- MLA needs kernel support (vLLM/SGLang have it) and decompression math, but gives MQA-like memory with MHA-like quality.

**Choice:** for high-concurrency long-context services, prefer GQA or MLA models; MHA models (older) are much more expensive to serve at long context.`,
      followUps: [
        { q: 'How can an existing MHA checkpoint be converted to GQA?', a: 'Mean-pool the K and V projection heads within each group to initialise GQA heads, then "uptrain" with a small fraction (~5%) of the original pretraining compute, as in the GQA paper.' },
        { q: 'Why does MQA hurt tensor-parallel efficiency?', a: 'With one KV head you cannot split K/V across GPUs, so every GPU stores and reads the full KV cache, multiplying KV memory by the TP degree.' },
      ],
      pitfalls: [
        'Saying GQA reduces attention FLOPs substantially.',
        'Ignoring tensor-parallel replication for MQA.',
        'Not quantifying KV cache differences.',
      ],
    },
    {
      id: 'transformer-internals-iq-5',
      difficulty: 'expert',
      question: 'Training a 1B-parameter model from scratch, your loss spikes to NaN after a few thousand steps in bf16. Using your knowledge of transformer internals, how do you debug it?',
      whatInterviewerLooksFor: [
        'Attention logit growth and softmax saturation',
        'Norm placement, QK-norm, residual scaling',
        'Optimiser settings: LR, warmup, grad clipping, epsilon',
        'Instrumentation: per-layer activation/gradient norms',
      ],
      modelAnswer: `**Instrument first.** Log per-layer RMS of the residual stream, attention logit max per head, gradient norms per parameter group, and loss per step around the spike. Save a checkpoint before the spike to replay deterministically.

**Common internal causes:**
1. **Attention logit growth:** q·k values grow over training; softmax becomes one-hot and gradients blow up. Fixes: **QK-norm** (RMSNorm on Q and K before the dot product), logit soft-capping, ensure 1/√d_k scaling is present.
2. **Residual stream blow-up:** activations growing layer by layer. Check pre-norm placement (not post-norm), scale initialisation of output projections by 1/√(2L), and look for outlier dimensions.
3. **Missing fp32 where it matters:** softmax, norms and loss in bf16 can overflow or lose precision; compute them in fp32 (most frameworks do inside kernels), keep the master weights and optimiser state in fp32.
4. **Optimiser:** LR too high for the batch size; too short a warmup; Adam ε too small with bf16; no gradient clipping. Typical: warmup 1–2k steps, clip at 1.0, β2 = 0.95.
5. **Data:** a corrupted batch (very long repeated tokens, garbage bytes) can trigger the spike; log batch ids and inspect.

**Procedure:** replay from checkpoint with the same batch; if it reproduces, inspect the offending layer/head statistics; apply the smallest fix (QK-norm or lower LR), and resume with skip-batch logic for bad data.`,
      followUps: [
        { q: 'What is z-loss and why do some models use it?', a: 'An auxiliary penalty on log(Σ exp(logits))² at the output softmax that keeps logits from drifting large, improving stability in bf16 training (used in PaLM and others).' },
        { q: 'Why does pre-norm alone not prevent all instabilities?', a: 'It stabilises gradients through the residual path, but attention logits and the residual stream magnitude can still grow; QK-norm and careful init address those separately.' },
      ],
      pitfalls: [
        'Blaming only the learning rate without instrumentation.',
        'Restarting from scratch instead of replaying from a checkpoint.',
        'Ignoring data issues.',
      ],
    },
    {
      id: 'transformer-internals-iq-6',
      difficulty: 'hard',
      question: 'Your team can afford one pretraining run of about 6e23 FLOPs for a model that will serve heavy production traffic. Do you train a Chinchilla-optimal model or something else, and how do test-time reasoning budgets change the picture?',
      context: 'Expected use: millions of requests per day for at least a year; quality bar defined by an internal eval suite.',
      whatInterviewerLooksFor: [
        'C ≈ 6·N·D and the ~20 tokens/parameter compute-optimal rule',
        'Inference cost ≈ 2·N per token and lifetime compute reasoning',
        'Over-training a smaller model for serving',
        'Test-time compute as a per-request cost dial',
        'Data limits and the need to validate on evals, not loss alone',
      ],
      modelAnswer: `**Compute-optimal baseline.** With C ≈ 6·N·D and D ≈ 20·N, C = 120·N², so N ≈ √(6e23 / 120) ≈ 70B and D ≈ 1.4T tokens. That minimises loss *for the training budget*.

**But serving dominates.** Each served token costs ≈ 2·N FLOPs. A 70B model costs 140 GFLOPs per token; an 8B model 16 GFLOPs. If I spend the same 6e23 FLOPs on ~7–8B parameters and ~13–15T tokens, the published Chinchilla fit predicts only slightly higher loss, while serving is ~9× cheaper and fits on one GPU. With millions of daily requests, the extra training cost is repaid after roughly a trillion served tokens. So I would **over-train a smaller model**, picking the smallest size that clears the eval bar (Sardana & Frankle's inference-aware argument).

**Constraints to check:**
- Do we have ~15T *good* tokens? If not, repeated epochs give diminishing returns; data quality and deduplication matter more than the exact ratio.
- Loss is not capability: validate candidate sizes on our eval suite with small pilot runs and extrapolate.

**Test-time compute.** For hard requests, letting the model reason longer or sample several answers with a verifier can lift quality without a bigger model. That moves cost from training to each request and adds latency, so I would route: no or low reasoning budget for easy traffic, more for hard queries, with per-tier token caps. That makes a smaller over-trained base even more attractive: spend extra compute only where it pays.`,
      followUps: [
        { q: 'Why did Kaplan et al. and Chinchilla reach different conclusions?', a: 'Kaplan\'s runs used a learning-rate schedule not matched to each run length, which under-states the benefit of more tokens for smaller models. Hoffmann et al. tuned the schedule per run and found parameters and tokens should scale about equally.' },
        { q: 'How would MoE change your sizing?', a: 'Per-token compute follows active parameters, so an MoE can have far more total parameters for the same training and serving FLOPs; you then pay in memory and serving complexity rather than compute.' },
      ],
      pitfalls: [
        'Quoting 20 tokens/parameter as the right answer for every deployment.',
        'Forgetting that inference cost is per token, forever.',
        'Treating test-time compute as free quality.',
        'Assuming unlimited high-quality data.',
      ],
    },
    {
      id: 'transformer-internals-iq-7',
      difficulty: 'expert',
      question: 'A product team wants to replace a dense 13B model with Mixtral 8x7B for "70B-class quality at 13B speed" and to support 64k-token contexts. Walk through the memory and serving consequences.',
      context: 'Mixtral 8x7B: 46.7B total / ~12.9B active, 32 layers, 8 KV heads × 128, bf16. Current deployment: one 80 GB GPU per replica.',
      whatInterviewerLooksFor: [
        'Total vs active parameters and what each controls',
        'Weight memory and KV-cache arithmetic',
        'Batching effects on MoE efficiency and expert parallelism',
        'Load balancing / routing behaviour in serving',
        'Mitigations: quantisation, sharding, context caps, hybrids',
      ],
      modelAnswer: `**Compute:** per token Mixtral runs 2 of 8 experts per layer, so ~12.9B active parameters: FLOPs per token similar to the dense 13B. Quality gains come from the larger total capacity.

**Weights:** all 46.7B parameters must be resident: ~93 GB in bf16, which does not fit one 80 GB GPU. Options: shard across 2 GPUs (tensor or expert parallelism), or quantise to 8-bit (~47 GB) or 4-bit (~23 GB) after checking evals.

**KV cache at 64k:** per token per layer 2 × 8 × 128 × 2 B = 4 KiB; × 32 layers = 128 KiB per token; × 65,536 tokens = **8 GiB per sequence**. Ten concurrent 64k sequences need 80 GiB of cache alone. So long context, not the MoE weights, decides concurrency. Mitigations: FP8 KV cache, prefix caching for shared documents, a lower max context per tier, or retrieval instead of stuffing 64k.

**Decode economics:** decode is memory-bandwidth-bound. At small batch each token reads only its 2 experts per layer, so it is fast. At large batch tokens spread over all experts, so every expert's weights are read each step; throughput is good but the memory footprint never shrinks.

**Serving behaviour:** expert parallelism adds all-to-all communication; uneven routing (hot experts) creates stragglers; outputs can vary slightly with batch composition. Use an engine with optimised MoE kernels, keep expert shards within one NVLink domain, and monitor per-expert load.

**Verdict:** plan two GPUs per replica (or 4-bit on one, with evals), cap context per tier, and benchmark tokens/s and cost per successful task against the dense 13B before switching.`,
      followUps: [
        { q: 'Would a sliding-window or hybrid model help the 64k requirement?', a: 'Yes for memory: a model with mostly sliding-window layers keeps full KV only in its global layers, cutting the cache several-fold. Check long-range recall on your own tasks, since windowed layers alone forget distant detail.' },
        { q: 'Why can MoE outputs differ between runs with identical prompts?', a: 'Batch composition changes kernel scheduling and, with capacity limits, which tokens overflow; floating-point reduction order also changes. Small numeric differences can flip a top-k routing decision and the sampled token.' },
      ],
      pitfalls: [
        'Sizing memory from active parameters.',
        'Ignoring the KV cache at long context.',
        'Assuming MoE speed-ups hold at every batch size.',
        'Calling it "56B" from the name.',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'transformer-internals-est-1',
      question: 'From its config, estimate the parameter count of a Llama-style model: d = 5120, 40 layers, 40 query heads, 8 KV heads, head_dim 128, d_ff = 13,824, vocab 152,064, untied embeddings.',
      assumptions: [
        'No biases; norm parameters negligible',
        'GQA: K and V project to 8 × 128 = 1024 dims',
        'SwiGLU MLP with gate, up, down matrices',
        'Separate input embedding and LM head (untied)',
      ],
      steps: [
        { label: 'Q + O projections', calc: '2 × 5120 × 5120 = 52.4M' },
        { label: 'K + V projections', calc: '2 × 5120 × 1024 = 10.5M' },
        { label: 'MLP', calc: '3 × 5120 × 13,824 = 212.3M' },
        { label: 'Per layer', calc: '52.4 + 10.5 + 212.3 = 275.2M; × 40 layers = 11.01B' },
        { label: 'Embeddings + LM head', calc: '2 × 152,064 × 5120 = 1.56B' },
        { label: 'Total', calc: '11.01 + 1.56 ≈ 12.6B parameters (≈ 25 GB in bf16)' },
      ],
      answer: 'About 12.6B parameters: ~68% in MLPs (8.49B), ~20% in attention (2.52B) and ~12% in the embedding + LM head (1.56B).',
      insight: 'Being able to read a config.json and get parameter count, memory and LoRA targets in two minutes is a core skill: MLP matrices dominate, and the large vocabulary makes the embedding/LM head a non-trivial ~12%.',
      followUps: [
        { q: 'How many FLOPs per generated token at decode?', a: 'About 2 × 12.6B ≈ 25 GFLOPs for the matmuls, plus attention over the context (≈ 4 × layers × heads × head_dim × context ≈ 0.8 MFLOPs per cached token).' },
      ],
    },
    {
      id: 'transformer-internals-est-2',
      question: 'How much memory would naive (non-Flash) attention need to materialise the score matrix for one 32k-token sequence in one layer of a 32-head model, and how does FlashAttention change it?',
      assumptions: [
        'Sequence length N = 32,768; 32 heads; scores stored in bf16 (2 bytes)',
        'Naive attention keeps the full N × N score/probability matrix per head',
        'FlashAttention keeps O(N) statistics (running max and sum in fp32) per head',
      ],
      steps: [
        { label: 'Elements per head', calc: '32,768² ≈ 1.07e9' },
        { label: 'Bytes per head', calc: '1.07e9 × 2 B ≈ 2.15 GB' },
        { label: 'All heads, one layer', calc: '32 × 2.15 GB ≈ 68.7 GB' },
        { label: 'FlashAttention statistics', calc: '32 heads × 32,768 × 2 values × 4 B ≈ 8.4 MB' },
        { label: 'Ratio', calc: '68.7 GB / 8.4 MB ≈ 8,000× less extra memory' },
      ],
      answer: 'Naive attention needs ~69 GB just for one layer\'s scores (more than most GPUs); FlashAttention needs ~8 MB of extra state.',
      insight: 'Quadratic memory, not FLOPs, is what made long context impractical before FlashAttention. Compute is still quadratic, so prefill time for 32k-token prompts remains substantial, which is why prefix caching and retrieval are still valuable.',
      followUps: [
        { q: 'What is the attention FLOP count for that prefill (one layer)?', a: 'About 4 × N² × d_model = 4 × 1.07e9 × 4096 ≈ 17.6 TFLOPs per layer (halved with causal masking), so ~280 TFLOPs over 32 layers, a fraction of a second at H100 rates but growing quadratically.' },
      ],
    },
  ],
  test: [
    {
      id: 'transformer-internals-mcq-01',
      difficulty: 'medium',
      question: 'In a Llama-style decoder layer, which operations are applied, in order, to compute the attention sub-block\'s contribution?',
      options: [
        'RMSNorm → Q/K/V projections → RoPE on Q and K → causal softmax attention → output projection → add to residual',
        'Q/K/V projections → attention → RMSNorm → RoPE → add to residual',
        'RoPE on the residual → RMSNorm → attention → output projection',
        'RMSNorm → RoPE on V → attention → add to residual → output projection',
      ],
      correct: [0],
      explanation: 'Pre-norm first, then projections, RoPE on queries and keys only, masked attention, output projection, and a residual add. Post-norm order, rotating the residual or V, and adding before the output projection are all incorrect.',
      followUps: [
        { q: 'What follows the residual add?', a: 'A second RMSNorm feeding the SwiGLU MLP, whose output is added to the residual stream again.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-02',
      difficulty: 'medium',
      question: 'Which statements about RoPE are true? Select ALL that apply.',
      options: [
        'It rotates pairs of query/key dimensions by angles proportional to the token position',
        'The q·k dot product then depends on the relative offset between positions',
        'It is added to the token embeddings once at the input layer',
        'It is applied to queries and keys but not to values',
      ],
      correct: [0, 1, 3],
      explanation: 'RoPE rotates Q and K pairs inside every attention layer, making their dot product depend on relative position; V is untouched. Adding a positional vector to embeddings at the input is the original sinusoidal/learned absolute scheme, not RoPE.',
      followUps: [
        { q: 'What does increasing the RoPE base do?', a: 'It lowers all rotation frequencies, especially the slow ones, so angles grow more slowly with position; this is the basis of NTK-aware context extension and why Llama 3 uses base 500,000.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-03',
      difficulty: 'hard',
      question: 'Using the scaled dot-product formula with d_k = 2, a query [1, 0] and keys [1, 0], [0, 1], [1, 1] (no mask), what attention weight goes to the second key?',
      options: ['≈ 0.198', '≈ 0.333', '≈ 0.155', '≈ 0.401'],
      correct: [0],
      explanation: 'Scores are [1, 0, 1]/√2 = [0.707, 0, 0.707]; exponentials [2.028, 1, 2.028]; sum 5.056; the second weight is 1/5.056 ≈ 0.198. 0.333 ignores the scores, 0.155 comes from forgetting the √d_k scaling (e/(2e+1) for keys 1 and 3 gives 0.42 each, leaving ~0.155), and 0.401 is the weight of keys 1 and 3.',
      followUps: [
        { q: 'With values [1,0], [0,2], [3,1], what is the output?', a: '0.401·[1,0] + 0.198·[0,2] + 0.401·[3,1] = [1.604, 0.797].' },
      ],
    },
    {
      id: 'transformer-internals-mcq-04',
      difficulty: 'hard',
      question: 'What is wrong with this causal masking?',
      code: {
        language: 'python',
        code: `w = torch.softmax(q @ k.transpose(-2, -1) / math.sqrt(dh), dim=-1)
w = w.masked_fill(torch.triu(torch.ones(T, T, dtype=torch.bool), 1), 0.0)
out = w @ v`,
      },
      options: [
        'The mask is applied after the softmax, so future keys already influenced the normalisation and rows no longer sum to 1',
        'triu with diagonal=1 masks the diagonal too, so tokens cannot attend to themselves',
        'masked_fill cannot be used on attention weights',
        'Nothing; zeroing future weights after softmax is equivalent',
      ],
      correct: [0],
      explanation: 'Masking must happen on the logits with −inf before softmax. Zeroing afterwards leaves weights computed with future keys in the denominator, which is both information leakage via normalisation and an unnormalised mix. triu(…, 1) correctly keeps the diagonal, and masked_fill works fine.',
      followUps: [
        { q: 'How do you test for leakage?', a: 'Change the input at a future position and assert that outputs at earlier positions are bit-for-bit (or within tolerance) unchanged.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-05',
      difficulty: 'hard',
      question: 'Why is the attention logit divided by √d_k?',
      options: [
        'To normalise the output vector to unit length',
        'Because q·k for random d_k-dimensional vectors has variance ≈ d_k; scaling keeps logits near unit variance so softmax does not saturate and gradients stay useful',
        'To make attention equivalent to cosine similarity',
        'To reduce FLOPs in the matmul',
      ],
      correct: [1],
      explanation: 'Without scaling, logit magnitude grows with √d_k, pushing softmax towards one-hot with tiny gradients. The scaling does not normalise outputs, does not turn it into cosine similarity (vectors are not normalised), and saves no compute.',
      followUps: [
        { q: 'What do QK-norm models add on top?', a: 'They RMS-normalise Q and K per head before the dot product (sometimes with a learnable scale), bounding logit growth during training for stability.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-06',
      difficulty: 'hard',
      question: 'Which statements about GQA are correct for a model with 32 query heads and 8 KV heads? Select ALL that apply.',
      options: [
        'Each KV head is shared by 4 query heads',
        'KV cache size is 4× smaller than the equivalent MHA model',
        'Each query head attends over only a quarter of the sequence',
        'The K and V projection matrices are 4× smaller than in MHA',
      ],
      correct: [0, 1, 3],
      explanation: 'Grouping 32 query heads onto 8 KV heads means 4 queries per KV head, 4× fewer cached K/V values and K/V projection outputs of 8 × 128 instead of 32 × 128. Every query head still attends over the whole sequence.',
      followUps: [
        { q: 'How does PyTorch SDPA handle GQA without copying K/V?', a: 'With enable_gqa=True it broadcasts each KV head to its group of query heads inside the kernel instead of materialising repeat_interleave copies.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-07',
      difficulty: 'medium',
      question: 'Approximately what share of a dense Llama-3-8B\'s parameters sit in the MLP (SwiGLU) blocks?',
      options: ['About 70%', 'About 15%', 'About 40%', 'About 95%'],
      correct: [0],
      explanation: 'MLP = 3 × 4096 × 14,336 ≈ 176M per layer × 32 ≈ 5.64B of ~8.03B total ≈ 70%. Attention is ~1.34B (~17%) and embeddings + LM head ~1.05B (~13%).',
      followUps: [
        { q: 'Why does this matter for MoE design?', a: 'Because MLPs dominate parameters and FLOPs, MoE replaces them with many expert MLPs and routes each token to a few, scaling capacity without proportional compute.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-08',
      difficulty: 'hard',
      question: 'What does this code print for the shape of `a`, and what does enable_gqa do here?',
      code: {
        language: 'python',
        code: `q = torch.randn(2, 32, 100, 128)   # (B, H_q, T, Dh)
k = torch.randn(2, 8, 100, 128)    # (B, H_kv, T, Dh)
v = torch.randn(2, 8, 100, 128)
a = F.scaled_dot_product_attention(q, k, v, is_causal=True, enable_gqa=True)
print(a.shape)`,
      },
      options: [
        'torch.Size([2, 32, 100, 128]); each KV head is broadcast to 4 query heads',
        'torch.Size([2, 8, 100, 128]); query heads are averaged into 8 groups',
        'A shape error, because head counts must match',
        'torch.Size([2, 32, 100, 100]); the attention weights are returned',
      ],
      correct: [0],
      explanation: 'The output has one result per query head: (2, 32, 100, 128). enable_gqa lets SDPA map 32 query heads onto 8 KV heads (groups of 4). Without the flag mismatched heads would error; queries are not averaged, and SDPA returns outputs, not weights.',
      followUps: [
        { q: 'What would you do on an older PyTorch without enable_gqa?', a: 'Expand K and V with repeat_interleave(4, dim=1) (or expand + reshape) before calling SDPA, at the cost of extra memory traffic.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-09',
      difficulty: 'hard',
      question: 'Which of these are true about FlashAttention? Select ALL that apply.',
      options: [
        'It computes exact attention, not an approximation',
        'It avoids writing the N×N attention matrix to HBM by tiling and an online softmax',
        'It reduces attention FLOPs from O(N²) to O(N)',
        'In the backward pass it recomputes attention blocks instead of storing the probability matrix',
      ],
      correct: [0, 1, 3],
      explanation: 'FlashAttention is exact and IO-aware: tiled computation with online softmax, plus recomputation in backward to avoid storing P. FLOPs remain quadratic in sequence length; memory and HBM traffic are what improve.',
      followUps: [
        { q: 'What did FlashAttention-3 add on Hopper?', a: 'Asynchronous data movement with TMA, warp specialisation to overlap matmul and softmax, and FP8 support, reaching roughly 75% of H100 peak FLOPs in FP16.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-10',
      difficulty: 'expert',
      question: 'During cached decoding a single new query (length 1) attends to 50 cached keys. What happens with this call in PyTorch?',
      code: {
        language: 'python',
        code: `out = F.scaled_dot_product_attention(q_new, k_cache, v_cache, is_causal=True)
# q_new: (B, H, 1, Dh); k_cache, v_cache: (B, H, 50, Dh)`,
      },
      options: [
        'The causal mask is aligned top-left, so the single query may only see the first key; decode with is_causal=False (all cached keys are in the past)',
        'It correctly lets the query see all 50 keys',
        'It raises an error because q and k lengths differ',
        'It masks the last key only',
      ],
      correct: [0],
      explanation: 'PyTorch builds the is_causal mask as a top-left-aligned lower-triangular matrix of shape (L, S); for L = 1 that keeps only key 0. In decode, every cached key precedes the new token, so no mask (or an explicit bottom-right-aligned mask) is correct. Differing lengths are allowed, and it is not just the last key that is masked.',
      followUps: [
        { q: 'What about chunked prefill where a chunk of 8 queries meets 50 cached keys?', a: 'You need a bottom-right-aligned causal mask (query i may see keys up to past_len + i); build it explicitly or use kernels that accept per-sequence offsets.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-11',
      difficulty: 'expert',
      question: 'A model with RoPE base 10,000 trained at 4k context is run at 32k without changes. Which effects do you expect? Select ALL that apply.',
      options: [
        'Low-frequency RoPE dimensions reach rotation angles never seen in training',
        'Perplexity rises sharply beyond ~4k tokens',
        'Short prompts (< 4k) become worse even though nothing changed for them',
        'The KV cache for a 32k sequence is 8× larger than for 4k',
      ],
      correct: [0, 1, 3],
      explanation: 'Beyond the trained length, slow frequencies hit unseen angles, so perplexity explodes; KV cache grows linearly with tokens (8×). Short prompts are unaffected because nothing changed for positions inside the trained range; regressions on short prompts appear only after applying scaling methods carelessly.',
      followUps: [
        { q: 'Which change would you try first without retraining?', a: 'NTK-aware or YaRN-style RoPE scaling configured in the serving engine, then evaluate both long-context retrieval and short-context benchmarks.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-12',
      difficulty: 'expert',
      question: 'In the online softmax used by FlashAttention, a new block raises the running max from m_old = 2.0 to m_new = 5.0. What must happen to the running denominator l and accumulator acc?',
      options: [
        'Both are multiplied by exp(m_old − m_new) = exp(−3) ≈ 0.0498 before adding the new block\'s contributions',
        'Both are reset to zero because earlier blocks no longer matter',
        'Only acc is rescaled; l is kept as is',
        'Both are divided by m_new',
      ],
      correct: [0],
      explanation: 'Earlier exponentials were computed relative to m_old; re-expressing them relative to m_new means multiplying by exp(m_old − m_new). Both the denominator and the weighted value sum need the same correction, or the final normalisation is wrong. Resetting discards information, and dividing by the max has no mathematical basis.',
      followUps: [
        { q: 'Why subtract the max at all?', a: 'To keep exponentials in a safe range: exp of large logits overflows in fp16/bf16; subtracting the running max keeps every exponent ≤ 0.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-13',
      difficulty: 'medium',
      question: 'Using C ≈ 6·N·D and the Chinchilla rule of ~20 training tokens per parameter, what is the compute-optimal model size for a budget of 1.2e22 FLOPs?',
      options: ['About 1B parameters', 'About 10B parameters', 'About 100B parameters', 'About 300M parameters'],
      correct: [1],
      explanation: 'With D = 20·N, C = 6·N·20·N = 120·N², so N = √(1.2e22 / 120) = √1e20 = 1e10, about 10B parameters trained on about 200B tokens. The other sizes would be badly under- or over-trained for that budget.',
      followUps: [
        { q: 'How much compute per generated token would that model need at inference?', a: 'About 2·N = 2e10 FLOPs (20 GFLOPs) per token for the matmuls, plus attention over the context.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-14',
      difficulty: 'hard',
      question: 'Which statements about LLM scaling laws are correct? Select ALL that apply.',
      options: [
        'Hoffmann et al. (2022) found parameters and training tokens should grow in roughly equal proportion with compute',
        'Training a model well past 20 tokens per parameter can be the right choice when it will serve a lot of traffic',
        'Scaling laws predict exactly at which size a specific skill such as multi-digit arithmetic appears',
        'Spending more compute at inference, such as longer reasoning or sampling with a verifier, can improve quality without a larger model',
      ],
      correct: [0, 1, 3],
      explanation: 'Chinchilla scales N and D together (~20 tokens/parameter); over-training cuts serving cost; test-time compute is a separate quality lever. Scaling laws predict smooth loss, not when particular capabilities appear; apparent sudden emergence often reflects pass/fail metrics.',
      followUps: [
        { q: 'What did Chinchilla show against Gopher?', a: 'A 70B model trained on 1.4T tokens outperformed the 280B Gopher trained with the same compute, showing large earlier models were under-trained.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-15',
      difficulty: 'hard',
      question: 'In a top-2 MoE layer, the router probabilities for one token over 4 experts are [0.10, 0.50, 0.15, 0.25]. With gates renormalised over the chosen experts, what does the layer output?',
      options: [
        '0.667 × Expert2(h) + 0.333 × Expert4(h)',
        '0.50 × Expert2(h) + 0.25 × Expert4(h)',
        'The average of all four experts weighted by the probabilities',
        'Expert2(h) only, because it has the highest probability',
      ],
      correct: [0],
      explanation: 'Top-2 picks experts 2 and 4 (0.50 and 0.25). Renormalising gives 0.50/0.75 ≈ 0.667 and 0.25/0.75 ≈ 0.333. Using the raw probabilities shrinks the output, running all experts defeats sparsity, and top-1 would use only expert 2 (the Switch Transformer choice).',
      followUps: [
        { q: 'Why add a load-balancing term to training?', a: 'Without it the router tends to send most tokens to a few experts, which then train faster and attract even more tokens; the others stay useless and capacity is wasted.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-16',
      difficulty: 'hard',
      question: 'Why do sparse expert models need far more accelerator memory than their per-token FLOPs suggest? Select ALL that apply.',
      options: [
        'Every expert\'s weights must stay resident because any token may be routed to any expert',
        'At large batch sizes tokens spread across all experts, so all expert weights are read every step',
        'The router stores a full copy of every expert\'s activations for each token',
        'The KV cache is unaffected by MoE and still grows with context and concurrency',
      ],
      correct: [0, 1, 3],
      explanation: 'Memory follows total parameters, since all experts must be available, and batching spreads tokens over all of them. MoE only replaces the MLP, so the attention KV cache is the same as a dense model with the same attention shape. The router is a tiny linear layer and does not store expert activations.',
      followUps: [
        { q: 'How do large MoEs fit across GPUs?', a: 'Expert parallelism places different experts on different GPUs and exchanges tokens with all-to-all communication, often combined with tensor parallelism for attention.' },
      ],
    },
    {
      id: 'transformer-internals-mcq-17',
      difficulty: 'expert',
      question: 'This function sizes the KV cache for a GQA model. What is wrong with it?',
      code: {
        language: 'python',
        code: `def kv_cache_bytes(layers, n_heads, n_kv_heads, head_dim, tokens, batch, bytes_per=2):
    return layers * n_heads * head_dim * bytes_per * tokens * batch`,
      },
      options: [
        'It uses query heads instead of KV heads and forgets the factor 2 for storing both K and V',
        'It should multiply by d_model instead of head_dim',
        'It should divide by the batch size',
        'Nothing; GQA does not change KV-cache size',
      ],
      correct: [0],
      explanation: 'The cache stores K and V (factor 2) for each KV head, not each query head: bytes = 2 × layers × n_kv_heads × head_dim × bytes × tokens × batch. For Llama-3-8B (32 query, 8 KV heads) the bug gives 2× too little relative to MHA but 2× too much relative to the real GQA cache, so capacity plans come out wrong either way.',
      followUps: [
        { q: 'How would a sliding-window layer change the formula?', a: 'For that layer, replace tokens with min(tokens, window), since only the last W tokens are kept in its rolling cache.' },
      ],
    },
  ],
};

export default topic;
