import { motion } from 'motion/react';
import { Check, Lock } from 'lucide-react';
import type { StepId, TopicStep } from '../lib/nextStep';

export type TabId = StepId | 'cheat';

/**
 * The topic's study path as a numbered tab strip (it is also the tab bar: each step switches `?tab=`).
 * Step states: done, current (the next thing to do), todo, locked (study-first lock).
 */
export function StudyPath({
  steps,
  active,
  locks,
  onSelect,
}: {
  steps: TopicStep[];
  active: TabId;
  locks: Partial<Record<TabId, boolean>>;
  onSelect: (id: TabId) => void;
}) {
  const current = steps.find((s) => !s.complete && s.id !== 'capstone')?.id;
  return (
    <div className="study-path" role="tablist" aria-label="Study path">
      <ol className="study-steps">
        {steps.map((s, i) => {
          const state = locks[s.id] ? 'locked' : s.complete ? 'done' : s.id === current ? 'current' : 'todo';
          const isActive = active === s.id;
          return (
            <li key={s.id} className={`study-step-wrap ${state}`}>
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`study-step ${state} ${isActive ? 'active' : ''}`}
                onClick={() => onSelect(s.id)}
                title={state === 'locked' ? 'Read every section first' : undefined}
              >
                <span className="study-num" aria-hidden>
                  {state === 'done' ? <Check size={13} strokeWidth={3} /> : state === 'locked' ? <Lock size={12} /> : String(i + 1).padStart(2, '0')}
                </span>
                <span className="study-label">{s.label}</span>
                <span className="study-progress">
                  {s.progress}
                  <span className="sr-only">, {state === 'current' ? 'next step' : state}</span>
                </span>
                {isActive && <motion.span layoutId="study-path-indicator" className="study-indicator" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'cheat'}
        className={`study-step study-extra ${active === 'cheat' ? 'active' : ''}`}
        onClick={() => onSelect('cheat')}
      >
        <span className="study-num" aria-hidden>
          ≡
        </span>
        <span className="study-label">Cheat sheet</span>
        <span className="study-progress">revise</span>
        {active === 'cheat' && <motion.span layoutId="study-path-indicator" className="study-indicator" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
      </button>
    </div>
  );
}
