// The diagram of a step lesson (M7, ported from system-design-learn): draws the AI actors once, then plays
// StepActions on top. Imperative on purpose: packets move every frame, and React state per frame would re-render
// the whole lesson. Box size, stages and the phone layout live in src/lib/steps.ts (the validator uses them too).
import type { ActorKind, StepAction, StepActor, StepLesson } from '../../types';
import { BOX, toTall, VIEW } from '../../lib/steps';

export const VIEWBOX = { wide: `0 0 ${VIEW.wide.w} ${VIEW.wide.h}`, tall: `0 0 ${VIEW.tall.w} ${VIEW.tall.h}` };
type Pt = { x: number; y: number };

const KIND_LABEL: Record<ActorKind, string> = {
  user: 'USER',
  document: 'DOCUMENT',
  chunker: 'CHUNKER',
  embedder: 'EMBEDDER',
  'vector-db': 'VECTOR DB',
  retriever: 'RETRIEVER',
  reranker: 'RERANKER',
  llm: 'LLM',
  tool: 'TOOL',
  agent: 'AGENT',
  judge: 'JUDGE',
};

const NS = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent?.appendChild(n);
  return n;
}
function text(parent: Element, attrs: Record<string, string | number>, s: string) {
  const t = el('text', attrs, parent);
  t.textContent = s;
  return t;
}
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export class Cancelled extends Error {}

export class Stage {
  private token = 0;
  paused = false;
  private readonly reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly fx: SVGGElement;
  private readonly nodes = new Map<string, SVGGElement>();
  private readonly lesson: StepLesson;
  private readonly onSay: (line: number) => void;
  private readonly tall: boolean;

  constructor(svg: SVGSVGElement, lesson: StepLesson, onSay: (line: number) => void, tall = false) {
    this.lesson = lesson;
    this.onSay = onSay;
    this.tall = tall;
    svg.replaceChildren();
    const nodesG = el('g', { class: 'st-nodes' }, svg);
    this.fx = el('g', {}, svg);
    for (const a of lesson.actors) {
      const c = this.at(a.id);
      const g = el('g', { class: `st-node k-${a.kind}`, transform: `translate(${c.x - BOX.w / 2} ${c.y - BOX.h / 2})` }, nodesG);
      el('rect', { width: BOX.w, height: BOX.h, rx: 14 }, g);
      el('rect', { class: 'st-node-bar', width: 4, height: BOX.h - 24, x: 8, y: 12, rx: 2 }, g);
      text(g, { class: 'st-node-k', x: BOX.w / 2, y: 21, 'text-anchor': 'middle' }, KIND_LABEL[a.kind] ?? a.kind);
      text(g, { class: 'st-node-t', x: BOX.w / 2, y: a.sub ? 45 : 50, 'text-anchor': 'middle' }, a.label);
      if (a.sub) text(g, { class: 'st-node-s', x: BOX.w / 2, y: 62, 'text-anchor': 'middle' }, a.sub);
      this.nodes.set(a.id, g);
    }
    this.reset();
  }

  private actor(id: string): StepActor {
    const a = this.lesson.actors.find((x) => x.id === id);
    if (!a) throw new Error(`unknown actor "${id}"`);
    return a;
  }
  /** where an actor's centre is drawn in the current layout */
  private at(id: string): Pt {
    const a = this.actor(id);
    return this.tall ? toTall(a) : { x: a.x, y: a.y };
  }

  /** back to the starting picture; stops whatever was playing */
  reset() {
    this.token++;
    this.paused = false;
    this.fx.replaceChildren();
    for (const a of this.lesson.actors) {
      const g = this.nodes.get(a.id)!;
      g.classList.remove('lit', 'down', 'wrongpick');
      g.classList.toggle('hidden', !!a.hidden);
    }
    this.pickable(null);
  }

