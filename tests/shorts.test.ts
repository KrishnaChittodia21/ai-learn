// Shorts (M5): the player reducer (timing, Back, pause, hold, speed, quiz blocks Next), the content check, the
// Short-of-the-day pick and the daily unlock — against the shipped Shorts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barFill, beatMs, checkShort, PLAYER_START, playerStep, shortOfTheDay, shortsFrom, studyDays, unlockedShorts, unlockedToday, type PlayerAction, type PlayerState } from '../src/lib/shorts.ts';
import type { Short, ShortBeat } from '../src/types.ts';
import { TOPICS } from './helpers.ts';

const ALL = shortsFrom(TOPICS);
const short = ALL.find((e) => e.short.id === 'rag-in-90-seconds')!.short;
const beats = short.beats;
const quizAt = beats.findIndex((b) => b.type === 'quiz');
const run = (actions: PlayerAction[], s: PlayerState = PLAYER_START) => actions.reduce((st, a) => playerStep(beats, st, a), s);
const until = (i: number) => run(Array.from({ length: i }, () => ({ type: 'next' }) as const));

test('the catalog: 15 Shorts (12 + 3 tier-3 concepts), in course order, all valid', () => {
  assert.equal(ALL.length, 15);
  const seen = new Set<string>();
  for (const e of ALL) assert.deepEqual(checkShort(e.short, e.topic.id, seen), [], e.short.id);
  const pos = (id: string) => TOPICS.findIndex((t) => t.id === id);
  for (let i = 1; i < ALL.length; i++) assert.ok(pos(ALL[i - 1].topic.id) <= pos(ALL[i].topic.id), 'course order');
});

test('player: a beat advances after its reading time, scaled by speed', () => {
  const ms = beatMs(beats[0]);
  assert.ok(ms >= 5200 && Number.isFinite(ms));
  assert.equal(run([{ type: 'tick', dt: ms - 1 }]).cur, 0);
  const s = run([{ type: 'tick', dt: ms - 1 }, { type: 'tick', dt: 1 }]);
  assert.equal(s.cur, 1);
  assert.equal(s.elapsed, 0, 'the next beat starts from 0');
  assert.equal(s.run, 1, 'and replays its animations');
  // 1.25× reaches the end of the beat in 80% of the time
  const fast = run([{ type: 'speed' }, { type: 'tick', dt: ms * 0.8 }]);
  assert.equal(fast.speed, 1.25);
  assert.equal(fast.cur, 1);
  assert.equal(run([{ type: 'speed' }, { type: 'speed' }]).speed, 0.75);
  assert.equal(run([{ type: 'speed' }, { type: 'speed' }, { type: 'speed' }]).speed, 1, 'cycles 1 → 1.25 → 0.75 → 1');
});

test('player: changing speed keeps your place in the beat', () => {
  const ms = beatMs(beats[0]);
  const half = run([{ type: 'tick', dt: ms / 2 }]);
  assert.equal(barFill(beats, half, 0), 0.5);
  const faster = playerStep(beats, half, { type: 'speed' });
  assert.ok(Math.abs(barFill(beats, faster, 0) - 0.5) < 1e-9);
});

test('player: pause and hold stop the clock; Space toggles', () => {
  const ms = beatMs(beats[0]);
  const paused = run([{ type: 'pause' }, { type: 'tick', dt: ms * 3 }]);
  assert.equal(paused.cur, 0);
  assert.equal(paused.elapsed, 0);
  assert.equal(run([{ type: 'pause' }, { type: 'pause' }]).paused, false);
  const held = run([{ type: 'hold', on: true }, { type: 'tick', dt: ms * 3 }]);
  assert.equal(held.cur, 0);
  assert.equal(run([{ type: 'hold', on: true }, { type: 'hold', on: false }, { type: 'tick', dt: ms }]).cur, 1, 'release resumes');
});

test('player: Back replays the previous beat from its start, playing', () => {
  assert.equal(run([{ type: 'back' }]), PLAYER_START, 'nothing before the first beat');
  const s = run([{ type: 'next' }, { type: 'next' }, { type: 'tick', dt: 1000 }, { type: 'pause' }, { type: 'back' }]);
  assert.equal(s.cur, 1);
  assert.equal(s.elapsed, 0);
  assert.equal(s.paused, false);
});

