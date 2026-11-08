// Pure, deterministic MCP session (no React, Node-testable).
// Host (AI app: LLM + consent UI) → its client → one server, all JSON-RPC 2.0. Under spec 2025-11-25 the session
// opens with initialize (protocol version + capabilities), the server answers with its capabilities and the client
// confirms with the notifications/initialized notification (no id, so no reply). The 2026-07-28 revision removes
// that handshake: version and capabilities travel with each request. Then tools/list → the model picks a tool →
// the host asks the user → tools/call → a result (isError for tool failures) or a JSON-RPC error (protocol errors
// such as an unknown tool). Mirrors the "Open an issue for the flaky login test" example in the MCP topic.
import type { BaseFrame } from '../../core';
import type { FrameTurn as Turn } from '../_shared/yourTurn.ts';

export type Spec = '2025-11-25' | '2026-07-28';
export type Outcome = 'ok' | 'toolError' | 'unknownTool';
export type Lane = 'host' | 'client' | 'server';
export type MsgKind = 'request' | 'result' | 'notification' | 'error' | 'local';

export interface Params {
  spec: Spec;
  outcome: Outcome;
}

export const DEFAULT_PARAMS: Params = { spec: '2025-11-25', outcome: 'ok' };

export const OUTCOME_LABELS: Record<Outcome, string> = {
  ok: 'Success',
  toolError: 'Tool fails (isError)',
  unknownTool: 'Unknown tool (JSON-RPC error)',
};

export interface WireMsg {
  from: Lane;
  to: Lane;
  label: string;
  kind: MsgKind;
  /** JSON-RPC id; null for notifications and host-local steps */
  id: number | null;
}

export type Stage = 'intro' | 'initialize' | 'capabilities' | 'initialized' | 'list' | 'listed' | 'model' | 'consent' | 'call' | 'response' | 'answer' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** messages so far, oldest first (the newest is the one being sent) */
  log: WireMsg[];
  active: Lane;
  /** payload of the current step, one line each */
  payload: { title: string; lines: string[] };
  handshakeDone: boolean;
  /** request ids sent and not yet answered */
  pending: number[];
  status: 'running' | 'done' | 'toolError' | 'protocolError';
  yourTurn?: Turn;
}

const TOOL = 'create_issue';
const ARGS = '{"owner":"acme","repo":"web","title":"Flaky login test"}';

