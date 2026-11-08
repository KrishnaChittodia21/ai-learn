// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/int8-quantization/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  columns_not_rows: [["const scales = tensor.map(scaleOf);", "const scales = tensor.map((_, i) => scaleOf(tensor.map((r) => r[i % r.length])));"]],
  max_not_absmax: [["Math.max(...values.map(Math.abs))", "Math.max(...values)"]],
  round_half_up: [["roundEven(x / scale)", "Math.round(x / scale)"]],
  scale_by_128: [["absMax / QMAX", "absMax / 128"]],
  truncate_per_row: [["quantizeRow(row, scales[i])", "row.map((x) => Math.trunc(x / scales[i]))"]],
  zero_row_divides: [["absMax > 0 ? absMax / QMAX : 1", "absMax / QMAX"]],
};

export default mutants;
