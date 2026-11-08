import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'lora-forward',
  entry: ['loraForward', 'mergeLora', 'countTrainable'],
  problem: String.raw`LoRA fine-tunes a large model without changing its weights. It keeps the weight W of a linear layer frozen and adds a small trainable path through two low-rank matrices A and B. After training you can merge the path into W, so inference costs the same as the base model.

## Task

Write three functions.

1. \`loraForward(x, W, b, A, B, alpha)\` returns the output of the layer with the adapter.
2. \`mergeLora(W, A, B, alpha)\` returns the merged weight.
3. \`countTrainable(inFeatures, outFeatures, rank)\` returns the number of trainable values in A and B.

The rank r is the number of rows of A. The output of the layer is

y = x·Wᵀ + b + (alpha / r) · x·Aᵀ·Bᵀ

The merged weight is W' = W + (alpha / r) · B·A. With the merged weight, x·W'ᵀ + b equals the output of \`loraForward\`.

Only A and B train. W and b are frozen and do not count.

## Input and output

| Name | Type | Shape | Meaning |
|---|---|---|---|
| \`x\` | \`number[][]\` | N × in | one input row per example |
| \`W\` | \`number[][]\` | out × in | the frozen weight |
| \`b\` | \`number[]\` | out | the frozen bias |
| \`A\` | \`number[][]\` | r × in | the down projection of the adapter |
| \`B\` | \`number[][]\` | out × r | the up projection of the adapter |
| \`alpha\` | \`number\` | | the LoRA scale numerator |

\`loraForward\` returns N × out, \`mergeLora\` returns a new out × in matrix, \`countTrainable\` returns an integer.

## Constraints

- The rank can be larger than \`in\` or \`out\`. alpha > 0.
- Do not change the input arrays.

## Examples

\`\`\`ts
const x = [[1, 2, 0], [0, -1, 1]];
const W = [[0.5, -0.5, 1], [1, 0, 0]];
const b = [0.1, -0.2];
const A = [[1, 0, 1], [0, 1, 0]];
const B = [[1, 0.5], [-1, 0]];
loraForward(x, W, b, A, B, 4);   // [[3.6, -1.2], [2.6, -2.2]]
loraForward(x, W, b, A, [[0, 0], [0, 0]], 4); // the base output [[-0.4, 0.8], [1.6, -0.2]]
mergeLora(W, A, B, 4);           // [[2.5, 0.5, 3], [-1, 0, -2]]
countTrainable(4096, 4096, 8);   // 65536
\`\`\``,
  starter: `function loraForward(x: number[][], W: number[][], b: number[], A: number[][], B: number[][], alpha: number): number[][] {
  throw new Error('not implemented');
}

function mergeLora(W: number[][], A: number[][], B: number[][], alpha: number): number[][] {
  throw new Error('not implemented');
}

function countTrainable(inFeatures: number, outFeatures: number, rank: number): number {
  throw new Error('not implemented');
}
`,
  solution: `/** rows of a times rows of b: (a·bᵀ)[i][j] = a[i] · b[j] */
const matTMul = (a: number[][], b: number[][]) => a.map((row) => b.map((col) => row.reduce((s, v, k) => s + v * col[k], 0)));

function loraForward(x: number[][], W: number[][], b: number[], A: number[][], B: number[][], alpha: number): number[][] {
  const scaling = alpha / A.length;
  const base = matTMul(x, W);
  const adapter = matTMul(matTMul(x, A), B);
  return base.map((row, n) => row.map((v, o) => v + b[o] + scaling * adapter[n][o]));
}

function mergeLora(W: number[][], A: number[][], B: number[][], alpha: number): number[][] {
  const scaling = alpha / A.length;
  return W.map((row, o) => row.map((w, i) => w + scaling * B[o].reduce((s, bv, k) => s + bv * A[k][i], 0)));
}

function countTrainable(inFeatures: number, outFeatures: number, rank: number): number {
  return rank * inFeatures + outFeatures * rank;
}
`,
  hints: [
    'Compute the base output and the adapter output apart, then add them. The base output is x·Wᵀ + b.',
    'The rank is A.length, the number of rows of A. Do not read it from W or from x.',
    'The adapter path first projects x down to r values with A (x·Aᵀ), then up to out values with B. Multiply that path by alpha / r.',
    'For the merge, B·A has the shape of W. Build a new matrix; do not add into W. For the count, add the sizes of A (r × in) and B (out × r).',
  ],
  notes: String.raw`## Why B starts at zero

LoRA sets A to small random values and B to zero. The product B·A is then zero, so the first forward pass gives the output of the base model, and training moves the layer away from it step by step.

## Why the scale is alpha over r

The scale alpha / r keeps the size of the update about the same when you change the rank, so you can try several ranks without retuning the learning rate. A common choice is alpha = 2r.

## Why the count is small

A full update of a 4096 × 4096 weight has about 16.8 million values. A rank-8 adapter has 8 × (4096 + 4096) = 65,536: 0.4 % of the full weight. The optimizer state (two Adam moments per value) shrinks by the same factor, which is most of the memory saving.

## Where this goes next

QLoRA keeps the frozen W in 4 bits and the adapter in full precision; the merge step dequantizes W first. Serving stacks such as vLLM can also keep many unmerged adapters on one base model and pick one per request.`,
  tests: (sub, { check, close, equal, rng }) => {
    const X = [
      [1, 2, 0],
      [0, -1, 1],
    ];
    const W = [
      [0.5, -0.5, 1],
      [1, 0, 0],
    ];
    const BIAS = [0.1, -0.2];
    const A = [
      [1, 0, 1],
      [0, 1, 0],
    ];
    const B = [
      [1, 0.5],
      [-1, 0],
    ];
    const randM = (r: () => number, n: number, c: number) => Array.from({ length: n }, () => Array.from({ length: c }, () => r() * 4 - 2));
    const mt = (a: number[][], b: number[][]) => a.map((row) => b.map((col) => row.reduce((s, v, k) => s + v * col[k], 0)));
    const layer = (seed: number, n: number, dIn: number, dOut: number, rank: number) => {
      const r = rng(seed);
      return { x: randM(r, n, dIn), w: randM(r, dOut, dIn), b: randM(r, 1, dOut)[0], a: randM(r, rank, dIn), bb: randM(r, dOut, rank) };
    };
    const zeros = (n: number, c: number) => Array.from({ length: n }, () => new Array(c).fill(0));
    const affine = (x: number[][], w: number[][], b: number[]) => mt(x, w).map((row) => row.map((v, o) => v + b[o]));

    check('forward pass of the small layer', 'The output is x·Wᵀ + b plus alpha / r times x·Aᵀ·Bᵀ. Here r = 2 and alpha = 4, so the adapter path is scaled by 2.', () => {
      close(
        sub.loraForward(X, W, BIAS, A, B, 4),
        [
          [3.6, -1.2],
          [2.6, -2.2],
        ],
        'the layer output',
        1e-9,
      );
    });
    check('merged weight of the small layer', 'The merged weight is W + (alpha / r)·B·A. It has the shape of W.', () => {
      close(
        sub.mergeLora(W, A, B, 4),
        [
          [2.5, 0.5, 3],
          [-1, 0, -2],
        ],
        'the merged weight',
        1e-9,
      );
    });
    check('trainable parameter counts', 'A has r × in values and B has out × r values. Only A and B train.', () => {
      equal(sub.countTrainable(4096, 4096, 8), 65536, 'countTrainable(4096, 4096, 8)');
      equal(sub.countTrainable(768, 3072, 16), 61440, 'countTrainable(768, 3072, 16)');
      equal(sub.countTrainable(3, 2, 2), 10, 'countTrainable(3, 2, 2)');
    });
    check('the merged layer gives the same output as the adapter', 'x·W\'ᵀ + b with the merged weight must equal the forward pass with the separate adapter.', () => {
      const { x, w, b, a, bb } = layer(0, 5, 7, 4, 3);
      const merged = sub.mergeLora(w, a, bb, 6);
      equal([merged.length, merged[0]?.length], [4, 7], '[rows, columns] of the merged weight');
      close(affine(x, merged, b), sub.loraForward(x, w, b, a, bb, 6), 'the output of the merged layer', 1e-9);
    });
    check('B = 0 gives the base output', 'LoRA starts B at zero, so the layer starts with the behaviour of the base model.', () => {
      const { x, w, b, a } = layer(1, 4, 6, 5, 2);
      close(sub.loraForward(x, w, b, a, zeros(5, 2), 16), affine(x, w, b), 'the output with B = 0', 1e-12);
      close(sub.mergeLora(w, a, zeros(5, 2), 16), w, 'the merged weight with B = 0', 0);
    });
    check('the adapter path is linear in alpha', 'Double alpha and the change from the base output doubles.', () => {
      const { x, w, b, a, bb } = layer(2, 3, 5, 4, 4);
      const base = affine(x, w, b);
      const diff = (y: number[][]) => y.map((row, i) => row.map((v, j) => v - base[i][j]));
      const one = diff(sub.loraForward(x, w, b, a, bb, 8));
      close(diff(sub.loraForward(x, w, b, a, bb, 16)), one.map((row) => row.map((v) => 2 * v)), 'the adapter change at double alpha', 1e-9);
    });
    check('rank 1 adapter, and a rank larger than the layer', 'The rank is the number of rows of A, not anything read from W. Here r = 4 for a layer with 2 outputs and 3 inputs.', () => {
      close(sub.loraForward([[1, 1, 1, 1]], zeros(3, 4), [0, 0, 0], [[1, 1, 1, 1]], [[1], [2], [3]], 0.5), [[2, 4, 6]], 'the rank 1 output', 1e-12);
      const { x, w, b, a, bb } = layer(5, 2, 3, 2, 4);
      const want = affine(x, w, b).map((row, i) => row.map((v, j) => v + 0.5 * mt(mt(x, a), bb)[i][j]));
      close(sub.loraForward(x, w, b, a, bb, 2), want, 'the rank 4 output with alpha 2', 1e-9);
    });
    check('the inputs are not changed', 'mergeLora returns a new matrix. It must not write into the frozen weight W.', () => {
      const { x, w, b, a, bb } = layer(4, 2, 4, 3, 2);
      const before = JSON.stringify([x, w, b, a, bb]);
      sub.loraForward(x, w, b, a, bb, 4);
      sub.mergeLora(w, a, bb, 4);
      equal(JSON.stringify([x, w, b, a, bb]), before, 'x, W, b, A and B after the calls');
    });
    check('matches the reference on 3 random layers', 'Your output and merged weight agree with the reference solution for several sizes, ranks and alphas.', () => {
      const cases: [number[][], number[][], number[], number[][], number[][], number, number[][], number[][]][] = [[[[0.305, -1.04, 0.75, 0.941]], [[-1.951, -1.302, 0.128, -0.316], [-0.017, -0.853, 0.879, 0.778], [0.066, 1.127, 0.468, -0.859]], [0.369, -0.959, 0.878], [[-0.05, -0.185, -0.681, 1.223]], [[-0.155], [-0.428], [-0.352]], 1, [[0.799996335, 0.964502996, -1.018938536]], [[-1.94325, -1.273325, 0.233555, -0.505565], [0.0044, -0.77382, 1.170468, 0.254556], [0.0836, 1.19212, 0.707712, -1.289496]]], [[[0.532, 0.365, 0.413, 0.431, 2.142, -0.406], [-0.512, -0.814, 0.616, 1.129, -0.114, -0.84], [-0.824, 0.651, 0.743, 0.543, -0.666, 0.232]], [[0.117, 0.219, 0.871, 0.224, 0.679, 0.068], [0.289, 0.631, -1.457, -0.32, -0.47, -0.639], [-0.275, 1.495, -0.866, 0.968, -1.683, -0.335], [0.163, 0.586, 0.711, 0.793, -0.349, -0.462], [0.858, -0.191, -1.276, -1.133, -0.919, 0.497]], [0.142, 0.69, -0.427, 0.159, 0.626], [[-0.309, 0.457, -0.662, -0.363, -0.382, -1.196], [0.487, -0.469, 0.012, 0.481, 0.447, 0.665]], [[-0.098, -0.423], [-0.08, -1.687], [-1.447, -1.323], [-0.997, 0.4], [-0.905, -0.378]], 16, [[-0.57902536, -13.255758, -5.09130524, 9.75816336, 0.3436928], [0.297517144, -1.64011684, -1.440545824, 1.460425696, -2.37886328], [2.608362128, 7.70018496, 9.687309432, 0.909978112, 1.8702092]], [[-1.288752, 1.447808, 1.3494, -1.119112, -0.53416, -1.244696], [-6.085792, 6.668144, -1.195272, -6.579256, -6.258232, -8.8484], [-1.852424, 1.168664, 6.670304, 0.079184, -1.992016, 6.471536], [4.185984, -4.559832, 6.029512, 5.227488, 4.128232, 11.205296], [1.622472, -2.081424, 3.480592, 0.040576, 0.494952, 7.14508]]], [[[1.299, -0.356, 0.738, -0.934, -0.205], [-0.95, -0.339, 0.84, -1.727, 0.434]], [[0.238, -0.594, -1.446, 0.072, -0.529], [0.233, 0.022, 1.602, -0.239, -1.023], [0.179, 0.22, 1.359, 0.835, 0.357], [1.463, -1.189, -0.64, -0.927, -0.39]], [-1.377, 0.635, -0.222, -1.471], [[-1.016, 0.314, 0.838, 1.997, 2.914], [0.414, -0.99, -2.132, 0.268, -0.813], [-0.415, -0.612, -0.141, 1.066, 0.157]], [[-0.159, -1.036, -1.675], [-0.486, -0.054, 1.768], [0.13, 0.983, -0.499], [-1.185, -0.965, -0.725]], 32, [[38.10936204, -7.43559109333, -4.76639953067, 61.8615314], [50.565669856, -17.8425501947, -22.5455457467, 43.68829464]], [[4.80082666667, 20.748016, 23.2119733333, -25.3223573333, 0.707981333333], [-2.56486666667, -12.57704, -4.173232, 9.35752266667, -12.7000773333], [5.31998133333, -6.46759466667, -19.083208, 0.74028, -4.962488], [13.2531333333, 9.76524, 11.8034666667, -37.1714266667, -30.0686133333]]]];
      for (const [x, w, b, a, bb, alpha, y, merged] of cases) {
        const label = `W of ${w.length} × ${w[0].length}, rank ${a.length}`;
        close(sub.loraForward(x, w, b, a, bb, alpha), y, `the output for ${label}`, 1e-9);
        close(sub.mergeLora(w, a, bb, alpha), merged, `the merged weight for ${label}`, 1e-9);
      }
    });
  },
};

export default drill;
