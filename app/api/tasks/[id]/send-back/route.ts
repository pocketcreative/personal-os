import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// "Send back" on a Needs Review card (M8): the main way redos get counted,
// so it doesn't depend on anyone remembering a rule. Increments
// restart_count, appends a one-line "Redo #N: reason" to the description
// (same running-log convention as the rest of description), clears
// needs_input, and moves the task back to in_progress.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 });

  const db = serviceClient();
  const { data: task, error: taskErr } = await db.from('tasks')
    .select('id, description, restart_count').eq('id', id).eq('user_id', USER_ID).single();
  if (taskErr) {
    // restart_count (migration 0023) not applied to the live DB yet is the
    // most likely real cause of a select failure here, not a missing task
    // -- surface the real DB error so it's obvious rather than a
    // misleading "task not found".
    return NextResponse.json({ error: taskErr.message }, { status: taskErr.code === 'PGRST116' ? 404 : 500 });
  }

  const nextCount = (task.restart_count ?? 0) + 1;
  const note = `Redo #${nextCount}: ${reason}`;
  const description = task.description ? `${task.description}\n\n${note}` : note;

  const { data, error } = await db.from('tasks').update({
    restart_count: nextCount,
    description,
    status: 'in_progress',
    needs_input: false,
    input_note: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', USER_ID).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
