import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { DEFAULT_PARAMS, MAX_N, MIN_N, SCENARIOS, TOKENS_PER_PATH, simulate, type Params, type ScenarioId } from './sim';

const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

/** split text into at most `lines` lines of about `width` characters */
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

const ROW_Y = 62;
const ROW_H = 27;
const PROMPT = { x: 12, y: 160, w: 80, h: 46 };
const ROW_X = 118;
const ROW_W = 268;
const VX = 420;

export default function SelfConsistencyVoteViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const sc = SCENARIOS[params.scenario];
  const n = Math.max(MIN_N, Math.min(MAX_N, params.n));
  const paths = sc.paths.slice(0, n);
  const winner = f.verdict?.answer ?? null;
  const decided = f.stage === 'verdict' || f.stage === 'recap';
  const maxVotes = Math.max(1, ...f.tally.map((t) => t.votes));
  const q = wrap(sc.question, 100, 2);
  const rowMid = (i: number) => ROW_Y + i * ROW_H + 11;
  const voteMid = 150;

  const aria = `Self-consistency vote, scenario ${sc.label}, ${n} samples. ${f.shown} answers shown: ${paths
    .slice(0, f.shown)
    .map((p) => p.answer)
    .join(', ')}. ${f.verdict ? `Verdict: ${f.verdict.answer ?? 'abstain'} (${f.verdict.reason}).` : ''}`;

  const verdictColor = !f.verdict ? 'var(--border)' : f.verdict.kind === 'majority' ? 'var(--good)' : f.verdict.kind === 'single' ? 'var(--warn)' : 'var(--bad)';
  const verdictFill = !f.verdict ? 'var(--surface-2)' : f.verdict.kind === 'majority' ? 'var(--good-soft)' : f.verdict.kind === 'single' ? 'var(--warn-soft)' : 'var(--bad-soft)';

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<ScenarioId>
            label="Task"
            value={params.scenario}
            options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
            onChange={(scenario) => setParams((p) => ({ ...p, scenario }))}
          />
          <Slider label="Samples (N)" value={params.n} min={MIN_N} max={MAX_N} step={2} onChange={(v) => setParams((p) => ({ ...p, n: v }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent)' }} /> sampled reasoning path
          <span className="viz-key" style={{ background: 'var(--good)' }} /> majority answer
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> wrong / abstain
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> single sample (no vote)
        </>
      }
    >
      <WideSvg label="Self-consistency vote">
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          {q.map((line, i) => (
            <text key={i} x={8} y={16 + i * 14} fontSize={10.5} fontWeight={i === 0 ? 700 : 400}>
              {i === 0 ? 'Q: ' : ''}
              {line}
            </text>
          ))}
          <text x={ROW_X} y={ROW_Y - 8} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            {n} sampled reasoning path{n === 1 ? '' : 's'} (temperature &gt; 0)
          </text>

          {/* the prompt */}
          <rect x={PROMPT.x} y={PROMPT.y - PROMPT.h / 2} width={PROMPT.w} height={PROMPT.h} rx={8} fill="var(--accent-soft)" stroke="var(--accent)" />
          <text x={PROMPT.x + PROMPT.w / 2} y={PROMPT.y - 4} textAnchor="middle" fontSize={10} fontWeight={700}>
            CoT prompt
          </text>
          <text x={PROMPT.x + PROMPT.w / 2} y={PROMPT.y + 10} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>
            × {n} calls
          </text>

          {paths.map((p, i) => {
            const on = i < f.shown;
            const isWin = decided && winner !== null && p.answer === winner;
            const isWrong = decided && p.correct === false;
            const chip = !on ? 'var(--border)' : isWin ? 'var(--good)' : isWrong ? 'var(--bad)' : 'var(--accent)';
            const y = ROW_Y + i * ROW_H;
            return (
              <g key={i} opacity={on ? 1 : 0.4}>
                {/* fan out from the prompt */}
                <path d={`M ${PROMPT.x + PROMPT.w} ${PROMPT.y} C ${ROW_X - 14} ${PROMPT.y}, ${ROW_X - 14} ${rowMid(i)}, ${ROW_X} ${rowMid(i)}`} fill="none" stroke={on ? 'var(--accent)' : 'var(--border)'} strokeWidth={on ? 1.4 : 1} strokeDasharray={on ? undefined : '3 3'} />
                <rect x={ROW_X} y={y} width={ROW_W} height={22} rx={5} fill={on ? 'var(--surface-2)' : 'none'} stroke="var(--border)" strokeDasharray={on ? undefined : '3 3'} />
                <text x={ROW_X + 8} y={y + 15} fontSize={9.5} style={{ fill: 'var(--text-2)' }}>
                  {on ? short(p.reasoning, 34) : `sample ${i + 1} …`}
                </text>
                {on && (
                  <g>
                    <rect x={ROW_X + ROW_W - 112} y={y + 3} width={106} height={16} rx={8} fill="var(--surface)" stroke={chip} strokeWidth={isWin ? 2 : 1} />
                    <text x={ROW_X + ROW_W - 59} y={y + 14.5} textAnchor="middle" fontSize={9.5} fontWeight={700} style={{ fill: chip, fontFamily: 'var(--mono)' }}>
                      {short(p.answer, 17)}
                    </text>
                  </g>
                )}
                {/* converge on the vote */}
                {on && f.stage !== 'intro' && (
                  <path
                    d={`M ${ROW_X + ROW_W} ${rowMid(i)} C ${VX - 14} ${rowMid(i)}, ${VX - 14} ${voteMid}, ${VX} ${voteMid}`}
                    fill="none"
                    stroke={isWin ? 'var(--good)' : 'var(--border)'}
                    strokeWidth={isWin ? 1.6 : 1}
                  />
                )}
              </g>
            );
          })}

          {/* vote tally */}
          <text x={VX} y={ROW_Y - 8} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            vote (counted in code)
          </text>
          <rect x={VX} y={ROW_Y} width={174} height={150} rx={8} fill="var(--surface-2)" stroke="var(--border)" />
          {f.tally.length === 0 && (
            <text x={VX + 87} y={ROW_Y + 78} textAnchor="middle" fontSize={10} style={{ fill: 'var(--text-2)' }}>
              no answers yet
            </text>
          )}
          {f.tally.slice(0, 6).map((t, i) => {
            const y = ROW_Y + 12 + i * 22;
            const isWin = decided && t.label === winner;
            return (
              <g key={t.label}>
                <text x={VX + 8} y={y + 10} fontSize={9.5} style={{ fontFamily: 'var(--mono)' }}>
                  {short(t.label, 13)}
                </text>
                <rect x={VX + 96} y={y + 1} width={(64 * t.votes) / maxVotes} height={12} rx={3} fill={isWin ? 'var(--good)' : 'var(--accent)'} opacity={isWin || !decided ? 1 : 0.55} style={{ transition: 'width 0.3s ease' }} />
                <text x={VX + 166} y={y + 11} textAnchor="end" fontSize={9.5} fontWeight={700}>
                  {t.votes}
                </text>
              </g>
            );
          })}
          {f.tally.length > 6 && (
            <text x={VX + 8} y={ROW_Y + 144} fontSize={9} style={{ fill: 'var(--text-2)' }}>
              + {f.tally.length - 6} more answers with 1 vote
            </text>
          )}

          {/* verdict */}
          <rect x={VX} y={222} width={174} height={50} rx={8} fill={verdictFill} stroke={verdictColor} strokeWidth={f.verdict ? 2 : 1} />
          <text x={VX + 87} y={243} textAnchor="middle" fontSize={13} fontWeight={800} style={{ fill: f.verdict ? verdictColor : 'var(--text-2)' }}>
            {!f.verdict ? 'waiting for votes' : f.verdict.answer ? `${f.verdict.kind === 'single' ? '' : '✓ '}${short(f.verdict.answer, 16)}` : '⊘ abstain → human'}
          </text>
          <text x={VX + 87} y={261} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>
            {f.verdict ? short(f.verdict.reason, 34) : 'majority, else abstain'}
          </text>

          {/* cost */}
          <text x={VX} y={296} fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            output tokens ≈ {f.tokens} ({f.shown}× ~{TOKENS_PER_PATH})
          </text>
          <rect x={VX} y={303} width={174} height={10} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
          <rect x={VX} y={303} width={(174 * f.tokens) / (MAX_N * TOKENS_PER_PATH)} height={10} rx={3} fill="var(--warn)" style={{ transition: 'width 0.3s ease' }} />
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
