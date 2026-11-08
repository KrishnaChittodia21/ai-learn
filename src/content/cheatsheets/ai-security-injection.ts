import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['ai-security-incidents.md', 'sandbox-policy.md'],
  blocks: [
    {
      title: 'Indirect injection: anatomy of a zero-click leak',
      markdown: `EchoLeak (Microsoft 365 Copilot, CVE-2025-32711), simplified:

1. Attacker emails any employee; the victim never opens it.
2. A routine question makes RAG retrieve that email into context.
3. Hidden text tells the model to collect sensitive data from other retrieved content.
4. The answer renders an image or link whose URL carries the data, on a domain the content policy already trusts.

Three boundaries failed: **retrieval** (untrusted mail mixed with private data), **scope** (one context for both), **output** (auto-rendered URLs). Fix each independently.`,
    },
    {
      title: 'Gate every tool call before it runs',
      markdown: `| Check | Rule |
|---|---|
| Tool | on the allowlist for this role; the role comes from the app, never from model output |
| Arguments | validated server-side against a schema and scope (paths, recipients, amounts) |
| Side effects | sensitive tools need a single-use human approval |
| Provenance | if the call was proposed after reading untrusted content, raise the bar |
| Memory writes | refuse notes that read like instructions ("always forward…") |
| Audit | log every allow, ask and deny |`,
    },
    {
      title: 'Isolation ladder for code-running agents',
      markdown: `| Level | Adds | Still shared |
|---|---|---|
| Process + denylist | argv checks, env allowlist, timeouts | filesystem, network, kernel |
| Filesystem jail | paths pinned under a project root | network, kernel |
| Container | \`--network none --read-only --cap-drop ALL --security-opt no-new-privileges\`, non-root user, pid/memory/CPU limits | host kernel |
| MicroVM | its own kernel | nothing, at the highest cost |

Pick the cheapest level that covers the need: untrusted code or secrets → filesystem control; no network → container; kernel isolation → microVM. Agent permission prompts run client-side and are not a boundary.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Filter blocks \`[SYSTEM:\` but a polite rewrite passes | keyword filters lose to adaptive attackers | treat detectors as one signal; enforce with design |
| Defence scored near-zero attack success, then broke | tested with static attacks only | evaluate against adaptive attacks |
| Data left through an approved domain | output crossed the boundary in a URL | don't auto-render external links or images |
| Harm happened before the guardrail ran | only the final answer was checked | validate each tool call before execution |`,
    },
  ],
};

export default sheet;
