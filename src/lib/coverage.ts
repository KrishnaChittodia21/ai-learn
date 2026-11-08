// Pure data behind the Today hero's coverage network (src/components/NeuralCoverage.tsx): which topics form
// each level layer, each topic's neuron state and the per-level covered counts. Type-only imports, so it
// can be unit-tested in plain node.
import type { Level, TopicMeta } from '../types';
import type { TopicStatus } from './stats';

export type NodeState = 'covered' | 'progress' | 'new';
const STATE_OF: Record<TopicStatus, NodeState> = { passed: 'covered', 'in-progress': 'progress', new: 'new' };

/** One layer per level, topics kept in the given (phase-then-topic) order. */
export function levelLayers<T extends TopicMeta>(topics: T[], levels: { id: Level }[], levelOf: Map<string, Level | undefined>): T[][] {
  return levels.map((lv) => topics.filter((t) => levelOf.get(t.id) === lv.id));
}

/** "passed,new,…" (topic order) → topic id → neuron state; a stable key keeps the pulse loop from restarting on hover */
export function parseStates(key: string, topics: TopicMeta[]): Map<string, NodeState> {
  const parts = key.split(',');
  return new Map(topics.map((t, i) => [t.id, STATE_OF[parts[i] as TopicStatus] ?? 'new']));
}

/** covered / total topics of each layer */
export function layerCounts(layers: TopicMeta[][], st: Map<string, NodeState>) {
  return layers.map((ts) => ({ done: ts.filter((t) => st.get(t.id) === 'covered').length, total: ts.length }));
}
