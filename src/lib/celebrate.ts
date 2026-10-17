// Celebrations: a "milestone" slip in the toaster plus one small, restrained burst of paper squares in the
// manual's own inks (lazy-loaded, skipped for reduced motion).
import { showToast } from './toast';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolve a CSS colour token (which may use light-dark()) to #rrggbb for canvas-confetti. */
function tokenHex(token: string): string | null {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return `#${m
    .slice(0, 3)
    .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function celebrate(title: string, detail?: string) {
  showToast(title, detail, 4500, 'good');
  if (reducedMotion()) return;
  import('canvas-confetti')
    .then(({ default: confetti }) => {
      const colors = ['--text', '--accent', '--good', '--border'].map(tokenHex).filter((c): c is string => !!c);
      const narrow = window.innerWidth < 600;
      // one short burst rising from the toaster corner: a stamp, not a party
      confetti({
        particleCount: 34,
        angle: narrow ? 90 : 115,
        spread: 48,
        startVelocity: 30,
        gravity: 1.15,
        decay: 0.9,
        ticks: 130,
        scalar: 0.75,
        shapes: ['square'],
        origin: narrow ? { x: 0.5, y: 0.8 } : { x: 0.86, y: 0.8 },
        colors: colors.length ? colors : undefined,
        disableForReducedMotion: true,
      });
    })
    .catch(() => {
      // confetti chunk failed to load (offline): the slip is enough
    });
}
