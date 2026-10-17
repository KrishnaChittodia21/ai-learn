import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { dismissToast, useToasts, type ToastTone } from '../lib/toast';

const KICKER: Record<ToastTone, string> = { info: 'Note', good: 'Milestone', warn: 'Heads up', bad: 'Problem' };

/** Bottom-right paper slips (celebrations, notices). Announced politely to screen readers. */
export function Toaster() {
  const toasts = useToasts();
  const reduce = useReducedMotion();
  return (
    <div className="toaster" aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.tone}`}
            layout={!reduce}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : 16 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
          >
            <div className="toast-body">
              <span className="toast-kicker">{KICKER[t.tone]}</span>
              <strong className="toast-title">{t.title}</strong>
              {t.detail && <span className="toast-detail">{t.detail}</span>}
            </div>
            <button type="button" className="btn-ghost btn-icon toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
              <X size={15} aria-hidden />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
