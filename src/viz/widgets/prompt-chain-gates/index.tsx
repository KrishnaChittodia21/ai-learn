import { useState } from 'react';
import { Choice, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, MAX_ATTEMPTS, SCENARIOS, simulate, type CheckStatus, type Params, type ScenarioId, type StepId } from './sim';

const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

function wrap(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > width) {
      out.push(cur.trim());
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.length > lines ? [...out.slice(0, lines - 1), short(out.slice(lines - 1).join(' '), width)] : out;
}

const STEPS: { id: StepId; label: string; sub: string; x: number; color: string; soft: string }[] = [
  { id: 'extract', label: '1 · Extract', sub: 'LLM → JSON', x: 14, color: 'var(--accent)', soft: 'var(--accent-soft)' },
  { id: 'validate', label: '2 · Gate', sub: 'code: parse + schema + rule', x: 224, color: 'var(--warn)', soft: 'var(--warn-soft)' },
  { id: 'write', label: '3 · Write', sub: 'LLM ← valid JSON only', x: 434, color: 'var(--good)', soft: 'var(--good-soft)' },
];
const BOX_W = 152;
const BOX_Y = 64;
const BOX_H = 42;
const MARK: Record<CheckStatus, { sym: string; color: string }> = {
  pending: { sym: '·', color: 'var(--text-2)' },
  pass: { sym: '✓', color: 'var(--good)' },
  fail: { sym: '✗', color: 'var(--bad)' },
};

