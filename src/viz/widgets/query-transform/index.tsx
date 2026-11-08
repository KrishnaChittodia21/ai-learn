import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { DEFAULT_PARAMS, HYDE, K_MAX, K_MIN, MULTI, fuse, simulate, type Mode, type Params } from './sim';
import './index.css';

export default function QueryTransformViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  // a dial change keeps the current step; switching mode starts over
  const raw = useFrames(frames, { keepIndex: true, resetKey: params.mode });
  const f = raw.frame;
  const fz = fuse(params.rrfK);
  const [before, wrong, after] = HYDE.passage.split(/(5 to 10 business days)/);

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={raw}
      turn={
        f.turn === 'hyde-pick'
          ? {
              kind: 'choice',
              id: 'hyde-pick',
              at: raw.i,
              question: 'The passage gets the refund window wrong. Which vector will rank the real policy chunk higher?',
              options: [
                { id: 'question', label: 'The question' },
                { id: 'hyde', label: 'The (wrong) HyDE passage' },
                { id: 'neither', label: 'Neither: wrong facts break retrieval' },
              ],
              answer: 'hyde',
              hint: 'The embedding captures the relevance pattern (topic, vocabulary, the shape of an answer) far more than the exact numbers. Which text looks more like a policy paragraph?',
              why: 'The HyDE passage. It reads like the policy, so its vector lands next to the real chunk; the wrong number barely moves it. Press Next to see the ranks.',
            }
          : f.turn === 'multi-top'
            ? {
                kind: 'choice',
                id: `multi-top-${params.rrfK}`,
                at: raw.i,
                question: 'After Reciprocal Rank Fusion, which document is #1?',
                options: MULTI.docs.map((d, i) => ({ id: String(i), label: d })),
                answer: String(fz.order[0]),
                hint: 'RRF sums 1 / (k + rank) over every list a doc appears in. One #1 is worth about as much as one #4 when k is large; appearing in four lists counts most.',
                why: `"${MULTI.docs[fz.order[0]]}": found by all four lists, so its four small contributions beat one #1. Drag k down to 1 and watch the scores spread out.`,
              }
            : undefined
      }
      controls={
        <>
          <Choice<Mode>
            label="Technique"
            value={params.mode}
            options={[
              { value: 'hyde', label: 'HyDE' },
              { value: 'multi', label: 'Multi-query + RRF' },
            ]}
            onChange={(mode) => setParams((p) => ({ ...p, mode }))}
          />
          {params.mode === 'multi' && <Slider label="RRF k" value={params.rrfK} min={K_MIN} max={K_MAX} onChange={(rrfK) => setParams((p) => ({ ...p, rrfK }))} />}
        </>
      }
    >
      {params.mode === 'hyde' ? (
        <div className="qt">
          <div className="qt-box">
            <span className="qt-lbl">Question</span>
            {HYDE.query}
          </div>
          {f.passage && (
            <div className="qt-box llm">
              <span className="qt-lbl">LLM-written hypothetical passage</span>
              {before}
              <mark className="qt-wrong">{wrong}</mark>
              {after}
            </div>
          )}
          <div role="list" aria-label="Rank of the true policy chunk per retrieval vector">
            {HYDE.vectors.map((v, i) => {
              const on = i < f.vectors;
              return (
                <div key={v.id} role="listitem" className={`qt-vec${on ? '' : ' off'}`} aria-hidden={!on}>
                  <span>{v.label}</span>
                  <span className="qt-bar">
                    <span style={{ width: on ? `${v.cos * 100}%` : '0%' }} />
                  </span>
                  <span className={`qt-v${on && v.rank === 1 ? ' top' : ''}`}>{on ? `#${v.rank} · ${v.cos.toFixed(2)}` : '…'}</span>
                </div>
              );
            })}
          </div>
          {f.stage === 'facts' && (
            <div className="qt-box truth">
              <span className="qt-lbl">Real chunk retrieved → the answer cites it</span>
              {HYDE.truth}
            </div>
          )}
        </div>
      ) : (
        <div className="qt">
          <div className="qt-box">
            <span className="qt-lbl">Question</span>
            {MULTI.query}
          </div>
          {f.variants && (
            <div className="qt-box llm">
              <span className="qt-lbl">LLM variants</span>
              <ol className="qt-vars">
                {MULTI.variants.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ol>
            </div>
          )}
          <table className="qt-tbl" aria-label="Rank of each document per query list, and fused RRF score">
            <thead>
              <tr>
                <th scope="col">Doc</th>
                <th scope="col">orig</th>
                <th scope="col">v1</th>
                <th scope="col">v2</th>
                <th scope="col">v3</th>
                <th scope="col">RRF</th>
              </tr>
            </thead>
            <tbody>
              {MULTI.docs.map((d, i) => (
                <tr key={d} className={f.fused && f.fused.order[0] === i ? 'win' : ''}>
                  <th scope="row" style={{ fontWeight: 'inherit' }}>
                    {d}
                  </th>
                  {MULTI.ranks[i].map((r, j) => (
                    <td key={j} className={j >= f.lists ? 'dim' : r === 1 ? 'r1' : ''}>
                      {j >= f.lists ? '·' : r === null ? '—' : `#${r}`}
                    </td>
                  ))}
                  <td className="score">{f.fused ? f.fused.scores[i].toFixed(4) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </VizFrame>
  );
}
