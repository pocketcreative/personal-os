import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const PATCHABLE = new Set([
  'title', 'visual_hook', 'script', 'status', 'platform',
  'target_post_date', 'raw_footage_link', 'additional_footage', 'sort_order',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  if (typeof patch.title === 'string' && !patch.title.trim()) {
    return NextResponse.json({ error: 'title cannot be blank' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();
  const db = serviceClient();
  const { data, error } = await db.from('content_pieces').update(patch)
    .eq('id', id).eq('user_id', USER_ID).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  const { error } = await db.from('content_pieces').delete().eq('id', id).eq('user_id', USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
