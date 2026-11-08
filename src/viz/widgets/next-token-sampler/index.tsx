import { useState } from 'react';
import { Dices } from 'lucide-react';
import { Choice, Slider, VizFrame, useFrames, useSimulation, type Turn } from '../../core';
import { meta } from './meta';
import { DEFAULT_PARAMS, PROMPTS, TUNE_TARGET, T_MAX, T_MIN, VOCAB, distribution, drawMany, simulate, type Params, type PromptId } from './sim';
import './sampler.css';

const SEG = ['#b6a4ff', '#ff8fc8', '#ffc58f', '#7ef0ff', '#b8ff8a', '#d9d0ff', '#ffd6ec', '#c9f8ff'];
const pct = (x: number) => (x * 100 >= 10 ? (x * 100).toFixed(0) : (x * 100).toFixed(1)) + '%';

export default function NextTokenSamplerViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  // a dial change keeps the current step
  const raw = useFrames(frames, { keepIndex: true });
  const f = raw.frame;
  const [draws, setDraws] = useState<number[]>([]);

  const P = PROMPTS[params.prompt];
  const d = f.dist;
  const s = f.step;
  const showScaled = s >= 2;
  const showProb = s >= 3;
  const showK = s >= 4;
  const showP = s >= 5;
  const useRenorm = s >= 6;
  const picked = s >= 7;
  const appended = s >= 8;
  const pr = useRenorm ? d.renorm : d.prob;
  const cutAt = showP ? d.n : showK ? d.nK : VOCAB;
  const maxS = Math.max(...P.cands.map((c) => c.logit), ...d.scaled);
  const tok = P.cands[f.pick].token;
  const set = (p: Partial<Params>) => setParams((x) => ({ ...x, ...p }));

  const now = distribution('fact', params.temperature, params.topK, params.topP);
  const turn: Turn | undefined =
    f.turn === 'predict'
      ? {
          kind: 'choice',
          id: 'predict',
          at: raw.i,
          question: 'Predict the next token: "The capital of Australia is ___"',
          options: [
            { id: 'sydney', label: 'Sydney' },
            { id: 'canberra', label: 'Canberra' },
            { id: 'melbourne', label: 'Melbourne' },
          ],
          answer: 'canberra',
          hint: "The model doesn't look facts up; it predicts what usually follows these words. Biggest city ≠ capital: which name follows “capital of Australia is” most often in encyclopedic text?",
          why: 'Canberra is the favourite. But Sydney is a strong runner-up (it sits next to “Australia” in a lot of text), so a hot sampler will sometimes say it. Press Next to see the odds.',
        }
      : f.turn === 'tune'
        ? {
            kind: 'tune',
            id: 'tune',
            at: raw.i,
            question: `Move the dials so the answer stays factual: Canberra on at least ${TUNE_TARGET * 100}% of draws. Then draw 10.`,
            hit: now.renorm[0] >= TUNE_TARGET,
            status: `P(Canberra) = ${pct(now.renorm[0])} at T ${params.temperature.toFixed(1)}, top-k ${now.nK}, top-p ${params.topP.toFixed(2)}`,
            why: 'For facts keep T low or cut the tail; ground the answer with retrieval too.',
            hint: 'Lower temperature sharpens the odds (try 0.5 or below). Or lower top-p / top-k until Sydney falls outside the cut.',
            checkLabel: 'Draw 10 and check',
            onCheck: () => setDraws(drawMany(now, params.seed * 31 + Math.round(params.temperature * 10) * 7 + Math.round(params.topP * 100) + params.topK, 10)),
            onShowAnswer: () => set({ temperature: 0.3 }),
          }
        : undefined;

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={raw}
      turn={turn}
      controls={
        <>
          <Choice<PromptId>
            label="Prompt"
            value={params.prompt}
            options={(Object.keys(PROMPTS) as PromptId[]).map((k) => ({ value: k, label: PROMPTS[k].label }))}
            onChange={(prompt) => set({ prompt })}
          />
          <Slider label="Temperature" value={params.temperature} min={T_MIN} max={T_MAX} step={0.1} format={(v) => v.toFixed(1)} onChange={(temperature) => set({ temperature })} />
          <Slider label="Top-k" value={params.topK} min={1} max={VOCAB} onChange={(topK) => set({ topK })} format={(v) => (v >= VOCAB ? `${v} (off)` : String(v))} />
          <Slider label="Top-p" value={params.topP} min={0.05} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(topP) => set({ topP })} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--c-ion)' }} /> logit (raw score)
          <span className="viz-key" style={{ background: 'var(--grad-action)' }} /> probability
          <span className="viz-key" style={{ background: 'var(--c-solar)' }} /> top-k / top-p cut
          <span className="viz-key" style={{ background: 'var(--c-pulsar)' }} /> sampled token
        </>
      }
    >
      <div className="ns">
        <div className="ns-prompt" aria-label="Text so far">
          <span className="ns-lbl">Text</span>
          {P.tokens.map((t, j) => (
            <span key={j} className="ns-tok">
              {t}
            </span>
          ))}
          {appended && <span className={`ns-tok new${P.wrong.includes(tok) ? ' bad' : ''}`}>{tok}</span>}
          <span className="ns-caret" aria-hidden />
        </div>

        {s >= 1 && (
          <div className="ns-tbl" role="table" aria-label={`Top ${VOCAB} candidate tokens`}>
            <div className="ns-head" role="row">
              <span role="columnheader">Token</span>
              <span role="columnheader">{showScaled ? 'Logit ÷ T' : 'Logit'}</span>
              <span role="columnheader">{showProb ? (useRenorm ? <>Prob<span className="ns-long">ability</span> (renorm.)</> : 'Probability') : ''}</span>
            </div>
            {P.cands.map((c, j) => {
              const cut = j >= cutAt;
              const val = showScaled ? d.scaled[j] : c.logit;
              const changed = showScaled && params.temperature !== 1;
              return (
                <div key={c.token}>
                  <div
                    role="row"
                    className={`ns-row${cut ? ' cut' : ''}${picked && j === f.pick ? ' pick' : ''}${P.wrong.includes(c.token) && showProb ? ' wrongfact' : ''}`}
                  >
                    <span className="t" role="cell">
                      {c.token}
                    </span>
                    <span className="ns-cell" role="cell">
                      <span className="ns-bar">
                        {showScaled && <span className="ghost" style={{ width: `${(c.logit / maxS) * 100}%` }} />}
                        <span className="lg" style={{ width: `${(val / maxS) * 100}%` }} />
                      </span>
                      <span className="ns-v">
                        {changed && <span className="ns-long">{c.logit.toFixed(1)}→</span>}
                        {val.toFixed(1)}
                      </span>
                    </span>
                    <span className={`ns-cell${showProb ? '' : ' ns-hidden'}`} role="cell">
                      <span className="ns-bar">
                        <span className="pr" style={{ width: `${Math.max(0.5, (cut && useRenorm ? 0 : pr[j]) * 100)}%` }} />
                      </span>
                      <span className="ns-v">{cut && useRenorm ? '—' : pct(pr[j])}</span>
                    </span>
                  </div>
                  {showK && j === cutAt - 1 && cutAt < VOCAB && (
                    <div className="ns-cutline" aria-hidden>
                      <span>
                        {showP ? `${d.nK < VOCAB ? `top-k ${d.nK} · ` : ''}top-p ${params.topP.toFixed(2)} · kept ${pct(d.kept)}` : `top-k ${d.nK}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {s >= 6 && (
          <div className="ns-strip-wrap">
            <p className="ns-lbl">Cumulative bar · the dice roll lands somewhere in 0 → 1</p>
            <div className="ns-strip" aria-hidden>
              {Array.from({ length: d.n }, (_, j) => (
                <span key={j} className="ns-seg" style={{ flex: `0 0 ${d.renorm[j] * 100}%`, background: SEG[j] }}>
                  {d.renorm[j] > 0.12 ? P.cands[j].token.trim() : ''}
                </span>
              ))}
              {picked && (
                <span key={`${params.seed}-${s === 7}`} className="ns-needle" style={{ left: `${f.r * 100}%` }}>
                  <span>r = {f.r.toFixed(2)}</span>
                </span>
              )}
            </div>
            <div className="ns-scale" aria-hidden>
              <span>0</span>
              <span>0.5</span>
              <span>1</span>
            </div>
            {picked && (
              <button
                type="button"
                className="btn btn-sm ns-reroll"
                onClick={() => {
                  set({ seed: params.seed + 1 });
                  if (s < 7) raw.seek(7);
                }}
              >
                <Dices size={15} aria-hidden /> Roll again
              </button>
            )}
          </div>
        )}

        {f.turn === 'tune' && draws.length > 0 && (
          <div className="viz-tally" aria-label={`Last 10 draws: ${draws.map((j) => P.cands[j].token.trim()).join(', ')}`}>
            {draws.map((j, n) => (
              <span key={n} className={j === 0 ? '' : 'no'}>
                {P.cands[j].token.trim()}
              </span>
            ))}
          </div>
        )}
      </div>
    </VizFrame>
  );
}
