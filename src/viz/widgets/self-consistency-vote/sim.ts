// Pure, deterministic self-consistency vote (no React, Node-testable).
// One prompt is sampled N times at temperature > 0. Each sample is a reasoning path that ends in a short
// final answer. Code parses the answers, counts votes and either returns the majority or abstains
// (tie at the top, top label below half of the votes, or the top label is the abstain label UNSURE).
import type { BaseFrame } from '../../core';

export type ScenarioId = 'maths' | 'tie' | 'open';

export interface Params {
  scenario: ScenarioId;
  /** number of samples (odd, 1..9) */
  n: number;
}

export const DEFAULT_PARAMS: Params = { scenario: 'maths', n: 5 };
export const MIN_N = 1;
export const MAX_N = 9;
/** illustrative output tokens per sampled reasoning path */
export const TOKENS_PER_PATH = 180;

export interface Path {
  reasoning: string;
  answer: string;
  /** whether this answer is right (null = no single right answer) */
  correct: boolean | null;
}

export interface Scenario {
  label: string;
  question: string;
  /** the label code treats as an explicit abstain */
  abstainLabel?: string;
  paths: Path[];
}

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  maths: {
    label: 'Word problem',
    question: 'Pens cost $2 for a pack of 3. How much do 18 pens cost?',
    paths: [
      { reasoning: '18 pens × $2 each', answer: '$36', correct: false },
      { reasoning: '18 / 3 = 6 packs; 6 × $2', answer: '$12', correct: true },
      { reasoning: '$2 / 3 = $0.667 per pen; × 18', answer: '$12', correct: true },
      { reasoning: '18 / 3 = 6 … answer is the pack count', answer: '$6', correct: false },
      { reasoning: '3 pens → $2, so 18 pens → $2 × 6', answer: '$12', correct: true },
      { reasoning: 'packs = 18 / 3 = 6; cost = 6 × 2', answer: '$12', correct: true },
      { reasoning: '9 packs of 2 pens … × $2', answer: '$18', correct: false },
      { reasoning: '6 packs needed, $2 per pack', answer: '$12', correct: true },
      { reasoning: '$12 for 18 pens (6 packs)', answer: '$12', correct: true },
    ],
  },
  tie: {
    label: 'Ambiguous claim',
    question: 'Expense: client dinner, $140 for 2 people, "drinks included", receipt attached. Policy: meals ≤ $60/person, no alcohol.',
    abstainLabel: 'UNSURE',
    paths: [
      { reasoning: '$70 per person > $60 limit', answer: 'REJECT', correct: null },
      { reasoning: '"drinks" may be soft drinks; under limit after tip?', answer: 'APPROVE', correct: null },
      { reasoning: 'alcohol likely, not itemised', answer: 'REJECT', correct: null },
      { reasoning: 'limit includes tip; client meals exempt?', answer: 'APPROVE', correct: null },
      { reasoning: 'cannot tell if drinks were alcohol', answer: 'UNSURE', correct: null },
      { reasoning: 'client entertainment, policy unclear', answer: 'APPROVE', correct: null },
      { reasoning: '$70/person breaks rule 1', answer: 'REJECT', correct: null },
      { reasoning: 'over limit, reject', answer: 'REJECT', correct: null },
      { reasoning: 'receipt attached, approve', answer: 'APPROVE', correct: null },
    ],
  },
  open: {
    label: 'Open-ended',
    question: 'Write a one-line tagline for a note-taking app.',
    paths: [
      { reasoning: 'focus on speed', answer: 'Think it. Keep it.', correct: null },
      { reasoning: 'focus on memory', answer: 'Never lose an idea', correct: null },
      { reasoning: 'focus on calm', answer: 'Your quiet second brain', correct: null },
      { reasoning: 'focus on teams', answer: 'Notes your team reads', correct: null },
      { reasoning: 'focus on search', answer: 'Find anything you wrote', correct: null },
      { reasoning: 'focus on writing', answer: 'Write once, recall forever', correct: null },
      { reasoning: 'focus on mobile', answer: 'Ideas, in your pocket', correct: null },
      { reasoning: 'focus on simplicity', answer: 'Just notes. Done right.', correct: null },
      { reasoning: 'focus on habit', answer: 'Capture the day', correct: null },
    ],
  },
};

export type Stage = 'intro' | 'sample' | 'tally' | 'verdict' | 'recap';

export interface Tally {
  label: string;
  votes: number;
}

export interface Verdict {
  kind: 'majority' | 'tie' | 'weak' | 'abstained' | 'single';
  answer: string | null;
  reason: string;
}

export interface Frame extends BaseFrame {
  stage: Stage;
  /** number of paths shown so far */
  shown: number;
  tally: Tally[];
  verdict: Verdict | null;
  tokens: number;
}

