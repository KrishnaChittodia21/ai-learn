// One Short (#/short/:id), lazy-loaded with the player. `?list=saved` plays the saved Shorts in order (Saved → Play all).
import { useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { ShortPlayer } from '../components/ShortPlayer';
import { markShortWatched, recordShortQuiz } from '../lib/progress';
import { studyDays } from '../lib/shorts';
import { SHORT_BY_ID, SHORTS, useShorts } from '../lib/useShorts';

export default function ShortPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { p, open, nextLocked } = useShorts();
  const entry = SHORT_BY_ID.get(id);
  // Esc / ✕: back to where you were, or to the Shorts page on a deep link
  const close = useCallback(() => (location.key !== 'default' ? navigate(-1) : navigate('/shorts')), [location.key, navigate]);
  const onFinish = useCallback(() => markShortWatched(id), [id]);
  const onQuiz = useCallback((firstTry: boolean) => recordShortQuiz(id, firstTry), [id]);

  // Play all: the saved Shorts still to do, in saved order (only open ones play)
  const list = params.get('list') === 'saved' ? (p.saved ?? []).filter((s) => s.kind === 'short' && !s.doneAt && open.has(s.ref) && SHORT_BY_ID.has(s.ref)).map((s) => s.ref) : [];
  const at = list.indexOf(id);
  const nextId = at >= 0 ? list[at + 1] : undefined;
  const next = nextId ? { href: `/short/${nextId}?list=saved`, title: SHORT_BY_ID.get(nextId)!.short.title, position: `${at + 2} of ${list.length}` } : undefined;
  const nextHref = next?.href;
  const onNext = useCallback(() => nextHref && navigate(nextHref, { replace: true }), [nextHref, navigate]);

  if (!entry || !open.has(id)) {
    // the i-th Short (0-based) unlocks once there are i + 1 study days
    const days = entry ? SHORTS.indexOf(entry) + 1 - studyDays(p) : 0;
    return (
      <div className="page narrow sp-missing">
        <div className="card">
          <p className="eyebrow">
            <Lock size={14} aria-hidden /> {entry ? 'Locked Short' : 'Short not found'}
          </p>
          <h1>{entry ? entry.short.title : 'This Short is not in the course'}</h1>
          <p className="muted">
            {entry
              ? `One more Short unlocks on each day you study${nextLocked?.short.id === id ? ': this one is next' : `, this one after ${days} more study day${days === 1 ? '' : 's'}`}. The Short of the day is always open.`
              : 'It may have been renamed or removed.'}
          </p>
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
