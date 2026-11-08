import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['rag-production.md'],
  blocks: [
    {
      title: 'Diff an incoming snapshot',
      markdown: `| Incoming doc | Index action |
|---|---|
| New id | Insert |
| Same id, content hash changed | Update: re-chunk, re-embed changed chunks |
| Same id, same hash, newer timestamp | Refresh metadata only |
| Id missing from a full listing | Delete all its chunks |
| Two incoming docs share an id | Reject the batch |

Normalise before hashing (Unicode form, line endings, trimmed whitespace) or every run looks like a change.`,
    },
    {
      title: 'Safe commit',
      markdown: `1. Read the current index version.
2. Build the change set.
3. Commit only if the version is still the one you read (optimistic check).
4. Write to a temp location, then swap atomically.
5. On a version conflict: reload, re-diff, retry.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Deleted policy still cited | No tombstones | Delete chunks for missing ids |
| Edited doc still answers old text | Index lags the source | Incremental sync + periodic full reconcile |
| "Stale version" error | Another writer committed first | Reload the snapshot, retry |
| Boilerplate floods results | Generated files indexed | Flag and down-weight or exclude |
| Old evidence keeps winning | No freshness rule | Filter or decay by document age |`,
    },
  ],
};

export default sheet;
