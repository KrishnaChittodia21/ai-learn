import { useState } from 'react';
import { Choice, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { DEFAULT_PARAMS, D_OPTIONS, M_OPTIONS, N_OPTIONS, PICK_LABEL, RAM_OPTIONS, choose, fmtN, gb, rows, simulate, type Params, type Pick } from './sim';
import './index.css';

const PICKS: Pick[] = ['flat', 'hnsw', 'halfvec', 'quantized', 'diskann'];

export default function VectorIndexChoiceViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const raw = useFrames(frames);
  const f = raw.frame;
  const R = rows(params);
  const answer = choose(params);
  const max = Math.max(params.ramGB, ...R.map((r) => r.ramGB)) * 1.05;
  const x = (gbv: number) => `${Math.min(100, (gbv / max) * 100)}%`;
  const set = (p: Partial<Params>) => setParams((v) => ({ ...v, ...p }));
  const opt = <T extends number>(xs: readonly T[], fmt: (v: T) => string) => xs.map((v) => ({ value: String(v), label: fmt(v) }));

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={raw}
      turn={
        f.turn && {
          kind: 'choice',
          // one turn per workload: changing a dial asks again
          id: `choose-${JSON.stringify(params)}`,
          at: raw.i,
          question: `Which index would you deploy for ${fmtN(params.n)} × ${params.dims}-dim vectors on ${params.ramGB} GB, serving an interactive app?`,
          options: PICKS.map((p) => ({ id: p, label: PICK_LABEL[p] })),
          answer: answer.pick,
          hint: 'Start with the smallest collections (under ~100K, exact search is cheap). Otherwise take the most accurate HNSW variant whose bar is green; if none is green, the graph has to leave RAM.',
          why: `${PICK_LABEL[answer.pick]}: ${answer.reason}. Try other dials: a smaller machine or 50M vectors changes the answer.`,
        }
      }
      controls={
        <>
          <Choice label="Vectors" value={String(params.n)} options={opt(N_OPTIONS, fmtN)} onChange={(v) => set({ n: Number(v) })} />
          <Choice label="Dims" value={String(params.dims)} options={opt(D_OPTIONS, String)} onChange={(v) => set({ dims: Number(v) })} />
          <Choice label="HNSW M" value={String(params.M)} options={opt(M_OPTIONS, String)} onChange={(v) => set({ M: Number(v) })} />
          <Choice label="RAM" value={String(params.ramGB)} options={opt(RAM_OPTIONS, (v) => `${v} GB`)} onChange={(v) => set({ ramGB: Number(v) })} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--good)' }} /> fits the budget
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> too big
          <span className="viz-key" style={{ background: 'var(--c-solar)' }} /> budget = ½ RAM
          <span className="viz-key" style={{ background: 'var(--text-2)' }} /> RAM
        </>
      }
    >
      <div className="vic" role="list" aria-label="RAM each index needs">
        <div className="vic-head">
          {fmtN(params.n)} × {params.dims} dims · RAM {params.ramGB} GB · budget {gb(params.ramGB / 2)}
        </div>
        {R.map((r, i) => {
          const on = i < f.shown;
          const win = f.verdict?.row === r.id;
          return (
            <div key={r.id} role="listitem" className={`vic-row${on ? '' : ' off'}${win ? ' win' : ''}`} aria-hidden={!on}>
              <div className="vic-top">
                <b>{r.label}</b>
                <span className="v">{on ? `${gb(r.ramGB)} ${r.fits ? '✓ fits' : '✗ over'}` : '…'}</span>
              </div>
              <div className="vic-track">
                <span className={`vic-fill ${r.fits ? 'fit' : 'over'}`} style={{ width: on ? x(r.ramGB) : '0%' }} />
                <span className="vic-mark" style={{ left: x(params.ramGB / 2) }} />
                <span className="vic-mark ram" style={{ left: x(params.ramGB) }} />
              </div>
              {on && <div className="vic-note">{r.note}</div>}
            </div>
          );
        })}
        <div className="vic-axis" aria-hidden>
          <span style={{ left: x(params.ramGB / 2) }}>½ RAM</span>
          <span style={{ left: x(params.ramGB) }}>{params.ramGB} GB</span>
        </div>
        {f.verdict && (
          <div className="vic-verdict">
            <b>{PICK_LABEL[f.verdict.pick]}</b> · {f.verdict.reason}
          </div>
        )}
      </div>
    </VizFrame>
  );
}
