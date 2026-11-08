// Loads full topic bodies on demand and caches them (src/content/index.ts wires it to one lazy chunk per topic).
// No Vite imports, so tests/topic-index.test.ts can drive it with fake loaders.
import type { Topic } from '../types.ts';

export function topicLoader(loaders: Record<string, () => Promise<{ default: Topic }>>) {
  const pending = new Map<string, Promise<Topic>>();
  const done = new Map<string, Topic>();
  return {
    /** the full topic; one import per id, retried after a failed load */
    load(id: string): Promise<Topic> {
      let hit = pending.get(id);
      if (!hit) {
        const load = loaders[id];
        if (!load) return Promise.reject(new Error(`Unknown topic "${id}"`));
        hit = load().then((m) => {
          done.set(id, m.default);
          return m.default;
        });
        hit.catch(() => pending.delete(id));
        pending.set(id, hit);
      }
      return hit;
    },
    /** the topic if it has already loaded */
    peek: (id: string): Topic | undefined => done.get(id),
  };
}
