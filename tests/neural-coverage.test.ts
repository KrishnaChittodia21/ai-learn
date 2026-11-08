// Data behind the Today hero's coverage network (src/lib/coverage.ts, used by NeuralCoverage.tsx).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS } from '../src/content/phases.ts';
import { layerCounts, levelLayers, parseStates } from '../src/lib/coverage.ts';
import { nextStep } from '../src/lib/nextStep.ts';
import { topicStatus } from '../src/lib/stats.ts';
import { emptyProgress, LEVEL_OF_TOPIC, passedTest, TOPICS } from './helpers.ts';

const layers = levelLayers(TOPICS, LEVELS, LEVEL_OF_TOPIC);
/** same path as the component: progress → topicStatus → "passed,new,…" key → neuron states */
const statesFor = (p: ReturnType<typeof emptyProgress>) => parseStates(TOPICS.map((t) => topicStatus(p, t)).join(','), TOPICS);

test('three level layers sized from content (8 / 17 / 35), every topic placed once in course order', () => {
  assert.deepEqual(
    layers.map((l) => l.length),
    [8, 17, 36],
  );
  assert.deepEqual(
    layers.flat().map((t) => t.id),
    TOPICS.map((t) => t.id),
  );
});

test('fresh progress: every neuron is new, nothing covered', () => {
  const st = statesFor(emptyProgress());
  assert.ok([...st.values()].every((s) => s === 'new'));
  assert.deepEqual(layerCounts(layers, st), [
    { done: 0, total: 8 },
    { done: 0, total: 17 },
    { done: 0, total: 36 },
  ]);
});

test('passed exam → covered, touched topic → in progress; counts per level', () => {
  const [b0, b1, b2] = layers[0];
  const adv = layers[2][0];
  const p = emptyProgress({ tests: { [b0.id]: passedTest(), [b1.id]: passedTest(), [adv.id]: passedTest() }, sections: { [b2.id]: [0] } });
  const st = statesFor(p);
  assert.equal(st.get(b0.id), 'covered');
  assert.equal(st.get(b2.id), 'progress');
  assert.equal(st.get(layers[1][0].id), 'new');
  // a failed attempt still counts as in progress, not covered
  assert.equal(statesFor(emptyProgress({ tests: { [b0.id]: { best: 10, last: 10, attempts: 1 } } })).get(b0.id), 'progress');
  assert.deepEqual(
    layerCounts(layers, st).map((c) => c.done),
    [2, 0, 1],
  );
});

test('next-topic marker: the hero marks the topic nextStep recommends', () => {
  const [b0, b1] = layers[0];
  const p = emptyProgress({ tests: { [b0.id]: passedTest() }, sections: { [b1.id]: [0] } });
  const next = nextStep(p, TOPICS).topic;
  assert.equal(next?.id, b1.id);
  assert.equal(statesFor(p).get(b1.id), 'progress');
});

test('an unknown or missing status in the key reads as new', () => {
  const st = parseStates('passed,bogus', TOPICS);
  assert.equal(st.get(TOPICS[0].id), 'covered');
  assert.equal(st.get(TOPICS[1].id), 'new');
  assert.equal(st.get(TOPICS[2].id), 'new');
});
