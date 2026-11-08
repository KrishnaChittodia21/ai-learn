import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['agent-frameworks-compared.md', 'production-agent-runtimes.md'],
  blocks: [
    {
      title: 'Pick a framework',
      markdown: `| Use | When |
|---|---|
| Plain code | Two LLM calls and a tool; no resume, roles or fan-out |
| LangGraph | Typed state, human interrupts, resume, parallel fan-out |
| AutoGen-style chat | Proposer–critic dialogue |
| CrewAI | Short role-driven plans |
| Agno | Many short-lived Python agents with sessions and memory |
| Mastra | TypeScript / Next.js stacks with Zod-typed tools |
| A vendor agent SDK | Product built around one provider's models |`,
    },
    {
      title: 'Pick a runtime shape',
      markdown: `| Shape | Use when | Watch |
|---|---|---|
| Request–response | Task finishes while the user waits | Timeouts |
| Streaming (SSE / WebSocket) | Long answers, live progress | First-token and tail latency |
| Queue + workers | Bursty background work | Queue depth, dead-letter size |
| Durable execution | Long runs, human waits, crash recovery | Replay determinism |
| Event-driven / scheduled | Triggers or cron | Event-to-start latency |

Durable checkpoints: PostgreSQL survives deploys; SQLite is for local dev.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| A hands off to B, B hands back to A | Handoff drift | Hop counter |
| Crew burns tokens | Manager LLM routes every step | Sequential process |
| Next task ad-libs | Free-text handoff | Typed output schema per task |
| Users hang up on long tasks | Request–response for a minutes-long job | Queue or durable run, then notify |
| Failed jobs vanish | No dead-letter queue | Add one and alert on its size |
| Crash re-runs tools and re-bills calls | Plain \`while\` loop | Log each call as an activity and replay |
| Deploy kills running agents | In-flight runs not drained | Drain or keep old workers until runs finish |`,
    },
  ],
};

export default sheet;
