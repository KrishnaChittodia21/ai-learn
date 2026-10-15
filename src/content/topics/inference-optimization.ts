import type { Topic } from '../../types';

const topic: Topic = {
  id: 'inference-optimization',
  phase: 'internals',
  order: 2,
  title: 'GPU Inference Optimization, KV Cache, Speculative Decoding and Distributed Inference',
  subtitle: 'Why decode is memory-bound, how big the KV cache really is, how to generate several tokens per pass, and how to split models across GPUs',
  estimatedMinutes: 52,
  sources: [
    'NVIDIA H100 Tensor Core GPU datasheet (SXM: 80 GB HBM3, 3.35 TB/s, ~989 TFLOPS dense BF16, ~1,979 TFLOPS dense FP8)',
    'Williams et al. 2009 — Roofline: An Insightful Visual Performance Model',
    'Pope et al. 2022 — Efficiently Scaling Transformer Inference (arXiv:2211.05102)',
    'Kwon et al. 2023 — PagedAttention / vLLM (arXiv:2309.06180); vLLM docs — automatic prefix caching, speculative decoding, parallelism',
    'Leviathan et al. 2023 — Fast Inference from Transformers via Speculative Decoding (arXiv:2211.17192)',
    'Chen et al. 2023 — Accelerating LLM Decoding with Speculative Sampling (arXiv:2302.01318)',
    'Cai et al. 2024 — Medusa (arXiv:2401.10774); Li et al. 2024/2025 — EAGLE, EAGLE-2, EAGLE-3 (arXiv:2401.15077, 2503.01840)',
    'Shoeybi et al. 2019 — Megatron-LM tensor parallelism (arXiv:1909.08053)',
    'Zhong et al. 2024 — DistServe: Disaggregating Prefill and Decoding (arXiv:2401.09670); Patel et al. 2024 — Splitwise',
    'DeepSeek-AI 2024 — DeepSeek-V3 Technical Report (MTP, expert parallelism, arXiv:2412.19437)',
  ],
  tags: ['inference', 'gpu', 'roofline', 'kv-cache', 'prefix-caching', 'speculative-decoding', 'eagle', 'medusa', 'tensor-parallelism', 'pipeline-parallelism', 'expert-parallelism', 'disaggregation'],
  cheatSheet: [
    'Prefill processes the whole prompt in parallel (compute-bound, sets TTFT); decode generates one token per step per sequence (memory-bandwidth-bound, sets ITL).',
    'Batch-1 decode upper bound: tokens/s ≈ HBM bandwidth / bytes read per step (weights + KV). 8B bf16 on H100: 3,350 GB/s / 16 GB ≈ 209 tok/s.',
    'Arithmetic intensity of decode ≈ batch size FLOPs per weight byte (bf16); H100 ridge ≈ 989 TFLOPS / 3.35 TB/s ≈ 295 FLOP/byte → batches of hundreds before compute-bound.',
    'KV cache bytes = layers × 2 × kv_heads × head_dim × bytes × tokens. Llama-3-8B: 32×2×8×128×2 = 128 KiB/token → 1 GiB per 8k tokens; Llama-3-70B: 320 KiB/token.',
    'PagedAttention stores KV in fixed blocks (e.g. 16 tokens) → near-zero fragmentation; prefix caching reuses blocks whose token prefix hash matches.',
    'FP8 KV cache halves KV memory and decode KV reads; GQA/MLA shrink it architecturally.',
    'Speculative decoding: draft proposes γ tokens, target verifies all in one pass; expected tokens per pass = (1 − α^(γ+1)) / (1 − α). α=0.8, γ=4 → 3.36.',
    'Spec-decode output distribution is identical to the target model (rejection sampling); gains shrink at large batch because decode becomes compute-bound.',
    'Tensor parallelism splits each layer across GPUs (2 all-reduces/layer, needs NVLink); pipeline parallelism splits layers into stages (cross-node friendly, bubbles); expert parallelism spreads MoE experts (all-to-all).',
    'Disaggregated serving runs prefill and decode on separate GPU pools and ships the KV cache between them, so long prompts never stall token streaming.',
  ],
  sections: [
    {
      heading: 'GPU and Inference Optimization — prefill vs decode and the memory-bandwidth wall',
      body: `**Intuition:** a GPU is a huge kitchen (compute) fed by a narrow door (memory bandwidth). During decode each new token needs *every* ingredient (all weights) carried through the door, but only a tiny bit of cooking. The cooks wait on the door, so you either carry fewer bytes or cook for many customers per trip.

**Two phases:**

| | Prefill | Decode |
|---|---|---|
| Work | all prompt tokens at once | 1 token per sequence per step |
| Shape | big GEMMs (T × d) | matrix-vector (batch × d) |
| Bound by | compute (FLOPs) | memory bandwidth (bytes) |
| User metric | TTFT | ITL / tokens per second |

**Roofline maths.** Arithmetic intensity = FLOPs / bytes moved. A decode step does ~2 FLOPs per parameter per sequence and reads each bf16 parameter (2 bytes) once, so intensity ≈ **batch size** FLOP/byte. H100 SXM: ~989 TFLOPS bf16 / 3.35 TB/s ≈ **295 FLOP/byte** ridge point. Below that batch, you are bandwidth-bound: tokens/s per sequence ≈ bandwidth / (weight bytes + KV bytes read).

**Optimisation levers, by phase:**
- **Decode (bytes):** batch more sequences per weight read (continuous batching), quantise weights (FP8/INT4) and KV cache, GQA/MLA models, speculative decoding (several tokens per weight read), CUDA graphs to remove per-step launch overhead.
- **Prefill (FLOPs):** FlashAttention, FP8 tensor cores, prefix caching (skip repeated prompt work), chunked prefill so long prompts interleave with decodes.
- **System:** right-size \`max_model_len\`, tensor parallelism for latency, separate pools for long prompts.

**When to use:** whenever you size hardware, set SLOs or decide between "faster GPU" and "smarter batching": first ask which phase dominates your traffic.`,
      example: `Llama-3.1-8B, bf16 weights (16.1 GB), on one H100 (3.35 TB/s).
- **Batch 1:** each step reads 16.1 GB → floor 4.8 ms → ≤ 208 tok/s; measured ~150–170 tok/s (kernel and launch overheads).
- **Batch 64, 2k context each:** weights still 16.1 GB per step, plus KV reads 64 × 2,048 × 128 KiB ≈ 17.2 GB → ~33 GB per step → ~10 ms/step → 64 sequences × ~100 tok/s ≈ **6,400 tok/s** aggregate. Per-user speed halved, total throughput up ~35×.
- **FP8 weights + FP8 KV:** bytes per step drop to ~8 + 8.6 ≈ 16.6 GB → ~5 ms/step → ~12,800 tok/s aggregate at the same batch.
Lesson: at real batch sizes the KV cache becomes as large a byte stream as the weights.`,
      diagram: `  achievable                 compute roof (989 TFLOPS bf16)
  TFLOPS  |                 ____________________________
          |               /
          |             /   <- ridge ~295 FLOP/byte
          |           /
          |         /  memory roof: 3.35 TB/s x intensity
          |       /
          |  decode     prefill (T=2k)
          |  b=1  b=64   o
          |   o    o
          +------------------------------------------>
             1    64       295                arithmetic intensity
                                              (FLOPs per byte)`,
      code: [
        {
          language: 'python',
          title: 'Roofline estimate for decode: step time, tokens/s and the compute-bound batch',
          code: `def decode_step(params_b, w_bytes, batch, ctx, kv_bytes_per_tok,
                bw_tb_s=3.35, tflops=989.0, n_gpus=1):
    """Lower-bound time for one decode step (all sequences emit one token)."""
    weight_bytes = params_b * 1e9 * w_bytes
    kv_bytes = batch * ctx * kv_bytes_per_tok          # attention reads the whole cache
    flops = 2 * params_b * 1e9 * batch                 # ~2 FLOPs/param/token (+ attention)
    t_mem = (weight_bytes + kv_bytes) / (bw_tb_s * 1e12 * n_gpus)
    t_cmp = flops / (tflops * 1e12 * n_gpus)
    t = max(t_mem, t_cmp)
    return {
        "batch": batch,
        "step_ms": round(t * 1e3, 2),
        "bound": "memory" if t_mem >= t_cmp else "compute",
        "tok_s_per_seq": round(1 / t),
        "tok_s_total": round(batch / t),
    }

KV_8B = 32 * 2 * 8 * 128 * 2                           # Llama-3-8B fp16: 131,072 B/token
for b in (1, 16, 64, 256, 512):
    print(decode_step(8.03, 2, b, ctx=2048, kv_bytes_per_tok=KV_8B))
# batch 1  -> ~4.8 ms, memory-bound, ~208 tok/s
# batch 64 -> ~9.9 ms, memory-bound (KV reads now ~half the bytes), ~6,500 tok/s total
# larger batches: KV traffic grows with batch, so long contexts stay memory-bound`,
        },
      ],
      prosCons: {
        pros: [
          'A two-line roofline model predicts most real-world decode behaviour within ~30%.',
          'Batching and quantisation give multi-fold throughput gains without new hardware.',
          'Separating prefill and decode thinking points straight to the right optimisation (FLOPs vs bytes).',
        ],
        cons: [
          { con: 'Bigger batches raise throughput but slow every individual user.', fix: 'Set an ITL SLO (e.g. ≤ 30 ms) and cap concurrency (max_num_seqs) at the largest batch that meets it; scale out replicas beyond that.' },
          { con: 'Long contexts make KV reads dominate, so weight quantisation alone stops helping.', fix: 'Quantise the KV cache (FP8), prefer GQA/MLA models, and cap context per request.' },
          { con: 'Long prefills block decodes and spike ITL for everyone.', fix: 'Enable chunked prefill with a token budget per step, or disaggregate prefill onto separate GPUs.' },
          { con: 'Kernel launch overhead dominates at small batch for small models.', fix: 'Use CUDA graphs / torch.compile (vLLM captures graphs by default) and fused kernels.' },
        ],
      },
      keyPoints: [
        'Prefill = compute-bound (TTFT); decode = bandwidth-bound (ITL).',
        'Decode tok/s ≈ bandwidth / bytes per step.',
        'Batch raises intensity; KV reads grow with batch × context.',
        'Optimise bytes for decode, FLOPs for prefill.',
      ],
      exercise: {
        prompt: `Write \`crossover_batch(params_b, w_bytes, tflops, bw_tb_s)\` returning the smallest batch at which a decode step becomes **compute-bound**, ignoring KV-cache reads. Then explain in a comment why real deployments rarely reach it.

Acceptance: 8B bf16 on H100 (989 TFLOPS, 3.35 TB/s) → ~296; 8B FP8 weights with FP8 compute (1,979 TFLOPS) → ~296 as well (both bytes and FLOP rate change by 2×).`,
        hints: [
          'Memory time = params × w_bytes / bandwidth; compute time = 2 × params × batch / FLOP rate.',
          'Set them equal and solve for batch: batch = w_bytes × FLOP rate / (2 × bandwidth).',
          'Round up with math.ceil.',
        ],
        solution: {
          language: 'python',
          code: `import math

def crossover_batch(params_b, w_bytes, tflops, bw_tb_s):
    # memory time per step:  params * w_bytes / bw
    # compute time per step: 2 * params * batch / flops
    # equal when batch = w_bytes * flops / (2 * bw)   (params cancel out)
    return math.ceil(w_bytes * tflops * 1e12 / (2 * bw_tb_s * 1e12))

print(crossover_batch(8.03, 2, 989, 3.35))    # 296
print(crossover_batch(8.03, 1, 1979, 3.35))   # 296

# Why rarely reached: (1) KV-cache reads grow with batch x context, adding bytes
# so the step stays memory-bound; (2) KV memory limits how many sequences fit;
# (3) ITL SLOs cap batch size well before ~300 concurrent sequences.`,
        },
        explanation: 'The crossover depends only on the hardware ratio and bytes per weight, not on model size. With KV reads included, long-context batches stay memory-bound even at hundreds of sequences, which is why KV-cache size, not FLOPs, usually limits decode throughput.',
      },
      quickCheck: {
        question: 'You move a batch-1 chatbot (8B model) from an A100 80 GB (~2.0 TB/s, 312 TFLOPS bf16) to an H100 SXM (3.35 TB/s, 989 TFLOPS). Roughly how much faster does single-user decode get?',
        options: ['About 3.2× (FLOPs ratio)', 'About 1.7× (bandwidth ratio)', 'No change, decode is latency-bound by Python', 'About 10×'],
        correct: 1,
        explanation: 'Batch-1 decode is memory-bandwidth-bound, so speed scales with HBM bandwidth (3.35 / 2.0 ≈ 1.7×). The 3.2× FLOPs increase mainly helps prefill and large batches.',
      },
      source: 'NVIDIA H100 datasheet; Williams et al. 2009 — Roofline; Pope et al. 2022',
    },
    {
      heading: 'KV Cache — size formula, PagedAttention, prefix caching and KV quantisation',
      body: `**Intuition:** the KV cache is the model's short-term notes. Without it, generating token 1,001 would mean re-reading and re-processing all 1,000 previous tokens; with it, the model keeps each past token's keys and values and only processes the newest token.

**Why it exists:** past keys and values never change in a causal model, so each decode step does O(1) new work plus attention over cached K/V instead of recomputing all T positions.

**Size formula:**
\`bytes = layers × 2 (K and V) × kv_heads × head_dim × bytes_per_value × tokens\`

| Model | Layers | KV heads × dim | fp16 per token | 8k tokens |
|---|---|---|---|---|
| Llama-3-8B | 32 | 8 × 128 | 128 KiB | 1 GiB |
| Llama-3-70B | 80 | 8 × 128 | 320 KiB | 2.5 GiB |
| MHA 7B (32 heads) | 32 | 32 × 128 | 512 KiB | 4 GiB |

Multiply by concurrent sequences: 64 users × 8k on Llama-3-70B = 160 GiB, more than the FP8 weights.

**Managing it:**
- **PagedAttention:** KV stored in fixed blocks (e.g. 16 tokens) with a per-sequence block table; allocate on demand, near-zero fragmentation, and blocks can be **shared** between sequences.
- **Prefix caching:** blocks are keyed by a hash of all tokens up to that block; a new request with the same system prompt / documents / conversation history reuses them and skips that prefill (vLLM automatic prefix caching, SGLang RadixAttention, provider prompt caching).
- **KV quantisation:** FP8 halves memory and decode reads; usually minor quality impact.
- **Eviction/offload:** LRU eviction of unused prefix blocks, offload to CPU/SSD (e.g. LMCache) for long multi-turn sessions; preemption with recompute when the pool is full.

**When to use:** budget KV before choosing GPUs and max context; keep prompt prefixes stable.`,
      example: `Llama-3.1-70B in FP8 on 2 × H100 (160 GB total). Weights ≈ 71 GB; runtime/activations ≈ 8 GB → **~81 GB for KV**.
- fp16 KV at 320 KiB/token → 81e9 / 327,680 ≈ **247k tokens** in total, e.g. 30 users × 8k.
- FP8 KV (160 KiB/token) → ~494k tokens → 60 users × 8k.
A support bot sends a 3,000-token shared system prompt + tool schemas on every request. With prefix caching, those 3,000 tokens are stored once (≈ 0.98 GB fp16) and every request skips their prefill: TTFT drops from ~650 ms to ~180 ms and prefill GPU time per request falls ~80%.`,
      diagram: `  logical sequence A: [sys prompt 48 tok][user A 20 tok][gen ...]
  logical sequence B: [sys prompt 48 tok][user B 35 tok][gen ...]

  block table A: [b0][b1][b2][b7][b9]      16 tokens per block
  block table B: [b0][b1][b2][b4][b5]
                   ^   ^   ^
          shared prefix blocks (hash of tokens 0..47 matches)

  physical KV pool (GPU): b0 b1 b2 b3 b4 b5 b6 b7 b8 b9 ... free list
  per token per layer: K and V vectors for each KV head`,
      code: [
        {
          language: 'python',
          title: 'KV-cache budget and prefix caching with vLLM',
          code: `from vllm import LLM, SamplingParams

def kv_bytes_per_token(layers, kv_heads, head_dim, dtype_bytes=2):
    return layers * 2 * kv_heads * head_dim * dtype_bytes

per_tok = kv_bytes_per_token(32, 8, 128)             # Llama-3-8B: 131,072 B
print(per_tok / 1024, "KiB/token;", per_tok * 8192 / 2**30, "GiB per 8k sequence")

llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    max_model_len=16384,
    gpu_memory_utilization=0.90,
    enable_prefix_caching=True,        # reuse KV blocks for identical prefixes
    kv_cache_dtype="fp8",              # halve KV memory (FP8-capable GPUs)
)

SYSTEM = open("system_prompt_and_tools.txt").read()     # ~3k shared tokens
questions = ["Reset my password", "Cancel order 1182", "Change delivery address"]
prompts = [SYSTEM + "\\nUser: " + q + "\\nAssistant:" for q in questions]

params = SamplingParams(max_tokens=200, temperature=0.2)
# first call fills the cache for SYSTEM; later prompts hit the cached blocks
for out in llm.generate(prompts, params):
    print(out.outputs[0].text[:80])`,
        },
      ],
      prosCons: {
        pros: [
          'Turns quadratic recomputation into linear work per generated token.',
          'Paged blocks give near-zero fragmentation and cheap sharing across sequences.',
          'Prefix caching removes repeated prefill for shared system prompts, tools and chat history.',
        ],
        cons: [
          { con: 'KV memory grows with context × concurrency and often exceeds weight memory.', fix: 'Use FP8 KV, GQA/MLA models, cap max_model_len, and admission-control concurrent long requests.' },
          { con: 'Prefix caching silently misses when early tokens differ (timestamps, ids, reordered tools).', fix: 'Keep a stable, deterministic prefix order and put per-request dynamic content at the end; monitor prefix-cache hit rate.' },
          { con: 'Under memory pressure, sequences get preempted and recomputed, causing latency cliffs.', fix: 'Watch KV usage and preemption metrics, keep headroom (~10–20%), offload cold prefixes to CPU, or scale out.' },
          { con: 'KV quantisation can hurt precise long-context retrieval.', fix: 'Evaluate with needle-in-haystack and long-document QA before enabling FP8 KV; keep fp16 for sensitive tenants.' },
        ],
      },
      keyPoints: [
        'KV bytes = L × 2 × kv_heads × head_dim × bytes × tokens.',
        'Llama-3-8B: 128 KiB/token; 70B: 320 KiB/token (fp16).',
        'Paged blocks + prefix hashing enable sharing and reuse.',
        'Stable prefixes first, dynamic content last.',
      ],
      exercise: {
        prompt: `Write \`max_concurrent(vram_gb, weights_gb, overhead_gb, layers, kv_heads, head_dim, ctx, kv_dtype_bytes=2)\` returning how many sequences of length \`ctx\` fit in the KV budget.

Acceptance: Llama-3-8B (32 layers, 8 KV heads, head_dim 128) on an 80 GB GPU with 16 GB weights and 4 GB overhead at 8k context → **55** sequences with fp16 KV (1 GiB ≈ 1.07 GB each against a 60 GB budget) and **111** with FP8 KV.`,
        hints: [
          'KV budget in bytes = (vram − weights − overhead) × 1e9.',
          'Per-sequence bytes = layers × 2 × kv_heads × head_dim × dtype_bytes × ctx.',
          'Use integer division to get whole sequences.',
        ],
        solution: {
          language: 'python',
          code: `def max_concurrent(vram_gb, weights_gb, overhead_gb, layers, kv_heads, head_dim,
                   ctx, kv_dtype_bytes=2):
    budget = (vram_gb - weights_gb - overhead_gb) * 1e9
    per_seq = layers * 2 * kv_heads * head_dim * kv_dtype_bytes * ctx
    return int(budget // per_seq)

print(max_concurrent(80, 16, 4, 32, 8, 128, 8192))       # 55  (1.07 GB per sequence)
print(max_concurrent(80, 16, 4, 32, 8, 128, 8192, 1))    # 111 with FP8 KV
print(max_concurrent(80, 16, 4, 32, 32, 128, 8192))      # 13  if it were MHA (32 KV heads)`,
        },
        explanation: 'The budget left after weights decides concurrency at a given context. GQA (8 vs 32 KV heads) gives 4× more concurrent sequences and FP8 KV another 2×; in practice paged allocation means sequences rarely all reach max length at once, so real concurrency is higher than this worst-case bound.',
      },
      quickCheck: {
        question: 'Your vLLM prefix-cache hit rate is near zero even though every request uses the same 2,500-token system prompt. Which cause is most likely?',
        options: [
          'Prefix caching only works for prompts under 1,000 tokens',
          'The system prompt starts with a per-request timestamp or request id, so the token prefix differs from the first block onward',
          'KV blocks are too small to share',
          'Prefix caching needs FP8 KV cache enabled',
        ],
        correct: 1,
        explanation: 'Prefix caching matches exact token prefixes block by block; a dynamic value at the start changes the very first block\'s hash, so nothing downstream can match. There is no 1,000-token limit, block size does not prevent sharing, and caching does not depend on KV dtype.',
      },
      source: 'Kwon et al. 2023 — PagedAttention; vLLM docs — Automatic Prefix Caching; SGLang RadixAttention',
    },
    {
      heading: 'Speculative Decoding — draft and verify, acceptance rate, EAGLE and Medusa',
      body: `**Intuition:** a junior writer drafts the next few words quickly; a senior editor checks them all in one glance, keeps the correct prefix and fixes the first wrong word. Because decode is memory-bound, checking 5 tokens costs about the same as generating 1.

**Mechanics:**
1. A cheap **drafter** proposes γ tokens (γ = 3–8).
2. The **target** model runs one forward pass over all γ positions (like a mini prefill), producing its own distribution at each.
3. **Verification:** accept draft token i with probability min(1, p_target / p_draft) (greedy: accept if it equals the target's argmax); at the first rejection, sample a correction from the adjusted distribution and stop. If all are accepted, the target's next token comes free (a bonus token).
4. The output distribution is **exactly** the target's: quality is unchanged.

**Expected tokens per target pass** with per-token acceptance rate α: \`(1 − α^(γ+1)) / (1 − α)\`. Speedup ≈ that divided by \`(1 + γ·c)\`, where c is the drafter's cost relative to the target.

**Drafter options:**

| Method | Drafter | Typical speedup |
|---|---|---|
| Draft model | small same-tokenizer model (e.g. 1B for 70B) | 2–3× |
| n-gram / prompt lookup | copy spans from the prompt | 1.5–3× on summarisation, code edits, RAG |
| Medusa | extra decoding heads on the target | ~2.2–3.6× |
| EAGLE-2/3 | lightweight head on target hidden features, tree drafts | ~3–6× reported |
| MTP | built-in multi-token prediction modules (DeepSeek-V3) | ~1.8× |

**When it helps:** latency-sensitive, low-to-moderate batch serving (memory-bound). At large batch the GPU is closer to compute-bound and verifying rejected tokens wastes FLOPs, so gains shrink or vanish; many servers disable it above a batch threshold.`,
      example: `Target 70B, EAGLE-style drafter with c ≈ 0.05, γ = 4.
- Chat traffic, α = 0.8: expected tokens/pass = (1 − 0.8⁵)/(0.2) = (1 − 0.328)/0.2 = **3.36**; cost per pass = 1 + 4 × 0.05 = 1.2 → speedup ≈ **2.8×** (ITL 40 ms → ~14 ms per token).
- Creative writing, α = 0.55: (1 − 0.55⁵)/0.45 = 2.11 → speedup ≈ 1.76×.
- Raising γ to 8 at α = 0.55: (1 − 0.55⁹)/0.45 = 2.21 tokens, cost 1.4 → 1.58×, worse: long drafts are wasted when acceptance is low.
- Same chat service at batch 128: GPU already near compute-bound; measured gain fell to ~1.1×, so the team enables speculation only when running batch < 32.`,
      diagram: `  context: "The capital of France is"
                      |
       drafter  -->  [ Paris ][ . ][ It ][ is ]      gamma = 4 (cheap)
                      |
       target (ONE forward pass over the 4 positions)
                      |
       verify:  Paris ok   .  ok   It  ok   is  X (target wants "has")
                      |
       emit: "Paris . It has"   -> 3 accepted + 1 correction = 4 tokens
             for ~1 target pass instead of 4`,
      code: [
        {
          language: 'python',
          title: 'Expected speedup model, plus enabling speculative decoding in vLLM',
          code: `def expected_tokens(alpha: float, gamma: int) -> float:
    # accepted prefix + one correction/bonus token per target pass
    return (1 - alpha ** (gamma + 1)) / (1 - alpha)

def speedup(alpha: float, gamma: int, c: float) -> float:
    # c = cost of one draft step relative to one target step
    return expected_tokens(alpha, gamma) / (1 + gamma * c)

for a in (0.5, 0.7, 0.8, 0.9):
    best = max(range(1, 11), key=lambda g: speedup(a, g, 0.05))
    print(f"alpha={a}: best gamma={best}, speedup={speedup(a, best, 0.05):.2f}x")

# vLLM: EAGLE-3 drafter (or "ngram" prompt lookup for RAG / code editing)
from vllm import LLM, SamplingParams
llm = LLM(
    model="meta-llama/Llama-3.1-8B-Instruct",
    speculative_config={
        "method": "eagle3",
        "model": "yuhuili/EAGLE3-LLaMA3.1-Instruct-8B",   # drafter weights
        "num_speculative_tokens": 4,
    },
)
# ngram alternative: {"method": "ngram", "num_speculative_tokens": 5, "prompt_lookup_max": 4}
print(llm.generate(["Explain KV caching in two sentences."],
                   SamplingParams(max_tokens=80, temperature=0))[0].outputs[0].text)`,
        },
      ],
      prosCons: {
        pros: [
          'Lossless: the output distribution equals the target model\'s, so no quality evaluation trade-off.',
          '2–3× lower inter-token latency for interactive, low-batch serving.',
          'Prompt-lookup (n-gram) drafting needs no extra model and shines on RAG, summarisation and code edits.',
        ],
        cons: [
          { con: 'Gains collapse at high batch, when decode becomes compute-bound.', fix: 'Enable speculation adaptively (only below a batch/load threshold) and measure goodput at your real concurrency.' },
          { con: 'Low acceptance (creative text, high temperature, domain mismatch) wastes draft work.', fix: 'Tune γ per workload (3–5 typical), train or fine-tune the drafter (EAGLE/Medusa heads) on your traffic, and monitor acceptance rate.' },
          { con: 'A separate draft model costs extra memory and must share the tokenizer.', fix: 'Use EAGLE/Medusa heads or MTP modules that reuse the target\'s hidden states, or n-gram drafting.' },
          { con: 'More complex serving stack (tree attention, verification kernels).', fix: 'Use built-in implementations in vLLM/SGLang/TensorRT-LLM rather than custom code; pin versions and benchmark.' },
        ],
      },
      keyPoints: [
        'Draft γ tokens, verify in one target pass, keep the accepted prefix + one.',
        'Expected tokens/pass = (1 − α^(γ+1)) / (1 − α).',
        'Exact target distribution via rejection sampling.',
        'Best at low batch; tune γ to acceptance rate.',
      ],
      exercise: {
        prompt: `Implement **greedy** speculative verification: \`verify(draft_tokens, target_argmax)\` where \`target_argmax[i]\` is the target model's greedy choice at draft position i, and \`target_argmax[len(draft)]\` is its choice after the full draft. Return the tokens to emit.

Acceptance: draft [5, 9, 2, 7] vs target [5, 9, 4, 1, 3] → [5, 9, 4]; draft fully accepted [5, 9] vs [5, 9, 8] → [5, 9, 8] (bonus token); first token wrong [1] vs [2, 6] → [2].`,
        starter: {
          language: 'python',
          code: `def verify(draft_tokens, target_argmax):
    out = []
    # TODO: accept matching prefix, then append the target's token at the
    #       first mismatch (or the bonus token if all matched)
    return out`,
        },
        hints: [
          'Walk the draft; while draft[i] == target_argmax[i], append it.',
          'At the first mismatch, append target_argmax[i] and stop.',
          'If the loop finishes without a mismatch, append target_argmax[len(draft)].',
        ],
        solution: {
          language: 'python',
          code: `def verify(draft_tokens, target_argmax):
    out = []
    for i, tok in enumerate(draft_tokens):
        if tok == target_argmax[i]:
            out.append(tok)                    # accepted draft token
        else:
            out.append(target_argmax[i])       # correction from target
            return out
    out.append(target_argmax[len(draft_tokens)])  # bonus token: all accepted
    return out

assert verify([5, 9, 2, 7], [5, 9, 4, 1, 3]) == [5, 9, 4]
assert verify([5, 9], [5, 9, 8]) == [5, 9, 8]
assert verify([1], [2, 6]) == [2]`,
        },
        explanation: 'Every verification pass emits at least one token (the correction) and at most γ + 1, so speculation can never be slower in tokens per target pass, only in wall-clock when drafting cost or wasted compute is high. With sampling, the equality test is replaced by rejection sampling to keep the exact target distribution.',
      },
      quickCheck: {
        question: 'Acceptance rate α = 0.6 and the drafter is nearly free (c ≈ 0). Roughly how many tokens does each target pass produce with γ = 3?',
        options: ['About 2.18', 'About 3.0', 'About 1.6', 'About 4.0'],
        correct: 0,
        explanation: '(1 − 0.6⁴)/(1 − 0.6) = (1 − 0.1296)/0.4 ≈ 2.18. 4.0 assumes every draft is accepted (γ + 1), 3.0 ignores rejections and the bonus token, and 1.6 underestimates the accepted prefix.',
      },
      source: 'Leviathan et al. 2023; Chen et al. 2023; Cai et al. 2024 — Medusa; Li et al. — EAGLE-3; vLLM speculative decoding docs',
    },
    {
      heading: 'Distributed Inference — tensor, pipeline and expert parallelism, and disaggregated prefill/decode',
      body: `**Intuition:** when one GPU cannot hold or serve a model fast enough, you split the work. Tensor parallelism: several chefs cut the same onion; pipeline parallelism: an assembly line of layer stations; expert parallelism: each order goes to its specialist station.

| Strategy | Splits | Communication | Best for |
|---|---|---|---|
| Data parallel (replicas) | nothing: full copy per group | none between replicas | scaling throughput once a model fits |
| Tensor parallel (TP) | each matrix by columns/rows (heads, MLP) | 2 all-reduces per layer per step | lower latency inside one NVLink node (TP ≤ 8) |
| Pipeline parallel (PP) | layers into stages | point-to-point activations between stages | models larger than one node; cross-node links |
| Expert parallel (EP) | MoE experts across GPUs | all-to-all token dispatch/combine | large MoE (DeepSeek-V3, Llama 4, Qwen MoE) |
| Context/sequence parallel | the sequence | ring/all-gather of KV | very long-context prefill |

**Rules of thumb:** TP within a node (NVLink 900 GB/s on H100), PP across nodes (InfiniBand/RoCE ~50 GB/s per link), EP for MoE expert weights with attention in TP or DP. TP also *adds bandwidth*: TP=4 reads weights from 4 HBMs in parallel, cutting batch-1 latency, though all-reduce overhead limits scaling.

**Disaggregated prefill/decode:** prefill (compute-bound, bursty) and decode (bandwidth-bound, steady) interfere when co-located: a 30k-token prefill stalls every streaming user. Disaggregation (DistServe, Splitwise; NVIDIA Dynamo, vLLM and SGLang PD modes) runs separate prefill and decode pools, transfers the KV cache over NVLink/RDMA, and sizes each pool for its own SLO (TTFT vs ITL). Cost: KV transfer bandwidth and more moving parts.

**When to use:** split a model only when it or its KV cache does not fit, or latency needs more bandwidth than one GPU; otherwise use replicas.`,
      example: `Serving Llama-3.1-405B in FP8 (~405 GB weights) on 2 nodes of 8 × H100 80 GB (1,280 GB total).
- TP=8 within each node, PP=2 across nodes: each GPU holds ~25 GB of weights, leaving ~45–50 GB per GPU for KV (~750 GB total for KV).
- TP=16 across both nodes would put all-reduces on InfiniBand: twice per layer × 126 layers per token; at ~50 GB/s per link this adds tens of ms per token, so TP stays inside the node.
- A 30k-token RAG prompt prefill took ~2.5 s and froze decoding for 40 streaming users (ITL spike from 35 ms to 900 ms). Moving to disaggregated serving (1 node prefill, 1 node decode, KV over RDMA ~ 30k × 126 layers × 2 × 8 × 128 × 1 B ≈ 7.7 GB per request in FP8) removed the spikes; ITL p99 back to 45 ms.`,
      diagram: `  TENSOR PARALLEL (inside a node)        PIPELINE PARALLEL (across nodes)
  layer i:  X --> [W cols 1/4] GPU0      node A: layers 0-62 (TP=8)
                  [W cols 2/4] GPU1          |  activations (P2P)
                  [W cols 3/4] GPU2          v
                  [W cols 4/4] GPU3      node B: layers 63-125 (TP=8)
            all-reduce --> next layer

  EXPERT PARALLEL (MoE)                  DISAGGREGATED SERVING
  tokens --router--> all-to-all          prompt --> [prefill pool] --KV-->
     GPU0: experts 0-31                             (compute-bound)  |
     GPU1: experts 32-63   ... combine              RDMA/NVLink     v
                                                    [decode pool] --> stream`,
      code: [
        {
          language: 'python',
          title: 'Choosing and launching TP/PP layouts with vLLM',
          code: `import math

def plan_parallelism(weights_gb, kv_gb_needed, gpu_gb=80, gpus_per_node=8,
                     usable=0.9):
    """Smallest layout that fits: prefer TP inside a node, then add PP stages."""
    need = weights_gb + kv_gb_needed
    for tp in (1, 2, 4, 8):
        if tp > gpus_per_node:
            break
        if need <= tp * gpu_gb * usable:
            return {"tp": tp, "pp": 1, "gpus": tp}
    tp = gpus_per_node
    pp = math.ceil(need / (tp * gpu_gb * usable))   # whole nodes as stages
    return {"tp": tp, "pp": pp, "gpus": tp * pp}

print(plan_parallelism(16, 20))      # 8B bf16    -> tp 1
print(plan_parallelism(71, 60))      # 70B FP8    -> tp 2
print(plan_parallelism(405, 500))    # 405B FP8   -> tp 8, pp 2

# Single node, TP=8 (offline engine); for PP across nodes start a Ray cluster
# and set pipeline_parallel_size=2 (or: vllm serve ... --tensor-parallel-size 8
#   --pipeline-parallel-size 2 on the Ray head node).
from vllm import LLM
llm = LLM(model="meta-llama/Llama-3.1-70B-Instruct",
          tensor_parallel_size=2,           # shard each layer over 2 GPUs
          quantization="fp8",
          max_model_len=32768)`,
        },
      ],
      prosCons: {
        pros: [
          'Serves models far larger than one GPU and lowers latency by aggregating HBM bandwidth.',
          'Expert parallelism makes huge MoE models economical: each token touches few experts.',
          'Disaggregation lets TTFT and ITL be tuned independently and removes prefill/decode interference.',
        ],
        cons: [
          { con: 'TP all-reduces dominate over slow links and limit scaling beyond one node.', fix: 'Keep TP within an NVLink domain (≤ 8 GPUs), use PP or EP across nodes, and overlap communication with compute where the engine supports it.' },
          { con: 'Pipeline bubbles waste GPU time at small batch.', fix: 'Use enough concurrent requests/micro-batches to keep all stages busy, or prefer TP when the model fits in one node.' },
          { con: 'MoE expert load imbalance creates hot GPUs.', fix: 'Use expert load balancing (redundant hot experts, EPLB-style rebalancing) and capacity limits, and monitor per-expert token counts.' },
          { con: 'Disaggregation adds KV-transfer bandwidth needs and operational complexity.', fix: 'Adopt it only when long-prompt interference is measurable; use RDMA/NVLink transfer and engines with built-in PD support (Dynamo, vLLM, SGLang).' },
        ],
      },
      keyPoints: [
        'Replicas first; split a model only when it or its KV does not fit.',
        'TP inside the node, PP across nodes, EP for MoE experts.',
        'TP also multiplies effective bandwidth for decode latency.',
        'Disaggregate prefill/decode when long prompts hurt ITL.',
      ],
      exercise: {
        prompt: `Write \`tp_allreduce_ms(hidden, batch, layers, tp, link_gb_s, bytes_per_val=2)\` estimating per-token all-reduce time for tensor parallelism: 2 all-reduces per layer, each moving \`2 × (tp − 1)/tp × hidden × batch × bytes\` per GPU (ring all-reduce).

Compare TP=8 over NVLink (≈ 450 GB/s effective per GPU) and over InfiniBand (≈ 50 GB/s) for a 405B-class model (hidden 16,384, 126 layers) at batch 32.

Acceptance: NVLink ≈ 1 ms per decode step; InfiniBand ≈ 9 ms, which is why TP stays inside a node.`,
        hints: [
          'Per all-reduce bytes = 2 × (tp − 1)/tp × hidden × batch × bytes_per_val.',
          'Per step there are 2 × layers all-reduces.',
          'Time = total bytes / (link_gb_s × 1e9), converted to ms.',
        ],
        solution: {
          language: 'python',
          code: `def tp_allreduce_ms(hidden, batch, layers, tp, link_gb_s, bytes_per_val=2):
    per_ar = 2 * (tp - 1) / tp * hidden * batch * bytes_per_val   # ring all-reduce
    total = per_ar * 2 * layers                                    # 2 per layer
    return total / (link_gb_s * 1e9) * 1e3

nv = tp_allreduce_ms(16384, 32, 126, 8, 450)
ib = tp_allreduce_ms(16384, 32, 126, 8, 50)
print(f"NVLink {nv:.2f} ms, InfiniBand {ib:.2f} ms per decode step")
# NVLink ~1.03 ms, InfiniBand ~9.25 ms (plus latency per message, which makes it worse)`,
        },
        explanation: 'Bandwidth cost alone is ~1 ms per step on NVLink but ~9 ms over InfiniBand, on top of per-message latency for 252 all-reduces. With decode steps of ~20–40 ms, cross-node TP would add 25–50% latency, whereas pipeline parallelism only sends activations once per stage boundary.',
      },
      quickCheck: {
        question: 'A 70B model in FP8 (~71 GB) must serve batch-1 requests with the lowest possible latency, and you have 4 H100s in one NVLink node. Which layout is best?',
        options: [
          'One replica with TP=4, so each token reads weights from 4 HBMs in parallel',
          'Four replicas with one GPU each',
          'PP=4 with one stage per GPU',
          'TP=2 × PP=2',
        ],
        correct: 0,
        explanation: 'Batch-1 latency is bandwidth-bound; TP=4 splits each layer\'s weight reads across 4 GPUs (~4× bandwidth, minus NVLink all-reduce overhead). Single-GPU replicas leave almost no KV room and are slower per token, PP processes stages sequentially (no latency gain at batch 1), and TP2×PP2 adds pipeline latency.',
      },
      source: 'Shoeybi et al. 2019 — Megatron-LM; Zhong et al. 2024 — DistServe; DeepSeek-V3 report; vLLM parallelism docs',
    },
  ],
  codeChallenges: [
    {
      id: 'inference-optimization-cc-1',
      title: 'Speed up a naive generation loop',
      context: 'An evaluation script generates 300-token answers with a 7B model and takes ~90 s per answer on an A100. GPU memory also creeps up until it OOMs after a few dozen prompts.',
      task: 'Rewrite the loop to use the KV cache, disable autograd, use bf16 and stop on EOS, then explain the complexity change.',
      starter: {
        language: 'python',
        code: `import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL).cuda()   # fp32

def generate(prompt, n=300):
    ids = tok(prompt, return_tensors="pt").input_ids.cuda()
    for _ in range(n):
        logits = model(ids).logits                 # full sequence every step
        nxt = logits[:, -1].argmax(-1, keepdim=True)
        ids = torch.cat([ids, nxt], dim=1)
    return tok.decode(ids[0])`,
      },
      hints: [
        'Pass past_key_values from the previous step and feed only the newest token.',
        'Wrap generation in torch.inference_mode() so no autograd graph is stored.',
        'Load the model in bf16 and break when the EOS token is produced.',
      ],
      solution: {
        language: 'python',
        code: `import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.bfloat16,
                                             device_map="cuda").eval()

@torch.inference_mode()                              # no autograd graph / memory growth
def generate(prompt, n=300):
    ids = tok(prompt, return_tensors="pt").input_ids.to(model.device)
    out = model(ids, use_cache=True)                 # prefill once: O(T) work
    past = out.past_key_values
    nxt = out.logits[:, -1].argmax(-1, keepdim=True)
    generated = [nxt]
    for _ in range(n - 1):
        if nxt.item() == tok.eos_token_id:
            break
        out = model(nxt, past_key_values=past, use_cache=True)   # 1 token per step
        past = out.past_key_values
        nxt = out.logits[:, -1].argmax(-1, keepdim=True)
        generated.append(nxt)
    return tok.decode(torch.cat(generated, dim=1)[0], skip_special_tokens=True)

# In practice: model.generate(..., max_new_tokens=300) does all of this, and for
# throughput batch prompts through vLLM instead of looping one at a time.`,
      },
      explanation: `The original re-ran the full forward pass over the growing sequence every step (O(T²) total work over a generation), built autograd graphs that held activations (memory creep → OOM) and ran in fp32 (2× bytes, slower). The fix prefills once, then feeds one token per step with the KV cache (O(T) total), runs under inference_mode in bf16 and stops at EOS. Expect ~10–30× speed-up per answer; batching via vLLM gives far more throughput.`,
      followUps: [
        { q: 'Why is the first call still slow for a long prompt?', a: 'Prefill must process every prompt token once (compute-bound); prefix caching or shorter prompts reduce it, but it is inherent to processing the prompt.' },
        { q: 'How would you evaluate 10,000 prompts fastest?', a: 'Use an offline batched engine (vLLM LLM.generate with all prompts) so continuous batching keeps the GPU saturated, rather than sequential per-prompt loops.' },
      ],
    },
    {
      id: 'inference-optimization-cc-2',
      title: 'Fix a speculative-sampling verifier that changes the output distribution',
      context: 'A custom speculative decoding implementation with temperature 0.8 shows 3× speed-up, but evaluators notice the output style drifted towards the small draft model and some answers got worse.',
      task: 'Fix the verification so the output distribution exactly matches the target model, including the correction sample on rejection.',
      starter: {
        language: 'python',
        code: `import torch

def verify(draft_tokens, p_draft, p_target):
    """draft_tokens: (gamma,) ; p_draft, p_target: (gamma+1, vocab) probabilities"""
    out = []
    for i, t in enumerate(draft_tokens):
        if p_target[i, t] > 0.1:                  # "good enough" threshold
            out.append(t.item())
        else:
            out.append(torch.argmax(p_target[i]).item())
            break
    return out`,
      },
      hints: [
        'Accept token t with probability min(1, p_target[t] / p_draft[t]) using a uniform random draw.',
        'On rejection, sample from the residual distribution max(0, p_target − p_draft), renormalised.',
        'If all γ tokens are accepted, sample a bonus token from p_target[γ].',
      ],
      solution: {
        language: 'python',
        code: `import torch

def verify(draft_tokens, p_draft, p_target, generator=None):
    """Speculative sampling (Leviathan et al. / Chen et al.): exact target distribution."""
    out = []
    for i, t in enumerate(draft_tokens.tolist()):
        ratio = (p_target[i, t] / p_draft[i, t].clamp_min(1e-12)).clamp(max=1.0)
        if torch.rand((), generator=generator) < ratio:
            out.append(t)                                    # accept draft token
            continue
        residual = (p_target[i] - p_draft[i]).clamp_min(0)  # where target > draft
        residual = residual / residual.sum()
        out.append(torch.multinomial(residual, 1, generator=generator).item())
        return out                                           # stop at first rejection
    # all accepted: bonus token from the target's next-position distribution
    out.append(torch.multinomial(p_target[len(draft_tokens)], 1, generator=generator).item())
    return out`,
      },
      explanation: `A fixed probability threshold accepts tokens the target would rarely choose and replaces rejections with an argmax, so the output is neither the target's sampling distribution nor greedy: it drifts towards the drafter. Proper speculative sampling accepts with probability min(1, p/q) and, on rejection, samples from the normalised residual max(0, p − q); together these make each emitted token distributed exactly as the target model. The bonus token preserves the "at least one, up to γ+1 tokens per pass" property.`,
      followUps: [
        { q: 'How do you test that the distribution is unchanged?', a: 'With toy distributions, run verification many times and compare emitted-token frequencies with direct sampling from p_target (e.g. chi-square test); they should match within sampling error.' },
        { q: 'What does acceptance rate depend on?', a: 'How closely the drafter\'s distribution matches the target (expected acceptance = Σ min(p, q)), so temperature, domain and drafter training data all matter.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'inference-optimization-iq-1',
      difficulty: 'hard',
      question: 'Explain to a product manager why doubling GPU FLOPs barely changes chat latency but batching more users barely slows each one down, up to a point.',
      whatInterviewerLooksFor: [
        'Decode is memory-bandwidth bound at small batch',
        'Weights are read once per step regardless of batch size',
        'Batch increases arithmetic intensity until KV reads / compute dominate',
        'Translates into SLO and capacity decisions',
      ],
      modelAnswer: `**Generation is a reading problem, not a maths problem.** To produce each token, the GPU must stream every model weight from memory (16 GB for an 8B model in bf16). On an H100 that takes ~5 ms; the arithmetic for one user takes well under 0.1 ms. So the GPU spends ~98% of a batch-1 step waiting on memory. Doubling FLOPs speeds up the part that was not the bottleneck; only more memory bandwidth (or fewer bytes, via quantisation) helps.

**Why batching is almost free.** Weights are read once per step and used for *every* sequence in the batch. Adding a second user adds a little arithmetic and that user's KV-cache reads, but not another 16 GB of weights. So 1 → 32 users might raise step time from ~5 ms to ~8 ms: per-user speed drops ~35%, total throughput rises ~20×.

**Where it stops being free:**
1. **KV-cache reads** grow with users × context length; at long contexts they rival weight reads.
2. **Compute-bound** crossover around a few hundred concurrent sequences on H100-class GPUs.
3. **Memory capacity:** KV for all users must fit.
4. **SLOs:** past some batch size, per-user tokens/s drops below what feels fluent (~20–30 tok/s for reading).

**Business translation:** buy bandwidth and memory for latency, use batching for cost; set a per-user speed floor and pack as many users per GPU as fit above it.`,
      followUps: [
        { q: 'What is the reading-speed argument for ITL targets?', a: 'People read roughly 4–8 words per second (~5–10 tokens/s), so streaming above ~20–30 tokens/s feels instant; extra speed matters mainly for agents and long outputs, not human reading.' },
        { q: 'Where do FLOPs matter then?', a: 'In prefill (long prompts, TTFT), very large batches, and training; that is where FP8 tensor cores and more TFLOPS pay off.' },
      ],
      pitfalls: [
        'Claiming more FLOPs always means faster tokens.',
        'Ignoring KV-cache reads at long context.',
        'Forgetting capacity limits on batch size.',
      ],
    },
    {
      id: 'inference-optimization-iq-2',
      difficulty: 'hard',
      question: 'You run a multi-turn assistant where conversations reach 20k tokens. GPU memory runs out at only 12 concurrent conversations on 2 × H100 with a 70B FP8 model. Propose a KV-cache strategy.',
      whatInterviewerLooksFor: [
        'Computes current KV footprint',
        'FP8 KV, prefix caching, offload/eviction',
        'Conversation-level strategies: summarisation, truncation, sliding windows',
        'Routing/affinity and admission control',
      ],
      modelAnswer: `**Quantify.** Llama-3-70B fp16 KV = 320 KiB/token → 20k tokens ≈ 6.6 GB per conversation; 12 conversations ≈ 79 GB, matching the ~80 GB left after 71 GB of weights and overhead.

**Levers (in order of effort):**
1. **FP8 KV cache:** halves to ~3.3 GB per conversation → ~24 concurrent. Validate long-context quality.
2. **Prefix caching across turns:** each new turn shares the previous turns' KV; with session affinity routing (same replica per conversation) we avoid re-prefilling 20k tokens each turn, which is a TTFT win and avoids duplicate KV.
3. **Offload idle conversations:** users think for 30–120 s between turns; evict their KV from GPU to CPU RAM/NVMe (LMCache-style) and reload on the next turn (~6.6 GB over PCIe at ~25 GB/s ≈ 0.3 s, cheaper than 20k-token prefill). This decouples *active* from *open* conversations, often 5–10×.
4. **Context management:** summarise or drop old turns beyond a budget (e.g. keep last 8k verbatim + summary), and trim tool outputs; most 20k histories carry stale tool results.
5. **Admission control:** cap active long sequences; queue or degrade gracefully instead of preempting everybody.
6. **Hardware/model:** more GPUs (TP=4 adds 160 GB), or a model with MLA/smaller KV.

**Expected:** FP8 KV + offload + context budget → 50–100 open conversations on the same hardware with similar quality.`,
      followUps: [
        { q: 'Why does session affinity matter for prefix caching?', a: 'Caches are per replica; routing a conversation to a different replica means its previous turns\' KV is absent, forcing a full re-prefill of 20k tokens.' },
        { q: 'When is recompute cheaper than reloading from CPU?', a: 'For short prefixes (a few hundred tokens) recompute is faster than a PCIe transfer and avoids storage pressure; for long contexts reload usually wins.' },
      ],
      pitfalls: [
        'Not computing the KV footprint first.',
        'Only buying more GPUs.',
        'Ignoring idle time between turns.',
      ],
    },
    {
      id: 'inference-optimization-iq-3',
      difficulty: 'expert',
      question: 'Speculative decoding gave a 2.5× latency win in staging, but in production at peak load throughput dropped 15%. Explain why and what you would do.',
      whatInterviewerLooksFor: [
        'Batch size changes the bottleneck from bandwidth to compute',
        'Wasted verification FLOPs on rejected tokens',
        'Acceptance rate differences between staging and production traffic',
        'Adaptive enabling and γ tuning',
      ],
      modelAnswer: `**Why staging looked great:** staging ran at low concurrency (batch 1–8). Decode was memory-bound, so verifying 4–5 draft tokens per target pass cost almost nothing extra: free tokens per weight read.

**Why production regressed:**
1. **Compute-bound at peak:** with 100+ concurrent sequences, steps already use a large share of tensor-core throughput. Each target pass now processes (γ + 1) positions per sequence; rejected positions are pure wasted FLOPs, lowering total throughput.
2. **Lower acceptance:** production traffic (higher temperature, multilingual, tool-JSON) may have α ≈ 0.5 instead of staging's 0.8, so fewer tokens per pass.
3. **Drafter overhead:** drafter forward passes and extra KV for draft positions consume memory, shrinking max batch.

**What to do:**
- **Adaptive speculation:** enable only when the running batch is below a threshold (e.g. < 32) or when the queue is short; vLLM/TensorRT-LLM support disabling by batch size.
- **Tune γ** per traffic class from measured α (2–3 at α ≈ 0.6, 4–6 at α ≈ 0.8).
- **Better drafter:** EAGLE-style heads trained on production traffic; n-gram lookup for RAG/code workloads with high copy rates.
- **Measure goodput** under realistic load (latency SLO + throughput), with acceptance rate and per-batch-size metrics on dashboards.`,
      followUps: [
        { q: 'Why is speculative decoding still attractive for agents even at moderate load?', a: 'Agent steps are sequential and latency-critical (each tool call waits for the previous generation), and outputs such as JSON and code have high acceptance rates, so ITL gains compound across many steps.' },
        { q: 'Does speculation change the outputs?', a: 'No, correct speculative sampling preserves the target distribution exactly; only numerical non-determinism from different batch shapes can cause tiny differences.' },
      ],
      pitfalls: [
        'Assuming speculation is free at any load.',
        'Not measuring acceptance rate in production.',
        'Using a fixed γ for all traffic.',
      ],
    },
    {
      id: 'inference-optimization-iq-4',
      difficulty: 'expert',
      question: 'You must serve a 671B-parameter MoE model (37B active, FP8) on 2 nodes of 8 × H100. How would you parallelise it and what bottlenecks do you expect?',
      whatInterviewerLooksFor: [
        'Memory maths: 671 GB of weights vs 1,280 GB HBM',
        'EP for experts, TP/DP for attention, PP option across nodes',
        'All-to-all communication and expert load balancing',
        'KV-cache budget (MLA) and disaggregation options',
      ],
      modelAnswer: `**Memory:** 671B × 1 byte ≈ 671 GB of FP8 weights vs 16 × 80 = 1,280 GB HBM → ~600 GB left for KV, activations and buffers. It fits across both nodes but not one.

**Layout options:**
- **Expert parallelism (EP=16) for MoE layers:** spread the ~256 routed experts across all 16 GPUs (16 experts each); tokens are dispatched via all-to-all to the GPUs holding their top-k experts and combined back. Only ~37B parameters are active per token, so compute per token resembles a 37B dense model.
- **Attention / dense parts:** data-parallel attention (each GPU handles its own sequences, with MLA keeping KV small) or TP=8 within a node.
- **Alternative:** TP=8 within each node + PP=2 across nodes, simpler, but each token traverses both nodes sequentially and MoE experts are duplicated within TP groups less efficiently.

**Bottlenecks:**
1. **All-to-all across nodes** every MoE layer: InfiniBand bandwidth/latency; mitigate with node-limited routing (experts for a token restricted to few nodes), overlapping communication with compute, and large batches.
2. **Expert load imbalance:** hot experts overload GPUs; use redundant replicas of hot experts and periodic rebalancing (EPLB-style).
3. **KV cache:** MLA's compressed latent KV is small (~70 KB/token in the DeepSeek-V3 design versus MBs for MHA at this size), enabling large batches.
4. **Prefill vs decode:** prefill benefits from large EP batches; decode prefers low latency, so disaggregating prefill and decode clusters (as DeepSeek does) helps at scale.

**Validation:** benchmark goodput with real prompt/output distributions; monitor per-expert token counts and all-to-all time per layer.`,
      followUps: [
        { q: 'Why does MoE decode need large batches to be efficient?', a: 'Each expert only sees the tokens routed to it; with small batches, experts process tiny matrices and are memory-bound on their weights, so you need many concurrent tokens to give each expert enough work.' },
        { q: 'What is node-limited routing?', a: 'A routing constraint that each token\'s selected experts live on at most M nodes, bounding cross-node all-to-all traffic per token.' },
      ],
      pitfalls: [
        'Sizing memory by active instead of total parameters.',
        'Using cross-node tensor parallelism.',
        'Ignoring expert load imbalance.',
      ],
    },
    {
      id: 'inference-optimization-iq-5',
      difficulty: 'hard',
      question: 'When would you adopt disaggregated prefill/decode serving, and how would you size the two pools?',
      whatInterviewerLooksFor: [
        'Recognises prefill/decode interference symptoms',
        'Separate SLOs: TTFT for prefill, ITL for decode',
        'KV transfer cost and network requirements',
        'Sizing from token arrival rates and per-pool throughput',
      ],
      modelAnswer: `**Adopt when** co-located serving shows interference: ITL p99 spikes whenever long prompts arrive, chunked prefill tuning no longer helps, and traffic has long prompts with streaming outputs (RAG, document chat, agents with big contexts). At small scale or short prompts, chunked prefill on unified servers is simpler.

**How it works:** prefill workers compute the prompt's KV cache (compute-bound), transfer it via NVLink/RDMA to a decode worker, which streams tokens (bandwidth-bound). Each pool can use different batch sizes, parallelism and even GPU types.

**Sizing example:**
- Traffic: 50 req/s, 6k-token prompts, 400-token outputs.
- Prefill demand: 50 × 6k = 300k prompt tokens/s. If one H100 prefills ~40k tokens/s for this model at the TTFT SLO → ~8 GPUs, plus headroom → 10.
- Decode demand: 50 × 400 = 20k output tokens/s. If one H100 sustains ~5k tokens/s within the ITL SLO at the needed batch → 4 GPUs, plus headroom → 5.
- KV transfer: per request 6k tokens × KV/token (e.g. 128 KiB for an 8B GQA model ≈ 0.8 GB) × 50 req/s ≈ 40 GB/s aggregate, which requires RDMA-class networking.

**Operate:** autoscale each pool on its own signal (prefill queue / TTFT vs decode KV usage / ITL), use prefix caching in the prefill pool, and keep a fallback to unified mode.`,
      followUps: [
        { q: 'Why can the pools use different GPU types?', a: 'Prefill wants FLOPs (compute-dense GPUs), decode wants memory bandwidth and capacity (high-HBM GPUs), so mixing hardware can lower cost per token.' },
        { q: 'What happens if KV transfer is slow?', a: 'It adds directly to TTFT and can bottleneck throughput; mitigate with RDMA/NVLink, FP8 KV to halve bytes, and layer-wise pipelined transfer that starts before prefill finishes.' },
      ],
      pitfalls: [
        'Adopting disaggregation without measured interference.',
        'Ignoring KV-transfer bandwidth.',
        'Sizing both pools from a single throughput number.',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'inference-optimization-est-1',
      question: 'How much GPU memory does Llama-3-70B need to serve 64 concurrent users at 8k context each, and how many H100 80 GB GPUs is that?',
      assumptions: [
        '70.6B params; FP8 weights (1 byte/param)',
        '80 layers, 8 KV heads, head_dim 128',
        'Worst case: all 64 sequences at full 8,192 tokens',
        '~5 GB per GPU for activations, CUDA graphs and fragmentation; 90% of HBM usable',
      ],
      steps: [
        { label: 'Weights', calc: '70.6e9 × 1 B ≈ 70.6 GB' },
        { label: 'KV per token (fp16)', calc: '80 × 2 × 8 × 128 × 2 B = 327,680 B (320 KiB)' },
        { label: 'Total tokens', calc: '64 × 8,192 = 524,288 tokens' },
        { label: 'KV fp16', calc: '524,288 × 327,680 B ≈ 171.8 GB; FP8 KV ≈ 85.9 GB' },
        { label: 'Total (FP8 KV)', calc: '70.6 + 85.9 ≈ 156.5 GB + overhead' },
        { label: 'GPUs', calc: '2 GPUs give 2 × 72 − 10 = 134 GB usable → too small; 4 GPUs (TP=4) give 288 − 20 = 268 GB → fits with headroom' },
      ],
      answer: '~157 GB with FP8 KV (~242 GB with fp16 KV) → 4 × H100 with TP=4; 2 GPUs only work with fewer users (~45 at 8k) or shorter contexts.',
      insight: 'At realistic concurrency the KV cache exceeds the weights. Context length and concurrency limits are capacity decisions as important as model choice, and FP8 KV is often the cheapest way to double capacity.',
      followUps: [
        { q: 'With paged allocation, average conversation length is 3k tokens. Recompute capacity on 2 GPUs.', a: 'Usable KV ≈ 134 − 70.6 ≈ 63 GB; at FP8 (160 KiB/token) that is ~385k tokens ≈ 128 average 3k-token sequences, so 2 GPUs suffice if admission control prevents everyone hitting 8k at once.' },
      ],
    },
    {
      id: 'inference-optimization-est-2',
      question: 'Estimate batch-1 decode speed for Llama-3-70B in FP8 with TP=2 on H100s, and the batch size at which decode would become compute-bound.',
      assumptions: [
        'H100 SXM: 3.35 TB/s HBM, ~1,979 TFLOPS dense FP8 per GPU',
        'Weights split evenly across 2 GPUs (35.3 GB each); ignore KV reads at batch 1 and all-reduce costs initially',
        '~2 FLOPs per parameter per token',
        'Real kernels achieve ~70% of the bandwidth roofline',
      ],
      steps: [
        { label: 'Bytes per GPU per step', calc: '70.6 GB / 2 = 35.3 GB' },
        { label: 'Memory-bound step time', calc: '35.3e9 / 3.35e12 ≈ 10.5 ms → ≤ 95 tok/s; at 70% efficiency ≈ 15 ms → ~67 tok/s' },
        { label: 'Compute per token per GPU', calc: '2 × 70.6e9 / 2 = 70.6 GFLOP' },
        { label: 'Compute time at batch B', calc: 'B × 70.6e9 / 1.979e15 ≈ B × 35.7 µs' },
        { label: 'Crossover', calc: '10.5 ms / 35.7 µs ≈ 295 sequences (before counting KV reads, which push it higher)' },
      ],
      answer: 'About 65–95 tokens/s for a single user, and decode stays memory-bound until roughly 300 concurrent sequences (more once KV reads are included).',
      insight: 'Even a 70B model on top hardware is far from compute-bound at realistic batch sizes. Bandwidth (TP degree, quantisation, KV size) is the latency lever, and speculative decoding is attractive precisely because idle FLOPs are abundant.',
      followUps: [
        { q: 'What does TP=4 change for batch-1 speed?', a: 'Weights per GPU halve to ~17.7 GB, so the bandwidth floor drops to ~5.3 ms (≤ ~190 tok/s), though all-reduce latency over NVLink eats part of the gain; realistic ~120–140 tok/s.' },
      ],
    },
  ],
  test: [
    {
      id: 'inference-optimization-mcq-01',
      difficulty: 'medium',
      question: 'Profiling a chat service shows TTFT growing with prompt length while per-user tokens/s stays flat. Which explanations of the two inference phases fit this profile? Select ALL that apply.',
      options: [
        'Prefill processes all prompt tokens in parallel and is usually compute-bound',
        'Decode produces one token per sequence per step and is usually memory-bandwidth-bound at small batch',
        'TTFT is dominated by decode speed',
        'Long prompts increase prefill time roughly linearly (plus a quadratic attention term)',
      ],
      correct: [0, 1, 3],
      explanation: 'Prefill is parallel and FLOP-heavy; decode is sequential and bandwidth-heavy; prefill cost grows with prompt length (linear matmuls plus quadratic attention). TTFT is dominated by queueing and prefill, not decode.',
      followUps: [
        { q: 'Which metric does decode speed determine?', a: 'Inter-token latency (ITL/TPOT) and therefore streaming speed and total generation time for long outputs.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-02',
      difficulty: 'medium',
      question: 'What is the fp16 KV-cache size per token for a model with 40 layers, 8 KV heads and head_dim 128?',
      options: ['160 KiB', '80 KiB', '640 KiB', '20 KiB'],
      correct: [0],
      explanation: '40 × 2 (K and V) × 8 × 128 × 2 bytes = 163,840 B = 160 KiB. 80 KiB forgets the factor 2 for K and V (or uses FP8), 640 KiB assumes 32 KV heads, and 20 KiB corresponds to a single KV head (MQA).',
      followUps: [
        { q: 'How much for a 32k-token conversation?', a: '160 KiB × 32,768 = 5 GiB in fp16, or 2.5 GiB with an FP8 KV cache.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-03',
      difficulty: 'hard',
      question: 'What does this roofline estimate print, and what does it imply?',
      code: {
        language: 'python',
        code: `bw = 3.35e12            # bytes/s (H100)
weights = 8.03e9 * 2    # bf16 8B model
kv = 64 * 4096 * 131072 # 64 seqs x 4k tokens x 128 KiB
print(round(64 / ((weights + kv) / bw)))`,
      },
      options: [
        '≈ 4,250 tokens/s total; at this batch and context the KV reads (~34 GB) exceed the weight reads (~16 GB)',
        '≈ 13,300 tokens/s total; KV reads are negligible',
        '≈ 209 tokens/s total; batching does not help decode',
        '≈ 72 tokens/s total; the GPU is compute-bound',
      ],
      correct: [0],
      explanation: 'KV = 64 × 4,096 × 131,072 ≈ 34.4 GB; with 16.1 GB of weights each step reads ~50.4 GB → ~15 ms → 64 / 0.01505 ≈ 4,250 tokens/s. 13,300 ignores KV; 209 is batch-1 per-sequence speed; the step is memory-bound, not compute-bound.',
      followUps: [
        { q: 'Which single change most improves this?', a: 'An FP8 KV cache, halving the 34 GB of KV reads to ~17 GB, which cuts step time by about a third; FP8 weights would save only 8 GB.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-04',
      difficulty: 'hard',
      question: 'Which practices increase prefix-cache reuse for an LLM API serving many users? Select ALL that apply.',
      options: [
        'Put the system prompt and tool definitions first, in a fixed order',
        'Insert the current timestamp at the top of the system prompt',
        'Route a conversation\'s turns to the same replica',
        'Append new turns to the existing message history instead of rewriting earlier turns',
      ],
      correct: [0, 2, 3],
      explanation: 'Caching matches exact token prefixes per replica: stable leading content, affinity routing and append-only histories all preserve matches. A timestamp at the top changes the first tokens on every request and defeats caching.',
      followUps: [
        { q: 'Where should a timestamp go if the model needs it?', a: 'Near the end of the prompt (e.g. in the latest user turn or a trailing context block), after the cacheable shared prefix.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-05',
      difficulty: 'hard',
      question: 'With speculative decoding, acceptance rate α = 0.8, γ = 4 and drafter cost c = 0.1 of a target step, what is the approximate speedup?',
      options: ['≈ 2.4×', '≈ 3.4×', '≈ 5.0×', '≈ 1.2×'],
      correct: [0],
      explanation: 'Expected tokens per pass = (1 − 0.8⁵)/(1 − 0.8) = 3.36; cost per pass = 1 + 4 × 0.1 = 1.4; speedup ≈ 3.36/1.4 ≈ 2.4×. 3.4× ignores drafter cost, 5.0× assumes all drafts plus bonus are always accepted, and 1.2× is the per-pass cost factor, not the speedup.',
      followUps: [
        { q: 'What γ maximises speedup here?', a: 'γ = 2…8 gives about 2.0, 2.3, 2.4, 2.46, 2.47, 2.45 and 2.40×, so the optimum is γ ≈ 5–6 but the curve is flat from 4 to 8; past that, extra drafts are mostly rejected.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-06',
      difficulty: 'hard',
      question: 'Which statements about speculative decoding are true? Select ALL that apply.',
      options: [
        'With correct rejection sampling, outputs follow exactly the target model\'s distribution',
        'Each target verification pass emits at least one token',
        'It reduces the total FLOPs needed per generated token',
        'Its benefit typically shrinks as batch size grows and decode becomes compute-bound',
      ],
      correct: [0, 1, 3],
      explanation: 'Speculative sampling is distribution-preserving, always yields at least the correction token, and helps most when the GPU has idle compute (small batch). It usually increases total FLOPs (draft work and rejected positions); it reduces wall-clock latency by using idle compute during memory-bound steps.',
      followUps: [
        { q: 'Which drafter needs no extra model weights at all?', a: 'N-gram / prompt-lookup decoding, which proposes continuations by matching recent tokens against spans in the prompt or prior output.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-07',
      difficulty: 'hard',
      question: 'Why is this generation loop slow and memory-hungry?',
      code: {
        language: 'python',
        code: `ids = prompt_ids
for _ in range(500):
    logits = model(ids).logits          # no past_key_values, autograd on
    ids = torch.cat([ids, logits[:, -1:].argmax(-1)], dim=1)`,
      },
      options: [
        'It recomputes keys/values for the entire sequence at every step (quadratic total work) and builds autograd graphs that retain activations',
        'argmax is slower than sampling',
        'torch.cat is the main bottleneck',
        'The model cannot generate more than 256 tokens',
      ],
      correct: [0],
      explanation: 'Without the KV cache, every step re-runs the full forward pass over a growing sequence, and without inference_mode/no_grad the activations for backward are stored, inflating memory. argmax and cat are minor costs, and there is no 256-token limit.',
      followUps: [
        { q: 'How much less work does the cached version do for 500 tokens after a 1,000-token prompt?', a: 'Uncached processes about 1,000 + … + 1,500 ≈ 625k token-positions; cached processes 1,000 + 500 = 1,500, roughly 400× fewer layer evaluations (attention over the cache still grows linearly).' },
      ],
    },
    {
      id: 'inference-optimization-mcq-08',
      difficulty: 'medium',
      question: 'Which parallelism strategy is the best fit for each scenario? Select ALL correct pairings.',
      options: [
        '70B model on one 8-GPU NVLink node for low latency → tensor parallelism',
        '405B model spanning two nodes over InfiniBand → tensor parallelism inside nodes, pipeline parallelism across nodes',
        'Large MoE with hundreds of experts → expert parallelism for the MoE layers',
        'Scaling an 8B model that fits on one GPU to 10× traffic → pipeline parallelism across 10 GPUs',
      ],
      correct: [0, 1, 2],
      explanation: 'TP inside NVLink, PP across slower links and EP for experts are the standard mappings. A model that already fits on one GPU should scale out with independent replicas (data parallelism); pipelining it across 10 GPUs adds latency and bubbles for no benefit.',
      followUps: [
        { q: 'When might a small model still use TP=2?', a: 'When a strict latency SLO needs more memory bandwidth per token than one GPU provides, or the KV cache for long contexts does not fit on one GPU.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-09',
      difficulty: 'hard',
      question: 'Streaming users see ITL spikes of 500+ ms whenever someone submits a 40k-token document, on a co-located vLLM deployment. Which fixes address the cause? Select ALL that apply.',
      options: [
        'Enable chunked prefill with a per-step token budget so the long prefill is interleaved with decode steps',
        'Route very long prompts to a separate pool, or adopt disaggregated prefill/decode',
        'Increase max_tokens for all requests',
        'Lower temperature to speed up sampling',
      ],
      correct: [0, 1],
      explanation: 'The spikes come from a long, compute-heavy prefill monopolising GPU steps. Chunking it or isolating prefill (separate pool or disaggregation) prevents decode stalls. Output length limits and sampling temperature do not affect prefill interference.',
      followUps: [
        { q: 'What is the trade-off of a smaller chunked-prefill budget?', a: 'Decode stays smooth but the long request\'s TTFT increases because its prefill is spread over more steps; tune the budget against both SLOs.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-10',
      difficulty: 'expert',
      question: 'Your capacity calculator for a GQA model returns 4× too few concurrent sequences. Which bug explains it?',
      code: {
        language: 'python',
        code: `def kv_per_token(cfg, dtype_bytes=2):
    return cfg["num_hidden_layers"] * 2 * cfg["num_attention_heads"] \\
        * (cfg["hidden_size"] // cfg["num_attention_heads"]) * dtype_bytes
# cfg: 32 layers, 32 attention heads, 8 key_value heads, hidden 4096`,
      },
      options: [
        'It uses num_attention_heads instead of num_key_value_heads, overstating KV by 32/8 = 4×',
        'It should not multiply by 2 for K and V',
        'head_dim should be hidden_size × num_attention_heads',
        'dtype_bytes should be 4 for fp16',
      ],
      correct: [0],
      explanation: 'Only KV heads are cached. Using 32 query heads instead of 8 KV heads inflates the per-token KV size from 128 KiB to 512 KiB, so capacity looks 4× smaller. The factor 2 (K and V) is correct, head_dim = hidden/heads is correct, and fp16 is 2 bytes.',
      followUps: [
        { q: 'Which config field also matters for some newer models?', a: 'An explicit head_dim field (it can differ from hidden_size / num_attention_heads), and for MLA models the compressed latent dimension rather than KV heads.' },
      ],
    },
    {
      id: 'inference-optimization-mcq-11',
      difficulty: 'expert',
      question: 'A design doc proposes one GPU fleet for prompt processing and another for token streaming, exchanging KV over RDMA. Which claims in the doc hold? Select ALL that apply.',
      options: [
        'The KV cache produced by prefill must be transferred to the decode worker, which needs high-bandwidth interconnect',
        'Prefill and decode pools can be scaled and even use different GPU types independently',
        'It eliminates the need for KV-cache memory on decode workers',
        'It mainly helps when long prompts interfere with ongoing token streaming',
      ],
      correct: [0, 1, 3],
      explanation: 'Disaggregation moves KV from prefill to decode workers (RDMA/NVLink), lets each pool be sized for its own SLO and hardware, and targets prefill/decode interference. Decode workers still hold the KV cache for every active sequence; that is where it is read each step.',
      followUps: [
        { q: 'Name one production framework supporting it.', a: 'NVIDIA Dynamo, and the prefill/decode disaggregation modes in vLLM and SGLang (often with NIXL or similar KV-transfer libraries).' },
      ],
    },
    {
      id: 'inference-optimization-mcq-12',
      difficulty: 'expert',
      question: 'Across a TP=8 group, a team measures that NVLink all-reduces take 1 ms of a 12 ms decode step. They propose TP=16 across two nodes over InfiniBand to halve latency. What is the most likely outcome?',
      options: [
        'Latency gets worse: per-GPU weight reads halve (~5.5 ms saved at best) but all-reduces over ~50 GB/s links with per-message latency add more than that',
        'Latency halves exactly because bandwidth doubles',
        'No change because TP does not affect decode',
        'Throughput doubles with no latency impact',
      ],
      correct: [0],
      explanation: 'Doubling TP halves each GPU\'s weight bytes, but cross-node all-reduces are ~10× slower per byte plus latency per collective, two per layer. The communication penalty typically exceeds the bandwidth gain, which is why TP stays within a node and PP/EP are used across nodes. TP clearly affects decode, and throughput does not double for free.',
      followUps: [
        { q: 'What would you do instead to cut latency?', a: 'Speculative decoding, FP8/INT4 weights to reduce bytes, FP8 KV, or a smaller/faster model for latency-critical routes; keep TP within the NVLink domain.' },
      ],
    },
  ],
};

export default topic;
