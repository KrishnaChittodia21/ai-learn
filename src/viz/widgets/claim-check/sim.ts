// Pure, deterministic claim-level groundedness check (no React, Node-testable).
// An answer is decomposed into atomic claims; each claim is checked against one source passage and
// stamped SUPPORTED (an evidence span in the source entails it), CONTRADICTED (a span says otherwise)
// or NOT_FOUND (the source is silent). Faithfulness = supported ÷ claims checked.
import type { BaseFrame } from '../../core';

export type ScenarioId = 'faithful' | 'number' | 'invented';
export type Label = 'SUPPORTED' | 'CONTRADICTED' | 'NOT_FOUND';

export interface Params {
  scenario: ScenarioId;
}

export const DEFAULT_PARAMS: Params = { scenario: 'faithful' };

export const SOURCE =
  'The Brewmax X200 coffee maker has a 1.5-litre water tank. It brews a full jug in 6 minutes. ' +
  'The X200 is covered by a 2-year limited warranty from the date of purchase. ' +
  'Warranty claims require proof of purchase. The glass jug should be washed by hand.';

/** source words, in order (split on single spaces) */
export const WORDS = SOURCE.split(' ');

export interface Claim {
  text: string;
  label: Label;
  /** verbatim substring of SOURCE that supports or contradicts the claim (none for NOT_FOUND) */
  evidence?: string;
  /** why the stamp is what it is */
  note: string;
}

export interface Scenario {
  label: string;
  question: string;
  answer: string;
  claims: Claim[];
}

const TANK: Claim = {
  text: 'The X200 has a 1.5-litre water tank.',
  label: 'SUPPORTED',
  evidence: 'has a 1.5-litre water tank.',
  note: 'same number, same unit, same product: the span entails the claim.',
};
const WARRANTY: Claim = {
  text: 'The X200 has a 2-year warranty.',
  label: 'SUPPORTED',
  evidence: 'covered by a 2-year limited warranty',
  note: '"2-year limited warranty" entails "2-year warranty" (dropping a qualifier is fine; adding one would not be).',
};
const PROOF: Claim = {
  text: 'Claiming the warranty needs proof of purchase.',
  label: 'SUPPORTED',
  evidence: 'Warranty claims require proof of purchase.',
  note: 'a paraphrase, not a copy, yet fully entailed. Exact string match would wrongly miss this.',
};

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  faithful: {
    label: 'Faithful answer',
    question: 'How fast is the X200 and what warranty does it have?',
    answer: 'The X200 brews a full jug in 6 minutes. It has a 2-year warranty, and you need proof of purchase to claim it.',
    claims: [
      {
        text: 'The X200 brews a full jug in 6 minutes.',
        label: 'SUPPORTED',
        evidence: 'It brews a full jug in 6 minutes.',
        note: '"It" in the source resolves to the X200, so the span entails the claim.',
      },
      WARRANTY,
      PROOF,
    ],
  },
  number: {
    label: 'Wrong number',
    question: 'Give me the X200 key specs.',
    answer: 'The X200 has a 1.5-litre water tank, brews a full jug in 4 minutes and has a 2-year warranty.',
    claims: [
      TANK,
      {
        text: 'The X200 brews a full jug in 4 minutes.',
        label: 'CONTRADICTED',
        evidence: 'It brews a full jug in 6 minutes.',
        note: 'the source states 6 minutes, so 4 minutes is an intrinsic hallucination. An embedding check would call these sentences near-identical.',
      },
      WARRANTY,
    ],
  },
  invented: {
    label: 'Invented extra fact',
    question: 'What should I know before buying the X200?',
    answer: 'The X200 has a 1.5-litre water tank and a 2-year warranty. The glass jug is dishwasher-safe, and claims need proof of purchase.',
    claims: [
      TANK,
      WARRANTY,
      {
        text: 'The glass jug is dishwasher-safe.',
        label: 'NOT_FOUND',
        note: 'nothing in the source says so (it only says to wash the jug by hand, which hints otherwise but does not state it). An extrinsic hallucination: plausible, unverifiable, so it is NOT supported.',
      },
      PROOF,
    ],
  },
};

