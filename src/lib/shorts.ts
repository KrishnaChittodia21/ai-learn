// Shorts (M5): pure logic, no React and no content imports, so tests and scripts/validate-content.mjs use it too.
// The catalog itself is built from the topics in src/lib/useShorts.ts.
import { localDay, type Progress } from './progress.ts';
import type { Short, ShortBeat, TopicMeta } from '../types.ts';

export interface ShortEntry {
  short: Short;
  topic: TopicMeta;
  /** index of the section the Short hangs on (the end card links to it) */
  section: number;
}

/** Every Short in course order (topics are already sorted by phase and order). Shorts unlock in this order. */
export const shortsFrom = (topics: TopicMeta[]): ShortEntry[] =>
  topics.flatMap((topic) => topic.sections.flatMap((s, section) => (s.short ? [{ short: s.short, topic, section }] : [])));

// ---------- timing ----------
export const SPEEDS = [1, 1.25, 0.75] as const;
export type Speed = (typeof SPEEDS)[number];

function beatWords(b: ShortBeat): string[] {
  switch (b.type) {
    case 'counter':
      return [b.unit];
    case 'race':
      return b.lanes.map((l) => l.label);
    case 'grid':
      return [b.caption];
    case 'ladder':
      return b.rungs.map((r) => `${r.label} ${r.amount}`);
    case 'toggles':
      return b.items.map((i) => i.label);
    case 'flow':
      return b.steps;
    case 'tokens':
      return [b.prompt, ...b.picks.map((x) => x.token)];
    case 'retrieve':
      return [b.query, ...b.chunks.map((c) => c.text)];
    case 'claims':
      return b.claims.map((c) => `${c.text} ${c.note ?? ''}`);
    default:
      return [];
  }
}

const wordsIn = (b: ShortBeat) =>
  [b.kicker, b.head, b.sub, ...(b.stats ?? []).map((s) => `${s.value} ${s.label}`), ...beatWords(b)]
    .join(' ')
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;

/** How long a beat stays up at 1×, in ms: time for its animation plus ~3 words a second of reading. A quiz waits. */
export function beatMs(b: ShortBeat): number {
  if (b.type === 'quiz') return Infinity;
  if (b.seconds) return b.seconds * 1000;
  return Math.max(5200, 3500 + wordsIn(b) * 330);
}

/** "1:35": the whole Short at 1×, counting the quiz as 15 s and the end card as 6 s */
export function shortLength(s: Short): string {
  const ms = s.beats.reduce((a, b) => a + (b.type === 'quiz' ? 15_000 : beatMs(b)), 0) + 6000;
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ---------- the player as a pure state machine (ShortPlayer.tsx drives it with requestAnimationFrame) ----------
export interface PlayerState {
  /** beat index; beats.length is the end card */
  cur: number;
  /** ms played in the current beat, at the current speed */
  elapsed: number;
  /** toggled with Space / the pause button */
  paused: boolean;
  /** a long press holds the beat until released */
  held: boolean;
  speed: Speed;
  /** quiz beats answered right */
  solved: number[];
  /** bumps whenever a beat (re)starts, so its animations replay */
  run: number;
}

export type PlayerAction =
  | { type: 'tick'; dt: number }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'pause'; on?: boolean }
  | { type: 'hold'; on: boolean }
  | { type: 'speed' }
  | { type: 'solve' }
  | { type: 'replay' };

export const PLAYER_START: PlayerState = { cur: 0, elapsed: 0, paused: false, held: false, speed: 1, solved: [], run: 0 };

/** an unanswered quiz blocks Next (and the clock) until it is solved */
export const quizBlocks = (beats: ShortBeat[], s: PlayerState) => beats[s.cur]?.type === 'quiz' && !s.solved.includes(s.cur);

export function playerStep(beats: ShortBeat[], s: PlayerState, a: PlayerAction): PlayerState {
  const end = beats.length;
  const beat = beats[s.cur];
  const go = (i: number): PlayerState => ({ ...s, cur: i, elapsed: 0, run: s.run + 1 });
  switch (a.type) {
    case 'tick': {
      if (s.paused || s.held || !beat || beat.type === 'quiz') return s;
      const elapsed = s.elapsed + a.dt;
      return elapsed >= beatMs(beat) / s.speed ? go(s.cur + 1) : { ...s, elapsed };
    }
    case 'next':
      return quizBlocks(beats, s) || s.cur >= end ? s : { ...go(s.cur + 1), paused: false };
    // Back plays the previous beat from its start, already playing
    case 'back':
      return s.cur === 0 ? s : { ...go(s.cur - 1), paused: false };
    case 'pause':
      return { ...s, paused: a.on ?? !s.paused };
    case 'hold':
      return s.held === a.on ? s : { ...s, held: a.on };
    case 'speed': {
      // keep the same point in the beat: the fraction played stays put
      const speed = SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length];
      return { ...s, speed, elapsed: (s.elapsed * s.speed) / speed };
    }
    case 'solve':
      return beat?.type !== 'quiz' || s.solved.includes(s.cur) ? s : { ...s, solved: [...s.solved, s.cur] };
    case 'replay':
      return { ...go(0), paused: false };
  }
}

