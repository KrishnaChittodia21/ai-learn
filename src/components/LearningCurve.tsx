// The plan's learning curve (M6, "training run"): x = calendar days, y = % of the goal covered. Your curve draws
// beside the dashed pacer, the gap between them is shaded (ion ahead, pulsar behind), dotted lines project both to
// the goal, and each phase is a checkpoint (◆ covered, ◇ ahead). Changing pace or goal morphs the curves.
// Reduced motion: drawn once, static. Design: ai-learn-designs/plan-journey/option-1-learning-curve.html
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { addDays, dayDiff, fmtDay, hm, parseDay, weekday, type Pace } from '../lib/pace';

type Pt = [number, number];
interface Pad {
  l: number;
  r: number;
  t: number;
  b: number;
}
interface Geo {
  W: number;
  H: number;
  pad: Pad;
  x0: string;
  span: number;
  you: Pt[];
  pac: Pt[];
  pacF: Pt[];
  proj: Pt[];
}

const KEYS = ['you', 'pac', 'pacF', 'proj'] as const;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const P = (pts: Pt[]) => (pts.length ? `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}` : '');
const pct = (v: number, of: number) => Math.round((v / Math.max(1, of)) * 100);

/** the first fraction f of a polyline, with an interpolated head */
function cut(pts: Pt[], f: number): Pt[] {
  if (f >= 1 || pts.length < 2) return f <= 0 ? pts.slice(0, 1) : pts;
  const k = f * (pts.length - 1);
  const i = Math.floor(k);
  const t = k - i;
  return [...pts.slice(0, i + 1), [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)]];
}
function resample(pts: Pt[], n = 90): Pt[] {
  if (pts.length === 1) return Array(n).fill(pts[0]);
  return Array.from({ length: n }, (_, i) => {
    const f = (i / (n - 1)) * (pts.length - 1);
    const a = Math.floor(f);
    const b = Math.min(pts.length - 1, a + 1);
    return [lerp(pts[a][0], pts[b][0], f - a), lerp(pts[a][1], pts[b][1], f - a)];
  });
}

function geom(m: Pace, W: number, H: number, pad: Pad): Geo {
  const x0 = m.past[0].day;
  const end = [m.proj.at(-1)!.day, m.pacerFut.at(-1)!.day].sort().at(-1)!;
  const span = Math.max(14, dayDiff(x0, end) + 2);
  const X = (d: string) => pad.l + (dayDiff(x0, d) / span) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / Math.max(1, m.goalMinutes)) * (H - pad.t - pad.b);
  return {
    W,
    H,
    pad,
    x0,
    span,
    you: m.past.map((p) => [X(p.day), Y(p.you)]),
    pac: m.past.map((p) => [X(p.day), Y(p.pacer)]),
    pacF: m.pacerFut.map((p) => [X(p.day), Y(p.v)]),
    proj: m.proj.map((p) => [X(p.day), Y(p.v)]),
  };
}
const xOf = (g: Geo, d: string) => g.pad.l + (dayDiff(g.x0, d) / g.span) * (g.W - g.pad.l - g.pad.r);
const yOf = (g: Geo, v: number, of: number) => g.pad.t + (1 - v / Math.max(1, of)) * (g.H - g.pad.t - g.pad.b);

/** the shaded gap between you and the pacer: ion where you are above it, pulsar where below */
function Gap({ you, pac }: { you: Pt[]; pac: Pt[] }) {
  const n = Math.min(you.length, pac.length);
  if (n < 2) return null;
  const hi = you.slice(0, n).map((p, i): Pt => [p[0], Math.min(p[1], pac[i][1])]);
  return (
    <>
      <path className="lc-gap-a" d={`${P(hi)}L${P(pac.slice(0, n).reverse()).slice(1)}Z`} />
      <path className="lc-gap-b" d={`${P(hi)}L${P(you.slice(0, n).reverse()).slice(1)}Z`} />
    </>
  );
}

