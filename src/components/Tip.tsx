// Header-icon tooltip (M9). Mouse: 500 ms before the first one, then instant while another opened < 400 ms ago.
// Keyboard focus shows at once; Esc hides. Touch never shows one (labels live in the More sheet).
// Spread `host` on the control (it keeps its aria-label) and render `tip` inside it; the tip is visual only.
import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';

type Mode = false | 'fade' | 'instant';
let openTip: ((m: Mode) => void) | null = null; // the setter of the tip on screen (one at a time)
let lastClose = -1e9;

export function useTip(label: string, opts: { kbd?: string; end?: boolean } = {}) {
  const [on, setOn] = useState<Mode>(false);
  const timer = useRef(0);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOn(false);
    if (openTip === setOn) {
      openTip = null;
      lastClose = performance.now();
    }
  }, []);
  const show = (instant: boolean) => {
    if (openTip && openTip !== setOn) openTip(false);
    openTip = setOn;
    setOn(instant ? 'instant' : 'fade');
  };

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, hide]);
  useEffect(() => hide, [hide]);

  const host = {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer.current);
      if (openTip || performance.now() - lastClose < 400) show(true);
      else timer.current = window.setTimeout(() => show(false), 500);
    },
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocus: (e: FocusEvent) => e.currentTarget.matches(':focus-visible') && show(true),
    onBlur: hide,
  };
  const tip = (
    <span className={`tip${opts.end ? ' end' : ''}${on ? ' on' : ''}${on === 'instant' ? ' instant' : ''}`} aria-hidden>
      {label}
      {opts.kbd && <kbd>{opts.kbd}</kbd>}
    </span>
  );
  return { host, tip };
}
