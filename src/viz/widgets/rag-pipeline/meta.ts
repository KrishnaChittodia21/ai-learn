import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'rag-pipeline',
  title: 'A RAG request end to end: retrieve, rerank, pack, answer',
  blurb:
    'Follow one question through embedding, top-k retrieval, an optional cross-encoder rerank and token-budgeted prompt assembly to a cited answer, and make it fail: the wrong chunk without reranking, or the right chunk lost to context overflow.',
  placements: [
    { topic: 'rag-fundamentals', heading: 'RAG Fundamentals' },
    { topic: 'rag-fundamentals', heading: 'Naive RAG' },
  ],
};
