// Tiny toast store: the <Toaster> in the layout renders whatever is queued here.
import { useSyncExternalStore } from 'react';

/** Semantic tone: drives the slip's left rule and kicker ("good" = a milestone). */
export type ToastTone = 'info' | 'good' | 'warn' | 'bad';

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone: ToastTone;
  /** overrides the tone's kicker, e.g. "Saved for later" */
  kicker?: string;
  /** one inline action, e.g. Undo (runs, then closes the toast) */
  action?: { label: string; run: () => void };
}

export interface ToastOptions {
  kicker?: string;
  action?: Toast['action'];
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(title: string, detail?: string, ms = 3000, tone: ToastTone = 'info', opts: ToastOptions = {}) {
  const t: Toast = { id: nextId++, title, detail, tone, ...opts };
  toasts = [...toasts, t].slice(-3);
  emit();
  setTimeout(() => dismissToast(t.id), ms);
}

export function dismissToast(id: number) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toasts,
  );
}
