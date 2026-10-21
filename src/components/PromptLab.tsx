import { useEffect, useId, useMemo, useRef, useState } from 'react';
import EditorModule from 'react-simple-code-editor';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Eye, Lightbulb, RotateCcw, ShieldAlert, Sparkles, X } from 'lucide-react';
import type { PromptDraft, PromptLab } from '../types';
import { gradePrompt, wordCount, type Grade } from '../lib/promptChecks';
import { lineDiff } from '../lib/lineDiff';
import { markPromptRevealed, recordPromptScore, setPromptDraft, useProgress } from '../lib/progress';
import { celebrate } from '../lib/celebrate';
import { Badge, FollowUps, Markdown } from './ui';
import { CountUp } from './CountUp';

// react-simple-code-editor is CommonJS; the default import is either the component or a module wrapping it.
const Editor = ((EditorModule as unknown as { default?: typeof EditorModule }).default ?? EditorModule) as typeof EditorModule;

type Draft = { system: string; user: string };
type Part = keyof Draft;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDraft = (d: PromptDraft): Draft => ({ system: d.system ?? '', user: d.user ?? '' });

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TOKEN_RE = /(\{\{\s*[\w.-]+\s*\}\})|(<\/?[A-Za-z][\w.:-]*(?:\s[^<>]*)?\/?>)|(```|""")/g;

/** Overlay highlighting for the prompt editors: {{variables}}, <tags> and fences. */
function highlightPrompt(text: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    out += escapeHtml(text.slice(last, at));
    const cls = m[1] ? 'plab-hl-var' : m[2] ? 'plab-hl-tag' : 'plab-hl-fence';
    out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
    last = at + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/** The Prompt Lab tab: every lab of the topic. The first unsolved lab's scorecard gets the spinning border. */
export function PromptLabTab({ labs }: { labs: PromptLab[] }) {
  const p = useProgress();
  const firstOpen = labs.find((l) => !p.promptLabs?.[l.id]?.solvedAt)?.id;
  return (
    <div className="plab-list">
      <p className="tp-intro plab-intro">
        <strong>Write prompts, not code.</strong> The scorecard grades your prompt&apos;s structure instantly and offline (no API key).{' '}
        <code className="inline-code">{'{{variables}}'}</code> are placeholders your app fills in at runtime.
      </p>
      {labs.map((lab, i) => (
        <PromptLabCard key={lab.id} lab={lab} n={i + 1} spotlight={lab.id === firstOpen} />
      ))}
    </div>
  );
}

function PromptLabCard({ lab, n, spotlight }: { lab: PromptLab; n: number; spotlight: boolean }) {
  const p = useProgress();
  const uid = useId();
  const reduce = useReducedMotion();
  const rec = p.promptLabs?.[lab.id];
  const draft: Draft = useMemo(() => (rec ? { system: rec.system, user: rec.user } : toDraft(lab.starter)), [rec, lab.starter]);
  const starter = useMemo(() => toDraft(lab.starter), [lab.starter]);
  const solved = !!rec?.solvedAt;
  const revealed = !!rec?.revealedAt;

  // live grade, debounced ~150ms behind typing
  const [grade, setGrade] = useState<Grade>(() => gradePrompt(lab, draft));
  useEffect(() => {
    const t = setTimeout(() => setGrade(gradePrompt(lab, draft)), 150);
    return () => clearTimeout(t);
  }, [lab, draft]);

  // keep the best score; celebrate the first time the pass mark is reached
  useEffect(() => {
    if (recordPromptScore(lab.id, grade.score, grade.passScore)) {
      celebrate(`Prompt Lab solved: ${lab.title}`, `Scored ${grade.score}/100. Now compare with the model answer.`);
    }
  }, [lab.id, lab.title, grade.score, grade.passScore]);

  // screen readers: announce the score once typing settles, not on every keystroke
  const [announce, setAnnounce] = useState('');
  const passCount = grade.results.filter((r) => r.pass).length;
  const spoken = useRef(`${grade.score}/${passCount}`);
  useEffect(() => {
    const key = `${grade.score}/${passCount}`;
    if (key === spoken.current) return;
    const t = setTimeout(() => {
      spoken.current = key;
      setAnnounce(`Score ${grade.score} of 100, ${passCount} of ${grade.results.length} checks pass${grade.passed ? ', pass mark reached' : ''}.`);
    }, 1200);
    return () => clearTimeout(t);
  }, [grade.score, grade.passed, passCount, grade.results.length]);

  const [hints, setHints] = useState(0);
  const change = (part: Part, value: string) => setPromptDraft(lab.id, { ...draft, [part]: value });
  const reset = () => {
    if (draft.system === starter.system && draft.user === starter.user) return;
    if (window.confirm('Replace your prompt with the original weak starter? Your best score is kept.')) setPromptDraft(lab.id, starter);
  };
  const reveal = () => {
    if (revealed || solved || window.confirm('Reveal the model answer? Try to reach the pass mark first: you learn more from your own attempt.')) {
      markPromptRevealed(lab.id, draft);
      requestAnimationFrame(() => document.getElementById(`${uid}-model`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
    }
  };
  const maxWords = lab.checks.find((c) => c.kind === 'max-words');
  const totalWords = wordCount(draft.system) + wordCount(draft.user);
  const scoreId = `${uid}-score`;

  return (
    <article className={`plab ${solved ? 'is-solved' : ''}`} aria-labelledby={`${uid}-title`}>
      <header className="plab-head">
        <div className="plab-head-text">
          <div className="tp-card-no">
            Prompt lab {pad2(n)} · pass mark {grade.passScore}
          </div>
          <h2 id={`${uid}-title`}>{lab.title}</h2>
        </div>
        <div className="plab-head-meta">
          {rec && rec.best > 0 && <span className="plab-best">best {rec.best}</span>}
          {solved ? <Badge tone="good">Solved</Badge> : revealed ? <Badge tone="ion">Answer revealed</Badge> : null}
        </div>
      </header>

      <div className="plab-grid">
        {/* ---------- brief: scenario, what went wrong, task, hints ---------- */}
        <section className="plab-brief" aria-label="Scenario and task">
          <div className="tp-kicker ion">Scenario</div>
          <Markdown>{lab.scenario}</Markdown>
          {lab.sampleBadOutput && (
            <figure className="plab-bad">
              <figcaption>
                <ShieldAlert size={14} aria-hidden /> What the weak prompt produced
              </figcaption>
              <pre>{lab.sampleBadOutput}</pre>
            </figure>
          )}
          <div className="task">
            <div className="tp-kicker solar">Your task</div>
            <Markdown>{lab.task}</Markdown>
          </div>
          <div className="hints plab-hints">
            {lab.hints.slice(0, hints).map((h, i) => (
              <motion.div
                key={i}
                className="hint"
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Lightbulb size={15} aria-hidden className="inline-icon" /> <strong>Hint {i + 1}:</strong> {h}
              </motion.div>
            ))}
            {hints < lab.hints.length && (
              <button className="btn btn-sm plab-hint-btn" type="button" onClick={() => setHints((h) => h + 1)}>
                <Lightbulb size={14} aria-hidden /> Show hint {hints + 1}/{lab.hints.length}
              </button>
            )}
          </div>
        </section>

        {/* ---------- the two editors ---------- */}
        <section className="plab-work" aria-label="Your prompt">
          <div className="plab-toolbar">
            <span className="plab-autosave">{rec ? 'Saved automatically' : 'Edit the starter below; it saves as you type'}</span>
            <div className="plab-toolbar-btns">
              <button className="btn-ghost btn-xs" type="button" onClick={reset}>
                <RotateCcw size={13} aria-hidden /> Reset to starter
              </button>
              <button className="btn btn-xs" type="button" onClick={reveal}>
                <Eye size={13} aria-hidden /> {revealed ? 'Show model answer' : 'Reveal model answer'}
              </button>
            </div>
          </div>
          <PromptEditor
            id={`${uid}-system`}
            label="System"
            hint="role, policy, output format, examples"
            value={draft.system}
            onChange={(v) => change('system', v)}
            describedBy={`${uid}-summary`}
          />
          <PromptEditor
            id={`${uid}-user`}
            label="User"
            hint="the per-request turn your app sends"
            value={draft.user}
            onChange={(v) => change('user', v)}
            describedBy={`${uid}-summary`}
          />
          {maxWords && maxWords.kind === 'max-words' && (
            <div className={`plab-total ${totalWords > maxWords.limit ? 'over' : ''}`}>
              Total {totalWords} / {maxWords.limit} words
            </div>
          )}
        </section>

        {/* ---------- mobile: sticky score summary ---------- */}
        <button
          type="button"
          className={`plab-sticky ${grade.passed ? 'pass' : ''}`}
          onClick={() => document.getElementById(scoreId)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })}
        >
          <span className="plab-sticky-score num">{grade.score}</span>
          <span className="plab-sticky-text">
            {passCount}/{grade.results.length} checks · pass {grade.passScore}
          </span>
          <span className="plab-sticky-go">{grade.passed ? 'Passing' : 'See scorecard'}</span>
        </button>

        {/* ---------- live scorecard ---------- */}
        <aside className="plab-score-wrap" aria-labelledby={`${uid}-score-h`}>
          <div className={`plab-score-border ${spotlight && !solved ? 'gborder' : ''} ${solved ? 'is-solved' : ''}`}>
            <div className={spotlight && !solved ? 'gborder-in plab-score' : 'plab-score'} id={scoreId} tabIndex={0} role="region" aria-label="Scorecard">
              <h3 id={`${uid}-score-h`} className="sr-only">
                Live scorecard
              </h3>
              <div className="plab-score-top">
                <ScoreRing score={grade.score} passScore={grade.passScore} passed={grade.passed} />
                <div className="plab-score-sum">
                  <div className="lbl">Live scorecard</div>
                  <p className={`plab-verdict ${grade.passed ? 'pass' : ''}`}>
                    {grade.passed ? (
                      <>
                        <Check size={16} strokeWidth={3} aria-hidden /> Pass
                      </>
                    ) : (
                      <>{grade.passScore - grade.score} points to pass</>
                    )}
                  </p>
                  <p className="plab-score-meta">
                    {passCount}/{grade.results.length} checks · pass mark {grade.passScore}
                  </p>
                </div>
              </div>
              <ul className="plab-checks">
                {grade.results.map((r, i) => (
                  <li key={i} className={`plab-check ${r.pass ? 'tint-good is-pass' : 'tint-bad'}`}>
                    <span className="plab-check-icon" aria-hidden>
                      {r.pass ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                    </span>
                    <div className="plab-check-body">
                      <div className="plab-check-label">
                        <span className="sr-only">{r.pass ? 'Passed: ' : 'Not yet: '}</span>
                        {r.check.label}
                        <span className="plab-check-w">+{r.check.weight}</span>
                      </div>
                      <div className="plab-check-why">{r.check.why}</div>
                      <div className="plab-check-detail">{r.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="plab-honest">
                Offline checks grade the structure of a prompt, not whether it truly works — compare with the model answer.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <span id={`${uid}-summary`} className="sr-only">
        Current score {grade.score} of 100, pass mark {grade.passScore}.
      </span>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      <AnimatePresence initial={false}>
        {revealed && (
          <motion.section
            key="model"
            id={`${uid}-model`}
            className="plab-model"
            aria-label="Model answer"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <ModelAnswer lab={lab} draft={draft} />
          </motion.section>
        )}
      </AnimatePresence>

      {(solved || revealed) && (
        <div className="plab-followups">
          <FollowUps items={lab.followUps} />
        </div>
      )}
      {!solved && !revealed && (
        <p className="plab-locked-fu muted small">
          <Sparkles size={13} aria-hidden className="inline-icon" /> Interviewer follow-ups unlock when you reach the pass mark or reveal the model
          answer.
        </p>
      )}
    </article>
  );
}

function PromptEditor({
  id,
  label,
  hint,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  describedBy: string;
}) {
  const words = wordCount(value);
  const countId = `${id}-count`;
  // the library renders the <textarea>; wire its description after mount
  useEffect(() => {
    document.getElementById(id)?.setAttribute('aria-describedby', `${countId} ${describedBy}`);
  }, [id, countId, describedBy]);
  return (
    <div className="plab-editor">
      <div className="plab-editor-head">
        <label htmlFor={id} className="plab-editor-label">
          {label}{' '}
          <span className="plab-editor-hint">({hint})</span>
        </label>
        <span className="plab-editor-count" id={countId}>
          {words} {words === 1 ? 'word' : 'words'}
        </span>
      </div>
      <div className="editor plab-editor-box">
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlightPrompt}
          padding={14}
          ignoreTabKey
          textareaId={id}
          textareaClassName="plab-textarea"
          preClassName="plab-pre"
          placeholder={label === 'System' ? 'You are …' : 'Per-request text, e.g. <input>{{variable}}</input>'}
          style={{ fontFamily: 'var(--mono)', fontSize: 13, minHeight: label === 'System' ? 200 : 110 }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ score, passScore, passed }: { score: number; passScore: number; passed: boolean }) {
  return (
    <div className={`plab-ring ${passed ? 'pass' : ''}`} style={{ ['--p' as string]: `${score}%`, ['--mark' as string]: `${passScore * 3.6}deg` }} aria-hidden>
      <div className="plab-ring-arc" />
      <div className="plab-ring-mark" />
      <div className="plab-ring-label">
        <div className="plab-ring-num">
          <CountUp value={score} />
        </div>
        <div className="plab-ring-cap">/ 100</div>
      </div>
    </div>
  );
}

function ModelAnswer({ lab, draft }: { lab: PromptLab; draft: Draft }) {
  const [view, setView] = useState<'answer' | 'diff'>('answer');
  const model = toDraft(lab.modelAnswer);
  const parts: { key: Part; label: string }[] = [
    { key: 'system', label: 'System' },
    { key: 'user', label: 'User' },
  ];
  return (
    <>
      <div className="plab-model-head">
        <div>
          <div className="tp-kicker ion">Model answer · scores 100</div>
          <h3>Compare with a reference prompt</h3>
        </div>
        <div className="plab-seg" role="group" aria-label="Model answer view">
          <button type="button" className={`chip ${view === 'answer' ? 'on' : ''}`} aria-pressed={view === 'answer'} onClick={() => setView('answer')}>
            Side by side
          </button>
          <button type="button" className={`chip ${view === 'diff' ? 'on' : ''}`} aria-pressed={view === 'diff'} onClick={() => setView('diff')}>
            Line diff
          </button>
        </div>
      </div>
      {parts.map(({ key, label }) =>
        view === 'answer' ? (
          <div key={key} className="plab-sbs">
            <div className="plab-sbs-col">
              <div className="plab-sbs-k">Your {label.toLowerCase()} prompt</div>
              <pre className="plab-code">{draft[key] || '(empty)'}</pre>
            </div>
            <div className="plab-sbs-col">
              <div className="plab-sbs-k model">Model {label.toLowerCase()} prompt</div>
              <pre className="plab-code" dangerouslySetInnerHTML={{ __html: highlightPrompt(model[key] || '(empty)') }} />
            </div>
          </div>
        ) : (
          <div key={key} className="plab-diff-wrap">
            <div className="plab-sbs-k">
              {label} · <span className="plab-diff-key del">− only yours</span> <span className="plab-diff-key add">+ only the model&apos;s</span>
            </div>
            <pre className="plab-code plab-diff">
              {lineDiff(draft[key], model[key]).map((l, i) => (
                <span key={i} className={`plab-diff-line ${l.op === '+' ? 'add' : l.op === '-' ? 'del' : ''}`}>
                  <span className="plab-diff-op" aria-label={l.op === '+' ? 'added in model' : l.op === '-' ? 'only in yours' : undefined}>
                    {l.op === '=' ? ' ' : l.op === '+' ? '+' : '−'}
                  </span>
                  {l.text || ' '}
                  {'\n'}
                </span>
              ))}
            </pre>
          </div>
        ),
      )}
      <div className="plab-why">
        <div className="lbl">Why it works</div>
        <Markdown>{lab.modelAnswer.why}</Markdown>
      </div>
    </>
  );
}
