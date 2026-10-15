// Pure, deterministic semantic cache (no React, Node-testable).
// For each incoming query: embed it, find the most similar cached query (cosine), and
//   sim ≥ threshold → HIT: return the cached answer (no LLM call)
//   sim <  threshold → MISS: call the LLM, then store (query embedding, answer) in the cache.
// Each query has a ground-truth intent; a hit on a different intent is a FALSE HIT (wrong answer served),
// a miss although a same-intent entry was cached is a missed saving. Similarities are fixed toy values.
import type { BaseFrame } from '../../core';

export type StreamId = 'support' | 'travel';

export interface Params {
  threshold: number;
  stream: StreamId;
}

export const DEFAULT_PARAMS: Params = { threshold: 0.88, stream: 'support' };
export const LLM_COST = 0.01; // $ per LLM call (~1.5k tokens on a large model)
export const LOOKUP_COST = 0.0001; // $ per embedding + vector lookup
export const LLM_MS = 1800;
export const LOOKUP_MS = 30;

export interface Q {
  text: string;
  intent: string;
  /** cosine similarity to each earlier query in the stream (index-aligned) */
  sims: number[];
}

export const STREAMS: Record<StreamId, { label: string; queries: Q[] }> = {
  support: {
    label: 'Customer support',
    queries: [
      { text: 'How do I reset my password?', intent: 'reset-password', sims: [] },
      { text: 'I forgot my password, how do I reset it?', intent: 'reset-password', sims: [0.94] },
      { text: 'How do I cancel my subscription?', intent: 'cancel-sub', sims: [0.71, 0.69] },
      { text: 'How do I cancel my order?', intent: 'cancel-order', sims: [0.7, 0.68, 0.89] },
      { text: 'Reset password steps', intent: 'reset-password', sims: [0.92, 0.93, 0.66, 0.64] },
      { text: "What's your refund policy?", intent: 'refund', sims: [0.55, 0.54, 0.72, 0.74, 0.52] },
      { text: 'Cancel subscription please', intent: 'cancel-sub', sims: [0.68, 0.66, 0.95, 0.86, 0.63, 0.7] },
      { text: 'How do I change my password?', intent: 'change-password', sims: [0.9, 0.88, 0.66, 0.64, 0.87, 0.53, 0.62] },
      { text: 'Can I get a refund?', intent: 'refund', sims: [0.54, 0.53, 0.7, 0.73, 0.51, 0.93, 0.69, 0.52] },
      { text: 'How do I cancel order #123?', intent: 'cancel-order', sims: [0.67, 0.65, 0.87, 0.96, 0.63, 0.72, 0.85, 0.62, 0.71] },
    ],
  },
  travel: {
    label: 'Travel assistant',
    queries: [
      { text: 'Flights from NYC to Paris next Friday', intent: 'fly-paris-fri', sims: [] },
      { text: 'Cheap flights NYC → Paris on Friday', intent: 'fly-paris-fri', sims: [0.93] },
      { text: 'Flights from NYC to Paris, Texas', intent: 'fly-paris-tx', sims: [0.91, 0.89] },
      { text: 'Weather in Paris this weekend', intent: 'weather-weekend', sims: [0.62, 0.6, 0.58] },
      { text: 'Hotels near the Eiffel Tower', intent: 'hotel-eiffel', sims: [0.55, 0.54, 0.5, 0.66] },
      { text: 'Paris weather forecast for Saturday', intent: 'weather-weekend', sims: [0.6, 0.59, 0.57, 0.94, 0.64] },
      { text: 'Flights NYC to Paris next Friday morning', intent: 'fly-paris-fri', sims: [0.95, 0.92, 0.89, 0.58, 0.53, 0.57] },
      { text: 'Cheap hotels close to the Eiffel Tower', intent: 'hotel-eiffel', sims: [0.54, 0.55, 0.49, 0.63, 0.95, 0.62, 0.53] },
      { text: 'Flights from NYC to Paris next Saturday', intent: 'fly-paris-sat', sims: [0.93, 0.91, 0.88, 0.6, 0.53, 0.61, 0.94, 0.52] },
      { text: 'Is it raining in Paris right now?', intent: 'weather-now', sims: [0.57, 0.56, 0.55, 0.88, 0.6, 0.86, 0.55, 0.58, 0.56] },
    ],
  },
};

export type Outcome = 'hit' | 'false-hit' | 'miss' | 'missed-saving';

export interface Decision {
  q: number;
  nearest: number | null;
  sim: number;
  outcome: Outcome;
}

/** run the stream at a threshold */
export function run(stream: StreamId, threshold: number): Decision[] {
  const qs = STREAMS[stream].queries;
  const cache: number[] = [];
  const out: Decision[] = [];
  qs.forEach((q, i) => {
    let nearest: number | null = null;
    let sim = 0;
    for (const c of cache) if (q.sims[c] > sim) [nearest, sim] = [c, q.sims[c]];
    const hit = nearest !== null && sim >= threshold;
    const sameCached = cache.some((c) => qs[c].intent === q.intent);
    const outcome: Outcome = hit ? (qs[nearest!].intent === q.intent ? 'hit' : 'false-hit') : sameCached ? 'missed-saving' : 'miss';
    if (!hit) cache.push(i);
    out.push({ q: i, nearest, sim, outcome });
  });
  return out;
}

export function totals(ds: Decision[]) {
  const hits = ds.filter((d) => d.outcome === 'hit' || d.outcome === 'false-hit').length;
  const falseHits = ds.filter((d) => d.outcome === 'false-hit').length;
  const missed = ds.filter((d) => d.outcome === 'missed-saving').length;
  const cost = (ds.length - hits) * LLM_COST + ds.length * LOOKUP_COST;
  const baseline = ds.length * LLM_COST;
  return { hits, falseHits, missed, cost, baseline, saved: baseline - cost };
}

