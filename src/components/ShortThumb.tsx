// A Short's 9:16 poster (Shorts page, Today, topic strip). The art is drawn from the Short's first beat type.
import { Link } from 'react-router-dom';
import { Check, Lock, Play } from 'lucide-react';
import { shortLength, type ShortEntry } from '../lib/shorts';
import { showToast } from '../lib/toast';
import type { ShortBeat } from '../types';

const HUES: [string, string][] = [
  ['#7c5cff', '#ff4fa3'],
  ['#22e4ff', '#7c5cff'],
  ['#ff4fa3', '#ffb86b'],
  ['#7c5cff', '#22e4ff'],
];

function Art({ type }: { type: ShortBeat['type'] }) {
  switch (type) {
    case 'tokens':
    case 'ladder':
    case 'counter':
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          {[34, 70, 46, 26, 18].map((h, k) => (
            <rect key={k} className="g-anim" style={{ ['--k' as string]: k }} x={8 + k * 18} y={78 - h} width={12} height={h} rx={3} fill={k === 1 ? '#ff8fc8' : 'rgb(182 164 255 / .75)'} />
          ))}
        </svg>
      );
    case 'retrieve':
    case 'grid':
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          {[
            [20, 20],
            [34, 30],
            [52, 44],
            [70, 52],
            [80, 66],
          ].map(([x, y], k) => (
            <circle key={k} className="g-pulse" style={{ ['--k' as string]: k }} cx={x} cy={y} r={k === 2 ? 7 : 4} fill={k === 2 ? '#fff' : '#ff8fc8'} />
          ))}
        </svg>
      );
    case 'claims':
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          <rect x={26} y={6} width={48} height={64} rx={6} fill="rgb(255 255 255 / .82)" />
          {[18, 28, 38, 48].map((y) => (
            <rect key={y} x={34} y={y} width={32} height={3} rx={1.5} fill="rgb(23 18 58 / .35)" />
          ))}
          <rect className="g-pulse" x={22} y={50} width={56} height={14} rx={4} fill="none" stroke="#ff6b8a" strokeWidth={3} transform="rotate(-8 50 57)" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          <path d="M14 40 H86" stroke="rgb(255 255 255 / .2)" strokeWidth={2} />
          {[14, 38, 62, 86].map((x, k) => (
            <circle key={x} className="g-pulse" style={{ ['--k' as string]: k }} cx={x} cy={40} r={8} fill={k === 2 ? '#ff8fc8' : '#7ef0ff'} />
          ))}
        </svg>
      );
  }
}

export function ShortThumb({ entry, state, lockNote, className = '' }: { entry: ShortEntry; state?: 'watched' | 'new' | 'locked'; lockNote?: string; className?: string }) {
  const { short, topic } = entry;
  const [h1, h2] = HUES[short.id.length % HUES.length];
  const art = short.beats.find((b) => b.type !== 'quiz')?.type ?? 'flow';
  const body = (
    <>
      <span className="art">
        <Art type={art} />
      </span>
      <span className="t-dur">{shortLength(short)}</span>
      {state === 'new' && <span className="t-state new">NEW</span>}
      {state === 'watched' && (
        <span className="t-state seen">
          <Check size={11} aria-hidden strokeWidth={3} /> WATCHED
        </span>
      )}
      {state === 'locked' ? (
        <span className="t-lock">
          <span>
            <Lock size={17} aria-hidden />
          </span>
          {lockNote}
        </span>
      ) : (
        <span className="play-hint" aria-hidden>
          <Play size={18} />
        </span>
      )}
      <span className="t-title">{short.title}</span>
      <span className="t-topic">{topic.title}</span>
      {state === 'watched' && (
        <span className="t-prog" aria-hidden>
          <i />
        </span>
      )}
    </>
  );
  const style = { ['--h1' as string]: h1, ['--h2' as string]: h2 };
  const label = `${short.title}, ${shortLength(short)}${state === 'watched' ? ', watched' : state === 'new' ? ', new today' : ''}`;
  if (state === 'locked')
    return (
      <button
        type="button"
        className={`thumb locked ${className}`}
        style={style}
        aria-label={`${short.title}: locked. ${lockNote ?? ''}`}
        onClick={() => showToast('This Short is locked', 'One more Short unlocks on each day you study. The Short of the day is always open.', 5000, 'info')}
      >
        {body}
      </button>
    );
  return (
    <Link to={`/short/${short.id}`} className={`thumb ${state === 'watched' ? 'watched' : ''} ${state === 'new' ? 'is-new' : ''} ${className}`} style={style} aria-label={label}>
      {body}
    </Link>
  );
}
