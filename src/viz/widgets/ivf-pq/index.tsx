import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import {
  DEFAULT_PARAMS,
  K,
  NLIST_MAX,
  NLIST_MIN,
  NPTS,
  POINTS,
  QUERIES,
  REAL,
  REAL_FLOAT_BYTES,
  REAL_PQ_BYTES,
  REAL_RATIO,
  TOY_BITS,
  TOY_M,
  buildIvf,
  buildPq,
  simulate,
  type Mode,
  type Params,
  type QueryId,
  type Stage,
} from './sim';

const PX = (x: number) => 40 + x * 316;
const PY = (y: number) => 34 + (1 - y) * 270;
const PANEL = 384;
const BAR_X = 436;
const BAR_W = 110;
/** cell colour slots (see CELL_COLOURS in sim) */
const CELL_FILL = ['var(--accent)', 'var(--good)', 'var(--warn)', 'var(--bad)', 'var(--muted)'];
const ORDER: Stage[] = ['data', 'init', 'lloyd', 'lists', 'query', 'rank', 'select', 'codebook', 'encode', 'lut', 'scan', 'result', 'rerank', 'brute', 'done'];
const after = (s: Stage, t: Stage) => ORDER.indexOf(s) >= ORDER.indexOf(t);
const halo = {
  paintOrder: 'stroke',
  stroke: 'var(--surface)',
  strokeWidth: 3,
  strokeLinejoin: 'round',
} as const;

