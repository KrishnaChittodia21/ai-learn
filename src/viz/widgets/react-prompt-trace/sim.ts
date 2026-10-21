// Pure, deterministic ReAct prompt trace (no React, Node-testable).
// Classic text-based ReAct: the prompt lists tools and the Thought / Action / Observation format. Each model
// call writes a Thought and an Action, and generation is cut at the stop sequence "Observation:". The runtime
// parses the Action, runs the tool and appends "Observation: …" to the prompt. After every step the runtime
// checks three stop conditions: Final Answer written, step limit reached, or the same action repeated.
import type { BaseFrame } from '../../core';

export type ScenarioId = 'answer' | 'repeat';
export type Who = 'system' | 'model' | 'runtime';
export type LineKind = 'tools' | 'format' | 'question' | 'thought' | 'action' | 'obs' | 'final' | 'stop';

export interface Params {
  scenario: ScenarioId;
  maxSteps: number;
}

export const DEFAULT_PARAMS: Params = { scenario: 'answer', maxSteps: 5 };
export const MIN_STEPS = 2;
export const MAX_STEPS = 6;
export const STOP_SEQUENCE = 'Observation:';

export interface Line {
  who: Who;
  kind: LineKind;
  text: string;
}

interface Step {
  thought: string;
  action: string;
  obs: string;
}

export interface Scenario {
  label: string;
  question: string;
  steps: Step[];
  final: { thought: string; answer: string } | null;
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  answer: {
    label: 'Answers in 4 steps',
    question: 'How many years passed between the first crewed Moon landing and the first iPhone release?',
    steps: [
      { thought: 'I need the year of the first crewed Moon landing.', action: 'search[first crewed Moon landing year]', obs: 'Apollo 11 landed on 20 July 1969.' },
      { thought: 'Now I need the year the first iPhone was released.', action: 'search[first iPhone release date]', obs: 'The first iPhone was released on 29 June 2007.' },
      { thought: 'Subtract the years. Use the calculator, not mental maths.', action: 'calculator[2007 - 1969]', obs: '38' },
    ],
    final: { thought: 'I have both years and the difference.', answer: '38 years (1969 → 2007).' },
  },
  repeat: {
    label: 'Repeats an action',
    question: "What is the mobile number of Acme Robotics' CEO?",
    steps: [
      { thought: 'Search for the CEO and a phone number.', action: 'search[Acme Robotics CEO mobile number]', obs: 'No results.' },
      { thought: 'Maybe the search failed. Try it again.', action: 'search[Acme Robotics CEO mobile number]', obs: '' },
    ],
    final: null,
  },
};

export const HEADER: Line[] = [
  { who: 'system', kind: 'tools', text: 'Tools: search[query]: web facts · calculator[expr]: arithmetic' },
  { who: 'system', kind: 'format', text: 'Format: Thought → Action: tool[input] → Observation → … → Final Answer' },
];

export interface StopChecks {
  finalAnswer: boolean;
  stepsLeft: number;
  repeated: boolean;
}

export type Stage = 'intro' | 'model' | 'halt' | 'runtime' | 'check' | 'final' | 'stopped' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  lines: Line[];
  /** model calls so far */
  calls: number;
  checks: StopChecks;
  outcome: 'running' | 'answered' | 'max-steps' | 'repeat';
}

