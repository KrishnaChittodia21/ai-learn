// One Short (#/short/:id), lazy-loaded with the player. `?list=saved` plays the saved Shorts in order (Saved → Play all).
import { useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ShortPlayer } from '../components/ShortPlayer';
import { markShortWatched, recordShortQuiz } from '../lib/progress';
import { SHORT_BY_ID, useShorts } from '../lib/useShorts';
import { useTopic } from '../lib/useTopic';
import { RouteSkeleton } from '../components/RouteSkeleton';

export default function ShortPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { p } = useShorts();
  const meta = SHORT_BY_ID.get(id);
  // the index only has the cover beat; the full Short comes with its topic's body
  const topic = useTopic(meta?.topic.id ?? '');
  const full = topic?.sections[meta?.section ?? -1]?.short;
  const entry = meta && full ? { ...meta, short: full } : undefined;
  // Esc / ✕: back to where you were, or to the Shorts page on a deep link
  const close = useCallback(() => (location.key !== 'default' ? navigate(-1) : navigate('/shorts')), [location.key, navigate]);
  const onFinish = useCallback(() => markShortWatched(id), [id]);
  const onQuiz = useCallback((firstTry: boolean) => recordShortQuiz(id, firstTry), [id]);

  // Play all: the saved Shorts still to do, in saved order
  const list = params.get('list') === 'saved' ? (p.saved ?? []).filter((s) => s.kind === 'short' && !s.doneAt && SHORT_BY_ID.has(s.ref)).map((s) => s.ref) : [];
  const at = list.indexOf(id);
  const nextId = at >= 0 ? list[at + 1] : undefined;
  const next = nextId ? { href: `/short/${nextId}?list=saved`, title: SHORT_BY_ID.get(nextId)!.short.title, position: `${at + 2} of ${list.length}` } : undefined;
  const nextHref = next?.href;
  const onNext = useCallback(() => nextHref && navigate(nextHref, { replace: true }), [nextHref, navigate]);

  if (meta && !entry) return <RouteSkeleton />;
  if (!entry) {
    return (
      <div className="page narrow sp-missing">
        <div className="card">
          <p className="eyebrow">Short not found</p>
          <h1>This Short is not in the course</h1>
          <p className="muted">It may have been renamed or removed.</p>
          <Link className="btn btn-primary" to="/shorts">
            All Shorts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-backdrop">
      <ShortPlayer key={id} entry={entry} onClose={close} onFinish={onFinish} onQuiz={onQuiz} onNext={onNext} next={next} />
    </div>
  );
}
