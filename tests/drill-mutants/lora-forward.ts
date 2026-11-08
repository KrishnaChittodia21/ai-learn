// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/lora-forward/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  alpha_not_divided: [["const scaling = alpha / A.length;\n  const base", "const scaling = alpha;\n  const base"]],
  count_product: [["rank * inFeatures + outFeatures * rank", "rank * inFeatures * outFeatures"]],
  merge_in_place: [["(w, i) => w + scaling * B[o].reduce((s, bv, k) => s + bv * A[k][i], 0)));", "(w, i) => (row[i] = w + scaling * B[o].reduce((s, bv, k) => s + bv * A[k][i], 0))));"]],
  rank_from_w: [["const scaling = alpha / A.length;\n  const base", "const scaling = alpha / W.length;\n  const base"]],
  rank_over_alpha: [["const scaling = alpha / A.length;\n  return W.map", "const scaling = A.length / alpha;\n  return W.map"]],
};

export default mutants;
