import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BookA, Braces, ChartColumn, ChartSpline, CircleDot, CircleHelp, CirclePlay, Ellipsis, Flame, Lock, Medal, Moon, Route, Search, Settings, Sparkles, Star, Sun, Target, Trophy, X } from 'lucide-react';
import { COMPANY_QUESTIONS, TOPICS } from '../content';
import { localDay, setSettings, setStudyPlan, useProgress } from '../lib/progress';
import { planWithLog } from '../lib/pace';
import { companyUnlocked, topicStatus } from '../lib/stats';
import { getUiPrefs, saveUiPrefs, stableLocation } from '../lib/uiPrefs';
import { openPalette, openTour, openPageGuide, closePalette, guideBusy, useGuide } from '../lib/guide';
import { guideIdFor } from '../lib/pageGuides';
import { GuideOffer, PageGuidePanel } from './PageGuide';
import WelcomeTour from './WelcomeTour';
import { Toaster } from './Toaster';
import { CelebrationWatcher } from './CelebrationWatcher';
import { Footer } from './Footer';
import { AmbientStage, BrandMark, Wordmark } from './Brand';
import { studyStreak } from '../lib/streak';
import { useAchievementDetection } from '../lib/useAchievements';
import { ACHIEVEMENT_TOTAL, achievementById, TIER_LABEL } from '../content/achievements';
import { useTip } from './Tip';

// cmdk is only needed once the palette is opened
const CommandPalette = lazy(() => import('./CommandPalette'));
const Walkthrough = lazy(() => import('./Walkthrough'));
// the unlock dialog is only needed once a badge is earned
const AchievementCelebration = lazy(() => import('./achievements/AchievementCelebration'));
const ACCENT_IDS = ['pine', 'ink', 'plum'];