/** how full beat i's progress bar is (the last bar is the end card) */
export function barFill(beats: ShortBeat[], s: PlayerState, i: number): number {
  if (i < s.cur) return 1;
  if (i > s.cur) return 0;
  const beat = beats[i];
  if (!beat) return 1;
  if (beat.type === 'quiz') return s.solved.includes(i) ? 1 : 0;
  return Math.min(1, (s.elapsed * s.speed) / beatMs(beat));
}

// ---------- Short of the day and daily unlocks ----------
type Watched = Progress['shorts'];
const seenAt = (w: Watched, e: ShortEntry) => w?.[e.short.id]?.watchedAt;
const dayNum = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

/**
 * Today's Short, the same all day: one watched today stays up (ticked) so the card doesn't change the moment it
 * ends; otherwise the first unwatched Short from a date-picked start, wrapping round; when every Short is watched,
 * the date-picked one itself.
 */
export function shortOfTheDay(all: ShortEntry[], watched: Watched, today: string): { entry: ShortEntry; watched: boolean } | null {
  if (!all.length) return null;
  const todays = all.filter((e) => seenAt(watched, e) && localDay(new Date(seenAt(watched, e)!)) === today).sort((a, b) => seenAt(watched, a)!.localeCompare(seenAt(watched, b)!));
  if (todays.length) return { entry: todays[0], watched: true };
  const start = ((dayNum(today) % all.length) + all.length) % all.length;
  const order = [...all.slice(start), ...all.slice(0, start)];
  const next = order.find((e) => !seenAt(watched, e));
  return next ? { entry: next, watched: false } : { entry: order[0], watched: true };
}

/** local days with any study activity */
export const studyDays = (p: Pick<Progress, 'activityDays'>) => new Set(p.activityDays ?? []).size;

/**
 * The Shorts this learner can open: one per study day, in course order, plus the Short of the day (always open)
 * and anything already watched.
 */
export function unlockedShorts(all: ShortEntry[], p: Pick<Progress, 'activityDays' | 'shorts'>, today: string): Set<string> {
  const open = new Set(all.slice(0, studyDays(p)).map((e) => e.short.id));
  const sotd = shortOfTheDay(all, p.shorts, today);
  if (sotd) open.add(sotd.entry.short.id);
  for (const e of all) if (seenAt(p.shorts, e)) open.add(e.short.id);
  return open;
}

/** the Short unlocked by studying today (shown as NEW until watched), if today counts */
export function unlockedToday(all: ShortEntry[], p: Pick<Progress, 'activityDays'>, today: string): ShortEntry | undefined {
  return p.activityDays?.includes(today) ? all[studyDays(p) - 1] : undefined;
}

// ---------- content check (scripts/validate-content.mjs; tests/shorts.test.ts) ----------
export const BEAT_TYPES = ['counter', 'spike', 'race', 'grid', 'ladder', 'toggles', 'flow', 'quiz', 'tokens', 'retrieve', 'claims'] as const;
const TONES = ['violet', 'pink', 'ion', 'solar', 'good'];
const num = (n: unknown, lo = -Infinity, hi = Infinity): n is number => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
const int = (n: unknown, lo: number, hi: number) => Number.isInteger(n) && num(n, lo, hi);
const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

