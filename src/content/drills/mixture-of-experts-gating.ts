import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'mixture-of-experts-gating',
  entry: ['route', 'loadBalancingLoss'],
  problem: String.raw`A mixture-of-experts (MoE) layer sends each token to a few experts out of many. A router gives one logit per expert; the layer keeps the top k experts and mixes their outputs with gate weights. The Switch Transformer paper adds an auxiliary loss so the router spreads tokens over all experts. Mixtral, DeepSeek-V3 and Qwen MoE models work this way.

## Task

Write two functions.

1. \`route(logits, topK)\` returns \`{ topIdx, gates }\`: the chosen experts and their gates for each token.
2. \`loadBalancingLoss(logits, topK)\` returns the auxiliary load-balancing loss.

**Routing.** For each token, order the experts by logit, largest first, and keep the first k. When two logits are equal, the expert with the lower index comes first. The gates are a softmax over the k chosen logits only:

g_{t,j} = exp(z_{t,j}) / Σ_{i in top-k(t)} exp(z_{t,i})

So the gates of a token sum to 1, and \`gates[t][j]\` belongs to expert \`topIdx[t][j]\`.

**Load-balancing loss.** With T tokens and E experts:

- f_i is the fraction of the T·k assignments that go to expert i: the number of tokens with i in their top k, divided by T·k.
- P_i = (1/T) Σ_t p_{t,i}, where p_t is the full softmax of token t's logits over all E experts.
- The loss is E · Σ_i f_i · P_i.

The loss is 1 for a uniform router and grows toward E when every token goes to one expert.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`logits\` | \`number[][]\` | T rows of E router logits |
| \`topK\` | \`number\` | the number of experts per token |

\`route\` returns \`{ topIdx: number[][] (T × k integers), gates: number[][] (T × k) }\`. \`loadBalancingLoss\` returns a number.

## Constraints

- 1 ≤ T ≤ 256, 1 ≤ E ≤ 64 and 1 ≤ topK ≤ E.
- Logits can be as large as ±1000; the gates must stay finite.
- f_i comes from counts. Do not use the probabilities for f_i.
- Do not change the input array.

## Examples

\`\`\`ts
const logits = [[2, 1, 0.5, -1], [0, 3, 3, 1], [1, 1, 1, 1]];
route(logits, 2);
// { topIdx: [[0, 1], [1, 2], [0, 1]],
//   gates:  [[0.73105858, 0.26894142], [0.5, 0.5], [0.5, 0.5]] }

loadBalancingLoss(logits, 2);    // 1.2008139315343698
loadBalancingLoss(logits, 1);    // 1.1983721362825372
loadBalancingLoss([[0, 0, 0, 0], [0, 0, 0, 0]], 2); // 1
\`\`\``,
  starter: `function route(logits: number[][], topK: number): { topIdx: number[][]; gates: number[][] } {
  throw new Error('not implemented');
}

function loadBalancingLoss(logits: number[][], topK: number): number {
  throw new Error('not implemented');
}
`,
  solution: `function softmaxRow(z: number[]): number[] {
  const m = Math.max(...z);
  const exps = z.map((v) => Math.exp(v - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function route(logits: number[][], topK: number): { topIdx: number[][]; gates: number[][] } {
  const topIdx = logits.map((row) => row.map((_, i) => i).sort((a, b) => row[b] - row[a] || a - b).slice(0, topK));
  const gates = topIdx.map((idx, t) => softmaxRow(idx.map((i) => logits[t][i])));
  return { topIdx, gates };
}

function loadBalancingLoss(logits: number[][], topK: number): number {
  const T = logits.length;
  const E = logits[0].length;
  const counts = new Array<number>(E).fill(0);
  for (const idx of route(logits, topK).topIdx) for (const i of idx) counts[i]++;
  const f = counts.map((c) => c / (T * topK));
  const probs = logits.map(softmaxRow);
  const P = f.map((_, i) => probs.reduce((s, p) => s + p[i], 0) / T);
  return E * f.reduce((s, fi, i) => s + fi * P[i], 0);
}
`,
  hints: [
    'Sort the expert indices 0 … E-1 of each row by logit, largest first, and break ties by the lower index. Then keep the first k.',
    'The gates use only the k chosen logits: pick them out in the chosen order and apply a softmax to that short list.',
    'Subtract the maximum before Math.exp. The gates do not change, and Math.exp cannot overflow.',
    'For f, count how often each expert appears in topIdx and divide by T·k. For P, average the full softmax rows over the tokens. The loss is E times the dot product of f and P.',
  ],
  notes: String.raw`## Why the loss has two factors

f_i counts the tokens the router really sends to expert i, and a count has no gradient. P_i is the mean router probability, which does. In the product f_i·P_i the count picks the direction and the probability carries the gradient: an expert with many tokens gets a large f_i, so the gradient pushes its probability down.

## Why the minimum is 1

With uniform dispatch every f_i is 1/E and the loss is Σ P_i = 1, whatever the probabilities. The factor E keeps that value at 1 for any number of experts. Training adds the loss to the main loss with a small coefficient, such as 0.01.

## Gates and ties

Renormalizing over the chosen experts is the same as the full softmax divided by the probability mass of the chosen experts. A fixed tie rule makes routing deterministic; without it two runs can send the same token to different experts.

## Where this goes next

DeepSeek-V3 drops the auxiliary loss and adds a per-expert bias that changes only which experts are selected, while the gates still come from the original logits. In serving, MoE means all experts must sit in memory even though each token uses only k of them, which is why a "47B total, 13B active" model like Mixtral needs the memory of 47B but the compute of 13B.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const LOGITS = [
      [2, 1, 0.5, -1],
      [0, 3, 3, 1],
      [1, 1, 1, 1],
    ];
    const randM = (r: () => number, n: number, c: number, s = 2) => Array.from({ length: n }, () => Array.from({ length: c }, () => (r() * 2 - 1) * s));
    const softmax = (z: number[]) => {
      const m = Math.max(...z);
      const e = z.map((v) => Math.exp(v - m));
      const s = e.reduce((a, b) => a + b, 0);
      return e.map((v) => v / s);
    };

    check('route three tokens to the top 2 of 4 experts', 'Pick the k largest logits of each row, largest first; on a tie the lower expert index comes first. The gates are a softmax over the k chosen logits only.', () => {
      const { topIdx, gates } = sub.route(LOGITS, 2);
      equal(
        topIdx,
        [
          [0, 1],
          [1, 2],
          [0, 1],
        ],
        'topIdx',
      );
      close(
        gates,
        [
          [0.73105858, 0.26894142],
          [0.5, 0.5],
          [0.5, 0.5],
        ],
        'the gates',
        1e-7,
      );
    });
    check('the load-balancing loss of the same logits', 'The loss is E · Σ f_i·P_i: f_i is the fraction of the T·k assignments that go to expert i, P_i the mean full-softmax probability of expert i.', () => {
      close(sub.loadBalancingLoss(LOGITS, 2), 1.2008139315343698, 'loadBalancingLoss(logits, 2)', 1e-10);
      close(sub.loadBalancingLoss(LOGITS, 1), 1.1983721362825372, 'loadBalancingLoss(logits, 1)', 1e-10);
    });
    check('equal logits give a loss of 1', 'When every logit is equal, each P_i is 1 / E. The f_i sum to 1, so the loss is E · 1/E = 1.', () => {
      close(sub.loadBalancingLoss(Array.from({ length: 5 }, () => [0, 0, 0, 0]), 2), 1, 'the loss of a uniform router', 1e-12);
    });
    check('gates are a renormalized softmax over the chosen experts', 'Each gate row sums to 1, and each gate equals the full softmax probability of that expert divided by the total probability of the k chosen experts.', () => {
      const logits = randM(rng(0), 6, 8);
      const { topIdx, gates } = sub.route(logits, 3);
      logits.forEach((row, t) => {
        const p = softmax(row);
        const mass = topIdx[t].reduce((s: number, i: number) => s + p[i], 0);
        close(gates[t], topIdx[t].map((i: number) => p[i] / mass), `the gates of token ${t}`, 1e-12);
      });
    });
    check('the chosen experts are the k largest logits, in descending order', 'topIdx holds k different experts, their logits do not increase from left to right, and no expert left out has a larger logit than one chosen.', () => {
      const logits = randM(rng(1), 10, 6);
      const { topIdx } = sub.route(logits, 3);
      logits.forEach((row, t) => {
        const idx: number[] = topIdx[t];
        ok(idx.length === 3 && new Set(idx).size === 3, `token ${t}: topIdx is not 3 different experts`);
        ok(idx.every((e, j) => j === 0 || row[idx[j - 1]] >= row[e]), `token ${t}: the chosen logits are not in descending order`);
        const lowest = Math.min(...idx.map((e) => row[e]));
        ok(row.every((v, e) => idx.includes(e) || v <= lowest), `token ${t}: an expert left out has a larger logit than a chosen one`);
      });
    });
    check('uniform dispatch gives a loss of exactly 1', 'When each expert gets the same number of assignments every f_i is 1 / E, and the loss is Σ P_i = 1 for any probabilities.', () => {
      const r = rng(2);
      const logits = [0, 1, 2, 3].map((e) => randM(r, 1, 4, 0.5)[0].map((v, i) => (i === e ? v + 5 : v)));
      close(sub.loadBalancingLoss(logits, 1), 1, 'the loss when each of 4 experts gets one token', 1e-12);
    });
    check('ties go to the lower expert index', 'Three experts share the largest logit. The two with the lowest indices win, with equal gates.', () => {
      const { topIdx, gates } = sub.route([[0, 5, 1, 5, 5]], 2);
      equal(topIdx, [[1, 3]], 'topIdx');
      close(gates, [[0.5, 0.5]], 'the gates', 1e-12);
    });
    check('large logits do not overflow', 'Math.exp(1000) is Infinity. Subtract the row maximum before Math.exp.', () => {
      const logits = [
        [1000, 999, -1000],
        [-1000, -1000, -999],
      ];
      const { gates } = sub.route(logits, 2);
      close(
        gates,
        [
          [0.7310585786300049, 0.2689414213699951],
          [0.7310585786300049, 0.2689414213699951],
        ],
        'the gates',
        1e-12,
      );
      ok(Number.isFinite(sub.loadBalancingLoss(logits, 2)), 'the loss is not finite');
    });
    check('topK equal to the number of experts', 'With k = E every expert is chosen: the gates are the full softmax in descending order and every f_i is 1 / E, so the loss is 1.', () => {
      const logits = [[0.3, -1, 2]];
      const { topIdx, gates } = sub.route(logits, 3);
      equal(topIdx, [[2, 0, 1]], 'topIdx');
      const p = softmax(logits[0]);
      close(gates, [[p[2], p[0], p[1]]], 'the gates', 1e-12);
      close(sub.loadBalancingLoss(logits, 3), 1, 'the loss', 1e-12);
    });
    check('every token picks the same expert', 'When all tokens go to expert 0 with high probability, f_0 is 1 and P_0 is near 1, so the loss is near its maximum E.', () => {
      const logits = Array.from({ length: 8 }, () => [20, 0, 0, 0]);
      close(sub.loadBalancingLoss(logits, 1), 4 * softmax(logits[0])[0], 'the loss', 1e-12);
    });
    check('the input is not changed', 'route and loadBalancingLoss must not sort or write into the logits.', () => {
      const logits = randM(rng(3), 4, 5);
      const before = JSON.stringify(logits);
      sub.route(logits, 2);
      sub.loadBalancingLoss(logits, 2);
      equal(JSON.stringify(logits), before, 'the logits after the calls');
    });
    check('matches the reference on 3 random cases', 'Your chosen experts, gates and loss agree with the reference solution.', () => {
      const cases: [number[][], number, number[][], number[][], number][] = [[[[0.61, -2.08, 1.5, 1.882], [-3.902, -2.604, 0.256, -0.632], [-0.034, -1.706, 1.758, 1.556], [0.132, 2.254, 0.936, -1.718]], 1, [[3], [2], [2], [1]], [[1], [1], [1], [1]], 1.34620948793], [[[0.738, -1.918, 1.756, -0.1, -0.37, -1.362, 2.446, -0.31], [-0.856, -0.704, 1.064, 0.73, 0.826, 0.862, 4.284, -0.812], [-1.024, -1.628, 1.232, 2.258, -0.228, -1.68, -1.648, 1.302], [1.486, 1.086, -1.332, 0.464, 0.234, 0.438, 1.742, 0.448], [1.358, 0.136, 0.578, 1.262, -2.914, -0.64, -0.94, -1.278], [-0.55, 2.99, -1.732, 1.936, -3.366, -0.67, 0.326, 1.172]], 2, [[6, 2], [6, 2], [3, 7], [6, 0], [0, 3], [1, 3]], [[0.665966926752, 0.334033073248], [0.961580014498, 0.0384199855016], [0.722320224152, 0.277679775848], [0.563652750225, 0.436347249775], [0.523981584971, 0.476018415029], [0.741542268897, 0.258457731103]], 1.43356906226], [[[1.422, 1.586, -0.698, -0.924, 1.716, -0.382], [-2.552, -2.266, -1.838, 0.994, 0.284, 1.38], [-0.854, 0.318, 1.252, -0.618, 0.914, -1.324], [-0.726, -0.764, -2.392, 0.974, -0.938, 0.024], [0.962, 0.894, 1.33, -0.196, -0.846, -0.16]], 3, [[4, 1, 0], [5, 3, 4], [2, 4, 1], [3, 5, 0], [2, 0, 1]], [[0.381188801891, 0.334720145258, 0.284091052851], [0.496530305748, 0.337526666955, 0.165943027297], [0.47479459463, 0.33862126761, 0.186584137759], [0.637176219518, 0.246422183257, 0.116401597224], [0.427581594109, 0.295936567857, 0.276481838035]], 0.987779228041]];
      for (const [logits, k, idx, gates, loss] of cases) {
        const label = `T = ${logits.length}, E = ${logits[0].length}, k = ${k}`;
        const got = sub.route(logits, k);
        equal(got.topIdx, idx, `topIdx for ${label}`);
        close(got.gates, gates, `the gates for ${label}`, 1e-9);
        close(sub.loadBalancingLoss(logits, k), loss, `the loss for ${label}`, 1e-9);
      }
    });
  },
};

export default drill;
