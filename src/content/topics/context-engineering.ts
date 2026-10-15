import type { Topic } from '../../types';

const topic: Topic = {
  id: 'context-engineering',
  phase: 'retrieval',
  order: 5,
  title: 'Context Compression and Context Engineering',
  subtitle: 'Decide exactly which tokens reach the model, in what order, and within what budget',
  estimatedMinutes: 36,
  sources: [
    'Anthropic Engineering (Sep 2025) — Effective context engineering for AI agents',
    'Anthropic docs — Long context prompting tips (put long documents first, the query last)',
    'Anthropic docs — Prompt caching',
    'Liu et al. 2023 (TACL 2024) — Lost in the Middle: How Language Models Use Long Contexts',
    'Jiang et al. 2023 — LLMLingua: Compressing Prompts for Accelerated Inference of LLMs (EMNLP 2023)',
    'Jiang et al. 2023 — LongLLMLingua: Accelerating and Enhancing LLMs in Long Context Scenarios via Prompt Compression',
    'Pan et al. 2024 — LLMLingua-2: Data Distillation for Efficient and Faithful Task-Agnostic Prompt Compression',
    'Xu et al. 2023 — RECOMP: Improving Retrieval-Augmented LMs with Compression and Selective Augmentation',
    'github.com/microsoft/LLMLingua — README and API',
    'LangChain docs — ContextualCompressionRetriever, EmbeddingsFilter, LLMChainExtractor',
  ],
  tags: ['context window', 'compression', 'LLMLingua', 'lost in the middle', 'token budget', 'prompt caching', 'compaction', 'RAG'],
  cheatSheet: [
    'Context engineering = choosing the smallest set of high-signal tokens (instructions, tools, examples, retrieved docs, memory, tool results, history) for each LLM call.',
    'Context rot: recall and reasoning degrade as the window fills, long before the hard limit; more tokens are not free accuracy.',
    'Lost in the middle (Liu et al. 2023): accuracy is U-shaped by position; put the best evidence first or last, never buried in the middle.',
    'Anthropic long-context tip: long documents at the top, the question at the end; stable prefix first so prompt caching can hit.',
    'Budget every slot (system, tools, docs, memory, history, output reserve) and enforce it in code with a tokenizer, not by hope.',
    'Compression ladder: dedupe → drop low-score chunks → extractive sentence filtering → token-level (LLMLingua-2) → abstractive summary.',
    'LLMLingua reports up to ~20x compression; LongLLMLingua +21.4% on NaturalQuestions with ~1/4 tokens; LLMLingua-2 is 3–6x faster than LLMLingua.',
    'Never compress numbers, IDs, code or quoted policy text lossily; force-keep them or switch to extractive compression.',
    'Agents: compaction (summarise and restart the window), tool-result clearing, structured notes outside the window, sub-agents that return condensed summaries.',
    'Measure it: answer accuracy and faithfulness versus tokens-per-request on a golden set, before and after every context change.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Context Compression — fewer tokens, same answer',
      body: `Retrieval often hands you 20 chunks × 500 tokens = 10K tokens, while the answer depends on maybe 300 of them. **Context compression** removes what the model does not need, the way a good analyst highlights three sentences in a 40-page report before a meeting.

**Four families, from cheapest to most aggressive:**

| Method | How | Typical reduction | Risk |
|---|---|---|---|
| Chunk filtering | drop chunks below a rerank/similarity threshold, dedupe near-duplicates | 30–60% | low |
| Extractive | keep only sentences relevant to the query (embedding filter or LLM extractor) | 2–5x | medium: loses connective context |
| Token-level | a small LM drops low-information tokens (LLMLingua, LongLLMLingua, LLMLingua-2) | 2–20x | text becomes ungrammatical, numbers can be lost |
| Abstractive | an LLM summarises docs for this query (RECOMP-style) | 5–10x | hallucinated summary, extra LLM call |

LLMLingua uses a small model's perplexity to drop predictable tokens; LLMLingua-2 reframes it as token classification distilled from GPT-4 and runs 3–6x faster. LongLLMLingua makes compression **question-aware** and reports up to 21.4% better accuracy on NaturalQuestions with about a quarter of the tokens, partly because it fights "lost in the middle".

**When to use it:** long retrieved contexts, high-QPS endpoints where input tokens dominate cost, and agents whose tool outputs (HTML, logs, JSON) are bloated. Skip it when the context is already under ~2K tokens: the compressor's latency then costs more than it saves.`,
      example: `Query: "What is the refund window for damaged items?" Retrieval returns 12 chunks, **6,400 tokens**.

1. Rerank threshold 0.3 keeps 5 chunks → **2,700 tokens**.
2. Embedding sentence filter (cosine ≥ 0.55 to the query) keeps 9 sentences → **410 tokens**, including "Damaged items may be returned within 30 days of delivery with photo evidence."
3. Answer: "30 days from delivery, with photos" with the same answer and citation as the uncompressed run.

Cost at an illustrative $3 per 1M input tokens and 200K queries/day: 6,400 → 410 tokens saves about 1.2B tokens/day ≈ **$3,600/day**. TTFT also drops by roughly 300 ms because prefill is shorter.`,
      diagram: `query ──► retriever ──► 12 chunks (6.4K tok)
                             │
                     ┌───────▼────────┐  drop score < 0.3, dedupe
                     │ chunk filter   │──► 5 chunks (2.7K)
                     └───────┬────────┘
                     ┌───────▼────────┐  keep sentences similar to query
                     │ extractive     │──► 9 sentences (410)
                     └───────┬────────┘
                     ┌───────▼────────┐  optional: LLMLingua-2 rate=0.5
                     │ token-level    │──► ~220 tok
                     └───────┬────────┘
                             ▼
                    prompt = instructions + compressed docs + question`,
      code: [
        {
          language: 'python',
          title: 'Question-aware token compression with LLMLingua-2',
          code: `# pip install llmlingua
from llmlingua import PromptCompressor

# LLMLingua-2: token classifier (keep / drop) distilled from GPT-4 labels
compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
    use_llmlingua2=True,
    device_map="cpu",            # "cuda" if available; a GPU makes this ~10x faster
)

chunks = [
    "Damaged items may be returned within 30 days of delivery with photo evidence.",
    "Our company was founded in 2009 and now ships to 41 countries worldwide.",
    "Refunds are issued to the original payment method within 5-7 business days.",
]

result = compressor.compress_prompt(
    chunks,
    rate=0.5,                       # target: keep ~50% of tokens
    force_tokens=["\\n", "?", "."],  # never drop structure-bearing tokens
    drop_consecutive=True,           # collapse runs of forced tokens
)

print(result["origin_tokens"], "->", result["compressed_tokens"])
print(result["compressed_prompt"])  # feed this to the LLM in place of the raw chunks`,
        },
      ],
      prosCons: {
        pros: [
          'Cuts input-token cost and prefill latency, often 3–10x on RAG prompts.',
          'Removes distractors, which can raise accuracy (less noise, less lost-in-the-middle).',
          'Lets you retrieve more candidates (higher recall) and still fit a fixed budget.',
        ],
        cons: [
          {
            con: 'Token-level compression can delete digits, units or negations ("not"), silently flipping the answer.',
            fix: 'Pass force_tokens / protected spans for numbers, IDs and negations, or use extractive (sentence-level) compression for policy, legal and financial text.',
          },
          {
            con: 'The compressor adds latency (an LLM summariser can add 1–3 s) and its own cost.',
            fix: 'Use a small local model (LLMLingua-2, a MiniLM sentence filter), compress only when context exceeds a threshold (e.g. > 3K tokens), and cache compressed chunks per (query-cluster, chunk) pair.',
          },
          {
            con: 'Citations break because the compressed text no longer matches the source verbatim.',
            fix: 'Keep a chunk-id map through compression and cite the original chunk; render quotes from the source, not the compressed text.',
          },
        ],
      },
      keyPoints: [
        'Compress in a ladder: filter chunks, then sentences, then tokens; stop as soon as you fit the budget.',
        'Question-aware compression (LongLLMLingua, embedding filters) beats question-agnostic compression for RAG.',
        'Protect numbers, negations, IDs and code from lossy compression.',
        'Skip compression for short contexts: its latency only pays off on long prompts.',
        'Validate on a golden set: tokens saved versus accuracy and faithfulness delta.',
      ],
      exercise: {
        prompt: `Build \`compressContext(query, chunks, budgetTokens)\` that does **extractive** compression:

- split each chunk into sentences;
- score every sentence by cosine similarity to the query embedding;
- keep the highest-scoring sentences until \`budgetTokens\` is reached (estimate tokens as \`Math.ceil(chars / 4)\`);
- **always keep sentences that contain a digit** if their score ≥ 0.3 (numbers matter);
- return kept sentences **in their original document order**, grouped by chunk id, so the text still reads naturally.`,
        starter: {
          language: 'typescript',
          code: `type Chunk = { id: string; text: string };
declare function embed(texts: string[]): Promise<number[][]>; // unit-normalised vectors

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const tokens = (s: string) => Math.ceil(s.length / 4);

export async function compressContext(query: string, chunks: Chunk[], budgetTokens: number) {
  // TODO 1: split chunks into sentences, remembering chunk id and position
  // TODO 2: embed query + sentences, score each sentence
  // TODO 3: pick digit-bearing sentences (score >= 0.3) first, then the best by score, within budget
  // TODO 4: restore original order and join per chunk
  return '';
}`,
        },
        hints: [
          'Split with a regex such as /(?<=[.!?])\\s+/ and keep { chunkId, pos, text } objects.',
          'Embed the query and all sentences in one batch call: embed([query, ...sentences]).',
          'After selection, sort by (chunk index, pos) before joining; emit "[chunkId] sentence sentence".',
        ],
        solution: {
          language: 'typescript',
          code: `type Chunk = { id: string; text: string };
declare function embed(texts: string[]): Promise<number[][]>;

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const tokens = (s: string) => Math.ceil(s.length / 4);

type Sent = { ci: number; pos: number; text: string; score: number };

export async function compressContext(query: string, chunks: Chunk[], budgetTokens: number) {
  const sents: Sent[] = [];
  chunks.forEach((c, ci) =>
    c.text.split(/(?<=[.!?])\\s+/).forEach((text, pos) => {
      if (text.trim()) sents.push({ ci, pos, text: text.trim(), score: 0 });
    }),
  );
  const [qv, ...sv] = await embed([query, ...sents.map((s) => s.text)]); // one batched call
  sents.forEach((s, i) => (s.score = cos(qv, sv[i])));

  const hasDigit = (s: Sent) => /\\d/.test(s.text) && s.score >= 0.3;
  // digit-bearing sentences first, then everything else by score
  const ranked = [...sents].sort(
    (a, b) => Number(hasDigit(b)) - Number(hasDigit(a)) || b.score - a.score,
  );

  const kept: Sent[] = [];
  let used = 0;
  for (const s of ranked) {
    const t = tokens(s.text);
    if (used + t > budgetTokens) continue; // skip, a shorter one may still fit
    kept.push(s);
    used += t;
  }

  kept.sort((a, b) => a.ci - b.ci || a.pos - b.pos); // original reading order
  const byChunk = new Map<number, string[]>();
  for (const s of kept) byChunk.set(s.ci, [...(byChunk.get(s.ci) ?? []), s.text]);
  return [...byChunk].map(([ci, ss]) => '[' + chunks[ci].id + '] ' + ss.join(' ')).join('\\n\\n');
}`,
        },
        explanation:
          'Extractive compression never rewrites text, so citations and numbers stay exact. Prioritising digit-bearing sentences protects facts that a pure similarity score can under-rank. Restoring original order keeps the result readable, and the chunk-id prefix keeps citations traceable.',
      },
      quickCheck: {
        question:
          'After adding LLMLingua-style token compression at rate 0.25, accuracy on "how many days…" questions drops sharply while other questions are fine. What is the most likely cause?',
        options: [
          'The embedding model was changed by the compressor',
          'Low-perplexity digits and units were dropped as "predictable" tokens',
          'The LLM context window was exceeded',
          'Compression reordered the chunks alphabetically',
        ],
        correct: 1,
        explanation:
          'Token-level compressors drop tokens the small LM finds predictable or unimportant, and numbers and units are a classic casualty at aggressive rates. Protect them with force_tokens or use sentence-level compression. The window cannot be exceeded because the prompt got smaller, and compression does not touch embeddings.',
      },
      source: 'Jiang et al. 2023 (LLMLingua, LongLLMLingua); Pan et al. 2024 (LLMLingua-2)',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Context Engineering — what goes in the window, in what order, within what budget',
      body: `A prompt is one message; **context** is everything the model sees on a call: system instructions, tool definitions, few-shot examples, retrieved documents, memory, tool results and conversation history. Anthropic calls context engineering curating "the optimal set of tokens" for each call. Think of it as packing a carry-on bag: you have a fixed space, so everything in it must earn its place.

**Why it matters:** models suffer **context rot**, where recall falls as the window fills. Liu et al. (2023) found accuracy is **U-shaped by position**: facts at the start or end of the context are used far better than facts in the middle.

**A practical layout (top → bottom):**

| Slot | Budget (128K window) | Notes |
|---|---|---|
| System instructions + rules | 1–3K | stable, so cache it |
| Tool definitions | 1–5K | only the tools this step needs |
| Long reference docs | 5–60K | Anthropic tip: long documents first, query last |
| Memory / user profile | 0.5–2K | retrieved, not dumped |
| Conversation history | 2–10K | summarise older turns (compaction) |
| Tool results | ≤ 5K each | truncate or summarise before inserting |
| Question + output format | small | last, closest to generation |
| Output reserve | 2–8K | never let input eat it |

**Ordering rules:** stable before volatile (prompt caching needs an identical prefix); the best evidence first or last; the question at the end.

**For agents:** compaction (summarise and restart the window), clearing old tool results, structured notes kept outside the window, and sub-agents that return condensed summaries.`,
      example: `A support copilot on a 200K-token model was sending **92K tokens** per turn: 40 tools (11K), the full 30-turn history (38K), 25 chunks (36K) and raw CRM JSON (7K). Accuracy on the golden set was 71%; p50 TTFT was 4.1 s.

After context engineering:
- tools routed to the 6 relevant ones: **2K**;
- history = last 4 turns + a 300-token summary: **3K**;
- reranked top 6 chunks, best first: **4.5K**;
- CRM JSON projected to 8 fields: **0.4K**.

Total **~11K tokens** (−88%), accuracy **83%**, p50 TTFT **1.2 s**, and the cached system+tools prefix gets cache hits on most turns.`,
      diagram: `┌──────────────── context window (budgeted) ─────────────────┐
│ [cached prefix]  system rules · tool schemas · examples    │ stable
│ ─────────────────────────────────────────────────────────  │
│ reference docs  (best chunk FIRST ... 2nd best LAST)       │
│ memory: user profile, prior decisions (retrieved)          │
│ history: summary of old turns + last N turns verbatim      │
│ tool results: trimmed / projected JSON                     │ volatile
│ QUESTION + output format  ◄── closest to generation        │
├────────────────────────────────────────────────────────────┤
│ output reserve (max_tokens)                                │
└────────────────────────────────────────────────────────────┘
 accuracy by position:  high ▔▔╲____________╱▔▔ high  (U-shape)`,
      code: [
        {
          language: 'typescript',
          title: 'Budgeted context builder with a cached stable prefix (Anthropic Messages API)',
          code: `import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';
const tok = (s: string) => Math.ceil(s.length / 4); // rough estimate; use count_tokens for exact numbers

type Doc = { id: string; text: string; score: number };

// Take items in priority order until the slot budget is used up
function fit<T>(items: T[], text: (t: T) => string, budget: number): T[] {
  const out: T[] = [];
  let used = 0;
  for (const it of items) {
    const t = tok(text(it));
    if (used + t > budget) break;
    out.push(it);
    used += t;
  }
  return out;
}

export async function answer(q: string, rules: string, docs: Doc[], historySummary: string, lastTurns: string) {
  const ranked = fit([...docs].sort((a, b) => b.score - a.score), (d) => d.text, 6000);
  // Fight "lost in the middle": best at the start, second best at the end
  const ordered = ranked.length > 2 ? [ranked[0], ...ranked.slice(2), ranked[1]] : ranked;
  const docBlock = ordered.map((d) => '<doc id="' + d.id + '">' + d.text + '</doc>').join('\\n');

  return client.messages.create({
    model: MODEL,
    max_tokens: 1024, // output reserve
    // Stable prefix first, marked cacheable
    system: [{ type: 'text', text: rules, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content:
        '<documents>\\n' + docBlock + '\\n</documents>\\n' +
        '<history_summary>' + historySummary.slice(0, 1200) + '</history_summary>\\n' +
        '<recent_turns>' + lastTurns + '</recent_turns>\\n' +
        'Question (answer only from the documents, cite doc ids): ' + q,
    }],
  });
}`,
        },
      ],
      prosCons: {
        pros: [
          'Higher accuracy: less distraction and no buried evidence.',
          'Lower cost and TTFT: often a 5–10x token reduction on agent and RAG turns.',
          'Predictable behaviour: explicit budgets stop one huge tool result from evicting the instructions.',
          'Cache-friendly: a stable prefix ordering gives prompt-cache hits on repeated calls.',
        ],
        cons: [
          {
            con: 'Aggressive trimming can drop the one fact the answer needs (for example, a constraint from turn 3).',
            fix: 'Keep pinned facts (user constraints, decisions) in a structured memory slot that is never trimmed, and summarise older turns instead of deleting them.',
          },
          {
            con: 'Hand-tuned budgets go stale when the model, tools or documents change.',
            fix: 'Version the context config and run a golden-set eval (accuracy and tokens) in CI whenever the budgets or ordering change.',
          },
          {
            con: 'Dynamic content placed early (a timestamp, user name) breaks prompt caching.',
            fix: 'Put everything volatile after the cached breakpoint; keep system, tools and examples byte-identical across calls.',
          },
          {
            con: 'Char/4 token estimates drift for code, JSON and non-English text, which leads to overflow errors.',
            fix: 'Use the provider token counter (Anthropic count_tokens, tiktoken for OpenAI) for the final check and keep a 5–10% safety margin.',
          },
        ],
      },
      keyPoints: [
        'Context = instructions + tools + examples + docs + memory + history + tool results; budget each slot.',
        'Order: stable then volatile; best evidence at the edges; question last.',
        'More context is not better: context rot and lost-in-the-middle are real.',
        'Agents need compaction, tool-result clearing, external notes and sub-agents.',
        'Treat context configs like code: version them and eval them.',
      ],
      exercise: {
        prompt: `Write \`buildContext(slots, windowTokens, outputReserve)\` where each slot is \`{ name, priority, minTokens, maxTokens, items: string[] }\` (items already sorted best first).

Acceptance criteria:
- the total never exceeds \`windowTokens - outputReserve\`;
- each slot first receives up to its \`minTokens\`, in priority order (1 = highest);
- leftover budget is then handed out by priority, up to each slot's \`maxTokens\`;
- whole items only (never cut an item in half); tokens ≈ \`Math.ceil(chars / 4)\`;
- return \`{ name, items, tokens }[]\` in the **original slot order** (layout order), not priority order.`,
        starter: {
          language: 'typescript',
          code: `type Slot = { name: string; priority: number; minTokens: number; maxTokens: number; items: string[] };
const tok = (s: string) => Math.ceil(s.length / 4);

export function buildContext(slots: Slot[], windowTokens: number, outputReserve: number) {
  let remaining = windowTokens - outputReserve;
  // TODO pass 1: guarantee minimums by priority
  // TODO pass 2: distribute leftovers by priority up to maxTokens
  // TODO: return in layout order
  return [] as { name: string; items: string[]; tokens: number }[];
}`,
        },
        hints: [
          'Keep per-slot state: { taken: string[], used: number, next: index of next item }.',
          'Write one helper take(state, cap) that adds whole items while used + t ≤ cap and t ≤ remaining.',
          'Run take with cap = minTokens for every slot by priority, then again with cap = maxTokens.',
        ],
        solution: {
          language: 'typescript',
          code: `type Slot = { name: string; priority: number; minTokens: number; maxTokens: number; items: string[] };
const tok = (s: string) => Math.ceil(s.length / 4);

export function buildContext(slots: Slot[], windowTokens: number, outputReserve: number) {
  let remaining = windowTokens - outputReserve;
  const state = slots.map((s) => ({ slot: s, taken: [] as string[], used: 0, next: 0 }));
  const byPriority = [...state].sort((a, b) => a.slot.priority - b.slot.priority);

  const take = (st: (typeof state)[number], cap: number) => {
    while (st.next < st.slot.items.length) {
      const t = tok(st.slot.items[st.next]);
      if (st.used + t > cap || t > remaining) break; // whole items only
      st.taken.push(st.slot.items[st.next]);
      st.used += t;
      remaining -= t;
      st.next++;
    }
  };

  for (const st of byPriority) take(st, st.slot.minTokens); // pass 1: minimums
  for (const st of byPriority) take(st, st.slot.maxTokens); // pass 2: leftovers

  // layout order = original slot order (system, tools, docs, memory, history, question)
  return state.map((st) => ({ name: st.slot.name, items: st.taken, tokens: st.used }));
}`,
        },
        explanation:
          'Two passes guarantee every slot a floor (the question and instructions are never starved), then spend leftovers where they matter most. Separating priority (who gets budget) from layout order (where it sits in the prompt) is the key context-engineering idea: retrieval docs may be lower priority than instructions but still sit above the question.',
      },
      quickCheck: {
        question:
          'You append the current timestamp and user name to the top of the system prompt "for personalisation". Prompt-cache hit rate falls from 85% to about 0%. Why?',
        options: [
          'Caches expire whenever the user name changes in the conversation history',
          'Prompt caching matches an exact prefix, and the volatile text now sits inside that prefix',
          'Timestamps are tokenised into too many tokens for the cache',
          'Personalised prompts are excluded from caching by policy',
        ],
        correct: 1,
        explanation:
          'Prompt caches key on an identical prefix up to the breakpoint. Any byte that changes per request inside that prefix forces a miss. Move volatile data after the cached block, near the end of the context.',
      },
      source: 'Anthropic Engineering 2025 — Effective context engineering for AI agents; Liu et al. 2023 — Lost in the Middle',
    },
  ],
  codeChallenges: [
    {
      id: 'context-engineering-cc-1',
      title: 'The context stuffer: everything, in any order, no budget',
      context:
        'A RAG endpoint concatenates every retrieved chunk, the entire chat history and the question into one prompt. It works in demos, then production logs show 400 "prompt too long" errors per day, a $40K monthly bill, and answers that ignore the best chunk.',
      task: 'Make it production-grade: rank and cap documents, keep the question last, summarise old history, reserve output tokens and fail gracefully when the budget cannot be met.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();

export async function ask(question: string, chunks: string[], history: string[]) {
  const prompt =
    'Question: ' + question + '\\n' +
    'History: ' + history.join('\\n') + '\\n' +
    'Context: ' + chunks.join('\\n');   // 20-60 chunks, unsorted
  const res = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}`,
      },
      hints: [
        'Sort chunks by score and fill a fixed doc budget; drop the rest.',
        'Replace old history with a short summary and keep only the last few turns verbatim.',
        'Put instructions in the system message and the question at the very end; set max_completion_tokens.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const openai = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
const tok = (s: string) => Math.ceil(s.length / 4);

type Chunk = { id: string; text: string; score: number };
const BUDGET = { window: 128_000, output: 2_000, docs: 6_000, history: 2_000 };

function fill<T>(items: T[], text: (t: T) => string, budget: number) {
  const out: T[] = [];
  let used = 0;
  for (const it of items) {
    const t = tok(text(it));
    if (used + t > budget) continue;
    out.push(it);
    used += t;
  }
  return out;
}

export async function ask(question: string, chunks: Chunk[], history: string[], summary: string) {
  const docs = fill([...chunks].sort((a, b) => b.score - a.score), (c) => c.text, BUDGET.docs);
  if (!docs.length) return { answer: "I couldn't find this in the knowledge base.", sources: [] };

  const recent = fill([...history].reverse(), (h) => h, BUDGET.history).reverse(); // newest turns that fit
  const user =
    '<documents>\\n' + docs.map((d) => '<doc id="' + d.id + '">' + d.text + '</doc>').join('\\n') + '\\n</documents>\\n' +
    '<conversation_summary>' + summary.slice(0, 2000) + '</conversation_summary>\\n' +
    '<recent_turns>\\n' + recent.join('\\n') + '\\n</recent_turns>\\n' +
    'Question: ' + question; // question LAST

  if (tok(user) > BUDGET.window - BUDGET.output) throw new Error('context budget exceeded');

  const res = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: BUDGET.output, // reserve room for the answer
    messages: [
      { role: 'system', content: 'Answer only from <documents>. Cite doc ids like [id]. If the answer is not there, say so.' },
      { role: 'user', content: user },
    ],
  });
  return { answer: res.choices[0].message.content, sources: docs.map((d) => d.id) };
}`,
      },
      explanation:
        'The fixed version budgets every slot, so prompts cannot overflow and cost becomes predictable (~10K tokens instead of 30–90K). Ranking before filling means the best evidence always survives, and placing it first while the question goes last avoids lost-in-the-middle. History is summarised plus a recent window, the system message carries stable rules, which also helps prompt caching, and an empty-retrieval guard stops ungrounded answers.',
      followUps: [
        {
          q: 'How would you choose the 6,000-token document budget instead of guessing?',
          a: 'Sweep the budget (2K, 4K, 6K, 10K, 20K) on a golden set and plot accuracy and faithfulness against cost and latency. Pick the knee of the curve, where extra tokens stop improving accuracy, then re-run the sweep whenever the model or corpus changes.',
        },
        {
          q: 'Where would you put the summary-generation call, and how do you keep it cheap?',
          a: 'Run it asynchronously after each turn (or every N turns) with a small model, store the rolling summary with the session, and only re-summarise when the unsummarised tail exceeds a threshold. The request path then just reads the stored summary, adding no latency.',
        },
      ],
    },
    {
      id: 'context-engineering-cc-2',
      title: 'Agent drowning in its own tool results',
      context:
        'An agent loop appends every raw tool result (full HTML pages, 5K-line logs, giant JSON) to messages. After about 12 steps it hits the context limit, forgets the original task and starts repeating tool calls.',
      task: 'Add context hygiene: truncate or project tool results, clear stale results, compact history when near the limit, and keep the original task pinned.',
      starter: {
        language: 'typescript',
        code: `type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };
declare function callLLM(msgs: Msg[]): Promise<{ done: boolean; text: string; tool?: { name: string; args: unknown } }>;
declare function runTool(name: string, args: unknown): Promise<string>;

export async function agent(task: string) {
  const msgs: Msg[] = [{ role: 'user', content: task }];
  for (let step = 0; step < 50; step++) {
    const r = await callLLM(msgs);
    if (r.done) return r.text;
    msgs.push({ role: 'assistant', content: r.text });
    msgs.push({ role: 'tool', content: await runTool(r.tool!.name, r.tool!.args) }); // raw, unbounded
  }
}`,
      },
      hints: [
        'Cap each tool result (for example 2K tokens) and keep head + tail plus a note saying what was cut.',
        'Replace tool results older than K steps with a one-line stub; the agent can re-run the tool if it needs them.',
        'When the total exceeds ~70% of the window, summarise everything except the pinned task and the last few messages.',
      ],
      solution: {
        language: 'typescript',
        code: `type Msg = { role: 'user' | 'assistant' | 'tool'; content: string; step?: number };
declare function callLLM(msgs: Msg[]): Promise<{ done: boolean; text: string; tool?: { name: string; args: unknown } }>;
declare function runTool(name: string, args: unknown): Promise<string>;
declare function summarize(msgs: Msg[]): Promise<string>; // small, cheap model

const tok = (s: string) => Math.ceil(s.length / 4);
const WINDOW = 200_000, COMPACT_AT = 0.7, TOOL_CAP = 2_000, KEEP_RECENT_TOOL_STEPS = 3;

function capResult(s: string): string {
  if (tok(s) <= TOOL_CAP) return s;
  const keep = TOOL_CAP * 2; // chars for head and for tail (~TOOL_CAP tokens in total)
  return s.slice(0, keep) + '\\n...[truncated ' + (tok(s) - TOOL_CAP) + ' tokens]...\\n' + s.slice(-keep);
}

export async function agent(task: string, maxSteps = 50) {
  const pinned: Msg = { role: 'user', content: '<task>' + task + '</task>' }; // never trimmed
  let msgs: Msg[] = [];
  for (let step = 0; step < maxSteps; step++) {
    // 1. clear stale tool results (keep a stub so the model knows the call happened)
    msgs = msgs.map((m) =>
      m.role === 'tool' && step - (m.step ?? 0) > KEEP_RECENT_TOOL_STEPS
        ? { ...m, content: '[old tool result cleared; re-run the tool if needed]' }
        : m,
    );
    // 2. compact when near the limit
    const total = [pinned, ...msgs].reduce((s, m) => s + tok(m.content), 0);
    if (total > WINDOW * COMPACT_AT) {
      const recent = msgs.slice(-4);
      const summary = await summarize(msgs.slice(0, -4));
      msgs = [{ role: 'user', content: '<progress_notes>' + summary + '</progress_notes>' }, ...recent];
    }
    const r = await callLLM([pinned, ...msgs]);
    if (r.done) return r.text;
    msgs.push({ role: 'assistant', content: r.text, step });
    const raw = await runTool(r.tool!.name, r.tool!.args);
    msgs.push({ role: 'tool', content: capResult(raw), step }); // 3. bounded tool output
  }
  throw new Error('agent exceeded max steps');
}`,
      },
      explanation:
        'Three layers of hygiene keep the window healthy. Capping tool results stops one call from evicting everything. Clearing stale results (the lightest form of compaction) keeps the model focused on recent evidence. Summarising into progress notes when the window is 70% full keeps the run going. The pinned task block guarantees the goal never scrolls away, which fixes the "forgot the task, repeats calls" failure.',
      followUps: [
        {
          q: 'Head+tail truncation still loses the key line buried in the middle of a log. What is better?',
          a: 'Make the tool smarter rather than the truncation: return structured, filtered results (grep for ERROR, project JSON fields, paginate) or store the full output in a file or scratchpad and give the agent a handle plus a search tool to fetch slices just in time.',
        },
        {
          q: 'How do you check that compaction is not losing critical state?',
          a: 'Replay recorded long trajectories with and without compaction and compare task success. Also probe summaries with questions about earlier decisions, and keep decisions, constraints and open TODOs in a structured note schema rather than free text.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'context-engineering-iq-1',
      difficulty: 'hard',
      question:
        'Your team moved from a 32K to a 1M-token model and now puts the entire knowledge base in the prompt. Accuracy went down and cost went up 20x. Explain why and what you would do.',
      whatInterviewerLooksFor: [
        'Knows context rot and lost-in-the-middle: long context does not mean equal attention to every token',
        'Quantifies cost and latency (prefill scales with input tokens)',
        'Proposes retrieval + reranking + budgets rather than stuffing',
        'Mentions where long context is genuinely useful (whole-document reasoning, caching static corpora)',
        'Proposes measuring with a golden set',
      ],
      modelAnswer: `**Why accuracy fell**
- **Context rot:** recall degrades as the window fills; a 1M window is a ceiling, not a guarantee of equal attention.
- **Lost in the middle:** the relevant passage is now one of thousands, usually mid-context, where models use information worst.
- **Distractors:** near-miss documents (old policy versions, similar products) compete with the right one.

**Why cost exploded**
Input tokens are billed per call: 600K tokens × 50K calls/day = 30B tokens/day. Prefill latency also grows, so TTFT rises from under a second to tens of seconds.

**What I would do**
1. Put retrieval back in: hybrid search → rerank → top 5–20 chunks, a 4–8K document budget.
2. Order the context: rules (cached) → best evidence first and last → question last.
3. Use long context selectively: for tasks needing a whole document (contract comparison), send that document only, cached with prompt caching.
4. Route: a cheap classifier decides between "retrieve 10 chunks" and "load the full document".
5. Measure: run the golden set at 4K, 16K, 64K and full context; plot accuracy against cost and pick the knee.

**Outcome to expect:** RAG with budgets usually matches or beats full stuffing at 1–5% of the cost.`,
      followUps: [
        {
          q: 'When is putting a whole corpus in context actually the right call?',
          a: 'When the corpus is small and static (say < 100K tokens), questions need cross-document synthesis, and prompt caching makes repeated prefixes cheap. Examples: a single codebase module, a product manual, a contract set reviewed in one session.',
        },
        {
          q: 'How does prompt caching change this analysis?',
          a: 'Cached reads cost a fraction of the base input price (around 10% on Anthropic) and cut prefill latency, so a stable large prefix becomes affordable. It does not fix context rot or lost-in-the-middle, so accuracy still needs testing.',
        },
      ],
      pitfalls: [
        'Assuming a bigger window means the model "reads everything equally"',
        'Ignoring prefill latency and per-call input cost',
        'Proposing a fix without a measurement plan',
      ],
    },
    {
      id: 'context-engineering-iq-2',
      difficulty: 'medium',
      question:
        'Design the context layout for a customer-support copilot: what goes into the window, in what order, and with what budgets?',
      context: 'Model with a 128K window; average answer 300 tokens; 15 tools; a knowledge base of 20K articles; user profiles and ticket history in a CRM.',
      whatInterviewerLooksFor: [
        'Lists every slot: instructions, tools, examples, docs, memory, history, tool results, question',
        'Assigns explicit budgets and an output reserve',
        'Orders stable → volatile for caching and puts the question last',
        'Handles tool selection and history summarisation',
      ],
      modelAnswer: `**Slots and budgets (~12K target, far below 128K on purpose)**

| Order | Slot | Budget | Policy |
|---|---|---|---|
| 1 | System rules, tone, refusal policy | 1.5K | static, cached |
| 2 | Tool schemas | 2K | route to the 4–6 relevant tools of 15 |
| 3 | 2–3 canonical examples | 1K | static, cached |
| 4 | KB articles | 5K | hybrid + rerank, top 5, best first, 2nd best last |
| 5 | Customer memory | 0.8K | plan, region, open tickets (projected fields) |
| 6 | Conversation | 2K | rolling summary + last 4 turns |
| 7 | Tool results | ≤ 2K each | projected JSON, not raw payloads |
| 8 | Current question + output format | 0.3K | always last |
| — | Output reserve | 1K | max_tokens |

**Principles**
- **Stable first** so the cached prefix (1–3) hits on every turn.
- **Relevance over volume:** reranked, deduplicated articles with ids for citation.
- **Memory is retrieved, not dumped:** only fields relevant to the intent.
- **Guards:** if retrieval confidence is low, say so or escalate instead of padding context.

**Measurement:** golden set of 300 tickets; track resolution accuracy, citation faithfulness, tokens per turn and TTFT for each layout change.`,
      followUps: [
        {
          q: 'How do you choose which 4–6 tools to include?',
          a: 'Use an intent classifier or embedding similarity between the query and tool descriptions to pick tools, always include a small core set (search, escalate), and log tool-selection misses to tune the router.',
        },
        {
          q: 'The customer mentioned a constraint 20 turns ago that the summary dropped. Fix?',
          a: 'Extract durable facts (constraints, preferences, decisions) into a structured pinned-memory slot that is updated each turn and never summarised away, separate from the free-text conversation summary.',
        },
        {
          q: 'Why not simply use all 128K tokens?',
          a: 'More tokens raise cost and TTFT linearly while accuracy typically falls from distraction and lost-in-the-middle; a smaller, high-signal context usually wins on both quality and cost.',
        },
      ],
      pitfalls: [
        'Including all 15 tool schemas on every call',
        'No output-token reserve, so long contexts truncate answers',
        'Placing volatile data before the cacheable prefix',
      ],
    },
    {
      id: 'context-engineering-iq-3',
      difficulty: 'hard',
      question:
        'Product wants to cut LLM cost by 60% on a RAG endpoint without hurting quality. Walk through how you would use context compression to do it.',
      whatInterviewerLooksFor: [
        'Profiles where tokens go before choosing a technique',
        'Uses the compression ladder (filter → extract → token-level → abstractive)',
        'Knows LLMLingua-family trade-offs and protects numbers and citations',
        'Defines quality guardrails and an eval plan',
      ],
      modelAnswer: `**1. Profile first.** Log tokens per slot. Typical finding: retrieved docs are 70–80% of input, history 10–15%, instructions 5%.

**2. Cheapest wins first**
- **Fewer, better chunks:** add a reranker and keep the top 5 instead of 15; often −50% tokens and better accuracy.
- **Dedupe** near-identical chunks (versions, boilerplate headers).
- **Prompt caching** for the static prefix (not compression, but a direct cost cut).

**3. Extractive compression.** Sentence-level filtering by query similarity or a small extractor model gives 2–4x on long chunks and keeps the text verbatim for citations.

**4. Token-level compression (LLMLingua-2)** only for long, prose-heavy contexts; target rate 0.4–0.5, \`force_tokens\` for digits, negations and ids. LLMLingua-2 runs on a small encoder, so overhead is tens of ms on a GPU.

**5. Abstractive summaries** only for history (rolling summary), not for evidence.

**Guardrails**
- Golden set of 300–500 questions: accuracy, faithfulness, citation precision.
- Ship behind a flag, A/B on live traffic, and roll back if faithfulness drops by more than 1 pt.

**Expected result:** reranking + dedupe + caching usually delivers most of the 60%; compression covers the rest.`,
      followUps: [
        {
          q: 'Why not jump straight to LLMLingua at rate 0.2?',
          a: 'Aggressive token-level compression risks dropping numbers and negations and makes citations unverifiable. Cheaper structural fixes (reranking, dedupe, caching) carry less risk and often deliver most of the savings, so they come first.',
        },
        {
          q: 'How do you compute the break-even point of an LLM-based compressor?',
          a: 'Saved cost = tokens removed × main-model input price; added cost = compressor tokens × compressor price plus its latency. It pays off only when the main model is much pricier than the compressor and contexts are long enough that removed tokens greatly exceed what the compressor reads.',
        },
      ],
      pitfalls: [
        'Compressing before profiling where tokens actually go',
        'Lossy-compressing tables, numbers or legal text',
        'No faithfulness metric, only cost',
      ],
    },
    {
      id: 'context-engineering-iq-4',
      difficulty: 'expert',
      question:
        'A long-running coding agent degrades after about 40 steps: it repeats searches, forgets constraints and contradicts earlier decisions. Diagnose and redesign its context management.',
      whatInterviewerLooksFor: [
        'Identifies context rot from unbounded tool output and history',
        'Knows compaction, tool-result clearing, structured note-taking and sub-agents',
        'Separates durable state (decisions, TODOs) from transient state',
        'Has a way to evaluate long-horizon behaviour',
      ],
      modelAnswer: `**Diagnosis**
- Tool outputs (file contents, test logs) dominate the window; by step 40 the original task and early decisions are tens of thousands of tokens back, in the attention dead zone.
- The window may also be hitting limits, forcing naive truncation that drops the oldest messages, which hold the task statement.
- No durable record of decisions, so the agent rediscovers and contradicts them.

**Redesign**
1. **Pinned header:** the task, acceptance criteria and constraints always sit at the top of the context.
2. **Structured notes** kept outside the window (NOTES.md or a memory tool): decisions, files touched, open TODOs, dead ends. They are re-injected (≤ 1.5K tokens) every step.
3. **Tool-result hygiene:** cap outputs, return projections (grep hits, failing test names), and clear results older than N steps, leaving stubs.
4. **Compaction:** at ~70% of the window, summarise the trajectory into the notes schema and restart the window with header + notes + last few turns.
5. **Sub-agents** for exploration: "find where auth tokens are refreshed" runs in a fresh context and returns a 300-token summary with file paths.
6. **Just-in-time retrieval:** keep file paths and handles, not file contents.

**Evaluation:** a suite of long-horizon tasks; measure success rate, repeated tool calls, and constraint violations before and after.`,
      followUps: [
        {
          q: 'What goes wrong if compaction summaries are free text?',
          a: 'Summaries drift and drop specifics (exact file names, rejected approaches). A fixed schema (decisions, constraints, files, TODOs, dead ends) with an append-only decisions list keeps critical state stable across compactions.',
        },
        {
          q: 'When are sub-agents a bad idea?',
          a: 'When subtasks are tightly coupled and need shared fine-grained state, such as editing the same file. Each sub-agent re-reads context, so total tokens can rise 3–10x; use them for parallel, separable exploration, not for sequential edits.',
        },
      ],
      pitfalls: [
        'Simply buying a bigger context window',
        'Truncating from the start of history, which drops the task statement',
        'Keeping decisions only in free-text conversation',
      ],
    },
    {
      id: 'context-engineering-iq-5',
      difficulty: 'medium',
      question:
        'Explain "lost in the middle" and how it should change the way you order retrieved chunks in a RAG prompt.',
      whatInterviewerLooksFor: [
        'Accurately describes the U-shaped accuracy curve from Liu et al.',
        'Gives concrete ordering strategies (best first/last, fewer chunks)',
        'Knows that reranking + small K reduces the problem more than clever ordering',
        'Mentions that newer models are better but not immune, so it should be measured',
      ],
      modelAnswer: `**The finding.** Liu et al. (2023) put the answer-bearing document at different positions among 10–30 distractors in multi-document QA. Accuracy was highest when it sat **at the beginning or end** and dropped markedly in the middle, in some settings below the closed-book baseline. Extended-context models showed the same U-shape.

**Why it happens (intuition):** attention favours the most recent tokens (near the question) and the earliest tokens (primacy, attention sinks); the middle gets less effective weight.

**What to do in RAG**
1. **Fewer chunks:** rerank and keep 5–10 high-precision chunks; less middle to get lost in.
2. **Edge placement:** best chunk first, second-best last (just before the question), weaker ones in the middle. LangChain's \`LongContextReorder\` does this.
3. **Question placement:** put the question after the documents (and optionally restate it before them as well).
4. **Structure:** wrap each chunk in tags with ids and titles so the model can locate and cite them.
5. **Measure:** run a position sweep on your own golden set with your model, since newer models flatten the curve to different degrees.`,
      followUps: [
        {
          q: 'Does lost in the middle still matter for 2026 frontier models?',
          a: 'The effect is weaker for frontier models on simple retrieval (needle tests are near-perfect), but multi-fact reasoning over long, distractor-heavy contexts still degrades. The answer is to measure on your own task rather than assume.',
        },
        {
          q: 'How would you implement edge ordering for chunks sorted by score?',
          a: 'Alternate placement: walk the score-sorted list and put items alternately at the front and the back, so the top two land at the two edges and the lowest-scoring ones end up in the centre.',
        },
      ],
      pitfalls: [
        'Claiming models ignore the middle entirely',
        'Fixing ordering while still sending 50 chunks',
        'Putting the question before 20K tokens of documents with no restatement',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'context-engineering-est-1',
      question:
        'A RAG endpoint serves 300K queries/day with 9K input tokens per call. Estimate the monthly input-token cost, then the savings from reranking to 3K tokens plus caching a 1.5K static prefix.',
      assumptions: [
        'Illustrative price: $3 per 1M input tokens; cached reads cost 10% of the base price',
        'Prefix of 1.5K tokens (system + tools) is identical on every call with a 90% cache hit rate',
        '30 days per month; output tokens ignored (unchanged)',
      ],
      steps: [
        { label: 'Baseline tokens/day', calc: '300K × 9K = 2.7B tokens/day' },
        { label: 'Baseline cost/month', calc: '2.7B × $3 / 1M = $8,100/day × 30 ≈ $243K/month' },
        { label: 'After reranking: tokens/call', calc: '1.5K prefix + 1.5K docs/history/question = 3K' },
        { label: 'Cached prefix effective tokens', calc: '1.5K × (0.9 × 0.1 + 0.1 × 1) = 1.5K × 0.19 ≈ 285 billed-equivalent tokens' },
        { label: 'Effective tokens/call', calc: '285 + 1.5K ≈ 1.79K' },
        { label: 'New cost/month', calc: '300K × 1.79K = 537M/day × $3/1M ≈ $1.6K/day × 30 ≈ $48K/month' },
      ],
      answer: 'About $243K/month falls to about $48K/month, an ~80% reduction (cache-write surcharges ignored for simplicity).',
      insight:
        'Shrinking the volatile part (better retrieval) gives the largest absolute savings; caching then makes the stable prefix almost free. Do both before reaching for lossy compression.',
      followUps: [
        {
          q: 'What if cache hit rate falls to 30% because of low traffic per tenant?',
          a: 'The prefix effective cost becomes 1.5K × (0.3 × 0.1 + 0.7 × 1) ≈ 1.1K tokens, so a call costs about 2.6K effective tokens and the month about $70K. Still a big win, but you might share prefixes across tenants or keep traffic warm within the cache TTL.',
        },
      ],
    },
    {
      id: 'context-engineering-est-2',
      question:
        'Is it worth adding an LLMLingua-2 compressor on a GPU in front of a premium model? Contexts average 12K tokens, compression rate 0.4, 100K requests/day.',
      assumptions: [
        'Main model illustrative price: $10 per 1M input tokens',
        'Compressor: one L4-class GPU at ~$0.80/hour handles ~40 requests/s of 12K tokens with batching',
        'Compression rate 0.4 means 40% of tokens are kept (12K → 4.8K)',
        'Prefill for the main model takes ~0.1 ms per input token (illustrative)',
      ],
      steps: [
        { label: 'Tokens removed/day', calc: '100K × (12K − 4.8K) = 720M tokens/day' },
        { label: 'Savings/day', calc: '720M × $10 / 1M = $7,200/day' },
        { label: 'Compressor capacity needed', calc: '100K/day ≈ 1.2 req/s average, ~5 req/s peak → 1 GPU (plus 1 for HA)' },
        { label: 'Compressor cost/day', calc: '2 GPUs × $0.80 × 24 h ≈ $38/day' },
        { label: 'Latency', calc: 'Compressor ~50–150 ms added vs prefill saved 7.2K × 0.1 ms ≈ 720 ms → net faster' },
      ],
      answer: 'Yes: about $7.2K/day saved for about $38/day of GPU, and TTFT likely improves, provided accuracy holds on the golden set.',
      insight:
        'Compression economics depend on the price gap between the compressor and the main model and on context length. With premium models and long contexts it is a clear win; with cheap models and short contexts it rarely is.',
      followUps: [
        {
          q: 'How does the answer change for a cheap model at $0.15 per 1M input tokens and 2K contexts?',
          a: 'Tokens removed fall to 100K × 1.2K = 120M/day, worth only $18/day, less than the GPU cost, and the latency gain is small. Skip compression and rely on reranking and caching instead.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'context-engineering-mcq-01',
      difficulty: 'medium',
      question:
        'A RAG prompt holds 20 reranked chunks. Which placement of the two highest-scoring chunks best accounts for the "lost in the middle" effect?',
      options: [
        'Both in positions 10 and 11, the centre of the list, so they are surrounded by context',
        'Best chunk first and second-best last, just before the question',
        'Both at the very end after the question, so they are freshest',
        'Random shuffle each request to average out position bias',
      ],
      correct: [1],
      explanation:
        'Accuracy is U-shaped by position: the start and end of the context are used best. Putting the top two at the edges exploits both. The centre is the worst spot; after the question breaks the "question last" convention; random shuffling just adds variance without fixing the bias.',
      followUps: [
        {
          q: 'What matters more than clever ordering?',
          a: 'Sending fewer, higher-precision chunks via reranking. With 5 chunks there is little middle to get lost in, and fewer distractors compete for attention.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-02',
      difficulty: 'medium',
      question: 'Which items belong in a context-engineering budget for a single agent step? Select ALL that apply.',
      options: [
        'Tool definitions the model can call this step',
        'Results returned by tools on earlier steps',
        'A reserve for the model output (max tokens)',
        'The embedding model dimensions used to index the corpus',
      ],
      correct: [0, 1, 2],
      explanation:
        'Tool schemas, prior tool results and the output reserve all consume the same window and must be budgeted. Embedding dimensions affect the vector index, not the LLM context window.',
      followUps: [
        {
          q: 'Which of these is most often forgotten, and what breaks?',
          a: 'The output reserve. Inputs grow until the answer gets truncated mid-sentence or the API rejects the request because input plus max_tokens exceeds the window.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-03',
      difficulty: 'hard',
      question: 'This builder is used with Anthropic prompt caching. Cache hits are almost zero. What is the bug?',
      code: {
        language: 'typescript',
        code: `const system = [
  { type: 'text', text: 'Now: ' + new Date().toISOString() + '\\n' + RULES,
    cache_control: { type: 'ephemeral' } },
];
const messages = [{ role: 'user', content: docs + '\\n\\nQuestion: ' + q }];
await client.messages.create({ model: MODEL, max_tokens: 800, system, messages });`,
      },
      options: [
        'cache_control must be set on the user message, not on system',
        'The timestamp makes the cached prefix different on every request',
        'max_tokens is too low for caching to activate',
        'Caching only works when docs come before the system prompt',
      ],
      correct: [1],
      explanation:
        'Prompt caching needs a byte-identical prefix up to the breakpoint. A per-request timestamp at the start of the system text changes the prefix every call. Move volatile data after the cached block. Caching system blocks is valid, and max_tokens has nothing to do with caching.',
      followUps: [
        {
          q: 'Where should the timestamp go if the model needs it?',
          a: 'In the user message after the cached content (for example, a <now> tag next to the question), or rounded to the day and placed after the stable rules, so the large prefix stays identical.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-04',
      difficulty: 'hard',
      question:
        'You apply token-level compression (rate 0.33) to a pricing FAQ. Which failures should you expect and guard against? Select ALL that apply.',
      options: [
        'Dropped digits or currency units changing quoted prices',
        'Dropped negations such as "not" or "except" reversing a rule',
        'Citations no longer matching the source text verbatim',
        'The vector index needing to be rebuilt after compression',
      ],
      correct: [0, 1, 2],
      explanation:
        'Token-level compressors remove tokens judged low-information, which can include digits, units and negations, and the output is no longer verbatim, which breaks quote-level citations. Compression happens at prompt time on retrieved text, so the index is untouched.',
      followUps: [
        {
          q: 'What is the safer alternative for this FAQ?',
          a: 'Extractive compression: select whole relevant sentences or rows verbatim, or protect numbers and negations with force_tokens. Price tables should be passed intact.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-05',
      difficulty: 'hard',
      question:
        'An agent truncates history from the oldest message when it nears the window limit. After many steps it starts solving a different problem. What is the best fix?',
      options: [
        'Truncate from the newest messages instead',
        'Pin the task and constraints in a block that is never trimmed, and compact older steps into a summary',
        'Increase temperature so the agent explores more',
        'Remove the system prompt to free space',
      ],
      correct: [1],
      explanation:
        'Oldest-first truncation eventually deletes the task statement, so the agent drifts. Pinning the task and summarising (compacting) older steps keeps the goal and key decisions while freeing space. Dropping newest messages loses current state; temperature and removing rules make things worse.',
      followUps: [
        {
          q: 'What should a compaction summary contain?',
          a: 'Decisions made, constraints, files or entities touched, open TODOs and dead ends tried, in a fixed schema so later compactions do not silently drop them.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-06',
      difficulty: 'hard',
      question:
        'Doubling top-K from 10 to 20 chunks (8K → 16K tokens) lowered answer accuracy on your golden set. Which explanations are plausible? Select ALL that apply.',
      options: [
        'Extra chunks are mostly distractors that compete with the right evidence',
        'The relevant chunk now sits further into the middle of the context',
        'The model\'s maximum output length was reduced by the longer input',
        'Near-duplicate or outdated versions of documents introduced conflicts',
      ],
      correct: [0, 1, 3],
      explanation:
        'More low-precision chunks add distractors and conflicting versions and push evidence into the middle where it is used less well. Output length is set by max_tokens and only constrained if input plus output exceeds the window, which 16K does not.',
      followUps: [
        {
          q: 'How would you get the recall benefit of K=20 without the accuracy loss?',
          a: 'Retrieve 20–50 for recall, rerank with a cross-encoder, then send the top 5–8 to the LLM, optionally with a score threshold.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-07',
      difficulty: 'hard',
      question: 'What does this ordering function produce for chunks already sorted by score [A, B, C, D, E] (A best)?',
      code: {
        language: 'typescript',
        code: `function reorder<T>(sorted: T[]): T[] {
  const front: T[] = [];
  const back: T[] = [];
  sorted.forEach((c, i) => (i % 2 === 0 ? front.push(c) : back.unshift(c)));
  return [...front, ...back];
}`,
      },
      options: ['[A, B, C, D, E]', '[A, C, E, D, B]', '[E, C, A, B, D]', '[B, D, A, C, E]'],
      correct: [1],
      explanation:
        'Even indexes (A, C, E) go to the front in order; odd indexes (B, D) are unshifted onto the back, giving [D, B], so the result is [A, C, E, D, B]. The best (A) is first and the second-best (B) is last, with the weakest (E) in the middle: edge placement against lost-in-the-middle.',
      followUps: [
        {
          q: 'Which LangChain utility implements this idea?',
          a: 'LongContextReorder, a document transformer that places the most relevant documents at the beginning and end of the list and the least relevant in the middle.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-08',
      difficulty: 'expert',
      question:
        'An LLM-based abstractive compressor (summarise each chunk for the query) improved token cost by 6x, but faithfulness scores fell. What is the most likely mechanism?',
      options: [
        'Summaries shift the embedding distribution, so retrieval fails',
        'The summariser introduces paraphrases and unsupported claims that the answer model then treats as evidence',
        'Summaries are too short for the model to read',
        'Compression increases lost-in-the-middle effects',
      ],
      correct: [1],
      explanation:
        'Abstractive compression rewrites evidence; any hallucination or over-generalisation by the summariser becomes "source" for the final answer, and faithfulness checks against the original documents fail. Retrieval happens before compression, and shorter contexts reduce, not increase, lost-in-the-middle.',
      followUps: [
        {
          q: 'How can you keep the savings but restore faithfulness?',
          a: 'Switch to extractive compression (verbatim sentences), or check each summary for entailment against its source chunk and fall back to the original chunk when the check fails.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-09',
      difficulty: 'expert',
      question:
        'This budget check sometimes lets a request through that the API then rejects for exceeding the context window. Which issues explain it? Select ALL that apply.',
      code: {
        language: 'typescript',
        code: `const est = (s: string) => Math.ceil(s.length / 4);
const total = est(system) + est(docs) + est(history) + est(question);
if (total < WINDOW) {
  await client.messages.create({ model: MODEL, max_tokens: 4096, system, messages, tools });
}`,
      },
      options: [
        'max_tokens (the output reserve) is not subtracted from WINDOW',
        'Tool schemas are sent but not counted',
        'chars/4 underestimates tokens for code, JSON and non-English text',
        'Math.ceil rounds the estimate up, which causes overflow',
      ],
      correct: [0, 1, 2],
      explanation:
        'The check ignores the output reserve and the tool definitions, and the chars/4 heuristic can undercount by 30–100% for code, JSON and CJK text. Rounding up makes the estimate more conservative, not less. Use the provider token counter plus a safety margin.',
      followUps: [
        {
          q: 'What is a robust version of the check?',
          a: 'Count tokens with the provider endpoint (Anthropic count_tokens or tiktoken) including tools and system, then require input + max_tokens ≤ window × 0.95, trimming the lowest-priority slot until it fits.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-10',
      difficulty: 'hard',
      question:
        'Your lead agent delegates "survey the codebase for all uses of the payments API" to a sub-agent. What is the main context-engineering benefit?',
      options: [
        'The sub-agent shares the lead agent\'s window, so it sees everything',
        'The exploration happens in a clean, separate window and only a condensed summary returns to the lead agent',
        'Sub-agents use fewer tokens in total than a single agent',
        'Sub-agents remove the need for tool definitions',
      ],
      correct: [1],
      explanation:
        'Sub-agents isolate heavy exploration (many file reads) in their own window and return a short summary, keeping the lead agent\'s context focused. They often use more total tokens, not fewer, and they still need tools.',
      followUps: [
        {
          q: 'What should the sub-agent\'s return format look like?',
          a: 'A short structured result such as file paths, line ranges, one-line findings and confidence, capped at a few hundred tokens, so the lead can fetch details just in time.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-11',
      difficulty: 'medium',
      question:
        'For a 60K-token contract plus a question, which layout matches Anthropic\'s long-context guidance?',
      options: [
        'Question first, then the contract, so the model knows what to look for',
        'Contract first (wrapped in document tags), question and instructions at the end',
        'Contract split in half with the question in the middle',
        'Only the question; let the model call a tool to fetch the contract later',
      ],
      correct: [1],
      explanation:
        'Anthropic recommends placing long documents at the top and the query at the end, reporting quality gains of up to about 30% on complex multi-document inputs. Question-first can help as an extra restatement, but the main question belongs last. Splitting the document around the question buries content.',
      followUps: [
        {
          q: 'How could you further help the model on this contract?',
          a: 'Ask it to first extract relevant clauses into quote tags, then answer from those quotes, which focuses attention and makes citations checkable.',
        },
      ],
    },
    {
      id: 'context-engineering-mcq-12',
      difficulty: 'expert',
      question:
        'Which practices reduce context rot in a 200-step research agent while keeping needed information reachable? Select ALL that apply.',
      options: [
        'Store full web pages in a scratch store and keep only URLs plus 2-line notes in context',
        'Periodically compact the trajectory into a structured progress note and restart the window',
        'Append every raw tool output so nothing is ever lost',
        'Clear tool results older than a few steps, leaving stubs that say the tool can be re-run',
      ],
      correct: [0, 1, 3],
      explanation:
        'Just-in-time handles, compaction and tool-result clearing all keep the window small while preserving access to information. Appending every raw output is exactly what causes context rot and limit errors.',
      followUps: [
        {
          q: 'What is the risk of clearing tool results, and how do you mitigate it?',
          a: 'The agent may need an old result and waste steps re-fetching it. Mitigate by noting key extracted facts in the progress notes before clearing, and by keeping stubs that name the tool and arguments for a cheap re-run.',
        },
      ],
    },
  ],
};

export default topic;
