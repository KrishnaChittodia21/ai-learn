// Glossary (C4): every term with search, category chips and an A–Z jump, plus the Myths list.
// Deep link: #/glossary?term=<id> opens that term and scrolls to it; #/glossary?tab=myths opens the myths.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { ArrowRight, BookA, ChevronRight, Search, X } from 'lucide-react';
import { GLOSSARY, GLOSSARY_CATEGORIES, type GlossaryCategory, type GlossaryTerm } from '../content/glossary';
import { MYTHS } from '../content/myths';
import { TOPIC_BY_ID } from '../content';
import { Markdown } from '../components/ui';
import { HeadingReveal } from '../components/HeadingReveal';

const BY_ID = new Map(GLOSSARY.map((t) => [t.id, t]));
const letterOf = (t: GlossaryTerm) => (/[a-z]/i.test(t.term[0]) ? t.term[0].toUpperCase() : '#');
const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export default function GlossaryPage() {
  const [params, setParams] = useSearchParams();
  const deep = params.get('term');
  const tab = params.get('tab') === 'myths' ? 'myths' : 'terms';
  const reduce = useReducedMotion();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<GlossaryCategory | 'all'>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // a deep link (or a related-term link) clears the filters, opens the term and scrolls to it
  const [handled, setHandled] = useState<string | null>(null);
  if (deep !== handled) {
    setHandled(deep);
    if (deep && BY_ID.has(deep)) {
      setQ('');
      setCat('all');
      setOpen((o) => (o.has(deep) ? o : new Set(o).add(deep)));
    }
  }
  useEffect(() => {
    if (!deep || !BY_ID.has(deep)) return;
    const id = requestAnimationFrame(() => {
      const el = document.getElementById(`g-${deep}`);
      el?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      el?.querySelector<HTMLButtonElement>('.gl-head')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [deep, reduce]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return GLOSSARY.filter((t) => (cat === 'all' || t.category === cat) && (!needle || [t.term, ...(t.aliases ?? [])].some((n) => n.toLowerCase().includes(needle))));
  }, [q, cat]);
  const groups = LETTERS.map((l) => ({ l, terms: shown.filter((t) => letterOf(t) === l) })).filter((g) => g.terms.length);
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const setTab = (t: 'terms' | 'myths') => setParams(t === 'myths' ? { tab: 'myths' } : {}, { replace: true });
  const jump = (l: string) => document.getElementById(`gl-${l}`)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });

  return (
    <div className="page glossary-page">
      <header className="gl-hero">
        <p className="eyebrow">
          <BookA size={14} aria-hidden /> {GLOSSARY.length} terms · {MYTHS.length} myths
        </p>
        <h1>
          <HeadingReveal text="Glossary" />
        </h1>
        <p className="lead">Plain definitions of the words lessons use, what they mean in practice, and the common mix-ups. Lessons underline the first mention of a term; hover or tap it.</p>
      </header>

      <div className="gl-tabs" role="tablist" aria-label="Glossary sections" data-guide="gl-tabs">
        {(['terms', 'myths'] as const).map((t) => (
          <button key={t} type="button" role="tab" id={`gl-tab-${t}`} aria-selected={tab === t} aria-controls={`gl-panel-${t}`} className={`gl-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {t === 'terms' ? 'Terms' : 'Myths'} <span className="n">{t === 'terms' ? GLOSSARY.length : MYTHS.length}</span>
          </button>
        ))}
      </div>

      {tab === 'terms' ? (
        <div id="gl-panel-terms" role="tabpanel" aria-labelledby="gl-tab-terms">
          <div className="gl-tools">
            <label className="gl-search" data-guide="gl-search">
              <Search size={16} aria-hidden />
              <span className="sr-only">Search terms</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a term or abbreviation" autoComplete="off" />
              {q && (
                <button type="button" className="gl-clear" aria-label="Clear search" onClick={() => setQ('')}>
                  <X size={14} aria-hidden />
                </button>
              )}
            </label>
            <div className="gl-chips" role="group" aria-label="Filter by category">
              {(['all', ...GLOSSARY_CATEGORIES] as const).map((c) => (
                <button key={c} type="button" className={`chip${cat === c ? ' on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
                  {c === 'all' ? 'All' : c}
                </button>
              ))}
            </div>
            <nav className="gl-az" aria-label="Jump to letter" data-guide="gl-az">
              {LETTERS.map((l) =>
                groups.some((g) => g.l === l) ? (
                  <button key={l} type="button" onClick={() => jump(l)} aria-label={l === '#' ? 'Numbers' : `Letter ${l}`}>
                    {l}
                  </button>
                ) : (
                  <span key={l} aria-hidden>
                    {l}
                  </span>
                ),
              )}
            </nav>
          </div>

          <p className="gl-count" aria-live="polite">
            {shown.length === GLOSSARY.length ? `${shown.length} terms` : `${shown.length} of ${GLOSSARY.length} terms`}
          </p>

          {groups.length ? (
            groups.map(({ l, terms }) => (
              <section key={l} className="gl-group" aria-labelledby={`gl-${l}`}>
                <h2 id={`gl-${l}`} className="gl-letter" tabIndex={-1}>
                  {l}
                </h2>
                <ul className="gl-list" data-guide="gl-list">
                  {terms.map((t) => (
                    <Entry key={t.id} t={t} open={open.has(t.id)} onToggle={() => toggle(t.id)} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="gl-empty">No term matches “{q}”. Try an abbreviation (RAG, KV cache) or clear the category.</p>
          )}
        </div>
      ) : (
        <div id="gl-panel-myths" role="tabpanel" aria-labelledby="gl-tab-myths">
          <ol className="gl-myths">
            {MYTHS.map((m) => {
              const topic = m.learn ? TOPIC_BY_ID.get(m.learn) : undefined;
              return (
                <li key={m.id} id={`myth-${m.id}`} className="gl-myth">
                  <p className="gl-myth-k">Myth</p>
                  <h2 className="gl-myth-q">“{m.myth}”</h2>
                  <p className="gl-myth-k reality">Reality</p>
                  <Markdown>{m.reality}</Markdown>
                  <p className="gl-myth-why">
                    <strong>Why it matters:</strong> {m.whyItMatters}
                  </p>
                  {topic && (
                    <Link className="gl-learn" to={`/topic/${topic.id}`}>
                      Learn it: {topic.title.split(/[:(]/)[0].trim()} <ArrowRight size={14} aria-hidden />
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="gl-credit muted">
        Adapted from <em>ai-engineering-from-scratch</em> (MIT, © 2026 Rohit Ghumare).
      </p>
    </div>
  );
}

function Entry({ t, open, onToggle }: { t: GlossaryTerm; open: boolean; onToggle: () => void }) {
  const topic = t.learn ? TOPIC_BY_ID.get(t.learn) : undefined;
  const related = t.related.map((id) => BY_ID.get(id)).filter((r): r is GlossaryTerm => !!r);
  return (
    <li id={`g-${t.id}`} className={`gl-entry${open ? ' open' : ''}`}>
      <button type="button" className="gl-head" aria-expanded={open} aria-controls={`g-${t.id}-body`} onClick={onToggle}>
        <ChevronRight size={16} aria-hidden className="gl-chev" />
        <span className="gl-name">
          <span className="gl-term-name">{t.term}</span>
          {t.aliases?.length ? <span className="gl-alias">{t.aliases.join(' · ')}</span> : null}
        </span>
        <span className="gl-cat">{t.category}</span>
        <span className="gl-short">{t.short}</span>
      </button>
      {open && (
        <div id={`g-${t.id}-body`} className="gl-body">
          <Markdown>{t.body}</Markdown>
          {(related.length > 0 || topic) && (
            <div className="gl-foot">
              {related.length > 0 && (
                <p className="gl-related">
                  <span className="lbl">Related</span>
                  {related.map((r) => (
                    <Link key={r.id} className="chip" to={`/glossary?term=${r.id}`}>
                      {r.term}
                    </Link>
                  ))}
                </p>
              )}
              {topic && (
                <Link className="gl-learn" to={`/topic/${topic.id}`}>
                  Learn it: {topic.title.split(/[:(]/)[0].trim()} <ArrowRight size={14} aria-hidden />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