test('player: the quiz blocks Next and the clock until answered right', () => {
  const at = until(quizAt);
  assert.equal(at.cur, quizAt);
  assert.equal(playerStep(beats, at, { type: 'next' }), at, 'Next does nothing');
  assert.equal(playerStep(beats, at, { type: 'tick', dt: 60_000 }).cur, quizAt, 'the quiz waits');
  assert.equal(barFill(beats, at, quizAt), 0);
  const solved = playerStep(beats, at, { type: 'solve' });
  assert.equal(barFill(beats, solved, quizAt), 1);
  assert.equal(playerStep(beats, solved, { type: 'next' }).cur, quizAt + 1);
  assert.equal(playerStep(beats, until(0), { type: 'solve' }), PLAYER_START, 'solve only applies to a quiz beat');
});

test('player: the end card is the last step; replay starts over', () => {
  const end = run([{ type: 'next' }], playerStep(beats, until(quizAt), { type: 'solve' }));
  const last = run(Array.from({ length: beats.length }, () => ({ type: 'next' }) as const), end);
  assert.equal(last.cur, beats.length);
  assert.equal(playerStep(beats, last, { type: 'next' }), last);
  assert.equal(playerStep(beats, last, { type: 'tick', dt: 99_999 }), last);
  assert.equal(barFill(beats, last, beats.length), 1);
  const again = playerStep(beats, last, { type: 'replay' });
  assert.equal(again.cur, 0);
  assert.deepEqual(again.solved, [quizAt], 'a solved quiz stays solved');
});

// ---------- the content check ----------
const good: Short = structuredClone(short);
const broken = (f: (s: Short & { beats: Record<string, unknown>[] }) => void) => {
  const s = structuredClone(good) as Short & { beats: Record<string, unknown>[] };
  f(s);
  return checkShort(s, 'x').join('\n');
};

test('validator: a good Short passes, malformed ones fail', () => {
  assert.deepEqual(checkShort(good, 'x'), []);
  assert.match(broken((s) => (s.beats[1].type = 'video')), /unknown type "video"/);
  assert.match(broken((s) => s.beats.splice(quizAt, 1)), /exactly one quiz/);
  assert.match(broken((s) => s.beats.push(structuredClone(s.beats[quizAt]))), /exactly one quiz/);
  assert.match(broken((s) => (s.beats[quizAt].answer = 7)), /answer index out of range/);
  assert.match(broken((s) => ((s.beats[quizAt].options as { why: string }[])[0].why = '')), /text and why/);
  assert.match(broken((s) => s.beats.unshift(s.beats.splice(quizAt, 1)[0])), /cannot open with the quiz/);
  assert.match(broken((s) => (s.beats[0].value = '18,400')), /counter needs a number value/);
  assert.match(broken((s) => (s.beats[2].k = 9)), /retrieve needs/);
  assert.match(broken((s) => (s.beats = s.beats.slice(0, 3))), /3 beats/);
  assert.match(broken((s) => (s.id = 'Not Kebab')), /kebab-case/);
  assert.match(broken((s) => (s.takeaway.sub = '')), /takeaway/);
  assert.match(broken((s) => delete s.beats[1].kicker), /no kicker/);
});

test('validator: numbers must be present', () => {
  const noDigits: ShortBeat[] = [
    ...Array.from({ length: 4 }, () => ({ type: 'flow' as const, kicker: 'k', head: 'h', steps: ['a', 'b'] })),
    { type: 'quiz', kicker: 'k', head: 'q', answer: 0, options: [{ text: 'a', why: 'b' }, { text: 'c', why: 'd' }] },
  ];
  assert.match(checkShort({ ...good, beats: noDigits }, 'x').join(), /no numbers/);
  assert.match(checkShort({ ...good, beats: [{ type: 'ladder', kicker: 'k', head: 'h', unit: 'u', rungs: [{ label: 'a', amount: Number.NaN }, { label: 'b', amount: 2 }] }, ...noDigits.slice(1)] }, 'x').join(), /ladder needs/);
  assert.match(checkShort({ ...good, beats: [{ type: 'tokens', kicker: 'k', head: 'h', prompt: 'p', picks: [{ token: 'a', p: 0.2 }, { token: 'b', p: 0.7 }] }, ...noDigits.slice(1)] }, 'x').join(), /most likely/);
});

