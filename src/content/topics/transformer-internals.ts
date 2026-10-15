import type { Topic } from '../../types';

const topic: Topic = {
  id: 'transformer-internals',
  phase: 'internals',
  order: 1,
  title: 'Transformer Internals and Attention',
  subtitle: 'Follow one token through a modern decoder layer: embeddings, RoPE, residual stream, norms, attention variants and FlashAttention',
  estimatedMinutes: 36,
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
  ],
  tags: ['transformer', 'attention', 'rope', 'residual-stream', 'rmsnorm', 'swiglu', 'gqa', 'mqa', 'flashattention', 'pytorch'],
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
  ],
};

export default topic;
