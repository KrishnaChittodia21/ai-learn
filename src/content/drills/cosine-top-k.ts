import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'cosine-top-k',
  entry: ['normalizeRows', 'cosineSimilarityMatrix', 'topK'],
  problem: String.raw`A vector search finds the documents whose embeddings point in the same direction as a query embedding. Cosine similarity measures that direction and ignores the length of the vectors. The retrieval step of a RAG system starts with this search.

## Task

Write three functions.

1. \`normalizeRows(X)\` returns a **new** matrix: each row of \`X\` divided by its L2 norm.
2. \`cosineSimilarityMatrix(Q, D)\` returns the cosine similarity of each query row against each document row.
3. \`topK(Q, D, k)\` returns, for each query, the indices of the \`k\` documents with the highest cosine similarity.

\`\`\`text
cos(q, d) = (q · d) / (‖q‖ · ‖d‖)
\`\`\`

**Zero vector rule:** a row with norm 0 has no direction. \`normalizeRows\` leaves it as a row of zeros, and its cosine similarity with any vector is 0.

**Tie rule:** \`topK\` sorts the scores from high to low; on equal scores the lower document index comes first.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`X\` | \`number[][]\` | any matrix of row vectors, n × dim |
| \`Q\` | \`number[][]\` | one query embedding per row, nQueries × dim |
| \`D\` | \`number[][]\` | one document embedding per row, nDocs × dim |
| \`k\` | \`number\` | how many documents to return per query |

\`normalizeRows\` returns an n × dim matrix, \`cosineSimilarityMatrix\` an nQueries × nDocs matrix (entry [i][j] scores query i against document j), \`topK\` an nQueries × k matrix of document indices, best first.

## Constraints

- \`1 <= k <= nDocs\`. Rows of Q and D can be zero vectors.
- Do not change the input arrays.

## Examples

\`\`\`ts
normalizeRows([[3, 4], [0, 0], [0, -2]]); // [[0.6, 0.8], [0, 0], [0, -1]]

const Q = [[1, 0], [1, 1]];
const D = [[2, 0], [0, 3], [1, 1], [-1, 0]];
cosineSimilarityMatrix(Q, D);
// [[1, 0, 0.70710678, -1],
//  [0.70710678, 0.70710678, 1, -0.70710678]]
topK(Q, D, 2); // [[0, 2], [2, 0]]
\`\`\`

For the second query, documents 0 and 1 have the same score. The tie rule puts document 0 first.`,
  starter: `function normalizeRows(X: number[][]): number[][] {
  throw new Error('not implemented');
}

function cosineSimilarityMatrix(Q: number[][], D: number[][]): number[][] {
  throw new Error('not implemented');
}

function topK(Q: number[][], D: number[][], k: number): number[][] {
  throw new Error('not implemented');
}
`,
  solution: `function normalizeRows(X: number[][]): number[][] {
  return X.map((row) => {
    const norm = Math.sqrt(row.reduce((s, x) => s + x * x, 0));
    return norm > 0 ? row.map((x) => x / norm) : row.map(() => 0);
  });
}

function cosineSimilarityMatrix(Q: number[][], D: number[][]): number[][] {
  const q = normalizeRows(Q);
  const d = normalizeRows(D);
  return q.map((a) => d.map((b) => a.reduce((s, x, i) => s + x * b[i], 0)));
}

function topK(Q: number[][], D: number[][], k: number): number[][] {
  return cosineSimilarityMatrix(Q, D).map((row) =>
    row
      .map((_, j) => j)
      .sort((a, b) => row[b] - row[a] || a - b)
      .slice(0, k),
  );
}
`,
  hints: [
    'Compute one L2 norm per row: the square root of the sum of squares of that row.',
    'A zero norm gives a division by zero (NaN). Keep a zero row as zeros, so its scores are 0.',
    'After you normalize both matrices, each score is a plain dot product of two rows. The result has nQueries rows and nDocs columns.',
    'For each query, sort the document indices by score descending, then by index ascending, and keep the first k.',
  ],
  notes: String.raw`## Why normalize first

After normalization every nonzero row has length 1, and the dot product of two unit vectors is the cosine of the angle between them. One matrix product then scores every query against every document. Many vector indexes store normalized embeddings for this reason and search with the dot product.

## The zero vector

A zero vector has no direction, so the cosine is not defined. A zero embedding can come from an empty chunk or a text with no known words. Dividing by its norm gives NaN, and NaN breaks the sort: every comparison with NaN is false.

## The tie rule

Exact ties happen more often than you expect: duplicate chunks give the same score, and so do zero vectors. A fixed rule (lower index first) keeps the results stable.

## Where this goes next

RAG uses this search as the first stage. A reranker, or fusion with BM25, then reorders the top candidates.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const Q = [
      [1, 0],
      [1, 1],
    ];
    const D = [
      [2, 0],
      [0, 3],
      [1, 1],
      [-1, 0],
    ];
    const randMat = (r: () => number, n: number, dim: number) => Array.from({ length: n }, () => Array.from({ length: dim }, () => r() * 2 - 1));

    check('normalize three rows, one of them zero', 'Divide each row by its L2 norm. A row with norm 0 stays a row of zeros.', () => {
      close(sub.normalizeRows([[3, 4], [0, 0], [0, -2]]), [[0.6, 0.8], [0, 0], [0, -1]], 'the normalized rows', 1e-9);
    });
    check('similarity of two queries against four documents', 'Entry [i][j] is the cosine of the angle between query i and document j. It does not depend on the length of the vectors.', () => {
      close(sub.cosineSimilarityMatrix(Q, D), [[1, 0, 0.70710678, -1], [0.70710678, 0.70710678, 1, -0.70710678]], 'the similarity matrix', 1e-7);
    });
    check('top 2 documents for each query', 'Sort the documents by score from high to low; on equal scores the lower index comes first.', () => {
      equal(sub.topK(Q, D, 2), [[0, 2], [2, 0]], 'the top 2 indices');
    });
    check('normalized rows have length 1 or 0', 'After normalization each nonzero row has L2 norm 1, and each zero row stays at norm 0.', () => {
      const r = rng(0);
      const X = randMat(r, 6, 5).map((row, i) => row.map((x) => (i === 3 ? 0 : x * (1 + 40 * r()))));
      const out: number[][] = sub.normalizeRows(X);
      equal(out.length, 6, 'the number of rows');
      close(out.map((row) => Math.sqrt(row.reduce((s, x) => s + x * x, 0))), [1, 1, 1, 0, 1, 1], 'the row norms', 1e-12);
    });
    check('scaling a vector does not change its similarity', 'Cosine similarity ignores length: multiply a query or a document by a positive number and the scores stay the same.', () => {
      const r = rng(1);
      const q = randMat(r, 3, 4);
      const d = randMat(r, 5, 4);
      const scales = [0.5, 2, 9, 1, 0.1];
      close(sub.cosineSimilarityMatrix(q.map((row) => row.map((x) => 7 * x)), d.map((row, i) => row.map((x) => x * scales[i]))), sub.cosineSimilarityMatrix(q, d), 'the scores after scaling', 1e-12);
    });
    check('scores stay in [-1, 1] and a vector matches itself with 1', 'The cosine of an angle is from -1 to 1. A vector has angle 0 with itself, so its score is 1.', () => {
      const X = randMat(rng(2), 7, 6);
      const s: number[][] = sub.cosineSimilarityMatrix(X, X);
      ok(s.every((row) => row.every((v) => Math.abs(v) <= 1 + 1e-12)), 'a score is outside -1 to 1');
      close(s.map((row, i) => row[i]), [1, 1, 1, 1, 1, 1, 1], 'the score of each vector with itself', 1e-12);
    });
    check('topK gives the best scores in descending order', 'The first index has the highest score of the row, and the scores of the returned indices never go up.', () => {
      const r = rng(3);
      const q = randMat(r, 4, 8);
      const d = randMat(r, 10, 8);
      const idx: number[][] = sub.topK(q, d, 4);
      const s: number[][] = sub.cosineSimilarityMatrix(q, d);
      idx.forEach((row, i) => {
        equal(row.length, 4, `the length of row ${i}`);
        const picked = row.map((j) => s[i][j]);
        ok(picked.every((v, t) => t === 0 || v <= picked[t - 1]), `the scores of query ${i}'s indices go up: ${picked.join(', ')}`);
        ok(picked[0] === Math.max(...s[i]), `query ${i}: the first index is not the best match`);
      });
    });
    check('the inputs are not changed', "Normalize into a new array. Code that divides the input in place changes the caller's vectors.", () => {
      const q = [
        [3, 4],
        [1, 2],
      ];
      const d = [
        [0, 5],
        [2, 2],
        [0, 0],
      ];
      const before = JSON.stringify([q, d]);
      sub.normalizeRows(q);
      sub.cosineSimilarityMatrix(q, d);
      sub.topK(q, d, 2);
      equal(JSON.stringify([q, d]), before, 'Q and D after the calls');
    });
    check('a zero document scores 0, not NaN', 'A zero vector has no direction: its cosine with anything is 0. Dividing by a zero norm gives NaN, and NaN breaks the sort.', () => {
      const d = [
        [0, 0],
        [0, 2],
        [5, 0],
        [0, -1],
      ];
      close(sub.cosineSimilarityMatrix([[0, 1]], d), [[0, 1, 0, -1]], 'the scores', 1e-12);
      equal(sub.topK([[0, 1]], d, 4), [[1, 0, 2, 3]], 'the full ranking');
      equal(sub.topK([[0, 0, 0]], [[1, 0, 0], [0, 1, 0], [1, 1, 1]], 3), [[0, 1, 2]], 'the ranking for a zero query');
    });
    check('k = 1 and k = number of documents', 'k = 1 returns the single best document; k = nDocs returns the full ranking. Do not skip the best match.', () => {
      const d = [
        [0, 1],
        [1, 0.1],
        [-1, 0],
      ];
      equal(sub.topK([[1, 0]], d, 1), [[1]], 'the top 1 index');
      equal(sub.topK([[1, 0]], d, 3), [[1, 0, 2]], 'the full ranking');
    });
    check('matches the reference on random vectors', 'Your functions agree with the reference solution on random queries and documents, one of them a zero vector.', () => {
      const q = [
        [0.8784503013072725, -0.049925910986252896, -0.18486236354526056, -0.6809295444039414],
        [1.2225413386740303, -0.15452948206880215, -0.4283278221631072, -0.3521335504882296],
        [0.5323091855533487, 0.36544406436407834, 0.4127326115959884, 0.43082100300788273],
      ];
      const d = [
        [2.1416476008704612, -0.4064150163846156, -0.5122427290715373, -0.8137727282478777],
        [0.6159794225754956, 1.1289722927208916, -0.11394745765487507, -0.840156476962528],
        [-0.8244812156912396, 0.6505927878247011, 0.7432541712034423, 0.543154268305195],
        [-0.6655097072886943, 0.23216132306671977, 0.11668580914072822, 0.21868859672901295],
        [0, 0, 0, 0],
        [0.28911939868998415, 0.6312882258385404, -1.4571558198556664, -0.31967121635730134],
        [-0.4703726542927955, -0.6388778482433419, -0.27514225122668373, 1.4949413112343959],
        [-0.8658311156932432, 0.9682783545914808, -1.6828697716158048, -0.33488502998577485],
      ];
      close(
        sub.normalizeRows(q),
        [
          [0.7788834976285078, -0.04426712372161863, -0.163909380056824, -0.6037504732990151],
          [0.9047303898216859, -0.1143581113606236, -0.31698003597768537, -0.26059317122809844],
          [0.6055001871150276, 0.4156915855631971, 0.4694821737672207, 0.49005766763762315],
        ],
        'the normalized queries',
        1e-9,
      );
      close(
        sub.cosineSimilarityMatrix(q, d),
        [
          [0.9491433215763355, 0.6204342862249514, -0.8024724016301672, -0.9098377545105238, 0, 0.38231263772507196, -0.6972669816174437, -0.11115754424547636],
          [0.9899247708122054, 0.4435489738270427, -0.8574217765599924, -0.9671769447227492, 0, 0.44642000176902, -0.3819221180696125, -0.12702595543222645],
          [0.20505112259843983, 0.24477838157956536, 0.2766323256772518, -0.1934091159523872, 0, -0.2450851553242595, 0.03093733639997806, -0.49995760663808797],
        ],
        'the scores',
        1e-9,
      );
      equal(sub.topK(q, d, 3), [[0, 1, 5], [0, 5, 1], [2, 1, 0]], 'the top 3 indices');
    });
  },
};

export default drill;