export default function IvfPqViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const pqMode = params.mode === 'pq';
  const ivf = buildIvf(params.nlist);
  const P = buildPq();
  const q = QUERIES[params.query];
  const cents = ivf.history[f.hist];
  /** centroids appear once k-means is initialised */
  const showCents = f.stage !== 'data';
  const queried = after(f.stage, 'query');
  const probed = new Set(f.probed);
  const scannedLists = new Set(f.scanned);
  const scanned = new Set(f.scannedPts);
  const top = new Set(f.top);
  const cands = new Set(f.candidates);
  const found = new Set(f.found ?? []);
  const truth = new Set(f.truth ?? []);
  const recall = f.truth ? f.truth.filter((t) => found.has(t)).length : null;
  const measured = f.ncent + f.scannedPts.length;
  const scaleMax = Math.max(NPTS, measured);

  // ---- labels with simple collision avoidance (centroids first, then point ids)
  const placed: { x: number; y: number; w: number }[] = [];
  const place = (x: number, y: number, w: number) => {
    let yy = y;
    for (let tries = 0; tries < 8 && placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 2 && Math.abs(p.y - yy) < 10); tries++) yy += 11;
    placed.push({ x, y: yy, w });
    return yy;
  };
  const centLabels = (showCents ? cents : []).map((c, j) => ({
    j,
    x: PX(c.x) + 7 + 7,
    y: place(PX(c.x) + 14, PY(c.y) - 7, 16),
  }));
  const idPts = [...new Set([...(f.truth ?? []), ...(f.stage === 'result' || f.stage === 'rerank' ? f.top : [])])];
  const idLabels = idPts.map((i) => ({
    i,
    x: PX(POINTS[i].x) + 15,
    y: place(PX(POINTS[i].x) + 15, PY(POINTS[i].y) - 8, 18),
  }));

  // PQ reconstructions to draw (distinct code squares)
  const reconIds = f.stage === 'encode' || f.stage === 'lut' ? POINTS.map((_, i) => i) : f.scannedPts;
  const recon = [...new Set(reconIds.map((i) => P.codes[i].join(',')))].map((s) => s.split(',').map(Number));

  // lookup tables for the panel
  const lx = P.cx.map((c) => (q.x - c) ** 2);
  const ly = P.cy.map((c) => (q.y - c) ** 2);
  const lmax = Math.max(...lx, ...ly);

  const modeName = pqMode ? 'IVF-PQ' : 'IVF-Flat';
  const aria = `${modeName} search for ${q.label}: nlist ${params.nlist}, nprobe ${params.nprobe}${pqMode ? `, re-rank ${params.rerank ? 'on' : 'off'}` : ''}. Stage ${f.stage}. ${
    queried
      ? `${measured} of ${NPTS} vectors measured (${f.ncent} centroids + ${f.scannedPts.length} in lists; brute force measures all ${NPTS}).`
      : `${NPTS} vectors, ${params.nlist} lists.`
  }${f.nrerank ? ` ${f.nrerank} exact re-rank distances.` : ''}${recall !== null ? ` Recall@${K} ${recall}/${K}.` : ''}`;

  // ---- panel layout (y of each block)
  const showMem = pqMode && after(f.stage, 'codebook');
  const Y_TOP = 22;
  const Y_MEM = 122;
  const Y_CNT = showMem ? 186 : 130;
  const Y_RES = Y_CNT + 66;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<Mode>
            label="Index"
            value={params.mode}
            options={[
              { value: 'flat', label: 'IVF-Flat' },
              { value: 'pq', label: 'IVF-PQ' },
            ]}
            onChange={(mode) => setParams((p) => ({ ...p, mode }))}
          />
          <Choice<QueryId>
            label="Query"
            value={params.query}
            options={(Object.keys(QUERIES) as QueryId[]).map((k) => ({
              value: k,
              label: QUERIES[k].label,
            }))}
            onChange={(query) => setParams((p) => ({ ...p, query }))}
          />
          <Slider
            label="nlist (k-means lists)"
            value={params.nlist}
            min={NLIST_MIN}
            max={NLIST_MAX}
            onChange={(nlist) =>
              setParams((p) => ({
                ...p,
                nlist,
                nprobe: Math.min(p.nprobe, nlist),
              }))
            }
          />
          <Slider label="nprobe (lists scanned)" value={params.nprobe} min={1} max={params.nlist} onChange={(nprobe) => setParams((p) => ({ ...p, nprobe }))} />
          {pqMode && (
            <Choice<'on' | 'off'>
              label={`Re-rank top ${4 * K} with full vectors`}
              value={params.rerank ? 'on' : 'off'}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
              onChange={(v) => setParams((p) => ({ ...p, rerank: v === 'on' }))}
            />
          )}
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> query / probed centroid
          <span
            className="viz-key"
            style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--accent)',
              borderRadius: 2,
            }}
          />{' '}
          probed list (cell)
          <span
            className="viz-key"
            style={{
              background: 'var(--warn-soft)',
              border: '1px solid var(--warn)',
            }}
          />{' '}
          {pqMode ? 'scored via PQ code' : 'distance computed'}
          <span className="viz-key" style={{ background: 'var(--good)' }} /> best {K} / returned
          {pqMode && (
            <>
              <span className="viz-key ring" style={{ borderColor: 'var(--accent)' }} /> re-rank candidate
              <span
                className="viz-key"
                style={{
                  border: '1.5px solid var(--accent)',
                  borderRadius: 1,
                  background: 'transparent',
                }}
              />{' '}
              PQ code
            </>
          )}
          <span className="viz-key ring" style={{ borderColor: 'var(--bad)' }} /> true neighbour missed
        </>
      }
    >
      <WideSvg label={meta.title}>
        <svg viewBox="0 0 600 326" className="viz-svg" role="img" aria-label={aria}>
          <rect x={14} y={8} width={350} height={312} rx={8} fill="none" stroke="var(--border)" />
          <text x={22} y={24} fontSize={11} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            {modeName} · nlist = {params.nlist}
            {queried ? ` · nprobe = ${params.nprobe}` : ''}
            {after(f.stage, 'codebook') && pqMode ? ` · toy PQ m = ${TOY_M}, ${TOY_BITS}-bit` : ''}
          </text>

          {/* Voronoi cells (lists) */}
          {f.showCells &&
            ivf.cells.map((poly, j) => {
              const isProbed = probed.has(j);
              const fill = queried ? (isProbed ? 'var(--accent-soft)' : 'none') : CELL_FILL[ivf.colour[j]];
              return (
                <polygon
                  key={j}
                  points={poly.map((p) => `${PX(p.x)},${PY(p.y)}`).join(' ')}
                  fill={fill}
                  fillOpacity={queried ? (scannedLists.has(j) ? 1 : 0.6) : 0.1}
                  stroke={isProbed ? 'var(--accent)' : 'var(--muted)'}
                  strokeWidth={isProbed ? 1.6 : 0.8}
                  strokeOpacity={isProbed ? 0.9 : 0.55}
                />
              );
            })}
          {!f.showCells && <rect x={PX(0)} y={PY(1)} width={PX(1) - PX(0)} height={PY(0) - PY(1)} fill="none" stroke="var(--border)" strokeDasharray="3 3" />}

          {/* PQ codebook grid */}
          {pqMode && f.pqGrid && (
            <g>
              {P.cx.map((c, k) => (
                <g key={`x${k}`}>
                  <line x1={PX(c)} y1={PY(1)} x2={PX(c)} y2={PY(0)} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="2 3" />
                  <text x={PX(c)} y={PY(0) + 12} textAnchor="middle" fontSize={8} style={{ fill: 'var(--accent)' }}>
                    x{k}
                  </text>
                </g>
              ))}
              {P.cy.map((c, k) => (
                <g key={`y${k}`}>
                  <line x1={PX(0)} y1={PY(c)} x2={PX(1)} y2={PY(c)} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="2 3" />
                  <text x={PX(0) - 4} y={PY(c) + 3} textAnchor="end" fontSize={8} style={{ fill: 'var(--accent)' }}>
                    y{k}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* centroid → query distance lines */}
          {f.stage === 'rank' &&
            cents.map((c, j) => (
              <line key={j} x1={PX(q.x)} y1={PY(q.y)} x2={PX(c.x)} y2={PY(c.y)} stroke="var(--muted)" strokeOpacity={0.55} strokeDasharray="3 3" />
            ))}
          {after(f.stage, 'select') &&
            f.probed.map((j) => (
              <line
                key={j}
                x1={PX(q.x)}
                y1={PY(q.y)}
                x2={PX(cents[j].x)}
                y2={PY(cents[j].y)}
                stroke="var(--accent)"
                strokeOpacity={0.7}
                strokeDasharray="4 3"
              />
            ))}

          {/* centroid trails during training */}
          {(f.stage === 'lloyd' || f.stage === 'init') &&
            f.hist > 0 &&
            cents.map((c, j) => (
              <line
                key={j}
                x1={PX(ivf.history[0][j].x)}
                y1={PY(ivf.history[0][j].y)}
                x2={PX(c.x)}
                y2={PY(c.y)}
                stroke="var(--text-2)"
                strokeOpacity={0.6}
                strokeDasharray="2 2"
              />
            ))}

          {/* points */}
          {POINTS.map((p, i) => {
            const cell = ivf.assign[i];
            let fill = 'var(--text-2)';
            let stroke = 'none';
            let opacity = 0.75;
            if (f.showCells && !queried) {
              fill = CELL_FILL[ivf.colour[cell]];
              opacity = 0.9;
            } else if (queried) {
              const inProbed = probed.has(cell);
              if (top.has(i) || found.has(i)) {
                fill = 'var(--good)';
                stroke = 'var(--good)';
                opacity = 1;
              } else if (scanned.has(i)) {
                fill = 'var(--warn-soft)';
                stroke = 'var(--warn)';
                opacity = 1;
              } else if (inProbed) {
                fill = 'var(--surface-2)';
                stroke = 'var(--muted)';
                opacity = 1;
              } else {
                fill = 'var(--muted)';
                opacity = 0.35;
              }
            }
            return (
              <g key={i}>
                <circle cx={PX(p.x)} cy={PY(p.y)} r={queried ? 3.2 : 2.8} fill={fill} stroke={stroke} strokeWidth={1} opacity={opacity} />
                {cands.has(i) && <circle cx={PX(p.x)} cy={PY(p.y)} r={5.6} fill="none" stroke="var(--accent)" strokeWidth={1.4} />}
                {truth.has(i) && <circle cx={PX(p.x)} cy={PY(p.y)} r={7.5} fill="none" stroke={found.has(i) ? 'var(--good)' : 'var(--bad)'} strokeWidth={2} />}
              </g>
            );
          })}

          {/* PQ reconstructions */}
          {pqMode &&
            f.pqRecon &&
            recon.map(([a, b]) => (
              <rect key={`${a},${b}`} x={PX(P.cx[a]) - 2.5} y={PY(P.cy[b]) - 2.5} width={5} height={5} fill="none" stroke="var(--accent)" strokeWidth={1.2} />
            ))}

          {/* centroids */}
          {showCents &&
            cents.map((c, j) => {
              const on = probed.has(j);
              const x = PX(c.x);
              const yy = PY(c.y);
              return (
                <g key={j}>
                  <rect
                    x={x - 4.5}
                    y={yy - 4.5}
                    width={9}
                    height={9}
                    transform={`rotate(45 ${x} ${yy})`}
                    fill={on ? 'var(--accent)' : 'var(--surface)'}
                    stroke={on ? 'var(--accent)' : 'var(--text)'}
                    strokeWidth={1.5}
                  />
                </g>
              );
            })}
          {centLabels.map(({ j, x, y: ly2 }) => (
            <text
              key={j}
              x={x}
              y={ly2}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              style={{
                ...halo,
                fill: probed.has(j) ? 'var(--accent)' : 'var(--text)',
              }}
            >
              c{j}
            </text>
          ))}
          {idLabels.map(({ i, x, y: ly2 }) => (
            <text
              key={i}
              x={x}
              y={ly2}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={700}
              style={{
                ...halo,
                fill: truth.has(i) && !found.has(i) ? 'var(--bad)' : 'var(--good)',
              }}
            >
              {i}
            </text>
          ))}

          {/* query */}
          {queried && (
            <g>
              <line x1={PX(q.x) - 7} y1={PY(q.y) - 7} x2={PX(q.x) + 7} y2={PY(q.y) + 7} stroke="var(--accent)" strokeWidth={3} />
              <line x1={PX(q.x) - 7} y1={PY(q.y) + 7} x2={PX(q.x) + 7} y2={PY(q.y) - 7} stroke="var(--accent)" strokeWidth={3} />
              <text x={PX(q.x) - 10} y={PY(q.y) + 4} textAnchor="end" fontSize={10.5} fontWeight={700} style={{ ...halo, fill: 'var(--accent)' }}>
                q
              </text>
            </g>
          )}

          {/* ================= side panel ================= */}
          {f.lut ? (
            <g>
              <text x={PANEL} y={Y_TOP} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                lookup tables: q → each code
              </text>
              {[lx, ly].map((row, r) => (
                <g key={r}>
                  <text x={PANEL} y={Y_TOP + 21 + r * 22} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                    {r ? 'y' : 'x'}
                  </text>
                  {row.map((v, k) => (
                    <g key={k}>
                      <rect
                        x={398 + k * 23.5}
                        y={Y_TOP + 8 + r * 22}
                        width={21}
                        height={18}
                        rx={3}
                        fill="var(--accent)"
                        fillOpacity={0.08 + 0.82 * (1 - Math.sqrt(v / lmax))}
                        stroke="var(--accent)"
                        strokeOpacity={0.5}
                      />
                      <text x={398 + k * 23.5 + 10.5} y={Y_TOP + 21 + r * 22} textAnchor="middle" fontSize={8.5} style={{ ...halo, fill: 'var(--text)' }}>
                        {r ? 'y' : 'x'}
                        {k}
                      </text>
                    </g>
                  ))}
                </g>
              ))}
              <text x={PANEL} y={Y_TOP + 66} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                stronger = closer · score = Tx[a] + Ty[b]
              </text>
              <text x={PANEL} y={Y_TOP + 80} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                real: {REAL.m} tables × 256 entries, {REAL.m} lookups/vector
              </text>
            </g>
          ) : !queried ? (
            <g>
              <text x={PANEL} y={Y_TOP} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                {f.showCells ? 'list sizes (vectors per list)' : 'k-means training'}
              </text>
              {f.showCells ? (
                (() => {
                  const sizes = ivf.lists.map((l) => l.length);
                  const mx = Math.max(...sizes);
                  const bw = 204 / params.nlist;
                  return (
                    <>
                      {sizes.map((s, j) => (
                        <rect
                          key={j}
                          x={PANEL + j * bw + 1}
                          y={Y_TOP + 70 - (60 * s) / mx}
                          width={bw - 2}
                          height={(60 * s) / mx}
                          rx={2}
                          fill={CELL_FILL[ivf.colour[j]]}
                          fillOpacity={0.75}
                        />
                      ))}
                      <line x1={PANEL} y1={Y_TOP + 70.5} x2={PANEL + 204} y2={Y_TOP + 70.5} stroke="var(--border)" />
                      <text x={PANEL} y={Y_TOP + 84} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                        min {Math.min(...sizes)} · max {mx} · mean {(NPTS / params.nlist).toFixed(1)}
                      </text>
                    </>
                  );
                })()
              ) : (
                <>
                  <text x={PANEL} y={Y_TOP + 18} fontSize={10} style={{ fill: 'var(--text)' }}>
                    {NPTS} vectors → {params.nlist} centroids
                  </text>
                  <text x={PANEL} y={Y_TOP + 34} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                    {f.stage === 'init' ? 'farthest-point initialisation' : 'not trained yet'}
                  </text>
                </>
              )}
            </g>
          ) : (
            <g>
              <text x={PANEL} y={Y_TOP} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                centroids by distance to q
              </text>
              {f.ranking.length === 0 ? (
                <text x={PANEL} y={Y_TOP + 18} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                  {params.nlist} centroid distances to compute
                </text>
              ) : (
                <>
                  {f.ranking.slice(0, 5).map((j, r) => {
                    const on = probed.has(j);
                    return (
                      <g key={j}>
                        {on && <rect x={PANEL - 3} y={Y_TOP + 6 + r * 14} width={207} height={13} rx={3} fill="var(--accent-soft)" />}
                        <text
                          x={PANEL}
                          y={Y_TOP + 16 + r * 14}
                          fontSize={10}
                          style={{
                            fontFamily: 'var(--mono)',
                            fill: on ? 'var(--accent)' : 'var(--text)',
                          }}
                        >
                          #{r + 1} c{j}
                        </text>
                        <text
                          x={500}
                          y={Y_TOP + 16 + r * 14}
                          textAnchor="end"
                          fontSize={10}
                          style={{
                            fontFamily: 'var(--mono)',
                            fill: 'var(--text-2)',
                          }}
                        >
                          {Math.hypot(cents[j].x - q.x, cents[j].y - q.y).toFixed(3)}
                        </text>
                        <text
                          x={588}
                          y={Y_TOP + 16 + r * 14}
                          textAnchor="end"
                          fontSize={9.5}
                          style={{
                            fill: on ? 'var(--accent)' : 'var(--muted)',
                          }}
                        >
                          {f.probed.length === 0
                            ? ''
                            : on
                              ? scannedLists.has(j)
                                ? `scanned (${ivf.lists[j].length})`
                                : `probe (${ivf.lists[j].length})`
                              : 'skipped'}
                        </text>
                      </g>
                    );
                  })}
                  {params.nlist > 5 && (
                    <text x={PANEL} y={Y_TOP + 88} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                      … {params.nlist - 5} more
                      {params.nprobe > 5 ? `; ${params.nprobe - 5} of them probed` : ', all skipped'}
                    </text>
                  )}
                </>
              )}
            </g>
          )}

          {/* memory per vector (PQ) */}
          {showMem && (
            <g>
              <text x={PANEL} y={Y_MEM} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                memory per vector (d = {REAL.d.toLocaleString('en-US')})
              </text>
              <text x={PANEL} y={Y_MEM + 16} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                float32
              </text>
              <rect x={BAR_X} y={Y_MEM + 8} width={BAR_W} height={9} rx={3} fill="var(--warn)" />
              <text x={588} y={Y_MEM + 16} textAnchor="end" fontSize={10} fontWeight={700}>
                {REAL_FLOAT_BYTES.toLocaleString('en-US')} B
              </text>
              <text x={PANEL} y={Y_MEM + 32} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                PQ {REAL.m}×{REAL.nbits}b
              </text>
              <rect x={BAR_X} y={Y_MEM + 24} width={BAR_W} height={9} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
              <rect x={BAR_X} y={Y_MEM + 24} width={Math.max(2, (BAR_W * REAL_PQ_BYTES) / REAL_FLOAT_BYTES)} height={9} rx={1} fill="var(--accent)" />
              <text x={588} y={Y_MEM + 32} textAnchor="end" fontSize={10} fontWeight={700}>
                {REAL_PQ_BYTES} B
              </text>
              <text x={PANEL} y={Y_MEM + 48} fontSize={10} fontWeight={700} style={{ fill: 'var(--good)' }}>
                {REAL_RATIO}× smaller
                <tspan fontWeight={400} style={{ fill: 'var(--text-2)' }}>
                  {' '}
                  · toy: {TOY_M} × {TOY_BITS}-bit codes
                </tspan>
              </text>
            </g>
          )}

          {/* counters: IVF vs brute force */}
          <g>
            <text x={PANEL} y={Y_CNT} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
              vectors measured (distance to q)
            </text>
            <text x={PANEL} y={Y_CNT + 16} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              {pqMode ? 'IVF-PQ' : 'IVF'}
            </text>
            <rect x={BAR_X} y={Y_CNT + 8} width={BAR_W} height={9} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
            <rect x={BAR_X} y={Y_CNT + 8} width={(BAR_W * f.ncent) / scaleMax} height={9} rx={1} fill="var(--muted)" />
            <rect
              x={BAR_X + (BAR_W * f.ncent) / scaleMax}
              y={Y_CNT + 8}
              width={(BAR_W * f.scannedPts.length) / scaleMax}
              height={9}
              rx={1}
              fill="var(--accent)"
            />
            <text x={588} y={Y_CNT + 16} textAnchor="end" fontSize={10} fontWeight={700}>
              {measured}
            </text>
            <text x={PANEL} y={Y_CNT + 32} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              brute
            </text>
            <rect x={BAR_X} y={Y_CNT + 24} width={(BAR_W * NPTS) / scaleMax} height={9} rx={3} fill="var(--warn)" />
            <text x={588} y={Y_CNT + 32} textAnchor="end" fontSize={10} fontWeight={700}>
              {NPTS}
            </text>
            <text x={PANEL} y={Y_CNT + 47} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
              {f.ncent} centroids + {f.scannedPts.length} {pqMode ? 'codes' : 'vectors'} in lists
              {f.nrerank ? ` + ${f.nrerank} exact` : ''}
            </text>
          </g>

          {/* results */}
          {f.top.length > 0 && (
            <text x={PANEL} y={Y_RES} fontSize={10.5} style={{ fill: 'var(--text-2)' }}>
              {f.found ? `returned top ${K}` : `best ${K} so far${pqMode ? ' (PQ)' : ''}`}:{' '}
              <tspan style={{ fontFamily: 'var(--mono)', fill: 'var(--good)' }}>{(f.found ?? f.top).join(' ')}</tspan>
            </text>
          )}
          {f.truth && (
            <>
              <text x={PANEL} y={Y_RES + 18} fontSize={10.5} style={{ fill: 'var(--text-2)' }}>
                exact top {K}: <tspan style={{ fontFamily: 'var(--mono)', fill: 'var(--text)' }}>{f.truth.join(' ')}</tspan>
              </text>
              <text x={PANEL} y={Y_RES + 42} fontSize={15} fontWeight={700} style={{ fill: recall === K ? 'var(--good)' : 'var(--bad)' }}>
                recall@{K} = {recall}/{K}
              </text>
            </>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
