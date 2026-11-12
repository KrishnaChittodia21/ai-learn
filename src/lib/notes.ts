// Notebook: highlights, notes and sketches on lesson sections. Pure data + helpers, so tests
// can check them. Note bodies are structured blocks of text runs (never HTML) and render as React elements;
// sketches are a shape list rendered as SVG elements. Saved notes live in Progress.notes (progress.ts).

/** highlighter colours (design names → tokens: amber=solar, cyan=ion, rose=error, mag=pulsar, blue=nebula) */
export const NOTE_COLORS = ['amber', 'cyan', 'rose', 'mag', 'blue'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];
export const COLOR_LABEL: Record<NoteColor, string> = { amber: 'Key idea', cyan: 'Remember', rose: 'Confusing', mag: 'My take', blue: 'Follow up' };

/** sketch inks: the highlighter colours plus text ink and muted ink */
export const INKS = ['ink', 'ink-4', 'blue', 'cyan', 'amber', 'rose', 'mag'] as const;
export type Ink = (typeof INKS)[number];

/** one inline run of text with at most one mark: bold, marker (the note's colour), handwriting or code */
export interface Run {
  t: string;
  m?: 'b' | 'mk' | 'hand' | 'code';
}
/** a paragraph, or a checklist item */
export interface Block {
  runs: Run[];
  check?: boolean;
}

export type Shape =
  | { t: 'box' | 'db' | 'circle'; x: number; y: number; w: number; h: number; c: Ink }
  | { t: 'arrow'; x1: number; y1: number; x2: number; y2: number; c: Ink }
  | { t: 'pen'; pts: [number, number][]; c: Ink }
  | { t: 'text'; x: number; y: number; s: string; c: Ink };

export interface Note {
  id: string;
  topicId: string;
  /** section index, or -1 for a page note (no quote) */
  section: number;
  /** the highlighted text exactly as selected; '' for a page note */
  quote: string;
  /** up to CONTEXT characters before and after the quote, to re-find the right occurrence */
  prefix: string;
  suffix: string;
  /** null for a page note */
  color: NoteColor | null;
  body: Block[];
  emojis: string[];
  sketch?: Shape[];
  /** ISO time created */
  at: string;
}

export const NOTES_MAX = 2000;
export const BODY_MAX = 10_000;
export const SHAPES_MAX = 400;
export const QUOTE_MAX = 1000;
export const CONTEXT = 32;
const PTS_MAX = 2000;
const LABEL_MAX = 80;
const EMOJI_MAX = 8;

export const EMOJI = ['💡', '⭐', '❓', '⚠️', '🔥', '✅', '🎯', '🧠', '📌', '🤯', '⚡', '🐢', '🔁', '🔒', '📈', '💾', '🌐', '🧪', '👀', '🙌', '📝'];

// ---------- validation (Progress normalize + Import) ----------
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const coord = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-2000, Math.min(2000, Math.round(v))) : null);
const oneOf = <T extends string>(v: unknown, opts: readonly T[]): T | null => (opts.includes(v as T) ? (v as T) : null);
const MARKS = ['b', 'mk', 'hand', 'code'] as const;

function cleanBody(v: unknown): Block[] {
  if (!Array.isArray(v)) return [];
  let budget = BODY_MAX;
  const out: Block[] = [];
  for (const b of v.slice(0, 500)) {
    if (!isObj(b) || !Array.isArray(b.runs)) continue;
    const runs: Run[] = [];
    for (const r of b.runs.slice(0, 200)) {
      if (!isObj(r) || typeof r.t !== 'string' || !r.t || budget <= 0) continue;
      const t = r.t.slice(0, budget);
      budget -= t.length;
      const m = oneOf(r.m, MARKS);
      runs.push(m ? { t, m } : { t });
    }
    if (runs.length || b.check !== undefined) out.push(b.check === undefined ? { runs } : { runs, check: b.check === true });
  }
  return out;
}

function cleanShape(v: unknown): Shape | null {
  if (!isObj(v)) return null;
  const c = oneOf(v.c, INKS);
  if (!c) return null;
  if (v.t === 'box' || v.t === 'db' || v.t === 'circle') {
    const [x, y, w, h] = [coord(v.x), coord(v.y), coord(v.w), coord(v.h)];
    return x === null || y === null || w === null || h === null || w < 0 || h < 0 ? null : { t: v.t, x, y, w, h, c };
  }
  if (v.t === 'arrow') {
    const [x1, y1, x2, y2] = [coord(v.x1), coord(v.y1), coord(v.x2), coord(v.y2)];
    return x1 === null || y1 === null || x2 === null || y2 === null ? null : { t: 'arrow', x1, y1, x2, y2, c };
  }
  if (v.t === 'pen' && Array.isArray(v.pts)) {
    const pts: [number, number][] = [];
    for (const p of v.pts.slice(0, PTS_MAX)) {
      const x = Array.isArray(p) ? coord(p[0]) : null;
      const y = Array.isArray(p) ? coord(p[1]) : null;
      if (x !== null && y !== null) pts.push([x, y]);
    }
    return pts.length ? { t: 'pen', pts, c } : null;
  }
  if (v.t === 'text') {
    const [x, y] = [coord(v.x), coord(v.y)];
    const s = text(v.s, LABEL_MAX).trim();
    return x === null || y === null || !s ? null : { t: 'text', x, y, s, c };
  }
  return null;
}

