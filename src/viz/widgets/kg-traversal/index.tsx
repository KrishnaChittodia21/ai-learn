import { useId, useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, EDGES, MAX_HOPS, NODES, QUESTION, edgeKey, simulate, type NodeId, type Params, type Strategy } from './sim';

const POS: Record<NodeId, { x: number; y: number }> = {
  Us: { x: 58, y: 115 },
  BoltCo: { x: 200, y: 55 },
  NutCorp: { x: 200, y: 175 },
  Ana: { x: 300, y: 118 },
  'Factory-17': { x: 370, y: 55 },
  'Factory-9': { x: 370, y: 175 },
  'Region-X': { x: 530, y: 55 },
  'Region-Y': { x: 530, y: 175 },
};
const W = 92;
const H = 34;

/** point where the segment from a to b leaves the box around a */
function exit(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.min(dx ? W / 2 / Math.abs(dx) : Infinity, dy ? H / 2 / Math.abs(dy) : Infinity);
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export default function KgTraversalViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const uid = useId().replace(/:/g, '');

  const pathNodes = new Set(EDGES.filter((e) => f.path.includes(edgeKey(e))).flatMap((e) => [e.s, e.o]));
  const nodeStyle = (id: NodeId) => {
    if (pathNodes.has(id)) return { fill: 'var(--good-soft)', stroke: 'var(--good)', w: 2.5 };
    if (f.frontier.includes(id)) return { fill: 'var(--accent-soft)', stroke: 'var(--accent)', w: 2.5 };
    if (f.visited.includes(id)) return { fill: 'var(--surface)', stroke: 'var(--accent)', w: 1.2 };
    return { fill: 'var(--surface-2)', stroke: 'var(--border)', w: 1 };
  };

  const aria =
    params.strategy === 'vector'
      ? `Vector retrieval. ${f.chunks.map((c) => `${c.text} ${c.score} ${c.kept ? 'retrieved' : 'left out'}`).join('. ')}. ${f.answer ? 'No suppliers found.' : ''}`
      : `Graph traversal, hop ${f.hop}. Reached: ${f.visited.join(', ') || 'none'}. ${f.answer ? (f.answer.length ? `Answer ${f.answer.join(', ')}.` : 'No suppliers found.') : ''}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={
        f.stage === 'hop' && f.hop === 1
          ? {
              kind: 'choice',
              id: JSON.stringify(params),
              at: stepper.i,
              question: 'The walk is at BoltCo. Which edge should it follow next to answer the question?',
              options: [
                {
                  id: 'WORKS_AT',
                  label: 'WORKS_AT ← Ana',
                  why: 'Ana is a real fact about BoltCo, but people are not in the pattern; following every edge is how traversals blow up. The next hop is SOURCES_FROM → Factory-17.',
                },
                { id: 'SOURCES_FROM', label: 'SOURCES_FROM → Factory-17' },
                { id: 'SUPPLIES', label: 'SUPPLIES → Us', why: 'That is the edge the walk just came in on. The next hop is SOURCES_FROM → Factory-17, towards a region.' },
              ],
              answer: 'SOURCES_FROM',
              why: 'The pattern goes supplier → factory → region, so the walk follows SOURCES_FROM and ignores Ana.',
              continueLabel: 'Take the next hop →',
            }
          : undefined
      }
      controls={
        <>
          <Choice<Strategy>
            label="Retrieval"
            value={params.strategy}
            options={[
              { value: 'graph', label: 'Graph traversal' },
              { value: 'vector', label: 'Vector RAG only' },
            ]}
            onChange={(strategy) => setParams((p) => ({ ...p, strategy }))}
          />
          {params.strategy === 'graph' && <Slider label="Hop budget" value={params.maxHops} min={1} max={MAX_HOPS} onChange={(maxHops) => setParams((p) => ({ ...p, maxHops }))} />}
        </>
      }
      legend={
        params.strategy === 'graph' ? (
          <>
            <span className="viz-key" style={{ background: 'var(--accent)' }} /> reached on this hop
            <span className="viz-key ring" /> already reached
            <span className="viz-key" style={{ background: 'var(--good)' }} /> evidence path / answer
            <span>- - - not in the query pattern</span>
          </>
        ) : (
          <>
            <span className="viz-key" style={{ background: 'var(--good)' }} /> retrieved
            <span className="viz-key" style={{ background: 'var(--bad)' }} /> left out
          </>
        )
      }
    >
      <WideSvg label="Knowledge graph">
        <svg viewBox="0 0 600 236" className="viz-svg" role="img" aria-label={aria}>
          <defs>
            <marker id={`kg-arrow-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
            </marker>
            <marker id={`kg-arrow-on-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
            <marker id={`kg-arrow-ok-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--good)" />
            </marker>
          </defs>
          <text x={8} y={14} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            Q: {QUESTION}
          </text>

          {params.strategy === 'vector' ? (
            <g>
              {f.chunks.map((c, k) => {
                const y = 50 + k * 64;
                return (
                  <g key={k}>
                    <text x={8} y={y} fontSize={10.5} fontWeight={600}>
                      {c.text}
                    </text>
                    <rect x={8} y={y + 8} width={480} height={14} rx={4} fill="var(--surface-2)" stroke="var(--border)" />
                    <rect x={8} y={y + 8} width={480 * c.score} height={14} rx={4} fill={c.kept ? 'var(--good)' : 'var(--bad)'} style={{ transition: 'width 0.35s ease' }} />
                    <text x={592} y={y + 19} textAnchor="end" fontSize={11} fontWeight={800} style={{ fill: c.kept ? 'var(--good)' : 'var(--bad)' }}>
                      {c.score.toFixed(2)} {c.kept ? '✓' : '✗'}
                    </text>
                  </g>
                );
              })}
              {f.answer && (
                <text x={8} y={200} fontSize={12} fontWeight={800} style={{ fill: 'var(--bad)' }}>
                  Answer: “no suppliers found” (the chain spans 3 documents)
                </text>
              )}
            </g>
          ) : (
            <g>
              {EDGES.map((e) => {
                const k = edgeKey(e);
                const a = POS[e.s];
                const b = POS[e.o];
                const p1 = exit(a, b);
                const p2 = exit(b, a);
                const onPath = f.path.includes(k);
                const walked = f.walked.includes(k);
                const ignored = f.ignored.includes(k);
                const stroke = onPath ? 'var(--good)' : walked ? 'var(--accent)' : 'var(--muted)';
                const marker = onPath ? `kg-arrow-ok-${uid}` : walked ? `kg-arrow-on-${uid}` : `kg-arrow-${uid}`;
                const mx = (p1.x + p2.x) / 2;
                const my = (p1.y + p2.y) / 2;
                const flat = a.y === b.y;
                return (
                  <g key={k} opacity={ignored ? 0.45 : 1}>
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={stroke}
                      strokeWidth={onPath ? 2.5 : walked ? 2 : 1.2}
                      strokeDasharray={walked || onPath ? undefined : '4 3'}
                      markerEnd={`url(#${marker})`}
                      style={{ transition: 'stroke 0.3s ease' }}
                    />
                    {/* horizontal edges are short: label above the line so the arrowhead stays visible */}
                    {!flat && <rect x={mx - 36} y={my - 8} width={72} height={14} rx={7} fill="var(--surface)" stroke="none" />}
                    <text x={mx} y={flat ? my - 5 : my + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} style={{ fill: stroke, fontFamily: 'var(--mono)' }}>
                      {e.p}
                    </text>
                  </g>
                );
              })}
              {NODES.map((n) => {
                const { x, y } = POS[n.id];
                const st = nodeStyle(n.id);
                return (
                  <g key={n.id}>
                    <rect x={x - W / 2} y={y - H / 2} width={W} height={H} rx={n.type === 'Region' ? 17 : 8} fill={st.fill} stroke={st.stroke} strokeWidth={st.w} style={{ transition: 'fill 0.3s ease, stroke 0.3s ease' }} />
                    <text x={x} y={y - 1} textAnchor="middle" fontSize={11} fontWeight={700}>
                      {n.id}
                    </text>
                    <text x={x} y={y + 11} textAnchor="middle" fontSize={8.5} style={{ fill: n.status === 'sanctioned' && f.visited.includes(n.id) ? 'var(--bad)' : 'var(--muted)' }}>
                      {n.status ? `status: ${n.status}` : n.type}
                    </text>
                  </g>
                );
              })}
              <text x={8} y={228} fontSize={10} fontWeight={700} style={{ fill: f.answer ? (f.answer.length ? 'var(--good)' : 'var(--bad)') : 'var(--text-2)' }}>
                {f.answer ? (f.answer.length ? `Answer: ${f.answer.join(', ')} (3-hop path as evidence)` : 'Answer: “no suppliers found”') : `Hop ${f.hop} of ${params.maxHops}`}
              </text>
            </g>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
