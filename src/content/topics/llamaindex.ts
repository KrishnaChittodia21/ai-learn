import type { Topic } from '../../types';

const topic: Topic = {
  id: 'llamaindex',
  phase: 'frameworks',
  order: 3,
  title: 'LlamaIndex',
  subtitle:
    'The data framework for LLM apps: documents and nodes, Settings, VectorStoreIndex, query vs chat engines, ingestion pipelines with extractors and dedup, persistence, event-driven Workflows and agents',
  estimatedMinutes: 44,
  sources: [
    'LlamaIndex Python docs — Understanding LlamaIndex: loading, indexing, querying, storing (developers.llamaindex.ai/python/framework)',
    'LlamaIndex Python docs — IngestionPipeline: transformations, docstore strategies (UPSERTS, DUPLICATES_ONLY, UPSERTS_AND_DELETE), caching, vector_store',
    'LlamaIndex Python docs — Metadata extraction: TitleExtractor, QuestionsAnsweredExtractor, SummaryExtractor, KeywordExtractor',
    'LlamaIndex docs — Workflows (llama-index-workflows / llama_index.core.workflow): Event, @step, StartEvent/StopEvent, Context store, stream_events, InputRequiredEvent/HumanResponseEvent',
    'LlamaIndex Python docs — Agents: FunctionAgent, AgentWorkflow, Context for memory and serialisation (JsonSerializer), QueryEngineTool',
    'LlamaIndex.TS GitHub README — deprecation notice (March 2026; repository archived April 2026); npm @llamaindex/workflow marked deprecated',
  ],
  tags: ['frameworks', 'llamaindex', 'rag', 'ingestion', 'indexing', 'query-engine', 'workflows', 'agents', 'python'],
  cheatSheet: [
    'Mental model: Document → (node parser + transformations) → Nodes → Index → Retriever → Query engine (one-shot) or Chat engine (multi-turn).',
    'Settings.llm / Settings.embed_model / Settings.chunk_size set global defaults; override per index or engine for multi-tenant or test setups.',
    'index.as_retriever(similarity_top_k=k, filters=MetadataFilters(...)) returns scored nodes; as_query_engine(...) adds response synthesis and returns response + source_nodes.',
    'Chat engines keep memory: chat_mode="condense_plus_context" rewrites the follow-up into a standalone question, retrieves, then answers with history.',
    'IngestionPipeline(transformations=[splitter, extractors..., embed_model], docstore=..., vector_store=..., cache=...) with docstore_strategy=UPSERTS_AND_DELETE gives idempotent, incremental ingestion.',
    'Persist: index.storage_context.persist(persist_dir) then load_index_from_storage(StorageContext.from_defaults(persist_dir=...)); for production keep vectors in a vector DB and use VectorStoreIndex.from_vector_store.',
    'Workflows: typed Events + @step methods; a step\'s input/return annotations define the graph; Context.store holds per-run state; handler.stream_events() streams progress; timeout bounds a run.',
    'Agents: FunctionAgent(tools=[...], llm=..., system_prompt=...) and AgentWorkflow for multi-agent; pass ctx=Context(agent) to keep memory. LlamaIndex.TS is deprecated (2026): use Python, or LangChain JS in TypeScript stacks.',
  ],
  sections: [
    // ───────────────────────── 1 ─────────────────────────
    {
      heading: 'LlamaIndex Fundamentals — documents, nodes, Settings, VectorStoreIndex, query and chat engines',
      body: `**Intuition:** LlamaIndex is a librarian. You hand it documents; it cuts them into index cards (**nodes**), files them in a catalogue (an **index**), and gives you a reference desk: ask a question and it finds the right cards and writes a grounded answer, with the card numbers attached.

**Core objects (Python, \`llama_index.core\`)**

| Object | What it is |
|---|---|
| \`Document\` | raw text + \`metadata\` + stable \`doc_id\` (from a reader such as \`SimpleDirectoryReader\`) |
| \`TextNode\` | a chunk of a document with metadata and relationships (source doc, prev/next) |
| \`Settings\` | global defaults: \`llm\`, \`embed_model\`, \`chunk_size\`, \`chunk_overlap\` |
| \`VectorStoreIndex\` | embeds nodes and stores them (in memory or a vector DB) |
| Retriever | \`index.as_retriever(similarity_top_k=5)\` → scored nodes |
| Query engine | retriever + **response synthesiser** → \`response\` + \`source_nodes\` (stateless, one shot) |
| Chat engine | query engine + **memory**; \`condense_plus_context\` rewrites follow-ups into standalone questions |

**Query engine vs chat engine:** use a query engine for single questions, APIs and evaluation (stateless and reproducible). Use a chat engine for conversations where "and for contractors?" must be understood in context.

**Response modes** (\`response_mode\`): \`compact\` (default; packs chunks into few LLM calls), \`refine\` (one call per chunk, iterative), \`tree_summarize\` (hierarchical, good for summaries), \`no_text\` (retrieve only).

**Language note:** LlamaIndex is Python-first. The TypeScript port (\`llamaindex\` on npm) was deprecated in March 2026 and its repository archived, so all snippets here are Python. In a TypeScript stack, run LlamaIndex as a Python retrieval service or use LangChain JS (see the LangChain topic).

**When to use:** document-heavy RAG where ingestion, chunking, metadata and cited answers are the hard part.`,
      example: `**HR policy assistant.** 38 policy PDFs (≈ 420K tokens) → default sentence splitter (1,024-token chunks, 200 overlap) → ~520 nodes. Embedding with \`text-embedding-3-small\`: 420K × 1.2 (overlap) ≈ 504K tokens × $0.02/1M ≈ $0.01 (illustrative price).

**Query engine**, "How many weeks of parental leave do employees get?" → top-3 nodes scored 0.83, 0.79, 0.62 → \`compact\` mode makes 1 LLM call → "16 weeks paid" with \`source_nodes\` → *Leave-Policy-2026.pdf p.4*.

**Chat engine** (\`condense_plus_context\`), follow-up "And contractors?" → condensed to "How many weeks of parental leave do contractors get?" → retrieval hits *Contractor-Handbook.pdf p.12* (0.81) → "Contractors are not eligible for paid parental leave." The same follow-up sent to the query engine retrieves generic "contractor" chunks (best score 0.58) and answers off-topic.`,
      diagram: `  SimpleDirectoryReader ─► Document[] (text, metadata, doc_id)
                                  │ node parser (Settings.chunk_size)
                                  ▼
                           TextNode[] ─► embed (Settings.embed_model)
                                  ▼
                         VectorStoreIndex (memory | vector DB)
                                  │
         ┌────────────────────────┼─────────────────────────────┐
   as_retriever(k)        as_query_engine()              as_chat_engine()
   scored nodes           retrieve → synthesise          memory + condense
                          response + source_nodes        follow-up → standalone
                          (stateless)                    question → retrieve → answer`,
      code: [
        {
          language: 'python',
          title: 'Settings, index, retriever, query engine and chat engine (Python)',
          code: `import os
from llama_index.core import Document, Settings, VectorStoreIndex
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.openai import OpenAIEmbedding

# Global defaults; API keys come from the environment (OPENAI_API_KEY), never from code
Settings.llm = OpenAI(model=os.getenv("LLM_MODEL", "gpt-5-mini"), temperature=0)
Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
Settings.chunk_size = 1024
Settings.chunk_overlap = 200

docs = [
    Document(text="Employees get 16 weeks paid parental leave...", doc_id="leave-2026",
             metadata={"source": "Leave-Policy-2026.pdf", "year": 2026}),
    Document(text="Contractors are not eligible for paid leave...", doc_id="contractor-handbook",
             metadata={"source": "Contractor-Handbook.pdf", "year": 2026}),
]
index = VectorStoreIndex.from_documents(docs)  # split → embed → store (in memory here)

# 1) Retrieval only: inspect what the LLM would see
for hit in index.as_retriever(similarity_top_k=3).retrieve("parental leave for contractors"):
    print(round(hit.score, 2), hit.node.metadata["source"])

# 2) Query engine: stateless retrieve + synthesise, with sources
qe = index.as_query_engine(similarity_top_k=3, response_mode="compact")
res = qe.query("How many weeks of parental leave do employees get?")
print(res.response, [n.node.metadata["source"] for n in res.source_nodes])

# 3) Chat engine: memory + question condensing for follow-ups
chat = index.as_chat_engine(chat_mode="condense_plus_context", similarity_top_k=3)
print(chat.chat("How many weeks of parental leave do employees get?").response)
print(chat.chat("And contractors?").response)  # condensed into a standalone question first
chat.reset()  # clear memory between users/sessions`,
        },
      ],
      prosCons: {
        pros: [
          'Fastest path from raw documents to cited answers, with sensible defaults at every stage.',
          'Clear separation of retriever, synthesiser and engine makes each stage testable on its own.',
          'source_nodes with scores and metadata make citations and retrieval evaluation straightforward.',
          'Chat engines handle follow-up condensing and memory without custom prompt plumbing.',
        ],
        cons: [
          { con: 'Global Settings leak between tenants, tests and experiments.', fix: 'Set Settings once at startup for defaults, and pass llm / embed_model explicitly to indexes and engines that need different models.' },
          { con: 'The default in-memory index is lost on restart and re-embeds everything on boot.', fix: 'Ingest offline into a persistent vector store and open it with VectorStoreIndex.from_vector_store at query time.' },
          { con: 'Chat engine memory is per engine object, so a shared engine mixes users\' conversations.', fix: 'Create an engine (or memory) per session id, or call reset() between sessions, and persist history yourself.' },
          { con: 'The TypeScript port is deprecated, so TS teams cannot rely on it long term.', fix: 'Run LlamaIndex as a Python microservice behind a retrieve/answer API, or build the TS side with LangChain JS.' },
        ],
      },
      keyPoints: [
        'Document → nodes → index → retriever → query engine or chat engine.',
        'Settings holds global defaults (llm, embed_model, chunk_size); override per object when needed.',
        'Query engine = stateless retrieve + synthesise; chat engine adds memory and question condensing.',
        'response_mode controls how many LLM calls synthesis makes (compact, refine, tree_summarize).',
      ],
      exercise: {
        prompt: `Write \`answer(index, question, year)\` (Python) that:
1. builds a query engine with \`similarity_top_k=4\` and a **metadata filter** \`year == year\`,
2. returns \`{"answer": str, "sources": [{"source": ..., "score": ...}]}\`,
3. returns \`{"answer": "I don't know based on current policy.", "sources": []}\` when no source node scores ≥ 0.5.

Acceptance: a 2024 document is never cited when \`year=2026\`.`,
        starter: {
          language: 'python',
          code: `from llama_index.core import VectorStoreIndex
from llama_index.core.vector_stores import MetadataFilters, MetadataFilter

def answer(index: VectorStoreIndex, question: str, year: int) -> dict:
    # TODO: filters = MetadataFilters(filters=[...])
    # TODO: query engine with filters and top-k 4
    # TODO: refuse when no node scores >= 0.5
    ...`,
        },
        hints: [
          'MetadataFilters(filters=[MetadataFilter(key="year", value=year)]) is an exact-match filter.',
          'as_query_engine accepts similarity_top_k and filters, passed through to the retriever.',
          'res.source_nodes is a list of NodeWithScore: use n.score and n.node.metadata.',
        ],
        solution: {
          language: 'python',
          code: `from llama_index.core import VectorStoreIndex
from llama_index.core.vector_stores import MetadataFilters, MetadataFilter

MIN_SCORE = 0.5
REFUSAL = {"answer": "I don't know based on current policy.", "sources": []}

def answer(index: VectorStoreIndex, question: str, year: int) -> dict:
    filters = MetadataFilters(filters=[MetadataFilter(key="year", value=year)])
    qe = index.as_query_engine(similarity_top_k=4, filters=filters)  # filter applied in retrieval
    res = qe.query(question)

    good = [n for n in res.source_nodes if (n.score or 0) >= MIN_SCORE]
    if not good:
        return REFUSAL  # weak evidence: refuse instead of answering confidently
    return {
        "answer": res.response,
        "sources": [{"source": n.node.metadata.get("source"), "score": round(n.score, 2)} for n in good],
    }`,
        },
        explanation: 'The year filter runs inside retrieval, so old versions never reach the prompt. The score floor turns weak evidence into an explicit refusal; note that synthesis already happened at that point, so for cost-sensitive paths retrieve first with as_retriever, check scores, then synthesise.',
      },
      quickCheck: {
        question: 'A support widget sends each user message to index.as_query_engine().query(). Users complain that follow-ups like "what about Germany?" get irrelevant answers. What is the best fix?',
        options: [
          'Increase similarity_top_k to 20',
          'Use a chat engine with condense_plus_context so follow-ups are rewritten with history before retrieval',
          'Switch response_mode to tree_summarize',
          'Lower chunk_size to 256',
        ],
        correct: 1,
        explanation: 'A query engine is stateless, so "what about Germany?" is retrieved without the earlier topic. A condensing chat engine rewrites it into a standalone question first. More chunks, another synthesis mode or smaller chunks do not supply the missing context.',
      },
      source: 'LlamaIndex Python docs — Understanding LlamaIndex: indexing and querying; chat engines',
    },
    // ───────────────────────── 2 ─────────────────────────
    {
      heading: 'Ingestion Pipelines and Indexes — node parsers, transformations, extractors, storage and persistence',
      body: `**Intuition:** ingestion is a factory line. Raw documents enter, and each station (split, enrich with metadata, embed) transforms them; a ledger (the **docstore**) remembers what was already processed so tomorrow's run only handles what changed.

**IngestionPipeline** runs \`transformations\` in order over documents → nodes:
- **Node parsers:** \`SentenceSplitter(chunk_size, chunk_overlap)\` (default), \`MarkdownNodeParser\` (split by headings), \`SemanticSplitterNodeParser\` (split where embedding similarity drops), \`HierarchicalNodeParser\` (parent/child chunks), \`SentenceWindowNodeParser\` (sentence + surrounding window).
- **Metadata extractors** (LLM calls per node): \`TitleExtractor\`, \`QuestionsAnsweredExtractor(questions=3)\`, \`SummaryExtractor\`, \`KeywordExtractor\`. Extracted metadata is embedded with the text and improves retrieval of terse chunks.
- **Embedding model** as the last transformation.

**Dedup and incremental runs:** give the pipeline a persisted \`docstore\` and a \`docstore_strategy\`: \`UPSERTS\` (re-process documents whose hash changed), \`DUPLICATES_ONLY\`, or \`UPSERTS_AND_DELETE\` (also delete documents no longer present). An \`IngestionCache\` skips re-running identical (node, transformation) pairs.

**Storage:** a \`StorageContext\` bundles docstore, index store and vector store. Locally, \`index.storage_context.persist(persist_dir)\` and \`load_index_from_storage\`. In production, point the pipeline at a vector DB (Qdrant, pgvector, ...) and open it with \`VectorStoreIndex.from_vector_store\`.

**Other index types**

| Index | Use for |
|---|---|
| \`VectorStoreIndex\` | semantic search (default) |
| \`SummaryIndex\` | read everything, e.g. summarise a whole document |
| \`KeywordTableIndex\` | keyword lookup |
| \`PropertyGraphIndex\` | entity/relationship graphs (see knowledge-graphs topic) |

**When to use:** whenever the corpus changes over time or exceeds a demo; idempotent pipelines are what make RAG maintainable.`,
      example: `**Nightly docs sync.** 5,000 Markdown pages, ~6 nodes each = 30,000 nodes. Pipeline: \`MarkdownNodeParser\` → \`SentenceSplitter(512, 64)\` → \`TitleExtractor\` → \`QuestionsAnsweredExtractor(questions=3)\` → \`OpenAIEmbedding\`, docstore in Redis, vectors in Qdrant, \`UPSERTS_AND_DELETE\`.

- **First run:** 30,000 nodes embedded; extractor calls ≈ 30,000 × ~600 tokens on a small model ≈ 18M tokens (illustrative $0.15/1M ≈ $2.70).
- **Night 2:** 120 pages edited, 15 deleted. The docstore compares hashes: only 120 docs (≈ 720 nodes) are re-processed, and the 15 deleted docs' nodes are removed from Qdrant. Run time drops from ~50 min to ~1.5 min.
- **Quality:** adding "questions this chunk answers" metadata raised recall@5 on a 200-question set from 0.78 to 0.86, mainly for short API-reference chunks.`,
      diagram: `  reader (files, Notion, S3...) ─► Document[] (doc_id + hash)
                        │
          docstore check (UPSERTS_AND_DELETE): new? changed? deleted?
                        │ only new/changed docs continue
                        ▼
   MarkdownNodeParser ─► SentenceSplitter ─► TitleExtractor ─► QuestionsAnswered
                        │        (IngestionCache skips identical work)
                        ▼
                 embed_model ─► vector_store (Qdrant / pgvector)
                        │
      query time: VectorStoreIndex.from_vector_store(vector_store)
      local dev:  storage_context.persist("./storage") / load_index_from_storage`,
      code: [
        {
          language: 'python',
          title: 'Idempotent ingestion pipeline with extractors, docstore, cache and a vector DB',
          code: `import os
import qdrant_client
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex
from llama_index.core.ingestion import IngestionPipeline, IngestionCache, DocstoreStrategy
from llama_index.core.node_parser import MarkdownNodeParser, SentenceSplitter
from llama_index.core.extractors import TitleExtractor, QuestionsAnsweredExtractor
from llama_index.core.storage.docstore import SimpleDocumentStore
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.vector_stores.qdrant import QdrantVectorStore

small_llm = OpenAI(model=os.getenv("SMALL_MODEL", "gpt-5-mini"), temperature=0)
client = qdrant_client.QdrantClient(url=os.getenv("QDRANT_URL", "http://localhost:6333"))
vector_store = QdrantVectorStore(client=client, collection_name="docs")

# filename_as_id=True gives stable doc ids, so the docstore can detect changes
docs = SimpleDirectoryReader("./docs", recursive=True, filename_as_id=True).load_data()

pipeline = IngestionPipeline(
    transformations=[
        MarkdownNodeParser(),                                   # split on headings first
        SentenceSplitter(chunk_size=512, chunk_overlap=64),     # then cap chunk size
        TitleExtractor(llm=small_llm),                          # LLM-generated metadata
        QuestionsAnsweredExtractor(questions=3, llm=small_llm),
        OpenAIEmbedding(model="text-embedding-3-small"),        # embedding is the last step
    ],
    docstore=SimpleDocumentStore(),                  # use a Redis/Mongo docstore in production
    docstore_strategy=DocstoreStrategy.UPSERTS_AND_DELETE,
    vector_store=vector_store,
    cache=IngestionCache(),
)

if os.path.exists("./pipeline_storage"):
    pipeline.load("./pipeline_storage")             # restore docstore + cache from last run
nodes = pipeline.run(documents=docs, show_progress=True)
pipeline.persist("./pipeline_storage")
print("nodes written this run:", len(nodes))         # ~0 when nothing changed

# Query side (separate process): open the existing vectors, no re-embedding
index = VectorStoreIndex.from_vector_store(vector_store)
print(index.as_query_engine(similarity_top_k=5).query("How do I rotate API keys?"))`,
        },
      ],
      prosCons: {
        pros: [
          'Transformations are composable and reusable across sources and projects.',
          'Docstore strategies make re-runs incremental and handle deletions, not just additions.',
          'Metadata extractors improve retrieval of short or context-poor chunks with no query-time cost.',
          'Many readers and vector store integrations; switching stores does not change the pipeline.',
        ],
        cons: [
          { con: 'LLM-based extractors multiply ingestion cost and time (one or more calls per node).', fix: 'Run them on a small model, only on content types that benefit (measured by recall@k), and rely on IngestionCache so unchanged nodes are never re-extracted.' },
          { con: 'Without stable doc ids every run looks like new documents and duplicates vectors.', fix: 'Use filename_as_id or set doc_id from the source system id, and persist the docstore between runs.' },
          { con: 'An in-process SimpleDocumentStore is lost if the pipeline storage is not persisted.', fix: 'Persist and reload pipeline storage each run, or use a shared docstore backend (Redis, MongoDB, Postgres).' },
          { con: 'Changing the embedding model or chunking silently mixes incompatible vectors.', fix: 'Version the collection name by embedding model and chunking config, rebuild into a new collection, then switch reads atomically.' },
        ],
      },
      keyPoints: [
        'IngestionPipeline = ordered transformations: parsers → extractors → embedding.',
        'Stable doc ids + persisted docstore + docstore_strategy = incremental, idempotent ingestion.',
        'Persist locally with storage_context; in production keep vectors in a vector DB and use from_vector_store.',
        'Pick index types by query shape: vector (semantic), summary (whole doc), keyword, property graph.',
      ],
      exercise: {
        prompt: `Prove your pipeline is **idempotent**.

Write \`ingest(docs_dir)\` that builds a pipeline with \`SentenceSplitter(chunk_size=400, chunk_overlap=40)\` + an embedding model, a \`SimpleDocumentStore\` and \`DocstoreStrategy.UPSERTS\`, loads/persists pipeline state in \`./pipeline_storage\`, and returns the number of nodes processed.

Acceptance: calling \`ingest\` twice in a row on unchanged files returns N then 0; editing one file and calling again returns only that file's node count.`,
        hints: [
          'SimpleDirectoryReader(docs_dir, filename_as_id=True) gives stable ids.',
          'pipeline.load(dir) before run, pipeline.persist(dir) after run.',
          'For a quick offline test you can use MockEmbedding(embed_dim=8) from llama_index.core.',
        ],
        solution: {
          language: 'python',
          code: `import os
from llama_index.core import SimpleDirectoryReader, MockEmbedding
from llama_index.core.ingestion import IngestionPipeline, DocstoreStrategy
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.storage.docstore import SimpleDocumentStore

STATE_DIR = "./pipeline_storage"

def build_pipeline() -> IngestionPipeline:
    return IngestionPipeline(
        transformations=[
            SentenceSplitter(chunk_size=400, chunk_overlap=40),
            MockEmbedding(embed_dim=8),  # swap for OpenAIEmbedding in real runs
        ],
        docstore=SimpleDocumentStore(),
        docstore_strategy=DocstoreStrategy.UPSERTS,
    )

def ingest(docs_dir: str) -> int:
    docs = SimpleDirectoryReader(docs_dir, filename_as_id=True).load_data()
    pipeline = build_pipeline()
    if os.path.exists(STATE_DIR):
        pipeline.load(STATE_DIR)  # previous doc hashes
    nodes = pipeline.run(documents=docs)
    pipeline.persist(STATE_DIR)
    return len(nodes)

if __name__ == "__main__":
    print(ingest("./docs"))  # e.g. 42
    print(ingest("./docs"))  # 0: nothing changed`,
        },
        explanation: 'Stable ids let the docstore match documents across runs, and stored hashes tell the UPSERTS strategy whether content changed; unchanged documents are filtered out before any transformation runs. Without the persisted state every run would reprocess everything and, with a vector store attached, insert duplicates.',
      },
      quickCheck: {
        question: 'Nightly ingestion doubles the vector count every run even though few files change. Which root cause is most likely?',
        options: [
          'The embedding model is non-deterministic',
          'Documents get new random ids each run and/or the docstore is not persisted, so the dedup strategy sees everything as new',
          'chunk_overlap is too large',
          'The vector store does not support metadata',
        ],
        correct: 1,
        explanation: 'Dedup works by matching doc ids and hashes in a persisted docstore. Random ids (no filename_as_id or source id) or a fresh in-memory docstore make every document look new. Embedding noise, overlap and metadata support do not create duplicate documents.',
      },
      source: 'LlamaIndex Python docs — Ingestion pipeline, document management, metadata extraction, storing',
    },
    // ───────────────────────── 3 ─────────────────────────
    {
      heading: 'Workflows and Agents — event-driven Workflows, agents with tools, and choosing LlamaIndex vs LangChain/LangGraph',
      body: `**Intuition:** a Workflow is a relay race where runners only start when they receive the baton (an **event**) they are waiting for. Each step declares which event type it accepts and which it can emit; the framework routes events between steps, so the "graph" emerges from type annotations instead of explicit edges.

**Workflows (\`workflows\` / \`llama_index.core.workflow\`)**
- Define events as classes: \`class RetrievedEvent(Event): nodes: list\`.
- Methods decorated with \`@step\` take one event and return another (or a union for branching); \`StartEvent\` begins and \`StopEvent(result=...)\` ends a run.
- \`Context\` is per-run state: \`await ctx.store.get("attempts", default=0)\` / \`set\`, or typed state with \`async with ctx.store.edit_state() as s\`.
- \`handler = wf.run(...)\`, then \`async for ev in handler.stream_events()\` for progress; \`ctx.write_event_to_stream(ev)\` publishes custom events. \`timeout\` bounds the whole run.
- Human-in-the-loop: emit \`InputRequiredEvent\` and \`await ctx.wait_for_event(HumanResponseEvent)\`.

**Agents:** \`FunctionAgent(tools=[...], llm=..., system_prompt=...)\` runs a tool-calling loop; plain Python functions become tools via docstrings and type hints, and \`QueryEngineTool\` turns an index into a tool. \`AgentWorkflow\` hands off between multiple agents. Pass \`ctx=Context(agent)\` to keep conversation memory; serialise it with \`ctx.to_dict(serializer=JsonSerializer())\`.

**Choosing a framework**

| Need | Lean to |
|---|---|
| Hard part is data: parsing, chunking, metadata, retrieval quality | LlamaIndex |
| Integrations + composable chains / createAgent in TypeScript | LangChain |
| Checkpointed, resumable graphs with explicit edges and time travel | LangGraph (see LangGraph topic) |

Many teams combine them: LlamaIndex for the data layer exposed as a retrieval tool, orchestrated elsewhere.`,
      example: `**Corrective RAG workflow.** Steps: \`retrieve\` (StartEvent → RetrievedEvent) → \`answer\` (RetrievedEvent → AnswerEvent) → \`check\` (AnswerEvent → StopEvent | RetryEvent). \`RetryEvent\` routes back to \`retrieve\` with a rewritten query.

Run on "Can I expense a home-office chair?": attempt 1 retrieves *travel-policy.pdf* chunks (best 0.61); the groundedness check fails. \`ctx.store\` records \`attempts=1\`; the query is rewritten to "home office equipment reimbursement policy"; attempt 2 retrieves *equipment-policy.pdf p.3* (0.86) and passes. Total: 2 retrievals, 3 LLM calls, 4.1 s; the UI showed "Searching… / Refining search…" from \`stream_events()\`.

**Agent version:** a \`FunctionAgent\` with \`QueryEngineTool\`s for *hr_policies* and *it_policies* plus a \`create_ticket\` function answers "My laptop is broken and I'm on leave, who pays?" by calling both query tools, then offers a ticket.`,
      diagram: `   StartEvent(query)
        │  @step retrieve
        ▼
   RetrievedEvent(nodes) ──► @step answer ──► AnswerEvent(text, nodes)
        ▲                                          │ @step check
        │                                          ▼
   RetryEvent(rewritten query)  ◄── not grounded & attempts < 2
                                                   │ grounded or attempts = 2
                                                   ▼
                                       StopEvent(result={answer, grounded})
   ctx.store: { attempts }   handler.stream_events() ─► UI progress`,
      code: [
        {
          language: 'python',
          title: 'Event-driven corrective RAG workflow with bounded retries and streaming',
          code: `import os
from workflows import Workflow, step, Context
from workflows.events import Event, StartEvent, StopEvent
from llama_index.core import VectorStoreIndex
from llama_index.llms.openai import OpenAI

class RetrievedEvent(Event):
    query: str
    context: str

class AnswerEvent(Event):
    query: str
    context: str
    answer: str

class RetryEvent(Event):
    query: str

class ProgressEvent(Event):
    msg: str

class CorrectiveRAG(Workflow):
    def __init__(self, index: VectorStoreIndex, **kw):
        super().__init__(**kw)
        self.retriever = index.as_retriever(similarity_top_k=4)
        self.llm = OpenAI(model=os.getenv("LLM_MODEL", "gpt-5-mini"), temperature=0)

    @step
    async def retrieve(self, ctx: Context, ev: StartEvent | RetryEvent) -> RetrievedEvent:
        ctx.write_event_to_stream(ProgressEvent(msg="Searching: " + ev.query))
        nodes = await self.retriever.aretrieve(ev.query)
        return RetrievedEvent(query=ev.query, context="\\n\\n".join(n.get_content() for n in nodes))

    @step
    async def answer(self, ev: RetrievedEvent) -> AnswerEvent:
        prompt = "Answer only from the context.\\nContext:\\n" + ev.context + "\\nQuestion: " + ev.query
        resp = await self.llm.acomplete(prompt)
        return AnswerEvent(query=ev.query, context=ev.context, answer=str(resp))

    @step
    async def check(self, ctx: Context, ev: AnswerEvent) -> StopEvent | RetryEvent:
        verdict = await self.llm.acomplete("Reply YES if every claim is supported by the context, else NO.\\nContext:\\n" + ev.context + "\\nAnswer:\\n" + ev.answer)
        grounded = str(verdict).strip().upper().startswith("YES")
        attempts = await ctx.store.get("attempts", default=0) + 1
        await ctx.store.set("attempts", attempts)
        if grounded or attempts >= 2:  # bounded: never loops forever
            return StopEvent(result={"answer": ev.answer, "grounded": grounded, "attempts": attempts})
        better = await self.llm.acomplete("Rewrite as a precise search query: " + ev.query)
        return RetryEvent(query=str(better).strip())

async def main(index: VectorStoreIndex):
    wf = CorrectiveRAG(index, timeout=60)
    handler = wf.run(query="Can I expense a home-office chair?")
    async for ev in handler.stream_events():
        if isinstance(ev, ProgressEvent):
            print(ev.msg)  # forward to the UI via SSE
    print(await handler)`,
        },
        {
          language: 'python',
          title: 'FunctionAgent with query-engine tools, a function tool and persistent memory',
          code: `import os
from llama_index.core.agent.workflow import FunctionAgent, AgentStream, ToolCallResult
from llama_index.core.tools import QueryEngineTool
from llama_index.core.workflow import Context, JsonSerializer
from llama_index.llms.openai import OpenAI

def create_ticket(summary: str, priority: str = "normal") -> str:
    """Create an IT ticket. Use only after the user agrees. priority: low|normal|high."""
    return "Ticket IT-4821 created: " + summary + " (" + priority + ")"

def build_agent(hr_index, it_index) -> FunctionAgent:
    tools = [
        QueryEngineTool.from_defaults(hr_index.as_query_engine(similarity_top_k=4), name="hr_policies",
                                      description="Leave, benefits and expense policies."),
        QueryEngineTool.from_defaults(it_index.as_query_engine(similarity_top_k=4), name="it_policies",
                                      description="Laptop, equipment and access policies."),
        create_ticket,  # plain function: docstring + type hints become the tool schema
    ]
    return FunctionAgent(tools=tools, llm=OpenAI(model=os.getenv("LLM_MODEL", "gpt-5-mini")),
                         system_prompt="Answer from the policy tools and cite which tool you used.")

async def chat_turn(agent: FunctionAgent, saved: dict | None, text: str):
    ctx = Context.from_dict(agent, saved, serializer=JsonSerializer()) if saved else Context(agent)
    handler = agent.run(user_msg=text, ctx=ctx)  # ctx carries conversation memory
    async for ev in handler.stream_events():
        if isinstance(ev, AgentStream):
            print(ev.delta, end="")                        # tokens
        elif isinstance(ev, ToolCallResult):
            print("\\n[tool]", ev.tool_name, ev.tool_kwargs)  # tool progress
    result = await handler
    return str(result), ctx.to_dict(serializer=JsonSerializer())  # store in your DB by session id`,
        },
      ],
      prosCons: {
        pros: [
          'Workflows are plain async Python: steps, typed events and branching via return-type unions.',
          'Streaming of custom progress events is built in, which suits chat UIs.',
          'Indexes become agent tools in one line (QueryEngineTool), keeping the data layer reusable.',
          'Agent memory is an explicit, serialisable Context you can store per session.',
        ],
        cons: [
          { con: 'Event loops can cycle forever (a step re-emitting an event that leads back to itself).', fix: 'Keep an attempts counter in ctx.store, end with StopEvent after N tries, and always set a workflow timeout.' },
          { con: 'No built-in durable checkpointing per step comparable to LangGraph checkpointers.', fix: 'Serialise Context at safe points (ctx.to_dict) into your DB, keep steps idempotent, or use LangGraph when resumable long-running runs are central.' },
          { con: 'Agents with many overlapping tools pick the wrong one.', fix: 'Write distinct tool descriptions saying when to use each, keep tool count small, or route with a classifier step before the agent.' },
          { con: 'TypeScript Workflows and LlamaIndex.TS are deprecated.', fix: 'Use Python Workflows behind an API, or implement orchestration in TypeScript with LangGraph JS while calling a LlamaIndex retrieval service.' },
        ],
      },
      keyPoints: [
        'Steps accept and return typed events; unions on the return type create branches.',
        'Context.store holds per-run state; use it to bound retries.',
        'stream_events + write_event_to_stream give live progress.',
        'FunctionAgent + QueryEngineTool turns indexes into agent tools; Context(agent) keeps memory.',
        'Pick LlamaIndex for the data layer, LangGraph for checkpointed control flow, LangChain for TS integrations.',
      ],
      exercise: {
        prompt: `Build a **router workflow** (Python).

- \`classify\` step: StartEvent with \`question\` → \`SqlEvent\` if the question asks for numbers/aggregates ("how many", "total", "average"), else \`RagEvent\` (use a keyword rule; no LLM needed).
- \`sql\` step: \`SqlEvent\` → \`StopEvent(result={"route": "sql", ...})\` (stub the SQL call).
- \`rag\` step: \`RagEvent\` → \`StopEvent(result={"route": "rag", ...})\` using a provided \`query_engine\`.
- Set \`timeout=30\`.

Acceptance: "How many refunds last week?" → route "sql"; "What is the refund policy?" → route "rag".`,
        starter: {
          language: 'python',
          code: `from workflows import Workflow, step
from workflows.events import Event, StartEvent, StopEvent

class SqlEvent(Event):
    question: str

class RagEvent(Event):
    question: str

class Router(Workflow):
    def __init__(self, query_engine, **kw):
        super().__init__(**kw)
        self.qe = query_engine

    # TODO: classify, sql, rag steps`,
        },
        hints: [
          'Annotate classify as returning SqlEvent | RagEvent; the framework routes by type.',
          'Read the input with ev.question (StartEvent accepts arbitrary keyword fields from run()).',
          'Use await self.qe.aquery(question) in the rag step.',
        ],
        solution: {
          language: 'python',
          code: `import re
from workflows import Workflow, step
from workflows.events import Event, StartEvent, StopEvent

class SqlEvent(Event):
    question: str

class RagEvent(Event):
    question: str

AGG = re.compile(r"\\b(how many|total|average|sum|count)\\b", re.I)

class Router(Workflow):
    def __init__(self, query_engine, **kw):
        super().__init__(**kw)
        self.qe = query_engine

    @step
    async def classify(self, ev: StartEvent) -> SqlEvent | RagEvent:
        q = ev.question
        return SqlEvent(question=q) if AGG.search(q) else RagEvent(question=q)

    @step
    async def sql(self, ev: SqlEvent) -> StopEvent:
        rows = [{"refunds": 37}]  # stub: run generated, validated SQL here
        return StopEvent(result={"route": "sql", "rows": rows})

    @step
    async def rag(self, ev: RagEvent) -> StopEvent:
        res = await self.qe.aquery(ev.question)
        return StopEvent(result={"route": "rag", "answer": str(res),
                                 "sources": [n.node.metadata.get("source") for n in res.source_nodes]})

# result = await Router(query_engine, timeout=30).run(question="How many refunds last week?")`,
        },
        explanation: 'The union return type on classify is the branch: the workflow inspects the emitted event type and runs the only step that accepts it. A cheap deterministic classifier keeps latency low; swap it for an LLM classifier with structured output when keyword rules stop being accurate enough.',
      },
      quickCheck: {
        question: 'In a LlamaIndex Workflow, how does the framework decide which step runs after a step returns an event?',
        options: [
          'Steps run in the order they are defined in the class',
          'It routes the event to the step(s) whose input annotation accepts that event type',
          'You must call add_edge between steps',
          'The LLM chooses the next step',
        ],
        correct: 1,
        explanation: 'Workflows are event-driven: type annotations on step inputs declare which events each step consumes, and returned events are dispatched accordingly. There are no explicit edges (unlike LangGraph), definition order is irrelevant, and no LLM is involved in routing unless you write a step that uses one.',
      },
      source: 'LlamaIndex docs — Workflows (events, steps, state, streaming) and agents',
    },
  ],
  codeChallenges: [
    {
      id: 'llamaindex-cc-1',
      title: 'Turn a boot-time index script into a production ingestion + query service',
      context: 'A FastAPI app builds VectorStoreIndex.from_documents over 20,000 files at startup (18 minutes, ~$4 of embeddings per deploy), uses one global chat engine for all users, and crashes on a single unreadable PDF. Users occasionally see answers referencing another user\'s earlier question.',
      task: 'Split ingestion into an idempotent job writing to a vector DB, isolate per-file failures, open the existing index at startup, and create per-session chat engines with explicit memory.',
      starter: {
        language: 'python',
        code: `from fastapi import FastAPI
from llama_index.core import SimpleDirectoryReader, VectorStoreIndex

app = FastAPI()
docs = SimpleDirectoryReader("./corpus", recursive=True).load_data()  # crashes on one bad file
index = VectorStoreIndex.from_documents(docs)  # re-embeds 20K files on every boot
chat = index.as_chat_engine()  # shared by all users

@app.post("/chat")
def chat_endpoint(message: str):
    return {"answer": chat.chat(message).response}`,
      },
      hints: [
        'Move loading + embedding into an IngestionPipeline with a persisted docstore, UPSERTS_AND_DELETE and a vector_store.',
        'SimpleDirectoryReader(..., raise_on_error=False) or per-file loading with try/except isolates failures.',
        'Keep a dict session_id → chat engine (with a memory token limit), or build one per request from stored history.',
      ],
      solution: {
        language: 'python',
        code: `# ingest_job.py — run on a schedule, never at web startup
import logging, os
from llama_index.core import SimpleDirectoryReader
from llama_index.core.ingestion import IngestionPipeline, DocstoreStrategy
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.storage.docstore.redis import RedisDocumentStore
from shared import vector_store  # e.g. QdrantVectorStore(collection_name="corpus_v1")

def run_ingest():
    reader = SimpleDirectoryReader("./corpus", recursive=True, filename_as_id=True, raise_on_error=False)
    docs = reader.load_data()  # unreadable files are skipped and logged, not fatal
    pipeline = IngestionPipeline(
        transformations=[SentenceSplitter(chunk_size=512, chunk_overlap=64), OpenAIEmbedding(model="text-embedding-3-small")],
        docstore=RedisDocumentStore.from_host_and_port(os.getenv("REDIS_HOST", "localhost"), 6379, namespace="corpus"),
        docstore_strategy=DocstoreStrategy.UPSERTS_AND_DELETE,  # changed → re-embed, removed → delete
        vector_store=vector_store,
    )
    nodes = pipeline.run(documents=docs)
    logging.info("ingested %d nodes from %d docs", len(nodes), len(docs))

# api.py — starts in seconds, no embedding at boot
from fastapi import FastAPI
from llama_index.core import VectorStoreIndex
from llama_index.core.memory import ChatMemoryBuffer
from shared import vector_store

app = FastAPI()
index = VectorStoreIndex.from_vector_store(vector_store)
sessions: dict[str, object] = {}  # use Redis-backed history in multi-replica deployments

def engine_for(session_id: str):
    if session_id not in sessions:
        sessions[session_id] = index.as_chat_engine(
            chat_mode="condense_plus_context",
            similarity_top_k=4,
            memory=ChatMemoryBuffer.from_defaults(token_limit=3000),  # bounded history per user
        )
    return sessions[session_id]

@app.post("/chat")
async def chat_endpoint(session_id: str, message: str):
    res = await engine_for(session_id).achat(message)
    return {"answer": res.response, "sources": [n.node.metadata.get("file_name") for n in res.source_nodes]}`,
      },
      explanation: 'Ingestion becomes a scheduled, incremental job: stable ids plus a shared docstore mean only changed files are re-embedded, deletions propagate, and a bad PDF is skipped instead of crashing the build. The API opens existing vectors in seconds, and per-session engines with bounded memory stop users seeing each other\'s history while capping prompt growth. Returning sources enables citations.',
      followUps: [
        { q: 'The in-process sessions dict breaks with 4 replicas. What do you change?', a: 'Store chat history per session in Redis or Postgres and rebuild a chat engine per request with that history (or use a shared chat store), so any replica can serve any session.' },
        { q: 'How do you roll out a new embedding model without downtime?', a: 'Ingest into a new collection (corpus_v2) with the new model in parallel, evaluate retrieval on a labelled set, then switch the API\'s vector_store pointer and delete the old collection after a rollback window.' },
      ],
    },
    {
      id: 'llamaindex-cc-2',
      title: 'Fix an unbounded, unobservable LlamaIndex Workflow',
      context: 'A research workflow loops "search → draft → critique" until the critic says "APPROVED". It has no timeout, no attempt counter, swallows exceptions inside steps, and the UI shows a spinner for up to 6 minutes. One run cost $11 after the critic never approved.',
      task: 'Bound the loop with state, add a workflow timeout, stream progress events, propagate errors, and return a partial result with a flag when the budget is exhausted.',
      starter: {
        language: 'python',
        code: `from workflows import Workflow, step
from workflows.events import Event, StartEvent, StopEvent

class DraftEvent(Event):
    topic: str
    draft: str

class Research(Workflow):
    @step
    async def write(self, ev: StartEvent | DraftEvent) -> DraftEvent | StopEvent:
        try:
            draft = await self.llm_draft(ev.topic)
            verdict = await self.llm_critic(draft)
            if "APPROVED" in verdict:
                return StopEvent(result=draft)
            return DraftEvent(topic=ev.topic, draft=draft)  # loops forever if never approved
        except Exception:
            return DraftEvent(topic=ev.topic, draft="")  # hides failures and keeps looping`,
      },
      hints: [
        'Use ctx.store to count rounds and stop at a maximum with an "approved": False flag.',
        'Pass timeout=... to the workflow constructor; let exceptions propagate (or retry a fixed number of times).',
        'ctx.write_event_to_stream(ProgressEvent(...)) each round so the UI can show "Round 2/3: critiquing".',
      ],
      solution: {
        language: 'python',
        code: `from workflows import Workflow, step, Context
from workflows.events import Event, StartEvent, StopEvent

MAX_ROUNDS = 3

class DraftEvent(Event):
    topic: str
    draft: str
    feedback: str

class ProgressEvent(Event):
    msg: str

class Research(Workflow):
    @step
    async def write(self, ctx: Context, ev: StartEvent | DraftEvent) -> DraftEvent | StopEvent:
        rounds = await ctx.store.get("rounds", default=0) + 1
        await ctx.store.set("rounds", rounds)
        ctx.write_event_to_stream(ProgressEvent(msg="Round " + str(rounds) + "/" + str(MAX_ROUNDS) + ": drafting"))

        feedback = getattr(ev, "feedback", "")
        draft = await self.llm_draft(ev.topic, feedback)       # errors propagate to the caller
        ctx.write_event_to_stream(ProgressEvent(msg="Round " + str(rounds) + ": critiquing"))
        verdict = await self.llm_critic(draft)

        if verdict.strip().upper().startswith("APPROVED"):
            return StopEvent(result={"draft": draft, "approved": True, "rounds": rounds})
        if rounds >= MAX_ROUNDS:                               # budget exhausted: partial result
            return StopEvent(result={"draft": draft, "approved": False, "rounds": rounds, "feedback": verdict})
        return DraftEvent(topic=ev.topic, draft=draft, feedback=verdict)

# wf = Research(timeout=120)   # hard wall-clock bound for the whole run
# handler = wf.run(topic="KV cache"); stream ProgressEvent to the UI; result = await handler`,
      },
      explanation: 'A round counter in Context state guarantees termination after 3 rounds (cost bounded to ~6 LLM calls), and the timeout bounds wall-clock time even if a provider hangs. Feeding the critic\'s feedback into the next draft makes rounds productive instead of random retries. Errors now surface to the caller, and the approved flag lets the UI label unapproved drafts honestly while progress events replace the blind spinner.',
      followUps: [
        { q: 'How would you retry a flaky LLM call inside a step without hiding persistent errors?', a: 'Retry only transient errors (429, 5xx, timeouts) a fixed number of times with backoff, either via the LLM client max_retries or a step retry policy, and re-raise anything else so the run fails visibly.' },
        { q: 'What metric tells you MAX_ROUNDS is set well?', a: 'The distribution of rounds-to-approval on an eval set: if most approvals happen by round 2 and round 3 rarely flips to approved, 3 is enough; if many runs hit the cap, improve the drafting prompt rather than raising the cap.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'llamaindex-iq-1',
      difficulty: 'medium',
      question: 'Explain the difference between a LlamaIndex retriever, query engine and chat engine, and when you would expose each one in a product API.',
      whatInterviewerLooksFor: [
        'Accurate layering: retrieval vs synthesis vs memory',
        'Statelessness and reproducibility of query engines',
        'Cost and latency implications of each layer',
        'Practical API design choices',
      ],
      modelAnswer: `**Layers**
- **Retriever** (\`as_retriever\`): query → scored nodes. No generation. Cheap (one embedding + vector search), deterministic for a fixed index.
- **Query engine** (\`as_query_engine\`): retriever + response synthesiser (\`compact\`, \`refine\`, \`tree_summarize\`). Returns \`response\` + \`source_nodes\`. Stateless: same question, same pipeline.
- **Chat engine** (\`as_chat_engine\`): query engine + memory. \`condense_plus_context\` rewrites follow-ups using history, then retrieves and answers with the conversation in the prompt.

**What I would expose**

| API | Layer | Why |
|---|---|---|
| \`/search\` | retriever | search UI, agents, eval of recall@k; no LLM cost |
| \`/answer\` | query engine | one-shot Q&A, batch jobs, regression tests |
| \`/chat\` | chat engine per session | conversational UI with follow-ups |

**Design notes**
- Evaluate retrieval and synthesis separately: recall@k on the retriever, faithfulness on the query engine.
- Chat engines hold state: one per session, bounded memory (token limit), history stored outside the process for multi-replica deployments.
- For agents, expose the retriever or query engine as a tool (\`QueryEngineTool\`); let the agent own conversation state.
- Synthesis mode is a cost knob: \`compact\` ≈ 1 call, \`refine\` ≈ k calls.`,
      followUps: [
        { q: 'Why might you prefer exposing the retriever rather than the query engine to an agent?', a: 'The agent already writes the final answer, so a second synthesis call adds latency and cost, and raw passages let the agent combine evidence across multiple tool calls and cite precisely.' },
        { q: 'How do you test a chat engine deterministically?', a: 'Use scripted multi-turn conversations with fixed history, temperature 0, and assert on the condensed standalone question and retrieved sources rather than exact answer wording.' },
      ],
      pitfalls: [
        'Calling query and chat engines interchangeable',
        'One global chat engine shared across users',
        'Evaluating only final answers, never retrieval',
      ],
    },
    {
      id: 'llamaindex-iq-2',
      difficulty: 'hard',
      question: 'Design incremental ingestion with LlamaIndex for a 300,000-document Confluence space where pages are edited, moved and deleted daily.',
      context: 'Retrieval must reflect deletions within an hour; embedding budget is limited.',
      whatInterviewerLooksFor: [
        'Stable ids and hash-based change detection',
        'Deletion handling, not just upserts',
        'Shared persistent docstore and cache',
        'Scheduling, monitoring and model-change strategy',
      ],
      modelAnswer: `**Identity and change detection**
- \`doc_id\` = Confluence page id (stable across moves and title changes); metadata: space, path, version, last_modified, permissions.
- A shared persistent docstore (Redis/Mongo/Postgres) stores per-document hashes; \`IngestionPipeline(..., docstore_strategy=UPSERTS_AND_DELETE, vector_store=...)\`.

**Delta loading**
- Poll the Confluence API for pages modified since the last watermark every 15 minutes; feed only those to \`pipeline.run\`.
- Deletions: \`UPSERTS_AND_DELETE\` removes documents absent from the input set, which only works when you pass the *full* id set; for delta runs, explicitly process deletion events (webhook or periodic id-diff) with \`index.delete_ref_doc(doc_id, delete_from_docstore=True)\`.

**Transformations**
- \`MarkdownNodeParser\`/HTML-aware parsing → \`SentenceSplitter(512, 64)\` → optional \`TitleExtractor\` on a small model → embeddings. \`IngestionCache\` (shared) so unchanged nodes in an edited page are not re-processed.

**Cost and freshness**
- 300K pages × ~5 nodes = 1.5M nodes for the initial build; daily churn of ~1% means ~15K nodes/day, cheap compared with full rebuilds.
- SLO: deletion visible ≤ 1 h; alert if the watermark lags.

**Changes of model or chunking**
- Treat as a migration: new collection, backfill, evaluate recall@k, switch reads, keep the old one for rollback.

**Security:** carry page permissions into metadata and filter at query time.`,
      followUps: [
        { q: 'Why is UPSERTS_AND_DELETE dangerous with delta runs?', a: 'It deletes any document not present in the current input; if you pass only changed pages, every unchanged page looks deleted and gets removed from the store.' },
        { q: 'How do you verify the index matches the source of truth?', a: 'Run a nightly reconciliation comparing source ids and versions with docstore entries and vector counts per doc, alerting on drift and auto-repairing missing or stale documents.' },
      ],
      pitfalls: [
        'Using file paths or titles as ids so moves create duplicates',
        'Upserts without any deletion path',
        'Full rebuilds on every run',
      ],
    },
    {
      id: 'llamaindex-iq-3',
      difficulty: 'hard',
      question: 'Your team has a TypeScript product built on LlamaIndex.TS, which is now deprecated. Lay out a migration plan that keeps retrieval quality stable.',
      whatInterviewerLooksFor: [
        'Awareness of the deprecation and its risks (security fixes, provider APIs)',
        'An eval baseline before changing anything',
        'Realistic options: Python service vs LangChain JS vs plain SDK',
        'Incremental cut-over with rollback',
      ],
      modelAnswer: `**Why act:** a deprecated, archived framework stops receiving security fixes and provider API updates (new models, new embedding endpoints). Risk grows each month even if nothing breaks today.

**Step 1: baseline.** Freeze a labelled set (200–500 real questions with expected sources). Record recall@5, answer faithfulness, p95 latency and cost per query on the current system.

**Step 2: draw a boundary.** Wrap current usage behind internal interfaces: \`ingest(docs)\`, \`retrieve(query, filters)\`, \`answer(question, ctx)\`. Most product code should only see these.

**Step 3: choose the target per layer**

| Option | Fits when |
|---|---|
| Python LlamaIndex as a retrieval service | you value its ingestion features; team can run Python |
| LangChain JS (splitters, vector stores, retrievers) | you want to stay TypeScript-only |
| Plain SDK + vector DB client | pipeline is simple; minimal dependencies |

The vector DB usually stays: reuse the collection if the embedding model and chunking are unchanged, so there is no re-embedding.

**Step 4: shadow and cut over.** Run the new path in shadow on live traffic, compare retrieved ids (overlap@5) and eval metrics; route 5% → 50% → 100% behind a flag; keep the old path for rollback.

**Step 5: clean up.** Remove the old packages, pin new versions, keep the eval set in CI.`,
      followUps: [
        { q: 'Shadow results show 82% overlap@5 with the old retriever. Is that a problem?', a: 'Not necessarily: check the eval metrics. If recall@5 and faithfulness are equal or better, the differences are acceptable; inspect queries where the new path lost a gold source to find chunking or filter mismatches.' },
        { q: 'Why keep the same vector collection if possible?', a: 'Re-embedding costs money and time and changes retrieval behaviour; reusing vectors isolates the framework change from the embedding change so regressions are attributable.' },
      ],
      pitfalls: [
        'Big-bang rewrite with no baseline metrics',
        'Changing framework, chunking and embedding model at the same time',
        'Ignoring the deprecation because nothing is broken yet',
      ],
    },
    {
      id: 'llamaindex-iq-4',
      difficulty: 'expert',
      question: 'Compare LlamaIndex Workflows with LangGraph for a long-running, human-approved document review process. Which would you choose and how would you de-risk the choice?',
      context: 'Reviews take up to 3 days, involve 4 automated steps and 2 human approvals, and must survive deploys.',
      whatInterviewerLooksFor: [
        'Precise differences in execution model and persistence',
        'Requirements-driven decision, not preference',
        'Durability and idempotency of steps',
        'A hybrid option',
      ],
      modelAnswer: `**Execution models**
- **LlamaIndex Workflows:** event-driven; steps declare consumed/emitted event types; per-run \`Context\` state; HITL via \`InputRequiredEvent\` + \`wait_for_event(HumanResponseEvent)\`; context can be serialised (\`ctx.to_dict\`) and restored.
- **LangGraph:** explicit graph with nodes/edges and typed state; a checkpointer writes state after every superstep keyed by \`thread_id\`; \`interrupt()\` + resume; built-in history and time travel.

**Requirements check**

| Requirement | Workflows | LangGraph |
|---|---|---|
| Survive deploys for 3 days | you persist Context yourself at the waits | checkpointer does it per step |
| Two human approvals | supported | supported |
| Audit trail of each step | custom logging | checkpoint history |
| Heavy document processing | strong (indexes, parsers in the same process) | via tools/nodes |

**Choice:** LangGraph for orchestration, because durable per-step checkpoints and resumable interrupts are the core requirement; LlamaIndex as the document layer (parsing, indexes, query engines) called from nodes.

**De-risking**
- Spike both on the hardest path (approval → deploy → resume) before committing.
- Make every step idempotent (idempotency keys for external writes) since resumed steps may re-run.
- Keep step logic in plain functions so the orchestrator is swappable.
- Durable store (Postgres) and an alert on runs paused > SLA.`,
      followUps: [
        { q: 'If the team only knows LlamaIndex, how would you make Workflows durable enough?', a: 'Serialise Context to Postgres before every human wait and after each completed step, persist a run status row, and on startup resume runs from the stored context; keep steps idempotent so replays are safe.' },
        { q: 'What makes a step safe to re-run?', a: 'It reads inputs from state, writes outputs deterministically, and guards external side effects with idempotency keys or existence checks, so a second execution has no additional effect.' },
      ],
      pitfalls: [
        'Assuming in-memory Context survives multi-day waits',
        'Non-idempotent steps with external side effects',
        'Choosing by familiarity instead of the durability requirement',
      ],
    },
    {
      id: 'llamaindex-iq-5',
      difficulty: 'medium',
      question: 'When are LLM-based metadata extractors (titles, questions answered, summaries) worth their ingestion cost, and how would you prove it?',
      whatInterviewerLooksFor: [
        'Understands how extracted metadata affects embeddings and retrieval',
        'Cost model per node',
        'Experimental design with retrieval metrics',
        'Targeted application instead of all-or-nothing',
      ],
      modelAnswer: `**How they help:** extractors add text to each node's metadata (document title, "questions this chunk can answer", a summary, keywords). By default that metadata is included when the node is embedded, so a terse chunk like "Set \`rotate_after\` to 90" also carries "API key rotation policy" and becomes findable by natural-language questions.

**When they pay off**
- Short, context-poor chunks (API references, tables, FAQ fragments).
- Documents where the title/section carries meaning the chunk lacks.
- Mismatch between user vocabulary and document vocabulary (questions-answered bridges it).

**When they do not:** long, self-contained prose chunks; corpora that change hourly (extraction cost on every change); when a reranker already fixes precision.

**Cost model:** ~1 small-model call per node per extractor. 100K nodes × 2 extractors × ~700 tokens ≈ 140M tokens; at an illustrative $0.15/1M ≈ $21 per full build, plus time. Caching makes re-runs cheap.

**Proof**
1. Labelled set: 200–500 questions with gold source nodes.
2. Build two indexes from the same chunks: with and without extractors.
3. Compare recall@5, MRR and end-to-end faithfulness; slice by content type.
4. Keep extractors only for content types that improve beyond noise (e.g. +5 points recall@5), and exclude noisy metadata keys from embedding if they hurt.`,
      followUps: [
        { q: 'How can extracted metadata hurt retrieval?', a: 'Hallucinated or generic summaries make many nodes look alike in embedding space, reducing precision; exclude such keys from embedding (excluded_embed_metadata_keys) or drop the extractor for that content type.' },
        { q: 'How would you apply extractors only to some documents?', a: 'Run separate pipelines per content type (e.g. API docs vs handbook prose) feeding the same vector store, or route documents by metadata before the pipeline.' },
      ],
      pitfalls: [
        'Enabling all extractors everywhere by default',
        'No retrieval metrics to justify the spend',
        'Forgetting that metadata is embedded with the text',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'llamaindex-est-1',
      question: 'Estimate the initial and daily ingestion cost and time for a LlamaIndex pipeline over 80,000 support articles with two LLM metadata extractors.',
      assumptions: [
        'Average article 1,500 tokens; SentenceSplitter 512 / 64 → ~3.4 nodes per article',
        'Extractors: TitleExtractor + QuestionsAnsweredExtractor, ~700 tokens in/out per node per extractor on a small model at an illustrative $0.15 / 1M tokens',
        'Embeddings: text-embedding-3-small at $0.02 / 1M tokens, ~600 tokens per node including metadata',
        'Throughput: 40 concurrent extractor calls at ~1.5 s each; 3% of articles change per day',
      ],
      steps: [
        { label: 'Nodes', calc: '80,000 × 3.4 ≈ 272,000 nodes' },
        { label: 'Extractor tokens', calc: '272,000 × 2 × 700 ≈ 381M tokens → 381 × $0.15 ≈ $57' },
        { label: 'Embedding tokens', calc: '272,000 × 600 ≈ 163M tokens → 163 × $0.02 ≈ $3.3' },
        { label: 'Extractor time', calc: '544,000 calls × 1.5 s / 40 concurrent ≈ 20,400 s ≈ 5.7 h' },
        { label: 'Daily delta', calc: '3% → 2,400 articles ≈ 8,160 nodes ≈ 3% of the initial $60 ≈ $1.8 and ~10 min' },
      ],
      answer: 'Initial build ≈ $60 (≈ $57 extractors + ≈ $3 embeddings) and ≈ 6 hours; daily incremental runs ≈ $2 and ≈ 10 minutes.',
      insight: 'Extractors, not embeddings, dominate cost and time (~95%). Incremental ingestion with a persisted docstore and cache is what keeps daily runs cheap; prove the extractors improve recall before paying for them on every content type.',
      followUps: [
        { q: 'What if you drop QuestionsAnsweredExtractor for long-form articles (60% of nodes)?', a: 'Extractor calls fall from 2 to 1 for 60% of nodes: 272K × (0.4 × 2 + 0.6 × 1) × 700 ≈ 267M tokens ≈ $40, saving about 30%, and the build time drops to ~4 hours.' },
      ],
    },
    {
      id: 'llamaindex-est-2',
      question: 'Compare per-query LLM calls, tokens and latency for response_mode compact versus refine with similarity_top_k = 6.',
      assumptions: [
        'Chunks of 512 tokens; question + template ≈ 300 tokens; answer ≈ 250 tokens',
        'Context budget lets compact pack all 6 chunks (≈ 3,100 tokens) into one call',
        'refine makes one call per chunk, each including the running answer (~250 tokens)',
        'Latency ≈ 0.6 s TTFT + 250 output tokens at 80 tokens/s ≈ 3.7 s per call; illustrative $3 / 1M input, $15 / 1M output',
      ],
      steps: [
        { label: 'compact calls and input', calc: '1 call; 300 + 6 × 512 ≈ 3,370 input tokens' },
        { label: 'compact cost and latency', calc: '3,370 × $3e-6 + 250 × $15e-6 ≈ $0.0101 + $0.0038 ≈ $0.014; ≈ 3.7 s' },
        { label: 'refine calls and input', calc: '6 calls; each ≈ 300 + 512 + 250 ≈ 1,060 tokens → 6,360 input tokens' },
        { label: 'refine output', calc: '6 × 250 = 1,500 output tokens' },
        { label: 'refine cost and latency', calc: '6,360 × $3e-6 + 1,500 × $15e-6 ≈ $0.019 + $0.0225 ≈ $0.042; 6 × 3.7 ≈ 22 s sequential' },
      ],
      answer: 'compact ≈ 1 call, ≈ $0.014 and ≈ 4 s; refine ≈ 6 calls, ≈ $0.042 (3x) and ≈ 22 s (6x) per query.',
      insight: 'refine only makes sense when chunks cannot fit in one context or offline quality matters more than latency. For interactive Q&A use compact (or tree_summarize for summaries), and spend the saved budget on a reranker that sends fewer, better chunks.',
      followUps: [
        { q: 'If a reranker cuts top_k from 6 to 3 for compact, what changes?', a: 'Input falls to 300 + 3 × 512 ≈ 1,840 tokens: cost ≈ $0.0055 + $0.0038 ≈ $0.009 (about 35% less) and prefill is faster, at the cost of ~50–100 ms reranker latency.' },
      ],
    },
  ],
  test: [
    {
      id: 'llamaindex-mcq-01',
      difficulty: 'medium',
      question: 'A product needs a /search endpoint that returns ranked passages for a UI, with no generated text. Which LlamaIndex object fits best?',
      options: ['index.as_chat_engine()', 'index.as_retriever(similarity_top_k=10)', 'index.as_query_engine(response_mode="refine")', 'A FunctionAgent with a QueryEngineTool'],
      correct: [1],
      explanation: 'A retriever returns scored nodes with no LLM call, which is exactly a search API. Query and chat engines add synthesis (cost and latency), and an agent adds a full tool loop on top of that.',
      followUps: [{ q: 'How would you add a short snippet per result cheaply?', a: 'Highlight matching sentences from node text with simple lexical matching, or return the node text truncated around the best-matching sentence, instead of calling an LLM per result.' }],
    },
    {
      id: 'llamaindex-mcq-02',
      difficulty: 'hard',
      question: 'This ingestion script is executed nightly against a folder whose files have not changed. What does Qdrant contain after the second night?',
      code: {
        language: 'python',
        code: `docs = SimpleDirectoryReader("./docs").load_data()   # no filename_as_id
pipeline = IngestionPipeline(
    transformations=[SentenceSplitter(), OpenAIEmbedding()],
    docstore=SimpleDocumentStore(),
    vector_store=qdrant_store,
)
pipeline.run(documents=docs)   # docstore never persisted`,
      },
      options: [
        'The second run skips everything because hashes match',
        'The second run re-embeds everything and adds duplicate vectors to Qdrant',
        'The second run fails because the doc ids already exist',
        'Qdrant deduplicates automatically by text',
      ],
      correct: [1],
      explanation: 'Without stable ids the documents get new ids each load, and the fresh in-memory docstore has no record of the first run, so dedup cannot match anything: everything is re-embedded and inserted again. Qdrant stores whatever ids it is given and does not dedupe by text, and nothing raises an error.',
      followUps: [{ q: 'Which two changes fix it?', a: 'Use filename_as_id=True (or source-system ids) and persist the docstore between runs (pipeline.persist/load or a Redis/Mongo docstore), keeping a docstore_strategy such as UPSERTS.' }],
    },
    {
      id: 'llamaindex-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL correct statements about LlamaIndex docstore strategies in an IngestionPipeline.',
      options: [
        'UPSERTS re-processes a document when its content hash changes',
        'UPSERTS_AND_DELETE also removes documents missing from the current input set',
        'DUPLICATES_ONLY re-processes documents whose content changed under the same id',
        'Strategies require a docstore that persists between runs to be useful',
      ],
      correct: [0, 1, 3],
      explanation: 'UPSERTS compares ids and hashes and reprocesses changed docs; UPSERTS_AND_DELETE additionally deletes absent ids; both need persisted docstore state. DUPLICATES_ONLY only skips exact duplicate hashes and does not handle updates of the same id.',
      followUps: [{ q: 'When is UPSERTS_AND_DELETE risky?', a: 'When a run receives only a subset of documents (delta loads): every document not in that subset is treated as deleted and removed from the store.' }],
    },
    {
      id: 'llamaindex-mcq-04',
      difficulty: 'medium',
      question: 'A user asks "What is the travel allowance?" then "and for interns?". Which component handles the second message best?',
      options: [
        'A query engine with similarity_top_k=10',
        'A chat engine in condense_plus_context mode',
        'A SummaryIndex query engine',
        'A KeywordTableIndex retriever',
      ],
      correct: [1],
      explanation: 'condense_plus_context rewrites "and for interns?" into "What is the travel allowance for interns?" using history, then retrieves. A query engine of any top-k is stateless, and summary or keyword indexes do not supply conversation context.',
      followUps: [{ q: 'What must you do so two users do not share this context?', a: 'Use a separate chat engine or memory per session id (or reset between sessions), with history stored per user outside the process.' }],
    },
    {
      id: 'llamaindex-mcq-05',
      difficulty: 'expert',
      question: 'Which outcome does this workflow produce when the check always fails?',
      code: {
        language: 'python',
        code: `class Loop(Workflow):
    @step
    async def answer(self, ev: StartEvent | RetryEvent) -> CheckEvent:
        return CheckEvent(text=await draft(ev.q), q=ev.q)

    @step
    async def check(self, ev: CheckEvent) -> StopEvent | RetryEvent:
        if await grounded(ev.text):
            return StopEvent(result=ev.text)
        return RetryEvent(q=ev.q)

# await Loop(timeout=None).run(q="...")`,
      },
      options: [
        'It stops after the default 3 retries',
        'It loops indefinitely, calling the LLM each round, because nothing bounds retries and timeout is disabled',
        'It raises immediately because a step cannot emit an event consumed earlier',
        'It returns the first ungrounded answer',
      ],
      correct: [1],
      explanation: 'Cycles are legal in Workflows, and there is no implicit retry cap; with timeout=None nothing stops the loop, so cost grows without bound. Add an attempts counter in ctx.store and a finite timeout. No default of 3 exists and the first answer is never returned.',
      followUps: [{ q: 'What should the final result contain when the cap is hit?', a: 'The best draft plus grounded: False and the attempt count, so the caller can label it, ask for clarification or escalate instead of presenting it as verified.' }],
    },
    {
      id: 'llamaindex-mcq-06',
      difficulty: 'hard',
      question: 'Select ALL correct statements about LlamaIndex Workflows.',
      options: [
        'A step returning StopEvent | RetryEvent creates a branch determined by the returned event type',
        'Context.store keeps state shared across steps within a run',
        'Steps execute in the order they are defined in the class body',
        'handler.stream_events() lets callers observe progress events while the run continues',
      ],
      correct: [0, 1, 3],
      explanation: 'Return-type unions define branches, ctx.store is per-run shared state, and stream_events exposes events written with write_event_to_stream. Execution order follows event routing, not the order of methods in the class.',
      followUps: [{ q: 'How do you run two steps in parallel?', a: 'Have a step emit multiple events with ctx.send_event (one per work item) and a collector step that uses ctx.collect_events to wait until all results have arrived.' }],
    },
    {
      id: 'llamaindex-mcq-07',
      difficulty: 'hard',
      question: 'A query engine uses response_mode="refine" with similarity_top_k=8 and p95 latency is 30 s. What is the most effective first change for an interactive chat?',
      options: [
        'Increase chunk_size to 2048',
        'Switch to response_mode="compact" (and consider a reranker to reduce k)',
        'Switch to a SummaryIndex',
        'Raise the LLM temperature',
      ],
      correct: [1],
      explanation: 'refine makes one sequential LLM call per chunk (≈ 8 calls); compact packs chunks into as few calls as fit, often one. Bigger chunks do not reduce refine\'s call count much, a SummaryIndex reads even more text, and temperature does not affect latency.',
      followUps: [{ q: 'When would you deliberately keep refine?', a: 'Offline jobs where the retrieved text exceeds the context window or careful incremental answer building matters more than latency and cost.' }],
    },
    {
      id: 'llamaindex-mcq-08',
      difficulty: 'expert',
      question: 'Select ALL valid reasons to choose LangGraph over LlamaIndex Workflows for orchestration.',
      options: [
        'Per-step checkpointing keyed by thread id is needed so runs survive deploys and can be resumed or replayed',
        'The team needs explicit, inspectable edges and time-travel debugging over state history',
        'The main difficulty is parsing PDFs and tuning chunking',
        'The product is TypeScript and needs a maintained orchestration library',
      ],
      correct: [0, 1, 3],
      explanation: 'Durable checkpoints, explicit graphs with history, and a maintained TypeScript implementation are LangGraph strengths (LlamaIndex.TS and its workflow package are deprecated). Parsing and chunking are data-layer problems where LlamaIndex is the stronger choice, not a reason to switch orchestrators.',
      followUps: [{ q: 'How do you combine both?', a: 'Use LlamaIndex for ingestion and retrieval exposed as a service or tool, and call it from LangGraph nodes that own state, approvals and checkpoints.' }],
    },
    {
      id: 'llamaindex-mcq-09',
      difficulty: 'medium',
      question: 'Your FastAPI service calls VectorStoreIndex.from_documents(all_docs) at startup and each deploy takes 15 minutes. What is the right structure?',
      options: [
        'Cache the Python process with a longer health-check timeout',
        'Run ingestion as a separate job into a persistent vector store and open it at startup with VectorStoreIndex.from_vector_store',
        'Reduce similarity_top_k',
        'Use a chat engine instead of a query engine',
      ],
      correct: [1],
      explanation: 'Index building (parsing and embedding) belongs in an offline, incremental job; the API should only open existing vectors, which takes seconds. Health-check tweaks hide the problem, and top-k or engine type do not affect build time.',
      followUps: [{ q: 'What should the API do if the vector store is empty or unreachable at startup?', a: 'Fail readiness checks (not liveness) so traffic is not routed to it, log clearly, and retry the connection rather than silently rebuilding the index in-process.' }],
    },
    {
      id: 'llamaindex-mcq-10',
      difficulty: 'hard',
      question: 'This agent forgets the user\'s name between turns. Why?',
      code: {
        language: 'python',
        code: `agent = FunctionAgent(tools=[lookup], llm=llm)

async def turn(text: str):
    return await agent.run(user_msg=text)

await turn("Hi, I'm Priya")
await turn("What's my name?")`,
      },
      options: [
        'FunctionAgent cannot store names for privacy reasons',
        'Each run starts with a fresh Context; memory persists only if you pass the same ctx (or a restored one) to run()',
        'The tool list must include a memory tool',
        'The LLM temperature is too low',
      ],
      correct: [1],
      explanation: 'Agent runs are stateless unless a Context is reused: create ctx = Context(agent) once per session and pass ctx=ctx, or serialise it with ctx.to_dict and restore with Context.from_dict. No memory tool or temperature change is needed.',
      followUps: [{ q: 'How do you keep memory across server restarts?', a: 'Serialise the context with ctx.to_dict(serializer=JsonSerializer()), store it by session id in a database, and restore it with Context.from_dict before the next run.' }],
    },
    {
      id: 'llamaindex-mcq-11',
      difficulty: 'expert',
      question: 'Select ALL changes that make an IngestionPipeline cheaper to re-run without degrading retrieval.',
      options: [
        'Persist the IngestionCache and docstore between runs',
        'Use stable document ids from the source system',
        'Re-create the vector collection on every run to keep it clean',
        'Run LLM extractors only on content types where they measurably improve recall@k',
      ],
      correct: [0, 1, 3],
      explanation: 'Cache and docstore let unchanged work be skipped, stable ids make change detection possible, and targeted extractors cut the dominant cost. Recreating the collection each run forces full re-embedding, which is the opposite of cheaper.',
      followUps: [{ q: 'Which metric shows the incremental path is working?', a: 'Nodes processed per run versus documents changed in the source: a healthy pipeline processes roughly the changed documents\' nodes, not the full corpus.' }],
    },
    {
      id: 'llamaindex-mcq-12',
      difficulty: 'hard',
      question: 'Two tools are given to a FunctionAgent. It keeps calling it_policies for expense questions. What is the most likely fix?',
      code: {
        language: 'python',
        code: `tools = [
    QueryEngineTool.from_defaults(hr_qe, name="hr_policies", description="Policies."),
    QueryEngineTool.from_defaults(it_qe, name="it_policies", description="Policies and rules."),
]`,
      },
      options: [
        'Increase similarity_top_k on both query engines',
        'Write distinct descriptions that say what each tool covers and when to use it (e.g. leave, benefits, expenses vs laptops, access, software)',
        'Merge both indexes into one tool with no description',
        'Lower the LLM temperature to 0',
      ],
      correct: [1],
      explanation: 'The model chooses tools from names and descriptions; two near-identical descriptions give it nothing to discriminate on. Retrieval depth does not affect tool choice, merging loses routing (and may be fine only if a single index is acceptable), and temperature 0 makes the wrong choice deterministic rather than right.',
      followUps: [{ q: 'How would you test tool selection?', a: 'Build a labelled set of questions with the expected tool, run the agent with tracing, and measure tool-choice accuracy on every description or model change.' }],
    },
  ],
};

export default topic;
