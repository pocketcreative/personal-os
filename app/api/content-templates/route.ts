import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { CONTENT_ITEM_TYPES, type ContentItemType } from '@/lib/types';

// GET /api/content-templates -- optional ?type=lf returns just that one;
// omitted returns all 5 (used by the item detail page + template editor list).
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  if (type && !CONTENT_ITEM_TYPES.includes(type as ContentItemType)) {
    return NextResponse.json({ error: `type must be one of: ${CONTENT_ITEM_TYPES.join(', ')}` }, { status: 400 });
  }
  const db = serviceClient();
  let query = db.from('content_templates').select('*');
  if (type) query = query.eq('type', type);
  const { data, error } = await query.order('type');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(type ? (data?.[0] ?? null) : data, { headers: { 'cache-control': 'no-store' } });
}

// PATCH /api/content-templates?type=lf -- replaces the whole template as one
// markdown string (migration 0035: one continuous document, section
// structure is just `## Heading` lines within it -- no more separate
// add/remove/reorder section array).
export async function PATCH(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  if (!type || !CONTENT_ITEM_TYPES.includes(type as ContentItemType)) {
    return NextResponse.json({ error: `?type= must be one of: ${CONTENT_ITEM_TYPES.join(', ')}` }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (typeof body?.template_md !== 'string') {
    return NextResponse.json({ error: 'template_md must be a string' }, { status: 400 });
  }
  const db = serviceClient();
  const { data, error } = await db.from('content_templates')
    .update({ template_md: body.template_md, version: body.version ?? undefined, updated_at: new Date().toISOString() })
    .eq('type', type).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
