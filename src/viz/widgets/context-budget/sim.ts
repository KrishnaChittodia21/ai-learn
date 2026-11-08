// Pure, deterministic context-window budget (no React, Node-testable).
// Uses the Context Engineering lesson's support copilot: 40 tools (11K), 30-turn history (38K), 25 chunks (36K) and
// raw CRM JSON (7K) = 92K, plus small pinned system rules and the question. The output reserve comes off the window
// first ("never let input eat it"). While the input is over budget, trims are applied least-loss first, using the
// lesson's fixes: project CRM JSON to 8 fields (0.4K), route to the 6 relevant tools (2K), last 4 turns + a
// 300-token summary (3K), reranked top 6 chunks (4.5K). Two harder cuts follow for tiny windows. Pinned slots
// (system rules, question) are never trimmed. Layout order: stable (cacheable) first, question last.
import type { BaseFrame } from '../../core';
import type { FrameTurn as Turn } from '../_shared/yourTurn.ts';

export type SlotId = 'system' | 'tools' | 'docs' | 'history' | 'toolResults' | 'question';

export interface Params {
  /** context window in K tokens */
  windowK: number;
  /** output reserve (max_tokens) in K tokens */
  reserveK: number;
}

export const WINDOWS_K = [16, 32, 64, 128];
export const DEFAULT_PARAMS: Params = { windowK: 32, reserveK: 4 };
export const MIN_RESERVE_K = 2;
export const MAX_RESERVE_K = 8;

export interface Slot {
  id: SlotId;
  label: string;
  tokensK: number;
  pinned: boolean;
  /** what has been done to this slot so far */
  note: string;
  trimmed: boolean;
}

/** layout order, top → bottom: stable before volatile, question last */
export const LAYOUT: { id: SlotId; label: string; rawK: number; pinned: boolean; rawNote: string }[] = [
  { id: 'system', label: 'System rules', rawK: 0.8, pinned: true, rawNote: 'stable, cached' },
  { id: 'tools', label: 'Tool definitions', rawK: 11, pinned: false, rawNote: '40 tools' },
  { id: 'docs', label: 'Retrieved docs', rawK: 36, pinned: false, rawNote: '25 chunks' },
  { id: 'history', label: 'History', rawK: 38, pinned: false, rawNote: '30 turns, verbatim' },
  { id: 'toolResults', label: 'Tool results', rawK: 7, pinned: false, rawNote: 'raw CRM JSON' },
  { id: 'question', label: 'Question + format', rawK: 0.3, pinned: true, rawNote: 'last, near generation' },
];

/** trims in the order they are tried: least information lost first */
export const TRIMS: { slot: SlotId; toK: number; note: string; how: string }[] = [
  { slot: 'toolResults', toK: 0.4, note: 'projected to 8 fields', how: 'project the CRM JSON to the 8 fields the task needs' },
  { slot: 'tools', toK: 2, note: '6 routed tools', how: 'route to the 6 tools this step needs' },
  { slot: 'history', toK: 3, note: 'last 4 turns + summary', how: 'summarise older turns (compaction): last 4 turns verbatim + a 300-token summary' },
  { slot: 'docs', toK: 4.5, note: 'reranked top 6', how: 'rerank and keep the top 6 chunks, best first' },
  { slot: 'docs', toK: 2.25, note: 'top 3 only', how: 'keep only the top 3 chunks (risk: a needed fact drops out)' },
  { slot: 'history', toK: 0.3, note: 'summary only', how: 'keep only the summary of the conversation (risk: recent detail lost)' },
];

export type Stage = 'intro' | 'reserve' | 'trim' | 'fits' | 'overflow' | 'layout';

export interface Frame extends BaseFrame {
  stage: Stage;
  slots: Slot[];
  reserveK: number;
  windowK: number;
  /** window − reserve */
  budgetK: number;
  inputK: number;
  /** slot changed on this frame */
  focus: SlotId | null;
  trimsApplied: number;
  fits: boolean;
  yourTurn?: Turn;
}

const r1 = (x: number) => Math.round(x * 100) / 100;

