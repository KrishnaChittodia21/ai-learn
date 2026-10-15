import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { DEFAULT_PARAMS, MAX_STEPS, MIN_STEPS, SCENARIOS, simulate, type EntryKind, type Params, type ScenarioId } from './sim';

const KIND: Record<EntryKind, { label: string; fill: string; stroke: string }> = {
  task: { label: 'TASK', fill: 'var(--surface-2)', stroke: 'var(--border)' },
  thought: { label: 'THOUGHT', fill: 'var(--accent-soft)', stroke: 'var(--accent)' },
  action: { label: 'ACTION', fill: 'var(--warn-soft)', stroke: 'var(--warn)' },
  obs: { label: 'OBS', fill: 'var(--surface-2)', stroke: 'var(--text-2)' },
  answer: { label: 'ANSWER', fill: 'var(--good-soft)', stroke: 'var(--good)' },
  guard: { label: 'STOP', fill: 'var(--bad-soft)', stroke: 'var(--bad)' },
};
const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

const NODES = [
  { id: 'thought', label: 'Thought', x: 497, y: 34 },
  { id: 'action', label: 'Action', x: 560, y: 116 },
  { id: 'obs', label: 'Observation', x: 434, y: 116 },
] as const;

export default function ReactAgentLoopViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const sc = SCENARIOS[params.scenario];
  const rows = f.transcript.slice(-11);
  const activeNode = f.stage === 'thought' || f.stage === 'final' ? 'thought' : f.stage === 'action' ? 'action' : f.stage === 'obs' ? 'obs' : null;
  const maxCtx = frames[frames.length - 1].contextTokens;

  const aria = `ReAct agent, scenario ${sc.label}, step ${f.iteration} of max ${params.maxSteps}, outcome ${f.outcome}. Latest: ${f.transcript[f.transcript.length - 1].text}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<ScenarioId>
            label="Scenario"
            value={params.scenario}
            options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
            onChange={(scenario) => setParams((p) => ({ ...p, scenario }))}
          />
          <Slider label="Max steps (LLM calls)" value={params.maxSteps} min={MIN_STEPS} max={MAX_STEPS} onChange={(maxSteps) => setParams((p) => ({ ...p, maxSteps }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> thought (LLM)
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> action (tool call)
          <span className="viz-key" style={{ background: 'var(--text-2)' }} /> observation (runtime)
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> error / guard
          <span className="viz-key" style={{ background: 'var(--good)' }} /> final answer
        </>
      }
    >
      <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
        {/* transcript */}
        <text x={8} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          transcript (re-sent to the LLM every step){f.transcript.length > rows.length ? ` · ${f.transcript.length - rows.length} earlier lines hidden` : ''}
        </text>
        {rows.map((e, r) => {
          const k = KIND[e.kind];
          const err = e.error;
          const last = r === rows.length - 1;
          return (
            <g key={f.transcript.length - rows.length + r}>
              <rect x={6} y={24 + r * 27} width={392} height={23} rx={5} fill={err ? 'var(--bad-soft)' : k.fill} stroke={err ? 'var(--bad)' : k.stroke} strokeWidth={last ? 2 : 1} />
              <text x={14} y={39 + r * 27} fontSize={9} fontWeight={700} style={{ fill: err ? 'var(--bad)' : k.stroke }}>
                {k.label}
              </text>
              <text x={74} y={39 + r * 27} fontSize={9.5} style={{ fontFamily: e.kind === 'action' || e.kind === 'obs' ? 'var(--mono)' : 'var(--sans)' }}>
                {short(e.text, 60)}
              </text>
            </g>
          );
        })}

        {/* loop diagram */}
        <path d="M 512 48 L 548 98" stroke="var(--border)" strokeWidth={2} fill="none" />
        <path d="M 520 116 L 478 116" stroke="var(--border)" strokeWidth={2} fill="none" />
        <path d="M 446 98 L 482 48" stroke="var(--border)" strokeWidth={2} fill="none" />
        <text x={497} y={86} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>
          ↻ until answer
        </text>
        {NODES.map((n) => {
          const on = activeNode === n.id;
          return (
            <g key={n.id}>
              <rect x={n.x - 40} y={n.y - 13} width={80} height={26} rx={13} fill={on ? (n.id === 'thought' ? 'var(--accent)' : n.id === 'action' ? 'var(--warn)' : 'var(--text-2)') : 'var(--surface-2)'} stroke="var(--border)" />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={10.5} fontWeight={700} style={{ fill: on ? 'var(--surface)' : 'var(--text)' }}>
                {n.label}
              </text>
            </g>
          );
        })}

        {/* step guard */}
        <text x={410} y={156} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          LLM calls {f.iteration} / max {params.maxSteps}
        </text>
        {Array.from({ length: params.maxSteps }, (_, i) => (
          <rect
            key={i}
            x={410 + i * (182 / params.maxSteps)}
            y={162}
            width={182 / params.maxSteps - 3}
            height={12}
            rx={3}
            fill={i < f.iteration ? (f.outcome === 'stopped' ? 'var(--bad)' : f.outcome === 'answered' && i === f.iteration - 1 ? 'var(--good)' : 'var(--accent)') : 'var(--surface-2)'}
            stroke="var(--border)"
          />
        ))}

        {/* context growth */}
        <text x={410} y={196} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          prompt size ~{f.contextTokens} tokens
        </text>
        <rect x={410} y={202} width={182} height={10} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
        <rect x={410} y={202} width={(182 * f.contextTokens) / maxCtx} height={10} rx={3} fill="var(--warn)" />

        {/* tools */}
        <text x={410} y={234} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          tools
        </text>
        {sc.tools.map((t, i) => {
          const on = f.activeTool !== null && t.startsWith(f.activeTool + '(');
          return (
            <g key={t}>
              <rect x={410} y={240 + i * 24} width={182} height={20} rx={5} fill={on ? 'var(--warn-soft)' : 'var(--surface-2)'} stroke={on ? 'var(--warn)' : 'var(--border)'} strokeWidth={on ? 2 : 1} />
              <text x={418} y={254 + i * 24} fontSize={9.5} style={{ fontFamily: 'var(--mono)' }}>
                {t}
              </text>
            </g>
          );
        })}
        {f.outcome !== 'running' && (
          <text x={410} y={322} fontSize={12} fontWeight={700} style={{ fill: f.outcome === 'answered' ? 'var(--good)' : 'var(--bad)' }}>
            {f.outcome === 'answered' ? '✓ answered' : `✕ stopped at max steps`}
          </text>
        )}
      </svg>
    </VizFrame>
  );
}