export default function PromptChainGatesViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const sc = SCENARIOS[params.scenario];
  const doc = wrap(sc.document, 92, 2);
  const gateFailed = f.checks.some((c) => c.status === 'fail');
  const retrying = f.active === 'extract' && f.attempt > 1;

  const aria = `Prompt chain, scenario ${sc.label}. Active step: ${f.active ?? 'none'}, attempt ${f.attempt}. Checks: ${f.checks
    .map((c) => `${c.label} ${c.status}`)
    .join('; ')}. Outcome ${f.outcome}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <Choice<ScenarioId>
          label="Run"
          value={params.scenario}
          options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
          onChange={(scenario) => setParams({ scenario })}
        />
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> LLM step
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> code gate
          <span className="viz-key" style={{ background: 'var(--good)' }} /> passed / written
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> failed check / human
        </>
      }
    >
      <WideSvg label="Prompt chain">
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          {/* input document */}
          <rect x={6} y={6} width={588} height={40} rx={6} fill="var(--surface-2)" stroke="var(--border)" />
          {doc.map((line, i) => (
            <text key={i} x={14} y={22 + i * 14} fontSize={9.5} style={{ fontFamily: 'var(--mono)' }}>
              {i === 0 ? 'input: ' : ''}
              {line}
            </text>
          ))}

          {/* pipeline */}
          {STEPS.map((s, i) => {
            const on = f.active === s.id;
            const failedGate = s.id === 'validate' && gateFailed && (f.active === 'validate' || f.outcome === 'human');
            const doneWrite = s.id === 'write' && f.outcome === 'ok';
            const stroke = failedGate ? 'var(--bad)' : on || doneWrite ? s.color : 'var(--border)';
            const skipped = s.id === 'write' && f.outcome === 'human';
            return (
              <g key={s.id} opacity={skipped ? 0.4 : 1}>
                {i > 0 && (
                  <path
                    d={`M ${STEPS[i - 1].x + BOX_W} ${BOX_Y + BOX_H / 2} L ${s.x - 4} ${BOX_Y + BOX_H / 2}`}
                    stroke={i === 2 && gateFailed && f.active !== 'write' ? 'var(--bad)' : 'var(--border)'}
                    strokeWidth={2}
                    strokeDasharray={i === 2 && gateFailed && f.active !== 'write' ? '4 3' : undefined}
                    markerEnd="url(#pcg-arrow)"
                  />
                )}
                <rect x={s.x} y={BOX_Y} width={BOX_W} height={BOX_H} rx={8} fill={on || doneWrite ? s.soft : failedGate ? 'var(--bad-soft)' : 'var(--surface)'} stroke={stroke} strokeWidth={on || failedGate ? 2.2 : 1} />
                <text x={s.x + BOX_W / 2} y={BOX_Y + 17} textAnchor="middle" fontSize={11} fontWeight={700}>
                  {s.label}
                </text>
                <text x={s.x + BOX_W / 2} y={BOX_Y + 32} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>
                  {s.sub}
                </text>
              </g>
            );
          })}
          <defs>
            <marker id="pcg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-2)" />
            </marker>
          </defs>
          {/* retry loop */}
          <path
            d={`M ${STEPS[1].x + 40} ${BOX_Y + BOX_H} C ${STEPS[1].x + 20} ${BOX_Y + 78}, ${STEPS[0].x + BOX_W - 20} ${BOX_Y + 78}, ${STEPS[0].x + BOX_W - 40} ${BOX_Y + BOX_H + 4}`}
            fill="none"
            stroke={retrying ? 'var(--bad)' : 'var(--border)'}
            strokeWidth={retrying ? 2 : 1.2}
            strokeDasharray="4 3"
            markerEnd="url(#pcg-arrow)"
          />
          <text x={(STEPS[0].x + BOX_W + STEPS[1].x) / 2} y={BOX_Y + 80} textAnchor="middle" fontSize={9} style={{ fill: retrying ? 'var(--bad)' : 'var(--text-2)' }}>
            retry once with the error (max {MAX_ATTEMPTS} attempts)
          </text>
          {f.outcome === 'human' && (
            <g>
              <rect x={STEPS[1].x + BOX_W - 20} y={BOX_Y + BOX_H + 14} width={150} height={22} rx={11} fill="var(--bad-soft)" stroke="var(--bad)" />
              <text x={STEPS[1].x + BOX_W + 55} y={BOX_Y + BOX_H + 29} textAnchor="middle" fontSize={10} fontWeight={700} style={{ fill: 'var(--bad)' }}>
                → human review queue
              </text>
            </g>
          )}

          {/* payload */}
          <text x={8} y={166} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            contract payload{f.attempt ? ` (attempt ${f.attempt}/${MAX_ATTEMPTS})` : ''}
          </text>
          <rect x={6} y={172} width={300} height={104} rx={6} fill="var(--surface-2)" stroke={gateFailed && f.active === 'validate' ? 'var(--bad)' : 'var(--border)'} />
          {f.payload.length === 0 ? (
            <text x={156} y={228} textAnchor="middle" fontSize={10} style={{ fill: 'var(--text-2)' }}>
              nothing extracted yet
            </text>
          ) : (
            f.payload.map((line, i) => (
              <text key={i} x={14} y={192 + i * 18} fontSize={9.5} style={{ fontFamily: 'var(--mono)' }}>
                {short(line, 46)}
              </text>
            ))
          )}

          {/* gate checks */}
          <text x={320} y={166} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            gate checks (deterministic code)
          </text>
          <rect x={318} y={172} width={276} height={104} rx={6} fill="var(--surface-2)" stroke="var(--border)" />
          {f.checks.map((c, i) => (
            <g key={c.label}>
              <text x={330} y={192 + i * 20} fontSize={12} fontWeight={800} style={{ fill: MARK[c.status].color }}>
                {MARK[c.status].sym}
              </text>
              <text x={346} y={192 + i * 20} fontSize={9.5} style={{ fontFamily: 'var(--mono)', fill: c.status === 'fail' ? 'var(--bad)' : 'var(--text)' }}>
                {short(c.label, 40)}
              </text>
            </g>
          ))}
          {f.feedback && (
            <text x={330} y={262} fontSize={9} style={{ fill: 'var(--bad)' }}>
              fed back: {short(f.feedback, 44)}
            </text>
          )}

          {/* output + counters */}
          <text x={8} y={298} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            written output
          </text>
          <text x={96} y={298} fontSize={9.5} style={{ fill: f.output ? 'var(--good)' : 'var(--text-2)' }}>
            {f.output ? short(f.output, 70) : f.outcome === 'human' ? 'none: the write step never sees invalid data' : '—'}
          </text>
          <text x={8} y={320} fontSize={10.5} fontWeight={700}>
            LLM calls: {f.llmCalls}
          </text>
          {f.outcome !== 'running' && (
            <text x={594} y={320} textAnchor="end" fontSize={12} fontWeight={800} style={{ fill: f.outcome === 'ok' ? 'var(--good)' : 'var(--bad)' }}>
              {f.outcome === 'ok' ? '✓ chain completed' : '⊘ stopped at the gate'}
            </text>
          )}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
