import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_ID } from '@/lib/supabase';

export interface SessionLike {
  started_at: string;
  ended_at: string | null;
}

export function sumSessionMinutes(sessions: SessionLike[], now: Date = new Date()): number {
  const ms = sessions.reduce((acc, s) => {
    const end = s.ended_at ? new Date(s.ended_at) : now;
    return acc + Math.max(0, end.getTime() - new Date(s.started_at).getTime());
  }, 0);
  return Math.round(ms / 60_000);
}

/** Recompute a task's actual_time_min from its closed sessions. */
export async function rollupTask(db: SupabaseClient, taskId: string): Promise<void> {
  const { data: sessions, error } = await db.from('timer_sessions')
    .select('started_at, ended_at').eq('task_id', taskId).not('ended_at', 'is', null);
  if (error) throw new Error(error.message);
  const { error: upErr } = await db.from('tasks')
    .update({ actual_time_min: sumSessionMinutes(sessions ?? []), updated_at: new Date().toISOString() })
    .eq('id', taskId);
  if (upErr) throw new Error(upErr.message);
}

/**
 * Close THIS task's open session (if any) and roll it up. Scoped per-task,
 * not per-user — multiple different tasks can each have their own running
 * timer simultaneously (the app-wide one-timer-max invariant was retired
 * in the Task Dashboard redesign; a task still can't have two overlapping
 * sessions with itself, enforced by migrations/0003's partial unique index).
 *
 * IMPORTANT: never insert into timer_sessions from anywhere except
 * app/api/timers/start/route.ts, which always calls this first for the
 * SAME task_id. Bypassing it would let a task accumulate two open sessions
 * at once and violate the DB constraint on the next start attempt.
 */
export async function closeOpenSessionForTask(db: SupabaseClient, taskId: string): Promise<void> {
  const { data: open, error } = await db.from('timer_sessions')
    .select('id').eq('task_id', taskId).eq('user_id', USER_ID).is('ended_at', null);
  if (error) throw new Error(error.message);
  for (const s of open ?? []) {
    const { error: endErr } = await db.from('timer_sessions')
      .update({ ended_at: new Date().toISOString() }).eq('id', s.id);
    if (endErr) throw new Error(endErr.message);
  }
  if (open && open.length > 0) await rollupTask(db, taskId);
}
