// Browser side of Export: download the backup file and remember when (for the reminder).
import { getProgress } from './progress';
import { saveUiPrefs } from './uiPrefs';
import { showToast } from './toast';
import { backupFileName, exportBackup } from './backup';

/** Download the whole local record as a versioned JSON file. */
export function exportNow() {
  const now = new Date();
  const blob = new Blob([JSON.stringify(exportBackup(getProgress(), now), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  saveUiPrefs({ lastExportAt: now.toISOString() });
  showToast('Backup downloaded', a.download, 4000, 'good', { kicker: 'Export' });
}