export function simulate({ scenario, maxSteps }: Params): Frame[] {
  const s = SCENARIOS[scenario];
  const max = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.round(maxSteps)));
  const frames: Frame[] = [];
  const lines: Line[] = [...HEADER, { who: 'system', kind: 'question', text: `Question: ${s.question}` }];
  let calls = 0;
  const actions: string[] = [];
  let outcome: Frame['outcome'] = 'running';
  const checks = (): StopChecks => ({ finalAnswer: outcome === 'answered', stepsLeft: max - calls, repeated: outcome === 'repeat' });
  const push = (f: { stage: Stage; caption: string; predict?: string }) => frames.push({ lines: [...lines], calls, checks: checks(), outcome, ...f });

  push({
    stage: 'intro',
    caption: `The prompt holds tool descriptions, the Thought / Action / Observation format, the question, and a step limit of ${max}. The model never runs a tool: it only writes text that names one.`,
    predict: 'Who writes the "Observation:" lines: the model or your code?',
  });

  for (let i = 0; ; i++) {
    if (calls >= max) {
      outcome = 'max-steps';
      lines.push({ who: 'runtime', kind: 'stop', text: `Stopped: step limit (${max}) reached without a Final Answer.` });
      push({ stage: 'stopped', caption: `Stop condition: ${max} model calls used and still no Final Answer. The runtime ends the loop and returns a graceful "could not finish" instead of looping on.` });
      break;
    }
    const step = s.steps[i];
    if (!step && s.final) {
      calls++;
      lines.push({ who: 'model', kind: 'thought', text: `Thought: ${s.final.thought}` });
      lines.push({ who: 'model', kind: 'final', text: `Final Answer: ${s.final.answer}` });
      outcome = 'answered';
      push({ stage: 'final', caption: `Model call ${calls} writes a Thought and "Final Answer:" instead of an Action. That line is the success stop condition: the runtime returns the answer and the loop ends.` });
      break;
    }
    if (!step) break;
    calls++;
    lines.push({ who: 'model', kind: 'thought', text: `Thought: ${step.thought}` });
    lines.push({ who: 'model', kind: 'action', text: `Action: ${step.action}` });
    push({
      stage: 'model',
      caption: `Model call ${calls} continues the prompt: "Thought: ${step.thought}" then "Action: ${step.action}".`,
    });
    push({
      stage: 'halt',
      caption: `Generation halts at the stop sequence "${STOP_SEQUENCE}". Without it the model would happily invent the tool result itself, a hallucinated observation.`,
      predict: i === 0 ? 'The runtime now parses the Action line. What should it check before running the tool?' : undefined,
    });
    const repeated = actions.includes(step.action);
    actions.push(step.action);
    if (repeated) {
      outcome = 'repeat';
      lines.push({ who: 'runtime', kind: 'stop', text: `Stopped: identical action repeated (${step.action}).` });
      push({
        stage: 'stopped',
        caption: `Stop condition: this exact Action already ran and returned "No results". Running it again cannot help, so the runtime stops early instead of spending the remaining ${max - calls} steps, and answers "I could not find this".`,
      });
      break;
    }
    lines.push({ who: 'runtime', kind: 'obs', text: `Observation: ${step.obs}` });
    push({
      stage: 'runtime',
      caption: `The runtime checks the tool name and argument, runs ${step.action.split('[')[0]}, and appends "Observation: ${step.obs}" to the prompt. The next model call re-reads everything above.`,
    });
    push({
      stage: 'check',
      caption: `Stop checks after step ${calls}: Final Answer? no · steps left ${max - calls} of ${max} · repeated action? no. Continue.`,
      predict: scenario === 'repeat' && i === 0 ? 'The search found nothing. What will the model try next, and should the runtime allow it?' : undefined,
    });
  }

  push({
    stage: 'recap',
    caption:
      outcome === 'answered'
        ? `Recap: ${calls} model calls and ${actions.length} tool calls. ReAct grounds each reasoning step in a real observation. The prompt grows every step, so cost grows too; production agents use native tool calling for the same loop (see the Agents phase).`
        : outcome === 'repeat'
          ? 'Recap: a step limit alone would have wasted every remaining step. Detect repeated actions, cap steps and tokens, and give the model an explicit "I cannot find this" way out in the prompt.'
          : `Recap: the limit of ${max} was too tight for a ${s.steps.length + 1}-step task. Size the step limit from real traces, and pair it with a token budget.`,
  });
  return frames;
}
