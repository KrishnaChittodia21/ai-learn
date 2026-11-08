import type { Topic } from '../../types';

// Adapted (rewritten, not copied) from ai-engineering-from-scratch, Phase 14 lessons 31–41 and Phase 15 lesson 10
// (MIT, © 2026 Rohit Ghumare, github.com/rohitg00/ai-engineering-from-scratch).

const topic: Topic = {
  id: 'coding-agents',
  phase: 'frameworks',
  order: 8,
  title: 'Working with Coding Agents',
  subtitle: 'Repo memory, rules with checks, scope contracts, verification gates, a reviewer, clean handoffs and the right permission mode: the workbench that makes a coding agent reliable.',
  estimatedMinutes: 50,
  sources: [
    'Anthropic, Claude Code docs: Memory (CLAUDE.md files, /init), Settings and permissions (allow / ask / deny rules), Permission modes, Hooks, Subagents',
    'Anthropic Engineering, Claude Code best practices for agentic coding (2025)',
    'AGENTS.md, an open format for guiding coding agents (agents.md)',
    'ai-engineering-from-scratch (MIT, © 2026 Rohit Ghumare), Phase 14 lessons 31–41 (agent workbench: instructions as constraints, repo memory, scope contracts, runtime feedback, verification gates, reviewer agent, multi-session handoff) and Phase 15 lesson 10 (permission modes). github.com/rohitg00/ai-engineering-from-scratch',
  ],
  tags: ['coding-agents', 'claude-code', 'claude-md', 'agents-md', 'verification', 'permissions', 'handoff', 'workbench'],
  cheatSheet: [
    'Most coding-agent failures are workbench failures: missing rules, state, scope, feedback, verification, review or handoff, not a weak model.',
    'Repo instruction file (CLAUDE.md, AGENTS.md) = a short router loaded every session: what the repo is, the commands, the hard rules, and links to deeper docs.',
    'Durable state lives in files (task, touched files, assumptions, blockers, next action), not in the chat, which scrolls away.',
    'Write rules you can check: startup, forbidden, definition of done, what to do when unsure, what needs approval. Each rule names its check.',
    'Scope contract per task: goal, allowed globs, forbidden globs, acceptance commands, rollback, approvals. Forbidden files are half the contract.',
    'One feature in progress at a time, read from a file, not promised in a prompt.',
    'Verification gate = deterministic: acceptance commands ran and exited 0, no forbidden writes, rules pass. A missing exit code is a failure, never a pass.',
    'Reviewer = a separate role with read-only access and a rubric (problem fit, scope, assumptions, verification quality, handoff). It reports; it does not patch.',
    'Handoff: summary, changed files, commands run, failed attempts, open risks, next action, pointer to reports. next_action is the field that matters most.',
    'Permission modes are a ladder: plan (read and propose) → default (ask) → acceptEdits (edits auto-approved) → bypassPermissions (only in a disposable sandbox). Deny rules and hooks enforce limits in every mode.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Repo memory: CLAUDE.md, AGENTS.md and a state file',
      steps: {
        actors: [
          { id: 'agent', kind: 'agent', label: 'Coding agent', sub: 'blank each session', x: 110, y: 70 },
          { id: 'router', kind: 'document', label: 'CLAUDE.md', sub: 'router, every session', x: 340, y: 70 },
          { id: 'rules', kind: 'document', label: 'agent-rules.md', sub: 'read at startup', x: 570, y: 70 },
          { id: 'topic', kind: 'document', label: 'docs/testing.md', sub: 'only when touched', x: 800, y: 70 },
          { id: 'state', kind: 'data', label: 'agent_state.json', sub: 'where work stands', x: 340, y: 230 },
          { id: 'chat', kind: 'data', label: 'Chat transcript', sub: 'leave it out', x: 570, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Every session starts blank',
            lines: [
              'The agent guesses the test command, the package manager, the generated folders, differently each time.',
              '**Repo memory** answers those questions before the first turn.',
            ],
            script: [
              { say: 0 },
              { badge: 'agent', text: 'npm? pnpm?', tone: 'miss', ms: 1100 },
              { say: 1 },
              { send: ['router', 'agent'], label: 'commands + rules', tone: 'ok' },
            ],
          },
          {
            kind: 'watch',
            title: 'A router, not an encyclopedia',
            lines: [
              'Keep the root file short (a screen or two) and **link out**.',
              'Rules load at startup; topic docs only when the task touches them.',
              'Any rule should be reachable in **two hops**.',
            ],
            script: [
              { say: 0 },
              { lit: 'router' },
              { say: 1 },
              { send: ['router', 'rules'], label: 'startup' },
              { send: ['router', 'topic'], label: 'task touches tests', curve: true },
              { say: 2 },
              { badge: 'topic', text: 'two hops', tone: 'ok', ms: 1000 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: what goes in the router?',
            lines: ['Every incident tends to add a rule and none removes one.'],
            task: {
              type: 'choose',
              question: 'What belongs in the root CLAUDE.md / AGENTS.md?',
              options: [
                { text: 'What the repo is, the exact build/test/lint/type-check commands, hard rules and links to deeper docs' },
                { text: 'Every rule ever added after an incident', why: 'That is how the file grows to 2,000 lines and the agent acts on a fraction of it.' },
                { text: 'The full architecture write-up', why: 'Deep topics go in linked docs, read only when the task touches them.' },
              ],
              answer: 0,
            },
            solved: 'The router stays short: what the repo is, exact commands, hard rules, links by path.',
          },
          {
            kind: 'watch',
            title: 'Rules vs state',
            lines: [
              'Instructions are standing rules; **state** is where this piece of work stands.',
              'Keep task id, touched files, assumptions, open blockers, next action.',
              'Write it atomically (temp file, then rename) and reject writes that fail the schema.',
            ],
            script: [
              { say: 0 },
              { send: ['agent', 'state'], label: 'progress', curve: true },
              { say: 1 },
              { badge: 'state', text: 'next action', ms: 1000 },
              { say: 2 },
              { badge: 'state', text: 'schema ok', tone: 'ok', ms: 1000 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: what goes in state?',
            lines: ['Test: would this be useful in three months when someone re-runs the task?'],
            task: {
              type: 'choose',
              question: 'Which belongs in `agent_state.json`?',
              options: [
                { text: 'Open blockers' },
                { text: 'The chat transcript', why: 'Transcripts stay out; the repo, not the chat, is the system of record.' },
                { text: 'Reasoning traces', why: 'Reasoning traces stay out of state.' },
                { text: '"The user seemed annoyed"', why: 'Not useful in three months; leave it out.' },
              ],
              answer: 0,
            },
            solved: 'State holds task id, touched files, assumptions, blockers and next action; not chat or reasoning.',
            then: [{ down: 'chat' }, { send: ['agent', 'state'], label: 'blockers', tone: 'ok', curve: true }],
          },
        ],
      },
      body: `A coding agent starts every session knowing nothing about your repo. It will guess the test command, the package manager and which folders are generated, and it will guess differently each time. **Repo memory** is the set of files that answer those questions before the first turn.

**The instruction file.** Claude Code loads \`CLAUDE.md\` from the project at the start of a session (and a personal one from \`~/.claude/CLAUDE.md\`); \`/init\` drafts a first version from the codebase. Many other agents read \`AGENTS.md\`, an open convention. Tools differ in which name they read, so teams often keep one file as the source and point the other at it.

**Make it a router, not an encyclopedia.** Every incident tends to add a rule and none removes one; a year later the file is 2,000 lines and the agent acts on a fraction of it. Keep the root file short (aim for a screen or two) and link out:

| Tier | File | Read |
|---|---|---|
| router | \`CLAUDE.md\` / \`AGENTS.md\` | every session |
| rules | \`docs/agent-rules.md\` | at startup |
| topic docs | \`docs/testing.md\`, \`docs/architecture.md\` | only when the task touches them |

A good router holds: one line on what the repo is, the exact build, test, lint and type-check commands, the hard rules (never edit \`src/generated/\`, never add a dependency without asking), and links by path to the deeper docs. Any rule should be reachable in two hops.

**The state file.** Instructions are standing rules; **state** is where this piece of work stands. Keep it in a small, schema-checked file such as \`agent_state.json\`:

| Keep in state | Leave out |
|---|---|
| active task id, touched files | chat transcripts |
| assumptions made | reasoning traces |
| open blockers | model ids, sampled completions |
| next action | "the user seemed annoyed" |

The test: would this be useful in three months when someone re-runs the task? Write it atomically (temp file then rename) so a crash never leaves a half-written file, and reject writes that fail the schema. The repo, not the chat, is the system of record.`,
      code: [
        {
          language: 'text',
          title: 'CLAUDE.md (router, ~25 lines)',
          code: `# shop-api
TypeScript + Fastify service. Node 22, pnpm.

## Commands
- install: pnpm install
- test: pnpm test        (must pass before you say "done")
- types: pnpm tsc --noEmit
- lint: pnpm lint

## Hard rules
- Never edit src/generated/** (run pnpm codegen instead).
- Never add a dependency without asking.
- Database migrations need human approval.

## Read when relevant
- Tests and fixtures: docs/testing.md
- Module boundaries: docs/architecture.md
- Releases: docs/release.md (approval required)`,
        },
      ],
      example: `**Before:** no instruction file. In one week an agent ran \`npm install\` (creating a second lockfile), edited \`src/generated/client.ts\` by hand twice (overwritten on the next codegen), and called tasks "done" after \`pnpm build\`, which does not run tests.

**After:** a 25-line \`CLAUDE.md\` with the commands, three hard rules and three links, plus \`agent_state.json\`. Next week: 0 stray lockfiles, 0 edits to generated code, and every "done" message quoted the \`pnpm test\` result. The file costs about 300 tokens per session; the old habit of pasting a 4,000-word onboarding doc cost thirteen times that and was still ignored past the first screen.`,
      prosCons: {
        pros: [
          'The agent stops guessing commands and conventions at the start of every session.',
          'A short router is read in full every time and is cheap to keep in context.',
          'A state file lets work survive a crashed session, a new model or a different agent.',
        ],
        cons: [
          { con: 'Instruction files grow until they are ignored.', fix: 'Keep the root as a router with links, move depth into topic docs, and review its length on every PR that edits it.' },
          { con: 'Rules go stale and contradict the code.', fix: 'Delete outdated rules rather than commenting them out, and add a startup check that every linked path still exists.' },
          { con: 'Free-form state files drift into many shapes.', fix: 'Give the state file a JSON schema with a version field, reject invalid writes, and ship a migration when the schema changes.' },
        ],
      },
      keyPoints: [
        'CLAUDE.md / AGENTS.md: a short router loaded every session.',
        'Exact commands and hard rules first, links to depth after.',
        'State (task, assumptions, blockers, next action) lives in a file.',
        'The repo is the system of record, not the chat.',
      ],
      exercise: {
        prompt: `Write \`checkRouter(text, exists)\` that audits a repo instruction file and returns a list of problems:

- more than 80 lines → "too long";
- no line mentioning a test command (contains "test") → "no test command";
- every Markdown path like \`docs/x.md\` (match \`/\\b[\\w./-]+\\.md\\b/g\`) must satisfy \`exists(path)\`; otherwise "broken link: <path>".`,
        starter: {
          language: 'typescript',
          code: `export function checkRouter(text: string, exists: (p: string) => boolean): string[] {
  const problems: string[] = [];
  // TODO
  return problems;
}`,
        },
        hints: [
          'Split on newlines for the line count.',
          'Use a Set over the regex matches so a path linked twice is reported once.',
        ],
        solution: {
          language: 'typescript',
          code: `export function checkRouter(text: string, exists: (p: string) => boolean): string[] {
  const problems: string[] = [];
  const lines = text.split(/\\r?\\n/);
  if (lines.length > 80) problems.push('too long: ' + lines.length + ' lines');
  if (!lines.some((l) => /test/i.test(l))) problems.push('no test command');
  for (const p of new Set(text.match(/\\b[\\w./-]+\\.md\\b/g) ?? [])) {
    if (!exists(p)) problems.push('broken link: ' + p);
  }
  return problems;
}`,
        },
        explanation: 'A broken link in the router is worse than a missing rule: the agent is told the rule exists but can never read it. Running this check in CI (or at session start) keeps the router honest, and the line limit stops it from growing back into an encyclopedia.',
      },
      quickCheck: {
        question: 'Which item belongs in the agent\'s state file rather than in CLAUDE.md?',
        options: [
          'The command that runs the tests',
          '"Never edit src/generated/**"',
          'The next action for the task currently in progress',
          'A link to docs/architecture.md',
        ],
        correct: 2,
        explanation: 'CLAUDE.md holds standing facts about the repo that apply to every session: commands, hard rules, pointers. Where a particular task stands (its next action, assumptions, blockers) changes every session and belongs in a state file that the next session reads.',
      },
      source: 'Claude Code docs: Memory; agents.md; ai-engineering-from-scratch Phase 14 · 33–34',
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Instructions as checkable constraints',
      steps: {
        actors: [
          { id: 'rules', kind: 'document', label: 'agent-rules.md', sub: 'id, kind, check', x: 110, y: 70 },
          { id: 'agent', kind: 'agent', label: 'Agent', sub: 'reads the rules', x: 340, y: 70 },
          { id: 'perms', kind: 'guard', label: 'Permission rules', sub: 'allow · ask · deny', x: 570, y: 70 },
          { id: 'hook', kind: 'tool', label: 'Hook', sub: 'your code, pre-call', x: 800, y: 70 },
          { id: 'reviewer', kind: 'user', label: 'Reviewer', sub: 'reads the contract', x: 110, y: 230 },
          { id: 'ci', kind: 'judge', label: 'CI', sub: 'same checks every PR', x: 570, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Advice vs a rule',
            lines: [
              '"Be careful with the database" is advice: nobody can tell if it was followed.',
              'A useful rule says what must or must not happen **and how to check it**.',
            ],
            script: [
              { say: 0 },
              { send: ['rules', 'agent'], label: 'be careful', tone: 'miss' },
              { say: 1 },
              { send: ['rules', 'agent'], label: 'never edit X', tone: 'ok' },
              { badge: 'rules', text: 'check: diff', tone: 'ok', ms: 1100 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: name the kind',
            lines: ['Five kinds cover most needs: startup, forbidden, done, uncertainty, approval.'],
            task: {
              type: 'choose',
              question: 'Rule: "`pnpm test` and `pnpm tsc` exit 0". Which kind is it?',
              options: [
                { text: 'Done: what proves the task is finished' },
                { text: 'Startup', why: 'Startup rules say what must be true before work starts, such as a valid state file.' },
                { text: 'Forbidden', why: 'Forbidden rules say what must never happen, such as editing a path.' },
                { text: 'Approval', why: 'Approval rules say what needs a human, such as a new dependency.' },
              ],
              answer: 0,
            },
            solved: 'Done rules are checked by recorded exit codes; a rule that fits no kind is two rules glued together.',
          },
          {
            kind: 'watch',
            title: 'Prompts guide, harnesses enforce',
            lines: [
              '**Permission rules**: allow, ask, deny; deny wins over allow.',
              '**Hooks** run your code before a tool call and can block it.',
              '**CI** runs the same checks on every PR, whoever wrote it.',
            ],
            script: [
              { say: 0 },
              { send: ['agent', 'perms'], label: 'Read(./.env)' },
              { badge: 'perms', text: 'deny', tone: 'err', ms: 900 },
              { say: 1 },
              { send: ['agent', 'hook'], label: 'edit generated/', curve: true },
              { badge: 'hook', text: 'blocked', tone: 'err', ms: 900 },
              { say: 2 },
              { send: ['agent', 'ci'], label: 'PR' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: who enforces?',
            lines: ['The rule file is the human-readable contract; the runtime keeps it.'],
            task: {
              type: 'pick',
              question: 'Which part runs your own code before a tool call and can block it?',
              answer: 'hook',
              hints: {
                rules: 'The rule file states the expectation; it does not block anything.',
                perms: 'Permission rules are allow/ask/deny patterns in settings, not your own code.',
                ci: 'CI runs checks on the PR, after the turn, not before each tool call.',
                reviewer: 'The reviewer reads the contract; it does not intercept tool calls.',
              },
            },
            solved: 'Hooks block during a turn; CI is the backstop; the rule file tells reviewers what is enforced.',
            then: [{ send: ['agent', 'hook'], label: 'tool call', curve: true }, { badge: 'hook', text: 'blocked', tone: 'err' }],
          },
          {
            kind: 'watch',
            title: 'Give a path, not a wall',
            lines: ['"Run `pnpm codegen` to change generated code" gives a way forward; "don\'t touch generated code" only gives a wall.'],
            script: [{ say: 0 }, { send: ['rules', 'agent'], label: 'run pnpm codegen', tone: 'ok' }],
          },
        ],
      },
      body: `"Be careful with the database" is advice. The agent cannot tell whether it has followed it, and neither can you. A useful rule says what must or must not happen **and how anyone can check it**.

**Five kinds of rule cover most needs:**

| Kind | Answers | Example rule | Check |
|---|---|---|---|
| startup | what must be true before work starts? | state file exists and is valid | schema validation |
| forbidden | what must never happen? | never edit \`scripts/release.sh\` | diff touches that path? |
| done | what proves the task is finished? | \`pnpm test\` and \`pnpm tsc\` exit 0 | exit codes recorded |
| uncertainty | what to do when unsure? | write a question in \`QUESTIONS.md\` instead of guessing | file changed when blocked |
| approval | what needs a human? | new dependency, any production write | lockfile diff, tool log |

If a rule fits none of these, it is usually two rules glued together. Split it.

**Each rule names its check.** Keep rules one per heading in \`docs/agent-rules.md\` with an id, a kind, one line of text and the name of the function that checks it. Adding a rule means adding a check. Stale rules are deleted, so the file stays the truth.

**Prompts guide, harnesses enforce.** The written rule tells the model what you expect. Enforcement belongs in the tools:

- Claude Code **permission rules** in settings (\`allow\`, \`ask\`, \`deny\`, for example a deny on \`Read(./.env)\` or an ask on \`Bash(git push:*)\`); deny wins over allow.
- **Hooks** that run your code before a tool call and can block it, for example refusing edits under \`src/generated/\`.
- CI that runs the same checks on every PR, whoever wrote it.

The rule file is the human-readable contract; permissions, hooks and CI are how it is kept. You need both: the runtime stops violations during a turn, and the rule file tells reviewers what the runtime is meant to enforce.

**Write rules as positive actions where you can.** "Run \`pnpm codegen\` to change generated code" gives the agent a path forward; "don't touch generated code" only gives it a wall.`,
      example: `**Rule rewrite in a payments repo:**

| Vague | Checkable |
|---|---|
| "Be careful with migrations." | approval: any new file in \`db/migrations/\` needs human sign-off (check: diff path; hook asks) |
| "Make sure it works." | done: \`pnpm test\` and \`pnpm tsc --noEmit\` exit 0, recorded in the feedback log |
| "Don't break the API." | forbidden: no edits to \`openapi.yaml\` without a linked ticket (check: diff path + PR body) |
| "Ask if unsure." | uncertainty: add a line to \`QUESTIONS.md\` and stop that subtask |

The checker ran on the last 40 agent PRs: 6 violated the migration rule and 4 claimed done without a test run. Under the vague rules, none of those were flagged automatically.`,
      prosCons: {
        pros: [
          'Rules can be verified by code, so violations are caught without a human reading every diff.',
          'One rule file is reviewable and diffable, and maps directly to permissions, hooks and CI.',
          'Clear uncertainty and approval rules reduce silent guessing.',
        ],
        cons: [
          { con: 'Some valuable guidance (code style taste, naming) is hard to check mechanically.', fix: 'Keep it as guidance for the reviewer rubric and link examples, rather than pretending a checker covers it.' },
          { con: 'Rules in a prompt can be ignored or overridden by injected text.', fix: 'Back each hard rule with a deny rule, a hook or a CI check that fails closed.' },
          { con: 'A long list of checks slows every task.', fix: 'Run cheap checks (paths, schema) every turn and expensive ones (full test suite) only at the gate.' },
        ],
      },
      keyPoints: [
        'Five kinds: startup, forbidden, done, uncertainty, approval.',
        'Every rule names the check that verifies it.',
        'Prompts guide; permissions, hooks and CI enforce.',
        'Delete stale rules; keep one source of truth.',
      ],
      exercise: {
        prompt: `Write \`checkForbidden(changed, rules)\` where \`changed\` is a list of changed file paths and \`rules\` is a list of \`{ id, prefix }\` forbidden-path rules. Return one finding \`{ rule, file }\` per violation.

Normalise paths first: strip a leading \`./\` and reject any path containing \`..\` segments as a finding with rule \`"path-traversal"\`.`,
        starter: {
          language: 'typescript',
          code: `type Rule = { id: string; prefix: string };

export function checkForbidden(changed: string[], rules: Rule[]) {
  const findings: { rule: string; file: string }[] = [];
  // TODO
  return findings;
}`,
        },
        hints: [
          'Split the path on "/" to look for a ".." segment.',
          'Normalise the rule prefixes the same way as the paths.',
        ],
        solution: {
          language: 'typescript',
          code: `type Rule = { id: string; prefix: string };
const norm = (p: string) => p.replace(/^\\.\\//, '');

export function checkForbidden(changed: string[], rules: Rule[]) {
  const findings: { rule: string; file: string }[] = [];
  for (const raw of changed) {
    const file = norm(raw);
    if (file.split('/').includes('..')) { findings.push({ rule: 'path-traversal', file }); continue; }
    for (const r of rules) if (file.startsWith(norm(r.prefix))) findings.push({ rule: r.id, file });
  }
  return findings;
}`,
        },
        explanation: 'A forbidden-path rule becomes a pure function over the diff, so it gives the same answer in a hook, in the gate and in CI. Normalising both sides avoids "./src/generated" slipping past a "src/generated" rule, and refusing ".." segments closes the obvious escape. Glob support comes in the scope-contract section.',
      },
      quickCheck: {
        question: 'Which rule is written as a checkable constraint?',
        options: [
          '"Write clean, high-quality code."',
          '"Be careful with production."',
          '"Before saying done, pnpm test and pnpm tsc --noEmit must both exit 0, and you must quote the result."',
          '"Use your best judgment on dependencies."',
        ],
        correct: 2,
        explanation: 'It names the exact commands, the success condition (exit 0) and the evidence to show, so a gate can verify it from the recorded output. The others are advice: nothing can tell whether they were followed.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 33; Claude Code docs: permissions and hooks',
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Scope contracts: what this task may touch',
      steps: {
        actors: [
          { id: 'human', kind: 'user', label: 'You', sub: 'approve the scope', x: 110, y: 70 },
          { id: 'contract', kind: 'document', label: 'Scope contract', sub: 'before work starts', x: 340, y: 70 },
          { id: 'agent', kind: 'agent', label: 'Agent', sub: 'fix login bug', x: 570, y: 70 },
          { id: 'backlog', kind: 'data', label: 'Backlog', sub: 'feature_list.json', x: 800, y: 70 },
          { id: 'allowed', kind: 'data', label: 'allowed_files', sub: 'src/auth/**', x: 340, y: 230 },
          { id: 'forbidden', kind: 'guard', label: 'forbidden_files', sub: 'db/migrations/**', x: 570, y: 230 },
          { id: 'diff', kind: 'judge', label: 'Diff check', sub: 'at the end', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Fix a bug, touch everything',
            lines: [
              'Asked to fix a login bug, the agent also tidies the router and upgrades a dependency.',
              'Each change may be reasonable; together the PR is unreviewable.',
              'A **scope contract** says, before work starts, what this task may change.',
            ],
            script: [
              { say: 0 },
              { lit: 'agent' },
              { badge: 'agent', text: '+ router, + deps', tone: 'miss', ms: 1100 },
              { say: 1 },
              { say: 2 },
              { send: ['human', 'contract'], label: 'approve' },
              { send: ['contract', 'agent'], label: 'scope', tone: 'ok' },
            ],
          },
          {
            kind: 'watch',
            title: 'What the contract holds',
            lines: [
              'A goal, `allowed_files` and `forbidden_files` as **globs**, acceptance commands, a rollback.',
              '**Forbidden files are half the contract**: otherwise "allowed" means anything.',
              'Globs survive a rename that a raw path does not.',
            ],
            script: [
              { say: 0 },
              { send: ['contract', 'allowed'], label: 'may write' },
              { say: 1 },
              { send: ['contract', 'forbidden'], label: 'must not touch', curve: true },
              { say: 2 },
              { badge: 'allowed', text: 'globs', ms: 1000 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the diff check',
            lines: ['At the end, the diff is compared with the contract.'],
            task: {
              type: 'choose',
              question: 'A changed file matches both an allowed glob and a forbidden glob. What happens?',
              options: [
                { text: 'It blocks: forbidden wins when both match' },
                { text: 'It passes: it is in the allowed list', why: 'Forbidden wins when both match.' },
                { text: 'It is only a warning', why: 'Warnings are for files outside the allowed globs; a forbidden match blocks.' },
              ],
              answer: 0,
            },
            solved: 'Forbidden match → block; outside allowed → at least a warning; forbidden wins over allowed.',
            then: [{ send: ['agent', 'diff'], label: 'diff', curve: true }, { badge: 'diff', text: 'blocked', tone: 'err' }],
          },
          {
            kind: 'turn',
            title: 'Your turn: going out of scope',
            lines: ['The fix seems to need a file outside the allowed globs.'],
            task: {
              type: 'choose',
              question: 'What should the agent do?',
              options: [
                { text: 'Stop and ask' },
                { text: 'Widen the contract itself', why: 'The agent must not widen its own contract.' },
                { text: 'Edit the file and mention it in the summary', why: 'Going outside scope needs a human first, not an after-the-fact note.' },
              ],
              answer: 0,
            },
            solved: 'Outside scope means stop and ask, not widen the contract.',
            then: [{ send: ['agent', 'human'], label: 'may I?', tone: 'req', curve: true }],
          },
          {
            kind: 'watch',
            title: 'Two levels of scope',
            lines: [
              'A contract bounds one task; a **backlog** file bounds the session.',
              'The agent picks exactly one `todo` feature and marks it `in_progress`.',
              '"At most one in progress" is a startup check, not a promise in a prompt.',
            ],
            script: [
              { say: 0 },
              { lit: 'backlog' },
              { say: 1 },
              { send: ['backlog', 'agent'], label: 'one feature' },
              { say: 2 },
              { badge: 'backlog', text: '1 in progress', tone: 'ok', ms: 1100 },
            ],
          },
        ],
      },
      body: `Ask an agent to fix a login bug and it may also tidy the router, rename a helper and upgrade a dependency. Each change might be reasonable; together they make the PR impossible to review. A **scope contract** says, before work starts, what this task may change.

| Field | Purpose |
|---|---|
| \`task_id\` | links to the ticket or feature |
| \`goal\` | one sentence a reviewer can check |
| \`allowed_files\` | globs the agent may write (\`src/auth/**\`, \`tests/auth/**\`) |
| \`forbidden_files\` | globs it must not touch even by accident (\`db/migrations/**\`) |
| \`acceptance\` | commands that prove done (\`pnpm test tests/auth\`) |
| \`rollback\` | how to undo if needed |
| \`approvals_required\` | actions outside scope that need a human |

**Forbidden files are half the contract.** Without them, "allowed" quietly turns into "anything not obviously wrong".

**Use globs, not raw paths.** Files move between sessions; a glob survives a rename that a path does not.

**Rollback is part of scope.** Writing down how to undo the change forces you to think about what could go wrong. If you cannot describe a rollback, the task is too big or too risky to hand over as is.

**The check is a diff check.** At the end, compare the diff with the contract: any file matching a forbidden glob blocks; any file outside the allowed globs is at least a warning; forbidden wins when both match. When the agent needs to go outside scope, the right move is to stop and ask, not to widen the contract itself.

**Two levels of scope.** A contract bounds one task. A project backlog file (for example \`feature_list.json\` with one entry per feature and a \`status\`) bounds the session: the agent picks exactly one \`todo\` feature, marks it \`in_progress\`, and may not start a second. "At most one in progress" is then a startup check, not a promise in a prompt. The task's allowed files must sit inside what the active feature needs.

Plan mode (next sections) is a natural place to draft the contract: the agent reads the code, proposes the files it expects to change, and you approve the scope before any edit.`,
      code: [
        {
          language: 'json',
          title: 'scope/T-142.json',
          code: `{
  "task_id": "T-142",
  "goal": "Login returns 401, not 500, when the password is empty",
  "allowed_files": ["src/auth/**", "tests/auth/**"],
  "forbidden_files": ["db/migrations/**", "src/generated/**", "package.json", "pnpm-lock.yaml"],
  "acceptance": ["pnpm test tests/auth", "pnpm tsc --noEmit"],
  "rollback": "Revert the single commit; no data or schema changes.",
  "approvals_required": ["any new dependency", "any change outside allowed_files"]
}`,
        },
      ],
      example: `**Task T-142** (contract above). The agent's diff touched:

| File | Verdict |
|---|---|
| src/auth/login.ts | allowed |
| tests/auth/login.test.ts | allowed |
| src/http/router.ts | **off-scope: warn** (it "tidied" an import) |
| pnpm-lock.yaml | **forbidden: block** (it upgraded a test library) |

The gate blocks the PR. The agent reverts the lockfile change and records the router tweak as a suggestion in the handoff instead. Final diff: 2 files, 31 lines, reviewed in 4 minutes. The original 6-file diff had taken a reviewer 25 minutes to untangle on a similar task the week before.`,
      prosCons: {
        pros: [
          'Small, reviewable diffs that do one thing.',
          'Dangerous areas (migrations, lockfiles, generated code) are protected by default.',
          'Acceptance commands decided up front make "done" objective.',
        ],
        cons: [
          { con: 'Contracts that are too tight block legitimate fixes the agent discovers.', fix: 'Let the agent stop and ask for a scope change with a reason; a human widens the contract in a recorded edit.' },
          { con: 'Writing a contract per task feels like overhead.', fix: 'Have the agent draft it in plan mode from the ticket and the code, and only review and approve it.' },
          { con: 'Glob mistakes (src/* vs src/**) let files slip through.', fix: 'Unit-test the matcher and show the matched files in the plan before work begins.' },
        ],
      },
      keyPoints: [
        'Goal, allowed, forbidden, acceptance, rollback, approvals.',
        'Forbidden globs are half the contract and win on overlap.',
        'Check the final diff against the contract.',
        'One feature in progress per session, read from a file.',
      ],
      exercise: {
        prompt: `Write \`globToRegExp(glob)\` and \`checkScope(changed, contract)\`:

- glob rules: \`**\` matches any characters including \`/\`; \`*\` matches any characters except \`/\`; everything else is literal;
- \`checkScope\` returns \`{ blocked: string[], offScope: string[] }\`: a file matching any forbidden glob is blocked (even if also allowed); a file matching no allowed glob is off-scope.`,
        starter: {
          language: 'typescript',
          code: `type Contract = { allowed_files: string[]; forbidden_files: string[] };

export function globToRegExp(glob: string): RegExp {
  // TODO
  return /$^/;
}

export function checkScope(changed: string[], c: Contract) {
  // TODO
  return { blocked: [] as string[], offScope: [] as string[] };
}`,
        },
        hints: [
          'Escape regex metacharacters first, then replace the escaped ** and * tokens.',
          'Replace ** before * so the single-star rule does not eat it.',
          'Anchor the regex with ^ and $.',
        ],
        solution: {
          language: 'typescript',
          code: `type Contract = { allowed_files: string[]; forbidden_files: string[] };

export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^$()|[\\]{}\\\\?]/g, '\\\\$&');
  const body = escaped.replace(/\\*\\*/g, '\\u0000').replace(/\\*/g, '[^/]*').replace(/\\u0000/g, '.*');
  return new RegExp('^' + body + '$');
}

export function checkScope(changed: string[], c: Contract) {
  const allowed = c.allowed_files.map(globToRegExp);
  const forbidden = c.forbidden_files.map(globToRegExp);
  const blocked: string[] = [];
  const offScope: string[] = [];
  for (const f of changed) {
    if (forbidden.some((r) => r.test(f))) blocked.push(f);          // forbidden wins
    else if (!allowed.some((r) => r.test(f))) offScope.push(f);
  }
  return { blocked, offScope };
}`,
        },
        explanation: 'Escaping first means a dot in "package.json" is literal. Swapping ** for a placeholder before handling * keeps the two meanings apart. Checking forbidden before allowed makes the negative space win, which is the safe default. Real projects can use a tested glob library; the point is that scope is a pure function of the diff.',
      },
      quickCheck: {
        question: 'A file matches both an allowed glob (src/**) and a forbidden glob (src/generated/**). What should the scope check report?',
        options: [
          'Allowed, because allowed globs are listed first',
          'Blocked, because forbidden globs take precedence',
          'Nothing; overlapping globs are ignored',
          'Off-scope warning only',
        ],
        correct: 1,
        explanation: 'Forbidden globs carve exceptions out of broad allowed areas, so they must win when both match. Otherwise "src/**" would silently permit edits to generated code, which is exactly what the forbidden list exists to prevent.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 36',
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'Verification gates: done means checked',
      steps: {
        actors: [
          { id: 'agent', kind: 'agent', label: 'Agent', sub: '"All tests pass!"', x: 110, y: 70 },
          { id: 'wrapper', kind: 'tool', label: 'Run wrapper', sub: 'records every run', x: 340, y: 70 },
          { id: 'log', kind: 'data', label: 'Feedback log', sub: 'cmd, exit, tail', x: 570, y: 70 },
          { id: 'ci', kind: 'judge', label: 'CI', sub: 'final backstop', x: 800, y: 70 },
          { id: 'human', kind: 'user', label: 'Human', sub: 'can override a block', x: 340, y: 230 },
          { id: 'gate', kind: 'guard', label: 'Gate', sub: 'deterministic', x: 570, y: 230 },
          { id: 'report', kind: 'document', label: 'Gate report', sub: 'one known path', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Evidence, not the summary',
            lines: [
              '"All tests pass!" is the most common false claim a coding agent makes.',
              'A **verification gate** decides "done" from evidence, not from the agent\'s summary.',
            ],
            script: [
              { say: 0 },
              { badge: 'agent', text: 'trust me', tone: 'miss', ms: 1000 },
              { say: 1 },
              { send: ['log', 'gate'], label: 'evidence' },
              { lit: 'gate' },
            ],
          },
          {
            kind: 'watch',
            title: 'Capture real feedback',
            lines: [
              'A wrapper records each run: command, exit code, duration, tail of output.',
              'Truncate deterministically: keep the end, where the final error is.',
              'Crashed before an exit code? Record `exit_code: null`. **No exit code, no progress.**',
            ],
            script: [
              { say: 0 },
              { send: ['agent', 'wrapper'], label: 'pnpm test' },
              { send: ['wrapper', 'log'], label: 'exit 0', tone: 'ok' },
              { say: 1 },
              { badge: 'log', text: 'keep the tail', ms: 1000 },
              { say: 2 },
              { send: ['wrapper', 'log'], label: 'exit null', tone: 'err' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: a null exit code',
            lines: ['The full suite timed out before an exit code was captured.'],
            task: {
              type: 'choose',
              question: 'An acceptance command has `exit_code: null`. What does the gate do?',
              options: [
                { text: 'Block' },
                { text: 'Pass, if the agent says it worked', why: 'The gate decides from evidence, never from the agent\'s summary.' },
                { text: 'Warn and continue', why: 'A null exit code for acceptance is a block: no exit code, no progress.' },
              ],
              answer: 0,
            },
            solved: 'Every acceptance command must run and exit 0; a null exit code blocks.',
            then: [{ send: ['log', 'gate'], label: 'exit null', tone: 'err' }, { badge: 'gate', text: 'block', tone: 'err' }],
          },
          {
            kind: 'watch',
            title: 'Deterministic, not a judge',
            lines: [
              'Same inputs, same verdict: no LLM decides whether tests passed.',
              'One report per task, at one known path that **CI** also reads.',
            ],
            script: [{ say: 0 }, { send: ['log', 'gate'], label: 'facts' }, { say: 1 }, { send: ['gate', 'report'], label: 'verdict' }, { send: ['report', 'ci'], label: 'same report', tone: 'ok' }],
          },
          {
            kind: 'turn',
            title: 'Your turn: overriding a block',
            lines: ['The agent is confident its change works, but the gate blocked.'],
            task: {
              type: 'pick',
              question: 'Who can override the block?',
              answer: 'human',
              hints: {
                agent: 'The agent cannot override a block, however confident it is.',
                gate: 'The gate gives the same verdict on the same inputs; it does not override itself.',
                ci: 'CI is the final backstop; it reads the same report.',
              },
            },
            solved: 'Only a human can override, with a recorded reason and name.',
            then: [{ send: ['human', 'gate'], label: 'override + reason' }],
          },
        ],
      },
      short: {
        id: 'all-tests-pass-claim',
        title: '"All tests pass!" Check the log',
        beats: [
          {
            type: 'claims',
            kicker: 'T-142 · the empty-password bug',
            head: '"All tests pass." *Did they?*',
            claims: [
              { text: 'pnpm test tests/auth', ok: true, note: 'exit 0, 12 passed' },
              { text: 'pnpm tsc --noEmit', ok: false, note: 'exit 2: src/auth/login.ts line 41' },
              { text: 'pnpm test (full suite)', ok: false, note: 'exit null: killed after 300 s' },
            ],
            sub: 'The claim was true for the **focused tests only**.',
          },
          {
            type: 'flow',
            kicker: 'Capture real feedback',
            head: 'A wrapper *records* every run',
            steps: ['The exact command', 'Its exit code', 'How long it took', 'The tail of stdout and stderr'],
            sub: 'Keep the **end** of the output, where the final error is.',
          },
          {
            type: 'toggles',
            kicker: 'The gate checks facts',
            head: 'Evidence, *not the summary*',
            items: [
              { label: 'Every acceptance command ran', keep: true },
              { label: 'Every one exited 0', keep: true },
              { label: 'No null exit codes', keep: true },
              { label: 'No forbidden files in the diff', keep: true },
              { label: 'The agent’s own summary' },
            ],
            keepLabel: 'EVIDENCE',
            sub: 'No exit code, **no progress**.',
          },
          {
            type: 'counter',
            kicker: 'After a type guard on line 41',
            value: 94,
            unit: 'seconds: the full suite exits 0',
            sub: 'Now the gate **passes**.',
          },
          {
            type: 'flow',
            kicker: 'Deterministic, not a judge',
            head: 'One report, *one path*',
            steps: ['The agent tries to finish', 'A hook runs the gate', 'The report lands at one known path', 'CI reads the same report'],
          },
          {
            type: 'quiz',
            kicker: 'Your turn',
            head: 'The gate blocked, but the agent is confident its change works. Who can override?',
            answer: 0,
            options: [
              { text: 'A human, with a recorded reason and name', why: 'Only a human can override, so "I’m confident" never becomes a merged regression.' },
              { text: 'The agent, if it explains why', why: 'The agent cannot override a block, however confident it is.' },
              { text: 'An LLM judge reviewing the diff', why: 'No LLM decides whether tests passed; the gate is deterministic.' },
            ],
          },
        ],
        takeaway: {
          head: 'Done means *checked*, not claimed.',
          sub: 'Record every exit code; only a **human** can override a block.',
        },
      },
      body: `"All tests pass!" is the most common false claim a coding agent makes. Sometimes it never ran them, sometimes it ran a subset, sometimes it read a failure as a success. A **verification gate** decides "done" from evidence, not from the agent's summary.

**Capture real feedback first.** Run every command through a small wrapper that records a line per run: the exact command, exit code, duration, and the tail of stdout and stderr. Truncate deterministically (keep the end, where the final error and summary are) so a 50 MB log cannot flood the context. If the process crashed or timed out before an exit code was captured, record \`exit_code: null\`. **No exit code, no progress.**

**The gate checks facts:**

| Check | Evidence | Severity |
|---|---|---|
| every acceptance command ran | feedback log | block |
| every acceptance command exited 0 | feedback log | block |
| no \`null\` exit codes for acceptance | feedback log | block |
| no forbidden files in the diff | scope check | block |
| block-level rules pass | rule check | block |
| no off-scope files | scope check | warn |

**Deterministic, not a judge.** Same inputs, same verdict, every time. No LLM decides whether tests passed; an LLM's opinion belongs in review (next section). Write one report per task to one known path that CI also reads, so there is a single source of truth.

**The agent cannot override a block.** Only a human can, with a recorded reason and name. That keeps "I'm confident it works" from turning into a merged regression.

**Typical acceptance set for a TypeScript repo:** the focused tests for the change, then the full suite, the type-check and the linter. Each is cheap compared with a broken main branch. Order them fast to slow so the agent gets the quick failures first.

In Claude Code you can wire this in with a **hook** that runs when the agent tries to finish (or before a commit), and with CI as the final backstop for anything that slips through locally.`,
      example: `**Agent message:** "Fixed the empty-password bug. All tests pass."

**Feedback log for T-142:**

| Command | Exit | Note |
|---|---|---|
| pnpm test tests/auth | 0 | 12 passed |
| pnpm tsc --noEmit | 2 | src/auth/login.ts(41): Type 'undefined' is not assignable to 'string' |
| pnpm test | null | killed after 300 s timeout |

**Gate verdict:** blocked (type-check failed; full suite has no exit code). The agent's claim was true for the focused tests only. Fix: a type guard on line 41, then the full suite runs in 94 s and exits 0; gate passes.`,
      prosCons: {
        pros: [
          '"Done" becomes a verifiable fact rather than the agent\'s opinion.',
          'Same verdict locally and in CI, from the same report.',
          'Fast failures feed straight back into the agent\'s next turn.',
        ],
        cons: [
          { con: 'Gates only check what the acceptance commands cover.', fix: 'Pair the gate with a reviewer that asks whether the commands actually prove the goal, and add a test for the bug itself.' },
          { con: 'Slow suites make agents wait or skip checks.', fix: 'Run focused tests during work and the full suite only at the gate; parallelise or shard the suite.' },
          { con: 'Flaky tests block good work and teach people to override.', fix: 'Track flaky tests separately, quarantine them with an owner, and keep overrides human-only with a recorded reason.' },
        ],
      },
      keyPoints: [
        'Record every command with exit code and output tail.',
        'null exit code = failure.',
        'Deterministic gate; no LLM decides pass/fail.',
        'Only a human can override a block, with a reason.',
      ],
      exercise: {
        prompt: `Write \`gate(acceptance, log, scope)\` returning \`{ passed, findings }\`:

- \`acceptance\`: commands that must run; \`log\`: \`{ command, exitCode: number | null }[]\` (a command may appear several times; the **last** run counts);
- block if an acceptance command is missing from the log, its last exit code is null, or non-zero;
- block for each \`scope.blocked\` file; add a non-blocking warning for each \`scope.offScope\` file.
- \`passed\` is true only when there are no blocking findings.`,
        starter: {
          language: 'typescript',
          code: `type Run = { command: string; exitCode: number | null };
type Finding = { severity: 'block' | 'warn'; message: string };

export function gate(acceptance: string[], log: Run[], scope: { blocked: string[]; offScope: string[] }) {
  const findings: Finding[] = [];
  // TODO
  return { passed: false, findings };
}`,
        },
        hints: [
          'Build a Map from command to its last run by iterating the log in order.',
          'Check exitCode === null before checking !== 0.',
        ],
        solution: {
          language: 'typescript',
          code: `type Run = { command: string; exitCode: number | null };
type Finding = { severity: 'block' | 'warn'; message: string };

export function gate(acceptance: string[], log: Run[], scope: { blocked: string[]; offScope: string[] }) {
  const findings: Finding[] = [];
  const last = new Map<string, Run>();
  for (const r of log) last.set(r.command, r);              // later runs overwrite earlier ones
  for (const cmd of acceptance) {
    const r = last.get(cmd);
    if (!r) findings.push({ severity: 'block', message: 'not run: ' + cmd });
    else if (r.exitCode === null) findings.push({ severity: 'block', message: 'no exit code: ' + cmd });
    else if (r.exitCode !== 0) findings.push({ severity: 'block', message: 'exit ' + r.exitCode + ': ' + cmd });
  }
  for (const f of scope.blocked) findings.push({ severity: 'block', message: 'forbidden file: ' + f });
  for (const f of scope.offScope) findings.push({ severity: 'warn', message: 'off-scope file: ' + f });
  return { passed: !findings.some((f) => f.severity === 'block'), findings };
}`,
        },
        explanation: 'Using the last run lets the agent fix and re-run without old failures sticking, while a later failure still blocks. Treating null as a failure closes the "it timed out, so nothing failed" loophole. The function is pure, so CI and a local hook get identical verdicts.',
      },
      quickCheck: {
        question: 'The test command was killed by a timeout and no exit code was recorded. What should the gate do?',
        options: [
          'Pass, because no test reported a failure',
          'Block, because a missing exit code is not evidence of success',
          'Ask the agent whether the tests would have passed',
          'Warn but allow the merge',
        ],
        correct: 1,
        explanation: 'The exit code is the success signal. Without it you only know the run did not finish. Treating that as a pass is how broken changes reach main; the gate must fail closed and the agent must re-run or fix the slow test.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 37–38',
    },
    // ---------------------------------------------------------------- 5
    {
      heading: 'The reviewer agent: a second role with a rubric',
      steps: {
        actors: [
          { id: 'builder', kind: 'agent', label: 'Builder', sub: 'writes the code', x: 110, y: 70 },
          { id: 'diff', kind: 'document', label: 'Diff', sub: 'the change', x: 340, y: 70 },
          { id: 'reviewer', kind: 'judge', label: 'Reviewer', sub: 'read-only tools', x: 570, y: 70 },
          { id: 'review', kind: 'document', label: 'Review report', sub: 'rubric, 0–2 each', x: 800, y: 70 },
          { id: 'contract', kind: 'document', label: 'Task + scope', sub: 'the contract', x: 340, y: 230 },
          { id: 'gate', kind: 'guard', label: 'Gate report', sub: 'facts', x: 570, y: 230 },
          { id: 'human', kind: 'user', label: 'Human', sub: 'signs off risky work', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Facts vs judgment',
            lines: [
              'A gate says the tests passed, not whether they prove the right thing.',
              'A **reviewer** is a separate role: its own prompt, its own inputs, **no write access**.',
              'It reads the task, scope, diff, state, feedback log and gate report.',
            ],
            script: [
              { say: 0 },
              { badge: 'gate', text: 'green', tone: 'ok', ms: 900 },
              { say: 1 },
              { lit: 'reviewer' },
              { say: 2 },
              { send: ['diff', 'reviewer'], label: 'diff' },
              { send: ['contract', 'reviewer'], label: 'contract' },
              { send: ['gate', 'reviewer'], label: 'facts' },
              { send: ['reviewer', 'review'], label: 'report', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the reviewer finds a bug',
            lines: ['A builder asked "are you sure?" mostly defends its own work.'],
            task: {
              type: 'choose',
              question: 'The reviewer spots a problem in the diff. What does it do?',
              options: [
                { text: 'Writes it in the review report; the next builder turn fixes it' },
                { text: 'Patches the diff itself', why: 'The reviewer never patches; mixing the roles removes the independent check.' },
                { text: 'Asks the builder "are you sure?"', why: 'A builder asked that mostly defends its own work.' },
              ],
              answer: 0,
            },
            solved: 'Reviewer writes, builder fixes: keeping the roles apart keeps the check independent.',
            then: [{ send: ['reviewer', 'review'], label: 'finding' }, { send: ['review', 'builder'], label: 'fix next turn', curve: true }],
          },
          {
            kind: 'watch',
            title: 'A rubric keeps reviews comparable',
            lines: [
              'Five dimensions, 0–2 each: problem fit, scope discipline, assumptions, verification quality, handoff readiness.',
              'Total out of 10: below 7 is a soft fail; below 5, or any dimension at 0, is a hard fail.',
            ],
            script: [{ say: 0 }, { lit: 'review' }, { say: 1 }, { badge: 'review', text: '8 / 10', tone: 'ok', ms: 1000 }, { badge: 'review', text: '4 / 10', tone: 'err', ms: 1000 }],
          },
          {
            kind: 'turn',
            title: 'Your turn: read the score',
            lines: ['Example thresholds: below 7 soft fail, below 5 or any 0 hard fail.'],
            task: {
              type: 'choose',
              question: 'The total is 8/10, but scope discipline scored 0. What is the verdict?',
              options: [
                { text: 'Hard fail: escalate to a human' },
                { text: 'Pass: 8 is above 7', why: 'Any dimension at 0 is a hard fail, whatever the total.' },
                { text: 'Soft fail: fix and re-review', why: 'A soft fail is a total below 7; a 0 in any dimension is a hard fail.' },
              ],
              answer: 0,
            },
            solved: 'Any dimension at 0 is a hard fail, so a high total cannot hide a broken dimension.',
            then: [{ send: ['review', 'human'], label: 'escalate', tone: 'err' }],
          },
          {
            kind: 'watch',
            title: 'Both are needed',
            lines: [
              'A green gate with a reviewer score of 4 usually means the tests test the wrong thing.',
              'The report ends with the two or three things a human should look at first.',
            ],
            script: [{ say: 0 }, { badge: 'gate', text: 'green', tone: 'ok', ms: 800 }, { badge: 'review', text: '4 / 10', tone: 'err', ms: 900 }, { say: 1 }, { send: ['review', 'human'], label: 'look here first' }],
          },
        ],
      },
      body: `A gate tells you the tests passed. It cannot tell you whether the tests prove the right thing, whether the agent solved a nearby problem instead of the asked one, or whether the next person can pick up the work. That is a judgment call, and it needs a **reviewer**.

**A separate role, not necessarily a separate model.** The same model can review, as long as the role is different: its own system prompt, its own inputs, and **no write access**. In Claude Code this fits a subagent defined with read-only tools (Read, Grep, Glob). The change in posture is what produces a different signal; a builder asked "are you sure?" mostly defends its own work.

**What it reads:** the task and scope contract, the diff, the state file, the feedback log and the gate report. **What it writes:** a review report. It never patches the diff; if something needs fixing, the next builder turn fixes it. Mixing the two roles removes the independent check.

**A rubric keeps reviews comparable.** Score each dimension 0–2:

| Dimension | Question |
|---|---|
| problem fit | did it solve the task as written, not a nearby one? |
| scope discipline | did edits stay inside the contract, or was scope widened on purpose and recorded? |
| assumptions | are hidden assumptions written down where a reviewer can see them? |
| verification quality | do the acceptance commands prove the goal, or a weaker version of it? |
| handoff readiness | could the next session continue from the current state? |

Total out of 10. For example: below 7 is a soft fail (fix and re-review), below 5 or any dimension at 0 is a hard fail (escalate to a human).

**Gate and reviewer are both needed.** The gate checks facts deterministically; the reviewer judges quality. A green gate with a reviewer score of 4 usually means the tests pass but test the wrong thing.

**Keep the human in the loop where it matters.** The reviewer reduces what a person has to read; it does not replace sign-off on risky changes. Its report should end with the two or three things a human should look at first.`,
      example: `**Task:** "Login returns 401, not 500, on an empty password." Gate: passed.

**Reviewer report:**

| Dimension | Score | Note |
|---|---|---|
| problem fit | 2 | handles empty string |
| scope | 2 | 2 files, inside contract |
| assumptions | 1 | assumes whitespace-only passwords are fine; not written down |
| verification | **0** | the new test sends \`password: undefined\`, not \`""\`; the reported bug is untested |
| handoff | 2 | state and next action up to date |

Total 7, but a 0 in verification makes it a **hard fail**. The builder adds a test for \`""\` and for \`"   "\`; the whitespace case also returned 500. Without the reviewer, the gate's green tick would have shipped half a fix.`,
      prosCons: {
        pros: [
          'Catches "tests pass but prove the wrong thing", which gates cannot see.',
          'Consistent rubric scores make agent work comparable across tasks.',
          'Cuts human review time to the points the reviewer flags.',
        ],
        cons: [
          { con: 'A reviewer from the same model can share the builder\'s blind spots.', fix: 'Give it different inputs and instructions, rotate in a different model for high-risk changes, and spot-check its verdicts against human reviews.' },
          { con: 'LLM scores drift and can be inconsistent run to run.', fix: 'Use a fixed rubric with written anchors for 0/1/2, keep reviewer output structured, and calibrate on a labelled set of past PRs.' },
          { con: 'Builders may learn to write for the reviewer.', fix: 'Keep the reviewer\'s rubric about evidence (tests, diff, state) rather than wording, and keep humans on final sign-off for risky work.' },
        ],
      },
      keyPoints: [
        'Reviewer = different role, read-only, writes a report.',
        'Five-dimension rubric, 0–2 each.',
        'Any 0 is a hard fail regardless of total.',
        'Gate checks facts; reviewer judges quality.',
      ],
      exercise: {
        prompt: `Write \`reviewVerdict(scores)\` for a rubric with keys \`problemFit\`, \`scope\`, \`assumptions\`, \`verification\`, \`handoff\` (each 0, 1 or 2).

Return \`{ total, verdict, weakest }\`, where verdict is \`'hard-fail'\` if any score is 0 or the total is below 5, \`'soft-fail'\` if the total is below 7, otherwise \`'pass'\`; \`weakest\` lists the keys with the lowest score. Throw if a key is missing or a score is not 0, 1 or 2.`,
        starter: {
          language: 'typescript',
          code: `const KEYS = ['problemFit', 'scope', 'assumptions', 'verification', 'handoff'] as const;
type Scores = Record<(typeof KEYS)[number], number>;

export function reviewVerdict(scores: Scores) {
  // TODO
}`,
        },
        hints: [
          'Validate first so a malformed reviewer output never produces a pass.',
          'Math.min over the values gives the lowest score.',
        ],
        solution: {
          language: 'typescript',
          code: `const KEYS = ['problemFit', 'scope', 'assumptions', 'verification', 'handoff'] as const;
type Scores = Record<(typeof KEYS)[number], number>;

export function reviewVerdict(scores: Scores) {
  for (const k of KEYS) {
    if (![0, 1, 2].includes(scores[k])) throw new Error('invalid score for ' + k);
  }
  const values = KEYS.map((k) => scores[k]);
  const total = values.reduce((a, b) => a + b, 0);
  const min = Math.min(...values);
  const verdict = min === 0 || total < 5 ? 'hard-fail' : total < 7 ? 'soft-fail' : 'pass';
  return { total, verdict, weakest: KEYS.filter((k) => scores[k] === min) };
}`,
        },
        explanation: 'The "any zero" rule stops a strong total from hiding a dimension that failed outright, such as an untested bug. Validating the reviewer\'s output before scoring means a malformed or missing field fails closed instead of turning into a pass.',
      },
      quickCheck: {
        question: 'Why should the reviewer agent have no write access to the diff?',
        options: [
          'Write access makes the model slower',
          'If it can patch the code it becomes a second builder, and nobody independently checks the final change',
          'Read-only tools are cheaper per token',
          'The API does not allow two agents to write files',
        ],
        correct: 1,
        explanation: 'Independence is the whole value of review. A reviewer that edits the diff is reviewing its own work in the next breath. Keeping it read-only and report-only means every change still goes through the builder, the gate and a fresh review.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 39; Claude Code docs: Subagents',
    },
    // ---------------------------------------------------------------- 6
    {
      heading: 'Multi-session handoff',
      steps: {
        actors: [
          { id: 's1', kind: 'agent', label: 'Session 1', sub: 'context full', x: 110, y: 70 },
          { id: 'files', kind: 'data', label: 'Repo files', sub: 'diff, log, state', x: 340, y: 70 },
          { id: 'script', kind: 'tool', label: 'Handoff script', sub: 'builds the packet', x: 570, y: 70 },
          { id: 'json', kind: 'document', label: 'handoff.json', sub: 'for the next agent', x: 800, y: 70 },
          { id: 'md', kind: 'document', label: 'handoff.md', sub: 'for people', x: 570, y: 230 },
          { id: 's2', kind: 'agent', label: 'Session 2', sub: 'reads handoff first', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Tasks outlast a session',
            lines: [
              'The context fills up, the laptop closes, someone else takes over.',
              'Without a handoff, the next session re-tries failed approaches and undoes work it does not understand.',
            ],
            script: [{ say: 0 }, { down: 's1' }, { say: 1 }, { badge: 's2', text: 'starts blind', tone: 'err', ms: 1200 }, { down: 's1', on: false }],
          },
          {
            kind: 'turn',
            title: 'Your turn: a real next action',
            lines: ['Seven fields; **next action** matters most.'],
            task: {
              type: 'choose',
              question: 'Which is a real next action?',
              options: [
                { text: 'Add a test for whitespace-only passwords in tests/auth/login.test.ts, then run pnpm test tests/auth' },
                { text: 'Continue the auth work', why: 'Not concrete: the next session still has to work out where to start.' },
                { text: 'A one-paragraph summary of what was done', why: 'That is the summary field; a handoff without a next action is a status report.' },
              ],
              answer: 0,
            },
            solved: 'A next action is the first concrete step: which file, what change, which command.',
          },
          {
            kind: 'watch',
            title: 'Failed attempts save the most time',
            lines: ['"Tried bumping bcrypt to v6: breaks the Node 20 CI image" saves the next session an hour of rediscovery.'],
            script: [{ say: 0 }, { send: ['s1', 'files'], label: 'failed attempt' }, { badge: 'files', text: 'bcrypt v6: no', tone: 'err', ms: 1200 }],
          },
          {
            kind: 'watch',
            title: 'Generate it, two forms',
            lines: [
              'A script builds the handoff from files that already exist: diff, feedback log, state, reports.',
              'Markdown for people, JSON for the next agent; if they disagree, the **JSON wins**.',
            ],
            script: [
              { say: 0 },
              { send: ['files', 'script'], label: 'artifacts' },
              { say: 1 },
              { send: ['script', 'json'], label: 'JSON', tone: 'ok' },
              { send: ['script', 'md'], label: 'Markdown' },
              { send: ['json', 's2'], label: 'load first', curve: true },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: a stale handoff',
            lines: ['The router says: read `handoff.json` and `agent_state.json` first.'],
            task: {
              type: 'choose',
              question: 'The handoff is older than the latest commit on the branch. What should the new session do?',
              options: [
                { text: 'Look at the diff since the handoff before acting' },
                { text: 'Follow the next action as written', why: 'Someone changed things since; the next action may no longer fit.' },
                { text: 'Ignore the handoff and re-read the whole codebase', why: 'The handoff is still useful; just check what changed since.' },
              ],
              answer: 0,
            },
            solved: 'Check freshness: if newer commits exist, read that diff before acting.',
            then: [{ send: ['files', 's2'], label: 'newer diff', curve: true }],
          },
        ],
      },
      body: `Real tasks outlast a session. The context fills up, the laptop closes, a different agent or teammate takes over. Without a handoff the next session re-reads the code, re-tries approaches that already failed and sometimes undoes work it does not understand.

**A handoff is a short packet with seven fields:**

| Field | Question it answers |
|---|---|
| summary | what was done, in one paragraph |
| changed files | the diff at a glance |
| commands run | what was actually executed, with results |
| failed attempts | what was tried and why it did not work |
| open risks | what could bite next, with severity |
| next action | the first concrete step for the next session |
| report pointers | paths to the gate and review reports |

**next action is the field that matters most.** "Continue the auth work" is not a next action. "Add a test for whitespace-only passwords in \`tests/auth/login.test.ts\`, then run \`pnpm test tests/auth\`" is. A handoff with everything except a next action is a status report.

**Failed attempts save the most time.** "Tried bumping bcrypt to v6: breaks the Node 20 CI image" stops the next session from spending an hour rediscovering it.

**Generate it, don't write it from memory.** Most fields already exist as files: the diff, the feedback log, the state file, the gate and review reports. A small script builds the handoff from them; the agent's job is to keep those files current, plus write the failed attempts and next action into state as it goes. A handoff written by hand at the end of a long day is the one that gets skipped.

**Two forms from one source.** A Markdown version for people and a JSON version the next agent loads. If they disagree, the JSON (generated from the artifacts) wins.

**Start each session by reading it.** Put "read \`handoff.json\` and \`agent_state.json\` first" in the router. Also check freshness: if the handoff is older than the latest commit on the branch, someone changed things since, and the agent should look at that diff before acting.

The same packet works across tools: a session in one coding agent can hand off to another, or to a person, because the content is in files and not in one tool's chat history.`,
      code: [
        {
          language: 'json',
          title: 'handoff.json',
          code: `{
  "task_id": "T-142",
  "summary": "Empty password now returns 401. Whitespace-only still returns 500.",
  "changed_files": ["src/auth/login.ts", "tests/auth/login.test.ts"],
  "commands_run": [
    { "command": "pnpm test tests/auth", "exit_code": 0 },
    { "command": "pnpm tsc --noEmit", "exit_code": 0 }
  ],
  "failed_attempts": ["zod .min(1) on password: rejects '' but trims nothing, so '   ' still passes"],
  "open_risks": [{ "risk": "whitespace-only password returns 500", "severity": "medium" }],
  "next_action": "Trim password before validation in src/auth/login.ts; add a '   ' case to tests/auth/login.test.ts; run pnpm test tests/auth.",
  "reports": { "gate": "outputs/verification/T-142.json", "review": "outputs/review/T-142.json" }
}`,
        },
      ],
      example: `**Same task, two Monday mornings.**

| | Without handoff | With handoff.json |
|---|---|---|
| time to first useful edit | 22 min (re-reading code and the old PR) | 3 min |
| repeated a failed approach | yes (tried \`.min(1)\` again) | no |
| tokens before first edit | ~48K | ~9K |
| knew about whitespace bug | no; shipped it | yes; fixed first |

The handoff was generated in under a second from files that already existed; the only hand-written fields were the failed attempt and the next action, which the agent had added to its state file as it went.`,
      prosCons: {
        pros: [
          'Next session starts with a concrete step instead of re-discovery.',
          'Failed attempts are not repeated.',
          'Works across agents, tools and people because it lives in files.',
        ],
        cons: [
          { con: 'Handoffs go stale when someone commits after they were written.', fix: 'Record the commit hash in the handoff and have the next session compare it with HEAD and read the diff if they differ.' },
          { con: 'Vague next actions make the packet useless.', fix: 'Validate that next_action names a file or command, and have the reviewer score handoff readiness.' },
          { con: 'Hand-written handoffs get skipped under pressure.', fix: 'Generate them from state, feedback and reports, run the generator automatically at session end.' },
        ],
      },
      keyPoints: [
        'Seven fields; next action is the essential one.',
        'Failed attempts prevent repeated dead ends.',
        'Generate from artifacts; Markdown for people, JSON for agents.',
        'Read and freshness-check the handoff at session start.',
      ],
      exercise: {
        prompt: `Write \`buildHandoff(state, log, diffFiles, commit)\` that returns a handoff object and throws if it would be useless:

- \`state\`: \`{ taskId, summary, failedAttempts: string[], risks: { risk, severity }[], nextAction }\`;
- \`log\`: \`{ command, exitCode }[]\` → \`commands_run\`;
- throw if \`nextAction\` is empty or mentions neither a file path (contains "/") nor a command (contains "pnpm", "npm" or "git").
- include \`commit\` so the next session can check freshness.`,
        starter: {
          language: 'typescript',
          code: `type State = { taskId: string; summary: string; failedAttempts: string[]; risks: { risk: string; severity: string }[]; nextAction: string };
type Run = { command: string; exitCode: number | null };

export function buildHandoff(state: State, log: Run[], diffFiles: string[], commit: string) {
  // TODO
}`,
        },
        hints: [
          'Validate next action first and throw early.',
          'Map log entries to { command, exit_code } to match the JSON shape.',
        ],
        solution: {
          language: 'typescript',
          code: `type State = { taskId: string; summary: string; failedAttempts: string[]; risks: { risk: string; severity: string }[]; nextAction: string };
type Run = { command: string; exitCode: number | null };

export function buildHandoff(state: State, log: Run[], diffFiles: string[], commit: string) {
  const next = state.nextAction.trim();
  if (!next || !/\\/|\\b(pnpm|npm|git)\\b/.test(next)) {
    throw new Error('next action must name a file or a command');
  }
  return {
    task_id: state.taskId,
    commit,
    summary: state.summary,
    changed_files: [...new Set(diffFiles)].sort(),
    commands_run: log.map((r) => ({ command: r.command, exit_code: r.exitCode })),
    failed_attempts: state.failedAttempts,
    open_risks: state.risks,
    next_action: next,
    reports: { gate: 'outputs/verification/' + state.taskId + '.json', review: 'outputs/review/' + state.taskId + '.json' },
  };
}`,
        },
        explanation: 'Most fields come straight from artifacts, so the generator never forgets them. The only check that can fail is the one that matters most: a next action concrete enough to act on. The commit hash turns "is this still accurate?" into a simple comparison with HEAD.',
      },
      quickCheck: {
        question: 'Which handoff field is the most important for the next session to start productively?',
        options: ['summary', 'changed files', 'next action', 'report pointers'],
        correct: 2,
        explanation: 'The next action tells the next session exactly where to begin, such as a file and a command. The other fields give context, but without a next action the packet is a status report and the session starts by re-discovering what to do.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 40',
    },
    // ---------------------------------------------------------------- 7
    {
      heading: 'Permission modes: choosing how much to approve',
      steps: {
        actors: [
          { id: 'plan', kind: 'guard', label: 'plan', sub: 'read + propose', x: 110, y: 70 },
          { id: 'default', kind: 'guard', label: 'default', sub: 'asks before edits', x: 340, y: 70 },
          { id: 'accept', kind: 'guard', label: 'acceptEdits', sub: 'edits auto-approved', x: 570, y: 70 },
          { id: 'bypass', kind: 'guard', label: 'bypass', sub: 'bypassPermissions', x: 800, y: 70 },
          { id: 'you', kind: 'user', label: 'You', sub: 'approve prompts', x: 110, y: 230 },
          { id: 'agent', kind: 'agent', label: 'Agent', sub: 'makes tool calls', x: 340, y: 230 },
          { id: 'rules', kind: 'data', label: 'Rules', sub: 'allow · ask · deny', x: 570, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'A ladder of approval',
            lines: [
              'Every tool call is approved by you, approved by a rule, or blocked.',
              '**plan** reads and proposes; **default** asks before edits and shell commands.',
              '**acceptEdits** auto-approves edits; **bypassPermissions** asks nothing.',
            ],
            script: [
              { say: 0 },
              { send: ['agent', 'you'], label: 'may I?', tone: 'req' },
              { say: 1 },
              { lit: 'plan' },
              { lit: 'default' },
              { say: 2 },
              { lit: 'accept' },
              { lit: 'bypass' },
              { badge: 'bypass', text: 'disposable only', tone: 'err', ms: 1100 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: choose the mode',
            lines: ['The plan is reviewed; now comes a mechanical refactor in a git working tree.'],
            task: {
              type: 'pick',
              question: 'Which mode fits?',
              answer: 'accept',
              hints: {
                plan: 'plan does not edit files; the plan is already approved.',
                default: 'default would ask before every edit; edits in a git tree can be reverted.',
                bypass: 'bypassPermissions is only for a disposable container or VM with no secrets.',
              },
            },
            solved: 'Revertible edits under an approved plan → acceptEdits; other actions still ask.',
          },
          {
            kind: 'watch',
            title: 'Rules work in every mode',
            lines: [
              'Allow `Bash(pnpm test:*)`, ask for `Bash(git push:*)`, deny `Read(./.env)`.',
              '**Deny wins over allow**; hooks can block calls whatever the mode.',
            ],
            script: [
              { say: 0 },
              { send: ['agent', 'rules'], label: 'pnpm test' },
              { badge: 'rules', text: 'allow', tone: 'ok', ms: 800 },
              { send: ['agent', 'rules'], label: 'git push' },
              { badge: 'rules', text: 'ask', tone: 'req', ms: 800 },
              { say: 1 },
              { send: ['agent', 'rules'], label: 'Read(.env)' },
              { badge: 'rules', text: 'deny', tone: 'err', ms: 900 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: blast radius',
            lines: ['Choose by blast radius, not by impatience.'],
            task: {
              type: 'choose',
              question: 'How should `git push` be handled?',
              options: [
                { text: 'Keep it on ask (or deny) in every mode' },
                { text: 'Auto-approve it once in acceptEdits', why: 'acceptEdits covers file edits; a push leaves the machine and stays on ask or deny.' },
                { text: 'Allow it to avoid prompt fatigue', why: 'Allow the safe, frequent commands (tests, lint); actions that leave the machine stay on ask.' },
              ],
              answer: 0,
            },
            solved: 'Anything that leaves the machine or touches data stays on ask or deny, in every mode.',
            then: [{ send: ['agent', 'you'], label: 'push?', tone: 'req' }],
          },
          {
            kind: 'watch',
            title: 'A typical flow',
            lines: [
              'Allow the safe, frequent commands so the remaining prompts are rare and worth reading.',
              '**plan** → approve → **acceptEdits** → gate and reviewer → a human approves the push.',
            ],
            script: [{ say: 0 }, { badge: 'rules', text: 'allow tests', tone: 'ok', ms: 900 }, { say: 1 }, { lit: 'plan' }, { send: ['plan', 'accept'], label: 'approved', curve: true }, { send: ['agent', 'you'], label: 'push?', tone: 'req' }],
          },
        ],
      },
      body: `Every tool call a coding agent makes is either approved by you, approved by a rule, or blocked. Asking for everything is safe but slow; asking for nothing is fast but risky. **Permission modes** are preset points on that ladder. Claude Code's modes are a good worked example:

| Mode | What happens | Good for |
|---|---|---|
| \`plan\` | the agent reads and searches, then proposes a plan; it does not edit files or run changing commands | unfamiliar code, big changes, drafting a scope contract |
| \`default\` | asks before edits and shell commands (you can approve a tool for the rest of the session) | everyday work |
| \`acceptEdits\` | file edits are approved automatically; other actions still ask | a reviewed plan being carried out, mechanical refactors |
| \`bypassPermissions\` | no prompts at all | only inside a disposable container or VM with no secrets |

(In Claude Code, Shift+Tab cycles modes during a session. Other agents have similar levels under different names.)

**Rules work in every mode.** Settings hold \`allow\`, \`ask\` and \`deny\` rules, for example allow \`Bash(pnpm test:*)\`, ask for \`Bash(git push:*)\`, deny \`Read(./.env)\`. Deny wins over allow. Hooks can block specific calls whatever the mode. So the mode sets the default, and rules carve out what is always fine or never fine.

**Choose by blast radius, not by impatience.**

- Can the action be undone with a revert? Edits in a git working tree usually can: \`acceptEdits\` is reasonable once the plan is approved.
- Does it leave the machine (push, deploy, send, publish) or touch data? Keep it on \`ask\` or \`deny\`, in every mode.
- Is the environment disposable, with no credentials worth stealing and limited network? Only then consider \`bypassPermissions\`, for example in CI or a throwaway container.

**Prompt fatigue is a real risk.** People who approve fifty prompts a session stop reading them. The fix is not to bypass everything; it is to **allow** the safe, frequent commands (tests, type-check, lint, read-only git) so the remaining prompts are rare and worth reading.

**A typical flow:** \`plan\` to read the code and draft the scope contract → approve it → \`acceptEdits\` to implement → gate and reviewer → human approves the push.`,
      example: `**Week 1 (default mode, no allow rules):** 63 prompts per session on average; a survey showed people approved without reading after about the first ten. One \`git push --force\` to a shared branch was approved this way.

**Week 2 settings:**

| Rule | Effect |
|---|---|
| allow \`Bash(pnpm test:*)\`, \`Bash(pnpm tsc:*)\`, \`Bash(pnpm lint:*)\`, \`Bash(git status)\`, \`Bash(git diff:*)\` | checks run without prompts |
| ask \`Bash(git push:*)\` | every push asks |
| deny \`Bash(git push --force:*)\`, \`Read(./.env)\` | never, in any mode |

Plus \`plan\` for new tasks and \`acceptEdits\` after the plan is approved. Prompts per session dropped to 7, force pushes to 0, and the remaining prompts were all ones worth reading.`,
      prosCons: {
        pros: [
          'Lets you match autonomy to the task and environment instead of one global switch.',
          'Plan mode makes the agent show its intent before changing anything.',
          'Allow and deny rules remove noisy prompts while keeping hard limits.',
        ],
        cons: [
          { con: 'Too many prompts train people to approve without reading.', fix: 'Allow the frequent safe commands, keep prompts for actions with real consequences, and review the allow list periodically.' },
          { con: 'bypassPermissions on a real machine exposes secrets, history and network.', fix: 'Use it only in a disposable container or VM with no production credentials and limited network, and keep deny rules for the worst actions.' },
          { con: 'Modes differ between tools, so habits do not transfer.', fix: 'Write your policy as blast-radius rules (what can be undone, what leaves the machine) and map it to each tool\'s settings.' },
        ],
      },
      keyPoints: [
        'plan → default → acceptEdits → bypassPermissions.',
        'allow / ask / deny rules apply in every mode; deny wins.',
        'Choose by blast radius: reversible vs leaves the machine.',
        'bypassPermissions only in a disposable sandbox.',
      ],
      exercise: {
        prompt: `Write \`decide(mode, action, rules)\` returning \`'allow' | 'ask' | 'deny'\`.

- \`action\` is \`{ kind: 'read' | 'edit' | 'bash', target: string }\`; \`rules\` has \`allow\`, \`ask\`, \`deny\` lists of prefixes matched against \`kind + ':' + target\`.
- Order: deny rule → deny; ask rule → ask; allow rule → allow; then the mode default:
  - \`plan\`: reads allow, everything else deny;
  - \`default\`: reads allow, others ask;
  - \`acceptEdits\`: reads and edits allow, bash asks;
  - \`bypassPermissions\`: allow.`,
        starter: {
          language: 'typescript',
          code: `type Mode = 'plan' | 'default' | 'acceptEdits' | 'bypassPermissions';
type Action = { kind: 'read' | 'edit' | 'bash'; target: string };
type Rules = { allow: string[]; ask: string[]; deny: string[] };

export function decide(mode: Mode, action: Action, rules: Rules): 'allow' | 'ask' | 'deny' {
  // TODO
  return 'ask';
}`,
        },
        hints: [
          'Build the key once: action.kind + ":" + action.target.',
          'Check deny first so no allow rule or mode can override it.',
        ],
        solution: {
          language: 'typescript',
          code: `type Mode = 'plan' | 'default' | 'acceptEdits' | 'bypassPermissions';
type Action = { kind: 'read' | 'edit' | 'bash'; target: string };
type Rules = { allow: string[]; ask: string[]; deny: string[] };

export function decide(mode: Mode, action: Action, rules: Rules): 'allow' | 'ask' | 'deny' {
  const key = action.kind + ':' + action.target;
  const hit = (list: string[]) => list.some((p) => key.startsWith(p));
  if (hit(rules.deny)) return 'deny';            // deny wins, in every mode
  if (hit(rules.ask)) return 'ask';
  if (hit(rules.allow)) return 'allow';
  if (action.kind === 'read') return 'allow';
  switch (mode) {
    case 'plan': return 'deny';
    case 'default': return 'ask';
    case 'acceptEdits': return action.kind === 'edit' ? 'allow' : 'ask';
    case 'bypassPermissions': return 'allow';
  }
}`,
        },
        explanation: 'Explicit rules are checked before the mode, and deny comes first, so "never read .env" holds even in bypassPermissions. The mode only decides what happens to actions no rule mentions. This is a simplified model of how real hosts combine modes and rules, not an exact copy of any one tool.',
      },
      quickCheck: {
        question: 'You are about to change an unfamiliar 200-file module and want to see what the agent intends before any file changes. Which mode fits?',
        options: ['bypassPermissions', 'acceptEdits', 'plan', 'default with every tool pre-approved'],
        correct: 2,
        explanation: 'Plan mode lets the agent read and search the code and then propose what it will change, without editing. You review and approve the plan (and the scope) before switching to a mode that allows edits. acceptEdits and bypass would start changing files immediately.',
      },
      source: 'Claude Code docs: permission modes and settings; ai-engineering-from-scratch Phase 15 · 10',
    },
  ],
  codeChallenges: [
    {
      id: 'coding-agents-cc-1',
      title: 'Stop trusting the agent\'s "all tests pass"',
      context: 'A team\'s agent pipeline marks tasks done with the function below. In a month, 9 PRs marked done broke main: the agent had run only focused tests, misread a failure, or the test process had timed out.',
      task: 'Rewrite done-detection so it uses recorded command results, requires every acceptance command, treats missing exit codes as failure and ignores the agent\'s text.',
      starter: {
        language: 'typescript',
        code: `type Turn = { role: 'agent' | 'tool'; text: string };

export function isDone(transcript: Turn[]): boolean {
  const last = transcript.filter((t) => t.role === 'agent').at(-1)?.text.toLowerCase() ?? '';
  return last.includes('all tests pass') || last.includes('done');
}`,
      },
      hints: [
        'What evidence exists that is not written by the model?',
        'Which commands define "done" for this task, and where are they declared?',
        'How should a timed-out command be treated?',
      ],
      solution: {
        language: 'typescript',
        code: `type Run = { command: string; exitCode: number | null; at: string };
type Verdict = { done: boolean; reasons: string[] };

/** Done = every acceptance command's latest recorded run exited 0. The agent's prose is not evidence. */
export function isDone(acceptance: string[], runs: Run[]): Verdict {
  const reasons: string[] = [];
  if (acceptance.length === 0) return { done: false, reasons: ['no acceptance commands declared'] };
  const latest = new Map<string, Run>();
  for (const r of [...runs].sort((a, b) => a.at.localeCompare(b.at))) latest.set(r.command, r);
  for (const cmd of acceptance) {
    const r = latest.get(cmd);
    if (!r) reasons.push('never ran: ' + cmd);
    else if (r.exitCode === null) reasons.push('no exit code (timeout or crash): ' + cmd);
    else if (r.exitCode !== 0) reasons.push('failed with exit ' + r.exitCode + ': ' + cmd);
  }
  return { done: reasons.length === 0, reasons };
}`,
      },
      explanation: `- **Evidence, not prose.** The old check matched words the model wrote; "done" appears in plenty of failing runs. The new one reads the command log written by the runner.
- **Declared acceptance.** The commands come from the scope contract, so "done" cannot be redefined as "the focused tests passed".
- **Latest run wins, null fails.** Re-running after a fix counts; a timeout never does.
- **Reasons returned.** They go straight back to the agent as the next observation, and an empty acceptance list is itself a failure rather than a vacuous pass.`,
      followUps: [
        { q: 'How do you stop the agent from editing the command log itself?', a: 'Have the runner (harness) write it, outside the agent\'s writable paths, or deny edits to that path with a permission rule; CI re-runs the acceptance commands anyway, so a tampered local log cannot get a change merged.' },
        { q: 'The full suite takes 20 minutes. How do you keep agents fast?', a: 'Use focused tests during the loop and require the full suite only at the gate, run it in parallel shards, and cache unchanged packages. Do not drop it from acceptance; move it later.' },
      ],
    },
    {
      id: 'coding-agents-cc-2',
      title: 'Fix a scope check that uses startsWith',
      context: 'The scope check below wrongly blocked an edit to src/generated-docs/README.md (a prefix match on "src/generated"), missed ./db/migrations/0042.sql because of the leading ./, and passed src/auth/generated/schema.ts, a forbidden file under an allowed folder, because allowed globs are checked first.',
      task: 'Rewrite the check with proper glob matching, path normalisation, forbidden-first precedence and a clear report.',
      starter: {
        language: 'typescript',
        code: `export function inScope(files: string[], allowed: string[], forbidden: string[]) {
  for (const f of files) {
    if (allowed.some((a) => f.startsWith(a))) continue;      // allowed first
    if (forbidden.some((x) => f.startsWith(x))) return false;
  }
  return true;
}`,
      },
      hints: [
        'Normalise paths: strip ./ and refuse .. segments.',
        'Turn globs into anchored regular expressions so "src/generated/**" does not match "src/generated-old/".',
        'Return lists of blocked and off-scope files instead of a single boolean.',
      ],
      solution: {
        language: 'typescript',
        code: `const globRe = (g: string) =>
  new RegExp('^' + g.replace(/[.+^$()|[\\]{}\\\\?]/g, '\\\\$&').replace(/\\*\\*/g, '\\u0000').replace(/\\*/g, '[^/]*').replace(/\\u0000/g, '.*') + '$');

const normalise = (p: string) => p.replace(/\\\\/g, '/').replace(/^(\\.\\/)+/, '');

export function checkScope(files: string[], allowed: string[], forbidden: string[]) {
  const allow = allowed.map(globRe);
  const deny = forbidden.map(globRe);
  const blocked: string[] = [];
  const offScope: string[] = [];
  for (const raw of files) {
    const f = normalise(raw);
    if (f.startsWith('/') || f.split('/').includes('..')) blocked.push(raw);   // escapes the repo
    else if (deny.some((r) => r.test(f))) blocked.push(f);                     // forbidden first
    else if (!allow.some((r) => r.test(f))) offScope.push(f);
  }
  return { ok: blocked.length === 0, blocked, offScope };
}`,
      },
      explanation: `Four bugs fixed:

- **Prefix matching** treated "src/generated-old" as inside "src/generated". Anchored glob regexes match path segments properly.
- **No normalisation** let "./db/migrations/..." slip past "db/migrations/". Paths are normalised, and absolute or ".." paths are blocked outright.
- **Allowed checked first** meant a forbidden file under an allowed folder passed. Forbidden now wins.
- **A single boolean** gave the agent nothing to act on. The report lists blocked and off-scope files, which feed the gate (block vs warn) and the agent's next turn.`,
      followUps: [
        { q: 'Should off-scope files block or warn?', a: 'Depends on risk. Warn by default so small necessary edits (an import in a neighbouring file) are visible but not fatal, and block for repos or tasks where any out-of-contract change needs approval. Forbidden files always block.' },
        { q: 'Where else should this check run besides the gate?', a: 'In a pre-edit hook, so a forbidden write is refused before it happens, and in CI on the PR diff, so changes made outside the agent harness are held to the same contract.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'coding-agents-iq-01',
      difficulty: 'medium',
      question: 'Your team is starting to use coding agents on a mid-size TypeScript monorepo. What do you set up in the repo before letting agents open PRs?',
      whatInterviewerLooksFor: [
        'Thinks in workbench surfaces, not prompts',
        'Concrete files and checks',
        'Enforcement in tools and CI',
      ],
      modelAnswer: `I set up the workbench before I tune any prompt.

1. **Router instruction file** (CLAUDE.md, with AGENTS.md pointing to the same content): what the repo is, exact install/test/type-check/lint commands per package, five or so hard rules, and links to \`docs/testing.md\`, \`docs/architecture.md\`. Kept short and checked in CI for broken links.
2. **Rules with checks** in \`docs/agent-rules.md\`: forbidden paths (generated code, migrations, lockfiles), definition of done, what needs approval (new deps, schema changes), what to do when unsure.
3. **Permissions:** allow the frequent safe commands (tests, tsc, lint, read-only git), ask for push, deny reading \`.env\` and force pushes. Hooks to block edits in generated folders.
4. **Scope contract template** the agent drafts in plan mode for each task.
5. **Command runner and gate:** every command logged with exit code; the gate requires the acceptance commands and fails on null exits. CI runs the same gate.
6. **Reviewer subagent** with read-only tools and a five-dimension rubric.
7. **State and handoff files** so tasks survive across sessions.

Then I pilot on low-risk tasks, measure (PRs merged without rework, gate failures, review time) and widen from there.`,
      followUps: [
        { q: 'Which of these would you do first if you only had a day?', a: 'The router file with exact commands and hard rules, plus a CI gate that runs tests and type-check on every agent PR. That removes the most common failures: wrong commands and unverified "done" claims.' },
        { q: 'How do you keep the instruction file from rotting?', a: 'Treat it like code: reviewed changes, a length limit, a link checker, and a rule that every new rule names its check. Delete rules that no longer apply.' },
      ],
      pitfalls: [
        'Starting with a long prompt instead of checks',
        'Relying on the agent\'s own test claims',
        'Giving full permissions on developer laptops',
      ],
    },
    {
      id: 'coding-agents-iq-02',
      difficulty: 'hard',
      question: 'Agents keep producing PRs that touch far more files than the task needs. Reviewers are drowning. What do you change?',
      whatInterviewerLooksFor: [
        'Scope contracts with forbidden globs',
        'Diff-based enforcement and approval flow',
        'Project-level "one feature at a time"',
      ],
      modelAnswer: `This is a scope problem, so I make scope explicit and enforced.

**Per task:** a scope contract drafted in plan mode and approved before edits: goal, allowed globs, forbidden globs (lockfiles, migrations, generated code, shared config), acceptance commands, rollback. The gate compares the final diff with it: forbidden files block, off-scope files warn (or block on sensitive repos).

**When the agent needs more:** it stops and asks for a scope change with a reason; a human widens the contract in a recorded edit. "While I was here" changes go into the handoff as suggestions, not into the diff.

**Per session:** a feature list file with one \`in_progress\` item at a time, checked at startup, so the agent cannot start a second feature mid-session.

**Feedback:** the reviewer rubric has a scope-discipline score; I track files per PR and the share of off-scope warnings, and expect both to drop within a couple of weeks. If a particular kind of task always needs wider scope, I update the contract template rather than tolerate drift.`,
      followUps: [
        { q: 'What if the off-scope change was genuinely needed for the fix?', a: 'Then the scope was wrong, not the agent. The agent should surface it ("the fix requires changing src/http/errors.ts because …"), and a human approves the widened contract so the PR description and review reflect it.' },
        { q: 'How would you enforce this before the PR, not just at the gate?', a: 'A pre-edit hook that checks each write against the contract and refuses forbidden paths immediately, so the agent learns during the task instead of after it.' },
      ],
      pitfalls: [
        'Just adding "keep changes small" to the prompt',
        'No forbidden list',
        'Letting the agent widen its own scope',
      ],
    },
    {
      id: 'coding-agents-iq-03',
      difficulty: 'hard',
      question: 'An agent said "all tests pass", the PR merged, and main went red. Walk me through the postmortem and the fix.',
      whatInterviewerLooksFor: [
        'Separates claim from evidence',
        'Feedback capture and deterministic gate',
        'Reviewer for test quality',
      ],
      modelAnswer: `**What happened** (typical causes): the agent ran only focused tests; or the run timed out and it read the partial output as success; or it misread a failure; or the tests passed but did not cover the change.

**Root cause:** "done" was decided by the agent's text, and nothing independent checked it.

**Fixes:**

1. **Runner:** every command goes through a wrapper that records command, exit code, duration and the output tail. A timeout records exit code null.
2. **Gate:** acceptance commands come from the scope contract (focused tests, full suite, type-check, lint). Done means each one's latest run exited 0; null or missing fails. The agent cannot override; a human can, with a recorded reason.
3. **CI parity:** CI runs the same gate on the PR, so local and remote verdicts agree and a tampered local log cannot merge.
4. **Reviewer:** checks verification quality, i.e. whether a test actually exercises the bug.
5. **Branch protection:** main requires the CI gate.

I would also add this incident as an eval case for the agent harness: a task where the focused tests pass but the full suite fails, to confirm the gate blocks it.`,
      followUps: [
        { q: 'Why not let an LLM judge read the test output and decide?', a: 'Pass/fail is a fact available as an exit code; a judge adds variance and can be fooled by confident text in the output. Keep LLM judgment for questions without a deterministic answer, like whether the tests cover the right behaviour.' },
        { q: 'What about flaky tests?', a: 'Track them separately with an owner, quarantine known flakes explicitly, and require humans to approve overrides. Never let "flaky" become a reason the agent can give to skip a failure.' },
      ],
      pitfalls: [
        'Blaming the model and changing nothing structural',
        'Adding "make sure tests pass" to the prompt as the fix',
        'Gate that only runs locally',
      ],
    },
    {
      id: 'coding-agents-iq-04',
      difficulty: 'medium',
      question: 'How would you set permission modes and rules for coding agents across a team: laptops, CI, and an overnight batch of refactors?',
      whatInterviewerLooksFor: [
        'Matches autonomy to environment and blast radius',
        'Uses allow/ask/deny rules, not just modes',
        'Isolation for bypass',
      ],
      modelAnswer: `I decide by blast radius and environment.

**Laptops (interactive):** start in plan mode for new tasks, switch to acceptEdits once the plan and scope are approved. Shared settings in the repo: allow tests, type-check, lint and read-only git; ask for push, installs and anything network-facing; deny reading secret files and force pushes. Personal settings can be stricter, not looser, for deny rules.

**CI (agent runs on PRs):** a fresh container per job with only the repo, a scoped token that can comment and push to the PR branch but not to main, and limited network. Because the environment is disposable, broader auto-approval is acceptable there, but deny rules still apply and the gate still decides.

**Overnight refactors:** same as CI: disposable containers, one branch per task, scope contract per task, gate plus reviewer, and humans review PRs in the morning. Nothing merges or deploys without a person.

Across all three: prompt fatigue is the hidden risk, so I keep the allow list tuned until the remaining prompts are rare and meaningful.`,
      followUps: [
        { q: 'Why not use bypassPermissions on laptops for speed?', a: 'A laptop has SSH keys, cloud credentials, browser sessions and network access. With no prompts, one bad command or injected instruction can reach all of it. Reserve no-prompt modes for disposable sandboxes.' },
        { q: 'Where do deny rules live so individuals cannot remove them?', a: 'In managed or shared project settings that take precedence, backed by CI and branch protection so a local change cannot get a forbidden action merged anyway.' },
      ],
      pitfalls: [
        'One mode for every environment',
        'Bypass on machines with real credentials',
        'Approving everything because prompts are noisy',
      ],
    },
    {
      id: 'coding-agents-iq-05',
      difficulty: 'expert',
      question: 'A feature will take a coding agent about a week of sessions, sometimes handed between two different agent tools and a human. Design how state and handoffs work.',
      whatInterviewerLooksFor: [
        'State in files with a schema',
        'Generated handoffs with next action and failed attempts',
        'Freshness checks and tool independence',
      ],
      modelAnswer: `**Source of truth in the repo, not the chat.**

- \`feature_list.json\`: the backlog with one \`in_progress\` feature; a startup check refuses to start if two are in progress.
- \`agent_state.json\` (schema-validated, versioned, atomic writes): active task id, touched files, assumptions, blockers, failed attempts, next action, last commit.
- Per task: scope contract, feedback log, gate report, review report.

**Session start (same for any tool or a person):** run an init script that checks tool versions, that the test command works, that state is valid and that the last handoff's commit matches HEAD (if not, read the diff first). The router file says: read \`handoff.json\` and \`agent_state.json\` before anything else.

**During work:** the agent updates state as it goes, especially failed attempts and assumptions, so nothing depends on remembering at the end.

**Session end:** a script generates \`handoff.json\` and \`handoff.md\` from the artifacts; it refuses to finish if next_action is vague. The reviewer scores handoff readiness.

**Tool independence:** everything is plain files in git, so the second agent tool or a human uses the same packet. If the Markdown and JSON disagree, the JSON wins.`,
      followUps: [
        { q: 'What do you do when state and the code disagree?', a: 'Trust the code and git history, mark the state as stale, and have the session reconcile it (update touched files, re-run acceptance) before doing new work. Record the discrepancy as an open risk.' },
        { q: 'How do you keep the state file from growing forever?', a: 'Keep only current-task information; when a feature is done, move its summary into the feature list or the PR description and reset the state for the next task.' },
      ],
      pitfalls: [
        'Relying on chat history or a single tool\'s memory feature',
        'Handoffs written by hand at the end',
        'No freshness check against the latest commit',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'coding-agents-est-1',
      question: 'Estimate the daily input-token cost of a bloated 2,000-line instruction file versus a 50-line router for a team using a coding agent.',
      assumptions: [
        'Bloated file ≈ 30,000 tokens; router ≈ 750 tokens; both re-sent on every model call',
        '20 developers × 10 sessions/day × 40 model calls per session',
        'Illustrative price $3 per 1M input tokens; cache reads at 10% of that',
      ],
      steps: [
        { label: 'Model calls per day', calc: '20 × 10 × 40 = 8,000' },
        { label: 'Bloated tokens per day', calc: '30,000 × 8,000 = 240M' },
        { label: 'Bloated cost, uncached / cached', calc: '240 × $3 = $720 / $72' },
        { label: 'Router tokens per day', calc: '750 × 8,000 = 6M' },
        { label: 'Router cost, uncached / cached', calc: '6 × $3 = $18 / $1.80' },
      ],
      answer: 'About $720 a day uncached ($72 cached) for the bloated file versus about $18 ($1.80) for the router: a 40× difference, roughly $15K a month uncached.',
      insight: 'Caching hides much of the money but none of the attention cost: 30K tokens of rules in every call dilute the few that matter. A short router with links is cheaper and more likely to be followed.',
      followUps: [
        { q: 'If topic docs (avg 4,000 tokens) are loaded in 25% of sessions for about half the calls, what does that add to the router setup?', a: '8,000 calls × 25% × 50% = 1,000 calls with an extra 4,000 tokens = 4M tokens/day ≈ $12 uncached. Router plus on-demand docs is about $30/day, still far below $720.' },
      ],
    },
    {
      id: 'coding-agents-est-2',
      question: 'Estimate whether a verification gate pays for itself on agent-written PRs.',
      assumptions: [
        '200 agent PRs per week',
        'Without a gate, 15% reach review broken; each costs about 45 minutes of reviewer and author time to find and bounce',
        'The gate catches 80% of those before review',
        'The gate adds about 6 minutes of CI time per PR and about $0.05 of compute',
      ],
      steps: [
        { label: 'Broken PRs reaching review', calc: '200 × 15% = 30 per week' },
        { label: 'Human time lost without gate', calc: '30 × 45 min = 22.5 h' },
        { label: 'Caught by the gate', calc: '30 × 80% = 24 PRs → 24 × 45 min = 18 h saved' },
        { label: 'Gate compute cost', calc: '200 × $0.05 = $10 per week (200 × 6 min = 20 CI hours)' },
      ],
      answer: 'About 18 hours of engineer time saved per week for roughly $10 of compute and 6 minutes of extra latency per PR.',
      insight: 'Machine time is cheap and human review time is not. The gate\'s value also grows with agent volume, while the 6 minutes of latency barely matters for asynchronous agent PRs.',
      followUps: [
        { q: 'What still gets through, and how would you catch it?', a: 'About 6 broken PRs a week (20% of 30) whose problems the tests do not cover, such as wrong behaviour that passes weak tests. The reviewer agent\'s verification-quality score and a rule requiring a test for each bug fix target that remainder.' },
      ],
    },
  ],
  test: [
    {
      id: 'coding-agents-mcq-01',
      difficulty: 'medium',
      question: 'Select ALL items that belong in a repo instruction file such as CLAUDE.md or AGENTS.md.',
      options: [
        'The exact commands for tests, type-check and lint',
        'Hard rules such as "never edit src/generated/**"',
        'Links to deeper docs to read only when relevant',
        'A transcript of last week\'s agent session',
      ],
      correct: [0, 1, 2],
      explanation: 'The instruction file is a short router read every session: commands, hard rules and pointers. Transcripts are volatile, long and specific to one session; anything durable from them belongs in the state file or handoff, not in the router.',
      followUps: [{ q: 'Why keep the file short rather than complete?', a: 'It is loaded into every session; a long file costs tokens on every call and dilutes the rules that matter, so agents act on a fraction of it. Depth goes in linked docs.' }],
    },
    {
      id: 'coding-agents-mcq-02',
      difficulty: 'medium',
      question: 'What is the main difference between the repo instruction file and the agent\'s state file?',
      options: [
        'The instruction file is JSON and the state file is Markdown',
        'The instruction file holds standing rules for every session; the state file holds where the current task stands',
        'The state file is only for humans',
        'They are the same file with two names',
      ],
      correct: [1],
      explanation: 'Instructions change rarely and apply to all work in the repo. State (active task, touched files, assumptions, blockers, next action) changes every session and lets work survive a restart or a change of agent.',
      followUps: [{ q: 'What should never go into the state file?', a: 'Raw chat transcripts, reasoning traces, sampled completions and other ephemeral or sensitive telemetry. Keep what would still be useful months later.' }],
    },
    {
      id: 'coding-agents-mcq-03',
      difficulty: 'medium',
      question: 'Which of these is a "definition of done" rule rather than a forbidden, uncertainty or approval rule?',
      options: [
        'Never edit scripts/release.sh',
        'Any new dependency needs human sign-off',
        'pnpm test and pnpm tsc --noEmit must both exit 0',
        'When unsure, add a question to QUESTIONS.md and stop that subtask',
      ],
      correct: [2],
      explanation: 'Definition-of-done rules say what evidence proves completion, here two commands exiting 0. The others are a forbidden-path rule, an approval rule and an uncertainty rule. Sorting rules into these kinds makes it clear what check each one needs.',
      followUps: [{ q: 'What should the check for this rule read?', a: 'The recorded exit codes from the command log for the latest run of each command, not the agent\'s summary.' }],
    },
    {
      id: 'coding-agents-mcq-04',
      difficulty: 'hard',
      question: 'The agent\'s diff changed src/auth/login.ts, src/http/router.ts and pnpm-lock.yaml. With this contract, what should the scope check report?',
      code: {
        language: 'json',
        code: `{
  "allowed_files": ["src/auth/**", "tests/auth/**"],
  "forbidden_files": ["db/migrations/**", "pnpm-lock.yaml"]
}`,
      },
      options: [
        'All three files are fine',
        'pnpm-lock.yaml blocked; src/http/router.ts off-scope; src/auth/login.ts allowed',
        'Only src/http/router.ts is a problem',
        'Everything is blocked because one file is forbidden',
      ],
      correct: [1],
      explanation: 'The lockfile matches a forbidden entry, so it blocks. The router is outside every allowed glob, so it is off-scope (a warning or a block, depending on policy). The login file is inside src/auth/**. Reporting each file separately tells the agent exactly what to revert.',
      followUps: [{ q: 'What should the agent do if the router change was really needed?', a: 'Stop and ask for a scope change with the reason; a human approves a widened contract. It should not widen the contract itself.' }],
    },
    {
      id: 'coding-agents-mcq-05',
      difficulty: 'hard',
      question: 'What is the bug in this gate?',
      code: {
        language: 'typescript',
        code: `function passed(runs: { command: string; exitCode: number | null }[]) {
  return runs.every((r) => !r.exitCode);
}`,
      },
      options: [
        'It is correct: exit code 0 is falsy',
        'null (no exit code, e.g. a timeout) also counts as a pass, and commands that never ran are not checked at all',
        'It should use some instead of every',
        'Exit codes above 1 are ignored',
      ],
      correct: [1],
      explanation: '!null is true, so a killed or crashed run passes. And because it only looks at runs that exist, a required command that never ran cannot fail it; an empty list passes too. Check each declared acceptance command explicitly and require exitCode === 0.',
      followUps: [{ q: 'Why does the empty-list case matter?', a: 'every() on an empty array returns true, so an agent that runs nothing would be marked done. Gates must fail closed when evidence is missing.' }],
    },
    {
      id: 'coding-agents-mcq-06',
      difficulty: 'medium',
      question: 'Select ALL checks that belong in a deterministic verification gate.',
      options: [
        'Every acceptance command ran and its latest run exited 0',
        'No file in the diff matches a forbidden glob',
        'An LLM rates the code as "clean" at 8/10 or above',
        'No acceptance command has a missing exit code',
      ],
      correct: [0, 1, 3],
      explanation: 'A gate must give the same verdict for the same evidence every time, so it checks facts: exit codes, diff paths, rule results. Quality ratings from an LLM are judgments that vary between runs; they belong in the reviewer step, not the pass/fail gate.',
      followUps: [{ q: 'Who can override a blocking finding?', a: 'Only a human, with a recorded reason and name. The agent itself can never mark a blocked task as done.' }],
    },
    {
      id: 'coding-agents-mcq-07',
      difficulty: 'medium',
      question: 'Why is the reviewer agent given read-only tools?',
      options: [
        'To save tokens',
        'So it stays an independent check: it reports problems and the builder fixes them, then the change is reviewed again',
        'Because two agents cannot run in one repo',
        'Because reviewers are always a smaller model',
      ],
      correct: [1],
      explanation: 'If the reviewer could patch the diff it would become a second builder, and its own edits would go unreviewed. Separation of roles, not a different model, is what makes the review signal useful.',
      followUps: [{ q: 'Can the reviewer use the same model as the builder?', a: 'Yes. What matters is a different role: separate instructions, separate inputs and no write access. For high-risk changes a different model can add diversity.' }],
    },
    {
      id: 'coding-agents-mcq-08',
      difficulty: 'hard',
      question: 'Gate: passed. Reviewer scores: problem fit 2, scope 2, assumptions 2, verification 0, handoff 2. What should happen?',
      options: [
        'Merge: 8/10 is above the 7 threshold',
        'Hard fail: a zero in any dimension fails regardless of the total, here because the tests do not prove the goal',
        'Soft fail: re-run the reviewer until it scores higher',
        'Ignore the reviewer because the gate passed',
      ],
      correct: [1],
      explanation: 'A total can hide an outright failure. Verification 0 means the tests do not exercise the actual bug or goal, which is exactly what a green gate cannot detect. The builder adds the missing test, the gate re-runs and the reviewer scores again.',
      followUps: [{ q: 'Why not simply re-run the reviewer?', a: 'Re-running until you get a better score is cherry-picking. Fix the evidence (add the right test) and review the new change.' }],
    },
    {
      id: 'coding-agents-mcq-09',
      difficulty: 'medium',
      question: 'What is missing from this handoff that will cost the next session the most time?',
      code: {
        language: 'json',
        code: `{
  "task_id": "T-142",
  "summary": "Worked on the login bug.",
  "changed_files": ["src/auth/login.ts"],
  "commands_run": [{ "command": "pnpm test tests/auth", "exit_code": 0 }],
  "open_risks": []
}`,
      },
      options: [
        'A list of model ids used',
        'A concrete next action and the failed attempts',
        'The full chat transcript',
        'The author\'s time zone',
      ],
      correct: [1],
      explanation: 'Without a next action the next session has to work out where to start, and without failed attempts it may repeat dead ends. The vague summary makes it worse. Transcripts and model ids add tokens without helping the next step.',
      followUps: [{ q: 'What makes a next action concrete?', a: 'It names a file and a command or check, for example: trim the password in src/auth/login.ts, add a whitespace case to tests/auth/login.test.ts, run pnpm test tests/auth.' }],
    },
    {
      id: 'coding-agents-mcq-10',
      difficulty: 'medium',
      question: 'In Claude Code, which permission mode lets the agent read the code and propose changes without editing files?',
      options: ['acceptEdits', 'plan', 'bypassPermissions', 'default'],
      correct: [1],
      explanation: 'Plan mode is for research and proposals: the agent can read and search but does not edit files or run changing commands until you approve and switch modes. acceptEdits auto-approves edits, default asks before them, and bypassPermissions skips prompts entirely.',
      followUps: [{ q: 'What is a good thing to produce in plan mode?', a: 'A plan plus a draft scope contract: the files expected to change, forbidden areas, acceptance commands and a rollback note, which you approve before implementation.' }],
    },
    {
      id: 'coding-agents-mcq-11',
      difficulty: 'hard',
      question: 'Select ALL situations where running a coding agent with no permission prompts (bypassPermissions) is reasonable.',
      options: [
        'A throwaway container in CI with only the repo and a token scoped to one PR branch',
        'A developer laptop with cloud credentials, to save time',
        'A disposable VM for an overnight refactor, with no production secrets and limited network',
        'A production server, so the agent can fix incidents faster',
      ],
      correct: [0, 2],
      explanation: 'No-prompt modes are acceptable only where the environment is disposable and holds nothing valuable: no real credentials, limited network, easy to throw away. Laptops and production servers have keys, data and network reach that one bad or injected command could abuse.',
      followUps: [{ q: 'Which controls still matter in a bypass sandbox?', a: 'Deny rules for the worst actions, scoped short-lived tokens, network limits, and the verification gate and human review before anything merges.' }],
    },
    {
      id: 'coding-agents-mcq-12',
      difficulty: 'medium',
      question: 'Given these settings, what happens when the agent tries to read .env while in acceptEdits mode?',
      code: {
        language: 'json',
        code: `{
  "permissions": {
    "allow": ["Bash(pnpm test:*)", "Read(./**)"],
    "deny": ["Read(./.env)"]
  }
}`,
      },
      options: [
        'Allowed, because Read(./**) matches',
        'Allowed, because acceptEdits approves everything',
        'Denied, because deny rules take precedence over allow rules',
        'The user is asked',
      ],
      correct: [2],
      explanation: 'Deny wins over allow, and rules apply in every mode. acceptEdits only changes the default for file edits that no rule mentions. That is why hard limits belong in deny rules: switching modes cannot loosen them.',
      followUps: [{ q: 'Is a deny rule on .env enough to protect secrets?', a: 'It blocks the Read tool on that path, but a shell command could still print it unless shell access is also limited. Keep real secrets out of the workspace, or out of the sandbox entirely.' }],
    },
  ],
};

export default topic;
