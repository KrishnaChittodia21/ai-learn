import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'reciprocal-rank-fusion',
  entry: ['rrfScores', 'fuse'],
  problem: String.raw`Reciprocal rank fusion (RRF) merges ranked lists from different retrievers into one list. It uses only the rank of each document, not the raw score. A BM25 score and a cosine similarity have different scales, but their ranks are comparable. Hybrid search uses RRF to merge keyword and vector results.

## Task

Write two functions.

1. \`rrfScores(rankings, k = 60, weights?)\` returns the fused score of each document.
2. \`fuse(rankings, k = 60, weights?)\` returns the documents sorted by fused score.

Each ranking is a list of document ids, best first. The first document of a list has **rank 1**. The fused score of document d is

\`\`\`text
RRF(d) = Σ over lists i that contain d of  w_i / (k + rank_i(d))
\`\`\`

A list that does not contain d adds nothing. When \`weights\` is not given, every w_i is 1. If \`weights\` is given and its length is not the number of lists, **throw an Error**.

**Tie rule:** \`fuse\` sorts from the highest score to the lowest; on equal scores the lower doc id comes first.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`rankings\` | \`number[][]\` | L lists, each of distinct doc ids, best first |
| \`k\` | \`number\` | the RRF constant, default 60 |
| \`weights\` | \`number[]\` (optional) | the weight of each list |

\`rrfScores\` returns a \`Map<number, number>\`: each doc id found in any list → its fused score. \`fuse\` returns an array of \`[docId, score]\` pairs, best first, holding every document of \`rrfScores\`.

## Constraints

- A list can be empty, and there can be no lists at all. Doc ids are non-negative integers.
- \`k >= 1\` and each weight is positive. Do not change the input lists.

## Examples

\`\`\`ts
const bm25 = [3, 1, 4];
const dense = [1, 5, 3];
fuse([bm25, dense]);
// [[1, 0.03252247488101534], [3, 0.032266458495966696], [5, 0.016129032258064516], [4, 0.015873015873015872]]
fuse([bm25, dense], 60, [2, 1]);
// [[3, 0.04865990111891751], [1, 0.048651507139079855], [4, 0.031746031746031744], [5, 0.016129032258064516]]
\`\`\`

Document 1 has ranks 2 and 1, so its score is 1/62 + 1/61. Document 3 has ranks 1 and 3, so its score is 1/61 + 1/63. Document 1 comes first.`,
  starter: `function rrfScores(rankings: number[][], k = 60, weights?: number[]): Map<number, number> {
  throw new Error('not implemented');
}

function fuse(rankings: number[][], k = 60, weights?: number[]): [number, number][] {
  throw new Error('not implemented');
}
`,
  solution: `function rrfScores(rankings: number[][], k = 60, weights?: number[]): Map<number, number> {
  const w = weights ?? rankings.map(() => 1);
  if (w.length !== rankings.length) throw new Error('weights length must match rankings length');
  const score = new Map<number, number>();
  rankings.forEach((ranks, i) => {
    ranks.forEach((docId, r) => {
      const rank = r + 1;
      score.set(docId, (score.get(docId) ?? 0) + w[i] * (1 / (k + rank)));
    });
  });
  return score;
}

function fuse(rankings: number[][], k = 60, weights?: number[]): [number, number][] {
  return [...rrfScores(rankings, k, weights)].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}
`,
  hints: [
    'Keep a Map from doc id to score; a new id starts at 0.',
    'Ranks start at 1: the item at array index r has rank r + 1.',
    'Pair list i with weights[i]. Check the length of weights first: a missing weight would silently become undefined and turn scores into NaN.',
    'Sort the [docId, score] pairs by score descending, then by doc id ascending.',
  ],
  notes: String.raw`## Why ranks and not scores

BM25 scores have no upper bound and change with the corpus; cosine similarities run from -1 to 1. A weighted sum of the raw scores needs a new weight for each corpus. RRF uses only ranks, so it merges two retrievers without tuning.

## What k does

With k = 60, rank 1 adds 1/61 and rank 10 adds 1/70. The values fall slowly, so a document deep in one list still counts. A small k gives most of the weight to the top ranks. The value 60 comes from the 2009 paper that introduced RRF.

## A document in only one list

A document one retriever misses gets nothing from that list, but it can still rank high when the other list puts it near the top. That is the main gain of hybrid search: each retriever covers queries the other misses.

## Tie rule

Sorting by score only keeps ties in first-appearance order, which depends on the order of the lists. Lower doc id first makes the output independent of that order.

## Where this goes next

A reranker reorders the top of the fused list, and retrieval evaluation measures the fused list's recall against each retriever alone.`,
  tests: (sub, { check, close, equal, ok }) => {
    const BM25 = [3, 1, 4];
    const DENSE = [1, 5, 3];
    const fused = (actual: [number, number][], want: [number, number][], what: string) => {
      equal(
        actual.map((p) => Number(p[0])),
        want.map((p) => p[0]),
        `the order of ${what}`,
      );
      close(
        actual.map((p) => p[1]),
        want.map((p) => p[1]),
        `the scores of ${what}`,
        1e-12,
      );
    };
    const threw = (fn: () => unknown) => {
      try {
        fn();
      } catch {
        return true;
      }
      return false;
    };

    check('scores of two lists with k = 60', 'Each list adds 1 / (k + rank) to each document in it. The first document of a list has rank 1.', () => {
      const s: Map<number, number> = sub.rrfScores([BM25, DENSE]);
      equal([...s.keys()].sort((a, b) => a - b), [1, 3, 4, 5], 'the document ids in the scores');
      close([s.get(1), s.get(3), s.get(4), s.get(5)], [0.03252247488101534, 0.032266458495966696, 0.015873015873015872, 0.016129032258064516], 'the scores of documents 1, 3, 4 and 5', 1e-12);
    });
    check('fused ranking of two lists', 'fuse sorts the documents by fused score from high to low and returns [docId, score] pairs.', () => {
      fused(sub.fuse([BM25, DENSE]), [[1, 0.03252247488101534], [3, 0.032266458495966696], [5, 0.016129032258064516], [4, 0.015873015873015872]], 'the fused list');
    });
    check('weights scale each list', 'With weights, list i adds weights[i] / (k + rank). A weight of 2 on BM25 puts document 3 first.', () => {
      fused(sub.fuse([BM25, DENSE], 60, [2, 1]), [[3, 0.04865990111891751], [1, 0.048651507139079855], [4, 0.031746031746031744], [5, 0.016129032258064516]], 'the weighted list');
    });
    check('every document in any list gets a score', 'RRF scores the union of all lists. A document in only one list still gets a score from that list.', () => {
      const rankings = [[0, 5, 9], [2, 0], [6, 1]];
      equal([...(sub.rrfScores(rankings) as Map<number, number>).keys()].sort((a, b) => a - b), [0, 1, 2, 5, 6, 9], 'the scored document ids');
      equal((sub.fuse(rankings) as [number, number][]).map((p) => Number(p[0])).sort((a, b) => a - b), [0, 1, 2, 5, 6, 9], 'the fused document ids');
    });
    check('a single list keeps its order', 'With one list, scores fall as the rank grows, so the fused order is the list order.', () => {
      const ranking = [8, 3, 5, 0, 7];
      equal((sub.fuse([ranking]) as [number, number][]).map((p) => Number(p[0])), ranking, 'the fused order of one list');
      close(sub.rrfScores([ranking], 10).get(8), 1 / 11, 'the score of the first document with k = 10', 1e-12);
    });
    check('the order of the lists does not matter', 'The fused score is a sum over lists, so swapping the lists gives the same scores and ranking.', () => {
      const a = [[5, 2, 8, 1], [2, 7, 5]];
      fused(sub.fuse([a[1], a[0]]), sub.fuse(a), 'the fused list after swapping the lists');
    });
    check('the inputs are not changed', 'RRF reads the lists. It must not sort or change them.', () => {
      const rankings = [[4, 2, 9], [9, 4]];
      const weights = [1, 0.5];
      sub.rrfScores(rankings, 60, weights);
      sub.fuse(rankings, 60, weights);
      equal(rankings, [[4, 2, 9], [9, 4]], 'the rankings after the calls');
      equal(weights, [1, 0.5], 'the weights after the calls');
    });
    check('equal scores put the lower doc id first', 'Documents 7 and 2 have ranks 1 and 2 in opposite lists, so their scores are equal. The lower id, 2, comes first.', () => {
      equal((sub.fuse([[7, 2], [2, 7]]) as [number, number][]).map((p) => Number(p[0])), [2, 7], 'the fused order');
    });
    check('a small k gives more weight to the top ranks', 'With k = 1, rank 1 adds 1/2 and rank 2 adds 1/3.', () => {
      fused(sub.fuse([[4, 6]], 1), [[4, 1 / 2], [6, 1 / 3]], 'the list with k = 1');
    });
    check('weights of the wrong length throw', 'There must be one weight for each list. Without the check a list silently gets an undefined weight (NaN scores) or is dropped.', () => {
      ok(!threw(() => sub.rrfScores([[1, 2], [2, 3]], 60, [1, 1])), 'rrfScores with one weight per list threw');
      ok(threw(() => sub.rrfScores([[1, 2], [2, 3]], 60, [1])), 'rrfScores with 1 weight for 2 lists did not throw');
      ok(threw(() => sub.fuse([[1, 2]], 60, [1, 1])), 'fuse with 2 weights for 1 list did not throw');
    });
    check('empty lists give an empty result', 'With no documents there is nothing to score: return an empty result, not an error.', () => {
      equal(sub.fuse([]), [], 'the fused ranking of no lists');
      equal(sub.fuse([[], []]), [], 'the fused ranking of two empty lists');
    });
    check('matches the reference on random lists', 'Your fused order and scores agree with the reference solution for several values of k and weights.', () => {
      fused(
        sub.fuse([[7, 0], [2, 7, 8, 6, 4, 1, 10, 5, 9, 0], [8, 1, 5, 9, 11, 6, 3, 2, 0, 10, 7]], 60, [1.2043337169137118, 0.7842070386264286, 0.6948822580032075]),
        [[7, 0.042178750366500144], [0, 0.04069845242660459], [8, 0.02383924319813016], [1, 0.023089703182563606], [2, 0.02307470982757782], [6, 0.022781754039192605], [5, 0.022562333561550678], [9, 0.02222285468168314], [10, 0.02163147206611192], [4, 0.012064723671175824], [11, 0.010690496276972423], [3, 0.010371376985122499]],
        '3 weighted lists, k = 60',
      );
      fused(
        sub.fuse([[0, 1, 8, 4], [0, 2, 3, 5, 1, 4, 7, 6], [2, 1, 4, 8, 7], [0]], 1, [0.6350717911634627, 1.5835390258946753, 1.1928158453770812, 0.7419076685504027]),
        [[0, 1.4802592428042702], [2, 1.1242542646534324], [1, 0.8732190498292938], [4, 0.6514381804190593], [8, 0.3973311168662819], [7, 0.39674501913301463], [3, 0.39588475647366883], [5, 0.3167078051789351], [6, 0.17594878065496392]],
        '4 weighted lists, k = 1',
      );
    });
  },
};

export default drill;
