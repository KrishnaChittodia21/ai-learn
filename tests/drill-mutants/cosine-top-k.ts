// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/cosine-top-k/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // norms over columns, not rows
  column_norm: [
    [
      'const norm = Math.sqrt(row.reduce((s, x) => s + x * x, 0));\n    return norm > 0 ? row.map((x) => x / norm) : row.map(() => 0);',
      'return row.map((x, j) => {\n      const norm = Math.sqrt(X.reduce((s, r) => s + r[j] * r[j], 0));\n      return norm > 0 ? x / norm : 0;\n    });',
    ],
  ],
  // divides the caller's rows in place
  in_place_normalize: [['row.map((x) => x / norm)', 'row.map((x, j) => (row[j] = x / norm))']],
  // a zero vector gives NaN
  no_zero_guard: [['norm > 0 ? row.map((x) => x / norm) : row.map(() => 0)', 'row.map((x) => x / norm)']],
  // equal scores put the higher index first
  reversed_ties: [['row[b] - row[a] || a - b', 'row[b] - row[a] || b - a']],
  // drops the best match, as if removing a self match
  skip_first: [['.slice(0, k)', '.slice(1, k + 1)']],
};

export default mutants;
