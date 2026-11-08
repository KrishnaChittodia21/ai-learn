// From-scratch drills (C4): the list (#/drills) and one drill (#/drills/:id). Learner code is graded in a Web
// Worker (src/lib/drillRunner.ts); drafts live in progress.drafts[`drill:<id>`], pass / reveal in progress.drills.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Lightbulb, Play, X } from 'lucide-react';
import { DRILLS, loadDrill, type Drill } from '../content/drills';
import { TOPIC_BY_ID } from '../content';
import { markDrill, setDraft, useProgress, type Progress } from '../lib/progress';
import { runDrill, type RunOutcome } from '../lib/drillRunner';
import { Badge, CodeBlock, CodeEditor, Markdown } from '../components/ui';
import { showToast } from '../lib/toast';
import '../styles/drills.css';

const draftKey = (id: string) => `drill:${id}`;

function status(p: Progress, id: string): { label: string; tone: string } {
  const r = p.drills?.[id];
  if (r?.passedAt) return { label: 'Passed', tone: 'good' };
  if (r?.revealedAt) return { label: 'Solution seen', tone: 'neutral' };
  if (p.drafts[draftKey(id)] !== undefined) return { label: 'In progress', tone: 'neutral' };
  return { label: 'Not started', tone: 'neutral' };
}

