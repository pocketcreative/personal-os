import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, requireEnv, SESSION_COOKIE } from '@/lib/auth';

const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/api/telegram/webhook', '/api/cron/'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.headers.get('x-api-secret') === process.env.API_SECRET) return NextResponse.next();
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, requireEnv('AUTH_SECRET'));
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
