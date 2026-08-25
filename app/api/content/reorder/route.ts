import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import type { ContentPiece } from '@/lib/types';

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orderedIds = body?.orderedIds;
  const status = body?.status as ContentPiece['status'] | undefined;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'orderedIds must be a non-empty array of strings' }, { status: 400 });
  }
  const db = serviceClient();
  const now = new Date().toISOString();
  // orderedIds is the full drop-target column's new order. Same
  // sequential-update-loop precedent as /api/tasks/reorder. `status` is
  // included so a cross-column drag lands the card in its new column in
  // the same request that fixes its position, instead of two round-trips.
  for (let i = 0; i < orderedIds.length; i++) {
    const patch: Record<string, unknown> = { sort_order: i, updated_at: now };
    if (status) patch.status = status;
    const { error } = await db.from('content_pieces')
      .update(patch).eq('id', orderedIds[i]).eq('user_id', USER_ID);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
