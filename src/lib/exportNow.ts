// Browser side of Export: download the backup file and remember when (for the reminder).
import { getProgress } from './progress';
import { saveUiPrefs } from './uiPrefs';
import { showToast } from './toast';
import { backupFileName, exportBackup } from './backup';

/** Save `text` as a file download (also used by the Notebook's Markdown export). */
export function downloadFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download the whole local record as a versioned JSON file. */
export function exportNow() {
  const now = new Date();
  const name = backupFileName(now);
  downloadFile(name, JSON.stringify(exportBackup(getProgress(), now), null, 2), 'application/json');
  saveUiPrefs({ lastExportAt: now.toISOString() });
  showToast('Backup downloaded', name, 4000, 'good', { kicker: 'Export' });
}
