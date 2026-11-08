// Glossary (C4): GenAI-engineering terms, adapted from ai-engineering-from-scratch/glossary/terms.md
// (MIT, © 2026 Rohit Ghumare). Classical-ML training terms no topic uses were dropped; links to the source's
// own lessons were removed; `learn` points at a topic in this app. Loaded lazily (Glossary page, lesson hovers).

export const GLOSSARY_CATEGORIES = [
  'Prompting & context',
  'Models & inference',
  'Data & representations',
  'Retrieval & generation',
  'Agents & tools',
  'Evaluation & safety',
  'Security & governance',
  'AI-native development',
  'Infrastructure & serving',
  'Reliability & operations',
  'Multimodal systems',
  'Math & training'
] as const;

export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface GlossaryTerm {
  id: string;
  term: string;
  aliases?: string[];
  category: GlossaryCategory;
  /** one sentence, at most 35 words: the hover definition */
  short: string;
  /** markdown: what it means, why it matters, in practice, common confusion */
  body: string;
  /** ids of other terms */
  related: string[];
  /** topic id in this app that teaches it */
  learn?: string;
  /** false: too common a word to underline in lessons (still on the Glossary page) */
  hover?: false;
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    "id": "admission-control",
    "term": "Admission Control",
    "category": "Reliability & operations",
    "short": "A pre-acceptance gate that decides whether a request may enter a bounded queue or service under the system's current capacity, priority, and policy.",
    "body": "A pre-acceptance gate that decides whether a request may enter a bounded queue or service under the system's current capacity, priority, and policy.\n\n**Why it matters:** Rejecting excess work at a controlled boundary protects admitted requests from queue growth, timeout cascades, and resource exhaustion.\n\n**In practice:** Estimate the request's cost, check tenant and system capacity, reserve the required budget atomically, and identify the overloaded scope when rejecting. Give retry guidance only when the condition is transient and the caller's retry budget permits another attempt.\n\n**Common confusion:** Admission control acts before acceptance. Load shedding can reject or remove work at ingress, in queues, at dependencies, or at other overload boundaries.",
    "related": [
      "load-shedding",
      "backpressure",
      "rate-limit",
      "saturation"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "agent",
    "term": "Agent",
    "category": "Agents & tools",
    "short": "A software system that lets a model select actions toward a goal, observe tool or environment results, and continue under an orchestration policy.",
    "body": "A software system that lets a model select actions toward a goal, observe tool or environment results, and continue under an orchestration policy. An agent may use a loop, a state machine, a workflow engine, or human approvals. The model is one component, not the entire system.\n\n**Why it matters:** Reliability comes from the harness, tool contracts, state, permissions, and verification around the model.\n\n**In practice:** A coding agent reads repository context, proposes a patch, runs tests in a sandbox, and stops for approval before deployment.\n\n**Common confusion:** Autonomy is a degree of delegated authority, not a required property of every agent.",
    "related": [
      "agent-harness",
      "agent-state",
      "tool-contract",
      "human-in-the-loop"
    ],
    "learn": "agent-fundamentals",
    "hover": false
  },
  {
    "id": "agent-harness",
    "term": "Agent Harness",
    "category": "Agents & tools",
    "short": "The runtime around a model that assembles context, exposes tools, manages state, enforces limits, records traces, and decides when the agent should continue, retry, ask, or stop.",
    "body": "The runtime around a model that assembles context, exposes tools, manages state, enforces limits, records traces, and decides when the agent should continue, retry, ask, or stop.\n\n**Why it matters:** Two systems using the same model can perform very differently because their harnesses provide different context, tools, feedback, and safety boundaries.\n\n**In practice:** Your harness can limit an agent to five tool calls, persist a checkpoint after each accepted patch, and require a passing test command before completion.\n\n**Common confusion:** A harness is broader than a prompt template and narrower than the complete product.",
    "related": [
      "agent",
      "tool-contract",
      "agent-state",
      "verification-gate",
      "sandbox"
    ],
    "learn": "modern-agent-stack"
  },
  {
    "id": "agent-memory",
    "term": "Agent Memory",
    "category": "Agents & tools",
    "short": "Information stored outside the model and selected for use in later agent steps, such as prior decisions, user preferences, task episodes, or verified facts.",
    "body": "Information stored outside the model and selected for use in later agent steps, such as prior decisions, user preferences, task episodes, or verified facts.\n\n**Why it matters:** It gives an agent continuity beyond one context window without forcing every past event into every prompt.\n\n**In practice:** Store a compact task outcome with provenance, retrieve it only when relevant, and let the user inspect or correct durable personal information.\n\n**Common confusion:** Agent memory is not the same as agent state. State tracks the current run; memory preserves selected information for possible future runs.",
    "related": [
      "agent-state",
      "context-engineering",
      "checkpoint",
      "semantic-cache"
    ],
    "learn": "agent-memory-tools"
  },
  {
    "id": "agent-skill",
    "term": "Agent Skill",
    "category": "Agents & tools",
    "short": "A discoverable directory of procedural instructions whose entry point is `SKILL.md`, with optional references, scripts, and assets that a compatible runtime can load in stages.",
    "body": "A discoverable directory of procedural instructions whose entry point is `SKILL.md`, with optional references, scripts, and assets that a compatible runtime can load in stages.\n\n**Why it matters:** It packages reusable task knowledge separately from one conversation while keeping deeper context and deterministic helpers available on demand.\n\n**In practice:** Publish a compact name and routing description, load the workflow only after activation, and read branch-specific references when the task reaches them.\n\n**Common confusion:** Activating a skill supplies context. It does not expose a tool, grant permission, create a sandbox, or prove that the resulting work is correct.",
    "related": [
      "skill-bundle",
      "skill-catalog",
      "skill-invocation",
      "progressive-disclosure",
      "mcp"
    ],
    "learn": "agent-skills"
  },
  {
    "id": "agent-state",
    "term": "Agent State",
    "category": "Agents & tools",
    "short": "The explicit data an agent carries across steps, such as the current objective, completed actions, tool results, open questions, budgets, approvals, and artifact references.",
    "body": "The explicit data an agent carries across steps, such as the current objective, completed actions, tool results, open questions, budgets, approvals, and artifact references.\n\n**Why it matters:** Explicit state makes long tasks resumable, inspectable, and less dependent on the model reconstructing progress from a transcript.\n\n**In practice:** Store the selected issue, changed files, latest test result, and remaining checks in a typed object that is updated after each action.\n\n**Common confusion:** State is not the same as conversation history. A transcript is evidence; state is the compact operational record used to decide what happens next.",
    "related": [
      "checkpoint",
      "durable-execution",
      "context-engineering",
      "handoff"
    ],
    "learn": "hitl-state-machines"
  },
  {
    "id": "ai-risk-assessment",
    "term": "AI Risk Assessment",
    "category": "Security & governance",
    "short": "A documented analysis of how an AI system can affect people, organizations, and environments, including context, hazards, likelihood, impact, controls, residual risk, and monitoring responsibilities.",
    "body": "A documented analysis of how an AI system can affect people, organizations, and environments, including context, hazards, likelihood, impact, controls, residual risk, and monitoring responsibilities.\n\n**Why it matters:** Model capability alone does not determine risk. Deployment context, affected groups, human authority, data, and system integrations change both the harms and the controls required.\n\n**In practice:** Define the intended use and affected parties, identify credible failure and misuse scenarios, assign owners to controls, record residual risk, and set review triggers for material changes.\n\n**Common confusion:** A risk assessment supports a decision under stated assumptions. It is not a one-time safety certificate or proof that every hazard has been found.",
    "related": [
      "threat-model",
      "guardrails",
      "human-in-the-loop",
      "data-classification"
    ],
    "learn": "red-teaming-responsible-ai"
  },
  {
    "id": "alignment",
    "term": "Alignment",
    "category": "Evaluation & safety",
    "short": "The effort to make a model or AI system behave in ways that match intended goals, constraints, and human preferences across both expected and adversarial situations.",
    "body": "The effort to make a model or AI system behave in ways that match intended goals, constraints, and human preferences across both expected and adversarial situations.\n\n**Why it matters:** A system can optimize the stated metric while violating the user's real intent, so alignment requires evaluation, oversight, and system controls as well as model training.",
    "related": [
      "guardrails",
      "evaluation",
      "human-in-the-loop"
    ],
    "learn": "alignment-frontier-risk",
    "hover": false
  },
  {
    "id": "approval-gate",
    "term": "Approval Gate",
    "category": "Agents & tools",
    "short": "A control point that blocks a consequential action until an authorized person or policy grants permission.",
    "body": "A control point that blocks a consequential action until an authorized person or policy grants permission.\n\n**Why it matters:** It limits the blast radius of uncertain model decisions while preserving automation for reversible work.\n\n**In practice:** Let an agent draft a database migration and run it against a disposable database, but require an owner to approve any production execution.\n\n**Common confusion:** An approval gate asks whether an action is authorized. A verification gate asks whether evidence shows the action is correct.",
    "related": [
      "human-in-the-loop",
      "verification-gate",
      "least-privilege"
    ],
    "learn": "hitl-state-machines",
    "hover": false
  },
  {
    "id": "approximate-nearest-neighbor",
    "term": "Approximate Nearest Neighbor",
    "aliases": [
      "ANN"
    ],
    "category": "Retrieval & generation",
    "short": "A search method that returns vectors likely to be among the nearest to a query without exhaustively comparing the query with every stored vector.",
    "body": "A search method that returns vectors likely to be among the nearest to a query without exhaustively comparing the query with every stored vector.\n\n**Why it matters:** Approximation makes large vector indexes practical, but it introduces a measurable tradeoff between search speed, memory, and retrieval recall.\n\n**In practice:** Tune index and search parameters against a held-out query set, then report latency together with Recall@K instead of assuming every true neighbor is found.\n\n**Common confusion:** ANN describes a search objective and tradeoff, while HNSW is one particular index algorithm that can implement it.",
    "related": [
      "vector-database",
      "hnsw",
      "cosine-similarity",
      "recall-at-k"
    ],
    "learn": "ann-search"
  },
  {
    "id": "attention",
    "term": "Attention",
    "category": "Models & inference",
    "short": "A mechanism that forms contextual representations by comparing query vectors with key vectors, normalizing the resulting scores, and using them to combine value vectors.",
    "body": "A mechanism that forms contextual representations by comparing query vectors with key vectors, normalizing the resulting scores, and using them to combine value vectors. Masks, position rules, or sparse patterns can restrict which positions participate.\n\n**Why it matters:** Attention lets a model route information between sequence positions, but it does not by itself explain or prove what the model understood.\n\n**Common confusion:** Attention weights are computation coefficients, not a faithful explanation of model reasoning.",
    "related": [
      "self-attention",
      "transformer",
      "kv-cache"
    ],
    "learn": "transformer-internals",
    "hover": false
  },
  {
    "id": "audio-token",
    "term": "Audio Token",
    "category": "Multimodal systems",
    "short": "A discrete identifier produced by an audio codec or tokenizer for a short segment or feature of an audio signal, sometimes across several codebooks.",
    "body": "A discrete identifier produced by an audio codec or tokenizer for a short segment or feature of an audio signal, sometimes across several codebooks.\n\n**Why it matters:** Discrete audio representations let sequence models process, predict, store, or generate sound using token-oriented architectures.\n\n**In practice:** Version the codec with the model, preserve sample-rate and codebook metadata, measure reconstruction quality, and distinguish semantic audio tokens from waveform-compression tokens.\n\n**Common confusion:** An audio token is not a fixed duration, phoneme, or word. Its meaning and time span depend on the tokenizer and codebook design.",
    "related": [
      "token",
      "embedding",
      "automatic-speech-recognition",
      "multimodal-model"
    ],
    "learn": "audio-video"
  },
  {
    "id": "audit-log",
    "term": "Audit Log",
    "category": "Security & governance",
    "short": "A durable, access-controlled record of security- or accountability-relevant events, including who or what acted, what changed, when it happened, and the resulting status.",
    "body": "A durable, access-controlled record of security- or accountability-relevant events, including who or what acted, what changed, when it happened, and the resulting status.\n\n**Why it matters:** Consequential agent actions need evidence that supports investigation, policy review, and responsibility beyond performance debugging.\n\n**In practice:** Record tool authorization, approval decisions, external writes, policy versions, and artifact identifiers while redacting secrets and restricting log access.\n\n**Common confusion:** A trace helps diagnose one execution path. An audit log preserves events required for accountability across executions and over time.",
    "related": [
      "trace",
      "observability",
      "approval-gate",
      "provenance-attestation"
    ],
    "learn": "red-teaming-responsible-ai"
  },
  {
    "id": "automatic-speech-recognition",
    "term": "Automatic Speech Recognition",
    "aliases": [
      "ASR"
    ],
    "category": "Multimodal systems",
    "short": "The task and system pipeline that maps a speech signal to a transcription, often with optional token or segment timing and confidence information.",
    "body": "The task and system pipeline that maps a speech signal to a transcription, often with optional token or segment timing and confidence information.\n\n**Why it matters:** Speech interfaces depend on more than language modeling. Acoustic variation, segmentation, decoding, vocabulary, and domain conditions all affect the final transcript.\n\n**In practice:** Evaluate word or character errors by language, speaker, noise, and domain, retain timestamps when downstream grounding needs them, and test the exact audio preprocessing used in production.\n\n**Common confusion:** ASR transcribes what was said. Determining who spoke requires diarization or speaker recognition, while translation and intent understanding are separate tasks.",
    "related": [
      "audio-token",
      "encoder",
      "tokenization",
      "multimodal-model"
    ],
    "learn": "audio-video"
  },
  {
    "id": "autoregressive",
    "term": "Autoregressive",
    "category": "Models & inference",
    "short": "A factorization in which each output token is predicted from the tokens that precede it.",
    "body": "A factorization in which each output token is predicted from the tokens that precede it. During generation, the selected token is appended to the sequence and becomes part of the next prediction's context.\n\n**Common confusion:** The unit is a token, not necessarily a word, and generation can use decoding methods other than always selecting the highest-probability token.",
    "related": [
      "token",
      "temperature",
      "kv-cache"
    ],
    "learn": "genai-fundamentals",
    "hover": false
  },
  {
    "id": "autoscaling",
    "term": "Autoscaling",
    "category": "Infrastructure & serving",
    "short": "A control loop that changes the number or capacity of serving workers from observed demand, resource use, or application metrics within configured bounds.",
    "body": "A control loop that changes the number or capacity of serving workers from observed demand, resource use, or application metrics within configured bounds.\n\n**Why it matters:** AI workloads can change faster than manual provisioning, but scaling decisions must account for model-load time, accelerator availability, queueing, and request cost.\n\n**In practice:** Scale from a demand signal tied to useful work, set minimum warm capacity, bound scale-down churn, and verify that new replicas pass readiness checks before receiving traffic.\n\n**Common confusion:** Autoscaling adds or removes capacity. It does not make an overloaded dependency faster or guarantee that enough hardware can be acquired in time.",
    "related": [
      "model-serving",
      "saturation",
      "readiness-probe",
      "backpressure"
    ],
    "learn": "production-deployment"
  },
  {
    "id": "availability",
    "term": "Availability",
    "category": "Reliability & operations",
    "short": "The proportion of eligible service interactions or time windows in which users can obtain the defined acceptable service under a stated measurement boundary.",
    "body": "The proportion of eligible service interactions or time windows in which users can obtain the defined acceptable service under a stated measurement boundary.\n\n**Why it matters:** A service can be running while users still cannot complete useful requests, so availability must be tied to user-visible success rather than process uptime alone.\n\n**In practice:** Define eligible events and acceptable outcomes, exclude only documented cases, calculate the indicator over a fixed window, and investigate both total failures and prolonged partial degradation.\n\n**Common confusion:** Availability is one reliability outcome. It does not describe latency, correctness, safety, or the experience of every user segment.",
    "related": [
      "service-level-indicator",
      "service-level-objective",
      "error-budget",
      "incident-response"
    ],
    "learn": "production-deployment",
    "hover": false
  },
  {
    "id": "backpressure",
    "term": "Backpressure",
    "category": "AI-native development",
    "short": "A flow-control mechanism that slows or rejects upstream work when a downstream component cannot process it safely at the current rate.",
    "body": "A flow-control mechanism that slows or rejects upstream work when a downstream component cannot process it safely at the current rate.\n\n**Why it matters:** Without backpressure, queued agent runs, tool calls, or streamed events can exhaust memory, exceed rate limits, and amplify retries.\n\n**In practice:** When the evaluator queue reaches its limit, pause new agent jobs or return a retryable response instead of accepting unbounded work.\n\n**Common confusion:** Backpressure protects capacity before failure. A circuit breaker stops calls after failures show a dependency is unhealthy.",
    "related": [
      "rate-limit",
      "retry-with-backoff",
      "circuit-breaker"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "backpropagation",
    "term": "Backpropagation",
    "category": "Math & training",
    "short": "An efficient application of the chain rule that propagates derivatives from a scalar loss backward through a computation graph.",
    "body": "An efficient application of the chain rule that propagates derivatives from a scalar loss backward through a computation graph. It computes gradients; an optimizer uses those gradients to update parameters.\n\n**Common confusion:** Backpropagation calculates gradients. It does not choose the update rule or learning rate.",
    "related": [
      "gradient",
      "optimizer"
    ]
  },
  {
    "id": "benchmark-contamination",
    "term": "Benchmark Contamination",
    "category": "Evaluation & safety",
    "short": "Overlap or information leakage between evaluation examples and data used to pretrain, tune, prompt, select, or otherwise improve the evaluated system.",
    "body": "Overlap or information leakage between evaluation examples and data used to pretrain, tune, prompt, select, or otherwise improve the evaluated system.\n\n**Why it matters:** Contamination can make a benchmark score reflect prior exposure rather than the ability to generalize to unseen tasks.\n\n**In practice:** Track dataset provenance, search training sources for exact and near duplicates, hold back private test cases, and refresh public evals with newly authored examples.\n\n**Common confusion:** Contamination is broader than exact copying. Paraphrases, answer keys, benchmark metadata, and repeated prompt tuning can also leak evaluation information.",
    "related": [
      "data-leakage",
      "eval-set",
      "exact-match"
    ],
    "learn": "ai-testing-benchmarking"
  },
  {
    "id": "bm25",
    "term": "BM25",
    "category": "Retrieval & generation",
    "short": "A lexical ranking function that scores a document from query-term matches while accounting for term rarity, repeated occurrences, and document length.",
    "body": "A lexical ranking function that scores a document from query-term matches while accounting for term rarity, repeated occurrences, and document length.\n\n**Why it matters:** It is a strong exact-term retrieval baseline and complements dense retrieval for identifiers, rare words, and domain-specific phrases.\n\n**In practice:** Retrieve candidates with BM25 and dense search, combine their ranks, then evaluate the merged results before adding a more expensive reranker.\n\n**Common confusion:** BM25 does not understand semantic similarity directly, and its score has no universal meaning across different queries or index configurations.",
    "related": [
      "hybrid-retrieval",
      "dense-retrieval",
      "reranker",
      "rag"
    ],
    "learn": "retrieval-fundamentals"
  },
  {
    "id": "byte-pair-encoding",
    "term": "Byte Pair Encoding",
    "aliases": [
      "BPE"
    ],
    "category": "Data & representations",
    "short": "A subword-tokenization method that repeatedly merges frequent adjacent units to construct a fixed vocabulary from training text.",
    "body": "A subword-tokenization method that repeatedly merges frequent adjacent units to construct a fixed vocabulary from training text.\n\n**Why it matters:** It balances vocabulary size with the ability to represent rare or unseen words as smaller units.\n\n**In practice:** Train the tokenizer only on approved corpus splits, version its merge rules with the model, and inspect how it segments code, multilingual text, and whitespace.\n\n**Common confusion:** BPE is one tokenizer family, not a universal description of how every model creates tokens.",
    "related": [
      "tokenization",
      "vocabulary",
      "token",
      "embedding"
    ],
    "learn": "transformers-tokenization"
  },
  {
    "id": "calibration",
    "term": "Calibration",
    "category": "Evaluation & safety",
    "short": "The agreement between a system's stated confidence and the observed frequency with which predictions at that confidence are correct.",
    "body": "The agreement between a system's stated confidence and the observed frequency with which predictions at that confidence are correct.\n\n**Why it matters:** A system can be accurate on average yet dangerously overconfident on the cases where people rely on its score.\n\n**In practice:** Bucket predictions by confidence, compare confidence with empirical accuracy, and recalibrate or abstain when the gap is unacceptable.\n\n**Common confusion:** Calibration measures confidence reliability, not overall accuracy, factuality, or reasoning quality.",
    "related": [
      "softmax",
      "evaluation",
      "precision-and-recall",
      "logits"
    ],
    "learn": "llm-evaluation",
    "hover": false
  },
  {
    "id": "canary-release",
    "term": "Canary Release",
    "category": "Reliability & operations",
    "short": "A deployment strategy that exposes a new version to a limited slice of traffic or infrastructure before expanding the rollout.",
    "body": "A deployment strategy that exposes a new version to a limited slice of traffic or infrastructure before expanding the rollout.\n\n**Why it matters:** It limits the impact of defects and gives you production evidence before the new model, prompt, agent, or service reaches everyone.\n\n**In practice:** Route a small eligible cohort to the release, compare quality and operational metrics with the control, and stop or roll back on predefined failures.\n\n**Common confusion:** A canary release limits exposure; it does not replace pre-deployment tests, approval, or rollback preparation.",
    "related": [
      "evaluation",
      "observability",
      "rollback",
      "verification-gate"
    ],
    "learn": "production-deployment"
  },
  {
    "id": "chain-of-thought",
    "term": "Chain of Thought",
    "aliases": [
      "CoT"
    ],
    "category": "Prompting & context",
    "short": "Intermediate reasoning used to decompose a task before producing an answer.",
    "body": "Intermediate reasoning used to decompose a task before producing an answer. A prompt can request a visible rationale, while some systems use internal reasoning that is not returned to the user.\n\n**Why it matters:** Decomposition can help on multi-step tasks, but a fluent rationale is not proof that the answer is correct or that the text faithfully represents the model's internal computation.\n\n**In practice:** Ask for a concise plan, independently check the result, and request verifiable calculations or citations instead of relying on a long reasoning transcript.\n\n**Common confusion:** Chain of thought is not a substitute for tools, tests, or external verification.",
    "related": [
      "prompt-engineering",
      "verification-gate",
      "evaluation"
    ],
    "learn": "prompt-reasoning"
  },
  {
    "id": "checkpoint",
    "term": "Checkpoint",
    "category": "Agents & tools",
    "short": "A durable snapshot used to resume from a known boundary.",
    "body": "A durable snapshot used to resume from a known boundary. In a workflow, it stores operational state and artifact references. In model training, it can store parameters, optimizer state, scheduler state, and the training position.\n\n**Why it matters:** Long-running workflows and training runs can recover from interruption without replaying completed work or losing expensive progress.\n\n**In practice:** Save an agent's accepted patch and test evidence after a verified step, or save a training run's weights, optimizer state, random state, and data position before shutdown.\n\n**Common confusion:** A workflow checkpoint and a model-training checkpoint serve the same recovery goal but preserve different state. Neither is merely a transcript or a weights file with no resume metadata.",
    "related": [
      "agent-state",
      "durable-execution",
      "parameter",
      "optimizer"
    ],
    "learn": "langgraph",
    "hover": false
  },
  {
    "id": "chunked-prefill",
    "term": "Chunked Prefill",
    "category": "Infrastructure & serving",
    "short": "A serving technique that divides a long prompt's prefill work into smaller schedulable pieces so prompt processing can interleave with decode work from other requests.",
    "body": "A serving technique that divides a long prompt's prefill work into smaller schedulable pieces so prompt processing can interleave with decode work from other requests.\n\n**Why it matters:** One long prompt can otherwise occupy the accelerator and delay active generations, producing poor tail latency even when total throughput looks healthy.\n\n**In practice:** Choose a chunk policy from measured workloads, account for scheduling overhead, and compare prefill completion, decode latency, and goodput under mixed prompt lengths.\n\n**Common confusion:** Chunked prefill changes how prompt computation is scheduled. It does not split the user's context into independent semantic chunks or change the model's context window.",
    "related": [
      "prefill",
      "decode-phase",
      "dynamic-batching",
      "tail-latency"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "chunking",
    "term": "Chunking",
    "category": "Retrieval & generation",
    "short": "Dividing source material into retrievable units before indexing.",
    "body": "Dividing source material into retrievable units before indexing. Chunk boundaries, overlap, metadata, and document structure determine whether retrieval returns enough context without flooding the prompt.\n\n**Why it matters:** The right chunking strategy depends on document shape, query type, embedding model, and evaluation results. There is no universal token size or overlap percentage.\n\n**In practice:** Keep headings and code blocks intact, attach source metadata, then measure retrieval quality on real questions before tuning size.",
    "related": [
      "rag",
      "reranker",
      "grounding"
    ],
    "learn": "chunking-fundamentals",
    "hover": false
  },
  {
    "id": "circuit-breaker",
    "term": "Circuit Breaker",
    "category": "AI-native development",
    "short": "A reliability control that temporarily stops calls to a dependency after failures cross a threshold, then probes whether the dependency has recovered.",
    "body": "A reliability control that temporarily stops calls to a dependency after failures cross a threshold, then probes whether the dependency has recovered.\n\n**Why it matters:** It prevents repeated model or tool failures from consuming latency, budget, and capacity across the rest of the system.\n\n**In practice:** Open the breaker after repeated provider timeouts, fail over or return a controlled response, then allow a limited health probe after a cooldown.\n\n**Common confusion:** A circuit breaker reacts to dependency health. A rate limit controls allowed request volume.",
    "related": [
      "retry-with-backoff",
      "rate-limit",
      "model-router",
      "backpressure"
    ],
    "learn": "production-deployment"
  },
  {
    "id": "coding-agent",
    "term": "Coding Agent",
    "category": "AI-native development",
    "short": "An agent specialized for software work that can inspect a repository, edit files, run development tools, and use their outputs to advance a scoped engineering task.",
    "body": "An agent specialized for software work that can inspect a repository, edit files, run development tools, and use their outputs to advance a scoped engineering task.\n\n**Why it matters:** Its value depends on repository context, tool permissions, review boundaries, and verification, not only code generation quality.\n\n**In practice:** Give the agent an issue, a scope contract, repository instructions, and a test command; review the resulting patch and evidence before accepting it.\n\n**Common confusion:** A coding assistant that only suggests text is not necessarily an agent. The agent acts through tools and observes results.",
    "related": [
      "agent-harness",
      "repository-map",
      "patch",
      "scope-contract",
      "reviewer-agent"
    ],
    "learn": "coding-agents"
  },
  {
    "id": "compensating-action",
    "term": "Compensating Action",
    "category": "Agents & tools",
    "short": "A deliberate operation that semantically counteracts a completed side effect when the original operation cannot be rolled back atomically.",
    "body": "A deliberate operation that semantically counteracts a completed side effect when the original operation cannot be rolled back atomically.\n\n**Why it matters:** Multi-step agent workflows cross databases and external services where a later failure cannot undo earlier writes through one transaction.\n\n**In practice:** If a booking workflow charges a card but the reservation fails, issue a tracked refund and preserve both events rather than deleting history.\n\n**Common confusion:** Compensation is a new business action, not time travel. It can fail and therefore needs idempotency, monitoring, and escalation.",
    "related": [
      "durable-execution",
      "idempotency",
      "checkpoint",
      "approval-gate"
    ],
    "learn": "agent-evaluation-safety"
  },
  {
    "id": "content-provenance",
    "term": "Content Provenance",
    "category": "Security & governance",
    "short": "Verifiable information about the origin and editing history of a piece of media or other digital content, including the actors, tools, transformations, and assertions attached to it.",
    "body": "Verifiable information about the origin and editing history of a piece of media or other digital content, including the actors, tools, transformations, and assertions attached to it.\n\n**Why it matters:** Generative systems make origin claims difficult to infer from appearance alone, so consumers and platforms need inspectable evidence about how content was produced.\n\n**In practice:** Bind provenance assertions to the content, sign them with controlled identities, preserve transformation history, and show clearly when evidence is missing or cannot be verified.\n\n**Common confusion:** Provenance can establish who asserted a history and whether the record was altered. It does not prove that the depicted event is true or that the content is harmless.",
    "related": [
      "data-provenance",
      "provenance-attestation",
      "audit-log",
      "grounding"
    ],
    "learn": "red-teaming-responsible-ai"
  },
  {
    "id": "context-compression",
    "term": "Context Compression",
    "category": "Prompting & context",
    "short": "Reducing the token footprint of source material while attempting to preserve the information required for a later model decision.",
    "body": "Reducing the token footprint of source material while attempting to preserve the information required for a later model decision.\n\n**Why it matters:** Compression can make long tasks fit within budget, but every omitted detail creates a risk that the model loses evidence, constraints, or unresolved state.\n\n**In practice:** Preserve authoritative facts and identifiers verbatim, summarize redundant history, attach source pointers, and test the compressed context on representative tasks.\n\n**Common confusion:** Compression is lossy unless it retains the full original. A shorter summary is not automatically an equivalent context.",
    "related": [
      "token-budget",
      "context-engineering",
      "progressive-disclosure",
      "handoff"
    ],
    "learn": "context-engineering"
  },
  {
    "id": "context-engineering",
    "term": "Context Engineering",
    "category": "Prompting & context",
    "short": "Designing the full information environment supplied to a model at each step, including instructions, selected files, retrieved evidence, tool results, examples, state, and output constraints.",
    "body": "Designing the full information environment supplied to a model at each step, including instructions, selected files, retrieved evidence, tool results, examples, state, and output constraints.\n\n**Why it matters:** Model performance often fails because relevant evidence is missing, stale, badly ordered, or overwhelmed by noise.\n\n**In practice:** Build a compact task packet with the goal, repository rules, relevant interfaces, recent tool output, and unresolved decisions, then update it as state changes.\n\n**Common confusion:** Prompt engineering focuses on instruction wording. Context engineering also decides what evidence and state enter the model's working context.",
    "related": [
      "context-window",
      "progressive-disclosure",
      "agent-state",
      "repository-map"
    ],
    "learn": "context-engineering"
  },
  {
    "id": "context-window",
    "term": "Context Window",
    "category": "Prompting & context",
    "short": "The maximum token capacity available to one model inference under a specific model and API contract.",
    "body": "The maximum token capacity available to one model inference under a specific model and API contract. The capacity may include system instructions, messages, retrieved content, tool exchanges, and generated output, with provider-specific accounting and output limits.\n\n**Why it matters:** Conversation history is only available when the application sends or reconstructs it. A large window does not guarantee that every included detail will be used reliably.\n\n**Common confusion:** Context is temporary input to an inference. Durable memory is stored outside the model and selected back into later context.",
    "related": [
      "token-budget",
      "context-engineering",
      "prompt-cache",
      "agent-state"
    ],
    "learn": "genai-fundamentals"
  },
  {
    "id": "continuous-batching",
    "term": "Continuous Batching",
    "category": "Infrastructure & serving",
    "short": "A serving scheduler that adds and removes generation requests at iteration boundaries instead of waiting for every request in a fixed batch to finish.",
    "body": "A serving scheduler that adds and removes generation requests at iteration boundaries instead of waiting for every request in a fixed batch to finish.\n\n**Why it matters:** Autoregressive requests produce different output lengths, so continuous batching can keep accelerators utilized without forcing short requests to wait for the longest one.\n\n**In practice:** Admit new requests when capacity becomes available, track per-request latency, and apply backpressure when the live batch or KV-cache budget is full.\n\n**Common confusion:** Continuous batching is an inference scheduling policy, not gradient accumulation or a training batch-size technique.",
    "related": [
      "dynamic-batching",
      "decode-phase",
      "backpressure",
      "rate-limit"
    ],
    "learn": "model-serving-routing"
  },
  {
    "id": "contrastive-learning",
    "term": "Contrastive Learning",
    "category": "Math & training",
    "short": "Training by pulling similar pairs closer and pushing dissimilar pairs apart in embedding space.",
    "body": "Training by pulling similar pairs closer and pushing dissimilar pairs apart in embedding space. CLIP uses this: matching image-text pairs vs non-matching ones.",
    "related": [
      "embedding",
      "cosine-similarity",
      "loss-function"
    ],
    "learn": "embeddings"
  },
  {
    "id": "cosine-similarity",
    "term": "Cosine Similarity",
    "category": "Data & representations",
    "short": "The normalized dot product of two vectors.",
    "body": "The normalized dot product of two vectors. It compares their direction rather than their magnitude and ranges from -1 to 1 for real-valued vectors.\n\n**Common confusion:** High cosine similarity only has meaning relative to the embedding model and the data distribution. It does not prove factual or semantic equivalence.",
    "related": [
      "embedding",
      "semantic-search",
      "reranker"
    ],
    "learn": "embeddings"
  },
  {
    "id": "cost-per-successful-task",
    "term": "Cost per Successful Task",
    "category": "AI-native development",
    "short": "Total system cost divided by the number of tasks that satisfy a defined success criterion, including retries, failed runs, tool use, and evaluation overhead.",
    "body": "Total system cost divided by the number of tasks that satisfy a defined success criterion, including retries, failed runs, tool use, and evaluation overhead.\n\n**Why it matters:** A cheap model call can produce an expensive workflow if it fails often or requires repeated human correction.\n\n**In practice:** Measure provider charges and infrastructure cost across 100 repository tasks, then divide by the number whose patches pass tests and review.\n\n**Common confusion:** Cost per token measures usage. Cost per successful task measures useful outcomes.",
    "related": [
      "evaluation",
      "retry-with-backoff",
      "model-router",
      "verification-gate"
    ],
    "learn": "cost-caching"
  },
  {
    "id": "cross-attention",
    "term": "Cross-Attention",
    "category": "Multimodal systems",
    "short": "Attention in which the query representation comes from one sequence or representation while keys and values come from another.",
    "body": "Attention in which the query representation comes from one sequence or representation while keys and values come from another.\n\n**Why it matters:** It gives one stream a learnable way to retrieve information from another, such as language tokens attending to visual features.\n\n**In practice:** State which stream supplies queries, keys, and values, apply masks for missing or invalid positions, and inspect whether the model still performs when one modality is ablated.\n\n**Common confusion:** Cross-attention is not intrinsically multimodal. It can connect two text sequences or other representations; self-attention instead derives queries, keys, and values from the same sequence representation.",
    "related": [
      "attention",
      "self-attention",
      "vision-language-model",
      "multimodal-fusion"
    ],
    "learn": "transformer-internals"
  },
  {
    "id": "cross-entropy",
    "term": "Cross-Entropy",
    "category": "Math & training",
    "short": "A loss based on the negative log probability assigned to the target outcome.",
    "body": "A loss based on the negative log probability assigned to the target outcome. In next-token training, it penalizes the model when it assigns low probability to the observed next token.\n\n**Common confusion:** Perplexity is the exponentiated average cross-entropy only when the averaging and logarithm base are defined consistently.",
    "related": [
      "loss-function",
      "softmax",
      "perplexity"
    ]
  },
  {
    "id": "data-classification",
    "term": "Data Classification",
    "category": "Security & governance",
    "short": "Assigning data to documented sensitivity or impact classes so handling, access, retention, sharing, and incident rules follow the consequences of disclosure or loss.",
    "body": "Assigning data to documented sensitivity or impact classes so handling, access, retention, sharing, and incident rules follow the consequences of disclosure or loss.\n\n**Why it matters:** An AI pipeline cannot apply proportionate controls if source documents, prompts, traces, and generated artifacts are treated as equally sensitive.\n\n**In practice:** Classify data at ingestion, carry the label through derived artifacts, restrict tools and destinations by class, and define how labels change after transformation or aggregation.\n\n**Common confusion:** Data classification describes protection requirements. It is not the same as a machine-learning classification task or a claim that the data is accurate.",
    "related": [
      "data-minimization",
      "trust-boundary",
      "least-privilege",
      "audit-log"
    ],
    "learn": "privacy-guardrails"
  },
  {
    "id": "data-exfiltration",
    "term": "Data Exfiltration",
    "category": "Security & governance",
    "short": "Unauthorized transfer of protected data from a system or trust zone to a person, tool, service, or storage location that is not permitted to receive it.",
    "body": "Unauthorized transfer of protected data from a system or trust zone to a person, tool, service, or storage location that is not permitted to receive it.\n\n**Why it matters:** An agent can expose secrets through generated text, tool arguments, URLs, logs, or side effects even when the original data store remains intact.\n\n**In practice:** Minimize readable data, allowlist destinations, inspect outbound tool calls, redact sensitive fields, and alert on unusual transfers across trust boundaries.\n\n**Common confusion:** Exfiltration is about unauthorized movement or disclosure. Ordinary retrieval of data by an authorized component is not exfiltration, although later use can become one.",
    "related": [
      "trust-boundary",
      "least-privilege",
      "indirect-prompt-injection",
      "audit-log"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "data-leakage",
    "term": "Data Leakage",
    "category": "Data & representations",
    "short": "Unintended use of information during training or feature construction that would not be available at the real prediction point or belongs to a held-out evaluation boundary.",
    "body": "Unintended use of information during training or feature construction that would not be available at the real prediction point or belongs to a held-out evaluation boundary.\n\n**Why it matters:** Leakage produces optimistic metrics that collapse when the system encounters genuinely unseen inputs.\n\n**In practice:** Split data before fitting preprocessors, keep future information out of historical features, and isolate test labels and benchmark answers from prompts and tuning loops.\n\n**Common confusion:** Leakage is not limited to duplicate rows. Global normalization statistics, timestamps, target-derived features, and repeated test-driven prompt edits can all leak information.",
    "related": [
      "benchmark-contamination",
      "eval-set",
      "data-provenance"
    ]
  },
  {
    "id": "data-lineage",
    "term": "Data Lineage",
    "category": "Security & governance",
    "short": "A record of how a data artifact was derived across sources, transformations, joins, filters, versions, and downstream uses.",
    "body": "A record of how a data artifact was derived across sources, transformations, joins, filters, versions, and downstream uses.\n\n**Why it matters:** When a source is corrected, revoked, or found unsafe, lineage identifies which datasets, embeddings, evaluations, and model artifacts may be affected.\n\n**In practice:** Give inputs and outputs stable identifiers, record each transformation and version, preserve parent-child relationships, and test whether an affected source can be traced to every derivative.\n\n**Common confusion:** Data provenance explains origin and custody broadly. Lineage emphasizes the transformation path and dependencies between data artifacts.",
    "related": [
      "data-provenance",
      "datasheet-for-datasets",
      "audit-log",
      "content-provenance"
    ],
    "learn": "data-pipelines-indexing"
  },
  {
    "id": "data-minimization",
    "term": "Data Minimization",
    "category": "Security & governance",
    "short": "For personal data, limiting what is collected, processed, exposed, and retained to what is necessary for a specified purpose.",
    "body": "For personal data, limiting what is collected, processed, exposed, and retained to what is necessary for a specified purpose. Teams can apply the same discipline to sensitive non-personal data as an engineering control.\n\n**Why it matters:** Every unnecessary field placed in a prompt, trace, cache, or tool call increases privacy exposure and the possible impact of misuse or compromise.\n\n**In practice:** Define the required fields before collection, redact or aggregate at the earliest boundary, set retention limits, and verify that optional context improves a measured task outcome before keeping it.\n\n**Common confusion:** Minimization does not mean keeping no data. It means being able to justify each data element, use, recipient, and retention period against the stated purpose.",
    "related": [
      "purpose-limitation",
      "data-classification",
      "least-privilege",
      "context-engineering"
    ],
    "learn": "privacy-guardrails"
  },
  {
    "id": "data-provenance",
    "term": "Data Provenance",
    "category": "Data & representations",
    "short": "Traceable information about where data originated, who or what transformed it, which versions were used, and how derived artifacts relate to their sources.",
    "body": "Traceable information about where data originated, who or what transformed it, which versions were used, and how derived artifacts relate to their sources.\n\n**Why it matters:** You need provenance to reproduce results, honor usage constraints, investigate contamination, and remove affected data when a source changes.\n\n**In practice:** Assign immutable dataset versions, record transformation jobs and source identifiers, and carry lineage metadata into embeddings, eval cases, and model artifacts.\n\n**Common confusion:** A source URL is only one piece of provenance; it does not describe collection time, licensing, filtering, transformation, or downstream use.",
    "related": [
      "provenance-attestation",
      "grounding"
    ],
    "learn": "data-pipelines-indexing"
  },
  {
    "id": "datasheet-for-datasets",
    "term": "Datasheet for Datasets",
    "category": "Security & governance",
    "short": "Structured documentation of a dataset's motivation, composition, collection process, preprocessing, uses, distribution, maintenance, and known limitations.",
    "body": "Structured documentation of a dataset's motivation, composition, collection process, preprocessing, uses, distribution, maintenance, and known limitations.\n\n**Why it matters:** A dataset is not safe or suitable merely because it is available. Downstream builders need evidence about how it was created and where its assumptions break.\n\n**In practice:** Publish the datasheet with a versioned dataset, identify who can answer questions, record excluded populations and transformations, and update the document when the dataset changes.\n\n**Common confusion:** A datasheet documents evidence and intended use. It is not a license, quality guarantee, or substitute for deployment-specific evaluation.",
    "related": [
      "data-lineage",
      "data-provenance",
      "model-card"
    ],
    "learn": "red-teaming-responsible-ai"
  },
  {
    "id": "deadline-propagation",
    "term": "Deadline Propagation",
    "category": "Reliability & operations",
    "short": "Passing the remaining end-to-end time budget to downstream calls so each dependency knows how long the original request can still usefully wait.",
    "body": "Passing the remaining end-to-end time budget to downstream calls so each dependency knows how long the original request can still usefully wait.\n\n**Why it matters:** Independent timeouts can exceed the user's deadline and leave abandoned work consuming capacity after the result is no longer useful.\n\n**In practice:** Set one request deadline at ingress, subtract elapsed time for each downstream call, cancel expired work, and record which boundary exhausted the budget.\n\n**Common confusion:** A deadline is an absolute or remaining completion boundary. A retry delay controls when another attempt begins and must fit inside that same budget.",
    "related": [
      "retry-with-backoff",
      "retry-budget",
      "tail-latency",
      "service-level-objective"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "decode-phase",
    "term": "Decode Phase",
    "category": "Infrastructure & serving",
    "short": "The iterative stage of autoregressive inference that generates new tokens one step at a time after the input prefix has been processed.",
    "body": "The iterative stage of autoregressive inference that generates new tokens one step at a time after the input prefix has been processed.\n\n**Why it matters:** Decode work has different compute, memory, and scheduling behavior from prefill, so one aggregate latency number can hide the actual serving bottleneck.\n\n**In practice:** Measure inter-token latency and output throughput separately, account for KV-cache occupancy, and test mixed workloads where active decodes share capacity with new prefills.\n\n**Common confusion:** Decode phase is not the decoder component of an encoder-decoder model. It names the runtime generation stage.",
    "related": [
      "prefill",
      "autoregressive",
      "kv-cache",
      "time-per-output-token"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "decoder",
    "term": "Decoder",
    "category": "Models & inference",
    "short": "A component that maps a representation into an output.",
    "body": "A component that maps a representation into an output. In an encoder-decoder transformer, the decoder uses masked self-attention and cross-attention to generate outputs. Decoder-only language models instead generate from a single causal stack.",
    "related": [
      "encoder",
      "transformer",
      "autoregressive"
    ],
    "learn": "transformers-tokenization",
    "hover": false
  },
  {
    "id": "decoding-strategy",
    "term": "Decoding Strategy",
    "category": "Models & inference",
    "short": "The algorithm that converts a model's sequence of next-token scores into selected tokens and a completed output.",
    "body": "The algorithm that converts a model's sequence of next-token scores into selected tokens and a completed output.\n\n**Why it matters:** Greedy selection, sampling, truncation, and search can produce different quality, diversity, latency, and repeatability from the same logits.\n\n**In practice:** Define the task's decoding settings, stop rules, and seed behavior in the eval configuration so results can be compared fairly.\n\n**Common confusion:** Decoding changes how outputs are selected; it does not change the model's trained parameters or add knowledge.",
    "related": [
      "autoregressive",
      "temperature",
      "top-k-sampling",
      "nucleus-sampling"
    ],
    "learn": "genai-fundamentals"
  },
  {
    "id": "defense-in-depth",
    "term": "Defense in Depth",
    "category": "Security & governance",
    "short": "Using independent preventive, detective, and corrective controls at several system boundaries so one failed control does not determine the outcome.",
    "body": "Using independent preventive, detective, and corrective controls at several system boundaries so one failed control does not determine the outcome.\n\n**Why it matters:** AI systems combine probabilistic models, untrusted content, tools, and external services, making any single filter or prompt an inadequate security boundary.\n\n**In practice:** Pair instruction controls with narrow permissions, sandboxing, schema validation, approval for consequential actions, monitoring, and a tested recovery path.\n\n**Common confusion:** More controls are not automatically better. Layers should address distinct failure modes and remain testable rather than repeat the same assumption.",
    "related": [
      "guardrails",
      "sandbox",
      "least-privilege",
      "trust-boundary"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "delegation",
    "term": "Delegation",
    "category": "Agents & tools",
    "short": "Assigning a bounded subtask to another person or agent together with the needed context, authority, output contract, and return conditions.",
    "body": "Assigning a bounded subtask to another person or agent together with the needed context, authority, output contract, and return conditions.\n\n**Why it matters:** Explicit delegation enables specialization and parallel work without losing ownership, scope, or the ability to integrate results.\n\n**In practice:** Give a reviewer agent the exact files, rubric, evidence, and deadline, then require it to return findings rather than silently modifying the primary artifact.\n\n**Common confusion:** Sending a vague message to another agent is not reliable delegation. The receiver needs a scope contract and a defined handoff back.",
    "related": [
      "scope-contract",
      "handoff",
      "reviewer-agent",
      "orchestration"
    ],
    "learn": "multi-agent-systems",
    "hover": false
  },
  {
    "id": "dense-retrieval",
    "term": "Dense Retrieval",
    "category": "Retrieval & generation",
    "short": "First-stage retrieval that embeds queries and candidates into vector representations and ranks candidates by a similarity function.",
    "body": "First-stage retrieval that embeds queries and candidates into vector representations and ranks candidates by a similarity function.\n\n**Why it matters:** It can retrieve paraphrases and semantic matches that share few exact words, complementing lexical methods such as BM25.\n\n**In practice:** Train or select an embedding model for the domain, index candidate vectors, and evaluate retrieval recall before connecting the results to generation.\n\n**Common confusion:** Dense retrieval is not a reranker. It searches the collection, while a reranker rescores a smaller candidate set.",
    "related": [
      "embedding",
      "semantic-search",
      "bm25",
      "hybrid-retrieval"
    ],
    "learn": "retrieval-fundamentals"
  },
  {
    "id": "diffusion-model",
    "term": "Diffusion Model",
    "category": "Models & inference",
    "short": "A generative model trained around a progressive noising process and a learned reverse process.",
    "body": "A generative model trained around a progressive noising process and a learned reverse process. Sampling usually begins from noise and applies repeated denoising steps, sometimes in a learned latent space.\n\n**Common confusion:** Diffusion is a general generative framework, not an image-only technique.",
    "related": [
      "latent-space",
      "vae",
      "inference"
    ],
    "learn": "multimodal-vision",
    "hover": false
  },
  {
    "id": "disaggregated-serving",
    "term": "Disaggregated Serving",
    "category": "Infrastructure & serving",
    "short": "A serving architecture that runs prefill and decode work in separately provisioned worker pools and transfers the required attention state between them.",
    "body": "A serving architecture that runs prefill and decode work in separately provisioned worker pools and transfers the required attention state between them.\n\n**Why it matters:** Prefill and decode stress hardware differently, so independent pools can be sized and scheduled for their own bottlenecks instead of competing in one queue.\n\n**In practice:** Measure state-transfer cost, route requests through compatible model versions, scale each pool from its own demand signal, and test failure recovery between phases.\n\n**Common confusion:** Disaggregation separates runtime stages. It does not split one model into tensor or pipeline-parallel shards within a stage.",
    "related": [
      "prefill",
      "decode-phase",
      "model-serving",
      "goodput"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "distribution-shift",
    "term": "Distribution Shift",
    "category": "Evaluation & safety",
    "short": "A difference between the data distribution used to build or evaluate a system and the distribution it encounters after deployment.",
    "body": "A difference between the data distribution used to build or evaluate a system and the distribution it encounters after deployment.\n\n**Why it matters:** A model can pass held-out tests yet fail when users, tasks, language, tools, or operating conditions change.\n\n**In practice:** Define expected deployment slices, monitor performance and input characteristics by slice, and add new failures to a versioned eval set.\n\n**Common confusion:** Distribution shift is not always model drift. The model may be unchanged while its environment or user population changes.",
    "related": [
      "eval-set",
      "overfitting",
      "model-card"
    ],
    "learn": "production-deployment"
  },
  {
    "id": "dpo",
    "term": "DPO",
    "aliases": [
      "Direct Preference Optimization"
    ],
    "category": "Math & training",
    "short": "A preference-optimization objective that trains a policy directly from preferred and rejected response pairs relative to a reference policy.",
    "body": "A preference-optimization objective that trains a policy directly from preferred and rejected response pairs relative to a reference policy. It avoids running an explicit reward model and reinforcement-learning loop during this stage.\n\n**Common confusion:** DPO still depends on the quality and coverage of preference data and does not eliminate evaluation or alignment risk.",
    "related": [
      "rlhf",
      "sft",
      "alignment"
    ],
    "learn": "alignment-distillation"
  },
  {
    "id": "durable-execution",
    "term": "Durable Execution",
    "category": "Agents & tools",
    "short": "Running a workflow so its state and completed steps survive process crashes, restarts, or long waits without redoing confirmed side effects.",
    "body": "Running a workflow so its state and completed steps survive process crashes, restarts, or long waits without redoing confirmed side effects.\n\n**Why it matters:** Agent tasks often span model calls, tools, approvals, and external systems. A transient process should not be the only record of progress.\n\n**In practice:** Persist each workflow transition, use idempotency keys for external writes, and resume from the latest checkpoint after a worker restarts.\n\n**Common confusion:** Durable execution does not make every operation safe automatically. Side effects still need idempotency and compensation rules.",
    "related": [
      "checkpoint",
      "agent-state",
      "idempotency",
      "approval-gate"
    ],
    "learn": "langgraph"
  },
  {
    "id": "dynamic-batching",
    "term": "Dynamic Batching",
    "category": "Infrastructure & serving",
    "short": "A runtime policy that forms inference batches from queued requests according to compatible shapes, maximum size, priority, and allowed queue delay.",
    "body": "A runtime policy that forms inference batches from queued requests according to compatible shapes, maximum size, priority, and allowed queue delay.\n\n**Why it matters:** Grouping requests can improve hardware utilization, but waiting for a batch can make latency worse when traffic is sparse or requests differ sharply.\n\n**In practice:** Set queue-delay and batch limits from measured latency objectives, separate incompatible request shapes, and compare throughput with tail latency at realistic arrival rates.\n\n**Common confusion:** Dynamic batching assembles batches from queued work. Continuous batching changes membership while autoregressive generation is already running.",
    "related": [
      "admission-control",
      "continuous-batching",
      "saturation",
      "tail-latency"
    ],
    "learn": "model-serving-routing"
  },
  {
    "id": "early-fusion",
    "term": "Early Fusion",
    "category": "Multimodal systems",
    "short": "Combining raw or low-level representations from several modalities before most task-specific modeling occurs.",
    "body": "Combining raw or low-level representations from several modalities before most task-specific modeling occurs.\n\n**Why it matters:** Early interaction can expose fine-grained cross-modal relationships, but it also requires compatible representations and careful handling of alignment and missing inputs.\n\n**In practice:** Convert each modality into a declared token or feature representation, preserve source and position markers, fuse them before the shared backbone, and compare against single-modality and late-fusion baselines.\n\n**Common confusion:** Early fusion describes where streams are combined in the architecture. It does not guarantee that the model learns useful alignment between them.",
    "related": [
      "late-fusion",
      "multimodal-fusion",
      "modality-alignment",
      "token"
    ]
  },
  {
    "id": "embedding",
    "term": "Embedding",
    "category": "Data & representations",
    "short": "A learned mapping from discrete items (words, images, users) to dense vectors in continuous space, where similar items end up close together",
    "body": "A learned mapping from discrete items (words, images, users) to dense vectors in continuous space, where similar items end up close together\n\n**Common confusion:** Similarity depends on the model, training objective, and metric. Distance in one embedding space does not carry over to another.",
    "related": [
      "cosine-similarity",
      "semantic-search",
      "vector-database"
    ],
    "learn": "embeddings",
    "hover": false
  },
  {
    "id": "encoder",
    "term": "Encoder",
    "category": "Models & inference",
    "short": "A component that transforms input into a representation.",
    "body": "A component that transforms input into a representation. A transformer encoder commonly uses non-causal self-attention, subject to any masks, so each position can incorporate context from across the input.\n\n**Common confusion:** Encoder-only models can produce outputs through task heads even though they are not typically used for autoregressive text generation.",
    "related": [
      "decoder",
      "transformer",
      "embedding"
    ],
    "learn": "transformers-tokenization",
    "hover": false
  },
  {
    "id": "error-budget",
    "term": "Error Budget",
    "category": "Reliability & operations",
    "short": "The amount of unsuccessful service allowed by a service-level objective over its measurement window before the objective is exhausted.",
    "body": "The amount of unsuccessful service allowed by a service-level objective over its measurement window before the objective is exhausted.\n\n**Why it matters:** It gives reliability and product work a shared decision boundary: teams can spend remaining budget on change while slowing risk when user-visible failure consumes it.\n\n**In practice:** Derive the budget from the SLO, track burn by cause and user segment, define release actions before exhaustion, and avoid resetting the accounting after an incident.\n\n**Common confusion:** An error budget is not a quota for causing incidents. It is an operating policy derived from a user-facing reliability target.",
    "related": [
      "service-level-objective",
      "service-level-indicator",
      "availability",
      "incident-response"
    ],
    "learn": "observability"
  },
  {
    "id": "eval-set",
    "term": "Eval Set",
    "aliases": [
      "Evaluation set"
    ],
    "category": "Evaluation & safety",
    "short": "A versioned collection of inputs, expected properties, scoring rules, and metadata used to measure an AI system against a defined capability or risk.",
    "body": "A versioned collection of inputs, expected properties, scoring rules, and metadata used to measure an AI system against a defined capability or risk.\n\n**Why it matters:** A repeatable set turns vague quality claims into comparable evidence and catches regressions after prompts, models, tools, or retrieval change.\n\n**In practice:** Keep representative support questions, adversarial instructions, expected citations, and failure labels in a reviewed dataset that is separate from development examples.\n\n**Common confusion:** A development eval guides iteration, a final held-out test estimates performance after choices are fixed, and a standardized benchmark supports comparison under a shared protocol. Repeated tuning against any held-out set leaks test information and inflates results.",
    "related": [
      "evaluation",
      "regression-test",
      "llm-as-a-judge",
      "verification-gate"
    ],
    "learn": "llm-evaluation"
  },
  {
    "id": "evaluation",
    "term": "Evaluation",
    "aliases": [
      "Eval"
    ],
    "category": "Evaluation & safety",
    "short": "A defined process for measuring model or system behavior on representative tasks using explicit success criteria, data, scorers, and review procedures.",
    "body": "A defined process for measuring model or system behavior on representative tasks using explicit success criteria, data, scorers, and review procedures.\n\n**Why it matters:** You cannot improve reliability if success is only a subjective impression from a few demos.\n\n**In practice:** Run the same customer-support scenarios before and after changing retrieval, score correctness and citation support, and inspect failures by category.\n\n**Common confusion:** A benchmark score is one evaluation result, not a complete account of production quality.",
    "related": [
      "eval-set",
      "llm-as-a-judge",
      "cost-per-successful-task",
      "regression-test"
    ],
    "learn": "llm-evaluation",
    "hover": false
  },
  {
    "id": "exact-match",
    "term": "Exact Match",
    "aliases": [
      "EM"
    ],
    "category": "Evaluation & safety",
    "short": "A metric that counts an output as correct only when its normalized representation exactly equals an accepted reference answer.",
    "body": "A metric that counts an output as correct only when its normalized representation exactly equals an accepted reference answer.\n\n**Why it matters:** It is deterministic and easy to audit for tasks with one canonical answer, but it exposes no partial credit.\n\n**In practice:** Define normalization and all accepted references before evaluation, then pair exact match with task-specific checks when several outputs can be valid.\n\n**Common confusion:** A low exact-match score can reflect harmless formatting differences, while a matching string can still be unsupported or unsafe in context.",
    "related": [
      "rouge",
      "eval-set",
      "structured-output",
      "pass-at-k"
    ],
    "learn": "llm-evaluation"
  },
  {
    "id": "expert-parallelism",
    "term": "Expert Parallelism",
    "category": "Infrastructure & serving",
    "short": "Distributing mixture-of-experts subnetworks across devices and routing each token's activations to the devices that host its selected experts.",
    "body": "Distributing mixture-of-experts subnetworks across devices and routing each token's activations to the devices that host its selected experts.\n\n**Why it matters:** Sparse experts increase model capacity without executing every expert for every token, but routing introduces communication, load-balance, and placement constraints.\n\n**In practice:** Measure token distribution by expert, provision communication bandwidth, cap or route overflow deliberately, and test quality when traffic produces uneven expert demand.\n\n**Common confusion:** Expert parallelism partitions experts selected by a router. Tensor parallelism partitions the tensor operations inside layers.",
    "related": [
      "moe",
      "tensor-parallelism",
      "pipeline-parallelism",
      "model-serving"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "feature",
    "term": "Feature",
    "category": "Data & representations",
    "short": "An individual measurable property of the data.",
    "body": "An individual measurable property of the data. In classical ML, you engineer features by hand. In deep learning, the network learns features automatically from raw data.\n\n**Common confusion:** A stored column can contain several useful features, and a learned representation can contain features with no simple human label.",
    "related": [
      "embedding",
      "latent-space"
    ],
    "hover": false
  },
  {
    "id": "few-shot",
    "term": "Few-Shot",
    "category": "Prompting & context",
    "short": "In-context learning that includes a small set of demonstrations before the target input so the model can infer the desired task, format, or decision boundary.",
    "body": "In-context learning that includes a small set of demonstrations before the target input so the model can infer the desired task, format, or decision boundary.\n\n**Why it matters:** Example quality and coverage matter more than a universal example count. Poor or contradictory demonstrations can reduce reliability.",
    "related": [
      "zero-shot",
      "in-context-learning",
      "prompt-engineering",
      "context-window"
    ],
    "learn": "prompt-fundamentals"
  },
  {
    "id": "fine-tuning",
    "term": "Fine-tuning",
    "category": "Math & training",
    "short": "Continuing training from pretrained parameters on a narrower dataset or objective.",
    "body": "Continuing training from pretrained parameters on a narrower dataset or objective. Depending on the method, you may update all parameters, selected parameters, or added adapter parameters.\n\n**Why it matters:** Fine-tuning can adapt behavior, style, format, or task performance, but it is not a dependable replacement for retrieval when facts must stay current or traceable.\n\n**Common confusion:** Fine-tuning can influence encoded knowledge, but it does not simply append records to a searchable database inside the model.",
    "related": [
      "sft",
      "lora",
      "qlora",
      "rag"
    ],
    "learn": "fine-tuning"
  },
  {
    "id": "flaky-test",
    "term": "Flaky Test",
    "category": "AI-native development",
    "short": "A test that can pass and fail across equivalent runs without a relevant change to the code or intended test environment.",
    "body": "A test that can pass and fail across equivalent runs without a relevant change to the code or intended test environment.\n\n**Why it matters:** Flakiness weakens verification gates and can train people or agents to ignore real failures or retry until they obtain a false pass.\n\n**In practice:** Preserve the failing seed and environment, quarantine only with an owner and deadline, then fix uncontrolled time, concurrency, network, order, or shared-state dependencies.\n\n**Common confusion:** A test that consistently exposes an intermittent product bug is valuable evidence, not necessarily a flaky test.",
    "related": [
      "regression-test",
      "test-oracle",
      "retry-with-backoff",
      "verification-gate"
    ],
    "learn": "ai-testing-benchmarking"
  },
  {
    "id": "flashattention",
    "term": "FlashAttention",
    "category": "Infrastructure & serving",
    "short": "An exact attention algorithm that tiles the computation to reduce transfers between accelerator memory levels while avoiding materialization of the full attention matrix in high-bandwidth memory.",
    "body": "An exact attention algorithm that tiles the computation to reduce transfers between accelerator memory levels while avoiding materialization of the full attention matrix in high-bandwidth memory.\n\n**Why it matters:** Attention can be limited by memory movement rather than arithmetic, especially for long sequences, so an IO-aware kernel can improve usable speed and memory efficiency.\n\n**In practice:** Use a kernel supported by the model's shapes, masks, dtype, and hardware, verify numerical tolerance, and benchmark end-to-end latency rather than quoting a paper result as a fixed multiplier.\n\n**Common confusion:** FlashAttention changes how attention is computed, not the mathematical attention result it targets. It is separate from KV caching and quantization.",
    "related": [
      "attention",
      "self-attention",
      "kv-cache"
    ],
    "learn": "transformer-internals"
  },
  {
    "id": "function-calling",
    "term": "Function Calling",
    "category": "Agents & tools",
    "short": "A provider or application interface through which a model emits a structured request naming a tool and its arguments.",
    "body": "A provider or application interface through which a model emits a structured request naming a tool and its arguments. Application code validates the request, performs the operation, and can return the result for another model step.\n\n**Common confusion:** The model requests a function call; your trusted code decides whether and how to execute it. Function calling alone is not a complete agent.",
    "related": [
      "structured-output",
      "tool-contract",
      "agent",
      "mcp"
    ],
    "learn": "structured-outputs-tools"
  },
  {
    "id": "goodput",
    "term": "Goodput",
    "category": "Infrastructure & serving",
    "short": "The rate of completed requests that satisfy defined service constraints, such as both time-to-first-token and per-token latency objectives, under a stated workload.",
    "body": "The rate of completed requests that satisfy defined service constraints, such as both time-to-first-token and per-token latency objectives, under a stated workload.\n\n**Why it matters:** Raw throughput can rise while users experience more slow requests. Goodput counts only work that meets the service contract.\n\n**In practice:** Declare the request distribution and latency thresholds, count only compliant completions, report percentiles beside the aggregate rate, and avoid comparing systems under different objectives.\n\n**Common confusion:** Goodput is not all completed throughput and is not a universal property of a model. It depends on workload and success thresholds.",
    "related": [
      "service-level-objective",
      "time-to-first-token",
      "time-per-output-token",
      "cost-per-successful-task"
    ],
    "learn": "model-serving-routing"
  },
  {
    "id": "gpt",
    "term": "GPT",
    "category": "Models & inference",
    "short": "Generative Pre-trained Transformer, a family label for generative transformer models pretrained on sequence-prediction objectives and adapted for downstream use.",
    "body": "Generative Pre-trained Transformer, a family label for generative transformer models pretrained on sequence-prediction objectives and adapted for downstream use. Product names and model architectures should not be treated as interchangeable.",
    "related": [
      "transformer",
      "autoregressive",
      "llm"
    ],
    "learn": "genai-fundamentals"
  },
  {
    "id": "graceful-degradation",
    "term": "Graceful Degradation",
    "category": "Reliability & operations",
    "short": "Preserving a bounded core service when capacity or dependencies are impaired by reducing optional quality, features, freshness, or workload instead of failing every request.",
    "body": "Preserving a bounded core service when capacity or dependencies are impaired by reducing optional quality, features, freshness, or workload instead of failing every request.\n\n**Why it matters:** AI systems often depend on several slow or fallible components, so an explicit reduced mode can protect essential user outcomes during partial failure.\n\n**In practice:** Predefine which capabilities may be disabled, keep the reduced mode visible to operators, protect safety checks, test the fallback under dependency failure, and restore full service deliberately. Tell users when correctness, safety, freshness, or a promised contract materially changes.\n\n**Common confusion:** Graceful degradation is not silently returning a worse answer as if nothing happened. Operators always need visibility; users need disclosure when the reduced mode materially changes the result or service contract.",
    "related": [
      "circuit-breaker",
      "load-shedding",
      "model-router",
      "availability"
    ],
    "learn": "production-deployment"
  },
  {
    "id": "gradient",
    "term": "Gradient",
    "category": "Math & training",
    "short": "A vector of partial derivatives pointing in the direction of steepest increase.",
    "body": "A vector of partial derivatives pointing in the direction of steepest increase. In ML, you go opposite to the gradient (gradient descent) to minimize the loss.\n\n**Common confusion:** Optimizers can transform, average, clip, or adapt gradients instead of taking a plain negative-gradient step.",
    "related": [
      "backpropagation",
      "gradient-descent",
      "optimizer"
    ],
    "hover": false
  },
  {
    "id": "gradient-descent",
    "term": "Gradient Descent",
    "category": "Math & training",
    "short": "A family of optimization updates that move parameters using the negative gradient of an objective, usually estimated from batches rather than the entire dataset.",
    "body": "A family of optimization updates that move parameters using the negative gradient of an objective, usually estimated from batches rather than the entire dataset.",
    "related": [
      "gradient",
      "learning-rate",
      "optimizer"
    ]
  },
  {
    "id": "grounding",
    "term": "Grounding",
    "category": "Retrieval & generation",
    "short": "Connecting a generated answer or action to evidence, state, or observations that the system can identify and check.",
    "body": "Connecting a generated answer or action to evidence, state, or observations that the system can identify and check.\n\n**Why it matters:** Grounding gives the system a basis beyond unconstrained generation and makes unsupported claims easier to detect.\n\n**In practice:** Retrieve a policy section, require the answer to cite it, and reject claims that the cited passage does not support.\n\n**Common confusion:** Adding documents to a prompt creates an opportunity for grounding. It does not guarantee the model will use them correctly.",
    "related": [
      "rag",
      "hallucination",
      "verification-gate",
      "reranker"
    ],
    "learn": "groundedness-hallucinations",
    "hover": false
  },
  {
    "id": "guardrails",
    "term": "Guardrails",
    "category": "Evaluation & safety",
    "short": "System controls that constrain inputs, tool use, outputs, permissions, and escalation.",
    "body": "System controls that constrain inputs, tool use, outputs, permissions, and escalation. They can include schemas, policy checks, classifiers, allowlists, sandboxing, approvals, and post-action verification.\n\n**Why it matters:** No single filter covers all failure modes, so controls should be layered according to risk.\n\n**Common confusion:** Guardrails reduce risk; they do not prove that an AI system is safe.",
    "related": [
      "least-privilege",
      "approval-gate",
      "sandbox",
      "evaluation"
    ],
    "learn": "privacy-guardrails",
    "hover": false
  },
  {
    "id": "hallucination",
    "term": "Hallucination",
    "category": "Evaluation & safety",
    "short": "Generated content that is false, unsupported by the available evidence, or inconsistent with the task's source of truth.",
    "body": "Generated content that is false, unsupported by the available evidence, or inconsistent with the task's source of truth. It can arise even when the output is fluent and the model is not attempting to deceive.\n\n**Why it matters:** You usually cannot inspect whether a statement existed in training data, so production checks should focus on support, correctness, and traceability.\n\n**In practice:** Require cited evidence for factual answers and evaluate whether each citation actually supports the associated claim.\n\n**Common confusion:** A hallucination is an output-quality failure, not a diagnosis of model intent.",
    "related": [
      "grounding",
      "rag",
      "verification-gate"
    ],
    "learn": "groundedness-hallucinations"
  },
  {
    "id": "handoff",
    "term": "Handoff",
    "category": "AI-native development",
    "short": "A structured transfer of a task between people or agents that preserves the objective, current state, evidence, decisions, constraints, and remaining work.",
    "body": "A structured transfer of a task between people or agents that preserves the objective, current state, evidence, decisions, constraints, and remaining work.\n\n**Why it matters:** A good handoff prevents the next worker from reconstructing the entire task from a long transcript or repeating completed actions.\n\n**In practice:** Pass the accepted plan, changed files, test commands and results, unresolved risks, and exact next action in a compact task packet.\n\n**Common confusion:** A summary says what happened. A handoff also says what state is authoritative and what should happen next.",
    "related": [
      "agent-state",
      "checkpoint",
      "scope-contract",
      "progressive-disclosure"
    ],
    "learn": "multi-agent-systems",
    "hover": false
  },
  {
    "id": "hnsw",
    "term": "HNSW",
    "aliases": [
      "Hierarchical Navigable Small World"
    ],
    "category": "Retrieval & generation",
    "short": "An approximate-nearest-neighbor index that organizes vectors in layered proximity graphs and searches from coarse upper layers toward detailed lower layers.",
    "body": "An approximate-nearest-neighbor index that organizes vectors in layered proximity graphs and searches from coarse upper layers toward detailed lower layers.\n\n**Why it matters:** It is a common way to make high-recall vector search practical at scales where exhaustive comparison is too slow.\n\n**In practice:** Tune construction and query parameters against latency, memory, and Recall@K targets, then rebuild the index when embedding versions change.\n\n**Common confusion:** HNSW is an index algorithm, not a similarity metric, embedding model, or complete vector database.",
    "related": [
      "approximate-nearest-neighbor",
      "vector-database",
      "embedding",
      "recall-at-k"
    ],
    "learn": "ann-search"
  },
  {
    "id": "human-in-the-loop",
    "term": "Human-in-the-Loop",
    "aliases": [
      "HITL",
      "Human oversight",
      "human review"
    ],
    "category": "Agents & tools",
    "short": "A workflow design in which a person supplies judgment, correction, approval, or escalation at defined points in an AI-driven process.",
    "body": "A workflow design in which a person supplies judgment, correction, approval, or escalation at defined points in an AI-driven process.\n\n**Why it matters:** Human involvement is most useful at high-impact, ambiguous, or irreversible boundaries, not as an undefined fallback after every step.\n\n**In practice:** Let the agent classify routine requests automatically, but route uncertain or high-value cases to a reviewer with the evidence and proposed action.\n\n**Common confusion:** HITL does not automatically make a system safe. Reviewers need time, context, authority, and a clear decision standard.",
    "related": [
      "approval-gate",
      "verification-gate",
      "agent",
      "guardrails"
    ],
    "learn": "hitl-state-machines"
  },
  {
    "id": "hybrid-retrieval",
    "term": "Hybrid Retrieval",
    "category": "Retrieval & generation",
    "short": "Retrieval that combines signals from different methods, commonly lexical matching and dense-vector similarity, before merging or reranking results.",
    "body": "Retrieval that combines signals from different methods, commonly lexical matching and dense-vector similarity, before merging or reranking results.\n\n**Why it matters:** Exact identifiers, rare terms, and semantic paraphrases behave differently, so one retrieval signal can miss useful evidence.\n\n**In practice:** Retrieve candidates with both BM25-style keyword search and embeddings, merge their ranks, then rerank the combined set for the user query.\n\n**Common confusion:** Hybrid retrieval combines candidate signals. A reranker applies a second relevance model to candidates already retrieved.",
    "related": [
      "semantic-search",
      "reranker",
      "rag",
      "embedding"
    ],
    "learn": "retrieval-fundamentals"
  },
  {
    "id": "idempotency",
    "term": "Idempotency",
    "category": "AI-native development",
    "short": "The property that repeating the same operation with the same identity does not create additional side effects beyond the first successful application.",
    "body": "The property that repeating the same operation with the same identity does not create additional side effects beyond the first successful application.\n\n**Why it matters:** Retries are normal in distributed agent systems. Without idempotency, one uncertain response can duplicate payments, comments, deployments, or records.\n\n**In practice:** Attach an idempotency key to a tool request and persist the completed result so a retry returns that result instead of executing the write again.\n\n**Common confusion:** Idempotency does not mean every response is byte-for-byte identical. It means the intended state change is not duplicated.",
    "related": [
      "retry-with-backoff",
      "durable-execution",
      "checkpoint"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "image-token",
    "term": "Image Token",
    "category": "Multimodal systems",
    "short": "A model-specific visual unit represented as a vector or discrete code, commonly derived from an image patch, region, or learned visual-codebook entry.",
    "body": "A model-specific visual unit represented as a vector or discrete code, commonly derived from an image patch, region, or learned visual-codebook entry.\n\n**Why it matters:** Turning visual input into a sequence lets transformer-style components process images together with text or other tokenized modalities.\n\n**In practice:** Document whether tokens are continuous patches or discrete codes, preserve spatial position, test resolution and aspect-ratio changes, and count visual tokens in the model's input budget.\n\n**Common confusion:** An image token is not necessarily one pixel, one object, or one fixed physical area. Its scope follows the visual encoder or tokenizer.",
    "related": [
      "patch-embedding",
      "token",
      "vae",
      "vision-transformer"
    ],
    "learn": "multimodal-vision"
  },
  {
    "id": "in-context-learning",
    "term": "In-Context Learning",
    "category": "Prompting & context",
    "short": "A model adapting its behavior from instructions, examples, or patterns supplied in the current input without an ordinary parameter update.",
    "body": "A model adapting its behavior from instructions, examples, or patterns supplied in the current input without an ordinary parameter update.\n\n**Why it matters:** It explains how one pretrained model can perform a new task from context while keeping its weights unchanged.\n\n**In practice:** Place representative demonstrations before the target input, test order and formatting variants, and keep evaluation examples separate from the demonstrations.\n\n**Common confusion:** In-context learning is temporary conditioning, not fine-tuning, durable memory, or proof that the model inferred the intended rule.",
    "related": [
      "few-shot",
      "zero-shot",
      "context-window",
      "prompt-engineering"
    ],
    "learn": "prompt-fundamentals"
  },
  {
    "id": "incident-response",
    "term": "Incident Response",
    "category": "Reliability & operations",
    "short": "The coordinated process for detecting, analyzing, containing, recovering from, communicating, and learning from an event that threatens service, data, safety, or security.",
    "body": "The coordinated process for detecting, analyzing, containing, recovering from, communicating, and learning from an event that threatens service, data, safety, or security.\n\n**Why it matters:** During an incident, clear roles and evidence matter more than improvised heroics, especially when model behavior and distributed dependencies obscure the failing boundary.\n\n**In practice:** Define severity and command roles, preserve traces and audit records, stop harmful actions, communicate impact, verify recovery, and track corrective work to completion.\n\n**Common confusion:** Incident response manages the event and its consequences. Root-cause analysis and long-term prevention continue after immediate service is restored.",
    "related": [
      "observability",
      "audit-log",
      "postmortem",
      "availability"
    ]
  },
  {
    "id": "indirect-prompt-injection",
    "term": "Indirect Prompt Injection",
    "category": "Security & governance",
    "short": "A prompt-injection attack delivered through content the system retrieves or observes, such as a webpage, document, email, image text, or tool result, rather than directly through the user's instruction.",
    "body": "A prompt-injection attack delivered through content the system retrieves or observes, such as a webpage, document, email, image text, or tool result, rather than directly through the user's instruction.\n\n**Why it matters:** An agent can encounter attacker-controlled instructions while performing an authorized task and mistake that content for authority-bearing guidance.\n\n**In practice:** Label external content as untrusted data, separate it from instructions, minimize tool permissions, require approval for consequential actions, and include malicious retrieved content in regression tests.\n\n**Common confusion:** Indirect describes the delivery path, not a weaker attack. A hidden instruction in retrieved content can be as consequential as a direct user prompt.",
    "related": [
      "prompt-injection",
      "instruction-hierarchy",
      "trust-boundary",
      "data-exfiltration"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "inference",
    "term": "Inference",
    "category": "Models & inference",
    "short": "Executing a trained model to produce predictions, scores, embeddings, or generated tokens without performing an ordinary training update to its parameters.",
    "body": "Executing a trained model to produce predictions, scores, embeddings, or generated tokens without performing an ordinary training update to its parameters.\n\n**Common confusion:** An application can update caches, conversation state, or external memory during inference even though model weights stay unchanged.",
    "related": [
      "autoregressive",
      "streaming",
      "kv-cache"
    ],
    "learn": "genai-fundamentals",
    "hover": false
  },
  {
    "id": "instruction-following",
    "term": "Instruction Following",
    "category": "Prompting & context",
    "short": "A model capability to map natural-language directions and supplied context to behavior that satisfies the stated task and constraints.",
    "body": "A model capability to map natural-language directions and supplied context to behavior that satisfies the stated task and constraints.\n\n**Why it matters:** Language generation can be fluent without obeying the user's requested operation, format, boundaries, or priorities.\n\n**In practice:** Evaluate instruction adherence separately from answer quality using conflicting constraints, format requirements, irrelevant context, and refusal cases.\n\n**Common confusion:** Instruction following is not factual correctness, alignment, or obedience to every string that looks like an instruction.",
    "related": [
      "sft",
      "prompt-engineering",
      "instruction-hierarchy",
      "alignment"
    ],
    "learn": "prompt-fundamentals"
  },
  {
    "id": "instruction-hierarchy",
    "term": "Instruction Hierarchy",
    "category": "Prompting & context",
    "short": "A rule set for resolving conflicts among instructions from sources with different authority, such as application policy, users, and untrusted retrieved content.",
    "body": "A rule set for resolving conflicts among instructions from sources with different authority, such as application policy, users, and untrusted retrieved content.\n\n**Why it matters:** Agent systems mix trusted goals with external text, so the model and harness need a defined response when lower-authority content conflicts with higher-authority constraints.\n\n**In practice:** Label untrusted tool output as data, preserve higher-priority constraints outside that content, and test direct and indirect conflict cases.\n\n**Common confusion:** An instruction hierarchy can improve behavior but is not a security boundary; least privilege and approval controls still limit consequences.",
    "related": [
      "system-prompt",
      "prompt-injection",
      "least-privilege",
      "tool-contract"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "inter-token-latency",
    "term": "Inter-Token Latency",
    "aliases": [
      "ITL"
    ],
    "category": "Infrastructure & serving",
    "short": "The elapsed time between two consecutive output-token arrival events for one request, calculated as `t_i - t_(i-1)` for an output token after the first.",
    "body": "The elapsed time between two consecutive output-token arrival events for one request, calculated as `t_i - t_(i-1)` for an output token after the first.\n\n**Why it matters:** Individual gaps expose decode stalls and streaming jitter that a per-request average can hide, especially under batching, preemption, or mixed workloads.\n\n**In practice:** Record each post-first-token interval with its request and token position, then report distributions by workload, output length, and concurrency without pooling away request boundaries.\n\n**Common confusion:** ITL is one interval between consecutive tokens. Time per output token is a per-request average across those intervals, while time to first token covers the wait before streaming begins.",
    "related": [
      "time-per-output-token",
      "time-to-first-token",
      "decode-phase",
      "tail-latency"
    ],
    "learn": "observability"
  },
  {
    "id": "jailbreak",
    "term": "Jailbreak",
    "category": "Security & governance",
    "short": "An adversarial input or interaction strategy intended to make a model produce behavior that its training or application controls are designed to prevent.",
    "body": "An adversarial input or interaction strategy intended to make a model produce behavior that its training or application controls are designed to prevent.\n\n**Why it matters:** Successful jailbreaks expose gaps between stated policy and actual behavior, and they can become more consequential when the model controls tools or protected data.\n\n**In practice:** Derive test families from prohibited behaviors, vary format and interaction length, measure both refusal and harmful completion, and convert confirmed failures into versioned adversarial evals.\n\n**Common confusion:** A jailbreak targets model or system behavioral restrictions. Prompt injection redirects instruction following, often toward an attacker's goal; one interaction can involve both.",
    "related": [
      "prompt-injection",
      "red-teaming",
      "guardrails",
      "eval-set"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "knowledge-distillation",
    "term": "Knowledge Distillation",
    "category": "Math & training",
    "short": "Training a student model to reproduce selected behavior or output distributions from a more capable teacher, often alongside ordinary target labels.",
    "body": "Training a student model to reproduce selected behavior or output distributions from a more capable teacher, often alongside ordinary target labels.\n\n**Why it matters:** It can transfer useful behavior into a smaller or cheaper model when serving the teacher directly is impractical.\n\n**In practice:** Define teacher outputs, temperature, student loss, and a held-out eval set, then compare the student with both the teacher and a label-only baseline.\n\n**Common confusion:** Distillation transfers behavior on the training distribution; it does not copy every capability, fact, or safety property of the teacher.",
    "related": [
      "fine-tuning",
      "loss-function",
      "logits",
      "quantization"
    ],
    "learn": "alignment-distillation"
  },
  {
    "id": "kv-cache",
    "term": "KV Cache",
    "category": "Models & inference",
    "short": "Stored key and value tensors from earlier positions in autoregressive generation.",
    "body": "Stored key and value tensors from earlier positions in autoregressive generation. Reusing them avoids recomputing attention projections for the unchanged prefix at every decoding step.\n\n**Why it matters:** It reduces repeated computation but consumes memory that grows with sequence length, layers, batch, and model configuration.\n\n**Common confusion:** A KV cache is runtime attention state for a sequence. Prefix caching reuses eligible KV state across requests, while prompt caching is a broader provider or application reuse contract.",
    "related": [
      "attention",
      "autoregressive",
      "prefix-caching",
      "prompt-cache"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "late-fusion",
    "term": "Late Fusion",
    "category": "Multimodal systems",
    "short": "Processing modalities through separate encoders or predictors and combining their high-level representations, scores, or decisions near the task output.",
    "body": "Processing modalities through separate encoders or predictors and combining their high-level representations, scores, or decisions near the task output.\n\n**Why it matters:** Separate branches can use modality-specific architectures and tolerate missing inputs, though they may miss fine-grained interactions available to earlier fusion.\n\n**In practice:** Calibrate each branch, define how missing modalities affect the merge, compare score-level and feature-level combinations, and evaluate each branch alone as an ablation.\n\n**Common confusion:** Late fusion describes the position of combination. It does not mean simple averaging or guarantee that the modalities contribute equally.",
    "related": [
      "early-fusion",
      "multimodal-fusion",
      "modality",
      "evaluation"
    ]
  },
  {
    "id": "latent-space",
    "term": "Latent Space",
    "category": "Data & representations",
    "short": "A learned representation space whose coordinates encode factors useful to a model.",
    "body": "A learned representation space whose coordinates encode factors useful to a model. It may be lower-dimensional than the input, but compression is not required for every latent representation.\n\n**Common confusion:** Nearby points are only meaningfully similar according to what the model and training objective learned.",
    "related": [
      "embedding",
      "vae",
      "feature"
    ],
    "hover": false
  },
  {
    "id": "learning-rate",
    "term": "Learning Rate",
    "category": "Math & training",
    "short": "A scale factor used by an optimizer to control parameter-update magnitude.",
    "body": "A scale factor used by an optimizer to control parameter-update magnitude. Values that are too large can destabilize training; values that are too small can make useful progress impractically slow.\n\n**Common confusion:** The effective update also depends on the optimizer, schedule, gradient scale, batch, and parameter history.",
    "related": [
      "optimizer",
      "gradient-descent"
    ],
    "learn": "fine-tuning"
  },
  {
    "id": "least-privilege",
    "term": "Least Privilege",
    "category": "Evaluation & safety",
    "short": "Giving a model, agent, tool, or user only the permissions required for the current task, for only as long as those permissions are needed.",
    "body": "Giving a model, agent, tool, or user only the permissions required for the current task, for only as long as those permissions are needed.\n\n**Why it matters:** Models can make mistakes or follow malicious instructions. Narrow permissions reduce the damage any one failure can cause.\n\n**In practice:** Give a documentation agent read access to source files and write access to one branch, but no production credentials or merge permission.\n\n**Common confusion:** Authentication proves identity. Least privilege limits what that identity can do.",
    "related": [
      "sandbox",
      "approval-gate",
      "prompt-injection",
      "tool-contract"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "llm",
    "term": "LLM",
    "aliases": [
      "Large Language Model"
    ],
    "category": "Models & inference",
    "short": "A language model with enough capacity and broad training to perform many language tasks through prompting or adaptation.",
    "body": "A language model with enough capacity and broad training to perform many language tasks through prompting or adaptation. Most current LLMs use transformer architectures and sequence-prediction objectives, but size thresholds, data sources, and training recipes vary.\n\n**Common confusion:** An LLM is a model component. Tools, retrieval, state, policies, and product logic live in the surrounding system.",
    "related": [
      "transformer",
      "autoregressive",
      "agent-harness"
    ],
    "learn": "genai-fundamentals"
  },
  {
    "id": "llm-as-a-judge",
    "term": "LLM-as-a-Judge",
    "category": "Evaluation & safety",
    "short": "Using a language model to score, compare, classify, or critique another system's output against a rubric.",
    "body": "Using a language model to score, compare, classify, or critique another system's output against a rubric.\n\n**Why it matters:** It can scale evaluation of qualities that are difficult to express as exact-match tests, such as clarity or instruction adherence.\n\n**In practice:** Give a separate evaluator model the task, candidate answer, reference evidence, and a structured rubric, then calibrate its scores against human-reviewed examples.\n\n**Common confusion:** A judge model is not ground truth. It can be biased by order, verbosity, style, prompt wording, or shared model failures.",
    "related": [
      "evaluation",
      "eval-set",
      "verification-gate",
      "precision-and-recall"
    ],
    "learn": "llm-evaluation"
  },
  {
    "id": "load-shedding",
    "term": "Load Shedding",
    "category": "Reliability & operations",
    "short": "Deliberately rejecting, dropping, or cancelling selected work at one or more overload boundaries when demand exceeds the capacity available to produce useful results.",
    "body": "Deliberately rejecting, dropping, or cancelling selected work at one or more overload boundaries when demand exceeds the capacity available to produce useful results.\n\n**Why it matters:** Continuing to accept every request during overload can increase queueing until nearly all requests miss their deadlines and recovery becomes harder.\n\n**In practice:** Shed at the earliest informed boundary, preserve high-priority and already-admitted work when possible, identify the overloaded scope, and mark a response retryable only when the condition is transient and the request remains within its retry budget.\n\n**Common confusion:** Load shedding is not confined to work that has already been accepted. Admission control is specifically the pre-acceptance gate, while rate limiting can enforce a usage policy even when capacity remains.",
    "related": [
      "admission-control",
      "backpressure",
      "rate-limit",
      "graceful-degradation"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "logits",
    "term": "Logits",
    "category": "Models & inference",
    "short": "The model's unnormalized numeric scores for candidate outcomes before a normalization function or decoding rule converts them into selections.",
    "body": "The model's unnormalized numeric scores for candidate outcomes before a normalization function or decoding rule converts them into selections.\n\n**Why it matters:** Temperature, softmax, top-k, and top-p operate on or derive from logits, so logits connect model computation to generated tokens.\n\n**In practice:** Inspect logits or log probabilities when the API exposes them, apply masks before sampling, and avoid interpreting raw magnitude as calibrated confidence.\n\n**Common confusion:** Logits are not probabilities and are not comparable across unrelated positions, models, or tasks without a defined transformation.",
    "related": [
      "softmax",
      "temperature",
      "token",
      "cross-entropy"
    ],
    "learn": "genai-fundamentals",
    "hover": false
  },
  {
    "id": "lora",
    "term": "LoRA",
    "aliases": [
      "Low-Rank Adaptation"
    ],
    "category": "Math & training",
    "short": "A method that keeps base weights frozen and learns low-rank update matrices for selected layers.",
    "body": "A method that keeps base weights frozen and learns low-rank update matrices for selected layers. It reduces the number of trainable parameters and can lower training memory relative to full-parameter fine-tuning.\n\n**Common confusion:** Actual memory and speed savings depend on rank, target modules, optimizer state, activation memory, quantization, and implementation.",
    "related": [
      "fine-tuning",
      "qlora",
      "parameter"
    ],
    "learn": "fine-tuning"
  },
  {
    "id": "loss-function",
    "term": "Loss Function",
    "category": "Math & training",
    "short": "An objective that maps predictions and targets, sometimes with regularization terms, to a value optimization tries to reduce.",
    "body": "An objective that maps predictions and targets, sometimes with regularization terms, to a value optimization tries to reduce. The loss determines which errors training directly rewards or penalizes.\n\n**Common confusion:** A low training loss does not guarantee useful, safe, or generalizable behavior on production tasks.",
    "related": [
      "cross-entropy",
      "gradient",
      "evaluation"
    ],
    "hover": false
  },
  {
    "id": "lost-in-the-middle",
    "term": "Lost in the Middle",
    "category": "Prompting & context",
    "short": "A long-context failure pattern in which model performance changes with evidence position and can degrade when relevant information sits between the beginning and end.",
    "body": "A long-context failure pattern in which model performance changes with evidence position and can degrade when relevant information sits between the beginning and end.\n\n**Why it matters:** Fitting evidence inside the context window does not guarantee that the model will use every position with equal reliability.\n\n**In practice:** Test several evidence positions, reduce distractors, place decision-critical constraints where they remain salient, and verify answers against the source.\n\n**Common confusion:** It is an observed behavior pattern, not a fixed law that affects every model, task, or position identically.",
    "related": [
      "context-window",
      "context-engineering",
      "eval-set",
      "grounding"
    ],
    "learn": "context-engineering"
  },
  {
    "id": "maximum-marginal-relevance",
    "term": "Maximum Marginal Relevance",
    "aliases": [
      "MMR"
    ],
    "category": "Retrieval & generation",
    "short": "A selection rule that balances relevance to the query with novelty relative to items already selected.",
    "body": "A selection rule that balances relevance to the query with novelty relative to items already selected.\n\n**Why it matters:** It can reduce redundant chunks so a limited context budget covers more distinct evidence.\n\n**In practice:** Retrieve a candidate pool, select the next item using a documented relevance-diversity weight, and evaluate both answer quality and source coverage.\n\n**Common confusion:** MMR diversifies an existing candidate set; it does not retrieve missing evidence or prove that selected passages are correct.",
    "related": [
      "reranker",
      "chunking",
      "rag",
      "grounding"
    ],
    "learn": "reranking-fusion"
  },
  {
    "id": "mcp",
    "term": "MCP",
    "aliases": [
      "Model Context Protocol"
    ],
    "category": "Agents & tools",
    "short": "An open protocol, built on JSON-RPC, that lets an AI application (the host) connect to servers exposing tools, resources and prompts in a standard way.",
    "body": "An open protocol, built on JSON-RPC, that lets an AI application (the host) connect to servers exposing tools, resources and prompts in a standard way. The host's client discovers what each server offers and calls it over a transport such as stdio or HTTP.\n\n**Common confusion:** MCP standardizes discovery and exchange. It does not decide which tool is safe to call or grant permission; the host still enforces approval and least privilege.",
    "related": [
      "function-calling",
      "tool-contract",
      "least-privilege"
    ],
    "learn": "mcp"
  },
  {
    "id": "membership-inference",
    "term": "Membership Inference",
    "category": "Security & governance",
    "short": "An attack that estimates whether a particular record or example was included in a model's training data by observing model outputs or other accessible signals.",
    "body": "An attack that estimates whether a particular record or example was included in a model's training data by observing model outputs or other accessible signals.\n\n**Why it matters:** Even when the model does not reproduce a record verbatim, distinguishable behavior can reveal information about participation in a sensitive dataset.\n\n**In practice:** Test representative members and non-members under the real query interface, limit unnecessary confidence signals, reduce data exposure, and evaluate privacy defenses against utility requirements.\n\n**Common confusion:** Membership inference asks whether a record participated in training. Model extraction tries to reproduce model behavior, while direct memorization tests whether content can be recovered.",
    "related": [
      "data-leakage",
      "data-minimization",
      "eval-set",
      "data-classification"
    ],
    "learn": "privacy-guardrails"
  },
  {
    "id": "modality",
    "term": "Modality",
    "category": "Multimodal systems",
    "short": "A form of information with its own structure and acquisition process, such as text, image, audio, video, depth, or sensor measurements.",
    "body": "A form of information with its own structure and acquisition process, such as text, image, audio, video, depth, or sensor measurements.\n\n**Why it matters:** Different modalities have different sampling rates, noise, spatial or temporal structure, and missing-data behavior, so one preprocessing assumption rarely fits all of them.\n\n**In practice:** Document each modality's source, units, resolution, timing, preprocessing, and missing-value policy before designing alignment or fusion.\n\n**Common confusion:** A modality is not merely a file extension or feature column. Several encodings can represent one modality, and one sample can contain several modalities.",
    "related": [
      "multimodal-model",
      "token",
      "tensor",
      "embedding"
    ],
    "learn": "multimodal-vision",
    "hover": false
  },
  {
    "id": "modality-alignment",
    "term": "Modality Alignment",
    "category": "Multimodal systems",
    "short": "Learning or establishing correspondences between representations from different modalities so semantically or temporally related items can be matched.",
    "body": "Learning or establishing correspondences between representations from different modalities so semantically or temporally related items can be matched.\n\n**Why it matters:** Fusion and cross-modal retrieval fail when the system cannot connect the same event, object, or concept across differently structured inputs.\n\n**In practice:** Define positive and negative pairs, preserve time or spatial metadata, evaluate mismatched examples, and measure alignment separately from downstream task accuracy.\n\n**Common confusion:** Alignment makes representations comparable or corresponding. It does not require them to become identical or erase modality-specific information.",
    "related": [
      "shared-embedding-space",
      "contrastive-learning",
      "grounding",
      "multimodal-fusion"
    ]
  },
  {
    "id": "model-card",
    "term": "Model Card",
    "category": "Evaluation & safety",
    "short": "A structured report describing a model's intended uses, evaluation conditions, performance characteristics, limitations, and relevant ethical or safety considerations.",
    "body": "A structured report describing a model's intended uses, evaluation conditions, performance characteristics, limitations, and relevant ethical or safety considerations.\n\n**Why it matters:** It gives downstream builders context for deciding whether reported evidence applies to their users and deployment conditions.\n\n**In practice:** Document model version, training and evaluation scope, subgroup results, known failure modes, prohibited uses, and the date of each claim.\n\n**Common confusion:** A model card communicates evidence and limitations; it is not a certification, warranty, system threat model, or substitute for deployment-specific evaluation.",
    "related": [
      "eval-set",
      "distribution-shift",
      "alignment"
    ],
    "learn": "red-teaming-responsible-ai"
  },
  {
    "id": "model-router",
    "term": "Model Router",
    "category": "AI-native development",
    "short": "A component that selects a model or provider for a request using requirements such as capability, latency, cost, context size, policy, and current availability.",
    "body": "A component that selects a model or provider for a request using requirements such as capability, latency, cost, context size, policy, and current availability.\n\n**Why it matters:** Different tasks and failure conditions justify different models, and routing can improve outcome quality without sending every request to the largest option.\n\n**In practice:** Send low-risk extraction to a fast model, complex code review to a stronger model, and fail over only to providers that satisfy the same data policy.\n\n**Common confusion:** Routing is a policy decision. Random load balancing only distributes traffic.",
    "related": [
      "evaluation",
      "circuit-breaker",
      "rate-limit",
      "cost-per-successful-task"
    ],
    "learn": "model-serving-routing"
  },
  {
    "id": "model-serving",
    "term": "Model Serving",
    "category": "Infrastructure & serving",
    "short": "The runtime and API layer that loads versioned model artifacts, accepts inference requests, schedules execution, manages resources, and returns results under an operational contract.",
    "body": "The runtime and API layer that loads versioned model artifacts, accepts inference requests, schedules execution, manages resources, and returns results under an operational contract.\n\n**Why it matters:** A capable model can still produce an unreliable product when queueing, batching, placement, versioning, cancellation, and response boundaries are not engineered explicitly.\n\n**In practice:** Pin model and tokenizer versions, validate request limits, expose readiness and latency signals, control concurrency, and test rollback before routing production traffic.\n\n**Common confusion:** Model serving is broader than calling inference once and narrower than the complete application, which may also include retrieval, tools, policy, and user state.",
    "related": [
      "inference",
      "model-router",
      "autoscaling",
      "observability"
    ],
    "learn": "model-serving-routing"
  },
  {
    "id": "moe",
    "term": "MoE",
    "aliases": [
      "Mixture of Experts"
    ],
    "category": "Models & inference",
    "short": "An architecture with multiple expert subnetworks and a learned router that selects a subset for each input unit, often each token.",
    "body": "An architecture with multiple expert subnetworks and a learned router that selects a subset for each input unit, often each token. Sparse activation can increase total parameter capacity without using every expert on every forward pass.\n\n**Why it matters:** Compute, memory, communication, routing balance, and quality depend on the specific architecture and serving system.\n\n**Common confusion:** Product names do not prove an MoE architecture unless the model developer discloses it.",
    "related": [
      "transformer",
      "model-router",
      "parameter"
    ],
    "learn": "transformer-internals"
  },
  {
    "id": "multimodal-fusion",
    "term": "Multimodal Fusion",
    "category": "Multimodal systems",
    "short": "Combining evidence or learned representations from more than one modality to produce a joint representation, prediction, or generated output.",
    "body": "Combining evidence or learned representations from more than one modality to produce a joint representation, prediction, or generated output.\n\n**Why it matters:** Modalities can supply complementary evidence, but naïve combination can amplify noise, timing errors, or one dominant stream.\n\n**In practice:** Establish single-modality baselines, specify the fusion point and masks, test missing and contradictory inputs, and report which modalities drive each evaluated slice.\n\n**Common confusion:** Fusion is the combination operation. Alignment establishes correspondence, and merely placing two modalities in one request does not prove either occurred successfully.",
    "related": [
      "early-fusion",
      "late-fusion",
      "cross-attention",
      "modality-alignment"
    ]
  },
  {
    "id": "multimodal-model",
    "term": "Multimodal Model",
    "category": "Multimodal systems",
    "short": "A model that learns from, relates, or generates more than one modality through representation, alignment, fusion, translation, or coordinated prediction.",
    "body": "A model that learns from, relates, or generates more than one modality through representation, alignment, fusion, translation, or coordinated prediction.\n\n**Why it matters:** Multimodal capability depends on how modalities interact, not simply on accepting several input types, and failures can occur at each representation boundary.\n\n**In practice:** Document supported input and output combinations, evaluate each modality alone and together, test missing or conflicting inputs, and track preprocessing versions with the model.\n\n**Common confusion:** A pipeline with separate image and text models is multimodal at the system level, but it is not necessarily one jointly trained multimodal model.",
    "related": [
      "modality",
      "vision-language-model",
      "multimodal-fusion",
      "transformer"
    ],
    "learn": "multimodal-vision"
  },
  {
    "id": "nucleus-sampling",
    "term": "Nucleus Sampling",
    "aliases": [
      "Top-p",
      "Top-p sampling"
    ],
    "category": "Models & inference",
    "short": "A decoding method that samples from the smallest set of next-token candidates whose cumulative probability reaches a chosen threshold.",
    "body": "A decoding method that samples from the smallest set of next-token candidates whose cumulative probability reaches a chosen threshold.\n\n**Why it matters:** The candidate-set size adapts to the distribution, retaining more options when uncertainty is broad and fewer when probability is concentrated.\n\n**In practice:** Evaluate the threshold with temperature and stop settings held constant, and record the complete decoding configuration with every result.\n\n**Common confusion:** Top-p is a probability-mass threshold, while top-k always keeps a fixed maximum number of candidates.",
    "related": [
      "top-k-sampling",
      "temperature",
      "decoding-strategy",
      "softmax"
    ],
    "learn": "genai-fundamentals"
  },
  {
    "id": "observability",
    "term": "Observability",
    "category": "AI-native development",
    "short": "The ability to understand an AI system's behavior from recorded inputs, outputs, state transitions, tool calls, timings, costs, errors, and evaluation signals.",
    "body": "The ability to understand an AI system's behavior from recorded inputs, outputs, state transitions, tool calls, timings, costs, errors, and evaluation signals.\n\n**Why it matters:** AI failures often span model, retrieval, tools, and orchestration. You need correlated evidence to locate the failing boundary.\n\n**In practice:** Record a trace ID across retrieval, model calls, tool execution, approvals, and final scoring while applying redaction and access controls.\n\n**Common confusion:** Logging collects events. Observability makes those events structured and connected enough to answer operational questions.",
    "related": [
      "trace",
      "evaluation",
      "agent-state",
      "time-to-first-token"
    ],
    "learn": "observability",
    "hover": false
  },
  {
    "id": "optimizer",
    "term": "Optimizer",
    "category": "Math & training",
    "short": "An algorithm that transforms gradients into parameter updates.",
    "body": "An algorithm that transforms gradients into parameter updates. Plain stochastic gradient descent is a simple baseline; momentum, Adam, and other optimizers change the update using history or adaptive scaling. Each choice has different memory, stability, and tuning behavior.\n\n**Common confusion:** The optimizer consumes gradients; backpropagation computes them.",
    "related": [
      "gradient",
      "learning-rate"
    ],
    "hover": false
  },
  {
    "id": "orchestration",
    "term": "Orchestration",
    "category": "Agents & tools",
    "short": "The control logic that sequences, branches, delegates, retries, pauses, resumes, and terminates work across model and tool steps.",
    "body": "The control logic that sequences, branches, delegates, retries, pauses, resumes, and terminates work across model and tool steps.\n\n**Why it matters:** Reliable agent behavior depends on explicit workflow decisions outside the model, especially when tasks have dependencies or consequential side effects.\n\n**In practice:** Encode stable steps as a workflow or state machine, expose bounded decisions to the model, and persist transitions before external writes.\n\n**Common confusion:** Orchestration is not synonymous with autonomy or multi-agent systems; one agent can be orchestrated through a deterministic workflow.",
    "related": [
      "agent-harness",
      "planning",
      "delegation",
      "durable-execution"
    ],
    "learn": "multi-agent-systems",
    "hover": false
  },
  {
    "id": "overfitting",
    "term": "Overfitting",
    "category": "Math & training",
    "short": "A generalization gap in which performance on training data is substantially better than performance on representative unseen data.",
    "body": "A generalization gap in which performance on training data is substantially better than performance on representative unseen data. Memorization can contribute, but the operational symptom is poor generalization.\n\n**In practice:** Compare training and held-out metrics, inspect subgroup failures, and test changes such as data quality, regularization, early stopping, or model capacity.",
    "related": [
      "eval-set"
    ],
    "learn": "fine-tuning"
  },
  {
    "id": "paged-kv-cache",
    "term": "Paged KV Cache",
    "category": "Infrastructure & serving",
    "short": "A KV-cache memory manager that stores attention state in fixed-size blocks and maps logical sequence positions to physical blocks instead of requiring one contiguous allocation per sequence.",
    "body": "A KV-cache memory manager that stores attention state in fixed-size blocks and maps logical sequence positions to physical blocks instead of requiring one contiguous allocation per sequence.\n\n**Why it matters:** Variable sequence lengths create fragmentation and unpredictable growth, so block-based allocation can improve usable memory and enable flexible sharing.\n\n**In practice:** Select block size from workload measurements, track allocation and eviction, isolate state between requests, and test cancellation and prefix sharing under memory pressure.\n\n**Common confusion:** Paged KV cache manages runtime attention-state memory. It does not move model parameters to disk or extend the model's trained context limit.",
    "related": [
      "kv-cache",
      "prefix-caching",
      "context-window",
      "model-serving"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "parameter",
    "term": "Parameter",
    "category": "Models & inference",
    "short": "A value learned during training, commonly a weight, bias, embedding element, or normalization parameter.",
    "body": "A value learned during training, commonly a weight, bias, embedding element, or normalization parameter. Parameter count is one measure of model capacity, but it does not directly determine quality, memory, or serving cost.\n\n**Common confusion:** Memory per parameter depends on numerical format, quantization metadata, sharding, optimizer state, activations, and runtime overhead.",
    "related": [
      "weight",
      "moe",
      "quantization"
    ],
    "hover": false
  },
  {
    "id": "pass-at-k",
    "term": "Pass@k",
    "category": "Evaluation & safety",
    "short": "Across a task set, the fraction of tasks for which at least one of k sampled candidates passes a defined correctness test.",
    "body": "Across a task set, the fraction of tasks for which at least one of k sampled candidates passes a defined correctness test.\n\n**Why it matters:** It measures the value of sampling several attempts for tasks such as code generation where an automatic verifier can check each candidate.\n\n**In practice:** Generate candidates independently under a fixed configuration, run the same isolated tests on each, and report k with the sampling and estimator details.\n\n**Common confusion:** Pass@k is not single-attempt accuracy, and a higher score can reflect a larger attempt budget rather than a better first answer.",
    "related": [
      "coding-agent",
      "regression-test",
      "eval-set",
      "test-oracle"
    ],
    "learn": "ai-testing-benchmarking"
  },
  {
    "id": "patch",
    "term": "Patch",
    "category": "AI-native development",
    "short": "A reviewable representation of changes to one or more files, usually expressed as additions and deletions against a known base revision.",
    "body": "A reviewable representation of changes to one or more files, usually expressed as additions and deletions against a known base revision.\n\n**Why it matters:** A patch gives people and agents a narrow artifact to inspect, test, apply, or reject without accepting an entire working directory.\n\n**In practice:** Ask a coding agent to return a unified diff, then verify that it touches only allowed files and applies cleanly to the expected commit.\n\n**Common confusion:** A patch captures file changes, not the reasoning, test evidence, or approval needed to ship them.",
    "related": [
      "coding-agent",
      "worktree",
      "scope-contract",
      "regression-test"
    ],
    "learn": "coding-agents",
    "hover": false
  },
  {
    "id": "patch-embedding",
    "term": "Patch Embedding",
    "category": "Multimodal systems",
    "short": "A learned projection that converts an image patch into a fixed-width vector used as one element of a transformer input sequence.",
    "body": "A learned projection that converts an image patch into a fixed-width vector used as one element of a transformer input sequence.\n\n**Why it matters:** It creates the interface between a spatial image grid and a sequence model, with patch size controlling token count and retained local detail.\n\n**In practice:** Record patch and image dimensions, handle padding or resizing explicitly, add position information, and measure how resolution changes affect both accuracy and token cost.\n\n**Common confusion:** A patch embedding is the vector representation of a patch, not a semantic object detector or a guarantee that patch boundaries match visual entities.",
    "related": [
      "vision-transformer",
      "image-token",
      "embedding",
      "token"
    ],
    "learn": "multimodal-vision"
  },
  {
    "id": "perplexity",
    "term": "Perplexity",
    "category": "Models & inference",
    "short": "The exponentiated average negative log-likelihood under a stated tokenization and logarithm convention.",
    "body": "The exponentiated average negative log-likelihood under a stated tokenization and logarithm convention. Lower values mean the model assigned higher probability to the evaluated sequence.\n\n**Common confusion:** Perplexity is not comparable across different tokenizers or evaluation setups and does not directly measure factuality or usefulness.",
    "related": [
      "cross-entropy",
      "token",
      "evaluation"
    ],
    "learn": "open-source-local-llms",
    "hover": false
  },
  {
    "id": "pipeline-parallelism",
    "term": "Pipeline Parallelism",
    "category": "Infrastructure & serving",
    "short": "Partitioning sequential groups of model layers across devices and moving microbatches or requests through those stages as a pipeline.",
    "body": "Partitioning sequential groups of model layers across devices and moving microbatches or requests through those stages as a pipeline.\n\n**Why it matters:** It lets models exceed one device's memory, but stage imbalance, pipeline bubbles, activation transfers, and failure coordination affect usable performance.\n\n**In practice:** Balance stage cost, choose a microbatch schedule, measure idle time and interconnect traffic, and keep model and checkpoint partition metadata versioned.\n\n**Common confusion:** Pipeline parallelism divides layers by depth. Tensor parallelism divides tensor operations within a layer.",
    "related": [
      "tensor-parallelism",
      "expert-parallelism",
      "model-serving"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "planning",
    "term": "Planning",
    "category": "Agents & tools",
    "short": "Constructing, selecting, or revising a sequence of actions and dependencies intended to move from the current state to a goal.",
    "body": "Constructing, selecting, or revising a sequence of actions and dependencies intended to move from the current state to a goal.\n\n**Why it matters:** Explicit plans make assumptions and ordering visible before an agent commits to expensive or irreversible actions.\n\n**In practice:** Ask for a short dependency-aware plan, validate it against available tools and permissions, then re-plan when observations invalidate an assumption.\n\n**Common confusion:** A generated plan is a proposal, not proof that the steps are feasible, sufficient, or safe.",
    "related": [
      "agent-state",
      "react",
      "orchestration",
      "verification-gate"
    ],
    "learn": "planning-decomposition",
    "hover": false
  },
  {
    "id": "postmortem",
    "term": "Postmortem",
    "category": "Reliability & operations",
    "short": "A durable incident record that explains impact, detection, response, contributing conditions, recovery, and owned follow-up actions without assigning blame as a substitute for analysis.",
    "body": "A durable incident record that explains impact, detection, response, contributing conditions, recovery, and owned follow-up actions without assigning blame as a substitute for analysis.\n\n**Why it matters:** A resolved outage still has value as evidence. Capturing system conditions and decisions turns one event into improvements that reduce recurrence and response time.\n\n**In practice:** Build the timeline from traces and logs, distinguish triggering events from contributing conditions, assign dated actions, and review whether each action changed the relevant control.\n\n**Common confusion:** A postmortem is not a meeting transcript or a search for one person's mistake. It should produce testable system improvements.",
    "related": [
      "incident-response",
      "regression-test",
      "audit-log",
      "observability"
    ],
    "hover": false
  },
  {
    "id": "precision-and-recall",
    "term": "Precision & Recall",
    "category": "Evaluation & safety",
    "short": "Precision asks how many flagged items were correct; recall asks how many relevant items were found.",
    "body": "Precision asks how many flagged items were correct; recall asks how many relevant items were found. When you change the decision threshold for one fixed scoring model, improving recall often lowers precision and vice versa. A better model can improve both. F1 is their harmonic mean.\n\n**Common confusion:** The right threshold and metric depend on the cost of each error and the prevalence of the target class.",
    "related": [
      "eval-set",
      "semantic-search",
      "guardrails"
    ],
    "learn": "rag-evaluation",
    "hover": false
  },
  {
    "id": "prefill",
    "term": "Prefill",
    "aliases": [
      "Prefill Phase"
    ],
    "category": "Infrastructure & serving",
    "short": "The initial inference stage that processes all supplied input tokens to produce their representations and the attention state required for subsequent autoregressive generation.",
    "body": "The initial inference stage that processes all supplied input tokens to produce their representations and the attention state required for subsequent autoregressive generation.\n\n**Why it matters:** Prompt shape, queueing, and cache reuse affect prefill cost, and prefill competes differently for compute than decode, so it strongly influences startup latency and serving schedules.\n\n**In practice:** Record prompt tokens and prefill latency, separate queue time from execution time, compare cached and uncached prefixes, and test long prompts beside active decode traffic.\n\n**Common confusion:** Prefill is the runtime prompt-processing stage, not the first generated token itself. The first token appears only after prefill and any queueing complete.",
    "related": [
      "decode-phase",
      "kv-cache",
      "time-to-first-token",
      "chunked-prefill"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "prefix-caching",
    "term": "Prefix Caching",
    "category": "Infrastructure & serving",
    "short": "Reusing KV-cache blocks produced for an identical eligible token prefix across requests so the serving runtime can skip repeated prefix computation.",
    "body": "Reusing KV-cache blocks produced for an identical eligible token prefix across requests so the serving runtime can skip repeated prefix computation.\n\n**Why it matters:** Shared system instructions, templates, or documents can consume substantial prefill work, but reuse only helps when token sequences and cache eligibility match.\n\n**In practice:** Place stable tokens before request-specific content, include model and tokenizer versions in cache identity, isolate tenant-sensitive state, monitor hit rate, and treat eviction as normal.\n\n**Common confusion:** Prefix caching reuses runtime attention state for exact token prefixes. Prompt caching is a broader provider or application contract, while semantic caching reuses a prior result for a similar request.",
    "related": [
      "prompt-cache",
      "semantic-cache",
      "kv-cache",
      "paged-kv-cache"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "progressive-disclosure",
    "term": "Progressive Disclosure",
    "category": "AI-native development",
    "short": "Supplying a person or model with the minimum useful context first, then revealing deeper detail when the task or evidence requires it.",
    "body": "Supplying a person or model with the minimum useful context first, then revealing deeper detail when the task or evidence requires it.\n\n**Why it matters:** It limits context noise and cost while keeping authoritative detail available on demand.\n\n**In practice:** Give a coding agent repository rules and a map first; load full implementation files only after it identifies the relevant module.\n\n**Common confusion:** Progressive disclosure is staged access to detail, not deliberate withholding of information required for a decision.",
    "related": [
      "context-engineering",
      "repository-map",
      "token-budget",
      "handoff"
    ],
    "learn": "agent-skills"
  },
  {
    "id": "prompt-cache",
    "term": "Prompt Cache",
    "category": "Prompting & context",
    "short": "Reuse of provider-side or application-side computation for an identical or eligible prompt prefix so repeated inference avoids some preprocessing work.",
    "body": "Reuse of provider-side or application-side computation for an identical or eligible prompt prefix so repeated inference avoids some preprocessing work.\n\n**Why it matters:** Stable instructions and large shared documents can become cheaper or faster across repeated calls when the provider's cache contract is satisfied.\n\n**In practice:** Place stable policy text before request-specific content, monitor cache-hit metadata, and treat misses as normal because eligibility and lifetime vary by provider.\n\n**Common confusion:** A prompt cache is a provider or application reuse contract and may use prefix caching internally. Prefix caching specifically reuses eligible exact-token KV state, while semantic caching reuses a prior result for a sufficiently similar request.",
    "related": [
      "semantic-cache",
      "prefix-caching",
      "kv-cache",
      "time-to-first-token"
    ],
    "learn": "cost-caching"
  },
  {
    "id": "prompt-engineering",
    "term": "Prompt Engineering",
    "category": "Prompting & context",
    "short": "Designing model-facing instructions, examples, constraints, and output requirements to improve behavior on a defined task.",
    "body": "Designing model-facing instructions, examples, constraints, and output requirements to improve behavior on a defined task.\n\n**Common confusion:** Prompt wording cannot compensate for missing evidence, unsafe permissions, poor tool contracts, or absent evaluation.",
    "related": [
      "context-engineering",
      "few-shot",
      "system-prompt",
      "structured-output"
    ],
    "learn": "prompt-fundamentals"
  },
  {
    "id": "prompt-injection",
    "term": "Prompt Injection",
    "category": "Evaluation & safety",
    "short": "An attack or failure mode in which untrusted content influences a model to disregard intended instructions, expose data, misuse tools, or take actions outside the user's goal.",
    "body": "An attack or failure mode in which untrusted content influences a model to disregard intended instructions, expose data, misuse tools, or take actions outside the user's goal. The content can arrive directly from a user or indirectly through retrieved pages, files, messages, or tool output.\n\n**Why it matters:** Models process instructions and data through the same language channel, so input filtering alone cannot reliably separate every malicious instruction from legitimate content.\n\n**In practice:** Treat external content as untrusted, isolate it from authority-bearing instructions, minimize tool permissions, require approval for consequential writes, and verify outputs and actions.\n\n**Common confusion:** Prompt injection is not technically the same mechanism as SQL injection, and a stronger system prompt is not a complete defense.",
    "related": [
      "least-privilege",
      "sandbox",
      "approval-gate",
      "tool-contract"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "prompt-sensitivity",
    "term": "Prompt Sensitivity",
    "category": "Prompting & context",
    "short": "Variation in model output or measured performance caused by changes to prompt wording, order, formatting, or examples that preserve the intended task.",
    "body": "Variation in model output or measured performance caused by changes to prompt wording, order, formatting, or examples that preserve the intended task.\n\n**Why it matters:** A system that succeeds under one convenient phrasing may be unreliable for real users or misleading in evaluation.\n\n**In practice:** Create semantically equivalent prompt variants, measure variance by case, and keep variants in regression tests instead of optimizing one prompt against one eval set.\n\n**Common confusion:** Sensitivity is not always a prompt defect; it can reveal ambiguity, weak model robustness, unstable decoding, or an inadequate scoring rule.",
    "related": [
      "prompt-engineering",
      "eval-set",
      "regression-test",
      "few-shot"
    ],
    "learn": "prompt-engineering"
  },
  {
    "id": "provenance-attestation",
    "term": "Provenance Attestation",
    "category": "Security & governance",
    "short": "Authenticated, machine-readable metadata that binds an artifact to claims about how, where, when, and from which inputs it was produced.",
    "body": "Authenticated, machine-readable metadata that binds an artifact to claims about how, where, when, and from which inputs it was produced.\n\n**Why it matters:** It lets automated policy and reviewers verify supply-chain claims instead of trusting an unsigned build note.\n\n**In practice:** Generate an attestation in the build system, bind it to artifact digests, sign it with a controlled identity, and verify it before release.\n\n**Common confusion:** A signature identifies the attester and protects integrity; it does not prove that every claim inside the attestation is true.",
    "related": [
      "data-provenance",
      "reproducible-build",
      "audit-log",
      "verification-gate"
    ]
  },
  {
    "id": "purpose-limitation",
    "term": "Purpose Limitation",
    "category": "Security & governance",
    "short": "For personal data, collecting and using it only for specified, explicit purposes unless a new use has an appropriate compatible or authorized basis.",
    "body": "For personal data, collecting and using it only for specified, explicit purposes unless a new use has an appropriate compatible or authorized basis.\n\n**Why it matters:** Data that was acceptable for one workflow can create privacy and governance risk when silently reused for model training, evaluation, personalization, or unrelated analytics.\n\n**In practice:** Record the purpose with each dataset, check new pipelines against it before access, separate incompatible uses, and require a documented decision when the purpose changes.\n\n**Common confusion:** Purpose limitation governs why data is used. Data minimization governs how much data that purpose actually requires.",
    "related": [
      "data-minimization",
      "data-classification",
      "ai-risk-assessment",
      "audit-log"
    ],
    "learn": "privacy-guardrails"
  },
  {
    "id": "qlora",
    "term": "QLoRA",
    "category": "Math & training",
    "short": "A parameter-efficient fine-tuning method that keeps a pretrained base model frozen in a low-bit quantized representation while training LoRA adapters with higher-precision computation where needed.",
    "body": "A parameter-efficient fine-tuning method that keeps a pretrained base model frozen in a low-bit quantized representation while training LoRA adapters with higher-precision computation where needed.\n\n**Why it matters:** It can reduce the memory needed to adapt large models, but savings and quality depend on model, rank, optimizer, sequence length, hardware, and implementation.\n\n**Common confusion:** QLoRA does not guarantee a particular memory footprint or a fixed quality gap from full fine-tuning.",
    "related": [
      "lora",
      "quantization",
      "fine-tuning"
    ],
    "learn": "fine-tuning"
  },
  {
    "id": "quantization",
    "term": "Quantization",
    "category": "Models & inference",
    "short": "Representing weights, activations, or caches with lower-precision formats to reduce memory, bandwidth, or compute cost.",
    "body": "Representing weights, activations, or caches with lower-precision formats to reduce memory, bandwidth, or compute cost. Methods differ in calibration, granularity, data type, and whether conversion happens before, during, or after training.\n\n**Common confusion:** Moving from one nominal bit width to another does not guarantee the same end-to-end memory or speed ratio because metadata, kernels, caches, and hardware support also matter.",
    "related": [
      "qlora",
      "parameter"
    ],
    "learn": "open-source-local-llms",
    "hover": false
  },
  {
    "id": "rag",
    "term": "RAG",
    "aliases": [
      "Retrieval-Augmented Generation"
    ],
    "category": "Retrieval & generation",
    "short": "A system pattern that retrieves evidence relevant to a request and supplies selected content to a generative model before it answers or acts.",
    "body": "A system pattern that retrieves evidence relevant to a request and supplies selected content to a generative model before it answers or acts. Retrieval can use lexical, vector, structured, or hybrid methods.\n\n**Why it matters:** RAG can make current or private evidence available without encoding it into model weights, but retrieval and grounding must be evaluated separately.",
    "related": [
      "grounding",
      "hybrid-retrieval",
      "reranker",
      "hallucination"
    ],
    "learn": "rag-fundamentals"
  },
  {
    "id": "rate-limit",
    "term": "Rate Limit",
    "category": "AI-native development",
    "short": "A policy that caps requests, tokens, concurrent work, or another resource within a defined time or capacity window.",
    "body": "A policy that caps requests, tokens, concurrent work, or another resource within a defined time or capacity window.\n\n**Why it matters:** It protects providers and your own system from overload, uncontrolled spend, and unfair resource use.\n\n**In practice:** Enforce per-tenant token and concurrency limits, read provider retry metadata, and queue or reject excess work predictably.\n\n**Common confusion:** A rate limit controls allowed usage. Backpressure propagates downstream capacity constraints through a system.",
    "related": [
      "backpressure",
      "retry-with-backoff",
      "circuit-breaker"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "react",
    "term": "ReAct",
    "category": "Agents & tools",
    "short": "An agent pattern that interleaves task reasoning, a concrete action, and an observation returned by the environment before deciding the next step.",
    "body": "An agent pattern that interleaves task reasoning, a concrete action, and an observation returned by the environment before deciding the next step.\n\n**Why it matters:** Environment feedback can correct assumptions and ground later decisions instead of forcing the model to complete the entire task from internal generation alone.\n\n**In practice:** Expose a small set of typed tools, return concise observations, cap the loop, and verify the final artifact rather than storing private reasoning traces.\n\n**Common confusion:** ReAct is a prompting and control pattern, not a guarantee of autonomy, correctness, or safe tool use.",
    "related": [
      "agent",
      "function-calling",
      "planning",
      "grounding"
    ],
    "learn": "agent-fundamentals"
  },
  {
    "id": "readiness-probe",
    "term": "Readiness Probe",
    "category": "Reliability & operations",
    "short": "A diagnostic that tells the traffic-routing layer whether a service instance is currently able to accept requests.",
    "body": "A diagnostic that tells the traffic-routing layer whether a service instance is currently able to accept requests.\n\n**Why it matters:** A process can be alive while its model is unloaded, dependencies are unavailable, or warmup is incomplete, so sending traffic too early creates avoidable failures.\n\n**In practice:** Check the minimum dependencies required to serve, fail readiness during startup and draining, keep the probe inexpensive, and do not restart the process solely because readiness is false.\n\n**Common confusion:** Readiness controls traffic eligibility. Liveness decides whether the process should be restarted, and neither proves that every model response will be correct.",
    "related": [
      "autoscaling",
      "model-serving",
      "availability",
      "graceful-degradation"
    ],
    "learn": "production-deployment"
  },
  {
    "id": "recall-at-k",
    "term": "Recall@K",
    "category": "Retrieval & generation",
    "short": "For one query, Recall@K is `|relevant items intersecting the top k| / |relevant items|`.",
    "body": "For one query, Recall@K is `|relevant items intersecting the top k| / |relevant items|`. A dataset score aggregates those per-query values under a stated rule.\n\n**Why it matters:** It tells you whether a retrieval stage supplies downstream generation or reranking with enough relevant candidates.\n\n**In practice:** Define relevance judgments, k, the aggregation method, and a policy for queries with no judged relevant items, then inspect queries with zero recalled evidence.\n\n**Common confusion:** High Recall@K does not mean the top result is good, the ranking is well ordered, or the final answer is grounded. Queries with no relevant items require an explicit exclusion or assigned-value policy because the denominator is zero.",
    "related": [
      "precision-and-recall",
      "eval-set",
      "reranker",
      "approximate-nearest-neighbor"
    ],
    "learn": "rag-evaluation"
  },
  {
    "id": "reciprocal-rank-fusion",
    "term": "Reciprocal Rank Fusion",
    "aliases": [
      "RRF"
    ],
    "category": "Retrieval & generation",
    "short": "A rank-fusion method that combines several result lists by summing contributions that decrease with each item's rank in each list.",
    "body": "A rank-fusion method that combines several result lists by summing contributions that decrease with each item's rank in each list.\n\n**Why it matters:** It can merge lexical, dense, or multi-query rankings without assuming their raw scores share the same scale.\n\n**In practice:** Retrieve independent candidate lists, deduplicate by stable document identity, apply one versioned fusion constant, and evaluate against each individual retriever.\n\n**Common confusion:** RRF combines ranks, not embeddings or relevance scores, and it cannot recover an item absent from every input list.",
    "related": [
      "hybrid-retrieval",
      "bm25",
      "dense-retrieval",
      "reranker"
    ],
    "learn": "reranking-fusion"
  },
  {
    "id": "red-teaming",
    "term": "Red Teaming",
    "category": "Security & governance",
    "short": "A structured adversarial testing process in which authorized testers seek failures using documented objectives, threat assumptions, cases, and evidence.",
    "body": "A structured adversarial testing process in which authorized testers seek failures using documented objectives, threat assumptions, cases, and evidence.\n\n**Why it matters:** Ordinary quality tests rarely explore how a system behaves under manipulation, misuse, conflicting goals, or determined attempts to bypass controls.\n\n**In practice:** Derive attacks from a threat model, run them in an isolated environment, record reproducible cases, remediate by layer, and convert confirmed failures into regression evals.\n\n**Common confusion:** A list of jailbreak prompts is not a complete red-team program, and red teaming cannot prove the absence of unknown failures.",
    "related": [
      "threat-model",
      "guardrails",
      "prompt-injection",
      "eval-set"
    ],
    "learn": "red-teaming-responsible-ai"
  },
  {
    "id": "regression-test",
    "term": "Regression Test",
    "category": "AI-native development",
    "short": "A repeatable check that protects behavior known to work, especially after code, prompt, model, retrieval, or tool changes.",
    "body": "A repeatable check that protects behavior known to work, especially after code, prompt, model, retrieval, or tool changes.\n\n**Why it matters:** AI system changes can improve average quality while silently reintroducing a previously fixed failure.\n\n**In practice:** Turn a corrected prompt-injection incident into a permanent eval case that must pass before the next deployment.\n\n**Common confusion:** A regression test guards a specific expected behavior. A broad benchmark estimates performance across a wider task distribution.",
    "related": [
      "eval-set",
      "verification-gate",
      "patch",
      "evaluation"
    ],
    "learn": "llm-evaluation"
  },
  {
    "id": "repository-instructions",
    "term": "Repository Instructions",
    "category": "AI-native development",
    "short": "Version-controlled guidance that tells coding agents how a repository is organized, which commands and conventions apply, what boundaries to respect, and how to verify work.",
    "body": "Version-controlled guidance that tells coding agents how a repository is organized, which commands and conventions apply, what boundaries to respect, and how to verify work.\n\n**Why it matters:** It turns repeated tribal knowledge into local context that travels with the code and can vary by subproject.\n\n**In practice:** Keep an `AGENTS.md` at the repository root, add narrower files for subdirectories, and include exact build, test, generated-file, security, and contribution rules.\n\n**Common confusion:** Repository instructions complement source code and human documentation; they do not override the user's current request or guarantee that an agent follows them correctly.",
    "related": [
      "repository-map",
      "scope-contract",
      "coding-agent",
      "progressive-disclosure"
    ],
    "learn": "coding-agents"
  },
  {
    "id": "repository-map",
    "term": "Repository Map",
    "category": "AI-native development",
    "short": "A compact, maintained description of a repository's important directories, ownership boundaries, entry points, build commands, tests, generated files, and local instructions.",
    "body": "A compact, maintained description of a repository's important directories, ownership boundaries, entry points, build commands, tests, generated files, and local instructions.\n\n**Why it matters:** It helps a coding agent find the right evidence before loading large files or editing the wrong subsystem.\n\n**In practice:** Generate an index from the tree and manifests, then enrich it with authoritative notes about module boundaries and validation commands.\n\n**Common confusion:** A raw file tree shows names. A repository map explains which paths matter and how they relate to a task.",
    "related": [
      "coding-agent",
      "progressive-disclosure",
      "scope-contract",
      "context-engineering"
    ],
    "learn": "coding-agents"
  },
  {
    "id": "reproducible-build",
    "term": "Reproducible Build",
    "category": "AI-native development",
    "short": "A build whose declared source, environment, and instructions can be independently rerun to produce bit-for-bit identical specified artifacts.",
    "body": "A build whose declared source, environment, and instructions can be independently rerun to produce bit-for-bit identical specified artifacts.\n\n**Why it matters:** It makes an artifact verifiable beyond the machine or agent that originally produced it and exposes hidden build inputs.\n\n**In practice:** Pin toolchains and dependencies, remove timestamps and unstable ordering, capture the environment, then compare independently rebuilt artifact digests.\n\n**Common confusion:** A build that succeeds twice is repeatable evidence, but reproducibility requires the declared independent conditions and identical outputs.",
    "related": [
      "repository-instructions",
      "verification-gate",
      "provenance-attestation",
      "software-bill-of-materials"
    ]
  },
  {
    "id": "reranker",
    "term": "Reranker",
    "category": "Retrieval & generation",
    "short": "A second-stage model or scoring function that reorders a small candidate set using a richer comparison between the query and each candidate.",
    "body": "A second-stage model or scoring function that reorders a small candidate set using a richer comparison between the query and each candidate.\n\n**Why it matters:** Fast first-stage retrieval maximizes candidate coverage, while reranking can improve which evidence reaches the limited context window.\n\n**In practice:** Retrieve 50 candidates with hybrid search, score each query-document pair with a cross-encoder, and pass the top 5 supported chunks to generation.\n\n**Common confusion:** A reranker does not search the entire corpus. It only reorders candidates that retrieval already found.",
    "related": [
      "hybrid-retrieval",
      "semantic-search",
      "rag"
    ],
    "learn": "reranking-fusion"
  },
  {
    "id": "retry-budget",
    "term": "Retry Budget",
    "category": "Reliability & operations",
    "short": "A bound on retry traffic, usually expressed relative to original requests or over a time window, that prevents retries from consuming unbounded capacity.",
    "body": "A bound on retry traffic, usually expressed relative to original requests or over a time window, that prevents retries from consuming unbounded capacity.\n\n**Why it matters:** When a dependency slows or fails, unrestricted retries multiply load exactly when the system has the least spare capacity.\n\n**In practice:** Count retries separately from first attempts, cap them by service and tenant, honor deadlines, use jittered backoff, and stop retrying non-transient or non-idempotent failures.\n\n**Common confusion:** A retry budget limits extra attempts. An error budget measures user-visible unreliability allowed by an SLO.",
    "related": [
      "retry-with-backoff",
      "error-budget",
      "rate-limit",
      "admission-control"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "retry-with-backoff",
    "term": "Retry with Backoff",
    "category": "AI-native development",
    "short": "Repeating a failed transient operation after progressively longer delays, usually with randomized jitter and a strict retry limit.",
    "body": "Repeating a failed transient operation after progressively longer delays, usually with randomized jitter and a strict retry limit.\n\n**Why it matters:** Immediate synchronized retries can worsen an outage, consume rate limits, and duplicate side effects.\n\n**In practice:** Retry a provider timeout after bounded exponential delays, honor server retry guidance, and reuse an idempotency key for any write.\n\n**Common confusion:** Do not retry permanent validation or permission errors, and do not retry non-idempotent operations without a duplication strategy.",
    "related": [
      "idempotency",
      "rate-limit",
      "circuit-breaker",
      "backpressure"
    ],
    "learn": "reliability-async"
  },
  {
    "id": "reviewer-agent",
    "term": "Reviewer Agent",
    "category": "AI-native development",
    "short": "An agent assigned to inspect another agent's artifact or decision against explicit criteria and return findings or a verdict.",
    "body": "An agent assigned to inspect another agent's artifact or decision against explicit criteria and return findings or a verdict.\n\n**Why it matters:** Separation of roles can catch omissions, but it only helps when the reviewer receives independent evidence and a concrete rubric.\n\n**In practice:** After one agent produces a patch, give a separate reviewer the diff, scope contract, repository rules, and test output, then require line-specific findings.\n\n**Common confusion:** A second model call is not automatically independent or correct. Shared context, model bias, and vague criteria can reproduce the same mistake.",
    "related": [
      "coding-agent",
      "verification-gate",
      "scope-contract",
      "llm-as-a-judge"
    ],
    "learn": "coding-agents"
  },
  {
    "id": "rlhf",
    "term": "RLHF",
    "aliases": [
      "Reinforcement Learning from Human Feedback"
    ],
    "category": "Math & training",
    "short": "A family of pipelines that uses human feedback to learn a reward or preference signal and then optimizes a model policy against that signal.",
    "body": "A family of pipelines that uses human feedback to learn a reward or preference signal and then optimizes a model policy against that signal. Implementations vary and need not all use the same reinforcement-learning algorithm.\n\n**Common confusion:** RLHF optimizes a proxy learned from collected feedback. It does not guarantee broad alignment with every user or situation.",
    "related": [
      "dpo",
      "sft",
      "alignment"
    ],
    "learn": "alignment-distillation"
  },
  {
    "id": "rollback",
    "term": "Rollback",
    "category": "Reliability & operations",
    "short": "Restoring a previously known deployment or configuration when the current release violates operational, quality, or safety criteria.",
    "body": "Restoring a previously known deployment or configuration when the current release violates operational, quality, or safety criteria.\n\n**Why it matters:** Agent and model changes can fail in production despite pre-deployment evaluation, so recovery must be designed before rollout.\n\n**In practice:** Retain versioned artifacts and configuration, define rollback triggers, rehearse the command and data implications, and verify service health after restoration.\n\n**Common confusion:** Code rollback does not automatically reverse database migrations, external side effects, cached outputs, or data written by the bad release.",
    "related": [
      "canary-release",
      "checkpoint",
      "regression-test",
      "durable-execution"
    ],
    "learn": "production-deployment",
    "hover": false
  },
  {
    "id": "rouge",
    "term": "ROUGE",
    "category": "Evaluation & safety",
    "short": "A family of metrics that compares generated text with reference text using units such as n-gram overlap or longest common subsequence.",
    "body": "A family of metrics that compares generated text with reference text using units such as n-gram overlap or longest common subsequence.\n\n**Common confusion:** Surface overlap can miss semantic equivalence and can reward copied wording without proving factual quality.",
    "related": [
      "evaluation",
      "precision-and-recall",
      "llm-as-a-judge"
    ],
    "learn": "llm-evaluation"
  },
  {
    "id": "sandbox",
    "term": "Sandbox",
    "category": "Agents & tools",
    "short": "An isolated execution environment that restricts an agent's access to files, processes, network destinations, credentials, and host resources.",
    "body": "An isolated execution environment that restricts an agent's access to files, processes, network destinations, credentials, and host resources.\n\n**Why it matters:** Generated code and tool calls can be wrong or malicious. Isolation limits their reach and makes disposable verification practical.\n\n**In practice:** Run tests in an ephemeral container with a read-only base, a scoped writable workspace, no production secrets, and an explicit network allowlist.\n\n**Common confusion:** A sandbox reduces impact. It does not establish that the code inside is correct or harmless.",
    "related": [
      "least-privilege",
      "approval-gate",
      "coding-agent",
      "guardrails"
    ],
    "learn": "agent-evaluation-safety",
    "hover": false
  },
  {
    "id": "saturation",
    "term": "Saturation",
    "category": "Reliability & operations",
    "short": "The degree to which a constrained resource or service has exhausted its capacity, including queued work that cannot begin promptly.",
    "body": "The degree to which a constrained resource or service has exhausted its capacity, including queued work that cannot begin promptly.\n\n**Why it matters:** Utilization alone can appear acceptable while memory, accelerator slots, queue depth, or a downstream quota is already limiting useful throughput.\n\n**In practice:** Identify each critical resource, measure active and waiting work, relate saturation to tail latency and errors, and alert before the queue enters an unstable growth regime.\n\n**Common confusion:** Saturation is not one universal percentage. The limiting resource and its queueing behavior depend on the workload and architecture.",
    "related": [
      "observability",
      "autoscaling",
      "backpressure",
      "tail-latency"
    ],
    "hover": false
  },
  {
    "id": "scope-contract",
    "term": "Scope Contract",
    "category": "AI-native development",
    "short": "A concrete agreement that defines a task's goal, allowed and forbidden surfaces, expected artifacts, verification requirements, and stopping conditions.",
    "body": "A concrete agreement that defines a task's goal, allowed and forbidden surfaces, expected artifacts, verification requirements, and stopping conditions.\n\n**Why it matters:** It prevents an agent from turning a narrow fix into an unreviewable refactor or from claiming completion without evidence.\n\n**In practice:** State that only the parser module and its tests may change, public APIs must remain compatible, and the named test suite must pass.\n\n**Common confusion:** A task description says what you want. A scope contract also defines boundaries and proof.",
    "related": [
      "coding-agent",
      "patch",
      "verification-gate",
      "handoff"
    ],
    "learn": "coding-agents"
  },
  {
    "id": "self-attention",
    "term": "Self-Attention",
    "category": "Models & inference",
    "short": "Attention in which queries, keys, and values are derived from the same sequence representation.",
    "body": "Attention in which queries, keys, and values are derived from the same sequence representation. Scaled similarity scores are normalized and used to combine values, subject to causal, padding, local, or other masks.\n\n**Why it matters:** It builds context-sensitive token representations, but the permitted attention pattern depends on the architecture.\n\n**Common confusion:** Not every token can always attend to every other token. Causal and sparse models intentionally restrict connections.",
    "related": [
      "attention",
      "transformer",
      "context-window"
    ],
    "learn": "transformer-internals"
  },
  {
    "id": "semantic-cache",
    "term": "Semantic Cache",
    "category": "AI-native development",
    "short": "A cache that reuses a previous result when a new request is judged sufficiently similar under a chosen representation and threshold.",
    "body": "A cache that reuses a previous result when a new request is judged sufficiently similar under a chosen representation and threshold.\n\n**Why it matters:** It can reduce latency and cost for repeated intents, but an incorrect match can return stale or user-inappropriate output.\n\n**In practice:** Cache low-risk FAQ answers by normalized intent, include tenant and policy version in the key, and bypass the cache for personalized or time-sensitive requests.\n\n**Common confusion:** Semantic similarity does not guarantee that two requests have the same correct answer. A semantic cache reuses a prior result, while prefix caching reuses exact-token KV state and prompt caching follows provider or application eligibility rules.",
    "related": [
      "prompt-cache",
      "embedding",
      "cost-per-successful-task",
      "grounding"
    ],
    "learn": "cost-caching"
  },
  {
    "id": "semantic-search",
    "term": "Semantic Search",
    "category": "Retrieval & generation",
    "short": "Retrieval that represents a query and candidates in an embedding space and ranks candidates using a vector-similarity function.",
    "body": "Retrieval that represents a query and candidates in an embedding space and ranks candidates using a vector-similarity function.\n\n**Why it matters:** It can retrieve paraphrases and conceptually related text, but exact identifiers and rare strings may still need lexical search.",
    "related": [
      "embedding",
      "hybrid-retrieval",
      "vector-database",
      "reranker"
    ],
    "learn": "retrieval-fundamentals"
  },
  {
    "id": "separation-of-duties",
    "term": "Separation of Duties",
    "category": "Security & governance",
    "short": "Dividing conflicting responsibilities or authority across independent roles so one principal cannot complete a high-risk action without another authorized decision.",
    "body": "Dividing conflicting responsibilities or authority across independent roles so one principal cannot complete a high-risk action without another authorized decision.\n\n**Why it matters:** A compromised account or mistaken agent should not be able to propose, approve, execute, and conceal the same consequential change.\n\n**In practice:** Separate artifact creation from release approval, use distinct identities, preserve both decisions in the audit log, and define emergency access with later review.\n\n**Common confusion:** Separation of duties is about conflicting authority, not simply assigning work to several people or agents that share the same credentials.",
    "related": [
      "approval-gate",
      "reviewer-agent",
      "audit-log",
      "least-privilege"
    ]
  },
  {
    "id": "service-level-indicator",
    "term": "Service Level Indicator",
    "aliases": [
      "SLI"
    ],
    "category": "Reliability & operations",
    "short": "A quantitative measure of service behavior at a defined user-relevant boundary, such as successful request ratio or latency below a threshold.",
    "body": "A quantitative measure of service behavior at a defined user-relevant boundary, such as successful request ratio or latency below a threshold.\n\n**Why it matters:** Reliability discussions become actionable only when the observed behavior, eligible events, and measurement point are explicit.\n\n**In practice:** Define numerator, denominator, exclusions, data source, and aggregation window, then validate that the indicator tracks an outcome users actually experience.\n\n**Common confusion:** An SLI is the measurement. An SLO is the target applied to that measurement over a defined period.",
    "related": [
      "service-level-objective",
      "availability",
      "tail-latency",
      "observability"
    ],
    "learn": "observability"
  },
  {
    "id": "service-level-objective",
    "term": "Service Level Objective",
    "aliases": [
      "SLO"
    ],
    "category": "Reliability & operations",
    "short": "A target range or threshold for a service-level indicator over a stated population and measurement window.",
    "body": "A target range or threshold for a service-level indicator over a stated population and measurement window.\n\n**Why it matters:** It translates an expected user outcome into an operating boundary for monitoring, capacity, release risk, and incident decisions.\n\n**In practice:** Choose an indicator users care about, set the target from product needs rather than current performance, define the window and exclusions, and attach an error-budget policy.\n\n**Common confusion:** An SLO is an internal reliability objective. A contractual service-level agreement can include remedies and may use different definitions.",
    "related": [
      "service-level-indicator",
      "error-budget",
      "availability",
      "goodput"
    ],
    "learn": "observability"
  },
  {
    "id": "sft",
    "term": "SFT",
    "aliases": [
      "Supervised Fine-Tuning"
    ],
    "category": "Math & training",
    "short": "Fine-tuning a pretrained model on paired inputs and desired responses so it learns the demonstrated behavior under the training distribution.",
    "body": "Fine-tuning a pretrained model on paired inputs and desired responses so it learns the demonstrated behavior under the training distribution.\n\n**Common confusion:** SFT can adapt many behaviors beyond chat, and example quality determines what behavior is reinforced.",
    "related": [
      "fine-tuning",
      "dpo",
      "rlhf"
    ],
    "learn": "fine-tuning"
  },
  {
    "id": "shadow-traffic",
    "term": "Shadow Traffic",
    "category": "Reliability & operations",
    "short": "A copy of live request traffic sent to a candidate system for observation while the candidate response remains outside the primary user response path.",
    "body": "A copy of live request traffic sent to a candidate system for observation while the candidate response remains outside the primary user response path. Because the copied request still executes, its side effects must be isolated.\n\n**Why it matters:** It exposes the candidate to real input shapes and load while limiting user impact, which can reveal failures absent from synthetic tests.\n\n**In practice:** Remove or tokenize sensitive fields, route tools and dependencies to sandboxed or no-op targets, block writes at capability boundaries, preserve request correlation, and prevent shadow load from competing with user traffic.\n\n**Common confusion:** Keeping a candidate response off the primary path does not make execution side-effect-free. A canary release differs because it serves real users from the candidate for a controlled share of traffic.",
    "related": [
      "canary-release",
      "evaluation",
      "trace",
      "model-serving"
    ],
    "learn": "llm-evaluation"
  },
  {
    "id": "shared-embedding-space",
    "term": "Shared Embedding Space",
    "category": "Multimodal systems",
    "short": "A common vector space in which representations from different modalities can be compared with the same similarity function.",
    "body": "A common vector space in which representations from different modalities can be compared with the same similarity function.\n\n**Why it matters:** It enables cross-modal retrieval and matching, such as finding images from text, without requiring both items to share a raw representation.\n\n**In practice:** Train paired and unpaired negatives deliberately, normalize vectors when the objective requires it, evaluate both retrieval directions, and inspect subgroup and language performance.\n\n**Common confusion:** Sharing a vector dimension does not create a shared semantic space. The training objective and data must establish cross-modal comparability.",
    "related": [
      "embedding",
      "cosine-similarity",
      "modality-alignment",
      "semantic-search"
    ],
    "learn": "multimodal-vision"
  },
  {
    "id": "skill-bundle",
    "term": "Skill Bundle",
    "category": "Agents & tools",
    "short": "The complete installable skill directory, including `SKILL.md` and every reference, script, asset, fixture, or companion file required by the workflow.",
    "body": "The complete installable skill directory, including `SKILL.md` and every reference, script, asset, fixture, or companion file required by the workflow.\n\n**Why it matters:** Copying only the entry file can leave valid-looking instructions that point to missing resources or lose the deterministic code the workflow depends on.\n\n**In practice:** Install the tree as one unit, record hashes and source revision, validate the installed copy, and show collisions before replacing an existing bundle.\n\n**Common confusion:** `SKILL.md` is the entry point, not necessarily the entire artifact.",
    "related": [
      "agent-skill",
      "skill-catalog",
      "reproducible-build",
      "provenance-attestation"
    ],
    "learn": "agent-skills"
  },
  {
    "id": "skill-catalog",
    "term": "Skill Catalog",
    "category": "Agents & tools",
    "short": "The compact model-visible inventory of eligible skills, usually containing routing metadata such as name, description, and an internal source identifier rather than every skill body.",
    "body": "The compact model-visible inventory of eligible skills, usually containing routing metadata such as name, description, and an internal source identifier rather than every skill body.\n\n**Why it matters:** A catalog lets an agent discover relevant procedures without loading every installed package into the working context.\n\n**In practice:** Validate packages first, apply an explicit duplicate-name policy, measure the serialized catalog budget, and retain diagnostics for entries that were shortened, omitted, or shadowed.\n\n**Common confusion:** A catalog entry means the skill is discoverable. It does not mean the body is active or its tools are authorized.",
    "related": [
      "skill-discovery",
      "skill-invocation",
      "progressive-disclosure",
      "token-budget"
    ],
    "learn": "agent-skills"
  },
  {
    "id": "skill-discovery",
    "term": "Skill Discovery",
    "category": "Agents & tools",
    "short": "A runtime pipeline that searches configured roots, identifies candidate skill directories, validates their package contract, attaches scope and provenance, resolves collisions, and publishes eligible catalog entries.",
    "body": "A runtime pipeline that searches configured roots, identifies candidate skill directories, validates their package contract, attaches scope and provenance, resolves collisions, and publishes eligible catalog entries.\n\n**Why it matters:** Deterministic discovery makes missing, malformed, shadowed, and unsafe packages diagnosable before model routing begins.\n\n**In practice:** Declare search scopes and duplicate behavior, decide how symlinks are handled, reject resource escapes, and log why each candidate was accepted or rejected.\n\n**Common confusion:** Skill discovery is not an unrestricted recursive search for filenames called `SKILL.md`; installation locations and precedence are runtime policy.",
    "related": [
      "skill-catalog",
      "skill-bundle",
      "progressive-disclosure",
      "trust-boundary"
    ],
    "learn": "agent-skills"
  },
  {
    "id": "skill-invocation",
    "term": "Skill Invocation",
    "category": "Agents & tools",
    "short": "The runtime-mediated process in which an eligible human, model, application, or other skill selects a skill and causes its instructions to enter the working context.",
    "body": "The runtime-mediated process in which an eligible human, model, application, or other skill selects a skill and causes its instructions to enter the working context.\n\n**Why it matters:** Explicit user access, implicit model routing, activation, argument binding, tool permission, and execution are separate decisions with different failure modes.\n\n**In practice:** Define actor policy, evaluate descriptions with positive and near-miss requests, record the selected package identity, and keep host-specific invocation fields in tested adapters.\n\n**Common confusion:** Invocation activates instructions. It does not automatically execute a command or bypass approval and sandbox policy.",
    "related": [
      "agent-skill",
      "skill-catalog",
      "approval-gate",
      "sandbox"
    ],
    "learn": "agent-skills"
  },
  {
    "id": "softmax",
    "term": "Softmax",
    "category": "Math & training",
    "short": "A function defined by `softmax(x_i) = exp(x_i) / sum(exp(x_j))`, implemented with numerical stabilization.",
    "body": "A function defined by `softmax(x_i) = exp(x_i) / sum(exp(x_j))`, implemented with numerical stabilization. Its outputs are positive and sum to one, so they can parameterize a categorical distribution.\n\n**Common confusion:** Softmax values are not automatically calibrated probabilities about real-world correctness.",
    "related": [
      "temperature",
      "cross-entropy",
      "attention"
    ],
    "learn": "transformer-internals"
  },
  {
    "id": "software-bill-of-materials",
    "term": "Software Bill of Materials",
    "aliases": [
      "SBOM"
    ],
    "category": "Security & governance",
    "short": "A structured inventory of software components and relationships associated with a product or artifact, often including versions, suppliers, licenses, and identifiers.",
    "body": "A structured inventory of software components and relationships associated with a product or artifact, often including versions, suppliers, licenses, and identifiers.\n\n**Why it matters:** You need a component inventory to assess affected dependencies, license obligations, and supply-chain exposure when software changes or vulnerabilities emerge.\n\n**In practice:** Generate the SBOM during the trusted build, bind it to the release artifact, verify it in policy checks, and update it whenever dependencies or packaging change.\n\n**Common confusion:** An SBOM is an inventory, not proof that components are secure, correctly licensed, or actually present unless generation and provenance are trustworthy.",
    "related": [
      "provenance-attestation",
      "reproducible-build",
      "data-provenance",
      "audit-log"
    ]
  },
  {
    "id": "speculative-decoding",
    "term": "Speculative Decoding",
    "category": "Models & inference",
    "short": "An inference method in which a cheaper draft process proposes several tokens and the target model scores those draft positions in parallel.",
    "body": "An inference method in which a cheaper draft process proposes several tokens and the target model scores those draft positions in parallel. In exact sampling variants, an acceptance and correction rule preserves the target model's output distribution.\n\n**Why it matters:** It can reduce serial target-model decoding work when drafts are accepted, without requiring a change to the target model's trained weights.\n\n**In practice:** Measure acceptance rate and end-to-end latency on real prompts, include draft-model overhead, and verify that the implementation preserves the intended decoding distribution.\n\n**Common confusion:** Speculative decoding is not ordinary model routing or unverified autocomplete. Exact variants preserve the target distribution through acceptance and correction, while approximate variants may trade that guarantee for speed.",
    "related": [
      "autoregressive",
      "kv-cache",
      "decoding-strategy",
      "tokens-per-second"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "stop-sequence",
    "term": "Stop Sequence",
    "category": "Models & inference",
    "short": "An application-specified token or text pattern that causes generation to stop when the decoding system encounters it.",
    "body": "An application-specified token or text pattern that causes generation to stop when the decoding system encounters it.\n\n**Why it matters:** Stop sequences bound output protocols and multi-part generation without waiting for the model to decide semantically that it is finished.\n\n**In practice:** Choose unambiguous delimiters, test tokenization and partial streaming matches, and still enforce output length and schema validation.\n\n**Common confusion:** A stop sequence is a mechanical decoding condition, not proof that the answer is complete or that an agent goal is satisfied.",
    "related": [
      "decoding-strategy",
      "structured-output",
      "token",
      "termination-condition"
    ],
    "learn": "prompt-fundamentals"
  },
  {
    "id": "streaming",
    "term": "Streaming",
    "category": "Models & inference",
    "short": "Delivering incremental response events before the complete result is ready.",
    "body": "Delivering incremental response events before the complete result is ready. A stream may contain token text, structured deltas, tool-call arguments, usage metadata, or status events depending on the API.\n\n**Why it matters:** It improves perceived responsiveness, but it does not reduce the model's actual time to produce a complete answer.\n\n**Common confusion:** Network transport, event shape, and chunk boundaries are provider-specific and are not guaranteed to align with words or tokens.",
    "related": [
      "time-to-first-token",
      "autoregressive",
      "observability"
    ],
    "learn": "llm-apis-streaming",
    "hover": false
  },
  {
    "id": "structured-output",
    "term": "Structured Output",
    "category": "Agents & tools",
    "short": "Model output constrained or validated against a machine-readable schema so application code can consume fields without parsing free-form prose.",
    "body": "Model output constrained or validated against a machine-readable schema so application code can consume fields without parsing free-form prose.\n\n**Why it matters:** It reduces format ambiguity at the model-to-software boundary and enables field-level validation and retries.\n\n**In practice:** Require an incident triage result with an allowed severity enum, evidence array, and nullable escalation reason, then reject any response that fails the schema.\n\n**Common confusion:** Schema-valid output can still contain incorrect values. Structure is not factual verification.",
    "related": [
      "function-calling",
      "tool-contract",
      "verification-gate"
    ],
    "learn": "structured-outputs-tools"
  },
  {
    "id": "swarm",
    "term": "Swarm",
    "category": "Agents & tools",
    "short": "A loosely coordinated multi-agent pattern in which local agent decisions and message exchange produce system-level behavior.",
    "body": "A loosely coordinated multi-agent pattern in which local agent decisions and message exchange produce system-level behavior. The term is used inconsistently, so the actual topology, state ownership, and termination rules must be specified.\n\n**Common confusion:** Multiple named agents do not guarantee useful specialization or emergent coordination.",
    "related": [
      "agent",
      "reviewer-agent",
      "handoff",
      "agent-state"
    ],
    "learn": "multi-agent-systems",
    "hover": false
  },
  {
    "id": "system-prompt",
    "term": "System Prompt",
    "category": "Prompting & context",
    "short": "A provider-defined instruction message or configuration supplied by the application to establish behavior and constraints within that provider's instruction hierarchy.",
    "body": "A provider-defined instruction message or configuration supplied by the application to establish behavior and constraints within that provider's instruction hierarchy.\n\n**Why it matters:** System instructions can guide behavior, but they are not guaranteed to remain secret and should not be treated as a security boundary.\n\n**Common confusion:** Priority rules, message roles, persistence, and visibility differ across APIs. Check the current provider contract.",
    "related": [
      "prompt-engineering",
      "prompt-injection",
      "context-engineering",
      "guardrails"
    ],
    "learn": "prompt-fundamentals"
  },
  {
    "id": "tail-latency",
    "term": "Tail Latency",
    "category": "Reliability & operations",
    "short": "The latency experienced by the slowest portion of requests, commonly summarized with a high percentile under a stated workload and time window.",
    "body": "The latency experienced by the slowest portion of requests, commonly summarized with a high percentile under a stated workload and time window.\n\n**Why it matters:** Averages can look healthy while a meaningful group of users waits much longer because of queueing, contention, retries, or variable request cost.\n\n**In practice:** Report several percentiles by route and workload, retain timeouts as censored or failed observations according to a documented rule, and trace slow requests across dependencies.\n\n**Common confusion:** Tail latency is not the single slowest request and has no meaning without the percentile, population, and measurement boundary.",
    "related": [
      "time-to-first-token",
      "time-per-output-token",
      "saturation",
      "goodput"
    ],
    "learn": "model-serving-routing"
  },
  {
    "id": "temperature",
    "term": "Temperature",
    "category": "Models & inference",
    "short": "A decoding parameter that rescales logits before a probability distribution is formed.",
    "body": "A decoding parameter that rescales logits before a probability distribution is formed. Higher positive values usually flatten the distribution; lower positive values sharpen it.\n\n**Why it matters:** Temperature changes sampling behavior, not the model's knowledge or factuality.\n\n**Common confusion:** A zero setting is often implemented as greedy decoding, but exact behavior and determinism depend on the provider, sampler, seed support, and serving system.",
    "related": [
      "softmax",
      "autoregressive",
      "token"
    ],
    "learn": "genai-fundamentals"
  },
  {
    "id": "tensor",
    "term": "Tensor",
    "category": "Data & representations",
    "short": "A typed array with a shape, data type, and device placement that frameworks use to represent inputs, parameters, activations, and gradients.",
    "body": "A typed array with a shape, data type, and device placement that frameworks use to represent inputs, parameters, activations, and gradients. Automatic-differentiation metadata is framework- and operation-dependent, not an inherent property of every tensor.",
    "related": [
      "parameter"
    ],
    "hover": false
  },
  {
    "id": "tensor-parallelism",
    "term": "Tensor Parallelism",
    "category": "Infrastructure & serving",
    "short": "Partitioning tensor operations within a model layer across devices, with collective communication combining partial results during the layer computation.",
    "body": "Partitioning tensor operations within a model layer across devices, with collective communication combining partial results during the layer computation.\n\n**Why it matters:** It lets one layer use memory and compute from several devices, but frequent communication can dominate when the interconnect or partition is unsuitable.\n\n**In practice:** Match partition dimensions to model shapes, benchmark collective traffic, keep ranks on a fast interconnect, and record the sharding layout with checkpoints and serving configuration.\n\n**Common confusion:** Tensor parallelism splits work inside layers. Pipeline parallelism places different layer groups on different devices.",
    "related": [
      "tensor",
      "pipeline-parallelism",
      "expert-parallelism",
      "parameter"
    ],
    "learn": "inference-optimization"
  },
  {
    "id": "termination-condition",
    "term": "Termination Condition",
    "category": "Agents & tools",
    "short": "An explicit rule that ends or pauses an agent run when it succeeds, fails, exhausts a budget, reaches a safe boundary, or requires escalation.",
    "body": "An explicit rule that ends or pauses an agent run when it succeeds, fails, exhausts a budget, reaches a safe boundary, or requires escalation.\n\n**Why it matters:** Without a termination condition, an agent can loop, repeat side effects, waste budget, or claim completion without satisfying the goal.\n\n**In practice:** Define success evidence, maximum steps and cost, non-retryable errors, and escalation states before starting the loop.\n\n**Common confusion:** A stop sequence ends text generation; a termination condition decides whether the task or workflow should stop.",
    "related": [
      "agent-harness",
      "token-budget",
      "verification-gate",
      "stop-sequence"
    ],
    "learn": "agent-fundamentals"
  },
  {
    "id": "test-oracle",
    "term": "Test Oracle",
    "category": "AI-native development",
    "short": "The mechanism, specification, reference, invariant, or human judgment used to decide whether observed program behavior is correct.",
    "body": "The mechanism, specification, reference, invariant, or human judgment used to decide whether observed program behavior is correct.\n\n**Why it matters:** Generating test inputs is not enough; automated verification requires an independent basis for classifying each result.\n\n**In practice:** Prefer executable invariants, reference implementations, schemas, and deterministic expected outputs, then document where human judgment remains necessary.\n\n**Common confusion:** The model that wrote the code should not be treated as an independent oracle merely because you ask it whether its own output is correct.",
    "related": [
      "regression-test",
      "verification-gate",
      "eval-set",
      "human-in-the-loop"
    ],
    "learn": "ai-testing-benchmarking"
  },
  {
    "id": "threat-model",
    "term": "Threat Model",
    "category": "Security & governance",
    "short": "A documented account of protected assets, trust boundaries, potential adversaries, assumed capabilities, attack paths, impacts, and planned controls.",
    "body": "A documented account of protected assets, trust boundaries, potential adversaries, assumed capabilities, attack paths, impacts, and planned controls.\n\n**Why it matters:** Security controls cannot be judged without stating what they defend, against whom, and under which assumptions.\n\n**In practice:** Map data and authority across model, retrieval, tools, users, and external services, then turn credible abuse paths into red-team cases and mitigations.\n\n**Common confusion:** A threat model prioritizes plausible risks; it is not a checklist that proves the system secure or predicts every future attack.",
    "related": [
      "least-privilege",
      "prompt-injection",
      "sandbox",
      "red-teaming"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "time-per-output-token",
    "term": "Time per Output Token",
    "aliases": [
      "TPOT"
    ],
    "category": "Infrastructure & serving",
    "short": "For one request with `N > 1` output tokens, the average post-first-token interval: `(t_N - t_1) / (N - 1)`.",
    "body": "For one request with `N > 1` output tokens, the average post-first-token interval: `(t_N - t_1) / (N - 1)`. System distributions then aggregate those per-request averages.\n\n**Why it matters:** Users can receive the first token quickly while the rest of the answer streams slowly, so startup latency alone does not describe generation responsiveness.\n\n**In practice:** Compute TPOT separately for each request, report percentiles across requests by output length and concurrency, and avoid pooling all token intervals or comparing systems with different tokenizers and measurement boundaries.\n\n**Common confusion:** TPOT is a per-request average. An individual inter-token latency is one gap between consecutive tokens, while time to first token includes the wait before output starts.",
    "related": [
      "decode-phase",
      "time-to-first-token",
      "streaming",
      "goodput"
    ],
    "learn": "observability"
  },
  {
    "id": "time-to-first-token",
    "term": "Time to First Token",
    "aliases": [
      "TTFT"
    ],
    "category": "Models & inference",
    "short": "The elapsed time from submitting a generation request until the client receives the first output token or content event under a defined measurement boundary.",
    "body": "The elapsed time from submitting a generation request until the client receives the first output token or content event under a defined measurement boundary.\n\n**Why it matters:** TTFT strongly affects perceived responsiveness and can reveal queueing, prompt processing, cache, or network delays.\n\n**In practice:** Record client-side TTFT by model, prompt length, region, and cache status, then separate it from total completion time.\n\n**Common confusion:** TTFT is not tokens per second. One measures startup latency; the other measures generation throughput after output begins.",
    "related": [
      "streaming",
      "prompt-cache",
      "observability",
      "token-budget"
    ],
    "learn": "observability"
  },
  {
    "id": "token",
    "term": "Token",
    "category": "Data & representations",
    "short": "An integer identifier produced by a model-specific tokenizer from text, bytes, images, audio, or another input representation.",
    "body": "An integer identifier produced by a model-specific tokenizer from text, bytes, images, audio, or another input representation. A token can be a whole word, part of a word, punctuation, whitespace, a byte sequence, or a special control symbol.\n\n**Common confusion:** Character-to-token ratios vary by language, content, and tokenizer, so count with the target model's tokenizer or provider tools.",
    "related": [
      "token-budget",
      "context-window",
      "autoregressive"
    ],
    "learn": "transformers-tokenization",
    "hover": false
  },
  {
    "id": "token-budget",
    "term": "Token Budget",
    "category": "Prompting & context",
    "short": "An explicit allocation of token capacity across instructions, evidence, history, tool results, reasoning or working space, and output.",
    "body": "An explicit allocation of token capacity across instructions, evidence, history, tool results, reasoning or working space, and output.\n\n**Why it matters:** Every included token competes for context capacity, latency, and cost. Budgeting forces you to preserve high-value evidence first.\n\n**In practice:** Reserve output capacity, cap retrieved chunks, summarize old tool results into state, and stop or compact before the model limit is reached.\n\n**Common confusion:** A token budget is a planning constraint. It is not the same as the model's maximum context window.",
    "related": [
      "context-window",
      "context-engineering",
      "progressive-disclosure",
      "cost-per-successful-task"
    ],
    "learn": "context-engineering"
  },
  {
    "id": "tokenization",
    "term": "Tokenization",
    "category": "Data & representations",
    "short": "Converting an input representation into the ordered token identifiers a specific model or tokenizer accepts.",
    "body": "Converting an input representation into the ordered token identifiers a specific model or tokenizer accepts.\n\n**Why it matters:** Tokenization determines sequence length, vocabulary boundaries, cost accounting, truncation behavior, and how text or code is represented before embedding.\n\n**In practice:** Use the exact tokenizer for the target model, version it with artifacts, and test multilingual text, code, whitespace, and special tokens.\n\n**Common confusion:** Tokenization is not always word splitting, and two models can assign different token counts and IDs to the same input.",
    "related": [
      "token",
      "vocabulary",
      "byte-pair-encoding",
      "embedding"
    ],
    "learn": "transformers-tokenization"
  },
  {
    "id": "tokens-per-second",
    "term": "Tokens per Second",
    "aliases": [
      "TPS",
      "output token throughput"
    ],
    "category": "Infrastructure & serving",
    "short": "A throughput measure reporting how many output tokens a serving system produces per unit time under a stated scope and workload.",
    "body": "A throughput measure reporting how many output tokens a serving system produces per unit time under a stated scope and workload.\n\n**Why it matters:** It complements startup latency by showing how quickly generation proceeds after output begins and how serving behaves under load.\n\n**In practice:** State whether TPS is per request or aggregate, exclude or identify prefill, and report batch, concurrency, sequence lengths, hardware, and percentile latency.\n\n**Common confusion:** TPS is not directly comparable across different tokenizers, workloads, quality settings, or measurement boundaries.",
    "related": [
      "time-to-first-token",
      "streaming",
      "prefill",
      "observability"
    ],
    "learn": "observability"
  },
  {
    "id": "tool-contract",
    "term": "Tool Contract",
    "category": "Agents & tools",
    "short": "The complete agreement for a tool boundary: purpose, typed inputs, outputs, validation, permissions, side effects, errors, timeouts, idempotency, and evidence returned to the caller.",
    "body": "The complete agreement for a tool boundary: purpose, typed inputs, outputs, validation, permissions, side effects, errors, timeouts, idempotency, and evidence returned to the caller.\n\n**Why it matters:** A schema tells a model what fields exist; a contract tells the system when the tool is safe and how failures must be handled.\n\n**In practice:** Define a file-write tool with an allowed root, expected base revision, maximum size, dry-run mode, explicit conflict errors, and a returned patch hash.\n\n**Common confusion:** A JSON Schema is part of a tool contract, not the whole contract.",
    "related": [
      "function-calling",
      "structured-output",
      "least-privilege",
      "idempotency"
    ],
    "learn": "structured-outputs-tools"
  },
  {
    "id": "top-k-sampling",
    "term": "Top-k Sampling",
    "category": "Models & inference",
    "short": "A decoding method that restricts the next-token distribution to the k highest-scoring candidates, renormalizes their probabilities, and samples from that set.",
    "body": "A decoding method that restricts the next-token distribution to the k highest-scoring candidates, renormalizes their probabilities, and samples from that set.\n\n**Why it matters:** It removes the long low-probability tail from sampling while keeping a fixed maximum candidate count.\n\n**In practice:** Evaluate k together with temperature, top-p, and stop settings, and record the complete sampler configuration with generated results.\n\n**Common confusion:** Top-k uses a fixed candidate count, while top-p uses a probability-mass threshold whose candidate count changes by step.",
    "related": [
      "nucleus-sampling",
      "temperature",
      "decoding-strategy",
      "logits"
    ],
    "learn": "genai-fundamentals"
  },
  {
    "id": "trace",
    "term": "Trace",
    "category": "AI-native development",
    "short": "A correlated record of one request or task across model calls, retrieval, tools, state transitions, retries, approvals, and evaluations.",
    "body": "A correlated record of one request or task across model calls, retrieval, tools, state transitions, retries, approvals, and evaluations.\n\n**Why it matters:** It lets you reconstruct where time, cost, and failure entered a multi-step workflow.\n\n**In practice:** Propagate one trace identifier through the agent harness and attach redacted spans for each model and tool operation.\n\n**Common confusion:** A trace should record operational evidence, not expose hidden model reasoning, secrets, or unredacted sensitive content.",
    "related": [
      "observability",
      "agent-state",
      "time-to-first-token",
      "evaluation"
    ],
    "learn": "observability",
    "hover": false
  },
  {
    "id": "transfer-learning",
    "term": "Transfer Learning",
    "category": "Math & training",
    "short": "Starting from representations or parameters learned on one data distribution or objective and adapting them for another.",
    "body": "Starting from representations or parameters learned on one data distribution or objective and adapting them for another. The transferable components and update strategy depend on architecture and task.\n\n**Common confusion:** Transfer is not limited to later layers, and successful transfer is not guaranteed when source and target tasks differ sharply.",
    "related": [
      "fine-tuning",
      "feature",
      "sft"
    ],
    "learn": "fine-tuning"
  },
  {
    "id": "transformer",
    "term": "Transformer",
    "category": "Models & inference",
    "short": "A neural-network architecture built from attention, position information, feed-forward sublayers, residual connections, and normalization.",
    "body": "A neural-network architecture built from attention, position information, feed-forward sublayers, residual connections, and normalization. Encoder, decoder, and encoder-decoder variants use different masks and information flows.\n\n**Why it matters:** Training can process many sequence positions in parallel, while autoregressive generation still produces outputs step by step.\n\n**Common confusion:** Self-attention does not imply unrestricted all-to-all attention in every transformer.",
    "related": [
      "attention",
      "self-attention",
      "encoder",
      "decoder"
    ],
    "learn": "transformers-tokenization",
    "hover": false
  },
  {
    "id": "trust-boundary",
    "term": "Trust Boundary",
    "category": "Security & governance",
    "short": "An interface where data, instructions, identity, or authority crosses between components or principals that operate under different trust assumptions.",
    "body": "An interface where data, instructions, identity, or authority crosses between components or principals that operate under different trust assumptions.\n\n**Why it matters:** A boundary crossing is where the system must authenticate actors, validate data, constrain permissions, and decide which claims can influence action.\n\n**In practice:** Draw boundaries around users, model context, retrieval sources, tools, networks, and data stores, then specify validation and authorization for every crossing.\n\n**Common confusion:** A network boundary is only one kind of trust boundary. Untrusted document text entering a privileged agent context also crosses one.",
    "related": [
      "threat-model",
      "least-privilege",
      "sandbox",
      "indirect-prompt-injection"
    ],
    "learn": "ai-security-injection"
  },
  {
    "id": "vae",
    "term": "VAE",
    "aliases": [
      "Variational Autoencoder"
    ],
    "category": "Models & inference",
    "short": "A latent-variable model trained with a reconstruction objective and a regularization term that keeps an approximate posterior close to a chosen prior.",
    "body": "A latent-variable model trained with a reconstruction objective and a regularization term that keeps an approximate posterior close to a chosen prior. The reparameterization estimator allows gradients through stochastic latent sampling.\n\n**Common confusion:** A VAE does not force every latent distribution to one fixed Gaussian; the exact prior and approximate posterior are modeling choices.",
    "related": [
      "latent-space",
      "encoder",
      "decoder",
      "diffusion-model"
    ],
    "learn": "multimodal-vision"
  },
  {
    "id": "vector-database",
    "term": "Vector Database",
    "category": "Retrieval & generation",
    "short": "A storage and indexing system that supports nearest-neighbor queries over vector representations, often with metadata filtering, persistence, and approximate indexes.",
    "body": "A storage and indexing system that supports nearest-neighbor queries over vector representations, often with metadata filtering, persistence, and approximate indexes.\n\n**Common confusion:** A vector database stores and searches vectors. It does not create high-quality embeddings or guarantee relevant retrieval.",
    "related": [
      "embedding",
      "semantic-search",
      "hybrid-retrieval"
    ],
    "learn": "vector-databases"
  },
  {
    "id": "verification-gate",
    "term": "Verification Gate",
    "category": "Evaluation & safety",
    "short": "A control point that blocks progress until defined evidence satisfies a correctness or quality criterion.",
    "body": "A control point that blocks progress until defined evidence satisfies a correctness or quality criterion.\n\n**Why it matters:** It converts a model's claim of completion into an evidence-backed decision.\n\n**In practice:** Prevent a coding task from completing until the patch applies, scoped tests pass, forbidden files remain unchanged, and required artifacts exist.\n\n**Common confusion:** Verification checks whether evidence meets criteria. Approval grants authority to proceed, even when the evidence is already known.",
    "related": [
      "approval-gate",
      "regression-test",
      "scope-contract",
      "structured-output"
    ],
    "learn": "coding-agents"
  },
  {
    "id": "vision-transformer",
    "term": "Vision Transformer",
    "aliases": [
      "ViT"
    ],
    "category": "Multimodal systems",
    "short": "A vision architecture that represents an image as a sequence of patch embeddings with position information and processes that sequence with transformer encoder blocks.",
    "body": "A vision architecture that represents an image as a sequence of patch embeddings with position information and processes that sequence with transformer encoder blocks.\n\n**Why it matters:** It provides a sequence-model interface for visual data, but performance and compute depend on patch size, resolution, pretraining, and inductive biases.\n\n**In practice:** Keep patching and normalization consistent with training, account for position-embedding behavior at new resolutions, and compare against a suitable visual baseline on the target dataset.\n\n**Common confusion:** ViT is an architecture family, not every transformer that accepts images, and its patches are not inherently semantic objects.",
    "related": [
      "transformer",
      "patch-embedding",
      "self-attention",
      "encoder"
    ],
    "learn": "multimodal-vision"
  },
  {
    "id": "vision-language-model",
    "term": "Vision-Language Model",
    "aliases": [
      "VLM"
    ],
    "category": "Multimodal systems",
    "short": "A model that learns relationships between, or jointly processes, visual and language representations for tasks such as retrieval, description, question answering, or grounded generation.",
    "body": "A model that learns relationships between, or jointly processes, visual and language representations for tasks such as retrieval, description, question answering, or grounded generation.\n\n**Why it matters:** VLM performance depends on the visual encoder, language component, connection mechanism, training data, and resolution policy rather than one generic capability label.\n\n**In practice:** Evaluate text-only and vision-only controls, vary image resolution and layout, require evidence localization where possible, and report failures by visual skill and language.\n\n**Common confusion:** Accepting an image does not prove the model uses it correctly, and a VLM is not necessarily able to generate images.",
    "related": [
      "multimodal-model",
      "vision-transformer",
      "cross-attention",
      "visual-grounding"
    ],
    "learn": "multimodal-vision"
  },
  {
    "id": "visual-grounding",
    "term": "Visual Grounding",
    "category": "Multimodal systems",
    "short": "Connecting a language expression to spatial evidence in an image or video, such as a region, object, mask, or tracked entity.",
    "body": "Connecting a language expression to spatial evidence in an image or video, such as a region, object, mask, or tracked entity.\n\n**Why it matters:** A fluent visual answer can be unsupported, while grounding makes the claimed referent inspectable and enables region-level evaluation.\n\n**In practice:** Require a box, mask, or temporal segment with the answer, test ambiguous and absent referents, and score localization separately from language correctness.\n\n**Common confusion:** Visual grounding identifies where the referenced evidence is. General image captioning can describe a scene without localizing each claim.",
    "related": [
      "grounding",
      "vision-language-model",
      "attention",
      "evaluation"
    ]
  },
  {
    "id": "vocabulary",
    "term": "Vocabulary",
    "category": "Data & representations",
    "short": "The finite mapping between token identifiers and the units a tokenizer can emit, including ordinary, byte-level, and special control tokens.",
    "body": "The finite mapping between token identifiers and the units a tokenizer can emit, including ordinary, byte-level, and special control tokens.\n\n**Why it matters:** Vocabulary design affects sequence length, multilingual coverage, code representation, embedding size, and compatibility between tokenizers and model weights.\n\n**In practice:** Version the vocabulary and special-token assignments with the model, test encode-decode round trips, and never substitute a tokenizer with merely similar token names.\n\n**Common confusion:** A model vocabulary is not a dictionary of human words; many entries are fragments, bytes, whitespace patterns, or control symbols.",
    "related": [
      "tokenization",
      "byte-pair-encoding",
      "token",
      "embedding"
    ],
    "learn": "transformers-tokenization",
    "hover": false
  },
  {
    "id": "weight",
    "term": "Weight",
    "category": "Math & training",
    "short": "A trainable coefficient in a model transformation.",
    "body": "A trainable coefficient in a model transformation. Weights are usually organized into tensors, and optimization adjusts them to reduce the training objective.\n\n**Common confusion:** Not every parameter is called a weight; biases, embeddings, and normalization scales are parameters too.",
    "related": [
      "parameter",
      "tensor",
      "optimizer"
    ],
    "hover": false
  },
  {
    "id": "worktree",
    "term": "Worktree",
    "category": "AI-native development",
    "short": "In Git, a working directory attached to a repository and branch or commit, with shared object storage but its own checked-out files and index.",
    "body": "In Git, a working directory attached to a repository and branch or commit, with shared object storage but its own checked-out files and index.\n\n**Why it matters:** Separate worktrees let people and agents work concurrently without constantly switching or overwriting one checkout.\n\n**In practice:** Give each coding agent a named feature branch and exact worktree path, then review and integrate patches through normal Git history.\n\n**Common confusion:** A worktree isolates checked-out files, not every process, port, cache, database, or secret on the machine.",
    "related": [
      "coding-agent",
      "patch",
      "scope-contract",
      "handoff"
    ],
    "learn": "coding-agents"
  },
  {
    "id": "zero-trust",
    "term": "Zero Trust",
    "category": "Security & governance",
    "short": "A security model that grants no implicit trust from network location or asset ownership and instead evaluates each access request against identity, device, resource, policy, and current context.",
    "body": "A security model that grants no implicit trust from network location or asset ownership and instead evaluates each access request against identity, device, resource, policy, and current context.\n\n**Why it matters:** AI tools and agents span local files, cloud services, models, and external content, so a trusted internal network is too broad a basis for authority.\n\n**In practice:** Authenticate every actor and workload, authorize each resource action, issue short-lived credentials, segment access, and continuously record and reevaluate policy-relevant signals.\n\n**Common confusion:** Zero trust does not mean trusting nothing or blocking all automation. It means making trust decisions explicit, scoped, and continuously verifiable.",
    "related": [
      "least-privilege",
      "trust-boundary",
      "approval-gate",
      "audit-log"
    ]
  },
  {
    "id": "zero-shot",
    "term": "Zero-Shot",
    "category": "Prompting & context",
    "short": "Performing a task from instructions or task framing without including task-specific demonstrations in the immediate input.",
    "body": "Performing a task from instructions or task framing without including task-specific demonstrations in the immediate input.\n\n**Common confusion:** Zero-shot does not mean the model had no relevant pretraining, instruction tuning, tools, or retrieved context.",
    "related": [
      "few-shot",
      "prompt-engineering",
      "transfer-learning"
    ],
    "learn": "prompt-fundamentals"
  }
];
