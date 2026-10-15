import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { ANSWER_RESERVE, BUDGETS, CHUNKS, CORRECT, DEFAULT_PARAMS, QUESTION, QUESTION_TOKENS, SYSTEM_TOKENS, simulate, type Params, type Stage } from './sim';

const STEPS = ['Index', 'Query', 'Embed', 'Retrieve', 'Rerank', 'Pack', 'LLM', 'Answer'];
const STEP_OF: Record<Stage, number> = { index: 0, query: 1, embed: 2, retrieve: 3, rerank: 4, frame: 5, add: 5, drop: 5, send: 6, answer: 7, check: 7, done: 7 };
const short = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

export default function RagPipelineViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const active = STEP_OF[f.stage];
  const showScores = active >= 3;
  const showRR = params.rerank && active >= 4;
  const packing = active >= 5;

  // budget bar segments
  const BX = 404;
  const BW = 186;
  const scale = BW / Math.max(params.budget, 1);
  const segs: { label: string; tokens: number; fill: string }[] = packing
    ? [
        { label: 'sys', tokens: SYSTEM_TOKENS, fill: 'var(--text-2)' },
        { label: 'q', tokens: QUESTION_TOKENS, fill: 'var(--accent)' },
        ...f.inPrompt.map((id) => ({ label: id, tokens: CHUNKS.find((c) => c.id === id)!.tokens, fill: id === CORRECT ? 'var(--good)' : 'var(--warn)' })),
      ]
    : [];
  let acc = 0;

  const aria = `RAG pipeline at step ${STEPS[active]}. Retrieved ${f.retrieved.join(', ') || 'none'}; in prompt ${f.inPrompt.join(', ') || 'none'}; dropped ${f.dropped.join(', ') || 'none'}.${f.answer ? ` Answer ${f.correct ? 'correct' : 'wrong'}: ${f.answer}` : ''}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Slider label="top-k" value={params.topK} min={2} max={6} onChange={(topK) => setParams((p) => ({ ...p, topK }))} />
          <Choice<'on' | 'off'>
            label="Rerank"
            value={params.rerank ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'off' },
              { value: 'on', label: 'cross-encoder' },
            ]}
            onChange={(v) => setParams((p) => ({ ...p, rerank: v === 'on' }))}
          />
          <Choice<string>
            label="Token budget"
            value={String(params.budget)}
            options={BUDGETS.map((b) => ({ value: String(b), label: `${b}` }))}
            onChange={(v) => setParams((p) => ({ ...p, budget: Number(v) }))}
          />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--good)' }} /> chunk with the answer (C3)
          <span className="viz-key" style={{ background: 'var(--warn)' }} /> other chunk in prompt
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> dropped (overflow)
          <span className="viz-key ring" style={{ borderColor: 'var(--accent)' }} /> kept after retrieval/rerank
        </>
      }
    >
      <svg viewBox="0 0 600 340" className="viz-svg" role="img" aria-label={aria}>
        {/* stage strip */}
        {STEPS.map((s, i) => (
          <g key={s}>
            <rect x={6 + i * 74} y={6} width={66} height={24} rx={12} fill={i === active ? 'var(--accent)' : i < active ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={i === active ? 'var(--accent)' : 'var(--border)'} />
            <text x={39 + i * 74} y={22} textAnchor="middle" fontSize={10.5} fontWeight={700} style={{ fill: i === active ? 'var(--surface)' : 'var(--text)' }} opacity={i === 4 && !params.rerank ? 0.5 : 1}>
              {s}
              {i === 4 && !params.rerank ? ' ✕' : ''}
            </text>
            {i < STEPS.length - 1 && <line x1={72 + i * 74} y1={18} x2={80 + i * 74} y2={18} stroke="var(--border)" strokeWidth={2} />}
          </g>
        ))}
        {active >= 1 && (
          <text x={8} y={50} fontSize={10.5} style={{ fill: 'var(--text-2)' }}>
            Q: “{QUESTION}”
          </text>
        )}

        {/* chunk table */}
        <text x={8} y={72} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          chunk
        </text>
        {showScores && (
          <text x={300} y={72} textAnchor="end" fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            cosine
          </text>
        )}
        {showRR && (
          <text x={356} y={72} textAnchor="end" fontSize={10} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            rerank
          </text>
        )}
        {CHUNKS.map((c, r) => {
          const y = 80 + r * 26;
          const retrieved = f.retrieved.includes(c.id);
          const kept = f.kept.includes(c.id);
          const inP = f.inPrompt.includes(c.id);
          const dropped = f.dropped.includes(c.id);
          const fill = inP ? (c.id === CORRECT ? 'var(--good-soft)' : 'var(--warn-soft)') : dropped ? 'var(--bad-soft)' : 'var(--surface-2)';
          return (
            <g key={c.id} opacity={showScores && !retrieved ? 0.45 : 1}>
              <rect x={6} y={y} width={356} height={22} rx={5} fill={fill} stroke={f.current === c.id ? 'var(--accent)' : kept && active >= 4 ? 'var(--accent)' : 'var(--border)'} strokeWidth={f.current === c.id ? 2.5 : kept && active >= 4 ? 1.6 : 1} />
              <text x={12} y={y + 15} fontSize={10} fontWeight={700} style={{ fill: c.id === CORRECT ? 'var(--good)' : 'var(--text)' }}>
                {c.id}
              </text>
              <text x={34} y={y + 15} fontSize={9.5}>
                {short(c.title, 40)}
              </text>
              {showScores && (
                <text x={300} y={y + 15} textAnchor="end" fontSize={10} style={{ fontFamily: 'var(--mono)' }}>
                  {c.vec.toFixed(2)}
                </text>
              )}
              {showRR && (
                <text x={356} y={y + 15} textAnchor="end" fontSize={10} fontWeight={700} style={{ fontFamily: 'var(--mono)', fill: c.rr > 0.8 ? 'var(--good)' : 'var(--text)' }}>
                  {c.rr.toFixed(2)}
                </text>
              )}
              {dropped && (
                <text x={240} y={y + 15} textAnchor="end" fontSize={9} fontWeight={700} style={{ fill: 'var(--bad)' }}>
                  DROPPED
                </text>
              )}
            </g>
          );
        })}

        {/* token budget */}
        <text x={BX} y={72} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          context window: {packing ? f.used : 0}/{params.budget} tokens
        </text>
        <rect x={BX} y={80} width={BW} height={22} rx={4} fill="var(--surface-2)" stroke="var(--border)" />
        {segs.map((s, i) => {
          const x = BX + acc * scale;
          acc += s.tokens;
          return (
            <g key={i}>
              <rect x={x} y={80} width={s.tokens * scale} height={22} fill={s.fill} opacity={0.85} stroke="var(--surface)" />
              {s.tokens * scale > 22 && (
                <text x={x + (s.tokens * scale) / 2} y={95} textAnchor="middle" fontSize={9} fontWeight={700} style={{ fill: 'var(--surface)' }}>
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
        {packing && <rect x={BX + BW - ANSWER_RESERVE * scale} y={80} width={ANSWER_RESERVE * scale} height={22} fill="none" stroke="var(--text-2)" strokeDasharray="3 2" />}
        {packing && (
          <text x={BX + BW - (ANSWER_RESERVE * scale) / 2} y={116} textAnchor="middle" fontSize={9} style={{ fill: 'var(--text-2)' }}>
            answer reserve {ANSWER_RESERVE}
          </text>
        )}
        {packing &&
          f.inPrompt.map((id, i) => (
            <text key={id} x={BX} y={140 + i * 16} fontSize={10} style={{ fontFamily: 'var(--mono)', fill: id === CORRECT ? 'var(--good)' : 'var(--text)' }}>
              [{i + 1}] {id} · {CHUNKS.find((c) => c.id === id)!.tokens} tok
            </text>
          ))}
        {packing &&
          f.dropped.map((id, i) => (
            <text key={id} x={BX + 110} y={140 + i * 16} fontSize={10} style={{ fontFamily: 'var(--mono)', fill: 'var(--bad)' }}>
              ✕ {id}
            </text>
          ))}

        {/* answer */}
        {f.answer && (
          <g>
            <rect x={6} y={296} width={588} height={38} rx={8} fill={f.correct ? 'var(--good-soft)' : 'var(--bad-soft)'} stroke={f.correct ? 'var(--good)' : 'var(--bad)'} />
            <text x={16} y={312} fontSize={10.5} fontWeight={700} style={{ fill: f.correct ? 'var(--good)' : 'var(--bad)' }}>
              {f.correct ? '✓ correct' : '✕ wrong'}
            </text>
            <text x={16} y={327} fontSize={10}>
              {short(f.answer, 110)}
            </text>
          </g>
        )}
      </svg>
    </VizFrame>
  );
}
