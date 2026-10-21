import { useState } from 'react';
import { Choice, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, SCENARIOS, simulate, type EntryKind, type GraderMode, type Params, type ScenarioId, type Verdict } from './sim';

const KIND: Record<EntryKind, { label: string; fill: string; stroke: string }> = {
  task: { label: 'TASK', fill: 'var(--surface-2)', stroke: 'var(--border)' },
  thought: { label: 'THOUGHT', fill: 'var(--accent-soft)', stroke: 'var(--accent)' },
  call: { label: 'CALL', fill: 'var(--warn-soft)', stroke: 'var(--warn)' },
  obs: { label: 'OBS', fill: 'var(--surface-2)', stroke: 'var(--text-2)' },
  final: { label: 'ANSWER', fill: 'var(--good-soft)', stroke: 'var(--good)' },
  check: { label: 'CHECK', fill: 'var(--surface-2)', stroke: 'var(--text)' },
};

const MARK: Record<Verdict, { sym: string; text: string; color: string }> = {
  ok: { sym: '✓', text: 'ok', color: 'var(--good)' },
  'bad-args': { sym: '✗', text: 'args', color: 'var(--bad)' },
  'wrong-tool': { sym: '✗', text: 'tool', color: 'var(--bad)' },
  redundant: { sym: '↻', text: 'dup', color: 'var(--warn)' },
  blocked: { sym: '⛔', text: 'blocked', color: 'var(--bad)' },
};

const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const ROW_Y = 24;
const ROW_H = 25;
const PX = 420;

export default function AgentTrajectoryEvalViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const sc = f.score;
  const outcomeOnly = params.mode === 'outcome';
  const last = f.shown[f.shown.length - 1];

  const aria = `Agent trajectory grader, scenario ${SCENARIOS[params.scenario].label}, mode ${params.mode}. ${f.shown.length} entries shown. Latest: ${last.text}. Verdict ${f.verdict}.`;

  const metrics: { label: string; value: string; ok: boolean | null; trajectory: boolean }[] = [
    { label: 'Right tool', value: `${sc.rightTool} / ${sc.calls}`, ok: sc.calls ? sc.rightTool === sc.calls : null, trajectory: true },
    { label: 'Right args', value: `${sc.rightArgs} / ${sc.calls}`, ok: sc.calls ? sc.rightArgs === sc.calls : null, trajectory: true },
    { label: 'Safety', value: sc.unsafe ? `${sc.unsafe} unsafe` : 'no unsafe calls', ok: sc.calls ? sc.unsafe === 0 : null, trajectory: true },
    { label: 'Efficiency', value: `${sc.steps} calls (opt ${sc.optimalSteps})`, ok: sc.calls ? sc.redundant === 0 : null, trajectory: true },
    { label: 'Final state', value: f.finalState, ok: f.finalState === 'pending' ? null : f.finalState === 'pass', trajectory: false },
  ];

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<ScenarioId>
            label="Run"
            value={params.scenario}
            options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
            onChange={(scenario) => setParams((p) => ({ ...p, scenario }))}
          />
          <Choice<GraderMode>
            label="Grader"
            value={params.mode}
            options={[
              { value: 'outcome', label: 'Outcome only' },
              { value: 'trajectory', label: 'Outcome + trajectory' },
            ]}
            onChange={(mode) => setParams((p) => ({ ...p, mode }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> thought
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> tool call
          <span className="viz-key" style={{ background: 'var(--text-2)' }} /> observation
          <span className="viz-key" style={{ background: 'var(--good)' }} /> correct
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> wrong / unsafe
        </>
      }
    >
      <WideSvg label="Agent trajectory grader">
        <svg viewBox="0 0 600 340" className="viz-svg" role="img" aria-label={aria}>
          <text x={8} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            agent trajectory (recorded run, replayed in a sandbox)
          </text>
          {f.shown.map((e, r) => {
            const k = KIND[e.kind];
            const m = e.verdict ? MARK[e.verdict] : null;
            const isLast = r === f.shown.length - 1;
            const bad = e.injected || e.verdict === 'blocked' || e.verdict === 'bad-args';
            const checkFail = e.kind === 'check' && f.finalState === 'fail';
            const y = ROW_Y + r * ROW_H;
            return (
              <g key={r}>
                <rect
                  x={6}
                  y={y}
                  width={400}
                  height={21}
                  rx={5}
                  fill={bad || checkFail ? 'var(--bad-soft)' : k.fill}
                  stroke={bad || checkFail ? 'var(--bad)' : k.stroke}
                  strokeWidth={isLast ? 2 : 1}
                />
                <text x={14} y={y + 14} fontSize={9} fontWeight={700} style={{ fill: e.kind === 'task' ? 'var(--text-2)' : k.stroke }}>
                  {k.label}
                </text>
                <text x={68} y={y + 14} fontSize={9.5} style={{ fontFamily: e.kind === 'call' || e.kind === 'obs' || e.kind === 'check' ? 'var(--mono)' : 'var(--sans)' }}>
                  {short(e.text, e.verdict ? 52 : 62)}
                </text>
                {m && (
                  <g>
                    <rect x={350} y={y + 3} width={52} height={15} rx={7} fill="var(--surface)" stroke={m.color} />
                    <text x={376} y={y + 14} textAnchor="middle" fontSize={9} fontWeight={700} style={{ fill: m.color }}>
                      {m.sym} {m.text}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* grader scorecard */}
          <text x={PX} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            grader scorecard
          </text>
          <rect x={PX} y={ROW_Y} width={174} height={166} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          {metrics.map((mt, i) => {
            const dim = outcomeOnly && mt.trajectory;
            const y = ROW_Y + 22 + i * 30;
            return (
              <g key={mt.label} opacity={dim ? 0.38 : 1}>
                <text x={PX + 10} y={y} fontSize={10} fontWeight={700}>
                  {mt.label}
                </text>
                <text x={PX + 10} y={y + 13} fontSize={9.5} style={{ fontFamily: 'var(--mono)', fill: 'var(--text-2)' }}>
                  {mt.value}
                </text>
                <text x={PX + 162} y={y + 6} textAnchor="end" fontSize={13} fontWeight={700} style={{ fill: mt.ok === null ? 'var(--text-2)' : mt.ok ? 'var(--good)' : 'var(--bad)' }}>
                  {mt.ok === null ? '·' : mt.ok ? '✓' : '✗'}
                </text>
              </g>
            );
          })}
          {outcomeOnly && (
            <text x={PX + 4} y={ROW_Y + 182} fontSize={9} style={{ fill: 'var(--text-2)' }}>
              dimmed = ignored by an outcome-only grader
            </text>
          )}

          {/* verdict */}
          <text x={PX} y={232} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            verdict ({outcomeOnly ? 'outcome only' : 'outcome + trajectory'})
          </text>
          <rect
            x={PX}
            y={240}
            width={174}
            height={44}
            rx={8}
            fill={f.verdict === 'pass' ? 'var(--good-soft)' : f.verdict === 'fail' ? 'var(--bad-soft)' : 'var(--surface-2)'}
            stroke={f.verdict === 'pass' ? 'var(--good)' : f.verdict === 'fail' ? 'var(--bad)' : 'var(--border)'}
            strokeWidth={f.verdict === 'pending' ? 1 : 2}
          />
          <text
            x={PX + 87}
            y={267}
            textAnchor="middle"
            fontSize={15}
            fontWeight={800}
            style={{ fill: f.verdict === 'pass' ? 'var(--good)' : f.verdict === 'fail' ? 'var(--bad)' : 'var(--text-2)' }}
          >
            {f.verdict === 'pending' ? 'grading…' : f.verdict === 'pass' ? '✓ PASS' : '✗ FAIL'}
          </text>
          {f.reasons.slice(0, 2).map((r, i) => (
            <text key={r} x={PX + 2} y={300 + i * 14} fontSize={9.5} style={{ fill: 'var(--bad)' }}>
              • {r}
            </text>
          ))}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
