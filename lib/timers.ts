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
 * Close any running session(s) and roll their tasks up. Enforces the
 * one-timer-max rule.
 *
 * IMPORTANT: never insert into timer_sessions from anywhere except
 * app/api/timers/start/route.ts, which always calls this first. Bypassing
 * it (e.g. a future UI writing to the table directly) would silently break
 * the one-timer-max guarantee. A DB-level partial unique index
 * (migrations/0002) backstops the race between concurrent start requests,
 * but does not protect against a caller skipping this function entirely.
 */
export async function closeOpenSessions(db: SupabaseClient): Promise<void> {
  const { data: open, error } = await db.from('timer_sessions')
    .select('id, task_id').eq('user_id', USER_ID).is('ended_at', null);
  if (error) throw new Error(error.message);
  for (const s of open ?? []) {
    const { error: endErr } = await db.from('timer_sessions')
      .update({ ended_at: new Date().toISOString() }).eq('id', s.id);
    if (endErr) throw new Error(endErr.message);
    await rollupTask(db, s.task_id);
  }
}
