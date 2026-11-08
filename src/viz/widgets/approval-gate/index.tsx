import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { AUTO_LIMIT, DEFAULT_PARAMS, MAX_AMOUNT, MIN_AMOUNT, ORDER_ID, ORDER_TOTAL, SLA_HOURS, bestDecision, simulate, type Decision, type Params, type StateId } from './sim';

const DY = 26;
const POS: Record<StateId, { x: number; y: number }> = {
  PROPOSED: { x: 55, y: 60 + DY },
  RISK_GATE: { x: 167, y: 60 + DY },
  PENDING: { x: 285, y: 60 + DY },
  APPROVED: { x: 412, y: 22 + DY },
  EDITED: { x: 412, y: 70 + DY },
  REJECTED: { x: 412, y: 118 + DY },
  TIMED_OUT: { x: 412, y: 166 + DY },
  EXECUTED: { x: 538, y: 46 + DY },
  AGENT: { x: 538, y: 118 + DY },
  ESCALATED: { x: 538, y: 166 + DY },
  AUTO_REJECTED: { x: 538, y: 214 + DY },
};
const LABEL: Record<StateId, string> = {
  PROPOSED: 'PROPOSED',
  RISK_GATE: 'RISK GATE',
  PENDING: 'PENDING ⏸',
  APPROVED: 'APPROVED',
  EDITED: 'EDITED',
  REJECTED: 'REJECTED',
  TIMED_OUT: 'TIMED OUT',
  EXECUTED: 'EXECUTED',
  AGENT: '→ AGENT',
  ESCALATED: 'ESCALATED',
  AUTO_REJECTED: 'AUTO-REJECT',
};
const W = 98;
const H = 30;
const EDGES: [StateId, StateId][] = [
  ['PROPOSED', 'RISK_GATE'],
  ['RISK_GATE', 'PENDING'],
  ['PENDING', 'APPROVED'],
  ['PENDING', 'EDITED'],
  ['PENDING', 'REJECTED'],
  ['PENDING', 'TIMED_OUT'],
  ['APPROVED', 'EXECUTED'],
  ['EDITED', 'EXECUTED'],
  ['REJECTED', 'AGENT'],
  ['TIMED_OUT', 'ESCALATED'],
  ['ESCALATED', 'AUTO_REJECTED'],
  ['RISK_GATE', 'EXECUTED'],
];
const BAD = new Set<StateId>(['REJECTED', 'TIMED_OUT', 'ESCALATED', 'AUTO_REJECTED', 'AGENT']);

function edgePath(a: StateId, b: StateId) {
  const p = POS[a];
  const q = POS[b];
  if (a === 'RISK_GATE' && b === 'EXECUTED') return `M ${p.x} ${p.y - H / 2} C ${p.x} ${p.y - 80}, ${q.x} ${q.y - 70}, ${q.x} ${q.y - H / 2}`;
  if (p.x === q.x) return `M ${p.x} ${p.y + H / 2} L ${q.x} ${q.y - H / 2}`;
  return `M ${p.x + W / 2} ${p.y} C ${p.x + W / 2 + 14} ${p.y}, ${q.x - W / 2 - 14} ${q.y}, ${q.x - W / 2} ${q.y}`;
}

const DECISION_LABEL: Record<Decision, string> = { approve: 'Approve', edit: `Edit to $${ORDER_TOTAL}`, reject: 'Reject', timeout: 'No answer (timeout)' };

