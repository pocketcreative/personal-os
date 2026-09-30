import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { invalidStageOrStatus, syncZernioForPatch } from '@/lib/contentItemsServer';
import { cancelZernioPosts } from '@/lib/zernio';
import type { ContentItem, ContentItemType } from '@/lib/types';

const PATCHABLE = new Set([
  'name', 'stage', 'status', 'post_date', 'post_time', 'raw_footage', 'posted_footage', 'reference_video',
  'asset_link', 'platforms', 'caption', 'body_md', 'sort_order',
]);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  if (typeof patch.name === 'string' && !patch.name.trim()) {
    return NextResponse.json({ error: 'name cannot be blank' }, { status: 400 });
  }
  if ('post_time' in patch && patch.post_time != null && !TIME_RE.test(String(patch.post_time))) {
    return NextResponse.json({ error: 'post_time must be HH:MM (24-hour)' }, { status: 400 });
  }

  const db = serviceClient();
  const { data: current, error: fetchErr } = await db.from('content_items')
    .select('*').eq('id', id).eq('user_id', USER_ID).maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const type = current.type as ContentItemType;
  const invalid = invalidStageOrStatus(
    type,
    typeof patch.stage === 'string' ? patch.stage : undefined,
    'status' in patch ? (patch.status as string | null) : undefined,
  );
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (type !== 'lf' && patch.asset_link != null) {
    return NextResponse.json({ error: 'asset_link only applies to type=lf' }, { status: 400 });
  }

  // Real two-way Zernio sync (decision 6). Only runs when this patch could
  // actually change what's scheduled -- stage/post_date/platforms/caption --
  // so a plain title edit or comment doesn't touch the Zernio API at all.
  const touchesSchedule = ['stage', 'post_date', 'post_time', 'platforms', 'caption'].some((k) => k in patch);
  if (touchesSchedule) {
    const next = {
      stage: (patch.stage as string | undefined) ?? current.stage,
      post_date: 'post_date' in patch ? (patch.post_date as string | null) : current.post_date,
      post_time: 'post_time' in patch ? (patch.post_time as string | null) : current.post_time,
      platforms: (patch.platforms as string[] | undefined) ?? current.platforms,
      caption: 'caption' in patch ? (patch.caption as string | null) : current.caption,
      name: (patch.name as string | undefined) ?? current.name,
    };
    patch.zernio_post_ids = await syncZernioForPatch(current as ContentItem, next);
  }

  patch.updated_at = new Date().toISOString();
  const { data, error } = await db.from('content_items').update(patch)
    .eq('id', id).eq('user_id', USER_ID).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  const { data: current } = await db.from('content_items').select('*').eq('id', id).eq('user_id', USER_ID).maybeSingle();
  if (current) {
    const live = (current.zernio_post_ids ?? []).filter((r: { status: string }) => r.status === 'scheduled');
    if (live.length > 0) await cancelZernioPosts(live); // best-effort: don't block the delete on Zernio
  }
  const { error } = await db.from('content_items').delete().eq('id', id).eq('user_id', USER_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
