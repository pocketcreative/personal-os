import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { BOARDS_MISSING_MESSAGE, BOARD_LIST_COLUMNS, isMissingTableError } from '@/lib/boardScene';

function fail(error: { code?: string; message: string }) {
  if (isMissingTableError(error)) {
    return NextResponse.json({ error: BOARDS_MISSING_MESSAGE, code: 'boards_table_missing' }, { status: 503 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

// Active by default; ?status=archived to see archived rows.
export async function GET(req: NextRequest) {
  const db = serviceClient();
  const status = req.nextUrl.searchParams.get('status') ?? 'active';
  const { data, error } = await db.from('boards').select(BOARD_LIST_COLUMNS)
    .eq('user_id', USER_ID).eq('status', status).order('updated_at', { ascending: false });
  if (error) return fail(error);
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

// Title is optional: a new board starts blank and the column default
// ('Untitled board') applies when none is given.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title } = body as { title?: unknown };
  const db = serviceClient();
  const { data, error } = await db.from('boards')
    .insert({
      user_id: USER_ID,
      ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}),
    })
    .select(BOARD_LIST_COLUMNS).single();
  if (error) return fail(error);
  return NextResponse.json(data, { status: 201 });
}
