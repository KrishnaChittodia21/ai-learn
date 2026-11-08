import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['tokenization.md', 'bert-gpt-t5.md'],
  blocks: [
    {
      title: 'Three transformer families',
      markdown: `| Factor | Encoder-only (BERT) | Decoder-only (GPT, Llama) | Encoder-decoder (T5, BART, Whisper) |
|---|---|---|---|
| Attention | bidirectional | causal mask | bidirectional encoder, causal decoder + cross-attention |
| Objective | masked tokens (MLM) | next token | span corruption / denoising |
| Generates text | no | yes, token by token | yes, from the encoder output |
| Use for | classification, embeddings, rerankers, NER | chat, code, reasoning | translation, speech-to-text, clear source → target |`,
    },
    {
      title: 'Subword algorithms',
      markdown: `| Algorithm | How it builds the vocabulary | Seen in |
|---|---|---|
| Byte-level BPE | start from 256 bytes, merge the most frequent adjacent pair until the target size; no unknown token | GPT family, Llama 3 |
| WordPiece | merges by \`count(AB) / (count(A)·count(B))\`; continuation pieces get \`##\` | BERT |
| Unigram | start large, prune tokens that least hurt corpus likelihood | SentencePiece models |
| SentencePiece | trains BPE or Unigram on raw text; space becomes \`▁\` | T5, many multilingual models |

- \`tiktoken\` only encodes with pre-built vocabularies; it does not train.
- Bigger vocabulary → shorter sequences but a bigger embedding matrix.
- **Fertility** = tokens per word; measure it on held-out text in each language you serve.`,
    },
    {
      title: 'Tokenizer bugs',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Garbage output after deploy | model trained with one vocabulary, served with another | pin the tokenizer with the model; check its hash in CI |
| Chat model rambles or ignores roles | prompt not in the model's chat template | use the tokenizer's chat template |
| \`"hello"\` and \`" hello"\` get different ids | leading-space ambiguity | be explicit about prefix spaces; don't end prompts with a stray space |
| Literal \`<\|endoftext\|>\` in user text acts as a control token | special tokens allowed on untrusted input | encode user text with specials disabled |
| Budget overflow in production | counted with the wrong encoding | count with the model's own tokenizer or the provider's count endpoint |`,
    },
  ],
};

export default sheet;
