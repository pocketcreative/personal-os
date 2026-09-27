import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/lib/auth';

// Pinged every 5-10 min by a free external service (cron-job.org, set up by
// Brendan) so /api/skills and /api/sops don't go cold on Vercel's Hobby plan
// (no 15-min cron here, so no built-in way to keep them warm otherwise).
// This route sits in middleware.ts's public '/api/cron/' prefix, so the
// CRON_SECRET check below is the only gate on it.
export const runtime = 'nodejs';

/**
 * Constant-time secret comparison, same pattern as the webhook route's
 * safeEqual -- this is a publicly-reachable URL with the secret check as its
 * only gate, so a plain !== comparison's timing leak is worth closing here.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

const WARM_TARGETS = ['/api/skills', '/api/sops'] as const;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${requireEnv('CRON_SECRET')}`;
  if (!safeEqual(authHeader, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const apiSecret = requireEnv('API_SECRET');
  const origin = req.nextUrl.origin;

  const outcomes = await Promise.allSettled(
    WARM_TARGETS.map((path) =>
      fetch(`${origin}${path}`, { headers: { 'x-api-secret': apiSecret }, cache: 'no-store' }),
    ),
  );

  const results = Object.fromEntries(
    WARM_TARGETS.map((path, i) => {
      const outcome = outcomes[i];
      const name = path.replace('/api/', '');
      return [name, outcome.status === 'fulfilled' && outcome.value.ok];
    }),
  );

  return NextResponse.json({
    ok: true,
    pinged: WARM_TARGETS.map((p) => p.replace('/api/', '')),
    results,
    at: new Date().toISOString(),
  });
}
