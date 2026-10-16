import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { WideSvg } from '../_shared/WideSvg';
import { meta } from './meta';
import { ANSWER_SENTENCE, DEFAULT_PARAMS, N, SENTENCES, SIZE_MAX, SIZE_MIN, WORDS, brokenSentences, clampOverlap, cutSentences, simulate, type Params, type Strategy } from './sim';

const CHW = 5.4;
const LINE = 16;

// static word layout (wrapping, blank line between paragraphs)
const LAYOUT = (() => {
  const out: { x: number; y: number; w: number }[] = [];
  let x = 14;
  let y = 22;
  WORDS.forEach((wd, i) => {
    const w = wd.w.length * CHW;
    if (i > 0 && wd.para !== WORDS[i - 1].para) {
      x = 14;
      y += LINE * 1.5;
    } else if (x + w > 588) {
      x = 14;
      y += LINE;
    }
    out.push({ x, y, w });
    x += w + CHW;
  });
  return out;
})();
const TEXT_BOTTOM = LAYOUT[LAYOUT.length - 1].y + 12;

export default function ChunkingPlaygroundViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const overlap = clampOverlap(params.size, params.overlap);
  const chunks = f.chunks;
  const cur = f.current !== null ? chunks[f.current] : null;

  const member = WORDS.map((_, i) => chunks.map((c, k) => (c.s <= i && i < c.e ? k : -1)).filter((k) => k >= 0));
  const bounds = new Set<number>();
  (f.showCuts ? chunks : cur ? [cur] : []).forEach((c) => {
    bounds.add(c.s);
    bounds.add(c.e);
  });
  const cutAt = [...bounds].filter((b) => b > 0 && b < N && WORDS[b].sentence === WORDS[b - 1].sentence);

  const laneTop = TEXT_BOTTOM + 22;
  const laneH = Math.min(12, (318 - laneTop) / Math.max(1, frames[frames.length - 1].chunks.length));
  const LX = (i: number) => 14 + (i / N) * 400;
  const cuts = cutSentences(chunks);
  const broken = brokenSentences(chunks);

  const dup = chunks.length ? chunks.reduce((a, c) => a + c.e - c.s, 0) - (chunks[chunks.length - 1].e - chunks[0].s) : 0;
  const aria = `${params.strategy} chunking, size ${params.size}, overlap ${overlap}: ${chunks.length} chunks${f.stage === 'chunk' ? ' so far' : ''}, ${cuts.length} sentences with a boundary inside, ${dup} duplicated tokens.${f.answerHits ? (f.answerHits.length ? ` Answer sentence wholly inside chunk ${f.answerHits.map((h) => h + 1).join(', ')}.` : ' Answer sentence split across chunks.') : ''}`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<Strategy>
            label="Strategy"
            value={params.strategy}
            options={[
              { value: 'fixed', label: 'Fixed-size' },
              { value: 'recursive', label: 'Recursive' },
            ]}
            onChange={(strategy) => setParams((p) => ({ ...p, strategy }))}
          />
          <Slider label="Chunk size (tokens)" value={params.size} min={SIZE_MIN} max={SIZE_MAX} step={5} onChange={(size) => setParams((p) => ({ ...p, size }))} />
          <Slider label="Overlap (tokens)" value={params.overlap} min={0} max={25} step={5} onChange={(o) => setParams((p) => ({ ...p, overlap: o }))} format={(v) => (clampOverlap(params.size, v) !== v ? `${v} → ${clampOverlap(params.size, v)} (max size/2)` : String(v))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} /> chunk being created
          <span className="viz-key" style={{ background: 'var(--good-soft)' }} /> chunked text (alternating)
          <span className="viz-key" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }} /> duplicated by overlap
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> ✂ boundary inside a sentence
        </>
      }
    >
      <WideSvg>
        <svg viewBox="0 0 600 330" className="viz-svg" role="img" aria-label={aria}>
          {WORDS.map((wd, i) => {
            const p = LAYOUT[i];
            const m = member[i];
            const inCur = cur !== null && cur.s <= i && i < cur.e;
            const dupe = f.showDupes && m.length > 1;
            const fill = inCur ? 'var(--accent-soft)' : dupe ? 'var(--warn-soft)' : m.length ? (m[0] % 2 ? 'var(--surface-2)' : 'var(--good-soft)') : 'none';
            const ans = f.highlightAnswer && wd.sentence === ANSWER_SENTENCE;
            return (
              <g key={i}>
                <rect x={p.x - 1.5} y={p.y - 10} width={p.w + CHW} height={14} fill={fill} />
                <text x={p.x} y={p.y} fontSize={9.5} fontWeight={ans ? 700 : 400} style={{ fill: ans ? 'var(--accent)' : 'var(--text)' }}>
                  {wd.w}
                </text>
                {ans && <line x1={p.x} y1={p.y + 2.5} x2={p.x + p.w} y2={p.y + 2.5} stroke="var(--accent)" strokeWidth={1.4} />}
              </g>
            );
          })}
          {cutAt.map((b) => {
            const p = LAYOUT[b];
            return (
              <g key={b}>
                <line x1={p.x - 2} y1={p.y - 12} x2={p.x - 2} y2={p.y + 4} stroke="var(--bad)" strokeWidth={2} />
                <text x={p.x - 2} y={p.y - 12} textAnchor="middle" fontSize={8} style={{ fill: 'var(--bad)' }}>
                  ✂
                </text>
              </g>
            );
          })}

          {/* chunk lanes on a token axis */}
          <text x={14} y={laneTop - 8} fontSize={10.5} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
            chunk map (token 1 → {N})
          </text>
          <rect x={14} y={laneTop - 3} width={400} height={2} fill="var(--border)" />
          {chunks.map((c, k) => {
            const answered = f.answerHits?.includes(k);
            return (
              <rect
                key={k}
                x={LX(c.s)}
                y={laneTop + k * laneH}
                width={Math.max(2, LX(c.e) - LX(c.s))}
                height={Math.max(2, laneH - 2)}
                rx={2}
                fill={k === f.current ? 'var(--accent)' : answered ? 'var(--good)' : k % 2 ? 'var(--text-2)' : 'var(--good)'}
                opacity={k === f.current || answered ? 1 : 0.55}
              />
            );
          })}

          {/* stats */}
          <g>
            {[
              ['chunks', String(chunks.length), 'var(--text)'],
              ['sentences cut ✂', `${cuts.length}/${SENTENCES.length}`, cuts.length ? 'var(--bad)' : 'var(--good)'],
              ['not whole in any chunk', f.showCuts ? String(broken.length) : '…', broken.length && f.showCuts ? 'var(--bad)' : 'var(--good)'],
              ['duplicated tokens', String(dup), 'var(--warn)'],
            ].map(([k, v, col], r) => (
              <g key={k}>
                <text x={430} y={laneTop + 6 + r * 20} fontSize={10} style={{ fill: 'var(--text-2)' }}>
                  {k}
                </text>
                <text x={590} y={laneTop + 6 + r * 20} textAnchor="end" fontSize={12} fontWeight={700} style={{ fill: col }}>
                  {v}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </WideSvg>
    </VizFrame>
  );
}
