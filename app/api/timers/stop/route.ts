import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { closeOpenSessionForTask } from '@/lib/timers';

export async function POST(req: NextRequest) {
  const { task_id } = await req.json().catch(() => ({}));
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 });
  const db = serviceClient();
  try {
    await closeOpenSessionForTask(db, task_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('timer stop failed', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
