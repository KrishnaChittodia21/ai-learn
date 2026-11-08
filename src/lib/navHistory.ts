// Where the learner came from, for "← Back to …" labels. Layout calls trackPage on every route change.
// Pure apart from two module variables, so it is testable in node.

let current: string | null = null;
let previous: string | null = null;

/** Record a route change (pathname only). Repeats of the same path are ignored. */
export function trackPage(path: string) {
  if (path === current) return;
  previous = current;
  current = path;
}

/** The page the learner came from to reach `here`. Lazy pages mount after Layout has already recorded them, so
 *  when the latest entry is `here` itself the one before it is the origin. */
export const cameFrom = (here: string) => (current === here ? previous : current);

const PAGES: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/track$/, 'Track'],
  [/^\/contents$/, 'Syllabus'],
  [/^\/shorts?(\/|$)/, 'Shorts'],
  [/^\/plan$/, 'Plan'],
  [/^\/weak-areas$/, 'Weak areas'],
  [/^\/practice$/, 'Mistakes drill'],
  [/^\/challenges(\/|$)/, 'Challenges'],
  [/^\/achievements$/, 'Achievements'],
  [/^\/saved$/, 'Saved'],
  [/^\/paths(\/|$)/, 'Learning paths'],
  [/^\/drills(\/|$)/, 'Drills'],
  [/^\/glossary$/, 'Glossary'],
  [/^\/settings$/, 'Settings'],
];

/** A readable name for a route: "Syllabus", "Dashboard", a topic's title (or "… exam"); null when unknown. */
export function pageLabel(path: string, topicTitle: (id: string) => string | undefined): string | null {
  const topic = /^\/topic\/([^/]+)(\/exam)?\/?$/.exec(path);
  if (topic) {
    const title = topicTitle(topic[1])?.split(': ')[0];
    return title ? (topic[2] ? `${title} exam` : title) : null;
  }
  return PAGES.find(([re]) => re.test(path))?.[1] ?? null;
}
