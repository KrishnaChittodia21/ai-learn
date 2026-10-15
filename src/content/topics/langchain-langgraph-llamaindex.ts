import type { Topic } from '../../types';

const topic: Topic = {
  id: 'langchain-langgraph-llamaindex',
  phase: 'frameworks',
  order: 1,
  title: 'LangChain, LangGraph & LlamaIndex',
  subtitle:
    'Composable runnables (LCEL), stateful graphs with checkpoints, and data-first indexing and query engines: what each framework is for and how to use it in TypeScript',
  estimatedMinutes: 44,
  sources: [
    'LangChain JS docs — LangChain v1: createAgent, tools, middleware (docs.langchain.com/oss/javascript/langchain)',
    'LangChain JS reference — @langchain/core runnables (RunnableSequence, RunnableParallel, RunnableLambda, withRetry, withFallbacks, batch)',
    'LangGraph JS docs — Graph API: StateGraph, Annotation, reducers, conditional edges, Command, Send, persistence, streaming',
    'LangGraph JS source — DEFAULT_LOOP_LIMIT (recursionLimit) = 25; RetryPolicy fields',
    'LlamaIndex TS docs and examples — VectorStoreIndex, Settings, asQueryEngine, query({ query }) → { message, sourceNodes }',
    'LlamaIndex TS — @llamaindex/workflow: workflowEvent, createWorkflow, handle, createContext, stream.until().toArray(), createStatefulMiddleware',
  ],
  tags: ['frameworks', 'langchain', 'lcel', 'langgraph', 'llamaindex', 'workflows', 'typescript'],
  cheatSheet: [
    'LangChain = integrations + composable Runnables (LCEL) + createAgent; LangGraph = low-level stateful graph runtime; LlamaIndex = data ingestion, indexing and query engines.',
    'LCEL: prompt.pipe(model).pipe(parser); every Runnable has invoke, batch (maxConcurrency), stream, withRetry({ stopAfterAttempt }), withFallbacks([backup]).',
    'model.withStructuredOutput(zodSchema) returns typed, validated objects instead of free text.',
    'RunnableParallel.from({ a, b }) runs branches concurrently on the same input; RunnableLambda.from(fn) wraps plain functions.',
    'LangGraph: StateGraph(Annotation.Root({...})) + addNode/addEdge/addConditionalEdges + compile({ checkpointer }). Reducers decide how updates merge.',
    'LangGraph persistence: MemorySaver for dev, PostgresSaver (@langchain/langgraph-checkpoint-postgres, call setup()) for prod; state is keyed by configurable.thread_id.',
    'recursionLimit defaults to 25 supersteps in LangGraph JS; exceeding it throws GraphRecursionError.',
    'Stream modes: values (full state), updates (per-node deltas), messages (LLM tokens), custom.',
    'LlamaIndex TS: Settings.llm / Settings.embedModel → VectorStoreIndex.fromDocuments(docs) → asQueryEngine() → query({ query }) returns { message, sourceNodes }.',
    'LlamaIndex workflows are event-driven: handle([eventA], (context, event) => eventB.with(data)); run via createContext().sendEvent(start) and read the stream.',
  ],
  sections: [
    {
      heading: 'LangChain — runnables, LCEL composition and createAgent',
      body: `**Intuition:** LangChain is a box of LEGO bricks for LLM apps. Every brick (prompt, model, parser, retriever, function) is a **Runnable** with the same interface, so they snap together with \`.pipe()\`.

**The Runnable interface** (from \`@langchain/core\`): \`invoke(input)\`, \`batch(inputs, config, { maxConcurrency })\`, \`stream(input)\`, plus wrappers: \`withRetry({ stopAfterAttempt })\`, \`withFallbacks([backup])\`, \`withConfig({ runName, tags })\`.

**LCEL composition**

| Building block | What it does |
|---|---|
| \`a.pipe(b)\` / \`RunnableSequence.from([a, b])\` | Output of a feeds b |
| \`RunnableParallel.from({ x: a, y: b })\` | Runs branches concurrently, returns \`{ x, y }\` |
| \`RunnableLambda.from(fn)\` | Wraps any function as a Runnable |
| \`RunnablePassthrough\` | Forwards input unchanged (e.g. keep the question next to retrieved docs) |
| \`model.withStructuredOutput(zod)\` | Returns a parsed, typed object |

**Agents:** LangChain v1's \`createAgent({ model, tools, systemPrompt, middleware })\` (from the \`langchain\` package) builds a tool-calling loop on top of LangGraph. Middleware hooks (summarisation, HITL, PII redaction) customise it without writing a graph.

**When to use:** you want provider-agnostic models, many ready integrations (vector stores, loaders, retrievers) and small composable pipelines with tracing (LangSmith) for free. For complex control flow, drop to LangGraph; for heavy document indexing, LlamaIndex is often more ergonomic.`,
      example: `**Ticket summariser with fallback.** Chain: \`prompt → model.withStructuredOutput(Summary) → enrich\`.

Input: a 1,800-token support thread. Output: \`{ summary: 'Customer double-charged on 3 Oct; wants refund', sentiment: 'negative', priority: 'high' }\`, already validated by zod.

- \`.withRetry({ stopAfterAttempt: 3 })\` absorbs a transient 529 overload from the primary provider.
- \`.withFallbacks([backupChain])\` switches to a second provider when the primary is fully down.
- \`.batch(tickets, {}, { maxConcurrency: 8 })\` processes 400 tickets: at ~2.5 s each that is 400 / 8 × 2.5 s ≈ 125 s instead of ~17 minutes sequentially.

Every step shows up as a nested span in tracing, so a bad summary can be traced to the exact prompt and model output.`,
      diagram: `   input {thread}
        │
  [ChatPromptTemplate] ──pipe──► [model.withStructuredOutput(Summary)]
        │                                   │ withRetry(3)
        │                                   │ withFallbacks([backup])
        ▼                                   ▼
  RunnableParallel.from({                typed object
     summary: chain,          ──►  { summary: {...}, tags: [...] }
     tags:    tagChain })            (branches run concurrently)
        │
  .batch(inputs, {}, { maxConcurrency: 8 })  /  .stream(input)`,
      code: [
        {
          language: 'typescript',
          title: 'LCEL pipeline with structured output, parallel branches, retry, fallback and batch',
          code: `import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableParallel, RunnableLambda } from '@langchain/core/runnables';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const Summary = z.object({
  summary: z.string().describe('One sentence'),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  priority: z.enum(['low', 'medium', 'high']),
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You triage support threads. Be factual.'],
  ['human', 'Thread:\\n{thread}'],
]);

const primary = new ChatAnthropic({ model: process.env.LLM_MODEL ?? 'claude-sonnet-5-5', temperature: 0 });
const backup = new ChatOpenAI({ model: process.env.BACKUP_MODEL ?? 'gpt-5-mini', temperature: 0 });

const summarise = prompt
  .pipe(primary.withStructuredOutput(Summary).withRetry({ stopAfterAttempt: 3 }))
  .withFallbacks([prompt.pipe(backup.withStructuredOutput(Summary))]); // other provider if primary fails

// Plain function as a Runnable: cheap deterministic step, no LLM
const wordCount = RunnableLambda.from((i: { thread: string }) => i.thread.split(/\\s+/).length);

export const triage = RunnableParallel.from({ result: summarise, words: wordCount });

const threads = [{ thread: 'I was charged twice on 3 Oct...' }, { thread: 'How do I export my data?' }];
const out = await triage.batch(threads, {}, { maxConcurrency: 8 });
console.log(out[0].result.priority, out[0].words);`,
        },
      ],
      prosCons: {
        pros: [
          'One interface (invoke/batch/stream) for prompts, models, retrievers and functions.',
          'Provider-agnostic models plus hundreds of integrations save weeks of glue code.',
          'Retries, fallbacks, concurrency limits and tracing are one method call away.',
          'createAgent + middleware gives a production tool-calling loop without writing a graph.',
        ],
        cons: [
          { con: 'Abstraction layers hide the actual prompt and API call, making debugging harder.', fix: 'Turn on tracing (LangSmith or an OpenTelemetry callback) and inspect the rendered prompt and raw response for every step.' },
          { con: 'Frequent API churn across major versions breaks code and tutorials.', fix: 'Pin versions, import from @langchain/core and specific integration packages, and keep framework code behind a thin internal interface.' },
          { con: 'Long LCEL chains with branching become hard to read.', fix: 'Move control flow (loops, branching, retries with state) into LangGraph; keep LCEL for short linear pipelines.' },
          { con: 'Unbounded batch() can trip provider rate limits.', fix: 'Pass { maxConcurrency } in batch options and combine with withRetry for 429s.' },
        ],
      },
      keyPoints: [
        'Everything is a Runnable: compose with pipe, parallelise with RunnableParallel.',
        'withStructuredOutput(zod) gives validated objects.',
        'withRetry handles transient errors; withFallbacks handles provider outages.',
        'createAgent (langchain v1) is the high-level agent; LangGraph is underneath.',
      ],
      exercise: {
        prompt: `Build a **RAG answer chain** with LCEL.

Given a \`retriever\` (a Runnable: string → Document[]) and a chat \`model\`, build \`chain\` so that \`chain.invoke('What is the refund window?')\`:
1. retrieves docs **and** keeps the question (use RunnableParallel / RunnablePassthrough),
2. formats docs as numbered context \`[1] ...\`,
3. calls the model with a prompt that requires citing \`[n]\`,
4. returns a plain string via StringOutputParser.`,
        starter: {
          language: 'typescript',
          code: `import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableParallel, RunnablePassthrough, RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Document } from '@langchain/core/documents';
import type { Runnable } from '@langchain/core/runnables';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

declare const retriever: Runnable<string, Document[]>;
declare const model: BaseChatModel;

// TODO: formatDocs, prompt, chain
export const chain = null;`,
        },
        hints: [
          'RunnableParallel.from({ context: retriever.pipe(formatDocs), question: new RunnablePassthrough() }).',
          'formatDocs = RunnableLambda.from((docs: Document[]) => docs.map((d, i) => \'[\' + (i + 1) + \'] \' + d.pageContent).join(\'\\n\')).',
          'Finish with .pipe(prompt).pipe(model).pipe(new StringOutputParser()).',
        ],
        solution: {
          language: 'typescript',
          code: `import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableParallel, RunnablePassthrough, RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Document } from '@langchain/core/documents';
import type { Runnable } from '@langchain/core/runnables';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

declare const retriever: Runnable<string, Document[]>;
declare const model: BaseChatModel;

const formatDocs = RunnableLambda.from((docs: Document[]) =>
  docs.map((d, i) => '[' + (i + 1) + '] ' + d.pageContent).join('\\n\\n'),
);

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'Answer ONLY from the context. Cite sources as [n]. If the answer is missing, say "I don\\'t know".'],
  ['human', 'Context:\\n{context}\\n\\nQuestion: {question}'],
]);

export const chain = RunnableParallel.from({
  context: retriever.pipe(formatDocs),   // string → Document[] → string
  question: new RunnablePassthrough<string>(), // keep the original question
})
  .pipe(prompt)
  .pipe(model)
  .pipe(new StringOutputParser());

// await chain.invoke('What is the refund window?')`,
        },
        explanation: 'RunnableParallel fans the same input to the retriever branch and the passthrough branch, producing exactly the { context, question } object the prompt template expects. Numbered context plus an explicit "I don\'t know" instruction makes citations checkable and reduces fabrication.',
      },
      quickCheck: {
        question: 'Your LCEL chain must keep working when the primary LLM provider has a full outage. Which wrapper addresses that?',
        options: ['withRetry({ stopAfterAttempt: 5 })', 'withFallbacks([chainOnOtherProvider])', 'batch with maxConcurrency 1', 'withConfig({ runName })'],
        correct: 1,
        explanation: 'Retries help with transient errors but keep hitting the same dead provider. withFallbacks tries an alternative Runnable (another provider) when the primary throws. Concurrency and run names do not change availability.',
      },
      source: 'LangChain JS reference — @langchain/core runnables',
    },
    {
      heading: 'LangGraph — StateGraph, nodes, edges, conditional edges and checkpointers',
      body: `**Intuition:** LangGraph turns your agent into a flowchart that remembers. Nodes are functions, edges are arrows, and a shared **state** object flows through; after every step the state is checkpointed so you can pause, resume, or rewind.

**Core API (\`@langchain/langgraph\`)**
- **State:** \`Annotation.Root({ ... })\`. Each key can have a **reducer** (\`messages\` appends, \`findings: (a, b) => a.concat(b)\`); keys without one are last-write-wins. \`MessagesAnnotation\` is a ready-made \`messages\` channel.
- **Nodes:** \`addNode(name, fn)\` where \`fn(state, config)\` returns a *partial update*.
- **Edges:** \`addEdge(a, b)\` (fixed), \`addConditionalEdges(a, routerFn)\` (router returns the next node name or \`END\`), or return \`new Command({ goto, update })\` from a node. \`Send(node, payload)\` fans out map-reduce workers.
- **Compile:** \`compile({ checkpointer })\`. Each run uses \`{ configurable: { thread_id } }\`.
- **Persistence:** \`MemorySaver\` (dev), \`PostgresSaver\` (prod). Read with \`getState(config)\`, edit with \`updateState(config, values)\`, browse with \`getStateHistory\`.
- **Streaming:** \`streamMode: 'values' | 'updates' | 'messages'\`.
- **Limits:** \`recursionLimit\` (default 25 supersteps) → \`GraphRecursionError\`.

**Execution model:** nodes that become ready together run in one **superstep** in parallel; their updates are merged via reducers, then a checkpoint is written.

**When to use:** anything with loops, branches, long-running or resumable work, human approval (\`interrupt()\`, covered in the HITL topic), or multi-agent coordination. For a single linear chain, LCEL is enough.`,
      example: `**ReAct-style support agent as a graph.** Nodes: \`agent\` (LLM with tools bound) and \`tools\` (executes tool calls). Conditional edge after \`agent\`: if the last AI message has \`tool_calls\` → \`tools\`, else \`END\`. Edge \`tools → agent\`.

Run on thread \`user-42\`: "Where is order 7781?" → superstep 1: agent emits \`get_order({id: 7781})\` → superstep 2: tool returns \`{ status: 'shipped', eta: '17 Oct' }\` → superstep 3: agent answers. 3 supersteps, 3 checkpoints.

Next day the user asks "Can I change the address?" on the same thread: \`getState\` shows the previous 4 messages, so the agent knows which order. With \`streamMode: 'updates'\` the UI shows "Looking up order…" as soon as the agent node finishes, ~700 ms before the final answer.`,
      diagram: `      START
        │
     [agent] ── LLM with tools bound
        │
   route(state): last message has tool_calls?
        ├── yes ──► [tools] ──┐
        │                     │ (results appended via messages reducer)
        │  ◄──────────────────┘
        └── no ───► END

  checkpoint after every superstep  ──► thread_id = 'user-42'
  getState / updateState / getStateHistory  |  recursionLimit = 25`,
      code: [
        {
          language: 'typescript',
          title: 'A tool-calling agent as an explicit StateGraph with a checkpointer and streaming',
          code: `import { StateGraph, MessagesAnnotation, START, END, MemorySaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { AIMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { z } from 'zod';

const getOrder = tool(async ({ id }) => JSON.stringify({ id, status: 'shipped', eta: '17 Oct' }), {
  name: 'get_order',
  description: 'Look up an order by numeric id',
  schema: z.object({ id: z.number() }),
});
const tools = [getOrder];
const model = new ChatAnthropic({ model: process.env.LLM_MODEL ?? 'claude-sonnet-5-5' }).bindTools(tools);

const agent = async (s: typeof MessagesAnnotation.State) => ({ messages: [await model.invoke(s.messages)] });

// Router: continue to tools while the model keeps requesting them
const route = (s: typeof MessagesAnnotation.State) => {
  const last = s.messages.at(-1) as AIMessage;
  return last.tool_calls?.length ? 'tools' : END;
};

export const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agent)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', route, ['tools', END])
  .addEdge('tools', 'agent')
  .compile({ checkpointer: new MemorySaver() }); // PostgresSaver in production

const config = { configurable: { thread_id: 'user-42' }, recursionLimit: 12 };
for await (const update of await graph.stream(
  { messages: [{ role: 'user', content: 'Where is order 7781?' }] },
  { ...config, streamMode: 'updates' },
)) {
  console.log(Object.keys(update)); // ['agent'] → ['tools'] → ['agent']
}
const snapshot = await graph.getState(config);
console.log(snapshot.values.messages.length, snapshot.next); // 4 messages, [] = finished`,
        },
      ],
      prosCons: {
        pros: [
          'Explicit, inspectable control flow: loops and branches are code, not prompt hopes.',
          'Checkpointing gives memory per thread, crash recovery, time-travel and human-in-the-loop.',
          'Parallel supersteps with reducers make fan-out/fan-in safe.',
          'Fine-grained streaming (node updates and LLM tokens) for responsive UIs.',
        ],
        cons: [
          { con: 'More boilerplate than a prebuilt agent for simple cases.', fix: 'Start with createAgent; drop to a custom StateGraph only when you need custom routing, parallelism or persistence semantics.' },
          { con: 'State grows without bound (full message history in every checkpoint).', fix: 'Trim or summarise messages in a node, store large blobs by reference, and prune old checkpoints.' },
          { con: 'A bad router loops until GraphRecursionError.', fix: 'Track a step counter or budget in state, route to a graceful END, and set recursionLimit explicitly per use case.' },
          { con: 'Parallel writes to a key without a reducer fail at runtime.', fix: 'Give every key written by parallel nodes a reducer (concat, merge by id) when you define the Annotation.' },
        ],
      },
      keyPoints: [
        'State + reducers define how node updates merge.',
        'Conditional edges (or Command goto) implement routing; Send implements map-reduce.',
        'compile({ checkpointer }) + thread_id = persistent, resumable threads.',
        'recursionLimit defaults to 25; set budgets explicitly.',
      ],
      exercise: {
        prompt: `Build a **draft → critique → revise** graph with LangGraph.

State: \`{ topic: string; draft: string; critique: string; revisions: number }\`.
- \`write\` creates the draft (use a stub \`llm(prompt)\`).
- \`critique\` returns \`'OK'\` or feedback.
- Conditional edge after \`critique\`: \`'OK'\` or \`revisions >= 2\` → \`END\`, else → \`revise\` → back to \`critique\`.
- \`revise\` increments \`revisions\` and rewrites the draft.
Compile with a MemorySaver and invoke on a thread.`,
        hints: [
          'Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }) gives a default for revisions.',
          'The router reads state and returns \'revise\' or END; pass the possible targets as the third argument.',
          'invoke({ topic }, { configurable: { thread_id: \'essay-1\' } }).',
        ],
        solution: {
          language: 'typescript',
          code: `import { StateGraph, Annotation, START, END, MemorySaver } from '@langchain/langgraph';
declare function llm(prompt: string): Promise<string>;

const State = Annotation.Root({
  topic: Annotation<string>(),
  draft: Annotation<string>(),
  critique: Annotation<string>(),
  revisions: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});
type S = typeof State.State;

const graph = new StateGraph(State)
  .addNode('write', async (s: S) => ({ draft: await llm('Write 150 words on ' + s.topic) }))
  .addNode('critique', async (s: S) => ({
    critique: await llm('Reply OK if this is accurate and clear, else list fixes:\\n' + s.draft),
  }))
  .addNode('revise', async (s: S) => ({
    draft: await llm('Apply these fixes:\\n' + s.critique + '\\n\\n' + s.draft),
    revisions: s.revisions + 1,
  }))
  .addEdge(START, 'write')
  .addEdge('write', 'critique')
  .addConditionalEdges(
    'critique',
    (s: S) => (s.critique.trim().startsWith('OK') || s.revisions >= 2 ? END : 'revise'),
    ['revise', END],
  )
  .addEdge('revise', 'critique')
  .compile({ checkpointer: new MemorySaver() });

const out = await graph.invoke({ topic: 'KV cache' }, { configurable: { thread_id: 'essay-1' } });
console.log(out.revisions, out.draft);`,
        },
        explanation: 'The loop is bounded by state (revisions ≥ 2), not by hoping the critic says OK, so the run always terminates well under the recursion limit. The checkpointer lets you inspect every draft via getStateHistory when debugging.',
      },
      quickCheck: {
        question: 'Two runs use the same compiled graph, one with thread_id "a" and one with "b". What do they share?',
        options: [
          'Their message history',
          'Nothing in state: each thread has its own checkpoints; they share only the graph definition',
          'Their latest checkpoint',
          'Their recursion counter',
        ],
        correct: 1,
        explanation: 'State is scoped per thread_id in the checkpointer, so threads are isolated conversations/runs. Cross-thread memory needs a separate store (e.g. LangGraph Store) keyed by user.',
      },
      source: 'LangGraph JS docs — Graph API and Persistence',
    },
    {
      heading: 'LlamaIndex — documents, indices, query engines and workflows',
      body: `**Intuition:** LlamaIndex is a librarian. You hand it documents; it cuts them into nodes, catalogues them in an **index**, and gives you a **query engine** that finds the right passages and writes a grounded answer, with sources.

**Core pipeline (TypeScript, \`llamaindex\` + \`@llamaindex/openai\`)**
1. **Settings:** global \`Settings.llm\` and \`Settings.embedModel\`.
2. **Documents → nodes:** \`new Document({ text, id_, metadata })\`; a node parser splits into chunks (default sentence splitter).
3. **Index:** \`VectorStoreIndex.fromDocuments(docs)\` embeds and stores nodes (in-memory by default, or a vector store such as Qdrant/pgvector).
4. **Retrieval:** \`index.asRetriever({ similarityTopK: 5 })\` returns scored nodes.
5. **Query engine:** \`index.asQueryEngine()\` = retriever + response synthesiser. \`query({ query })\` returns \`{ message, sourceNodes }\`.

**Workflows (\`@llamaindex/workflow\`):** event-driven orchestration. Define typed events with \`workflowEvent<T>()\`, register handlers with \`workflow.handle([inEvent], (context, event) => ...)\` that return \`outEvent.with(data)\`, run via \`createContext()\` → \`sendEvent(start)\` → consume \`stream\` (e.g. \`stream.until(stopEvent).toArray()\`). \`createStatefulMiddleware\` adds shared state (\`context.state\`) like iteration counters.

| | LlamaIndex | LangChain/LangGraph |
|---|---|---|
| Centre of gravity | Data: ingestion, indices, retrieval | Composition, agents, control flow |
| Orchestration | Event-driven workflows | Graph with checkpoints |

**When to use:** document-heavy RAG where you want strong defaults for parsing, chunking, indexing and cited answers quickly. Many teams use LlamaIndex for the data layer and LangGraph for orchestration.`,
      example: `**HR policy bot.** 38 policy PDFs (≈ 420K tokens) parsed into ~1,100 nodes of ~512 tokens. Embedding with \`text-embedding-3-small\` (1536-d): 420K tokens × $0.02/1M ≈ $0.01 (illustrative price).

Query: "How many days of parental leave do contractors get?" → retriever with \`similarityTopK: 5\` returns nodes scored 0.83, 0.79, 0.71, 0.55, 0.52 → synthesiser answers "Contractors are not eligible for paid parental leave; employees get 16 weeks" with \`sourceNodes\` pointing to *Leave-Policy-2026.pdf* p.4 and *Contractor-Handbook.pdf* p.12.

Adding a metadata filter \`{ docType: 'policy', year: 2026 }\` removed a 2023 policy node that had scored 0.71 and caused a stale answer.`,
      diagram: `  files ─► Document[] ─► node parser (chunks + metadata)
                                │ embed (Settings.embedModel)
                                ▼
                       [VectorStoreIndex]  (memory | Qdrant | pgvector)
                                │
         asRetriever({ similarityTopK })   asQueryEngine()
                                │               │ retrieve → synthesise
                                ▼               ▼
                        scored nodes     { message, sourceNodes }

  Workflow:  startEvent ─handle─► retrieveEvent ─handle─► answerEvent ─► stream`,
      code: [
        {
          language: 'typescript',
          title: 'Index documents and query with sources (LlamaIndex TS)',
          code: `import { Document, VectorStoreIndex, Settings, MetadataMode } from 'llamaindex';
import { openai, OpenAIEmbedding } from '@llamaindex/openai';

Settings.llm = openai({ model: process.env.LLM_MODEL ?? 'gpt-5-mini' });
Settings.embedModel = new OpenAIEmbedding({ model: 'text-embedding-3-small' });

const docs = [
  new Document({ text: 'Employees get 16 weeks paid parental leave...', id_: 'leave-2026', metadata: { year: 2026 } }),
  new Document({ text: 'Contractors are not eligible for paid leave...', id_: 'contractor-handbook', metadata: { year: 2026 } }),
];

// Chunks, embeds and stores nodes (in memory here; plug a vector store for production)
const index = await VectorStoreIndex.fromDocuments(docs);

// 1) Raw retrieval: inspect what the LLM would see
const retriever = index.asRetriever({ similarityTopK: 3 });
const hits = await retriever.retrieve({ query: 'parental leave for contractors' });
hits.forEach((h) => console.log(h.score?.toFixed(2), h.node.getContent(MetadataMode.NONE).slice(0, 60)));

// 2) Query engine = retriever + response synthesis, with sources
const engine = index.asQueryEngine({ similarityTopK: 3 });
const { message, sourceNodes } = await engine.query({ query: 'How much parental leave do contractors get?' });
console.log(message.content);
console.log(sourceNodes?.map((n) => n.node.id_));`,
        },
        {
          language: 'typescript',
          title: 'Event-driven workflow: retrieve → answer → check, with a bounded retry',
          code: `import { createWorkflow, workflowEvent, createStatefulMiddleware } from '@llamaindex/workflow';

declare function retrieve(q: string): Promise<string[]>;
declare function answer(q: string, ctx: string[]): Promise<string>;
declare function grounded(a: string, ctx: string[]): Promise<boolean>;

const startEvent = workflowEvent<string>();
const contextEvent = workflowEvent<{ q: string; ctx: string[] }>();
const stopEvent = workflowEvent<{ answer: string; grounded: boolean }>();

const { withState } = createStatefulMiddleware(() => ({ attempts: 0 }));
const wf = withState(createWorkflow());

// Handlers receive (context, event); context.state comes from the middleware
wf.handle([startEvent], async (_ctx, ev) => contextEvent.with({ q: ev.data, ctx: await retrieve(ev.data) }));

wf.handle([contextEvent], async (context, ev) => {
  const state = context.state;
  const a = await answer(ev.data.q, ev.data.ctx);
  const ok = await grounded(a, ev.data.ctx);
  state.attempts += 1;
  if (!ok && state.attempts < 2) return contextEvent.with(ev.data); // one retry
  return stopEvent.with({ answer: a, grounded: ok });
});

const { stream, sendEvent } = wf.createContext();
sendEvent(startEvent.with('What is the refund window?'));
const events = await stream.until(stopEvent).toArray();
console.log(events.at(-1)?.data);`,
        },
      ],
      prosCons: {
        pros: [
          'Fast path from raw documents to a cited RAG answer with sensible defaults.',
          'Rich data tooling: loaders, node parsers, metadata, many vector store integrations.',
          'Query engines expose sourceNodes, making citations and evaluation straightforward.',
          'Workflows give typed, event-driven orchestration with streaming of intermediate events.',
        ],
        cons: [
          { con: 'Default in-memory index is lost on restart and does not scale.', fix: 'Use a persistent vector store (Qdrant, pgvector) via a storage context and ingest in a separate pipeline.' },
          { con: 'Default chunking/top-k may be wrong for your corpus.', fix: 'Tune the node parser (chunk size/overlap), similarityTopK and add a reranker; evaluate retrieval recall on a labelled set.' },
          { con: 'Global Settings make it easy to accidentally share one model config across tenants/tests.', fix: 'Pass llm/embedModel explicitly per index or query engine where supported, and set Settings once at startup.' },
          { con: 'TS package split (llamaindex, @llamaindex/openai, @llamaindex/workflow) changes between versions.', fix: 'Pin versions and follow the migration notes; wrap framework calls behind your own retrieval interface.' },
        ],
      },
      keyPoints: [
        'Document → nodes → index → retriever → query engine.',
        'query({ query }) returns { message, sourceNodes } for cited answers.',
        'Workflows: typed events, handlers returning events, stream until a stop event.',
        'Use LlamaIndex for the data layer; combine with LangGraph if you need checkpointed orchestration.',
      ],
      exercise: {
        prompt: `Add **metadata filtering + a minimum score** to retrieval.

Write \`retrieveFresh(index, query, year)\` that retrieves top 8 nodes, keeps only nodes whose \`metadata.year === year\` **and** score ≥ 0.6, and returns at most 4 \`{ id, score, text }\` objects sorted by score. If nothing survives, return an empty array (the caller will answer "I don't know").`,
        hints: [
          'index.asRetriever({ similarityTopK: 8 }).retrieve({ query }).',
          'Each hit has .score (may be undefined) and .node.metadata.',
          'Filter, sort descending, slice(0, 4), and map to plain objects.',
        ],
        solution: {
          language: 'typescript',
          code: `import { MetadataMode, type VectorStoreIndex } from 'llamaindex';

export async function retrieveFresh(index: VectorStoreIndex, query: string, year: number) {
  const hits = await index.asRetriever({ similarityTopK: 8 }).retrieve({ query });
  return hits
    .filter((h) => (h.score ?? 0) >= 0.6 && h.node.metadata.year === year) // freshness + relevance
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 4)
    .map((h) => ({ id: h.node.id_, score: h.score ?? 0, text: h.node.getContent(MetadataMode.NONE) }));
}`,
        },
        explanation: 'Over-fetching (8) then filtering keeps enough candidates after the freshness filter removes stale versions; the score floor prevents low-similarity filler from reaching the prompt. For large corpora push the year filter into the vector store query so filtering happens before top-k.',
      },
      quickCheck: {
        question: 'A LlamaIndex query engine answers from a 2023 policy instead of the 2026 one. Which fix targets the cause?',
        options: [
          'Switch to a larger LLM',
          'Add metadata (year/version) at ingestion and filter retrieval on it',
          'Increase similarityTopK to 50',
          'Lower the temperature to 0',
        ],
        correct: 1,
        explanation: 'Both versions are semantically similar, so similarity alone cannot pick the current one; a metadata filter can. A larger model or lower temperature still sees the stale passage, and a larger top-k adds even more stale context.',
      },
      source: 'LlamaIndex TS docs and examples — VectorStoreIndex, query engine, workflows',
    },
  ],
  codeChallenges: [
    {
      id: 'langchain-langgraph-llamaindex-cc-1',
      title: 'Harden a hand-rolled LangGraph agent loop',
      context: 'A team built a LangGraph agent whose router always returns "tools" if the last message has any content, has no checkpointer, and runs with a recursionLimit of 1000 "to be safe". In production it occasionally loops for minutes and every request forgets the conversation.',
      task: 'Fix the router, add persistence keyed by user conversation, add an explicit step budget in state that ends gracefully, and lower the recursion limit to a sane value.',
      starter: {
        language: 'typescript',
        code: `import { StateGraph, MessagesAnnotation, START } from '@langchain/langgraph';
declare const agentNode: any, toolNode: any;

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', (s) => (s.messages.at(-1)?.content ? 'tools' : 'agent'))
  .addEdge('tools', 'agent')
  .compile();

export const run = (text: string) =>
  graph.invoke({ messages: [{ role: 'user', content: text }] }, { recursionLimit: 1000 });`,
      },
      hints: [
        'Route on tool_calls of the last AIMessage, not on content.',
        'Extend MessagesAnnotation.spec with a steps counter and increment it in the agent node.',
        'compile({ checkpointer }) and pass configurable.thread_id from the caller.',
      ],
      solution: {
        language: 'typescript',
        code: `import { StateGraph, MessagesAnnotation, Annotation, START, END } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { AIMessage } from '@langchain/core/messages';
declare const model: { invoke: (m: unknown[]) => Promise<AIMessage> };
declare const toolNode: any;

const MAX_STEPS = 8;
const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  steps: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});
type S = typeof State.State;

const agent = async (s: S) => {
  if (s.steps >= MAX_STEPS) {
    return { messages: [new AIMessage('I could not finish within my step budget; a human will follow up.')], steps: s.steps };
  }
  return { messages: [await model.invoke(s.messages)], steps: s.steps + 1 };
};

const route = (s: S) => {
  const last = s.messages.at(-1) as AIMessage;
  return last.tool_calls?.length && s.steps < MAX_STEPS ? 'tools' : END; // only real tool calls loop
};

const saver = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
await saver.setup();

const graph = new StateGraph(State)
  .addNode('agent', agent)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', route, ['tools', END])
  .addEdge('tools', 'agent')
  .compile({ checkpointer: saver });

export const run = (conversationId: string, text: string) =>
  graph.invoke(
    { messages: [{ role: 'user', content: text }], steps: 0 }, // reset budget per user turn
    { configurable: { thread_id: 'conv:' + conversationId }, recursionLimit: 2 * MAX_STEPS + 4 },
  );`,
      },
      explanation: 'The router now loops only when the model actually requested tools, which removes the main cause of runaway loops. A step counter in state ends the run with a graceful message before the hard recursionLimit (now 20, sized from the budget) ever triggers. A durable checkpointer keyed by conversation gives memory across requests and replicas.',
      followUps: [
        { q: 'Why reset steps to 0 on every user turn instead of keeping it cumulative?', a: 'The budget bounds work per request; a cumulative counter would make long conversations eventually unusable, whereas per-turn budgets bound latency and cost of each response.' },
        { q: 'The message history in the checkpoint is now 300 messages. What do you do?', a: 'Add a summarisation/trim node (or middleware) that keeps the last N turns plus a running summary, and store tool outputs by reference rather than inline.' },
      ],
    },
    {
      id: 'langchain-langgraph-llamaindex-cc-2',
      title: 'Make a LlamaIndex ingestion + query script production-ready',
      context: 'A script re-embeds all 20K documents on every server start (in-memory index), uses default top-k, prints only the answer text and crashes the whole batch if one document fails to load.',
      task: 'Separate ingestion from querying, skip unchanged documents by content hash, isolate per-document failures, and return answers with source ids and a refusal when no source clears a score threshold.',
      starter: {
        language: 'typescript',
        code: `import { Document, VectorStoreIndex } from 'llamaindex';
declare function loadAll(): Promise<{ id: string; text: string }[]>;

export async function main(question: string) {
  const raw = await loadAll(); // throws if any file is corrupt
  const index = await VectorStoreIndex.fromDocuments(raw.map((r) => new Document({ text: r.text })));
  const res = await index.asQueryEngine().query({ query: question });
  return res.message.content;
}`,
      },
      hints: [
        'Hash text with node:crypto; keep a map id → hash in your DB to skip unchanged docs.',
        'Use Promise.allSettled for loading; log failures and continue.',
        'Retrieve first, check the top score, then call the query engine only if evidence exists.',
      ],
      solution: {
        language: 'typescript',
        code: `import { createHash } from 'node:crypto';
import { Document, VectorStoreIndex, MetadataMode } from 'llamaindex';
declare function listSources(): Promise<string[]>;
declare function loadOne(id: string): Promise<{ id: string; text: string }>;
declare const hashes: { get(id: string): Promise<string | null>; set(id: string, h: string): Promise<void> };
declare const index: VectorStoreIndex; // backed by a persistent vector store

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

// Run as a separate job, not on server start
export async function ingest() {
  const ids = await listSources();
  const loaded = await Promise.allSettled(ids.map(loadOne));
  let added = 0;
  for (const r of loaded) {
    if (r.status === 'rejected') { console.error('load failed', r.reason); continue; } // isolate failures
    const h = sha(r.value.text);
    if ((await hashes.get(r.value.id)) === h) continue; // unchanged: skip re-embedding
    await index.insert(new Document({ text: r.value.text, id_: r.value.id, metadata: { hash: h } }));
    await hashes.set(r.value.id, h);
    added++;
  }
  return { total: ids.length, added };
}

export async function ask(question: string) {
  const hits = await index.asRetriever({ similarityTopK: 5 }).retrieve({ query: question });
  if (!hits.length || (hits[0].score ?? 0) < 0.55) return { answer: "I don't know based on the documents.", sources: [] };
  const res = await index.asQueryEngine({ similarityTopK: 5 }).query({ query: question });
  return {
    answer: res.message.content,
    sources: (res.sourceNodes ?? []).map((n) => ({ id: n.node.id_, score: n.score, preview: n.node.getContent(MetadataMode.NONE).slice(0, 80) })),
  };
}`,
      },
      explanation: 'Ingestion becomes an idempotent job: unchanged documents are skipped by content hash (saving re-embedding cost and startup time) and one corrupt file no longer aborts the batch. Querying checks evidence first and returns source ids, enabling citations and refusals instead of confident answers from weak matches.',
      followUps: [
        { q: 'A document changed: what else must happen besides inserting the new version?', a: 'Delete the old nodes for that document id (refDoc) from the vector store before inserting, otherwise stale and fresh chunks coexist and retrieval can return the outdated text.' },
        { q: 'How would you pick the 0.55 score threshold?', a: 'Plot top-1 scores for answerable vs unanswerable questions on a labelled set and pick the threshold that balances false refusals against wrong answers; it is model- and corpus-specific.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'langchain-langgraph-llamaindex-iq-1',
      difficulty: 'medium',
      question: 'A startup asks whether to build their document Q&A product on LangChain, LangGraph, LlamaIndex, or plain SDK calls. How do you decide?',
      whatInterviewerLooksFor: [
        'Clear mental model of what each framework is for',
        'Criteria: control-flow complexity, data complexity, team skills, lock-in',
        'Willingness to recommend plain SDK calls when appropriate',
        'A migration/abstraction strategy',
      ],
      modelAnswer: `**What each is for**
- **Plain SDK:** one or two LLM calls, full control, zero abstraction cost.
- **LangChain (+ @langchain/core):** provider-agnostic models, integrations, LCEL pipelines, \`createAgent\`.
- **LangGraph:** stateful control flow: loops, branching, persistence, HITL, multi-agent.
- **LlamaIndex:** data layer: loaders, parsing, chunking, indices, retrievers, query engines with sources.

**Decision criteria**

| Question | Points to |
|---|---|
| Is the hard part the documents (many formats, chunking, metadata, retrieval quality)? | LlamaIndex |
| Is the hard part control flow (multi-step, retries, approvals, long-running)? | LangGraph |
| Need many providers/integrations quickly in simple pipelines? | LangChain |
| 1–2 calls, strict latency, small team that wants to read every line? | Plain SDK |

**For document Q&A specifically:** start with LlamaIndex (or plain SDK + a vector DB) for ingestion and retrieval, because retrieval quality is what decides success. Add LangGraph only when the flow grows (query routing, corrective retrieval loops, approvals).

**Protect yourself:** wrap the framework behind internal interfaces (\`retrieve(query)\`, \`answer(question, ctx)\`), pin versions, and build an eval set from day one so swapping frameworks is measurable rather than a rewrite on faith.`,
      followUps: [
        { q: 'When would you rip a framework out?', a: 'When you spend more time working around abstractions than using them, e.g. needing exact control over prompts, caching or streaming that the framework obscures; the internal interface makes that replacement local.' },
        { q: 'Can LlamaIndex and LangGraph be combined?', a: 'Yes: use a LlamaIndex retriever or query engine inside a LangGraph node (or as a tool), keeping LlamaIndex for the data layer and LangGraph for checkpointed orchestration.' },
      ],
      pitfalls: [
        'Treating the three as interchangeable',
        'Choosing by popularity instead of where the complexity lives',
        'No abstraction boundary, making migration expensive',
      ],
    },
    {
      id: 'langchain-langgraph-llamaindex-iq-2',
      difficulty: 'hard',
      question: 'Explain LangGraph\'s execution model (supersteps, reducers, checkpoints) and how it affects parallel nodes, failures and resumption.',
      whatInterviewerLooksFor: [
        'Supersteps as the unit of parallel execution and checkpointing',
        'Reducer semantics and update conflicts',
        'What happens to completed vs failed nodes on retry/resume',
        'Practical implications for side effects',
      ],
      modelAnswer: `**Supersteps.** LangGraph follows a Pregel-style model: at each superstep, all nodes whose inputs are ready run **in parallel**. When they finish, their partial updates are applied to the state channels, and a **checkpoint** is written. Then the next set of triggered nodes runs.

**Reducers.** Each state key is a channel. Without a reducer it is last-value: two parallel nodes writing it in the same superstep raises an invalid update error. With a reducer (\`concat\`, \`messagesStateReducer\`, merge-by-id) concurrent writes are merged deterministically. Choose reducers for any key written by fan-out (\`Send\`) workers.

**Failures.** If one node in a superstep fails, the superstep doesn't commit as a whole; LangGraph saves *pending writes* from nodes that succeeded, so on retry/resume those successful nodes are not re-executed, only the failed ones. Per-node \`retryPolicy\` (maxAttempts, initialInterval, backoffFactor) handles transient errors before the run fails.

**Resumption.** Invoking with the same \`thread_id\` (and \`null\` input) continues from the last checkpoint. Interrupted nodes re-execute from the top.

**Implications**
- Side effects inside nodes can repeat (failed node retried, interrupted node restarted): make them idempotent.
- Keep state small; every superstep writes a checkpoint.
- Recursion limit counts supersteps (default 25), so a parallel fan-out of 50 workers still costs one step.`,
      followUps: [
        { q: 'How do you replay a run from an earlier point to debug?', a: 'Use getStateHistory to find the checkpoint id, then invoke with that checkpoint_id in configurable (optionally after updateState to change values) to fork execution from there.' },
        { q: 'How does a fan-out of 50 workers interact with provider rate limits?', a: 'They all start in one superstep, so set maxConcurrency in the run config or a shared limiter in the worker, plus retry policies with backoff for 429s.' },
      ],
      pitfalls: [
        'Assuming nodes run strictly one after another',
        'Forgetting reducers on fan-out keys',
        'Believing checkpoints make external side effects safe',
      ],
    },
    {
      id: 'langchain-langgraph-llamaindex-iq-3',
      difficulty: 'hard',
      question: 'Your LCEL chain works in tests but in production 3% of requests fail with schema errors and 1% time out during provider incidents. How do you harden it with framework features and beyond?',
      whatInterviewerLooksFor: [
        'Structured output plus validation-aware retries',
        'Retry vs fallback distinction',
        'Timeouts and concurrency limits',
        'Observability to find failing inputs',
      ],
      modelAnswer: `**Diagnose first.** Turn on tracing and pull the failing runs: are schema errors concentrated on long inputs, specific languages, or enum values the model invents?

**Schema errors (3%)**
- Use \`model.withStructuredOutput(zodSchema)\` (tool/JSON-schema mode) rather than parsing free text.
- Tighten the schema: enums with descriptions, optional fields where data may be missing, \`.describe()\` hints.
- Wrap with \`.withRetry({ stopAfterAttempt: 2 })\` and, for persistent failures, a repair step that feeds the zod error back to the model.
- If a field is often missing, it's a data problem: allow \`null\` and handle downstream.

**Provider incidents (1%)**
- \`withRetry\` for transient 429/5xx with backoff, but it can't fix an outage.
- \`withFallbacks([sameChainOnOtherProvider])\` for full outages; keep prompts provider-neutral and evaluate the fallback model on the same eval set.
- Set request **timeouts** on the model client so a hung call fails fast enough for the fallback to matter.

**Throughput**
- \`batch(..., { maxConcurrency })\` and a rate limiter to stay under provider quotas (avoid self-inflicted 429s).

**Prove it**
- Replay the failing production inputs as a regression set; track schema-failure rate, fallback rate and p95 latency on a dashboard with alerts.`,
      followUps: [
        { q: 'Why can a fallback model hurt quality silently?', a: 'Prompts tuned for the primary may behave differently on another model; without evaluating the fallback on your eval set, outages degrade answers without anyone noticing.' },
        { q: 'What would you alert on?', a: 'Fallback activation rate, schema-repair rate and p95 latency per chain, since a rise in any of them is an early signal of provider or prompt regressions.' },
      ],
      pitfalls: [
        'Using retries to paper over a bad schema',
        'Fallbacks without evaluation',
        'No client timeouts so fallbacks never trigger',
      ],
    },
    {
      id: 'langchain-langgraph-llamaindex-iq-4',
      difficulty: 'expert',
      question: 'Design how you would combine LlamaIndex and LangGraph for an enterprise assistant that answers from 2M documents, runs multi-step investigations, and needs per-user conversation memory.',
      context: 'Multiple tenants, documents update daily, some answers require approvals before actions.',
      whatInterviewerLooksFor: [
        'Clean layering: data plane vs orchestration',
        'Incremental ingestion and tenant isolation',
        'Checkpointed threads and long-term memory separation',
        'Retrieval exposed as tools/nodes with evaluation',
      ],
      modelAnswer: `**Layering**
- **Data layer (LlamaIndex):** an ingestion job per tenant: loaders → node parser (structure-aware) → embeddings → persistent vector store (e.g. Qdrant/pgvector) with metadata \`{ tenantId, docId, version, acl }\`. Incremental: content hashes skip unchanged docs; changed docs delete old nodes before insert.
- **Retrieval service:** wraps LlamaIndex retrievers with mandatory tenant and ACL filters, hybrid search + reranking. Exposed as a typed function \`retrieve({ query, tenantId, userId, k })\`.
- **Orchestration (LangGraph):** a StateGraph with nodes \`plan → retrieve (tool) → analyse → (approval) → answer\`. The retrieval service is a tool, so the agent can iterate (multi-hop) within a step budget.

**Memory**
- **Short-term:** LangGraph checkpointer (Postgres) keyed by \`thread_id = tenant:user:conversation\`, with a summarisation node to cap message history.
- **Long-term:** a separate store (e.g. LangGraph Store or a table) for user preferences and facts, namespaced by tenant and user.

**Actions and approvals:** action tools go through an approval gate node using \`interrupt()\`; resumes come from an authenticated API.

**Quality:** retrieval eval (recall@k on labelled queries per tenant), answer faithfulness checks, traces per node. Version prompts and index schemas.

**Scale:** 2M docs × ~5 chunks ≈ 10M vectors; shard by tenant, run ingestion asynchronously via a queue, and cache frequent retrievals.`,
      followUps: [
        { q: 'Where do you enforce document ACLs?', a: 'In the retrieval service as mandatory metadata filters applied inside the vector query, never by asking the LLM to ignore documents, and re-check permissions at answer time for cached results.' },
        { q: 'How would you evaluate the investigation agent end to end?', a: 'A scenario set with expected findings and allowed actions, scoring answer correctness, citation accuracy, steps used and forbidden actions attempted, run on every prompt or model change.' },
      ],
      pitfalls: [
        'Letting the LLM enforce tenant boundaries',
        'Mixing long-term memory into thread checkpoints',
        'Full re-indexing on every change',
      ],
    },
    {
      id: 'langchain-langgraph-llamaindex-iq-5',
      difficulty: 'medium',
      question: 'What does a checkpointer give a LangGraph application, and when is MemorySaver not enough?',
      whatInterviewerLooksFor: [
        'Persistence per thread, resumption, HITL, time-travel',
        'Limits of in-memory storage in multi-replica and long-wait scenarios',
        'Production setup details (PostgresSaver.setup, retention)',
      ],
      modelAnswer: `**What a checkpointer provides**
- **Thread memory:** state (e.g. messages) saved after each superstep under \`thread_id\`, so the next request continues the conversation.
- **Fault tolerance:** resume after a crash from the last superstep; pending writes from successful parallel nodes are kept.
- **Human-in-the-loop:** \`interrupt()\` needs a checkpoint to pause and later resume.
- **Debugging/time-travel:** \`getState\`, \`getStateHistory\`, \`updateState\`, and forking from an older checkpoint.

**When MemorySaver is not enough**
- **Multiple replicas:** each process has its own memory, so a request routed to another pod sees an empty thread.
- **Restarts/deploys:** all state is lost.
- **Long waits:** approvals that take hours outlive pods.
- **Volume:** memory grows with every thread and checkpoint.

**Production setup:** \`PostgresSaver.fromConnString(url)\` and \`await saver.setup()\` once; deterministic thread ids derived from business ids; retention (prune completed threads after N days); keep state lean (store large documents by reference). Note that a checkpointer is per-thread memory; cross-thread user memory belongs in a store.`,
      followUps: [
        { q: 'What is the difference between a checkpointer and a store in LangGraph?', a: 'The checkpointer persists the state of one thread over time; a store holds long-term data shared across threads (e.g. user preferences), namespaced and searchable.' },
        { q: 'How do you migrate when your state schema changes?', a: 'Add new keys with defaults, avoid renaming keys in place, version the graph in state, and drain or migrate paused threads before removing old nodes.' },
      ],
      pitfalls: [
        'Shipping MemorySaver to multi-replica production',
        'Using random thread ids per request',
        'Storing huge documents inside state',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'langchain-langgraph-llamaindex-est-1',
      question: 'Estimate the one-off embedding cost, vector storage and re-ingestion time for indexing 200,000 documents with LlamaIndex.',
      assumptions: [
        'Average document 3,000 tokens; chunks of 512 tokens with ~10% overlap → ~6.5 chunks/doc',
        'text-embedding-3-small, 1536-d float32, illustrative price $0.02 / 1M tokens',
        'Embedding API throughput ~1M tokens/min with batching under the account rate limit',
        'Vector index overhead ~1.5x raw vectors (HNSW graph + metadata)',
      ],
      steps: [
        { label: 'Chunks', calc: '200,000 × 6.5 = 1.3M chunks' },
        { label: 'Tokens embedded (with overlap)', calc: '1.3M × 512 ≈ 666M tokens' },
        { label: 'Embedding cost', calc: '666M × $0.02 / 1M ≈ $13.3' },
        { label: 'Raw vector size', calc: '1.3M × 1536 × 4 B ≈ 8.0 GB' },
        { label: 'With index overhead', calc: '8.0 × 1.5 ≈ 12 GB' },
        { label: 'Ingestion time', calc: '666M / 1M per min ≈ 666 min ≈ 11 h' },
      ],
      answer: '≈ $13 of embeddings, ≈ 12 GB of vector storage and ≈ 11 hours of embedding time at 1M tokens/min.',
      insight: 'Embedding cost is trivial; time and storage are the real constraints. Hash-based incremental ingestion (skip unchanged docs) and parallel workers under the rate limit matter far more than the price per token, and dimension reduction or quantisation cuts storage.',
      followUps: [
        { q: 'If 2% of documents change daily, what is the daily re-ingestion load?', a: '4,000 docs × 6.5 × 512 ≈ 13.3M tokens ≈ $0.27 and about 13 minutes per day, versus 11 hours for a full rebuild.' },
      ],
    },
    {
      id: 'langchain-langgraph-llamaindex-est-2',
      question: 'Estimate checkpoint write volume and storage for a LangGraph chat agent with 50,000 conversations/day.',
      assumptions: [
        '6 user turns per conversation; each turn averages 3 supersteps (agent → tools → agent)',
        'Average checkpoint ≈ 20 KB (message history grows, trimmed to the last 20 messages)',
        'Retention: 14 days of full history',
      ],
      steps: [
        { label: 'Supersteps per day', calc: '50,000 × 6 × 3 = 900,000 checkpoints/day' },
        { label: 'Write rate', calc: '900,000 / 86,400 s ≈ 10.4 writes/s average (peak ~5x ≈ 52/s)' },
        { label: 'Daily storage', calc: '900,000 × 20 KB = 18 GB/day' },
        { label: '14-day retention', calc: '18 × 14 = 252 GB' },
      ],
      answer: '≈ 900K checkpoint writes/day (~10/s average, ~50/s peak) and ≈ 250 GB for 14 days of full history.',
      insight: 'Write rate is easy for Postgres, but storage is dominated by repeated message history in every checkpoint. Trimming/summarising messages and keeping only the latest checkpoint for finished threads cuts storage by an order of magnitude.',
      followUps: [
        { q: 'What if you keep only the final checkpoint per conversation after 24 hours?', a: 'Day 1 keeps 18 GB of full history; older days keep 50,000 × 20 KB = 1 GB/day, so 14 days ≈ 18 + 13 × 1 = 31 GB instead of 252 GB.' },
      ],
    },
  ],
  test: [
    {
      id: 'langchain-langgraph-llamaindex-mcq-01',
      difficulty: 'medium',
      question: 'What does this chain return?',
      code: {
        language: 'typescript',
        code: `const chain = RunnableParallel.from({
  upper: RunnableLambda.from((s: string) => s.toUpperCase()),
  len: RunnableLambda.from((s: string) => s.length),
});
await chain.invoke('rag');`,
      },
      options: ["'RAG'", "{ upper: 'RAG', len: 3 }", "['RAG', 3]", "{ upper: 'rag', len: 3 }"],
      correct: [1],
      explanation: 'RunnableParallel passes the same input to every branch concurrently and returns an object keyed by branch name. It does not return an array or just the first branch, and each branch receives the original input.',
      followUps: [{ q: 'Where is this pattern typically used in RAG?', a: 'To produce { context, question } in one step: one branch retrieves and formats documents, another passes the question through, feeding a prompt template.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-02',
      difficulty: 'hard',
      question: 'Select ALL correct statements about withRetry and withFallbacks on LangChain Runnables.',
      options: [
        'withRetry re-invokes the same runnable on errors up to stopAfterAttempt times',
        'withFallbacks tries alternative runnables, in order, when the primary throws',
        'withFallbacks also triggers when the primary returns a low-quality but valid answer',
        'A typical production setup combines retry on the primary with a fallback to another provider',
      ],
      correct: [0, 1, 3],
      explanation: 'Retries repeat the same runnable; fallbacks switch to alternatives on exceptions; combining them covers transient errors and outages. Fallbacks do not judge answer quality: a valid but bad answer is not an exception.',
      followUps: [{ q: 'How can you make a bad-but-valid answer trigger a fallback?', a: 'Add a validation step that throws on failure (e.g. zod parse or a groundedness check) inside the primary chain, so the error propagates and the fallback runs.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-03',
      difficulty: 'hard',
      question: 'What is the bug in this router?',
      code: {
        language: 'typescript',
        code: `graph.addConditionalEdges('agent', (s) => {
  const last = s.messages.at(-1);
  return last && last.content ? 'tools' : END;
});
graph.addEdge('tools', 'agent');`,
      },
      options: [
        'Conditional edges cannot return END',
        'It routes on content rather than tool_calls, so any final answer with text loops back to tools until the recursion limit',
        'addEdge must come before addConditionalEdges',
        'The router must be async',
      ],
      correct: [1],
      explanation: 'A final answer has content but no tool calls; this router sends it to the tools node anyway, which loops until GraphRecursionError. Route on (last as AIMessage).tool_calls?.length. Returning END is valid, edge order does not matter and routers may be sync.',
      followUps: [{ q: 'Which prebuilt helper implements this routing correctly?', a: 'toolsCondition from @langchain/langgraph/prebuilt returns "tools" when the last AI message has tool calls and END otherwise.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-04',
      difficulty: 'medium',
      question: 'A LangGraph run throws GraphRecursionError after 25 steps. Which is the most appropriate first action?',
      options: [
        'Set recursionLimit to 10,000',
        'Inspect the trace/state history to find the loop and fix the routing or add a step budget that ends gracefully',
        'Switch the checkpointer to Postgres',
        'Remove all conditional edges',
      ],
      correct: [1],
      explanation: 'The error usually signals a routing loop (e.g. agent ↔ tools never ending). Find why via state history, then fix the router or add a budget. Raising the limit hides the bug and burns tokens; the checkpointer type is unrelated; removing branching breaks the agent.',
      followUps: [{ q: 'When is raising recursionLimit legitimate?', a: 'When a known long but bounded workflow (e.g. 40 sequential steps) needs more supersteps; size it from the design, not as a blanket workaround.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-05',
      difficulty: 'expert',
      question: 'Select ALL scenarios where a LangGraph checkpointer is required or clearly beneficial.',
      options: [
        'Pausing for human approval with interrupt() and resuming hours later',
        'A stateless one-shot classification call',
        'Continuing a multi-turn conversation by thread_id',
        'Debugging by forking a run from an earlier state',
      ],
      correct: [0, 2, 3],
      explanation: 'Interrupts, per-thread memory and time-travel all rely on persisted checkpoints. A stateless single call has no state to persist; a checkpointer only adds write overhead there.',
      followUps: [{ q: 'Which saver would you pick for the human-approval case in production?', a: 'A durable shared saver such as PostgresSaver, since approvals can outlive processes and requests can land on any replica.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-06',
      difficulty: 'hard',
      question: 'In LlamaIndex TS, what is the difference between asRetriever() and asQueryEngine()?',
      options: [
        'They are aliases',
        'A retriever returns scored nodes only; a query engine retrieves and then synthesises an answer with an LLM, returning the message plus sourceNodes',
        'A retriever calls the LLM; a query engine only embeds',
        'A query engine works only with in-memory indices',
      ],
      correct: [1],
      explanation: 'Retrievers stop at retrieval (useful for inspection, custom prompts or agents), while query engines add response synthesis and return sources. Neither is limited to in-memory storage, and the retriever does not call the LLM for generation.',
      followUps: [{ q: 'Why would you use the retriever directly inside an agent?', a: 'To let the agent decide how to use evidence (multi-hop queries, filtering, citations in its own format) and to avoid an extra LLM synthesis call per retrieval.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-07',
      difficulty: 'hard',
      question: 'What does this LlamaIndex workflow do when grounded() keeps returning false?',
      code: {
        language: 'typescript',
        code: `wf.handle([contextEvent], async (_ctx, ev) => {
  const a = await answer(ev.data.q, ev.data.ctx);
  if (!(await grounded(a, ev.data.ctx))) return contextEvent.with(ev.data);
  return stopEvent.with({ answer: a });
});`,
      },
      options: [
        'It retries once and then stops',
        'It loops forever, re-emitting contextEvent, because there is no attempt counter',
        'It throws because a handler cannot emit its own input event',
        'It returns the ungrounded answer',
      ],
      correct: [1],
      explanation: 'The handler re-emits the event it listens to with no bound, so an always-false check creates an infinite loop (and unbounded LLM spend). Add state such as attempts via createStatefulMiddleware (context.state) and stop after N tries. Emitting the same event type is allowed, which is exactly why a bound is needed.',
      followUps: [{ q: 'What should the final event contain after the cap is reached?', a: 'The best answer plus grounded: false (or a refusal), so the caller can show a warning, ask a clarifying question or escalate instead of presenting it as verified.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-08',
      difficulty: 'expert',
      question: 'Five Send() workers each return { findings: [x] } in the same superstep. Select ALL correct statements.',
      options: [
        'Without a reducer on findings, the update conflicts and the run fails',
        'With reducer (a, b) => a.concat(b) all five findings are kept',
        'Workers run sequentially in the order of the Send list',
        'The five workers count as one superstep toward the recursion limit',
      ],
      correct: [0, 1, 3],
      explanation: 'Parallel writes to a last-value channel raise an invalid update error; a concat reducer merges them. Send workers in one superstep run in parallel and count as one step. They are not executed sequentially, and completion order is not guaranteed.',
      followUps: [{ q: 'How do you keep results ordered?', a: 'Include an index in each Send payload and in each result, then sort by it in the fan-in node.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-09',
      difficulty: 'medium',
      question: 'Which tool is most naturally suited to "parse 10,000 mixed PDFs/HTML pages, chunk them with metadata, index them and answer questions with sources" with minimal custom code?',
      options: ['LangGraph StateGraph', 'LlamaIndex', 'A plain LCEL prompt | model chain', 'XState'],
      correct: [1],
      explanation: 'LlamaIndex is data-centric: loaders, node parsers, indices and query engines with sourceNodes. LangGraph is control-flow, a bare LCEL chain has no ingestion, and XState is a state-machine library.',
      followUps: [{ q: 'What would you still add on top of the defaults?', a: 'Tuned chunking for your document structure, metadata filters (version, tenant), a reranker and a retrieval evaluation set.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-10',
      difficulty: 'hard',
      question: 'Select ALL valid LangGraph stream modes and what they emit.',
      options: [
        "'values' emits the full state after each superstep",
        "'updates' emits only the per-node state deltas",
        "'messages' emits LLM tokens/message chunks as they are generated",
        "'checkpoints-only' emits the raw database rows",
      ],
      correct: [0, 1, 2],
      explanation: 'values, updates and messages are standard stream modes (custom is another). There is no checkpoints-only mode emitting database rows; checkpoint inspection uses getState/getStateHistory.',
      followUps: [{ q: 'Which mode would you use for a chat UI showing tokens and tool progress?', a: 'Combine modes: messages for token streaming and updates for node-level progress such as "searching orders…", passing streamMode as an array.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-11',
      difficulty: 'expert',
      question: 'A team uses withStructuredOutput(schema) and sees occasional exceptions on a nested optional field. Which change is the most robust?',
      code: {
        language: 'typescript',
        code: `const Invoice = z.object({
  total: z.number(),
  vatId: z.string(), // missing on ~4% of invoices
});
const chain = prompt.pipe(model.withStructuredOutput(Invoice));`,
      },
      options: [
        'Raise temperature so the model invents a vatId',
        'Make vatId nullable/optional with a description, and handle null downstream',
        'Wrap in withFallbacks to a second provider',
        'Increase max tokens',
      ],
      correct: [1],
      explanation: 'The data genuinely lacks the field for some invoices; a required string forces the model to fail or fabricate. Modelling reality (z.string().nullable().describe(...)) fixes the cause. Higher temperature encourages hallucination, a fallback model hits the same schema problem, and output length is irrelevant.',
      followUps: [{ q: 'How do you catch fabricated values for fields that are present?', a: 'Validate against the source: check the vatId string appears in the document text (or matches a checksum/regex) and flag mismatches for review.' }],
    },
    {
      id: 'langchain-langgraph-llamaindex-mcq-12',
      difficulty: 'medium',
      question: 'Select ALL true statements about the three frameworks.',
      options: [
        'LangChain v1 createAgent runs on top of LangGraph',
        'LlamaIndex query engines return source nodes alongside the answer',
        'LangGraph requires using LangChain chat models',
        'A LlamaIndex retriever can be used as a tool inside a LangGraph agent',
      ],
      correct: [0, 1, 3],
      explanation: 'createAgent builds a LangGraph graph; LlamaIndex returns sourceNodes; and frameworks compose (a LlamaIndex retriever wrapped as a tool). LangGraph nodes are plain functions, so any SDK (Anthropic, OpenAI, custom HTTP) can be called inside them.',
      followUps: [{ q: 'Why might you call a provider SDK directly inside a LangGraph node?', a: 'To use features the framework wrapper does not expose yet (new API parameters, prompt caching controls) while still getting LangGraph persistence and routing.' }],
    },
  ],
};

export default topic;
