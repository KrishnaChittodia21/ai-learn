// Content contract for every topic file in src/content/topics/*.ts
// Markdown fields support GitHub-flavored markdown (tables, lists, bold, inline code).
// Do NOT put fenced code blocks inside markdown — use the `code` arrays instead.

export type PhaseId =
  | 'foundations'
  | 'prompting'
  | 'embeddings'
  | 'ingestion'
  | 'vector-search'
  | 'retrieval'
  | 'rag'
  | 'evaluation'
  | 'agents'
  | 'frameworks'
  | 'models'
  | 'multimodal'
  | 'security'
  | 'llmops'
  | 'internals'
  | 'architecture'
  // kept so shared UI code type-checks; no GenAI topic uses them
  | 'miscellaneous'
  | 'behavioral';

/** Learning journey tier a phase belongs to. */
export type Level = 'beginner' | 'intermediate' | 'advanced';

export type Difficulty = 'medium' | 'hard' | 'expert';

export interface CodeSnippet {
  /** prism language id: typescript | javascript | sql | bash | yaml | json | lua | python | go | java | graphql | protobuf | nginx | text */
  language: string;
  title?: string;
  code: string;
}

export interface Section {
  heading: string;
  /** markdown */
  body: string;
  code?: CodeSnippet[];
  /** optional ASCII diagram rendered in monospace */
  diagram?: string;
  keyPoints?: string[];
  /** e.g. "Anthropic docs — Prompt caching" or "Lewis et al. 2020 — RAG paper" */
  source?: string;
  /** markdown: a concrete, real-world worked example of the idea (numbers, inputs → outputs) */
  example?: string;
  /** strengths, and each weakness paired with how to overcome it */
  prosCons?: ProsCons;
  /** hands-on coding question for this section ("Try it") */
  exercise?: SectionExercise;
  /** one quick single-answer check shown at the end of the section */
  quickCheck?: QuickCheck;
  /** optional ~90-second animated story of this section (Shorts, M5; checked by src/lib/shorts.ts checkShort) */
  short?: Short;
  /** "Read less" (M7): the section's core in ≤180 words (markdown, checked by npm run validate). When set, the
   *  Read view shows it first and folds `body`, the example, pros/cons and code into Learn more expanders. */
  core?: string;
  /** "View more" (M7): the section as small animated steps, shown when the reader picks Steps over Read */
  steps?: StepLesson;
}

// ---------- Step lessons (M7): played by src/components/steps/StepLesson.tsx, checked by src/lib/steps.ts ----------
/** the AI pipeline parts a step diagram is built from (each has its own icon and colour) */
export const ACTOR_KINDS = [
  'user', 'document', 'chunker', 'embedder', 'vector-db', 'retriever', 'reranker', 'llm', 'tool', 'agent', 'judge',
  // general parts for topics outside the RAG/agent pipeline (serving, ops, safety, training)
  'server', 'cache', 'guard', 'data', 'metric',
] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];
export type StepTone = 'req' | 'ok' | 'miss' | 'err';

export interface StepActor {
  id: string;
  kind: ActorKind;
  label: string;
  sub?: string;
  /** centre, in the 900×300 stage */
  x: number;
  y: number;
  /** starts hidden; a `show` action brings it in */
  hidden?: boolean;
}

/** One move on the stage. A Watch step plays a list of these, looping like a GIF. */
export type StepAction =
  /** light up explanation line n (0-based); earlier lines turn "done" */
  | { say: number }
  /** a packet travels between two actors; `curve` arcs over the middle, `count` sends several staggered */
  | { send: [from: string, to: string]; label?: string; tone?: StepTone; curve?: boolean; count?: number }
  /** a pill above an actor for a moment */
  | { badge: string; text: string; tone?: StepTone; ms?: number }
  | { lit: string; on?: boolean }
  /** an actor goes grey (switched off) */
  | { down: string; on?: boolean }
  | { show: string; on?: boolean }
  | { wait: number };

