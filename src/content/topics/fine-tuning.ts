import type { Topic } from '../../types';

const topic: Topic = {
  id: 'fine-tuning',
  phase: 'models',
  order: 1,
  title: 'Fine-Tuning, LoRA and QLoRA',
  subtitle: 'When to change the weights, how to build the dataset, and how to train adapters on one GPU',
  estimatedMinutes: 60,
  sources: [
    'Hu et al. 2021 — LoRA: Low-Rank Adaptation of Large Language Models (arXiv:2106.09685)',
    'Dettmers et al. 2023 — QLoRA: Efficient Finetuning of Quantized LLMs (arXiv:2305.14314)',
    'Hugging Face TRL docs — SFT Trainer (v1.x): SFTConfig, assistant_only_loss, completion_only_loss, packing',
    'Hugging Face PEFT docs — LoraConfig, target_modules="all-linear", multiple adapters, merge_and_unload',
    'Hugging Face Transformers docs — BitsAndBytesConfig (nf4, double quant)',
    'Zhou et al. 2023 — LIMA: Less Is More for Alignment (arXiv:2305.11206)',
    'Liu et al. 2024 — DoRA: Weight-Decomposed Low-Rank Adaptation (arXiv:2402.09353)',
    'Kalajdzievski 2023 — rsLoRA: A Rank Stabilization Scaling Factor for Fine-Tuning with LoRA (arXiv:2312.03732)',
    'Sheng et al. 2023 — S-LoRA: Serving Thousands of Concurrent LoRA Adapters (arXiv:2311.03285)',
  ],
  tags: ['fine-tuning', 'sft', 'lora', 'qlora', 'peft', 'trl', 'bitsandbytes', 'adapters'],
  cheatSheet: [
    'Order of escalation: prompt → few-shot → RAG (for knowledge) → fine-tune (for behaviour, format, style, latency/cost). Fine-tuning teaches *how*, RAG supplies *what*.',
    'Chat JSONL: one {"messages":[{role,content}...]} per line; train only on assistant tokens (assistant_only_loss / completion_only_loss) and end each answer with the model\'s EOS / end-of-turn token.',
    'Full fine-tune with AdamW in mixed precision ≈ 16 bytes/param (2 weights + 2 grads + 12 optimizer state) → 8B model ≈ 128 GB before activations.',
    'LoRA: W\' = W + (α/r)·B·A, B initialised to 0; trainable params per matrix = r·(d_in + d_out). r=16 on all linear layers of an 8B Llama ≈ 42M params (≈0.5%).',
    'Typical LoRA hyper-params: r 8–64, α = r to 2r, dropout 0.05, LR 1e-4 to 2e-4 (≈10× full-FT LR), 1–3 epochs, target all linear layers.',
    'QLoRA = frozen 4-bit NF4 base + double quantization (saves ≈0.37 bit/param) + paged AdamW + bf16 LoRA adapters → 8B trains in ~10 GB, 70B on one 48–80 GB GPU.',
    'NF4 block size 64 with an FP32 absmax per block costs 0.5 bit/param; double-quant compresses those constants to ≈0.127 bit/param.',
    'PEFT family: LoRA/DoRA/rsLoRA (reparameterise weights), IA³ (scale activations), prompt/prefix tuning (learn virtual tokens). LoRA variants dominate in practice.',
    'Serve many adapters on one base (vLLM --enable-lora, S-LoRA); merge_and_unload only when you need a single fast model and never into a 4-bit base without dequantising.',
    'Always hold out an eval split, measure against the base + a strong prompt baseline, and watch for catastrophic forgetting on a general benchmark.',
  ],
  sections: [
    {
      heading: 'Fine-Tuning — when to change the weights (vs prompting and RAG)',
      body: `**Intuition:** prompting is giving a skilled contractor instructions; RAG is handing them the right binder; fine-tuning is sending them on a training course. The course changes *habits* (tone, format, reasoning style), not the facts they can look up tomorrow.

**Mechanics.** Fine-tuning continues gradient descent on a pretrained model with your own examples, so the weights shift towards your distribution. It is the right tool when the gap is **behavioural**:

| Gap | Best first tool | Why |
|---|---|---|
| Model lacks fresh/private facts | RAG | facts change; citations needed |
| Output format drifts, long prompts needed | Fine-tune (SFT) | bakes the format in, shorter prompts |
| Specific tone / domain jargon | Fine-tune | style is a distribution, not a fact |
| Expensive big model, narrow task | Fine-tune small model / distil | 10–50× cheaper per token |
| One-off or fast-changing task | Prompt | iterate in minutes |

**The escalation ladder:** (1) write a strong prompt with 3–5 examples and an eval set of 100–300 cases; (2) add RAG if failures are "didn't know"; (3) fine-tune only if failures are "knew but did it wrong" *and* you have ≥ 500–1,000 high-quality examples (LIMA showed 1,000 curated examples can carry a lot of style). Fine-tuning is a poor way to inject knowledge: the model memorises surface forms, hallucinates near-miss facts, and you must retrain whenever facts change.

**When to use it:** stable, high-volume, narrow tasks (classification, extraction to a schema, house style, tool-call formatting) where you can measure success automatically and the prompt-only baseline has plateaued.`,
      example: `A support team wants "the bot to know our 2026 refund policy". Baseline: GPT-class model + 1,200-token prompt → 71% correct on a 200-question eval. Adding RAG over the policy docs → 93% (failures were missing facts). Separately, answers must follow a 4-part template (greeting, decision, policy clause id, next step); with prompting only 82% follow it. SFT of an 8B open model on 1,500 approved transcripts → 98% template adherence, prompt shrinks from 1,200 to 150 tokens, and per-request cost drops ~8×. Final design: **RAG for the policy facts + LoRA fine-tune for the format**. Fine-tuning the policy text itself was rejected because it changes quarterly.`,
      diagram: `            Is the failure "didn't KNOW" or "didn't DO it right"?
                         |                          |
                   didn't know                 did it wrong
                         v                          v
              +---------------------+     +------------------------+
              | RAG / tools / search|     | better prompt + 3-5    |
              | (fresh, citable)    |     | few-shot examples      |
              +---------------------+     +-----------+------------+
                                                      | still < target
                                                      v
                                   >= 500-1,000 clean examples + eval set?
                                          | yes                 | no
                                          v                     v
                                   SFT / LoRA / QLoRA     collect / synthesise
                                                          data first`,
      code: [
        {
          language: 'python',
          title: 'Validate a chat JSONL dataset before you spend GPU hours',
          code: `import json, hashlib
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-8B")
MAX_TOKENS = 2048
seen, kept, problems = set(), [], []

with open("train.jsonl") as f:
    for i, line in enumerate(f):
        row = json.loads(line)
        msgs = row.get("messages", [])
        roles = [m["role"] for m in msgs]
        # every example must end with the assistant turn we want to learn
        if not msgs or roles[-1] != "assistant":
            problems.append((i, "last turn is not assistant")); continue
        if any(r not in {"system", "user", "assistant", "tool"} for r in roles):
            problems.append((i, f"bad role in {roles}")); continue
        # exact-duplicate removal on the normalised conversation
        key = hashlib.sha256(json.dumps(msgs, sort_keys=True).lower().encode()).hexdigest()
        if key in seen:
            problems.append((i, "duplicate")); continue
        seen.add(key)
        # length check with the *model's* chat template, not len(text)/4
        n = len(tok.apply_chat_template(msgs, tokenize=True))
        if n > MAX_TOKENS:
            problems.append((i, f"{n} tokens > {MAX_TOKENS}")); continue
        kept.append(row)

print(f"kept {len(kept)} rows, dropped {len(problems)}")
for p in problems[:10]:
    print("  row", p)`,
        },
      ],
      prosCons: {
        pros: [
          'Bakes format, tone and task behaviour into the weights, so prompts get 5–10× shorter.',
          'Lets a small open model match a large model on a narrow task at a fraction of the per-token cost and latency.',
          'Deterministic behaviour you can version, evaluate and roll back like any other artefact.',
        ],
        cons: [
          { con: 'Poor at injecting facts that change; the model hallucinates near-miss facts.', fix: 'Keep facts in RAG or tools and fine-tune only the behaviour (format, style, tool-call shape).' },
          { con: 'Needs hundreds to thousands of clean, labelled examples.', fix: 'Bootstrap with synthetic data from a stronger model, then have humans review a stratified sample before training.' },
          { con: 'Can silently degrade general abilities (catastrophic forgetting).', fix: 'Use LoRA with low rank, mix 5–20% general instruction data, and track a general benchmark alongside the task eval.' },
          { con: 'Retraining cost and ops whenever the base model is upgraded.', fix: 'Keep the dataset and training script versioned so a re-run on a new base is a single pipeline job, and gate on the same eval set.' },
        ],
      },
      keyPoints: [
        'Fine-tune for behaviour; RAG for knowledge.',
        'Exhaust prompting + few-shot with a real eval set before training.',
        '500–1,000 high-quality examples beat 50,000 noisy ones.',
        'Validate the dataset with the model\'s own chat template and tokenizer.',
      ],
      exercise: {
        prompt: `Write \`split_dataset(rows, eval_frac=0.1, seed=0)\` for a chat JSONL dataset that:

1. removes exact duplicates (case-insensitive on the whole conversation),
2. prevents **leakage**: two rows whose *first user message* is identical must land in the same split,
3. returns \`(train, eval)\` with roughly \`eval_frac\` of the unique user prompts in eval.

Acceptance: no first-user-message appears in both splits; output is deterministic for a given seed.`,
        starter: {
          language: 'python',
          code: `import json, random

def first_user(row):
    # TODO: return the content of the first user message (lower-cased, stripped)
    ...

def split_dataset(rows, eval_frac=0.1, seed=0):
    # TODO 1: drop exact duplicate conversations
    # TODO 2: group rows by first_user(row)
    # TODO 3: shuffle the group keys deterministically and assign whole groups
    ...`,
        },
        hints: [
          'Use json.dumps(row["messages"], sort_keys=True).lower() as the duplicate key.',
          'Build a dict from first-user text to a list of rows; split the *keys*, not the rows.',
          'Sort the keys before shuffling with random.Random(seed) so the result does not depend on dict order.',
        ],
        solution: {
          language: 'python',
          code: `import json, random
from collections import defaultdict

def first_user(row):
    for m in row["messages"]:
        if m["role"] == "user":
            return m["content"].strip().lower()
    return ""

def split_dataset(rows, eval_frac=0.1, seed=0):
    seen, unique = set(), []
    for r in rows:
        key = json.dumps(r["messages"], sort_keys=True).lower()
        if key not in seen:
            seen.add(key)
            unique.append(r)

    groups = defaultdict(list)
    for r in unique:
        groups[first_user(r)].append(r)

    keys = sorted(groups)                      # deterministic base order
    random.Random(seed).shuffle(keys)
    n_eval = max(1, round(len(keys) * eval_frac))
    eval_keys = set(keys[:n_eval])

    train = [r for k in keys if k not in eval_keys for r in groups[k]]
    evals = [r for k in keys if k in eval_keys for r in groups[k]]
    return train, evals`,
        },
        explanation: 'Splitting by group (first user message) rather than by row stops paraphrased answers to the same question appearing in both splits, which would inflate eval scores. Sorting before a seeded shuffle makes the split reproducible across runs.',
      },
      quickCheck: {
        question: 'Your assistant answers product-spec questions wrongly because specs change every two weeks. What is the best first fix?',
        options: [
          'Fine-tune weekly on the latest spec sheets',
          'Retrieve the current spec sheet at query time (RAG) and keep the prompt instructions',
          'Increase LoRA rank so the model memorises more specs',
          'Switch to a larger base model with more parametric knowledge',
        ],
        correct: 1,
        explanation: 'This is a knowledge gap with fast-changing facts. Retrieval supplies the current, citable spec without retraining. Weekly fine-tunes are expensive and still hallucinate near-miss facts, and higher rank or a larger base cannot know facts that did not exist at training time.',
      },
      source: 'Zhou et al. 2023 — LIMA; OpenAI & Anthropic fine-tuning guidance (prompt first, then fine-tune)',
    },
    {
      heading: 'Supervised Fine-Tuning (SFT) — chat data, loss masking and training settings',
      body: `**Intuition:** SFT is imitation learning. Show the model thousands of "here is the conversation, here is the perfect reply" pairs and minimise its surprise (cross-entropy) on the perfect reply.

**Data format.** The de-facto standard is chat JSONL, one conversation per line:
\`{"messages":[{"role":"system",...},{"role":"user",...},{"role":"assistant",...}]}\`.
TRL also accepts prompt–completion pairs. The trainer renders each conversation with the **model's own chat template** (special tokens such as \`<|im_start|>\` or \`<|start_header_id|>\`), so you must train and serve with the same template.

**Loss masking.** By default a language-modelling loss covers every token, including the user's prompt, so the model learns to *write user questions*. Set \`assistant_only_loss=True\` (conversational data) or use prompt–completion data (completion-only loss is the default) so labels are \`-100\` everywhere except the assistant tokens.

**Key settings (8B model, 1–10k examples):**

| Setting | Typical value |
|---|---|
| Epochs | 1–3 (watch eval loss) |
| LR full FT / LoRA | 1e-5 to 2e-5 / 1e-4 to 2e-4 |
| Effective batch | 16–64 sequences (grad accumulation) |
| max_length | p95 of your token lengths |
| packing | on for short examples (2–3× throughput) |
| Precision | bf16 + gradient checkpointing |

**When to use it:** SFT is the first post-training step for any custom behaviour and the prerequisite for preference tuning (DPO/RLHF). Note: TRL's \`SFTTrainer\` loads a model from a string in **float32** unless you pass \`model_init_kwargs={"dtype": torch.bfloat16}\`, which doubles memory if you forget it.`,
      example: `Conversation of 410 tokens: system (60) + user (110) + assistant (240). Without masking, the loss averages over all 410 tokens, so 41% of the gradient signal teaches the model to imitate the system prompt and user. With \`assistant_only_loss=True\`, only the 240 assistant tokens contribute. On a 3,000-example extraction task this moved exact-match JSON from 88% to 94% and stopped the model occasionally "continuing" the user's question. Packing 3,000 examples (mean 410 tokens) into 2,048-token blocks cut steps per epoch from 375 to ~75 at batch 8, roughly 2.5× faster wall-clock on one H100.`,
      diagram: `tokens : [sys .......][user ...........][assistant ..........][eos]
labels : -100 ... -100  -100 ....... -100  tok tok tok ... tok    eos
                                            ^ loss computed here only

chat JSONL --apply_chat_template--> ids --mask non-assistant--> labels
          --pack into 2048 blocks--> batches --> cross-entropy --> AdamW`,
      code: [
        {
          language: 'python',
          title: 'SFT with TRL (assistant-only loss, bf16, packing)',
          code: `import torch
from datasets import load_dataset
from trl import SFTConfig, SFTTrainer

# chat JSONL: {"messages": [{"role": "...", "content": "..."}]}
data = load_dataset("json", data_files={"train": "train.jsonl", "eval": "eval.jsonl"})

args = SFTConfig(
    output_dir="out/sft-qwen3-1.7b",
    model_init_kwargs={"dtype": torch.bfloat16},  # TRL default would be float32
    assistant_only_loss=True,      # labels = -100 outside assistant turns
    max_length=2048,               # ~p95 of rendered example length
    packing=True,                  # best-fit packing of short examples
    num_train_epochs=2,
    learning_rate=2e-5,            # full fine-tune LR
    lr_scheduler_type="cosine",
    warmup_steps=50,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8, # effective batch 32 sequences
    gradient_checkpointing=True,
    eval_strategy="steps", eval_steps=100,
    logging_steps=10,
    save_total_limit=2,
)

trainer = SFTTrainer(
    model="Qwen/Qwen3-1.7B",
    args=args,
    train_dataset=data["train"],
    eval_dataset=data["eval"],
)
trainer.train()
trainer.save_model()`,
        },
      ],
      prosCons: {
        pros: [
          'Simple, stable objective (next-token cross-entropy) with mature tooling (TRL, Axolotl, Unsloth).',
          'Small curated datasets (1–5k) already give large gains in format and style adherence.',
          'Produces the reference policy needed for later DPO/RLHF.',
        ],
        cons: [
          { con: 'Learns to imitate prompts and boilerplate if loss covers every token.', fix: 'Use assistant_only_loss=True or prompt–completion data so only response tokens are labelled.' },
          { con: 'Overfits quickly: train loss → 0.2 while eval loss rises after epoch 2.', fix: 'Evaluate every N steps, keep the best checkpoint, use 1–3 epochs and a lower LR or more data diversity.' },
          { con: 'Imitates errors in the data verbatim (garbage in, garbage out).', fix: 'Review a stratified sample, dedupe, filter by length and an LLM-judge quality score before training.' },
          { con: 'Model never stops generating if training answers lack the end-of-turn token.', fix: 'Render with the chat template (which appends EOS / end-of-turn) and set eos_token in SFTConfig when the template uses a different token.' },
        ],
      },
      keyPoints: [
        'Same chat template at train and serve time, or quality collapses.',
        'Mask everything but the assistant tokens.',
        'Pass dtype=bfloat16; TRL loads string model ids in float32 by default.',
        'Packing gives 2–3× throughput on short examples.',
        'Keep the best checkpoint by eval loss/task metric, not the last one.',
      ],
      exercise: {
        prompt: `Implement \`build_labels(tokenizer, messages)\` that returns \`(input_ids, labels)\` where \`labels[i] = -100\` for every token that is **not** part of an assistant reply.

Acceptance: decoding the non-masked label tokens yields exactly the assistant contents (plus their end-of-turn tokens); system/user tokens are all \`-100\`. Use incremental rendering of the chat template (no hard-coded special tokens).`,
        starter: {
          language: 'python',
          code: `def build_labels(tok, messages):
    input_ids, labels = [], []
    for i, msg in enumerate(messages):
        # TODO: render messages[: i + 1] with the chat template
        # TODO: the new tokens are the slice after the previous prefix length
        # TODO: append them to input_ids; to labels either the ids or -100
        ...
    return input_ids, labels`,
        },
        hints: [
          'tok.apply_chat_template(messages[:i+1], tokenize=True) gives the ids of the prefix up to message i.',
          'The tokens contributed by message i are prefix_ids[len(input_ids):].',
          'Only messages with role == "assistant" keep their ids as labels.',
        ],
        solution: {
          language: 'python',
          code: `def build_labels(tok, messages):
    input_ids, labels = [], []
    for i, msg in enumerate(messages):
        prefix = tok.apply_chat_template(messages[: i + 1], tokenize=True)
        new = prefix[len(input_ids):]           # tokens added by message i
        input_ids.extend(new)
        if msg["role"] == "assistant":
            labels.extend(new)                  # learn the reply + its end-of-turn
        else:
            labels.extend([-100] * len(new))    # ignored by cross-entropy
    return input_ids, labels

# sanity check
# ids, lab = build_labels(tok, msgs)
# print(tok.decode([t for t in lab if t != -100]))`,
        },
        explanation: 'Rendering the prefix incrementally means the template decides where role headers and end-of-turn tokens go, so the mask is right for any model family. Assistant tokens include the role header in some templates; that is harmless, but the user and system content are never learned.',
      },
      quickCheck: {
        question: 'After SFT, eval loss is 0.9 at epoch 1, 0.85 at epoch 2 and 1.05 at epoch 3, while train loss keeps falling. What should you ship?',
        options: [
          'The epoch-3 checkpoint, because train loss is lowest',
          'The epoch-2 checkpoint, then add data or lower the LR before training longer',
          'The epoch-1 checkpoint, because the first epoch never overfits',
          'Retrain with packing disabled, since packing causes the gap',
        ],
        correct: 1,
        explanation: 'Rising eval loss with falling train loss is overfitting; the best generalising checkpoint is epoch 2. Train loss is not the selection metric, and packing does not cause overfitting.',
      },
      source: 'Hugging Face TRL docs — SFT Trainer',
    },
    {
      heading: 'LoRA — low-rank adapters, rank, alpha and target modules',
      body: `**Intuition:** the change a fine-tune makes to a big weight matrix is "simple": it lives in a few directions. LoRA learns only those few directions as two thin matrices and leaves the original matrix frozen.

**Mechanics.** For a frozen weight \`W\` (d_out × d_in), LoRA adds \`ΔW = (α/r) · B · A\` with \`A\` (r × d_in, random init) and \`B\` (d_out × r, **zero init** so training starts exactly at the base model). Trainable params per matrix = **r · (d_in + d_out)** instead of d_in · d_out.

| Knob | Meaning | Common choice |
|---|---|---|
| \`r\` | rank (capacity) | 8–64; 16 is a good default |
| \`lora_alpha\` | scale numerator (effective scale α/r) | r or 2r |
| \`target_modules\` | which linears get adapters | \`"all-linear"\` (q,k,v,o,gate,up,down) |
| \`lora_dropout\` | regularisation | 0.0–0.1 |
| LR | adapters need a higher LR | 1e-4 to 2e-4 |

Targeting **all linear layers** usually beats attention-only (q,v) at the same parameter budget (the QLoRA paper found it necessary to match full fine-tuning). Because the scale is α/r, raising \`r\` without raising \`alpha\` *shrinks* the update; rsLoRA uses α/√r to keep large ranks stable.

At inference you can **merge** (\`W + (α/r)BA\`) for zero overhead, or keep adapters separate and hot-swap them per tenant.

**When to use it:** the default way to fine-tune any model above ~1B parameters: 3× less GPU memory than full fine-tuning, adapter files of 10–200 MB, and quality close to full FT on most instruction/format tasks.`,
      example: `Llama-3.1-8B: hidden 4096, 32 layers, 8 KV heads × 128 = 1024-d K/V, MLP 14336. With r = 16 on all linear layers, per layer:
- q, o: 16 × (4096 + 4096) = 131,072 each
- k, v: 16 × (4096 + 1024) = 81,920 each
- gate, up, down: 16 × (4096 + 14336) = 294,912 each

Sum = 262,144 + 163,840 + 884,736 = **1,310,720 per layer** × 32 = **41.9M** trainable params, i.e. 0.52% of 8.03B. The adapter file in bf16 is 41.9M × 2 B ≈ **84 MB**. With r = 8 on q and v only it would be 3.4M params (6.8 MB), usually noticeably weaker on format-heavy tasks.`,
      diagram: `            x (d_in = 4096)
            |
     +------+---------------------+
     |                            |
     v                            v
 +--------+ frozen          +-----------+  A: r x d_in  (random)
 |   W    | 4096 x 4096     |     A     |
 | 16.7M  |                 +-----+-----+
 +---+----+                       v  r = 16
     |                      +-----------+  B: d_out x r (zeros)
     |                      |     B     |
     |                      +-----+-----+
     |                            | x (alpha / r)
     +------------( + )-----------+
                    v
                h = Wx + (alpha/r) B A x      trainable: 131,072`,
      code: [
        {
          language: 'python',
          title: 'Attach LoRA adapters with PEFT and inspect the parameter count',
          code: `import torch
from transformers import AutoModelForCausalLM
from peft import LoraConfig, get_peft_model

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B-Instruct", dtype=torch.bfloat16, device_map="auto"
)

cfg = LoraConfig(
    r=16,
    lora_alpha=32,                 # effective scale alpha / r = 2.0
    lora_dropout=0.05,
    target_modules="all-linear",   # q,k,v,o,gate,up,down (lm_head excluded)
    task_type="CAUSAL_LM",
)
model = get_peft_model(model, cfg)
model.print_trainable_parameters()
# trainable params: 41,943,040 || all params: 8,072,204,288 || trainable%: 0.5196

# Manual check of one projection: r * (d_in + d_out)
q = model.base_model.model.model.layers[0].self_attn.q_proj
print(q.lora_A["default"].weight.shape, q.lora_B["default"].weight.shape)
# torch.Size([16, 4096]) torch.Size([4096, 16])`,
        },
      ],
      prosCons: {
        pros: [
          'Trains 0.1–1% of parameters, cutting optimizer and gradient memory by ~3× versus full fine-tuning.',
          'Adapters are tiny (tens of MB) so you can keep one per customer or task and hot-swap them.',
          'Mergeable into the base weights for zero inference overhead.',
        ],
        cons: [
          { con: 'Low rank can underfit tasks that need large distribution shifts (new language, heavy domain shift).', fix: 'Raise r to 64–128 with rsLoRA scaling, target all linear layers, or fall back to full fine-tuning for continued pretraining.' },
          { con: 'Easy to mis-scale: raising r without alpha shrinks the update and training looks "stuck".', fix: 'Keep alpha/r constant (e.g. alpha = 2r) or set use_rslora=True when sweeping ranks.' },
          { con: 'Attention-only targets (q,v) often leave quality on the table.', fix: 'Use target_modules="all-linear"; add modules_to_save=["embed_tokens","lm_head"] only if you added new tokens.' },
        ],
      },
      keyPoints: [
        'ΔW = (α/r)·B·A with B = 0 at init, so step 0 equals the base model.',
        'Trainable params per matrix = r·(d_in + d_out).',
        'Target all linear layers; r=16, α=32, LR 2e-4 is a strong default.',
        'Merge for single-model serving; keep separate for multi-tenant hot-swap.',
      ],
      exercise: {
        prompt: `Write \`lora_params(cfg, r, targets)\` that returns the total number of trainable LoRA parameters for a Llama-style model.

\`cfg\` has \`hidden\`, \`layers\`, \`heads\`, \`kv_heads\`, \`head_dim\`, \`intermediate\`. \`targets\` is a subset of \`["q","k","v","o","gate","up","down"]\`.

Acceptance: for Llama-3.1-8B (4096, 32, 32, 8, 128, 14336) with r=16 and all seven targets it returns 41,943,040; with r=8 and ["q","v"] it returns 3,407,872.`,
        starter: {
          language: 'python',
          code: `def lora_params(cfg, r, targets):
    h, kv = cfg["hidden"], cfg["kv_heads"] * cfg["head_dim"]
    shapes = {
        # TODO: (d_in, d_out) for each projection
    }
    # TODO: sum r * (d_in + d_out) over targets, times number of layers
    ...`,
        },
        hints: [
          'q_proj: 4096 → heads*head_dim (4096); k/v: 4096 → kv_heads*head_dim (1024); o: 4096 → 4096.',
          'gate and up map hidden → intermediate; down maps intermediate → hidden.',
          'Multiply the per-layer sum by cfg["layers"].',
        ],
        solution: {
          language: 'python',
          code: `def lora_params(cfg, r, targets):
    h = cfg["hidden"]
    q_out = cfg["heads"] * cfg["head_dim"]
    kv = cfg["kv_heads"] * cfg["head_dim"]
    m = cfg["intermediate"]
    shapes = {
        "q": (h, q_out), "k": (h, kv), "v": (h, kv), "o": (q_out, h),
        "gate": (h, m), "up": (h, m), "down": (m, h),
    }
    per_layer = sum(r * (shapes[t][0] + shapes[t][1]) for t in targets)
    return per_layer * cfg["layers"]

llama8b = dict(hidden=4096, layers=32, heads=32, kv_heads=8, head_dim=128, intermediate=14336)
assert lora_params(llama8b, 16, ["q","k","v","o","gate","up","down"]) == 41_943_040
assert lora_params(llama8b, 8, ["q", "v"]) == 3_407_872`,
        },
        explanation: 'Each adapter adds A (r × d_in) and B (d_out × r). GQA makes k and v projections narrower (1024 instead of 4096), and the MLP projections dominate the count because the intermediate size is 3.5× the hidden size.',
      },
      quickCheck: {
        question: 'You double LoRA rank from 16 to 32 but keep lora_alpha=16. What happens to the adapter\'s effective update scale at initialisation-equivalent magnitudes?',
        options: [
          'It doubles, because there are twice as many directions',
          'It halves, because the scale is alpha/r (1.0 → 0.5)',
          'It is unchanged, because alpha is fixed',
          'It becomes zero, because B is re-initialised',
        ],
        correct: 1,
        explanation: 'Standard LoRA multiplies BA by alpha/r. Going from 16/16 to 16/32 halves the scale, which often looks like a slower-learning run. Keep alpha proportional to r or use rsLoRA (alpha/√r).',
      },
      source: 'Hu et al. 2021 — LoRA; Hugging Face PEFT docs',
    },
    {
      heading: 'QLoRA — 4-bit NF4 base, double quantization and paged optimizers',
      body: `**Intuition:** LoRA already freezes the base model, so why store the frozen part in 16-bit? QLoRA stores it in 4-bit, dequantises each block on the fly for the matmul, and trains bf16 LoRA adapters on top.

**Three tricks (Dettmers et al. 2023):**
1. **NF4 (4-bit NormalFloat):** pretrained weights are roughly normal, so NF4 places its 16 levels at quantiles of a normal distribution, which is information-theoretically optimal for that shape. Weights are quantised in blocks of 64 with one absmax scale per block.
2. **Double quantization:** the per-block FP32 scales cost 32/64 = 0.5 bit/param. Quantising those scales to 8-bit (second-level block of 256) cuts it to ≈0.127 bit/param, saving ≈0.37 bit/param (~3 GB on a 65B model).
3. **Paged optimizers:** optimizer state uses NVIDIA unified memory and is paged to CPU RAM during memory spikes (long sequences + gradient checkpointing) instead of crashing with OOM.

**Memory rule of thumb (training, bf16 adapters, grad checkpointing):**

| Model | Full FT (AdamW) | LoRA (bf16 base) | QLoRA (NF4 base) |
|---|---|---|---|
| 8B | ~130 GB | ~20 GB | ~8–10 GB |
| 70B | ~1.1 TB | ~150 GB | ~42–48 GB |

Compute dtype matters: set \`bnb_4bit_compute_dtype=torch.bfloat16\` or matmuls run in fp32 and slow down. QLoRA is ~20–40% slower per step than bf16 LoRA because of dequantisation.

**When to use it:** you have one consumer or single datacentre GPU (24–80 GB) and a model that would not otherwise fit, e.g. 8–14B on an RTX 4090 or 70B on one H100/A100-80GB. If memory is not the constraint, plain bf16 LoRA trains faster and avoids quantisation error.`,
      example: `Fine-tuning Llama-3.1-8B on a 24 GB RTX 4090:
- bf16 LoRA: weights 16.1 GB + adapters/grads/Adam (42M × 16 B ≈ 0.67 GB) + activations at 2,048 tokens × batch 2 with checkpointing (~3–5 GB) ≈ 21 GB, borderline and OOMs on long batches.
- QLoRA: NF4 weights ≈ 8.03B × 0.5 B = 4.0 GB, + quant constants 8.03B × 0.127/8 ≈ 0.13 GB, + embeddings/lm_head kept in bf16 (~1 GB) + 0.67 GB adapter state + ~4 GB activations ≈ **10 GB**. Leaves room for batch 4 or 4,096-token sequences.
Result on a 2k-example extraction task: bf16 LoRA 93.1% exact match, QLoRA 92.7%, within noise.`,
      diagram: `   bf16 weights (16 GB)
        | quantise per 64-weight block (NF4 levels at normal quantiles)
        v
   NF4 codes (4 bit)  +  absmax per block (FP32 -> double-quant to FP8)
        |                          |
        +---- dequantise block --->+--> bf16 tile --> matmul (bf16 compute)
                                                 ^
                    LoRA A, B in bf16 -----------+  (only these get gradients)
                                                 |
           paged AdamW state <---- CPU RAM spill on spikes`,
      code: [
        {
          language: 'python',
          title: 'QLoRA with bitsandbytes + PEFT + TRL',
          code: `import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

bnb = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",             # NormalFloat4 levels
    bnb_4bit_use_double_quant=True,        # quantise the block scales too
    bnb_4bit_compute_dtype=torch.bfloat16, # dequantise to bf16 for matmuls
)

peft_cfg = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                      target_modules="all-linear", task_type="CAUSAL_LM")

args = SFTConfig(
    output_dir="out/qlora-llama8b",
    model_init_kwargs={"dtype": torch.bfloat16, "device_map": "auto"},
    assistant_only_loss=True,
    max_length=2048,
    learning_rate=2e-4,                    # adapter LR
    num_train_epochs=2,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    gradient_checkpointing=True,
    optim="paged_adamw_8bit",              # paged + 8-bit optimizer state
)

trainer = SFTTrainer(
    model="meta-llama/Llama-3.1-8B-Instruct",
    args=args,
    train_dataset=load_dataset("json", data_files="train.jsonl", split="train"),
    quantization_config=bnb,               # base loaded in 4-bit
    peft_config=peft_cfg,                  # LoRA on top -> QLoRA
)
trainer.train()
trainer.save_model()   # saves only the adapter (~84 MB)`,
        },
      ],
      prosCons: {
        pros: [
          'Cuts base-model memory ~4× versus bf16, putting 70B fine-tuning on one 48–80 GB GPU.',
          'Quality typically within ~1 point of bf16 LoRA on instruction tasks (the paper matched 16-bit fine-tuning).',
          'Paged optimizers turn rare memory spikes into slowdowns instead of crashes.',
        ],
        cons: [
          { con: '20–40% slower steps from on-the-fly dequantisation.', fix: 'Use bf16 LoRA when the model fits; for QLoRA use bf16 compute dtype, packing and FlashAttention to recover throughput.' },
          { con: 'Merging adapters into a 4-bit base loses precision or fails.', fix: 'Reload the base in bf16, merge the adapter there, then re-quantise for serving (GGUF/AWQ/GPTQ) if needed.' },
          { con: 'Quantisation error can hurt sensitive tasks (math, code).', fix: 'Evaluate against a bf16 LoRA baseline on a small run; keep lm_head/embeddings in bf16 and raise rank if gaps appear.' },
        ],
      },
      keyPoints: [
        'NF4 + double quant + paged optimizers = QLoRA.',
        'Base ≈ 0.5 byte/param + ~0.127 bit/param of constants.',
        'Set compute dtype to bf16 and optim to paged_adamw_8bit.',
        'Merge into a bf16 copy of the base, never into the 4-bit weights.',
      ],
      exercise: {
        prompt: `Write \`train_mem_gb(params_b, method, adapter_params_m=40, act_gb=4)\` estimating training VRAM in GB for \`method\` in \`{"full", "lora", "qlora"}\`.

Rules: full = 16 B/param (bf16 weights+grads, fp32 master+Adam m,v); lora = 2 B/param base + 16 B per adapter param; qlora = 0.5 B/param + 0.127/8 B/param constants + 16 B per adapter param. Add \`act_gb\` and 10% overhead.

Acceptance: 8B → full ≈ 145 GB, lora ≈ 23 GB, qlora ≈ 10 GB.`,
        hints: [
          'Work in bytes: params_b * 1e9 * bytes_per_param, then divide by 1e9 for GB.',
          'Adapter state: adapter_params_m * 1e6 * 16 bytes (weights, grads, Adam m and v, master copy).',
          'Apply the 1.1 overhead multiplier at the end.',
        ],
        solution: {
          language: 'python',
          code: `def train_mem_gb(params_b, method, adapter_params_m=40, act_gb=4):
    n = params_b * 1e9
    adapter = adapter_params_m * 1e6 * 16 / 1e9          # GB
    if method == "full":
        base = n * 16 / 1e9
        adapter = 0
    elif method == "lora":
        base = n * 2 / 1e9
    elif method == "qlora":
        base = n * (0.5 + 0.127 / 8) / 1e9
    else:
        raise ValueError(method)
    return round((base + adapter + act_gb) * 1.1, 1)

for m in ("full", "lora", "qlora"):
    print(m, train_mem_gb(8, m))
# full 145.2, lora 22.7, qlora 9.6`,
        },
        explanation: 'Full fine-tuning is dominated by optimizer state (12 of the 16 bytes), so freezing the base (LoRA) removes most of it, and quantising the frozen base (QLoRA) shrinks what remains by another 4×. Activations become the next bottleneck, which is why gradient checkpointing and sequence length matter.',
      },
      quickCheck: {
        question: 'Why does QLoRA use NF4 rather than plain 4-bit integers with uniform spacing?',
        options: [
          'NF4 is faster on tensor cores than INT4',
          'Pretrained weights are roughly normally distributed, so quantile-spaced levels waste fewer codes on rare extreme values',
          'NF4 stores gradients, so the base model can also be updated',
          'NF4 removes the need for a per-block scale',
        ],
        correct: 1,
        explanation: 'NF4 levels follow quantiles of a normal distribution, so each of the 16 codes is used about equally for normally distributed weights, reducing error. It still needs a per-block absmax scale, and the base remains frozen.',
      },
      source: 'Dettmers et al. 2023 — QLoRA; Hugging Face Transformers bitsandbytes docs',
    },
    {
      heading: 'PEFT — the adapter family, multi-adapter serving and merging',
      body: `**Intuition:** parameter-efficient fine-tuning (PEFT) is a toolbox of ways to change a model's behaviour by training a tiny add-on instead of the whole model, like a clip-on lens rather than a new camera.

| Method | What is trained | Params (8B) | Notes |
|---|---|---|---|
| LoRA | low-rank ΔW on linears | 0.1–1% | default; mergeable |
| DoRA | LoRA + per-column magnitude | ≈ LoRA | often +0.5–1 pt at low rank; slower |
| rsLoRA | LoRA with α/√r scaling | = LoRA | stable at r ≥ 64 |
| IA³ | per-channel scaling vectors | ~0.01% | very small; weaker on hard tasks |
| Prompt / prefix tuning | virtual tokens / per-layer KV prefixes | ~0.01–0.1% | uses context; weakest on small models |

The Hugging Face \`peft\` library wraps all of these behind \`get_peft_model\` and a common save/load format (\`adapter_config.json\` + \`adapter_model.safetensors\`).

**Serving patterns:**
- **Merge** (\`merge_and_unload()\`) into a bf16 base when one adapter serves all traffic: zero latency overhead.
- **Multi-adapter**: keep one base in GPU memory and load many adapters; route per request. vLLM (\`--enable-lora\`, \`--max-loras\`, \`--max-lora-rank\`) and S-LoRA batch requests for different adapters in the same forward pass, so 100 tenants cost roughly one base model plus 100 × ~80 MB.
- **Combine** adapters (\`add_weighted_adapter\`) for experiments, but expect interference; evaluate.

**When to use it:** whenever you need many specialised variants (per tenant, per language, per task) or you cannot afford full fine-tuning. Choose LoRA/DoRA first; reach for prompt tuning only on very large frozen models where you cannot touch the weights.`,
      example: `A SaaS company has 120 enterprise tenants, each wanting its own tone and output schema. Option A: 120 merged 8B models in bf16 = 120 × 16 GB = 1.9 TB of weights, needing ~24 H100s just to hold them. Option B: one bf16 base (16 GB) + 120 LoRA adapters at r=16 (84 MB each ≈ 10 GB total in CPU RAM), with vLLM keeping the 8 most active adapters on GPU (\`--max-loras 8\`). One H100 serves all tenants; p50 latency rises ~5–10% versus a merged model because of the extra low-rank matmuls. They chose B and merge only for the two tenants with dedicated deployments.`,
      diagram: `             requests (tenant=a | b | c)
                         |
                         v
              +----------------------+
              | router: adapter_id   |
              +----------+-----------+
                         v
   +------------------------------------------------+
   | GPU: base weights (bf16, shared, 16 GB)         |
   |   + adapter slots [a][b][c] ... (max_loras=8)   |
   |   batched forward: Wx + B_a A_a x  (per row)    |
   +------------------------------------------------+
                         ^
          CPU RAM: 120 adapters x 84 MB (LRU swap in)`,
      code: [
        {
          language: 'python',
          title: 'Load several adapters on one base, switch per request, merge for export',
          code: `import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE = "meta-llama/Llama-3.1-8B-Instruct"
tok = AutoTokenizer.from_pretrained(BASE)
base = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16, device_map="auto")

# first adapter creates the PeftModel; others are added by name
model = PeftModel.from_pretrained(base, "adapters/tenant-acme", adapter_name="acme")
model.load_adapter("adapters/tenant-globex", adapter_name="globex")

def generate(tenant: str, messages: list[dict]) -> str:
    model.set_adapter(tenant)                       # switch active adapter
    ids = tok.apply_chat_template(messages, add_generation_prompt=True,
                                  return_tensors="pt").to(model.device)
    out = model.generate(ids, max_new_tokens=256, do_sample=False)
    return tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True)

print(generate("acme", [{"role": "user", "content": "Summarise ticket #4411"}]))

# export one tenant as a standalone model (bf16 base, not 4-bit)
model.set_adapter("globex")
merged = model.merge_and_unload()                 # W <- W + (alpha/r) B A
merged.save_pretrained("export/globex-merged")`,
        },
      ],
      prosCons: {
        pros: [
          'One shared base serves dozens or hundreds of specialised variants.',
          'Adapters are small, versionable artefacts that are cheap to store, diff and roll back.',
          'Common library interface makes it cheap to try LoRA vs DoRA vs IA³ on the same pipeline.',
        ],
        cons: [
          { con: 'set_adapter on a shared model is not safe for concurrent requests in plain transformers.', fix: 'Use a server with per-request adapter batching (vLLM --enable-lora, S-LoRA, TGI multi-LoRA) instead of a global switch.' },
          { con: 'Unmerged adapters add 5–15% latency.', fix: 'Merge for single-tenant deployments; use punica/SGMV kernels in vLLM for multi-tenant batches.' },
          { con: 'Adapters are tied to the exact base checkpoint; a base upgrade invalidates them.', fix: 'Record base model id and revision in adapter metadata and retrain all adapters in CI when the base changes.' },
          { con: 'Combining adapters can interfere and degrade both tasks.', fix: 'Prefer one multi-task adapter trained on mixed data, or evaluate weighted combinations on both task evals before shipping.' },
        ],
      },
      keyPoints: [
        'PEFT = train a tiny add-on; LoRA family dominates.',
        'Merge for one-model serving; batch adapters for multi-tenant.',
        'Adapters are bound to one base checkpoint and revision.',
        'Prompt/prefix tuning and IA³ are smallest but usually weakest.',
      ],
      exercise: {
        prompt: `Build an \`AdapterCache\` for a multi-tenant server: it holds at most \`max_gpu\` adapters "on GPU" and evicts the least recently used when a new tenant arrives.

API: \`get(tenant) -> str\` returns the adapter name, loading it via an injected \`load_fn(tenant)\` on a miss and calling \`unload_fn(name)\` on eviction.

Acceptance: with max_gpu=2 and requests a, b, a, c, the adapter for **b** is evicted (not a); hit/miss counters are correct (1 hit, 3 misses).`,
        starter: {
          language: 'python',
          code: `from collections import OrderedDict

class AdapterCache:
    def __init__(self, max_gpu, load_fn, unload_fn):
        self.max_gpu = max_gpu
        self.load_fn, self.unload_fn = load_fn, unload_fn
        self.slots = OrderedDict()
        self.hits = self.misses = 0

    def get(self, tenant):
        # TODO: on hit, move to end (most recent) and count a hit
        # TODO: on miss, evict LRU if full, load, insert, count a miss
        ...`,
        },
        hints: [
          'OrderedDict.move_to_end(key) marks an item as most recently used.',
          'popitem(last=False) removes the least recently used item.',
          'Call unload_fn on the evicted name before loading the new one to free memory first.',
        ],
        solution: {
          language: 'python',
          code: `from collections import OrderedDict

class AdapterCache:
    def __init__(self, max_gpu, load_fn, unload_fn):
        self.max_gpu = max_gpu
        self.load_fn, self.unload_fn = load_fn, unload_fn
        self.slots = OrderedDict()
        self.hits = self.misses = 0

    def get(self, tenant):
        if tenant in self.slots:
            self.slots.move_to_end(tenant)
            self.hits += 1
            return self.slots[tenant]
        self.misses += 1
        if len(self.slots) >= self.max_gpu:
            old_tenant, old_name = self.slots.popitem(last=False)
            self.unload_fn(old_name)          # free GPU memory first
        name = self.load_fn(tenant)
        self.slots[tenant] = name
        return name

log = []
c = AdapterCache(2, load_fn=lambda t: "lora-" + t, unload_fn=log.append)
for t in "abac":
    c.get(t)
assert log == ["lora-b"] and (c.hits, c.misses) == (1, 3)`,
        },
        explanation: 'This is the same LRU policy vLLM applies to its LoRA slots (max_loras on GPU, the rest in CPU memory). Tracking hit rate tells you whether to raise max_gpu or shard tenants across replicas.',
      },
      quickCheck: {
        question: 'You serve 60 tenant-specific LoRA adapters on an 8B base with steady traffic to all of them. Which deployment minimises GPU count while keeping per-tenant behaviour?',
        options: [
          'Merge each adapter and deploy 60 separate model replicas',
          'One base model with a multi-LoRA server that batches requests for different adapters together',
          'Average all 60 adapters into one merged adapter',
          'Use prompt tuning so tenants share one set of weights',
        ],
        correct: 1,
        explanation: 'A multi-LoRA server keeps one copy of the base and applies each request\'s adapter inside the same batch, so memory is base + adapters. Merged replicas multiply weight memory by 60, averaging destroys per-tenant behaviour, and switching methods throws away trained adapters without solving serving.',
      },
      source: 'Hugging Face PEFT docs; Sheng et al. 2023 — S-LoRA; vLLM docs — LoRA adapters',
    },
  ],
  codeChallenges: [
    {
      id: 'fine-tuning-cc-1',
      title: 'Fix a QLoRA script that trains on the wrong tokens and wastes memory',
      context: 'A teammate\'s QLoRA run on Llama-3.1-8B OOMs on a 24 GB GPU at sequence length 2,048, and when it does run, the model sometimes continues writing the next user question and never stops.',
      task: 'Make the script fit in ~10–12 GB, train only on assistant tokens with the correct end-of-turn token, use adapter-appropriate hyper-parameters and add an eval split with best-checkpoint selection.',
      starter: {
        language: 'python',
        code: `from datasets import load_dataset
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

ds = load_dataset("json", data_files="chats.jsonl", split="train")

# flatten conversations into plain text
def to_text(row):
    return {"text": "\\n".join(m["role"] + ": " + m["content"] for m in row["messages"])}
ds = ds.map(to_text, remove_columns=["messages"])

trainer = SFTTrainer(
    model="meta-llama/Llama-3.1-8B-Instruct",
    args=SFTConfig(output_dir="out", learning_rate=2e-5, num_train_epochs=5,
                   per_device_train_batch_size=16, max_length=4096),
    train_dataset=ds,
    peft_config=LoraConfig(r=8, target_modules=["q_proj", "v_proj"]),
)
trainer.train()`,
      },
      hints: [
        'The model is loaded in float32 and not quantised at all; add a BitsAndBytesConfig and a bf16 dtype.',
        'Flattening to "role: content" text throws away the chat template and its end-of-turn tokens, and loss covers user text.',
        'LoRA needs ~10× the full-FT learning rate; 5 epochs without eval invites overfitting.',
      ],
      solution: {
        language: 'python',
        code: `import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

ds = load_dataset("json", data_files="chats.jsonl", split="train")
ds = ds.train_test_split(test_size=0.05, seed=42)   # keep conversations intact

bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4",
                         bnb_4bit_use_double_quant=True,
                         bnb_4bit_compute_dtype=torch.bfloat16)

args = SFTConfig(
    output_dir="out",
    model_init_kwargs={"dtype": torch.bfloat16, "device_map": "auto"},
    assistant_only_loss=True,          # chat template + loss only on replies
    max_length=2048,                   # p95 length, not a worst case
    packing=True,
    learning_rate=2e-4,                # adapter LR
    num_train_epochs=2,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,     # effective batch 16
    gradient_checkpointing=True,
    optim="paged_adamw_8bit",
    eval_strategy="steps", eval_steps=100,
    save_strategy="steps", save_steps=100,
    load_best_model_at_end=True, metric_for_best_model="eval_loss",
)

trainer = SFTTrainer(
    model="meta-llama/Llama-3.1-8B-Instruct",
    args=args,
    train_dataset=ds["train"], eval_dataset=ds["test"],
    quantization_config=bnb,
    peft_config=LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                           target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
trainer.save_model("out/best-adapter")`,
      },
      explanation: `- **Memory:** the original loaded fp32 weights (32 GB) with no quantisation; NF4 + double quant + bf16 compute + paged 8-bit Adam + batch 2 × grad-accum 8 brings it to ~10–12 GB.
- **Correct tokens:** keeping \`messages\` lets TRL apply the Llama chat template (with \`<|eot_id|>\`), and \`assistant_only_loss\` stops the model learning to write user turns, which is why it no longer runs on.
- **Hyper-parameters:** LR 2e-4 suits adapters, all-linear r=16/α=32 is a stronger default than q,v r=8, and 2 epochs with eval + best checkpoint avoids overfitting.`,
      followUps: [
        { q: 'Loss stays flat at the starting value for 300 steps. What do you check first?', a: 'That adapters are actually trainable (print_trainable_parameters > 0), that labels are not all -100 (assistant_only_loss with a template lacking generation markers), and that LR is not 2e-6 by mistake.' },
        { q: 'How would you ship this adapter to a llama.cpp/Ollama user?', a: 'Reload the base in bf16, merge_and_unload the adapter, save safetensors, convert to GGUF with llama.cpp convert script, then quantise to Q4_K_M; never merge into the 4-bit bitsandbytes weights.' },
      ],
    },
    {
      id: 'fine-tuning-cc-2',
      title: 'Harden a synthetic SFT dataset builder',
      context: 'A script asks a strong model to generate 5,000 Q&A pairs about internal APIs and writes them straight to train.jsonl. Eval accuracy is suspiciously high (97%) but production accuracy is 70%.',
      task: 'Rewrite the builder so it emits chat-format rows, deduplicates near-identical questions, filters low-quality answers, and splits train/eval without leakage.',
      starter: {
        language: 'python',
        code: `import json, random
from openai import OpenAI

client = OpenAI()
rows = []
for i in range(5000):
    r = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[{"role": "user", "content": "Write a Q and A about our Payments API"}],
    )
    q, a = r.choices[0].message.content.split("A:")
    rows.append({"text": q + a})

random.shuffle(rows)
json.dump(rows[:4500], open("train.jsonl", "w"))
json.dump(rows[4500:], open("eval.jsonl", "w"))`,
      },
      hints: [
        'The same prompt 5,000 times produces many near-duplicates; vary the seed topic and dedupe.',
        'Ask for JSON output and validate it instead of splitting on "A:".',
        'json.dump writes one JSON array, not JSONL; split by question group so paraphrases do not leak.',
      ],
      solution: {
        language: 'python',
        code: `import json, os, random, re
from openai import OpenAI

client = OpenAI()
MODEL = os.environ.get("GEN_MODEL", "gpt-5-mini")
TOPICS = [l.strip() for l in open("api_topics.txt") if l.strip()]  # e.g. 250 endpoints

def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()

rows, seen = [], set()
for i in range(5000):
    topic = TOPICS[i % len(TOPICS)]
    r = client.chat.completions.create(
        model=MODEL,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content":
            "Using only this API reference, write one realistic developer question and a correct answer. "
            "Return JSON with keys question and answer.\\n\\n" + open("refs/" + topic).read()}],
    )
    try:
        item = json.loads(r.choices[0].message.content)
        q, a = item["question"].strip(), item["answer"].strip()
    except (json.JSONDecodeError, KeyError):
        continue
    if len(a) < 40 or norm(q) in seen:                # quality + dedupe filter
        continue
    seen.add(norm(q))
    rows.append({"topic": topic, "messages": [
        {"role": "user", "content": q}, {"role": "assistant", "content": a}]})

# split by topic so paraphrased questions never straddle train and eval
topics = sorted({r["topic"] for r in rows})
random.Random(0).shuffle(topics)
eval_topics = set(topics[: max(1, len(topics) // 10)])
with open("train.jsonl", "w") as tr, open("eval.jsonl", "w") as ev:
    for r in rows:
        (ev if r["topic"] in eval_topics else tr).write(json.dumps(r) + "\\n")`,
      },
      explanation: `The original produced thousands of near-duplicate pairs from one prompt, so eval rows were paraphrases of train rows (leakage → 97%). The fix grounds each generation in a specific API reference, enforces JSON, drops short or duplicate items, writes real JSONL in chat format, and splits **by topic** so the eval measures generalisation to unseen endpoints. Add a human review of ~200 sampled rows and an LLM-judge pass for correctness before training.`,
      followUps: [
        { q: 'Exact-normalised dedupe still leaves paraphrases. How would you catch them?', a: 'Embed every question (e.g. bge-m3), cluster or do nearest-neighbour search, and drop items with cosine similarity above ~0.92 to an earlier item; MinHash on shingles works too for lexical near-duplicates.' },
        { q: 'How do you check the synthetic answers are actually correct?', a: 'Have a stronger model judge each answer against the source reference with a rubric, run any code examples against a sandbox, and have engineers label a stratified sample; drop topics with high error rates.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'fine-tuning-iq-1',
      difficulty: 'hard',
      question: 'A product manager wants to fine-tune a model on 2,000 past support tickets "so it knows our refund policy". How do you respond and what do you build instead or in addition?',
      context: 'The policy is updated every quarter; answers must cite the clause; current prompt-only bot is 70% correct.',
      whatInterviewerLooksFor: [
        'Separates knowledge gaps from behaviour gaps',
        'Proposes RAG for policy facts with citations',
        'Knows when fine-tuning still adds value (format, tone, cost)',
        'Insists on an eval set before any training',
        'Mentions data quality issues in historical tickets',
      ],
      modelAnswer: `**Diagnose first.** Build a 200-question eval from real tickets with the correct answer and clause id. Classify the 30% failures: *didn't know the rule* vs *knew it but answered badly* (format, tone, missed escalation).

**Knowledge → RAG.** Policy text changes quarterly and answers need citations, so index the policy (chunked by clause) and retrieve top-k clauses per query. Fine-tuned facts would go stale, cannot be cited, and the model would hallucinate near-miss clauses. Expect the biggest jump here (70% → ~90%).

**Behaviour → maybe fine-tune.** If the remaining failures are format/tone (not following the 4-step reply template, wrong escalation phrasing), SFT a LoRA adapter on *curated* tickets: filter to resolved, high-CSAT tickets, rewrite answers to the current policy, and strip PII. 2,000 raw tickets often contain outdated policy and agent mistakes, which the model would learn verbatim.

**Cost angle.** Fine-tuning a small open model (8B) on the template can replace a large model and shrink prompts, cutting cost 5–10×, which is a legitimate reason even when quality is similar.

**Plan:** eval set → strong prompt + RAG → measure → LoRA SFT on cleaned data for format only → A/B against the RAG baseline → ship with a regression suite that re-runs when the policy changes.`,
      followUps: [
        { q: 'The policy changes and the fine-tuned model keeps quoting the old rule even with RAG context. Why and what now?', a: 'The SFT data baked in the old policy so the model\'s prior fights the context. Rebuild training data with policy-neutral answers that reference retrieved clauses, train it to prefer context, and add eval cases for changed rules.' },
        { q: 'How many examples would you need for the format adapter?', a: 'Usually 500–2,000 clean, diverse examples; start with ~500, measure on the eval, and add examples targeting the failure clusters rather than just more volume.' },
      ],
      pitfalls: [
        'Fine-tuning on raw tickets that contain outdated policy and agent errors.',
        'Skipping the eval set and judging by vibes.',
        'Assuming fine-tuning makes the model cite sources.',
      ],
    },
    {
      id: 'fine-tuning-iq-2',
      difficulty: 'hard',
      question: 'Your LoRA fine-tune looks great in offline eval but in production the model emits stray "<|im_start|>assistant" strings and sometimes never stops. Walk through the root cause and fix.',
      whatInterviewerLooksFor: [
        'Identifies train/serve chat-template mismatch',
        'Knows EOS / end-of-turn token handling',
        'Checks tokenizer special tokens and stop sequences',
        'Adds a regression test that renders both paths',
      ],
      modelAnswer: `**Symptom pattern** = template mismatch. Offline eval probably used the same (custom) formatting as training, while the serving stack applies the model's official chat template, or vice versa.

**Likely causes:**
1. Training text was flattened manually ("user: ... assistant: ...") so the model never saw the real special tokens; at serve time the server renders \`<|im_start|>\` markers it has no habit of closing.
2. Training answers lacked the end-of-turn token (\`<|im_end|>\` for Qwen, \`<|eot_id|>\` for Llama 3), so the model never learned to stop; the server's stop token is never produced.
3. Tokenizer mismatch: the adapter was trained with a tokenizer where the special tokens were added but embeddings were not saved (\`modules_to_save\`), or serving loads a different tokenizer revision.

**Fix:**
- Retrain with conversational data rendered by \`apply_chat_template\` and \`assistant_only_loss=True\`; set \`eos_token\` in SFTConfig if the template's turn terminator differs from the tokenizer's EOS.
- Serve with the *same* tokenizer/template (ship \`tokenizer_config.json\` with the adapter) and configure stop tokens explicitly.
- Add a CI test that renders a sample through the training collator and the serving template and asserts identical token ids, plus a test that generation terminates within max tokens on 50 prompts.`,
      followUps: [
        { q: 'You added new special tokens for tool calls. What else must be saved with the adapter?', a: 'The resized embed_tokens and lm_head rows for the new tokens (modules_to_save or trainable_token_indices), plus the updated tokenizer; otherwise the new tokens map to random embeddings at load time.' },
        { q: 'How do you catch this before production next time?', a: 'Offline eval must call the real serving endpoint (vLLM/TGI with the shipped template) rather than a notebook generate(), and include termination and format checks in the eval suite.' },
      ],
      pitfalls: [
        'Blaming sampling temperature instead of the template.',
        'Patching with a regex that strips tokens rather than fixing training.',
        'Forgetting that base and instruct variants ship different templates.',
      ],
    },
    {
      id: 'fine-tuning-iq-3',
      difficulty: 'expert',
      question: 'You must fine-tune a 70B model for a regulated customer who forbids data leaving their single 8×A100-40GB server. Choose full fine-tuning, LoRA or QLoRA and justify with memory numbers.',
      whatInterviewerLooksFor: [
        'Computes memory per method correctly',
        'Considers sharding (FSDP/ZeRO) and activations',
        'Weighs quality vs throughput trade-offs',
        'Mentions merge/export path for serving',
      ],
      modelAnswer: `**Budget:** 8 × 40 GB = 320 GB total GPU memory.

| Method | Static memory | Fits? |
|---|---|---|
| Full FT, AdamW mixed precision | 70B × 16 B = 1.12 TB | No, even with ZeRO-3 (needs CPU/NVMe offload, very slow) |
| bf16 LoRA | 140 GB weights + adapters (~200M params × 16 B ≈ 3.2 GB) | Yes with FSDP sharding: ~18 GB/GPU + activations |
| QLoRA | 70B × ~0.52 B ≈ 36 GB + 3.2 GB | Yes, even on 1–2 GPUs |

**Choice: bf16 LoRA with FSDP across 8 GPUs** as the default: weights shard to ~17.5 GB per GPU, leaving ~15–20 GB for activations at 4k tokens with gradient checkpointing. It avoids QLoRA's quantisation error and ~30% dequantisation slowdown, and quality is close to full fine-tuning for instruction/format tasks.

**When QLoRA instead:** if activations at long context (16k+) do not fit, or you want to run several hyper-parameter sweeps in parallel (one 70B QLoRA job per 2 GPUs → 4 concurrent experiments).

**Serving/export:** merge the adapter into the bf16 base for a dedicated deployment, or keep it separate on a vLLM server with \`--enable-lora\`. Never merge into 4-bit weights. Keep data on-box: datasets, checkpoints and logs on local disk, telemetry disabled.`,
      followUps: [
        { q: 'FSDP with QLoRA — any gotcha?', a: 'You need a bitsandbytes/FSDP-compatible setup (e.g. bnb_4bit_quant_storage set to bf16 so FSDP can shard uniform dtypes) and must avoid device_map="auto" which conflicts with FSDP placement.' },
        { q: 'How would you estimate training time?', a: 'Tokens × 6 × trainable-forward FLOPs is for full FT; for LoRA roughly 4 × N_params × tokens (forward + activation backward, no weight grads); divide by GPUs × peak FLOPs × ~35–45% MFU.' },
      ],
      pitfalls: [
        'Forgetting optimizer state when sizing full fine-tuning.',
        'Assuming QLoRA is always preferable because it is smaller.',
        'Ignoring activation memory at long sequence lengths.',
      ],
    },
    {
      id: 'fine-tuning-iq-4',
      difficulty: 'hard',
      question: 'After a LoRA run the task metric barely moves (61% → 62%) even though training loss dropped. Give a structured debugging plan.',
      whatInterviewerLooksFor: [
        'Checks the eval actually exercises the adapter',
        'Verifies data/label masking and template',
        'Considers capacity (rank, targets) and LR',
        'Checks for train/eval distribution mismatch',
      ],
      modelAnswer: `**1. Is the adapter even used?** Confirm the eval loads the adapter (compare logits of base vs adapted on one prompt; they must differ). A surprising number of "no improvement" runs evaluate the base model or a merged checkpoint from the wrong step.

**2. Is the loss measuring the right thing?** If loss covers prompt tokens, a falling loss mostly reflects memorising boilerplate system prompts. Check the fraction of label tokens that are assistant tokens; switch to assistant-only loss.

**3. Does training data match the eval task?** Compare distributions: prompt lengths, topics, answer format. If eval asks for JSON but training answers are prose, the model learns the wrong thing. Inspect 20 eval failures next to their nearest training examples.

**4. Capacity and optimisation.** q,v-only r=8 at LR 2e-5 barely moves the weights. Use all-linear r=16–32, α=2r, LR 1e-4 to 2e-4, warmup 3–5%. Plot eval metric per checkpoint, not just final.

**5. Ceiling of the base model.** Measure the base with a strong few-shot prompt. If few-shot already gets 61% and errors are reasoning failures, SFT on answers alone will not add reasoning; consider a stronger base, adding rationales to training targets, or RAG/tools.

**6. Data quality.** Label noise of 15–20% caps achievable accuracy; audit a sample.`,
      followUps: [
        { q: 'How would you tell underfitting from a data mismatch?', a: 'Measure accuracy on a held-out slice of the training distribution: if that is high but the real eval is low it is mismatch; if both are low the model is underfitting or the task is beyond the base model.' },
        { q: 'When would full fine-tuning be the answer here?', a: 'When the needed shift is large (new language, new domain vocabulary, continued pretraining on millions of tokens) and LoRA at high rank still plateaus below the target, provided you have the GPU budget.' },
      ],
      pitfalls: [
        'Tuning hyper-parameters before verifying the adapter is loaded.',
        'Trusting training loss as the success metric.',
        'Ignoring a weak base-model ceiling.',
      ],
    },
    {
      id: 'fine-tuning-iq-5',
      difficulty: 'expert',
      question: 'Design a platform that lets 200 enterprise tenants each train and serve their own customised version of an 8B model.',
      whatInterviewerLooksFor: [
        'Adapter-per-tenant rather than model-per-tenant',
        'Training pipeline with data validation, eval gates and isolation',
        'Multi-LoRA serving with capacity maths',
        'Versioning tied to base model revisions',
        'Security and data isolation',
      ],
      modelAnswer: `**Core decision: one base, many LoRA adapters.** 200 merged 8B models = 3.2 TB of weights; 200 adapters at r=16 ≈ 200 × 84 MB = 17 GB.

**Training pipeline (per tenant job):**
1. Upload chat JSONL → validation (schema, roles, token length with the base template, PII scan, dedupe) → stored encrypted in the tenant's bucket.
2. QLoRA or bf16 LoRA job on a shared GPU pool (queue with per-tenant quotas); typical 2k examples × 2 epochs ≈ 15–30 min on one H100.
3. **Eval gate:** tenant-provided eval set + platform safety/regression suite; block promotion if the adapter is worse than base + prompt on the tenant eval or fails safety.
4. Register adapter with metadata: base model id + revision, dataset hash, hyper-params, eval scores.

**Serving:** vLLM with \`--enable-lora --max-loras 16 --max-lora-rank 32\` per replica; a router keeps tenant affinity (consistent hashing) so each replica's hot set stays in GPU memory; cold adapters load from local NVMe in ~100 ms. Capacity: base throughput minus ~10% for LoRA kernels.

**Lifecycle:** when the base model upgrades, retrain all adapters automatically from stored datasets and run the same eval gates; keep the old base serving until each tenant's new adapter passes.

**Isolation:** per-tenant encryption keys, no cross-tenant data in training, adapter ids authorised per API key, audit logs.`,
      followUps: [
        { q: 'One tenant has 40% of all traffic. Change anything?', a: 'Give that tenant a dedicated deployment with the adapter merged into the base (no LoRA overhead, simpler batching) and keep the long tail on shared multi-LoRA replicas.' },
        { q: 'How do you stop a tenant\'s data from teaching the model harmful behaviour?', a: 'Moderate training data before training, run a fixed safety eval suite as a promotion gate, and keep platform system prompts and output guardrails outside the adapter.' },
      ],
      pitfalls: [
        'Deploying a full model per tenant.',
        'Not pinning adapters to an exact base revision.',
        'Promoting adapters without an automatic eval gate.',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'fine-tuning-est-1',
      question: 'Estimate GPU memory to fine-tune Llama-3.1-8B with (a) full fine-tuning, (b) bf16 LoRA r=16 all-linear, (c) QLoRA, at 2,048 tokens and micro-batch 4 with gradient checkpointing.',
      assumptions: [
        '8.03B parameters; LoRA r=16 all-linear = 42M trainable params',
        'Full FT: bf16 weights + bf16 grads + fp32 master + Adam m, v = 16 bytes/param',
        'Adapter state = 16 bytes/trainable param',
        'Activations with checkpointing ≈ 2 × hidden × seq × batch × layers × 2 bytes ≈ 2 GB, plus ~3 GB for logits over a 128k vocab',
        'NF4 = 0.5 byte/param + 0.016 byte/param of double-quantised constants',
      ],
      steps: [
        { label: 'Full FT static', calc: '8.03e9 × 16 B = 128.5 GB' },
        { label: 'Activations', calc: '2 × 4096 × 2048 × 4 × 32 × 2 B ≈ 4.3 GB → with checkpointing ~2 GB; logits 4 × 2048 × 128,256 × 4 B (fp32) ≈ 4.2 GB, chunked to ~3 GB' },
        { label: 'Full FT total', calc: '128.5 + 5 ≈ 134 GB → needs 2 × 80 GB GPUs with ZeRO-3/FSDP' },
        { label: 'LoRA total', calc: 'weights 8.03e9 × 2 B = 16.1 GB + adapters 42e6 × 16 B = 0.67 GB + activations 5 GB ≈ 22 GB' },
        { label: 'QLoRA total', calc: 'weights 8.03e9 × 0.516 B ≈ 4.1 GB + ~1 GB bf16 embeddings/lm_head + 0.67 GB + 5 GB ≈ 11 GB' },
      ],
      answer: 'Full FT ≈ 134 GB (multi-GPU), bf16 LoRA ≈ 22 GB (one 24–40 GB GPU, tight on 24 GB), QLoRA ≈ 11 GB (fits a 16 GB card).',
      insight: 'Optimizer state, not weights, dominates full fine-tuning. Once LoRA removes it, activations and the logits tensor over a large vocabulary become the next bottleneck, which is why sequence length and micro-batch are the knobs that cause OOMs in adapter training.',
      followUps: [
        { q: 'You raise max_length to 8,192. What changes?', a: 'Activations and logits scale linearly with sequence length (~4×), so roughly +15 GB; QLoRA moves to ~26 GB and needs micro-batch 1 or a 40 GB GPU, while static weight memory is unchanged.' },
      ],
    },
    {
      id: 'fine-tuning-est-2',
      question: 'How long and how much will it cost to LoRA-fine-tune an 8B model on 20,000 chat examples averaging 800 tokens for 3 epochs on one H100?',
      assumptions: [
        'Training FLOPs for LoRA ≈ 4 × N × tokens (forward 2N, backward activations 2N; no weight-gradient pass for frozen weights)',
        'H100 bf16 dense peak ≈ 989 TFLOPS; achieved MFU 40%',
        'Illustrative cloud price $3 per H100-hour',
        'Packing removes padding waste',
      ],
      steps: [
        { label: 'Total tokens', calc: '20,000 × 800 × 3 epochs = 48M tokens' },
        { label: 'FLOPs', calc: '4 × 8.03e9 × 48e6 ≈ 1.54e18 FLOPs' },
        { label: 'Effective throughput', calc: '989e12 × 0.40 ≈ 3.96e14 FLOP/s' },
        { label: 'Time', calc: '1.54e18 / 3.96e14 ≈ 3,900 s ≈ 1.1 h (add ~30% for eval/checkpointing → ~1.4 h)' },
        { label: 'Cost', calc: '1.4 h × $3 ≈ $4.20 (QLoRA ~30% slower → ~$5.50)' },
      ],
      answer: 'About 1–1.5 GPU-hours on one H100, roughly $4–6 at an illustrative $3/hour.',
      insight: 'The training run is cheap; the real cost is building and reviewing the 20k-example dataset and the eval set. Budget engineering time for data, and run several cheap hyper-parameter sweeps instead of one "perfect" run.',
      followUps: [
        { q: 'Same job as full fine-tuning: what changes?', a: 'FLOPs rise to ~6 × N × tokens (≈2.3e18, ~1.5× time) and memory needs ≥2 H100s with sharding, so cost roughly triples to ~$15–20, still small compared with data work.' },
      ],
    },
  ],
  test: [
    {
      id: 'fine-tuning-mcq-01',
      difficulty: 'medium',
      question: 'A LoRA config targets only q_proj and v_proj with r=8 on Llama-3.1-8B (hidden 4096, 32 layers, 8 KV heads × 128 head_dim). How many trainable parameters does it add?',
      code: {
        language: 'python',
        code: `LoraConfig(r=8, lora_alpha=16, target_modules=["q_proj", "v_proj"], task_type="CAUSAL_LM")`,
      },
      options: ['≈ 3.4M', '≈ 6.8M', '≈ 41.9M', '≈ 1.07B'],
      correct: [0],
      explanation: 'q_proj: 8 × (4096 + 4096) = 65,536; v_proj under GQA maps 4096 → 1024: 8 × (4096 + 1024) = 40,960. Per layer 106,496 × 32 = 3,407,872 ≈ 3.4M. 6.8M assumes v is 4096 wide (ignores GQA) or is the bf16 file size in MB; 41.9M is r=16 on all linear layers.',
      followUps: [
        { q: 'What is the adapter file size in bf16?', a: 'About 3.4M × 2 bytes ≈ 6.8 MB, plus a small adapter_config.json; tiny compared with the 16 GB base weights.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-02',
      difficulty: 'medium',
      question: 'Which of these problems are better solved by retrieval or tools than by fine-tuning? Select ALL that apply.',
      options: [
        'Answers must reflect inventory levels that change hourly',
        'Responses must always use the company\'s 5-field JSON schema',
        'Every answer must cite the exact paragraph of the contract it relies on',
        'The model must answer about documents uploaded by each user today',
      ],
      correct: [0, 2, 3],
      explanation: 'Hourly data, per-user documents and paragraph-level citations are knowledge-access problems: retrieval or tools supply current, attributable context. A consistent output schema is behaviour, which fine-tuning (or structured output modes) handles well.',
      followUps: [
        { q: 'Could you combine both for the schema case?', a: 'Yes: use constrained decoding / JSON schema mode for guaranteed validity, and a light SFT so the model fills fields with the right semantics and fewer retries.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-03',
      difficulty: 'hard',
      question: 'What is the main problem with this preprocessing for SFT on a chat model?',
      code: {
        language: 'python',
        code: `def fmt(row):
    text = ""
    for m in row["messages"]:
        text += m["role"].upper() + ": " + m["content"] + "\\n"
    return {"text": text}

ds = ds.map(fmt)
SFTTrainer(model=MODEL, train_dataset=ds, args=SFTConfig(output_dir="o"))`,
      },
      options: [
        'It bypasses the model\'s chat template and trains loss on every token, so the model learns user/system text and never sees its real end-of-turn token',
        'It is fine; SFTTrainer re-applies the chat template to the "text" column automatically',
        'The only problem is that upper-cased role names increase the token count',
        'It breaks packing because packing requires a "messages" column',
      ],
      correct: [0],
      explanation: 'A "text" column is treated as plain language-modelling data: no chat template, no special tokens, loss on everything. At inference the server uses the real template, causing mismatch and non-terminating outputs. The trainer does not re-template a text column, and packing works with text too, so those distractors are wrong.',
      followUps: [
        { q: 'How should the dataset look instead?', a: 'Keep the conversational "messages" column so TRL applies the tokenizer\'s chat template, and set assistant_only_loss=True so only assistant turns produce loss.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-04',
      difficulty: 'hard',
      question: 'Which components does QLoRA combine to reduce fine-tuning memory? Select ALL that apply.',
      options: [
        'Storing the frozen base in 4-bit NormalFloat (NF4)',
        'Quantising the per-block quantisation constants (double quantization)',
        'Training the LoRA adapters themselves in 4-bit',
        'Paged optimizers that spill optimizer state to CPU memory during spikes',
      ],
      correct: [0, 1, 3],
      explanation: 'QLoRA keeps the base in NF4, double-quantises the block scales and uses paged optimizers. The adapters are trained in 16-bit (bf16) with a bf16 compute dtype; training them in 4-bit would make gradient updates far too coarse.',
      followUps: [
        { q: 'Roughly how much does double quantization save on a 65B model?', a: 'About 0.37 bit per parameter (0.5 → ~0.127 bit for constants), which is roughly 3 GB on a 65B model.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-05',
      difficulty: 'hard',
      question: 'You sweep LoRA rank r ∈ {8, 16, 64, 128} with lora_alpha fixed at 16. Higher ranks train noticeably slower and end worse. What is the most likely explanation?',
      options: [
        'Higher rank always overfits, so smaller rank is strictly better',
        'The effective scale α/r shrinks as r grows (2.0 → 0.125), so high-rank updates are tiny at the same LR',
        'Rank above 64 is not supported by PEFT and silently falls back to 8',
        'Higher rank removes the zero-initialisation of B',
      ],
      correct: [1],
      explanation: 'Standard LoRA scales updates by α/r. With fixed α=16, r=128 gives 0.125 versus 2.0 at r=8, so the adapter effectively has a 16× lower learning rate. Fix by scaling α with r or using rsLoRA (α/√r). Higher rank does not automatically overfit, and PEFT supports large ranks.',
      followUps: [
        { q: 'What does rsLoRA change?', a: 'It uses α/√r instead of α/r, which keeps gradient magnitudes stable as rank grows, so higher ranks can actually use their extra capacity.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-06',
      difficulty: 'hard',
      question: 'A 7B model OOMs on a 24 GB GPU during QLoRA training only on certain batches, after running fine for 400 steps. What is the best first change?',
      options: [
        'Switch from NF4 to FP4',
        'Sort or bucket by length / cap max_length near p95 and enable paged optimizers, because long-sequence batches spike activation memory',
        'Lower LoRA rank from 16 to 4',
        'Disable gradient checkpointing to reduce recomputation memory',
      ],
      correct: [1],
      explanation: 'Intermittent OOMs point to variable-length batches: activation and logits memory scale with sequence length. Capping length near p95 and paged optimizers absorb the spikes. NF4 vs FP4 barely changes memory, rank 4 saves only megabytes, and disabling checkpointing increases activation memory.',
      followUps: [
        { q: 'What else reduces logits memory for a 150k-token vocabulary?', a: 'Chunked or fused cross-entropy (e.g. Liger kernels) that never materialises the full fp32 logits tensor for the whole sequence at once.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-07',
      difficulty: 'hard',
      question: 'What will this export code produce?',
      code: {
        language: 'python',
        code: `bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4")
base = AutoModelForCausalLM.from_pretrained(BASE, quantization_config=bnb)
model = PeftModel.from_pretrained(base, "out/adapter")
merged = model.merge_and_unload()
merged.save_pretrained("export/merged")`,
      },
      options: [
        'A merged model with degraded quality, because the bf16 delta is added to weights that are dequantised and re-rounded to 4-bit (or the save path warns/fails depending on versions)',
        'A perfect bf16 merged model, because merge_and_unload always upcasts to bf16',
        'A model identical to the base, because adapters cannot be merged',
        'Two files: a 4-bit base and the adapter, unmerged',
      ],
      correct: [0],
      explanation: 'Merging into a 4-bit base requires dequantising, adding ΔW and re-quantising, which introduces rounding error and is the documented anti-pattern. Reload the base in bf16, merge there, then quantise for serving with GGUF/AWQ/GPTQ. merge_and_unload does not upcast the stored weights for you.',
      followUps: [
        { q: 'Why might a merged-then-quantised model still differ from QLoRA training behaviour?', a: 'Training saw NF4-quantised base weights; serving uses a different quantiser (e.g. AWQ or Q4_K_M) applied after merging, so small numerical differences can shift outputs and must be re-evaluated.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-08',
      difficulty: 'medium',
      question: 'An SFT run with a strong LoRA config improves your task but a general reasoning benchmark drops 8 points. Which mitigations are reasonable? Select ALL that apply.',
      options: [
        'Mix 5–20% general instruction data into the training set',
        'Lower the number of epochs / LR and select the checkpoint on both task and general evals',
        'Increase the LoRA rank to 256 so the adapter has room for both tasks',
        'Keep the adapter unmerged and route only task traffic through it',
      ],
      correct: [0, 1, 3],
      explanation: 'Replay of general data, gentler training with dual-metric checkpoint selection, and routing only relevant traffic to the adapter all limit forgetting in practice. A much higher rank gives the adapter more capacity to move away from the base and typically increases drift rather than preventing it.',
      followUps: [
        { q: 'How would you monitor forgetting continuously?', a: 'Add a fixed general benchmark (e.g. a few hundred MMLU-style and instruction-following items) to the eval suite that runs on every checkpoint and blocks promotion on large regressions.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-09',
      difficulty: 'hard',
      question: 'Why is LoRA\'s B matrix initialised to zeros while A is random?',
      options: [
        'To make the adapter numerically stable in fp16 by avoiding large values',
        'So that ΔW = BA = 0 at step 0, meaning training starts exactly from the pretrained model\'s behaviour while gradients can still flow to B',
        'Because zero-initialised matrices compress better in safetensors',
        'So that A can be frozen and only B trained',
      ],
      correct: [1],
      explanation: 'With B = 0 the adapted model equals the base at initialisation; A being random means ∂L/∂B is non-zero so learning starts immediately. If both were zero, gradients to both would be zero. Both A and B are trained.',
      followUps: [
        { q: 'What do methods like PiSSA or LoftQ change about initialisation?', a: 'They initialise A and B from the principal singular components of W (or to compensate quantisation error), so the adapter starts in a more useful subspace and often converges faster.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-10',
      difficulty: 'expert',
      question: 'Your data has 10,000 short examples (mean 180 tokens). You enable packing with max_length=4096 and see throughput rise 3×, but quality drops slightly on multi-turn prompts. What is the most plausible cause and fix?',
      options: [
        'Packing leaks attention across concatenated examples; use a packing strategy with per-sequence attention boundaries (padding-free / position-id resets with FlashAttention) or shorter blocks',
        'Packing changes the tokenizer; retokenise without packing',
        'Packing doubles the effective learning rate; halve the LR',
        'Packing drops the EOS token; disable assistant_only_loss',
      ],
      correct: [0],
      explanation: 'Naive packing concatenates examples so tokens can attend to unrelated earlier examples, which can confuse multi-turn context. Modern TRL best-fit packing is padding-free with position-id resets so FlashAttention masks attention per example. Packing does not change the tokenizer or LR, and disabling assistant-only loss would make things worse.',
      followUps: [
        { q: 'When is plain padding better than packing?', a: 'When examples are long and similar in length (little padding waste) or when your attention backend cannot respect sequence boundaries inside a packed block.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-11',
      difficulty: 'expert',
      question: 'Which statements about multi-tenant LoRA serving are true? Select ALL that apply.',
      options: [
        'A server like vLLM can batch requests that use different adapters in the same forward pass',
        'Each adapter must be merged into its own copy of the base before serving',
        'The number of adapters resident on GPU is bounded by a configured slot count, with others swapped from CPU memory',
        'Adapters trained on one base revision can be safely reused on a newer base revision',
      ],
      correct: [0, 2],
      explanation: 'Multi-LoRA servers apply per-row adapters within one batch (punica/SGMV-style kernels) and keep a bounded LRU of adapters on GPU (max_loras). Merging per tenant defeats the purpose, and adapters learned on one set of base weights are not valid deltas for different weights.',
      followUps: [
        { q: 'What config limits the largest adapter you can load in vLLM?', a: 'max_lora_rank sets the maximum rank allocated in the LoRA slots; adapters with a higher rank fail to load, so set it to the largest rank you train.' },
      ],
    },
    {
      id: 'fine-tuning-mcq-12',
      difficulty: 'expert',
      question: 'This code is intended to fine-tune with LoRA, but GPU memory is ~32 GB for an 8B model before training starts. Why?',
      code: {
        language: 'python',
        code: `trainer = SFTTrainer(
    model="meta-llama/Llama-3.1-8B-Instruct",
    args=SFTConfig(output_dir="out", learning_rate=2e-4),
    train_dataset=ds,
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear"),
)`,
      },
      options: [
        'TRL loads a model given as a string in float32 unless dtype is set via model_init_kwargs, so 8B × 4 bytes ≈ 32 GB',
        'LoRA adapters on all linear layers take 16 GB',
        'The optimizer allocates Adam state for all 8B parameters even with LoRA',
        'Gradient checkpointing duplicates the weights',
      ],
      correct: [0],
      explanation: 'TRL documents that string model ids load in float32 when no dtype is specified (unlike from_pretrained in Transformers v5). 8.03B × 4 B ≈ 32 GB. Adapters are ~42M params (~84 MB), Adam state only covers trainable parameters, and checkpointing trades compute for activation memory without duplicating weights.',
      followUps: [
        { q: 'Fix it in one line.', a: 'Pass model_init_kwargs={"dtype": torch.bfloat16} in SFTConfig (or pre-load the model in bf16 and pass the object), halving weight memory to ~16 GB.' },
      ],
    },
  ],
};

export default topic;
