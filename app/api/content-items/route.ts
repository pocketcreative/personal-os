import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { CONTENT_ITEM_TYPES, DEFAULT_STAGE, DEFAULT_STATUS, STAGE_OPTIONS, type ContentItemType } from '@/lib/types';

// GET /api/content-items -- optional ?type=lf filters to one board; omitted
// returns every type together, which is exactly what the unified calendar
// needs (one real query across all 5 types, no UNION -- see migration 0034).
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  if (type && !CONTENT_ITEM_TYPES.includes(type as ContentItemType)) {
    return NextResponse.json({ error: `type must be one of: ${CONTENT_ITEM_TYPES.join(', ')}` }, { status: 400 });
  }
  const db = serviceClient();
  let query = db.from('content_items').select('*').eq('user_id', USER_ID);
  if (type) query = query.eq('type', type);
  // Manually-dragged items (sort_order set) come first, in that order;
  // items never dragged (sort_order still null) fall back to newest-first,
  // matching the pre-drag-reorder behavior exactly.
  const { data, error } = await query
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Comment counts in one extra query, same N+1-avoidance pattern as /api/content.
  const ids = (data ?? []).map((p) => p.id as string);
  const counts = new Map<string, { total: number; unresolved: number }>();
  if (ids.length > 0) {
    const { data: comments } = await db.from('content_item_comments')
      .select('item_id, resolved').in('item_id', ids);
    for (const c of comments ?? []) {
      const entry = counts.get(c.item_id) ?? { total: 0, unresolved: 0 };
      entry.total++;
      if (!c.resolved) entry.unresolved++;
      counts.set(c.item_id, entry);
    }
  }
  const items = (data ?? []).map((p) => {
    const c = counts.get(p.id as string);
    return { ...p, comment_count: c?.total ?? 0, unresolved_comment_count: c?.unresolved ?? 0 };
  });
  return NextResponse.json(items, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const type = body.type as ContentItemType;
  if (!CONTENT_ITEM_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${CONTENT_ITEM_TYPES.join(', ')}` }, { status: 400 });
  }
  const stage = typeof body.stage === 'string' && STAGE_OPTIONS[type].includes(body.stage) ? body.stage : DEFAULT_STAGE[type];

  const db = serviceClient();

  // A new item's content starts as a copy of this type's current template
  // (single markdown document, migration 0035) unless the caller passed its
  // own body_md explicitly.
  let bodyMd = typeof body.body_md === 'string' ? body.body_md : null;
  if (bodyMd === null) {
    const { data: tpl } = await db.from('content_templates').select('template_md').eq('type', type).maybeSingle();
    bodyMd = tpl?.template_md ?? '';
  }

  const { data, error } = await db.from('content_items').insert({
    user_id: USER_ID,
    type,
    name: body.name.trim(),
    stage,
    status: DEFAULT_STATUS[type],
    post_date: body.post_date ?? null,
    post_time: body.post_time ?? null,
    raw_footage: body.raw_footage ?? null,
    posted_footage: body.posted_footage ?? null,
    reference_video: body.reference_video ?? null,
    asset_link: type === 'lf' ? (body.asset_link ?? null) : null,
    platforms: body.platforms ?? [],
    caption: body.caption ?? null,
    body_md: bodyMd,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, comment_count: 0, unresolved_comment_count: 0 }, { status: 201 });
}
