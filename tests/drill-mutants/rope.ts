// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/rope/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  exponent_i_over_d: [["base ** ((-2 * i) / d)", "base ** (-i / d)"]],
  half_split_pairs: [["const a = row[2 * i];", "const a = row[i];"], ["const b = row[2 * i + 1];", "const b = row[i + freqs.length];"], ["out[2 * i] = a", "out[i] = a"], ["out[2 * i + 1] = a", "out[i + freqs.length] = a"]],
  // the source slices [0::2] for an odd d; in TypeScript the same mistake is one pair too many
  odd_dim_unhandled: [["length: Math.floor(d / 2)", "length: Math.ceil(d / 2)"]],
  rotates_backwards: [["a * Math.cos(phi) - b * Math.sin(phi)", "a * Math.cos(phi) + b * Math.sin(phi)"], ["a * Math.sin(phi) + b * Math.cos(phi)", "-a * Math.sin(phi) + b * Math.cos(phi)"]],
  writes_input: [["const out = row.slice();", "const out = row;"]],
};

export default mutants;
