import type { Topic } from '../../types';

const topic: Topic = {
  id: 'open-source-local-llms',
  phase: 'models',
  order: 3,
  title: 'Open-Weights and Local LLMs, Quantization',
  subtitle: 'Pick an open model you can legally ship, run it on your own hardware, and shrink it to fit',
  estimatedMinutes: 44,
  sources: [
    'Meta — Llama 3.x / Llama 4 Community License Agreement (700M MAU clause, attribution, AUP)',
    'Qwen team — Qwen3 model cards and Apache 2.0 licence (Hugging Face)',
    'DeepSeek-AI — DeepSeek-V3 / R1 model cards (MIT licence, 671B total / 37B active)',
    'OpenAI — gpt-oss-120b / gpt-oss-20b model card (Apache 2.0, MoE)',
    'Open Source Initiative — Open Source AI Definition 1.0 (2024)',
    'Ollama docs — OpenAI compatibility, Modelfile, environment variables (OLLAMA_CONTEXT_LENGTH, OLLAMA_KEEP_ALIVE)',
    'llama.cpp — README, llama-server, llama-quantize and GGUF k-quant types',
    'LM Studio docs — local server (OpenAI-compatible, port 1234)',
    'Frantar et al. 2022 — GPTQ (arXiv:2210.17323); Lin et al. 2023 — AWQ (arXiv:2306.00978)',
    'Micikevicius et al. 2022 — FP8 Formats for Deep Learning (arXiv:2209.05433)',
    'Open-weight LLM comparison round-ups, 2026 (wavect.io, llmgateway.io): licence landscape check',
  ],
  tags: ['open-weights', 'llama', 'qwen', 'mistral', 'gemma', 'deepseek', 'ollama', 'llama.cpp', 'gguf', 'gptq', 'awq', 'fp8', 'quantization'],
  cheatSheet: [
    '"Open-weights" ≠ "open source": most models ship weights under custom licences without training data; OSI\'s Open Source AI Definition requires much more.',
    'Licence quick map: Qwen (most sizes), Mistral small/open models, gpt-oss → Apache 2.0; DeepSeek V3/R1 → MIT; Llama → community licence (700M MAU cap, attribution, AUP); Gemma → Google terms (check each release).',
    'Weight memory = params × bits / 8: 8B at bf16 = 16 GB, Q8 ≈ 8.5 GB, Q4_K_M ≈ 4.9 GB; 70B at Q4_K_M ≈ 42 GB.',
    'Total memory = weights + KV cache (grows with context × concurrent users) + 1–2 GB runtime overhead.',
    'MoE models need memory for ALL experts (e.g. 109B total) but compute only for the active ones (17B): fast, but not small.',
    'Ollama: localhost:11434, OpenAI-compatible at /v1; set num_ctx or OLLAMA_CONTEXT_LENGTH because the default context is small.',
    'llama.cpp: llama-server -m model.gguf -ngl 99 -c 8192 → OpenAI-compatible on :8080; LM Studio serves on :1234/v1.',
    'Quant formats: GGUF k-quants (CPU/Apple/consumer GPU), GPTQ & AWQ (4-bit GPU serving, calibration data), FP8 (H100/Ada/Blackwell, near lossless), NF4 (bitsandbytes, training).',
    'Rules of thumb: 8-bit ≈ lossless; 4-bit (Q4_K_M/AWQ) loses ~1–3% on benchmarks; below ~3.5 bits quality drops fast, worst on math/code; bigger model at 4-bit usually beats smaller model at 16-bit.',
    'Always re-run your own eval after quantising; benchmark averages hide task-specific regressions.',
  ],
  sections: [
    {
      heading: 'Open-Source LLMs — open-weights families, licences and how to choose',
      body: `**Intuition:** an open-weights model is like buying a car instead of taking taxis: you own the running costs, can modify it and can park it anywhere (on-prem, air-gapped), but you also maintain it, and the licence still tells you where you may drive.

**Open-weights vs open-source.** Most "open" LLMs publish weights and inference code but not the training data or full recipe, under custom licences. The OSI's Open Source AI Definition (2024) also requires data information and training code; few releases (e.g. OLMo) meet it. The licence text is what binds you.

| Family | Shapes | Licence (verify per release) |
|---|---|---|
| Llama (Meta) | dense 1B–405B; Llama 4 MoE (Scout 109B/17B active) | Llama Community Licence: commercial OK, >700M MAU needs a separate licence, "Built with Llama" attribution, acceptable-use policy |
| Qwen (Alibaba) | dense 0.6B–32B, MoE (e.g. 30B-A3B, 235B-A22B) | Apache 2.0 for most; some flagships custom |
| Mistral | Small/Mixtral/Large | Apache 2.0 for open models; some under research licences |
| Gemma (Google) | 1B–27B, multimodal | Gemma Terms of Use for earlier generations; check newer releases |
| DeepSeek | V3/R1 671B MoE (37B active), distilled small models | MIT |
| gpt-oss (OpenAI) | 120B and 20B MoE | Apache 2.0 |

**How to choose:** (1) filter by licence and data-residency needs; (2) filter by hardware: memory = params × bytes (MoE needs *all* experts in memory); (3) shortlist 2–3 candidates by public leaderboards for your task type (coding, multilingual, tool use); (4) decide with **your own eval set** at the quantisation you will actually run.

**When to use open weights:** data cannot leave your network, you need fine-tuning or full control of versions, very high volume makes per-token API pricing expensive, or you need offline/edge deployment.`,
      example: `A European bank needs an on-prem assistant for 3,000 employees, no data to third parties, budget: 2 × H100 80 GB. Candidates: Llama-4-Scout (109B MoE, 17B active), Qwen3-32B (dense, Apache 2.0), gpt-oss-120b (MoE, Apache 2.0).
- Memory at FP8: Scout ≈ 109 GB, Qwen3-32B ≈ 32 GB, gpt-oss-120b ≈ 65 GB (ships MXFP4 for its MoE weights).
- Licence: legal flags Llama's acceptable-use policy and EU multimodal restrictions as extra review; Apache 2.0 options pass immediately.
- Own eval (400 internal Q&A with RAG): Qwen3-32B 84%, gpt-oss-120b 87%, Scout 85%.
Decision: gpt-oss-120b on one H100 per replica (two replicas for HA), Qwen3-32B as the fallback model.`,
      diagram: `   requirements --> [licence filter] --> [hardware fit] --> [shortlist 2-3]
                         |                   |                   |
             Apache/MIT/custom?    params x bytes + KV     leaderboards for
             MAU caps, AUP, EU     MoE: ALL experts!       task type
                                                             |
                                                             v
                                 [your eval, at the quant you'll serve]
                                                             |
                                                             v
                                       pick + pin exact revision (sha)`,
      code: [
        {
          language: 'python',
          title: 'Pull licence and parameter count from the Hugging Face Hub before you download 100 GB',
          code: `from huggingface_hub import HfApi

api = HfApi()
CANDIDATES = ["Qwen/Qwen3-32B", "openai/gpt-oss-120b", "meta-llama/Llama-3.1-8B-Instruct"]
ALLOWED = {"apache-2.0", "mit"}            # licences legal pre-approved
BYTES = {"bf16": 2, "fp8": 1, "q4": 0.6}   # ~4.85 bits/param for Q4_K_M

for repo in CANDIDATES:
    info = api.model_info(repo)              # gated repos need HF_TOKEN
    lic = (info.card_data or {}).get("license", "unknown")
    params = info.safetensors.total if info.safetensors else None
    status = "OK" if lic in ALLOWED else "LEGAL REVIEW"
    print(f"{repo:40s} licence={lic:12s} {status}")
    if params:
        mem = {k: round(params * b / 1e9, 1) for k, b in BYTES.items()}
        print(f"   params={params / 1e9:.1f}B  weights GB {mem}")
    print(f"   revision to pin: {info.sha}")`,
        },
      ],
      prosCons: {
        pros: [
          'Full control: data stays in your network, versions are pinned, nothing is deprecated under you.',
          'Fine-tunable and quantisable to fit your hardware and task.',
          'At high, steady volume the per-token cost can be far below API pricing.',
        ],
        cons: [
          { con: 'Licences vary and some carry usage caps, attribution or acceptable-use terms.', fix: 'Keep a licence registry per model revision, prefer Apache 2.0/MIT for products, and route custom licences through legal review before use.' },
          { con: 'Frontier closed models are often still ahead on the hardest reasoning tasks.', fix: 'Use a router: open model for the bulk of traffic, closed API for the hard tail, decided by eval data.' },
          { con: 'You own serving, scaling, patching and safety filtering.', fix: 'Use a standard serving stack (vLLM/SGLang) behind an LLM gateway, and add guardrail models (e.g. Llama Guard, ShieldGemma) in the pipeline.' },
          { con: 'Fast release cadence makes choices stale within months.', fix: 'Automate evaluation so a new candidate can be scored on your eval set in a day, and pin exact revisions in config.' },
        ],
      },
      keyPoints: [
        'Open-weights ≠ OSI open source; read the licence.',
        'MoE: memory for total params, speed of active params.',
        'Decide with your own eval at the serving quantisation.',
        'Pin the exact model revision (commit sha).',
      ],
      exercise: {
        prompt: `Write \`licence_gate(model, product)\` that returns \`"approved"\`, \`"review"\` or \`"blocked"\`.

Rules: Apache-2.0 / MIT → approved. \`llama*\` licences → review, but **blocked** if \`product["mau"] > 700_000_000\`. Any licence containing "research" or "non-commercial" → blocked when \`product["commercial"]\` is true, else review. Unknown → review.

Acceptance: (apache-2.0, commercial) → approved; (llama3.1, 900M MAU) → blocked; (mistral-research, commercial) → blocked; (gemma, commercial) → review.`,
        starter: {
          language: 'python',
          code: `def licence_gate(model: dict, product: dict) -> str:
    lic = model.get("license", "unknown").lower()
    # TODO: permissive licences
    # TODO: llama family with MAU cap
    # TODO: research / non-commercial
    # TODO: default
    ...`,
        },
        hints: [
          'Check permissive licences first with a set lookup.',
          'Use lic.startswith("llama") for the Llama family.',
          'Fall through to "review" for anything you do not recognise.',
        ],
        solution: {
          language: 'python',
          code: `PERMISSIVE = {"apache-2.0", "mit", "bsd-3-clause"}

def licence_gate(model: dict, product: dict) -> str:
    lic = model.get("license", "unknown").lower()
    if lic in PERMISSIVE:
        return "approved"
    if lic.startswith("llama"):
        return "blocked" if product.get("mau", 0) > 700_000_000 else "review"
    if "research" in lic or "non-commercial" in lic or "nc" in lic.split("-"):
        return "blocked" if product.get("commercial", True) else "review"
    return "review"

assert licence_gate({"license": "apache-2.0"}, {"commercial": True}) == "approved"
assert licence_gate({"license": "llama3.1"}, {"mau": 900_000_000}) == "blocked"
assert licence_gate({"license": "mistral-research"}, {"commercial": True}) == "blocked"
assert licence_gate({"license": "gemma"}, {"commercial": True}) == "review"`,
        },
        explanation: 'An automated gate in CI stops a developer from swapping in a model whose licence was never reviewed. It is deliberately conservative: anything unrecognised goes to a human rather than being approved.',
      },
      quickCheck: {
        question: 'A MoE model has 109B total parameters and 17B active per token. At FP8, roughly how much GPU memory do its weights need?',
        options: ['About 17 GB', 'About 109 GB', 'About 55 GB', 'About 8.5 GB'],
        correct: 1,
        explanation: 'Every expert must be resident because any token may route to any expert, so memory follows total parameters: 109B × 1 byte ≈ 109 GB. Active parameters determine compute per token (speed), not memory.',
      },
      source: 'Meta Llama Community License; Qwen3, DeepSeek-V3, gpt-oss model cards; OSI Open Source AI Definition 1.0',
    },
    {
      heading: 'Local LLM Deployment — Ollama, llama.cpp and LM Studio',
      body: `**Intuition:** local runtimes are "Docker for models": one command downloads a quantised model and exposes an API on localhost that your existing OpenAI-SDK code can call by changing the base URL.

| Tool | Best for | API | Notes |
|---|---|---|---|
| **Ollama** | developers, simple servers | \`:11434\`, native + OpenAI-compatible \`/v1\` | pulls GGUF models, Modelfile for params/system prompt, keeps models warm (\`OLLAMA_KEEP_ALIVE\`) |
| **llama.cpp** (\`llama-server\`) | max control, edge, CI | \`:8080\`, OpenAI-compatible | the engine under many tools; flags for GPU offload (\`-ngl\`), context (\`-c\`), parallel slots (\`-np\`) |
| **LM Studio** | desktop GUI, trying models | \`:1234/v1\` | GGUF and MLX (Apple) backends |
| vLLM / SGLang | multi-user GPU servers | OpenAI-compatible | covered in Model Serving |

**Mechanics that bite:**
- **Context length:** Ollama's default context is only a few thousand tokens; longer prompts are silently truncated. Set \`num_ctx\` per request/Modelfile or \`OLLAMA_CONTEXT_LENGTH\`.
- **GPU offload:** if the model does not fit in VRAM, layers spill to CPU and speed drops 5–20×. \`ollama ps\` shows the CPU/GPU split; llama.cpp prints offloaded layers.
- **Apple Silicon:** unified memory lets a 64 GB Mac run 70B at 4-bit, but macOS only lets the GPU wire ~65–75% of RAM by default.
- **Concurrency:** llama.cpp/Ollama handle a few parallel requests; for dozens of concurrent users move to vLLM/SGLang.

**When to use it:** local development and offline prototyping, privacy-sensitive desktop tools, edge devices, CI tests against a real model, and small internal tools (< ~10 concurrent users).`,
      example: `A developer runs \`ollama pull qwen3:8b\` (Q4_K_M, ~5.2 GB) on a 16 GB laptop GPU. Their RAG app sends 6,500-token prompts but answers ignore the retrieved documents. \`ollama ps\` shows a 4,096-token context: the prompt was truncated from the front, dropping the documents. Setting \`num_ctx: 16384\` raises KV-cache memory by ~1.8 GB (Qwen3-8B: 36 layers × 2 × 8 KV heads × 128 × 2 B ≈ 144 KB/token × 12k extra tokens) and still fits fully on GPU; answer grounding goes from 41% to 88% on their 50-question smoke test. Generation speed: ~70 tokens/s on GPU vs ~9 tokens/s when an oversized 32B model partially offloaded to CPU.`,
      diagram: `   your app (openai SDK)            baseURL from env
        |                                   |
        v                                   v
  +-------------+   http://localhost:11434/v1   (Ollama)
  | OpenAI-     |   http://localhost:8080/v1    (llama-server)
  | compatible  |   http://localhost:1234/v1    (LM Studio)
  | client      |
  +------+------+
         v
  [runtime] --load GGUF--> VRAM layers (-ngl) | CPU layers (slow)
         |                        + KV cache (num_ctx x layers ...)
         v
   tokens streamed back (SSE)`,
      code: [
        {
          language: 'typescript',
          title: 'Same OpenAI SDK code against a local Ollama model (streaming, larger context)',
          code: `import OpenAI from 'openai';

// Point the SDK at a local OpenAI-compatible server; the key is ignored but required
const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1',
  apiKey: process.env.LLM_API_KEY ?? 'ollama',
  timeout: 60_000,
});
const MODEL = process.env.LLM_MODEL ?? 'qwen3:8b';

async function ask(question: string, context: string): Promise<string> {
  const stream = await client.chat.completions.create({
    model: MODEL,
    stream: true,
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'Answer only from the provided context.' },
      { role: 'user', content: 'Context:\\n' + context + '\\n\\nQuestion: ' + question },
    ],
    // Ollama-specific: raise the context window (otherwise long prompts are truncated)
    // @ts-expect-error extra body field passed through to Ollama
    options: { num_ctx: 16384 },
  });
  let out = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    out += delta;
    process.stdout.write(delta);
  }
  return out;
}

await ask('What is the refund window?', 'Refunds are accepted within 30 days of delivery.');`,
        },
        {
          language: 'bash',
          title: 'llama.cpp server equivalent',
          code: `# download a GGUF from Hugging Face and serve it with all layers on GPU
#   -ngl 99   offload all layers to GPU
#   -c 16384  total KV-cache size in tokens (shared by the parallel slots)
#   -np 4     4 parallel request slots
llama-server -hf Qwen/Qwen3-8B-GGUF:Q4_K_M -ngl 99 -c 16384 -np 4 --port 8080

# then point the app at it
LLM_BASE_URL=http://localhost:8080/v1 node app.js

# Ollama equivalent: wrap a local GGUF with a Modelfile that pins context
printf 'FROM ./qwen3-8b-Q4_K_M.gguf\\nPARAMETER num_ctx 16384\\n' > Modelfile
ollama create qwen3-8b-16k -f Modelfile
ollama run qwen3-8b-16k "hello"   # then: ollama ps  -> check 100% GPU`,
        },
      ],
      prosCons: {
        pros: [
          'Zero data egress and zero per-token cost; works offline.',
          'OpenAI-compatible endpoints mean switching is a base-URL change.',
          'Fast iteration: pull, run and compare models in minutes on a laptop.',
        ],
        cons: [
          { con: 'Small default context silently truncates long prompts.', fix: 'Set num_ctx / OLLAMA_CONTEXT_LENGTH or llama-server -c explicitly and log prompt token counts against it.' },
          { con: 'Partial CPU offload makes generation 5–20× slower.', fix: 'Pick a quant that fits fully in VRAM (check ollama ps), lower context, or use a smaller model.' },
          { con: 'Limited concurrency and batching versus datacenter servers.', fix: 'Use local runtimes for dev/edge; deploy vLLM or SGLang for multi-user production traffic.' },
          { con: 'Model tags drift (e.g. "latest" changes quantisation or version).', fix: 'Pin exact tags or GGUF file hashes in config and record them in eval reports.' },
        ],
      },
      keyPoints: [
        'Ollama :11434, llama-server :8080, LM Studio :1234, all with /v1.',
        'Always set the context length explicitly.',
        'Fully on GPU or it is slow: check the offload split.',
        'Local for dev/edge; vLLM/SGLang for many concurrent users.',
      ],
      exercise: {
        prompt: `Write a TypeScript function \`findLocalLLM()\` that probes Ollama (11434), llama-server (8080) and LM Studio (1234) by calling \`GET /v1/models\` with a **500 ms timeout** each, in parallel, and returns the first healthy \`{ baseURL, models }\` in the preference order Ollama → llama-server → LM Studio, or \`null\`.

Acceptance: a dead port does not delay the result by more than ~500 ms; preference order is respected even if a lower-priority server answers first.`,
        starter: {
          language: 'typescript',
          code: `const CANDIDATES = [
  'http://localhost:11434/v1',
  'http://localhost:8080/v1',
  'http://localhost:1234/v1',
];

export async function findLocalLLM(): Promise<{ baseURL: string; models: string[] } | null> {
  // TODO: probe all in parallel with AbortSignal.timeout(500)
  // TODO: return the first healthy one in CANDIDATES order
  return null;
}`,
        },
        hints: [
          'fetch(url, { signal: AbortSignal.timeout(500) }) aborts slow probes.',
          'Promise.allSettled keeps results in input order regardless of which finishes first.',
          'The /v1/models response has a data array of objects with an id field.',
        ],
        solution: {
          language: 'typescript',
          code: `const CANDIDATES = [
  'http://localhost:11434/v1',
  'http://localhost:8080/v1',
  'http://localhost:1234/v1',
];

async function probe(baseURL: string): Promise<string[]> {
  const res = await fetch(baseURL + '/models', { signal: AbortSignal.timeout(500) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((m) => m.id);
}

export async function findLocalLLM(): Promise<{ baseURL: string; models: string[] } | null> {
  const results = await Promise.allSettled(CANDIDATES.map(probe));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.length > 0) {
      return { baseURL: CANDIDATES[i], models: r.value };
    }
  }
  return null;
}

console.log(await findLocalLLM());`,
        },
        explanation: 'Probing in parallel bounds total latency by the slowest timeout (500 ms) rather than the sum. allSettled preserves input order, so preference is applied after all probes finish, and servers with no loaded models are treated as unhealthy.',
      },
      quickCheck: {
        question: 'A 32B Q4 model on a 16 GB GPU generates at 6 tokens/s while an 8B Q4 model runs at 70 tokens/s on the same machine. What is the most likely reason for the 32B model\'s slowness?',
        options: [
          '32B models need FP16 to run on GPUs',
          'The ~19 GB of weights do not fit in 16 GB VRAM, so some layers run on the CPU from system RAM',
          'Ollama limits large models to one CPU thread',
          'The 32B model has a larger vocabulary',
        ],
        correct: 1,
        explanation: 'A 32B model at ~4.85 bits/param needs ~19 GB plus KV cache, so the runtime offloads part of it to the CPU, where memory bandwidth is several times lower. The 4× parameter ratio alone would not explain a >10× slowdown.',
      },
      source: 'Ollama docs; llama.cpp README; LM Studio docs',
    },
    {
      heading: 'Quantization — GGUF, GPTQ, AWQ and FP8 with memory maths',
      body: `**Intuition:** quantisation is saving a photo as a high-quality JPEG: store each weight with fewer bits, accept a tiny loss in fidelity, and get a file 2–4× smaller that also loads and runs faster, because LLM decoding is limited by how fast weights stream from memory.

**Memory maths:** \`weights_GB ≈ params × bits_per_weight / 8 / 1e9\`, then add KV cache and ~1–2 GB overhead.

| Format | Bits/weight (eff.) | Where it runs | How |
|---|---|---|---|
| BF16 | 16 | everywhere | baseline |
| FP8 (E4M3) | 8 | H100/H200, Ada, Blackwell | per-tensor/channel scales; weights and activations; near lossless |
| GGUF Q8_0 | ~8.5 | llama.cpp/Ollama | block-wise int8 |
| GGUF Q5_K_M / Q4_K_M | ~5.7 / ~4.85 | CPU, Apple, consumer GPU | k-quants: super-blocks, mixed precision per tensor |
| GPTQ 4-bit | ~4.25 (group 128) | GPU servers (vLLM, TGI) | second-order (Hessian) error correction, calibration set |
| AWQ 4-bit | ~4.25 | GPU servers | scales salient channels found from activations before rounding |
| NF4 (bitsandbytes) | ~4.13 | training (QLoRA) | normal-quantile levels; slower for inference |

**Weight-only vs weight+activation:** 4-bit GGUF/GPTQ/AWQ quantise weights only (great for memory-bound decode). FP8 and W8A8 also quantise activations, speeding up compute-bound prefill on hardware with FP8/INT8 tensor cores.

**Quality guide:** 8-bit is essentially lossless; good 4-bit (Q4_K_M, AWQ, GPTQ with a representative calibration set) loses ~1–3% on typical benchmarks; ≤ 3 bits degrades sharply, especially math, code and long context. A larger model at 4-bit usually beats a smaller model at 16-bit with the same memory.

**When to use:** GGUF for local/edge; AWQ/GPTQ 4-bit when GPU memory or cost matters; FP8 by default on modern datacenter GPUs. Quantising the **KV cache** (FP8) doubles context capacity.`,
      example: `Llama-3.1-70B (70.6B params) on different budgets:
- BF16: 70.6e9 × 2 = **141 GB** → 2 × H100 80 GB.
- FP8: **71 GB** → 1 × H100 80 GB, leaving ~7 GB for KV cache (≈ 22k tokens at 320 KB/token in fp16, ~45k with FP8 KV).
- AWQ 4-bit (~4.25 bpw): 70.6e9 × 4.25 / 8 ≈ **37.5 GB** → 1 × 48 GB L40S with ~9 GB for KV.
- GGUF Q4_K_M (~4.85 bpw): ≈ **42.8 GB** → a 64 GB Mac with a 16k context.
- Q2_K (~2.6–3 bpw): ≈ 25 GB, but a team measured exact-match on their SQL eval falling from 81% (Q4_K_M) to 62%, so it was rejected.`,
      diagram: `  bf16 weights  [0.0213, -0.4410, 0.1022, ...]   16 bits each
        | group of 32-128 weights -> scale (and zero-point)
        v
  int4 codes    [  1,  -14,   3, ...]  + scale = 0.0315   ~4.25 bits each
        |
        v at inference: w ~= code x scale   (dequant in the matmul kernel)

  decode speed ~ memory bandwidth / bytes of weights read per token
      bf16 8B: 16 GB/token-step | 4-bit 8B: ~4.5 GB -> up to ~3x faster`,
      code: [
        {
          language: 'python',
          title: 'Memory planner: which quantisation fits, with KV cache included',
          code: `QUANTS = {             # effective bits per weight
    "bf16": 16, "fp8": 8, "q8_0": 8.5, "q5_k_m": 5.7,
    "q4_k_m": 4.85, "awq_int4": 4.25, "q3_k_m": 3.9,
}

def kv_bytes_per_token(layers, kv_heads, head_dim, kv_bits=16):
    return layers * 2 * kv_heads * head_dim * kv_bits / 8   # K and V

def plan(params_b, layers, kv_heads, head_dim, ctx, users, vram_gb,
         overhead_gb=1.5, kv_bits=16):
    kv_gb = kv_bytes_per_token(layers, kv_heads, head_dim, kv_bits) * ctx * users / 1e9
    rows = []
    for name, bits in QUANTS.items():
        w_gb = params_b * 1e9 * bits / 8 / 1e9
        total = w_gb + kv_gb + overhead_gb
        rows.append((name, round(w_gb, 1), round(kv_gb, 1), round(total, 1), total <= vram_gb))
    return rows

# Llama-3.1-70B: 80 layers, 8 KV heads, head_dim 128; 8k ctx x 4 users on a 48 GB GPU
for r in plan(70.6, 80, 8, 128, ctx=8192, users=4, vram_gb=48):
    print("{:9s} weights {:6.1f} GB  kv {:5.1f} GB  total {:6.1f} GB  fits={}".format(*r))
# awq_int4: weights 37.5 + kv 10.7 + 1.5 = 49.7 GB -> just misses; FP8 KV (kv_bits=8) fixes it`,
        },
        {
          language: 'bash',
          title: 'Make GGUF quants from a (fine-tuned) HF checkpoint with llama.cpp',
          code: `python convert_hf_to_gguf.py ./my-merged-model --outtype bf16 --outfile model-bf16.gguf
# optional importance matrix from representative text improves low-bit quants
llama-imatrix -m model-bf16.gguf -f calib.txt -o imatrix.dat
llama-quantize --imatrix imatrix.dat model-bf16.gguf model-Q4_K_M.gguf Q4_K_M
llama-perplexity -m model-Q4_K_M.gguf -f wiki.test.raw   # compare with the bf16 baseline
llama-perplexity -m model-bf16.gguf -f wiki.test.raw

# also build a higher-precision variant for quality-sensitive users
llama-quantize --imatrix imatrix.dat model-bf16.gguf model-Q5_K_M.gguf Q5_K_M
ls -lh model-*.gguf      # expect ~4.9 GB (Q4_K_M) and ~5.7 GB (Q5_K_M) for an 8B model`,
        },
      ],
      prosCons: {
        pros: [
          '2–4× less memory: bigger models or longer contexts on the same hardware.',
          'Faster decode because fewer bytes stream from memory per token.',
          'Mature tooling for every target: GGUF (local), AWQ/GPTQ (GPU servers), FP8 (H100-class).',
        ],
        cons: [
          { con: 'Quality loss grows sharply below ~4 bits, especially on math, code and long context.', fix: 'Stay at Q4_K_M/AWQ or higher for production, use an importance matrix or calibration set from your domain, and gate on your own eval.' },
          { con: 'Calibration-based methods (GPTQ/AWQ) can overfit to the calibration data.', fix: 'Calibrate on a few hundred samples representative of production traffic (including your languages and formats).' },
          { con: 'Weight-only 4-bit does not speed up compute-bound prefill and may slow large batches.', fix: 'Use FP8 (W8A8) on H100-class GPUs for high-throughput serving; reserve 4-bit for memory-bound, low-batch setups.' },
          { con: 'Format/kernel lock-in: GGUF for llama.cpp, AWQ/GPTQ for GPU servers.', fix: 'Keep the bf16 master checkpoint and generate each target format in CI, evaluating each one.' },
        ],
      },
      keyPoints: [
        'GB ≈ params(B) × bits / 8; add KV cache and overhead.',
        '8-bit ≈ lossless, 4-bit ≈ −1–3%, < 3.5 bits risky.',
        'GGUF for local, AWQ/GPTQ for GPU 4-bit, FP8 on H100-class.',
        'Quantise the KV cache too when context is the bottleneck.',
      ],
      exercise: {
        prompt: `Write \`best_quant(params_b, vram_gb, kv_gb, min_bits=4.0)\` that returns the **highest-precision** quant from \`QUANTS\` whose weights + \`kv_gb\` + 1.5 GB overhead fit in \`vram_gb\`, never going below \`min_bits\`. Return \`None\` if nothing fits.

Acceptance: (8.0, 24, 2) → "bf16"; (32.8, 24, 2) → "q4_k_m"; (70.6, 24, 2) → None.`,
        hints: [
          'Sort QUANTS by bits descending and return the first one that fits.',
          'Skip any quant whose bits are below min_bits.',
          'Weights in GB = params_b × bits / 8.',
        ],
        solution: {
          language: 'python',
          code: `QUANTS = {"bf16": 16, "fp8": 8, "q8_0": 8.5, "q5_k_m": 5.7,
          "q4_k_m": 4.85, "awq_int4": 4.25, "q3_k_m": 3.9}

def best_quant(params_b, vram_gb, kv_gb, min_bits=4.0, overhead_gb=1.5):
    for name, bits in sorted(QUANTS.items(), key=lambda kv: -kv[1]):
        if bits < min_bits:
            continue
        if params_b * bits / 8 + kv_gb + overhead_gb <= vram_gb:
            return name
    return None

assert best_quant(8.0, 24, 2) == "bf16"        # 16 + 2 + 1.5 = 19.5
assert best_quant(32.8, 24, 2) == "q4_k_m"     # 19.9 + 3.5 = 23.4
assert best_quant(70.6, 24, 2) is None`,
        },
        explanation: 'Choosing the highest precision that fits uses spare memory for quality rather than leaving it idle, while the min_bits floor encodes the quality cliff below ~4 bits. In production you would also leave headroom for KV cache growth under concurrency.',
      },
      quickCheck: {
        question: 'You have one 80 GB H100 and must serve a 70B model to many concurrent users with high throughput. Which quantisation is usually the best default?',
        options: [
          'GGUF Q4_K_M through llama.cpp',
          'FP8 weights (and optionally FP8 KV cache) in vLLM or SGLang',
          'NF4 via bitsandbytes',
          'Q2_K to maximise KV-cache space',
        ],
        correct: 1,
        explanation: 'FP8 is near lossless, fits 70B in ~71 GB, and uses H100 FP8 tensor cores for fast prefill and batched decode. llama.cpp is not built for high-concurrency datacenter batching, NF4 inference kernels are slow, and Q2_K costs too much quality.',
      },
      source: 'Frantar et al. 2022 — GPTQ; Lin et al. 2023 — AWQ; llama.cpp quantization docs; Micikevicius et al. 2022 — FP8',
    },
  ],
  codeChallenges: [
    {
      id: 'open-source-local-llms-cc-1',
      title: 'Make a local-LLM client production-safe',
      context: 'An internal tool talks to Ollama on a shared GPU box. Users report truncated answers that ignore attached documents, occasional 2-minute hangs, and the tool breaking after someone ran "ollama pull" on the server.',
      task: 'Fix context truncation, add timeouts and retries, pin the model, and fail fast with a clear error if the prompt exceeds the configured context.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';

const client = new OpenAI({ baseURL: 'http://gpu-box:11434/v1', apiKey: 'x' });

export async function answer(question: string, docs: string[]) {
  const res = await client.chat.completions.create({
    model: 'llama3:latest',
    messages: [{ role: 'user', content: docs.join('\\n') + '\\n' + question }],
  });
  return res.choices[0].message.content;
}`,
      },
      hints: [
        'Ollama\'s default context is small: pass options.num_ctx and estimate prompt tokens before sending.',
        'The SDK supports timeout and maxRetries options; the "latest" tag can change underneath you.',
        'Put instructions in a system message and keep documents clearly delimited.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';

const MODEL = process.env.LLM_MODEL ?? 'llama3.1:8b-instruct-q4_K_M'; // pinned tag
const NUM_CTX = Number(process.env.LLM_NUM_CTX ?? 16384);
const MAX_OUTPUT = 1024;

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL ?? 'http://gpu-box:11434/v1',
  apiKey: process.env.LLM_API_KEY ?? 'ollama',
  timeout: 45_000,        // fail instead of hanging for minutes
  maxRetries: 2,          // retries 408/429/5xx/connection errors with backoff
});

const approxTokens = (s: string) => Math.ceil(s.length / 4); // ~4 chars per token

export async function answer(question: string, docs: string[]): Promise<string> {
  const context = docs.map((d, i) => '<doc id="' + (i + 1) + '">\\n' + d + '\\n</doc>').join('\\n');
  const system = 'Answer using only the documents. Cite doc ids. Say "not found" if absent.';
  const promptTokens = approxTokens(system + context + question);
  if (promptTokens + MAX_OUTPUT > NUM_CTX) {
    throw new Error('Prompt ~' + promptTokens + ' tokens exceeds context ' + NUM_CTX + '; retrieve fewer docs');
  }
  const res = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: context + '\\n\\nQuestion: ' + question },
    ],
    // @ts-expect-error Ollama-specific option passed through
    options: { num_ctx: NUM_CTX },
  });
  return res.choices[0]?.message?.content ?? '';
}`,
      },
      explanation: `Ollama truncated prompts beyond its small default context, dropping documents; \`num_ctx\` plus a pre-flight token estimate fixes truncation and surfaces oversize prompts as explicit errors. Timeouts and bounded retries replace silent 2-minute hangs. Pinning an exact tag (model + quant) stops an \`ollama pull\` of "latest" from changing behaviour, and the system message plus delimited documents improve grounding.`,
      followUps: [
        { q: 'How would you get an exact token count instead of chars/4?', a: 'Use the model\'s tokenizer (e.g. via @huggingface/transformers AutoTokenizer in Node, or Ollama\'s response prompt_eval_count from a dry run) and apply the chat template overhead.' },
        { q: 'Twenty users now share this box and latency spikes. What next?', a: 'Raise OLLAMA_NUM_PARALLEL only as far as KV memory allows, or move to vLLM/SGLang with continuous batching and PagedAttention, which handle dozens of concurrent requests far better.' },
      ],
    },
    {
      id: 'open-source-local-llms-cc-2',
      title: 'Fix a quantise-and-ship pipeline that ships a broken model',
      context: 'A CI job converts a fine-tuned model to GGUF and AWQ for two deployment targets. Last release, the AWQ build answered in the wrong language for Japanese users and nobody noticed until support tickets arrived.',
      task: 'Rewrite the pipeline so calibration data is representative, each artefact is evaluated against the bf16 baseline, and the release is blocked on regressions.',
      starter: {
        language: 'python',
        code: `from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

model = AutoAWQForCausalLM.from_pretrained("out/merged")
tok = AutoTokenizer.from_pretrained("out/merged")
model.quantize(tok, quant_config={"w_bit": 4, "q_group_size": 128,
                                  "zero_point": True, "version": "GEMM"})
model.save_quantized("out/awq")
print("done")`,
      },
      hints: [
        'Without calib_data the library uses a default English dataset; pass samples from your own traffic mix.',
        'Run the same task eval on bf16 and on each quantised artefact, per language/segment.',
        'Fail the job (non-zero exit) if any segment drops more than a tolerance.',
      ],
      solution: {
        language: 'python',
        code: `import json, random, sys
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer
from evals import run_eval   # your harness: returns {segment: score}

SRC, OUT, TOL = "out/merged", "out/awq", 0.02   # max 2-point drop per segment

# 1) calibration: ~512 samples matching production mix (languages, formats)
rows = [json.loads(l) for l in open("data/prod_sample.jsonl")]
random.Random(0).shuffle(rows)
tok = AutoTokenizer.from_pretrained(SRC)
calib = [tok.apply_chat_template(r["messages"], tokenize=False) for r in rows[:512]]

model = AutoAWQForCausalLM.from_pretrained(SRC)
model.quantize(tok, quant_config={"w_bit": 4, "q_group_size": 128,
                                  "zero_point": True, "version": "GEMM"},
               calib_data=calib)
model.save_quantized(OUT)
tok.save_pretrained(OUT)

# 2) evaluate baseline vs quantised on the same segmented eval set
base = run_eval(SRC, "data/eval.jsonl")    # e.g. {"en": 0.86, "ja": 0.81, ...}
quant = run_eval(OUT, "data/eval.jsonl")
report = {seg: round(quant[seg] - base[seg], 3) for seg in base}
print(json.dumps(report, indent=2))

# 3) gate the release
bad = {s: d for s, d in report.items() if d < -TOL}
if bad:
    print("Quantisation regression:", bad)
    sys.exit(1)`,
      },
      explanation: `AWQ chooses which channels to protect from activation statistics; calibrating only on generic English text under-protected channels important for Japanese, causing the language regression. Calibrating on a representative production sample, evaluating every artefact per segment against the bf16 baseline, and failing CI on a per-segment drop catches this class of bug before release.`,
      followUps: [
        { q: 'Why evaluate per segment instead of the overall average?', a: 'A small segment (e.g. 5% Japanese traffic) can collapse while the average moves by under a point; per-segment thresholds expose regressions that matter to specific users.' },
        { q: 'What would you do if AWQ keeps regressing on Japanese?', a: 'Try GPTQ or a higher bit-width (8-bit/FP8) for that deployment, increase group granularity (group size 64), or serve Japanese traffic from a less aggressively quantised replica.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'open-source-local-llms-iq-1',
      difficulty: 'hard',
      question: 'Legal asks: "Can we use model X in our product?" Walk through how you evaluate an open-weights model\'s licence and supply chain before adoption.',
      whatInterviewerLooksFor: [
        'Distinguishes open-weights licences from OSI open source',
        'Checks commercial use, user caps, attribution, AUP, output-use clauses',
        'Considers derivative/fine-tune and distillation rights',
        'Supply-chain hygiene: revision pinning, safetensors, provenance',
      ],
      modelAnswer: `**1. Identify the exact artefact.** Repo + commit sha + file format. Licences can differ between sizes or versions of the same family.

**2. Read the licence for these clauses:**
- **Commercial use** allowed? (Apache 2.0/MIT: yes; research licences: no.)
- **Scale caps:** e.g. Llama's community licence requires a separate licence above 700M monthly active users.
- **Attribution / naming:** e.g. "Built with Llama" display and naming derivatives with the base name.
- **Acceptable-use policy** incorporated by reference (prohibited uses you must enforce downstream).
- **Derivatives and outputs:** may we fine-tune, redistribute fine-tunes, use outputs to train other models?
- **Geographic or modality restrictions** (e.g. EU restrictions on some multimodal releases).

**3. Supply chain.** Prefer \`safetensors\` over pickle checkpoints (no code execution on load); avoid \`trust_remote_code\` unless reviewed; verify the publisher org; mirror the weights internally and pin the sha.

**4. Data and safety.** Review the model card for training-data disclosures, known limitations and safety evals; plan guardrails accordingly.

**5. Record it.** A model registry entry: licence, obligations, approval date, owner, revision. CI gate blocks unregistered models.

Bottom line: Apache 2.0/MIT models are usually quick approvals; custom licences need legal sign-off with the specific obligations translated into engineering controls.`,
      followUps: [
        { q: 'Why does safetensors matter for security?', a: 'Pickle-based .bin checkpoints can execute arbitrary code when loaded; safetensors is a pure tensor format with no code execution, so loading untrusted weights is far safer.' },
        { q: 'We fine-tuned a Llama model. What obligations carry over?', a: 'The derivative remains under the Llama licence terms: attribution, AUP, the MAU threshold and redistribution conditions all apply to the fine-tuned weights.' },
      ],
      pitfalls: [
        'Equating "on Hugging Face" with "free to use commercially".',
        'Ignoring acceptable-use policies incorporated by reference.',
        'Not pinning the revision that legal approved.',
      ],
    },
    {
      id: 'open-source-local-llms-iq-2',
      difficulty: 'hard',
      question: 'Your team wants everyone to develop against a local model on their laptops (mix of 16 GB MacBooks and 32 GB Linux laptops with 8 GB GPUs) while production uses a hosted frontier model. Design the setup and its risks.',
      whatInterviewerLooksFor: [
        'OpenAI-compatible abstraction with base URL / model from config',
        'Right-sized model and quant per hardware class',
        'Awareness of behaviour gaps between local and prod models',
        'Eval and CI strategy against the production model',
      ],
      modelAnswer: `**Abstraction.** All code uses one OpenAI-compatible client; \`LLM_BASE_URL\`, \`LLM_MODEL\` and \`LLM_NUM_CTX\` come from env. Locally: Ollama (\`:11434/v1\`); prod: provider or gateway URL.

**Model per hardware class:**
- 16 GB Mac (unified memory, ~10–11 GB usable by GPU): 7–8B at Q4_K_M (~5 GB) with 16k context.
- 8 GB GPU laptops: 4B-class at Q4_K_M or 8B with partial offload (slow); prefer the smaller model for responsiveness.
A \`make llm\` script pulls pinned tags and sets context via a Modelfile.

**Risks and mitigations:**
- **Behaviour gap:** local 8B follows instructions and tool schemas less reliably than the prod model, so prompts tuned locally may be over-engineered, or bugs appear only in prod. Mitigate with a shared eval suite run against the **production** model in CI on every PR touching prompts.
- **Feature gaps:** structured outputs, tool calling and streaming formats differ across runtimes. Wrap them behind adapters; test both paths.
- **Context truncation** locally (set num_ctx).
- **Data:** local is great for privacy; ensure test fixtures, not real customer data, are used.

**Bonus:** use the same local model in CI for fast, free smoke tests (does the pipeline run end-to-end?), and the prod model for quality gates.`,
      followUps: [
        { q: 'A developer\'s prompt works locally but the prod model ignores one instruction. How do you handle it?', a: 'Treat the prod eval as the source of truth: add the failing case to the eval suite, iterate the prompt against the prod model, and keep the local model only for functional development.' },
        { q: 'How do you keep JSON/tool calling consistent across runtimes?', a: 'Use JSON schema validation (zod) on every response with a repair/retry loop, and prefer runtimes that support grammar-constrained decoding (llama.cpp GBNF/JSON schema, Ollama format) locally.' },
      ],
      pitfalls: [
        'Hard-coding localhost URLs and model names.',
        'Tuning prompts only on the local model.',
        'Forgetting Mac GPU memory limits and context defaults.',
      ],
    },
    {
      id: 'open-source-local-llms-iq-3',
      difficulty: 'expert',
      question: 'Explain why 4-bit weight-only quantisation can make single-user decoding ~3× faster but gives little benefit (or a slowdown) in a high-batch serving scenario.',
      whatInterviewerLooksFor: [
        'Memory-bandwidth-bound decode at batch 1',
        'Arithmetic intensity grows with batch size',
        'Dequantisation overhead in compute-bound regime',
        'FP8/W8A8 as the compute-side answer',
      ],
      modelAnswer: `**Batch 1 decode is memory-bound.** Each generated token requires reading every weight once and doing ~2 FLOPs per weight. An 8B model in bf16 reads 16 GB per step; on a GPU with 1 TB/s bandwidth that caps at ~60 tokens/s, while compute sits mostly idle. 4-bit weights shrink the read to ~4.5 GB → up to ~3.5× faster, minus dequantisation overhead.

**Large batches become compute-bound.** With batch B, the same weight read serves B tokens, so arithmetic intensity rises ~B×. Past the GPU's ridge point (hundreds of FLOPs per byte on H100), throughput is limited by tensor-core FLOPs, not bandwidth. Weight-only 4-bit kernels must **dequantise to bf16** before the matmul; that extra work and less-optimised kernels can make them slower than bf16 at high batch and during long prefill.

**What helps at high batch:**
- **FP8 (W8A8)** on H100-class GPUs: both weights and activations in FP8 use FP8 tensor cores (~2× bf16 FLOPs), speeding the compute-bound regime while halving memory.
- Mixed-input kernels (e.g. Marlin for 4-bit) narrow the gap.
- 4-bit still helps indirectly by freeing memory for a larger KV cache → larger batches.

**Rule of thumb:** latency-sensitive, low-concurrency → 4-bit weight-only; throughput-oriented datacenter serving → FP8, measure both with your traffic.`,
      followUps: [
        { q: 'Roughly where is the H100 ridge point?', a: 'About 989 TFLOPS bf16 / 3.35 TB/s ≈ 295 FLOPs per byte; decode at batch 1 is ~1 FLOP/byte (bf16), so it needs batches of hundreds to become compute-bound.' },
        { q: 'Does quantising the KV cache help the same way?', a: 'Yes for long contexts: attention in decode reads the whole KV cache per token, so FP8 KV halves that traffic and doubles capacity, helping both latency and max batch size.' },
      ],
      pitfalls: [
        'Assuming fewer bits always means faster.',
        'Ignoring dequantisation cost.',
        'Confusing memory savings with compute savings.',
      ],
    },
    {
      id: 'open-source-local-llms-iq-4',
      difficulty: 'hard',
      question: 'A customer insists on running your assistant fully air-gapped on a single 48 GB GPU. Choose the model size, quantisation and context, and explain the trade-offs.',
      whatInterviewerLooksFor: [
        'Memory budget split between weights and KV cache',
        'Quality vs size trade-off with eval evidence',
        'Concurrency expectations',
        'Air-gap logistics: mirroring, updates, licence',
      ],
      modelAnswer: `**Budget:** 48 GB = weights + KV cache (context × concurrent users) + ~2 GB runtime.

**Candidates:**
| Option | Weights | KV room | Notes |
|---|---|---|---|
| ~30B dense at FP8 | ~32 GB | ~14 GB | near-lossless, good quality |
| ~30B at AWQ 4-bit | ~17 GB | ~29 GB | more users / longer context, −1–2 pts |
| 70B at AWQ 4-bit | ~37.5 GB | ~8.5 GB | best quality but ~3 users × 8k only |
| MoE ~30B total / 3B active at FP8 | ~31 GB | ~15 GB | very fast decode |

**Decision process:** run our eval (with RAG) on each at the actual quant. If 70B-AWQ beats 30B-FP8 by < 2 points, choose 30B for concurrency headroom. For a 20-user deployment with 8k contexts (Qwen-like 32B: ~256 KB/token fp16 → 2 GB per 8k user), 20 users ≈ 40 GB of KV at peak, which forces 4-bit weights + FP8 KV cache, or limiting concurrent sessions.

**Air-gap logistics:** mirror weights (safetensors + sha256), tokenizer, runtime containers and the eval suite onto the customer's registry; no telemetry; a documented offline update bundle per release; licence must permit on-prem redistribution (Apache 2.0/MIT easiest).

**Ops:** vLLM with a request queue and max concurrency, health checks, and a smaller fallback model if the GPU fails.`,
      followUps: [
        { q: 'They later want 128k-token document analysis. What changes?', a: 'KV for one 128k request on a 32B GQA model is ~32 GB in fp16, so you need FP8 KV, 4-bit weights, a single concurrent long request, or chunked map-reduce summarisation instead of one huge context.' },
        { q: 'How do you ship model updates into the air gap?', a: 'Signed release bundles containing weights, hashes, container images and an eval report; the customer runs the bundled eval offline before switching traffic.' },
      ],
      pitfalls: [
        'Filling all memory with weights and leaving no KV cache.',
        'Ignoring concurrency requirements.',
        'Forgetting runtime images and tokenizer in the air-gapped bundle.',
      ],
    },
    {
      id: 'open-source-local-llms-iq-5',
      difficulty: 'expert',
      question: 'Compare GPTQ, AWQ, GGUF k-quants and FP8. If you had to support laptops, a GPU inference cluster and an H100 fleet from one fine-tuned checkpoint, what would you produce and how would you validate it?',
      whatInterviewerLooksFor: [
        'Correct mechanism for each method',
        'Matches formats to runtimes and hardware',
        'Single bf16 master with derived artefacts',
        'Per-artefact evaluation and release gating',
      ],
      modelAnswer: `**Mechanisms:**
- **GPTQ:** layer-wise post-training quantisation that uses second-order (Hessian) information from a calibration set to update remaining weights and compensate rounding error; 4-bit with group size 128.
- **AWQ:** observes activations to find the ~1% salient weight channels, scales them up before quantisation (and inverse-scales activations) so they lose less precision; no back-propagation, robust, fast kernels.
- **GGUF k-quants:** llama.cpp's container + block quantisation with super-blocks and per-tensor mixed bit-widths (Q4_K_M keeps sensitive tensors at higher precision); optional importance matrix; runs on CPU, Metal, CUDA, Vulkan.
- **FP8 (E4M3):** 8-bit floating point with scales; weights and activations; hardware-accelerated on H100/Ada/Blackwell; near lossless.

**Artefacts from one bf16 master:**
- Laptops: GGUF Q4_K_M and Q5_K_M (imatrix from domain text).
- GPU cluster (A10/L4/A100 without FP8): AWQ 4-bit (or GPTQ) served by vLLM.
- H100 fleet: FP8 weights + FP8 KV cache.

**Validation:** CI builds each artefact, runs the same segmented eval (task accuracy, JSON validity, languages, long-context probes) plus perplexity on a held-out domain set, and compares against bf16 with per-segment tolerances (e.g. FP8 ≤ 0.5 pt drop, 4-bit ≤ 2 pts). Latency/throughput benchmarks per target. Release only artefacts that pass; record hashes in the model registry.`,
      followUps: [
        { q: 'Which one would you pick if calibration data is unavailable?', a: 'FP8 (dynamic or simple per-channel scaling needs little or no calibration) or round-to-nearest GGUF k-quants without an imatrix; GPTQ and AWQ both rely on calibration samples.' },
        { q: 'Why not quantise the 4-bit GGUF from the AWQ artefact?', a: 'Re-quantising an already quantised model compounds rounding error; always derive each format from the bf16 master.' },
      ],
      pitfalls: [
        'Re-quantising from a quantised artefact.',
        'Using one eval average for all targets.',
        'Mixing up which runtimes load which format.',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'open-source-local-llms-est-1',
      question: 'Can a 64 GB Apple Silicon Mac run Llama-3.1-70B at Q4_K_M with a 32k-token context? If not, what is the largest context that fits?',
      assumptions: [
        '70.6B params at ~4.85 bits/weight (Q4_K_M)',
        'Llama-3.1-70B: 80 layers, 8 KV heads, head_dim 128; KV cache in fp16',
        'macOS lets the GPU use ~75% of unified memory by default (≈48 GB)',
        'Runtime overhead (compute buffers, OS headroom) ≈ 2 GB',
      ],
      steps: [
        { label: 'Weights', calc: '70.6e9 × 4.85 / 8 ≈ 42.8 GB' },
        { label: 'KV per token', calc: '80 × 2 × 8 × 128 × 2 B = 327,680 B ≈ 320 KB' },
        { label: 'KV at 32k', calc: '32,768 × 320 KB ≈ 10.7 GB' },
        { label: 'Total at 32k', calc: '42.8 + 10.7 + 2 ≈ 55.5 GB > 48 GB default limit' },
        { label: 'Max context', calc: '(48 − 42.8 − 2) GB / 320 KB ≈ 3.2 GB / 0.32 MB ≈ 10,000 tokens (≈ 20k with q8_0 KV cache)' },
      ],
      answer: 'Not at 32k by default: ~55.5 GB needed vs ~48 GB GPU-wired limit. About 10k tokens fit with fp16 KV, ~20k with an 8-bit KV cache; 32k needs raising the wired-memory limit or a smaller quant.',
      insight: 'For big models on unified memory, the KV cache, not the weights, is what decides usable context. KV-cache quantisation or a slightly smaller weight quant buys more context than most people expect.',
      followUps: [
        { q: 'What generation speed would you expect?', a: 'Decode reads ~43 GB per token; at ~400 GB/s (M-series Max) that is ~9 tokens/s upper bound, realistically 6–8 tokens/s, so usable but slow for interactive chat.' },
      ],
    },
    {
      id: 'open-source-local-llms-est-2',
      question: 'Is self-hosting an open 8B model cheaper than an API for an internal tool processing 30M tokens/day (80% input, 20% output)?',
      assumptions: [
        'API: illustrative small-model price $0.15 / 1M input, $0.60 / 1M output',
        'Self-hosted: one L4 GPU instance at an illustrative $0.80/hour running 24/7, 8B AWQ in vLLM',
        'L4 sustains ~1,500 output tokens/s aggregate with batching; prefill is ~10× faster than decode per token',
        'Engineering/ops time for self-hosting ≈ 4 hours/month at $100/hour',
      ],
      steps: [
        { label: 'API input cost/day', calc: '24M × $0.15/M = $3.60' },
        { label: 'API output cost/day', calc: '6M × $0.60/M = $3.60' },
        { label: 'API monthly', calc: '($3.60 + $3.60) × 30 ≈ $216' },
        { label: 'GPU capacity check', calc: '6M output tokens / 1,500 tok/s = 4,000 s ≈ 1.1 h decode + 24M input / 15,000 tok/s ≈ 0.45 h → fits in one GPU-day easily' },
        { label: 'Self-hosted monthly', calc: '$0.80 × 24 × 30 = $576 + ops 4 h × $100 = $400 → ~$976' },
      ],
      answer: 'At 30M tokens/day the API (~$216/month) is ~4.5× cheaper than a dedicated always-on GPU (~$976/month including ops). Self-hosting only wins on cost above roughly 150–200M tokens/day for this price point.',
      insight: 'A single always-on GPU is mostly idle at this volume (under 2 busy hours per day). Self-host for privacy, control or very high, steady utilisation, not for small workloads; otherwise use APIs or scale-to-zero serverless GPUs.',
      followUps: [
        { q: 'Volume grows 10× to 300M tokens/day. Recompute.', a: 'API ≈ $2,160/month; the L4 needs ~16 busy hours/day (still one GPU, maybe two for headroom) ≈ $1,150–$1,750 including ops, so self-hosting starts to win, and privacy may tip it further.' },
      ],
    },
  ],
  test: [
    {
      id: 'open-source-local-llms-mcq-01',
      difficulty: 'medium',
      question: 'Which licence statements are accurate for commonly used open-weights families (verify per release)? Select ALL that apply.',
      options: [
        'DeepSeek-V3/R1 weights are released under the MIT licence',
        'The Llama community licence requires a separate licence from Meta for products above 700M monthly active users',
        'All Gemma and Llama releases are OSI-approved open source',
        'gpt-oss-120b is released under Apache 2.0',
      ],
      correct: [0, 1, 3],
      explanation: 'DeepSeek V3/R1 use MIT, gpt-oss uses Apache 2.0, and Llama\'s community licence has the 700M MAU clause. Llama and earlier Gemma releases use custom terms with use restrictions, so they are open-weights but not OSI-approved open source.',
      followUps: [
        { q: 'What makes Apache 2.0 attractive compared with MIT for companies?', a: 'Apache 2.0 includes an explicit patent grant and patent-retaliation clause, which reduces patent risk for adopters; MIT is permissive but silent on patents.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-02',
      difficulty: 'medium',
      question: 'Roughly how much memory do the weights of a 14B model need at GGUF Q4_K_M (~4.85 bits/weight)?',
      options: ['≈ 3.5 GB', '≈ 8.5 GB', '≈ 14 GB', '≈ 28 GB'],
      correct: [1],
      explanation: '14e9 × 4.85 / 8 ≈ 8.5 GB. 28 GB is bf16, 14 GB is 8-bit, and 3.5 GB would require ~2 bits per weight.',
      followUps: [
        { q: 'What else must you budget for before saying it fits on a 12 GB GPU?', a: 'The KV cache for your context length and parallel slots plus ~1 GB runtime overhead; at 8k context it fits, at 32k it may not.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-03',
      difficulty: 'hard',
      question: 'This RAG app returns answers that ignore retrieved documents only when more than ~6 documents are attached. What is the most likely cause?',
      code: {
        language: 'typescript',
        code: `const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' });
const res = await client.chat.completions.create({
  model: 'qwen3:8b',
  messages: [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: docs.join('\\n\\n') + '\\n\\nQ: ' + q },
  ],
});`,
      },
      options: [
        'Ollama\'s default context window is small, so long prompts are truncated and the earliest content (system prompt and first documents) is lost',
        'The OpenAI SDK limits messages to 8,000 characters',
        'qwen3:8b cannot read more than 6 documents by design',
        'Ollama ignores system messages on the /v1 endpoint',
      ],
      correct: [0],
      explanation: 'Without num_ctx (or OLLAMA_CONTEXT_LENGTH), Ollama uses a small default context and truncates longer prompts, dropping content. The SDK has no such character limit, the model has no document-count limit, and system messages are supported.',
      followUps: [
        { q: 'How can you detect truncation in logs?', a: 'Compare the prompt token count reported by the server (e.g. prompt_eval_count / usage.prompt_tokens) with your own estimate; a value pinned at the context size means truncation.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-04',
      difficulty: 'hard',
      question: 'Which statements about Mixture-of-Experts open models are correct? Select ALL that apply.',
      options: [
        'Memory requirements follow total parameters because all experts must be loaded',
        'Per-token compute follows active parameters, so decode can be much faster than a dense model of equal total size',
        'A 30B-total / 3B-active MoE fits on a GPU sized for a 3B dense model',
        'Expert parallelism can spread experts across GPUs in multi-GPU serving',
      ],
      correct: [0, 1, 3],
      explanation: 'MoE models need memory for all experts (total params) but compute only for the routed ones (active params); experts can be sharded across GPUs. A 30B-total model needs roughly 10× the memory of a 3B dense model, so it does not fit on the same small GPU.',
      followUps: [
        { q: 'Why are MoE models attractive for local Mac users?', a: 'Large unified memory holds all experts, while bandwidth-bound decode only reads active experts per token, giving big-model quality at small-model speed.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-05',
      difficulty: 'hard',
      question: 'What does this llama-server command do with the 16k context?',
      code: {
        language: 'bash',
        code: `llama-server -m qwen3-8b-Q4_K_M.gguf -ngl 99 -c 16384 -np 4 --port 8080`,
      },
      options: [
        'Each of the 4 parallel slots gets its own 16k context, so the KV cache holds 64k tokens',
        'The 16k-token KV budget is divided among (or shared by) the 4 slots, so four concurrent requests cannot each use 16k tokens',
        'Only one request runs at a time; -np sets the number of CPU threads',
        '-c sets the maximum output tokens per request',
      ],
      correct: [1],
      explanation: 'In llama-server, -c sizes the total KV cache and -np sets parallel slots that draw from it (classically ~4,096 tokens each; with a unified KV cache, dynamically shared). Either way four simultaneous 16k requests do not fit: you need -c 65536 and the memory for it. -np is slots, not threads, and -c is context, not output length.',
      followUps: [
        { q: 'What memory does -c 65536 need for Qwen3-8B KV in fp16?', a: 'About 144 KB per token × 65,536 ≈ 9.4 GB of KV cache on top of ~5 GB of weights, so ~15 GB in total.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-06',
      difficulty: 'hard',
      question: 'You have 24 GB of VRAM and need the best quality for a reasoning-heavy task. Which choice is usually best?',
      options: [
        '8B model at bf16 (~16 GB)',
        '32B model at Q4_K_M (~19.5 GB) with a modest context',
        '70B model at Q2_K (~24 GB) with no room for KV cache',
        '3B model at FP32 for maximum precision',
      ],
      correct: [1],
      explanation: 'A larger model at good 4-bit quality generally beats a smaller model at full precision for the same memory. 70B at ~2 bits degrades badly (especially for reasoning) and leaves no KV cache; FP32 on a 3B model wastes memory on precision that does not help.',
      followUps: [
        { q: 'How would you confirm this for your task?', a: 'Run your eval on the 8B bf16 and 32B Q4_K_M candidates with the same prompts and context, and compare accuracy plus latency, since benchmark averages may not reflect your task.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-07',
      difficulty: 'hard',
      question: 'Which statements correctly describe GPTQ and AWQ? Select ALL that apply.',
      options: [
        'GPTQ uses approximate second-order (Hessian) information to compensate rounding error layer by layer',
        'AWQ uses activation statistics to identify and protect salient weight channels via scaling',
        'Both require full fine-tuning on the calibration set',
        'Both typically use a small calibration dataset and group-wise 4-bit weights',
      ],
      correct: [0, 1, 3],
      explanation: 'GPTQ is Hessian-based error compensation; AWQ scales salient channels identified from activations; both are post-training methods using a few hundred calibration samples and group-wise 4-bit weights. Neither involves gradient-based fine-tuning.',
      followUps: [
        { q: 'Why can a bad calibration set hurt AWQ?', a: 'If calibration activations do not reflect production inputs (languages, formats), AWQ protects the wrong channels, and quality drops on the under-represented inputs.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-08',
      difficulty: 'medium',
      question: 'Why does a 4-bit quantised 8B model usually generate tokens faster than the bf16 version on a single-user laptop GPU?',
      options: [
        'Integer math is always faster than floating point',
        'Single-stream decode is memory-bandwidth bound, and 4-bit weights mean ~3.5× fewer bytes read per generated token',
        'Quantised models have fewer layers',
        'Quantisation shortens the prompt',
      ],
      correct: [1],
      explanation: 'At batch 1 every token requires streaming all weights from memory, so bytes moved dominate. 4-bit weights cut that traffic. The kernels actually dequantise to floating point for the matmul, layer count is unchanged and prompts are untouched.',
      followUps: [
        { q: 'Estimate the bf16 upper bound on a GPU with 500 GB/s.', a: '16 GB of weights per token → 500 / 16 ≈ 31 tokens/s; 4-bit (~4.5 GB) raises the bound to ~110 tokens/s.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-09',
      difficulty: 'hard',
      question: 'What risk does this loading code introduce?',
      code: {
        language: 'python',
        code: `model = AutoModelForCausalLM.from_pretrained(
    "random-user/super-llm-70b-uncensored",
    trust_remote_code=True,
)`,
      },
      options: [
        'It executes arbitrary Python from an unvetted repository at load time (and possibly pickle weights), a supply-chain risk',
        'It forces the model to load in fp32',
        'It disables the chat template',
        'trust_remote_code only affects the tokenizer and is harmless',
      ],
      correct: [0],
      explanation: 'trust_remote_code runs the repo\'s custom modelling code, and non-safetensors checkpoints can execute code when unpickled. With an unknown publisher this is a code-execution risk. It does not change dtype or templates, and it is not limited to tokenizers.',
      followUps: [
        { q: 'How do you mitigate if you really need custom code?', a: 'Review and vendor the code into your repo at a pinned revision, require safetensors weights, load in a sandboxed environment first, and mirror the artefacts internally.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-10',
      difficulty: 'expert',
      question: 'You quantise the KV cache from fp16 to FP8 in vLLM on a memory-limited GPU. What are the expected effects? Select ALL that apply.',
      options: [
        'Roughly double the tokens the KV cache can hold, enabling larger batches or longer contexts',
        'Lower attention memory traffic per decode step on long contexts',
        'A large drop in quality on most tasks because KV values cannot be represented in 8 bits',
        'Model weight memory halves as well',
      ],
      correct: [0, 1],
      explanation: 'FP8 KV halves bytes per cached token, doubling capacity and halving the KV read per decode step. Quality impact is usually small with proper scaling. Weights are a separate setting, so their memory is unchanged.',
      followUps: [
        { q: 'When would you avoid FP8 KV cache?', a: 'When your eval shows regressions on long-context retrieval or precise numeric tasks, or the hardware lacks efficient FP8 support; measure on needle-in-haystack style probes first.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-11',
      difficulty: 'expert',
      question: 'Which deployment targets and formats are correctly matched? Select ALL that apply.',
      options: [
        'MacBook via llama.cpp / Ollama → GGUF Q4_K_M',
        'H100 fleet in vLLM → FP8 weights',
        'A10G GPUs in vLLM needing 4-bit → AWQ or GPTQ',
        'QLoRA training on a 24 GB GPU → GGUF Q8_0 base',
      ],
      correct: [0, 1, 2],
      explanation: 'GGUF suits llama.cpp-based local runtimes; FP8 is native on H100; AWQ/GPTQ have optimised 4-bit GPU kernels on Ampere-class cards like the A10G, which lack FP8 tensor cores. QLoRA training uses a bitsandbytes NF4 base, not GGUF, which is an inference format.',
      followUps: [
        { q: 'Why not use FP8 on A10G?', a: 'Ampere GPUs lack FP8 tensor cores; FP8 weights can sometimes be stored but compute falls back to higher precision, losing the speed benefit.' },
      ],
    },
    {
      id: 'open-source-local-llms-mcq-12',
      difficulty: 'expert',
      question: 'After quantising your fine-tuned model to Q3_K_M, perplexity on WikiText rises only 4%, but your structured-extraction eval drops from 92% to 74% valid JSON. What is the best explanation and action?',
      options: [
        'Perplexity on generic text hides task-specific damage; low-bit errors compound in long exact-format outputs. Move to Q4_K_M/Q5_K_M with a domain imatrix and gate on the task eval',
        'The eval is broken because perplexity barely changed',
        'JSON validity is unrelated to quantisation; tune the temperature',
        'Re-quantise the Q3_K_M file to Q8_0 to recover quality',
      ],
      correct: [0],
      explanation: 'Generic perplexity averages over easy tokens; strict formats fail if any token is wrong, so small per-token degradation compounds. Use higher bits and domain calibration, and judge by the task eval. Re-quantising from a lossy file cannot restore lost information, and temperature does not fix systematic precision loss.',
      followUps: [
        { q: 'What runtime feature would also protect JSON validity?', a: 'Grammar- or schema-constrained decoding (llama.cpp GBNF / JSON schema, vLLM structured outputs), which forbids invalid tokens regardless of quantisation noise.' },
      ],
    },
  ],
};

export default topic;
