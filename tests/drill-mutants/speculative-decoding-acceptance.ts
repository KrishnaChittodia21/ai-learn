// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/speculative-decoding-acceptance/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // accepts with min(1, q / p): draft over target
  accept_ratio_inverted: [['Math.min(1, p / q)', 'Math.min(1, q / p)']],
  // alpha as the mean of min(1, p / q) over the vocabulary
  alpha_unweighted: [['return target.reduce((s, p, x) => s + Math.min(p, draft[x]), 0);', 'return target.reduce((s, p, x) => s + Math.min(1, p / draft[x]), 0) / target.length;']],
  // forgets the bonus token: alpha ** gamma
  expected_tokens_off_by_one: [['alpha ** (gamma + 1)', 'alpha ** gamma']],
  no_bonus_token: [['  out.push(sample(targetProbs[draftTokens.length], rand));\n', '']],
  residual_from_target: [['const residual = residualDistribution(targetProbs[i], draftProbs[i]);', 'const residual = targetProbs[i];']],
  residual_not_clipped: [['Math.max(0, p - draft[x])', 'Math.abs(p - draft[x])']],
};

export default mutants;
