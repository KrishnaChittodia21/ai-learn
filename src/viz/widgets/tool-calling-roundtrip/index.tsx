import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, MAX_ITER, MIN_ITER, SCENARIO_LABELS, TOOL_SCENARIOS, simulate, type Lane, type Msg, type Params, type ScenarioId, type Tone } from './sim';

const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

const TONE: Record<Tone, { fill: string; stroke: string; text: string }> = {
  neutral: { fill: 'var(--surface-2)', stroke: 'var(--border)', text: 'var(--text-2)' },
  accent: { fill: 'var(--accent-soft)', stroke: 'var(--accent)', text: 'var(--accent)' },
  good: { fill: 'var(--good-soft)', stroke: 'var(--good)', text: 'var(--good)' },
  warn: { fill: 'var(--warn-soft)', stroke: 'var(--warn)', text: 'var(--warn)' },
  bad: { fill: 'var(--bad-soft)', stroke: 'var(--bad)', text: 'var(--bad)' },
};

function msgStyle(m: Msg): { label: string; tone: Tone } {
  if (m.error) return { label: 'ERROR', tone: 'bad' };
  switch (m.kind) {
    case 'system':
      return { label: 'SYSTEM', tone: 'neutral' };
    case 'user':
      return { label: 'USER', tone: 'neutral' };
    case 'tool_call':
      return { label: 'ASSISTANT', tone: 'warn' };
    case 'tool_result':
      return { label: 'RESULT', tone: 'accent' };
    default:
      return { label: 'ASSISTANT', tone: 'good' };
  }
}

const LANES: { id: Lane; x: number; name: string }[] = [
  { id: 'model', x: 6, name: 'Model' },
  { id: 'app', x: 230, name: 'App' },
  { id: 'tool', x: 454, name: 'Tool' },
];
const LANE_W = 140;
const MAX_ROWS = 9;

