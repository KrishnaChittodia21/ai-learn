import { useState } from 'react';
import { Choice, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { DEFAULT_PARAMS, DOCS, METRICS, QUERIES, norm, simulate, unit, type Metric, type Params, type QueryId } from './sim';

const OX = 112;
const OY = 300;

export default function VectorSimilarityViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const S = f.unitView ? 135 : 50;
  const P = (v: [number, number]) => (f.unitView ? unit(v) : v);
  const px = (v: [number, number]) => [OX + P(v)[0] * S, OY - P(v)[1] * S] as const;
  const q = QUERIES[params.query];
  const showQ = f.stage !== 'intro';
  const [qx, qy] = px(q.v);
  const top = f.ranking?.[0];
  const isEu = params.metric === 'euclidean';
  const finite = f.scores.filter((s): s is number => s !== null);
  const maxAbs = Math.max(1e-9, ...finite.map(Math.abs));

  const aria = `2-D embedding space, query "${q.text}", metric ${params.metric}, ${f.unitView ? 'normalised' : 'raw'} vectors.${f.ranking ? ` Ranking: ${f.ranking.join(', ')}.` : ''}`;

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
            options={(Object.keys(QUERIES) as QueryId[]).map((k) => ({ value: k, label: QUERIES[k].text }))}
            onChange={(query) => setParams((p) => ({ ...p, query }))}
          />
          <Choice<Metric> label="Metric" value={params.metric} options={METRICS.map((m) => ({ value: m, label: m }))} onChange={(metric) => setParams((p) => ({ ...p, metric }))} />
          <Choice<'on' | 'off'>
            label="L2-normalise"
            value={params.normalise ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'off' },
              { value: 'on', label: 'on' },
            ]}
            onChange={(v) => setParams((p) => ({ ...p, normalise: v === 'on' }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> query vector
          <span className="viz-key" style={{ background: 'var(--text-2)' }} /> document vector
          <span className="viz-key" style={{ background: 'var(--good)' }} /> top hit
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> document being scored
        </>
      }
    >
      <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
        {/* axes */}
        <line x1={14} y1={OY} x2={370} y2={OY} stroke="var(--border)" />
        <line x1={OX} y1={OY + 10} x2={OX} y2={20} stroke="var(--border)" />
        <text x={366} y={OY - 6} textAnchor="end" className="viz-label" style={{ fontSize: 10 }}>
          dim 1 (“account/password”)
        </text>
        <text x={OX + 6} y={28} className="viz-label" style={{ fontSize: 10 }}>
          dim 2 (“food”)
        </text>
        {f.unitView && <circle cx={OX} cy={OY} r={S} fill="none" stroke="var(--border)" strokeDasharray="4 3" />}
        {f.unitView && (
          <text x={OX + S * 0.72} y={OY - S * 0.72 - 6} className="viz-label" style={{ fontSize: 10 }}>
            |v| = 1
          </text>
        )}

        {/* euclidean distance line for current doc */}
        {showQ && isEu && f.current !== null && f.stage === 'score' && (
          <line x1={qx} y1={qy} x2={px(DOCS[f.current].v)[0]} y2={px(DOCS[f.current].v)[1]} stroke="var(--warn)" strokeWidth={2} strokeDasharray="5 3" />
        )}

        {DOCS.map((d, i) => {
          const [x, y] = px(d.v);
          const hot = f.current === i && f.stage === 'score';
          const win = top === d.id;
          const col = hot ? 'var(--warn)' : win ? 'var(--good)' : 'var(--text-2)';
          return (
            <g key={d.id}>
              <line x1={OX} y1={OY} x2={x} y2={y} stroke={col} strokeWidth={hot || win ? 2.6 : 1.4} opacity={hot || win ? 1 : 0.7} />
              <circle cx={x} cy={y} r={11} fill={win ? 'var(--good-soft)' : hot ? 'var(--warn-soft)' : 'var(--surface-2)'} stroke={col} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700}>
                {d.id}
              </text>
            </g>
          );
        })}
        {showQ && (
          <g>
            <line x1={OX} y1={OY} x2={qx} y2={qy} stroke="var(--accent)" strokeWidth={3} />
            <circle cx={qx} cy={qy} r={5} fill="var(--accent)" />
            <text x={qx + 8} y={qy + 16} fontSize={11} fontWeight={700} style={{ fill: 'var(--accent)' }}>
              q
            </text>
          </g>
        )}

        {/* right panel */}
        {!f.table ? (
          <g>
            <text x={388} y={24} fontSize={11} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
              {params.metric} {isEu ? '(lower = closer)' : '(higher = closer)'}
            </text>
            {DOCS.map((d, i) => {
              const s = f.scores[i];
              const y = 36 + i * 38;
              const rk = f.ranking ? f.ranking.indexOf(d.id) + 1 : null;
              return (
                <g key={d.id}>
                  <text x={388} y={y + 12} fontSize={11} fontWeight={700} style={{ fill: top === d.id ? 'var(--good)' : 'var(--text)' }}>
                    {rk ? `#${rk} ` : ''}
                    {d.id}
                  </text>
                  <text x={420} y={y + 12} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                    {d.text.length > 30 ? d.text.slice(0, 29) + '…' : d.text}
                  </text>
                  <rect x={420} y={y + 17} width={130} height={9} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
                  {s !== null && (
                    <rect
                      x={420}
                      y={y + 17}
                      width={Math.max(1, (130 * Math.abs(s)) / maxAbs)}
                      height={9}
                      rx={3}
                      fill={s < 0 ? 'var(--bad)' : f.current === i && f.stage === 'score' ? 'var(--warn)' : 'var(--accent)'}
                    />
                  )}
                  {s !== null && (
                    <text x={556} y={y + 25} fontSize={10} style={{ fontFamily: 'var(--mono)' }}>
                      {s.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ) : (
          <g>
            <text x={388} y={24} fontSize={11} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
              ranking by metric ({f.unitView ? 'normalised' : 'raw'} vectors)
            </text>
            {METRICS.map((m, c) => (
              <g key={m}>
                <text x={412 + c * 64} y={46} textAnchor="middle" fontSize={10.5} fontWeight={700} style={{ fill: m === params.metric ? 'var(--accent)' : 'var(--text)' }}>
                  {m}
                </text>
                {f.table![m].map((id, r) => {
                  const diff = f.table!.cosine[r] !== id;
                  return (
                    <g key={id}>
                      <rect x={392 + c * 64} y={54 + r * 30} width={40} height={24} rx={5} fill={r === 0 ? 'var(--good-soft)' : diff ? 'var(--warn-soft)' : 'var(--surface-2)'} stroke={r === 0 ? 'var(--good)' : 'var(--border)'} />
                      <text x={412 + c * 64} y={70 + r * 30} textAnchor="middle" fontSize={12} fontWeight={700}>
                        {id}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))}
            <text x={388} y={274} className="viz-label" style={{ fontSize: 10 }}>
              amber = differs from the cosine order
            </text>
            <text x={388} y={292} className="viz-label" style={{ fontSize: 10 }}>
              |q| = {norm(P(q.v)).toFixed(2)} · |C| = {norm(P(DOCS[2].v)).toFixed(2)} · |B| = {norm(P(DOCS[1].v)).toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </VizFrame>
  );
}
