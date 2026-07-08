import { NextRequest, NextResponse } from 'next/server';
import { processCapture } from '@/lib/capture';

// Worst case, processCapture's classifier chain alone can spend ~30s
// (15s Claude timeout + 15s OpenAI timeout) before even falling back to
// regex — leave headroom for that plus the Supabase reads/writes on top.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { text } = await req.json().catch(() => ({ text: '' }));
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });
  try {
    const result = await processCapture({ text: text.trim(), source: 'web' });
    return NextResponse.json(result);
  } catch (err) {
    console.error('capture failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
