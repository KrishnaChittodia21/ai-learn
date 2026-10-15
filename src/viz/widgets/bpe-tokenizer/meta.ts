import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'bpe-tokenizer',
  title: 'Byte-pair encoding: watch a tokenizer learn its vocabulary',
  blurb:
    'Start from 256 bytes, merge the most frequent pair again and again, and watch the vocabulary grow while the token count of your text shrinks. Then see why "unhappiness", numbers and non-English text cost more tokens.',
  placements: [{ topic: 'transformers-tokenization', heading: 'Tokenization' }],
};
