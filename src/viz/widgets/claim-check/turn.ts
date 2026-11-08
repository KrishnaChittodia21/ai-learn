import type { ChoiceTurn } from '../_shared/yourTurn.ts';
import { SCENARIOS, type Frame, type Params } from './sim.ts';

/** Stamp one claim yourself: the first non-SUPPORTED claim (else the last), asked on its check frame. */
export function buildTurn(frames: Frame[], params: Params): ChoiceTurn {
  const claims = SCENARIOS[params.scenario].claims;
  const bad = claims.findIndex((c) => c.label !== 'SUPPORTED');
  const k = bad >= 0 ? bad : claims.length - 1;
  const at = frames.findIndex((f) => f.stage === 'check' && f.active === k);
  // the next frame is the stamp: its newest label is the sim's verdict
  const stamp = frames[at + 1];
  return {
    kind: 'choice',
    at,
    question: `Stamp claim ${k + 1}: "${claims[k].text}"`,
    options: [
      { id: 'SUPPORTED', label: 'Supported' },
      { id: 'CONTRADICTED', label: 'Contradicted' },
      { id: 'NOT_FOUND', label: 'Not found' },
    ],
    answer: stamp.stamped[k],
    why: claims[k].note[0].toUpperCase() + claims[k].note.slice(1),
  };
}
