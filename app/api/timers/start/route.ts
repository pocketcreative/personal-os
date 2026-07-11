import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { closeOpenSessionForTask } from '@/lib/timers';

const UNIQUE_VIOLATION = '23505';

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  const db = serviceClient();
  try {
    const { data: task, error: taskError } = await db.from('tasks')
      .select('status').eq('id', task_id).eq('user_id', USER_ID).single();
    if (taskError) throw new Error(taskError.message);
    if (task.status === 'completed') {
      return NextResponse.json({ error: 'cannot start a timer on a completed task' }, { status: 409 });
    }
    // Close only THIS task's own stale open session (e.g. a page refresh
    // left one dangling) — does not touch other tasks' running timers.
    await closeOpenSessionForTask(db, task_id);
    let { data, error } = await db.from('timer_sessions')
      .insert({ user_id: USER_ID, task_id }).select('*').single();
    if (error?.code === UNIQUE_VIOLATION) {
      await closeOpenSessionForTask(db, task_id);
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
