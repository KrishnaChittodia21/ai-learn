import type { ReactNode } from 'react';
import { Check, Compass, Database, Palette, Target, Timer } from 'lucide-react';
import { resetProgress, setSettings, useProgress, type Accent, type Settings } from '../lib/progress';
import { saveUiPrefs, useUiPrefs } from '../lib/uiPrefs';
import { openTour } from '../lib/guide';

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

function Group({ id, title, icon, children, danger }: { id: string; title: string; icon: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <section className={`set-group ${danger ? 'danger' : ''}`} aria-labelledby={`set-${id}`}>
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
  return (
    <div className="page narrow settings">
      <header className="set-head">
        <p className="set-kicker">Preferences</p>
        <h1>
          <span className="gtext">Settings</span>
        </h1>
        <p className="lead">Saved in this browser and applied straight away.</p>
      </header>

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

      <Group id="appearance" title="Appearance" icon={<Palette size={16} />}>
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
      </Group>

      <Group id="guide" title="Guide" icon={<Compass size={16} />}>
        <Row label="Coach tips" htmlFor="set-tips" help="A short tip the first time you open each kind of tab.">
          <input id="set-tips" className="set-switch" type="checkbox" checked={tipsOn} onChange={(e) => saveUiPrefs({ coachTips: e.target.checked })} />
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

      <Group id="data" title="Data" icon={<Database size={16} />} danger>
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
    </div>
  );
}
