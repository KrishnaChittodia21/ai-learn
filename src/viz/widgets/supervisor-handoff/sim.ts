// Pure, deterministic multi-agent run (no React, Node-testable). Two topologies from the Multi-Agent Systems lesson:
// - supervisor (subagents as tools): the lead writes one task spec per company, workers research in parallel in
//   their OWN context windows and return only a condensed summary, so the lead's context stays small. Token
//   figures follow the lesson's due-diligence example (4 workers: ~60K each, ~500 back, lead ~12K context,
//   ≈ 270K tokens vs ~180K single-agent, wall time ≈ the slowest worker).
// - handoff (swarm): the active agent transfers control with transfer_to_x and the user then talks to x. A guard
//   in code allow-lists targets, caps handoffs at 4 and routes A→B→A→B ping-pong to a human (the lesson's exercise).
import type { BaseFrame } from '../../core';
import type { FrameTurn as Turn } from '../_shared/yourTurn.ts';

export type Pattern = 'supervisor' | 'handoff' | 'pingpong';

export interface Params {
  pattern: Pattern;
  /** supervisor only: companies = parallel workers */
  workers: number;
}

export const DEFAULT_PARAMS: Params = { pattern: 'supervisor', workers: 4 };
export const MIN_WORKERS = 2;
export const MAX_WORKERS = 4;
export const MAX_HANDOFFS = 4;
export const COMPANIES = ['Acme', 'Globex', 'Initech', 'Umbrella'];

export const PATTERN_LABELS: Record<Pattern, string> = {
  supervisor: 'Supervisor',
  handoff: 'Handoff (swarm)',
  pingpong: 'Handoff ping-pong',
};

/** illustrative token figures (thousands), from the lesson's example */
export const WORKER_K = 60;
export const RETURN_K = 0.5;
export const LEAD_START_K = 10;
export const SINGLE_PER_COMPANY_K = 45;
export const MIN_PER_COMPANY_SINGLE = 3.5;
export const MIN_SLOWEST_WORKER = 4;

export type AgentState = 'idle' | 'active' | 'working' | 'done';

export interface Agent {
  id: string;
  label: string;
  /** tokens in this agent's own context window (thousands) */
  ctxK: number;
  state: AgentState;
}

export interface Arrow {
  from: string;
  to: string;
  label: string;
  kind: 'delegate' | 'return' | 'transfer' | 'guard' | 'user';
}

export type Stage = 'intro' | 'delegate' | 'work' | 'return' | 'synth' | 'transfer' | 'guard' | 'resolve' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  agents: Agent[];
  arrows: Arrow[];
  /** who the user is talking to right now */
  owner: string;
  /** handoff patterns: agents that have owned the turn, in order */
  history: string[];
  handoffs: number;
  /** total tokens billed so far (thousands) */
  tokensK: number;
  outcome: 'running' | 'answered' | 'human';
  yourTurn?: Turn;
}

export interface SwarmState {
  active: string;
  handoffs: number;
  history: string[];
}
export const SWARM_AGENTS = ['triage', 'billing', 'tech', 'human'];

/** Handoff guard from the lesson's exercise: unknown target → stay; > MAX handoffs or ping-pong → human. */
export function nextAgent(s: SwarmState, requested: string): SwarmState {
  if (!SWARM_AGENTS.includes(requested) || requested === s.active) return s;
  const go = (to: string): SwarmState => ({ active: to, handoffs: s.handoffs + 1, history: [...s.history, to] });
  if (s.handoffs + 1 > MAX_HANDOFFS) return go('human');
  const h = [...s.history, requested];
  const pingPong = h.length >= 4 && h.at(-1) === h.at(-3) && h.at(-2) === h.at(-4);
  return go(pingPong ? 'human' : requested);
}

export const leadTotalK = (n: number) => 18 + 3 * n;
export const multiTotalK = (n: number) => n * WORKER_K + leadTotalK(n);
export const singleTotalK = (n: number) => n * SINGLE_PER_COMPANY_K;

export function simulate(params: Params): Frame[] {
  return params.pattern === 'supervisor' ? supervisor(Math.max(MIN_WORKERS, Math.min(MAX_WORKERS, params.workers))) : swarm(params.pattern === 'pingpong');
}

