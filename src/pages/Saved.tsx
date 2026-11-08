// Saved for later (M2): everything shortlisted with ☆ Save, grouped by kind. Design: new-features/saved.html
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownUp, BookOpen, Calculator, Check, ChevronDown, CirclePlay, Code, FileText, FlaskConical, MessageSquare, Play, Star, Trash2, Undo2, type LucideIcon } from 'lucide-react';
import { TOPICS, TOPIC_BY_ID } from '../content';
import { removeSaved, restoreSaved, SAVED_KINDS, SAVED_MAX, setSavedDone, useProgress, type SavedItem, type SavedKind } from '../lib/progress';
import { showToast } from '../lib/toast';
import { SHORT_BY_ID, useShorts } from '../lib/useShorts';

interface Resolved {
  item: SavedItem;
  title: string;
  topic: string;
  /** null when the content is no longer in the course (the row can still be removed) */
  href: string | null;
  kindLabel: string;
}

const KIND: Record<SavedKind, { label: string; plural: string; icon: LucideIcon }> = {
  topic: { label: 'Topic', plural: 'Topics', icon: BookOpen },
  section: { label: 'Section', plural: 'Sections', icon: FileText },
  interview: { label: 'Interview question', plural: 'Interview', icon: MessageSquare },
  code: { label: 'Code lab', plural: 'Code labs', icon: Code },
  'prompt-lab': { label: 'Prompt lab', plural: 'Prompt labs', icon: FlaskConical },
  drill: { label: 'Estimation drill', plural: 'Estimation', icon: Calculator },
  short: { label: 'Short', plural: 'Shorts', icon: CirclePlay },
};

// question / lab / drill id → its topic and title (ids are unique across the course; checked by validate)
const OWNER = new Map<string, { topicId: string; title: string; dom: string; tab: string }>();
for (const t of TOPICS) {
  for (const q of t.interviewQuestions) OWNER.set(`interview|${q.id}`, { topicId: t.id, title: q.question, dom: `iq-${q.id}`, tab: 'interview' });
  for (const c of t.codeChallenges) OWNER.set(`code|${c.id}`, { topicId: t.id, title: c.title, dom: `cc-${c.id}`, tab: 'code' });
  for (const l of t.promptLabs ?? []) OWNER.set(`prompt-lab|${l.id}`, { topicId: t.id, title: l.title, dom: `pl-${l.id}`, tab: 'prompt-lab' });
  for (const e of t.envelopeQuestions) OWNER.set(`drill|${e.id}`, { topicId: t.id, title: e.question, dom: `boe-${e.id}`, tab: 'envelope' });
}

