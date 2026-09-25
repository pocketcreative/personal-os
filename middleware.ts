import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, requireEnv, SESSION_COOKIE } from '@/lib/auth';

// '/share/' and '/api/share/' are the view-only share links: they take an
// unguessable token and return only that one item. The owner's own share
// management API is '/api/shares' (no trailing slash match), which stays gated.
const PUBLIC_PREFIXES = ['/login', '/api/auth/', '/api/telegram/webhook', '/api/cron/', '/share/', '/api/share/'];

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
