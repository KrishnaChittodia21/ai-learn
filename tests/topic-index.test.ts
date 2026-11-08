// The startup topic index (src/content/topicIndex.gen.ts) and the lazy topic loader (src/lib/topicLoader.ts).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TOPIC_INDEX } from '../src/content/topicIndex.gen.ts';
import { topicLoader } from '../src/lib/topicLoader.ts';
import { weakSections } from '../src/lib/weak.ts';
import type { Topic } from '../src/types.ts';
import { TOPICS } from './helpers.ts';

test('the checked-in topic index is up to date (else run: node scripts/gen-topic-index.mjs)', () => {
  const script = fileURLToPath(new URL('../scripts/gen-topic-index.mjs', import.meta.url));
  execFileSync(process.execPath, ['--no-warnings', script, '--check'], { stdio: 'pipe' });
});

test('the index keeps course order and every section, so progress keys (topicId:index) still line up', () => {
  assert.deepEqual(
    TOPIC_INDEX.map((t) => t.id),
    TOPICS.map((t) => t.id),
  );
  for (const [i, t] of TOPICS.entries()) assert.deepEqual(TOPIC_INDEX[i].sections.map((s) => s.heading), t.sections.map((s) => s.heading), t.id);
});

test('precomputed question sections match the full-topic matching', () => {
  for (const [i, t] of TOPICS.entries()) assert.deepEqual(weakSections(TOPIC_INDEX[i], t.test), weakSections(t, t.test), t.id);
});

test('loadTopic: one import per topic, shared promise, peek after load, retry after a failure', async () => {
  const calls: Record<string, number> = { a: 0, b: 0 };
  let failB = true;
  const topic = (id: string) => ({ id }) as Topic;
  const { load, peek } = topicLoader({
    a: async () => (calls.a++, { default: topic('a') }),
    b: async () => {
      calls.b++;
      if (failB) throw new Error('chunk failed');
      return { default: topic('b') };
    },
  });
  assert.equal(peek('a'), undefined);
  const [x, y] = await Promise.all([load('a'), load('a')]);
  assert.equal(x, y);
  assert.equal(calls.a, 1);
  assert.equal(peek('a'), x);
  await assert.rejects(load('b'), /chunk failed/);
  failB = false;
  assert.equal((await load('b')).id, 'b');
  assert.equal(calls.b, 2);
  await assert.rejects(load('nope'), /Unknown topic/);
});
