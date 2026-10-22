import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEVEL_OF_TOPIC, LEVELS, PHASES, TOPICS } from '../content';
import type { TopicStatus } from '../lib/stats';
import { prefersReducedMotion } from '../viz/core';

/* =====================================================================
   Course coverage as a feed-forward network (Today hero).
   "YOU" input → three layers (Beginner / Intermediate / Advanced, one neuron per topic, in
   phase-then-topic order) → one output neuron that reads out the % covered.
   Signal pulses only travel through topics you have covered and fade at the frontier.
   Static SVG is React; the pulses are one rAF loop that writes attributes directly, pauses
   off-screen (IntersectionObserver) and never starts under prefers-reduced-motion.
   ===================================================================== */

type NodeState = 'covered' | 'progress' | 'new';
const STATE_OF: Record<TopicStatus, NodeState> = { passed: 'covered', 'in-progress': 'progress', new: 'new' };
const STATUS_TEXT: Record<NodeState, string> = { covered: 'Covered', progress: 'In progress', new: 'Not started' };
const NUMERALS = ['I', 'II', 'III'];
const pad = (n: number) => String(n).padStart(2, '0');

interface Neuron {
  i: number;
  topic: (typeof TOPICS)[number];
  phaseNo: number;
  phaseTitle: string;
  x: number;
  y: number;
  r: number;
  li: number;
  ny: number;
}
interface Port {
  x: number;
  y: number;
  r: number;
  li: number;
}
type End = Neuron | Port | 'in' | 'out';
interface Edge {
  a: Neuron | 'in';
  b: Neuron | 'out';
  layer: number;
  d: string;
  p: number[];
}

/* ---------- geometry (pure; built once per variant) ---------- */
const CFG = {
  compact: { W: 308, H: 238, top: 40, bot: 228, inX: 18, inR: 11, xs: [80, 142, 206], stagger: 16, rs: [5, 3.7, 3.2], outX: 270, outR: 33, pctSize: 21, labelY: 12, short: true },
  full: { W: 560, H: 460, top: 64, bot: 446, inX: 30, inR: 18, xs: [134, 244, 363], stagger: 26, rs: [7.5, 6, 5], outX: 490, outR: 50, pctSize: 34, labelY: 22, short: false },
};
type Cfg = (typeof CFG)['full'];

