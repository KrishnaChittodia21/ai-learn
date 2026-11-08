// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/top-k-top-p-sampling/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // writes -Infinity into the caller's logits in topKFilter
  in_place_filter: [['return keepOnly(logits, order.slice(0, k));', 'for (const i of order.slice(k)) logits[i] = -Infinity;\n  return logits;']],
  sample_ignores_temperature: [['samplingProbs(logits, temperature, topK, topP);', 'samplingProbs(logits, 1, topK, topP);']],
  // temperature applied after the filters, so top-p cuts at temperature 1
  temperature_after_filters: [
    ['let scaled = logits.map((z) => z / temperature);', 'let scaled = [...logits];'],
    ['return softmax(scaled);\n}\n\nfunction sample', 'return softmax(scaled.map((z) => z / temperature));\n}\n\nfunction sample'],
  ],
  top_k_ties_high_index: [['logits[j] - logits[i] || i - j', 'logits[j] - logits[i] || j - i']],
  // drops the token that makes the sum reach p (keeps at least one)
  top_p_drops_crossing: [['cutoff = i + 1;', 'cutoff = Math.max(i, 1);']],
  // cumulative sum in vocabulary order, not by probability
  top_p_vocab_order: [['const order = probs.map((_, i) => i).sort((i, j) => probs[j] - probs[i] || i - j);', 'const order = probs.map((_, i) => i);']],
};

export default mutants;
