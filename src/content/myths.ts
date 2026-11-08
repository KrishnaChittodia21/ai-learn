// Myths (C4): common GenAI misconceptions, adapted from ai-engineering-from-scratch/glossary/myths.md
// (MIT, © 2026 Rohit Ghumare). Fact-checked and softened: no model-vs-model benchmark claims, no claims about
// what models "really" understand; the last three are new and feed the tier-3 Shorts.

export interface Myth {
  id: string;
  myth: string;
  /** markdown */
  reality: string;
  whyItMatters: string;
  /** topic id in this app */
  learn?: string;
}

export const MYTHS: Myth[] = [
  {
    id: 'fluent-means-correct',
    myth: 'If the answer sounds fluent and confident, the model must understand and be right',
    reality:
      'LLMs are trained to predict the next token. Whether that adds up to "understanding" is an open research question, and studies find some internal structure, but fluency and confidence are not evidence of correctness: a model can explain a wrong answer as smoothly as a right one.',
    whyItMatters: 'Design for checkable output: grounding, citations, tests and evals, not trust in the tone.',
    learn: 'genai-fundamentals',
  },
  {
    id: 'more-parameters-smarter',
    myth: 'More parameters always means a better model',
    reality:
      'Size is one factor among several. The Chinchilla study (Hoffmann et al., 2022) found many large models were under-trained for their compute budget, and smaller models trained on more and better data can match larger ones on some tasks. Data quality, training recipe and fine-tuning all matter.',
    whyItMatters: 'Do not default to the biggest model: evaluate a few sizes on your own task and pick on quality, cost and latency.',
    learn: 'model-serving-routing',
  },
  {
    id: 'black-box',
    myth: 'Neural networks are complete black boxes',
    reality:
      'They are not transparent, but not fully opaque either. Probing, attribution and mechanistic interpretability (for example induction heads) explain parts of what models do. Attention maps are a weak explanation on their own: where a model attends is not proof of why it answered.',
    whyItMatters: 'In a GenAI app you mostly debug the system around the model: traces, retrieved context, prompts and evals.',
    learn: 'observability',
  },
  {
    id: 'gpt-meaning',
    myth: 'GPT stands for "General Purpose Technology"',
    reality:
      'GPT stands for **Generative Pre-trained Transformer**: it generates text, it is pre-trained on a large corpus before being adapted, and it uses the transformer architecture from "Attention Is All You Need" (2017).',
    whyItMatters: 'The name is the recipe: pre-train on next-token prediction, then adapt with fine-tuning and preference training.',
    learn: 'genai-fundamentals',
  },
  {
    id: 'temperature-creativity',
    myth: 'Temperature makes the model more creative or smarter',
    reality:
      'Temperature rescales the logits before sampling. Higher values flatten the distribution so less likely tokens get picked more often; lower values sharpen it. It changes randomness, not knowledge. Temperature 0 is usually greedy decoding, but even then outputs are not always perfectly repeatable across calls.',
    whyItMatters: 'Use it as a randomness dial: low for extraction and classification, higher when you want variety, and never as a fix for wrong facts.',
    learn: 'genai-fundamentals',
  },
  {
    id: 'fine-tuning-adds-knowledge',
    myth: 'Fine-tuning is the way to teach a model your facts',
    reality:
      'Fine-tuning is most reliable for changing behaviour: format, style, tone and task patterns. It can add some facts, but unreliably, it is hard to update when they change, and the model may still mix them up. Knowledge that changes or must be cited is usually better served by retrieval (RAG).',
    whyItMatters: 'Internal docs that change weekly: use RAG. A strict output format or house style: consider fine-tuning.',
    learn: 'fine-tuning',
  },
  {
    id: 'bigger-context-better',
    myth: 'A bigger context window means you can paste everything in',
    reality:
      'Fitting text in the window does not mean the model uses all of it equally well. Studies of "lost in the middle" found accuracy can drop when the key evidence sits in the middle of a long prompt. Long prompts also cost more and are slower.',
    whyItMatters: 'Be selective: retrieve and rank what matters, and test answers with the evidence in different positions.',
    learn: 'context-engineering',
  },
  {
    id: 'agents-autonomous',
    myth: 'AI agents are autonomous',
    reality:
      'An agent is a loop your code runs: the model picks the next action, a tool runs it, the result goes back in. It pursues the goal you give it with the tools, permissions and stop conditions the harness allows. Its "autonomy" is the authority you delegate.',
    whyItMatters: 'When you build an agent you are building the loop, the tools and the guardrails; the model is one component inside them.',
    learn: 'agent-fundamentals',
  },
  {
    id: 'transformers-read-in-order',
    myth: 'Transformers read text in order, word by word, like a person',
    reality:
      'Self-attention compares all positions at once and on its own has no sense of order. Order comes from positional information (sinusoidal, learned, RoPE, ALiBi) and, in decoder models, the causal mask. Generation is word by word (token by token), but reading the prompt is not.',
    whyItMatters: 'It explains why long prompts are processed in one parallel prefill step and why positional schemes limit context length.',
    learn: 'transformer-internals',
  },
  {
    id: 'pretraining-reading-internet',
    myth: 'Pre-training is just reading the internet',
    reality:
      'Pre-training is next-token prediction on a huge corpus. From that one objective a model picks up grammar, facts, code patterns and some reasoning patterns, but also errors and biases in the data. Filtering, deduplication and data mixing are a large part of the work.',
    whyItMatters: 'Model behaviour reflects its data; expect gaps and biases and evaluate on your own domain.',
    learn: 'genai-fundamentals',
  },
  {
    id: 'rlhf-human-values',
    myth: 'RLHF aligns AI with human values',
    reality:
      'RLHF aligns a model with the preferences of the people who rated its outputs, under the guidelines they were given. Raters disagree, have biases and cannot cover every situation. It makes models more helpful and less harmful in the ways the raters judged, not aligned with a universal set of values.',
    whyItMatters: 'RLHF is one training technique, not a solved alignment problem: you still need evals, guardrails and red teaming.',
    learn: 'alignment-distillation',
  },
  {
    id: 'embeddings-capture-meaning',
    myth: 'Embeddings capture meaning',
    reality:
      'Embeddings place texts so that ones used in similar contexts, or paired as similar in training, end up close together. That correlates with meaning well enough for search and clustering, but "similar" depends on the training objective: a question and its negation can sit close together. Famous analogies like *king − man + woman ≈ queen* work less cleanly than often shown.',
    whyItMatters: 'Test retrieval on your own queries and combine embeddings with keyword search, reranking and filters.',
    learn: 'embeddings',
  },
  {
    id: 'zero-shot-no-training',
    myth: 'Zero-shot means the model needed no training',
    reality:
      'Zero-shot means no task examples **in the prompt**. The model was still trained on a very large corpus and generalises from it. Few-shot means a handful of examples in the prompt; neither changes the weights.',
    whyItMatters: 'If zero-shot output is off, add a few well-chosen examples before reaching for fine-tuning.',
    learn: 'prompt-fundamentals',
  },
  {
    id: 'models-learn-like-humans',
    myth: 'AI models learn like humans',
    reality:
      'The analogy is loose. Models learn from far more examples than a person needs, and a deployed LLM\'s weights do not change while you chat with it; it adapts only through what is in its context. Backpropagation is not known to be how brains learn.',
    whyItMatters: 'Do not expect a model to remember last week\'s correction unless your system stores it and puts it back in context.',
    learn: 'agent-memory-tools',
  },
  {
    id: 'scaling-always-better',
    myth: 'Scaling laws mean bigger is always better',
    reality:
      'Scaling laws describe smooth, diminishing returns: loss falls predictably as compute, data and parameters grow together, not in proportion to size. Many practical gains come from data quality, training recipes, retrieval and better prompts.',
    whyItMatters: 'A smaller model with good retrieval and evals often meets the bar at a fraction of the cost.',
    learn: 'model-serving-routing',
  },
  {
    id: 'open-weights-open-source',
    myth: 'Open weights is the same as open source',
    reality:
      'Most "open" models are **open weights**: you get the model files and a licence, often with use restrictions, but not the training data or full training code. Some releases, such as AI2\'s OLMo, also publish data, code and checkpoints.',
    whyItMatters: 'Open weights let you run and fine-tune a model; read the licence, and do not expect to reproduce or audit its training.',
    learn: 'open-source-local-llms',
  },
  {
    id: 'prompting-not-engineering',
    myth: 'Prompt engineering is not real engineering',
    reality:
      'Done well, it is interface design between intent and model behaviour: clear instructions, examples, output contracts, versioning and, above all, evals that show whether a change helped. It is closer to API design than to "talking nicely to the AI".',
    whyItMatters: 'Treat prompts like code: version them, test them against a golden set, and review changes.',
    learn: 'prompt-engineering',
  },
  {
    id: 'need-massive-compute',
    myth: 'You need massive compute to build useful AI',
    reality:
      'Pre-training a frontier model takes massive compute. Using one does not: many applications need only prompting, retrieval and an API, and LoRA or QLoRA can adapt an open model on a single GPU.',
    whyItMatters: 'Start with prompting and RAG; fine-tune only when evals show you need it.',
    learn: 'fine-tuning',
  },
  {
    id: 'first-answer-best',
    myth: "The model's first answer is the best it can do",
    reality:
      'On multi-step problems, spending more compute often helps: sample several reasoning paths and take the majority answer (**self-consistency**), run the maths as code (PAL), or search with an evaluator (tree of thoughts). It needs a checker, though: asking "are you sure?" with no new information can flip right answers to wrong.',
    whyItMatters: 'For short, comparable answers, a vote over a few samples is a cheap reliability boost; log the split and abstain on ties.',
    learn: 'prompt-reasoning',
  },
  {
    id: 'rag-stops-hallucinations',
    myth: 'RAG stops hallucinations',
    reality:
      'Retrieval reduces them by giving the model evidence, but it does not eliminate them. Retrieval can fetch the wrong passage, and the model can still ignore, misread or embellish what it was given. A model can also cite a source that does not support the claim.',
    whyItMatters: 'Check each claim against its cited passage, and measure groundedness in your evals.',
    learn: 'groundedness-hallucinations',
  },
  {
    id: 'system-prompt-stops-injection',
    myth: 'A strong system prompt stops prompt injection',
    reality:
      'Models read instructions and data through the same channel, so text in an email, web page or tool result can still steer them. Instructions like "ignore commands in documents" and input filters help as layers, but none is a security boundary.',
    whyItMatters: 'Assume the model will sometimes be fooled: least-privilege tools, confirmation before consequential actions, output escaping and quotas limit the damage.',
    learn: 'ai-security-injection',
  },
];