export default function DrillsPage() {
  const p = useProgress();
  const passed = DRILLS.filter((d) => p.drills?.[d.id]?.passedAt).length;
  return (
    <div className="page dr-page">
      <header className="dr-head">
        <p className="eyebrow">Practice · from scratch</p>
        <h1>
          Build it <span className="gtext">from scratch</span>
        </h1>
        <p className="lead">
          Small, graded TypeScript exercises: write BM25, attention or a tool-call parser over plain arrays, then run the tests in your browser. Every failing test says why it matters.
        </p>
        <p className="dr-count">
          <strong>{passed}</strong> of {DRILLS.length} passed
        </p>
      </header>
      <ol className="dr-list">
        {DRILLS.map((d, i) => {
          const s = status(p, d.id);
          const topic = TOPIC_BY_ID.get(d.topic);
          return (
            <li key={d.id} className={`dr-item ${p.drills?.[d.id]?.passedAt ? 'done' : ''}`}>
              <span className="dr-no" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="dr-item-body">
                <h2>
                  <Link to={`/drills/${d.id}`}>{d.title}</Link>
                </h2>
                <p className="muted">{d.summary}</p>
                <p className="dr-meta">
                  <Badge tone={d.difficulty}>{d.difficulty}</Badge>
                  <span>
                    <Clock size={13} aria-hidden /> {d.minutes} min
                  </span>
                  {topic && <span>Taught in {topic.title}</span>}
                  <Badge tone={s.tone}>{s.label}</Badge>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="small muted dr-credit">
        Adapted from the practice problems of ai-engineering-from-scratch (MIT, © 2026 Rohit Ghumare), ported from Python to TypeScript.
      </p>
    </div>
  );
}

export function DrillPage() {
  const { id = '' } = useParams();
  const [loaded, setLoaded] = useState<{ id: string; drill: Drill | null }>();
  useEffect(() => {
    let live = true;
    loadDrill(id).then((d) => live && setLoaded({ id, drill: d ?? null }));
    return () => {
      live = false;
    };
  }, [id]);
  const drill = loaded?.id === id ? loaded.drill : undefined;
  if (drill === undefined) return <div className="page dr-page" aria-busy="true" />;
  if (drill === null)
    return (
      <div className="page dr-page">
        <h1>No such drill</h1>
        <Link className="btn" to="/drills">
          All drills
        </Link>
      </div>
    );
  return <DrillView key={drill.id} drill={drill} />;
}

function DrillView({ drill }: { drill: Drill }) {
  const p = useProgress();
  const code = p.drafts[draftKey(drill.id)] ?? drill.starter;
  const rec = p.drills?.[drill.id];
  const [hints, setHints] = useState(0);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const topic = TOPIC_BY_ID.get(drill.topic);
  const open = !!(rec?.passedAt || rec?.revealedAt);
  const passCount = outcome?.ok ? outcome.results.filter((r) => r.pass).length : 0;

  const run = async () => {
    if (running) return;
    setRunning(true);
    const out = await runDrill(code, drill);
    setRunning(false);
    setOutcome(out);
    if (out.ok && out.results.length && out.results.every((r) => r.pass) && !rec?.passedAt) {
      markDrill(drill.id, 'passedAt');
      showToast('Drill passed', 'Every test is green. The solution and notes are open below.', 4000, 'good');
    }
  };

  return (
    <div className="page dr-page dr-detail">
      <Link to="/drills" className="dr-back">
        <ArrowLeft size={15} aria-hidden /> All drills
      </Link>
      <header className="dr-head">
        <p className="eyebrow">From-scratch drill</p>
        <h1>{drill.title}</h1>
        <p className="dr-meta">
          <Badge tone={drill.difficulty}>{drill.difficulty}</Badge>
          <span>
            <Clock size={13} aria-hidden /> {drill.minutes} min
          </span>
          {topic && (
            <Link to={`/topic/${topic.id}`}>Lesson: {topic.title}</Link>
          )}
          {rec?.passedAt && <Badge tone="good">Passed</Badge>}
        </p>
      </header>

      <section className="dr-problem" aria-label="Problem">
        <Markdown>{drill.problem}</Markdown>
      </section>

      <section className="dr-work" aria-label="Your code">
        <div className="tp-ex-bar">
          <span>Write TypeScript over plain arrays; no imports. Saved as you type. Ctrl/⌘ + Enter runs the tests.</span>
          <button className="btn-ghost btn-xs" type="button" onClick={() => setDraft(draftKey(drill.id), drill.starter)}>
            Reset to starter
          </button>
        </div>
        <div
          className="dr-editor"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run();
            }
          }}
        >
          <CodeEditor value={code} onChange={(v) => setDraft(draftKey(drill.id), v)} language="typescript" />
        </div>
        <div className="tp-ex-actions dr-actions">
          <button className="btn btn-primary" type="button" onClick={run} disabled={running} aria-busy={running}>
            <Play size={15} aria-hidden /> {running ? 'Running…' : 'Run tests'}
          </button>
          {hints < drill.hints.length && (
            <button className="btn" type="button" onClick={() => setHints((h) => h + 1)}>
              <Lightbulb size={15} aria-hidden /> Hint {hints + 1}/{drill.hints.length}
            </button>
          )}
          {!open && (
            <button className="btn" type="button" onClick={() => markDrill(drill.id, 'revealedAt')}>
              Show solution
            </button>
          )}
        </div>
      </section>

      <div className="dr-results" aria-live="polite" aria-atomic="true">
        {outcome && !outcome.ok && (
          <p className="dr-error" role="alert">
            {outcome.error}
          </p>
        )}
        {outcome?.ok && (
          <>
            <p className={`dr-summary ${passCount === outcome.results.length ? 'all' : ''}`}>
              {passCount} of {outcome.results.length} tests pass
            </p>
            <ul className="dr-tests">
              {outcome.results.map((r, i) => (
                <li key={i} className={r.pass ? 'pass' : 'fail'}>
                  {r.pass ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
                  <span className="sr-only">{r.pass ? 'Pass:' : 'Fail:'}</span>
                  <span className="dr-test-name">{r.name}</span>
                  {!r.pass && <span className="dr-test-msg">{r.message}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {hints > 0 && (
        <div className="hints dr-hints">
          {drill.hints.slice(0, hints).map((h, i) => (
            <div key={i} className="hint">
              <Lightbulb size={15} aria-hidden className="inline-icon" /> <strong>Hint {i + 1}:</strong> {h}
            </div>
          ))}
        </div>
      )}

      {open && (
        <section className="solution dr-solution" aria-label="Solution and notes">
          {!rec?.passedAt && <p className="muted small">You revealed the solution before passing, so this drill won't count towards the From Scratch badge. Running the tests still checks your own version.</p>}
          <CodeBlock snippet={{ language: 'typescript', code: drill.solution, title: 'Reference solution' }} />
          <Markdown>{drill.notes}</Markdown>
        </section>
      )}
    </div>
  );
}
