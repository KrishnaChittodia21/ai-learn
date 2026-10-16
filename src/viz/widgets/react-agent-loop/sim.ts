// Pure, deterministic ReAct loop (no React, Node-testable).
// Each iteration is one LLM call that emits a Thought and either an Action (tool + args) or a Final Answer.
// The runtime executes the tool and appends the Observation to the transcript, which is re-sent on the next call
// (so the prompt grows every step). A max-steps guard stops runaway loops.
import type { BaseFrame } from '../../core';

export type ScenarioId = 'weather' | 'order' | 'stuck';

export interface Params {
  scenario: ScenarioId;
  maxSteps: number;
}

export const DEFAULT_PARAMS: Params = { scenario: 'weather', maxSteps: 5 };
export const MIN_STEPS = 3;
export const MAX_STEPS = 8;

export interface Step {
  thought: string;
  tool: string;
  args: string;
  obs: string;
  error?: boolean;
}

export interface Scenario {
  label: string;
  task: string;
  tools: string[];
  steps: Step[];
  final: { thought: string; answer: string } | null;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  weather: {
    label: 'Weather + maths',
    task: 'What is the temperature in Paris right now, in Fahrenheit?',
    tools: ['get_weather(city)', 'calculator(expr)', 'web_search(q)'],
    steps: [
      { thought: 'I need the current weather in Paris.', tool: 'get_weather', args: '"Paris"', obs: 'ERROR: upstream timeout after 10 s', error: true },
      { thought: 'The tool timed out; that looks transient. Retry once.', tool: 'get_weather', args: '"Paris"', obs: '{"temp_c": 18, "conditions": "cloudy"}' },
      { thought: 'It is 18 °C. Convert: F = C × 9/5 + 32. Do not do maths in my head.', tool: 'calculator', args: '"18 * 9 / 5 + 32"', obs: '64.4' },
    ],
    final: { thought: 'I have everything I need.', answer: 'It is about 64 °F (18 °C) and cloudy in Paris.' },
  },
  order: {
    label: 'Cancel an order',
    task: 'Has order #4512 shipped? If not, cancel it.',
    tools: ['get_order(id)', 'cancel_order(id)', 'request_cancellation(id, reason)'],
    steps: [
      { thought: 'First check the order status.', tool: 'get_order', args: '4512', obs: '{"status": "processing", "picking_started": true}' },
      { thought: 'Not shipped yet, so cancel it.', tool: 'cancel_order', args: '4512', obs: 'ERROR 409: order locked while warehouse is picking', error: true },
      {
        thought: 'Direct cancel is blocked. Retrying will fail the same way; use the fallback that asks the warehouse.',
        tool: 'request_cancellation',
        args: '4512, "customer request"',
        obs: '{"ticket": "T-88", "eta": "within 2 h if not yet shipped"}',
      },
    ],
    final: { thought: 'Cancellation is requested; report honestly that it is not yet confirmed.', answer: 'Order #4512 has not shipped. It could not be cancelled directly (picking had started), so I filed request T-88; the warehouse will cancel it within 2 hours if it has not shipped.' },
  },
  stuck: {
    label: 'Unanswerable (loops)',
    task: "What was Acme Robotics' revenue in 2019?",
    tools: ['web_search(q)', 'fetch_page(url)'],
    steps: [
      { thought: 'Search for the figure.', tool: 'web_search', args: '"Acme Robotics 2019 revenue"', obs: '0 results' },
      { thought: 'Try the annual report instead.', tool: 'web_search', args: '"Acme Robotics annual report 2019"', obs: '0 results' },
      { thought: 'Maybe a broader query helps.', tool: 'web_search', args: '"Acme revenue"', obs: '3 results, all about Acme Corp (a different company)' },
      { thought: 'Those are the wrong company. Rephrase again.', tool: 'web_search', args: '"Acme Robotics revenue 2019"', obs: '0 results' },
    ],
    final: null,
  },
};

export type Stage = 'intro' | 'prompt' | 'thought' | 'action' | 'obs' | 'final' | 'guard' | 'done';
export type EntryKind = 'task' | 'thought' | 'action' | 'obs' | 'answer' | 'guard';

export interface Entry {
  kind: EntryKind;
  text: string;
  error?: boolean;
}

export interface Frame extends BaseFrame {
  stage: Stage;
  /** LLM calls made so far */
  iteration: number;
  transcript: Entry[];
  /** approximate prompt tokens of the latest LLM call */
  contextTokens: number;
  activeTool: string | null;
  outcome: 'running' | 'answered' | 'stopped';
}

const tok = (s: string) => Math.ceil(s.length / 4);

function stepAt(s: Scenario, i: number): Step | null {
  if (i < s.steps.length) return s.steps[i];
  if (s.final) return null;
  // stuck scenario: the model keeps rephrasing the same search
  const k = i % 2;
  return k === 0
    ? { thought: 'Still nothing. Try yet another phrasing.', tool: 'web_search', args: `"Acme Robotics earnings ${2019 + (i % 3) - 1}"`, obs: '0 results' }
    : { thought: 'Search again with the original query.', tool: 'web_search', args: '"Acme Robotics 2019 revenue"', obs: '0 results' };
}

