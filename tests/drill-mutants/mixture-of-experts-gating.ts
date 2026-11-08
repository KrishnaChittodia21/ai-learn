// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/mixture-of-experts-gating/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  fraction_from_probs: [["const f = counts.map((c) => c / (T * topK));", "const f = counts.map((_, i) => logits.map(softmaxRow).reduce((s, p) => s + p[i], 0) / T);"]],
  fraction_over_tokens: [["c / (T * topK)", "c / T"]],
  no_expert_scale: [["return E * f.reduce", "return f.reduce"]],
  no_max_shift: [["const m = Math.max(...z);", "const m = 0;"]],
  softmax_over_all: [["softmaxRow(idx.map((i) => logits[t][i]))", "idx.map((i) => softmaxRow(logits[t])[i])"]],
  ties_to_higher_index: [["|| a - b", "|| b - a"]],
};

export default mutants;
