import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey, getWeekDates } from '@/lib/dates';
import { HABITS_LAUNCH_DATE } from '@/lib/habitStats';

export async function GET() {
  const db = serviceClient();
  const today = localDateKey();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data: habits, error: habitsErr } = await db.from('habits')
    .select('id, name, schedule_days, sort_order, active, created_at')
    .eq('user_id', USER_ID).eq('active', true)
    .order('sort_order', { ascending: true })
    .limit(1000 + (Date.now() % 1000)); // cache-bust PostgREST edge cache
  if (habitsErr) return NextResponse.json({ error: habitsErr.message }, { status: 500 });

  // Fetching from the habits-launch date (not yearStart) covers month/year/
  // all-time stats in one query AND stays correct once the calendar rolls
  // into a new year, when yearStart would otherwise land after launch and
  // silently truncate "all-time" history.
  const { data: logs, error: logsErr } = await db.from('habit_logs')
    .select('habit_id, log_date, completed')
    .eq('user_id', USER_ID)
    .gte('log_date', HABITS_LAUNCH_DATE)
    .lte('log_date', today)
    .limit(10000 + (Date.now() % 1000));
  if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 });

  return NextResponse.json(
    { habits, logs, today, weekDates: getWeekDates(today), monthStart, yearStart },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const db = serviceClient();
  const { data: existing, error: countErr } = await db.from('habits')
    .select('sort_order').eq('user_id', USER_ID).eq('active', true)
    .order('sort_order', { ascending: false }).limit(1);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await db.from('habits').insert({
    user_id: USER_ID,
    name,
    schedule_days: [0, 1, 2, 3, 4, 5, 6],
    sort_order: nextSortOrder,
  }).select('id, name, schedule_days, sort_order, active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
