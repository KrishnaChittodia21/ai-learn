import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import {
  ALPHA_MAX,
  ALPHA_MIN,
  ALPHA_STEP,
  DEFAULT_PARAMS,
  MODEL,
  Q,
  R_MAX,
  R_MIN,
  TOY_D,
  TOY_TARGET,
  TOY_X,
  fmtGB,
  fmtInt,
  fmtM,
  fmtMB,
  fmtPct,
  loraParams,
  perMatrixFull,
  perMatrixLora,
  simulate,
  trainMemGB,
  type Params,
  type Precision,
  type Targets,
} from './sim';

const C = 11; // toy cell size
const MY = 44; // matrix row top
const WX = 14;
const BX = 124;
const AX = 182;
const DX = 300;

function cellFill(v: number, max: number) {
  const a = Math.min(1, Math.abs(v) / (max || 1));
  if (a < 0.02) return 'var(--surface-2)';
  return `color-mix(in srgb, ${v >= 0 ? 'var(--accent)' : 'var(--warn)'} ${Math.round(12 + a * 78)}%, var(--surface))`;
}

const maxAbs = (m: number[][]) => Math.max(1e-9, ...m.flat().map(Math.abs));
const mv = (m: number[][], x: number[]) => m.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
const TGT_MAX = maxAbs(TOY_TARGET);

function Grid({ m, x, y, max, label, sub, stroke = 'var(--border)', zeroText = false }: { m: number[][]; x: number; y: number; max: number; label: string; sub?: string; stroke?: string; zeroText?: boolean }) {
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  return (
    <g>
      <text x={x} y={y - 16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text)' }}>
        {label}
      </text>
      {sub && (
        <text x={x} y={y - 5} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
          {sub}
        </text>
      )}
      {m.map((row, i) =>
        row.map((v, j) => (
          <g key={`${i}-${j}`}>
            <rect x={x + j * C} y={y + i * C} width={C} height={C} fill={cellFill(v, max)} stroke="var(--border)" strokeWidth={0.5} />
            {zeroText && Math.abs(v) < 1e-9 && (
              <text x={x + j * C + C / 2} y={y + i * C + 8} textAnchor="middle" fontSize={7} style={{ fill: 'var(--muted)' }}>
                0
              </text>
            )}
          </g>
        )),
      )}
      <rect x={x} y={y} width={cols * C} height={rows * C} fill="none" stroke={stroke} strokeWidth={stroke === 'var(--border)' ? 1 : 2} />
    </g>
  );
}

function Vec({ v, x, y, max, label }: { v: number[]; x: number; y: number; max: number; label: string }) {
  return (
    <g>
      <text x={x - 6} y={y + 9} textAnchor="end" fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
        {label}
      </text>
      {v.map((z, j) => (
        <g key={j}>
          <rect x={x + j * 24} y={y} width={23} height={12} rx={2} fill={cellFill(z, max)} stroke="var(--border)" strokeWidth={0.5} />
          <text x={x + j * 24 + 11.5} y={y + 9} textAnchor="middle" fontSize={7.5} style={{ fill: 'var(--text)', fontFamily: 'var(--mono)' }}>
            {Math.abs(z) < 0.005 ? '0' : z.toFixed(2).replace('0.', '.')}
          </text>
        </g>
      ))}
    </g>
  );
}