/** Problems with one Short (empty when fine). `seen` collects ids so duplicates across the course are caught. */
export function checkShort(sh: Short, where: string, seen = new Set<string>()): string[] {
  const e: string[] = [];
  const at = `${where} short "${sh?.id}"`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sh?.id ?? '')) e.push(`${where}: short id must be kebab-case`);
  else if (seen.has(sh.id)) e.push(`${at}: duplicate short id`);
  else seen.add(sh.id);
  if (!text(sh?.title)) e.push(`${at}: no title`);
  if (!text(sh?.takeaway?.head) || !text(sh?.takeaway?.sub)) e.push(`${at}: needs a takeaway (head and sub)`);
  const beats: ShortBeat[] = Array.isArray(sh?.beats) ? sh.beats : [];
  if (beats.length < 5 || beats.length > 12) e.push(`${at}: ${beats.length} beats (needs 5–12)`);
  for (const [j, raw] of beats.entries()) {
    const b = raw as ShortBeat & Record<string, unknown>;
    const bw = `${at} beat ${j + 1}`;
    if (!(BEAT_TYPES as readonly string[]).includes(b?.type)) {
      e.push(`${bw}: unknown type "${b?.type}"`);
      continue;
    }
    if (!text(b.kicker)) e.push(`${bw}: no kicker`);
    if (b.type !== 'counter' && !text(b.head)) e.push(`${bw}: no head`);
    for (const s of b.stats ?? []) if (!(text(s.label) && (num(s.value) || text(s.value)))) e.push(`${bw}: every stat needs a value and a label`);
    if (b.seconds !== undefined && !num(b.seconds, 2, 30)) e.push(`${bw}: seconds must be 2–30`);
    switch (b.type) {
      case 'counter':
        if (!num(b.value) || !text(b.unit)) e.push(`${bw}: counter needs a number value and a unit`);
        break;
      case 'spike':
        if (!text(b.mark)) e.push(`${bw}: spike needs a mark`);
        break;
      case 'race':
        if (!(b.lanes?.length >= 2 && b.lanes.length <= 4 && b.lanes.every((l) => text(l.label) && num(l.seconds, 0.2, 20) && TONES.includes(l.tone))))
          e.push(`${bw}: race needs 2–4 lanes with a label, seconds 0.2–20 and a tone`);
        break;
      case 'grid':
        if (!(int(b.cells, 1, 60) && text(b.caption) && (b.hot === undefined || int(b.hot, 0, b.cells)))) e.push(`${bw}: grid needs cells 1–60, hot within them, and a caption`);
        break;
      case 'ladder':
        if (!(b.rungs?.length >= 2 && b.rungs.length <= 5 && b.rungs.every((r) => text(r.label) && num(r.amount, 0)) && text(b.unit))) e.push(`${bw}: ladder needs 2–5 rungs with a label and an amount, and a unit`);
        break;
      case 'toggles':
        if (!(b.items?.length >= 2 && b.items.length <= 6 && b.items.every((x) => text(x.label)) && b.items.some((x) => !x.keep))) e.push(`${bw}: toggles needs 2–6 items and something to switch off`);
        if (b.keepLabel !== undefined && !(text(b.keepLabel) && b.keepLabel.length <= 12)) e.push(`${bw}: keepLabel must be 1–12 characters`);
        break;
      case 'flow':
        if (!(b.steps?.length >= 2 && b.steps.length <= 6 && b.steps.every(text) && (b.broken === undefined || int(b.broken, 0, b.steps.length - 1)))) e.push(`${bw}: flow needs 2–6 steps and broken inside them`);
        break;
      case 'tokens':
        if (!(text(b.prompt) && b.prompt.length <= 140 && b.picks?.length >= 2 && b.picks.length <= 5 && b.picks.every((x) => text(x.token) && num(x.p, 0.001, 1))))
          e.push(`${bw}: tokens needs a prompt (≤ 140 chars) and 2–5 picks with p in (0, 1]`);
        else if (b.picks.reduce((t, x) => t + x.p, 0) > 1.0001 || b.picks.some((x) => x.p > b.picks[0].p)) e.push(`${bw}: token picks must sum to ≤ 1 and the first must be the most likely`);
        break;
      case 'retrieve':
        if (!(text(b.query) && b.chunks?.length >= 2 && b.chunks.length <= 5 && b.chunks.every((c) => text(c.text) && num(c.score, 0, 1)) && int(b.k, 1, b.chunks.length - 1)))
          e.push(`${bw}: retrieve needs a query, 2–5 chunks scored 0–1 and k below the chunk count`);
        break;
      case 'claims':
        if (!(b.claims?.length >= 2 && b.claims.length <= 5 && b.claims.every((c) => text(c.text) && typeof c.ok === 'boolean'))) e.push(`${bw}: claims needs 2–5 claims, each with text and ok`);
        break;
      case 'quiz':
        if (!(b.options?.length >= 2 && b.options.length <= 4)) e.push(`${bw}: quiz needs 2–4 options`);
        if (!int(b.answer, 0, (b.options?.length ?? 0) - 1)) e.push(`${bw}: quiz answer index out of range`);
        if (b.options?.some((o) => !text(o.text) || !text(o.why))) e.push(`${bw}: every quiz option needs text and why`);
        break;
    }
  }
  if (beats.filter((b) => b?.type === 'quiz').length !== 1) e.push(`${at}: needs exactly one quiz beat`);
  if (beats[0]?.type === 'quiz') e.push(`${at}: cannot open with the quiz`);
  // a Short is a story with real numbers in it (the quiz's answer index does not count)
  if (!/\d/.test(JSON.stringify(beats, (k, v) => (k === 'answer' ? undefined : v)))) e.push(`${at}: no numbers in any beat`);
  return e;
}
