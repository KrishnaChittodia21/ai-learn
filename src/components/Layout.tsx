import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, Menu, Moon, Search, Settings, Sun, X } from 'lucide-react';
import { COMPANY_QUESTIONS, TOPICS } from '../content';
import { setSettings, useProgress } from '../lib/progress';
import { companyUnlocked, topicStatus } from '../lib/stats';
import { getUiPrefs, saveUiPrefs, stableLocation } from '../lib/uiPrefs';
import { openPalette, openTour, closePalette, useGuide } from '../lib/guide';
import WelcomeTour from './WelcomeTour';
import { Toaster } from './Toaster';
import { CelebrationWatcher } from './CelebrationWatcher';
import { Footer } from './Footer';

// cmdk is only needed once the palette is opened
const CommandPalette = lazy(() => import('./CommandPalette'));
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
      if (typing || e.metaKey || e.ctrlKey || guide.tour || guide.palette) return;
      if (e.key === '?') {
        e.preventDefault();
        openTour();
      } else if (e.key === '/') {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guide.palette, guide.tour]);

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

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const mistakes = Object.values(p.mcq).filter((r) => !r.lastCorrect).length;
  const passedCount = TOPICS.filter((t) => topicStatus(p, t) === 'passed').length;
  const onTopic = location.pathname.startsWith('/topic/');

  const links = (
    <>
      <NavLink to="/" end className="nav-link">
        Today
      </NavLink>
      <NavLink to="/contents" className={({ isActive }) => `nav-link ${isActive || onTopic ? 'active' : ''}`}>
        Syllabus
      </NavLink>
      <NavLink to="/practice" className="nav-link">
        Practice{mistakes > 0 && <span className="nav-count" aria-label={`${mistakes} mistakes to drill`}>{mistakes}</span>}
      </NavLink>
      <NavLink to="/weak-areas" className="nav-link">
        Weak areas
      </NavLink>
      <NavLink to="/challenges" className="nav-link" title={unlocked ? undefined : 'Unlocks when every topic exam is passed'}>
        Challenges{!unlocked && <Lock size={12} aria-label="locked" className="nav-lock" />}
      </NavLink>
    </>
  );

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="masthead">
        <div className="masthead-inner">
          <NavLink to="/" className="wordmark" aria-label="GenAI Field Manual, home">
            <span className="wordmark-name">GenAI</span>
            <span className="wordmark-sub">Field Manual</span>
          </NavLink>
          <nav className="primary-nav" aria-label="Primary">
            {links}
          </nav>
          <div className="masthead-tools">
            <span className="covered" title="Topics whose exam you have passed">
              <strong>{passedCount}</strong>/{TOPICS.length} covered
            </span>
            <button type="button" className="search-trigger" onClick={openPalette} aria-label="Search topics and sections (⌘K)">
              <Search size={15} aria-hidden />
              <span className="search-trigger-text">Search</span>
              <kbd>⌘K</kbd>
            </button>
            <button type="button" className="btn-ghost tool-btn guide-btn" onClick={openTour} title="Guide (?)">
              Guide
            </button>
            <button
              type="button"
              className="btn-ghost btn-icon theme-toggle"
              onClick={() => setSettings({ theme: isDark ? 'light' : 'dark' })}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
            </button>
            <NavLink to="/settings" className="btn-ghost btn-icon" aria-label="Settings" title="Settings">
              <Settings size={17} aria-hidden />
            </NavLink>
            <button
              type="button"
              className="btn-ghost btn-icon menu-toggle"
              onClick={() => setNavOpen((o) => !o)}
              aria-expanded={navOpen}
              aria-controls="mobile-nav"
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
            >
              {navOpen ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {navOpen && (
            <motion.nav
              id="mobile-nav"
              className="mobile-nav"
              aria-label="Primary"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
            >
              {links}
              <NavLink to="/settings" className="nav-link">
                Settings
              </NavLink>
              <p className="mobile-nav-foot">
                <strong>{passedCount}</strong>/{TOPICS.length} topics covered · {COMPANY_QUESTIONS.length} challenges
              </p>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.06 } }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {outlet}
            <Footer />
          </motion.div>
        </AnimatePresence>
      </main>

      <CelebrationWatcher />
      <Toaster />
      <AnimatePresence>{guide.tour && <WelcomeTour key="tour" />}</AnimatePresence>
      {guide.palette && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
    </div>
  );
}
