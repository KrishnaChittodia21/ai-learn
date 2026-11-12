// Notebook on the Learn tab: select lesson text → a floating toolbar highlights it in one of five
// colours or opens a note; notes, sketches and emoji live in a liquid-glass side panel (a bottom sheet on phones)
// that can be hidden. Highlights are drawn with the CSS Custom Highlight API over live Ranges, so React's lesson DOM
// is never touched; without the API the Notebook still works as cards only. Bodies and sketches are structured
// data rendered as React elements (no innerHTML anywhere).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { Bold, Circle, Code, Database, Download, Eraser, Highlighter, MoveUpRight, NotebookPen, PenLine, Pencil, Plus, Search, Shapes, Signature, SmilePlus, Square, SquareCheck, StickyNote, Trash2, Type, Undo2, Unlink, X } from 'lucide-react';
import { TOPICS } from '../content';
import type { Topic } from '../types';
import { putNote, removeNote, useProgress } from '../lib/progress';
import { getUiPrefs, saveUiPrefs, useUiPrefs } from '../lib/uiPrefs';
import { showToast } from '../lib/toast';
import { useFocusTrap } from '../lib/useFocusTrap';
import { downloadFile } from '../lib/exportNow';
import { COLOR_LABEL, contextAt, EMOJI, INKS, locate, NOTE_COLORS, notesToMarkdown, parseMarkup, plainText, SHAPES_MAX, TEMPLATES, toMarkup, type Block, type Ink, type Note, type NoteColor, type Shape } from '../lib/notes';

type Filter = 'all' | NoteColor | 'sketch';
interface Draft {
  /** the note being edited; null = a new page note */
  id: string | null;
  text: string;
  sketch: Shape[] | null;
}

const PHONE = '(max-width: 900px)';
const mq = typeof window !== 'undefined' ? window.matchMedia(PHONE) : null;
const usePhone = () =>
  useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => !!mq?.matches,
  );
const HL = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const sectionTitle = (topic: Topic, i: number) => topic.sections[i]?.heading.split(' — ')[0] ?? `Section ${i + 1}`;
const searchText = (n: Note) => `${n.quote} ${plainText(n.body)} ${(n.sketch ?? []).map((s) => (s.t === 'text' ? s.s : '')).join(' ')}`.toLowerCase();
const noted = (n: Note) => n.body.length > 0 || !!n.sketch;
const currentColor = (): NoteColor => (NOTE_COLORS as readonly string[]).includes(getUiPrefs().notebookColor ?? '') ? (getUiPrefs().notebookColor as NoteColor) : 'amber';

// ---------- text ↔ Range mapping inside one section panel ----------
interface TextMap {
  nodes: Text[];
  starts: number[];
  text: string;
}
function textMap(root: Element): TextMap {
  const m: TextMap = { nodes: [], starts: [], text: '' };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('textarea, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    m.nodes.push(n as Text);
    m.starts.push(m.text.length);
    m.text += (n as Text).data;
  }
  return m;
}
function rangeAt(m: TextMap, start: number, end: number): Range | null {
  const r = document.createRange();
  let started = false;
  for (let k = 0; k < m.nodes.length; k++) {
    const a = m.starts[k];
    const len = m.nodes[k].data.length;
    if (!started && start < a + len) {
      r.setStart(m.nodes[k], start - a);
      started = true;
    }
    if (started && end <= a + len) {
      r.setEnd(m.nodes[k], end - a);
      return r;
    }
  }
  return null;
}
function offsetsOf(m: TextMap, r: Range): [number, number] | null {
  let start = -1;
  let end = -1;
  m.nodes.forEach((n, k) => {
    if (!r.intersectsNode(n)) return;
    if (start < 0) start = m.starts[k] + (n === r.startContainer ? r.startOffset : 0);
    end = m.starts[k] + (n === r.endContainer ? r.endOffset : n.data.length);
  });
  return start < 0 || end <= start ? null : [start, end];
}
const panelOf = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('.tp-panel') ?? null;

/** The topbar's show / hide button (desktop; phones use the floating button). */
export function NotebookToggle({ topicId }: { topicId: string }) {
  const open = useUiPrefs().notebookOpen !== false;
  const count = (useProgress().notes ?? []).filter((n) => n.topicId === topicId).length;
  return (
    <button type="button" className="btn btn-sm nb-toggle" aria-pressed={open} aria-controls="nb-panel" data-guide="notebook-toggle" onClick={() => saveUiPrefs({ notebookOpen: !open })}>
      <NotebookPen size={15} aria-hidden /> Notebook <span className="nb-count">{count}</span>
    </button>
  );
}

