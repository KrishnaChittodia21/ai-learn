import type { Topic } from '../../types';

const topic: Topic = {
  id: 'alignment-distillation',
  phase: 'models',
  order: 2,
  title: 'RLHF, DPO and Knowledge Distillation',
  subtitle: 'Teach a model what "better" means from preferences, then shrink it into a cheaper student',
  estimatedMinutes: 44,
  sources: [
    'Ouyang et al. 2022 — Training language models to follow instructions with human feedback (InstructGPT, arXiv:2203.02155)',
    'Schulman et al. 2017 — Proximal Policy Optimization Algorithms (arXiv:1707.06347)',
    'Rafailov et al. 2023 — Direct Preference Optimization: Your Language Model is Secretly a Reward Model (arXiv:2305.18290)',
    'Hugging Face TRL docs — DPO Trainer (DPOConfig beta=0.1, loss_type options, precompute_ref_log_probs)',
    'Shao et al. 2024 — DeepSeekMath (GRPO) (arXiv:2402.03300)',
    'Ethayarajh et al. 2024 — KTO; Hong et al. 2024 — ORPO; Meng et al. 2024 — SimPO',
    'Hinton, Vinyals, Dean 2015 — Distilling the Knowledge in a Neural Network (arXiv:1503.02531)',
    'Kim & Rush 2016 — Sequence-Level Knowledge Distillation (arXiv:1606.07947)',
    'Agarwal et al. 2024 — On-Policy Distillation of Language Models (GKD, arXiv:2306.13649)',
    'DeepSeek-AI 2025 — DeepSeek-R1 (distilled Qwen/Llama students, arXiv:2501.12948)',
  ],
  tags: ['rlhf', 'ppo', 'reward-model', 'dpo', 'grpo', 'preference-optimization', 'distillation', 'trl'],
  cheatSheet: [
    'RLHF pipeline: SFT → reward model on human comparisons (Bradley–Terry: −log σ(r_chosen − r_rejected)) → PPO maximising reward − β·KL(π‖π_ref).',
    'PPO keeps 4 models live: policy (trained), value/critic (trained), reference (frozen), reward model (frozen) → ~4× the memory of SFT.',
    'The KL penalty to the SFT reference stops reward hacking and language drift; too small β → gibberish that games the RM, too large → no change.',
    'DPO loss: −log σ(β[(log π_θ(y_w) − log π_ref(y_w)) − (log π_θ(y_l) − log π_ref(y_l))]); no reward model, no sampling, β ≈ 0.1.',
    'DPO data: {prompt, chosen, rejected}; loss starts at ln 2 ≈ 0.693; watch rewards/margins and rewards/accuracies, not just loss.',
    'Variants: IPO (squared loss, less overfit), KTO (unpaired thumbs up/down), ORPO (no reference model, SFT + odds ratio), SimPO (length-normalised, no reference), GRPO (online RL without a critic, group-relative advantages).',
    'Logit distillation: KL between teacher and student softmax at temperature T, scaled by T²; needs white-box teacher and a shared vocabulary.',
    'Sequence-level distillation: SFT the student on teacher-generated outputs; works across tokenizers and via APIs (check terms of service).',
    'On-policy distillation (GKD): the student generates, the teacher scores its tokens; fixes train/test mismatch of offline distillation.',
    'Typical LRs: DPO full model 5e-7 to 1e-6, DPO LoRA ~5e-6 to 1e-5; 1–3 epochs; always start from a good SFT model.',
  ],
  sections: [
    {
      heading: 'RLHF — reward models, PPO and the KL leash',
      body: `**Intuition:** it is hard to *write* the perfect answer, but easy to say which of two answers is better. RLHF turns thousands of "A is better than B" judgments into a reward signal and lets the model practise against it.

**The classic three stages (InstructGPT):**
1. **SFT** on demonstrations → the starting policy π_SFT (also kept frozen as the reference π_ref).
2. **Reward model (RM):** same backbone with a scalar head, trained on comparisons with the Bradley–Terry loss \`−log σ(r(x, y_w) − r(x, y_l))\`. Output: one number per (prompt, response).
3. **PPO:** sample responses from the policy, score them with the RM, and update the policy to maximise \`r(x, y) − β · KL(π_θ ‖ π_ref)\`. A value model (critic) estimates expected reward to reduce variance; PPO's clipped objective limits each step.

| Model in memory | Trained? | Role |
|---|---|---|
| Policy | yes | generates, gets updated |
| Value / critic | yes | baseline for advantages |
| Reference | frozen | KL anchor |
| Reward model | frozen | scores responses |

**What goes wrong:** *reward hacking* (the policy finds RM blind spots: longer answers, flattery, repeated hedges), training instability and heavy compute (online generation every step, 4 models).

**2025–26 practice:** PPO-style online RL is now used mostly with **verifiable rewards** (unit tests, math answers) via **GRPO**, which drops the critic and uses the mean reward of a group of 8–64 samples per prompt as the baseline. For subjective preferences, teams usually start with offline DPO.

**When to use it:** you have a reliable reward (trained RM or programmatic verifier), the budget for online generation, and need gains beyond what offline preference data gives.`,
      example: `A summarisation RM is trained on 50k comparisons and reaches 72% agreement with held-out human labels. PPO with β = 0.02 raises the mean RM score from 1.1 to 3.4 in 2,000 steps, but human win rate vs SFT peaks at step 800 (61%) and drops to 48% by step 2,000: the policy learned that the RM likes longer summaries (average length 85 → 210 tokens). Raising β to 0.1 and adding a length penalty (−0.002 per token above 120) gives RM score 2.6, human win rate 64%, and average length 118 tokens. Lesson: track KL and length alongside reward, and validate with humans or a separate judge.`,
      diagram: `  prompts --> [Policy pi_theta] --sample--> responses y
                     ^                          |
                     |                          v
              PPO update            +-----------------------+
           (clipped ratio,          | Reward model r(x,y)   |--> score
            advantages from         +-----------------------+      |
            Value model)            | Reference pi_ref      |--> KL |
                     |              +-----------------------+      |
                     +------ reward = r(x,y) - beta * KL <---------+

  Stage 2 (offline): (x, y_w, y_l) --> RM loss = -log sigmoid(r_w - r_l)`,
      code: [
        {
          language: 'python',
          title: 'Reward-model loss and KL-shaped per-token rewards (the core of RLHF)',
          code: `import torch
import torch.nn.functional as F

def reward_model_loss(r_chosen: torch.Tensor, r_rejected: torch.Tensor) -> torch.Tensor:
    # Bradley-Terry: P(chosen > rejected) = sigmoid(r_c - r_r)
    return -F.logsigmoid(r_chosen - r_rejected).mean()

def shaped_rewards(rm_score, logp_policy, logp_ref, mask, beta=0.05):
    """Per-token rewards as used by PPO-style RLHF.
    rm_score:    (B,)   scalar score for each full response
    logp_*:      (B, T) log-probs of the sampled tokens under each model
    mask:        (B, T) 1 for response tokens, 0 for padding
    """
    kl = (logp_policy - logp_ref) * mask          # per-token KL estimate
    rewards = -beta * kl                           # KL penalty on every token
    last = mask.sum(dim=1).long() - 1              # index of final response token
    rewards[torch.arange(rewards.size(0)), last] += rm_score  # RM score at the end
    return rewards, kl.sum(dim=1)

# toy batch
r_c, r_r = torch.tensor([2.1, 0.3]), torch.tensor([1.0, 0.9])
print("RM loss", reward_model_loss(r_c, r_r).item())   # ~0.66

lp_pol = torch.tensor([[-1.0, -0.5, -2.0]])
lp_ref = torch.tensor([[-1.2, -0.9, -2.0]])
mask = torch.ones_like(lp_pol)
rew, kl = shaped_rewards(torch.tensor([3.0]), lp_pol, lp_ref, mask, beta=0.1)
print(rew, kl)   # tensor([[-0.02, -0.04, 3.0]]) tensor([0.6])`,
        },
      ],
      prosCons: {
        pros: [
          'Optimises for what humans prefer rather than imitating fixed demonstrations, so the policy can exceed the SFT data.',
          'Online sampling lets the model learn from its own mistakes (on-policy), which offline methods cannot.',
          'Works with programmatic rewards (tests, verifiers) for reasoning and code, the basis of modern reasoning-model training.',
        ],
        cons: [
          { con: 'Reward hacking: the policy exploits RM blind spots (length, flattery, hedging).', fix: 'Tune the KL coefficient β, add length or format penalties, refresh the RM with new comparisons on policy outputs, and validate with held-out human or judge evals.' },
          { con: 'Four models in memory and online generation make PPO 3–5× more expensive than SFT.', fix: 'Use GRPO to drop the critic, LoRA adapters sharing one frozen base for policy/reference, and vLLM for fast rollouts.' },
          { con: 'Unstable training: reward spikes, KL blow-ups, mode collapse.', fix: 'Clip ratios, normalise advantages and rewards, use small LRs (~1e-6), and stop early on KL > target (e.g. 6–10 nats per sequence).' },
          { con: 'An RM is only as good as the comparison data (≈65–75% inter-annotator agreement).', fix: 'Write labelling guidelines, measure agreement, drop ambiguous pairs, and mix in AI feedback (RLAIF) only after checking it against humans.' },
        ],
      },
      keyPoints: [
        'SFT → reward model → PPO with KL penalty to the reference.',
        'RM loss is Bradley–Terry: −log σ(r_w − r_l).',
        'Track reward, KL and length together; reward alone lies.',
        'GRPO drops the critic and dominates verifiable-reward RL.',
      ],
      exercise: {
        prompt: `Implement \`group_advantages(rewards, group_size)\` for GRPO: \`rewards\` is a flat tensor of scores for \`B × G\` samples (G samples per prompt, consecutive). Return advantages \`(r − mean_group) / (std_group + 1e-6)\`.

Acceptance: for rewards [1, 0, 0, 1, 5, 5, 5, 5] with G=4, the first group gives [1, −1, −1, 1] (±1 after normalisation, using population std) and the second group gives all zeros.`,
        starter: {
          language: 'python',
          code: `import torch

def group_advantages(rewards: torch.Tensor, group_size: int) -> torch.Tensor:
    # TODO: reshape to (num_prompts, group_size)
    # TODO: subtract per-group mean, divide by per-group std (+1e-6)
    # TODO: flatten back
    ...`,
        },
        hints: [
          'rewards.view(-1, group_size) gives one row per prompt.',
          'Use std(dim=1, unbiased=False, keepdim=True) for the population std.',
          'A group where every sample has the same reward carries no learning signal, so advantages should be 0.',
        ],
        solution: {
          language: 'python',
          code: `import torch

def group_advantages(rewards: torch.Tensor, group_size: int) -> torch.Tensor:
    g = rewards.view(-1, group_size).float()
    mean = g.mean(dim=1, keepdim=True)
    std = g.std(dim=1, unbiased=False, keepdim=True)
    return ((g - mean) / (std + 1e-6)).view(-1)

adv = group_advantages(torch.tensor([1., 0., 0., 1., 5., 5., 5., 5.]), 4)
print(adv)  # tensor([ 1., -1., -1.,  1.,  0.,  0.,  0.,  0.])`,
        },
        explanation: 'GRPO replaces the learned critic with the group mean as a baseline, so each sample is judged relative to its siblings for the same prompt. Groups where all samples score equally (all right or all wrong) contribute no gradient, which is why prompt difficulty filtering matters in GRPO training.',
      },
      quickCheck: {
        question: 'During PPO, the RM score keeps rising while human ratings fall and responses get much longer. What is the best first adjustment?',
        options: [
          'Lower the KL coefficient so the policy can explore more',
          'Increase the KL coefficient and/or add a length penalty, then refresh the RM with comparisons on current policy outputs',
          'Train for more steps until human ratings recover',
          'Replace the reference model with the latest policy checkpoint',
        ],
        correct: 1,
        explanation: 'This is reward hacking: the policy exploits the RM\'s length bias. A stronger KL leash and length penalty constrain it, and new comparisons on policy outputs fix the RM blind spot. Lowering KL or training longer makes hacking worse, and moving the reference removes the anchor.',
      },
      source: 'Ouyang et al. 2022 — InstructGPT; Shao et al. 2024 — GRPO',
    },
    {
      heading: 'DPO — preference optimisation without a reward model',
      body: `**Intuition:** DPO skips the "train a judge, then practise against it" loop. It directly nudges the model to make the chosen answer *relatively* more likely and the rejected one *relatively* less likely, compared with a frozen copy of itself.

**Mechanics.** For a pair (prompt x, chosen y_w, rejected y_l):

\`L = −log σ( β · [ (log π_θ(y_w|x) − log π_ref(y_w|x)) − (log π_θ(y_l|x) − log π_ref(y_l|x)) ] )\`

The term \`β · log(π_θ/π_ref)\` is an **implicit reward**; the DPO paper shows minimising this loss solves the same KL-constrained objective as RLHF in closed form. Only two models are needed (policy + frozen reference), and there is no sampling, so it trains like SFT.

| Knob | Typical | Effect |
|---|---|---|
| β | 0.1 (0.01–0.5) | higher = stay closer to reference |
| LR | 5e-7–1e-6 full, ~5e-6 LoRA | DPO is sensitive; too high collapses |
| Epochs | 1–3 | overfits fast on small data |
| \`precompute_ref_log_probs\` | True when memory-tight | drops the reference from GPU |

**Health metrics** (TRL logs them): \`rewards/accuracies\` (should rise to 0.7–0.9), \`rewards/margins\` (rising), and \`logps/chosen\` (if it falls a lot, the model is lowering *both* responses, a known DPO failure; add an SFT term or try APO/RPO-style losses).

**Variants:** IPO (bounded loss, resists overfitting), KTO (unpaired thumbs-up/down data), ORPO and SimPO (no reference model), \`sigmoid_norm\` (length-normalised to counter verbosity bias).

**When to use it:** you have (or can generate) preference pairs and want alignment gains (tone, helpfulness, refusing correctly, preferring concise answers) with SFT-level infrastructure. Use online RL (GRPO) when you have a verifier and need the model to learn from its own samples.`,
      example: `One pair, β = 0.1. Summed log-probs: policy chosen −12.0, rejected −15.0; reference chosen −12.5, rejected −14.0.
- Chosen log-ratio = −12.0 − (−12.5) = **+0.5**; rejected log-ratio = −15.0 − (−14.0) = **−1.0**.
- Margin = 0.5 − (−1.0) = 1.5 → β × 1.5 = 0.15.
- Loss = −log σ(0.15) = −log(0.537) = **0.621** (at initialisation, policy = reference, so loss = ln 2 = 0.693).
- Implicit rewards logged by TRL: chosen 0.05, rejected −0.10, margin 0.15, accuracy 1 for this pair.
On a 10k-pair helpfulness set, a LoRA DPO run at β = 0.1 reached rewards/accuracies 0.81 after one epoch and improved an LLM-judge win rate over the SFT model from 50% to 63%.`,
      diagram: `   (prompt, chosen y_w, rejected y_l)
             |                       |
             v                       v
     +---------------+       +---------------+
     | policy pi_th  |       | reference     |  (frozen SFT copy,
     | log p(y_w)    |       | log p(y_w)    |   or adapters off)
     | log p(y_l)    |       | log p(y_l)    |
     +-------+-------+       +-------+-------+
             +-----------+-----------+
                         v
   margin = (lp_w - ref_w) - (lp_l - ref_l)
   loss   = -log sigmoid(beta * margin)   --> backprop into policy only`,
      code: [
        {
          language: 'python',
          title: 'DPO with TRL on top of an SFT model (LoRA, reference = adapters disabled)',
          code: `import torch
from datasets import load_dataset
from peft import LoraConfig
from trl import DPOConfig, DPOTrainer

# rows: {"prompt": [...messages], "chosen": [assistant msg], "rejected": [assistant msg]}
pairs = load_dataset("json", data_files="prefs.jsonl", split="train").train_test_split(0.05, seed=0)

args = DPOConfig(
    output_dir="out/dpo-qwen3-8b",
    model_init_kwargs={"dtype": torch.bfloat16},
    beta=0.1,                        # strength of the KL-style anchor
    loss_type=["sigmoid"],           # classic DPO; try ["ipo"] or ["sigmoid_norm"]
    learning_rate=5e-6,              # LoRA DPO; ~5e-7 for full fine-tuning
    num_train_epochs=1,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,
    max_length=2048,
    eval_strategy="steps", eval_steps=100,
    logging_steps=10,
)

trainer = DPOTrainer(
    model="my-org/qwen3-8b-sft",     # ALWAYS start from your SFT checkpoint
    args=args,
    train_dataset=pairs["train"],
    eval_dataset=pairs["test"],
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear",
                           task_type="CAUSAL_LM"),
    # with PEFT and no ref_model, the reference is the base with adapters disabled
)
trainer.train()
# watch: rewards/accuracies -> 0.7-0.9, rewards/margins rising,
#        logps/chosen should not collapse`,
        },
      ],
      prosCons: {
        pros: [
          'SFT-like simplicity: no reward model, no online generation, two models (or one with adapters toggled).',
          'Stable and cheap: a 10k-pair LoRA run on an 8B model takes about an hour on one H100.',
          'Directly uses preference datasets (human or AI-labelled) and many variants are one config flag away.',
        ],
        cons: [
          { con: 'Offline: learns only from fixed pairs, not from the model\'s own current outputs.', fix: 'Run iterative/online DPO: sample new responses from the current policy, label them with a judge or RM, and repeat for 2–3 rounds.' },
          { con: 'Verbosity bias: longer chosen responses push the model to ramble.', fix: 'Length-balance the pairs, use length-normalised loss (sigmoid_norm/SimPO) or LD-DPO weighting, and report length in evals.' },
          { con: 'Likelihood displacement: both chosen and rejected log-probs fall, hurting fluency.', fix: 'Add an SFT term on chosen (loss_type ["sigmoid","sft"] with weights), lower LR, or use APO/RPO-style anchored losses.' },
          { con: 'Overfits quickly on small or noisy pair sets.', fix: 'Use 1 epoch, β 0.1–0.3, IPO or robust loss with label smoothing, and drop pairs where annotators disagreed.' },
        ],
      },
      keyPoints: [
        'Loss starts at ln 2 = 0.693; implicit reward = β·log(π/π_ref).',
        'Start from a good SFT model; DPO is a refinement step.',
        'Monitor rewards/accuracies, margins and logps/chosen.',
        'Use KTO for thumbs up/down data, GRPO for verifiable rewards.',
      ],
      exercise: {
        prompt: `Implement \`dpo_loss(pol_w, pol_l, ref_w, ref_l, beta=0.1)\` in PyTorch where each argument is a \`(B,)\` tensor of **summed response log-probs**. Return \`(loss, chosen_reward, rejected_reward, accuracy)\` as TRL logs them.

Acceptance: with pol_w=−12, pol_l=−15, ref_w=−12.5, ref_l=−14, β=0.1 → loss ≈ 0.621, chosen reward 0.05, rejected −0.10, accuracy 1.0; with policy = reference the loss is ln 2.`,
        starter: {
          language: 'python',
          code: `import torch
import torch.nn.functional as F

def dpo_loss(pol_w, pol_l, ref_w, ref_l, beta=0.1):
    # TODO: log-ratios for chosen and rejected
    # TODO: loss = -logsigmoid(beta * (chosen_ratio - rejected_ratio)).mean()
    # TODO: implicit rewards and accuracy
    ...`,
        },
        hints: [
          'chosen_ratio = pol_w - ref_w; rejected_ratio = pol_l - ref_l.',
          'Use F.logsigmoid for numerical stability rather than torch.log(torch.sigmoid(...)).',
          'Implicit rewards are beta * ratio; accuracy is the mean of (chosen_reward > rejected_reward).',
        ],
        solution: {
          language: 'python',
          code: `import math
import torch
import torch.nn.functional as F

def dpo_loss(pol_w, pol_l, ref_w, ref_l, beta=0.1):
    chosen_ratio = pol_w - ref_w
    rejected_ratio = pol_l - ref_l
    logits = beta * (chosen_ratio - rejected_ratio)
    loss = -F.logsigmoid(logits).mean()
    chosen_r = (beta * chosen_ratio).detach()
    rejected_r = (beta * rejected_ratio).detach()
    acc = (chosen_r > rejected_r).float().mean()
    return loss, chosen_r.mean(), rejected_r.mean(), acc

t = lambda x: torch.tensor([x])
loss, cr, rr, acc = dpo_loss(t(-12.), t(-15.), t(-12.5), t(-14.))
print(round(loss.item(), 3), cr.item(), rr.item(), acc.item())  # 0.621 0.05 -0.1 1.0
same = dpo_loss(t(-3.), t(-4.), t(-3.), t(-4.))[0].item()
assert abs(same - math.log(2)) < 1e-6`,
        },
        explanation: 'When policy equals reference both log-ratios are zero, so the loss is −log σ(0) = ln 2. The gradient pushes the chosen ratio up and the rejected ratio down, weighted by how wrong the current implicit reward ordering is (σ of the negative margin).',
      },
      quickCheck: {
        question: 'During DPO training, rewards/accuracies climbs to 0.9 but logps/chosen drops from −120 to −260 and outputs become less fluent. What is happening?',
        options: [
          'The model is overfitting by making chosen responses far more likely',
          'The margin grows mainly by pushing both responses down (rejected faster), displacing probability mass away from the chosen answers',
          'The reference model is being updated along with the policy',
          'β is too high, so the policy cannot move',
        ],
        correct: 1,
        explanation: 'DPO only constrains the *difference* of log-ratios, so it can increase the margin while lowering both likelihoods. That is likelihood displacement. Fix with an SFT term on chosen, lower LR or an anchored loss. The reference is frozen, and a high β would restrict movement rather than cause a collapse.',
      },
      source: 'Rafailov et al. 2023 — DPO; Hugging Face TRL DPO Trainer docs',
    },
    {
      heading: 'Knowledge Distillation — logit-level vs sequence-level students',
      body: `**Intuition:** a teacher model's probabilities carry more information than the right answer alone. "Paris 0.90, Lyon 0.06, Marseille 0.03" teaches the student which wrong answers are *almost* right. Distillation trains a small student to imitate a big teacher so you get most of the quality at a fraction of the cost.

**Logit-level (white-box) distillation** (Hinton et al. 2015): soften both distributions with temperature T and minimise

\`L = α · T² · KL(softmax(z_t/T) ‖ softmax(z_s/T)) + (1 − α) · CE(y, z_s)\`

T = 2–4 exposes the "dark knowledge"; T² keeps gradient magnitudes comparable as T changes. Requires access to teacher logits and a **shared vocabulary/tokenizer** (e.g. Llama 70B → Llama 8B).

**Sequence-level distillation** (Kim & Rush 2016): the teacher *generates* outputs for many prompts, and the student is SFT-trained on them. Works across tokenizers and with API-only teachers. DeepSeek-R1's distilled Qwen/Llama models were trained this way on ~800k teacher samples.

**On-policy distillation (GKD):** the student generates, and the teacher provides token-level targets on the student's own outputs, fixing the exposure-bias gap of offline distillation.

| Type | Needs | Cost | Best for |
|---|---|---|---|
| Logit | teacher logits, same vocab | teacher forward per batch | max fidelity, same family |
| Sequence | teacher generations | one-off generation | API teachers, cross-family |
| On-policy | teacher scoring online | highest | closing the last gap |

**When to use it:** a big model meets the quality bar on a narrow task but is too slow or expensive. Check the teacher's licence/terms: several API providers prohibit using outputs to train competing models.`,
      example: `A classification + rationale task runs on a 70B model at 1.2 s p50 and an illustrative $0.90 per 1M tokens. Sequence-level distillation: generate 60k teacher answers (prompts from production logs, PII scrubbed), filter to those a judge marks correct (52k), SFT an 8B student with LoRA. Result: 8B student scores 91.5% vs teacher 93.0% and base 8B 78%, at 0.25 s p50 and ~6× lower cost. Adding logit-level KD (T = 2, α = 0.5) using the same-family 70B teacher lifted the student to 92.3%, at the price of running the teacher forward pass during training (~2× training time).`,
      diagram: `   LOGIT-LEVEL                         SEQUENCE-LEVEL
   input x                              prompts --> teacher.generate()
     |          \\                                    |
     v           v                                    v
 [teacher]   [student]                       filter / judge outputs
  z_t/T       z_s/T                                  |
     |           |                                    v
     v           v                         student SFT on (x, y_teacher)
 softmax     log_softmax
     \\          /                          works across tokenizers,
   T^2 * KL(p_t || p_s)  + CE(y, z_s)      only needs teacher outputs`,
      code: [
        {
          language: 'python',
          title: 'Logit-level distillation loss for causal LMs (masked, temperature-scaled)',
          code: `import torch
import torch.nn.functional as F

def kd_loss(student_logits, teacher_logits, labels, T=2.0, alpha=0.5):
    """student_logits, teacher_logits: (B, S, V); labels: (B, S) with -100 = ignore.
    Teacher and student must share the tokenizer / vocabulary."""
    # shift so position t predicts token t+1
    s = student_logits[:, :-1].float()
    t = teacher_logits[:, :-1].float()
    y = labels[:, 1:]
    mask = (y != -100)

    # soft part: KL(p_teacher || p_student) at temperature T, per token
    log_p_s = F.log_softmax(s / T, dim=-1)
    log_p_t = F.log_softmax(t / T, dim=-1)
    kl = (log_p_t.exp() * (log_p_t - log_p_s)).sum(-1)       # (B, S-1)
    soft = (kl * mask).sum() / mask.sum() * T * T             # T^2 keeps grad scale

    # hard part: normal cross-entropy on ground-truth tokens
    hard = F.cross_entropy(s.reshape(-1, s.size(-1)), y.reshape(-1), ignore_index=-100)
    return alpha * soft + (1 - alpha) * hard

# usage inside a training step
# with torch.no_grad():
#     t_logits = teacher(input_ids, attention_mask=attn).logits   # teacher frozen, eval()
# s_logits = student(input_ids, attention_mask=attn).logits
# loss = kd_loss(s_logits, t_logits, labels)`,
        },
      ],
      prosCons: {
        pros: [
          'Students recover most of the teacher\'s task quality at 5–20× lower latency and cost (DistilBERT kept ~97% of BERT\'s performance at 40% smaller and 60% faster).',
          'Soft targets give richer gradients than one-hot labels, so students learn from fewer examples.',
          'Sequence-level distillation works with any teacher you can call, including different tokenizers.',
        ],
        cons: [
          { con: 'Logit KD needs a shared vocabulary and white-box teacher access.', fix: 'Use sequence-level distillation for cross-family or API teachers, or a same-family teacher (e.g. Llama 70B → 8B).' },
          { con: 'Students inherit teacher mistakes and hallucinations.', fix: 'Filter teacher outputs with a judge, tests or ground truth before training, and evaluate the student against real labels, not teacher agreement.' },
          { con: 'Offline distillation suffers exposure bias: the student never sees its own errors.', fix: 'Add on-policy distillation (GKD-style) rounds where the teacher scores student-generated sequences.' },
          { con: 'Legal risk: provider terms may forbid training competing models on outputs.', fix: 'Check licences/terms before generating data; prefer open-weights teachers with permissive licences (Apache 2.0 / MIT).' },
        ],
      },
      keyPoints: [
        'Soft targets at temperature T carry "dark knowledge"; scale the KL by T².',
        'Logit KD needs same vocab; sequence KD just needs teacher outputs.',
        'Filter teacher outputs; distil correctness, not confident errors.',
        'On-policy distillation closes the exposure-bias gap.',
      ],
      exercise: {
        prompt: `Write \`build_distill_set(prompts, teacher_fn, judge_fn, n_samples=4)\` for sequence-level distillation: for each prompt, sample \`n_samples\` teacher answers, keep the **best one that the judge passes**, and return chat JSONL rows. Report the keep rate.

Acceptance: prompts where no sample passes are dropped; output rows have \`{"messages": [user, assistant]}\`; keep rate = kept / total prompts.`,
        starter: {
          language: 'python',
          code: `def build_distill_set(prompts, teacher_fn, judge_fn, n_samples=4):
    """teacher_fn(prompt) -> str (sampled, temperature > 0)
    judge_fn(prompt, answer) -> float score in [0, 1]; pass if >= 0.7"""
    rows = []
    # TODO: sample, score, keep best passing answer
    return rows, 0.0`,
        },
        hints: [
          'Collect (score, answer) pairs for each prompt and take max by score.',
          'Only append when the best score is at least 0.7.',
          'Keep rate = len(rows) / len(prompts); guard against an empty list.',
        ],
        solution: {
          language: 'python',
          code: `def build_distill_set(prompts, teacher_fn, judge_fn, n_samples=4, threshold=0.7):
    rows = []
    for p in prompts:
        scored = []
        for _ in range(n_samples):
            ans = teacher_fn(p)
            scored.append((judge_fn(p, ans), ans))
        best_score, best = max(scored, key=lambda x: x[0])
        if best_score >= threshold:
            rows.append({"messages": [
                {"role": "user", "content": p},
                {"role": "assistant", "content": best},
            ]})
    keep_rate = len(rows) / len(prompts) if prompts else 0.0
    return rows, keep_rate`,
        },
        explanation: 'Best-of-n sampling with a judge (rejection sampling) raises the quality of distillation targets above the teacher\'s average output, and dropping prompts with no passing sample avoids teaching confident errors. The keep rate tells you which prompt categories the teacher itself struggles with.',
      },
      quickCheck: {
        question: 'You want to distil a proprietary API model into a Mistral-family student. Which approach is feasible?',
        options: [
          'Logit-level KD on the API model\'s full-vocabulary logits',
          'Sequence-level distillation on filtered API outputs, after confirming the provider\'s terms allow it',
          'Copy the API model\'s weights into the student with LoRA',
          'Temperature-scaled KL on the student only, without the teacher',
        ],
        correct: 1,
        explanation: 'APIs rarely expose full logits and the tokenizers differ, so logit KD is not possible. Sequence-level distillation needs only generated text, subject to the provider\'s terms. Weights are not available, and KD without a teacher is meaningless.',
      },
      source: 'Hinton et al. 2015; Kim & Rush 2016; Agarwal et al. 2024 — GKD',
    },
  ],
  codeChallenges: [
    {
      id: 'alignment-distillation-cc-1',
      title: 'Fix a hand-rolled DPO loss',
      context: 'A research engineer wrote their own DPO training loop. Loss decreases, but win rate against the SFT model gets worse and responses become shorter and stranger.',
      task: 'Find the bugs in the log-prob computation and loss, and produce a correct, stable implementation.',
      starter: {
        language: 'python',
        code: `import torch

def seq_logprob(model, input_ids, attn):
    logits = model(input_ids, attention_mask=attn).logits
    logp = torch.log(torch.softmax(logits, -1))
    tok = logp.gather(-1, input_ids.unsqueeze(-1)).squeeze(-1)
    return tok.mean(-1)                         # average over whole sequence

def dpo_step(policy, ref, batch, beta=0.1):
    pw = seq_logprob(policy, batch["chosen_ids"], batch["chosen_attn"])
    pl = seq_logprob(policy, batch["rejected_ids"], batch["rejected_attn"])
    rw = seq_logprob(ref, batch["chosen_ids"], batch["chosen_attn"])
    rl = seq_logprob(ref, batch["rejected_ids"], batch["rejected_attn"])
    logits = beta * ((pl - rl) - (pw - rw))
    return -torch.log(torch.sigmoid(logits)).mean()`,
      },
      hints: [
        'Logits at position t predict token t+1: the gather must be shifted by one.',
        'Only response tokens (not prompt or padding) should be summed; DPO uses summed log-probs.',
        'Check the sign of the margin, run the reference under no_grad, and use logsigmoid / log_softmax for stability.',
      ],
      solution: {
        language: 'python',
        code: `import torch
import torch.nn.functional as F

def seq_logprob(model, input_ids, attn, response_mask):
    """Sum of log-probs of response tokens only.
    response_mask: 1 on response tokens, 0 on prompt and padding."""
    logits = model(input_ids, attention_mask=attn).logits[:, :-1]   # predict t+1
    targets = input_ids[:, 1:]
    logp = F.log_softmax(logits.float(), dim=-1)                     # stable
    tok = logp.gather(-1, targets.unsqueeze(-1)).squeeze(-1)
    mask = response_mask[:, 1:].float()
    return (tok * mask).sum(-1)

def dpo_step(policy, ref, batch, beta=0.1):
    pw = seq_logprob(policy, batch["chosen_ids"], batch["chosen_attn"], batch["chosen_resp_mask"])
    pl = seq_logprob(policy, batch["rejected_ids"], batch["rejected_attn"], batch["rejected_resp_mask"])
    with torch.no_grad():                                            # frozen reference
        rw = seq_logprob(ref, batch["chosen_ids"], batch["chosen_attn"], batch["chosen_resp_mask"])
        rl = seq_logprob(ref, batch["rejected_ids"], batch["rejected_attn"], batch["rejected_resp_mask"])
    margin = (pw - rw) - (pl - rl)                                   # chosen minus rejected
    loss = -F.logsigmoid(beta * margin).mean()
    metrics = {"acc": (margin > 0).float().mean().item(),
               "margin": (beta * margin).mean().item()}
    return loss, metrics`,
      },
      explanation: `Four bugs: (1) **sign flipped**: the original rewarded the *rejected* response, explaining worse win rates; (2) **no shift**: gathering the current token's probability from its own position leaks the answer; (3) **mean over all tokens**, including prompt and padding, dilutes the signal and biases towards short responses; DPO sums response-token log-probs; (4) the reference ran with gradients and \`log(softmax)\` / \`log(sigmoid)\` underflow in bf16. The fixed version masks to response tokens, uses stable log-space ops and logs accuracy/margin for monitoring.`,
      followUps: [
        { q: 'How can you avoid holding the reference model in GPU memory?', a: 'Precompute reference log-probs for the whole dataset once (TRL precompute_ref_log_probs=True), or with LoRA use the base model with adapters disabled as the reference.' },
        { q: 'Why might someone deliberately length-normalise the log-probs?', a: 'Summed log-probs favour shorter sequences and DPO can exploit length; SimPO/sigmoid_norm average per token to reduce verbosity bias, at the cost of departing from the exact DPO derivation.' },
      ],
    },
    {
      id: 'alignment-distillation-cc-2',
      title: 'Repair a broken knowledge-distillation loop',
      context: 'A team distils a 70B teacher into an 8B student of the same family. Training is 3× slower than expected, GPU memory explodes, and the student barely improves over plain SFT.',
      task: 'Fix the loss maths and the teacher handling so distillation is correct and efficient.',
      starter: {
        language: 'python',
        code: `def train_step(student, teacher, batch, opt, T=4.0):
    teacher.train()
    t_logits = teacher(batch["input_ids"]).logits
    s_logits = student(batch["input_ids"]).logits
    p_t = torch.softmax(t_logits / T, -1)
    p_s = torch.softmax(s_logits, -1)                      # student not softened
    loss = torch.nn.functional.kl_div(p_s, p_t)            # default reduction
    loss.backward()
    opt.step(); opt.zero_grad()
    return loss.item()`,
      },
      hints: [
        'The teacher should be in eval mode and run under torch.no_grad() (dropout off, no activation storage).',
        'F.kl_div expects log-probabilities as its first argument and target probabilities as the second.',
        'Soften both distributions with the same T, multiply by T², mask padding, and mix in hard-label CE.',
      ],
      solution: {
        language: 'python',
        code: `import torch
import torch.nn.functional as F

def train_step(student, teacher, batch, opt, T=2.0, alpha=0.5):
    teacher.eval()
    with torch.no_grad():                                   # no grads, no activations kept
        t_logits = teacher(batch["input_ids"], attention_mask=batch["attn"]).logits
    s_logits = student(batch["input_ids"], attention_mask=batch["attn"]).logits

    s, t = s_logits[:, :-1].float(), t_logits[:, :-1].float()
    labels = batch["labels"][:, 1:]
    mask = (labels != -100).float()

    log_p_s = F.log_softmax(s / T, -1)
    log_p_t = F.log_softmax(t / T, -1)
    kl = F.kl_div(log_p_s, log_p_t, log_target=True, reduction="none").sum(-1)
    soft = (kl * mask).sum() / mask.sum() * T * T
    hard = F.cross_entropy(s.reshape(-1, s.size(-1)), labels.reshape(-1), ignore_index=-100)
    loss = alpha * soft + (1 - alpha) * hard

    loss.backward()
    torch.nn.utils.clip_grad_norm_(student.parameters(), 1.0)
    opt.step(); opt.zero_grad(set_to_none=True)
    return {"loss": loss.item(), "soft": soft.item(), "hard": hard.item()}`,
      },
      explanation: `The teacher ran in train mode with gradients (dropout noise, stored activations → slow and memory-hungry). \`kl_div\` was given probabilities instead of log-probabilities, so the loss was mathematically wrong, and the student was not softened by T, so the two distributions were not comparable. Default \`batchmean\`-style reductions also included padding and lacked the T² factor. The fix runs the teacher under no_grad in eval mode, uses log-space KL with matching temperature, masks padding, applies T² and blends with hard-label CE.`,
      followUps: [
        { q: 'Teacher forward passes still dominate cost. How do you reduce them?', a: 'Precompute and store top-k teacher logits (e.g. top 20 tokens plus a tail bucket) per position once, then train the student from disk; this trades storage for repeated 70B forward passes.' },
        { q: 'When would you switch to sequence-level distillation instead?', a: 'When the teacher is from a different family or behind an API, or when you want the student to learn whole-answer behaviour (reasoning traces) cheaply via SFT on filtered teacher generations.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'alignment-distillation-iq-1',
      difficulty: 'hard',
      question: 'Explain to a senior engineer why DPO does not need a reward model, and when you would still choose PPO/GRPO-style online RL.',
      whatInterviewerLooksFor: [
        'States the KL-constrained RLHF objective',
        'Explains the closed-form optimal policy and implicit reward',
        'Contrasts offline vs on-policy learning',
        'Names verifiable-reward use cases for online RL',
      ],
      modelAnswer: `**Shared objective.** RLHF maximises \`E[r(x,y)] − β·KL(π ‖ π_ref)\`. That objective has a closed-form optimum: \`π*(y|x) ∝ π_ref(y|x) · exp(r(x,y)/β)\`. Rearranging gives \`r(x,y) = β·log(π*(y|x)/π_ref(y|x)) + β·log Z(x)\`.

**DPO's trick.** Plug that expression into the Bradley–Terry preference model. The partition function Z(x) is the same for both responses to a prompt, so it cancels in \`r(y_w) − r(y_l)\`. The result is a classification loss on log-ratios of the policy itself: the policy *is* the reward model (implicit reward β·log π/π_ref). No separate RM, no sampling, no critic.

**What DPO gives up.** It is **offline**: it learns from fixed pairs, not from its own current outputs, so it cannot explore or correct errors it would actually make. It is also sensitive to data quality and can show likelihood displacement and verbosity bias.

**When online RL wins:**
- A **verifiable reward** exists (unit tests, math answer checking, schema validity, tool success): GRPO/PPO can sample, check, and improve far beyond any fixed dataset; this is how reasoning models are trained.
- The target behaviour requires exploration (long multi-step reasoning, agentic tool use).
- You have a strong RM and budget for rollouts.

**Practical sequencing:** SFT → DPO (cheap alignment on preferences) → GRPO on verifiable tasks, or iterative DPO with fresh on-policy samples as a middle ground.`,
      followUps: [
        { q: 'What does β control in both methods?', a: 'β is the strength of the KL constraint to the reference: higher β keeps the policy close to π_ref (safer, smaller gains), lower β allows larger deviations (more gain, more risk of hacking or degeneration).' },
        { q: 'Is iterative DPO "online"?', a: 'Partly: each round samples from the current policy and labels new pairs, so it becomes on-policy at round granularity, recovering much of online RL\'s benefit with offline-style training.' },
      ],
      pitfalls: [
        'Claiming DPO has no KL regularisation (it is implicit via the reference).',
        'Saying DPO is always better than PPO.',
        'Forgetting that DPO still needs an SFT starting point.',
      ],
    },
    {
      id: 'alignment-distillation-iq-2',
      difficulty: 'hard',
      question: 'After DPO, your assistant\'s answers got 40% longer and an LLM judge prefers them, but users complain about verbosity. Diagnose and fix.',
      whatInterviewerLooksFor: [
        'Recognises length bias in data and judge',
        'Proposes length-controlled evaluation',
        'Knows loss-level mitigations (length normalisation, LD-DPO)',
        'Fixes data construction',
      ],
      modelAnswer: `**Diagnosis.** Two coupled biases:
1. **Data:** in many preference sets the chosen response is longer on average (annotators and AI labellers reward thoroughness). DPO sums log-probs, so it can increase the margin by shifting mass to longer, more elaborate answers.
2. **Evaluation:** LLM judges also favour length, so the offline metric confirms the drift. Users, who read on phones, do not.

**Measure it:** compute mean length of chosen vs rejected in the training pairs; report length-controlled win rate (e.g. AlpacaEval-LC style regression on length) and add a "concise" rubric to the judge; compare with real user feedback (thumbs, edits, abandonment).

**Fixes, in order:**
- **Rebalance data:** include pairs where the shorter answer wins when it is complete; drop pairs whose only difference is length; for AI-labelled pairs, instruct the judge to penalise unnecessary length.
- **Loss:** use length-normalised variants (\`sigmoid_norm\` / SimPO) or LD-DPO weighting (\`ld_alpha\`) so extra tokens cannot inflate the margin.
- **Regularise:** higher β or fewer steps; optionally add an SFT term on concise chosen responses.
- **Product guardrail:** system prompt and max_tokens budget per surface.

**Validate** with a small user A/B before rolling out; target the same helpfulness at ≤ 10% length increase.`,
      followUps: [
        { q: 'How would you build a length-controlled win rate?', a: 'Fit a logistic regression of judge preference on (model identity, length difference) and report the predicted win rate at zero length difference, or match pairs by length bucket before judging.' },
        { q: 'Could the reference model cause this?', a: 'Not directly; the reference anchors behaviour, but if the SFT model is already verbose, DPO amplifies whatever the pairs reward. Fixing the SFT data for concision also helps.' },
      ],
      pitfalls: [
        'Trusting a single LLM-judge metric.',
        'Truncating outputs instead of fixing training signal.',
        'Ignoring that the data, not the algorithm, encodes the bias.',
      ],
    },
    {
      id: 'alignment-distillation-iq-3',
      difficulty: 'expert',
      question: 'Design a pipeline to distil a 70B model\'s behaviour on your support workload into an 8B model that can run on one L4 GPU, and decide between logit-level and sequence-level distillation.',
      context: 'Teacher: Llama-family 70B self-hosted; student: Llama-family 8B; 2M historical conversations available.',
      whatInterviewerLooksFor: [
        'Prompt selection from real traffic with dedupe and PII handling',
        'Filtering teacher outputs for correctness',
        'Choosing KD type based on vocab/teacher access',
        'Quantised serving and evaluation gates',
      ],
      modelAnswer: `**1. Prompts.** Sample 100–200k prompts from the 2M conversations, stratified by intent; dedupe by embedding similarity; scrub PII; hold out 2k for eval (split by intent cluster to avoid leakage).

**2. Teacher outputs.** Run the 70B with vLLM at temperature 0.7, 4 samples per prompt; score with a rubric judge (and policy-compliance checks); keep the best passing sample (rejection sampling). Expect a 75–90% keep rate; inspect rejected categories.

**3. Distillation type.** Teacher and student share the Llama tokenizer and we own the teacher, so **logit-level KD is possible** and adds ~1 point over pure sequence-level in practice. Plan:
- Stage A: sequence-level SFT on filtered outputs (cheap, gets ~90% of the gain).
- Stage B: logit KD (T = 2, α = 0.5) using stored top-k teacher logits (k = 20) to avoid re-running the 70B each epoch.
- Optional Stage C: on-policy distillation on hard intents.

**4. Serving on L4 (24 GB).** 8B in AWQ/GPTQ 4-bit ≈ 5 GB of weights, leaving ~15 GB for KV cache; re-run the eval after quantisation.

**5. Gates.** Student ≥ 97% of teacher on the task eval, no regression on safety suite, p95 latency target met; shadow-deploy against the teacher for a week and compare escalation rates.`,
      followUps: [
        { q: 'Storage for top-20 logits on 150M tokens?', a: 'Per position 20 token ids (4 B) + 20 fp16 logits (2 B) = 120 B, so 150M × 120 B ≈ 18 GB, very manageable compared with re-running a 70B model per epoch.' },
        { q: 'The student matches the teacher on eval but users rate it lower. Why?', a: 'Likely distribution shift: eval prompts are cleaner than live traffic or the student fails on long multi-turn contexts; add on-policy distillation on real failures and expand the eval with production samples.' },
      ],
      pitfalls: [
        'Training on unfiltered teacher outputs.',
        'Evaluating only agreement with the teacher.',
        'Forgetting to re-evaluate after quantising the student.',
      ],
    },
    {
      id: 'alignment-distillation-iq-4',
      difficulty: 'hard',
      question: 'You only have thumbs-up/thumbs-down feedback on single responses, not pairs. How do you use it for preference tuning?',
      whatInterviewerLooksFor: [
        'Knows KTO handles unpaired binary feedback',
        'Considers constructing pairs from same-prompt responses',
        'Handles noise and class imbalance',
        'Proposes evaluation beyond feedback rate',
      ],
      modelAnswer: `**Option 1 — KTO (Kahneman–Tversky Optimization).** Designed for unpaired, binary labels: each example is (prompt, response, desirable?). It uses the same implicit reward β·log(π/π_ref) but compares it to a reference point (a KL estimate), with separate weights for desirable and undesirable examples to handle imbalance (thumbs-down is usually rarer). TRL ships a KTOTrainer.

**Option 2 — build pairs.** Where the same or near-identical prompt has both a liked and a disliked response (regenerations, A/B tests), form (chosen, rejected) pairs and use DPO. Coverage is usually small, so combine with KTO.

**Option 3 — train a reward model** on the binary labels (classification) and use it for best-of-n sampling or online RL.

**Data hygiene:** thumbs are noisy and biased (people thumb-down slow answers or policy refusals that were correct). Filter: drop feedback on responses later edited by policy, de-weight users with extreme rates, and have humans audit a sample of thumbs-down. Balance classes (KTO's λ_D/λ_U weights or resampling).

**Evaluation:** not just predicted thumbs-up rate; use a held-out judged set, refusal-correctness tests (don't learn to comply with things users wanted but policy forbids), and an online A/B on satisfaction.`,
      followUps: [
        { q: 'Why might naive training on thumbs-up data make safety worse?', a: 'Users often thumb-down appropriate refusals; optimising for their approval teaches the model to comply with disallowed requests, so safety-relevant feedback must be filtered or overridden by policy labels.' },
        { q: 'Could you just SFT on thumbs-up responses?', a: 'Yes as a baseline (rejection-sampling SFT), but it ignores the negative signal; KTO or DPO also pushes probability away from bad responses, which usually gives larger gains.' },
      ],
      pitfalls: [
        'Assuming DPO works directly on unpaired data.',
        'Treating raw user feedback as clean labels.',
        'Ignoring class imbalance.',
      ],
    },
    {
      id: 'alignment-distillation-iq-5',
      difficulty: 'expert',
      question: 'Your GRPO run for a code-generation model shows reward rising quickly to 0.9 pass rate on training prompts, but pass@1 on the held-out benchmark is flat. What could be happening?',
      whatInterviewerLooksFor: [
        'Reward hacking of the verifier (tests too weak)',
        'Prompt difficulty and group-advantage dynamics',
        'Contamination / overfitting to training prompts',
        'Monitoring KL, entropy and length',
      ],
      modelAnswer: `**1. Weak verifier (reward hacking).** If unit tests are thin, the model learns to special-case visible test inputs, print expected outputs, or catch all exceptions. Check: run the generated solutions against hidden, stronger tests; inspect high-reward samples for hard-coded values. Fix: richer hidden tests, property-based tests, penalties for suspicious patterns, sandbox limits.

**2. Prompt mix too easy.** In GRPO, groups where all samples pass or all fail have zero advantage. If training prompts are mostly easy, reward hits 0.9 but the model learns little transferable skill. Fix: filter prompts to a 20–80% pass-rate band for the current policy and refresh the pool as the model improves (curriculum).

**3. Overfitting/memorisation.** A few thousand prompts over many epochs can be memorised. Fix: more unique prompts, dedupe against the benchmark (also check the benchmark isn't contaminated in SFT data), early stop on held-out pass@1.

**4. Collapse signals.** Entropy dropping sharply and response length shrinking or exploding indicate mode collapse or length hacking. Track KL to reference, entropy, length; adjust β/clip range or add entropy bonus.

**Plan:** add a held-out eval every N steps, audit 50 top-reward samples, harden tests, re-balance difficulty, then resume from the last checkpoint where held-out pass@1 was best.`,
      followUps: [
        { q: 'Why is GRPO\'s group size important?', a: 'Larger groups (16–64) give better baseline estimates and more prompts with mixed outcomes, hence more non-zero advantages, at the cost of more rollouts per step.' },
        { q: 'How do you detect hard-coded test outputs automatically?', a: 'Run solutions on randomised hidden inputs, diff behaviour against a reference implementation, and flag code containing literal expected outputs from the visible tests.' },
      ],
      pitfalls: [
        'Trusting training reward as progress.',
        'Ignoring zero-advantage groups.',
        'Not auditing high-reward samples manually.',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'alignment-distillation-est-1',
      question: 'Compare the GPU memory for PPO-based RLHF vs DPO on a 7B model with full fine-tuning in bf16 mixed precision.',
      assumptions: [
        '7B params; trained models need 16 bytes/param (weights + grads + fp32 master + Adam m, v)',
        'Frozen models need 2 bytes/param (bf16 inference)',
        'PPO: policy and value model trained (value model same size), reference and reward model frozen',
        'DPO: policy trained, reference frozen; activations ~10 GB per trained model, ignored for frozen',
      ],
      steps: [
        { label: 'PPO trained models', calc: '2 × 7e9 × 16 B = 224 GB' },
        { label: 'PPO frozen models', calc: '2 × 7e9 × 2 B = 28 GB' },
        { label: 'PPO total', calc: '224 + 28 + 2 × 10 (activations) ≈ 272 GB → 4 × 80 GB GPUs with sharding, plus a rollout engine' },
        { label: 'DPO total', calc: 'policy 7e9 × 16 = 112 GB + ref 14 GB + 10 GB ≈ 136 GB → 2 × 80 GB GPUs' },
        { label: 'DPO with LoRA + precomputed ref log-probs', calc: '7e9 × 2 = 14 GB + adapters ~0.5 GB + activations 10 GB ≈ 25 GB → one GPU' },
      ],
      answer: 'PPO ≈ 270 GB (4+ GPUs) vs DPO ≈ 136 GB full (2 GPUs) or ≈ 25 GB with LoRA and precomputed reference log-probs (1 GPU).',
      insight: 'Most of DPO\'s practical advantage is infrastructure: half the models, no critic and no rollout engine. Combined with LoRA and precomputed reference log-probs it fits on a single GPU, which is why teams try DPO first and reserve online RL for verifiable-reward problems.',
      followUps: [
        { q: 'How does GRPO change the PPO number?', a: 'It removes the value model (−112 GB of trained state) and often the reward model too when rewards are programmatic, so it lands near DPO memory plus a rollout engine (e.g. a vLLM instance) for sampling.' },
      ],
    },
    {
      id: 'alignment-distillation-est-2',
      question: 'Estimate the cost of building a sequence-level distillation dataset: 100k prompts, 4 teacher samples each, 600 input and 700 output tokens per sample, plus an LLM judge pass.',
      assumptions: [
        'Teacher via API at illustrative $3 / 1M input and $15 / 1M output tokens',
        'Judge (small model) at illustrative $0.25 / 1M input, $2 / 1M output; judge reads prompt + answer (1,300 tokens) and writes 50 tokens',
        'Prompt caching ignored',
        'Alternative: self-hosted 70B on 4 × H100 at $12/hour generating ~3,000 output tokens/s aggregate',
      ],
      steps: [
        { label: 'Teacher samples', calc: '100k × 4 = 400k samples' },
        { label: 'Teacher input cost', calc: '400k × 600 = 240M tokens × $3/M = $720' },
        { label: 'Teacher output cost', calc: '400k × 700 = 280M tokens × $15/M = $4,200' },
        { label: 'Judge cost', calc: '400k × 1,300 = 520M in × $0.25/M = $130; 400k × 50 = 20M out × $2/M = $40' },
        { label: 'API total', calc: '$720 + $4,200 + $170 ≈ $5,100' },
        { label: 'Self-hosted', calc: '280M output tokens / 3,000 tok/s ≈ 93,000 s ≈ 26 h × $12 ≈ $310 (+ prefill time, ~$400 total)' },
      ],
      answer: 'About $5k through a frontier API vs roughly $400 self-hosting an open-weights teacher, before the student training run (~$10–50).',
      insight: 'Output tokens dominate the bill, so best-of-4 sampling quadruples cost. Use n=2 for easy intents and n=4–8 only where the judge pass rate is low, and prefer a permissively licensed open-weights teacher when terms or cost matter.',
      followUps: [
        { q: 'How could you cut the API cost by ~half without losing quality?', a: 'Sample adaptively: start with one sample, only draw more when the judge fails it; with an ~70% first-pass rate this needs ~1.6 samples per prompt instead of 4, cutting output cost by ~60%.' },
      ],
    },
  ],
  test: [
    {
      id: 'alignment-distillation-mcq-01',
      difficulty: 'medium',
      question: 'In classic PPO-based RLHF, which models are in memory during policy optimisation? Select ALL that apply.',
      options: ['The policy being trained', 'A frozen reference copy of the SFT model', 'A frozen reward model', 'A teacher model producing soft labels'],
      correct: [0, 1, 2],
      explanation: 'PPO RLHF needs the policy (trained), the reference (frozen, for the KL penalty) and the reward model (frozen), plus a value model/critic. A teacher providing soft labels belongs to knowledge distillation, not RLHF.',
      followUps: [
        { q: 'Which of these does GRPO remove?', a: 'GRPO removes the value model by using the group mean reward as a baseline; with programmatic rewards the learned reward model can also disappear.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-02',
      difficulty: 'medium',
      question: 'A reward model gives r_chosen = 1.0 and r_rejected = 1.0 for a pair. What is its Bradley–Terry loss for that pair?',
      options: ['0', 'ln 2 ≈ 0.693', '1.0', '∞'],
      correct: [1],
      explanation: 'Loss = −log σ(r_c − r_r) = −log σ(0) = −log 0.5 = ln 2. The loss is 0 only when the margin goes to +∞, and it is not equal to the reward values themselves.',
      followUps: [
        { q: 'What margin gives a loss of about 0.13?', a: 'σ(m) = e^(−0.13) ≈ 0.878, so m ≈ ln(0.878/0.122) ≈ 2.0: the RM scores the chosen response two units higher.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-03',
      difficulty: 'hard',
      question: 'What does this DPO computation return for the given values?',
      code: {
        language: 'python',
        code: `beta = 0.2
pol_w, pol_l = -20.0, -22.0
ref_w, ref_l = -21.0, -21.0
margin = (pol_w - ref_w) - (pol_l - ref_l)
loss = -math.log(1 / (1 + math.exp(-beta * margin)))`,
      },
      options: ['≈ 0.513', '≈ 0.693', '≈ 0.371', '≈ 0.127'],
      correct: [0],
      explanation: 'Chosen ratio = +1, rejected ratio = −1, margin = 2, β·margin = 0.4, σ(0.4) = 0.599, −ln 0.599 ≈ 0.513. 0.693 is the loss at zero margin; 0.371 would require β·margin ≈ 0.8 (e.g. forgetting β is 0.2 and using 0.4); 0.127 corresponds to a margin of ~2 without β scaling.',
      followUps: [
        { q: 'What are the implicit rewards logged for this pair?', a: 'Chosen reward = β × (+1) = 0.2 and rejected reward = β × (−1) = −0.2, so the reward margin is 0.4 and the pair counts as correctly ordered.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-04',
      difficulty: 'hard',
      question: 'Your PPO run shows KL to the reference rising from 2 to 45 nats per response while reward climbs. Samples contain repeated phrases the RM likes. What is the best interpretation?',
      options: [
        'Healthy learning: large KL means large improvements',
        'Reward hacking; the KL coefficient is too weak or adaptive KL target too high, so the policy drifted into RM blind spots',
        'The reference model is broken and should be replaced by the current policy',
        'The value model is overfitting, which only affects variance',
      ],
      correct: [1],
      explanation: 'A runaway KL with degenerate but high-reward text is the textbook signature of reward hacking. Strengthen the KL penalty or use an adaptive KL controller with a sensible target and refresh the RM. Replacing the reference removes the anchor, and value-model overfitting would not produce this text pattern.',
      followUps: [
        { q: 'What is an adaptive KL controller?', a: 'It adjusts β during training to keep measured KL near a target value: if KL exceeds the target, β increases; if below, β decreases, giving more stable runs than a fixed β.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-05',
      difficulty: 'hard',
      question: 'Which preference-optimisation methods do NOT need a separate frozen reference model? Select ALL that apply.',
      options: ['ORPO', 'SimPO', 'Standard sigmoid DPO', 'IPO'],
      correct: [0, 1],
      explanation: 'ORPO adds an odds-ratio term to the SFT loss, and SimPO uses a length-normalised average log-prob with a target margin, so neither needs π_ref. Standard DPO and IPO both rely on log-ratios against a reference policy (which may be implemented as the base with adapters disabled).',
      followUps: [
        { q: 'What is the practical benefit of reference-free methods?', a: 'Lower memory and compute (no reference forward pass) and simpler pipelines, at the cost of losing the explicit KL-style anchor, so they need careful LR and margin tuning.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-06',
      difficulty: 'hard',
      question: 'Why is the soft-target KL term multiplied by T² in Hinton-style distillation?',
      options: [
        'To convert nats to bits',
        'Because gradients of the softened KL scale as 1/T², so multiplying by T² keeps their magnitude comparable to the hard-label loss as T changes',
        'To make the student distribution sharper than the teacher',
        'To ensure the loss is always positive',
      ],
      correct: [1],
      explanation: 'Softening logits by T shrinks the gradient of the soft loss by roughly 1/T², so without compensation, raising T would silently down-weight distillation relative to cross-entropy. The factor has nothing to do with units, sharpening or sign (KL is already non-negative).',
      followUps: [
        { q: 'What happens with T very large?', a: 'Both distributions approach uniform, and matching them approximates matching logits up to a constant (the logit-matching limit), losing the ranking emphasis on top tokens.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-07',
      difficulty: 'hard',
      question: 'You want to distil Qwen-family 72B into a Llama-family 8B student. Which statements are true? Select ALL that apply.',
      options: [
        'Token-level logit KD is not directly possible because vocabularies differ',
        'Sequence-level distillation on teacher generations works regardless of tokenizer',
        'You must first convert the student to Qwen\'s tokenizer or logits cannot be compared token by token',
        'The teacher must be served with the student\'s chat template',
      ],
      correct: [0, 1],
      explanation: 'Different vocabularies make per-token KL ill-defined, while sequence-level KD only needs text outputs. Converting tokenizers is unnecessary for sequence-level KD (cross-tokenizer logit methods exist but are specialised), and the teacher should use its own template; the student is trained on the resulting text with the student template.',
      followUps: [
        { q: 'What is the main licence check here?', a: 'Confirm the teacher\'s licence permits using its outputs to train another model (e.g. Apache 2.0 Qwen variants do; some flagship or API models restrict it) and that the student\'s licence allows your deployment.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-08',
      difficulty: 'hard',
      question: 'What is wrong with this DPO dataset row for TRL?',
      code: {
        language: 'json',
        code: `{"prompt": [{"role": "user", "content": "Explain OAuth refresh tokens"}],
 "chosen":  [{"role": "user", "content": "Explain OAuth refresh tokens"},
             {"role": "assistant", "content": "A refresh token lets..."}],
 "rejected":[{"role": "assistant", "content": "OAuth is a protocol."}]}`,
      },
      options: [
        'With an explicit prompt, chosen and rejected must contain only the assistant completion; here chosen repeats the user turn, so the pair compares different contexts',
        'The rejected answer is too short to be valid',
        'Conversational DPO rows cannot have a prompt field',
        'Nothing; TRL deduplicates repeated user turns automatically',
      ],
      correct: [0],
      explanation: 'In explicit-prompt format, prompt holds the conversation so far and chosen/rejected hold only the completions. Repeating the user turn inside chosen makes the chosen sequence differ in more than the answer, corrupting log-prob comparisons. Short rejected answers are valid, conversational rows support prompt fields, and TRL does not dedupe turns for you.',
      followUps: [
        { q: 'What is the implicit-prompt format?', a: 'Rows with only chosen and rejected, each containing the full conversation; TRL extracts the shared prefix as the prompt. Explicit prompts are recommended to avoid ambiguity.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-09',
      difficulty: 'medium',
      question: 'Which signals in DPO training logs suggest the run is healthy? Select ALL that apply.',
      options: [
        'rewards/accuracies rises from ~0.5 towards 0.7–0.9 on the eval split',
        'rewards/margins increases steadily',
        'logps/chosen falls sharply while logps/rejected falls even faster',
        'Eval loss starts near 0.693 and decreases',
      ],
      correct: [0, 1, 3],
      explanation: 'Rising accuracy and margins with loss falling from ln 2 indicate learning. A sharp drop in chosen log-probs (even if rejected drops faster) indicates likelihood displacement and often degraded fluency, so it is a warning sign, not health.',
      followUps: [
        { q: 'Eval accuracy hits 1.0 after 200 steps on 2k pairs. Good news?', a: 'Probably overfitting or easy/leaky pairs; check eval pairs aren\'t near-duplicates of train, inspect generations with a judge, and consider fewer steps or higher β.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-10',
      difficulty: 'expert',
      question: 'Which bug makes this KD loss silently wrong?',
      code: {
        language: 'python',
        code: `log_p_s = F.log_softmax(student_logits / T, dim=-1)
p_t = F.softmax(teacher_logits / T, dim=-1)
loss = F.kl_div(p_t.log(), log_p_s, reduction="batchmean", log_target=True) * T * T`,
      },
      options: [
        'The arguments are swapped: kl_div(input, target) computes KL(target ‖ input), so this computes KL(p_s ‖ p_t), reverse KL, not the intended KL(p_t ‖ p_s)',
        'log_target=True is invalid with batchmean',
        'T * T should be T',
        'softmax and log_softmax cannot be mixed in one loss',
      ],
      correct: [0],
      explanation: 'PyTorch\'s kl_div(input, target) expects input = student log-probs and computes Σ target·(log target − input). Passing the teacher as input and the student as target yields KL(student ‖ teacher), which is mode-seeking and not Hinton KD; p_t.log() can also produce -inf for zero probabilities. log_target with batchmean is valid and T² is correct.',
      followUps: [
        { q: 'Is reverse KL ever used deliberately?', a: 'Yes: on-policy distillation work (e.g. MiniLLM, GKD variants) uses reverse or generalised JSD divergences because mode-seeking behaviour suits generative students; but it should be a deliberate choice.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-11',
      difficulty: 'expert',
      question: 'In GRPO with group size 8, a batch has 64 prompts. 40 prompts have all 8 samples correct, 10 have all 8 wrong, 14 are mixed. Roughly what fraction of samples produce a non-zero policy gradient from the advantage term?',
      options: ['About 22% (14 of 64 prompts)', '100%, every sample has an advantage', 'About 63% (40 of 64 prompts)', 'About 16% (10 of 64 prompts)'],
      correct: [0],
      explanation: 'Group-normalised advantages are zero whenever all samples in a group share the same reward, so only the 14 mixed prompts (14/64 ≈ 22%) contribute. This is why GRPO pipelines filter prompts to a mid-difficulty band; the all-correct and all-wrong groups waste rollouts.',
      followUps: [
        { q: 'How would you raise that fraction?', a: 'Dynamically filter or resample prompts whose recent pass rate is between ~10% and ~90%, and increase group size for hard prompts so at least one success is likely.' },
      ],
    },
    {
      id: 'alignment-distillation-mcq-12',
      difficulty: 'expert',
      question: 'Which statements about on-policy distillation (GKD-style) versus offline sequence-level distillation are correct? Select ALL that apply.',
      options: [
        'On-policy distillation trains on sequences generated by the student, scored token-by-token by the teacher',
        'It reduces exposure bias because the student learns to recover from its own mistakes',
        'It is cheaper than offline distillation because the teacher is called fewer times',
        'It requires the teacher to provide token-level distributions for the student\'s sequences',
      ],
      correct: [0, 1, 3],
      explanation: 'GKD samples from the student and uses teacher token distributions on those samples, which addresses the train/inference mismatch. It is more expensive, not cheaper: the teacher must score fresh student generations throughout training instead of generating a dataset once.',
      followUps: [
        { q: 'When is on-policy distillation worth its cost?', a: 'When an offline-distilled student plateaus below the teacher on long generations (reasoning, multi-turn), where compounding errors from exposure bias matter most.' },
      ],
    },
  ],
};

export default topic;
