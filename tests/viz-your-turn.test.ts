// M8 "Your turn" steps: the answer-checking logic, and for every widget that its turn's answer agrees with its own sim.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canShowAnswer,
  checkChoice,
  checkTune,
  fromFrameTurn,
  isHeld,
  missCount,
  missFeedback,
  nearby,
  optionsOf,
  pickOption,
  turnKey,
  turnShownAt,
  type ChoiceTurn,
  type FrameTurn,
  type TuneTurn,
} from '../src/viz/widgets/_shared/yourTurn.ts';
import * as cb from '../src/viz/widgets/context-budget/sim.ts';
import * as mcp from '../src/viz/widgets/mcp-handshake/sim.ts';
import * as pj from '../src/viz/widgets/pairwise-judge/sim.ts';
import * as sh from '../src/viz/widgets/supervisor-handoff/sim.ts';
import * as bpe from '../src/viz/widgets/bpe-tokenizer/sim.ts';
import * as bpeTurn from '../src/viz/widgets/bpe-tokenizer/turn.ts';
import * as ate from '../src/viz/widgets/agent-trajectory-eval/sim.ts';
import * as ateTurn from '../src/viz/widgets/agent-trajectory-eval/turn.ts';
import * as chunk from '../src/viz/widgets/chunking-playground/sim.ts';
import * as chunkTurn from '../src/viz/widgets/chunking-playground/turn.ts';
import * as claim from '../src/viz/widgets/claim-check/sim.ts';
import * as claimTurn from '../src/viz/widgets/claim-check/turn.ts';
import * as hnsw from '../src/viz/widgets/hnsw-search/sim.ts';
import * as hnswTurn from '../src/viz/widgets/hnsw-search/turn.ts';
import * as hub from '../src/viz/widgets/hub-and-spoke/sim.ts';
import * as hubTurn from '../src/viz/widgets/hub-and-spoke/turn.ts';
import * as rrf from '../src/viz/widgets/hybrid-rrf/sim.ts';
import * as rrfTurn from '../src/viz/widgets/hybrid-rrf/turn.ts';
import * as ivf from '../src/viz/widgets/ivf-pq/sim.ts';
import * as ivfTurn from '../src/viz/widgets/ivf-pq/turn.ts';
import * as kv from '../src/viz/widgets/kv-cache/sim.ts';
import * as kvTurn from '../src/viz/widgets/kv-cache/turn.ts';
import * as lg from '../src/viz/widgets/langgraph-execution/sim.ts';
import * as lgTurn from '../src/viz/widgets/langgraph-execution/turn.ts';
import * as lora from '../src/viz/widgets/lora-update/sim.ts';
import * as loraTurn from '../src/viz/widgets/lora-update/turn.ts';
import * as pcg from '../src/viz/widgets/prompt-chain-gates/sim.ts';
import * as pcgTurn from '../src/viz/widgets/prompt-chain-gates/turn.ts';
import * as rag from '../src/viz/widgets/rag-pipeline/sim.ts';
import * as ragTurn from '../src/viz/widgets/rag-pipeline/turn.ts';
import * as ral from '../src/viz/widgets/react-agent-loop/sim.ts';
import * as ralTurn from '../src/viz/widgets/react-agent-loop/turn.ts';
import * as rpt from '../src/viz/widgets/react-prompt-trace/sim.ts';
import * as rptTurn from '../src/viz/widgets/react-prompt-trace/turn.ts';
import * as scv from '../src/viz/widgets/self-consistency-vote/sim.ts';
import * as scvTurn from '../src/viz/widgets/self-consistency-vote/turn.ts';
import * as sc from '../src/viz/widgets/semantic-cache/sim.ts';
import * as scTurn from '../src/viz/widgets/semantic-cache/turn.ts';
import * as spec from '../src/viz/widgets/speculative-decoding/sim.ts';
import * as specTurn from '../src/viz/widgets/speculative-decoding/turn.ts';
import * as tcr from '../src/viz/widgets/tool-calling-roundtrip/sim.ts';
import * as tcrTurn from '../src/viz/widgets/tool-calling-roundtrip/turn.ts';
import * as ta from '../src/viz/widgets/transformer-attention/sim.ts';
import * as taTurn from '../src/viz/widgets/transformer-attention/turn.ts';
import * as vs from '../src/viz/widgets/vector-similarity/sim.ts';
import * as vsTurn from '../src/viz/widgets/vector-similarity/turn.ts';

