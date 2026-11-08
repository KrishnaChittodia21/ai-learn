import type { TopicCheatsheet } from '../../lib/cheatsheets';

const sheet: TopicCheatsheet = {
  source: ['asr-whisper.md', 'tts-voice-cloning.md', 'voice-assistants-realtime.md'],
  blocks: [
    {
      title: 'ASR model types',
      markdown: `| Type | Streams? | Use when |
|---|---|---|
| CTC | yes, fast | low-latency, simple; no internal language model |
| RNN-T (transducer) | yes | on-device / streaming with built-in LM |
| Attention encoder-decoder (Whisper-class) | not natively | best offline quality, batch transcription |`,
    },
    {
      title: 'Whisper and VAD defaults',
      markdown: `| Setting | Start at | Why |
|---|---|---|
| \`temperature\` | \`0\` | deterministic transcripts |
| \`condition_on_previous_text\` | \`False\` for long audio | stops one error repeating in later windows |
| \`language\` | set it explicitly | auto-detect drifts on noisy clips |
| VAD threshold (Silero) | \`0.5\` (lower = more sensitive) | gate silence before ASR |
| Minimum speech | ≈250 ms | ignore coughs and clicks |
| Silence hangover | ≈500–800 ms | shorter cuts users off; longer feels slow |
| Pre-roll buffer | ≈300–500 ms | keeps the first word |`,
    },
    {
      title: 'Voice troubleshooting',
      markdown: `| Symptom | Cause | Fix |
|---|---|---|
| "Thanks for watching!" on silence | ASR run on silent / padded audio | VAD-gate first |
| Transcript in the wrong language | auto language ID on noise | force the language |
| First word missing | VAD fires late | pre-roll buffer, slightly lower threshold |
| Agent cuts the user off | hangover too short | longer hangover + semantic end-of-turn |
| Bot keeps talking after interrupt | barge-in not wired | VAD cancels TTS **and** the LLM stream |
| "Dr." read as "Drive" | no text normalisation before TTS | normalise numbers, abbreviations |
| Crackle / aliasing | sample-rate mismatch (24 kHz TTS → 16 kHz pipe) | resample at each boundary |
| Silence while a tool runs | slow tool, no feedback | short filler ("one second…") after a few hundred ms |`,
    },
    {
      title: 'Voice cloning rules',
      markdown: `- Clone only with recorded, verifiable consent from the speaker; keep it in a tamper-evident log.
- Watermark every generated clip and label it as synthetic.
- Reference audio: dry, close-mic, and its transcript must match exactly.`,
    },
  ],
};

export default sheet;
