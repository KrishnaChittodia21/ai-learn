// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/softmax-cross-entropy/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // max and sum over the whole batch, not each row; loss as log of softmax
  global_max: [
    ['const m = Math.max(...row);\n    const exps = row.map((z) => Math.exp(z - m));\n    const sum = exps.reduce((a, b) => a + b, 0);', 'const m = Math.max(...logits.flat());\n    const exps = row.map((z) => Math.exp(z - m));\n    const sum = logits.flat().reduce((a, z) => a + Math.exp(z - m), 0);'],
    ['total -= row[targets[i]] - m - logSum;', 'total -= Math.log(softmax(logits)[i][targets[i]]);'],
  ],
  grad_missing_onehot: [['(v - (j === targets[i] ? 1 : 0)) / logits.length', 'v / logits.length']],
  // shifts the caller's logits in place
  in_place_shift: [['const exps = row.map((z) => Math.exp(z - m));', 'row.forEach((z, j) => (row[j] = z - m));\n    const exps = row.map((z) => Math.exp(z));']],
  // exp of the raw logits, loss as log of softmax
  no_max_shift: [
    ['const m = Math.max(...row);\n    const exps', 'const m = 0;\n    const exps'],
    ['total -= row[targets[i]] - m - logSum;', 'total -= Math.log(softmax(logits)[i][targets[i]]);'],
  ],
  sum_not_mean: [
    ['return total / logits.length;', 'return total;'],
    ['(v - (j === targets[i] ? 1 : 0)) / logits.length', 'v - (j === targets[i] ? 1 : 0)'],
  ],
};

export default mutants;
