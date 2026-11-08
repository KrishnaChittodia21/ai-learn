import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'grouped-query-attention',
  entry: ['repeatKv', 'groupedQueryAttention', 'meanPoolKvHeads'],
  problem: String.raw`Grouped-query attention (GQA) lets several query heads share one key head and one value head, so the model stores fewer keys and values in its KV cache. With one group it is multi-query attention; with one group per query head it is ordinary multi-head attention. Llama 3, Mistral and Qwen use GQA.

## Task

Write three functions.

1. \`repeatKv(kv, nHeads)\` repeats each key or value head so every query head has a matching one.
2. \`groupedQueryAttention(x, wQ, wK, wV, wO, nHeads, nKvHeads)\` returns \`{ output, weights }\` of GQA self-attention.
3. \`meanPoolKvHeads(w, nHeads, nKvHeads)\` turns the key or value projection of a multi-head checkpoint into a GQA projection.

Let H = \`nHeads\`, G = \`nKvHeads\`, r = H / G and dHead = D / H. Head h of a projected matrix is the block of columns h·dHead to (h + 1)·dHead - 1. **Query head h uses key-value group floor(h / r)**: the first r query heads use group 0, the next r use group 1, and so on.

The steps of \`groupedQueryAttention\`:

1. Q = x·wQ, K = x·wK, V = x·wV (no bias).
2. Split Q into H heads, and K and V into G heads each. Repeat K and V to H heads.
3. In each head, softmax(Q_h·K_hᵀ / √dHead)·V_h, softmax over the keys, no mask.
4. Join the H head outputs in head order (T × D) and multiply by wO.

\`meanPoolKvHeads\` takes a D × (H·dHead) projection: group g of the result is the mean of heads g·r to g·r + r - 1.

All three functions throw an \`Error\` when H is not a multiple of G.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`kv\` | \`number[][][]\` | G heads of T × dHead keys or values |
| \`x\` | \`number[][]\` | T tokens × D features |
| \`wQ\`, \`wO\` | \`number[][]\` | D × D |
| \`wK\`, \`wV\` | \`number[][]\` | D × (G·dHead) |
| \`w\` | \`number[][]\` | D × (H·dHead), a projection with H heads |

\`repeatKv\` returns H × T × dHead. \`groupedQueryAttention\` returns \`{ output: number[][] (T × D), weights: number[][][] (H × T × T) }\`. \`meanPoolKvHeads\` returns D × (G·dHead).

## Constraints

- 1 ≤ T ≤ 32 and 1 ≤ G ≤ H ≤ 16; D is a multiple of H.
- Divide the scores by √dHead, not by √D.
- Do not change the input arrays.

## Examples

\`\`\`ts
repeatKv([[[0, 1], [2, 3]], [[4, 5], [6, 7]]], 4);
// [[[0, 1], [2, 3]], [[0, 1], [2, 3]], [[4, 5], [6, 7]], [[4, 5], [6, 7]]]

const x = [[1, 0, 0, 1], [0, 1, 1, 0], [1, 1, 0, 0]];
const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const wK = [[1, 0], [0, 1], [0, 0], [0, 0]];
const wV = [[1, 0], [0, 2], [0, 0], [1, 0]];
groupedQueryAttention(x, I, wK, wV, I, 2, 1);
// output  [[1.20333628, 1.19777581, 0.79666372, 1.60444837],
//          [0.79666372, 1.60444837, 1.20333628, 1.19777581],
//          [1, 1.50348984, 1, 1.33333333]]
// weights [[[0.40111209, 0.19777581, 0.40111209], [0.19777581, 0.40111209, 0.40111209], [0.24825508, 0.24825508, 0.50348984]],
//          [[0.19777581, 0.40111209, 0.40111209], [0.40111209, 0.19777581, 0.40111209], [0.33333333, 0.33333333, 0.33333333]]]

meanPoolKvHeads([[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]], 4, 2);
// [[1, 2, 5, 6], [9, 10, 13, 14]]
\`\`\``,
  starter: `function repeatKv(kv: number[][][], nHeads: number): number[][][] {
  throw new Error('not implemented');
}

function groupedQueryAttention(x: number[][], wQ: number[][], wK: number[][], wV: number[][], wO: number[][], nHeads: number, nKvHeads: number): { output: number[][]; weights: number[][][] } {
  throw new Error('not implemented');
}

function meanPoolKvHeads(w: number[][], nHeads: number, nKvHeads: number): number[][] {
  throw new Error('not implemented');
}
`,
  solution: `const matMul = (a: number[][], b: number[][]) => a.map((row) => b[0].map((_, c) => row.reduce((s, v, k) => s + v * b[k][c], 0)));

function checkGroups(nHeads: number, nKvHeads: number) {
  if (nHeads % nKvHeads !== 0) throw new Error('nHeads must be a multiple of nKvHeads');
}

/** T × (n·dHead) → n heads of T × dHead, head h = columns h·dHead to (h + 1)·dHead - 1 */
const splitHeads = (m: number[][], n: number) => {
  const dh = m[0].length / n;
  return Array.from({ length: n }, (_, h) => m.map((row) => row.slice(h * dh, (h + 1) * dh)));
};

function softmaxRow(scores: number[]): number[] {
  const m = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function repeatKv(kv: number[][][], nHeads: number): number[][][] {
  checkGroups(nHeads, kv.length);
  const r = nHeads / kv.length;
  return Array.from({ length: nHeads }, (_, h) => kv[Math.floor(h / r)].map((row) => row.slice()));
}

function groupedQueryAttention(x: number[][], wQ: number[][], wK: number[][], wV: number[][], wO: number[][], nHeads: number, nKvHeads: number): { output: number[][]; weights: number[][][] } {
  checkGroups(nHeads, nKvHeads);
  const Q = splitHeads(matMul(x, wQ), nHeads);
  const K = repeatKv(splitHeads(matMul(x, wK), nKvHeads), nHeads);
  const V = repeatKv(splitHeads(matMul(x, wV), nKvHeads), nHeads);
  const dh = Q[0][0].length;
  const weights = Q.map((qh, h) => qh.map((qi) => softmaxRow(K[h].map((kj) => qi.reduce((s, a, d) => s + a * kj[d], 0) / Math.sqrt(dh)))));
  const outs = weights.map((wh, h) => matMul(wh, V[h]));
  const merged = x.map((_, t) => outs.flatMap((o) => o[t]));
  return { output: matMul(merged, wO), weights };
}

function meanPoolKvHeads(w: number[][], nHeads: number, nKvHeads: number): number[][] {
  checkGroups(nHeads, nKvHeads);
  const r = nHeads / nKvHeads;
  const dh = w[0].length / nHeads;
  return w.map((row) => Array.from({ length: nKvHeads * dh }, (_, c) => {
    const g = Math.floor(c / dh);
    const j = c % dh;
    let sum = 0;
    for (let i = 0; i < r; i++) sum += row[(g * r + i) * dh + j];
    return sum / r;
  }));
}
`,
  hints: [
    'Reuse the head split from multi-head attention: head h of a T × (n·dHead) matrix is the block of columns h·dHead to (h + 1)·dHead - 1. Split K and V into G heads, not H.',
    'repeatKv must give the order 0, 0, 1, 1 for r = 2 (query head h reads group floor(h / r)), not 0, 1, 0, 1 (h % G).',
    'dHead is the length of one query head\'s row, D / H. It is not the width of x.',
    'For the pooling, column j of group g averages column j of heads g·r, g·r + 1, …, g·r + r - 1. Divide by r, do not just sum.',
  ],
  notes: String.raw`## Why GQA saves memory

At inference the model keeps the keys and values of every earlier token in the KV cache, and the cache size is proportional to the number of key-value heads. GQA keeps G heads instead of H, so the cache is H / G times smaller. Llama 3 70B has 64 query heads and 8 groups: an 8× smaller cache than the same model with full multi-head attention, which means more concurrent requests or a longer context on the same GPU.

## Why not always one group

Multi-query attention (G = 1) gives the smallest cache, but the GQA paper shows it loses quality and can make training less stable. A few groups keep most of the speed of MQA with quality close to MHA.

## Uptraining

The paper does not train GQA models from scratch. It takes a multi-head checkpoint, mean-pools the key and value heads of each group (meanPoolKvHeads) and trains for about 5 % of the original steps. Mean pooling beat keeping the first head of each group.

## Where this goes next

A KV cache stores only the G groups and repeats them at attention time (or the kernel indexes them directly). DeepSeek's multi-head latent attention goes further and caches one low-rank latent instead of per-head keys and values.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const randM = (r: () => number, n: number, c: number, s = 1) => Array.from({ length: n }, () => Array.from({ length: c }, () => (r() * 2 - 1) * s));
    const eye = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    const mm = (a: number[][], b: number[][]) => a.map((row) => b[0].map((_, c) => row.reduce((s, v, k) => s + v * b[k][c], 0)));
    const threw = (fn: () => unknown) => {
      try {
        fn();
      } catch {
        return true;
      }
      return false;
    };
    // plain multi-head attention, for comparison: Q, K, V all D × D
    const mha = (x: number[][], wq: number[][], wk: number[][], wv: number[][], wo: number[][], H: number) => {
      const dh = x[0].length / H;
      const cols = (m: number[][], h: number) => m.map((row) => row.slice(h * dh, (h + 1) * dh));
      const [Q, K, V] = [mm(x, wq), mm(x, wk), mm(x, wv)];
      const ws: number[][][] = [];
      const outs = Array.from({ length: H }, (_, h) => {
        const w = cols(Q, h).map((q) => {
          const s = cols(K, h).map((k) => q.reduce((a, v, d) => a + v * k[d], 0) / Math.sqrt(dh));
          const m = Math.max(...s);
          const e = s.map((v) => Math.exp(v - m));
          const z = e.reduce((a, b) => a + b, 0);
          return e.map((v) => v / z);
        });
        ws.push(w);
        return mm(w, cols(V, h));
      });
      return { output: mm(x.map((_, t) => outs.flatMap((o) => o[t])), wo), weights: ws };
    };

    check('repeat two groups to four heads', 'Query head h uses group floor(h / (H / G)): heads 0 and 1 get group 0, heads 2 and 3 get group 1.', () => {
      const kv = [
        [
          [0, 1],
          [2, 3],
        ],
        [
          [4, 5],
          [6, 7],
        ],
      ];
      equal(sub.repeatKv(kv, 4), [kv[0], kv[0], kv[1], kv[1]], 'repeatKv(kv, 4)');
    });
    check('two query heads share one key-value head', 'Both query heads use the same keys and values. Their weights differ because their queries differ.', () => {
      const x = [
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [1, 1, 0, 0],
      ];
      const I = eye(4);
      const { output, weights } = sub.groupedQueryAttention(
        x,
        I,
        [
          [1, 0],
          [0, 1],
          [0, 0],
          [0, 0],
        ],
        [
          [1, 0],
          [0, 2],
          [0, 0],
          [1, 0],
        ],
        I,
        2,
        1,
      );
      close(output, [[1.20333627804, 1.19777581464, 0.796663721961, 1.60444837072], [0.796663721961, 1.60444837072, 1.20333627804, 1.19777581464], [1, 1.50348984348, 1, 1.33333333333]], 'the output', 1e-9);
      close(weights, [[[0.40111209268, 0.19777581464, 0.40111209268], [0.19777581464, 0.40111209268, 0.40111209268], [0.248255078258, 0.248255078258, 0.503489843485]], [[0.19777581464, 0.40111209268, 0.40111209268], [0.40111209268, 0.19777581464, 0.40111209268], [0.333333333333, 0.333333333333, 0.333333333333]]], 'the weights', 1e-9);
    });
    check('mean-pool four heads into two groups', 'Group g is the mean of heads g·r to g·r + r - 1, with r = H / G. Each head is a block of dHead columns.', () => {
      close(
        sub.meanPoolKvHeads(
          [
            [0, 1, 2, 3, 4, 5, 6, 7],
            [8, 9, 10, 11, 12, 13, 14, 15],
          ],
          4,
          2,
        ),
        [
          [1, 2, 5, 6],
          [9, 10, 13, 14],
        ],
        'meanPoolKvHeads(w, 4, 2)',
        1e-12,
      );
    });
    check('G = H is multi-head attention', 'With one key-value head per query head nothing is shared: the result equals standard multi-head attention.', () => {
      const r = rng(0);
      const x = randM(r, 4, 8);
      const ws = [randM(r, 8, 8), randM(r, 8, 8), randM(r, 8, 8), randM(r, 8, 8)];
      const want = mha(x, ws[0], ws[1], ws[2], ws[3], 4);
      const got = sub.groupedQueryAttention(x, ws[0], ws[1], ws[2], ws[3], 4, 4);
      close(got.output, want.output, 'the output', 1e-9);
      close(got.weights, want.weights, 'the weights', 1e-9);
    });
    check('G = 1 is multi-query attention', 'With one group every query head uses the same single key head and value head, so wK and wV are D × dHead.', () => {
      const r = rng(1);
      const x = randM(r, 3, 6);
      const [wq, wk, wv, wo] = [randM(r, 6, 6), randM(r, 6, 2), randM(r, 6, 2), randM(r, 6, 6)];
      const tile = (w: number[][]) => w.map((row) => [...row, ...row, ...row]);
      const want = mha(x, wq, tile(wk), tile(wv), wo, 3);
      close(sub.groupedQueryAttention(x, wq, wk, wv, wo, 3, 1).output, want.output, 'the output with one group', 1e-9);
    });
    check('heads in one group read the same keys', 'Give query heads 0 and 1 the same query weights. With H = 4, G = 2 they share group 0, so their weights are equal; heads 1 and 2 are in different groups, so theirs differ.', () => {
      const r = rng(2);
      const x = randM(r, 4, 8);
      const wq = randM(r, 8, 8);
      wq.forEach((row) => {
        row[2] = row[0];
        row[3] = row[1];
        row[4] = row[0];
        row[5] = row[1];
      });
      const { weights } = sub.groupedQueryAttention(x, wq, randM(r, 8, 4), randM(r, 8, 4), randM(r, 8, 8), 4, 2);
      close(weights[1], weights[0], 'the weights of head 1 compared with head 0', 1e-12);
      const diff = weights[2].flat().reduce((s: number, v: number, i: number) => s + Math.abs(v - weights[1].flat()[i]), 0);
      ok(diff > 1e-6, 'heads 1 and 2 have the same weights, but they are in different groups');
    });
    check('pooling identical heads changes nothing', 'When the heads of each group already have equal key and value weights, pooling gives that head back, and GQA with the pooled weights equals multi-head attention.', () => {
      const r = rng(3);
      const x = randM(r, 3, 8);
      const g0 = randM(r, 8, 2);
      const g1 = randM(r, 8, 2);
      const wk = g0.map((row, i) => [...row, ...row, ...g1[i], ...g1[i]]);
      const wq = randM(r, 8, 8);
      const wo = randM(r, 8, 8);
      const pooled = sub.meanPoolKvHeads(wk, 4, 2);
      close(pooled, g0.map((row, i) => [...row, ...g1[i]]), 'the pooled projection', 1e-12);
      close(sub.groupedQueryAttention(x, wq, pooled, pooled, wo, 4, 2).output, mha(x, wq, wk, wk, wo, 4).output, 'GQA with pooled weights', 1e-9);
    });
    check('H not a multiple of G throws', 'Each group must hold the same number of query heads. All three functions throw when nHeads % nKvHeads is not 0.', () => {
      const r = rng(4);
      const x = randM(r, 2, 6);
      equal(sub.repeatKv([randM(r, 2, 2)], 3).length, 3, 'the number of heads from repeatKv with G = 1, H = 3');
      ok(
        threw(() => sub.groupedQueryAttention(x, randM(r, 6, 6), randM(r, 6, 4), randM(r, 6, 4), randM(r, 6, 6), 3, 2)),
        'groupedQueryAttention with H = 3 and G = 2 did not throw',
      );
      ok(
        threw(() => sub.repeatKv([randM(r, 2, 2), randM(r, 2, 2)], 3)),
        'repeatKv from 2 groups to 3 heads did not throw',
      );
      ok(
        threw(() => sub.meanPoolKvHeads(randM(r, 6, 6), 3, 2)),
        'meanPoolKvHeads with H = 3 and G = 2 did not throw',
      );
    });
    check('the scale uses dHead, not D', 'Divide the scores by the square root of the size of one head, dHead = D / H.', () => {
      const x = [[1, 2, 0, 0, 0, 0, 0, 0], [0, 0, 1, 1, 0, 0, 0, 0]];
      const I = eye(8);
      const wkv = I.map((row) => row.slice(0, 4));
      const { weights } = sub.groupedQueryAttention(x, I, wkv, wkv, I, 4, 2);
      const s = [5, 0].map((v) => v / Math.sqrt(2));
      const e = s.map((v) => Math.exp(v - s[0]));
      close(weights[0][0], e.map((v) => v / (e[0] + e[1])), 'the weights of query 0 in head 0', 1e-12);
    });
    check('the inputs are not changed', 'A function that writes into x or into a weight matrix breaks the model that calls it.', () => {
      const r = rng(5);
      const x = randM(r, 3, 4);
      const ws = [randM(r, 4, 4), randM(r, 4, 2), randM(r, 4, 2), randM(r, 4, 4)];
      const kv = [randM(r, 3, 2)];
      const before = JSON.stringify([x, ws, kv]);
      sub.groupedQueryAttention(x, ws[0], ws[1], ws[2], ws[3], 2, 1);
      sub.repeatKv(kv, 2);
      sub.meanPoolKvHeads(ws[0], 2, 1);
      equal(JSON.stringify([x, ws, kv]), before, 'x, the projections and kv after the calls');
    });
    check('matches the reference on 3 random cases', 'Your output, weights and pooled projections agree with the reference for several head and group counts.', () => {
      const cases: [number[][], number[][][], number, number, number[][], number[][][], number[][], number[][]][] = [[[[0.305, -1.04, 0.75, 0.941, -1.951, -1.302, 0.128, -0.316], [-0.017, -0.853, 0.879, 0.778, 0.066, 1.127, 0.468, -0.859], [0.369, -0.959, 0.878, -0.05, -0.185, -0.681, 1.223, -0.155]], [[[-0.428, -0.352, 0.532, 0.365, 0.413, 0.431, 2.142, -0.406], [-0.512, -0.814, 0.616, 1.129, -0.114, -0.84, -0.824, 0.651], [0.743, 0.543, -0.666, 0.232, 0.117, 0.219, 0.871, 0.224], [0.679, 0.068, 0.289, 0.631, -1.457, -0.32, -0.47, -0.639], [-0.275, 1.495, -0.866, 0.968, -1.683, -0.335, 0.163, 0.586], [0.711, 0.793, -0.349, -0.462, 0.858, -0.191, -1.276, -1.133], [-0.919, 0.497, 0.142, 0.69, -0.427, 0.159, 0.626, -0.309], [0.457, -0.662, -0.363, -0.382, -1.196, 0.487, -0.469, 0.012]], [[0.481, 0.447, 0.665, -0.098], [-0.423, -0.08, -1.687, -1.447], [-1.323, -0.997, 0.4, -0.905], [-0.378, 1.299, -0.356, 0.738], [-0.934, -0.205, -0.95, -0.339], [0.84, -1.727, 0.434, 0.238], [-0.594, -1.446, 0.072, -0.529], [0.233, 0.022, 1.602, -0.239]], [[-1.023, 0.179, 0.22, 1.359], [0.835, 0.357, 1.463, -1.189], [-0.64, -0.927, -0.39, -1.377], [0.635, -0.222, -1.471, -1.016], [0.314, 0.838, 1.997, 2.914], [0.414, -0.99, -2.132, 0.268], [-0.813, -0.415, -0.612, -0.141], [1.066, 0.157, -0.159, -1.036]], [[-1.675, -0.486, -0.054, 1.768, 0.13, 0.983, -0.499, -1.185], [-0.965, -0.725, 2.128, -0.821, 0.838, -0.903, 0.932, 0.385], [-0.157, -0.041, -0.655, 0.446, -0.455, -1.226, -1.278, 0.173], [1.579, 0.16, -0.119, 0.286, 1.306, 0.219, -0.411, 1.106], [0.429, 1.536, 0.183, -1.224, -1.368, 1.651, 1.724, -0.18], [-0.383, 1.461, -1.107, -0.895, 0.643, -0.395, -0.005, -0.163], [0.338, 1.407, 0.091, 0.644, -2.05, -0.049, -0.843, -1.219], [-0.878, -0.334, 0.916, -1.326, 0.031, -0.484, -0.328, 1.003]]], 4, 2, [[4.10488411965, -15.2496433832, -2.33387933605, 10.7070174175, 3.48308170822, -0.542484145022, -1.73124557185, -0.441666833267], [3.45745111852, -9.76982053015, 0.864395158201, 1.65413572975, 3.34609938209, -2.34480531595, -0.565331478427, 2.89210951248], [6.49502480674, -12.8640756555, -3.73862488663, 7.70317428255, 8.90181747949, -1.51506303648, 1.28362164399, 1.0013308014]], [[[7.48927090289e-05, 0.941796261218, 0.058128846073], [0.999982172306, 3.45192290643e-06, 1.43757710057e-05], [0.900851088176, 0.0203059075073, 0.0788430043164]], [[0.00688954925305, 0.903141925646, 0.089968525101], [0.150779013196, 0.294708924305, 0.554512062499], [0.485575253121, 0.195600751574, 0.318823995305]], [[0.911183845529, 0.049444762314, 0.0393713921571], [0.520435033203, 0.16487405793, 0.314690908868], [0.556445234543, 0.371698040086, 0.0718567253716]], [[0.597114952737, 0.00643133199311, 0.39645371527], [0.0420021446285, 0.0690898838807, 0.888907971491], [0.856352246904, 0.00218941983768, 0.141458333258]]], [[0.538, 1.337, -0.155, -0.696, -0.224, 0.242, 0.177, -1.084], [0.09, 0.228, 2.517, 1.877, -0.853, -0.287, -1.463, -0.591], [0.316, 1.206, -0.729, -0.654, -2.147, -0.163, -1.062, -0.529], [-0.877, -0.094, -1.758, -1.467, 2.129, -1.287, -1.097, 1.837], [2.905, -1.172, -0.368, 0.342, 1.729, -0.987, -0.245, 0.777], [0.435, -0.376, -0.134, -1.375, -0.238, -0.266, 0.232, -0.555], [0.472, 1.013, 0.155, 0.352, 0.053, 0, -0.722, 0.316], [-0.097, 2.093, 1.573, 0.386, -0.763, -1.112, 1.191, 0.263]], [[0.1915, 0.3205, -0.0235, -0.421], [1.3035, 1.0525, -1.158, -0.439], [-0.2065, 0.276, -1.6045, -0.346], [-1.3175, -0.7805, 0.516, 0.275], [1.2685, -0.415, 0.742, -0.105], [0.1505, -0.8755, -0.003, -0.4105], [0.3135, 0.6825, -0.3345, 0.158], [0.738, 1.2395, 0.214, -0.4245]]], [[[0.48, -1.745, 0.927, 0.454, -1.11, -0.472], [0.264, 0.052, -0.292, -0.103, -0.252, 0.153], [1.471, -2.567, -0.237, 0.177, 0.296, -0.372], [-1.757, 0.328, 1.727, -1.534, 0.864, -0.329]], [[[-0.061, -1.053, -0.334, 1.3, 0.583, 1.732], [1.177, 0.439, 1.744, 0.439, 0.828, -0.297], [0.067, -0.697, 0.99, -1.178, 0.782, -0.191], [1.171, 0.751, 1.821, 0.731, -1.572, -0.067], [-1.172, -0.518, 1.511, 0.638, -0.699, -1.014], [0.033, -1.217, -0.671, 0.312, 1.155, 0.609]], [[-2.291, 0.304], [0.072, 0.414], [1.616, -2.063], [-0.591, 0.591], [-1.582, 1.476], [0.368, 0.847]], [[-0.571, 0.814], [1.068, 0.233], [0.234, 0.27], [-0.863, -0.148], [-0.153, 0.383], [1, -1.059]], [[-0.125, 1.481, -0.744, -0.822, 0.202, 0.844], [0.011, 1.329, 0.857, 0.842, 0.554, 2.328], [-0.205, -2.004, 1.604, -0.458, 0.108, 1.31], [-1.602, -1.252, -1.601, -0.794, 0.44, 0.524], [0.276, -1.413, -2.31, 0.054, -0.472, 0.459], [0.702, 0.138, 0.76, 0.229, 0.53, -0.705]]], 3, 1, [[-0.956400427976, 10.6050255943, 2.66262074566, 2.82713017231, 2.12356826728, -7.94907395261], [-0.573101893274, 6.79977676054, -8.97363297026, 0.879783631606, -0.0313650326883, -3.83788236804], [-0.675703949181, 8.35180842741, 6.09479185892, 5.43842712669, 2.22545497452, -8.80535816075], [0.713204447857, -13.6247918939, 2.01631091987, 3.27793325417, -1.21973198198, 3.31235192255]], [[[0.408901237884, 0.136325419848, 0.269415380259, 0.185357962009], [0.285651771342, 0.113875088723, 0.0654023410982, 0.535070798837], [0.000319259532875, 4.88396125344e-05, 0.999631897284, 3.57045113308e-09], [0.000205920408672, 0.00152841864241, 0.998265536989, 1.23960409714e-07]], [[0.000899070680663, 0.000197252799627, 0.998903626468, 5.00515920219e-08], [0.00274041344167, 0.0652713363584, 0.931854544778, 0.000133705422043], [1.97174878197e-10, 7.27453062805e-06, 0.999992725272, 2.77756154348e-16], [0.0186763918682, 1.90864044703e-10, 5.2156162778e-12, 0.981323607936]], [[3.45664342589e-05, 0.0954984421248, 0.904464172391, 2.81904992743e-06], [0.0592567998236, 0.473535560902, 0.0975463193143, 0.36966131996], [4.95651327698e-09, 0.00192760093869, 0.998072394101, 4.29747115963e-12], [0.00418421594711, 8.49148947271e-11, 6.24979114632e-13, 0.995815783967]]], [[-0.18, 0.197, 0.821, -0.394, 0.521, -0.266], [-0.118, 0.83, -1.993, -1.296, -1.482, -2.334], [-0.678, 0.749, -0.285, 0.198, 1.089, 1.328], [-0.069, 1.354, 0.092, -0.837, -0.594, -1.481], [-0.888, -0.358, 0.804, 1.721, -1.382, 0.393], [-1.041, 0.475, -0.131, -1.831, 0.928, -0.605]], [[0.387333333333, -0.154333333333], [-1.19766666667, -0.933333333333], [0.042, 0.758333333333], [-0.190333333333, -0.321333333333], [-0.488666666667, 0.585333333333], [-0.0813333333333, -0.653666666667]]], [[[-0.534, -1.07, -0.654, 0.428, -0.189, 0.329, 0.362, 1.321], [-0.343, -1.477, 1.067, -0.331, 1.115, 0.383, -0.131, 0.349]], [[[1.951, 2.077, 0.069, 0.16, 1.076, -0.846, 0.333, -0.026], [0.314, -0.833, -1.59, -2.073, -1.117, -0.459, -0.293, 1.937], [1.106, -0.962, 0.348, -0.407, -0.284, 0.185, 0.619, -0.339], [1.064, -1.142, 0.006, 2.598, 0.223, 1.433, 0.092, 0.581], [-0.057, -0.17, -0.779, 0.43, -0.852, 0.666, 1.085, 0.367], [-0.286, 0.454, -0.309, 0.936, -1.831, -0.336, -1.991, -1.495], [1.364, 0.895, -0.719, -1.503, -2.965, -0.543, 2.42, 0.435], [-0.56, 0.465, -1.561, -0.297, 0.099, -0.086, 0.791, 0.345]], [[0.668, -0.688, 0.898, 1.629, -0.97, -0.888, 1.336, -0.191], [1.404, -0.443, 1.455, 0.131, 0.258, 1.565, -0.362, -0.941], [-0.449, 0.452, -1.566, 0.637, -0.539, 1.148, -2.394, -0.787], [-1.686, -0.826, 0.248, -0.179, -0.253, -0.159, 0.203, -1.009], [0.707, 0.663, 0.385, 0.557, 0.296, 2.035, -0.087, -0.307], [-0.754, -1.032, -1.244, -0.889, -0.071, 0.334, 0.051, -0.766], [0.9, 0.739, -0.16, -0.653, 0.548, 0.188, -1.448, -0.068], [0.262, -0.9, 0.19, -1.455, 1.336, 1.248, -0.253, 0.363]], [[-2.41, -1.156, -0.294, -1.072, 0.714, 1.997, -1.177, -0.837], [0.235, 1.611, -1.222, 0.249, 1.821, -1.652, -1.281, -0.424], [-0.521, 0.813, 0.242, -1.775, 0.515, -0.578, 1.274, -0.628], [-0.637, 0.541, 0.763, 0.448, -1.686, 0.538, -1.034, 0.235], [-1.424, 0.446, -0.807, -1.283, 0.714, 0.242, -0.614, 1.451], [-0.441, 0.032, 0.269, -0.62, 0.471, -0.533, -0.412, 1.363], [-1.041, -2.413, 1.611, 2.549, -0.405, -1.937, -0.31, -0.286], [-0.19, -1.113, 0.58, 0.525, -1.494, 0.699, 2.053, 0.172]], [[-0.337, -0.142, 0.615, -1.731, 0.164, -0.39, 1.848, -0.174], [1.668, -1.104, 0.587, 0.319, -0.869, 0.177, 1.213, -0.324], [-1.692, -0.018, -0.902, -0.342, -0.082, -1.706, -1.616, 0.482], [-0.523, -2.565, 0.785, 0.272, -0.714, -1.317, 0.836, 0.349], [2.383, 0.42, 0.388, -0.167, 0.817, 0.625, 1.252, -0.521], [-0.435, -0.479, 0.791, 1.498, -0.459, -0.425, 0.314, -0.246], [0.952, -2.252, -0.827, -0.782, -2.32, -0.964, -0.915, -0.201], [1.113, -0.245, -1.031, -0.057, 1.049, -0.976, -0.911, 0.559]]], 4, 4, [[-0.74246043321, 1.71522859197, -9.905208017, -0.0566294123991, -4.53765132159, -3.51299737967, -15.4463256182, 0.698280912585], [-2.82117177799, 2.78363284517, -10.0656393738, -2.10681251916, -3.24907260367, -4.21528892601, -15.1475678801, 0.922222411048]], [[[0.15442634912, 0.84557365088], [0.585782982141, 0.414217017859]], [[7.5236779008e-05, 0.999924763221], [0.00941274700431, 0.990587252996]], [[0.0814310695879, 0.918568930412], [0.0458452573328, 0.954154742667]], [[0.6651964009, 0.3348035991], [0.600806371302, 0.399193628698]]], [[-0.222, 0.647, -0.014, 0.702, -1.035, -0.012, -0.211, -1.216], [-1.563, 0.686, -0.351, -1.022, -0.096, 1.128, -2.281, -1.497], [-0.923, 1.461, 0.283, 0.767, -1.14, -1.12, 0.448, 0.058], [0.549, -0.188, 0.278, 0.158, 0.778, 0.807, -1.62, -2.247], [1.002, 1.188, -1.021, -1.86, 0.099, 0.931, 1.798, 0.516], [-0.372, -0.893, 0.011, -0.299, -1.015, 2.049, 1.785, 1.136], [-0.921, 0.855, 0.64, 0.443, 1.25, 0.635, 0.74, 0.637], [0.341, -1.784, 0.084, -0.556, -1.28, 1.682, 1.729, 1.359]], [[-0.222, 0.647, -0.014, 0.702, -1.035, -0.012, -0.211, -1.216], [-1.563, 0.686, -0.351, -1.022, -0.096, 1.128, -2.281, -1.497], [-0.923, 1.461, 0.283, 0.767, -1.14, -1.12, 0.448, 0.058], [0.549, -0.188, 0.278, 0.158, 0.778, 0.807, -1.62, -2.247], [1.002, 1.188, -1.021, -1.86, 0.099, 0.931, 1.798, 0.516], [-0.372, -0.893, 0.011, -0.299, -1.015, 2.049, 1.785, 1.136], [-0.921, 0.855, 0.64, 0.443, 1.25, 0.635, 0.74, 0.637], [0.341, -1.784, 0.084, -0.556, -1.28, 1.682, 1.729, 1.359]]]];
      for (const [x, [wq, wk, wv, wo], H, G, out, w, wp, pooled] of cases) {
        const label = `T = ${x.length}, D = ${x[0].length}, H = ${H}, G = ${G}`;
        const got = sub.groupedQueryAttention(x, wq, wk, wv, wo, H, G);
        close(got.output, out, `the output for ${label}`, 1e-9);
        close(got.weights, w, `the weights for ${label}`, 1e-9);
        close(sub.meanPoolKvHeads(wp, H, G), pooled, `the pooled projection for ${label}`, 1e-9);
      }
    });
  },
};

export default drill;
