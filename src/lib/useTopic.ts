// Full topic bodies for pages (Topic, Exam, Practice, path practice): undefined while loading. A failed chunk load
// is thrown, so the router's error page shows (the next visit retries).
import { useEffect, useState } from 'react';
import { loadedTopic, loadTopic, TOPIC_BY_ID } from '../content';
import type { Topic } from '../types';

export function useTopics(ids: string[]): Topic[] | undefined {
  const key = ids.join(',');
  const ready = () => {
    const ts = ids.map(loadedTopic);
    return ts.every(Boolean) ? (ts as Topic[]) : undefined;
  };
  const [state, setState] = useState<{ key: string; topics?: Topic[]; error?: unknown }>(() => ({ key, topics: ready() }));
  useEffect(() => {
    let live = true;
    Promise.all(key ? key.split(',').map(loadTopic) : []).then(
      (topics) => live && setState((s) => (s.key === key && s.topics ? s : { key, topics })),
      (error: unknown) => live && setState({ key, error }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (state.key === key && state.error) throw state.error;
  return state.key === key && state.topics ? state.topics : ready();
}

/** the full topic; undefined while loading, null when no topic has this id */
export function useTopic(id: string): Topic | undefined | null {
  const known = TOPIC_BY_ID.has(id);
  const ts = useTopics(known ? [id] : []);
  return known ? ts?.[0] : null;
}
