import type { DrillBody } from './index';

const drill: DrillBody = {
  id: 'kv-cache-append',
  entry: ['createKVCache', 'decodeStep'],
  problem: String.raw`A decoder makes one token at a time. Without a cache, each new token computes the keys and values of the whole prefix again. A KV cache stores the key and the value of each step once, so each new token needs only one query against the stored keys and values.

## Task

Write two functions.

1. \`createKVCache(maxLen, dK, dV)\` returns an empty cache with room for \`maxLen\` steps: an object with these methods.
   - \`append(k, v)\` adds one or more steps after the steps already stored. A \`number[]\` \`k\` (length dK) is one step; a \`number[][]\` \`k\` (n rows) is n steps. The same rule applies to \`v\`.
   - \`keys()\` returns the stored keys in order, \`size()\` × dK.
   - \`values()\` returns the stored values, \`size()\` × dV.
   - \`size()\` returns the number of stored steps.
2. \`decodeStep(q, cache)\` computes the attention of one query over the cache: with K = \`cache.keys()\` and V = \`cache.values()\`, the scores are s_j = (K[j] · q) / √dK, the weights are the softmax of s, and the output is weights · V. It returns \`{ output, weights }\`.

\`append\` throws an \`Error\` in two cases:

- the new steps do not fit: \`size() + n > maxLen\`;
- \`k\` and \`v\` have different numbers of steps.

When \`append\` throws, the cache does not change.

## Input and output

| Name | Type | Meaning |
|---|---|---|
| \`maxLen\`, \`dK\`, \`dV\` | \`number\` | the capacity, the key length and the value length |
| \`k\` | \`number[]\` or \`number[][]\` | the keys of one or n new steps |
| \`v\` | \`number[]\` or \`number[][]\` | the values of the same steps |
| \`q\` | \`number[]\` | the query of the current step, length dK |

\`decodeStep\` returns \`{ output: number[] (length dV), weights: number[] (length size()) }\`.

## Constraints

- Scores can be larger than 1000; the output must stay finite.
- The cache stores a copy of the data: a later change to the caller's \`k\` or \`v\` does not change the cache.
- Do not change the input arrays.

## Examples

\`\`\`ts
const cache = createKVCache(4, 2, 2);
cache.append([[1, 0], [0, 1]], [[1, 2], [3, 4]]);
cache.size();   // 2
cache.append([1, 1], [5, 6]);
cache.size();   // 3
cache.values(); // [[1, 2], [3, 4], [5, 6]]

decodeStep([1, 0], cache);
// { output: [3, 4], weights: [0.40111209, 0.19777581, 0.40111209] }

cache.append([[0, 0], [0, 0]], [[0, 0], [0, 0]]); // throws: the cache is full
cache.size();   // still 3
\`\`\``,
  starter: `interface KVCache {
  append(k: number[] | number[][], v: number[] | number[][]): void;
  keys(): number[][];
  values(): number[][];
  size(): number;
}

function createKVCache(maxLen: number, dK: number, dV: number): KVCache {
  throw new Error('not implemented');
}

function decodeStep(q: number[], cache: KVCache): { output: number[]; weights: number[] } {
  throw new Error('not implemented');
}
`,
  solution: `interface KVCache {
  append(k: number[] | number[][], v: number[] | number[][]): void;
  keys(): number[][];
  values(): number[][];
  size(): number;
}

function createKVCache(maxLen: number, dK: number, dV: number): KVCache {
  const K = Array.from({ length: maxLen }, () => new Array<number>(dK).fill(0));
  const V = Array.from({ length: maxLen }, () => new Array<number>(dV).fill(0));
  let length = 0;
  const rows = (a: number[] | number[][]) => (Array.isArray(a[0]) ? (a as number[][]) : [a as number[]]).map((r) => r.slice());
  return {
    append(k, v) {
      const ks = rows(k);
      const vs = rows(v);
      const n = ks.length;
      if (vs.length !== n) throw new Error('k and v must have the same number of steps');
      if (length + n > maxLen) throw new Error('the cache is full');
      ks.forEach((r, i) => (K[length + i] = r));
      vs.forEach((r, i) => (V[length + i] = r));
      length += n;
    },
    keys: () => K.slice(0, length).map((r) => r.slice()),
    values: () => V.slice(0, length).map((r) => r.slice()),
    size: () => length,
  };
}

function decodeStep(q: number[], cache: KVCache): { output: number[]; weights: number[] } {
  const scores = cache.keys().map((k) => k.reduce((s, x, i) => s + x * q[i], 0) / Math.sqrt(q.length));
  const m = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  const weights = exps.map((e) => e / sum);
  const V = cache.values();
  const output = V[0].map((_, c) => weights.reduce((s, w, j) => s + w * V[j][c], 0));
  return { output, weights };
}
`,
  hints: [
    'Allocate two arrays of maxLen zero rows (dK and dV wide) inside createKVCache and keep a counter of the stored steps; the returned methods close over them.',
    'Turn a single step into a list of one row first (Array.isArray(k[0]) tells the two forms apart). Then every append has n rows.',
    'Do all the checks before you write anything: throw first, then copy the rows in, then add n to the counter. Copy each row (row.slice()) so the caller cannot change the cache later.',
    'keys() and values() return only the first size() rows. The other rows are zeros, and attention over them gives wrong weights.',
    'decodeStep is one row of scaled dot-product attention: scores against every cached key, divided by √dK, a softmax with the maximum subtracted, then a weighted sum of the cached values.',
  ],
  notes: String.raw`## Why the cache gives the same answer

In a causal decoder, step t attends only to steps 0 to t, and the keys and values of those steps never change when new tokens arrive. So the cache can store them once. The output of step t with the cache equals row t of full causal attention; the check that compares the two is the main test of any cache.

## Why a fixed capacity

A serving engine allocates the cache memory before it runs a request instead of growing an array at each step (copying a large cache every step is slow). So the cache has a fixed maxLen and an append past the end is an error. Checking before writing keeps the cache valid after the error.

## The cost of the cache

Each layer stores one key and one value per token per key-value head: 2 × tokens × layers × kv_heads × d_head × bytes. At long context this is often larger than the weights. Grouped-query attention cuts the number of key-value heads for exactly this reason.

## Where this goes next

Paged caches (vLLM's PagedAttention) split the fixed array into blocks so many requests share one memory pool, and prefix caching reuses the blocks of a shared system prompt.`,
  tests: (sub, { check, close, equal, ok, rng }) => {
    const randM = (r: () => number, n: number, c: number) => Array.from({ length: n }, () => Array.from({ length: c }, () => r() * 4 - 2));
    const threw = (fn: () => unknown) => {
      try {
        fn();
      } catch {
        return true;
      }
      return false;
    };
    const causal = (Q: number[][], K: number[][], V: number[][]) =>
      Q.map((q, t) => {
        const s = K.slice(0, t + 1).map((k) => k.reduce((a, x, i) => a + x * q[i], 0) / Math.sqrt(q.length));
        const m = Math.max(...s);
        const e = s.map((x) => Math.exp(x - m));
        const z = e.reduce((a, b) => a + b, 0);
        return V[0].map((_, c) => e.reduce((a, w, j) => a + (w / z) * V[j][c], 0));
      });
    const example = () => {
      const cache = sub.createKVCache(4, 2, 2);
      cache.append(
        [
          [1, 0],
          [0, 1],
        ],
        [
          [1, 2],
          [3, 4],
        ],
      );
      cache.append([1, 1], [5, 6]);
      return cache;
    };

    check('append two steps, then one step', 'append writes the new rows after the stored rows. size() counts the stored steps. A number[] k or v is one step.', () => {
      const cache = sub.createKVCache(4, 2, 2);
      cache.append(
        [
          [1, 0],
          [0, 1],
        ],
        [
          [1, 2],
          [3, 4],
        ],
      );
      equal(cache.size(), 2, 'size() after two steps');
      close(
        cache.keys(),
        [
          [1, 0],
          [0, 1],
        ],
        'keys() after two steps',
      );
      cache.append([1, 1], [5, 6]);
      equal(cache.size(), 3, 'size() after three steps');
      close(
        cache.values(),
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        'values() after three steps',
      );
    });
    check('one decode step over three cached steps', 'The scores are the cached keys times q, divided by √dK. The weights are their softmax; the output is the weights times the cached values.', () => {
      const { output, weights } = sub.decodeStep([1, 0], example());
      close(weights, [0.40111209, 0.19777581, 0.40111209], 'the weights', 1e-6);
      close(output, [3, 4], 'the output', 1e-6);
    });
    check('a full cache throws and stays unchanged', 'A cache with maxLen 4 and 3 stored steps has room for 1 step. An append of 2 steps must throw and keep the cache as it was.', () => {
      const cache = example();
      ok(
        threw(() =>
          cache.append(
            [
              [0, 0],
              [0, 0],
            ],
            [
              [0, 0],
              [0, 0],
            ],
          ),
        ),
        'append past maxLen did not throw',
      );
      equal(cache.size(), 3, 'size() after the failed append');
      close(
        cache.values(),
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        'values() after the failed append',
      );
    });
    check('incremental decode equals full causal attention', 'With a cache, step t attends to the keys and values of steps 0 to t: row t of causal attention over the whole sequence.', () => {
      const r = rng(0);
      const [Q, K, V] = [randM(r, 7, 4), randM(r, 7, 4), randM(r, 7, 3)];
      const full = causal(Q, K, V);
      const cache = sub.createKVCache(7, 4, 3);
      for (let t = 0; t < 7; t++) {
        cache.append(K[t], V[t]);
        const { output, weights } = sub.decodeStep(Q[t], cache);
        equal(weights.length, t + 1, `the number of weights at step ${t}`);
        close(output, full[t], `the output at step ${t}`, 1e-10);
      }
    });
    check('a prompt in one append, then one step at a time', 'An append of P steps at once gives the same cache as P appends of one step, and later decode steps still match causal attention.', () => {
      const r = rng(1);
      const [Q, K, V] = [randM(r, 8, 3), randM(r, 8, 3), randM(r, 8, 2)];
      const full = causal(Q, K, V);
      const cache = sub.createKVCache(8, 3, 2);
      cache.append(K.slice(0, 5), V.slice(0, 5));
      equal(cache.size(), 5, 'size() after the prompt');
      close(cache.keys(), K.slice(0, 5), 'keys() after the prompt');
      for (let t = 5; t < 8; t++) {
        cache.append(K.slice(t, t + 1), V.slice(t, t + 1));
        close(sub.decodeStep(Q[t], cache).output, full[t], `the output at step ${t}`, 1e-10);
      }
      close(cache.values(), V, 'values() at the end');
    });
    check('weights sum to 1 and the cache keeps its own copy', 'Each decode step gives a probability distribution. The cache stores a copy of k and v, so a later change to the caller\'s arrays does not change it.', () => {
      const r = rng(2);
      const [k, v, q] = [randM(r, 3, 4), randM(r, 3, 5), randM(r, 1, 4)[0]];
      const saved = JSON.stringify([k, v, q]);
      const cache = sub.createKVCache(6, 4, 5);
      cache.append(k, v);
      const { output, weights } = sub.decodeStep(q, cache);
      equal(JSON.stringify([k, v, q]), saved, 'k, v and q after the calls');
      close(
        weights.reduce((a: number, b: number) => a + b, 0),
        1,
        'the sum of the weights',
        1e-12,
      );
      equal(output.length, 5, 'the length of the output');
      const want = JSON.parse(saved);
      k.forEach((row) => row.fill(0));
      v.forEach((row) => row.fill(0));
      close(cache.keys(), want[0], "keys() after the caller changed k");
      close(cache.values(), want[1], "values() after the caller changed v");
    });
    check('fill the cache to exactly maxLen', 'An append that ends at maxLen is allowed. Only an append past maxLen throws.', () => {
      const cache = sub.createKVCache(3, 2, 1);
      cache.append(
        [
          [1, 1],
          [1, 1],
        ],
        [[1], [1]],
      );
      cache.append([2, 2], [7]);
      equal(cache.size(), 3, 'size() when the cache is full');
      close(cache.values(), [[1], [1], [7]], 'values() when the cache is full');
      ok(
        threw(() => cache.append([1, 1], [1])),
        'append to a full cache did not throw',
      );
    });
    check('a failed append keeps the cache usable', 'Check the room before you write or count anything. After the error, size, keys and values are as before, and the next append lands right after them.', () => {
      const cache = sub.createKVCache(4, 2, 2);
      cache.append(
        [
          [1, 0],
          [0, 1],
        ],
        [
          [1, 2],
          [3, 4],
        ],
      );
      ok(
        threw(() => cache.append(randM(rng(3), 3, 2), randM(rng(4), 3, 2))),
        'an append of 3 steps into 2 free slots did not throw',
      );
      equal(cache.size(), 2, 'size() after the failed append');
      cache.append([1, 1], [5, 6]);
      equal(cache.size(), 3, 'size() after the next append');
      close(
        cache.values(),
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        'values() after the next append',
      );
    });
    check('k and v with different step counts throw', 'Each step has one key and one value. An append of 2 keys and 1 value must throw and store nothing.', () => {
      const cache = sub.createKVCache(4, 2, 2);
      ok(
        threw(() =>
          cache.append(
            [
              [1, 1],
              [1, 1],
            ],
            [[1, 1]],
          ),
        ),
        'append of 2 keys and 1 value did not throw',
      );
      equal(cache.size(), 0, 'size() after the failed append');
    });
    check('one cached step and large scores', 'With one cached step the weight is 1. Large scores must not overflow: subtract the maximum score before Math.exp.', () => {
      const cache = sub.createKVCache(2, 2, 2);
      cache.append([3, -1], [2.5, -4]);
      let { output, weights } = sub.decodeStep([0.2, 0.9], cache);
      close(weights, [1], 'the weights with one step');
      close(output, [2.5, -4], 'the output with one step');
      cache.append([2999, 0], [1, 1]);
      ({ output, weights } = sub.decodeStep([1, 0], cache));
      ok(output.every((x: number) => Number.isFinite(x)), 'the output has NaN or infinite values');
      close(weights, [0, 1], 'the weights with a large score', 1e-12);
    });
    check('decode steps match the reference on 3 random runs', 'Your cache and decodeStep agree with the reference for appends of several sizes.', () => {
      const runs: [number, number, number, [number[][], number[][], number[], number[], number[]][]][] = [[5, 2, 3, [[[[0.305, -1.04], [0.75, 0.941]], [[-1.951, -1.302, 0.128], [-0.316, -0.017, -0.853]], [0.879, 0.778], [-0.64823701347, -0.27811594025, -0.653657791918], [0.203203066343, 0.796796933657]], [[[0.066, 1.127]], [[0.468, -0.859, 0.369]], [-0.959, 0.878], [-0.079222148664, -0.649294367798, -0.0452220521123], [0.12430291955, 0.314455849837, 0.561241230613]], [[[-0.05, -0.185]], [[-0.681, 1.223, -0.155]], [-0.428, -0.352], [-0.796959034028, -0.244673814075, -0.0769489265431], [0.326729429366, 0.174405455742, 0.204812314988, 0.294052799904]]]], [8, 4, 4, [[[[0.532, 0.365, 0.413, 0.431], [2.142, -0.406, -0.512, -0.814], [0.616, 1.129, -0.114, -0.84]], [[-0.824, 0.651, 0.743, 0.543], [-0.666, 0.232, 0.117, 0.219], [0.871, 0.224, 0.679, 0.068]], [0.289, 0.631, -1.457, -0.32], [-0.0673982592441, 0.302424195469, 0.456123983217, 0.214439620085], [0.175858011358, 0.416603077419, 0.407538911223]], [[[-0.47, -0.639, -0.275, 1.495], [-0.866, 0.968, -1.683, -0.335]], [[0.163, 0.586, 0.711, 0.793], [-0.349, -0.462, 0.858, -0.191]], [-1.276, -1.133, -0.919, 0.497], [-0.0902319429015, 0.225774054684, 0.727448403348, 0.397661725536], [0.0838282422388, 0.0521443831644, 0.0478793818529, 0.501373819853, 0.314774172891]], [[[0.142, 0.69, -0.427, 0.159], [0.626, -0.309, 0.457, -0.662]], [[-0.363, -0.382, -1.196, 0.487], [-0.469, 0.012, 0.481, 0.447]], [0.665, -0.098, -0.423, -0.08], [-0.288496976597, 0.129706913744, 0.299698314748, 0.309150919893], [0.119131695655, 0.270094275713, 0.138798614684, 0.0994060092792, 0.116721594773, 0.12435862983, 0.131489180065]], [[[-1.687, -1.447, -1.323, -0.997]], [[0.4, -0.905, -0.378, 1.299]], [-0.356, 0.738, -0.934, -0.205], [-0.108424562405, -0.191156579893, 0.302361256715, 0.328631324156], [0.0704998081956, 0.0696942967812, 0.134150256537, 0.0719323424606, 0.325156950113, 0.129685850225, 0.0592435248722, 0.139636970815]]]], [10, 3, 2, [[[[-0.95, -0.339, 0.84], [-1.727, 0.434, 0.238], [-0.594, -1.446, 0.072], [-0.529, 0.233, 0.022], [1.602, -0.239, -1.023], [0.179, 0.22, 1.359]], [[0.835, 0.357], [1.463, -1.189], [-0.64, -0.927], [-0.39, -1.377], [0.635, -0.222], [-1.471, -1.016]], [0.314, 0.838, 1.997], [-0.50396104333, -0.79287242157], [0.179766910277, 0.113375551022, 0.0462995192671, 0.0996436036164, 0.0349776632724, 0.525936752545]], [[[2.914, 0.414, -0.99]], [[-2.132, 0.268]], [-0.813, -0.415, -0.612], [0.143122148904, -0.74135205641], [0.162858310233, 0.24107110194, 0.235657785502, 0.155593762967, 0.0926952671437, 0.0697993581295, 0.0423244140846]], [[[-0.141, 1.066, 0.157], [-0.159, -1.036, -1.675]], [[-0.486, -0.054], [1.768, 0.13]], [0.983, -0.499, -1.185], [-0.47537288845, -0.0362204879949], [0.0166524701536, 0.0129455020762, 0.0474160280107, 0.031385372306, 0.246334191487, 0.0188625824643, 0.42014097651, 0.0280558894546, 0.178206987537]]]]];
      for (const [maxLen, dK, dV, steps] of runs) {
        const cache = sub.createKVCache(maxLen, dK, dV);
        steps.forEach(([k, v, q, out, w], i) => {
          cache.append(k, v);
          const got = sub.decodeStep(q, cache);
          close(got.weights, w, `the weights at step ${i} of the run with maxLen ${maxLen}`, 1e-9);
          close(got.output, out, `the output at step ${i} of the run with maxLen ${maxLen}`, 1e-9);
        });
      }
    });
  },
};

export default drill;
