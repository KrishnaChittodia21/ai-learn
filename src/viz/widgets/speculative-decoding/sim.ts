// Pure, deterministic speculative-decoding model (no React, Node-testable).
// Toy language model: at every output position the TARGET has a fixed distribution p_t over 4 candidate tokens.
// The DRAFT's distribution is a mix p_d = λ·p_t + (1 − λ)·q, where q is a "confused" distribution that favours a
// wrong token; λ is set by the draft-quality choice. Per-position acceptance probability = Σ_x min(p_t(x), p_d(x)).
// One round (Leviathan et al. 2023 / Chen et al. 2023):
//   1. the draft samples k tokens x_1..x_k autoregressively from p_d (k cheap draft steps, cost c each)
//   2. the target runs ONE forward pass over the k positions (+1), giving p_t at each
//   3. for i = 1..k: accept x_i with prob min(1, p_t(x_i)/p_d(x_i)); at the first rejection sample a replacement
//      from the residual norm(max(0, p_t − p_d)) and stop; if all k are accepted, sample a bonus token from p_t at
//      position k+1. Every round emits between 1 and k+1 tokens, and each emitted token is distributed exactly as
//      p_t (lossless).
// Expected tokens per target pass with acceptance rate α: E = (1 − α^(k+1)) / (1 − α).
// Speed-up vs plain decoding ≈ E / (k·c + 1), c = cost of one draft step relative to one target pass.
import { rng, type BaseFrame } from '../../core';

export type Quality = 'low' | 'medium' | 'high';

export interface Params {
  k: number;
  quality: Quality;
  cost: number;
  run: number;
}

export const DEFAULT_PARAMS: Params = { k: 4, quality: 'medium', cost: 0.05, run: 1 };
export const K_MIN = 1;
export const K_MAX = 8;
export const COSTS = [0.02, 0.05, 0.1, 0.2];
export const RUNS = [1, 2, 3];
export const ROUNDS = 5;

/** draft/target mixing weight per quality */
export const LAMBDA: Record<Quality, number> = { low: 0.36, medium: 0.64, high: 0.87 };
export const QUALITY_LABEL: Record<Quality, string> = { low: 'weak draft', medium: 'decent draft', high: 'strong draft' };

export const CONTEXT = 'The capital of France is';
const TEXT = (
  'Paris , a city of about two million people on the river Seine . It is known for the Eiffel Tower , the Louvre museum , ' +
  'wide boulevards and small cafés . The city has been the centre of French politics , art and fashion for many centuries , ' +
  'and it draws more than thirty million visitors every year from all over the world .'
).split(' ');
const POOL = ['the', 'a', 'and', 'its', 'city', 'is', 'of', 'in', 'very', 'one', 'new', 'old', 'French', 'large', 'also', 'many', 'with', 'to', 'by', 'was'];
export const NPOS = TEXT.length;

export interface Pos {
  cands: string[];
  pt: number[];
  pd: number[];
  /** Σ min(p_t, p_d) */
  acc: number;
}


/** fixed target distributions (same for every parameter choice); draft depends on quality */
function buildPositions(quality: Quality): Pos[] {
  const r = rng(2024);
  const lam = LAMBDA[quality];
  return TEXT.map((main) => {
    const alts: string[] = [];
    while (alts.length < 3) {
      const w = POOL[Math.floor(r() * POOL.length)];
      if (w !== main && !alts.includes(w)) alts.push(w);
    }
    const cands = [main, ...alts];
    const pm = 0.62 + 0.33 * r();
    const w1 = 0.4 + 0.4 * r();
    const w2 = (1 - w1) * (0.4 + 0.4 * r());
    const rest = 1 - pm;
    const pt = [pm, rest * w1, rest * w2, rest * (1 - w1 - w2)];
    // confused draft: favours alternative 1
    const q = [0.04, 0.88, 0.05, 0.03];
    const pd = pt.map((p, i) => lam * p + (1 - lam) * q[i]);
    const acc = pt.reduce((s, p, i) => s + Math.min(p, pd[i]), 0);
    return { cands, pt, pd, acc };
  });
}

const posCache = new Map<Quality, Pos[]>();
export function positions(quality: Quality): Pos[] {
  let p = posCache.get(quality);
  if (!p) {
    p = buildPositions(quality);
    posCache.set(quality, p);
  }
  return p;
}

