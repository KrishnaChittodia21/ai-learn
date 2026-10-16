import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'langgraph-execution',
  title: 'Inside a LangGraph run: supersteps, reducers and checkpoints',
  blurb:
    'Step a StateGraph through agent ↔ tools supersteps and watch reducers merge each partial update (append, sum, overwrite) and a checkpoint land on the thread. Trip GraphRecursionError, pause in interrupt() and resume with Command({ resume }), or rewind with time travel and fork.',
  placements: [
    { topic: 'langgraph', heading: 'LangGraph Fundamentals' },
    { topic: 'langgraph', heading: 'Conditional Edges and Cycles' },
    { topic: 'langgraph', heading: 'Persistence and Checkpointers' },
    { topic: 'langgraph', heading: 'Human-in-the-Loop with interrupt()' },
  ],
};
