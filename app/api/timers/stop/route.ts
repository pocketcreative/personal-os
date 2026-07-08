import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { closeOpenSessions } from '@/lib/timers';

export async function POST() {
  const db = serviceClient();
  try {
    await closeOpenSessions(db);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('timer stop failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