export type Stage = 'intro' | 'query' | 'summary' | 'sweep' | 'done';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** decisions made so far */
  decisions: Decision[];
  current: Decision | null;
  /** query ids currently stored in the cache */
  cache: number[];
  sweep: { t: number; hits: number; falseHits: number; saved: number }[] | null;
}

const $ = (x: number) => `$${x.toFixed(4)}`;

export function simulate({ threshold, stream }: Params): Frame[] {
  const qs = STREAMS[stream].queries;
  const ds = run(stream, threshold);
  const frames: Frame[] = [];
  const push = (f: Omit<Frame, 'sweep'> & { sweep?: Frame['sweep'] }) => frames.push({ sweep: null, ...f });
  push({
    stage: 'intro',
    decisions: [],
    current: null,
    cache: [],
    caption: `Semantic cache in front of an LLM (${$(LLM_COST)} and ~${LLM_MS} ms per call). Each query is embedded (${$(LOOKUP_COST)}, ~${LOOKUP_MS} ms) and compared to cached queries; similarity ≥ ${threshold.toFixed(2)} serves the cached answer.`,
    predict: `Paraphrases score high, but so do questions that only look alike. At ${threshold.toFixed(2)}, will the cache ever serve a wrong answer?`,
  });
  const cache: number[] = [];
  ds.forEach((d, i) => {
    const q = qs[d.q];
    const near = d.nearest !== null ? qs[d.nearest] : null;
    const t = totals(ds.slice(0, i + 1));
    let caption: string;
    if (!near) caption = `"${q.text}": cache is empty → MISS. Call the LLM and store the answer. Spent ${$(t.cost)} so far.`;
    else if (d.outcome === 'hit') caption = `"${q.text}": nearest "${near.text}" at ${d.sim.toFixed(2)} ≥ ${threshold.toFixed(2)} → HIT. Correct answer in ~${LOOKUP_MS} ms, ${$(LLM_COST)} saved.`;
    else if (d.outcome === 'false-hit')
      caption = `"${q.text}": nearest "${near.text}" at ${d.sim.toFixed(2)} ≥ ${threshold.toFixed(2)} → HIT, but it is a FALSE HIT: different intent, so the user gets the wrong answer, fast and confidently.`;
    else if (d.outcome === 'missed-saving') caption = `"${q.text}": nearest "${near.text}" at ${d.sim.toFixed(2)} < ${threshold.toFixed(2)} → MISS. A same-intent answer was cached, so this LLM call was avoidable.`;
    else caption = `"${q.text}": nearest "${near.text}" at ${d.sim.toFixed(2)} < ${threshold.toFixed(2)} → MISS (correctly: different question). Call the LLM and cache it.`;
    if (d.outcome === 'miss' || d.outcome === 'missed-saving') cache.push(d.q);
    const next = ds[i + 1];
    const nextQ = next ? qs[next.q] : null;
    const tricky = next && next.nearest !== null && qs[next.nearest].intent !== nextQ!.intent && next.sim >= 0.85;
    push({
      stage: 'query',
      decisions: ds.slice(0, i + 1),
      current: d,
      cache: [...cache],
      caption,
      predict: tricky
        ? `Next: "${nextQ!.text}". Its nearest cached query is "${qs[next.nearest!].text}" at ${next.sim.toFixed(2)}. At threshold ${threshold.toFixed(2)}, hit or miss, and should it hit?`
        : undefined,
    });
  });
  const T = totals(ds);
  push({
    stage: 'summary',
    decisions: ds,
    current: null,
    cache: [...cache],
    caption: `${qs.length} queries: ${T.hits} hits (${T.falseHits} false), ${T.missed} avoidable misses. Spent ${$(T.cost)} vs ${$(T.baseline)} without a cache, saving ${((T.saved / T.baseline) * 100).toFixed(0)}%.${T.falseHits ? ` But ${T.falseHits} user${T.falseHits > 1 ? 's' : ''} got a wrong answer.` : ''}`,
    predict: `Which threshold gives the most savings with zero false hits for this stream?`,
  });
  const ts = [0.85, 0.88, 0.9, 0.92, 0.94, 0.96];
  const sweep = ts.map((t) => {
    const x = totals(run(stream, t));
    return { t, hits: x.hits, falseHits: x.falseHits, saved: x.saved };
  });
  const safe = sweep.filter((s) => s.falseHits === 0).sort((a, b) => b.saved - a.saved || a.t - b.t)[0];
  push({
    stage: 'sweep',
    decisions: ds,
    current: null,
    cache: [...cache],
    sweep,
    caption: `Threshold sweep: low thresholds hit more but serve wrong answers; high ones are safe but save little. ${safe ? `Here ${safe.t.toFixed(2)} is the best safe setting (${safe.hits} hits, $${safe.saved.toFixed(3)} saved).` : 'No threshold is completely safe.'}${stream === 'travel' ? ' Note "next Friday" vs "next Saturday" scores 0.93: embeddings blur exact entities like dates.' : ''}`,
  });
  push({
    stage: 'done',
    decisions: ds,
    current: null,
    cache: [...cache],
    sweep,
    caption: `Production tips: tune the threshold on labelled query pairs, key the cache by tenant/user and model version, add TTLs, check entities (dates, IDs, places) before serving a hit, and never cache personalised or time-sensitive answers.`,
  });
  return frames;
}