/** Count answers, most votes first (ties keep first-seen order). */
export function countVotes(answers: string[]): Tally[] {
  const m = new Map<string, number>();
  for (const a of answers) m.set(a, (m.get(a) ?? 0) + 1);
  return [...m.entries()].map(([label, votes]) => ({ label, votes })).sort((a, b) => b.votes - a.votes);
}

/** Majority vote with abstain rules: tie at the top, under half the votes, or the abstain label on top. */
export function decide(answers: string[], abstainLabel?: string): Verdict {
  const n = answers.length;
  if (n === 1) return { kind: 'single', answer: answers[0], reason: 'one sample, nothing to vote on' };
  const t = countVotes(answers);
  const top = t[0];
  if (t.length > 1 && t[1].votes === top.votes) {
    const tied = t.filter((x) => x.votes === top.votes).map((x) => x.label);
    return {
      kind: 'tie',
      answer: null,
      reason: top.votes === 1 ? `all ${n} answers differ` : `tie at ${top.votes} votes: ${tied.slice(0, 2).join(' vs ')}${tied.length > 2 ? ' vs …' : ''}`,
    };
  }
  if (abstainLabel && top.label === abstainLabel) return { kind: 'abstained', answer: null, reason: `most samples said ${abstainLabel}` };
  if (top.votes * 2 < n) return { kind: 'weak', answer: null, reason: `top answer has only ${top.votes}/${n} votes (< half)` };
  return { kind: 'majority', answer: top.label, reason: `${top.votes}/${n} votes` };
}

export function simulate({ scenario, n }: Params): Frame[] {
  const s = SCENARIOS[scenario];
  const N = Math.max(MIN_N, Math.min(MAX_N, Math.round(n)));
  const paths = s.paths.slice(0, N);
  const frames: Frame[] = [];
  const answers = paths.map((p) => p.answer);
  const push = (f: Omit<Frame, 'tokens'> & { tokens?: number }) => frames.push({ tokens: f.shown * TOKENS_PER_PATH, ...f });

  push({
    stage: 'intro',
    shown: 0,
    tally: [],
    verdict: null,
    caption: `Question: "${s.question}" The same chain-of-thought prompt will be sampled ${N} time${N === 1 ? '' : 's'} at temperature > 0, so each run can take a different reasoning path. Code, not the model, counts the final answers.`,
    predict:
      scenario === 'maths'
        ? 'Some paths will make an arithmetic slip. Do you expect the slips to agree with each other, or to scatter?'
        : scenario === 'tie'
          ? 'The claim is genuinely ambiguous under the policy. What should a well-built voter do if the samples split?'
          : 'Every sample will write a different tagline. What is there to vote on?',
  });

  paths.forEach((p, i) => {
    const mark = p.correct === null ? '' : p.correct ? ' (right)' : ' (a slip)';
    push({
      stage: 'sample',
      shown: i + 1,
      tally: countVotes(answers.slice(0, i + 1)),
      verdict: null,
      caption: `Sample ${i + 1}/${N}: reasoning "${p.reasoning}" → final answer ${p.answer}${mark}. The parser keeps only the answer inside <answer>; the reasoning is discarded.`,
      predict: i === N - 1 && N > 1 ? `All ${N} answers are in. Which answer wins the vote, or does the voter abstain?` : undefined,
    });
  });

  const verdict = decide(answers, s.abstainLabel);
  const tally = countVotes(answers);
  push({
    stage: 'tally',
    shown: N,
    tally,
    verdict: null,
    caption: `Tally: ${tally.map((t) => `${t.label} × ${t.votes}`).join(', ')}. Wrong paths tend to scatter across different wrong answers, while right paths converge on the same one.`,
  });

  let caption: string;
  if (verdict.kind === 'majority')
    caption = `Majority: ${verdict.answer} with ${verdict.reason}. ${paths[0].correct === false && paths[0].answer !== verdict.answer ? `Sample 1 alone said ${paths[0].answer}; the vote corrected it. ` : ''}Log the split: a narrow win deserves less trust than a unanimous one.`;
  else if (verdict.kind === 'single') caption = `N = 1: the answer is whatever this one path said (${verdict.answer}). ${paths[0].correct === false ? 'Here that is wrong, and nothing catches it.' : ''} Increase N to see voting.`;
  else if (scenario === 'open') caption = `No agreement: ${verdict.reason}. Free text never matches exactly, so there is nothing to count. Voting does not apply; use a judge or pick-best instead.`;
  else caption = `Abstain: ${verdict.reason}. Instead of picking a winner by coin flip, route the claim to a human with the vote split attached.`;
  push({ stage: 'verdict', shown: N, tally, verdict, caption });

  push({
    stage: 'recap',
    shown: N,
    tally,
    verdict,
    caption: `Cost: ${N} samples × ~${TOKENS_PER_PATH} output tokens ≈ ${N * TOKENS_PER_PATH} tokens, ${N}× a single call (latency = the slowest sample when run in parallel). Self-consistency pays off for short, exactly comparable answers (numbers, labels); it cannot fix an error every sample makes the same way.`,
  });
  return frames;
}