function resolve(item: SavedItem): Resolved {
  const gone = { item, title: 'No longer in the course', topic: TOPIC_BY_ID.get(item.topicId)?.title ?? '', href: null, kindLabel: KIND[item.kind]?.label ?? 'Item' };
  if (item.kind === 'topic') {
    const t = TOPIC_BY_ID.get(item.ref);
    return t ? { item, title: t.title, topic: t.subtitle, href: `/topic/${t.id}`, kindLabel: 'Topic' } : gone;
  }
  if (item.kind === 'section') {
    const [id, i] = item.ref.split(':');
    const t = TOPIC_BY_ID.get(id);
    const s = t?.sections[Number(i)];
    return t && s ? { item, title: s.heading.split(' — ')[0], topic: t.title, href: `/topic/${t.id}?tab=learn&s=${i}`, kindLabel: `Section §${Number(i) + 1}` } : gone;
  }
  if (item.kind === 'short') {
    const e = SHORT_BY_ID.get(item.ref);
    return e ? { item, title: e.short.title, topic: e.topic.title, href: `/short/${e.short.id}`, kindLabel: 'Short' } : gone;
  }
  const o = OWNER.get(`${item.kind}|${item.ref}`);
  const t = o && TOPIC_BY_ID.get(o.topicId);
  return o && t ? { item, title: o.title, topic: t.title, href: `/topic/${t.id}?tab=${o.tab}&at=${encodeURIComponent(o.dom)}`, kindLabel: KIND[item.kind].label } : gone;
}

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function SavedPage() {
  const p = useProgress();
  const [filter, setFilter] = useState<'all' | SavedKind>('all');
  const [oldestFirst, setOldestFirst] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const all = (p.saved ?? []).map(resolve);
  const open = all.filter((r) => !r.item.doneAt);
  const done = all.filter((r) => r.item.doneAt).sort((a, b) => b.item.doneAt!.localeCompare(a.item.doneAt!));
  const count = (k: 'all' | SavedKind) => open.filter((r) => k === 'all' || r.item.kind === k).length;
  const shown = open
    .filter((r) => filter === 'all' || r.item.kind === filter)
    .sort((a, b) => (oldestFirst ? 1 : -1) * a.item.addedAt.localeCompare(b.item.addedAt));
  // 'short' gets its chip (and Play all) once a Short is saved
  const kinds = SAVED_KINDS.filter((k) => k !== 'short' || count('short') > 0);
  const navigate = useNavigate();
  const { open: openShorts } = useShorts();
  const playable = open.filter((r) => r.item.kind === 'short' && r.href && openShorts.has(r.item.ref)).sort((a, b) => a.item.addedAt.localeCompare(b.item.addedAt));
  const total = all.length;
  const near = total >= SAVED_MAX * 0.9;

  /** keep keyboard focus on the list after a row disappears */
  const refocus = () => requestAnimationFrame(() => (panel.current?.querySelector<HTMLElement>('.sv-done') ?? panel.current)?.focus());
  const markDone = (r: Resolved) => {
    setSavedDone(r.item.kind, r.item.ref, true);
    showToast(r.title, undefined, 5000, 'good', { kicker: 'Marked done', action: { label: 'Undo', run: () => setSavedDone(r.item.kind, r.item.ref, false) } });
    refocus();
  };
  const remove = (r: Resolved) => {
    const item = removeSaved(r.item.kind, r.item.ref);
    if (item) showToast(r.title, undefined, 5000, 'info', { kicker: 'Removed from Saved', action: { label: 'Undo', run: () => restoreSaved(item) } });
    refocus();
  };
  const clearDone = () => {
    const items = done.map((r) => removeSaved(r.item.kind, r.item.ref)).filter((x): x is SavedItem => !!x);
    showToast(`${items.length} done item${items.length === 1 ? '' : 's'} cleared`, undefined, 5000, 'info', { kicker: 'Removed from Saved', action: { label: 'Undo', run: () => items.forEach(restoreSaved) } });
  };

  const groups = SAVED_KINDS.map((k) => ({ k, rows: shown.filter((r) => r.item.kind === k) })).filter((g) => g.rows.length);

  return (
    <div className="page saved-page">
      <section className="sv-hero" aria-labelledby="sv-title">
        <div>
          <span className="eyebrow">
            <Star size={14} aria-hidden style={{ color: 'var(--c-solar)' }} /> Saved for later
          </span>
          <h1 id="sv-title">
            <span className="gtext">Your reading pile</span>
          </h1>
          <p className="lead">Topics, sections, questions and labs you starred. Kept in this browser; Export in Settings backs them up.</p>
        </div>
        <div className={`sv-cap card${near ? ' near' : ''}`} data-guide="saved-cap">
          <div className="sv-cap-top">
            <span className="eyebrow" style={{ margin: 0 }}>
              {total >= SAVED_MAX ? 'Saved is full' : 'Space'}
            </span>
            <span className="sv-cap-n">
              {total} <small>/ {SAVED_MAX}</small>
            </span>
          </div>
          <div className="pbar" role="progressbar" aria-label="Saved items" aria-valuemin={0} aria-valuemax={SAVED_MAX} aria-valuenow={total}>
            <div className="pbar-fill" style={{ width: `${(total / SAVED_MAX) * 100}%` }} />
          </div>
          <p>
            {total >= SAVED_MAX && !done.length
              ? 'Saving is paused. Mark items done or remove a few to make room. Nothing is ever dropped silently.'
              : `Up to ${SAVED_MAX} items. When it is full, the oldest done items make room first.`}
          </p>
        </div>
      </section>

      <div className="sv-toolbar">
        <div className="sv-chips" role="group" aria-label="Show saved items of kind" data-guide="saved-filters">
          {(['all', ...kinds] as const).map((k) => {
            const n = count(k);
            return (
              <button key={k} type="button" className={`chip${filter === k ? ' on' : ''}${n ? '' : ' empty'}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {k === 'all' ? 'All' : KIND[k].plural} <span className="sv-n">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="sv-tools" data-guide="saved-sort">
          {playable.length > 0 && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate(`/short/${playable[0].item.ref}?list=saved`)} data-guide="saved-play">
              <Play size={14} aria-hidden /> Play all Shorts ({playable.length})
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOldestFirst((o) => !o)} aria-label={`Sorted ${oldestFirst ? 'oldest' : 'newest'} first. Change the order`}>
            <ArrowDownUp size={15} aria-hidden /> {oldestFirst ? 'Oldest first' : 'Newest first'}
          </button>
        </div>
      </div>

      <div className="sv-panel card" ref={panel} tabIndex={-1} aria-label="Saved items">
        {groups.length ? (
          groups.map(({ k, rows }) => {
            const Icon = KIND[k].icon;
            return (
              <section key={k} className="sv-group" aria-label={KIND[k].plural}>
                <h2 className="sv-gh">
                  <Icon size={14} aria-hidden /> {KIND[k].plural} <b>{rows.length}</b>
                </h2>
                <ul className="sv-list">
                  {rows.map((r) => (
                    <li key={`${r.item.kind}|${r.item.ref}`} className="sv-row">
                      <span className={`sv-ic k-${k}`} aria-hidden>
                        <Icon size={18} />
                      </span>
                      <div className="sv-body">
                        {r.href ? (
                          <Link className="sv-title" to={r.href}>
                            {r.title}
                          </Link>
                        ) : (
                          <span className="sv-title">{r.title}</span>
                        )}
                        <span className="sv-meta">
                          <span className="sv-kind">{r.kindLabel}</span>
                          {r.topic && (
                            <>
                              {' · '}
                              <span className="sv-topic">{r.topic}</span>
                            </>
                          )}
                          {' · '}
                          <time dateTime={r.item.addedAt} title={new Date(r.item.addedAt).toLocaleString()}>
                            saved {ago(r.item.addedAt)}
                          </time>
                        </span>
                      </div>
                      <span className="sv-acts" data-guide="saved-actions">
                        <button type="button" className="btn btn-xs sv-done" onClick={() => markDone(r)} aria-label={`Mark done: ${r.title}`}>
                          <Check size={14} aria-hidden /> Done
                        </button>
                        <button type="button" className="btn-ghost btn-icon btn-xs sv-remove" aria-label={`Remove from Saved: ${r.title}`} title="Remove" onClick={() => remove(r)}>
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          <div className="sv-empty">
            <div className="sv-empty-orb" aria-hidden>
              <Star size={30} />
            </div>
            {open.length ? (
              <>
                <h2>Nothing in {filter === 'all' ? 'this list' : KIND[filter].plural}</h2>
                <p>Saved items of other kinds are waiting under the other filters.</p>
                <button type="button" className="btn btn-primary" onClick={() => setFilter('all')}>
                  Show all
                </button>
              </>
            ) : (
              <>
                <h2>{done.length ? 'All done' : 'Nothing saved yet'}</h2>
                <p>
                  Tap{' '}
                  <span className="save-btn" aria-hidden>
                    <Star size={13} /> Save
                  </span>{' '}
                  on any topic, section, interview question, lab, estimation drill or Short. It lands here, ready for later.
                </p>
                <Link className="btn btn-primary" to="/contents">
                  Open the Syllabus
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <section className="sv-donebox card" aria-label="Done" data-guide="saved-done">
          <div className="sv-donebar">
            <button type="button" className="btn-ghost btn-sm" aria-expanded={showDone} aria-controls="sv-done-list" onClick={() => setShowDone((s) => !s)}>
              <ChevronDown size={15} aria-hidden className="sv-chev" /> Done ({done.length})
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={clearDone}>
              <Trash2 size={14} aria-hidden /> Clear done
            </button>
          </div>
          {showDone && (
            <ul className="sv-list" id="sv-done-list">
              {done.map((r) => (
                <li key={`${r.item.kind}|${r.item.ref}`} className="sv-row">
                  <span className="sv-tick" aria-hidden>
                    <Check size={18} strokeWidth={3} />
                  </span>
                  <div className="sv-body">
                    {r.href ? (
                      <Link className="sv-title" to={r.href}>
                        {r.title}
                      </Link>
                    ) : (
                      <span className="sv-title">{r.title}</span>
                    )}
                    <span className="sv-meta">
                      <span className="sv-kind">{r.kindLabel}</span>
                      {r.topic && ` · ${r.topic}`} · done {ago(r.item.doneAt!)}
                    </span>
                  </div>
                  <span className="sv-acts">
                    <button type="button" className="btn-ghost btn-xs" onClick={() => setSavedDone(r.item.kind, r.item.ref, false)} aria-label={`Back to the list: ${r.title}`}>
                      <Undo2 size={14} aria-hidden /> Back to list
                    </button>
                    <button type="button" className="btn-ghost btn-icon btn-xs" aria-label={`Remove from Saved: ${r.title}`} title="Remove" onClick={() => remove(r)}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
