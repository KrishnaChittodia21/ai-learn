// Extra Cheat sheet blocks (C4), fetched with a dynamic import so they stay out of the startup chunk.
import { useEffect, useState } from 'react';
import type { TopicCheatsheet } from '../lib/cheatsheets';
import { Markdown } from './ui';
import { RouteSkeleton } from './RouteSkeleton';

const SHEETS = import.meta.glob<{ default: TopicCheatsheet }>('../content/cheatsheets/*.ts');

export function CheatExtra({ topicId }: { topicId: string }) {
  const load = SHEETS[`../content/cheatsheets/${topicId}.ts`];
  const [sheet, setSheet] = useState<{ id: string; cs: TopicCheatsheet } | null>(null);
  useEffect(() => {
    if (!load) return;
    let live = true;
    load()
      .then((m) => live && setSheet({ id: topicId, cs: m.default }))
      .catch(() => {}); // offline / stale chunk: the bullets above are still there
    return () => {
      live = false;
    };
  }, [load, topicId]);
  if (!load) return null;
  if (sheet?.id !== topicId) return <RouteSkeleton kind="viz" label="Loading reference tables" />;
  return (
    <section className="cheat-extra" aria-label="Reference tables">
      <div className="cheat-extra-grid">
        {sheet.cs.blocks.map((b) => (
          <div className="cheat-block" key={b.title}>
            <h3>{b.title}</h3>
            <Markdown>{b.markdown}</Markdown>
          </div>
        ))}
      </div>
      <p className="cheat-credit">
        Adapted from the <a href="https://github.com/rohitg00/ai-engineering-from-scratch">ai-engineering-from-scratch</a> cheatsheets
        (MIT, © 2026 Rohit Ghumare): {sheet.cs.source.join(', ')}
      </p>
    </section>
  );
}
