import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['bert-gpt-t5.md', 'managed-llm-platforms.md'],
  blocks: [
    {
      title: 'Decoding strategies',
      markdown: `| Strategy | What it does | Use when |
|---|---|---|
| Greedy (temperature ≈ 0) | take the most likely token each step | extraction, classification, code edits |
| Temperature | divide logits by T before softmax | raise for variety, lower for consistency |
| Top-k | sample only from the k most likely tokens | simple cap on tail tokens |
| Top-p (nucleus) | smallest set whose probabilities sum to p | adaptive cap; usual partner of temperature |
| Min-p | keep tokens with \`p ≥ min_p × p_max\` | open-weights runtimes that expose it |
| Beam search | keep the best few partial sequences | translation / summarisation with encoder-decoders, rarely chat |`,
    },
    {
      title: 'Where to get a model',
      markdown: `| Option | Use when | Watch out for |
|---|---|---|
| Provider API | fastest start, frontier quality | rate limits, data terms, vendor outages |
| Hyperscaler (Bedrock, Azure OpenAI, Vertex AI) | you need your cloud's IAM, private networking, compliance agreements, per-team cost tags | model catalogue differs per cloud |
| Inference platform for open models | open weights without running GPUs | cold starts on scale-to-zero |
| Self-host (llama.cpp / Ollama → vLLM / SGLang) | data residency, custom fine-tunes, steady high volume | you own uptime, scaling and upgrades |

- Dedicated / provisioned capacity only pays off at steady, high utilisation; idle reservations are still billed.
- Put product-critical calls behind one gateway so a second provider is a config change, not a rewrite.`,
    },
    {
      title: 'Glossary in one line each',
      markdown: `- **Logits**: raw scores per vocabulary token before softmax.
- **Prefill / decode**: reading the prompt in parallel / writing output one token at a time.
- **TTFT**: time to first token; what users feel as "it started".
- **Encoder-only / decoder-only**: understands text (embeddings, classifiers) / generates text (chat LLMs).
- **SFT → RLHF/DPO**: teach the format, then teach preferences.`,
    },
  ],
};

export default sheet;
