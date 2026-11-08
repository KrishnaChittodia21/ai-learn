// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/clip-contrastive-loss/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // adds the two gradient terms and divides by N, not 2N
  grad_no_half: [['/ (2 * n))', '/ n)']],
  // row softmax used for the text term too
  grad_rows_twice: [['const pCols = transpose(logSoftmax(transpose(logits)).map((r) => r.map(Math.exp)));', 'const pCols = logSoftmax(logits).map((r) => r.map(Math.exp));']],
  image_loss_only: [['return (lImg + lTxt) / 2;', 'return lImg;']],
  // exp on raw logits overflows
  no_max_shift: [['const max = Math.max(...row);', 'const max = 0;']],
  no_normalize: [
    ['const img = normalize(imageEmb);', 'const img = imageEmb;'],
    ['const txt = normalize(textEmb);', 'const txt = textEmb;'],
  ],
  times_temperature: [['/ temperature));', '* temperature));']],
};

export default mutants;
