import { frameWhere, type ChoiceTurn } from '../_shared/yourTurn.ts';
import type { Frame } from './sim.ts';

/** Predict whether one chunk holds the whole answer sentence, asked on "question", revealed on "answer". */
export function buildTurn(frames: Frame[]): ChoiceTurn {
  const hits = frames.find((f) => f.stage === 'answer')?.answerHits ?? [];
  return {
    kind: 'choice',
    at: frameWhere(frames, (f) => f.stage === 'question'),
    question: 'Look at the ✂ marks. Does any single chunk contain the whole highlighted answer sentence?',
    options: [
      { id: 'yes', label: 'Yes, one chunk has it all' },
      { id: 'no', label: 'No, it is split' },
    ],
    answer: hits.length ? 'yes' : 'no',
    why: hits.length
      ? `Chunk ${hits.map((h) => h + 1).join(' and ')} hold${hits.length > 1 ? '' : 's'} the full sentence, so one retrieved chunk answers the question.`
      : 'The sentence straddles a boundary and no chunk has all of it. More overlap or recursive splitting fixes that.',
  };
}
