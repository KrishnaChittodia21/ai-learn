import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { BASE_VOCAB, CORPUS, DEFAULT_PARAMS, MAX_MERGES, MIN_MERGES, TEXTS, encode, simulate, train, type Params, type TextChoice } from './sim';

const FILLS = ['var(--accent-soft)', 'var(--good-soft)', 'var(--warn-soft)'];
const CH = 8.2;

export default function BpeTokenizerViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const stepper = useFrames(frames);
  const f = stepper.frame;
  const merges = train(params.merges);
  const lastNew = f.lastMerge !== null ? merges[f.lastMerge].a + merges[f.lastMerge].b : null;
  const startCount = frames[0].tokenCount;

  // lay out token chips, wrapping lines
  const chips: { t: string; x: number; y: number; w: number; idx: number; byte: boolean }[] = [];
  let x = 14;
  let y = 52;
  let idx = 0;
  for (const word of f.words) {
    const ww = word.reduce((s, t) => s + Math.max(18, t.length * CH + 8) + 2, 0);
    if (x + ww > 590) {
      x = 14;
      y += 40;
    }
    for (const t of word) {
      const w = Math.max(18, t.length * CH + 8);
      chips.push({ t, x, y, w, idx, byte: /^<[0-9A-F]{2}>$/.test(t) });
      x += w + 2;
      idx++;
    }
    x += 10;
  }

  const shown = merges.slice(0, f.k).map((m, i) => ({ ...m, i })).slice(-8);
  // corpus preview: 6 words with current segmentation
  const corpusPreview = CORPUS.slice(0, 7).map(([w, c]) => ({ w, c, seg: encode(w, merges, f.k)[0] }));

  const aria = `BPE tokenizer after ${f.k} merges: vocabulary ${f.vocab}, the text "${TEXTS[params.text].text}" is ${f.tokenCount} tokens: ${f.words.map((w) => w.join(' ')).join(' | ')}.`;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={stepper}
      controls={
        <>
          <Choice<TextChoice>
            label="Text"
            value={params.text}
            options={(Object.keys(TEXTS) as TextChoice[]).map((k) => ({ value: k, label: TEXTS[k].label }))}
            onChange={(text) => setParams((p) => ({ ...p, text }))}
          />
          <Slider label="Merges to learn" value={params.merges} min={MIN_MERGES} max={MAX_MERGES} onChange={(merges) => setParams((p) => ({ ...p, merges }))} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} /> token (colours alternate)
          <span className="viz-key" style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)' }} /> raw byte of a non-ASCII character
          <span className="viz-key ring" style={{ borderColor: 'var(--accent)' }} /> token created by the latest merge
        </>
      }
    >
      <svg viewBox="0 0 600 340" className="viz-svg" role="img" aria-label={aria}>
        <text x={14} y={22} className="viz-label">
          text: “{TEXTS[params.text].text}”
        </text>
        <text x={586} y={22} textAnchor="end" fontSize={13} fontWeight={700}>
          {f.tokenCount} tokens
          <tspan className="viz-label" dx={6}>
            (started at {startCount})
          </tspan>
        </text>
        {chips.map((c) => {
          const hot = lastNew !== null && c.t === lastNew;
          return (
            <g key={c.idx}>
              <rect
                x={c.x}
                y={c.y}
                width={c.w}
                height={26}
                rx={5}
                fill={c.byte ? 'var(--bad-soft)' : FILLS[c.idx % 3]}
                stroke={hot ? 'var(--accent)' : c.byte ? 'var(--bad)' : 'var(--border)'}
                strokeWidth={hot ? 2.5 : 1}
              />
              <text x={c.x + c.w / 2} y={c.y + 17} textAnchor="middle" fontSize={c.byte ? 10 : 12.5} style={{ fontFamily: 'var(--mono)' }}>
                {c.t}
              </text>
            </g>
          );
        })}

        {/* merge table */}
        <text x={14} y={150} fontSize={11} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          learned merges (latest 8 of {f.k})
        </text>
        {shown.length === 0 && (
          <text x={14} y={172} className="viz-label">
            none yet: vocabulary = 256 bytes
          </text>
        )}
        {shown.map((m, r) => {
          const hot = m.i === f.lastMerge;
          return (
            <g key={m.i}>
              <rect x={12} y={158 + r * 21} width={258} height={19} rx={4} fill={hot ? 'var(--accent-soft)' : 'var(--surface-2)'} stroke={hot ? 'var(--accent)' : 'var(--border)'} />
              <text x={20} y={171 + r * 21} fontSize={10.5} style={{ fontFamily: 'var(--mono)' }}>
                #{m.i + 1} {m.a} + {m.b} → {m.a + m.b}
              </text>
              <text x={262} y={171 + r * 21} textAnchor="end" fontSize={10} style={{ fill: 'var(--text-2)' }}>
                ×{m.count}
              </text>
            </g>
          );
        })}

        {/* corpus segmentation */}
        <text x={290} y={150} fontSize={11} fontWeight={700} style={{ fill: 'var(--text-2)' }}>
          training corpus (word ×freq) as currently split
        </text>
        {corpusPreview.map((c, r) => (
          <text key={c.w} x={290} y={171 + r * 17} fontSize={10.5} style={{ fontFamily: 'var(--mono)' }}>
            {c.seg.join('·')}
            <tspan className="viz-label" style={{ fontSize: 10 }} dx={6}>
              ×{c.c}
            </tspan>
          </text>
        ))}

        {/* vocab / token bars */}
        <text x={290} y={300} fontSize={10.5} style={{ fill: 'var(--text-2)' }}>
          vocab {f.vocab} = {BASE_VOCAB} bytes + {f.k} merges
        </text>
        <rect x={290} y={306} width={296} height={9} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
        <rect x={290} y={306} width={(296 * f.vocab) / (BASE_VOCAB + MAX_MERGES)} height={9} rx={3} fill="var(--accent)" style={{ transition: 'width 0.3s ease' }} />
        <text x={290} y={329} fontSize={10.5} style={{ fill: 'var(--text-2)' }}>
          tokens {f.tokenCount}/{startCount}
        </text>
        <rect x={380} y={321} width={206} height={9} rx={3} fill="var(--surface-2)" stroke="var(--border)" />
        <rect x={380} y={321} width={(206 * f.tokenCount) / startCount} height={9} rx={3} fill="var(--good)" style={{ transition: 'width 0.3s ease' }} />
      </svg>
    </VizFrame>
  );
}