export function simulate(params: Params): Frame[] {
  const windowK = params.windowK;
  const reserveK = Math.max(MIN_RESERVE_K, Math.min(MAX_RESERVE_K, params.reserveK));
  const budgetK = windowK - reserveK;
  const slots: Slot[] = LAYOUT.map((s) => ({ id: s.id, label: s.label, tokensK: s.rawK, pinned: s.pinned, note: s.rawNote, trimmed: false }));
  const inputK = () => r1(slots.reduce((a, s) => a + s.tokensK, 0));
  const rawK = inputK();
  const frames: Frame[] = [];
  let trimsApplied = 0;
  let shownReserve = 0;
  const push = (f: Pick<Frame, 'stage' | 'caption'> & { focus?: SlotId | null; yourTurn?: Turn }) =>
    frames.push({
      focus: null,
      ...f,
      slots: slots.map((s) => ({ ...s })),
      reserveK: shownReserve,
      windowK,
      budgetK,
      inputK: inputK(),
      trimsApplied,
      fits: inputK() <= budgetK,
    });

  push({
    stage: 'intro',
    caption: `A support copilot wants to send ${rawK}K tokens: 40 tools (11K), the full 30-turn history (38K), 25 retrieved chunks (36K), raw CRM JSON (7K), plus system rules and the question. The window is ${windowK}K.`,
  });
  shownReserve = reserveK;
  const over = rawK > budgetK;
  push({
    stage: 'reserve',
    caption: `First reserve ${reserveK}K for the output (max_tokens), so the input can never eat it. Input budget = ${windowK}K − ${reserveK}K = ${budgetK}K. ${over ? `The raw input is ${r1(rawK - budgetK)}K over.` : 'The raw input already fits.'}`,
    yourTurn: over
      ? {
          question: `The input is ${r1(rawK - budgetK)}K over budget. What do you cut first?`,
          options: [
            { text: 'Project the raw CRM JSON to the fields needed', correct: true, why: 'Least-loss first: 7K of JSON shrinks to 0.4K and the answer still has every field it uses.' },
            { text: 'Shorten the system rules', correct: false, why: 'System rules are pinned: small, stable and cached. Trimming them saves little and breaks behaviour and the cache prefix.' },
            { text: 'Cut the output reserve to make room', correct: false, why: 'Then the answer gets truncated. The reserve comes off the window first and input never eats it.' },
          ],
        }
      : {
          question: `${rawK}K fits in the ${budgetK}K budget. Ship it as is?`,
          options: [
            { text: 'No: trim anyway', correct: true, why: 'In the lesson, sending 92K gave 71% accuracy and 4.1 s TTFT; the trimmed ~11K version scored 83% at 1.2 s. More context is not better (context rot, lost in the middle).' },
            { text: 'Yes: it fits, so more context is better', correct: false, why: 'Recall falls as the window fills and facts in the middle get lost; cost and latency grow with every token.' },
          ],
        },
  });

  for (const t of TRIMS) {
    if (inputK() <= budgetK) break;
    const s = slots.find((x) => x.id === t.slot)!;
    const before = s.tokensK;
    s.tokensK = t.toK;
    s.note = t.note;
    s.trimmed = true;
    trimsApplied++;
    const now = inputK();
    push({
      stage: 'trim',
      focus: t.slot,
      caption: `Over budget, so ${t.how}: ${s.label} ${before}K → ${t.toK}K. Input is now ${now}K of ${budgetK}K${now <= budgetK ? ': it fits.' : `, still ${r1(now - budgetK)}K over.`}`,
    });
  }

  if (inputK() <= budgetK) {
    push({
      stage: 'fits',
      caption: `Fits: ${inputK()}K of input + ${reserveK}K reserve in a ${windowK}K window, ${r1(budgetK - inputK())}K spare. ${trimsApplied ? `${trimsApplied} trim${trimsApplied === 1 ? '' : 's'} applied; pinned rules and the question were never touched.` : 'Nothing had to be trimmed to fit, but the lesson trims anyway for accuracy, latency and cost.'}`,
    });
  } else {
    push({
      stage: 'overflow',
      caption: `Still ${r1(inputK() - budgetK)}K over after every trim. Pinned content plus the reserve does not fit a ${windowK}K window: use a bigger window or a smaller reserve.`,
    });
  }

  push({
    stage: 'layout',
    caption: `Final layout, top to bottom: system rules and tools first (stable, so the prompt cache can reuse the prefix), then docs (best chunk first), history and tool results, and the question last, closest to generation. Then the ${reserveK}K output reserve.`,
  });
  return frames;
}
