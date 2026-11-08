import type { Topic } from '../../types';

// Adapted (rewritten, not copied) from ai-engineering-from-scratch, Phase 14 lessons 47–54 (product judgment and
// delivery) (MIT, © 2026 Rohit Ghumare, github.com/rohitg00/ai-engineering-from-scratch).

const topic: Topic = {
  id: 'ai-product-delivery',
  phase: 'architecture',
  order: 4,
  title: 'AI Product Delivery',
  subtitle: 'From "we need an AI feature" to a measured, owned system: frame the outcome, map the real workflow, rank the risks, ship the smallest slice that decides something, gate each stage, and turn every failure into a test.',
  estimatedMinutes: 55,
  sources: [
    'Basili, Caldiera and Rombach, The Goal Question Metric Approach (1994)',
    'Boehm, A Spiral Model of Software Development and Enhancement (1988)',
    'Nuseibeh and Easterbrook, Requirements Engineering: A Roadmap (ICSE 2000)',
    'Fagerholm et al., Building Blocks for Continuous Experimentation (RCoSE 2014)',
    'ai-engineering-from-scratch (MIT, © 2026 Rohit Ghumare), Phase 14 lessons 47–54 (outcomes before output, discover the real workflow, assumptions and risk, smallest testable slice, specifications, success metrics, prototype / pilot / production, the feedback ratchet). github.com/rohitg00/ai-engineering-from-scratch',
  ],
  tags: ['product', 'delivery', 'scoping', 'risk', 'metrics', 'pilot', 'evals', 'feedback-loop', 'case-interview'],
  cheatSheet: [
    'Outcome before output: "build a support bot" is an output; "customers with order issues get a correct resolution in under 5 minutes without unsafe refunds" is an outcome.',
    'Frame = user, situation, current workflow, desired outcome, constraints, non-goals. If the outcome names a model, a vector DB or a chatbot, a solution has leaked in.',
    'Map the workflow people actually perform (actor, trigger, action, inputs, handoffs, authority, exceptions) and label each step by evidence: observed, artifact, reported, inferred.',
    'Every build is a set of bets: value, usability, feasibility, viability, safety. Write each as a falsifiable claim; rank by impact, uncertainty and irreversibility; test the riskiest first.',
    'Smallest testable slice = the cheapest end-to-end path that covers the riskiest assumptions. UI-only, infra-only, happy-path-only and demo-only slices are false minimums.',
    'Metrics come from questions about a goal (GQM). Cover task success, quality bar, cost and latency per task, adoption, plus guardrails and a counter-metric. Fix thresholds before you look.',
    'Offline evals (replay, golden set) are repeatable; online signals (pilot, A/B, edits, escalations) show real behaviour. You need both, in that order.',
    'Prototype asks "can it work?", pilot asks "does it work safely for a bounded real audience?", production asks "can we own it continuously?" Each stage has exit criteria including stop.',
    'Feedback ratchet: every failure becomes an owned, verified change at the earliest layer that prevents it (eval case, retrieval fix, permission, runtime limit), and every control has a retirement condition.',
    'Case interviews: clarify the outcome and constraints, map the workflow, name the riskiest assumption, propose a slice with metrics and a stop rule, then the gates and the ratchet.',
  ],
  sections: [
    // ---------------------------------------------------------------- 1
    {
      heading: 'Frame the outcome before the output',
      body: `Fast tooling makes it cheap to build the wrong thing. Before choosing a model or a framework, write down what should be **different in the world** when you are done.

**Output vs outcome.** "Build an AI support agent" is an output: it names an artifact. An outcome names a user, a situation and an observable change: *customers with a delivery problem get a correct resolution within five minutes, and no refund over $50 goes out without a human.* That sentence could be met by an agent, a better help-centre page, or a fixed tracking email. Keeping all three open is the point.

**The frame has six parts:**

| Part | Question | Support example |
|---|---|---|
| User | Who has the problem? | Customers, and the agents who answer them |
| Situation | When does it happen? | Order late or missing, mostly evenings |
| Current workflow | What happens today, workarounds included? | Ticket → queue (6 h median) → agent checks 3 tools → reply |
| Desired outcome | What observable state improves? | Correct resolution, faster, fewer reopenings |
| Constraints | What is fixed? | No refunds over $50 without approval; PII stays in region |
| Non-goals | What tempting work is out? | No voice channel, no returns flow, no CRM migration |

**Spot solution leakage.** If the desired-outcome line contains a product form ("chatbot", "weekly AI digest"), an infrastructure choice ("vector database"), or a model name, a solution has slipped in before evidence earned it. Move it to a candidate list. Constraints *may* name technology when something really fixes it (an existing CRM API you must use), but write down why.

**Constraints are part of the goal.** A bot that halves handling time by issuing refunds it should not has not met the outcome. **Non-goals** stop the first slice from turning into a platform, so make them concrete enough to reject work ("no automatic order cancellation in this release").

In practice, write the frame on one page, agree it with the person who owns the outcome, and treat every later decision (slice, metrics, stage) as a test of it.`,
      code: [
        {
          language: 'json',
          title: 'outcome-frame.json',
          code: `{
  "user": "customers with a late or missing order; support agents",
  "situation": "order past promised date, any channel, peaks 6-10 pm",
  "current_workflow": "ticket -> queue (median 6 h) -> agent checks OMS, carrier, payments -> reply",
  "desired_outcome": "correct resolution sent within 5 minutes for 60% of these tickets; reopen rate does not rise",
  "constraints": ["refunds > $50 need human approval", "PII stays in EU region", "existing ticketing system stays"],
  "non_goals": ["voice", "returns flow", "CRM migration"]
}`,
        },
      ],
      example: `**The request:** the VP of Support asks for "a GPT bot on the help widget".

**After a one-hour framing session:** 41% of tickets are "where is my order?"; a human answers each by copying the carrier status into a template. The real outcome is "customers learn the true status and next step without waiting 6 hours". Two of the three candidate outputs need no LLM at all: a proactive delay email and a status block on the order page. The team ships the email in a week (tickets for that category drop 30%) and scopes the agent to the remaining cases that need judgement: lost parcels, partial deliveries, refund eligibility.`,
      prosCons: {
        pros: [
          'Keeps the team tied to a result instead of the first artifact someone imagined.',
          'Surfaces cheaper non-AI options early, which is often the best outcome of all.',
          'Constraints and non-goals give engineers a clear basis for saying no.',
        ],
        cons: [
          { con: 'Stakeholders may hear framing as stalling.', fix: 'Time-box it (an hour or two) and come back with the frame plus a proposed first slice and date, so it reads as speed with direction.' },
          { con: 'Outcomes can be written so vaguely they cannot be tested.', fix: 'Require a number, a population and a time window in the outcome line, and the earliest observation that would prove it false.' },
        ],
      },
      keyPoints: [
        'Output names an artifact; outcome names a user, a situation and a measurable change.',
        'Six parts: user, situation, current workflow, desired outcome, constraints, non-goals.',
        'Product forms, model names and infrastructure in the outcome line are solution leakage.',
        'Breaking a constraint means the outcome was not met.',
      ],
      exercise: {
        prompt: `Write \`findLeakage(outcome)\` that returns the solution words found in an outcome sentence, so a review can flag them. Use this list (case-insensitive, whole words): chatbot, bot, agent, gpt, llm, rag, vector database, dashboard, summary, fine-tune.`,
        starter: {
          language: 'typescript',
          code: `const SOLUTION_WORDS = ['chatbot', 'bot', 'agent', 'gpt', 'llm', 'rag', 'vector database', 'dashboard', 'summary', 'fine-tune'];

export function findLeakage(outcome: string): string[] {
  // TODO
  return [];
}`,
        },
        hints: [
          'Build a regex per word with \\b on both sides so "robot" does not match "bot".',
          'Escape the hyphen-free words directly; "vector database" contains a space, which is fine inside the regex.',
        ],
        solution: {
          language: 'typescript',
          code: `const SOLUTION_WORDS = ['chatbot', 'bot', 'agent', 'gpt', 'llm', 'rag', 'vector database', 'dashboard', 'summary', 'fine-tune'];

export function findLeakage(outcome: string): string[] {
  return SOLUTION_WORDS.filter((w) => new RegExp('\\\\b' + w + '\\\\b', 'i').test(outcome));
}

// findLeakage('Customers use the AI agent to get a summary') -> ['agent', 'summary']
// findLeakage('Customers learn the true order status within 5 minutes') -> []`,
        },
        explanation: 'A word list is crude, but it catches the most common slip (naming the artifact) cheaply and in review, where it is still free to change. "Support agent" as a user is a false positive; the reviewer decides, the check only flags.',
      },
      quickCheck: {
        question: 'Which line is an outcome rather than an output?',
        options: [
          'Launch an LLM chatbot on the help widget by Q3',
          'Customers with a late order get a correct status and next step within 5 minutes, with no unapproved refunds',
          'Index all help articles in a vector database',
          'Fine-tune a model on past tickets',
        ],
        correct: 1,
        explanation: 'Only option 2 names a user, a situation and an observable change, plus a constraint. The others name artifacts or infrastructure, which are candidate solutions to test against the outcome.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 47; Nuseibeh and Easterbrook 2000',
      steps: {
        actors: [
          { id: 'vp', kind: 'user', label: 'VP of Support', sub: '"a GPT bot"', x: 110, y: 150 },
          { id: 'frame', kind: 'document', label: 'One-page frame', sub: 'six parts', x: 340, y: 150 },
          { id: 'email', kind: 'tool', label: 'Delay email', sub: 'no LLM', x: 570, y: 70 },
          { id: 'status', kind: 'tool', label: 'Status block', sub: 'order page, no LLM', x: 800, y: 70 },
          { id: 'agent', kind: 'agent', label: 'Scoped agent', sub: 'judgement cases', x: 570, y: 230 },
          { id: 'tickets', kind: 'metric', label: 'Tickets', sub: 'where is my order?', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Output vs outcome',
            lines: [
              '"Build an AI support agent" names an artifact: an **output**.',
              'An **outcome** names a user, a situation and an observable change.',
              'Here: customers learn the true status and next step without waiting 6 hours.',
            ],
            script: [
              { say: 0 },
              { send: ['vp', 'frame'], label: 'a GPT bot' },
              { badge: 'frame', text: 'an output', tone: 'miss', ms: 1000 },
              { say: 1 },
              { lit: 'frame' },
              { say: 2 },
              { badge: 'frame', text: 'the outcome', tone: 'ok', ms: 1200 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the six parts',
            lines: ['The frame fits on one page and is agreed with the outcome owner.'],
            task: {
              type: 'order',
              question: 'Put the six parts of the frame in order.',
              items: ['User', 'Situation', 'Current workflow', 'Desired outcome', 'Constraints', 'Non-goals'],
              hint: 'Start with who has the problem and when; end with what is fixed and what is out.',
            },
            solved: 'User → situation → current workflow → desired outcome → constraints → non-goals.',
          },
          {
            kind: 'turn',
            title: 'Your turn: spot the leak',
            lines: ['A product form, an infrastructure choice or a model name in the outcome line is **solution leakage**.'],
            task: {
              type: 'choose',
              question: 'Which desired-outcome line has a solution leaking into it?',
              options: [
                { text: 'Use a vector database to answer order questions' },
                {
                  text: 'Customers learn the true status and next step without waiting 6 hours',
                  why: 'User, situation and change, with no product form: a clean outcome.',
                },
                {
                  text: 'Customers with a delivery problem get a correct resolution within five minutes',
                  why: 'This names an observable change, not a solution.',
                },
              ],
              answer: 0,
            },
            solved: 'Move product forms, infrastructure and model names to a candidate list until evidence earns them.',
          },
          {
            kind: 'watch',
            title: 'Keep the candidates open',
            lines: [
              '41% of tickets are "where is my order?".',
              'Two of three candidates need **no LLM**: a delay email and a status block.',
              'The email ships in a week and that ticket category drops 30%.',
              'The agent is scoped to cases that need judgement.',
            ],
            script: [
              { say: 0 },
              { badge: 'tickets', text: '41%', ms: 1000 },
              { say: 1 },
              { send: ['frame', 'email'] },
              { send: ['frame', 'status'], curve: true },
              { say: 2 },
              { send: ['email', 'tickets'], label: '−30%', tone: 'ok', curve: true },
              { say: 3 },
              { send: ['frame', 'agent'], label: 'lost parcels' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: constraints count',
            lines: ['Constraint: no refunds over $50 without human approval.'],
            task: {
              type: 'choose',
              question: 'A bot halves handling time by issuing refunds over $50 on its own. Was the outcome met?',
              options: [
                { text: 'No: breaking a constraint means the outcome was not met' },
                { text: 'Yes: handling time halved', why: 'Constraints are part of the goal.' },
              ],
              answer: 0,
            },
            solved: 'Constraints are part of the goal: breaking one means the outcome was not met.',
          },
        ],
      },
    },
    // ---------------------------------------------------------------- 2
    {
      heading: 'Map the workflow people actually perform',
      body: `Requirements are not sitting in a meeting waiting to be collected. They are spread across actions, workarounds, tickets and side channels. So before asking users what features they want, **reconstruct what happens now**, step by step.

**For each step record:** actor, trigger, action, inputs, output, friction, who has authority, and the evidence for the step.

| Step | Actor | Action | Friction | Authority |
|---|---|---|---|---|
| 1 | Customer | Opens ticket "where is my order?" | Waits ~6 h | n/a |
| 2 | Tier-1 agent | Looks up order in OMS, then carrier site | 3 tools, copy-paste | none |
| 3 | Tier-1 agent | Lost parcel? Asks team lead in Slack | Hidden state in Slack | Lead approves reship |
| 4 | Tier-1 agent | Sends macro reply | Macro often out of date | n/a |

**Evidence has strength.** Use a ladder and label every step:

1. **Observed:** screen recording, trace, system event.
2. **Artifact:** ticket, log, runbook, macro.
3. **Reported:** someone told you.
4. **Inferred:** the team thinks so.

Only the first two prove current behaviour. "Agents always check the carrier site" is reported until you see it in the logs; keep the label so confidence does not quietly inflate.

**Look for four things:**
- **Friction:** re-typing, waiting, switching tools, redoing work.
- **Hidden state:** facts that live in someone's head, a Slack thread or a personal spreadsheet. An AI system cannot use what it cannot see.
- **Authority:** who may make the consequential change (refund, reship, cancel). The AI must not quietly acquire it.
- **Exceptions:** the cases where the normal path breaks (address change mid-delivery, fraud flag). AI features usually fail at handoffs and exceptions because only the happy path was shaped.

**Keep the variants.** Two teams may handle the same ticket differently for good reasons (enterprise vs consumer, new vs veteran agents). Do not average them into one flow that nobody actually performs; record both until you know which is policy.

The map tells you where an LLM can help (reading three tools and drafting a reply), where it needs data you do not have yet (the Slack approvals), and where a human must stay in the loop (authority steps).`,
      example: `**Interviews said:** "We check the order, check the carrier, reply. Takes two minutes."

**Ticket logs and two hours of screen recordings showed:** median handling 9 minutes; 18% of tickets needed a team lead's approval in Slack, which is not linked to the ticket; and 7% involved an address change the OMS did not record. The first prototype plan (summarise OMS + carrier data) would have produced confident wrong answers for that 25%. The revised plan adds an approval-request step for reships and routes address-change cases straight to a human.`,
      prosCons: {
        pros: [
          'Reveals the data and approvals the AI will need before anyone writes a prompt.',
          'Finds the exception paths where most production failures will come from.',
          'Evidence labels keep the team honest about what it actually knows.',
        ],
        cons: [
          { con: 'Observation takes time and access to real users.', fix: 'Start from artifacts you already have (ticket logs, macros, audit events) and observe a handful of sessions; a few hours usually covers the main variants.' },
          { con: 'Recordings and logs contain personal data.', fix: 'Get consent, redact before sharing, and keep raw material in the same access-controlled store as the production data.' },
        ],
      },
      keyPoints: [
        'Reconstruct the current workflow before asking for features.',
        'Label evidence: observed, artifact, reported, inferred.',
        'Look for friction, hidden state, authority and exceptions.',
        'Keep workflow variants separate instead of averaging them.',
      ],
      exercise: {
        prompt: `Given workflow steps with an \`evidence\` field ('observed' | 'artifact' | 'reported' | 'inferred'), write \`evidenceReport(steps)\` returning the share of steps backed by direct evidence (observed or artifact, rounded to 2 decimals) and the list of step names that still need checking.`,
        starter: {
          language: 'typescript',
          code: `type Evidence = 'observed' | 'artifact' | 'reported' | 'inferred';
type Step = { name: string; evidence: Evidence };

export function evidenceReport(steps: Step[]): { directRatio: number; toVerify: string[] } {
  // TODO
  return { directRatio: 0, toVerify: [] };
}`,
        },
        hints: ['Direct = observed or artifact.', 'Guard against an empty list (ratio 0).'],
        solution: {
          language: 'typescript',
          code: `type Evidence = 'observed' | 'artifact' | 'reported' | 'inferred';
type Step = { name: string; evidence: Evidence };

export function evidenceReport(steps: Step[]): { directRatio: number; toVerify: string[] } {
  const direct = steps.filter((s) => s.evidence === 'observed' || s.evidence === 'artifact');
  const toVerify = steps.filter((s) => !direct.includes(s)).map((s) => s.name);
  const directRatio = steps.length ? Math.round((direct.length / steps.length) * 100) / 100 : 0;
  return { directRatio, toVerify };
}`,
        },
        explanation: 'The ratio is a quick health number for the map, and the list is the next research plan: each reported or inferred step needs a log query or an observation before it becomes a requirement.',
      },
      quickCheck: {
        question: 'A team lead says agents "always" escalate fraud-flagged orders. How should the step be labelled until you see it in logs?',
        options: ['Observed', 'Artifact', 'Reported', 'Out of scope'],
        correct: 2,
        explanation: 'A person describing their process is reported evidence. It may be right, but it is not proof of current behaviour until a log, ticket or observation confirms it.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 48; Nuseibeh and Easterbrook 2000',
      steps: {
        actors: [
          { id: 'cust', kind: 'user', label: 'Customer', sub: 'opens a ticket', x: 110, y: 70 },
          { id: 't1', kind: 'user', label: 'Tier-1 agent', sub: 'answers tickets', x: 340, y: 70 },
          { id: 'oms', kind: 'data', label: 'OMS', sub: 'order lookup', x: 570, y: 70 },
          { id: 'carrier', kind: 'tool', label: 'Carrier site', sub: 'tracking status', x: 800, y: 70 },
          { id: 'lead', kind: 'user', label: 'Team lead', sub: 'approves reships', x: 340, y: 230 },
          { id: 'slack', kind: 'data', label: 'Slack thread', sub: 'not linked to ticket', x: 570, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Reconstruct what happens now',
            lines: [
              'The customer opens a ticket and waits ~6 h.',
              'A tier-1 agent looks up the order in the OMS, then the carrier site.',
              'For each step record actor, action, friction, authority and evidence.',
            ],
            script: [
              { say: 0 },
              { send: ['cust', 't1'], label: 'where is my order?' },
              { badge: 'cust', text: 'waits ~6 h', tone: 'miss', ms: 1000 },
              { say: 1 },
              { send: ['t1', 'oms'], label: 'look up' },
              { send: ['t1', 'carrier'], label: 'copy-paste', curve: true },
              { say: 2 },
              { send: ['t1', 'cust'], label: 'macro reply' },
            ],
          },
          {
            kind: 'watch',
            title: 'What the logs showed',
            lines: [
              'Interviews said: "Takes two minutes." Logs and recordings: median **9 minutes**.',
              "18% of tickets needed a team lead's approval in Slack, not linked to the ticket.",
              '7% involved an address change the OMS did not record.',
            ],
            script: [
              { say: 0 },
              { badge: 't1', text: '9 min median', tone: 'miss', ms: 1200 },
              { say: 1 },
              { send: ['t1', 'slack'], label: 'reship?' },
              { send: ['slack', 'lead'], curve: true },
              { send: ['lead', 'slack'], label: 'approved', tone: 'ok', curve: true },
              { say: 2 },
              { badge: 'oms', text: 'no address change', tone: 'miss', ms: 1200 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: hidden state',
            lines: ['An AI system cannot use what it cannot see.'],
            task: {
              type: 'pick',
              question: 'Where does the hidden state behind the reship approvals live?',
              answer: 'slack',
              hints: {
                oms: 'The order system is a system of record tools can read; the approvals are not in it.',
                carrier: 'The carrier site holds tracking status, not approvals.',
                lead: 'The lead holds the authority; the record of the decision lives somewhere else.',
              },
            },
            solved: 'Facts that live in a Slack thread, a head or a spreadsheet are hidden state.',
            then: [{ badge: 'slack', text: 'hidden state', tone: 'err' }],
          },
          {
            kind: 'turn',
            title: 'Your turn: the evidence ladder',
            lines: ['Label every step so confidence does not quietly inflate.'],
            task: {
              type: 'order',
              question: 'Order the evidence from strongest to weakest.',
              items: ['Observed (recording, trace, event)', 'Artifact (ticket, log, macro)', 'Reported (someone told you)', 'Inferred (the team thinks so)'],
              hint: 'Only the first two prove current behaviour.',
            },
            solved: 'Observed → artifact → reported → inferred; only the first two prove what happens now.',
          },
          {
            kind: 'watch',
            title: 'The revised plan',
            lines: [
              'Summarising OMS + carrier data alone would be confidently wrong for that 25%.',
              'Add an **approval-request step** for reships: authority stays with the lead.',
              'Route address-change cases straight to a human.',
            ],
            script: [
              { say: 0 },
              { badge: 'oms', text: '25% blind spot', tone: 'err', ms: 1200 },
              { say: 1 },
              { send: ['t1', 'lead'], label: 'approval request', tone: 'ok' },
              { say: 2 },
              { lit: 't1' },
            ],
          },
        ],
      },
    },
    // ---------------------------------------------------------------- 3
    {
      heading: 'Assumptions and the risk register',
      body: `A roadmap hides uncertainty inside features. Turn the plan into the **bets** it depends on, and test the riskiest one first.

**Five classes of assumption:**

| Class | Question | Support-agent example |
|---|---|---|
| Value | Does the outcome matter enough? | Faster answers reduce repeat contacts and churn |
| Usability | Can people understand and act on it? | Customers accept an AI reply for order issues |
| Feasibility | Can the system produce it with the data and limits we have? | OMS + carrier API give the true status for 90%+ of orders |
| Viability | Can we afford and own it? | Cost per resolved ticket below the human cost; someone owns the KB |
| Safety | Can it fail without unacceptable harm? | It never promises a refund it cannot give |

**Write each as a falsifiable claim.** "Customers will like it" cannot fail. "In a replay of 300 past tickets, the draft resolution is judged correct for at least 80%" can.

**Score more than one dimension.** Rate each assumption 1–5 for:
- **Impact:** how bad if it is false;
- **Uncertainty:** how weak the current evidence is;
- **Irreversibility:** how costly it is to learn this after committing.

A simple score such as impact × uncertainty + irreversibility is enough. The formula is not the point; it forces the team to argue *why* one unknown comes before another, and it usually disagrees with the roadmap order (which ranks by excitement).

**Design an experiment, not a demo.** A real test has a claim that could be false, a realistic sample, an observable result, a **threshold set before the result**, and a decision for pass, fail and ambiguous. "We showed it to the VP and she liked it" proves only that the team can build a demo.

**Irreversible things go first.** Learn cheaply before you commit: an offline replay before a live integration, a human-approved suggestion before an automatic action, a read-only adapter before a data migration.

Keep the register as a living file next to the code. When an experiment runs, move the assumption from open to tested with a link to the evidence, and re-rank. The next slice should always target the top open risk.`,
      code: [
        {
          language: 'json',
          title: 'risk-register.json (excerpt)',
          code: `[
  { "id": "A1", "class": "feasibility", "claim": "OMS + carrier data give the correct status for >= 90% of WISMO tickets",
    "impact": 5, "uncertainty": 4, "irreversibility": 2, "status": "open" },
  { "id": "A2", "class": "safety", "claim": "Draft replies never promise refunds the policy does not allow (0 in 300 replays)",
    "impact": 5, "uncertainty": 3, "irreversibility": 4, "status": "open" },
  { "id": "A3", "class": "usability", "claim": "CSAT for AI-resolved tickets is within 0.2 of human-resolved",
    "impact": 3, "uncertainty": 4, "irreversibility": 1, "status": "open" }
]`,
        },
      ],
      example: `**Register for the support agent** (score = impact × uncertainty + irreversibility):

- A1 feasibility (status data is right): 5 × 4 + 2 = **22**
- A2 safety (no unauthorised refund promises): 5 × 3 + 4 = **19**
- A3 usability (CSAT parity): 4 × 4 + 1 = **17**
- A4 viability (cost per resolution < $1): 3 × 2 + 1 = **7**

The roadmap wanted to start with the chat UI (which tests A3). The register says test A1 first: a two-day offline check of 300 past tickets against OMS and carrier data. It found the carrier API missing scan events for one regional courier (12% of orders), so the team added a fallback rule before writing any UI.`,
      prosCons: {
        pros: [
          'Makes the bets explicit so the team spends effort where the uncertainty is.',
          'Pre-set thresholds stop the team from moving the goalposts after seeing results.',
          'Gives leadership a clear, honest picture of what is still unknown.',
        ],
        cons: [
          { con: 'Scores look precise but are judgement calls.', fix: 'Use them to order the discussion, not to decide alone; record the reasoning next to each score and revisit after each experiment.' },
          { con: 'Registers go stale once building starts.', fix: 'Keep it in the repo, link each experiment result to the assumption it tested, and review it at every stage gate.' },
        ],
      },
      keyPoints: [
        'Assumption classes: value, usability, feasibility, viability, safety.',
        'Write falsifiable claims with a sample and a threshold.',
        'Rank by impact, uncertainty and irreversibility; test the top open risk.',
        'Learn irreversible things early and cheaply (replay before integration).',
      ],
      exercise: {
        prompt: `Write \`nextRisk(register)\` that returns the id of the open assumption with the highest score (impact × uncertainty + irreversibility). Break ties by higher irreversibility. Return null when nothing is open.`,
        starter: {
          language: 'typescript',
          code: `type Assumption = { id: string; impact: number; uncertainty: number; irreversibility: number; status: 'open' | 'tested' };

export function nextRisk(register: Assumption[]): string | null {
  // TODO
  return null;
}`,
        },
        hints: ['Filter to status === "open" first.', 'Sort by score descending, then irreversibility descending.'],
        solution: {
          language: 'typescript',
          code: `type Assumption = { id: string; impact: number; uncertainty: number; irreversibility: number; status: 'open' | 'tested' };

const score = (a: Assumption) => a.impact * a.uncertainty + a.irreversibility;

export function nextRisk(register: Assumption[]): string | null {
  const open = register.filter((a) => a.status === 'open');
  open.sort((a, b) => score(b) - score(a) || b.irreversibility - a.irreversibility);
  return open[0]?.id ?? null;
}`,
        },
        explanation: 'Tested assumptions drop out, so the next experiment always targets what is still unknown. The tie-break prefers the bet that is costlier to learn later, which matches the "irreversible first" rule.',
      },
      quickCheck: {
        question: 'Which assumption is written so it can actually fail?',
        options: [
          'Users will find the assistant helpful',
          'In a replay of 300 past tickets, at least 80% of drafts are judged correct by two agents',
          'The model is smart enough for support',
          'The feature will improve customer experience',
        ],
        correct: 1,
        explanation: 'It names a sample, a method and a threshold, so a result can contradict it. The others have no observable failure condition.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 49; Boehm 1988 (spiral model)',
      steps: {
        actors: [
          { id: 'a1', kind: 'metric', label: 'A1 feasibility', sub: 'status data is right', x: 110, y: 70 },
          { id: 'a2', kind: 'metric', label: 'A2 safety', sub: 'no refund promises', x: 340, y: 70 },
          { id: 'a3', kind: 'metric', label: 'A3 usability', sub: 'CSAT parity', x: 570, y: 70 },
          { id: 'a4', kind: 'metric', label: 'A4 viability', sub: 'cost < $1', x: 800, y: 70 },
          { id: 'replay', kind: 'judge', label: 'Offline replay', sub: '300 past tickets', x: 110, y: 230 },
          { id: 'ui', kind: 'server', label: 'Chat UI', sub: 'roadmap wanted it', x: 570, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'A plan hides bets',
            lines: [
              'Five classes: value, usability, feasibility, viability, safety.',
              'Write each assumption as a **falsifiable** claim with a sample and a threshold.',
            ],
            script: [{ say: 0 }, { lit: 'a1' }, { lit: 'a2' }, { lit: 'a3' }, { lit: 'a4' }, { say: 1 }, { badge: 'a1', text: 'can fail', ms: 1200 }],
          },
          {
            kind: 'turn',
            title: 'Your turn: falsifiable?',
            lines: ['A real test has a claim that could turn out false.'],
            task: {
              type: 'choose',
              question: 'Which is a falsifiable claim?',
              options: [
                { text: 'In a replay of 300 past tickets, the draft is judged correct for at least 80%' },
                { text: 'Customers will like it', why: 'This cannot fail: no sample, no threshold.' },
                { text: 'We showed it to the VP and she liked it', why: 'That proves only that the team can build a demo.' },
              ],
              answer: 0,
            },
            solved: 'Falsifiable: a realistic sample, an observable result and a threshold set before the result.',
          },
          {
            kind: 'watch',
            title: 'Score each bet',
            lines: [
              'Score = impact × uncertainty + irreversibility.',
              'A1: 5 × 4 + 2 = **22**. A2: 5 × 3 + 4 = **19**.',
              'A3: 4 × 4 + 1 = **17**. A4: 3 × 2 + 1 = **7**.',
            ],
            script: [
              { say: 0 },
              { lit: 'a1' },
              { say: 1 },
              { badge: 'a1', text: '22', tone: 'err', ms: 1000 },
              { badge: 'a2', text: '19', tone: 'miss', ms: 1000 },
              { say: 2 },
              { badge: 'a3', text: '17', tone: 'miss', ms: 1000 },
              { badge: 'a4', text: '7', ms: 1000 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: test what first?',
            lines: ['The roadmap ranks by excitement; the register ranks by risk.'],
            task: {
              type: 'pick',
              question: 'Which assumption should the next slice test first?',
              answer: 'a1',
              hints: {
                a3: 'The roadmap wanted the chat UI, which tests A3 (score 17), not the top risk.',
                ui: 'The chat UI tests A3, not the top open risk.',
                a2: 'A2 scores 19, second to A1.',
                a4: 'A4 scores 7, the lowest.',
              },
            },
            solved: 'Test the top open risk first: A1, score 22.',
            then: [{ send: ['a1', 'replay'], label: 'test A1', tone: 'ok' }],
          },
          {
            kind: 'watch',
            title: 'Learn cheaply first',
            lines: [
              'A two-day offline check of 300 past tickets against OMS and carrier data.',
              'It found the carrier API missing scan events for one regional courier: 12% of orders.',
              'The team added a fallback rule **before** writing any UI.',
            ],
            script: [
              { say: 0 },
              { send: ['a1', 'replay'], label: 'test A1' },
              { lit: 'replay' },
              { say: 1 },
              { badge: 'replay', text: '12% missing', tone: 'err', ms: 1400 },
              { say: 2 },
              { down: 'ui' },
              { badge: 'a1', text: 'fallback rule', tone: 'ok', ms: 1200 },
            ],
          },
        ],
      },
    },
    // ---------------------------------------------------------------- 4
    {
      heading: 'The smallest testable slice',
      body: `Small is only useful if it proves something. A tiny build that cannot change the next decision is just unfinished.

**Define the required proof first.** Take the top open assumptions from the register; a candidate slice is *eligible* only if it produces evidence on all of them. Then compare eligible slices on value, uncertainty removed, effort, consequence if it goes wrong, and reversibility.

**Vertical, not horizontal.** A good slice crosses the real workflow end to end (real data in, a decision or draft out, a human or metric judging it) while staying narrow in users, ticket types, duration and authority. It must **not** be narrowed by cutting out the risky part.

| Candidate | Proves | Verdict |
|---|---|---|
| Polished chat UI on 20 hand-written FAQs | usability only, on fake data | false minimum |
| Ingest all 40k help articles into a vector DB | infrastructure works | false minimum |
| Agent that auto-refunds in production | everything, at once, with real money | too much consequence |
| Read-only drafts for "where is my order?" tickets, replayed on 300 real past tickets, then shown to 5 agents as suggestions | feasibility, safety, quality, agent trust | **pick this** |

**Common false minimums:**
- **UI-only:** looks done, skips data and operations risk.
- **Infra-only:** proves technology, not value.
- **Happy-path-only:** leaves out the exception that causes most harm.
- **Demo-only:** a persuasive artifact with no repeatable measurement.
- **Platform-first:** builds reusable machinery before one workflow has earned it.

**Narrow authority before you narrow scope.** Read-only, suggest-don't-send, and human-approved actions let you test on real data with little consequence. Autonomy comes later, per action type, when the evidence supports it.

**Write a stop rule before building.** If the slice fails, what happens? Abandon the outcome, change the user or situation, try a different mechanism, collect better data, or narrow authority further. If every possible result leads to "keep building", the slice is not an experiment.

A slice spec fits on half a page: the outcome it serves, the assumptions it tests, scope (users, ticket types, data), authority, metrics with thresholds, duration, and the stop rule.`,
      example: `**Slice:** "Where is my order?" tickets only, English, one region. The agent reads OMS and carrier data and drafts a reply; a human agent sends, edits or discards it. No refunds, no cancellations.

**Required proof:** A1 (status data is right), A2 (no unauthorised promises), A5 (agents trust drafts enough to use them).

**Thresholds set in advance:** replay correctness ≥ 85% on 300 tickets; 0 policy violations; in a 2-week shadow with 5 agents, ≥ 50% of drafts sent with no or light edits.

**Stop rule:** correctness < 70% or any refund promise in replay → stop and fix data access before any live traffic.

**Result:** 88% correct, 0 violations; 61% sent with light edits. Next slice: add the "lost parcel" type with a reship-approval request.`,
      prosCons: {
        pros: [
          'Produces decisive evidence for weeks of work instead of quarters.',
          'Keeps real money, real customers and real authority out of the loop until they are earned.',
          'A stop rule makes it acceptable to kill an idea early.',
        ],
        cons: [
          { con: 'Leadership may see a narrow slice as unambitious.', fix: 'Show the slice as step one of a staged plan with dates and the evidence that unlocks each next step.' },
          { con: 'A slice that is too narrow may not generalise.', fix: 'Choose the slice to include the hardest representative case (an exception path), and plan the next slice to test the biggest remaining difference.' },
        ],
      },
      keyPoints: [
        'Eligible slices cover all required proof; then pick the cheapest and safest.',
        'Vertical through the real workflow, narrow in users, data and authority.',
        'Avoid UI-only, infra-only, happy-path, demo and platform-first minimums.',
        'Write the stop rule before you build.',
      ],
      exercise: {
        prompt: `Write \`pickSlice(required, candidates)\`. Each candidate has \`proves: string[]\`, \`effort\` (1–5) and \`consequence\` (1–5). Return the name of the eligible candidate (covers every required id) with the lowest effort + consequence, or null if none is eligible.`,
        starter: {
          language: 'typescript',
          code: `type Candidate = { name: string; proves: string[]; effort: number; consequence: number };

export function pickSlice(required: string[], candidates: Candidate[]): string | null {
  // TODO
  return null;
}`,
        },
        hints: ['Eligibility is a gate, not part of the score.', 'Use every() over the required ids.'],
        solution: {
          language: 'typescript',
          code: `type Candidate = { name: string; proves: string[]; effort: number; consequence: number };

export function pickSlice(required: string[], candidates: Candidate[]): string | null {
  const eligible = candidates.filter((c) => required.every((r) => c.proves.includes(r)));
  eligible.sort((a, b) => a.effort + a.consequence - (b.effort + b.consequence));
  return eligible[0]?.name ?? null;
}`,
        },
        explanation: 'A cheap slice that skips one required assumption is rejected no matter how good its score looks. That is the whole lesson: the gate matters more than the arithmetic.',
      },
      quickCheck: {
        question: 'Which is a "happy-path minimum"?',
        options: [
          'A replay on 300 real tickets including lost parcels and address changes',
          'A slice that handles only orders with a clean carrier status and skips every exception',
          'A slice limited to one region',
          'A slice where humans approve every reply',
        ],
        correct: 1,
        explanation: 'Narrowing by region or by authority is fine. Removing every exception removes the cases where most failures and harm come from, so the slice cannot answer the real question.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 50; Boehm 1988',
      steps: {
        actors: [
          { id: 'data', kind: 'data', label: 'Real tickets', sub: 'where is my order?', x: 110, y: 70 },
          { id: 'agent', kind: 'agent', label: 'Draft agent', sub: 'reads OMS + carrier', x: 340, y: 70 },
          { id: 'human', kind: 'user', label: 'Human agent', sub: 'send · edit · discard', x: 570, y: 70 },
          { id: 'cust', kind: 'user', label: 'Customer', sub: 'English, one region', x: 800, y: 70 },
          { id: 'thr', kind: 'judge', label: 'Thresholds', sub: 'set in advance', x: 340, y: 230 },
          { id: 'stop', kind: 'guard', label: 'Stop rule', sub: 'written before build', x: 570, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Vertical, not horizontal',
            lines: [
              'A good slice crosses the real workflow: real data in, a draft out, a human judging it.',
              'It stays narrow in users, ticket types and authority.',
              'No refunds, no cancellations: the human sends, edits or discards.',
            ],
            script: [
              { say: 0 },
              { send: ['data', 'agent'], label: 'real data' },
              { send: ['agent', 'human'], label: 'draft' },
              { say: 1 },
              { badge: 'cust', text: 'one region', ms: 1000 },
              { say: 2 },
              { lit: 'human' },
              { send: ['human', 'cust'], label: 'sent', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: pick the slice',
            lines: ['An eligible slice produces evidence on every top open assumption.'],
            task: {
              type: 'choose',
              question: 'Which candidate is the right first slice?',
              options: [
                { text: 'Read-only drafts for "where is my order?", replayed on 300 real tickets, then shown to 5 agents' },
                {
                  text: 'A polished chat UI on 20 hand-written FAQs',
                  why: 'UI-only on fake data: it tests usability and skips data and operations risk.',
                },
                { text: 'Ingest all 40k help articles into a vector DB', why: 'Infra-only: it proves technology, not value.' },
                { text: 'An agent that auto-refunds in production', why: 'It tests everything at once, with real money: too much consequence.' },
              ],
              answer: 0,
            },
            solved: 'Pick the slice that proves feasibility, safety, quality and trust with little consequence.',
            then: [{ send: ['data', 'agent'], label: '300 tickets' }, { send: ['agent', 'human'], label: 'suggestion', tone: 'ok' }],
          },
          {
            kind: 'watch',
            title: 'Thresholds and a stop rule, first',
            lines: [
              'Replay correctness ≥ 85% on 300 tickets, and 0 policy violations.',
              'In a 2-week shadow with 5 agents, ≥ 50% of drafts sent with no or light edits.',
              'Stop rule: correctness < 70% or any refund promise → fix data access first.',
            ],
            script: [
              { say: 0 },
              { lit: 'thr' },
              { badge: 'thr', text: '≥ 85% · 0 viol.', ms: 1200 },
              { say: 1 },
              { send: ['human', 'thr'], label: 'sent rate', curve: true },
              { say: 2 },
              { lit: 'stop' },
              { badge: 'stop', text: '< 70% → stop', tone: 'err', ms: 1200 },
            ],
          },
          {
            kind: 'watch',
            title: 'The result',
            lines: ['**88%** correct, 0 violations.', '61% of drafts sent with light edits.'],
            script: [
              { say: 0 },
              { send: ['agent', 'thr'], label: 'replay', curve: true },
              { badge: 'thr', text: '88% · 0 viol.', tone: 'ok', ms: 1200 },
              { say: 1 },
              { badge: 'human', text: '61% sent', tone: 'ok', ms: 1200 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: what next?',
            lines: ['Every threshold passed and the stop rule did not trigger.'],
            task: {
              type: 'choose',
              question: 'What is the next step?',
              options: [
                { text: 'Next slice: add the "lost parcel" type with a reship-approval request' },
                { text: 'Stop and fix data access', why: 'The stop rule triggers only below 70% or on a refund promise.' },
                { text: 'Let the agent issue refunds automatically', why: 'Autonomy comes later, per action type, when the evidence supports it.' },
              ],
              answer: 0,
            },
            solved: 'Grow one narrow slice at a time; authority widens only with evidence.',
          },
        ],
      },
    },
    // ---------------------------------------------------------------- 5
    {
      heading: 'Success metrics: offline and online',
      short: {
        id: 'pilot-pass-rules-decided-first',
        title: 'Decide pass or fail before you measure',
        beats: [
          {
            type: 'claims',
            kicker: 'Order-status tickets · rules written in advance',
            head: 'Did the pilot *pass*?',
            claims: [
              {
                text: 'Correctness ≥ 0.85',
                ok: true,
                note: '0.88 on a 300-ticket replay',
              },
              {
                text: '0 guardrail breaches',
                ok: true,
                note: '0 refund promises',
              },
              {
                text: 'Cost per resolution ≤ $0.80',
                ok: true,
                note: '≈ $0.80',
              },
            ],
            sub: 'Pass on every pre-set rule: **expand to 20 agents**.',
          },
          {
            type: 'flow',
            kicker: 'Goal → Question → Metric',
            head: 'Start from the *decision*',
            steps: [
              'Goal: resolve order-status tickets faster',
              'Questions that tell you it is met',
              'The fewest metrics that answer them',
              'Each with direction, threshold, window and source',
            ],
          },
          {
            type: 'counter',
            kicker: 'Online pilot · 2 weeks · 5 agents',
            value: 61,
            suffix: '%',
            unit: 'of 1,140 eligible tickets: draft sent',
            stats: [
              {
                value: '9 → 4',
                label: 'median handling, minutes',
              },
              {
                value: '6.1%',
                label: 'reopen rate vs 5.8% (noise)',
              },
            ],
          },
          {
            type: 'ladder',
            kicker: 'Cost per resolved ticket',
            head: 'Count the *human review* too',
            rungs: [
              {
                label: 'Fully manual reply',
                amount: 4.5,
              },
              {
                label: 'AI draft + 1.5 min review at $0.50/min',
                amount: 0.8,
              },
            ],
            unit: '$ per ticket',
          },
          {
            type: 'quiz',
            kicker: 'Your turn',
            head: 'Handling time fell 50% in the pilot, but tier-2 escalations doubled. What caught it?',
            answer: 1,
            options: [
              {
                text: 'An outcome metric',
                why: 'The outcome metric, handling time, looked great; it hid the problem.',
              },
              {
                text: 'A counter-metric',
                why: 'It watches for cost pushed elsewhere: the work moved from tier 1 to tier 2.',
              },
              {
                text: 'An offline eval',
                why: 'Escalations are a real workflow effect only online signals show.',
              },
            ],
          },
        ],
        takeaway: {
          head: 'Decide *before* you measure.',
          sub: 'Write pass, fail and ambiguous rules first, or the threshold drifts to **protect the build**.',
        },
      },
      body: `Metrics should answer a decision, not fill a dashboard. Use **Goal → Question → Metric** (GQM, from Basili and colleagues): start from the goal, ask the questions that would tell you it is met, then pick the fewest metrics that answer them.

**Goal:** resolve order-status tickets faster without unsafe actions or unhappy customers.

**For an AI feature, cover five families:**

| Family | Example metric |
|---|---|
| Task success | % of tickets resolved without reopening in 7 days |
| Quality bar | % of replies judged correct and on-policy (rubric, sampled) |
| Cost and latency | cost per *resolved* ticket (model + tools + human review time); p95 time to first reply |
| Adoption | % of eligible tickets where agents send the draft; % of customers who accept the AI answer |
| Guardrails | refund promises outside policy (target 0); PII leaks (target 0) |

Add a **counter-metric** for cost shifted elsewhere: if handling time falls but escalations to tier 2 double, the work just moved.

**Give every metric a contract:** name, direction (at least / at most), threshold, window, data source, population, and kind (outcome or guardrail). Without a source and a window nobody can reproduce the number; without a threshold it cannot drive a decision.

**Offline vs online.**
- **Offline:** a golden set or replay of real past cases, scored by rules, references or an LLM judge calibrated against human labels. Repeatable, cheap, safe; good for regressions and edge cases. It cannot show trust, adoption or real workflow effects.
- **Online:** shadow mode, a pilot cohort, or an A/B test, with signals such as edit distance, send rate, escalations, reopen rate and CSAT. Real, but noisy, slower and with real consequences.

Use the cheapest evidence that answers the current question: offline first, then online. Do not expose real users just because the code is ready.

**Decide before you measure.** Write pass, fail and ambiguous rules in advance:
- pass: correctness ≥ 0.85, 0 guardrail breaches, cost per resolution ≤ $0.80;
- fail: any guardrail breach, or correctness < 0.70;
- ambiguous: improvement within noise → enlarge the sample, do not ship.

Otherwise the threshold will drift to protect the build.`,
      code: [
        {
          language: 'json',
          title: 'metric contract',
          code: `{
  "name": "resolved_without_reopen_7d",
  "kind": "outcome",
  "direction": "at_least",
  "threshold": 0.6,
  "window": "pilot weeks 1-2",
  "source": "ticketing events (resolved, reopened)",
  "population": "WISMO tickets, EN, EU region, pilot agents"
}`,
        },
      ],
      example: `**Offline (replay of 300 past tickets):** correctness 0.88 (LLM judge agreed with human labels on 92% of a 100-ticket calibration set), 0 refund promises, mean cost $0.03 per draft.

**Online (2-week pilot, 5 agents, 1,140 eligible tickets):** drafts sent on 61%, median handling 9 → 4 minutes, reopen rate 6.1% vs 5.8% baseline (within noise), tier-2 escalations unchanged. Including 1.5 minutes of agent review at $0.50/min, cost per resolved ticket ≈ $0.80 against about $4.50 for a fully manual reply.

**Decision:** pass on every pre-set rule → expand the pilot to 20 agents.`,
      prosCons: {
        pros: [
          'Metrics tied to questions avoid vanity numbers (messages sent, tokens used).',
          'Guardrails and counter-metrics stop a fast but harmful result from looking like success.',
          'Pre-registered thresholds make go / no-go decisions quick and defensible.',
        ],
        cons: [
          { con: 'LLM-judge scores can drift from what humans think is correct.', fix: 'Calibrate the judge on a human-labelled set, report agreement, and re-check it whenever the prompt or judge model changes.' },
          { con: 'Online metrics are noisy with small pilots.', fix: 'Estimate the sample needed before starting, report confidence intervals, and treat results inside the noise as ambiguous rather than a win.' },
        ],
      },
      keyPoints: [
        'Goal → Question → Metric; keep only metrics that can change a decision.',
        'Cover task success, quality, cost and latency per task, adoption and guardrails, plus a counter-metric.',
        'Each metric: direction, threshold, window, source, population, kind.',
        'Offline first for repeatability, online for real behaviour; decide pass/fail/ambiguous in advance.',
      ],
      exercise: {
        prompt: `Write \`decide(metrics, values)\`. Each metric has \`name\`, \`kind\` ('outcome' | 'guardrail'), \`direction\` ('at_least' | 'at_most') and \`threshold\`. Return 'fail' if any guardrail misses or is missing a value, 'pass' if every outcome metric meets its threshold, otherwise 'ambiguous'. Thresholds are inclusive.`,
        starter: {
          language: 'typescript',
          code: `type Metric = { name: string; kind: 'outcome' | 'guardrail'; direction: 'at_least' | 'at_most'; threshold: number };

export function decide(metrics: Metric[], values: Record<string, number | undefined>): 'pass' | 'fail' | 'ambiguous' {
  // TODO
  return 'ambiguous';
}`,
        },
        hints: ['Write a helper meets(m, v) that handles undefined as not met.', 'Check guardrails before outcomes.'],
        solution: {
          language: 'typescript',
          code: `type Metric = { name: string; kind: 'outcome' | 'guardrail'; direction: 'at_least' | 'at_most'; threshold: number };

const meets = (m: Metric, v: number | undefined) =>
  v !== undefined && (m.direction === 'at_least' ? v >= m.threshold : v <= m.threshold);

export function decide(metrics: Metric[], values: Record<string, number | undefined>): 'pass' | 'fail' | 'ambiguous' {
  if (metrics.some((m) => m.kind === 'guardrail' && !meets(m, values[m.name]))) return 'fail';
  return metrics.filter((m) => m.kind === 'outcome').every((m) => meets(m, values[m.name])) ? 'pass' : 'ambiguous';
}`,
        },
        explanation: 'A missing guardrail value is treated as a breach: if you did not measure safety, you cannot claim it held. Outcome misses are ambiguous rather than fail here; a real plan can add explicit fail thresholds for outcomes too.',
      },
      quickCheck: {
        question: 'Handling time fell 50% in the pilot, but tier-2 escalations doubled. What kind of metric caught the problem?',
        options: ['An outcome metric', 'A counter-metric', 'An offline eval', 'A vanity metric'],
        correct: 1,
        explanation: 'A counter-metric watches for cost or harm pushed onto another part of the system. Here the work moved from tier 1 to tier 2 instead of disappearing.',
      },
      source: 'Basili, Caldiera and Rombach 1994 (GQM); ai-engineering-from-scratch Phase 14 · 52',
      steps: {
        actors: [
          { id: 'goal', kind: 'document', label: 'Goal', sub: 'faster, safe, happy', x: 110, y: 70 },
          { id: 'q', kind: 'document', label: 'Questions', sub: 'is the goal met?', x: 340, y: 70 },
          { id: 'm', kind: 'metric', label: 'Metrics', sub: 'fewest that answer', x: 570, y: 70 },
          { id: 'off', kind: 'judge', label: 'Offline replay', sub: '300 past tickets', x: 340, y: 230 },
          { id: 'on', kind: 'user', label: 'Online pilot', sub: '5 agents, 2 weeks', x: 570, y: 230 },
          { id: 'dec', kind: 'guard', label: 'Decision', sub: 'pass/fail/ambiguous', x: 800, y: 150 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Goal → Question → Metric',
            lines: [
              'Start from the goal: resolve order-status tickets faster, safely, with happy customers.',
              'Ask the questions that would tell you it is met.',
              'Pick the fewest metrics that answer them, each with a threshold, window and source.',
            ],
            script: [
              { say: 0 },
              { lit: 'goal' },
              { say: 1 },
              { send: ['goal', 'q'] },
              { say: 2 },
              { send: ['q', 'm'] },
              { badge: 'm', text: 'threshold set', ms: 1200 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: where did the work go?',
            lines: ['Handling time fell, but escalations to tier 2 doubled.'],
            task: {
              type: 'choose',
              question: 'What does this tell you?',
              options: [
                { text: 'The work just moved; a counter-metric caught it' },
                {
                  text: 'The feature is a success: handling time fell',
                  why: 'Cost shifted elsewhere is not a win; that is what a counter-metric is for.',
                },
              ],
              answer: 0,
            },
            solved: 'Pair every speed or cost metric with a counter-metric for work shifted elsewhere.',
          },
          {
            kind: 'watch',
            title: 'Offline first, then online',
            lines: [
              'Offline replay: correctness 0.88, 0 refund promises, $0.03 per draft.',
              'The LLM judge agreed with human labels on 92% of a 100-ticket calibration set.',
              'Online pilot: drafts sent on 61%; median handling 9 → 4 minutes.',
            ],
            script: [
              { say: 0 },
              { send: ['m', 'off'], curve: true },
              { badge: 'off', text: '0.88', tone: 'ok', ms: 1000 },
              { say: 1 },
              { badge: 'off', text: 'judge 92% agree', ms: 1200 },
              { say: 2 },
              { send: ['off', 'on'] },
              { badge: 'on', text: '9 → 4 min', tone: 'ok', ms: 1200 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: within noise',
            lines: ['Pass, fail and ambiguous rules were written before measuring.'],
            task: {
              type: 'choose',
              question: 'The improvement is within noise. What do the pre-set rules say?',
              options: [
                { text: 'Ambiguous: enlarge the sample, do not ship' },
                { text: 'Ship it: nothing got worse', why: 'Ambiguous is not pass.' },
                { text: 'Lower the threshold so it passes', why: 'That is the threshold drifting to protect the build.' },
              ],
              answer: 0,
            },
            solved: 'Decide pass, fail and ambiguous in advance, or the threshold drifts to protect the build.',
          },
          {
            kind: 'watch',
            title: 'The decision',
            lines: [
              'Pass rules: correctness ≥ 0.85, 0 guardrail breaches, cost per resolution ≤ $0.80.',
              'Cost per resolved ticket ≈ $0.80, against about $4.50 for a manual reply.',
              'Pass on every pre-set rule → expand the pilot to 20 agents.',
            ],
            script: [
              { say: 0 },
              { send: ['off', 'dec'], curve: true },
              { send: ['on', 'dec'] },
              { say: 1 },
              { badge: 'on', text: '≈ $0.80', tone: 'ok', ms: 1200 },
              { say: 2 },
              { badge: 'dec', text: 'pass', tone: 'ok', ms: 1400 },
            ],
          },
        ],
      },
    },
    // ---------------------------------------------------------------- 6
    {
      heading: 'Prototype, pilot, production: stage gates',
      body: `Prototype, pilot and production are not levels of polish. They are different **learning environments**, each answering a different question with a different amount of consequence.

| Stage | Question | Typical setup |
|---|---|---|
| Prototype | Can this mechanism produce the evidence at all? | Offline, replayed or synthetic data, no real users, throwaway code |
| Pilot | Does it work safely with a bounded real audience in real conditions? | Named cohort, real data, limited authority and duration |
| Production | Can we own it continuously at the promised reliability, cost and risk? | All eligible users, on-call, SLOs, budgets |

**Prototype.** Use it when the unknown does not need real users. Keep it isolated, narrow and disposable; do not tune architecture before the mechanism has earned the next stage.

**Pilot.** Needed when the question depends on real behaviour or real data, but the risk or readiness is not yet fit for everyone. A pilot needs:
- a named audience and a named owner;
- bounded duration and authority (suggest-only, approval-required, low limits);
- audit logs, a kill switch and a rollback path;
- outcome and guardrail thresholds;
- exit criteria for **expand**, **revise** or **stop**.

**Production.** Shipping the code is not the gate; accepting ongoing responsibility is. Before calling it production, have:
- an SLO and alerting, with on-call and incident ownership;
- security and privacy review (data flows, prompt injection, PII);
- cost and capacity controls (per-request and monthly budgets, rate limits);
- monitoring of quality, not just uptime (sampled evals on live traffic);
- rollback (feature flag, previous prompt and model versions pinned) and a retirement plan.

**Watch for stage drift.** The dangerous moment is when a prototype quietly gets real users, real data or real authority without getting an owner. Make the stage visible *in the system*: a stage flag in config, separate credentials, access limited to the cohort, telemetry tagged by stage. A "beta" banner is not a control.

**Gate reviews are short.** At each gate, bring the risk register, the metric results against the pre-set thresholds, the incidents, and a recommendation: expand, revise or stop. Write the decision and its owner down.`,
      code: [
        {
          language: 'yaml',
          title: 'stage config (pilot)',
          code: `feature: support-drafts
stage: pilot
owner: support-eng@example.com
cohort: [agent_group: "eu-tier1-pilot"]
authority: suggest_only        # agent drafts, human sends
max_refund_usd: 0
kill_switch: flags/support-drafts.enabled
ends: 2026-12-15
exit:
  expand: "correctness >= 0.85 and policy_violations == 0 and send_rate >= 0.5"
  stop: "policy_violations > 0 or correctness < 0.70"`,
        },
      ],
      example: `**Prototype (week 1–2):** replay of 300 tickets → 88% correct, 0 violations. Gate: pass, move to pilot.

**Pilot (week 3–6):** 5 then 20 agents, suggest-only. Week 4 incident: a draft quoted a delivery date from a stale carrier event. Fix: freshness check on carrier data + an eval case. Gate: pass after the fix held for 2 weeks.

**Production (week 7+):** all EU tier-1 agents; then customer-facing auto-replies for status-only tickets, with refunds still human-approved. Added before the switch: p95 latency SLO 8 s, $1,500/month budget alert, weekly sampled quality eval of 100 live tickets, on-call rota in the support-eng team.`,
      prosCons: {
        pros: [
          'Each stage risks only what its question needs.',
          'Explicit exit criteria make expand / stop decisions fast and less political.',
          'Stage flags and separate credentials stop prototypes from becoming production by accident.',
        ],
        cons: [
          { con: 'Gates can feel like bureaucracy and slow teams down.', fix: 'Keep the gate to a short written review with pre-set thresholds; most decisions should be obvious from the numbers.' },
          { con: 'Pilots drag on with no decision.', fix: 'Give every pilot an end date in config and require an expand / revise / stop decision on that date.' },
        ],
      },
      keyPoints: [
        'Prototype: can it work? Pilot: does it work safely for a bounded audience? Production: can we own it?',
        'Pilots need an owner, cohort, limited authority, kill switch, thresholds and exit criteria.',
        'Production means SLOs, on-call, security review, budgets, quality monitoring and rollback.',
        'Make the stage visible in config and access control to prevent stage drift.',
      ],
      exercise: {
        prompt: `Write \`chooseStage(q)\` where \`q\` has \`needsRealUsers\`, \`consequenceBounded\` and \`opsReady\` (booleans). Return 'prototype' when real users are not needed, 'production' only when consequence is bounded and operations are ready, otherwise 'pilot'. Also return the list of missing production controls from \`have: string[]\`, given the required set ['slo', 'on_call', 'security_review', 'budget', 'rollback', 'quality_monitoring'].`,
        starter: {
          language: 'typescript',
          code: `type Q = { needsRealUsers: boolean; consequenceBounded: boolean; opsReady: boolean };

export function chooseStage(q: Q, have: string[]) {
  // TODO: return { stage, missing }
}`,
        },
        hints: ['The order of the checks matters: real users first.', 'missing = required minus have.'],
        solution: {
          language: 'typescript',
          code: `type Q = { needsRealUsers: boolean; consequenceBounded: boolean; opsReady: boolean };
const REQUIRED = ['slo', 'on_call', 'security_review', 'budget', 'rollback', 'quality_monitoring'];

export function chooseStage(q: Q, have: string[]) {
  const missing = REQUIRED.filter((c) => !have.includes(c));
  const stage = !q.needsRealUsers
    ? 'prototype'
    : q.consequenceBounded && q.opsReady && missing.length === 0
      ? 'production'
      : 'pilot';
  return { stage, missing };
}`,
        },
        explanation: 'Operational readiness is checked against concrete controls, not a feeling. A team that says it is ready but has no rollback or on-call stays in pilot, and the missing list is its to-do list.',
      },
      quickCheck: {
        question: 'A prototype has been shared with 200 customers "as a beta" and uses production credentials. What is the main problem?',
        options: [
          'The UI is not polished enough',
          'Stage drift: it has real users, data and authority but no owner, limits or rollback',
          'It should have been fine-tuned first',
          'Betas should have at least 1,000 users',
        ],
        correct: 1,
        explanation: 'It has acquired production-level consequence without production-level ownership and controls. Either cut it back to a bounded pilot with an owner, limits and a kill switch, or do the production work.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 53; Fagerholm et al. 2014',
      steps: {
        actors: [
          { id: 'proto', kind: 'server', label: 'Prototype', sub: 'offline, no users', x: 110, y: 70 },
          { id: 'pilot', kind: 'user', label: 'Pilot', sub: 'named cohort', x: 455, y: 70 },
          { id: 'prod', kind: 'server', label: 'Production', sub: 'all eligible users', x: 800, y: 70 },
          { id: 'gate', kind: 'judge', label: 'Gate review', sub: 'expand·revise·stop', x: 280, y: 230 },
          { id: 'flag', kind: 'guard', label: 'Stage flag', sub: 'config + access', x: 630, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Three learning environments',
            lines: [
              '**Prototype**: can this mechanism produce the evidence at all?',
              '**Pilot**: does it work safely for a bounded, real audience?',
              '**Production**: can we own it continuously?',
            ],
            script: [
              { say: 0 },
              { lit: 'proto' },
              { say: 1 },
              { send: ['proto', 'gate'] },
              { send: ['gate', 'pilot'], tone: 'ok' },
              { say: 2 },
              { send: ['pilot', 'prod'], tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the support-agent timeline',
            lines: ['Each stage adds consequence only after the last gate passed.'],
            task: {
              type: 'order',
              question: 'Put the stages of the support agent in order.',
              items: [
                'Replay 300 tickets offline',
                'Suggest-only pilot with 5, then 20 agents',
                'All EU tier-1 agents',
                'Auto-replies for status-only tickets',
              ],
              hint: 'No real users first; customers see auto-replies last.',
            },
            solved: 'Offline replay → suggest-only pilot → all EU tier-1 agents → status-only auto-replies.',
          },
          {
            kind: 'watch',
            title: 'A pilot incident',
            lines: [
              'Week 4: a draft quoted a delivery date from a stale carrier event.',
              'Fix: a freshness check on carrier data plus an eval case.',
              'The gate passed only after the fix held for 2 weeks.',
            ],
            script: [
              { say: 0 },
              { badge: 'pilot', text: 'stale date', tone: 'err', ms: 1200 },
              { say: 1 },
              { badge: 'pilot', text: 'freshness check', tone: 'ok', ms: 1200 },
              { say: 2 },
              { send: ['pilot', 'gate'], label: 'results' },
              { badge: 'gate', text: 'pass', tone: 'ok', ms: 1200 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: stage drift',
            lines: ['A prototype quietly got real users, real data and real authority, but no owner.'],
            task: {
              type: 'choose',
              question: 'What makes the stage a real control?',
              options: [
                { text: 'A stage flag in config, separate credentials, cohort-only access, stage-tagged telemetry' },
                { text: 'A "beta" banner in the UI', why: 'A banner is not a control.' },
                { text: 'More polish before launch', why: 'Stages are learning environments, not levels of polish.' },
              ],
              answer: 0,
            },
            solved: 'Make the stage visible in the system: config, credentials, access and telemetry.',
            then: [{ lit: 'flag' }, { send: ['flag', 'pilot'], label: 'cohort only', tone: 'ok' }],
          },
          {
            kind: 'watch',
            title: 'Production means owning it',
            lines: [
              'Accepting ongoing responsibility is the gate, not shipping the code.',
              'Added before the switch: p95 latency SLO 8 s, a $1,500/month budget alert.',
              'A weekly sampled eval of 100 live tickets and an on-call rota; refunds stay human-approved.',
            ],
            script: [
              { say: 0 },
              { send: ['pilot', 'gate'], curve: true },
              { send: ['gate', 'prod'], label: 'expand', tone: 'ok', curve: true },
              { say: 1 },
              { badge: 'prod', text: 'SLO p95 8 s', ms: 1200 },
              { say: 2 },
              { badge: 'prod', text: 'on-call', tone: 'ok', ms: 1200 },
            ],
          },
        ],
      },
    },
    // ---------------------------------------------------------------- 7
    {
      heading: 'The feedback ratchet',
      body: `Launching closes the build loop and opens the learning loop. Traces, complaints, escalations and incidents pile up quickly; the question is whether they **change the system**. A ratchet turns each failure into a durable, owned change so the same failure becomes less likely, and the system only moves one way: forward.

**The loop:**
1. Capture a concrete signal (a bad answer, an escalation, a timeout, an agent's edit).
2. Link it to an outcome, constraint or assumption.
3. Find the **earliest layer** that owns the cause.
4. Make a bounded change there.
5. Verify the failure no longer happens (and that nothing else broke).
6. Review later whether the control should stay.

**Route each signal to its owning layer:**

| Signal | Goes to |
|---|---|
| Wrong or regressed answer | **Eval case** in the golden set (it must fail before the fix and pass after) |
| Missing or stale fact | Context source, retrieval or data freshness check |
| Unsafe action, authority gap | Permission, policy or approval step |
| Timeout, retry storm, provider outage | Runtime: timeouts, fallbacks, circuit breakers |
| New need or a trade-off nobody owns | Shaped backlog item with an owner |

Fix the cause at the earliest effective layer. Adding another paragraph to the prompt is the weakest fix; a test, a data check or a permission can make the failure impossible.

**Every failure becomes an eval case.** This is the core habit. Production failures are the best test data you will ever get because they are real and they already happened. Add each one (redacted) to the regression set, so every prompt, model or retrieval change is checked against it before release. Over months the set becomes a map of how your system actually fails.

**Each ratchet action needs:** one owner, a priority from severity and frequency, the artifact to change, the check that proves it, and a review date.

**Retire controls with evidence.** Rules pile up and start contradicting each other or blocking real work. Review a control when the architecture changes, when a lower-level fix (a permission) replaces a higher-level one (a prompt rule), when its failure has not appeared for the chosen window, or when it blocks more legitimate work than it prevents harm. Do not delete it just because it feels old.`,
      example: `**Week 5 of production, 3 signals:**

1. A customer was told a parcel was "delivered" when the carrier had marked it "delivery attempted". → **Eval case** (failing first), plus a status-mapping table in code. Owner: support-eng. Verified: case passes and the 300-ticket replay is unchanged.
2. Agents edit 40% of drafts for a Spanish-speaking segment. → **Backlog** item: language detection and a Spanish golden set before expanding there. Owner: PM.
3. Carrier API timeouts caused 2% of drafts to hang for 30 s. → **Runtime**: 4 s timeout and a "status unavailable, a human will follow up" fallback. Owner: platform. Verified: chaos test in staging.

The golden set grows from 300 to 340 cases in a month, almost all from real failures.`,
      prosCons: {
        pros: [
          'Quality improves steadily instead of failures repeating after every change.',
          'The regression set grows from real failures, which makes it more representative than invented cases.',
          'Routing to the earliest layer produces stronger fixes than prompt patches.',
        ],
        cons: [
          { con: 'Controls and eval cases accumulate and slow everything down.', fix: 'Give each control a review date and a retirement condition; deduplicate eval cases by failure type and keep the suite runnable in minutes.' },
          { con: 'Production failures contain personal data.', fix: 'Redact before a case enters the eval set, keep the source link in an access-controlled store, and follow the retention policy.' },
        ],
      },
      keyPoints: [
        'Every failure becomes an owned, verified change: the system only moves forward.',
        'Route to the earliest owning layer: eval, context, policy, runtime or backlog.',
        'Every production failure becomes a (redacted) regression eval case.',
        'Controls need owners, review dates and retirement conditions.',
      ],
      exercise: {
        prompt: `Write \`routeSignal(kind)\` mapping a signal kind to its layer: 'wrong_answer' | 'regression' → 'eval'; 'stale_fact' | 'missing_context' → 'context'; 'unsafe_action' → 'policy'; 'timeout' | 'outage' → 'runtime'; anything else → 'backlog'. Then write \`toAction(signal)\` that returns { layer, owner, verify } where owner comes from a layer→team map and verify is "eval case fails before and passes after" for 'eval', otherwise "check added for <layer>".`,
        starter: {
          language: 'typescript',
          code: `const OWNERS: Record<string, string> = { eval: 'ai-eng', context: 'data', policy: 'security', runtime: 'platform', backlog: 'pm' };

export function routeSignal(kind: string): string {
  // TODO
  return 'backlog';
}

export function toAction(signal: { kind: string }) {
  // TODO
}`,
        },
        hints: ['A lookup object is clearer than a chain of ifs.', 'Use ?? "backlog" for unknown kinds.'],
        solution: {
          language: 'typescript',
          code: `const OWNERS: Record<string, string> = { eval: 'ai-eng', context: 'data', policy: 'security', runtime: 'platform', backlog: 'pm' };
const ROUTES: Record<string, string> = {
  wrong_answer: 'eval', regression: 'eval',
  stale_fact: 'context', missing_context: 'context',
  unsafe_action: 'policy',
  timeout: 'runtime', outage: 'runtime',
};

export function routeSignal(kind: string): string {
  return ROUTES[kind] ?? 'backlog';
}

export function toAction(signal: { kind: string }) {
  const layer = routeSignal(signal.kind);
  const verify = layer === 'eval' ? 'eval case fails before and passes after' : 'check added for ' + layer;
  return { layer, owner: OWNERS[layer], verify };
}`,
        },
        explanation: 'Every signal leaves with a layer, an owner and a verification, which is what separates a ratchet from a pile of telemetry. Unknown kinds fall into the backlog with an owner rather than being dropped.',
      },
      quickCheck: {
        question: 'The agent promised a refund outside policy. Which fix is the strongest first move?',
        options: [
          'Add "never promise refunds" to the system prompt',
          'Add an eval case and enforce refunds through a tool that checks policy and requires approval',
          'Switch to a bigger model',
          'Ask agents to watch more carefully',
        ],
        correct: 1,
        explanation: 'An authority problem belongs in the policy layer: the system should be unable to issue or promise the refund without the check. The eval case keeps it from regressing. A prompt line helps but cannot guarantee it.',
      },
      source: 'ai-engineering-from-scratch Phase 14 · 54; Fagerholm et al. 2014',
      steps: {
        actors: [
          { id: 'sig', kind: 'metric', label: 'Signal', sub: 'failure in production', x: 110, y: 150 },
          { id: 'eval', kind: 'judge', label: 'Eval set', sub: 'regression cases', x: 340, y: 70 },
          { id: 'ctx', kind: 'retriever', label: 'Context / data', sub: 'freshness checks', x: 570, y: 70 },
          { id: 'policy', kind: 'guard', label: 'Policy', sub: 'permission · approval', x: 800, y: 70 },
          { id: 'runtime', kind: 'server', label: 'Runtime', sub: 'timeouts · fallbacks', x: 570, y: 230 },
          { id: 'backlog', kind: 'document', label: 'Backlog', sub: 'shaped item + owner', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Failures become changes',
            lines: [
              'Capture a concrete signal and link it to an outcome, constraint or assumption.',
              'Find the **earliest layer** that owns the cause and make a bounded change there.',
              'Verify the failure is gone and nothing else broke.',
            ],
            script: [
              { say: 0 },
              { lit: 'sig' },
              { badge: 'sig', text: 'bad answer', tone: 'err', ms: 1000 },
              { say: 1 },
              { send: ['sig', 'eval'] },
              { send: ['sig', 'ctx'], curve: true },
              { send: ['sig', 'policy'], curve: true },
              { send: ['sig', 'runtime'], curve: true },
              { send: ['sig', 'backlog'], curve: true },
              { say: 2 },
              { badge: 'eval', text: 'verified', tone: 'ok', ms: 1000 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: "delivered"?',
            lines: ['A customer was told a parcel was "delivered"; the carrier had marked it "delivery attempted".'],
            task: {
              type: 'pick',
              question: 'A wrong answer: where does it go first?',
              answer: 'eval',
              hints: {
                ctx: 'A wrong or regressed answer goes to the eval set first.',
                policy: 'No unsafe action or authority gap here.',
                runtime: 'Nothing timed out.',
                backlog: 'This is a wrong answer, not a new need.',
              },
            },
            solved: 'A wrong answer becomes an eval case that fails before the fix and passes after.',
            then: [{ send: ['sig', 'eval'], label: 'new case', tone: 'ok' }],
          },
          {
            kind: 'turn',
            title: 'Your turn: drafts that hang',
            lines: ['Carrier API timeouts made 2% of drafts hang for 30 s.'],
            task: {
              type: 'pick',
              question: 'Which layer owns this fix?',
              answer: 'runtime',
              hints: {
                eval: 'The answers were not wrong; the call hung.',
                ctx: 'The data was not stale or missing; the call hung.',
                policy: 'No unsafe action or authority gap here.',
                backlog: 'This is an operational failure with a clear owning layer, not a new need.',
              },
            },
            solved: 'Runtime: a 4 s timeout and a "status unavailable, a human will follow up" fallback.',
            then: [{ send: ['sig', 'runtime'], label: '4 s timeout', tone: 'ok', curve: true }],
          },
          {
            kind: 'watch',
            title: 'Every failure becomes an eval case',
            lines: [
              'Another paragraph in the prompt is the **weakest** fix.',
              'A test, a data check or a permission can make the failure impossible.',
              'The golden set grew from 300 to 340 cases in a month, almost all from real failures.',
            ],
            script: [
              { say: 0 },
              { badge: 'sig', text: 'prompt patch', tone: 'miss', ms: 1000 },
              { say: 1 },
              { lit: 'eval' },
              { lit: 'ctx' },
              { lit: 'policy' },
              { say: 2 },
              { send: ['sig', 'eval'], label: 'case', count: 3 },
              { badge: 'eval', text: '300 → 340', tone: 'ok', ms: 1200 },
            ],
          },
          {
            kind: 'watch',
            title: 'Retire controls with evidence',
            lines: [
              'Each ratchet action has one owner, a priority, a check and a review date.',
              'Review a control when a lower-level fix replaces it or it blocks more work than it prevents harm.',
              'Do not delete it just because it feels old.',
            ],
            script: [
              { say: 0 },
              { badge: 'backlog', text: 'owner + date', ms: 1200 },
              { say: 1 },
              { badge: 'policy', text: 'review', ms: 1200 },
              { say: 2 },
              { lit: 'policy' },
            ],
          },
        ],
      },
    },
  ],
  codeChallenges: [
    {
      id: 'ai-product-delivery-cc-1',
      title: 'A launch check that cannot say no',
      context: 'A team gates launches with the function below. It shipped a support bot whose average quality score was high while it had made two refund promises outside policy, and it never measured cost.',
      task: 'Rewrite the gate so it uses pre-set metric contracts, treats any guardrail breach or missing guardrail value as a block, requires every outcome metric, and returns reasons.',
      starter: {
        language: 'typescript',
        code: `export function readyToLaunch(scores: Record<string, number>): boolean {
  const vals = Object.values(scores);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return avg > 0.8;
}`,
      },
      hints: [
        'Averaging hides a zero-tolerance guardrail inside good numbers.',
        'Who decides the thresholds, and when?',
        'What should happen when a metric was never measured?',
      ],
      solution: {
        language: 'typescript',
        code: `type Contract = { name: string; kind: 'outcome' | 'guardrail'; direction: 'at_least' | 'at_most'; threshold: number };
type Verdict = { launch: boolean; reasons: string[] };

/** Contracts are fixed before the pilot; values come from the measurement pipeline, not from a slide. */
export function readyToLaunch(contracts: Contract[], values: Record<string, number | undefined>): Verdict {
  const reasons: string[] = [];
  if (!contracts.some((c) => c.kind === 'guardrail')) reasons.push('no guardrail metrics defined');
  for (const c of contracts) {
    const v = values[c.name];
    if (v === undefined) { reasons.push('not measured: ' + c.name); continue; }
    const ok = c.direction === 'at_least' ? v >= c.threshold : v <= c.threshold;
    if (!ok) reasons.push(c.kind + ' missed: ' + c.name + ' = ' + v + ' (' + c.direction + ' ' + c.threshold + ')');
  }
  return { launch: reasons.length === 0, reasons };
}`,
      },
      explanation: `- **No averaging.** Each metric is judged against its own threshold, so two refund promises cannot hide behind a high quality score.
- **Pre-set contracts.** Thresholds and directions are data agreed before the pilot, not chosen after the results.
- **Unmeasured means not ready.** Missing cost or guardrail data blocks the launch instead of passing silently.
- **No guardrails at all is itself a reason.** A plan with only outcome metrics is incomplete.
- **Reasons returned** go straight into the gate review.`,
      followUps: [
        { q: 'How would you handle a metric that passes but has a very wide confidence interval?', a: 'Add the sample size or interval to the contract (for example, require at least 300 cases or a lower bound above the threshold) and report it as ambiguous rather than pass, which usually means extending the pilot.' },
        { q: 'Who should own the contracts?', a: 'The outcome owner (often a PM or the support lead) agrees thresholds with engineering before the pilot; changes after results are visible need a written reason in the same file so the history shows it.' },
      ],
    },
    {
      id: 'ai-product-delivery-cc-2',
      title: 'Turn production failures into regression cases',
      context: 'Agents flag bad AI replies with a thumbs-down. The flags sit in a table nobody reads, and the same failures come back after every prompt change.',
      task: 'Write `promote(flags, existing)` that turns flagged replies into eval cases: redact emails and order numbers, skip duplicates of existing cases (same normalised input), and give each new case an owner and an expected behaviour note from the flag.',
      starter: {
        language: 'typescript',
        code: `type Flag = { ticketText: string; aiReply: string; note: string; reviewer: string };

export function promote(flags: Flag[]) {
  return flags.map((f) => ({ input: f.ticketText, bad: f.aiReply }));
}`,
      },
      hints: [
        'Redact before comparing, so the same failure from two customers dedupes.',
        'Normalise case and whitespace for the duplicate key.',
        'An eval case needs an expected behaviour, not just the bad output.',
      ],
      solution: {
        language: 'typescript',
        code: `type Flag = { ticketText: string; aiReply: string; note: string; reviewer: string };
type EvalCase = { id: string; input: string; mustNot: string; expected: string; owner: string };

const redact = (s: string) =>
  s.replace(/[\\w.+-]+@[\\w-]+\\.[\\w.]+/g, '<email>').replace(/\\b\\d{6,}\\b/g, '<order>');
const key = (s: string) => s.toLowerCase().replace(/\\s+/g, ' ').trim();

export function promote(flags: Flag[], existing: EvalCase[], owner = 'ai-eng'): EvalCase[] {
  const seen = new Set(existing.map((c) => key(c.input)));
  const out: EvalCase[] = [];
  for (const f of flags) {
    const input = redact(f.ticketText);
    if (!f.note.trim() || seen.has(key(input))) continue;   // no expected behaviour, or already covered
    seen.add(key(input));
    out.push({ id: 'case-' + (existing.length + out.length + 1), input, mustNot: redact(f.aiReply), expected: f.note, owner });
  }
  return out;
}`,
      },
      explanation: `- **Redaction first:** personal data never enters the eval set, and redacted inputs dedupe across customers.
- **Dedup by normalised input** keeps the suite small and fast.
- **Expected behaviour** comes from the reviewer's note; a flag with no note is skipped rather than turned into an unjudgeable case.
- **Owner** on each case means someone is accountable when it starts failing.
The new cases run on every prompt, model or retrieval change, which is what stops the same failure coming back.`,
      followUps: [
        { q: 'Two regexes are not real PII redaction. What would you use in production?', a: 'A dedicated PII detector (pattern rules plus an NER model, such as Microsoft Presidio) tuned to your data, run before storage, with spot checks; regexes are a demonstration, not a guarantee.' },
        { q: 'How do you grade a case whose expected behaviour is a sentence like "should say the parcel is not yet delivered"?', a: 'Use an LLM judge with a rubric built from the expected note and the mustNot text, calibrated against human labels, or add a deterministic check where possible (for example, the reply must not contain "delivered").' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'ai-product-delivery-iq-01',
      difficulty: 'hard',
      question: 'The CEO wants an AI customer support agent live by Q3. Walk me through how you would approach it.',
      context: 'Mid-size e-commerce company, about 40,000 tickets a month, a 30-person support team, an existing ticketing system.',
      whatInterviewerLooksFor: [
        'Clarifies the outcome and constraints before naming a solution',
        'Uses data on the current workflow to choose where to start',
        'Proposes a narrow, measurable slice with a stop rule',
        'Stages authority (suggest → approve → automate) with gates and ownership',
        'Plans the feedback loop and cost, not just the launch',
      ],
      modelAnswer: `**1. Clarify the outcome (week 1).** What does the CEO want to change: cost per ticket, response time, CSAT, or scaling without hiring? What is off-limits (refunds, account changes, regulated data)? I write a one-page frame: user, situation, current workflow, desired outcome with numbers, constraints, non-goals.

**2. Map the workflow with data.** Pull a month of tickets, cluster by intent, measure volume and handling time per intent, and shadow a few agents. Typically a few intents (order status, returns policy, password reset) are a large share, and some need authority (refunds) or hidden data (Slack approvals).

**3. Risk register.** Feasibility (do we have the data to answer correctly?), safety (no unauthorised refunds, no PII leaks), usability (do customers and agents accept it?), viability (cost per resolution, who maintains the knowledge base). Rank, test the top one first.

**4. Smallest slice.** One high-volume, low-risk intent such as order status. Prototype as an offline replay of a few hundred real tickets with pre-set thresholds (correctness, zero policy violations, cost per draft).

**5. Stage authority.** Pilot as agent-assist (drafts a human sends) with a named cohort, kill switch and exit criteria; then customer-facing auto-replies for that intent only; then add intents one at a time. Refunds stay human-approved via a tool with policy checks.

**6. Metrics.** Resolution without reopen, quality on a sampled rubric, p95 latency, cost per resolved ticket including human review, adoption (send rate, deflection accepted), guardrails, and a counter-metric (tier-2 escalations).

**7. Production and ratchet.** SLOs, on-call, budgets, quality monitoring on live samples, rollback via pinned prompt and model versions. Every failure becomes a redacted eval case.

**What I tell the CEO:** by Q3 we can realistically have one or two intents automated with measured results and a staged plan for the rest, not a bot that answers everything. That is a credible, lower-risk Q3 story.`,
      followUps: [
        { q: 'The CEO insists on full automation of all tickets by Q3. What do you say?', a: 'I show the risk: intents with authority (refunds, cancellations) or poor data will produce visible, costly mistakes. I offer a date-bound plan: X intents automated by Q3 with these results, the rest as agent-assist, and the evidence needed to automate each next one. Leadership can accept the risk explicitly, but it should be a written decision with an owner.' },
        { q: 'How do you choose the first intent?', a: 'High volume, low consequence, data available, and a clear correct answer. Order status usually qualifies; refunds and account security do not. I check it against the risk register so the first slice still tests the riskiest assumption, such as data correctness.' },
        { q: 'What would make you stop the project?', a: 'Pre-set stop rules: replay correctness far below threshold with no clear data fix, any repeatable policy violation we cannot prevent at the tool layer, or cost per resolution above the human cost with no path down. Stopping early is a good outcome if the evidence says so.' },
      ],
      pitfalls: [
        'Jumping straight to model and framework choice',
        'Promising full automation of every intent on a date',
        'No guardrail metrics or stop rule',
        'Treating launch as the end instead of the start of the feedback loop',
      ],
    },
    {
      id: 'ai-product-delivery-iq-02',
      difficulty: 'hard',
      question: 'Legal wants an AI tool to "summarise contracts". How do you scope it so the first version is useful and safe?',
      whatInterviewerLooksFor: [
        'Turns an output request into an outcome',
        'Finds the real workflow and the decision the summary feeds',
        'Defines quality with experts and sets a guardrail',
        'Keeps authority with the lawyer',
      ],
      modelAnswer: `"Summarise contracts" is an output. I start by asking what decision the summary supports.

**Frame.** Shadowing two lawyers usually shows the real job is narrower, for example: *for inbound vendor contracts, find non-standard clauses (liability caps, auto-renewal, termination, data processing) and compare them with our playbook, so review takes less time without missing a deviation.* Constraints: contracts stay in our tenant, no auto-approval, lawyers sign off. Non-goals: drafting, negotiation, litigation documents.

**Workflow.** Contract arrives by email → paralegal checks against a playbook spreadsheet → lawyer reviews flagged clauses. Hidden state: the playbook has exceptions only senior lawyers know.

**Risks.** Safety: a missed deviation is worse than a slow review, so recall on deviations is the key metric. Feasibility: scanned PDFs and inconsistent clause naming. Usability: lawyers need to see the source clause, not just a summary.

**Slice.** 50 past vendor contracts already reviewed by lawyers (their notes are free labels). The system extracts the target clauses with citations and flags deviations from the playbook. Thresholds: recall on known deviations ≥ 95%, every flag links to the clause text, zero data leaving the tenant.

**Stages.** Prototype on the 50; pilot with two lawyers as a pre-review checklist they verify; production only for that contract type, with a monthly sampled audit. Every missed deviation becomes an eval case and, often, a playbook update.`,
      followUps: [
        { q: 'Why recall and not precision as the main metric?', a: 'A false flag costs a lawyer a minute; a missed liability clause can cost far more. So the bar is very high recall on deviations, with precision as a secondary metric to keep the tool from becoming noise.' },
        { q: 'The lawyers do not trust it. What do you change?', a: 'Show the exact clause and the playbook rule for every flag, start with the tool as a checklist that they confirm, measure agreement openly, and add their corrections to the eval set so they see it improve.' },
      ],
      pitfalls: ['Building a generic summariser', 'Measuring with ROUGE or "looks good" instead of expert-labelled recall', 'Letting the summary replace the source text'],
    },
    {
      id: 'ai-product-delivery-iq-03',
      difficulty: 'medium',
      question: 'Your offline evals score 92%, but in the pilot agents use only 20% of the AI drafts. What do you do?',
      whatInterviewerLooksFor: [
        'Understands offline vs online gaps',
        'Investigates the workflow, not just the model',
        'Uses edits and discards as data',
      ],
      modelAnswer: `The offline set answered "is the content correct?" The pilot is answering "does it fit the work?" Something differs between the two.

**Look at what agents do instead.** Pull discarded and heavily edited drafts and sit with a few agents. Common causes:
- **Distribution gap:** the eval set over-represents easy tickets; real ones are multi-issue or have attachments.
- **Workflow fit:** the draft arrives after the agent has started typing, or lives in a separate panel.
- **Tone or format:** correct but wrong voice, too long, missing the macro structure.
- **Trust:** no sources shown, so checking takes as long as writing.
- **Hidden state:** agents know things the system does not (a Slack thread, a known carrier issue).

**Measure it.** Break send rate down by intent, agent tenure and ticket length; compute edit distance; label 100 discarded drafts by reason.

**Act on the top reason.** Add the missed ticket types to the eval set, change when or where the draft appears, add citations, or connect the missing data. Then re-run the pilot with the same metrics. If the cause is workflow fit, a UI change can beat any model change.

The lesson: adoption is a first-class metric, and offline quality alone does not predict it.`,
      followUps: [
        { q: 'How do you tell a quality problem from a trust problem?', a: 'Label discarded drafts: if most are actually correct, it is trust or workflow (fix with citations, placement, training); if most are wrong, the eval set is unrepresentative and quality is the issue.' },
        { q: 'Would you lower the bar and auto-send to increase usage?', a: 'No. Low adoption is a signal to understand, not to bypass. Auto-sending drafts agents would have rejected moves the problem to customers.' },
      ],
      pitfalls: ['Blaming agents for not using it', 'Swapping models before understanding the cause', 'Ignoring edits as a data source'],
    },
    {
      id: 'ai-product-delivery-iq-04',
      difficulty: 'medium',
      question: 'How do you decide when an AI feature is ready to move from pilot to production?',
      whatInterviewerLooksFor: [
        'Pre-set exit criteria, not a feeling',
        'Operational ownership as part of readiness',
        'Explicit expand / revise / stop options',
      ],
      modelAnswer: `I decide with criteria written before the pilot started, plus operational readiness.

**Evidence against thresholds.** Outcome metrics (task success, quality on a sampled rubric, latency, cost per successful task, adoption) meet their thresholds on a large enough sample; guardrails show zero breaches (or within the agreed tolerance); counter-metrics have not moved. Ambiguous results mean extend or enlarge the pilot, not launch.

**Risk register.** The assumptions that the pilot was meant to test are marked tested, with links to evidence. New risks found in the pilot have owners.

**Operations.** Production is about owning it: an SLO and alerts, an on-call team, a security and privacy review, budgets and rate limits, quality monitoring on live samples, a rollback path (feature flag, pinned prompt and model versions), and runbooks for the known failure modes.

**Incidents.** Each pilot incident has a ratchet action (eval case, data fix, permission) that has been verified.

**Decision.** The gate review recommends expand, revise or stop, the outcome owner decides, and the decision is written down. Often "production" is staged too: more users first, more authority later.`,
      followUps: [
        { q: 'The pilot met every metric but there is no on-call team yet. Ship?', a: 'Not to production. Expand the pilot if useful, but production means someone owns incidents. Without on-call, a 2 a.m. failure has no owner and the feature is effectively an unmanaged prototype.' },
        { q: 'How large should the pilot sample be?', a: 'Large enough that the confidence interval on the key metric excludes the threshold. For a rate near 85%, a few hundred cases gives roughly ±3–4 points at 95% confidence; zero-tolerance guardrails need enough volume to have seen the risky situations at all.' },
      ],
      pitfalls: ['Deciding on demos or anecdotes', 'Treating deployment as production', 'No stop option'],
    },
    {
      id: 'ai-product-delivery-iq-05',
      difficulty: 'hard',
      question: 'Your AI assistant has been in production for six months. Quality complaints keep recurring after every prompt change. How do you fix the process?',
      whatInterviewerLooksFor: [
        'Regression eval set built from real failures',
        'Routing fixes to the right layer',
        'Ownership and retirement of controls',
      ],
      modelAnswer: `Recurring failures mean the system is not learning: feedback is collected but not promoted into durable changes.

**Build the ratchet.**
1. **Capture:** every complaint, thumbs-down, escalation and incident goes into one queue with the trace.
2. **Triage weekly:** link each to an outcome or constraint and route it to the earliest owning layer: eval, context or data, policy or permission, runtime, or backlog.
3. **Eval first:** every wrong-answer report becomes a redacted regression case that fails before the fix. The suite runs in CI on every prompt, model and retrieval change, and a release cannot ship if a previously fixed case fails.
4. **Fix at the right layer:** stale facts → freshness checks in the data pipeline; unsafe actions → tool permissions; timeouts → runtime limits. Prompt edits are the last resort, not the first.
5. **Own it:** every action has an owner, priority (severity × frequency), the artifact changed, the verification and a review date.
6. **Retire:** quarterly, review controls and prompt rules; remove the ones a lower-level fix replaced, with evidence.

**Measure the process:** repeat-failure rate, time from report to fix, and suite size and runtime. I would expect repeats to fall within a couple of release cycles.`,
      followUps: [
        { q: 'The eval suite now takes an hour. What do you do?', a: 'Deduplicate by failure type, run a fast smoke subset on every change and the full suite before release, parallelise, and cache results for unchanged components. Retire cases that a deterministic check now guarantees.' },
        { q: 'Who owns the eval set?', a: 'The team that owns the feature, with one named maintainer. Product and domain experts contribute expected behaviours; engineering keeps it runnable and fast.' },
      ],
      pitfalls: ['Adding more prompt rules after each complaint', 'Collecting feedback with no owner', 'Never removing controls'],
    },
    {
      id: 'ai-product-delivery-iq-06',
      difficulty: 'expert',
      question: 'An internal team built an impressive RAG demo for sales in two weeks. Sales leadership wants it rolled out to 500 reps next month. What do you check, and what do you propose?',
      whatInterviewerLooksFor: [
        'Recognises a demo minimum and stage drift risk',
        'Checks data access, permissions and evaluation',
        'Proposes a bounded pilot with metrics',
      ],
      modelAnswer: `A demo proves the mechanism can work on chosen examples; it has not shown value, safety or operability.

**Checks:**
- **Outcome:** what should change for reps? Faster answers to product questions, fewer escalations to sales engineers, more accurate quotes? Without this, adoption will be the only metric and it will be ambiguous.
- **Data and permissions:** does retrieval respect document permissions (pricing, customer-specific contracts)? A demo often runs with an admin index. This is the highest-risk assumption.
- **Evaluation:** is there a golden set from real rep questions with expected answers? What is the correctness and citation rate?
- **Freshness:** who updates the index when pricing changes?
- **Operations:** owner, budgets, monitoring, rollback.

**Proposal:**
1. One to two weeks: collect 200 real questions from Slack and SE tickets, build the eval set with sales engineers, fix permission-aware retrieval.
2. Pilot: 30 reps in one segment, with citations shown, thumbs-down capture, and metrics (answer correctness on a weekly sample, SE escalations, time to answer, adoption, zero permission leaks).
3. Gate after 4 weeks with pre-set thresholds; then expand by segment.

This delivers to sales within about six weeks, with evidence, instead of 500 reps hitting a permissions leak in week one.`,
      followUps: [
        { q: 'Leadership says the delay is unacceptable. Can you go faster?', a: 'Yes, by cutting scope, not checks: launch the pilot to the 30 reps on public product docs only (no permission risk) next week, and add restricted content once permission-aware retrieval is verified.' },
        { q: 'How do you test for permission leaks?', a: 'Seed test documents with restricted access, query as users without access, and assert they never appear in retrieved chunks or answers; run this in CI and as a pilot guardrail metric with zero tolerance.' },
      ],
      pitfalls: ['Scaling the demo as is', 'Ignoring document permissions', 'No eval set from real questions'],
    },
  ],
  envelopeQuestions: [
    {
      id: 'ai-product-delivery-est-1',
      question: 'Estimate the cost per resolved ticket for AI-drafted, human-approved replies versus fully manual replies, and the monthly saving.',
      assumptions: [
        '20,000 eligible tickets a month',
        'Manual: 9 minutes of agent time per ticket at $0.50 per minute (fully loaded)',
        'AI-assisted: 3 model calls per ticket at about 4,000 input + 500 output tokens each; illustrative prices $3 per 1M input and $15 per 1M output tokens',
        'Agents send 60% of drafts after 1.5 minutes of review; the other 40% take the full 9 minutes after 1 minute wasted on the draft',
      ],
      steps: [
        { label: 'Model cost per ticket', calc: '3 × (4,000 × $3 + 500 × $15) / 1M = 3 × ($0.012 + $0.0075) ≈ $0.06' },
        { label: 'Human time per ticket (AI path)', calc: '0.6 × 1.5 + 0.4 × (1 + 9) = 0.9 + 4.0 = 4.9 min → $2.45' },
        { label: 'AI-assisted cost per ticket', calc: '$2.45 + $0.06 ≈ $2.51' },
        { label: 'Manual cost per ticket', calc: '9 × $0.50 = $4.50' },
        { label: 'Monthly saving', calc: '20,000 × ($4.50 − $2.51) ≈ $39,800' },
      ],
      answer: 'About $2.51 per ticket with AI drafts versus $4.50 manual, saving roughly $40K a month on 20,000 tickets.',
      insight: 'Model cost is about 2% of the total; human review time dominates. Raising the send rate or cutting review time moves the number far more than a cheaper model, which is why adoption and workflow fit matter so much.',
      followUps: [
        { q: 'What if the send rate rises from 60% to 80%?', a: 'Human time = 0.8 × 1.5 + 0.2 × 10 = 1.2 + 2.0 = 3.2 min → $1.60; total ≈ $1.66 per ticket, saving about $56,800 a month. Twenty points of adoption are worth far more than any model price cut.' },
      ],
    },
    {
      id: 'ai-product-delivery-est-2',
      question: 'How many replay cases do you need to show the draft correctness rate is at least 85% with reasonable confidence, and how long does it take experts to label them?',
      assumptions: [
        'True correctness around 88%; you want a 95% confidence interval of about ±3 points',
        'Normal approximation: margin ≈ 1.96 × √(p(1 − p) / n)',
        'Two support experts label each case; 2 minutes per case per expert',
      ],
      steps: [
        { label: 'Solve for n', calc: 'n ≈ 1.96² × 0.88 × 0.12 / 0.03² = 3.84 × 0.1056 / 0.0009 ≈ 450' },
        { label: 'Lower bound at n = 450', calc: '0.88 − 0.03 = 0.85 → just meets the bar' },
        { label: 'Labelling time', calc: '450 cases × 2 experts × 2 min = 1,800 min = 30 h' },
      ],
      answer: 'About 450 cases, which takes about 30 expert hours to double-label: roughly two people for two days.',
      insight: 'A 50-case demo set gives a ±9-point interval, too wide to decide anything. Budget expert labelling time in the plan; it is usually the real bottleneck, not compute.',
      followUps: [
        { q: 'How could you cut the labelling time?', a: 'Use existing labels (past ticket outcomes, lawyer notes, QA reviews), single-label most cases and double-label a sample to measure agreement, or calibrate an LLM judge on 100 human-labelled cases and use it for the rest, re-checking agreement regularly.' },
      ],
    },
  ],
  test: [
    {
      id: 'ai-product-delivery-mcq-01',
      difficulty: 'medium',
      question: 'Select ALL parts of an outcome frame.',
      options: ['Current workflow', 'Constraints', 'Non-goals', 'Chosen model and vector database'],
      correct: [0, 1, 2],
      explanation: 'The frame has user, situation, current workflow, desired outcome, constraints and non-goals. The model and infrastructure are candidate solutions chosen later, once evidence supports them; putting them in the frame is solution leakage.',
      followUps: [{ q: 'When can a constraint name a technology?', a: 'When something really fixes it, such as an existing ticketing system the feature must work with. Record why it is fixed so it can be revisited later.' }],
    },
    {
      id: 'ai-product-delivery-mcq-02',
      difficulty: 'medium',
      question: 'Which evidence proves current behaviour directly?',
      options: [
        'A team lead describing the process in an interview',
        'Ticket logs showing each step with timestamps',
        'The team\'s best guess from the org chart',
        'A survey of what users say they want',
      ],
      correct: [1],
      explanation: 'Observations and artifacts (logs, tickets, recordings) are direct evidence. Interviews are reported behaviour, guesses are inference, and surveys of wants are about desired features rather than current behaviour.',
      followUps: [{ q: 'Is reported evidence useless?', a: 'No. It is a good source of hypotheses and context, but label it as reported and confirm the important steps with logs or observation before they become requirements.' }],
    },
    {
      id: 'ai-product-delivery-mcq-03',
      difficulty: 'hard',
      question: 'Using score = impact × uncertainty + irreversibility, which open assumption should be tested first?',
      code: {
        language: 'json',
        code: `[
  { "id": "A1", "impact": 4, "uncertainty": 2, "irreversibility": 1, "status": "open" },
  { "id": "A2", "impact": 5, "uncertainty": 4, "irreversibility": 3, "status": "tested" },
  { "id": "A3", "impact": 3, "uncertainty": 4, "irreversibility": 4, "status": "open" },
  { "id": "A4", "impact": 5, "uncertainty": 3, "irreversibility": 1, "status": "open" }
]`,
      },
      options: ['A1', 'A2', 'A3', 'A4'],
      correct: [2],
      explanation: 'A2 is already tested, so it is out. Scores: A1 = 4×2+1 = 9, A3 = 3×4+4 = 16, A4 = 5×3+1 = 16. A3 and A4 tie; with irreversibility as the tie-break, A3 wins because it is costlier to learn after committing.',
      followUps: [{ q: 'Why include irreversibility at all?', a: 'Some unknowns are cheap to learn later and some are very costly (a data migration, a public commitment). Irreversible bets should be tested before you commit to them.' }],
    },
    {
      id: 'ai-product-delivery-mcq-04',
      difficulty: 'medium',
      question: 'Select ALL "false minimum" slices.',
      options: [
        'A polished chat UI on hand-written FAQs',
        'Embedding every document into a vector store before any user test',
        'A read-only replay of real tickets, including exception cases, judged against pre-set thresholds',
        'A slice that handles only the clean happy path',
      ],
      correct: [0, 1, 3],
      explanation: 'UI-only, infrastructure-only and happy-path-only slices each remove the uncertainty you most need to test. A read-only replay on real cases with exceptions is narrow in authority but still end to end, so it is a real minimum.',
      followUps: [{ q: 'What makes a slice "vertical"?', a: 'It crosses the real workflow end to end, from real input to a judged output, while staying narrow in users, data, duration or authority.' }],
    },
    {
      id: 'ai-product-delivery-mcq-05',
      difficulty: 'medium',
      question: 'What is the purpose of a stop rule written before a slice is built?',
      options: [
        'To guarantee the slice succeeds',
        'To make sure some result can change the plan, so the slice is a real experiment',
        'To limit the number of engineers',
        'To satisfy compliance paperwork',
      ],
      correct: [1],
      explanation: 'If every outcome leads to "keep building", the slice cannot change a decision. A stop rule, set before results exist, says what evidence would make you abandon, reframe or narrow the work.',
      followUps: [{ q: 'Give an example stop rule for a support-draft slice.', a: 'If replay correctness is below 70% or any draft promises a refund outside policy, stop before live traffic and fix data access or tool permissions first.' }],
    },
    {
      id: 'ai-product-delivery-mcq-06',
      difficulty: 'hard',
      question: 'Which field is missing from this metric definition and makes the number impossible to reproduce?',
      code: {
        language: 'json',
        code: `{
  "name": "draft_send_rate",
  "kind": "outcome",
  "direction": "at_least",
  "threshold": 0.5,
  "population": "pilot agents, WISMO tickets"
}`,
      },
      options: ['The source and window', 'The model name', 'The owner\'s email', 'A chart type'],
      correct: [0],
      explanation: 'Without the data source (which events) and the window (which period), two people can compute different send rates and both be "right". A metric contract needs direction, threshold, window, source, population and kind.',
      followUps: [{ q: 'Why does the threshold need to be set before the pilot?', a: 'Otherwise the team tends to move it after seeing results to protect the build. A pre-set threshold makes the decision mechanical and defensible.' }],
    },
    {
      id: 'ai-product-delivery-mcq-07',
      difficulty: 'medium',
      question: 'Select ALL metrics that are guardrails or counter-metrics for an AI support pilot.',
      options: [
        'Refund promises outside policy (target 0)',
        'Escalations to tier 2',
        'Number of tokens generated per day',
        'PII exposed in replies (target 0)',
      ],
      correct: [0, 1, 3],
      explanation: 'Refund promises and PII exposure are guardrails: constraints that must hold. Tier-2 escalations are a counter-metric that catches work shifted elsewhere. Tokens per day is a cost input, not a guardrail; on its own it cannot tell you whether anything is safe or better.',
      followUps: [{ q: 'How would you express cost as a decision metric?', a: 'Cost per successfully resolved task, including model calls, retries, tools and human review time, compared with the manual alternative.' }],
    },
    {
      id: 'ai-product-delivery-mcq-08',
      difficulty: 'medium',
      question: 'What can an offline replay NOT tell you?',
      options: [
        'Whether answers are correct on past cases',
        'Whether a change regressed known failures',
        'Whether agents trust and adopt the drafts in their real workflow',
        'How the system handles known edge cases',
      ],
      correct: [2],
      explanation: 'Offline evals are repeatable and good for correctness, regressions and edge cases. Trust, adoption and workflow effects only show up online, with real users in a pilot or experiment.',
      followUps: [{ q: 'Then why do offline evals first?', a: 'They are cheap, fast and expose no one to risk. They answer the feasibility and safety questions before you spend real users\' time and trust.' }],
    },
    {
      id: 'ai-product-delivery-mcq-09',
      difficulty: 'medium',
      question: 'Which question does a pilot answer?',
      options: [
        'Can the mechanism produce the evidence at all?',
        'Does it work safely with a bounded real audience in real conditions?',
        'Can we own it continuously at the promised reliability?',
        'Which model is cheapest?',
      ],
      correct: [1],
      explanation: 'The prototype asks whether the mechanism can work, the pilot asks whether it works safely with a bounded real audience and real data, and production asks whether the organisation can own it continuously.',
      followUps: [{ q: 'Name three things every pilot needs.', a: 'A named audience and owner, bounded duration and authority with a kill switch and rollback, and pre-set outcome and guardrail thresholds with expand / revise / stop criteria.' }],
    },
    {
      id: 'ai-product-delivery-mcq-10',
      difficulty: 'hard',
      question: 'This config is described as a "prototype". What is wrong?',
      code: {
        language: 'yaml',
        code: `feature: sales-assistant
stage: prototype
users: all_sales   # 500 reps
credentials: prod-readwrite
owner: null
kill_switch: none`,
      },
      options: [
        'Nothing; prototypes can use any setup',
        'Stage drift: real users and production credentials with no owner or kill switch',
        'Prototypes must use a smaller model',
        'The YAML is invalid',
      ],
      correct: [1],
      explanation: 'It has production-level reach and authority (500 users, read-write production credentials) without any of the ownership or controls. Either shrink it to a real prototype or a bounded pilot with an owner and kill switch, or do the production work.',
      followUps: [{ q: 'How do you make stages enforceable rather than labels?', a: 'Tie the stage flag to access control and credentials (prototypes cannot get production credentials), tag telemetry by stage, and require an owner and end date in config before a pilot can start.' }],
    },
    {
      id: 'ai-product-delivery-mcq-11',
      difficulty: 'hard',
      question: 'Select ALL correct routings in a feedback ratchet.',
      options: [
        'Wrong answer reported by a customer → new regression eval case',
        'Carrier API timeouts → runtime timeout and fallback',
        'Agent issued an unauthorised refund → a stronger sentence in the prompt only',
        'Stale price in answers → data freshness check in the context pipeline',
      ],
      correct: [0, 1, 3],
      explanation: 'Fix at the earliest layer that owns the cause: evals for wrong answers, runtime controls for timeouts, data checks for stale facts. An authority failure belongs in the policy or permission layer (a tool that enforces the rule), not only in the prompt.',
      followUps: [{ q: 'Why is "every failure becomes an eval case" so valuable?', a: 'Real failures are the most representative test data you have. Once in the suite they are checked on every prompt, model or retrieval change, so the same failure cannot quietly come back.' }],
    },
    {
      id: 'ai-product-delivery-mcq-12',
      difficulty: 'medium',
      question: 'When is it right to retire a control added by the ratchet?',
      options: [
        'When it feels old',
        'When a lower-level fix now prevents the same failure and the evidence shows it',
        'Never; controls only accumulate',
        'Whenever a new model is released',
      ],
      correct: [1],
      explanation: 'Controls need retirement conditions: replaced by a stronger fix, failure not seen across the chosen window, or blocking more legitimate work than it prevents harm. The decision needs evidence, not age or a model release.',
      followUps: [{ q: 'What does each ratchet action record?', a: 'An owner, a priority from severity and frequency, the artifact changed, the verification that proves it, and a review date or retirement condition.' }],
    },
    {
      id: 'ai-product-delivery-mcq-13',
      difficulty: 'hard',
      question: 'Model cost is $0.06 per ticket and human review is $2.45 per ticket. Which change lowers cost per resolved ticket the most?',
      options: [
        'Switching to a model that is 50% cheaper',
        'Raising the share of drafts sent with light edits from 60% to 80%',
        'Caching the system prompt',
        'Shortening the output by 20%',
      ],
      correct: [1],
      explanation: 'Human time dominates. Halving the model cost saves $0.03; raising the send rate to 80% cuts human time from 4.9 to 3.2 minutes, about $0.85 per ticket. Measure cost per resolved task including review time, not just tokens.',
      followUps: [{ q: 'How would you raise the send rate?', a: 'Study discarded and heavily edited drafts, then fix the top causes: missing data, tone and format, missing citations, or the draft appearing at the wrong moment in the agent\'s workflow.' }],
    },
  ],
};

export default topic;
