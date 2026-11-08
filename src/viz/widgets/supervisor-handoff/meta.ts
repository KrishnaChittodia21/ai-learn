import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'supervisor-handoff',
  title: 'Supervisor vs handoff: who holds control, and what flows back',
  blurb:
    'Run a supervisor that delegates one research task per company to parallel workers and gets only short summaries back, then a swarm where agents transfer the conversation with transfer_to_x, and a ping-pong that the handoff guard sends to a human. Watch each context window and the token bill.',
  placements: [{ topic: 'multi-agent-systems', heading: 'Multi-Agent Systems' }],
};
