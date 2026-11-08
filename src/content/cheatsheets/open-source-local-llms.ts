import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['quantization.md', 'edge-inference.md'],
  blocks: [
    {
      title: 'Pick a weight format',
      markdown: `| Where it runs | Format | Engine |
|---|---|---|
| CPU, Apple Silicon, laptop | GGUF \`Q4_K_M\` (or Q5/Q8 if memory allows) | llama.cpp, Ollama, LM Studio |
| NVIDIA/AMD GPU serving, routine chat | AWQ INT4 | vLLM, SGLang |
| GPU serving with many LoRA adapters | GPTQ INT4 | vLLM |
| Reasoning, maths, code on recent datacenter GPUs | FP8 | vLLM, SGLang, TensorRT-LLM |
| Fine-tuning on one GPU | NF4 base (QLoRA) | bitsandbytes / PEFT |
| Browser | MLC \`q4f16_1\` (not GGUF) | WebLLM |

Not sure? Run your own eval on each candidate format; don't trust the averages.`,
    },
    {
      title: 'Number formats',
      markdown: `| Format | Bits (sign/exp/mantissa) | Used for |
|---|---|---|
| BF16 | 1/8/7, FP32 range | default training and serving |
| FP16 | 1/5/10, max ≈ 65,504 | older GPUs; can overflow |
| FP8 E4M3 | 1/4/3 | inference weights and activations |
| FP8 E5M2 | 1/5/2 | training gradients (more range) |
| INT8 / INT4 | 256 / 16 levels + a scale | weight quantisation; INT4 needs GPTQ/AWQ calibration |

Sensitivity, low → high: weights → activations (outliers) → KV cache (errors compound) → attention logits (keep higher precision).`,
    },
    {
      title: 'Decode speed ceiling',
      markdown: `Decode reads every weight once per token, so: \`tok/s ceiling ≈ memory bandwidth / model bytes\`.

- 8B at Q4_K_M (≈4.9 GB) on a 100 GB/s laptop → ≈20 tok/s ceiling.
- Same model on a 3.35 TB/s datacenter GPU → hundreds of tok/s.
- Add KV cache to the bytes at long context; on phones keep context short.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Code / maths scores drop after 4-bit | generic calibration, or INT4 on a reasoning model | calibrate on in-domain data, or ship FP8 |
| Out of memory after quantising | KV cache and runtime not budgeted | weights + KV + overhead |
| GGUF slow on a GPU server | wrong engine for the format | GGUF → llama.cpp; GPU serving → AWQ/GPTQ/FP8 |
| Naive INT4 output is garbage | rounding error accumulates | GPTQ or AWQ with calibration data |
| First latency numbers too high | cold caches | warm up before measuring; report p50/p95 |`,
    },
  ],
};

export default sheet;
