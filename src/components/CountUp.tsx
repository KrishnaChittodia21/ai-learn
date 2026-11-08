import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { ease } from '../lib/motion';

/**
 * A number that counts from `from` to its value (instantly under reduced motion or when nothing changed).
 * `duration` is the first count; later value changes use `then` (default: the same). Writes textContent, no state.
 */
export function CountUp({ value, suffix = '', from = 0, duration = 0.8, then }: { value: number; suffix?: string; from?: number; duration?: number; then?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(from);
  const counted = useRef(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const d = counted.current ? (then ?? duration) : duration;
    if (reduce || shown.current === value || !d) {
      shown.current = value;
      el.textContent = `${value}${suffix}`;
      return;
    }
    const controls = animate(shown.current, value, {
      duration: d,
      ease: ease.out,
      onUpdate: (v) => {
        counted.current = true;
        shown.current = v;
        el.textContent = `${Math.round(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [value, suffix, reduce, duration, then]);
  return (
    <span ref={ref} aria-label={`${value}${suffix}`}>
      {reduce ? value : from}
      {suffix}
    </span>
  );
}
