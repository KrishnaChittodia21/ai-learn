import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CircleCheck, Crosshair, RotateCcw, Sparkles } from 'lucide-react';
import { TOPICS, TOPIC_BY_ID } from '../content';
import type { Difficulty } from '../types';
import { useProgress, type Progress } from '../lib/progress';
import { accuracyBreakdown, currentlyWrong, pct, weakTopics, type Accuracy, type TopicWeakness } from '../lib/weak';
import { DifficultyBadge } from '../components/ui';
import { Exam } from './Exam';

const pad = (n: number) => String(n).padStart(2, '0');

/** the exam a learner should sit next: the first topic with no recorded attempt */
function nextExam(p: Progress) {
  const t = TOPICS.find((x) => !p.tests[x.id]);
  return t ? { href: `/topic/${t.id}?tab=exam`, title: t.title } : null;
}

function AccuracyRow({ label, a }: { label: ReactNode; a: Accuracy }) {
  const v = pct(a);
  return (
    <tr className={v !== null && v < 60 ? 'low' : ''}>
      <th scope="row">{label}</th>
      <td className="meter" aria-hidden>
        <span style={{ width: `${v ?? 0}%` }} />
      </td>
      <td className="meter-pct">{v === null ? '—' : `${v}%`}</td>
      <td className="meter-n">{a.seen ? `${a.correct}/${a.seen}` : 'no data'}</td>
    </tr>
  );
}

