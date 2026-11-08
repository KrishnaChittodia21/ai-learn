// Opt-in 3D (M9, Settings → Appearance → Depth effects): an earned badge tilts towards the pointer (≤ 10°) on a
// spring, with a soft glare. Lazy chunk; fine pointer only; never under reduced motion (the caller checks both).
// The spring-follow pattern matches VengeanceUI src/components/ui/cursor-card.tsx (MIT, © 2025–2026 Ashutoshx7):
// useMotionValue + useSpring, written straight to style (no React state per frame).
import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

const SPRING = { stiffness: 170, damping: 26 };

export default function TiltBadge({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const rx = useSpring(useMotionValue(0), SPRING);
  const ry = useSpring(useMotionValue(0), SPRING);
  const gx = useSpring(useMotionValue(0), SPRING);
  const gy = useSpring(useMotionValue(0), SPRING);
  const glare = useSpring(useMotionValue(0), SPRING);

  useEffect(() => {
    // the whole card is the hit area, so the tilt reads at a glance
    const host = ref.current?.closest<HTMLElement>('.ach-card') ?? ref.current;
    if (!host) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = host.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry.set(px * 20);
      rx.set(-py * 20);
      gx.set(px * 50);
      gy.set(py * 50);
      glare.set(1);
    };
    const leave = () => [rx, ry, gx, gy, glare].forEach((m) => m.set(0));
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    return () => {
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
    };
  }, [rx, ry, gx, gy, glare]);

  return (
    <motion.span ref={ref} className="tilt" style={{ rotateX: rx, rotateY: ry, transformPerspective: 600 }}>
      {children}
      <span className="tilt-glare-clip" aria-hidden>
        <motion.span className="tilt-glare" style={{ x: gx, y: gy, opacity: glare }} />
      </span>
    </motion.span>
  );
}
