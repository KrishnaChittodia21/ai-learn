import { useState } from 'react';
import { Choice, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, SCENARIOS, WORDS, faithfulness, simulate, type Label, type Params, type ScenarioId } from './sim';

const LINE = 16;
const FONT = 10;
const SRC_TOP = 40;
/** characters per source line; conservative so a line never runs past the box at any UI font */
const LINE_CHARS = 96;
/** rough average glyph width, only used to aim the evidence connector */
const AVG_CH = 4.8;

// static line layout of the source passage; the browser spaces the words inside each line
const LAYOUT = (() => {
  const out: { line: number; x: number; y: number }[] = [];
  let line = 0;
  let col = 0;
  WORDS.forEach((wd, i) => {
    if (i > 0 && col + wd.length > LINE_CHARS) {
      line++;
      col = 0;
    }
    out.push({ line, x: 22 + col * AVG_CH, y: SRC_TOP + line * LINE });
    col += wd.length + 1;
  });
  return out;
})();
const LINES = Array.from({ length: LAYOUT[LAYOUT.length - 1].line + 1 }, (_, l) => WORDS.map((w, i) => ({ w, i })).filter((x) => LAYOUT[x.i].line === l));
const SRC_BOTTOM = LAYOUT[LAYOUT.length - 1].y + 10;

const ROWS_TOP = SRC_BOTTOM + 34;
const ROW_H = 30;
const STAMP_X = 446;
const STAMP_W = 140;

const COLOR: Record<Label, string> = { SUPPORTED: 'var(--good)', CONTRADICTED: 'var(--bad)', NOT_FOUND: 'var(--warn)' };
const SOFT: Record<Label, string> = { SUPPORTED: 'var(--good-soft)', CONTRADICTED: 'var(--bad-soft)', NOT_FOUND: 'var(--warn-soft)' };
const TEXT: Record<Label, string> = { SUPPORTED: '✓ SUPPORTED', CONTRADICTED: '✗ CONTRADICTED', NOT_FOUND: '? NOT FOUND' };

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

