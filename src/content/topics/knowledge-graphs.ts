import type { Topic } from '../../types';

const topic: Topic = {
  id: 'knowledge-graphs',
  phase: 'frameworks',
  order: 5,
  title: 'Knowledge Graphs for LLM Systems',
  subtitle:
    'Model facts as entities and relationships, store and query them in a graph database, build them with LLM extraction and entity resolution, and retrieve over them alongside vectors',
  estimatedMinutes: 60,
  sources: [
    'Neo4j Cypher Manual (Cypher 25) — MERGE, constraints, variable-length patterns, vector indexes, SEARCH clause (2026.01+); db.index.vector.queryNodes deprecated in 2026.04',
    'Neo4j JavaScript driver manual — driver.executeQuery, routing, integers',
    'W3C RDF 1.1 Concepts — triples, IRIs; W3C SPARQL 1.1',
    'OpenAI docs — Structured Outputs with zod (zodTextFormat, responses.parse)',
    'Christen 2012 — Data Matching (blocking, Jaro-Winkler, record linkage); Papadakis et al. 2020 — Blocking and Filtering Techniques for Entity Resolution',
    'Edge et al. 2024 — From Local to Global: A Graph RAG Approach (Microsoft GraphRAG)',
    'Gutiérrez et al. 2024 — HippoRAG: Neurobiologically Inspired Long-Term Memory for LLMs',
    'Neo4j GraphRAG / Text2Cypher guidance — schema-in-prompt, read-only execution',
  ],
  tags: ['knowledge-graphs', 'neo4j', 'cypher', 'entity-extraction', 'entity-resolution', 'graph-retrieval', 'rag'],
  cheatSheet: [
    'A knowledge graph stores facts as (subject, predicate, object) triples: nodes = entities, edges = typed relationships, both with properties.',
    'Property graph (Neo4j, Cypher) puts properties on nodes and edges; RDF (SPARQL) uses IRIs and pure triples with formal ontologies (OWL).',
    'Cypher: MATCH patterns (a)-[:REL]->(b), MERGE for idempotent upserts, UNIQUE constraints on ids, variable-length paths [:REL*1..3] with explicit upper bounds.',
    'Neo4j vector index: CREATE VECTOR INDEX … OPTIONS { indexConfig: { `vector.dimensions`: 1536, `vector.similarity_function`: \'cosine\' } }; query with the SEARCH clause (2026.01+) or db.index.vector.queryNodes on older versions.',
    'LLM extraction: constrain to an allowed schema of entity and relation types with zod/JSON Schema; keep evidence spans, source ids and confidence for every edge.',
    'Entity resolution pipeline: normalise → block (cheap candidate keys) → score (string similarity + embeddings + attributes) → LLM/human adjudication for the grey zone → canonical id + alias edges.',
    'Blocking cuts n² comparisons: 1M mentions all-pairs ≈ 5×10^11 comparisons; blocks of ~50 bring it to ≈ 2.5×10^7.',
    'Graph-based retrieval: seed entities (vector/keyword/NER) → k-hop expansion with relation filters and degree caps → rank paths → serialise facts with provenance into the prompt.',
    'Text2Cypher: put the schema in the prompt, execute on a read-only user with timeouts and LIMIT, validate the query before running it.',
    'Graphs win on multi-hop, aggregation and exact relationships ("which suppliers of X are in sanctioned countries"); vectors win on fuzzy semantic recall: combine them.',
  ],
  sections: [
    {
      heading: 'Knowledge Graphs — entities, relationships, triples and schemas',
      body: `**Intuition:** a knowledge graph is a mind map a computer can query: dots are *things* (people, companies, products), arrows are *named relationships* (WORKS_AT, ACQUIRED), and both carry facts.

**The atom is a triple:** \`(Acme, ACQUIRED, Globex)\` = subject, predicate, object. Thousands of triples connect into a graph you can traverse: "Who works at companies Acme acquired?" is a 2-hop walk.

**Two families**

| | Property graph | RDF |
|---|---|---|
| Model | Nodes + edges, both with key/value properties | Pure triples; IRIs identify everything |
| Query | Cypher / GQL (ISO standard) | SPARQL |
| Schema | Labels + constraints (often loose) | Ontologies (RDFS/OWL), formal reasoning |
| Typical use | Application graphs, GraphRAG, fraud | Linked data, biomedical, publishing |

**Schema (ontology) matters for LLM systems.** Decide up front: entity types (Person, Organization, Product), relation types with direction (Person -WORKS_AT-> Organization), required properties (id, name, source). Without it, extraction produces 40 synonyms of "works for" and the graph is unqueryable.

**Why LLM apps want graphs:** vectors find *similar text*; graphs answer *structural* questions: multi-hop chains, counts and aggregations, exact relationships, and explainable paths ("answer came via A → B → C").

**When to use:** domains rich in entities and relationships (supply chains, org charts, compliance, biomedical, IT dependencies) and questions that combine facts across documents. For "summarise this policy", plain RAG is enough.`,
      example: `**Supply-chain question:** "Which of our suppliers depend on a factory in a sanctioned region?"

Triples extracted from 1,200 contracts and registries:
- \`(BoltCo, SUPPLIES, Us)\`, \`(BoltCo, SOURCES_FROM, Factory-17)\`, \`(Factory-17, LOCATED_IN, Region-X)\`, \`(Region-X, HAS_STATUS, sanctioned)\`

Graph answer = a 3-hop path Us ← SUPPLIES ← BoltCo → SOURCES_FROM → Factory-17 → LOCATED_IN → Region-X, returned in ~20 ms with the path as evidence.

Vector RAG over the same documents retrieved the BoltCo contract (similarity 0.81) but not the registry entry linking Factory-17 to Region-X (similarity 0.42 to the question), so it answered "no suppliers found": the fact chain was spread across 3 documents with no single chunk containing it.`,
      diagram: `   (Us)◄──SUPPLIES──(BoltCo)──SOURCES_FROM──►(Factory-17)
                       │ name: "BoltCo Ltd"         │
                       │ founded: 1998              LOCATED_IN
                       ▼                            ▼
                 (Person: Ana)──WORKS_AT──►      (Region-X {status:'sanctioned'})

  triple = (subject) -[PREDICATE {props}]-> (object)
  schema: Person -WORKS_AT-> Organization ; Organization -SUPPLIES-> Organization
          Organization -SOURCES_FROM-> Facility -LOCATED_IN-> Region`,
      code: [
        {
          language: 'typescript',
          title: 'Triples, a typed schema and a k-hop traversal in plain TypeScript',
          code: `type EntityType = 'Organization' | 'Facility' | 'Region' | 'Person';
type Rel = 'SUPPLIES' | 'SOURCES_FROM' | 'LOCATED_IN' | 'WORKS_AT';
type Triple = { s: string; p: Rel; o: string; source: string };

// Schema: which (subjectType, relation, objectType) combinations are legal
const SCHEMA: Record<Rel, [EntityType, EntityType]> = {
  SUPPLIES: ['Organization', 'Organization'],
  SOURCES_FROM: ['Organization', 'Facility'],
  LOCATED_IN: ['Facility', 'Region'],
  WORKS_AT: ['Person', 'Organization'],
};
const types: Record<string, EntityType> = { Us: 'Organization', BoltCo: 'Organization', 'Factory-17': 'Facility', 'Region-X': 'Region' };

const triples: Triple[] = [
  { s: 'BoltCo', p: 'SUPPLIES', o: 'Us', source: 'contract-88.pdf' },
  { s: 'BoltCo', p: 'SOURCES_FROM', o: 'Factory-17', source: 'audit-2026.pdf' },
  { s: 'Factory-17', p: 'LOCATED_IN', o: 'Region-X', source: 'registry.csv' },
];

// Reject triples that violate the schema (catches extraction errors early)
const valid = triples.filter((t) => SCHEMA[t.p][0] === types[t.s] && SCHEMA[t.p][1] === types[t.o]);

// Adjacency list for outgoing edges
const out = new Map<string, Triple[]>();
for (const t of valid) out.set(t.s, [...(out.get(t.s) ?? []), t]);

// Breadth-first k-hop expansion that keeps the path (= the explanation)
export function paths(start: string, maxHops: number): Triple[][] {
  const result: Triple[][] = [];
  let frontier: Triple[][] = (out.get(start) ?? []).map((t) => [t]);
  for (let hop = 1; hop <= maxHops && frontier.length; hop++) {
    result.push(...frontier);
    frontier = frontier.flatMap((p) => (out.get(p.at(-1)!.o) ?? []).map((t) => [...p, t]));
  }
  return result;
}

console.log(paths('BoltCo', 2).map((p) => p.map((t) => t.s + ' -' + t.p + '-> ' + t.o).join(' | ')));`,
        },
      ],
      prosCons: {
        pros: [
          'Answers multi-hop and aggregate questions that no single text chunk contains.',
          'Explainable: the traversal path is the evidence, with a source per edge.',
          'Exact, structured facts (dates, amounts, relationships) avoid fuzzy similarity errors.',
          'A shared schema integrates data from documents, databases and APIs into one model.',
        ],
        cons: [
          { con: 'Building and maintaining the graph is expensive (extraction, resolution, updates).', fix: 'Start with a narrow schema for the highest-value questions, extract incrementally, and reuse structured sources (databases, registries) before LLM extraction.' },
          { con: 'Schema drift: extraction invents relation types and the graph becomes inconsistent.', fix: 'Constrain extraction to an enum of types, validate triples against the schema, and route unknown types to a review queue.' },
          { con: 'Stale facts persist after source documents change.', fix: 'Store source id and extraction timestamp on every edge, and re-extract or retire edges when a source document is updated.' },
        ],
      },
      keyPoints: [
        'Triples (subject, predicate, object) are the unit; the schema says which are legal.',
        'Property graphs + Cypher dominate LLM app stacks; RDF + SPARQL where formal ontologies matter.',
        'Graphs shine at multi-hop, aggregation and explainability.',
        'Keep provenance (source, timestamp, confidence) on every edge.',
      ],
      exercise: {
        prompt: `Extend the traversal into \`explain(start, target, maxHops)\` that returns the **shortest path** from \`start\` to \`target\` as a readable string with sources, or \`null\`.

Acceptance: uses BFS with a visited set (no cycles); respects maxHops; output like \`BoltCo -SOURCES_FROM-> Factory-17 [audit-2026.pdf] | Factory-17 -LOCATED_IN-> Region-X [registry.csv]\`.`,
        hints: [
          'Queue entries are { node, path }; mark nodes visited when enqueued.',
          'Stop when you dequeue the target or when path length exceeds maxHops.',
          'Format each triple with its source in brackets and join with " | ".',
        ],
        solution: {
          language: 'typescript',
          code: `type Triple = { s: string; p: string; o: string; source: string };
declare const out: Map<string, Triple[]>; // adjacency from the section code

export function explain(start: string, target: string, maxHops: number): string | null {
  const queue: { node: string; path: Triple[] }[] = [{ node: start, path: [] }];
  const visited = new Set([start]);
  while (queue.length) {
    const { node, path } = queue.shift()!;
    if (node === target) {
      return path.map((t) => t.s + ' -' + t.p + '-> ' + t.o + ' [' + t.source + ']').join(' | ');
    }
    if (path.length >= maxHops) continue; // hop budget
    for (const t of out.get(node) ?? []) {
      if (visited.has(t.o)) continue; // avoid cycles
      visited.add(t.o);
      queue.push({ node: t.o, path: [...path, t] });
    }
  }
  return null;
}`,
        },
        explanation: 'BFS guarantees the first time the target is dequeued it is via a shortest path, and the visited set prevents infinite loops on cyclic graphs. Returning sources with each hop makes the answer auditable, which is the main selling point of graph retrieval.',
      },
      quickCheck: {
        question: 'Which question benefits most from a knowledge graph over plain vector RAG?',
        options: [
          'Summarise the vacation policy',
          'List board members of companies acquired by firms our CEO previously worked at',
          'Translate the FAQ into Spanish',
          'Find documents similar to this paragraph',
        ],
        correct: 1,
        explanation: 'It is a multi-hop relational query (CEO → WORKED_AT → firm → ACQUIRED → company → BOARD_MEMBER) whose facts live in different documents. Summaries, translation and similarity search are what text retrieval already does well.',
      },
      source: 'W3C RDF 1.1 Concepts; Neo4j Cypher Manual',
    },
    {
      heading: 'Graph Databases — Neo4j, Cypher patterns, constraints and vector indexes',
      body: `**Intuition:** a graph database stores the arrows themselves, so following a relationship is a pointer hop instead of a JOIN. A 4-hop question stays fast because cost depends on the neighbourhood you touch, not the table size.

**Cypher essentials (Neo4j)**
- **Pattern matching:** \`MATCH (p:Person)-[:WORKS_AT]->(o:Organization {name: $name}) RETURN p.name\`.
- **Idempotent writes:** \`MERGE (o:Organization {id: $id}) ON CREATE SET o.name = $name\`; MERGE on the *key* only, then SET other properties.
- **Constraints:** \`CREATE CONSTRAINT org_id IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE\` (also creates an index, making MERGE fast and duplicate-free).
- **Variable-length paths:** \`(a)-[:SUPPLIES*1..3]->(b)\`; always set an upper bound.
- **Batching:** \`UNWIND $rows AS row MERGE ...\` with 1K–10K rows per transaction.
- **Vector index:** \`CREATE VECTOR INDEX chunk_emb ... OPTIONS { indexConfig: {...} }\`; from Neo4j 2026.01 query it with the Cypher 25 \`SEARCH\` clause (supports in-index \`WHERE\` filters); the older \`db.index.vector.queryNodes\` procedure is deprecated from 2026.04.

| | Relational (SQL) | Graph (Cypher) |
|---|---|---|
| Multi-hop | Recursive CTE / N joins | Path pattern |
| Schema change | Migrations | Add labels/rel types freely |
| Aggregates over large tables | Excellent | Good |

**Driver:** \`driver.executeQuery(cypher, params, { database, routing })\` handles sessions, retries and routing. Always pass parameters (\`$name\`), never string-concatenate values (Cypher injection, and no plan caching).

**When to use:** relationship-heavy queries and knowledge graphs. Keep transactional source-of-truth data in your OLTP database and sync it.`,
      example: `**Loading 50,000 extracted triples.** Naive: one \`CREATE\` per triple, no constraint → 50,000 round trips (~8 minutes) and 3,100 duplicate Organization nodes ("Acme" created once per mention).

Fixed: \`CREATE CONSTRAINT org_id ... IS UNIQUE\`, then \`UNWIND $rows\` in batches of 5,000 with \`MERGE\` on \`id\` → 10 transactions, ~9 seconds, zero duplicates.

Query "suppliers within 3 hops of Us located in sanctioned regions":
\`MATCH p = (s:Organization)-[:SUPPLIES*1..3]->(:Organization {id:'us'}) MATCH (s)-[:SOURCES_FROM]->(:Facility)-[:LOCATED_IN]->(r:Region {status:'sanctioned'}) RETURN s.name, length(p)\` → 2 rows in 14 ms on a 2M-edge graph. The equivalent SQL needed 3 self-joins plus a union for each depth.`,
      diagram: `  ingest rows ──► UNWIND $rows AS row  (batch 1K–10K)
                     MERGE (a:Organization {id: row.s})   ◄─ UNIQUE constraint
                     MERGE (b:Organization {id: row.o})
                     MERGE (a)-[r:SUPPLIES]->(b) SET r.source = row.src

  query:  (s)-[:SUPPLIES*1..3]->(us)      bounded variable-length path
          (c:Chunk) SEARCH c IN (VECTOR INDEX chunk_emb FOR $q LIMIT 10)
                 └─► (c)-[:MENTIONS]->(e:Entity)  graph expansion from vector hits`,
      code: [
        {
          language: 'typescript',
          title: 'Constraints, batched MERGE upserts and a bounded path query with neo4j-driver',
          code: `import neo4j from 'neo4j-driver';

const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
const db = { database: 'neo4j' };

type Row = { s: string; sName: string; o: string; oName: string; source: string; confidence: number };

export async function setup() {
  // Unique constraints double as indexes, making MERGE fast and duplicate-free
  await driver.executeQuery('CREATE CONSTRAINT org_id IF NOT EXISTS FOR (o:Organization) REQUIRE o.id IS UNIQUE', {}, db);
  await driver.executeQuery(
    "CREATE VECTOR INDEX chunk_emb IF NOT EXISTS FOR (c:Chunk) ON c.embedding " +
      "OPTIONS { indexConfig: { \`vector.dimensions\`: 1536, \`vector.similarity_function\`: 'cosine' } }",
    {}, db,
  );
}

export async function upsertSupplies(rows: Row[]) {
  for (let i = 0; i < rows.length; i += 5000) {
    await driver.executeQuery(
      'UNWIND $rows AS row ' +
        'MERGE (a:Organization {id: row.s}) ON CREATE SET a.name = row.sName ' + // MERGE on the key only
        'MERGE (b:Organization {id: row.o}) ON CREATE SET b.name = row.oName ' +
        'MERGE (a)-[r:SUPPLIES]->(b) ' +
        'SET r.source = row.source, r.confidence = row.confidence, r.updatedAt = datetime()',
      { rows: rows.slice(i, i + 5000) }, db,
    );
  }
}

export async function sanctionedSuppliers(customerId: string) {
  const { records } = await driver.executeQuery(
    'MATCH p = (s:Organization)-[:SUPPLIES*1..3]->(:Organization {id: $customerId}) ' + // bounded depth
      "MATCH (s)-[:SOURCES_FROM]->(:Facility)-[:LOCATED_IN]->(r:Region {status: 'sanctioned'}) " +
      'RETURN DISTINCT s.name AS supplier, r.name AS region, length(p) AS hops ORDER BY hops LIMIT 50',
    { customerId },
    { ...db, routing: neo4j.routing.READ },
  );
  return records.map((r) => ({ supplier: r.get('supplier'), region: r.get('region'), hops: neo4j.integer.toNumber(r.get('hops')) }));
}`,
        },
      ],
      prosCons: {
        pros: [
          'Multi-hop traversals are short, readable patterns and stay fast on local neighbourhoods.',
          'Flexible schema: new labels and relationship types without migrations.',
          'Vectors, full-text and graph in one store enables hybrid retrieval in a single query.',
          'executeQuery handles routing and transient-error retries in clustered deployments.',
        ],
        cons: [
          { con: 'MERGE on a full property map or without a constraint creates duplicates and is slow.', fix: 'Create UNIQUE constraints on ids and MERGE only on the key property, then SET the rest.' },
          { con: 'Unbounded variable-length paths explode on supernodes (e.g. a "USA" node with 2M edges).', fix: 'Always cap depth (*1..3), filter relationship types, and exclude or cap high-degree nodes in traversals.' },
          { con: 'Neo4j integers come back as Integer objects, surprising JS code.', fix: 'Convert with neo4j.integer.toNumber (or toString for big values) or configure the driver to return native numbers when values are small.' },
          { con: 'Cypher syntax and vector APIs change across versions (SEARCH clause vs procedures).', fix: 'Pin the server version, prefix queries with the Cypher language version you target, and wrap queries in a data-access module.' },
        ],
      },
      keyPoints: [
        'MERGE on a constrained key; SET the other properties.',
        'Batch writes with UNWIND $rows.',
        'Bound every variable-length path and beware supernodes.',
        'Parameters always: never concatenate user input into Cypher.',
      ],
      exercise: {
        prompt: `Write \`neighbours(entityId, relTypes, maxHops)\` returning up to 25 distinct neighbour entities with the shortest hop count.

Acceptance:
- Validates \`maxHops\` is 1–3 and \`relTypes\` only contains allowed types (\`WORKS_AT\`, \`SUPPLIES\`, \`ACQUIRED\`), because relationship types cannot be parameterised in Cypher.
- Excludes the start node and any node with \`degree > 10000\` (store a precomputed \`n.degree\` property).
- Uses parameters for all values.`,
        hints: [
          'Build the type alternation string (WORKS_AT|SUPPLIES) only from the allow-list.',
          'Interpolate the validated integer maxHops into *1..N; pass ids as parameters.',
          'Use min(length(p)) grouped by neighbour and ORDER BY hops.',
        ],
        solution: {
          language: 'typescript',
          code: `import neo4j, { type Driver } from 'neo4j-driver';

const ALLOWED = new Set(['WORKS_AT', 'SUPPLIES', 'ACQUIRED']);

export async function neighbours(driver: Driver, entityId: string, relTypes: string[], maxHops: number) {
  if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 3) throw new Error('maxHops must be 1-3');
  if (!relTypes.length || relTypes.some((t) => !ALLOWED.has(t))) throw new Error('invalid relationship type');
  const rels = relTypes.join('|'); // safe: only allow-listed identifiers reach the query text
  const cypher =
    'MATCH p = (start {id: $id})-[:' + rels + '*1..' + maxHops + ']-(n) ' +
    'WHERE n <> start AND coalesce(n.degree, 0) <= 10000 ' + // skip supernodes
    'RETURN n.id AS id, n.name AS name, min(length(p)) AS hops ORDER BY hops LIMIT 25';
  const { records } = await driver.executeQuery(cypher, { id: entityId }, { database: 'neo4j', routing: neo4j.routing.READ });
  return records.map((r) => ({ id: r.get('id'), name: r.get('name'), hops: neo4j.integer.toNumber(r.get('hops')) }));
}`,
        },
        explanation: 'Values go in parameters, but identifiers (relationship types) and the hop bound are part of the query text, so they must come from a strict allow-list and validated integer. The supernode filter and LIMIT keep the traversal bounded even on hub entities.',
      },
      quickCheck: {
        question: 'Why does `MERGE (o:Organization {id: $id, name: $name})` cause duplicates when the same company arrives with a slightly different name?',
        options: [
          'MERGE never deduplicates',
          'MERGE matches on the whole property map, so a different name means no match and a new node is created',
          'Constraints are ignored by MERGE',
          'Because $name is a parameter',
        ],
        correct: 1,
        explanation: 'MERGE looks for a node with all given properties; a new spelling fails to match and creates another node (or violates the constraint). MERGE on the key alone, then SET name. Constraints are enforced, and parameters are the right practice.',
      },
      source: 'Neo4j Cypher Manual — MERGE, constraints, vector indexes; Neo4j JavaScript driver manual',
    },
    {
      heading: 'Entity Extraction — LLM-based entities and relations with schemas and provenance',
      body: `**Intuition:** extraction turns sentences into triples: "In 2024 Acme bought Globex for $2.1B" → \`(Acme, ACQUIRED {year: 2024, amount: 2.1e9}, Globex)\`. The LLM is the reader; your schema is the form it must fill in.

**Pipeline**
1. **Chunk** documents (~500–1,500 tokens) so the model sees enough context per relation.
2. **Constrain** output with a zod/JSON Schema: entity types and relation types as **enums**, required evidence span, confidence. Structured outputs guarantee parseable JSON.
3. **Ground**: require each relation's \`evidence\` to be a verbatim quote; reject relations whose quote is not in the chunk (cheap hallucination filter).
4. **Validate** against the graph schema (Person -WORKS_AT-> Organization only).
5. **Attach provenance**: \`docId\`, \`chunkId\`, model version, timestamp.
6. Hand mentions to **entity resolution** (next section): extraction produces *mentions*, not canonical entities.

| Approach | Precision | Cost | Use when |
|---|---|---|---|
| Classic NER (spaCy, GLiNER) | Good for standard types | Very low | People/places/orgs at scale |
| LLM + schema | High, flexible types | Medium–high | Domain relations, nuance |
| Hybrid: NER first, LLM for relations | High | Medium | Large corpora |

**Gleaning:** a second "did you miss any?" pass increases recall (~10–20% more relations in practice) at ~2x cost; use on high-value documents.

**When to use:** whenever relationships live in unstructured text. Prefer structured sources (databases, registries) where they exist.`,
      example: `**Chunk (press release):** "Globex, the Berlin-based robotics firm, was acquired by Acme Corp in March 2024. Globex CEO Lena Ortiz will join Acme's board."

**Output (validated):**
- Entities: Acme Corp (Organization), Globex (Organization), Berlin (Location), Lena Ortiz (Person)
- Relations: \`Acme Corp -ACQUIRED{date:'2024-03'}-> Globex\` (evidence: "was acquired by Acme Corp in March 2024", conf 0.97); \`Globex -LOCATED_IN-> Berlin\` (0.93); \`Lena Ortiz -WORKS_AT{role:'CEO'}-> Globex\` (0.95); \`Lena Ortiz -BOARD_MEMBER_OF-> Acme Corp\` (0.88).

A first draft also produced \`Acme -HEADQUARTERED_IN-> Berlin\` with evidence "Acme's Berlin headquarters", a quote **not present** in the chunk → rejected by the evidence check. Across 2,000 chunks this filter removed 6.4% of relations, 81% of which a human judged wrong.`,
      diagram: `  document ─► chunks (≈1K tokens, with docId/chunkId)
                 │
           LLM + zod schema (enums for types, evidence, confidence)
                 │ structured output (always parseable)
                 ▼
     ┌── evidence quote ∈ chunk? ── no ──► drop / review queue
     │ yes
     ├── (subjType, rel, objType) allowed by schema? ── no ──► drop
     │ yes
     ▼
  mentions + relations + provenance ──► entity resolution ──► graph`,
      code: [
        {
          language: 'typescript',
          title: 'Schema-constrained extraction with OpenAI Structured Outputs, evidence and schema checks',
          code: `import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const client = new OpenAI();
const MODEL = process.env.LLM_MODEL ?? 'gpt-5-mini';

const EntityType = z.enum(['Person', 'Organization', 'Location', 'Product']);
const RelType = z.enum(['WORKS_AT', 'ACQUIRED', 'LOCATED_IN', 'BOARD_MEMBER_OF', 'PRODUCES']);
const Extraction = z.object({
  entities: z.array(z.object({ ref: z.string(), name: z.string(), type: EntityType })),
  relations: z.array(z.object({
    source: z.string().describe('entity ref'),
    type: RelType,
    target: z.string().describe('entity ref'),
    evidence: z.string().describe('verbatim quote from the text supporting this relation'),
    confidence: z.number().describe('0 to 1'),
  })),
});
const ALLOWED: Record<string, [string, string]> = {
  WORKS_AT: ['Person', 'Organization'], ACQUIRED: ['Organization', 'Organization'],
  LOCATED_IN: ['Organization', 'Location'], BOARD_MEMBER_OF: ['Person', 'Organization'],
  PRODUCES: ['Organization', 'Product'],
};

export async function extract(chunk: { id: string; text: string }) {
  const res = await client.responses.parse({
    model: MODEL,
    input: [
      { role: 'system', content: 'Extract only facts stated in the text. Use only the allowed types. Quote evidence verbatim.' },
      { role: 'user', content: chunk.text },
    ],
    text: { format: zodTextFormat(Extraction, 'extraction') },
  });
  const out = res.output_parsed;
  if (!out) return { entities: [], relations: [] };
  const byRef = new Map(out.entities.map((e) => [e.ref, e]));
  const relations = out.relations.filter((r) => {
    const s = byRef.get(r.source), t = byRef.get(r.target);
    const schemaOk = !!s && !!t && ALLOWED[r.type][0] === s.type && ALLOWED[r.type][1] === t.type;
    const grounded = chunk.text.includes(r.evidence.trim()); // drop relations with invented quotes
    return schemaOk && grounded && r.confidence >= 0.6;
  });
  return { entities: out.entities, relations: relations.map((r) => ({ ...r, chunkId: chunk.id, model: MODEL })) };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Handles domain-specific relations and nuance that off-the-shelf NER cannot.',
          'Structured outputs make results always parseable and typed.',
          'Evidence quotes make every edge auditable and enable cheap hallucination filtering.',
          'Schema changes are a prompt/enum edit, not a model retraining.',
        ],
        cons: [
          { con: 'Cost and latency at corpus scale (millions of chunks).', fix: 'Use a small model or classic NER to pre-filter chunks with ≥ 2 entities, batch requests (Batch API discounts), and run a larger model only on high-value documents.' },
          { con: 'Hallucinated or over-inferred relations.', fix: 'Require verbatim evidence and verify it is in the chunk, keep confidence thresholds, and spot-check a sample against human labels.' },
          { con: 'Inconsistent naming of the same entity across chunks ("Acme", "Acme Corp.").', fix: 'Treat outputs as mentions and run entity resolution before writing canonical nodes.' },
          { con: 'Relations spanning chunks are missed.', fix: 'Use larger or overlapping chunks, add document-level context (title, section) to each chunk, or run a gleaning pass.' },
        ],
      },
      keyPoints: [
        'Enums for entity and relation types prevent schema drift.',
        'Verbatim evidence + "quote must be in text" is a cheap, effective guard.',
        'Extraction yields mentions; resolution yields entities.',
        'Measure precision/recall on a labelled sample before scaling.',
      ],
      exercise: {
        prompt: `Write \`scoreExtraction(predicted, gold)\` to evaluate relation extraction.

Inputs are arrays of \`{ source: string; type: string; target: string }\` with **names** (not refs). Two relations match if type is equal and source/target names match after normalisation (lowercase, trim, strip punctuation and the suffixes "inc", "corp", "ltd").

Return \`{ precision, recall, f1 }\` rounded to 3 decimals. Each gold relation can be matched once.`,
        hints: [
          'Build a normalised key: norm(source) + "|" + type + "|" + norm(target).',
          'Use a Map of gold key → count to support duplicates and one-time matching.',
          'Guard against division by zero when there are no predictions.',
        ],
        solution: {
          language: 'typescript',
          code: `type R = { source: string; type: string; target: string };

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\\b(inc|corp|corporation|ltd)\\b/g, ' ').replace(/\\s+/g, ' ').trim();
const key = (r: R) => norm(r.source) + '|' + r.type + '|' + norm(r.target);
const round = (x: number) => Math.round(x * 1000) / 1000;

export function scoreExtraction(predicted: R[], gold: R[]) {
  const remaining = new Map<string, number>();
  for (const g of gold) remaining.set(key(g), (remaining.get(key(g)) ?? 0) + 1);
  let tp = 0;
  for (const p of predicted) {
    const k = key(p);
    const left = remaining.get(k) ?? 0;
    if (left > 0) { tp++; remaining.set(k, left - 1); } // each gold matched at most once
  }
  const precision = predicted.length ? tp / predicted.length : 0;
  const recall = gold.length ? tp / gold.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision: round(precision), recall: round(recall), f1: round(f1) };
}

// scoreExtraction([{source:'Acme Corp.',type:'ACQUIRED',target:'Globex'}], [{source:'acme',type:'ACQUIRED',target:'Globex Inc'}])
// → { precision: 1, recall: 1, f1: 1 }`,
        },
        explanation: 'Without a measured precision/recall on ~100 labelled chunks you cannot tell whether a prompt change helps. Light normalisation avoids penalising harmless naming variants while still requiring the right relation type and direction.',
      },
      quickCheck: {
        question: 'Why require each extracted relation to include a verbatim evidence quote?',
        options: [
          'It makes the JSON smaller',
          'You can verify the quote exists in the source chunk, filtering hallucinated relations and giving auditable provenance',
          'Graph databases require it',
          'It increases recall',
        ],
        correct: 1,
        explanation: 'A string-containment check catches relations the model invented, and the quote shows users why an edge exists. It makes output larger, not smaller, and it tends to trade a little recall for precision.',
      },
      source: 'OpenAI docs — Structured Outputs; Edge et al. 2024 — GraphRAG (gleaning)',
    },
    {
      heading: 'Entity Resolution — blocking, similarity scoring and LLM adjudication',
      body: `**Intuition:** entity resolution (ER) answers "are these two mentions the same real-world thing?" — "IBM", "International Business Machines" and "I.B.M. Corp" → one node; "Apple" (fruit company?) vs "Apple Inc." → maybe not. Without ER your graph has 5 Acmes and every traversal is broken.

**Pipeline**
1. **Normalise:** lowercase, strip punctuation and legal suffixes (inc, ltd, GmbH), expand known abbreviations.
2. **Block:** only compare mentions sharing a cheap key (first 3 letters of normalised name, same country, same type, or embedding ANN neighbours). All-pairs on 1M mentions is ≈ 5×10^11 comparisons; blocking makes it tractable.
3. **Score pairs** with several signals:

| Signal | Catches |
|---|---|
| Jaro-Winkler / edit distance | Typos, "Acme Corp" vs "Acme Corporation" |
| Embedding cosine of name + context | "IBM" vs "International Business Machines" |
| Attribute agreement (domain, address, ticker) | Strong positive or negative evidence |

4. **Decide with thresholds:** score ≥ 0.92 → auto-merge; ≤ 0.70 → distinct; grey zone → **LLM adjudication** with both records' context (or human review for high-stakes data).
5. **Cluster** matches (union-find) into canonical entities; keep **aliases** and a merge audit (who/what merged, score) so merges can be undone.

**When to use:** always before writing extracted mentions into a shared graph, and when integrating multiple source systems (CRM + ERP + documents).`,
      example: `**Mentions:** "Acme Corp" (us), "ACME Corporation" (us), "Acme Ltd" (country unknown), "Acme Analytics" (us).

After normalisation: "acme", "acme", "acme", "acme analytics". Blocking key = first 3 chars + type → all four in one block (6 pairs instead of comparing against all 40K orgs).

Scores (0.5 × Jaro-Winkler + 0.5 × embedding cosine, then attribute rules):
- Acme Corp ↔ ACME Corporation: 1.00 / 0.96 → 0.98, same domain acme.com → **auto-merge**.
- Acme Corp ↔ Acme Ltd: 1.00 / 0.90 → 0.95, but domains differ (acme.com vs acme.co.uk, −0.15) → 0.80 → grey zone → LLM reads both contexts ("UK subsidiary of Acme Corp") → **distinct, add SUBSIDIARY_OF edge**.
- Acme Corp ↔ Acme Analytics: JW("acme", "acme analytics") = 0.86, cosine 0.71 → 0.79 → grey zone → LLM: different company → distinct.

Result: 3 canonical nodes, 1 alias, 1 new relationship.`,
      diagram: `  mentions ─► normalise ─► BLOCK (key: type + prefix / country / ANN)
                                   │ candidate pairs only
                                   ▼
               score = w1·JaroWinkler + w2·cosine(emb) + attribute rules
                     │                │                    │
                ≥ 0.92 merge     0.70–0.92 grey       ≤ 0.70 distinct
                                      │
                         LLM adjudicator (both contexts) / human
                                      ▼
            union-find clusters ─► canonical id + aliases + merge audit`,
      code: [
        {
          language: 'typescript',
          title: 'Blocking + Jaro-Winkler + embeddings with LLM adjudication for the grey zone',
          code: `type Mention = { id: string; name: string; type: string; country?: string; domain?: string; emb: number[] };
declare function adjudicate(a: Mention, b: Mention): Promise<'same' | 'different'>; // LLM with both contexts

const SUFFIX = /\\b(inc|corp|corporation|ltd|llc|gmbh|plc|co)\\b/g;
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(SUFFIX, ' ').replace(/\\s+/g, ' ').trim();

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const md = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0, p = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++)
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  while (p < 4 && a[p] === b[p]) p++; // common prefix up to 4
  return jaro + p * 0.1 * (1 - jaro);
}
const cos = (x: number[], y: number[]) => { // cosine similarity
  let d = 0, nx = 0, ny = 0;
  for (let i = 0; i < x.length; i++) { d += x[i] * y[i]; nx += x[i] ** 2; ny += y[i] ** 2; }
  return d / Math.sqrt(nx * ny); };

export async function resolve(mentions: Mention[]) {
  const blocks = new Map<string, Mention[]>(); // blocking: only compare within type + 3-char prefix
  for (const m of mentions) {
    const k = m.type + ':' + norm(m.name).slice(0, 3);
    blocks.set(k, [...(blocks.get(k) ?? []), m]);
  }
  const merges: [string, string, number, string][] = [];
  for (const group of blocks.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        let score = 0.5 * jaroWinkler(norm(a.name), norm(b.name)) + 0.5 * cos(a.emb, b.emb);
        if (a.domain && b.domain) score += a.domain === b.domain ? 0.1 : -0.15; // attribute evidence
        if (a.country && b.country && a.country !== b.country) score -= 0.1;
        if (score >= 0.92) merges.push([a.id, b.id, score, 'auto']);
        else if (score > 0.7 && (await adjudicate(a, b)) === 'same') merges.push([a.id, b.id, score, 'llm']);
      }
  return merges; // feed into union-find; persist as an audit log
}`,
        },
      ],
      prosCons: {
        pros: [
          'Turns noisy mentions into one node per real-world entity, making traversals and counts correct.',
          'Blocking makes ER feasible at millions of mentions.',
          'Combining string, semantic and attribute signals beats any single similarity.',
          'LLM adjudication handles the ambiguous minority cheaply compared with human review of everything.',
        ],
        cons: [
          { con: 'Over-merging (false positives) silently corrupts the graph: two companies fused into one.', fix: 'Use conservative auto-merge thresholds, require attribute agreement for auto-merges, keep merge audit logs and support un-merge.' },
          { con: 'Blocking misses true matches whose keys differ (IBM vs International Business Machines).', fix: 'Use multiple blocking keys (prefix, acronym, ANN neighbours on embeddings) and union their candidate sets.' },
          { con: 'Transitive chains merge distinct entities (A≈B, B≈C, but A≠C).', fix: 'Check cluster coherence: split clusters whose members have conflicting strong attributes, or require each new member to match the cluster centroid.' },
          { con: 'LLM adjudication cost grows with the grey zone.', fix: 'Tune thresholds on a labelled sample to shrink the grey zone, cache decisions per normalised pair, and use a small model.' },
        ],
      },
      keyPoints: [
        'Normalise → block → score → threshold → adjudicate → cluster.',
        'Blocking is what makes ER scale; use several keys.',
        'Precision of merges matters more than recall: wrong merges are worse than duplicates.',
        'Keep aliases and an auditable, reversible merge log.',
      ],
      exercise: {
        prompt: `Implement **union-find clustering** for merge decisions.

Write \`cluster(ids, merges)\` where \`merges\` is \`[a, b][]\`; return \`Map<canonicalId, memberIds[]>\` where the canonical id of each cluster is its lexicographically smallest member.

Acceptance: path compression; handles chains (A–B, B–C → one cluster); singletons appear as clusters of one.`,
        hints: [
          'parent: Map<string, string> initialised to itself.',
          'find(x): if parent(x) !== x, set parent(x) = find(parent(x)).',
          'union(a, b): attach the larger root to the smaller root so the smallest id becomes canonical.',
        ],
        solution: {
          language: 'typescript',
          code: `export function cluster(ids: string[], merges: [string, string][]): Map<string, string[]> {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root); // path compression
    return root;
  };
  for (const [a, b] of merges) {
    const ra = find(a), rb = find(b);
    if (ra === rb) continue;
    if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb); // smallest id wins
  }
  const out = new Map<string, string[]>();
  for (const id of ids) {
    const r = find(id);
    out.set(r, [...(out.get(r) ?? []), id]);
  }
  return out;
}

// cluster(['m1','m2','m3','m4'], [['m2','m3'], ['m3','m1']]) → Map { 'm1' => ['m1','m2','m3'], 'm4' => ['m4'] }`,
        },
        explanation: 'Pairwise merge decisions are not yet entities; union-find turns them into clusters in near-linear time. Deterministic canonical ids keep node ids stable across re-runs, which matters for incremental graph updates and for undoing a bad merge.',
      },
      quickCheck: {
        question: 'Your ER pipeline merged "Apple Inc." and "Apple Records" because Jaro-Winkler on the normalised names was 0.91. What is the best fix?',
        options: [
          'Lower the threshold to 0.85',
          'Add attribute evidence (industry, domain, country) and context embeddings, and send borderline pairs to adjudication instead of auto-merging',
          'Remove normalisation',
          'Merge only exact string matches',
        ],
        correct: 1,
        explanation: 'Name similarity alone cannot separate different organisations with shared tokens; attribute disagreement and context should push the score down or into review. Lowering the threshold merges more, removing normalisation loses true matches, and exact matching misses most variants.',
      },
      source: 'Christen 2012 — Data Matching; Papadakis et al. 2020 — Blocking and Filtering Techniques for Entity Resolution',
    },
    {
      heading: 'Graph-Based Retrieval — seed, expand, rank and combine with vectors',
      body: `**Intuition:** vector search finds the *right neighbourhood* in your documents; graph traversal then *walks the streets* from there to collect connected facts the question needs but the text chunks don't state together.

**Hybrid retrieval recipe (local search)**
1. **Seed:** find entities for the question: vector search over chunk or entity embeddings, keyword match on names, or NER + entity linking on the query.
2. **Expand:** traverse 1–2 hops from seeds, restricted to relation types relevant to the question, with **degree caps** (skip hubs) and a node budget.
3. **Rank:** score paths/facts (seed similarity × edge confidence × hop decay, or personalised PageRank as in HippoRAG).
4. **Serialise:** turn the top facts into compact text with provenance ("Acme -ACQUIRED(2024)-> Globex [press-0412]") plus the best source chunks.
5. **Generate** with instructions to cite.

**Text2Cypher** is the other route: the LLM writes a Cypher query from the schema. Great for precise questions ("how many suppliers in Germany?"), risky without guardrails: run with a **read-only** user, timeouts, enforced \`LIMIT\`, validated syntax (e.g. \`EXPLAIN\` first) and few-shot examples of your schema.

| Approach | Best for | Risk |
|---|---|---|
| Vector-seeded expansion | Open questions needing connected context | Noise from over-expansion |
| Text2Cypher | Precise lookups, counts, filters | Wrong/unsafe queries |
| Global summaries (GraphRAG communities) | "What are the main themes?" | Costly indexing — covered in the GraphRAG topic |

**When to use:** multi-hop and relational questions over entity-rich corpora; keep plain vector RAG as the fallback when no seed entities are found.`,
      example: `**Question:** "Which products are affected by the Globex acquisition?"

1. Seed: vector search over entity embeddings returns Globex (0.91) and Acme (0.74).
2. Expand from Globex: \`ACQUIRED_BY\` → Acme; \`PRODUCES\` → RoboArm X2, VisionKit; from Acme: \`PRODUCES\` → 41 products (Acme is a hub with degree 1,840, so expansion beyond 1 hop from it is skipped).
3. Rank: facts touching Globex directly score highest; result: 2 products + the acquisition edge + press release chunk (score 0.88).
4. Context: 6 facts + 2 chunks = ~900 tokens, versus ~6,000 tokens for top-12 vector chunks.

Answer: "RoboArm X2 and VisionKit (Globex products), now under Acme after the March 2024 acquisition [press-0412]". Vector-only RAG returned the press release but listed none of the products: they were only in the product catalogue.`,
      diagram: `  question ─► embed ─► vector search (chunks / entities) ─► seed entities
                                                           │
            graph expand: 1–2 hops, relation filter, degree cap ≤ 500, ≤ 50 nodes
                                                           │
            rank facts: sim(seed) × confidence × 0.5^(hops-1)
                                                           │
  prompt ◄─ serialised facts with [source] + top chunks ◄──┘
      │
      └─► LLM answer with citations        fallback: no seeds → plain vector RAG
  alt route: question ─► Text2Cypher (schema + examples) ─► read-only, LIMIT, timeout`,
      code: [
        {
          language: 'typescript',
          title: 'Vector-seeded graph expansion in one Cypher 25 query, serialised for the prompt',
          code: `import neo4j from 'neo4j-driver';
import OpenAI from 'openai';

const openai = new OpenAI();
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));

// 1) seed via the vector index on Entity.embedding (Neo4j 2026.01+ SEARCH clause)
// 2) expand 1..2 hops over allowed relation types, skipping hub nodes
// 3) score = seed similarity × edge confidence × hop decay
const CYPHER = \`CYPHER 25
MATCH (seed:Entity)
  SEARCH seed IN (VECTOR INDEX entity_emb FOR $q LIMIT 5) SCORE AS sim
WHERE sim >= 0.7
MATCH p = (seed)-[:ACQUIRED|PRODUCES|SUBSIDIARY_OF*1..2]-(n:Entity)
WHERE all(x IN nodes(p)[1..] WHERE coalesce(x.degree, 0) <= 500)
WITH p, sim, length(p) AS hops,
     reduce(c = 1.0, r IN relationships(p) | c * coalesce(r.confidence, 0.8)) AS conf
RETURN [r IN relationships(p) | startNode(r).name + ' -' + type(r) + '-> ' + endNode(r).name + ' [' + coalesce(r.source, '?') + ']'] AS facts,
       sim * conf * (0.5 ^ (hops - 1)) AS score
ORDER BY score DESC LIMIT 30\`;

export async function graphContext(question: string, maxFacts = 12): Promise<string> {
  const emb = await openai.embeddings.create({ model: 'text-embedding-3-small', input: question });
  const { records } = await driver.executeQuery(CYPHER, { q: emb.data[0].embedding }, { database: 'neo4j', routing: neo4j.routing.READ });
  const seen = new Set<string>();
  for (const r of records) for (const f of r.get('facts') as string[]) if (seen.size < maxFacts) seen.add(f); // dedupe facts
  return seen.size ? 'Graph facts:\\n- ' + [...seen].join('\\n- ') : ''; // empty → caller falls back to vector RAG
}`,
        },
      ],
      prosCons: {
        pros: [
          'Recovers facts spread across documents that no single chunk contains (multi-hop).',
          'Compact context: a dozen facts replace thousands of tokens of chunks.',
          'Explainable answers with per-fact provenance.',
          'Text2Cypher gives exact answers for counts, filters and aggregations.',
        ],
        cons: [
          { con: 'Over-expansion through hubs floods context with irrelevant facts.', fix: 'Filter relation types per intent, cap degree and node budget, and rank with hop decay before truncating.' },
          { con: 'Seed linking fails when the question names entities differently from the graph.', fix: 'Embed entity names plus aliases and descriptions, and fall back to vector RAG when no seed passes the threshold.' },
          { con: 'Text2Cypher can produce wrong, slow or destructive queries.', fix: 'Execute as a read-only role with timeouts and enforced LIMIT, validate with EXPLAIN, include schema and few-shot examples, and log queries for evaluation.' },
          { con: 'Graph coverage gaps make the system confidently incomplete.', fix: 'Always merge graph facts with top text chunks and instruct the model to say what it could not find.' },
        ],
      },
      keyPoints: [
        'Seed with vectors/keywords, expand with bounded typed traversal, rank, serialise with sources.',
        'Degree caps and relation filters are mandatory on real graphs.',
        'Text2Cypher needs read-only execution, LIMIT, timeouts and validation.',
        'Combine with vector chunks and keep a vector-only fallback.',
      ],
      exercise: {
        prompt: `Write \`safeText2Cypher(question)\`: ask an LLM (stub \`llm(prompt)\`) for a Cypher query given a schema string, then **guard** it before execution.

Acceptance:
- Reject if the query contains write clauses (\`CREATE\`, \`MERGE\`, \`DELETE\`, \`DETACH\`, \`SET\`, \`REMOVE\`, \`DROP\`, \`LOAD CSV\`, \`CALL dbms\`/\`apoc\`).
- Append \`LIMIT 50\` when the query has no LIMIT.
- Run \`EXPLAIN\` first to validate syntax; then execute with a read-only routing and a 5-second timeout.
- Return rows or \`{ error }\`.`,
        hints: [
          'Strip string literals before keyword checks so names like "Set Theory Ltd" do not false-positive.',
          'executeQuery accepts a transactionConfig with timeout in ms.',
          'Use a database user that only has read privileges as the real safety net.',
        ],
        solution: {
          language: 'typescript',
          code: `import neo4j, { type Driver } from 'neo4j-driver';
declare function llm(prompt: string): Promise<string>;

const SCHEMA = '(:Organization {id,name,country})-[:SUPPLIES]->(:Organization); (:Person {name})-[:WORKS_AT]->(:Organization)';
const FORBIDDEN = /\\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD\\s+CSV|FOREACH)\\b|\\bCALL\\s+(dbms|apoc|db\\.create)/i;

export async function safeText2Cypher(driver: Driver, question: string) {
  let q = (await llm(
    'Schema: ' + SCHEMA + '\\nWrite ONE read-only Cypher query answering the question. Use parameters only if given. Output only the query.\\nQ: ' + question,
  )).replace(/^\\s*\`{3}\\w*|\`{3}\\s*$/g, '').trim();

  const withoutStrings = q.replace(/'[^']*'|"[^"]*"/g, "''"); // ignore keywords inside literals
  if (FORBIDDEN.test(withoutStrings)) return { error: 'write or admin operation rejected', query: q };
  if (!/\\bLIMIT\\s+\\d+/i.test(withoutStrings)) q += ' LIMIT 50';

  const cfg = { database: 'neo4j', routing: neo4j.routing.READ, transactionConfig: { timeout: 5000 } };
  try {
    await driver.executeQuery('EXPLAIN ' + q, {}, cfg); // syntax/plan check without running
    const { records } = await driver.executeQuery(q, {}, cfg);
    return { query: q, rows: records.map((r) => r.toObject()) };
  } catch (e) {
    return { error: (e as Error).message.slice(0, 300), query: q }; // feed back to the LLM for one repair attempt
  }
}`,
        },
        explanation: 'The regex filter and LIMIT are convenience guards; the true boundary is executing as a read-only database user with a timeout. EXPLAIN catches syntax errors cheaply, and returning the error lets the LLM attempt one repair. Logging generated queries gives you a Text2Cypher eval set.',
      },
      quickCheck: {
        question: 'Graph expansion from a seed returns 3,000 facts because one neighbour is "United States" with 2M edges. What is the right fix?',
        options: [
          'Increase the LLM context window',
          'Cap node degree during traversal, restrict relation types to the question, and rank facts before truncating',
          'Remove the vector seeding step',
          'Use 5 hops so more relevant facts are found',
        ],
        correct: 1,
        explanation: 'Hubs connect almost everything; traversing through them adds noise. Degree caps, typed relations and ranking keep context focused. A bigger context still dilutes attention, seeding is what makes expansion relevant, and more hops makes the explosion worse.',
      },
      source: 'Gutiérrez et al. 2024 — HippoRAG; Neo4j Cypher Manual — SEARCH clause; Neo4j GraphRAG Text2Cypher guidance',
    },
  ],
  codeChallenges: [
    {
      id: 'knowledge-graphs-cc-1',
      title: 'Fix an ingestion job that creates duplicate, unauditable graph data',
      context: 'A nightly job extracts relations with an LLM and writes them with string-built Cypher: `CREATE (a:Org {name: "` + s + `"})-[:` + rel + `]->(b:Org {name: "` + o + `"})`. The graph now has 14 "Acme" nodes, relation types like "ACQUIRED_BY_THE" and one run failed with a Cypher syntax error on the name `O"Brien Ltd`.',
      task: 'Rewrite the writer: parameterised batched MERGE on canonical ids, an allow-list of relation types, provenance on edges, and idempotent re-runs.',
      starter: {
        language: 'typescript',
        code: `import neo4j from 'neo4j-driver';
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic('neo4j', process.env.NEO4J_PASSWORD!));
type Rel = { s: string; rel: string; o: string };

export async function write(rels: Rel[]) {
  for (const r of rels) {
    await driver.executeQuery(
      'CREATE (a:Org {name: "' + r.s + '"})-[:' + r.rel + ']->(b:Org {name: "' + r.o + '"})',
    );
  }
}`,
      },
      hints: [
        'Resolve names to canonical ids (from entity resolution) before writing; MERGE on id.',
        'Relationship types cannot be parameters: group rows by allow-listed type and use one query per type.',
        'Store source, chunkId, confidence and extractedAt on the relationship; MERGE the relationship so re-runs do not duplicate it.',
      ],
      solution: {
        language: 'typescript',
        code: `import neo4j from 'neo4j-driver';
const driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));

type Rel = { sId: string; sName: string; rel: string; oId: string; oName: string; source: string; chunkId: string; confidence: number };
const ALLOWED_RELS = new Set(['ACQUIRED', 'SUPPLIES', 'SUBSIDIARY_OF', 'LOCATED_IN']);
const BATCH = 2000;

export async function setup() {
  await driver.executeQuery('CREATE CONSTRAINT org_id IF NOT EXISTS FOR (o:Org) REQUIRE o.id IS UNIQUE');
}

export async function write(rels: Rel[]) {
  const rejected = rels.filter((r) => !ALLOWED_RELS.has(r.rel));
  if (rejected.length) console.error('rejected relation types', [...new Set(rejected.map((r) => r.rel))]);
  const byType = new Map<string, Rel[]>();
  for (const r of rels) if (ALLOWED_RELS.has(r.rel)) byType.set(r.rel, [...(byType.get(r.rel) ?? []), r]);

  for (const [type, rows] of byType) {
    // type comes from the allow-list, so it is safe to place in the query text
    const cypher =
      'UNWIND $rows AS row ' +
      'MERGE (a:Org {id: row.sId}) ON CREATE SET a.name = row.sName ' +
      'MERGE (b:Org {id: row.oId}) ON CREATE SET b.name = row.oName ' +
      'MERGE (a)-[r:' + type + ' {chunkId: row.chunkId}]->(b) ' + // idempotent per source chunk
      'SET r.source = row.source, r.confidence = row.confidence, r.extractedAt = datetime()';
    for (let i = 0; i < rows.length; i += BATCH) {
      await driver.executeQuery(cypher, { rows: rows.slice(i, i + BATCH) }, { database: 'neo4j' });
    }
  }
  return { written: rels.length - rejected.length, rejected: rejected.length };
}`,
      },
      explanation: 'Parameters remove Cypher injection and quoting bugs; MERGE on resolved canonical ids with a uniqueness constraint ends duplicate nodes; the relation allow-list stops schema drift; and keying the relationship MERGE on chunkId makes nightly re-runs idempotent while preserving provenance for every edge. Batching with UNWIND cuts thousands of round trips to a handful.',
      followUps: [
        { q: 'A source document is deleted. How do you remove its facts?', a: 'Because each relationship stores its source/chunkId, run MATCH ()-[r]->() WHERE r.source = $doc DELETE r, then optionally remove nodes left with no relationships and no other provenance.' },
        { q: 'Two documents state the same relation. Do you keep one edge or two?', a: 'Either keep one edge per source (as here, keyed by chunkId) to preserve provenance and allow counting corroboration, or one edge with a list of sources; per-source edges make deletion and confidence aggregation simpler.' },
      ],
    },
    {
      id: 'knowledge-graphs-cc-2',
      title: 'Bound a graph retriever that times out and floods the prompt',
      context: 'A GraphRAG-style retriever finds the entity whose name equals the user\'s word and runs `MATCH p=(e)-[*]-(n) RETURN p`. On popular entities it times out after 60 s; on others it returns 9,000 paths that are all pasted into the prompt.',
      task: 'Make retrieval bounded and relevant: fuzzy/vector seed linking, typed and depth-capped traversal with degree limits, ranking, a fact budget, and a vector-RAG fallback.',
      starter: {
        language: 'typescript',
        code: `import type { Driver } from 'neo4j-driver';
export async function retrieve(driver: Driver, word: string) {
  const { records } = await driver.executeQuery('MATCH (e {name: $w}) MATCH p=(e)-[*]-(n) RETURN p', { w: word });
  return records.map((r) => JSON.stringify(r.get('p'))).join('\\n'); // everything into the prompt
}`,
      },
      hints: [
        'Seed with a full-text or vector index instead of exact name equality, with a score threshold.',
        'Use [:A|B*1..2], degree filters on intermediate nodes and LIMIT.',
        'Serialise each path as a short fact line with source, dedupe, keep the top N by score; return null to trigger fallback.',
      ],
      solution: {
        language: 'typescript',
        code: `import neo4j, { type Driver } from 'neo4j-driver';
declare function embed(text: string): Promise<number[]>;

const QUERY = \`CYPHER 25
MATCH (seed:Entity)
  SEARCH seed IN (VECTOR INDEX entity_emb FOR $q LIMIT 3) SCORE AS sim
WHERE sim >= $minSim
MATCH p = (seed)-[:ACQUIRED|SUPPLIES|SUBSIDIARY_OF|WORKS_AT*1..2]-(n:Entity)
WHERE all(x IN nodes(p)[1..-1] WHERE coalesce(x.degree, 0) <= $maxDegree)
WITH p, sim * (0.5 ^ (length(p) - 1)) AS score
RETURN [r IN relationships(p) | startNode(r).name + ' -' + type(r) + '-> ' + endNode(r).name + ' [' + coalesce(r.source,'?') + ']'] AS facts, score
ORDER BY score DESC LIMIT 40\`;

export async function retrieve(driver: Driver, question: string, maxFacts = 15): Promise<string | null> {
  const { records } = await driver.executeQuery(
    QUERY,
    { q: await embed(question), minSim: 0.72, maxDegree: neo4j.int(500) },
    { database: 'neo4j', routing: neo4j.routing.READ, transactionConfig: { timeout: 3000 } },
  );
  const facts = new Set<string>();
  for (const r of records) for (const f of r.get('facts') as string[]) if (facts.size < maxFacts) facts.add(f);
  return facts.size ? [...facts].map((f) => '- ' + f).join('\\n') : null; // null → caller uses vector RAG
}`,
      },
      explanation: 'An unbounded, untyped variable-length pattern enumerates every path in the connected component, which is exponential on real graphs. The rewrite links seeds semantically, traverses only relevant relation types up to 2 hops, skips hubs, ranks by seed similarity with hop decay, enforces a 3 s timeout and a 15-fact budget (~500 tokens), and signals a fallback when the graph has nothing relevant.',
      followUps: [
        { q: 'How would you choose maxFacts and the hop decay?', a: 'Tune them on a labelled question set by measuring answer accuracy and faithfulness against context size; typically accuracy plateaus after 10–20 facts while cost keeps rising.' },
        { q: 'When would personalised PageRank beat hop decay for ranking?', a: 'When relevance depends on many converging paths rather than distance, e.g. an entity reachable from several seeds; PPR from the seed set rewards such well-connected nodes, as in HippoRAG.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'knowledge-graphs-iq-1',
      difficulty: 'hard',
      question: 'Your team asks whether to add a knowledge graph to an existing vector RAG system for internal company documents. How do you decide, and what would a minimal first version look like?',
      whatInterviewerLooksFor: [
        'Ties the decision to question types (multi-hop, aggregation) found in real traffic',
        'Estimates build/maintenance cost',
        'Proposes a narrow schema and hybrid retrieval',
        'Defines evaluation comparing against the baseline',
      ],
      modelAnswer: `**Start from failing questions, not the technology.** Sample 300 real queries and label the failures of the current RAG. Graphs help with specific failure types:
- **Multi-hop:** "Which teams own services that depend on the payments DB?"
- **Aggregation / enumeration:** "How many vendors in Germany have contracts expiring in Q1?"
- **Exact relationships / disambiguation:** two "Atlas" projects in different orgs.

If < 10–15% of failures are of these types, improve chunking, hybrid search or reranking first: cheaper wins.

**Cost reality:** extraction over the corpus (LLM calls), entity resolution, sync when documents change, schema governance. Prefer **structured sources** already in systems (service catalogue, HR directory, CMDB) over LLM extraction.

**Minimal v1**
1. Schema of 4–6 entity types and 6–10 relation types for the top question class (e.g. Service, Team, Database; OWNS, DEPENDS_ON).
2. Load structured sources; LLM-extract only missing relations with evidence quotes.
3. Entity resolution on names with aliases.
4. Retrieval: entity linking on the question → 1–2 hop typed expansion → facts with sources added to the existing top-k chunks. Text2Cypher (read-only) for counting questions.
5. Fallback to existing RAG when no entity is linked.

**Evaluate:** on the labelled set, compare answer accuracy, faithfulness and latency for RAG vs RAG+graph, per question type. Ship only where it wins.`,
      followUps: [
        { q: 'How do you keep the graph in sync with document edits?', a: 'Store source and chunk ids on every edge, re-extract changed documents incrementally, delete edges whose sources disappeared, and run resolution only on new mentions.' },
        { q: 'What would make you abandon the graph?', a: 'If, after evaluation, graph-assisted answers do not beat improved hybrid retrieval on the target question classes, or maintenance cost (sync, resolution errors) outweighs the accuracy gain.' },
      ],
      pitfalls: [
        'Building a graph of everything before knowing which questions it serves',
        'Ignoring existing structured data sources',
        'No head-to-head evaluation against the baseline',
      ],
    },
    {
      id: 'knowledge-graphs-iq-2',
      difficulty: 'expert',
      question: 'Design an entity resolution pipeline for 5M company mentions extracted from news, filings and CRM records, with a 99% precision requirement on merges.',
      whatInterviewerLooksFor: [
        'Blocking strategy with multiple keys and complexity numbers',
        'Multi-signal scoring with attributes',
        'Threshold selection for high precision; grey-zone handling',
        'Clustering, auditability and incremental updates',
      ],
      modelAnswer: `**1. Normalise:** case/punctuation, legal suffixes (Inc, GmbH, S.A.), transliteration, known abbreviation tables; keep the raw form as an alias.

**2. Blocking (recall stage):** union of several keys so true matches share at least one:
- normalised-name prefix + country,
- acronym key (International Business Machines → IBM),
- identifiers (LEI, ticker, domain) when present,
- ANN top-20 neighbours on name+context embeddings.
5M all-pairs ≈ 1.25×10^13 comparisons; blocks averaging ~40 candidates per mention give ~10^8 pairs, feasible in a distributed job.

**3. Scoring (precision stage):** features: Jaro-Winkler, token-set similarity, embedding cosine, identifier match (decisive), country/industry agreement, address similarity. Train a simple classifier (logistic regression / GBM) on ~5K labelled pairs; calibrate probabilities.

**4. Thresholds for 99% precision:** choose the auto-merge cut-off where precision on a held-out set ≥ 99.5% (margin). Below it, a grey band goes to **LLM adjudication** with both records' context and evidence (also validated against labels), and the hardest or most valuable cases to humans. Below the low threshold: distinct.

**5. Clustering:** union-find on accepted pairs, then **coherence checks**: split clusters with conflicting hard identifiers (two different LEIs).

**6. Operations:** canonical ids stable across runs; merge log with scores and decider; un-merge tooling; incremental mode (new mentions only searched against existing canonical entities via the same blocking). Monitor precision with weekly sampled audits.`,
      followUps: [
        { q: 'Why not let an LLM decide every pair?', a: 'At ~10^8 candidate pairs even a cheap model is far too expensive and slow; the classifier handles the clear cases and the LLM is reserved for the small ambiguous band where it adds value.' },
        { q: 'How do you measure recall without labelling everything?', a: 'Sample known duplicate sets (e.g. records sharing an LEI) and check how many were merged, plus stratified review of near-threshold non-merges.' },
      ],
      pitfalls: [
        'Single blocking key, silently losing recall',
        'Thresholds picked by intuition rather than labelled data',
        'No un-merge path for wrong merges',
      ],
    },
    {
      id: 'knowledge-graphs-iq-3',
      difficulty: 'hard',
      question: 'Users can ask analytics questions over a Neo4j graph in natural language. How would you build Text2Cypher safely and reliably?',
      whatInterviewerLooksFor: [
        'Schema grounding and few-shot examples',
        'Security: read-only role, timeouts, limits',
        'Validation and repair loop',
        'Evaluation and observability',
      ],
      modelAnswer: `**Prompt grounding**
- Provide the **schema** (labels, relationship types with direction, key properties, enum values) generated from the database, not hand-written.
- Add 10–30 **few-shot examples** of question → Cypher for your domain, retrieved by similarity to the current question.
- Instruct: one read-only query, always LIMIT, use parameters for literals where possible.

**Safety (defence in depth)**
- Execute as a database user with **read-only privileges** on the relevant graph: the real boundary.
- Transaction **timeout** (e.g. 5 s) and a maximum row count.
- Static checks: reject write/admin clauses and \`CALL\` to unapproved procedures, add LIMIT if missing.

**Reliability**
- Run \`EXPLAIN\` first; on error, give the error message back to the model for one repair attempt.
- Check for empty results: maybe wrong direction or property name; a repair prompt with the schema snippet often fixes it.
- Post-process: summarise results with the LLM, showing the query to power users.

**Evaluation**
- Golden set of 200 questions with expected results (not expected query text: different queries can be correct). Metrics: execution success, result match, latency.
- Log every generated query with outcome; failures feed new few-shot examples.

**Routing:** use Text2Cypher for precise/aggregate questions; vector-seeded graph retrieval or plain RAG for open-ended ones.`,
      followUps: [
        { q: 'Why compare results instead of query strings in evaluation?', a: 'Many syntactically different Cypher queries are equivalent; comparing returned rows (order-insensitive where appropriate) measures what users care about.' },
        { q: 'How do you protect against prompt injection asking for other tenants\' data?', a: 'Enforce tenancy in the database layer (separate databases or mandatory tenant filters added by code, not the LLM) and run with credentials scoped to that tenant.' },
      ],
      pitfalls: [
        'Relying on regex filters as the only safety layer',
        'Hand-maintained schema descriptions that drift',
        'No evaluation set',
      ],
    },
    {
      id: 'knowledge-graphs-iq-4',
      difficulty: 'medium',
      question: 'Explain the difference between a property graph and RDF, and which you would choose for an LLM-powered product catalogue assistant.',
      whatInterviewerLooksFor: [
        'Accurate data model differences',
        'Query languages and tooling',
        'Pragmatic choice tied to the use case',
      ],
      modelAnswer: `**Property graph**
- Nodes with labels and properties; relationships with a type, direction and properties (e.g. \`(:Product)-[:COMPATIBLE_WITH {since: 2025}]->(:Product)\`).
- Queried with **Cypher** (or the ISO **GQL** standard).
- Schema is light: constraints and indexes, not formal semantics.
- Strong developer tooling, vector indexes built in (Neo4j), easy upserts.

**RDF**
- Everything is a triple of IRIs/literals: \`<prod:123> <ex:compatibleWith> <prod:456>\`. Edge properties need reification or RDF-star.
- Queried with **SPARQL**; ontologies (RDFS/OWL) enable inference (subclass reasoning) and linking with public vocabularies (schema.org, Wikidata).
- Great for data integration across organisations and standards-heavy domains.

**For a product catalogue assistant:** a **property graph**. Needs are: compatibility/accessory relationships with properties (version ranges), fast traversal ("cables compatible with my laptop under $30"), hybrid vector + graph retrieval, and simple ingestion from the product DB. If you must publish data as linked data or reason over a formal taxonomy, you could export to RDF or use schema.org terms as property names.

**LLM angle:** Cypher is widely represented in LLM training data and schema-in-prompt Text2Cypher works well; both models are fine for extraction outputs (triples).`,
      followUps: [
        { q: 'What is GQL?', a: 'An ISO standard graph query language (ISO/IEC 39075, 2024) for property graphs, heavily influenced by Cypher, which vendors are converging on.' },
        { q: 'How would you represent product variant hierarchies?', a: 'As nodes connected by VARIANT_OF or IS_A relationships with category nodes, so traversal can roll up or down the taxonomy; inference-style rules can be done with variable-length IS_A paths.' },
      ],
      pitfalls: [
        'Claiming RDF cannot have properties on relationships at all (RDF-star exists)',
        'Choosing by hype rather than query needs',
        'Ignoring tooling and team familiarity',
      ],
    },
    {
      id: 'knowledge-graphs-iq-5',
      difficulty: 'expert',
      question: 'A graph-augmented assistant gives confident but wrong answers about corporate ownership. Investigation shows the facts came from the graph. Diagnose likely causes across the pipeline and fix them.',
      context: 'Pipeline: LLM extraction from news → entity resolution → Neo4j → vector-seeded 2-hop retrieval → LLM answer.',
      whatInterviewerLooksFor: [
        'Traces wrong facts to a pipeline stage using provenance',
        'Extraction errors (direction, over-inference), resolution errors (over-merge), staleness',
        'Retrieval/ranking issues and missing uncertainty in answers',
        'Concrete fixes and monitoring',
      ],
      modelAnswer: `**Use provenance to localise the error.** For each wrong answer, list the facts used and their \`source\`, \`chunkId\`, confidence, extraction date and merge history.

**Likely causes by stage**
1. **Extraction**
   - *Direction errors:* "X was acquired by Y" stored as X -ACQUIRED-> Y. Fix: few-shot examples on passive voice, schema descriptions with direction, evidence-based verification by a second cheap model.
   - *Over-inference:* "talks to acquire" stored as ACQUIRED. Fix: add relation status (rumoured/announced/completed) to the schema and require explicit evidence.
2. **Entity resolution**
   - *Over-merge:* "Apex Holdings (UK)" fused with "Apex Holdings (US)" → ownership chains cross companies. Fix: attribute-aware scoring (country, registry ids), stricter auto-merge, coherence checks, un-merge the bad cluster.
3. **Staleness**
   - Old ownership never retired after a divestiture. Fix: temporal properties (\`validFrom\`, \`validTo\`), prefer the latest dated evidence, retire edges contradicted by newer sources.
4. **Retrieval/ranking**
   - Hub expansion surfaces irrelevant parents; low-confidence edges rank high. Fix: weight by confidence and recency, relation filters per intent.
5. **Generation**
   - The model states graph facts as certain. Fix: include confidence/date in serialised facts and instruct to hedge or cite.

**Monitoring:** weekly sampled audit of edges by type (precision), conflict detector (two current owners for one company), and answer-level faithfulness checks.`,
      followUps: [
        { q: 'How would you detect contradictory ownership facts automatically?', a: 'Run constraint queries such as companies with more than one current majority owner or ownership cycles, and route each conflict with its sources to review or to a recency-based resolver.' },
        { q: 'Should registries replace news extraction?', a: 'Where official registries exist they should be the primary source for ownership, with news used for recent events marked as lower-confidence until confirmed.' },
      ],
      pitfalls: [
        'Blaming the answer LLM without checking provenance',
        'No temporal modelling of relationships',
        'Treating all edges as equally reliable',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'knowledge-graphs-est-1',
      question: 'Estimate the cost and time to LLM-extract a knowledge graph from 400,000 documents.',
      assumptions: [
        'Average document 2,500 tokens → chunks of ~1,000 tokens → 2.5 chunks/doc',
        'Prompt overhead (instructions + schema) 600 tokens per call; output ~350 tokens per chunk',
        'Small model, illustrative price $0.25 / 1M input and $2 / 1M output; Batch API 50% discount',
        'Pre-filter skips 30% of chunks with fewer than 2 entities (cheap NER)',
      ],
      steps: [
        { label: 'Chunks', calc: '400,000 × 2.5 = 1,000,000; after 30% filter = 700,000 calls' },
        { label: 'Input tokens', calc: '700,000 × (1,000 + 600) = 1.12B tokens' },
        { label: 'Output tokens', calc: '700,000 × 350 = 245M tokens' },
        { label: 'Cost (list)', calc: '1.12B × $0.25/1M + 245M × $2/1M = $280 + $490 = $770' },
        { label: 'With Batch API (−50%)', calc: '$770 × 0.5 ≈ $385' },
        { label: 'Time at 2,000 requests/min', calc: '700,000 / 2,000 = 350 min ≈ 6 h (batch jobs typically complete within 24 h)' },
      ],
      answer: 'Roughly $385–770 in model costs and several hours of throughput for ~700K extraction calls; output tokens dominate the cost.',
      insight: 'Output tokens (the JSON) cost more than reading the text, so compact schemas (short refs, no repeated names) matter. Pre-filtering chunks and batch pricing halve the bill; a larger model for everything would multiply it ~10x, so reserve it for high-value documents or a gleaning pass.',
      followUps: [
        { q: 'What does a gleaning (second pass) on 20% of chunks add?', a: '140,000 extra calls with similar token counts ≈ 0.2 × $385 ≈ $77 with batch pricing, a modest cost for typically 10–20% more relations on those chunks.' },
      ],
    },
    {
      id: 'knowledge-graphs-est-2',
      question: 'Estimate candidate pairs and adjudication cost for entity resolution over 2M organisation mentions with and without blocking.',
      assumptions: [
        '2M mentions',
        'Blocking produces blocks averaging 30 mentions (multiple keys, union of candidates)',
        'Scoring a pair costs ~2 µs of CPU (string + cosine on cached embeddings)',
        '3% of scored pairs fall in the grey zone; LLM adjudication ≈ 400 input + 20 output tokens at $0.25/$2 per 1M',
      ],
      steps: [
        { label: 'All pairs', calc: 'n(n−1)/2 = 2M × 2M / 2 ≈ 2×10^12 pairs' },
        { label: 'All pairs CPU', calc: '2×10^12 × 2 µs = 4×10^6 s ≈ 46 days of one core' },
        { label: 'Blocked pairs', calc: '(2M / 30) blocks × (30 × 29 / 2) = 66,667 × 435 ≈ 2.9×10^7 pairs' },
        { label: 'Blocked CPU', calc: '2.9×10^7 × 2 µs ≈ 58 s' },
        { label: 'Grey-zone pairs', calc: '2.9×10^7 × 3% ≈ 870,000' },
        { label: 'LLM adjudication cost', calc: '870,000 × (400 × $0.25 + 20 × $2) / 1M = 870,000 × $0.00014 ≈ $122' },
      ],
      answer: 'Blocking reduces ~2×10^12 pairs (≈ 46 core-days) to ~2.9×10^7 pairs (≈ 1 minute), and LLM adjudication of the ~870K grey-zone pairs costs about $120.',
      insight: 'Blocking is what makes ER possible at all, and threshold tuning controls LLM spend linearly: shrinking the grey zone from 3% to 1% cuts adjudication to ~$40. The real risk is blocking recall: true matches that never share a block are lost silently, so use several blocking keys.',
      followUps: [
        { q: 'If you double the average block size to 60, what happens to pairs?', a: 'Pairs per block grow quadratically: (2M/60) × (60 × 59 / 2) ≈ 33,333 × 1,770 ≈ 5.9×10^7, about 2x more pairs, still cheap on CPU but doubling the grey-zone LLM cost to ~$245.' },
      ],
    },
  ],
  test: [
    {
      id: 'knowledge-graphs-mcq-01',
      difficulty: 'medium',
      question: 'Which representation is a single knowledge-graph triple?',
      options: [
        '(Acme, ACQUIRED, Globex)',
        'A 512-token text chunk mentioning Acme and Globex',
        'A 1536-dimensional embedding of "Acme acquired Globex"',
        'A SQL table of companies',
      ],
      correct: [0],
      explanation: 'A triple is subject–predicate–object. Chunks and embeddings are retrieval units for text search, and a table is a relational structure, not a fact-level relationship.',
      followUps: [{ q: 'Where do properties such as the acquisition date go in a property graph?', a: 'On the relationship itself, e.g. (Acme)-[:ACQUIRED {date: 2024-03, amount: 2.1e9}]->(Globex), together with provenance like the source document.' }],
    },
    {
      id: 'knowledge-graphs-mcq-02',
      difficulty: 'hard',
      question: 'What happens when this runs twice with the same rows?',
      code: {
        language: 'sql',
        code: `UNWIND $rows AS row
CREATE (a:Org {id: row.s})
CREATE (b:Org {id: row.o})
CREATE (a)-[:SUPPLIES]->(b)`,
      },
      options: [
        'Nothing changes on the second run',
        'Duplicate nodes and relationships are created (or the run fails if a uniqueness constraint exists)',
        'Neo4j automatically merges identical nodes',
        'Only relationships are duplicated',
      ],
      correct: [1],
      explanation: 'CREATE always creates. Without a constraint you get duplicates of every node and edge; with a uniqueness constraint on Org.id the second run fails. Use MERGE on the key for idempotent upserts. Neo4j never auto-merges.',
      followUps: [{ q: 'Why should the relationship also be MERGEd, not just the nodes?', a: 'Otherwise every re-run adds another identical SUPPLIES edge between the same nodes, inflating counts and path scores.' }],
    },
    {
      id: 'knowledge-graphs-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL good practices for LLM-based relation extraction into a knowledge graph.',
      options: [
        'Constrain entity and relation types with enums in a structured-output schema',
        'Require a verbatim evidence quote and check it exists in the source chunk',
        'Let the model invent new relation types freely to maximise recall',
        'Store source document, chunk id, model version and confidence on each edge',
      ],
      correct: [0, 1, 3],
      explanation: 'Enums prevent schema drift, evidence checks filter hallucinations, and provenance enables audits and updates. Free-form relation types produce dozens of synonyms that make the graph unqueryable.',
      followUps: [{ q: 'How do you discover relation types you are missing?', a: 'Run an open extraction pass on a sample, cluster the proposed relation phrases, and promote frequent, useful clusters into the schema after review.' }],
    },
    {
      id: 'knowledge-graphs-mcq-04',
      difficulty: 'expert',
      question: 'Your ER system auto-merges at Jaro-Winkler ≥ 0.9 on normalised names. Select ALL likely consequences.',
      options: [
        'Distinct organisations with similar names (Apex Holdings UK/US) get merged',
        'Abbreviations like "IBM" and "International Business Machines" stay unmerged',
        'Traversals through merged nodes create false multi-hop facts',
        'Precision of merges becomes guaranteed above 99%',
      ],
      correct: [0, 1, 2],
      explanation: 'Name-only string similarity over-merges look-alikes and under-merges abbreviations; over-merged nodes then join unrelated subgraphs, producing false paths. Nothing guarantees 99% precision without measurement on labelled pairs and attribute evidence.',
      followUps: [{ q: 'Which signal best fixes the abbreviation miss?', a: 'An acronym blocking key plus context embeddings (and identifiers such as tickers or domains), since string similarity between "IBM" and the full name is low.' }],
    },
    {
      id: 'knowledge-graphs-mcq-05',
      difficulty: 'medium',
      question: 'Why use blocking in entity resolution?',
      options: [
        'To improve the quality of embeddings',
        'To avoid comparing every pair of mentions, which grows quadratically',
        'To translate names into English',
        'To store merged entities',
      ],
      correct: [1],
      explanation: 'Blocking restricts comparisons to candidates sharing a cheap key, turning ~n²/2 comparisons into a tractable number. It does not affect embeddings, translation or storage.',
      followUps: [{ q: 'What is the main risk of blocking?', a: 'True matches that share no blocking key are never compared, silently lowering recall; using several keys and ANN neighbours mitigates it.' }],
    },
    {
      id: 'knowledge-graphs-mcq-06',
      difficulty: 'hard',
      question: 'This query times out on a large graph. What is the primary problem?',
      code: {
        language: 'sql',
        code: `MATCH (e:Entity {name: $name})
MATCH p = (e)-[*]-(n)
RETURN p`,
      },
      options: [
        'The name lookup should use a regex',
        'The variable-length pattern has no type filter or depth bound, so it enumerates a combinatorial number of paths',
        'RETURN p should be RETURN n',
        'Parameters slow down Cypher',
      ],
      correct: [1],
      explanation: 'An untyped, unbounded [*] explores every path in the component, which explodes on real graphs (especially through hubs). Bound depth (*1..2), filter relationship types, cap degree and LIMIT. Regex lookups are slower, returning n still enumerates paths, and parameters help performance.',
      followUps: [{ q: 'What else would you add for retrieval use?', a: 'A score per path (seed similarity, edge confidence, hop decay), ORDER BY score with a LIMIT, and a transaction timeout.' }],
    },
    {
      id: 'knowledge-graphs-mcq-07',
      difficulty: 'hard',
      question: 'Select ALL safeguards appropriate for executing LLM-generated Cypher (Text2Cypher).',
      options: [
        'Run the query as a database user with read-only privileges',
        'Enforce a transaction timeout and a LIMIT',
        'Trust the model because the system prompt says "read-only queries only"',
        'Validate with EXPLAIN and feed errors back for one repair attempt',
      ],
      correct: [0, 1, 3],
      explanation: 'Read-only credentials are the real boundary, timeouts and limits bound cost, and EXPLAIN plus repair improves reliability. A prompt instruction is not a security control: injected questions can still produce writes.',
      followUps: [{ q: 'Why can a regex blocklist alone fail?', a: 'Keywords can hide in string literals, comments or procedure calls, and new syntax variants appear; regexes are a convenience filter, not a boundary.' }],
    },
    {
      id: 'knowledge-graphs-mcq-08',
      difficulty: 'expert',
      question: 'In this hybrid retrieval query, what does the degree filter accomplish?',
      code: {
        language: 'sql',
        code: `MATCH (seed:Entity) SEARCH seed IN (VECTOR INDEX entity_emb FOR $q LIMIT 5) SCORE AS sim
MATCH p = (seed)-[:PRODUCES|ACQUIRED*1..2]-(n:Entity)
WHERE all(x IN nodes(p)[1..] WHERE coalesce(x.degree, 0) <= 500)
RETURN p, sim ORDER BY sim DESC LIMIT 30`,
      },
      options: [
        'It improves the vector index recall',
        'It skips paths through hub nodes (e.g. a country or parent conglomerate) that would add thousands of loosely related facts',
        'It removes the seed nodes from results',
        'It sorts results by popularity',
      ],
      correct: [1],
      explanation: 'Hubs connect to almost everything; traversing through them floods context and slows queries. The filter keeps expansion local and relevant. It does not affect vector recall, does not drop seeds (nodes(p)[1..] skips index 0) and does not sort.',
      followUps: [{ q: 'Where does the degree property come from?', a: 'It is precomputed during ingestion or by a scheduled job (e.g. COUNT { (x)--() }) and stored on each node, since computing it per query is expensive.' }],
    },
    {
      id: 'knowledge-graphs-mcq-09',
      difficulty: 'medium',
      question: 'An LLM extracted "Globex -ACQUIRED-> Acme" from "Globex was acquired by Acme". What kind of error is this, and the best prevention?',
      options: [
        'An entity resolution error; lower the merge threshold',
        'A relation direction error; add direction-explicit schema descriptions, passive-voice few-shot examples and a verification pass',
        'A tokenisation error; use a bigger context window',
        'A vector index error; rebuild the index',
      ],
      correct: [1],
      explanation: 'The entities are right but the direction is reversed, a classic extraction error with passive voice. Explicit direction in the schema ("source acquires target"), examples and a verifier fix it. Resolution, tokenisation and indexing are unrelated.',
      followUps: [{ q: 'How could a second model verify direction cheaply?', a: 'Ask a small model a yes/no question per edge, e.g. "Does the evidence state that Globex acquired Acme?", and drop or flip edges that fail.' }],
    },
    {
      id: 'knowledge-graphs-mcq-10',
      difficulty: 'expert',
      question: 'Select ALL situations where graph-based retrieval is likely to outperform pure vector retrieval.',
      options: [
        'Counting how many suppliers of a component are located in a given country',
        'Finding the paragraph most similar to a quoted sentence',
        'Following ownership chains across filings to find the ultimate parent company',
        'Answering a question whose facts are split across three documents linked by shared entities',
      ],
      correct: [0, 2, 3],
      explanation: 'Aggregations, chains of relationships and facts connected only through shared entities are structural questions graphs answer directly. Finding the most similar paragraph is exactly what vector search is built for.',
      followUps: [{ q: 'What should happen when the graph has no relevant entity for a question?', a: 'Fall back to vector or hybrid text retrieval, rather than answering from an empty or irrelevant graph context.' }],
    },
    {
      id: 'knowledge-graphs-mcq-11',
      difficulty: 'hard',
      question: 'You need to query a Neo4j vector index on a 2026 Neo4j release and filter by a property inside the index. What should you use?',
      options: [
        'db.index.vector.queryNodes with a WHERE after YIELD, which filters inside the index',
        'The Cypher 25 SEARCH clause with a WHERE subclause inside SEARCH (in-index filtering), since the procedure is deprecated and only post-filters',
        'A full-text index',
        'A uniqueness constraint',
      ],
      correct: [1],
      explanation: 'From Neo4j 2026.01 the SEARCH clause is the preferred vector query and supports in-index filtering on properties stored with the index; the queryNodes procedure is deprecated (2026.04) and a WHERE after YIELD only post-filters the top-k, which can return fewer results than requested.',
      followUps: [{ q: 'Why is post-filtering after top-k risky?', a: 'If most of the k nearest neighbours fail the filter, you may return few or zero results even though matching items exist slightly further away.' }],
    },
    {
      id: 'knowledge-graphs-mcq-12',
      difficulty: 'hard',
      question: 'Select ALL correct statements about provenance in a knowledge graph used for RAG.',
      options: [
        'Storing source and chunk ids on edges enables removing facts when a document is deleted',
        'Including sources in serialised facts lets the answer cite evidence',
        'Provenance is unnecessary if extraction confidence is above 0.9',
        'Extraction timestamps help resolve conflicts in favour of newer evidence',
      ],
      correct: [0, 1, 3],
      explanation: 'Provenance supports deletion and sync, citations, and recency-based conflict resolution. High confidence scores do not remove the need: confident extractions can still be wrong or outdated, and you need to trace and fix them.',
      followUps: [{ q: 'How would you model facts that change over time, like CEO appointments?', a: 'Add validFrom/validTo on relationships (or event nodes), keep historical edges, and filter to currently valid edges unless the question asks about history.' }],
    },
  ],
};

export default topic;
