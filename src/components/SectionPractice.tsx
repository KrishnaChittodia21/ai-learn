import { useState } from 'react';
import { motion } from 'motion/react';
import { CircleCheck, CircleX, FlaskConical, Lightbulb, Sparkles, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';
import type { ProsCons, QuickCheck, Section, SectionExercise } from '../types';
import { setDraft, setFlag, useProgress } from '../lib/progress';
import { Badge, CodeBlock, CodeEditor, Markdown } from './ui';

/** Practice-first extras rendered under every Learn section: worked example, pros/cons with fixes, a coding exercise and a quick check. */
export function SectionPractice({ topicId, index, section }: { topicId: string; index: number; section: Section }) {
  const id = `${topicId}-s${index}`;
  return (
    <>
      {section.example && (
        <div className="example-box">
          <div className="example-title">
            <Sparkles size={14} aria-hidden /> Worked example
          </div>
          <Markdown>{section.example}</Markdown>
        </div>
      )}
      {section.prosCons && <ProsConsTable pc={section.prosCons} />}
      {section.exercise && <ExerciseCard id={`${id}-ex`} ex={section.exercise} />}
      {section.quickCheck && <QuickCheckCard id={`${id}-qc`} qc={section.quickCheck} />}
    </>
  );
}

function ProsConsTable({ pc }: { pc: ProsCons }) {
  return (
    <div className="proscons">
      <div className="proscons-col pros">
        <div className="proscons-title">
          <ThumbsUp size={14} aria-hidden /> Pros
        </div>
        <ul>
          {pc.pros.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <div className="proscons-col cons">
        <div className="proscons-title">
          <ThumbsDown size={14} aria-hidden /> Cons <span className="muted">→ how to overcome</span>
        </div>
        <ul>
          {pc.cons.map((c) => (
            <li key={c.con}>
              <span>{c.con}</span>
              <span className="fix">
                <Wrench size={13} aria-hidden className="inline-icon" /> {c.fix}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ExerciseCard({ id, ex }: { id: string; ex: SectionExercise }) {
  const p = useProgress();
  const draftKey = `ex:${id}`;
  const starter = ex.starter?.code ?? '';
  const lang = ex.starter?.language ?? ex.solution.language;
  const code = p.drafts[draftKey] ?? starter;
  const [hints, setHints] = useState(0);
  const [open, setOpen] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const done = !!p.cc[id];
  return (
    <div className={`exercise ${done ? 'done' : ''}`}>
      <button type="button" className="exercise-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="exercise-title">
          <FlaskConical size={16} aria-hidden /> Try it: coding exercise
        </span>
        {done ? <Badge tone="good">Done</Badge> : <span className="small muted">{open ? 'Hide' : 'Open'}</span>}
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="exercise-body">
          <Markdown>{ex.prompt}</Markdown>
          <div className="row between">
            <span className="small muted">Write your solution here. It saves automatically.</span>
            {starter && (
              <button className="btn-ghost btn-xs" type="button" onClick={() => setDraft(draftKey, starter)}>
                Reset
              </button>
            )}
          </div>
          <CodeEditor value={code} onChange={(v) => setDraft(draftKey, v)} language={lang} />
          <div className="hints">
            {ex.hints.slice(0, hints).map((h, i) => (
              <div key={i} className="hint">
                <Lightbulb size={15} aria-hidden className="inline-icon" /> <strong>Hint {i + 1}:</strong> {h}
              </div>
            ))}
            <div className="row gap-s wrap">
              {hints < ex.hints.length && (
                <button className="btn btn-sm" type="button" onClick={() => setHints((h) => h + 1)}>
                  Hint {hints + 1}/{ex.hints.length}
                </button>
              )}
              <button className="btn btn-sm" type="button" onClick={() => setShowSolution((s) => !s)}>
                {showSolution ? 'Hide solution' : 'Show solution'}
              </button>
              <button className={`btn btn-sm ${done ? '' : 'btn-primary'}`} type="button" onClick={() => setFlag('cc', id, !done)}>
                {done ? 'Mark not done' : 'Mark as done'}
              </button>
            </div>
          </div>
          {showSolution && (
            <div className="solution">
              <CodeBlock snippet={ex.solution} />
              {ex.explanation && <Markdown>{ex.explanation}</Markdown>}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function QuickCheckCard({ id, qc }: { id: string; qc: QuickCheck }) {
  const p = useProgress();
  const key = `qc:${id}`;
  const saved = p.drafts[key];
  const picked = saved === undefined || saved === '' ? null : Number(saved);
  const answered = picked !== null;
  const right = picked === qc.correct;
  return (
    <div className="quickcheck">
      <div className="quickcheck-title">Quick check</div>
      <p className="quickcheck-q">{qc.question}</p>
      <div className="quickcheck-options" role="radiogroup" aria-label={qc.question}>
        {qc.options.map((o, i) => {
          const state = !answered ? '' : i === qc.correct ? 'correct' : i === picked ? 'wrong' : 'dim';
          return (
            <motion.button
              key={i}
              type="button"
              role="radio"
              aria-checked={picked === i}
              disabled={answered}
              className={`qc-option ${state}`}
              whileTap={answered ? undefined : { scale: 0.98 }}
              onClick={() => setDraft(key, String(i))}
            >
              <span className="qc-letter">{String.fromCharCode(65 + i)}</span> {o}
              {state === 'correct' && <CircleCheck size={16} aria-hidden className="qc-icon" />}
              {state === 'wrong' && <CircleX size={16} aria-hidden className="qc-icon" />}
            </motion.button>
          );
        })}
      </div>
      {answered && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`qc-feedback ${right ? 'good' : 'bad'}`} aria-live="polite">
          <strong>{right ? 'Correct.' : 'Not quite.'}</strong> <Markdown>{qc.explanation}</Markdown>
          <button type="button" className="btn-ghost btn-xs" onClick={() => setDraft(key, '')}>
            Try again
          </button>
        </motion.div>
      )}
    </div>
  );
}
