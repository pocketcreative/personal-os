import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { rollupTask } from '@/lib/timers';

// Logs an AI agent's REAL time on a task as a CLOSED timer_sessions row
// (started_at/ended_at both set, computed from the given duration), then
// rolls the task up via the existing lib/timers.ts rollupTask() -- never
// writes actual_time_min directly, which a later manual timer action would
// silently wipe (M5). `agent_name` tags the session so /api/agents/[id]
// can read back this agent's own contribution rather than the full task
// total (Q11 -- no full-duration copy, no even split).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const agentName = body?.agent_name;
  const minutes = Number(body?.minutes);
  if (typeof agentName !== 'string' || !agentName.trim()) {
    return NextResponse.json({ error: 'agent_name required' }, { status: 400 });
  }
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return NextResponse.json({ error: 'minutes must be a positive number' }, { status: 400 });
  }

  const db = serviceClient();
  const { data: task, error: taskErr } = await db.from('tasks').select('id')
    .eq('id', id).eq('user_id', USER_ID).single();
  if (taskErr) return NextResponse.json({ error: 'task not found' }, { status: 404 });

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - minutes * 60_000);
  const { error: insErr } = await db.from('timer_sessions').insert({
    user_id: USER_ID, task_id: task.id,
    started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(),
    agent_name: agentName.trim(),
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  try {
    await rollupTask(db, task.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { data: updated, error: fetchErr } = await db.from('tasks').select('*')
    .eq('id', task.id).eq('user_id', USER_ID).single();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  return NextResponse.json(updated);
}