/** mean acceptance rate α of the draft over all positions */
export function alphaOf(quality: Quality): number {
  const ps = positions(quality);
  return ps.reduce((s, p) => s + p.acc, 0) / ps.length;
}

export const expectedTokens = (alpha: number, k: number) => (alpha >= 1 ? k + 1 : (1 - alpha ** (k + 1)) / (1 - alpha));
export const speedup = (alpha: number, k: number, c: number) => expectedTokens(alpha, k) / (k * c + 1);
export function bestK(alpha: number, c: number) {
  let best = 1;
  for (let k = 2; k <= K_MAX; k++) if (speedup(alpha, k, c) > speedup(alpha, best, c) + 1e-12) best = k;
  return best;
}

function sample(p: number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += p[i];
    if (u < acc) return i;
  }
  return p.length - 1;
}

/** normalised residual max(0, p_t − p_d) */
export function residual(pt: number[], pd: number[]): number[] {
  const r = pt.map((p, i) => Math.max(0, p - pd[i]));
  const z = r.reduce((s, x) => s + x, 0);
  return z > 0 ? r.map((x) => x / z) : pt;
}

export type Status = 'pending' | 'accepted' | 'rejected' | 'discarded';

export interface DraftTok {
  pos: number;
  tok: string;
  /** index into cands */
  idx: number;
  pd: number;
  pt: number;
  /** min(1, p_t/p_d) */
  ratio: number;
  u: number;
  status: Status;
}

export interface Emitted {
  tok: string;
  src: 'accept' | 'resample' | 'bonus';
  round: number;
}

export type Stage = 'intro' | 'alpha' | 'draft' | 'verify' | 'emit' | 'lossless-q' | 'lossless' | 'table' | 'k-predict' | 'k-reveal' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  round: number | null;
  emitted: Emitted[];
  draft: DraftTok[] | null;
  /** the extra token emitted at the end of the round (resampled correction or bonus) */
  extra: { tok: string; src: 'resample' | 'bonus'; pos: number; dist: number[] } | null;
  passes: number;
  draftSteps: number;
  /** position shown in the distribution panel */
  focus: number | null;
  /** Monte-Carlo check of the lossless property at `focus`: empirical frequencies */
  mc: number[] | null;
}

const p2 = (x: number) => x.toFixed(2);
const fx = (x: number) => `${x.toFixed(2)}×`;

export interface Round {
  draft: DraftTok[];
  extra: { tok: string; src: 'resample' | 'bonus'; pos: number; dist: number[] };
  start: number;
}

/** run ROUNDS rounds; returns the rounds (exported for verification) */
export function runRounds({ k, quality, run }: Params): Round[] {
  const P = positions(quality);
  const r = rng(7919 * run + 13);
  const rounds: Round[] = [];
  let pos = 0;
  for (let R = 0; R < ROUNDS; R++) {
    const start = pos;
    const draft: DraftTok[] = [];
    for (let i = 0; i < k; i++) {
      const p = P[(start + i) % NPOS];
      const idx = sample(p.pd, r());
      draft.push({ pos: (start + i) % NPOS, tok: p.cands[idx], idx, pd: p.pd[idx], pt: p.pt[idx], ratio: Math.min(1, p.pt[idx] / p.pd[idx]), u: r(), status: 'pending' });
    }
    let extra: Round['extra'] | null = null;
    let rejected = false;
    for (const d of draft) {
      if (rejected) {
        d.status = 'discarded';
        continue;
      }
      if (d.u < d.ratio) d.status = 'accepted';
      else {
        d.status = 'rejected';
        rejected = true;
        const p = P[d.pos];
        const dist = residual(p.pt, p.pd);
        const idx = sample(dist, r());
        extra = { tok: p.cands[idx], src: 'resample', pos: d.pos, dist };
      }
    }
    if (!extra) {
      const bp = (start + k) % NPOS;
      const p = P[bp];
      const idx = sample(p.pt, r());
      extra = { tok: p.cands[idx], src: 'bonus', pos: bp, dist: p.pt };
    }
    const nAcc = draft.filter((d) => d.status === 'accepted').length;
    pos = (start + nAcc + 1) % NPOS;
    rounds.push({ draft, extra, start });
  }
  return rounds;
}

