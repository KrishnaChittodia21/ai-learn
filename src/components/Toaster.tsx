import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleAlert, Info, Sparkles, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { dismissToast, useToasts, type ToastTone } from '../lib/toast';

const KICKER: Record<ToastTone, string> = { info: 'Note', good: 'Milestone', warn: 'Heads up', bad: 'Problem' };
const ICON: Record<ToastTone, LucideIcon> = { info: Info, good: Sparkles, warn: TriangleAlert, bad: CircleAlert };

/** Bottom-right glass toasts (celebrations, notices). Announced politely to screen readers. */
export function Toaster() {
  const toasts = useToasts();
  const reduce = useReducedMotion();
  return (
    <div className="toaster" aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              className={`toast toast-${t.tone}`}
              layout={!reduce}
              initial={{ opacity: 0, y: reduce ? 0 : 14, scale: reduce ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: reduce ? 0 : 16 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
            >
              <span className="toast-icon" aria-hidden>
                <Icon size={16} />
              </span>
              <div className="toast-body">
                <span className="toast-kicker">{KICKER[t.tone]}</span>
                <strong className="toast-title">{t.title}</strong>
                {t.detail && <span className="toast-detail">{t.detail}</span>}
              </div>
              <button type="button" className="btn-ghost btn-icon toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
                <X size={15} aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
