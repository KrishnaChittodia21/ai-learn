// Guide Me (M3): every page guide points at real markup, seen state persists, the first-visit offer shows once.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GUIDES, GUIDE_ORDER, guideIdFor, shouldOffer, type GuideId } from '../src/lib/pageGuides.ts';
import type * as UiPrefsModule from '../src/lib/uiPrefs.ts';

/** where each page's targets live */
const SOURCES: Record<GuideId, string[]> = {
  today: ['pages/Home.tsx', 'components/NeuralCoverage.tsx', 'components/achievements/AchievementsSummary.tsx'],
  topic: ['pages/Topic.tsx', 'components/StudyPath.tsx', 'components/SectionPractice.tsx'],
  exam: ['pages/Exam.tsx'],
  saved: ['pages/Saved.tsx'],
  shorts: ['pages/Shorts.tsx'],
  plan: ['pages/Plan.tsx'],
  settings: ['pages/Settings.tsx'],
};
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');

test('every page guide is listed, has stops, and unique stop ids', () => {
  assert.deepEqual([...GUIDE_ORDER].sort(), Object.keys(GUIDES).sort());
  for (const id of GUIDE_ORDER) {
    const stops = GUIDES[id].stops;
    assert.ok(stops.length >= 3, `${id} has at least 3 stops`);
    assert.equal(new Set(stops.map((s) => s.id)).size, stops.length, `${id} stop ids are unique`);
    for (const s of stops) assert.ok(s.title && s.text, `${id}/${s.id} has copy`);
  }
});

test("every stop's target exists in its page's markup", () => {
  for (const id of GUIDE_ORDER) {
    const code = SOURCES[id].map(src).join('\n');
    for (const s of GUIDES[id].stops) {
      const m = /^\[data-guide="([\w-]+)"\]$/.exec(s.target);
      assert.ok(m, `${id}/${s.id}: target is a [data-guide="…"] selector`);
      // data-guide="name", a guide="name" prop, or a conditional data-guide={… 'name' …}
      const re = new RegExp(`(?:data-guide|guide)=(?:"${m[1]}"|\\{[^}\\n]*'${m[1]}')`);
      assert.match(code, re, `${id}/${s.id}: data-guide "${m[1]}" is in ${SOURCES[id].join(', ')}`);
    }
  }
});

test('each guided page has a route and maps back to its guide', () => {
  const app = src('App.tsx');
  for (const path of ["path: 'topic/:id'", "path: 'topic/:id/exam'", "path: 'saved'", "path: 'shorts'", "path: 'plan'", "path: 'settings'", 'index: true']) assert.ok(app.includes(path), path);
  assert.equal(guideIdFor('/'), 'today');
  assert.equal(guideIdFor('/topic/rag-fundamentals'), 'topic');
  assert.equal(guideIdFor('/topic/rag-fundamentals/exam'), 'exam');
  assert.equal(guideIdFor('/saved'), 'saved');
  assert.equal(guideIdFor('/shorts'), 'shorts');
  assert.equal(guideIdFor('/short/rag-in-90-seconds'), null, 'the player has no guide of its own');
  assert.equal(guideIdFor('/plan'), 'plan');
  assert.equal(guideIdFor('/settings'), 'settings');
  assert.equal(guideIdFor('/contents'), null, 'no guide: "?" opens the welcome tour');
});

// uiPrefs reads localStorage once at import: stub it and import fresh copies
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
});
let n = 0;
const fresh = (): Promise<typeof UiPrefsModule> => import(`../src/lib/uiPrefs.ts?guides=${++n}`);

test('seen state persists across reloads', async () => {
  store.clear();
  let m = await fresh();
  assert.equal(m.getUiPrefs().guidesSeen, undefined);
  m.markGuideSeen('saved');
  m = await fresh();
  assert.deepEqual(m.getUiPrefs().guidesSeen, { saved: true });
});

test('first-visit offer: only after the welcome tour, and only once', async () => {
  store.clear();
  const m = await fresh();
  assert.equal(shouldOffer('today', m.getUiPrefs()), false, 'welcome tour first');
  m.saveUiPrefs({ tourSeen: true });
  assert.equal(shouldOffer('today', m.getUiPrefs()), true);
  assert.equal(shouldOffer(null, m.getUiPrefs()), false, 'pages without a guide');
  m.markGuideSeen('today');
  assert.equal(shouldOffer('today', m.getUiPrefs()), false, 'offered once');
  assert.equal(shouldOffer('topic', m.getUiPrefs()), true, 'other pages still offer theirs');
  // marking twice does not write again
  const before = store.get('genai-ui-v1');
  m.markGuideSeen('today');
  assert.equal(store.get('genai-ui-v1'), before);
});