/** the full curve on the Plan page */
export function LearningCurve({ m, id = 'lc' }: { m: Pace; id?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const phone = W > 0 && W < 560;
  const H = phone ? 300 : 380;
  const next = useMemo(() => (W ? geom(m, W, H, { l: phone ? 36 : 42, r: phone ? 10 : 18, t: 34, b: 28 }) : null), [m, W, H, phone]);
  const [frame, setFrame] = useState<{ g: Geo; past: number; fut: number } | null>(null);
  const shown = useRef<Geo | null>(null);
  const longIntro = m.past.length > 1;

  useEffect(() => {
    if (!next) return;
    const from = shown.current;
    const show = (g: Geo, past = 1, fut = 1) => {
      shown.current = g;
      setFrame({ g, past, fut });
    };
    // first draw: past, then the future; resize or reduced motion: no animation
    if (reduce || (from && from.W !== next.W)) return void show(next);
    let raf = 0;
    const t0 = performance.now();
    if (!from) {
      const D1 = longIntro ? 1500 : 200;
      const D2 = 800;
      const tick = (now: number) => {
        const t = now - t0;
        show(next, ease(clamp(t / D1, 0, 1)), ease(clamp((t - D1) / D2, 0, 1)));
        if (t < D1 + D2) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else {
      const A = Object.fromEntries(KEYS.map((k) => [k, resample(from[k])])) as Record<(typeof KEYS)[number], Pt[]>;
      const B = Object.fromEntries(KEYS.map((k) => [k, resample(next[k])])) as Record<(typeof KEYS)[number], Pt[]>;
      const tick = (now: number) => {
        const t = ease(clamp((now - t0) / 650, 0, 1));
        if (t >= 1) return show(next);
        const mid = { ...next };
        for (const k of KEYS) mid[k] = A[k].map((p, i): Pt => [lerp(p[0], B[k][i][0], t), lerp(p[1], B[k][i][1], t)]);
        show(mid);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(raf);
  }, [next, reduce, longIntro]);

  // crosshair: hover a day for you vs the pacer
  const [hover, setHover] = useState<{ x: number; day: string } | null>(null);
  const onMove = (e: RPointerEvent<SVGRectElement>) => {
    if (!frame) return;
    const g = frame.g;
    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * g.W;
    const i = Math.round(((px - g.pad.l) / (g.W - g.pad.l - g.pad.r)) * g.span);
    const day = addDays(g.x0, clamp(i, 0, g.span));
    setHover({ x: xOf(g, day), day });
  };

  return (
    <div className="lc-viz" ref={box}>
      {frame && (
        <svg viewBox={`0 0 ${frame.g.W} ${frame.g.H}`} height={frame.g.H} role="img" aria-label="Learning curve: the share of your goal covered and the pacer, by date. The checkpoint table below has the same dates.">
          <Drawing m={m} f={frame} id={id} />
          {hover && <line className="lc-hair" x1={hover.x} x2={hover.x} y1={frame.g.pad.t} y2={frame.g.H - frame.g.pad.b} />}
          <rect
            x={frame.g.pad.l}
            y={frame.g.pad.t}
            width={frame.g.W - frame.g.pad.l - frame.g.pad.r}
            height={frame.g.H - frame.g.pad.t - frame.g.pad.b}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      {frame && hover && <HoverTip m={m} day={hover.day} left={(hover.x / frame.g.W) * 100} />}
    </div>
  );
}

function HoverTip({ m, day, left }: { m: Pace; day: string; left: number }) {
  const today = m.past.at(-1)!.day;
  const p = m.past.find((x) => x.day === day);
  const fut = (list: { day: string; v: number }[]) => (list.find((x) => x.day === day) ?? list.at(-1)!).v;
  return (
    <div className="lc-tip" style={{ left: `clamp(70px, ${left}%, calc(100% - 70px))` }} aria-hidden>
      <b>
        {weekday(day)}
        {day === today ? ' · today' : ''}
      </b>
      {p ? (
        <span>
          you {pct(p.you, m.goalMinutes)}% · pacer {pct(p.pacer, m.goalMinutes)}%
        </span>
      ) : (
        <span>
          projected {pct(fut(m.proj), m.goalMinutes)}% · pacer {pct(fut(m.pacerFut), m.goalMinutes)}%
        </span>
      )}
      <small>{day === today ? `${m.todayMinutes} min planned today` : p ? 'from your study log' : 'projection at this pace'}</small>
    </div>
  );
}

function Drawing({ m, f, id }: { m: Pace; f: { g: Geo; past: number; fut: number }; id: string }) {
  const { g } = f;
  const { W, H, pad } = g;
  const phone = W < 560;
  const you = cut(g.you, f.past);
  const pac = cut(g.pac, f.past);
  const pacF = cut(g.pacF, f.fut);
  const proj = cut(g.proj, f.fut);
  const base = H - pad.b;
  const top = pad.t;
  const head = you.at(-1)!;
  const today = m.past.at(-1)!.day;
  const done = m.state === 'done';

  // week ticks, thinned so labels never collide
  const pxDay = (W - pad.l - pad.r) / g.span;
  const every = Math.max(1, Math.ceil((phone ? 62 : 74) / (pxDay * 7)));
  let mon = g.x0;
  while (parseDay(mon).getDay() !== 1) mon = addDays(mon, 1);
  const ticks: string[] = [];
  for (let d = mon, i = 0; dayDiff(d, addDays(g.x0, g.span)) > 3; d = addDays(d, 7), i++) if (i % every === 0) ticks.push(d);

  const cx = f.past < 1 ? head[0] : xOf(g, today);
  const cy = f.past < 1 ? head[1] : yOf(g, m.you, m.goalMinutes);
  const right = cx > W - pad.r - 80;
  const atPct = clamp(Math.round(((base - cy) / (base - top)) * 100), 0, 100);
  let lastLbl = -99;

  return (
    <>
      <defs>
        <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--c-ion)', stopOpacity: 0.26 }} />
          <stop offset="1" style={{ stopColor: 'var(--c-violet)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((q) => {
        const y = top + (1 - q) * (base - top);
        return (
          <g key={q}>
            <line className="lc-grid" x1={pad.l} x2={W - pad.r} y1={y} y2={y} />
            <text className="lc-ax" x={pad.l - 6} y={y + 3.5} textAnchor="end">
              {q * 100}%
            </text>
          </g>
        );
      })}
      {ticks.map((d) => (
        <g key={d}>
          <line className="lc-grid" x1={xOf(g, d)} x2={xOf(g, d)} y1={base} y2={base + 5} />
          <text className="lc-ax" x={xOf(g, d)} y={base + 18} textAnchor="middle">
            {fmtDay(d)}
          </text>
        </g>
      ))}
      <line className="lc-goal" x1={pad.l} x2={W - pad.r} y1={top} y2={top} />
      <Gap you={you} pac={pac} />
      {you.length > 1 && <path d={`${P(you)}L${head[0]} ${base}L${you[0][0]} ${base}Z`} fill={`url(#${id}-area)`} />}
      <path className="lc-pac" d={P(pac)} />
      {f.fut > 0 && (
        <>
          <path className="lc-pac lc-pacf" d={P(pacF)} />
          <path className="lc-proj" d={P(proj)} />
        </>
      )}
      {you.length > 1 && <path className="lc-you" d={P(you)} />}
      {!done && f.fut >= 1 && <FinishTags m={m} g={g} />}
      {m.checkpoints.map((c, i) => {
        const st = c.remaining <= 0 ? 'done' : i === m.current ? 'here' : 'ahead';
        const day = c.doneDay ?? c.date;
        if (!day) return null;
        const x = xOf(g, st === 'done' ? day : addDays(day, 1));
        const y = yOf(g, c.end, m.goalMinutes);
        if (st === 'done' ? x > head[0] + 0.5 : f.fut < 1) return null;
        const lbl = st === 'here' || (x - lastLbl > (phone ? 34 : 30) && !(st === 'ahead' && i === m.checkpoints.length - 1));
        if (lbl) lastLbl = x;
        const label = `${st === 'done' ? 'Covered' : 'Projected'} checkpoint ${c.number}, ${c.title}, ${weekday(day)}`;
        return (
          <g key={c.id} className={`lc-cp ${st}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} tabIndex={0} role="img" aria-label={label}>
            <title>{`${c.title} · ${c.topics} topic${c.topics === 1 ? '' : 's'} · ${hm(c.minutes)}\n${st === 'done' ? '◆ covered' : `◇ projected ${weekday(day)}`}`}</title>
            <rect x={-4.5} y={-4.5} width={9} height={9} transform="rotate(45)" />
            <rect x={-11} y={-11} width={22} height={22} className="lc-cp-hit" />
            {lbl && (
              <text x={-8} y={-8} textAnchor="end">
                {String(c.number).padStart(2, '0')}
              </text>
            )}
          </g>
        );
      })}
      <line className="lc-today" x1={cx} x2={cx} y1={top - 14} y2={base} />
      <text className={`lc-tag${m.state === 'behind' ? ' behind' : ''}`} x={cx + (right ? -6 : 6)} y={base - 6} textAnchor={right ? 'end' : 'start'}>
        today · {atPct}%
      </text>
      <circle className="lc-halo" cx={cx} cy={cy} r={7} />
      <circle className="lc-dot" cx={cx} cy={cy} r={4.5} />
      {f.past >= 1 && !m.fresh && !done && Math.abs(m.gap) >= 15 && <GapBracket m={m} g={g} cx={cx} cy={cy} />}
    </>
  );
}

function FinishTags({ m, g }: { m: Pace; g: Geo }) {
  const top = g.pad.t;
  const pe = g.pacF.at(-1)!;
  const ye = g.proj.at(-1)!;
  const anchor = (x: number) => (x > g.W - g.pad.r - 40 ? 'end' : x < g.pad.l + 40 ? 'start' : 'middle');
  const differ = m.pacerFinish !== m.finish;
  return (
    <>
      <line className="lc-grid lc-eta-tick" x1={ye[0]} x2={ye[0]} y1={top - 4} y2={top + 4} />
      {Math.abs(pe[0] - ye[0]) < 110 ? (
        <text className="lc-tag" x={Math.max(pe[0], ye[0])} y={top - 9} textAnchor={anchor(Math.max(pe[0], ye[0]))}>
          {differ && <tspan className="lc-tag pac">pacer {fmtDay(m.pacerFinish!)} </tspan>}
          <tspan className="lc-tag eta">ETA {fmtDay(m.finish!)}</tspan>
        </text>
      ) : (
        <>
          <text className="lc-tag eta" x={ye[0]} y={top - 9} textAnchor={anchor(ye[0])}>
            ETA {fmtDay(m.finish!)}
          </text>
          <text className="lc-tag pac" x={pe[0]} y={top - 9} textAnchor={anchor(pe[0])}>
            pacer {fmtDay(m.pacerFinish!)}
          </text>
        </>
      )}
    </>
  );
}

/** the gap at today, as a bracket with its size */
function GapBracket({ m, g, cx, cy }: { m: Pace; g: Geo; cx: number; cy: number }) {
  const yp = yOf(g, m.pacerNow, m.goalMinutes);
  const behind = m.gap > 0;
  return (
    <g className={`lc-bracket ${behind ? 'behind' : 'ahead'}`}>
      <line className="lc-bracket-gap" x1={cx + 9} x2={cx + 9} y1={cy} y2={yp} />
      <line className="lc-bracket-pac" x1={cx + 5} x2={cx + 13} y1={yp} y2={yp} />
      <text className={`lc-tag ${behind ? 'behind' : 'eta'}`} x={cx + 16} y={(cy + yp) / 2 + 4}>
        {behind ? '−' : '+'}
        {hm(m.gap)}
      </text>
    </g>
  );
}

/** the Today card's sparkline of the same curve (static) */
export function Sparkline({ m }: { m: Pace }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 70;
  const g = W ? geom(m, W, H, { l: 2, r: 2, t: 8, b: 6 }) : null;
  const delta = m.state === 'done' ? 'goal reached' : m.state === 'behind' ? `${hm(m.gap)} behind` : m.state === 'ahead' ? `${hm(-m.gap)} ahead` : 'on pace';
  return (
    <div className="td-plan-mini" ref={box}>
      {g && (
        <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={`Sparkline: ${pct(m.you, m.goalMinutes)}% covered, ${delta}${m.finish ? `, ETA ${fmtDay(m.finish)}` : ''}`}>
          <line className="lc-goal" x1={0} x2={W} y1={yOf(g, m.goalMinutes, m.goalMinutes)} y2={yOf(g, m.goalMinutes, m.goalMinutes)} />
          <Gap you={g.you} pac={g.pac} />
          <path className="mk-pac" d={P([...g.pac, ...g.pacF.slice(1)])} />
          <path className="mk-proj" d={P(g.proj)} />
          {g.you.length > 1 && <path className="mk-you" d={P(g.you)} />}
          <line className="lc-today" x1={xOf(g, m.past.at(-1)!.day)} x2={xOf(g, m.past.at(-1)!.day)} y1={0} y2={H} />
          <circle className="lc-dot" cx={xOf(g, m.past.at(-1)!.day)} cy={yOf(g, m.you, m.goalMinutes)} r={3.5} />
          {m.finish && <circle cx={g.proj.at(-1)![0]} cy={g.proj.at(-1)![1]} r={3} className="mk-eta" />}
        </svg>
      )}
    </div>
  );
}
