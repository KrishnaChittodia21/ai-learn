import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { COMPANY_QUESTIONS, LEVEL_OF_TOPIC, LEVELS, TOPICS, TOPIC_BY_ID } from '../content';
import { useProgress } from '../lib/progress';
import { topicStatus } from '../lib/stats';
import { weakTopics } from '../lib/weak';
import { nextStep } from '../lib/nextStep';
import { getUiPrefs } from '../lib/uiPrefs';
import { studyStreak } from '../lib/streak';
import { ProgressPanel } from '../components/ProgressPanel';
import { DashboardMetrics } from '../components/DashboardMetrics';
import { WeakReattempt } from '../components/WeakReattempt';
import { companyUnlocked, topicCompletion } from '../lib/stats';

const TAB_LABELS: Record<string, string> = {
  learn: 'Read',
  code: 'Code Lab',
  interview: 'Questions',
  envelope: 'Estimation',
  cheat: 'Cheat sheet',
  capstone: 'Capstone',
  exam: 'Exam',
};
const PAGE_LABELS: Record<string, string> = {
  '/contents': 'Syllabus',
  '/weak-areas': 'Weak areas',
  '/challenges': 'Architecture challenges',
  '/settings': 'Settings',
};
const NUMERALS = ['I', 'II', 'III'];
const HOW = [
  ['Read', 'a short section: one idea, a worked example, the trade-offs and how to fix each weakness.'],
  ['Do', 'the coding exercise and the quick check under every section.'],
  ['Drill', 'the Code Lab, scenario questions and estimation problems.'],
  ['Pass', 'the timed exam. The topic is then marked covered on your course map.'],
];

/** Human label for a saved location, e.g. "Embeddings · Read · §3 Vector Similarity". */
function describeLocation(loc: string): string | null {
  const [path, search = ''] = loc.split('?');
  const params = new URLSearchParams(search);
  const topic = /^\/topic\/([^/]+)/.exec(path);
  if (topic) {
    const t = TOPIC_BY_ID.get(topic[1]);
    if (!t) return null;
    const tab = params.get('tab') ?? 'learn';
    const s = Number(params.get('s'));
    const sec = tab === 'learn' && params.has('s') && t.sections[s] ? ` · §${s + 1} ${t.sections[s].heading.split(' — ')[0]}` : '';
    return `${t.title} · ${TAB_LABELS[tab] ?? 'Read'}${sec}`;
  }
  const cq = /^\/challenges\/(.+)$/.exec(path);
  if (cq) return COMPANY_QUESTIONS.find((q) => q.id === cq[1])?.title ?? null;
  return PAGE_LABELS[path] ?? null;
}

