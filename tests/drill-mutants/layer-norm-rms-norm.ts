// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/layer-norm-rms-norm/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  ignores_eps_argument: [["Math.sqrt(variance + eps)", "Math.sqrt(variance + 1e-5)"]],
  mean_over_batch_axis: [["((v - mu) / denom)", "((v - mean(x.map((r) => r[j]))) / denom)"]],
  rms_eps_outside_sqrt: [["Math.sqrt(mean(row.map((v) => v * v)) + eps)", "Math.sqrt(mean(row.map((v) => v * v))) + eps"]],
  rms_subtracts_mean: [["mean(row.map((v) => v * v))", "mean(row.map((v) => (v - mean(row)) ** 2))"]],
  unbiased_variance: [["const variance = mean(row.map((v) => (v - mu) ** 2));", "const variance = row.reduce((s, v) => s + (v - mu) ** 2, 0) / (row.length - 1);"]],
};

export default mutants;
