import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orderedIds = body?.orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'orderedIds must be a non-empty array of strings' }, { status: 400 });
  }
  const db = serviceClient();
  const now = new Date().toISOString();
  // No custom RPC for a single multi-row-different-values update — a loop
  // of individual per-row updates is fine and matches this codebase's
  // existing "accept N small writes for a single-user low-latency app"
  // precedent (see lib/capture.ts's sequential insert loop). Each update is
  // scoped to user_id, so an id that doesn't belong to this user (or
  // doesn't exist) simply matches zero rows and is silently skipped rather
  // than erroring the whole batch.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db.from('tasks')
      .update({ sort_order: i, updated_at: now })
      .eq('id', orderedIds[i]).eq('user_id', USER_ID);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