/** [start, end) word indexes of `evidence` inside SOURCE, or null if it is not a verbatim span */
export function spanWords(evidence: string | undefined): [number, number] | null {
  if (!evidence) return null;
  const at = SOURCE.indexOf(evidence);
  if (at < 0) return null;
  const start = SOURCE.slice(0, at).split(' ').length - 1;
  const len = evidence.trim().split(' ').length;
  return [start, start + len];
}

export function faithfulness(labels: Label[]): number | null {
  return labels.length ? labels.filter((l) => l === 'SUPPORTED').length / labels.length : null;
}

export type Stage = 'intro' | 'split' | 'check' | 'stamp' | 'recap';

export interface Frame extends BaseFrame {
  stage: Stage;
  /** whether the answer has been split into claims yet */
  split: boolean;
  /** claim being checked (null when none) */
  active: number | null;
  /** labels revealed so far, in claim order */
  stamped: Label[];
  /** evidence span highlighted in the source */
  span: [number, number] | null;
  spanLabel: Label | null;
}

const pretty = (l: Label) => (l === 'NOT_FOUND' ? 'NOT FOUND' : l);
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export function simulate({ scenario }: Params): Frame[] {
  const s = SCENARIOS[scenario] ?? SCENARIOS.faithful;
  const frames: Frame[] = [];
  const base = { span: null, spanLabel: null } as const;

  frames.push({
    stage: 'intro',
    split: false,
    active: null,
    stamped: [],
    ...base,
    caption: `Question: "${s.question}" The assistant answered from the source passage above. A groundedness check never asks "does this sound right?", only "does the SOURCE say this?".`,
    predict: 'How many separate facts does this answer assert? Each one must be checked on its own.',
  });

  frames.push({
    stage: 'split',
    split: true,
    active: null,
    stamped: [],
    ...base,
    caption: `Decompose: ${s.claims.length} atomic, self-contained claims (pronouns resolved, one fact each). Scoring the whole answer at once would let one bad fact hide among good ones.`,
  });

  const stamped: Label[] = [];
  s.claims.forEach((c, i) => {
    frames.push({
      stage: 'check',
      split: true,
      active: i,
      stamped: [...stamped],
      ...base,
      caption: `Claim ${i + 1}/${s.claims.length}: "${c.text}" Search the source for a span that entails it, or one that says otherwise.`,
      predict: 'SUPPORTED, CONTRADICTED or NOT FOUND? Decide before you reveal.',
    });
    stamped.push(c.label);
    const span = spanWords(c.evidence);
    const f = faithfulness(stamped);
    frames.push({
      stage: 'stamp',
      split: true,
      active: i,
      stamped: [...stamped],
      span,
      spanLabel: span ? c.label : null,
      caption: `${pretty(c.label)}${c.evidence ? ` (evidence: "${c.evidence}")` : ' (no span in the source)'}: ${c.note} Running faithfulness ${stamped.filter((l) => l === 'SUPPORTED').length}/${stamped.length} = ${pct(f)}.`,
    });
  });

  const final = faithfulness(stamped);
  const bad = s.claims.filter((c) => c.label !== 'SUPPORTED');
  const contradicted = bad.some((c) => c.label === 'CONTRADICTED');
  frames.push({
    stage: 'recap',
    split: true,
    active: null,
    stamped: [...stamped],
    ...base,
    caption: `Faithfulness = supported ÷ claims = ${stamped.filter((l) => l === 'SUPPORTED').length}/${stamped.length} = ${pct(final)}. ${
      !bad.length
        ? 'Every claim has evidence: show the answer, with the spans as citations.'
        : contradicted
          ? 'A contradiction is the costliest error: block the answer or regenerate it, rather than just flagging it.'
          : 'Strip or flag the unsupported claim (or regenerate with it removed); the rest of the answer is verifiable.'
    } Keep the per-claim stamps: they are what you highlight, fix and log.`,
  });
  return frames;
}