export function Notebook({ topic, readRef }: { topic: Topic; readRef: RefObject<HTMLDivElement | null> }) {
  const all = useProgress().notes ?? [];
  const here = all.filter((n) => n.topicId === topic.id);
  const phone = usePhone();
  const deskOpen = useUiPrefs().notebookOpen !== false;
  const [sheet, setSheet] = useState(false);
  const open = phone ? sheet : deskOpen;
  const setOpen = useCallback((v: boolean) => (mq?.matches ? setSheet(v) : saveUiPrefs({ notebookOpen: v })), [setSheet]);

  const [tab, setTab] = useState<'page' | 'all'>('page');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sketching, setSketching] = useState(false);
  const [emoji, setEmoji] = useState<{ rect: DOMRect; pick: (e: string) => void } | null>(null);
  const [bar, setBar] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const [layout, setLayout] = useState<{ pins: { id: string; x: number; y: number }[]; detached: string[] }>({ pins: [], detached: [] });
  const pending = useRef<Range | null>(null);
  const ranges = useRef(new Map<string, Range>());
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hereRef = useRef(here);
  useLayoutEffect(() => {
    hereRef.current = here;
  });

  // ---------- re-find every highlight of this topic and paint it ----------
  const relocate = useCallback(() => {
    const base = rootRef.current?.parentElement;
    if (!base) return;
    const map = new Map<string, Range>();
    const detached: string[] = [];
    const maps = new Map<number, TextMap | null>();
    for (const n of hereRef.current) {
      if (n.section < 0) continue;
      if (!maps.has(n.section)) {
        const el = document.getElementById(`s-${n.section}-panel`);
        // a section shown as Steps has no Read panel: its notes are not drawn, but not detached either
        maps.set(n.section, el?.classList.contains('tp-panel') ? textMap(el) : null);
      }
      const m = maps.get(n.section);
      if (!m) {
        if (!document.getElementById(`s-${n.section}`)) detached.push(n.id);
        continue;
      }
      const at = locate(m.text, n);
      const r = at >= 0 ? rangeAt(m, at, at + n.quote.length) : null;
      if (r) map.set(n.id, r);
      else detached.push(n.id);
    }
    ranges.current = map;
    if (HL) {
      for (const c of NOTE_COLORS) {
        const of = (withNote: boolean) => hereRef.current.filter((n) => n.color === c && noted(n) === withNote && map.has(n.id)).map((n) => map.get(n.id)!);
        CSS.highlights.set(`nb-${c}`, new Highlight(...of(false)));
        CSS.highlights.set(`nb-${c}-n`, new Highlight(...of(true)));
      }
    }
    const b = base.getBoundingClientRect();
    const pins = HL
      ? hereRef.current
          .filter((n) => map.has(n.id) && (noted(n) || n.emojis.length))
          .map((n) => {
            const rects = map.get(n.id)!.getClientRects();
            const r = rects[rects.length - 1];
            return r ? { id: n.id, x: Math.round(r.right - b.left), y: Math.round(r.top - b.top) } : null;
          })
          .filter((p): p is { id: string; x: number; y: number } => !!p)
      : [];
    setLayout((old) => (JSON.stringify(old) === JSON.stringify({ pins, detached }) ? old : { pins, detached }));
  }, []);

  const notesKey = JSON.stringify(here);
  useLayoutEffect(relocate, [relocate, notesKey]);
  useEffect(() => {
    const root = readRef.current;
    if (!root) return;
    let t = 0;
    const soon = () => {
      clearTimeout(t);
      t = window.setTimeout(relocate, 150);
    };
    const mo = new MutationObserver(soon);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    const ro = new ResizeObserver(soon);
    ro.observe(root);
    return () => {
      clearTimeout(t);
      mo.disconnect();
      ro.disconnect();
      if (HL)
        for (const c of NOTE_COLORS) {
          CSS.highlights.delete(`nb-${c}`);
          CSS.highlights.delete(`nb-${c}-n`);
        }
    };
  }, [readRef, relocate]);

  // ---------- selection toolbar ----------
  const checkSelection = useCallback(() => {
    // keyboard users moved into the toolbar (H): keep it even if the selection collapses
    if (barRef.current?.contains(document.activeElement)) return;
    const s = document.getSelection();
    const r = s && s.rangeCount && !s.isCollapsed ? s.getRangeAt(0) : null;
    const panel = r && panelOf(r.startContainer);
    if (!r || !panel || panel !== panelOf(r.endContainer) || !readRef.current?.contains(panel) || s!.toString().trim().length < 2) {
      pending.current = null;
      setBar(null);
      return;
    }
    pending.current = r.cloneRange();
    const rect = r.getBoundingClientRect();
    setBar({ x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom });
  }, [readRef]);

  useEffect(() => {
    let down = false;
    let t = 0;
    const onDown = (e: Event) => {
      if (!barRef.current?.contains(e.target as Node)) down = true;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      setTimeout(checkSelection, 0);
    };
    // touch selection handles and keyboard selection: wait for the selection to settle
    const onChange = () => {
      clearTimeout(t);
      if (!down) t = window.setTimeout(checkSelection, 250);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('selectionchange', onChange);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('selectionchange', onChange);
    };
  }, [checkSelection]);

  useEffect(() => {
    if (!bar) return;
    const onScroll = () => checkSelection();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [bar, checkSelection]);

  // place the toolbar above the selection (below it when there is no room), inside the viewport
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || !bar) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const masthead = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--masthead')) || 64;
    el.style.left = `${Math.max(12, Math.min(window.innerWidth - w - 12, bar.x - w / 2))}px`;
    // touch screens show their own copy / paste menu above a selection, so go below it there
    const below = window.matchMedia('(pointer: coarse)').matches || bar.top - h - 10 < masthead + 8;
    el.style.top = `${below ? Math.min(bar.bottom + 10, window.innerHeight - h - 12) : bar.top - h - 10}px`;
  }, [bar]);

  const flashCard = useCallback((id: string) => {
    setSel(id);
    requestAnimationFrame(() => {
      const card = listRef.current?.querySelector<HTMLElement>(`[data-note="${id}"]`);
      if (!card) return;
      card.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      card.classList.remove('flash');
      void card.offsetWidth;
      card.classList.add('flash');
    });
  }, []);

  const startComposer = useCallback(
    (n: Note | null, sketch = false) => {
      setDraft({ id: n?.id ?? null, text: n ? toMarkup(n.body) : '', sketch: n?.sketch ?? null });
      setSketching(sketch);
      setOpen(true);
      setTab('page');
    },
    [setOpen, setDraft, setSketching, setTab],
  );

  const highlight = useCallback(
    (color: NoteColor, then?: 'note') => {
      const r = pending.current;
      const panel = r && panelOf(r.startContainer);
      const section = panel ? Number(/^s-(\d+)-panel$/.exec(panel.id)?.[1] ?? NaN) : NaN;
      if (!r || !panel || Number.isNaN(section)) return;
      // snap to whole words inside the selected text nodes (never across an element boundary)
      const sc = r.startContainer;
      const ec = r.endContainer;
      if (sc instanceof Text) while (r.startOffset > 0 && /\w/.test(sc.data[r.startOffset - 1]) && /\w/.test(sc.data[r.startOffset] ?? '')) r.setStart(sc, r.startOffset - 1);
      if (ec instanceof Text) while (r.endOffset < ec.length && /\w/.test(ec.data[r.endOffset]) && /\w/.test(ec.data[r.endOffset - 1] ?? '')) r.setEnd(ec, r.endOffset + 1);
      const m = textMap(panel);
      const off = offsetsOf(m, r);
      if (!off) return;
      let [start, end] = off;
      while (start < end && /\s/.test(m.text[start])) start++;
      while (end > start && /\s/.test(m.text[end - 1])) end--;
      const quote = m.text.slice(start, end).slice(0, 1000);
      if (quote.length < 2) return;
      const note: Note = { id: newId(), topicId: topic.id, section, quote, ...contextAt(m.text, start, quote), color, body: [], emojis: [], at: new Date().toISOString() };
      if (!putNote(note)) return void showToast('Your Notebook is full', 'Delete a few old notes to add more.', 5000, 'warn', { kicker: 'Notebook' });
      saveUiPrefs({ notebookColor: color });
      document.getSelection()?.removeAllRanges();
      pending.current = null;
      setBar(null);
      if (then === 'note') startComposer(note);
      flashCard(note.id);
    },
    [topic.id, startComposer, flashCard],
  );

  // keys while the toolbar is up: 1–5 colour, N note, H moves focus into the toolbar, Esc hides it
  useEffect(() => {
    if (!bar) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const k = e.key.toLowerCase();
      const c = NOTE_COLORS[Number(k) - 1];
      if (c) highlight(c);
      else if (k === 'n') highlight(currentColor(), 'note');
      else if (k === 'h') barRef.current?.querySelector('button')?.focus();
      else if (k === 'escape') setBar(null);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bar, highlight]);

  // ---------- click a highlight → its card ----------
  useEffect(() => {
    const root = readRef.current;
    if (!root || !HL) return;
    const onClick = (e: MouseEvent) => {
      if (!document.getSelection()?.isCollapsed) return;
      const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
      const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY);
      const cr = pos ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
      const node = pos?.offsetNode ?? cr?.startContainer;
      const offset = pos?.offset ?? cr?.startOffset ?? 0;
      if (!node) return;
      for (const [id, r] of ranges.current) {
        if (r.isPointInRange(node, offset)) {
          setOpen(true);
          setTab('page');
          flashCard(id);
          return;
        }
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [readRef, setOpen, flashCard]);

  // ---------- card → its highlight ----------
  const showInLesson = (id: string) => {
    setSel(id);
    const r = ranges.current.get(id);
    if (!r) return;
    if (mq?.matches) setSheet(false);
    r.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    if (!HL) return;
    const h = new Highlight(r);
    h.priority = 1;
    CSS.highlights.set('nb-flash', h);
    setTimeout(() => CSS.highlights.get('nb-flash') === h && CSS.highlights.delete('nb-flash'), 1400);
  };

  const del = (n: Note) => {
    removeNote(n.id);
    if (draft?.id === n.id) setDraft(null);
    showToast(n.quote ? 'Highlight removed' : 'Note deleted', n.quote ? `“${n.quote.slice(0, 60)}${n.quote.length > 60 ? '…' : ''}”` : undefined, 5000, 'info', {
      kicker: 'Notebook',
      action: { label: 'Undo', run: () => putNote(n) },
    });
  };

  const save = () => {
    if (!draft) return;
    const body = parseMarkup(draft.text);
    const base = draft.id ? here.find((n) => n.id === draft.id) : null;
    if (!base && !body.length && !draft.sketch?.length) return setDraft(null);
    const note: Note = base ?? { id: newId(), topicId: topic.id, section: -1, quote: '', prefix: '', suffix: '', color: null, body: [], emojis: [], at: new Date().toISOString() };
    const { sketch: _old, ...rest } = note;
    if (!putNote({ ...rest, body, ...(draft.sketch?.length ? { sketch: draft.sketch } : {}) })) return void showToast('Your Notebook is full', 'Delete a few old notes to add more.', 5000, 'warn');
    setDraft(null);
    flashCard(note.id);
  };

  const pickEmoji = (rect: DOMRect, pick: (e: string) => void) => setEmoji({ rect, pick });
  const addEmoji = (n: Note, e: string) => putNote({ ...n, emojis: n.emojis.includes(e) ? n.emojis.filter((x) => x !== e) : [...n.emojis, e].slice(0, 8) });

  const exportMd = () => {
    const list = tab === 'page' ? here : all;
    if (!list.length) return showToast('Nothing to export yet', 'Highlight some text or add a note first.', 3500);
    const title = (id: string) => TOPICS.find((t) => t.id === id)?.title ?? id;
    const name = tab === 'page' ? `${topic.id}-notes.md` : 'ai-learn-notes.md';
    downloadFile(name, notesToMarkdown(list, title, tab === 'page' ? `${topic.title}: my notes` : 'My notes'), 'text/markdown');
    showToast('Notes exported', name, 4000, 'good', { kicker: 'Notebook' });
  };

  // ---------- the list ----------
  const match = (n: Note) => (filter === 'all' || (filter === 'sketch' ? !!n.sketch : n.color === filter)) && (!q || searchText(n).includes(q.toLowerCase()));
  const order = (a: Note, b: Note) => a.section - b.section || a.at.localeCompare(b.at);
  const scope = tab === 'page' ? here : all;
  const count = (f: Filter) => scope.filter((n) => (f === 'all' ? true : f === 'sketch' ? !!n.sketch : n.color === f)).length;
  const detached = new Set(layout.detached);
  const card = (n: Note, other: boolean) => (
    <NoteCard
      key={n.id}
      n={n}
      label={n.section >= 0 ? (other ? `Section ${n.section + 1}` : sectionTitle(topic, n.section)) : ''}
      other={other}
      selected={sel === n.id}
      detached={detached.has(n.id)}
      onShow={() => showInLesson(n.id)}
      onEdit={() => startComposer(n)}
      onDelete={() => del(n)}
      onReact={(rect) => pickEmoji(rect, (e) => addEmoji(n, e))}
      onToggle={(i) => putNote({ ...n, body: n.body.map((b, j) => (j === i ? { ...b, check: !b.check } : b)) })}
    />
  );
  let list: ReactNode;
  if (tab === 'page') {
    const shown = here.filter(match).sort(order);
    list = shown.length ? shown.map((n) => card(n, false)) : <Empty any={here.length > 0} />;
  } else {
    const ids = [topic.id, ...new Set(all.map((n) => n.topicId).filter((id) => id !== topic.id))];
    const groups = ids.map((id) => ({ id, notes: all.filter((n) => n.topicId === id && match(n)).sort(order) })).filter((g) => g.notes.length);
    list = groups.length
      ? groups.map((g) => (
          <section key={g.id} className="nb-group" aria-label={TOPICS.find((t) => t.id === g.id)?.title ?? g.id}>
            <h4 className="nb-group-h">
              {TOPICS.find((t) => t.id === g.id)?.title ?? g.id} · {g.notes.length}
            </h4>
            {g.notes.map((n) => card(n, g.id !== topic.id))}
          </section>
        ))
      : <Empty any={all.length > 0} />;
  }
  const editing = draft?.id ? here.find((n) => n.id === draft.id) : null;

  return (
    <div className="nb-root" ref={rootRef}>
      <aside
        id="nb-panel"
        className={`nb liquid${phone ? ' liquid-dense' : ''}`}
        data-open={open}
        aria-label="Notebook"
        inert={!open}
        data-guide="notebook-panel"
        onKeyDown={(e) => e.key === 'Escape' && phone && !draft && setSheet(false)}
      >
        <div className="nb-in">
          <div className="nb-head">
            <div className="nb-title">
              <NotebookPen size={17} aria-hidden className="nb-title-ico" />
              <h3>Notebook</h3>
              <span className="nb-sp" />
              <button type="button" className="btn-ghost btn-icon btn-sm" aria-label="Export notes as Markdown" title="Export .md" onClick={exportMd}>
                <Download size={16} aria-hidden />
              </button>
              <button type="button" className="btn-ghost btn-icon btn-sm" aria-label="Hide notebook" title="Hide notebook" onClick={() => setOpen(false)}>
                <X size={17} aria-hidden />
              </button>
            </div>
            <p className="nb-hint" data-guide="notebook-highlight">
              <Highlighter size={14} aria-hidden /> <span>Select lesson text to highlight it.</span>
              <span className="nb-kbd-hints">
                <span>
                  <kbd>1</kbd>–<kbd>5</kbd> colour
                </span>{' '}
                ·{' '}
                <span>
                  <kbd>N</kbd> note
                </span>{' '}
                ·{' '}
                <span>
                  <kbd>H</kbd> toolbar
                </span>
              </span>
            </p>
            <div className="nb-tabs" role="tablist" aria-label="Which notes">
              {(['page', 'all'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {t === 'page' ? 'This page' : 'All notes'}
                </button>
              ))}
            </div>
            <label className="nb-search">
              <Search size={15} aria-hidden />
              <span className="sr-only">Search your notes</span>
              <input type="search" value={q} placeholder="Search your notes" onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="nb-chips" role="group" aria-label="Filter by colour">
              {(['all', ...NOTE_COLORS, 'sketch'] as Filter[]).map((f) => (
                <button key={f} type="button" className="nb-chip" data-c={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f !== 'all' && f !== 'sketch' && <i aria-hidden />}
                  {f === 'all' ? 'All' : f === 'sketch' ? 'Sketches' : COLOR_LABEL[f]} <span className="nb-chip-n">{count(f)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="nb-scroll">
          {draft && (
            <Composer
              key={draft.id ?? 'new'}
              draft={draft}
              note={editing ?? null}
              onChange={setDraft}
              onSave={save}
              onCancel={() => setDraft(null)}
              onSketch={() => setSketching(true)}
            />
          )}

          <div className="nb-list" ref={listRef}>
            {list}
          </div>
          </div>
          <div className="nb-foot" data-guide="notebook-sketch">
            <button type="button" className="btn btn-sm" onClick={() => startComposer(null)}>
              <Plus size={15} aria-hidden /> New note
            </button>
            <button type="button" className="btn btn-sm" onClick={() => startComposer(null, true)}>
              <Shapes size={15} aria-hidden /> New sketch
            </button>
          </div>
        </div>
      </aside>

      {HL &&
        layout.pins.map((p) => {
          const n = here.find((x) => x.id === p.id);
          if (!n) return null;
          return (
            <button key={p.id} type="button" className="nb-pin" data-c={n.color} style={{ left: p.x, top: p.y }} aria-label={`Open note on “${n.quote.slice(0, 40)}”`} onClick={() => (setOpen(true), setTab('page'), flashCard(n.id))}>
              {n.emojis.slice(0, 2).join('')}
              {noted(n) && <StickyNote size={11} aria-hidden />}
            </button>
          );
        })}

      {phone && !sheet && (
        <button type="button" className="btn btn-primary nb-fab" data-guide="notebook-toggle" aria-controls="nb-panel" aria-expanded={false} onClick={() => setSheet(true)}>
          <NotebookPen size={16} aria-hidden /> Notes <span className="nb-count">{here.length}</span>
        </button>
      )}

      {bar && (
        <div ref={barRef} className="nb-bar liquid liquid-dense" role="toolbar" aria-label="Highlight selection" onMouseDown={(e) => e.preventDefault()}>
          {NOTE_COLORS.map((c, i) => (
            <button key={c} type="button" data-c={c} aria-label={`Highlight: ${COLOR_LABEL[c]} (${i + 1})`} title={`${COLOR_LABEL[c]} · ${i + 1}`} onClick={() => highlight(c)}>
              <span className="nb-swatch" aria-hidden />
            </button>
          ))}
          <span className="nb-sep" aria-hidden />
          <button type="button" className="nb-bar-note" title="Note · N" onClick={() => highlight(currentColor(), 'note')}>
            <StickyNote size={15} aria-hidden /> Note
          </button>
        </div>
      )}

      {emoji && <EmojiPop rect={emoji.rect} onPick={(e) => (emoji.pick(e), setEmoji(null))} onClose={() => setEmoji(null)} />}

      {sketching && draft && (
        <SketchDialog
          initial={draft.sketch ?? []}
          onClose={() => setSketching(false)}
          onDone={(shapes) => {
            setDraft((d) => d && { ...d, sketch: shapes.length ? shapes : null });
            setSketching(false);
          }}
        />
      )}
    </div>
  );
}

function Empty({ any }: { any: boolean }) {
  return (
    <div className="nb-empty">
      {any ? (
        'Nothing matches.'
      ) : (
        <>
          <Highlighter size={22} aria-hidden />
          <p>Select text in the lesson to highlight it, or add a page note below.</p>
        </>
      )}
    </div>
  );
}

// ---------- a note card ----------
function Body({ body, onToggle }: { body: Block[]; onToggle?: (i: number) => void }) {
  const runs = (b: Block) =>
    b.runs.map((r, j) =>
      r.m === 'b' ? <strong key={j}>{r.t}</strong> : r.m === 'mk' ? <mark key={j} className="nb-mk">{r.t}</mark> : r.m === 'hand' ? <span key={j} className="nb-hand">{r.t}</span> : r.m === 'code' ? <code key={j}>{r.t}</code> : <span key={j}>{r.t}</span>,
    );
  return (
    <div className="nb-body">
      {body.map((b, i) =>
        b.check === undefined ? (
          <p key={i}>{runs(b)}</p>
        ) : (
          <p key={i} className={`nb-check${b.check ? ' done' : ''}`}>
            <button type="button" role="checkbox" aria-checked={b.check} aria-label="Done" disabled={!onToggle} onClick={(e) => (e.stopPropagation(), onToggle?.(i))}>
              {b.check ? '✓' : ''}
            </button>
            <span>{runs(b)}</span>
          </p>
        ),
      )}
    </div>
  );
}

function NoteCard(props: {
  n: Note;
  label: string;
  other: boolean;
  selected: boolean;
  detached: boolean;
  onShow: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (rect: DOMRect) => void;
  onToggle: (i: number) => void;
}) {
  const { n, other } = props;
  const quote = n.quote && <span className="nb-q">{n.quote}</span>;
  return (
    <article className={`nb-card${n.color ? '' : ' nb-page'}${props.selected ? ' sel' : ''}`} data-c={n.color ?? 'blue'} data-note={n.id}>
      <div className="nb-card-top">
        <span className="nb-lbl">{n.color ? COLOR_LABEL[n.color] : 'Page note'}</span>
        {props.label && <span className="nb-sec">§ {props.label}</span>}
        {props.detached && (
          <span className="nb-detached" title="The lesson text changed, so this highlight can no longer be found">
            <Unlink size={11} aria-hidden /> text changed
          </span>
        )}
      </div>
      {other ? (
        <Link className="nb-quote-btn" to={`/topic/${n.topicId}?tab=learn${n.section >= 0 ? `&s=${n.section}` : ''}`}>
          {quote || <span className="muted">Open lesson</span>}
        </Link>
      ) : (
        quote && (
          <button type="button" className="nb-quote-btn" onClick={props.onShow} disabled={props.detached} aria-label={`Show in lesson: ${n.quote.slice(0, 80)}`}>
            {quote}
          </button>
        )
      )}
      {n.body.length > 0 && <Body body={n.body} onToggle={other ? undefined : props.onToggle} />}
      {!n.body.length && !other && n.quote && (
        <button type="button" className="nb-add-thought" onClick={props.onEdit}>
          + Add a thought
        </button>
      )}
      {n.sketch && <Thumb shapes={n.sketch} />}
      <div className="nb-card-foot">
        {n.emojis.map((e) => (
          <span key={e} className="nb-rx">
            {e}
          </span>
        ))}
        {!other && (
          <button type="button" className="nb-rx nb-rx-add" aria-label="Add an emoji" onClick={(e) => props.onReact(e.currentTarget.getBoundingClientRect())}>
            <SmilePlus size={13} aria-hidden />
          </button>
        )}
        <span className="nb-sp" />
        {other ? (
          <span className="nb-open">open lesson →</span>
        ) : (
          <span className="nb-acts">
            <button type="button" className="btn-ghost btn-icon btn-xs" aria-label="Edit note" onClick={props.onEdit}>
              <Pencil size={14} aria-hidden />
            </button>
            <button type="button" className="btn-ghost btn-icon btn-xs" aria-label={n.quote ? 'Delete highlight' : 'Delete note'} onClick={props.onDelete}>
              <Trash2 size={14} aria-hidden />
            </button>
          </span>
        )}
      </div>
    </article>
  );
}

// ---------- composer: a plain textarea with a tiny markup, saved as blocks ----------
const MARKS = [
  { k: 'b', label: 'Bold', icon: Bold, wrap: ['**', '**'] },
  { k: 'mk', label: 'Marker', icon: Highlighter, wrap: ['==', '=='] },
  { k: 'hand', label: 'Handwriting', icon: Signature, wrap: ['~', '~'] },
  { k: 'code', label: 'Code', icon: Code, wrap: ['`', '`'] },
] as const;

function Composer({ draft, note, onChange, onSave, onCancel, onSketch }: { draft: Draft; note: Note | null; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void; onSketch: () => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const edit = (fn: (v: string, a: number, b: number) => [string, number, number]) => {
    const el = ta.current;
    if (!el) return;
    const [v, a, b] = fn(el.value, el.selectionStart, el.selectionEnd);
    onChange({ ...draft, text: v });
    requestAnimationFrame(() => (el.focus(), el.setSelectionRange(a, b)));
  };
  const wrap = (l: string, r: string) => edit((v, a, b) => [v.slice(0, a) + l + (v.slice(a, b) || 'text') + r + v.slice(b), a + l.length, (b > a ? b : a + 4) + l.length]);
  const check = () =>
    edit((v, a, b) => {
      const ls = v.lastIndexOf('\n', a - 1) + 1;
      const on = /^\[( |x)\] /.test(v.slice(ls));
      const d = on ? -4 : 4;
      return [on ? v.slice(0, ls) + v.slice(ls + 4) : `${v.slice(0, ls)}[ ] ${v.slice(ls)}`, Math.max(ls, a + d), Math.max(ls, b + d)];
    });
  return (
    <div className="nb-composer liquid" data-c={note?.color ?? 'blue'}>
      <div className="nb-cq">{note?.quote || 'Page note · not tied to a sentence'}</div>
      <div className="nb-cbar" role="toolbar" aria-label="Formatting">
        {MARKS.map(({ k, label, icon: Icon, wrap: [l, r] }) => (
          <button key={k} type="button" className="btn-ghost btn-icon btn-xs" aria-label={label} title={label} onClick={() => wrap(l, r)}>
            <Icon size={15} aria-hidden />
          </button>
        ))}
        <button type="button" className="btn-ghost btn-icon btn-xs" aria-label="Checklist item" title="Checklist" onClick={check}>
          <SquareCheck size={15} aria-hidden />
        </button>
        <span className="nb-sep" aria-hidden />
        <button type="button" className="btn-ghost btn-xs" onClick={onSketch}>
          <Shapes size={15} aria-hidden /> {draft.sketch ? 'Edit sketch' : 'Add sketch'}
        </button>
      </div>
      <textarea
        ref={ta}
        className="nb-ed"
        autoFocus
        rows={4}
        maxLength={10_000}
        aria-label="Note"
        value={draft.text}
        placeholder={'Write anything… **bold**, ==marker==, ~hand~, `code`, “[ ] ” for a to-do'}
        onChange={(e) => onChange({ ...draft, text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      {draft.sketch && (
        <button type="button" className="nb-csk" aria-label="Edit sketch" onClick={onSketch}>
          <Thumb shapes={draft.sketch} />
        </button>
      )}
      <div className="nb-crow">
        <span className="nb-keys">⌘↵ save · Esc cancel</span>
        <span className="nb-sp" />
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSave}>
          Save note
        </button>
      </div>
    </div>
  );
}

// ---------- emoji popover ----------
function EmojiPop({ rect, onPick, onClose }: { rect: DOMRect; onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  useEffect(() => {
    const out = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [onClose]);
  const below = rect.bottom + 8 + 150 < window.innerHeight;
  return (
    <div
      ref={ref}
      className="nb-emo liquid liquid-dense"
      role="dialog"
      aria-label="Pick an emoji"
      style={{ left: Math.max(12, Math.min(window.innerWidth - 260, rect.left - 100)), ...(below ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }) }}
    >
      <div className="nb-emo-h">Study</div>
      <div className="nb-emo-grid">
        {EMOJI.map((e) => (
          <button key={e} type="button" aria-label={`React ${e}`} onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- sketches: shape list → SVG elements ----------
const ink = (c: Ink) => `var(--nb-${c})`;

function ShapeEl({ s, i }: { s: Shape; i?: number }) {
  const stroke = ink(s.c);
  const style = { stroke, fill: `color-mix(in srgb, ${stroke} 13%, transparent)` };
  const di = i === undefined ? {} : { 'data-i': i };
  if (s.t === 'box') return <rect {...di} className="nb-sk" x={s.x} y={s.y} width={s.w} height={s.h} rx={12} style={style} />;
  if (s.t === 'circle') return <ellipse {...di} className="nb-sk" cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} style={style} />;
  if (s.t === 'db') {
    const ry = Math.min(14, s.h / 4);
    return (
      <g {...di} className="nb-sk" style={style}>
        <path d={`M${s.x},${s.y + ry} v${s.h - 2 * ry} a${s.w / 2},${ry} 0 0 0 ${s.w},0 v${-(s.h - 2 * ry)}`} />
        <ellipse cx={s.x + s.w / 2} cy={s.y + ry} rx={s.w / 2} ry={ry} />
      </g>
    );
  }
  if (s.t === 'arrow') {
    const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const p = (d: number) => `${s.x2 - 13 * Math.cos(a + d)},${s.y2 - 13 * Math.sin(a + d)}`;
    return (
      <g {...di} className="nb-sk" style={{ stroke }}>
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        <path d={`M${p(0.45)} L${s.x2},${s.y2} L${p(-0.45)}`} />
      </g>
    );
  }
  if (s.t === 'pen') {
    const p = s.pts;
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let k = 1; k < p.length - 1; k++) d += ` Q${p[k][0]},${p[k][1]} ${(p[k][0] + p[k + 1][0]) / 2},${(p[k][1] + p[k + 1][1]) / 2}`;
    if (p.length > 1) d += ` L${p[p.length - 1][0]},${p[p.length - 1][1]}`;
    return <path {...di} className="nb-sk" d={d} style={{ stroke }} />;
  }
  if (s.t !== 'text') return null;
  return (
    <text {...di} className="nb-sk-t" x={s.x} y={s.y} style={{ fill: stroke }}>
      {s.s}
    </text>
  );
}

function viewBox(shapes: Shape[]) {
  const pts = shapes.flatMap((s): number[][] =>
    s.t === 'arrow'
      ? [[s.x1, s.y1], [s.x2, s.y2]]
      : s.t === 'pen'
        ? s.pts
        : s.t === 'text'
          ? [[s.x - s.s.length * 5.5, s.y - 14], [s.x + s.s.length * 5.5, s.y + 14]]
          : [[s.x, s.y], [s.x + s.w, s.y + s.h]],
  );
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return `${x0 - 18} ${y0 - 18} ${Math.max(...xs) - x0 + 36} ${Math.max(...ys) - y0 + 36}`;
}

function Thumb({ shapes }: { shapes: Shape[] }) {
  const labels = shapes.flatMap((s) => (s.t === 'text' ? [s.s] : []));
  return (
    <span className="nb-thumb">
      <svg viewBox={viewBox(shapes)} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Sketch${labels.length ? `: ${labels.join(', ')}` : ''}`}>
        {shapes.map((s, i) => (
          <ShapeEl key={i} s={s} />
        ))}
      </svg>
    </span>
  );
}

const TOOLS = [
  { t: 'box', label: 'Box', key: 'b', icon: Square },
  { t: 'db', label: 'Database', key: 'd', icon: Database },
  { t: 'circle', label: 'Circle', key: 'c', icon: Circle },
  { t: 'arrow', label: 'Arrow', key: 'a', icon: MoveUpRight },
  { t: 'text', label: 'Text', key: 't', icon: Type },
  { t: 'pen', label: 'Pen', key: 'p', icon: PenLine },
  { t: 'erase', label: 'Eraser', key: 'e', icon: Eraser },
] as const;
type Tool = (typeof TOOLS)[number]['t'];
type DraftShape = Shape & { ox?: number; oy?: number };
const snap = (v: number) => Math.round(v / 20) * 20;

function SketchDialog({ initial, onDone, onClose }: { initial: Shape[]; onDone: (s: Shape[]) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [shapes, setShapes] = useState<Shape[]>(initial);
  const [tool, setTool] = useState<Tool>('box');
  const [color, setColor] = useState<Ink>('cyan');
  const [drawing, setDrawing] = useState<DraftShape | null>(null);
  const [label, setLabel] = useState<{ x: number; y: number; left: number; top: number } | null>(null);
  useFocusTrap(ref, true, onClose);
  const add = (s: Shape) => setShapes((list) => (list.length < SHAPES_MAX ? [...list, s] : list));
  const pt = (e: RPointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    const [x, y] = pt(e);
    if (tool === 'erase') {
      const i = (e.target as Element).closest('[data-i]')?.getAttribute('data-i');
      if (i != null) setShapes((list) => list.filter((_, j) => j !== Number(i)));
      return;
    }
    if (tool === 'text') {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      setLabel({ x: Math.round(x), y: Math.round(y), left: e.clientX - r.left, top: e.clientY - r.top });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'pen') setDrawing({ t: 'pen', pts: [[Math.round(x), Math.round(y)]], c: color });
    else if (tool === 'arrow') setDrawing({ t: 'arrow', x1: snap(x), y1: snap(y), x2: snap(x), y2: snap(y), c: color });
    else setDrawing({ t: tool, x: snap(x), y: snap(y), w: 0, h: 0, c: color, ox: snap(x), oy: snap(y) });
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drawing;
    if (!d) return;
    const [x, y] = pt(e);
    if (d.t === 'pen') setDrawing({ ...d, pts: [...d.pts, [Math.round(x), Math.round(y)]].slice(0, 2000) as [number, number][] });
    else if (d.t === 'arrow') setDrawing({ ...d, x2: snap(x), y2: snap(y) });
    else if (d.t !== 'text') {
      const sx = snap(x);
      const sy = snap(y);
      setDrawing({ ...d, x: Math.min(d.ox!, sx), y: Math.min(d.oy!, sy), w: Math.abs(sx - d.ox!), h: Math.abs(sy - d.oy!) });
    }
  };
  const up = () => {
    const d = drawing;
    setDrawing(null);
    if (!d) return;
    const ok = d.t === 'pen' ? d.pts.length > 2 : d.t === 'arrow' ? Math.hypot(d.x2 - d.x1, d.y2 - d.y1) >= 20 : d.t !== 'text' && d.w >= 20 && d.h >= 20;
    const { ox: _x, oy: _y, ...shape } = d;
    if (ok) add(shape as Shape);
  };
  const commitLabel = (v: string) => {
    if (label && v.trim()) add({ t: 'text', x: label.x, y: label.y, s: v.trim().slice(0, 80), c: color });
    setLabel(null);
  };
  return (
    <div className="modal-backdrop nb-sk-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="nb-skd liquid"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nb-sk-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return;
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            setShapes((l) => l.slice(0, -1));
            return;
          }
          const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
          if (t && !e.metaKey && !e.ctrlKey && !e.altKey) setTool(t.t);
        }}
      >
        <div className="nb-sk-head">
          <Shapes size={17} aria-hidden className="nb-sk-ico" />
          <h3 id="nb-sk-title">Sketch</h3>
          <span className="nb-keys">snaps to the grid</span>
          <span className="nb-sp" />
          <button type="button" className="btn-ghost btn-icon btn-sm" aria-label="Undo" title="Undo · ⌘Z" onClick={() => setShapes((l) => l.slice(0, -1))} disabled={!shapes.length}>
            <Undo2 size={16} aria-hidden />
          </button>
          <button type="button" className="btn-ghost btn-icon btn-sm" aria-label="Close sketch without saving" onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </div>
        <div className="nb-sk-body">
          <div className="nb-sk-tools" role="toolbar" aria-label="Sketch tools">
            {TOOLS.map(({ t, label: l, key, icon: Icon }) => (
              <button key={t} type="button" className="nb-tool" aria-pressed={tool === t} aria-label={`${l} (${key.toUpperCase()})`} title={`${l} · ${key.toUpperCase()}`} onClick={() => setTool(t)}>
                <Icon size={18} aria-hidden />
                <span aria-hidden>{key.toUpperCase()}</span>
              </button>
            ))}
            <span className="nb-sk-sep" aria-hidden />
            {INKS.filter((c) => c !== 'ink-4').map((c) => (
              <button key={c} type="button" className="nb-ink" style={{ ['--hc' as string]: ink(c) }} aria-pressed={color === c} aria-label={`${c === 'ink' ? 'Text' : c === 'mag' ? 'Magenta' : c[0].toUpperCase() + c.slice(1)} ink`} onClick={() => setColor(c)} />
            ))}
          </div>
          <div className="nb-sk-main">
            <div className={`nb-stage${tool === 'erase' ? ' erase' : ''}`}>
              <svg ref={svg} viewBox="0 0 720 440" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrawing(null)} role="img" aria-label={`Sketch canvas, ${shapes.length} shapes`}>
                {shapes.map((s, i) => (
                  <ShapeEl key={i} s={s} i={i} />
                ))}
                {drawing && <ShapeEl s={drawing as Shape} />}
              </svg>
              {label && (
                <input
                  className="nb-sk-input"
                  autoFocus
                  placeholder="Label"
                  maxLength={80}
                  aria-label="Label text"
                  style={{ left: label.left, top: label.top }}
                  onBlur={(e) => commitLabel(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitLabel(e.currentTarget.value);
                    if (e.key === 'Escape') setLabel(null);
                  }}
                />
              )}
            </div>
            <div className="nb-sk-foot">
              <span className="nb-sk-lab">Start from</span>
              {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((k) => (
                <button key={k} type="button" className="btn btn-sm" onClick={() => setShapes(TEMPLATES[k].shapes)}>
                  {TEMPLATES[k].label}
                </button>
              ))}
              <button type="button" className="btn btn-sm" onClick={() => setShapes([])}>
                Clear
              </button>
              <span className="nb-sp" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onDone(shapes)}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