  /** make actors clickable for a "pick" task; null turns it off */
  pickable(ids: string[] | null, onPick?: (id: string) => void) {
    for (const [id, g] of this.nodes) {
      const on = !!ids?.includes(id);
      g.classList.toggle('pickable', on);
      if (!on) {
        g.removeAttribute('tabindex');
        g.removeAttribute('role');
        g.removeAttribute('aria-label');
        g.onclick = g.onkeydown = null;
        continue;
      }
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', this.actor(id).label);
      g.onclick = () => onPick?.(id);
      g.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick?.(id);
        }
      };
    }
  }
  wrongPick(id: string) {
    this.nodes.get(id)?.classList.add('wrongpick');
  }

  /** waits on frames, so pausing freezes it */
  sleep(ms: number) {
    const my = this.token;
    let left = this.reduce ? Math.min(ms, 150) : ms;
    let last = performance.now();
    return new Promise<void>((res, rej) => {
      const tick = (now: number) => {
        if (my !== this.token) return rej(new Cancelled());
        if (!this.paused) left -= now - last;
        last = now;
        if (left <= 0) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  private tween(ms: number, frame: (e: number) => void) {
    const my = this.token;
    let t = 0;
    let last = performance.now();
    return new Promise<void>((res, rej) => {
      const step = (now: number) => {
        if (my !== this.token) return rej(new Cancelled());
        if (!this.paused) t += now - last;
        last = now;
        const k = this.reduce ? 1 : Math.min(1, t / ms);
        frame(easeInOut(k));
        if (k >= 1) res();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  private async send(from: string, to: string, label = '', tone = 'req', curve = false, lane = 0) {
    const a = this.at(from);
    const b = this.at(to);
    // leave and arrive at the box edges facing each other, along whichever way the boxes are further apart
    const sideways = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    let p: Pt, q: Pt, c: Pt;
    if (sideways) {
      const dir = Math.sign(b.x - a.x) || 1;
      p = { x: a.x + (dir * BOX.w) / 2, y: a.y + lane };
      q = { x: b.x - (dir * BOX.w) / 2, y: b.y + lane };
      c = { x: (p.x + q.x) / 2, y: Math.min(p.y, q.y) - 140 };
    } else {
      const dir = Math.sign(b.y - a.y) || 1;
      p = { x: a.x + lane, y: a.y + (dir * BOX.h) / 2 };
      q = { x: b.x + lane, y: b.y - (dir * BOX.h) / 2 };
      if (curve) [p, q] = [{ x: a.x + BOX.w / 2, y: a.y }, { x: b.x + BOX.w / 2, y: b.y }];
      c = { x: Math.min(Math.max(p.x, q.x) + 170, this.tall ? 490 : 890), y: (p.y + q.y) / 2 };
    }
    let arc: SVGPathElement | undefined;
    if (curve) arc = el('path', { class: `st-arc tone-${tone}`, d: `M${p.x} ${p.y} Q${c.x} ${c.y} ${q.x} ${q.y}` }, this.fx);
    const g = el('g', { class: `st-pk tone-${tone}` }, this.fx);
    el('circle', { r: 8 }, g);
    if (label) text(g, { class: 'st-pk-l', ...(sideways ? { y: -15, 'text-anchor': 'middle' } : { x: 16, y: 5 }) }, label);
    try {
      await this.tween(curve ? 950 : 850, (e) => {
        const x = curve ? (1 - e) ** 2 * p.x + 2 * (1 - e) * e * c.x + e * e * q.x : p.x + (q.x - p.x) * e;
        const y = curve ? (1 - e) ** 2 * p.y + 2 * (1 - e) * e * c.y + e * e * q.y : p.y + (q.y - p.y) * e;
        g.setAttribute('transform', `translate(${x} ${y})`);
      });
    } finally {
      g.remove();
      arc?.remove();
    }
  }

  private async badge(id: string, s: string, tone = 'ok', ms = 900) {
    const a = this.at(id);
    const g = el('g', { class: `st-badge tone-${tone}`, transform: `translate(${a.x} ${a.y - BOX.h / 2 - 20})` }, this.fx);
    const w = s.length * 9.6 + 26;
    el('rect', { x: -w / 2, y: -14, width: w, height: 26, rx: 13 }, g);
    text(g, { y: 4, 'text-anchor': 'middle' }, s);
    try {
      await this.sleep(ms);
    } finally {
      g.remove();
    }
  }

  async do(a: StepAction) {
    if ('say' in a) this.onSay(a.say);
    else if ('send' in a) {
      const n = a.count ?? 1;
      await Promise.all(
        Array.from({ length: n }, (_, k) =>
          this.sleep(k * 120).then(() => this.send(a.send[0], a.send[1], k === n - 1 ? a.label : '', a.tone, a.curve, n > 1 ? (k - (n - 1) / 2) * 14 : 0)),
        ),
      );
    } else if ('badge' in a) await this.badge(a.badge, a.text, a.tone, a.ms);
    else if ('lit' in a) this.nodes.get(a.lit)?.classList.toggle('lit', a.on ?? true);
    else if ('down' in a) this.nodes.get(a.down)?.classList.toggle('down', a.on ?? true);
    else if ('show' in a) this.nodes.get(a.show)?.classList.toggle('hidden', !(a.on ?? true));
    else if ('wait' in a) await this.sleep(a.wait);
  }

  async play(actions: StepAction[]) {
    for (const a of actions) await this.do(a);
  }

  /** GIF-style: repeats until the step changes (once with reduced motion); `setup` restores the start each loop */
  async loop(actions: StepAction[], setup: StepAction[] = []) {
    for (;;) {
      this.fx.replaceChildren();
      for (const g of this.nodes.values()) g.classList.remove('lit');
      await this.play(setup);
      this.onSay(-1);
      await this.play(actions);
      this.onSay(Number.MAX_SAFE_INTEGER);
      if (this.reduce) return;
      await this.sleep(1800);
    }
  }
}

/** a cancelled animation is not an error */
export const quiet = (p: Promise<unknown>) =>
  p.catch((e: unknown) => {
    if (!(e instanceof Cancelled)) throw e;
  });
