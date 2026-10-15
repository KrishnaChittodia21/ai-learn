// Pure, deterministic byte-pair encoding (BPE). No React, Node-testable.
// 1. Pre-tokenise the training corpus into words; each word starts with "▁" (the space byte).
// 2. Base vocabulary = 256 byte tokens. ASCII bytes print as the character, non-ASCII bytes as <C3>.
// 3. Training: repeatedly count adjacent symbol pairs (weighted by word frequency), merge the most
//    frequent pair into a new token (ties → alphabetical), vocab += 1.
// 4. Encoding new text: apply the learned merges in the order they were learned.
import type { BaseFrame } from '../../core';

export type TextChoice = 'common' | 'unhappiness' | 'numbers' | 'non-english';

export interface Params {
  text: TextChoice;
  merges: number;
}

export const DEFAULT_PARAMS: Params = { text: 'unhappiness', merges: 24 };
export const MIN_MERGES = 8;
export const MAX_MERGES = 32;
export const BASE_VOCAB = 256;

/** tiny training corpus: word → frequency */
export const CORPUS: [string, number][] = [
  ['the', 50],
  ['is', 30],
  ['in', 26],
  ['happy', 10],
  ['happiness', 18],
  ['unable', 9],
  ['undo', 8],
  ['unfair', 7],
  ['kindness', 9],
  ['darkness', 8],
  ['sadness', 6],
  ['newest', 6],
  ['lowest', 7],
  ['sold', 6],
  ['price', 16],
  ['prices', 5],
  ['rare', 6],
];

export const TEXTS: Record<TextChoice, { label: string; text: string }> = {
  common: { label: 'Common words', text: 'the happiness is in the price' },
  unhappiness: { label: '"unhappiness"', text: 'unhappiness is rare' },
  numbers: { label: 'Numbers', text: 'sold 12345 in 2024' },
  'non-english': { label: 'Non-English', text: 'café naïve über' },
};

/** UTF-8 bytes of one character, rendered as display tokens */
export function charBytes(ch: string): string[] {
  const code = ch.codePointAt(0)!;
  if (code < 128) return [ch];
  const bytes = Array.from(new TextEncoder().encode(ch));
  return bytes.map((b) => `<${b.toString(16).toUpperCase().padStart(2, '0')}>`);
}

export function wordToBytes(word: string): string[] {
  return ['▁', ...Array.from(word).flatMap(charBytes)];
}

export interface Merge {
  a: string;
  b: string;
  count: number;
}

function mergeSymbols(sym: string[], a: string, b: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < sym.length; i++) {
    if (i < sym.length - 1 && sym[i] === a && sym[i + 1] === b) {
      out.push(a + b);
      i++;
    } else out.push(sym[i]);
  }
  return out;
}

/** learn `n` merges from the corpus */
export function train(n: number): Merge[] {
  let words = CORPUS.map(([w, c]) => ({ sym: wordToBytes(w), c }));
  const merges: Merge[] = [];
  for (let k = 0; k < n; k++) {
    const counts = new Map<string, number>();
    for (const { sym, c } of words) for (let i = 0; i < sym.length - 1; i++) counts.set(sym[i] + '\u0000' + sym[i + 1], (counts.get(sym[i] + '\u0000' + sym[i + 1]) ?? 0) + c);
    let best = '';
    let bestC = 0;
    for (const [key, c] of counts) if (c > bestC || (c === bestC && key < best)) [best, bestC] = [key, c];
    if (bestC < 2) break;
    const [a, b] = best.split('\u0000');
    merges.push({ a, b, count: bestC });
    words = words.map(({ sym, c }) => ({ sym: mergeSymbols(sym, a, b), c }));
  }
  return merges;
}

/** encode text with the first `k` merges (applied in learned order) */
export function encode(text: string, merges: Merge[], k: number): string[][] {
  return text.split(' ').map((w) => {
    let sym = wordToBytes(w);
    for (let i = 0; i < k; i++) sym = mergeSymbols(sym, merges[i].a, merges[i].b);
    return sym;
  });
}

export type Stage = 'intro' | 'bytes' | 'merge' | 'final' | 'why' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** merges applied so far */
  k: number;
  /** the text segmented with k merges, one array per word */
  words: string[][];
  tokenCount: number;
  vocab: number;
  /** index of the merge just learned (stage 'merge') */
  lastMerge: number | null;
}

const show = (t: string) => `"${t}"`;

