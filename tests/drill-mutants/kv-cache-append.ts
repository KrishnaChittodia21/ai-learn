// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/kv-cache-append/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  capacity_off_by_one: [["if (length + n > maxLen)", "if (length + n >= maxLen)"]],
  count_before_check: [["      length += n;\n", ""], ["if (length + n > maxLen) throw new Error('the cache is full');", "length += n;\n      if (length > maxLen) throw new Error('the cache is full');"]],
  full_buffer_view: [["keys: () => K.slice(0, length)", "keys: () => K.slice()"], ["values: () => V.slice(0, length)", "values: () => V.slice()"]],
  length_plus_one: [["length += n;", "length += 1;"]],
  no_scale: [[" / Math.sqrt(q.length)", ""]],
  overwrite_from_zero: [["(K[length + i] = r)", "(K[i] = r)"], ["(V[length + i] = r)", "(V[i] = r)"]],
  // not in the source (numpy copies on assignment): keeps references to the caller's rows
  no_copy: [[").map((r) => r.slice());\n  return {", ");\n  return {"]],
};

export default mutants;
