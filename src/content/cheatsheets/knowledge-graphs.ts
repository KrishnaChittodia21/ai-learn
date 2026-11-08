import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['graphs-knowledge-graphs.md'],
  blocks: [
    {
      title: 'Text to graph, in order',
      markdown: `1. **NER**: find entity mentions.
2. **Coreference**: resolve "he" / "the company" before extracting relations.
3. **Entity linking**: map each mention to one canonical id — or NIL if none fits.
4. **Relation extraction**: (subject, relation, object) with the source span.
5. **Verify**: the span must match the source text; reject unsupported triples.
6. **Canonicalise**: map free-text relations to a closed set of types.
7. **Load**: store each edge with doc id, span and timestamps.`,
    },
    {
      title: 'Troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| Popular entity always wins | Popularity prior too strong | Weigh context more; domain tuning |
| Right entity never considered | Low candidate recall | Measure candidate recall before disambiguation |
| New name linked to a wrong entity | Not in the graph | Predict NIL above a score threshold |
| "He founded it" produces nothing | No coreference step | Run coref first |
| Triples the text never states | LLM hallucination | Verify every span against the source |
| Graph cannot be queried | Relation names drift | Collapse to canonical relation types |
| Hundreds of edges per message | Noisy extractor | Cap writes per call; raise confidence floor |`,
    },
    {
      title: 'Rules of thumb',
      markdown: `- Report two linking numbers: candidate recall and disambiguation accuracy — 99% accuracy on 80% recall is an 80% pipeline.
- Add start and end times to relations that change (employer, CEO, address); query the valid-at-time subgraph.
- Canonicalisation is where most of the engineering effort goes; budget for it.
- Graph algorithms (PageRank, components, BFS hops) are library calls — use networkx or the database's built-ins.`,
    },
  ],
};

export default sheet;
