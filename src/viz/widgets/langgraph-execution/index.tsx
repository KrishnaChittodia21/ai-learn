import { useId, useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, MAX_LIMIT, MIN_LIMIT, SCENARIO_LABELS, THREAD_ID, simulate, type Decision, type EdgeId, type Msg, type NodeId, type Params, type ScenarioId } from './sim';

const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

const NODES: { id: NodeId; label: string; cx: number; cy: number; w: number; h: number; pill?: boolean }[] = [
  { id: 'START', label: 'START', cx: 125, cy: 18, w: 64, h: 20, pill: true },
  { id: 'agent', label: 'agent', cx: 125, cy: 70, w: 100, h: 30 },
  { id: 'tools', label: 'tools', cx: 48, cy: 158, w: 84, h: 30 },
  { id: 'END', label: 'END', cx: 196, cy: 158, w: 50, h: 22, pill: true },
  { id: 'human_review', label: 'human_review', cx: 125, cy: 230, w: 116, h: 30 },
];

const EDGES: { id: EdgeId; d: string; kind: 'plain' | 'cond' | 'command' }[] = [
  { id: 'start-agent', d: 'M 125 28 L 125 53', kind: 'plain' },
  { id: 'agent-tools', d: 'M 106 85 L 62 141', kind: 'cond' },
  { id: 'agent-end', d: 'M 142 85 L 187 145', kind: 'cond' },
  { id: 'agent-review', d: 'M 125 85 L 125 213', kind: 'cond' },
  { id: 'tools-agent', d: 'M 20 143 C 8 100, 30 70, 73 70', kind: 'plain' },
  { id: 'review-tools', d: 'M 88 215 L 62 175', kind: 'command' },
  { id: 'review-agent', d: 'M 183 230 C 250 225, 252 90, 177 74', kind: 'command' },
];

const MSG_TAG: Record<Msg['type'], string> = { human: 'HUMAN', ai: 'AI', tool: 'TOOL' };
const MAX_MSG_ROWS = 6;

