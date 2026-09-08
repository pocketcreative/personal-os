import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// content_comments has no user_id of its own -- it hangs off content_pieces,
// which does. Every read and write here confirms the parent piece belongs to
// USER_ID first, so ownership is enforced in exactly one place.
async function ownsPiece(db: ReturnType<typeof serviceClient>, pieceId: string) {
  const { data } = await db.from('content_pieces')
    .select('id').eq('id', pieceId).eq('user_id', USER_ID).maybeSingle();
  return !!data;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  if (!await ownsPiece(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Oldest first: a review thread reads as a conversation in the order it was
  // written, and the newest note is the one nearest the input box you're
  // about to type in.
  const { data, error } = await db.from('content_comments')
    .select('*').eq('piece_id', id).order('created_at', { ascending: true });
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
  if (!await ownsPiece(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data, error } = await db.from('content_comments').insert({
    piece_id: id,
    author: typeof body.author === 'string' && body.author.trim() ? body.author.trim() : 'brendan',
    body: body.body.trim(),
    video_timestamp_seconds: ts ?? null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
