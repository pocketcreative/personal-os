import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

async function ownsItem(db: ReturnType<typeof serviceClient>, itemId: string) {
  const { data } = await db.from('content_items').select('id').eq('id', itemId).eq('user_id', USER_ID).maybeSingle();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  if (!await ownsItem(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await db.from('content_item_comments')
    .select('*').eq('item_id', id).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.body !== 'string' || !body.body.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }
  const ts = body.video_timestamp_seconds;
  if (ts != null && (typeof ts !== 'number' || !Number.isFinite(ts) || ts < 0)) {
    return NextResponse.json({ error: 'video_timestamp_seconds must be a non-negative number' }, { status: 400 });
  }
  const db = serviceClient();
  if (!await ownsItem(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await db.from('content_item_comments').insert({
    item_id: id,
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'brendan',
    body: body.body.trim(),
    video_timestamp_seconds: ts ?? null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
