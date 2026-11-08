// Read less, view more (M7): checks for a section's core and its step lesson (pure; used by
// scripts/validate-content.mjs and tests/steps.test.ts) and the stage geometry the player shares with them.
// Ported from system-design-learn scripts/validate-steps.mjs, trimmed to the actions and tasks ai-learn uses.
import { ACTOR_KINDS, type StepAction, type StepActor, type StepLesson } from '../types.ts';

/** the core may not grow past this many words (the design aims at ~150) */
export const CORE_MAX_WORDS = 180;
/** an actor box, in stage units */
export const BOX = { w: 190, h: 72 };
/** the stage in content coordinates (wide) and on phones (tall: the left-to-right rows become top-to-bottom) */
export const VIEW = { wide: { w: 900, h: 300 }, tall: { w: 500, h: 700 } };
export const toTall = (p: { x: number; y: number }) => ({ x: 190 + (p.y - 130) * 1.45, y: 90 + p.x * 0.68 });
/** a badge pill's width for its text */
export const badgeW = (text: string) => text.length * 9.6 + 26;
// what fits inside a 190-wide box: the title and the monospace subtitle
const MAX_LABEL = 16;
const MAX_SUB = 21;
const ACTIONS = ['say', 'send', 'badge', 'lit', 'down', 'show', 'wait'] as const;
const TASKS = new Set(['pick', 'choose', 'order']);
const LAYOUTS = [
  { name: 'wide', ...VIEW.wide, at: (a: { x: number; y: number }) => a },
  { name: 'phone', ...VIEW.tall, at: toTall },
];

