// "Ready to watch" (M9): the open, unwatched Shorts (Short of the day first, at most 8).
// Phone: a stacked swipe deck (1:1 drag, fling past 110 px or 0.11 px/ms, spring snap-back).
// Desktop: a perspective row (rotateY step, smaller inactive cards, dots). The library grid below stays for scanning.
// Ported from VengeanceUI (MIT, © 2025–2026 Ashutoshx7): src/components/ui/perspective-carousel.tsx (row: rotateY
// step, inactive scale, dots; Tailwind → shorts.css) and verse-cards.tsx (deck idea; GSAP → pointer events + CSS
// transitions). Reduced motion: buttons and keys still work; cards cross-fade, no rotate, tilt or fling.
import { useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ShortThumb } from './ShortThumb';
import { deckRelease } from '../lib/motion';
import type { ShortEntry } from '../lib/shorts';

const PHONE = '(max-width: 720px)';
const subscribe = (fn: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
};
const isPhone = () => window.matchMedia(PHONE).matches;

export function ShortsQueue({ queue }: { queue: ShortEntry[] }) {
  const phone = useSyncExternalStore(subscribe, isPhone);
  const reduce = !!useReducedMotion();
  if (queue.length < 2) return null;
  return (
    <section className="sq" aria-labelledby="sq-title">
      <h2 id="sq-title" className="sq-title">
        Ready to watch <span className="cnt">{queue.length}</span>
      </h2>
      {phone ? <Deck queue={queue} reduce={reduce} /> : <Row queue={queue} reduce={reduce} />}
    </section>
  );
}

const arrows = (e: KeyboardEvent, go: (dir: 1 | -1) => void) => {
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
  else return;
  e.preventDefault();
};

function Deck({ queue, reduce }: { queue: ShortEntry[]; reduce: boolean }) {
  const n = queue.length;
  const [front, setFront] = useState(0);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const drag = useRef<{ id: number; x0: number; dx: number; hist: [number, number][] } | null>(null);
  const dragged = useRef(false);
  const flinging = useRef(false);
  const rest = (k: number) => (reduce ? 'none' : `translateY(${k * 14}px) scale(${1 - k * 0.05})`);

  const advance = (dir: 1 | -1) => {
    if (flinging.current) return;
    const el = cards.current[front];
    const next = (front + (dir > 0 ? 1 : n - 1)) % n;
    if (reduce || !el) return setFront(next);
    flinging.current = true;
    el.classList.add('fling');
    el.style.transform = `translateX(${-dir * 130}%) rotate(${-dir * 14}deg)`;
    el.style.opacity = '0';
    window.setTimeout(() => {
      el.classList.remove('fling');
      flinging.current = false;
      setFront(next);
    }, 280);
  };

  const down = (e: PointerEvent<HTMLDivElement>, i: number) => {
    if (i !== front || drag.current || flinging.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone (or synthetic): the drag still works while it stays over the card
    }
    drag.current = { id: e.pointerId, x0: e.clientX, dx: 0, hist: [[e.clientX, e.timeStamp]] };
    dragged.current = false;
    e.currentTarget.classList.add('dragging');
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.dx = e.clientX - d.x0;
    d.hist = [...d.hist, [e.clientX, e.timeStamp] as [number, number]].filter(([, t]) => e.timeStamp - t < 80);
    if (Math.abs(d.dx) >= 6) dragged.current = true;
    if (!reduce) e.currentTarget.style.transform = `translateX(${d.dx}px) rotate(${d.dx * 0.05}deg)`;
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const el = e.currentTarget;
    el.classList.remove('dragging');
    const [x1, t1] = d.hist[0];
    const act = deckRelease(d.dx, Math.abs(e.clientX - x1) / Math.max(1, e.timeStamp - t1));
    if (act === 'next') return advance(1);
    if (act === 'prev') return advance(-1);
    if (act === 'tap') return;
    el.classList.add('settle');
    el.style.transform = rest(0);
    window.setTimeout(() => el.classList.remove('settle'), 450);
  };

  return (
    <div className="sq-deck-wrap">
      <div
        className={`sq-deck${reduce ? ' rm' : ''}`}
        role="region"
        aria-roledescription="carousel"
        aria-label="Ready to watch: swipe or use the arrow keys"
        tabIndex={0}
        onKeyDown={(e) => e.target === e.currentTarget && arrows(e, advance)}
        onDragStart={(e) => e.preventDefault()}
      >
        {queue.map((e, i) => {
          const k = (i - front + n) % n; // 0 = front
          const style: CSSProperties = {
            zIndex: n - k,
            opacity: k > 2 || (reduce && k) ? 0 : 1 - k * 0.22,
            transform: rest(k),
          };
          return (
            <div
              key={e.short.id}
              ref={(el) => {
                cards.current[i] = el;
              }}
              className="sq-card"
              style={style}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}`}
              aria-hidden={k !== 0}
              inert={k !== 0}
              onPointerDown={(ev) => down(ev, i)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onClickCapture={(ev) => {
                // a drag must not open the Short
                if (dragged.current) ev.preventDefault();
                dragged.current = false;
              }}
            >
              <ShortThumb entry={e} />
            </div>
          );
        })}
      </div>
      <div className="sq-ctl">
        <button type="button" className="btn btn-sm btn-icon" onClick={() => advance(-1)} aria-label="Previous Short">
          <ChevronLeft size={16} aria-hidden />
        </button>
        <span className="sq-count" aria-live="polite">
          {front + 1} of {n}
        </span>
        <button type="button" className="btn btn-sm btn-icon" onClick={() => advance(1)} aria-label="Next Short">
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Row({ queue, reduce }: { queue: ShortEntry[]; reduce: boolean }) {
  const [cur, setCur] = useState(0);
  const go = (i: number) => setCur(Math.max(0, Math.min(queue.length - 1, i)));
  return (
    <div className="sq-row-wrap">
      <div
        className={`sq-row${reduce ? ' rm' : ''}`}
        role="region"
        aria-roledescription="carousel"
        aria-label="Ready to watch: use the arrow keys or the dots"
        tabIndex={0}
        onKeyDown={(e) => arrows(e, (dir) => go(cur + dir))}
      >
        {queue.map((e, i) => {
          const d = i - cur;
          const far = Math.abs(d) > 2;
          const style: CSSProperties = {
            zIndex: 10 - Math.abs(d),
            opacity: far ? 0 : reduce ? (d ? 0.35 : 1) : 1 - Math.abs(d) * 0.25,
            transform: reduce ? `translateX(${d * 170}px)` : `translateX(${d * 170}px) rotateY(${-d * 28}deg) scale(${d ? 0.86 : 1})`,
            pointerEvents: far ? 'none' : undefined,
          };
          return (
            <div key={e.short.id} className="sq-card" style={style} aria-hidden={d !== 0}>
              <div inert={d !== 0}>
                <ShortThumb entry={e} />
              </div>
              {/* a side card steps the row; only the centre card opens its Short (dots and arrow keys do the same) */}
              {d !== 0 && <button type="button" className="sq-step" tabIndex={-1} aria-hidden onClick={() => go(i)} />}
            </div>
          );
        })}
      </div>
      <div className="sq-dots" role="group" aria-label="Choose a Short">
        {queue.map((e, i) => (
          <button key={e.short.id} type="button" aria-label={`Show ${e.short.title}`} aria-current={i === cur || undefined} onClick={() => go(i)} />
        ))}
      </div>
    </div>
  );
}
