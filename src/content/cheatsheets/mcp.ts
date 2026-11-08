import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['mcp.md', 'mcp-client-transports.md', 'mcp-server-build.md', 'mcp-security-auth.md'],
  blocks: [
    {
      title: 'Tool, resource or prompt',
      markdown: `| | Tool | Resource | Prompt |
|---|---|---|---|
| Intent | Perform an operation | Read content at a URI | Start a message workflow |
| Chosen by | Model | Host app or user | User, via host UI |
| Methods | \`tools/list\`, \`tools/call\` | \`resources/list\`, \`resources/read\` | \`prompts/list\`, \`prompts/get\` |
| Example | \`delete_note\` | \`notes://note-1\` | \`review_note\` |`,
    },
    {
      title: 'stdio or Streamable HTTP',
      markdown: `| | stdio | Streamable HTTP |
|---|---|---|
| Use for | Local subprocess the client launches | Network service |
| Framing | One JSON-RPC message per line | One JSON-RPC message per POST to \`/mcp\` |
| Response | A line on stdout | JSON, or SSE for a streamed reply |
| Logs | stderr only | HTTP status plus JSON-RPC error |
| Auth | None (OS process trust) | OAuth 2.1 bearer token in \`Authorization\` |
| Safety | Exit on stdin EOF | Validate \`Origin\`, bind \`127.0.0.1\` when local |`,
    },
    {
      title: 'Token checks, in order',
      markdown: `1. Decodes? Else 401.
2. Issuer is one this server trusts? Else 401, before any key fetch.
3. Key id known? On a miss, refetch the key set once.
4. Signature valid? Else 401; no fallback.
5. Audience is this server (resource indicator)? Else 401.
6. Not expired? Else 401.
7. Scope enough for this tool? Else 403 \`insufficient_scope\`; client steps up.

Never forward this token to a downstream API: get a separate one.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| stdio client fails to parse | Logs written to stdout | Log to stderr |
| \`-32601\` | Unknown method | Add the handler or fix the name |
| \`-32602\` | Bad params or unknown resource URI | Validate against \`inputSchema\` |
| Tool failed but model never knew | Thrown as protocol error | Return \`isError: true\` with a readable message |
| Approved tool now behaves differently | Rug pull: descriptor changed | Pin a hash of the full descriptor; re-approve on change |
| Wrong server's tool called | Two servers expose one name | Namespace names; reject collisions |`,
    },
  ],
};

export default sheet;
