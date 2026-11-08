import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Compass, Database, Download, HardDriveDownload, Palette, Target, Timer, Upload } from 'lucide-react';
import { getProgress, replaceProgress, resetProgress, setSettings, useProgress, type Accent, type Progress, type Settings } from '../lib/progress';
import { saveUiPrefs, useUiPrefs } from '../lib/uiPrefs';
import { openTour } from '../lib/guide';
import { MAX_FILE_BYTES, mergeProgress, parseBackup, summarize, type BackupSummary } from '../lib/backup';
import { exportNow } from '../lib/exportNow';
import { showToast } from '../lib/toast';

// stored ids stay vermilion/pine/ink/plum so saved settings keep working; the names follow Neural Aurora
const ACCENTS: { id: Accent; label: string }[] = [
  { id: 'vermilion', label: 'Aurora' },
  { id: 'pine', label: 'Ion' },
  { id: 'ink', label: 'Indigo' },
  { id: 'plum', label: 'Pulsar' },
];
const THEMES: [Settings['theme'], string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];
// The page shows one category at a time; ?tab=<id> keeps the choice in the URL (and makes it linkable)
const CATEGORIES = [
  { id: 'study', label: 'Study', hint: 'Exams, study lock, mock interviews', icon: Timer },
  { id: 'appearance', label: 'Appearance', hint: 'Theme, colour, effects', icon: Palette },
  { id: 'guide', label: 'Guide & help', hint: 'Tips, glossary, the tour', icon: Compass },
  { id: 'data', label: 'Data & backup', hint: 'Export, import, reset', icon: Database },
] as const;
type CategoryId = (typeof CATEGORIES)[number]['id'];

const LOCKS: [Settings['studyLock'], string][] = [
  ['off', 'Off'],
  ['exam', 'Lock exam'],
  ['exam-interview', 'Lock exam + interview Qs'],
];

