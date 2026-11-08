// Pure, deterministic next-token sampler (no React, Node-testable).
// One generation step over a toy top-8 vocabulary: logits ÷ temperature → softmax → top-k cut → top-p cut
// (smallest prefix of the sorted distribution whose mass reaches p; the stricter of the two cuts wins) →
// renormalise the survivors → draw r ∈ [0,1) from a seeded PRNG and pick where it lands on the cumulative bar.
import type { BaseFrame } from '../../core';

export type PromptId = 'fact' | 'story';

export interface Params {
  prompt: PromptId;
  /** 0.1 – 2.0 */
  temperature: number;
  /** 1 – 8 (8 = off: the whole toy vocabulary) */
  topK: number;
  /** 0.05 – 1.0 */
  topP: number;
  /** dice seed; "Roll again" bumps it */
  seed: number;
}

export const DEFAULT_PARAMS: Params = { prompt: 'fact', temperature: 1, topK: 8, topP: 0.9, seed: 14 };
export const T_MIN = 0.1;
export const T_MAX = 2;
export const VOCAB = 8;

export interface Prompt {
  label: string;
  tokens: string[];
  /** top-8 candidates, sorted by logit (highest first) */
  cands: { token: string; logit: number }[];
  /** candidates that would state a wrong fact */
  wrong: string[];
}

export const PROMPTS: Record<PromptId, Prompt> = {
  fact: {
    label: 'Factual',
    tokens: ['The', ' capital', ' of', ' Australia', ' is'],
    cands: [
      { token: ' Canberra', logit: 6.2 },
      { token: ' Sydney', logit: 4.9 },
      { token: ' a', logit: 3.1 },
      { token: ' located', logit: 2.6 },
      { token: ' Melbourne', logit: 2.4 },
      { token: ' the', logit: 2.2 },
      { token: ' not', logit: 1.4 },
      { token: ' home', logit: 1.0 },
    ],
    wrong: [' Sydney', ' Melbourne'],
  },
  story: {
    label: 'Creative',
    tokens: ['Once', ' upon', ' a', ' time', ',', ' a'],
    cands: [
      { token: ' young', logit: 3.1 },
      { token: ' little', logit: 3.0 },
      { token: ' dragon', logit: 2.6 },
      { token: ' girl', logit: 2.5 },
      { token: ' king', logit: 2.3 },
      { token: ' robot', logit: 1.9 },
      { token: ' lonely', logit: 1.8 },
      { token: ' small', logit: 1.7 },
    ],
    wrong: [],
  },
};

/** Your-turn goal on the factual prompt: the right answer on at least this share of draws */
export const TUNE_TARGET = 0.95;

