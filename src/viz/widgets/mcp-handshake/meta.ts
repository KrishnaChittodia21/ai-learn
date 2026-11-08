import type { VizMeta } from '../../core';

export const meta: VizMeta = {
  id: 'mcp-handshake',
  title: 'An MCP session on the wire: handshake, tools/list, tools/call',
  blurb:
    'Follow every JSON-RPC message between host, client and a GitHub server: initialize and its capabilities, notifications/initialized, tools/list, the model picking a tool, user consent, tools/call and the result. Switch to the stateless 2026-07-28 spec, or make the tool fail (isError) or be unknown (a JSON-RPC error).',
  placements: [{ topic: 'mcp', heading: 'Model Context Protocol (MCP)' }],
};