/** A Your-turn task. Every task has buttons, so it works without the diagram (keyboard, screen readers, phones). */
export type StepTask =
  /** click an actor on the diagram (or its button); `hints` holds a hint per wrong actor */
  | { type: 'pick'; question: string; answer: string; hints: Record<string, string> }
  /** one of a few options; `why` explains a wrong pick */
  | { type: 'choose'; question: string; options: { text: string; why?: string }[]; answer: number }
  /** tap the items in the right order (`items` is the right order; they are shown shuffled) */
  | { type: 'order'; question: string; items: string[]; hint: string };

interface StepBase {
  title: string;
  /** the explanation beside the diagram, one idea per line (**bold** and `code` allowed) */
  lines: string[];
}

export type Step =
  | (StepBase & { kind: 'watch'; script: StepAction[] })
  /** `then` plays (looping) once the task is solved; `solved` is the one-line takeaway */
  | (StepBase & { kind: 'turn'; task: StepTask; solved: string; setup?: StepAction[]; then?: StepAction[] });

export interface StepLesson {
  actors: StepActor[];
  steps: Step[];
}

// ---------- Shorts (M5): beats played one at a time by src/components/ShortPlayer.tsx ----------
// Text fields are plain text with two marks: *gradient words* in `head`, **bold** in `sub`.

export interface ShortStat {
  /** a number counts up from 0; a string ("CA$812") is shown as is */
  value: number | string;
  label: string;
}

interface BeatBase {
  /** small caps line above the headline, e.g. "Feb 2023 · Bing Chat" */
  kicker: string;
  head?: string;
  sub?: string;
  stats?: ShortStat[];
  /** override the reading time the player works out from the words */
  seconds?: number;
}

export type ShortTone = 'violet' | 'pink' | 'ion' | 'solar' | 'good';

export type ShortBeat =
  | (BeatBase & { type: 'counter'; value: number; decimals?: number; prefix?: string; suffix?: string; unit: string })
  /** a curve that climbs, with a label at the jump */
  | (BeatBase & { type: 'spike'; head: string; mark: string })
  /** lanes filling at different speeds (`seconds` to fill, starting `after` seconds in) */
  | (BeatBase & { type: 'race'; head: string; lanes: { label: string; seconds: number; after?: number; tone: ShortTone }[] })
  /** `cells` squares; the first `hot` light up pink */
  | (BeatBase & { type: 'grid'; head: string; cells: number; hot?: number; caption: string })
  | (BeatBase & { type: 'ladder'; head: string; rungs: { label: string; amount: number }[]; unit: string })
  /** switches turning off one by one; `keep` ones stay on */
  | (BeatBase & { type: 'toggles'; head: string; items: { label: string; keep?: boolean }[]; keepLabel?: string })
  /** numbered steps; `broken` marks the step where it goes wrong */
  | (BeatBase & { type: 'flow'; head: string; steps: string[]; broken?: number })
  | (BeatBase & { type: 'quiz'; head: string; options: { text: string; why: string }[]; answer: number })
  /** next-token candidates for `prompt`; the most likely one is appended */
  | (BeatBase & { type: 'tokens'; head: string; prompt: string; picks: { token: string; p: number }[] })
  /** a query, chunks with similarity scores, and the top `k` that go to the model */
  | (BeatBase & { type: 'retrieve'; head: string; query: string; chunks: { text: string; score: number }[]; k: number })
  /** an answer split into claims, each checked against the source */
  | (BeatBase & { type: 'claims'; head: string; claims: { text: string; ok: boolean; note?: string }[] });

export type ShortBeatType = ShortBeat['type'];

export interface Short {
  /** unique across the course, kebab-case (it is the URL: #/short/<id>) */
  id: string;
  title: string;
  beats: ShortBeat[];
  /** the end card: the one idea to keep */
  takeaway: { head: string; sub: string };
}

export interface ProsCons {
  pros: string[];
  /** every con carries the technique that mitigates it */
  cons: { con: string; fix: string }[];
}

