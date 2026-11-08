import { useState } from 'react';
import { Choice, VizFrame, useFrames, useSimulation } from '../../core';
import { fromFrameTurn } from '../_shared/yourTurn.ts';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, OUTCOME_LABELS, simulate, type Lane, type Outcome, type Params, type Spec, type WireMsg } from './sim';

const LANES: { id: Lane; x: number; name: string; sub: string }[] = [
  { id: 'host', x: 90, name: 'Host', sub: 'LLM · consent UI' },
  { id: 'client', x: 300, name: 'Client', sub: 'one per server' },
  { id: 'server', x: 510, name: 'Server', sub: 'GitHub' },
];
const laneX = (l: Lane) => LANES.find((x) => x.id === l)!.x;
const ROW0 = 62;
const ROW_H = 19;
const PANEL_Y = 262;

function color(m: WireMsg): string {
  if (m.kind === 'error') return 'var(--bad)';
  if (m.kind === 'result') return m.label.includes('isError') ? 'var(--warn)' : 'var(--good)';
  if (m.kind === 'local') return 'var(--warn)';
  if (m.kind === 'notification') return 'var(--text-2)';
  return 'var(--accent)';
}

export default function McpHandshakeViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const bottom = ROW0 + Math.max(10, f.log.length) * ROW_H;

  const latest = f.log[f.log.length - 1];
  const aria = `MCP session, spec ${params.spec}. ${f.log.length} messages so far${latest ? `, latest: ${latest.label} from ${latest.from} to ${latest.to}` : ''}. Handshake ${f.handshakeDone ? 'done' : 'not done'}. ${f.payload.title}: ${f.payload.lines.join(' ')}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={f.yourTurn && fromFrameTurn(f.yourTurn, stepper.i)}
      controls={
        <>
          <Choice<Spec>
            label="Spec"
            value={params.spec}
            options={[
              { value: '2025-11-25', label: '2025-11-25 (handshake)' },
              { value: '2026-07-28', label: '2026-07-28 (stateless)' },
            ]}
            onChange={(spec) => setParams((p) => ({ ...p, spec }))}
          />
          <Choice<Outcome>
            label="Tool call"
            value={params.outcome}
            options={(Object.keys(OUTCOME_LABELS) as Outcome[]).map((k) => ({ value: k, label: OUTCOME_LABELS[k] }))}
            onChange={(outcome) => setParams((p) => ({ ...p, outcome }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> request (has an id)
          <span className="viz-key" style={{ background: 'var(--good)' }} /> result (same id)
          <span className="viz-key" style={{ background: 'var(--text-2)' }} /> notification (no id)
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> JSON-RPC error
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> inside the host / isError
        </>
      }
    >
      <WideSvg label="MCP message sequence">
        <svg viewBox="0 0 600 352" className="viz-svg" role="img" aria-label={aria}>
          {LANES.map((l) => {
            const on = f.active === l.id;
            return (
              <g key={l.id}>
                <rect x={l.x - 62} y={6} width={124} height={36} rx={9} fill={on ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={on ? 'var(--accent)' : 'var(--border)'} strokeWidth={on ? 2 : 1} />
                <text x={l.x} y={22} textAnchor="middle" fontSize={11} fontWeight={700}>
                  {l.name}
                </text>
                <text x={l.x} y={35} textAnchor="middle" fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                  {l.sub}
                </text>
                <line x1={l.x} y1={42} x2={l.x} y2={bottom} stroke="var(--border)" strokeDasharray="3 3" />
              </g>
            );
          })}
          <text x={405} y={54} textAnchor="middle" fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
            JSON-RPC 2.0 over stdio
          </text>

          {f.log.map((m, r) => {
            const y = ROW0 + r * ROW_H + 10;
            const c = color(m);
            const last = r === f.log.length - 1;
            const op = last ? 1 : 0.55;
            if (m.from === m.to) {
              return (
                <g key={r} opacity={op}>
                  <circle cx={laneX(m.from)} cy={y - 3} r={4} fill={c} />
                  <text x={laneX(m.from) + 10} y={y} fontSize={9.5} fontWeight={last ? 700 : 400} style={{ fill: c }}>
                    {m.label}
                  </text>
                </g>
              );
            }
            const x1 = laneX(m.from);
            const x2 = laneX(m.to);
            const dir = Math.sign(x2 - x1);
            return (
              <g key={r} opacity={op}>
                <line x1={x1} y1={y} x2={x2 - dir * 7} y2={y} stroke={c} strokeWidth={last ? 2 : 1.3} strokeDasharray={m.kind === 'notification' ? '4 3' : undefined} />
                <polygon points={`${x2},${y} ${x2 - dir * 8},${y - 4} ${x2 - dir * 8},${y + 4}`} fill={c} />
                <text x={(x1 + x2) / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight={last ? 700 : 400} style={{ fontFamily: 'var(--mono)', fill: last ? c : 'var(--text-2)' }}>
                  {m.label}
                </text>
              </g>
            );
          })}

          {/* payload of the current step */}
          <rect x={6} y={PANEL_Y} width={588} height={84} rx={8} fill="var(--surface-2)" stroke={latest ? color(latest) : 'var(--border)'} />
          <text x={16} y={PANEL_Y + 15} fontSize={9.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            {f.payload.title}
          </text>
          {f.payload.lines.slice(0, 5).map((line, k) => (
            <text key={k} x={16} y={PANEL_Y + 30 + k * 12} fontSize={9.5} style={{ fontFamily: 'var(--mono)', whiteSpace: 'pre' }}>
              {line}
            </text>
          ))}
          <text x={586} y={PANEL_Y + 15} textAnchor="end" fontSize={9} fontWeight={700} style={{ fill: f.handshakeDone ? 'var(--good)' : 'var(--text-2)' }}>
            {params.spec === '2026-07-28' ? 'no handshake' : f.handshakeDone ? '✓ handshake done' : 'handshake in progress'}
            {f.pending.length ? ` · awaiting id ${f.pending.join(', ')}` : ''}
          </text>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
