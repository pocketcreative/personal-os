import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const PATCHABLE = new Set([
  'title', 'description', 'urgency', 'key', 'priority_score', 'rank_pinned',
  'time_estimate_min', 'tags', 'due_date', 'completed_at',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  // A manual priority change is a drag — pin it so the AI re-ranker works around it.
  if ('priority_score' in patch && !('rank_pinned' in patch)) patch.rank_pinned = true;
  patch.updated_at = new Date().toISOString();
  const db = serviceClient();
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
