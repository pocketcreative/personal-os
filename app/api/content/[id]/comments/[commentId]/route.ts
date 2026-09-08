import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Resolving a note is what clears the "Needs re-edit" badge, since the badge
// is derived from unresolved comments rather than a stored flag.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.resolved === 'boolean') patch.resolved = body.resolved;
  if (typeof body.body === 'string') {
    if (!body.body.trim()) return NextResponse.json({ error: 'body cannot be blank' }, { status: 400 });
    patch.body = body.body.trim();
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const db = serviceClient();
  // Same ownership check as the collection route: confirm the parent piece is
  // Brendan's before touching anything hanging off it.
  const { data: piece } = await db.from('content_pieces')
    .select('id').eq('id', id).eq('user_id', USER_ID).maybeSingle();
  if (!piece) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const { data, error } = await db.from('content_comments').update(patch)
    .eq('id', commentId).eq('piece_id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const db = serviceClient();
  const { data: piece } = await db.from('content_pieces')
    .select('id').eq('id', id).eq('user_id', USER_ID).maybeSingle();
  if (!piece) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { error } = await db.from('content_comments').delete()
    .eq('id', commentId).eq('piece_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
