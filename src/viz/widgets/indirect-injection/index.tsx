import { useState } from 'react';
import { VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, GUARDS, STAGES, simulate, stopStage, type Params, type StageState } from './sim';

const BOX_W = 86;
const GAP = 13;
const X0 = 8;
const BOX_Y = 44;
const BOX_H = 46;
const bx = (i: number) => X0 + i * (BOX_W + GAP);

const STROKE: Record<StageState, string> = { idle: 'var(--border)', clean: 'var(--good)', compromised: 'var(--bad)', blocked: 'var(--good)' };
const FILL: Record<StageState, string> = { idle: 'var(--surface-2)', clean: 'var(--good-soft)', compromised: 'var(--bad-soft)', blocked: 'var(--good-soft)' };

const SHORT: Record<keyof Params, string> = { isolation: 'Isolation', allowlist: 'Allow-list', urlFilter: 'URL filter' };

/** split text into lines of about `width` characters */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > width) {
      out.push(cur.trim());
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

export default function IndirectInjectionViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const stop = stopStage(params);
  const detail = wrap(f.detail, 92).slice(0, 3);

  const aria = `Indirect injection path. ${STAGES.map((s, i) => `${s.label}: ${f.states[i]}`).join(', ')}. ${f.leaked ? 'Data leaked to the attacker.' : ''}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      turn={{
        kind: 'choice',
        id: JSON.stringify(params),
        at: 0,
        question: 'With the defences you switched on, where will this attack stop?',
        options: [
          { id: 'model', label: 'At the model' },
          { id: 'tool', label: 'At the tool call' },
          { id: 'render', label: 'At the client' },
          { id: 'leak', label: 'Nowhere: data leaks' },
        ],
        answer: stop ?? 'leak',
        why: stop
          ? `The first layer on the path wins: ${GUARDS.find((g) => g.stage === stop)!.label.toLowerCase()} guards the ${STAGES.find((s) => s.id === stop)!.label.toLowerCase()} stage. Retrieval never stops it: the email is relevant, just not trustworthy.`
          : 'With no layer on, every stage does its normal job and the URL fetch carries the data out. Try switching one defence on.',
        continueLabel: 'Run the attack →',
      }}
      controls={
        <div className="viz-choice" role="group" aria-label="Defences">
          <span className="viz-choice-label">Defences:</span>
          {GUARDS.map((g) => (
            <button key={g.key} type="button" className={`chip ${params[g.key] ? 'on' : ''}`} aria-pressed={params[g.key]} onClick={() => setParams((p) => ({ ...p, [g.key]: !p[g.key] }))}>
              {params[g.key] ? '✓ ' : ''}
              {g.label}
            </button>
          ))}
        </div>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> carrying the attack
          <span className="viz-key" style={{ background: 'var(--good)' }} /> attack stopped here
          <span className="viz-key ring" /> defence on this stage
        </>
      }
    >
      <WideSvg label="Injection path">
        <svg viewBox="0 0 600 200" className="viz-svg" role="img" aria-label={aria}>
          <text x={X0} y={16} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            ATTACKER (third party) → plants text → … → VICTIM’S DATA
          </text>
          {f.leaked && (
            <text x={592} y={16} textAnchor="end" fontSize={10} fontWeight={800} style={{ fill: 'var(--bad)', fontFamily: 'var(--mono)' }}>
              tracker.example ← 12 Elm St
            </text>
          )}
          {STAGES.map((s, i) => {
            const st = f.states[i];
            const cur = f.at === i;
            const guard = GUARDS.find((g) => g.stage === s.id);
            const guarded = guard && params[guard.key];
            return (
              <g key={s.id}>
                {i > 0 && (
                  <path
                    d={`M ${bx(i) - GAP + 1} ${BOX_Y + BOX_H / 2} L ${bx(i) - 2} ${BOX_Y + BOX_H / 2}`}
                    stroke={st === 'idle' ? 'var(--border)' : STROKE[st]}
                    strokeWidth={2}
                    strokeDasharray={st === 'idle' ? '3 3' : undefined}
                  />
                )}
                <rect
                  x={bx(i)}
                  y={BOX_Y}
                  width={BOX_W}
                  height={BOX_H}
                  rx={10}
                  fill={FILL[st]}
                  stroke={cur ? 'var(--accent)' : STROKE[st]}
                  strokeWidth={cur ? 2.5 : 1.5}
                  style={{ transition: 'fill 0.3s ease, stroke 0.3s ease' }}
                />
                <text x={bx(i) + BOX_W / 2} y={BOX_Y + 20} textAnchor="middle" fontSize={11.5} fontWeight={700}>
                  {s.label}
                </text>
                <text x={bx(i) + BOX_W / 2} y={BOX_Y + 35} textAnchor="middle" fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                  {st === 'blocked' ? '✓ stopped' : st === 'compromised' ? '✗ ' + s.sub : s.sub}
                </text>
                {guard && (
                  <g>
                    <rect
                      x={bx(i) + 4}
                      y={BOX_Y + BOX_H + 10}
                      width={BOX_W - 8}
                      height={22}
                      rx={11}
                      fill={guarded ? 'var(--good-soft)' : 'none'}
                      stroke={guarded ? 'var(--good)' : 'var(--border)'}
                      strokeDasharray={guarded ? undefined : '3 3'}
                    />
                    <text x={bx(i) + BOX_W / 2} y={BOX_Y + BOX_H + 25} textAnchor="middle" fontSize={8.5} fontWeight={700} style={{ fill: guarded ? 'var(--good)' : 'var(--muted)' }}>
                      {SHORT[guard.key]} {guarded ? 'ON' : 'off'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          <rect x={X0} y={136} width={584} height={56} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          {detail.map((line, k) => (
            <text key={k} x={X0 + 10} y={152 + k * 14} fontSize={9.5} style={{ fontFamily: 'var(--mono)', fill: f.leaked ? 'var(--bad)' : 'var(--text)' }}>
              {line}
            </text>
          ))}
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
