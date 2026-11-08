import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'clip-contrastive-loss',
  entry: ['similarityLogits', 'symmetricInfonce', 'symmetricInfonceGrad'],
  problem: String.raw`CLIP trains an image encoder and a text encoder together. In a batch of N pairs, image i belongs with text i and with no other text. The loss pulls the matched pairs together and pushes the other N² - N pairs apart. Zero-shot classification and image search both use the embeddings this loss trains.

## Task

Write three functions.

1. \`similarityLogits(imageEmb, textEmb, temperature)\` returns the N × N logit matrix.
2. \`symmetricInfonce(logits)\` returns the symmetric contrastive loss as a number.
3. \`symmetricInfonceGrad(logits)\` returns the gradient of that loss with respect to the logits.

**Logits.** Divide each image row and each text row by its L2 norm (call them Î and T̂). Then

\`\`\`text
S[i][j] = (Î[i] · T̂[j]) / τ
\`\`\`

where τ is the temperature. Row i holds image i against every text; column j holds text j against every image.

**Loss.** The target of row i and of column i is index i, the diagonal.

\`\`\`text
L_img = -(1/N) Σ_i log( exp(S[i][i]) / Σ_j exp(S[i][j]) )     (softmax over each row)
L_txt = -(1/N) Σ_j log( exp(S[j][j]) / Σ_i exp(S[i][j]) )     (softmax over each column)
L     = (L_img + L_txt) / 2
\`\`\`

**Gradient.** Return ∂L/∂S with the same shape as \`logits\`. Let R be the softmax of each row of S and C the softmax of each column. The gradient of one cross-entropy is its softmax minus the one-hot target.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`imageEmb\` | \`number[][]\` (N × d) | one image embedding per row |
| \`textEmb\` | \`number[][]\` (N × d) | one text embedding per row; row i matches image i |
| \`temperature\` | \`number\` | τ > 0; the logits are divided by it |
| \`logits\` | \`number[][]\` (N × N) | rows are images, columns are texts |

## Constraints

- No embedding row is all zeros. \`0.01 <= temperature <= 1\`.
- The loss and gradient get any finite logits up to ±1000 and must stay finite.
- Do not change the input arrays.

## Examples

\`\`\`ts
const img = [[1, 0], [0, 2], [1, 1]];
const txt = [[2, 0], [1, 1], [0, 3]];
const S = similarityLogits(img, txt, 0.5);
// [[2, 1.41421356, 0], [0, 1.41421356, 2], [1.41421356, 2, 1.41421356]]
symmetricInfonce(S);     // 0.9905556060000382
symmetricInfonceGrad(S);
// [[-0.13632819, 0.09873442, 0.02666175],
//  [ 0.02666175, -0.23459891, 0.19700514],
//  [ 0.09873442, 0.15772852, -0.23459891]]
symmetricInfonce([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]); // 1.3862943611198906 (= ln 4)
\`\`\``,
  starter: `function similarityLogits(imageEmb: number[][], textEmb: number[][], temperature: number): number[][] {
  throw new Error('not implemented');
}

function symmetricInfonce(logits: number[][]): number {
  throw new Error('not implemented');
}

function symmetricInfonceGrad(logits: number[][]): number[][] {
  throw new Error('not implemented');
}
`,
  solution: `function normalize(x: number[][]): number[][] {
  return x.map((row) => {
    const len = Math.hypot(...row);
    return row.map((v) => v / len);
  });
}

function transpose(m: number[][]): number[][] {
  return m[0].map((_, j) => m.map((row) => row[j]));
}

function logSoftmax(m: number[][]): number[][] {
  return m.map((row) => {
    const max = Math.max(...row);
    const shifted = row.map((v) => v - max);
    const logSum = Math.log(shifted.reduce((s, v) => s + Math.exp(v), 0));
    return shifted.map((v) => v - logSum);
  });
}

function similarityLogits(imageEmb: number[][], textEmb: number[][], temperature: number): number[][] {
  const img = normalize(imageEmb);
  const txt = normalize(textEmb);
  return img.map((a) => txt.map((b) => a.reduce((s, v, k) => s + v * b[k], 0) / temperature));
}

function symmetricInfonce(logits: number[][]): number {
  const n = logits.length;
  const rows = logSoftmax(logits);
  const cols = logSoftmax(transpose(logits));
  let lImg = 0;
  let lTxt = 0;
  for (let i = 0; i < n; i++) {
    lImg -= rows[i][i] / n;
    lTxt -= cols[i][i] / n;
  }
  return (lImg + lTxt) / 2;
}

function symmetricInfonceGrad(logits: number[][]): number[][] {
  const n = logits.length;
  const pRows = logSoftmax(logits).map((r) => r.map(Math.exp));
  const pCols = transpose(logSoftmax(transpose(logits)).map((r) => r.map(Math.exp)));
  return logits.map((row, i) => row.map((_, j) => (pRows[i][j] + pCols[i][j] - (i === j ? 2 : 0)) / (2 * n)));
}
`,
  hints: [
    'Math.hypot(...row) gives the length of a row. Divide every entry by it to get a unit row.',
    'The text loss is the image loss applied to the transpose of the logits: each column of S becomes a row of Sᵀ.',
    'Write a log-softmax over each row that subtracts the row maximum first. Its diagonal gives the log probability of each correct match.',
    'The gradient of the image term is (R - I) / N, the text term (C - I) / N, where C is the transpose of the row softmax of Sᵀ. The loss is their mean, so add them and divide by 2.',
  ],
  notes: String.raw`## Why the loss is symmetric

The image term asks each image to find its text among N texts; the text term asks each text to find its image among N images. Both encoders get a gradient from both directions. A random model gives a loss near ln N, because each softmax is close to uniform.

## Why normalize and divide by a temperature

After normalization each entry of ÎT̂ᵀ is a cosine similarity in [-1, 1]. A softmax over that small range is almost flat. Dividing by a small τ, for example 0.07, makes it sharp enough to learn from. CLIP learns log(1/τ) as a parameter and clips it so 1/τ stays at 100 or less.

## The numerical trap

Logits can be large when τ is small. Subtract the maximum before Math.exp in both the row and the column softmax, or exp(1000) becomes Infinity and the loss NaN.

## Where this goes next

Every off-diagonal entry is a negative example, so a larger batch gives more negatives for free. SigLIP replaces the two softmax terms with an independent sigmoid loss per entry of S. Paper: Radford et al., 2021, "Learning Transferable Visual Models From Natural Language Supervision".`,
  tests: (sub, { check, close, ok, rng }) => {
    const I3 = [[1, 0], [0, 2], [1, 1]];
    const T3 = [[2, 0], [1, 1], [0, 3]];
    const S3 = [[2, Math.SQRT2, 0], [0, Math.SQRT2, 2], [Math.SQRT2, 2, Math.SQRT2]];
    const r = rng(7);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const matrix = (n: number, d: number) => Array.from({ length: n }, () => Array.from({ length: d }, gauss));
    const transpose = (m: number[][]) => m[0].map((_, j) => m.map((row) => row[j]));

    check('the similarity logits of three pairs', 'Divide each embedding by its L2 norm. The logits are the image rows dotted with the text rows, divided by the temperature.', () => {
      close(sub.similarityLogits(I3, T3, 0.5), S3, 'the logits', 1e-8);
    });
    check('the symmetric loss and its gradient', 'The loss is the mean of two cross-entropies: the image loss reads each row, the text loss reads each column, and the target is the diagonal.', () => {
      close(sub.symmetricInfonce(S3), 0.9905556060000382, 'the loss', 1e-9);
      close(sub.symmetricInfonceGrad(S3), [[-0.13632819, 0.09873442, 0.02666175], [0.02666175, -0.23459891, 0.19700514], [0.09873442, 0.15772852, -0.23459891]], 'the gradient', 1e-6);
    });
    check('equal logits give ln N', 'When all logits are equal each softmax is uniform over N items, so both cross-entropies are ln N.', () => {
      close(sub.symmetricInfonce([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]), Math.log(4), 'the loss for N = 4', 1e-12);
    });
    check('the loss is symmetric in the two modalities', 'Swap the image and text embeddings: the logits become the transpose and the loss does not change.', () => {
      const img = matrix(6, 5);
      const txt = matrix(6, 5);
      const a: number[][] = sub.similarityLogits(img, txt, 0.1);
      close(sub.similarityLogits(txt, img, 0.1), transpose(a), 'the logits with the modalities swapped', 1e-12);
      close(sub.symmetricInfonce(transpose(a)), sub.symmetricInfonce(a), 'the loss of the transposed logits', 1e-12);
    });
    check('the logits do not depend on the length of an embedding', 'Normalize each embedding first. Then each logit is a cosine similarity divided by the temperature, at most 1 / temperature.', () => {
      const img = matrix(4, 3);
      const txt = matrix(4, 3);
      const scales = [0.1, 3, 50, 1];
      const base: number[][] = sub.similarityLogits(img, txt, 0.07);
      const scaled = sub.similarityLogits(img.map((row, i) => row.map((v) => v * scales[i])), txt.map((row, i) => row.map((v) => v * scales[3 - i])), 0.07);
      close(scaled, base, 'the logits of rescaled embeddings', 1e-10);
      ok(base.flat().every((v) => Math.abs(v) <= 1 / 0.07 + 1e-9), 'a logit is larger than 1 / temperature');
    });
    check('matched pairs give a lower loss than shuffled pairs', 'When each text matches its image the diagonal is large and the loss small. A wrong pairing moves the large values off the diagonal and the loss grows.', () => {
      const img = matrix(8, 16);
      const txt = img.map((row) => row.map((v) => v + 0.1 * gauss()));
      const matched: number = sub.symmetricInfonce(sub.similarityLogits(img, txt, 0.1));
      const shuffled: number = sub.symmetricInfonce(sub.similarityLogits(img, txt.map((_, i) => txt[(i + 7) % 8]), 0.1));
      ok(matched < 0.5, `the loss of well matched pairs should be below 0.5, got ${matched}`);
      ok(shuffled > matched + 1, `a wrong pairing should raise the loss by more than 1, got ${matched} → ${shuffled}`);
    });
    check('the gradient matches finite differences', 'The gradient of each cross-entropy is its softmax minus the one-hot target; the text term uses the column softmax. Average the two terms and divide by N.', () => {
      const logits = matrix(5, 5).map((row) => row.map((v) => 2 * v));
      const grad: number[][] = sub.symmetricInfonceGrad(logits);
      const eps = 1e-6;
      const numeric = logits.map((row, i) =>
        row.map((_, j) => {
          const plus = logits.map((rr, a) => rr.map((v, b) => (a === i && b === j ? v + eps : v)));
          const minus = logits.map((rr, a) => rr.map((v, b) => (a === i && b === j ? v - eps : v)));
          return (sub.symmetricInfonce(plus) - sub.symmetricInfonce(minus)) / (2 * eps);
        }),
      );
      close(grad, numeric, 'the gradient', 1e-5);
      close(grad.flat().reduce((s, v) => s + v, 0), 0, 'the sum of all gradient entries', 1e-12);
    });
    check('the inputs are not changed', 'The functions must not write into the embeddings or the logits.', () => {
      const img = matrix(3, 4);
      const txt = matrix(3, 4);
      const logits = matrix(3, 3);
      const before = JSON.stringify([img, txt, logits]);
      sub.similarityLogits(img, txt, 0.5);
      sub.symmetricInfonce(logits);
      sub.symmetricInfonceGrad(logits);
      ok(JSON.stringify([img, txt, logits]) === before, 'a function changed its input arrays');
    });
    check('one pair', 'With N = 1 each softmax has one item, so the loss is 0 and the gradient is 0.', () => {
      const logits = sub.similarityLogits([[3, 4]], [[1, 0]], 0.2);
      close(logits, [[3]], 'the logits', 1e-12);
      close(sub.symmetricInfonce(logits), 0, 'the loss', 1e-12);
      close(sub.symmetricInfonceGrad(logits), [[0]], 'the gradient', 1e-12);
    });
    check('large logits do not overflow', 'Math.exp(1000) is Infinity. Use a log-softmax that subtracts the maximum of each row and of each column.', () => {
      close(sub.symmetricInfonce([[1000, 0], [0, 1000]]), 0, 'the loss of a confident correct batch', 1e-12);
      close(sub.symmetricInfonce([[0, 1000], [0, 0]]), 500.34657359027995, 'the loss with one large wrong logit', 1e-12);
      const grad: number[][] = sub.symmetricInfonceGrad([[0, 1000], [0, 0]]);
      ok(grad.flat().every(Number.isFinite), `the gradient has NaN or infinite values: ${JSON.stringify(grad)}`);
    });
    check('logits, loss and gradient match the reference', 'Your functions agree with the reference solution on random batches (N = 2, τ = 1 and N = 6, τ = 0.5).', () => {
      close(
        sub.similarityLogits(
          [[0.30471707975443135, -1.0399841062404955, 0.7504511958064572], [0.9405647163912139, -1.9510351886538364, -1.302179506862318]],
          [[0.12784040316728537, -0.3162425923435822, -0.016801157504288795], [-0.85304392757358, 0.8793979748628286, 0.7777919354289483]],
          1,
        ),
        [[0.7890888678868222, -0.3088445336341481], [0.8795339898189298, -0.9627514638616306]],
        'the logits for N = 2',
        1e-9,
      );
      const S = [
        [1.531673897686934, -1.7202404529445603, 0.5589075145851521, 0.9045980905471438, -1.042839849127578, 0.4835067832785499],
        [1.585841841175861, 0.20666973454672943, -0.6616169648423524, -1.2043727889875666, 0.3633186940712641, 1.1170446150013127],
        [0.31411237012521037, -1.2995748931972013, -0.12563350282213684, 1.3628602322159633, -1.4425905084601773, -0.6378013657743374],
        [0.9795038142272005, 0.5222806486230905, 0.7887663769017673, -1.140723437481372, 1.0040716718249243, 1.4377919541896431],
        [1.53085348294232, -0.10060802624646896, 0.4819535625867902, -0.4930440049651604, -0.008833151869389004, 1.2159113801457482],
        [0.5144505735796047, -0.33414863642108633, 1.0938151065401631, 0.202552228328416, 1.386959943085014, -0.28034045223595955],
      ];
      close(sub.symmetricInfonce(S), 2.328795391934002, 'the loss for N = 6', 1e-9);
      close(
        sub.symmetricInfonceGrad(S),
        [
          [-0.11218449702003896, 0.004347664739105034, 0.027892480590425758, 0.04203270038079796, 0.00568275663431899, 0.02226389241993518],
          [0.05614158102678595, -0.1371515389848518, 0.008085284744682775, 0.0050168825946036765, 0.02278269511743054, 0.04109180721986888],
          [0.021606184047773504, 0.00771316160425653, -0.14906829356872076, 0.0821137182122806, 0.004756503472724129, 0.009370874226646517],
          [0.02725800046159299, 0.03834203937408018, 0.031706425440999775, -0.16172311456380264, 0.039797470920697325, 0.05131998117828277],
          [0.051195422651665566, 0.021326779628521614, 0.024690783502432274, 0.009961200147003463, -0.15138024136854192, 0.043944434275300585],
          [0.019300919997964513, 0.017216059246957908, 0.04690713826007364, 0.020537558479927935, 0.06358039253038376, -0.15647510762156422],
        ],
        'the gradient for N = 6',
        1e-8,
      );
    });
  },
};

export default drill;
