import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

const PATCHABLE = new Set(['name', 'active', 'schedule_days']);

function isValidScheduleDays(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0
    && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    && new Set(v).size === v.length;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  if ('name' in patch && (typeof patch.name !== 'string' || !(patch.name as string).trim())) {
    return NextResponse.json({ error: 'name must be non-empty' }, { status: 400 });
  }
  if ('schedule_days' in patch && !isValidScheduleDays(patch.schedule_days)) {
    return NextResponse.json(
      { error: 'schedule_days must be a non-empty array of unique integers 0-6' },
      { status: 400 },
    );
  }

  const db = serviceClient();
  const { data, error } = await db.from('habits').update(patch)
    .eq('id', id).eq('user_id', USER_ID)
    .select('id, name, schedule_days, sort_order, active').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
