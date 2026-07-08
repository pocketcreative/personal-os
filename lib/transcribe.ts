import { requireEnv } from '@/lib/auth';

const WHISPER_TIMEOUT_MS = 60_000;

/** Transcribe a Telegram voice note (OGG/Opus). Telegram serves OGG — the MIME type matters (guide Part 4 bug). */
export async function transcribeOgg(buf: ArrayBuffer): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/ogg' }), 'voice.ogg');
  form.append('model', 'whisper-1');

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
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`whisper failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.text ?? '').trim();
}
