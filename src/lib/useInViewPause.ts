// Pause a looping decoration (adds .paused) while it is off-screen or the tab is hidden (M9 pause rule).
import { useEffect, type RefObject } from 'react';

export function useInViewPause(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = true;
    const sync = () => el.classList.toggle('paused', !visible || document.hidden);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener('visibilitychange', sync);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [ref]);
}
