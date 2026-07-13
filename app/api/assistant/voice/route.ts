import { NextRequest, NextResponse } from 'next/server';
import { transcribeWebm } from '@/lib/transcribe';
import { handleAssistantText } from '@/app/api/assistant/route';

// Same reasoning as app/api/assistant/route.ts and app/api/capture/route.ts:
// processCapture's classifier chain alone can spend ~30s worst case, plus
// Supabase reads/writes — here we also spend up to 20s (WHISPER_TIMEOUT_MS
// in lib/transcribe.ts) transcribing before routing even starts, so keep
// the same 60s ceiling and let Whisper's own timeout guard the split.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ type: 'error', message: 'audio field required' }, { status: 400 });
  }

  const buf = await audio.arrayBuffer();
  let text: string;
  try {
    text = await transcribeWebm(buf);
  } catch (err) {
    console.error('voice transcription failed', err);
    return NextResponse.json({ type: 'error', message: "Couldn't transcribe that — try again?" });
  }

  if (!text.trim()) {
    return NextResponse.json({ type: 'error', message: "Couldn't transcribe that — try again?" });
  }

  try {
    const outcome = await handleAssistantText(text);
    return NextResponse.json({ ...outcome, transcript: text });
  } catch (err) {
    console.error('assistant voice capture failed', err);
    return NextResponse.json({ type: 'error', message: (err as Error).message, transcript: text }, { status: 500 });
  }
}
