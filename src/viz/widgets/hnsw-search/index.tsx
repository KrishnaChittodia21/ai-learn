import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, EF_MAX, EF_MIN, K, NPTS, POINTS, QUERIES, TOP, buildGraph, simulate, type Params, type QueryId } from './sim';

const PX = (x: number) => 24 + x * 330;
const PY = (y: number) => 34 + (1 - y) * 282;

export default function HnswSearchViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const G = buildGraph(params.M);
  const L = f.layer;
  const q = QUERIES[params.query];
  const visited = new Set(f.visited);
  const W = new Set(f.results);
  const C = new Set(f.candidates);
  const found = new Set(f.found ?? []);
  const truth = new Set(f.truth ?? []);
  const recall = f.truth ? f.truth.filter((t) => found.has(t)).length : null;

  const edges: [number, number][] = [];
  G[L].forEach((nbs, i) =>
    nbs.forEach((j) => {
      // draw each undirected link once; one-way links (pruned on the other side) are drawn too
      if (i < j || !G[L][j].includes(i)) edges.push([i, j]);
    }),
  );

  const aria = `HNSW search for ${q.label}, layer ${L}, efSearch ${params.ef}, M ${params.M}. ${f.ndist} of ${NPTS} vectors measured (brute force measures all ${NPTS}).${recall !== null ? ` Recall@${K} ${recall}/${K}.` : ''}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<QueryId>
            label="Query"
            value={params.query}
            options={(Object.keys(QUERIES) as QueryId[]).map((k) => ({ value: k, label: QUERIES[k].label }))}
            onChange={(query) => setParams((p) => ({ ...p, query }))}
          />
          <Slider label="efSearch (≥ k = 3)" value={params.ef} min={EF_MIN} max={EF_MAX} onChange={(ef) => setParams((p) => ({ ...p, ef }))} />
          <Slider label="M (links per node)" value={params.M} min={2} max={6} onChange={(M) => setParams((p) => ({ ...p, M }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> query / current node / path
          <span className="viz-key" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }} /> distance computed
          <span className="viz-key ring" style={{ borderColor: 'var(--accent)' }} /> candidate queue C
          <span className="viz-key" style={{ background: 'var(--good)' }} /> result set W
          <span className="viz-key ring" style={{ borderColor: 'var(--bad)' }} /> true neighbour missed
        </>
      }
    >
      <WideSvg>
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          <rect x={14} y={8} width={350} height={316} rx={8} fill="none" stroke="var(--border)" />
          <text x={22} y={24} fontSize={11} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            layer {L} ({POINTS.filter((p) => p.level >= L).length} nodes, ≤ {L === 0 ? 2 * params.M : params.M} links each)
          </text>
          {edges.map(([i, j]) => (
            <line key={`${i}-${j}`} x1={PX(POINTS[i].x)} y1={PY(POINTS[i].y)} x2={PX(POINTS[j].x)} y2={PY(POINTS[j].y)} stroke="var(--border)" strokeWidth={L === 0 ? 0.8 : 1.2} />
          ))}
          {f.path.map((h, k) => (
            <line
              key={k}
              x1={PX(POINTS[h.a].x)}
              y1={PY(POINTS[h.a].y)}
              x2={PX(POINTS[h.b].x)}
              y2={PY(POINTS[h.b].y)}
              stroke="var(--accent)"
              strokeWidth={h.l === L ? 3 : 2}
              strokeDasharray={h.l === L ? undefined : '5 3'}
              opacity={h.l === L ? 1 : 0.6}
            />
          ))}
          {POINTS.map((p, i) => {
            const on = p.level >= L;
            const isCur = f.current === i;
            const inW = W.has(i);
            const fill = isCur ? 'var(--accent)' : inW ? 'var(--good)' : visited.has(i) ? 'var(--warn-soft)' : on ? 'var(--surface-2)' : 'var(--border)';
            const stroke = C.has(i) ? 'var(--accent)' : inW ? 'var(--good)' : visited.has(i) ? 'var(--warn)' : 'var(--muted)';
            return (
              <g key={i} opacity={on ? 1 : 0.35}>
                <circle cx={PX(p.x)} cy={PY(p.y)} r={on ? (L > 0 ? 6 : 4) : 2} fill={fill} stroke={on ? stroke : 'none'} strokeWidth={C.has(i) ? 2.2 : 1} />
                {f.truth && truth.has(i) && <circle cx={PX(p.x)} cy={PY(p.y)} r={8} fill="none" stroke={found.has(i) ? 'var(--good)' : 'var(--bad)'} strokeWidth={2} />}
                {on && L > 0 && (visited.has(i) || isCur) && (
                  <text x={PX(p.x)} y={PY(p.y) - 10} textAnchor="middle" fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                    {i}
                  </text>
                )}
              </g>
            );
          })}
          {/* query */}
          <g>
            <line x1={PX(q.x) - 7} y1={PY(q.y) - 7} x2={PX(q.x) + 7} y2={PY(q.y) + 7} stroke="var(--accent)" strokeWidth={3} />
            <line x1={PX(q.x) - 7} y1={PY(q.y) + 7} x2={PX(q.x) + 7} y2={PY(q.y) - 7} stroke="var(--accent)" strokeWidth={3} />
            <text x={PX(q.x) + 10} y={PY(q.y) + 4} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--accent)' }}>
              q
            </text>
          </g>

          {/* layer stack */}
          {Array.from({ length: TOP + 1 }, (_, k) => TOP - k).map((l, r) => (
            <g key={l}>
              <rect x={384} y={14 + r * 30} width={204} height={24} rx={6} fill={l === L ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={l === L ? 'var(--accent)' : 'var(--border)'} strokeWidth={l === L ? 2 : 1} />
              <text x={394} y={30 + r * 30} fontSize={11} fontWeight={700}>
                layer {l}
              </text>
              <text x={580} y={30 + r * 30} textAnchor="end" fontSize={10} style={{ fill: 'var(--text-2)' }}>
                {POINTS.filter((p) => p.level >= l).length} nodes{l === TOP ? ' · entry' : l === 0 ? ' · all' : ''}
              </text>
            </g>
          ))}

          {/* counters: HNSW vs brute force */}
          <text x={384} y={120} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            vectors measured (distance to q)
          </text>
          <text x={384} y={136} fontSize={10} style={{ fill: 'var(--text-2)' }}>
            HNSW
          </text>
          <rect x={430} y={128} width={120} height={9} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
          <rect x={430} y={128} width={(120 * f.ndist) / NPTS} height={9} rx={3} fill="var(--accent)" />
          <text x={588} y={136} textAnchor="end" fontSize={10} fontWeight={700} style={{ fill: 'var(--text)' }}>
            {f.ndist}
          </text>
          <text x={384} y={152} fontSize={10} style={{ fill: 'var(--text-2)' }}>
            brute
          </text>
          <rect x={430} y={144} width={120} height={9} rx={3} fill="var(--warn)" />
          <text x={588} y={152} textAnchor="end" fontSize={10} fontWeight={700} style={{ fill: 'var(--text)' }}>
            {NPTS}
          </text>

          <text x={384} y={172} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            W (best {params.ef}, nearest first)
          </text>
          <text x={384} y={187} fontSize={10.5} style={{ fontFamily: 'var(--mono)', fill: 'var(--good)' }}>
            {f.results.length ? f.results.slice(0, 10).join(' ') + (f.results.length > 10 ? ' …' : '') : '—'}
          </text>
          <text x={384} y={208} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            C (candidates to expand)
          </text>
          <text x={384} y={222} fontSize={10.5} style={{ fontFamily: 'var(--mono)', fill: 'var(--accent)' }}>
            {f.candidates.length ? f.candidates.slice(0, 10).join(' ') + (f.candidates.length > 10 ? ' …' : '') : '—'}
          </text>
          {f.found && (
            <text x={384} y={250} fontSize={10.5} style={{ fill: 'var(--text-2)' }}>
              returned top {K}: <tspan style={{ fontFamily: 'var(--mono)', fill: 'var(--text)' }}>{f.found.join(' ')}</tspan>
            </text>
          )}
          {f.truth && (
            <>
              <text x={384} y={270} fontSize={10.5} style={{ fill: 'var(--text-2)' }}>
                exact top {K}: <tspan style={{ fontFamily: 'var(--mono)', fill: 'var(--text)' }}>{f.truth.join(' ')}</tspan>
              </text>
              <text x={384} y={298} fontSize={15} fontWeight={700} style={{ fill: recall === K ? 'var(--good)' : 'var(--bad)' }}>
                recall@{K} = {recall}/{K}
              </text>
            </>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