function supervisor(n: number): Frame[] {
  const names = COMPANIES.slice(0, n);
  const frames: Frame[] = [];
  const agents: Agent[] = [{ id: 'lead', label: 'Supervisor', ctxK: LEAD_START_K, state: 'active' }, ...names.map((c) => ({ id: c, label: `${c} worker`, ctxK: 0, state: 'idle' as AgentState }))];
  let tokensK = 0;
  let outcome: Frame['outcome'] = 'running';
  const push = (f: Pick<Frame, 'stage' | 'caption' | 'arrows'> & { yourTurn?: Turn }) =>
    frames.push({ ...f, agents: agents.map((a) => ({ ...a })), owner: 'lead', history: [], handoffs: 0, tokensK: Math.round(tokensK * 10) / 10, outcome });
  const workers = () => agents.slice(1);

  push({
    stage: 'intro',
    arrows: [{ from: 'user', to: 'lead', label: `compare ${n} competitors`, kind: 'user' }],
    caption: `The user asks the supervisor to compare ${n} competitors (${names.join(', ')}). The supervisor has one tool, research_company, and each call runs a worker agent with its own prompt, tools and context window.`,
  });
  for (const w of workers()) w.state = 'working';
  agents[0].state = 'idle';
  push({
    stage: 'delegate',
    arrows: names.map((c) => ({ from: 'lead', to: c, label: 'task spec', kind: 'delegate' as const })),
    caption: `The supervisor writes ${n} explicit task specs, one research_company call per company ("pricing, funding, last 3 launches; return ≤ 400 words with URLs"), and makes the calls in parallel.`,
  });
  for (const w of workers()) w.ctxK = WORKER_K;
  tokensK += n * WORKER_K;
  push({
    stage: 'work',
    arrows: [],
    caption: `Each worker searches and reads in its own fresh window, about ${WORKER_K}K tokens each (${n * WORKER_K}K in total). None of that lands in the supervisor's context. Wall time is the slowest worker, not the sum.`,
    yourTurn: {
      question: `Each worker has read ~${WORKER_K}K tokens of pages. What should it send back to the supervisor?`,
      options: [
        { text: 'A condensed summary (≤ 400 words)', correct: true, why: 'Context isolation is the point: the lead only absorbs the distilled result, so its own window stays small and focused.' },
        { text: 'Its full transcript, so nothing is lost', correct: false, why: `${n} × ${WORKER_K}K tokens would flood the lead's window and bring back the "lost in the middle" problem splitting was meant to avoid.` },
        { text: 'Nothing; it posts the answer to the user', correct: false, why: 'That is the handoff pattern. With a supervisor, workers are tools: results go back to the lead, which writes the answer.' },
      ],
    },
  });
  for (const w of workers()) w.state = 'done';
  agents[0].state = 'active';
  agents[0].ctxK = LEAD_START_K + n * RETURN_K;
  push({
    stage: 'return',
    arrows: names.map((c) => ({ from: c, to: 'lead', label: '~500 tokens', kind: 'return' as const })),
    caption: `Only the condensed answers flow back: ${n} × ~${RETURN_K * 1000} tokens. The supervisor's context grows to just ~${agents[0].ctxK}K.`,
  });
  tokensK = multiTotalK(n);
  outcome = 'answered';
  push({
    stage: 'synth',
    arrows: [{ from: 'lead', to: 'user', label: 'comparison table', kind: 'user' }],
    caption: `The supervisor synthesises a comparison table and answers. Total ≈ ${n} × ${WORKER_K}K + ${leadTotalK(n)}K for the lead = ${multiTotalK(n)}K tokens.`,
  });
  push({
    stage: 'recap',
    arrows: [],
    caption: `Recap: ${multiTotalK(n)}K tokens vs ~${singleTotalK(n)}K for one agent reading everything (${(multiTotalK(n) / singleTotalK(n)).toFixed(1)}× the tokens), but wall time ≈ ${MIN_SLOWEST_WORKER} min instead of ~${MIN_PER_COMPANY_SINGLE * n} min, and no early findings lost in the middle of a huge window.`,
  });
  return frames;
}

interface SwarmStep {
  agent: string;
  says: string;
  requested: string | null;
}

const SWARM: Record<'handoff' | 'pingpong', { user: string; steps: SwarmStep[]; answer: string }> = {
  handoff: {
    user: 'I was charged twice, and the app crashes on login.',
    steps: [
      { agent: 'triage', says: 'a double charge: billing first', requested: 'billing' },
      { agent: 'billing', says: 'refunded the duplicate charge; the crash is technical', requested: 'tech' },
      { agent: 'tech', says: 'crash fixed by updating the app', requested: null },
    ],
    answer: 'Refund issued and the login crash is fixed.',
  },
  pingpong: {
    user: 'My invoice export fails with an error.',
    steps: [
      { agent: 'triage', says: 'invoices: billing', requested: 'billing' },
      { agent: 'billing', says: 'an export error sounds technical', requested: 'tech' },
      { agent: 'tech', says: 'it is an invoice permission: billing', requested: 'billing' },
      { agent: 'billing', says: 'still looks technical', requested: 'tech' },
    ],
    answer: 'A human agent picks up with the full history.',
  },
};

