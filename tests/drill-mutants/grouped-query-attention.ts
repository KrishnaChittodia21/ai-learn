// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/grouped-query-attention/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  no_divisibility_check: [["if (nHeads % nKvHeads !== 0) throw new Error('nHeads must be a multiple of nKvHeads');", ""]],
  pool_sum_not_mean: [["return sum / r;", "return sum;"]],
  pool_wrong_grouping: [["row[(g * r + i) * dh + j]", "row[(g + i * nKvHeads) * dh + j]"]],
  scale_by_d_model: [["Math.sqrt(dh)", "Math.sqrt(x[0].length)"]],
  tile_not_repeat: [["kv[Math.floor(h / r)]", "kv[h % kv.length]"]],
};

export default mutants;
