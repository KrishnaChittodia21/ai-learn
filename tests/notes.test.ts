// lib/notes (Notebook): stored notes are validated and capped, the composer markup round-trips, highlights re-find
// their quote by context, Markdown export, and notes survive progress normalize and backup import / merge.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanNote, cleanNotes, contextAt, locate, NOTES_MAX, notesToMarkdown, parseMarkup, SHAPES_MAX, TEMPLATES, toMarkup, type Note } from '../src/lib/notes.ts';
import { normalize } from '../src/lib/progress.ts';
import { exportBackup, mergeProgress, parseBackup } from '../src/lib/backup.ts';
import { emptyProgress } from './helpers.ts';

const hl = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  topicId: 'rag',
  section: 0,
  quote: 'small enough',
  prefix: 'A chunk should be ',
  suffix: ' to be about one thing',
  color: 'amber',
  body: [],
  emojis: [],
  at: '2026-11-12T10:00:00.000Z',
  ...over,
});

test('a valid highlight and page note are kept as they are', () => {
  const page = hl({ id: 'p1', section: -1, quote: '', prefix: '', suffix: '', color: null, body: [{ runs: [{ t: 'hi', m: 'b' }] }, { runs: [{ t: 'todo' }], check: true }] });
  assert.deepEqual(cleanNotes([hl(), page]), [hl(), page]);
});

test('malformed notes are dropped and fields are cleaned', () => {
  const bad = [
    null,
    'x',
    hl({ id: '' }),
    hl({ id: 'a', color: 'green' as never }),
    hl({ id: 'b', quote: '' }), // a highlight without its quote
    hl({ id: 'c', section: -1 }), // a page note with a quote
    hl({ id: 'd', section: 1.5 }),
    { ...hl({ id: 'e' }), topicId: 42 },
  ];
  assert.deepEqual(cleanNotes(bad), []);
  const n = cleanNote({ ...hl(), extra: '<script>', emojis: ['💡', '💡', 42, 'way too long emoji'], body: [{ runs: [{ t: 'x', m: 'evil' }, { t: 5 }, { t: '' }] }, 'junk'], sketch: [{ t: 'box', x: 0, y: 0, w: 10, h: 10, c: 'url(x)' }, { t: 'text', x: 1e9, y: 0, s: '  hi  ', c: 'ink' }] })!;
  assert.equal('extra' in n, false);
  assert.deepEqual(n.emojis, ['💡']);
  assert.deepEqual(n.body, [{ runs: [{ t: 'x' }] }]);
  assert.deepEqual(n.sketch, [{ t: 'text', x: 2000, y: 0, s: 'hi', c: 'ink' }], 'bad ink dropped, coordinates clamped, label trimmed');
  assert.equal(cleanNote({ ...hl(), sketch: [{ t: 'box', x: 'a', y: 0, w: 1, h: 1, c: 'ink' }] })!.sketch, undefined);
});

test('caps: notes, body length, shapes; duplicate ids keep the first', () => {
  const many = Array.from({ length: NOTES_MAX + 5 }, (_, i) => hl({ id: `n${i}` }));
  assert.equal(cleanNotes(many).length, NOTES_MAX);
  assert.equal(cleanNotes([hl(), hl({ quote: 'other text' })]).length, 1);
  const long = cleanNote(hl({ body: [{ runs: [{ t: 'a'.repeat(8000) }] }, { runs: [{ t: 'b'.repeat(8000) }] }] }))!;
  assert.equal(long.body.reduce((n, b) => n + b.runs.reduce((m, r) => m + r.t.length, 0), 0), 10_000);
  const shapes = Array.from({ length: SHAPES_MAX + 50 }, () => ({ t: 'arrow', x1: 0, y1: 0, x2: 40, y2: 0, c: 'cyan' }));
  assert.equal(cleanNote({ ...hl(), sketch: shapes })!.sketch!.length, SHAPES_MAX);
  assert.equal(cleanNote(hl({ quote: 'q'.repeat(5000) }))!.quote.length, 1000);
});

