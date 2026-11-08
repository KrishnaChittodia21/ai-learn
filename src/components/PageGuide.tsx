// The "?" launcher: "Guide · this page" (what is what, plus Show me) and the list of every page guide.
// Also the quiet first-visit offer. Design: new-features/guide-me.html.
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, BookA, BookOpen, Braces, ChartSpline, Check, CircleDot, CirclePlay, Compass, Crosshair, FileCheck, Medal, MousePointerClick, Route, Settings, Sparkles, Star, Target, Trophy, X, type LucideIcon } from 'lucide-react';
import { TOPICS } from '../content';
import { closePageGuide, guideBusy, openTour, startWalk, useGuide } from '../lib/guide';
import { GUIDES, GUIDE_ORDER, guideIdFor, shouldOffer, type GuideId } from '../lib/pageGuides';
import { getUiPrefs, markGuideSeen, useUiPrefs } from '../lib/uiPrefs';
import { useFocusTrap } from '../lib/useFocusTrap';
import { showToast } from '../lib/toast';

const ICON: Record<GuideId, LucideIcon> = { today: Sparkles, track: Activity, topic: BookOpen, exam: FileCheck, saved: Star, shorts: CirclePlay, plan: ChartSpline, settings: Settings, syllabus: CircleDot, weak: Target, practice: Crosshair, challenges: Trophy, achievements: Medal, paths: Route, drills: Braces, glossary: BookA };

/** The topic to show Topic / Exam guides on when you are elsewhere: the last one studied, else the first. */
function topicHref(exam: boolean) {
  const m = /^\/topic\/([^/?]+)/.exec(getUiPrefs().lastStudyLocation ?? '');
  const id = m?.[1] ?? TOPICS[0]?.id;
  return `/topic/${id}${exam ? '/exam' : ''}`;
}

export function PageGuidePanel() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const prefs = useUiPrefs();
  const here = guideIdFor(pathname);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, closePageGuide);
  if (!here) return null;
  const guide = GUIDES[here];
  // "Show me" only when something it points at is on screen (e.g. not on a study-locked exam)
  const canShow = guide.stops.some((s) => document.querySelector(s.target));

  const open = (id: GuideId) => {
    if (id !== here) navigate(id === 'topic' ? topicHref(false) : id === 'exam' ? topicHref(true) : GUIDES[id].href);
    startWalk(id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closePageGuide()}>
      <motion.div
        ref={ref}
        className="modal gp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gp-title"
        tabIndex={-1}
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <div className="gp-top">
          <span className="eyebrow">
            <Compass size={14} aria-hidden /> Guide · this page
          </span>
          <button type="button" className="btn-ghost btn-icon" aria-label="Close guide" onClick={closePageGuide}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="gp-body">
          <h2 id="gp-title">{guide.title}</h2>
          <p className="muted">{guide.intro}</p>
          <dl className="gp-gloss">
            {guide.stops.map((s) => (
              <div key={s.id}>
                <dt>{s.title}</dt>
                <dd>{s.text}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="gp-actions">
          <button type="button" className={`btn${canShow ? '' : ' btn-primary'}`} data-autofocus={canShow ? undefined : true} onClick={closePageGuide}>
            Got it
          </button>
          {canShow && (
            <button type="button" className="btn btn-primary" data-autofocus onClick={() => startWalk(here)}>
              <MousePointerClick size={16} aria-hidden /> Show me
            </button>
          )}
        </div>
        <nav className="gp-list" aria-labelledby="gp-l">
          <p className="eyebrow" id="gp-l">
            Guides
          </p>
          <ul>
            {GUIDE_ORDER.map((id) => {
              const Icon = ICON[id];
              const seen = !!prefs.guidesSeen?.[id];
              const n = GUIDES[id].stops.length;
              return (
                <li key={id}>
                  <button type="button" className={`gp-item${id === here ? ' here' : ''}`} aria-current={id === here ? 'page' : undefined} onClick={() => open(id)}>
                    <Icon size={16} aria-hidden /> {GUIDES[id].title}
                    <small className={seen ? 'seen' : 'new'}>
                      {seen && <Check size={12} aria-hidden />}
                      {n} stops · {seen ? 'seen' : 'new'}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="gp-foot">
          <kbd>?</kbd> opens this · <kbd>←</kbd> <kbd>→</kbd> move · <kbd>Esc</kbd> closes ·{' '}
          <button type="button" className="link-btn" onClick={openTour}>
            Full course tour
          </button>
        </p>
      </motion.div>
    </div>
  );
}

/** First visit to a page with a guide: a quiet offer, shown once (bottom right; above the tab bar on phones). */
export function GuideOffer() {
  const { pathname } = useLocation();
  const prefs = useUiPrefs();
  const guide = useGuide();
  const id = guideIdFor(pathname);
  const [offer, setOffer] = useState<GuideId | null>(null);
  const busy = guideBusy(guide);

  useEffect(() => {
    // after the page has settled; marked seen as soon as it shows, so it is offered only once
    const t = shouldOffer(id, prefs) && !busy ? setTimeout(() => (setOffer(id), markGuideSeen(id)), 700) : undefined;
    return () => {
      clearTimeout(t);
      if (!busy) setOffer(null);
    };
    // prefs changes (e.g. marking seen) must not cancel a shown offer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, busy, prefs.tourSeen]);

  const notNow = useCallback(() => {
    setOffer(null);
    showToast('Any time: press ?', 'The guide for each page is under the ? button.', 4000, 'info', { kicker: 'Guide' });
  }, []);

  if (!offer || busy || offer !== id) return null;
  const g = GUIDES[offer];
  return (
    <section className="fv glass" aria-labelledby="fv-h">
      <div className="fv-in">
        <span className="fv-ic" aria-hidden>
          <Compass size={20} />
        </span>
        <div>
          <h2 id="fv-h">New here?</h2>
          <p>
            Take the {g.stops.length}-stop tour of {g.title}. About 40 seconds, and <kbd>?</kbd> brings it back any time.
          </p>
          <div className="row gap-s">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setOffer(null);
                startWalk(offer);
              }}
            >
              Take the tour
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={notNow}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
