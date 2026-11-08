import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { alphaOf, expectedTokens, speedup, type Frame, type Params } from './sim.ts';

/** With the weak draft, predict what k 4 → 8 does to the speed-up; asked on 'k-predict', revealed by 'k-reveal'. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const a = alphaOf('low');
  const s4 = speedup(a, 4, params.cost);
  const s8 = speedup(a, 8, params.cost);
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'k-predict'),
    question: `Weak draft (α = ${a.toFixed(2)}), c = ${params.cost}: what happens to the speed-up when k goes from 4 to 8?`,
    options: [
      { id: 'rises', label: 'It rises: more tokens per pass' },
      { id: 'same', label: 'About the same' },
      { id: 'drops', label: 'It drops' },
    ],
    answer: s8 < s4 ? 'drops' : s8 > s4 * 1.02 ? 'rises' : 'same',
    why: `${s4.toFixed(2)}× → ${s8.toFixed(2)}×. Expected tokens per pass only grow ${expectedTokens(a, 4).toFixed(2)} → ${expectedTokens(a, 8).toFixed(2)} (late drafts are rarely reached at low α), while draft cost doubles.`,
  };
}
