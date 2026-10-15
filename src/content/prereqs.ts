// "Learn this first" links from question-bank sections to in-depth lessons. The GenAI app has no
// question-bank phase, so this map is empty; the Topic page renders nothing for unmapped sections.
export interface PrereqLink {
  topic: string;
  section: number;
}

export const PREREQS: Record<string, Record<string, PrereqLink[]>> = {};
