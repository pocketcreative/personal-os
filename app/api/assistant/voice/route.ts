import { NextRequest, NextResponse } from 'next/server';
import { transcribeWebm } from '@/lib/transcribe';

// Transcribe-only: the transcript is dropped into the chat input for the
// user to review/edit, not auto-submitted through the assistant routing
// pipeline. This deliberately trades a second round trip (this call, then
// the normal /api/assistant call once the user hits Send) for a chance to
// catch a Whisper mishearing before it turns into a wrong task/edit.
export const maxDuration = 30;

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

  return NextResponse.json({ type: 'transcript', transcript: text });
}
