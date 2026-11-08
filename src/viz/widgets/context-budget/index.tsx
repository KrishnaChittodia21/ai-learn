import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { fromFrameTurn } from '../_shared/yourTurn.ts';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, LAYOUT, MAX_RESERVE_K, MIN_RESERVE_K, WINDOWS_K, simulate, type Params, type SlotId } from './sim';

const COLOR: Record<SlotId, string> = {
  system: 'var(--accent)',
  tools: 'var(--c-ion)',
  docs: 'var(--c-nebula)',
  history: 'var(--c-pulsar)',
  toolResults: 'var(--good)',
  question: 'var(--text-2)',
};
const RAW_MAX = Math.max(...LAYOUT.map((s) => s.rawK));
const BAR_X = 150;
const BAR_W = 360;
const ROW0 = 76;
const ROW_H = 34;

export default function ContextBudgetViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;

  const rawTotal = frames[0].inputK;
  const scale = 584 / Math.max(rawTotal + f.reserveK, f.windowK);
  const winX = 8 + f.windowK * scale;
  const segs = f.slots.map((s, k) => ({ id: s.id, x: 8 + f.slots.slice(0, k).reduce((a, p) => a + p.tokensK, 0) * scale, w: s.tokensK * scale }));
  const inputEnd = 8 + f.inputK * scale;
  const reserveX = winX - f.reserveK * scale;
  const over = !f.fits;

  const aria = `Context window ${f.windowK}K, output reserve ${f.reserveK}K, input budget ${f.budgetK}K, input ${f.inputK}K, ${f.fits ? 'fits' : 'over budget'}. ${f.slots.map((s) => `${s.label} ${s.tokensK}K (${s.note})`).join('; ')}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={f.yourTurn && fromFrameTurn(f.yourTurn, stepper.i)}
      controls={
        <>
          <Choice<string>
            label="Window"
            value={String(params.windowK)}
            options={WINDOWS_K.map((w) => ({ value: String(w), label: `${w}K` }))}
            onChange={(v) => setParams((p) => ({ ...p, windowK: Number(v) }))}
          />
          <Slider label="Output reserve" value={params.reserveK} min={MIN_RESERVE_K} max={MAX_RESERVE_K} format={(v) => `${v}K`} onChange={(reserveK) => setParams((p) => ({ ...p, reserveK }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> output reserve
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> over budget
          <span className="viz-key ring" /> trimmed / summarised
          <span>📌 pinned, never trimmed</span>
        </>
      }
    >
      <WideSvg label="Context window budget">
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          <text x={8} y={14} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            window {f.windowK}K{f.reserveK ? ` = input budget ${f.budgetK}K + reserve ${f.reserveK}K` : ''} · input {f.inputK}K
          </text>
          {/* the window as one stacked bar */}
          <rect x={8} y={22} width={winX - 8} height={24} rx={4} fill="var(--surface-2)" stroke="var(--border)" />
          {segs.map((s) => (
            <rect key={s.id} x={s.x} y={24} width={Math.max(0, s.w - 1)} height={20} fill={COLOR[s.id]} opacity={f.focus && f.focus !== s.id ? 0.55 : 0.9} style={{ transition: 'x 0.3s ease, width 0.3s ease' }} />
          ))}
          {over && <rect x={Math.max(8, reserveX)} y={22} width={Math.max(0, inputEnd - Math.max(8, reserveX))} height={24} fill="var(--bad)" opacity={0.35} />}
          {f.reserveK > 0 && (
            <g>
              <rect x={reserveX} y={22} width={f.reserveK * scale} height={24} fill="var(--warn-soft)" stroke="var(--warn)" strokeWidth={1.5} />
              <text x={reserveX + (f.reserveK * scale) / 2} y={60} textAnchor="middle" fontSize={8.5} fontWeight={700} style={{ fill: 'var(--warn)' }}>
                reserve
              </text>
            </g>
          )}
          <line x1={winX} y1={16} x2={winX} y2={52} stroke="var(--text)" strokeWidth={2} />
          <text x={Math.min(winX + 4, 560)} y={60} fontSize={8.5} fontWeight={700} textAnchor={winX > 540 ? 'end' : 'start'}>
            {f.windowK}K limit
          </text>

          {/* one row per slot, in layout order */}
          {f.slots.map((s, k) => {
            const y = ROW0 + k * ROW_H;
            const focus = f.focus === s.id;
            const raw = LAYOUT[k].rawK;
            return (
              <g key={s.id}>
                <text x={8} y={y + 12} fontSize={10.5} fontWeight={700}>
                  {s.pinned ? '📌 ' : ''}
                  {s.label}
                </text>
                <text x={8} y={y + 25} fontSize={9} style={{ fill: s.trimmed ? 'var(--good)' : 'var(--text-2)' }}>
                  {s.note}
                </text>
                <rect x={BAR_X} y={y + 4} width={(BAR_W * raw) / RAW_MAX} height={16} rx={3} fill="none" stroke="var(--border)" strokeDasharray={s.trimmed ? '3 3' : undefined} />
                <rect x={BAR_X} y={y + 4} width={Math.max(2, (BAR_W * s.tokensK) / RAW_MAX)} height={16} rx={3} fill={COLOR[s.id]} stroke={focus ? 'var(--text)' : 'none'} strokeWidth={focus ? 2 : 0} style={{ transition: 'width 0.3s ease' }} />
                <text x={592} y={y + 16} textAnchor="end" fontSize={10} fontWeight={700} style={{ fontFamily: 'var(--mono)', fill: s.trimmed ? 'var(--good)' : 'var(--text)' }}>
                  {s.trimmed ? `${raw}→` : ''}
                  {s.tokensK}K
                </text>
              </g>
            );
          })}
          <text x={8} y={ROW0 + 6 * ROW_H + 12} fontSize={11} fontWeight={800} style={{ fill: f.fits ? 'var(--good)' : 'var(--bad)' }}>
            {f.stage === 'intro' ? `${f.inputK}K wanted` : f.fits ? `✓ fits: ${f.inputK}K of ${f.budgetK}K budget` : `✕ ${Math.round((f.inputK - f.budgetK) * 100) / 100}K over the ${f.budgetK}K budget`}
          </text>
          <text x={592} y={ROW0 + 6 * ROW_H + 12} textAnchor="end" fontSize={9} style={{ fill: 'var(--text-2)' }}>
            {f.trimsApplied} trim{f.trimsApplied === 1 ? '' : 's'} · top → bottom = prompt order
          </text>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
