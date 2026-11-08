// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/scaled-dot-product-attention/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // the source mutant reverses every axis of a batched K (K.T); with 2D inputs its intent is "the wrong transpose": Q·K, not Q·Kᵀ
  batched_transpose: [['s + x * K[j][d]', 's + x * (K[d]?.[j] ?? 0)']],
  // each token also blocks itself, so the first row has no allowed key
  causal_includes_diagonal: [['(_, j) => j > i)', '(_, j) => j >= i)']],
  // blocked weights zeroed after the softmax, so rows no longer sum to 1
  mask_after_softmax: [
    ['if (mask) scores = scores.map((s, j) => (mask[i][j] ? -Infinity : s));\n', ''],
    ['return exps.map((e) => e / sum);', 'return exps.map((e, j) => (mask?.[i][j] ? 0 : e / sum));'],
  ],
  no_max_shift: [['const m = Math.max(...scores);', 'const m = 0;']],
  no_scale: [['0) / Math.sqrt(dk));', '0));']],
  scale_by_dk: [['0) / Math.sqrt(dk));', '0) / dk);']],
};

export default mutants;
