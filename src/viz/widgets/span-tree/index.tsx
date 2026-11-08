import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import {
  DEFAULT_PARAMS,
  MAX_TOOL_MS,
  MIN_TOOL_MS,
  PRICE,
  SCENARIO_LABELS,
  buildTrace,
  fmtCost,
  fmtMs,
  priciest,
  simulate,
  slowest,
  type Params,
  type ScenarioId,
} from './sim';

const TOP = 34;
const ROW_H = 32;
const BAR_X = 236;
const BAR_W = 262;
const VAL_X = 592;

export default function SpanTreeViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const tr = buildTrace(params);
  const scale = BAR_W / tr.root.ms;
  const slow = slowest(tr);
  const rich = priciest(tr);
  const rows = tr.spans.slice(0, f.shown);
  const height = TOP + (tr.spans.length + 1) * ROW_H + 8;

  const aria = `Trace span tree, ${SCENARIO_LABELS[params.scenario]}. Root ${tr.root.name}${f.rootClosed ? ` ${fmtMs(tr.root.ms)}` : ' open'}. ${rows
    .map((s) => `${s.name} ${fmtMs(s.ms)}${f.reveal && s.cost ? ` ${fmtCost(s.cost)}` : ''}`)
    .join('; ')}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={
        f.stage === 'turn'
          ? {
              kind: 'choice',
              id: JSON.stringify(params),
              at: stepper.i,
              question: `Which span cost the most money? Price: $${PRICE.in} per 1M input tokens, $${PRICE.out} per 1M output tokens.`,
              options: tr.spans.map((s) => ({ id: s.id, label: s.name.replace(/^(chat|tool|retrieve|rerank|embed|guardrail) /, '$1 · ') })),
              answer: rich.id,
              why: `${rich.name}: ${rich.inTok!.toLocaleString('en-US')} × $${PRICE.in}/1M + ${rich.outTok} × $${PRICE.out}/1M = ${fmtCost(rich.cost)}. Only LLM spans carry token usage; ${
                params.scenario === 'agent' ? 'the second call re-sends the whole context plus the tool result, and output tokens cost 5× input.' : 'a long bar is not the same as a big bill.'
              }`,
              continueLabel: 'Reveal costs →',
            }
          : undefined
      }
      controls={
        <>
          <Choice<ScenarioId>
            label="Request"
            value={params.scenario}
            options={(Object.keys(SCENARIO_LABELS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIO_LABELS[k] }))}
            onChange={(scenario) => setParams((p) => ({ ...p, scenario }))}
          />
          {params.scenario === 'agent' && (
            <Slider label="Tool latency" value={params.toolMs} min={MIN_TOOL_MS} max={MAX_TOOL_MS} step={100} format={fmtMs} onChange={(toolMs) => setParams((p) => ({ ...p, toolMs }))} />
          )}
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> span just recorded
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> slowest
          <span className="viz-key" style={{ background: 'var(--good)' }} /> most expensive (illustrative ${PRICE.in} in / ${PRICE.out} out per 1M tokens)
        </>
      }
    >
      <WideSvg label="Span tree">
        <svg viewBox={`0 0 600 ${height}`} className="viz-svg" role="img" aria-label={aria}>
          <text x={8} y={14} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            SPAN
          </text>
          <text x={BAR_X} y={14} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            WATERFALL (0 → {fmtMs(tr.root.ms)})
          </text>
          <text x={VAL_X} y={14} textAnchor="end" fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            {f.reveal ? 'TIME · COST' : 'TIME'}
          </text>
          <line x1={BAR_X} x2={BAR_X + BAR_W} y1={TOP - 12} y2={TOP - 12} stroke="var(--border)" />

          {/* root */}
          <text x={8} y={TOP + 12} fontSize={11} fontWeight={800}>
            {tr.root.name}
          </text>
          <text x={8} y={TOP + 24} fontSize={8.5} style={{ fill: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {tr.root.attrs}
          </text>
          <rect
            x={BAR_X}
            y={TOP + 4}
            width={f.rootClosed ? BAR_W : Math.max(4, (rows.length ? rows[rows.length - 1].start + rows[rows.length - 1].ms : 0) * scale)}
            height={12}
            rx={3}
            fill="var(--surface-2)"
            stroke="var(--muted)"
            strokeDasharray={f.rootClosed ? undefined : '3 2'}
            style={{ transition: 'width 0.35s ease' }}
          />
          <text x={VAL_X} y={TOP + 14} textAnchor="end" fontSize={10.5} fontWeight={700}>
            {f.rootClosed ? fmtMs(tr.root.ms) : 'open…'}
          </text>

          {rows.map((s, k) => {
            const y = TOP + (k + 1) * ROW_H;
            const last = k === tr.spans.length - 1;
            const isSlow = f.reveal && s.id === slow.id;
            const isRich = f.reveal && s.id === rich.id;
            const color = f.active === s.id ? 'var(--accent)' : isSlow ? 'var(--warn)' : isRich ? 'var(--good)' : 'var(--c-ion, var(--accent))';
            return (
              <g key={s.id}>
                <text x={8} y={y + 12} fontSize={10.5} style={{ fill: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {last ? '└─' : '├─'}
                </text>
                <text x={28} y={y + 12} fontSize={10.5} fontWeight={f.active === s.id || isSlow || isRich ? 800 : 500}>
                  {s.name}
                </text>
                <text x={28} y={y + 24} fontSize={8.5} style={{ fill: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {s.inTok !== undefined ? `in=${s.inTok} out=${s.outTok}` : s.attrs}
                </text>
                <rect
                  x={BAR_X + s.start * scale}
                  y={y + 3}
                  width={Math.max(3, s.ms * scale)}
                  height={14}
                  rx={3}
                  fill={color}
                  opacity={f.active === s.id || isSlow || isRich ? 1 : 0.55}
                  stroke={isSlow && isRich ? 'var(--good)' : 'none'}
                  strokeWidth={2}
                  style={{ transition: 'fill 0.3s ease, opacity 0.3s ease' }}
                />
                <text x={VAL_X} y={y + 13} textAnchor="end" fontSize={10.5} fontWeight={isSlow ? 800 : 500} style={{ fill: isSlow ? 'var(--warn)' : 'var(--text)' }}>
                  {fmtMs(s.ms)}
                </text>
                {f.reveal && (
                  <text x={VAL_X} y={y + 26} textAnchor="end" fontSize={9.5} fontWeight={isRich ? 800 : 500} style={{ fill: isRich ? 'var(--good)' : 'var(--muted)' }}>
                    {s.cost ? fmtCost(s.cost) : '—'}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
