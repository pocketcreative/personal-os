import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';

export async function GET() {
  const db = serviceClient();
  const { data, error } = await db.from('journal_entries')
    .select('focus').eq('user_id', USER_ID).eq('entry_date', localDateKey()).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ focus: data?.focus ?? '' }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const { focus } = await req.json().catch(() => ({ focus: '' }));
  const db = serviceClient();
  const { error } = await db.from('journal_entries').upsert(
    { user_id: USER_ID, entry_date: localDateKey(), focus: focus ?? '' },
    { onConflict: 'user_id,entry_date' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