/** words in a markdown string (marks and table pipes don't count) */
export const wordCount = (md: string) => md.replace(/[|*_`#>-]+/g, ' ').split(/\s+/).filter((w) => /\w/.test(w)).length;

export function checkCore(core: unknown, where: string): string[] {
  if (typeof core !== 'string' || !core.trim()) return [`${where}: core must be non-empty markdown`];
  const n = wordCount(core);
  return n > CORE_MAX_WORDS ? [`${where}: core is ${n} words (at most ${CORE_MAX_WORDS})`] : [];
}

/** every box inside the stage and clear of the others, on desktop and on phones */
function checkLayout(actors: StepActor[], where: string): string[] {
  const e: string[] = [];
  for (const L of LAYOUTS) {
    const boxes = actors.map((a) => ({ id: a.id, ...L.at(a) }));
    for (const b of boxes) {
      if (b.x - BOX.w / 2 < 0 || b.x + BOX.w / 2 > L.w || b.y - BOX.h / 2 < 0 || b.y + BOX.h / 2 > L.h) e.push(`${where}: actor "${b.id}" sticks out of the ${L.name} stage`);
    }
    boxes.forEach((p, i) =>
      boxes.slice(i + 1).forEach((q) => {
        if (Math.abs(p.x - q.x) < BOX.w && Math.abs(p.y - q.y) < BOX.h) e.push(`${where}: actors "${p.id}" and "${q.id}" overlap on the ${L.name} stage`);
      }),
    );
  }
  return e;
}

/** Problems with one section's step lesson (empty when fine). */
export function checkSteps(lesson: StepLesson, where: string): string[] {
  const e: string[] = [];
  const actors = new Map<string, StepActor>();
  for (const a of lesson.actors ?? []) {
    if (!a.id || !a.label) e.push(`${where}: every actor needs an id and a label`);
    if (!(ACTOR_KINDS as readonly string[]).includes(a.kind)) e.push(`${where}: actor "${a.id}" has an unknown kind "${a.kind}" (one of ${ACTOR_KINDS.join(', ')})`);
    if (a.label?.length > MAX_LABEL) e.push(`${where}: actor "${a.id}" label is too long for its box (max ${MAX_LABEL} characters)`);
    if ((a.sub?.length ?? 0) > MAX_SUB) e.push(`${where}: actor "${a.id}" subtitle is too long for its box (max ${MAX_SUB} characters)`);
    if (actors.has(a.id)) e.push(`${where}: duplicate actor "${a.id}"`);
    actors.set(a.id, a);
  }
  if (actors.size < 2) e.push(`${where}: needs at least 2 actors`);
  e.push(...checkLayout(lesson.actors ?? [], where));
  const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
  if (steps.length < 4 || steps.length > 12) e.push(`${where}: ${steps.length} steps (needs 4–12)`);
  if (!steps.some((s) => s.kind === 'turn')) e.push(`${where}: needs at least one Your turn step`);
  if (steps[0]?.kind === 'turn') e.push(`${where}: open with a Watch step, not a Your turn`);

  const actor = (id: string, at: string) => {
    if (!actors.has(id)) e.push(`${at}: unknown actor "${id}"`);
  };
  const script = (list: StepAction[] | undefined, at: string, lines: number) => {
    for (const a of list ?? []) {
      const kind = ACTIONS.find((k) => k in a);
      if (!kind) {
        e.push(`${at}: unknown action ${JSON.stringify(a)}`);
        continue;
      }
      if ('say' in a && !(Number.isInteger(a.say) && a.say >= 0 && a.say < lines)) e.push(`${at}: say ${a.say} but the step has ${lines} lines`);
      if ('send' in a) a.send.forEach((id) => actor(id, at));
      if ('wait' in a && !(a.wait > 0 && a.wait <= 5000)) e.push(`${at}: wait must be 1–5000 ms`);
      const target = 'badge' in a ? a.badge : 'lit' in a ? a.lit : 'down' in a ? a.down : 'show' in a ? a.show : null;
      if (target !== null) actor(target, at);
      if ('badge' in a) {
        const who = actors.get(a.badge);
        if (who)
          for (const L of LAYOUTS) {
            const { x } = L.at(who);
            if (x - badgeW(a.text) / 2 < 0 || x + badgeW(a.text) / 2 > L.w) e.push(`${at}: badge "${a.text}" is cut off on the ${L.name} stage (shorten it)`);
          }
      }
    }
  };

  steps.forEach((s, i) => {
    const at = `${where} step ${i + 1} "${s.title ?? ''}"`;
    if (!s.title?.trim()) e.push(`${at}: no title`);
    if (!(s.lines?.length >= 1 && s.lines.length <= 5)) e.push(`${at}: needs 1–5 lines`);
    const n = s.lines?.length ?? 0;
    if (s.kind === 'watch') {
      if (!s.script?.length) e.push(`${at}: a Watch step needs a script`);
      script(s.script, at, n);
      if (!s.script?.some((a) => 'say' in a)) e.push(`${at}: the script never lights a line (say)`);
      return;
    }
    if (s.kind !== 'turn') return void e.push(`${at}: kind must be watch or turn`);
    script(s.setup, `${at} setup`, n);
    script(s.then, `${at} then`, n);
    if (!s.solved?.trim()) e.push(`${at}: needs a "solved" takeaway`);
    const t = s.task;
    if (!t || !TASKS.has(t.type)) return void e.push(`${at}: unknown task "${(t as { type?: string } | undefined)?.type}"`);
    if (!t.question?.trim()) e.push(`${at}: the task needs a question`);
    if (t.type === 'pick') {
      actor(t.answer, at);
      Object.keys(t.hints ?? {}).forEach((id) => actor(id, at));
      if (!Object.keys(t.hints ?? {}).length) e.push(`${at}: pick needs at least one wrong actor with a hint`);
      if (t.hints?.[t.answer]) e.push(`${at}: the answer can't also be a wrong pick`);
    }
    if (t.type === 'choose') {
      if (!(t.options?.length >= 2 && t.options.length <= 5)) e.push(`${at}: choose needs 2–5 options`);
      if (!Number.isInteger(t.answer) || t.answer < 0 || t.answer >= (t.options?.length ?? 0)) e.push(`${at}: answer index out of range`);
      if (t.options?.some((o, k) => k !== t.answer && !o.why?.trim())) e.push(`${at}: every wrong option needs a why`);
    }
    if (t.type === 'order' && !(t.items?.length >= 3 && new Set(t.items).size === t.items.length && t.hint?.trim())) e.push(`${at}: order needs 3+ distinct items and a hint`);
  });
  return e;
}

/** a fixed order per question (same every visit), so the right answer is not always in the same place */
export function shuffleFor(seed: string, n: number): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** order tasks show their items shuffled, never already in the right order */
export function orderShown(items: string[], seed: string): number[] {
  const s = shuffleFor(seed, items.length);
  return s.every((k, i) => k === i) ? [...s.slice(1), s[0]] : s;
}
