// A Short's 9:16 poster (Shorts page, Dashboard, topic strip). The art is drawn from the Short's own first beat.
import { Link } from 'react-router-dom';
import { Check, Play } from 'lucide-react';
import { shortLength, type ShortEntry } from '../lib/shorts';
import type { ShortBeat } from '../types';

const HUES: [string, string][] = [
  ['#7c5cff', '#ff4fa3'],
  ['#22e4ff', '#7c5cff'],
  ['#ff4fa3', '#ffb86b'],
  ['#7c5cff', '#22e4ff'],
  ['#2ee6a6', '#22e4ff'],
  ['#ffb86b', '#7c5cff'],
];
/** stable palette per Short (a string hash, so neighbours rarely share one) */
const hueFor = (id: string) => HUES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const words = (t: string, n: number) => t.split(/\s+/).slice(0, n).join(' ');
const PINK = '#ff8fc8';
const SOFT = 'rgb(182 164 255 / .75)';
const INK = 'rgb(255 255 255 / .92)';
const DIM = 'rgb(255 255 255 / .62)';

/** The poster art is drawn from the Short's own first beat: its number, its tokens, its steps. */
function Art({ beat }: { beat: ShortBeat }) {
  switch (beat.type) {
    case 'counter': {
      const n = `${beat.prefix ?? ''}${beat.value.toLocaleString('en-US', { maximumFractionDigits: beat.decimals ?? 0 })}${beat.suffix ?? ''}`;
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          <text className="g-anim" x={50} y={44} textAnchor="middle" fontSize={n.length > 5 ? 22 : 30} fontWeight={800} fill={INK}>
            {n}
          </text>
          <text x={50} y={60} textAnchor="middle" fontSize={6.4} fill={DIM}>
            {clip(words(beat.unit, 5), 30)}
          </text>
        </svg>
      );
    }
    case 'tokens':
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          <text x={4} y={12} fontSize={6.4} fill={DIM}>
            {clip(`…${beat.prompt.split(' ').slice(-3).join(' ')}`, 30)}
          </text>
          {beat.picks.slice(0, 3).map((p, k) => (
            <g key={k} className="g-anim" style={{ ['--k' as string]: k }}>
              <text x={4} y={30 + k * 17} fontSize={7} fill={INK}>
                {clip(p.token.trim(), 11)}
              </text>
              <rect x={52} y={24 + k * 17} width={Math.max(3, p.p * 44)} height={8} rx={3} fill={k === 0 ? PINK : SOFT} />
            </g>
          ))}
        </svg>
      );
    case 'ladder': {
      // scale to the largest rung (values below 1, like recall 0.71 vs 0.88, still show their difference)
      const max = Math.max(...beat.rungs.map((r) => r.amount)) || 1;
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          {beat.rungs.slice(0, 3).map((r, k, all) => (
            <g key={k} className="g-anim" style={{ ['--k' as string]: k }}>
              <text x={4} y={14 + k * 26} fontSize={6.2} fill={DIM}>
                {clip(r.label, 30)}
              </text>
              <rect x={4} y={18 + k * 26} width={Math.max(4, (r.amount / max) * 72)} height={9} rx={3} fill={k === all.length - 1 ? PINK : SOFT} />
              <text x={Math.max(4, (r.amount / max) * 72) + 8} y={25.5 + k * 26} fontSize={7.5} fontWeight={700} fill={INK}>
                {r.amount.toLocaleString('en-US')}
              </text>
            </g>
          ))}
        </svg>
      );
    }
    case 'grid': {
      // at most 10 squares are drawn, so the lit share is scaled to keep the real proportion (6 of 40 → 2 of 10)
      const shown = Math.min(beat.cells, 10);
      const lit = Math.round(((beat.hot ?? 0) * shown) / beat.cells);
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          {Array.from({ length: shown }, (_, k) => {
            const per = Math.min(beat.cells, 5);
            const size = 14;
            const x = 50 - (per * (size + 4) - 4) / 2 + (k % per) * (size + 4);
            return <rect key={k} className="g-anim" style={{ ['--k' as string]: k }} x={x} y={20 + Math.floor(k / per) * 18} width={size} height={size} rx={3} fill={k < lit ? PINK : SOFT} />;
          })}
          <text x={50} y={66} textAnchor="middle" fontSize={6} fill={DIM}>
            {clip(beat.caption, 34)}
          </text>
        </svg>
      );
    }
    case 'flow':
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          {beat.steps.slice(0, 4).map((st, k) => (
            <g key={k} className="g-anim" style={{ ['--k' as string]: k }}>
              <circle cx={9} cy={12 + k * 18} r={6} fill={k === beat.broken ? PINK : SOFT} />
              <text x={9} y={14.4 + k * 18} textAnchor="middle" fontSize={6.5} fontWeight={700} fill="#17123a">
                {k + 1}
              </text>
              <text x={19} y={14.6 + k * 18} fontSize={6.6} fill={INK}>
                {clip(st.split(':')[0], 24)}
              </text>
            </g>
          ))}
        </svg>
      );
    case 'retrieve':
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          {beat.chunks.slice(0, 4).map((c, k) => (
            <g key={k} className="g-anim" style={{ ['--k' as string]: k }}>
              <rect x={4} y={8 + k * 17} width={Math.max(6, c.score * 70)} height={9} rx={3} fill={k < beat.k ? PINK : SOFT} />
              <text x={Math.max(6, c.score * 70) + 8} y={15.5 + k * 17} fontSize={7} fontWeight={700} fill={INK}>
                {c.score.toFixed(2)}
              </text>
            </g>
          ))}
        </svg>
      );
    case 'claims':
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          {beat.claims.slice(0, 4).map((c, k) => (
            <g key={k} className="g-anim" style={{ ['--k' as string]: k }}>
              <text x={4} y={15 + k * 17} fontSize={9} fontWeight={800} fill={c.ok ? '#7ef0c8' : '#ff6b8a'}>
                {c.ok ? '✓' : '✗'}
              </text>
              <text x={15} y={14 + k * 17} fontSize={6.4} fill={INK}>
                {clip(c.text, 26)}
              </text>
            </g>
          ))}
        </svg>
      );
    default:
      // spike, race, toggles, quiz: a rising curve
      return (
        <svg viewBox="0 0 100 80" aria-hidden>
          <path className="g-anim" d="M6 70 C 30 66, 46 60, 58 44 S 80 12, 94 8" fill="none" stroke={PINK} strokeWidth={3.5} strokeLinecap="round" />
        </svg>
      );
  }
}

export function ShortThumb({ entry, state, className = '' }: { entry: ShortEntry; state?: 'watched'; className?: string }) {
  const { short, topic } = entry;
  const [h1, h2] = hueFor(short.id);
  const beat = short.beats.find((b) => b.type !== 'quiz') ?? short.beats[0];
  const body = (
    <>
      <span className="art">
        <Art beat={beat} />
      </span>
      <span className="t-dur">{shortLength(short)}</span>
      {state === 'watched' && (
        <span className="t-state seen">
          <Check size={11} aria-hidden strokeWidth={3} /> WATCHED
        </span>
      )}
      <span className="play-hint" aria-hidden>
        <Play size={18} />
      </span>
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
  const label = `${short.title}, ${shortLength(short)}${state === 'watched' ? ', watched' : ''}`;
  return (
    <Link to={`/short/${short.id}`} className={`thumb ${state === 'watched' ? 'watched' : ''} ${className}`} style={style} aria-label={label}>
      {body}
    </Link>
  );
}