/** empirical distribution of ONE speculative step at position `pos` (draft 1 token, verify, resample) */
export function monteCarlo(p: Pos, n: number, seed: number): number[] {
  const r = rng(seed);
  const cnt = [0, 0, 0, 0];
  const res = residual(p.pt, p.pd);
  for (let t = 0; t < n; t++) {
    const x = sample(p.pd, r());
    if (r() < Math.min(1, p.pt[x] / p.pd[x])) cnt[x]++;
    else cnt[sample(res, r())]++;
  }
  return cnt.map((c) => c / n);
}
export const MC_N = 20000;

export function simulate(params: Params): Frame[] {
  const { k, quality, cost } = params;
  const P = positions(quality);
  const alpha = alphaOf(quality);
  const E = expectedTokens(alpha, k);
  const S = speedup(alpha, k, cost);
  const frames: Frame[] = [];
  const emitted: Emitted[] = [];
  let passes = 0;
  let draftSteps = 0;
  const base = () => ({ round: null, emitted: [...emitted], draft: null, extra: null, passes, draftSteps, focus: null, mc: null });
  const push = (f: Partial<Frame> & { stage: Stage; caption: string }) => {
    const fr = { ...base(), ...f } as Frame;
    if (fr.predict === undefined) delete fr.predict;
    frames.push(fr);
  };
  const qd = (t: string) => `"${t}"`;

  push({
    stage: 'intro',
    caption: `Prompt: ${qd(CONTEXT)}. Plain decoding costs one full target forward pass per token. Here a ${QUALITY_LABEL[quality]} (cost c = ${cost} of a target pass per token) proposes k = ${k} token${k === 1 ? '' : 's'} per round.`,
  });
  push({
    stage: 'alpha',
    focus: 0,
    caption: `At each position the draft's distribution p_d differs from the target's p_t. The chance a draft token survives verification is Σ min(p_t, p_d); averaged over positions this ${QUALITY_LABEL[quality]} has acceptance rate α = ${p2(alpha)}.`,
  });

  const rounds = runRounds(params);
  let firstRejectSeen = false;
  let firstRejectPos: number | null = null;
  rounds.forEach((rd, R) => {
    const n = R + 1;
    const pending = rd.draft.map((d) => ({ ...d, status: 'pending' as Status }));
    draftSteps += k;
    push({
      stage: 'draft',
      round: n,
      draft: pending,
      focus: rd.draft[0].pos,
      caption: `Round ${n}: the draft runs ${k} cheap step${k === 1 ? '' : 's'} (${p2(k * cost)} of a target pass) and proposes ${rd.draft.map((d) => qd(d.tok)).join(' ')}. Nothing is emitted yet.`,
      predict:
        n === 1
          ? `The target now checks all ${k} draft token${k === 1 ? '' : 's'} in ONE forward pass. With α = ${p2(alpha)}, how many tokens do you expect this pass to emit (between 1 and ${k + 1})?`
          : undefined,
    });
    passes += 1;
    const nAcc = rd.draft.filter((d) => d.status === 'accepted').length;
    const rej = rd.draft.find((d) => d.status === 'rejected');
    const nDisc = rd.draft.filter((d) => d.status === 'discarded').length;
    const detail = rd.draft
      .filter((d) => d.status !== 'discarded')
      .map((d) =>
        d.ratio >= 1
          ? `${qd(d.tok)} accepted (p_t ${p2(d.pt)} ≥ p_d ${p2(d.pd)})`
          : `${qd(d.tok)} ${d.status === 'accepted' ? 'accepted' : 'rejected'} (u ${p2(d.u)} ${d.status === 'accepted' ? '<' : '≥'} p_t/p_d = ${p2(d.ratio)})`,
      )
      .join(', ');
    const isFirstRej = !!rej && !firstRejectSeen;
    if (rej && !firstRejectSeen) {
      firstRejectSeen = true;
      firstRejectPos = rej.pos;
    }
    push({
      stage: 'verify',
      round: n,
      draft: rd.draft,
      focus: rej ? rej.pos : rd.extra.pos,
      caption: `Target pass ${passes}: ${detail}.${nDisc ? ` The ${nDisc} draft token${nDisc === 1 ? '' : 's'} after the rejection ${nDisc === 1 ? 'is' : 'are'} discarded.` : ''}`,
      predict: isFirstRej
        ? `${qd(rej!.tok)} was rejected. Should the target now emit its own most likely token, the draft's next guess, or something else?`
        : undefined,
    });
    rd.draft.filter((d) => d.status === 'accepted').forEach((d) => emitted.push({ tok: d.tok, src: 'accept', round: n }));
    emitted.push({ tok: rd.extra.tok, src: rd.extra.src, round: n });
    const got = nAcc + 1;
    const extraP = P[rd.extra.pos];
    const resStr = rd.extra.src === 'resample' ? extraP.cands.map((c, i) => `${c} ${p2(rd.extra.dist[i])}`).filter((_, i) => rd.extra.dist[i] >= 0.005).join(', ') : '';
    push({
      stage: 'emit',
      round: n,
      draft: rd.draft,
      extra: rd.extra,
      focus: rd.extra.pos,
      caption:
        rd.extra.src === 'resample'
          ? `Emit ${nAcc} accepted + ${qd(rd.extra.tok)} sampled from the residual max(0, p_t − p_d), normalised (${resStr}): ${got} token${got === 1 ? '' : 's'} for 1 target pass. Running total ${emitted.length} token${emitted.length === 1 ? '' : 's'} / ${passes} pass${passes === 1 ? '' : 'es'} = ${p2(emitted.length / passes)}.`
          : `All ${k} accepted, so the target's distribution at the next position (computed in the same pass) gives a free bonus token ${qd(rd.extra.tok)}: ${got} tokens for 1 pass. Running total ${emitted.length} / ${passes} = ${p2(emitted.length / passes)} per pass.`,
    });
  });

  const fpos = firstRejectPos ?? 0;
  const fp = P[fpos];
  const mc = monteCarlo(fp, MC_N, 99 + params.run);
  const maxDev = Math.max(...mc.map((m, i) => Math.abs(m - fp.pt[i])));
  push({
    stage: 'lossless-q',
    focus: fpos,
    caption: `Most emitted tokens were proposed by the ${QUALITY_LABEL[quality]}, whose p_d puts ${p2(fp.pd[1])} on ${qd(fp.cands[1])} where the target puts ${p2(fp.pt[1])}.`,
    predict: `Does speculative decoding make the output follow the draft model a bit more than the target would on its own?`,
  });
  push({
    stage: 'lossless',
    focus: fpos,
    mc,
    caption: `No. P(emit x) = min(p_t, p_d) (accepted) + (1 − β)·residual(x) (resampled) = p_t(x) exactly, where β = Σ min(p_t, p_d) = ${p2(fp.acc)} here. ${MC_N.toLocaleString('en-US')} simulated steps at the position of ${qd(fp.cands[0])} match p_t within ${maxDev.toFixed(3)}: lossless, only speed changes.`,
  });
  const tpp = emitted.length / passes;
  push({
    stage: 'table',
    caption: `This run: ${emitted.length} tokens in ${passes} target passes = ${p2(tpp)} per pass (expected E = (1 − α^(k+1))/(1 − α) = ${p2(E)}). Each round costs k·c + 1 = ${p2(k * cost + 1)} target passes, so speed-up ≈ ${p2(E)} / ${p2(k * cost + 1)} = ${fx(S)}.`,
  });
  const aLow = alphaOf('low');
  const s4 = speedup(aLow, 4, cost);
  const s8 = speedup(aLow, 8, cost);
  push({
    stage: 'k-predict',
    caption: `The best k for α = ${p2(alpha)} and c = ${cost} is ${bestK(alpha, cost)} (speed-up ${fx(speedup(alpha, bestK(alpha, cost), cost))}); you chose k = ${k} (${fx(S)}).`,
    predict: `With the weak draft (α = ${p2(aLow)}) and c = ${cost}, what happens to the speed-up if k goes from 4 to 8?`,
  });
  push({
    stage: 'k-reveal',
    caption: `It ${s8 < s4 ? 'drops' : 'barely rises'}: E grows only ${p2(expectedTokens(aLow, 4))} → ${p2(expectedTokens(aLow, 8))} tokens (drafts 5–8 are only reached with probability α^4 = ${p2(aLow ** 4)}) while draft cost grows ${p2(1 + 4 * cost)} → ${p2(1 + 8 * cost)}, so ${fx(s4)} → ${fx(s8)}. Long drafts only pay with high α.`,
  });
  push({
    stage: 'done',
    caption: `Recap: k = ${k}, α = ${p2(alpha)}, c = ${cost} → ${p2(E)} expected tokens per target pass, ≈ ${fx(S)} faster, identical output distribution. Gains shrink at large batch, where decode is no longer memory-bound.`,
  });
  return frames;
}