/** deterministic PRNG (mulberry32, as core.rng; copied so this file has no React import) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Dist {
  /** logit ÷ T */
  scaled: number[];
  /** softmax(scaled) over all 8 */
  prob: number[];
  /** survivors after top-k alone / top-p alone */
  nK: number;
  nP: number;
  /** survivors after both cuts (a prefix of the sorted candidates) */
  n: number;
  /** softmax mass the survivors held before renormalising */
  kept: number;
  /** renormalised over the survivors (0 for the cut ones) */
  renorm: number[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function distribution(promptId: PromptId, temperature: number, topK: number, topP: number): Dist {
  const P = PROMPTS[promptId];
  const T = clamp(temperature, T_MIN, T_MAX);
  const scaled = P.cands.map((c) => c.logit / T);
  const m = Math.max(...scaled);
  const ex = scaled.map((x) => Math.exp(x - m));
  const Z = ex.reduce((a, b) => a + b, 0);
  const prob = ex.map((e) => e / Z);
  const nK = clamp(Math.round(topK), 1, VOCAB);
  let cum = 0;
  let nP = 0;
  while (nP < prob.length && (nP === 0 || cum < topP - 1e-9)) cum += prob[nP++];
  const n = Math.min(nK, nP);
  const kept = prob.slice(0, n).reduce((a, b) => a + b, 0);
  const renorm = prob.map((x, i) => (i < n ? x / kept : 0));
  return { scaled, prob, nK, nP, n, kept, renorm };
}

/** index the uniform draw r lands on in the cumulative bar of the survivors */
export function drawIndex(d: Dist, r: number): number {
  let c = 0;
  for (let i = 0; i < d.n; i++) {
    c += d.renorm[i];
    if (r < c) return i;
  }
  return d.n - 1;
}

/** `count` independent draws for the tune check, reproducible per setting */
export function drawMany(d: Dist, seed: number, count: number): number[] {
  const R = rng(seed);
  return Array.from({ length: count }, () => drawIndex(d, R()));
}

export type Stage = 'tokens' | 'logits' | 'temperature' | 'softmax' | 'topk' | 'topp' | 'renorm' | 'sample' | 'append' | 'recap';
export const STAGES: Stage[] = ['tokens', 'logits', 'temperature', 'softmax', 'topk', 'topp', 'renorm', 'sample', 'append', 'recap'];

export interface Frame extends BaseFrame {
  stage: Stage;
  /** position of the stage in STAGES (the renderer reveals layers by it) */
  step: number;
  /** "Your turn" on this frame */
  turn?: 'predict' | 'tune';
  dist: Dist;
  r: number;
  pick: number;
}

const pct = (x: number) => (x * 100 >= 10 ? (x * 100).toFixed(0) : (x * 100).toFixed(1)) + '%';
const word = (t: string) => t.trim();

export function simulate({ prompt, temperature, topK, topP, seed }: Params): Frame[] {
  const P = PROMPTS[prompt];
  const T = clamp(temperature, T_MIN, T_MAX);
  const d = distribution(prompt, T, topK, topP);
  const r = rng(seed)();
  const k = drawIndex(d, r);
  const tok = P.cands[k].token;
  const fact = prompt === 'fact';
  const kOff = d.nK >= VOCAB;

  const caps: Record<Stage, string> = {
    tokens: `The prompt is split into ${P.tokens.length} tokens. The model reads all of them and predicts what comes next.`,
    logits: `The model outputs one score (a logit) for every token in its vocabulary. These are the top ${VOCAB}: higher means "more expected here".`,
    temperature: `Divide every logit by the temperature, T = ${T.toFixed(1)}. ${T < 1 ? 'Below 1 the gaps grow: the favourite pulls ahead.' : T > 1 ? 'Above 1 the gaps shrink: the outsiders catch up.' : 'At exactly 1 nothing changes.'}`,
    softmax: `Softmax: exponentiate and normalise so the scores become probabilities that sum to 1. "${word(P.cands[0].token)}" gets ${pct(d.prob[0])}, "${word(P.cands[1].token)}" ${pct(d.prob[1])}.`,
    topk: kOff
      ? `Top-k is off (k = ${VOCAB} keeps every token shown). Lower k to keep only the k most likely tokens, however much probability the rest hold.`
      : `Top-k = ${d.nK}: keep only the ${d.nK} most likely token${d.nK > 1 ? 's' : ''}, a fixed count no matter how the probability is spread.`,
    topp: `Top-p = ${topP.toFixed(2)}: keep the smallest set of tokens whose probabilities add up to at least ${topP.toFixed(2)} (${d.nP} token${d.nP > 1 ? 's' : ''}). With top-k, the stricter cut wins: ${d.n} survivor${d.n > 1 ? 's' : ''} holding ${pct(d.kept)}; the rest can never be picked.`,
    renorm: `Renormalise: rescale the ${d.n} survivor${d.n > 1 ? 's' : ''} so they sum to 1 again. This is the distribution the dice actually roll on.`,
    sample: `Sample: draw a random number r = ${r.toFixed(2)} and see where it lands on the cumulative bar. It lands on "${word(tok)}" (${pct(d.renorm[k])} of the bar).`,
    append: `"${word(tok)}" is appended. The longer text goes back in and the whole loop runs again for the next token, until a stop token or max_tokens.${fact && P.wrong.includes(tok) ? ' Here the dice picked a wrong fact: a hallucination born from sampling.' : ''}`,
    recap: fact
      ? `Same model, same prompt: the answer depends on T, top-k and top-p. For facts you want the favourite almost every time (T ≈ 0–0.3); change temperature or top-p, not both.`
      : `Creative text wants variety: T around 0.7–1.0 keeps it fresh; a very high T lets odd continuations in.`,
  };

  return STAGES.map((stage, step) => ({
    stage,
    step,
    caption: caps[stage],
    turn: fact && stage === 'tokens' ? 'predict' : fact && stage === 'recap' ? 'tune' : undefined,
    predict: stage === 'temperature' && !fact ? 'If you raise T to 2.0, does "small" become more or less likely than now?' : undefined,
    dist: d,
    r,
    pick: k,
  }));
}
