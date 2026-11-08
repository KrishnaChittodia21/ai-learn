// Shorts (M5): every Short, grouped by phase, with the Short of the day and the daily unlock. Design: new-features/shorts.html
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CirclePlay, Lock, Play } from 'lucide-react';
import { PHASES } from '../content';
import { ShortThumb } from '../components/ShortThumb';
import { SaveButton } from '../components/SaveButton';
import { isSaved } from '../lib/progress';
import { shortLength } from '../lib/shorts';
import { SHORTS, useShorts } from '../lib/useShorts';
import { HeadingReveal } from '../components/HeadingReveal';
import { ShortsQueue } from '../components/ShortsQueue';

type Filter = 'all' | 'unwatched' | 'watched' | 'saved' | 'locked';

export default function ShortsPage() {
  const { p, open, sotd, newToday, nextLocked, studiedToday, watched } = useShorts();
  const [filter, setFilter] = useState<Filter>('all');
  const stateOf = (id: string) => (!open.has(id) ? 'locked' : watched(id) ? 'watched' : id === newToday ? 'new' : undefined);
  const match = (id: string, f: Filter) =>
    f === 'all' || (f === 'locked' ? !open.has(id) : f === 'watched' ? watched(id) : f === 'unwatched' ? open.has(id) && !watched(id) : isSaved(p, 'short', id));
  const count = (f: Filter) => SHORTS.filter((e) => match(e.short.id, f)).length;
  const groups = PHASES.map((ph) => ({ ph, all: SHORTS.filter((e) => e.topic.phase === ph.id) }))
    .map((g) => ({ ...g, shown: g.all.filter((e) => match(e.short.id, filter)) }))
    .filter((g) => g.shown.length);
  const feat = sotd?.entry;
  // Ready to watch: open and unwatched, the Short of the day first, at most 8
  const queue = SHORTS.filter((e) => open.has(e.short.id) && !watched(e.short.id))
    .sort((a, b) => Number(b === feat) - Number(a === feat))
    .slice(0, 8);
  const filters: [Filter, string][] = [
    ['all', 'All'],
    ['unwatched', 'Unwatched'],
    ['watched', 'Watched'],
    ['saved', 'Saved'],
    ['locked', 'Locked'],
  ];

  return (
    <div className="page shorts-page">
      <section className="sh-hero" aria-labelledby="sh-title">
        <div>
          <p className="eyebrow">
            <CirclePlay size={14} aria-hidden /> {SHORTS.length} Shorts · about a minute each
          </p>
          <h1 id="sh-title">
            <HeadingReveal text="Shorts" />
          </h1>
          <p className="lead">One idea, animated, in about a minute. Each Short ends with a question and a link to the lesson that teaches it properly.</p>
          <ul className="sh-stats" aria-label="Your Shorts">
            <li>
              <span className="num">{count('watched')}</span>
              <span className="lbl">Watched</span>
            </li>
            <li>
              <span className="num">{count('unwatched')}</span>
              <span className="lbl">Ready to watch</span>
            </li>
            <li>
              <span className="num">{count('locked')}</span>
              <span className="lbl">Locked</span>
            </li>
          </ul>
          {nextLocked && (
            <p className="sh-unlock" data-guide="shorts-unlock">
              <Lock size={18} aria-hidden className="ic" />
              <span>
                <strong>Next to unlock: {nextLocked.short.title}.</strong> {studiedToday ? 'Study on another day to open it.' : 'Study anything today to open it.'} One more
                Short unlocks on each day you study.
              </span>
            </p>
          )}
        </div>
        {feat && (
          <div className="gborder sh-feat" data-guide="shorts-today">
            <div className="gborder-in">
              <ShortThumb entry={feat} state={sotd.watched ? 'watched' : undefined} />
              <div>
                <p className="eyebrow">
                  <span className="badge badge-medium">SHORT OF THE DAY</span>
                </p>
                <h2>{feat.short.title}</h2>
                <p>
                  {feat.topic.title} · §{feat.section + 1}
                </p>
                <div className="row wrap">
                  <Link className="btn btn-primary" to={`/short/${feat.short.id}`}>
                    <Play size={15} aria-hidden /> {sotd.watched ? 'Watch again' : 'Watch'} · {shortLength(feat.short)}
                  </Link>
                  <SaveButton kind="short" refId={feat.short.id} topicId={feat.topic.id} title={feat.short.title} />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <ShortsQueue queue={queue} />

      <div className="sh-filters" role="group" aria-label="Filter Shorts" data-guide="shorts-filters">
        {filters.map(([f, label]) => (
          <button key={f} type="button" className={`chip${filter === f ? ' on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label} <span className="n">{count(f)}</span>
          </button>
        ))}
      </div>

      <div className="sh-groups" data-guide="shorts-grid">
        {groups.length ? (
          groups.map(({ ph, all, shown }) => (
            <section key={ph.id} className="sh-group" aria-label={`Phase ${ph.number}: ${ph.title}`}>
              <h2>
                <span className="mono">PHASE {ph.number}</span> {ph.title}
                <span className="cnt">
                  {all.filter((e) => watched(e.short.id)).length}/{all.length}
                </span>
              </h2>
              <div className="sh-row">
                {shown.map((e) => (
                  <ShortThumb key={e.short.id} entry={e} state={stateOf(e.short.id)} lockNote={e === nextLocked ? 'Unlocks next study day' : 'Locked'} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="sh-empty">No Shorts here yet.</p>
        )}
      </div>
    </div>
  );
}
