// Learning paths by role (C4): pick a path, follow it (Today's next step prefers its next topic), make it the
// plan goal, practise its interview questions, and print a local, self-issued certificate once every exam passes.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, Check, Printer, Shuffle } from 'lucide-react';
import { PHASES, TOPIC_BY_ID, TOPICS } from '../content';
import { pathStatus, ROLE_BY_ID, ROLES, type Role } from '../content/roles';
import { CERT_NAME_MAX, getProgress, localDay, setCertName, setRolePath, setStudyPlan, useProgress } from '../lib/progress';
import { coveredMinutes, fmtDay, newPlan } from '../lib/pace';
import { practiceLocked, topicStatus } from '../lib/stats';
import { showToast } from '../lib/toast';
import { useTopics } from '../lib/useTopic';
import { RouteSkeleton } from '../components/RouteSkeleton';
import { InterviewCard } from './Topic';
import type { Difficulty, TopicMeta } from '../types';

type View = 'list' | 'detail' | 'practice' | 'certificate';

const topicsOf = (r: Role) => r.topics.map((id) => TOPIC_BY_ID.get(id)).filter((t): t is TopicMeta => !!t);
const STATUS_LABEL = { passed: 'Exam passed', 'in-progress': 'In progress', new: 'Not started' } as const;

export default function PathsPage({ view }: { view: View }) {
  const { id } = useParams();
  const role = id ? ROLE_BY_ID.get(id) : undefined;
  if (view === 'list') return <PathList />;
  if (!role)
    return (
      <div className="page narrow">
        <h1>Path not found</h1>
        <Link className="btn" to="/paths">
          All learning paths
        </Link>
      </div>
    );
  if (view === 'practice') return <PathPractice role={role} />;
  if (view === 'certificate') return <PathCertificate role={role} />;
  return <PathDetail role={role} />;
}

function Steps({ passed, total }: { passed: number; total: number }) {
  return (
    <div className="ph-steps" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < passed ? 'on' : ''} />
      ))}
    </div>
  );
}

