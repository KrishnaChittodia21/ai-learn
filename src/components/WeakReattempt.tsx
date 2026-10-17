import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { TopicWeakness } from '../lib/weak';

const shortTitle = (title: string) => title.split(/: | — /)[0];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Today: the weakest spot, framed by the screen's one spinning gradient border, with one-click revise / drill,
 * plus the next few weak topics. Empty states before any exam answer and when nothing is weak.
 */
export function WeakReattempt({
  weak,
  answered,
  passMark,
  firstExamHref,
}: {
  weak: TopicWeakness[];
  answered: number;
  passMark: number;
  firstExamHref?: string;
}) {
  const top = weak.find((w) => w.sections.length > 0) ?? weak[0];
  const totalWrong = weak.reduce((n, w) => n + w.wrong.length, 0);

  if (!top) {
    return (
      <section className="gborder td-weak" aria-labelledby="weak-title">
        <div className="gborder-in td-weak-in">
          <p className="lbl td-weak-eyebrow">{answered ? 'Weak spots · all clear' : 'Weak spots'}</p>
          <h2 id="weak-title" className="td-weak-title">
            {answered ? 'Nothing to fix right now' : 'No weak spots yet'}
          </h2>
          <p className="td-weak-text">
            {answered
              ? 'Every exam question you have attempted is currently answered correctly. Keep going and this card will flag the next thing to revise.'
              : 'Take an exam and this card points at the exact section behind your missed answers, with a one-click drill.'}
          </p>
          <div className="td-weak-actions">
            {answered ? (
              <Link className="btn" to="/weak-areas">
                Open the diagnostics
              </Link>
            ) : (
              <Link className="btn btn-primary" to={firstExamHref ?? '/contents'}>
                Take your first exam <ArrowRight size={16} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  const sec = top.sections[0];
  const missed = sec ? sec.missed.length : top.wrong.length;
  const others = weak.filter((w) => w !== top).slice(0, 3);
  const why = sec
    ? `${plural(missed, 'exam answer')} missed here, in ${shortTitle(top.topic.title)}. Re-read one short section, then drill those questions again.`
    : top.wrong.length
      ? `${plural(top.wrong.length, 'exam answer')} still wrong in this topic. Drill them, then retake the exam (pass mark ${passMark}%).`
      : top.shakyInterview
        ? `${plural(top.shakyInterview, 'interview question')} rated partial or missed. Answer them again out loud.`
        : `Last exam ${top.last}%, below the ${passMark}% pass mark. Retake it when you are ready.`;

  return (
    <section className="gborder td-weak" aria-labelledby="weak-title">
      <div className="gborder-in td-weak-in">
        <p className="lbl td-weak-eyebrow">Weak spot detected</p>
        <h2 id="weak-title" className="td-weak-title">
          {sec ? sec.heading : shortTitle(top.topic.title)}
        </h2>
        <p className="td-weak-text">{why}</p>
        <div className="td-weak-actions">
          {sec && (
            <Link className="btn btn-primary" to={`/topic/${top.topic.id}?tab=learn&s=${sec.index}`}>
              Revise §{sec.index + 1}
            </Link>
          )}
          {top.wrong.length > 0 ? (
            <Link className={sec ? 'btn' : 'btn btn-primary'} to={`/practice?topic=${top.topic.id}`}>
              Practise {plural(top.wrong.length, 'mistake')}
            </Link>
          ) : top.shakyInterview > 0 ? (
            <Link className="btn btn-primary" to={`/topic/${top.topic.id}?tab=interview`}>
              Interview Qs
            </Link>
          ) : (
            <Link className="btn btn-primary" to={`/topic/${top.topic.id}/exam`}>
              Retake the exam
            </Link>
          )}
        </div>
        {others.length > 0 && (
          <div className="td-weak-more">
            <p className="lbl">Also weak</p>
            <ul>
              {others.map((w) => (
                <li key={w.topic.id}>
                  <Link to={w.wrong.length ? `/practice?topic=${w.topic.id}` : `/topic/${w.topic.id}`} title={w.topic.title}>
                    {shortTitle(w.topic.title)}
                  </Link>
                  <span>{w.wrong.length ? `${w.wrong.length} wrong` : w.shakyInterview ? `${w.shakyInterview} shaky` : `last ${w.last}%`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="td-weak-foot">
          {totalWrong > 1 && (
            <>
              <Link to="/practice">Practise all {totalWrong} wrong answers</Link> ·{' '}
            </>
          )}
          <Link to="/weak-areas">Full analysis</Link>
        </p>
      </div>
    </section>
  );
}
