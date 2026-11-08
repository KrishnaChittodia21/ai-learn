// Shorts (M5): every Short in course order, with the Short of the day. Design: new-features/shorts.html
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CirclePlay, Play } from 'lucide-react';
import { ShortThumb } from '../components/ShortThumb';
import { SaveButton } from '../components/SaveButton';
import { isSaved } from '../lib/progress';
import { shortLength } from '../lib/shorts';
import { SHORTS, useShorts } from '../lib/useShorts';
import { HeadingReveal } from '../components/HeadingReveal';
import { ShortsQueue } from '../components/ShortsQueue';

type Filter = 'all' | 'unwatched' | 'watched' | 'saved';

export default function ShortsPage() {
  const { p, sotd, watched } = useShorts();
  const [filter, setFilter] = useState<Filter>('all');
  const match = (id: string, f: Filter) =>
    f === 'all' || (f === 'watched' ? watched(id) : f === 'unwatched' ? !watched(id) : isSaved(p, 'short', id));
  const count = (f: Filter) => SHORTS.filter((e) => match(e.short.id, f)).length;
  // one flat list in course order (no phase groups)
  const shown = SHORTS.filter((e) => match(e.short.id, filter));
  const feat = sotd?.entry;
  // Ready to watch: unwatched, the Short of the day first, at most 8
  const queue = SHORTS.filter((e) => !watched(e.short.id))
    .sort((a, b) => Number(b === feat) - Number(a === feat))
    .slice(0, 8);
  const filters: [Filter, string][] = [
    ['all', 'All'],
    ['unwatched', 'Unwatched'],
    ['watched', 'Watched'],
    ['saved', 'Saved'],
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
          </ul>
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
                  {feat.topic.title} · section {feat.section + 1}
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

      {shown.length ? (
        <div className="sh-row" data-guide="shorts-grid">
          {shown.map((e) => (
            <ShortThumb key={e.short.id} entry={e} state={watched(e.short.id) ? 'watched' : undefined} />
          ))}
        </div>
      ) : (
        <p className="sh-empty">No Shorts here yet.</p>
      )}
    </div>
  );
}
