// A section taught as small animated steps (M7, ported from system-design-learn). Watch steps loop like a GIF;
// a Your-turn step must be solved before Next opens: a hint after a miss, "Show me" after two.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Pause, Play } from 'lucide-react';
import type { Step, StepLesson as Lesson, StepTask } from '../../types';
import { orderShown, shuffleFor } from '../../lib/steps';
import { quiet, Stage, VIEWBOX } from './stage';

/** **bold** and `code`, nothing else */
function inline(s: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((p, i) =>
    p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <Fragment key={i}>{p}</Fragment>,
  );
}

interface Props {
  lesson: Lesson;
  /** shown in the eyebrow, e.g. "RAG §1" */
  name: string;
  /** every Your turn solved and Finish pressed; `missed` = Your turns not solved on the first try */
  onFinish: (missed: number) => void;
  onRead: () => void;
}

export function StepLesson({ lesson, name, onFinish, onRead }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const stage = useRef<Stage | null>(null);
  const [cur, setCur] = useState(0);
  const [line, setLine] = useState(-1);
  const [paused, setPaused] = useState(false);
  // phones: the diagram turns tall so its text stays readable
  const [tall, setTall] = useState(false);
  const [solved, setSolved] = useState<Set<number>>(() => new Set());
  const [missed, setMissed] = useState<Set<number>>(() => new Set());
  const steps = lesson.steps;
  const step = steps[cur];
  const labels = useMemo(() => Object.fromEntries(lesson.actors.map((a) => [a.id, a.label])), [lesson]);
  const turns = useMemo(() => steps.flatMap((s, i) => (s.kind === 'turn' ? [i] : [])), [steps]);
  // a step opens once every Your turn before it is solved
  const reachable = (k: number) => turns.every((t) => t >= k || solved.has(t));
  const isSolved = solved.has(cur);
  const blocked = step.kind === 'turn' && !isSolved;
  const last = cur === steps.length - 1;

  useEffect(() => {
    const box = svg.current!.parentElement!;
    // below ~440px the wide diagram's text would shrink under 11px
    const ro = new ResizeObserver(() => setTall(box.clientWidth < 440));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    stage.current = new Stage(svg.current!, lesson, setLine, tall);
    return () => stage.current?.reset();
  }, [lesson, tall]);

  // each step starts from a clean stage; Watch steps, and Your turns once solved, loop like a GIF
  useEffect(() => {
    const st = stage.current!;
    st.reset();
    if (step.kind === 'watch') void quiet(st.loop(step.script));
    else if (isSolved && step.then) void quiet(st.loop(step.then, step.setup));
    else void quiet(st.play(step.setup ?? []));
  }, [step, isSolved, tall]);

  const go = (k: number) => {
    if (k < 0 || k >= steps.length || !reachable(k)) return;
    setCur(k);
    setLine(-1);
    setPaused(false);
  };
  const next = () => {
    if (blocked) return;
    if (last) onFinish(missed.size);
    else go(cur + 1);
  };
  const togglePause = () => {
    stage.current!.paused = !paused;
    setPaused(!paused);
  };

  // ← → move between steps and Space pauses while focus is inside this lesson
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName) && e.key === ' ') return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || !root.current?.contains(t)) return;
      if (e.key === 'ArrowRight' && !blocked && !last) go(cur + 1);
      if (e.key === 'ArrowLeft') go(cur - 1);
      if (e.key === ' ' && t === root.current) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const solve = (missedIt: boolean) => {
    if (missedIt) setMissed((m) => new Set(m).add(cur));
    setSolved((s) => new Set(s).add(cur));
    setPaused(false);
  };

  return (
    <div className="sl" ref={root} tabIndex={0} role="region" aria-label={`Step lesson: ${name}. Use the left and right arrow keys to move between steps.`}>
      <div className="sl-bar">
        <div className="sl-eyebrow">
          <b>Steps</b> <span aria-hidden>·</span> <span>{name}</span> <span aria-hidden>·</span>{' '}
          <span className="mono">
            {cur + 1} / {steps.length}
          </span>
        </div>
        <ol className="sl-dots" aria-label="Steps">
          {steps.map((s, k) => (
            <li key={k}>
              <button
                type="button"
                className={`sl-dot ${s.kind === 'turn' ? 'turn' : ''} ${k === cur ? 'now' : ''} ${solved.has(k) || (s.kind === 'watch' && k < cur) ? 'done' : ''}`}
                aria-label={`Step ${k + 1}: ${s.title}${s.kind === 'turn' ? ' (your turn)' : ''}`}
                aria-current={k === cur ? 'step' : undefined}
                disabled={!reachable(k)}
                onClick={() => go(k)}
              />
            </li>
          ))}
        </ol>
      </div>

      <div className="sl-body">
        <div className="sl-stage">
          <svg ref={svg} viewBox={tall ? VIEWBOX.tall : VIEWBOX.wide} role="img" aria-label={`Diagram for step ${cur + 1}: ${step.title}`} />
        </div>
        <div className="sl-side">
          <div className={`sl-kind ${step.kind}`}>{step.kind === 'turn' ? '✎ Your turn' : '▶ Watch'}</div>
          <h3 className="sl-title">{step.title}</h3>
          <ol className="sl-lines">
            {step.lines.map((l, k) => (
              <li key={k} className={k === line ? 'on' : k < line ? 'done' : ''}>
                <span>{inline(l)}</span>
              </li>
            ))}
          </ol>
          {step.kind === 'turn' && <Task key={cur} step={step} stage={stage} done={isSolved} onSolve={solve} labels={labels} />}
        </div>
      </div>

      <div className="sl-nav">
        <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => go(cur - 1)}>
          <ArrowLeft size={15} aria-hidden /> Back
        </button>
        <button type="button" className="btn-ghost btn-sm sl-pause" aria-pressed={paused} onClick={togglePause}>
          {paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />} {paused ? 'Play' : 'Pause'}
        </button>
        <button type="button" className="btn-ghost btn-sm sl-read" onClick={onRead}>
          <BookOpen size={15} aria-hidden /> Read it instead
        </button>
        <button type="button" className="btn btn-primary btn-sm sl-next" disabled={blocked} onClick={next}>
          {blocked ? 'Solve it to continue' : last ? 'Finish ✓' : 'Next'} {!blocked && !last && <ArrowRight size={15} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

type TurnStep = Extract<Step, { kind: 'turn' }>;

/** one Your-turn task: shared feedback, a hint after a miss and "Show me" after two */
function Task({ step, stage, done, onSolve, labels }: { step: TurnStep; stage: RefObject<Stage | null>; done: boolean; onSolve: (missed: boolean) => void; labels: Record<string, string> }) {
  const [misses, setMisses] = useState(0);
  const [hint, setHint] = useState('');
  const t = step.task;
  const right = () => onSolve(misses > 0);
  const wrong = (h: string) => {
    setMisses((m) => m + 1);
    setHint(h);
  };

  // a pick task also works by clicking the boxes on the diagram
  useEffect(() => {
    if (t.type !== 'pick' || done) return;
    const st = stage.current!;
    st.pickable(pickIds(t), (id) => {
      if (id === t.answer) return right();
      st.wrongPick(id);
      wrong(t.hints[id] ?? 'Not that one.');
    });
    return () => st.pickable(null);
  });

  return (
    <div className={`sl-task ${done ? 'is-done' : ''}`}>
      <p className="sl-q">{inline(t.question)}</p>
      {t.type === 'pick' && !done && <p className="sl-muted">Click a box on the diagram, or use the buttons.</p>}
      <TaskBody task={t} done={done} onRight={right} onWrong={wrong} labels={labels} />
      <div aria-live="polite">
        {(done || hint) && (
          <div className={`sl-fb ${done ? 'ok' : 'no'}`}>
            <b>{done ? 'Right.' : 'Not quite.'}</b> {inline(done ? step.solved : hint)}
          </div>
        )}
      </div>
      {!done && misses >= 2 && (
        <button type="button" className="btn btn-sm sl-reveal" onClick={() => onSolve(true)}>
          Show me
        </button>
      )}
    </div>
  );
}

const pickIds = (t: Extract<StepTask, { type: 'pick' }>) => shuffleFor(t.question, Object.keys(t.hints).length + 1).map((k) => [...Object.keys(t.hints), t.answer][k]);

function TaskBody({ task: t, done, onRight, onWrong, labels }: { task: StepTask; done: boolean; onRight: () => void; onWrong: (hint: string) => void; labels: Record<string, string> }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [tried, setTried] = useState<Set<string>>(() => new Set());
  const miss = (k: string, hint: string) => {
    setTried((s) => new Set(s).add(k));
    onWrong(hint);
  };
  const cls = (k: string, isAnswer: boolean) => (done && isAnswer ? 'right' : !done && tried.has(k) ? 'wrong' : '');
  switch (t.type) {
    case 'pick':
      return (
        <div className="sl-opts">
          {pickIds(t).map((id) => (
            <button key={id} type="button" className={`sl-opt ${cls(id, id === t.answer)}`} disabled={done} onClick={() => (id === t.answer ? onRight() : miss(id, t.hints[id]))}>
              {labels[id] ?? id}
            </button>
          ))}
        </div>
      );
    case 'choose':
      return (
        <div className="sl-opts">
          {shuffleFor(t.question, t.options.length).map((k, pos) => {
            const o = t.options[k];
            return (
              <button
                key={k}
                type="button"
                className={`sl-opt ${cls(String(k), k === t.answer)}`}
                disabled={done}
                onClick={() => (k === t.answer ? onRight() : miss(String(k), o.why ?? 'Read the lines beside the diagram again.'))}
              >
                <span className="sl-opt-k">{'ABCDE'[pos]}</span>
                <span>{inline(o.text)}</span>
              </button>
            );
          })}
        </div>
      );
    case 'order': {
      const shown = orderShown(t.items, t.question);
      const filled = done ? t.items.length : picked.length;
      const tap = (k: number) => {
        if (k !== picked.length) return onWrong(t.hint);
        setPicked([...picked, k]);
        if (picked.length + 1 === t.items.length) onRight();
      };
      return (
        <>
          <div className="sl-row">
            {shown.map((k) => (
              <button key={k} type="button" className={`sl-token ${done || picked.includes(k) ? 'used' : ''}`} disabled={done || picked.includes(k)} onClick={() => tap(k)}>
                {t.items[k]}
              </button>
            ))}
          </div>
          <ol className="sl-slots">
            {t.items.map((it, k) => (
              <li key={k} className={k < filled ? 'filled' : ''}>
                {k < filled ? it : ''}
              </li>
            ))}
          </ol>
        </>
      );
    }
  }
}
