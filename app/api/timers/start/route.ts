import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { USER_ID } from '@/lib/supabase';
import { closeOpenSessions } from '@/lib/timers';

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  const db = serviceClient();
  try {
    await closeOpenSessions(db);
    const { data, error } = await db.from('timer_sessions')
      .insert({ user_id: USER_ID, task_id }).select('*').single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('timer start failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
