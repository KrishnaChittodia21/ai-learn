// Pure, deterministic tool-calling round trip (no React, Node-testable).
// The app (your code) sits between the model and the tools: it sends messages + tool schemas, receives tool calls
// (name + JSON arguments + id), validates the arguments against the schema, executes the tool, appends ONE results
// message whose ids match the calls, and calls the model again, until the model answers in plain text or the
// max-iterations guard stops the loop. The 'structured' scenario has no tools at all: the reply itself is
// constrained to a JSON Schema by constrained decoding.
import type { BaseFrame } from '../../core';

export type ScenarioId = 'happy' | 'parallel' | 'violation' | 'structured';

export interface Params {
  scenario: ScenarioId;
  /** max model calls the loop may make */
  maxIterations: number;
}

export const DEFAULT_PARAMS: Params = { scenario: 'happy', maxIterations: 5 };
export const MIN_ITER = 2;
export const MAX_ITER = 6;

export type Lane = 'model' | 'app' | 'tool';
export type MsgKind = 'system' | 'user' | 'tool_call' | 'tool_result' | 'text' | 'json';

export interface Msg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  kind: MsgKind;
  text: string;
  /** tool-call ids this assistant message requests */
  callIds: string[];
  /** tool-call ids this results message answers */
  resultIds: string[];
  error?: boolean;
  tokens: number;
}

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad';

export interface Detail {
  title: string;
  lines: string[];
  tone: Tone;
}

export type Stage = 'intro' | 'request' | 'response' | 'append' | 'validate' | 'execute' | 'result' | 'results' | 'final' | 'guard' | 'decode' | 'check' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  arrow: { from: Lane; to: Lane; label: string } | null;
  active: Lane | null;
  messages: Msg[];
  detail: Detail | null;
  /** model calls made so far */
  modelCalls: number;
  /** size of the latest request (messages + tool/schema definitions) */
  promptTokens: number;
  /** cumulative tokens billed: every request's input plus every response's output */
  totalTokens: number;
  stopReason: string | null;
  outcome: 'running' | 'answered' | 'stopped';
}

interface Call {
  id: string;
  name: string;
  args: string;
  /** null = arguments match the schema */
  invalid: string | null;
  result: string;
  ms: number;
}

interface ToolScenario {
  label: string;
  user: string;
  tools: { name: string; sig: string; schema: string[]; tokens: number }[];
  turns: Call[][];
  final: string;
}

const GET_ORDER = {
  name: 'get_order',
  sig: 'get_order(order_id)',
  schema: ['name: "get_order"', 'parameters: {', '  type: "object",', '  properties: { order_id: { type: "string" } },', '  required: ["order_id"],', '  additionalProperties: false', '}'],
  tokens: 70,
};

export const TOOL_SCENARIOS: Record<Exclude<ScenarioId, 'structured'>, ToolScenario> = {
  happy: {
    label: 'Happy path',
    user: 'Where is my order A-1042?',
    tools: [GET_ORDER],
    turns: [[{ id: 'call_01', name: 'get_order', args: '{"order_id":"A-1042"}', invalid: null, result: '{"status":"shipped","eta":"Oct 17"}', ms: 180 }]],
    final: 'Order A-1042 has shipped and should arrive on 17 October.',
  },
  parallel: {
    label: 'Parallel calls',
    user: 'Is Paris or Tokyo warmer now? Give the gap in °F.',
    tools: [
      { name: 'get_weather', sig: 'get_weather(city)', schema: ['name: "get_weather"', 'parameters: { city: string } (required)', 'name: "convert_temp"', 'parameters: { delta_c: number } (required)'], tokens: 60 },
      { name: 'convert_temp', sig: 'convert_temp(delta_c)', schema: [], tokens: 55 },
    ],
    turns: [
      [
        { id: 'call_01', name: 'get_weather', args: '{"city":"Paris"}', invalid: null, result: '{"city":"Paris","temp_c":14}', ms: 300 },
        { id: 'call_02', name: 'get_weather', args: '{"city":"Tokyo"}', invalid: null, result: '{"city":"Tokyo","temp_c":21}', ms: 450 },
      ],
      [{ id: 'call_03', name: 'convert_temp', args: '{"delta_c":7}', invalid: null, result: '{"delta_f":12.6}', ms: 5 }],
    ],
    final: 'Tokyo is warmer: 21 °C vs 14 °C, a gap of 7 °C (12.6 °F).',
  },
  violation: {
    label: 'Schema violation',
    user: 'Where is my order A-1042?',
    tools: [GET_ORDER],
    turns: [
      [{ id: 'call_01', name: 'get_order', args: '{"order_id":1042}', invalid: 'order_id: expected string, got number', result: '', ms: 0 }],
      [{ id: 'call_02', name: 'get_order', args: '{"order_id":"A-1042"}', invalid: null, result: '{"status":"shipped","eta":"Oct 17"}', ms: 180 }],
    ],
    final: 'Order A-1042 has shipped and should arrive on 17 October.',
  },
};

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  happy: 'Happy path',
  parallel: 'Parallel calls',
  violation: 'Schema violation',
  structured: 'Structured output',
};

