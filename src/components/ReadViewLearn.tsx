// Read less, view more, learn more (M7): the Read · Steps switch, a section's core with Learn more expanders, and
// the Go deeper block. Only sections with a `core` or `steps` use these; every other section renders as before.
// Design: ai-learn-designs/new-features/read-view-learn.html
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronDown, Clapperboard, Code2, Film, FlaskConical, Hammer, Layers, Quote, Scale, Zap, Activity, type LucideIcon } from 'lucide-react';
import type { Section, Topic } from '../types';
import { useProgress } from '../lib/progress';
import { wordCount } from '../lib/steps';
import { shortLength } from '../lib/shorts';
import { useShorts } from '../lib/useShorts';
import { vizForSection } from '../viz/registry';
import { CodeBlock, Diagram, Markdown } from './ui';
import { ProsConsTable } from './SectionPractice';

type LessonMode = 'read' | 'steps';

const mins = (words: number) => Math.max(1, Math.round(words / 200));

export function ModeSwitch({ id, s, mode, onChange }: { id: string; s: Section; mode: LessonMode; onChange: (m: LessonMode) => void }) {
  const turns = s.steps!.steps.filter((x) => x.kind === 'turn').length;
  const pick = (m: LessonMode) => () => onChange(m);
  return (
    <div className="rvl-modebar">
      <div className="rvl-switch" role="tablist" aria-label="How to study this section" data-mode={mode}>
        <span className="rvl-switch-thumb" aria-hidden />
        <button type="button" role="tab" id={`${id}-tab-read`} aria-controls={`${id}-panel`} aria-selected={mode === 'read'} tabIndex={mode === 'read' ? 0 : -1} onClick={pick('read')}>
          <BookOpen size={15} aria-hidden /> Read
        </button>
        <button type="button" role="tab" id={`${id}-tab-steps`} aria-controls={`${id}-panel`} aria-selected={mode === 'steps'} tabIndex={mode === 'steps' ? 0 : -1} onClick={pick('steps')}>
          <Film size={15} aria-hidden /> Steps
        </button>
      </div>
      <div className="rvl-modemeta">
        {mode === 'read' ? (
          <span>
            <b>Read</b> {s.core ? `core ${mins(wordCount(s.core))} min + Learn more` : `${mins(wordCount(s.body))} min`}
          </span>
        ) : (
          <span>
            <b>Steps</b> {s.steps!.steps.length} steps · {turns} your turn{turns === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <span className="rvl-remember">Your choice is remembered for every section with steps.</span>
    </div>
  );
}

function More({ icon: Icon, k, title, tone, children, open }: { icon: LucideIcon; k: string; title: string; tone: string; children: ReactNode; open?: boolean }) {
  return (
    <details className={`lm tone-${tone}`} open={open}>
      <summary>
        <span className="lm-ico">
          <Icon size={18} aria-hidden />
        </span>
        <span>
          <span className="lm-k">{k}</span>
          <span className="lm-t">{title}</span>
        </span>
        <ChevronDown size={18} aria-hidden className="lm-chev" />
      </summary>
      <div className="lm-body">{children}</div>
    </details>
  );
}

/** Read less: the core first; the full text, example, pros/cons and code fold into Learn more (nothing is removed) */
export function CoreView({ s }: { s: Section }) {
  const [all, setAll] = useState(false);
  const parts = [true, !!s.example, !!s.prosCons, !!s.code?.length].filter(Boolean).length;
  return (
    <>
      <div className="rvl-core glass">
        <div className="rvl-core-k">
          <p className="lbl">
            <Zap size={14} aria-hidden /> The core
          </p>
          <span className="rvl-words">
            {wordCount(s.core!)} words · {mins(wordCount(s.core!))} min
          </span>
        </div>
        <div className="tp-body">
          <Markdown defs>{s.core!}</Markdown>
        </div>
        {!!s.keyPoints?.length && (
          <ul className="rvl-keys" aria-label="Key points">
            {s.keyPoints.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="rvl-more-head">
        <p className="lbl">
          <Layers size={14} aria-hidden /> Learn more · {parts} part{parts === 1 ? '' : 's'}
        </p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAll((a) => !a)}>
          {all ? 'Close all' : 'Open all'}
        </button>
      </div>
      {/* `key` re-mounts the list so Open all / Close all applies to every part */}
      <div className="lm-list" key={String(all)}>
        <More icon={Layers} k="Depth" title="The full section, every word of it" tone="depth" open={all}>
          <div className="tp-body">
            <Markdown defs>{s.body}</Markdown>
          </div>
          {s.diagram && <Diagram text={s.diagram} />}
        </More>
        {s.example && (
          <More icon={FlaskConical} k="Worked example" title="The idea with real numbers" tone="ex" open={all}>
            <div className="tp-body">
              <Markdown>{s.example}</Markdown>
            </div>
          </More>
        )}
        {s.prosCons && (
          <More icon={Scale} k="Edge cases" title="Strengths, and each weakness with its fix" tone="edge" open={all}>
            <ProsConsTable pc={s.prosCons} />
          </More>
        )}
        {!!s.code?.length && (
          <More icon={Code2} k="Code" title={s.code[0].title ?? 'Code'} tone="code" open={all}>
            {s.code.map((c, j) => (
              <CodeBlock key={j} snippet={c} />
            ))}
          </More>
        )}
      </div>
    </>
  );
}

/** Learn more about this section: only links that exist (its Short, animation, prompt lab, sources, next section) */
export function GoDeeper({ topic, i, onViz, onNext }: { topic: Topic; i: number; onViz: () => void; onNext: () => void }) {
  const p = useProgress();
  const { open } = useShorts();
  const s = topic.sections[i];
  const viz = vizForSection(topic.id, s.heading)[0];
  const lab = topic.promptLabs?.[0];
  const sources = (s.source ?? '').split(';').map((x) => x.trim()).filter(Boolean);
  const next = topic.sections[i + 1];
  if (!s.short && !viz && !lab && !sources.length && !next) return null;
  return (
    <section className="gd" aria-labelledby={`gd-h-${i}`}>
      <div className="gd-head">
        <div>
          <p className="lbl">Go deeper</p>
          <h3 id={`gd-h-${i}`}>Learn more about this section</h3>
        </div>
      </div>
      <div className="gd-grid">
        {s.short && (
          <Link to={`/short/${s.short.id}`} className="gd-card tone-short">
            <span className="gd-k">
              <Clapperboard size={14} aria-hidden /> Short · {open.has(s.short.id) ? shortLength(s.short) : 'locked'}
            </span>
            <span className="gd-t">{s.short.title}</span>
            <span className="gd-d">{s.short.takeaway.head.replace(/\*/g, '')}</span>
          </Link>
        )}
        {viz && (
          <button type="button" className="gd-card tone-anim" onClick={onViz}>
            <span className="gd-k">
              <Activity size={14} aria-hidden /> Animation · interactive
            </span>
            <span className="gd-t">{viz.meta.title}</span>
            <span className="gd-foot">
              Open it in the Read view <ArrowRight size={14} aria-hidden />
            </span>
          </button>
        )}
        {lab && (
          <Link to={`/topic/${topic.id}?tab=prompt-lab`} className="gd-card tone-lab">
            <span className="gd-k">
              <Hammer size={14} aria-hidden /> Prompt lab
            </span>
            <span className="gd-t">{lab.title}</span>
            <span className="gd-foot">
              {p.promptLabs?.[lab.id]?.solvedAt ? 'solved' : 'not solved yet'} <ArrowRight size={14} aria-hidden />
            </span>
          </Link>
        )}
        {sources.length > 0 && (
          <div className="gd-card gd-wide tone-src">
            <span className="gd-k">
              <Quote size={14} aria-hidden /> Sources · {sources.length} for this section
            </span>
            <ol>
              {sources.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
        )}
        {next && (
          <button type="button" className="gd-card gd-wide gd-next" onClick={onNext}>
            <span className="gd-k">
              <ArrowRight size={14} aria-hidden /> Next section · § {String(i + 2).padStart(2, '0')}
              {next.steps ? ' · has steps' : ''}
            </span>
            <span className="gd-t">{next.heading}</span>
          </button>
        )}
      </div>
    </section>
  );
}
