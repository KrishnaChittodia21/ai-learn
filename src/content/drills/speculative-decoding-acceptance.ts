import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'speculative-decoding-acceptance',
  entry: ['acceptanceRate', 'residualDistribution', 'speculativeStep', 'expectedTokens'],
  problem: String.raw`Speculative decoding makes a large model generate text faster with no change to its output. A small draft model proposes a few tokens; the large target model checks all of them in one forward pass. A rejection rule keeps the output distribution exactly equal to the target model's.

## Task

Write four functions. Here **p** is a distribution of the **target** model and **q** one of the **draft** model, over a vocabulary of V tokens.

1. \`acceptanceRate(target, draft)\` returns α = Σₓ min(p(x), q(x)): the probability that the rule accepts one draft token.
2. \`residualDistribution(target, draft)\` returns norm(max(0, p - q)): the elementwise maximum of 0 and p - q, divided by its sum. When that sum is 0, return a copy of \`target\`.
3. \`speculativeStep(targetProbs, draftProbs, draftTokens, rand)\` runs the verify step for γ draft tokens and returns the output tokens.
4. \`expectedTokens(alpha, gamma)\` returns the expected number of tokens of one step, (1 - α^(γ+1)) / (1 - α). For α = 1 it returns γ + 1.

**Sampling a token** from a distribution d: draw u = \`rand()\` and return the first index i where d[0] + … + d[i] > u (if rounding leaves none, the last index).

\`speculativeStep\` does these steps. **The order of the random draws is part of the task.**

1. For each draft token xᵢ, i from 0 to γ - 1, let pᵢ be row i of \`targetProbs\` and qᵢ row i of \`draftProbs\`.
2. Draw u = \`rand()\`. When u < min(1, pᵢ(xᵢ) / qᵢ(xᵢ)), accept xᵢ, add it to the output, and go on to the next draft token.
3. Otherwise sample one token from the residual of pᵢ and qᵢ, add it to the output and return.
4. When all γ draft tokens are accepted, sample one **bonus** token from the last row of \`targetProbs\` (row γ), add it and return.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`target\`, \`draft\` | \`number[]\` (V) | the distributions p and q |
| \`targetProbs\` | \`number[][]\` (γ + 1 × V) | target distributions at each draft position and one more |
| \`draftProbs\` | \`number[][]\` (γ × V) | draft distributions at each draft position |
| \`draftTokens\` | \`number[]\` (γ) | the tokens the draft model sampled |
| \`rand\` | \`() => number\` | the only source of randomness, uniform in [0, 1) |

\`speculativeStep\` returns from 1 to γ + 1 token ids.

## Constraints

- Each row of probabilities sums to 1. Each draft token has qᵢ(xᵢ) > 0 (the draft sampled it); pᵢ(xᵢ) can be 0.
- Call \`rand\` only as described, in that order. Do not change the inputs.

## Examples

\`\`\`ts
acceptanceRate([0.5, 0.3, 0.2, 0], [0.25, 0.25, 0.25, 0.25]);       // 0.7
residualDistribution([0.5, 0.3, 0.2, 0], [0.25, 0.25, 0.25, 0.25]); // [0.8333, 0.1667, 0, 0]
expectedTokens(0.8, 4); // 3.3616
const target = [[0.5, 0.3, 0.2, 0], [0.1, 0.6, 0.2, 0.1], [0.25, 0.25, 0.25, 0.25]];
const draft = [[0.25, 0.25, 0.25, 0.25], [0.4, 0.2, 0.2, 0.2]];
// rand returns 0.9, 0.9, 0.1: both drafts accepted (p/q = 2 and 3), bonus token 0
speculativeStep(target, draft, [0, 1], rand); // [0, 1, 0]
\`\`\``,
  starter: `function acceptanceRate(target: number[], draft: number[]): number {
  throw new Error('not implemented');
}

function residualDistribution(target: number[], draft: number[]): number[] {
  throw new Error('not implemented');
}

function speculativeStep(targetProbs: number[][], draftProbs: number[][], draftTokens: number[], rand: () => number): number[] {
  throw new Error('not implemented');
}

function expectedTokens(alpha: number, gamma: number): number {
  throw new Error('not implemented');
}
`,
  solution: `function acceptanceRate(target: number[], draft: number[]): number {
  return target.reduce((s, p, x) => s + Math.min(p, draft[x]), 0);
}

function residualDistribution(target: number[], draft: number[]): number[] {
  const raw = target.map((p, x) => Math.max(0, p - draft[x]));
  const total = raw.reduce((s, v) => s + v, 0);
  if (total === 0) return [...target];
  return raw.map((v) => v / total);
}

function sample(dist: number[], rand: () => number): number {
  const u = rand();
  let cum = 0;
  for (let i = 0; i < dist.length; i++) {
    cum += dist[i];
    if (cum > u) return i;
  }
  return dist.length - 1;
}

function speculativeStep(targetProbs: number[][], draftProbs: number[][], draftTokens: number[], rand: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < draftTokens.length; i++) {
    const token = draftTokens[i];
    const p = targetProbs[i][token];
    const q = draftProbs[i][token];
    if (rand() < Math.min(1, p / q)) {
      out.push(token);
    } else {
      const residual = residualDistribution(targetProbs[i], draftProbs[i]);
      out.push(sample(residual, rand));
      return out;
    }
  }
  out.push(sample(targetProbs[draftTokens.length], rand));
  return out;
}

function expectedTokens(alpha: number, gamma: number): number {
  if (alpha >= 1) return gamma + 1;
  return (1 - alpha ** (gamma + 1)) / (1 - alpha);
}
`,
  hints: [
    'Write acceptanceRate and residualDistribution first. Each is one map and one sum.',
    'In the step, read the two probabilities of the draft token: targetProbs[i][token] and draftProbs[i][token]. The ratio p / q can be larger than 1; then the token is always accepted.',
    'After a rejection, sample from the residual, not from p. The draft already proposed the tokens where q > p too often; the residual adds probability only where p > q.',
    'When the loop ends with no rejection, the target has one more row, at index γ. Sample the bonus token from it. A step therefore gives from 1 to γ + 1 tokens.',
  ],
  notes: String.raw`## Why the output equals the target

A token x comes out in two ways. The draft proposes x and the rule accepts it, with probability q(x)·min(1, p(x)/q(x)) = min(p(x), q(x)). Or the rule rejects, with probability 1 - α, and the residual gives x with probability max(0, p(x) - q(x)) / (1 - α), because the sum of max(0, p - q) is 1 - α. Together: min(p, q) + max(0, p - q) = p(x). One of the checks tests exactly this identity.

## The speed

Each step calls the target model once and gives 1 to γ + 1 tokens. With independent acceptances at rate α the mean is (1 - α^(γ+1)) / (1 - α). A draft close to the target gives a high α; α is also 1 - ½‖p - q‖₁, one minus the total variation distance.

## The names of p and q

This drill uses the paper's letters (Leviathan et al., 2023, "Fast Inference from Transformers via Speculative Decoding"): p for the target, q for the draft. Some code uses the opposite letters; the rule is the same.

## Where this goes next

Medusa and EAGLE replace the separate draft model with extra heads on the target model. The verify step stays the same.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const P = [0.5, 0.3, 0.2, 0];
    const Q = [0.25, 0.25, 0.25, 0.25];
    const TARGET = [[0.5, 0.3, 0.2, 0], [0.1, 0.6, 0.2, 0.1], [0.25, 0.25, 0.25, 0.25]];
    const DRAFT = [[0.25, 0.25, 0.25, 0.25], [0.4, 0.2, 0.2, 0.2]];
    // a scripted rand: returns these values in order, and counts the draws
    const script = (...xs: number[]) => {
      const f = () => {
        f.calls++;
        return xs[f.calls - 1] ?? 0.5;
      };
      f.calls = 0;
      return f;
    };
    const r = rng(11);
    const randomDist = (v: number, zeros = 0) => {
      const x = Array.from({ length: v }, () => r() + 0.05);
      for (let z = 0; z < zeros; z++) x[(z * 3 + 1) % v] = 0;
      const s = x.reduce((a, b) => a + b, 0);
      return x.map((v) => v / s);
    };

    check('acceptance rate and residual of the example pair', 'The acceptance rate is the sum over the vocabulary of min(p, q). The residual is max(0, p - q) divided by its sum.', () => {
      close(sub.acceptanceRate(P, Q), 0.7, 'the acceptance rate', 1e-12);
      close(sub.residualDistribution(P, Q), [0.83333333, 0.16666667, 0, 0], 'the residual distribution', 1e-7);
    });
    check('expected tokens for each target call', '(1 - α^(γ+1)) / (1 - α) counts the accepted tokens plus the one extra token every step adds. For α = 1 it is γ + 1.', () => {
      close(sub.expectedTokens(0.8, 4), 3.3616, 'expectedTokens(0.8, 4)', 1e-12);
      close(sub.expectedTokens(1, 4), 5, 'expectedTokens(1, 4)', 1e-12);
      close(sub.expectedTokens(0, 4), 1, 'expectedTokens(0, 4)', 1e-12);
      close(sub.expectedTokens(0.5, 0), 1, 'expectedTokens(0.5, 0)', 1e-12);
    });
    check('full acceptance adds a bonus token from the last target row', 'Draw one rand() per draft token and accept when it is below min(1, p/q). After full acceptance, sample one bonus token from target row γ.', () => {
      const rand = script(0.9, 0.9, 0.1);
      equal(sub.speculativeStep(TARGET, DRAFT, [0, 1], rand), [0, 1, 0], 'the tokens for draft [0, 1], rand 0.9, 0.9, 0.1');
      equal(rand.calls, 3, 'the number of rand() calls');
      equal(sub.speculativeStep(TARGET, DRAFT, [0, 0], script(0.9, 0.2, 0.8)), [0, 0, 3], 'the tokens for draft [0, 0], rand 0.9, 0.2, 0.8 (p/q = 0.25 > 0.2 accepts)');
    });
    check('a rejection samples from the residual and stops', 'After a rejection, draw the replacement from norm(max(0, p - q)), not from p: here only token 1 has p > q, so the residual always gives 1.', () => {
      const rand = script(0.9, 0.3, 0.05);
      equal(sub.speculativeStep(TARGET, DRAFT, [0, 0], rand), [0, 1], 'the tokens for draft [0, 0], rand 0.9, 0.3, 0.05');
      equal(rand.calls, 3, 'the number of rand() calls (no bonus token after a rejection)');
    });
    check('a token with target probability 0 is always rejected', 'When p(x) = 0 the acceptance probability min(1, p/q) is 0, and the residual never gives x because max(0, p(x) - q(x)) = 0.', () => {
      for (let s = 0; s < 20; s++) {
        const out: number[] = sub.speculativeStep(TARGET, DRAFT, [3, 0], rng(100 + s));
        ok(out.length === 1 && out[0] !== 3, `a draft token with p = 0 was accepted or came out of the residual: ${JSON.stringify(out)}`);
      }
    });
    check('the exact output distribution equals the target', 'P(x) = q(x)·min(1, p(x)/q(x)) + (1 - α)·residual(x) must equal p(x): accepted draft tokens plus residual draws reproduce the target exactly.', () => {
      for (const [v, zp, zq] of [
        [4, 0, 0],
        [6, 2, 0],
        [6, 0, 2],
        [10, 3, 3],
      ]) {
        const p = randomDist(v, zp);
        const q = randomDist(v, zq);
        const alpha: number = sub.acceptanceRate(p, q);
        const res: number[] = sub.residualDistribution(p, q);
        const induced = p.map((px, x) => (q[x] > 0 ? q[x] * Math.min(1, px / q[x]) : 0) + (1 - alpha) * res[x]);
        close(induced, p, `the induced distribution for a vocabulary of ${v}`, 1e-12);
      }
    });
    check('sampled first tokens follow the target', 'Run 10000 steps with one draft token drawn from q. Each first output token frequency must be within 0.02 of p. On a rejection, sample from the residual, not from p.', () => {
      const p = [0.1, 0.2, 0.3, 0.4];
      const q = [0.4, 0.3, 0.2, 0.1];
      const rand = rng(7);
      const counts = [0, 0, 0, 0];
      for (let n = 0; n < 10000; n++) {
        // the draft samples its token from q
        const u = rand();
        let token = 0;
        let cum = q[0];
        while (cum <= u && token < 3) cum += q[++token];
        counts[sub.speculativeStep([p, p], [q], [token], rand)[0]] += 1;
      }
      const freq = counts.map((c) => c / 10000);
      ok(freq.every((f, i) => Math.abs(f - p[i]) < 0.02), `the output tokens do not follow the target: expected about ${JSON.stringify(p)}, got ${JSON.stringify(freq)}`);
    });
    check('the acceptance rate is symmetric and at most 1', 'α = Σ min(p, q) does not change when p and q swap. It is 1 when p equals q, and 1 minus half the L1 distance in general.', () => {
      const p = randomDist(8);
      const q = randomDist(8);
      close(sub.acceptanceRate(p, q), sub.acceptanceRate(q, p), 'α after the swap', 1e-12);
      close(sub.acceptanceRate(p, q), 1 - 0.5 * p.reduce((s, x, i) => s + Math.abs(x - q[i]), 0), 'α', 1e-12);
      close(sub.acceptanceRate(p, p), 1, 'α when p equals q', 1e-12);
    });
    check('equal distributions accept every draft token', 'When p equals q, min(1, p/q) is 1, so every draft token is accepted. The residual max(0, p - q) is all 0: then return a copy of p.', () => {
      const p = [0.2, 0.5, 0.3];
      close(sub.residualDistribution(p, p), p, 'the residual when p equals q');
      for (let s = 0; s < 10; s++) {
        const out: number[] = sub.speculativeStep([p, p, p], [p, p], [1, 2], rng(200 + s));
        equal(out.slice(0, 2), [1, 2], 'the accepted tokens');
        ok(out.length === 3, `full acceptance must add one bonus token, got ${JSON.stringify(out)}`);
      }
    });
    check('no draft tokens', 'With γ = 0 the step samples one token from the only target row.', () => {
      equal(sub.speculativeStep([[0, 1, 0]], [], [], rng(1)), [1], 'the tokens');
    });
    check('the inputs are not changed', 'A function that writes into the target or draft probabilities breaks the decoder that calls it.', () => {
      const target = TARGET.map((row) => [...row]);
      const draft = DRAFT.map((row) => [...row]);
      const tokens = [3, 0];
      sub.acceptanceRate(target[0], draft[0]);
      sub.residualDistribution(target[0], draft[0]);
      sub.speculativeStep(target, draft, tokens, rng(0));
      equal([target, draft, tokens], [TARGET, DRAFT, [3, 0]], 'the inputs after the calls');
    });
    check('rates and residuals match the reference', 'Your α, residual and expected token count agree with the reference solution on random distributions.', () => {
      const cases: [number[], number[], number, number, number[], number][] = [
        [[0, 0.22793189208619802, 0.42361950577329754, 0.34844860214050444], [0.19306397919640064, 0.1623565628922228, 0.37686537771210527, 0.2677140801992713], 1, 0.8069360208035994, [0, 0.3396559496334972, 0.24216908952047506, 0.41817496084602773], 1.8069360208035994],
        [[0.23614578454354818, 0, 0.2893515208769059, 0.05447241952337923, 0.42003027505616664], [0.39548392601513127, 0.14607515131766013, 0.16342355259446087, 0.20194005568454726, 0.09307731438820034], 2, 0.5471190710495886, [0, 0, 0.2780597729612802, 0, 0.7219402270387199], 1.8464583489557533],
        [[0.1108370207934665, 0.26985665010312915, 0.26144662351936454, 0.13381143476211432, 0, 0.2240482708219255], [0.1942614449112311, 0.1056025570081882, 0.18301059060910219, 0.36057143268932496, 0.11332756135659683, 0.043226413425556894], 3, 0.5764880165984281, [0, 0.3878381239078093, 0.18520381000858174, 0, 0, 0.42695806608360887], 2.1004155741219503],
      ];
      for (const [p, q, gamma, alpha, residual, expected] of cases) {
        close(sub.acceptanceRate(p, q), alpha, `α for a vocabulary of ${p.length}`, 1e-12);
        close(sub.residualDistribution(p, q), residual, `the residual for a vocabulary of ${p.length}`, 1e-10);
        close(sub.expectedTokens(alpha, gamma), expected, `the expected tokens for γ = ${gamma}`, 1e-12);
      }
    });
  },
};

export default drill;
