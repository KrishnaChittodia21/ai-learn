import type { Company, CompanyQuestion, Topic, TopicMeta } from '../types';
import { topicLoader } from '../lib/topicLoader';
import { LEVELS, PHASES } from './phases';
import { TOPIC_INDEX } from './topicIndex.gen';

/** every topic's index entry, in course order (phase, then order); bodies load with loadTopic */
export const TOPICS: TopicMeta[] = TOPIC_INDEX;

export const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

/** exam question id → owning topic */
export const MCQ_TOPIC = new Map(TOPICS.flatMap((t) => t.test.map((q) => [q.id, t] as const)));

// one lazy chunk per topic file (named topic-<id> in vite.config.ts)
const topicModules = import.meta.glob<{ default: Topic }>('./topics/*.ts');
export const { load: loadTopic, peek: loadedTopic } = topicLoader(
  Object.fromEntries(Object.entries(topicModules).map(([path, load]) => [path.replace(/^.*\/|\.ts$/g, ''), load])),
);

// companies.ts may be absent while content is being authored
const companyModules = import.meta.glob<{ COMPANIES: Company[]; COMPANY_QUESTIONS: CompanyQuestion[] }>(
  './companies.ts',
  { eager: true },
);
const companyModule = Object.values(companyModules)[0];

export const COMPANIES: Company[] = companyModule?.COMPANIES ?? [];
export const COMPANY_QUESTIONS: CompanyQuestion[] = companyModule?.COMPANY_QUESTIONS ?? [];

/** topic id → its level (beginner / intermediate / advanced) */
export const LEVEL_OF_TOPIC = new Map(TOPICS.map((t) => [t.id, PHASES.find((ph) => ph.id === t.phase)?.level]));

export { PHASES, LEVELS };
