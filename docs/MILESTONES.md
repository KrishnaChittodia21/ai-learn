# ai-learn · milestones (system-design-learn features, browser only)

Planning document. Each milestone is explained before it starts, built in batches, and paused with a file list;
you commit, push and deploy yourself.

**Scope (updated 2026-11-07): GitHub Pages only, no backend, no database, one user, no sign-in** — the same
approach as dsa-js (`dsa-js/design/MILESTONES.md`). Everything runs in the browser; progress, Saved, the plan,
achievements and settings live in `localStorage`, with Export / Import as the backup. Nothing is locked, there is
no admin and no email. If accounts are wanted later, see "Not included".

Feature source: `/Users/krishna/nx/system-design-learn` (only its browser-side parts are copied, restyled to Neural
Aurora). Extra content: `/Users/krishna/nx/ai-engineering-from-scratch` (C1–C4). Motion: `/Users/krishna/nx/VengeanceUI` (M9).

## Where ai-learn stands today

| Feature | system-design-learn | ai-learn now | Milestone |
|---|---|---|---|
| Hosting | Vercel + Render + Atlas | GitHub Pages (`deploy.yml`) — **stays** | M11 |
| Progress | Account-synced | `localStorage` | stays; Export / Import hardened in M2 |
| Tests + CI | `node --test`, CI | ✅ **done (M1):** `ci.yml`, deploy gated on tests, bundle-size check (M9); 309 tests after M9 | — |
| Save for later | ✅ Saved page, `SaveButton` | ✅ **done (M2)** | — |
| Guide Me | ✅ welcome tour + per-page guide | ✅ **done (M3)**, Shorts guide (M5), Plan guide (M6) | — |
| Achievements | ✅ | ✅ **done (M4, M6, M7):** 32 badges (+ Premiere, Curator, Pacesetter, Frame by Frame) | — |
| Shorts | ✅ player, Shorts page, Short of the day | ✅ **done (M5):** 12 Shorts, player, Shorts page, Short of the day | later batches |
| Plan your journey | ✅ study plan, metro-map animation | ✅ **done (M6):** learning-curve plan, Today sparkline | role-path goals with C4 |
| Read less, view more, learn more | ✅ step lessons | ✅ **done (M7):** 3 sections with core + steps | more sections in rounds |
| More / interactive animations | ✅ | ✅ **done (M8):** 33 widgets, 30 of 57 topics, Your turn on every widget | — |
| Modern motion & components | — | ✅ **done (M9):** motion tokens, border beam, count-up deltas, Shorts deck / row, ⌘K preview, glass dock, skeletons, opt-in badge tilt | — |
| Accounts, locked content, profile, admin | ✅ (needs its service) | ❌ | **not included** (no backend) |

## Decisions

| Area | Choice | Why |
|---|---|---|
| Hosting | **GitHub Pages only**, the existing `deploy.yml` | Free, nothing to run or secure server-side. Pages on a free plan needs the repo **public** |
| Users | **One user, no sign-in, nothing locked** | No server to hold answers or accounts; exams graded in the browser, answers shown after an attempt |
| Data | **`localStorage` + Export / Import** | Same as dsa-js; Export is the backup and the way to move devices |
| Frontend features | **Copy system-design's browser-side components**, restyle to Neural Aurora | `SaveButton`, `ShortPlayer`, `StepLesson`, `PageGuide`, `Walkthrough`, study-plan pace maths already work |
| Tests | **`node --test`** (built in) | Done in M1; every milestone adds its own tests |
| Motion & components | **Port from VengeanceUI** (MIT) into plain CSS + `motion/react`; skiper-ui, animmasterlib, threeui for inspiration only | No new paid tools, no Tailwind, no second animation library |
| Extra content | **Adapted from ai-engineering-from-scratch** (MIT, © 2026 Rohit Ghumare), rewritten into ai-learn's format | Keep the copyright notice and a Credits entry |

**Design decisions taken** (`ai-learn-designs/new-features/`, `plan-journey/`; change here if needed):
- Header gets **Shorts** and **☆ Saved**; Settings stays an icon; search folds to its icon below ~1480 px.
- Shorts: **one more Short unlocks each day you study** (counted locally); the Short of the day is always open.
- Plan your journey: **Option 1, the learning curve**.
- The `auth`, `locked`, `profile` and `admin` mockups are **parked** (they need a backend).

