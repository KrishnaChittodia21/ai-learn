import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, LLM_COST, STREAMS, simulate, totals, type Outcome, type Params, type StreamId } from './sim';

const BADGE: Record<Outcome, { label: string; fill: string; stroke: string }> = {
  hit: { label: 'HIT', fill: 'var(--good-soft)', stroke: 'var(--good)' },
  'false-hit': { label: 'FALSE HIT', fill: 'var(--bad-soft)', stroke: 'var(--bad)' },
  miss: { label: 'MISS', fill: 'var(--surface-2)', stroke: 'var(--text-2)' },
  'missed-saving': { label: 'AVOIDABLE MISS', fill: 'var(--warn-soft)', stroke: 'var(--warn)' },
};
const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
const GX = 372;
const GW = 216;
const SX = (s: number) => GX + ((Math.max(0.5, s) - 0.5) / 0.5) * GW;

export default function SemanticCacheViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const qs = STREAMS[params.stream].queries;
  const T = totals(f.decisions);
  const cur = f.current;
  const cacheSet = new Set(f.cache);

  const aria = `Semantic cache, threshold ${params.threshold.toFixed(2)}: ${f.decisions.length} of ${qs.length} queries processed, ${T.hits} hits of which ${T.falseHits} false, spent $${T.cost.toFixed(4)} vs $${T.baseline.toFixed(4)} without cache.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<StreamId>
            label="Query stream"
            value={params.stream}
            options={(Object.keys(STREAMS) as StreamId[]).map((k) => ({ value: k, label: STREAMS[k].label }))}
            onChange={(stream) => setParams((p) => ({ ...p, stream }))}
          />
          <Slider label="Similarity threshold" value={params.threshold} min={0.8} max={0.98} step={0.01} onChange={(threshold) => setParams((p) => ({ ...p, threshold }))} format={(v) => v.toFixed(2)} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--good)' }} /> correct hit
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> false hit (wrong answer)
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> avoidable miss
          <span className="viz-key ring" style={{ borderColor: 'var(--accent)' }} /> stored in cache
        </>
      }
    >
      <WideSvg>
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          <text x={8} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            incoming queries
          </text>
          {qs.map((q, i) => {
            const d = f.decisions[i];
            const b = d ? BADGE[d.outcome] : null;
            const isCur = cur?.q === i;
            const isNear = cur?.nearest === i;
            return (
              <g key={i} opacity={d || isNear ? 1 : 0.45}>
                <rect
                  x={6}
                  y={24 + i * 30}
                  width={352}
                  height={26}
                  rx={6}
                  fill={b ? b.fill : 'var(--surface-2)'}
                  stroke={isCur ? 'var(--accent)' : isNear ? 'var(--text)' : cacheSet.has(i) ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={isCur ? 2.5 : isNear ? 2 : cacheSet.has(i) ? 1.4 : 1}
                  strokeDasharray={isNear ? '4 3' : undefined}
                />
                <text x={14} y={41 + i * 30} fontSize={10}>
                  {i + 1}. {short(q.text, 44)}
                </text>
                {b && (
                  <text x={350} y={41 + i * 30} textAnchor="end" fontSize={8.5} fontWeight={700} style={{ fill: b.stroke }}>
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* gauge or sweep */}
          {f.sweep ? (
            <g>
              <text x={GX} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                threshold sweep (same stream)
              </text>
              {['T', 'hits', 'false', 'saved'].map((h, c) => (
                <text key={h} x={GX + 8 + c * 54} y={36} fontSize={9.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                  {h}
                </text>
              ))}
              {f.sweep.map((s, r) => {
                const mine = Math.abs(s.t - params.threshold) < 1e-9;
                return (
                  <g key={s.t}>
                    <rect x={GX} y={42 + r * 24} width={GW} height={20} rx={4} fill={s.falseHits ? 'var(--bad-soft)' : 'var(--good-soft)'} stroke={mine ? 'var(--accent)' : 'var(--border)'} strokeWidth={mine ? 2 : 1} />
                    {[s.t.toFixed(2), String(s.hits), String(s.falseHits), `$${s.saved.toFixed(3)}`].map((v, c) => (
                      <text key={c} x={GX + 8 + c * 54} y={56 + r * 24} fontSize={10} style={{ fontFamily: 'var(--mono)' }}>
                        {v}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>
          ) : (
            <g>
              <text x={GX} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                similarity to nearest cached query
              </text>
              <rect x={GX} y={30} width={GW} height={18} rx={4} fill="var(--surface-2)" stroke="var(--border)" />
              <rect x={SX(params.threshold)} y={30} width={GX + GW - SX(params.threshold)} height={18} rx={4} fill="var(--good-soft)" />
              <line x1={SX(params.threshold)} y1={24} x2={SX(params.threshold)} y2={54} stroke="var(--text)" strokeWidth={2} />
              <text x={SX(params.threshold)} y={66} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>
                threshold {params.threshold.toFixed(2)}
              </text>
              <text x={GX} y={66} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                0.5
              </text>
              <text x={GX + GW} y={66} textAnchor="end" fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                1.0
              </text>
              {cur && cur.nearest !== null && (
                <g>
                  <circle cx={SX(cur.sim)} cy={39} r={7} fill={BADGE[cur.outcome].stroke} stroke="var(--surface)" strokeWidth={2} />
                  <text x={GX} y={88} fontSize={10}>
                    cos = <tspan fontWeight={700}>{cur.sim.toFixed(2)}</tspan> vs #{cur.nearest + 1}
                  </text>
                  <text x={GX} y={104} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                    “{short(qs[cur.nearest].text, 40)}”
                  </text>
                  <text x={GX} y={120} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                    intents: {qs[cur.q].intent} vs {qs[cur.nearest].intent}
                  </text>
                </g>
              )}
              {cur && cur.nearest === null && (
                <text x={GX} y={88} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                  cache empty: nothing to compare
                </text>
              )}
            </g>
          )}

          {/* counters */}
          <g>
            <rect x={GX} y={190} width={GW} height={132} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
            {[
              ['queries', `${f.decisions.length}/${qs.length}`, 'var(--text)'],
              ['hits (correct / false)', `${T.hits - T.falseHits} / ${T.falseHits}`, T.falseHits ? 'var(--bad)' : 'var(--good)'],
              ['cache entries', String(f.cache.length), 'var(--accent)'],
              ['spent', `$${T.cost.toFixed(4)}`, 'var(--text)'],
              ['without cache', `$${T.baseline.toFixed(4)}`, 'var(--text-2)'],
              ['saved', `$${T.saved.toFixed(4)}`, T.saved > 0 ? 'var(--good)' : 'var(--bad)'],
            ].map(([k, v, col], r) => (
              <g key={k}>
                <text x={GX + 10} y={208 + r * 19} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                  {k}
                </text>
                <text x={GX + GW - 10} y={208 + r * 19} textAnchor="end" fontSize={11} fontWeight={700} style={{ fill: col, fontFamily: 'var(--mono)' }}>
                  {v}
                </text>
              </g>
            ))}
          </g>
          {!f.sweep && (
            <text x={GX} y={182} fontSize={9} style={{ fill: 'var(--text-2)' }}>
              LLM call ${LLM_COST.toFixed(2)} each · lookups cost a little even on a miss
            </text>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
