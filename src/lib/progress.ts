import { useSyncExternalStore } from 'react';
import { mergeEarned, type EarnedNow, type StoredAchievement } from '../content/achievements';

export type Rating = 'nailed' | 'partial' | 'missed';

export interface TestRecord {
  best: number;
  last: number;
  attempts: number;
  passedAt?: string;
  /** most recent full-length attempts, oldest first (max 10) */
  history?: { at: string; score: number }[];
}

/** per-question outcome across every attempt (full exams and practice drills) */
export interface McqRecord {
  seen: number;
  wrong: number;
  lastCorrect: boolean;
  lastAt: string;
}

/** one Prompt Lab's state (src/components/PromptLab.tsx) */
export interface PromptLabRecord {
  /** the learner's current prompt (autosaved) */
  system: string;
  user: string;
  /** best offline score so far, 0..100 */
  best: number;
  /** first time the score reached the lab's pass score (solved) */
  solvedAt?: string;
  /** when the model answer was first revealed */
  revealedAt?: string;
}

export interface Settings {
  passMark: number;
  secondsPerQuestion: number;
  shuffle: boolean;
  theme: 'system' | 'light' | 'dark';
  mockMinutes: number;
  /** study-first lock: which practice unlocks only after every Learn section is marked read */
  studyLock: 'off' | 'exam' | 'exam-interview';
  /** UI signal colour (optional; unknown or older saved values fall back to vermilion) */
  accent?: Accent;
}

export type Accent = 'vermilion' | 'pine' | 'ink' | 'plum';

export interface Progress {
  tests: Record<string, TestRecord>;
  sections: Record<string, number[]>;
  iq: Record<string, Rating>;
  boe: Record<string, true>;
  cc: Record<string, true>;
  drafts: Record<string, string>;
  company: Record<string, true>;
  mcq: Record<string, McqRecord>;
  /** applied one-off data migrations */
  migrations?: string[];
  /** local dates (YYYY-MM-DD) with any study activity, oldest first (max 120), for the study streak */
  activityDays?: string[];
  /**
   * earned badges (src/content/achievements.ts). Optional and backward-compatible: a save made before
   * achievements existed has no key at all (undefined), which tells the detector to backfill what that
   * progress already earned quietly instead of celebrating it as new (see useAchievements.ts).
   */
  achievements?: Record<string, StoredAchievement>;
  /** Prompt Lab drafts and scores by lab id. Optional: saves from before Prompt Lab load without it. */
  promptLabs?: Record<string, PromptLabRecord>;
  settings: Settings;
}

const KEY = 'genai-progress-v1';

const DEFAULT: Progress = {
  tests: {},
  sections: {},
  iq: {},
  boe: {},
  cc: {},
  drafts: {},
  company: {},
  mcq: {},
  achievements: {},
  promptLabs: {},
  // fresh progress already matches current content, so no migration applies
  migrations: ['fund-estimation-toolkit', 'prompt-engineering-split'],
  settings: { passMark: 70, secondsPerQuestion: 90, shuffle: true, theme: 'system', mockMinutes: 45, studyLock: 'exam' },
};

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    // migrations are judged from what was saved, not from the defaults merged in
    // `achievements` stays undefined for saves from before badges existed (no default merged in)
    return migrate(
      { ...DEFAULT, ...parsed, achievements: parsed.achievements, settings: { ...DEFAULT.settings, ...parsed.settings } },
      parsed.migrations ?? [],
    );
  } catch {
    return DEFAULT;
  }
}

// One-off content migrations for data keyed by section index.
function migrate(p: Progress, applied: string[]): Progress {
  const done = new Set(applied);
  // fund-estimation gained a new section at index 1 ("Estimation arithmetic toolkit")
  if (!done.has('fund-estimation-toolkit')) {
    const read = p.sections['fund-estimation'];
    if (read) p = { ...p, sections: { ...p.sections, 'fund-estimation': read.map((i) => (i >= 1 ? i + 1 : i)) } };
    done.add('fund-estimation-toolkit');
  }
  // prompt-engineering was split into three topics: its old section 0 (basics) moved to prompt-fundamentals /
  // prompt-reasoning and old section 1 (templates) became section 0. Drop old-index-0 state and shift 1 → 0 for
  // read flags, quick-check picks (qc:…-s<i>-qc), exercise drafts (ex:…-s<i>-ex) and exercise done flags (cc).
  if (!done.has('prompt-engineering-split')) {
    const T = 'prompt-engineering';
    const read = p.sections[T];
    const sections = read ? { ...p.sections, [T]: read.filter((i) => i === 1).map(() => 0) } : p.sections;
    const remap = <V>(rec: Record<string, V>, prefix: string, suffix: string): Record<string, V> => {
      const out: Record<string, V> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (k === `${prefix}0${suffix}`) continue;
        out[k === `${prefix}1${suffix}` ? `${prefix}0${suffix}` : k] = v;
      }
      return out;
    };
    const drafts = remap(remap(p.drafts, `qc:${T}-s`, '-qc'), `ex:${T}-s`, '-ex');
    const cc = remap(p.cc, `${T}-s`, '-ex');
    p = { ...p, sections, drafts, cc };
    done.add('prompt-engineering-split');
  }
  return { ...p, migrations: [...done] };
}

let state: Progress = load();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, () => state);
}

export function getProgress(): Progress {
  return state;
}

/** today's local date as YYYY-MM-DD */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function withActivity(p: Progress): Progress {
  const today = localDay();
  const days = p.activityDays ?? [];
  if (days[days.length - 1] === today) return p;
  return { ...p, activityDays: [...days.filter((d) => d !== today), today].slice(-120) };
}

