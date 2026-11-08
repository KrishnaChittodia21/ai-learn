# GenAI Field Manual

A React app that takes you from zero to confident in Generative AI: **less reading, more practising**.

## Run

    npm install
    npm run dev        # http://localhost:5173
    npm run build      # static build in dist/ (hash routing, works on any static host)
    npm run validate   # checks every topic file against the content rules

## What's inside

- **The journey has three levels and 16 phases.**
  - **Beginner:** GenAI foundations, transformers and tokenization, prompting, structured outputs and tool calling, LLM APIs and streaming, embeddings.
  - **Intermediate:** ingestion and chunking, vector databases and ANN (HNSW/IVF), retrieval (BM25, dense, sparse, hybrid, query transformations, reranking, RRF, context engineering), RAG architectures (naive → CRAG, Self-RAG, Agentic RAG, GraphRAG, multimodal) and evaluation.
  - **Advanced:** agents (ReAct, planning, memory, multi-agent, HITL, state machines), LangChain/LangGraph/LlamaIndex, MCP, knowledge graphs, fine-tuning (SFT, LoRA, QLoRA, RLHF, DPO, distillation), open-source and local LLMs, serving and routing, multimodal, security and guardrails, LLMOps, inference internals (KV cache, speculative decoding), and **AI application architecture** (hub-and-spoke, LLM gateway, orchestrator-worker, router, blackboard, event-driven, reference architectures).
- **Every section is practice-first:** a short explanation, a worked example, a diagram and code, **pros and cons where every con comes with its fix**, a **"Try it" coding exercise** (editor, hints, solution) and a **quick check**.
- **Every topic has:** a Code Lab (fix realistic buggy GenAI code), scenario questions with model answers, estimation drills (tokens, cost, latency, GPU memory), a cheat sheet and a **timed exam**. Passing the exam marks the topic as covered on your journey map.
- **Interactive animations:** BPE tokenization, vector similarity, chunking, HNSW search, hybrid search and RRF, the RAG pipeline, the ReAct loop, hub-and-spoke routing, KV cache, semantic cache and self-attention.
- **Architecture Challenges:** end-to-end GenAI system design problems. They unlock once every exam is passed.

Progress is saved in your browser's localStorage. You can reset it in Settings.

## Design

The UI is the *Field Manual*: warm paper (or a "night desk" dark theme), ink-black type, hairline rules instead of boxes and shadows, and one signal colour (vermilion, switchable in Settings) for actions and "you are here". Headlines use Newsreader, reading text Inter, and labels and numbering JetBrains Mono.

Styles live in `src/styles/`: `tokens.css` (all colours, type, spacing and radii), `base.css` (elements and primitives), `shell.css` (masthead and footer), and one file per screen. Use the tokens rather than raw values.

## Adding content

Topic files live in `src/content/topics/*.ts` and must match `src/types.ts`. `CONTENT_GUIDE.md` has the rules and the topic map. Run `npm run validate` after any change.

## Credits

- **Motion (M9):** parts of the motion kit are adapted from [VengeanceUI](https://github.com/Ashutoshx7/VengeanceUI) by Ashutoshx7, MIT licence, © 2025–2026 Ashutoshx7: the border beam (`base.css` `.beam`, from `border-beam.tsx`), the heading reveal (`HeadingReveal.tsx`, from `staggerText.tsx`), the Shorts "Ready to watch" deck and perspective row (`ShortsQueue.tsx`, from `verse-cards.tsx` and `perspective-carousel.tsx`), the ⌘K layout (`CommandPalette.tsx`, from `search-modal.tsx`) and the badge tilt's spring-follow (`TiltBadge.tsx`, from `cursor-card.tsx`). Each file carries the notice in its header. Rewritten for plain CSS and `motion/react`; no Tailwind, GSAP or framer-motion.
- **Content (C1–C4):** some lessons are adapted from [ai-engineering-from-scratch](https://github.com/rohitg00/ai-engineering-from-scratch) by Rohit Ghumare, MIT licence, including the **Agent Skills**, **Working with Coding Agents**, **AI Product Delivery** and **Alignment and Frontier Risk** topics (`src/content/topics/agent-skills.ts`, `coding-agents.ts`, `ai-product-delivery.ts`, `alignment-frontier-risk.ts`). Rewritten in ai-learn's own words and format; each adapted topic cites the source lessons. The extra reference tables on many topics' **Cheat sheet** tab (`src/content/cheatsheets/*.ts`) are adapted from its `cheatsheets/` folder the same way; each lists its source sheets under the tab. The seven **learning paths by role** (`src/content/roles.ts`: summaries, fit and responsibilities, mapped onto ai-learn's topics) are adapted from its `learning-paths/*.json` and `interviews/roles.yaml`. The ten **from-scratch drills** (`#/drills`, `src/content/drills/*.ts`: graded TypeScript exercises whose tests run in the browser) are ported from its `practice/` problems (Python/numpy → TypeScript), with their hints, notes and mutants (`tests/drill-mutants/`). The **Glossary** (`#/glossary`, `src/content/glossary.ts`) and its **Myths** list (`src/content/myths.ts`) are adapted from its `glossary/terms.md` and `glossary/myths.md`: GenAI-engineering terms kept, links to its own lessons removed, myths fact-checked and softened. Its licence notice:

  > MIT License
  >
  > Copyright (c) 2026 Rohit Ghumare
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy
  > of this software and associated documentation files (the "Software"), to deal
  > in the Software without restriction, including without limitation the rights
  > to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  > copies of the Software, and to permit persons to whom the Software is
  > furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all
  > copies or substantial portions of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  > IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  > FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  > AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  > LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  > OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  > SOFTWARE.
