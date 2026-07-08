import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { USER_ID } from '@/lib/supabase';
import { closeOpenSessions } from '@/lib/timers';

const UNIQUE_VIOLATION = '23505';

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  const db = serviceClient();
  try {
    await closeOpenSessions(db);
    let { data, error } = await db.from('timer_sessions')
      .insert({ user_id: USER_ID, task_id }).select('*').single();
    // Two near-simultaneous start requests can both see zero open sessions
    // and both insert. supabase/migrations/0002 adds a partial unique index
    // (one open session per user) that turns the second insert into a clean
    // 23505 instead of two silently-concurrent timers — retry once against
    // the now-current state rather than surfacing the race to the caller.
    if (error?.code === UNIQUE_VIOLATION) {
      await closeOpenSessions(db);
      ({ data, error } = await db.from('timer_sessions')
        .insert({ user_id: USER_ID, task_id }).select('*').single());
    }
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('timer start failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