test('validator: duplicate ids across the course are caught', () => {
  const seen = new Set<string>();
  assert.deepEqual(checkShort(good, 'a', seen), []);
  assert.match(checkShort(good, 'b', seen).join(), /duplicate short id/);
});

// ---------- Short of the day and unlocks ----------
const watchedAt = (iso: string) => ({ watchedAt: iso });

test('Short of the day: the same pick all day, a different one on other days', () => {
  const a = shortOfTheDay(ALL, undefined, '2026-11-08')!;
  assert.equal(shortOfTheDay(ALL, undefined, '2026-11-08')!.entry, a.entry, 'deterministic per date');
  assert.equal(a.watched, false);
  const days = new Set(Array.from({ length: 12 }, (_, i) => shortOfTheDay(ALL, undefined, `2026-12-${String(i + 1).padStart(2, '0')}`)!.entry.short.id));
  assert.equal(days.size, 12, 'twelve days, twelve different Shorts');
  assert.equal(shortOfTheDay([], undefined, '2026-11-08'), null);
});

test('Short of the day: skips watched Shorts, and one watched today stays up', () => {
  const today = '2026-11-08';
  const first = shortOfTheDay(ALL, undefined, today)!.entry.short.id;
  const watchedBefore = { [first]: watchedAt('2026-11-01T10:00:00') };
  const next = shortOfTheDay(ALL, watchedBefore, today)!;
  assert.notEqual(next.entry.short.id, first, 'watched on an earlier day: skipped');
  assert.equal(next.watched, false);
  const watchedToday = { [first]: watchedAt(`${today}T09:00:00`) };
  const kept = shortOfTheDay(ALL, watchedToday, today)!;
  assert.equal(kept.entry.short.id, first, 'watched today: still today’s Short');
  assert.equal(kept.watched, true);
  const everything = Object.fromEntries(ALL.map((e) => [e.short.id, watchedAt('2026-10-01T10:00:00')]));
  assert.equal(shortOfTheDay(ALL, everything, today)!.entry.short.id, first, 'all watched: the date pick, ticked');
});

test('daily unlock: one Short per study day, plus the Short of the day and anything watched', () => {
  const today = '2026-11-08';
  const sotd = shortOfTheDay(ALL, undefined, today)!.entry.short.id;
  assert.deepEqual([...unlockedShorts(ALL, {}, today)], [sotd], 'no study yet: only the Short of the day');
  const three = { activityDays: ['2026-11-01', '2026-11-03', '2026-11-03', '2026-11-05'] };
  assert.equal(studyDays(three), 3, 'days are counted once');
  const open = unlockedShorts(ALL, three, today);
  for (const e of ALL.slice(0, 3)) assert.ok(open.has(e.short.id), `${e.short.id} unlocked by a study day`);
  assert.ok(open.has(sotd));
  assert.ok(!open.has(ALL[3].short.id) || ALL[3].short.id === sotd, 'the 4th needs a 4th study day');
  const late = ALL[11].short.id;
  assert.ok(unlockedShorts(ALL, { ...three, shorts: { [late]: watchedAt('2026-10-01T10:00:00') } }, today).has(late), 'watched stays open');
  const all = { activityDays: Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`) };
  assert.equal(unlockedShorts(ALL, all, today).size, ALL.length, 'enough study days open everything');
});

test('daily unlock: studying today marks the newest one as new', () => {
  const today = '2026-11-08';
  assert.equal(unlockedToday(ALL, { activityDays: ['2026-11-07'] }, today), undefined);
  assert.equal(unlockedToday(ALL, { activityDays: ['2026-11-07', today] }, today), ALL[1]);
});