export function simulate(params: Params): Frame[] {
  const { spec, outcome } = params;
  const stateless = spec === '2026-07-28';
  const frames: Frame[] = [];
  const log: WireMsg[] = [];
  const pending = new Set<number>();
  let handshakeDone = stateless;
  let status: Frame['status'] = 'running';
  let nextId = 1;

  const send = (m: Omit<WireMsg, 'id'> & { id?: number | null }) => {
    const msg: WireMsg = { ...m, id: m.id ?? null };
    log.push(msg);
    if (msg.kind === 'request' && msg.id !== null) pending.add(msg.id);
    if ((msg.kind === 'result' || msg.kind === 'error') && msg.id !== null) pending.delete(msg.id);
    return msg;
  };
  const push = (f: Pick<Frame, 'stage' | 'caption' | 'active' | 'payload'> & { yourTurn?: Turn }) =>
    frames.push({ ...f, log: log.map((m) => ({ ...m })), handshakeDone, pending: [...pending].sort(), status });

  push({
    stage: 'intro',
    active: 'host',
    payload: { title: 'host config', lines: ['server: github (stdio)', 'command: node ./github-server.js', `protocol: MCP ${spec}`, 'user: "Open an issue for the flaky login test"'] },
    caption: `The host (the AI app: LLM, UI and user consent) creates one client for the GitHub server and launches it over stdio. Every message from here on is JSON-RPC 2.0. Spec ${spec}.`,
  });

  if (!stateless) {
    const id = nextId++;
    send({ from: 'client', to: 'server', label: `initialize (id ${id})`, kind: 'request', id });
    push({
      stage: 'initialize',
      active: 'client',
      payload: {
        title: 'client → server: request',
        lines: ['{ "jsonrpc": "2.0", "id": 1,', '  "method": "initialize",', '  "params": { "protocolVersion": "2025-11-25",', '    "capabilities": { "elicitation": {} },', '    "clientInfo": { "name": "demo-host", "version": "1.0.0" } } }'],
      },
      caption: 'The session opens with initialize: the client states the protocol version it speaks and the features it offers the server (here elicitation: the server may ask the user for structured input).',
    });
    send({ from: 'server', to: 'client', label: `result: capabilities (id ${id})`, kind: 'result', id });
    push({
      stage: 'capabilities',
      active: 'server',
      payload: {
        title: 'server → client: result',
        lines: ['{ "jsonrpc": "2.0", "id": 1,', '  "result": { "protocolVersion": "2025-11-25",', '    "capabilities": { "tools": { "listChanged": true } },', '    "serverInfo": { "name": "github", "version": "1.0.0" } } }'],
      },
      caption: 'The server answers with the same id, the version it agrees to and its own capabilities: it has tools and will send notifications/tools/list_changed if they change.',
      yourTurn: {
        question: 'Capabilities are agreed. What does the client send before it asks for tools/list?',
        options: [
          { text: 'notifications/initialized', correct: true, why: 'Under 2025-11-25 the client confirms the handshake with this notification; it has no id, so the server sends no reply.' },
          { text: 'initialize again, to double-check', correct: false, why: 'The version and capabilities are already agreed; a second initialize is not part of the handshake.' },
          { text: 'Nothing: tools/list goes straight out', correct: false, why: 'That is how the 2026-07-28 revision works, not 2025-11-25, which still ends the handshake with a notification.' },
        ],
      },
    });
    send({ from: 'client', to: 'server', label: 'notifications/initialized', kind: 'notification' });
    handshakeDone = true;
    push({
      stage: 'initialized',
      active: 'client',
      payload: { title: 'client → server: notification', lines: ['{ "jsonrpc": "2.0",', '  "method": "notifications/initialized" }', '', '// no "id" → a notification: nothing comes back'] },
      caption: 'The client confirms with notifications/initialized. It carries no id, so it is a notification and the server sends nothing back. The handshake is done; normal requests can start.',
    });
  }

  const listId = nextId++;
  send({ from: 'client', to: 'server', label: `tools/list (id ${listId})`, kind: 'request', id: listId });
  push({
    stage: 'list',
    active: 'client',
    payload: {
      title: 'client → server: request',
      lines: [`{ "jsonrpc": "2.0", "id": ${listId}, "method": "tools/list" }`, ...(stateless ? ['', '// 2026-07-28: no handshake happened, so the protocol', '// version and client capabilities travel with this request'] : [])],
    },
    caption: stateless
      ? 'No initialize under 2026-07-28: the very first message is a real request, carrying the protocol version and capabilities itself. Any server instance can answer it, so the core is stateless.'
      : `The client asks what the server offers: tools/list with a fresh id (${listId}). Ids pair each response with its request.`,
  });
  send({ from: 'server', to: 'client', label: `result: 26 tools (id ${listId})`, kind: 'result', id: listId });
  push({
    stage: 'listed',
    active: 'server',
    payload: {
      title: 'server → client: result (1 of 26 tools)',
      lines: [`{ "jsonrpc": "2.0", "id": ${listId}, "result": { "tools": [ …,`, `  { "name": "${TOOL}",`, '    "inputSchema": { "type": "object",', '      "properties": { "owner", "repo", "title", "body" },', '      "required": ["owner", "repo", "title"] } }, … ] } }'],
    },
    caption: `The server returns 26 tools, each with a JSON Schema for its arguments, ${TOOL} among them. The host hands these definitions to the LLM as its tool list.`,
  });

  const name = outcome === 'unknownTool' ? 'create_ticket' : TOOL;
  send({ from: 'host', to: 'host', label: `LLM picks ${name}`, kind: 'local' });
  push({
    stage: 'model',
    active: 'host',
    payload: { title: 'model → host: tool call', lines: [`name: "${name}"`, `arguments: ${ARGS}`, '', 'tools are model-controlled: the LLM decides to call'] },
    caption:
      outcome === 'unknownTool'
        ? 'The model asks for create_ticket, a name that was never in tools/list (it guessed). This host forwards it anyway; a stricter host would reject it here.'
        : `The model decides to call ${TOOL} with owner, repo and title. Tools are model-controlled: the model chooses when to use them, the server never does.`,
    yourTurn: {
      question: `The model wants ${name}. What happens before tools/call goes on the wire?`,
      options: [
        { text: 'The host asks the user to confirm', correct: true, why: 'The host owns consent: it shows the call (it writes to GitHub) and waits for the user to approve.' },
        { text: 'The server asks the model to confirm', correct: false, why: 'Servers expose capabilities; consent belongs to the host, which talks to the user.' },
        { text: 'Nothing: the client sends it at once', correct: false, why: 'A call that writes to an external system goes through the host’s confirmation first.' },
      ],
    },
  });
  send({ from: 'host', to: 'host', label: 'user approves', kind: 'local' });
  push({
    stage: 'consent',
    active: 'host',
    payload: { title: 'host consent dialog', lines: [`Allow github → ${name}?`, `  ${ARGS}`, '', '[ Deny ]   [ Allow ]  ← user clicks Allow'] },
    caption: 'The host shows a confirmation dialog because the tool writes to an external system. The user approves; only now does the client send the call.',
  });

  const callId = nextId++;
  send({ from: 'client', to: 'server', label: `tools/call ${name} (id ${callId})`, kind: 'request', id: callId });
  push({
    stage: 'call',
    active: 'client',
    payload: { title: 'client → server: request', lines: [`{ "jsonrpc": "2.0", "id": ${callId},`, '  "method": "tools/call",', `  "params": { "name": "${name}",`, `    "arguments": ${ARGS} } }`] },
    caption: `The client sends tools/call with id ${callId}, the tool name and the model's arguments.`,
  });

  if (outcome === 'ok') {
    send({ from: 'server', to: 'client', label: `result (id ${callId})`, kind: 'result', id: callId });
    status = 'done';
    push({
      stage: 'response',
      active: 'server',
      payload: { title: 'server → client: result', lines: [`{ "jsonrpc": "2.0", "id": ${callId}, "result": {`, '  "content": [{ "type": "text",', '    "text": "Created acme/web#482" }],', '  "isError": false } }'] },
      caption: `The server creates the issue and answers id ${callId} with a result: content blocks plus isError: false.`,
    });
  } else if (outcome === 'toolError') {
    send({ from: 'server', to: 'client', label: `result, isError (id ${callId})`, kind: 'result', id: callId });
    status = 'toolError';
    push({
      stage: 'response',
      active: 'server',
      payload: { title: 'server → client: result', lines: [`{ "jsonrpc": "2.0", "id": ${callId}, "result": {`, '  "content": [{ "type": "text",', '    "text": "GitHub API rate limit hit; retry in 60 s" }],', '  "isError": true } }'] },
      caption: `GitHub refuses the call. The server still sends a normal result for id ${callId}, but with isError: true and a message the model can act on. Tool failures are results, not protocol errors.`,
    });
  } else {
    send({ from: 'server', to: 'client', label: `error (id ${callId})`, kind: 'error', id: callId });
    status = 'protocolError';
    push({
      stage: 'response',
      active: 'server',
      payload: { title: 'server → client: JSON-RPC error', lines: [`{ "jsonrpc": "2.0", "id": ${callId}, "error": {`, '  "code": -32602,', '  "message": "Unknown tool: create_ticket" } }'] },
      caption: `There is no create_ticket tool, so this is a protocol error: the server answers id ${callId} with a JSON-RPC error object instead of a result.`,
    });
  }

  send({ from: 'host', to: 'host', label: outcome === 'ok' ? 'LLM answers the user' : 'LLM sees the error', kind: 'local' });
  push({
    stage: 'answer',
    active: 'host',
    payload: {
      title: 'host → model → user',
      lines:
        outcome === 'ok'
          ? ['tool result → model', 'model → user: "Done: I opened acme/web#482', '  for the flaky login test."']
          : outcome === 'toolError'
            ? ['tool result (isError) → model', 'model → user: "GitHub is rate-limiting me;', '  I\'ll retry in a minute."']
            : ['error → host → model', 'model: retries with a listed name (create_issue)', '  or tells the user it cannot do this'],
    },
    caption:
      outcome === 'ok'
        ? 'The host gives the result to the model, which answers the user. The same GitHub server would work unchanged in an IDE, a CLI agent or your own agent.'
        : outcome === 'toolError'
          ? 'Because the failure came back as a result, the model sees the message and can recover: retry later or explain it to the user.'
          : 'The host turns the protocol error into something the model can see; it can retry with a name from tools/list or tell the user. Validating names against tools/list in the host avoids the round trip.',
  });

  const rpc = log.filter((m) => m.kind !== 'local');
  push({
    stage: 'recap',
    active: 'host',
    payload: {
      title: 'session recap',
      lines: [
        `${rpc.length} JSON-RPC messages: ${rpc.filter((m) => m.kind === 'request').length} requests, ${rpc.filter((m) => m.kind === 'result' || m.kind === 'error').length} responses, ${rpc.filter((m) => m.kind === 'notification').length} notification`,
        stateless ? 'no handshake (2026-07-28 stateless core)' : 'handshake: initialize → result → initialized',
        'every response carried the id of its request',
      ],
    },
    caption: stateless
      ? `Recap: ${rpc.length} messages and no handshake. Each request stands alone, so any server instance can answer it.`
      : `Recap: ${rpc.length} messages. The handshake (initialize, its result, notifications/initialized) came first; every response matched its request by id.`,
  });
  return frames;
}
