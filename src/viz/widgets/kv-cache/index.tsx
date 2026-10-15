import { useState } from 'react';
import { Choice, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { DEFAULT_PARAMS, GENERATED, GPU_GB, MODELS, PROMPT, SEQ_LENS, fmtBytes, fmtFlops, kvBytesPerToken, simulate, type Params, type Preset } from './sim';

const CW = 30;
const CH = 15;
const GX = 74;
const GY = 46;
const ALL = [...PROMPT, ...GENERATED];

export default function KvCacheViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const m = MODELS[params.preset];
  const per = kvBytesPerToken(m);

  // history grid rows: prefill + decode frames up to the current one
  const hist = frames.slice(0, stepper.i + 1).filter((x) => x.stage === 'prefill' || x.stage === 'decode');
  const lastRun = frames.filter((x) => x.stage === 'prefill' || x.stage === 'decode').pop()!;
  const maxTotal = Math.max(lastRun.totalFlops, lastRun.otherTotal);
  const cacheTotal = params.cache ? f.totalFlops : f.otherTotal;
  const noCacheTotal = params.cache ? f.otherTotal : f.totalFlops;

  const weights = m.params * m.bytes;
  const gpu = GPU_GB * 2 ** 30;
  const longStage = f.longBytes !== null && !f.prefix && f.stage !== 'formula';

  const aria = `KV cache ${params.cache ? 'on' : 'off'} for ${m.label}: ${f.tokens.length} tokens, cache ${fmtBytes(f.cacheBytes)}, this step ${fmtFlops(f.stepFlops)}, total ${fmtFlops(f.totalFlops)}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<Preset>
            label="Model"
            value={params.preset}
            options={(Object.keys(MODELS) as Preset[]).map((k) => ({ value: k, label: MODELS[k].label }))}
            onChange={(preset) => setParams((p) => ({ ...p, preset }))}
          />
          <Choice<string>
            label="Context length"
            value={String(params.seqLen)}
            options={SEQ_LENS.map((s) => ({ value: String(s), label: `${s / 1024}K` }))}
            onChange={(v) => setParams((p) => ({ ...p, seqLen: Number(v) }))}
          />
          <Choice<'on' | 'off'>
            label="KV cache"
            value={params.cache ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'on' },
              { value: 'off', label: 'off' },
            ]}
            onChange={(v) => setParams((p) => ({ ...p, cache: v === 'on' }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> K/V computed for a new token
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> K/V recomputed (wasted)
          <span className="viz-key" style={{ background: 'var(--good-soft)', border: '1px solid var(--good)' }} /> read from cache
        </>
      }
    >
      <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
        {/* token header */}
        <text x={8} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          K/V work per step (rows = steps, columns = tokens)
        </text>
        {ALL.map((t, j) => (
          <text key={j} x={GX + j * CW + CW / 2} y={GY - 8} textAnchor="middle" fontSize={8.5} fontWeight={j < PROMPT.length ? 400 : 700} style={{ fill: j < f.tokens.length ? 'var(--text)' : 'var(--border)' }}>
            {t.length > 6 ? t.slice(0, 5) + '…' : t}
          </text>
        ))}
        {hist.map((h, r) => {
          const newest = h.tokens.length - 1;
          return (
            <g key={r}>
              <text x={GX - 6} y={GY + r * (CH + 3) + 11} textAnchor="end" fontSize={9} style={{ fill: 'var(--text-2)' }}>
                {r === 0 ? 'prefill' : `step ${r}`}
              </text>
              {h.tokens.map((_, j) => {
                const comp = h.computed.includes(j);
                const cached = h.cached.includes(j);
                const isNew = r === 0 || j === newest;
                const fill = comp ? (isNew ? 'var(--accent)' : 'var(--bad)') : cached ? 'var(--good-soft)' : 'var(--surface-2)';
                return <rect key={j} x={GX + j * CW + 1} y={GY + r * (CH + 3)} width={CW - 2} height={CH} rx={3} fill={fill} stroke={cached ? 'var(--good)' : 'var(--border)'} strokeWidth={0.8} opacity={r === hist.length - 1 ? 1 : 0.75} />;
              })}
            </g>
          );
        })}

        {/* right metrics */}
        <g>
          <text x={470} y={16} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            this sequence
          </text>
          <text x={470} y={36} fontSize={10} style={{ fill: 'var(--text-2)' }}>
            KV cache memory
          </text>
          <text x={592} y={52} textAnchor="end" fontSize={13} fontWeight={700} style={{ fill: params.cache ? 'var(--text)' : 'var(--muted)' }}>
            {params.cache ? fmtBytes(f.cacheBytes) : '0 (off)'}
          </text>
          <text x={470} y={74} fontSize={10} style={{ fill: 'var(--text-2)' }}>
            this step
          </text>
          <text x={592} y={90} textAnchor="end" fontSize={13} fontWeight={700} style={{ fill: !params.cache && f.stage === 'decode' ? 'var(--bad)' : 'var(--text)' }}>
            {f.stepFlops ? fmtFlops(f.stepFlops) : '—'}
          </text>
          <text x={470} y={112} fontSize={10} style={{ fill: 'var(--text-2)' }}>
            cumulative compute
          </text>
          {[
            { label: 'with cache', v: cacheTotal, fill: 'var(--good)' },
            { label: 'no cache', v: noCacheTotal, fill: 'var(--bad)' },
          ].map((b, r) => (
            <g key={b.label}>
              <text x={470} y={130 + r * 30} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                {b.label}: {fmtFlops(b.v)}
              </text>
              <rect x={470} y={134 + r * 30} width={122} height={9} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
              <rect x={470} y={134 + r * 30} width={(122 * b.v) / maxTotal} height={9} rx={3} fill={b.fill} />
            </g>
          ))}
        </g>

        {/* bottom panel */}
        <rect x={8} y={222} width={584} height={100} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
        {f.prefix ? (
          <g>
            <text x={18} y={242} fontSize={10.5} fontWeight={700}>
              request 2 prefill: {f.prefix.shared} shared prefix + {f.prefix.fresh} new tokens
            </text>
            <rect x={18} y={254} width={(560 * f.prefix.shared) / (f.prefix.shared + f.prefix.fresh)} height={22} rx={4} fill={f.prefix.reused ? 'var(--good-soft)' : 'var(--accent)'} stroke={f.prefix.reused ? 'var(--good)' : 'var(--border)'} />
            <text x={28} y={269} fontSize={10} fontWeight={700} style={{ fill: f.prefix.reused ? 'var(--good)' : 'var(--surface)' }}>
              system prompt ({f.prefix.shared} tok): {f.prefix.reused ? 'reused from prefix cache' : 'computed'}
            </text>
            <rect x={18 + (560 * f.prefix.shared) / (f.prefix.shared + f.prefix.fresh)} y={254} width={(560 * f.prefix.fresh) / (f.prefix.shared + f.prefix.fresh)} height={22} rx={4} fill="var(--accent)" />
            <text x={18} y={300} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              prefill compute: {fmtFlops(2 * m.params * (f.prefix.reused ? f.prefix.fresh : f.prefix.shared + f.prefix.fresh))}
              {f.prefix.reused ? ` (instead of ${fmtFlops(2 * m.params * (f.prefix.shared + f.prefix.fresh))})` : ''}
            </text>
          </g>
        ) : longStage ? (
          <g>
            <text x={18} y={242} fontSize={10.5} fontWeight={700}>
              one {params.seqLen.toLocaleString('en-US')}-token sequence on an {GPU_GB} GB GPU
            </text>
            <rect x={18} y={254} width={560} height={22} rx={4} fill="var(--surface)" stroke="var(--border)" />
            <rect x={18} y={254} width={Math.min(560, (560 * weights) / gpu)} height={22} rx={4} fill="var(--text-2)" opacity={0.6} />
            {weights < gpu && <rect x={18 + (560 * weights) / gpu} y={254} width={Math.min(560 - (560 * weights) / gpu, (560 * (f.longBytes ?? 0)) / gpu)} height={22} fill="var(--warn)" opacity={0.85} />}
            <text x={18} y={296} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              grey = fp16 weights {fmtBytes(weights)}
              {weights >= gpu ? ' (exceed one GPU)' : ''} · amber = KV cache {fmtBytes(f.longBytes ?? 0)}
              {f.stage === 'gqa' ? ` (GQA; full MHA would be ${fmtBytes(kvBytesPerToken(m, m.heads) * params.seqLen)})` : ''}
            </text>
            <text x={18} y={312} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              batch of 8 such sequences → {fmtBytes((f.longBytes ?? 0) * 8)} of KV cache
            </text>
          </g>
        ) : (
          <g>
            <text x={18} y={244} fontSize={10.5} fontWeight={700}>
              KV bytes / token = 2 × layers × kv_heads × head_dim × bytes
            </text>
            <text x={18} y={268} fontSize={12} style={{ fontFamily: 'var(--mono)' }}>
              = 2 × {m.layers} × {m.kvHeads} × {m.headDim} × {m.bytes} = {per.toLocaleString('en-US')} B = {fmtBytes(per)}
            </text>
            <text x={18} y={292} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              {m.label}: {m.heads} query heads share {m.kvHeads} K/V heads (GQA) · ≈ 2 × {(m.params / 1e9).toFixed(1)}B FLOPs per token processed
            </text>
            <text x={18} y={310} fontSize={10} style={{ fill: 'var(--text-2)' }}>
              ×{params.seqLen.toLocaleString('en-US')} tokens = {fmtBytes(per * params.seqLen)} per sequence
            </text>
          </g>
        )}
      </svg>
    </VizFrame>
  );
}
