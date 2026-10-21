// Checks the achievements catalogue (src/content/achievements.ts) against the real content, in plain
// node (TypeScript is type-stripped; the catalogue has no runtime imports). Usage:
//   node scripts/validate-achievements.mjs
// It verifies ids, groups, glyphs and tier ladders, that empty progress earns nothing, that a fully
// completed (synthetic) record reaches the top tier of EVERY badge (so every goal is reachable from
// what progress.ts records), and the earn / merge rules (no re-awards, no downgrades, tier jumps).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = async (rel) => import(pathToFileURL(join(root, rel)).href);

const A = await load('src/content/achievements.ts');
const { PHASES } = await load('src/content/phases.ts');
const { COMPANY_QUESTIONS } = await load('src/content/companies.ts');
const topicDir = join(root, 'src/content/topics');
const phaseIndex = (id) => PHASES.findIndex((p) => p.id === id);
const topics = [];
for (const f of readdirSync(topicDir).filter((f) => f.endsWith('.ts'))) topics.push((await load(`src/content/topics/${f}`)).default);
topics.sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase) || a.order - b.order);

const errors = [];
const fail = (msg) => errors.push(msg);
const ctx = A.buildAchievementContext({ topics, phases: PHASES, challenges: COMPANY_QUESTIONS });

// ---------- catalogue shape ----------
const ids = new Set();
const groups = new Set(A.GROUPS.map((g) => g.id));
const badgeSrc = readFileSync(join(root, 'src/components/achievements/Badge.tsx'), 'utf8');
const artKeys = new Set([...badgeSrc.slice(badgeSrc.indexOf('const ART'), badgeSrc.indexOf('};', badgeSrc.indexOf('const ART'))).matchAll(/^\s*'?([\w-]+)'?:\s*\w+,/gm)].map((m) => m[1]));
for (const a of A.ACHIEVEMENTS) {
  if (ids.has(a.id)) fail(`${a.id}: duplicate id`);
  ids.add(a.id);
  if (!groups.has(a.group)) fail(`${a.id}: unknown group "${a.group}"`);
  if (!artKeys.has(a.art)) fail(`${a.id}: glyph "${a.art}" is not mapped in Badge.tsx`);
  for (const k of ['name', 'description', 'unit']) if (!a[k]?.trim()) fail(`${a.id}: missing ${k}`);
  if (!!a.tiers === (a.goal !== undefined)) fail(`${a.id}: needs exactly one of tiers / goal`);
  const ladder = A.tierLadder(a, ctx);
  if (a.tiers) {
    const order = a.tiers.map((t) => A.TIERS.indexOf(t.tier));
    if (order.some((o, i) => o < 0 || (i > 0 && o <= order[i - 1]))) fail(`${a.id}: tiers out of order`);
    if (ladder.length !== a.tiers.length) fail(`${a.id}: a content-sized goal collapsed the ladder (${ladder.map((t) => `${t.tier}:${t.goal}`).join(' ')})`);
  }
  for (const t of ladder) if (!(Number.isInteger(t.goal) && t.goal > 0)) fail(`${a.id}: ${t.tier} goal ${t.goal} is not a positive integer`);
  if (!a.requirement(ladder[0].goal, ctx)?.trim()) fail(`${a.id}: empty requirement`);
}
for (const g of A.GROUPS) if (!A.ACHIEVEMENTS.some((a) => a.group === g.id)) fail(`group ${g.id} has no badges`);

// ---------- empty progress earns nothing ----------
const empty = { tests: {}, sections: {}, iq: {}, boe: {}, cc: {}, drafts: {}, company: {}, mcq: {}, settings: { passMark: 70 } };
const evEmpty = A.evaluateAll(empty, ctx);
for (const [id, ev] of Object.entries(evEmpty)) {
  if (ev.value !== 0) fail(`${id}: empty progress measures ${ev.value}`);
  if (ev.tier) fail(`${id}: empty progress earns ${ev.tier}`);
}
if (A.newlyEarned(evEmpty, undefined).length) fail('newlyEarned: empty progress (no stored map) earned something');

