import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import {
  CONTEXT,
  COSTS,
  DEFAULT_PARAMS,
  K_MAX,
  K_MIN,
  QUALITY_LABEL,
  RUNS,
  alphaOf,
  bestK,
  expectedTokens,
  positions,
  simulate,
  speedup,
  type Emitted,
  type Params,
  type Quality,
  type Status,
} from './sim';

const SRC_FILL: Record<Emitted['src'], string> = { accept: 'var(--good-soft)', resample: 'var(--warn-soft)', bonus: 'var(--accent-soft)' };
const SRC_STROKE: Record<Emitted['src'], string> = { accept: 'var(--good)', resample: 'var(--warn)', bonus: 'var(--accent)' };
const STATUS_FILL: Record<Status, string> = { pending: 'var(--surface-2)', accepted: 'var(--good-soft)', rejected: 'var(--bad-soft)', discarded: 'var(--surface)' };
const STATUS_STROKE: Record<Status, string> = { pending: 'var(--muted)', accepted: 'var(--good)', rejected: 'var(--bad)', discarded: 'var(--border)' };

const chipW = (t: string) => Math.max(16, t.length * 6 + 8);
const p2 = (x: number) => x.toFixed(2);

/** flow layout of the generated text, keeping the last 3 lines */
function layoutText(ctx: string, toks: Emitted[]) {
  const items = [{ tok: ctx, src: null as Emitted['src'] | null, round: 0 }, ...toks.map((t) => ({ ...t }))];
  const lines: { tok: string; src: Emitted['src'] | null; x: number; w: number }[][] = [[]];
  let x = 0;
  for (const it of items) {
    const w = it.src === null ? it.tok.length * 5.8 + 6 : chipW(it.tok);
    if (x + w > 580 && lines[lines.length - 1].length) {
      lines.push([]);
      x = 0;
    }
    lines[lines.length - 1].push({ tok: it.tok, src: it.src, x, w });
    x += w + 3;
  }
  return { lines: lines.slice(-3), clipped: lines.length > 3 };
}

