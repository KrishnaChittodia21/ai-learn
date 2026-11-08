// Pure, deterministic trace of one request as a span tree (no React, Node-testable).
// Child spans run one after another under the root; each carries latency and, for LLM spans, token usage and cost.
// Numbers for the RAG request follow the lesson's example trace; the agent request is illustrative.
import type { BaseFrame } from '../../core';

export type ScenarioId = 'rag' | 'agent';

export interface Params {
  scenario: ScenarioId;
  /** latency of the tool span in the agent scenario, ms */
  toolMs: number;
}

export const DEFAULT_PARAMS: Params = { scenario: 'agent', toolMs: 300 };
export const MIN_TOOL_MS = 100;
export const MAX_TOOL_MS = 3000;

export const SCENARIO_LABELS: Record<ScenarioId, string> = { rag: 'RAG request', agent: 'Agent with a tool call' };

/** illustrative prices, $ per 1M tokens */
export const PRICE = { in: 3, out: 15 };

export type Kind = 'embed' | 'retriever' | 'reranker' | 'llm' | 'tool' | 'guardrail';

export interface Span {
  id: string;
  name: string;
  kind: Kind;
  ms: number;
  /** offset from the root's start, ms */
  start: number;
  attrs: string;
  inTok?: number;
  outTok?: number;
  /** $; only LLM spans are priced */
  cost: number;
}

export interface Trace {
  root: { name: string; attrs: string; ms: number };
  spans: Span[];
}

export const costOf = (inTok = 0, outTok = 0) => (inTok * PRICE.in + outTok * PRICE.out) / 1e6;

type Raw = Omit<Span, 'start' | 'cost'>;

export function buildTrace({ scenario, toolMs }: Params): Trace {
  const tool = Math.max(MIN_TOOL_MS, Math.min(MAX_TOOL_MS, Math.round(toolMs)));
  const raw: Raw[] =
    scenario === 'rag'
      ? [
          { id: 'embed', name: 'embed text-embedding-3-small', kind: 'embed', ms: 38, attrs: '12 tok' },
          { id: 'retrieve', name: 'retrieve qdrant:policies', kind: 'retriever', ms: 95, attrs: 'top_k=20 hits=20' },
          { id: 'rerank', name: 'rerank bge-reranker-v2', kind: 'reranker', ms: 140, attrs: 'kept=5' },
          { id: 'chat', name: 'chat gpt-5-mini', kind: 'llm', ms: 1920, attrs: 'TTFT 610 ms, finish=stop', inTok: 3120, outTok: 64 },
          { id: 'guardrail', name: 'guardrail pii-output', kind: 'guardrail', ms: 40, attrs: 'verdict=pass' },
        ]
      : [
          { id: 'retrieve', name: 'retrieve qdrant:policies', kind: 'retriever', ms: 95, attrs: 'top_k=20 hits=20' },
          { id: 'chat1', name: 'chat gpt-5-mini #1', kind: 'llm', ms: 1100, attrs: 'finish=tool_calls', inTok: 3120, outTok: 48 },
          { id: 'tool', name: 'tool get_order', kind: 'tool', ms: tool, attrs: 'order_id=A-1932' },
          { id: 'chat2', name: 'chat gpt-5-mini #2', kind: 'llm', ms: 1500, attrs: 'finish=stop', inTok: 3400, outTok: 180 },
          { id: 'guardrail', name: 'guardrail pii-output', kind: 'guardrail', ms: 40, attrs: 'verdict=pass' },
        ];
  let t = 0;
  const spans = raw.map((r) => {
    const s: Span = { ...r, start: t, cost: r.kind === 'llm' ? costOf(r.inTok, r.outTok) : 0 };
    t += r.ms;
    return s;
  });
  // root = children + request overhead (the lesson's RAG trace totals 2.31 s)
  const overhead = scenario === 'rag' ? 77 : 60;
  return { root: { name: 'POST /ask', attrs: 'tenant=acme prompt=v14', ms: t + overhead }, spans };
}

export const slowest = (tr: Trace) => tr.spans.reduce((a, b) => (b.ms > a.ms ? b : a));
export const priciest = (tr: Trace) => tr.spans.reduce((a, b) => (b.cost > a.cost ? b : a));
export const totalCost = (tr: Trace) => tr.spans.reduce((a, s) => a + s.cost, 0);

export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`);
export const fmtCost = (c: number) => `$${c.toFixed(4)}`;

export type Stage = 'root' | 'span' | 'turn' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** child spans recorded so far */
  shown: number;
  /** span just recorded (null for root/turn/recap) */
  active: string | null;
  rootClosed: boolean;
  /** show the cost column and highlight slowest / priciest */
  reveal: boolean;
}

const KIND_NOTE: Record<Kind, string> = {
  embed: 'the embedding model and input token count are attributes.',
  retriever: 'record doc ids and scores here, not chunk text: most RAG bugs live in this span.',
  reranker: 'kept ids and the score cut-off go on the span.',
  llm: 'gen_ai.* attributes: model, finish reason, input and output tokens. Usage is what you price.',
  tool: 'the tool name and arguments; a slow external API shows up as a long bar here.',
  guardrail: 'which checks ran and the verdict.',
};

export function simulate(p: Params): Frame[] {
  const tr = buildTrace(p);
  const frames: Frame[] = [];
  const base = { rootClosed: false, reveal: false };
  frames.push({
    stage: 'root',
    shown: 0,
    active: null,
    ...base,
    caption: `One request, one trace. The root span "${tr.root.name}" opens with ${tr.root.attrs}; every step below becomes a child span with a start, an end and attributes.`,
    predict: 'Which child span do you expect to take the longest?',
  });
  tr.spans.forEach((s, k) => {
    const usage = s.inTok !== undefined ? ` ${s.inTok.toLocaleString('en-US')} in / ${s.outTok} out tokens.` : '';
    frames.push({
      stage: 'span',
      shown: k + 1,
      active: s.id,
      ...base,
      caption: `${s.name}: ${fmtMs(s.ms)}, starting at +${s.start} ms.${usage} ${s.attrs ? `(${s.attrs}) ` : ''}Span attributes: ${KIND_NOTE[s.kind]}`,
    });
  });
  const n = tr.spans.length;
  frames.push({
    stage: 'turn',
    shown: n,
    active: null,
    ...base,
    rootClosed: true,
    caption: `The root closes at ${fmtMs(tr.root.ms)}. The waterfall shows where time went; cost is not on the bars. Find the span that cost the most money.`,
  });
  const slow = slowest(tr);
  const rich = priciest(tr);
  const total = totalCost(tr);
  frames.push({
    stage: 'recap',
    shown: n,
    active: null,
    ...base,
    rootClosed: true,
    reveal: true,
    caption: `Slowest: ${slow.name} (${fmtMs(slow.ms)}, ${Math.round((slow.ms / tr.root.ms) * 100)}% of the request). Most expensive: ${rich.name} (${fmtCost(rich.cost)} of ${fmtCost(total)}). ${
      slow.id === rich.id
        ? 'Here one span is both, so it is the first place to optimise.'
        : 'They are different spans: fix latency where the bar is long, fix cost where the tokens are.'
    }`,
  });
  return frames;
}
