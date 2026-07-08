import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function GET() {
  const db = serviceClient();
  const { data, error } = await db.from('timer_sessions')
    .select('id, task_id, started_at, tasks(title, time_estimate_min, actual_time_min)')
    .eq('user_id', USER_ID).is('ended_at', null).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null, { headers: { 'cache-control': 'no-store' } });
}
