import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'bpe-merge-step',
  entry: ['countPairs', 'bestPair', 'applyMerge', 'train'],
  problem: String.raw`Byte-Pair Encoding builds a tokenizer vocabulary from a corpus. It counts how often each pair of adjacent symbols occurs, merges the most frequent pair into a new symbol, and repeats. The merge list this loop makes is the tokenizer a language model reads its text with.

## Task

The corpus \`units\` is a list of distinct words, each as \`[symbols, frequency]\`: the word as an array of integer symbol ids, and how many times it occurs.

Write four functions.

1. \`countPairs(units)\` returns a \`Map\` from each adjacent pair to its count. A pair is keyed as the string \`"a,b"\`. A pair in a word adds the **frequency** of the word. Pairs do not cross from one word to the next.
2. \`bestPair(pairs)\` returns the pair with the highest count as \`[a, b]\`. On a tie, return the **smallest pair**, comparing a first, then b, as numbers: \`[2, 9]\` is smaller than \`[5, 1]\`, and \`[2, 9]\` is smaller than \`[10, 1]\`. When \`pairs\` is empty, return \`null\`.
3. \`applyMerge(symbols, pair, newId)\` returns a new array in which each occurrence of \`pair\` is replaced by \`newId\`. Scan from left to right; after a match, continue after the second symbol of the match, so two matches never share a symbol.
4. \`train(units, numMerges, firstId = 256)\` runs up to \`numMerges\` merge steps. Each step counts the pairs, picks the best pair and merges it in every word. Merge number i (from 0) gets the id \`firstId + i\`. Stop early when there are no pairs or when the best pair's count is less than 2.

\`train\` returns \`[merges, units]\`: \`merges\` is a list of \`[pair, newId]\` in training order, and \`units\` is the merged corpus as a **new** list. Two words that become the same after a merge are one entry whose frequencies add up; keep entries in the order their first word appears.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`units\` | \`[number[], number][]\` | each distinct word with its frequency |
| \`pairs\` | \`Map<string, number>\` | pair counts keyed \`"a,b"\`, as \`countPairs\` returns them |
| \`symbols\` | \`number[]\` | one word, length 0 or more |
| \`pair\` | \`[number, number]\` | the pair to merge |
| \`newId\` | \`number\` | the id of the merged symbol |
| \`numMerges\` | \`number\` | the largest number of merges, 0 or more |

## Constraints

- Frequencies are 1 or more. \`newId\` and the ids from \`firstId\` do not occur in the corpus before the merge.
- Do not change the input arrays.

## Examples

\`\`\`ts
const units: [number[], number][] = [[[1, 2, 3], 5], [[1, 2], 3], [[2, 3, 2, 3], 2]];
countPairs(units);              // Map { '1,2' => 8, '2,3' => 9, '3,2' => 2 }
applyMerge([7, 7, 7], [7, 7], 300); // [300, 7]

const bytes = (s: string) => [...s].map((c) => c.charCodeAt(0));
train([[bytes('low'), 5], [bytes('lower'), 2], [bytes('newest'), 6], [bytes('widest'), 3]], 4);
// [ [[[101, 115], 256], [[256, 116], 257], [[108, 111], 258], [[258, 119], 259]],
//   [[[259], 5], [[259, 101, 114], 2], [[110, 101, 119, 257], 6], [[119, 105, 100, 257], 3]] ]
\`\`\`

In the first step, \`(101, 115)\` and \`(115, 116)\` both have count 9. The smaller pair \`(101, 115)\` wins the tie.`,
  starter: `function countPairs(units: [number[], number][]): Map<string, number> {
  throw new Error('not implemented');
}

function bestPair(pairs: Map<string, number>): [number, number] | null {
  throw new Error('not implemented');
}

function applyMerge(symbols: number[], pair: [number, number], newId: number): number[] {
  throw new Error('not implemented');
}

function train(units: [number[], number][], numMerges: number, firstId = 256): [[[number, number], number][], [number[], number][]] {
  throw new Error('not implemented');
}
`,
  solution: `function countPairs(units: [number[], number][]): Map<string, number> {
  const pairs = new Map<string, number>();
  for (const [symbols, count] of units) {
    for (let i = 0; i < symbols.length - 1; i++) {
      const key = symbols[i] + ',' + symbols[i + 1];
      pairs.set(key, (pairs.get(key) ?? 0) + count);
    }
  }
  return pairs;
}

function bestPair(pairs: Map<string, number>): [number, number] | null {
  let best: [number, number] | null = null;
  let bestCount = 0;
  for (const [key, c] of pairs) {
    const [a, b] = key.split(',').map(Number);
    if (c > bestCount || (c === bestCount && best !== null && (a < best[0] || (a === best[0] && b < best[1])))) {
      best = [a, b];
      bestCount = c;
    }
  }
  return best;
}

function applyMerge(symbols: number[], pair: [number, number], newId: number): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < symbols.length) {
    if (i < symbols.length - 1 && symbols[i] === pair[0] && symbols[i + 1] === pair[1]) {
      out.push(newId);
      i += 2;
    } else {
      out.push(symbols[i]);
      i += 1;
    }
  }
  return out;
}

function train(units: [number[], number][], numMerges: number, firstId = 256): [[[number, number], number][], [number[], number][]] {
  const merges: [[number, number], number][] = [];
  for (let i = 0; i < numMerges; i++) {
    const pairs = countPairs(units);
    const best = bestPair(pairs);
    if (best === null || (pairs.get(best.join(',')) ?? 0) < 2) break;
    const merged = new Map<string, [number[], number]>();
    for (const [symbols, count] of units) {
      const m = applyMerge(symbols, best, firstId + i);
      const key = m.join(',');
      merged.set(key, [m, (merged.get(key)?.[1] ?? 0) + count]);
    }
    units = [...merged.values()];
    merges.push([best, firstId + i]);
  }
  return [merges, units];
}
`,
  hints: [
    'Loop over the words and over positions i from 0 to symbols.length - 2. The pair at i is (symbols[i], symbols[i + 1]); add the word frequency to its count.',
    'For the tie rule, compare the numbers of the pair, not the key strings: "10,1" sorts before "2,9" as text, but [2, 9] is the smaller pair.',
    'Write applyMerge with a while loop and an index i. On a match, push newId and add 2 to i; otherwise push the symbol and add 1. A plain for…of cannot skip the second symbol of a match.',
    'In train, build a new list each step. Two words can become the same array after a merge, so add their frequencies (a Map keyed by the joined symbols helps). Check the best count before merging; stop when it is below 2.',
  ],
  notes: String.raw`## Why the merge must not overlap

The pair (a, a) in [a, a, a] matches at position 0 and at position 1; both matches use the middle symbol. One symbol cannot become part of two new symbols, so the scan skips past a match. The result [new, a] keeps every original symbol exactly once, and decoding gives back the same bytes.

## Why a fixed tie rule

Pair counts tie often in a small corpus. "The first key with the highest count" depends on the order the words came in. A tie rule on the pair itself makes training deterministic: two runs over the same corpus give the same merge table, and the same text gives the same ids.

## Why the minimum count of 2

A pair that occurs once saves one symbol in one word, and adds an id the model almost never sees. Training stops there.

## Speed

This loop counts every pair again after each merge. A production trainer keeps the counts and updates only the words that contain the merged pair; the result is the same.

## Where this goes next

The encoder applies the merge list in training order to new text. Real tokenizers add pre-tokenization (split on spaces and punctuation) and special tokens around the same merge step.`,
  tests: (sub, { check, equal, ok, rng }) => {
    type Units = [number[], number][];
    const UNITS: Units = [
      [[1, 2, 3], 5],
      [[1, 2], 3],
      [[2, 3, 2, 3], 2],
    ];
    const WORDS: Units = [
      [[108, 111, 119], 5],
      [[108, 111, 119, 101, 114], 2],
      [[110, 101, 119, 101, 115, 116], 6],
      [[119, 105, 100, 101, 115, 116], 3],
    ];
    const copy = (u: Units): Units => u.map(([s, c]) => [[...s], c]);
    /** a Map (or object) of pair counts as sorted [key, count] entries, so key order does not matter */
    const entries = (m: Map<string, number> | Record<string, number>) => (m instanceof Map ? [...m] : Object.entries(m)).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const weightedLength = (u: Units) => u.reduce((s, [sym, c]) => s + sym.length * c, 0);
    const randomUnits = (r: () => number, words: number, alphabet: number, maxLen: number, maxCount: number): Units => {
      const m = new Map<string, [number[], number]>();
      for (let w = 0; w < words; w++) {
        const sym = Array.from({ length: 1 + Math.floor(r() * maxLen) }, () => Math.floor(r() * alphabet));
        const k = sym.join(',');
        m.set(k, [sym, (m.get(k)?.[1] ?? 0) + 1 + Math.floor(r() * maxCount)]);
      }
      return [...m.values()];
    };

    check('pair counts of the small corpus', 'Each adjacent pair in a word counts once for each time the word appears: add the word frequency, not 1.', () => {
      equal(entries(sub.countPairs(UNITS)), entries({ '1,2': 8, '2,3': 9, '3,2': 2 }), 'countPairs(units)');
    });
    check('best pair of the small corpus', 'The best pair is the pair with the highest count.', () => {
      equal(sub.bestPair(new Map([['1,2', 8], ['2,3', 9], ['3,2', 2]])), [2, 3], 'bestPair(pairs)');
    });
    check('a merge does not overlap', 'Scan from left to right; after a match skip both symbols, so [7, 7, 7] with the pair (7, 7) gives [300, 7].', () => {
      equal(sub.applyMerge([7, 7, 7], [7, 7], 300), [300, 7], 'applyMerge([7, 7, 7], [7, 7], 300)');
    });
    check('four merges on the word corpus', 'The pairs (101, 115) and (115, 116) both have count 9; the smaller pair wins the tie.', () => {
      const [merges, units] = sub.train(copy(WORDS), 4);
      equal(merges, [[[101, 115], 256], [[256, 116], 257], [[108, 111], 258], [[258, 119], 259]], 'the merge list');
      equal(units, [[[259], 5], [[259, 101, 114], 2], [[110, 101, 119, 257], 6], [[119, 105, 100, 257], 3]], 'the merged units');
    });
    check('the total pair count matches the word lengths', 'A word of length L has L - 1 adjacent pairs, so the pair counts sum to Σ (L - 1) × frequency.', () => {
      const units = randomUnits(rng(3), 30, 5, 8, 6);
      const total = [...(sub.countPairs(units) as Map<string, number>).values()].reduce((a, b) => a + b, 0);
      equal(total, units.reduce((s, [sym, c]) => s + (sym.length - 1) * c, 0), 'the sum of the pair counts');
    });
    check('each merge makes the corpus shorter', 'A merge replaces two symbols with one, so the weighted length goes down after every merge, and the frequencies keep their sum.', () => {
      const units = randomUnits(rng(4), 25, 4, 7, 5);
      const total = units.reduce((s, [, c]) => s + c, 0);
      let previous = weightedLength(units);
      for (let steps = 1; steps <= 5; steps++) {
        const [merges, merged] = sub.train(copy(units), steps);
        ok(merges.length === steps, `train stopped after ${merges.length} merges, but the corpus still has pairs with count 2 or more`);
        const now = weightedLength(merged);
        ok(now < previous, `merge ${steps} did not make the corpus shorter (${now}, before ${previous})`);
        equal((merged as Units).reduce((s, [, c]) => s + c, 0), total, `the sum of the word frequencies after ${steps} merges`);
        previous = now;
      }
    });
    check('new ids count up from firstId', 'Merge number i gets the id firstId + i. The ids do not skip and do not repeat.', () => {
      const [merges] = sub.train(copy(WORDS), 6, 1000);
      equal(
        (merges as [unknown, number][]).map((m) => m[1]),
        merges.map((_: unknown, i: number) => 1000 + i),
        'the new ids',
      );
    });
    check('replaying the merges gives the trained corpus', 'Encoding applies the merges in training order; each word must then match the trained units.', () => {
      const units = randomUnits(rng(5), 20, 4, 9, 4);
      const [merges, trained] = sub.train(copy(units), 8);
      const replayed = new Map<string, [number[], number]>();
      for (const [symbols, count] of units) {
        let s = symbols;
        for (const [pair, id] of merges) s = sub.applyMerge(s, pair, id);
        replayed.set(s.join(','), [s, (replayed.get(s.join(','))?.[1] ?? 0) + count]);
      }
      equal([...replayed.values()], trained, 'the corpus after applying each merge in order');
    });
    check('the input corpus is not changed', 'train must build a new list. The caller keeps the original corpus to encode it again.', () => {
      const units = copy(WORDS);
      sub.train(units, 3);
      sub.countPairs(units);
      equal(units, WORDS, 'the corpus after the calls');
    });
    check('runs of one symbol merge in pairs', 'Non-overlapping merges turn four equal symbols into two new symbols, and five into two new symbols and one old one.', () => {
      equal(sub.applyMerge([4, 4, 4, 4], [4, 4], 9), [9, 9], 'applyMerge([4, 4, 4, 4], [4, 4], 9)');
      equal(sub.applyMerge([4, 4, 4, 4, 4], [4, 4], 9), [9, 9, 4], 'applyMerge([4, 4, 4, 4, 4], [4, 4], 9)');
      equal(sub.applyMerge([1, 2, 1, 2, 1], [1, 2], 300), [300, 300, 1], 'applyMerge([1, 2, 1, 2, 1], [1, 2], 300)');
    });
    check('short and empty inputs', 'A one-symbol word has no pairs. An empty pair table has no best pair, so bestPair returns null.', () => {
      equal(sub.applyMerge([], [1, 2], 9), [], 'applyMerge([], [1, 2], 9)');
      equal(sub.applyMerge([5], [5, 5], 9), [5], 'applyMerge([5], [5, 5], 9)');
      equal(entries(sub.countPairs([[[5], 3]])), [], 'countPairs of a one-symbol word');
      equal(entries(sub.countPairs([])), [], 'countPairs([])');
      equal(sub.bestPair(new Map()), null, 'bestPair(new Map())');
    });
    check('ties go to the smallest pair', 'Compare tied pairs as numbers, first id then second: [2, 9] beats [5, 1] and [10, 1].', () => {
      equal(sub.bestPair(new Map([['5,1', 4], ['2,9', 4], ['3,3', 1]])), [2, 9], 'bestPair with a tie at count 4');
      equal(sub.bestPair(new Map([['3,8', 2], ['3,4', 2]])), [3, 4], 'bestPair with a tie on the first id');
      equal(sub.bestPair(new Map([['10,1', 3], ['2,9', 3]])), [2, 9], 'bestPair with a two-digit id');
    });
    check('training stops when no pair repeats', 'A merge needs a pair count of 2 or more. When the best count is 1 or there are no pairs, train stops early.', () => {
      equal(sub.train([[[1, 2], 1]], 3), [[], [[[1, 2], 1]]], 'train([[[1, 2], 1]], 3)');
      equal(sub.train([[[1, 2, 3, 4], 1], [[3, 4], 1]], 5), [[[[3, 4], 256]], [[[1, 2, 256], 1], [[256], 1]]], 'train on a corpus with one repeated pair');
      equal(sub.train([[[7], 4]], 2), [[], [[[7], 4]]], 'train on one-symbol words');
      equal(sub.train(copy(WORDS), 0), [[], WORDS], 'train with numMerges = 0');
    });
    check('matches the reference on random corpora', 'Your pair counts, merges and training agree with the reference solution.', () => {
      const pairUnits: Units = [[[3, 3, 2, 3, 3, 0, 0, 1], 4], [[1, 3, 1, 3, 2, 2, 0], 5], [[3, 3, 3, 0, 3, 1, 2], 2], [[0], 13], [[1, 1, 0, 0, 3, 2, 0, 0], 4], [[3, 0, 2, 0, 0, 0, 1, 1], 6], [[1, 3, 2, 2], 6], [[3, 0, 1], 2], [[3], 1], [[3, 2, 3, 0], 4], [[2], 1]];
      equal(entries(sub.countPairs(pairUnits)), entries({ '3,3': 12, '3,2': 23, '2,3': 8, '3,0': 18, '0,0': 24, '0,1': 12, '1,3': 16, '3,1': 7, '2,2': 11, '2,0': 15, '0,3': 6, '1,2': 2, '1,1': 10, '1,0': 4, '0,2': 6 }), 'countPairs on an 11-word corpus');
      equal(sub.applyMerge([0, 2, 0, 1, 1, 0, 1, 2, 1, 2, 2, 0, 0, 1, 0, 2, 2, 2, 2, 1, 2, 2, 2, 0, 0], [2, 2], 99), [0, 2, 0, 1, 1, 0, 1, 2, 1, 99, 0, 0, 1, 0, 99, 99, 1, 99, 2, 0, 0], 'applyMerge on a 25-symbol word with the pair [2, 2]');
      const trainUnits: Units = [[[2, 2, 2, 0, 2, 2, 0, 0, 0], 5], [[1, 1, 2, 0, 2, 2, 0, 2, 2], 2], [[2, 2, 0, 1, 1], 3], [[2, 1, 2, 1, 2, 0, 2, 2], 4], [[0, 0, 0, 2, 1], 6], [[1, 1, 2, 1], 6], [[0, 2, 1, 2, 2, 0], 1], [[0, 0, 1, 1, 2, 2, 1], 2], [[0, 0, 0, 2, 2], 2], [[0], 1]];
      const [merges, units] = sub.train(trainUnits, 5);
      equal(merges, [[[2, 2], 256], [[0, 0], 257], [[2, 1], 258], [[0, 256], 259], [[1, 1], 260]], 'the merge list for 5 merges');
      equal(units, [[[256, 2, 259, 257, 0], 5], [[260, 2, 259, 259], 2], [[256, 0, 260], 3], [[258, 258, 2, 259], 4], [[257, 0, 258], 6], [[260, 258], 6], [[0, 258, 256, 0], 1], [[257, 260, 256, 1], 2], [[257, 259], 2], [[0], 1]], 'the corpus after 5 merges');
    });
  },
};

export default drill;
