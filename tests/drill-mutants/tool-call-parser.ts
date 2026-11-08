// Wrong solutions for this drill, ported from ai-engineering-from-scratch/practice/tool-call-parser/mutants (MIT, © 2026 Rohit Ghumare).
// Each is a list of [find, replace] edits on the drill's TypeScript solution; tests/drills.test.ts proves the tests reject it.
const mutants: Record<string, [string, string][]> = {
  // a schema without additionalProperties acts as if it were false
  additional_default_false: [['schema.additionalProperties === false', '!schema.additionalProperties']],
  // JS port of bool_is_integer (Python's bool-is-int trap has no JS form): typeof null is 'object', so null is named an object
  null_is_object: [["  if (value === null) return 'null';\n", '']],
  escape_order: [[".replaceAll('~', '~0').replaceAll('/', '~1')", ".replaceAll('/', '~1').replaceAll('~', '~0')"]],
  // keeps checking the children after a type error
  no_return_after_type: [
    ['const expected = schema.type;', 'let expected = schema.type;'],
    ['got ${jsonType(value)}`);\n    return;', 'got ${jsonType(value)}`);\n    expected = jsonType(value);'],
  ],
  required_after_props: [
    ["    for (const name of schema.required ?? []) {\n      if (!Object.hasOwn(obj, name)) errors.push(`${childPath(path, name)}: missing required property`);\n    }\n", ''],
    ['unexpected property`);\n    }\n', "unexpected property`);\n    }\n    for (const name of schema.required ?? []) {\n      if (!Object.hasOwn(obj, name)) errors.push(`${childPath(path, name)}: missing required property`);\n    }\n"],
  ],
  // the arguments string is not decoded
  single_decode: [
    ["const args = raw.trim() ? JSON.parse(raw) : {};", 'const args = tc.function.arguments || {};'],
    ["    if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error(`arguments of call ${tc.id} must be a JSON object`);\n", ''],
  ],
};

export default mutants;
