// One heading reveal per page, first view per session (M9): words slide up out of a line mask.
// Ported from VengeanceUI src/components/ui/staggerText.tsx (MIT, © 2025–2026 Ashutoshx7): framer-motion
// variants → plain CSS keyframes (transform only, translateY(105%)), Tailwind → base.css.
// Reduced motion: the whole heading fades in over 150 ms (base.css).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { firstThisSession } from '../lib/motion';

const session = () => {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

/** Renders the gradient text of a page title; animates it only on the first view of this page this session. */
export function HeadingReveal({ text }: { text: string }) {
  const { pathname } = useLocation();
  const key = `hr:${pathname}`;
  const [play, setPlay] = useState(() => firstThisSession(key, session(), false));
  useEffect(() => void firstThisSession(key, session()), [key]);
  const ref = useRef<HTMLSpanElement>(null);
  const words = text.split(' ');

  // one continuous gradient across the words: size and place each word's background against the whole heading
  useLayoutEffect(() => {
    const box = ref.current;
    if (!play || !box) return;
    const r = box.getBoundingClientRect();
    box.querySelectorAll<HTMLElement>('.hr-word > span').forEach((s) => {
      const b = s.getBoundingClientRect();
      s.style.backgroundSize = `${r.width}px ${r.height}px`;
      s.style.backgroundPosition = `${r.left - b.left}px ${r.top - b.top}px`;
    });
    const t = window.setTimeout(() => setPlay(false), 600 + words.length * 40);
    return () => clearTimeout(t);
  }, [play, words.length]);

  if (!play) return <span className="gtext still">{text}</span>;
  return (
    <span className="hr" ref={ref}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={i} aria-hidden>
          {i > 0 && ' '}
          <span className="hr-word">
            <span className="gtext still" style={{ ['--w' as string]: i }}>
              {w}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
