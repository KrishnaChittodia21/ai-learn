// M9 motion: the pure decisions behind the motion kit (count from last seen, typing pace, deck release,
// once-per-session gating, reduced-motion preset mapping, skeleton delay).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countPlan, deckRelease, fade, firstThisSession, pick, SKELETON_DELAY, spring, typeChunks, typeDelay } from '../src/lib/motion.ts';

test('count-up runs only when the value changed since the last visit', () => {
  assert.deepEqual(countPlan(57, 63, false), { from: 57, delta: 6, animate: true });
  assert.deepEqual(countPlan(7, 5, false), { from: 7, delta: -2, animate: true });
  // same value: no count-up, no delta
  assert.deepEqual(countPlan(12, 12, false), { from: 12, delta: 0, animate: false });
  // first visit (nothing seen yet): shows the value as is
  assert.deepEqual(countPlan(undefined, 9, false), { from: 9, delta: 0, animate: false });
  // reduced motion: the delta is still known, but nothing counts
  assert.deepEqual(countPlan(3, 8, true), { from: 3, delta: 5, animate: false });
});

test('typing reveal: at most 28 ms per chunk and 1.6 s in total', () => {
  assert.equal(typeDelay(10), 28);
  assert.equal(typeDelay(200), 8);
  assert.ok(typeDelay(400) * 400 <= 1600);
  assert.equal(typeDelay(0), 28);
  const text = 'Great news, the team handled it!\n  Overall robust.';
  const chunks = typeChunks(text);
  assert.equal(chunks.join(''), text, 'chunks rebuild the exact text');
  assert.ok(chunks.every((c) => /^\s+$/.test(c) || c.length <= 4));
});

test('deck release: fling past 110 px or a fast flick, tap under 6 px, otherwise snap back', () => {
  assert.equal(deckRelease(-120, 0), 'next');
  assert.equal(deckRelease(130, 0), 'prev');
  assert.equal(deckRelease(-20, 0.2), 'next', 'a quick flick past 12 px flings');
  assert.equal(deckRelease(-10, 0.5), 'settle', 'too short to fling, even when fast');
  assert.equal(deckRelease(40, 0.05), 'settle');
  assert.equal(deckRelease(3, 0), 'tap');
});

test('heading reveal plays once per page per session; a read-only check does not use it up', () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  assert.equal(firstThisSession('hr:/', store, false), true);
  assert.equal(firstThisSession('hr:/', store, false), true, 'reading twice (StrictMode) keeps it first');
  assert.equal(firstThisSession('hr:/', store), true);
  assert.equal(firstThisSession('hr:/', store), false);
  assert.equal(firstThisSession('hr:/shorts', store), true, 'each page has its own key');
  // no or blocked storage: play (never crash)
  assert.equal(firstThisSession('x', undefined), true);
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {},
  };
  assert.equal(firstThisSession('x', blocked), true);
});

test('reduced motion maps any preset to the 150 ms fade', () => {
  const rise = { initial: { opacity: 0, transform: 'translateY(8px)' }, animate: { opacity: 1, transform: 'none' } };
  assert.equal(pick(false, rise), rise);
  assert.equal(pick(null, rise), rise);
  assert.equal(pick(true, rise), fade);
  assert.equal(fade.transition.duration, 0.15);
  assert.ok(!('transform' in fade.initial), 'the fade never moves');
  assert.equal(spring.ui.bounce, 0, 'UI movement does not bounce');
});

test('skeletons wait 200 ms so fast loads never flash', () => {
  assert.equal(SKELETON_DELAY, 200);
});
