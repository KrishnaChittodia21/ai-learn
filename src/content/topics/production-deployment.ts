import type { Topic } from '../../types';

const topic: Topic = {
  id: 'production-deployment',
  phase: 'llmops',
  order: 4,
  title: 'Production Deployment, High Availability and Drift Monitoring',
  subtitle:
    'Ship prompt and model changes safely with versioning, canaries and eval gates; stay up across providers and regions; autoscale GPU servers; and catch input, output and provider-model drift before users do.',
  estimatedMinutes: 44,
  sources: [
    'Google SRE Workbook — Canarying releases: https://sre.google/workbook/canarying-releases/',
    'Martin Fowler — BlueGreenDeployment: https://martinfowler.com/bliki/BlueGreenDeployment.html',
    'OpenAI docs — Models (pinned snapshots vs aliases) and deprecations: https://platform.openai.com/docs/deprecations',
    'Anthropic docs — Models overview (model ids, aliases) and model deprecations: https://platform.claude.com/docs/en/about-claude/models/overview',
    'vLLM production stack — Autoscaling with KEDA (vllm:num_requests_waiting): https://docs.vllm.ai/projects/production-stack/en/latest/use_cases/autoscaling-keda.html',
    'llm-d docs — Metrics for autoscaling (queue length primary, KV cache utilisation secondary): https://llm-d.ai/docs/operations/observability/metrics',
    'KEDA docs — Prometheus scaler: https://keda.sh/docs/latest/scalers/prometheus/',
    'Chen, Zaharia, Zou 2023 — How is ChatGPT’s behavior changing over time? (provider model drift): https://arxiv.org/abs/2307.09009',
    'Evidently AI — Embedding drift detection methods: https://www.evidentlyai.com/blog/embedding-drift-detection',
    'Microsoft Learn — Circuit Breaker pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker',
  ],
  tags: ['llmops', 'deployment', 'canary', 'blue-green', 'feature-flags', 'high-availability', 'autoscaling', 'drift', 'monitoring'],
  cheatSheet: [
    'An LLM "release" = code + prompt version + model snapshot + parameters + retrieval index version + tool schemas. Version and log all of them together as one release config.',
    'Pin model snapshots in production (dated ids), never floating aliases; treat a model upgrade as a deploy with evals and a canary.',
    'Blue/green = two full environments, instant switch and rollback; canary = small % of traffic (1% → 5% → 25% → 100%) with automated gates.',
    'Eval gates: offline golden-set score must not drop > X pts; online canary compares error rate, latency, cost/request, thumbs-down and judge scores vs control before promotion.',
    'Feature flags decouple deploy from release: switch prompt/model per tenant or % without redeploying; sticky assignment by hashed user id.',
    'HA for API-based LLMs: multiple regions/deployments and a second provider behind a gateway with health checks, circuit breakers and tested fallbacks with equivalent prompts.',
    'Self-hosted GPU autoscaling: scale on queue depth (vllm:num_requests_waiting) or KV-cache usage, not CPU; cold starts take minutes (image + weights), so keep warm minimum replicas.',
    'Input drift: compare embedding distributions of recent vs reference queries (centroid cosine distance, cluster-share PSI, MMD) and track new-topic clusters.',
    'Output drift: track judge scores, refusal rate, response length, format-validation failure rate, citation rate and user feedback over time and by model version.',
    'Provider drift: log gen_ai.response.model / fingerprints and run a fixed canary prompt set daily; alert on step changes.',
  ],
  sections: [
    {
      heading: 'Production Deployment — versioning, blue/green, canaries with eval gates and feature flags',
      body: `**Intuition:** in normal software, a deploy changes code. In LLM apps, the behaviour also changes when someone edits a prompt, swaps a model snapshot, re-indexes documents or tweaks temperature. Treat all of these as *releases* that need a version, a test and a rollback button.

**Version the whole behaviour.** A release config bundles: prompt template id + version, model snapshot (dated id, not an alias), sampling params, tool schemas, retrieval index/alias version, guardrail policy version. Store it immutably (git or a prompt registry like Langfuse/LangSmith) and stamp its id on every trace.

**Rollout strategies**
| Strategy | How | Use for |
|---|---|---|
| Blue/green | two complete environments; flip the router | infra, runtime, index cutovers; instant rollback |
| Canary | 1% → 5% → 25% → 100% with automated checks at each step | prompt/model changes with unknown impact |
| Shadow | send a copy of traffic to the new version, discard output, compare offline | risky model swaps, no user exposure |
| Feature flag | per-tenant/% targeting at runtime | gradual enablement, kill switches |

**Eval gates.** (1) *Offline*: the golden set (task success, faithfulness, format validity) must not regress beyond a tolerance; run in CI on every prompt/model PR. (2) *Online canary*: compare canary vs control on error rate, p95 latency, cost/request, thumbs-down, judge scores. Promote only if all guardrail metrics pass; auto-rollback otherwise.

**Sticky assignment:** hash(user id) → bucket, so one user does not flip between versions mid-conversation.

**When to use:** every prompt or model change, including "tiny" wording edits.`,
      example: `Prompt v15 for a support bot (shorter, adds a refund rule).
- CI eval on 600 golden cases: resolution 84.1% → 85.0%, faithfulness 0.93 → 0.92 (tolerance −0.02 ✓), JSON validity 99.8% ✓.
- Canary 5% for 24 h (≈ 9,000 conversations): thumbs-down 3.9% vs 3.6% control (difference within noise), cost/request −11%, p95 latency −300 ms. Promote to 25%.
- At 25%, a gate fails: escalation-to-human rose from 7.0% to 9.4% (p < 0.01) for the "billing" intent. Automated rollback to v14 in 40 s via flag.
- Root cause: the new refund rule made the bot defer billing questions. Fixed in v16, which passed both gates.`,
      diagram: `PR: prompt v15 ─▶ CI offline evals (golden set) ── fail ─▶ block merge
                         │ pass
                         ▼
        release config r42 {prompt v15, model snapshot, params, index v9}
                         ▼
   flag: 5% ─▶ 25% ─▶ 50% ─▶ 100%     (sticky by hash(user_id))
     │ each step: canary vs control
     │ errors, p95, cost/req, 👎 rate, judge score, escalations
     └── any gate fails ─▶ auto-rollback to r41 (flag flip, seconds)`,
      code: [
        {
          language: 'typescript',
          title: 'release.ts — versioned release configs, sticky canary assignment and an automated promotion gate',
          code: `import { createHash } from 'node:crypto';

type Release = { id: string; promptVersion: string; model: string; temperature: number; indexAlias: string };

const RELEASES: Record<string, Release> = {
  r41: { id: 'r41', promptVersion: 'support-v14', model: 'gpt-4.1-mini-2025-04-14', temperature: 0.2, indexAlias: 'kb_v9' },
  r42: { id: 'r42', promptVersion: 'support-v15', model: 'gpt-4.1-mini-2025-04-14', temperature: 0.2, indexAlias: 'kb_v9' },
};
// In production this comes from a flag service; editable at runtime without a deploy
let rollout = { stable: 'r41', canary: 'r42', canaryPercent: 5 };

export function releaseFor(userId: string): Release {
  // sticky: the same user always lands in the same bucket (0..9999)
  const bucket = parseInt(createHash('sha256').update(userId).digest('hex').slice(0, 8), 16) % 10_000;
  const id = bucket < rollout.canaryPercent * 100 ? rollout.canary : rollout.stable;
  return RELEASES[id]; // stamp release.id on every trace span
}

type Stats = { n: number; errorRate: number; p95Ms: number; costPerReq: number; thumbsDownRate: number; judge: number };

// Promotion gate: canary must not be meaningfully worse than control on any guardrail metric
export function gate(control: Stats, canary: Stats): { promote: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (canary.n < 2_000) reasons.push('not enough traffic yet');
  if (canary.errorRate > control.errorRate + 0.005) reasons.push('error rate');
  if (canary.p95Ms > control.p95Ms * 1.1) reasons.push('p95 latency +10%');
  if (canary.costPerReq > control.costPerReq * 1.15) reasons.push('cost/request +15%');
  if (canary.thumbsDownRate > control.thumbsDownRate * 1.2) reasons.push('thumbs-down +20%');
  if (canary.judge < control.judge - 0.02) reasons.push('judge score');
  return { promote: reasons.length === 0, reasons };
}

export function step(control: Stats, canary: Stats) {
  const g = gate(control, canary);
  if (g.promote) rollout = { ...rollout, canaryPercent: Math.min(100, rollout.canaryPercent * 5) };
  else if (!g.reasons.includes('not enough traffic yet')) rollout = { ...rollout, canaryPercent: 0 }; // rollback
  return { rollout, ...g };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Every behaviour change is attributable: traces carry the release id, so regressions map to one change.',
          'Canaries with gates limit the blast radius of a bad prompt to a few percent of users for a few hours.',
          'Flags allow instant rollback and per-tenant rollout without redeploying.',
        ],
        cons: [
          {
            con: 'LLM quality metrics are noisy, so small canaries cannot detect small regressions.',
            fix: 'Combine strong offline evals (paired comparisons on the golden set) with longer or larger canary stages, and use statistical tests with minimum sample sizes before promotion.',
          },
          {
            con: 'Prompts edited in a UI bypass code review and CI.',
            fix: 'Use a prompt registry with versions and labels (staging/production), require evals to pass before a version can be labelled production, and log the version on every trace.',
          },
          {
            con: 'Users see inconsistent behaviour if they bounce between versions mid-conversation.',
            fix: 'Sticky assignment by hashed user or conversation id, and pin the release id for the lifetime of a conversation.',
          },
        ],
      },
      keyPoints: [
        'Release = prompt + model snapshot + params + tools + index + guardrails, versioned together.',
        'Pin snapshots; upgrades are deploys.',
        'Offline eval gate in CI, online canary gate in production.',
        'Sticky flags for gradual rollout and instant rollback.',
      ],
      exercise: {
        prompt: `Write \`assign(userId, experiments)\` where experiments is \`{ name: string; variants: { id: string; weight: number }[] }\`. Return the variant id deterministically from \`sha256(name + ':' + userId)\` so the same user always gets the same variant for an experiment, but different experiments are independent. Acceptance: weights 95/5 give ≈5% (±0.5%) on 100,000 synthetic users; repeated calls for the same user return the same id.`,
        hints: [
          'Take the first 8 hex chars of the hash as an integer and mod 10,000 to get a bucket.',
          'Walk cumulative weights (scaled to 10,000) until the bucket falls inside.',
          'Salting with the experiment name decorrelates experiments.',
        ],
        solution: {
          language: 'typescript',
          code: `import { createHash } from 'node:crypto';

type Experiment = { name: string; variants: { id: string; weight: number }[] };

export function assign(userId: string, exp: Experiment): string {
  const h = createHash('sha256').update(exp.name + ':' + userId).digest('hex');
  const bucket = parseInt(h.slice(0, 8), 16) % 10_000;
  const total = exp.variants.reduce((s, v) => s + v.weight, 0);
  let acc = 0;
  for (const v of exp.variants) {
    acc += (v.weight / total) * 10_000;
    if (bucket < acc) return v.id;
  }
  return exp.variants[exp.variants.length - 1].id;
}

const exp = { name: 'prompt-v15-canary', variants: [{ id: 'control', weight: 95 }, { id: 'canary', weight: 5 }] };
let canary = 0;
for (let i = 0; i < 100_000; i++) if (assign('user-' + i, exp) === 'canary') canary++;
console.log((canary / 1000).toFixed(2) + '%'); // ≈ 5.00%
console.log(assign('user-42', exp) === assign('user-42', exp)); // true`,
        },
        explanation:
          'Hash-based bucketing needs no stored state, is stable across pods and restarts, and salting by experiment name prevents the same 5% of users being canaries in every experiment. Increasing the canary weight from 5 to 25 keeps the original canary users in the canary group, so nobody flips back.',
      },
      quickCheck: {
        question:
          'Production calls a model alias that points to "latest". What is the main deployment risk?',
        options: [
          'Higher latency because aliases need an extra lookup',
          'The provider can change the underlying model without any deploy on your side, bypassing your evals and canary',
          'Aliases are not supported by streaming',
          'Aliases always cost more per token',
        ],
        correct: 1,
        explanation:
          'An alias moves when the provider releases a new snapshot, so behaviour changes without passing your gates. Pin dated snapshot ids in production and upgrade deliberately through the same eval and canary process as any other release.',
      },
      source: 'Google SRE Workbook — Canarying releases',
    },
    {
      heading: 'Scalability and High Availability — multi-provider failover, regions and GPU autoscaling',
      body: `**Intuition:** depending on one LLM endpoint is like a shop with one supplier. When the supplier has a bad day, so do you. High availability means having a second (and third) supplier ready, knowing when to switch, and having already tested that the backup product is good enough.

**API-based models**
- **Gateway layer** (LiteLLM, Portkey, Envoy AI Gateway or your own) routes each request to a deployment: provider × region × model.
- **Health signals:** error rate, 429/529 rate, p95 TTFT per deployment over a sliding window.
- **Circuit breaker:** closed → open after e.g. 50% errors in 30 s (stop sending) → half-open probes after 60 s → closed on success.
- **Fallback chain:** same model in another region → equivalent model at another provider (with a prompt variant tuned and evaluated for it) → smaller/cheaper model → graceful degradation (cached answer, search results only, "try again" message).
- **Budget the failover:** capacity at the fallback must absorb the traffic (quotas, TPM).

**Self-hosted models (vLLM, TGI, SGLang on GPUs)**
- Scale on **queue depth** (\`vllm:num_requests_waiting\`) and KV-cache utilisation, not CPU; GPU utilisation is near 100% whenever any batch runs.
- **Cold start** is minutes (pull a 20+ GB image, load weights, warm up), so keep \`minReplicas\` ≥ 2 across zones, pre-pull images, and scale out early (low thresholds, fast polling, slow scale-in).
- Spread replicas across zones; keep a hosted-API fallback for regional GPU shortages.

**Stateless app tier:** conversation state in a DB/Redis, not in pod memory, so any replica or region can serve the next turn.

**When to use:** anything user-facing with an availability SLO above ~99.5%; single-provider setups rarely exceed the provider's own availability.`,
      example: `Primary: model A in region us-east (provider P1). Fallbacks: same model in eu-west (P1), then equivalent model B at provider P2 with prompt variant v15-b (eval score 0.91 vs 0.93 on primary).
- 14:02 P1 us-east returns 529 overloaded on 62% of calls. Breaker opens at 14:02:30; traffic shifts to eu-west (+90 ms latency).
- 14:10 eu-west 429s rise (quota 60% of total traffic). Gateway spills 35% of traffic to P2.
- User-visible error rate peaks at 1.8% for 30 s instead of ~60% for the 47-minute incident.
- Self-hosted reranker: queue waiting > 5 per pod triggers KEDA scale-out from 2 → 6 GPU pods; new pods ready after ~4 min (weights pre-cached on node SSD), p95 rerank latency back under 200 ms by 14:09.`,
      diagram: `            ┌──────────── LLM gateway ────────────┐
request ──▶ │ health window + circuit breakers    │
            └──┬──────────────┬───────────────┬───┘
         closed│      open?   │ spill          │ last resort
               ▼              ▼                ▼
       P1 us-east (A)   P1 eu-west (A)   P2 (model B, prompt v15-b)
                                               │ all down
                                               ▼
                               degrade: cached answer / search-only
self-hosted: KEDA ── vllm:num_requests_waiting > 5 ──▶ add GPU pods
             minReplicas 2 (2 zones), scale-in cooldown 10 min`,
      code: [
        {
          language: 'typescript',
          title: 'failover.ts — circuit breakers and an ordered fallback chain across providers/regions',
          code: `type Deployment = { name: string; call: (prompt: string, signal: AbortSignal) => Promise<string> };

class Breaker {
  private failures: number[] = [];
  private openedAt = 0;
  constructor(private threshold = 5, private windowMs = 30_000, private coolMs = 60_000) {}
  canTry(now = Date.now()) {
    if (!this.openedAt) return true;
    if (now - this.openedAt <= this.coolMs) return false;
    this.openedAt = now; // half-open: let ONE probe through, re-arm the timer for everyone else
    return true;
  }
  success() { this.failures = []; this.openedAt = 0; }
  failure(now = Date.now()) {
    this.failures = this.failures.filter((t) => now - t < this.windowMs).concat(now);
    // open on too many failures, or re-open at once if a half-open probe fails
    if (this.openedAt || this.failures.length >= this.threshold) this.openedAt = now;
  }
}

export class Gateway {
  private breakers = new Map<string, Breaker>();
  constructor(private chain: Deployment[]) {
    for (const d of chain) this.breakers.set(d.name, new Breaker());
  }
  async complete(prompt: string, deadlineMs = 25_000): Promise<{ text: string; servedBy: string }> {
    const start = Date.now();
    for (const d of this.chain) {
      const b = this.breakers.get(d.name)!;
      if (!b.canTry()) continue; // skip open circuits instantly
      const remaining = deadlineMs - (Date.now() - start);
      if (remaining < 2_000) break; // not enough time for another attempt
      try {
        const text = await d.call(prompt, AbortSignal.timeout(Math.min(remaining, 15_000)));
        b.success();
        return { text, servedBy: d.name }; // record servedBy on the trace
      } catch (err: any) {
        if (err?.status && err.status < 500 && err.status !== 429 && err.status !== 408) throw err; // caller bug: do not fail over
        b.failure();
      }
    }
    throw new Error('all deployments unavailable'); // caller degrades gracefully
  }
}

// const gw = new Gateway([p1UsEast, p1EuWest, p2ModelB]);  each wraps its own SDK + prompt variant`,
        },
        {
          language: 'yaml',
          title: 'keda-vllm.yaml — scale vLLM pods on queue depth',
          code: `apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vllm-reranker
spec:
  scaleTargetRef:
    name: vllm-reranker          # Deployment running vLLM
  minReplicaCount: 2             # warm capacity across 2 zones (cold start is minutes)
  maxReplicaCount: 12
  pollingInterval: 15
  cooldownPeriod: 600            # scale in slowly
  triggers:
    - type: prometheus
      metadata:
        serverAddress: http://prometheus.monitoring:9090
        query: sum(vllm:num_requests_waiting{model_name="reranker"})
        threshold: "5"           # target waiting requests per replica`,
        },
      ],
      prosCons: {
        pros: [
          'Survives provider and regional incidents with seconds of disruption instead of hours.',
          'Circuit breakers stop wasting latency and quota on a failing deployment.',
          'Queue-based autoscaling matches GPU capacity to real demand rather than misleading CPU metrics.',
        ],
        cons: [
          {
            con: 'Fallback models behave differently, so failover can silently degrade quality or break output formats.',
            fix: 'Maintain an evaluated prompt variant per fallback model, run the golden set against every fallback regularly, and validate structured outputs with schemas.',
          },
          {
            con: 'Fallback paths that are never exercised break when needed (expired keys, no quota, schema drift).',
            fix: 'Send a small steady share (1–2%) of traffic or synthetic probes through each fallback and run game-day failover drills.',
          },
          {
            con: 'GPU cold starts take minutes, so autoscaling reacts too late to spikes.',
            fix: 'Keep warm minimum replicas, pre-pull images and cache weights on local disk, scale on leading signals (queue depth) with low thresholds, and burst to a hosted API while pods start.',
          },
          {
            con: 'Data residency rules may forbid routing to another region or provider.',
            fix: 'Encode residency per tenant in the gateway routing policy, and pick fallbacks within the allowed jurisdiction.',
          },
        ],
      },
      keyPoints: [
        'Gateway + health windows + circuit breakers + ordered fallback chain.',
        'Every fallback needs its own evaluated prompt variant and quota.',
        'Scale GPU servers on queue depth/KV cache, keep warm replicas.',
        'Stateless app tier; conversation state external.',
      ],
      exercise: {
        prompt: `Compute the availability of a fallback chain. Write \`chainAvailability(avails: number[])\` assuming independent failures: the request fails only if all deployments are down. Then write \`requiredSecondary(primary, target)\` returning the minimum availability of a single independent fallback needed to reach the target. Acceptance: [0.995, 0.995] → 0.999975; requiredSecondary(0.99, 0.9999) → 0.99.`,
        hints: [
          'P(all down) = Π (1 − a_i).',
          'Availability = 1 − P(all down).',
          'Solve 1 − (1 − p)(1 − s) ≥ target for s.',
        ],
        solution: {
          language: 'typescript',
          code: `export function chainAvailability(avails: number[]): number {
  const allDown = avails.reduce((p, a) => p * (1 - a), 1);
  return Number((1 - allDown).toFixed(8));
}

export function requiredSecondary(primary: number, target: number): number {
  // 1 - (1 - p)(1 - s) >= target  =>  s >= 1 - (1 - target) / (1 - p)
  const s = 1 - (1 - target) / (1 - primary);
  return Number(Math.max(0, s).toFixed(6));
}

console.log(chainAvailability([0.995, 0.995])); // 0.999975
console.log(requiredSecondary(0.99, 0.9999)); // 0.99`,
        },
        explanation:
          'Independent fallbacks multiply failure probabilities, which is why two 99.5% deployments give ~99.997%. The independence assumption is the catch: two regions of the same provider often fail together (shared control plane, same model rollout), so cross-provider fallbacks give more real-world independence.',
      },
      quickCheck: {
        question:
          'A vLLM deployment autoscales on CPU utilisation and never scales out, although p95 TTFT climbs to 9 s at peak. Why?',
        options: [
          'vLLM does not support horizontal scaling',
          'Inference load is on the GPU and in the request queue; CPU stays low while requests wait, so the metric never crosses its threshold',
          'Autoscaling only works for stateless HTTP services',
          'TTFT is unaffected by replica count',
        ],
        correct: 1,
        explanation:
          'LLM serving is GPU- and memory-bound; CPU utilisation barely moves. Requests pile up in the scheduler queue, which is exactly what vllm:num_requests_waiting measures. Scale on queue depth (and KV-cache pressure) instead.',
      },
      source: 'vLLM production stack — Autoscaling with KEDA; Microsoft — Circuit Breaker pattern',
    },
    {
      heading: 'Model Drift Monitoring — input drift, output quality drift and provider model updates',
      body: `**Intuition:** your app was tuned for the questions and model of launch day. Over time users ask new things (input drift), answers slowly get worse or change style (output drift), and the provider may update the model underneath you (provider drift). Drift monitoring is a smoke detector for all three.

**1. Input drift** — are users asking different things?
- Embed queries (you already do for retrieval). Compare a recent window to a reference window: **centroid cosine distance**, **MMD**, or cluster the reference set (k-means, k≈20–50) and compute **PSI** on cluster shares. PSI < 0.1 stable, 0.1–0.25 moderate, > 0.25 significant.
- Watch **unmatched queries**: share of queries whose nearest reference centroid is far away (new topics), and retrieval signals (top-1 score falling, "no relevant docs" rate rising).

**2. Output quality drift** — are answers getting worse?
- Online LLM-as-judge on a 1–5% sample (faithfulness, relevance), user feedback rate, refusal rate, response length, schema-validation failures, citation rate, escalation-to-human rate. Plot by day and by release id.

**3. Provider/model drift** — did the model change?
- Log \`gen_ai.response.model\` and system fingerprints; run a fixed **canary prompt set** daily at temperature 0 and compare outputs (judge score, length, embedding similarity to yesterday's answers).

**Responding:** drift is a signal, not a verdict. Triage: new topic → add documents and golden cases; quality drop → find the release/index/provider change; provider change → pin snapshot or re-tune prompts.

**When to use:** any long-lived production assistant; review weekly, alert on large shifts.`,
      example: `HR assistant, reference = March queries (40 clusters).
- September PSI on cluster shares = 0.31 (significant). Two clusters drive it: "return-to-office policy" grew from 1.2% → 9.8% of traffic; a new cluster of "AI tool usage policy" queries (7% of traffic) sits 0.42 cosine distance from any reference centroid.
- Retrieval top-1 score for those queries: median 0.48 vs 0.71 overall; thumbs-down 14% vs 4%.
- Action: the AI-usage policy was never ingested. After adding it and 30 golden cases, thumbs-down for the cluster fell to 5%.
Separately, the daily canary prompt set run against the provider alias showed answer length +38% overnight and a new \`gen_ai.response.model\` value; production was pinned to the old snapshot and unaffected, and the team evaluated the new snapshot before adopting it.`,
      diagram: `            reference window (e.g. launch month)
                 │ embed → k-means (k=40) → shares p_i
recent window ───┤ embed → assign to nearest centroid → shares q_i
                 ▼
   PSI = Σ (q_i − p_i) · ln(q_i / p_i)      >0.25 ⇒ alert
   far-from-any-centroid share ↑          ⇒ new topic
outputs ─▶ judge score, refusals, length, schema fails, 👎 (by release)
canary prompts daily @ temp 0 ─▶ diff vs yesterday ─▶ provider drift?`,
      code: [
        {
          language: 'typescript',
          title: 'drift.ts — PSI over cluster shares and centroid shift for query embeddings',
          code: `type Vec = number[];
const dot = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a: Vec) => Math.sqrt(dot(a, a));
const cosine = (a: Vec, b: Vec) => dot(a, b) / (norm(a) * norm(b));

function mean(vs: Vec[]): Vec {
  const m = new Array(vs[0].length).fill(0);
  for (const v of vs) v.forEach((x, i) => (m[i] += x / vs.length));
  return m;
}

// Assign each embedding to its nearest reference centroid (centroids from k-means on the reference window)
function shares(embs: Vec[], centroids: Vec[]) {
  const counts = new Array(centroids.length).fill(0);
  let far = 0;
  for (const e of embs) {
    let best = -1, bestSim = -Infinity;
    centroids.forEach((c, i) => { const s = cosine(e, c); if (s > bestSim) { bestSim = s; best = i; } });
    counts[best]++;
    if (bestSim < 0.6) far++; // "doesn't look like anything we saw before" (tune per embedding model)
  }
  return { p: counts.map((c) => c / embs.length), farShare: far / embs.length };
}

export function driftReport(reference: Vec[], recent: Vec[], centroids: Vec[]) {
  const eps = 1e-4; // avoid log(0) for empty clusters
  const ref = shares(reference, centroids);
  const cur = shares(recent, centroids);
  const psi = ref.p.reduce((s, p, i) => {
    const q = cur.p[i];
    return s + (q + eps - (p + eps)) * Math.log((q + eps) / (p + eps));
  }, 0);
  return {
    psi: Number(psi.toFixed(3)), // <0.1 stable, 0.1-0.25 moderate, >0.25 significant
    centroidShift: Number((1 - cosine(mean(reference), mean(recent))).toFixed(4)),
    newTopicShare: cur.farShare,
    topMovers: cur.p.map((q, i) => ({ cluster: i, delta: q - ref.p[i] })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3),
  };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Detects new user needs (topics with no documents) before they show up as churn.',
          'Separates "users changed" from "model changed" from "our release changed", which drives the right fix.',
          'Uses embeddings you already compute for retrieval, so input drift is cheap to monitor.',
        ],
        cons: [
          {
            con: 'Statistical drift is not the same as harm: seasonal topics trigger alerts without any quality problem.',
            fix: 'Alert on drift combined with a quality signal (judge score, feedback, retrieval score) and compare against the same period last year or a rolling baseline.',
          },
          {
            con: 'Changing the embedding model invalidates the reference distribution.',
            fix: 'Version the embedding model with the reference set and recompute reference clusters whenever embeddings change.',
          },
          {
            con: 'Online LLM judges drift too (they are models) and add cost.',
            fix: 'Pin the judge model snapshot, calibrate it against a small human-labelled set monthly, and sample only 1–5% of traffic.',
          },
        ],
      },
      keyPoints: [
        'Three drifts: input (queries), output (quality/behaviour), provider (model updates).',
        'Input drift: embedding clusters + PSI, centroid shift, far-from-reference share.',
        'Output drift: judge scores, feedback, refusals, length, schema failures by release.',
        'Provider drift: log served model ids and run daily canary prompts.',
      ],
      exercise: {
        prompt: `Implement \`psi(refShares, curShares)\` with epsilon smoothing (1e-4) and \`classify(psi)\` returning "stable" (< 0.1), "moderate" (0.1–0.25) or "significant" (> 0.25). Acceptance: ref [0.5, 0.3, 0.2] vs cur [0.5, 0.3, 0.2] → 0 / stable; ref [0.5, 0.3, 0.2] vs cur [0.2, 0.3, 0.5] → ≈ 0.55 / significant.`,
        hints: [
          'PSI = Σ (q − p) × ln(q / p).',
          'Add epsilon to both p and q before the log.',
          'Each term is non-negative, so PSI ≥ 0.',
        ],
        solution: {
          language: 'typescript',
          code: `export function psi(ref: number[], cur: number[], eps = 1e-4): number {
  if (ref.length !== cur.length) throw new Error('bucket count mismatch');
  let total = 0;
  for (let i = 0; i < ref.length; i++) {
    const p = ref[i] + eps;
    const q = cur[i] + eps;
    total += (q - p) * Math.log(q / p);
  }
  return Number(total.toFixed(4));
}

export function classify(v: number): 'stable' | 'moderate' | 'significant' {
  if (v < 0.1) return 'stable';
  if (v <= 0.25) return 'moderate';
  return 'significant';
}

const a = psi([0.5, 0.3, 0.2], [0.5, 0.3, 0.2]);
const b = psi([0.5, 0.3, 0.2], [0.2, 0.3, 0.5]);
console.log(a, classify(a)); // 0 'stable'
console.log(b, classify(b)); // ~0.5497 'significant'`,
        },
        explanation:
          '(0.2 − 0.5) × ln(0.2/0.5) = 0.275 and (0.5 − 0.2) × ln(0.5/0.2) = 0.275, so PSI ≈ 0.55. Swapping two clusters’ shares is a big behavioural change even though the set of topics is the same. Epsilon smoothing avoids infinite values when a cluster is empty in one window.',
      },
      quickCheck: {
        question:
          'Input-drift PSI jumped to 0.35, but judge scores, feedback and retrieval scores are unchanged. What is the best response?',
        options: [
          'Roll back the latest release immediately',
          'Investigate which clusters moved (e.g. seasonal topics), add golden cases for growing clusters, but no emergency action is needed',
          'Retrain the embedding model',
          'Disable the assistant until PSI returns below 0.1',
        ],
        correct: 1,
        explanation:
          'Drift shows the traffic mix changed, not that quality dropped. With stable quality signals, the system handles the new mix; you still examine the movers and extend evals so future regressions in those topics are caught. Rollbacks and shutdowns respond to harm, which is not evidenced here.',
      },
      source: 'Chen, Zaharia, Zou 2023 — How is ChatGPT’s behavior changing over time?',
    },
  ],
  codeChallenges: [
    {
      id: 'production-deployment-cc-1',
      title: 'From hard-coded prompt edits to versioned, gated releases',
      context:
        'Prompts live as string constants; engineers edit them and deploy straight to 100% of traffic. Last month a one-word change doubled refusals for a day before anyone noticed, and nobody could tell which traces used which prompt.',
      task: 'Introduce versioned release configs, pin the model snapshot, stamp the release id on traces, add an offline eval gate for CI and a percentage rollout with sticky assignment.',
      starter: {
        language: 'typescript',
        code: `const SYSTEM = 'You are a helpful assistant for Acme. Never discuss pricing.';

export async function reply(userId: string, msg: string) {
  return openai.chat.completions.create({
    model: 'gpt-4.1-mini', // alias
    temperature: 0.7,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: msg }],
  });
}`,
      },
      hints: [
        'Represent a release as data: { id, systemPrompt, model snapshot, temperature }.',
        'Pick the release per user with a hashed bucket and a canary percentage from config/flags.',
        'Write a CI script that runs the golden set for the candidate release and fails if the score drops by more than a tolerance.',
      ],
      solution: {
        language: 'typescript',
        code: `import { createHash } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import OpenAI from 'openai';

const openai = new OpenAI();
type Release = { id: string; system: string; model: string; temperature: number };

// releases.json in git (or a prompt registry); immutable once published
const RELEASES: Record<string, Release> = {
  'r7': { id: 'r7', system: 'You are a helpful assistant for Acme. Never discuss pricing.', model: 'gpt-4.1-mini-2025-04-14', temperature: 0.3 },
  'r8': { id: 'r8', system: 'You are Acme’s assistant. For pricing, link to /pricing instead of quoting.', model: 'gpt-4.1-mini-2025-04-14', temperature: 0.3 },
};
const ROLLOUT = { stable: process.env.STABLE_RELEASE ?? 'r7', canary: process.env.CANARY_RELEASE ?? 'r8', pct: Number(process.env.CANARY_PCT ?? 5) };

function pick(userId: string): Release {
  const b = parseInt(createHash('sha256').update('rollout:' + userId).digest('hex').slice(0, 8), 16) % 100;
  return RELEASES[b < ROLLOUT.pct ? ROLLOUT.canary : ROLLOUT.stable];
}

export async function reply(userId: string, msg: string) {
  const rel = pick(userId);
  trace.getActiveSpan()?.setAttributes({ 'app.release.id': rel.id, 'gen_ai.request.model': rel.model });
  return openai.chat.completions.create({
    model: rel.model, // pinned snapshot, not an alias
    temperature: rel.temperature,
    messages: [{ role: 'system', content: rel.system }, { role: 'user', content: msg }],
  });
}

// ci/eval-gate.ts — run on every PR touching releases.json
export async function evalGate(candidate: Release, baseline: Release, golden: { input: string; check: (out: string) => boolean }[]) {
  const score = async (r: Release) => {
    let pass = 0;
    for (const g of golden) {
      const res = await openai.chat.completions.create({ model: r.model, temperature: 0, messages: [{ role: 'system', content: r.system }, { role: 'user', content: g.input }] });
      if (g.check(res.choices[0].message.content ?? '')) pass++;
    }
    return pass / golden.length;
  };
  const [b, c] = await Promise.all([score(baseline), score(candidate)]);
  if (c < b - 0.02) throw new Error('Eval gate failed: ' + c.toFixed(3) + ' vs baseline ' + b.toFixed(3));
  return { baseline: b, candidate: c };
}`,
      },
      explanation:
        'The release becomes data with an id, so every trace shows exactly which prompt/model/params produced it. The model is pinned to a dated snapshot so provider updates cannot bypass review. The CI gate compares candidate vs baseline on the same golden set and blocks regressions; the canary percentage is runtime config, so rollout and rollback need no code deploy.',
      followUps: [
        {
          q: 'Golden-set checks with temperature 0 still vary between runs. How do you make the gate robust?',
          a: 'Run each case several times or use a larger set, compare paired results case by case, use a tolerance band derived from the run-to-run variance of the baseline, and combine rule checks with a pinned LLM judge.',
        },
        {
          q: 'How do you handle a conversation that started on r7 when r8 is promoted to 100%?',
          a: 'Store the release id on the conversation and keep using it until the conversation ends (or for a grace period), so behaviour does not change mid-thread.',
        },
      ],
    },
    {
      id: 'production-deployment-cc-2',
      title: 'Fix a fallback that makes outages worse',
      context:
        'During a provider incident the app’s error rate went from 30% to 100% and latency hit 60 s. The fallback code below was supposed to help.',
      task: 'Rewrite it with a deadline, per-attempt timeouts, circuit breakers so failing deployments are skipped, error classification, and a fallback prompt per model.',
      starter: {
        language: 'typescript',
        code: `export async function answer(q: string) {
  try {
    return await primary.chat(q); // default SDK timeout 10 min, 2 retries
  } catch {
    try {
      return await secondary.chat(q); // different provider, same prompt
    } catch {
      return await primary.chat(q); // try again
    }
  }
}`,
      },
      hints: [
        'Each attempt needs a timeout that fits inside an overall request deadline.',
        'Remember recent failures per deployment and skip it while its circuit is open.',
        'Do not fail over on 4xx caused by your request; do use a prompt variant designed for the fallback model.',
      ],
      solution: {
        language: 'typescript',
        code: `type Dep = { name: string; prompt: (q: string) => string; chat: (p: string, signal: AbortSignal) => Promise<string> };

const state = new Map<string, { fails: number[]; openUntil: number }>();
function isOpen(n: string) {
  const s = state.get(n);
  if (!s || !s.openUntil) return false;
  if (s.openUntil > Date.now()) return true;
  s.openUntil = Date.now() + 60_000; // half-open: this caller is the single probe, others keep skipping
  return false;
}
function record(n: string, ok: boolean) {
  const s = state.get(n) ?? { fails: [], openUntil: 0 };
  if (ok) { s.fails = []; s.openUntil = 0; }
  else {
    const now = Date.now();
    s.fails = s.fails.filter((t) => now - t < 30_000).concat(now);
    if (s.openUntil || s.fails.length >= 5) s.openUntil = now + 60_000; // open for 60 s; a failed probe re-opens at once
  }
  state.set(n, s);
}

export async function answer(q: string, chain: Dep[], deadlineMs = 20_000): Promise<{ text: string; servedBy: string }> {
  const start = Date.now();
  for (const d of chain) {
    if (isOpen(d.name)) continue;
    const left = deadlineMs - (Date.now() - start);
    if (left < 1_500) break;
    try {
      const text = await d.chat(d.prompt(q), AbortSignal.timeout(Math.min(left, 12_000)));
      record(d.name, true);
      return { text, servedBy: d.name };
    } catch (e: any) {
      const s = e?.status as number | undefined;
      if (s && s >= 400 && s < 500 && s !== 408 && s !== 429) throw e; // our bug, not an outage
      record(d.name, false);
    }
  }
  return { text: 'We are having trouble answering right now. Please try again shortly.', servedBy: 'degraded' };
}`,
      },
      explanation:
        'The original waited up to the SDK default timeout (with hidden retries) on a dead primary, then retried the same dead primary, so every request burned up to minutes and added load to the failing provider. The rewrite bounds total time with a deadline, gives each attempt a timeout, skips deployments with open circuits instantly, does not mask client bugs as outages, sends a model-specific prompt to the fallback and degrades gracefully when everything is down.',
      followUps: [
        {
          q: 'Breaker state here is per process. Is that a problem with 50 pods?',
          a: 'Each pod learns independently, which costs a few failed requests per pod but avoids a shared dependency; for faster convergence share health in Redis or let the gateway tier hold breaker state centrally.',
        },
        {
          q: 'How do you verify the fallback prompt is good enough before an incident?',
          a: 'Run the golden eval suite against every chain entry with its own prompt on each release, and route a small percentage of live traffic through fallbacks so they stay exercised.',
        },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'production-deployment-iq-1',
      difficulty: 'hard',
      question: 'How do you safely roll out a new model snapshot (e.g. upgrading the main chat model) for an assistant used by 2M users?',
      whatInterviewerLooksFor: [
        'Treats model upgrade as a release with offline evals first',
        'Prompt re-tuning and format validation for the new model',
        'Shadow and canary stages with clear guardrail metrics',
        'Cost and latency comparison, rollback plan, deprecation timeline',
      ],
      modelAnswer: `**1. Offline.** Run the full golden set (task success, faithfulness, safety, structured-output validity, tool-call accuracy) on the new snapshot with the current prompt, then with a tuned prompt variant. Compare cost per task (token usage, reasoning tokens) and latency. Look at per-segment results: languages, intents, top tenants.

**2. Shadow.** Mirror 5–10% of production requests to the new model, discard outputs, and judge pairs (old vs new) with a pinned LLM judge plus rules. Catches distribution-specific regressions the golden set misses, with zero user impact.

**3. Canary.** Sticky 1% → 5% → 25% → 50% → 100%, each stage at least 24 h or N conversations. Guardrail metrics vs control: error/timeout rate, p95 TTFT, cost/request, thumbs-down, escalation rate, refusal rate, schema failures. Automated rollback if any breach.

**4. Release hygiene.** The new snapshot is a new release config id; traces carry it. Keep the old snapshot pinned as instant rollback target until the provider's deprecation date. Update fallback prompts, the cost model and the judge calibration.

**5. Communicate.** Enterprise tenants may need notice or opt-in when behaviour changes (style, length, refusals).

Typical timeline: 1 week offline + shadow, 1–2 weeks canary.`,
      followUps: [
        {
          q: 'Offline evals improved but canary thumbs-down rose. Which do you trust?',
          a: 'The canary: it reflects real users and traffic mix. Investigate the gap (segments missing from the golden set, style changes users dislike), add those cases to the golden set, and only promote once both agree.',
        },
        {
          q: 'The old snapshot is deprecated in 3 weeks and the new one regresses on one intent. Options?',
          a: 'Ship the new model with a prompt fix or a route sending that intent to an alternative model, accept a documented temporary regression, and prioritise golden cases for it; doing nothing ends in a forced migration.',
        },
      ],
      pitfalls: [
        'Swapping the model id in config and deploying to 100%',
        'Evaluating only average scores, missing segment regressions',
        'Forgetting that prompts tuned for the old model may need changes',
      ],
    },
    {
      id: 'production-deployment-iq-2',
      difficulty: 'expert',
      question: 'Design a highly available LLM serving layer for a product with a 99.95% availability SLO that uses both hosted APIs and self-hosted open models.',
      whatInterviewerLooksFor: [
        'Availability maths and the independence problem',
        'Gateway with health-based routing, breakers and fallbacks across providers/regions',
        'Self-hosted capacity planning: zones, warm replicas, autoscaling signals, cold starts',
        'Degradation modes and testing (game days)',
      ],
      modelAnswer: `**Budget.** 99.95% ≈ 22 minutes/month of downtime. A single provider region rarely guarantees that, so we need independent fallbacks: 1 − (1 − 0.995)(1 − 0.995) ≈ 99.9975% if failures are independent. Same-provider regions are correlated (shared control plane, global model rollouts), so at least one fallback must be a different provider or our own GPUs.

**Architecture**
- **Stateless API tier** in 2+ regions behind global load balancing; conversation state in a replicated DB.
- **LLM gateway** per region: routing table of deployments (provider × region × model) with health windows (errors, 429/529, p95 TTFT), circuit breakers, per-deployment quotas, and per-model prompt variants. Residency policy per tenant.
- **Self-hosted pool** (vLLM) in two zones: minReplicas sized for baseline load, KEDA on vllm:num_requests_waiting and KV-cache usage, images pre-pulled and weights on local NVMe for ~2–4 min cold starts; hosted APIs absorb bursts while pods warm.
- **Degradation ladder**: smaller model → cached/semantic answers → retrieval-only results → maintenance message. Each step keeps some service.

**Operations.** Fallbacks carry 1–2% of live traffic continuously; monthly game days kill a provider in staging and production. SLO dashboards per deployment; alert on burn rate. Capacity reviews: fallback quota ≥ peak traffic share it must absorb.`,
      followUps: [
        {
          q: 'How do you keep conversation quality consistent when a request fails over mid-conversation?',
          a: 'Store the full conversation server-side, send it to the fallback with its own system prompt variant, and record servedBy on the turn; for tool-heavy agents ensure tool schemas are compatible across models or limit fallback to stateless turns.',
        },
        {
          q: 'GPU capacity in your region is sold out during a spike. What then?',
          a: 'Burst to hosted APIs serving the same or an equivalent open model, shed or queue low-priority batch traffic, and keep reserved/committed capacity for the baseline.',
        },
      ],
      pitfalls: [
        'Assuming two regions of the same provider are independent',
        'Untested fallbacks with expired keys or missing quota',
        'Scaling GPU pods on CPU metrics',
      ],
    },
    {
      id: 'production-deployment-iq-3',
      difficulty: 'hard',
      question: 'User satisfaction for your assistant fell slowly over three months with no single bad release. How do you find out whether it is input drift, output drift or provider drift?',
      whatInterviewerLooksFor: [
        'Segmenting quality by time, release, topic cluster and served model',
        'Input drift detection via embeddings and retrieval signals',
        'Replays to separate model behaviour from data changes',
        'Concrete remediation for each cause',
      ],
      modelAnswer: `**Step 1: segment the decline.** Plot satisfaction and judge scores by week × topic cluster × release id × served model. A slow, broad decline across all clusters suggests model or system change; a decline concentrated in some clusters suggests input drift or content gaps.

**Step 2: input drift.** Cluster reference queries (launch quarter) and compute PSI of cluster shares per week; list growing clusters and the share of far-from-reference queries. Check retrieval signals for them: top-1 similarity, no-answer rate, citation coverage. Growing clusters with low retrieval scores = content gaps (missing docs, new products, policy changes).

**Step 3: data/index drift.** Stale documents: share of retrieved chunks older than N months, index freshness lag, failed ingestion jobs.

**Step 4: provider drift.** Check gen_ai.response.model history and canary-prompt results. Replay a frozen sample from month 1 (same retrieved context) on the current model: if scores fall on identical inputs, the model changed; if not, the inputs or data did.

**Step 5: remediate.**
- Content gaps → ingest documents, add golden cases for new clusters.
- Staleness → fix pipelines, add freshness SLOs.
- Model drift → pin snapshots, re-tune prompts, run evals on the new snapshot.
- Expectations drift (users want longer/shorter answers) → product changes + A/B.

Keep a weekly drift review with these panels so the next slide is caught in weeks, not months.`,
      followUps: [
        {
          q: 'Why replay with frozen retrieved context instead of re-running retrieval?',
          a: 'It isolates the model: if outputs change on identical prompts, the model changed; re-running retrieval would mix index changes into the comparison.',
        },
        {
          q: 'Which single metric would you alert on for early warning?',
          a: 'A quality metric segmented by cluster (e.g. judge faithfulness or thumbs-down per top-20 clusters) with week-over-week change thresholds, because overall averages hide localised decline.',
        },
      ],
      pitfalls: [
        'Looking only at the global average satisfaction',
        'Assuming the provider changed without checking the index and data',
        'Alerting on input drift alone and causing alert fatigue',
      ],
    },
    {
      id: 'production-deployment-iq-4',
      difficulty: 'medium',
      question: 'What belongs in a "release" for an LLM feature, and how do you make rollback instant?',
      whatInterviewerLooksFor: [
        'Lists prompt, model snapshot, params, tools, retrieval/index, guardrails, code',
        'Immutable versioned configs and trace stamping',
        'Flags/aliases for runtime switching',
        'Rollback considerations for data changes (index, schemas)',
      ],
      modelAnswer: `**Release contents**
- Prompt templates (system, few-shot, tool descriptions) with version ids
- Model snapshot ids for each role (generator, router, judge, embedder)
- Sampling and limits: temperature, max_tokens, reasoning effort, top_k for retrieval
- Tool/function schemas and their backend versions
- Retrieval config: index alias/version, chunking/embedding version, reranker
- Guardrail policies and thresholds
- Application code version

**Make it instant to roll back**
1. Store each release as an immutable config document (git + registry) with an id; runtime reads the active id from a flag service or config store with a short TTL.
2. Stamp release id on every trace and on stored conversations.
3. Keep the previous release fully deployable: old prompt versions retained, old model snapshot still available, old index alias still present (blue/green indexes).
4. Rollback = point the flag back; no build, no deploy, seconds to propagate.

**Watch out:** changes that mutate data are not instantly reversible: a re-index that deleted old chunks, a schema migration on tool backends, an embedding model change. Use blue/green for those (keep the old index until the new release is fully promoted).`,
      followUps: [
        {
          q: 'Where should prompts live: code or a prompt registry?',
          a: 'Either works if they are versioned, reviewed and evaluated; registries let non-engineers iterate and label versions, but production labels should still require passing evals and the runtime must log the version used.',
        },
        {
          q: 'How fast should config changes propagate to all pods?',
          a: 'Within seconds to a minute: use a flag service with streaming updates or polling at short intervals, and make every pod log the active release id so you can confirm propagation.',
        },
      ],
      pitfalls: [
        'Versioning code but not prompts or model ids',
        'Destroying the old index during a migration',
        'No release id on traces',
      ],
    },
    {
      id: 'production-deployment-iq-5',
      difficulty: 'hard',
      question: 'You self-host a 70B model on vLLM for an internal assistant. Traffic is 5× higher 9am–11am. How do you autoscale it cost-effectively without hurting latency?',
      context: 'Each replica uses 2 × 80 GB GPUs (tensor parallel); cold start currently 9 minutes.',
      whatInterviewerLooksFor: [
        'Right scaling signals (queue depth, KV cache, TTFT) and thresholds',
        'Cold-start reduction techniques',
        'Predictive/scheduled scaling for known peaks',
        'Overflow strategy and scale-in safety',
      ],
      modelAnswer: `**Signals.** Scale on vllm:num_requests_waiting per replica (target ~3–5) with KV-cache usage (> 0.85) and p95 TTFT as secondary triggers. CPU and even GPU utilisation are poor signals: GPUs look busy whenever a batch runs.

**Cold start (9 min → ~2–3 min).** Pre-pull images on GPU nodes (DaemonSet or node image), store weights on local NVMe or a fast shared volume instead of downloading from object storage each time, use safetensors with fast loading, keep CUDA graph capture/warm-up short, and keep spare GPU nodes warm so pod scheduling does not wait for node provisioning.

**Known peaks.** Predictive scaling: a scheduled scale-up at 8:40 to the expected peak replica count (KEDA cron trigger alongside the Prometheus trigger), so capacity is ready before 9am. Reactive scaling handles deviations.

**Overflow.** While pods start, route excess to a hosted endpoint of the same open model (or a smaller model) via the gateway; shed low-priority batch jobs first.

**Scale-in.** Long cooldown (10–15 min), drain replicas (stop routing new requests, let in-flight streams finish) before termination.

**Cost.** Off-peak: minReplicas 2 (zone redundancy); consider a smaller quantised model (FP8) to halve GPUs per replica if evals allow, and use committed capacity for the baseline with on-demand for the peak.`,
      followUps: [
        {
          q: 'Why might KV-cache usage stay low while the queue grows?',
          a: 'The scheduler can be limited by max concurrent sequences or batch-token settings rather than memory, so requests wait even though cache is free; that is why queue depth is the primary signal and the server config should be tuned too.',
        },
        {
          q: 'How do you avoid cutting off streaming responses during scale-in?',
          a: 'Use a preStop hook and readiness gate: mark the pod unready so the router stops sending new requests, wait for in-flight requests to finish (terminationGracePeriodSeconds sized to the longest stream), then terminate.',
        },
      ],
      pitfalls: [
        'Autoscaling on CPU or average GPU utilisation',
        'Ignoring cold-start time when setting thresholds',
        'Aggressive scale-in that kills in-flight streams',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'production-deployment-est-1',
      question: 'A prompt canary gets 5% of 150K daily chats. Thumbs-down baseline is 4.0%; you want to catch a rise to 5.0%. How many days must the canary run if only 1 in 10 chats is rated?',
      assumptions: [
        'Two-proportion test, 95% confidence (z = 1.96), 80% power (z = 0.84)',
        'Baseline p1 = 0.04, canary p2 = 0.05',
        'Total traffic 150,000 conversations/day; canary gets 5%',
        'Control group is much larger than canary, so its variance is negligible (use the one-sample approximation)',
      ],
      steps: [
        { label: 'Effect size', calc: 'Δ = 0.05 − 0.04 = 0.01' },
        { label: 'Variance term (canary)', calc: 'p2(1 − p2) = 0.05 × 0.95 = 0.0475' },
        { label: 'Sample size', calc: 'n ≈ (1.96 + 0.84)² × 0.0475 / 0.01² = 7.84 × 0.0475 / 0.0001 ≈ 3,724' },
        { label: 'Canary conversations per day', calc: '150,000 × 0.05 = 7,500' },
        { label: 'Time needed', calc: '3,724 / 7,500 ≈ 0.5 day (and only ~10% of users leave feedback → ×10 ≈ 5 days)' },
      ],
      answer: '≈ 3,700 rated canary conversations; if only 10% of conversations get a rating, that is ~37,000 conversations, about 5 days at 5% canary traffic.',
      insight:
        'Feedback is sparse, so canaries on user ratings alone are slow. Add dense automated signals (LLM-judge scores on every canary turn, escalation rate, schema failures) to make gates decide in hours, and rely on offline evals for small effects.',
      followUps: [
        {
          q: 'What if you want to detect a 0.5-point increase instead?',
          a: 'Sample size scales with 1/Δ², so halving Δ quadruples n to ~15,000 rated conversations (~20 days at 5%), which is why small regressions must be caught offline.',
        },
      ],
    },
    {
      id: 'production-deployment-est-2',
      question: 'Size a self-hosted vLLM deployment for peak load: how many GPU replicas do you need?',
      assumptions: [
        'Peak: 40 requests/s; average 1,500 input + 300 output tokens per request',
        'One replica (2 × H100, 70B FP8) sustains ~2,500 output tokens/s aggregate decode at acceptable TPOT, and prefill ~25,000 tokens/s',
        'Target utilisation 70% to keep p95 latency in check',
        'Keep N+1 for zone failure',
      ],
      steps: [
        { label: 'Output tokens/s needed', calc: '40 × 300 = 12,000 tok/s' },
        { label: 'Prefill tokens/s needed', calc: '40 × 1,500 = 60,000 tok/s' },
        { label: 'Decode-bound replicas', calc: '12,000 / (2,500 × 0.7) ≈ 6.9' },
        { label: 'Prefill-bound replicas', calc: '60,000 / (25,000 × 0.7) ≈ 3.4' },
        { label: 'Replicas (binding = decode) + redundancy', calc: 'ceil(6.9) = 7, + 1 = 8 replicas = 16 GPUs' },
      ],
      answer: '≈ 8 replicas (16 H100s) at peak, decode-bound; off-peak at 1/5 traffic needs ~2–3 replicas.',
      insight:
        'Output tokens drive capacity: halving average output length (300 → 150) would nearly halve the fleet. Combine with scheduled scaling for the predictable peak instead of running 16 GPUs all day.',
      followUps: [
        {
          q: 'Prompt caching (prefix caching) is enabled and 60% of input is a shared system prompt. Effect?',
          a: 'Prefill work falls to ~40% (24,000 tok/s needed, ~1.4 replicas), which mainly improves TTFT; the fleet size barely changes because decode is the binding constraint.',
        },
      ],
    },
  ],
  test: [
    {
      id: 'production-deployment-mcq-01',
      difficulty: 'medium',
      question: 'Which practice most directly prevents a provider-side model update from changing production behaviour without review?',
      options: [
        'Setting temperature to 0',
        'Pinning a dated model snapshot id instead of an alias',
        'Adding more few-shot examples',
        'Enabling streaming',
      ],
      correct: [1],
      explanation:
        'Aliases are moved by the provider to newer snapshots; pinned ids stay fixed until you change them through your release process. Temperature 0 reduces sampling variance but does not stop the underlying model from changing; few-shot examples and streaming are unrelated.',
      followUps: [
        {
          q: 'What is the operational cost of pinning?',
          a: 'You must track deprecation dates and schedule upgrades with evals and canaries before the pinned snapshot is retired.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-02',
      difficulty: 'hard',
      question: 'Select ALL items that should be part of a versioned LLM release config.',
      options: [
        'System prompt template version',
        'Retrieval index alias/version',
        'The end user’s conversation history',
        'Sampling parameters such as temperature and max_tokens',
      ],
      correct: [0, 1, 3],
      explanation:
        'Prompt, index version and sampling parameters all change behaviour and must be reproducible and rollback-able. Conversation history is per-user runtime data, stored with the conversation (which records the release id) rather than inside the release.',
      followUps: [
        {
          q: 'Why include the index version when it is “just data”?',
          a: 'Re-indexing changes which chunks are retrieved and therefore the answers; without versioning you cannot reproduce or roll back a regression caused by new chunking or embeddings.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-03',
      difficulty: 'hard',
      question: 'What is wrong with this canary assignment?',
      code: {
        language: 'typescript',
        code: `function useCanary(): boolean {
  return Math.random() < CANARY_PERCENT / 100;
}
// called on every chat turn
const release = useCanary() ? canary : stable;`,
      },
      options: [
        'Math.random is too slow for production',
        'Assignment is not sticky: the same user flips between versions on every turn, mixing behaviours and polluting metrics',
        'The canary percentage should be a fraction, not a percentage',
        'Nothing; random assignment is ideal for A/B tests',
      ],
      correct: [1],
      explanation:
        'Per-turn randomisation makes one conversation alternate between prompts/models, which confuses users and makes per-user metrics (satisfaction, escalation) unattributable. Hash a stable id (user or conversation) into buckets. Randomisation is right, but at the unit you measure.',
      followUps: [
        {
          q: 'User id or conversation id: which is the better unit?',
          a: 'Conversation id gives more independent units and works for anonymous users; user id prevents a user seeing different behaviour across sessions. Choose by the metric: per-conversation outcomes favour conversation id.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-04',
      difficulty: 'medium',
      question: 'Which rollout strategy lets you compare a new model on real production traffic with zero user exposure?',
      options: ['Blue/green', 'Canary', 'Shadow (traffic mirroring)', 'Feature flag at 100%'],
      correct: [2],
      explanation:
        'Shadowing sends copies of requests to the new version and discards its outputs, so you can compare offline with no user impact. Canaries expose a small set of users, blue/green switches everyone, and a 100% flag is a full release.',
      followUps: [
        {
          q: 'What is the main cost of shadowing LLM traffic?',
          a: 'You pay for duplicate inference (tokens or GPU time) and must avoid side effects: shadow calls must not trigger tools that write data or send messages.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-05',
      difficulty: 'expert',
      question: 'Select ALL reasons a cross-provider fallback can fail you during an incident even though it is configured.',
      options: [
        'Its API key expired months ago and nobody noticed because it never received traffic',
        'Its quota (TPM) is far below the traffic it must absorb',
        'Your prompt and tool schemas were tuned for the primary model and produce invalid outputs on the fallback',
        'Circuit breakers make fallbacks slower than the primary',
      ],
      correct: [0, 1, 2],
      explanation:
        'Untested fallbacks rot (expired credentials, changed endpoints), are often under-provisioned in quota, and behave differently without model-specific prompts and validation. Circuit breakers speed up failover by skipping a known-bad deployment; they do not slow the fallback.',
      followUps: [
        {
          q: 'How do you keep fallbacks healthy continuously?',
          a: 'Route 1–2% of real traffic or synthetic probes through every fallback, run evals per fallback on each release, alert on fallback errors, and run regular failover drills.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-06',
      difficulty: 'hard',
      question: 'This circuit breaker is used in a gateway. What behaviour results during a long outage?',
      code: {
        language: 'typescript',
        code: `if (failuresLast30s >= 5) {
  open = true;
  setTimeout(() => { open = false; failures = []; }, 60_000);
}
if (!open) return callPrimary();
return callFallback();`,
      },
      options: [
        'Traffic stays on the fallback until an engineer resets the breaker',
        'Every 60 s the breaker fully closes and all traffic floods the still-broken primary until 5 more failures re-open it',
        'The primary is never retried',
        'It behaves as a correct half-open breaker',
      ],
      correct: [1],
      explanation:
        'After the timer, the breaker returns straight to closed instead of half-open, so all concurrent requests hit the failing primary until enough failures accumulate. A half-open state should allow only a few probe requests and close only on success.',
      followUps: [
        {
          q: 'How many requests should a half-open state allow?',
          a: 'A small fixed number (e.g. 1–5 probes or a small percentage); close after consecutive successes, re-open immediately on failure.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-07',
      difficulty: 'medium',
      question: 'Why are scheduled (predictive) scale-ups useful for self-hosted LLM servers even when reactive autoscaling is configured?',
      options: [
        'Reactive autoscaling does not work on GPUs',
        'New replicas take minutes to become ready, so capacity must be added before a known peak arrives',
        'Scheduled scaling reduces token costs on hosted APIs',
        'Predictive scaling removes the need for load balancing',
      ],
      correct: [1],
      explanation:
        'GPU replicas have multi-minute cold starts (image pull, weight loading, warm-up), so reactive scaling lags a sharp morning ramp and users see queueing. Pre-scaling for predictable peaks hides the cold start; reactive scaling then handles surprises.',
      followUps: [
        {
          q: 'Name two ways to shorten the cold start itself.',
          a: 'Pre-pull container images on GPU nodes and load weights from local NVMe or a fast cache instead of downloading from object storage on every start.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-08',
      difficulty: 'hard',
      question: 'Select ALL signals that indicate OUTPUT quality drift rather than input drift.',
      options: [
        'The share of responses failing JSON schema validation rose from 0.2% to 3%',
        'The share of queries about a new product line rose from 0% to 12%',
        'Refusal rate on an unchanged canary prompt set doubled',
        'Average LLM-judge faithfulness on sampled traffic fell from 0.92 to 0.85 within stable topic clusters',
      ],
      correct: [0, 2, 3],
      explanation:
        'Schema failures, refusals on a fixed prompt set and judge scores within stable clusters all measure how the system responds to comparable inputs. A new product line in the query mix is input drift: users changed, not necessarily the outputs.',
      followUps: [
        {
          q: 'Why is “within stable topic clusters” important for the judge score?',
          a: 'Without controlling for topic mix, a falling average could just reflect more hard questions (input drift); comparing like with like isolates output quality changes.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-09',
      difficulty: 'expert',
      question: 'What does this drift check actually detect, and what is its main blind spot?',
      code: {
        language: 'typescript',
        code: `const refMean = mean(referenceEmbeddings);
const curMean = mean(lastWeekEmbeddings);
const shift = 1 - cosine(refMean, curMean);
if (shift > 0.05) alert('input drift');`,
      },
      options: [
        'It detects every distribution change; there is no blind spot',
        'It detects a global shift of the average query, but misses changes in mix that leave the mean similar (e.g. one topic grows while another shrinks symmetrically) and new small clusters',
        'It detects output drift, not input drift',
        'It only works with 384-dimensional embeddings',
      ],
      correct: [1],
      explanation:
        'Centroid distance compresses a whole distribution into its mean. Offsetting changes in cluster shares or a small new topic (5% of traffic) barely move the mean. Cluster-share PSI, MMD and a far-from-reference share catch these. The method is dimension-agnostic and measures queries, i.e. inputs.',
      followUps: [
        {
          q: 'How would you pick the 0.05 threshold?',
          a: 'Compute the statistic between pairs of historical weeks with no known change to get its natural variability, and set the threshold at a high percentile of that null distribution (e.g. p99).',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-10',
      difficulty: 'hard',
      question: 'Select ALL changes that need a blue/green (keep-old-until-promoted) approach rather than an in-place update.',
      options: [
        'Switching the embedding model used for the vector index',
        'Re-chunking the whole corpus with a new strategy',
        'Changing the temperature from 0.3 to 0.2',
        'Migrating a tool’s backend API to a new schema',
      ],
      correct: [0, 1, 3],
      explanation:
        'Embedding model swaps and re-chunking rewrite stored data and old/new vectors are incompatible; schema migrations change contracts. Keeping both versions allows instant rollback. A temperature change is pure configuration and can be flagged and rolled back instantly.',
      followUps: [
        {
          q: 'How do you switch the application between two indexes atomically?',
          a: 'Query through an alias (collection alias or view) and repoint it from index_v9 to index_v10 in one operation once evals pass, keeping v9 until the new release is fully promoted.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-11',
      difficulty: 'expert',
      question: 'Two 99.9%-available regions of the same provider are used as primary and fallback. Why is the real availability likely well below the 99.9999% the independence formula suggests?',
      options: [
        'Fallback adds latency, which lowers availability',
        'Failures are correlated: shared control planes, global model rollouts, auth outages and quota systems can take both regions down together',
        'Availability cannot exceed the primary’s availability',
        'The formula applies only to self-hosted models',
      ],
      correct: [1],
      explanation:
        'The product formula assumes independence. Same-provider regions share failure domains (identity, billing/quota, model deployment pipelines), so common-mode outages dominate. A different provider or self-hosted capacity adds real independence. Fallbacks can exceed primary availability when failures are independent.',
      followUps: [
        {
          q: 'How could you estimate the correlation from data?',
          a: 'Analyse historical incident timelines or your own health metrics per region and compute the fraction of primary-down minutes during which the fallback was also degraded.',
        },
      ],
    },
    {
      id: 'production-deployment-mcq-12',
      difficulty: 'hard',
      question: 'An automated canary gate uses the code below. What is the most likely problem?',
      code: {
        language: 'typescript',
        code: `// evaluated every 10 minutes from 1% canary start
if (canary.thumbsDownRate <= control.thumbsDownRate) promote();
else rollback();`,
      },
      options: [
        'It compares rates instead of counts',
        'With tiny early samples, noise decides: good releases get rolled back and bad ones promoted by chance; it needs minimum samples, tolerances and statistical tests',
        'Thumbs-down is not a valid metric',
        'Gates should only run once at 100%',
      ],
      correct: [1],
      explanation:
        'At 1% traffic after 10 minutes the canary may have a few dozen rated conversations, so the comparison is a coin flip. Robust gates require minimum sample sizes, tolerance bands, significance tests (or sequential testing), and multiple metrics including dense automated ones.',
      followUps: [
        {
          q: 'What is sequential testing and why is it useful here?',
          a: 'A testing approach that lets you check results repeatedly as data arrives while controlling false positives (e.g. SPRT or alpha-spending), so you can stop early on clear wins or losses without inflating error rates.',
        },
      ],
    },
  ],
};

export default topic;