export function simulate({ text, merges: nMerges }: Params): Frame[] {
  const all = train(nMerges);
  const n = all.length;
  const src = TEXTS[text].text;
  const frames: Frame[] = [];
  const at = (k: number) => {
    const words = encode(src, all, k);
    return { k, words, tokenCount: words.reduce((s, w) => s + w.length, 0), vocab: BASE_VOCAB + k };
  };
  const push = (f: Omit<Frame, 'k' | 'words' | 'tokenCount' | 'vocab'>, k: number) => frames.push({ ...at(k), ...f });

  const charCount = Array.from(src).length;
  const byteCount = new TextEncoder().encode(src).length;
  push(
    {
      stage: 'intro',
      lastMerge: null,
      caption: `BPE learns its vocabulary from a training corpus (${CORPUS.length} distinct words, e.g. "the" ×50, "happiness" ×18, "kindness" ×9), then reuses it to split any new text. Our text: ${show(src)}.`,
    },
    0,
  );
  const s0 = at(0);
  push(
    {
      stage: 'bytes',
      lastMerge: null,
      caption: `Start with the 256 byte tokens: ${charCount} characters → ${byteCount} UTF-8 bytes, plus one "▁" (space) per word = ${s0.tokenCount} tokens. Nothing is ever "unknown": any string can fall back to bytes.`,
      predict: `Counting adjacent pairs across the corpus (weighted by word frequency), which pair do you think is most frequent and gets merged first?`,
    },
    0,
  );
  const midK = Math.max(2, Math.floor(n / 2));
  for (let k = 1; k <= n; k++) {
    const m = all[k - 1];
    const cur = at(k);
    const prev = at(k - 1);
    const delta = prev.tokenCount - cur.tokenCount;
    let caption = `Merge #${k}: ${show(m.a)} + ${show(m.b)} → ${show(m.a + m.b)} (pair seen ${m.count}× in the corpus). Vocab = ${cur.vocab}.`;
    caption += delta > 0 ? ` Our text shrinks by ${delta} to ${cur.tokenCount} tokens.` : ` Our text does not contain this pair: still ${cur.tokenCount} tokens.`;
    push(
      {
        stage: 'merge',
        lastMerge: k - 1,
        caption,
        predict:
          k === midK
            ? text === 'unhappiness'
              ? `"unhappiness" never appears in the corpus. After all ${n} merges, will it be one token, or which pieces do you expect?`
              : text === 'numbers'
                ? `The corpus has no digits. How many tokens will "12345" end up as after all ${n} merges?`
                : text === 'non-english'
                  ? `"é" is 2 bytes in UTF-8 and the corpus is English only. How many tokens will "café" need at the end?`
                  : `Every word here is in the corpus. Will each word end up as a single token?`
            : undefined,
      },
      k,
    );
  }
  const fin = at(n);
  const segs = fin.words.map((w) => w.join('·')).join('  ');
  push(
    {
      stage: 'final',
      lastMerge: null,
      caption: `Final encoding with ${n} merges (vocab ${fin.vocab}): ${segs} → ${fin.tokenCount} tokens for ${fin.words.length} words (${(fin.tokenCount / fin.words.length).toFixed(1)} tokens/word, ${(charCount / fin.tokenCount).toFixed(1)} chars/token).`,
      predict: `A production tokenizer has 50k–200k merges instead of ${n}. Would this text use more or fewer tokens there, and would the ratio between languages change?`,
    },
    n,
  );
  const whole = fin.words.filter((w) => w.length === 1).length;
  const why: Record<TextChoice, string> = {
    common: `${whole} of ${fin.words.length} words are now a single token: frequent words collapse into whole-word tokens because their pairs dominate the counts. English prose averages ~4 characters (~0.75 words) per token in GPT-style tokenizers.`,
    unhappiness: `"unhappiness" is unseen, so it is built from learned sub-words (${fin.words[0].join(' · ')}). Rare or new words cost more tokens, yet nothing is out-of-vocabulary.`,
    numbers: `Digits never appeared in training, so "12345" and "2024" stay one byte per digit. Real tokenizers split numbers into 1–3 digit chunks, which is one reason LLMs are clumsy at arithmetic.`,
    'non-english': `Accented letters are 2 UTF-8 bytes and the English corpus never merged them, so "é", "ï", "ü" cost 2 tokens each. Under-represented languages pay more tokens (cost, latency, context) for the same meaning.`,
  };
  push({ stage: 'why', lastMerge: null, caption: why[text] }, n);
  push(
    {
      stage: 'done',
      lastMerge: null,
      caption: `Recap: tokens ≠ words. Pricing, context limits and latency are all counted in tokens, so always measure with the model's own tokenizer (e.g. tiktoken) rather than counting words.`,
    },
    n,
  );
  return frames;
}
