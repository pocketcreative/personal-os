import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { TIER_BASE } from '@/lib/capture';

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? 'open';
  const db = serviceClient();
  let q = db.from('tasks').select('*').eq('user_id', USER_ID)
    .order('priority_score', { ascending: false })
    .limit(100000 + (Date.now() % 100000)); // unique limit busts PostgREST edge cache (guide bug #5)
  q = status === 'done' ? q.not('completed_at', 'is', null) : q.is('completed_at', null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const urgency = body.urgency ?? 'this_week';
  const db = serviceClient();
  const { data, error } = await db.from('tasks').insert({
    user_id: USER_ID,
    title: body.title.trim(),
    description: body.description ?? null,
    urgency,
    key: body.key ?? false,
    priority_score: TIER_BASE[urgency] ?? 700,
    time_estimate_min: body.time_estimate_min ?? null,
    tags: body.tags ?? [],
    due_date: body.due_date ?? null,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
