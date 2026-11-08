import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'tool-call-parser',
  entry: ['parseToolCalls', 'validateArgs', 'checkReply'],
  problem: `An agent sends tool schemas to a model and gets tool calls back. The arguments in a reply can have the wrong types, missing fields or extra keys. Before the agent runs a tool, it must parse each call and validate its arguments. Errors with exact paths let the model fix the call in one more turn.

## Task

Write three functions (built-ins only: \`JSON.parse\`, \`JSON.stringify\`).

1. \`parseToolCalls(replyText)\` parses the raw JSON body of a chat completion reply. The calls are in \`body.choices[0].message.tool_calls\`. Each call has an \`id\` and a \`function\` with a \`name\` and an \`arguments\` field. **\`arguments\` is a JSON string, not an object.** Return one \`{ id, name, arguments }\` per call, in reply order, where \`arguments\` is the decoded object.
   - If \`tool_calls\` is missing or \`null\`, return \`[]\`.
   - If \`arguments\` is an empty or blank string, the arguments are \`{}\`.
   - If \`arguments\` is not valid JSON, or does not decode to a JSON object, **throw an Error**.
2. \`validateArgs(schema, args)\` checks a value against a JSON Schema subset and returns a list of error strings. An empty list means valid.
3. \`checkReply(replyText, schemas)\` parses the reply and returns one pair \`[id, errors]\` per call, in reply order. \`schemas\` maps a tool name to its schema. For a name not in \`schemas\`, the errors are \`["/: unknown tool <name>"]\`.

The schema subset has \`type\`, \`properties\`, \`required\`, \`enum\`, \`additionalProperties\` and \`items\`. A type is one of \`object\`, \`array\`, \`string\`, \`integer\`, \`number\`, \`boolean\` and \`null\`. The JSON type of a value:

| Value | JSON type |
|---|---|
| \`null\` | \`null\` (careful: \`typeof null\` is \`'object'\`) |
| \`true\`, \`false\` | \`boolean\` |
| a whole number (\`Number.isInteger\`) | \`integer\` |
| any other number | \`number\` |
| a string | \`string\` |
| an array | \`array\` (careful: \`typeof []\` is \`'object'\`) |
| any other object | \`object\` |

The type \`integer\` matches the JSON type \`integer\` only. The type \`number\` matches \`integer\` and \`number\`. A boolean never matches \`integer\` or \`number\`.

Check one value at a path with these steps, **in this order**:

1. If the schema has \`type\` and the value does not match, add \`<path>: expected <type>, got <json type>\`. Stop: do not check the children.
2. If the schema has \`enum\` and the value is not in it (compare with \`JSON.stringify\`), add \`<path>: value <JSON.stringify(value)> is not in <JSON.stringify(enum)>\`. Stop.
3. If the type is \`object\`:
   1. For each name in \`required\`, in list order, that is not a key of the value, add \`<path>/<name>: missing required property\`.
   2. Then for each key of the value, in \`Object.entries\` order: if the key is in \`properties\`, check the child at \`<path>/<key>\`. Else, if \`additionalProperties\` is \`false\`, add \`<path>/<key>: unexpected property\`. Without \`additionalProperties: false\`, extra keys are allowed.
4. If the type is \`array\` and the schema has \`items\`, check each element at \`<path>/<index>\`.

A path is a JSON pointer. The root has the path \`/\`; its child \`city\` is \`/city\`, and a child of \`/lines\` is \`/lines/0\`. In a segment, replace \`~\` with \`~0\` first, then \`/\` with \`~1\`.

## Constraints

- Schemas nest at most 5 levels deep. Do not change the schema or the arguments.

## Examples

\`\`\`ts
const WEATHER = {
  type: 'object',
  properties: { city: { type: 'string' }, units: { type: 'string', enum: ['celsius', 'fahrenheit'] } },
  required: ['city', 'units'],
  additionalProperties: false,
};
// a reply whose two calls have arguments '{"city":"Bengaluru","units":"celsius"}' and '{"city":42,"units":"kelvin","days":3}'
checkReply(REPLY, { get_weather: WEATHER });
// [['call_abc123', []],
//  ['call_def456', ['/city: expected string, got integer',
//                   '/units: value "kelvin" is not in ["celsius","fahrenheit"]',
//                   '/days: unexpected property']]]

validateArgs({ type: 'object', properties: { id: { type: 'integer' } }, additionalProperties: false }, { id: true, 'extra/x': 1 });
// ['/id: expected integer, got boolean', '/extra~1x: unexpected property']
\`\`\``,
  starter: `type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; enum?: Json[]; additionalProperties?: boolean; items?: Schema };

function parseToolCalls(replyText: string): { id: string; name: string; arguments: Record<string, Json> }[] {
  throw new Error('not implemented');
}

function validateArgs(schema: Schema, args: Json): string[] {
  throw new Error('not implemented');
}

function checkReply(replyText: string, schemas: Record<string, Schema>): [string, string[]][] {
  throw new Error('not implemented');
}
`,
  solution: `type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; enum?: Json[]; additionalProperties?: boolean; items?: Schema };

function parseToolCalls(replyText: string): { id: string; name: string; arguments: Record<string, Json> }[] {
  const body = JSON.parse(replyText);
  const calls = [];
  for (const tc of body.choices[0].message.tool_calls ?? []) {
    const raw: string = tc.function.arguments ?? '';
    const args = raw.trim() ? JSON.parse(raw) : {};
    if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error(\`arguments of call \${tc.id} must be a JSON object\`);
    calls.push({ id: tc.id, name: tc.function.name, arguments: args });
  }
  return calls;
}

function jsonType(value: Json): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(value: Json, expected: string): boolean {
  const actual = jsonType(value);
  if (expected === 'number') return actual === 'integer' || actual === 'number';
  return actual === expected;
}

function childPath(path: string, segment: string | number): string {
  return \`\${path}/\${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}\`;
}

function walk(schema: Schema, value: Json, path: string, errors: string[]): void {
  const shown = path || '/';
  const expected = schema.type;
  if (expected !== undefined && !typeMatches(value, expected)) {
    errors.push(\`\${shown}: expected \${expected}, got \${jsonType(value)}\`);
    return;
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(\`\${shown}: value \${JSON.stringify(value)} is not in \${JSON.stringify(schema.enum)}\`);
    return;
  }
  if (expected === 'object') {
    const obj = value as Record<string, Json>;
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(obj, name)) errors.push(\`\${childPath(path, name)}: missing required property\`);
    }
    const props = schema.properties ?? {};
    for (const [key, item] of Object.entries(obj)) {
      if (Object.hasOwn(props, key)) walk(props[key], item, childPath(path, key), errors);
      else if (schema.additionalProperties === false) errors.push(\`\${childPath(path, key)}: unexpected property\`);
    }
  } else if (expected === 'array' && schema.items) {
    (value as Json[]).forEach((item, index) => walk(schema.items!, item, childPath(path, index), errors));
  }
}

function validateArgs(schema: Schema, args: Json): string[] {
  const errors: string[] = [];
  walk(schema, args, '', errors);
  return errors;
}

function checkReply(replyText: string, schemas: Record<string, Schema>): [string, string[]][] {
  return parseToolCalls(replyText).map((call) =>
    Object.hasOwn(schemas, call.name) ? [call.id, validateArgs(schemas[call.name], call.arguments)] : [call.id, [\`/: unknown tool \${call.name}\`]],
  );
}
`,
  hints: [
    "The reply is JSON text, and each arguments field inside it is JSON text too. Call JSON.parse on the body, then again on each arguments string.",
    "Write one recursive walk(schema, value, path, errors) that pushes into the list and returns nothing. validateArgs starts it at the empty path and shows the empty path as \"/\".",
    "Name the JSON type carefully: check null and Array.isArray before typeof, because typeof null and typeof [] are both \"object\".",
    "Return right after a type error or an enum error. For an object, finish the required loop before you walk the keys. Escape ~ before / in a path segment, or the ~ of ~1 changes again.",
  ],
  notes: `## Why the arguments are a string

OpenAI-style APIs send \`arguments\` as a JSON string, so the provider can stream them token by token. The cost is a second JSON.parse, and that call fails when the model writes bad JSON. A parser that throws lets the agent send the error back to the model.

## Why paths and a fixed order

JSON pointer paths help: a model fixes \`/lines/1/qty: expected integer, got number\` faster than a sentence. A fixed error order makes the output the same on each run, so a test can compare it and a retry loop can see when the model makes no progress.

## The type trap

In JavaScript \`typeof null\` and \`typeof []\` are both \`'object'\`, and every number is one type. JSON Schema keeps null, array, object, integer and number apart, so the validator must too. (The Python original has the mirror trap: \`bool\` is a subclass of \`int\`.)

## Where this goes next

A real registry adds \`minLength\`, \`maxLength\`, \`pattern\` and \`$ref\`. MCP servers validate tool input with the same kind of schema before they run the tool.`,
  tests: (sub, { check, equal, ok, rng }) => {
    const WEATHER = {
      type: 'object',
      properties: { city: { type: 'string' }, units: { type: 'string', enum: ['celsius', 'fahrenheit'] } },
      required: ['city', 'units'],
      additionalProperties: false,
    };
    const USER = {
      type: 'object',
      required: ['id', 'tags'],
      properties: {
        id: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string', enum: ['a', 'b'] } },
        score: { type: 'number' },
        active: { type: 'boolean' },
      },
      additionalProperties: false,
    };
    const ORDER = {
      type: 'object',
      required: ['customer', 'lines'],
      properties: {
        customer: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, vip: { type: 'boolean' } }, additionalProperties: false },
        lines: {
          type: 'array',
          items: { type: 'object', required: ['sku', 'qty'], properties: { sku: { type: 'string' }, qty: { type: 'integer' }, note: { type: 'string' } } },
        },
        priority: { type: 'string', enum: ['low', 'high'] },
      },
      additionalProperties: false,
    };
    const reply = (calls: [string, string, string][] | null, content: string | null = null) =>
      JSON.stringify({
        choices: [
          {
            message: { role: 'assistant', content, ...(calls && { tool_calls: calls.map(([id, name, args]) => ({ id, type: 'function', function: { name, arguments: args } })) }) },
            finish_reason: 'tool_calls',
          },
        ],
      });
    const REPLY = reply([
      ['call_abc123', 'get_weather', '{"city":"Bengaluru","units":"celsius"}'],
      ['call_def456', 'get_weather', '{"city":42,"units":"kelvin","days":3}'],
    ]);
    const throwsOn = (text: string) => {
      try {
        sub.parseToolCalls(text);
      } catch {
        return true;
      }
      return false;
    };

    check('parse a reply with two tool calls', 'Decode the reply body with JSON.parse. Each arguments field is a JSON string, so decode it a second time.', () => {
      equal(
        sub.parseToolCalls(REPLY),
        [
          { id: 'call_abc123', name: 'get_weather', arguments: { city: 'Bengaluru', units: 'celsius' } },
          { id: 'call_def456', name: 'get_weather', arguments: { city: 42, units: 'kelvin', days: 3 } },
        ],
        'the parsed calls',
      );
    });
    check('check every call of the reply', 'checkReply validates each call against the schema of its tool and keeps the order of the calls.', () => {
      equal(
        sub.checkReply(REPLY, { get_weather: WEATHER }),
        [
          ['call_abc123', []],
          ['call_def456', ['/city: expected string, got integer', '/units: value "kelvin" is not in ["celsius","fahrenheit"]', '/days: unexpected property']],
        ],
        'the result of checkReply',
      );
    });
    check('errors for a bad user record', 'true is a boolean, not an integer. Array items get their index in the path. A slash in a key becomes ~1 in the path.', () => {
      equal(
        sub.validateArgs(USER, { id: true, tags: ['a', 'c', 3], score: 1, 'extra/x': 1, active: 1 }),
        ['/id: expected integer, got boolean', '/tags/1: value "c" is not in ["a","b"]', '/tags/2: expected string, got integer', '/extra~1x: unexpected property', '/active: expected boolean, got integer'],
        'the errors',
      );
    });
    check('valid arguments give no errors', 'When every value has the right type and every rule holds, validateArgs returns an empty list.', () => {
      for (const [schema, args] of [
        [WEATHER, { city: 'Pune', units: 'fahrenheit' }],
        [USER, { id: 7, tags: [], score: 2.5, active: false }],
        [USER, { tags: ['b', 'a'], id: -3, score: 4 }],
        [ORDER, { customer: { name: 'Ada', vip: true }, lines: [{ sku: 'x1', qty: 2, note: 'gift', color: 'red' }], priority: 'high' }],
      ] as const)
        equal(sub.validateArgs(schema, args), [], `the errors for ${JSON.stringify(args)}`);
    });
    check('required errors come first, then keys in input order', 'For an object, report missing required properties in the order of the required list, then walk the keys of the value in their input order.', () => {
      equal(
        sub.validateArgs(ORDER, { zeta: 1, lines: [{ qty: '2' }, { sku: 'a', qty: 1.5 }], alpha: 2 }),
        ['/customer: missing required property', '/zeta: unexpected property', '/lines/0/sku: missing required property', '/lines/0/qty: expected integer, got string', '/lines/1/qty: expected integer, got number', '/alpha: unexpected property'],
        'the errors',
      );
    });
    check('a type error stops the walk', 'When the type of a value is wrong, report one error for it and do not check its children. The root path is a single slash.', () => {
      equal(sub.validateArgs(ORDER, ['customer']), ['/: expected object, got array'], 'the errors for a list at the root');
      equal(sub.validateArgs(ORDER, { customer: 'Ada', lines: null }), ['/customer: expected object, got string', '/lines: expected array, got null'], 'the errors for wrong child types');
    });
    check('integer and number rules', 'integer accepts whole numbers only, so 1.5 fails. number accepts any number. Neither accepts true or false, and typeof null is "object" but its JSON type is null.', () => {
      const schema = { type: 'object', properties: { i: { type: 'integer' }, n: { type: 'number' }, o: { type: 'object' } } };
      equal(sub.validateArgs(schema, { i: 1.5, n: 3 }), ['/i: expected integer, got number'], 'the errors for i = 1.5, n = 3');
      equal(sub.validateArgs(schema, { i: false, n: true, o: null }), ['/i: expected integer, got boolean', '/n: expected number, got boolean', '/o: expected object, got null'], 'the errors for booleans and null');
    });
    check('extra keys are allowed without additionalProperties: false', 'Only additionalProperties set to false rejects keys that are not in properties.', () => {
      equal(sub.validateArgs(ORDER, { customer: { name: 'Ada' }, lines: [{ sku: 'a', qty: 1, gift: true }] }), [], 'the errors for an extra key in a line');
    });
    check('pointer escapes for ~ and /', 'In a JSON pointer, ~ becomes ~0 and / becomes ~1. Replace ~ first, or the ~ of ~1 is escaped again.', () => {
      const schema = { type: 'object', required: ['a/b', 'c~d'], properties: {}, additionalProperties: false };
      equal(sub.validateArgs(schema, { 'x~/y': 1 }), ['/a~1b: missing required property', '/c~0d: missing required property', '/x~0~1y: unexpected property'], 'the errors');
    });
    check('no tool calls', 'A reply with tool_calls missing or null holds no calls, so parseToolCalls returns an empty list.', () => {
      equal(sub.parseToolCalls(reply(null, 'Hello')), [], 'the calls when tool_calls is missing');
      equal(sub.parseToolCalls(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hi', tool_calls: null } }] })), [], 'the calls when tool_calls is null');
    });
    check('empty arguments mean no arguments', 'Some providers send an empty string for a call without arguments. Treat an empty or blank string as {}.', () => {
      equal(
        sub.parseToolCalls(reply([['call_1', 'list_notes', ''], ['call_2', 'list_notes', '  ']])),
        [
          { id: 'call_1', name: 'list_notes', arguments: {} },
          { id: 'call_2', name: 'list_notes', arguments: {} },
        ],
        'the parsed calls',
      );
    });
    check('bad arguments throw', 'Arguments that are not valid JSON, or that decode to something other than an object, must throw an Error the agent can send back to the model.', () => {
      equal(sub.parseToolCalls(reply([['call_0', 'get_weather', '{"city": "Pune"}']])).length, 1, 'the number of calls in a valid reply');
      ok(throwsOn(reply([['call_1', 'get_weather', '{"city": "Pune"']])), 'truncated JSON arguments did not throw');
      ok(throwsOn(reply([['call_1', 'get_weather', '[1, 2]']])), 'arguments that decode to an array did not throw');
    });
    check('an unknown tool name', 'checkReply reports a call to a tool that is not in the schemas with the error "/: unknown tool <name>".', () => {
      equal(sub.checkReply(reply([['call_9', 'delete_all', '{}']]), { get_weather: WEATHER }), [['call_9', ['/: unknown tool delete_all']]], 'the result of checkReply');
    });
    check('the inputs are not changed', 'A validator that writes into the schema or the arguments breaks the code that calls it.', () => {
      const schema = JSON.parse(JSON.stringify(ORDER));
      const args = { customer: { name: 3 }, lines: [{ sku: 'a' }], extra: null };
      const before = JSON.stringify([schema, args]);
      sub.validateArgs(schema, args);
      sub.checkReply(reply([['c', 'place_order', JSON.stringify(args)]]), { place_order: schema });
      equal(JSON.stringify([schema, args]), before, 'the schema and arguments after the calls');
    });
    check('parsed arguments validate the same as the original object', 'parseToolCalls must return the decoded arguments unchanged, so validating the parsed call equals validating the object.', () => {
      const r = rng(3);
      const pool = [null, true, false, 0, 3, -2, 1.5, '', 'a', 'low', 'high', [], [1], {}, { name: 'Bo' }];
      const pick = () => pool[Math.floor(r() * pool.length)];
      for (let n = 0; n < 6; n++) {
        const args: Record<string, unknown> = { customer: r() < 0.6 ? { name: 'Ada', vip: pick() } : pick(), lines: [{ sku: pick(), qty: pick() }, { note: pick() }] };
        if (r() < 0.5) args.priority = pick();
        const parsed = sub.parseToolCalls(reply([['call_1', 'place_order', JSON.stringify(args)]]));
        equal(parsed[0].arguments, args, 'the parsed arguments');
        equal(sub.validateArgs(ORDER, parsed[0].arguments), sub.validateArgs(ORDER, args), 'the errors of the parsed arguments');
      }
    });
    check('errors match the reference on random orders', 'Your error strings and their order agree with the reference solution on random nested arguments.', () => {
      const cases: [unknown, string[]][] = [
        [{"customer": {"name": "Ada", "vip": 0}, "lines": [{"sku": true, "qty": "a"}, {"qty": true}, {"sku": {"name": "Bo"}, "qty": "", "note": null}]}, ["/customer/vip: expected boolean, got integer", "/lines/0/sku: expected string, got boolean", "/lines/0/qty: expected integer, got string", "/lines/1/sku: missing required property", "/lines/1/qty: expected integer, got boolean", "/lines/2/sku: expected string, got object", "/lines/2/qty: expected integer, got string", "/lines/2/note: expected string, got null"]],
        [{"customer": {"name": 0, "vip": []}, "lines": [{"sku": "high", "gift": []}, {"qty": [1], "note": 3, "gift": "high"}], "priority": []}, ["/customer/name: expected string, got integer", "/customer/vip: expected boolean, got array", "/lines/0/qty: missing required property", "/lines/1/sku: missing required property", "/lines/1/qty: expected integer, got array", "/lines/1/note: expected string, got integer", "/priority: expected string, got array"]],
        [{"lines": [{"sku": true, "note": true, "gift": {}}, {"sku": "", "note": false, "gift": 1.5}, {"qty": {"name": "Bo"}, "note": true}]}, ["/customer: missing required property", "/lines/0/qty: missing required property", "/lines/0/sku: expected string, got boolean", "/lines/0/note: expected string, got boolean", "/lines/1/qty: missing required property", "/lines/1/note: expected string, got boolean", "/lines/2/sku: missing required property", "/lines/2/qty: expected integer, got object", "/lines/2/note: expected string, got boolean"]],
        [{"customer": {"name": true}, "lines": [{"sku": "x1", "note": true, "gift": "high"}], "priority": []}, ["/customer/name: expected string, got boolean", "/lines/0/qty: missing required property", "/lines/0/note: expected string, got boolean", "/priority: expected string, got array"]]
      ];
      for (const [args, want] of cases) equal(sub.validateArgs(ORDER, args), want, `the errors for ${JSON.stringify(args)}`);
    });
  },
};

export default drill;