## Milestones

Each ships something testable on its own, adds its tests, and runs `npm test && npm run validate && npm run build`.

### M0 · Baseline · done

`feature/prompt-lab` (prompt labs, new topics, hallucinations, neural-network hero) is the base. You merge it to
`main` when ready.

### M1 · Test cases foundation + CI · done 2026-11-07

`npm test` (`node --test`): 141 tests at the time (202 after M7, 303 after M8) (progress and migrations, next step, achievements, neural coverage, prompt
checks); `.github/workflows/ci.yml` runs type-check, lint, validate, test and build on every push and PR;
`deploy.yml` runs validate and tests before building. Tests need Node ≥ 22.18.

### M2 · Save for later, settings and safer local data · done 2026-11-08

Done: ☆ Save on topics, sections, interview questions, code labs, prompt labs and estimation drills (Undo toasts);
`/saved` page (filters, deep links, done / remove with Undo, 500 cap); versioned Export / validated Import with
preview and merge-or-replace; a 14-day backup reminder; tests in `tests/saved.test.ts` and `tests/backup.test.ts`.


- `SaveButton` on topics, sections, interview questions, code labs, prompt labs, estimation drills and Shorts;
  **Saved page** grouped by kind, "done" ticks, "Play all" for Shorts, 500-item cap (design: `saved.html`).
- **Export / Import hardened:** versioned JSON, validated on import (shape, sizes, known keys), a preview before
  replacing data, merge-or-replace choice, and a reminder to export now and then.
- Settings: theme, accent, coach tips, study lock, replay tour, reset — all local.
- Tests: save / unsave / done / cap; import rejects bad files and keeps current data; export → import round-trips.

**Done when:** saving works everywhere listed, and a corrupted import file can't break the app.

### M3 · Guide Me, page by page · done 2026-11-08

Done: "?" opens "Guide · this page" plus a Guides list (seen / new); spotlight walkthroughs for Today, Topic, Exam,
Saved and Settings (`src/lib/pageGuides.ts`; Shorts and Plan get theirs with M5 / M6); first visit offers each
page's guide once; tests in `tests/guides.test.ts`.


- Keep `WelcomeTour`; add system-design's `PageGuide` / `Walkthrough` with stops for Today, Topic, Exam, Saved,
  Shorts and Plan (design: `guide-me.html`). "?" opens the guide for the current page; first visit shows it once.
- Tests: each page has a guide, stops point at real elements, "seen" state is saved.

### M4 · Achievements, round two · done 2026-11-08

Done: the 28 badges kept; **Premiere** (first Short watched to the end) and **Curator** (items saved, 5 / 25 / 75 / 200)
added, 30 in all; tests in `tests/achievements.test.ts` (unlock once, never downgrade, quiet backfill) and
`scripts/validate-achievements.mjs`. **Frame by Frame moved to M7** and the **plan badge to M6**: their features do
not exist yet, so they would be badges that can never unlock.


- Keep the 28 badges (incl. Prompt Smith); add **Premiere** (first Short) and **Curator** (items saved). Frame by
  Frame → M7, plan badge → M6. Design: `achievements-v2.html` (drop the
  "verified by server" seal — there is no server).
- Tests: new badges unlock once, never downgrade, quiet backfill unchanged.

### M5 · Shorts (same as system-design) · done 2026-11-08

Done: player (`ShortPlayer`, pure reducer `playerStep` in `src/lib/shorts.ts`), beats `counter spike race grid ladder
toggles flow quiz` + `tokens retrieve claims` (`attention` not needed yet); `/shorts` and `/short/:id` (lazy);
12 Shorts on their sections, checked by `npm run validate`; Short of the day on Today, topic strip, "Watch the Short",
▶ in the sections rail, Shorts in the header, More sheet and ⌘K; one unlock per study day; watched / quiz state in
`progress.shorts` (Export / Import validate and merge it); ☆ Save and "Play all" on Saved; Shorts guide; tests in
`tests/shorts.test.ts`.


