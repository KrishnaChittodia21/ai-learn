import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameFrom, pageLabel, trackPage } from '../src/lib/navHistory.ts';

const titles: Record<string, string> = { 'rag-fundamentals': 'RAG Fundamentals: Naive, Advanced and Modular RAG' };
const label = (p: string) => pageLabel(p, (id) => titles[id]);

test('page labels: app pages, topics and their exams, unknown routes', () => {
  assert.equal(label('/'), 'Dashboard');
  assert.equal(label('/contents'), 'Syllabus');
  assert.equal(label('/short/lawyer-who-cited-fake-cases'), 'Shorts');
  assert.equal(label('/paths/mcp/certificate'), 'Learning paths');
  assert.equal(label('/topic/rag-fundamentals'), 'RAG Fundamentals');
  assert.equal(label('/topic/rag-fundamentals/exam'), 'RAG Fundamentals exam');
  assert.equal(label('/topic/nope'), null);
  assert.equal(label('/no-such-page'), null);
});

test('came from: the page before this one, whether or not this page was recorded yet', () => {
  trackPage('/');
  trackPage('/contents');
  trackPage('/contents');
  assert.equal(cameFrom('/topic/rag-fundamentals'), '/contents', 'mounted before Layout recorded it');
  trackPage('/topic/rag-fundamentals');
  assert.equal(cameFrom('/topic/rag-fundamentals'), '/contents', 'mounted after (a lazy page)');
});