/** shared invariants: asked on a real frame that has a "next" to continue to, the answer is one of ≥2 unique options */
function assertChoice(frames: { caption: string }[], t: ChoiceTurn) {
  assert.ok(t.at >= 0 && t.at < frames.length - 1, `at=${t.at} must be a frame with a next frame (of ${frames.length})`);
  assert.ok(t.options.length >= 2, 'at least two options');
  assert.equal(new Set(t.options.map((o) => o.id)).size, t.options.length, 'unique option ids');
  assert.ok(t.options.some((o) => o.id === t.answer), 'answer is an option');
  assert.ok(t.question.length > 10 && t.why.length > 10);
  assert.equal(checkChoice(t, t.answer).correct, true);
  for (const o of t.options) if (o.id !== t.answer) assert.equal(checkChoice(t, o.id).correct, false);
}

test('checkChoice: right vs wrong, the wrong feedback names the right answer', () => {
  const t: ChoiceTurn = { kind: 'choice', at: 0, question: 'Which?', options: [{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Bee' }], answer: 'b', why: 'Because.' };
  assert.deepEqual(checkChoice(t, 'b'), { correct: true, feedback: 'Because.' });
  const wrong = checkChoice(t, 'a');
  assert.equal(wrong.correct, false);
  assert.match(wrong.feedback, /Bee/);
});

test('checkTune: hit decides, the status is always shown', () => {
  const t: TuneTurn = { kind: 'tune', question: 'Tune it', hit: false, status: 'recall 2/3', why: 'More probes.' };
  assert.equal(checkTune(t).correct, false);
  assert.match(checkTune(t).feedback, /recall 2\/3/);
  assert.equal(checkTune({ ...t, hit: true }).correct, true);
  assert.match(checkTune({ ...t, hit: true }).feedback, /More probes/);
});

test('optionsOf / nearby: de-duplicated, include the answer, numbers sorted, never negative', () => {
  assert.deepEqual(
    optionsOf([3, 1, 3], 2).map((o) => o.id),
    ['1', '2', '3'],
  );
  assert.deepEqual(nearby(1), [0, 2, 3]);
  assert.deepEqual(optionsOf(['x', 'y'], 'y').map((o) => o.id), ['x', 'y']);
});

test('bpe-tokenizer: the predicted first merge is the one training actually learns first', () => {
  for (const text of Object.keys(bpe.TEXTS) as bpe.TextChoice[]) {
    for (const merges of [bpe.MIN_MERGES, bpe.DEFAULT_PARAMS.merges, bpe.MAX_MERGES]) {
      const frames = bpe.simulate({ text, merges });
      const t = bpeTurn.buildTurn(frames);
      assertChoice(frames, t);
      const first = bpe.train(merges)[0];
      assert.equal(t.answer, `"${first.a}" + "${first.b}"`);
      // asked before the merge is shown, revealed on the very next frame
      assert.equal(frames[t.at].k, 0);
      assert.equal(frames[t.at + 1].lastMerge, 0);
    }
  }
});

test('agent-trajectory-eval: predicted verdict = the sim verdict, still pending at the question', () => {
  for (const scenario of Object.keys(ate.SCENARIOS) as ate.ScenarioId[])
    for (const mode of ['outcome', 'trajectory'] as const) {
      const frames = ate.simulate({ scenario, mode });
      const t = ateTurn.buildTurn(frames, { scenario, mode });
      assertChoice(frames, t);
      assert.equal(t.answer, frames[frames.length - 1].verdict);
      assert.equal(frames[t.at].verdict, 'pending');
    }
  // the point of the widget: the injection run passes outcome-only but fails trajectory grading
  assert.equal(ateTurn.buildTurn(ate.simulate({ scenario: 'injection', mode: 'outcome' }), { scenario: 'injection', mode: 'outcome' }).answer, 'pass');
  assert.equal(ateTurn.buildTurn(ate.simulate({ scenario: 'injection', mode: 'trajectory' }), { scenario: 'injection', mode: 'trajectory' }).answer, 'fail');
});

test('chunking-playground: "one chunk holds the answer" matches the answer frame, asked before it', () => {
  for (const strategy of ['fixed', 'recursive'] as const)
    for (const size of [chunk.SIZE_MIN, 35, chunk.SIZE_MAX])
      for (const overlap of [0, 10]) {
        const frames = chunk.simulate({ strategy, size, overlap });
        const t = chunkTurn.buildTurn(frames);
        assertChoice(frames, t);
        const A = chunk.SENTENCES[chunk.ANSWER_SENTENCE];
        const whole = chunk.chunksFor(strategy, size, chunk.clampOverlap(size, overlap)).some((c) => c.s <= A.s && c.e >= A.e);
        assert.equal(t.answer, whole ? 'yes' : 'no');
        assert.equal(frames[t.at].answerHits, null);
        assert.equal(frames[t.at + 1].stage, 'answer');
      }
});

test('claim-check: the stamp you pick is the label the sim stamps next', () => {
  for (const scenario of Object.keys(claim.SCENARIOS) as claim.ScenarioId[]) {
    const frames = claim.simulate({ scenario });
    const t = claimTurn.buildTurn(frames, { scenario });
    assertChoice(frames, t);
    const k = frames[t.at].active!;
    assert.equal(t.answer, claim.SCENARIOS[scenario].claims[k].label);
    assert.equal(frames[t.at].stamped.length, k, 'not yet stamped');
    assert.equal(frames[t.at + 1].stamped[k], t.answer);
  }
  // the wrong-number scenario asks about the contradicted claim
  assert.equal(claimTurn.buildTurn(claim.simulate({ scenario: 'number' }), { scenario: 'number' }).answer, 'CONTRADICTED');
});

test('hnsw-search: predicted recall = found ∩ truth from the sim, truth hidden at the question', () => {
  for (const query of Object.keys(hnsw.QUERIES) as hnsw.QueryId[])
    for (const M of [2, 3, 6])
      for (const ef of [hnsw.EF_MIN, 10, hnsw.EF_MAX]) {
        const frames = hnsw.simulate({ ef, M, query });
        const t = hnswTurn.buildTurn(frames);
        assertChoice(frames, t);
        const last = frames[frames.length - 1];
        assert.equal(Number(t.answer), last.found!.filter((x) => last.truth!.includes(x)).length);
        assert.equal(frames[t.at].truth, null);
      }
  // a known miss: query B with efSearch 3 finds 2 of 3
  assert.equal(hnswTurn.buildTurn(hnsw.simulate({ ef: 3, M: 3, query: 'q2' })).answer, '2');
});

test('hub-and-spoke: who answers = servedBy of the first response, asked before any response', () => {
  for (const type of Object.keys(hub.REQUESTS) as hub.RequestType[])
    for (const failure of [false, true]) {
      const params = { type, load: 120, failure };
      const frames = hub.simulate(params);
      const t = hubTurn.buildTurn(frames, params);
      assertChoice(frames, t);
      assert.equal(frames.slice(0, t.at + 1).some((f) => f.response), false);
      const served = frames.find((f) => f.response)!.servedBy;
      assert.equal(t.answer, type === 'unsafe' ? 'hub' : failure ? 'fallback' : 'spoke');
      assert.equal(served === 'hub' ? 'hub' : served === 'fallback' ? 'fallback' : 'spoke', t.answer);
    }
});

test('hybrid-rrf: predicted #1 = rrf() top, before the fused ranking is shown', () => {
  for (const query of Object.keys(rrf.SCENARIOS) as rrf.QueryId[])
    for (const k of [0, 1, 10, 60]) {
      const frames = rrf.simulate({ k, query });
      const t = rrfTurn.buildTurn(frames, { k, query });
      assertChoice(frames, t);
      assert.equal(t.answer, rrf.rrf(rrf.SCENARIOS[query], k)[0].id);
      assert.equal(frames[t.at].fused, null);
    }
  // flat curve → consensus wins; steep curve → a single #1 wins
  assert.equal(rrfTurn.buildTurn(rrf.simulate({ k: 60, query: 'error' }), { k: 60, query: 'error' }).answer, 'D1');
  assert.notEqual(rrfTurn.buildTurn(rrf.simulate({ k: 0, query: 'error' }), { k: 0, query: 'error' }).answer, 'D1');
});

test('ivf-pq: the tune goal is hit exactly at the smallest nprobe reaching the best recall', () => {
  for (const nlist of [ivf.NLIST_MIN, 8, ivf.NLIST_MAX])
    for (const query of Object.keys(ivf.QUERIES) as ivf.QueryId[])
      for (const mode of ['flat', 'pq'] as const)
        for (const rerank of [true, false]) {
          const best = ivf.outcome({ nlist, nprobe: nlist, query, mode, rerank }).recall;
          const hits: number[] = [];
          for (let nprobe = 1; nprobe <= nlist; nprobe++) {
            const t = ivfTurn.buildTurn({ nlist, nprobe, query, mode, rerank });
            assert.equal(checkTune(t).correct, t.hit);
            if (t.hit) hits.push(nprobe);
          }
          assert.equal(hits.length, 1, 'exactly one winning nprobe');
          const n = hits[0];
          assert.equal(ivf.outcome({ nlist, nprobe: n, query, mode, rerank }).recall, best);
          for (let m = 1; m < n; m++) assert.ok(ivf.outcome({ nlist, nprobe: m, query, mode, rerank }).recall < best);
        }
  // default (query A, nlist 8, nprobe 1) misses a border neighbour, so the learner must tune
  assert.equal(ivfTurn.buildTurn(ivf.DEFAULT_PARAMS).hit, false);
});

test('kv-cache: the predicted long-context size is the scale frame\'s, asked before it', () => {
  for (const preset of Object.keys(kv.MODELS) as kv.Preset[])
    for (const seqLen of kv.SEQ_LENS)
      for (const cache of [true, false]) {
        const frames = kv.simulate({ preset, seqLen, cache });
        const t = kvTurn.buildTurn(frames, { preset, seqLen, cache });
        assertChoice(frames, t);
        const scale = frames.findIndex((f) => f.stage === 'scale');
        assert.ok(t.at < scale);
        assert.equal(t.answer, kv.fmtBytes(kv.kvBytesPerToken(kv.MODELS[preset]) * seqLen));
        assert.ok(frames[scale].caption.includes(t.answer));
        assert.ok(!frames[t.at].caption.includes(t.answer), 'not revealed yet');
      }
});

test('langgraph-execution: the predicted agent-run count matches the sim runs', () => {
  for (const scenario of Object.keys(lg.SCENARIO_LABELS) as lg.ScenarioId[])
    for (let recursionLimit = lg.MIN_LIMIT; recursionLimit <= lg.MAX_LIMIT; recursionLimit++)
      for (const decision of ['approve', 'reject'] as lg.Decision[]) {
        const frames = lg.simulate({ scenario, recursionLimit, decision });
        const t = lgTurn.buildTurn(frames);
        assertChoice(frames, t);
        assert.equal(t.answer, String(frames.at(-1)!.runs.filter((r) => r.node === 'agent').length));
        assert.ok(frames[t.at].runs.length === 0, 'asked before any node ran');
      }
  // recursion: agent count grows with the limit
  const runsAt = (L: number) => lgTurn.buildTurn(lg.simulate({ scenario: 'recursion', recursionLimit: L, decision: 'approve' })).answer;
  assert.notEqual(runsAt(4), runsAt(12));
});

test('lora-update: only B moves on the first step, asked on the scale frame', () => {
  for (const r of [lora.R_MIN, 2, 4, 16, lora.R_MAX])
    for (const alpha of [lora.ALPHA_MIN, 32, lora.ALPHA_MAX]) {
      const p = { ...lora.DEFAULT_PARAMS, r, alpha };
      const frames = lora.simulate(p);
      const t = loraTurn.buildTurn(frames);
      assertChoice(frames, t);
      assert.equal(t.answer, 'b');
      const step1 = frames.find((f) => f.stage === 'train')!;
      assert.equal(step1.aMoved, false);
      assert.ok(frames.findIndex((f) => f.stage === 'train') > t.at);
    }
});

test('prompt-chain-gates: predicted LLM calls match the last frame', () => {
  const want = { clean: 2, retry: 3, fail: 2 };
  for (const scenario of Object.keys(pcg.SCENARIOS) as pcg.ScenarioId[]) {
    const frames = pcg.simulate({ scenario });
    const t = pcgTurn.buildTurn(frames);
    assertChoice(frames, t);
    assert.equal(t.answer, String(frames.at(-1)!.llmCalls));
    assert.equal(t.answer, String(want[scenario]));
    assert.equal(frames[t.at].llmCalls, 0);
  }
});

test('rag-pipeline: tune hits only when the sim answers correctly at the smallest budget', () => {
  const smallest = Math.min(...rag.BUDGETS);
  let hits = 0;
  for (const topK of [1, 2, 3, 4, 5, 6, 7, 8])
    for (const rerank of [true, false])
      for (const budget of rag.BUDGETS) {
        const p = { topK, rerank, budget };
        const frames = rag.simulate(p);
        const t = ragTurn.buildTurn(frames, p);
        assert.equal(t.hit, !!frames.at(-1)!.correct && budget === smallest);
        assert.equal(checkTune(t).correct, t.hit);
        if (t.hit) hits++;
      }
  assert.ok(hits > 0, 'the goal is reachable');
  assert.equal(ragTurn.buildTurn(rag.simulate(rag.DEFAULT_PARAMS), rag.DEFAULT_PARAMS).hit, false, 'not solved at the defaults');
});

test('react-agent-loop: predicted ending matches the sim outcome', () => {
  for (const scenario of Object.keys(ral.SCENARIOS) as ral.ScenarioId[])
    for (let maxSteps = ral.MIN_STEPS; maxSteps <= ral.MAX_STEPS; maxSteps++) {
      const p = { scenario, maxSteps };
      const frames = ral.simulate(p);
      const t = ralTurn.buildTurn(frames, p);
      assertChoice(frames, t);
      const last = frames.at(-1)!;
      assert.equal(t.answer, last.outcome === 'stopped' ? 'guard' : String(last.iteration));
      assert.equal(frames[t.at].iteration, 0);
    }
});

test('react-prompt-trace: predicted stop condition matches the sim outcome', () => {
  for (const scenario of Object.keys(rpt.SCENARIOS) as rpt.ScenarioId[])
    for (let maxSteps = rpt.MIN_STEPS; maxSteps <= rpt.MAX_STEPS; maxSteps++) {
      const p = { scenario, maxSteps };
      const frames = rpt.simulate(p);
      const t = rptTurn.buildTurn(frames, p);
      assertChoice(frames, t);
      assert.equal(t.answer, frames.at(-1)!.outcome);
      assert.equal(frames[t.at].outcome, 'running');
    }
});

test('self-consistency-vote: the predicted vote is the verdict the sim reaches, asked before the tally', () => {
  for (const scenario of Object.keys(scv.SCENARIOS) as scv.ScenarioId[]) {
    for (let n = scv.MIN_N; n <= scv.MAX_N; n++) {
      const frames = scv.simulate({ scenario, n });
      const t = scvTurn.buildTurn(frames);
      assertChoice(frames, t);
      const answers = scv.SCENARIOS[scenario].paths.slice(0, n).map((p) => p.answer);
      assert.equal(t.answer, scv.decide(answers, scv.SCENARIOS[scenario].abstainLabel).answer ?? 'abstain');
      assert.equal(frames[t.at].stage, 'sample');
      assert.equal(frames[t.at].shown, n, 'every sample is in');
      assert.equal(frames[t.at].verdict, null, 'verdict not yet shown');
    }
  }
  // the default word problem: the vote corrects the slips
  assert.equal(scvTurn.buildTurn(scv.simulate(scv.DEFAULT_PARAMS)).answer, '$12');
});

test('semantic-cache: the tune goal is hit exactly at the slider settings with max safe savings', () => {
  for (const stream of Object.keys(sc.STREAMS) as sc.StreamId[]) {
    const best = scTurn.bestSafeSaving(stream);
    // at least as good as the best safe setting the sim's own sweep reports
    const sweep = sc.simulate({ stream, threshold: 0.88 }).find((f) => f.stage === 'sweep')!.sweep!;
    const sweepBest = Math.max(...sweep.filter((s) => s.falseHits === 0).map((s) => s.saved));
    assert.ok(best >= sweepBest - 1e-9);
    let hits = 0;
    for (const threshold of scTurn.THRESHOLDS) {
      const t = scTurn.buildTurn({ stream, threshold });
      const T = sc.totals(sc.run(stream, threshold));
      assert.equal(t.hit, T.falseHits === 0 && Math.abs(T.saved - best) < 1e-9, `${stream} @ ${threshold}`);
      assert.equal(checkTune(t).correct, t.hit);
      if (t.hit) hits++;
    }
    assert.ok(hits >= 1 && hits < scTurn.THRESHOLDS.length, `${stream}: the goal is reachable but not everywhere`);
  }
});

test('speculative-decoding: the k 4 → 8 prediction matches the k-reveal frame', () => {
  for (const cost of spec.COSTS) {
    for (const quality of ['low', 'medium', 'high'] as spec.Quality[]) {
      const params = { ...spec.DEFAULT_PARAMS, cost, quality };
      const frames = spec.simulate(params);
      const t = specTurn.buildTurn(frames, params);
      assertChoice(frames, t);
      assert.equal(frames[t.at].stage, 'k-predict');
      assert.equal(frames[t.at + 1].stage, 'k-reveal');
      const reveal = frames[t.at + 1].caption;
      if (t.answer === 'drops') assert.match(reveal, /^It drops/);
      else assert.match(reveal, /^It barely rises/);
    }
  }
});

test('tool-calling-roundtrip: predicted model-call count / guard stop matches the loop outcome', () => {
  for (const scenario of Object.keys(tcr.SCENARIO_LABELS) as tcr.ScenarioId[]) {
    for (let maxIterations = tcr.MIN_ITER; maxIterations <= tcr.MAX_ITER; maxIterations++) {
      const frames = tcr.simulate({ scenario, maxIterations });
      const t = tcrTurn.buildTurn(frames);
      assertChoice(frames, t);
      assert.equal(frames[t.at].modelCalls, 0, 'asked before request #1');
      assert.equal(frames[t.at + 1].stage, 'request');
      const end = frames[frames.length - 1];
      assert.equal(t.answer, end.outcome === 'stopped' ? 'stopped' : String(end.modelCalls));
      assert.equal(frames.some((f) => f.stage === 'guard'), t.answer === 'stopped');
    }
  }
  // the parallel scenario needs 3 calls, so a cap of 2 trips the guard
  assert.equal(tcrTurn.buildTurn(tcr.simulate({ scenario: 'parallel', maxIterations: 2 })).answer, 'stopped');
});

test('transformer-attention: predicted top token is the softmax argmax, never a masked future token', () => {
  for (const model of ['decoder', 'encoder'] as ta.Model[]) {
    for (let query = 0; query < ta.TOKENS.length; query++) {
      const params = { ...ta.DEFAULT_PARAMS, model, query };
      const frames = ta.simulate(params);
      const t = taTurn.buildTurn(frames, params);
      assertChoice(frames, t);
      assert.ok(t.options.length <= 4);
      assert.equal(frames[t.at].weights, null, 'weights not yet shown');
      const w = frames.find((f) => f.stage === 'softmax')!.weights!;
      assert.equal(Number(t.answer), w.indexOf(Math.max(...w)));
      if (model === 'decoder') assert.ok(Number(t.answer) <= query);
    }
  }
});

test('vector-similarity: predicted #1 is the sim ranking #1, asked before any score', () => {
  for (const query of Object.keys(vs.QUERIES) as vs.QueryId[]) {
    for (const metric of vs.METRICS) {
      for (const normalise of [false, true]) {
        const params = { query, metric, normalise };
        const frames = vs.simulate(params);
        const t = vsTurn.buildTurn(frames, params);
        assertChoice(frames, t);
        assert.ok(t.options.length <= 4);
        assert.ok(frames[t.at].scores.every((s) => s === null));
        assert.equal(t.answer, frames.find((f) => f.stage === 'rank')!.ranking![0]);
      }
    }
  }
});

// --- one shared turn for all widgets: gating and miss counting ---

const Q: ChoiceTurn = {
  kind: 'choice',
  at: 2,
  question: 'Which one?',
  options: [
    { id: 'a', label: 'Apple', why: 'Apples are red.' },
    { id: 'b', label: 'Bee' },
    { id: 'c', label: 'Cat' },
  ],
  answer: 'b',
  why: 'Because.',
  hint: 'It buzzes.',
};

test('gate: a choice turn holds Next/Play only on its frame and only until answered', () => {
  assert.equal(turnShownAt(Q, 2), true);
  assert.equal(turnShownAt(Q, 1), false);
  assert.equal(turnShownAt(undefined, 2), false);
  assert.equal(isHeld(Q, 2, []), true);
  assert.equal(isHeld(Q, 1, []), false);
  assert.equal(isHeld(Q, 2, [turnKey(Q)]), false);
  assert.equal(isHeld(undefined, 0, []), false);
  // a new id (e.g. other params) asks again
  assert.notEqual(turnKey({ ...Q, id: 'x' }), turnKey({ ...Q, id: 'y' }));
  assert.notEqual(turnKey(Q), turnKey({ ...Q, answer: 'c' }));
});

test('gate: a tune turn shows on every frame and never holds, unless pinned to a frame with `at`', () => {
  const t: TuneTurn = { kind: 'tune', question: 'Tune it', hit: false, status: 's1', why: 'w' };
  assert.equal(turnShownAt(t, 0) && turnShownAt(t, 5), true);
  assert.equal(isHeld(t, 5, []), false);
  const pinned = { ...t, at: 3 };
  assert.equal(turnShownAt(pinned, 2), false);
  assert.equal(isHeld(pinned, 3, []), true);
  assert.equal(isHeld(pinned, 3, [turnKey(pinned)]), false);
  // the live status is not part of the key, so misses survive moving the dials
  assert.equal(turnKey(pinned), turnKey({ ...pinned, status: 's2' }));
});

test('misses: wrong picks count once each, the answer ends picking, two misses offer the answer', () => {
  let p = pickOption(Q, [], 'a');
  assert.deepEqual(p, ['a']);
  assert.equal(missCount(Q, p), 1);
  assert.equal(canShowAnswer(missCount(Q, p), false), false);
  p = pickOption(Q, p, 'a'); // repeat ignored
  p = pickOption(Q, p, 'zzz'); // unknown ignored
  assert.deepEqual(p, ['a']);
  p = pickOption(Q, p, 'c');
  assert.equal(missCount(Q, p), 2);
  assert.equal(canShowAnswer(missCount(Q, p), false), true);
  assert.equal(canShowAnswer(missCount(Q, p), true), false);
  p = pickOption(Q, p, 'b');
  assert.deepEqual(p, ['a', 'c', 'b']);
  assert.deepEqual(pickOption(Q, p, 'a'), p, 'no picks after the answer');
  assert.equal(missCount(Q, p), 2);
});

test('missFeedback: the picked option\'s why, then the hint, else a nudge', () => {
  assert.equal(missFeedback(Q, 'a'), 'Apples are red. It buzzes.');
  assert.equal(missFeedback(Q, 'c'), 'It buzzes.');
  assert.equal(missFeedback({ ...Q, hint: undefined }, 'c'), 'Try another option.');
});

test('fromFrameTurn: every sim-frame turn becomes a valid choice turn whose answer is the sim\'s correct option', () => {
  const runs: { frames: { caption: string; yourTurn?: FrameTurn }[] }[] = [
    { frames: mcp.simulate(mcp.DEFAULT_PARAMS) },
    { frames: mcp.simulate({ ...mcp.DEFAULT_PARAMS, outcome: 'toolError' }) },
    { frames: sh.simulate(sh.DEFAULT_PARAMS) },
    { frames: cb.simulate(cb.DEFAULT_PARAMS) },
    { frames: pj.simulate(pj.DEFAULT_PARAMS) },
  ];
  let n = 0;
  for (const { frames } of runs)
    frames.forEach((f, i) => {
      if (!f.yourTurn) return;
      n++;
      const t = fromFrameTurn(f.yourTurn, i);
      assert.equal(t.at, i);
      assert.ok(t.options.length >= 2);
      const right = f.yourTurn.options.find((o) => o.correct)!;
      assert.equal(t.options.find((o) => o.id === t.answer)!.label, right.text);
      assert.equal(t.why, right.why);
      for (const o of t.options) if (o.id !== t.answer) assert.ok(o.why && missFeedback(t, o.id).startsWith(o.why));
    });
  assert.ok(n >= 4, `found ${n} frame turns`);
});
