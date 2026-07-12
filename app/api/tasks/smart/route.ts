import { NextRequest, NextResponse } from 'next/server';
import { runSmartQuery } from '@/lib/ai/smartQuery';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({ query: '' }));
  if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 });

  const result = await runSmartQuery(query);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result);
}
