import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, requireEnv, SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  if (!password || password !== requireEnv('DASHBOARD_PASSWORD')) {
    return NextResponse.json({ error: 'wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(requireEnv('AUTH_SECRET')), {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60, path: '/',
  });
  return res;
}
