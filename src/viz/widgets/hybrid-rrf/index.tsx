import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { DEFAULT_PARAMS, SCENARIOS, simulate, type Hit, type Params, type QueryId } from './sim';

const ROW = 30;
const TOPY = 44;
const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

export default function HybridRrfViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const s = SCENARIOS[params.query];
  const hot = f.current;
  const winner = f.fused?.[0] ?? null;

  const list = (hits: Hit[], x: number, title: string, show: boolean, fmt: (v: number) => string) => (
    <g>
      <text x={x} y={TOPY - 14} fontSize={11.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
        {title}
      </text>
      {show &&
        hits.map((h, r) => {
          const isHot = hot === h.id;
          const isCons = h.id === s.consensus && (f.stage === 'fused' || f.stage === 'kcompare' || f.stage === 'done' || f.stage === 'dense');
          return (
            <g key={h.id}>
              <rect
                x={x}
                y={TOPY + r * ROW}
                width={184}
                height={ROW - 4}
                rx={5}
                fill={isHot ? 'var(--accent-soft)' : isCons ? 'var(--good-soft)' : 'var(--surface-2)'}
                stroke={isHot ? 'var(--accent)' : isCons ? 'var(--good)' : 'var(--border)'}
                strokeWidth={isHot ? 2 : 1}
              />
              <text x={x + 6} y={TOPY + r * ROW + 12} fontSize={10.5} fontWeight={700}>
                #{r + 1} {h.id}
              </text>
              <text x={x + 178} y={TOPY + r * ROW + 12} textAnchor="end" fontSize={9.5} style={{ fontFamily: 'var(--mono)', fill: 'var(--text-2)' }}>
                {fmt(h.score)}
              </text>
              <text x={x + 6} y={TOPY + r * ROW + 22} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                {short(s.docs[h.id], 38)}
              </text>
            </g>
          );
        })}
    </g>
  );

  const rows = f.fused ? f.fused.map((id) => f.scored.find((x) => x.id === id)!).filter(Boolean) : f.scored;
  const maxScore = Math.max(1e-9, ...f.scored.map((x) => x.score));

  const aria = `Reciprocal rank fusion for "${s.query}" with k = ${params.k}.${f.fused ? ` Fused order: ${f.fused.join(', ')}.` : ''}`;

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
            options={(Object.keys(SCENARIOS) as QueryId[]).map((k) => ({ value: k, label: `“${SCENARIOS[k].query}”` }))}
            onChange={(query) => setParams((p) => ({ ...p, query }))}
          />
          <Slider label="RRF k" value={params.k} min={0} max={100} onChange={(k) => setParams((p) => ({ ...p, k }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> document being scored
          <span className="viz-key" style={{ background: 'var(--good)' }} /> mid-ranked in both lists / fused #1
          <span className="viz-key" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} /> other hits
        </>
      }
    >
      <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
        {list(s.bm25, 8, 'BM25 (keyword) score', f.showBm25, (v) => v.toFixed(1))}
        {list(s.dense, 204, 'Dense (cosine) score', f.showDense, (v) => v.toFixed(2))}

        <text x={400} y={TOPY - 14} fontSize={11.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          RRF = Σ 1/(k + rank), k = {params.k}
        </text>
        {rows.map((r, i) => {
          const y = TOPY + i * 24;
          const isWin = r.id === winner;
          return (
            <g key={r.id}>
              <text x={400} y={y + 12} fontSize={10.5} fontWeight={700} style={{ fill: isWin ? 'var(--good)' : hot === r.id ? 'var(--accent)' : 'var(--text)' }}>
                {f.fused ? `#${i + 1} ` : ''}
                {r.id}
              </text>
              <rect x={440} y={y + 3} width={110} height={11} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
              {/* stacked contributions: BM25 part then dense part */}
              {r.rb !== null && <rect x={440} y={y + 3} width={(110 * (1 / (params.k + r.rb))) / maxScore} height={11} rx={2} fill="var(--warn)" opacity={0.85} />}
              {r.rd !== null && (
                <rect x={440 + (r.rb !== null ? (110 * (1 / (params.k + r.rb))) / maxScore : 0)} y={y + 3} width={(110 * (1 / (params.k + r.rd))) / maxScore} height={11} rx={2} fill="var(--accent)" opacity={0.85} />
              )}
              <text x={592} y={y + 12} textAnchor="end" fontSize={9} style={{ fontFamily: 'var(--mono)' }}>
                {r.score.toFixed(4)}
              </text>
            </g>
          );
        })}
        {f.scored.length > 0 && (
          <text x={400} y={TOPY + 8 * 24 + 8} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            bar = <tspan style={{ fill: 'var(--warn)' }}>BM25 part</tspan> + <tspan style={{ fill: 'var(--accent)' }}>dense part</tspan>
          </text>
        )}

        {/* bottom panel */}
        {f.kTable ? (
          <g>
            <text x={8} y={242} fontSize={11} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
              fused top-3 by k
            </text>
            {f.kTable.map((row, c) => (
              <g key={row.k}>
                <rect x={8 + c * 96} y={250} width={90} height={62} rx={6} fill={row.k === params.k ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke="var(--border)" />
                <text x={53 + c * 96} y={266} textAnchor="middle" fontSize={10.5} fontWeight={700}>
                  k = {row.k}
                </text>
                <text x={53 + c * 96} y={286} textAnchor="middle" fontSize={11} style={{ fontFamily: 'var(--mono)', fill: row.top[0] === s.consensus ? 'var(--good)' : 'var(--bad)' }}>
                  {row.top.join(' ')}
                </text>
                <text x={53 + c * 96} y={303} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>
                  {row.top[0] === s.consensus ? 'consensus wins' : 'a #1 wins'}
                </text>
              </g>
            ))}
          </g>
        ) : (
          <g>
            <rect x={8} y={236} width={380} height={76} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
            <text x={18} y={256} fontSize={10.5} fontWeight={700}>
              query: “{s.query}”
            </text>
            <text x={18} y={276} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              {hot ? `${hot}: ${short(s.docs[hot], 58)}` : winner ? `fused #1 ${winner}: ${short(s.docs[winner], 50)}` : 'keyword + semantic retrieval, fused by rank'}
            </text>
            {hot && (
              <text x={18} y={296} fontSize={10} style={{ fontFamily: 'var(--mono)' }}>
                {(() => {
                  const r = f.scored.find((x) => x.id === hot)!;
                  return `${r.rb ? `1/(${params.k}+${r.rb})` : '0'} + ${r.rd ? `1/(${params.k}+${r.rd})` : '0'} = ${r.score.toFixed(4)}`;
                })()}
              </text>
            )}
          </g>
        )}
      </svg>
    </VizFrame>
  );
}
