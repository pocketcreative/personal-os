import { NextRequest, NextResponse } from 'next/server';
import { processCapture } from '@/lib/capture';

export const maxDuration = 30;

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