// ---------- a completed record reaches the top tier of every badge ----------
const at = (day, hh) => {
  const d = new Date(2026, 0, 1 + day, hh, 0, 0);
  return d.toISOString();
};
const pad = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const full = structuredClone(empty);
full.activityDays = Array.from({ length: 120 }, (_, i) => localDay(new Date(2026, 0, 1 + i)));
topics.forEach((t, ti) => {
  full.sections[t.id] = t.sections.map((_, i) => i);
  t.sections.forEach((s, i) => {
    if (s.exercise) full.cc[`${t.id}-s${i}-ex`] = true;
    if (s.quickCheck) full.drafts[`qc:${t.id}-s${i}-qc`] = String(s.quickCheck.correct);
  });
  t.codeChallenges.forEach((c) => (full.cc[c.id] = true));
  t.envelopeQuestions.forEach((q) => (full.boe[q.id] = true));
  t.interviewQuestions.forEach((q) => (full.iq[q.id] = 'nailed'));
  t.test.forEach((q) => (full.mcq[q.id] = { seen: 2, wrong: 1, lastCorrect: true, lastAt: at(5, 2) }));
  // the first topic is passed after one failure (comeback); the rest first time, all on one day, at 2 am
  const failed = ti === 0;
  const passedAt = at(5, 2);
  full.tests[t.id] = {
    best: 100,
    last: 100,
    attempts: failed ? 2 : 1,
    passedAt,
    history: failed ? [{ at: at(4, 21), score: 40 }, { at: passedAt, score: 100 }] : [{ at: passedAt, score: 100 }],
  };
});
COMPANY_QUESTIONS.forEach((q) => (full.company[q.id] = true));
// prompt labs: solved on their own; one revealed only after solving still counts
full.promptLabs = {};
topics.flatMap((t) => t.promptLabs ?? []).forEach((lab, i) => {
  full.promptLabs[lab.id] = { system: '', user: '', best: 100, solvedAt: at(3, 10), ...(i === 0 ? { revealedAt: at(3, 11) } : {}) };
});
// …and a lab whose answer was revealed BEFORE it was solved does not count
const firstLab = topics.flatMap((t) => t.promptLabs ?? [])[0];
if (firstLab) {
  const peeked = { ...structuredClone(empty), promptLabs: { [firstLab.id]: { system: '', user: '', best: 100, revealedAt: at(3, 9), solvedAt: at(3, 10) } } };
  if (A.evaluateAll(peeked, ctx)['prompt-smith']?.value !== 0) fail('prompt-smith: a lab solved after revealing the model answer was counted');
}
const evFull = A.evaluateAll(full, ctx);
for (const a of A.ACHIEVEMENTS) {
  const ev = evFull[a.id];
  if (ev.next) fail(`${a.id}: a completed record stops at ${ev.tier ?? 'nothing'} (${ev.value} / ${ev.next.goal} ${a.unit}) — goal unreachable?`);
}

// ---------- earn / merge rules ----------
const earned = A.newlyEarned(evFull, {});
if (earned.length !== A.ACHIEVEMENT_TOTAL) fail(`newlyEarned: ${earned.length} of ${A.ACHIEVEMENT_TOTAL} from a completed record`);
const jump = earned.find((e) => e.id === 'deep-reader');
if (jump?.tiers.join() !== 'bronze,silver,gold,diamond') fail(`newlyEarned: a jump to diamond should list every tier, got ${jump?.tiers}`);
const stored = A.mergeEarned(undefined, earned, 1000);
if (A.newlyEarned(evFull, stored).length) fail('newlyEarned: stored badges were re-awarded');
const after = A.mergeEarned(stored, [{ id: 'deep-reader', tier: 'bronze', tiers: ['bronze'] }], 2000);
if (after['deep-reader'].tier !== 'diamond' || after['deep-reader'].earnedAt !== 1000) fail('mergeEarned: a lower tier downgraded a stored badge');
const partial = A.mergeEarned({}, [{ id: 'deep-reader', tier: 'silver', tiers: ['bronze', 'silver'] }], 10);
const up = A.newlyEarned(evFull, partial).find((e) => e.id === 'deep-reader');
if (up?.tiers.join() !== 'gold,diamond') fail(`newlyEarned: silver → diamond should list gold,diamond, got ${up?.tiers}`);
if (A.earnedList({ ...stored, gone: { tier: 'gold', earnedAt: 1 } }).some((e) => e.id === 'gone')) fail('earnedList: unknown ids should be ignored');
if (A.longestStreak(['2026-03-28', '2026-03-29', '2026-03-30', '2026-04-02']) !== 3) fail('longestStreak: DST-spanning run miscounted');
if (A.fullWeekends(['2026-10-17', '2026-10-18']) !== 1) fail('fullWeekends: Sat 17 + Sun 18 Oct 2026 not counted');
if (A.closestNext(evFull) !== null) fail('closestNext: a maxed catalogue still has a next badge');

// ---------- report ----------
const tiersOf = (a) => A.tierLadder(a, ctx).map((t) => (t.tier === 'standard' ? `${t.goal}` : `${t.tier[0].toUpperCase()}${t.goal}`)).join(' ');
if (process.argv.includes('--list')) for (const a of A.ACHIEVEMENTS) console.log(`${a.group.padEnd(13)} ${a.name.padEnd(22)} ${tiersOf(a).padEnd(22)} ${a.unit}`);
if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`);
  console.log(`\n${errors.length} achievement problem(s).`);
  process.exit(1);
}
console.log(`✓ ${A.ACHIEVEMENT_TOTAL} achievements in ${A.GROUPS.length} groups: shapes, glyphs, reachable goals and earn rules OK`);
