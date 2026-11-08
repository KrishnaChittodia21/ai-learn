import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['agent-skills.md', 'skill-trust-evals.md'],
  blocks: [
    {
      title: 'Skill or something else?',
      markdown: `| Need | Use |
|---|---|
| Must run on every event, no judgment | Hook |
| A typed external capability (API, database) | MCP tool |
| A procedure the model applies with judgment | Skill |
| Work that needs its own clean context | Subagent |
| Standing rules for every task in the repo | Repo instructions |

Who may invoke: shared (default), human-only, model-only or disabled. An explicit \`/skill-name\` still passes every permission gate.`,
    },
    {
      title: 'Limits worth knowing',
      markdown: `| Field | Limit |
|---|---|
| \`name\` | ≤ 64 chars, matches the folder |
| \`description\` | ≤ 1024 chars: what + when + when not |
| \`compatibility\` | ≤ 500 chars, optional |

Hosts also cap the catalog size, so a skill with a long or vague description can be cut from the catalog or never picked.`,
    },
    {
      title: 'Isolation boundaries',
      markdown: `| Layer | Isolates | Does not isolate | Use for |
|---|---|---|---|
| Restricted subprocess | Env, cwd, timeout, output size | Kernel, host files, network | Reviewed local utilities |
| Container | Filesystem and process namespaces | Shared kernel, host mounts | Builds and tests |
| MicroVM | Separate guest kernel | Bad mounts, credentials, egress | Untrusted, high-impact code |

\`allowed-tools\` shapes permission prompts; it is not OS isolation. A matching hash proves the bytes, not that the bundle is safe.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Model never picks the skill | Vague description, or catalog budget cut it | Rewrite the trigger; check catalog size |
| Two skills fire on the same request | Overlapping wording | Add a "do not use for" boundary; test near misses |
| Skill missing after install | Host did not rescan | New session or rescan |
| Routing evals look great, users complain | Only positive cases tested | Score precision and recall with negatives and near misses |`,
    },
  ],
};

export default sheet;
