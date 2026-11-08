// Guide Me (M3): one spotlight guide per page. Pure data, so tests can check every stop against the markup.
// Every stop targets a `[data-guide="…"]` attribute; the walkthrough skips stops not on screen (a locked tab,
// the setup screen vs the running exam, a phone layout).
// Adding a page later: add its id to GuideId, an entry to GUIDES and GUIDE_ORDER,
// a match in guideIdFor, and its source files in tests/guides.test.ts.

export type GuideId =
  | 'today'
  | 'track'
  | 'topic'
  | 'exam'
  | 'saved'
  | 'shorts'
  | 'plan'
  | 'settings'
  | 'syllabus'
  | 'weak'
  | 'practice'
  | 'challenges'
  | 'achievements'
  | 'paths'
  | 'drills'
  | 'glossary';

export interface GuideStop {
  id: string;
  target: string;
  title: string;
  text: string;
}

export interface PageGuide {
  title: string;
  intro: string;
  /** where the Guides list opens it when you are elsewhere */
  href: string;
  stops: GuideStop[];
}

const at = (name: string) => `[data-guide="${name}"]`;

export const GUIDES: Record<GuideId, PageGuide> = {
  today: {
    title: 'Dashboard',
    intro: 'Your launch pad: what to study next, how much of the map glows, and today\'s Short.',
    href: '/',
    stops: [
      { id: 'coverage', target: at('coverage'), title: 'Neural coverage', text: 'Every topic is a node. It glows ion when you pass its exam and pulses pink while you are in it. The ring marks your next topic.' },
      { id: 'mission', target: at('mission'), title: 'Next mission', text: 'The one thing to do next, picked from where you stopped. Resume jumps straight to it.' },
      { id: 'short-of-the-day', target: at('short-of-the-day'), title: 'Short of the day', text: 'One idea, animated, in about a minute. A new pick every day; every Short is open on the Shorts page.' },
    ],
  },
  track: {
    title: 'Track',
    intro: 'Everything that measures your progress: coverage, pace, weak spots, streaks and badges.',
    href: '/track',
    stops: [
      { id: 'figures', target: at('figures'), title: 'Your figures', text: 'Topics covered, sections read, exercises solved and mistakes left. Changes since your last visit count up.' },
      { id: 'activity', target: at('activity'), title: 'Streak and activity', text: 'Any section, lab or exam on a day keeps the flame going. The recent weeks are drawn here.' },
      { id: 'achievements', target: at('achievements'), title: 'Achievements', text: 'Badges for real milestones, earned in this browser. The bar shows the closest one.' },
      { id: 'record', target: at('record'), title: 'Study record', text: 'Exam scores, accuracy and practice volume over time, each with a table view.' },
    ],
  },
  topic: {
    title: 'Topic',
    intro: 'One topic, studied in order: read, try it in a lab, then prove it in the exam.',
    href: '/contents',
    stops: [
      { id: 'study-path', target: at('study-path'), title: 'Study path', text: 'Read → labs → interview → estimation → exam. Each step fills in as you finish it; the exam unlocks when every section is read.' },
      { id: 'sections', target: at('sections'), title: 'Sections', text: 'Every section of this topic. Click one to jump to it; read ones are ticked.' },
      { id: 'section-save', target: at('section-save'), title: '☆ Save and Mark as read', text: 'Star a section to come back to it from the Saved page. Tick Read when you finish it.' },
      { id: 'quick-check', target: at('quick-check'), title: 'Quick check', text: 'One question at the end of a section. A miss is remembered in Weak areas.' },
      { id: 'prompt-lab-tab', target: at('prompt-lab-tab'), title: 'Prompt Lab', text: 'Rewrite a weak prompt and watch an offline scorecard grade its structure. The number is how many labs you solved.' },
    ],
  },
  exam: {
    title: 'Exam',
    intro: 'A timed, shuffled exam. Only full-length attempts at the pass mark count.',
    href: '/contents',
    stops: [
      { id: 'exam-setup', target: at('exam-setup'), title: 'Set up', text: 'Time limit, number of questions, shuffle and interview mode. Fewer questions make a practice run.' },
      { id: 'exam-start', target: at('exam-start'), title: 'Start', text: 'A summary of the attempt. It auto-submits when the timer reaches zero.' },
      { id: 'exam-timer', target: at('exam-timer'), title: 'Timer', text: 'Time left. It turns red in the last minute.' },
      { id: 'exam-navigator', target: at('exam-navigator'), title: 'Navigator', text: 'One square per question: filled when answered, marked when flagged. Click one to jump to it.' },
      { id: 'exam-question', target: at('exam-question'), title: 'Question', text: 'Pick one answer, or every right one when it says "Select all that apply".' },
    ],
  },
  saved: {
    title: 'Saved',
    intro: 'Everything you starred with ☆ Save, grouped by kind, ready to come back to.',
    href: '/saved',
    stops: [
      { id: 'saved-filters', target: at('saved-filters'), title: 'Filters', text: 'Show one kind at a time. The numbers are items still to do.' },
      { id: 'saved-sort', target: at('saved-sort'), title: 'Order', text: 'Newest or oldest saved first.' },
      { id: 'saved-actions', target: at('saved-actions'), title: 'Done and remove', text: 'Tick Done when you have been back to it, or remove it. Both can be undone from the note that pops up.' },
      { id: 'saved-play', target: at('saved-play'), title: 'Play all', text: 'Plays your saved Shorts one after another, oldest first.' },
      { id: 'saved-done', target: at('saved-done'), title: 'Done list', text: 'Finished items fold away here. Clear done frees space.' },
      { id: 'saved-cap', target: at('saved-cap'), title: 'Space', text: 'Up to 500 items. When it is full, the oldest done items make room first.' },
    ],
  },
  shorts: {
    title: 'Shorts',
    intro: 'Short animated stories, each ending with one question and a link to the lesson.',
    href: '/shorts',
    stops: [
      { id: 'shorts-today', target: at('shorts-today'), title: 'Short of the day', text: 'Always open. Watch it, answer its question, and it stays ticked for the rest of the day.' },
      { id: 'shorts-filters', target: at('shorts-filters'), title: 'Filters', text: 'Show what is unwatched, watched, saved or still locked.' },
      { id: 'shorts-grid', target: at('shorts-grid'), title: 'Every Short', text: 'All Shorts in course order; the filters above narrow them. In the player: ← → move, Space or hold pauses, the speed button reads slower or faster.' },
    ],
  },
  plan: {
    title: 'Plan',
    intro: 'Your training run: a pace, a goal, a date for every phase and a pacer to keep up with.',
    href: '/plan',
    stops: [
      { id: 'plan-pace', target: at('plan-pace'), title: 'Your pace', text: 'Minutes a day, days a week and a goal: the whole course, a level, a phase or one topic. A new pace applies from today and keeps any gap.' },
      { id: 'plan-curve', target: at('plan-curve'), title: 'Learning curve', text: 'Your curve against the dashed pacer. Pink shading means behind, cyan ahead; the dotted lines project both to the goal.' },
      { id: 'plan-status', target: at('plan-status'), title: 'Behind or ahead', text: 'When you fall behind it offers extra minutes for two weeks or a later finish. Only "Move my finish date" clears the gap. Warnings can be turned off.' },
      { id: 'plan-checkpoints', target: at('plan-checkpoints'), title: 'Checkpoints', text: 'One per phase, with its date: ◆ covered, ▸ in training, ◇ ahead. Shorts do not count towards plan minutes.' },
    ],
  },
  settings: {
    title: 'Settings',
    intro: 'Preferences and your data. Everything is stored in this browser.',
    href: '/settings',
    stops: [
      { id: 'settings-tab-study', target: at('settings-tab-study'), title: 'Study', text: 'Pass mark, exam timing, shuffling, the study-first lock and the mock-interview timer.' },
      { id: 'settings-tab-appearance', target: at('settings-tab-appearance'), title: 'Appearance', text: 'Light, dark or system theme, the signal colour for buttons and links, and depth effects.' },
      { id: 'settings-tab-guide', target: at('settings-tab-guide'), title: 'Guide & help', text: 'Coach tips, glossary definitions in lessons, and the full welcome tour.' },
      { id: 'settings-tab-data', target: at('settings-tab-data'), title: 'Data & backup', text: 'Export a backup (the only copy outside this browser), import one, or reset progress.' },
    ],
  },
  syllabus: {
    title: 'Syllabus',
    intro: 'Every level, phase and topic of the course, collapsed until you open what you need.',
    href: '/contents',
    stops: [
      { id: 'syl-galaxy', target: at('syl-galaxy'), title: 'The map', text: 'Each dot is a phase on its level\'s orbit. Covered phases glow, the one you are in pulses. Click a dot to jump to it.' },
      { id: 'syl-search', target: at('syl-search'), title: 'Search and filters', text: 'Search topics, sections and keywords, or show only unread sections or sections with an animation.' },
      { id: 'syl-expand', target: at('syl-expand'), title: 'Open or close all', text: 'Phases start collapsed. Expand all opens every one; searching opens the phases that match.' },
      { id: 'syl-level', target: at('syl-level'), title: 'Levels and phases', text: 'Beginner, Intermediate, Advanced. Open a phase to see its topics, then any tab of a topic directly.' },
    ],
  },
  weak: {
    title: 'Weak areas',
    intro: 'Where you are losing marks, and the shortest way to fix it.',
    href: '/weak-areas',
    stops: [
      { id: 'weak-head', target: at('weak-head'), title: 'Diagnostics', text: 'Built from your latest answer to every exam question you have attempted.' },
      { id: 'weak-empty', target: at('weak-empty'), title: 'Nothing yet', text: 'This page fills in from your exam answers. Sit an exam and come back.' },
      { id: 'weak-accuracy', target: at('weak-accuracy'), title: 'Accuracy', text: 'How often your latest answers are right, by difficulty and by question format.' },
      { id: 'weak-focus', target: at('weak-focus'), title: 'Focus list', text: 'Topics with wrong answers, worst first. Revise section opens the lesson each miss most likely tests.' },
      { id: 'weak-drill', target: at('weak-drill'), title: 'Drill your mistakes', text: 'A timed run of only the questions you got wrong. Answer one right and it leaves the list.' },
    ],
  },
  practice: {
    title: 'Mistakes drill',
    intro: 'A timed quiz of the exam questions whose latest answer was wrong.',
    href: '/weak-areas',
    stops: [
      { id: 'drill-hero', target: at('drill-hero'), title: 'Nothing to drill', text: 'The drill is built from your own mistakes. With none, it points you to the next exam.' },
      { id: 'drill-explain', target: at('drill-explain'), title: 'How it works', text: 'Miss a question in any exam and it lands here; get it right and it leaves.' },
      { id: 'exam-timer', target: at('exam-timer'), title: 'Timer', text: 'Time left for this drill. It turns red in the last minute.' },
      { id: 'exam-navigator', target: at('exam-navigator'), title: 'Navigator', text: 'One square per question. Click one to jump to it.' },
      { id: 'exam-question', target: at('exam-question'), title: 'Question', text: 'The question you missed. Answer it right this time to clear it.' },
    ],
  },
  challenges: {
    title: 'Challenges',
    intro: 'Architecture interviews: design a real AI system against the clock, then compare with a model answer.',
    href: '/challenges',
    stops: [
      { id: 'ch-head', target: at('ch-head'), title: 'The final track', text: 'Twelve system design interviews that pull the whole course together.' },
      { id: 'ch-lock', target: at('ch-lock'), title: 'Locked for now', text: 'Challenges open once every topic exam is passed. The list shows what is left.' },
      { id: 'ch-remaining', target: at('ch-remaining'), title: 'What is left', text: 'The topic exams you still need to pass to open the challenges, each a link to its exam.' },
      { id: 'ch-index', target: at('ch-index'), title: 'The challenges', text: 'One card per system design question, with how often it comes up and the topics it draws on.' },
      { id: 'ws-brief', target: at('ws-brief'), title: 'The brief', text: 'The prompt as an interviewer would give it. Ask your clarifying questions before you design.' },
      { id: 'ws-timer', target: at('ws-timer'), title: 'Mock-interview timer', text: 'Run the clock as in a real interview. The length is set in Settings.' },
      { id: 'ws-stages', target: at('ws-stages'), title: 'Model answer', text: 'Requirements, estimates, design, deep dives and trade-offs, one stage at a time.' },
    ],
  },
  achievements: {
    title: 'Achievements',
    intro: 'Badges for real milestones, earned in this browser. Tiers climb from bronze to diamond.',
    href: '/achievements',
    stops: [
      { id: 'ach-next', target: at('ach-next'), title: 'Closest next', text: 'The badge you are nearest to, and exactly what is left to earn it.' },
      { id: 'ach-recent', target: at('ach-recent'), title: 'Recently earned', text: 'Your latest badges and tiers, newest first.' },
      { id: 'ach-filters', target: at('ach-filters'), title: 'Filters', text: 'Show all badges, only earned ones, or those still locked.' },
      { id: 'ach-grid', target: at('ach-grid'), title: 'Every badge', text: 'Each card shows its tiers and your progress to the next one.' },
    ],
  },
  paths: {
    title: 'Learning paths',
    intro: 'Ordered routes through the course for one kind of AI work.',
    href: '/paths',
    stops: [
      { id: 'paths-intro', target: at('paths-intro'), title: 'Learning paths', text: 'Seven routes through the course, one per kind of AI role. Following one is optional.' },
      { id: 'paths-list', target: at('paths-list'), title: 'Pick a role', text: 'Each path lists its topics in order, with how many of their exams you have passed.' },
      { id: 'path-actions', target: at('path-actions'), title: 'Follow it', text: 'Follow sets your next step on the Dashboard, Make it my plan goal paces it on Plan, and Practise opens its interview questions.' },
      { id: 'path-detail', target: at('path-detail'), title: 'The route', text: 'The path\'s topics in order, with the exams you have passed ticked.' },
      { id: 'path-practice', target: at('path-practice'), title: 'Practise for the role', text: 'Every interview question from the path, filtered by difficulty, shuffled or unanswered first.' },
      { id: 'path-scenarios', target: at('path-scenarios'), title: 'Role scenarios', text: 'Real situations from the job, answered with what the course teaches. Draft your answer, reveal the model one, rate yourself. The topic questions follow.' },
      { id: 'path-cert', target: at('path-cert'), title: 'Certificate', text: 'Pass every exam in a path to get a printable certificate. It is self-issued on your device.' },
    ],
  },
  drills: {
    title: 'Drills',
    intro: 'Build the core pieces of AI systems from scratch in TypeScript, checked by tests that run in your browser.',
    href: '/drills',
    stops: [
      { id: 'drills-intro', target: at('drills-intro'), title: 'From scratch', text: 'Small, graded coding exercises. The tests run in your browser in an isolated worker and stop after 3 seconds.' },
      { id: 'drills-list', target: at('drills-list'), title: 'The drills', text: 'Each drill is one small function, like BM25 or a BPE merge step, linked to the topic that teaches it.' },
      { id: 'drill-problem', target: at('drill-problem'), title: 'The problem', text: 'What to build, with the inputs, outputs and an example.' },
      { id: 'drill-work', target: at('drill-work'), title: 'Your code', text: 'Write it here and press Run tests (or Ctrl/⌘ + Enter). Your draft is saved as you type.' },
      { id: 'drill-results', target: at('drill-results'), title: 'Results', text: 'Every test with a reason when it fails. Hints open one at a time; the solution appears when all pass.' },
    ],
  },
  glossary: {
    title: 'Glossary',
    intro: 'Plain definitions of the terms the course uses, plus common myths and what is actually true.',
    href: '/glossary',
    stops: [
      { id: 'gl-tabs', target: at('gl-tabs'), title: 'Terms and myths', text: 'Switch between the glossary and the myths list.' },
      { id: 'gl-search', target: at('gl-search'), title: 'Search', text: 'Find a term by its name or any of its aliases.' },
      { id: 'gl-az', target: at('gl-az'), title: 'A to Z', text: 'Jump straight to a letter.' },
      { id: 'gl-list', target: at('gl-list'), title: 'Definitions', text: 'Open a term for the full explanation, related terms, and the topic that teaches it.' },
    ],
  },
};

