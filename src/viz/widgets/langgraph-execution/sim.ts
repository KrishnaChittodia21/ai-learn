// Pure, deterministic LangGraph (JS) execution model (no React, Node-testable).
// Graph: START → agent → route(state) ─┬─ tool_calls, read-only  → tools → agent (cycle)
//                                      ├─ tool_calls, sensitive  → human_review (interrupt())
//                                      └─ no tool_calls          → END
// human_review resumes with Command({ resume }) and returns Command({ goto: 'tools' | 'agent' }).
// State channels: messages (add-messages reducer: append, replace by id), llmCalls (sum reducer), lastNode (no
// reducer: last write wins). Each node returns a PARTIAL update; reducers merge it, then a checkpoint is written for
// the thread (one per superstep). recursionLimit = max supersteps per invoke; needing one more throws
// GraphRecursionError.
import type { BaseFrame } from '../../core';

export type ScenarioId = 'loop' | 'recursion' | 'interrupt' | 'timetravel';
export type Decision = 'approve' | 'reject';

export interface Params {
  scenario: ScenarioId;
  recursionLimit: number;
  decision: Decision;
}

export const DEFAULT_PARAMS: Params = { scenario: 'loop', recursionLimit: 6, decision: 'approve' };
export const MIN_LIMIT = 4;
export const MAX_LIMIT = 12;
export const THREAD_ID = 'thread-42';

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  loop: 'Agent ↔ tools loop',
  recursion: 'Recursion limit',
  interrupt: 'interrupt() + resume',
  timetravel: 'Time travel + fork',
};

export type NodeId = 'START' | 'agent' | 'tools' | 'human_review' | 'END';
export type EdgeId = 'start-agent' | 'agent-tools' | 'agent-review' | 'agent-end' | 'tools-agent' | 'review-tools' | 'review-agent';

export interface Msg {
  id: string;
  type: 'human' | 'ai' | 'tool';
  text: string;
  toolCalls?: string[];
  toolCallId?: string;
  error?: boolean;
}

export interface Ckpt {
  id: number;
  /** metadata.step: the input checkpoint is shown as step 0 */
  step: number;
  /** snapshot.next: nodes that run after this checkpoint ([] = finished) */
  next: string[];
  /** 0 = original run, 1 = replay branch, 2 = fork branch */
  branch: number;
  parent: number | null;
  source: 'input' | 'loop' | 'update';
  /** an interrupt is stored as a pending write on this checkpoint */
  interrupt?: boolean;
}

export interface Delta {
  messages?: string;
  llmCalls?: string;
  lastNode?: string;
}

export type Status = 'idle' | 'running' | 'interrupted' | 'done' | 'error';

export interface Frame extends BaseFrame {
  stage: string;
  activeNode: NodeId | null;
  activeEdge: EdgeId | null;
  messages: Msg[];
  llmCalls: number;
  lastNode: string | null;
  /** the partial update returned by the node that just ran */
  update: { node: string; lines: string[] } | null;
  /** how the reducers merged that update into the state */
  delta: Delta | null;
  checkpoints: Ckpt[];
  /** checkpoint the thread currently points at */
  head: number | null;
  invoke: number;
  /** supersteps run in the current invoke */
  superstep: number;
  status: Status;
  error: string | null;
  /** node the run would have entered when the recursion limit fired */
  blockedNext: NodeId | null;
  /** every node execution so far (for tests and the recap) */
  runs: { node: NodeId; invoke: number; branch: number }[];
  /** checkpoint id an invoke resumed / replayed from */
  resumedFrom: number | null;
}

interface StateValues {
  messages: Msg[];
  llmCalls: number;
  lastNode: string | null;
}

interface NodeUpdate {
  messages?: Msg[];
  llmCalls?: number;
  lastNode?: string;
}

type FrameExtras = Partial<Pick<Frame, 'predict' | 'activeNode' | 'activeEdge' | 'update' | 'delta' | 'blockedNext'>>;