function buildNet(C: Cfg) {
  const midY = (C.top + C.bot) / 2;
  const phaseOf = new Map(PHASES.map((ph) => [ph.id, ph]));
  let idx = 0;
  const layers: Neuron[][] = LEVELS.map((lv, li) => {
    const ts = TOPICS.filter((t) => LEVEL_OF_TOPIC.get(t.id) === lv.id);
    const n = ts.length;
    // a large layer becomes two staggered columns so its neurons keep room to breathe
    const twoCols = n > 18;
    return ts.map((t, k) => {
      const ph = phaseOf.get(t.phase);
      const pad0 = li === 0 ? (C.bot - C.top) * 0.1 : 0;
      const x = twoCols ? C.xs[li] + (k % 2 ? C.stagger / 2 : -C.stagger / 2) : C.xs[li];
      const y = n === 1 ? midY : C.top + pad0 + (k * (C.bot - C.top - 2 * pad0)) / (n - 1);
      return { i: idx++, topic: t, phaseNo: ph?.number ?? 0, phaseTitle: ph?.title ?? '', x, y, r: C.rs[li], li, ny: (y - C.top) / (C.bot - C.top) };
    });
  });
  const input: Port = { x: C.inX, y: midY, r: C.inR, li: -1 };
  const output: Port = { x: C.outX, y: midY, r: C.outR, li: 3 };
  const all = layers.flat();

  // sparse, position-local connectivity (reads as a trained net, not a hairball)
  const raw: { a: Neuron | 'in'; b: Neuron | 'out'; layer: number }[] = [];
  const link = (a: Neuron | 'in', b: Neuron | 'out', layer: number) => raw.push({ a, b, layer });
  layers[0].forEach((n) => link('in', n, 0));
  const near = (A: Neuron[], B: Neuron[], th: number, min: number) => {
    A.forEach((a) => {
      const sorted = B.map((b) => [b, Math.abs(a.ny - b.ny)] as const).sort((p, q) => p[1] - q[1]);
      sorted.forEach(([b, d], i) => {
        if (d < th || i < min) link(a, b, a.li + 1);
      });
    });
  };
  for (let li = 0; li < layers.length - 1; li++) near(layers[li], layers[li + 1], li === 0 ? 0.16 : 0.085, 2);
  // every neuron past the first layer needs at least one parent
  for (let li = 1; li < layers.length; li++) {
    layers[li].forEach((b) => {
      if (!raw.some((e) => e.b === b)) {
        const a = layers[li - 1].reduce((m, x) => (Math.abs(x.ny - b.ny) < Math.abs(m.ny - b.ny) ? x : m));
        link(a, b, li);
      }
    });
  }
  layers[layers.length - 1].forEach((n) => link(n, 'out', layers.length));

  const pos = (e: End): Port | Neuron => (e === 'in' ? input : e === 'out' ? output : e);
  const edges: Edge[] = raw.map(({ a, b, layer }) => {
    const A = pos(a);
    const B = pos(b);
    const ax = A.x + (a === 'in' ? A.r : 0);
    const bx = b === 'out' ? B.x - B.r * 0.92 : B.x;
    const by = b === 'out' ? B.y + (A.y - B.y) * 0.18 : B.y;
    const dx = (bx - ax) * 0.55;
    return { a, b, layer, p: [ax, A.y, ax + dx, A.y, bx - dx, by, bx, by], d: `M${ax},${A.y} C${ax + dx},${A.y} ${bx - dx},${by} ${bx},${by}` };
  });
  const outOf = new Map<Neuron | 'in', Edge[]>();
  edges.forEach((e) => outOf.set(e.a, [...(outOf.get(e.a) ?? []), e]));
  const colX = layers.map((ns) => (Math.min(...ns.map((n) => n.x)) + Math.max(...ns.map((n) => n.x))) / 2);
  return { C, midY, layers, all, input, output, edges, outOf, colX };
}
type Net = ReturnType<typeof buildNet>;
const NETS: Partial<Record<'full' | 'compact', Net>> = {};
const getNet = (v: 'full' | 'compact') => (NETS[v] ??= buildNet(CFG[v]));

/** "passed,new,…" (topic order) → topic id → neuron state; a stable key keeps the pulse loop from restarting on hover */
function parseStates(key: string): Map<string, NodeState> {
  const parts = key.split(',');
  return new Map(TOPICS.map((t, i) => [t.id, STATE_OF[parts[i] as TopicStatus] ?? 'new']));
}

