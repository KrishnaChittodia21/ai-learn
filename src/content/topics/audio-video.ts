import type { Topic } from '../../types';

const topic: Topic = {
  id: 'audio-video',
  phase: 'multimodal',
  order: 2,
  title: 'Audio, Speech and Video',
  subtitle: 'Turn sound into text, text into sound, and long videos into something an LLM can reason over',
  estimatedMinutes: 74,
  sources: [
    'OpenAI docs — Speech to text (whisper-1, gpt-4o-transcribe, gpt-4o-transcribe-diarize, chunking_strategy)',
    'OpenAI docs — Text to speech (gpt-4o-mini-tts, voices, streaming response formats)',
    'OpenAI docs — Realtime API (server VAD, speech-to-speech)',
    'Radford et al. 2022 — Robust Speech Recognition via Large-Scale Weak Supervision (Whisper)',
    'Silero VAD — github.com/snakers4/silero-vad',
    'pyannote.audio — speaker diarization pipeline',
    'Google Gemini docs — Video understanding (frame sampling, tokens per frame)',
    'NIST — Word Error Rate scoring (sclite)',
    'Pipecat docs (docs.pipecat.ai) — pipelines, frames, processors, interruptions, Pipecat Flows',
    'LiveKit Agents docs (docs.livekit.io/agents) — AgentSession, turn detection, workers, telephony',
    'ai-engineering-from-scratch (MIT, © 2026 Rohit Ghumare) — Phase 14 lesson 22 and Phase 6 lesson 14, adapted and rewritten',
  ],
  tags: ['audio', 'speech', 'stt', 'tts', 'whisper', 'voice-agents', 'video', 'diarization'],
  cheatSheet: [
    'Normalise audio first: mono, 16 kHz, 16-bit PCM — what almost every ASR model expects.',
    'VAD (Silero, WebRTC) cuts silence: saves 20–40% of STT cost and gives natural chunk boundaries.',
    'Whisper sees 30-second log-Mel windows; chunk long audio on silences with ~1 s overlap, never mid-word.',
    'Diarisation = "who spoke when" (pyannote, or gpt-4o-transcribe-diarize); merge with ASR by timestamps.',
    'WER = (S + D + I) / N words in the reference; normalise case, punctuation and numbers before scoring.',
    'OpenAI transcription uploads cap at 25 MB per file — chunk or compress (Opus/MP3) longer recordings.',
    'Voice agent budget: VAD end-of-turn ~200–300 ms + STT ~150 ms + LLM TTFT ~300–500 ms + TTS first byte ~150 ms ≈ 0.8–1.2 s.',
    'Stream everything: partial transcripts in, sentence-sized LLM chunks to TTS, audio chunks out; support barge-in.',
    'Video = frames + audio: sample 0.5–1 fps (Gemini default ≈ 1 fps, ~258 tokens per frame) plus a transcript.',
    'Use scene-change detection to pick keyframes and timestamps so answers can cite "at 03:12".',
  ],
  sections: [
    {
      heading: 'Audio Processing — resample, VAD, chunk, diarise',
      steps: {
        actors: [
          { id: 'raw', kind: 'data', label: 'Recording', sub: 'any format', x: 110, y: 70 },
          { id: 'ffmpeg', kind: 'tool', label: 'ffmpeg', sub: 'mono · 16 kHz PCM', x: 340, y: 70 },
          { id: 'vad', kind: 'guard', label: 'VAD', sub: 'Silero / WebRTC', x: 570, y: 70 },
          { id: 'chunk', kind: 'chunker', label: 'Chunker', sub: '≤30 s, at silences', x: 800, y: 70 },
          { id: 'diar', kind: 'embedder', label: 'Diarisation', sub: 'speaker embeddings', x: 340, y: 230 },
          { id: 'stt', kind: 'llm', label: 'Speech-to-text', sub: 'word timestamps', x: 800, y: 230 },
          { id: 'out', kind: 'document', label: 'Transcript', sub: 'who said what', x: 570, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'From messy river to neat buckets',
            lines: [
              'Decode and normalise with ffmpeg: mono, **16 kHz**, 16-bit PCM.',
              '**VAD** labels 30 ms frames as speech or not; silence and music are dropped.',
              'Keep ~200 ms padding so words are not clipped.',
            ],
            script: [
              { say: 0 },
              { send: ['raw', 'ffmpeg'], label: 'decode' },
              { badge: 'ffmpeg', text: 'mono 16 kHz', tone: 'ok' },
              { say: 1 },
              { send: ['ffmpeg', 'vad'], label: 'frames' },
              { badge: 'vad', text: 'silence dropped', tone: 'miss' },
              { say: 2 },
              { badge: 'vad', text: '+200 ms pad' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: where to cut',
            lines: ['Chunks must fit the model window (Whisper: 30 s) or the upload limit.'],
            task: {
              type: 'choose',
              question: 'Where do you split the audio into chunks?',
              options: [
                { text: 'Only at silences, with ~0.5–1 s overlap for long monologues' },
                { text: 'Exactly every 30 s', why: 'A fixed cut can slice through a word; split only at silences.' },
                { text: 'Nowhere: send the whole hour', why: 'Chunks must fit the model window or upload limit.' },
              ],
              answer: 0,
            },
            solved: 'Merge VAD segments into chunks under the window, split only at silences.',
            then: [{ send: ['vad', 'chunk'], label: 'speech' }, { send: ['chunk', 'stt'], label: 'chunks', tone: 'ok', count: 3 }],
          },
          {
            kind: 'watch',
            title: 'Who said what',
            lines: [
              'A speaker-embedding model clusters segments into Speaker A / B / C.',
              'Align the speakers with ASR word timestamps to get "who said what".',
              'Separate channels beat clever diarisation whenever you control recording.',
            ],
            script: [
              { say: 0 },
              { send: ['ffmpeg', 'diar'], label: 'full audio' },
              { badge: 'diar', text: 'A · B' },
              { say: 1 },
              { send: ['stt', 'out'], label: 'words' },
              { send: ['diar', 'out'], label: 'speakers' },
              { lit: 'out' },
              { say: 2 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the pipeline',
            lines: ['Normalise before anything else.'],
            task: {
              type: 'order',
              question: 'Put the audio pipeline in order.',
              items: [
                'Decode and normalise (mono 16 kHz)',
                'VAD: drop non-speech',
                'Chunk at silences',
                'Transcribe the chunks',
                'Align diarised speakers to words',
              ],
              hint: 'Speech detection needs clean audio, chunks need speech segments, and speaker labels attach to words last.',
            },
            solved: 'Normalise → VAD → chunk → transcribe → align speakers by timestamp.',
            then: [
              { send: ['raw', 'ffmpeg'] },
              { send: ['ffmpeg', 'vad'] },
              { send: ['vad', 'chunk'] },
              { send: ['chunk', 'stt'] },
              { send: ['stt', 'out'], label: 'words', tone: 'ok' },
            ],
          },
          {
            kind: 'watch',
            title: 'A 60-minute sales call',
            lines: [
              '635 MB stereo WAV → ~115 MB as mono 16 kHz PCM.',
              'VAD finds 41 minutes of speech: **32% less** audio to transcribe.',
              'Diarisation finds 2 speakers: 58% of words from the rep, 42% from the customer.',
            ],
            script: [
              { say: 0 },
              { send: ['raw', 'ffmpeg'], label: '635 MB' },
              { badge: 'ffmpeg', text: '~115 MB' },
              { say: 1 },
              { send: ['ffmpeg', 'vad'] },
              { badge: 'vad', text: '41 min speech', tone: 'ok' },
              { say: 2 },
              { send: ['diar', 'out'], label: 'talk ratio' },
            ],
          },
        ],
      },
      body: `**Intuition:** raw audio is a messy river; models want neat, labelled buckets. Audio processing is the plumbing that converts any recording into clean, speech-only segments with speaker labels.

**The standard pipeline.**
1. **Decode and normalise** with ffmpeg: mono, **16 kHz**, 16-bit PCM. Phone audio is 8 kHz; upsampling does not add detail but keeps the format consistent.
2. **Voice activity detection (VAD):** a tiny model (Silero VAD, WebRTC VAD) labels 30 ms frames as speech/non-speech. Drop silence and music; keep ~200 ms padding so words are not clipped.
3. **Chunking:** merge VAD segments into chunks ≤ the model window (Whisper: 30 s) or upload limit, splitting **only at silences**, with ~0.5–1 s overlap for long monologues.
4. **Diarisation:** a speaker-embedding model clusters segments into Speaker A/B/C (pyannote.audio, NeMo). Align with ASR word timestamps to produce "who said what".
5. **Enhancement (optional):** denoise or loudness-normalise (−16 LUFS) for noisy call-centre audio.

| Signal | Typical value |
|---|---|
| Sample rate for ASR | 16 kHz |
| VAD frame | 10–30 ms |
| Silence to end a chunk | 300–700 ms |
| Speech in a typical meeting | 60–80% of wall time |

**When to use.** Always for long or noisy recordings, meetings, calls and anything you bill by audio minute. For short push-to-talk clips you can skip straight to STT.`,
      example: `**A 60-minute sales call (stereo, 44.1 kHz WAV, 635 MB).**

- ffmpeg → mono 16 kHz PCM: 60 × 60 × 16,000 × 2 bytes ≈ **115 MB**; as 32 kbps Opus ≈ **14 MB** (under a 25 MB upload cap).
- Silero VAD finds 41 minutes of speech → **32% less audio** to transcribe.
- Chunker merges segments into ~90 chunks of ≤ 30 s (the Whisper window), cut at pauses ≥ 500 ms.
- pyannote finds 2 speakers; overlap with ASR words labels 58% of words as the rep, 42% as the customer — a talk-ratio metric sales managers actually ask for.`,
      diagram: `  file.wav/mp4 ─► ffmpeg (mono,16kHz) ─► VAD (30ms frames)
                                             │ speech segments
                                             ▼
                       chunker (≤30s or ≤25MB, cut on silence, overlap)
                                             │
                     ┌───────────────────────┴───────────────────┐
                     ▼                                           ▼
                STT per chunk                         diarisation (speaker
                (words+timestamps)                    embeddings → clusters)
                     └──────────── align by time ────────────────┘
                                             ▼
                          [00:12 A] "Thanks for joining…"`,
      code: [
        {
          language: 'python',
          title: 'Resample, run Silero VAD and build silence-aligned chunks',
          code: `import torch
import torchaudio

SR = 16_000
MAX_CHUNK_S = 30.0  # Whisper window

model, utils = torch.hub.load('snakers4/silero-vad', 'silero_vad')
get_speech_timestamps, _, read_audio, _, _ = utils

wav = read_audio('call.wav', sampling_rate=SR)  # decodes + resamples to mono 16 kHz
segments = get_speech_timestamps(
    wav, model, sampling_rate=SR,
    min_silence_duration_ms=500,   # a pause this long ends a segment
    speech_pad_ms=200,             # keep a little context so words are not clipped
)

chunks, cur = [], None
for seg in segments:                 # seg = {'start': sample_idx, 'end': sample_idx}
    if cur and (seg['end'] - cur['start']) / SR <= MAX_CHUNK_S:
        cur['end'] = seg['end']      # extend current chunk while under the window
    else:
        if cur: chunks.append(cur)
        cur = dict(seg)
if cur: chunks.append(cur)

speech_s = sum(s['end'] - s['start'] for s in segments) / SR
print(f"audio {len(wav)/SR:.0f}s, speech {speech_s:.0f}s, chunks {len(chunks)}")
for i, c in enumerate(chunks):
    torchaudio.save(f'chunk_{i:03d}.wav', wav[c['start']:c['end']].unsqueeze(0), SR)`,
        },
      ],
      prosCons: {
        pros: [
          'VAD removes silence and music, cutting STT cost and hallucinations on non-speech.',
          'Silence-aligned chunks avoid split words and let you transcribe in parallel.',
          'Diarisation unlocks per-speaker analytics (talk ratio, who committed to what).',
        ],
        cons: [
          { con: 'Aggressive VAD clips soft word onsets ("…kay, so").', fix: 'Add 150–250 ms speech padding and tune the threshold on a labelled sample of your own audio.' },
          { con: 'Diarisation labels are per-file clusters, not identities, and drift across chunks.', fix: 'Diarise the whole file before chunking, or map clusters to known speakers with reference voice embeddings.' },
          { con: 'Overlapping speech confuses both ASR and diarisation.', fix: 'Record separate channels per participant when possible (stereo call recordings) and transcribe each channel independently.' },
        ],
      },
      keyPoints: [
        'Normalise to mono 16 kHz before anything else.',
        'VAD first, then chunk on silences, then transcribe in parallel.',
        'Diarise the full recording, then align speakers to words by timestamp.',
        'Separate channels beat clever diarisation whenever you control recording.',
      ],
      exercise: {
        prompt: `Write **mergeSegments(segments, maxSec, minGapSec)** that turns VAD segments into transcription chunks.

Acceptance criteria:
- Input: sorted [{start, end}] in seconds.
- Merge consecutive segments while the merged chunk stays ≤ maxSec **and** the gap between them is < minGapSec.
- A single segment longer than maxSec is split into equal parts each ≤ maxSec.
- mergeSegments([{start:0,end:10},{start:10.3,end:25},{start:27,end:40}], 30, 1) → [{0,25},{27,40}].`,
        starter: {
          language: 'typescript',
          code: `type Seg = { start: number; end: number };

export function mergeSegments(segs: Seg[], maxSec: number, minGapSec: number): Seg[] {
  const out: Seg[] = [];
  // TODO: split over-long segments
  // TODO: merge while gap < minGapSec and length <= maxSec
  return out;
}`,
        },
        hints: [
          'First map each segment to one or more pieces using Math.ceil(length / maxSec).',
          'Then walk pieces, comparing next.start - cur.end with minGapSec and next.end - cur.start with maxSec.',
        ],
        solution: {
          language: 'typescript',
          code: `type Seg = { start: number; end: number };

export function mergeSegments(segs: Seg[], maxSec: number, minGapSec: number): Seg[] {
  const pieces: Seg[] = segs.flatMap((s) => {
    const n = Math.ceil((s.end - s.start) / maxSec);
    const len = (s.end - s.start) / n;
    return Array.from({ length: n }, (_, i) => ({ start: s.start + i * len, end: s.start + (i + 1) * len }));
  });
  const out: Seg[] = [];
  for (const p of pieces) {
    const cur = out[out.length - 1];
    if (cur && p.start - cur.end < minGapSec && p.end - cur.start <= maxSec) cur.end = p.end;
    else out.push({ ...p });
  }
  return out;
}

console.log(mergeSegments([{ start: 0, end: 10 }, { start: 10.3, end: 25 }, { start: 27, end: 40 }], 30, 1));
// [ { start: 0, end: 25 }, { start: 27, end: 40 } ]
console.log(mergeSegments([{ start: 0, end: 70 }], 30, 1).length); // 3 pieces of ~23.3 s`,
        },
        explanation: 'Long gaps are natural sentence or turn boundaries, so merging only across short gaps keeps chunks semantically coherent, and the length cap respects the model window. Equal splitting of over-long segments avoids a tiny trailing chunk with little context.',
      },
      quickCheck: {
        question: 'Your meeting transcripts contain invented sentences during long silent stretches. What is the most effective first fix?',
        options: [
          'Switch to a larger ASR model',
          'Run VAD and only send speech segments to the ASR model',
          'Raise the sample rate to 48 kHz',
        ],
        correct: 1,
        explanation: 'Seq2seq ASR models like Whisper are known to hallucinate text on silence or noise. Removing non-speech with VAD fixes the cause; a larger model or a higher sample rate does not.',
      },
      source: 'Silero VAD; pyannote.audio',
    },
    {
      heading: 'Speech-to-Text — Whisper-class APIs and WER',
      steps: {
        actors: [
          { id: 'audio', kind: 'data', label: 'Audio', sub: '30-s window', x: 110, y: 70 },
          { id: 'mel', kind: 'tool', label: 'Log-Mel', sub: 'spectrogram', x: 340, y: 70 },
          { id: 'enc', kind: 'embedder', label: 'Encoder', sub: 'transformer', x: 570, y: 70 },
          { id: 'dec', kind: 'llm', label: 'Decoder', sub: 'emits text tokens', x: 800, y: 70 },
          { id: 'ref', kind: 'document', label: 'Reference', sub: 'human transcript', x: 340, y: 230 },
          { id: 'wer', kind: 'metric', label: 'WER', sub: '(S + D + I) / N', x: 570, y: 230 },
          { id: 'prompt', kind: 'user', label: 'Prompt', sub: 'domain terms', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'How Whisper works',
            lines: [
              'Audio becomes a 30-second log-Mel spectrogram.',
              'A transformer **encoder** reads it; a **decoder** emits text tokens.',
              'Special tokens set the language, task (transcribe/translate) and timestamps.',
            ],
            script: [
              { say: 0 },
              { send: ['audio', 'mel'] },
              { say: 1 },
              { send: ['mel', 'enc'] },
              { send: ['enc', 'dec'] },
              { say: 2 },
              { badge: 'dec', text: 'lang · task · time' },
            ],
          },
          {
            kind: 'watch',
            title: 'Cheap accuracy levers',
            lines: [
              'Pass a **prompt** with domain terms ("Kubernetes, kubectl, Istio").',
              'Set the language and clean the audio (VAD, denoise).',
              'Post-process numbers and casing.',
            ],
            script: [
              { say: 0 },
              { lit: 'prompt' },
              { send: ['prompt', 'dec'], label: 'vocabulary', tone: 'ok' },
              { say: 1 },
              { badge: 'audio', text: 'cleaned', tone: 'ok' },
              { say: 2 },
              { badge: 'dec', text: 'numbers fixed' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: compute the WER',
            lines: [
              'Ref: "please transfer **five** hundred dollars to **my** savings account" (9 words).',
              'Hyp: "please transfer **nine** hundred dollars to savings account **now**".',
            ],
            task: {
              type: 'choose',
              question: 'What is the word error rate?',
              options: [
                { text: '33.3%: 1 substitution + 1 deletion + 1 insertion, over 9' },
                { text: '11.1%: only "nine" is wrong', why: 'Count all three edits: five→nine (S), missing "my" (D), extra "now" (I).' },
                { text: '22.2%: insertions do not count', why: 'WER = (S + D + I) / N; insertions count too.' },
              ],
              answer: 0,
            },
            solved: 'WER = (1 + 1 + 1) / 9 = 33.3%.',
            then: [{ send: ['dec', 'wer'], label: 'hypothesis' }, { send: ['ref', 'wer'], label: 'reference' }, { badge: 'wer', text: '33.3%' }],
          },
          {
            kind: 'watch',
            title: 'Normalise before scoring',
            lines: [
              'Lowercase, strip punctuation, treat "5" and "five" alike.',
              'Otherwise you score formatting, not recognition.',
              'Track WER per segment type: accent, channel, noise.',
            ],
            script: [
              { say: 0 },
              { send: ['ref', 'wer'], label: 'normalised' },
              { send: ['dec', 'wer'], label: 'normalised' },
              { say: 1 },
              { badge: 'wer', text: 'recognition only', tone: 'ok' },
              { say: 2 },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: what to gate on',
            lines: ['In that example the one substitution changed the **amount**.'],
            task: {
              type: 'choose',
              question: 'For a banking voicebot, what should gate a release?',
              options: [
                { text: 'Entity error rate on names, amounts and product codes' },
                { text: 'Overall WER alone', why: '33% WER understates the harm: entity error on amounts here is 100%.' },
                { text: 'Transcription speed', why: 'Speed says nothing about getting the words that matter right.' },
              ],
              answer: 0,
            },
            solved: 'Gate releases on entity accuracy, not just WER.',
            then: [{ badge: 'wer', text: 'amounts: 100% wrong', tone: 'err' }],
          },
        ],
      },
      body: `**Intuition:** STT is translation from sound to words. Modern models (Whisper, gpt-4o-transcribe, Deepgram, AssemblyAI, Google Chirp) are encoder–decoder transformers trained on hundreds of thousands of hours, so they handle accents and noise far better than older pipelines — but they can still "hallucinate" fluent text.

**How Whisper works.** Audio → 30-second log-Mel spectrogram (80 or 128 bins) → transformer encoder → decoder that emits text tokens, with special tokens for language, task (transcribe/translate) and timestamps.

**API options (OpenAI).**
| Model | Notes |
|---|---|
| whisper-1 | verbose_json with segment/word timestamps |
| gpt-4o-transcribe / gpt-4o-mini-transcribe | lower WER, prompt for vocabulary, streaming |
| gpt-4o-transcribe-diarize | speaker labels; needs chunking_strategy for audio > 30 s |
Uploads are capped at **25 MB per request**.

**Accuracy levers.** Pass a **prompt** with domain terms ("Kubernetes, kubectl, Istio"); set the language; clean audio (VAD, denoise); post-process numbers and casing.

**Measuring: Word Error Rate.** WER = (S + D + I) / N, where S = substitutions, D = deletions, I = insertions against a reference of N words, computed with edit-distance alignment. **Normalise first** (lowercase, strip punctuation, "5" ↔ "five") or you will score formatting, not recognition. Track WER per segment type (accent, channel, noise) and also **entity error rate** for names, amounts and product codes — the words that actually matter.

**When to use.** Batch transcription for search/analytics; streaming STT for live captions and voice agents.`,
      example: `**WER worked example.**
- Reference (9 words): "please transfer five hundred dollars to my savings account"
- Hypothesis: "please transfer nine hundred dollars to savings account now"

Alignment: five→**nine** (S=1), "my" missing (D=1), "now" extra (I=1).
WER = (1 + 1 + 1) / 9 = **33.3%**.

Note that 33% understates the harm: the single substitution changed the **amount**. Entity error rate on amounts here is 1/1 = 100% — that is the metric to gate releases on for a banking voicebot.`,
      diagram: `  audio chunk (≤30s) ─► log-Mel spectrogram (80/128 x 3000 frames)
                              │
                              ▼
                     transformer encoder
                              │ cross-attention
  <|en|><|transcribe|> ─► decoder ─► "please transfer five hundred…"
                              │
           post-process: numbers, casing, PII redaction ─► transcript`,
      code: [
        {
          language: 'typescript',
          title: 'Transcribe chunks in parallel with a vocabulary prompt',
          code: `import OpenAI from 'openai';
import fs from 'node:fs';

const openai = new OpenAI();
const STT_MODEL = process.env.STT_MODEL ?? 'gpt-4o-transcribe';
const VOCAB = 'Acme Cloud, kubectl, Istio, SLA, P1 incident'; // domain terms the model may not know

async function transcribeChunk(path: string, prevText: string) {
  const res = await openai.audio.transcriptions.create({
    file: fs.createReadStream(path),
    model: STT_MODEL,
    language: 'en',
    // prompt = vocabulary + tail of previous chunk for continuity across boundaries
    prompt: VOCAB + '. ' + prevText.slice(-200),
    response_format: 'json',
  });
  return res.text;
}

export async function transcribeAll(chunkPaths: string[], concurrency = 4) {
  const out: string[] = new Array(chunkPaths.length).fill('');
  let next = 0;
  async function worker() {
    while (next < chunkPaths.length) {
      const i = next++;
      // previous chunk text may not be ready yet in parallel mode; vocab still helps
      out[i] = await transcribeChunk(chunkPaths[i], out[i - 1] ?? '');
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out.join(' ');
}`,
        },
      ],
      prosCons: {
        pros: [
          'Robust to accents and background noise compared with older ASR.',
          'Vocabulary prompts fix domain terms without fine-tuning.',
          'Chunked audio transcribes in parallel, so a 1-hour file returns in well under a minute.',
        ],
        cons: [
          { con: 'Hallucinated text on silence, music or crosstalk.', fix: 'Run VAD before STT and drop segments with very low average log-probability or repeated phrases.' },
          { con: 'Plain WER hides critical errors in names and amounts.', fix: 'Track entity error rate on a labelled set and confirm critical values back to the user ("five hundred, correct?").' },
          { con: 'Chunk boundaries cut words or lose context.', fix: 'Cut on silences, overlap ~1 s and de-duplicate overlapping words using timestamps.' },
          { con: '25 MB upload limit per request.', fix: 'Compress to Opus/MP3 at 32–64 kbps and/or chunk by duration before upload.' },
        ],
      },
      keyPoints: [
        'Whisper-class models are encoder–decoder transformers over 30-s log-Mel windows.',
        'WER = (S + D + I) / N after text normalisation.',
        'Prompts with domain vocabulary are the cheapest accuracy win.',
        'Gate releases on entity accuracy, not just WER.',
      ],
      exercise: {
        prompt: `Implement **wer(ref, hyp)** using word-level Levenshtein distance.

Acceptance criteria:
- Normalise: lowercase, strip punctuation, collapse whitespace.
- Return { wer, s, d, i } where s/d/i are counts from a backtrace of the DP table.
- wer('please transfer five hundred dollars to my savings account', 'Please transfer nine hundred dollars to savings account, now.') → wer ≈ 0.333 with s=1, d=1, i=1.`,
        starter: {
          language: 'typescript',
          code: `export function wer(ref: string, hyp: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\\s]/g, '').split(/\\s+/).filter(Boolean);
  const r = norm(ref), h = norm(hyp);
  // TODO: dp[i][j] = edit distance between r[0..i) and h[0..j)
  // TODO: backtrace to count substitutions, deletions, insertions
  return { wer: 0, s: 0, d: 0, i: 0 };
}`,
        },
        hints: [
          'dp[i][0] = i (all deletions), dp[0][j] = j (all insertions).',
          'dp[i][j] = min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (r[i-1] === h[j-1] ? 0 : 1)).',
          'Backtrace from (n, m): diagonal with mismatch = S, up = D, left = I.',
        ],
        solution: {
          language: 'typescript',
          code: `export function wer(ref: string, hyp: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\\s]/g, '').split(/\\s+/).filter(Boolean);
  const r = norm(ref), h = norm(hyp);
  const dp = Array.from({ length: r.length + 1 }, (_, i) =>
    Array.from({ length: h.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= r.length; i++)
    for (let j = 1; j <= h.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  let i = r.length, j = h.length, s = 0, d = 0, ins = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)) {
      if (r[i - 1] !== h[j - 1]) s++;
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) { d++; i--; }
    else { ins++; j--; }
  }
  return { wer: (s + d + ins) / r.length, s, d, i: ins };
}

console.log(wer('please transfer five hundred dollars to my savings account',
  'Please transfer nine hundred dollars to savings account, now.'));
// { wer: 0.333..., s: 1, d: 1, i: 1 }`,
        },
        explanation: 'WER is the minimum edit distance between word sequences divided by reference length. Normalisation ensures "Please" vs "please" or a trailing comma is not counted as an error; the backtrace splits the total into S/D/I, which tells you whether the model mishears (S), drops (D) or invents (I) words.',
      },
      quickCheck: {
        question: 'Model A has WER 6.1% and model B 6.8% on your test set, but B gets account numbers right more often. Which should a banking voicebot ship?',
        options: [
          'A, because lower WER is strictly better',
          'B, because errors on critical entities matter more than overall WER',
          'Neither: WER under 10% is always good enough',
        ],
        correct: 1,
        explanation: 'WER weights every word equally, so a filler-word difference can outweigh one wrong digit. For transactions, entity accuracy (amounts, account numbers) is the business-critical metric.',
      },
      source: 'Radford et al. 2022 — Whisper; OpenAI docs — Speech to text',
    },
    {
      heading: 'Text-to-Speech — streaming voices and the voice-agent latency budget',
      steps: {
        actors: [
          { id: 'caller', kind: 'user', label: 'Caller', sub: 'expects ~1 s', x: 110, y: 70 },
          { id: 'eot', kind: 'tool', label: 'End-of-turn', sub: 'VAD ~200–300 ms', x: 340, y: 70 },
          { id: 'stt', kind: 'tool', label: 'Streaming STT', sub: '~100–200 ms', x: 570, y: 70 },
          { id: 'llm', kind: 'llm', label: 'LLM', sub: 'TTFT ~300–500 ms', x: 800, y: 70 },
          { id: 'tts', kind: 'tool', label: 'TTS', sub: 'TTFB ~100–200 ms', x: 800, y: 230 },
          { id: 'net', kind: 'server', label: 'Network', sub: '~50–100 ms', x: 340, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'About a second',
            lines: [
              'In conversation, people expect a reply within about a second.',
              'Longer pauses feel broken.',
              'So **time-to-first-audio** matters more than voice quality.',
            ],
            script: [
              { say: 0 },
              { lit: 'caller' },
              { badge: 'caller', text: '≲ 1 s' },
              { say: 1 },
              { badge: 'caller', text: 'silence…', tone: 'err' },
              { say: 2 },
            ],
          },
          {
            kind: 'watch',
            title: 'The cascade budget',
            lines: [
              'End-of-turn detection: VAD silence ~200–300 ms.',
              'Final streaming STT transcript: ~100–200 ms.',
              'LLM time-to-first-token: ~300–500 ms.',
              'TTS first byte ~100–200 ms, then network ~50–100 ms.',
            ],
            script: [
              { say: 0 },
              { send: ['caller', 'eot'], label: 'speech' },
              { say: 1 },
              { send: ['eot', 'stt'] },
              { say: 2 },
              { send: ['stt', 'llm'], label: 'text' },
              { say: 3 },
              { send: ['llm', 'tts'], label: 'sentence 1' },
              { send: ['tts', 'net'], label: 'audio' },
              { send: ['net', 'caller'], label: 'audio', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the biggest win',
            lines: ['A support phone agent went from 4.8 s naive to 1.03 s optimised.'],
            task: {
              type: 'choose',
              question: 'Which change helped most?',
              options: [
                { text: 'Streaming LLM output into TTS sentence by sentence' },
                { text: 'A faster network', why: 'Network only went from 100 to 80 ms.' },
                { text: 'A more natural voice', why: 'Quality matters, but time-to-first-audio matters more.' },
              ],
              answer: 0,
            },
            solved: 'Speech starts while the model is still generating sentence two.',
            then: [
              { send: ['llm', 'tts'], label: 'sentence 1', tone: 'ok' },
              { send: ['tts', 'net'], label: 'audio' },
              { send: ['llm', 'tts'], label: 'sentence 2' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: cascade or speech-to-speech?',
            lines: ['Cascade: STT → LLM → TTS. Speech-to-speech: one realtime model.'],
            task: {
              type: 'choose',
              question: 'You must inspect the text and apply text guardrails. Which architecture?',
              options: [
                { text: 'The cascade' },
                { text: 'Speech-to-speech', why: 'Lowest latency and keeps tone, but less control and harder to audit and test.' },
              ],
              answer: 0,
            },
            solved: 'Cascade: swappable and inspectable. Speech-to-speech: lowest latency, less control.',
          },
          {
            kind: 'watch',
            title: 'Must-haves',
            lines: [
              'Streaming at every hop.',
              '**Barge-in**: stop TTS when the user speaks.',
              'Filler for slow tools ("Let me check that…"), and read numbers out as words.',
            ],
            script: [
              { say: 0 },
              { send: ['stt', 'llm'] },
              { send: ['llm', 'tts'] },
              { say: 1 },
              { send: ['caller', 'eot'], label: 'speaks' },
              { down: 'tts' },
              { say: 2 },
              { down: 'tts', on: false },
              { badge: 'tts', text: 'let me check…' },
            ],
          },
        ],
      },
      body: `**Intuition:** humans expect a reply within about a second in conversation; longer pauses feel broken. TTS quality matters, but **time-to-first-audio** matters more.

**Modern TTS.** Neural TTS models (OpenAI gpt-4o-mini-tts, ElevenLabs, Azure Neural, Cartesia, open models like Kokoro/XTTS) map text to audio tokens or spectrograms and decode them with a neural vocoder. Many accept **style instructions** ("calm, empathetic") and stream audio in chunks (PCM/Opus) as they synthesise.

**Two voice-agent architectures.**
| Cascade (STT → LLM → TTS) | Speech-to-speech (Realtime APIs) |
|---|---|
| Swap any component, inspect text, apply text guardrails | Lowest latency, preserves tone and emotion |
| More hops, more latency | Less control, harder to audit and test |

**Latency budget (cascade, target ≲ 1 s mouth-to-ear).**
1. End-of-turn detection (VAD silence ~200–300 ms, or a semantic turn detector)
2. Final STT transcript (streaming STT, ~100–200 ms after end of speech)
3. LLM time-to-first-token (~300–500 ms; keep prompts short and cached)
4. TTS time-to-first-byte (~100–200 ms) — start on the **first sentence**, not the full reply
5. Network/jitter buffer (~50–100 ms)

**Must-haves.** Streaming at every hop, **barge-in** (stop TTS when the user speaks), filler acknowledgements for slow tool calls ("Let me check that…"), and text normalisation (read "$1,250.50" as "one thousand two hundred fifty dollars and fifty cents").

**When to use.** Phone agents, accessibility, in-car and hands-free assistants, audio content generation.`,
      example: `**Budget for a support phone agent (measured p50).**

| Stage | Naive | Optimised |
|---|---|---|
| End-of-turn (silence timeout) | 800 ms | 300 ms |
| STT (batch vs streaming final) | 600 ms | 150 ms |
| LLM (full answer vs TTFT, 2k-token prompt cached) | 2,400 ms | 350 ms |
| TTS (whole reply vs first sentence) | 900 ms | 150 ms |
| Network | 100 ms | 80 ms |
| **Total** | **4.8 s** | **1.03 s** |

The biggest win came from streaming LLM output into TTS sentence-by-sentence: speech starts while the model is still generating sentence two.`,
      diagram: `user speech ─► [VAD/turn detect] ─► [streaming STT] ─► text
                                                      │
                     ┌────────────── LLM (stream tokens) ◄┘
                     │ sentence boundary? ─► TTS chunk ─► audio out ─► user
                     │                                       ▲
  user starts talking again ──── barge-in: cancel LLM + TTS ─┘
  budget: 300 + 150 + 350 + 150 + 80 ≈ 1.0 s to first audio`,
      code: [
        {
          language: 'typescript',
          title: 'Stream LLM sentences into TTS as they complete',
          code: `import OpenAI from 'openai';
import fs from 'node:fs';

const openai = new OpenAI();
const LLM = process.env.LLM_MODEL ?? 'gpt-5-mini';
const TTS = process.env.TTS_MODEL ?? 'gpt-4o-mini-tts';

async function speak(sentence: string, idx: number) {
  const audio = await openai.audio.speech.create({
    model: TTS,
    voice: 'alloy',
    input: sentence,
    instructions: 'Warm, concise customer-support tone.',
    response_format: 'mp3',
  });
  // in a real agent you would pipe audio.body to the caller instead of a file
  fs.writeFileSync('reply_' + idx + '.mp3', Buffer.from(await audio.arrayBuffer()));
  console.log('audio ready for sentence', idx, Date.now());
}

export async function respond(userText: string) {
  const stream = await openai.chat.completions.create({
    model: LLM,
    stream: true,
    messages: [
      { role: 'system', content: 'You are a phone agent. Use short sentences. No markdown.' },
      { role: 'user', content: userText },
    ],
  });
  let buf = '';
  let n = 0;
  const pending: Promise<void>[] = [];
  for await (const chunk of stream) {
    buf += chunk.choices[0]?.delta?.content ?? '';
    const m = buf.match(/^(.+?[.!?])\\s+(.*)$/s); // flush on sentence boundary
    if (m) { pending.push(speak(m[1], n++)); buf = m[2]; }
  }
  if (buf.trim()) pending.push(speak(buf.trim(), n++));
  await Promise.all(pending); // play in index order on the client
}`,
        },
      ],
      prosCons: {
        pros: [
          'Sentence-level streaming starts audio after the first sentence, not the full reply.',
          'Style instructions give brand-consistent voices without recording sessions.',
          'Cascade design keeps a text transcript you can log, guard and evaluate.',
        ],
        cons: [
          { con: 'Each cascade hop adds latency.', fix: 'Stream every stage, colocate services in one region, cache the system prompt, or move to a speech-to-speech Realtime model for the tightest budgets.' },
          { con: 'Numbers, dates and acronyms are read wrongly.', fix: 'Normalise text before TTS (or instruct the LLM to write numbers as spoken words) and test with a pronunciation list.' },
          { con: 'Users talk over the agent and it keeps speaking.', fix: 'Implement barge-in: keep VAD running during playback and cancel the LLM stream and TTS queue on detected speech.' },
          { con: 'Voice cloning enables impersonation.', fix: 'Use only consented voices, disclose AI voice to callers, and watermark or log generated audio.' },
        ],
      },
      keyPoints: [
        'Optimise time-to-first-audio, not total synthesis time.',
        'Budget each hop: turn detection, STT, LLM TTFT, TTS TTFB, network.',
        'Chunk LLM output by sentence into TTS.',
        'Barge-in and filler phrases make agents feel natural.',
      ],
      exercise: {
        prompt: `Write **latencyReport(stages, targetMs)** for a voice agent.

Acceptance criteria:
- stages: Record<string, number> of milliseconds.
- Return { total, overBy, worst } where worst is the stage name with the largest value and overBy = max(0, total − targetMs).
- Also return a suggestion string for worst using a lookup map (e.g. llm → "cache prompt / smaller model / stream").`,
        hints: [
          'Object.entries(stages) gives [name, ms] pairs to sum and sort.',
          'Keep suggestions in a Record<string, string> with a default fallback.',
        ],
        solution: {
          language: 'typescript',
          code: `const SUGGEST: Record<string, string> = {
  turn: 'shorter silence timeout or a semantic end-of-turn model',
  stt: 'streaming STT; use the final partial instead of a batch call',
  llm: 'cache the system prompt, shorten context, smaller model, stream tokens',
  tts: 'synthesise the first sentence only; streaming TTS',
  network: 'colocate services in one region; reuse WebSocket connections',
};

export function latencyReport(stages: Record<string, number>, targetMs = 1000) {
  const entries = Object.entries(stages);
  const total = entries.reduce((s, [, ms]) => s + ms, 0);
  const [worst] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { total, overBy: Math.max(0, total - targetMs), worst, suggestion: SUGGEST[worst] ?? 'profile this stage' };
}

console.log(latencyReport({ turn: 300, stt: 150, llm: 900, tts: 150, network: 80 }));
// { total: 1580, overBy: 580, worst: 'llm', suggestion: 'cache the system prompt, ...' }`,
        },
        explanation: 'A budget turns "it feels slow" into a ranked list of stages. The LLM time-to-first-token is usually the largest and most tunable item, which is why prompt caching and streaming matter so much in voice.',
      },
      quickCheck: {
        question: 'Your cascade voice agent waits for the full LLM reply before calling TTS. Replies average 4 sentences. What change cuts perceived latency most?',
        options: [
          'Use a higher-quality TTS voice',
          'Send each completed sentence to TTS as soon as it streams out of the LLM',
          'Increase the VAD silence timeout so users finish speaking',
        ],
        correct: 1,
        explanation: 'Users hear audio after sentence one instead of after the whole reply. A better voice does not reduce latency, and a longer silence timeout adds delay.',
      },
      source: 'OpenAI docs — Text to speech; Realtime API',
    },
    {
      heading: 'Video Understanding — frame sampling, transcripts and timestamps',
      steps: {
        actors: [
          { id: 'video', kind: 'data', label: 'Video', sub: 'frames + audio', x: 110, y: 70 },
          { id: 'frames', kind: 'tool', label: 'Frame sampler', sub: 'fps or scene change', x: 340, y: 70 },
          { id: 'vlm', kind: 'llm', label: 'VLM', sub: 'timestamped answer', x: 800, y: 70 },
          { id: 'asr', kind: 'tool', label: 'Transcript', sub: 'audio → text', x: 110, y: 230 },
          { id: 'index', kind: 'vector-db', label: 'Index', sub: 'captions + chunks', x: 570, y: 230 },
          { id: 'q', kind: 'user', label: 'Question', sub: 'per query', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'A flip-book plus a soundtrack',
            lines: [
              'Models do not watch continuously: they look at **sampled frames**.',
              'They also read or listen to the audio.',
              'Then they reason across both.',
            ],
            script: [
              { say: 0 },
              { send: ['video', 'frames'] },
              { send: ['frames', 'vlm'], label: 'frames' },
              { say: 1 },
              { send: ['video', 'asr'] },
              { send: ['asr', 'vlm'], label: 'transcript', tone: 'req', curve: true },
              { say: 2 },
              { lit: 'vlm' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: choose the frame rate',
            lines: ['A 45-minute webinar of slides at 1 fps is 2,700 frames, ~697k tokens.'],
            task: {
              type: 'choose',
              question: 'How should you sample a lecture or screen recording?',
              options: [
                { text: 'Scene change only: slides change rarely' },
                { text: '2–5 fps', why: 'High fps is for fast action like sports or manufacturing QA, on short clips.' },
                { text: '1 frame per second, all of it', why: 'That is ~697k tokens per question; scene change kept 84 keyframes.' },
              ],
              answer: 0,
            },
            solved: 'Pick fps by content: scene change for slides, 0.2–0.5 fps for meetings, 2–5 fps for fast action.',
            then: [{ send: ['video', 'frames'] }, { badge: 'frames', text: '84 keyframes', tone: 'ok' }],
          },
          {
            kind: 'watch',
            title: 'Timestamps and transcript',
            lines: [
              'Label each frame with its timestamp ("[02:15]").',
              'Include the transcript: in talking-head videos most information is in the audio.',
              'Ask for answers with timestamps.',
            ],
            script: [
              { say: 0 },
              { send: ['frames', 'vlm'], label: '[02:15] frame' },
              { say: 1 },
              { send: ['asr', 'vlm'], label: 'transcript', tone: 'req', curve: true },
              { say: 2 },
              { badge: 'vlm', text: '31:42–34:10', tone: 'ok' },
            ],
          },
          {
            kind: 'watch',
            title: 'Index, then ask',
            lines: [
              'For long libraries, caption each scene once and embed captions plus transcript chunks.',
              'Per question, retrieve the relevant moments.',
              'Send only those frames: cost per question dropped ~300×.',
            ],
            script: [
              { say: 0 },
              { send: ['frames', 'index'], label: 'captions' },
              { send: ['asr', 'index'], label: 'chunks' },
              { say: 1 },
              { send: ['q', 'index'], label: 'question' },
              { say: 2 },
              { send: ['index', 'vlm'], label: 'top 5 moments', tone: 'ok' },
              { badge: 'vlm', text: '~300× cheaper', tone: 'ok' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: index then ask',
            lines: ['Never stuff hours of footage into one prompt.'],
            task: {
              type: 'order',
              question: 'Order the index-then-ask flow.',
              items: [
                'Caption scenes and embed them with transcript chunks',
                'Retrieve the top moments for the question',
                'Send those frames + transcript to the model',
                'Answer with timestamps',
              ],
              hint: 'Indexing happens once; each question then retrieves and sends only what it needs.',
            },
            solved: 'Index once, retrieve moments per question, answer with timestamped evidence.',
            then: [{ send: ['q', 'index'] }, { send: ['index', 'vlm'], label: 'moments' }, { badge: 'vlm', text: 'timestamps', tone: 'ok' }],
          },
        ],
      },
      body: `**Intuition:** a video is a flip-book plus a soundtrack. Models do not "watch" continuously; they look at **sampled frames** and read (or listen to) the audio, then reason across them.

**Approaches.**
1. **Native video models** (e.g. Gemini): upload the file; the API samples ~1 frame/s (≈258 tokens per frame at default resolution) plus audio tokens. A 10-minute video ≈ 600 frames × 258 ≈ 155k tokens before audio.
2. **DIY pipeline** for any VLM: ffmpeg extracts frames → pick keyframes (fixed fps or scene-change detection) → transcribe audio → send frames with timestamps + transcript to the model.
3. **Index then ask** for long libraries: caption each scene once, embed captions and transcript chunks, retrieve the relevant moments per question, and only then send those frames.

**Frame-sampling strategy.**
| Content | Rate |
|---|---|
| Lectures, screen recordings | scene change only (slides change rarely) |
| Meetings | 0.2–0.5 fps + transcript |
| Sports, manufacturing QA | 2–5 fps on short clips |

**Prompting.** Label each frame with its timestamp ("[02:15]"), ask for answers with timestamps, and include the transcript — most information in talking-head videos is in the audio.

**When to use.** Meeting summaries, lecture Q&A, compliance review of recorded calls, product-demo search, safety monitoring. For hours of footage, use index-then-ask; never stuff everything into one prompt.`,
      example: `**Question over a 45-minute product webinar: "When do they demo the export feature?"**

- Naive: 1 fps × 2,700 s = 2,700 frames × ~258 tokens ≈ **697k tokens** — too large/expensive per question.
- Smarter: scene-change detection (threshold 0.3) keeps **84 keyframes**; transcript ≈ 6,500 words ≈ 8.7k tokens.
- Index: 84 captions + 90 transcript chunks embedded once.
- Query: retrieve top 5 moments → send 5 frames (~1.3k tokens) + matching transcript (~1k tokens).
- Answer: "Export is demoed at **31:42–34:10**; CSV and PDF are shown." Cost per question drops ~300×.`,
      diagram: `  video.mp4 ─┬─► ffmpeg frames ─► scene-change filter ─► keyframes(+ts)
            │                                               │ caption once
            └─► audio ─► VAD ─► STT ─► transcript(+ts)        ▼
                                         └──► chunk + embed ─► index
  question ─► retrieve top-k moments ─► [frames@ts + transcript] ─► VLM
                                                         └─► answer @ 31:42`,
      code: [
        {
          language: 'typescript',
          title: 'Extract scene-change keyframes and ask a VLM with timestamps',
          code: `import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = process.env.LLM_MODEL ?? 'claude-sonnet-5-5';

export function keyframes(video: string, outDir: string) {
  // select frames whose scene score > 0.3, scale to 768 px wide, log timestamps via showinfo
  // ffmpeg logs (incl. showinfo) go to stderr, so read it from spawnSync
  const log = spawnSync('ffmpeg', [
    '-i', video, '-vf', "select='gt(scene,0.3)',scale=768:-2,showinfo",
    '-fps_mode', 'vfr', outDir + '/kf_%04d.jpg',
  ], { encoding: 'utf8' }).stderr;
  const times = [...log.matchAll(/pts_time:([\\d.]+)/g)].map((m) => Number(m[1]));
  const files = readdirSync(outDir).filter((f) => f.startsWith('kf_')).sort();
  return files.map((f, i) => ({ file: outDir + '/' + f, t: times[i] ?? 0 }));
}

const mmss = (t: number) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

export async function askVideo(frames: { file: string; t: number }[], transcript: string, q: string) {
  const content: Anthropic.ContentBlockParam[] = frames.slice(0, 20).flatMap((f) => [
    { type: 'text' as const, text: '[' + mmss(f.t) + ']' }, // timestamp label before each frame
    { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const,
      data: readFileSync(f.file).toString('base64') } },
  ]);
  content.push({ type: 'text', text: 'Transcript:\\n' + transcript + '\\n\\nQuestion: ' + q +
    '\\nAnswer with mm:ss timestamps for evidence.' });
  const res = await client.messages.create({ model: MODEL, max_tokens: 500, messages: [{ role: 'user', content }] });
  return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('') || '';
}`,
        },
      ],
      prosCons: {
        pros: [
          'Keyframes + transcript capture most information at a fraction of the frame count.',
          'Timestamped answers are verifiable: users can jump to the cited moment.',
          'Index-then-ask scales to thousands of hours with constant per-question cost.',
        ],
        cons: [
          { con: 'Low sampling rates miss brief events (a 0.5 s error dialog).', fix: 'Use scene-change detection or motion-triggered sampling, and raise fps only on the relevant clip.' },
          { con: 'Native video ingestion is token-heavy for long files.', fix: 'Trim to relevant segments, lower the media resolution setting, or caption once and retrieve.' },
          { con: 'Models confuse temporal order between frames.', fix: 'Label every frame with its timestamp and keep frames in chronological order in the prompt.' },
        ],
      },
      keyPoints: [
        'Video = sampled frames + audio transcript.',
        'Choose fps by content: scene change for slides, higher fps for fast action.',
        'Label frames with timestamps and ask for timestamped evidence.',
        'For long libraries, caption and index once, then retrieve moments per question.',
      ],
      exercise: {
        prompt: `Write **frameBudget(durationSec, fps, tokensPerFrame, maxTokens)** that returns the fps to use so total frame tokens fit the budget.

Acceptance criteria:
- If durationSec × fps × tokensPerFrame ≤ maxTokens, return the requested fps.
- Otherwise return the largest fps (rounded down to 2 decimals) that fits.
- frameBudget(600, 1, 258, 100000) → 0.64; frameBudget(60, 1, 258, 100000) → 1.`,
        hints: [
          'maxFps = maxTokens / (durationSec × tokensPerFrame).',
          'Math.floor(x × 100) / 100 rounds down to 2 decimals.',
        ],
        solution: {
          language: 'typescript',
          code: `export function frameBudget(durationSec: number, fps: number, tokensPerFrame: number, maxTokens: number): number {
  const needed = durationSec * fps * tokensPerFrame;
  if (needed <= maxTokens) return fps;
  const maxFps = maxTokens / (durationSec * tokensPerFrame);
  return Math.floor(maxFps * 100) / 100;
}

console.log(frameBudget(600, 1, 258, 100_000)); // 0.64 -> ~384 frames
console.log(frameBudget(60, 1, 258, 100_000));  // 1`,
        },
        explanation: 'Frame tokens scale linearly with duration × fps, so a token budget translates directly into a maximum sampling rate. In practice you would then spend that budget non-uniformly using scene detection.',
      },
      quickCheck: {
        question: 'Users ask questions about 2-hour recorded lectures (mostly slides + speech). Which design is most cost-effective?',
        options: [
          'Send the full video at 2 fps to a native video model for every question',
          'Transcribe once, capture slide-change keyframes, index both, and retrieve relevant moments per question',
          'Send only the audio transcript and ignore visuals entirely',
        ],
        correct: 1,
        explanation: 'Lectures change visually only at slide transitions and carry most content in speech. Indexing transcript + keyframes once keeps per-question cost small while retaining slide content that transcript-only would lose.',
      },
      source: 'Google Gemini docs — Video understanding',
    },
    {
      heading: 'Voice agent frameworks — Pipecat and LiveKit Agents',
      steps: {
        actors: [
          { id: 'tin', kind: 'server', label: 'Transport in', sub: 'WebRTC · WS · phone', x: 110, y: 70 },
          { id: 'stt', kind: 'tool', label: 'VAD + STT', sub: 'processors', x: 340, y: 70 },
          { id: 'llm', kind: 'llm', label: 'LLM', sub: 'tokens as frames', x: 570, y: 70 },
          { id: 'tts', kind: 'tool', label: 'TTS', sub: 'audio frames', x: 800, y: 70 },
          { id: 'room', kind: 'server', label: 'LiveKit room', sub: 'WebRTC server', x: 110, y: 230 },
          { id: 'agent', kind: 'agent', label: 'Agent', sub: 'joins as participant', x: 340, y: 230 },
          { id: 'tout', kind: 'server', label: 'Transport out', sub: 'to the caller', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Why a framework',
            lines: [
              'A real voice agent streams audio both ways over an unreliable network.',
              'It cancels work the moment the caller speaks.',
              'And it swaps vendors without a rewrite. Pipecat and LiveKit Agents handle that plumbing.',
            ],
            script: [
              { say: 0 },
              { send: ['tin', 'stt'], label: 'audio' },
              { send: ['tts', 'tout'], label: 'audio' },
              { say: 1 },
              { badge: 'tts', text: 'cancel', tone: 'err' },
              { say: 2 },
              { badge: 'llm', text: 'swap vendor' },
            ],
          },
          {
            kind: 'watch',
            title: 'Pipecat: frames through processors',
            lines: [
              'Everything is a **frame**: audio, transcripts, LLM tokens, TTS audio, control signals.',
              'Frames flow **downstream** through a pipeline of processors.',
              'Each handles the frames it understands and passes the rest on, so you can insert your own.',
            ],
            script: [
              { say: 0 },
              { say: 1 },
              { send: ['tin', 'stt'], label: 'audio' },
              { send: ['stt', 'llm'], label: 'transcript' },
              { send: ['llm', 'tts'], label: 'tokens' },
              { send: ['tts', 'tout'], label: 'audio', tone: 'ok' },
              { say: 2 },
              { badge: 'llm', text: '+ your processor' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: the caller interrupts',
            lines: ['The user starts speaking while the bot is talking.'],
            task: {
              type: 'choose',
              question: 'What does Pipecat do?',
              options: [
                { text: 'An interruption frame tells every processor to drop queued LLM tokens and TTS audio' },
                { text: 'Finish the current reply, then listen', why: 'The bot should go quiet quickly: queued frames are dropped.' },
                { text: 'Nothing until the next turn', why: 'Interruptions are handled at once, by a frame that flushes queued work.' },
              ],
              answer: 0,
            },
            solved: 'Interruptions flush queued frames, so the bot goes quiet quickly.',
            then: [{ send: ['tin', 'stt'], label: 'user speaks', tone: 'req' }, { badge: 'tts', text: 'flushed', tone: 'err' }, { down: 'tts' }],
          },
          {
            kind: 'watch',
            title: 'LiveKit Agents: join the room',
            lines: [
              'Your agent **joins a room as a participant**, like another caller.',
              'An AgentSession wires VAD, STT, LLM and TTS plugins, or a realtime model.',
              'A turn-detection model uses the words being said, not only silence.',
              'Workers are dispatched to rooms; SIP connects phone numbers.',
            ],
            script: [
              { say: 0 },
              { send: ['agent', 'room'], label: 'joins', tone: 'ok' },
              { say: 1 },
              { lit: 'agent' },
              { say: 2 },
              { badge: 'agent', text: 'finished?' },
              { say: 3 },
              { send: ['room', 'agent'], label: 'dispatch' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: choose a framework',
            lines: ['Both are vendor-neutral on models.'],
            task: {
              type: 'choose',
              question: 'You want WebRTC infrastructure, rooms, scaling and telephony from one vendor. Lean towards…',
              options: [
                { text: 'LiveKit Agents' },
                { text: 'Pipecat', why: 'Pipecat fits full control of the chain, unusual transports and custom processors.' },
                { text: 'A managed platform', why: 'That fits teams with no voice team who accept less control.' },
              ],
              answer: 0,
            },
            solved: 'Models are swappable either way; the transport is the bigger long-term commitment.',
          },
        ],
      },
      body: `**Intuition:** the text-to-speech section showed the cascade (VAD → STT → LLM → TTS) and its latency budget. Building it for real means streaming audio both ways over an unreliable network, cancelling work the moment the caller speaks, and swapping vendors without rewriting everything. Two open-source frameworks handle that plumbing.

**Pipecat** (Python, started by Daily). Everything is a **frame** — audio chunks, transcripts, LLM tokens, TTS audio, control signals — flowing through a **pipeline of processors**:

transport input → VAD → STT → user-context aggregator → LLM → TTS → transport output → assistant-context aggregator

- Each processor handles the frames it understands and passes the rest on, so you can insert your own (a profanity filter, a metrics logger, a RAG lookup) anywhere.
- Frames normally flow **downstream**; control frames can travel **upstream** (e.g. an error).
- **Interruptions:** when the user starts speaking, an interruption frame tells every processor to drop queued LLM tokens and TTS audio, so the bot goes quiet quickly.
- Many STT, LLM, TTS and speech-to-speech services behind one interface; transports for WebRTC (Daily, LiveKit, plain WebRTC), WebSockets and telephony.
- **Pipecat Flows** adds structured conversations (states such as "verify identity → collect symptoms → book").

**LiveKit Agents** (Python and Node). Built on LiveKit's open-source WebRTC server: your agent **joins a room as a participant**, like another caller.
- An **AgentSession** wires together VAD, STT, LLM and TTS plugins — or a realtime speech-to-speech model — and an **Agent** holds instructions and tools; agents can hand off to each other.
- A **turn-detection model** that uses the words being said, not only silence, to decide whether the user has finished.
- **Workers** register with the server and are dispatched to rooms, which handles scaling many concurrent calls; **SIP** connects phone numbers.

**Choosing**

| Need | Lean towards |
|---|---|
| Full control of the processing chain, unusual transports, custom processors | Pipecat |
| WebRTC infrastructure, rooms, scaling and telephony from one vendor (self-host or cloud) | LiveKit Agents |
| No voice team; want hosted phone agents fast | a managed platform built on such stacks — accept less control |

Both are vendor-neutral on models, so the bigger long-term choices are the transport and how you evaluate calls.

**Production checklist:** measure time-to-first-audio per stage at p95, keep an STT transcript and the assistant text for every turn, run tool calls with filler speech ("let me check"), set a max call duration, and record which processor was active when a call failed.`,
      example: `**Clinic booking line, 300 calls a day.**

- *Pipecat prototype in a week:* Twilio phone audio over a WebSocket transport → Silero VAD → streaming STT → LLM with \`find_slots\` / \`book_slot\` tools → streaming TTS. A custom processor logs per-stage latency; p95 time-to-first-audio was 1.3 s, mostly LLM time-to-first-token.
- *Moved the web widget to LiveKit Agents:* the same prompt and tools, but browser callers join a LiveKit room over WebRTC (better jitter handling than WebSockets) and the semantic turn detector cut "agent spoke while I was still thinking" complaints from 9% to 3% of calls.
- The phone line stayed on Pipecat. Shared pieces: the tool functions, prompts and a call-eval set of 50 recorded scenarios replayed against both stacks before every release.`,
      code: [
        {
          language: 'python',
          title: 'Pipecat: the pipeline shape (service classes vary by vendor; check current docs)',
          code: `from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.pipeline.runner import PipelineRunner

# transport, stt, llm, tts and context_aggregator are created from your chosen services
pipeline = Pipeline([
    transport.input(),               # caller audio frames in
    stt,                             # audio -> transcription frames
    context_aggregator.user(),       # add user text to the LLM context
    llm,                             # context -> streamed text frames (and tool calls)
    tts,                             # text -> audio frames
    transport.output(),              # audio frames out to the caller
    context_aggregator.assistant(),  # record what the bot said
])

task = PipelineTask(pipeline, params=PipelineParams(allow_interruptions=True))
await PipelineRunner().run(task)`,
        },
        {
          language: 'python',
          title: 'LiveKit Agents: an AgentSession with plugins (1.x API shape; check current docs)',
          code: `from livekit import agents
from livekit.agents import Agent, AgentSession
from livekit.plugins import deepgram, openai, cartesia, silero

class Receptionist(Agent):
    def __init__(self):
        super().__init__(instructions="You book clinic appointments. Short sentences, no lists.")

async def entrypoint(ctx: agents.JobContext):
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=cartesia.TTS(),
    )
    await session.start(room=ctx.room, agent=Receptionist())
    await session.generate_reply(instructions="Greet the caller and ask how you can help.")

if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))`,
        },
      ],
      prosCons: {
        pros: [
          'Streaming, interruptions and transports come built in instead of hand-written audio plumbing.',
          'Swap STT, LLM or TTS vendors with a one-line change and compare them on the same calls.',
          'Room/worker models (LiveKit) and pluggable processors (Pipecat) scale from prototype to many concurrent calls.',
        ],
        cons: [
          { con: 'More moving parts: transports, workers and several vendors per call.', fix: 'Log per-stage latency and errors per call, keep a replayable call-eval set, and pin plugin versions.' },
          { con: 'Framework APIs change quickly.', fix: 'Keep prompts, tools and business logic in plain modules and limit framework code to the pipeline wiring.' },
          { con: 'WebSocket phone transports suffer from jitter and lost packets.', fix: 'Prefer WebRTC for browser and app clients, use the provider\'s media streaming with a jitter buffer for phone calls, and colocate services in one region.' },
        ],
      },
      keyPoints: [
        'Pipecat: Python pipeline of frame processors; interruptions flush queued frames.',
        'LiveKit Agents: agent joins a WebRTC room; AgentSession wires VAD/STT/LLM/TTS or a realtime model.',
        'Both are model-vendor neutral; the transport is the bigger commitment.',
        'Keep tools, prompts and call evals outside the framework.',
        'Measure p95 time-to-first-audio per stage.',
      ],
      exercise: {
        prompt: `Build a tiny **frame pipeline with interruptions** in TypeScript.

**Acceptance:**
- Frames are \`{ type: 'text' | 'audio' | 'interrupt', data?: string }\`.
- \`Pipeline\` has an output \`queue: Frame[]\` (audio waiting to play) and \`push(frame)\`.
- \`text\` frames become \`audio\` frames (\`data: 'tts(' + text + ')'\`) appended to the queue.
- An \`interrupt\` frame clears every queued audio frame and returns how many were dropped.
- \`play()\` removes and returns the first queued frame (or \`undefined\`).`,
        hints: [
          'Return a number from push for interrupts and undefined otherwise.',
          'Clearing the queue is just queue.length = 0 after counting.',
        ],
        solution: {
          language: 'typescript',
          code: `type Frame = { type: 'text' | 'audio' | 'interrupt'; data?: string };

export class Pipeline {
  queue: Frame[] = [];

  push(f: Frame): number | undefined {
    if (f.type === 'interrupt') {
      const dropped = this.queue.length;
      this.queue.length = 0; // the bot must stop talking now
      return dropped;
    }
    if (f.type === 'text') this.queue.push({ type: 'audio', data: 'tts(' + f.data + ')' });
    else this.queue.push(f);
    return undefined;
  }

  play() { return this.queue.shift(); }
}

const p = new Pipeline();
p.push({ type: 'text', data: 'Your appointment is on Monday.' });
p.push({ type: 'text', data: 'Would you like a reminder?' });
console.log(p.play());                        // first sentence plays
console.log(p.push({ type: 'interrupt' }));   // 1 frame dropped`,
        },
        explanation:
          'Barge-in is mostly about queues: by the time the user interrupts, several sentences of audio are usually already synthesised. Dropping them everywhere at once is what an interruption frame does in Pipecat; the next section covers fixing the conversation history afterwards.',
      },
      quickCheck: {
        question: 'In LiveKit Agents, how does the agent connect to a caller using a web browser?',
        options: [
          'It polls a REST endpoint for audio files',
          'It joins the same WebRTC room as a participant and exchanges audio tracks in real time',
          'The browser uploads a recording when the user stops talking',
          'It requires a SIP phone number for every call',
        ],
        correct: 1,
        explanation:
          'LiveKit Agents run as room participants on LiveKit\'s WebRTC server, streaming audio both ways. SIP is used to bring phone calls into a room, not for browser callers.',
      },
      source: 'Pipecat docs — Pipelines, frames and processors; LiveKit Agents docs — AgentSession, turn detection, telephony',
    },
    {
      heading: 'Turn-taking and interruptions — endpointing, backchannels and what the caller actually heard',
      short: {
        id: 'voice-agent-what-was-heard',
        title: 'What the caller actually heard',
        beats: [
          {
            type: 'claims',
            kicker: 'The agent is cut off mid-sentence',
            head: 'What did the caller *actually hear*?',
            claims: [
              {
                text: '"Your refund of $40"',
                ok: true,
                note: 'played',
              },
              {
                text: '"was approved and will arrive in 5 days"',
                ok: false,
                note: 'never played',
              },
            ],
            sub: 'History must keep only the **played** words.',
          },
          {
            type: 'toggles',
            kicker: 'While the agent speaks',
            head: 'Not every sound is a *barge-in*',
            items: [
              {
                label: '≥ 400 ms of speech or ≥ 2 words',
                keep: true,
              },
              {
                label: '"mm-hm"',
              },
              {
                label: '"yeah"',
              },
              {
                label: 'A cough',
              },
              {
                label: 'The agent\'s own voice through a speakerphone',
              },
            ],
            keepLabel: 'INTERRUPT',
            sub: 'Plus **echo cancellation**, so the agent does not interrupt itself.',
          },
          {
            type: 'flow',
            kicker: 'Endpointing',
            head: 'Has the user *finished*?',
            steps: [
              '300 ms of silence',
              'Semantic detector: does it look complete?',
              'Just asked for a policy number? Wait 1.2 s',
              'End the turn',
            ],
          },
          {
            type: 'ladder',
            kicker: 'Insurance claims line · 400 recorded calls',
            head: 'Callers cut off *mid-sentence*',
            rungs: [
              {
                label: 'Before tuning',
                amount: 14,
              },
              {
                label: 'After tuning',
                amount: 4,
              },
            ],
            unit: '% of calls',
            sub: 'False interruptions from "uh-huh": **11% → 2%**. Interruption latency stayed ~250 ms.',
          },
          {
            type: 'quiz',
            kicker: 'Your turn',
            head: 'While the agent is speaking, the caller says "mm-hm". What should it do?',
            answer: 1,
            options: [
              {
                text: 'Stop speaking immediately and wait',
                why: 'Short acknowledgements signal listening, not a wish to take the turn.',
              },
              {
                text: 'Treat it as a backchannel and keep speaking',
                why: 'A minimum speech duration or word count avoids stopping for it, while longer speech still triggers barge-in.',
              },
              {
                text: 'Restart the whole reply from the beginning',
                why: 'The caller was listening; nothing needs repeating.',
              },
            ],
          },
        ],
        takeaway: {
          head: 'History holds only *what was played*.',
          sub: 'Combine silence with a **semantic** end-of-turn signal; tune on real calls.',
        },
      },
      steps: {
        actors: [
          { id: 'user', kind: 'user', label: 'Caller', sub: 'speaks, pauses', x: 110, y: 70 },
          { id: 'vad', kind: 'tool', label: 'VAD', sub: 'silence timer', x: 340, y: 70 },
          { id: 'sem', kind: 'judge', label: 'Turn detector', sub: 'looks complete?', x: 570, y: 70 },
          { id: 'agent', kind: 'agent', label: 'Agent', sub: 'LLM + TTS', x: 800, y: 70 },
          { id: 'echo', kind: 'guard', label: 'Echo cancel', sub: 'ignores own voice', x: 340, y: 230 },
          { id: 'hist', kind: 'data', label: 'History', sub: 'words played only', x: 800, y: 230 },
        ],
        steps: [
          {
            kind: 'watch',
            title: 'Has the user finished?',
            lines: [
              'Silence-based endpointing: VAD says "no speech" for N ms.',
              'Short N (~300 ms) feels snappy but cuts off people who pause to think.',
              'Long N (~800 ms+) feels sluggish.',
            ],
            script: [
              { say: 0 },
              { send: ['user', 'vad'], label: 'speech' },
              { badge: 'vad', text: 'silence N ms' },
              { say: 1 },
              { send: ['vad', 'agent'], label: 'reply!', tone: 'err', curve: true },
              { badge: 'user', text: 'cut off', tone: 'err' },
              { say: 2 },
              { badge: 'agent', text: 'sluggish', tone: 'miss' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: finished or pausing?',
            lines: ['Transcript so far: "I\'d like to book for"', '300 ms of silence just passed.'],
            task: {
              type: 'choose',
              question: 'What should the agent do?',
              options: [
                { text: 'Wait longer: the semantic detector says it looks unfinished' },
                {
                  text: 'Reply now: 300 ms of silence ended the turn',
                  why: 'Silence alone cuts people off; combine it with a "looks complete" signal.',
                },
                { text: 'Say "are you still there?"', why: 'That rule is for long silences: prompt once, then end politely.' },
              ],
              answer: 0,
            },
            solved: 'Short silence + "looks complete" ends the turn; "looks incomplete" waits longer.',
            then: [
              { send: ['vad', 'sem'], label: 'silence' },
              { badge: 'sem', text: 'unfinished', tone: 'miss' },
              { send: ['user', 'vad'], label: 'more speech' },
            ],
          },
          {
            kind: 'watch',
            title: 'Barge-in or backchannel?',
            lines: [
              'Keep VAD and STT running while the agent speaks.',
              '"mm-hm", a cough or the agent\'s own echo is not an interruption.',
              'Require a minimum speech duration (e.g. 300–500 ms) or a couple of words, plus echo cancellation.',
              'On a real interruption: stop audio, cancel the LLM stream and queued TTS, listen.',
            ],
            script: [
              { say: 0 },
              { lit: 'vad' },
              { say: 1 },
              { send: ['user', 'vad'], label: 'mm-hm', tone: 'miss' },
              { send: ['agent', 'echo'], label: 'echo', tone: 'miss' },
              { say: 2 },
              { badge: 'vad', text: '≥ 400 ms?' },
              { say: 3 },
              { send: ['user', 'vad'], label: 'real speech', tone: 'req' },
              { down: 'agent' },
            ],
          },
          {
            kind: 'turn',
            title: 'Your turn: what was heard',
            lines: ['Planned: "Your refund of $40 was approved and will arrive in 5 days".', 'The caller cut in after: "Your refund of $40".'],
            task: {
              type: 'choose',
              question: 'What goes into the conversation history?',
              options: [
                { text: 'Only "Your refund of $40": the part actually played' },
                { text: 'The full generated reply', why: 'Then the model later believes it told the user about the 5 days.' },
                { text: 'Nothing from that turn', why: 'The caller did hear the first part; keep what was played.' },
              ],
              answer: 0,
            },
            solved: 'Cut the text at the interruption point using TTS word timestamps or bytes played.',
            then: [{ send: ['agent', 'hist'], label: 'played words', tone: 'ok' }, { badge: 'hist', text: 'refund of $40' }],
          },
          {
            kind: 'watch',
            title: 'Measure it',
            lines: [
              '**Interruption latency**: user starts speaking → agent silent; aim for a few hundred ms.',
              '**False-interruption rate** and **cut-off rate**.',
              'Tune thresholds on recordings from your real callers.',
            ],
            script: [
              { say: 0 },
              { send: ['user', 'vad'], label: 'speaks' },
              { down: 'agent' },
              { say: 1 },
              { badge: 'sem', text: 'cut-off rate' },
              { say: 2 },
              { down: 'agent', on: false },
            ],
          },
        ],
      },
      body: `**Intuition:** good human conversation has three skills: knowing when the other person has *finished* (not just paused), not stopping every time they say "mm-hm", and remembering that if you were cut off, they did not hear the rest of your sentence. Voice agents need all three in code.

**1. Endpointing — has the user finished?**
- **Silence-based:** VAD says "no speech" for N ms. Short N (~300 ms) feels snappy but cuts off people who pause to think ("my account number is… 4 4 7…"); long N (~800 ms+) feels sluggish.
- **Semantic turn detection:** a small model looks at the transcript so far — "I'd like to book for" is clearly unfinished — and extends or shortens the wait. Combine both: a short silence plus "looks complete" ends the turn; "looks incomplete" waits longer.
- **Context-aware waits:** when the agent just asked for a long number or address, allow a longer pause.

**2. Interruptions — real barge-in vs backchannel.**
- Keep VAD and STT running while the agent speaks.
- Not every sound is an interruption: "mm-hm", "yeah", a cough or the agent's own voice leaking through a speakerphone. Require a **minimum speech duration** (e.g. 300–500 ms) or a couple of transcribed words before stopping, and use **echo cancellation** so the agent does not interrupt itself.
- On a real interruption: stop audio output immediately, cancel the LLM stream and queued TTS, and listen.

**3. History truncation — keep only what was heard.** If the agent planned to say "Your refund of $40 was approved and will arrive in 5 days" but was cut off after "Your refund of $40", the conversation history must contain only the part that was **played**, not the full generated text. Otherwise the model later believes it told the user about the 5 days. Use TTS word timestamps (or bytes played) to cut the text at the interruption point.

**4. Keep the conversation alive.**
- For slow tool calls, say a short filler ("let me check that") — but only after a delay, so fast tools do not trigger it.
- If the user is silent for a long time, prompt once, then end politely.
- Let the user say "stop", "repeat" or "agent" at any point.

**Metrics to track:** time-to-first-audio (p50/p95), **interruption latency** (user starts speaking → agent silent, aim for a few hundred ms), **false-interruption rate** (agent stopped for a backchannel or noise), **cut-off rate** (agent replied while the user was mid-sentence), and task success per call.

**When to use:** every voice agent. Tune thresholds on recordings from your real callers — phone lines, accents and noise differ widely.`,
      example: `**Insurance claims line, tuning pass on 400 recorded calls.**

| Setting | Before | After |
|---|---|---|
| End of turn | 300 ms silence | 300 ms silence + semantic detector; 1.2 s after asking for a policy number |
| Interrupt trigger | any VAD speech | ≥ 400 ms of speech or ≥ 2 words, with echo cancellation |
| History on barge-in | full generated reply | words played before the interruption |

Results: callers cut off mid-sentence fell from 14% to 4% of calls; false interruptions from "uh-huh" fell from 11% to 2%; interruption latency stayed ~250 ms. One bug disappeared entirely: the agent used to say "as I mentioned, it takes 5 days" about details the caller never heard.`,
      code: [
        {
          language: 'typescript',
          title: 'Decide end of turn from silence plus a semantic "looks finished" score',
          code: `interface TurnInput {
  silenceMs: number;          // since VAD last heard speech
  transcript: string;         // current user turn so far
  expectingLongInput: boolean; // e.g. the agent asked for a policy number
  completeProb: number;       // 0..1 from a turn-detection model
}

export function endOfTurn(t: TurnInput): boolean {
  if (!t.transcript.trim()) return false;
  const base = t.expectingLongInput ? 1200 : 300;
  if (t.completeProb >= 0.8) return t.silenceMs >= base;           // sounds finished
  if (t.completeProb <= 0.3) return t.silenceMs >= base + 1500;    // clearly mid-sentence
  return t.silenceMs >= base + 500;
}

export function isRealInterruption(speechMs: number, words: number, echoSuppressed: boolean) {
  if (!echoSuppressed) return false; // could be our own voice
  return speechMs >= 400 || words >= 2;  // ignore "mm-hm" and coughs
}`,
        },
      ],
      prosCons: {
        pros: [
          'Fewer callers cut off mid-sentence, without making every reply slow.',
          'Backchannels and noise no longer stop the agent.',
          'Truncated history keeps the model consistent with what the caller really heard.',
        ],
        cons: [
          { con: 'Semantic turn detection adds a model call and can misjudge accents or languages.', fix: 'Use a small, fast detector, fall back to silence timing on low confidence, and tune thresholds per language on real recordings.' },
          { con: 'A higher interruption threshold makes the agent slower to stop for real interruptions.', fix: 'Duck (lower) the agent\'s volume as soon as speech starts and stop fully once the threshold is met.' },
          { con: 'Word timestamps are not available from every TTS provider.', fix: 'Estimate the cut point from audio bytes played and the speaking rate, or pick a TTS that returns alignment data.' },
        ],
      },
      keyPoints: [
        'Endpointing: combine silence timing with a semantic "finished?" signal.',
        'Wait longer when you asked for long input (numbers, addresses).',
        'Separate real barge-in from backchannels with duration/word thresholds and echo cancellation.',
        'After an interruption, store only the words actually played.',
        'Track interruption latency, false-interruption rate and cut-off rate.',
      ],
      exercise: {
        prompt: `Write **\`truncateToHeard(words, playedMs)\`**.

**Acceptance:**
- \`words\`: \`{ word, startMs, endMs }[]\` from TTS alignment, in order; \`playedMs\` is how much audio played before the interruption.
- Keep words whose \`endMs <= playedMs\` (fully heard). If a word was cut mid-way, drop it.
- Return the kept words joined by spaces, followed by \`'…'\` when anything was dropped; return \`''\` if nothing was heard.`,
        hints: [
          'Filter by endMs, then compare the kept count with the total.',
          'Remember the empty case before adding the ellipsis.',
        ],
        solution: {
          language: 'typescript',
          code: `type Timed = { word: string; startMs: number; endMs: number };

export function truncateToHeard(words: Timed[], playedMs: number): string {
  const heard = words.filter((w) => w.endMs <= playedMs);
  if (!heard.length) return '';
  const text = heard.map((w) => w.word).join(' ');
  return heard.length < words.length ? text + '…' : text;
}

const reply: Timed[] = [
  { word: 'Your', startMs: 0, endMs: 180 }, { word: 'refund', startMs: 180, endMs: 520 },
  { word: 'of', startMs: 520, endMs: 600 }, { word: '$40', startMs: 600, endMs: 1100 },
  { word: 'arrives', startMs: 1100, endMs: 1500 }, { word: 'in', startMs: 1500, endMs: 1600 },
  { word: '5', startMs: 1600, endMs: 1800 }, { word: 'days.', startMs: 1800, endMs: 2200 },
];
console.log(truncateToHeard(reply, 1300)); // 'Your refund of $40…'`,
        },
        explanation:
          'The history should describe the conversation the caller experienced. Storing the truncated text (with a marker) lets the model notice it was cut off and repeat the missing detail if it is still relevant, instead of assuming it was heard.',
      },
      quickCheck: {
        question: 'While the agent is speaking, the caller says "mm-hm". What should a well-tuned voice agent do?',
        options: [
          'Stop speaking immediately and wait for the caller',
          'Treat it as a backchannel and keep speaking, because it is short and not a request',
          'Restart the whole reply from the beginning',
          'End the call',
        ],
        correct: 1,
        explanation:
          'Short acknowledgements signal listening, not a wish to take the turn. A minimum speech duration or word count before interrupting (plus echo cancellation) avoids stopping for them, while longer speech still triggers barge-in.',
      },
      source: 'LiveKit docs — Turn detection and interruptions; Pipecat docs — Interruptions and user turn strategies',
    },
  ],
  codeChallenges: [
    {
      id: 'audio-video-cc-1',
      title: 'Meeting transcriber that splits words and blows the upload limit',
      context: 'A service splits every recording into fixed 10-minute WAV pieces (16-bit, 44.1 kHz stereo) and sends each to the transcription API, then concatenates the text. Uploads fail with 413 errors and transcripts have garbled words at every boundary.',
      task: 'Normalise and compress audio, cut on silences with overlap, retry transient failures, and de-duplicate overlapping text.',
      starter: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const openai = new OpenAI();

export async function transcribe(path: string) {
  // fixed 600 s pieces, original format (~100 MB each)
  execFileSync('ffmpeg', ['-i', path, '-f', 'segment', '-segment_time', '600', 'part_%03d.wav']);
  const parts = fs.readdirSync('.').filter((f) => f.startsWith('part_'));
  let text = '';
  for (const p of parts) {
    const r = await openai.audio.transcriptions.create({ file: fs.createReadStream(p), model: 'whisper-1' });
    text += r.text;
  }
  return text;
}`,
      },
      hints: [
        'Re-encode to mono 16 kHz Opus at ~32 kbps: 10 minutes ≈ 2.4 MB.',
        'Use ffmpeg silencedetect to find pauses and choose cut points near the target length.',
        'Wrap each API call in retry with exponential backoff for 429/5xx.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const openai = new OpenAI();
const STT_MODEL = process.env.STT_MODEL ?? 'gpt-4o-transcribe';
const TARGET_S = 300;

function silences(path: string): number[] {
  const log = spawnSync('ffmpeg', ['-i', path, '-af', 'silencedetect=n=-35dB:d=0.5', '-f', 'null', '-'],
    { encoding: 'utf8' }).stderr; // silencedetect logs to stderr
  // midpoint of each silence is a safe cut point
  const starts = [...log.matchAll(/silence_start: ([\\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => (s + (ends[i] ?? s)) / 2);
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let a = 0; ; a++) {
    try { return await fn(); } catch (e: any) {
      if (a >= tries - 1 || ![429, 500, 502, 503].includes(e?.status)) throw e;
      await new Promise((r) => setTimeout(r, 500 * 2 ** a + Math.random() * 200));
    }
  }
}

export async function transcribe(path: string, durationS: number) {
  const cuts: number[] = [];
  let last = 0;
  for (const c of silences(path)) if (c - last >= TARGET_S) { cuts.push(c); last = c; }
  const bounds = [0, ...cuts, durationS];
  const texts: string[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const out = 'chunk_' + i + '.ogg';
    // mono, 16 kHz, Opus 32 kbps: ~2.4 MB per 10 min, well under the 25 MB cap
    execFileSync('ffmpeg', ['-y', '-ss', String(bounds[i]), '-to', String(bounds[i + 1]), '-i', path,
      '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '32k', out]);
    const prev = texts[i - 1]?.slice(-200) ?? '';
    const r = await withRetry(() => openai.audio.transcriptions.create({
      file: fs.createReadStream(out), model: STT_MODEL, prompt: prev, // context across the cut
    }));
    texts.push(r.text.trim());
  }
  return texts.join(' ');
}`,
      },
      explanation: 'Compressing to mono 16 kHz Opus removes the 413 errors (ASR does not need 44.1 kHz stereo). Cutting at detected silences instead of fixed times stops words being split, and passing the tail of the previous chunk as the prompt keeps spelling and context consistent. Retries with jittered backoff absorb rate limits.',
      followUps: [
        { q: 'Why not overlap chunks here?', a: 'Cuts land in silences, so no word straddles a boundary; overlap is mainly needed when you must cut inside continuous speech, and then you de-duplicate by timestamps.' },
        { q: 'How would you make this faster for a 3-hour recording?', a: 'Transcribe chunks concurrently (e.g. 4–8 at a time within rate limits), accepting that the previous-chunk prompt is unavailable, and rely on a vocabulary prompt instead.' },
      ],
    },
    {
      id: 'audio-video-cc-2',
      title: 'Voice agent that cannot be interrupted',
      context: 'A phone agent synthesises the entire LLM reply, then plays it. Callers who interrupt are ignored for up to 15 seconds, and average response latency is 4 s.',
      task: 'Stream the LLM into sentence-level TTS, and cancel both LLM and playback when the caller starts speaking (barge-in).',
      starter: {
        language: 'typescript',
        code: `export async function onUserTurn(text: string, call: { play(buf: Buffer): Promise<void> }) {
  const reply = await llm.complete(text);   // waits for the whole answer
  const audio = await tts.synthesize(reply); // waits for all audio
  await call.play(audio);                     // cannot be stopped
}`,
      },
      hints: [
        'Use an AbortController shared by the LLM stream and the playback loop.',
        'Subscribe to VAD speech-start events during playback and abort on them.',
        'Queue sentence audio and play sequentially, checking the abort signal between chunks.',
      ],
      solution: {
        language: 'typescript',
        code: `import OpenAI from 'openai';

const openai = new OpenAI();
const LLM = process.env.LLM_MODEL ?? 'gpt-5-mini';
const TTS = process.env.TTS_MODEL ?? 'gpt-4o-mini-tts';

type Call = {
  play(buf: Buffer, signal: AbortSignal): Promise<void>;
  onSpeechStart(cb: () => void): () => void; // returns unsubscribe
};

export async function onUserTurn(text: string, call: Call) {
  const ac = new AbortController();
  const unsubscribe = call.onSpeechStart(() => ac.abort()); // barge-in
  const queue: Promise<Buffer>[] = [];
  const synth = (s: string) => openai.audio.speech
    .create({ model: TTS, voice: 'alloy', input: s, response_format: 'mp3' }, { signal: ac.signal })
    .then(async (r) => Buffer.from(await r.arrayBuffer()));

  let done = false;
  const player = (async () => {
    for (let i = 0; ; i++) {
      while (!queue[i]) { if (ac.signal.aborted || done) return; await new Promise((r) => setTimeout(r, 20)); }
      if (ac.signal.aborted) return;
      await call.play(await queue[i], ac.signal); // play() must stop when signal aborts
    }
  })();

  try {
    const stream = await openai.chat.completions.create(
      { model: LLM, stream: true, messages: [{ role: 'user', content: text }] },
      { signal: ac.signal },
    );
    let buf = '';
    for await (const c of stream) {
      buf += c.choices[0]?.delta?.content ?? '';
      const m = buf.match(/^(.+?[.!?])\\s+(.*)$/s);
      if (m) { queue.push(synth(m[1])); buf = m[2]; }
    }
    if (buf.trim()) queue.push(synth(buf.trim()));
  } catch (e) {
    if (!ac.signal.aborted) throw e; // aborts are expected on barge-in
  } finally {
    done = true;
    await player.catch(() => undefined);
    unsubscribe();
  }
}`,
      },
      explanation: 'Sentence-level streaming starts playback after the first sentence (latency drops from seconds to ~1 s). A single AbortController ties together the LLM stream, in-flight TTS requests and playback, so when VAD detects caller speech everything stops immediately and the new user turn can begin.',
      followUps: [
        { q: 'How do you avoid false barge-ins from background noise or the agent\'s own echo?', a: 'Use echo cancellation on the call leg, require ~200–300 ms of continuous speech before aborting, and optionally a quick transcript check that the interruption contains words.' },
        { q: 'What should the conversation history contain after a barge-in?', a: 'Only the part of the reply that was actually played, so the LLM does not believe the user heard sentences that were cancelled.' },
      ],
    },
  ],
  interviewQuestions: [
    {
      id: 'audio-video-iq-01',
      difficulty: 'hard',
      question: 'Design a voice agent for a pharmacy phone line that books refills. Target under 1 second to first audio.',
      whatInterviewerLooksFor: [
        'Chooses between cascade and speech-to-speech with reasons',
        'Explicit per-stage latency budget',
        'Barge-in, turn detection and filler strategies',
        'Safety: identity verification, confirmation of critical entities, escalation',
      ],
      modelAnswer: `**Architecture.** Telephony (SIP/WebRTC) → streaming VAD + STT → LLM with tools (lookupPatient, listPrescriptions, bookRefill) → streaming TTS → caller. I would choose a **cascade** because pharmacy needs text transcripts for audit, text guardrails and deterministic confirmation of drug names; a speech-to-speech model is an option for small-talk turns later.

**Latency budget (p50).**
| Stage | Target |
|---|---|
| End-of-turn | 250 ms (VAD + semantic turn detector) |
| Streaming STT final | 150 ms |
| LLM TTFT | 350 ms (cached system prompt, small model, short history) |
| TTS first byte | 150 ms (first sentence only) |
| Network | 80 ms |
≈ 980 ms. Tool calls that take >700 ms trigger a filler: "Let me pull that up."

**Conversation mechanics.** Barge-in cancels LLM + TTS; history records only played audio. Vocabulary prompts with the formulary improve drug-name recognition.

**Safety.** Verify identity (DOB + postcode) before any lookup; read back the drug name and dose and require an explicit "yes"; never give clinical advice — escalate to a pharmacist on medical questions or low STT confidence; log transcripts with PHI controls.

**Evaluation.** Simulated callers with varied accents and noise; measure task success, entity accuracy on drug names, p95 latency and escalation rate.`,
      followUps: [
        { q: 'STT keeps mishearing "Lisinopril". What do you do?', a: 'Add formulary terms to the STT prompt, fuzzy-match recognised names against the patient\'s actual prescriptions, and confirm by reading back the matched name.' },
        { q: 'When would you switch to a speech-to-speech model?', a: 'When latency or naturalness is the bottleneck and you can still capture transcripts and enforce tool-level authorisation, e.g. for scheduling flows without clinical content.' },
      ],
      pitfalls: [
        'No latency budget per stage',
        'Letting the LLM decide identity verification on its own',
        'Ignoring barge-in and echo',
      ],
    },
    {
      id: 'audio-video-iq-02',
      difficulty: 'medium',
      question: 'Your call-centre transcription WER is 7% overall but 22% on one region. How do you investigate and improve it?',
      whatInterviewerLooksFor: [
        'Segments the evaluation (channel, accent, noise, vocabulary)',
        'Checks audio pipeline issues before blaming the model',
        'Uses prompts, adaptation or a different model per segment',
        'Measures entity accuracy, not just WER',
      ],
      modelAnswer: `**1. Reproduce with labelled data.** Sample 100 calls from that region with human transcripts; compute WER broken into S/D/I. High deletions suggest clipped or quiet audio; high substitutions suggest accent or vocabulary.

**2. Check the audio path first.** That region may route through a different telephony provider: 8 kHz narrowband, aggressive codec, mono mixing of both speakers, or loudness far below others. Fixes: request higher-quality codecs, record stereo (agent and customer channels), loudness-normalise, VAD padding tuned for that audio.

**3. Vocabulary.** Regional place names, product names and local terms → add to the STT prompt or a custom vocabulary/boost list.

**4. Model choice.** Evaluate alternative models or language/locale settings on the same segment; some providers support regional English variants or fine-tuning.

**5. Post-processing.** Normalise numbers and spellings; fuzzy-match entities against CRM records.

**6. Monitor.** Report WER and entity error per region weekly; alert on regressions. Ensure the eval normalises text so formatting differences are not counted.`,
      followUps: [
        { q: 'How do you get references cheaply?', a: 'Have humans correct model transcripts for a stratified sample rather than transcribing from scratch, and double-check a subset to estimate annotator error.' },
        { q: 'Would fine-tuning Whisper help?', a: 'Possibly for strong accents or domain vocabulary, with tens of hours of in-domain labelled audio, but fix audio quality and prompting first because they are cheaper.' },
      ],
      pitfalls: [
        'Comparing WER without normalising text',
        'Assuming the model is at fault without inspecting audio quality',
      ],
    },
    {
      id: 'audio-video-iq-03',
      difficulty: 'hard',
      question: 'Build "ask questions about our 10,000 hours of recorded meetings". Walk through ingestion, indexing and answering.',
      whatInterviewerLooksFor: [
        'Offline pipeline: VAD, STT, diarisation, keyframes',
        'Chunking transcripts by time and speaker with metadata',
        'Retrieval with ACLs and timestamp citations',
        'Cost estimation and incremental processing',
      ],
      modelAnswer: `**Ingestion (batch, queued).** For each recording: ffmpeg → mono 16 kHz; VAD; STT with word timestamps; diarisation mapped to participant names from the calendar invite; keyframes on screen-share scene changes, captioned once by a VLM.

**Chunking.** Group transcript into ~60–90 s windows aligned to speaker turns, each with {meeting_id, start, end, speakers, title, date, ACL from the calendar}. Add keyframe captions as separate chunks with timestamps.

**Indexing.** Hybrid (BM25 + dense embeddings) with metadata filters; ACLs enforced as a pre-filter (only meetings the asker attended or was shared).

**Answering.** Retrieve top 20, rerank to 6, prompt with chunks labelled [meeting, mm:ss, speaker], require citations; UI deep-links to the timestamp in the recording.

**Cost.** 10,000 h × illustrative $0.006/min STT ≈ $3,600 one-off; VAD cuts ~25%. Captioning keyframes ~50 per hour × 10k h = 500k images × ~1k tokens ≈ 500M tokens — batch it.

**Ops.** New meetings processed within ~15 minutes; deletion requests remove audio, transcript chunks and embeddings; PII redaction on transcripts if policy requires.`,
      followUps: [
        { q: 'How do you answer "what did we decide about pricing last quarter" across many meetings?', a: 'Retrieve across meetings with a date filter, generate per-meeting summaries of decisions, then synthesise a timeline with citations to each meeting and timestamp.' },
        { q: 'How do you handle speaker names?', a: 'Map diarised clusters to attendees using enrolled voice embeddings or calendar join order, and mark uncertain mappings rather than guessing.' },
      ],
      pitfalls: [
        'Ignoring access control on meeting content',
        'Sending raw video to a model per question',
        'No timestamps in citations',
      ],
    },
    {
      id: 'audio-video-iq-04',
      difficulty: 'expert',
      question: 'Your Whisper-based transcripts occasionally contain fluent sentences that nobody said, such as "Thanks for watching!". Explain why and how you would eliminate them.',
      whatInterviewerLooksFor: [
        'Understands seq2seq decoder hallucination on non-speech',
        'Links it to training data (subtitled web video)',
        'Practical mitigations: VAD, thresholds, temperature fallback, repetition checks',
        'A way to measure hallucination rate',
      ],
      modelAnswer: `**Why.** Whisper is an encoder–decoder language model trained on large amounts of web audio with subtitles. When a 30 s window contains silence, music or noise, the decoder still has to emit something and falls back on its language prior — typical subtitle boilerplate ("Thanks for watching!", "Subtitles by…"). Repetition loops happen when the decoder conditions on its own previous text.

**Mitigations.**
1. **VAD gating** so non-speech never reaches the model — the biggest single fix.
2. **Confidence filters:** discard segments with low average log-probability, high no-speech probability or a high compression ratio (a repetition signal), as exposed in verbose outputs of open-source Whisper.
3. **Decoding settings:** temperature fallback only when thresholds fail; disable conditioning on previous text for noisy audio.
4. **Blocklist post-filter** for known boilerplate phrases, applied only when the segment is low-confidence.
5. Consider newer transcription models with lower hallucination rates for production.

**Measure.** Build a test set with silence, music, hold tones and crosstalk; count inserted words per minute of non-speech (an insertion-rate metric), and track I in WER on real data.`,
      followUps: [
        { q: 'Why is a high compression ratio a useful signal?', a: 'Repetitive hallucinated text compresses extremely well with gzip, so an unusually high ratio of raw-to-compressed length flags loops like the same phrase repeated many times.' },
        { q: 'Why can conditioning on previous text make it worse?', a: 'If one segment hallucinates, the next window is primed with that text and the decoder may continue or repeat it, propagating errors across the transcript.' },
      ],
      pitfalls: [
        'Assuming a bigger model removes hallucination',
        'Filtering phrases without considering confidence, deleting real speech',
      ],
    },
    {
      id: 'audio-video-iq-05',
      difficulty: 'medium',
      question: 'A product team wants AI-generated narration for 2,000 training videos in 6 languages. What do you plan for?',
      whatInterviewerLooksFor: [
        'Text preparation and pronunciation control',
        'Voice selection, consistency and consent',
        'Throughput, caching and cost',
        'Quality review and accessibility',
      ],
      modelAnswer: `**Script prep.** Translate scripts with an LLM plus human review; normalise numbers, units and acronyms per language; keep a pronunciation lexicon (product names, SSML or instructions where supported).

**Voice.** Pick one licensed voice per language with a consistent style instruction ("clear, friendly, moderate pace"). If cloning a presenter's voice, get written consent, restrict use, and disclose AI narration.

**Pipeline.** Batch job per paragraph (keeps prosody natural and makes re-generation cheap); cache by hash(text, voice, settings) so edits only re-render changed paragraphs; loudness-normalise and stitch with ffmpeg; align with video via subtitles timing.

**Cost.** 2,000 videos × ~1,200 words × 6 languages ≈ 14.4M words ≈ ~86M characters; at an illustrative $15 per 1M characters ≈ $1,300 — dominated by review time, not TTS.

**Quality.** Native-speaker spot checks of ~5% per language, automated checks with STT round-trip (TTS → STT → compare to script, flag WER > 5%), and subtitles for accessibility.`,
      followUps: [
        { q: 'How does the STT round-trip check work?', a: 'Transcribe the generated audio and compute WER against the script; high error usually reveals mispronunciations, skipped words or truncated audio worth re-rendering.' },
        { q: 'Why render per paragraph rather than per video?', a: 'Paragraph-level files allow cheap partial re-renders, parallelism and isolation of failures, and avoid long-input prosody drift.' },
      ],
      pitfalls: [
        'Cloning voices without consent',
        'Re-rendering entire videos for one typo',
      ],
    },
    {
      id: 'audio-video-iq-06',
      difficulty: 'hard',
      question: 'Callers say your voice agent "talks over me" and "keeps going when I try to stop it", and transcripts show it later refers to details the caller never heard. Diagnose and fix it, and say whether you would build on Pipecat or LiveKit Agents.',
      context: 'Cascade agent (VAD → STT → LLM → TTS) on phone lines and a web widget; 300 ms silence endpointing; any detected speech is ignored while the agent talks.',
      whatInterviewerLooksFor: [
        'Separates endpointing problems from barge-in problems',
        'Semantic turn detection and context-aware waits',
        'Barge-in with backchannel filtering and echo cancellation',
        'Truncating history to the words actually played; metrics; a reasoned framework choice',
      ],
      modelAnswer: `**Three separate bugs.**

1. **"Talks over me"** = endpointing too eager. 300 ms of silence ends the turn while people pause mid-sentence. Fix: combine silence with a **semantic turn detector** on the transcript, and use longer waits after asking for numbers or addresses. Measure the **cut-off rate** on recorded calls before and after.

2. **"Keeps going when I try to stop it"** = no barge-in. Keep VAD/STT running during playback; on speech of ≥ ~400 ms or ≥ 2 words (so "mm-hm" and coughs do not count), stop audio, cancel the LLM stream and flush queued TTS. Add **echo cancellation** so the agent's own voice on speakerphones does not trigger it. Track **interruption latency** and **false-interruption rate**.

3. **"Refers to things I never heard"** = history stores the full generated reply. After an interruption, store only the words played (TTS word timestamps or bytes played) with a cut-off marker.

**Framework.** Both handle this plumbing. **Pipecat** gives a processor pipeline where interruptions flush queued frames everywhere and lets me insert custom processors (metrics, filters) — good for the phone line over a telephony WebSocket. **LiveKit Agents** gives WebRTC rooms, worker dispatch, SIP and a built-in semantic turn detector — attractive for the web widget and if we want one vendor for transport. I would keep tools, prompts and a 50-call replay eval set outside either framework and pick per channel after a one-week spike comparing p95 time-to-first-audio and the three rates above.`,
      followUps: [
        { q: 'How do you test turn-taking changes safely?', a: 'Replay recorded caller audio (with consent) through the pipeline offline, measure cut-off, false-interruption and latency metrics, then roll out to a small share of live calls and compare task success.' },
        { q: 'What if the TTS provider gives no word timestamps?', a: 'Estimate the cut point from the duration of audio actually played and the average speaking rate, cut at the last whole word, and mark the text as interrupted.' },
      ],
      pitfalls: [
        'Only lengthening the silence timeout, making every reply slow',
        'Stopping on any sound, including backchannels and echo',
        'Leaving the full unplayed reply in the conversation history',
        'Choosing a framework before defining the metrics',
      ],
    },
  ],
  envelopeQuestions: [
    {
      id: 'audio-video-est-1',
      question: 'Daily STT cost and storage for a contact centre with 3,000 agents.',
      assumptions: [
        'Each agent handles 5 hours of calls/day; 70% of call time is speech after VAD',
        'Illustrative STT price $0.006 per audio minute',
        'Audio stored as mono 16 kHz Opus 32 kbps for 90 days',
      ],
      steps: [
        { label: 'Raw audio minutes/day', calc: '3,000 × 5 h × 60 = 900,000 min' },
        { label: 'After VAD', calc: '900,000 × 0.7 = 630,000 min' },
        { label: 'STT cost/day', calc: '630,000 × $0.006 = $3,780' },
        { label: 'Storage/day', calc: '32 kbps = 4 KB/s → 240 KB/min × 900,000 ≈ 216 GB' },
        { label: '90-day retention', calc: '216 GB × 90 ≈ 19.4 TB' },
      ],
      answer: '≈ $3.8k/day (~$113k/month) STT and ~19 TB of audio at 90-day retention.',
      insight: 'VAD saves ~$1.6k/day here; codec choice decides storage (WAV at 16 kHz would be 8× larger, ~155 TB).',
      followUps: [
        { q: 'What if you only transcribe 20% of calls for QA sampling?', a: 'STT falls to about $756/day, but real-time agent assist and full-text search would no longer be possible for the other 80% of calls.' },
      ],
    },
    {
      id: 'audio-video-est-2',
      question: 'Tokens and cost to answer one question about a 30-minute video with a native video model versus index-then-ask.',
      assumptions: [
        'Native: 1 fps at ~258 tokens/frame plus ~32 audio tokens/s',
        'Index-then-ask: retrieve 6 keyframes (~1,000 tokens each at the chosen resolution) + 2k tokens of transcript',
        'Illustrative input price $1.25 per 1M tokens',
      ],
      steps: [
        { label: 'Native frames', calc: '1,800 s × 258 = 464,400 tokens' },
        { label: 'Native audio', calc: '1,800 × 32 = 57,600 tokens' },
        { label: 'Native total & cost', calc: '≈ 522k tokens × $1.25/1M ≈ $0.65 per question' },
        { label: 'Index-then-ask tokens', calc: '6 × 1,000 + 2,000 = 8,000 tokens' },
        { label: 'Index-then-ask cost', calc: '8k × $1.25/1M = $0.01 per question' },
      ],
      answer: '~522k tokens ($0.65) vs ~8k tokens ($0.01) per question — about 65× cheaper.',
      insight: 'Native ingestion suits one-off deep analysis of a single video; repeated Q&A over a library needs a one-time index and retrieval of moments.',
      followUps: [
        { q: 'When does native ingestion still win?', a: 'For questions about continuous motion or order of events across the whole video, e.g. counting how many times something happens, where sparse keyframes would miss evidence.' },
      ],
    },
  ],
  test: [
    {
      id: 'audio-video-mcq-01',
      difficulty: 'medium',
      question: 'Reference "book a table for four at seven" vs hypothesis "book table for for at seven tonight". What is the WER?',
      options: ['2/7 ≈ 28.6%', '3/7 ≈ 42.9%', '3/8 = 37.5%', '1/7 ≈ 14.3%'],
      correct: [1],
      explanation: 'Reference has 7 words. "a" deleted (D=1), "four"→"for" (S=1), "tonight" inserted (I=1): 3/7. Dividing by hypothesis length (8) is a common mistake; WER always divides by reference length.',
      followUps: [{ q: 'Can WER exceed 100%?', a: 'Yes, because insertions are unbounded: a hypothesis with many extra words can have more edits than the reference has words.' }],
    },
    {
      id: 'audio-video-mcq-02',
      difficulty: 'hard',
      question: 'Which preprocessing steps typically reduce both cost and errors before sending long recordings to an STT API? Select ALL that apply.',
      options: [
        'Voice activity detection to drop silence and music',
        'Downmix to mono and resample to 16 kHz',
        'Upsample phone audio from 8 kHz to 48 kHz to add detail',
        'Cut chunks at detected pauses rather than fixed intervals',
      ],
      correct: [0, 1, 3],
      explanation: 'VAD removes billable non-speech and hallucination triggers; mono 16 kHz matches model input and shrinks files; silence-aligned cuts avoid split words. Upsampling cannot recover frequencies that were never recorded and only grows files.',
      followUps: [{ q: 'When should you keep stereo?', a: 'When each channel carries a different speaker (agent vs customer); transcribe channels separately to get free, accurate speaker separation.' }],
    },
    {
      id: 'audio-video-mcq-03',
      difficulty: 'hard',
      question: 'This voice pipeline averages 3.9 s to first audio. Which line is the main culprit?',
      code: {
        language: 'typescript',
        code: `const transcript = await stt.transcribeFinal(audio);       // 180 ms
const reply = await llm.chat({ messages, stream: false });  // 2,900 ms
const speech = await tts.synthesize(reply.text);            // 650 ms
await call.play(speech);`,
      },
      options: [
        'stt.transcribeFinal — it should run on the full call',
        'llm.chat with stream:false — waiting for the whole reply instead of streaming sentences to TTS',
        'call.play — playback should be parallelised',
        'tts.synthesize — the voice is too high quality',
      ],
      correct: [1],
      explanation: 'The non-streaming LLM call waits ~2.9 s for the full answer. Streaming tokens and sending the first sentence to TTS brings first audio near TTFT + TTS first byte (~0.5 s). TTS time also shrinks once it only synthesises one sentence.',
      followUps: [{ q: 'After streaming, what is the next biggest lever?', a: 'Reducing LLM time-to-first-token: cache the system prompt, trim history, choose a faster model, and colocate services to cut network hops.' }],
    },
    {
      id: 'audio-video-mcq-04',
      difficulty: 'medium',
      question: 'What is speaker diarisation?',
      options: [
        'Determining who spoke when by clustering speaker embeddings over time',
        'Translating speech into another language',
        'Removing background noise from audio',
        'Identifying a speaker\'s legal identity from their voice',
      ],
      correct: [0],
      explanation: 'Diarisation segments audio and groups segments by speaker (A, B, C) without knowing who they are. Mapping clusters to identities needs extra information such as enrolled voice samples or calendar data.',
      followUps: [{ q: 'Why diarise before chunking?', a: 'Cluster labels are only consistent within one run; diarising chunks separately produces unrelated A/B labels per chunk.' }],
    },
    {
      id: 'audio-video-mcq-05',
      difficulty: 'expert',
      question: 'Which signals help detect hallucinated segments in Whisper-style transcription output? Select ALL that apply.',
      options: [
        'High no-speech probability for the segment',
        'Very low average token log-probability',
        'Unusually high text compression ratio (repetition)',
        'The segment contains proper nouns',
      ],
      correct: [0, 1, 2],
      explanation: 'No-speech probability, low log-prob and high compression ratio are the classic thresholds used in open-source Whisper decoding to trigger fallbacks or drop segments. Proper nouns are normal speech content and not evidence of hallucination.',
      followUps: [{ q: 'What should you do with a flagged segment?', a: 'Re-decode with temperature fallback or a different model, and if still suspicious drop it or mark it as low-confidence rather than presenting it as fact.' }],
    },
    {
      id: 'audio-video-mcq-06',
      difficulty: 'hard',
      question: 'A 25-minute meeting recorded as 16-bit 48 kHz stereo WAV fails to upload to a transcription endpoint with a 25 MB cap. What is the best fix?',
      options: [
        'Re-encode to mono 16 kHz Opus/MP3 at ~32–64 kbps (≈6–12 MB) and/or split on silences',
        'Upload with a longer HTTP timeout',
        'Convert to 24-bit WAV for better accuracy',
        'Send the file as base64 inside a chat message',
      ],
      correct: [0],
      explanation: '25 min of 48 kHz stereo 16-bit WAV is ~288 MB. Mono 16 kHz compressed audio retains everything ASR needs at a fraction of the size. Timeouts and bit depth do not change the cap; base64 inflates size by ~33%.',
      followUps: [{ q: 'Roughly how big is 25 minutes at 32 kbps?', a: '32 kbps = 4 KB/s, so 1,500 s ≈ 6 MB, comfortably under the 25 MB limit.' }],
    },
    {
      id: 'audio-video-mcq-07',
      difficulty: 'hard',
      question: 'A voice agent adds a 1.2 s CRM lookup to its turn budget. What does this latency calculation log?',
      code: {
        language: 'typescript',
        code: `const budget = { turn: 300, stt: 150, llmTtft: 400, ttsFirstByte: 150, net: 80 };
const total = Object.values(budget).reduce((a, b) => a + b, 0);
const withTool = total + 1200; // a CRM lookup before answering
console.log(total, withTool, withTool > 1000 ? 'add filler' : 'ok');`,
      },
      options: ['1080 2280 add filler', '1080 2280 ok', '980 2180 add filler', '1180 2380 add filler'],
      correct: [0],
      explanation: '300 + 150 + 400 + 150 + 80 = 1,080 ms; plus 1,200 ms = 2,280 ms, above 1 s, so the agent should speak a filler ("Let me check that…") while the tool runs.',
      followUps: [{ q: 'Besides fillers, how else can you hide tool latency?', a: 'Prefetch likely data (e.g. customer record at call start using caller ID) and run independent tool calls in parallel.' }],
    },
    {
      id: 'audio-video-mcq-08',
      difficulty: 'medium',
      question: 'Why do many voice agents chunk LLM output by sentence before sending it to TTS?',
      options: [
        'TTS can start speaking after the first sentence, cutting time-to-first-audio',
        'TTS models cannot pronounce more than one sentence',
        'It reduces the total number of LLM tokens',
        'It is required by the Realtime API',
      ],
      correct: [0],
      explanation: 'Sentence-sized chunks allow synthesis and playback to overlap with generation, while still giving TTS enough context for natural prosody. Token count and API requirements are unaffected.',
      followUps: [{ q: 'Why not stream TTS word by word?', a: 'Single words lack prosodic context, sounding robotic, and create many tiny requests; sentences or clauses balance naturalness and latency.' }],
    },
    {
      id: 'audio-video-mcq-09',
      difficulty: 'expert',
      question: 'For a voice agent handling bank transfers, which design choices favour a cascade (STT → LLM → TTS) over a speech-to-speech model? Select ALL that apply.',
      options: [
        'Need for a text transcript to audit and apply text guardrails',
        'Need to read back and confirm exact amounts deterministically',
        'Desire to preserve the caller\'s emotional tone end-to-end',
        'Ability to swap STT vendors per language',
      ],
      correct: [0, 1, 3],
      explanation: 'Cascades expose text at every hop, enabling audits, guardrails, deterministic confirmations and vendor swaps. Preserving tone and the lowest latency are strengths of speech-to-speech models, so that option favours the other design.',
      followUps: [{ q: 'Can you get transcripts from a speech-to-speech model?', a: 'Usually yes, via parallel input/output transcription events, but guardrails then act after the fact rather than before speech is produced.' }],
    },
    {
      id: 'audio-video-mcq-10',
      difficulty: 'hard',
      question: 'You need answers about a 2-hour screen-recorded training session where slides change roughly every 3 minutes. Which frame strategy is best?',
      options: [
        'Scene-change detection to grab one frame per slide, plus the transcript',
        'Fixed 2 fps sampling of the whole video',
        'Only the first and last frame',
        'Audio only; slides are redundant',
      ],
      correct: [0],
      explanation: 'About 40 slide changes means ~40 informative frames; scene detection captures each once. 2 fps would produce 14,400 near-duplicate frames; first/last or audio-only miss slide content such as diagrams and tables.',
      followUps: [{ q: 'What scene threshold problem might you hit with screen recordings?', a: 'Mouse movement or small animations can trigger false changes, while subtle slide transitions may fall below the threshold, so tune it and de-duplicate near-identical frames by perceptual hash.' }],
    },
    {
      id: 'audio-video-mcq-11',
      difficulty: 'expert',
      question: 'Which of these make the WER of two systems comparable and meaningful? Select ALL that apply.',
      code: {
        language: 'python',
        code: `ref = "Your balance is $1,250.50."
hyp = "your balance is one thousand two hundred fifty dollars and fifty cents"`,
      },
      options: [
        'Applying the same text normalisation (case, punctuation, number formats) to both systems',
        'Scoring on the same audio set, stratified by channel and accent',
        'Reporting entity accuracy (amounts) alongside WER',
        'Dividing errors by hypothesis length so verbose systems are not penalised',
      ],
      correct: [0, 1, 2],
      explanation: 'Without normalisation the example scores many errors despite being correct. Same data and stratification keep comparisons fair, and entity accuracy captures business-critical errors. WER divides by reference length by definition.',
      followUps: [{ q: 'How would you normalise numbers in this example?', a: 'Use a shared normaliser (like Whisper\'s English text normaliser) to convert spoken numbers and currency into a canonical form on both sides before alignment.' }],
    },
    {
      id: 'audio-video-mcq-12',
      difficulty: 'hard',
      question: 'Your diarised meeting transcript labels the CEO as "Speaker B" in chunk 1 and "Speaker A" in chunk 2. What is the root cause?',
      code: {
        language: 'text',
        code: `for chunk in chunks:            # 10-minute chunks
    words = stt(chunk)
    speakers = diarize(chunk)     # clusters computed per chunk
    merge(words, speakers)`,
      },
      options: [
        'Diarisation clusters are computed independently per chunk, so labels are not consistent across chunks',
        'STT word timestamps are in milliseconds instead of seconds',
        'The CEO changed microphones',
        'Diarisation requires stereo audio',
      ],
      correct: [0],
      explanation: 'Cluster ids are arbitrary within each run. Diarise the whole recording once, or match clusters across chunks with speaker embeddings or enrolled reference voices. Timestamp units would misalign words, not swap labels.',
      followUps: [{ q: 'How do you map clusters to real names?', a: 'Compare cluster embeddings to enrolled voiceprints, or use known join order and calendar attendees, keeping a confidence score and leaving uncertain ones as generic labels.' }],
    },
    {
      id: 'audio-video-mcq-13',
      difficulty: 'medium',
      question: 'Your voice agent cuts callers off while they read out a 16-digit account number. Which change targets the cause with the least added latency elsewhere?',
      options: [
        'Raise the silence timeout to 2 seconds for every turn',
        'Use a longer end-of-turn wait only when the agent has just asked for long input, plus a semantic turn detector',
        'Switch to a higher-quality TTS voice',
        'Disable VAD and wait for the caller to press #',
      ],
      correct: [1],
      explanation:
        'Pauses while reading numbers are expected after a specific prompt. Context-aware waits and a semantic "is this finished?" signal fix those turns without slowing every reply, as a global 2-second timeout would.',
      followUps: [{ q: 'Which metric shows whether the fix worked?', a: 'The cut-off rate: the share of turns where the agent started speaking while the caller was still mid-utterance, measured on recorded calls before and after.' }],
    },
    {
      id: 'audio-video-mcq-14',
      difficulty: 'hard',
      question: 'The caller genuinely interrupts the agent mid-reply. Which actions should the pipeline take? Select ALL that apply.',
      options: [
        'Stop audio playback and flush queued TTS audio',
        'Cancel the in-progress LLM stream',
        'Store the full generated reply in history so the model remembers its plan',
        'Store only the words that were actually played before the interruption',
      ],
      correct: [0, 1, 3],
      explanation:
        'The agent must go quiet fast, stop generating and keep history consistent with what the caller heard. Storing the full reply makes the model believe it said things the caller never heard.',
      followUps: [{ q: 'How do you avoid stopping for "mm-hm"?', a: 'Require a minimum speech duration or a couple of transcribed words before treating speech as an interruption, and run echo cancellation so the agent does not hear itself.' }],
    },
    {
      id: 'audio-video-mcq-15',
      difficulty: 'medium',
      question: 'In this Pipecat-style pipeline, why does the assistant context aggregator come after the transport output?',
      code: {
        language: 'python',
        code: `pipeline = Pipeline([
    transport.input(), stt, context_aggregator.user(),
    llm, tts, transport.output(),
    context_aggregator.assistant(),
])`,
      },
      options: [
        'It must run last because Python lists execute in reverse',
        'So it records what the bot actually sent to the caller, which matters when an interruption cuts a reply short',
        'Because the LLM cannot stream unless the aggregator is last',
        'It has no effect; aggregator position is irrelevant',
      ],
      correct: [1],
      explanation:
        'Placing the assistant aggregator after output means the context is built from what passed through to the caller. When an interruption flushes queued frames, the unplayed text never reaches it, keeping history honest.',
      followUps: [{ q: 'Where would you add a per-stage latency logger?', a: 'As a custom processor (or observer) between stages, timestamping when the first frame of each type passes, e.g. the first transcription, first LLM token and first audio frame.' }],
    },
  ],
};

export default topic;