test('the templates are valid sketches', () => {
  for (const t of Object.values(TEMPLATES)) assert.deepEqual(cleanNote({ ...hl(), sketch: t.shapes })!.sketch, t.shapes);
});

test('composer markup → blocks → markup round-trips', () => {
  const src = 'Use **one vector** per ==chunk== and `split()` ~later~\n[ ] try 64 overlap\n[x] read the paper';
  const body = parseMarkup(src);
  assert.deepEqual(body, [
    { runs: [{ t: 'Use ' }, { t: 'one vector', m: 'b' }, { t: ' per ' }, { t: 'chunk', m: 'mk' }, { t: ' and ' }, { t: 'split()', m: 'code' }, { t: ' ' }, { t: 'later', m: 'hand' }] },
    { runs: [{ t: 'try 64 overlap' }], check: false },
    { runs: [{ t: 'read the paper' }], check: true },
  ]);
  assert.equal(toMarkup(body), src);
  assert.deepEqual(parseMarkup('\n  \n'), [], 'blank lines are dropped');
  assert.deepEqual(parseMarkup('<b>hi</b>'), [{ runs: [{ t: '<b>hi</b>' }] }], 'HTML stays text');
});

test('locate: picks the occurrence whose context matches; -1 when the text changed', () => {
  const text = 'Overlap helps. Later: Overlap repeats the end of one chunk. Overlap again.';
  const start = text.indexOf('Overlap repeats');
  const a = { quote: 'Overlap', ...contextAt(text, start, 'Overlap') };
  assert.equal(locate(text, a), start);
  assert.equal(locate('Edited. ' + text, a), start + 8, 'still found after an edit above it');
  assert.equal(locate('The lesson was rewritten.', a), -1);
  assert.equal(locate(text, { quote: '', prefix: '', suffix: '' }), -1);
});

test('Markdown export groups by topic with labels, quotes, checklists and sketch labels', () => {
  const md = notesToMarkdown(
    [
      hl({ emojis: ['💡'], body: parseMarkup('**One** vector\n[x] done') }),
      hl({ id: 'p', section: -1, quote: '', color: null, body: parseMarkup('~hand~ note'), sketch: TEMPLATES.rag.shapes.slice(0, 2) }),
    ],
    (id) => (id === 'rag' ? 'RAG basics' : id),
  );
  assert.equal(
    md,
    ['# My notes', '', '## RAG basics', '', '### Key idea · section 1 💡', '> small enough', '', '**One** vector', '- [x] done', '', '### Page note', '', '_hand_ note', '', '_sketch: Chunks_', ''].join('\n'),
  );
});

test('progress normalize cleans notes; saves without notes stay without', () => {
  const p = normalize({ notes: [hl(), { id: 'bad' }] as Note[] });
  assert.deepEqual(p.notes, [hl()]);
  assert.equal('notes' in normalize({}), false);
});

test('backup: notes round-trip, bad entries are dropped, merge keeps both sides', () => {
  const cur = emptyProgress({ notes: [hl()] });
  const res = parseBackup(JSON.stringify(exportBackup(cur)));
  assert.ok(res.ok);
  assert.deepEqual(res.ok && res.progress.notes, [hl()]);
  const dirty = parseBackup(JSON.stringify({ ...exportBackup(cur), progress: { ...cur, notes: [hl(), { id: 'x', topicId: 'y', __proto__: { polluted: true } }] } }));
  assert.ok(dirty.ok && dirty.progress.notes!.length === 1);
  const tooMany = parseBackup(JSON.stringify(exportBackup(emptyProgress({ notes: Array.from({ length: NOTES_MAX + 1 }, (_, i) => hl({ id: `n${i}` })) }))));
  assert.equal(tooMany.ok, false);
  const merged = mergeProgress(cur, emptyProgress({ notes: [hl({ quote: 'changed elsewhere' }), hl({ id: 'n2', at: '2026-01-01T00:00:00.000Z' })] }));
  assert.deepEqual(merged.notes!.map((n) => [n.id, n.quote]), [['n2', 'small enough'], ['n1', 'small enough']], 'this device wins by id; oldest first');
});