90-second animated stories built from the lessons. Design: `ai-learn-designs/new-features/shorts.html`.

- **Engine (reuse, restyle):** system-design's `ShortPlayer`, `ShortThumb`, Shorts / Short pages; progress bars,
  Back / Next, hold or Space to pause, 0.75–1.25× speed, end card linking to the lesson. Same beat kit (`counter`,
  `spike`, `race`, `grid`, `ladder`, `toggles`, `flow`, `quiz`) plus AI beats only where needed (`tokens`,
  `attention`, `retrieve`, `claims`). Reduced motion, keyboard and screen-reader labels throughout.
- **Shorts as content:** optional `short: { title, beats[] }` on a section; `npm run validate` checks beat types,
  one valid `quiz`, numbers present.
- **Catalog first, in tiers:** tier 1 real incidents (lawyer who cited fake cases, Air Canada chatbot, Bing /
  Sydney, Samsung code leak, EchoLeak); tier 2 "how X works" (next-token prediction, RAG, embeddings, MCP, agents);
  tier 3 concepts (self-consistency, hallucination, prompt injection; fed by the C4 myths list).
- **First batch: 12 Shorts**, each fact-checked against its lesson.
- **Where they show:** Short of the day on Today, a Shorts page, a strip on topic pages, "▶ Watch the Short" at the
  top of a section, a ▶ icon in the sections sidebar.
- **Unlocks:** one more Short per day you study (local); progress and quiz answers in `localStorage`. A watched
  Short does not count towards plan minutes (M6). ☆ Save → Saved → "Play all"; Guide Me stops; Premiere badge (M4).
- Tests: player (timing, Back, pause, speed, quiz blocks Next), validator, Short-of-the-day pick, daily unlock.

**Done when:** the 12 Shorts play on desktop and phone, entry points open them, watched state survives a reload,
and `npm run validate` rejects a malformed Short. **Later batches:** the rest of the catalog, ~20–30 min each.

### M6 · Plan your journey (training-run animation) · done 2026-11-08

