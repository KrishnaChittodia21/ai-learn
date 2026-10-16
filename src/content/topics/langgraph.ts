import type { Topic } from '../../types';

const topic: Topic = {
  id: 'langgraph',
  phase: 'frameworks',
  order: 2,
  title: 'LangGraph',
  subtitle:
    'Stateful agent graphs in TypeScript: state and reducers, conditional loops, checkpoints and time travel, streaming, interrupt() approvals, subgraphs and Send fan-out, long-term memory and production practice',
  estimatedMinutes: 76,
  sources: [
    'LangGraph JS docs — Graph API: StateGraph, Annotation / StateSchema, reducers, addConditionalEdges, Command, Send, recursionLimit (docs.langchain.com/oss/javascript/langgraph/graph-api)',
    'LangGraph JS docs — Checkpointers and Persistence: MemorySaver, SqliteSaver, PostgresSaver, getState, getStateHistory, updateState, durability modes',
    'LangGraph JS docs — Time travel: replay with a snapshot config and fork with updateState',
    'LangGraph JS docs — Streaming: values, updates, messages, custom (config.writer), debug, subgraphs: true',
    'LangGraph JS docs — Interrupts: interrupt(), Command({ resume }), resume maps by interrupt id, interruptBefore / interruptAfter',
    'LangGraph JS docs — Subgraphs: compiled graph as a node, invoking a subgraph inside a node, checkpointer inheritance',
    'LangGraph JS docs — Memory stores: InMemoryStore, put / search, namespaces, semantic index',
    'LangGraph JS docs — Test: graph.nodes[name].invoke, partial execution with updateState(asNode) and interruptAfter',
    'LangGraph v1 release notes (JS) — createReactAgent deprecated in favour of createAgent from "langchain"; graph primitives unchanged',
  ],
  tags: ['frameworks', 'langgraph', 'agents', 'state-machines', 'checkpointing', 'streaming', 'human-in-the-loop', 'typescript'],
  cheatSheet: [
    'Graph = state schema + nodes (fn(state) → partial update) + edges; new StateGraph(State)…compile() before invoke/stream.',
    'Keys without a reducer are last-write-wins; lists written by several nodes need a reducer (concat, messagesStateReducer / MessagesValue).',
    'addConditionalEdges(from, router, [targets]) routes; a cycle agent → tools → agent is just an edge back. Use toolsCondition + ToolNode for tool loops.',
    'recursionLimit (default 25 supersteps) is a top-level config key; exceeding it throws GraphRecursionError. Budget steps in state and route to a graceful END.',
    'compile({ checkpointer }) + configurable.thread_id = persistent threads. MemorySaver (dev), SqliteSaver (local), PostgresSaver + setup() (prod).',
    'getState → latest StateSnapshot (values, next, config, tasks); getStateHistory → newest first; invoke(null, snapshot.config) replays; updateState(snapshot.config, patch) forks.',
    'Resume after a crash with invoke(null, sameConfig); successful parallel writes are kept as pending writes. Make side-effecting nodes idempotent.',
    'streamMode: values (full state), updates (per-node delta), messages ([chunk, metadata] tokens), custom (config.writer). Arrays → [mode, chunk]; subgraphs: true → [namespace, chunk].',
    'interrupt(payload) pauses (needs a checkpointer) and the node re-runs from the top on Command({ resume }); interruptBefore/After are static breakpoints resumed with invoke(null, config).',
    'Send(node, payload) fans out map-reduce workers in one superstep; Store (InMemoryStore / PostgresStore) holds cross-thread memory under namespaces like [userId, "memories"].',
  ],
  sections: [
    {
      heading: 'LangGraph Fundamentals — StateGraph, state schema, reducers, nodes and edges',
      body: `**Intuition:** a chain is a straight pipe and an agent loop is a \`while\` hidden inside a function. LangGraph makes the flowchart explicit: **nodes** are functions, **edges** are arrows, and one shared **state** object flows through them.

| Approach | Control flow | Good for |
|---|---|---|
| Chain (LCEL / plain calls) | fixed, linear | prompt → model → parser |
| Hand-written agent loop | hidden in code | quick prototypes |
| LangGraph \`StateGraph\` | explicit graph, cycles allowed | branching, loops, pause/resume, parallelism |

**Mechanics (\`@langchain/langgraph\`)**
- **State schema:** \`Annotation.Root({ ... })\` (classic) or \`new StateSchema({ ... })\` with zod fields (v1 style). \`MessagesAnnotation\` / \`MessagesValue\` give a ready-made \`messages\` channel.
- **Reducers:** \`(current, update) => next\`. No reducer = last write wins. A list that several nodes append to needs one (\`(a, b) => a.concat(b)\`); the messages reducer appends and replaces by message id.
- **Nodes:** \`addNode(name, fn)\`; \`fn(state, config)\` returns a *partial* update, never the whole state.
- **Edges:** \`addEdge(START, 'a')\`, \`addEdge('a', 'b')\`, \`addEdge('b', END)\`.
- **Compile:** \`.compile()\` validates the graph (unknown nodes, missing entry) and returns a runnable with \`invoke\`, \`stream\`, \`getState\`.

**Execution model:** nodes that are ready together run in one **superstep**; their updates are merged through reducers, then the next superstep starts.

**When to use:** whenever you need loops, branches, retries, human pauses or resumable runs. For a single prompt → answer call, a plain SDK call is simpler.`,
      example: `**Ticket triage, 3 nodes.** Input state: \`{ ticket: 'I was charged twice for order 5512', log: [] }\`.

1. \`classify\` → \`{ category: 'billing', log: ['classify'] }\`
2. \`extract\` → \`{ orderId: '5512', log: ['extract'] }\`
3. \`reply\` → \`{ answer: 'Refund for duplicate charge on 5512 opened.', log: ['reply'] }\`

Final state with \`log\` using a concat reducer: \`log = ['classify', 'extract', 'reply']\`, \`category = 'billing'\`, \`orderId = '5512'\`.

Same graph **without** the reducer: \`log = ['reply']\`: each node silently overwrote the previous value. Nothing errors in a sequential graph, so this bug shows up only as a missing audit trail. That is why reducers are the first thing to design.`,
      diagram: `   START
     │      state = { ticket, category?, orderId?, answer?, log[] }
     ▼
 [classify] ── returns { category, log:['classify'] }
     │                       │
     ▼                       ▼ reducer: log = log.concat(update)
 [extract]  ── returns { orderId, log:['extract'] }
     │
     ▼
  [reply]   ── returns { answer, log:['reply'] }
     │
     ▼
    END   → final state = merge of every partial update`,
      code: [
        {
          language: 'typescript',
          title: 'State with reducers, three nodes, compile and invoke',
          code: `import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ model: process.env.LLM_MODEL ?? 'claude-sonnet-5-5' }); // Claude 5.x rejects temperature 0

const TriageState = Annotation.Root({
  ticket: Annotation<string>(),                  // last-write-wins
  category: Annotation<string>(),
  orderId: Annotation<string | null>(),
  answer: Annotation<string>(),
  log: Annotation<string[]>({                    // several nodes append → reducer
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});
type S = typeof TriageState.State;

const classify = async (s: S) => {
  const r = await model.invoke('One word (billing|shipping|other) for: ' + s.ticket);
  return { category: r.text.trim().toLowerCase(), log: ['classify'] }; // .text skips thinking blocks
};
const extract = async (s: S) => ({
  orderId: s.ticket.match(/order\\s+(\\d+)/i)?.[1] ?? null, // deterministic step, no LLM needed
  log: ['extract'],
});
const reply = async (s: S) => ({
  answer: 'Opened a ' + s.category + ' case for order ' + (s.orderId ?? 'unknown') + '.',
  log: ['reply'],
});

export const triage = new StateGraph(TriageState)
  .addNode('classify', classify)
  .addNode('extract', extract)
  .addNode('reply', reply)
  .addEdge(START, 'classify')
  .addEdge('classify', 'extract')
  .addEdge('extract', 'reply')
  .addEdge('reply', END)
  .compile();

const out = await triage.invoke({ ticket: 'I was charged twice for order 5512' });
console.log(out.category, out.orderId, out.log); // billing 5512 ['classify','extract','reply']`,
        },
        {
          language: 'typescript',
          title: 'Same idea with the v1 zod-based StateSchema',
          code: `import { StateSchema, ReducedValue, MessagesValue, StateGraph, START, END } from '@langchain/langgraph';
import { z } from 'zod/v4';

const ChatState = new StateSchema({
  messages: MessagesValue,                       // appends; replaces messages with the same id
  turns: z.number().default(0),                  // plain schema = last-write-wins
  log: new ReducedValue(z.array(z.string()).default(() => []), {
    inputSchema: z.string(),                     // nodes write one string at a time
    reducer: (current, next) => [...current, next],
  }),
});

const graph = new StateGraph(ChatState)
  .addNode('bump', (s) => ({ turns: s.turns + 1, log: 'bump' }))
  .addEdge(START, 'bump')
  .addEdge('bump', END)
  .compile();`,
        },
      ],
      prosCons: {
        pros: [
          'Control flow is code you can read, test and draw, not an instruction buried in a prompt.',
          'Reducers make merging updates explicit, which is what later enables safe parallel branches.',
          'Deterministic steps (regex, DB lookups) sit beside LLM steps as ordinary nodes, cutting cost and variance.',
        ],
        cons: [
          { con: 'Forgetting a reducer silently overwrites list fields in sequential graphs.', fix: 'Decide per key: scalar = last-write-wins, list or messages = reducer; add a unit test asserting the final log length.' },
          { con: 'More boilerplate than one SDK call for a trivial task.', fix: 'Use a graph only when you need branching, loops or persistence; otherwise keep a plain function and migrate later.' },
          { con: 'State can turn into a grab bag of loosely typed fields.', fix: 'Type the schema (Annotation generics or zod), keep large blobs out of state (store ids), and use private input/output schemas for internal keys.' },
        ],
      },
      keyPoints: [
        'Nodes return partial updates; reducers decide how they merge.',
        'No reducer = last write wins; lists and messages need one.',
        'You must compile() before invoke() or stream().',
        'One superstep = all ready nodes run, then updates merge.',
      ],
      exercise: {
        prompt: `Build a **word-stats** graph.

State: \`{ text: string; words: number; tags: string[] }\` where \`tags\` has a concat reducer and default \`[]\`.
- \`count\` sets \`words\` and adds the tag \`'counted'\`.
- \`label\` adds \`'long'\` if \`words > 50\`, else \`'short'\`.
- Wire START → count → label → END, compile, and invoke with a 60-word string.

**Acceptance:** \`tags\` equals \`['counted', 'long']\` and \`words\` equals 60.`,
        starter: {
          language: 'typescript',
          code: `import { Annotation, StateGraph, START, END } from '@langchain/langgraph';

const State = Annotation.Root({
  text: Annotation<string>(),
  words: Annotation<number>(),
  // TODO: tags with a concat reducer and default []
});

// TODO: count and label nodes
// TODO: build, compile, invoke`,
        },
        hints: [
          'Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }).',
          'Count words with text.trim().split(/\\s+/).length.',
          'Each node returns only the keys it changes, e.g. { tags: [\'long\'] }.',
        ],
        solution: {
          language: 'typescript',
          code: `import { Annotation, StateGraph, START, END } from '@langchain/langgraph';

const State = Annotation.Root({
  text: Annotation<string>(),
  words: Annotation<number>(),
  tags: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});
type S = typeof State.State;

const graph = new StateGraph(State)
  .addNode('count', (s: S) => ({ words: s.text.trim().split(/\\s+/).length, tags: ['counted'] }))
  .addNode('label', (s: S) => ({ tags: [s.words > 50 ? 'long' : 'short'] }))
  .addEdge(START, 'count')
  .addEdge('count', 'label')
  .addEdge('label', END)
  .compile();

const text = Array.from({ length: 60 }, (_, i) => 'w' + i).join(' ');
const out = await graph.invoke({ text });
console.log(out.words, out.tags); // 60 ['counted', 'long']`,
        },
        explanation: 'Because tags has a reducer, both nodes contribute and the result accumulates; words has none, so count simply sets it. Removing the reducer would leave tags = [\'long\'] with no error, which is the classic silent bug.',
      },
      quickCheck: {
        question: 'State has tags = [\'a\'] and the tags key has NO reducer. A node returns { tags: [\'b\'] }. What is tags afterwards?',
        options: ['[\'a\', \'b\']', '[\'b\']', 'An error is thrown because the key already has a value', '[\'a\'] because existing values are protected'],
        correct: 1,
        explanation: 'Without a reducer a channel is last-write-wins, so the update replaces the value. Appending only happens if you declare a concat reducer; errors only occur when two nodes write the same reducer-less key in the same superstep.',
      },
      source: 'LangGraph JS docs — Graph API (state, reducers, nodes, edges)',
    },
    {
      heading: 'Conditional Edges and Cycles — routers, agent ↔ tools loops and recursion limits',
      body: `**Intuition:** a conditional edge is a traffic light. After a node runs, a small **routing function** reads the state and says which node goes next. Point an edge back to an earlier node and you have a loop: the core of every agent.

**Mechanics**
- \`addConditionalEdges('agent', route, ['tools', END])\`: \`route(state)\` returns a node name, \`END\`, or an array of names (parallel). The third argument lists possible targets so the graph can be drawn and validated.
- **Cycles:** \`addEdge('tools', 'agent')\` closes the loop agent → tools → agent.
- **\`ToolNode\`** (\`@langchain/langgraph/prebuilt\`) runs every \`tool_calls\` entry of the last AI message (in parallel) and appends one \`ToolMessage\` per call. **\`toolsCondition\`** returns \`'tools'\` if there are tool calls, else \`END\`.
- **\`recursionLimit\`** (default **25 supersteps**) is a top-level config key, not inside \`configurable\`. Exceeding it throws \`GraphRecursionError\`. It is a circuit breaker, not a budget: also count steps in state and route to a graceful exit.

**Prebuilt vs hand-built**

| Option | Use when |
|---|---|
| \`createAgent\` from \`langchain\` (v1; replaces the deprecated \`createReactAgent\`) | standard tool-calling agent, middleware for HITL, summarisation |
| Hand-built \`StateGraph\` | custom routing, extra nodes (validation, budget, approval), parallel branches |

**When to use:** reach for the prebuilt first; drop to a hand-built graph the moment you need a node the prebuilt cannot express.`,
      example: `**"Compare today's weather in Paris and Rome."**

- Superstep 1 \`agent\`: the model returns one AI message with 2 tool calls (\`weather({city:'Paris'})\`, \`weather({city:'Rome'})\`). \`toolsCondition\` → \`'tools'\`.
- Superstep 2 \`tools\`: \`ToolNode\` runs both calls concurrently (~300 ms instead of ~600 ms) and appends 2 \`ToolMessage\`s.
- Superstep 3 \`agent\`: no tool calls → \`END\`. Answer: "Paris 14 °C rain, Rome 22 °C sun."

**Failure case:** the weather API is down and returns an error string; the model retries the tool forever. Each round costs 2 supersteps, so the default limit stops it after ~12 rounds with \`GraphRecursionError\` (≈ 12 LLM calls, ~$0.25 at illustrative prices). With a \`toolRounds\` counter capped at 3, the run instead ends after 3 rounds with "The weather service is unavailable, please try later."`,
      diagram: `          START
            │
            ▼
   ┌──── [agent] ◄──────────────┐
   │        │                    │
   │  route(state)               │ addEdge('tools','agent')
   │   ├─ tool_calls & rounds<3 ─► [tools] (ToolNode, parallel calls)
   │   ├─ rounds >= 3 ──► [giveUp] ──► END
   │   └─ no tool_calls ─────────────► END
   │
   └─ recursionLimit (default 25) = hard circuit breaker
      step budget in state      = graceful exit`,
      code: [
        {
          language: 'typescript',
          title: 'Hand-built agent loop with ToolNode, a router, a step budget and a recursion guard',
          code: `import { StateGraph, MessagesAnnotation, Annotation, START, END, GraphRecursionError } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';

const weather = tool(async ({ city }) => JSON.stringify({ city, tempC: 14, sky: 'rain' }), {
  name: 'weather', description: 'Current weather for a city', schema: z.object({ city: z.string() }),
});
const tools = [weather];
const model = new ChatAnthropic({ model: process.env.LLM_MODEL ?? 'claude-sonnet-5-5' }).bindTools(tools);

const State = Annotation.Root({
  ...MessagesAnnotation.spec,                           // messages channel with the append-by-id reducer
  toolRounds: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});
type S = typeof State.State;
const MAX_ROUNDS = 3;

const agent = async (s: S) => ({ messages: [await model.invoke(s.messages)] });
const countRound = async (s: S) => ({ toolRounds: s.toolRounds + 1 });
const giveUp = async () => ({ messages: [new AIMessage('I could not finish with the tools available. Please try later.')] });

const route = (s: S) => {
  const last = s.messages.at(-1) as AIMessage;
  if (!last.tool_calls?.length) return END;              // final answer
  return s.toolRounds >= MAX_ROUNDS ? 'giveUp' : 'tools';
};

export const app = new StateGraph(State)
  .addNode('agent', agent)
  .addNode('tools', new ToolNode(tools))
  .addNode('count', countRound)
  .addNode('giveUp', giveUp)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', route, ['tools', 'giveUp', END])
  .addEdge('tools', 'count')
  .addEdge('count', 'agent')                             // the cycle
  .addEdge('giveUp', END)
  .compile();

try {
  await app.invoke({ messages: [{ role: 'user', content: 'Weather in Paris and Rome?' }] }, { recursionLimit: 15 });
} catch (e) {
  if (e instanceof GraphRecursionError) console.error('circuit breaker tripped'); // should never fire now
  else throw e;
}`,
        },
      ],
      prosCons: {
        pros: [
          'Loops and branches are explicit and testable: route() is a pure function you can unit-test.',
          'ToolNode runs multiple tool calls in parallel and formats ToolMessages correctly.',
          'Easy to insert extra nodes (validation, budget, approval) that a prebuilt agent hides.',
        ],
        cons: [
          { con: 'A router that never returns END loops until GraphRecursionError, burning tokens.', fix: 'Keep a step or round counter in state, route to a giveUp node at the cap, and set recursionLimit a little above the expected maximum.' },
          { con: 'Raising recursionLimit to 1000 "to be safe" turns a bug into a large bill.', fix: 'Size the limit from the design (e.g. 2 × max tool rounds + 5) and alert on GraphRecursionError instead of hiding it.' },
          { con: 'Hand-built agents re-implement what createAgent already does.', fix: 'Start with createAgent from langchain; move to a custom StateGraph only for nodes or routing it cannot express.' },
        ],
      },
      keyPoints: [
        'route(state) returns the next node name(s) or END.',
        'A cycle is just an edge back to an earlier node.',
        'ToolNode + toolsCondition implement the standard tool loop.',
        'recursionLimit defaults to 25 and is a top-level config key.',
        'createReactAgent is deprecated in v1; use createAgent from langchain.',
      ],
      exercise: {
        prompt: `Write the **router** for a support agent and unit-test it without any LLM.

\`route(state)\` must return:
- \`END\` if the last message is an AI message without tool calls,
- \`'escalate'\` if \`state.toolRounds >= 4\`,
- \`'tools'\` otherwise.

**Acceptance:** three assertions pass for the three cases using hand-built \`AIMessage\` objects.`,
        starter: {
          language: 'typescript',
          code: `import { END } from '@langchain/langgraph';
import { AIMessage, BaseMessage } from '@langchain/core/messages';

type S = { messages: BaseMessage[]; toolRounds: number };

export function route(s: S) {
  // TODO
}

// TODO: three assertions with node:assert`,
        },
        hints: [
          'Cast the last message: const last = s.messages.at(-1) as AIMessage.',
          'Check "no tool calls" first so a final answer always ends the run, even at the cap.',
          'new AIMessage({ content: \'\', tool_calls: [{ id: \'1\', name: \'lookup\', args: {} }] }) builds a tool-calling message.',
        ],
        solution: {
          language: 'typescript',
          code: `import { END } from '@langchain/langgraph';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import assert from 'node:assert/strict';

type S = { messages: BaseMessage[]; toolRounds: number };

export function route(s: S): 'tools' | 'escalate' | typeof END {
  const last = s.messages.at(-1) as AIMessage;
  if (!last?.tool_calls?.length) return END;    // final answer wins
  if (s.toolRounds >= 4) return 'escalate';     // budget exhausted
  return 'tools';
}

const call = new AIMessage({ content: '', tool_calls: [{ id: '1', name: 'lookup', args: { q: 'x' } }] });
const done = new AIMessage('Here is your answer.');

assert.equal(route({ messages: [done], toolRounds: 0 }), END);
assert.equal(route({ messages: [call], toolRounds: 4 }), 'escalate');
assert.equal(route({ messages: [call], toolRounds: 1 }), 'tools');
console.log('router OK');`,
        },
        explanation: 'Routers are pure functions of state, so they are the cheapest and most valuable part of a graph to test. Ordering the checks so a final answer always ends the run avoids escalating a conversation that was actually finished.',
      },
      quickCheck: {
        question: 'The model returns one AI message with 3 tool calls. With the standard agent → ToolNode loop, how many supersteps does executing those tools take?',
        options: ['3, one per tool call', '1, because ToolNode runs all calls of the message inside a single node execution', '0, tools run inside the agent node', '6, each call needs a tools and an agent step'],
        correct: 1,
        explanation: 'ToolNode is a single node that executes every tool call from the last AI message (concurrently) and returns all ToolMessages at once, so it costs one superstep. That matters when you size recursionLimit: each tool round is 2 supersteps (tools + agent), regardless of how many tools were called.',
      },
      source: 'LangGraph JS docs — Graph API (conditional edges, recursion limit); LangGraph v1 release notes',
    },
    {
      heading: 'Persistence and Checkpointers — threads, state history, time travel and durable execution',
      body: `**Intuition:** a checkpointer is a save-game system. After every superstep LangGraph writes a snapshot of the state for the current **thread**, so you can continue the conversation tomorrow, inspect any past step, rewind, or pick up after a crash.

**Mechanics**
- \`compile({ checkpointer })\`, then every call passes \`{ configurable: { thread_id } }\`. Threads are isolated from each other.

| Checkpointer | Package | Use |
|---|---|---|
| \`MemorySaver\` | \`@langchain/langgraph\` | tests, demos (lost on restart, single process) |
| \`SqliteSaver\` | \`@langchain/langgraph-checkpoint-sqlite\` | local tools, single node |
| \`PostgresSaver\` | \`@langchain/langgraph-checkpoint-postgres\` | production; call \`setup()\` once |

- **Inspect:** \`getState(config)\` → \`StateSnapshot\` (\`values\`, \`next\`, \`config\`, \`tasks\`, \`metadata\`). \`getStateHistory(config)\` yields snapshots **newest first**.
- **Time travel:** \`invoke(null, snapshot.config)\` replays from that checkpoint: earlier nodes are skipped, later nodes re-execute (LLM calls run again). \`updateState(snapshot.config, patch)\` writes a **new** checkpoint (a fork) and returns its config; the original history is untouched.
- **Durable execution:** after a crash, \`invoke(null, { configurable: { thread_id } })\` continues from the last checkpoint. If one node in a parallel superstep fails, the others' results are saved as *pending writes* and are not re-run. \`durability: 'sync' | 'async' | 'exit'\` trades safety for speed.

**When to use:** any multi-turn chat, any run longer than a few seconds, and anything with human pauses. Make side-effecting nodes idempotent, since a node can run again after a crash.`,
      example: `**Nightly research job, thread \`job-981\`**: \`plan → search → read → draft → review\` on Postgres.

The pod is OOM-killed while \`draft\` runs. Checkpoints for \`plan\`, \`search\` and \`read\` are in Postgres. The worker restarts and calls \`invoke(null, { configurable: { thread_id: 'job-981' } })\`: \`getState().next\` is \`['draft']\`, so only \`draft\` and \`review\` run. Saved: 3 LLM calls (~40 s, ~$0.12).

**Time travel:** the report used 2024 data because \`plan\` chose the query "EU AI Act fines". You find the snapshot whose \`next\` is \`['search']\`, call \`updateState(snap.config, { query: 'EU AI Act fines 2026' })\`, then \`invoke(null, forkConfig)\`. A new branch runs \`search → … → review\`; the original branch stays in history for comparison.`,
      diagram: `thread_id = 'job-981'
 ckpt-1        ckpt-2         ckpt-3        ckpt-4 (never written)
 [plan] ──► [search] ──► [read] ──► [draft] ✗ crash
                │
                │ updateState(ckpt-2.config, { query: '…2026' })
                ▼
             ckpt-2' (fork) ──► [search] ──► [read] ──► [draft] ──► [review]

 resume after crash: invoke(null, { configurable: { thread_id } }) → from ckpt-3
 replay:             invoke(null, ckpt-2.config) → re-runs search onward`,
      code: [
        {
          language: 'typescript',
          title: 'Postgres checkpointer, inspection, crash resume and fork',
          code: `import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { researchBuilder } from './research-graph'; // an uncompiled StateGraph

const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
await checkpointer.setup();                          // creates tables; run once at deploy time

const graph = researchBuilder.compile({ checkpointer });
const config = { configurable: { thread_id: 'job-981' } };

// 1) Normal run (may crash midway)
await graph.invoke({ topic: 'EU AI Act fines' }, { ...config, durability: 'sync' });

// 2) After a restart: where are we, and continue from the last checkpoint
const snap = await graph.getState(config);
console.log(snap.next);                              // e.g. ['draft'] if it died there
if (snap.next.length) await graph.invoke(null, config); // null input = resume, not restart

// 3) Time travel: find the checkpoint just before 'search'
let beforeSearch;
for await (const s of graph.getStateHistory(config)) {   // newest first
  if (s.next.includes('search')) { beforeSearch = s; break; }
}
if (beforeSearch) {
  // 4) Fork: write a patched checkpoint (original history untouched) and run from it
  const forkConfig = await graph.updateState(beforeSearch.config, { query: 'EU AI Act fines 2026' });
  const forked = await graph.invoke(null, forkConfig);
  console.log(forked.report?.slice(0, 200));
}`,
        },
      ],
      prosCons: {
        pros: [
          'Conversation memory per thread with zero extra code.',
          'Crash recovery: resume from the last superstep instead of paying for the whole run again.',
          'Time travel and forking turn "why did the agent do that?" into an inspectable history.',
          'The same mechanism powers interrupts and human approvals.',
        ],
        cons: [
          { con: 'MemorySaver loses everything on restart and is not shared between replicas.', fix: 'Use PostgresSaver (or Redis/Mongo savers) in any deployed environment; keep MemorySaver for tests.' },
          { con: 'Checkpoints grow with every superstep and every message.', fix: 'Trim or summarise messages, store large documents by reference, and prune old checkpoints or whole threads with a TTL job.' },
          { con: 'A node that crashed mid-way re-runs on resume, repeating side effects.', fix: 'Make side effects idempotent (idempotency keys, upserts) or split them into their own small node after the checkpoint.' },
          { con: 'Replay re-executes LLM calls, so results can differ from the original run.', fix: 'Use temperature 0 for debugging replays, and compare forks against the stored original snapshot rather than expecting identical output.' },
        ],
      },
      keyPoints: [
        'Checkpoint after every superstep, scoped by configurable.thread_id.',
        'getStateHistory is newest first; snapshot.next tells you what runs next.',
        'invoke(null, config) resumes; invoke(null, snapshot.config) replays.',
        'updateState forks: it adds a checkpoint, never rewrites history.',
        'PostgresSaver + setup() for production; idempotent side effects.',
      ],
      exercise: {
        prompt: `Write a helper \`rewindAndRetry(graph, threadId, nodeName, patch)\` that:
1. walks \`getStateHistory\` for the thread,
2. finds the **most recent** snapshot whose \`next\` includes \`nodeName\`,
3. forks it with \`updateState(snapshot.config, patch)\`,
4. runs the fork with \`invoke(null, forkConfig)\` and returns the final values.

**Acceptance:** throws a clear error if no snapshot matches; otherwise returns the new final state while the original thread history remains intact.`,
        hints: [
          'History is newest first, so the first match is the most recent one; break out of the loop.',
          'updateState returns the config of the new checkpoint; pass that to invoke.',
          'Type the graph loosely (CompiledStateGraph or a small interface) to keep the helper reusable.',
        ],
        solution: {
          language: 'typescript',
          code: `type Cfg = { configurable: Record<string, unknown> };
interface Snapshot { next: string[]; config: Cfg }
interface Rewindable {
  getStateHistory(config: Cfg): AsyncIterable<Snapshot>;
  updateState(config: Cfg, values: Record<string, unknown>): Promise<Cfg>;
  invoke(input: null, config: Cfg): Promise<Record<string, unknown>>;
}

export async function rewindAndRetry(
  graph: Rewindable,
  threadId: string,
  nodeName: string,
  patch: Record<string, unknown>,
) {
  const config = { configurable: { thread_id: threadId } };
  let target: Snapshot | undefined;
  for await (const snap of graph.getStateHistory(config)) {
    if (snap.next.includes(nodeName)) { target = snap; break; } // newest match
  }
  if (!target) throw new Error('No checkpoint before node "' + nodeName + '" on thread ' + threadId);
  const forkConfig = await graph.updateState(target.config, patch); // new branch, history untouched
  return graph.invoke(null, forkConfig);
}`,
        },
        explanation: 'The snapshot config carries the checkpoint id, so updateState branches from exactly that point and invoke(null, …) continues from the branch. Because checkpoints are append-only, the original run can still be compared side by side, which is what makes this useful for debugging agent decisions.',
      },
      quickCheck: {
        question: 'You fork a thread from checkpoint 3 of 8 with updateState and run it. What happens to the original checkpoints 4–8?',
        options: ['They are deleted and replaced by the fork', 'They remain in history; the fork is a new branch from checkpoint 3', 'They are merged into the fork through reducers', 'They are marked invalid and getState throws until they are removed'],
        correct: 1,
        explanation: 'Checkpoints are append-only. updateState writes a new checkpoint whose parent is checkpoint 3, so the old branch (4–8) stays available in getStateHistory. Nothing is deleted or merged; the latest checkpoint for the thread simply becomes the fork.',
      },
      source: 'LangGraph JS docs — Checkpointers, Persistence and Time travel',
    },
    {
      heading: 'Streaming — values, updates, messages and custom modes to a live UI',
      body: `**Intuition:** \`invoke()\` is waiting for the whole letter; \`stream()\` is reading it as it is written. For a multi-step agent, streaming shows progress ("searching…"), node results and LLM tokens as they happen, so a 6-second run feels responsive.

**Stream modes (\`graph.stream(input, { streamMode })\`)**

| Mode | Each chunk | Typical use |
|---|---|---|
| \`values\` | full state after each superstep | simple UIs, debugging |
| \`updates\` | \`{ nodeName: partialUpdate }\` | step-by-step progress |
| \`messages\` | \`[messageChunk, metadata]\` per LLM token | chat typing effect |
| \`custom\` | anything a node emits via \`config.writer(...)\` | "fetched 3 of 10 pages" |
| \`debug\` | detailed task/checkpoint events | local troubleshooting |

**Mechanics**
- **Several modes:** \`streamMode: ['updates', 'messages']\` yields \`[mode, chunk]\` tuples.
- **Filter tokens:** \`metadata.langgraph_node\` tells you which node produced a token, so the UI can show only the final answer node and hide an internal classifier. Tagging a model with \`nostream\` also excludes it.
- **Subgraphs:** \`subgraphs: true\` yields \`[namespace, chunk]\`, where namespace is a path like \`['research:<task_id>']\` (empty for the parent).
- **Transport:** forward chunks over SSE or WebSocket; close the stream when the client disconnects.

**When to use:** \`messages\` + \`updates\` for chat UIs, \`custom\` for long tool calls, \`values\` for dashboards and tests.`,
      example: `**"Summarise our Q3 churn drivers"** on a 3-node graph (\`retrieve → analyse → answer\`), total 6.1 s.

With \`invoke()\` the user stares at a spinner for 6.1 s.

With \`streamMode: ['custom', 'updates', 'messages']\`:
- 120 ms — custom: "Searching 3 data sources"
- 1.4 s — updates: \`retrieve\` done (42 rows)
- 1.5 s — custom: "Analysing 42 rows"
- 3.9 s — updates: \`analyse\` done
- 4.5 s — first token from \`answer\` (filtered by \`langgraph_node === 'answer'\`)
- 6.1 s — done

Perceived wait drops from 6.1 s to ~120 ms for the first sign of life and 4.5 s for the first answer word, with zero change in total latency or cost.`,
      diagram: `graph.stream(input, { streamMode: ['custom','updates','messages'] })
      │
      ├─ ['custom',  { status: 'Searching 3 sources' }]   ← config.writer
      ├─ ['updates', { retrieve: { rows: 42 } }]
      ├─ ['messages',[AIMessageChunk('Ch'), { langgraph_node:'answer' }]]
      ├─ ['messages',[AIMessageChunk('urn'), …]]
      ▼
 server: for await → res.write('data: …\\n\\n')  ──SSE──►  browser UI
                                                        progress + typing`,
      code: [
        {
          language: 'typescript',
          title: 'Emit custom progress from a node and stream tokens + updates over SSE',
          code: `import express from 'express';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { graph } from './graph'; // compiled graph with nodes retrieve, analyse, answer

// Inside a node: emit custom progress events
export const retrieve = async (s: { question: string }, config: LangGraphRunnableConfig) => {
  config.writer?.({ status: 'Searching 3 sources' });   // goes to streamMode 'custom'
  const rows = await Promise.resolve([] as unknown[]);  // ... real retrieval here
  return { rows };
};

const app = express();
app.use(express.json());

app.post('/chat/:threadId', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  const abort = new AbortController();
  req.on('close', () => abort.abort());                 // stop the graph if the tab closes

  const send = (event: string, data: unknown) =>
    res.write('event: ' + event + '\\ndata: ' + JSON.stringify(data) + '\\n\\n');

  const stream = await graph.stream(
    { question: req.body.question },
    {
      configurable: { thread_id: req.params.threadId },
      streamMode: ['custom', 'updates', 'messages'],
      signal: abort.signal,
    },
  );
  for await (const [mode, chunk] of stream) {
    if (mode === 'custom') send('progress', chunk);
    else if (mode === 'updates') send('step', Object.keys(chunk));      // e.g. ['retrieve']
    else if (mode === 'messages') {
      const [token, meta] = chunk;
      if (meta.langgraph_node === 'answer') send('token', token.content); // hide internal LLM calls
    }
  }
  send('done', {});
  res.end();
});

app.listen(3000);`,
        },
      ],
      prosCons: {
        pros: [
          'Perceived latency drops to the time of the first event, not the whole run.',
          'One API covers state snapshots, node deltas, tokens and custom progress.',
          'metadata.langgraph_node and namespaces let the UI show exactly the right parts, even from subgraphs.',
        ],
        cons: [
          { con: 'Tokens from internal LLM calls (router, grader) leak into the chat bubble.', fix: 'Filter messages chunks by metadata.langgraph_node or tags, or tag internal models with nostream.' },
          { con: 'A closed browser tab keeps the graph running and spending tokens.', fix: 'Pass an AbortSignal tied to the request close event; with a checkpointer the run can be resumed later if needed.' },
          { con: 'Proxies buffer SSE so nothing arrives until the end.', fix: 'Disable proxy buffering (e.g. X-Accel-Buffering: no on nginx), flush headers early and send periodic heartbeat comments.' },
        ],
      },
      keyPoints: [
        'values = full state, updates = node deltas, messages = tokens, custom = your events.',
        'Multiple modes produce [mode, chunk] tuples.',
        'Filter tokens with metadata.langgraph_node.',
        'subgraphs: true adds a namespace to every chunk.',
      ],
      exercise: {
        prompt: `Write \`collect(stream)\` that consumes a LangGraph stream created with \`streamMode: ['updates', 'messages']\` and returns \`{ steps: string[]; answer: string }\`.

- \`steps\`: node names in completion order (from \`updates\`).
- \`answer\`: concatenated token text, **only** from the node named \`'answer'\`.

**Acceptance:** for a fake stream of 2 updates and 3 tokens (one from \`'router'\`), \`steps = ['router', 'answer']\` and \`answer\` excludes the router token.`,
        starter: {
          language: 'typescript',
          code: `type Chunk =
  | ['updates', Record<string, unknown>]
  | ['messages', [{ content: unknown }, { langgraph_node: string }]];

export async function collect(stream: AsyncIterable<Chunk>) {
  // TODO
}`,
        },
        hints: [
          'Destructure each item: for await (const [mode, chunk] of stream).',
          'For updates, push every key of the chunk object.',
          'Token content can be a string or an array of content blocks; handle the string case and ignore others.',
        ],
        solution: {
          language: 'typescript',
          code: `type Chunk =
  | ['updates', Record<string, unknown>]
  | ['messages', [{ content: unknown }, { langgraph_node: string }]];

export async function collect(stream: AsyncIterable<Chunk>) {
  const steps: string[] = [];
  let answer = '';
  for await (const item of stream) {
    if (item[0] === 'updates') steps.push(...Object.keys(item[1]));
    else {
      const [token, meta] = item[1];
      if (meta.langgraph_node === 'answer' && typeof token.content === 'string') answer += token.content;
    }
  }
  return { steps, answer };
}

async function* fake(): AsyncGenerator<Chunk> {
  yield ['messages', [{ content: 'billing' }, { langgraph_node: 'router' }]];
  yield ['updates', { router: { intent: 'billing' } }];
  yield ['messages', [{ content: 'Refund ' }, { langgraph_node: 'answer' }]];
  yield ['messages', [{ content: 'issued.' }, { langgraph_node: 'answer' }]];
  yield ['updates', { answer: {} }];
}
console.log(await collect(fake())); // { steps: ['router','answer'], answer: 'Refund issued.' }`,
        },
        explanation: 'Multi-mode streams are tagged tuples, so a simple discriminant on item[0] separates progress from tokens. Filtering on langgraph_node is what keeps the router\'s "billing" token out of the user-visible answer.',
      },
      quickCheck: {
        question: 'Your chat UI shows the word "billing" before every answer. The graph has a router node that calls a small LLM, then an answer node. You stream with streamMode "messages". What is the best fix?',
        options: [
          'Switch to streamMode "values" and diff the state',
          'Filter message chunks by metadata.langgraph_node === "answer" (or tag the router model nostream)',
          'Remove the router LLM and hard-code the route',
          'Strip the first word of every response in the browser',
        ],
        correct: 1,
        explanation: 'messages mode streams tokens from every LLM call in the graph, including internal ones. The metadata identifies the producing node, so filtering (or excluding the router via a nostream tag) fixes the cause. values mode loses token streaming, and stripping words is fragile.',
      },
      source: 'LangGraph JS docs — Streaming',
    },
    {
      heading: 'Human-in-the-Loop with interrupt() — pause, Command({ resume }) and approve/edit/reject tool calls',
      body: `**Intuition:** \`interrupt()\` is a pause button inside a node. The graph saves its place, hands a question to your app, and waits (seconds or days) until you resume it with an answer. This section is about the **API mechanics**; which actions to gate and how to run a review team is covered in the Human-in-the-Loop topic.

**Mechanics**
- \`const answer = interrupt(payload)\` inside a node. Requires a **checkpointer** and a \`thread_id\`. The payload (JSON-serialisable) comes back to the caller under \`result.__interrupt__\`.
- Resume with \`graph.invoke(new Command({ resume: value }), sameConfig)\`. \`value\` becomes the return value of \`interrupt()\`.
- **The node re-runs from its first line on resume.** Code before \`interrupt()\` executes twice, so keep it pure or move side effects to an earlier node.
- Don't wrap \`interrupt()\` in a bare try/catch: it works by throwing.
- Several interrupts paused at once (parallel nodes): resume with a map \`{ [interruptId]: value }\`. Within one node, multiple interrupts are matched by **call order**.
- **Static breakpoints:** \`compile({ interruptBefore: ['tools'] })\` or per call; resume with \`invoke(null, config)\`. Great for debugging, weaker for product HITL because they carry no payload.

**Approve / edit / reject a tool call**
| Decision | What the review node does |
|---|---|
| approve | \`goto: 'tools'\` unchanged |
| edit | replace the AI message (same \`id\`) with edited \`tool_calls\`, then \`goto: 'tools'\` |
| reject | append a \`ToolMessage\` per call explaining the rejection, \`goto: 'agent'\` |`,
      example: `**Email agent.** The model proposes \`send_email({ to: 'cfo@acme.com', subject: 'Q3 numbers', body: '…' })\`.

1. \`review\` calls \`interrupt({ toolCalls: [...] })\`; \`invoke\` returns with \`__interrupt__[0].value.toolCalls[0].args.to = 'cfo@acme.com'\`. The checkpoint is in Postgres; the HTTP request ends.
2. Two hours later the reviewer edits the recipient to \`finance-team@acme.com\` and the UI posts \`{ action: 'edit', args: { to: 'finance-team@acme.com', … } }\`.
3. Server: \`invoke(new Command({ resume: decision }), { configurable: { thread_id: 'mail-311' } })\`. \`review\` re-runs, \`interrupt()\` now returns the decision, the AI message is replaced (same id, edited args) and \`ToolNode\` sends to the finance team.

If the reviewer **rejects** with "Do not share Q3 before earnings", the agent receives a ToolMessage with that reason and replies "Understood, I won't send it."`,
      diagram: `[agent] ──tool_calls──► [review] ── interrupt({ toolCalls }) ──► caller gets __interrupt__
                             ▲                                       │ (hours…)
                             │  node re-runs from top               ▼
                             └──── invoke(new Command({ resume: decision }), sameThread)
                                         │
              approve ──► Command({ goto: 'tools' })
              edit    ──► Command({ goto: 'tools', update: { messages: [edited AIMessage, same id] } })
              reject  ──► Command({ goto: 'agent', update: { messages: [ToolMessage(reason)…] } })`,
      code: [
        {
          language: 'typescript',
          title: 'Review node that approves, edits or rejects pending tool calls',
          code: `import { interrupt, isInterrupted, Command, MemorySaver, StateGraph, MessagesAnnotation, START } from '@langchain/langgraph';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';

const Decision = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('edit'), args: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('reject'), reason: z.string().min(3) }),
]);

const review = async (s: typeof MessagesAnnotation.State) => {
  const last = s.messages.at(-1) as AIMessage;
  // Pure code only before interrupt(): this line runs again on resume
  const raw = interrupt({ toolCalls: last.tool_calls });
  const d = Decision.parse(raw);                         // reject malformed resume values loudly

  if (d.action === 'approve') return new Command({ goto: 'tools' });
  if (d.action === 'edit') {
    const [first, ...rest] = last.tool_calls ?? [];
    const edited = new AIMessage({
      id: last.id,                                       // same id → messages reducer REPLACES it
      content: last.content,
      tool_calls: [{ ...first, args: d.args }, ...rest],
    });
    return new Command({ goto: 'tools', update: { messages: [edited] } });
  }
  const rejections = (last.tool_calls ?? []).map(
    (tc) => new ToolMessage({ tool_call_id: tc.id!, content: 'Rejected by reviewer: ' + d.reason }),
  );
  return new Command({ goto: 'agent', update: { messages: rejections } });
};

declare const agent: any, toolNode: any, routeAfterAgent: any;
export const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agent)
  .addNode('review', review, { ends: ['tools', 'agent'] }) // declare Command destinations
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', routeAfterAgent, ['review', '__end__'])
  .addEdge('tools', 'agent')
  .compile({ checkpointer: new MemorySaver() });         // PostgresSaver in production

// Caller
const cfg = { configurable: { thread_id: 'mail-311' } };
const first = await graph.invoke({ messages: [{ role: 'user', content: 'Send Q3 numbers to the CFO' }] }, cfg);
if (isInterrupted(first)) console.log(first.__interrupt__[0].value); // typed guard; shows what the reviewer sees
await graph.invoke(new Command({ resume: { action: 'reject', reason: 'Not before earnings' } }), cfg);`,
        },
      ],
      prosCons: {
        pros: [
          'Pauses can last days: state lives in the checkpointer, not in a process.',
          'The resume value is arbitrary JSON, so edit and reject are as easy as approve.',
          'Works at any depth: interrupts inside subgraphs surface to the top-level caller.',
        ],
        cons: [
          { con: 'Code before interrupt() runs twice, duplicating notifications or LLM calls.', fix: 'Do side effects and LLM calls in an earlier node; keep the gate node pure up to the interrupt() call.' },
          { con: 'Resuming with a different thread_id silently starts a new, empty run.', fix: 'Derive thread ids deterministically from the business object (e.g. "mail-" + draftId) and store them with the pending approval.' },
          { con: 'Malformed resume payloads lead to silent no-ops.', fix: 'Validate the resume value with a zod discriminated union and fail loudly on anything unexpected.' },
          { con: 'Static interruptBefore carries no question for the reviewer.', fix: 'Use dynamic interrupt(payload) for product HITL; keep static breakpoints for debugging and tests.' },
        ],
      },
      keyPoints: [
        'interrupt(payload) needs a checkpointer and a thread_id.',
        'Command({ resume }) value = interrupt() return value.',
        'The node restarts from the top on resume.',
        'Edit a tool call by replacing the AI message with the same id.',
        'interruptBefore/After resume with invoke(null, config).',
      ],
      exercise: {
        prompt: `Implement \`gate\`, a node for a refund agent.

- If \`state.amount <= 50\`, return \`{ status: 'auto-approved' }\` **without** interrupting.
- Otherwise call \`interrupt({ amount, customerId })\` and expect \`{ approved: boolean, note?: string }\`.
- Return \`{ status: 'approved' }\` or \`{ status: 'rejected', note }\`.
- Show the caller code: first invoke, read \`__interrupt__\`, then resume with \`{ approved: false, note: 'duplicate claim' }\`.

**Acceptance:** a $30 refund never pauses; a $400 refund pauses and ends with status \`'rejected'\` and the note.`,
        hints: [
          'The early return for small amounts must come before interrupt() so it never pauses.',
          'Compile with a MemorySaver; both invoke calls use the same thread_id.',
          'Resume with new Command({ resume: { approved: false, note: \'duplicate claim\' } }).',
        ],
        solution: {
          language: 'typescript',
          code: `import { Annotation, StateGraph, START, END, MemorySaver, interrupt, isInterrupted, Command } from '@langchain/langgraph';

const State = Annotation.Root({
  amount: Annotation<number>(),
  customerId: Annotation<string>(),
  status: Annotation<string>(),
  note: Annotation<string | undefined>(),
});
type S = typeof State.State;

const gate = (s: S) => {
  if (s.amount <= 50) return { status: 'auto-approved' };
  const d = interrupt({ amount: s.amount, customerId: s.customerId }) as { approved: boolean; note?: string };
  return d.approved ? { status: 'approved' } : { status: 'rejected', note: d.note };
};

const graph = new StateGraph(State)
  .addNode('gate', gate)
  .addEdge(START, 'gate')
  .addEdge('gate', END)
  .compile({ checkpointer: new MemorySaver() });

const small = await graph.invoke({ amount: 30, customerId: 'c1' }, { configurable: { thread_id: 'r-1' } });
console.log(small.status); // auto-approved

const cfg = { configurable: { thread_id: 'r-2' } };
const paused = await graph.invoke({ amount: 400, customerId: 'c9' }, cfg);
if (isInterrupted(paused)) console.log(paused.__interrupt__[0].value); // { amount: 400, customerId: 'c9' }
const done = await graph.invoke(new Command({ resume: { approved: false, note: 'duplicate claim' } }), cfg);
console.log(done.status, done.note); // rejected duplicate claim`,
        },
        explanation: 'The threshold check is pure, so re-running the node on resume is harmless. The pause and resume share a thread id, which is how LangGraph finds the saved checkpoint; the resume object flows back as interrupt()\'s return value.',
      },
      quickCheck: {
        question: 'A node calls countTokens(state) (pure), then postToSlack("review needed"), then interrupt(). After one resume, how many Slack posts were sent?',
        options: ['1, because LangGraph caches everything before interrupt()', '2, because the node re-runs from its first line on resume', '0, because side effects are suppressed in interrupted nodes', 'It depends on the durability mode'],
        correct: 1,
        explanation: 'Resuming re-executes the whole node; interrupt() simply returns the resume value the second time. Pure code is harmless to repeat, but the Slack post happens twice. Move it to a separate node before the gate (or make it idempotent).',
      },
      source: 'LangGraph JS docs — Interrupts',
    },
    {
      heading: 'Subgraphs and the Send API — composition, map-reduce fan-out and parallel branches',
      body: `**Intuition:** a subgraph is a function call for graphs: a team (e.g. "research") packaged as its own graph and used as one node. \`Send\` is a dispatcher handing each worker its own envelope: "summarise section 3", "summarise section 4"… all at once.

**Subgraphs**
- **Shared keys:** \`addNode('research', compiledSubgraph)\`. Parent and child communicate through the keys they share.
- **Different schema:** call \`subgraph.invoke(mapIn(state))\` inside a parent node and map the result back. Use when the child has private keys (e.g. its own \`messages\`).
- A subgraph inherits the parent's checkpointer, so interrupts and time travel work inside it. \`getState(config, { subgraphs: true })\` shows child state; a node can return \`new Command({ graph: Command.PARENT, goto })\` to hand off to a parent node.

**Send (map-reduce)**
- A conditional edge returns \`items.map((x) => new Send('worker', { item: x }))\`. Each worker receives **only its payload**, not the full state.
- All workers run in the **same superstep**; their updates merge through the target key's **reducer**. Without one, parallel writes raise \`InvalidUpdateError\`.
- A normal edge \`worker → reduce\` runs \`reduce\` once after all workers finish.

**Static parallel branches:** two edges out of one node run both targets in parallel; \`addEdge(['a', 'b'], 'join')\` waits for both.

**When to use:** subgraphs to isolate teams or reuse flows; \`Send\` when the number of parallel tasks is known only at runtime (documents, sections, sub-questions).`,
      example: `**Contract review, 40 pages.** \`split\` produces 8 sections. The conditional edge returns 8 \`Send('summarise', { section })\` objects.

- Sequential: 8 × ~3 s = **24 s**.
- With Send: one superstep of 8 parallel workers ≈ **3.5 s** (slowest worker), then \`combine\` ≈ 2 s. Total ≈ **5.5 s**, same token cost.
- \`summaries\` uses a concat reducer, so \`combine\` sees all 8 entries. Order follows task order, not finish time; include \`section.index\` in each result to sort reliably.

**Bug seen in practice:** \`summaries: Annotation<string[]>()\` with no reducer → the run fails with \`InvalidUpdateError\` because 8 nodes wrote one last-write-wins key in the same superstep.

**Subgraph:** the clause-risk checker is its own compiled graph with private \`messages\`; the parent calls it inside \`assessRisk\` with \`{ text }\` and stores only \`{ riskScore: 0.72 }\`.`,
      diagram: `            [split]  sections = [s1 … s8]
               │ fanOut(state) → [Send('summarise',{s1}) … Send('summarise',{s8})]
   ┌───────┬───┴───┬───────┐
   ▼       ▼       ▼       ▼        one superstep, parallel workers
[summ s1][summ s2]  …   [summ s8]   each returns { summaries: [x] }
   └───────┴───┬───┴───────┘
               ▼  reducer: summaries = a.concat(b)
           [combine] ──► [assessRisk] ── invokes riskSubgraph({ text })
                              │            (own private messages state)
                              ▼
                             END`,
      code: [
        {
          language: 'typescript',
          title: 'Map-reduce with Send plus a subgraph with a different schema',
          code: `import { Annotation, StateGraph, START, END, Send } from '@langchain/langgraph';
declare function llm(prompt: string): Promise<string>;
declare const riskSubgraph: { invoke(i: { text: string }): Promise<{ score: number }> }; // compiled child graph

type Section = { index: number; text: string };
const State = Annotation.Root({
  contract: Annotation<string>(),
  sections: Annotation<Section[]>(),
  summaries: Annotation<{ index: number; summary: string }[]>({
    reducer: (a, b) => a.concat(b),          // REQUIRED: 8 workers write in one superstep
    default: () => [],
  }),
  overview: Annotation<string>(),
  riskScore: Annotation<number>(),
});
type S = typeof State.State;

const split = async (s: S) => ({
  sections: s.contract.split(/\\n(?=Section \\d+)/).map((text, index) => ({ index, text })),
});
const fanOut = (s: S) => s.sections.slice(0, 20).map((sec) => new Send('summarise', { section: sec })); // cap fan-out

// Worker input is the Send payload, not the parent state
const summarise = async (input: { section: Section }) => ({
  summaries: [{ index: input.section.index, summary: await llm('Summarise in 2 lines:\\n' + input.section.text) }],
});
const combine = async (s: S) => ({
  overview: [...s.summaries].sort((a, b) => a.index - b.index).map((x) => x.summary).join('\\n'),
});
// Subgraph with its own schema: map in, map out
const assessRisk = async (s: S) => ({ riskScore: (await riskSubgraph.invoke({ text: s.overview })).score });

export const review = new StateGraph(State)
  .addNode('split', split)
  .addNode('summarise', summarise)
  .addNode('combine', combine)
  .addNode('assessRisk', assessRisk)
  .addEdge(START, 'split')
  .addConditionalEdges('split', fanOut, ['summarise'])
  .addEdge('summarise', 'combine')           // runs once, after all workers
  .addEdge('combine', 'assessRisk')
  .addEdge('assessRisk', END)
  .compile();`,
        },
      ],
      prosCons: {
        pros: [
          'Latency of N independent tasks collapses to roughly the slowest one.',
          'Fan-out width is decided at runtime from data, not hard-coded edges.',
          'Subgraphs keep large flows modular, testable and reusable by several parents.',
        ],
        cons: [
          { con: 'Parallel writes to a key without a reducer fail with InvalidUpdateError.', fix: 'Give every key written by Send workers a reducer (concat, or merge by id) and include an index to restore order.' },
          { con: 'Unbounded fan-out (500 sections) hits provider rate limits and spikes cost.', fix: 'Cap the list in the router, batch items per worker, and set maxConcurrency in the run config.' },
          { con: 'One failing worker fails the superstep.', fix: 'Add a retryPolicy on the worker node and catch per-item errors inside it, returning { errors: [...] } so the reducer can continue.' },
          { con: 'Shared-key subgraphs leak internal keys into parent state.', fix: 'Invoke the subgraph inside a node with an explicit input/output mapping when schemas differ.' },
        ],
      },
      keyPoints: [
        'Send(node, payload): worker sees only its payload.',
        'Workers share one superstep; reducers merge their writes.',
        'A plain edge from the worker to a reduce node runs it once.',
        'Compiled subgraph as node = shared keys; invoke in a node = different schema.',
      ],
      exercise: {
        prompt: `Build a **page-size** map-reduce graph.

State: \`{ urls: string[]; pages: { url: string; words: number }[]; totalWords: number }\`.
- Router after START sends one \`Send('fetchPage', { url })\` per URL (max 10).
- \`fetchPage\` uses a stub \`fetchText(url)\` and returns \`{ pages: [{ url, words }] }\`.
- \`total\` sums words into \`totalWords\`.

**Acceptance:** with 3 URLs of 100, 250 and 50 words, \`pages.length === 3\` and \`totalWords === 400\`.`,
        hints: [
          'pages needs a concat reducer with default [].',
          'addConditionalEdges(START, router, [\'fetchPage\']) works for a dynamic entry fan-out.',
          'addEdge(\'fetchPage\', \'total\') makes total run once after all workers.',
        ],
        solution: {
          language: 'typescript',
          code: `import { Annotation, StateGraph, START, END, Send } from '@langchain/langgraph';
declare function fetchText(url: string): Promise<string>;

type Page = { url: string; words: number };
const State = Annotation.Root({
  urls: Annotation<string[]>(),
  pages: Annotation<Page[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  totalWords: Annotation<number>(),
});
type S = typeof State.State;

const graph = new StateGraph(State)
  .addNode('fetchPage', async ({ url }: { url: string }) => {
    const text = await fetchText(url);
    return { pages: [{ url, words: text.split(/\\s+/).filter(Boolean).length }] };
  })
  .addNode('total', (s: S) => ({ totalWords: s.pages.reduce((n, p) => n + p.words, 0) }))
  .addConditionalEdges(START, (s: S) => s.urls.slice(0, 10).map((url) => new Send('fetchPage', { url })), ['fetchPage'])
  .addEdge('fetchPage', 'total')
  .addEdge('total', END)
  .compile();

const out = await graph.invoke({ urls: ['a', 'b', 'c'] });
console.log(out.pages.length, out.totalWords); // 3 400 (with the stub)`,
        },
        explanation: 'Send turns a runtime list into parallel tasks in one superstep, the pages reducer collects every worker\'s output, and the fixed edge into total acts as the barrier. Capping at 10 keeps cost and rate limits predictable.',
      },
      quickCheck: {
        question: 'A router returns new Send(\'grade\', { doc }) for 6 documents. Inside grade, what does the first argument contain?',
        options: ['The full parent state plus doc', 'Only { doc }, the payload given to that Send', 'An array of all 6 docs', 'Nothing; workers must call getState to read input'],
        correct: 1,
        explanation: 'Each Send carries its own payload, which becomes that worker\'s input. This is what lets the same node run 6 times with different data in one superstep. If a worker needs shared context, put it in the payload explicitly.',
      },
      source: 'LangGraph JS docs — Graph API (Send), Subgraphs',
    },
    {
      heading: 'Long-Term Memory and Production — Store, deployment, tracing, testing and pitfalls',
      body: `**Intuition:** the checkpointer is the notepad for *one* conversation; the **Store** is the filing cabinet that survives across all of a user's conversations.

| | Checkpointer | Store |
|---|---|---|
| Scope | one \`thread_id\` | any thread, keyed by namespace |
| Written | automatically every superstep | explicitly by your nodes |
| Holds | messages, run state | preferences, facts, profiles |
| Classes | MemorySaver, PostgresSaver | InMemoryStore, PostgresStore (also Redis, Mongo) |

**Store mechanics:** \`compile({ checkpointer, store })\`; in a node use \`config.store\` (or \`runtime.store\` in v1 style). \`put(['user-7', 'prefs'], 'diet', { value: 'vegetarian' })\`, \`get(namespace, key)\`, \`search(namespace, { query, filter, limit })\`. Give the store an \`index\` with embeddings and \`dims\` for semantic search.

**Production**
- **Deploy:** LangGraph Platform (now under LangSmith Deployment) runs graphs listed in \`langgraph.json\` as an API with threads, runs, task queues and cron; or self-host the graph in your own service with PostgresSaver.
- **Trace:** set \`LANGSMITH_TRACING=true\` and \`LANGSMITH_API_KEY\` to get per-node traces, token counts and latencies.
- **Test:** unit-test routers and nodes (\`graph.nodes['agent'].invoke(state)\` bypasses the checkpointer), inject a fake model, and run partial flows with \`updateState(config, values, 'nodeA')\` + \`interruptAfter\`.

**Pitfalls:** missing reducers, random thread ids, unbounded message history, side effects before \`interrupt()\`, huge blobs in state, \`MemorySaver\` in prod, no per-user namespace in the Store.`,
      example: `**Meal-planning assistant.**

Monday, thread \`t-101\`: "I went vegetarian last month." The \`remember\` node writes \`put(['user-7', 'prefs'], 'diet', { value: 'vegetarian', since: '2026-09' })\`.

Next Monday, **new** thread \`t-188\`: "Plan 3 dinners." The checkpointer for \`t-188\` is empty, but \`plan\` calls \`search(['user-7', 'prefs'])\` → 1 item → system prompt gains "Diet: vegetarian". Output: mushroom risotto, chickpea curry, veggie tacos.

**Isolation check:** user-9 searches \`['user-9', 'prefs']\` and gets nothing from user-7. A namespace without the user id (\`['prefs']\`) would have leaked the preference to everyone: the most common Store bug.

**CI:** 42 unit tests (routers + nodes with a fake model) run in 3 s and cost $0; 15 nightly end-to-end evals on the real model cost about $0.40.`,
      diagram: `            thread t-101                    thread t-188 (new)
      ┌───────────────────────┐       ┌───────────────────────┐
      │ checkpointer (short)  │       │ checkpointer (short)  │
      │ messages of t-101     │       │ messages of t-188     │
      └──────────┬────────────┘       └──────────┬────────────┘
                 │ put                           │ search
                 ▼                               ▼
         ┌──────────────────── Store (long-term) ─────────────────┐
         │ ['user-7','prefs']  diet = vegetarian                  │
         │ ['user-9','prefs']  …                                  │
         └────────────────────────────────────────────────────────┘
   LangSmith traces every node  │  tests: nodes + routers with fake model`,
      code: [
        {
          language: 'typescript',
          title: 'Cross-thread memory with a Store namespaced per user',
          code: `import { StateGraph, MessagesAnnotation, START, END, InMemoryStore, MemorySaver } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ model: process.env.LLM_MODEL ?? 'claude-sonnet-5-5' });

const plan = async (s: typeof MessagesAnnotation.State, config: LangGraphRunnableConfig) => {
  const userId = config.configurable?.user_id as string;   // from the authenticated session, never from the prompt
  const ns = [userId, 'prefs'];
  const prefs = (await config.store?.search(ns, { limit: 10 })) ?? [];
  const profile = prefs.map((p) => p.key + ': ' + JSON.stringify(p.value)).join('\\n');

  const last = String(s.messages.at(-1)?.content ?? '');
  if (/vegetarian|vegan/i.test(last)) {
    await config.store?.put(ns, 'diet', { value: /vegan/i.test(last) ? 'vegan' : 'vegetarian' });
  }
  const reply = await model.invoke([
    { role: 'system', content: 'Known user preferences:\\n' + (profile || 'none') },
    ...s.messages,
  ]);
  return { messages: [reply] };
};

export const app = new StateGraph(MessagesAnnotation)
  .addNode('plan', plan)
  .addEdge(START, 'plan')
  .addEdge('plan', END)
  // Dev: in-memory. Prod: PostgresSaver + PostgresStore (call setup() on both)
  .compile({ checkpointer: new MemorySaver(), store: new InMemoryStore() });

await app.invoke(
  { messages: [{ role: 'user', content: 'Plan 3 dinners' }] },
  { configurable: { thread_id: 't-188', user_id: 'user-7' } },
);`,
        },
        {
          language: 'typescript',
          title: 'Unit-testing a node with a fake model (vitest)',
          code: `import { describe, it, expect } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { makeAgentNode } from './nodes';   // factory: (model) => async (state) => ({ messages: [...] })

// Fake model: deterministic, free, no network
const fakeModel = {
  invoke: async () => new AIMessage({ content: '', tool_calls: [{ id: 't1', name: 'get_order', args: { id: 7781 } }] }),
};

describe('agent node', () => {
  it('requests the order tool for an order question', async () => {
    const node = makeAgentNode(fakeModel);
    const out = await node({ messages: [{ role: 'user', content: 'Where is order 7781?' }] });
    const msg = out.messages[0] as AIMessage;
    expect(msg.tool_calls?.[0]?.name).toBe('get_order');
    expect(msg.tool_calls?.[0]?.args).toEqual({ id: 7781 });
  });
});`,
        },
      ],
      prosCons: {
        pros: [
          'Clean split: thread state is automatic, long-term memory is explicit and auditable.',
          'Namespaces make per-user (or per-org) isolation a data-model property.',
          'Graphs are testable at three levels: pure routers, single nodes, partial flows.',
          'Tracing shows per-node latency and tokens, which is where optimisation starts.',
        ],
        cons: [
          { con: 'A namespace missing the user id leaks memories across users.', fix: 'Build namespaces from the authenticated user id in config (never from model output) and add a test that user B cannot read user A.' },
          { con: 'Writing every utterance to the Store fills it with noise and stale facts.', fix: 'Write only extracted, validated facts under stable keys (overwrite "diet" rather than appending), with timestamps for recency.' },
          { con: 'End-to-end tests against a real model are slow, costly and flaky.', fix: 'Inject a fake model for unit tests; keep a small nightly eval set on the real model with tolerant assertions.' },
          { con: 'Platform lock-in concerns for managed deployment.', fix: 'Keep graph code framework-pure with Postgres persistence so it can run on LangGraph Platform or your own Node service.' },
        ],
      },
      keyPoints: [
        'Checkpointer = per-thread short-term; Store = cross-thread long-term.',
        'Namespace Store keys by user id taken from config.',
        'Test routers and nodes with fakes; nightly evals on the real model.',
        'LangSmith tracing via LANGSMITH_TRACING=true.',
        'MemorySaver/InMemoryStore are dev-only.',
      ],
      exercise: {
        prompt: `Write \`rememberFact(store, userId, key, value)\` and \`recall(store, userId)\` helpers, then prove isolation.

- Namespace: \`[userId, 'facts']\`.
- \`recall\` returns a plain object \`{ [key]: value }\`.
- Using \`InMemoryStore\`: store \`city = 'Pune'\` for \`u1\`, then \`city = 'Delhi'\` for \`u2\`, then update \`u1\` to \`'Mumbai'\`.

**Acceptance:** \`recall(u1)\` → \`{ city: 'Mumbai' }\`, \`recall(u2)\` → \`{ city: 'Delhi' }\`.`,
        hints: [
          'store.put(namespace, key, { value }) overwrites the same key in the same namespace.',
          'store.search(namespace) with no query lists items under that namespace.',
          'Each item has key and value fields.',
        ],
        solution: {
          language: 'typescript',
          code: `import { InMemoryStore } from '@langchain/langgraph';
import assert from 'node:assert/strict';

type Store = InMemoryStore;

export async function rememberFact(store: Store, userId: string, key: string, value: unknown) {
  await store.put([userId, 'facts'], key, { value });   // same key → overwrite, not duplicate
}

export async function recall(store: Store, userId: string) {
  const items = await store.search([userId, 'facts'], { limit: 100 });
  return Object.fromEntries(items.map((i) => [i.key, (i.value as { value: unknown }).value]));
}

const store = new InMemoryStore();
await rememberFact(store, 'u1', 'city', 'Pune');
await rememberFact(store, 'u2', 'city', 'Delhi');
await rememberFact(store, 'u1', 'city', 'Mumbai');

assert.deepEqual(await recall(store, 'u1'), { city: 'Mumbai' });
assert.deepEqual(await recall(store, 'u2'), { city: 'Delhi' });
console.log('isolation OK');`,
        },
        explanation: 'Stable keys make updates overwrite instead of piling up contradictory facts, and putting the user id first in the namespace is what keeps users isolated. The same helpers work unchanged with a Postgres-backed store in production.',
      },
      quickCheck: {
        question: 'A user says "always use metric units" in one chat and expects it in every future chat. Where should this live?',
        options: [
          'In the messages of the current thread, relying on the checkpointer',
          'In the Store under a namespace like [userId, "prefs"], read at the start of each run',
          'In a global variable on the server',
          'In recursionLimit metadata',
        ],
        correct: 1,
        explanation: 'Checkpointer state is scoped to one thread_id, so a new chat starts without it. A Store namespaced by user persists across threads and processes; a server variable is lost on restart and shared by all users.',
      },
      source: 'LangGraph JS docs — Memory stores, Test; LangSmith tracing docs',
    },
  ],
  codeChallenges: [
    {
      id: 'langgraph-cc-1',
      title: 'Fix a chat graph that forgets history and cannot resume approvals',
      context: 'A team wrote a custom chat state for their LangGraph support bot. In testing, the model only ever sees the latest message, multi-turn questions like "and the second one?" fail, and an approval step built with interrupt() throws or starts over when the reviewer clicks Approve.',
      task: 'Make the messages channel accumulate correctly, persist threads so interrupt() can resume, use a stable thread id, and resume with the correct API.',
      starter: {
        language: 'typescript',
        code: `import { Annotation, StateGraph, START, END, interrupt } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
declare const model: { invoke(m: BaseMessage[]): Promise<BaseMessage> };

const ChatState = Annotation.Root({
  messages: Annotation<BaseMessage[]>(),          // bug 1: no reducer → overwritten each node
  approved: Annotation<boolean>(),
});

const agent = async (s: typeof ChatState.State) => ({ messages: [await model.invoke(s.messages)] });
const approve = async () => ({ approved: interrupt({ question: 'Send reply?' }) as boolean });

const graph = new StateGraph(ChatState)
  .addNode('agent', agent)
  .addNode('approve', approve)
  .addEdge(START, 'agent')
  .addEdge('agent', 'approve')
  .addEdge('approve', END)
  .compile();                                      // bug 2: no checkpointer

export async function chat(text: string) {
  return graph.invoke(
    { messages: [{ role: 'user', content: text }] as any },
    { configurable: { thread_id: crypto.randomUUID() } }, // bug 3: new thread every call
  );
}
export async function onApprove() {
  return graph.invoke({ approved: true } as any);  // bug 4: not a resume, no thread
}`,
      },
      hints: [
        'Use messagesStateReducer (or spread MessagesAnnotation.spec) so updates append and replace by id.',
        'interrupt() needs a checkpointer; use PostgresSaver in production so any replica can resume.',
        'Resume with new Command({ resume: true }) on the SAME thread_id, derived from a conversation id.',
      ],
      solution: {
        language: 'typescript',
        code: `import { Annotation, MessagesAnnotation, StateGraph, START, END, interrupt, isInterrupted, Command } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
declare const model: { invoke(m: BaseMessage[]): Promise<BaseMessage> };

const ChatState = Annotation.Root({
  ...MessagesAnnotation.spec,                      // append + replace-by-id reducer
  approved: Annotation<boolean | null>({ reducer: (_a, b) => b, default: () => null }),
});
type S = typeof ChatState.State;

const agent = async (s: S) => ({ messages: [await model.invoke(s.messages)] });
const approve = async (s: S) => {
  const draft = String(s.messages.at(-1)?.content ?? '');
  const ok = interrupt({ question: 'Send this reply?', draft }); // decision-ready payload
  if (typeof ok !== 'boolean') throw new Error('resume value must be boolean');
  return { approved: ok };
};

const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
await checkpointer.setup();

const graph = new StateGraph(ChatState)
  .addNode('agent', agent)
  .addNode('approve', approve)
  .addEdge(START, 'agent')
  .addEdge('agent', 'approve')
  .addEdge('approve', END)
  .compile({ checkpointer });

const cfg = (conversationId: string) => ({ configurable: { thread_id: 'conv-' + conversationId } });

export async function chat(conversationId: string, text: string) {
  const out = await graph.invoke({ messages: [new HumanMessage(text)] }, cfg(conversationId));
  return { pending: isInterrupted(out) ? out.__interrupt__[0].value : null, messages: out.messages };
}
export async function onDecision(conversationId: string, approved: boolean) {
  return graph.invoke(new Command({ resume: approved }), cfg(conversationId));
}`,
      },
      explanation: 'The reducer makes each node\'s message append to history instead of replacing it, so the model sees the conversation. A durable checkpointer is what lets interrupt() save the paused run, and a deterministic thread id (from the conversation) plus Command({ resume }) is how the decision reaches that exact paused run. Sending { approved: true } as plain input would start a fresh run on a missing thread instead of resuming.',
      followUps: [
        { q: 'Why PostgresSaver rather than MemorySaver even if tests pass with MemorySaver?', a: 'MemorySaver lives in one process: with several replicas or a restart between the pause and the approval, the resume request finds no checkpoint and starts an empty run.' },
        { q: 'How would you keep the messages channel from growing forever on long conversations?', a: 'Add a trim or summarise node that keeps the last N turns plus a running summary, using RemoveMessage or replacing older messages, so prompts and checkpoints stay bounded.' },
      ],
    },
    {
      id: 'langgraph-cc-2',
      title: 'Bound a fan-out research graph that loops forever and loses results',
      context: 'A research graph fans out one worker per sub-question with Send, then a critic decides whether to research more. In production some runs fail with InvalidUpdateError, others run until a recursionLimit of 500 and cost over $20, and a question with 300 sub-questions triggered provider 429s.',
      task: 'Add the missing reducer, cap the fan-out width, bound the critic loop with a counter in state, set a sane recursionLimit and concurrency, and handle the recursion error gracefully.',
      starter: {
        language: 'typescript',
        code: `import { Annotation, StateGraph, START, Send } from '@langchain/langgraph';
declare function llm(p: string): Promise<string>;

const State = Annotation.Root({
  question: Annotation<string>(),
  subQuestions: Annotation<string[]>(),
  findings: Annotation<string[]>(),               // written by parallel workers
  verdict: Annotation<string>(),
});
type S = typeof State.State;

const graph = new StateGraph(State)
  .addNode('plan', async (s: S) => ({ subQuestions: (await llm('List sub-questions: ' + s.question)).split('\\n') }))
  .addNode('worker', async ({ q }: { q: string }) => ({ findings: [await llm('Research: ' + q)] }))
  .addNode('critic', async (s: S) => ({ verdict: await llm('Enough? ' + s.findings.join('\\n')) }))
  .addEdge(START, 'plan')
  .addConditionalEdges('plan', (s: S) => s.subQuestions.map((q) => new Send('worker', { q })))
  .addEdge('worker', 'critic')
  .addConditionalEdges('critic', (s: S) => (s.verdict.includes('YES') ? '__end__' : 'plan'))
  .compile();

export const run = (question: string) => graph.invoke({ question }, { recursionLimit: 500 });`,
      },
      hints: [
        'findings needs a concat reducer; parallel workers write it in the same superstep.',
        'Keep a rounds counter in state, increment it in plan, and stop the critic loop at a cap.',
        'Slice sub-questions, set maxConcurrency in the run config, and catch GraphRecursionError.',
      ],
      solution: {
        language: 'typescript',
        code: `import { Annotation, StateGraph, START, END, Send, GraphRecursionError } from '@langchain/langgraph';
declare function llm(p: string): Promise<string>;

const MAX_ROUNDS = 2;
const MAX_WORKERS = 8;

const State = Annotation.Root({
  question: Annotation<string>(),
  subQuestions: Annotation<string[]>(),
  findings: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  verdict: Annotation<string>(),
  rounds: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});
type S = typeof State.State;

const plan = async (s: S) => {
  const raw = await llm('List at most ' + MAX_WORKERS + ' NEW sub-questions, one per line, for: ' + s.question +
    '\\nAlready known:\\n' + s.findings.join('\\n'));
  const subQuestions = raw.split('\\n').map((x) => x.trim()).filter(Boolean).slice(0, MAX_WORKERS); // hard cap
  return { subQuestions, rounds: s.rounds + 1 };
};

const graph = new StateGraph(State)
  .addNode('plan', plan)
  .addNode('worker', async ({ q }: { q: string }) => ({ findings: [q + ': ' + (await llm('Research: ' + q))] }), {
    retryPolicy: { maxAttempts: 3 },              // transient 429/5xx per worker
  })
  .addNode('critic', async (s: S) => ({ verdict: await llm('Answer YES or NO: is this enough?\\n' + s.findings.join('\\n')) }))
  .addEdge(START, 'plan')
  .addConditionalEdges('plan', (s: S) => s.subQuestions.map((q) => new Send('worker', { q })), ['worker'])
  .addEdge('worker', 'critic')
  .addConditionalEdges('critic', (s: S) =>
    s.verdict.trim().toUpperCase().startsWith('YES') || s.rounds >= MAX_ROUNDS ? END : 'plan', ['plan', END])
  .compile();

export async function run(question: string) {
  try {
    // per round: plan + worker + critic = 3 supersteps → 2 rounds ≈ 6; limit leaves headroom
    return await graph.invoke({ question }, { recursionLimit: 12, maxConcurrency: 4 });
  } catch (e) {
    if (e instanceof GraphRecursionError) return { verdict: 'INCOMPLETE', findings: [] }; // alert + partial result
    throw e;
  }
}`,
      },
      explanation: 'The reducer lets 8 parallel workers contribute findings without InvalidUpdateError. The loop is bounded by state (rounds ≥ 2) so it ends deliberately, with recursionLimit kept as a tight circuit breaker rather than a 500-step licence to spend. Capping sub-questions and maxConcurrency keeps the burst within provider rate limits, and the retry policy absorbs transient errors per worker.',
      followUps: [
        { q: 'Why include "already known" findings in the plan prompt on round 2?', a: 'Otherwise the planner regenerates the same sub-questions, workers redo identical research, and the critic sees no progress, which is the classic cause of runaway loops.' },
        { q: 'How would you add a dollar budget instead of a round cap?', a: 'Track estimated cost in a reducer-backed state key (sum of input/output tokens × price from each node), and have the critic router end the run when the next round would exceed the budget.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'langgraph-iq-1',
      difficulty: 'hard',
      question: 'Your team debates building an assistant with a plain while-loop over the SDK, LangChain createAgent, or a hand-built LangGraph StateGraph. How do you decide, and what would make you switch later?',
      whatInterviewerLooksFor: [
        'Decision driven by required control flow (loops, branches, pauses, parallelism)',
        'Knows createAgent runs on LangGraph and createReactAgent is deprecated',
        'Mentions persistence, HITL, streaming and testability as decisive features',
        'Migration path rather than all-or-nothing',
      ],
      modelAnswer: `**Start from the control flow, not the framework.**

| Need | Plain loop | createAgent | StateGraph |
|---|---|---|---|
| single tool loop | fine | best | overkill |
| human approval mid-run | hand-rolled persistence | middleware | \`interrupt()\` |
| custom branches / validation nodes | grows messy | limited | native |
| parallel fan-out | manual Promise.all | no | \`Send\`, parallel edges |
| resume after crash, time travel | build it yourself | via checkpointer | native |

**My default:** \`createAgent\` (LangChain v1, built on LangGraph) for a standard tool-calling assistant: it gives the tool loop, streaming, checkpointer support and middleware for summarisation or approvals. \`createReactAgent\` is the deprecated predecessor.

**Switch to a hand-built StateGraph when:**
1. the process has explicit stages (triage → retrieve → draft → review) that must be enforced, not suggested;
2. you need deterministic nodes between LLM steps (policy checks, schema validation);
3. you need map-reduce over runtime lists, subgraphs per team, or custom state beyond messages;
4. you need fine control of where interrupts and checkpoints happen.

**Plain loop** is fine for scripts and prototypes with no persistence, but once you add "resume tomorrow" you are rebuilding a checkpointer.

**Migration:** keep tools and prompts framework-agnostic, start with createAgent, and when you outgrow it, wrap the same tools in a ToolNode inside a StateGraph. Compare on an eval set before and after.`,
      followUps: [
        { q: 'What is the cost of choosing StateGraph too early?', a: 'More code to maintain (state schema, routers, wiring) and more surface for bugs such as missing reducers, for flows a prebuilt agent handles with a few lines.' },
        { q: 'Can you mix approaches?', a: 'Yes: a createAgent-built agent is a compiled graph, so it can be used as a node or subgraph inside a larger StateGraph that adds deterministic stages around it.' },
      ],
      pitfalls: [
        'Choosing by popularity instead of required control flow',
        'Recommending the deprecated createReactAgent for new code',
        'Ignoring persistence until the first "resume" requirement arrives',
      ],
    },
    {
      id: 'langgraph-iq-2',
      difficulty: 'expert',
      question: 'Six months after launch, responses on long LangGraph chat threads take 9 s instead of 1.5 s and the Postgres checkpoint tables are 400 GB. Diagnose and fix.',
      context: 'Chat agent built on MessagesAnnotation with PostgresSaver; no trimming; average active thread has 180 messages; checkpoints never deleted.',
      whatInterviewerLooksFor: [
        'Understands that every superstep writes the growing messages channel',
        'Separates prompt size (latency/cost) from storage growth',
        'Concrete fixes: trim/summarise, retention, blobs by reference',
        'Measures before and after with traces',
      ],
      modelAnswer: `**Two symptoms, one root cause: unbounded state.**

**1. Latency.** 180 messages ≈ 60K input tokens per agent call. Input processing plus checkpoint serialisation dominate. LangSmith traces would show the agent node's input tokens growing linearly with thread length; TTFT grows with it.

**2. Storage.** A checkpoint is written per superstep and the messages channel changes every time, so each write stores a new version of an ever-longer list. Per thread, total bytes grow roughly **quadratically** with turns (see the estimation drill). With no retention, every abandoned thread is kept forever.

**Fixes**
- **Bound the prompt:** a \`summarise\` node when messages exceed ~30 turns or ~20K tokens: keep the last 10 turns verbatim plus a running summary, and remove older messages via the messages reducer (\`RemoveMessage\`). Latency back to ~1.5–2 s.
- **Move facts out of messages:** preferences and entities go to the Store; tool outputs that are large (documents, JSON dumps) become references (\`docId\`) instead of message bodies.
- **Retention:** keep full history 7–14 days for debugging, then delete old threads or compact to the latest checkpoint; delete abandoned threads after N days.
- **Durability:** for low-value chat steps, \`durability: 'async'\` reduces write latency on the critical path.
- **DB hygiene:** monitor table/TOAST size, vacuum, and partition or archive by date.

**Verify:** compare p50/p95 latency, input tokens per call, and checkpoint bytes per day before and after; add a regression test that a 200-turn synthetic thread stays under a token ceiling.`,
      followUps: [
        { q: 'Does summarising hurt answer quality?', a: 'It can drop details, so keep recent turns verbatim, pin key facts (order ids, decisions) in structured state or the Store, and evaluate on long-conversation test cases before rollout.' },
        { q: 'How do you remove old messages without breaking the reducer?', a: 'Return RemoveMessage objects with the ids of messages to drop (the messages reducer deletes them), or replace the list deliberately; never just return a shorter array, which would be appended.' },
      ],
      pitfalls: [
        'Blaming Postgres or the model provider without measuring input tokens',
        'Truncating messages by returning a shorter list, which the reducer appends',
        'Deleting checkpoints of paused (interrupted) threads still awaiting humans',
      ],
    },
    {
      id: 'langgraph-iq-3',
      difficulty: 'hard',
      question: 'A Kubernetes rollout kills worker pods in the middle of 300 long-running LangGraph jobs. What does LangGraph give you for recovery, and what must you design yourself?',
      whatInterviewerLooksFor: [
        'Resume from last checkpoint with invoke(null, config) on the same thread',
        'Pending writes for successful parallel nodes',
        'Idempotent side effects and node granularity',
        'Durability mode trade-offs and a sweeper for orphaned runs',
      ],
      modelAnswer: `**What LangGraph provides**
- With a durable checkpointer (Postgres), every completed superstep is saved under the job's \`thread_id\`. A new worker calls \`getState(config)\`: \`next\` shows which nodes were pending, and \`invoke(null, config)\` continues from there. Completed LLM calls are **not** paid for again.
- In a parallel superstep, if some nodes succeeded before the crash, their results are kept as **pending writes**, so only the unfinished node re-runs.
- \`durability\`: \`'sync'\` persists before the next step starts (safest), \`'async'\` overlaps the write with execution (small risk of losing the last step), \`'exit'\` only persists at the end (fastest, no mid-run recovery). Long jobs should use sync or async.

**What you must design**
1. **Job tracking:** a jobs table (\`jobId → thread_id, status, heartbeat\`). A sweeper finds jobs with stale heartbeats and re-enqueues \`invoke(null, config)\`. LangGraph does not discover orphaned runs for you unless you use the managed platform's queue.
2. **Idempotent side effects:** the node that was running re-executes from its start. Charges, emails and tickets need idempotency keys (e.g. \`jobId + node + itemId\`) or an "already done?" check.
3. **Node granularity:** split "call API then send email" into separate nodes so the checkpoint between them prevents repeats.
4. **Graceful shutdown:** handle SIGTERM, stop accepting jobs, let in-flight supersteps finish within the termination grace period.
5. **Versioning:** if the rollout changed the graph, resuming old checkpoints must still be valid (keep node names stable, migrate state shape carefully).`,
      followUps: [
        { q: 'What if the new deploy renamed a node that old checkpoints list in next?', a: 'Resumes fail or misroute; keep old node names as aliases until in-flight threads drain, or migrate those threads by forking with updateState onto the new structure.' },
        { q: 'When is durability "exit" acceptable?', a: 'For short, cheap, idempotent runs where restarting from scratch is fine and write latency matters more than recovery, such as a 2-second classification graph.' },
      ],
      pitfalls: [
        'Restarting jobs with their original input, re-running every paid step',
        'Assuming side effects are exactly-once because checkpoints exist',
        'Using MemorySaver in workers and expecting recovery',
      ],
    },
    {
      id: 'langgraph-iq-4',
      difficulty: 'hard',
      question: 'Design the streaming layer for a LangGraph research assistant whose graph includes a planner, a research subgraph with parallel workers and a writer. What do you stream, how, and what about reconnects?',
      whatInterviewerLooksFor: [
        'Chooses modes per UI need (updates, messages, custom)',
        'Uses subgraphs: true and namespaces to attribute events',
        'Filters internal LLM tokens',
        'Handles disconnects, cancellation and resume via thread state',
      ],
      modelAnswer: `**UI needs:** a progress timeline, live per-worker status, and the final report typing out.

**Modes**
- \`updates\` → timeline ("planner done: 6 sub-questions").
- \`custom\` → fine-grained progress from inside nodes via \`config.writer\` ("worker 3: fetched 4/10 pages").
- \`messages\` → tokens, **filtered** to \`metadata.langgraph_node === 'writer'\`; planner and grader LLM calls stay hidden (or tag those models \`nostream\`).
- \`subgraphs: true\` so events from research workers arrive as \`[namespace, …]\`; the namespace (e.g. \`research:<task_id>\`) maps events to the right worker card.

**Transport:** SSE from a Node endpoint (\`for await\` over \`graph.stream\` → \`event:\`/\`data:\` frames). Disable proxy buffering, send a heartbeat every 15 s.

**Reconnects**
- Run the graph **detached** from the HTTP request: start it as a background job keyed by \`thread_id\`; the SSE endpoint only relays events, so a dropped connection doesn't kill a 3-minute run.
- Persist progress events (Redis stream or table, with sequence numbers). On reconnect the client sends \`Last-Event-ID\`; the server replays missed events, then tails live ones.
- If nothing is running, \`getState(config)\` returns the final state, so the UI can render it directly.

**Cancellation:** a "stop" button aborts via AbortSignal; the checkpoint lets the user resume later.

**Metrics:** time to first event, time to first answer token, dropped-connection rate.`,
      followUps: [
        { q: 'Why not stream values mode to the browser?', a: 'It sends the full state every superstep, which repeats large message lists and retrieved docs, wasting bandwidth and possibly exposing internal fields; updates plus filtered tokens are smaller and safer.' },
        { q: 'How do you avoid leaking internal reasoning or tool data to users?', a: 'Whitelist what reaches the client: map stream chunks to a small UI event schema on the server, never forward raw state, and drop events from internal nodes.' },
      ],
      pitfalls: [
        'Tying graph execution to the HTTP connection lifetime',
        'Forwarding every token from every LLM call',
        'No replay of missed events after a reconnect',
      ],
    },
    {
      id: 'langgraph-iq-5',
      difficulty: 'medium',
      question: 'How would you test a LangGraph agent in CI so that tests are fast, deterministic and still catch real regressions?',
      whatInterviewerLooksFor: [
        'Layered tests: routers, nodes, partial graph, end-to-end evals',
        'Fake or injected models for determinism',
        'Uses graph.nodes, updateState asNode and interruptAfter for partial runs',
        'Separate real-model eval suite with thresholds',
      ],
      modelAnswer: `**Layer 1: pure functions (milliseconds).** Routers and reducers are plain functions: table-driven tests for every branch (tool calls present, budget exhausted, final answer). This catches most loop and routing bugs.

**Layer 2: single nodes with a fake model.** Build nodes from factories that take the model as a dependency, then inject a fake whose \`invoke\` returns scripted \`AIMessage\`s (including \`tool_calls\`). Compiled graphs also expose \`graph.nodes['agent'].invoke(state)\`, which bypasses the checkpointer. Assert on the returned partial update.

**Layer 3: graph wiring with scripted responses.** Compile with a fresh \`MemorySaver\` per test. Script the fake model: first call returns a tool call, second returns the answer; assert the sequence of node names from \`streamMode: 'updates'\` and the final state. For **partial execution**, seed state with \`updateState(config, values, 'nodeA')\` and run \`invoke(null, { ...config, interruptAfter: ['nodeC'] })\`. Test interrupts: assert \`__interrupt__\` payload, then resume with \`Command({ resume })\`.

**Layer 4: real-model evals (nightly or on prompt changes).** 30–100 golden cases, LLM-as-judge or rule checks, thresholds (e.g. task success ≥ 90%, avg tool calls ≤ 3), LangSmith experiments for comparison. Not on every commit: slow and costs money.

**Also:** a test that the recursion guard ends gracefully, and that Store namespaces isolate users.`,
      followUps: [
        { q: 'How do you test the tools themselves?', a: 'As ordinary functions with mocked HTTP/DB clients, including error cases, because ToolNode will feed their error strings back to the model and that behaviour should be predictable.' },
        { q: 'What makes graph tests flaky and how do you avoid it?', a: 'Real model calls, shared checkpointers between tests and time-dependent data; use fakes, a new MemorySaver per test and fixed clocks.' },
      ],
      pitfalls: [
        'Only end-to-end tests against the real model',
        'Reusing one checkpointer and thread id across tests',
        'Asserting exact LLM wording instead of structure and behaviour',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'langgraph-est-1',
      question: 'How much checkpoint storage does one long LangGraph chat thread generate when the full messages list is re-saved every superstep, and what does that mean at 10,000 threads per day?',
      assumptions: [
        '40 user turns per thread; each turn = 2 supersteps (agent, tools) on average',
        'Each turn adds ~3 KB of messages (user + AI + tool messages)',
        'Each checkpoint stores the full current messages list (the channel changes every step)',
        'Other state and metadata ≈ 1 KB per checkpoint; Postgres overhead ignored',
      ],
      steps: [
        { label: 'Messages size after turn k', calc: 'k × 3 KB (turn 40 → 120 KB)' },
        { label: 'Bytes written in turn k', calc: '2 checkpoints × (k × 3 KB + 1 KB) ≈ 6k + 2 KB' },
        { label: 'Sum over 40 turns', calc: '6 KB × (1 + 2 + … + 40) + 2 KB × 40 = 6 × 820 + 80 ≈ 5,000 KB ≈ 5 MB' },
        { label: 'Compare with final state', calc: '≈ 121 KB → history is ~40× the final state' },
        { label: '10,000 threads/day', calc: '10,000 × 5 MB = 50 GB/day ≈ 1.5 TB/month without retention' },
        { label: 'With summarisation capping messages at 30 KB', calc: 'per checkpoint ≤ 31 KB → ~80 checkpoints × ~25 KB avg ≈ 2 MB/thread → 20 GB/day' },
      ],
      answer: 'About 5 MB per 40-turn thread (versus ~120 KB of final state), so roughly 50 GB/day at 10,000 threads; capping message size and adding retention brings it to ~20 GB/day, and keeping only final checkpoints after 7 days reduces it further.',
      insight: 'Storage grows quadratically with turns because each checkpoint re-saves a growing list. Bounding the messages channel (summaries, references instead of large tool outputs) helps both latency and storage, and a retention policy turns linear-forever growth into a fixed window.',
      followUps: [
        { q: 'What if each tool call returns a 50 KB document into the messages?', a: 'Each turn adds ~53 KB instead of 3 KB, so the 40-turn sum becomes about 106 KB × 820 ≈ 87 MB per thread; store documents by id and pass only short excerpts into messages.' },
      ],
    },
    {
      id: 'langgraph-est-2',
      question: 'Estimate the cost and latency of summarising 60 documents with a Send fan-out versus a sequential loop, under a provider concurrency limit.',
      assumptions: [
        '60 documents × 6,000 tokens; prompt overhead 500 tokens; each summary 400 output tokens',
        'Illustrative price: $3 per 1M input tokens, $15 per 1M output tokens',
        'Per call: TTFT 0.6 s, output speed 80 tokens/s',
        'Synthesis node reads 60 summaries (24K tokens) + 1K prompt and writes 1,500 tokens',
        'Provider allows 10 concurrent requests (maxConcurrency: 10)',
      ],
      steps: [
        { label: 'Worker cost', calc: '6,500 × $3/1M = $0.0195 input + 400 × $15/1M = $0.006 output ≈ $0.0255' },
        { label: 'All workers', calc: '60 × $0.0255 ≈ $1.53' },
        { label: 'Synthesis cost', calc: '25,000 × $3/1M = $0.075 + 1,500 × $15/1M = $0.0225 ≈ $0.10' },
        { label: 'Total cost', calc: '$1.53 + $0.10 ≈ $1.63 (same for sequential and parallel)' },
        { label: 'Worker latency', calc: '0.6 s + 400 / 80 s = 5.6 s' },
        { label: 'Synthesis latency', calc: '0.6 s + 1,500 / 80 s ≈ 19.4 s' },
        { label: 'Sequential', calc: '60 × 5.6 s = 336 s + 19.4 s ≈ 355 s (~6 min)' },
        { label: 'Send, 10 concurrent', calc: 'ceil(60/10) = 6 waves × 5.6 s = 33.6 s + 19.4 s ≈ 53 s' },
        { label: 'Send, unlimited', calc: '5.6 s + 19.4 s ≈ 25 s (but 60 simultaneous calls risk 429s)' },
      ],
      answer: 'About $1.63 per run regardless of strategy; ~6 minutes sequentially, ~53 s with Send at concurrency 10, ~25 s if unlimited. The synthesis step becomes the dominant latency once workers run in parallel.',
      insight: 'Fan-out changes latency, not token cost. After parallelising, the critical path is the slowest wave plus the reduce step, so the next wins are shorter summaries (less synthesis input and output), a hierarchical reduce, or streaming the synthesis to the user.',
      followUps: [
        { q: 'How does a two-level reduce (6 groups of 10, then final) change synthesis latency?', a: 'Six parallel group syntheses (~4K input, 400 output ≈ 5.6 s) then a final one over 2.4K tokens (~0.6 + 1,500/80 ≈ 19 s) only helps if the final output is also shortened; the output length, not input, dominates latency here.' },
      ],
    },
  ],
  test: [
    {
      id: 'langgraph-mcq-01',
      difficulty: 'medium',
      question: 'The graph runs START → a → b → END with the initial input below. What is the final value of items?',
      code: {
        language: 'typescript',
        code: `const State = Annotation.Root({
  items: Annotation<string[]>({ reducer: (cur, upd) => cur.concat(upd), default: () => [] }),
  last: Annotation<string>(),
});
// node a returns { items: ['x'], last: 'a' }
// node b returns { items: ['y'], last: 'b' }
await graph.invoke({ items: ['seed'] });`,
      },
      options: ["['x', 'y']", "['seed', 'x', 'y']", "['y']", "['seed', 'y']"],
      correct: [1],
      explanation: 'The input itself is applied through the reducer (default [] concat [\'seed\']), then each node\'s update is concatenated, giving [\'seed\',\'x\',\'y\']. [\'y\'] would be the result without a reducer; last, which has none, ends as \'b\'.',
      followUps: [{ q: 'How would you let one node clear items despite the reducer?', a: 'Design the reducer to recognise a reset signal, or in v1 return an Overwrite value for that key, which bypasses the reducer for that single update.' }],
    },
    {
      id: 'langgraph-mcq-02',
      difficulty: 'hard',
      question: 'Nodes "billing" and "shipping" both run after "triage" via two static edges. Each returns { status: "checked" }; status was declared as Annotation<string>(). What happens?',
      code: {
        language: 'typescript',
        code: `builder
  .addEdge('triage', 'billing')
  .addEdge('triage', 'shipping')
  .addEdge(['billing', 'shipping'], 'reply');`,
      },
      options: [
        'status ends as "checked"; identical values are deduplicated',
        'The run fails with InvalidUpdateError because two nodes wrote a reducer-less key in the same superstep',
        'shipping overwrites billing because it was added last',
        'reply runs twice, once per incoming edge',
      ],
      correct: [1],
      explanation: 'Both branches execute in one superstep; a last-write-wins channel cannot accept two writes in one step, so LangGraph raises InvalidUpdateError even if the values are equal. There is no ordering rule like "last added wins", and the array edge makes reply wait for both, running once.',
      followUps: [{ q: 'Give two ways to fix it.', a: 'Add a reducer to status (e.g. merge into a record keyed by branch), or give each branch its own key such as billingStatus and shippingStatus.' }],
    },
    {
      id: 'langgraph-mcq-03',
      difficulty: 'medium',
      question: 'In a graph wired with addConditionalEdges("agent", toolsCondition), the model returns a plain answer without tool calls. What happens next?',
      options: [
        'The graph routes to "tools", which no-ops and returns to "agent"',
        'toolsCondition returns END, so the run finishes with the answer',
        'An error is thrown because toolsCondition requires a tool call',
        'The agent node is re-invoked until it produces a tool call',
      ],
      correct: [1],
      explanation: 'toolsCondition inspects the last AI message: tool calls → "tools", none → END. That is what makes the agent ↔ tools cycle terminate. Routing to tools with nothing to run, or re-invoking the agent, would loop until the recursion limit.',
      followUps: [{ q: 'When would you replace toolsCondition with your own router?', a: 'When you need extra exits such as a step budget, an approval node before risky tools, or routing different tools to different executor nodes.' }],
    },
    {
      id: 'langgraph-mcq-04',
      difficulty: 'hard',
      question: 'A team on LangGraph JS v1 starts a new standard tool-calling assistant. Which choice matches current guidance?',
      options: [
        'createReactAgent from @langchain/langgraph/prebuilt, the recommended v1 entry point',
        'createAgent from the langchain package, which runs on LangGraph and adds middleware',
        'A hand-built StateGraph, because prebuilt agents cannot use checkpointers',
        'AgentExecutor from LangChain, because LangGraph agents cannot stream tokens',
      ],
      correct: [1],
      explanation: 'LangGraph v1 deprecates createReactAgent in favour of createAgent from "langchain", which is built on LangGraph and supports checkpointers, streaming and middleware (e.g. HITL, summarisation). Prebuilt agents do accept checkpointers, and LangGraph agents stream fine.',
      followUps: [{ q: 'What still justifies a hand-built StateGraph?', a: 'Custom stages, deterministic validation nodes, Send fan-out, subgraphs or bespoke state beyond messages that the prebuilt agent cannot express cleanly.' }],
    },
    {
      id: 'langgraph-mcq-05',
      difficulty: 'hard',
      question: 'You are debugging a bad agent decision by rewinding a thread to an earlier step. Select ALL statements that hold for replay and forking.',
      options: [
        'getStateHistory yields snapshots with the most recent first',
        'invoke(null, snapshot.config) skips nodes before that checkpoint and re-executes the ones after it',
        'updateState(snapshot.config, patch) edits the stored checkpoint in place',
        'Replaying a checkpoint returns the cached LLM outputs from the original run',
        'After a fork, the original branch is still available in the thread history',
      ],
      correct: [0, 1, 4],
      explanation: 'History is newest first; replay resumes from the chosen checkpoint and re-runs later nodes; updateState appends a new checkpoint (a fork) rather than mutating the old one, so the original branch remains. Replay does not serve cached LLM outputs: model calls run again and may differ.',
      followUps: [{ q: 'How do you make a replay as reproducible as possible?', a: 'Use temperature 0, pin the model version, record tool responses or stub tools, and compare structure rather than exact wording.' }],
    },
    {
      id: 'langgraph-mcq-06',
      difficulty: 'expert',
      question: 'In one superstep, nodes fetchA, fetchB and fetchC run in parallel on a PostgresSaver graph. fetchA and fetchB finish; the pod dies while fetchC is running. The job is resumed with invoke(null, config). What runs?',
      options: [
        'All three nodes, because the superstep never completed',
        'Only fetchC; the completed writes from fetchA and fetchB were saved as pending writes',
        'Nothing; the run must be restarted from the original input',
        'fetchA and fetchB only, because fetchC is marked failed',
      ],
      correct: [1],
      explanation: 'LangGraph stores writes from nodes that finished within an unfinished superstep as pending writes on the checkpoint. On resume, only the unfinished node executes and the superstep then completes with all three results. This saves cost but still means fetchC may run twice, so it should be idempotent.',
      followUps: [{ q: 'What if fetchC had already called a payment API before the crash?', a: 'It would call it again on resume; protect it with an idempotency key derived from thread id and item, or split the payment into its own node with a check for an existing charge.' }],
    },
    {
      id: 'langgraph-mcq-07',
      difficulty: 'hard',
      question: 'Select ALL correct statements about LangGraph durability modes and crash recovery.',
      options: [
        '"sync" persists each checkpoint before the next step starts, giving the strongest recovery',
        '"exit" persists only when the run finishes or pauses, so a mid-run crash loses progress',
        '"async" makes side effects exactly-once',
        'Durability is chosen per invocation, e.g. graph.stream(input, { durability: "sync" })',
        'MemorySaver with "sync" survives a process restart',
      ],
      correct: [0, 1, 3],
      explanation: 'sync, async and exit trade safety for speed: sync writes before continuing, async overlaps writes with execution, exit writes only at the end. The mode is passed per call. No mode makes side effects exactly-once, and MemorySaver is in RAM, so a restart loses everything regardless of mode.',
      followUps: [{ q: 'Which mode for a 20-minute research job and which for a 1-second classifier?', a: 'sync (or async) for the long job so a crash resumes mid-run; exit is acceptable for the short classifier where rerunning from scratch is cheap.' }],
    },
    {
      id: 'langgraph-mcq-08',
      difficulty: 'hard',
      question: 'What does each item yielded by this loop look like?',
      code: {
        language: 'typescript',
        code: `const stream = await graph.stream(input, {
  configurable: { thread_id: 't1' },
  streamMode: ['updates', 'messages'],
});
for await (const item of stream) {
  console.log(item);
}`,
      },
      options: [
        'Only the full state after each superstep',
        'A [mode, chunk] tuple: ["updates", { node: delta }] or ["messages", [messageChunk, metadata]]',
        'A [namespace, chunk] tuple for every node',
        'Plain token strings, with updates delivered after the stream ends',
      ],
      correct: [1],
      explanation: 'With an array of modes, LangGraph tags every chunk with its mode. updates chunks are keyed by node name; messages chunks are [message chunk, metadata] pairs. Namespaces only appear when subgraphs: true is set, and full state is the values mode.',
      followUps: [{ q: 'What changes if you add subgraphs: true?', a: 'Each item gains a namespace identifying the (sub)graph path that produced it, so you can route events from nested workers to the right part of the UI.' }],
    },
    {
      id: 'langgraph-mcq-09',
      difficulty: 'medium',
      question: 'A long-running "crawl" node takes 40 s and users think the app froze. You want to show "fetched 12/50 pages" while it runs. Which approach fits best?',
      options: [
        'Split crawl into 50 nodes so updates mode fires per page',
        'Call config.writer({ fetched, total }) inside the node and stream with streamMode "custom"',
        'Poll getState every second from the browser',
        'Use streamMode "values" so partial state is sent mid-node',
      ],
      correct: [1],
      explanation: 'The custom stream mode exists for progress emitted from inside a node via config.writer. updates and values only fire when a node completes, so they cannot report mid-node progress; 50 nodes would distort the graph, and polling getState also sees only completed steps.',
      followUps: [{ q: 'Can tools emit custom events too?', a: 'Yes; tools running inside the graph receive the config and can write custom events, which is useful for long tool calls such as file processing.' }],
    },
    {
      id: 'langgraph-mcq-10',
      difficulty: 'expert',
      question: 'Two parallel nodes each call interrupt() in the same superstep. The caller resumes with the code below. What happens?',
      code: {
        language: 'typescript',
        code: `const r = await graph.invoke(input, cfg);
console.log(r.__interrupt__.length); // 2
await graph.invoke(new Command({ resume: 'approve' }), cfg);`,
      },
      options: [
        'Both interrupts receive "approve" automatically',
        'The resume value must map each pending interrupt id to its answer, e.g. { [id1]: "approve", [id2]: "reject" }; a single value does not identify which interrupt it answers',
        'Only the first interrupt resumes and the second is discarded',
        'LangGraph serialises the nodes so interrupts can never be pending together',
      ],
      correct: [1],
      explanation: 'When several interrupts are pending at once, the docs resume them with a map from interrupt id (from __interrupt__[i].id) to value, answering each explicitly in one Command. Relying on a single scalar is ambiguous. Parallel nodes can indeed pause together, and nothing is silently discarded.',
      followUps: [{ q: 'How are multiple interrupt() calls inside ONE node matched to resume values?', a: 'By call order: the node re-runs and each interrupt() call consumes the next resume value in sequence, so the order of interrupt calls must stay deterministic.' }],
    },
    {
      id: 'langgraph-mcq-11',
      difficulty: 'hard',
      question: 'A graph is compiled with interruptBefore: ["tools"]. The run pauses before tools and an engineer wants to change the arguments of the pending tool call, then continue. Which sequence is correct?',
      options: [
        'invoke(new Command({ resume: newArgs }), config)',
        'updateState(config, { messages: [editedAIMessage with the same id] }) then invoke(null, config)',
        'invoke({ messages: [editedAIMessage] }, config)',
        'Recompile without interruptBefore and invoke the original input again',
      ],
      correct: [1],
      explanation: 'Static breakpoints are resumed with invoke(null, config). To change the call, patch state first: an AI message with the same id replaces the old one through the messages reducer. Command({ resume }) answers a dynamic interrupt() call, which does not exist here, and sending new input would append a turn rather than continue.',
      followUps: [{ q: 'Why are static breakpoints less suitable for product approval flows?', a: 'They carry no payload or question for the reviewer and pause on every visit to the node; dynamic interrupt(payload) can gate conditionally and send decision-ready context.' }],
    },
    {
      id: 'langgraph-mcq-12',
      difficulty: 'hard',
      question: 'Select ALL correct statements about map-reduce with Send.',
      options: [
        'Each worker receives the payload passed to its Send as input',
        'All Send workers produced by one router run in the same superstep',
        'Workers automatically see the full parent state in addition to the payload',
        'Worker outputs to a shared key are combined by that key\'s reducer',
        'Send requires a checkpointer to be configured',
      ],
      correct: [0, 1, 3],
      explanation: 'Send(node, payload) creates one task per payload, all executed in the same superstep, and their writes merge through the reducer. Workers get only their payload (add shared context to it explicitly), and Send works without any checkpointer.',
      followUps: [{ q: 'How do you keep results in the original order?', a: 'Include an index in each payload and result, then sort in the reduce node; do not rely on completion order or reducer append order.' }],
    },
    {
      id: 'langgraph-mcq-13',
      difficulty: 'expert',
      question: 'The parent graph state is { question, answer }. The compiled child graph state is { messages, draft }. The parent adds the child directly as a node. What is the most likely result?',
      code: {
        language: 'typescript',
        code: `const parent = new StateGraph(ParentState)   // { question, answer }
  .addNode('writer', childGraph)             // child: { messages, draft }
  .addEdge(START, 'writer')
  .addEdge('writer', END)
  .compile();`,
      },
      options: [
        'LangGraph maps question → messages and draft → answer automatically',
        'No keys overlap, so the child gets no useful input and its draft never reaches answer; wrap it in a node that maps parent → child input and child output → parent update',
        'Compile fails because subgraphs must use MessagesAnnotation',
        'The child shares all keys with the parent, so both schemas merge',
      ],
      correct: [1],
      explanation: 'A compiled subgraph used directly as a node communicates only through state keys both schemas share. With no overlap, nothing meaningful flows in or out. The fix is a wrapper node that invokes the child with { messages: [question] } and returns { answer: out.draft }. There is no automatic name mapping or schema merge.',
      followUps: [{ q: 'When is adding the subgraph directly the better option?', a: 'When parent and child intentionally share keys such as messages, e.g. a team agent operating on the same conversation, and you want child events and state visible with subgraphs: true.' }],
    },
    {
      id: 'langgraph-mcq-14',
      difficulty: 'expert',
      question: 'A meal-planning assistant must remember dietary preferences across separate conversations for each user. Select ALL that are true of the Store-based design.',
      options: [
        'Store items are readable from any thread when you use the same namespace',
        'The checkpointer writes automatically every superstep, while Store writes happen only when your code calls put',
        'Namespacing Store items by the authenticated user id prevents one user reading another\'s memories',
        'InMemoryStore persists across server restarts if paired with MemorySaver',
        'A new thread_id automatically inherits the previous thread\'s messages through the Store',
      ],
      correct: [0, 1, 2],
      explanation: 'The Store is cross-thread, explicit long-term memory organised by namespaces, so user ids in the namespace give isolation. The checkpointer is automatic, per-thread short-term state. In-memory implementations lose everything on restart, and nothing copies messages to new threads unless your nodes do it.',
      followUps: [{ q: 'What should you store, and what should you avoid storing, in long-term memory?', a: 'Store stable, validated facts and preferences under stable keys with timestamps; avoid raw transcripts and unverified model claims, which bloat search and invite memory poisoning.' }],
    },
  ],
};

export default topic;
