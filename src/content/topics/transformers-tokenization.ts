import type { Topic } from '../../types';

const topic: Topic = {
  id: 'transformers-tokenization',
  phase: 'foundations',
  order: 2,
  title: 'Transformers & Tokenization',
  subtitle: 'How an LLM actually reads your text (tokens) and turns it into the next token (the transformer), without the maths',
  estimatedMinutes: 36,
  sources: [
    'Vaswani et al. 2017 — Attention Is All You Need (arXiv:1706.03762)',
    'Sennrich et al. 2016 — Neural Machine Translation of Rare Words with Subword Units (BPE, arXiv:1508.07909)',
    'Kudo & Richardson 2018 — SentencePiece (arXiv:1808.06226)',
    'Radford et al. 2019 — Language Models are Unsupervised Multitask Learners (GPT-2, byte-level BPE)',
    'OpenAI tiktoken repository — cl100k_base / o200k_base encodings (github.com/openai/tiktoken)',
    'js-tiktoken on npm — getEncoding / encodingForModel',
    'Meta — Llama 3 model card (128K-token vocabulary, 8B: 32 layers, 4096 hidden)',
    'Jay Alammar — The Illustrated Transformer / The Illustrated GPT-2',
    'Andrej Karpathy — Let\'s build the GPT Tokenizer (2024 lecture)',
    'Anthropic docs — Token counting (messages.countTokens)',
    'devtoollab.com — How LLM tokenization works (cl100k vs o200k per-language counts)',
  ],
  tags: ['transformer', 'decoder-only', 'attention', 'tokenization', 'bpe', 'tiktoken', 'sentencepiece', 'context-window'],
  cheatSheet: [
    'An LLM is a decoder-only transformer: token ids → embeddings → N stacked blocks (attention + MLP) → a probability for every vocabulary entry → pick one → append → repeat.',
    'Attention = each token gathers information from earlier tokens; MLP = each token "thinks" about what it gathered. A causal mask stops tokens peeking at the future.',
    'Training is parallel (all positions at once); generation is sequential (one token per forward pass). That is why output tokens cost more and take longer than input tokens.',
    'Prefill (reading the prompt) is fast and parallel; decode (writing the answer) runs at roughly 30–150 tokens/s per stream. Latency ≈ TTFT + output_tokens / decode_speed.',
    'Attention compares every token with every earlier token, so cost grows ~quadratically with context length; long prompts are slower and pricier, not just bigger.',
    'Tokens are sub-word pieces learned by BPE: English ≈ 4 chars ≈ 0.75 words per token. " Paris" (with its leading space) is a single token.',
    'Encodings: GPT-2 50,257 · cl100k_base ~100K (GPT-4) · o200k_base ~200K (GPT-4o and later) · Llama 3 128K · BERT WordPiece 30,522. Never count with the wrong one.',
    'Non-English text costs more tokens: a Hindi sentence went 31 → 10 tokens moving cl100k → o200k vs 7 for the English equivalent. Measure, don\'t assume.',
    'Tokenization explains classic failures: letter counting ("st|raw|berry"), digit maths ("123|456|789|0"), trailing-space prompts and "9.11 vs 9.9".',
    'Budget = context window − system prompt − history − retrieved docs − reserved max output tokens. Count with the real tokenizer (or the provider\'s count-tokens endpoint).',
  ],
  sections: [
    {
      heading: 'Transformer Architecture — the intuition: tokens in, next-token probabilities out',
      body: `**Intuition:** a transformer is a very large autocomplete. Give it the text so far and it returns a probability for every possible next token. Generate one token, append it, ask again. Everything an LLM does (chat, code, JSON, tool calls) is this loop.

**The pipeline (decoder-only, as in GPT, Claude, Llama, Mistral):**

1. **Token ids → embeddings.** Each id looks up a learned vector (e.g. 4,096 numbers in Llama 3 8B). Position information is mixed in (modern models use RoPE).
2. **N identical blocks** (32 in Llama 3 8B, 12 in GPT-2 small). Each block has:
   - **Self-attention:** every token looks back at earlier tokens and pulls in what is relevant ("it" looks at "the cat"). A **causal mask** blocks looking at future tokens.
   - **MLP (feed-forward):** each token processes what it gathered; most of the model's "knowledge" lives here.
   - Residual connections + normalisation keep the stack trainable.
3. **Output head:** the last position's vector becomes **logits**, one score per vocabulary entry (~200K), then softmax → probabilities → a sampler picks a token.

| Family | Sees | Used for |
|---|---|---|
| Encoder-only (BERT) | whole text both ways | embeddings, classification |
| Decoder-only (GPT, Claude, Llama) | only the past | generation, chat, agents |
| Encoder–decoder (T5, original 2017) | input both ways, output left-to-right | translation, summarisation |

**Why it matters to you as a builder:** training processes all positions in parallel, but generation is one forward pass per output token. So output tokens dominate latency and cost more per token, and attention over long contexts gets expensive (roughly quadratic). Attention maths, multi-head details and the KV cache are covered in the Advanced *Transformer Internals* topic.`,
      example: `Prompt: **"The capital of France is"** → o200k tokens \`["The"," capital"," of"," France"," is"]\` (5 tokens).

GPT-2 small runs one forward pass and returns a 50,257-long logit vector for the last position. After softmax the top candidates look like: \`" Paris"\` 0.21, \`" the"\` 0.09, \`" a"\` 0.05, \`" now"\` 0.03 (illustrative). Greedy decoding picks " Paris", appends it (6 tokens) and runs the whole stack again to get "." next.

Timing for a chat model: the 5-token prompt is read in one parallel **prefill** pass (a few ms), but a 300-token answer needs **300 sequential decode steps**; at 60 tokens/s that is ~5 s. That is why you stream, cap \`max_tokens\`, and why providers price output tokens 3–5× higher than input.`,
      diagram: `  "The capital of France is"
            │ tokenizer
            ▼
  ids [976, 9029, 328, 10128, 382]  (o200k_base)
            │ embedding lookup (+ position info)
            ▼
  ┌────────────────────────────┐
  │ Block 1: self-attention    │◄─ causal mask: look back only
  │          MLP               │
  ├────────────────────────────┤
  │ ...  × N blocks (12–100+)  │
  └────────────────────────────┘
            │ last position vector
            ▼
  logits (1 per vocab entry) → softmax → sample
            │
            ▼
       " Paris"  ── append to ids, run again ──┐
            ▲                                  │
            └──────────────────────────────────┘`,
      code: [
        {
          language: 'python',
          title: 'Watch the next-token loop with GPT-2 (transformers + torch)',
          code: `# pip install transformers torch
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

tok = AutoTokenizer.from_pretrained("gpt2")
model = AutoModelForCausalLM.from_pretrained("gpt2").eval()

ids = tok("The capital of France is", return_tensors="pt").input_ids  # shape [1, 5]

for step in range(6):
    with torch.no_grad():
        logits = model(ids).logits          # [1, seq_len, 50257]: a score per vocab entry, per position
    last = logits[0, -1]                    # only the LAST position predicts the next token
    probs = torch.softmax(last, dim=-1)
    top = torch.topk(probs, 3)
    print(step, [(tok.decode(int(i)), round(float(p), 3)) for p, i in zip(top.values, top.indices)])
    next_id = top.indices[0].view(1, 1)     # greedy: take the most likely token
    ids = torch.cat([ids, next_id], dim=1)  # append and loop: generation is sequential

print(tok.decode(ids[0]))
print("layers:", model.config.n_layer, "hidden:", model.config.n_embd, "heads:", model.config.n_head)  # 12, 768, 12`,
        },
      ],
      prosCons: {
        pros: [
          'One architecture handles text, code, JSON and (with adapters) images and audio, so skills transfer across tasks.',
          'Attention lets any token use any earlier token directly, so long-range references ("it" → a noun 2,000 tokens back) work far better than in RNNs.',
          'Training parallelises across all positions, which is what made web-scale pre-training feasible.',
        ],
        cons: [
          {
            con: 'Generation is sequential: a 1,000-token answer needs 1,000 forward passes, so long outputs are slow.',
            fix: 'Stream tokens to the user, cap max_tokens, ask for concise formats, and use a smaller/faster model for long boilerplate output.',
          },
          {
            con: 'Attention cost grows roughly quadratically with context length, so stuffing 100K tokens raises latency and cost.',
            fix: 'Retrieve only the relevant chunks (RAG), summarise old history, and use prompt caching for long static prefixes.',
          },
          {
            con: 'The model only predicts likely text; it has no built-in fact check, so fluent answers can be wrong.',
            fix: 'Ground answers in retrieved sources, ask for citations, validate structured output and evaluate on a golden set.',
          },
        ],
      },
      keyPoints: [
        'An LLM = embeddings → N blocks of (attention + MLP) → logits over the vocabulary → sample → repeat.',
        'Attention moves information between tokens; the MLP processes it per token; the causal mask forbids looking ahead.',
        'Decoder-only models generate; encoder-only models (BERT) are for embeddings and classification.',
        'Prefill is parallel and cheap; decode is one pass per token, so output length drives latency.',
      ],
      exercise: {
        prompt: `Implement \`generate(promptIds, nextLogits, opts)\`: the autoregressive loop every LLM API runs for you.

Acceptance criteria:
- Calls \`nextLogits(ids)\` (a stand-in for the transformer) and appends the **argmax** token each step.
- Stops on **any** of: the EOS id, a stop-sequence id, or \`maxNewTokens\`.
- Returns \`{ ids, newTokens, finishReason }\` where finishReason is \`'stop'\` or \`'length'\` (like real APIs).
- Never includes the EOS/stop id in the returned new tokens.`,
        starter: {
          language: 'typescript',
          code: `type NextLogits = (ids: number[]) => number[]; // one score per vocab entry

interface GenOpts { maxNewTokens: number; eosId: number; stopIds?: number[] }

export function generate(promptIds: number[], nextLogits: NextLogits, opts: GenOpts) {
  const ids = [...promptIds];
  const newTokens: number[] = [];
  // TODO: loop up to opts.maxNewTokens
  // TODO: argmax over nextLogits(ids)
  // TODO: stop on eos or stopIds (finishReason 'stop'), else append
  return { ids, newTokens, finishReason: 'length' as 'stop' | 'length' };
}

// Toy "model": always prefers (last id + 1) and emits EOS (0) after id 5
const toy: NextLogits = (ids) => {
  const last = ids[ids.length - 1];
  const scores = new Array(10).fill(0);
  scores[last >= 5 ? 0 : last + 1] = 1;
  return scores;
};
console.log(generate([1, 2], toy, { maxNewTokens: 10, eosId: 0 }));`,
        },
        hints: [
          'Argmax: keep the index with the highest score in a single pass over the array.',
          'Check the stop condition before pushing the token, so EOS never lands in newTokens.',
          'If the loop finishes without hitting a stop, the finish reason is "length", which is what APIs report when max_tokens truncates an answer.',
        ],
        solution: {
          language: 'typescript',
          code: `type NextLogits = (ids: number[]) => number[];

interface GenOpts { maxNewTokens: number; eosId: number; stopIds?: number[] }

function argmax(xs: number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[best]) best = i;
  return best;
}

export function generate(promptIds: number[], nextLogits: NextLogits, opts: GenOpts) {
  const ids = [...promptIds];
  const newTokens: number[] = [];
  const stops = new Set([opts.eosId, ...(opts.stopIds ?? [])]);

  for (let step = 0; step < opts.maxNewTokens; step++) {
    const next = argmax(nextLogits(ids)); // one full forward pass per new token
    if (stops.has(next)) return { ids, newTokens, finishReason: 'stop' as const };
    ids.push(next);
    newTokens.push(next);
  }
  return { ids, newTokens, finishReason: 'length' as const }; // truncated by the budget
}

const toy: NextLogits = (ids) => {
  const last = ids[ids.length - 1];
  const scores = new Array(10).fill(0);
  scores[last >= 5 ? 0 : last + 1] = 1;
  return scores;
};
console.log(generate([1, 2], toy, { maxNewTokens: 10, eosId: 0 }));
// { ids: [1,2,3,4,5], newTokens: [3,4,5], finishReason: 'stop' }
console.log(generate([1, 2], toy, { maxNewTokens: 2, eosId: 0 }).finishReason); // 'length'`,
        },
        explanation: `This is exactly what happens behind \`chat.completions.create\`: one forward pass per token, a stop check, and a finish reason. When you see \`finish_reason: "length"\` (OpenAI) or \`stop_reason: "max_tokens"\` (Anthropic), the loop ran out of budget mid-answer, so raise the limit or ask for shorter output.`,
      },
      quickCheck: {
        question: 'Your prompt is 4,000 tokens and the answer is 400 tokens. Which part usually dominates wall-clock latency on a hosted LLM?',
        options: [
          'Reading the 4,000 prompt tokens, because there are 10× more of them',
          'Generating the 400 output tokens, because each needs its own sequential forward pass',
          'Tokenizing the prompt on the client',
          'Both take equal time because the model processes one token per step either way',
        ],
        correct: 1,
        explanation: 'The prompt is processed in one parallel prefill pass (typically well under a second), while 400 output tokens need 400 sequential decode steps (~5–7 s at 60–80 tok/s). Prompt tokens are not processed one per step, which is why option 4 is wrong.',
      },
      source: 'Vaswani et al. 2017 — Attention Is All You Need; Jay Alammar — The Illustrated GPT-2',
    },
    {
      heading: 'Tokenization — BPE, vocabularies and why tokens are not words',
      body: `**Intuition:** the model never sees letters or words, only integer ids for **sub-word pieces**. Think of a phrasebook: common chunks (" the", " Paris", "ization") get their own entry; rare words are spelled from smaller pieces; anything at all can fall back to raw bytes.

**How BPE (byte-pair encoding) builds the vocabulary:** start from the 256 possible bytes, count the most frequent adjacent pair in a huge corpus, merge it into a new token, repeat ~100K–200K times. At runtime the tokenizer applies the same merges to your text.

| Tokenizer | Vocab | Used by |
|---|---|---|
| GPT-2 byte-level BPE | 50,257 | GPT-2/3 |
| \`cl100k_base\` | ~100K | GPT-3.5, GPT-4, OpenAI embeddings v3 |
| \`o200k_base\` | ~200K | GPT-4o, o-series and later OpenAI models |
| Llama 3 (tiktoken-style BPE) | 128,256 | Llama 3.x |
| SentencePiece (BPE/Unigram) | 32K–256K | Llama 2, T5, Gemma |
| WordPiece | 30,522 | BERT |

**Rules of thumb (English):** 1 token ≈ 4 characters ≈ 0.75 words; 1,000 words ≈ 1,300 tokens. Leading spaces belong to the next word (" Paris" is one token). Code, JSON, numbers and non-Latin scripts take more tokens per character.

**Why you care:**
- **Billing and limits** are in tokens: context window, \`max_tokens\`, rate limits (TPM), price per 1M tokens.
- **Quirks:** letter counting, reversing strings, long arithmetic and trailing spaces trip models up because they see "st|raw|berry", not s-t-r-a-w-b-e-r-r-y.
- **Each model family has its own tokenizer.** Count with the right one (\`js-tiktoken\` for OpenAI, \`messages.countTokens\` for Claude, \`AutoTokenizer\` for open models); never with \`text.length / 4\` when the budget is tight.`,
      example: `Real \`o200k_base\` output (js-tiktoken):

| Text | Chars | Tokens | Pieces |
|---|---|---|---|
| "Your order will arrive by tomorrow." | 35 | 7 | Your · order · will · arrive · by · tomorrow · . |
| Same sentence in Hindi | 29 | 10 | आप · का · ऑ · र्ड · … |
| Same sentence in Japanese | 14 | 11 | 明 · 日 · まで · に · … |
| "strawberry" | 10 | 3 | st · raw · berry |
| "1234567890" | 10 | 4 | 123 · 456 · 789 · 0 |

The Hindi sentence was **31 tokens** under the older \`cl100k_base\`, so the bigger vocabulary cut its cost by ~3×. It is still ~1.4× the English count. And " strawberry" *with* a leading space is a single token, so the model never sees its letters at all.`,
      diagram: `  BPE training (offline, once)          Encoding (every request)
  ───────────────────────────            ────────────────────────
  corpus bytes                           "unbelievably"
  t h e _ c a t ...                            │ split into bytes
     │ count adjacent pairs                     ▼
     ▼                                    u n b e l i e v a b l y
  most frequent: (t,h) → "th"                  │ apply learned merges
  then (th,e) → "the" ...                      ▼
     │ repeat ~200K merges                "unbel" "iev" "ably"
     ▼                                         │ look up ids
  vocab: 256 bytes + merges                    ▼
                                          [ 41, 9921, 3402 ] (illustrative)`,
      code: [
        {
          language: 'typescript',
          title: 'Count and inspect tokens with js-tiktoken',
          code: `// npm i js-tiktoken
import { getEncoding } from 'js-tiktoken';

const enc = getEncoding('o200k_base'); // GPT-4o-family encoding; use cl100k_base for GPT-4 / text-embedding-3-*

const samples = [
  'Your order will arrive by tomorrow.',
  'आपका ऑर्डर कल तक पहुंच जाएगा।',          // Hindi: more tokens for the same meaning
  '{"name": "Ada", "age": 36}',             // JSON punctuation costs tokens too
  'strawberry',
];

for (const text of samples) {
  const ids = enc.encode(text);
  const pieces = ids.map((id) => enc.decode([id])); // see where the boundaries fall
  console.log(text.length + ' chars -> ' + ids.length + ' tokens', pieces);
}

// Quick cost estimate: illustrative price of $2.50 per 1M input tokens
const doc = 'Lorem ipsum dolor sit amet. '.repeat(500);
const n = enc.encode(doc).length;
console.log('tokens:', n, 'est. cost $', ((n / 1_000_000) * 2.5).toFixed(5));
console.log('chars/4 guess:', Math.round(doc.length / 4)); // compare the heuristic with the truth`,
        },
      ],
      prosCons: {
        pros: [
          'Sub-word tokens give a fixed, finite vocabulary that can still represent any string (byte fallback means no "unknown word").',
          'Frequent words become single tokens, so English text compresses ~4 chars per token, keeping sequences short and cheap.',
          'Larger modern vocabularies (o200k, 128K Llama 3) greatly cut token counts for non-English text and code.',
        ],
        cons: [
          {
            con: 'Models cannot "see" letters or digits inside a token, so spelling, counting characters and long arithmetic fail.',
            fix: 'Do character/number work in code (a tool call or code interpreter) and give the model the result; or ask it to spell the word out letter by letter first.',
          },
          {
            con: 'Non-Latin languages cost more tokens per meaning, inflating bills and filling the context window faster.',
            fix: 'Measure per-language token counts with the real tokenizer, prefer models with large multilingual vocabularies, and budget per language.',
          },
          {
            con: 'Every model family tokenizes differently, so a chars/4 or cl100k estimate can be 10–30% off for another model.',
            fix: 'Count with the target model\'s tokenizer or the provider\'s count-tokens endpoint, and keep a 10–15% safety margin.',
          },
          {
            con: 'Special-token strings like "<|endoftext|>" in user input can confuse or crash naive pipelines.',
            fix: 'Keep the library default that rejects special tokens in untrusted text, or encode them as plain text; never splice raw ids from user input.',
          },
        ],
      },
      keyPoints: [
        'Models see integer ids of sub-word pieces, never characters.',
        'BPE repeatedly merges the most frequent byte pairs; the merges are the tokenizer.',
        'English ≈ 4 chars/token; code, numbers and non-Latin scripts use more.',
        'Count with the exact tokenizer of the model you call, and leave a safety margin.',
      ],
      exercise: {
        prompt: `Write \`fitHistory(system, turns, budget, reserveOutput)\` that trims a chat history to fit a context budget.

Acceptance criteria:
- Uses \`js-tiktoken\` (\`o200k_base\`) to count tokens, adding **4 tokens of overhead per message** for role/formatting.
- The **system prompt is always kept**; \`reserveOutput\` tokens are left free for the answer.
- Drops the **oldest** turns first and always keeps the most recent turn; throws if even system + last turn do not fit.
- Returns the kept messages in original order plus the total prompt token count.`,
        starter: {
          language: 'typescript',
          code: `import { getEncoding } from 'js-tiktoken';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
const enc = getEncoding('o200k_base');
const PER_MESSAGE_OVERHEAD = 4;

export function fitHistory(system: string, turns: Msg[], budget: number, reserveOutput: number) {
  // TODO: count(msg) = tokens(content) + overhead
  // TODO: available = budget - reserveOutput - count(system)
  // TODO: walk turns from newest to oldest, keep while they fit
  return { messages: [] as Msg[], promptTokens: 0 };
}`,
        },
        hints: [
          'Compute the available budget once, then iterate turns from the end with a for loop going backwards.',
          'Use unshift (or collect then reverse) so the kept turns stay in chronological order.',
          'Stop at the first turn that does not fit: skipping it but keeping older turns would create a confusing gap in the conversation.',
        ],
        solution: {
          language: 'typescript',
          code: `import { getEncoding } from 'js-tiktoken';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
const enc = getEncoding('o200k_base');
const PER_MESSAGE_OVERHEAD = 4; // role markers and separators; check your provider's exact accounting

const count = (m: Msg) => enc.encode(m.content).length + PER_MESSAGE_OVERHEAD;

export function fitHistory(system: string, turns: Msg[], budget: number, reserveOutput: number) {
  const sys: Msg = { role: 'system', content: system };
  let used = count(sys);
  const available = budget - reserveOutput;
  const kept: Msg[] = [];

  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = count(turns[i]);
    if (used + cost > available) break; // contiguous window: stop at the first misfit
    kept.unshift(turns[i]);
    used += cost;
  }

  if (turns.length > 0 && kept.length === 0) {
    throw new Error('System prompt plus the latest turn exceed the budget; summarise or truncate the input');
  }
  return { messages: [sys, ...kept], promptTokens: used };
}

// Example: 8K context, keep 1K for the answer
const turns: Msg[] = Array.from({ length: 50 }, (_, i) => ({
  role: i % 2 ? 'assistant' : 'user',
  content: 'Message ' + i + ': ' + 'details about the order and the refund. '.repeat(20),
}));
const out = fitHistory('You are a support agent.', turns, 8000, 1000);
console.log(out.messages.length - 1, 'turns kept,', out.promptTokens, 'prompt tokens');`,
        },
        explanation: `Budgets are about **tokens**, not characters or messages. Reserving output space prevents the "answer cut off mid-sentence" (finish reason length) failure, and dropping the oldest turns first keeps the conversation coherent. In production you would summarise the dropped turns instead of discarding them.`,
      },
      quickCheck: {
        question: 'A model reliably answers "2" when asked how many r\'s are in "strawberry". What is the most accurate explanation?',
        options: [
          'The model was trained on too little English text',
          'The word reaches the model as a few sub-word tokens (e.g. "st|raw|berry" or one " strawberry" token), so it never directly sees individual letters',
          'Temperature is too high, adding randomness to counting',
          'The context window is too small to hold the word',
        ],
        correct: 1,
        explanation: 'The model receives token ids, not characters; letter-level facts must be inferred indirectly. Lower temperature would make the wrong answer more consistent, not correct. The fix is to spell the word out first or count in code.',
      },
      source: 'Sennrich et al. 2016 — BPE; OpenAI tiktoken; Karpathy — Let\'s build the GPT Tokenizer',
    },
  ],
  codeChallenges: [
    {
      id: 'transformers-tokenization-cc-1',
      title: 'Context packing with chars / 4 and a chopped system prompt',
      context: 'A support bot builds one big prompt string and truncates it by character count to "fit" a 16K-token model. Users report the bot forgetting its rules on long chats, answers stopping mid-sentence, and occasional 400 "context length exceeded" errors for Japanese customers.',
      task: 'Rewrite buildPrompt so it counts real tokens, never drops the system prompt, reserves room for the answer and trims whole turns from the oldest end.',
      starter: {
        language: 'typescript',
        code: `const CONTEXT_TOKENS = 16000;

type Turn = { role: 'user' | 'assistant'; content: string };

export function buildPrompt(system: string, history: Turn[], question: string) {
  let prompt = system + '\\n';
  for (const t of history) prompt += t.role + ': ' + t.content + '\\n';
  prompt += 'user: ' + question;

  const maxChars = CONTEXT_TOKENS * 4;          // "1 token = 4 chars"
  if (prompt.length > maxChars) {
    prompt = prompt.slice(0, maxChars);          // keep the first N characters
  }
  return { prompt, max_tokens: 4000 };
}`,
      },
      hints: [
        'slice(0, maxChars) keeps the OLDEST content and cuts the newest question; and chars/4 badly underestimates Japanese or Hindi.',
        'Reserve max_tokens out of the window: prompt + output must fit together.',
        'Build structured messages (system + turns) and drop whole turns from the front until the token count fits.',
      ],
      solution: {
        language: 'typescript',
        code: `import { getEncoding } from 'js-tiktoken';

const CONTEXT_TOKENS = 16000;
const MAX_OUTPUT = 1500;            // reserved for the answer
const SAFETY = 0.9;                 // 10% margin for per-message overhead / tokenizer drift
const enc = getEncoding('o200k_base'); // must match the deployed model family

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
const tokens = (m: Msg) => enc.encode(m.content).length + 4;

export function buildMessages(system: string, history: Msg[], question: string) {
  const sys: Msg = { role: 'system', content: system };
  const q: Msg = { role: 'user', content: question };
  const budget = Math.floor(CONTEXT_TOKENS * SAFETY) - MAX_OUTPUT;

  let used = tokens(sys) + tokens(q);  // system and the new question are non-negotiable
  if (used > budget) throw new Error('Question too long: ask the user to shorten it or summarise it first');

  const kept: Msg[] = [];
  for (let i = history.length - 1; i >= 0; i--) {   // newest first
    const t = tokens(history[i]);
    if (used + t > budget) break;                     // drop this and everything older
    kept.unshift(history[i]);
    used += t;
  }
  const droppedTurns = history.length - kept.length;  // log it; consider summarising these
  return { messages: [sys, ...kept, q], max_tokens: MAX_OUTPUT, promptTokens: used, droppedTurns };
}`,
      },
      explanation: `The original had four bugs: (1) chars/4 underestimates non-English text by 2–3× so Japanese prompts overflowed; (2) slicing from the start kept stale history and **cut the user's actual question**; (3) it never reserved \`max_tokens\`, so prompt + output exceeded the window; (4) a flat string loses roles. The fix counts real tokens, protects the system prompt and question, trims whole turns from the oldest end and reports what was dropped.`,
      followUps: [
        {
          q: 'Dropped turns contained the customer\'s order number. How do you avoid losing it?',
          a: 'Summarise dropped turns into a short running summary message (or extract key facts like order id into structured state) and keep that pinned after the system prompt instead of discarding the turns outright.',
        },
        {
          q: 'You switch the deployment to a Claude model. What changes in this code?',
          a: 'The tokenizer: o200k counts no longer match Claude. Use the Anthropic messages.countTokens endpoint (or calibrate a ratio on real traffic) and keep the safety margin, since a wrong tokenizer silently breaks the budget.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-cc-2',
      title: 'Token-sliced chunker that corrupts text',
      context: 'An ingestion job splits documents into 300-token chunks for embedding by slicing the token array and decoding each slice. Hindi and emoji-heavy documents show "�" characters in chunks, and search quality is poor because chunks start and end mid-word.',
      task: 'Fix the chunker so chunks never contain broken characters or split words/sentences, while staying under the token limit, and make sure the tokenizer matches the embedding model.',
      starter: {
        language: 'typescript',
        code: `import { getEncoding } from 'js-tiktoken';

const enc = getEncoding('o200k_base'); // embedding model: text-embedding-3-small

export function chunk(text: string, size = 300): string[] {
  const ids = enc.encode(text);
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(enc.decode(ids.slice(i, i + size))); // slice boundaries ignore words and characters
  }
  return out;
}`,
      },
      hints: [
        'A single character can span several byte-level tokens; decoding half of them yields the U+FFFD replacement character.',
        'Split on sentence boundaries first, then pack whole sentences into chunks by token count.',
        'text-embedding-3-small uses cl100k_base, not o200k_base.',
      ],
      solution: {
        language: 'typescript',
        code: `import { getEncoding } from 'js-tiktoken';

const enc = getEncoding('cl100k_base'); // text-embedding-3-* models use cl100k_base
const count = (s: string) => enc.encode(s).length;

// Split into sentences with Intl.Segmenter (handles Hindi danda, CJK full stops, etc.)
function sentences(text: string): string[] {
  const seg = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  return Array.from(seg.segment(text), (s) => s.segment).filter((s) => s.trim());
}

export function chunk(text: string, size = 300): string[] {
  const out: string[] = [];
  let cur = '';
  let curTokens = 0;
  for (const s of sentences(text)) {
    const n = count(s);
    if (n > size) {                       // pathological long sentence: split on words instead
      const words = new Intl.Segmenter(undefined, { granularity: 'word' });
      for (const w of Array.from(words.segment(s), (x) => x.segment)) {
        if (curTokens + count(w) > size && cur) { out.push(cur.trim()); cur = ''; curTokens = 0; }
        cur += w; curTokens += count(w);
      }
      continue;
    }
    if (curTokens + n > size && cur) { out.push(cur.trim()); cur = ''; curTokens = 0; }
    cur += s; curTokens += n;             // only whole sentences, so no broken characters
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}`,
      },
      explanation: `Byte-level BPE can encode one Devanagari character or emoji as several tokens, so a slice boundary can fall inside a character and decode to "�". Packing **whole sentences** (or words, for very long sentences) guarantees valid text and semantically cleaner chunks, and counting with the **embedding model's own tokenizer** (cl100k_base for text-embedding-3-*) keeps the limit accurate. Chunk overlap and structure-aware splitting are covered in the Chunking topics.`,
      followUps: [
        {
          q: 'Summing per-sentence counts can differ slightly from counting the joined chunk. Does that matter?',
          a: 'Slightly: BPE merges can cross a boundary, so counts are not perfectly additive (usually within a token or two per boundary). Keep a small margin below the hard limit, or re-count the final chunk and split again if it overflows.',
        },
        {
          q: 'Why use Intl.Segmenter instead of splitting on ". "?',
          a: 'Splitting on ". " breaks on abbreviations (e.g. "Dr. Smith", "v2.1") and ignores other scripts\' punctuation such as the Hindi danda "।" or Japanese "。"; Intl.Segmenter applies Unicode sentence-boundary rules per locale.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'transformers-tokenization-iq-1',
      difficulty: 'medium',
      question: 'Explain to a new backend engineer, without maths, how a chat model turns a prompt into a reply, and what that implies for latency and pricing.',
      whatInterviewerLooksFor: [
        'Correct pipeline: tokenize → embed → stacked attention/MLP blocks → logits → sample → append → repeat',
        'Distinguishes parallel prefill from sequential decode',
        'Connects decode to output-token pricing, streaming and max_tokens',
        'Mentions the context window as a hard token limit for prompt + output',
      ],
      modelAnswer: `**The loop.** The text is split into **tokens** (sub-word pieces) and mapped to ids. Each id becomes a vector, then passes through a stack of identical **transformer blocks**: *attention* lets each token pull in information from earlier tokens, and an *MLP* processes it. At the top, the last position produces a score for every vocabulary entry; these become probabilities, the sampler picks one token, it is appended, and the whole thing runs again. A reply is just this loop until an end token, a stop sequence or \`max_tokens\`.

**Two phases with different costs:**
- **Prefill:** all prompt tokens are processed in one parallel pass. Fast per token: a few thousand tokens in a few hundred ms. This is most of the **time to first token (TTFT)**.
- **Decode:** one forward pass per output token, so 30–150 tokens/s per stream.

**Implications:**
- Latency ≈ TTFT + output_tokens ÷ decode speed, so **short outputs are the biggest latency lever**. Stream tokens for perceived speed.
- Providers price **output tokens 3–5× higher** than input because each needs a sequential pass.
- The **context window** caps prompt + output tokens together; reserve space for the answer.
- Long prompts are not free: attention compares every token with every earlier one, so cost grows faster than linearly. Prompt caching helps when the prefix repeats.`,
      followUps: [
        {
          q: 'Why can the provider charge less for cached input tokens?',
          a: 'The intermediate attention state (the KV cache) for an identical prefix can be stored and reused, so the prefill computation for those tokens is skipped; you pay a fraction of the normal input price.',
        },
        {
          q: 'Where does temperature fit into this loop?',
          a: 'At the sampling step: logits are divided by the temperature before softmax. Low temperature sharpens the distribution toward the top token; high temperature flattens it so less likely tokens are picked more often.',
        },
      ],
      pitfalls: [
        'Saying the model "looks up answers" or retrieves from a database',
        'Claiming input tokens are processed one at a time like output tokens',
        'Forgetting that max_tokens counts against the context window',
      ],
    },
    {
      id: 'transformers-tokenization-iq-2',
      difficulty: 'hard',
      question: 'Your LLM bill per conversation is about 2× higher for Hindi and Japanese users than for English users with similar conversations. Diagnose and propose fixes.',
      context: 'Same product, same prompts translated, same average message length in characters.',
      whatInterviewerLooksFor: [
        'Identifies tokenization efficiency per script as the cause',
        'Proposes measuring with the real tokenizer on real traffic',
        'Knows newer large vocabularies (o200k, 128K+) reduce the gap',
        'Offers product/architecture levers beyond switching models',
      ],
      modelAnswer: `**Diagnosis: the token tax.** BPE vocabularies are learned mostly from English-heavy data, so English words often become one token while Devanagari or Japanese text splits into more, smaller pieces. Measured example with OpenAI tokenizers: an English sentence = 7 tokens; the Hindi equivalent = **31 tokens with cl100k_base** and **10 with o200k_base**. Same meaning, very different cost, and it also fills the context window faster.

**Confirm it:**
1. Log \`usage.prompt_tokens\` / \`completion_tokens\` per request, tagged with language.
2. Compute tokens per character and tokens per conversation by language.
3. Check which parts inflate: the system prompt (is it translated?), retrieved docs, or the model's answers.

**Fixes, cheapest first:**
- **Keep the system prompt and tool schemas in English** (models follow English instructions fine) and instruct "answer in the user's language".
- **Move to a model with a larger multilingual vocabulary** (o200k-era OpenAI models, Llama 3's 128K vocab, Gemma's 256K), re-measured on your data.
- **Trim context:** fewer/shorter retrieved chunks, summarised history.
- **Prompt caching** for the static prefix.
- **Pricing/quotas per language** if the residual gap is a business issue.

**Avoid** pre-translating everything to English: it adds latency, a second model call and translation errors, and often costs as much as it saves.`,
      followUps: [
        {
          q: 'Would chars/4 have warned you about this before launch?',
          a: 'No: chars/4 is calibrated for English and underestimates Hindi or Japanese by 2–3× with older tokenizers. Only counting with the actual tokenizer on representative multilingual samples reveals the gap.',
        },
        {
          q: 'Does the token tax affect quality as well as cost?',
          a: 'It can: more tokens per idea means less content fits in the context window, longer generation time, and historically weaker performance in languages the tokenizer and training data under-represent.',
        },
      ],
      pitfalls: [
        'Blaming verbosity of users without measuring tokens per character',
        'Assuming all tokenizers behave the same across languages',
        'Proposing a translation pipeline without accounting for its own cost and errors',
      ],
    },
    {
      id: 'transformers-tokenization-iq-3',
      difficulty: 'hard',
      question: 'A product manager asks why the model can write a sonnet but miscounts letters, fails to reverse a string and says 9.11 is bigger than 9.9. How do you explain it, and how do you design around it?',
      whatInterviewerLooksFor: [
        'Ties failures to tokenization (sub-word and digit chunking)',
        'Explains that the model predicts plausible text rather than executing algorithms',
        'Proposes tool use / code execution for deterministic work',
        'Mentions prompting mitigations and evaluation',
      ],
      modelAnswer: `**Root cause: the model never sees characters.** "strawberry" arrives as 1–3 sub-word tokens (" strawberry" or "st|raw|berry"), so counting r's requires knowledge about the spelling of a token, which is learned only indirectly. Reversing a string has the same issue.

**Numbers are chunked too.** o200k splits "1234567890" into "123|456|789|0" and "9.11" into "9|.|11". Comparing "11" with "9" after the dot looks like comparing integers (11 > 9), a pattern also common in version numbers and dates in training text. The model is producing *plausible continuations*, not running a comparison algorithm.

**Design around it:**
| Task | Approach |
|---|---|
| Counting, sorting, arithmetic, dates | Give the model a **tool** (calculator, code interpreter) and let it call it |
| String manipulation | Do it in code before/after the LLM call |
| When it must reason in text | Ask it to **spell out / write intermediate steps** (one letter or digit per line), which turns hidden sub-token info into visible tokens |
| Comparisons in extracted data | Extract to **structured JSON**, compare in code |

**Validate:** add these cases to your eval set; reasoning models do better but still are not a substitute for deterministic code where exactness matters.`,
      followUps: [
        {
          q: 'Why does asking the model to spell the word first help?',
          a: 'Spelling produces each letter as its own token in the output, so the follow-up counting step can attend to explicit single-letter tokens rather than relying on hidden knowledge of what a multi-letter token contains.',
        },
        {
          q: 'Would a character-level tokenizer fix this?',
          a: 'It would expose letters, but sequences would be about 4× longer, making attention far more expensive and shrinking the effective context; that trade-off is why production models use sub-word BPE plus tools.',
        },
      ],
      pitfalls: [
        'Saying the model is "bad at maths" without explaining why',
        'Relying on prompt wording alone for exact computation',
        'Claiming bigger models never make these errors',
      ],
    },
    {
      id: 'transformers-tokenization-iq-4',
      difficulty: 'medium',
      question: 'Your team needs both semantic search over documents and a chat assistant. When would you use an encoder-only model versus a decoder-only model, and why?',
      whatInterviewerLooksFor: [
        'Encoder-only = bidirectional, produces representations (embeddings, classification)',
        'Decoder-only = causal, generates text',
        'Practical mapping: embedding model for search, LLM for generation',
        'Mentions cost/latency differences',
      ],
      modelAnswer: `**Encoder-only (BERT-style)** reads the whole input in both directions at once: every token attends to every other. The output is a set of vectors that represent meaning, which you pool into one **embedding** or feed to a classifier. No generation loop, so it is fast and cheap: one forward pass per text, often on CPU, with models of ~20M–500M parameters (e.g. all-MiniLM-L6-v2 at 384 dims, bge-m3).

**Decoder-only (GPT, Claude, Llama)** uses a **causal mask**: each token sees only the past. This is what makes next-token generation possible, so it is the right tool for chat, summarisation, extraction and agents, at the price of a sequential decode loop and far larger models.

**Mapping to this product:**
| Need | Model type | Why |
|---|---|---|
| Index and search documents | Embedding model (encoder-style) | one pass per chunk, compact vectors, cheap to run on millions of chunks |
| Rerank top results | Cross-encoder (encoder) | reads query + doc jointly for precise relevance |
| Answer questions, chat | Decoder-only LLM | needs to generate text |

**Nuance:** many modern embedding models are actually fine-tuned decoders, and encoder–decoder models (T5) still exist for translation. The real decision is "do I need vectors or generated text?", then pick by quality on a benchmark like MTEB plus cost.`,
      followUps: [
        {
          q: 'Why not just use the chat LLM to produce embeddings for search?',
          a: 'Generative models are not trained to make similar texts produce close vectors; dedicated embedding models are trained with contrastive objectives for exactly that, and are much cheaper per document.',
        },
        {
          q: 'What does the causal mask actually prevent?',
          a: 'It sets attention scores to future positions to minus infinity before the softmax, so during training a token cannot cheat by reading the token it is supposed to predict.',
        },
      ],
      pitfalls: [
        'Saying encoder-only models can generate fluent chat replies',
        'Ignoring cost per document when indexing millions of chunks',
        'Confusing embedding dimension with context length',
      ],
    },
    {
      id: 'transformers-tokenization-iq-5',
      difficulty: 'expert',
      question: 'A user pastes text containing "<|endoftext|>" and "<|im_start|>system" into your app. One service crashes, and in another the model starts behaving as if it received new instructions. Explain both and harden the pipeline.',
      whatInterviewerLooksFor: [
        'Understands special tokens are control ids distinct from their text spelling',
        'Knows tokenizer libraries reject special tokens in input by default and why',
        'Recognises a prompt-injection / role-spoofing risk',
        'Concrete hardening: encode as plain text, use structured message APIs, validate inputs',
      ],
      modelAnswer: `**What special tokens are.** Besides normal sub-words, a vocabulary has **control tokens**: end-of-text, chat role markers, tool-call delimiters. They are single ids the model was trained to treat as structure ("a new system turn starts here").

**Crash.** tiktoken/js-tiktoken by default **refuse** to encode text containing special-token strings (\`disallowed_special="all"\`): \`e.encode("hi <|endoftext|>")\` throws "The text contains a special token that is not allowed". A service that counts tokens on raw user input without handling that error crashes.

**Behaviour change.** If some code path encodes user text **with special tokens allowed**, or a self-hosted server builds the chat template by **string concatenation**, the user's "<|im_start|>system" becomes a *real* role marker. The model then sees a forged system turn: a role-spoofing **prompt injection**.

**Hardening:**
1. **Use structured message APIs** (\`messages: [{role, content}]\`) and the model's official chat template; never build templates by concatenating raw strings.
2. When tokenizing untrusted text yourself, encode special-token strings **as ordinary text** (e.g. \`disallowed_special=()\` in Python tiktoken) or strip them; never pass \`allowed_special="all"\` on user input.
3. Catch tokenizer errors and return a clean 400 instead of a 500.
4. Add these strings to your injection test suite; also defend in depth with output validation and least-privilege tools (covered in the AI Security topic).`,
      followUps: [
        {
          q: 'Does using a hosted API like OpenAI or Anthropic remove this risk entirely?',
          a: 'It removes the template-splicing risk because the provider applies the chat template and treats your content as text, but plain-language injection ("ignore previous instructions") still works, and your own token-counting code can still crash.',
        },
        {
          q: 'How would you test that your self-hosted vLLM path is safe?',
          a: 'Send content containing each special token of the model\'s template, then inspect the token ids the server produced (or the rendered prompt) and assert the strings were encoded as several normal tokens, not as the single control id.',
        },
      ],
      pitfalls: [
        'Treating "<|endoftext|>" as harmless because it is "just text"',
        'Fixing the crash by allowing all special tokens, which creates the injection',
        'Relying only on a regex blocklist without using structured message APIs',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'transformers-tokenization-est-1',
      question: 'You will summarise 1M support tickets (avg 300 English words each) into ~60-word summaries with an LLM. Estimate total tokens and cost, and how it changes if 30% of tickets are in Hindi.',
      assumptions: [
        '1 English word ≈ 1.33 tokens (≈ 0.75 words per token)',
        'System prompt + instructions: 150 tokens per request',
        'Illustrative price: $0.40 per 1M input tokens, $1.60 per 1M output tokens (small model)',
        'Hindi costs ~1.4× English tokens with an o200k-style tokenizer (measured 10 vs 7 tokens for one sentence)',
      ],
      steps: [
        { label: 'Input tokens per English ticket', calc: '300 words × 1.33 + 150 = 400 + 150 = 550 tokens' },
        { label: 'Output tokens per summary', calc: '60 words × 1.33 ≈ 80 tokens' },
        { label: 'All-English totals', calc: 'input 1M × 550 = 550M tokens; output 1M × 80 = 80M tokens' },
        { label: 'All-English cost', calc: '550 × $0.40 = $220 input + 80 × $1.60 = $128 output = $348' },
        { label: 'Hindi tickets (30%)', calc: '300K × (400 × 1.4 + 150) = 300K × 710 = 213M input; output 300K × 80 × 1.4 = 33.6M' },
        { label: 'English tickets (70%)', calc: '700K × 550 = 385M input; 700K × 80 = 56M output' },
        { label: 'Mixed cost', calc: 'input 598M × $0.40 = $239; output 89.6M × $1.60 = $143; total ≈ $382 (+10%)' },
      ],
      answer: '≈ 630M tokens and ≈ $350 for all-English; ≈ 690M tokens and ≈ $380 with 30% Hindi (about +10%). With the older cl100k tokenizer, Hindi at ~4× would push the total to ≈ $560.',
      insight: 'Input dominates token volume (550 vs 80 per ticket), but output is 4× pricier per token so it is still ~37% of the bill. The tokenizer generation matters more than the language mix: the same Hindi workload costs ~3× more on a 100K vocabulary than on a 200K one, so measure on real samples before committing to a budget.',
      followUps: [
        {
          q: 'How would you cut this cost by half without changing the model?',
          a: 'Use the provider\'s batch API (typically ~50% discount for async jobs), shorten the system prompt, and strip signatures/quoted email history from tickets before sending; quoted threads often double ticket length.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-est-2',
      question: 'A RAG chat endpoint sends a 6,000-token prompt and gets a 500-token answer. Estimate end-to-end latency and find the biggest lever to bring it under 3 seconds.',
      assumptions: [
        'Prefill throughput ≈ 10,000 tokens/s per request on the hosted model',
        'Network + queueing overhead ≈ 300 ms',
        'Decode speed ≈ 70 output tokens/s per stream',
        'Retrieval step (embed query + vector search) ≈ 150 ms',
      ],
      steps: [
        { label: 'Retrieval', calc: '150 ms' },
        { label: 'Prefill (TTFT component)', calc: '6,000 / 10,000 = 0.6 s; TTFT ≈ 0.3 + 0.6 = 0.9 s' },
        { label: 'Decode', calc: '500 / 70 ≈ 7.1 s' },
        { label: 'Total', calc: '0.15 + 0.9 + 7.1 ≈ 8.2 s' },
        { label: 'Halve the prompt (3,000 tokens)', calc: 'prefill 0.3 s → total ≈ 7.9 s (saves 0.3 s)' },
        { label: 'Cap answer at 150 tokens', calc: 'decode 150 / 70 ≈ 2.1 s → total ≈ 0.15 + 0.9 + 2.1 ≈ 3.2 s' },
        { label: 'Both + streaming', calc: 'completion ≈ 2.9 s; user sees first words at ≈ 0.75 s' },
      ],
      answer: '≈ 8 seconds end to end, of which ~7 s (≈ 87%) is generating the 500 output tokens. Capping the answer to ~150 tokens (plus a smaller prompt) brings it to ≈ 3 s, and streaming makes the first words appear in under 1 s.',
      insight: 'Because decode is sequential, output length, not prompt length, dominates latency. Optimising retrieval or trimming the prompt saves hundreds of milliseconds; asking for concise answers saves seconds. Stream to cut perceived latency to TTFT.',
      followUps: [
        {
          q: 'At what prompt size does prefill start to matter as much as decode here?',
          a: 'Prefill equals 500-token decode time (~7 s) at about 70,000 prompt tokens (7 s × 10K tok/s); in practice attention\'s super-linear cost makes very long prompts slower still, so at 50K+ tokens prompt trimming and caching become first-order.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'transformers-tokenization-mcq-01',
      difficulty: 'medium',
      question: 'During pre-training a decoder-only model learns from all positions of a 4,096-token sequence in one pass, yet at inference it produces tokens one at a time. Why the difference?',
      options: [
        'Training uses a different architecture with bidirectional attention that is swapped out at deploy time',
        'In training the full target text is already known, so with a causal mask every position can predict its next token in parallel; at inference the next token does not exist until it is sampled',
        'Inference servers deliberately throttle generation to control cost',
        'Parallel generation is possible but disabled because it lowers accuracy by exactly one token per step',
      ],
      correct: [1],
      explanation: 'Teacher forcing: during training the whole sequence is available, and the causal mask makes each position predict its successor using only earlier tokens, so all predictions are computed together. At inference each new token depends on the previous sampled one, forcing a sequential loop. The architecture is the same in both phases (not swapped), and throttling has nothing to do with it.',
      followUps: [
        {
          q: 'Which inference technique tries to recover some parallelism in decoding?',
          a: 'Speculative decoding: a small draft model proposes several tokens and the large model verifies them in one parallel pass, accepting the matching prefix, which can cut latency 2–3× without changing outputs.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-02',
      difficulty: 'hard',
      question: 'This budget check is used before calling text-embedding-3-small (8,191-token limit). Some documents still fail with a "maximum context length" error. What is the most likely cause?',
      code: {
        language: 'typescript',
        code: `import { getEncoding } from 'js-tiktoken';
const enc = getEncoding('gpt2');           // 50,257-entry vocabulary

function fits(text: string) {
  return enc.encode(text).length <= 8191;
}`,
      },
      options: [
        'The 8,191 limit applies to characters, not tokens',
        'It counts with the GPT-2 tokenizer while the embedding model uses cl100k_base, so counts differ per text and some documents are under-counted',
        'encode() returns bytes instead of token ids, so the count is inflated',
        'The embedding API counts the newline characters twice',
      ],
      correct: [1],
      explanation: 'Each model family has its own vocabulary. GPT-2\'s tokenizer splits text differently from cl100k_base (e.g. whitespace runs and code), so its count can be lower than what the API counts, letting oversized documents through. The limit is in tokens, encode returns token ids, and there is no double-counting of newlines.',
      followUps: [
        {
          q: 'What should the fixed check look like?',
          a: 'Use getEncoding(\'cl100k_base\') (or encodingForModel for the exact model), compare against the limit minus a small margin, and chunk documents that exceed it instead of sending them whole.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-03',
      difficulty: 'hard',
      question: 'Compared with the same information as plain English prose, which inputs will typically need MORE tokens? Select ALL that apply.',
      options: [
        'The same content translated into Hindi',
        'A 2 KB image encoded as a base64 string inside the prompt',
        'The same content with common words written in lowercase instead of Title Case',
        'Pretty-printed JSON with 4-space indentation instead of minified JSON',
      ],
      correct: [0, 1, 3],
      explanation: 'Non-Latin scripts get fewer merges in mostly-English vocabularies, base64 is high-entropy text that BPE compresses poorly (~1 token per 2–3 chars), and indentation whitespace and newlines add tokens (whitespace runs merge, but each line still costs extra). Lowercasing common words generally keeps or reduces token counts, since frequent lowercase forms usually have their own tokens.',
      followUps: [
        {
          q: 'How should you send an image to a multimodal model instead of base64 text in the prompt?',
          a: 'Use the API\'s dedicated image content block (URL or base64 in an image field). The model then encodes it with its vision encoder, priced per image tile, rather than as thousands of text tokens.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-04',
      difficulty: 'hard',
      question: 'A prompt ends with "The best city to visit in France is " (note the trailing space). Completions are noticeably odd compared with the same prompt without the trailing space. Why?',
      options: [
        'Trailing whitespace is stripped by the API, so the model sees an empty prompt',
        'Words are tokenized with their leading space (" Paris"), so after a lone " " token the model must continue with an unusual space-less piece it rarely saw in training',
        'Spaces count as stop sequences by default',
        'The trailing space switches the model into code completion mode',
      ],
      correct: [1],
      explanation: 'BPE vocabularies attach the space to the following word: " Paris" is one token. A prompt ending in a separate " " token forces the model to produce "Paris" without its space, a token sequence that is rare in training, so probabilities get distorted. The API does not strip the space, and spaces are not default stop sequences.',
      followUps: [
        {
          q: 'How do you avoid this class of problem in templates?',
          a: 'Trim trailing whitespace from prompts and prefilled assistant text, and end templates at a natural boundary (a colon or newline) rather than mid-phrase with a dangling space.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-05',
      difficulty: 'expert',
      question: 'A streaming proxy decodes each token id independently and forwards the string. Users of a Hindi chat app see "�" characters that disappear when they reload the full message. What is happening?',
      code: {
        language: 'typescript',
        code: `for await (const tokenId of modelTokenStream) {
  // tokenizer = byte-level BPE (cl100k_base)
  const piece = enc.decode([tokenId]);
  res.write(piece);                    // forward immediately
}`,
      },
      options: [
        'The model generates invalid Unicode under high temperature',
        'With byte-level BPE one character can span several tokens; decoding a token that holds only part of a UTF-8 sequence yields the replacement character, while decoding the whole message joins the bytes correctly',
        'res.write uses Latin-1 encoding by default',
        'The client renders Devanagari fonts lazily',
      ],
      correct: [1],
      explanation: 'Byte-level tokenizers operate on UTF-8 bytes. Many Devanagari characters are 3 bytes and may be split across tokens (cl100k emits several single-byte pieces for Hindi), so decoding each token alone produces "�". The fix is to buffer bytes and emit only complete UTF-8 sequences (e.g. a streaming TextDecoder). Temperature does not create invalid bytes, and res.write defaults to UTF-8.',
      followUps: [
        {
          q: 'Why don\'t you see this with hosted OpenAI or Anthropic streaming?',
          a: 'Their servers buffer partial byte sequences and emit text deltas only at valid character boundaries, so each SSE chunk is valid UTF-8; the problem appears when you decode raw token ids yourself, e.g. with a self-hosted model.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-06',
      difficulty: 'medium',
      question: 'A model has a 128K-token context window. Your request has 125K prompt tokens and max_tokens = 8,000. What is the most robust way to handle this in your app?',
      options: [
        'Send it anyway; the provider automatically compresses the prompt',
        'Lower temperature so the model writes less',
        'Count tokens before sending and trim or summarise the prompt so prompt + max_tokens fits within the window (with a margin)',
        'Split the prompt into two separate API calls and concatenate the answers',
      ],
      correct: [2],
      explanation: 'The window bounds prompt and output together. Depending on the provider you either get a validation error or an answer truncated by the window, so budget explicitly. Providers do not silently compress prompts, temperature does not control length, and two independent calls lose shared context.',
      followUps: [
        {
          q: 'Which content would you trim first?',
          a: 'Lowest-value context first: old conversation turns (summarise them), then lower-ranked retrieved chunks; keep the system prompt, the current question and the top evidence intact.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-07',
      difficulty: 'hard',
      question: 'Which statements about self-attention in a decoder-only LLM are correct? Select ALL that apply.',
      options: [
        'Each token can draw information from any earlier token in the context, however far back',
        'The weights a token puts on other tokens are computed fresh for every input, not fixed after training',
        'The causal mask lets a token attend to the next token only during inference',
        'Doubling the context length roughly quadruples the attention score computations',
      ],
      correct: [0, 1, 3],
      explanation: 'Attention gives direct access to any earlier position; attention weights depend on the current tokens (the learned parts are the projection matrices); and comparing every token with every other grows as n², so 2× length ≈ 4× score computations. The causal mask blocks future tokens in both training and inference; it never allows peeking ahead.',
      followUps: [
        {
          q: 'If attention is quadratic, why do providers offer 1M-token windows?',
          a: 'Kernel optimisations like FlashAttention, KV caching, sparse/sliding-window or grouped-query variants and large GPU clusters make it feasible, but long prompts still cost more and latency rises, so retrieval remains cheaper for most cases.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-08',
      difficulty: 'expert',
      question: 'You are building (a) a duplicate-ticket detector over 5M tickets and (b) an assistant that drafts replies. A teammate proposes one 70B decoder-only chat model for both. What is the strongest objection?',
      options: [
        'Decoder-only models cannot process ticket text longer than 512 tokens',
        'For (a) you need comparable vectors for millions of texts; a small contrastively trained embedding model gives better similarity at a tiny fraction of the cost, while the chat model is suited to (b)',
        'Decoder-only models cannot output text in languages other than English',
        'A 70B model will refuse to process support tickets',
      ],
      correct: [1],
      explanation: 'Duplicate detection is a similarity problem: embedding models (encoder-style or fine-tuned for embeddings) map texts to vectors where cosine similarity reflects meaning, and run in one cheap pass per ticket. Generating with or prompting a 70B model per pair would be orders of magnitude costlier. Context length, language and refusals are not the real issues.',
      followUps: [
        {
          q: 'Where could the large chat model still help in the duplicate detector?',
          a: 'As a final judge on a small set of candidate pairs that the embedding search flagged as near-duplicates, confirming or rejecting matches where precision matters.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-09',
      difficulty: 'hard',
      question: 'This hand-written decoding loop produces the same token over and over regardless of the prompt continuation. What is the bug?',
      code: {
        language: 'python',
        code: `ids = tok("Once upon a time", return_tensors="pt").input_ids
for _ in range(20):
    logits = model(ids).logits          # [1, seq_len, vocab]
    next_id = logits[0, 0].argmax()     # pick next token
    ids = torch.cat([ids, next_id.view(1, 1)], dim=1)
print(tok.decode(ids[0]))`,
      },
      options: [
        'argmax should be replaced by softmax',
        'It reads the logits at position 0 (the prediction after the first token) instead of position -1, so every step repeats the same prediction for "Once"',
        'torch.cat should use dim=0',
        'The model must be called with the attention mask or it returns random logits',
      ],
      correct: [1],
      explanation: 'Position i\'s logits predict token i+1. Because of the causal mask, position 0 only sees "Once", so its prediction never changes as tokens are appended. Use logits[0, -1]. Softmax does not change the argmax, dim=1 is correct for appending along the sequence, and a single unpadded sequence works without an attention mask.',
      followUps: [
        {
          q: 'Why is this loop still slow even after the fix?',
          a: 'It re-runs the full sequence each step. Real generators pass past_key_values (the KV cache) so each step only computes the new token, turning per-step cost from the whole sequence into roughly one token.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-10',
      difficulty: 'expert',
      question: 'A model family moves from a ~100K to a ~200K-token vocabulary. Which consequences are expected? Select ALL that apply.',
      options: [
        'The same multilingual text and code usually needs fewer tokens, lowering cost per request',
        'More content fits into the same context window',
        'The embedding table and output projection get larger, adding parameters and softmax work per step',
        'Token counts become identical across all languages',
      ],
      correct: [0, 1, 2],
      explanation: 'Larger vocabularies let more frequent multi-byte sequences become single tokens, especially for non-English text and code, so sequences shrink and more fits in the window. The cost is a bigger embedding/unembedding matrix (vocab × hidden) and a larger softmax. Languages still differ: Hindi remains ~1.4× English even with o200k.',
      followUps: [
        {
          q: 'Roughly how many parameters does a 200K × 4,096 embedding table add?',
          a: '200,000 × 4,096 ≈ 819M parameters per matrix; if input and output embeddings are untied that doubles to ~1.6B, significant for a small model but minor for a 70B one.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-11',
      difficulty: 'hard',
      question: 'Why does a transformer need positional information (e.g. RoPE) at all?',
      options: [
        'To tell the tokenizer where words begin',
        'Without it, attention treats the input as an unordered set, so "dog bites man" and "man bites dog" would look the same apart from the causal mask',
        'To reduce the vocabulary size',
        'To allow the model to read the context window from right to left',
      ],
      correct: [1],
      explanation: 'Attention compares token vectors by content; nothing in the operation itself encodes order. Positional encodings inject where each token sits so word order changes meaning. The tokenizer works independently of positions, vocabulary size is unaffected, and models still read left to right.',
      followUps: [
        {
          q: 'Why do positional schemes matter for long-context models?',
          a: 'Models generalise poorly to positions beyond what they saw in training; RoPE scaling methods (e.g. YaRN, position interpolation) plus continued training on long sequences are how context windows get extended.',
        },
      ],
    },
    {
      id: 'transformers-tokenization-mcq-12',
      difficulty: 'medium',
      question: 'Your service counts tokens on raw user input with js-tiktoken and occasionally crashes on messages containing "<|endoftext|>". Which responses are appropriate? Select ALL that apply.',
      code: {
        language: 'typescript',
        code: `const n = enc.encode(userText).length;   // throws: "The text contains a special token that is not allowed"`,
      },
      options: [
        'Catch the error and treat the special-token string as ordinary text when counting',
        'Pass allowedSpecial = "all" so user text can contain real control tokens',
        'Send messages through the structured messages API rather than building chat templates by string concatenation',
        'Add such strings to your prompt-injection test cases',
      ],
      correct: [0, 2, 3],
      explanation: 'The library refuses special tokens by default to stop untrusted text becoming control tokens. Counting them as plain text, using structured role-based APIs and testing for injection are correct. Allowing all special tokens on user input converts a crash into a role-spoofing vulnerability.',
      followUps: [
        {
          q: 'How do you count such text as ordinary tokens with Python tiktoken?',
          a: 'Call enc.encode(text, disallowed_special=()) which disables the check and encodes "<|endoftext|>" as several normal sub-word tokens instead of the single control id.',
        },
      ],
    },
  ],
};

export default topic;