const cloneState = (s: StateValues): StateValues => ({ messages: s.messages.map((m) => (m.toolCalls ? { ...m, toolCalls: [...m.toolCalls] } : { ...m })), llmCalls: s.llmCalls, lastNode: s.lastNode });

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Human-readable one-liner of a node's partial update. */
function describeUpdate(u: NodeUpdate): string[] {
  const parts: string[] = [];
  if (u.messages) {
    const kinds = u.messages.map((m) => (m.type === 'ai' ? `AIMessage ${m.id}` : m.type === 'tool' ? `ToolMessage ${m.id}` : `HumanMessage ${m.id}`));
    parts.push(`messages: [${kinds.length > 2 ? `${kinds.length} ToolMessages` : kinds.join(', ')}]`);
  }
  if (u.llmCalls !== undefined) parts.push(`llmCalls: ${u.llmCalls}`);
  if (u.lastNode !== undefined) parts.push(`lastNode: '${u.lastNode}'`);
  if (!parts.length) return ['{}  (no state change)'];
  return parts.map((p, i) => `${i === 0 ? '{ ' : '  '}${p}${i === parts.length - 1 ? ' }' : ','}`);
}

export function simulate(params: Params): Frame[] {
  const L = params.recursionLimit;
  const frames: Frame[] = [];
  let st: StateValues = { messages: [], llmCalls: 0, lastNode: null };
  const saved = new Map<number, StateValues>();
  const ckpts: Ckpt[] = [];
  let head: number | null = null;
  let invoke = 0;
  let superstep = 0;
  let status: Status = 'idle';
  let error: string | null = null;
  let branch = 0;
  let resumedFrom: number | null = null;
  const runs: Frame['runs'] = [];

  const push = (stage: string, caption: string, x: FrameExtras = {}) =>
    frames.push({
      stage,
      caption,
      activeNode: null,
      activeEdge: null,
      update: null,
      delta: null,
      blockedNext: null,
      ...clean(x),
      messages: cloneState(st).messages,
      llmCalls: st.llmCalls,
      lastNode: st.lastNode,
      checkpoints: ckpts.map((c) => ({ ...c, next: [...c.next] })),
      head,
      invoke,
      superstep,
      status,
      error,
      runs: runs.map((r) => ({ ...r })),
      resumedFrom,
    });

  /** Merge a partial update through the reducers. */
  const merge = (u: NodeUpdate): Delta => {
    const d: Delta = {};
    if (u.messages) {
      let app = 0;
      let rep = 0;
      for (const m of u.messages) {
        const i = st.messages.findIndex((x) => x.id === m.id);
        if (i >= 0) {
          st.messages[i] = { ...m };
          rep++;
        } else {
          st.messages.push({ ...m });
          app++;
        }
      }
      d.messages = rep ? `replaced ${rep} by id${app ? `, appended ${app}` : ''}` : `appended ${app}`;
    }
    if (u.llmCalls !== undefined) {
      const before = st.llmCalls;
      st.llmCalls += u.llmCalls;
      d.llmCalls = `${before} + ${u.llmCalls} = ${st.llmCalls}`;
    }
    if (u.lastNode !== undefined) {
      d.lastNode = `${st.lastNode === null ? 'unset' : `'${st.lastNode}'`} → '${u.lastNode}'`;
      st.lastNode = u.lastNode;
    }
    return d;
  };

  const save = (next: string[], source: Ckpt['source'] = 'loop', from: number | null = head): Ckpt => {
    const parent = from === null ? null : ckpts[from];
    const c: Ckpt = { id: ckpts.length, step: parent ? parent.step + 1 : 0, next, branch, parent: from, source };
    ckpts.push(c);
    head = c.id;
    saved.set(c.id, cloneState(st));
    return c;
  };

  const restore = (id: number) => {
    st = cloneState(saved.get(id)!);
    head = id;
  };

  /** Run one superstep for `node`. Returns false (after pushing the error frame) if the recursion limit is hit. */
  const canRun = (node: NodeId, from: NodeId): boolean => {
    if (superstep < L) return true;
    status = 'error';
    error = 'GraphRecursionError';
    push(
      'error',
      `Superstep ${superstep} finished and the router chose '${node}', which would be superstep ${superstep + 1} > recursionLimit ${L}. LangGraph throws GraphRecursionError: invoke() rejects, but checkpoints c0–c${head} stay saved on '${THREAD_ID}'.`,
      { activeNode: node, activeEdge: edgeOf(from, node), blockedNext: node },
    );
    return false;
  };

  const run = (node: NodeId) => {
    superstep++;
    runs.push({ node, invoke, branch });
  };

  const route = (): NodeId => {
    const last = st.messages[st.messages.length - 1];
    if (last.type !== 'ai' || !last.toolCalls?.length) return 'END';
    return last.text.includes('send_email') ? 'human_review' : 'tools';
  };

  const NEXT = (n: NodeId): string[] => (n === 'END' ? [] : [n === 'human_review' ? 'human_review' : n]);

  // ---------------------------------------------------------------- shared intro
  const intro = (extra: string) =>
    push(
      'intro',
      `A StateGraph with nodes agent, tools and human_review: START → agent, a conditional edge from agent to tools | human_review | END, and tools → agent closing the cycle. ${extra}`,
    );
  const schema = () =>
    push(
      'schema',
      `State has three channels: messages (add-messages reducer: append, replace by id), llmCalls (sum reducer (a, b) => a + b) and lastNode (no reducer, so the last write wins). Nodes return partial updates; reducers merge them.`,
    );
  const startInvoke = (human: Msg, caption: string, predict?: string) => {
    invoke = 1;
    superstep = 0;
    status = 'running';
    merge({ messages: [human] });
    save(['agent'], 'input');
    push('invoke', caption, { activeNode: 'START', activeEdge: 'start-agent', predict, delta: { messages: 'appended 1 (input)' } });
  };

  const HUMAN_WEATHER: Msg = { id: 'h-1', type: 'human', text: 'Weather in Paris and Rome?' };
  const AI_CALLS: Msg = { id: 'ai-1', type: 'ai', text: 'tool_calls: weather(Paris), weather(Rome)', toolCalls: ['call_1', 'call_2'] };
  const TOOL_PARIS: Msg = { id: 'tm-1', type: 'tool', text: 'call_1 → {"city":"Paris","tempC":14}', toolCallId: 'call_1' };
  const TOOL_ROME: Msg = { id: 'tm-2', type: 'tool', text: 'call_2 → {"city":"Rome","tempC":22}', toolCallId: 'call_2' };
  const AI_FINAL: Msg = { id: 'ai-2', type: 'ai', text: 'Paris 14 °C, Rome 22 °C: Rome is warmer.' };
  const invokeCaption = `invoke({ messages: [HumanMessage] }, { configurable: { thread_id: '${THREAD_ID}' }, recursionLimit: ${L} }). The input is merged and checkpoint c0 is saved with next ['agent'] (LangGraph's separate step -1 input checkpoint is folded into c0 here).`;

  const doneFrame = (caption: string) => {
    status = 'done';
    push('end', caption, { activeNode: 'END', activeEdge: 'agent-end' });
  };

  // ---------------------------------------------------------------- scenarios
  if (params.scenario === 'loop') {
    intro(`Compiled with a MemorySaver checkpointer, so every superstep is saved to thread '${THREAD_ID}'.`);
    schema();
    startInvoke(HUMAN_WEATHER, invokeCaption);
    const u1: NodeUpdate = { messages: [AI_CALLS], llmCalls: 1, lastNode: 'agent' };
    run('agent');
    push('node', `Superstep 1: agent calls the model, which answers with an AIMessage holding two tool_calls. The node returns only a partial update; nothing is merged yet.`, {
      activeNode: 'agent',
      activeEdge: 'start-agent',
      update: { node: 'agent', lines: describeUpdate(u1) },
      predict: 'The update holds just one message and llmCalls: 1. After the reducers merge it, how many messages are in state and what is llmCalls?',
    });
    let d = merge(u1);
    save(['tools']);
    push('merge', `Reducers merge it: messages appends (now ${st.messages.length}), llmCalls sums 0 + 1 = 1 and lastNode is overwritten. Checkpoint c1 is saved with next ['tools'].`, {
      activeNode: 'agent',
      update: { node: 'agent', lines: describeUpdate(u1) },
      delta: d,
    });
    push('route', `route(state): the last AIMessage has tool_calls and weather is read-only, so the conditional edge returns 'tools' (toolsCondition would do the same).`, { activeNode: 'agent', activeEdge: 'agent-tools' });
    const u2: NodeUpdate = { messages: [TOOL_PARIS, TOOL_ROME], lastNode: 'tools' };
    run('tools');
    push('node', `Superstep 2: ToolNode runs both tool_calls in parallel and returns one ToolMessage per call id. It sends no llmCalls key.`, {
      activeNode: 'tools',
      activeEdge: 'agent-tools',
      update: { node: 'tools', lines: describeUpdate(u2) },
      predict: "lastNode currently says 'agent' and the update says 'tools'; llmCalls is missing from the update. What will each field hold after the merge?",
    });
    d = merge(u2);
    save(['agent']);
    push('merge', `Merged: 2 messages appended, lastNode overwritten to 'tools', and llmCalls stays 1 because a key absent from the update is left untouched. Checkpoint c2 has next ['agent'].`, {
      activeNode: 'tools',
      update: { node: 'tools', lines: describeUpdate(u2) },
      delta: d,
    });
    const u3: NodeUpdate = { messages: [AI_FINAL], llmCalls: 1, lastNode: 'agent' };
    run('agent');
    push('node', `Superstep 3: the edge tools → agent loops back. The model now sees both ToolMessages and replies with plain text, no tool_calls.`, {
      activeNode: 'agent',
      activeEdge: 'tools-agent',
      update: { node: 'agent', lines: describeUpdate(u3) },
    });
    d = merge(u3);
    save([]);
    push('merge', `Merged: llmCalls sums 1 + 1 = 2. route(state) finds no tool_calls and returns END, so checkpoint c3 has next [] (finished).`, {
      activeNode: 'agent',
      activeEdge: 'agent-end',
      update: { node: 'agent', lines: describeUpdate(u3) },
      delta: d,
    });
    doneFrame(`invoke() resolves with the final state after ${superstep} supersteps, well under recursionLimit ${L}. getState(config).next is [], so a new user message would start the next turn on the same thread.`);
    push('history', `getStateHistory({ configurable: { thread_id: '${THREAD_ID}' } }) yields c3, c2, c1, c0 (newest first). Each snapshot has values, next and a config you can resume or replay from.`, { activeNode: 'END' });
    push('recap', `Recap: nodes return partial updates, reducers decide how they merge (append, sum or overwrite), conditional edges pick the next node, and every superstep leaves a checkpoint on the thread.`);
    return frames;
  }

  if (params.scenario === 'recursion') {
    intro(`This time the weather API is down and the router has no step counter: it returns 'tools' whenever the last AIMessage has tool_calls.`);
    schema();
    startInvoke({ id: 'h-1', type: 'human', text: 'Weather in Paris?' }, invokeCaption, 'The weather tool will fail every time. Will this graph ever reach END on its own?');
    let aiN = 0;
    let tmN = 0;
    let prev: NodeId = 'START';
    let node: NodeId = 'agent';
    let first = true;
    while (true) {
      if (!canRun(node, prev)) break;
      run(node);
      let u: NodeUpdate;
      if (node === 'agent') {
        aiN++;
        u = { messages: [{ id: `ai-${aiN}`, type: 'ai', text: `tool_calls: weather(Paris)${aiN > 1 ? ' (retry)' : ''}`, toolCalls: [`call_${aiN}`] }], llmCalls: 1, lastNode: 'agent' };
      } else {
        tmN++;
        u = { messages: [{ id: `tm-${tmN}`, type: 'tool', text: `call_${tmN} → Error: weather API 503`, toolCallId: `call_${tmN}`, error: true }], lastNode: 'tools' };
      }
      // route(state) after agent (tool_calls → 'tools'); tools always edges back to agent
      const nextAfter = (): NodeId => (node === 'agent' ? route() : 'agent');
      let nextNode: NodeId = 'agent';
      const edge = edgeOf(prev, node);
      if (superstep <= 2) {
        push(
          'node',
          node === 'agent'
            ? `Superstep 1: agent asks the model, which calls weather(Paris). Update: one AIMessage, llmCalls: 1, lastNode: 'agent'.`
            : `Superstep 2: ToolNode runs the call, the API answers 503, and ToolNode turns the failure into a ToolMessage with the error text instead of crashing the graph.`,
          { activeNode: node, activeEdge: edge, update: { node, lines: describeUpdate(u) } },
        );
        const d = merge(u);
        nextNode = nextAfter();
        save(NEXT(nextNode));
        push(
          'merge',
          node === 'agent'
            ? `Merged (messages appended, llmCalls 0 + 1 = 1). Checkpoint c1 saved with next ['tools'].`
            : `Merged; checkpoint c2 saved with next ['agent']. The model will see the error and, like many models, simply try again.`,
          {
            activeNode: node,
            update: { node, lines: describeUpdate(u) },
            delta: d,
            predict: first ? undefined : `The API stays down and the router never returns END. With recursionLimit ${L}, after which superstep does the run stop, and how?`,
          },
        );
        first = false;
      } else {
        const d = merge(u);
        nextNode = nextAfter();
        save(NEXT(nextNode));
        push(
          'node',
          node === 'agent'
            ? `Superstep ${superstep}: agent retries weather(Paris) (llmCalls ${d.llmCalls}). Checkpoint c${head} saved; ${L - superstep} superstep${L - superstep === 1 ? '' : 's'} left before the limit.`
            : `Superstep ${superstep}: tools fails again with 503 and appends another error ToolMessage. Checkpoint c${head} saved; ${L - superstep} superstep${L - superstep === 1 ? '' : 's'} left.`,
          { activeNode: node, activeEdge: edge, update: { node, lines: describeUpdate(u) }, delta: d },
        );
      }
      prev = node;
      node = nextNode;
    }
    push(
      'aftermath',
      `Nothing is lost: getState(config).next is ['${node}'] and all ${ckpts.length} checkpoints are on the thread. Resuming with a higher limit would only buy more failing rounds, at one LLM call each.`,
      { activeNode: node, blockedNext: node },
    );
    push(
      'recap',
      `Fix the cause, not the limit: count tool rounds in state and route to a giveUp node at the cap, and size recursionLimit from the design (e.g. 2 × max rounds + a few). It is a circuit breaker (default 25), set as a top-level config key.`,
      { blockedNext: node },
    );
    return frames;
  }

  if (params.scenario === 'interrupt') {
    intro(`human_review calls interrupt() before a sensitive tool runs, which requires a checkpointer and a thread_id.`);
    startInvoke(
      { id: 'h-1', type: 'human', text: 'Email the Q3 summary to the CFO.' },
      `invoke({ messages: [HumanMessage] }, { configurable: { thread_id: '${THREAD_ID}' } }): the input is merged and checkpoint c0 is saved with next ['agent'].`,
    );
    const call: Msg = { id: 'ai-1', type: 'ai', text: "tool_calls: send_email(to: 'cfo@acme.com')", toolCalls: ['call_7'] };
    const u1: NodeUpdate = { messages: [call], llmCalls: 1, lastNode: 'agent' };
    run('agent');
    let d = merge(u1);
    save(['human_review']);
    push('node', `Superstep 1: agent proposes send_email to cfo@acme.com (tool call id call_7). Merged (llmCalls 0 + 1 = 1) and checkpoint c1 saved with next ['human_review'].`, {
      activeNode: 'agent',
      activeEdge: 'start-agent',
      update: { node: 'agent', lines: describeUpdate(u1) },
      delta: d,
    });
    push('route', `route(state): the tool call is send_email, which is on the sensitive list, so the conditional edge returns 'human_review' instead of 'tools'.`, { activeNode: 'agent', activeEdge: 'agent-review' });
    run('human_review');
    push('node', `Superstep 2: human_review starts and calls interrupt({ toolCalls }). interrupt() works by throwing, so the node stops right there and returns no update.`, {
      activeNode: 'human_review',
      activeEdge: 'agent-review',
      update: { node: 'human_review', lines: ['interrupt({ toolCalls: [send_email …] })', '→ throws; no state update returned'] },
      predict: 'The graph is interrupted. What is persisted, and when you resume, where does execution restart?',
    });
    status = 'interrupted';
    ckpts[head!].interrupt = true;
    const pausedAt = head!;
    push(
      'paused',
      `Paused, without writing a new checkpoint: the interrupt payload is stored as a pending write on c1, whose next is still ['human_review']. invoke() returns the state with __interrupt__: [{ value: { toolCalls } }], and the process can exit.`,
      { activeNode: 'human_review' },
    );
    push(
      'review',
      `Hours later, getState(config) still shows next ['human_review'] and the payload in tasks[0].interrupts. The reviewer reads it and decides to ${params.decision} the email.`,
      { activeNode: 'human_review' },
    );
    invoke = 2;
    superstep = 0;
    status = 'running';
    resumedFrom = head;
    push(
      'resume',
      `invoke(new Command({ resume: { action: '${params.decision}' } }), { configurable: { thread_id: '${THREAD_ID}' } }) loads the latest checkpoint, c${pausedAt}. The superstep count restarts for this invoke.`,
      { activeNode: 'human_review', predict: 'Does human_review continue from the line after interrupt(), or start again from its first line?' },
    );
    run('human_review');
    push(
      'rerun',
      `human_review re-runs from its FIRST line (code before interrupt() runs twice, so keep it side-effect free). This time interrupt() returns { action: '${params.decision}' } instead of throwing.`,
      { activeNode: 'human_review', update: { node: 'human_review', lines: [`interrupt(…) → { action: '${params.decision}' }`] } },
    );
    if (params.decision === 'approve') {
      const u2: NodeUpdate = { lastNode: 'human_review' };
      d = merge(u2);
      save(['tools']);
      push('merge', `It returns Command({ goto: 'tools', update: { lastNode: 'human_review' } }). Only lastNode changes (overwrite); checkpoint c${head} is saved with next ['tools'].`, {
        activeNode: 'human_review',
        activeEdge: 'review-tools',
        update: { node: 'human_review', lines: ["Command({ goto: 'tools',", "  update: { lastNode: 'human_review' } })"] },
        delta: d,
      });
      const u3: NodeUpdate = { messages: [{ id: 'tm-1', type: 'tool', text: 'call_7 → {"sent":true,"id":"msg_88"}', toolCallId: 'call_7' }], lastNode: 'tools' };
      run('tools');
      d = merge(u3);
      save(['agent']);
      push('node', `Superstep 2 of this invoke: tools finally runs send_email and appends a ToolMessage answering call_7. Checkpoint c${head} has next ['agent'].`, {
        activeNode: 'tools',
        activeEdge: 'review-tools',
        update: { node: 'tools', lines: describeUpdate(u3) },
        delta: d,
      });
      const u4: NodeUpdate = { messages: [{ id: 'ai-2', type: 'ai', text: 'Done: the Q3 summary was sent to the CFO.' }], llmCalls: 1, lastNode: 'agent' };
      run('agent');
      d = merge(u4);
      save([]);
      push('node', `Superstep 3: agent confirms in plain text (llmCalls ${d.llmCalls}); no tool_calls, so route returns END and c${head} has next [].`, {
        activeNode: 'agent',
        activeEdge: 'tools-agent',
        update: { node: 'agent', lines: describeUpdate(u4) },
        delta: d,
      });
      doneFrame(`Recap: the run spanned two invokes and a pause of any length. State lived in the checkpointer, the resume picked up at c${pausedAt}, and the email was sent only after approval.`);
    } else {
      const u2: NodeUpdate = { messages: [{ id: 'tm-1', type: 'tool', text: 'call_7 → Rejected: not before earnings', toolCallId: 'call_7', error: true }], lastNode: 'human_review' };
      d = merge(u2);
      save(['agent']);
      push('merge', `It returns Command({ goto: 'agent', update }) with a ToolMessage answering call_7: "Rejected by reviewer: not before earnings". Every tool call still gets a result, so the history stays valid; c${head} has next ['agent'].`, {
        activeNode: 'human_review',
        activeEdge: 'review-agent',
        update: { node: 'human_review', lines: ["Command({ goto: 'agent', update: {", '  messages: [ToolMessage tm-1 (rejected)],', "  lastNode: 'human_review' } })"] },
        delta: d,
      });
      const u3: NodeUpdate = { messages: [{ id: 'ai-2', type: 'ai', text: "Understood, I won't send it before earnings." }], llmCalls: 1, lastNode: 'agent' };
      run('agent');
      d = merge(u3);
      save([]);
      push('node', `Superstep 2 of this invoke: agent reads the rejection and replies in text (llmCalls ${d.llmCalls}). No tool_calls, so route returns END; c${head} has next [].`, {
        activeNode: 'agent',
        activeEdge: 'review-agent',
        update: { node: 'agent', lines: describeUpdate(u3) },
        delta: d,
      });
      doneFrame(`Recap: send_email never ran. The pause survived in the checkpointer, the resume picked up at c${pausedAt}, and the rejection reached the model as an ordinary ToolMessage it could act on.`);
    }
    return frames;
  }

  // ---------------------------------------------------------------- time travel
  push('intro', `The same agent ↔ tools graph, compiled with a checkpointer, so every superstep writes a checkpoint to thread '${THREAD_ID}'. First run the loop to the end, then rewind it.`);
  startInvoke(HUMAN_WEATHER, invokeCaption);
  run('agent');
  let d = merge({ messages: [AI_CALLS], llmCalls: 1, lastNode: 'agent' });
  save(['tools']);
  push('node', `Superstep 1: agent asks for weather(Paris) and weather(Rome) in AIMessage ai-1. Checkpoint c1 has next ['tools'].`, {
    activeNode: 'agent',
    activeEdge: 'start-agent',
    update: { node: 'agent', lines: describeUpdate({ messages: [AI_CALLS], llmCalls: 1, lastNode: 'agent' }) },
    delta: d,
  });
  run('tools');
  d = merge({ messages: [TOOL_PARIS, TOOL_ROME], lastNode: 'tools' });
  save(['agent']);
  push('node', `Superstep 2: tools appends two ToolMessages (Paris 14 °C, Rome 22 °C). Checkpoint c2 has next ['agent'].`, {
    activeNode: 'tools',
    activeEdge: 'agent-tools',
    update: { node: 'tools', lines: describeUpdate({ messages: [TOOL_PARIS, TOOL_ROME], lastNode: 'tools' }) },
    delta: d,
  });
  run('agent');
  d = merge({ messages: [AI_FINAL], llmCalls: 1, lastNode: 'agent' });
  save([]);
  status = 'done';
  push('node', `Superstep 3: agent answers "Rome is warmer" and the run ends; c3 has next []. The thread now holds four checkpoints.`, {
    activeNode: 'agent',
    activeEdge: 'tools-agent',
    update: { node: 'agent', lines: describeUpdate({ messages: [AI_FINAL], llmCalls: 1, lastNode: 'agent' }) },
    delta: d,
  });
  push('history', `getStateHistory(config) yields c3, c2, c1, c0, newest first. c1 is the snapshot whose next is ['tools']: the moment just before the tools ran.`, {
    predict: 'You call invoke(null, c1.config). Which nodes run again, and do they reuse the results stored in c2 and c3?',
  });
  branch = 1;
  invoke = 2;
  superstep = 0;
  status = 'running';
  restore(1);
  resumedFrom = 1;
  push('replay', `Replay: invoke(null, c1.config) loads c1's values (2 messages, llmCalls 1). Nodes before c1 are skipped, and everything after it executes again rather than being read from c2/c3.`, { activeNode: 'tools' });
  const ROME_23: Msg = { ...TOOL_ROME, text: 'call_2 → {"city":"Rome","tempC":23}' };
  run('tools');
  d = merge({ messages: [TOOL_PARIS, ROME_23], lastNode: 'tools' });
  save(['agent'], 'loop', 1);
  push('node', `tools really calls the weather API again, and Rome now reads 23 °C. New checkpoint c${head} has parent c1, so the history branches; c2 and c3 are untouched.`, {
    activeNode: 'tools',
    activeEdge: 'agent-tools',
    update: { node: 'tools', lines: describeUpdate({ messages: [TOOL_PARIS, ROME_23], lastNode: 'tools' }) },
    delta: d,
  });
  run('agent');
  const AI_FINAL_R: Msg = { id: 'ai-2', type: 'ai', text: 'Paris 14 °C, Rome 23 °C: Rome is warmer.' };
  d = merge({ messages: [AI_FINAL_R], llmCalls: 1, lastNode: 'agent' });
  save([]);
  status = 'done';
  push('node', `agent makes a fresh LLM call (llmCalls ${d.llmCalls}) and finishes at c${head}. Replays cost real tokens and can differ from the original, so make side-effecting nodes idempotent.`, {
    activeNode: 'agent',
    activeEdge: 'tools-agent',
    update: { node: 'agent', lines: describeUpdate({ messages: [AI_FINAL_R], llmCalls: 1, lastNode: 'agent' }) },
    delta: d,
  });
  branch = 2;
  restore(1);
  resumedFrom = null;
  status = 'idle';
  const AI_EDIT: Msg = { id: 'ai-1', type: 'ai', text: 'tool_calls: weather(Paris), weather(Madrid)', toolCalls: ['call_1', 'call_2'] };
  push('fork', `Fork: updateState(c1.config, { messages: [AIMessage] }) with an edited message that keeps id ai-1 but asks for Madrid instead of Rome.`, {
    update: { node: 'updateState', lines: ['{ messages: [AIMessage ai-1', '   (weather(Paris), weather(Madrid))] }'] },
    predict: 'The patch carries an AIMessage with the SAME id as the one already in c1. Will messages grow to 3, or stay at 2?',
  });
  d = merge({ messages: [AI_EDIT] });
  save(['tools'], 'update', 1);
  push('fork', `It stays at 2: the add-messages reducer REPLACES a message with the same id. updateState writes a new checkpoint c${head} (parent c1, next ['tools']) and returns its config; history is never rewritten.`, {
    update: { node: 'updateState', lines: ['{ messages: [AIMessage ai-1', '   (weather(Paris), weather(Madrid))] }'] },
    delta: d,
  });
  invoke = 3;
  superstep = 0;
  status = 'running';
  resumedFrom = head;
  const TOOL_MADRID: Msg = { id: 'tm-2', type: 'tool', text: 'call_2 → {"city":"Madrid","tempC":25}', toolCallId: 'call_2' };
  run('tools');
  d = merge({ messages: [TOOL_PARIS, TOOL_MADRID], lastNode: 'tools' });
  save(['agent']);
  push('node', `invoke(null, forkConfig) continues from c${resumedFrom}: tools fetches Paris and Madrid. Checkpoint c${head} extends the fork branch.`, {
    activeNode: 'tools',
    activeEdge: 'agent-tools',
    update: { node: 'tools', lines: describeUpdate({ messages: [TOOL_PARIS, TOOL_MADRID], lastNode: 'tools' }) },
    delta: d,
  });
  const AI_FORK: Msg = { id: 'ai-2', type: 'ai', text: 'Paris 14 °C, Madrid 25 °C: Madrid is warmer.' };
  run('agent');
  d = merge({ messages: [AI_FORK], llmCalls: 1, lastNode: 'agent' });
  save([]);
  status = 'done';
  push('node', `agent answers for Madrid (llmCalls ${d.llmCalls}: the fork started from c1's value of 1) and the fork ends at c${head}.`, {
    activeNode: 'agent',
    activeEdge: 'tools-agent',
    update: { node: 'agent', lines: describeUpdate({ messages: [AI_FORK], llmCalls: 1, lastNode: 'agent' }) },
    delta: d,
  });
  push('recap', `Recap: one thread, three branches. invoke(null, checkpoint.config) replays (nodes re-execute), updateState forks with a new checkpoint, and the original run c0–c3 is still there to compare against.`);
  return frames;
}

export function edgeOf(from: NodeId, to: NodeId): EdgeId | null {
  const k = `${from}-${to}`;
  const map: Record<string, EdgeId> = {
    'START-agent': 'start-agent',
    'agent-tools': 'agent-tools',
    'agent-human_review': 'agent-review',
    'agent-END': 'agent-end',
    'tools-agent': 'tools-agent',
    'human_review-tools': 'review-tools',
    'human_review-agent': 'review-agent',
  };
  return map[k] ?? null;
}