export default function Home() {
  const p = useProgress();
  const weak = useMemo(() => weakTopics(p, TOPICS), [p]);
  const weakest = weak.find((w) => w.sections.length > 0);
  const step = nextStep(p, TOPICS, {
    companyTotal: COMPANY_QUESTIONS.length,
    weak: weakest ? { topic: weakest.topic, index: weakest.sections[0].index, heading: weakest.sections[0].heading } : null,
  });
  const last = getUiPrefs().lastStudyLocation;
  const lastLabel = last ? describeLocation(last) : null;
  const resume = last && lastLabel && last !== step.href ? { href: last, label: lastLabel } : null;
  const fresh = step.kind === 'start';
  const firstUntested = TOPICS.find((t) => !p.tests[t.id]) ?? TOPICS[0];
  const firstExamHref = firstUntested ? `/topic/${firstUntested.id}?tab=exam` : '/contents';
  const answered = Object.keys(p.mcq).length;
  const mistakes = Object.values(p.mcq).filter((r) => !r.lastCorrect).length;
  const streak = studyStreak(p.activityDays);
  const passed = TOPICS.filter((t) => topicStatus(p, t) === 'passed').length;
  const inProgress = TOPICS.filter((t) => topicStatus(p, t) === 'in-progress')
    .map((t) => ({ t, pct: topicCompletion(p, t) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="page today">
      <section className="today-lead" aria-labelledby="today-title">
        <div className="today-main">
          <p className="eyebrow">{today}</p>
          <p className="today-kicker">{fresh ? 'Start here' : 'Your next step'}</p>
          <h1 id="today-title">{step.title}</h1>
          <p className="lead">{step.detail}</p>
          <div className="row wrap today-actions">
            <Link className="btn btn-primary btn-lg" to={step.href}>
              {fresh ? 'Open the first lesson' : step.kind === 'read' ? 'Continue reading' : 'Go'} <ArrowRight size={17} aria-hidden />
            </Link>
            {step.secondary && (
              <Link className="btn btn-lg" to={step.secondary.href}>
                {step.secondary.title}
              </Link>
            )}
          </div>
          {resume && (
            <Link className="resume-line" to={resume.href}>
              <span className="resume-label">Where you left off</span>
              <span className="resume-target">{resume.label}</span>
              <ArrowRight size={15} aria-hidden />
            </Link>
          )}
        </div>

        <aside className="ledger" aria-label="Your record">
          <h2 className="ledger-title">Record</h2>
          <table className="ledger-levels">
            <caption className="sr-only">Topics covered per level</caption>
            <tbody>
              {LEVELS.map((lv, i) => {
                const ts = TOPICS.filter((t) => LEVEL_OF_TOPIC.get(t.id) === lv.id);
                const done = ts.filter((t) => topicStatus(p, t) === 'passed').length;
                return (
                  <tr key={lv.id}>
                    <th scope="row">
                      <span className="ledger-numeral">{NUMERALS[i]}</span> {lv.title}
                    </th>
                    <td className="ledger-bar" aria-hidden>
                      <span style={{ width: `${ts.length ? (done / ts.length) * 100 : 0}%` }} />
                    </td>
                    <td className="ledger-num">
                      {done}/{ts.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <dl className="ledger-facts">
            <div>
              <dt>Topics covered</dt>
              <dd>
                {passed}
                <span>/{TOPICS.length}</span>
              </dd>
            </div>
            <div>
              <dt>Exam answers</dt>
              <dd>{answered}</dd>
            </div>
            <div>
              <dt>
                <Link to="/practice">Mistakes to drill</Link>
              </dt>
              <dd className={mistakes ? 'flag' : ''}>{mistakes}</dd>
            </div>
            <div>
              <dt>Study streak</dt>
              <dd>
                {streak}
                <span> day{streak === 1 ? '' : 's'}</span>
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      {fresh && (
        <section className="how" aria-labelledby="how-title">
          <h2 id="how-title" className="section-rule-title">
            How this manual works
          </h2>
          <ol className="how-steps">
            {HOW.map(([verb, rest], i) => (
              <li key={verb}>
                <span className="how-num">{String(i + 1).padStart(2, '0')}</span>
                <p>
                  <strong>{verb}</strong> {rest}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {inProgress.length > 0 && (
        <section className="open-topics" aria-labelledby="open-title">
          <h2 id="open-title" className="section-rule-title">
            On your desk
          </h2>
          <ul className="open-list">
            {inProgress.map(({ t, pct }) => (
              <li key={t.id}>
                <Link to={`/topic/${t.id}`}>{t.title}</Link>
                <span className="open-bar" aria-hidden>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="open-pct">{pct}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProgressPanel p={p} />

      <WeakReattempt weak={weak} answered={answered} passMark={p.settings.passMark} firstExamHref={firstExamHref} />

      <section className="record" aria-labelledby="record-title">
        <div className="section-rule-head">
          <h2 id="record-title" className="section-rule-title">
            Study record
          </h2>
        </div>
        <DashboardMetrics
          p={p}
          topics={TOPICS}
          readiness={Math.round(TOPICS.reduce((a, t) => a + topicCompletion(p, t), 0) / Math.max(1, TOPICS.length))}
          companyTotal={COMPANY_QUESTIONS.length}
          companyUnlocked={companyUnlocked(p, TOPICS).unlocked}
          firstExamHref={firstExamHref}
        />
      </section>
    </div>
  );
}
