import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { closeOpenSessionForTask } from '@/lib/timers';

const PATCHABLE = new Set([
  'title', 'description', 'urgency', 'key', 'priority_score', 'rank_pinned',
  'time_estimate_min', 'actual_time_min', 'tags', 'due_date', 'completed_at',
  'category', 'status',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  // A manual priority change is a drag — pin it so the AI re-ranker works around it.
  if ('priority_score' in patch && !('rank_pinned' in patch)) patch.rank_pinned = true;
  // Marking Completed via the status popover also completes the task, and
  // moving off Completed un-marks it — unless the caller explicitly set
  // completed_at itself, in which case we don't second-guess it.
  if ('status' in patch && !('completed_at' in patch)) {
    patch.completed_at = patch.status === 'completed' ? new Date().toISOString() : null;
  }
  patch.updated_at = new Date().toISOString();
  const db = serviceClient();
  // Completing a task auto-stops any running timer for it and rolls up
  // actual_time_min from all closed sessions (spec: task-dashboard-redesign
  // decision #3). Must run BEFORE the main update below — closeOpenSessionForTask
  // does its own separate update of actual_time_min, so ordering it first means
  // the select('*') below returns the fresh rolled-up value instead of a stale
  // one (unless overridden by the restore logic or the caller's own patch below).
  if (patch.status === 'completed') {
    // rollupTask (inside closeOpenSessionForTask) unconditionally overwrites
    // actual_time_min with the sum of closed sessions. That's correct for
    // /api/timers/start and /api/timers/stop, but the spec only wants a
    // *backfill* here: preserve a manually-set actual_time_min and only let
    // the rollup's value stand when it was genuinely still zero. (If the
    // caller's own PATCH body also sets actual_time_min explicitly, that
    // still wins over both — it's applied last, in the update below.)
    const { data: before, error: beforeErr } = await db.from('tasks')
      .select('actual_time_min').eq('id', id).eq('user_id', USER_ID).single();
    if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 });
    try {
      await closeOpenSessionForTask(db, id);
    } catch (err) {
      console.error('auto-stop timer on completion failed', err);
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
    if (before?.actual_time_min) {
      const { error: restoreErr } = await db.from('tasks')
        .update({ actual_time_min: before.actual_time_min })
        .eq('id', id).eq('user_id', USER_ID);
      if (restoreErr) return NextResponse.json({ error: restoreErr.message }, { status: 500 });
    }
  }
  const { data, error } = await db.from('tasks').update(patch)
    .eq('id', id).eq('user_id', USER_ID).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  const { error } = await db.from('tasks').delete().eq('id', id).eq('user_id', USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