export default function LoraUpdateViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const { r, alpha, targets, precision } = params;
  const s = alpha / r;

  const total = loraParams(r, targets);
  const lpm = perMatrixLora(r);
  const mem = [
    { k: 'full', label: 'Full FT', gb: trainMemGB('full', 0) },
    { k: 'lora', label: 'LoRA (bf16 base)', gb: trainMemGB('lora', total) },
    { k: 'qlora', label: 'QLoRA (NF4 base)', gb: trainMemGB('qlora', total) },
  ];
  const chosen = precision === '4' ? 'qlora' : 'lora';
  const memMax = mem[0].gb;

  const hBase = mv(f.W, TOY_X);
  const dWx = f.dW && !f.merged ? mv(f.dW, TOY_X) : null;
  const hOut = dWx ? hBase.map((v, i) => v + dWx[i]) : hBase;
  const vmax = Math.max(1, ...hBase.map(Math.abs), ...hOut.map(Math.abs));
  const firstStep = f.stage === 'train' && f.step === 1;

  const aria = `LoRA, rank ${r}, alpha ${alpha}, scale ${s.toFixed(2)}. ${f.merged ? 'Adapter merged into W.' : f.B ? `Adapters attached${f.step ? `, training step ${f.step}, fit error ${f.err?.toFixed(2)}` : ', B is zero so delta W is zero'}.` : 'Frozen W only.'} Real model: ${fmtInt(total)} trainable parameters, ${fmtPct(total / MODEL.params)} of ${MODEL.label}; training memory ${fmtGB(mem.find((m) => m.k === chosen)!.gb)} versus ${fmtGB(memMax)} for full fine-tuning.`;

  const sec = (key: 'matrix' | 'model' | 'memory', y: number, h: number) => (
    <rect x={404} y={y} width={190} height={h} rx={6} fill={f.panel === key ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={f.panel === key ? 'var(--accent)' : 'var(--border)'} strokeWidth={f.panel === key ? 1.6 : 1} />
  );

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Slider label="rank r" value={r} min={R_MIN} max={R_MAX} onChange={(v) => setParams((p) => ({ ...p, r: v }))} />
          <Slider label="alpha α" value={alpha} min={ALPHA_MIN} max={ALPHA_MAX} step={ALPHA_STEP} onChange={(v) => setParams((p) => ({ ...p, alpha: v }))} format={(v) => `${v} (α/r = ${(v / r).toFixed(v % r === 0 ? 0 : 2)})`} />
          <Choice<Targets>
            label="Target modules"
            value={targets}
            options={[
              { value: 'attn', label: 'attention (q,k,v,o)' },
              { value: 'all', label: 'all-linear (+ MLP)' },
            ]}
            onChange={(v) => setParams((p) => ({ ...p, targets: v }))}
          />
          <Choice<Precision>
            label="Base precision"
            value={precision}
            options={[
              { value: '16', label: '16-bit (LoRA)' },
              { value: '4', label: '4-bit NF4 (QLoRA)' },
            ]}
            onChange={(v) => setParams((p) => ({ ...p, precision: v }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> positive value
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> negative value
          <span className="viz-key" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} /> ≈ 0
          <span className="viz-key ring" style={{ borderColor: 'var(--good)' }} /> trainable
        </>
      }
    >
      <WideSvg label="LoRA diagram">
        <svg viewBox="0 0 600 340" className="viz-svg" role="img" aria-label={aria}>
          <text x={WX} y={12} fontSize={9.5} style={{ fill: 'var(--muted)' }}>
            toy size: d_out = d_in = {TOY_D}, drawn rank {f.rt}
            {r > f.rt ? ` (real r = ${r})` : ''} · h = W·x + (α/r)·B·A·x
          </text>

          {/* W or W' */}
          <Grid m={f.W} x={WX} y={MY} max={1.2} label={f.merged ? "W' = W + ΔW" : 'W (frozen)'} sub={f.merged ? 'one matrix again' : `${Q.dOut}×${Q.dIn}, no grads`} stroke={f.merged ? 'var(--accent)' : 'var(--border)'} />
          {!f.merged && (
            <text x={WX + TOY_D * C + 11} y={MY + 48} textAnchor="middle" fontSize={16} fontWeight={700} style={{ fill: f.B ? 'var(--text)' : 'var(--border)' }}>
              +
            </text>
          )}

          {f.B && !f.merged ? (
            <>
              <Grid m={f.B} x={BX} y={MY} max={maxAbs(f.B)} label="B" sub={`${Q.dOut}×${r}`} stroke="var(--good)" zeroText />
              <text x={AX - 6} y={MY + 22} textAnchor="middle" fontSize={13} fontWeight={700} style={{ fill: 'var(--text)' }}>
                ·
              </text>
            </>
          ) : (
            !f.merged && (
              <text x={BX} y={MY + 40} fontSize={9} style={{ fill: 'var(--muted)' }}>
                {f.A ? 'B: next' : 'no adapter yet'}
              </text>
            )
          )}
          {f.A && !f.merged && (
            <g>
              <Grid m={f.A} x={AX} y={MY} max={0.65} label="A" sub={`${r}×${Q.dIn}`} stroke={firstStep ? 'var(--muted)' : 'var(--good)'} />
              {firstStep && (
                <text x={AX} y={MY + f.rt * C + 12} fontSize={8.5} fontWeight={700} style={{ fill: 'var(--warn)' }}>
                  unchanged at step 1 (∂A ∝ Bᵀ = 0)
                </text>
              )}
              <text x={AX + 44} y={MY + f.rt * C + (firstStep ? 26 : 14)} textAnchor="middle" fontSize={10} style={{ fill: 'var(--text-2)' }}>
                × α/r = {alpha}/{r} = {Number.isInteger(s) ? s : s.toFixed(2)}
              </text>
            </g>
          )}

          {f.dW && !f.merged && (
            <>
              <text x={DX - 12} y={MY + 48} textAnchor="middle" fontSize={16} fontWeight={700} style={{ fill: 'var(--text)' }}>
                =
              </text>
              <Grid m={f.dW} x={DX} y={MY} max={TGT_MAX} label="ΔW = (α/r)·B·A" sub={f.step ? `after step ${f.step}` : 'all zeros at init'} stroke={f.stage === 'zero' ? 'var(--accent)' : 'var(--border)'} zeroText={f.stage === 'zero' || f.stage === 'addB' || f.stage === 'scale'} />
            </>
          )}

          {/* needed update (what fine-tuning should learn) */}
          {(f.stage === 'train' || f.stage === 'scale' || f.stage === 'count') && (
            <g>
              <Grid m={TOY_TARGET} x={DX} y={178} max={TGT_MAX} label="needed ΔW (rank 2)" sub="training target" />
            </g>
          )}

          {/* forward pass vectors */}
          <g>
            <text x={WX} y={168} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
              forward pass (toy)
            </text>
            <Vec v={TOY_X} x={56} y={176} max={1} label="x" />
            <Vec v={hBase} x={56} y={194} max={vmax} label={f.merged ? "W'·x" : 'W·x'} />
            {dWx && <Vec v={dWx} x={56} y={212} max={vmax} label="ΔW·x" />}
            {dWx && <Vec v={hOut} x={56} y={230} max={vmax} label="h" />}
            {f.merged && (
              <text x={56} y={222} fontSize={9.5} style={{ fill: 'var(--good)' }}>
                one matmul: identical h, zero extra latency
              </text>
            )}
          </g>

          {/* fit error */}
          {f.err !== null && (
            <g>
              <text x={WX} y={268} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                fit error ‖ΔW − needed‖ / ‖needed‖ after step {f.step}
              </text>
              <rect x={WX} y={274} width={240} height={10} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
              <rect x={WX} y={274} width={Math.min(240, 160 * f.err)} height={10} rx={3} fill={f.err < 0.1 ? 'var(--good)' : f.err > 1 ? 'var(--bad)' : 'var(--warn)'} />
              <line x1={WX + 160} y1={271} x2={WX + 160} y2={287} stroke="var(--text-2)" strokeDasharray="2 2" />
              <text x={WX + 162} y={297} fontSize={8.5} style={{ fill: 'var(--muted)' }}>
                1.0 = nothing learned
              </text>
              <text x={WX + 246} y={283} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text)' }}>
                {f.err.toFixed(3)}
              </text>
            </g>
          )}
          <text x={WX} y={326} fontSize={9.5} style={{ fill: 'var(--muted)' }}>
            {f.B ? `real q_proj: B ${Q.dOut}×${r} + A ${r}×${Q.dIn} = ${fmtInt(lpm)} trainable vs ${fmtInt(perMatrixFull)} frozen` : `real q_proj: ${fmtInt(perMatrixFull)} frozen weights`}
          </text>

          {/* real-model side panel */}
          <text x={404} y={12} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            real: {MODEL.label}, {MODEL.layers} layers
          </text>
          {sec('matrix', 20, 76)}
          <text x={412} y={36} fontSize={9.5} fontWeight={700}>
            one matrix (q_proj {Q.dOut}×{Q.dIn})
          </text>
          <text x={412} y={52} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            full d·k
          </text>
          <text x={586} y={52} textAnchor="end" fontSize={9.5} fontWeight={700} style={{ fontFamily: 'var(--mono)' }}>
            {fmtInt(perMatrixFull)}
          </text>
          <text x={412} y={68} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            LoRA r·(d+k)
          </text>
          <text x={586} y={68} textAnchor="end" fontSize={9.5} fontWeight={700} style={{ fontFamily: 'var(--mono)', fill: 'var(--good)' }}>
            {fmtInt(lpm)}
          </text>
          <text x={412} y={86} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            = {fmtPct(lpm / perMatrixFull)} of the matrix · scale α/r = {Number.isInteger(s) ? s : s.toFixed(3)}
          </text>

          {sec('model', 102, 92)}
          <text x={412} y={118} fontSize={9.5} fontWeight={700}>
            whole model · {targets === 'attn' ? 'q,k,v,o' : 'q,k,v,o,gate,up,down'}
          </text>
          <text x={412} y={136} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            trainable
          </text>
          <text x={586} y={136} textAnchor="end" fontSize={11} fontWeight={700} style={{ fontFamily: 'var(--mono)', fill: 'var(--good)' }}>
            {fmtInt(total)}
          </text>
          <text x={412} y={152} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            of {(MODEL.params / 1e9).toFixed(2)}B params
          </text>
          <text x={586} y={152} textAnchor="end" fontSize={11} fontWeight={700}>
            {fmtPct(total / MODEL.params)}
          </text>
          <text x={412} y={168} fontSize={9} style={{ fill: 'var(--text-2)' }}>
            attn-only {fmtM(loraParams(r, 'attn'))} · all-linear {fmtM(loraParams(r, 'all'))}
          </text>
          <text x={412} y={184} fontSize={9} style={{ fill: 'var(--text-2)' }}>
            adapter file (bf16): {fmtMB(total * 2)}
          </text>

          {sec('memory', 200, 132)}
          <text x={412} y={216} fontSize={9.5} fontWeight={700}>
            training memory (≈, +4 GB act., ×1.1)
          </text>
          {mem.map((m, k) => {
            const on = m.k === chosen;
            return (
              <g key={m.k}>
                <text x={412} y={236 + k * 30} fontSize={9.5} fontWeight={on ? 700 : 400} style={{ fill: on ? 'var(--text)' : 'var(--text-2)' }}>
                  {m.label}
                  {on ? ' ◀ selected' : ''}
                </text>
                <text x={586} y={236 + k * 30} textAnchor="end" fontSize={9.5} fontWeight={700} style={{ fill: m.k === 'full' ? 'var(--bad)' : on ? 'var(--good)' : 'var(--text-2)' }}>
                  {fmtGB(m.gb)}
                </text>
                <rect x={412} y={240 + k * 30} width={174} height={8} rx={3} fill="var(--surface)" stroke="var(--border)" />
                <rect x={412} y={240 + k * 30} width={Math.max(2, (174 * m.gb) / memMax)} height={8} rx={3} fill={m.k === 'full' ? 'var(--bad)' : on ? 'var(--good)' : 'var(--muted)'} />
              </g>
            );
          })}
          <text x={412} y={326} fontSize={8.5} style={{ fill: 'var(--muted)' }}>
            B/param: full 16 · LoRA 2 · QLoRA ≈ 0.52
          </text>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
