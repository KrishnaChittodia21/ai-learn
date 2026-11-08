import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'top-k-top-p-sampling',
  entry: ['topKFilter', 'topPFilter', 'samplingProbs', 'sample'],
  problem: String.raw`A language model gives one logit for each token of the vocabulary, and the decoder must pick the next token from these logits. Temperature, top-k and top-p (nucleus) change the distribution before the draw. Every chat model uses this sampling step.

## Task

Write four functions. Each \`logits\` argument is an array of V numbers.

1. \`topKFilter(logits, k)\` keeps the \`k\` largest logits and sets every other entry to \`-Infinity\`. Sort by logit, highest first; when two logits are equal the lower index comes first. If \`k >= V\`, keep every entry.
2. \`topPFilter(logits, p)\` computes softmax(z) and sorts the tokens by probability, highest first, with the same tie rule. It keeps the **shortest prefix** of the sorted tokens whose cumulative probability is ≥ p. The token that makes the sum reach p **is kept**. If no prefix reaches p because of rounding, keep every token. Every other entry becomes \`-Infinity\`.
3. \`samplingProbs(logits, temperature = 1, topK?, topP?)\` returns the final distribution. Apply the steps in this order:
   1. Divide the logits by \`temperature\`.
   2. If \`topK\` is given, apply \`topKFilter\`.
   3. If \`topP\` is given, apply \`topPFilter\` to the result of step 2.
   4. Take the softmax. A removed token gets probability exactly 0.
4. \`sample(logits, rand, temperature = 1, topK?, topP?)\` draws one token index. Compute the probabilities with \`samplingProbs\`. Call \`u = rand()\` **exactly once**. Let c be the cumulative sum of the probabilities in vocabulary order. Return the smallest index i with u < c[i]. If no index satisfies this because of rounding, return the largest index whose probability is above 0.

Softmax: e^(z_i) / Σ_j e^(z_j). Entries equal to \`-Infinity\` get probability 0.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`logits\` | \`number[]\` | one score for each of the V tokens |
| \`k\` / \`topK\` | \`number\` | how many tokens to keep, ≥ 1 |
| \`p\` / \`topP\` | \`number\` | the probability mass to keep, 0 < p ≤ 1 |
| \`temperature\` | \`number\` | the divisor of the logits, > 0 |
| \`rand\` | \`() => number\` | a uniform random number in [0, 1) |

The filters return a new \`number[]\` of length V: kept entries have their input values, removed entries are \`-Infinity\`. \`samplingProbs\` returns V probabilities that sum to 1. \`sample\` returns an index.

## Constraints

- Logits are finite and can be larger than 700.
- Do not change the input array.

## Examples

\`\`\`ts
const logits = [2, 1, 0.5, 0.5, -1];
topKFilter(logits, 3);           // [2, 1, 0.5, -Infinity, -Infinity]
topPFilter(logits, 0.8);         // [2, 1, 0.5, -Infinity, -Infinity]
samplingProbs(logits, 0.5, 3);   // [0.84379473, 0.1141952, 0.04201007, 0, 0]
sample(logits, () => 0.637, 1, 3); // 1
\`\`\`

Indices 2 and 3 have the same logit; the lower index 2 is kept. For top-p the sorted cumulative probabilities are 0.5365, 0.7339 and 0.8536: the third token makes the sum reach 0.8, so it is kept.`,
  starter: `function topKFilter(logits: number[], k: number): number[] {
  throw new Error('not implemented');
}

function topPFilter(logits: number[], p: number): number[] {
  throw new Error('not implemented');
}

function samplingProbs(logits: number[], temperature = 1, topK?: number, topP?: number): number[] {
  throw new Error('not implemented');
}

function sample(logits: number[], rand: () => number, temperature = 1, topK?: number, topP?: number): number {
  throw new Error('not implemented');
}
`,
  solution: `function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const exps = z.map((x) => Math.exp(x - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function keepOnly(logits: number[], keep: number[]): number[] {
  const out = logits.map(() => -Infinity);
  for (const i of keep) out[i] = logits[i];
  return out;
}

function topKFilter(logits: number[], k: number): number[] {
  const order = logits.map((_, i) => i).sort((i, j) => logits[j] - logits[i] || i - j);
  return keepOnly(logits, order.slice(0, k));
}

function topPFilter(logits: number[], p: number): number[] {
  const probs = softmax(logits);
  const order = probs.map((_, i) => i).sort((i, j) => probs[j] - probs[i] || i - j);
  let cum = 0;
  let cutoff = order.length;
  for (let i = 0; i < order.length; i++) {
    cum += probs[order[i]];
    if (cum >= p) {
      cutoff = i + 1;
      break;
    }
  }
  return keepOnly(logits, order.slice(0, cutoff));
}

function samplingProbs(logits: number[], temperature = 1, topK?: number, topP?: number): number[] {
  let scaled = logits.map((z) => z / temperature);
  if (topK !== undefined) scaled = topKFilter(scaled, topK);
  if (topP !== undefined) scaled = topPFilter(scaled, topP);
  return softmax(scaled);
}

function sample(logits: number[], rand: () => number, temperature = 1, topK?: number, topP?: number): number {
  const probs = samplingProbs(logits, temperature, topK, topP);
  const u = rand();
  let cum = 0;
  for (let i = 0; i < probs.length; i++) {
    cum += probs[i];
    if (u < cum) return i;
  }
  return probs.findLastIndex((x) => x > 0);
}
`,
  hints: [
    'Start with a softmax that subtracts the maximum before Math.exp. Math.exp(-Infinity) is 0, so the same softmax works on filtered logits.',
    'Sort the indices, not the values: indices.sort((i, j) => z[j] - z[i] || i - j) gives highest first, lower index first on a tie.',
    'For top-p, walk the sorted tokens adding probabilities. Stop at the first position where the sum is at least p, and keep the tokens up to and including it.',
    'Build each filter result as a new array full of -Infinity and copy the kept logits into it, so the input does not change. For the draw, compare one u = rand() with the running sum of the final probabilities in vocabulary order.',
  ],
  notes: String.raw`## Why the order of the steps matters

Top-k does not change when you divide the logits by a positive temperature: the order of the logits stays the same. Top-p does change. A high temperature flattens the distribution, so more tokens are needed to reach the mass p. That is why temperature comes first.

## The token that crosses p

"Cumulative sum ≥ p" keeps the token that makes the sum reach p. Without it the kept mass is below p, and with a large first token the kept set could even be empty.

## Exact draws

Inverse-CDF sampling with one uniform number per draw is simple to test: the same random number always gives the same token, on every machine. Passing \`rand\` in (instead of calling \`Math.random\`) is what makes a sampler reproducible with a seed.

## Where this goes next

Speculative decoding samples from a draft model and a target model with the same distribution code. Serving engines apply these filters on the GPU for a whole batch of rows at a time.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const LOGITS = [2, 1, 0.5, 0.5, -1];
    const kept = (f: number[]) => f.map((x, i) => (Number.isFinite(x) ? i : -1)).filter((i) => i >= 0);
    const softmax = (z: number[]) => {
      const m = Math.max(...z);
      const e = z.map((x) => Math.exp(x - m));
      const s = e.reduce((a, b) => a + b, 0);
      return e.map((x) => x / s);
    };
    const normals = (r: () => number, n: number, scale: number) => Array.from({ length: n }, () => (r() * 2 - 1) * scale);

    check('top-k with k = 3 and a tie', 'Keep the k largest logits and set the rest to -Infinity. Indices 2 and 3 have the same logit, so the lower index 2 is kept.', () => {
      const out: number[] = sub.topKFilter(LOGITS, 3);
      equal(out.length, 5, 'the length of the filtered logits');
      equal(kept(out), [0, 1, 2], 'the kept indices');
      close(out.slice(0, 3), [2, 1, 0.5], 'the kept logits');
    });
    check('top-p with p = 0.8 keeps the token that crosses p', 'The sorted cumulative probabilities are 0.5365, 0.7339 and 0.8536. The third token makes the sum reach 0.8, so it is kept.', () => {
      equal(kept(sub.topPFilter(LOGITS, 0.8)), [0, 1, 2], 'the kept indices');
    });
    check('probabilities with temperature 0.5 and top-k 3', 'Divide the logits by the temperature first, then apply top-k, then take the softmax over the kept logits.', () => {
      close(sub.samplingProbs(LOGITS, 0.5, 3), [0.84379473, 0.1141952, 0.04201007, 0, 0], 'the probabilities', 1e-6);
    });
    check('one draw with u = 0.637, and one at temperature 0.25', 'With top-k 3 the cumulative probabilities are 0.629, 0.860, 1, so u = 0.637 picks index 1. sample must pass the temperature on: at t = 0.25 token 0 has 0.98 of the mass, so u = 0.9 picks index 0.', () => {
      equal(sub.sample(LOGITS, () => 0.637, 1, 3), 1, 'the sampled index with top-k 3');
      equal(sub.sample(LOGITS, () => 0.9, 0.25), 0, 'the sampled index with u = 0.9 at temperature 0.25');
    });
    check('probabilities sum to 1 and filtered tokens get exactly 0', 'The final distribution is a softmax over the kept logits. A token a filter removes has probability 0.', () => {
      const r = rng(1);
      for (let n = 0; n < 5; n++) {
        const probs: number[] = sub.samplingProbs(normals(r, 12, 3), 0.8, 6, 0.7);
        close(
          probs.reduce((a, b) => a + b, 0),
          1,
          'the sum of the probabilities',
          1e-9,
        );
        ok(probs.every((x) => x >= 0), 'a probability is negative');
        ok(probs.filter((x) => x > 0).length <= 6, `more than k = 6 tokens have a probability above 0: ${JSON.stringify(probs)}`);
      }
    });
    check('top-p keeps the smallest set of most likely tokens that reaches p', 'Sort by probability, highest first, and keep tokens until the sum reaches p. The kept mass is at least p; without its least likely token it is below p.', () => {
      const r = rng(3);
      for (const p of [0.3, 0.6, 0.9, 0.95]) {
        const z = normals(r, 9, 2.5);
        const probs = softmax(z);
        const idx = kept(sub.topPFilter(z, p));
        ok(idx.length >= 1, `top-p with p = ${p} removed every token`);
        const mass = idx.reduce((s, i) => s + probs[i], 0);
        const smallest = Math.min(...idx.map((i) => probs[i]));
        ok(mass >= p - 1e-12, `the kept mass ${mass.toFixed(4)} is below p = ${p}`);
        ok(mass - smallest < p, `the kept set for p = ${p} is not the smallest set (mass ${mass.toFixed(4)} still reaches p without its least likely token)`);
      }
    });
    check('temperature scales the log ratio of two tokens', 'With temperature t, log(p_i / p_j) equals (z_i - z_j) / t.', () => {
      const z = [1.5, -0.5, 0.25, 2];
      for (const t of [0.25, 1, 3]) {
        const probs: number[] = sub.samplingProbs(z, t);
        close(Math.log(probs[3] / probs[1]), (z[3] - z[1]) / t, `log(p3 / p1) at t = ${t}`, 1e-9);
      }
    });
    check('sample calls rand() once and uses the inverse CDF', 'Each call draws u = rand() once and returns the smallest index i where u is below the cumulative probability at i, in vocabulary order.', () => {
      const z = [0.2, 1.4, -0.3, 0.9, 0.9, -2, 0.1];
      const probs = softmax(z.map((x, i) => ([0, 1, 3, 4, 6].includes(i) ? x / 0.9 : -Infinity)));
      const ra = rng(11);
      const rb = rng(11);
      const got = Array.from({ length: 40 }, () => sub.sample(z, ra, 0.9, 5));
      const want = Array.from({ length: 40 }, () => {
        const u = rb();
        let c = 0;
        for (let i = 0; i < probs.length; i++) if (u < (c += probs[i])) return i;
        return probs.findLastIndex((x) => x > 0);
      });
      equal(got, want, '40 draws with seed 11');
    });
    check('the inputs are not changed', 'A filter that writes -Infinity into its input array breaks the code that calls it.', () => {
      const z = [0.3, -1.2, 2, 0.7, 0.7];
      const before = JSON.stringify(z);
      sub.topKFilter(z, 2);
      sub.topPFilter(z, 0.5);
      sub.samplingProbs(z, 0.5, 3, 0.9);
      sub.sample(z, rng(0), 2, 4, 0.8);
      equal(JSON.stringify(z), before, 'the logits after the calls');
    });
    check('ties in top-k keep the lower indices', 'When logits are equal, break the tie by index so the lower index comes first.', () => {
      equal(kept(sub.topKFilter([0, 0, 0, 0, 0, 0], 2)), [0, 1], 'the kept indices of 6 equal logits');
      equal(kept(sub.topKFilter([0, 1, 1, 1], 2)), [1, 2], 'the kept indices of [0, 1, 1, 1]');
    });
    check('top-p edge cases: exactly p, tiny p, p = 1 and k ≥ V', 'The rule is cumulative sum ≥ p, the first sorted token always stays, and p = 1 or k ≥ V change nothing.', () => {
      equal(kept(sub.topPFilter([0, 0], 0.5)), [0], 'top-p of two equal tokens with p = 0.5');
      equal(kept(sub.topPFilter([0.1, 3, 3, -1], 1e-9)), [1], 'top-p with a tiny p');
      const z = normals(rng(4), 8, 2);
      equal(sub.topKFilter(z, 8), z, 'top-k with k = 8');
      equal(sub.topKFilter(z, 20), z, 'top-k with k = 20');
      equal(sub.topPFilter(z, 1), z, 'top-p with p = 1');
    });
    check('large logits do not overflow; top-k = 1 is greedy', 'Math.exp(1000) is Infinity, so subtract the maximum before Math.exp. With one kept token, every draw returns the largest logit.', () => {
      close(sub.samplingProbs([1000, 1001, 1002]), [0.09003057, 0.24472847, 0.66524096], 'the probabilities', 1e-6);
      close(sub.samplingProbs([1000, 1001, 1002], 1, undefined, 0.5), [0, 0, 1], 'the probabilities with p = 0.5', 1e-12);
      const r = rng(5);
      equal([...new Set(Array.from({ length: 20 }, () => sub.sample([0.5, 2.5, 2.5, 1], r, 1, 1)))], [1], 'the set of 20 sampled indices with top-k 1');
    });
    check('matches the reference on random cases', 'Your filters and probabilities agree with the reference solution for the same settings.', () => {
      const a = [0.6094341595088627, -2.079968212480991, 1.5009023916129145, 1.8811294327824277, -3.902070377307673, -2.604359013724636, 0.25568080633457074, -0.6324851846871644, -0.03360231500857759, -1.70608785514716];
      close(sub.samplingProbs(a), [0.11441654155994409, 0.007771345306861622, 0.27902849093450444, 0.4081117099487193, 0.0012565138815499204, 0.00459998245480496, 0.08032591606142259, 0.033046852205321275, 0.06014805992974832, 0.011294587717123458], 'the probabilities at t = 1', 1e-7);
      const b = [-1.3310194145773886, 0.46432264613343954, 0.23337161828145644, 0.4373771934580259, 1.7428575558963797, 0.44719109754936454, 1.3578271261437898, 0.13515813897778292, 0.5782387973799683, 1.2625764516770808];
      equal(kept(sub.topKFilter(b, 5)), [1, 4, 6, 8, 9], 'the indices top-k keeps with k = 5');
      equal(kept(sub.topPFilter(b, 0.8)), [1, 4, 5, 6, 8, 9], 'the indices top-p keeps with p = 0.8');
      close(sub.samplingProbs(b, 0.5, 5, 0.8), [0, 0, 0, 0, 0.5418108464446124, 0, 0.25085023537085577, 0, 0, 0.20733891818453187], 'the probabilities at t = 0.5, k = 5, p = 0.8', 1e-7);
    });
  },
};

export default drill;