export default function Layout() {
  const p = useProgress();
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();
  const loc = location.pathname + location.search;
  const locRef = useRef(loc);
  locRef.current = loc;
  const firstRoute = useRef(true);
  const { unlocked } = companyUnlocked(p, TOPICS);
  const guide = useGuide();
  const outlet = useOutlet();
  const busy = guideBusy(guide);
  // "?" / Guide: the guide for this page, or the full welcome tour where a page has none
  const openGuide = useCallback(() => (guideIdFor(location.pathname) ? openPageGuide() : openTour()), [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (p.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', p.settings.theme);
  }, [p.settings.theme]);

  // signal colour: vermilion is the base token set; older saved accents fall back to it
  const accent = p.settings.accent ?? 'vermilion';
  useEffect(() => {
    const root = document.documentElement;
    if (ACCENT_IDS.includes(accent)) root.setAttribute('data-accent', accent);
    else root.removeAttribute('data-accent');
  }, [accent]);

  // track the OS preference so the toggle icon is right while theme = 'system'
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const isDark = p.settings.theme === 'dark' || (p.settings.theme === 'system' && systemDark);

  useEffect(() => {
    saveUiPrefs(loc === '/' ? { lastLocation: loc } : { lastLocation: loc, lastStudyLocation: stableLocation(loc) });
  }, [loc]);

  // study plan: keep today's [covered, expected] in the plan log (the curve's past and the Pacesetter badge)
  useEffect(() => {
    if (!p.studyPlan) return;
    const next = planWithLog(p.studyPlan, p, TOPICS, localDay());
    if (next !== p.studyPlan) setStudyPlan(next);
  }, [p]);

  // First visit: open the welcome tour once.
  useEffect(() => {
    if (!getUiPrefs().tourSeen) openTour();
  }, []);

  // ⌘K / Ctrl+K toggles the command palette; "?" opens the guide; "/" opens search (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (guide.palette) closePalette();
        else openPalette();
        return;
      }
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      if (typing || e.metaKey || e.ctrlKey || busy) return;
      if (e.key === '?') {
        e.preventDefault();
        openGuide();
      } else if (e.key === '/') {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide.palette, busy, openGuide]);

  // New page → top of page, except on app start, where we restore the saved scroll position.
  useEffect(() => {
    setNavOpen(false);
    if (firstRoute.current) {
      firstRoute.current = false;
      const saved = getUiPrefs().lastScroll;
      if (saved && saved.loc === locRef.current) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: saved.y })));
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Remember how far down the current page the user has read.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => saveUiPrefs({ lastScroll: { loc: locRef.current, y: Math.round(window.scrollY) } }), 200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Escape closes the More sheet.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  // ---- achievements: detect + store new badges; celebrate once the guide (and search) is closed ----
  const navigate = useNavigate();
  const { queue: newBadges, dismiss: dismissUnlocked } = useAchievementDetection(p);
  // …and until the Shorts player is closed, so the end card is not covered
  const showUnlocked = newBadges.length > 0 && !busy && !location.pathname.startsWith('/short/');
  const viewAllAchievements = useCallback(() => {
    dismissUnlocked();
    navigate('/achievements');
  }, [dismissUnlocked, navigate]);
  const unlockedNews = !showUnlocked
    ? ''
    : newBadges.length === 1
      ? `Achievement unlocked: ${achievementById[newBadges[0].id]?.name ?? ''}${TIER_LABEL[newBadges[0].tier] ? `, ${TIER_LABEL[newBadges[0].tier]} tier` : ''}`
      : `${newBadges.length} achievements unlocked`;
  const earnedCount = Object.keys(p.achievements ?? {}).filter((id) => achievementById[id]).length;
  const achLabel = `Achievements: ${earnedCount} of ${ACHIEVEMENT_TOTAL} earned`;

  const savedOpen = (p.saved ?? []).filter((s) => !s.doneAt).length;
  const savedLabel = `Saved for later: ${savedOpen} item${savedOpen === 1 ? '' : 's'}`;
  const mistakes = Object.values(p.mcq).filter((r) => !r.lastCorrect).length;
  const passedCount = TOPICS.filter((t) => topicStatus(p, t) === 'passed').length;
  const onTopic = location.pathname.startsWith('/topic/');
  // lessons, exams and challenge write-ups: ambient orbs pause behind text being read
  const reading = onTopic || /^\/challenges\/./.test(location.pathname);
  const streak = studyStreak(p.activityDays);
  const streakLabel = streak > 0 ? `${streak}-day streak` : 'Start a streak';
  const toggleTheme = () => setSettings({ theme: isDark ? 'light' : 'dark' });
  const themeLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const savedTip = useTip('Saved for later');
  const achTip = useTip(achLabel);
  const guideTip = useTip('Guide for this page', { kbd: '?' });
  const themeTip = useTip(isDark ? 'Light mode' : 'Dark mode');
  const settingsTip = useTip('Settings', { end: true });

  // phone dock: one pill slides (transform only) to the active tab; reduced motion fades it out and in instead
  const reduce = useReducedMotion();
  const tabbarRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const bar = tabbarRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    let timer = 0;
    const place = (animate: boolean) => {
      const tab = bar.querySelector<HTMLElement>('.tab.active');
      const put = () => {
        pill.style.opacity = tab ? '1' : '0';
        if (!tab) return;
        pill.style.width = `${tab.offsetWidth}px`;
        pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      };
      const jump = () => {
        pill.style.transition = 'none';
        put();
        void pill.offsetWidth;
        pill.style.transition = '';
      };
      if (!animate || !pill.style.transform) return jump();
      if (!reduce) return put();
      pill.style.opacity = '0';
      timer = window.setTimeout(() => {
        jump();
      }, 150);
    };
    place(true);
    const onResize = () => place(false);
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [location.pathname, reduce]);

  const lockTitle = unlocked ? undefined : 'Unlocks when every topic exam is passed';
  const navItems = [
    { to: '/', label: 'Today', short: 'Today', icon: Sparkles, end: true },
    { to: '/contents', label: 'Syllabus', short: 'Syllabus', icon: CircleDot, active: onTopic },
    // phones reach Shorts from the More sheet (the tab bar keeps five tabs)
    { to: '/shorts', label: 'Shorts', short: 'Shorts', icon: CirclePlay, active: location.pathname.startsWith('/short/'), desktopOnly: true },
    { to: '/plan', label: 'Plan', short: 'Plan', icon: ChartSpline, desktopOnly: true },
    { to: '/practice', label: 'Practice', short: 'Practice', icon: ChartColumn, count: mistakes },
    { to: '/weak-areas', label: 'Weak areas', short: 'Weak', icon: Target },
    { to: '/challenges', label: 'Challenges', short: 'Challenges', icon: Trophy, locked: !unlocked },
  ];
  const cls =
    (base: string, extra?: boolean) =>
    ({ isActive }: { isActive: boolean }) =>
      `${base}${isActive || extra ? ' active' : ''}`;

  return (
    <div className="shell" data-reading={reading ? '' : undefined}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <AmbientStage />
      <header className="masthead">
        <div className="masthead-inner glass">
          <NavLink to="/" className="wordmark" aria-label="GenAI.learn, home">
            <BrandMark />
            <Wordmark />
          </NavLink>
          <nav className="primary-nav" aria-label="Primary">
            {navItems.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={cls('nav-link', n.active)} title={n.locked ? lockTitle : undefined}>
                {n.label}
                {!!n.count && (
                  <span className="nav-count" aria-label={`${n.count} mistakes to drill`}>
                    {n.count}
                  </span>
                )}
                {n.locked && <Lock size={12} aria-label="locked" className="nav-lock" />}
              </NavLink>
            ))}
          </nav>
          <div className="masthead-tools">
            <button type="button" className="search-trigger" onClick={openPalette} aria-label="Search topics and sections (⌘K)">
              <Search size={16} aria-hidden />
              <span className="search-trigger-text">Search</span>
              <kbd>⌘K</kbd>
            </button>
            <span className={`streak-chip${streak > 0 ? '' : ' is-zero'}`} title="Study streak: consecutive days with study activity" aria-label={streakLabel}>
              <Flame size={15} aria-hidden className="streak-flame" />
              <span className="streak-text">{streakLabel}</span>
              <span className="streak-num" aria-hidden>
                {streak}
              </span>
            </span>
            <NavLink to="/saved" className={cls('tool-btn saved-hdr')} aria-label={savedLabel} {...savedTip.host}>
              <Star size={18} aria-hidden />
              {savedTip.tip}
              {savedOpen > 0 && (
                <span className="hdr-n" aria-hidden>
                  {savedOpen > 99 ? '99+' : savedOpen}
                </span>
              )}
            </NavLink>
            <NavLink to="/achievements" className={cls('ach-hdr')} aria-label={achLabel} {...achTip.host}>
              {achTip.tip}
              <Medal size={16} aria-hidden className="ach-hdr-icon" />
              <span className="ach-hdr-text">Achievements</span>
              <span className="ach-hdr-num" aria-hidden>
                {earnedCount}
                <small>/{ACHIEVEMENT_TOTAL}</small>
              </span>
            </NavLink>
            <button type="button" className="tool-btn guide-btn" onClick={openGuide} aria-label="Guide for this page (?)" {...guideTip.host}>
              <CircleHelp size={18} aria-hidden />
              {guideTip.tip}
            </button>
            <button type="button" className="tool-btn theme-toggle" onClick={toggleTheme} aria-label={themeLabel} {...themeTip.host}>
              {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
              {themeTip.tip}
            </button>
            <NavLink to="/settings" className={cls('tool-btn settings-btn')} aria-label="Settings" {...settingsTip.host}>
              <Settings size={18} aria-hidden />
              {settingsTip.tip}
            </NavLink>
            <button
              type="button"
              className="tool-btn menu-toggle"
              onClick={() => setNavOpen((o) => !o)}
              aria-expanded={navOpen}
              aria-controls="more-sheet"
              aria-label={navOpen ? 'Close menu' : 'More: search, Shorts, plan, learning paths, glossary, drills, saved, achievements, guide, theme, settings'}
            >
              {navOpen ? <X size={19} aria-hidden /> : <Ellipsis size={19} aria-hidden />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {navOpen && (
            <>
              <motion.button
                key="scrim"
                type="button"
                className="more-scrim"
                aria-label="Close menu"
                tabIndex={-1}
                onClick={() => setNavOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
              <motion.div
                key="sheet"
                id="more-sheet"
                className="more-sheet glass"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <button
                  type="button"
                  className="more-item"
                  onClick={() => {
                    setNavOpen(false);
                    openPalette();
                  }}
                >
                  <Search size={18} aria-hidden /> Search the manual
                </button>
                <NavLink to="/shorts" className={cls('more-item', location.pathname.startsWith('/short/'))}>
                  <CirclePlay size={18} aria-hidden /> Shorts
                </NavLink>
                <NavLink to="/plan" className={cls('more-item')}>
                  <ChartSpline size={18} aria-hidden /> Plan your journey
                </NavLink>
                <NavLink to="/paths" className={cls('more-item', location.pathname.startsWith('/paths/'))}>
                  <Route size={18} aria-hidden /> Learning paths
                </NavLink>
                <NavLink to="/glossary" className={cls('more-item')}>
                  <BookA size={18} aria-hidden /> Glossary
                </NavLink>
                <NavLink to="/drills" className={cls('more-item')}>
                  <Braces size={18} aria-hidden /> From-scratch drills
                </NavLink>
                <NavLink to="/saved" className={cls('more-item')}>
                  <Star size={18} aria-hidden /> Saved for later
                  <span className="more-n" aria-label={`${savedOpen} items`}>
                    {savedOpen}
                  </span>
                </NavLink>
                <NavLink to="/achievements" className={cls('more-item ach-more')}>
                  <Medal size={18} aria-hidden /> Achievements
                  <span className="ach-more-n" aria-label={`${earnedCount} of ${ACHIEVEMENT_TOTAL} earned`}>
                    {earnedCount}/{ACHIEVEMENT_TOTAL}
                  </span>
                </NavLink>
                <button
                  type="button"
                  className="more-item"
                  onClick={() => {
                    setNavOpen(false);
                    openGuide();
                  }}
                >
                  <CircleHelp size={18} aria-hidden /> Guide for this page
                </button>
                <button type="button" className="more-item" onClick={toggleTheme}>
                  {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />} {isDark ? 'Light mode' : 'Dark mode'}
                </button>
                <NavLink to="/settings" className={cls('more-item')}>
                  <Settings size={18} aria-hidden /> Settings
                </NavLink>
                <p className="more-foot">
                  <strong>{passedCount}</strong>/{TOPICS.length} topics covered · {COMPANY_QUESTIONS.length} challenges
                </p>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </header>

      <nav className="tabbar glass" aria-label="Primary" ref={tabbarRef}>
        <span className="tab-pill" ref={pillRef} aria-hidden />
        {navItems.filter((n) => !n.desktopOnly).map((n) => {
          const Icon = n.icon;
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className={cls('tab', n.active)} title={n.locked ? lockTitle : undefined}>
              <span className="tab-icon">
                <Icon size={20} aria-hidden />
                {!!n.count && (
                  <span className="tab-count" aria-label={`${n.count} mistakes to drill`}>
                    {n.count > 99 ? '99+' : n.count}
                  </span>
                )}
                {n.locked && <Lock size={10} aria-label="locked" className="tab-lock" />}
              </span>
              <span className="tab-label">{n.short}</span>
            </NavLink>
          );
        })}
      </nav>

      <main id="main" className="main" tabIndex={-1}>
        {/* enter only (CSS): the next page shows at once, no blank exit gap */}
        <div key={location.pathname} className="route-in">
          {outlet}
          <Footer />
        </div>
      </main>

      <CelebrationWatcher />
      <Toaster />
      <AnimatePresence>{guide.tour && <WelcomeTour key="tour" />}</AnimatePresence>
      {guide.page && <PageGuidePanel />}
      {guide.walk && (
        <Suspense fallback={null}>
          <Walkthrough key={`${guide.walk}:${location.pathname}`} id={guide.walk} />
        </Suspense>
      )}
      <GuideOffer />
      {guide.palette && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      {/* achievement unlocks wait until the guide and the search palette are closed */}
      {showUnlocked && (
        <Suspense fallback={null}>
          <AchievementCelebration items={newBadges} onClose={dismissUnlocked} onViewAll={viewAllAchievements} />
        </Suspense>
      )}
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {unlockedNews}
      </div>
    </div>
  );
}
