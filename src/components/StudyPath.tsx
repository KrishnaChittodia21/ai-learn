import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Check, Lock } from 'lucide-react';
import type { StepId, TopicStep } from '../lib/nextStep';

export type TabId = StepId | 'cheat';

/** compact count shown after the tab label: "2/6", "best 80%", "12 Qs" */
function shortProgress(s: TopicStep) {
  if (s.id === 'exam' || s.id === 'capstone') return s.progress;
  return `${s.done}/${s.total}`;
}

/**
 * The topic's study path as a glowing pill tab bar (it is also the tab bar: each step switches `?tab=`).
 * Step states: done, current (the next thing to do), todo, locked (study-first lock).
 * The bar sticks under the masthead and scrolls sideways inside itself on narrow screens.
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
  const barRef = useRef<HTMLDivElement>(null);

  // keep the active tab visible when the bar scrolls sideways (phones)
  useEffect(() => {
    const bar = barRef.current;
    const el = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!bar || !el || bar.scrollWidth <= bar.clientWidth) return;
    const left = el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [active]);

  const indicator = <motion.span layoutId="study-path-indicator" className="tp-tab-glow" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />;

  return (
    <div className="tp-tabs-wrap">
      <div className="tp-tabs" role="tablist" aria-label="Study path" ref={barRef}>
        {steps.map((s, i) => {
          const state = locks[s.id] ? 'locked' : s.complete ? 'done' : s.id === current ? 'current' : 'todo';
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`tp-tab ${state} ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(s.id)}
              title={state === 'locked' ? 'Read every section first' : undefined}
            >
              {isActive && indicator}
              <span className="tp-tab-n" aria-hidden>
                {state === 'done' ? <Check size={13} strokeWidth={3} /> : state === 'locked' ? <Lock size={11} strokeWidth={2.4} /> : String(i + 1).padStart(2, '0')}
              </span>
              <span className="tp-tab-label">{s.label}</span>
              <span className="tp-tab-count">
                {state === 'locked' ? 'locked' : shortProgress(s)}
                <span className="sr-only">
                  {' '}
                  ({s.progress}, {state === 'current' ? 'next step' : state})
                </span>
              </span>
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={active === 'cheat'}
          className={`tp-tab tp-tab-extra ${active === 'cheat' ? 'active' : ''}`}
          onClick={() => onSelect('cheat')}
        >
          {active === 'cheat' && indicator}
          <span className="tp-tab-n" aria-hidden>
            ≡
          </span>
          <span className="tp-tab-label">Cheat sheet</span>
        </button>
      </div>
    </div>
  );
}