const bez = (p: number[], t: number) => {
  const u = 1 - t;
  const a = u * u * u,
    b = 3 * u * u * t,
    c = 3 * u * t * t,
    d = t * t * t;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export interface NeuralCoverageProps {
  /** topic id → status (same `topicStatus` the rest of Today uses; covered = exam passed) */
  status: Map<string, TopicStatus>;
  /** the topic the hero recommends (nextStep) */
  nextId?: string;
  /** whole-course % covered */
  pct: number;
  /** accessible summary of the figure */
  label: string;
  compact?: boolean;
  className?: string;
}

export function NeuralCoverage({ status, nextId, pct, label, compact = false, className = '' }: NeuralCoverageProps) {
  const net = getNet(compact ? 'compact' : 'full');
  const { C, layers, all, input, output, edges, outOf, colX } = net;
  const uid = 'nn' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const nav = useNavigate();
  const reduced = useReducedMotion();

  const statusKey = TOPICS.map((t) => status.get(t.id) ?? 'new').join(',');
  const st = useMemo(() => parseStates(statusKey), [statusKey]);
  const covered = all.filter((n) => st.get(n.topic.id) === 'covered').length;
  const frac = covered / Math.max(1, all.length);
  const stateOf = (e: Neuron | 'in' | 'out'): NodeState => (e === 'in' || e === 'out' ? 'covered' : (st.get(e.topic.id) ?? 'new'));

  const levelCounts = layers.map((ns, li) => ({
    numeral: NUMERALS[li],
    title: LEVELS[li].title,
    done: ns.filter((n) => st.get(n.topic.id) === 'covered').length,
    total: ns.length,
  }));
  const next = nextId ? all.find((n) => n.topic.id === nextId) : undefined;

  /* ---------- roving focus + tooltip ---------- */
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tabStop = focusIdx ?? next?.i ?? 0;
  const [tip, setTip] = useState<{ n: Neuron; x: number; y: number; below: boolean } | null>(null);
  const hostRef = useRef<HTMLElement>(null);
  const nodeRefs = useRef<(SVGGElement | null)[]>([]);
  const coreRefs = useRef<(SVGCircleElement | null)[]>([]);
  const orbRef = useRef<SVGCircleElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pulseRef = useRef<SVGGElement>(null);
  const lastPointer = useRef<string>('mouse');
  const tipWasOn = useRef(false);

  const showTip = (n: Neuron) => {
    const host = hostRef.current;
    const g = nodeRefs.current[n.i];
    if (!host || !g) return;
    const hb = host.getBoundingClientRect();
    const nb = g.getBoundingClientRect();
    const y = nb.top - hb.top;
    const below = y < 90;
    const half = Math.min(120, hb.width / 2 - 4);
    const x = Math.max(half, Math.min(hb.width - half, nb.left + nb.width / 2 - hb.left));
    setTip({ n, x, y: below ? nb.bottom - hb.top : y, below });
  };
  const hideTip = () => setTip(null);
  const go = (n: Neuron) => nav(`/topic/${n.topic.id}`);

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const i = nodeRefs.current.findIndex((g) => g === document.activeElement);
    if (i < 0) return;
    let j = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(all.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = all.length - 1;
    else if (e.key === 'Enter') {
      e.preventDefault();
      go(all[i]);
      return;
    } else if (e.key === 'Escape') return hideTip();
    else return;
    e.preventDefault();
    setFocusIdx(j);
    nodeRefs.current[j]?.focus();
  };

  /* ---------- signal pulses ---------- */
  const motion = !reduced;
  useEffect(() => {
    const svg = svgRef.current;
    const gp = pulseRef.current;
    if (!svg || !gp || !motion) return;
    const NS = 'http://www.w3.org/2000/svg';
    const sOf = (b: Neuron | 'out'): NodeState => (b === 'out' ? 'covered' : (st.get(b.topic.id) ?? 'new'));
    const weight = (b: Neuron | 'out') => (b === 'out' ? 1 : { covered: 4, progress: 1.4, new: 0.35 }[sOf(b)]);
    const pick = (list: Edge[]) => {
      const tot = list.reduce((s, e) => s + weight(e.b), 0);
      let r = Math.random() * tot;
      for (const e of list) if ((r -= weight(e.b)) <= 0) return e;
      return list[list.length - 1];
    };
    const SEG = compact ? 620 : 700;
    const firsts = outOf.get('in') ?? [];
    type Pulse = { g: SVGGElement; dots: SVGCircleElement[]; seg: Edge; segStart: number };
    const spawn = (now: number, delay = 0): Pulse => {
      const g = document.createElementNS(NS, 'g');
      g.style.opacity = '0';
      const dots = [2.6, 2.1, 1.6].map((r, i) => {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', String(compact ? r * 0.8 : r));
        c.setAttribute('class', `td-nn-pulse t${i}`);
        c.setAttribute('cx', '-20');
        c.setAttribute('cy', '-20');
        g.appendChild(c);
        return c;
      });
      gp.appendChild(g);
      return { g, dots, seg: pick(firsts), segStart: now + delay };
    };
    const count = Math.round(2 + frac * (compact ? 7 : 13));
    // staggered start, seeded from the first frame's timestamp
    let pulses: Pulse[] = [];
    let seeded = false;
    const flashes = new Map<Neuron | 'out', number>();
    const cores = coreRefs.current;
    const orb = orbRef.current;

    const step = (now: number) => {
      if (!seeded) {
        seeded = true;
        pulses = Array.from({ length: count }, (_, i) => spawn(now, (i * SEG * 4) / count));
      }
      pulses.forEach((p, idx) => {
        if (now < p.segStart) {
          p.g.style.opacity = '0';
          return;
        }
        let t = (now - p.segStart) / SEG;
        if (t >= 1) {
          const b = p.seg.b;
          flashes.set(b, now);
          const nexts = b === 'out' ? [] : (outOf.get(b) ?? []);
          // the signal only propagates through what you have learned; it fades at the frontier
          if (sOf(b) !== 'covered' || !nexts.length) {
            p.g.remove();
            pulses[idx] = spawn(now, 200 + Math.random() * 900);
            return;
          }
          p.seg = pick(nexts);
          p.segStart = now;
          t = 0;
        }
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const s = sOf(p.seg.b);
        p.g.style.opacity = String(s === 'covered' ? 1 : s === 'progress' ? 1 - t * 0.6 : 1 - t);
        p.dots.forEach((d, i) => {
          const [x, y] = bez(p.seg.p, Math.max(0, ease - i * 0.045));
          d.setAttribute('cx', x.toFixed(1));
          d.setAttribute('cy', y.toFixed(1));
        });
      });
      // a brief swell where a signal lands
      flashes.forEach((at, n) => {
        const k = 1 - (now - at) / 380;
        if (n === 'out') orb?.setAttribute('r', String(output.r * (1.5 + Math.max(0, k) * 0.08)));
        else {
          const core = cores[n.i];
          if (core) core.style.r = k > 0 ? `${n.r * (1 + 0.45 * k)}px` : '';
        }
        if (k <= 0) flashes.delete(n);
      });
    };
    let raf = 0;
    const loop = (now: number) => {
      step(now);
      raf = requestAnimationFrame(loop);
    };
    // pause while the figure is off-screen (or hidden by the responsive layout)
    const io = new IntersectionObserver(([e]) => {
      cancelAnimationFrame(raf);
      if (e.isIntersecting) raf = requestAnimationFrame(loop);
    });
    io.observe(svg);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      pulses.forEach((p) => p.g.remove());
      cores.forEach((c) => c && (c.style.r = ''));
      orb?.setAttribute('r', String(output.r * 1.5));
    };
  }, [motion, st, frac, compact, outOf, output.r]);

  /* ---------- render ---------- */
  const url = (k: string) => `url(#${uid}${k})`;
  const lit = edges.map((e) => {
    const sa = stateOf(e.a);
    const sb = e.b === 'out' ? sa : stateOf(e.b);
    const on = sa === 'covered' && sb === 'covered';
    const warm = !on && sa !== 'new' && sb !== 'new';
    return { on, warm };
  });
  const L3x = colX[2] - (C.stagger / 2) * (layers[2].length > 18 ? 1 : 0);
  const gradX = [
    [C.inX, colX[0]],
    [colX[0], colX[1]],
    [colX[1], L3x],
    [L3x, C.outX],
  ];
  const gradC = [
    ['var(--c-nebula)', 'var(--c-ion)'],
    ['var(--c-ion)', 'var(--c-ion)'],
    ['var(--c-ion)', 'var(--c-nebula)'],
    ['var(--c-nebula)', 'var(--c-pulsar)'],
  ];

  let nextTag = null;
  if (next) {
    const w = compact ? 26 : 34;
    const h = compact ? 12 : 15;
    // right-most layer: the tag goes to the right so it never covers the staggered column
    const right = next.li === layers.length - 1;
    const tx = right ? next.x + next.r + 8 : next.x - next.r - 8 - w;
    nextTag = (
      <g className="td-nn-next" aria-hidden>
        <path d={right ? `M${next.x + next.r + 2},${next.y} L${tx},${next.y}` : `M${tx + w},${next.y} L${next.x - next.r - 2},${next.y}`} />
        <rect x={tx} y={next.y - h / 2} width={w} height={h} rx={h / 2} />
        <text x={tx + w / 2} y={next.y + (compact ? 2.8 : 3.1)} textAnchor="middle" fontSize={compact ? 7 : undefined}>
          NEXT
        </text>
      </g>
    );
  }

  return (
    <figure ref={hostRef} className={`td-nn${compact ? ' td-nn-compact' : ''}${motion ? '' : ' is-static'} ${className}`} role="group" aria-label={label}>
      <svg ref={svgRef} viewBox={`0 0 ${C.W} ${C.H}`} className="td-nn-svg" onKeyDown={onKeyDown} onPointerLeave={(e) => e.pointerType !== 'touch' && hideTip()}>
        <defs>
          {(
            [
              ['hi', 'var(--td-nn-halo)'],
              ['hp', 'var(--td-nn-halo-p)'],
            ] as const
          ).map(([k, c]) => (
            <radialGradient key={k} id={uid + k}>
              <stop offset="0%" style={{ stopColor: c }} />
              <stop offset="100%" style={{ stopColor: c, stopOpacity: 0 }} />
            </radialGradient>
          ))}
          <radialGradient id={uid + 'orb'} cx="50%" cy="45%" r="60%">
            <stop offset="0%" style={{ stopColor: 'light-dark(rgb(124 92 255 / .22), rgb(124 92 255 / .55))' }} />
            <stop offset="70%" style={{ stopColor: 'light-dark(rgb(124 92 255 / .06), rgb(124 92 255 / .12))' }} />
            <stop offset="100%" style={{ stopColor: 'light-dark(rgb(124 92 255 / 0), rgb(124 92 255 / 0))' }} />
          </radialGradient>
          {gradX.map(([x1, x2], i) => (
            <linearGradient key={i} id={`${uid}g${i}`} gradientUnits="userSpaceOnUse" x1={x1} x2={x2} y1={0} y2={0}>
              <stop offset="0%" style={{ stopColor: gradC[i][0] }} />
              <stop offset="100%" style={{ stopColor: gradC[i][1] }} />
            </linearGradient>
          ))}
          <linearGradient id={uid + 'gt'} x1={0} x2={1} y1={0} y2={0.3}>
            <stop offset="0%" style={{ stopColor: 'var(--gtext-1)' }} />
            <stop offset="35%" style={{ stopColor: 'var(--gtext-2)' }} />
            <stop offset="65%" style={{ stopColor: 'var(--gtext-3)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--gtext-4)' }} />
          </linearGradient>
          <linearGradient id={uid + 'you'} x1={0} x2={1} y1={0} y2={1}>
            <stop offset="0%" style={{ stopColor: 'var(--act-1)' }} />
            <stop offset="55%" style={{ stopColor: 'var(--act-2)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--act-3)' }} />
          </linearGradient>
        </defs>

        {/* synapses */}
        <g aria-hidden>
          {edges.map((e, i) => (lit[i].on ? null : <path key={i} d={e.d} className={`td-nn-syn${lit[i].warm ? ' half' : ''}`} />))}
        </g>
        <g aria-hidden>
          {edges.map((e, i) =>
            lit[i].on ? (
              <g key={i}>
                <path d={e.d} className="td-nn-syn lit glow" stroke={url(`g${e.layer}`)} />
                <path d={e.d} className={`td-nn-syn lit${e.b === 'out' ? ' out' : ''}`} stroke={url(`g${e.layer}`)} />
              </g>
            ) : null,
          )}
        </g>

        {/* input + output */}
        <g aria-hidden>
          <circle cx={input.x} cy={input.y} r={input.r * 2.2} fill={url('hi')} opacity={0.7} />
          <circle cx={input.x} cy={input.y} r={input.r} fill={url('you')} />
          {!compact && (
            <text x={input.x} y={input.y + 3.5} textAnchor="middle" className="td-nn-you">
              YOU
            </text>
          )}
          <text x={input.x} y={input.y + input.r + (compact ? 12 : 18)} textAnchor="middle" className="td-nn-io">
            {compact ? 'YOU' : 'INPUT'}
          </text>
        </g>
        <g aria-hidden>
          <circle ref={orbRef} cx={output.x} cy={output.y} r={output.r * 1.5} fill={url('orb')} opacity={0.45 + frac * 0.75} />
          <circle cx={output.x} cy={output.y} r={output.r} className="td-nn-outcore" />
          <text x={output.x} y={output.y + C.pctSize * 0.3} textAnchor="middle" className="td-nn-pct" fill={url('gt')} fontSize={C.pctSize}>
            {pct}%
          </text>
          <text x={output.x} y={output.y + C.pctSize * 0.3 + (compact ? 11 : 16)} textAnchor="middle" className="td-nn-cap">
            COVERED
          </text>
          {!compact && (
            <text x={output.x} y={output.y - output.r - 14} textAnchor="middle" className="td-nn-io">
              OUTPUT
            </text>
          )}
        </g>

        {/* neurons: one tab stop, arrow keys move between them */}
        <g>
          {all.map((n) => {
            const s = st.get(n.topic.id) ?? 'new';
            const isNext = n === next;
            return (
              <g
                key={n.topic.id}
                ref={(g) => {
                  nodeRefs.current[n.i] = g;
                }}
                className={`td-nn-node ${s}`}
                tabIndex={n.i === tabStop ? 0 : -1}
                role="link"
                aria-label={`${n.topic.title}: ${STATUS_TEXT[s]}${isNext ? ', next up' : ''}`}
                onFocus={() => {
                  setFocusIdx(n.i);
                  showTip(n);
                }}
                onBlur={hideTip}
                onPointerLeave={(e: ReactPointerEvent) => e.pointerType !== 'touch' && hideTip()}
                onPointerEnter={(e: ReactPointerEvent) => {
                  lastPointer.current = e.pointerType;
                  // touch shows the tip on tap (onClick), so a first tap never navigates
                  if (e.pointerType !== 'touch') showTip(n);
                }}
                onPointerDown={(e: ReactPointerEvent) => {
                  lastPointer.current = e.pointerType;
                  tipWasOn.current = tip?.n === n;
                }}
                onClick={() => {
                  // touch: the first tap shows what the neuron is, a second tap opens it
                  if (lastPointer.current === 'touch' && !tipWasOn.current) showTip(n);
                  else go(n);
                }}
              >
                <circle cx={n.x} cy={n.y} r={n.r * 3} className="td-nn-halo" fill={s === 'covered' ? url('hi') : s === 'progress' ? url('hp') : 'none'} />
                <circle
                  ref={(c) => {
                    coreRefs.current[n.i] = c;
                  }}
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  className="td-nn-core"
                />
                {s === 'progress' && <path className="td-nn-fill" d={`M${n.x - n.r + 0.7},${n.y} A${n.r - 0.7},${n.r - 0.7} 0 0 0 ${n.x + n.r - 0.7},${n.y} Z`} />}
                {s === 'covered' && <circle cx={n.x - n.r * 0.3} cy={n.y - n.r * 0.3} r={Math.max(1, n.r * 0.28)} className="td-nn-glint" />}
                <circle cx={n.x} cy={n.y} r={Math.max(n.r + 4, compact ? 7 : 9)} className="td-nn-hit" />
                <circle cx={n.x} cy={n.y} r={n.r + 3.5} className="td-nn-focus" />
              </g>
            );
          })}
        </g>
        <g ref={pulseRef} aria-hidden />

        {/* layer labels + NEXT tag */}
        <g aria-hidden>
          {levelCounts.map((l, li) => (
            <g key={li}>
              {!C.short && (
                <text x={colX[li]} y={C.labelY} textAnchor="middle" className="td-nn-lk">
                  {l.numeral} · {l.title.toUpperCase()}
                </text>
              )}
              <text x={colX[li]} y={C.short ? C.labelY + 4 : C.labelY + 17} textAnchor="middle" className={`td-nn-ln l${li + 1}`} fontSize={C.short ? 10.5 : undefined}>
                {C.short ? (
                  <>
                    {l.numeral} <tspan>{l.done}</tspan>
                    <tspan className="of">/{l.total}</tspan>
                  </>
                ) : (
                  <>
                    {l.done}
                    <tspan className="of"> / {l.total}</tspan>
                  </>
                )}
              </text>
            </g>
          ))}
          {nextTag}
        </g>
      </svg>
      <div className={`td-nn-tip${tip ? ' on' : ''}${tip?.below ? ' below' : ''}`} role="tooltip" aria-hidden={!tip} style={tip ? { left: tip.x, top: tip.y } : undefined}>
        {tip && (
          <>
            <span className="td-nn-tip-k">
              Phase {pad(tip.n.phaseNo)} · {tip.n.phaseTitle}
            </span>
            <span className="td-nn-tip-t">{tip.n.topic.title}</span>
            <span className={`td-nn-tip-s ${st.get(tip.n.topic.id)}`}>
              {STATUS_TEXT[st.get(tip.n.topic.id) ?? 'new']}
              {tip.n === next ? ' · next up' : ''}
            </span>
          </>
        )}
      </div>
    </figure>
  );
}
