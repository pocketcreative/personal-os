import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });

  const db = serviceClient();
  const { data, error } = await db.from('journal_entries')
    .select('id, entry_date, raw_text, created_at')
    .eq('user_id', USER_ID).eq('entry_date', date)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    data ?? { id: null, entry_date: date, raw_text: '', created_at: null },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/**
 * Upsert a date's full text. If `expected_previous_text` is present, this is
 * a conditional write: the server re-reads the current text first and, if it
 * doesn't match what the editor started from, rejects with 409 rather than
 * overwriting — this is what stops a native edit from silently clobbering a
 * Telegram-appended addition that arrived after the editor opened but before
 * Save was clicked. Omitting the field entirely means an unconditional
 * write (the deliberate "Overwrite anyway" path, used only after the caller
 * has already seen and accepted the current server text).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const rawText = typeof body.raw_text === 'string' ? body.raw_text : null;
  if (rawText === null) return NextResponse.json({ error: 'raw_text (string) required' }, { status: 400 });
  const expectedPrevious = typeof body.expected_previous_text === 'string' ? body.expected_previous_text : undefined;

  const db = serviceClient();

  if (expectedPrevious !== undefined) {
    const { data: current, error: readErr } = await db.from('journal_entries')
      .select('raw_text').eq('user_id', USER_ID).eq('entry_date', date).maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    const currentText = current?.raw_text ?? '';
    if (currentText !== expectedPrevious) {
      return NextResponse.json({ error: 'conflict', current_text: currentText }, { status: 409 });
    }
  }

  const { data, error } = await db.from('journal_entries')
    .upsert(
      { user_id: USER_ID, entry_date: date, raw_text: rawText },
      { onConflict: 'user_id,entry_date' },
    )
    .select('id, entry_date, raw_text, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
