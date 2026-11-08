// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/bpe-merge-step/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // keeps the first pair with the highest count (insertion order), not the smallest
  first_seen_tie: [['if (c > bestCount || (c === bestCount && best !== null && (a < best[0] || (a === best[0] && b < best[1]))))', 'if (c > bestCount)']],
  // refills the caller's corpus array
  mutates_input: [['units = [...merged.values()];', 'units.splice(0, units.length, ...merged.values());']],
  // merges pairs that occur only once
  no_min_count: [["if (best === null || (pairs.get(best.join(',')) ?? 0) < 2) break;", 'if (best === null) break;']],
  // moves one position after a match, so merges overlap
  overlapping_merge: [['i += 2;', 'i += 1;']],
  // adds 1 per pair, ignoring the word frequency
  unweighted_counts: [['(pairs.get(key) ?? 0) + count', '(pairs.get(key) ?? 0) + 1']],
};

export default mutants;
