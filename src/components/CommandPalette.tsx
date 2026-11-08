// ⌘K command palette (lazy-loaded): jump to any page, topic, section, architecture challenge or capstone.
// M9: opens with no animation (keyboard-initiated, used constantly); a Continue row, a type icon per row and, at
// ≥ 720 px, a preview of the selected topic. Grouped rows + footer key hints follow VengeanceUI
// src/components/ui/search-modal.tsx (MIT, © 2025–2026 Ashutoshx7), layout only, rebuilt on cmdk + CSS.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Command, defaultFilter } from 'cmdk';
import { ArrowRight, BookOpen, CirclePlay, FileText, FlaskConical, Hash, Hammer, History, Search, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { COMPANIES, COMPANY_QUESTIONS, PHASES, TOPICS, TOPIC_BY_ID } from '../content';
import { PROJECTS } from '../content/projects';
import { setSettings, useProgress } from '../lib/progress';
import { nextStep } from '../lib/nextStep';
import { roleTopicIds } from '../content/roles';
import { companyUnlocked, topicCompletion } from '../lib/stats';
import { closePalette, openTour } from '../lib/guide';
import { getUiPrefs, saveUiPrefs, useUiPrefs, type RecentCommand } from '../lib/uiPrefs';
import { useFocusTrap } from '../lib/useFocusTrap';
import { SHORTS } from '../lib/useShorts';

const PHASE_TITLE = new Map(PHASES.map((ph) => [ph.id as string, `Phase ${ph.number}`]));
const ICONS: Record<string, ReactNode> = {
  page: <FileText size={14} />,
  topic: <BookOpen size={14} />,
  section: <Hash size={14} />,
  short: <CirclePlay size={14} />,
  'prompt-lab': <FlaskConical size={14} />,
  company: <Trophy size={14} />,
  capstone: <Hammer size={14} />,
  recent: <History size={14} />,
};

interface Item {
  id: string;
  label: string;
  hint?: string;
  href: string;
  keywords?: string[];
}

const PAGES: Item[] = [
  { id: 'page:home', label: 'Today', hint: 'your next step', href: '/', keywords: ['home', 'dashboard', 'progress'] },
  { id: 'page:contents', label: 'Syllabus', hint: 'everything in this course', href: '/contents', keywords: ['index', 'contents', 'map'] },
  { id: 'page:weak', label: 'Weak areas', href: '/weak-areas', keywords: ['mistakes', 'revise'] },
  { id: 'page:practice', label: 'Practice', hint: 'drill missed exam questions', href: '/practice', keywords: ['drill', 'mistakes'] },
  { id: 'page:companies', label: 'Architecture challenges', href: '/challenges', keywords: ['mock', 'interview'] },
  { id: 'page:achievements', label: 'Achievements', hint: 'badges and tiers', href: '/achievements', keywords: ['badges', 'trophies', 'medals', 'milestones', 'rewards'] },
  { id: 'page:shorts', label: 'Shorts', hint: 'one idea in about a minute', href: '/shorts', keywords: ['shorts', 'video', 'watch', 'story', 'short of the day'] },
  { id: 'page:plan', label: 'Plan your journey', hint: 'study pace and finish date', href: '/plan', keywords: ['plan', 'pace', 'schedule', 'finish date', 'goal', 'study plan', 'deadline'] },
  { id: 'page:paths', label: 'Learning paths', hint: 'pick a role, practise, certificate', href: '/paths', keywords: ['paths', 'role', 'career', 'agentic', 'applied', 'mcp', 'certificate', 'interview'] },
  { id: 'page:glossary', label: 'Glossary', hint: 'terms and myths', href: '/glossary', keywords: ['glossary', 'terms', 'definitions', 'dictionary', 'myths', 'jargon', 'meaning'] },
  { id: 'page:drills', label: 'From-scratch drills', hint: 'graded TypeScript exercises', href: '/drills', keywords: ['drills', 'from scratch', 'code', 'exercise', 'bm25', 'attention', 'softmax', 'tests'] },
  { id: 'page:saved', label: 'Saved for later', hint: 'your starred items', href: '/saved', keywords: ['saved', 'bookmarks', 'star', 'later', 'reading list'] },
  { id: 'page:settings', label: 'Settings', href: '/settings', keywords: ['theme', 'pass mark', 'reset', 'export', 'import', 'backup'] },
];

/**
 * Ranking: every word found in the label beats words found only in tags/hints, which beats a fuzzy match.
 * keywords[0] is always the item's label.
 */
function rank(value: string, search: string, keywords?: string[]): number {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const label = (keywords?.[0] ?? value).toLowerCase();
  if (words.every((w) => label.includes(w))) {
    const starts = words.every((w) => label.includes(` ${w}`) || label.startsWith(w) || label.includes(`›${w}`) || label.includes(`› ${w}`));
    return starts ? 1 : 0.9;
  }
  const all = (keywords ?? []).join(' ').toLowerCase();
  if (words.every((w) => all.includes(w))) return 0.6;
  return defaultFilter(label, search) * 0.4;
}

export default function CommandPalette() {
  const nav = useNavigate();
  const p = useProgress();
  const prefs = useUiPrefs();
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState('');
  useFocusTrap(ref, true, closePalette);
  const step = nextStep(p, TOPICS, { companyTotal: COMPANY_QUESTIONS.length, path: roleTopicIds(p.rolePath) });

  const topics = useMemo<Item[]>(
    () =>
      TOPICS.map((t) => ({
        id: `topic:${t.id}`,
        label: t.title,
        hint: `${PHASE_TITLE.get(t.phase) ?? ''}`,
        href: `/topic/${t.id}`,
        keywords: t.tags,
      })),
    [],
  );
  const sections = useMemo<Item[]>(
    () =>
      TOPICS.flatMap((t) =>
        t.sections.map((s, i) => ({
          id: `section:${t.id}:${i}`,
          label: `${t.title} › ${s.heading}`,
          href: `/topic/${t.id}?tab=learn&s=${i}`,
        })),
      ),
    [],
  );
  const unlocked = companyUnlocked(p, TOPICS).unlocked;
  const company = useMemo<Item[]>(
    () =>
      COMPANY_QUESTIONS.map((q) => ({
        id: `company:${q.id}`,
        label: q.title,
        hint: `${COMPANIES.find((c) => c.id === q.company)?.name ?? q.company}${unlocked ? '' : ' · locked'}`,
        href: `/challenges/${q.id}`,
      })),
    [unlocked],
  );
  const capstones = useMemo<Item[]>(
    () =>
      PROJECTS.flatMap((pr) => {
        const t = pr.topics.map((id) => TOPIC_BY_ID.get(id)).find(Boolean);
        return t ? [{ id: `capstone:${pr.id}`, label: pr.title, hint: `capstone · ${t.title}`, href: `/topic/${t.id}?tab=capstone` }] : [];
      }),
    [],
  );
  const promptLabs = useMemo<Item[]>(
    () =>
      TOPICS.flatMap((t) =>
        (t.promptLabs ?? []).map((l) => ({
          id: `prompt-lab:${l.id}`,
          label: l.title,
          hint: `prompt lab · ${t.title}`,
          href: `/topic/${t.id}?tab=prompt-lab`,
          keywords: ['prompt lab', 'prompt', 'practice'],
        })),
      ),
    [],
  );
  const shorts = useMemo<Item[]>(
    () => SHORTS.map((e) => ({ id: `short:${e.short.id}`, label: e.short.title, hint: `short · ${e.topic.title}`, href: `/short/${e.short.id}`, keywords: ['short', 'watch'] })),
    [],
  );
  const recent = (prefs.recentCommands ?? []).slice(0, 5);

  const go = useCallback(
    (item: RecentCommand) => {
      const rest = (getUiPrefs().recentCommands ?? []).filter((r) => r.id !== item.id);
      saveUiPrefs({ recentCommands: [{ id: item.id, label: item.label, href: item.href }, ...rest].slice(0, 8) });
      closePalette();
      nav(item.href);
    },
    [nav],
  );

  const isDark =
    p.settings.theme === 'dark' || (p.settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const q = search.trim();

  const row = (item: Item, prefix = '') => (
    <Command.Item key={prefix + item.id} value={prefix + item.id} keywords={[item.label, item.hint ?? '', ...(item.keywords ?? [])]} onSelect={() => go(item)}>
      <span className={`cmdk-ico ico-${item.id.split(':')[0]}`} aria-hidden>
        {ICONS[prefix ? 'recent' : item.id.split(':')[0]] ?? ICONS.page}
      </span>
      <span className="cmdk-label">{item.label}</span>
      {item.hint && <span className="cmdk-hint">{item.hint}</span>}
    </Command.Item>
  );

  return (
    <div className="modal-backdrop cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closePalette()}>
      <div ref={ref} className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command palette">
        <Command label="Command palette" loop filter={rank} value={selected} onValueChange={setSelected}>
          <div className="cmdk-input-row">
            <Search size={17} aria-hidden className="cmdk-glyph" />
            <Command.Input value={search} onValueChange={setSearch} placeholder="Search topics, sections, challenges…" data-autofocus />
            <button type="button" className="cmdk-close" onClick={closePalette} aria-label="Close search">
              <kbd>Esc</kbd>
            </button>
          </div>
          <div className="cmdk-body">
          <Command.List>
            <Command.Empty>No results. Try a shorter word.</Command.Empty>
            {!q && (
              <Command.Group heading="Continue">
                <Command.Item value="action:next" keywords={['next step', 'continue', 'resume', 'what now']} onSelect={() => go({ id: 'action:next', label: step.title, href: step.href })}>
                  <span className="cmdk-ico ico-next" aria-hidden>
                    <ArrowRight size={14} />
                  </span>
                  <span className="cmdk-label">{step.title}</span>
                  <span className="cmdk-hint">next step</span>
                </Command.Item>
              </Command.Group>
            )}
            {!q && recent.length > 0 && (
              <Command.Group heading="Recent">
                {recent.map((r) => row({ ...r }, 'recent:'))}
              </Command.Group>
            )}
            <Command.Group heading="Actions">
              {q && (
                <Command.Item value="action:next" keywords={['next step', 'continue', 'resume', 'what now']} onSelect={() => go({ id: 'action:next', label: step.title, href: step.href })}>
                  <span className="cmdk-label">Go to my next step</span>
                  <span className="cmdk-hint">action</span>
                </Command.Item>
              )}
              <Command.Item
                value="action:guide"
                keywords={['guide', 'tour', 'help', 'how']}
                onSelect={() => {
                  closePalette();
                  openTour();
                }}
              >
                <span className="cmdk-label">Open the guide</span>
                <span className="cmdk-hint">
                  <kbd>?</kbd>
                </span>
              </Command.Item>
              <Command.Item
                value="action:theme"
                keywords={['theme', 'dark', 'light', 'mode']}
                onSelect={() => {
                  setSettings({ theme: isDark ? 'light' : 'dark' });
                  closePalette();
                }}
              >
                <span className="cmdk-label">Switch to {isDark ? 'light' : 'dark'} mode</span>
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Pages">{PAGES.map((i) => row(i))}</Command.Group>
            <Command.Group heading="Topics">{topics.map((i) => row(i))}</Command.Group>
            {q.length >= 2 && <Command.Group heading="Sections">{sections.map((i) => row(i))}</Command.Group>}
            {q.length >= 2 && <Command.Group heading="Shorts">{shorts.map((i) => row(i))}</Command.Group>}
            {company.length > 0 && <Command.Group heading="Architecture challenges">{company.map((i) => row(i))}</Command.Group>}
            {promptLabs.length > 0 && <Command.Group heading="Prompt labs">{promptLabs.map((i) => row(i))}</Command.Group>}
            {capstones.length > 0 && <Command.Group heading="Capstone projects">{capstones.map((i) => row(i))}</Command.Group>}
          </Command.List>
          <Preview value={selected} stepTopic={step.topic?.id} />
          </div>
          <div className="cmdk-foot">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> move
            </span>
            <span>
              <kbd>↵</kbd> open
            </span>
            <span>
              <kbd>Esc</kbd> close
            </span>
            <span className="cmdk-foot-note">{q.length >= 2 ? 'Searching sections too' : 'Type 2+ letters to search sections'}</span>
          </div>
        </Command>
      </div>
    </div>
  );
}

/** ≥ 720 px: where the selected topic or section leads (completion and the next sections to read). */
function Preview({ value, stepTopic }: { value: string; stepTopic?: string }) {
  const p = useProgress();
  const [kind, id, sec] = value.replace(/^recent:/, '').split(':');
  const t = TOPIC_BY_ID.get(kind === 'action' && id === 'next' ? (stepTopic ?? '') : kind === 'topic' || kind === 'section' ? id : '');
  if (!t) return <aside className="cmdk-prev muted">Move to a topic or section to see where it leads.</aside>;
  const read = new Set((p.sections[t.id] ?? []).filter((i) => i < t.sections.length));
  const pct = topicCompletion(p, t);
  const from = kind === 'section' ? Number(sec) : Math.max(0, t.sections.findIndex((_, i) => !read.has(i)));
  return (
    <aside className="cmdk-prev" aria-label="Preview">
      <p className="lbl">{PHASE_TITLE.get(t.phase)}</p>
      <h3>{t.title}</h3>
      <div className="cmdk-prev-bar" aria-hidden>
        <span style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <p className="small muted">
        {pct}% done · {read.size} of {t.sections.length} sections read
      </p>
      <ol className="cmdk-prev-secs">
        {t.sections.slice(from, from + 4).map((s, k) => (
          <li key={from + k} className={read.has(from + k) ? 'done' : undefined}>
            §{from + k + 1} {s.heading.split(' — ')[0]}
          </li>
        ))}
      </ol>
    </aside>
  );
}
