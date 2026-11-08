import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { CORPUS, wordToBytes, type Frame } from './sim.ts';

/** Initial adjacent-pair counts over the corpus (weighted by word frequency), most frequent first. */
export function pairCounts(): { pair: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const [w, c] of CORPUS) {
    const s = wordToBytes(w);
    for (let i = 0; i < s.length - 1; i++) counts.set(`"${s[i]}" + "${s[i + 1]}"`, (counts.get(`"${s[i]}" + "${s[i + 1]}"`) ?? 0) + c);
  }
  return [...counts].map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair));
}

/** Predict which pair BPE merges first, asked on the "bytes" frame, revealed by merge #1. */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const top = pairCounts().slice(0, 4);
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'bytes'),
    question: 'Which adjacent pair is the most frequent in the corpus, so BPE merges it first?',
    // alphabetical so the answer isn't always first
    options: top.map((p) => ({ id: p.pair, label: p.pair })).sort((a, b) => a.label.localeCompare(b.label)),
    answer: top[0].pair,
    why: `${top[0].pair} appears ${top[0].count}× (counts are weighted by word frequency; runner-up ${top[1].pair} ${top[1].count}×), so it becomes token #257.`,
  };
}
