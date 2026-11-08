import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'bm25',
  entry: ['idf', 'bm25Scores', 'rank'],
  problem: String.raw`BM25 is the standard ranking function for keyword search. It gives a high score to a document that contains rare query terms many times, and it corrects for the length of the document. Hybrid retrieval pipelines run BM25 next to a dense vector search.

## Task

Write three functions. The documents and the query are lists of tokens that are already tokenized.

1. \`idf(corpus, term)\` returns the inverse document frequency of one term.
2. \`bm25Scores(corpus, query, k1 = 1.5, b = 0.75)\` returns the BM25 score of each document for the query.
3. \`rank(corpus, query, topK, k1 = 1.5, b = 0.75)\` returns the indices of the \`topK\` documents with the highest scores.

Let **N** be the number of documents and **n(t)** the number of documents that contain the term *t* at least once:

\`\`\`text
idf(t) = ln(1 + (N - n(t) + 0.5) / (n(t) + 0.5))
\`\`\`

Let **f(t, d)** be the number of times *t* occurs in document *d*, **|d|** the number of tokens in *d*, and **avgdl** the mean of |d| over all documents:

\`\`\`text
score(d) = Σ over t in query of  idf(t) · f(t,d)·(k1 + 1) / (f(t,d) + k1·(1 - b + b·|d| / avgdl))
\`\`\`

The sum runs over the query **list**: a term that occurs twice in the query adds its weight twice. A term with f(t, d) = 0 adds nothing.

**Tie rule:** \`rank\` sorts the scores from high to low; on equal scores the lower document index comes first.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`corpus\` | \`string[][]\` | the tokens of each of the N documents |
| \`query\` | \`string[]\` | the query tokens, repeats allowed |
| \`term\` | \`string\` | one token |
| \`k1\` | \`number\` | term-frequency saturation, default 1.5 |
| \`b\` | \`number\` | length normalization weight from 0 to 1, default 0.75 |
| \`topK\` | \`number\` | how many indices to return |

\`idf\` returns a number, \`bm25Scores\` an array of N numbers (entry i is the score of document i), \`rank\` an array of \`topK\` indices, best first.

## Constraints

- A document can be empty, but at least one document has a token. \`1 <= topK <= N\`.
- Do not change the corpus or the query.

## Examples

\`\`\`ts
const corpus = [
  ['the', 'cat', 'sat'],
  ['the', 'dog', 'sat', 'on', 'the', 'mat'],
  ['cat', 'cat', 'food'],
  ['dogs', 'and', 'cats'],
];
idf(corpus, 'cat');                 // 0.6931471805599453
idf(corpus, 'zebra');               // 2.302585092994046
bm25Scores(corpus, ['cat', 'sat']); // [1.5234004, 0.54578518, 1.05823997, 0]
rank(corpus, ['cat', 'sat'], 3);    // [0, 2, 1]
\`\`\`

Document 3 contains \`cats\`, not \`cat\`. Tokens must match exactly, so its score is 0.`,
  starter: `function idf(corpus: string[][], term: string): number {
  throw new Error('not implemented');
}

function bm25Scores(corpus: string[][], query: string[], k1 = 1.5, b = 0.75): number[] {
  throw new Error('not implemented');
}

function rank(corpus: string[][], query: string[], topK: number, k1 = 1.5, b = 0.75): number[] {
  throw new Error('not implemented');
}
`,
  solution: `function idf(corpus: string[][], term: string): number {
  const n = corpus.filter((doc) => doc.includes(term)).length;
  return Math.log(1 + (corpus.length - n + 0.5) / (n + 0.5));
}

function bm25Scores(corpus: string[][], query: string[], k1 = 1.5, b = 0.75): number[] {
  const avgDl = corpus.reduce((s, doc) => s + doc.length, 0) / corpus.length;
  return corpus.map((doc) => {
    const freq = new Map<string, number>();
    for (const t of doc) freq.set(t, (freq.get(t) ?? 0) + 1);
    let total = 0;
    for (const term of query) {
      const f = freq.get(term) ?? 0;
      if (f === 0) continue;
      const num = f * (k1 + 1);
      const den = f + k1 * (1 - b + (b * doc.length) / avgDl);
      total += (idf(corpus, term) * num) / den;
    }
    return total;
  });
}

function rank(corpus: string[][], query: string[], topK: number, k1 = 1.5, b = 0.75): number[] {
  const scores = bm25Scores(corpus, query, k1, b);
  const order = scores.map((_, i) => i).sort((i, j) => scores[j] - scores[i] || i - j);
  return order.slice(0, topK);
}
`,
  hints: [
    'Compute avgdl once from the lengths of all documents. Count the tokens of each document with a Map.',
    'For n(t), count documents, not occurrences. A document that contains the term three times adds 1 to n(t).',
    'Loop over the query list as it is. Do not turn it into a Set: a repeated query term must add its weight again.',
    'The length factor is 1 - b + b·|d|/avgdl; it equals 1 for a document of mean length. Multiply it by k1 and add f for the denominator. To rank, sort the indices by score descending, then by index ascending.',
  ],
  notes: String.raw`## What k1 does

The term weight f·(k1 + 1) / (f + k1) grows with f but never passes k1 + 1. The tenth occurrence of a term adds much less than the first. A small k1 saturates fast; a large k1 acts more like raw term frequency.

## What b does

With b = 1, a document twice the mean length needs about twice the term count for the same weight. With b = 0, length has no effect. The default 0.75 sits between the two.

## Why the 1 + in the idf

The classic Robertson idf ln((N - n + 0.5) / (n + 0.5)) is negative when a term occurs in more than half of the documents, so a common word could push a good document down. The 1 + keeps every idf above 0. Lucene uses the same form.

## Ties

Ties are common in BM25: every document without a query term scores exactly 0. A fixed tie rule (lower index first) keeps results stable between runs.

## Where this goes next

Hybrid retrieval runs this index next to a dense search and merges the two lists with reciprocal rank fusion (the next drill).`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const CORPUS = [
      ['the', 'cat', 'sat'],
      ['the', 'dog', 'sat', 'on', 'the', 'mat'],
      ['cat', 'cat', 'food'],
      ['dogs', 'and', 'cats'],
    ];
    const lessonIdf = (nDocs: number, n: number) => Math.log(1 + (nDocs - n + 0.5) / (n + 0.5));

    check('idf of three terms', 'idf(t) = ln(1 + (N - n + 0.5) / (n + 0.5)), where n is the number of documents that contain t at least once.', () => {
      close(sub.idf(CORPUS, 'cat'), 0.6931471805599453, "idf of 'cat'", 1e-9);
      close(sub.idf(CORPUS, 'the'), 0.6931471805599453, "idf of 'the'", 1e-9);
      close(sub.idf(CORPUS, 'zebra'), 2.302585092994046, "idf of 'zebra'", 1e-9);
    });
    check('scores for the query "cat sat"', 'Each document adds idf · f(k1 + 1) / (f + k1(1 - b + b·|d|/avgdl)) for each query term it contains.', () => {
      close(sub.bm25Scores(CORPUS, ['cat', 'sat']), [1.5234004, 0.54578518, 1.05823997, 0], 'the scores', 1e-7);
    });
    check('top 3 documents for "cat sat"', 'Sort by score from high to low; on equal scores the lower document index comes first.', () => {
      equal(sub.rank(CORPUS, ['cat', 'sat'], 3), [0, 2, 1], 'the top 3 indices');
    });
    check('the score of one term matches the formula', 'With one query term the score is idf · f(k1 + 1) / (f + k1(1 - b + b·|d|/avgdl)), here with k1 = 1.2 and b = 0.6.', () => {
      const corpus = [['x', 'x', 'y'], ['y', 'z'], ['x', 'y', 'z', 'z', 'w']];
      const avgDl = 10 / 3;
      const w = lessonIdf(3, 2);
      const want = [
        [2, 3],
        [0, 2],
        [1, 5],
      ].map(([f, dl]) => (f ? (w * f * 2.2) / (f + 1.2 * (1 - 0.6 + (0.6 * dl) / avgDl)) : 0));
      close(sub.bm25Scores(corpus, ['x'], 1.2, 0.6), want, 'the scores with k1 = 1.2, b = 0.6', 1e-9);
    });
    check('the inputs are not changed', 'Scoring reads the corpus and the query. It must not sort, remove or add tokens.', () => {
      const corpus = [['b', 'a', 'a'], ['c'], ['a', 'c', 'b']];
      const query = ['c', 'a', 'c'];
      const before = JSON.stringify([corpus, query]);
      sub.idf(corpus, 'a');
      sub.bm25Scores(corpus, query);
      sub.rank(corpus, query, 2);
      equal(JSON.stringify([corpus, query]), before, 'the corpus and query after the calls');
    });
    check('b = 0 turns off length normalization', "With b = 0 the document length has no effect. 'the' occurs once in document 0 and twice in document 1.", () => {
      close(sub.bm25Scores(CORPUS, ['the'], 1.2, 0), [0.69314718, 0.95307737, 0, 0], 'the scores with b = 0', 1e-7);
      equal(sub.rank(CORPUS, ['the'], 4), [1, 0, 2, 3], "the full ranking for 'the'");
    });
    check('a repeated query term counts each time', 'The query is a list: add the weight of a term once for each time it occurs, so "cat cat" scores twice "cat".', () => {
      const once: number[] = sub.bm25Scores(CORPUS, ['cat']);
      close(sub.bm25Scores(CORPUS, ['cat', 'cat']), once.map((x) => 2 * x), 'the scores for "cat cat"', 1e-12);
    });
    check('a term in every document still has a positive idf', 'The 1 + inside the log keeps idf above 0, also for a term that occurs in every document.', () => {
      const v = sub.idf([['a', 'b'], ['a'], ['a', 'c', 'a']], 'a');
      close(v, Math.log(1 + 0.5 / 3.5), 'idf of a term in all 3 documents', 1e-12);
      ok(v > 0, `idf of a term in every document should be positive, got ${v}`);
    });
    check('n(t) counts documents, not occurrences', 'A term that occurs 3 times in one document still has n = 1.', () => {
      close(sub.idf([['q', 'q', 'q'], ['r'], ['s', 'r']], 'q'), lessonIdf(3, 1), 'idf of a term that occurs 3 times in 1 document', 1e-12);
    });
    check('empty documents and a query with no match', 'An empty document scores 0. A term no document contains adds nothing, so all scores tie at 0 and the ranking is 0, 1, 2.', () => {
      const corpus = [[], ['a', 'b'], ['b']];
      close(sub.bm25Scores(corpus, ['zzz']), [0, 0, 0], 'the scores for an unknown term', 0);
      equal(sub.rank(corpus, ['zzz'], 3), [0, 1, 2], 'the ranking when every score is 0');
      close(sub.bm25Scores(corpus, ['b'])[0], 0, 'the score of the empty document', 0);
    });
    check('the ranking is the sorted order of the scores', 'rank returns the indices of bm25Scores from high to low, lower index first on a tie.', () => {
      const r = rng(1);
      const vocab = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'];
      const corpus = Array.from({ length: 9 }, () => Array.from({ length: 1 + Math.floor(r() * 6) }, () => vocab[Math.floor(r() * 6)]));
      const scores: number[] = sub.bm25Scores(corpus, ['w0', 'w2']);
      const want = scores
        .map((_, i) => i)
        .sort((i, j) => scores[j] - scores[i] || i - j)
        .slice(0, 5);
      equal(sub.rank(corpus, ['w0', 'w2'], 5), want, 'the top 5 indices');
    });
    check('matches the reference on a random corpus', 'Your functions agree with the reference solution (k1 = 1.2, b = 0.75).', () => {
      const corpus = [
        ['t4', 't4', 't4', 't4', 't3', 't0', 't5', 't2'],
        ['t2', 't1', 't5', 't4', 't3'],
        ['t4', 't3', 't2', 't2'],
        ['t0', 't3'],
        ['t0', 't5', 't4', 't1', 't3', 't0', 't4', 't4'],
        ['t0', 't5', 't2'],
      ];
      close(sub.idf([['t3'], ['t1', 't1', 't3'], ['t2']], 't0'), 2.0794415416798357, "idf of 't0' in a 3-document corpus", 1e-9);
      close(sub.bm25Scores([['t3'], ['t1', 't1', 't3'], ['t2']], ['t0', 't0', 't2']), [0, 0, 1.1961332353801541], 'the scores for "t0 t0 t2"', 1e-9);
      close(sub.bm25Scores(corpus, ['t5', 't4', 't4'], 1.2, 0.75), [1.709504733187778, 1.3254982568371176, 0.9624079752612736, 0, 1.5851765472600103, 0.5282782907684165], 'the scores for "t5 t4 t4"', 1e-9);
      equal(sub.rank(corpus, ['t5', 't4', 't4'], 6, 1.2, 0.75), [0, 4, 1, 2, 5, 3], 'the full ranking for "t5 t4 t4"');
    });
  },
};

export default drill;