function swarm(pingpong: boolean): Frame[] {
  const sc = SWARM[pingpong ? 'pingpong' : 'handoff'];
  const frames: Frame[] = [];
  const agents: Agent[] = SWARM_AGENTS.map((id) => ({ id, label: id === 'human' ? 'Human' : id[0].toUpperCase() + id.slice(1), ctxK: 0, state: 'idle' as AgentState }));
  let s: SwarmState = { active: 'triage', handoffs: 0, history: ['triage'] };
  let tokensK = 0;
  let outcome: Frame['outcome'] = 'running';
  const push = (f: Pick<Frame, 'stage' | 'caption' | 'arrows'> & { yourTurn?: Turn }) => {
    for (const a of agents) a.state = a.id === s.active ? 'active' : s.history.includes(a.id) ? 'done' : 'idle';
    frames.push({ ...f, agents: agents.map((a) => ({ ...a })), owner: s.active, history: [...s.history], handoffs: s.handoffs, tokensK: Math.round(tokensK * 10) / 10, outcome });
  };
  // the conversation (shared history) moves with the turn: each new owner reads it
  const read = (id: string) => {
    const a = agents.find((x) => x.id === id)!;
    a.ctxK = 2 + s.handoffs;
    tokensK += a.ctxK;
  };

  read('triage');
  push({
    stage: 'intro',
    arrows: [{ from: 'user', to: 'triage', label: `"${sc.user}"`, kind: 'user' }],
    caption: `The user writes: "${sc.user}" Triage owns the turn. In a swarm there is no supervisor: the active agent either answers or transfers control with a transfer_to_x tool.`,
  });

  for (const step of sc.steps) {
    if (step.requested === null) {
      outcome = 'answered';
      push({
        stage: 'resolve',
        arrows: [{ from: step.agent, to: 'user', label: 'answer', kind: 'user' }],
        caption: `${cap(step.agent)}: ${step.says}. It answers the user directly; nothing goes back up a chain. History: ${s.history.join(' → ')}, ${s.handoffs} handoffs.`,
      });
      break;
    }
    const before = s;
    const after = nextAgent(s, step.requested);
    const guarded = after.active !== step.requested;
    if (guarded) {
      push({
        stage: 'guard',
        arrows: [{ from: step.agent, to: step.requested, label: `transfer_to_${step.requested}?`, kind: 'transfer' }],
        caption: `${cap(step.agent)}: "${step.says}" and calls transfer_to_${step.requested}. The handoff guard in code checks the request before control moves.`,
        yourTurn: {
          question: `History so far: ${before.history.join(' → ')}. ${cap(step.agent)} asks to transfer to ${step.requested} again. What should the guard do?`,
          options: [
            { text: 'Route to a human', correct: true, why: `${[...before.history, step.requested].slice(-4).join(' → ')} alternates: the agents are ping-ponging, so the guard ends the loop with a human fallback.` },
            { text: `Allow it: ${step.requested} is a valid agent`, correct: false, why: 'The name is valid, but A→B→A→B means neither agent will solve it; allowing it can loop forever.' },
            { text: 'Keep the user with billing', correct: false, why: 'Billing has already said it cannot help, so staying put leaves the user stuck.' },
          ],
        },
      });
      s = after;
      read(s.active);
      outcome = 'human';
      push({
        stage: 'transfer',
        arrows: [{ from: step.agent, to: 'human', label: 'guard → human', kind: 'guard' }],
        caption: `Ping-pong detected (${s.history.slice(-4, -1).join(' → ')} → ${step.requested}?). The guard routes to a human instead, after ${s.handoffs} handoffs. ${sc.answer}`,
      });
      break;
    }
    s = after;
    read(s.active);
    push({
      stage: 'transfer',
      arrows: [{ from: step.agent, to: s.active, label: `transfer_to_${s.active}`, kind: 'transfer' }],
      caption: `${cap(step.agent)}: "${step.says}" → transfer_to_${s.active}. Control moves: the user now talks to ${cap(s.active)}, which reads the shared history. Handoff ${s.handoffs} of max ${MAX_HANDOFFS}.`,
      ...(s.handoffs === 1 && !pingpong
        ? {
            yourTurn: {
              question: 'Triage just called transfer_to_billing. Who does the user talk to next?',
              options: [
                { text: 'Billing', correct: true, why: 'A handoff transfers control: the active agent owns the turn, which keeps latency low (no extra hop back).' },
                { text: 'Triage, which relays billing’s reply', correct: false, why: 'That is the supervisor pattern, where workers are tools and results come back to the lead.' },
                { text: 'Both, in parallel', correct: false, why: 'Exactly one agent owns the turn in a swarm; parallel fan-out is a supervisor strength.' },
              ],
            },
          }
        : {}),
    });
  }

  push({
    stage: 'recap',
    arrows: [],
    caption:
      outcome === 'human'
        ? `Recap: ${s.history.join(' → ')}. Swarms put control in the agents' hands, so code owns the rails: an allow-list of targets, a handoff budget (max ${MAX_HANDOFFS}) and loop detection, with a human as the fallback.`
        : `Recap: ${s.history.join(' → ')} in ${s.handoffs} handoffs. Lower latency than a supervisor (no hop back per step), but harder to trace, and loops need a guard.`,
  });
  return frames;
}

const cap = (id: string) => id[0].toUpperCase() + id.slice(1);
