import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const DEFAULT_TITLE = 'Close 5 × $25,000 Authority Agent deals';

// The Task Dashboard's editable goal banner reuses the existing `goals`
// table (scope: 'month') rather than the full Goals feature (P3, not built
// yet) — there's always exactly one banner goal, sort_order 0, and this
// route creates it on first read if it doesn't exist yet.
export async function GET() {
  const db = serviceClient();
  const { data, error } = await db.from('goals')
    .select('id, title')
    .eq('user_id', USER_ID).eq('scope', 'month')
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    .limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data) return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
  const { data: created, error: createErr } = await db.from('goals')
    .insert({ user_id: USER_ID, scope: 'month', title: DEFAULT_TITLE, sort_order: 0 })
    .select('id, title').single();
  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
  return NextResponse.json(created, { headers: { 'cache-control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  const db = serviceClient();
  const { data, error } = await db.from('goals')
    .update({ title: body.title.trim() })
    .eq('id', body.id).eq('user_id', USER_ID)
    .select('id, title').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
