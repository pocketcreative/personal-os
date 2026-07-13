import { requireEnv } from '@/lib/auth';

// Telegram voice notes are short (personal capture, not long recordings) —
// Whisper transcription of a clip that size typically takes a few seconds.
// Kept well under 60s so the Telegram webhook route's own maxDuration=60
// has headroom left for the classifier chain (up to 30s) that runs after
// this: 60s here would alone exceed the route's total budget.
const WHISPER_TIMEOUT_MS = 20_000;

/**
 * Shared Whisper call — both Telegram (OGG/Opus) and browser (WebM/Opus)
 * voice input funnel through here, differing only in MIME type/filename.
 *
 * Pinned to English because Whisper's auto-detection was mis-classifying
 * Singlish (Singaporean English with local vocabulary) as Malay, producing
 * fully Malay transcripts. Specifying language='en' prevents this and
 * improves both accuracy and latency — same reasoning applies regardless
 * of which client recorded the audio.
 */
async function transcribeBuffer(buf: ArrayBuffer, mimeType: string, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mimeType }), filename);
  form.append('model', 'whisper-1');
  form.append('language', 'en');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}` },
      body: form,
      signal: controller.signal,
    });
  } catch (e) {
    // An aborted fetch rejects with a bare AbortError; rewrap so the caller
    // sees a clear, actionable message instead of an opaque timeout error.
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`whisper transcription timed out after ${WHISPER_TIMEOUT_MS / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`whisper failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.text ?? '').trim();
}

/**
 * Transcribe a Telegram voice note (OGG/Opus) to English.
 *
 * Telegram serves OGG — the MIME type matters (guide Part 4 bug).
 */
export async function transcribeOgg(buf: ArrayBuffer): Promise<string> {
  return transcribeBuffer(buf, 'audio/ogg', 'voice.ogg');
}

/**
 * Transcribe a browser-recorded voice message (WebM/Opus, from
 * MediaRecorder) to English. Whisper accepts WebM directly — no
 * transcoding needed, just the correct MIME type/filename.
 */
export async function transcribeWebm(buf: ArrayBuffer): Promise<string> {
  return transcribeBuffer(buf, 'audio/webm', 'voice.webm');
}
