# GenAI Learn

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

## Adding content

Topic files live in `src/content/topics/*.ts` and must match `src/types.ts`. `CONTENT_GUIDE.md` has the rules and the topic map. Run `npm run validate` after any change.
