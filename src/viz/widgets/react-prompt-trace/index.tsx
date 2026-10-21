import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, MAX_STEPS, MIN_STEPS, SCENARIOS, STOP_SEQUENCE, simulate, type LineKind, type Params, type ScenarioId, type Stage, type Who } from './sim';

const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

const WHO: Record<Who, { tag: string; fill: string; stroke: string }> = {
  system: { tag: 'PROMPT', fill: 'var(--surface-2)', stroke: 'var(--border)' },
  model: { tag: 'MODEL', fill: 'var(--accent-soft)', stroke: 'var(--accent)' },
  runtime: { tag: 'CODE', fill: 'var(--warn-soft)', stroke: 'var(--warn)' },
};
const kindColor = (k: LineKind) => (k === 'final' ? 'var(--good)' : k === 'stop' ? 'var(--bad)' : undefined);

const LOOP: { id: string; label: string; who: string; stages: Stage[] }[] = [
  { id: 'thought', label: 'Thought', who: 'model', stages: ['model', 'final'] },
  { id: 'action', label: 'Action', who: 'model', stages: ['model'] },
  { id: 'halt', label: `stop at "${STOP_SEQUENCE}"`, who: 'API stop sequence', stages: ['halt'] },
  { id: 'obs', label: 'Observation', who: 'runtime runs tool', stages: ['runtime'] },
];

const ROWS = 11;
const RX = 430;

export default function ReactPromptTraceViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const sc = SCENARIOS[params.scenario];
  const rows = f.lines.slice(-ROWS);
  const hidden = f.lines.length - rows.length;
  const c = f.checks;

  const checks: { label: string; state: 'ok' | 'stop' | 'success' }[] = [
    { label: 'Final Answer written?', state: c.finalAnswer ? 'success' : 'ok' },
    { label: `steps left: ${Math.max(0, c.stepsLeft)} / ${params.maxSteps}`, state: f.outcome === 'max-steps' ? 'stop' : 'ok' },
    { label: 'same action repeated?', state: c.repeated ? 'stop' : 'ok' },
  ];

  const aria = `ReAct prompt trace, scenario ${sc.label}, ${f.calls} model calls of max ${params.maxSteps}, outcome ${f.outcome}. Latest line: ${f.lines[f.lines.length - 1].text}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<ScenarioId>
            label="Question"
            value={params.scenario}
            options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
            onChange={(scenario) => setParams((p) => ({ ...p, scenario }))}
          />
          <Slider label="Step limit" value={params.maxSteps} min={MIN_STEPS} max={MAX_STEPS} onChange={(maxSteps) => setParams((p) => ({ ...p, maxSteps }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--border)' }} /> fixed prompt text
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> written by the model
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> appended by your code
          <span className="viz-key" style={{ background: 'var(--good)' }} /> final answer
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> stop condition
        </>
      }
    >
      <WideSvg label="ReAct prompt trace">
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          <text x={8} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            the prompt, as the model sees it on the next call{hidden ? ` · ${hidden} earlier lines hidden` : ''}
          </text>
          {rows.map((l, r) => {
            const w = WHO[l.who];
            const y = 24 + r * 25;
            const last = r === rows.length - 1 && f.stage !== 'intro';
            const accent = kindColor(l.kind);
            return (
              <g key={hidden + r}>
                <rect x={6} y={y} width={412} height={21} rx={5} fill={accent ? (l.kind === 'final' ? 'var(--good-soft)' : 'var(--bad-soft)') : w.fill} stroke={accent ?? w.stroke} strokeWidth={last ? 2 : 1} />
                <rect x={11} y={y + 4} width={46} height={13} rx={6} fill="var(--surface)" stroke={w.stroke} />
                <text x={34} y={y + 13.5} textAnchor="middle" fontSize={8} fontWeight={700} style={{ fill: l.who === 'system' ? 'var(--text-2)' : w.stroke }}>
                  {w.tag}
                </text>
                <text x={64} y={y + 14.5} fontSize={9.5} style={{ fontFamily: l.kind === 'action' || l.kind === 'obs' ? 'var(--mono)' : 'var(--sans)', fill: accent ?? 'var(--text)' }}>
                  {short(l.text, 66)}
                </text>
              </g>
            );
          })}

          {/* one step of the loop */}
          <text x={RX} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            one step
          </text>
          {LOOP.map((n, i) => {
            const on = n.stages.includes(f.stage);
            const y = 24 + i * 34;
            const isHalt = n.id === 'halt';
            return (
              <g key={n.id}>
                {i > 0 && <path d={`M ${RX + 82} ${y - 10} L ${RX + 82} ${y}`} stroke="var(--border)" strokeWidth={2} />}
                <rect
                  x={RX}
                  y={y}
                  width={164}
                  height={24}
                  rx={isHalt ? 4 : 12}
                  fill={on ? (isHalt ? 'var(--bad-soft)' : n.id === 'obs' ? 'var(--warn-soft)' : 'var(--accent-soft)') : 'var(--surface-2)'}
                  stroke={on ? (isHalt ? 'var(--bad)' : n.id === 'obs' ? 'var(--warn)' : 'var(--accent)') : 'var(--border)'}
                  strokeWidth={on ? 2 : 1}
                  strokeDasharray={isHalt ? '4 3' : undefined}
                />
                <text x={RX + 8} y={y + 15.5} fontSize={9.5} fontWeight={700}>
                  {n.label}
                </text>
                <text x={RX + 158} y={y + 15.5} textAnchor="end" fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                  {isHalt ? '' : n.who}
                </text>
              </g>
            );
          })}
          <text x={RX} y={170} fontSize={9} style={{ fill: 'var(--text-2)' }}>
            ↻ repeat until a stop check fires
          </text>

          {/* stop checks */}
          <text x={RX} y={196} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            stop checks (in code)
          </text>
          {checks.map((ch, i) => {
            const y = 204 + i * 24;
            const color = ch.state === 'success' ? 'var(--good)' : ch.state === 'stop' ? 'var(--bad)' : 'var(--text-2)';
            return (
              <g key={ch.label}>
                <rect x={RX} y={y} width={164} height={20} rx={5} fill={ch.state === 'ok' ? 'var(--surface-2)' : ch.state === 'success' ? 'var(--good-soft)' : 'var(--bad-soft)'} stroke={ch.state === 'ok' ? 'var(--border)' : color} />
                <text x={RX + 8} y={y + 14} fontSize={9.5}>
                  {ch.label}
                </text>
                <text x={RX + 156} y={y + 14.5} textAnchor="end" fontSize={11} fontWeight={800} style={{ fill: color }}>
                  {ch.state === 'success' ? '✓' : ch.state === 'stop' ? '■' : '·'}
                </text>
              </g>
            );
          })}
          <text x={RX} y={296} fontSize={10.5} fontWeight={700}>
            model calls: {f.calls} / {params.maxSteps}
          </text>
          {f.outcome !== 'running' && (
            <text x={RX} y={318} fontSize={12} fontWeight={800} style={{ fill: f.outcome === 'answered' ? 'var(--good)' : 'var(--bad)' }}>
              {f.outcome === 'answered' ? '✓ answered' : f.outcome === 'repeat' ? '■ stopped: repeat' : '■ stopped: step limit'}
            </text>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