export default function SpeculativeDecodingViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const { k, quality, cost } = params;
  const alpha = alphaOf(quality);
  const P = positions(quality);
  const tpp = f.passes ? f.emitted.length / f.passes : 0;

  const weakStage = f.stage === 'k-predict' || f.stage === 'k-reveal';
  const chartAlpha = f.stage === 'k-reveal' ? alphaOf('low') : alpha;
  const hideChart = f.stage === 'k-predict';
  const sp = Array.from({ length: K_MAX }, (_, i) => speedup(chartAlpha, i + 1, cost));
  const spMax = Math.max(...Array.from({ length: K_MAX }, (_, i) => speedup(alphaOf('high'), i + 1, cost)), ...sp);
  const best = bestK(chartAlpha, cost);

  const { lines, clipped } = layoutText(CONTEXT, f.emitted);
  const slotW = Math.min(62, 540 / (k + 1));
  const focus = f.focus !== null ? P[f.focus] : null;

  const aria = `Speculative decoding, k ${k}, ${QUALITY_LABEL[quality]} with acceptance rate ${p2(alpha)}, draft cost ${cost}. ${f.round ? `Round ${f.round}. ` : ''}${f.emitted.length} tokens emitted in ${f.passes} target passes. Expected ${p2(expectedTokens(alpha, k))} tokens per pass, speed-up about ${p2(speedup(alpha, k, cost))} times.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Slider label="draft length k" value={k} min={K_MIN} max={K_MAX} onChange={(v) => setParams((p) => ({ ...p, k: v }))} />
          <Choice<Quality>
            label="Draft quality (acceptance α)"
            value={quality}
            options={(['low', 'medium', 'high'] as Quality[]).map((q) => ({ value: q, label: `${q} ${p2(alphaOf(q))}` }))}
            onChange={(v) => setParams((p) => ({ ...p, quality: v }))}
          />
          <Choice<string>
            label="Draft cost c"
            value={String(cost)}
            options={COSTS.map((c) => ({ value: String(c), label: String(c) }))}
            onChange={(v) => setParams((p) => ({ ...p, cost: Number(v) }))}
          />
          <Choice<string>
            label="Sample run"
            value={String(params.run)}
            options={RUNS.map((r) => ({ value: String(r), label: `#${r}` }))}
            onChange={(v) => setParams((p) => ({ ...p, run: Number(v) }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--good-soft)', border: '1px solid var(--good)' }} /> accepted draft token
          <span className="viz-key" style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)' }} /> rejected
          <span className="viz-key" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }} /> resampled from residual
          <span className="viz-key" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} /> bonus token from target
        </>
      }
    >
      <WideSvg label="Speculative decoding diagram">
        <svg viewBox="0 0 600 340" className="viz-svg" role="img" aria-label={aria}>
          {/* generated text */}
          <text x={8} y={12} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            output so far{clipped ? ' (latest lines)' : ''}
          </text>
          {lines.map((ln, li) =>
            ln.map((it, j) =>
              it.src === null ? (
                <text key={`${li}-${j}`} x={10 + it.x} y={32 + li * 19} fontSize={10} style={{ fill: 'var(--muted)', fontStyle: 'italic' }}>
                  {it.tok}
                </text>
              ) : (
                <g key={`${li}-${j}`}>
                  <rect x={10 + it.x} y={20 + li * 19} width={it.w} height={16} rx={3} fill={SRC_FILL[it.src]} stroke={SRC_STROKE[it.src]} strokeWidth={0.8} />
                  <text x={10 + it.x + it.w / 2} y={32 + li * 19} textAnchor="middle" fontSize={9.5} style={{ fill: 'var(--text)' }}>
                    {it.tok}
                  </text>
                </g>
              ),
            ),
          )}

          {/* current round */}
          <rect x={8} y={82} width={584} height={118} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          {f.draft ? (
            <g>
              <text x={18} y={98} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text)' }}>
                Round {f.round}: {f.stage === 'draft' ? `draft model proposes ${k} (${k} cheap steps)` : 'target verifies all positions in ONE forward pass'}
              </text>
              <text x={18} y={124} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                token
              </text>
              <text x={18} y={146} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                p_d
              </text>
              <text x={18} y={158} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                p_t
              </text>
              <text x={18} y={170} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                min(1,p_t/p_d)
              </text>
              <text x={18} y={182} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
                u
              </text>
              {f.draft.map((d, i) => {
                const x = 82 + i * slotW;
                const st: Status = f.stage === 'draft' ? 'pending' : d.status;
                const shown = f.stage !== 'draft';
                return (
                  <g key={i} opacity={st === 'discarded' ? 0.5 : 1}>
                    <rect x={x} y={110} width={slotW - 4} height={20} rx={4} fill={STATUS_FILL[st]} stroke={STATUS_STROKE[st]} strokeDasharray={st === 'discarded' ? '3 2' : undefined} />
                    <text x={x + (slotW - 4) / 2} y={124} textAnchor="middle" fontSize={9.5} fontWeight={600} style={{ fill: 'var(--text)', textDecoration: st === 'rejected' || st === 'discarded' ? 'line-through' : undefined }}>
                      {d.tok.length > 8 ? d.tok.slice(0, 7) + '…' : d.tok}
                    </text>
                    <text x={x + (slotW - 4) / 2} y={146} textAnchor="middle" fontSize={8.5} style={{ fill: 'var(--warn)', fontFamily: 'var(--mono)' }}>
                      {p2(d.pd)}
                    </text>
                    <text x={x + (slotW - 4) / 2} y={158} textAnchor="middle" fontSize={8.5} style={{ fill: shown ? 'var(--accent)' : 'var(--border)', fontFamily: 'var(--mono)' }}>
                      {shown ? p2(d.pt) : '?'}
                    </text>
                    <text x={x + (slotW - 4) / 2} y={170} textAnchor="middle" fontSize={8.5} style={{ fill: shown ? 'var(--text)' : 'var(--border)', fontFamily: 'var(--mono)' }}>
                      {shown && st !== 'discarded' ? p2(d.ratio) : '–'}
                    </text>
                    <text x={x + (slotW - 4) / 2} y={182} textAnchor="middle" fontSize={8.5} style={{ fill: shown ? 'var(--text-2)' : 'var(--border)', fontFamily: 'var(--mono)' }}>
                      {shown && st !== 'discarded' && d.ratio < 1 ? p2(d.u) : '–'}
                    </text>
                    <text x={x + (slotW - 4) / 2} y={195} textAnchor="middle" fontSize={10} fontWeight={700} style={{ fill: STATUS_STROKE[st] }}>
                      {st === 'accepted' ? '✓' : st === 'rejected' ? '✗' : st === 'discarded' ? 'skip' : ''}
                    </text>
                  </g>
                );
              })}
              {f.extra && (
                <g>
                  <rect x={82 + k * slotW} y={110} width={slotW - 4} height={20} rx={4} fill={SRC_FILL[f.extra.src]} stroke={SRC_STROKE[f.extra.src]} strokeWidth={1.6} />
                  <text x={82 + k * slotW + (slotW - 4) / 2} y={124} textAnchor="middle" fontSize={9.5} fontWeight={700} style={{ fill: 'var(--text)' }}>
                    {f.extra.tok}
                  </text>
                  <text x={82 + k * slotW + (slotW - 4) / 2} y={146} textAnchor="middle" fontSize={8.5} fontWeight={700} style={{ fill: SRC_STROKE[f.extra.src] }}>
                    {f.extra.src === 'bonus' ? 'bonus' : 'resampled'}
                  </text>
                  <text x={82 + k * slotW + (slotW - 4) / 2} y={158} textAnchor="middle" fontSize={8} style={{ fill: 'var(--text-2)' }}>
                    {f.extra.src === 'bonus' ? 'from p_t' : 'residual'}
                  </text>
                </g>
              )}
            </g>
          ) : (
            <g>
              <text x={18} y={100} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text)' }}>
                one round = k draft steps (cost k·c) + 1 target pass that scores all k positions
              </text>
              <text x={18} y={122} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                accept x_i with probability min(1, p_t(x_i) / p_d(x_i)); stop at the first rejection
              </text>
              <text x={18} y={140} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                rejected → sample from norm(max(0, p_t − p_d)) · all k accepted → bonus token from p_t
              </text>
              <text x={18} y={164} fontSize={11} style={{ fill: 'var(--text)', fontFamily: 'var(--mono)' }}>
                E[tokens/pass] = (1 − α^(k+1)) / (1 − α) = {p2(expectedTokens(alpha, k))}
              </text>
              <text x={18} y={184} fontSize={11} style={{ fill: 'var(--text)', fontFamily: 'var(--mono)' }}>
                speed-up ≈ E / (k·c + 1) = {p2(expectedTokens(alpha, k))} / {p2(k * cost + 1)} = {p2(speedup(alpha, k, cost))}×
              </text>
            </g>
          )}

          {/* distribution panel */}
          <rect x={8} y={208} width={300} height={126} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          {focus ? (
            <g>
              <text x={18} y={224} fontSize={10} fontWeight={700} style={{ fill: 'var(--text)' }}>
                {f.stage === 'emit' && f.extra?.src === 'resample' ? 'residual at the rejected position' : f.stage === 'lossless' ? `emitted distribution vs p_t (${(20000).toLocaleString("en-US")} simulated steps)` : 'target vs draft at this position'}
              </text>
              {focus.cands.map((c, i) => {
                const y = 236 + i * 23;
                const res = f.stage === 'emit' && f.extra?.src === 'resample' ? f.extra.dist[i] : null;
                return (
                  <g key={i}>
                    <text x={70} y={y + 11} textAnchor="end" fontSize={9.5} style={{ fill: 'var(--text)' }}>
                      {c}
                    </text>
                    <rect x={76} y={y} width={150 * focus.pt[i]} height={7} rx={2} fill="var(--accent)" />
                    <rect x={76} y={y + 8} width={150 * (f.mc ? f.mc[i] : res !== null ? res : focus.pd[i])} height={7} rx={2} fill={f.mc ? 'var(--good)' : 'var(--warn)'} opacity={res !== null ? 1 : 0.75} />
                    <text x={300} y={y + 11} textAnchor="end" fontSize={8.5} style={{ fill: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
                      {p2(focus.pt[i])}/{p2(f.mc ? f.mc[i] : res !== null ? res : focus.pd[i])}
                    </text>
                  </g>
                );
              })}
              <text x={18} y={330} fontSize={8.5} style={{ fill: 'var(--muted)' }}>
                top bar p_t (target) · bottom bar {f.mc ? 'emitted frequency' : f.stage === 'emit' && f.extra?.src === 'resample' ? 'residual norm(max(0, p_t − p_d))' : 'p_d (draft)'} · Σmin = {p2(focus.acc)}
              </text>
            </g>
          ) : (
            <text x={18} y={226} fontSize={10} style={{ fill: 'var(--muted)' }}>
              (distributions appear when a position is in focus)
            </text>
          )}

          {/* counters + speed-up chart */}
          <rect x={316} y={208} width={276} height={126} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          <text x={326} y={224} fontSize={10} fontWeight={700} style={{ fill: 'var(--text)' }}>
            target passes {f.passes} · draft steps {f.draftSteps} · tokens {f.emitted.length}
          </text>
          <text x={326} y={240} fontSize={10} style={{ fill: 'var(--text-2)' }}>
            tokens / target pass:{' '}
            <tspan fontWeight={700} style={{ fill: 'var(--text)' }}>
              {f.passes ? p2(tpp) : '—'}
            </tspan>{' '}
            (expected {p2(expectedTokens(alpha, k))}, max {k + 1})
          </text>
          <text x={326} y={258} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            speed-up vs k {weakStage ? `(weak draft, α ${p2(alphaOf('low'))})` : `(α ${p2(alpha)})`}, c = {cost}
          </text>
          {hideChart ? (
            <text x={454} y={300} textAnchor="middle" fontSize={22} fontWeight={700} style={{ fill: 'var(--muted)' }}>
              ?
            </text>
          ) : (
            sp.map((v, i) => {
              const h = (44 * v) / spMax;
              const x = 330 + i * 32;
              const cur = i + 1 === k && !weakStage;
              const mark = weakStage && (i + 1 === 4 || i + 1 === 8);
              return (
                <g key={i}>
                  <rect x={x} y={318 - h} width={24} height={h} rx={2} fill={cur || mark ? 'var(--accent)' : i + 1 === best ? 'var(--good)' : 'var(--muted)'} opacity={cur || mark || i + 1 === best ? 1 : 0.45} />
                  <text x={x + 12} y={316 - h} textAnchor="middle" fontSize={7.5} style={{ fill: 'var(--text-2)' }}>
                    {v.toFixed(2)}
                  </text>
                  <text x={x + 12} y={329} textAnchor="middle" fontSize={8} style={{ fill: 'var(--text-2)' }}>
                    k={i + 1}
                  </text>
                </g>
              );
            })
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
