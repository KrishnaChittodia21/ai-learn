import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['transformers-attention.md', 'attention-variants.md', 'positional-encoding.md'],
  blocks: [
    {
      title: 'Shapes through one attention layer',
      markdown: `| Tensor | Shape |
|---|---|
| Token ids | \`(B, T)\` |
| Embedding table | \`(V, D)\` |
| Q, K, V per head | \`(B, H, T, d_head)\`, \`d_head = D / H\` |
| Scores and weights | \`(B, H, T, T)\` |
| Output after merging heads | \`(B, T, D)\`, then \`out_proj\` mixes heads |
| Logits | \`(B, T, V)\` |`,
    },
    {
      title: 'Position schemes: use X when',
      markdown: `| Scheme | Acts on | Use when |
|---|---|---|
| Learned absolute | input embeddings | fixed max context only; fails past the last trained row |
| Sinusoidal | input embeddings | parameter-free table; historical for LLMs |
| RoPE | rotates Q and K | default for new decoder models |
| RoPE + YaRN / NTK base scaling | rotates Q and K | extending context, with a short long-sequence fine-tune |
| ALiBi | attention scores (distance penalty) | length extrapolation matters most |`,
    },
    {
      title: 'Attention variants',
      markdown: `| Variant | Compute | KV cache per layer | Use when |
|---|---|---|---|
| Full causal | \`O(N²)\` | grows with N | short–medium context, best retrieval |
| Sliding window (W) | \`O(N·W)\` | capped at W | long context, interleaved with some full layers |
| FlashAttention | same FLOPs as full | same | always: exact, O(N) activation memory |

- An L-layer sliding-window stack sees at most about \`L × W\` tokens back.
- FlashAttention does not cut compute; it avoids writing the N×N matrix to HBM.`,
    },
    {
      title: 'Debug a transformer',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Model "cheats" on next token | no causal mask | mask the upper triangle with \`-inf\` before softmax |
| Softmax returns \`inf\` / NaN | exp of large logits | subtract the row max first |
| Learning stalls, attention one-hot | scores not scaled | divide by \`√d_head\` |
| Deep stack diverges | post-norm on the residual path | use pre-norm |
| Same output for shuffled tokens | no position signal | add RoPE / a position scheme |
| Garbage past trained length | positions do not extrapolate | RoPE with base scaling / YaRN |
| Same gap, different RoPE scores | rotated only Q or only K | rotate both |

Sanity checks: attention rows sum to 1; future tokens never change past outputs; loss at random init ≈ \`ln(V)\`.`,
    },
  ],
};

export default sheet;
