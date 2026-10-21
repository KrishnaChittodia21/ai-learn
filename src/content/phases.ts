import type { Level, PhaseId } from '../types';

export interface Phase {
  id: PhaseId;
  number: number;
  title: string;
  blurb: string;
  level: Level;
}

export const LEVELS: { id: Level; title: string; blurb: string }[] = [
  { id: 'beginner', title: 'Beginner', blurb: 'How LLMs work, prompting, APIs and embeddings.' },
  { id: 'intermediate', title: 'Intermediate', blurb: 'Ingestion, chunking, vector search, retrieval, RAG and evaluation.' },
  { id: 'advanced', title: 'Advanced', blurb: 'Agents, MCP, fine-tuning, security, LLMOps, inference internals and architecture.' },
];

export const PHASES: Phase[] = [
  { id: 'foundations', number: 1, level: 'beginner', title: 'GenAI Foundations', blurb: 'What GenAI and LLMs are, transformers and tokenization.' },
  { id: 'prompting', number: 2, level: 'beginner', title: 'Prompting & LLM APIs', blurb: 'Prompting fundamentals, reasoning techniques (chain-of-thought, self-consistency, chaining, ReAct), templates and prompt safety, structured outputs, tool calling, APIs and streaming.' },
  { id: 'embeddings', number: 3, level: 'beginner', title: 'Embeddings & Similarity', blurb: 'Turning meaning into vectors and comparing them.' },
  { id: 'ingestion', number: 4, level: 'intermediate', title: 'Data Ingestion & Chunking', blurb: 'Parsing, OCR, preprocessing and every chunking strategy that matters.' },
  { id: 'vector-search', number: 5, level: 'intermediate', title: 'Vector Databases & Search', blurb: 'Vector stores, indexing, ANN, HNSW/IVF and metadata filtering.' },
  { id: 'retrieval', number: 6, level: 'intermediate', title: 'Retrieval Techniques', blurb: 'BM25, dense, sparse, hybrid, query transformations, reranking and context engineering.' },
  { id: 'rag', number: 7, level: 'intermediate', title: 'RAG Architectures', blurb: 'From naive RAG to CRAG, Self-RAG, Agentic RAG, GraphRAG and multimodal RAG, plus long context vs RAG, conversational RAG and permission-aware retrieval.' },
  { id: 'evaluation', number: 8, level: 'intermediate', title: 'Evaluation & Testing', blurb: 'Retrieval metrics, groundedness, LLM-as-a-judge, regression tests, online A/B evaluation, pairwise comparison, error bars and benchmarks.' },
  { id: 'agents', number: 9, level: 'advanced', title: 'AI Agents', blurb: 'ReAct, planning, memory, tools, multi-agent systems, human-in-the-loop, state machines, and evaluating and safeguarding agents.' },
  { id: 'frameworks', number: 10, level: 'advanced', title: 'Frameworks, MCP & Knowledge Graphs', blurb: 'LangChain, LangGraph, LlamaIndex, Model Context Protocol, graph-based retrieval and the modern agent stack: agent SDKs, computer use, A2A and reflection.' },
  { id: 'models', number: 11, level: 'advanced', title: 'Fine-Tuning & Models', blurb: 'SFT, LoRA/QLoRA, RLHF/DPO, distillation, open-source LLMs, serving and routing.' },
  { id: 'multimodal', number: 12, level: 'advanced', title: 'Multimodal & AI Applications', blurb: 'Vision, audio, video, Text-to-SQL, chatbots and enterprise search.' },
  { id: 'security', number: 13, level: 'advanced', title: 'AI Security & Responsible AI', blurb: 'Prompt injection, jailbreaks, PII, guardrails, red teaming and governance.' },
  { id: 'llmops', number: 14, level: 'advanced', title: 'LLMOps & Production', blurb: 'Observability, cost, caching, reliability, deployment and data pipelines.' },
  { id: 'internals', number: 15, level: 'advanced', title: 'Transformer Internals & Inference', blurb: 'Attention math, GPU optimisation, KV cache, speculative decoding and distributed inference.' },
  { id: 'architecture', number: 16, level: 'advanced', title: 'AI Application Architecture', blurb: 'Hub-and-spoke, gateways, orchestrator-worker and end-to-end reference architectures.' },
];
