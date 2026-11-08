import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['inference-optimization.md', 'speculative-decoding.md', 'async-disaggregated-inference.md'],
  blocks: [
    {
      title: 'Pick the lever for the bottleneck',
      markdown: `| Symptom | Lever |
|---|---|
| Model does not fit | weight quantisation, tensor parallelism |
| KV cache limits batch size / context | GQA models, FP8 KV cache, PagedAttention, CPU offload |
| Slots idle while one long reply finishes | continuous batching |
| Streaming stalls when a long prompt arrives | chunked prefill, or disaggregated prefill/decode |
| Same system prompt re-prefilled per request | prefix caching + an identical prefix from token one |
| Prefix hits low with several replicas | cache-aware routing on the prefix hash, not round-robin |
| Batch-1 decode too slow | speculative decoding |`,
    },
    {
      title: 'Speculative decoding: draft types',
      markdown: `| Draft | Needs | Use when |
|---|---|---|
| Separate small model (same tokenizer) | nothing to train | quick prototype |
| Extra heads (Medusa) | fine-tuning the target | you can train on the target |
| Feature-level draft head (EAGLE family) | a trained draft head | production latency |
| Built-in multi-token prediction | trained into the base model | the model ships with it |

- Wall time per token ≈ \`(γ·c + 1) / E[accepted]\`, with \`c = cost(draft) / cost(target)\`.
- Acceptance rate α moves the speedup more than draft length γ.
- Skip it for very short outputs, high-temperature creative sampling, and very high concurrency (decode is already compute-bound).`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| No speedup after enabling spec decode | low α on real traffic | measure α first; domain draft or disable |
| Mean ITL down, p99 ITL up | rejected drafts cost extra passes | judge on p99, not mean |
| Wrong tokens after a rejection | KV entries past the accepted prefix kept | truncate cache to the accepted length |
| Disaggregated setup is slower | short prompts pay the KV transfer tax | keep short prompts colocated |
| Same long prompt re-prefilled | KV evicted under memory pressure | CPU / shared KV offload |`,
    },
  ],
};

export default sheet;
