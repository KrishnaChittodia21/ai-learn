// Celebrations: a "milestone" toast plus one small, restrained burst of sparks in the aurora palette
// (nebula, pulsar, ion, solar; lazy-loaded, skipped for reduced motion).
import { showToast } from './toast';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolve a CSS colour token (which may use light-dark()) to #rrggbb for canvas-confetti. */
export function tokenHex(token: string): string | null {
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
      const colors = ['--c-nebula', '--c-pulsar', '--c-ion', '--c-solar'].map(tokenHex).filter((c): c is string => !!c);
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
        shapes: ['circle', 'square'],
        origin: narrow ? { x: 0.5, y: 0.8 } : { x: 0.86, y: 0.8 },
        colors: colors.length ? colors : undefined,
        disableForReducedMotion: true,
      });
    })
    .catch(() => {
      // confetti chunk failed to load (offline): the slip is enough
    });
}

/**
 * Achievement unlock: a fuller aurora burst from the middle of the screen (where the unlock dialog
 * sits) plus two side plumes, in the aurora palette and the earned tiers' glow. Skipped for reduced
 * motion. `big` (several badges at once) adds more sparks, never more bursts.
 */
export function achievementBurst(extraTokens: string[] = [], big = false) {
  if (reducedMotion()) return;
  import('canvas-confetti')
    .then(({ default: confetti }) => {
      const colors = ['--c-nebula', '--c-pulsar', '--c-ion', '--c-solar', ...extraTokens].map(tokenHex).filter((c): c is string => !!c);
      const opts = { colors: colors.length ? colors : undefined, disableForReducedMotion: true, zIndex: 80, scalar: 0.85, shapes: ['circle' as const, 'square' as const] };
      confetti({ ...opts, particleCount: big ? 110 : 80, spread: 74, startVelocity: 40, gravity: 1.05, ticks: 170, origin: { x: 0.5, y: 0.42 } });
      setTimeout(() => {
        confetti({ ...opts, particleCount: big ? 50 : 34, angle: 60, spread: 52, startVelocity: 46, origin: { x: 0, y: 0.72 } });
        confetti({ ...opts, particleCount: big ? 50 : 34, angle: 120, spread: 52, startVelocity: 46, origin: { x: 1, y: 0.72 } });
      }, 180);
    })
    .catch(() => {
      // confetti is decoration; the dialog already says it
    });
}
