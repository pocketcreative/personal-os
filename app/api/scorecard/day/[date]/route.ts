import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { ensureDay } from '@/lib/scorecardServer';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NO_STORE = { 'cache-control': 'no-store' };

function check(date: string, today: string) {
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  if (date > today) return NextResponse.json({ error: 'future days are not editable' }, { status: 400 });
  return null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const today = localDateKey();
  const bad = check(date, today);
  if (bad) return bad;
  try {
    return NextResponse.json(await ensureDay(serviceClient(), date, today), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * One endpoint for every per-day edit. Body is one of:
 *   { toggle: itemId, done: boolean } | { add: name } | { remove: itemId } | { note: string }
 * Returns the full updated day so the client can reconcile.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const today = localDateKey();
  const bad = check(date, today);
  if (bad) return bad;

  const body = await req.json().catch(() => ({}));
  const db = serviceClient();
  try {
    await ensureDay(db, date, today); // tick on an untouched date snapshots it first

    if (typeof body.toggle === 'string' && typeof body.done === 'boolean') {
      const { error } = await db.from('scorecard_day_items').update({ done: body.done })
        .eq('id', body.toggle).eq('user_id', USER_ID).eq('date', date);
      if (error) throw new Error(error.message);
    } else if (typeof body.add === 'string' && body.add.trim()) {
      const { data: last } = await db.from('scorecard_day_items').select('sort_order')
        .eq('user_id', USER_ID).eq('date', date).order('sort_order', { ascending: false }).limit(1);
      const { error } = await db.from('scorecard_day_items').insert({
        user_id: USER_ID, date, habit_id: null, name: body.add.trim(),
        sort_order: (last?.[0]?.sort_order ?? 0) + 1,
      });
      if (error) throw new Error(error.message);
    } else if (typeof body.remove === 'string') {
      const { error } = await db.from('scorecard_day_items').delete()
        .eq('id', body.remove).eq('user_id', USER_ID).eq('date', date);
      if (error) throw new Error(error.message);
    } else if (typeof body.note === 'string') {
      const { error } = await db.from('scorecard_days')
        .update({ note: body.note.trim() || null, updated_at: new Date().toISOString() })
        .eq('user_id', USER_ID).eq('date', date);
      if (error) throw new Error(error.message);
    } else {
      return NextResponse.json({ error: 'unrecognised body' }, { status: 400 });
    }
    return NextResponse.json(await ensureDay(db, date, today), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
