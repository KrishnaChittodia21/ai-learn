import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import { fmtBytes, type Frame, type Params } from './sim.ts';

/** Predict one long sequence's KV-cache size, asked on the per-token formula frame, revealed by the scale frame. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const at = frameWhere(frames, (f) => f.stage === 'formula');
  const long = frames[frameWhere(frames, (f) => f.stage === 'scale')].longBytes!;
  // ×1/8 and ×8 distractors: the classic slips are forgetting GQA (×n_heads/n_kv_heads) or one factor of layers
  const options = [long / 8, long, long * 8].map((b) => ({ id: fmtBytes(b), label: fmtBytes(b) }));
  return {
    kind: 'choice',
    at,
    question: `Per-token size is on screen. How much KV cache does one ${params.seqLen.toLocaleString('en-US')}-token sequence need?`,
    options,
    answer: fmtBytes(long),
    why: `Memory grows linearly: ${fmtBytes(frames[at].longBytes!)}/token × ${params.seqLen.toLocaleString('en-US')} tokens = ${fmtBytes(long)}, for every sequence in the batch.`,
  };
}
