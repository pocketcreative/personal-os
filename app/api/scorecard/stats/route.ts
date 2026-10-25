import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { computeStats } from '@/lib/scorecardServer';

export async function GET() {
  try {
    return NextResponse.json(await computeStats(serviceClient(), localDateKey()), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
