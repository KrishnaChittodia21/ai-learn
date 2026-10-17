import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { COMPANY_QUESTIONS, LEVELS, LEVEL_OF_TOPIC, TOPICS } from '../content';
import { useProgress } from '../lib/progress';
import { nextStep } from '../lib/nextStep';
import { useFocusTrap } from '../lib/useFocusTrap';
import { closeTour } from '../lib/guide';
import { saveUiPrefs } from '../lib/uiPrefs';

const NUMERALS = ['I', 'II', 'III', 'IV'];
const pad = (n: number) => String(n).padStart(2, '0');

interface Step {
  /** short name for the step index */
  short: string;
  title: string;
  body: ReactNode;
}

/** First-visit guide, "How this manual works" (also opened from the Guide button or the "?" key). */
export default function WelcomeTour() {
  const p = useProgress();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const next = useMemo(() => nextStep(p, TOPICS, { companyTotal: COMPANY_QUESTIONS.length }), [p]);
  const close = useCallback(() => {
    saveUiPrefs({ tourSeen: true });
    closeTour();
  }, []);
  useFocusTrap(ref, true, close);
  const steps = STEPS();
  const last = steps.length - 1;
  const go = (i: number) => {
    setDir(i > step ? 1 : -1);
    setStep(Math.max(0, Math.min(last, i)));
  };
  const finish = (href: string) => {
    close();
    nav(href);
  };
  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') go(step + 1);
    if (e.key === 'ArrowLeft') go(step - 1);
  };
  const shift = reduce ? 0 : 14;

  return (
    <motion.div
      className="modal-backdrop tour-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.16 }}
    >
      <motion.div
        ref={ref}
        className="modal tour"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-kicker"
        tabIndex={-1}
        onKeyDown={onKey}
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduce ? 0 : 6 }}
        transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="tour-top">
          <p className="tour-kicker" id="tour-kicker">
            Guide · How this manual works
          </p>
          <button type="button" className="btn-ghost btn-icon tour-close" aria-label="Close guide" onClick={close}>
            <X size={18} aria-hidden />
          </button>
        </header>

        <ol className="tour-index" aria-label="Guide steps">
          {steps.map((s, i) => (
            <li key={s.short}>
              <button
                type="button"
                className={`tour-index-btn ${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => go(i)}
              >
                <span className="tour-index-num">{pad(i + 1)}</span>
                <span className="tour-index-label">{s.short}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="tour-stage">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * shift }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -shift }}
              transition={{ duration: reduce ? 0 : 0.16, ease: 'easeOut' }}
            >
              <h2 id="tour-title" className="tour-title">
                {steps[step].title}
              </h2>
              {steps[step].body}
              {step === last && (
                <div className="tour-cta">
                  <p className="tour-cta-kicker">Your next step</p>
                  <button type="button" className="btn btn-primary btn-lg" data-autofocus onClick={() => finish(next.href)}>
                    <span className="tour-cta-text">{next.title}</span> <ArrowRight size={16} aria-hidden />
                  </button>
                  <button type="button" className="btn btn-lg" onClick={() => finish('/contents')}>
                    Open the syllabus
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="tour-foot">
          {step < last ? (
            <button type="button" className="btn-ghost btn-sm" onClick={close}>
              Skip the guide
            </button>
          ) : (
            <span className="tour-foot-note">
              Reopen any time with <kbd>?</kbd>
            </span>
          )}
          <div className="row gap-s">
            <button type="button" className="btn btn-sm" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous step">
              <ArrowLeft size={15} aria-hidden /> Back
            </button>
            {step < last ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => go(step + 1)} data-autofocus={step === 0 ? true : undefined}>
                Next <ArrowRight size={15} aria-hidden />
              </button>
            ) : (
              <button type="button" className="btn btn-sm" onClick={close}>
                Done
              </button>
            )}
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function STEPS(): Step[] {
  return [
    {
      short: 'The course',
      title: 'A field manual for Generative AI',
      body: (
        <>
          <p className="tour-lead">
            {TOPICS.length} topics, read in order from first principles to production systems. Each one is short, practical and
            ends in a timed exam. Pass the exam and the topic is marked <em>covered</em>.
          </p>
          <table className="tour-levels">
            <caption className="sr-only">Topics per level</caption>
            <tbody>
              {LEVELS.map((lv, i) => (
                <tr key={lv.id}>
                  <th scope="row">
                    <span className="tour-numeral">{NUMERALS[i]}</span> {lv.title}
                  </th>
                  <td>{TOPICS.filter((t) => LEVEL_OF_TOPIC.get(t.id) === lv.id).length} topics</td>
                </tr>
              ))}
              <tr>
                <th scope="row">
                  <span className="tour-numeral">+</span> Architecture challenges
                </th>
                <td>{COMPANY_QUESTIONS.length} cases</td>
              </tr>
            </tbody>
          </table>
          <p className="tour-note">The challenges open once every topic exam is passed.</p>
        </>
      ),
    },
    {
      short: 'Finding your way',
      title: 'Five places, one search',
      body: (
        <>
          <p className="tour-lead">The masthead at the top of every page holds everything.</p>
          <dl className="tour-defs">
            <div>
              <dt>Today</dt>
              <dd>Your next step, where you left off, and your study record.</dd>
            </div>
            <div>
              <dt>Syllabus</dt>
              <dd>Every level, phase and topic, with your status beside each.</dd>
            </div>
            <div>
              <dt>Practice</dt>
              <dd>Drill the exam questions you got wrong.</dd>
            </div>
            <div>
              <dt>Weak areas</dt>
              <dd>The sections behind your mistakes, and how to fix them.</dd>
            </div>
            <div>
              <dt>Challenges</dt>
              <dd>Real architecture interviews with a mock-interview timer.</dd>
            </div>
          </dl>
          <ul className="tour-keys" aria-label="Keyboard shortcuts">
            <li>
              <span>
                <kbd>⌘K</kbd> or <kbd>/</kbd>
              </span>
              search any topic, section or challenge
            </li>
            <li>
              <span>
                <kbd>?</kbd>
              </span>
              open this guide again
            </li>
          </ul>
        </>
      ),
    },
    {
      short: 'Inside a topic',
      title: 'Work through a topic left to right',
      body: (
        <>
          <ol className="tour-flow" aria-label="Topic tabs, in order">
            <li>Read</li>
            <li>Code Lab</li>
            <li>Interview Qs</li>
            <li>Estimation</li>
            <li>Exam</li>
          </ol>
          <p className="tour-note">
            A <strong>Cheat sheet</strong> tab sits alongside for quick revision.
          </p>
          <p className="tour-lead">Every section in Read follows the same pattern:</p>
          <ol className="tour-pattern">
            <li>
              <strong>Worked example.</strong> The idea applied to a real case.
            </li>
            <li>
              <strong>Pros and cons.</strong> Each weakness comes with its fix.
            </li>
            <li>
              <strong>Try it.</strong> A short coding exercise.
            </li>
            <li>
              <strong>Quick check.</strong> One question to confirm it stuck.
            </li>
          </ol>
          <p className="tour-note">Tick a section as read when you finish it. Some sections have an interactive figure you can step through.</p>
        </>
      ),
    },
    {
      short: 'Start',
      title: 'Your record stays in this browser',
      body: (
        <>
          <ul className="tour-plain">
            <li>Everything you read, rate, draft and score is saved here as you go. There is no account.</li>
            <li>
              It is cleared only by <strong>Reset progress</strong> in Settings, clearing this site&apos;s data, or using another browser or
              a private window.
            </li>
            <li>The app reopens where you left off.</li>
          </ul>
        </>
      ),
    },
  ];
}
