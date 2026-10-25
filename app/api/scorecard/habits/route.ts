import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { localDateKey } from '@/lib/dates';
import { ensureDay, getThreshold } from '@/lib/scorecardServer';

const NO_STORE = { 'cache-control': 'no-store' };

async function list(db: ReturnType<typeof serviceClient>) {
  const { data, error } = await db.from('scorecard_habits')
    .select('id, name, sort_order, active, archived_at')
    .eq('user_id', USER_ID).order('sort_order').order('created_at');
  if (error) throw new Error(error.message);
  return { habits: data ?? [], threshold: await getThreshold(db) };
}

export async function GET() {
  try {
    return NextResponse.json(await list(serviceClient()), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Add a habit: { name } */
export async function POST(req: NextRequest) {
  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const db = serviceClient();
  try {
    const { data: last } = await db.from('scorecard_habits').select('sort_order')
      .eq('user_id', USER_ID).order('sort_order', { ascending: false }).limit(1);
    const { error } = await db.from('scorecard_habits')
      .insert({ user_id: USER_ID, name: name.trim(), sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
    if (error) throw new Error(error.message);
    await ensureDay(db, localDateKey(), localDateKey()); // rule 2: today only
    return NextResponse.json(await list(db), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * One of: { id, name } rename | { id, archive: true } | { id, restore: true }
 *       | { order: string[] } reorder active habits | { threshold: number }
 * Every template change re-syncs TODAY's snapshot only (rule 2); past days are never touched.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();
  try {
    if (typeof body.threshold === 'number') {
      const t = Math.round(body.threshold);
      if (t < 1 || t > 100) return NextResponse.json({ error: 'threshold must be 1-100' }, { status: 400 });
      const { error } = await db.from('scorecard_settings')
        .upsert({ user_id: USER_ID, streak_threshold: t }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    } else if (Array.isArray(body.order)) {
      for (let n = 0; n < body.order.length; n++) {
        const { error } = await db.from('scorecard_habits').update({ sort_order: n + 1 })
          .eq('id', body.order[n]).eq('user_id', USER_ID);
        if (error) throw new Error(error.message);
      }
    } else if (typeof body.id === 'string') {
      let patch: Record<string, unknown> | null = null;
      if (typeof body.name === 'string' && body.name.trim()) patch = { name: body.name.trim() };
      else if (body.archive === true) patch = { active: false, archived_at: new Date().toISOString() };
      else if (body.restore === true) {
        const { data: last } = await db.from('scorecard_habits').select('sort_order')
          .eq('user_id', USER_ID).order('sort_order', { ascending: false }).limit(1);
        patch = { active: true, archived_at: null, sort_order: (last?.[0]?.sort_order ?? 0) + 1 };
      }
      if (!patch) return NextResponse.json({ error: 'unrecognised body' }, { status: 400 });
      const { error } = await db.from('scorecard_habits').update(patch).eq('id', body.id).eq('user_id', USER_ID);
      if (error) throw new Error(error.message);
    } else {
      return NextResponse.json({ error: 'unrecognised body' }, { status: 400 });
    }
    const today = localDateKey();
    await ensureDay(db, today, today);
    return NextResponse.json(await list(db), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
