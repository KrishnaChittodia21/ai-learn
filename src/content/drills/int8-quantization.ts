import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'int8-quantization',
  entry: ['quantizeSymmetric', 'dequantizeSymmetric', 'quantizePerChannel', 'dequantizePerChannel'],
  problem: String.raw`Quantization stores weights as small integers plus one float scale per group of values. Symmetric int8 quantization maps the value with the largest magnitude to 127 and maps 0 to 0. A per-tensor scale uses one number for the whole matrix. A per-row (per-channel) scale uses one number per row, so a row with an outlier does not cost the other rows their precision.

## Task

Write four functions.

1. \`quantizeSymmetric(tensor)\` returns \`{ q, scale }\` with one scale for the whole matrix.
2. \`dequantizeSymmetric(q, scale)\` returns the float matrix.
3. \`quantizePerChannel(tensor)\` returns \`{ q, scales }\` with one scale per row.
4. \`dequantizePerChannel(q, scales)\` returns the float matrix.

For a group of values x (the whole matrix, or one row):

scale = max|x| / 127,  q = clip(round(x / scale), -127, 127)

**Round half to even**: a value exactly halfway between two integers goes to the even one, so 2.5 becomes 2, -3.5 becomes -4 and 1.5 becomes 2. This is what numpy and PyTorch do. \`Math.round\` does not: it rounds halves up (2.5 → 3).

The dequantized value is q × scale. When max|x| = 0, the scale of that group is 1, so all its q values are 0.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`tensor\` | \`number[][]\` | R × C values to quantize |
| \`q\` | \`number[][]\` | R × C integers in [-127, 127] |
| \`scale\` | \`number\` | the per-tensor scale |
| \`scales\` | \`number[]\` | the scale of each row, length R |

Both dequantize functions return a new R × C \`number[][]\`.

## Constraints

- 1 ≤ R, C ≤ 256. All values are finite.
- Do not change the input arrays.

## Examples

\`\`\`ts
const t = [[0.5, -1, 0.25], [2, 0.1, -0.04]];
quantizeSymmetric(t);
// { q: [[32, -64, 16], [127, 6, -3]], scale: 0.015748031496062992 }
dequantizeSymmetric([[32, -64, 16], [127, 6, -3]], 2 / 127);
// [[0.50393701, -1.00787402, 0.2519685], [2, 0.09448819, -0.04724409]]

quantizePerChannel(t);
// { q: [[64, -127, 32], [127, 6, -3]], scales: [0.00787402, 0.01574803] }

quantizePerChannel([[0, 0], [1, -3]]);
// { q: [[0, 0], [42, -127]], scales: [1, 0.02362205] }
\`\`\``,
  starter: `function quantizeSymmetric(tensor: number[][]): { q: number[][]; scale: number } {
  throw new Error('not implemented');
}

function dequantizeSymmetric(q: number[][], scale: number): number[][] {
  throw new Error('not implemented');
}

function quantizePerChannel(tensor: number[][]): { q: number[][]; scales: number[] } {
  throw new Error('not implemented');
}

function dequantizePerChannel(q: number[][], scales: number[]): number[][] {
  throw new Error('not implemented');
}
`,
  solution: `const QMAX = 127;

/** round half to even, like numpy's np.round */
function roundEven(v: number): number {
  const r = Math.round(v);
  return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const quantizeRow = (row: number[], scale: number) => row.map((x) => Math.min(QMAX, Math.max(-QMAX, roundEven(x / scale))));
const scaleOf = (values: number[]) => {
  const absMax = Math.max(...values.map(Math.abs));
  return absMax > 0 ? absMax / QMAX : 1;
};

function quantizeSymmetric(tensor: number[][]): { q: number[][]; scale: number } {
  const scale = scaleOf(tensor.flat());
  return { q: tensor.map((row) => quantizeRow(row, scale)), scale };
}

function dequantizeSymmetric(q: number[][], scale: number): number[][] {
  return q.map((row) => row.map((v) => v * scale));
}

function quantizePerChannel(tensor: number[][]): { q: number[][]; scales: number[] } {
  const scales = tensor.map(scaleOf);
  return { q: tensor.map((row, i) => quantizeRow(row, scales[i])), scales };
}

function dequantizePerChannel(q: number[][], scales: number[]): number[][] {
  return q.map((row, i) => row.map((v) => v * scales[i]));
}
`,
  hints: [
    'The scale uses the magnitude: the maximum of Math.abs over the values, not the maximum value. A large negative value must still fit.',
    'Divide by the scale, round, then clip to [-127, 127]. Truncating (Math.trunc or |0) instead of rounding cuts off the fraction.',
    'Round half to even: Math.round(v) is right except when v is exactly halfway (Math.abs(v % 1) === 0.5) and Math.round gave an odd number; then step down by 1.',
    'Per-row quantization is per-tensor quantization applied to each row on its own. Give a row whose maximum is 0 the scale 1, so there is no 0 / 0.',
  ],
  notes: String.raw`## Why the error bound holds

After the division each value is in [-127, 127]. Rounding moves it by at most 0.5 and the clip does not change it, so after multiplying by the scale each entry is off by at most scale / 2. A smaller scale gives a smaller error, which is why per-row scales are more accurate: each row gets a scale that fits its own range.

## Why 127 and not 128

int8 holds -128 to 127. The symmetric form uses [-127, 127] so 0 sits in the centre and x and -x map to q and -q. The value -128 is unused.

## The outlier problem

One large value makes the per-tensor scale large, and then all the small values round to a few integers or to 0. LLM weights and especially activations have such outliers. Per-row scales, group scales (GPTQ and AWQ use groups of 128) and outlier handling (LLM.int8()) all attack this loss.

## Where this goes next

GGUF's Q4_K and Q8_0 formats, GPTQ and AWQ all store integers plus a scale per group in this form, and inference kernels multiply by the scale inside the matrix product. Asymmetric quantization adds a zero point so a range like [0, 6] is not wasted on negative values.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const T = [
      [0.5, -1, 0.25],
      [2, 0.1, -0.04],
    ];
    const randM = (r: () => number, n: number, c: number, spread = 3) => Array.from({ length: n }, () => Array.from({ length: c }, () => (r() * 2 - 1) * spread));
    const ints = (q: number[][], what: string) => ok(q.flat().every((v) => Number.isInteger(v) && v >= -127 && v <= 127), `${what} has a value that is not an integer in [-127, 127]`);

    check('per-tensor quantization of a 2 × 3 matrix', 'The scale is max|x| / 127 over the whole matrix. Each value is round(x / scale), clipped to [-127, 127].', () => {
      const { q, scale } = sub.quantizeSymmetric(T);
      ints(q, 'q');
      equal(
        q,
        [
          [32, -64, 16],
          [127, 6, -3],
        ],
        'q',
      );
      close(scale, 0.015748031496062992, 'the scale', 1e-12);
      close(
        sub.dequantizeSymmetric(q, scale),
        [
          [0.50393701, -1.00787402, 0.2519685],
          [2, 0.09448819, -0.04724409],
        ],
        'the dequantized matrix',
        1e-6,
      );
    });
    check('per-row quantization of the same matrix', 'Each row gets its own scale, max|row| / 127. The row with the smaller values keeps more precision.', () => {
      const { q, scales } = sub.quantizePerChannel(T);
      ints(q, 'q');
      equal(
        q,
        [
          [64, -127, 32],
          [127, 6, -3],
        ],
        'q',
      );
      close(scales, [0.00787402, 0.01574803], 'the scales', 1e-6);
      close(
        sub.dequantizePerChannel(q, scales),
        [
          [0.50393701, -1, 0.2519685],
          [2, 0.09448819, -0.04724409],
        ],
        'the dequantized matrix',
        1e-6,
      );
    });
    check('a row of zeros gets scale 1', 'When max|row| is 0, use the scale 1. The quantized row is all 0 and there is no 0 / 0.', () => {
      const { q, scales } = sub.quantizePerChannel([
        [0, 0],
        [1, -3],
      ]);
      equal(
        q,
        [
          [0, 0],
          [42, -127],
        ],
        'q',
      );
      close(scales, [1, 0.02362205], 'the scales', 1e-6);
      const z = sub.quantizeSymmetric([
        [0, 0, 0],
        [0, 0, 0],
      ]);
      equal([z.q, z.scale], [[[0, 0, 0], [0, 0, 0]], 1], '[q, scale] of an all-zero matrix');
    });
    check('the error is at most half a step', 'Rounding moves each value by at most 0.5, so after dequantization each entry is off by at most scale / 2.', () => {
      const x = randM(rng(1), 6, 9);
      const a = sub.quantizeSymmetric(x);
      const da = sub.dequantizeSymmetric(a.q, a.scale);
      ok(x.every((row, i) => row.every((v, j) => Math.abs(da[i][j] - v) <= a.scale / 2 + 1e-12)), 'an entry is off by more than scale / 2 with the per-tensor scale');
      const b = sub.quantizePerChannel(x);
      const db = sub.dequantizePerChannel(b.q, b.scales);
      ok(x.every((row, i) => row.every((v, j) => Math.abs(db[i][j] - v) <= b.scales[i] / 2 + 1e-12)), 'an entry is off by more than half the scale of its row');
    });
    check('the largest magnitude maps to ±127', 'The value with the largest magnitude maps to 127 or -127, so the scale uses the whole int8 range.', () => {
      const x = randM(rng(2), 5, 7);
      const a = sub.quantizeSymmetric(x);
      equal(Math.max(...a.q.flat().map(Math.abs)), 127, 'the largest |q| of the per-tensor result');
      const b = sub.quantizePerChannel(x);
      equal(b.scales.length, 5, 'the number of scales');
      equal(
        b.q.map((row: number[]) => Math.max(...row.map(Math.abs))),
        [127, 127, 127, 127, 127],
        'the largest |q| in each row',
      );
    });
    check('scaling the input by 8 scales only the scale', 'x / scale does not change when x and the scale grow by the same factor, so q stays the same.', () => {
      const x = randM(rng(3), 4, 6);
      const a = sub.quantizePerChannel(x);
      const b = sub.quantizePerChannel(x.map((row) => row.map((v) => v * 8)));
      equal(b.q, a.q, 'q of 8x');
      close(b.scales, a.scales.map((s: number) => s * 8), 'the scales of 8x', 1e-12);
    });
    check('ties round half to even', 'Round 2.5 to 2, -0.5 to 0, 1.5 to 2 and -3.5 to -4. Math.round alone rounds every half up.', () => {
      const { q, scale } = sub.quantizeSymmetric([[127, 2.5, -0.5, 1.5, -3.5]]);
      close(scale, 1, 'the scale', 1e-12);
      equal(q, [[127, 2, 0, 2, -4]], 'q');
    });
    check('a negative value with the largest magnitude', 'The scale uses the absolute value. When the most negative value has the largest magnitude, it maps to -127.', () => {
      const x = [
        [-4, 1, 2],
        [0.5, -0.25, 0.125],
      ];
      const a = sub.quantizeSymmetric(x);
      close(a.scale, 4 / 127, 'the scale', 1e-12);
      equal(a.q[0][0], -127, 'q of -4');
      close(sub.quantizePerChannel(x).scales, [4 / 127, 0.5 / 127], 'the per-row scales', 1e-12);
    });
    check('the inputs are not changed', 'A function that writes into its input breaks the code that calls it.', () => {
      const x = T.map((r) => r.slice());
      const a = sub.quantizeSymmetric(x);
      const b = sub.quantizePerChannel(x);
      const before = JSON.stringify([x, a.q, b.q, b.scales]);
      sub.dequantizeSymmetric(a.q, a.scale);
      sub.dequantizePerChannel(b.q, b.scales);
      equal(JSON.stringify(x), JSON.stringify(T), 'the tensor after the calls');
      equal(JSON.stringify([x, a.q, b.q, b.scales]), before, 'q and the scales after dequantization');
    });
    check('matches the reference on 3 random matrices', 'Your q values and scales agree with the reference solution for several shapes and value ranges.', () => {
      const cases: [number[][], number[][], number, number[][], number[]][] = [[[[0.1148, -0.3918, 0.2827, 0.3543]], [[37, -127, 92, 115]], 0.00308503937008, [[37, -127, 92, 115]], [0.00308503937008]], [[[-0.3949, 0.0388, -0.0959, -0.0051, -0.2587], [0.1247, 0.1103, 0.0094, 0.1599, 0.0663], [-0.3336, 0.1432, -0.3723, 0.3411, -0.0194]], [[-127, 12, -31, -2, -83], [40, 35, 3, 51, 21], [-107, 46, -120, 110, -6]], 0.0031094488189, [[-127, 12, -31, -2, -83], [99, 88, 7, 127, 53], [-114, 49, -127, 116, -7]], [0.0031094488189, 0.00125905511811, 0.00293149606299]], [[[-0.8638, -2.3944, -1.9685, 2.9757, 2.0429, 2.3072], [3.445, 17.1253, -3.2498, -4.0961, -6.5072, 4.9256], [0.3325, -0.0336, -0.2474, -0.2428, 0.1916, 0.2189], [17.0969, -20.9482, 7.3077, 3.6729, 6.8837, 27.4299]], [[-4, -11, -9, 14, 9, 11], [16, 79, -15, -19, -30, 23], [2, 0, -1, -1, 1, 1], [79, -97, 34, 17, 32, 127]], 0.215983464567, [[-37, -102, -84, 127, 87, 98], [26, 127, -24, -30, -48, 37], [127, -13, -94, -93, 73, 84], [79, -97, 34, 17, 32, 127]], [0.0234307086614, 0.13484488189, 0.00261811023622, 0.215983464567]]];
      for (const [x, q, scale, qc, scales] of cases) {
        const size = `${x.length} × ${x[0].length}`;
        const a = sub.quantizeSymmetric(x);
        equal(a.q, q, `the per-tensor q for ${size}`);
        close(a.scale, scale, `the scale for ${size}`, 1e-10);
        const b = sub.quantizePerChannel(x);
        equal(b.q, qc, `the per-row q for ${size}`);
        close(b.scales, scales, `the per-row scales for ${size}`, 1e-10);
      }
    });
  },
};

export default drill;