/** drop keys whose value is undefined (e.g. an absent predict) */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const tok = (s: string) => Math.ceil(s.length / 4) + 4;
const SYSTEM_TOKENS = 40;

export function simulate(params: Params): Frame[] {
  return params.scenario === 'structured' ? simulateStructured() : simulateTools(params.scenario, params.maxIterations);
}

function simulateTools(id: Exclude<ScenarioId, 'structured'>, maxIterations: number): Frame[] {
  const s = TOOL_SCENARIOS[id];
  const frames: Frame[] = [];
  const messages: Msg[] = [{ role: 'user', kind: 'user', text: s.user, callIds: [], resultIds: [], tokens: tok(s.user) }];
  const toolTokens = s.tools.reduce((a, t) => a + t.tokens, 0);
  let modelCalls = 0;
  let promptTokens = 0;
  let totalTokens = 0;
  let stopReason: string | null = null;
  let outcome: Frame['outcome'] = 'running';
  let executed = 0;
  const historyTokens = () => messages.reduce((a, m) => a + m.tokens, 0) + toolTokens;
  const push = (f: Pick<Frame, 'stage' | 'caption'> & Partial<Pick<Frame, 'predict' | 'arrow' | 'active' | 'detail'>>) =>
    frames.push({
      arrow: null,
      active: null,
      detail: null,
      ...clean(f),
      messages: messages.map((m) => ({ ...m, callIds: [...m.callIds], resultIds: [...m.resultIds] })),
      modelCalls,
      promptTokens,
      totalTokens,
      stopReason,
      outcome,
    });

  const schemaLines = id === 'parallel' ? s.tools[0].schema : GET_ORDER.schema;
  push({
    stage: 'intro',
    active: 'app',
    detail: { title: `tool definition${s.tools.length > 1 ? 's' : ''} (JSON Schema)`, lines: schemaLines, tone: 'neutral' },
    caption: `The app defines ${s.tools.map((t) => t.sig).join(' and ')} as JSON Schema. The model never runs code: it can only ask the app to run a tool, and the app is the only lane that talks to the tool.`,
  });
  push({
    stage: 'intro',
    active: 'app',
    detail: { title: 'conversation so far', lines: [...wrap(`user: "${s.user}"`, 46), '', `${s.tools.length} tool schema(s) ≈ ${toolTokens} tokens`, 'are sent with EVERY request'], tone: 'neutral' },
    caption: `The user asks: "${s.user}" The loop may make at most ${maxIterations} model calls (the max-iterations guard).`,
  });

  let predictedResult = false;
  for (let t = 0; t <= s.turns.length; t++) {
    if (modelCalls >= maxIterations) {
      outcome = 'stopped';
      push({
        stage: 'guard',
        active: 'app',
        detail: { title: 'max-iterations guard', lines: [`model calls: ${modelCalls} / ${maxIterations}`, 'next request would exceed the cap', '', `throw new Error('Tool loop exceeded ${maxIterations}')`, 'or: one last call with tool_choice "none"'], tone: 'bad' },
        caption: `Guard trips: ${modelCalls} of ${maxIterations} model calls used and the model is still asking for tools. The app stops instead of looping on; a softer exit is one final request with tool_choice "none" to force a text answer.`,
      });
      break;
    }
    // request
    promptTokens = historyTokens();
    totalTokens += promptTokens;
    modelCalls++;
    push({
      stage: 'request',
      arrow: { from: 'app', to: 'model', label: `request #${modelCalls}` },
      active: 'model',
      detail: {
        title: `request #${modelCalls}`,
        lines: [`messages: ${messages.length} (whole history)`, `tools: [${s.tools.map((x) => x.name).join(', ')}]`, 'tool_choice: "auto"', `≈ ${promptTokens} input tokens`],
        tone: 'accent',
      },
      caption:
        modelCalls === 1
          ? `App → Model: request #1 carries the messages plus the tool schemas (~${promptTokens} input tokens). tool_choice "auto" lets the model decide whether to call a tool.`
          : `App → Model: request #${modelCalls} resends the WHOLE history, ${messages.length} messages (~${promptTokens} tokens). The API is stateless, so every call id must already be answered in what is sent.`,
    });

    if (t === s.turns.length) {
      const out = tok(s.final);
      totalTokens += out;
      stopReason = 'end_turn';
      outcome = 'answered';
      messages.push({ role: 'assistant', kind: 'text', text: s.final, callIds: [], resultIds: [], tokens: out });
      push({
        stage: 'final',
        arrow: { from: 'model', to: 'app', label: 'end_turn' },
        active: 'app',
        detail: { title: 'final answer', lines: wrap(`"${s.final}"`, 46).concat(['', 'stop_reason: "end_turn"  (OpenAI: "stop")', 'no tool calls → the loop exits']), tone: 'good' },
        caption: `Model → App: plain text with stop_reason "end_turn" (OpenAI finish_reason "stop"), so the loop ends after ${modelCalls} model calls and ${executed} tool execution(s).`,
      });
      break;
    }

    const calls = s.turns[t];
    const outTok = calls.reduce((a, c) => a + tok(c.name + c.args) + 8, 0);
    totalTokens += outTok;
    stopReason = 'tool_use';
    push({
      stage: 'response',
      arrow: { from: 'model', to: 'app', label: calls.length > 1 ? `${calls.length} tool calls` : 'tool call' },
      active: 'app',
      detail: {
        title: calls.length > 1 ? `${calls.length} tool calls in ONE turn` : 'tool call',
        lines: calls.flatMap((c) => [`id: "${c.id}"`, `name: "${c.name}"`, `arguments: ${c.args}`]).concat([`stop_reason: "tool_use"`]),
        tone: 'warn',
      },
      caption:
        id === 'violation' && t === 1
          ? `Model → App: having read the is_error result, the model retries with fixed arguments ${calls[0].args} under a NEW id "${calls[0].id}". The error message was specific, so one retry is enough.`
          : calls.length > 1
          ? `Model → App: ${calls.length} independent calls in one response (stop_reason "tool_use"), each with its own id. Anthropic sends tool_use blocks with a parsed input; OpenAI sends message.tool_calls[] with arguments as a JSON string.`
          : `Model → App: a tool call (id "${calls[0].id}", name "${calls[0].name}", arguments ${calls[0].args}) with stop_reason "tool_use" (OpenAI finish_reason "tool_calls"). Nothing has executed yet.`,
      predict:
        t === 0 && id === 'happy'
          ? 'The model asked for get_order. Has it run? What must the app do before executing it?'
          : t === 0 && id === 'parallel'
            ? 'Two calls in one turn. Should the app run them one after the other, and send back one reply or two?'
            : undefined,
    });
    messages.push({ role: 'assistant', kind: 'tool_call', text: calls.map((c) => `${c.id} ${c.name}${calls.length > 1 ? '' : `(${c.args})`}`).join(' + '), callIds: calls.map((c) => c.id), resultIds: [], tokens: outTok });
    push({
      stage: 'append',
      active: 'app',
      detail: { title: 'append the assistant turn verbatim', lines: ['messages.push({ role: "assistant",', `  content: [${calls.map((c) => c.id).join(', ')}] })`, '', 'without it the next request is rejected:', 'a result would answer a call never sent'], tone: 'neutral' },
      caption: `The app appends the assistant turn exactly as received, including the call id${calls.length > 1 ? 's' : ''}. Skip this and the next request fails: a tool result must answer a call that appears in the preceding assistant message.`,
    });

    const bad = calls.filter((c) => c.invalid);
    push({
      stage: 'validate',
      active: 'app',
      detail: {
        title: 'validate arguments against the schema',
        lines: calls.flatMap((c) =>
          c.invalid ? [`${c.id} ${c.args}`, `  ✕ ${c.invalid}`] : [`${c.id} ${c.args}`, `  ✓ types match, required keys present`],
        ),
        tone: bad.length ? 'bad' : 'good',
      },
      caption: bad.length
        ? `Validation fails: ${bad[0].invalid} (e.g. Zod safeParse). Without strict tool schemas a model can emit wrong types or drop required fields, so the app must never trust arguments blindly.`
        : `The app parses and validates the arguments against the schema (e.g. Zod safeParse) and checks the user may do this. Arguments are untrusted input, even with strict schemas.`,
      predict: bad.length ? 'The arguments are invalid. Should the app throw, run the tool anyway, or tell the model?' : undefined,
    });

    if (bad.length) {
      messages.push({ role: 'tool', kind: 'tool_result', text: `${bad[0].id} is_error: invalid arguments`, callIds: [], resultIds: calls.map((c) => c.id), error: true, tokens: tok(bad[0].invalid ?? '') + 8 });
      push({
        stage: 'results',
        active: 'app',
        detail: { title: 'error result (the tool never ran)', lines: ['{ type: "tool_result",', `  tool_use_id: "${bad[0].id}",`, '  is_error: true,', '  content:', `    "${bad[0].invalid}" }`], tone: 'bad' },
        caption: `The tool is NOT executed. The app returns an error result with is_error: true and the same id "${bad[0].id}", so the conversation stays valid and the model can correct itself instead of the app crashing.`,
      });
      continue;
    }

    executed += calls.length;
    const slowest = Math.max(...calls.map((c) => c.ms));
    const sum = calls.reduce((a, c) => a + c.ms, 0);
    push({
      stage: 'execute',
      arrow: { from: 'app', to: 'tool', label: calls.length > 1 ? 'Promise.all' : 'execute' },
      active: 'tool',
      detail: {
        title: calls.length > 1 ? 'run concurrently (with timeouts)' : 'execute (with a timeout)',
        lines: calls.map((c) => `${c.name}(${c.args})  ${c.ms} ms`).concat(calls.length > 1 ? ['', `wall time ${slowest} ms (sequential: ${sum} ms)`] : []),
        tone: 'accent',
      },
      caption:
        calls.length > 1
          ? `App → Tool: the calls are independent, so the app runs them concurrently with Promise.all: ${slowest} ms wall time instead of ${sum} ms. (Disable parallel calls for tools with ordering side effects.)`
          : `App → Tool: the app runs ${calls[0].name} itself, wrapped in a timeout, and gets a result in ${calls[0].ms} ms.`,
    });
    push({
      stage: 'result',
      arrow: { from: 'tool', to: 'app', label: calls.length > 1 ? `${calls.length} results` : 'result' },
      active: 'app',
      detail: { title: 'tool output', lines: calls.map((c) => `${c.id}: ${c.result}`), tone: 'neutral' },
      caption: `Tool → App: ${calls.map((c) => c.result).join(' and ')}. The model has not seen ${calls.length > 1 ? 'these' : 'this'} yet.`,
      predict: !predictedResult ? 'The result must go back to the model. What must it carry so the model can match it to its call?' : undefined,
    });
    predictedResult = true;
    messages.push({
      role: 'tool',
      kind: 'tool_result',
      text: calls.length > 1 ? `${calls.map((c) => c.id).join(' + ')} results` : `${calls[0].id} ${calls[0].result}`,
      callIds: [],
      resultIds: calls.map((c) => c.id),
      tokens: calls.reduce((a, c) => a + tok(c.result) + 6, 0),
    });
    push({
      stage: 'results',
      active: 'app',
      detail: {
        title: calls.length > 1 ? 'ONE message with every result' : 'tool result with the matching id',
        lines: calls.map((c) => `{ tool_use_id: "${c.id}", content: … }`).concat(['', 'Anthropic: tool_result blocks in a user msg', 'OpenAI: { role: "tool", tool_call_id } each']),
        tone: 'good',
      },
      caption:
        calls.length > 1
          ? `The app appends ONE message holding both results, each tagged with its call id. Answering only call_01 would make the next request fail: every call id needs exactly one result before the next model turn.`
          : `The app appends the result tagged with id "${calls[0].id}" (Anthropic tool_use_id in a tool_result block; OpenAI tool_call_id on a role "tool" message). Every call gets exactly one result.`,
    });
  }

  push({
    stage: 'recap',
    active: null,
    detail: {
      title: 'recap',
      lines: [`model calls: ${modelCalls} / max ${maxIterations}`, `tool executions: ${executed}`, `messages: ${messages.length}`, `tokens billed ≈ ${totalTokens}`],
      tone: outcome === 'answered' ? 'good' : 'bad',
    },
    caption:
      outcome === 'answered'
        ? `Recap: ${modelCalls} model calls; the history resent each time grew to ${messages.length} messages, and tokens billed total ~${totalTokens}. Validate every argument, answer every call id, return errors as results, and cap the loop.`
        : `Recap: the cap of ${maxIterations} was too tight for a task that needs ${s.turns.length + 1} model calls. Size the guard from the design and pair it with a token budget and repeated-call detection.`,
  });
  return frames;
}

