import { NextRequest, NextResponse } from 'next/server';
import { serviceClient, USER_ID } from '@/lib/supabase';
import { createSignedToken, requireEnv, verifySignedToken } from '@/lib/auth';
import {
  PUBLIC_HEADERS, shareCookieName, shareTokenName, toSharedBoard, toSharedCms, toSharedSkill, toSharedSop, verifyPassword,
} from '@/lib/shares';
import { findActiveShare } from '@/lib/shareLookup';
import { checkShareRate, recordShareFailure, tooManyRequests } from '@/lib/shareRateLimit';
import type { ContentIdea, ContentItem } from '@/lib/types';

// PUBLIC route (no login, see middleware.ts). Returns only the one shared
// item's minimal data. Unknown, revoked, expired and malformed tokens all get
// the identical 404 body so nothing hints which case it was.
function notFound() {
  return NextResponse.json({ error: 'not found' }, { status: 404, headers: PUBLIC_HEADERS });
}

// True once the caller has proved they know this share's password (via the
// POST below), read from a cookie signed and scoped to this exact token.
async function isPasswordVerified(req: NextRequest, token: string): Promise<boolean> {
  return verifySignedToken(shareTokenName(token), req.cookies.get(shareCookieName(token))?.value, requireEnv('AUTH_SECRET'));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gate = await checkShareRate(req.headers);
  if (!gate.allowed) return tooManyRequests(gate.retryAfter);
  const share = await findActiveShare(token);
  if (!share) {
    await recordShareFailure(gate.ctx);
    return notFound();
  }

  if (share.password_hash && !(await isPasswordVerified(req, token))) {
    return NextResponse.json({ error: 'password required', password_required: true }, { status: 401, headers: PUBLIC_HEADERS });
  }

  const db = serviceClient();
  if (share.resource_type === 'sop') {
    const { data } = await db.from('sops').select('title,version,version_date,content').eq('id', share.resource_id).maybeSingle();
    if (!data) return notFound();
    return NextResponse.json(toSharedSop(data), { headers: PUBLIC_HEADERS });
  }
  if (share.resource_type === 'skill') {
    const { data } = await db.from('skills').select('slug,version,version_date,content').eq('id', share.resource_id).maybeSingle();
    if (!data) return notFound();
    return NextResponse.json(toSharedSkill(data), { headers: PUBLIC_HEADERS });
  }
  if (share.resource_type === 'cms') {
    const [{ data, error }, { data: ideas, error: ideasError }] = await Promise.all([
      db.from('content_items').select('*').eq('user_id', USER_ID),
      db.from('content_ideas').select('*').eq('user_id', USER_ID),
    ]);
    if (error) return notFound();
    return NextResponse.json(
      toSharedCms((data ?? []) as ContentItem[], ideasError ? [] : (ideas ?? []) as ContentIdea[]),
      { headers: PUBLIC_HEADERS },
    );
  }
  const { data } = await db.from('boards').select('title,scene').eq('id', share.resource_id).maybeSingle();
  if (!data) return notFound();
  return NextResponse.json(toSharedBoard(data), { headers: PUBLIC_HEADERS });
}

// Verifies a share's password and, on success, sets the signed cookie GET
// checks above. Wrong-password attempts count as rate-limit failures too
// (guessing the password is the exact risk this route exists to stop).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gate = await checkShareRate(req.headers);
  if (!gate.allowed) return tooManyRequests(gate.retryAfter);
  const share = await findActiveShare(token);
  if (!share) {
    await recordShareFailure(gate.ctx);
    return notFound();
  }
  if (!share.password_hash) return notFound();

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !verifyPassword(password, share.password_hash)) {
    await recordShareFailure(gate.ctx);
    return NextResponse.json({ error: 'incorrect password' }, { status: 401, headers: PUBLIC_HEADERS });
  }

  const res = NextResponse.json({ ok: true }, { headers: PUBLIC_HEADERS });
  res.cookies.set(shareCookieName(token), await createSignedToken(shareTokenName(token), requireEnv('AUTH_SECRET')), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 12 * 60 * 60, path: '/',
  });
  return res;
}