export default function LangGraphExecutionViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const uid = useId().replace(/:/g, '');
  const arrowId = `lg-arrow-${uid}`;
  const arrowOnId = `lg-arrow-on-${uid}`;

  const finalFrame = frames[frames.length - 1];
  const errorFrame = frames.find((x) => x.blockedNext);
  const maxStep = Math.max(...finalFrame.checkpoints.map((c) => c.step)) + (errorFrame ? 1 : 0);
  const cols = Math.max(7, maxStep + 1);
  const colW = Math.min(64, 588 / cols);
  const rowsCount = Math.max(...finalFrame.checkpoints.map((c) => c.branch)) + 1;
  const rowY = (b: number) => 314 + b * 29;
  const colX = (step: number) => 6 + step * colW;

  const msgRows = f.messages.slice(-MAX_MSG_ROWS);
  const hiddenMsgs = f.messages.length - msgRows.length;

  const nodeFill = (id: NodeId) => {
    const on = f.activeNode === id;
    if (f.status === 'error' && f.blockedNext === id) return { fill: 'var(--bad-soft)', stroke: 'var(--bad)', text: 'var(--bad)', dash: '4 3' };
    if (on && f.status === 'interrupted' && id === 'human_review') return { fill: 'var(--warn)', stroke: 'var(--warn)', text: 'var(--surface)', dash: undefined };
    if (on && id === 'END') return { fill: 'var(--good)', stroke: 'var(--good)', text: 'var(--surface)', dash: undefined };
    if (on) return { fill: 'var(--accent)', stroke: 'var(--accent)', text: 'var(--surface)', dash: undefined };
    return { fill: 'var(--surface-2)', stroke: 'var(--border)', text: 'var(--text)', dash: undefined };
  };

  const head = f.head !== null ? f.checkpoints[f.head] : null;
  const aria = `LangGraph run, scenario ${SCENARIO_LABELS[params.scenario]}. Invoke ${f.invoke}, superstep ${f.superstep} of recursionLimit ${params.recursionLimit}, status ${f.status}${f.error ? ` (${f.error})` : ''}. Active node ${f.activeNode ?? 'none'}. State: ${f.messages.length} messages, llmCalls ${f.llmCalls}, lastNode ${f.lastNode ?? 'unset'}. ${f.checkpoints.length} checkpoints on thread ${THREAD_ID}${head ? `, current c${head.id} with next [${head.next.join(', ')}]` : ''}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<ScenarioId>
            label="Scenario"
            value={params.scenario}
            options={(Object.keys(SCENARIO_LABELS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIO_LABELS[k] }))}
            onChange={(scenario) => setParams((p) => ({ ...p, scenario }))}
          />
          <Slider label="recursionLimit" value={params.recursionLimit} min={MIN_LIMIT} max={MAX_LIMIT} onChange={(recursionLimit) => setParams((p) => ({ ...p, recursionLimit }))} />
          <Choice<Decision>
            label="Reviewer (interrupt scenario)"
            value={params.decision}
            options={[
              { value: 'approve', label: 'approve' },
              { value: 'reject', label: 'reject' },
            ]}
            onChange={(decision) => setParams((p) => ({ ...p, decision }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> running node / current checkpoint
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> interrupted / reducer change
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> error
          <span className="viz-key" style={{ background: 'var(--good)' }} /> END
          <span style={{ whiteSpace: 'nowrap' }}>- - conditional edge · ··· Command goto</span>
        </>
      }
    >
      <WideSvg label="LangGraph execution diagram">
        <svg viewBox="0 0 600 404" className="viz-svg" role="img" aria-label={aria}>
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: 'var(--muted)' }} />
            </marker>
            <marker id={arrowOnId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: 'var(--accent)' }} />
            </marker>
          </defs>

          {/* ---------------- graph */}
          {EDGES.map((e) => {
            const on = f.activeEdge === e.id;
            return (
              <path
                key={e.id}
                d={e.d}
                fill="none"
                stroke={on ? 'var(--accent)' : 'var(--muted)'}
                strokeWidth={on ? 2.5 : 1.3}
                strokeDasharray={e.kind === 'cond' ? '5 3' : e.kind === 'command' ? '1.5 3' : undefined}
                markerEnd={`url(#${on ? arrowOnId : arrowId})`}
                opacity={on ? 1 : 0.8}
              />
            );
          })}
          <text x={40} y={114} textAnchor="middle" fontSize={8} style={{ fill: 'var(--text-2)' }}>
            tool_calls
          </text>
          <text x={129} y={192} fontSize={8} style={{ fill: 'var(--text-2)' }}>
            sensitive
          </text>
          <text x={168} y={110} fontSize={8} style={{ fill: 'var(--text-2)' }}>
            no calls
          </text>
          <text x={66} y={204} textAnchor="end" fontSize={8} style={{ fill: 'var(--text-2)' }}>
            approve
          </text>
          <text x={226} y={202} fontSize={8} style={{ fill: 'var(--text-2)' }}>
            reject
          </text>
          {NODES.map((n) => {
            const s = nodeFill(n.id);
            return (
              <g key={n.id}>
                <rect x={n.cx - n.w / 2} y={n.cy - n.h / 2} width={n.w} height={n.h} rx={n.pill ? n.h / 2 : 7} fill={s.fill} stroke={s.stroke} strokeWidth={f.activeNode === n.id ? 2 : 1} strokeDasharray={s.dash} />
                <text x={n.cx} y={n.cy + 4} textAnchor="middle" fontSize={n.pill ? 9.5 : 11} fontWeight={700} style={{ fill: s.text, fontFamily: n.pill ? 'var(--sans)' : 'var(--mono)' }}>
                  {n.label}
                </text>
              </g>
            );
          })}
          {f.status === 'interrupted' && (
            <text x={125} y={258} textAnchor="middle" fontSize={8.5} fontWeight={700} style={{ fill: 'var(--warn)' }}>
              ⏸ paused in interrupt()
            </text>
          )}

          {/* superstep budget */}
          <text x={6} y={276} fontSize={9.5} fontWeight={700} style={{ fill: f.status === 'error' ? 'var(--bad)' : 'var(--text-2)' }}>
            {f.invoke > 0 ? `invoke #${f.invoke} · ` : ''}superstep {f.superstep} / recursionLimit {params.recursionLimit}
          </text>
          {Array.from({ length: params.recursionLimit }, (_, i) => (
            <rect
              key={i}
              x={6 + i * (244 / params.recursionLimit)}
              y={282}
              width={244 / params.recursionLimit - 3}
              height={8}
              rx={2}
              fill={i < f.superstep ? (f.status === 'error' ? 'var(--bad)' : 'var(--accent)') : 'var(--surface-2)'}
              stroke="var(--border)"
            />
          ))}

          {/* ---------------- state panel */}
          <rect x={258} y={2} width={336} height={288} rx={8} fill="none" stroke="var(--border)" />
          <text x={266} y={17} fontSize={10.5} fontWeight={700}>
            state
            <tspan fontWeight={400} style={{ fill: 'var(--text-2)' }}>
              {' '}
              · thread_id '{THREAD_ID}'
            </tspan>
          </text>
          <text x={266} y={33} fontSize={8.5} style={{ fill: 'var(--text-2)' }}>
            messages · add-messages reducer{hiddenMsgs > 0 ? ` · +${hiddenMsgs} earlier` : ''}
          </text>
          {f.delta?.messages && (
            <text x={588} y={33} textAnchor="end" fontSize={8.5} fontWeight={700} style={{ fill: 'var(--warn)' }}>
              {short(f.delta.messages, 26)}
            </text>
          )}
          {msgRows.length === 0 && (
            <text x={266} y={52} fontSize={9} style={{ fill: 'var(--text-2)' }}>
              [] (empty)
            </text>
          )}
          {msgRows.map((m, r) => {
            const y = 39 + r * 19;
            const isNew = r === msgRows.length - 1 && !!f.delta?.messages;
            const tone = m.error ? 'bad' : m.type === 'ai' ? (m.toolCalls ? 'warn' : 'good') : m.type === 'tool' ? 'accent' : 'surface';
            const fill = tone === 'surface' ? 'var(--surface-2)' : `var(--${tone}-soft)`;
            const stroke = tone === 'surface' ? 'var(--border)' : `var(--${tone})`;
            return (
              <g key={`${hiddenMsgs + r}-${m.id}`}>
                <rect x={264} y={y} width={324} height={16} rx={4} fill={fill} stroke={stroke} strokeWidth={isNew ? 1.8 : 0.8} />
                <text x={270} y={y + 11.5} fontSize={8} fontWeight={700} style={{ fill: tone === 'surface' ? 'var(--text-2)' : stroke }}>
                  {MSG_TAG[m.type]}
                </text>
                <text x={304} y={y + 11.5} fontSize={7.5} style={{ fill: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
                  {m.id}
                </text>
                <text x={330} y={y + 11.5} fontSize={8.3} style={{ fontFamily: 'var(--mono)' }}>
                  {short(m.text, 48)}
                </text>
              </g>
            );
          })}

          {[
            { y: 156, name: 'llmCalls', value: String(f.llmCalls), note: 'reducer: (a, b) => a + b  (sum)', delta: f.delta?.llmCalls },
            { y: 190, name: 'lastNode', value: f.lastNode === null ? 'unset' : `'${f.lastNode}'`, note: 'no reducer: last write wins (overwrite)', delta: f.delta?.lastNode },
          ].map((row) => (
            <g key={row.name}>
              <rect x={264} y={row.y} width={324} height={30} rx={5} fill={row.delta ? 'var(--warn-soft)' : 'var(--surface-2)'} stroke={row.delta ? 'var(--warn)' : 'var(--border)'} />
              <text x={272} y={row.y + 13} fontSize={9.5} fontWeight={700} style={{ fontFamily: 'var(--mono)' }}>
                {row.name} = {row.value}
              </text>
              <text x={272} y={row.y + 25} fontSize={8} style={{ fill: 'var(--text-2)' }}>
                {row.note}
              </text>
              {row.delta && (
                <text x={582} y={row.y + 13} textAnchor="end" fontSize={8.5} fontWeight={700} style={{ fill: 'var(--warn)', fontFamily: 'var(--mono)' }}>
                  {short(row.delta, 24)}
                </text>
              )}
            </g>
          ))}

          <rect x={264} y={226} width={324} height={58} rx={5} fill={f.update ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={f.update ? 'var(--accent)' : 'var(--border)'} strokeDasharray={f.update ? undefined : '3 3'} />
          <text x={272} y={239} fontSize={8.5} fontWeight={700} style={{ fill: f.update ? 'var(--accent)' : 'var(--text-2)' }}>
            {f.update ? (f.update.node === 'updateState' ? 'patch passed to updateState()' : `partial update returned by '${f.update.node}'`) : 'no node update this step'}
          </text>
          {(f.update?.lines ?? []).slice(0, 3).map((l, i) => (
            <text key={i} x={272} y={253 + i * 12} fontSize={8.2} style={{ fontFamily: 'var(--mono)' }}>
              {short(l, 60)}
            </text>
          ))}

          {/* ---------------- checkpoint strip */}
          <text x={6} y={306} fontSize={9.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            checkpoints · thread_id '{THREAD_ID}' · one per superstep{f.error ? ` · ${f.error}` : ''}
          </text>
          {Array.from({ length: rowsCount }, (_, b) =>
            b === 0 ? null : (
              <text key={b} x={6} y={rowY(b) + 15} fontSize={7.5} style={{ fill: 'var(--text-2)' }} opacity={f.checkpoints.some((c) => c.branch === b) ? 1 : 0.35}>
                {b === 1 ? 'replay' : 'fork'}
              </text>
            ),
          )}
          {f.checkpoints.map((c) => {
            const x = colX(c.step);
            const y = rowY(c.branch);
            const isHead = f.head === c.id;
            const parent = c.parent !== null ? f.checkpoints[c.parent] : null;
            const nextLabel = c.interrupt ? '⏸ pending' : c.next.length === 0 ? 'end' : '→' + (c.next[0] === 'human_review' ? 'review' : c.next[0]);
            return (
              <g key={c.id}>
                {parent && parent.branch !== c.branch && (
                  <path d={`M ${colX(parent.step) + colW / 2 - 3} ${rowY(parent.branch) + 24} L ${colX(parent.step) + colW / 2 - 3} ${y + 12} L ${x} ${y + 12}`} fill="none" stroke="var(--muted)" strokeWidth={1.2} />
                )}
                {parent && parent.branch === c.branch && <line x1={colX(parent.step) + colW - 6} y1={y + 12} x2={x} y2={y + 12} stroke="var(--muted)" strokeWidth={1.2} />}
                <rect
                  x={x}
                  y={y}
                  width={colW - 6}
                  height={24}
                  rx={4}
                  fill={c.interrupt ? 'var(--warn-soft)' : isHead ? 'var(--accent-soft)' : c.source === 'update' ? 'var(--surface)' : 'var(--surface-2)'}
                  stroke={c.interrupt ? 'var(--warn)' : isHead ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={isHead ? 2 : 1}
                  strokeDasharray={c.source === 'update' ? '3 2' : undefined}
                />
                <text x={x + (colW - 6) / 2} y={y + 10} textAnchor="middle" fontSize={8.5} fontWeight={700}>
                  c{c.id}
                </text>
                <text x={x + (colW - 6) / 2} y={y + 20} textAnchor="middle" fontSize={colW < 48 ? 6.5 : 7.5} style={{ fill: 'var(--text-2)' }}>
                  {nextLabel}
                </text>
              </g>
            );
          })}
          {f.blockedNext && head && (
            <g>
              <line x1={colX(head.step) + colW - 6} y1={rowY(0) + 12} x2={colX(head.step + 1)} y2={rowY(0) + 12} stroke="var(--bad)" strokeDasharray="3 2" />
              <rect x={colX(head.step + 1)} y={rowY(0)} width={colW - 6} height={24} rx={4} fill="var(--bad-soft)" stroke="var(--bad)" strokeDasharray="3 2" />
              <text x={colX(head.step + 1) + (colW - 6) / 2} y={rowY(0) + 10} textAnchor="middle" fontSize={8.5} fontWeight={700} style={{ fill: 'var(--bad)' }}>
                ✕
              </text>
              <text x={colX(head.step + 1) + (colW - 6) / 2} y={rowY(0) + 20} textAnchor="middle" fontSize={colW < 48 ? 6.5 : 7.5} style={{ fill: 'var(--bad)' }}>
                limit
              </text>
            </g>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