/** Word-wrap a string into lines of at most n characters. */
export function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && (line + ' ' + w).length > n) {
      out.push(line);
      line = w;
    } else line = line ? line + ' ' + w : w;
  }
  if (line) out.push(line);
  return out;
}

export const STRUCT_EMAIL = "Hi, I'm Priya Shah (priya@acme.io). A demo next week? ~40 seats.";

function simulateStructured(): Frame[] {
  const frames: Frame[] = [];
  const messages: Msg[] = [
    { role: 'system', kind: 'system', text: 'Extract the lead. Use null if absent.', callIds: [], resultIds: [], tokens: SYSTEM_TOKENS },
    { role: 'user', kind: 'user', text: STRUCT_EMAIL, callIds: [], resultIds: [], tokens: tok(STRUCT_EMAIL) },
  ];
  const SCHEMA_TOKENS = 75;
  let modelCalls = 0;
  let promptTokens = 0;
  let totalTokens = 0;
  let stopReason: string | null = null;
  let outcome: Frame['outcome'] = 'running';
  const push = (f: Pick<Frame, 'stage' | 'caption'> & Partial<Pick<Frame, 'predict' | 'arrow' | 'active' | 'detail'>>) =>
    frames.push({ arrow: null, active: null, detail: null, ...clean(f), messages: messages.map((m) => ({ ...m })), modelCalls, promptTokens, totalTokens, stopReason, outcome });

  push({
    stage: 'intro',
    active: 'app',
    detail: { title: 'goal: a typed object, not prose', lines: ['{ name: string,', '  email: string,', '  seats: integer | null,', '  demo_requested: boolean }'], tone: 'neutral' },
    caption: 'No tools this time: the reply itself is the data. The app wants a lead object it can write straight to a database, so the Tool lane stays idle.',
  });
  push({
    stage: 'intro',
    active: 'model',
    detail: { title: 'level 1: "reply in JSON" (prompt only)', lines: ['```json', '{"name":"Priya Shah",', ' "demoRequested":true,', ' "seats":"40"}', '```', '✕ fence breaks JSON.parse  ✕ wrong key', '✕ "40" is a string  ✕ email missing'], tone: 'bad' },
    caption: 'Level 1, prompt only: the model usually complies, but nothing stops a markdown fence, a camelCase key, a number as a string or a missing field. Parsing fails on a few percent of inputs.',
  });
  push({
    stage: 'intro',
    active: 'model',
    detail: { title: 'level 2: JSON mode', lines: ['{"name":"Priya Shah","seats":"40",', ' "demoRequested":true}', '', '✓ always parses as JSON', '✕ any shape: keys and types unchecked'], tone: 'warn' },
    caption: 'Level 2, JSON mode (OpenAI response_format json_object): output always parses, but the shape is still free, so unknown keys, wrong types and missing fields get through.',
  });
  promptTokens = messages.reduce((a, m) => a + m.tokens, 0) + SCHEMA_TOKENS;
  totalTokens += promptTokens;
  modelCalls = 1;
  push({
    stage: 'request',
    arrow: { from: 'app', to: 'model', label: 'req + schema' },
    active: 'model',
    detail: {
      title: 'level 3: strict JSON Schema',
      lines: ['strict: true', 'properties: name, email: string', '  seats: ["integer","null"]', '  demo_requested: boolean', 'required: [all four keys]', 'additionalProperties: false'],
      tone: 'accent',
    },
    caption: `Level 3, Structured Outputs: the request carries a strict JSON Schema (OpenAI json_schema with strict: true; Anthropic output_config.format), ~${promptTokens} input tokens. Every key is required; "optional" means nullable.`,
  });
  push({
    stage: 'decode',
    active: 'model',
    detail: { title: 'schema → grammar', lines: ['provider compiles the schema into a grammar', 'first request with a new schema: slower', 'later requests: grammar is cached', '', 'at every token: mask what breaks it'], tone: 'accent' },
    caption: 'The provider compiles the schema into a grammar (slow the first time, then cached). During decoding, every token that would break the grammar gets probability zero: this is constrained decoding.',
  });
  push({
    stage: 'decode',
    active: 'model',
    detail: { title: 'decoding… next token?', lines: ['{"name":"Priya Shah",', ' "email":"priya@acme.io",', ' "seats":▌', '', 'schema: seats is ["integer","null"]'], tone: 'accent' },
    caption: 'Mid-generation: the model has written name and email and the next value is seats, typed ["integer","null"].',
    predict: 'In level 1 the model wrote "seats":"40". Can it emit a quoted string here now?',
  });
  push({
    stage: 'decode',
    active: 'model',
    detail: { title: 'token mask at this position', lines: ['allowed:  0-9   null', 'masked:   "   true   false   {   [', '', 'chosen:   40', 'unknown keys (e.g. "demoRequested")', 'are masked the same way'], tone: 'good' },
    caption: 'No: a quote token would start a string, which the grammar forbids here, so it is masked and the model writes 40. Unknown keys and missing required keys are impossible for the same reason.',
  });
  const out = '{"name":"Priya Shah","email":"priya@acme.io","seats":40,"demo_requested":true}';
  totalTokens += tok(out);
  stopReason = 'end_turn';
  messages.push({ role: 'assistant', kind: 'json', text: out, callIds: [], resultIds: [], tokens: tok(out) });
  push({
    stage: 'response',
    arrow: { from: 'model', to: 'app', label: 'JSON reply' },
    active: 'app',
    detail: { title: 'reply (stop_reason "end_turn")', lines: ['{"name":"Priya Shah",', ' "email":"priya@acme.io",', ' "seats":40,', ' "demo_requested":true}'], tone: 'good' },
    caption: 'Model → App: one assistant message whose text is schema-valid JSON, with stop_reason "end_turn". No tool call and no second request: this is a single round trip.',
  });
  push({
    stage: 'check',
    active: 'app',
    detail: { title: 'check BEFORE parsing', lines: ['refusal?   OpenAI message.refusal', '           Anthropic stop_reason "refusal"', 'truncated? finish_reason "length" /', '           stop_reason "max_tokens"', '→ either can break the schema'], tone: 'warn' },
    caption: 'Before parsing, the app checks for a safety refusal and for truncation at max_tokens. Both can end the output early, so the guarantee only covers a reply that finished normally.',
  });
  push({
    stage: 'check',
    active: 'app',
    detail: { title: 'JSON.parse + schema', lines: ['✓ parses', '✓ only the four schema keys', '✓ seats is an integer, demo_requested a bool', '✓ every required key present'], tone: 'good' },
    caption: 'JSON.parse succeeds and the object has exactly the schema shape, so the fence-stripping and key-repair code from level 1 can be deleted.',
    predict: 'The shape is guaranteed. Is the content guaranteed? Could seats be 0, or the email belong to someone else?',
  });
  push({
    stage: 'validate',
    active: 'app',
    detail: { title: 'Zod: rules the schema cannot hold', lines: ['seats: z.number().int().positive()', '  .nullable()', 'email: z.string().email()', '', 'strict schemas reject some keywords', '(e.g. minimum, maxLength on Anthropic)'], tone: 'accent' },
    caption: 'Shape is not truth. A schema-valid string can hold the wrong email, and ranges like seats > 0 are unsupported in some strict modes, so business rules live in a Zod check after parsing.',
  });
  outcome = 'answered';
  push({
    stage: 'check',
    active: 'app',
    detail: {
      title: 'what constrained decoding guarantees',
      lines: ['✓ valid JSON, no fences or prose', '✓ no unknown keys, no missing keys', '✓ correct types and enum values', '✕ that the values are correct', '✕ unsupported keywords (ranges, lengths)', '✕ refusals and max_tokens truncation'],
      tone: 'good',
    },
    caption: 'Guaranteed: syntax, keys, types and enums. Not guaranteed: truth of the values, rules the schema cannot express, and replies cut short by a refusal or max_tokens.',
  });
  push({
    stage: 'recap',
    active: null,
    detail: { title: 'recap', lines: ['prompt only  → hope', 'JSON mode    → valid JSON, any shape', 'strict schema → valid JSON in YOUR shape', '+ Zod        → your business rules', '', 'data for you: Structured Outputs', 'an action:    tools (or a forced tool)'], tone: 'neutral' },
    caption: `Recap: one request (~${promptTokens} in, ${tok(out)} out). Use Structured Outputs when the reply is data for your code, and tools (or a forced tool_choice, which also yields schema-shaped JSON) when the model must trigger an action.`,
  });
  return frames;
}