/** One line of the sheet: the label and its explanation on the left, the control on the right. */
function Row({ label, htmlFor, labelId, help, children }: { label: string; htmlFor?: string; labelId?: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        {htmlFor ? (
          <label htmlFor={htmlFor} id={labelId}>
            {label}
          </label>
        ) : (
          <span id={labelId}>{label}</span>
        )}
        {help && <p className="set-help">{help}</p>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Group({ id, title, icon, children, danger, guide }: { id: string; title: string; icon: ReactNode; children: ReactNode; danger?: boolean; guide?: string }) {
  return (
    <section className={`set-group ${danger ? 'danger' : ''}`} aria-labelledby={`set-${id}`} data-guide={guide}>
      <h2 id={`set-${id}`} className="set-group-title">
        <span className="set-group-icon" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      <div className="set-rows">{children}</div>
    </section>
  );
}

/** Mutually exclusive options as a row of pressed/unpressed buttons. */
function Segmented<T extends string>({ labelledBy, value, options, onChange }: { labelledBy: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="set-seg" role="group" aria-labelledby={labelledBy}>
      {options.map(([v, label]) => (
        <button key={v} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const p = useProgress();
  const s = p.settings;
  const prefs = useUiPrefs();
  const tipsOn = prefs.coachTips !== false;
  const dismissed = Object.keys(prefs.dismissedTips ?? {}).length;
  const accent = ACCENTS.some((x) => x.id === s.accent) ? s.accent : 'vermilion';
  const [params, setParams] = useSearchParams();
  const tab: CategoryId = CATEGORIES.find((c) => c.id === params.get('tab'))?.id ?? 'study';
  const select = (id: CategoryId) => setParams({ tab: id }, { replace: true });
  // tab-list keys: arrows move between categories (and select them), Home/End jump to the ends
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = CATEGORIES.findIndex((c) => c.id === tab);
    const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: CATEGORIES.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = CATEGORIES[(to + CATEGORIES.length) % CATEGORIES.length].id;
    select(next);
    document.getElementById(`set-tab-${next}`)?.focus();
  };
  return (
    <div className="page settings">
      <header className="set-head">
        <p className="set-kicker">Preferences</p>
        <h1>
          <span className="gtext">Settings</span>
        </h1>
        <p className="lead">Saved in this browser and applied straight away.</p>
      </header>

      <div className="set-layout">
        <div className="set-tabs" role="tablist" aria-label="Settings categories" aria-orientation="vertical" onKeyDown={onTabKey}>
          {CATEGORIES.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`set-tab-${id}`}
              aria-selected={tab === id}
              aria-controls="set-panel"
              tabIndex={tab === id ? 0 : -1}
              className={`set-tab${tab === id ? ' on' : ''}`}
              data-guide={{ study: 'settings-tab-study', appearance: 'settings-tab-appearance', guide: 'settings-tab-guide', data: 'settings-tab-data' }[id]}
              onClick={() => select(id)}
            >
              <Icon size={17} aria-hidden />
              <span>
                {label}
                <small>{hint}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="set-panel" id="set-panel" role="tabpanel" aria-labelledby={`set-tab-${tab}`}>
          {tab === 'study' && (
            <>
              <Group id="exams" title="Exams" icon={<Timer size={16} />}>
                <Row label="Pass mark" htmlFor="set-pass" help="Applies to future attempts. Exams you already passed stay passed.">
                  <div className="set-range">
                    <input
                      id="set-pass"
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={s.passMark}
                      onChange={(e) => setSettings({ passMark: Number(e.target.value) })}
                    />
                    <output htmlFor="set-pass">{s.passMark}%</output>
                  </div>
                </Row>
                <Row label="Time per question" htmlFor="set-secs" help="Sets the default exam duration. You can still override it before each exam.">
                  <div className="set-range">
                    <input
                      id="set-secs"
                      type="range"
                      min={30}
                      max={300}
                      step={15}
                      value={s.secondsPerQuestion}
                      onChange={(e) => setSettings({ secondsPerQuestion: Number(e.target.value) })}
                    />
                    <output htmlFor="set-secs">{s.secondsPerQuestion}s</output>
                  </div>
                </Row>
                <Row label="Shuffle" htmlFor="set-shuffle" help="Shuffle questions and their options by default.">
                  <input id="set-shuffle" className="set-switch" type="checkbox" checked={s.shuffle} onChange={(e) => setSettings({ shuffle: e.target.checked })} />
                </Row>
              </Group>

              <Group id="practice" title="Practice" icon={<Target size={16} />}>
                <Row
                  label="Study-first lock"
                  labelId="set-lock-label"
                  help="Practice unlocks once every Read section of the topic is marked read. Topics you have already passed are never re-locked."
                >
                  <Segmented labelledBy="set-lock-label" value={s.studyLock} options={LOCKS} onChange={(v) => setSettings({ studyLock: v })} />
                </Row>
                <Row label="Mock-interview length" htmlFor="set-mock" help="Default timer for architecture challenges.">
                  <div className="set-range">
                    <input
                      id="set-mock"
                      type="range"
                      min={15}
                      max={90}
                      step={5}
                      value={s.mockMinutes}
                      onChange={(e) => setSettings({ mockMinutes: Number(e.target.value) })}
                    />
                    <output htmlFor="set-mock">{s.mockMinutes} min</output>
                  </div>
                </Row>
              </Group>
            </>
          )}

          {tab === 'appearance' && (
            <Group id="appearance" title="Appearance" icon={<Palette size={16} />} guide="settings-appearance">
              <Row label="Theme" labelId="set-theme-label">
                <Segmented labelledBy="set-theme-label" value={s.theme} options={THEMES} onChange={(v) => setSettings({ theme: v })} />
              </Row>
              <Row
                label="Signal colour"
                labelId="set-accent-label"
                help="Changes buttons, links and highlights. Chart colours stay fixed so they read the same in every theme."
              >
                <div className="set-swatches" role="group" aria-labelledby="set-accent-label">
                  {ACCENTS.map((a) => {
                    const on = accent === a.id;
                    return (
                      <button key={a.id} type="button" className={`set-swatch ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setSettings({ accent: a.id })}>
                        <span className={`set-swatch-dot sw-${a.id}`} aria-hidden>
                          {on && <Check size={15} strokeWidth={3} />}
                        </span>
                        <span className="set-swatch-label">{a.label}</span>
                      </button>
                    );
                  })}
                </div>
              </Row>
              <Row
                label="Depth effects"
                htmlFor="set-depth"
                help="Earned badges tilt towards the mouse pointer. Off on touch screens and when your system asks for reduced motion."
              >
                <input id="set-depth" className="set-switch" type="checkbox" checked={!!prefs.depthEffects} onChange={(e) => saveUiPrefs({ depthEffects: e.target.checked })} />
              </Row>
            </Group>
          )}

          {tab === 'guide' && (
            <Group id="guide" title="Guide" icon={<Compass size={16} />} guide="settings-guide">
              <Row label="Coach tips" htmlFor="set-tips" help="A short tip the first time you open each kind of tab.">
                <input id="set-tips" className="set-switch" type="checkbox" checked={tipsOn} onChange={(e) => saveUiPrefs({ coachTips: e.target.checked })} />
              </Row>
              <Row label="Glossary definitions in lessons" htmlFor="set-gloss" help="A dotted underline on the first mention of a glossary term in each section; hover, focus or tap it for a one-line definition.">
                <input id="set-gloss" className="set-switch" type="checkbox" checked={prefs.glossaryHovers !== false} onChange={(e) => saveUiPrefs({ glossaryHovers: e.target.checked })} />
              </Row>
              <Row
                label="Welcome tour"
                help={
            <>
                      Press <kbd>?</kbd> anywhere to open the guide, and <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> to search everything.
            </>
                }
              >
                <div className="set-actions">
                  <button type="button" className="btn btn-sm" onClick={openTour}>
                    Replay the tour
                  </button>
                  {dismissed > 0 && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => saveUiPrefs({ dismissedTips: {}, coachTips: true })}>
                      Show {dismissed} dismissed tip{dismissed === 1 ? '' : 's'} again
                    </button>
                  )}
                </div>
              </Row>
            </Group>
          )}

          {tab === 'data' && (
            <>
              <BackupGroup />

              <Group id="data" title="Data" icon={<Database size={16} />} danger guide="settings-reset">
                <Row label="Reset progress" help="Clears exam results, read markers, ratings and drafts. Settings are kept. This cannot be undone.">
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    onClick={() => {
                      if (window.confirm('Reset all progress? This cannot be undone.')) resetProgress();
                    }}
                  >
                    Reset all progress
                  </button>
                </Row>
              </Group>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const fmtDate = (iso?: string) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown date');

function Counts({ s }: { s: BackupSummary }) {
  return (
    <dl className="set-counts">
      <div>
        <dt>Topics passed</dt>
        <dd>{s.topicsPassed}</dd>
      </div>
      <div>
        <dt>Sections read</dt>
        <dd>{s.sectionsRead}</dd>
      </div>
      <div>
        <dt>Saved items</dt>
        <dd>{s.saved}</dd>
      </div>
      <div>
        <dt>Labs done</dt>
        <dd>{s.labs}</dd>
      </div>
    </dl>
  );
}

/** Export / Import: the file is validated first, previewed, then merged or used to replace this browser's data. */
function BackupGroup() {
  const p = useProgress();
  const prefs = useUiPrefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ name: string; progress: Progress; summary: BackupSummary } | null>(null);

  const pick = async (file: File | undefined) => {
    setError('');
    setPending(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('This file is too large to be an ai-learn backup. Nothing was changed.');
      return;
    }
    const res = parseBackup(await file.text());
    if (!res.ok) setError(`${res.error} Nothing was changed.`);
    else setPending({ name: file.name, progress: res.progress, summary: res.summary });
  };
  const apply = (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace' && !window.confirm('Replace all progress in this browser with the backup? Export first if you want to keep it.')) return;
    replaceProgress(mode === 'merge' ? mergeProgress(getProgress(), pending.progress) : pending.progress);
    setPending(null);
    showToast(mode === 'merge' ? 'Backup merged' : 'Backup restored', mode === 'merge' ? 'Both sides kept: nothing you learned was dropped.' : 'This browser now holds the backup.', 4000, 'good', { kicker: 'Import' });
  };

  return (
    <Group id="backup" title="Backup" icon={<HardDriveDownload size={16} />}>
      <Row
        label="Export"
        help={
          <>
            Everything lives in this browser only. Download a backup file to keep it safe or to move to another device.{' '}
            {prefs.lastExportAt ? `Last export: ${fmtDate(prefs.lastExportAt)}.` : 'Not exported yet.'}
          </>
        }
      >
        <button type="button" className="btn btn-sm" onClick={exportNow} data-guide="export">
          <Download size={15} aria-hidden /> Export backup
        </button>
      </Row>
      <Row label="Import" help="Pick a backup file. You will see what is in it and choose to merge it or replace this browser's data.">
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }} />
        <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} data-guide="import">
          <Upload size={15} aria-hidden /> Import backup…
        </button>
      </Row>
      {error && (
        <p className="set-import-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <section className="set-import" aria-labelledby="set-import-h">
          <h3 id="set-import-h">
            {pending.name} · exported {fmtDate(pending.summary.exportedAt)}
          </h3>
          <div className="set-import-cols">
            <div>
              <p className="set-import-k">In the backup</p>
              <Counts s={pending.summary} />
            </div>
            <div>
              <p className="set-import-k">In this browser now</p>
              <Counts s={summarize(p)} />
            </div>
          </div>
          <p className="set-help">
            <strong>Merge</strong> keeps both: read sections, done items and saved items are combined, best scores kept, and this browser&apos;s
            settings stay. <strong>Replace</strong> makes this browser match the backup exactly.
          </p>
          <div className="set-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => apply('merge')}>
              Merge
            </button>
            <button type="button" className="btn btn-sm" onClick={() => apply('replace')}>
              Replace
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </Group>
  );
}