export const GUIDE_ORDER: GuideId[] = ['today', 'track', 'topic', 'exam', 'saved', 'shorts', 'plan', 'settings', 'syllabus', 'weak', 'practice', 'challenges', 'achievements', 'paths', 'drills', 'glossary'];

/** The guide for a route, or null where there is none (only the Short player: it shows its own keys; "?" then opens the welcome tour). */
export function guideIdFor(pathname: string): GuideId | null {
  if (pathname === '/' || pathname === '') return 'today';
  if (pathname === '/track') return 'track';
  if (/^\/topic\/[^/]+\/exam\/?$/.test(pathname)) return 'exam';
  if (/^\/topic\/[^/]+\/?$/.test(pathname)) return 'topic';
  if (pathname === '/saved') return 'saved';
  if (pathname === '/shorts') return 'shorts';
  if (pathname === '/plan') return 'plan';
  if (pathname === '/settings') return 'settings';
  if (pathname === '/contents') return 'syllabus';
  if (pathname === '/weak-areas') return 'weak';
  if (pathname === '/practice') return 'practice';
  if (/^\/challenges(\/|$)/.test(pathname)) return 'challenges';
  if (pathname === '/achievements') return 'achievements';
  if (/^\/paths(\/|$)/.test(pathname)) return 'paths';
  if (/^\/drills(\/|$)/.test(pathname)) return 'drills';
  if (pathname === '/glossary') return 'glossary';
  return null;
}

/** First visit to a page with a guide: offer it once, after the welcome tour has been seen. */
export function shouldOffer(id: GuideId | null, prefs: { tourSeen?: boolean; guidesSeen?: Record<string, true> }): id is GuideId {
  return !!id && !!prefs.tourSeen && !prefs.guidesSeen?.[id];
}
