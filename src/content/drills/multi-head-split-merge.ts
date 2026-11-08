import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'multi-head-split-merge',
  entry: ['splitHeads', 'mergeHeads', 'multiHeadAttention'],
  problem: String.raw`Multi-head attention runs several small attentions in parallel. Each head sees one slice of the features; the heads are then joined again and mixed by an output projection. The hard part is the bookkeeping: a wrong layout gives the right shape but the wrong numbers.

## Task

Write three functions.

1. \`splitHeads(x, nHeads)\` turns \`x\` (T × D) into H = \`nHeads\` matrices of T × dHead, with dHead = D / H. Head h holds the columns h·dHead to (h + 1)·dHead - 1 of every token, in order: \`splitHeads(x, H)[h][t][j]\` equals \`x[t][h * dHead + j]\`. When D is not divisible by H, throw an \`Error\`.
2. \`mergeHeads(heads)\` is the inverse: H × T × dHead back to T × (H·dHead), so \`mergeHeads(splitHeads(x, H))\` equals \`x\`.
3. \`multiHeadAttention(x, wQ, wK, wV, wO, nHeads)\` returns \`{ output, weights }\` of multi-head self-attention:
   1. Q = x·wQ, K = x·wK, V = x·wV (ordinary matrix products, no bias).
   2. Split Q, K and V into heads.
   3. In each head, softmax(Q_h·K_hᵀ / √dHead)·V_h. The softmax is over the keys (each row). No mask.
   4. Merge the head outputs and multiply by wO.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`x\` | \`number[][]\` | T tokens × D features |
| \`nHeads\` | \`number\` | the number of heads H |
| \`wQ\`, \`wK\`, \`wV\`, \`wO\` | \`number[][]\` | D × D projections |

\`splitHeads\` returns \`number[][][]\` (H × T × dHead); \`mergeHeads\` returns T × D. \`multiHeadAttention\` returns \`{ output: number[][] (T × D), weights: number[][][] (H × T × T) }\`, where \`weights[h][i][j]\` is the weight query i gives key j in head h.

## Constraints

- 1 ≤ T ≤ 16 and 1 ≤ H ≤ D ≤ 64. Activations can be large; the output must stay finite.
- Do not change the input arrays.

## Examples

\`\`\`ts
splitHeads([[0, 1, 2, 3], [4, 5, 6, 7]], 2);
// [[[0, 1], [4, 5]],
//  [[2, 3], [6, 7]]]

const x = [[1, 0, 0, 1], [0, 2, 1, 0], [1, 1, 1, 1]];
const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
multiHeadAttention(x, I, I, I, I, 2);
// output  [[0.80222419, 0.79666372, 0.59888791, 0.80222419],
//          [0.23208206, 1.72252957, 0.80222419, 0.59888791],
//          [0.59888791, 1.20333628, 0.75174492, 0.75174492]]
// weights [[[0.40111209, 0.19777581, 0.40111209],
//           [0.04538836, 0.76791794, 0.1866937],
//           [0.19777581, 0.40111209, 0.40111209]],
//          [[0.40111209, 0.19777581, 0.40111209],
//           [0.19777581, 0.40111209, 0.40111209],
//           [0.24825508, 0.24825508, 0.50348984]]]
\`\`\``,
  starter: `function splitHeads(x: number[][], nHeads: number): number[][][] {
  throw new Error('not implemented');
}

function mergeHeads(heads: number[][][]): number[][] {
  throw new Error('not implemented');
}

function multiHeadAttention(x: number[][], wQ: number[][], wK: number[][], wV: number[][], wO: number[][], nHeads: number): { output: number[][]; weights: number[][][] } {
  throw new Error('not implemented');
}
`,
  solution: `const matMul = (a: number[][], b: number[][]) => a.map((row) => b[0].map((_, c) => row.reduce((s, v, k) => s + v * b[k][c], 0)));

function softmaxRow(scores: number[]): number[] {
  const m = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function splitHeads(x: number[][], nHeads: number): number[][][] {
  const T = x.length;
  const D = x[0].length;
  if (D % nHeads !== 0) throw new Error('d_model is not divisible by nHeads');
  const dh = D / nHeads;
  const H = nHeads;
  return Array.from({ length: H }, (_, h) => Array.from({ length: T }, (_, t) => Array.from({ length: dh }, (_, j) => x[t][h * dh + j])));
}

function mergeHeads(heads: number[][][]): number[][] {
  return heads[0].map((_, t) => heads.flatMap((head) => head[t]));
}

function multiHeadAttention(x: number[][], wQ: number[][], wK: number[][], wV: number[][], wO: number[][], nHeads: number): { output: number[][]; weights: number[][][] } {
  const q = splitHeads(matMul(x, wQ), nHeads);
  const k = splitHeads(matMul(x, wK), nHeads);
  const v = splitHeads(matMul(x, wV), nHeads);
  const dh = q[0][0].length;
  const weights = q.map((qh, h) => qh.map((qi) => softmaxRow(k[h].map((kj) => qi.reduce((s, a, d) => s + a * kj[d], 0) / Math.sqrt(dh)))));
  const outs = weights.map((wh, h) => matMul(wh, v[h]));
  return { output: matMul(mergeHeads(outs), wO), weights };
}
`,
  hints: [
    'Head h is a block of dHead neighbouring columns: column h * dHead + j of token t goes to heads[h][t][j]. The head index comes first, then the token.',
    'mergeHeads does the opposite: row t of the result is head 0\'s row t, then head 1\'s row t, and so on, joined end to end.',
    'After the split, each head is plain single-head attention on T × dHead matrices. Scale by √dHead, the size of one head, not √D.',
    'Take the softmax over each row of a head\'s scores (one row per query), with the row maximum subtracted first. Merge the head outputs, then multiply by wO.',
  ],
  notes: String.raw`## Why the layout matters

In numpy or PyTorch, splitting heads is reshape (T, D) → (T, H, dHead) then transpose to (H, T, dHead). A direct reshape to (H, T, dHead) has the right shape but groups numbers from several tokens into one head: it mixes tokens with features, and nothing errors. Writing the index rule out by hand, as here, makes the correct layout explicit.

## Why heads use neighbouring columns

Any fixed assignment of columns to heads gives an equally good model, because the projections can learn any order. The block layout is the convention of nearly every library, and it matters when you load trained weights: a strided layout reads them in the wrong order.

## The cost of more heads

The parameter count does not change with H. Each head gets a smaller dHead, and the scale √dHead changes with it. The attention weights are H × T × T, so their memory grows with the number of heads, which is the cost FlashAttention avoids by never materialising them.

## Where this goes next

Grouped-query attention splits K and V into fewer heads than Q and shares them. The KV cache stores the split keys and values, one block per head.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const randM = (r: () => number, n: number, c: number, s = 2) => Array.from({ length: n }, () => Array.from({ length: c }, () => (r() * 2 - 1) * s));
    const eye = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    const mm = (a: number[][], b: number[][]) => a.map((row) => b[0].map((_, c) => row.reduce((s, v, k) => s + v * b[k][c], 0)));
    const attn = (Q: number[][], K: number[][], V: number[][]) => {
      const w = Q.map((q) => {
        const s = K.map((k) => q.reduce((a, x, d) => a + x * k[d], 0) / Math.sqrt(q.length));
        const m = Math.max(...s);
        const e = s.map((x) => Math.exp(x - m));
        const z = e.reduce((a, b) => a + b, 0);
        return e.map((x) => x / z);
      });
      return { w, o: mm(w, V) };
    };
    const threw = (fn: () => unknown) => {
      try {
        fn();
      } catch {
        return true;
      }
      return false;
    };

    check('split a 2 × 4 matrix into 2 heads, and merge it back', 'Head h holds columns h·dHead to (h + 1)·dHead - 1 of every token; the head index comes before the token index. mergeHeads puts each block back.', () => {
      const x = [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
      ];
      const heads = sub.splitHeads(x, 2);
      equal(
        heads,
        [
          [
            [0, 1],
            [4, 5],
          ],
          [
            [2, 3],
            [6, 7],
          ],
        ],
        'splitHeads(x, 2)',
      );
      equal(sub.mergeHeads(heads), x, 'mergeHeads(splitHeads(x, 2))');
    });
    check('multi-head attention with identity projections', 'With identity projections Q, K and V equal x. Each head runs softmax(Q·Kᵀ / √dHead)·V on its own two columns.', () => {
      const x = [
        [1, 0, 0, 1],
        [0, 2, 1, 0],
        [1, 1, 1, 1],
      ];
      const I = eye(4);
      const { output, weights } = sub.multiHeadAttention(x, I, I, I, I, 2);
      close(
        output,
        [
          [0.80222419, 0.79666372, 0.59888791, 0.80222419],
          [0.23208206, 1.72252957, 0.80222419, 0.59888791],
          [0.59888791, 1.20333628, 0.75174492, 0.75174492],
        ],
        'the output',
        1e-6,
      );
      close(
        weights,
        [
          [
            [0.40111209, 0.19777581, 0.40111209],
            [0.04538836, 0.76791794, 0.1866937],
            [0.19777581, 0.40111209, 0.40111209],
          ],
          [
            [0.40111209, 0.19777581, 0.40111209],
            [0.19777581, 0.40111209, 0.40111209],
            [0.24825508, 0.24825508, 0.50348984],
          ],
        ],
        'the weights',
        1e-6,
      );
    });
    check('split then merge gives x back, for every head count', 'The split and the merge only move numbers. A round trip must give the input back exactly.', () => {
      const x = randM(rng(0), 5, 12);
      for (const H of [1, 2, 3, 4, 6, 12]) equal(sub.mergeHeads(sub.splitHeads(x, H)), x, `the round trip with ${H} heads`);
    });
    check('head h is a block of neighbouring columns', 'splitHeads(x, H)[h][t] must be x[t].slice(h·dHead, (h + 1)·dHead). A strided layout passes the round trip but gives each head the wrong columns.', () => {
      const x = randM(rng(1), 3, 8);
      const heads = sub.splitHeads(x, 4);
      equal([heads.length, heads[0]?.length, heads[0]?.[0]?.length], [4, 3, 2], '[heads, tokens, dHead]');
      for (let h = 0; h < 4; h++) equal(heads[h], x.map((row) => row.slice(2 * h, 2 * h + 2)), `head ${h}`);
    });
    check('each head is a separate attention over its own columns', 'Head h attends with its own columns of Q, K and V and scales by √dHead. Its weights are a softmax over the keys, so each row sums to 1.', () => {
      const r = rng(2);
      const x = randM(r, 4, 6);
      const [wq, wk, wv, wo] = [randM(r, 6, 6, 1), randM(r, 6, 6, 1), randM(r, 6, 6, 1), randM(r, 6, 6, 1)];
      const { output, weights } = sub.multiHeadAttention(x, wq, wk, wv, wo, 3);
      equal([output.length, output[0]?.length, weights.length, weights[0]?.length, weights[0]?.[0]?.length], [4, 6, 3, 4, 4], '[output rows, output columns, heads, queries, keys]');
      const [Q, K, V] = [mm(x, wq), mm(x, wk), mm(x, wv)];
      const cols = (m: number[][], h: number) => m.map((row) => row.slice(2 * h, 2 * h + 2));
      const per = [0, 1, 2].map((h) => attn(cols(Q, h), cols(K, h), cols(V, h)));
      per.forEach((p, h) => close(weights[h], p.w, `the weights of head ${h}`, 1e-9));
      const merged = x.map((_, t) => per.flatMap((p) => p.o[t]));
      close(output, mm(merged, wo), 'the output (merged heads times wO)', 1e-9);
    });
    check('D not divisible by nHeads throws', 'Each head needs the same number of columns. When D % nHeads is not 0, throw an Error.', () => {
      equal(sub.splitHeads(randM(rng(3), 2, 6), 3).length, 3, 'the number of heads from splitHeads with D = 6 and 3 heads');
      ok(
        threw(() => sub.splitHeads(randM(rng(3), 2, 6), 4)),
        'splitHeads with D = 6 and 4 heads did not throw',
      );
    });
    check('one head, and one column per head', 'With 1 head this is single-head attention scaled by √D. With D heads each head has one column.', () => {
      const r = rng(4);
      const x = randM(r, 3, 4);
      const I = eye(4);
      const one = sub.multiHeadAttention(x, I, I, I, I, 1);
      close(one.output, attn(x, x, x).o, 'the output with 1 head', 1e-9);
      const four = sub.multiHeadAttention(x, I, I, I, I, 4);
      const cols = (h: number) => x.map((row) => [row[h]]);
      [0, 1, 2, 3].forEach((h) => close(four.weights[h], attn(cols(h), cols(h), cols(h)).w, `the weights of 1-column head ${h}`, 1e-9));
    });
    check('large activations do not overflow', 'Scores larger than 709 overflow Math.exp. Subtract the maximum of each row before Math.exp.', () => {
      const x = [
        [40, 0, 30, 0],
        [0, 40, 0, 30],
      ];
      const I = eye(4);
      const { output, weights } = sub.multiHeadAttention(x, I, I, I, I, 2);
      ok(output.flat().concat(weights.flat(2)).every((v: number) => Number.isFinite(v)), 'the output or the weights have NaN or infinite values');
      close(weights[0], [[1, 0], [0, 1]], 'the weights of head 0', 1e-9);
    });
    check('the inputs are not changed', 'A function that writes into x or into a weight matrix breaks the code that calls it.', () => {
      const r = rng(5);
      const x = randM(r, 3, 4);
      const ws = [randM(r, 4, 4), randM(r, 4, 4), randM(r, 4, 4), randM(r, 4, 4)];
      const before = JSON.stringify([x, ws]);
      sub.multiHeadAttention(x, ws[0], ws[1], ws[2], ws[3], 2);
      sub.mergeHeads(sub.splitHeads(x, 2));
      equal(JSON.stringify([x, ws]), before, 'x and the projections after the calls');
    });
    check('matches the reference on 3 random cases', 'Your output and weights agree with the reference solution for several sizes and head counts.', () => {
      const cases: [number[][], number[][][], number, number[][], number[][][]][] = [[[[0.305, -1.04, 0.75, 0.941], [-1.951, -1.302, 0.128, -0.316], [-0.017, -0.853, 0.879, 0.778]], [[[0.066, 1.127, 0.468, -0.859], [0.369, -0.959, 0.878, -0.05], [-0.185, -0.681, 1.223, -0.155], [-0.428, -0.352, 0.532, 0.365]], [[0.413, 0.431, 2.142, -0.406], [-0.512, -0.814, 0.616, 1.129], [-0.114, -0.84, -0.824, 0.651], [0.743, 0.543, -0.666, 0.232]], [[0.117, 0.219, 0.871, 0.224], [0.679, 0.068, 0.289, 0.631], [-1.457, -0.32, -0.47, -0.639], [-0.275, 1.495, -0.866, 0.968]], [[-1.683, -0.335, 0.163, 0.586], [0.711, 0.793, -0.349, -0.462], [0.858, -0.191, -1.276, -1.133], [-0.919, 0.497, 0.142, 0.69]]], 2, [[1.92951539093, 0.588468944817, 1.3796500114, 0.2990625667], [2.44740900685, -0.0447218721074, 1.92761507318, 0.127047465861], [1.79237385254, 0.514891429351, 1.40741783379, 0.367087946666]], [[[0.240631520904, 0.503566933298, 0.255801545797], [0.171246198786, 0.560788072946, 0.267965728268], [0.200620653565, 0.545723593917, 0.253655752519]], [[0.509807519109, 0.0960350420602, 0.394157438831], [0.00516742540236, 0.976296652778, 0.0185359218198], [0.516364143775, 0.0774403562836, 0.406195499941]]]], [[[-0.427, 0.159, 0.626, -0.309, 0.457, -0.662], [-0.363, -0.382, -1.196, 0.487, -0.469, 0.012], [0.481, 0.447, 0.665, -0.098, -0.423, -0.08], [-1.687, -1.447, -1.323, -0.997, 0.4, -0.905]], [[[-0.378, 1.299, -0.356, 0.738, -0.934, -0.205], [-0.95, -0.339, 0.84, -1.727, 0.434, 0.238], [-0.594, -1.446, 0.072, -0.529, 0.233, 0.022], [1.602, -0.239, -1.023, 0.179, 0.22, 1.359], [0.835, 0.357, 1.463, -1.189, -0.64, -0.927], [-0.39, -1.377, 0.635, -0.222, -1.471, -1.016]], [[0.314, 0.838, 1.997, 2.914, 0.414, -0.99], [-2.132, 0.268, -0.813, -0.415, -0.612, -0.141], [1.066, 0.157, -0.159, -1.036, -1.675, -0.486], [-0.054, 1.768, 0.13, 0.983, -0.499, -1.185], [-0.965, -0.725, 2.128, -0.821, 0.838, -0.903], [0.932, 0.385, -0.157, -0.041, -0.655, 0.446]], [[-0.455, -1.226, -1.278, 0.173, 1.579, 0.16], [-0.119, 0.286, 1.306, 0.219, -0.411, 1.106], [0.429, 1.536, 0.183, -1.224, -1.368, 1.651], [1.724, -0.18, -0.383, 1.461, -1.107, -0.895], [0.643, -0.395, -0.005, -0.163, 0.338, 1.407], [0.091, 0.644, -2.05, -0.049, -0.843, -1.219]], [[-0.878, -0.334, 0.916, -1.326, 0.031, -0.484], [-0.328, 1.003, 0.538, 1.337, -0.155, -0.696], [-0.224, 0.242, 0.177, -1.084, 0.09, 0.228], [2.517, 1.877, -0.853, -0.287, -1.463, -0.591], [0.316, 1.206, -0.729, -0.654, -2.147, -0.163], [-1.062, -0.529, -0.877, -0.094, -1.758, -1.467]]], 3, [[0.503551327553, 1.78803340261, 0.602153244745, -2.77741914338, 0.78618360679, 3.51309280047], [6.03096179186, 5.29203499202, -1.2638472814, -0.77049459728, -2.71076380789, 1.15529790694], [0.975002844765, 1.6787353482, 0.268665624621, -1.70576895657, 0.471602521502, 2.46586241292], [4.50381508033, 4.10950892018, -0.504641151864, -0.594941195393, -1.30545861313, 1.70955852198]], [[[0.251253905774, 0.13581843295, 0.124216308623, 0.488711352653], [0.0354082733648, 0.355873346702, 0.600264432388, 0.00845394754573], [0.3761563551, 0.0887234260911, 0.0569578813902, 0.478162337419], [0.010161418713, 0.335897324988, 0.653377301327, 0.000563954972088]], [[0.289819130671, 0.0035319864967, 0.00855855470152, 0.69809032813], [0.002758097456, 0.777647994943, 0.218340052048, 0.00125385555279], [0.25501853783, 0.16002505444, 0.146327400779, 0.43862900695], [0.0126150863756, 0.560649242319, 0.424935042506, 0.00180062879867]], [[0.0243726637072, 0.11285463512, 0.00950246105574, 0.853270240117], [0.0344640433007, 0.110483379869, 0.0247116527255, 0.830340924105], [0.116183696969, 0.215598086053, 0.0909448743267, 0.57727334265], [0.0568204298152, 0.199085126404, 0.0196639681379, 0.724430475643]]]], [[[2.129, -1.287, -1.097, 1.837, 2.905, -1.172, -0.368, 0.342], [1.729, -0.987, -0.245, 0.777, 0.435, -0.376, -0.134, -1.375]], [[[-0.238, -0.266, 0.232, -0.555, 0.472, 1.013, 0.155, 0.352], [0.053, 0, -0.722, 0.316, -0.097, 2.093, 1.573, 0.386], [-0.763, -1.112, 1.191, 0.263, 0.48, -1.745, 0.927, 0.454], [-1.11, -0.472, 0.264, 0.052, -0.292, -0.103, -0.252, 0.153], [1.471, -2.567, -0.237, 0.177, 0.296, -0.372, -1.757, 0.328], [1.727, -1.534, 0.864, -0.329, -0.061, -1.053, -0.334, 1.3], [0.583, 1.732, 1.177, 0.439, 1.744, 0.439, 0.828, -0.297], [0.067, -0.697, 0.99, -1.178, 0.782, -0.191, 1.171, 0.751]], [[1.821, 0.731, -1.572, -0.067, -1.172, -0.518, 1.511, 0.638], [-0.699, -1.014, 0.033, -1.217, -0.671, 0.312, 1.155, 0.609], [-2.291, 0.304, 0.072, 0.414, 1.616, -2.063, -0.591, 0.591], [-1.582, 1.476, 0.368, 0.847, -0.571, 0.814, 1.068, 0.233], [0.234, 0.27, -0.863, -0.148, -0.153, 0.383, 1, -1.059], [-0.125, 1.481, -0.744, -0.822, 0.202, 0.844, 0.011, 1.329], [0.857, 0.842, 0.554, 2.328, -0.205, -2.004, 1.604, -0.458], [0.108, 1.31, -1.602, -1.252, -1.601, -0.794, 0.44, 0.524]], [[0.276, -1.413, -2.31, 0.054, -0.472, 0.459, 0.702, 0.138], [0.76, 0.229, 0.53, -0.705, -0.18, 0.197, 0.821, -0.394], [0.521, -0.266, -0.118, 0.83, -1.993, -1.296, -1.482, -2.334], [-0.678, 0.749, -0.285, 0.198, 1.089, 1.328, -0.069, 1.354], [0.092, -0.837, -0.594, -1.481, -0.888, -0.358, 0.804, 1.721], [-1.382, 0.393, -1.041, 0.475, -0.131, -1.831, 0.928, -0.605], [-0.534, -1.07, -0.654, 0.428, -0.189, 0.329, 0.362, 1.321], [-0.343, -1.477, 1.067, -0.331, 1.115, 0.383, -0.131, 0.349]], [[1.951, 2.077, 0.069, 0.16, 1.076, -0.846, 0.333, -0.026], [0.314, -0.833, -1.59, -2.073, -1.117, -0.459, -0.293, 1.937], [1.106, -0.962, 0.348, -0.407, -0.284, 0.185, 0.619, -0.339], [1.064, -1.142, 0.006, 2.598, 0.223, 1.433, 0.092, 0.581], [-0.057, -0.17, -0.779, 0.43, -0.852, 0.666, 1.085, 0.367], [-0.286, 0.454, -0.309, 0.936, -1.831, -0.336, -1.991, -1.495], [1.364, 0.895, -0.719, -1.503, -2.965, -0.543, 2.42, 0.435], [-0.56, 0.465, -1.561, -0.297, 0.099, -0.086, 0.791, 0.345]]], 4, [[-12.3005471483, 14.9663643525, -6.6179536058, -8.42898519904, -5.85567907144, -9.68907484264, -6.08247419724, -4.61331191209], [-12.94713506, 15.65665827, -8.37472451429, -3.75272843848, -11.8248975865, -8.74843286468, -9.2619861106, -8.23384667228]], [[[1.06523757494e-07, 0.999999893476], [0.0663247094758, 0.933675290524]], [[0.996126830882, 0.00387316911768], [0.929207404694, 0.070792595306]], [[0.253182076925, 0.746817923075], [0.945619966101, 0.0543800338992]], [[6.59438885679e-12, 0.999999999993], [1.12770189807e-05, 0.999988722981]]]]];
      for (const [x, [wq, wk, wv, wo], H, out, w] of cases) {
        const got = sub.multiHeadAttention(x, wq, wk, wv, wo, H);
        const label = `T = ${x.length}, D = ${x[0].length}, H = ${H}`;
        close(got.output, out, `the output for ${label}`, 1e-9);
        close(got.weights, w, `the weights for ${label}`, 1e-9);
      }
    });
  },
};

export default drill;