/** One stored note → a fresh, typed note, or null when it is malformed. */
export function cleanNote(v: unknown): Note | null {
  if (!isObj(v)) return null;
  const id = text(v.id, 40);
  const topicId = text(v.topicId, 200);
  const section = typeof v.section === 'number' && Number.isInteger(v.section) && v.section >= -1 && v.section < 10_000 ? v.section : null;
  if (!id || !topicId || section === null) return null;
  const color = v.color === null ? null : oneOf(v.color, NOTE_COLORS);
  if (color === null && v.color !== null) return null;
  const quote = text(v.quote, QUOTE_MAX);
  // a highlight needs its quote and a colour; a page note has neither
  if ((section >= 0) !== !!quote || !quote !== (color === null)) return null;
  const note: Note = {
    id,
    topicId,
    section,
    quote,
    prefix: text(v.prefix, CONTEXT),
    suffix: text(v.suffix, CONTEXT),
    color,
    body: cleanBody(v.body),
    emojis: Array.isArray(v.emojis) ? [...new Set(v.emojis.filter((e): e is string => typeof e === 'string' && e.length > 0 && e.length <= 8))].slice(0, EMOJI_MAX) : [],
    at: text(v.at, 64),
  };
  if (Array.isArray(v.sketch)) {
    const shapes = v.sketch.slice(0, SHAPES_MAX).map(cleanShape).filter((s): s is Shape => !!s);
    if (shapes.length) note.sketch = shapes;
  }
  return note;
}

/** The stored list → at most NOTES_MAX valid notes with unique ids (malformed entries are dropped). */
export function cleanNotes(v: unknown): Note[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Note[] = [];
  for (const x of v) {
    const n = cleanNote(x);
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
      if (out.length >= NOTES_MAX) break;
    }
  }
  return out;
}

// ---------- the composer's tiny markup: **bold** ==marker== ~hand~ `code`, "[ ] " / "[x] " checklist lines ----------
const INLINE = /(\*\*[^*\n]+\*\*|==[^=\n]+==|~[^~\n]+~|`[^`\n]+`)/;

export function parseMarkup(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of src.slice(0, BODY_MAX).split('\n')) {
    const chk = /^\s*(?:[-*]\s*)?\[( |x|X)\]\s?/.exec(raw);
    const line = chk ? raw.slice(chk[0].length) : raw;
    if (!chk && !line.trim()) continue;
    const runs: Run[] = [];
    for (const part of line.split(INLINE)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) runs.push({ t: part.slice(2, -2), m: 'b' });
      else if (part.startsWith('==') && part.endsWith('==') && part.length > 4) runs.push({ t: part.slice(2, -2), m: 'mk' });
      else if (part.startsWith('~') && part.endsWith('~') && part.length > 2) runs.push({ t: part.slice(1, -1), m: 'hand' });
      else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) runs.push({ t: part.slice(1, -1), m: 'code' });
      else runs.push({ t: part });
    }
    blocks.push(chk ? { runs, check: chk[1] !== ' ' } : { runs });
  }
  return blocks;
}

const WRAP = { b: ['**', '**'], mk: ['==', '=='], hand: ['~', '~'], code: ['`', '`'] } as const;
const runsTo = (runs: Run[], wrap: Record<string, readonly [string, string]>) => runs.map((r) => (r.m ? wrap[r.m][0] + r.t + wrap[r.m][1] : r.t)).join('');

export function toMarkup(body: Block[]): string {
  return body.map((b) => (b.check === undefined ? '' : b.check ? '[x] ' : '[ ] ') + runsTo(b.runs, WRAP)).join('\n');
}

export const plainText = (body: Block[]) => body.map((b) => b.runs.map((r) => r.t).join('')).join(' ');

// ---------- anchoring: quote + context, re-found in the section's text ----------
/**
 * Where the quote starts in `text`, or -1 when it is gone (the lesson changed: the note shows as detached).
 * With several occurrences, the one whose surrounding text best matches the stored prefix / suffix wins.
 */
export function locate(text: string, a: Pick<Note, 'quote' | 'prefix' | 'suffix'>): number {
  if (!a.quote) return -1;
  let best = -1;
  let bestScore = -1;
  for (let i = text.indexOf(a.quote); i >= 0; i = text.indexOf(a.quote, i + 1)) {
    let score = 0;
    while (score < a.prefix.length && text[i - 1 - score] === a.prefix[a.prefix.length - 1 - score]) score++;
    const end = i + a.quote.length;
    let s = 0;
    while (s < a.suffix.length && text[end + s] === a.suffix[s]) s++;
    if (score + s > bestScore) {
      bestScore = score + s;
      best = i;
    }
  }
  return best;
}

/** The context to store for a quote found at `start` in `text`. */
export const contextAt = (text: string, start: number, quote: string) => ({
  prefix: text.slice(Math.max(0, start - CONTEXT), start),
  suffix: text.slice(start + quote.length, start + quote.length + CONTEXT),
});

// ---------- Markdown export ----------
const MD_WRAP = { b: ['**', '**'], mk: ['==', '=='], hand: ['_', '_'], code: ['`', '`'] } as const;

/** Notes as Markdown, grouped by topic (in the order given); `titleOf` names a topic. */
export function notesToMarkdown(notes: Note[], titleOf: (topicId: string) => string, heading = 'My notes'): string {
  const md = [`# ${heading}`, ''];
  const topics = [...new Set(notes.map((n) => n.topicId))];
  for (const t of topics) {
    md.push(`## ${titleOf(t)}`, '');
    for (const n of notes.filter((x) => x.topicId === t)) {
      const label = n.color ? COLOR_LABEL[n.color] : 'Page note';
      md.push(`### ${label}${n.section >= 0 ? ` · section ${n.section + 1}` : ''} ${n.emojis.join(' ')}`.trimEnd());
      if (n.quote) md.push(`> ${n.quote.replace(/\s*\n\s*/g, ' ')}`);
      const body = n.body.map((b) => (b.check === undefined ? '' : b.check ? '- [x] ' : '- [ ] ') + runsTo(b.runs, MD_WRAP));
      if (body.length) md.push('', ...body);
      const labels = (n.sketch ?? []).filter((s): s is Extract<Shape, { t: 'text' }> => s.t === 'text').map((s) => s.s);
      if (n.sketch) md.push('', `_sketch${labels.length ? `: ${labels.join(' · ')}` : ''}_`);
      md.push('');
    }
  }
  return md.join('\n');
}

