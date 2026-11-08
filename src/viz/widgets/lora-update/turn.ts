import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame } from './sim.ts';

/** Predict which of A / B the first gradient step moves, asked on the scale frame, read off the first train frame. */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const at = frameWhere(frames, (f) => f.stage === 'scale');
  const step1 = frames[frameWhere(frames, (f) => f.stage === 'train')];
  const bMoved = !!step1.B?.some((row) => row.some((v) => v !== 0));
  const answer = step1.aMoved && bMoved ? 'both' : step1.aMoved ? 'a' : bMoved ? 'b' : 'none';
  return {
    kind: 'choice',
    at,
    question: 'B starts at zero, A is random. After the first gradient step, which matrix has changed?',
    options: [
      { id: 'a', label: 'Only A' },
      { id: 'b', label: 'Only B' },
      { id: 'both', label: 'Both A and B' },
    ],
    answer,
    why: 'The gradient for A is (α/r)·Bᵀ·G, which is zero while B = 0; the gradient for B is (α/r)·G·Aᵀ, non-zero because A is random. A only starts moving from step 2.',
  };
}
