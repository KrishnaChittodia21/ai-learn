// Pure, deterministic KV-cache model (no React, Node-testable).
// KV bytes per token = 2 (K and V) × n_layers × n_kv_heads × head_dim × bytes_per_value
//   (n_kv_heads < n_heads with grouped-query attention, GQA; fp16/bf16 = 2 bytes)
// Compute: a forward pass costs ≈ 2 × params FLOPs per token processed.
//   without cache, decode step t must re-run the model over all t tokens  → ≈ 2·P·t FLOPs
//   with cache, only the new token is processed (attention reads the t cached K/V rows) → ≈ 2·P FLOPs
// Prefix caching: requests that share a prompt prefix reuse its cached K/V blocks and skip that prefill.
import type { BaseFrame } from '../../core';

export type Preset = '1b' | '8b' | '70b';

export interface Params {
  preset: Preset;
  seqLen: number;
  cache: boolean;
}

export const DEFAULT_PARAMS: Params = { preset: '8b', seqLen: 32768, cache: true };
export const SEQ_LENS = [4096, 32768, 131072];
export const GPU_GB = 80;

export interface ModelCfg {
  label: string;
  params: number;
  layers: number;
  heads: number;
  kvHeads: number;
  headDim: number;
  bytes: number;
}

export const MODELS: Record<Preset, ModelCfg> = {
  '1b': { label: 'Llama-3.2-1B', params: 1.24e9, layers: 16, heads: 32, kvHeads: 8, headDim: 64, bytes: 2 },
  '8b': { label: 'Llama-3-8B', params: 8.0e9, layers: 32, heads: 32, kvHeads: 8, headDim: 128, bytes: 2 },
  '70b': { label: 'Llama-3-70B', params: 70.6e9, layers: 80, heads: 64, kvHeads: 8, headDim: 128, bytes: 2 },
};

export const kvBytesPerToken = (m: ModelCfg, kvHeads = m.kvHeads) => 2 * m.layers * kvHeads * m.headDim * m.bytes;

export const PROMPT = ['The', 'capital', 'of', 'France', 'is'];
export const GENERATED = ['Paris', '.', 'It', 'is', 'known', 'for', 'the', 'Eiffel'];

export function fmtBytes(b: number) {
  if (b >= 2 ** 30) return `${(b / 2 ** 30).toFixed(b >= 10 * 2 ** 30 ? 0 : 1)} GiB`;
  if (b >= 2 ** 20) return `${(b / 2 ** 20).toFixed(b >= 10 * 2 ** 20 ? 0 : 1)} MiB`;
  return `${(b / 2 ** 10).toFixed(0)} KiB`;
}
export function fmtFlops(x: number) {
  if (x >= 1e15) return `${(x / 1e15).toFixed(1)} PFLOP`;
  if (x >= 1e12) return `${(x / 1e12).toFixed(1)} TFLOP`;
  return `${(x / 1e9).toFixed(0)} GFLOP`;
}

export type Stage = 'intro' | 'prefill' | 'decode' | 'formula' | 'scale' | 'gqa' | 'prefix' | 'prefix-hit' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** tokens currently in the sequence */
  tokens: string[];
  /** indices of tokens whose K/V are (re)computed in this step */
  computed: number[];
  /** indices served from cache in this step */
  cached: number[];
  /** cache memory now (bytes) for this short demo sequence */
  cacheBytes: number;
  stepFlops: number;
  totalFlops: number;
  /** cumulative FLOPs of the other mode for comparison */
  otherTotal: number;
  /** long-context numbers (stages formula/scale/gqa) */
  longBytes: number | null;
  /** prefix-caching demo: shared/new token counts */
  prefix: { shared: number; fresh: number; reused: boolean } | null;
}