export interface SectionExercise {
  /** markdown: what to build or fix */
  prompt: string;
  /** editable starting code (omit to start from a blank editor) */
  starter?: CodeSnippet;
  hints: string[];
  solution: CodeSnippet;
  /** markdown: why the solution works */
  explanation?: string;
}

export interface QuickCheck {
  question: string;
  options: string[];
  /** index into options */
  correct: number;
  explanation: string;
}

/** "Improve this code" exercise: naive/buggy starter → production-grade solution */
export interface CodeChallenge {
  id: string;
  title: string;
  context: string;
  task: string;
  starter: CodeSnippet;
  hints: string[];
  solution: CodeSnippet;
  /** markdown: why the solution is better */
  explanation: string;
  /** what the interviewer asks after you present the solution */
  followUps?: FollowUp[];
}

export interface FollowUp {
  q: string;
  a: string;
}

// ---------- Prompt Lab: write a prompt, get an offline, deterministic structural score ----------
// Grading lives in src/lib/promptChecks.ts (pure; also used by scripts/validate-content.mjs and
// tests/prompt-checks.test.ts). Every check is data: a kind, a weight (all weights sum to 100),
// a short label and a `why` line that teaches the principle behind it.

/** Which part of the prompt a text check looks at. 'either' = system + user together (the default). */
export type PromptPart = 'system' | 'user' | 'either';

/** Fields every check carries. */
interface PromptCheckBase {
  /** points this check is worth; a lab's weights sum to 100 */
  weight: number;
  /** short imperative label, e.g. "Customer text stays out of the system prompt" */
  label: string;
  /** one line on why it matters (shown under the label) */
  why: string;
}

/**
 * Offline checks (see src/lib/promptChecks.ts for the exact semantics). Text matching is always
 * case-insensitive, whitespace-collapsed and literal (never a regex). Template variables are
 * written `{{name}}` (inner spaces allowed).
 */
export type PromptCheck = PromptCheckBase &
  (
    | { kind: 'has-system'; /** default 8 */ minWords?: number }
    | {
        kind: 'delimits';
        /** variable name without braces */
        variable: string;
        /** allowed wrapper tag names; default: any XML-style tag except example/examples */
        tags?: string[];
      }
    | { kind: 'includes'; anyOf: string[]; where?: PromptPart }
    | { kind: 'excludes'; anyOf: string[]; where?: PromptPart }
    | {
        kind: 'includes-all';
        /** every entry must appear in `where`; an entry that is an array passes if ANY of its alternatives appears */
        allOf: (string | string[])[];
        where?: PromptPart;
      }
    | { kind: 'examples'; min: number; max?: number }
    | { kind: 'schema'; requireKeys: string[] }
    | { kind: 'no-input-in-system'; variables: string[] }
    | { kind: 'max-words'; limit: number; where?: PromptPart }
  );

export type PromptCheckKind = PromptCheck['kind'];

export interface PromptDraft {
  system?: string;
  user: string;
}

/** "Fix this prompt" lab: weak starter prompt → learner rewrite, graded offline as you type. */
export interface PromptLab {
  id: string;
  title: string;
  /** markdown: the product situation */
  scenario: string;
  /** markdown: what to write or fix */
  task: string;
  /** the weak prompt the learner starts from */
  starter: PromptDraft;
  /** what the weak prompt produced (rendered monospace) */
  sampleBadOutput?: string;
  checks: PromptCheck[];
  /** score (0–100) that counts as solved; default 80 */
  passScore?: number;
  /** a reference prompt that scores 100, with markdown `why` */
  modelAnswer: PromptDraft & { why: string };
  hints: string[];
  followUps: FollowUp[];
}

export interface InterviewQuestion {
  id: string;
  difficulty: Difficulty;
  question: string;
  /** optional scenario framing the interviewer gives */
  context?: string;
  whatInterviewerLooksFor: string[];
  /** markdown */
  modelAnswer: string;
  followUps: FollowUp[];
  pitfalls: string[];
}

export interface EnvelopeStep {
  label: string;
  calc: string;
}

