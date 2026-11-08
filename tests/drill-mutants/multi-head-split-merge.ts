// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/multi-head-split-merge/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  no_max_shift: [["const m = Math.max(...scores);", "const m = 0;"]],
  no_output_projection: [["matMul(mergeHeads(outs), wO)", "mergeHeads(outs)"]],
  // a flat reshape of (T, D) straight to (H, T, dHead), with no transpose
  reshape_no_transpose: [["x[t][h * dh + j]", "x.flat()[(h * T + t) * dh + j]"]],
  scale_by_d_model: [["Math.sqrt(dh)", "Math.sqrt(x[0].length)"]],
  // softmax over the queries (columns) of each head, not over the keys (rows)
  softmax_wrong_axis: [["qh.map((qi) => softmaxRow(k[h].map((kj) => qi.reduce((s, a, d) => s + a * kj[d], 0)", "k[h].map((kj) => softmaxRow(qh.map((qi) => qi.reduce((s, a, d) => s + a * kj[d], 0)"], ["const outs = weights.map(", "weights.forEach((wh, h) => (weights[h] = wh[0].map((_, i) => wh.map((row) => row[i]))));\n  const outs = weights.map("]],
  strided_heads: [["x[t][h * dh + j]", "x[t][j * H + h]"]],
};

export default mutants;
