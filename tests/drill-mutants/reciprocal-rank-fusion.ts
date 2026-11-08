// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/reciprocal-rank-fusion/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // sorts by score only: ties keep first-appearance order
  first_appearance_ties: [['b[1] - a[1] || a[0] - b[0]', 'b[1] - a[1]']],
  // every list counts 1, weights ignored
  ignore_weights: [['w[i] * (1 / (k + rank))', '1 / (k + rank)']],
  // no error when weights and lists differ in length
  no_length_check: [["if (w.length !== rankings.length) throw new Error('weights length must match rankings length');", '']],
  // ranks from 0: the first document adds 1 / k
  rank_from_zero: [['const rank = r + 1;', 'const rank = r;']],
};

export default mutants;