export default function ToolCallingRoundtripViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const structured = params.scenario === 'structured';
  const toolNames = params.scenario === 'structured' ? 'no tools' : TOOL_SCENARIOS[params.scenario].tools.map((t) => t.name).join(', ');
  const sub: Record<Lane, string> = { model: 'LLM API (stateless)', app: 'your code: the loop', tool: short(toolNames, 26) };
  const rows = f.messages.slice(-MAX_ROWS);
  const hidden = f.messages.length - rows.length;
  const maxTotal = Math.max(1, frames[frames.length - 1].totalTokens);
  const tone = f.detail ? TONE[f.detail.tone] : TONE.neutral;

  // arrow geometry between adjacent lanes
  let arrow: { x1: number; x2: number; mid: number } | null = null;
  if (f.arrow) {
    const pair = [f.arrow.from, f.arrow.to].sort().join('-');
    const [l, r] = pair === 'app-model' ? [6 + LANE_W, 230] : [230 + LANE_W, 454];
    const leftToRight = f.arrow.from === 'model' || (f.arrow.from === 'app' && f.arrow.to === 'tool');
    arrow = leftToRight ? { x1: l + 4, x2: r - 6, mid: (l + r) / 2 } : { x1: r - 4, x2: l + 6, mid: (l + r) / 2 };
  }

  const lastMsg = f.messages[f.messages.length - 1];
  const aria = `Tool-calling round trip, scenario ${SCENARIO_LABELS[params.scenario]}. Model calls ${f.modelCalls} of max ${params.maxIterations}; stop reason ${f.stopReason ?? 'none yet'}; outcome ${f.outcome}. ${f.messages.length} messages, latest ${lastMsg.role}: ${lastMsg.text}.${f.arrow ? ` Now: ${f.arrow.from} to ${f.arrow.to}, ${f.arrow.label}.` : ''}${f.detail ? ` Panel: ${f.detail.title}.` : ''}`;

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
            options={(Object.keys(SCENARIO_LABELS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIO_LABELS[k] }))}
            onChange={(scenario) => setParams((p) => ({ ...p, scenario }))}
          />
          <Slider label="Max iterations (model calls)" value={params.maxIterations} min={MIN_ITER} max={MAX_ITER} onChange={(maxIterations) => setParams((p) => ({ ...p, maxIterations }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--text-2)' }} /> user / system
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> assistant tool call
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> tool result (matching id)
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> is_error / guard
          <span className="viz-key" style={{ background: 'var(--good)' }} /> final answer
        </>
      }
    >
      <WideSvg label="Tool-calling diagram">
        <svg viewBox="0 0 600 352" className="viz-svg" role="img" aria-label={aria}>
          {/* lanes */}
          {LANES.map((l) => {
            const on = f.active === l.id;
            const idle = structured && l.id === 'tool';
            return (
              <g key={l.id} opacity={idle ? 0.45 : 1}>
                <rect x={l.x} y={6} width={LANE_W} height={38} rx={8} fill={on ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={on ? 'var(--accent)' : 'var(--border)'} strokeWidth={on ? 2 : 1} />
                <text x={l.x + LANE_W / 2} y={22} textAnchor="middle" fontSize={11.5} fontWeight={700}>
                  {l.name}
                </text>
                <text x={l.x + LANE_W / 2} y={36} textAnchor="middle" fontSize={8.5} style={{ fill: 'var(--text-2)', fontFamily: l.id === 'tool' ? 'var(--mono)' : 'var(--sans)' }}>
                  {sub[l.id]}
                </text>
              </g>
            );
          })}
          <line x1={146} y1={30} x2={230} y2={30} stroke="var(--border)" strokeDasharray="3 3" />
          <line x1={370} y1={30} x2={454} y2={30} stroke="var(--border)" strokeDasharray="3 3" />
          {f.arrow && arrow && (
            <g>
              <line x1={arrow.x1} y1={30} x2={arrow.x2} y2={30} stroke="var(--accent)" strokeWidth={2.5} />
              <path
                d={arrow.x2 > arrow.x1 ? `M ${arrow.x2} 30 l -7 -4.5 v 9 z` : `M ${arrow.x2} 30 l 7 -4.5 v 9 z`}
                style={{ fill: 'var(--accent)' }}
              />
              <text x={arrow.mid} y={20} textAnchor="middle" fontSize={9} fontWeight={700} style={{ fill: 'var(--accent)' }}>
                {short(f.arrow.label, 15)}
              </text>
            </g>
          )}

          {/* message list */}
          <text x={8} y={62} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            messages[], resent on every request{hidden > 0 ? ` (+${hidden} earlier)` : ''}
          </text>
          {rows.map((m, r) => {
            const st = msgStyle(m);
            const t = TONE[st.tone];
            const y = 70 + r * 25;
            const isLast = r === rows.length - 1;
            return (
              <g key={hidden + r}>
                <rect x={6} y={y} width={294} height={21} rx={5} fill={t.fill} stroke={t.stroke} strokeWidth={isLast ? 2 : 1} />
                <text x={12} y={y + 14} fontSize={8.5} fontWeight={700} style={{ fill: st.tone === 'neutral' ? 'var(--text-2)' : t.text }}>
                  {st.label}
                </text>
                <text x={72} y={y + 14} fontSize={8.5} style={{ fontFamily: 'var(--mono)' }}>
                  {short(m.text, 41)}
                </text>
              </g>
            );
          })}

          {/* counters */}
          <text x={8} y={312} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            model calls {f.modelCalls} / max {params.maxIterations}
          </text>
          {Array.from({ length: params.maxIterations }, (_, i) => (
            <rect
              key={i}
              x={150 + i * (150 / params.maxIterations)}
              y={303}
              width={150 / params.maxIterations - 3}
              height={11}
              rx={3}
              fill={i < f.modelCalls ? (f.outcome === 'stopped' ? 'var(--bad)' : f.outcome === 'answered' && i === f.modelCalls - 1 ? 'var(--good)' : 'var(--accent)') : 'var(--surface-2)'}
              stroke="var(--border)"
            />
          ))}
          <text x={8} y={332} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            last request ~{f.promptTokens} tok · billed so far ~{f.totalTokens} tok
          </text>
          <rect x={6} y={338} width={294} height={8} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
          <rect x={6} y={338} width={(294 * f.totalTokens) / maxTotal} height={8} rx={3} fill="var(--warn)" />

          {/* detail panel */}
          {f.detail && (
            <g>
              <rect x={310} y={52} width={284} height={236} rx={8} fill={tone.fill} stroke={tone.stroke} />
              <text x={320} y={70} fontSize={10.5} fontWeight={700} style={{ fill: f.detail.tone === 'neutral' ? 'var(--text)' : tone.text }}>
                {short(f.detail.title, 44)}
              </text>
              {f.detail.lines.slice(0, 12).map((line, i) => (
                <text key={i} x={320} y={90 + i * 16} fontSize={8.8} style={{ fontFamily: 'var(--mono)' }}>
                  {short(line, 48)}
                </text>
              ))}
            </g>
          )}

          {/* status */}
          <text x={312} y={312} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            stop_reason
          </text>
          <rect x={380} y={300} width={120} height={18} rx={9} fill={f.stopReason === 'tool_use' ? 'var(--warn-soft)' : f.stopReason ? 'var(--good-soft)' : 'var(--surface-2)'} stroke={f.stopReason === 'tool_use' ? 'var(--warn)' : f.stopReason ? 'var(--good)' : 'var(--border)'} />
          <text x={440} y={313} textAnchor="middle" fontSize={9} fontWeight={700} style={{ fontFamily: 'var(--mono)' }}>
            {f.stopReason ? `"${f.stopReason}"` : '—'}
          </text>
          {f.outcome !== 'running' && (
            <text x={312} y={338} fontSize={11.5} fontWeight={700} style={{ fill: f.outcome === 'answered' ? 'var(--good)' : 'var(--bad)' }}>
              {f.outcome === 'answered' ? (structured ? '✓ schema-valid object returned' : '✓ answered: loop exited') : `✕ stopped by the guard (max ${params.maxIterations})`}
            </text>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
