import { useState } from 'react';
import { Choice, Slider, VizFrame, useFrames, useSimulation } from '../../core';
import { meta } from './meta';
import { ANSWER, CHUNKS, DEFAULT_PARAMS, LEAVE_AT, firstVisible, simulate, totalTime, type Leave, type Mode, type Params } from './sim';
import './index.css';

const sec = (x: number) => `${x.toFixed(x < 10 ? 2 : 1)} s`;

export default function LlmStreamingViz() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const frames = useSimulation(simulate, params);
  const raw = useFrames(frames);
  const f = raw.frame;
  const set = (p: Partial<Params>) => setParams((v) => ({ ...v, ...p }));
  const stream = params.mode === 'stream';
  const total = totalTime(params);
  const X = (t: number) => `${Math.min(100, (t / total) * 100)}%`;
  const leftAt = params.leave === 'stay' ? null : params.ttft + (Math.round(CHUNKS * LEAVE_AT) * params.outTokens) / CHUNKS / params.tps;
  const seenEnd = f.visible === 0 ? 0 : f.gone && leftAt !== null ? Math.min(f.t, leftAt) : f.t;
  const right = firstVisible(params) === params.ttft ? 0 : 2;
  const opts = [`at the TTFT, ≈ ${sec(params.ttft)}`, `halfway, ≈ ${sec(total / 2)}`, `at the end, ≈ ${sec(total)}`].map((label, i) => ({ id: String(i), label }));

  return (
    <VizFrame
      title={meta.title}
      blurb={meta.blurb}
      stepper={raw}
      turn={
        f.turn && {
          kind: 'choice',
          id: `first-${JSON.stringify(params)}`,
          at: raw.i,
          question: `${stream ? 'Streaming' : 'Non-streaming'}: about when does the user see the first word of this ${params.outTokens}-token answer?`,
          options: opts,
          answer: String(right),
          hint: stream ? 'Streaming shows each delta as it arrives. When does the first token leave the model?' : 'Without streaming the server sends one response when the answer is complete. Total ≈ TTFT + tokens ÷ speed.',
          why: stream
            ? `At the TTFT, ${sec(params.ttft)}: the first delta is on screen while the rest is still being written. Switch to Non-streaming and predict again.`
            : `Only at the end, ${sec(total)} (${sec(params.ttft)} + ${params.outTokens}/${params.tps}). The model is no slower; the user just sees nothing until it finishes.`,
        }
      }
      controls={
        <>
          <Choice<Mode>
            label="Mode"
            value={params.mode}
            options={[
              { value: 'stream', label: 'Streaming (SSE)' },
              { value: 'block', label: 'Non-streaming' },
            ]}
            onChange={(mode) => set({ mode })}
          />
          <Choice<Leave>
            label="User"
            value={params.leave}
            options={[
              { value: 'stay', label: 'reads to the end' },
              { value: 'abort', label: 'leaves · abort upstream' },
              { value: 'no-abort', label: 'leaves · no abort' },
            ]}
            onChange={(leave) => set({ leave })}
          />
          <Slider label="Output tokens" value={params.outTokens} min={120} max={1200} step={40} onChange={(outTokens) => set({ outTokens })} />
          <Slider label="Decode speed" value={params.tps} min={40} max={150} step={10} format={(v) => `${v} tok/s`} onChange={(tps) => set({ tps })} />
          <Slider label="TTFT" value={params.ttft} min={0.2} max={0.8} step={0.05} format={(v) => `${v.toFixed(2)} s`} onChange={(ttft) => set({ ttft })} />
        </>
      }
      legend={
        <>
          <span className="viz-key" style={{ background: 'var(--c-ion)' }} /> tokens generated (billed)
          <span className="viz-key" style={{ background: 'var(--grad-action)' }} /> text on the user’s screen
          <span className="viz-key" style={{ background: 'var(--bad)' }} /> generated after the user left
          <span className="viz-key" style={{ background: 'var(--c-solar)' }} /> TTFT
        </>
      }
    >
      <div className="ls">
        <div role="img" aria-label={`Timeline at ${sec(f.t)} of ${sec(total)}: ${f.generated} of ${params.outTokens} tokens generated; user ${f.gone ? 'has left' : f.visible ? 'is reading' : 'sees nothing yet'}.`}>
          <div className="ls-lane">
            <span>Model</span>
            <span className="ls-track">
              <span className="ls-fill gen" style={{ left: X(params.ttft), width: f.t > params.ttft ? `calc(${X(f.t)} - ${X(params.ttft)})` : '0%' }} />
              {f.gone && leftAt !== null && f.t > leftAt && <span className="ls-fill waste" style={{ left: X(leftAt), width: `calc(${X(f.t)} - ${X(leftAt)})` }} />}
              <span className="ls-mark" style={{ left: X(params.ttft) }} />
              <span className="ls-now" style={{ left: X(f.t) }} />
            </span>
            <span className="ls-v">{f.generated} tok</span>
          </div>
          <div className="ls-lane" style={{ marginTop: 10 }}>
            <span>User sees</span>
            <span className="ls-track">
              {f.visible > 0 && <span className="ls-fill seen" style={{ left: X(stream ? params.ttft : total), width: stream ? `calc(${X(seenEnd)} - ${X(params.ttft)})` : '3px' }} />}
              <span className="ls-mark" style={{ left: X(params.ttft) }} />
              <span className="ls-now" style={{ left: X(f.t) }} />
            </span>
            <span className="ls-v">{sec(f.t)}</span>
          </div>
          <div className="ls-axis" aria-hidden>
            <span style={{ left: 0 }}>0</span>
            <span style={{ left: X(params.ttft) }}>TTFT</span>
            <span style={{ right: 0 }}>{sec(total)}</span>
          </div>
        </div>

        <div className={`ls-screen${f.gone ? ' gone' : ''}`}>
          <span className="ls-lbl">{f.gone ? 'Tab closed' : 'User’s screen'}</span>
          {ANSWER.slice(0, f.visible).map((c, i) => (
            <span key={i} className="ls-chunk">
              {c}
            </span>
          ))}
          {!f.gone && !(f.done && f.visible === ANSWER.length) && <span className="ls-caret" aria-hidden />}
        </div>

        <pre className="ls-log na-dark" aria-label="Server-sent events received">
          {stream ? (f.events.length ? f.events.slice(-4).join('\n') : '(connection open, no events yet)') : f.done && !f.gone ? 'HTTP 200 · one JSON body with the whole answer' : f.events.at(-1) ?? '(waiting for the whole response…)'}
        </pre>

      </div>
    </VizFrame>
  );
}
