import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'rope',
  entry: ['ropeFrequencies', 'applyRope'],
  problem: String.raw`Rotary position embedding (RoPE) puts the position of a token into its query and key vectors. It turns each pair of coordinates by an angle that grows with the position. Then the attention score of a query and a key depends only on the distance between their positions. Llama, Mistral, Qwen and most other open models use RoPE.

## Task

Write two functions.

1. \`ropeFrequencies(d, base = 10000)\` returns the frequency of each coordinate pair.
2. \`applyRope(x, positions, base = 10000)\` returns a rotated copy of \`x\`.

The frequency of pair i is θ_i = base^(-2i / d), for i = 0, 1, …, floor(d / 2) - 1.

Pair i is the two adjacent coordinates 2i and 2i + 1. For the token at position p, let a = x[2i], b = x[2i + 1] and φ = p · θ_i. The output pair is:

a' = a·cos φ - b·sin φ,  b' = a·sin φ + b·cos φ

When d is odd, the last coordinate has no partner. Copy it to the output unchanged.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`d\` | \`number\` | the length of one vector |
| \`base\` | \`number\` | the base of the frequencies |
| \`x\` | \`number[][]\` | T rows of length d, one vector per token |
| \`positions\` | \`number[]\` | the position of each of the T tokens |

\`ropeFrequencies\` returns \`number[]\` of length floor(d / 2). \`applyRope\` returns a new T × d \`number[][]\`.

## Constraints

- 1 ≤ T ≤ 64 and 2 ≤ d ≤ 128. Positions are from 0 to 1,000,000.
- Use the pairs (0, 1), (2, 3), …. Do not pair coordinate i with coordinate i + d/2.
- Do not change the input arrays.

## Examples

\`\`\`ts
ropeFrequencies(8);
// [1, 0.1, 0.01, 0.001]

applyRope([[1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 1, 0]], [0, 1, 2]);
// [[1, 0, 1, 0],
//  [0.54030231, 0.84147098, 0.99995, 0.00999983],
//  [-0.41614684, 0.90929743, 0.99980001, 0.01999867]]

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
dot(applyRope([[1, 2, 3, 4]], [2])[0], applyRope([[0.5, -1, 2, 1]], [5])[0]);   // 11.9127066
dot(applyRope([[1, 2, 3, 4]], [10])[0], applyRope([[0.5, -1, 2, 1]], [13])[0]); // 11.9127066 (same gap of 3)
\`\`\``,
  starter: `function ropeFrequencies(d: number, base = 10000): number[] {
  throw new Error('not implemented');
}

function applyRope(x: number[][], positions: number[], base = 10000): number[][] {
  throw new Error('not implemented');
}
`,
  solution: `function ropeFrequencies(d: number, base = 10000): number[] {
  return Array.from({ length: Math.floor(d / 2) }, (_, i) => base ** ((-2 * i) / d));
}

function applyRope(x: number[][], positions: number[], base = 10000): number[][] {
  const freqs = ropeFrequencies(x[0].length, base);
  return x.map((row, t) => {
    const out = row.slice();
    freqs.forEach((f, i) => {
      const phi = positions[t] * f;
      const a = row[2 * i];
      const b = row[2 * i + 1];
      out[2 * i] = a * Math.cos(phi) - b * Math.sin(phi);
      out[2 * i + 1] = a * Math.sin(phi) + b * Math.cos(phi);
    });
    return out;
  });
}
`,
  hints: [
    'Start with the frequencies. There are floor(d / 2) pairs, and the exponent is -2i / d, not -i / d.',
    'For each token, the angle of pair i is positions[t] times the frequency of pair i.',
    'Copy each row first (row.slice()), then overwrite coordinates 2i and 2i + 1. With an odd d the copy already holds the last coordinate.',
    'Read a and b from the input row, not from the copy you are writing into, so the second formula still sees the original a.',
  ],
  notes: String.raw`## Why the score depends on the gap only

Each pair is a point in a plane. RoPE turns the query pair by m·θ_i and the key pair by n·θ_i. The dot product of two points in a plane depends on their lengths and on the angle between them, and that angle changes by (m - n)·θ_i. So the score sees only the gap m - n. The model gets relative positions, but each token needs only its own absolute position, which is what makes RoPE work with a KV cache.

## Why the norm stays the same

A rotation keeps the length of every pair. So RoPE does not change the size of the scores, only their direction.

## The pairing convention

This drill pairs adjacent coordinates (2i, 2i + 1). Some libraries (the "rotate_half" style in Hugging Face Llama) pair coordinate i with i + d/2. Both give the relative property, but the weights of a trained model expect one convention. Load weights with the other one and the model gives wrong outputs with no error.

## Where this goes next

A transformer applies RoPE to the queries and keys of each head, just before the attention scores. Long-context methods (NTK scaling, YaRN) change the base or scale the positions, so the slow pairs do not wrap past a full turn at positions the model never saw in training.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    const score = (q: number[], k: number[], m: number, n: number, base = 10000) => dot(sub.applyRope([q], [m], base)[0], sub.applyRope([k], [n], base)[0]);
    const randM = (r: () => number, n: number, c: number) => Array.from({ length: n }, () => Array.from({ length: c }, () => r() * 4 - 2));
    const pairNorms = (m: number[][]) => m.map((row) => Array.from({ length: Math.floor(row.length / 2) }, (_, i) => Math.hypot(row[2 * i], row[2 * i + 1])));

    check('frequencies for d = 8', 'θ_i is base to the power -2i / d, for i from 0 to d / 2 - 1.', () => {
      close(sub.ropeFrequencies(8), [1, 0.1, 0.01, 0.001], 'ropeFrequencies(8)', 1e-12);
    });
    check('rotate [1, 0, 1, 0] at positions 0, 1 and 2', 'Pair (2i, 2i + 1) turns by the angle position × θ_i: a cos φ - b sin φ, then a sin φ + b cos φ.', () => {
      close(
        sub.applyRope(
          [
            [1, 0, 1, 0],
            [1, 0, 1, 0],
            [1, 0, 1, 0],
          ],
          [0, 1, 2],
        ),
        [
          [1, 0, 1, 0],
          [0.54030231, 0.84147098, 0.99995, 0.00999983],
          [-0.41614684, 0.90929743, 0.99980001, 0.01999867],
        ],
        'the rotated vectors',
        1e-6,
      );
    });
    check('the score depends on the gap only', 'q at 2 and k at 5 have a gap of 3; so do q at 10 and k at 13. The two dot products are equal.', () => {
      close(score([1, 2, 3, 4], [0.5, -1, 2, 1], 2, 5), 11.912706599522757, 'the dot product for positions 2 and 5', 1e-9);
      close(score([1, 2, 3, 4], [0.5, -1, 2, 1], 10, 13), 11.912706599522757, 'the dot product for positions 10 and 13', 1e-9);
      const r = rng(1);
      const [q, k] = randM(r, 2, 16);
      for (const [m, n] of [[0, 4], [3, 1], [7, 7]]) for (const off of [5, 100, 1000]) close(score(q, k, m + off, n + off), score(q, k, m, n), `the score at positions ${m + off} and ${n + off}`, 1e-8);
    });
    check('each pair keeps its length', 'A rotation does not change a length: each pair (2i, 2i + 1) has the same norm before and after.', () => {
      const x = randM(rng(0), 7, 12);
      const out = sub.applyRope(x, [0, 3, 6, 9, 12, 15, 18]);
      equal([out.length, out[0]?.length], [7, 12], '[rows, columns] of the output');
      close(pairNorms(out), pairNorms(x), 'the norm of each pair', 1e-10);
    });
    check('position 0 changes nothing and two rotations add', 'At position 0 every angle is 0. A rotation by m and then by n is a rotation by m + n.', () => {
      const x = randM(rng(2), 4, 6);
      close(sub.applyRope(x, [0, 0, 0, 0]), x, 'the output at position 0', 1e-12);
      const m = [1, 2, 5, 9];
      const n = [3, 0, 4, 11];
      close(sub.applyRope(sub.applyRope(x, m), n), sub.applyRope(x, m.map((v, i) => v + n[i])), 'two rotations compared with one by m + n', 1e-10);
    });
    check('the base changes the speed of rotation', 'Use the base argument, not a fixed 10000.', () => {
      close(sub.ropeFrequencies(4, 100), [1, 0.1], 'ropeFrequencies(4, 100)', 1e-12);
      close(sub.applyRope([[0, 0, 1, 0]], [3], 100), [[0, 0, Math.cos(0.3), Math.sin(0.3)]], 'applyRope with base 100', 1e-12);
    });
    check('the input is not changed', 'applyRope returns a new array. Writing into x changes the queries or keys of the caller.', () => {
      const x = randM(rng(4), 3, 4);
      const before = JSON.stringify(x);
      sub.applyRope(x, [0, 1, 2]);
      equal(JSON.stringify(x), before, 'x after the call');
    });
    check('odd d leaves the last coordinate unchanged', 'With an odd d there are floor(d / 2) pairs. The last coordinate has no partner and stays the same.', () => {
      close(sub.applyRope([[1, 2, 3]], [1]), [[-1.1426396637476532, 1.922075596544176, 3]], 'applyRope([[1, 2, 3]], [1])', 1e-9);
      close(sub.ropeFrequencies(5), [1, 0.025118864315095794], 'ropeFrequencies(5)', 1e-12);
    });
    check('very large positions stay finite', 'At position 250000 the angles are large, but cos and sin stay in [-1, 1]. The output is finite and keeps its norm.', () => {
      const x = randM(rng(5), 2, 8);
      const out = sub.applyRope(x, [100000, 250000]);
      ok(out.flat().every((v: number) => Number.isFinite(v)), 'the output has NaN or infinite values');
      close(pairNorms(out), pairNorms(x), 'the norm of each pair', 1e-10);
    });
    check('matches the reference on 5 random cases', 'Your rotation agrees with the reference for several sizes, bases and an odd d.', () => {
      const cases: [number[][], number[], number, number[][]][] = [[[[0.305, -1.04, 0.75, 0.941], [-1.951, -1.302, 0.128, -0.316], [-0.017, -0.853, 0.879, 0.778]], [1648, 2637, 3201], 10000, [[0.940584598752, 0.538447409308, 0.119069316823, -1.19741534055], [-0.515170779727, 2.28827534788, 0.340490895464, 0.017491429513], [0.254443393276, 0.814344251296, 0.292920053068, 1.13671581431]]], [[[0.468, -0.859, 0.369, -0.959, 0.878, -0.05, -0.185, -0.681], [1.223, -0.155, -0.428, -0.352, 0.532, 0.365, 0.413, 0.431], [2.142, -0.406, -0.512, -0.814, 0.616, 1.129, -0.114, -0.84], [-0.824, 0.651, 0.743, 0.543, -0.666, 0.232, 0.117, 0.219], [0.871, 0.224, 0.679, 0.068, 0.289, 0.631, -1.457, -0.32]], [1879, 2070, 2275, 2329, 3370], 10000, [[0.719507769643, -0.662731898601, -0.232500850181, -1.00089227925, 0.873467331603, -0.102170546744, 0.70503056926, 0.0302968052481], [-1.11764953456, 0.520205265147, -0.52184699488, -0.186450298832, -0.497661842308, 0.410587007479, -0.57611657389, 0.156268017486], [2.08302354014, 0.643438366283, 0.651157087633, -0.707625923229, 0.329865758626, -1.2430951618, 0.713993672917, 0.456956272562], [0.962594726947, 0.419748009707, 0.455297830019, 0.799751140031, 0.40236524834, 0.579208258685, -0.2394611889, -0.0656379388038], [-0.700886817172, 0.563537638063, -0.39727118719, -0.554833852454, -0.666273052652, -0.194325035211, 1.34670267212, 0.641592481968]]], [[[-0.275, 1.495, -0.866, 0.968, -1.683, -0.335], [0.163, 0.586, 0.711, 0.793, -0.349, -0.462], [0.858, -0.191, -1.276, -1.133, -0.919, 0.497], [0.142, 0.69, -0.427, 0.159, 0.626, -0.309]], [683, 1315, 1711, 3334], 500, [[1.51013065743, -0.173653095237, 1.20197301406, 0.492179716646, -0.0735194052675, 1.71444127839], [-0.608012046002, 0.0169219359675, -1.06494708704, -0.0160530932073, 0.568255041724, -0.111045970458], [-0.160618786421, 0.864202872854, 1.52038721244, -0.774782372191, -0.040592151908, -1.04399342776], [0.378505590667, -0.594135942217, -0.134041974385, 0.435479906658, -0.410807727565, 0.564441326422]]], [[[-0.363, -0.382, -1.196, 0.487, -0.469, 0.012, 0.481], [0.447, 0.665, -0.098, -0.423, -0.08, -1.687, -1.447], [-1.323, -0.997, 0.4, -0.905, -0.378, 1.299, -0.356], [0.738, -0.934, -0.205, -0.95, -0.339, 0.84, -1.727], [0.434, 0.238, -0.594, -1.446, 0.072, -0.529, 0.233], [0.022, 1.602, -0.239, -1.023, 0.179, 0.22, 1.359]], [423, 591, 770, 1351, 2705, 2775], 10000, [[0.502785048135, -0.157797957438, -0.270311036128, 1.26274183575, 0.262786157098, -0.388649502299, 0.481], [0.167995719357, 0.783461191303, -0.431778747261, 0.045826994382, 0.215436529294, 1.67509883346, -1.447], [0.956064622333, 1.35287783555, -0.649973591164, -0.746029041519, 1.22343210599, -0.577493620776, -0.356], [0.840432770876, -0.843014091007, 0.35358709551, 0.905263036851, -0.806400429036, 0.412600712616, -1.727], [-0.411203942117, -0.275520086359, -0.740586943583, -1.37669276856, 0.533857645084, 0.00458418865659, 0.233], [1.31242720113, -0.918924829201, -1.05051494866, 0.00826696036355, -0.255739485429, 0.122630810127, 1.359]]], [[[-1.189, -0.64, -0.927, -0.39, -1.377, 0.635, -0.222, -1.471, -1.016, 0.314, 0.838, 1.997, 2.914, 0.414, -0.99, -2.132], [0.268, -0.813, -0.415, -0.612, -0.141, 1.066, 0.157, -0.159, -1.036, -1.675, -0.486, -0.054, 1.768, 0.13, 0.983, -0.499]], [942, 3994], 1000000, [[-1.35013131654, -0.0215969464475, 0.163256957718, 0.992358889594, 0.711711901675, 1.33896234787, -1.34906258414, -0.627020848201, -0.85152560103, -0.636989914198, 0.493306966967, 2.10876770564, 2.90037652668, 0.500607634291, -0.978692414435, -2.13721434534], [-0.836024932481, 0.183998131159, -0.254262050829, -0.694348478437, -0.747902834397, 0.772579025279, -0.211897644308, 0.0709181805797, -0.579185424949, 1.88240942505, -0.333277263981, -0.357824349805, 1.73754157633, 0.351672106558, 0.993958628502, -0.476797907742]]]];
      for (const [x, pos, base, want] of cases) close(sub.applyRope(x, pos, base), want, `applyRope for ${x.length} × ${x[0].length} and base ${base}`, 1e-9);
    });
  },
};

export default drill;
