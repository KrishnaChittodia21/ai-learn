import type { Topic } from '../../types';

const topic: Topic = {
  id: 'groundedness-hallucinations',
  phase: 'evaluation',
  order: 2,
  title: 'Groundedness, Citations and Hallucination Detection',
  subtitle:
    'Check every sentence against its evidence: decompose answers into claims and verify them (faithfulness), score whether citations really support what they are attached to (citation precision and recall), and catch hallucinations with NLI models, trained detectors and self-consistency (SelfCheckGPT).',
  estimatedMinutes: 44,
  sources: [
    'Es et al. 2023 — RAGAS: Automated Evaluation of Retrieval Augmented Generation (faithfulness via claim decomposition)',
    'Gao et al. 2023 — Enabling Large Language Models to Generate Text with Citations (ALCE; citation recall and precision, arXiv 2305.14627)',
    'Manakul et al. 2023 — SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative LLMs (EMNLP 2023, arXiv 2303.08896)',
    'Honovich et al. 2022 — TRUE: Re-evaluating Factual Consistency Evaluation (NLI-based consistency)',
    'Vectara — HHEM-2.1-Open hallucination evaluation model (Hugging Face model card and blog)',
    'Kovács & Recski 2025 — LettuceDetect: A Hallucination Detection Framework for RAG Applications (ModernBERT token classification on RAGTruth)',
    'Niu et al. 2024 — RAGTruth: A Hallucination Corpus for Developing Trustworthy RAG Applications',
    'Min et al. 2023 — FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation',
    'sentence-transformers docs — CrossEncoder NLI models (cross-encoder/nli-deberta-v3-base)',
  ],
  tags: ['faithfulness', 'groundedness', 'citations', 'hallucination', 'nli', 'selfcheckgpt', 'hhem', 'evaluation'],
  cheatSheet: [
    'Groundedness/faithfulness asks "is every claim supported by the provided context?" — NOT "is it true?". A grounded answer from a wrong document is still wrong.',
    'Faithfulness = supported claims ÷ total claims, after decomposing the answer into atomic, self-contained claims.',
    'Verify claims with NLI (premise = context chunk, hypothesis = claim → entailment / neutral / contradiction) or an LLM judge with structured verdicts.',
    'Citation recall (ALCE) = statements fully supported by their own citations ÷ all statements needing support.',
    'Citation precision (ALCE) = relevant citations ÷ all citations; a citation is irrelevant if it does not support the statement alone AND removing it does not hurt the support from the rest.',
    'Intrinsic hallucination contradicts the source; extrinsic adds content the source cannot verify. Both fail a groundedness check.',
    'SelfCheckGPT: sample N extra answers; facts the model really knows recur across samples, hallucinated details vary. Low consistency ⇒ likely hallucination. Needs no retrieval and no logits.',
    'Small trained detectors (HHEM-2.1-Open ~110M params, LettuceDetect token-level ModernBERT) are cheap enough to run on every response; LLM judges are more flexible but cost more.',
    'Score per sentence or span, not per answer, so you can highlight, strip or regenerate only the unsupported parts.',
    'Validate any detector on labelled in-domain data (RAGTruth-style) and pick thresholds by the cost of false negatives vs false positives.',
  ],
  sections: [
    {
      heading: 'Faithfulness and Groundedness — claim decomposition and per-claim verification',
      body: `**Intuition:** a faithful answer is a good witness: it only says what the documents in front of it say. Faithfulness (RAGAS) and groundedness (Azure AI, Vertex AI, TruLens wording) are the same idea — *every claim is backed by the supplied context.*

**Groundedness ≠ correctness:**

| | Grounded | Not grounded |
|---|---|---|
| **Correct** | ideal | lucky guess from memory (unverifiable) |
| **Incorrect** | faithful to a wrong/stale source | hallucination |

**Mechanics (claim-level verification):**
1. **Decompose** the answer into atomic claims ("The refund window is 30 days", "It applies to damaged items"). Resolve pronouns so each claim stands alone.
2. **Verify** each claim against the context:
   - **NLI cross-encoder** (e.g. DeBERTa-v3 trained on MNLI/SNLI): premise = context chunk, hypothesis = claim → P(entailment). Take the max over chunks.
   - **LLM judge** with structured output \`{claim, verdict: supported|unsupported|contradicted, evidence_quote}\`.
3. **Score** = supported ÷ total claims. Keep the per-claim verdicts — they are the useful output.

**Design choices:** NLI models are fast (milliseconds per pair on GPU) but have ~512-token premise limits, so check each chunk separately; LLM judges handle long contexts, paraphrase and multi-chunk reasoning, but cost more and vary between runs. Asking the judge for an **evidence quote** and checking the quote exists verbatim in the context is a cheap anti-hallucination check *for the judge itself*.

**When to use:** offline on golden sets for every pipeline change; online on sampled traffic, or on every answer in high-stakes domains (health, finance, legal) where unsupported sentences should be flagged or removed before the user sees them.`,
      example: `Context: "[1] Damaged items can be returned within 30 days. [2] Refunds go to the original payment method within 5 business days of approval."

Answer: "You can return damaged items within 30 days. Refunds arrive within 5 business days to your original card. Shipping for the return is free. Store credit is also available."

| Claim | Best NLI P(entail) | Verdict |
|---|---|---|
| Damaged items returnable within 30 days | 0.97 (chunk 1) | supported |
| Refunds within 5 business days | 0.93 (chunk 2) | supported |
| Refund goes to original card | 0.81 (chunk 2) | supported |
| Return shipping is free | 0.08 | unsupported |
| Store credit is available | 0.04 | unsupported |

Faithfulness = 3 ÷ 5 = **0.60**. The two unsupported sentences are flagged; the safe output keeps the first two sentences and drops the rest.`,
      diagram: `  answer ─► DECOMPOSE ─► claims c1..cn
                              │
             for each claim:  ▼
   chunks k1..km ─► NLI(premise = kj, hypothesis = ci) ─► P(entail)
                              │  max over chunks
                              ▼
            supported if P(entail) ≥ τ  (else unsupported / contradicted)
                              │
         faithfulness = supported / n    + per-claim verdicts for UI`,
      code: [
        {
          language: 'python',
          title: 'Per-claim groundedness with an NLI cross-encoder',
          code: `import numpy as np
from sentence_transformers import CrossEncoder

nli = CrossEncoder("cross-encoder/nli-deberta-v3-base")
LABELS = ["contradiction", "entailment", "neutral"]  # label order from the model card
ENTAIL, CONTRA = LABELS.index("entailment"), LABELS.index("contradiction")

def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)

def groundedness(claims: list[str], chunks: list[str], tau: float = 0.5):
    verdicts = []
    for claim in claims:
        # NLI premise limit (~512 tokens): score each chunk separately, keep the best
        probs = softmax(nli.predict([(chunk, claim) for chunk in chunks]))
        best = int(probs[:, ENTAIL].argmax())
        p_ent, p_con = float(probs[best, ENTAIL]), float(probs[:, CONTRA].max())
        label = "supported" if p_ent >= tau else "contradicted" if p_con >= tau else "unsupported"
        verdicts.append({"claim": claim, "label": label, "p_entail": round(p_ent, 2), "chunk": best})
    score = sum(v["label"] == "supported" for v in verdicts) / max(len(verdicts), 1)
    return score, verdicts

chunks = ["Damaged items can be returned within 30 days.",
          "Refunds go to the original payment method within 5 business days of approval."]
claims = ["Damaged items can be returned within 30 days.", "Return shipping is free."]
print(groundedness(claims, chunks))  # (0.5, [...supported..., ...unsupported...])`,
        },
      ],
      prosCons: {
        pros: [
          'Pinpoints exactly which sentence is unsupported, enabling highlighting, stripping or targeted regeneration.',
          'Reference-free: needs only the answer and the retrieved context, so it runs on live traffic.',
          'NLI verification is cheap and deterministic enough to run on every response.',
        ],
        cons: [
          { con: 'Claim decomposition errors (merged or dangling claims) distort the score.', fix: 'Prompt for atomic, self-contained claims with pronouns resolved, and validate the decomposer on a labelled sample.' },
          { con: 'NLI models miss support that spans several chunks or needs arithmetic ("3 + 2 days").', fix: 'Also test the claim against concatenated adjacent chunks, and fall back to an LLM judge for claims the NLI marks neutral.' },
          { con: 'High faithfulness can hide wrong answers drawn from wrong or stale documents.', fix: 'Pair faithfulness with answer correctness on a golden set and with document version/metadata checks in retrieval.' },
        ],
      },
      keyPoints: [
        'Faithfulness = supported claims ÷ total claims.',
        'Grounded is not the same as correct; measure both.',
        'NLI: premise = context chunk, hypothesis = claim; take max entailment over chunks.',
        'Keep per-claim verdicts — they drive UI flags and fixes.',
      ],
      exercise: {
        prompt: `Write \`splitClaims(answer)\` and \`faithfulnessScore(claims, entail, tau)\`.

**Acceptance criteria:**
- \`splitClaims\` splits on sentence boundaries, then splits sentences joined by "; " or ", and " into separate claims; trims and drops fragments shorter than 4 words.
- \`entail(claim)\` returns the best P(entailment) over chunks (injected).
- \`faithfulnessScore\` returns \`{ score, unsupported }\`, where score = supported ÷ total (null if no claims) and unsupported lists claims with P < tau.`,
        starter: {
          language: 'typescript',
          code: `export function splitClaims(answer: string): string[] {
  // TODO
  return [];
}

export function faithfulnessScore(claims: string[], entail: (c: string) => number, tau = 0.5) {
  // TODO
  return { score: null as number | null, unsupported: [] as string[] };
}`,
        },
        hints: [
          'Sentence split: answer.split(/(?<=[.!?])\\s+/).',
          'Then split each sentence with /;\\s+|,\\s+and\\s+/.',
          'Count words with s.split(/\\s+/).length.',
        ],
        solution: {
          language: 'typescript',
          code: `export function splitClaims(answer: string): string[] {
  return answer
    .split(/(?<=[.!?])\\s+/)
    .flatMap((s) => s.split(/;\\s+|,\\s+and\\s+/))
    .map((s) => s.trim().replace(/[.!?]+$/, ''))
    .filter((s) => s.split(/\\s+/).length >= 4); // drop fragments like "Thanks"
}

export function faithfulnessScore(claims: string[], entail: (c: string) => number, tau = 0.5) {
  if (!claims.length) return { score: null, unsupported: [] as string[] }; // refusal: not scored
  const unsupported = claims.filter((c) => entail(c) < tau);
  return { score: (claims.length - unsupported.length) / claims.length, unsupported };
}`,
        },
        explanation:
          'Rule-based splitting is a cheap baseline decomposer (LLM decomposition handles pronouns and nested clauses better). Returning null for zero-claim answers keeps refusals from inflating or deflating the average, and the unsupported list is what you surface in the UI.',
      },
      quickCheck: {
        question: 'An answer quotes the 2022 travel policy perfectly, but the 2025 policy is the current one. What do faithfulness and correctness show?',
        options: [
          'Both low',
          'Faithfulness high, correctness low',
          'Faithfulness low, correctness high',
          'Both high',
        ],
        correct: 1,
        explanation:
          'Every claim is supported by the retrieved (stale) context, so faithfulness is high; the answer is still wrong for the user. That is why groundedness checks must be paired with correctness evaluation and version-aware retrieval.',
      },
      source: 'Es et al. 2023 — RAGAS; Honovich et al. 2022 — TRUE',
    },
    {
      heading: 'Citation Evaluation — citation recall, citation precision and attribution checks',
      body: `**Intuition:** a citation is a promise: "you can check this sentence here". Citation evaluation checks the promise — is each sentence backed by what it cites (recall), and is each citation actually pulling its weight (precision)?

**ALCE definitions (Gao et al. 2023):**
- **Citation recall** — for each statement, concatenate its cited passages; the statement counts if that concatenation **entails** it. Recall = supported statements ÷ statements. A statement with no citation scores 0.
- **Citation precision** — a citation is **irrelevant** if (a) it does not entail the statement on its own **and** (b) removing it does not change whether the remaining citations entail it. Precision = relevant citations ÷ all citations. This rewards *jointly necessary* citations and penalises padding.
- ALCE used an NLI model (TRUE, T5-11B) as the entailment judge; today you can use a DeBERTa NLI model, HHEM or an LLM judge.

**Other checks that catch real bugs:**

| Check | Catches |
|---|---|
| Cited id exists among retrieved sources | invented citations like [7] of 4 |
| Quote/span exists verbatim in the cited chunk | fabricated quotes |
| Citation density (cited sentences ÷ factual sentences) | uncited claims |
| Cited doc is current/accessible to the user | stale or permission-leaking citations |

**When to use:** any RAG product that shows citations (enterprise search, legal, support). Report citation recall, precision and F1 alongside faithfulness; recall shows "can users verify the answer?", precision shows "do citations waste the user's time?".`,
      example: `Answer with 5 statements and 6 citations:

| Statement | Citations | Judgement |
|---|---|---|
| S1 | [1] | [1] entails S1 → supported; [1] relevant |
| S2 | [2][3] | [2] alone entails; [3] neither entails alone nor needed → [3] irrelevant |
| S3 | [4] | [4] does not entail S3 → unsupported; [4] irrelevant |
| S4 | [5][6] | neither alone entails, together they do → supported; removing either breaks support → both relevant |
| S5 | none | unsupported |

- Citation recall = supported statements ÷ statements = {S1, S2, S4} = 3 ÷ 5 = **0.60**
- Citation precision = relevant ÷ all citations = {1, 2, 5, 6} = 4 ÷ 6 = **0.667**
- Citation F1 = 2 × 0.60 × 0.667 ÷ (0.60 + 0.667) = 0.800 ÷ 1.267 = **0.632**`,
      diagram: `  statement S with citations C = {c1, c2}
        │
        ├─ RECALL:    entails(concat(C), S)?  ── yes → S supported
        │
        └─ PRECISION per citation ci:
              entails(ci, S)?  ── yes → relevant
                 │ no
                 ▼
              entails(concat(C), S) && !entails(concat(C − ci), S)?
                 ── yes → relevant (jointly necessary)
                 ── no  → irrelevant`,
      code: [
        {
          language: 'typescript',
          title: 'ALCE-style citation recall and precision with an injected entailment judge',
          code: `type Statement = { text: string; citations: number[] };      // 1-based source ids
type Entails = (premise: string, hypothesis: string) => Promise<boolean>; // NLI or LLM judge

export async function citationScores(statements: Statement[], sources: string[], entails: Entails) {
  const premise = (ids: number[]) => ids.map((i) => sources[i - 1] ?? '').join('\\n');
  let supported = 0, relevant = 0, totalCitations = 0, invalid = 0;

  for (const s of statements) {
    const ids = [...new Set(s.citations)];
    invalid += ids.filter((i) => i < 1 || i > sources.length).length; // invented ids
    const valid = ids.filter((i) => i >= 1 && i <= sources.length);
    totalCitations += ids.length;
    if (!valid.length) continue; // uncited (or only invalid ids) -> unsupported
    const allSupport = await entails(premise(valid), s.text);
    if (allSupport) supported++;

    for (const c of valid) {
      const alone = await entails(premise([c]), s.text);
      const rest = valid.filter((x) => x !== c);
      // relevant if it supports alone, or the full set supports and dropping it breaks support
      const needed = allSupport && (rest.length === 0 || !(await entails(premise(rest), s.text)));
      if (alone || needed) relevant++;
    }
  }
  const recall = statements.length ? supported / statements.length : 0;
  const precision = totalCitations ? relevant / totalCitations : 0;
  const f1 = recall + precision ? (2 * recall * precision) / (recall + precision) : 0;
  return { recall, precision, f1, invalid };
}`,
        },
      ],
      prosCons: {
        pros: [
          'Measures verifiability from the user\'s perspective: can each sentence be checked where it says?',
          'Precision exposes citation padding; recall exposes uncited or mis-cited claims.',
          'Works with any entailment judge, so the same harness runs with NLI in CI and an LLM judge in audits.',
        ],
        cons: [
          { con: 'Requires splitting answers into statements and mapping citation markers reliably.', fix: 'Ask the model for structured output (sentences with citation arrays) instead of parsing free text.' },
          { con: 'Precision needs extra entailment calls per citation (alone and leave-one-out), multiplying cost.', fix: 'Skip leave-one-out for statements with a single citation, cache judge results per (premise, hypothesis) hash, and use a small NLI model.' },
          { con: 'NLI judges have short premise limits and miss support spread across a long passage.', fix: 'Cite at chunk or sentence granularity rather than whole documents, and fall back to an LLM judge for long premises.' },
        ],
      },
      keyPoints: [
        'Citation recall = statements entailed by their own citations ÷ statements.',
        'Citation precision = relevant citations ÷ all citations, with leave-one-out for joint support.',
        'Always validate cited ids and quoted spans exist before semantic checks.',
        'Request structured sentence + citations output to make evaluation reliable.',
      ],
      exercise: {
        prompt: `Write \`validateCitations(answer, sourceCount, sources)\` — the cheap, deterministic checks to run before any NLI.

**Acceptance criteria:**
- Parse sentences and their \`[n]\` markers (a sentence may have several).
- Return \`{ invalidIds, uncitedSentences, fabricatedQuotes, density }\`:
  - \`invalidIds\`: unique ids outside 1..sourceCount.
  - \`uncitedSentences\`: sentences with ≥ 6 words and no marker.
  - \`fabricatedQuotes\`: text inside double quotes that does not appear verbatim in any cited source of that sentence.
  - \`density\` = cited sentences ÷ sentences with ≥ 6 words.`,
        starter: {
          language: 'typescript',
          code: `export function validateCitations(answer: string, sourceCount: number, sources: string[]) {
  // TODO
  return { invalidIds: [] as number[], uncitedSentences: [] as string[], fabricatedQuotes: [] as string[], density: 0 };
}`,
        },
        hints: [
          'Split sentences with /(?<=[.!?])\\s+/ and collect ids with matchAll(/\\[(\\d+)\\]/g).',
          'Find quotes with matchAll(/"([^"]+)"/g).',
          'Look up sources[id - 1] only for valid ids.',
        ],
        solution: {
          language: 'typescript',
          code: `export function validateCitations(answer: string, sourceCount: number, sources: string[]) {
  const sentences = answer.split(/(?<=[.!?])\\s+/).map((s) => s.trim()).filter(Boolean);
  const invalid = new Set<number>();
  const uncitedSentences: string[] = [];
  const fabricatedQuotes: string[] = [];
  let factual = 0, cited = 0;

  for (const s of sentences) {
    const ids = [...s.matchAll(/\\[(\\d+)\\]/g)].map((m) => Number(m[1]));
    const words = s.replace(/\\[\\d+\\]/g, '').split(/\\s+/).filter(Boolean).length;
    if (words >= 6) {
      factual++;
      if (ids.length) cited++; else uncitedSentences.push(s);
    }
    const valid = ids.filter((i) => i >= 1 && i <= sourceCount);
    ids.filter((i) => i < 1 || i > sourceCount).forEach((i) => invalid.add(i));
    for (const q of s.matchAll(/"([^"]+)"/g)) {
      const found = valid.some((i) => (sources[i - 1] ?? '').includes(q[1]));
      if (!found) fabricatedQuotes.push(q[1]); // quote not in any cited source
    }
  }
  return { invalidIds: [...invalid], uncitedSentences, fabricatedQuotes, density: factual ? cited / factual : 0 };
}`,
        },
        explanation:
          'These checks are free, deterministic and catch the most embarrassing failures — invented ids, made-up quotes and uncited claims — before you spend on NLI or LLM judges. Run them on 100% of traffic and reserve semantic checks for the rest.',
      },
      quickCheck: {
        question: 'A statement cites [2] and [5]. Neither passage entails it alone, but together they do. Under ALCE, how are the two citations classified?',
        options: [
          'Both irrelevant, because neither supports the statement alone',
          'Both relevant, because removing either one breaks the joint support',
          'Only the first citation is relevant',
          'The statement is unsupported, so citations are not scored',
        ],
        correct: 1,
        explanation:
          'ALCE marks a citation irrelevant only if it fails alone AND removing it leaves support unchanged. Here each citation is necessary for the joint entailment, so both are relevant — the design rewards multi-source synthesis.',
      },
      source: 'Gao et al. 2023 — ALCE: Enabling LLMs to Generate Text with Citations',
    },
    {
      heading: 'Hallucination Detection — NLI checks, trained detectors and self-consistency (SelfCheckGPT)',
      body: `**Intuition:** there are two ways to catch someone making things up: check their story against the documents (grounding), or ask them the same question several times and see if the details change (consistency). Hallucination detectors do both.

**Families of detectors:**

| Family | How it works | Needs context? | Cost | Granularity |
|---|---|---|---|---|
| **NLI / factual-consistency models** | premise = source, hypothesis = answer sentence → entailment score | yes | very low (ms on GPU) | sentence |
| **Trained RAG detectors** — Vectara **HHEM-2.1-Open** (FLAN-T5-base, ~110M params, 0–1 consistency score); **LettuceDetect** (ModernBERT token classifier trained on RAGTruth) | supervised on hallucination datasets | yes | low | passage (HHEM), token/span (LettuceDetect) |
| **LLM-as-judge** | prompt a strong model to list unsupported spans with evidence | yes | medium–high | flexible |
| **Self-consistency — SelfCheckGPT** | sample N extra responses; score each sentence of the main answer by agreement with the samples (BERTScore, QA, n-gram, NLI or LLM-prompt variants) | **no** (black-box, zero-resource) | N extra generations | sentence |
| **Uncertainty signals** | low token log-probs / entropy | no | free if logprobs available | token |

**SelfCheckGPT insight (Manakul et al. 2023):** if the model *knows* a fact, independent samples repeat it; if it is guessing, samples diverge. A sentence contradicted by most samples is likely hallucinated. It needs no retrieval or logits — useful for closed-book generation — but consistent errors (a misconception the model always repeats) slip through.

**Taxonomy:** *intrinsic* hallucinations contradict the source; *extrinsic* ones add unverifiable content. In RAG, treat both as failures.

**Production pattern:** cheap detector on 100% of responses → threshold → flag, strip or regenerate; LLM judge on flagged and sampled responses; human review of the disagreements. Tune thresholds on in-domain labelled data, by the cost of a missed hallucination vs a false alarm.`,
      example: `Question (no retrieval): *"Give a short bio of the physicist Lise Meitner."* Main answer has 4 sentences; 5 stochastic samples (temperature 1.0) drawn. SelfCheck-NLI contradiction scores (0 = consistent, 1 = contradicted):

| Sentence | Score | Reading |
|---|---|---|
| Born in Vienna in 1878 | 0.04 | consistent |
| Co-discovered nuclear fission with Otto Hahn | 0.11 | consistent |
| Won the Nobel Prize in Physics in 1944 | 0.83 | **flag**: samples say she did *not* receive the Nobel (Hahn received the 1944 Chemistry prize) |
| Element 109, meitnerium, is named after her | 0.07 | consistent |

With threshold 0.5, one sentence is flagged. Averaged passage score = (0.04 + 0.11 + 0.83 + 0.07) ÷ 4 = **0.26**.`,
      diagram: `  ┌──── grounding route (RAG) ─────────────────────────────┐
  │ answer sentences ─► NLI / HHEM / LettuceDetect vs context│
  │                     └─► score per sentence/span          │
  └──────────────────────────────────────────────────────────┘
  ┌──── consistency route (no context) ─────────────────────┐
  │ prompt ─► main answer A  +  samples S1..SN (temp 1.0)    │
  │ for each sentence a in A: agreement(a, S1..SN)           │
  │ low agreement ─► likely hallucination                    │
  └──────────────────────────────────────────────────────────┘
        scores ─► threshold ─► flag | strip | regenerate | judge`,
      code: [
        {
          language: 'python',
          title: 'SelfCheckGPT (NLI variant) plus HHEM grounding score',
          code: `import spacy, torch
from selfcheckgpt.modeling_selfcheck import SelfCheckNLI
from transformers import AutoModelForSequenceClassification

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
nlp = spacy.load("en_core_web_sm")

# 1) Self-consistency: no retrieval needed
main = ("Lise Meitner was born in Vienna in 1878. She co-discovered nuclear fission with "
        "Otto Hahn. She won the Nobel Prize in Physics in 1944.")
samples = [  # N stochastic re-generations of the same prompt (temperature ~1.0)
    "Meitner, born in Vienna in 1878, helped explain nuclear fission; Hahn alone received the 1944 Nobel.",
    "Lise Meitner was an Austrian physicist who co-discovered fission. She never received a Nobel Prize.",
    "Born 1878 in Vienna, Meitner worked with Otto Hahn on fission; the Nobel went to Hahn.",
]
sentences = [s.text.strip() for s in nlp(main).sents]
selfcheck = SelfCheckNLI(device=device)  # DeBERTa-v3-large fine-tuned on MNLI
scores = selfcheck.predict(sentences=sentences, sampled_passages=samples)
for s, sc in zip(sentences, scores):
    print(f"{sc:.2f}  {s}")  # high score = contradicted by samples = likely hallucination

# 2) Grounding against retrieved context with Vectara HHEM-2.1-Open
hhem = AutoModelForSequenceClassification.from_pretrained(
    "vectara/hallucination_evaluation_model", trust_remote_code=True)
context = "Lise Meitner (born 1878, Vienna) co-discovered nuclear fission with Otto Hahn."
pairs = [(context, s) for s in sentences]          # (premise, hypothesis)
print(hhem.predict(pairs))  # consistency in [0, 1]; low = hallucinated w.r.t. the context`,
        },
      ],
      prosCons: {
        pros: [
          'Small NLI/HHEM-style detectors are cheap enough to score every production response in milliseconds.',
          'SelfCheckGPT works with black-box APIs and no retrieval, covering closed-book generation.',
          'Sentence/span-level scores support surgical fixes: highlight, remove or regenerate only the bad part.',
        ],
        cons: [
          { con: 'Self-consistency misses errors the model makes consistently (shared misconceptions).', fix: 'Combine with grounding against retrieved sources for factual domains; consistency is a signal, not proof.' },
          { con: 'SelfCheckGPT multiplies generation cost by N (typically 3–20 samples).', fix: 'Use it offline, on sampled traffic or only for high-risk answers, with small N (3–5) and a cheaper sampling model.' },
          { con: 'Off-the-shelf detectors are miscalibrated on new domains (jargon, numbers, tables).', fix: 'Label a few hundred in-domain examples, tune thresholds for target precision/recall, and fine-tune a small detector if needed.' },
          { con: 'NLI models struggle with long premises and numeric reasoning.', fix: 'Chunk the premise, take the max entailment across chunks, and route numeric claims to an LLM judge or a deterministic check.' },
        ],
      },
      keyPoints: [
        'Grounding detectors compare to the context; self-consistency compares to the model\'s own samples.',
        'SelfCheckGPT variants: BERTScore, QA, n-gram, NLI, LLM prompt.',
        'HHEM gives a 0–1 consistency score; LettuceDetect marks hallucinated token spans.',
        'Cheap detector on everything, LLM judge on flagged/sampled, humans on disagreements.',
      ],
      exercise: {
        prompt: `Implement a simple **self-consistency** score without ML models.

**Acceptance criteria:**
- \`consistency(sentence, samples)\` = fraction of samples that "agree" with the sentence, where agreement = token-set Jaccard similarity ≥ 0.3 with **any** sentence of that sample (lowercase, words of ≥ 3 letters).
- \`flagSentences(main, samples, threshold)\` splits \`main\` into sentences and returns those with consistency < threshold.
- Deterministic and dependency-free.`,
        starter: {
          language: 'typescript',
          code: `export function consistency(sentence: string, samples: string[]): number {
  // TODO
  return 1;
}

export function flagSentences(main: string, samples: string[], threshold = 0.5): string[] {
  // TODO
  return [];
}`,
        },
        hints: [
          'tokens(s) = new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []).',
          'Jaccard = |A ∩ B| ÷ |A ∪ B|.',
          'A sample agrees if any of its sentences reaches the Jaccard threshold.',
        ],
        solution: {
          language: 'typescript',
          code: `const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);
const jaccard = (a: Set<string>, b: Set<string>) => {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
};
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\\s+/).map((s) => s.trim()).filter(Boolean);

export function consistency(sentence: string, samples: string[]): number {
  if (!samples.length) return 1;
  const a = tokens(sentence);
  const agree = samples.filter((smp) => sentencesOf(smp).some((s) => jaccard(a, tokens(s)) >= 0.3)).length;
  return agree / samples.length;
}

export function flagSentences(main: string, samples: string[], threshold = 0.5): string[] {
  return sentencesOf(main).filter((s) => consistency(s, samples) < threshold); // low agreement -> suspect
}`,
        },
        explanation:
          'This is SelfCheckGPT\'s idea with a crude similarity function (close to its n-gram flavour). Lexical overlap cannot detect contradictions ("won" vs "never won" share most words), which is why the NLI and LLM-prompt variants perform better — swap jaccard for an NLI contradiction score to upgrade it.',
      },
      quickCheck: {
        question: 'A model consistently states the same wrong founding year for a company across all 10 samples. What does SelfCheckGPT report?',
        options: [
          'A high hallucination score, because the fact is wrong',
          'A low hallucination score, because the samples agree — consistency is not correctness',
          'An error, because SelfCheckGPT requires retrieved context',
          'A score of exactly 0.5',
        ],
        correct: 1,
        explanation:
          'SelfCheckGPT measures agreement among the model\'s own samples; a confidently repeated error is consistent and passes. Grounding against trusted sources is needed to catch it. SelfCheckGPT does not need context, and there is no fixed 0.5 output.',
      },
      source: 'Manakul et al. 2023 — SelfCheckGPT; Vectara HHEM-2.1-Open; LettuceDetect (2025)',
    },
  ],
  codeChallenges: [
    {
      id: 'groundedness-hallucinations-cc-1',
      title: 'Replace a cosine-similarity "grounding check" with sentence-level entailment',
      context:
        'A RAG product blocks answers whose embedding has cosine < 0.75 with the retrieved context. It lets through "Refunds take 30 days" when the context says "Refunds take 3 days" (cosine 0.93), and blocks correct but paraphrased answers. It also scores the whole answer at once, so one bad sentence hides among good ones.',
      task: 'Rewrite the guard to score each sentence with an entailment judge (max over chunks), detect contradictions explicitly, strip or flag unsupported sentences, and return a structured result with an abstain path.',
      starter: {
        language: 'typescript',
        code: `export async function guard(answer: string, chunks: string[]) {
  const [a, c] = await embed([answer, chunks.join('\\n')]);
  const sim = cosine(a, c);
  return sim >= 0.75 ? { ok: true, answer } : { ok: false, answer: 'Sorry, I cannot answer.' };
}`,
      },
      hints: [
        'Topical similarity is not entailment: "3 days" and "30 days" embed almost identically.',
        'Split into sentences; for each, call nli(chunk, sentence) on every chunk and keep the max entailment and max contradiction.',
        'Decide per sentence: supported, contradicted or unsupported; then keep, drop or abstain based on counts.',
      ],
      solution: {
        language: 'typescript',
        code: `type NliScores = { entailment: number; contradiction: number; neutral: number };
type Nli = (premise: string, hypothesis: string) => Promise<NliScores>; // e.g. DeBERTa NLI service

export async function guard(answer: string, chunks: string[], nli: Nli, tau = 0.6) {
  const sentences = answer.split(/(?<=[.!?])\\s+/).map((s) => s.trim()).filter(Boolean);
  const verdicts = await Promise.all(
    sentences.map(async (s) => {
      const scores = await Promise.all(chunks.map((c) => nli(c, s))); // chunk-level premises fit NLI limits
      const ent = Math.max(0, ...scores.map((x) => x.entailment));
      const con = Math.max(0, ...scores.map((x) => x.contradiction));
      const label = con >= tau ? 'contradicted' : ent >= tau ? 'supported' : 'unsupported';
      return { sentence: s, label, ent: +ent.toFixed(2), con: +con.toFixed(2) };
    }),
  );
  const supported = verdicts.filter((v) => v.label === 'supported');
  const contradicted = verdicts.filter((v) => v.label === 'contradicted');

  if (contradicted.length || supported.length === 0) {
    // a contradiction is worse than an omission: abstain rather than show a wrong fact
    return { ok: false, answer: "I couldn't verify an answer in the sources.", verdicts };
  }
  const safe = supported.map((v) => v.sentence).join(' ');
  return {
    ok: supported.length === verdicts.length,
    answer: safe, // unsupported sentences stripped
    faithfulness: supported.length / verdicts.length,
    verdicts,     // log for review and UI highlighting
  };
}`,
      },
      explanation:
        'Embedding similarity measures topic, not truth: numbers, negations and swapped entities barely change cosine. NLI per sentence detects entailment and contradiction directly; taking the max over chunks respects NLI input limits; per-sentence verdicts allow stripping unsupported sentences instead of rejecting good answers, and contradictions trigger abstention because showing a wrong fact is the costliest error.',
      followUps: [
        { q: 'Stripping sentences can make the answer incoherent. What else could you do?', a: 'Regenerate with an instruction listing the unsupported sentences to remove or support with citations, or show the answer with unsupported sentences visibly flagged instead of deleting them.' },
        { q: 'How would you choose tau?', a: 'Label a few hundred in-domain (context, sentence) pairs, plot precision/recall of "supported" across thresholds, and choose the point that meets the business tolerance for unsupported claims reaching users.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-cc-2',
      title: 'Harden an LLM-judge hallucination checker that hallucinates itself',
      context:
        'An LLM judge returns free-text like "Mostly grounded, minor issue with the date". The team regex-parses "grounded" and passes the answer. Audits show the judge sometimes cites evidence that is not in the context, and results change between runs.',
      task: 'Make the judge return structured per-claim verdicts with verbatim evidence quotes, verify each quote exists in the context, treat unverifiable verdicts as unsupported, and make the run reproducible.',
      starter: {
        language: 'typescript',
        code: `export async function isGrounded(answer: string, context: string) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Is this answer grounded?\\n' + context + '\\n' + answer }],
  });
  return /grounded/i.test(r.choices[0].message.content ?? '');
}`,
      },
      hints: [
        'Use a zod schema: claims[] with verdict enum and evidence string.',
        'A "supported" verdict whose evidence is not a substring of the context should be downgraded to unsupported.',
        'Pin the judge model from config and set temperature 0 where supported.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const openai = new OpenAI();
const JUDGE = process.env.JUDGE_MODEL ?? 'gpt-5-mini';

const Report = z.object({
  claims: z.array(z.object({
    claim: z.string(),
    verdict: z.enum(['supported', 'unsupported', 'contradicted']),
    evidence: z.string(), // verbatim quote from CONTEXT, or "" if none
  })),
});

const norm = (s: string) => s.replace(/\\s+/g, ' ').trim().toLowerCase();

export async function checkGrounding(answer: string, context: string) {
  const r = await openai.chat.completions.parse({
    model: JUDGE,
    // GPT-5 / o-series reasoning models reject temperature != 1; pin a dated snapshot instead
    ...(/^(gpt-5|o\d)/.test(JUDGE) ? {} : { temperature: 0 }),
    messages: [
      { role: 'system', content: 'You verify answers against CONTEXT only. For each atomic claim give a verdict and copy the exact supporting sentence from CONTEXT as evidence ("" if none). Never use outside knowledge.' },
      { role: 'user', content: 'CONTEXT:\\n' + context + '\\n\\nANSWER:\\n' + answer },
    ],
    response_format: zodResponseFormat(Report, 'report'),
  });
  const report = r.choices[0].message.parsed;
  if (!report) return { grounded: false, reason: 'judge_failed', claims: [] };

  const ctx = norm(context);
  const claims = report.claims.map((c) =>
    c.verdict === 'supported' && (!c.evidence || !ctx.includes(norm(c.evidence)))
      ? { ...c, verdict: 'unsupported' as const, note: 'evidence quote not found in context' } // judge hallucinated
      : c,
  );
  const bad = claims.filter((c) => c.verdict !== 'supported');
  return { grounded: claims.length > 0 && bad.length === 0, faithfulness: claims.length ? (claims.length - bad.length) / claims.length : null, claims };
}`,
      },
      explanation:
        'Structured verdicts remove brittle regex parsing ("not grounded" matched /grounded/ before). Requiring a verbatim evidence quote and checking it against the context catches the judge\'s own hallucinations cheaply. Per-claim output makes failures actionable, and a pinned model with temperature 0 reduces run-to-run variance.',
      followUps: [
        { q: 'What if the support is a paraphrase spread across two sentences?', a: 'Allow evidence as an array of quotes and verify each quote exists; the judge can then cite multiple sentences while every quote is still mechanically checkable.' },
        { q: 'How do you measure whether this judge is good enough?', a: 'Run it on a labelled hallucination set (in-domain or RAGTruth-style), report precision and recall for the unsupported class, and compare against a cheaper NLI detector to decide where each belongs in the pipeline.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'groundedness-hallucinations-iq-1',
      difficulty: 'hard',
      question: 'Design a hallucination-detection layer for a medical-information RAG assistant that answers 100K questions a day.',
      context: 'Regulators require that every displayed statement is traceable to an approved source. Latency budget for checks is 300 ms p95.',
      whatInterviewerLooksFor: [
        'Sentence-level grounding with structured citations',
        'Tiered detectors fitting the latency budget',
        'Clear action policy (strip, flag, abstain, human review)',
        'Calibration on in-domain labelled data and monitoring',
      ],
      modelAnswer: `**1. Make answers checkable by construction.** Generate structured output: \`[{sentence, citations: [chunkId]}]\` from approved sources only. Cite at chunk/sentence granularity.

**2. Deterministic checks (≈ 1 ms, 100%).** Cited ids exist and were retrieved; quoted spans exist verbatim; every factual sentence has a citation; cited documents are current and approved.

**3. Fast semantic check (≈ 50–150 ms, 100%).** Per sentence, an NLI or HHEM-style model scores entailment against its cited chunks (batched on GPU). Contradiction ≥ τ_c → abstain; entailment < τ_e → mark unsupported.

**4. Action policy.**
- Any contradiction → don't show the answer; show "I couldn't verify…" with links to sources.
- Unsupported non-critical sentences → strip and regenerate once, or display flagged.
- Dosages, contraindications, numbers → stricter threshold, plus deterministic number matching against the source.

**5. Asynchronous deep check (sampled + all flagged).** LLM judge with evidence quotes; disagreements with the fast detector go to clinicians for review and become labelled data.

**6. Calibration and monitoring.** Build an in-domain set of ~1,000 labelled (source, sentence) pairs; tune τ for high recall on unsupported claims. Dashboards: abstention rate, flagged-sentence rate, judge–detector agreement, drift after model or corpus changes.`,
      followUps: [
        { q: 'Why not run an LLM judge on everything?', a: 'At 100K answers/day with ~6 sentences each, judge calls add seconds of latency and significant cost; the fast detector meets the 300 ms budget, and the judge is reserved for flagged or sampled traffic.' },
        { q: 'How do you handle numeric claims like dosages?', a: 'Extract numbers and units from the sentence and require exact matches in the cited chunk, because NLI models are weak at numeric reasoning; any mismatch blocks the sentence.' },
      ],
      pitfalls: [
        'Answer-level scoring that hides individual bad sentences',
        'Using embedding similarity as a grounding check',
        'Untuned thresholds from a generic benchmark',
      ],
    },
    {
      id: 'groundedness-hallucinations-iq-2',
      difficulty: 'medium',
      question: 'What is the difference between groundedness (faithfulness) and factual correctness, and why does a RAG team need both metrics?',
      whatInterviewerLooksFor: [
        'Precise definitions relative to context vs world/reference',
        'The 2×2 of grounded/correct',
        'Which failures each metric diagnoses',
        'How to measure each (reference-free vs reference-based)',
      ],
      modelAnswer: `**Groundedness / faithfulness** compares the answer to the **retrieved context**: is every claim supported by what the model was given? It is reference-free, so it runs on live traffic.

**Correctness** compares the answer to **the truth**, usually a reference answer in a golden set (or human judgement). It needs labels.

| | Grounded | Not grounded |
|---|---|---|
| Correct | ✅ goal | model's memory happened to be right — unverifiable, risky |
| Incorrect | retrieval brought wrong/stale content | hallucination |

**Why both:**
- Low faithfulness → generation problem (prompt, model, too much noisy context).
- High faithfulness + low correctness → retrieval or content problem (wrong version, missing doc, ACL filtering out the right doc).
- High correctness + low faithfulness → answers are right "by luck" from parametric memory, which breaks on private or changing facts and makes citations meaningless.

**Measurement:** faithfulness via claim decomposition + NLI/LLM judge; correctness via reference comparison (LLM judge with the reference, exact match for short facts), on a golden set refreshed from production.`,
      followUps: [
        { q: 'Can an answer be faithful and still mislead users?', a: 'Yes, if it omits key caveats present in the context or answers from a superseded document; completeness and version checks address that.' },
        { q: 'Which would you put on a live dashboard?', a: 'Faithfulness and response relevancy on sampled traffic (reference-free), plus correctness from nightly golden-set runs.' },
      ],
      pitfalls: [
        'Using the terms interchangeably',
        'Assuming high faithfulness means the answer is right',
        'Not knowing which metric needs a reference',
      ],
    },
    {
      id: 'groundedness-hallucinations-iq-3',
      difficulty: 'hard',
      question: 'Explain SelfCheckGPT: how it works, which variants exist, when you would use it, and its blind spots.',
      whatInterviewerLooksFor: [
        'Sampling-based consistency intuition',
        'Sentence-level scoring and variants',
        'Black-box, zero-resource applicability',
        'Limitations: consistent errors, cost',
      ],
      modelAnswer: `**Idea (Manakul et al. 2023):** if an LLM genuinely knows a fact, stochastically sampled responses to the same prompt will tend to contain consistent statements; hallucinated details tend to diverge or contradict across samples.

**Procedure**
1. Generate the main response (often greedy).
2. Sample N additional responses (e.g. N = 5–20, temperature ≈ 1).
3. For each sentence of the main response, measure how well the samples support it; average or aggregate to a passage score.

**Variants (how "support" is measured)**
- **BERTScore**: similarity of the sentence to the most similar sentence in each sample.
- **QA**: generate questions from the sentence, answer them using each sample, compare answers.
- **n-gram**: train a simple n-gram model on the samples; rare/low-probability tokens indicate hallucination.
- **NLI**: contradiction probability of the sentence given each sample (DeBERTa MNLI).
- **Prompt**: ask an LLM "Is the sentence supported by this sample? Yes/No" — the strongest but costliest.

**When to use:** closed-book generation (bios, summaries without sources), black-box APIs without logits, offline audits of a model's knowledge.

**Blind spots**
- **Consistent errors** pass (the model always repeats the same misconception).
- **Cost**: N extra generations per answer.
- **In RAG**, samples share the same context, so grounding checks against the sources are more direct and cheaper.`,
      followUps: [
        { q: 'How would you reduce SelfCheckGPT cost in production?', a: 'Run it only on high-risk or low-confidence answers, use small N (3–5), sample with a cheaper model when appropriate, and run asynchronously for monitoring rather than blocking.' },
        { q: 'Why does it work without logprobs?', a: 'It only needs text outputs: the variability across samples is an external proxy for the model\'s uncertainty, which is why it suits black-box APIs.' },
      ],
      pitfalls: [
        'Claiming it verifies truth rather than consistency',
        'Ignoring the N-fold cost',
        'Using it instead of grounding checks in RAG',
      ],
    },
    {
      id: 'groundedness-hallucinations-iq-4',
      difficulty: 'expert',
      question: 'Your citation precision is 0.92 but citation recall is 0.55. Users say "the citations look fine but I can\'t verify half the answer". Diagnose and fix.',
      whatInterviewerLooksFor: [
        'Interprets precision vs recall correctly',
        'Identifies uncited and mis-scoped statements',
        'Generation-side and retrieval-side fixes',
        'Re-measurement plan',
      ],
      modelAnswer: `**Reading the numbers:** precision 0.92 means the citations that exist are mostly relevant. Recall 0.55 means ~45% of statements are **not entailed by their own citations** — either uncited, or citing a passage that supports only part of the sentence.

**Diagnose with per-statement traces** (sample 50 failures):
1. **Uncited statements** — model adds synthesis or background without a marker.
2. **Over-long statements** — one sentence merges two facts from two sources but cites one.
3. **Unsupported content** — the statement is a hallucination or comes from parametric memory.
4. **Coarse citations** — citing a whole document whose relevant part was truncated from the context.
5. **Judge limits** — NLI premise truncation marks long-but-supported citations as failing.

**Fixes**
- **Structured generation:** require \`{sentence, citations[]}\` per sentence; instruct "one fact per sentence; every sentence needs ≥ 1 citation; omit facts you cannot cite".
- **Post-generation repair:** for statements failing recall, try to find a supporting retrieved chunk (NLI over all chunks) and attach it; else strip or flag the statement.
- **Granularity:** chunk-level ids, not whole documents; keep chunks under the judge's premise limit.
- **Retrieval:** if many unsupported statements are factual gaps, raise context recall (the model is filling in missing evidence).
- **Evaluation:** confirm judge behaviour on a hand-labelled sample; re-measure citation recall/precision/F1 and faithfulness after each change.`,
      followUps: [
        { q: 'Could automatically attaching citations be dangerous?', a: 'Yes, if the attachment threshold is loose it manufactures weak citations; require high entailment, and prefer stripping or flagging when no chunk clearly supports the sentence.' },
        { q: 'What target would you set?', a: 'Depends on risk; for enterprise search, citation recall ≥ 0.85 with precision ≥ 0.85 is a reasonable bar, validated against human ratings of verifiability.' },
      ],
      pitfalls: [
        'Confusing citation precision with answer accuracy',
        'Only tweaking prompts without measuring per-statement failures',
        'Ignoring judge premise-length limits',
      ],
    },
    {
      id: 'groundedness-hallucinations-iq-5',
      difficulty: 'hard',
      question: 'Compare NLI models, trained detectors like HHEM or LettuceDetect, and LLM judges for hallucination detection. How would you combine them?',
      whatInterviewerLooksFor: [
        'Cost, latency and granularity trade-offs',
        'Accuracy limitations of each',
        'A tiered architecture',
        'Calibration and evaluation on labelled data',
      ],
      modelAnswer: `| | NLI cross-encoder | Trained RAG detector (HHEM, LettuceDetect) | LLM judge |
|---|---|---|---|
| Size / cost | ~100–400M params, ms per pair on GPU | ~110M–400M, ms | large model, 100s of ms–s, per-token pricing |
| Input limits | ~512 tokens premise | longer contexts (HHEM-2.1 lifted the 512 cap; ModernBERT 8K) | very long |
| Granularity | sentence | passage score (HHEM) / token spans (LettuceDetect) | flexible, with explanations |
| Strengths | cheap, deterministic | trained on RAG hallucination data (e.g. RAGTruth) | multi-hop, paraphrase, numbers, explanations |
| Weaknesses | multi-chunk support, numbers | domain shift | cost, variance, can hallucinate verdicts |

**Combination (tiered)**
1. **Deterministic checks** on 100%: citation ids, quotes, numbers.
2. **Fast detector** on 100%: span-level (LettuceDetect) or sentence-level (NLI/HHEM). Thresholds tuned for high recall.
3. **LLM judge** on items the detector flags or is uncertain about (e.g. score in 0.3–0.7), plus a random 1–2% sample for calibration; demand verbatim evidence quotes.
4. **Humans** on judge–detector disagreements; their labels feed detector fine-tuning and threshold updates.

**Evaluate** every tier on in-domain labelled data (precision/recall for hallucinated sentences or spans), and track agreement over time to detect drift.`,
      followUps: [
        { q: 'Why is span-level detection useful for UX?', a: 'It lets you highlight or remove exactly the hallucinated words or phrases, rather than discarding whole sentences or answers, preserving useful content.' },
        { q: 'When would you fine-tune your own detector?', a: 'When off-the-shelf detectors show poor recall on your domain after threshold tuning and you have a few thousand labelled examples, often bootstrapped from LLM-judge labels that humans verified.' },
      ],
      pitfalls: [
        'Picking one detector for everything',
        'Trusting benchmark numbers without in-domain validation',
        'Ignoring judge variance and self-hallucination',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'groundedness-hallucinations-est-1',
      question: 'Is it cheaper to verify every answer of a 200K-answers-per-day assistant with a self-hosted NLI model or with an LLM judge? Estimate GPU load and daily cost for both.',
      assumptions: [
        '6 sentences per answer, 5 retrieved chunks per answer; NLI checks every (chunk, sentence) pair',
        'DeBERTa-base NLI throughput ≈ 1,000 pairs/s per GPU at ~300 tokens per pair; peak traffic = 3× average',
        'GPU illustrative cost $1.20/hour',
        'LLM judge: 4,500 input + 500 output tokens per answer at illustrative $0.25 / 1M input and $2 / 1M output',
      ],
      steps: [
        { label: 'NLI pairs per day', calc: '200,000 × 6 × 5 = 6,000,000 pairs' },
        { label: 'Average and peak rate', calc: '6,000,000 / 86,400 ≈ 69 pairs/s; peak 3× ≈ 208 pairs/s' },
        { label: 'GPUs needed', calc: '208 / 1,000 ≈ 0.21 → 1 GPU (2 for redundancy)' },
        { label: 'NLI daily cost', calc: '2 GPUs × 24 h × $1.20 = $57.6/day' },
        { label: 'Judge input cost', calc: '200,000 × 4,500 = 900M tokens × $0.25 / 1M = $225' },
        { label: 'Judge output cost', calc: '200,000 × 500 = 100M tokens × $2 / 1M = $200' },
        { label: 'Judge daily cost', calc: '$225 + $200 = $425/day' },
      ],
      answer: 'NLI on every answer ≈ $58/day on two small GPUs (with large headroom); an LLM judge on every answer ≈ $425/day — about 7× more, plus higher latency.',
      insight:
        'Cheap detectors make 100% coverage affordable; the LLM judge belongs on the flagged 5–10% (≈ $21–43/day) where its flexibility matters. The real constraint for the judge is often latency, not money.',
      followUps: [
        { q: 'What if you batch all 6 sentences against concatenated chunks instead of pairwise?', a: 'Pairs drop to 6 per answer (1.2M/day), but concatenated context exceeds the ~512-token NLI limit and gets truncated, hurting recall; pairwise at chunk level is the safer default.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-est-2',
      question: 'What would SelfCheckGPT cost per day and per answer in latency on 50K closed-book answers if you sampled 5 extra responses per answer?',
      assumptions: [
        'Prompt 2,000 input tokens; each response 300 output tokens',
        'Illustrative price $0.25 / 1M input, $2 / 1M output',
        'Generation speed 80 tokens/s; TTFT 0.5 s; samples run in parallel',
        'NLI scoring: 6 sentences × 5 samples per answer',
      ],
      steps: [
        { label: 'Extra input tokens', calc: '50,000 × 5 × 2,000 = 500M → $125/day' },
        { label: 'Extra output tokens', calc: '50,000 × 5 × 300 = 75M → $150/day' },
        { label: 'Extra LLM cost', calc: '$125 + $150 = $275/day (vs $25 + $30 = $55/day for the main answers)' },
        { label: 'NLI pairs', calc: '50,000 × 6 × 5 = 1.5M pairs/day — trivial on one GPU' },
        { label: 'Added latency (parallel samples)', calc: '0.5 s + 300 / 80 s = 0.5 + 3.75 ≈ 4.25 s, plus ~50 ms NLI' },
      ],
      answer: 'About $275/day extra (≈ 5× the base generation cost) and ~4.3 s extra latency if run synchronously.',
      insight:
        'Self-consistency multiplies generation cost by N and adds a full generation of latency, so it fits offline audits, sampled monitoring or high-stakes asynchronous review — not the synchronous path. Prompt caching of the shared 2,000-token prompt can cut the input share substantially.',
      followUps: [
        { q: 'How much would 1% sampling cost?', a: 'About $2.75/day for 500 answers, enough to track hallucination rates with about ±3.5-point 95% confidence on a 20% rate per day (1.96 × sqrt(0.2 × 0.8 / 500) ≈ 0.035), or tighter over a week.' },
      ],
    },
  ],
  test: [
    {
      id: 'groundedness-hallucinations-mcq-01',
      difficulty: 'medium',
      question: 'An answer has 8 atomic claims; 6 are entailed by the retrieved context, 1 contradicts it, and 1 is not mentioned in it. What is the RAGAS-style faithfulness score?',
      options: ['0.75', '0.875', '0.857', '0.625'],
      correct: [0],
      explanation:
        'Faithfulness = supported ÷ total = 6 ÷ 8 = 0.75. Both the contradicted and the unmentioned claim count as unsupported. 0.875 wrongly counts the unmentioned claim as fine; 0.857 drops a claim from the denominator.',
      followUps: [
        { q: 'Why might you still want to distinguish the two unsupported claims?', a: 'A contradiction is an intrinsic hallucination and usually more harmful than an unverifiable addition, so many systems abstain on contradictions but only flag or strip unsupported additions.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-02',
      difficulty: 'hard',
      question: 'This grounding check passes "Refunds take 30 days" against a context saying "Refunds take 3 days". Why?',
      code: {
        language: 'typescript',
        code: `const [a, c] = await embed([answerSentence, contextChunk]);
const grounded = cosine(a, c) >= 0.8;   // 0.94 for the example above`,
      },
      options: [
        'The threshold 0.8 is too low; 0.95 would fix it',
        'Embedding similarity measures topical closeness, not entailment; numbers and negations barely move the vectors',
        'The embedding model needs normalisation',
        'Cosine should be replaced by Euclidean distance',
      ],
      correct: [1],
      explanation:
        'Two sentences about refund timing are near-identical in embedding space even when the number differs, so similarity cannot detect contradiction. Use NLI or an LLM judge per sentence. Raising the threshold just blocks paraphrases; normalisation or another distance metric do not add entailment reasoning.',
      followUps: [
        { q: 'What extra deterministic check helps with numbers?', a: 'Extract numbers with units from the answer sentence and require exact matches in the cited chunk, flagging any mismatch regardless of semantic scores.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-03',
      difficulty: 'hard',
      question: 'Select ALL statements that correctly describe ALCE citation metrics.',
      options: [
        'Citation recall checks whether each statement is entailed by the concatenation of its own cited passages',
        'A citation that does not support a statement alone, but is required for joint support, counts as relevant',
        'Citation precision is the fraction of statements that have at least one citation',
        'A statement with no citations counts against citation recall',
      ],
      correct: [0, 1, 3],
      explanation:
        'Recall uses entailment by the cited set; precision uses the alone-or-necessary rule, so jointly necessary citations are relevant; uncited statements fail recall. "Fraction of statements with a citation" is citation density/coverage, not precision.',
      followUps: [
        { q: 'What judge did ALCE use for entailment?', a: 'An NLI model (TRUE, based on T5-11B), chosen for automatic, reproducible evaluation of attribution.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-04',
      difficulty: 'medium',
      question: 'What is the core assumption behind SelfCheckGPT?',
      options: [
        'Hallucinated sentences have more tokens than factual ones',
        'Facts the model knows are reproduced consistently across sampled responses, while hallucinated details vary',
        'Retrieved documents always contain the correct answer',
        'Low temperature eliminates hallucinations',
      ],
      correct: [1],
      explanation:
        'SelfCheckGPT uses agreement across stochastic samples as a proxy for model knowledge. It needs no retrieval, makes no claim about length, and does not assume temperature removes hallucinations — it actually uses high-temperature samples.',
      followUps: [
        { q: 'Which errors does that assumption miss?', a: 'Consistent misconceptions: if the model always generates the same wrong fact, samples agree and the sentence looks reliable.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-05',
      difficulty: 'expert',
      question: 'Your NLI-based checker marks many correct long-answer sentences as unsupported. Logs show premises of ~2,000 tokens. Select ALL fixes that address the root cause.',
      options: [
        'Score each sentence against each retrieved chunk separately and take the max entailment',
        'Use a detector with a longer context window, or an LLM judge, for long premises',
        'Lower the generator temperature',
        'Cite and verify at chunk or sentence granularity instead of whole documents',
      ],
      correct: [0, 1, 3],
      explanation:
        'Typical NLI cross-encoders truncate around 512 tokens, so supporting text past the cut is invisible. Chunk-level scoring, longer-context detectors and finer citation granularity all fix that. Generator temperature does not affect how the checker truncates.',
      followUps: [
        { q: 'What does max-over-chunks miss?', a: 'Claims that need two chunks together; handle those by also testing adjacent chunk pairs or routing neutral verdicts to an LLM judge.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-06',
      difficulty: 'hard',
      question: 'A support bot gates answers on a free-text grounding verdict as below. Which inputs slip through incorrectly?',
      code: {
        language: 'typescript',
        code: `const verdict = (await llm('Is the answer grounded in the context? ' + payload)).toLowerCase();
if (verdict.includes('grounded')) show(answer);
else block(answer);`,
      },
      options: [
        'toLowerCase() breaks Unicode',
        '"not grounded" and "ungrounded" both contain "grounded", so ungrounded answers are shown',
        'includes() is case-sensitive',
        'The judge should be called after show()',
      ],
      correct: [1],
      explanation:
        'Substring matching treats negative verdicts as positive. Use structured outputs with an enum verdict (and per-claim details) instead of free-text parsing. Lowercasing is fine here, includes is applied after lowercasing, and judging must precede display.',
      followUps: [
        { q: 'What else should a robust judge return?', a: 'Per-claim verdicts with verbatim evidence quotes, so you can verify the quotes exist in the context and catch the judge\'s own hallucinations.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-07',
      difficulty: 'hard',
      question: 'Which detector best fits a requirement to highlight exactly which words in a RAG answer are unsupported, at low latency on every response?',
      options: [
        'SelfCheckGPT with 20 samples',
        'A token-classification detector such as LettuceDetect (ModernBERT trained on RAGTruth)',
        'Answer-level cosine similarity',
        'A weekly human review',
      ],
      correct: [1],
      explanation:
        'Token-level detectors label each answer token as supported or hallucinated, giving spans for highlighting at encoder-model speed. SelfCheckGPT is sentence-level and needs many generations; cosine similarity cannot detect unsupported content; weekly review is not real-time.',
      followUps: [
        { q: 'How are token predictions turned into highlight spans?', a: 'Consecutive tokens whose hallucination probability exceeds a threshold (e.g. 0.5) are merged into spans, which are mapped back to character offsets in the answer.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-08',
      difficulty: 'expert',
      question: 'Compute citation recall and precision: S1 cites [1] (supports); S2 cites [2][3] ([2] supports alone, [3] adds nothing); S3 cites [4] (does not support); S4 has no citation.',
      options: [
        'Recall 0.50, precision 0.50',
        'Recall 0.50, precision 0.667',
        'Recall 0.667, precision 0.50',
        'Recall 0.75, precision 0.75',
      ],
      correct: [0],
      explanation:
        'Supported statements: S1 and S2 → 2 ÷ 4 = 0.50 recall. Citations: [1] relevant, [2] relevant, [3] irrelevant (fails alone, not needed), [4] irrelevant (fails alone, statement unsupported) → 2 ÷ 4 = 0.50 precision. Counting [4] as relevant or ignoring uncited S4 produces the distractors.',
      followUps: [
        { q: 'What is citation F1 here?', a: 'F1 = 2 × 0.5 × 0.5 ÷ (0.5 + 0.5) = 0.5, since recall and precision are equal.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-09',
      difficulty: 'hard',
      question: 'Select ALL appropriate uses of SelfCheckGPT-style self-consistency checks.',
      options: [
        'Auditing a black-box API model\'s closed-book biographies without any reference corpus',
        'Synchronous checking of every chat response under a 200 ms latency budget',
        'Offline monitoring of hallucination rates on a sample of production traffic',
        'Prioritising which answers to send to an LLM judge or human review',
      ],
      correct: [0, 2, 3],
      explanation:
        'Self-consistency needs no references or logits, so it suits black-box audits, sampled monitoring and triage. It requires N extra generations, which cannot fit a 200 ms synchronous budget.',
      followUps: [
        { q: 'How would you make it cheaper for triage?', a: 'Use 3 samples instead of 20, a cheaper model for sampling, prompt caching for the shared prompt, and run asynchronously after the answer is shown.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-10',
      difficulty: 'medium',
      question: 'Which example is an intrinsic (rather than extrinsic) hallucination relative to the source?',
      options: [
        'Source: "The plan costs $20/month." Answer adds: "It was launched in 2019."',
        'Source: "The plan costs $20/month." Answer: "The plan costs $25/month."',
        'Source: "The plan costs $20/month." Answer: "The plan costs $20 per month."',
        'Source is empty; answer refuses to respond',
      ],
      correct: [1],
      explanation:
        'Intrinsic hallucinations contradict the source ($25 vs $20). Adding an unverifiable launch year is extrinsic. The paraphrase is faithful, and a refusal contains no claims.',
      followUps: [
        { q: 'Which type do NLI models detect more directly?', a: 'Intrinsic ones, via high contradiction probability; extrinsic ones show up as neutral (not entailed), which needs a threshold on entailment rather than contradiction.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-11',
      difficulty: 'expert',
      question: 'Select ALL changes that make an LLM-judge faithfulness metric more reliable.',
      options: [
        'Require per-claim verdicts with verbatim evidence quotes and verify the quotes exist in the context',
        'Use structured outputs with an enum verdict instead of free text',
        'Ask for a single 1–10 holistic rating per answer',
        'Validate the judge against a human-labelled sample and track agreement',
      ],
      correct: [0, 1, 3],
      explanation:
        'Evidence quotes, structured verdicts and human validation reduce judge errors and make them measurable. Holistic 1–10 ratings are high-variance, uncalibrated and give no actionable detail about which claim failed.',
      followUps: [
        { q: 'Why is quote verification powerful?', a: 'It is a deterministic check of the judge\'s own claim: if the "evidence" is not in the context, the supported verdict is itself hallucinated and can be downgraded automatically.' },
      ],
    },
    {
      id: 'groundedness-hallucinations-mcq-12',
      difficulty: 'hard',
      question: 'What does this code compute, and what is the subtle problem?',
      code: {
        language: 'python',
        code: `probs = softmax(nli.predict([(context_all_chunks_joined, claim)]))
supported = probs[0, ENTAIL] > 0.5`,
      },
      options: [
        'It computes contradiction; the index is wrong',
        'It computes entailment of the claim by the full context, but joining all chunks likely exceeds the NLI model\'s input limit, so text gets truncated and supporting evidence can be cut off',
        'It computes BERTScore; it should use cosine instead',
        'Nothing is wrong; joining chunks is the recommended practice',
      ],
      correct: [1],
      explanation:
        'Passing one huge premise silently truncates at the model\'s max length (~512 tokens for typical DeBERTa NLI), so evidence near the end is invisible and correct claims look unsupported. Score per chunk (max) or use a longer-context detector. The index selects entailment correctly, and this is NLI, not BERTScore.',
      followUps: [
        { q: 'How can you detect truncation happening?', a: 'Tokenise premise + hypothesis before scoring and log or assert when the length exceeds the model\'s maximum, then switch to chunked scoring.' },
      ],
    },
  ],
};

export default topic;