function PathList() {
  const p = useProgress();
  return (
    <div className="page ph-page">
      <header className="ph-head">
        <span className="eyebrow">Learning paths</span>
        <h1>
          Pick a <span className="gtext">role</span>
        </h1>
        <p className="lede">Each path is an ordered route through this course for one kind of AI work. Follow one and Today points you at its next topic.</p>
      </header>
      <ul className="ph-list">
        {ROLES.map((r) => {
          const s = pathStatus(p, r);
          return (
            <li key={r.id}>
              <Link to={`/paths/${r.id}`} className="ph-card card">
                <div className="ph-card-top">
                  <h2>{r.title}</h2>
                  {p.rolePath === r.id && <span className="ph-tag">Following</span>}
                  {s.certified && <span className="ph-tag good">Certified</span>}
                </div>
                <p>{r.summary}</p>
                <Steps passed={s.passed} total={s.total} />
                <span className="ph-meta">
                  {s.passed} of {s.total} topic exams passed
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PathDetail({ role }: { role: Role }) {
  const p = useProgress();
  const navigate = useNavigate();
  const s = pathStatus(p, role);
  const topics = topicsOf(role);
  const following = p.rolePath === role.id;
  const goal = `role:${role.id}`;
  const isGoal = p.studyPlan?.goal === goal;
  const nextId = topics.find((t) => !p.tests[t.id]?.passedAt)?.id;

  const follow = () => {
    setRolePath(following ? undefined : role.id);
    showToast(following ? 'Stopped following this path' : `Following: ${role.title}`, following ? undefined : 'Today now points at this path’s next topic.', 3000, 'good');
  };
  const makeGoal = () => {
    const today = localDay();
    setStudyPlan({ ...(p.studyPlan ?? newPlan(coveredMinutes(p, TOPICS), today)), goal });
    navigate('/plan');
  };

  return (
    <div className="page ph-page">
      <Link to="/paths" className="ph-back">
        ← All learning paths
      </Link>
      <header className="ph-head">
        <span className="eyebrow">Learning path · {topics.length} topics</span>
        <h1>{role.title}</h1>
        <p className="lede">{role.summary}</p>
        <div className="ph-actions">
          <button type="button" className={`btn ${following ? '' : 'btn-primary'}`} aria-pressed={following} onClick={follow}>
            {following ? (
              <>
                <Check size={16} aria-hidden /> Following · stop
              </>
            ) : (
              'Follow this path'
            )}
          </button>
          <button type="button" className="btn" onClick={makeGoal} disabled={isGoal}>
            {isGoal ? 'It is your plan goal' : 'Make it my plan goal'}
          </button>
          <Link className="btn" to={`/paths/${role.id}/practice`}>
            Practise for this role
          </Link>
          {s.certified && (
            <Link className="btn btn-primary" to={`/paths/${role.id}/certificate`}>
              <Award size={16} aria-hidden /> Certificate
            </Link>
          )}
        </div>
      </header>

      <div className="ph-grid">
        <section aria-labelledby="ph-route-h">
          <h2 id="ph-route-h" className="ph-h2">
            The route <span className="ph-meta">{s.passed}/{s.total} exams passed</span>
          </h2>
          <ol className="ph-route">
            {topics.map((t, i) => {
              const st = topicStatus(p, t);
              const ph = PHASES.find((x) => x.id === t.phase);
              return (
                <li key={t.id} className={`ph-stop ${st}${t.id === nextId ? ' next' : ''}`}>
                  <span className="ph-mark" aria-hidden="true">
                    {st === 'passed' ? <Check size={14} /> : i + 1}
                  </span>
                  <div>
                    <Link to={`/topic/${t.id}`}>{t.title}</Link>
                    <span className="ph-meta">
                      Phase {ph?.number} · {STATUS_LABEL[st]}
                      {t.id === nextId ? ' · next' : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {!s.certified && <p className="ph-note">The certificate unlocks when every topic exam in this path is passed ({s.total - s.passed} to go).</p>}
        </section>
        <aside className="ph-side">
          <section className="card">
            <h2 className="ph-h2">A good fit if</h2>
            <ul>
              {role.goodFitIf.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="ph-h2">What you will do</h2>
            <ul>
              {role.responsibilities.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

const DIFFS: Difficulty[] = ['medium', 'hard', 'expert'];

/** Fisher–Yates, called from the Shuffle button only */
function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function PathPractice({ role }: { role: Role }) {
  const p = useProgress();
  const [diff, setDiff] = useState<Difficulty | 'all'>('all');
  // order and "rated" are snapshots taken on Shuffle / Unrated first, so rating a card never moves it away
  const [order, setOrder] = useState<string[] | null>(null);
  const [ratedSnap, setRatedSnap] = useState<Set<string> | null>(null);
  const topics = topicsOf(role);
  const open = useTopics(topics.filter((t) => !practiceLocked(p, t, 'interview')).map((t) => t.id));
  if (!open) return <RouteSkeleton />;
  const locked = topics.length - open.length;
  const all = open.flatMap((t) => t.interviewQuestions.map((q) => ({ q, t })));
  let items = all.filter((x) => diff === 'all' || x.q.difficulty === diff);
  if (order) items = [...items].sort((a, b) => order.indexOf(a.q.id) - order.indexOf(b.q.id));
  if (ratedSnap) items = [...items.filter((x) => !ratedSnap.has(x.q.id)), ...items.filter((x) => ratedSnap.has(x.q.id))];
  const rated = all.filter((x) => p.iq[x.q.id]).length;

  const shuffle = () => setOrder(shuffled(all.map((x) => x.q.id)));
  const unratedFirst = () => setRatedSnap(ratedSnap ? null : new Set(Object.keys(getProgress().iq)));

  return (
    <div className="page narrow ph-page">
      <Link to={`/paths/${role.id}`} className="ph-back">
        ← {role.title}
      </Link>
      <header className="ph-head">
        <span className="eyebrow">Interview practice · role</span>
        <h1>Practise for {role.title}</h1>
        <p className="lede">
          Every interview question from this path’s topics. Answer out loud first, then compare and rate yourself; ratings count on the topic pages too. <span className="muted">({rated}/{all.length} rated)</span>
        </p>
      </header>
      <div className="ph-toolbar" role="group" aria-label="Filter and order">
        <div className="ph-chips" role="radiogroup" aria-label="Difficulty">
          {(['all', ...DIFFS] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={diff === d} className={`chip ${diff === d ? 'on' : ''}`} onClick={() => setDiff(d)}>
              {d === 'all' ? 'All' : d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="chip" onClick={shuffle}>
          <Shuffle size={14} aria-hidden /> Shuffle
        </button>
        <button type="button" className={`chip ${ratedSnap ? 'on' : ''}`} aria-pressed={!!ratedSnap} onClick={unratedFirst}>
          Unrated first
        </button>
      </div>
      {locked > 0 && <p className="ph-note">{locked} topic{locked === 1 ? '' : 's'} left out: the study-first lock in Settings opens interview questions once a topic’s lessons are read.</p>}
      <p className="sr-only" aria-live="polite">
        {items.length} questions shown
      </p>
      {items.length === 0 && <p className="ph-note">No questions match this filter.</p>}
      {items.map(({ q, t }, i) => (
        <div key={q.id} className="ph-q">
          <Link className="ph-q-topic" to={`/topic/${t.id}?tab=interview`}>
            {t.title}
          </Link>
          <InterviewCard q={q} n={i + 1} topicId={t.id} />
        </div>
      ))}
    </div>
  );
}

function PathCertificate({ role }: { role: Role }) {
  const p = useProgress();
  const s = pathStatus(p, role);
  const [editing, setEditing] = useState(!p.certName);
  const [name, setName] = useState(p.certName ?? '');
  const back = (
    <Link to={`/paths/${role.id}`} className="ph-back">
      ← {role.title}
    </Link>
  );
  if (!s.certified)
    return (
      <div className="page narrow ph-page">
        {back}
        <h1>Not yet</h1>
        <p className="lede">
          The certificate unlocks when every topic exam in this path is passed. {s.passed} of {s.total} done.
        </p>
      </div>
    );
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCertName(name);
    setEditing(false);
  };
  const topics = topicsOf(role);
  return (
    <div className="page narrow ph-page">
      <div className="ph-noprint">
        {back}
        {editing ? (
          <form className="ph-name card" onSubmit={save}>
            <label htmlFor="ph-name-in">Name to print on your certificates</label>
            <div className="ph-name-row">
              <input id="ph-name-in" className="input" value={name} maxLength={CERT_NAME_MAX} autoComplete="name" required onChange={(e) => setName(e.target.value)} />
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
            <span className="ph-meta">Stored only in this browser (and in your Export file).</span>
          </form>
        ) : (
          <div className="ph-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={16} aria-hidden /> Print or save as PDF
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Change name
            </button>
          </div>
        )}
      </div>
      {!editing && p.certName && (
        <article className="ph-cert" aria-label="Certificate">
          <span className="ph-cert-kicker">Learning path certificate</span>
          <p className="ph-cert-line">This records that</p>
          <h1 className="ph-cert-name">{p.certName}</h1>
          <p className="ph-cert-line">passed every topic exam in the learning path</p>
          <h2 className="ph-cert-path">{role.title}</h2>
          <p className="ph-cert-date">Completed {s.completedAt ? fmtDay(localDay(new Date(s.completedAt)), true) : ''}</p>
          <ol className="ph-cert-topics">
            {topics.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ol>
          <p className="ph-cert-disclaimer">Self-issued by this app on your device — not verified by any organisation.</p>
        </article>
      )}
    </div>
  );
}
