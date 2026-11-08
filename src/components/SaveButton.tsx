import { useState } from 'react';
import { Star } from 'lucide-react';
import { isSaved, removeSaved, restoreSaved, saveItem, SAVED_MAX, useProgress, type SavedKind } from '../lib/progress';
import { showToast } from '../lib/toast';

const FULL = `Saved is full (${SAVED_MAX}). Clear done items on the Saved page.`;

/**
 * ☆ Save for later: puts this item on the Saved page. A labelled pill on headers, an icon-only star on dense
 * cards (`compact`). Saving and removing both offer Undo in a toast.
 */
export function SaveButton({ kind, refId, topicId, title, compact = false }: { kind: SavedKind; refId: string; topicId: string; title: string; compact?: boolean }) {
  const p = useProgress();
  const on = isSaved(p, kind, refId);
  const list = p.saved ?? [];
  const full = !on && list.length >= SAVED_MAX && !list.some((s) => s.doneAt);
  const [pop, setPop] = useState(false);

  const click = () => {
    if (full) {
      showToast('Saved is full', FULL, 5000, 'warn');
      return;
    }
    if (on) {
      const item = removeSaved(kind, refId);
      if (item) showToast(title, undefined, 5000, 'info', { kicker: 'Removed from Saved', action: { label: 'Undo', run: () => restoreSaved(item) } });
      return;
    }
    if (!saveItem(kind, refId, topicId)) {
      showToast('Saved is full', FULL, 5000, 'warn');
      return;
    }
    setPop(true);
    showToast(title, 'Find it under ☆ Saved.', 5000, 'good', { kicker: 'Saved for later', action: { label: 'Undo', run: () => removeSaved(kind, refId) } });
  };

  return (
    <button
      type="button"
      className={`save-btn${compact ? ' icon' : ''}${pop ? ' pop' : ''}`}
      aria-pressed={on}
      aria-disabled={full || undefined}
      aria-label={`Save for later: ${title}`}
      title={full ? FULL : on ? 'Remove from Saved' : 'Save for later'}
      data-save={kind}
      onClick={click}
      onAnimationEnd={() => setPop(false)}
    >
      <Star size={compact ? 17 : 15} aria-hidden />
      {!compact && <span>{on ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