export function simulate({ preset, seqLen, cache }: Params): Frame[] {
  const m = MODELS[preset];
  const per = kvBytesPerToken(m);
  const f2p = 2 * m.params;
  const frames: Frame[] = [];
  let tokens = [...PROMPT];
  let total = 0;
  let other = 0;
  const base = () => ({ tokens: [...tokens], computed: [] as number[], cached: [] as number[], cacheBytes: cache ? tokens.length * per : 0, stepFlops: 0, totalFlops: total, otherTotal: other, longBytes: null, prefix: null });
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => frames.push({ ...base(), ...f } as Frame);
  const p = PROMPT.length;

  push({
    stage: 'intro',
    caption: `${m.label}: ${m.layers} layers, ${m.heads} query heads but only ${m.kvHeads} K/V heads (GQA), head_dim ${m.headDim}, fp16. Prompt "${PROMPT.join(' ')}" (${p} tokens). KV cache is ${cache ? 'ON' : 'OFF'}.`,
  });
  total = f2p * p;
  other = f2p * p;
  push({
    stage: 'prefill',
    computed: PROMPT.map((_, i) => i),
    stepFlops: f2p * p,
    caption: `Prefill: all ${p} prompt tokens go through the model in one parallel pass (≈ 2·P·${p} = ${fmtFlops(f2p * p)}). Every layer produces a K and V row per token${cache ? `; they are stored: ${p} × ${fmtBytes(per)} = ${fmtBytes(p * per)}.` : ', then thrown away.'}`,
    predict: `To generate the next token, does the model need the K and V of the earlier tokens again?`,
  });
  GENERATED.forEach((tok, s) => {
    const t = tokens.length; // tokens before this step
    tokens = [...tokens, tok];
    const step = cache ? f2p : f2p * (t + 1);
    const otherStep = cache ? f2p * (t + 1) : f2p;
    total += step;
    other += otherStep;
    const fr: Partial<Frame> & { stage: Stage; caption: string } = {
      stage: 'decode',
      computed: cache ? [t] : tokens.map((_, i) => i),
      cached: cache ? tokens.slice(0, t).map((_, i) => i) : [],
      stepFlops: step,
      caption: cache
        ? `Decode step ${s + 1} → "${tok}": only the new token runs through the model (${fmtFlops(step)}); its query attends over ${t} cached K/V rows plus its own. Cache now ${t + 1} × ${fmtBytes(per)} = ${fmtBytes((t + 1) * per)}.`
        : `Decode step ${s + 1} → "${tok}": no cache, so all ${t + 1} tokens are re-run to rebuild K and V (${fmtFlops(step)}, ${t + 1}× the cached cost). Total so far ${fmtFlops(total)} vs ${fmtFlops(other)} with a cache.`,
    };
    if (s === 2)
      fr.predict = cache
        ? `Cache memory grows by ${fmtBytes(per)} per token. How big will it be for one ${seqLen.toLocaleString('en-US')}-token conversation?`
        : `Each step re-processes the whole sequence. If you generate n tokens, how does total compute grow with n?`;
    push(fr);
  });
  const n = GENERATED.length;
  push({
    stage: 'formula',
    longBytes: per,
    caption: `KV size per token = 2 (K,V) × ${m.layers} layers × ${m.kvHeads} KV heads × ${m.headDim} head_dim × ${m.bytes} bytes = ${per.toLocaleString('en-US')} B = ${fmtBytes(per)}. ${cache ? `Over ${n} decode steps the cache saved ${fmtFlops(other - total)} of recompute.` : `Without the cache, prefill + ${n} decode steps cost ${fmtFlops(total)} instead of ${fmtFlops(other)}: quadratic vs linear.`}`,
  });
  const weights = m.params * m.bytes;
  const free = GPU_GB * 2 ** 30 - weights;
  const long = per * seqLen;
  const fits = free > 0 ? Math.floor(free / long) : 0;
  push({
    stage: 'scale',
    longBytes: long,
    caption: `At ${seqLen.toLocaleString('en-US')} tokens one sequence needs ${fmtBytes(long)} of KV cache. On an ${GPU_GB} GB GPU after ${fmtBytes(weights)} of fp16 weights, ${free > 0 ? `${fits} such sequence${fits === 1 ? '' : 's'} fit at once` : 'the weights alone do not fit (shard across GPUs)'}. KV memory, not FLOPs, usually caps the batch size.`,
  });
  const mha = kvBytesPerToken(m, m.heads);
  push({
    stage: 'gqa',
    longBytes: long,
    caption: `Without GQA (one K/V head per query head, ${m.heads}) it would be ${fmtBytes(mha)}/token, ${m.heads / m.kvHeads}× more: ${fmtBytes(mha * seqLen)} at ${seqLen.toLocaleString('en-US')} tokens. GQA, fp8 KV and paged allocation (vLLM PagedAttention) all attack this memory.`,
  });
  const shared = 1000;
  const fresh = 40;
  push({
    stage: 'prefix',
    longBytes: long,
    prefix: { shared, fresh, reused: false },
    caption: `Request 2 arrives with the same ${shared}-token system prompt plus a ${fresh}-token user question. Without prefix caching its prefill costs ${fmtFlops(f2p * (shared + fresh))}.`,
    predict: cache ? `The first ${shared} tokens are identical to request 1. What can the server skip?` : `KV cache is OFF. Can the server reuse anything from request 1?`,
  });
  push({
    stage: 'prefix-hit',
    longBytes: long,
    prefix: { shared, fresh, reused: cache },
    caption: cache
      ? `Prefix cache hit: K/V blocks for the ${shared} shared tokens are reused (keyed by a hash of the token prefix), so only ${fresh} tokens are prefilled: ${fmtFlops(f2p * fresh)}, ${Math.round((1 - fresh / (shared + fresh)) * 100)}% less prefill and a much faster first token. Providers bill these "cached input tokens" at a discount.`
      : `Nothing to reuse: with no KV cache there are no stored K/V blocks, so the ${shared}-token prefix is recomputed for every request. Turn the cache on to compare.`,
  });
  push({
    stage: 'done',
    longBytes: long,
    caption: `Recap: the KV cache trades memory (${fmtBytes(per)}/token here, growing linearly) for compute (linear instead of quadratic decode). Put stable content (system prompt, tools, documents) first so prefixes match across requests.`,
  });
  return frames;
}
