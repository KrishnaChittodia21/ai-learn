// lib/nextStep: the one recommended action, from fixture topics and progress.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStep, topicSteps } from '../src/lib/nextStep.ts';
import type { Topic } from '../src/types.ts';
import { emptyProgress, passedTest } from './helpers.ts';

const topic = (id: string, extra: Partial<Record<string, unknown>> = {}) =>
  ({
    id,
    title: `Topic ${id}`,
    phase: 'foundations',
    order: 1,
    sections: [{ heading: 'One' }, { heading: 'Two' }],
    codeChallenges: [{ id: `${id}-cc` }],
    interviewQuestions: [{ id: `${id}-iq` }],
    envelopeQuestions: [],
    test: [{ id: `${id}-q1` }, { id: `${id}-q2` }],
    ...extra,
  }) as unknown as Topic;
const A = topic('a', { promptLabs: [{ id: 'a-lab' }] });
const B = topic('b');
const topics = [A, B];

test('fresh learner → start the first topic', () => {
  const s = nextStep(emptyProgress(), topics);
  assert.equal(s.kind, 'start');
  assert.equal(s.topic?.id, 'a');
  assert.equal(s.href, '/topic/a?tab=learn&s=0');
});

test('fresh learner gets no "revise weak area" secondary', () => {
  const s = nextStep(emptyProgress(), topics, { weak: { topic: A, index: 1, heading: 'Two' } });
  assert.equal(s.secondary, undefined);
});

test('partly read topic → resume at the first unread section', () => {
  const s = nextStep(emptyProgress({ sections: { a: [0] } }), topics);
  assert.equal(s.kind, 'read');
  assert.equal(s.href, '/topic/a?tab=learn&s=1');
  assert.match(s.title, /§2 Two/);
});

test('after reading: code → prompt lab → interview → exam, in that order', () => {
  const read = { sections: { a: [0, 1] } };
  assert.equal(nextStep(emptyProgress(read), topics).kind, 'code');
  const coded = { ...read, cc: { 'a-cc': true as const } };
  assert.equal(nextStep(emptyProgress(coded), topics).kind, 'prompt-lab');
  const labbed = { ...coded, promptLabs: { 'a-lab': { system: '', user: '', best: 100, solvedAt: '2026-01-01T00:00:00Z' } } };
  assert.equal(nextStep(emptyProgress(labbed), topics).kind, 'interview');
  const rated = { ...labbed, iq: { 'a-iq': 'nailed' as const } };
  const s = nextStep(emptyProgress(rated), topics);
  assert.equal(s.kind, 'exam');
  assert.equal(s.title, 'Take the exam (pass mark 70%)');
});

test('failed exam → retake shows the best score; weak area offered as secondary', () => {
  const p = emptyProgress({ sections: { a: [0, 1] }, cc: { 'a-cc': true }, iq: { 'a-iq': 'partial' }, promptLabs: { 'a-lab': { system: '', user: '', best: 100, solvedAt: 'x' } }, tests: { a: { best: 40, last: 40, attempts: 1 } } });
  const s = nextStep(p, topics, { weak: { topic: A, index: 1, heading: 'Two' } });
  assert.equal(s.kind, 'exam');
  assert.equal(s.title, 'Retake the exam: best 40%');
  assert.deepEqual(s.secondary, { title: 'Revise weak area: Two', href: '/topic/a?tab=learn&s=1' });
});

test('passing an exam moves on to the next topic, even with steps left behind', () => {
  const s = nextStep(emptyProgress({ tests: { a: passedTest() } }), topics);
  assert.equal(s.kind, 'read');
  assert.equal(s.topic?.id, 'b');
});

test('all exams passed → architecture challenges, then done', () => {
  const allPassed = { tests: { a: passedTest(), b: passedTest() } };
  assert.equal(nextStep(emptyProgress(allPassed), topics, { companyTotal: 2 }).kind, 'company');
  assert.equal(nextStep(emptyProgress({ ...allPassed, company: { c1: true, c2: true } }), topics, { companyTotal: 2 }).kind, 'done');
  assert.equal(nextStep(emptyProgress(allPassed), topics).kind, 'done');
});

test('topicSteps leaves out steps with no content and marks completion', () => {
  const steps = topicSteps(emptyProgress({ sections: { b: [0, 1] } }), B);
  assert.deepEqual(
    steps.map((s) => [s.id, s.complete]),
    [
      ['learn', true],
      ['code', false],
      ['interview', false],
      ['exam', false],
    ],
  );
});