/** Apply a change. Study actions (activity = true) also record today for the study streak. */
export function update(fn: (p: Progress) => Progress, activity = true) {
  state = fn(state);
  if (activity) state = withActivity(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked — keep in-memory state
  }
  listeners.forEach((l) => l());
}

export function recordTest(topicId: string, score: number) {
  update((p) => {
    const prev = p.tests[topicId];
    const passed = score >= p.settings.passMark;
    const rec: TestRecord = {
      best: Math.max(prev?.best ?? 0, score),
      last: score,
      attempts: (prev?.attempts ?? 0) + 1,
      passedAt: prev?.passedAt ?? (passed ? new Date().toISOString() : undefined),
      history: [...(prev?.history ?? []), { at: new Date().toISOString(), score }].slice(-10),
    };
    return { ...p, tests: { ...p.tests, [topicId]: rec } };
  });
}

export function recordAnswers(results: { id: string; correct: boolean }[]) {
  const at = new Date().toISOString();
  update((p) => {
    const mcq = { ...p.mcq };
    for (const r of results) {
      const prev = mcq[r.id];
      mcq[r.id] = {
        seen: (prev?.seen ?? 0) + 1,
        wrong: (prev?.wrong ?? 0) + (r.correct ? 0 : 1),
        lastCorrect: r.correct,
        lastAt: at,
      };
    }
    return { ...p, mcq };
  });
}

export function toggleSectionRead(topicId: string, index: number) {
  update((p) => {
    const cur = new Set(p.sections[topicId] ?? []);
    if (cur.has(index)) cur.delete(index);
    else cur.add(index);
    return { ...p, sections: { ...p.sections, [topicId]: [...cur].sort((a, b) => a - b) } };
  });
}

export function markAllSectionsRead(topicId: string, count: number) {
  update((p) => ({ ...p, sections: { ...p.sections, [topicId]: Array.from({ length: count }, (_, i) => i) } }));
}

export function setFlag(bucket: 'boe' | 'cc' | 'company', id: string, on: boolean) {
  update((p) => {
    const next = { ...p[bucket] };
    if (on) next[id] = true;
    else delete next[id];
    return { ...p, [bucket]: next };
  });
}

export function rateIQ(id: string, r: Rating | null) {
  update((p) => {
    const next = { ...p.iq };
    if (r) next[id] = r;
    else delete next[id];
    return { ...p, iq: next };
  });
}

export function setDraft(id: string, text: string) {
  update((p) => ({ ...p, drafts: { ...p.drafts, [id]: text } }));
}

const emptyLab: PromptLabRecord = { system: '', user: '', best: 0 };

/** Autosave a Prompt Lab draft (does not touch the score). */
export function setPromptDraft(id: string, draft: { system: string; user: string }) {
  update((p) => {
    const prev = p.promptLabs?.[id] ?? emptyLab;
    return { ...p, promptLabs: { ...p.promptLabs, [id]: { ...prev, system: draft.system, user: draft.user } } };
  });
}

/**
 * Record a graded score: keeps the best, and stamps `solvedAt` the first time it reaches `passScore`.
 * Returns true when this call solved the lab for the first time. No-op (no write) when nothing changes.
 */
export function recordPromptScore(id: string, score: number, passScore: number): boolean {
  const prev = state.promptLabs?.[id];
  // only a lab the learner has edited (a draft exists) records scores: opening the tab is not study activity
  if (!prev) return false;
  const firstSolve = !prev.solvedAt && score >= passScore;
  if (score <= prev.best && !firstSolve) return false;
  update((p) => {
    const cur = p.promptLabs?.[id] ?? emptyLab;
    const next: PromptLabRecord = { ...cur, best: Math.max(cur.best, score), solvedAt: cur.solvedAt ?? (firstSolve ? new Date().toISOString() : undefined) };
    return { ...p, promptLabs: { ...p.promptLabs, [id]: next } };
  });
  return firstSolve;
}

/** Remember that the model answer was revealed; `draft` seeds the record when the lab was never edited. */
export function markPromptRevealed(id: string, draft: { system: string; user: string }) {
  if (state.promptLabs?.[id]?.revealedAt) return;
  update((p) => {
    const cur = p.promptLabs?.[id] ?? { ...emptyLab, ...draft };
    return { ...p, promptLabs: { ...p.promptLabs, [id]: { ...cur, revealedAt: new Date().toISOString() } } };
  });
}

export function isPromptLabSolved(p: Progress, id: string): boolean {
  return !!p.promptLabs?.[id]?.solvedAt;
}

export function setSettings(s: Partial<Settings>) {
  update((p) => ({ ...p, settings: { ...p.settings, ...s } }), false);
}

export function resetProgress() {
  update((p) => ({ ...DEFAULT, settings: p.settings }), false);
}

/** Store newly earned badges / tier-ups (never a study action, never downgrades). */
export function earnAchievements(earned: EarnedNow[], at = Date.now()) {
  if (!earned.length) return;
  update((p) => ({ ...p, achievements: mergeEarned(p.achievements, earned, at) }), false);
}

/**
 * First evaluation of a save made before achievements existed: store what that progress already
 * earned, always writing the map (even empty) so the next unlock is celebrated normally.
 */
export function backfillAchievements(earned: EarnedNow[], at = Date.now()) {
  update((p) => ({ ...p, achievements: mergeEarned(p.achievements ?? {}, earned, at) }), false);
}

export function isPassed(p: Progress, topicId: string) {
  return !!p.tests[topicId]?.passedAt;
}