export interface EnvelopeQuestion {
  id: string;
  question: string;
  assumptions: string[];
  steps: EnvelopeStep[];
  answer: string;
  /** the design implication the numbers reveal */
  insight: string;
  /** "now what if…" probes on the estimate */
  followUps?: FollowUp[];
}

export interface MCQ {
  id: string;
  difficulty: Difficulty;
  question: string;
  code?: CodeSnippet;
  options: string[];
  /** indexes into options; more than one => "select all that apply" */
  correct: number[];
  explanation: string;
  /** what the interviewer asks next once you have answered */
  followUps?: FollowUp[];
}

export interface Topic {
  id: string;
  phase: PhaseId;
  /** ordering within the phase, 1-based */
  order: number;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  sources: string[];
  tags: string[];
  /** 6–10 crisp bullets for last-minute revision */
  cheatSheet: string[];
  sections: Section[];
  codeChallenges: CodeChallenge[];
  /** optional "write the prompt" labs, graded offline (Prompt Lab tab) */
  promptLabs?: PromptLab[];
  interviewQuestions: InterviewQuestion[];
  envelopeQuestions: EnvelopeQuestion[];
  test: MCQ[];
}

/**
 * What the startup bundle knows about a topic: src/content/topicIndex.gen.ts, built from the topic files by
 * scripts/gen-topic-index.mjs. A full Topic satisfies it, so code that only needs this takes TopicMeta and
 * works with both; the body loads with loadTopic / useTopic. Flags are `true` in the index, the object in a Topic.
 */
export interface SectionMeta {
  heading: string;
  short?: Short;
  exercise?: true | SectionExercise;
  steps?: true | StepLesson;
  quickCheck?: Pick<QuickCheck, 'correct'>;
}

export interface MCQMeta extends Pick<MCQ, 'id' | 'difficulty' | 'correct'> {
  code?: true | CodeSnippet;
  /** index only: the Learn section the question most likely tests (src/lib/weak.ts sectionForQuestion) */
  section?: number;
}

export interface TopicMeta extends Pick<Topic, 'id' | 'phase' | 'order' | 'title' | 'subtitle' | 'estimatedMinutes' | 'tags'> {
  sections: SectionMeta[];
  codeChallenges: Pick<CodeChallenge, 'id' | 'title'>[];
  promptLabs?: Pick<PromptLab, 'id' | 'title'>[];
  interviewQuestions: Pick<InterviewQuestion, 'id' | 'difficulty' | 'question'>[];
  envelopeQuestions: Pick<EnvelopeQuestion, 'id' | 'question'>[];
  test: MCQMeta[];
}

// ---------- Architecture challenge track (stored as "company" questions for UI reuse) ----------

export interface DeepDive {
  topic: string;
  /** markdown */
  discussion: string;
}

export interface CompanyQuestion {
  id: string;
  company: string;
  title: string;
  frequency: 'very-high' | 'high' | 'medium';
  level: string;
  prompt: string;
  clarifyingQuestions: string[];
  functional: string[];
  nonFunctional: string[];
  estimation: EnvelopeStep[];
  /** markdown */
  highLevelDesign: string;
  diagram?: string;
  deepDives: DeepDive[];
  tradeoffs: string[];
  followUps: FollowUp[];
  /** topic ids from src/content/topics */
  relatedTopics: string[];
}

export interface Company {
  id: string;
  name: string;
  focus: string;
  interviewStyle: string;
}

// ---------- Capstone build projects (projects/<id>/project.json) ----------

export interface CapstoneMilestone {
  name: string;
  /** markdown */
  description: string;
}

export interface CapstoneProject {
  id: string;
  title: string;
  /** topic ids whose Capstone tab shows this project */
  topics: string[];
  difficulty: Difficulty;
  estimatedHours: number;
  /** markdown: what you build and why it matters in interviews */
  summary: string;
  milestones: CapstoneMilestone[];
  /** files the learner edits, relative to the project folder */
  files: string[];
}
