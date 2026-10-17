import { Link } from 'react-router-dom';
import { LEVELS, PHASES } from '../content/phases';
import { TOPICS } from '../content';
import type { Progress } from '../lib/progress';
import { topicStatus } from '../lib/stats';

const NUMERALS = ['I', 'II', 'III'];
const STATUS_LABEL = { passed: 'covered', 'in-progress': 'in progress', new: 'not started' } as const;

/**
 * The whole course on one sheet: three level columns, each phase a ruled row with one tick per
 * topic (filled = exam passed, half = started). Rows open the phase in the Syllabus; ticks open the topic.
 */
export function CourseMap({ p }: { p: Progress }) {
  return (
    <div className="course-map">
      {LEVELS.map((lv, li) => {
        const phases = PHASES.filter((ph) => ph.level === lv.id);
        const topics = TOPICS.filter((t) => phases.some((ph) => ph.id === t.phase));
        const passed = topics.filter((t) => topicStatus(p, t) === 'passed').length;
        return (
          <section key={lv.id} className="course-level" aria-labelledby={`level-${lv.id}`}>
            <header className="course-level-head">
              <span className="course-numeral" aria-hidden>
                {NUMERALS[li]}
              </span>
              <div>
                <h3 id={`level-${lv.id}`}>{lv.title}</h3>
                <p className="course-level-blurb">{lv.blurb}</p>
              </div>
              <span className="course-level-count">
                {passed}/{topics.length}
              </span>
            </header>
            <ol className="course-phases">
              {phases.map((ph) => {
                const ts = TOPICS.filter((t) => t.phase === ph.id);
                const done = ts.filter((t) => topicStatus(p, t) === 'passed').length;
                return (
                  <li key={ph.id} className={`course-phase ${done === ts.length && ts.length ? 'done' : ''}`}>
                    <Link to={`/contents#phase-${ph.id}`} className="course-phase-link">
                      <span className="course-phase-num">{String(ph.number).padStart(2, '0')}</span>
                      <span className="course-phase-title">{ph.title}</span>
                      <span className="course-phase-count">
                        {done}/{ts.length}
                      </span>
                    </Link>
                    <span className="course-ticks">
                      {ts.map((t) => {
                        const st = topicStatus(p, t);
                        return (
                          <Link key={t.id} to={`/topic/${t.id}`} className={`course-tick ${st}`} title={`${t.title}: ${STATUS_LABEL[st]}`}>
                            <span className="sr-only">
                              {t.title}: {STATUS_LABEL[st]}
                            </span>
                          </Link>
                        );
                      })}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