export function simulate({ scenario, maxSteps }: Params): Frame[] {
  const s = SCENARIOS[scenario];
  const frames: Frame[] = [];
  const transcript: Entry[] = [{ kind: 'task', text: s.task }];
  const SYSTEM = 220;
  let ctx = SYSTEM + tok(s.task);
  let iteration = 0;
  let outcome: Frame['outcome'] = 'running';
  const push = (f: { stage: Stage; caption: string; predict?: string; activeTool?: string | null }) =>
    frames.push({ iteration, transcript: [...transcript], contextTokens: ctx, activeTool: null, outcome, ...f });

  push({ stage: 'intro', caption: `Task: "${s.task}" The agent may call: ${s.tools.join(', ')}. Max steps (LLM calls) = ${maxSteps}.` });
  push({
    stage: 'prompt',
    caption: `The system prompt (~${SYSTEM} tokens) lists the tools with JSON schemas and the format: Thought → Action → (runtime adds Observation) → … → Final Answer. The LLM never runs tools itself; the runtime does.`,
    predict: scenario === 'stuck' ? 'No source on the web has this number. What will the agent do if nothing stops it?' : `How many LLM calls do you think this task needs, including the final answer?`,
  });

  let i = 0;
  let predictedError = false;
  while (true) {
    if (iteration >= maxSteps) {
      outcome = 'stopped';
      transcript.push({ kind: 'guard', text: `Stopped: reached max steps (${maxSteps})` });
      push({
        stage: 'guard',
        caption: s.final
          ? `Guard trips: ${maxSteps} LLM calls used and no final answer yet. The runtime stops and returns a graceful failure, even though the agent was ${i >= s.steps.length ? 'one call' : `${s.steps.length - i + 1} calls`} away from finishing. Size the limit for the task.`
          : `Guard trips after ${maxSteps} LLM calls. Without it the agent would keep rephrasing forever, burning ~${ctx} tokens per call. Return "I could not find this" (or hand off to a human) instead.`,
      });
      break;
    }
    const step = stepAt(s, i);
    iteration++;
    if (!step) {
      const fin = s.final!;
      const promptIn = ctx;
      transcript.push({ kind: 'thought', text: fin.thought });
      ctx += tok(fin.thought);
      push({ stage: 'thought', caption: `Step ${iteration}: LLM call #${iteration} reads a ~${promptIn}-token prompt (everything so far) and writes: Thought: "${fin.thought}"` });
      transcript.push({ kind: 'answer', text: fin.answer });
      outcome = 'answered';
      push({ stage: 'final', caption: `Final Answer: "${fin.answer}" The loop ends after ${iteration} LLM calls and ${i} tool calls.` });
      break;
    }
    const promptIn = ctx;
    transcript.push({ kind: 'thought', text: step.thought });
    ctx += tok(step.thought);
    push({ stage: 'thought', caption: `Step ${iteration}: LLM call #${iteration} reads a ~${promptIn}-token prompt (everything so far) and writes: Thought: "${step.thought}"` });
    transcript.push({ kind: 'action', text: `${step.tool}(${step.args})` });
    ctx += tok(step.tool + step.args) + 10;
    const nextErr = !!step.error && !predictedError;
    push({
      stage: 'action',
      activeTool: step.tool,
      caption: `Action: ${step.tool}(${step.args}). The runtime validates the arguments against the tool schema and executes it.`,
      predict: nextErr ? 'Tools fail in production. If this call errors, should the agent retry, try something else, or give up?' : undefined,
    });
    if (nextErr) predictedError = true;
    transcript.push({ kind: 'obs', text: step.obs, error: step.error });
    ctx += tok(step.obs);
    push({
      stage: 'obs',
      activeTool: step.tool,
      caption: step.error
        ? `Observation: ${step.obs}. The error is fed back as text instead of crashing the loop, so the model can reason about recovery.`
        : `Observation: ${step.obs}. Appended to the transcript; the next LLM call sees everything so far.`,
      predict: !s.final && i === 1 ? 'Two empty searches. What will the agent try next, and is it actually making progress?' : undefined,
    });
    i++;
  }
  push({
    stage: 'done',
    caption:
      outcome === 'answered'
        ? `Recap: ${iteration} LLM calls; the transcript re-sent each call grew from ~${SYSTEM + tok(s.task)} to ~${ctx} tokens. ReAct's power is interleaving reasoning with real observations; its costs are latency and tokens per step. Errors as observations enable recovery.`
        : s.final
          ? `Recap: the guard did its job but was set too tight for a ${s.steps.length + 1}-call task. Raise max steps, or pair it with a token/cost budget so legitimate multi-step tasks can finish.`
          : `Recap: production agents need a step limit, a token/cost budget, repeated-action detection (the same search was tried more than once), and a clear "cannot complete" path.`,
  });
  return frames;
}
