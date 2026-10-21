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
// scripts/test-prompt-checks.mjs). Every check is data: a kind, a weight (all weights sum to 100),
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
