import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'chunking-playground',
  title: 'Chunking playground: size, overlap and where the cuts land',
  blurb:
    'Split a refund policy with fixed-size or recursive chunking, drag chunk size and overlap, and watch sentences get cut mid-way, overlap tokens get duplicated, and a retrieval question succeed or fail.',
  placements: [
    { topic: 'chunking-fundamentals', heading: 'Chunk Size and Overlap' },
    { topic: 'chunking-fundamentals', heading: 'Chunking Strategies' },
  ],
};
