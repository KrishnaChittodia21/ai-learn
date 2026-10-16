import type { Topic } from '../../types';

const topic: Topic = {
  id: 'genai-fundamentals',
  phase: 'foundations',
  order: 1,
  title: 'GenAI & LLM Fundamentals',
  subtitle: 'What generative AI is, how an LLM turns a prompt into text one token at a time, and the knobs you control',
  estimatedMinutes: 36,
  sources: [
    'Vaswani et al. 2017 — Attention Is All You Need (arXiv:1706.03762)',
    'Brown et al. 2020 — Language Models are Few-Shot Learners (GPT-3, arXiv:2005.14165)',
    'Holtzman et al. 2020 — The Curious Case of Neural Text Degeneration (nucleus / top-p sampling, arXiv:1904.09751)',
    'Ouyang et al. 2022 — Training language models to follow instructions with human feedback (InstructGPT)',
    'Anthropic docs — Messages API, models overview, context windows',
    'OpenAI docs — Text generation, reasoning models, Chat Completions / Responses API',
    'Kaplan et al. 2020 / Hoffmann et al. 2022 — scaling laws (Chinchilla)',
    'digitalapplied.com (Sep 2026) — Which AI models still accept temperature (reasoning models ignore/reject sampling params)',
  ],
  tags: ['genai', 'llm', 'tokens', 'temperature', 'top-p', 'context-window', 'hallucination', 'beginner'],
  cheatSheet: [
    'Generative AI **creates** new content (text, code, images, audio) by sampling from a learned distribution; classic ML mostly **classifies or predicts** a label/number.',
    'An LLM is a next-token predictor: given tokens so far it outputs a probability for every token in its vocabulary (~100K–260K tokens), picks one, appends it, repeats.',
    'Training stages: pre-training (trillions of tokens of web/code, learns language + facts) → instruction tuning (SFT) → preference tuning (RLHF/DPO) → optional reasoning RL.',
    '1 token ≈ 4 English characters ≈ 0.75 words; 1,000 words ≈ 1,300–1,400 tokens. Pricing, limits and latency are all in tokens.',
    'Context window = input + output tokens the model can see in one call (128K–1M+ in 2026). The model has **no memory** between calls: you resend history every time.',
    'Temperature rescales logits (0 ≈ greedy/near-deterministic, 1 = model distribution, >1 = more random); top-p keeps the smallest set of tokens whose probabilities sum to p. Tune one, not both.',
    'Many reasoning models fix sampling params (reject or ignore temperature/top_p) and expose a reasoning-effort knob instead — check the model docs.',
    'Hallucination = fluent but false output; it is a property of sampling plausible text, not a bug you patch once. Mitigate with grounding (RAG), citations, tools and validation.',
    'Cost ≈ input_tokens × input_price + output_tokens × output_price; output tokens are typically 3–5× pricier and dominate latency (generated sequentially).',
    'Pick the smallest model that passes your eval; use GenAI where fuzzy language understanding/generation is the job, plain code where rules are exact.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'GenAI Fundamentals — what generative AI is and where it fits',
      body: `**Intuition:** classic machine learning is a *judge* ("is this email spam? yes/no"). Generative AI is an *author*: it produces brand-new content (a reply, a SQL query, an image) that resembles the data it learned from.

**Mechanics.** A generative model learns a probability distribution over data. At run time you give it a *condition* (a prompt) and it **samples** an output from that distribution. Different families do this differently:

| Family | Generates | How | Examples |
|---|---|---|---|
| Large language models (LLMs) | text, code, JSON | predict next token, repeat | Claude, GPT, Gemini, Llama, Qwen |
| Diffusion models | images, video, audio | start from noise, denoise step by step | Stable Diffusion, Imagen, Sora-style video |
| Multimodal models | text from images/audio (and back) | shared token space for many modalities | vision-language models, speech models |

**What changed** (2020→2026): one *foundation model* pre-trained on a huge corpus can do thousands of tasks with just a prompt — no task-specific training. Your job shifts from "train a model" to "design the prompt, context, tools and checks around a model".

**When to use GenAI:** the input or output is messy natural language (summarise, extract, draft, translate, answer questions over docs, write code), or rules would be too many to hand-write. **When not to:** exact arithmetic, deterministic business rules, strict latency budgets under ~50 ms, or anything where a regex / SQL query / classic classifier is cheaper and provably correct. A good mental model: GenAI is a brilliant but sometimes over-confident intern — fast and broad, but you verify its work.`,
      example: `**Task:** route 10,000 support emails/day.

- *Classic ML approach:* label 5,000 emails into 8 categories, train a classifier → returns \`"billing"\` with 0.93 confidence. Good, but it can't explain itself or draft a reply.
- *GenAI approach:* prompt an LLM with the email + category list → returns \`{"category":"billing","summary":"Customer double-charged £49.99 on 3 March","draft_reply":"Hi Sam, sorry about the duplicate charge…"}\`.

Numbers: average email ~300 tokens + 400-token instruction = 700 input tokens; output ~150 tokens. At an illustrative $1 / 1M input and $5 / 1M output that is 10,000 × (700×1 + 150×5) / 1M ≈ **$14.50/day**. Many teams keep the cheap classifier for routing and use the LLM only for the summary + draft — the hybrid usually wins.`,
      diagram: `  Traditional ML (discriminative)        Generative AI
  ------------------------------         ------------------------------
   input ──► [model] ──► label/score      prompt ──► [model] ──► NEW content
   "email" ─►  spam? ─► 0.97             "summarise this" ─► "The customer…"

  GenAI families
  +-------------+   +----------------+   +----------------------+
  |    LLMs     |   |   Diffusion    |   |     Multimodal       |
  | next token  |   | denoise noise  |   | text<->image/audio   |
  +-------------+   +----------------+   +----------------------+
         \\                 |                       /
          +---- foundation model, steered by a prompt ----+`,
      code: [
        {
          language: 'typescript',
          title: 'Your first GenAI call — summarise + classify in one prompt',
          code: `import OpenAI from 'openai';

// Model id comes from config so the snippet does not go stale
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';
const client = new OpenAI(); // reads OPENAI_API_KEY from the environment

async function triage(email: string) {
  const response = await client.responses.create({
    model: MODEL,
    // "instructions" plays the role of a system prompt
    instructions:
      'You triage support emails. Reply with JSON only: ' +
      '{"category": one of billing|bug|feature|other, "summary": string (max 20 words)}',
    input: email,
  });

  // output_text concatenates all text output items
  const raw = response.output_text;
  console.log('tokens used:', response.usage?.input_tokens, '+', response.usage?.output_tokens);
  return JSON.parse(raw) as { category: string; summary: string };
}

triage('Hi, I was charged twice for my March subscription (49.99 each). Please refund one.')
  .then(console.log)
  .catch(console.error);`,
        },
      ],
      prosCons: {
        pros: [
          'One general model handles many tasks (summarise, extract, translate, code) with only a prompt — no labelled training data.',
          'Handles messy, open-ended language that rule-based systems cannot.',
          'Very fast to prototype: a working feature in hours instead of a multi-week ML project.',
        ],
        cons: [
          {
            con: 'Outputs can be confidently wrong (hallucinations).',
            fix: 'Ground answers in retrieved documents (RAG), ask for citations, and validate outputs with code or a second check before acting on them.',
          },
          {
            con: 'Non-deterministic: the same prompt can give different answers.',
            fix: 'Use low temperature where supported, structured outputs with a schema, and evaluate on a fixed test set rather than eyeballing single runs.',
          },
          {
            con: 'Per-call cost and latency are much higher than a classic model or a rule.',
            fix: 'Use a hybrid: cheap rules/classifiers for the easy 80%, smallest capable LLM for the rest; cache repeated prompts.',
          },
          {
            con: 'Knowledge is frozen at the training cutoff and excludes your private data.',
            fix: 'Inject fresh/private facts at request time via RAG or tool calls instead of hoping the model knows them.',
          },
        ],
      },
      keyPoints: [
        'Generative = creates new content; discriminative = picks a label or number.',
        'Foundation models are steered by prompts, not retrained per task.',
        'LLMs (text), diffusion (images/video) and multimodal models are the three families you will meet.',
        'Use GenAI for fuzzy language work; use plain code for exact rules and maths.',
        'Treat output as a draft from a smart intern: verify before you trust.',
      ],
      exercise: {
        prompt: `Write \`shouldUseLLM(task)\` that applies a simple decision rubric and returns \`"llm"\`, \`"code"\` or \`"hybrid"\`.

**Acceptance criteria**
- \`task\` has booleans: \`naturalLanguageInput\`, \`exactAnswerRequired\`, \`latencyBudgetMs\` (number), \`openEndedOutput\`.
- Return \`"code"\` if an exact answer is required and input is not natural language, or the latency budget is under 50 ms.
- Return \`"llm"\` if input is natural language and output is open-ended and no exact answer is required.
- Otherwise return \`"hybrid"\`.
- Print the result for 3 sample tasks: tax calculation, drafting a support reply, extracting an invoice total from a PDF email.`,
        starter: {
          language: 'typescript',
          code: `type Task = {
  name: string;
  naturalLanguageInput: boolean;
  exactAnswerRequired: boolean;
  latencyBudgetMs: number;
  openEndedOutput: boolean;
};

function shouldUseLLM(task: Task): 'llm' | 'code' | 'hybrid' {
  // TODO: rule 1 — exact + structured input, or tight latency => code
  // TODO: rule 2 — NL input + open-ended output + no exact answer => llm
  // TODO: otherwise hybrid
  return 'hybrid';
}

const tasks: Task[] = [
  // TODO: add the three sample tasks
];
for (const t of tasks) console.log(t.name, '=>', shouldUseLLM(t));`,
        },
        hints: [
          'Check the "code" conditions first — they are hard constraints.',
          'Extracting an invoice total has natural-language input but needs an exact answer: that is the classic hybrid (LLM extracts, code validates).',
          'Drafting a reply: NL input, open-ended output, no single exact answer.',
        ],
        solution: {
          language: 'typescript',
          code: `type Task = {
  name: string;
  naturalLanguageInput: boolean;
  exactAnswerRequired: boolean;
  latencyBudgetMs: number;
  openEndedOutput: boolean;
};

function shouldUseLLM(task: Task): 'llm' | 'code' | 'hybrid' {
  // Hard constraints first: exact answers on structured data, or tight latency
  if ((task.exactAnswerRequired && !task.naturalLanguageInput) || task.latencyBudgetMs < 50) {
    return 'code';
  }
  // Fuzzy in, fuzzy out: this is what LLMs are for
  if (task.naturalLanguageInput && task.openEndedOutput && !task.exactAnswerRequired) {
    return 'llm';
  }
  // Fuzzy input but exact output: LLM extracts, code validates
  return 'hybrid';
}

const tasks: Task[] = [
  { name: 'tax calculation', naturalLanguageInput: false, exactAnswerRequired: true, latencyBudgetMs: 100, openEndedOutput: false },
  { name: 'draft support reply', naturalLanguageInput: true, exactAnswerRequired: false, latencyBudgetMs: 5000, openEndedOutput: true },
  { name: 'invoice total from email', naturalLanguageInput: true, exactAnswerRequired: true, latencyBudgetMs: 3000, openEndedOutput: false },
];
for (const t of tasks) console.log(t.name, '=>', shouldUseLLM(t));
// tax calculation => code
// draft support reply => llm
// invoice total from email => hybrid`,
        },
        explanation:
          'The rubric encodes the core judgement of this section: LLMs shine when both input and output are fuzzy language. When the input is fuzzy but the answer must be exact (an invoice total), use the LLM as an extractor and let deterministic code validate (e.g. totals add up, currency is valid).',
      },
      quickCheck: {
        question: 'A bank wants to compute monthly interest on 2M accounts using a fixed formula. Which approach fits best?',
        options: [
          'An LLM, because it can explain each calculation in plain English',
          'Plain code, because the rule is exact and must be reproducible',
          'A diffusion model fine-tuned on past statements',
          'An LLM at temperature 0, because that makes it deterministic and exact',
        ],
        correct: 1,
        explanation:
          'Exact, rule-based, auditable maths is a job for code. Temperature 0 reduces randomness but does not make an LLM an exact calculator — it can still mis-add digits. An LLM could at most explain the result afterwards.',
      },
      source: 'Bommasani et al. 2021 — On the Opportunities and Risks of Foundation Models',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'LLM Fundamentals — tokens, next-token prediction, context windows and sampling',
      body: `**Intuition:** an LLM is autocomplete on a planetary scale. It reads your text as **tokens** (word pieces), predicts a probability for every possible next token, picks one, appends it, and repeats until it emits a stop token or hits \`max_tokens\`.

**How it got smart.** (1) *Pre-training*: predict the next token over trillions of tokens of web, books and code → learns grammar, facts and reasoning patterns. (2) *Instruction tuning (SFT)*: train on prompt→ideal-answer pairs so it follows instructions. (3) *Preference tuning (RLHF/DPO)*: humans or AI rank answers so it becomes helpful and safe. Newer *reasoning* models add RL that rewards correct step-by-step thinking.

**Key run-time concepts**

| Concept | What it means | Typical value |
|---|---|---|
| Token | ~4 English chars / 0.75 words | 1,000 words ≈ 1,350 tokens |
| Context window | max input + output tokens per call | 128K–1M+ |
| \`max_tokens\` | cap on generated tokens | 256–8K for chat |
| Temperature | divides logits before softmax; lower = sharper | 0–1 (default often 1) |
| Top-p | sample only from the top tokens summing to p | 0.9–1.0 |

**Statelessness:** the model remembers nothing between calls. A "chat" is your app resending the whole conversation every turn, so long chats cost more and eventually overflow the window.

**When to tune what:** use temperature ≈ 0–0.3 for extraction/classification, 0.7–1.0 for brainstorming; change temperature *or* top-p, not both. Many 2026 reasoning models fix these and expose a *reasoning effort* setting instead — sending temperature may be ignored or rejected.`,
      example: `Prompt: **"The capital of France is"**. The model's top next-token probabilities (logits → softmax):

| Token | T = 1.0 | T = 0.5 | T = 2.0 |
|---|---|---|---|
| " Paris" | 0.80 | 0.98 | 0.54 |
| " a" | 0.10 | 0.015 | 0.19 |
| " located" | 0.06 | 0.005 | 0.15 |
| " the" | 0.04 | 0.002 | 0.12 |

Lower temperature squashes the tail (Paris almost always); higher temperature flattens it (odd continuations appear). With **top-p = 0.9** at T = 1.0, the model keeps " Paris" + " a" (0.80 + 0.10 = 0.90), renormalises to 0.89 / 0.11 and samples only from those two. A 20-turn chat of ~300 tokens per turn resends ~6,000 tokens on turn 20 — the bill grows with every turn.`,
      diagram: `  "The capital of France is"
          │ tokenizer
          ▼
  [The][ capital][ of][ France][ is]   ← token ids
          │
          ▼
  +----------------------+      logits for ~200K vocab tokens
  |   Transformer (LLM)  | ───► softmax(logits / temperature)
  +----------------------+            │ top-p / top-k filter
          ▲                           ▼
          │                    sample → " Paris"
          └──── append token, repeat until <stop> or max_tokens

  |<------------------ context window (e.g. 200K) ------------------>|
  | system prompt | chat history | retrieved docs | question | output |`,
      code: [
        {
          language: 'typescript',
          title: 'Temperature + top-p sampling from scratch (no API needed)',
          code: `// Toy logits for the next token after "The capital of France is"
const logits: Record<string, number> = { ' Paris': 5.0, ' a': 2.92, ' located': 2.41, ' the': 2.0 };

function softmax(scores: number[], temperature: number): number[] {
  const scaled = scores.map((s) => s / Math.max(temperature, 1e-6)); // T→0 ≈ greedy
  const max = Math.max(...scaled); // subtract max for numerical stability
  const exps = scaled.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function sampleNext(temperature: number, topP: number): string {
  const tokens = Object.keys(logits);
  const probs = softmax(Object.values(logits), temperature);
  // Sort by probability and keep the smallest prefix whose mass reaches topP (nucleus)
  const ranked = tokens.map((t, i) => ({ t, p: probs[i] })).sort((a, b) => b.p - a.p);
  const nucleus: { t: string; p: number }[] = [];
  let mass = 0;
  for (const r of ranked) {
    nucleus.push(r);
    mass += r.p;
    if (mass >= topP) break;
  }
  // Renormalise inside the nucleus and draw
  let r = Math.random() * mass;
  for (const { t, p } of nucleus) if ((r -= p) <= 0) return t;
  return nucleus[nucleus.length - 1].t;
}

for (const T of [0.2, 1.0, 2.0]) {
  const counts: Record<string, number> = {};
  for (let i = 0; i < 1000; i++) {
    const tok = sampleNext(T, 1.0);
    counts[tok] = (counts[tok] ?? 0) + 1;
  }
  console.log('T=' + T, counts);
}`,
        },
      ],
      prosCons: {
        pros: [
          'One model covers reasoning, writing, coding and extraction via the same next-token mechanism.',
          'Large context windows (100K+ tokens) let you paste whole documents or codebases into a single call.',
          'Sampling knobs let you trade creativity for consistency per use-case.',
        ],
        cons: [
          {
            con: 'Stateless: no memory between calls, and resending history makes long chats slow and expensive.',
            fix: 'Trim or summarise old turns, keep a rolling window, and use prompt caching for the stable prefix (system prompt, documents).',
          },
          {
            con: 'Quality degrades for facts buried in the middle of very long contexts ("lost in the middle").',
            fix: 'Retrieve only the relevant chunks, put key instructions at the start and the question at the end, and test with needle-in-a-haystack style evals.',
          },
          {
            con: 'Generation is sequential, so long outputs are slow (latency grows linearly with output tokens).',
            fix: 'Cap max_tokens, ask for concise formats, stream tokens to the user, and use a smaller/faster model where quality allows.',
          },
          {
            con: 'Sampling makes outputs vary run to run, even at temperature 0 on some providers.',
            fix: 'Validate with a schema, evaluate on a fixed dataset across multiple runs, and set a seed where the API supports it.',
          },
        ],
      },
      keyPoints: [
        'LLM = loop of "predict a distribution over the vocabulary → sample one token → append".',
        '~4 characters ≈ 1 token; everything (price, limits, latency) is measured in tokens.',
        'Context window covers input + output; the model is stateless across calls.',
        'Temperature sharpens/flattens the distribution; top-p truncates its tail. Tune one.',
        'Pre-training gives knowledge; SFT + RLHF/DPO give instruction-following and helpfulness.',
      ],
      exercise: {
        prompt: `Write \`estimateCall(messages, maxOutputTokens, contextWindow, priceIn, priceOut)\` that estimates tokens and cost for one LLM call.

**Acceptance criteria**
- Estimate input tokens as \`ceil(totalChars / 4)\` plus 4 tokens of overhead per message.
- Throw an error if \`inputTokens + maxOutputTokens > contextWindow\`.
- Return \`{ inputTokens, worstCaseCostUsd }\` where prices are $ per 1M tokens and worst case assumes all \`maxOutputTokens\` are generated.
- Demo: a 3-message chat with a 200K window, priceIn = 3, priceOut = 15 (illustrative).`,
        starter: {
          language: 'typescript',
          code: `type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

function estimateCall(messages: Msg[], maxOutputTokens: number, contextWindow: number, priceIn: number, priceOut: number) {
  // TODO: sum characters, convert to tokens, add per-message overhead
  // TODO: guard against exceeding the context window
  // TODO: compute worst-case cost in USD
}

console.log(estimateCall([
  { role: 'system', content: 'You are a concise assistant.' },
  { role: 'user', content: 'Explain context windows in two sentences.' },
  { role: 'assistant', content: 'A context window is the maximum number of tokens...' },
], 1024, 200_000, 3, 15));`,
        },
        hints: [
          'Use messages.reduce to total the content lengths.',
          'Overhead: 4 × messages.length tokens for role markers.',
          'Cost = (inputTokens × priceIn + maxOutputTokens × priceOut) / 1_000_000.',
        ],
        solution: {
          language: 'typescript',
          code: `type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

function estimateCall(messages: Msg[], maxOutputTokens: number, contextWindow: number, priceIn: number, priceOut: number) {
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  // ~4 chars per token for English, plus a few tokens per message for role/formatting markers
  const inputTokens = Math.ceil(chars / 4) + 4 * messages.length;

  // Input and output share the same window
  if (inputTokens + maxOutputTokens > contextWindow) {
    throw new Error('Too long: ' + inputTokens + ' + ' + maxOutputTokens + ' > ' + contextWindow + ' tokens');
  }

  const worstCaseCostUsd = (inputTokens * priceIn + maxOutputTokens * priceOut) / 1_000_000;
  return { inputTokens, worstCaseCostUsd: Number(worstCaseCostUsd.toFixed(6)) };
}

console.log(estimateCall([
  { role: 'system', content: 'You are a concise assistant.' },
  { role: 'user', content: 'Explain context windows in two sentences.' },
  { role: 'assistant', content: 'A context window is the maximum number of tokens...' },
], 1024, 200_000, 3, 15));
// ≈ { inputTokens: 42, worstCaseCostUsd: 0.015486 } — note output dominates the cost`,
        },
        explanation:
          'Even this rough heuristic shows two key facts: input and output share one window, and output tokens (5× the price here) dominate cost for short prompts. In production, use the provider\'s token-counting endpoint or tokenizer for exact numbers.',
      },
      quickCheck: {
        question: 'Your chatbot works for 5 turns but at turn 60 it errors and earlier turns already cost much more. What is the root cause?',
        options: [
          'The model forgets older turns because its memory is full',
          'The app resends the full history each turn, so input tokens grow until they exceed the context window',
          'Temperature drifts upward as the conversation gets longer',
          'The provider rate-limits conversations longer than 50 turns',
        ],
        correct: 1,
        explanation:
          'LLMs are stateless; the app resends the whole conversation each turn. Input tokens (and cost) grow every turn until input + max_tokens exceeds the window. Fix by trimming/summarising history. There is no internal "memory" that fills up, and temperature does not change by itself.',
      },
      source: 'Holtzman et al. 2020 — The Curious Case of Neural Text Degeneration (nucleus sampling)',
    },
  ],
  codeChallenges: [
    {
      id: 'genai-fundamentals-cc-1',
      title: 'The chatbot that forgets, then explodes',
      context:
        'A junior dev built a CLI chatbot. Users complain it "forgets what I said" and, after the team fixed that by keeping all history, long sessions crash with a context-length error and the bill tripled.',
      task: 'Make the bot remember the conversation, but keep the history within a token budget (e.g. 6,000 input tokens) by always keeping the system prompt and dropping the oldest turns first. Also cap output length.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const client = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

const history: { role: 'user' | 'assistant'; content: string }[] = [];

export async function chat(userText: string) {
  history.push({ role: 'user', content: userText });
  const res = await client.chat.completions.create({
    model: MODEL,
    // BUG 1 (original version): only sent the latest message => "forgets"
    // BUG 2 (after the "fix"): sends ALL history forever => context overflow + cost
    messages: [{ role: 'system', content: 'You are a helpful travel assistant.' }, ...history],
  });
  const answer = res.choices[0].message.content ?? '';
  history.push({ role: 'assistant', content: answer });
  return answer;
}`,
      },
      hints: [
        'Estimate tokens per message (chars / 4 + overhead) and walk the history from newest to oldest.',
        'Always keep the system prompt; stop adding older turns once the budget is reached.',
        'Set max_completion_tokens so a single answer cannot eat the window.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const client = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

type Turn = { role: 'user' | 'assistant'; content: string };
const SYSTEM = 'You are a helpful travel assistant.';
const INPUT_BUDGET = 6_000; // tokens reserved for system + history
const MAX_OUTPUT = 800;     // hard cap per answer
const history: Turn[] = [];

const estTokens = (s: string) => Math.ceil(s.length / 4) + 4; // rough; use a tokenizer for exactness

function windowed(turns: Turn[]): Turn[] {
  let used = estTokens(SYSTEM);
  const kept: Turn[] = [];
  // Walk newest → oldest so the latest context always survives
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estTokens(turns[i].content);
    if (used + cost > INPUT_BUDGET) break;
    kept.unshift(turns[i]);
    used += cost;
  }
  // Don't start the window with an orphaned assistant reply
  while (kept.length && kept[0].role === 'assistant') kept.shift();
  return kept;
}

export async function chat(userText: string) {
  history.push({ role: 'user', content: userText });
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'system', content: SYSTEM }, ...windowed(history)],
    max_completion_tokens: MAX_OUTPUT,
  });
  const answer = res.choices[0].message.content ?? '';
  history.push({ role: 'assistant', content: answer });
  console.log('usage', res.usage?.prompt_tokens, res.usage?.completion_tokens);
  return answer;
}`,
      },
      explanation:
        'The model is stateless, so memory is entirely the app\'s job. Sending only the last message loses context; sending everything grows cost every turn and eventually overflows the window. A token-budgeted sliding window keeps the system prompt plus the most recent turns, bounds cost per call, and the output cap stops one long answer from consuming the budget. Logging usage lets you verify the estimate.',
      followUps: [
        {
          q: 'Users still complain the bot forgets their name given at turn 1 in a 100-turn session. What next?',
          a: 'Add a summary memory: when turns fall out of the window, summarise them (or extract key facts like name, dates, budget) into a short running note placed after the system prompt, so important facts survive while raw history is dropped.',
        },
        {
          q: 'How would you make the token estimate exact?',
          a: 'Use the provider tokenizer or token-counting endpoint (e.g. tiktoken for OpenAI models, Anthropic count_tokens) and also read the usage field from each response to calibrate the chars-per-token heuristic.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-cc-2',
      title: 'Creative settings on a data-extraction job',
      context:
        'An invoice extractor returns a different total on reruns and sometimes invents a "discount" line. The code was copied from a brainstorming demo.',
      task: 'Make extraction as consistent and verifiable as possible: right sampling settings (where the model supports them), output only what is in the text, and validate the numbers with code.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const client = new OpenAI();

export async function extractTotal(invoiceText: string) {
  const res = await client.chat.completions.create({
    model: 'gpt-4o', // hard-coded model id
    temperature: 1.4, // copied from the brainstorming demo
    top_p: 0.5,       // and also tweaked top_p
    messages: [{ role: 'user', content: 'What is the total of this invoice? ' + invoiceText }],
  });
  return Number(res.choices[0].message.content); // NaN when the model writes a sentence
}`,
      },
      hints: [
        'Extraction wants low randomness: temperature 0 (and leave top_p at default) on models that accept it.',
        'Ask for JSON with line items and total, and say "use null if not present — do not infer".',
        'Recompute the sum of line items in code and flag mismatches instead of trusting the model.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
const client = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-4.1-mini'; // non-reasoning model that accepts temperature

type Extract = { lineItems: { description: string; amount: number }[]; total: number | null };

export async function extractTotal(invoiceText: string) {
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0, // extraction: pick the most likely tokens; do not ALSO change top_p
    max_completion_tokens: 500,
    response_format: { type: 'json_object' }, // forces syntactically valid JSON
    messages: [
      {
        role: 'system',
        content:
          'Extract invoice data. Return JSON {"lineItems":[{"description":string,"amount":number}],"total":number|null}. ' +
          'Copy values exactly as written. If a value is not present, use null. Never invent lines.',
      },
      { role: 'user', content: '<invoice>\\n' + invoiceText + '\\n</invoice>' },
    ],
  });

  const data = JSON.parse(res.choices[0].message.content ?? '{}') as Extract;
  // Verify with code: the model is a reader, not a calculator
  const sum = Math.round(data.lineItems.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const consistent = data.total !== null && Math.abs(sum - data.total) < 0.01;
  return { ...data, computedSum: sum, needsReview: !consistent };
}`,
      },
      explanation:
        'Temperature 1.4 flattens the distribution and invites creative continuations — the opposite of what extraction needs. Changing temperature and top_p together makes behaviour hard to reason about. JSON output removes parsing failures, the "null if absent" instruction discourages invented fields, and recomputing the sum in code turns hallucinated totals into a review flag instead of a silent error. If you use a reasoning model that rejects temperature, drop it and rely on schema + validation.',
      followUps: [
        {
          q: 'Even at temperature 0 you see occasional differences between runs. Why, and does it matter?',
          a: 'Floating-point non-determinism in batched GPU inference and provider-side changes can flip near-tied tokens. It matters for tests: evaluate across several runs and rely on validation and schemas rather than assuming bit-identical outputs.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'genai-fundamentals-iq-1',
      difficulty: 'medium',
      question: 'Explain to a product manager, without jargon, how an LLM produces an answer — and why it sometimes makes things up.',
      whatInterviewerLooksFor: [
        'Clear next-token prediction explanation with an analogy',
        'Explains hallucination as plausible-text generation, not lying or a simple bug',
        'Mentions statelessness / context as the model\'s only working memory',
        'Gives practical mitigations (grounding, citations, validation)',
      ],
      modelAnswer: `**Short version:** an LLM is a very well-read autocomplete.

1. **Reading:** your question is split into *tokens* (word pieces, ~4 characters each).
2. **Predicting:** the model scores every possible next token — "Paris" 80%, "a" 10%… — based on patterns learned from trillions of words.
3. **Writing:** it picks one (some randomness is allowed), appends it, and repeats until the answer is finished. That's why answers stream in word by word.

**Why it makes things up:** its goal is to produce text that *looks like* a good continuation, not to look facts up. If your question is about something rare, private (your company's refund policy) or after its training cutoff, the most plausible-sounding continuation can be wrong — and it will sound just as confident as a correct answer. It's like a student who has to answer every exam question and never writes "I don't know" unless taught to.

**What we do about it**
- **Give it the facts:** retrieve the relevant documents and put them in the prompt (RAG), so it summarises rather than recalls.
- **Ask for sources:** require citations to the provided text and check they exist.
- **Use tools:** calculators, databases and APIs for exact facts.
- **Validate:** schemas and business-rule checks on the output; human review for high-stakes actions.
- **Measure:** an evaluation set that tracks the hallucination rate over time.

Key framing for the PM: hallucinations are managed with system design, not eliminated by picking the "right" model.`,
      followUps: [
        {
          q: 'Would setting temperature to 0 stop hallucinations?',
          a: 'No. Temperature 0 makes the model pick its single most likely continuation every time, so it becomes more consistent — but if the most likely continuation is wrong, it is consistently wrong. Grounding and validation address correctness; temperature only addresses variability.',
        },
        {
          q: 'Why do reasoning models hallucinate less on maths?',
          a: 'They are trained (often with reinforcement learning on verifiable answers) to spend tokens working through intermediate steps before answering, which gives the model more computation per problem and lets errors be caught mid-way. They still hallucinate facts they never saw.',
        },
      ],
      pitfalls: [
        'Saying the model "searches its database" — it has no lookup, only learned weights.',
        'Claiming a bigger model or temperature 0 eliminates hallucinations.',
        'Using heavy jargon (logits, softmax) with a non-technical audience.',
      ],
    },
    {
      id: 'genai-fundamentals-iq-2',
      difficulty: 'hard',
      question: 'Your team wants to "use AI" to replace a 400-rule fraud-scoring engine. How do you decide whether GenAI, classic ML or rules is the right tool?',
      context: 'Transactions arrive at 2,000/s with a 30 ms decision budget. Analysts also write free-text case notes.',
      whatInterviewerLooksFor: [
        'Matches tool to constraints (latency, volume, exactness, auditability)',
        'Recognises LLMs are a poor fit for the real-time scoring path',
        'Finds where GenAI genuinely helps (case notes, explanations, rule authoring)',
        'Proposes an evaluation before committing',
      ],
      modelAnswer: `**Start from constraints, not hype.**

| Constraint | Implication |
|---|---|
| 2,000 tx/s | ~173M decisions/day — even $0.0005 per LLM call ≈ $86K/day |
| 30 ms budget | LLM TTFT alone is typically 200–800 ms |
| Auditability | regulators want reproducible, explainable decisions |
| Tabular input | gradient-boosted trees excel on structured features |

**Verdict for the hot path:** keep rules + a classic ML model (e.g. gradient boosting) for scoring. An LLM is too slow, too costly at this volume and non-deterministic.

**Where GenAI earns its keep**
1. **Analyst case notes:** summarise long free-text histories, extract entities (merchant, device, claimed reason) into features for the ML model.
2. **Explanations:** turn the top feature contributions into a readable reason for analysts or customer letters — offline, after the decision.
3. **Rule maintenance:** help analysts draft and test new rules in plain English → code, reviewed by humans.
4. **Triage queue:** prioritise flagged cases for human review asynchronously.

**Process:** build a labelled evaluation set from historical cases, compare current rules vs ML vs ML+LLM-derived features on precision/recall and cost, and roll out behind a shadow mode before switching anything.

The senior answer is "hybrid, with GenAI off the critical path".`,
      followUps: [
        {
          q: 'The CEO insists on an LLM in the decision. How do you make it safe?',
          a: 'Put it asynchronously behind the fast model: only for the small slice of borderline scores, with a strict JSON schema, a timeout with fallback to the existing decision, logging for audit, and a shadow period measuring its agreement with analysts before it influences outcomes.',
        },
        {
          q: 'How would you measure whether LLM-extracted note features help?',
          a: 'Train the ML model with and without the new features on the same time-split data and compare precision/recall at the operating threshold; also check the extraction accuracy on a hand-labelled sample of notes.',
        },
      ],
      pitfalls: [
        'Putting an LLM in a 30 ms synchronous path.',
        'Ignoring the per-call cost multiplied by very high volume.',
        'Dismissing GenAI completely instead of finding the unstructured-text niche.',
      ],
    },
    {
      id: 'genai-fundamentals-iq-3',
      difficulty: 'medium',
      question: 'What happens to quality, cost and latency as you push more context into a 1M-token window? When would you not fill it?',
      whatInterviewerLooksFor: [
        'Cost scales with input tokens on every call',
        'Latency (prefill/TTFT) grows with input length',
        'Knows about lost-in-the-middle / attention dilution',
        'Proposes retrieval, caching or summarisation instead of dumping everything',
      ],
      modelAnswer: `A big window is a capability, not a strategy.

**Cost:** you pay for every input token on *every* call. 800K tokens at an illustrative $3/1M = **$2.40 per question**; 10K questions/day = $24K/day. Retrieving the 8K relevant tokens costs ~$0.024 instead — 100× cheaper.

**Latency:** the model must process (prefill) all input before the first output token. Hundreds of thousands of tokens can add many seconds of time-to-first-token.

**Quality:** models are best at using information near the start and end of the prompt; facts buried in the middle of huge contexts are recalled less reliably, and irrelevant text can distract the model (more chances to quote the wrong version of a policy).

**When to fill it**
- One-off deep analysis of a single large artefact (a contract set, a codebase) where recall matters more than cost.
- When the content is reused across many calls *and* prompt caching makes the repeated prefix cheap.

**When not to**
- High-QPS question answering over a large corpus → retrieve top-k chunks (RAG).
- Long chats → summarise or window old turns.
- Latency-sensitive UX.

Rule of thumb: put the *minimum sufficient* context in, structure it with clear delimiters, and put instructions + question where the model attends best.`,
      followUps: [
        {
          q: 'How does prompt caching change the calculation?',
          a: 'Cached prefixes are billed at a steep discount (often ~10% of the normal input price) and skip most of the prefill, so a large stable prefix reused across many calls becomes much cheaper and faster. Variable content must come after the cached part.',
        },
        {
          q: 'How would you test whether long context actually hurts your use case?',
          a: 'Build a needle-in-a-haystack style eval: place known facts at different depths and context sizes in realistic documents, ask questions, and plot accuracy by depth and length versus a RAG baseline.',
        },
      ],
      pitfalls: [
        'Assuming a bigger window means the model uses all of it equally well.',
        'Forgetting that input is re-billed on every call.',
        'Ignoring time-to-first-token growth.',
      ],
    },
    {
      id: 'genai-fundamentals-iq-4',
      difficulty: 'hard',
      question: 'Walk through how a base pre-trained model differs from the chat model you call through an API, and why that matters to an application developer.',
      whatInterviewerLooksFor: [
        'Pre-training vs SFT vs preference tuning (RLHF/DPO)',
        'Base models continue text; chat models follow instructions and roles',
        'Implications: chat templates, refusals, system prompts, fine-tuning choices',
        'Mentions reasoning-model training as a newer stage',
      ],
      modelAnswer: `**Pipeline**

1. **Pre-training:** next-token prediction on trillions of tokens. Result: a *base model* that knows a lot but simply continues text. Ask "What is the capital of France?" and it might continue with "What is the capital of Spain?" — like a quiz page.
2. **Supervised fine-tuning (SFT):** thousands to millions of prompt → ideal answer pairs, formatted with a *chat template* (system/user/assistant markers). Now it answers instead of continuing.
3. **Preference tuning (RLHF or DPO):** humans or AI judges compare answers; the model is pushed toward helpful, honest, harmless ones. This adds refusals, tone, and following system prompts.
4. **Reasoning RL (newer models):** rewards correct final answers on verifiable tasks (maths, code), teaching the model to think step by step before answering.

**Why developers care**
- **Roles and system prompts work** because of SFT/preference training; base models ignore them.
- **Chat templates matter** when you self-host open models — the wrong template silently degrades quality. Use the tokenizer's chat template.
- **Refusals and safety behaviour** come from tuning; over-refusal is tuned behaviour you steer with clearer context, not a bug in your code.
- **Fine-tuning choices:** you usually fine-tune an *instruct* model (small SFT/LoRA on your format) rather than a base model.
- **Sampling defaults:** reasoning models often lock temperature and expose an effort knob instead.`,
      followUps: [
        {
          q: 'When would you deliberately use a base model?',
          a: 'For pure continuation tasks such as autocomplete in a code editor, generating diverse synthetic text in a specific style, or as the starting point for heavy domain pre-training before your own instruction tuning.',
        },
        {
          q: 'What goes wrong if you self-host an instruct model and send raw text without the chat template?',
          a: 'The model sees input in a format it was not tuned on, so it may ramble, ignore instructions, continue your prompt or never stop. Applying the tokenizer chat template (apply_chat_template) restores the expected role markers and stop tokens.',
        },
      ],
      pitfalls: [
        'Thinking the API model is "just" the pre-trained model.',
        'Confusing fine-tuning with giving the model new knowledge reliably (RAG is usually better for facts).',
      ],
    },
    {
      id: 'genai-fundamentals-iq-5',
      difficulty: 'expert',
      question: 'A stakeholder asks for "deterministic" LLM output for a compliance workflow. What can you actually guarantee, and how would you design for it?',
      whatInterviewerLooksFor: [
        'Knows temperature 0 / seed are best-effort, not guarantees',
        'Explains sources of non-determinism (batching, floating point, model updates)',
        'Pins model versions and logs inputs/outputs for audit',
        'Moves guarantees into deterministic code: schemas, validation, rules',
      ],
      modelAnswer: `**What you cannot guarantee:** bit-identical outputs from a hosted LLM. Even at temperature 0, near-tied tokens can flip because of floating-point differences in batched GPU kernels, and providers update models. Many reasoning models do not even accept temperature.

**What you can guarantee — by design**

| Need | Mechanism |
|---|---|
| Same model behaviour over time | Pin a dated model snapshot, not an alias; re-run evals before upgrading |
| Valid shape | Structured outputs with a strict JSON schema |
| Correct values | Deterministic validators: allowed enums, totals add up, IDs exist in DB |
| Reproducible decisions | The *decision* is made by code/rules from validated fields; the LLM only extracts/drafts |
| Auditability | Log prompt version, model id, input, output, validator results, reviewer |
| Consistency | Low temperature where supported; optional self-consistency (run 3×, require agreement, else human review) |
| Exact replay | Cache the stored output; replaying from the log is deterministic even if the model is not |

**Architecture:** LLM extracts → schema validation → rule engine decides → human approves exceptions. You get auditability from the log and repeatability from the cache, while the LLM handles the messy reading.

Communicate it as: "the *process* is deterministic and auditable; the model's raw wording is not, and we don't depend on it."`,
      followUps: [
        {
          q: 'How does self-consistency help, and what does it cost?',
          a: 'Sampling the same extraction several times and accepting only when answers agree catches unstable cases and routes them to humans. It multiplies cost and latency by the number of samples, so apply it to high-stakes fields only.',
        },
        {
          q: 'The provider deprecates your pinned model. What is your migration plan?',
          a: 'Run the golden evaluation set against candidate models, compare field-level accuracy and validator failure rates, shadow-run the new model in production, then switch with a feature flag and keep the old logs for audit replay.',
        },
      ],
      pitfalls: [
        'Promising determinism because temperature is 0.',
        'Letting the LLM make the compliance decision directly.',
        'Using a floating model alias that silently changes.',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'genai-fundamentals-est-1',
      question: 'Estimate the monthly LLM cost of an internal assistant used by 2,000 employees.',
      assumptions: [
        'Each employee asks 15 questions per working day; 22 working days/month',
        'Each call: 1,500-token system prompt + 2,500 tokens of history/context + 100-token question',
        'Average answer: 350 output tokens',
        'Illustrative price: $3 / 1M input tokens, $15 / 1M output tokens; no caching',
      ],
      steps: [
        { label: 'Calls per month', calc: '2,000 × 15 × 22 = 660,000 calls' },
        { label: 'Input tokens', calc: '660,000 × (1,500 + 2,500 + 100) = 660,000 × 4,100 ≈ 2.71B tokens' },
        { label: 'Output tokens', calc: '660,000 × 350 = 231M tokens' },
        { label: 'Input cost', calc: '2,706M × $3 / 1M ≈ $8,118' },
        { label: 'Output cost', calc: '231M × $15 / 1M ≈ $3,465' },
        { label: 'Total', calc: '$8,118 + $3,465 ≈ $11,600 / month ≈ $5.80 per employee' },
      ],
      answer: '≈ $11.6K per month (~$5.80 per employee), with input tokens ~70% of the bill.',
      insight:
        'Because the system prompt and history are resent on every call, input dominates. Caching the 1,500-token system prompt (often billed at ~10% on hits) and trimming history are the biggest levers — far bigger than shortening answers.',
      followUps: [
        {
          q: 'With prompt caching on the 1,500-token system prompt at 10% of the input price, what do you save?',
          a: 'Cached tokens: 660,000 × 1,500 = 990M. Normal cost $2,970 vs cached ~$297, saving ≈ $2,670/month (~23% of the total), ignoring the small cache-write premium.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-est-2',
      question: 'How long does a user wait for a 600-word answer, and how much does streaming help perceived latency?',
      assumptions: [
        '600 words ≈ 800 output tokens',
        'Prompt of 3,000 tokens; time-to-first-token (TTFT) ≈ 500 ms',
        'Decode speed ≈ 80 output tokens/second for a mid-size hosted model',
        'Users start reading as soon as text appears',
      ],
      steps: [
        { label: 'Generation time', calc: '800 tokens / 80 tok/s = 10 s' },
        { label: 'Total without streaming', calc: '0.5 s TTFT + 10 s = 10.5 s before anything shows' },
        { label: 'With streaming', calc: 'first words at ~0.5 s; text arrives at ~60 words/s' },
        { label: 'Reading speed check', calc: 'people read ~4–5 words/s, so 80 tok/s (~60 words/s) is far faster than reading' },
      ],
      answer: '≈ 10.5 s end-to-end; with streaming the user sees text after ~0.5 s, so perceived wait drops by ~20×.',
      insight:
        'Output length, not prompt length, drives total latency because tokens are generated one at a time. Stream by default, cap max_tokens, ask for concise answers, and choose a faster model when total time matters (e.g. when another program waits for the full JSON).',
      followUps: [
        {
          q: 'The answer feeds a backend job that needs complete JSON, so streaming to a user is irrelevant. What reduces latency now?',
          a: 'Shrink the output (terse JSON keys, only needed fields), use a smaller/faster model, reduce reasoning effort on reasoning models, and parallelise independent calls rather than chaining them.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'genai-fundamentals-mcq-01',
      difficulty: 'medium',
      question: 'A team calls an LLM with only the newest user message each turn. Users say the bot "forgets" what they said two messages ago. What is the correct explanation?',
      options: [
        'The model\'s internal memory was reset by a provider timeout',
        'The model is stateless; only the tokens sent in this request are visible to it',
        'Temperature is too high, so the model ignores earlier context',
        'The context window is full and older messages were evicted by the provider',
      ],
      correct: [1],
      explanation:
        'LLM APIs are stateless: each request is independent and the model sees only what you send. The app must resend relevant history. Temperature affects randomness, not visibility, and nothing was evicted because the earlier messages were never sent.',
      followUps: [
        {
          q: 'What is the trade-off of sending the full history every turn?',
          a: 'Input tokens, cost and time-to-first-token grow every turn until the context window overflows, so you need windowing or summarisation of older turns.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-02',
      difficulty: 'medium',
      question: 'Roughly how many tokens is a 3,000-word English report, and what does that imply for a model with an 8K-token window and max_tokens = 2,000?',
      options: [
        '≈ 750 tokens; it fits easily with room to spare',
        '≈ 4,000 tokens; it fits, leaving about 2,000 tokens of headroom',
        '≈ 12,000 tokens; it cannot fit at all',
        '≈ 3,000 tokens; one token per word, so it fits',
      ],
      correct: [1],
      explanation:
        'English averages ~0.75 words per token, so 3,000 words ≈ 4,000 tokens. With 2,000 reserved for output, 6,000 tokens of input budget remain, so it fits with ~2,000 tokens spare for instructions. "One token per word" undercounts, and 750 confuses the ratio direction.',
      followUps: [
        {
          q: 'Why would the same report in Hindi or Japanese use noticeably more tokens?',
          a: 'Tokenizers are trained mostly on English-heavy data, so non-Latin scripts get split into more, smaller pieces — often 1.5–3× as many tokens for the same meaning, raising cost and consuming more window.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-03',
      difficulty: 'hard',
      question: 'Given the sampling code below, what happens to the probability of the top token as `temperature` goes from 1.0 to 0.25?',
      code: {
        language: 'typescript',
        code: `const logits = [4.0, 2.0, 1.0];
function probs(t: number) {
  const e = logits.map((l) => Math.exp(l / t));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}
console.log(probs(1.0)[0], probs(0.25)[0]);`,
      },
      options: [
        'It drops, because dividing by a small number shrinks the logits',
        'It stays the same; temperature only affects top-p filtering',
        'It rises from ≈0.84 to ≈0.9997, approaching greedy decoding',
        'It rises to exactly 1.0 because 0.25 is treated as zero',
      ],
      correct: [2],
      explanation:
        'Dividing logits by T < 1 enlarges the gaps between them (4/0.25 = 16 vs 8 vs 4), so softmax concentrates mass on the top token: ≈0.84 → ≈0.9997. It never reaches exactly 1.0 for T > 0. Temperature works on logits independently of top-p.',
      followUps: [
        {
          q: 'What does T > 1 do to the same distribution?',
          a: 'It shrinks the gaps between logits, flattening the distribution so lower-ranked tokens are sampled more often — more diverse, but more prone to incoherent or off-topic text.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-04',
      difficulty: 'hard',
      question: 'Which of these are genuine consequences of LLMs being next-token predictors? (Select ALL that apply)',
      options: [
        'Output latency grows roughly linearly with the number of generated tokens',
        'Answers can be fluent and confident while factually wrong',
        'The model looks facts up in an internal database before answering',
        'The same prompt can produce different outputs when sampling is used',
      ],
      correct: [0, 1, 3],
      explanation:
        'Tokens are generated one at a time (latency ∝ output length), the objective rewards plausible text rather than verified truth (hallucination), and sampling introduces variation. There is no lookup database — knowledge is encoded implicitly in weights, which is exactly why it can be wrong.',
      followUps: [
        {
          q: 'Which mitigation addresses the "fluent but wrong" consequence most directly?',
          a: 'Grounding: supply the relevant source text at request time (RAG or tools) and require the answer to cite it, then verify the citations, so correctness no longer depends on memorised weights.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-05',
      difficulty: 'hard',
      question: 'You send `temperature: 0.2` to a 2026 reasoning model and get a 400 "unsupported parameter" error. What is the best fix?',
      options: [
        'Switch to top_p = 0.2 instead, which reasoning models always accept',
        'Retry with exponential backoff; it is a transient provider error',
        'Remove the sampling parameter and control behaviour via the reasoning-effort setting, schema and prompt',
        'Set temperature to 0, since only non-zero values are rejected',
      ],
      correct: [2],
      explanation:
        'Many reasoning models run with fixed decoding settings and reject or ignore temperature/top_p; they expose a reasoning-effort knob instead. A 400 is a request error, so retrying won\'t help, and top_p is usually restricted in the same way.',
      followUps: [
        {
          q: 'How do you get consistency from such a model without temperature?',
          a: 'Use structured outputs with a strict schema, precise instructions and examples, validate outputs in code, and evaluate across multiple runs; for critical fields, sample several times and require agreement.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-06',
      difficulty: 'hard',
      question: 'With top-p = 0.9 and next-token probabilities A 0.55, B 0.25, C 0.12, D 0.08, which tokens can be sampled?',
      options: [
        'A only, because it is the single most likely token',
        'A and B, because they reach 0.80',
        'A, B and C, the smallest set whose cumulative probability reaches ≥ 0.9',
        'All four, because top-p only removes tokens below 0.1 each',
      ],
      correct: [2],
      explanation:
        'Nucleus sampling sorts tokens and keeps the smallest prefix with cumulative mass ≥ p: 0.55 → 0.80 → 0.92, so A, B, C remain and are renormalised. A and B only reach 0.80 < 0.9. Top-p is cumulative, not a per-token threshold (that would resemble min-p).',
      followUps: [
        {
          q: 'How does top-k = 2 differ here?',
          a: 'Top-k keeps a fixed number of tokens (A and B) regardless of how confident the distribution is, whereas top-p adapts: it keeps few tokens when the model is confident and many when it is uncertain.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-07',
      difficulty: 'medium',
      question: 'Which tasks are a good fit for an LLM rather than plain deterministic code? (Select ALL that apply)',
      options: [
        'Drafting a polite reply to an angry customer email',
        'Summing a column of 10,000 invoice amounts',
        'Extracting the cancellation date from a free-text contract clause',
        'Grouping 500 open-ended survey comments into themes',
      ],
      correct: [0, 2, 3],
      explanation:
        'Drafting, extraction from free text and thematic grouping all involve fuzzy language. Summing numbers is exact arithmetic: code is cheaper, instant and always correct, while an LLM can slip digits.',
      followUps: [
        {
          q: 'For the contract-date extraction, what deterministic check would you add?',
          a: 'Parse the returned value as an ISO date, confirm the quoted source sentence actually appears in the contract, and check the date is after the contract start date; anything failing goes to human review.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-08',
      difficulty: 'expert',
      question: 'An app sends this request. The input is 195,000 tokens and the model window is 200,000. What happens?',
      code: {
        language: 'typescript',
        code: `const res = await client.messages.create({
  model: MODEL,            // 200K-token context window
  max_tokens: 8000,
  system: bigPolicyManual, // ~180K tokens
  messages: [{ role: 'user', content: question + history }], // ~15K tokens
});`,
      },
      options: [
        'It succeeds; the provider silently truncates the oldest part of the system prompt',
        'Input + max_tokens exceeds the window, so the request is rejected or the output is cut far short',
        'It succeeds normally because max_tokens does not count toward the window',
        'It succeeds, but the model ignores the system prompt because it is too long',
      ],
      correct: [1],
      explanation:
        'Input and output share the window: 195K + 8K = 203K > 200K. Depending on the provider this is a validation error, or generation can only use the ~5K tokens that remain. Providers do not silently trim your system prompt, and max_tokens is part of the budget.',
      followUps: [
        {
          q: 'How would you redesign this to answer questions over a 180K-token manual cheaply?',
          a: 'Chunk and index the manual, retrieve only the top relevant sections per question (a few thousand tokens), or if the whole manual is needed, use prompt caching on the stable manual prefix and keep history short.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-09',
      difficulty: 'hard',
      question: 'Which statements about how chat LLMs are trained are correct? (Select ALL that apply)',
      options: [
        'Pre-training on next-token prediction gives broad knowledge but not reliable instruction-following',
        'Supervised fine-tuning on prompt/answer pairs teaches the chat format and following instructions',
        'Preference tuning (RLHF or DPO) shapes helpfulness, tone and refusals',
        'Fine-tuning is the most reliable way to keep a model up to date with daily-changing facts',
      ],
      correct: [0, 1, 2],
      explanation:
        'Pre-training → SFT → preference tuning is the standard pipeline, each adding a capability layer. Fine-tuning is a poor fit for fast-changing facts: it is slow, costly and recall is unreliable; retrieval at request time (RAG) keeps facts current.',
      followUps: [
        {
          q: 'When is fine-tuning the right tool then?',
          a: 'For teaching a consistent style, output format or narrow task behaviour from many examples, or for distilling a big model\'s behaviour into a smaller, cheaper one — not for injecting changing knowledge.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-10',
      difficulty: 'expert',
      question: 'A latency-sensitive feature produces ~1,200 output tokens per answer and users complain it is slow, although TTFT is only 400 ms. What is the most effective change?',
      code: {
        language: 'typescript',
        code: `// measured per request
// prompt tokens: 900   TTFT: 400 ms
// output tokens: 1200  decode: 60 tokens/s
// total: 0.4 s + 1200 / 60 = 20.4 s`,
      },
      options: [
        'Shorten the 900-token prompt to 300 tokens',
        'Constrain the output (concise format, lower max_tokens) and stream it to the user',
        'Raise temperature so the model decides on tokens faster',
        'Move the instructions from the system prompt into the user message',
      ],
      correct: [1],
      explanation:
        '20 of the 20.4 s are decode time, which scales with output tokens. Halving the output halves the wait, and streaming shows text after 0.4 s. Prompt trimming only affects the already-small prefill, and temperature has no meaningful effect on speed.',
      followUps: [
        {
          q: 'If the output must stay long, what else can reduce decode time?',
          a: 'Use a faster or smaller model, a provider with higher tokens/s, speculative decoding on self-hosted models, or split the answer into parallel independent sections generated concurrently.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-11',
      difficulty: 'expert',
      question: 'Your LLM-powered extractor gives slightly different outputs across reruns at temperature 0 with a pinned model. Which explanations are plausible? (Select ALL that apply)',
      options: [
        'Floating-point non-determinism in batched GPU inference can flip near-tied tokens',
        'The model is secretly learning from your previous requests',
        'Server-side batching with other requests changes numeric execution order',
        'Temperature 0 is treated as the default temperature of 1.0',
      ],
      correct: [0, 2],
      explanation:
        'Different batch compositions and parallel reductions change floating-point summation order, so near-tied logits can resolve differently even with greedy decoding. Hosted models do not learn from individual requests at inference time, and temperature 0 is not silently mapped to 1.0.',
      followUps: [
        {
          q: 'How do you make downstream behaviour reproducible anyway?',
          a: 'Store each validated output with its prompt version and model id, replay from that log for audits, and make decisions in deterministic code using validated fields rather than raw text.',
        },
      ],
    },
    {
      id: 'genai-fundamentals-mcq-12',
      difficulty: 'expert',
      question: 'Look at this chat loop. What is the main cost bug as conversations get long?',
      code: {
        language: 'typescript',
        code: `const history: Msg[] = [];
for await (const userText of incoming) {
  history.push({ role: 'user', content: userText });
  const res = await llm.chat({ system: LONG_SYSTEM_PROMPT, messages: history });
  history.push({ role: 'assistant', content: res.text });
}`,
      },
      options: [
        'Pushing assistant messages into history doubles the output price',
        'Input tokens grow every turn, so total cost grows roughly quadratically with conversation length',
        'The system prompt is billed only once per conversation, so long prompts are free',
        'Using for-await makes requests run in parallel and exceed rate limits',
      ],
      correct: [1],
      explanation:
        'Each turn resends the full history, so turn n costs ~n units of history; summed over N turns that is ~N²/2. The system prompt is billed on every call (unless cached). Assistant messages are billed as input on later turns, not at output price, and for-await is sequential.',
      followUps: [
        {
          q: 'Which two techniques bend the curve back toward linear?',
          a: 'A token-budgeted sliding window (or running summary) caps history per call, and prompt caching makes the repeated stable prefix (system prompt, early turns) much cheaper on each call.',
        },
      ],
    },
  ],
};

export default topic;
