// Shared test helpers. src/content/index.ts uses Vite's import.meta.glob, so tests load the topic files
// directly (like scripts/validate-*.mjs) and sort them the same way.
import { readdirSync } from 'node:fs';
import { PHASES } from '../src/content/phases.ts';
import type { Progress } from '../src/lib/progress.ts';
import type { Topic } from '../src/types.ts';

const topicDir = new URL('../src/content/topics/', import.meta.url);
const phaseIndex = (id: string) => PHASES.findIndex((p) => p.id === id);

export const TOPICS: Topic[] = (
  await Promise.all(readdirSync(topicDir).filter((f) => f.endsWith('.ts')).map(async (f) => (await import(new URL(f, topicDir).href)).default as Topic))
).sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase) || a.order - b.order);

export const LEVEL_OF_TOPIC = new Map(TOPICS.map((t) => [t.id, PHASES.find((ph) => ph.id === t.phase)?.level]));

/** a blank progress record (what the app's DEFAULT holds, minus migrations/achievements) */
export const emptyProgress = (over: Partial<Progress> = {}): Progress => ({
  tests: {},
  sections: {},
  iq: {},
  boe: {},
  cc: {},
  drafts: {},
  company: {},
  mcq: {},
  settings: { passMark: 70, secondsPerQuestion: 90, shuffle: true, theme: 'system', mockMinutes: 45, studyLock: 'exam' },
  ...over,
});

/** a passed exam record */
export const passedTest = (best = 90) => ({ best, last: best, attempts: 1, passedAt: '2026-01-01T00:00:00.000Z' });
