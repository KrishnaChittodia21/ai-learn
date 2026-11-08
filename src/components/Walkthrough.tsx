// "Show me": a spotlight walkthrough of the page on screen. The page dims except a cut-out around a real element,
// the cut-out glides from stop to stop (jumps under reduced motion), and a bubble explains it. Stops whose element
// is not on screen are skipped. Ported from system-design's Walkthrough; look from new-features/guide-me.html.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass, X } from 'lucide-react';
import { endWalk } from '../lib/guide';
import { GUIDES, type GuideId, type GuideStop } from '../lib/pageGuides';
import { markGuideSeen } from '../lib/uiPrefs';
import { useFocusTrap } from '../lib/useFocusTrap';
import { showToast } from '../lib/toast';

const PAD = 8;
const GAP = 16;
const PHONE = 600;

/** first matching element that is laid out (hidden layout variants are skipped) */
function find(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Return focus to the "?" (or the phone's More button) when the walkthrough ends. */
function focusLauncher() {
  requestAnimationFrame(() => (find('.masthead .guide-btn') ?? find('.masthead .menu-toggle'))?.focus());
}

export default function Walkthrough({ id }: { id: GuideId }) {
  const guide = GUIDES[id];
  // resolved once the page has rendered (a guide can start right after a route change)
  const [stops, setStops] = useState<GuideStop[] | null>(null);
  const [i, setI] = useState(0);
  const hole = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  const close = useCallback(
    (done: boolean) => {
      markGuideSeen(id);
      endWalk();
      focusLauncher();
      if (done) showToast(`That’s ${guide.title}`, 'Press ? to see it again.', 3500, 'good', { kicker: 'Guide' });
    },
    [id, guide.title],
  );
  const skip = useCallback(() => close(false), [close]);
  useFocusTrap(bubble, !!stops?.length, skip);

  useEffect(() => {
    const t = setTimeout(() => {
      const found = guide.stops.filter((s) => find(s.target));
      if (!found.length) {
        markGuideSeen(id);
        endWalk();
        showToast('Nothing to point at here yet', 'This guide’s parts are not on screen.', 3500, 'info', { kicker: 'Guide' });
      } else setStops(found);
    }, 120);
    return () => clearTimeout(t);
  }, [guide, id]);

  const stop = stops?.[i];

  /** put the cut-out on the target and the bubble beside it (docked to an edge on phones) */
  const place = useCallback(() => {
    const el = stop && find(stop.target);
    const h = hole.current;
    const b = bubble.current;
    if (!el || !h || !b) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    Object.assign(h.style, { top: `${r.top - PAD}px`, left: `${r.left - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` });
    const bh = b.offsetHeight;
    const bw = b.offsetWidth;
    let top: number;
    let left: number;
    if (vw <= PHONE) {
      top = r.top + r.height / 2 > vh / 2 ? 12 : vh - bh - 12;
      left = 12;
    } else {
      top = r.bottom + PAD + GAP + bh < vh - 12 ? r.bottom + PAD + GAP : r.top - PAD - GAP - bh > 12 ? r.top - PAD - GAP - bh : Math.max(12, vh - bh - 12);
      left = Math.min(Math.max(16, r.left), vw - bw - 16);
    }
    Object.assign(b.style, { top: `${top}px`, left: `${left}px` });
  }, [stop]);

  // bring each stop into view, then follow it while the page scrolls or resizes
  useLayoutEffect(() => {
    const el = stop && find(stop.target);
    if (!el) return;
    const instant = first.current || reduced();
    if (first.current && hole.current && bubble.current) {
      hole.current.style.transition = 'none';
      bubble.current.style.transition = 'none';
    }
    const r = el.getBoundingClientRect();
    const phone = window.innerWidth <= PHONE;
    const top = phone || r.height > window.innerHeight * 0.6 ? window.scrollY + r.top - 84 : window.scrollY + r.top - (window.innerHeight - r.height) / 2;
    window.scrollTo({ top: Math.max(0, top), behavior: instant ? 'auto' : 'smooth' });
    place();
    if (first.current) {
      void hole.current?.offsetWidth;
      if (hole.current) hole.current.style.transition = '';
      if (bubble.current) bubble.current.style.transition = '';
      first.current = false;
    }
    bubble.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', onMove, { passive: true, capture: true });
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [stop, place]);

  if (!stops || !stop) return null;
  const last = i === stops.length - 1;
  const next = () => (last ? close(true) : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
    }
  };

  return (
    <div className="walk" onKeyDown={onKey}>
      {/* blocks clicks on the page while the walkthrough runs */}
      <div className="walk-shield" aria-hidden onMouseDown={(e) => e.preventDefault()} />
      <div ref={hole} className="walk-hole" aria-hidden />
      <div ref={bubble} className="walk-bubble" role="dialog" aria-modal="true" aria-labelledby="wb-t" aria-describedby="wb-p" tabIndex={-1}>
        <div className="wb-top">
          <span className="eyebrow">
            <Compass size={14} aria-hidden /> Guide · {guide.title}
          </span>
          <span className="row gap-s">
            <span className="wb-n">
              {i + 1} / {stops.length}
            </span>
            <button type="button" className="btn-ghost btn-icon btn-xs wb-x" aria-label="End the walkthrough" onClick={skip}>
              <X size={15} aria-hidden />
            </button>
          </span>
        </div>
        <h3 id="wb-t">{stop.title}</h3>
        <p id="wb-p">{stop.text}</p>
        <div className="wb-meter" aria-hidden>
          {stops.map((s, j) => (
            <i key={s.id} className={j <= i ? 'on' : ''} />
          ))}
        </div>
        <div className="wb-foot">
          <button type="button" className="btn-ghost btn-sm" onClick={skip}>
            Skip
          </button>
          <span className="grow" />
          <button type="button" className="btn btn-sm btn-icon" onClick={back} disabled={i === 0} aria-label="Previous step">
            <ArrowLeft size={15} aria-hidden />
          </button>
          <button type="button" className="btn btn-sm btn-primary" data-autofocus onClick={next}>
            {last ? (
              <>
                Done <Check size={15} aria-hidden />
              </>
            ) : (
              <>
                Next <ArrowRight size={15} aria-hidden />
              </>
            )}
          </button>
        </div>
        <div className="wb-keys" aria-hidden>
          <span>
            <kbd>←</kbd>
            <kbd>→</kbd> move
          </span>
          <span>
            <kbd>Esc</kbd> end
          </span>
        </div>
      </div>
      <div className="sr-only" aria-live="polite">
        {`Step ${i + 1} of ${stops.length}: ${stop.title}`}
      </div>
    </div>
  );
}
