// Glossary hover definitions in lessons (C4). The glossary loads with import() on the first lesson that wants it,
// so it stays out of the startup chunk; until then lessons render plain text.
// A marked term is a button: mouse hover (after a short delay), keyboard focus or a tap opens a small popover with
// the one-line definition and a link to the Glossary; Esc, blur or a tap elsewhere closes it.
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildTermIndex, type TermIndex } from '../lib/glossaryMatch';
import type { GlossaryTerm } from '../content/glossary';
import { useUiPrefs } from '../lib/uiPrefs';

interface Loaded {
  index: TermIndex;
  byId: Map<string, GlossaryTerm>;
}
let loaded: Loaded | null = null;
let loading = false;
const listeners = new Set<() => void>();

function load() {
  if (loading) return;
  loading = true;
  import('../content/glossary')
    .then(({ GLOSSARY }) => {
      loaded = { index: buildTermIndex(GLOSSARY), byId: new Map(GLOSSARY.map((t) => [t.id, t])) };
      listeners.forEach((l) => l());
    })
    .catch(() => {
      loading = false; // offline or a stale deploy: lessons stay plain; try again on the next lesson
    });
}

/** the glossary index once loaded (null before, or when hover definitions are off in Settings) */
export function useGlossaryHovers(enabled: boolean): Loaded | null {
  const on = useUiPrefs().glossaryHovers !== false && enabled;
  const data = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => loaded,
  );
  useEffect(() => {
    if (on) load();
  }, [on]);
  return on ? data : null;
}

const POP_W = 300;

export function GlossTerm({ term, children }: { term: GlossaryTerm; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState({ x: 0, up: false });
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const popId = useId();

  const show = () => {
    clearTimeout(timer.current);
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const w = Math.min(POP_W, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.left, window.innerWidth - 16 - w));
      setShift({ x: left - r.left, up: r.bottom > window.innerHeight * 0.68 });
    }
    setOpen(true);
  };
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 160);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      if (wrap.current?.contains(document.activeElement)) btn.current?.focus();
    };
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <span
      className="gl-wrap"
      ref={wrap}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(timer.current);
        if (!open) timer.current = window.setTimeout(show, 350);
      }}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hideSoon()}
      onBlur={(e) => !wrap.current?.contains(e.relatedTarget as Node) && hideSoon()}
    >
      <button
        ref={btn}
        type="button"
        className="gl-term"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`${term.term}: show definition`}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && show()}
        onClick={() => (open ? setOpen(false) : show())}
      >
        {children}
      </button>
      {open && (
        <span id={popId} role="group" aria-label={`${term.term}, glossary`} className={`gl-pop${shift.up ? ' up' : ''}`} style={{ left: shift.x }}>
          <span className="gl-pop-term">{term.term}</span>
          <span className="gl-pop-short">{term.short}</span>
          <Link className="gl-pop-link" to={`/glossary?term=${term.id}`}>
            Glossary <ArrowRight size={13} aria-hidden />
          </Link>
        </span>
      )}
    </span>
  );
}
