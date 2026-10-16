import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, HUB_CAPACITY, LOAD_MAX, LOAD_MIN, REQUESTS, SPOKES, simulate, type Params, type RequestType, type SpokeId } from './sim';

const POS: Record<string, { x: number; y: number }> = {
  user: { x: 56, y: 170 },
  hub: { x: 250, y: 170 },
  guard: { x: 250, y: 44 },
  rag: { x: 468, y: 64 },
  sql: { x: 512, y: 170 },
  code: { x: 468, y: 276 },
};
const SPOKE_IDS: SpokeId[] = ['guard', 'rag', 'sql', 'code'];

export default function HubAndSpokeViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const target = REQUESTS[params.type].spoke;
  const onEdge = (a: string, b: string) => !!f.edge && ((f.edge[0] === a && f.edge[1] === b) || (f.edge[0] === b && f.edge[1] === a));
  const overloaded = f.hubUtil >= 1;
  const breakerSpoke: SpokeId = params.type === 'unsafe' ? 'guard' : target;
  const breakerCol = f.breaker === 'closed' ? 'var(--good)' : f.breaker === 'open' ? 'var(--bad)' : 'var(--warn)';

  const aria = `Hub-and-spoke: ${REQUESTS[params.type].label} request, load ${f.rps} req/s, hub ${Math.round(f.hubUtil * 100)}% busy, ${params.failure ? `${SPOKES[breakerSpoke].label} failing, breaker ${f.breaker}` : 'all spokes healthy'}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<RequestType>
            label="Request"
            value={params.type}
            options={(Object.keys(REQUESTS) as RequestType[]).map((k) => ({ value: k, label: REQUESTS[k].label }))}
            onChange={(type) => setParams((p) => ({ ...p, type }))}
          />
          <Slider label="Peak load (req/s)" value={params.load} min={LOAD_MIN} max={LOAD_MAX} step={10} onChange={(load) => setParams((p) => ({ ...p, load }))} />
          <Choice<'on' | 'off'>
            label="Spoke failure"
            value={params.failure ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'off' },
              { value: 'on', label: 'on' },
            ]}
            onChange={(v) => setParams((p) => ({ ...p, failure: v === 'on' }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> active hop
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> failing spoke / overloaded hub
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> fallback / half-open
          <span className="viz-key" style={{ background: 'var(--good)' }} /> healthy / served
        </>
      }
    >
      <WideSvg>
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          {/* edges */}
          {['user', ...SPOKE_IDS].map((n) => {
            const a = POS[n];
            const hot = onEdge(n, 'hub');
            const dead = f.down.includes(n as SpokeId);
            return (
              <line
                key={n}
                x1={a.x}
                y1={a.y}
                x2={POS.hub.x}
                y2={POS.hub.y}
                stroke={hot ? (dead ? 'var(--bad)' : 'var(--accent)') : 'var(--border)'}
                strokeWidth={hot ? 3.5 : n === 'user' ? 1 + Math.min(8, f.rps / 20) : 1.5}
                strokeDasharray={dead && !hot ? '5 4' : undefined}
              />
            );
          })}
          {/* router scores */}
          {f.routeScores &&
            (['rag', 'sql', 'code'] as const).map((k) => {
              const m = { x: (POS[k].x + POS.hub.x) / 2, y: (POS[k].y + POS.hub.y) / 2 };
              const best = k === target;
              return (
                <g key={k}>
                  <rect x={m.x - 22} y={m.y - 10} width={44} height={18} rx={9} fill={best ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={best ? 'var(--accent)' : 'var(--border)'} />
                  <text x={m.x} y={m.y + 3} textAnchor="middle" fontSize={10} fontWeight={700} style={{ fontFamily: 'var(--mono)' }}>
                    {f.routeScores![k].toFixed(2)}
                  </text>
                </g>
              );
            })}

          {/* user */}
          <g>
            <circle cx={POS.user.x} cy={POS.user.y} r={22} fill="var(--surface-2)" stroke={f.active === 'user' ? 'var(--accent)' : 'var(--border)'} strokeWidth={2} />
            <text x={POS.user.x} y={POS.user.y + 4} textAnchor="middle" fontSize={11} fontWeight={700}>
              users
            </text>
            <text x={POS.user.x} y={POS.user.y + 38} textAnchor="middle" fontSize={10} style={{ fill: 'var(--text-2)' }}>
              {f.rps} req/s
            </text>
          </g>

          {/* hub */}
          <g>
            <circle cx={POS.hub.x} cy={POS.hub.y} r={44} fill={overloaded ? 'var(--bad-soft)' : f.active === 'hub' ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={overloaded ? 'var(--bad)' : f.active === 'hub' ? 'var(--accent)' : 'var(--border)'} strokeWidth={3} />
            <text x={POS.hub.x} y={POS.hub.y - 9} textAnchor="middle" fontSize={13} fontWeight={700}>
              HUB
            </text>
            {['auth · policy', 'route · retry', 'breaker · trace'].map((t, k) => (
              <text key={t} x={POS.hub.x} y={POS.hub.y + 5 + k * 9.5} textAnchor="middle" fontSize={8} style={{ fill: 'var(--text-2)' }}>
                {t}
              </text>
            ))}
            {/* utilisation ring */}
            <circle
              cx={POS.hub.x}
              cy={POS.hub.y}
              r={50}
              fill="none"
              stroke={overloaded ? 'var(--bad)' : f.hubUtil > 0.75 ? 'var(--warn)' : 'var(--good)'}
              strokeWidth={4}
              strokeDasharray={`${Math.min(1, f.hubUtil) * 2 * Math.PI * 50} ${2 * Math.PI * 50}`}
              transform={`rotate(-90 ${POS.hub.x} ${POS.hub.y})`}
            />
          </g>

          {/* spokes */}
          {SPOKE_IDS.map((id) => {
            const p = POS[id];
            const dead = f.down.includes(id);
            const on = f.active === id;
            return (
              <g key={id}>
                <rect x={p.x - 56} y={p.y - 20} width={112} height={40} rx={8} fill={dead ? 'var(--bad-soft)' : on ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={dead ? 'var(--bad)' : on ? 'var(--accent)' : 'var(--border)'} strokeWidth={on ? 2.5 : 1.2} />
                <text x={p.x} y={p.y - 3} textAnchor="middle" fontSize={11} fontWeight={700}>
                  {SPOKES[id].label}
                </text>
                <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize={9} style={{ fill: dead ? 'var(--bad)' : 'var(--text-2)' }}>
                  {dead ? 'DOWN' : `~${SPOKES[id].ms} ms`}
                </text>
                {params.failure && id === breakerSpoke && id !== 'guard' && (
                  <g>
                    <rect x={p.x - 56} y={p.y + 23} width={112} height={16} rx={8} fill="var(--surface)" stroke={breakerCol} />
                    <text x={p.x} y={p.y + 35} textAnchor="middle" fontSize={9} fontWeight={700} style={{ fill: breakerCol }}>
                      breaker {f.breaker} {f.breaker === 'closed' ? `${f.failures}/3` : ''}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* response */}
          {f.response && (
            <g>
              <rect x={8} y={8} width={178} height={52} rx={8} fill={!f.response.ok ? 'var(--bad-soft)' : f.servedBy === 'fallback' ? 'var(--warn-soft)' : 'var(--good-soft)'} stroke="var(--border)" />
              <text x={16} y={24} fontSize={9.5} fontWeight={700}>
                {f.servedBy === 'fallback' ? 'fallback response' : f.response.ok ? 'response' : 'rejected'}
              </text>
              <text x={16} y={40} fontSize={9}>
                {f.response.text.slice(0, 36)}
              </text>
              <text x={16} y={52} fontSize={9}>
                {f.response.text.slice(36, 72)}
              </text>
            </g>
          )}

          {/* metrics */}
          <g>
            <rect x={8} y={232} width={190} height={90} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
            <text x={16} y={250} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              hub utilisation
            </text>
            <text x={190} y={250} textAnchor="end" fontSize={11} fontWeight={700} style={{ fill: overloaded ? 'var(--bad)' : 'var(--text)' }}>
              {Math.round(f.hubUtil * 100)}% of {HUB_CAPACITY} req/s
            </text>
            <text x={16} y={270} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              time in hub
            </text>
            <text x={190} y={270} textAnchor="end" fontSize={11} fontWeight={700} style={{ fill: overloaded ? 'var(--bad)' : f.hubMs > 500 ? 'var(--warn)' : 'var(--text)' }}>
              {Number.isFinite(f.hubMs) ? `${f.hubMs.toFixed(0)} ms` : '∞ (unstable)'}
            </text>
            <text x={16} y={290} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              shed (429)
            </text>
            <text x={190} y={290} textAnchor="end" fontSize={11} fontWeight={700} style={{ fill: f.shed ? 'var(--bad)' : 'var(--text)' }}>
              {f.shed} req/s
            </text>
            <text x={16} y={310} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              request: “{REQUESTS[params.type].text.length > 24 ? REQUESTS[params.type].text.slice(0, 23) + '…' : REQUESTS[params.type].text}”
            </text>
          </g>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
