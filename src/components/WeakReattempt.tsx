import { Link } from 'react-router-dom';
import type { TopicWeakness } from '../lib/weak';

/**
 * Today: a compact ruled ledger of the weakest topics with one-click reattempts.
 * Hidden until the learner has answered an exam question; a single line when nothing is weak.
 */
export function WeakReattempt({ weak, answered, passMark }: { weak: TopicWeakness[]; answered: number; passMark: number; firstExamHref?: string }) {
  if (!answered) return null;
  const top = weak.slice(0, 5);
  const maxWrong = Math.max(1, ...top.map((w) => w.wrong.length));
  const totalWrong = weak.reduce((n, w) => n + w.wrong.length, 0);

  if (!weak.length) {
    return (
      <section className="reattempt reattempt-clear" aria-labelledby="weak-title">
        <h2 id="weak-title" className="section-rule-title">
          Weak areas
        </h2>
        <p>
          <span className="reattempt-ok">Clear.</span> Every exam question you have attempted is currently answered correctly.{' '}
          <Link to="/weak-areas">Open the diagnostics</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="reattempt" aria-labelledby="weak-title">
      <div className="section-rule-head">
        <h2 id="weak-title" className="section-rule-title">
          Weak areas
        </h2>
        <div className="reattempt-actions">
          {totalWrong > 0 && (
            <Link to="/practice" className="btn btn-primary btn-sm">
              Practise all {totalWrong} wrong answer{totalWrong === 1 ? '' : 's'}
            </Link>
          )}
          <Link to="/weak-areas" className="btn btn-sm">
            Full analysis
          </Link>
        </div>
      </div>
      <ol className="reattempt-list">
        {top.map((w) => {
          const sec = w.sections[0];
          return (
            <li key={w.topic.id} className="reattempt-row">
              <div className="reattempt-topic">
                <Link to={`/topic/${w.topic.id}`}>{w.topic.title}</Link>
                <span className="reattempt-meta">
                  {w.attempts ? (
                    <>
                      <span className={w.passed ? 'good' : 'bad'}>{w.passed ? 'passed' : 'not passed'}</span> · last {w.last}%
                    </>
                  ) : (
                    'drill only'
                  )}
                  {sec && <> · weakest §{sec.index + 1} {sec.heading}</>}
                </span>
              </div>
              <span className="reattempt-bar" aria-hidden>
                <span style={{ width: `${(w.wrong.length / maxWrong) * 100}%` }} />
              </span>
              <span className="reattempt-num">
                {w.wrong.length ? `${w.wrong.length} wrong` : w.shakyInterview ? `${w.shakyInterview} shaky` : 'retake'}
              </span>
              <span className="reattempt-links">
                {w.wrong.length > 0 && <Link to={`/practice?topic=${w.topic.id}`}>Practise</Link>}
                {sec && (
                  <Link to={`/topic/${w.topic.id}?tab=learn&s=${sec.index}`} title={`Revise ${sec.heading}`}>
                    Revise §{sec.index + 1}
                  </Link>
                )}
                {w.shakyInterview > 0 && <Link to={`/topic/${w.topic.id}?tab=interview`}>Interview Qs</Link>}
                <Link to={`/topic/${w.topic.id}/exam`}>Retake</Link>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="reattempt-note">
        {weak.length > top.length && (
          <>
            +{weak.length - top.length} more on the <Link to="/weak-areas">Weak areas</Link> page.{' '}
          </>
        )}
        A question leaves this list once your latest answer to it is correct. Only a full exam updates a topic&apos;s score (pass mark{' '}
        {passMark}%).
      </p>
    </section>
  );
}
