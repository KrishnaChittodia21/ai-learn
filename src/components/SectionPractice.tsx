import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChevronDown, FlaskConical, Lightbulb, X } from 'lucide-react';
import type { ProsCons, QuickCheck, Section, SectionExercise } from '../types';
import { setDraft, setFlag, useProgress } from '../lib/progress';
import { CodeBlock, CodeEditor, Markdown } from './ui';
import { normalizeLang } from '../lib/highlight';

/** Practice-first extras rendered under every Learn section: worked example, pros/cons with fixes, a coding exercise and a quick check. */
export function SectionPractice({ topicId, index, section }: { topicId: string; index: number; section: Section }) {
  const id = `${topicId}-s${index}`;
  return (
    <>
      {section.example && (
        <section className="tp-example" aria-label="Worked example">
          <div className="tp-kicker ion">Worked example</div>
          <Markdown>{section.example}</Markdown>
        </section>
      )}
      {section.prosCons && <ProsConsTable pc={section.prosCons} />}
      {section.exercise && <ExerciseCard id={`${id}-ex`} ex={section.exercise} />}
      {section.quickCheck && <QuickCheckCard id={`${id}-qc`} qc={section.quickCheck} />}
    </>
  );
}

function ProsConsTable({ pc }: { pc: ProsCons }) {
  return (
    <div className="tp-pc">
      <section className="tp-pc-col tint-ion" aria-label="Pros">
        <div className="tp-kicker ion">+ Pros</div>
        <ul>
          {pc.pros.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
      <section className="tp-pc-col tint-pulsar" aria-label="Cons and how to fix them">
        <div className="tp-kicker pulsar">− Cons → how to fix</div>
        <ul>
          {pc.cons.map((c) => (
            <li key={c.con}>
              {c.con}
              <span className="tp-fix">
                <span className="tp-fix-k">Fix →</span> {c.fix}
              </span>
            </li>
          ))}
        </ul>
      </section>
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
  const started = p.drafts[draftKey] !== undefined && p.drafts[draftKey] !== starter;
  return (
    <div className={`gborder tp-ex-border ${done ? 'done' : ''}`}>
      <section className={`gborder-in tp-ex ${open ? 'open' : ''}`} aria-label="Try it: coding exercise">
        <button type="button" className="tp-ex-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="tp-ex-title">
            <FlaskConical size={18} aria-hidden className="tp-ex-icon" /> Try it · coding exercise
          </span>
          <span className="tp-ex-meta">
            {done ? (
              <span className="tp-ex-done">
                <Check size={13} strokeWidth={3} aria-hidden /> solved
              </span>
            ) : (
              <>
                {normalizeLang(lang)}
                {ex.hints.length > 0 && ` · ${ex.hints.length} hint${ex.hints.length === 1 ? '' : 's'}`}
                {started && ' · draft saved'}
              </>
            )}
            <ChevronDown size={16} aria-hidden className="tp-ex-chev" />
          </span>
        </button>
        <div className="tp-ex-body">
          <Markdown>{ex.prompt}</Markdown>
          {!open ? (
            <div className="tp-ex-actions">
              <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
                {started ? 'Continue your draft' : 'Open the editor'}
              </button>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="tp-ex-open">
              <div className="tp-ex-bar">
                <span>Write your solution here. It saves automatically.</span>
                {starter && (
                  <button className="btn-ghost btn-xs" type="button" onClick={() => setDraft(draftKey, starter)}>
                    Reset
                  </button>
                )}
              </div>
              <CodeEditor value={code} onChange={(v) => setDraft(draftKey, v)} language={lang} />
              {hints > 0 && (
                <div className="hints">
                  {ex.hints.slice(0, hints).map((h, i) => (
                    <div key={i} className="hint">
                      <Lightbulb size={15} aria-hidden className="inline-icon" /> <strong>Hint {i + 1}:</strong> {h}
                    </div>
                  ))}
                </div>
              )}
              <div className="tp-ex-actions">
                {hints < ex.hints.length && (
                  <button className="btn btn-sm" type="button" onClick={() => setHints((h) => h + 1)}>
                    Hint {hints + 1} / {ex.hints.length}
                  </button>
                )}
                <button className="btn btn-sm" type="button" onClick={() => setShowSolution((s) => !s)}>
                  {showSolution ? 'Hide solution' : 'Show solution'}
                </button>
                <button className={`btn btn-sm tp-ex-solve ${done ? '' : 'btn-primary'}`} type="button" onClick={() => setFlag('cc', id, !done)}>
                  {done ? 'Mark not solved' : 'Mark as solved'}
                </button>
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
      </section>
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
    <section className="tp-qc" aria-label="Quick check">
      <div className="tp-kicker solar">Quick check</div>
      <p className="tp-qc-q">{qc.question}</p>
      <div className="tp-qc-options" role="radiogroup" aria-label={qc.question}>
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
              <span className="qc-letter">{String.fromCharCode(65 + i)}</span>
              <span className="qc-text">{o}</span>
              {state === 'correct' && <Check size={20} strokeWidth={2.6} aria-hidden className="qc-icon" />}
              {state === 'wrong' && <X size={20} strokeWidth={2.6} aria-hidden className="qc-icon" />}
            </motion.button>
          );
        })}
      </div>
      {answered && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`qc-feedback ${right ? 'good' : 'bad'}`} aria-live="polite">
          <div className="qc-feedback-text">
            <strong>{right ? 'Correct.' : 'Not quite.'}</strong> <Markdown>{qc.explanation}</Markdown>
          </div>
          <button type="button" className="btn-ghost btn-xs" onClick={() => setDraft(key, '')}>
            Try again
          </button>
        </motion.div>
      )}
    </section>
  );
}