// ---------- sketch templates (design: RAG pipeline, neural net) ----------
function net(): Shape[] {
  const R = 24;
  const layers: [number, number[], Ink][] = [
    [120, [110, 220, 330], 'cyan'],
    [360, [60, 160, 270, 370], 'blue'],
    [600, [160, 280], 'mag'],
  ];
  const out: Shape[] = [];
  for (let l = 0; l < 2; l++)
    for (const y1 of layers[l][1])
      for (const y2 of layers[l + 1][1]) {
        const x1 = layers[l][0];
        const x2 = layers[l + 1][0];
        const a = Math.atan2(y2 - y1, x2 - x1);
        out.push({ t: 'arrow', x1: Math.round(x1 + R * Math.cos(a)), y1: Math.round(y1 + R * Math.sin(a)), x2: Math.round(x2 - R * Math.cos(a)), y2: Math.round(y2 - R * Math.sin(a)), c: 'ink-4' });
      }
  for (const [x, ys, c] of layers) for (const y of ys) out.push({ t: 'circle', x: x - R, y: y - R, w: 2 * R, h: 2 * R, c });
  out.push({ t: 'text', x: 120, y: 410, s: 'input', c: 'ink' }, { t: 'text', x: 360, y: 420, s: 'hidden', c: 'ink' }, { t: 'text', x: 600, y: 350, s: 'output', c: 'ink' });
  return out;
}

export const TEMPLATES: Record<'rag' | 'nn', { label: string; shapes: Shape[] }> = {
  rag: {
    label: 'RAG pipeline',
    shapes: [
      { t: 'box', x: 380, y: 20, w: 120, h: 60, c: 'amber' },
      { t: 'text', x: 440, y: 50, s: 'Chunks', c: 'ink' },
      { t: 'box', x: 20, y: 200, w: 120, h: 60, c: 'ink' },
      { t: 'text', x: 80, y: 230, s: 'Query', c: 'ink' },
      { t: 'box', x: 190, y: 200, w: 120, h: 60, c: 'blue' },
      { t: 'text', x: 250, y: 230, s: 'Embed', c: 'ink' },
      { t: 'db', x: 360, y: 180, w: 160, h: 110, c: 'cyan' },
      { t: 'text', x: 440, y: 245, s: 'Vector DB', c: 'ink' },
      { t: 'box', x: 580, y: 200, w: 120, h: 60, c: 'mag' },
      { t: 'text', x: 640, y: 230, s: 'LLM', c: 'ink' },
      { t: 'arrow', x1: 440, y1: 80, x2: 440, y2: 180, c: 'amber' },
      { t: 'text', x: 500, y: 130, s: 'embed + store', c: 'amber' },
      { t: 'arrow', x1: 140, y1: 230, x2: 190, y2: 230, c: 'ink' },
      { t: 'arrow', x1: 310, y1: 230, x2: 360, y2: 230, c: 'ink' },
      { t: 'arrow', x1: 520, y1: 230, x2: 580, y2: 230, c: 'ink' },
      { t: 'text', x: 550, y: 190, s: 'top-k', c: 'cyan' },
      { t: 'pen', pts: [[80, 260], [80, 380], [620, 380]], c: 'ink-4' },
      { t: 'arrow', x1: 620, y1: 380, x2: 640, y2: 260, c: 'ink-4' },
      { t: 'text', x: 350, y: 405, s: 'question goes into the prompt too', c: 'ink-4' },
    ],
  },
  nn: { label: 'Neural net', shapes: net() },
};
