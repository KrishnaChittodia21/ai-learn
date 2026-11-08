import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'scaled-dot-product-attention',
  entry: ['causalMask', 'attention'],
  problem: String.raw`Attention lets each query token collect information from a set of key and value tokens. Every transformer layer uses this operation. A decoder adds a causal mask, so that a token cannot see the tokens that come after it.

## Task

Write two functions.

1. \`causalMask(T)\` returns the causal mask for a sequence of \`T\` tokens.
2. \`attention(Q, K, V, mask?)\` returns \`{ output, weights }\`.

The scores are S = Q·Kᵀ / √d_k, where d_k is the length of each row of \`Q\`: S[i][j] is the dot product of query i and key j, divided by √d_k. The weights are the softmax of each row of S (over the keys). The output is weights · V.

The mask is a boolean matrix. **\`true\` means blocked.** A blocked query–key pair gets a weight of exactly 0. The other weights in the row are a softmax over the allowed keys only, so each row of weights sums to 1.

The causal mask is \`true\` at row i, column j when j > i: token i sees token i and every token before it.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`T\` | \`number\` | the number of tokens |
| \`Q\` | \`number[][]\` | Tq query rows of length d_k |
| \`K\` | \`number[][]\` | Tk key rows of length d_k |
| \`V\` | \`number[][]\` | Tk value rows of length d_v |
| \`mask\` | \`boolean[][]\` (optional) | Tq × Tk; \`true\` blocks a query–key pair |

\`causalMask\` returns a T × T \`boolean[][]\`. \`attention\` returns \`{ output: number[][] (Tq × d_v), weights: number[][] (Tq × Tk) }\`.

## Constraints

- Each row of the mask has at least one allowed key.
- Scores can be larger than 1000; the output must stay finite.
- Do not change the input arrays.

## Examples

\`\`\`ts
const Q = [[1, 0], [0, 1]];
const K = [[1, 0], [0, 1], [1, 1]];
const V = [[1, 2], [3, 4], [5, 6]];
attention(Q, K, V);
// weights [[0.40111209, 0.19777581, 0.40111209],
//          [0.19777581, 0.40111209, 0.40111209]]
// output  [[3, 4], [3.40667256, 4.40667256]]

causalMask(3);
// [[false, true,  true],
//  [false, false, true],
//  [false, false, false]]

const X = [[1, 0], [0, 1], [1, 1]];
attention(X, X, V, causalMask(3)).weights;
// [[1, 0, 0],
//  [0.33023845, 0.66976155, 0],
//  [0.24825508, 0.24825508, 0.50348984]]
\`\`\``,
  starter: `function causalMask(T: number): boolean[][] {
  throw new Error('not implemented');
}

function attention(Q: number[][], K: number[][], V: number[][], mask?: boolean[][]): { output: number[][]; weights: number[][] } {
  throw new Error('not implemented');
}
`,
  solution: `function causalMask(T: number): boolean[][] {
  return Array.from({ length: T }, (_, i) => Array.from({ length: T }, (_, j) => j > i));
}

function attention(Q: number[][], K: number[][], V: number[][], mask?: boolean[][]): { output: number[][]; weights: number[][] } {
  const dk = Q[0].length;
  const weights = Q.map((q, i) => {
    let scores = K.map((k, j) => q.reduce((s, x, d) => s + x * K[j][d], 0) / Math.sqrt(dk));
    if (mask) scores = scores.map((s, j) => (mask[i][j] ? -Infinity : s));
    const m = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - m));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  });
  const output = weights.map((w) => V[0].map((_, c) => w.reduce((s, wj, j) => s + wj * V[j][c], 0)));
  return { output, weights };
}
`,
  hints: [
    'Build one row of weights per query: the scores of that query against every key, then a softmax over that row.',
    'S[i][j] is the dot product of Q[i] and K[j]: both are rows of length d_k. That is what multiplying by Kᵀ means.',
    'Apply the mask to the scores before the softmax: put -Infinity at each blocked position. Math.exp(-Infinity) is exactly 0, so the allowed weights still sum to 1.',
    'Subtract the maximum of each row of scores before Math.exp. Each row has at least one allowed key, so that maximum is finite. The causal mask is simply j > i.',
  ],
  notes: String.raw`## Why divide by √d_k

Each score is a sum of d_k products. When the entries of q and k have variance 1, the score has variance d_k. Large scores push the softmax toward a one-hot vector, whose gradient is almost 0. Dividing by √d_k sets the variance of the scores back to 1.

## Why the mask goes before the softmax

The softmax divides by the sum over the row. Setting a weight to 0 after the softmax leaves a row that sums to less than 1. Putting -Infinity in the score gives that key a weight of exactly 0 while the others still sum to 1.

## The numerical trap

Masked rows and large scores need the same fix: subtract the row maximum before \`Math.exp\`. A row with no allowed key has a maximum of -Infinity and the result is NaN. Real models avoid such rows; some implementations use a large negative number such as -1e9 instead of -Infinity for this reason.

## Where this goes next

Multi-head attention runs this function once per head. The KV cache runs it for one new query at a time against all cached keys. BERT and GPT differ mainly in this mask.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const Q2 = [
      [1, 0],
      [0, 1],
    ];
    const K3 = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const V3 = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    const randM = (r: () => number, n: number, c: number) => Array.from({ length: n }, () => Array.from({ length: c }, () => r() * 4 - 2));
    const sums = (m: number[][]) => m.map((row) => row.reduce((a, b) => a + b, 0));

    check('attention without a mask', 'The scores are Q times K transposed, divided by √d_k. The weights are a softmax over each row. The output is the weights times V.', () => {
      const { output, weights } = sub.attention(Q2, K3, V3);
      close(
        weights,
        [
          [0.40111209, 0.19777581, 0.40111209],
          [0.19777581, 0.40111209, 0.40111209],
        ],
        'the weights',
        1e-6,
      );
      close(
        output,
        [
          [3, 4],
          [3.40667256, 4.40667256],
        ],
        'the output',
        1e-6,
      );
    });
    check('the causal mask for T = 3', 'The causal mask is true above the diagonal, where the key comes after the query. The diagonal is false: a token sees itself.', () => {
      equal(
        sub.causalMask(3),
        [
          [false, true, true],
          [false, false, true],
          [false, false, false],
        ],
        'causalMask(3)',
      );
      equal(sub.causalMask(1), [[false]], 'causalMask(1)');
    });
    check('causal attention of three tokens', 'A true in the mask blocks that key. Token i sees only tokens 0 to i, and its weights still sum to 1.', () => {
      const X = [
        [1, 0],
        [0, 1],
        [1, 1],
      ];
      const { output, weights } = sub.attention(X, X, V3, sub.causalMask(3));
      close(
        weights,
        [
          [1, 0, 0],
          [0.33023845, 0.66976155, 0],
          [0.24825508, 0.24825508, 0.50348984],
        ],
        'the weights',
        1e-6,
      );
      close(
        output,
        [
          [1, 2],
          [2.3395231, 3.3395231],
          [3.51046953, 4.51046953],
        ],
        'the output',
        1e-6,
      );
    });
    check('shapes when Tq, Tk, d_k and d_v all differ', 'weights are Tq × Tk, output is Tq × d_v, and each row of weights sums to 1. Q·Kᵀ pairs query i with key j over the shared d_k axis.', () => {
      const r = rng(0);
      const { output, weights } = sub.attention(randM(r, 4, 5), randM(r, 6, 5), randM(r, 6, 7));
      equal([weights.length, weights[0]?.length, output.length, output[0]?.length], [4, 6, 4, 7], '[weight rows, weight columns, output rows, output columns]');
      close(sums(weights), [1, 1, 1, 1], 'the row sums of the weights', 1e-9);
      ok(weights.flat().every((w: number) => w >= 0), 'a weight is negative');
    });
    check('blocked weights are exactly 0 and rows still sum to 1', 'Put -Infinity in the blocked scores before the softmax. Then a blocked weight is exactly 0 and the allowed weights sum to 1.', () => {
      const r = rng(2);
      const mask = Array.from({ length: 5 }, () => Array.from({ length: 6 }, (_, j) => j > 0 && r() < 0.5));
      const { weights } = sub.attention(randM(r, 5, 4), randM(r, 6, 4), randM(r, 6, 3), mask);
      ok(
        mask.every((row, i) => row.every((m, j) => !m || weights[i][j] === 0)),
        'a blocked position has a weight that is not exactly 0',
      );
      close(sums(weights), [1, 1, 1, 1, 1], 'the row sums of the masked weights', 1e-9);
    });
    check('the inputs are not changed', 'A function that writes into Q, K, V or the mask breaks the code that calls it.', () => {
      const r = rng(4);
      const Q = randM(r, 3, 2);
      const K = randM(r, 4, 2);
      const V = randM(r, 4, 2);
      const mask = [
        [false, true, false, true],
        [false, false, true, true],
        [true, true, true, false],
      ];
      const before = JSON.stringify([Q, K, V, mask]);
      sub.attention(Q, K, V, mask);
      equal(JSON.stringify([Q, K, V, mask]), before, 'Q, K, V and the mask after the call');
    });
    check('only one key is allowed', 'When the mask allows one key, that key gets a weight of 1 and the output row is exactly that value row.', () => {
      const r = rng(5);
      const V = randM(r, 5, 2);
      const mask = [0, 1, 2].map((i) => [0, 1, 2, 3, 4].map((j) => j !== [2, 0, 4][i]));
      const { output, weights } = sub.attention(randM(r, 3, 4), randM(r, 5, 4), V, mask);
      close(
        weights,
        [
          [0, 0, 1, 0, 0],
          [1, 0, 0, 0, 0],
          [0, 0, 0, 0, 1],
        ],
        'the weights',
        1e-12,
      );
      close(output, [V[2], V[0], V[4]], 'the output', 1e-12);
    });
    check('large scores do not overflow', 'Math.exp(1414) is Infinity. Subtract the row maximum before Math.exp so the largest exponent is 0.', () => {
      const { output, weights } = sub.attention(
        [[2000, 0]],
        [
          [1, 0],
          [0.999, 0],
          [0, 1],
        ],
        V3,
      );
      close(weights, [[0.8044296825069588, 0.19557031749304132, 0]], 'the weights', 1e-7);
      close(output, [[1.3911406349860829, 2.391140634986083]], 'the output', 1e-7);
    });
    check('matches the reference on random inputs', 'Your output and weights agree with the reference solution with and without a mask.', () => {
      const a = sub.attention(
        [
          [0.30471707975443135, -1.0399841062404955, 0.7504511958064572, 0.9405647163912139],
          [-1.9510351886538364, -1.302179506862318, 0.12784040316728537, -0.3162425923435822],
          [-0.016801157504288795, -0.85304392757358, 0.8793979748628286, 0.7777919354289483],
        ],
        [
          [0.06603069756121605, 1.1272412069680329, 0.4675093422520456, -0.8592924628832382],
          [0.36875078408249884, -0.9588826008289989, 0.8784503013072725, -0.049925910986252896],
          [-0.18486236354526056, -0.6809295444039414, 1.2225413386740303, -0.15452948206880215],
        ],
        [
          [-0.4283278221631072, -0.3521335504882296],
          [0.5323091855533487, 0.36544406436407834],
          [0.4127326115959884, 0.43082100300788273],
        ],
      );
      close(
        a.weights,
        [
          [0.09219252599407565, 0.4876486827987792, 0.4201587912071451],
          [0.13321503473434676, 0.348346972645057, 0.5184379926205962],
          [0.11163084986414966, 0.44491433389138313, 0.44345481624446714],
        ],
        'the weights without a mask',
        1e-7,
      );
      close(
        a.output,
        [
          [0.393504484477962, 0.3267574669674447],
          [0.34234485423639993, 0.30374582631111224],
          [0.37204565233960285, 0.3143319836875398],
        ],
        'the output without a mask',
        1e-7,
      );
      const b = sub.attention(
        [
          [-0.4841694333335785, -0.32767309436196085],
          [1.0027578253046041, 0.5381154370039261],
          [1.3373981074427437, -0.15450567924990047],
        ],
        [
          [0.22822833013890514, 2.5174740375339204],
          [1.8768446112816701, -0.8532433505588201],
          [-0.2873833615491761, -1.4634420018370031],
          [-0.5907070139634865, 0.3156050035903405],
          [1.2058536208882336, -0.7290838377436085],
        ],
        [
          [-1.287422581274031, -1.0967855784546396],
          [1.836913528321314, 2.905067169240407],
          [-1.1715666288253417, -0.36824895678803055],
          [0.34155555094050954, 1.7286976444055924],
          [-0.9868570784282374, -0.24527784594210975],
        ],
        [
          [false, true, true, false, false],
          [false, true, true, true, true],
          [false, true, true, true, false],
        ],
      );
      close(
        b.weights,
        [
          [0.21173894204240115, 0, 0, 0.4667982535996673, 0.3214628043579315],
          [1, 0, 0, 0, 0],
          [0.21768355952327564, 0, 0, 0, 0.7823164404767243],
        ],
        'the weights with a mask',
        1e-7,
      );
      close(
        b.output,
        [
          [-0.4303978045661748, 0.4958731191776175],
          [-1.287422581274031, -1.0967855784546396],
          [-1.052285246957613, -0.4306370801170305],
        ],
        'the output with a mask',
        1e-7,
      );
    });
  },
};

export default drill;
