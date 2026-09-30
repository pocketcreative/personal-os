import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { requireEnv, verifySignedToken } from '@/lib/auth';
import { invalidStageOrStatus } from '@/lib/contentItemsServer';
import { PUBLIC_HEADERS, shareCookieName, shareTokenName } from '@/lib/shares';
import { findActiveShare } from '@/lib/shareLookup';
import { checkShareRate, recordShareFailure, tooManyRequests } from '@/lib/shareRateLimit';
import type { ContentItemType } from '@/lib/types';

// PUBLIC route (no login, see middleware.ts -- '/api/share/' is a public
// prefix). Lets anyone holding a password-verified 'cms' share link edit a
// content item's real content, per Brendan's own "yeap good" to making the
// external CMS share editable, not just view-only.
//
// Deliberately narrow, not a proxy onto /api/content-items/[id]:
//  - Only 'cms' shares can reach this route (no board/sop/skill share can
//    edit anything through it).
//  - Only body_md, stage, status are patchable -- never post_date, platforms,
//    caption, raw_footage, etc, and never anything Zernio-related. A stage
//    edit here does NOT call syncZernioForPatch: the owner's own PATCH route
//    schedules/cancels real live Instagram/Facebook posts when stage +
//    post_date + platforms line up, and letting an anonymous password-gated
//    editor trigger that would be a real safety problem, not just scope
//    creep. If an edit here needs to also push a live schedule change,
//    that's a deliberate follow-up for Brendan to confirm, not a default.
//
// Real safety note (surfaced to Brendan, not just written here): this gate is
// a shared password, not a per-person login -- anyone with the link+password
// can edit, and there is no per-editor audit trail (content_item_comments
// exists but nothing here writes to it). That is exactly what "editable, not
// view-only" was asked for, just flagging it plainly.
function notFound() {
  return NextResponse.json({ error: 'not found' }, { status: 404, headers: PUBLIC_HEADERS });
}

const PATCHABLE = new Set(['body_md', 'stage', 'status']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const gate = await checkShareRate(req.headers);
  if (!gate.allowed) return tooManyRequests(gate.retryAfter);

  const share = await findActiveShare(token);
  if (!share || share.resource_type !== 'cms') {
    await recordShareFailure(gate.ctx);
    return notFound();
  }
  if (share.password_hash) {
    const authed = await verifySignedToken(shareTokenName(token), req.cookies.get(shareCookieName(token))?.value, requireEnv('AUTH_SECRET'));
    if (!authed) return notFound();
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (PATCHABLE.has(k)) patch[k] = v;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400, headers: PUBLIC_HEADERS });
  }

  const db = serviceClient();
  const { data: current, error: fetchErr } = await db.from('content_items')
    .select('id,type').eq('id', id).eq('user_id', USER_ID).maybeSingle();
  if (fetchErr || !current) return notFound();

  const invalid = invalidStageOrStatus(
    current.type as ContentItemType,
    typeof patch.stage === 'string' ? patch.stage : undefined,
    'status' in patch ? (patch.status as string | null) : undefined,
  );
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400, headers: PUBLIC_HEADERS });

  patch.updated_at = new Date().toISOString();
  const { data, error } = await db.from('content_items').update(patch)
    .eq('id', id).eq('user_id', USER_ID)
    .select('id,body_md,stage,status,updated_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: PUBLIC_HEADERS });
  return NextResponse.json(data, { headers: PUBLIC_HEADERS });
}
