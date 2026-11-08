// Learning paths by role (C4): an ordered route through this course's topics for one kind of AI work.
// Adapted from ai-engineering-from-scratch learning-paths/*.json and interviews/roles.yaml
// (MIT, © 2026 Rohit Ghumare), rewritten for ai-learn and mapped onto ai-learn's own topics.
// Pure data + pure helpers (type-only imports), so pace.ts, nextStep callers, achievements and node tests share it.
// Topics are listed in course order, so every lesson a path relies on comes before it.
import type { Progress } from '../lib/progress';

export interface Role {
  id: string;
  title: string;
  summary: string;
  goodFitIf: string[];
  responsibilities: string[];
  /** ordered topic ids from this course */
  topics: string[];
}

export const ROLES: Role[] = [
  {
    id: 'agentic-ai-engineer',
    title: 'Agentic AI engineer',
    summary: 'Build agents that call tools in a loop, with clear state, memory, safety limits, evaluation and traces you can read.',
    goodFitIf: [
      'You like reasoning about state, control flow and how things fail and recover.',
      'You want an agent’s freedom bounded by explicit contracts and evidence.',
      'You prefer orchestration you can test over impressive demos.',
    ],
    responsibilities: [
      'Design tool contracts and close the think, act, observe loop.',
      'Decide what goes into context, what is remembered and what expires.',
      'Model failures and defend the boundary between instructions and tool data.',
      'Evaluate behaviour from trajectories and run the system from traces.',
    ],
    topics: [
      'genai-fundamentals',
      'prompt-fundamentals',
      'structured-outputs-tools',
      'llm-apis-streaming',
      'context-engineering',
      'agent-fundamentals',
      'planning-decomposition',
      'agent-memory-tools',
      'multi-agent-systems',
      'hitl-state-machines',
      'agent-evaluation-safety',
      'mcp',
      'modern-agent-stack',
      'ai-security-injection',
      'observability',
      'reliability-async',
    ],
  },
  {
    id: 'applied-ai-engineer',
    title: 'Applied AI engineer',
    summary: 'Turn what a language model can do into a product feature that is grounded, evaluated, safe and affordable.',
    goodFitIf: [
      'You want to connect model behaviour directly to something users touch.',
      'You enjoy balancing quality, safety, latency and cost.',
      'You prefer measured product behaviour over one-off model demos.',
    ],
    responsibilities: [
      'Shape model behaviour with prompts, schemas, context, retrieval and tools.',
      'Write evaluation sets and guardrails from the product’s requirements.',
      'Trade quality against latency, cost and operational risk.',
      'Ship through a gateway with staged rollout and a way back.',
    ],
    topics: [
      'genai-fundamentals',
      'prompt-fundamentals',
      'prompt-engineering',
      'structured-outputs-tools',
      'llm-apis-streaming',
      'embeddings',
      'retrieval-fundamentals',
      'context-engineering',
      'rag-fundamentals',
      'groundedness-hallucinations',
      'llm-evaluation',
      'model-serving-routing',
      'privacy-guardrails',
      'cost-caching',
      'production-deployment',
    ],
  },
  {
    id: 'ai-evaluation-reliability-engineer',
    title: 'Eval & reliability engineer',
    summary: 'Measure how models and agents behave, expose their failure modes, and gate releases on evidence.',
    goodFitIf: [
      'You trust measurements more than confident claims that something works.',
      'You enjoy hunting edge cases, regressions and failure paths.',
      'You want evaluation and operations to share the same release evidence.',
    ],
    responsibilities: [
      'Design LLM, RAG and agent evaluations around real failure risks.',
      'Instrument the runtime so traces and metrics explain what users saw.',
      'Set regression thresholds, canaries and rollback conditions before release.',
      'Turn red-team findings and incidents into tested fixes.',
    ],
    topics: [
      'genai-fundamentals',
      'prompt-fundamentals',
      'rag-fundamentals',
      'rag-evaluation',
      'groundedness-hallucinations',
      'llm-evaluation',
      'ai-testing-benchmarking',
      'agent-fundamentals',
      'agent-evaluation-safety',
      'red-teaming-responsible-ai',
      'observability',
      'reliability-async',
      'production-deployment',
    ],
  },
  {
    id: 'forward-deployed-ai-engineer',
    title: 'Forward-deployed AI engineer',
    summary: 'Learn a customer’s real workflow, build the smallest AI slice that proves the idea, and carry it through a measured pilot.',
    goodFitIf: [
      'You want to work close to users in messy, real environments.',
      'You enjoy moving between discovery, building, evaluation and rollout.',
      'You can explain trade-offs to engineers and to the people who run the business.',
    ],
    responsibilities: [
      'Watch the real workflow and agree the outcome with its users.',
      'Map assumptions, constraints, data access and failure risks.',
      'Build a narrow vertical slice that tests the core claim end to end.',
      'Define success metrics, rollout steps and the feedback loop.',
    ],
    topics: [
      'genai-fundamentals',
      'prompt-fundamentals',
      'structured-outputs-tools',
      'embeddings',
      'document-ingestion',
      'rag-fundamentals',
      'llm-evaluation',
      'agent-fundamentals',
      'ai-applications',
      'privacy-guardrails',
      'cost-caching',
      'production-deployment',
      'ai-architecture-fundamentals',
      'ai-product-delivery',
    ],
  },
  {
    id: 'building-and-deploying-ai-applications',
    title: 'Building and deploying AI apps',
    summary: 'Take one AI feature from prompt and structured output through retrieval and evaluation to a monitored production release.',
    goodFitIf: [
      'You are a software engineer adding AI features to a real product.',
      'You want one end-to-end route rather than a deep specialism.',
      'You care about what happens after launch as much as before.',
    ],
    responsibilities: [
      'Write prompts and schemas the rest of the code can rely on.',
      'Ground answers in your own data with retrieval.',
      'Evaluate, guard and cost the feature before it ships.',
      'Release it gradually, watch it and keep it up under load.',
    ],
    topics: [
      'genai-fundamentals',
      'prompt-fundamentals',
      'structured-outputs-tools',
      'llm-apis-streaming',
      'embeddings',
      'context-engineering',
      'rag-fundamentals',
      'llm-evaluation',
      'privacy-guardrails',
      'observability',
      'cost-caching',
      'reliability-async',
      'production-deployment',
    ],
  },
  {
    id: 'using-coding-agents',
    title: 'Using coding agents',
    summary: 'Frame, plan, delegate, verify and review coding-agent work inside a real repository.',
    goodFitIf: [
      'You already write code and want agents to do more of it safely.',
      'You want repeatable results, not lucky one-shot prompts.',
      'You care about reviewing and verifying what an agent changed.',
    ],
    responsibilities: [
      'Frame the task and its limits before any code is written.',
      'Give the agent the right context, instructions and skills.',
      'Gate its work with tests, review and human approval.',
      'Keep secrets and tools safe from injected instructions.',
    ],
    topics: [
      'genai-fundamentals',
      'prompt-fundamentals',
      'prompt-reasoning',
      'structured-outputs-tools',
      'context-engineering',
      'agent-fundamentals',
      'planning-decomposition',
      'agent-memory-tools',
      'hitl-state-machines',
      'agent-evaluation-safety',
      'mcp',
      'agent-skills',
      'coding-agents',
      'ai-security-injection',
    ],
  },
  {
    id: 'model-context-protocol',
    title: 'MCP',
    summary: 'Build, secure and operate Model Context Protocol servers and clients, from JSON-RPC messages to production gateways.',
    goodFitIf: [
      'You want to connect models to tools and data in a standard way.',
      'You like protocols, schemas and clear boundaries between systems.',
      'You care about who may call which tool, and how to prove it.',
    ],
    responsibilities: [
      'Expose tools, resources and prompts with precise schemas.',
      'Choose transports and handle discovery, errors and cancellation.',
      'Treat tool metadata as untrusted and authorise every call.',
      'Trace, rate-limit and roll out servers like any other service.',
    ],
    topics: [
      'genai-fundamentals',
      'prompt-fundamentals',
      'structured-outputs-tools',
      'llm-apis-streaming',
      'agent-fundamentals',
      'agent-memory-tools',
      'mcp',
      'modern-agent-stack',
      'agent-skills',
      'ai-security-injection',
      'privacy-guardrails',
      'observability',
      'reliability-async',
    ],
  },
];

export const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]));

/** the chosen role's ordered topic ids ([] when none or unknown) */
export const roleTopicIds = (id: string | undefined) => (id ? (ROLE_BY_ID.get(id)?.topics ?? []) : []);

export interface PathStatus {
  passed: number;
  total: number;
  /** every topic exam in the path is passed */
  certified: boolean;
  /** when the last of them was first passed (ISO), once certified */
  completedAt?: string;
}

/** exams passed in a path, and whether it earns its (local, self-issued) certificate */
export function pathStatus(p: Pick<Progress, 'tests'>, role: Pick<Role, 'topics'>): PathStatus {
  const dates = role.topics.map((id) => p.tests[id]?.passedAt).filter((d): d is string => !!d);
  const certified = role.topics.length > 0 && dates.length === role.topics.length;
  return { passed: dates.length, total: role.topics.length, certified, completedAt: certified ? dates.sort().at(-1) : undefined };
}

/** paths whose every topic exam is passed (the Path finisher badge) */
export const pathsCertified = (p: Pick<Progress, 'tests'>, roles: Pick<Role, 'topics'>[] = ROLES) => roles.filter((r) => pathStatus(p, r).certified).length;
