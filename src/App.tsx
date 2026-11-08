import { lazy, Suspense, type ReactNode } from 'react';
import { RouterProvider, createHashRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import Layout from './components/Layout';
import Home from './pages/Home';
import { resumeLocation } from './lib/uiPrefs';
import { RouteSkeleton } from './components/RouteSkeleton';

// Topic, exam, practice and challenge pages (and the markdown, code and lesson UI they carry) load on first use,
// next to the topic bodies themselves (loadTopic), so the startup bundle stays small
const SettingsPage = lazy(() => import('./pages/Settings'));
const ContentsPage = lazy(() => import('./pages/Contents'));
const AchievementsPage = lazy(() => import('./pages/Achievements'));
const SavedPage = lazy(() => import('./pages/Saved'));
const TopicPage = lazy(() => import('./pages/Topic'));
const ExamPage = lazy(() => import('./pages/Exam'));
const CompaniesPage = lazy(() => import('./pages/Companies').then((m) => ({ default: m.CompaniesPage })));
const CompanyQuestionPage = lazy(() => import('./pages/Companies').then((m) => ({ default: m.CompanyQuestionPage })));
const WeakAreasPage = lazy(() => import('./pages/WeakAreas').then((m) => ({ default: m.WeakAreasPage })));
const PracticePage = lazy(() => import('./pages/WeakAreas').then((m) => ({ default: m.PracticePage })));
// Shorts and the player load on first use, so the main bundle stays small
const ShortsPage = lazy(() => import('./pages/Shorts'));
const ShortPage = lazy(() => import('./pages/Short'));
const PlanPage = lazy(() => import('./pages/Plan'));
// drills carry the TypeScript runner (sucrase), so they load only when opened
const DrillsPage = lazy(() => import('./pages/Drills'));
const DrillPage = lazy(() => import('./pages/Drills').then((m) => ({ default: m.DrillPage })));
// glossary data (~200 terms) stays out of the startup chunk
const GlossaryPage = lazy(() => import('./pages/Glossary'));
const PathsPage = lazy(() => import('./pages/Paths'));
// slow loads get a page-shaped skeleton after 200 ms (fast ones show nothing)
const later = (el: ReactNode, kind?: 'shorts') => <Suspense fallback={<RouteSkeleton kind={kind} />}>{el}</Suspense>;

// On a fresh start at the dashboard URL, reopen the page the user was last reading.
// Deep links (any other hash) are respected as-is.
const resume = resumeLocation();
if (resume && ['', '#', '#/'].includes(window.location.hash)) {
  window.history.replaceState(null, '', `#${resume}`);
}

const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: (
      <div className="page narrow" style={{ padding: 40 }}>
        <h1>Something went wrong on this page</h1>
        <p className="muted">Your progress is safe. It's stored in this browser.</p>
        <a className="btn btn-primary" href="#/">
          Back to dashboard
        </a>
      </div>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'contents', element: later(<ContentsPage />) },
      { path: 'topic/:id', element: later(<TopicPage />) },
      { path: 'topic/:id/exam', element: later(<ExamPage />) },
      { path: 'challenges', element: later(<CompaniesPage />) },
      { path: 'challenges/:qid', element: later(<CompanyQuestionPage />) },
      { path: 'weak-areas', element: later(<WeakAreasPage />) },
      { path: 'practice', element: later(<PracticePage />) },
      { path: 'achievements', element: later(<AchievementsPage />) },
      { path: 'saved', element: later(<SavedPage />) },
      { path: 'shorts', element: later(<ShortsPage />, 'shorts') },
      { path: 'short/:id', element: later(<ShortPage />) },
      { path: 'plan', element: later(<PlanPage />) },
      { path: 'drills', element: later(<DrillsPage />) },
      { path: 'drills/:id', element: later(<DrillPage />) },
      { path: 'glossary', element: later(<GlossaryPage />) },
      { path: 'paths', element: later(<PathsPage view="list" />) },
      { path: 'paths/:id', element: later(<PathsPage view="detail" />) },
      { path: 'paths/:id/practice', element: later(<PathsPage view="practice" />) },
      { path: 'paths/:id/certificate', element: later(<PathsPage view="certificate" />) },
      { path: 'settings', element: later(<SettingsPage />) },
      { path: '*', element: <Home /> },
    ],
  },
]);

export default function App() {
  // reducedMotion="user": the OS "reduce motion" setting turns off transform animations app-wide
  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  );
}
