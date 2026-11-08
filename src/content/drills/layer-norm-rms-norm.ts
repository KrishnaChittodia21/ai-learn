import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'layer-norm-rms-norm',
  entry: ['layerNorm', 'rmsNorm'],
  problem: String.raw`A transformer normalizes the vector of each token before attention and before the feed-forward block. LayerNorm centres each vector and divides it by its standard deviation. RMSNorm skips the centring and divides by the root mean square. Llama, Mistral and Qwen use RMSNorm because it is cheaper and works as well.

## Task

Write two functions.

1. \`layerNorm(x, gamma, beta, eps = 1e-5)\` returns LayerNorm of each row of \`x\`.
2. \`rmsNorm(x, weight, eps = 1e-6)\` returns RMSNorm of each row of \`x\`.

For each row x of length D:

- μ = (1/D) Σ_j x_j and σ² = (1/D) Σ_j (x_j - μ)²
- LayerNorm(x)_j = γ_j · (x_j - μ) / √(σ² + ε) + β_j
- RMSNorm(x)_j = w_j · x_j / √((1/D) Σ_k x_k² + ε)

The variance is the biased variance: it divides by D, not by D - 1. The ε goes inside the square root in both functions.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`x\` | \`number[][]\` | N rows of length D, one vector per token |
| \`gamma\`, \`beta\` | \`number[]\` | the LayerNorm scale and shift of each feature, length D |
| \`weight\` | \`number[]\` | the RMSNorm scale of each feature, length D |
| \`eps\` | \`number\` | the small number added inside the square root |

Both functions return a new N × D \`number[][]\`.

## Constraints

- 1 ≤ D ≤ 1024. A row can be constant or all zeros; the output must not contain NaN.
- Do not change the input arrays.

## Examples

\`\`\`ts
const x = [[1, 2, 3, 4], [2, -2, 0, 4]];
const gamma = [1, 1, 2, 0.5];
const beta = [0, 0.5, 0, -1];
layerNorm(x, gamma, beta);
// [[-1.34163542, 0.05278819, 0.89442361, -0.32918229],
//  [0.44721315, -0.84163944, -0.8944263, -0.32918028]]

rmsNorm(x, gamma);
// [[0.36514835, 0.73029669, 2.19089008, 0.73029669],
//  [0.81649651, -0.81649651, 0, 0.81649651]]
\`\`\``,
  starter: `function layerNorm(x: number[][], gamma: number[], beta: number[], eps = 1e-5): number[][] {
  throw new Error('not implemented');
}

function rmsNorm(x: number[][], weight: number[], eps = 1e-6): number[][] {
  throw new Error('not implemented');
}
`,
  solution: `const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

function layerNorm(x: number[][], gamma: number[], beta: number[], eps = 1e-5): number[][] {
  return x.map((row) => {
    const mu = mean(row);
    const variance = mean(row.map((v) => (v - mu) ** 2));
    const denom = Math.sqrt(variance + eps);
    return row.map((v, j) => ((v - mu) / denom) * gamma[j] + beta[j]);
  });
}

function rmsNorm(x: number[][], weight: number[], eps = 1e-6): number[][] {
  return x.map((row) => {
    const rms = Math.sqrt(mean(row.map((v) => v * v)) + eps);
    return row.map((v, j) => (v / rms) * weight[j]);
  });
}
`,
  hints: [
    'Work one row at a time: every statistic (mean, variance, mean square) is taken over the row, never across rows.',
    'gamma, beta and weight have one entry per feature: entry j scales (and shifts) column j of every row.',
    'For LayerNorm, compute the mean, then the mean of the squared differences from it (divide by D). Divide by Math.sqrt(variance + eps).',
    'RMSNorm has no mean subtraction. The denominator is the square root of the mean of v * v plus eps, so a row of zeros gives 0 / √ε = 0.',
  ],
  notes: String.raw`## What each norm removes

LayerNorm removes the mean and the scale of each vector. RMSNorm removes only the scale. The residual stream of a transformer has a mean close to 0 in practice, so centring adds little; RMSNorm saves one reduction and one subtraction per entry.

## Why eps goes inside the square root

√(σ² + ε) is at least √ε, so a constant vector does not divide by 0: LayerNorm of a constant vector gives β, and RMSNorm of a zero vector gives 0. With ε outside the root, small but non-zero rows get a very different scale.

## The difference from BatchNorm

BatchNorm normalizes each feature across the batch. LayerNorm and RMSNorm normalize each token across its features, so they need no running statistics, act the same in training and inference, and work for a batch of one token, which is what generation is.

## Where this goes next

Modern blocks are pre-norm: x + attention(norm(x)) and x + ffn(norm(x)). Llama, Mistral and Qwen use RMSNorm with ε from 1e-6 to 1e-5, and the learned weight is one of the few things a LoRA on "all linear layers" does not touch.`,
  tests: (sub, { check, close, equal, rng }) => {
    const X = [
      [1, 2, 3, 4],
      [2, -2, 0, 4],
    ];
    const GAMMA = [1, 1, 2, 0.5];
    const BETA = [0, 0.5, 0, -1];
    const randM = (r: () => number, n: number, c: number, s = 2, shift = 0) => Array.from({ length: n }, () => Array.from({ length: c }, () => (r() * 2 - 1) * s + shift));
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const vari = (v: number[]) => mean(v.map((x) => (x - mean(v)) ** 2));
    const ones = (n: number) => new Array(n).fill(1);
    const zeros = (n: number) => new Array(n).fill(0);

    check('LayerNorm of a 2 × 4 batch', 'Each row is centred by its own mean and divided by √(variance + eps). Then feature j is scaled by gamma[j] and shifted by beta[j].', () => {
      close(
        sub.layerNorm(X, GAMMA, BETA),
        [
          [-1.34163542, 0.05278819, 0.89442361, -0.32918229],
          [0.44721315, -0.84163944, -0.8944263, -0.32918028],
        ],
        'the LayerNorm output',
        1e-6,
      );
    });
    check('RMSNorm of the same batch', 'Each row is divided by √(mean(x²) + eps), with no mean subtraction. Then feature j is scaled by weight[j].', () => {
      close(
        sub.rmsNorm(X, GAMMA),
        [
          [0.36514835, 0.73029669, 2.19089008, 0.73029669],
          [0.81649651, -0.81649651, 0, 0.81649651],
        ],
        'the RMSNorm output',
        1e-6,
      );
    });
    check('LayerNorm rows have mean 0 and variance close to 1', 'With gamma = 1 and beta = 0, each output row has mean 0 and variance var / (var + eps), where var is the biased variance (divide by D).', () => {
      const x = randM(rng(1), 7, 12, 3, 2);
      const out: number[][] = sub.layerNorm(x, ones(12), zeros(12));
      equal([out.length, out[0]?.length], [7, 12], '[rows, columns] of the output');
      close(out.map(mean), zeros(7), 'the row means', 1e-12);
      close(
        out.map(vari),
        x.map((r) => vari(r) / (vari(r) + 1e-5)),
        'the row variances',
        1e-9,
      );
    });
    check('RMSNorm rows have a mean square close to 1', 'With weight = 1, each output row has mean(out²) = ms / (ms + eps), where ms is mean(x²) of the input row.', () => {
      const x = randM(rng(2), 6, 10, 1, 1.5);
      const out: number[][] = sub.rmsNorm(x, ones(10));
      const ms = (v: number[]) => mean(v.map((a) => a * a));
      close(
        out.map(ms),
        x.map((r) => ms(r) / (ms(r) + 1e-6)),
        'the mean square of each output row',
        1e-9,
      );
    });
    check('each row is normalized on its own', 'The statistics are per row. Changing the other rows must not change the output of row 0.', () => {
      const r = rng(3);
      const x = randM(r, 5, 6);
      const [gamma, beta] = randM(r, 2, 6);
      const y = [x[0], ...randM(r, 4, 6, 20)];
      close(sub.layerNorm(y, gamma, beta)[0], sub.layerNorm(x, gamma, beta)[0], 'LayerNorm of row 0', 1e-12);
      close(sub.rmsNorm(y, gamma)[0], sub.rmsNorm(x, gamma)[0], 'RMSNorm of row 0', 1e-12);
    });
    check('LayerNorm ignores a shift and RMSNorm ignores a scale', 'LayerNorm subtracts the mean, so adding 5 to a row does nothing. RMSNorm divides by the size of the row, so multiplying by 10 nearly does nothing.', () => {
      const r = rng(4);
      const x = randM(r, 4, 8);
      const [gamma, beta] = randM(r, 2, 8);
      close(sub.layerNorm(x.map((row) => row.map((v) => v + 5)), gamma, beta), sub.layerNorm(x, gamma, beta), 'LayerNorm of x + 5', 1e-9);
      close(sub.rmsNorm(x.map((row) => row.map((v) => v * 10)), gamma), sub.rmsNorm(x, gamma), 'RMSNorm of 10x', 1e-5);
    });
    check('a constant row and a zero row', 'LayerNorm of a constant row gives beta. RMSNorm of a zero row gives zeros. Neither may give NaN.', () => {
      close(sub.layerNorm([[5, 5, 5]], [2, 3, 4], [0.1, 0.2, 0.3]), [[0.1, 0.2, 0.3]], 'LayerNorm of a constant row', 1e-12);
      close(sub.rmsNorm([[0, 0, 0]], [2, 3, 4]), [[0, 0, 0]], 'RMSNorm of a zero row', 0);
    });
    check('small values: eps goes inside the square root', 'The denominators are √(var + eps) and √(mean(x²) + eps). With values near √eps, √var + eps gives a very different result.', () => {
      const x = [[0.001, -0.002, 0.003, 0]];
      const mu = mean(x[0]);
      close(sub.layerNorm(x, ones(4), zeros(4)), [x[0].map((v) => (v - mu) / Math.sqrt(vari(x[0]) + 1e-5))], 'LayerNorm of small values', 1e-9);
      const ms = mean(x[0].map((v) => v * v));
      close(sub.rmsNorm(x, ones(4)), [x[0].map((v) => v / Math.sqrt(ms + 1e-6))], 'RMSNorm of small values', 1e-9);
    });
    check('a custom eps', 'The eps argument changes the denominator. Use the eps the caller passes.', () => {
      close(sub.layerNorm([[0, 1]], [1, 1], [0, 0], 0.75), [[-0.5, 0.5]], 'LayerNorm with eps = 0.75', 1e-12);
      close(sub.rmsNorm([[0, 1]], [1, 1], 1.5), [[0, 0.70710678]], 'RMSNorm with eps = 1.5', 1e-6);
    });
    check('the inputs are not changed', 'A function that writes into its input breaks the code that calls it.', () => {
      const x = X.map((r) => r.slice());
      const before = JSON.stringify([x, GAMMA, BETA]);
      sub.layerNorm(x, GAMMA, BETA);
      sub.rmsNorm(x, GAMMA);
      equal(JSON.stringify([x, GAMMA, BETA]), before, 'x, gamma and beta after the calls');
    });
    check('matches the reference on 4 random batches', 'Your LayerNorm and RMSNorm agree with the reference solution for several shapes and scales.', () => {
      const cases: [number[][], number[], number[], number[][], number[][]][] = [[[[1.2453, -0.0994, 1.691]], [-1.951, -1.302, 0.128], [-0.316, -0.017, -0.853], [[-1.08423554293, 1.77088597407, -0.727634329912]], [[-2.00158504142, 0.106620363262, 0.178318485315]]], [[[3.7315, 3.2234, -0.3354, 4.9707, 1.672, -4.962, 1.1782, -5.4599], [3.7267, -0.9151, -1.5898, -4.0702, 5.4472, -1.4382, -2.8071, -2.4262], [1.996, 1.1617, 1.3982, 1.4886, 10.0427, -2.6976, -3.2267, -4.7344], [2.4144, 4.9794, -1.2352, -4.8663, -4.7879, 2.5875, 3.0508, 2.0503]], [0.232, 0.117, 0.219, 0.871, 0.224, 0.679, 0.068, 0.289], [0.631, -1.457, -0.32, -0.47, -0.639, -0.275, 1.495, -0.866], [[0.837073932429, -1.36942700959, -0.370463912865, 0.600559462072, -0.566929144347, -1.29558014188, 1.50764227224, -1.33996590824], [0.947234502614, -1.47228665164, -0.39616253522, -1.4681388304, -0.20965068636, -0.478013622026, 1.44471384823, -1.04429228216], [0.702355854273, -1.44380321281, -0.283206635338, -0.305284342781, -0.149303044185, -0.81018597002, 1.43300298959, -1.23121151728], [0.757096564228, -1.30711759416, -0.430784873692, -1.81999276449, -0.981135710862, 0.127845221589, 1.54440245986, -0.739178625464]], [[0.235888558593, 0.102762700625, -0.0200144020142, 1.1796988429, 0.102051580986, -0.918040794163, 0.0218304846229, -0.429950023526], [0.274567187479, -0.0340009172991, -0.110566312145, -1.12582301274, 0.387487374351, -0.3101167868, -0.0606181968495, -0.22266946104], [0.106777065097, 0.0313407444917, 0.0706062051685, 0.298968634164, 0.518713994995, -0.422354168548, -0.0505937603754, -0.315494831024], [0.159261581386, 0.165644375213, -0.0769121964812, -1.20512154404, -0.3049347409, 0.499532730175, 0.0589843050344, 0.168472519536]]], [[[0.6427, -0.6829, -0.0089, 0.2399, 0.4517, 0.5142], [0.5552, -0.0158, -0.0726, 0.5875, 0.0629, -0.4793], [-0.4081, -0.3012, 0.4071, 0.2298, 0.5038, -0.0551]], [0.626, -0.309, 0.457, -0.662, -0.363, -0.382], [-1.196, 0.487, -0.469, 0.012, 0.481, 0.447], [[-0.56158641662, 1.09649706945, -0.676611912455, -0.0582584567218, 0.269294232013, 0.170434620481], [-0.438127474205, 0.588770467629, -0.689523739298, -0.847126104564, 0.523506118809, 1.05034419791], [-2.0533205737, 0.814097714593, -0.0112003989885, -0.30974233165, 0.0152591221362, 0.577914327355]], [[0.831275100871, 0.435991207751, -0.00840365753744, -0.328133353188, -0.338780851132, -0.405842546554], [0.901088454631, 0.0126578283196, -0.0860194091915, -1.00834580296, -0.0591971645312, 0.474694747736], [-0.731079715936, 0.266340526174, 0.532403753808, -0.43534325513, -0.523345620994, 0.0602335927382]]], [[[13.5277, -1.7497, -8.246, -1.3744, -33.5267, -28.7223, -26.234, -19.7249, 8.2155, -17.8896, -7.3433, 26.2046, -6.9053, 14.9703, -18.4524, -3.8888], [-18.7804, -6.5607, 17.0262, -34.3264, 8.9085, 4.9747, -11.663, -28.7012, 1.6626, -10.3699, 4.8735, 0.657, 32.2556, -4.5671, -20.25, 3.8055]], [1.359, 0.835, 0.357, 1.463, -1.189, -0.64, -0.927, -0.39, -1.377, 0.635, -0.222, -1.471, -1.016, 0.314, 0.838, 1.997], [2.914, 0.414, -0.99, -2.132, 0.268, -0.813, -0.415, -0.612, -0.141, 1.066, 0.157, -0.159, -1.036, -1.675, -0.486, -0.054], [[4.61804089124, 0.679740516364, -1.01841858864, -1.63277057236, 2.2035515555, 0.0405319777161, 0.680020204698, -0.306781457437, -1.41962108991, 0.640415702133, 0.162398907306, -3.14552815292, -1.03854532487, -1.25353567759, -1.07652127187, 0.319930645309], [1.67565396654, 0.274442918731, -0.536922784457, -4.85003251638, -0.653260139097, -1.15558021212, 0.0279432824529, -0.0210260414978, -0.600367953055, 0.812581169099, 0.0395355173017, -0.559652382085, -3.26761903369, -1.68936221927, -1.3245914063, 0.872780597971]], [[1.03605590696, -0.0823360139772, -0.165901883839, -0.113317567572, 2.24653109363, 1.03595039172, 1.37051571363, 0.433530032295, -0.637540400894, -0.640197724801, 0.0918721788881, -2.17235090139, 0.395381213583, 0.264910957624, -0.871438313219, -0.43765656144], [-1.51379588958, -0.324922421919, 0.360519677277, -2.97862350305, -0.628245614846, -0.188838219356, 0.641258355161, 0.663907674564, -0.135789047946, -0.390563200206, -0.0641707288163, -0.0573219649495, -1.94375650459, -0.0850576140047, -1.00649604604, 0.450746972175]]]];
      for (const [x, gamma, beta, ln, rms] of cases) {
        const size = `${x.length} × ${x[0].length}`;
        close(sub.layerNorm(x, gamma, beta), ln, `LayerNorm for ${size}`, 1e-9);
        close(sub.rmsNorm(x, gamma), rms, `RMSNorm for ${size}`, 1e-9);
      }
    });
  },
};

export default drill;
