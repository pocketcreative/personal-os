import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function GET() {
  const db = serviceClient();
  // Ordered + limited to 1, not .maybeSingle(): if the DB-level one-open-
  // session guarantee (migrations/0002) hasn't been applied yet, or a
  // request race slips through before the app-level retry catches it,
  // .maybeSingle() throws on >1 rows and breaks this endpoint (and the
  // TimerStrip that polls it) app-wide. This degrades to "show the most
  // recently started one" instead of crashing.
  const { data, error } = await db.from('timer_sessions')
    .select('id, task_id, started_at, tasks(title, time_estimate_min, actual_time_min)')
    .eq('user_id', USER_ID).is('ended_at', null)
    .order('started_at', { ascending: false }).limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0] ?? null, { headers: { 'cache-control': 'no-store' } });
}
