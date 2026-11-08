// Pure, deterministic streaming-vs-blocking timeline (no React, Node-testable).
// Latency model from the Streaming Responses lesson: total ≈ TTFT + output tokens ÷ decode speed. Streaming does not
// make the model faster; it shows text from TTFT on. Events follow the Anthropic Messages SSE stream:
// message_start → content_block_delta (text_delta) × n → message_delta (stop_reason, usage) → message_stop.
// Optional: the user closes the tab half-way. With an upstream abort, generation stops; without it the model keeps
// generating (and billing) tokens nobody reads.
import type { BaseFrame } from '../../core';

export type Mode = 'stream' | 'block';
export type Leave = 'stay' | 'abort' | 'no-abort';

export interface Params {
  mode: Mode;
  outTokens: number;
  /** decode speed, tokens/s */
  tps: number;
  /** time to first token, s */
  ttft: number;
  leave: Leave;
}

export const DEFAULT_PARAMS: Params = { mode: 'stream', outTokens: 640, tps: 80, ttft: 0.55, leave: 'stay' };
/** content_block_delta frames shown (each stands for outTokens / CHUNKS tokens) */
export const CHUNKS = 6;
/** the user leaves after this share of the answer */
export const LEAVE_AT = 0.5;

export const ANSWER = [
  'Our refund policy',
  ' covers annual plans for 30 days',
  ' from purchase. Request it in',
  ' Settings → Billing; approved refunds',
  ' go back to the original card',
  ' within 5–7 business days.',
];

export const totalTime = (p: Pick<Params, 'outTokens' | 'tps' | 'ttft'>) => p.ttft + p.outTokens / p.tps;

export interface Frame extends BaseFrame {
  /** model clock, seconds since the request */
  t: number;
  /** tokens generated so far (billed) */
  generated: number;
  /** answer chunks visible to the user */
  visible: number;
  /** SSE events sent so far */
  events: string[];
  /** user has left the page */
  gone: boolean;
  /** request finished (stopped or completed) */
  done: boolean;
  turn?: 'first-word';
}

const s = (x: number) => `${x.toFixed(x < 10 ? 2 : 1)} s`;

export function simulate(p: Params): Frame[] {
  const out = Math.max(1, Math.round(p.outTokens));
  const total = totalTime({ ...p, outTokens: out });
  const per = out / CHUNKS;
  const stream = p.mode === 'stream';
  const F: Frame[] = [];
  const events: string[] = [];
  const push = (f: Omit<Frame, 'events'>) => F.push({ ...f, events: [...events] });

  push({
    t: 0,
    generated: 0,
    visible: 0,
    gone: false,
    done: false,
    caption: `POST /v1/messages${stream ? ' with "stream": true' : ''}. The model will write ${out} tokens at ~${p.tps} tok/s after a TTFT of ${s(p.ttft)} (network + queueing + reading the prompt). Total ≈ ${s(p.ttft)} + ${out}/${p.tps} = ${s(total)}.`,
    turn: 'first-word',
  });
  if (stream) events.push('event: message_start');
  push({
    t: p.ttft * 0.6,
    generated: 0,
    visible: 0,
    gone: false,
    done: false,
    caption: stream
      ? `Headers arrive with Content-Type: text/event-stream and a message_start event. No text yet: the model is still reading the prompt.`
      : `Waiting. With a normal request the connection stays silent until the whole answer is written.`,
  });

  const leaveChunk = p.leave === 'stay' ? Infinity : Math.round(CHUNKS * LEAVE_AT);
  let gone = false;
  for (let c = 1; c <= CHUNKS; c++) {
    const t = p.ttft + (c * per) / p.tps;
    if (c > leaveChunk && !gone) {
      gone = true;
      const genAt = Math.round((c - 1) * per);
      const tLeft = p.ttft + genAt / p.tps;
      if (p.leave === 'abort') {
        events.push('— client disconnected → controller.abort()');
        push({
          t: tLeft,
          generated: genAt,
          visible: stream ? c - 1 : 0,
          gone,
          done: true,
          caption: `The user closes the tab at ${s(tLeft)}. Your server sees the disconnect and aborts the upstream request: generation stops at ~${genAt} tokens, so you pay for ${genAt} instead of ${out}.`,
        });
        return finish(F, p, out, genAt);
      }
      events.push('— client disconnected (upstream NOT aborted)');
    }
    if (stream) events.push(`event: content_block_delta  data: {"text":"${ANSWER[c - 1].trim().slice(0, 18)}…"}`);
    const gen = Math.round(c * per);
    push({
      t,
      generated: gen,
      visible: stream && !gone ? c : stream ? leaveChunk : 0,
      gone,
      done: false,
      caption: gone
        ? `Nobody is reading any more, but nothing told the provider: the model keeps generating (${gen}/${out} tokens) and you keep paying.`
        : stream
          ? c === 1
            ? `The first content_block_delta (a text_delta) arrived at ${s(p.ttft)}, the TTFT, and the user started reading; by ${s(t)} ${gen} tokens are on screen. Users judge speed by that first moment.`
            : `Delta ${c}/${CHUNKS} at ${s(t)}: append the text to the screen. Each event is "event:" + "data:" lines and a blank line.`
          : `Still nothing on screen at ${s(t)}: ${gen}/${out} tokens are written on the server, but the response is sent only when complete.`,
    });
  }
  return finish(F, p, out, out);
}

function finish(F: Frame[], p: Params, out: number, billed: number): Frame[] {
  const total = totalTime({ ...p, outTokens: out });
  const last = F[F.length - 1];
  if (last.done) {
    F.push({
      ...last,
      caption: `Recap: aborting on disconnect saved ${out - billed} output tokens. In the lesson's test, 18% of users left early; without the abort that was ~18% of the output bill.`,
    });
    return F;
  }
  const stream = p.mode === 'stream';
  const events = [...last.events];
  if (stream) events.push('event: message_delta  data: {"stop_reason":"end_turn","usage":{"output_tokens":' + out + '}}', 'event: message_stop');
  const gone = last.gone;
  F.push({
    t: total,
    generated: out,
    visible: gone ? last.visible : ANSWER.length,
    events,
    gone,
    done: true,
    caption: gone
      ? `Finished at ${s(total)}: ${out} tokens billed, ${out - Math.round(out * LEAVE_AT)} of them after the user left. Abort upstream when the client disconnects.`
      : stream
        ? `message_delta brings stop_reason and usage, then message_stop. Done at ${s(total)}, same as without streaming, but the user was reading from ${s(p.ttft)}.`
        : `The full answer arrives at once at ${s(total)}. First visible text = total time = ${s(total)}.`,
  });
  F.push({
    ...F[F.length - 1],
    caption: `Recap: first visible text ${stream ? s(p.ttft) : s(total)}, full answer ${s(total)}. Stream any user-facing answer; skip it for background jobs or when you must validate the whole output (e.g. JSON) before showing anything.`,
  });
  return F;
}

/** Your-turn answer: when the user sees the first word */
export const firstVisible = (p: Params) => (p.mode === 'stream' ? p.ttft : totalTime(p));
