import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { requireEnv, verifySignedToken } from '@/lib/auth';
import { PUBLIC_HEADERS, shareCookieName, shareTokenName } from '@/lib/shares';
import { findActiveShare } from '@/lib/shareLookup';
import { checkShareRate, recordShareFailure, tooManyRequests } from '@/lib/shareRateLimit';

// PUBLIC route, same pattern as content-items/[id]/route.ts: only a
// password-verified 'cms' share can reach this, and only idea/notes/used are
// patchable -- no sort_order (ordering stays the owner's own call), no
// create, no delete.
function notFound() {
  return NextResponse.json({ error: 'not found' }, { status: 404, headers: PUBLIC_HEADERS });
}

const PATCHABLE = new Set(['idea', 'notes', 'used']);

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
  if (typeof patch.idea === 'string' && !patch.idea.trim()) {
    return NextResponse.json({ error: 'idea cannot be blank' }, { status: 400, headers: PUBLIC_HEADERS });
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400, headers: PUBLIC_HEADERS });
  }

  patch.updated_at = new Date().toISOString();
  const db = serviceClient();
  const { data, error } = await db.from('content_ideas').update(patch)
    .eq('id', id).eq('user_id', USER_ID)
    .select('id,idea,notes,used,updated_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: PUBLIC_HEADERS });
  return NextResponse.json(data, { headers: PUBLIC_HEADERS });
}
