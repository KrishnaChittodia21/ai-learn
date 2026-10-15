# Content Authoring Guide — GenAI Learn

The app makes **anyone confident in Generative AI**, from a complete beginner to someone shipping production
LLM systems. The motto is **less reading, more practising**: every concept is short, concrete and immediately
followed by something to *do*.

Every topic file is a TypeScript module that default-exports a `Topic` (see `src/types.ts`; it is the contract,
so read it first, especially `Section`, `ProsCons`, `SectionExercise` and `QuickCheck`).

## File format

Path: `src/content/topics/<topic-id>.ts`

```ts
import type { Topic } from '../../types';

const topic: Topic = {
  id: 'embeddings',
  phase: 'embeddings',
  order: 1,
  title: '...',
  // ...
};

export default topic;
```

- Use template literals for multi-line strings (markdown bodies, code). **Escape every backtick inside a template literal as \` and every `${` as `\${`.** This bites constantly in TypeScript code snippets that use template strings, so prefer string concatenation or single quotes inside snippets where you can.
- Markdown fields: GFM supported (tables, bold, lists, inline code). **No fenced code blocks inside markdown**: put code in `code: CodeSnippet[]` / `exercise.solution`.
- ASCII diagrams go in `diagram` (monospace), ≤ 80 columns. Use them generously: pipelines, architectures and data flow.
- IDs must be unique app-wide: prefix every id with the topic id (`embeddings-mcq-07`, `embeddings-iq-03`, `embeddings-est-2`, `embeddings-cc-1`).

## Section shape (one section per checklist item — mandatory)

Every checklist item assigned to the topic gets **its own section**, and the `heading` **starts with the checklist
item's exact name**, e.g. `'BM25 — term frequency, saturation and length normalisation'`. Visualisations and search
match on these prefixes. You may add at most one extra section (e.g. a hands-on "Putting it together" section) at the end.

Order sections **incrementally**: each one builds on the previous one (simple → advanced).

Each section has ALL of these:

| Field | Rule |
|---|---|
| `body` | 120–300 words. Open with a 1–2 sentence plain-English intuition (an analogy is welcome), then the mechanics, then *when to use it*. Tables for comparisons. |
| `example` | A **solid, concrete worked example**: real inputs → real outputs, real numbers (e.g. "query 'refund policy for damaged items' → BM25 ranks doc A 7.2 vs doc B 3.1 because…"). 60–180 words. |
| `diagram` | Where flow or structure matters (most sections). |
| `code` | 1 snippet (occasionally 2), 10–45 lines, correct and runnable-looking. Comment the non-obvious lines. |
| `prosCons` | 2–4 pros; 2–4 cons, **each with a concrete `fix`** (how to overcome it: the technique, setting or pattern). |
| `keyPoints` | 3–5 one-liners. |
| `exercise` | A **hands-on coding question**: `prompt` (what to build, with acceptance criteria), optional `starter` (a skeleton with TODOs), 2–3 progressive `hints`, a complete `solution`, a short `explanation`. Small enough to do in 5–15 minutes. |
| `quickCheck` | One single-answer question (3–4 options, `correct` index, `explanation`) that tests *understanding*, not recall. |
| `source` | Optional citation: paper, official docs or a well-known engineering blog. |

### Code conventions

- **TypeScript (Node 20+) by default**: `openai`, `@anthropic-ai/sdk`, `zod`, `@langchain/*`, `@langchain/langgraph`, `llamaindex`, `@modelcontextprotocol/sdk`, `pg` + `pgvector`, `@qdrant/js-client-rest`, `ioredis`, `bullmq`.
- **Python where the ecosystem is Python**: fine-tuning (`transformers`, `peft`, `trl`, `bitsandbytes`), training internals, PyTorch attention maths, vLLM, `sentence-transformers`, `ragas`, `unstructured`, OCR. Plain numpy for maths demos.
- Model ids: read them from config so they don't go stale, e.g. `const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5'` or `'gpt-5-mini'`. Embedding models: `text-embedding-3-small` (1536-d), `bge-m3`, `all-MiniLM-L6-v2` (384-d) and similar.
- Use real API shapes (OpenAI Chat Completions / Responses API, Anthropic Messages API, tool/function schemas, SSE streaming). Don't invent SDK methods.
- Use real numbers with sane ranges: token counts (~4 chars ≈ 1 token in English), context windows, $ per 1M tokens (say "illustrative price"), latencies (TTFT 200–800 ms), embedding dims, HNSW `M`/`efSearch`, recall figures.

## Required volume per topic (validator minimums)

| Field | Count | Notes |
|---|---|---|
| sections | one per checklist item (+ ≤1 extra) | every section complete as above |
| cheatSheet | 8–10 | dense one-line revision bullets |
| codeChallenges | 2 | "Fix/improve this code" lab: realistic naive or buggy GenAI code → production-grade (e.g. no retry/timeout, prompt-injectable template, chunking that splits mid-sentence, unbounded context, no JSON validation). 2 follow-ups each. |
| interviewQuestions | 5 | Real-world/interview style ("Your RAG bot answers confidently from the wrong policy version — diagnose."). `modelAnswer` 150–350 words of structured markdown (≥300 chars). 2–3 follow-ups, 2–3 pitfalls, 3–5 `whatInterviewerLooksFor`. |
| envelopeQuestions | 2 | **Estimation drills**: tokens, cost, latency, storage, GPU memory, QPS (e.g. "Monthly cost of embedding 2M pages and serving 50K queries/day"). Explicit assumptions, each step shows its arithmetic, plus an `insight` and 1 follow-up. |
| test (exam MCQs) | 12 | Scenario, trade-off, debugging or "what happens next". Mix: ~3 medium, ~6 hard, ~3 expert. **≥3 with `code`**, **≥3 multi-select** ("Select ALL that apply", 2–3 correct). Plausible distractors, similar-length options, no "all of the above". `explanation` says why the right answer is right and why the tempting distractors are wrong. Each has 1 follow-up (answer ≥ 40 chars). |

`estimatedMinutes`: ~8 per section plus 20.

## Quality bar

- **Practical over theoretical.** Every concept answers: what is it, show me, when do I use it, what goes wrong, how do I fix it.
- **Pros/cons always carry the fix.** For example: "Con: fixed-size chunks split sentences → Fix: recursive splitting on paragraph/sentence boundaries plus 10–20% overlap".
- **Incremental.** Within a topic, simple → advanced. Don't re-teach another topic in depth: mention it in one line and move on.
- **Accurate and current (2026).** Use web search (`WebSearch`/`WebFetch` via ToolSearch) for current best practice, papers and real numbers (e.g. Anthropic Contextual Retrieval, RAGAS metrics, MCP spec, LangGraph APIs, vLLM, HNSW parameters, DPO). Rewrite in your own words. List the sources you used in the topic's `sources`.
- **Uniqueness:** no near-duplicate questions within or across topics. Check doubtful drafts with `node scripts/find-similar.mjs "<draft text>"`.

## Validation (MANDATORY before you finish)

1. Type-check: `npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --verbatimModuleSyntax src/content/topics/<id>.ts`
2. Structure: `node --no-warnings scripts/validate-content.mjs <id> [<id> ...]`

Fix everything until both pass. (The cross-topic duplicate check may flag pairs with topics other agents are writing in parallel. Rephrase *your* question if similarity ≥ 0.4.)

---

## Topic map (id → phase/order → checklist items, one section each)

**Beginner**
- `genai-fundamentals` (foundations 1): GenAI Fundamentals · LLM Fundamentals
- `transformers-tokenization` (foundations 2): Transformer Architecture · Tokenization
- `prompt-engineering` (prompting 1): Prompt Engineering · Prompt Templates
- `structured-outputs-tools` (prompting 2): Structured Outputs (JSON / JSON Schema) · Function Calling · Tool Calling
- `llm-apis-streaming` (prompting 3): LLM APIs · Streaming Responses
- `embeddings` (embeddings 1): Embeddings · Embedding Models · Vector Similarity

**Intermediate**
- `document-ingestion` (ingestion 1): Document Ingestion · Document Parsing · Data Preprocessing · OCR
- `chunking-fundamentals` (ingestion 2): Chunking Strategies · Chunk Size and Overlap · Recursive Chunking
- `advanced-chunking` (ingestion 3): Semantic Chunking · Structure-Aware Chunking · Parent-Child Chunking · Contextual Chunking
- `vector-databases` (vector-search 1): Vector Databases · Vector Indexing · Metadata Filtering
- `ann-search` (vector-search 2): ANN Search · HNSW and IVF
- `retrieval-fundamentals` (retrieval 1): Information Retrieval · Keyword Search · BM25 · Dense Retrieval · Sparse Retrieval · Hybrid Search
- `query-transformation` (retrieval 2): Query Rewriting · Query Expansion · Multi-Query Retrieval · Query Decomposition · HyDE · Self-Query Retrieval
- `advanced-retrieval` (retrieval 3): Parent Document Retrieval · Sentence-Window Retrieval · Multi-Hop Retrieval · Iterative Retrieval · Adaptive Retrieval · Contextual Retrieval
- `reranking-fusion` (retrieval 4): Reranking · Cross-Encoder Reranking · LLM-Based Reranking · Reciprocal Rank Fusion (RRF) · Retrieval Score Fusion · Top-K Retrieval
- `context-engineering` (retrieval 5): Context Compression · Context Engineering
- `rag-fundamentals` (rag 1): RAG Fundamentals · Naive RAG · Advanced RAG · Modular RAG
- `advanced-rag-patterns` (rag 2): Corrective RAG (CRAG) · Self-RAG · Adaptive RAG · Agentic RAG
- `graphrag-multimodal-rag` (rag 3): GraphRAG · Multimodal RAG
- `rag-evaluation` (evaluation 1): RAG Evaluation · Retrieval Evaluation · Precision@K · Recall@K · MRR and NDCG
- `groundedness-hallucinations` (evaluation 2): Faithfulness and Groundedness · Citation Evaluation · Hallucination Detection
- `llm-evaluation` (evaluation 3): LLM Evaluation · Golden Datasets · LLM-as-a-Judge · Prompt Regression Testing
- `ai-testing-benchmarking` (evaluation 4): AI Testing · AI Benchmarking

**Advanced**
- `agent-fundamentals` (agents 1): LLM Agents · AI Agent Architecture · ReAct
- `planning-decomposition` (agents 2): Planning and Execution · Task Decomposition
- `agent-memory-tools` (agents 3): Agent Memory · Short-Term Memory · Long-Term Memory · Tool Selection
- `multi-agent-systems` (agents 4): Agentic Workflows · Multi-Agent Systems · Agent Orchestration
- `hitl-state-machines` (agents 5): Human-in-the-Loop · State Machines
- `langchain-langgraph-llamaindex` (frameworks 1): LangChain · LangGraph · LlamaIndex
- `mcp` (frameworks 2): Model Context Protocol (MCP) · MCP Servers and Tools
- `knowledge-graphs` (frameworks 3): Knowledge Graphs · Graph Databases · Entity Extraction · Entity Resolution · Graph-Based Retrieval
- `fine-tuning` (models 1): Fine-Tuning · Supervised Fine-Tuning (SFT) · LoRA · QLoRA · PEFT
- `alignment-distillation` (models 2): RLHF · DPO · Knowledge Distillation
- `open-source-local-llms` (models 3): Open-Source LLMs · Local LLM Deployment · Quantization
- `model-serving-routing` (models 4): Model Serving · Model Routing · Model Selection · Fallback Models
- `multimodal-vision` (multimodal 1): Multimodal AI · Vision-Language Models · Image Understanding · Image Generation
- `audio-video` (multimodal 2): Audio Processing · Speech-to-Text · Text-to-Speech · Video Understanding
- `ai-applications` (multimodal 3): Text-to-SQL · AI Chatbots · Enterprise Search
- `ai-security-injection` (security 1): AI Security · Prompt Injection · Jailbreak Prevention
- `privacy-guardrails` (security 2): Data Privacy · PII Redaction · Guardrails · Output Validation
- `red-teaming-responsible-ai` (security 3): AI Red Teaming · Responsible AI · AI Governance
- `observability` (llmops 1): LLM Observability · Tracing and Logging · Token Usage Tracking · Latency Monitoring
- `cost-caching` (llmops 2): Cost Optimization · Semantic Caching · Prompt Caching
- `reliability-async` (llmops 3): Rate Limiting · Retries and Timeouts · Async Processing · Background Jobs and Queues
- `production-deployment` (llmops 4): Production Deployment · Scalability and High Availability · Model Drift Monitoring
- `data-pipelines-indexing` (llmops 5): Data Pipelines · Incremental Indexing · Data Versioning · Embedding Migration · Synthetic Data Generation
- `transformer-internals` (internals 1): Transformer Internals · Attention Mechanisms
- `inference-optimization` (internals 2): GPU and Inference Optimization · KV Cache · Speculative Decoding · Distributed Inference
- `ai-architecture-fundamentals` (architecture 1): AI Application Architecture · Layered AI Architecture · Compound AI Systems · LLM Gateway
- `ai-architecture-patterns` (architecture 2): Hub-and-Spoke Architecture · Orchestrator-Worker Pattern · Router Pattern · Pipeline (Prompt Chaining) Pattern · Blackboard Architecture · Event-Driven Agent Architecture · Guardrail Sidecar Pattern
- `ai-reference-architectures` (architecture 3): Enterprise RAG Platform · AI Copilot Architecture · Multi-Tenant Agent Platform · Control Plane vs Data Plane for AI

---

## Interactive visualisations (src/viz/widgets/<id>/)

Study the reference widget `src/viz/widgets/transformer-attention/` and the framework `src/viz/core.tsx` first.
The learning goal is *segmenting + interactivity + prediction*: the learner steps through states, changes inputs and
predicts before revealing.

- `meta.ts`: `export const meta: VizMeta` with `placements: [{ topic, heading }]`, where `heading` is a **prefix** of a section heading (the checklist item names above).
- `sim.ts`: a pure, deterministic `simulate(params) => Frame[]`. Use `rng(seed)` from core. No React.
- `index.tsx`: `useSimulation`, `useFrames`, `VizFrame`, `Slider`, `Choice` from `../../core`. Inline SVG with `className="viz-svg"`, viewBox ~600 wide.
- 12–40 frames with precise captions, ≥2 `predict` prompts, and 2–4 meaningful parameters.
- Use CSS variables only (`--good --bad --warn --accent --muted --border --surface-2 --text --text-2` and `*-soft`) so it works in light and dark themes. Don't edit `src/index.css` or `src/viz/core.tsx`.
- SVG `role="img"` + `aria-label`. No JS animation loops.
- Verify: `npx tsc -p tsconfig.app.json --noEmit` and `npm run -s build`.
