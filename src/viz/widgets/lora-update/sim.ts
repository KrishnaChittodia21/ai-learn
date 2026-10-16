// Pure, deterministic LoRA model (no React, Node-testable).
// Frozen W (d_out × d_in) plus ΔW = s · B · A with s = α / r,
//   A: r × d_in, random init;  B: d_out × r, ZERO init  → ΔW = 0 at step 0 (training starts at the base model).
// Forward: h = W·x + s·B·(A·x). Trainable params per matrix = r · (d_in + d_out) instead of d_in · d_out.
// The drawn matrices are a toy (d_out = d_in = 8, drawn rank min(r, 4)); training fits a rank-2 "true update" T with
// Adam on L = ½‖s·B·A − T‖². The side panel uses the real Llama-3.1-8B shapes and the lesson's memory rule:
//   full  = 16 B/param (bf16 weights + grads, fp32 master + Adam m, v)
//   LoRA  = 2 B/param frozen bf16 base + 16 B per adapter param
//   QLoRA = (0.5 + 0.127/8) B/param NF4 base incl. double-quantised constants + 16 B per adapter param
//   + 4 GB activations, × 1.1 overhead.
import { rng, type BaseFrame } from '../../core';

export type Targets = 'attn' | 'all';
export type Precision = '16' | '4';

export interface Params {
  r: number;
  alpha: number;
  targets: Targets;
  precision: Precision;
}

export const DEFAULT_PARAMS: Params = { r: 16, alpha: 32, targets: 'all', precision: '16' };
export const R_MIN = 1;
export const R_MAX = 64;
export const ALPHA_MIN = 8;
export const ALPHA_MAX = 64;
export const ALPHA_STEP = 8;

/** toy drawing size */
export const TOY_D = 8;
export const TOY_R_MAX = 4;
export const toyRank = (r: number) => Math.min(r, TOY_R_MAX);

// ---------- real model (Llama-3.1-8B, as in the lesson) ----------
export const MODEL = {
  label: 'Llama-3.1-8B',
  params: 8.03e9,
  hidden: 4096,
  layers: 32,
  heads: 32,
  kvHeads: 8,
  headDim: 128,
  intermediate: 14336,
};

export interface Proj {
  name: string;
  dIn: number;
  dOut: number;
}

export function projections(targets: Targets): Proj[] {
  const h = MODEL.hidden;
  const qOut = MODEL.heads * MODEL.headDim;
  const kv = MODEL.kvHeads * MODEL.headDim;
  const m = MODEL.intermediate;
  const attn: Proj[] = [
    { name: 'q', dIn: h, dOut: qOut },
    { name: 'k', dIn: h, dOut: kv },
    { name: 'v', dIn: h, dOut: kv },
    { name: 'o', dIn: qOut, dOut: h },
  ];
  const mlp: Proj[] = [
    { name: 'gate', dIn: h, dOut: m },
    { name: 'up', dIn: h, dOut: m },
    { name: 'down', dIn: m, dOut: h },
  ];
  return targets === 'attn' ? attn : [...attn, ...mlp];
}

/** trainable LoRA params for the whole model */
export function loraParams(r: number, targets: Targets): number {
  return projections(targets).reduce((s, p) => s + r * (p.dIn + p.dOut), 0) * MODEL.layers;
}

/** q_proj: the single matrix used for the per-matrix counter */
export const Q = { dIn: MODEL.hidden, dOut: MODEL.heads * MODEL.headDim };
export const perMatrixLora = (r: number) => r * (Q.dIn + Q.dOut);
export const perMatrixFull = Q.dIn * Q.dOut;

