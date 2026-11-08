import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { fromFrameTurn } from '../_shared/yourTurn.ts';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, MAX_HANDOFFS, MAX_WORKERS, MIN_WORKERS, PATTERN_LABELS, WORKER_K, multiTotalK, simulate, singleTotalK, type Arrow, type Params, type Pattern } from './sim';

const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const W = 116;
const H = 40;

const ARROW: Record<Arrow['kind'], string> = {
  user: 'var(--text-2)',
  delegate: 'var(--accent)',
  return: 'var(--good)',
  transfer: 'var(--warn)',
  guard: 'var(--bad)',
};

/** point where the segment from (x1,y1) towards a box centred at (x2,y2) meets that box */
function edge(x1: number, y1: number, x2: number, y2: number, pad = 6) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.min(dx ? (W / 2 + pad) / Math.abs(dx) : Infinity, dy ? (H / 2 + pad) / Math.abs(dy) : Infinity);
  return { x: x2 - dx * t, y: y2 - dy * t };
}

export default function SupervisorHandoffViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const sup = params.pattern === 'supervisor';
  const n = f.agents.length - 1;

  const pos: Record<string, { x: number; y: number }> = { user: { x: 70, y: 34 } };
  if (sup) {
    pos.lead = { x: 300, y: 50 };
    f.agents.slice(1).forEach((a, k) => (pos[a.id] = { x: 300 + (k - (n - 1) / 2) * 140, y: 168 }));
  } else {
    Object.assign(pos, { triage: { x: 90, y: 128 }, billing: { x: 300, y: 128 }, tech: { x: 510, y: 128 }, human: { x: 300, y: 210 } });
  }
  const maxCtx = sup ? WORKER_K : 8;
  const totalMax = sup ? Math.max(multiTotalK(params.workers), singleTotalK(params.workers)) : 20;

  const aria = `${PATTERN_LABELS[params.pattern]}. User is talking to ${f.owner}. ${f.agents.map((a) => `${a.label}: ${a.state}, ${a.ctxK}K tokens in context`).join('; ')}. ${f.arrows.map((a) => `${a.from} to ${a.to}: ${a.label}`).join('; ')}. Total ${f.tokensK}K tokens.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={f.yourTurn && fromFrameTurn(f.yourTurn, stepper.i)}
      controls={
        <>
          <Choice<Pattern>
            label="Pattern"
            value={params.pattern}
            options={(Object.keys(PATTERN_LABELS) as Pattern[]).map((k) => ({ value: k, label: PATTERN_LABELS[k] }))}
            onChange={(pattern) => setParams((p) => ({ ...p, pattern }))}
          />
          {sup && <Slider label="Companies (parallel workers)" value={params.workers} min={MIN_WORKERS} max={MAX_WORKERS} onChange={(workers) => setParams((p) => ({ ...p, workers }))} />}
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> task spec (delegate)
          <span className="viz-key" style={{ background: 'var(--good)' }} /> condensed result
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> transfer of control
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> guard → human
          <span className="viz-key ring" /> owns the turn
        </>
      }
    >
      <WideSvg label="Multi-agent diagram">
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          {/* user */}
          <circle cx={pos.user.x} cy={pos.user.y} r={16} fill="var(--surface-2)" stroke="var(--border)" />
          <text x={pos.user.x} y={pos.user.y + 4} textAnchor="middle" fontSize={10} fontWeight={700}>
            User
          </text>

          {/* arrows under the nodes */}
          {f.arrows.map((a, k) => {
            const p1 = pos[a.from];
            const p2 = pos[a.to];
            const s = edge(p2.x, p2.y, p1.x, p1.y);
            const e = edge(p1.x, p1.y, p2.x, p2.y);
            const len = Math.hypot(e.x - s.x, e.y - s.y) || 1;
            const ux = (e.x - s.x) / len;
            const uy = (e.y - s.y) / len;
            const c = ARROW[a.kind];
            return (
              <g key={k}>
                <line x1={s.x} y1={s.y} x2={e.x - ux * 7} y2={e.y - uy * 7} stroke={c} strokeWidth={2} />
                <polygon points={`${e.x},${e.y} ${e.x - ux * 8 - uy * 4},${e.y - uy * 8 + ux * 4} ${e.x - ux * 8 + uy * 4},${e.y - uy * 8 - ux * 4}`} fill={c} />
                <text x={(s.x + e.x) / 2 + (Math.abs(uy) > 0.5 ? 6 : 0)} y={(s.y + e.y) / 2 - 5} textAnchor={Math.abs(uy) > 0.5 ? 'start' : 'middle'} fontSize={9} fontWeight={700} style={{ fill: c, fontFamily: a.kind === 'transfer' || a.kind === 'guard' ? 'var(--mono)' : 'var(--sans)' }}>
                  {short(a.label, 34)}
                </text>
              </g>
            );
          })}

          {f.agents.map((a) => {
            const p = pos[a.id];
            const owner = f.owner === a.id;
            const tone = a.state === 'working' ? 'var(--accent)' : a.state === 'done' ? 'var(--good)' : a.id === 'human' && a.state !== 'idle' ? 'var(--bad)' : 'var(--border)';
            return (
              <g key={a.id} opacity={a.state === 'idle' ? 0.6 : 1}>
                <rect x={p.x - W / 2} y={p.y - H / 2} width={W} height={H} rx={9} fill={owner ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={owner ? 'var(--accent)' : tone} strokeWidth={owner ? 2.5 : 1.3} />
                <text x={p.x} y={p.y - 3} textAnchor="middle" fontSize={10.5} fontWeight={700}>
                  {a.label}
                </text>
                <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                  {a.state === 'working' ? 'researching…' : a.ctxK ? `own window: ${a.ctxK}K` : a.state}
                </text>
                {/* this agent's own context window */}
                <rect x={p.x - W / 2} y={p.y + H / 2 + 4} width={W} height={5} rx={2} fill="var(--surface-2)" stroke="var(--border)" strokeWidth={0.6} />
                <rect x={p.x - W / 2} y={p.y + H / 2 + 4} width={(W * Math.min(a.ctxK, maxCtx)) / maxCtx} height={5} rx={2} fill="var(--warn)" style={{ transition: 'width 0.3s ease' }} />
              </g>
            );
          })}

          {/* bottom: tokens and history */}
          {sup ? (
            <g>
              <text x={8} y={252} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                tokens billed so far: {f.tokensK}K
              </text>
              <rect x={8} y={258} width={584} height={12} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
              <rect x={8} y={258} width={(584 * f.tokensK) / totalMax} height={12} rx={3} fill="var(--accent)" style={{ transition: 'width 0.3s ease' }} />
              <text x={8} y={290} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                one agent doing it all: ~{singleTotalK(params.workers)}K tokens, one window
              </text>
              <rect x={8} y={296} width={584} height={12} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
              <rect x={8} y={296} width={(584 * singleTotalK(params.workers)) / totalMax} height={12} rx={3} fill="var(--text-2)" opacity={0.6} />
              <text x={8} y={324} fontSize={9} style={{ fill: 'var(--text-2)' }}>
                supervisor context: {f.agents[0].ctxK}K — stays small because workers return summaries, not transcripts
              </text>
            </g>
          ) : (
            <g>
              <text x={8} y={268} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                handoffs {f.handoffs} / max {MAX_HANDOFFS}
              </text>
              {Array.from({ length: MAX_HANDOFFS }, (_, k) => (
                <rect key={k} x={130 + k * 34} y={259} width={28} height={12} rx={3} fill={k < f.handoffs ? (f.outcome === 'human' && k === f.handoffs - 1 ? 'var(--bad)' : 'var(--warn)') : 'var(--surface-2)'} stroke="var(--border)" />
              ))}
              <text x={8} y={296} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                history
              </text>
              <text x={60} y={296} fontSize={10} style={{ fontFamily: 'var(--mono)' }}>
                {f.history.join(' → ')}
              </text>
              {f.outcome !== 'running' && (
                <text x={8} y={322} fontSize={12} fontWeight={700} style={{ fill: f.outcome === 'answered' ? 'var(--good)' : 'var(--bad)' }}>
                  {f.outcome === 'answered' ? '✓ resolved by the agent that owns the turn' : '⚑ guard tripped: a human takes over'}
                </text>
              )}
            </g>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
