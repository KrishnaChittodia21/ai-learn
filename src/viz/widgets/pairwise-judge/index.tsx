import { useState } from 'react';
import { Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { fromFrameTurn } from '../_shared/yourTurn.ts';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, ITEMS, MAX_BIAS, MIN_BIAS, TIE_BAND, simulate, winRateB, type Params, type Tally, type Verdict } from './sim';

const VC: Record<Verdict, string> = { A: 'var(--c-ion)', B: 'var(--c-pulsar)', tie: 'var(--text-2)' };
const COLS = { v1: 300, v2: 380, fin: 460, truth: 548 };
const ROW0 = 96;
const ROW_H = 21;

function Chip({ x, y, v, strong }: { x: number; y: number; v: Verdict | null; strong?: boolean }) {
  if (!v) return <text x={x} y={y + 4} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>·</text>;
  return (
    <g>
      <rect x={x - 26} y={y - 8} width={52} height={16} rx={8} fill="var(--surface)" stroke={VC[v]} strokeWidth={strong ? 2 : 1} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} style={{ fill: VC[v] }}>
        {v === 'tie' ? 'tie' : `${v} wins`}
      </text>
    </g>
  );
}

function Bar({ y, label, t }: { y: number; label: string; t: Tally }) {
  const n = ITEMS.length;
  const order: Verdict[] = ['A', 'B', 'tie'];
  const parts = order.map((v, k) => ({ v, x: 200 + (300 * order.slice(0, k).reduce((a, u) => a + t[u], 0)) / n, w: (300 * t[v]) / n }));
  return (
    <g>
      <text x={8} y={y + 10} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
        {label}
      </text>
      <rect x={200} y={y} width={300} height={13} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
      {parts.map((p) => p.w > 0 && <rect key={p.v} x={p.x} y={y} width={p.w} height={13} fill={VC[p.v]} opacity={0.85} style={{ transition: 'x 0.3s ease, width 0.3s ease' }} />)}
      <text x={508} y={y + 10} fontSize={9.5} style={{ fontFamily: 'var(--mono)' }}>
        A {t.A} · B {t.B} · tie {t.tie}
      </text>
    </g>
  );
}

export default function PairwiseJudgeViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const cur = f.item >= 0 ? f.rows[f.item] : null;
  const first = f.order === 'BA' ? 'B' : 'A';
  const second = first === 'A' ? 'B' : 'A';
  const shownVerdict = cur ? (f.order === 'AB' ? cur.v1 : cur.v2) : null;

  const aria = `Pairwise judge, position bias ${params.bias}. ${cur ? `Judging "${cur.input}" in order ${f.order}: verdict ${shownVerdict}. ` : ''}Single order tally A ${f.naive.A}, B ${f.naive.B}, ties ${f.naive.tie}. Both orders tally A ${f.consistent.A}, B ${f.consistent.B}, ties ${f.consistent.tie}; ${f.flips} flips.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={f.yourTurn && fromFrameTurn(f.yourTurn, stepper.i)}
      controls={<Slider label="Position bias (bonus for the answer shown first)" value={params.bias} min={MIN_BIAS} max={MAX_BIAS} step={0.5} format={(v) => `+${v}`} onChange={(bias) => setParams({ bias })} />}
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--c-ion)' }} /> A = prompt v12
          <span className="viz-key" style={{ background: 'var(--c-pulsar)' }} /> B = prompt v13
          <span className="viz-key" style={{ background: 'var(--text-2)' }} /> tie (or orders disagree)
        </>
      }
    >
      <WideSvg label="Pairwise judge">
        <svg viewBox="0 0 600 344" className="viz-svg" role="img" aria-label={aria}>
          {/* what the judge sees now */}
          <text x={8} y={14} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            {cur ? `judge prompt: "${cur.input}" — which answer is better?` : 'judge prompt: same input, two answers, "A", "B" or "tie"'}
          </text>
          {[first, second].map((v, k) => (
            <g key={k} opacity={cur ? 1 : 0.5}>
              <rect x={8 + k * 180} y={24} width={168} height={38} rx={8} fill="var(--surface-2)" stroke={VC[v as Verdict]} strokeWidth={1.5} />
              <text x={18 + k * 180} y={40} fontSize={10} fontWeight={700} style={{ fill: VC[v as Verdict] }}>
                {k === 0 ? '1st' : '2nd'} shown: {v} ({v === 'A' ? 'v12' : 'v13'})
              </text>
              <text x={18 + k * 180} y={54} fontSize={9} style={{ fill: k === 0 && params.bias > 0 ? 'var(--warn)' : 'var(--text-2)' }}>
                {k === 0 ? (params.bias > 0 ? `+${params.bias} position bonus` : 'no bonus') : 'no bonus'}
              </text>
            </g>
          ))}
          <text x={372} y={47} fontSize={14} style={{ fill: 'var(--text-2)' }}>
            →
          </text>
          {cur ? <Chip x={420} y={43} v={shownVerdict} strong /> : <text x={396} y={47} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>verdict</text>}
          <text x={592} y={47} textAnchor="end" fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            {f.judgeCalls} judge calls
          </text>

          {/* per-pair table */}
          {[
            ['input', 8, 'start'],
            ['(A, B)', COLS.v1, 'middle'],
            ['(B, A)', COLS.v2, 'middle'],
            ['recorded', COLS.fin, 'middle'],
            ['really better', COLS.truth, 'middle'],
          ].map(([t, x, a]) => (
            <text key={t as string} x={x as number} y={ROW0 - 12} textAnchor={a as 'start' | 'middle'} fontSize={9} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
              {t}
            </text>
          ))}
          {f.rows.map((r, k) => {
            const y = ROW0 + k * ROW_H;
            const on = k === f.item;
            const flip = r.final !== null && r.v1 !== r.v2;
            const truth = Math.abs(r.gap) <= TIE_BAND ? 'about equal' : r.gap > 0 ? 'B' : 'A';
            return (
              <g key={k} opacity={r.v1 || on ? 1 : 0.45}>
                {on && <rect x={4} y={y - 10} width={592} height={20} rx={5} fill="var(--accent-soft)" />}
                <text x={8} y={y + 3.5} fontSize={9.5} fontWeight={on ? 700 : 400}>
                  {r.input}
                </text>
                <Chip x={COLS.v1} y={y} v={r.v1} />
                <Chip x={COLS.v2} y={y} v={r.v2} />
                <Chip x={COLS.fin} y={y} v={r.final} strong />
                {flip && (
                  <text x={COLS.fin + 30} y={y + 3.5} fontSize={9} fontWeight={700} style={{ fill: 'var(--warn)' }}>
                    ⇄
                  </text>
                )}
                <text x={COLS.truth} y={y + 3.5} textAnchor="middle" fontSize={9} style={{ fill: r.final ? (truth === 'about equal' ? 'var(--text-2)' : VC[truth as Verdict]) : 'transparent' }}>
                  {truth}
                </text>
              </g>
            );
          })}

          <Bar y={ROW0 + ITEMS.length * ROW_H + 4} label={`single order (A first) · B ${Math.round(winRateB(f.naive) * 100)}%`} t={f.naive} />
          <Bar y={ROW0 + ITEMS.length * ROW_H + 24} label={`both orders · B ${Math.round(winRateB(f.consistent) * 100)}%`} t={f.consistent} />
          <text x={8} y={338} fontSize={9} style={{ fill: 'var(--text-2)' }}>
            {f.flips} flip{f.flips === 1 ? '' : 's'} ⇄ so far · win rate of B = (B wins + 0.5 × ties) / pairs judged
          </text>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
