// "Ready to watch": the unwatched Shorts (Short of the day first, at most 8) as a perspective row you scroll.
// The row scrolls natively (touch swipe, trackpad, arrow keys when focused) and a mouse can drag it; every frame,
// each card turns and shrinks by its distance from the centre, so the centre card faces you and the rest angle away.
// No buttons. Reduced motion: cards only fade with distance, no rotation or scaling.
import { useEffect, useRef, type PointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { ShortThumb } from './ShortThumb';
import type { ShortEntry } from '../lib/shorts';

export function ShortsQueue({ queue }: { queue: ShortEntry[] }) {
  const reduce = !!useReducedMotion();
  const strip = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  // the perspective: card distance from the centre (in cards) → angle, size, fade
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const box = el.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      for (const li of el.children as HTMLCollectionOf<HTMLElement>) {
        const r = li.getBoundingClientRect();
        const d = (r.left + r.width / 2 - mid) / r.width;
        const a = Math.min(Math.abs(d), 2.5);
        li.style.opacity = String(1 - a * 0.22);
        li.style.zIndex = String(10 - Math.round(a));
        li.style.transform = reduce ? '' : `rotateY(${Math.max(-1, Math.min(1, d)) * -28}deg) scale(${1 - Math.min(a, 1) * 0.14})`;
      }
    };
    const schedule = () => (raf ||= requestAnimationFrame(paint));
    paint();
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', schedule);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduce, queue.length]);

  // mouse drag scrolls the row (touch and trackpads already scroll natively); a drag never opens a Short
  const down = (e: PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
  };
  const move = (e: PointerEvent<HTMLUListElement>) => {
    const g = drag.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    if (!g.moved && Math.abs(dx) > 5) {
      g.moved = true;
      e.currentTarget.classList.add('dragging');
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (g.moved) e.currentTarget.scrollLeft = g.left - dx;
  };
  const up = (e: PointerEvent<HTMLUListElement>) => {
    const g = drag.current;
    drag.current = null;
    if (!g?.moved) return;
    e.currentTarget.classList.remove('dragging');
    // swallow the click that ends a drag
    e.currentTarget.addEventListener('click', (c) => c.preventDefault(), { capture: true, once: true });
  };

  if (queue.length < 2) return null;
  return (
    <section className="sq" aria-labelledby="sq-title">
      <h2 id="sq-title" className="sq-title">
        Ready to watch <span className="cnt">{queue.length}</span>
      </h2>
      <ul
        className="sq-strip"
        ref={strip}
        tabIndex={0}
        aria-label="Ready to watch: scroll or swipe sideways"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {queue.map((e) => (
          <li key={e.short.id}>
            <ShortThumb entry={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}