export default function ApprovalGateViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  // a Reviewer change keeps the current step (the Your-turn resumes from it); a new amount starts over
  const stepper = useFrames(frames, { keepIndex: true, resetKey: params.amount });
  const f = stepper.frame;

  const onEdge = (a: StateId, b: StateId) => f.trail.some((s, k) => s === a && f.trail[k + 1] === b);
  const best = bestDecision(params.amount);
  const explain = (p: Decision) =>
    best === 'edit'
      ? p === 'approve'
        ? `Approving pays $${params.amount - ORDER_TOTAL} too much: the agent added shipping. Edit the args to $${ORDER_TOTAL}, then approve.`
        : p === 'edit'
          ? `The agent added non-refundable shipping. The edit fixes the args and the run continues with $${ORDER_TOTAL}.`
          : p === 'reject'
            ? `The customer is owed $${ORDER_TOTAL}; rejecting sends the agent back for nothing. Edit fixes the amount instead.`
            : 'Leaving it unanswered means the customer waits for the SLA and escalation. Edit to the order total.'
      : p === 'approve'
        ? `$${params.amount} is within the $${ORDER_TOTAL} order total, so approve as proposed.`
        : p === 'edit'
          ? `Nothing to fix: $${params.amount} is within the order total, so an edit is just an approve.`
          : `The amount is valid (≤ $${ORDER_TOTAL}), so the right call is approve.`;

  const aria = `Approval gate state machine. Current state ${f.state}. Path: ${f.trail.join(' → ')}.${f.paused ? ' Paused at interrupt with a checkpoint.' : ''}${
    f.refund !== null ? ` Refund $${f.refund}.` : ''
  }`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={
        f.state === 'PENDING'
          ? {
              kind: 'choice',
              // the answer depends only on the amount
              id: `amount-${params.amount}`,
              at: stepper.i,
              question: `You are the support lead. The agent wants to refund $${params.amount} for order ${ORDER_ID}. The order total was $${ORDER_TOTAL}; shipping is non-refundable. Your decision?`,
              options: (Object.keys(DECISION_LABEL) as Decision[]).map((k) => ({ id: k, label: DECISION_LABEL[k], why: explain(k) })),
              answer: best,
              why: explain(best),
              // resume with the decision: keepIndex holds the step while the run re-simulates
              onContinue: () => {
                stepper.seek(stepper.i + 1);
                setParams((p) => ({ ...p, decision: best }));
              },
              continueLabel: 'Resume with my decision →',
            }
          : undefined
      }
      controls={
        <>
          <Slider label="Proposed refund" value={params.amount} min={MIN_AMOUNT} max={MAX_AMOUNT} format={(v) => `$${v}`} onChange={(amount) => setParams((p) => ({ ...p, amount }))} />
          <Choice<Decision>
            label="Reviewer"
            value={params.decision}
            options={(Object.keys(DECISION_LABEL) as Decision[]).map((k) => ({ value: k, label: DECISION_LABEL[k] }))}
            onChange={(decision) => setParams((p) => ({ ...p, decision }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> current state
          <span className="viz-key" style={{ background: 'var(--good)' }} /> refund path
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> paused / waiting
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> no refund
        </>
      }
    >
      <WideSvg label="Approval gate">
        <svg viewBox="0 0 600 290" className="viz-svg" role="img" aria-label={aria}>
          <text x={POS.RISK_GATE.x + 70} y={12} fontSize={9} fontWeight={700} style={{ fill: onEdge('RISK_GATE', 'EXECUTED') ? 'var(--good)' : 'var(--muted)' }}>
            ≤ ${AUTO_LIMIT}: auto-approve, no interrupt
          </text>
          {EDGES.map(([a, b]) => {
            const on = onEdge(a, b);
            const color = on ? (BAD.has(b) ? 'var(--bad)' : 'var(--good)') : 'var(--muted)';
            return (
              <path
                key={a + b}
                d={edgePath(a, b)}
                fill="none"
                stroke={color}
                strokeWidth={on ? 2.5 : 1.2}
                strokeDasharray={on ? undefined : '4 3'}
                style={{ transition: 'stroke 0.3s ease' }}
              />
            );
          })}
          {(Object.keys(POS) as StateId[]).map((id) => {
            const { x, y } = POS[id];
            const cur = f.state === id;
            const seen = f.trail.includes(id);
            const waiting = cur && f.paused;
            const stroke = waiting ? 'var(--warn)' : cur ? 'var(--accent)' : seen ? (BAD.has(id) ? 'var(--bad)' : 'var(--good)') : 'var(--border)';
            const fill = waiting ? 'var(--warn-soft)' : cur ? 'var(--accent-soft)' : seen ? (BAD.has(id) ? 'var(--bad-soft)' : 'var(--good-soft)') : 'var(--surface-2)';
            return (
              <g key={id}>
                <rect x={x - W / 2} y={y - H / 2} width={W} height={H} rx={id === 'EXECUTED' || id === 'AUTO_REJECTED' ? 15 : 8} fill={fill} stroke={stroke} strokeWidth={cur ? 2.5 : 1.3} style={{ transition: 'fill 0.3s ease, stroke 0.3s ease' }} />
                <text x={x} y={y + 4} textAnchor="middle" fontSize={10.5} fontWeight={cur ? 800 : 600} style={{ fontFamily: 'var(--mono)' }}>
                  {LABEL[id]}
                </text>
              </g>
            );
          })}
          <text x={POS.PROPOSED.x - W / 2} y={POS.PROPOSED.y + 34} fontSize={9} style={{ fill: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
            issue_refund(${params.amount})
          </text>
          {/* status strip */}
          <rect x={6} y={246} width={316} height={36} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          <text x={16} y={260} fontSize={9.5} fontWeight={700} style={{ fill: f.paused ? 'var(--warn)' : 'var(--text-2)' }}>
            {f.paused ? '⏸ checkpoint saved · thread refund-A-1932' : f.done ? '■ run finished' : '▶ running'}
          </text>
          <text x={16} y={274} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
            waited {f.waited >= 1 ? `${f.waited} h` : f.waited > 0 ? 'a few min' : '0'} · SLA {SLA_HOURS} h · refund {f.refund === null ? '—' : `$${f.refund}`}
          </text>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