Done: `/plan` (lazy) with the learning curve (`LearningCurve.tsx`: you vs dashed pacer, ion/pulsar gap, dotted
projections, today cursor, ◆/◇ checkpoints, morph on pace/goal change, crosshair; reduced motion draws it static) and
a checkpoint table for screen readers; pace maths ported to `src/lib/pace.ts` (covered, expected, behind, catch-up,
missed days, repace keeps the gap, only "Move my finish date" rebases); goals: whole course, level, phase, topic;
Today sparkline card; Plan in the header, More sheet and ⌘K; Plan guide; `studyPlan` (+ a capped daily
`log` of [covered, expected] that draws the past curve) in Export / Import with merge; **Pacesetter** badge (7 days on
pace in the log); tests in `tests/pace.test.ts`. Shorts don't count towards plan minutes (they are not part of topic
completion). **Not built: role-path goals** (they need C4's learning paths); `goalTopics` in `pace.ts` takes one more
`kind` for them, and the goal select has a marked slot.


Same feature and pace logic as system-design's study plan, **different visual: Option 1, the learning curve**
(`ai-learn-designs/plan-journey/option-1-learning-curve.html`).

- **Plan page** ("Plan" in the nav) and a compact Today card. Inputs: daily minutes, days per week, goal (whole
  course, level, phase, topic, or a role path from C4); every phase gets a date and the goal a finish date.
- **Pace logic (reused):** covered = `estimatedMinutes` of finished topics + partly read sections; expected =
  study days since `baselineAt` × daily minutes + `baselineCovered`; behind = expected − covered; catch-up offer
  (extra minutes for 2 weeks, or a later finish); missed study days from `lastActiveAt`; only "Move my finish date"
  resets the gap; warnings can be turned off.
- **Animation:** your learning curve draws beside the dashed schedule (pacer); the gap is shaded ion when ahead,
  pulsar when behind; a today cursor with "epoch 8/16 · ETA 6 Jan · 3 days behind"; phases as ◆ / ◇ checkpoints;
  changing pace or goal morphs the curves; Today card is a sparkline. Reduced motion: static; a checkpoint table
  for screen readers.
- **Storage:** `studyPlan { dailyMinutes, daysPerWeek, goal, startedAt, baselineAt, baselineCovered, catchUp?,
  warningsOff }` in `localStorage`, included in Export / Import.
- **Plan badge** (moved from M4): a week on pace.
- Tests: covered / expected / behind maths (port system-design's cases), finish and phase dates, pace change keeps
  the gap, "Move my finish date" resets it, role-path goals.

### M7 · Read less, view more, learn more · done 2026-11-08

Done: optional `core` (≤180 words, checked by `npm run validate`) and `steps` on a section; sections without them
render as before. Read view: the core + key points, then Learn more expanders (the untouched full `body`, example,
pros/cons, code). Steps view: `StepLesson` + `stage.ts` ported (Watch / Your turn with pick, choose and order; hint
after a miss, "Show me" after two) with AI actor kinds; Read · Steps choice remembered (`uiPrefs.lessonMode`);
finishing marks the section read and stores `progress.steps` (misses show in Weak areas until a clean run; in
Export / Import); Go deeper block (Short, animation, prompt lab, sources, next section, only those that exist);
RAG Fundamentals §1, Prompting Fundamentals §1 and Agent Fundamentals §3 authored; **Frame by Frame** badge (bronze 1,
gold all step lessons); validator in `src/lib/steps.ts`; tests in `tests/steps.test.ts`.


Design: `ai-learn-designs/new-features/read-view-learn.html`.

- **Read less:** each section shows its core (~150 words) with **Learn more** expanders; nothing deleted; the
  validator caps the core.
- **View more:** a `Read · Steps` switch (reuse `StepLesson`); steps are data built from AI actors (user, document,
  chunker, embedder, vector DB, retriever, reranker, LLM, tool, agent, judge); Watch steps and Your-turn steps
  (hint after a miss, "Show me" after two).
- **Learn more:** a "Go deeper" block linking the Short, the animation, the prompt lab, sources, next section.
- First sections: RAG Fundamentals §1, Prompting Fundamentals §1, Agent Fundamentals §3.
- **Frame by Frame** badge (moved from M4): sections finished in Steps view.
- Tests: switch remembered, finishing steps marks the section read, misses feed Weak areas, validator rejects bad steps.

### M8 · More and interactive animations · done 2026-11-08

Done: 12 new widgets (next-token-sampler, vector-index-choice, query-transform, llm-streaming, mcp-handshake,
supervisor-handoff, context-budget, pairwise-judge, indirect-injection, span-tree, kg-traversal, approval-gate), so
30 of 57 topics are animated; a Your-turn step on all 33 widgets through one shared `YourTurn` in `src/viz/core.tsx`
(answers built from each widget's sim; Next / Play / → held until answered, autoplay pauses, keys 1–9, hint after a
miss, "Show me" after two, Skip); `useFrames(frames, { keepIndex, resetKey })` keeps the step when a dial
re-simulates; tests in `tests/viz-*.test.ts` (each sim, every turn's answer against its sim, gating and misses).


- **New widgets for 12 of the 39 topics with none:** genai-fundamentals (next-token sampler — design:
  `interactive-viz.html`), vector-databases (HNSW), query-transformation (HyDE / multi-query), llm-apis-streaming,
  mcp (handshake), multi-agent-systems (supervisor handoff), context-engineering (window budget), llm-evaluation
  (pairwise judge + swap), ai-security-injection (indirect injection path), observability (span tree),
  knowledge-graphs (traversal), hitl-state-machines (approval gate).
- **Interactive upgrade** of existing widgets: "Your turn" predict / drag / tune steps.
- Tests: each widget's `sim`, reduced-motion static frame, keyboard stepping.

**Done when:** 30 of 57 topics have an animation and every widget has at least one interactive step.

### M9 · Modern motion and component upgrade · done 2026-11-08

Done: motion tokens in `tokens.css` + `src/lib/motion.ts` presets; calm-down pass (`.rise` 320 ms / 8 px / 40 ms,
press 120 ms, hover lift on fine pointers only, Today shimmer / pulse and Topic sheen removed, star 4 s); ⌘K opens
with no animation and gains a Continue row, type icons and a preview pane (≥ 720 px); enter-only CSS route change
(no blank gap); the border beam on Today's next-mission card only (paused off-screen), every other `.gborder` a
static aurora hairline; Today tiles count up from the last visit with a +n chip and `scaleX` bars; one heading reveal
per page per session (Today, Shorts, Achievements); Prompt Lab typing reveal (once per lab, skippable) and a 0.18 s
score after the first; glass phone dock with a sliding pill; Shorts "Ready to watch" (phone deck, desktop
perspective row); route / viz skeletons after 200 ms and a cold-start splash after 300 ms; header tooltips; opt-in
earned-badge tilt (Settings → Depth effects, lazy); Syllabus rings and unlock orbit dots now static; reduced-motion
fades everywhere; `scripts/check-bundle.mjs` in CI (+30 KB gzip per chunk vs `scripts/bundle-budget.json`); VengeanceUI
credit in README and file headers; tests in `tests/motion.test.ts`.


| Source | Licence / cost | Use |
|---|---|---|
| **VengeanceUI** (local, ~144 components; Next.js, Tailwind v4, framer-motion, GSAP, R3F) | **MIT**, © 2025–2026 Ashutoshx7 | **Port** picks: Tailwind → plain CSS + tokens, `framer-motion` → `motion/react`; keep the MIT credit |
| skiper-ui.com | free tier needs attribution, Pro $129, ToS conflicts | inspiration only |
| animmasterlib.dev | paid, redistribution banned | inspiration only |
| threeui.com | Pro $199–299, free items' licence unclear | inspiration only |

- **Process (skills):** `find-animation-opportunities` + `improve-animations` audit → design round in
  `ai-learn-designs/motion-kit/` → build with `animate`, `effects`, `emil-design-eng`, `apple-design`,
  `mobile-native` → check with `animation-performance`, `break-ui`, a UI review.
- **Candidates:** motion tokens; count-up stats and staggered tiles on Today; border-beam on the next-mission card;
  one subtle heading reveal per page; stacked / perspective Shorts carousel; typing reveal in Prompt Lab; route
  transitions, richer ⌘K, glass phone dock, animated tooltips; branded loading reveal; at most one opt-in 3D
  effect, lazy and paused off-screen.
- **Rules:** nothing paid; no rings / orbits / prisms / voxels (sister apps); no Tailwind, no second animation
  library; 60 fps on a mid-range phone, ≤ ~30 KB gzip extra per route; reduced-motion fallback for everything.
- Tests: reduced-motion snapshots, a performance trace on Today / Shorts / Topic, bundle-size check in CI.

### Content from ai-engineering-from-scratch (C1–C4)

Only the gaps (ai-learn already covers MCP in depth, OpenTelemetry, gateways, vLLM / SGLang, speculative decoding,
Llama Guard / garak / PyRIT, model cards, the EU AI Act). Every item follows the content contract and passes
`npm run validate`; rewritten, not copied; sources and a Credits entry. Out of scope: math, classic ML, computer
vision, RL, building an LLM from scratch, reverse engineering.

#### C1 · Agent engineering gaps · done 2026-11-08

Done: new topics `agent-skills` (5 sections, prompt lab `agent-skills-pl-1`) and `coding-agents` (7 sections) in
the frameworks phase; 12 sections appended to agent-memory-tools, modern-agent-stack, multi-agent-systems,
agent-evaluation-safety and audio-video (indices unchanged, no migration); interview + exam questions for each;
README credit with the MIT notice; 59/59 topics valid, 312 tests. Note: all topic content ships in one startup
chunk (~1.7 MB gzip) — lazy-load per topic before M11.

- **New topics:** **Agent Skills** (SKILL.md, progressive disclosure, routing, permissions, evals; prompt lab) and
  **Working with coding agents** (repo memory, instructions as constraints, scope contracts, verification gates,
  reviewer agent, multi-session handoff, permission modes).
- **New sections:** MemGPT / Letta, sleep-time compute, Mem0, Voyager skill libraries (Agent Memory & Tools);
  AutoGen, CrewAI, Mastra / Agno trade-offs (Modern Agent Stack); debate, voting, consensus, blackboard, generative
  agents, MAST failures (Multi-Agent Systems); long-horizon agents, durable execution, propose-then-commit,
  checkpoints and rollback (Agent Evaluation & Safety); voice agents with Pipecat / LiveKit (Audio & Video).

#### C2 · AI product delivery and production economics · done 2026-11-08

Done: new topic `ai-product-delivery` (7 sections, case-style interview questions, 13 exam questions; architecture
phase, last topic); appended LLM FinOps to cost-caching and scaling laws, mixture-of-experts and "beyond full
attention" (KV-cache sizing, sliding window, hybrids, SSMs) to transformer-internals — MHA/MQA/GQA/FlashAttention
were already covered; 60/60 topics valid, 312 tests. Startup content chunk now ~1.74 MB gzip (see C1 note).

- **New topic: AI product delivery** (frame the task, real workflow, assumptions and risk, smallest testable slice,
  success metrics, prototype → pilot → production, the feedback ratchet; case-style interview questions).
- **New sections:** LLM FinOps (Cost & Caching); scaling laws, mixture-of-experts, attention variants
  (Transformer Internals).

#### C3 · Safety and alignment frontier · done 2026-11-08

Done: new topic `alignment-frontier-risk` (8 sections: reading safety research + sycophancy, reward hacking, sleeper
agents, alignment faking, scheming evals, AI control, frontier safety policies "as published 2025", METR; 14 exam
questions; security phase); appended differential privacy (2 sections) to privacy-guardrails and watermarking /
SynthID + C2PA provenance and detector limits (2 sections) to red-teaming-responsible-ai; 61/61 topics valid, 312
tests. Policy facts go stale — re-check yearly. Optional Generative media topic not built. Startup content chunk
~1.79 MB gzip (see C1 note).

- **New topic: Alignment and frontier risk** (sycophancy, reward hacking, alignment faking, sleeper agents,
  scheming, AI control, RSP / Preparedness / FSF, METR) — factual, cited, practical.
- **New sections:** differential privacy (Privacy & Guardrails); watermarking and provenance, SynthID / C2PA
  (Red-teaming & Responsible AI). Optional topic: Generative media (diffusion, flow matching).

#### C4 · Learning-platform assets · done 2026-11-08
- **Glossary page** (`glossary/terms.md`) with hover definitions in lessons, plus a **Myths** list (feeds Shorts tier 3).
- **Learning paths by role** (`learning-paths/*.json`): Agentic AI engineer, Applied AI engineer, Eval &
  reliability engineer, Forward-deployed AI engineer, Building and deploying AI apps, Using coding agents, MCP —
  picking one reorders Today's next step and can be the Plan goal (M6).
- **Interview bank by role and scenario** (`interviews/`): role tags and a "Practise for role X" mode.
- **Path certificates (local):** finishing every exam in a path shows a printable / downloadable certificate and a
  badge — clearly self-issued (no server to verify it).
- **Practice "from scratch" drills** (`practice/`): BM25, BPE merge step, CLIP contrastive loss… as graded
  TypeScript Code Lab exercises with tests run in the browser.
- **Topic cheatsheets** (`cheatsheets/`) merged into the matching Cheat sheet tabs.
- **Done:** Glossary page (219 terms, hover definitions in lessons, Settings toggle) + 21 fact-checked Myths and 3 tier-3 Shorts (15 total); 7 role paths (`#/paths`): Today's next step follows the chosen path, `role:<id>` Plan goal, "Practise for role" interview mode, local self-issued printable certificate, Path Finisher badge; 10 TypeScript from-scratch drills (`#/drills`) graded in a Blob Web Worker (sucrase, lazy; 3 s timeout; every source mutant rejected in tests), From Scratch badge; extra cheat-sheet blocks for 55/61 topics. All new data lazy-loaded. 360 tests. M10 note: a CSP must allow `worker-src blob:` for drills. Not done: role scenario questions.

### M10 · Security check · done 2026-11-08

No backend means a small surface, but the browser app still needs a check (as dsa-js M12):
- No secrets in the repo or bundle; old GitHub tokens revoked and remote URLs clean.
- XSS: lesson markdown and any user text (drafts, notes, imported JSON) rendered safely; no `dangerouslySetInnerHTML`
  on untrusted input; Import validated (M2).
- Code / prompt runners: browser test runners isolated (Web Worker or sandboxed iframe), time-limited.
- Dependencies: `npm audit` and a supply-chain review; GitHub Actions pinned; Dependabot on.
- Content Security Policy via `<meta>` (GitHub Pages can't set headers); third-party origins limited (fonts only).
- Output: `docs/SECURITY-CHECK.md` with findings, fixes and accepted risks.
- **Done:** see `docs/SECURITY-CHECK.md`. Fixed: drill worker no longer evals (CSP needs no `'unsafe-eval'`), Vite 8.3.6 (`npm audit` 0), build-only CSP `<meta>` (0 violations app-wide), Actions pinned to SHAs + `persist-credentials: false`, Dependabot, `.env` ignored. No secrets in tree/build/history. Left to the owner: revoke old tokens, clean remote URLs, enable secret scanning/push protection. Vite 8.3.6 now merges topic content into `index.js` (same total bytes) — lazy-load per topic before M11.

### M11 · Deploy on GitHub Pages · ready 2026-11-08 (owner deploys)

- Existing `deploy.yml` (already gated on validate + tests since M1); confirm `base: './'` and deep links work on
  `https://<user>.github.io/ai-learn/`.
- Release checklist: fresh browser → Today, a topic, an exam, a prompt lab, a Short, Save, Plan, Export → Import on
  another browser; a rollback by re-running the previous deploy.
- Output: `docs/DEPLOY.md`.
- **Ready:** `docs/DEPLOY.md` written: one-time setup, an 11-step release checklist, rollback by re-running the last good deploy. The checklist passed locally (2026-11-08) on the production build served under `/ai-learn/` in two clean Chrome profiles. Export → Import → Merge round-tripped, with 0 CSP violations and 0 errors. Left to the owner: clean the remote and revoke tokens, set Pages Source to Actions, merge to `main`, re-run the checklist on the live URL. Topic content is now lazy-loaded per topic. Startup JS went from 2.1 MB to about 325 KB gzip, using a generated, freshness-checked topic index plus 61 `topic-<id>` chunks.

## Order and estimates

```
M0 ✓ → M1 ✓ → M2 ✓ → M3 ✓ → M5 ✓ → M4 ✓ → M6 ✓ → M7 ✓ → M8 ✓ → M9 ✓ → C1 → C2 → C3 → C4 → M10 (security) → M11 (deploy)
```

C1–C3 are content only and can run in parallel with anything. Security check and deploy stay last.

| Milestones | Hours |
|---|---|
| M0–M1 · baseline, tests, CI | done |
| M2–M4 · Saved + local data, Guide Me, achievements round two | 13–20 |
| M5 · Shorts | 18–26 |
| M6 · Plan your journey | done |
| M7 · read less / view more | done (then ~40–60 min per section) |
| M8 · animations | done |
| M9 · modern motion and components | done |
| C1–C3 · content (4 new topics, 12 new sections) | 36–54 |
| C4 · glossary, role paths, interviews, certificates, drills | 12–18 |
| M10–M11 · security check, deploy | 5–9 |
| **Total (remaining)** | **~124–185** |

## Risks

- **`localStorage` only:** clearing site data or switching browsers loses progress unless exported; Export reminders
  (M2) and Import validation matter.
- **Answers ship in the bundle:** anyone can read them in dev tools. Fine for a self-study app; revisit only if
  accounts come back.
- **Public repo** (GitHub Pages on a free plan).

## Not included (later, if needed)

- **Accounts, synced progress, locked content, profile, admin** — needs the shared system-design service (the
  multi-app work is on `system-design-learn` branch `feat/multi-app`, docs in its `docs/MULTI-APP.md`), an
  answer-key split and a host like Vercel. Parked mockups: `ai-learn-designs/new-features/{auth,locked,profile,admin}.html`.
- AI mode (an LLM key) for live prompt-lab runs — would also need a backend to keep the key secret.
- More Shorts and step-lesson sections in rounds.
