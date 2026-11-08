// Guide Me (M3): one spotlight guide per page. Pure data, so tests can check every stop against the markup.
// Every stop targets a `[data-guide="…"]` attribute; the walkthrough skips stops not on screen (a locked tab,
// the setup screen vs the running exam, a phone layout).
// Adding a page later: add its id to GuideId, an entry to GUIDES and GUIDE_ORDER,
// a match in guideIdFor, and its source files in tests/guides.test.ts.

export type GuideId = 'today' | 'topic' | 'exam' | 'saved' | 'shorts' | 'plan' | 'settings';

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
    title: 'Today',
    intro: 'Your launch pad: what to study next, how much of the map glows, and how steady your week has been.',
    href: '/',
    stops: [
      { id: 'coverage', target: at('coverage'), title: 'Neural coverage', text: 'Every topic is a node. It glows ion when you pass its exam and pulses pink while you are in it. The ring marks your next topic.' },
      { id: 'mission', target: at('mission'), title: 'Next mission', text: 'The one thing to do next, picked from where you stopped. Resume jumps straight to it.' },
      { id: 'short-of-the-day', target: at('short-of-the-day'), title: 'Short of the day', text: 'One idea, animated, in about a minute. Always open, and a new one unlocks on each day you study.' },
      { id: 'activity', target: at('activity'), title: 'Streak and activity', text: 'Any section, lab or exam on a day keeps the flame going. The recent weeks are drawn here.' },
      { id: 'achievements', target: at('achievements'), title: 'Achievements', text: 'Badges for real milestones, earned in this browser. The bar shows the closest one.' },
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
      { id: 'shorts-unlock', target: at('shorts-unlock'), title: 'Daily unlock', text: 'One more Short opens on each day you study anything, counted in this browser.' },
      { id: 'shorts-filters', target: at('shorts-filters'), title: 'Filters', text: 'Show what is unwatched, watched, saved or still locked.' },
      { id: 'shorts-grid', target: at('shorts-grid'), title: 'By phase', text: 'Shorts sit with the phase of their lesson. In the player: ← → move, Space or hold pauses, the speed button reads slower or faster.' },
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
      { id: 'settings-appearance', target: at('settings-appearance'), title: 'Appearance', text: 'Light, dark or system theme, and the signal colour for buttons and links.' },
      { id: 'settings-guide', target: at('settings-guide'), title: 'Guide', text: 'Coach tips on each tab, and the full welcome tour.' },
      { id: 'export', target: at('export'), title: 'Export', text: 'Download a backup file. It is the only copy outside this browser, and the way to move to another device.' },
      { id: 'import', target: at('import'), title: 'Import', text: 'Load a backup. You see what is in it first, then merge it or replace this browser’s data.' },
      { id: 'settings-reset', target: at('settings-reset'), title: 'Reset', text: 'Clears progress after a confirmation. Settings stay.' },
    ],
  },
};

export const GUIDE_ORDER: GuideId[] = ['today', 'topic', 'exam', 'saved', 'shorts', 'plan', 'settings'];

/** The guide for a route, or null where there is none (the "?" then opens the welcome tour). */
export function guideIdFor(pathname: string): GuideId | null {
  if (pathname === '/' || pathname === '') return 'today';
  if (/^\/topic\/[^/]+\/exam\/?$/.test(pathname)) return 'exam';
  if (/^\/topic\/[^/]+\/?$/.test(pathname)) return 'topic';
  if (pathname === '/saved') return 'saved';
  if (pathname === '/shorts') return 'shorts';
  if (pathname === '/plan') return 'plan';
  if (pathname === '/settings') return 'settings';
  return null;
}

/** First visit to a page with a guide: offer it once, after the welcome tour has been seen. */
export function shouldOffer(id: GuideId | null, prefs: { tourSeen?: boolean; guidesSeen?: Record<string, true> }): id is GuideId {
  return !!id && !!prefs.tourSeen && !prefs.guidesSeen?.[id];
}