function AccuracyTable({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <table className="meter-table">
      <caption>{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Group</th>
          <th scope="col">Accuracy bar</th>
          <th scope="col">Accuracy</th>
          <th scope="col">Correct of attempted</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

const HOW: [string, string][] = [
  ['Drill the wrong answers.', 'The mistakes drill asks only questions whose latest answer was wrong. Drills never count towards passing.'],
  ['Answer it right once.', 'A question leaves this list as soon as your most recent answer is correct. Miss it again and it comes back.'],
  ['Revise the section.', 'Each miss is matched to the Learn section it most likely tests, so “Revise §n” opens the right page.'],
  ['Retake the full exam.', 'Only a full-length exam updates your score and can pass the topic.'],
];

function HowItWorks({ passMark }: { passMark: number }) {
  return (
    <aside className="diag-how glass" aria-labelledby="diag-how-title">
      <p className="lbl">The loop</p>
      <h2 id="diag-how-title" className="diag-how-title">
        How a weak area clears
      </h2>
      <ol>
        {HOW.map(([title, body], i) => (
          <li key={title}>
            <span className="diag-how-num">{pad(i + 1)}</span>
            <p>
              <strong>{title}</strong> {body}
              {i === 3 && ` Pass mark ${passMark}%.`}
            </p>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function statusOf(w: TopicWeakness) {
  if (!w.attempts) return { tone: 'tag', label: 'Drill only' };
  return w.passed ? { tone: 'good', label: 'Passed' } : { tone: 'expert', label: 'Not passed' };
}

function WeakCard({ w, i, maxWrong, featured }: { w: TopicWeakness; i: number; maxWrong: number; featured: boolean }) {
  const st = statusOf(w);
  const body = (
    <>
      <div className="diag-card-top">
        <div className="diag-main">
          <p className={featured ? 'lbl diag-kicker' : 'lbl'}>{featured ? 'Weak spot detected' : `Focus ${pad(i + 1)}`}</p>
          <h3 className="diag-topic">
            <Link to={`/topic/${w.topic.id}`}>{w.topic.title}</Link>
          </h3>
          <p className="diag-meta">
            <span className={`badge badge-${st.tone}`}>{st.label}</span>
            {w.attempts > 0 && (
              <span>
                last {w.last}% · best {w.best}% · {w.attempts} attempt
                {w.attempts === 1 ? '' : 's'}
              </span>
            )}
            {w.history.length > 1 && <span>trend {w.history.slice(-5).join(' → ')}</span>}
          </p>
        </div>
        <div className="diag-missed" aria-label={`${w.wrong.length} questions currently wrong`}>
          <span className={`diag-missed-num num ${w.wrong.length ? '' : 'zero'}`}>{w.wrong.length}</span>
          <span className="diag-missed-label">wrong now</span>
          <span className="diag-missed-bar" aria-hidden>
            <span style={{ width: `${(w.wrong.length / maxWrong) * 100}%` }} />
          </span>
        </div>
      </div>

      {(w.sections.length > 0 || w.shakyInterview > 0) && (
        <ul className="rev-list diag-sections">
          {w.sections.slice(0, 5).map((ws) => (
            <li key={ws.index}>
              <span className="rev-count">{ws.missed.length} missed</span>
              <span className="rev-heading">{ws.heading}</span>
              <Link to={`/topic/${w.topic.id}?tab=learn&s=${ws.index}`} className="rev-link">
                Revise §{ws.index + 1} <ArrowRight size={13} aria-hidden />
              </Link>
            </li>
          ))}
          {w.shakyInterview > 0 && (
            <li>
              <span className="rev-count warn">{w.shakyInterview} shaky</span>
              <span className="rev-heading">
                Interview question{w.shakyInterview === 1 ? '' : 's'} self-rated <em>partial</em> or <em>missed</em>
              </span>
              <Link to={`/topic/${w.topic.id}?tab=interview`} className="rev-link">
                Practise <ArrowRight size={13} aria-hidden />
              </Link>
            </li>
          )}
        </ul>
      )}
      <div className="diag-actions">
        {w.wrong.length > 0 && (
          <Link to={`/practice?topic=${w.topic.id}`} className="btn btn-sm">
            Practise {w.wrong.length} mistake{w.wrong.length === 1 ? '' : 's'}
          </Link>
        )}
        <Link to={`/topic/${w.topic.id}/exam`} className="btn-ghost btn-sm">
          <RotateCcw size={14} aria-hidden /> Retake full exam
        </Link>
      </div>
    </>
  );
  return featured ? (
    <li className="diag-card featured gborder">
      <div className="gborder-in diag-card-in">{body}</div>
    </li>
  ) : (
    <li className="diag-card card">{body}</li>
  );
}

export function WeakAreasPage() {
  const p = useProgress();
  const answered = Object.keys(p.mcq).length;
  const weak = weakTopics(p, TOPICS);
  const { byDifficulty, byFormat } = accuracyBreakdown(p, TOPICS);
  const overall = Object.values(byDifficulty).reduce((acc, a) => ({ seen: acc.seen + a.seen, correct: acc.correct + a.correct }), {
    seen: 0,
    correct: 0,
  });
  const totalWrong = weak.reduce((n, w) => n + w.wrong.length, 0);
  const maxWrong = Math.max(1, ...weak.map((w) => w.wrong.length));
  const exam = nextExam(p);

  if (!answered) {
    return (
      <div className="page diag">
        <header className="diag-head rise">
          <p className="eyebrow">Diagnostics</p>
          <h1>
            <span className="gtext">Weak areas</span>
          </h1>
        </header>
        <div className="diag-empty-grid">
          <section className="diag-empty glass rise d1" aria-labelledby="diag-empty-title">
            <span className="diag-orb" aria-hidden>
              <Crosshair size={26} />
            </span>
            <h2 id="diag-empty-title">Nothing to diagnose yet</h2>
            <p>
              Sit any topic exam and this page lists the topics, sections and question types where you lose marks, with a link to the exact
              section to revise.
            </p>
            <div className="row wrap">
              {exam && (
                <Link to={exam.href} className="btn btn-primary btn-lg">
                  Take the {exam.title} exam <ArrowRight size={17} aria-hidden />
                </Link>
              )}
              <Link to="/contents" className="btn btn-lg">
                Open the syllabus
              </Link>
            </div>
          </section>
          <div className="rise d2">
            <HowItWorks passMark={p.settings.passMark} />
          </div>
        </div>
      </div>
    );
  }

  const levels: Difficulty[] = ['medium', 'hard', 'expert'];
  const overallPct = pct(overall);
  return (
    <div className="page diag">
      <header className="diag-head rise">
        <p className="eyebrow">Diagnostics</p>
        <h1>
          <span className="gtext">Weak areas</span>
        </h1>
        <p className="lead">
          Based on your latest answer to each of the {answered} exam question
          {answered === 1 ? '' : 's'} you&apos;ve attempted. A question leaves this list once you answer it correctly.
        </p>
      </header>

      <dl className="diag-stats rise d1">
        <div className={`diag-stat glass ${totalWrong ? 'hot' : 'cool'}`}>
          <dt>Mistakes to clear</dt>
          <dd className="num">{totalWrong}</dd>
        </div>
        <div className="diag-stat glass">
          <dt>Topics need work</dt>
          <dd className="num">{weak.length}</dd>
        </div>
        <div className={`diag-stat glass ${overallPct !== null && overallPct < 60 ? 'hot' : 'cool'}`}>
          <dt>Overall accuracy</dt>
          <dd className="num">
            {overallPct ?? '—'}
            {overallPct !== null && <small>%</small>}
          </dd>
        </div>
      </dl>

      <section className="diag-accuracy rise d2" aria-label="Accuracy">
        <div className="diag-panel glass">
          <AccuracyTable caption="Accuracy by difficulty">
            {levels.map((d) => (
              <AccuracyRow key={d} label={<DifficultyBadge d={d} />} a={byDifficulty[d]} />
            ))}
            <AccuracyRow label={<strong>Overall</strong>} a={overall} />
          </AccuracyTable>
        </div>
        <div className="diag-panel glass">
          <AccuracyTable caption="Accuracy by question type">
            <AccuracyRow label="Single answer" a={byFormat.single} />
            <AccuracyRow label="Select all that apply" a={byFormat.multi} />
            <AccuracyRow label="Reading code" a={byFormat.code} />
          </AccuracyTable>
          <p className="diag-note">
            A low &ldquo;select all&rdquo; score usually means you spot the main idea but miss a second valid trade-off. Read the
            explanations for the options you skipped.
          </p>
        </div>
      </section>

      <div className="diag-body">
        <section className="diag-focus rise d3" aria-labelledby="focus-title">
          <div className="diag-focus-head">
            <h2 id="focus-title">
              Focus list <span className="diag-count">{pad(weak.length)}</span>
            </h2>
            {totalWrong > 0 && (
              <Link to="/practice" className="btn btn-primary">
                Practise all {totalWrong} mistake{totalWrong === 1 ? '' : 's'} <ArrowRight size={16} aria-hidden />
              </Link>
            )}
          </div>

          {!weak.length ? (
            <div className="diag-clear tint-good">
              <span className="diag-orb good" aria-hidden>
                <CircleCheck size={24} />
              </span>
              <div>
                <p className="diag-clear-title">Nothing to fix right now.</p>
                <p>
                  Every exam question you&apos;ve attempted is currently answered correctly, and every attempted exam is passed.
                  {exam ? ' Keep the record clean on the next topic.' : ''}
                </p>
                {exam && (
                  <Link to={exam.href} className="btn">
                    Next exam: {exam.title} <ArrowRight size={15} aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <ol className="diag-ledger">
              {weak.map((w, i) => (
                <WeakCard key={w.topic.id} w={w} i={i} maxWrong={maxWrong} featured={i === 0} />
              ))}
            </ol>
          )}
          {weak.length > 0 && (
            <p className="diag-note">
              Sections are matched automatically from each question&apos;s wording, so treat them as a pointer. The exam review shows the
              exact reasoning.
            </p>
          )}
        </section>
        <div className="diag-side rise d4">
          <HowItWorks passMark={p.settings.passMark} />
        </div>
      </div>
    </div>
  );
}

/** Timed drill of questions whose latest answer was wrong, for one topic or all topics. */
export function PracticePage() {
  const p = useProgress();
  const [params] = useSearchParams();
  const topicId = params.get('topic');
  const topic = topicId ? TOPIC_BY_ID.get(topicId) : undefined;
  // snapshot once so the list doesn't change while answers are being recorded
  const [questions] = useState(() => (topic ? [topic] : TOPICS).flatMap((t) => currentlyWrong(p, t)));

  if (!questions.length) {
    const answered = Object.keys(p.mcq).length;
    const exam = topic ? { href: `/topic/${topic.id}?tab=exam`, title: topic.title } : nextExam(p);
    const clear = answered > 0;
    return (
      <div className="page drill-empty">
        <section className={`drill-hero glass rise ${clear ? 'clear' : ''}`} aria-labelledby="drill-title">
          <div className="drill-hero-glow" aria-hidden />
          <span className={`diag-orb ${clear ? 'good' : ''}`} aria-hidden>
            {clear ? <CircleCheck size={28} /> : <Sparkles size={28} />}
          </span>
          <p className="eyebrow">Mistakes drill{topic ? ` · ${topic.title}` : ''}</p>
          <h1 id="drill-title">{clear ? 'No mistakes to practise' : 'Nothing to drill yet'}</h1>
          <p className="lead">
            {topic
              ? `Every question you've attempted in ${topic.title} is currently answered correctly.`
              : clear
                ? 'Every exam question you have attempted is currently answered correctly.'
                : 'This drill is built from your own exam mistakes, and you have not sat an exam yet.'}
          </p>
          <div className="row wrap drill-actions">
            {exam && (
              <Link to={exam.href} className="btn btn-primary btn-lg">
                {topic ? `Back to the ${exam.title} exam` : `Next exam: ${exam.title}`} <ArrowRight size={17} aria-hidden />
              </Link>
            )}
            <Link to="/weak-areas" className={exam ? 'btn btn-lg' : 'btn btn-primary btn-lg'}>
              Weak areas
            </Link>
          </div>
        </section>
        <section className="drill-explain rise d1" aria-labelledby="drill-explain-title">
          <p className="lbl" id="drill-explain-title">
            What fills this drill
          </p>
          <ol>
            <li className="glass">
              <span className="drill-step">01</span>
              <p>Every exam question you answer wrong is added here, for its topic and for &ldquo;all topics&rdquo;.</p>
            </li>
            <li className="glass">
              <span className="drill-step">02</span>
              <p>The drill is timed like an exam and shows the same review and explanations.</p>
            </li>
            <li className="glass">
              <span className="drill-step">03</span>
              <p>A question leaves as soon as your latest answer to it is correct. Drills never affect an exam pass.</p>
            </li>
          </ol>
        </section>
      </div>
    );
  }
  return (
    <Exam
      key={topicId ?? 'all'}
      title={topic ? topic.title : 'All topics'}
      questions={questions}
      backHref={topic ? `/topic/${topic.id}?tab=exam` : '/weak-areas'}
    />
  );
}