export const ACT_GB = 4;
export const OVERHEAD = 1.1;
export type Method = 'full' | 'lora' | 'qlora';
export function trainMemGB(method: Method, adapterParams: number): number {
  const n = MODEL.params;
  const adapter = (adapterParams * 16) / 1e9;
  const base = method === 'full' ? (n * 16) / 1e9 : method === 'lora' ? (n * 2) / 1e9 : (n * (0.5 + 0.127 / 8)) / 1e9;
  return (base + (method === 'full' ? 0 : adapter) + ACT_GB) * OVERHEAD;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
export function fmtM(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}
export const fmtPct = (x: number) => `${(x * 100).toFixed(x < 0.001 ? 3 : 2)}%`;
export const fmtMB = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(bytes >= 1e8 ? 0 : 1)} MB` : `${(bytes / 1e3).toFixed(0)} KB`);
export const fmtGB = (g: number) => `${g.toFixed(g >= 100 ? 0 : 1)} GB`;

// ---------- toy linear algebra ----------
type Mat = number[][];
const zeros = (r: number, c: number): Mat => Array.from({ length: r }, () => Array(c).fill(0));
const matmul = (a: Mat, b: Mat): Mat => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const T = (a: Mat): Mat => a[0].map((_, j) => a.map((row) => row[j]));
const scale = (a: Mat, s: number): Mat => a.map((row) => row.map((v) => v * s));
const sub = (a: Mat, b: Mat): Mat => a.map((row, i) => row.map((v, j) => v - b[i][j]));
const add = (a: Mat, b: Mat): Mat => a.map((row, i) => row.map((v, j) => v + b[i][j]));
const norm = (a: Mat) => Math.sqrt(a.reduce((s, row) => s + row.reduce((t, v) => t + v * v, 0), 0));
const mv = (a: Mat, x: number[]) => a.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
const round = (a: Mat): Mat => a.map((row) => row.map((v) => Math.round(v * 1000) / 1000));

/** approx N(0,1) from the seeded PRNG (sum of 4 uniforms, rescaled) */
function gauss(r: () => number) {
  return (r() + r() + r() + r() - 2) * Math.sqrt(3);
}

const D = TOY_D;
const TOY = (() => {
  const r = rng(11);
  const W = Array.from({ length: D }, () => Array.from({ length: D }, () => Math.max(-1, Math.min(1, gauss(r) * 0.45))));
  const x = Array.from({ length: D }, () => Math.round(gauss(r) * 50) / 100);
  // rank-2 "true update" the fine-tune needs: 0.9·u1v1ᵀ + 0.45·u2v2ᵀ (unit-ish vectors)
  const vec = () => {
    const v = Array.from({ length: D }, () => gauss(r));
    const n = Math.hypot(...v);
    return v.map((z) => z / n);
  };
  const u1 = vec(), v1 = vec(), u2 = vec(), v2 = vec();
  const tgt = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => 0.9 * 2.2 * u1[i] * v1[j] + 0.45 * 2.2 * u2[i] * v2[j]));
  // A init for up to TOY_R_MAX ranks (kaiming-like uniform, ±1/√d_in · √3)
  const bound = Math.sqrt(3 / D);
  const A0 = Array.from({ length: TOY_R_MAX }, () => Array.from({ length: D }, () => (r() * 2 - 1) * bound));
  return { W, x, tgt, A0 };
})();
export const TOY_W = TOY.W;
export const TOY_X = TOY.x;
export const TOY_TARGET = TOY.tgt;

export const TRAIN_STEPS = [1, 5, 25, 100, 300];
const LR = 0.02;

interface Snap {
  step: number;
  A: Mat;
  B: Mat;
  err: number;
}

/** Adam on L = ½‖s·B·A − T‖², snapshots at TRAIN_STEPS. Gradients: G = s·BA − T; ∂B = s·G·Aᵀ; ∂A = s·Bᵀ·G. */
function train(rt: number, s: number): Snap[] {
  let A = TOY.A0.slice(0, rt).map((row) => [...row]);
  let B = zeros(D, rt);
  const mA = zeros(rt, D), vA = zeros(rt, D), mB = zeros(D, rt), vB = zeros(D, rt);
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const tn = norm(TOY.tgt);
  const snaps: Snap[] = [];
  const last = TRAIN_STEPS[TRAIN_STEPS.length - 1];
  for (let t = 1; t <= last; t++) {
    const G = sub(scale(matmul(B, A), s), TOY.tgt);
    const gB = scale(matmul(G, T(A)), s);
    const gA = scale(matmul(T(B), G), s);
    const upd = (P: Mat, g: Mat, m: Mat, v: Mat): Mat =>
      P.map((row, i) =>
        row.map((p, j) => {
          m[i][j] = b1 * m[i][j] + (1 - b1) * g[i][j];
          v[i][j] = b2 * v[i][j] + (1 - b2) * g[i][j] * g[i][j];
          const mh = m[i][j] / (1 - b1 ** t);
          const vh = v[i][j] / (1 - b2 ** t);
          return p - (LR * mh) / (Math.sqrt(vh) + eps);
        }),
      );
    const nB = upd(B, gB, mB, vB);
    const nA = upd(A, gA, mA, vA);
    B = nB;
    A = nA;
    if (TRAIN_STEPS.includes(t)) snaps.push({ step: t, A: round(A), B: round(B), err: norm(sub(scale(matmul(B, A), s), TOY.tgt)) / tn });
  }
  return snaps;
}

export type Stage = 'frozen' | 'forward' | 'addA' | 'addB' | 'zero' | 'scale' | 'train' | 'count' | 'model' | 'compare' | 'memory' | 'premerge' | 'merged' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** drawn rank */
  rt: number;
  A: Mat | null;
  B: Mat | null;
  /** s·B·A (toy) */
  dW: Mat | null;
  /** matrix drawn in the W slot (W, or W' after merge) */
  W: Mat;
  merged: boolean;
  step: number | null;
  /** relative fit error ‖sBA − T‖ / ‖T‖ */
  err: number | null;
  /** which part of the side panel to emphasise */
  panel: 'matrix' | 'model' | 'memory';
  /** A changed this step? (for the first training step: false) */
  aMoved: boolean | null;
}

export function simulate({ r, alpha, targets, precision }: Params): Frame[] {
  const rt = toyRank(r);
  const s = alpha / r;
  const sStr = Number.isInteger(s) ? String(s) : s.toFixed(s < 1 ? 3 : 2).replace(/0+$/, '');
  const frames: Frame[] = [];
  const W = TOY.W.map((row) => [...row]);
  const A0 = round(TOY.A0.slice(0, rt));
  const B0 = zeros(D, rt);
  const base = (): Omit<Frame, 'stage' | 'caption'> => ({ rt, A: null, B: null, dW: null, W, merged: false, step: null, err: null, panel: 'matrix', aMoved: null });
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => frames.push({ ...base(), ...f } as Frame);
  const toyNote = r > TOY_R_MAX ? ` (drawn at toy rank ${rt}; the counters use r = ${r})` : '';

  const full = perMatrixFull;
  const lpm = perMatrixLora(r);
  const total = loraParams(r, targets);
  const method: Method = precision === '4' ? 'qlora' : 'lora';
  const mFull = trainMemGB('full', 0);
  const mLora = trainMemGB('lora', total);
  const mQ = trainMemGB('qlora', total);
  const hx = mv(W, TOY.x);
  const tx = mv(TOY.tgt, TOY.x);
  const hi = tx.reduce((b, v, i) => (Math.abs(v) > Math.abs(tx[b]) ? i : b), 0);
  const hn = `h${'₁₂₃₄₅₆₇₈'[hi]}`;

  push({
    stage: 'frozen',
    caption: `A frozen weight matrix W (toy 8 × 8 here; the real ${MODEL.label} q_proj is ${Q.dOut} × ${Q.dIn} = ${fmtInt(full)} params). Full fine-tuning would update every one of those cells; LoRA never touches W.`,
  });
  push({
    stage: 'forward',
    caption: `Forward pass of the base layer: h = W·x, a d_out-vector (here ${hn} = ${hx[hi].toFixed(2)}). This is what the pretrained model computes today.`,
  });
  push({
    stage: 'addA',
    A: A0,
    caption: `Add A (r × d_in = ${r} × ${Q.dIn} real, ${rt} × 8 drawn${r > TOY_R_MAX ? ' at toy rank' : ''}) with small random values. A projects x down to just r = ${r} numbers.`,
  });
  push({
    stage: 'addB',
    A: A0,
    B: B0,
    dW: zeros(D, D),
    caption: `Add B (d_out × r = ${Q.dOut} × ${r}) initialised to all zeros${toyNote}. Trainable params for this matrix: r·(d_in + d_out) = ${r} × ${Q.dIn + Q.dOut} = ${fmtInt(lpm)} vs ${fmtInt(full)} (${fmtPct(lpm / full)}).`,
    predict: `B is all zeros and A is random. What does the adapter add to h = W·x before any training?`,
  });
  push({
    stage: 'zero',
    A: A0,
    B: B0,
    dW: zeros(D, D),
    caption: `Nothing: ΔW = (α/r)·B·A = (α/r)·0·A = 0, so h = W·x + 0 and step 0 is exactly the base model (${hn} is still ${hx[hi].toFixed(2)}). No random noise is injected into a model that already works.`,
  });
  push({
    stage: 'scale',
    A: A0,
    B: B0,
    dW: zeros(D, D),
    caption: `The update is scaled by α/r = ${alpha}/${r} = ${sStr}. ${s >= 4 ? 'A large scale makes each optimizer step move ΔW a lot (watch for jumpy training).' : s <= 0.5 ? 'A small scale makes ΔW move slowly: raising r without raising α shrinks the update.' : 'α = r or 2r (scale 1–2) is the usual setting.'}`,
    predict: `First gradient step. B is zero and A is random: which of A or B gets a non-zero gradient?`,
  });
  const snaps = train(rt, s);
  snaps.forEach((sn, k) => {
    const dW = round(scale(matmul(sn.B, sn.A), s));
    const first = k === 0;
    const lastSnap = k === snaps.length - 1;
    const aMoved = !first || sn.A.some((row, i) => row.some((v, j) => Math.abs(v - A0[i][j]) > 1e-9));
    let caption: string;
    if (first)
      caption = `Step 1: only B moves. ∂L/∂A = (α/r)·Bᵀ·G is zero because B = 0, while ∂L/∂B = (α/r)·G·Aᵀ is not. ΔW is now non-zero; fit error ‖ΔW − target‖/‖target‖ = ${sn.err.toFixed(2)}${sn.err > 1 ? ` (above 1: with α/r = ${sStr} even one step overshoots)` : ''}.`;
    else if (!lastSnap)
      caption = `Step ${sn.step}: A and B both train now, and ΔW = (α/r)·B·A takes the shape of the needed update. Fit error ${sn.err.toFixed(2)} (1.00 = no change learned)${s <= 0.25 && sn.step >= 25 ? `; the small scale α/r = ${sStr} slows progress` : ''}.`;
    else
      caption =
        rt < 2
          ? `Step ${sn.step}: fit error stalls at ${sn.err.toFixed(2)}. The needed update has rank 2, and B·A with r = 1 can only express a rank-1 matrix: rank is capacity.`
          : sn.err > 0.2
            ? `Step ${sn.step}: fit error is still ${sn.err.toFixed(2)}. With scale α/r = ${sStr} the updates are ${s < 1 ? 'tiny, so training looks "stuck"' : 'too large to settle'}; ${s < 1 ? 'raise α (keep α ≈ r to 2r)' : 'lower α or the learning rate'}.`
            : `Step ${sn.step}: fit error ${sn.err.toFixed(2)}. Rank ${rt} is enough for this rank-2 update, so ΔW has (almost) exactly the right shape while W never changed.`;
    push({ stage: 'train', A: sn.A, B: sn.B, dW, step: sn.step, err: sn.err, aMoved, caption });
  });
  const fin = snaps[snaps.length - 1];
  const finDW = round(scale(matmul(fin.B, fin.A), s));
  const trained = { A: fin.A, B: fin.B, dW: finDW, step: fin.step, err: fin.err };

  push({
    ...trained,
    stage: 'count',
    caption: `Per matrix: q_proj alone has ${fmtInt(full)} frozen weights; its adapter has ${r} × (${Q.dIn} + ${Q.dOut}) = ${fmtInt(lpm)} trainable ones, ${Math.round(full / lpm)}× fewer.`,
  });
  push({
    ...trained,
    stage: 'model',
    panel: 'model',
    caption: `Whole model, ${targets === 'attn' ? 'attention only (q, k, v, o)' : 'all linear layers (q, k, v, o, gate, up, down)'} × ${MODEL.layers} layers: ${fmtInt(total)} trainable params = ${fmtPct(total / MODEL.params)} of ${(MODEL.params / 1e9).toFixed(2)}B. GQA makes k and v narrow (${MODEL.hidden} → ${MODEL.kvHeads * MODEL.headDim}).`,
    predict:
      targets === 'attn'
        ? `Switch to all linear layers (add gate, up, down with intermediate size ${MODEL.intermediate}). Roughly how many times more trainable params?`
        : `Drop the MLP adapters and keep attention only (q, k, v, o). What fraction of the trainable params is left?`,
  });
  const attnP = loraParams(r, 'attn');
  const allP = loraParams(r, 'all');
  push({
    ...trained,
    stage: 'compare',
    panel: 'model',
    caption: `Attention-only: ${fmtM(attnP)}; all-linear: ${fmtM(allP)}, ${(allP / attnP).toFixed(2)}× more, because the MLP is ${MODEL.intermediate / MODEL.hidden}× wider. All-linear usually wins at the same budget (the QLoRA paper needed it to match full FT). Adapter file in bf16: ${fmtMB(total * 2)}.`,
  });
  push({
    ...trained,
    stage: 'memory',
    panel: 'memory',
    caption:
      method === 'qlora'
        ? `Training memory (8B, ~4 GB activations, ×1.1): full FT ≈ ${fmtGB(mFull)}, LoRA ≈ ${fmtGB(mLora)}, QLoRA ≈ ${fmtGB(mQ)}. The 4-bit NF4 base costs ≈ 0.52 B/param instead of 2, so 8B fits a 24 GB GPU with room for longer batches.`
        : `Training memory (8B, ~4 GB activations, ×1.1): full FT ≈ ${fmtGB(mFull)}, LoRA ≈ ${fmtGB(mLora)}. Full FT pays 16 B/param (grads + fp32 Adam state); LoRA pays 2 B/param for the frozen bf16 base and 16 B only for the ${fmtM(total)} adapter params (a 4-bit QLoRA base would cut it to ≈ ${fmtGB(mQ)}).`,
  });
  push({
    ...trained,
    stage: 'premerge',
    panel: 'memory',
    caption: `Unmerged inference runs two paths: W·x and (α/r)·B·(A·x), an extra ${fmtM(lpm)}-param matmul per adapted matrix (useful for hot-swapping one adapter per tenant).`,
    predict: `Now fold the adapter in: W' = W + (α/r)·B·A. How much extra latency does the adapter add at inference after merging?`,
  });
  const Wm = add(W, finDW);
  const hm = mv(Wm, TOY.x);
  const h2 = mv(W, TOY.x).map((v, i) => v + mv(finDW, TOY.x)[i]);
  push({
    ...trained,
    stage: 'merged',
    W: Wm,
    merged: true,
    panel: 'memory',
    caption: `Zero: W' = W + (α/r)·B·A is an ordinary ${Q.dOut} × ${Q.dIn} matrix, so W'·x = W·x + (α/r)·B·A·x (${hn} = ${hm[hi].toFixed(2)} merged, ${h2[hi].toFixed(2)} via the two paths, was ${hx[hi].toFixed(2)} before training) at the base model's cost.${method === 'qlora' ? ' With QLoRA, merge into a bf16 copy of the base, never into the 4-bit weights.' : ''}`,
  });
  push({
    ...trained,
    stage: 'done',
    W: Wm,
    merged: true,
    panel: method === 'qlora' ? 'memory' : 'model',
    caption: `Recap: r = ${r}, α = ${alpha} (scale ${sStr}), ${targets === 'attn' ? 'attention-only' : 'all-linear'} → ${fmtM(total)} trainable (${fmtPct(total / MODEL.params)}), ~${fmtGB(method === 'qlora' ? mQ : mLora)} to train with ${method === 'qlora' ? 'QLoRA' : 'bf16 LoRA'} vs ~${fmtGB(mFull)} for full FT.`,
  });
  return frames;
}
