// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/bm25/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // a repeated query term counts once
  dedup_query: [['for (const term of query)', 'for (const term of new Set(query))']],
  // n counts every occurrence, not documents
  df_counts_occurrences: [['corpus.filter((doc) => doc.includes(term)).length', 'corpus.reduce((s, doc) => s + doc.filter((t) => t === term).length, 0)']],
  // idf without the 1 + (negative for common terms)
  idf_without_one: [['Math.log(1 + (corpus.length', 'Math.log((corpus.length']],
  no_k1_plus_one: [['const num = f * (k1 + 1);', 'const num = f;']],
  no_length_norm: [['const den = f + k1 * (1 - b + (b * doc.length) / avgDl);', 'const den = f + k1;']],
  ties_high_index: [['scores[j] - scores[i] || i - j', 'scores[j] - scores[i] || j - i']],
};

export default mutants;
