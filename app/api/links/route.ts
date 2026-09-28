import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';

// Active by default; ?status=archived to see archived rows. Ordered by
// sort_order (manual order Brendan sets), not created_at, so editing a row
// doesn't reshuffle the list.
export async function GET(req: NextRequest) {
  const db = serviceClient();
  const status = req.nextUrl.searchParams.get('status') ?? 'active';
  const { data, error } = await db.from('links').select('*')
    .eq('user_id', USER_ID).eq('status', status).order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}

// New rows land at the end of the active list by default (max sort_order + 1),
// so "+ Add link" doesn't need the caller to know the current order.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, url, trigger_link, live_tested } = body as {
    name?: unknown; url?: unknown; trigger_link?: unknown; live_tested?: unknown;
  };
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const db = serviceClient();

  const { data: maxRow } = await db.from('links').select('sort_order')
    .eq('user_id', USER_ID).order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await db.from('links')
    .insert({
      user_id: USER_ID,
      name: name.trim(),
      url: typeof url === 'string' && url.trim() ? url.trim() : null,
      trigger_link: typeof trigger_link === 'string' && trigger_link.trim() ? trigger_link.trim() : null,
      live_tested: typeof live_tested === 'boolean' ? live_tested : false,
      sort_order: nextSortOrder,
    })
    .select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