export default function ClaimCheckViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const sc = SCENARIOS[params.scenario];
  const score = faithfulness(f.stamped);
  const supported = f.stamped.filter((l) => l === 'SUPPORTED').length;
  const scoreY = ROWS_TOP + sc.claims.length * ROW_H + 26;
  const height = scoreY + 34;
  const span = f.span;

  const aria = `Claim check, scenario ${sc.label}. Answer: ${sc.answer} ${
    f.split ? `${sc.claims.length} claims. ${f.stamped.map((l, i) => `Claim ${i + 1} ${l.replace('_', ' ')}`).join('. ')}.` : ''
  } Faithfulness ${score === null ? 'not scored yet' : `${supported} of ${f.stamped.length}`}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <Choice<ScenarioId>
          label="Answer"
          value={params.scenario}
          options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
          onChange={(scenario) => setParams({ scenario })}
        />
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--good)' }} /> supported (evidence span)
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> contradicted
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> not found in source
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> claim being checked
        </>
      }
    >
      <WideSvg label="Claim check">
        <svg viewBox={`0 0 600 ${height}`} className="viz-svg" role="img" aria-label={aria}>
          {/* source passage */}
          <text x={14} y={14} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            SOURCE (the only evidence that counts)
          </text>
          <rect x={14} y={22} width={572} height={SRC_BOTTOM - 22 + 4} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          {LINES.map((words, l) => (
            <text key={l} x={22} y={SRC_TOP + l * LINE} fontSize={FONT}>
              {words.map(({ w, i }) => {
                const inSpan = span !== null && f.spanLabel !== null && i >= span[0] && i < span[1];
                return (
                  <tspan
                    key={i}
                    fontWeight={inSpan ? 800 : 400}
                    textDecoration={inSpan ? 'underline' : undefined}
                    style={{ fill: inSpan && f.spanLabel ? COLOR[f.spanLabel] : 'var(--text)' }}
                  >
                    {w}
                    {i < WORDS.length - 1 ? ' ' : ''}
                  </tspan>
                );
              })}
            </text>
          ))}

          {/* answer / claims */}
          <text x={14} y={ROWS_TOP - 10} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            {f.split ? `ANSWER → ${sc.claims.length} atomic claims` : 'ANSWER (as the user would see it)'}
          </text>
          {!f.split &&
            wrap(sc.answer, 100).map((line, i) => (
              <text key={i} x={22} y={ROWS_TOP + 14 + i * 15} fontSize={10.5}>
                {line}
              </text>
            ))}
          {!f.split && <rect x={14} y={ROWS_TOP} width={572} height={sc.claims.length * ROW_H - 6} rx={6} fill="none" stroke="var(--border)" strokeDasharray="4 3" />}
          {f.split &&
            sc.claims.map((c, i) => {
              const y = ROWS_TOP + i * ROW_H;
              const label = f.stamped[i] as Label | undefined;
              const active = f.active === i;
              const stroke = active ? 'var(--accent)' : label ? COLOR[label] : 'var(--border)';
              return (
                <g key={i}>
                  <rect x={14} y={y} width={420} height={24} rx={5} fill={active ? 'var(--accent-soft)' : 'var(--surface)'} stroke={stroke} strokeWidth={active ? 2 : 1} />
                  <text x={22} y={y + 15.5} fontSize={10}>
                    <tspan fontWeight={700} style={{ fill: 'var(--text-2)' }}>
                      c{i + 1}{' '}
                    </tspan>
                    {c.text}
                  </text>
                  <rect
                    x={STAMP_X}
                    y={y}
                    width={STAMP_W}
                    height={24}
                    rx={12}
                    fill={label ? SOFT[label] : 'none'}
                    stroke={label ? COLOR[label] : active ? 'var(--accent)' : 'var(--border)'}
                    strokeWidth={label ? 2 : 1}
                    strokeDasharray={label || active ? undefined : '3 3'}
                    style={{ transition: 'fill 0.3s ease, stroke 0.3s ease' }}
                  />
                  <text x={STAMP_X + STAMP_W / 2} y={y + 16} textAnchor="middle" fontSize={10} fontWeight={800} style={{ fill: label ? COLOR[label] : 'var(--text-2)', fontFamily: 'var(--mono)' }}>
                    {label ? TEXT[label] : active ? 'checking…' : 'pending'}
                  </text>
                  {/* tie the active claim to its evidence span */}
                  {active && span && f.spanLabel && (
                    <path
                      d={`M ${LAYOUT[span[0]].x + 6} ${SRC_BOTTOM + 3} L ${LAYOUT[span[0]].x + 6} ${SRC_BOTTOM + 10} L 7 ${SRC_BOTTOM + 10} L 7 ${y + 12} L 14 ${y + 12}`}
                      fill="none"
                      stroke={COLOR[f.spanLabel]}
                      strokeWidth={1.2}
                      strokeDasharray="3 2"
                    />
                  )}
                </g>
              );
            })}

          {/* running faithfulness */}
          <text x={14} y={scoreY - 8} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            faithfulness = supported ÷ claims checked
          </text>
          <rect x={14} y={scoreY} width={420} height={12} rx={4} fill="var(--surface-2)" stroke="var(--border)" />
          <rect
            x={14}
            y={scoreY}
            width={score === null ? 0 : 420 * score}
            height={12}
            rx={4}
            fill={score === null ? 'var(--border)' : score === 1 ? 'var(--good)' : 'var(--warn)'}
            style={{ transition: 'width 0.35s ease' }}
          />
          <text x={STAMP_X + STAMP_W / 2} y={scoreY + 11} textAnchor="middle" fontSize={14} fontWeight={800} style={{ fill: score === null ? 'var(--text-2)' : score === 1 ? 'var(--good)' : 'var(--warn)' }}>
            {score === null ? '—' : `${supported}/${f.stamped.length} = ${Math.round(score * 100)}%`}
          </text>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
