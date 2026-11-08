// Prompt Lab (M9): the weak prompt's bad output "streams" in token-sized chunks the first time it scrolls into view,
// so the confident wrong answer feels like a real model's. Capped at 1.6 s, skippable (button or click), once per lab.
// rAF writes textContent (no React state per frame); screen readers get the full text at once.
// Reduced motion: the text is there complete straight away, no caret.
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { typeChunks, typeDelay } from '../lib/motion';
import { getUiPrefs, saveUiPrefs } from '../lib/uiPrefs';

export function TypeReveal({ id, text }: { id: string; text: string }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<'idle' | 'typing' | 'done'>(() => (getUiPrefs().revealedBadOutput?.[id] ? 'done' : 'idle'));
  const pre = useRef<HTMLPreElement>(null);
  const out = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const live = !reduce && state !== 'done';

  useEffect(() => {
    if (!live || state !== 'idle' || !pre.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setState('typing');
      },
      { threshold: 0.3 },
    );
    io.observe(pre.current);
    return () => io.disconnect();
  }, [live, state]);

  useEffect(() => {
    if (state !== 'typing' || !out.current) return;
    const el = out.current;
    saveUiPrefs({ revealedBadOutput: { ...getUiPrefs().revealedBadOutput, [id]: true } });
    const chunks = typeChunks(text);
    const per = typeDelay(chunks.length);
    const t0 = performance.now();
    const tick = (now: number) => {
      const n = Math.min(chunks.length, Math.floor((now - t0) / per));
      el.textContent = chunks.slice(0, n).join('');
      if (n < chunks.length) raf.current = requestAnimationFrame(tick);
      else setState('done');
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [state, id, text]);

  const finish = () => {
    cancelAnimationFrame(raf.current);
    setState('done');
  };

  return (
    <>
      <pre ref={pre} onClick={state === 'typing' ? finish : undefined}>
        <span className="sr-only">{text}</span>
        {live ? (
          // the hidden full text holds the final height, so nothing below jumps while it types
          <span className="type-reveal" aria-hidden>
            <span className="type-ghost">{text}</span>
            <span>
              <span ref={out} />
              <span className="plab-caret" />
            </span>
          </span>
        ) : (
          <span aria-hidden>{text}</span>
        )}
      </pre>
      {state === 'typing' && (
        <button type="button" className="plab-skip" onClick={finish}>
          Skip
        </button>
      )}
    </>
  );
}
