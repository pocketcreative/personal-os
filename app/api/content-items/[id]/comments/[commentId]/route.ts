import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

async function ownsItem(db: ReturnType<typeof serviceClient>, itemId: string) {
  const { data } = await db.from('content_items').select('id').eq('id', itemId).eq('user_id', USER_ID).maybeSingle();
  return !!data;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.resolved !== 'boolean') return NextResponse.json({ error: 'resolved (boolean) required' }, { status: 400 });
  const db = serviceClient();
  if (!await ownsItem(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await db.from('content_item_comments').update({ resolved: body.resolved })
    .eq('id', commentId).eq('item_id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { id, commentId } = await params;
  const db = serviceClient();
  if (!await ownsItem(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { error } = await db.from('content_item_comments').delete().eq('id', commentId).eq('item_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
