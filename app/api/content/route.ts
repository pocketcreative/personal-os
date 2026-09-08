import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

export async function GET() {
  const db = serviceClient();
  const { data, error } = await db.from('content_pieces')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Comment counts come back in one extra query rather than one per card, so
  // the board can draw the "needs re-edit" badge without an N+1 fan-out. The
  // thread itself is only fetched when a piece is actually opened.
  const ids = (data ?? []).map((p) => p.id as string);
  const counts = new Map<string, { total: number; unresolved: number }>();
  if (ids.length > 0) {
    const { data: comments, error: cErr } = await db.from('content_comments')
      .select('piece_id, resolved').in('piece_id', ids);
    // PGRST205 (PostgREST: table not in the schema cache) and 42P01 (Postgres:
    // relation does not exist) both mean migration 0012 hasn't been pasted
    // into the SQL Editor yet. The board is still fully usable without the
    // badges, so serve it instead of 500ing the whole page. Anything else is a
    // real failure and should surface.
    if (cErr && cErr.code !== 'PGRST205' && cErr.code !== '42P01') {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }
    if (cErr) console.warn('content_comments not found. Apply migration 0012; "needs re-edit" badges are off until then.');
    for (const c of comments ?? []) {
      const entry = counts.get(c.piece_id) ?? { total: 0, unresolved: 0 };
      entry.total++;
      if (!c.resolved) entry.unresolved++;
      counts.set(c.piece_id, entry);
    }
  }

  const pieces = (data ?? []).map((p) => {
    const c = counts.get(p.id as string);
    return { ...p, comment_count: c?.total ?? 0, unresolved_comment_count: c?.unresolved ?? 0 };
  });
  return NextResponse.json(pieces, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const db = serviceClient();
  const { data, error } = await db.from('content_pieces').insert({
    user_id: USER_ID,
    title: body.title.trim(),
    visual_hook: body.visual_hook ?? null,
    script: body.script ?? null,
    transcript: body.transcript ?? null,
    status: body.status ?? 'draft',
    format: body.format ?? null,
    platform: body.platform ?? [],
    target_post_date: body.target_post_date ?? null,
    raw_footage_link: body.raw_footage_link ?? null,
    video_link: body.video_link ?? null,
    posted_link: body.posted_link ?? null,
    additional_footage: body.additional_footage ?? null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // A brand new piece has no comments yet, so the counts are known without a
  // second query and the client can drop the row straight into board state.
  return NextResponse.json({ ...data, comment_count: 0, unresolved_comment_count: 0 }, { status: 201 });
}
