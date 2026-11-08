import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'softmax-cross-entropy',
  entry: ['softmax', 'crossEntropy', 'crossEntropyGrad'],
  problem: String.raw`A classifier gives one row of logits for each example. Softmax turns each row into probabilities. Cross-entropy measures how much probability the model gives to the correct class, and its gradient with respect to the logits is the signal that trains every classifier, including the next-token head of an LLM.

## Task

Write three functions.

1. \`softmax(logits)\` returns the softmax of each row.
2. \`crossEntropy(logits, targets)\` returns the mean cross-entropy loss over the batch.
3. \`crossEntropyGrad(logits, targets)\` returns the gradient of that mean loss with respect to \`logits\`.

The softmax of a row z is p_i = e^(z_i) / Σ_j e^(z_j). The loss of one example with correct class y is -log p_y. The batch loss is the mean of the example losses.

Large logits overflow \`Math.exp\` (\`Math.exp(1000)\` is \`Infinity\`). Your softmax must give correct probabilities for logits such as 1000.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`logits\` | \`number[][]\` | N rows of C scores, one row per example |
| \`targets\` | \`number[]\` | the correct class of each example, from 0 to C - 1 |

\`softmax\` and \`crossEntropyGrad\` return \`number[][]\` with the same shape as \`logits\`; \`crossEntropy\` returns a number.

## Constraints

- 1 ≤ N and 2 ≤ C. Logits can be any finite number, also values larger than 700.
- Do not change the input arrays.

## Examples

\`\`\`ts
softmax([[1, 2, 3]]);
// [[0.09003057, 0.24472847, 0.66524096]]

crossEntropy([[2, 1, 0.1], [0.5, 2.5, 0.3]], [0, 1]);
// 0.31853977
\`\`\`

The gradient of the same batch has one row for each example. Each row sums to 0.`,
  starter: `function softmax(logits: number[][]): number[][] {
  throw new Error('not implemented');
}

function crossEntropy(logits: number[][], targets: number[]): number {
  throw new Error('not implemented');
}

function crossEntropyGrad(logits: number[][], targets: number[]): number[][] {
  throw new Error('not implemented');
}
`,
  solution: `function softmax(logits: number[][]): number[][] {
  return logits.map((row) => {
    const m = Math.max(...row);
    const exps = row.map((z) => Math.exp(z - m));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  });
}

function crossEntropy(logits: number[][], targets: number[]): number {
  let total = 0;
  logits.forEach((row, i) => {
    const m = Math.max(...row);
    const logSum = Math.log(row.reduce((s, z) => s + Math.exp(z - m), 0));
    total -= row[targets[i]] - m - logSum;
  });
  return total / logits.length;
}

function crossEntropyGrad(logits: number[][], targets: number[]): number[][] {
  return softmax(logits).map((p, i) => p.map((v, j) => (v - (j === targets[i] ? 1 : 0)) / logits.length));
}
`,
  hints: [
    'Work one row at a time. Math.max(...row) gives the maximum of a row.',
    'Softmax does not change when you subtract the same number from every logit in a row. Subtract the row maximum before Math.exp: the largest exponent is then 0, so nothing overflows.',
    'For the loss, compute log-softmax directly: the shifted logit minus the log of the sum of the shifted exponentials. Then take the value at the correct class of each row.',
    'The gradient of one example is softmax(z) - oneHot(y). The batch loss is a mean, so divide the gradient by N.',
  ],
  notes: String.raw`## Why the shift works

For any constant c, e^(z_i - c) / Σ_j e^(z_j - c) = e^(z_i) / Σ_j e^(z_j). With c = max_j z_j every exponent is 0 or less, so each term is in (0, 1] and the sum is at least 1. Overflow cannot occur, and the sum is never 0.

## Why log-softmax and not log of softmax

When the correct class has a probability below about 1e-308, softmax rounds it to 0 and \`Math.log\` returns -Infinity. The form z_y - c - log Σ_j e^(z_j - c) never computes that tiny number, so the loss stays finite. This is the log-sum-exp trick.

## The gradient

The derivative of -log p_y with respect to z_i is p_i - [i = y]. The full softmax Jacobian cancels out, which is why frameworks fuse softmax and cross-entropy into one operation.

## Where this goes next

Fine-tuning an LLM minimizes exactly this loss over the next token at every position. The same row-wise softmax returns in attention: the weights are a softmax over each row of scores, with a mask applied before the shift.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const BATCH = [
      [2, 1, 0.1],
      [0.5, 2.5, 0.3],
    ];
    const rows = (r: () => number, n: number, c: number, scale: number) => Array.from({ length: n }, () => Array.from({ length: c }, () => (r() * 2 - 1) * scale));
    const sums = (m: number[][]) => m.map((row) => row.reduce((a, b) => a + b, 0));

    check('softmax of [1, 2, 3]', 'Each probability is exp of its logit divided by the sum of exp over the row.', () => {
      close(sub.softmax([[1, 2, 3]]), [[0.09003057, 0.24472847, 0.66524096]], 'the probabilities', 1e-6);
    });
    check('loss of the two-example batch', 'The loss is the mean over the batch of minus the log probability of the correct class.', () => {
      close(sub.crossEntropy(BATCH, [0, 1]), 0.31853977, 'the loss', 1e-6);
    });
    check('gradient rows sum to zero', 'The gradient of each row is softmax minus a one-hot vector, so each row sums to 0.', () => {
      const g: number[][] = sub.crossEntropyGrad(BATCH, [0, 1]);
      equal([g.length, g[0]?.length], [2, 3], 'the gradient shape [rows, columns]');
      close(sums(g), [0, 0], 'the row sums of the gradient', 1e-9);
    });
    check('every softmax row sums to 1', 'Softmax gives a probability distribution, so each row must add up to 1.', () => {
      const probs: number[][] = sub.softmax(rows(rng(0), 6, 9, 3));
      close(sums(probs), [1, 1, 1, 1, 1, 1], 'the row sums', 1e-9);
    });
    check('adding a constant to a row does not change softmax', 'Softmax only depends on the differences between the logits in a row.', () => {
      const z = rows(rng(1), 4, 5, 1);
      close(sub.softmax(z.map((row) => row.map((x) => x + 7.5))), sub.softmax(z), 'softmax of the shifted logits', 1e-9);
    });
    check('gradient matches finite differences', 'A gradient is correct when a small change in one logit changes the loss by gradient × that change.', () => {
      const z = rows(rng(2), 3, 4, 1);
      const targets = [1, 3, 0];
      const h = 1e-6;
      const numeric = z.map((row, i) =>
        row.map((_, j) => {
          const up = z.map((r) => [...r]);
          const down = z.map((r) => [...r]);
          up[i][j] += h;
          down[i][j] -= h;
          return (sub.crossEntropy(up, targets) - sub.crossEntropy(down, targets)) / (2 * h);
        }),
      );
      close(sub.crossEntropyGrad(z, targets), numeric, 'the analytic gradient', 1e-5);
    });
    check('the inputs are not changed', 'A function that writes into its input array breaks the code that calls it.', () => {
      const z = [
        [0.3, -1.2, 2],
        [1, 1, 1],
      ];
      const before = JSON.stringify(z);
      sub.softmax(z);
      sub.crossEntropy(z, [2, 0]);
      sub.crossEntropyGrad(z, [2, 0]);
      equal(JSON.stringify(z), before, 'the logits after the calls');
    });
    check('large logits do not overflow', 'Math.exp(1000) is Infinity. Subtract the row maximum before Math.exp so the largest exponent is 0.', () => {
      close(sub.softmax([[1000, 1001, 1002]]), [[0.09003057, 0.24472847, 0.66524096]], 'softmax of large logits', 1e-6);
    });
    check('loss stays finite for a confident wrong answer', 'When the correct class has a tiny probability, compute log-softmax directly: log(0) is -Infinity.', () => {
      close(sub.crossEntropy([[800, 0, -800]], [2]), 1600, 'the loss', 1e-9);
    });
    check('one example and two classes', 'The functions must work for the smallest batch: N = 1 and C = 2.', () => {
      close(sub.softmax([[0, 0]]), [[0.5, 0.5]], 'softmax');
      close(sub.crossEntropy([[0, 0]], [1]), Math.log(2), 'the loss');
      close(sub.crossEntropyGrad([[0, 0]], [1]), [[0.5, -0.5]], 'the gradient');
    });
    check('matches the reference on a random batch', 'Your softmax, loss and gradient agree with the reference solution on a 5 × 4 batch.', () => {
      const z = [
        [-3.902070377307673, -2.604359013724636, 0.25568080633457074, -0.6324851846871644],
        [-0.03360231500857759, -1.70608785514716, 1.7587959497256571, 1.5555838708578966],
        [0.1320613951224321, 2.2544824139360657, 0.9350186845040912, -1.7185849257664765],
        [0.7375015681649977, -1.9177652016579978, 1.756900602614545, -0.09985182197250579],
        [-0.3697247270905211, -1.3618590888078828, 2.4450826773480605, -0.3090589641376043],
      ];
      const targets = [2, 2, 3, 3, 0];
      close(
        sub.softmax(z),
        [
          [0.010538636514556374, 0.03858098487915534, 0.6737097333345032, 0.27717064527178503],
          [0.08270358988034639, 0.01553005951506314, 0.49653862463700865, 0.4052277259675817],
          [0.08517452567486039, 0.7113207217335055, 0.19012080465358536, 0.01338394793804868],
          [0.2339365500639953, 0.01644108122144549, 0.6483618554934552, 0.10126051322110403],
          [0.05229225934947744, 0.01938915702556916, 0.8727557721959474, 0.05556281142900615],
        ],
        'softmax',
        1e-7,
      );
      close(sub.crossEntropy(z, targets), 2.1299429602321087, 'the loss', 1e-7);
      const g: number[][] = sub.crossEntropyGrad(z, targets);
      close(g[0], [0.002107727302911275, 0.007716196975831068, -0.06525805333309935, 0.055434129054357004], 'gradient row 0', 1e-7);
      close(g[4], [-0.18954154813010451, 0.003877831405113832, 0.17455115443918948, 0.01111256228580123], 'gradient row 4', 1e-7);
      ok(g.length === 5, `the gradient should have 5 rows, got ${g.length}`);
    });
  },
};

export default drill;
