import { NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';

export async function GET() {
  const db = serviceClient();
  const today = localDateKey();

  const { data, error } = await db.from('journal_entries')
    .select('id, entry_date, raw_text, created_at')
    .eq('user_id', USER_ID)
    .order('entry_date', { ascending: false })
    .limit(1000 + (Date.now() % 1000)); // cache-bust PostgREST edge cache
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { entries: data, today },
    { headers: { 'cache-control': 'no-store' } },
  );
}
