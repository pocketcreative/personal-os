import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const logDate = typeof body.log_date === 'string' ? body.log_date : '';
  const completed = typeof body.completed === 'boolean' ? body.completed : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate) || completed === null) {
    return NextResponse.json(
      { error: 'log_date (YYYY-MM-DD) and completed (boolean) required' },
      { status: 400 },
    );
  }

  const db = serviceClient();
  // habit_id has no user-scoped check on its own — confirm ownership before
  // writing a log row against it.
  const { data: habit, error: habitErr } = await db.from('habits')
    .select('id').eq('id', id).eq('user_id', USER_ID).maybeSingle();
  if (habitErr) return NextResponse.json({ error: habitErr.message }, { status: 500 });
  if (!habit) return NextResponse.json({ error: 'habit not found' }, { status: 404 });

  const { data, error } = await db.from('habit_logs')
    .upsert(
      { user_id: USER_ID, habit_id: id, log_date: logDate, completed },
      { onConflict: 'habit_id,log_date' },
    )
    .select('habit_id, log_date, completed')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
