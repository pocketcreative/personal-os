// Rate limiting for the PUBLIC share routes (/api/share/**). SERVER ONLY.
//
// A fixed window counter per caller, kept in Supabase (migration 0030) because
// Vercel serverless instances share no memory. The caller is a salted hash of
// their IP, never the raw IP. Two counts per window:
//   views: every request to a share route
//   fails: requests whose token lookup failed (token guessing shows up here)
// FAILS OPEN: if the counter is missing (migration not applied), errors, or
// the IP is unknown, the request is allowed, so a DB blip never locks out a
// real viewer.
import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { PUBLIC_HEADERS } from '@/lib/shares';

// All the tuning lives here. A board with ~20 images is ~21 requests per open,
// so 300 a minute allows about 14 full opens or refreshes. Only failed token
// lookups count as fails (a missing image on a valid link does not), and a real
// viewer at worst has one stale link and refreshes it, so 10 a minute is
// generous for people and tiny for a guesser (14,400 a day at most).
export const SHARE_RATE = {
  windowSeconds: 60,
  maxRequests: 300,
  maxFailures: 10,
} as const;

export interface RateCounts { views: number; fails: number }

// The counter storage, injectable so the logic can be tested without a DB.
export interface RateStore {
  // Counts one request and returns the totals, or null if the counter is unavailable.
  hitView(ipHash: string, windowStart: string): Promise<RateCounts | null>;
  hitFail(ipHash: string, windowStart: string): Promise<void>;
}

export interface RateContext { ipHash: string; windowStart: string }
export interface RateDecision { allowed: boolean; retryAfter: number; ctx: RateContext | null }

// On Vercel the edge overwrites x-forwarded-for with the real client address,
// so the first hop is the caller. Anything missing or oversized is "unknown".
export function clientIp(headers: Pick<Headers, 'get'>): string | null {
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = first || headers.get('x-real-ip')?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

// Salted so the hashes cannot be reversed by trying every IPv4 address.
export function hashIp(ip: string, salt = process.env.AUTH_SECRET ?? ''): string {
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}

export function windowStartFor(nowMs: number, windowSeconds = SHARE_RATE.windowSeconds): string {
  const size = windowSeconds * 1000;
  return new Date(Math.floor(nowMs / size) * size).toISOString();
}

export function isOverLimit(c: RateCounts): boolean {
  return c.views > SHARE_RATE.maxRequests || c.fails >= SHARE_RATE.maxFailures;
}

const supabaseStore: RateStore = {
  async hitView(ipHash, windowStart) {
    const { data, error } = await serviceClient().rpc('share_rate_view', { p_ip_hash: ipHash, p_window_start: windowStart });
    if (error) { warn(error.code); return null; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.view_count !== 'number' || typeof row.fail_count !== 'number') return null;
    return { views: row.view_count, fails: row.fail_count };
  },
  async hitFail(ipHash, windowStart) {
    const { error } = await serviceClient().rpc('share_rate_fail', { p_ip_hash: ipHash, p_window_start: windowStart });
    if (error) warn(error.code);
  },
};

// A missing function or table just means migration 0030 is not applied yet.
function warn(code: string | undefined) {
  if (code !== 'PGRST202' && code !== 'PGRST205' && code !== '42883' && code !== '42P01') console.error('share rate limit failed', code);
}

// Call first in every public share route. Counts the request and says whether
// to serve it. Keep the returned ctx to record a failed lookup afterwards.
export async function checkShareRate(
  headers: Pick<Headers, 'get'>,
  store: RateStore = supabaseStore,
  nowMs = Date.now(),
): Promise<RateDecision> {
  const ip = clientIp(headers);
  if (!ip) return { allowed: true, retryAfter: 0, ctx: null };
  const ctx = { ipHash: hashIp(ip), windowStart: windowStartFor(nowMs) };
  try {
    const counts = await store.hitView(ctx.ipHash, ctx.windowStart);
    if (counts && isOverLimit(counts)) {
      const windowEnd = new Date(ctx.windowStart).getTime() + SHARE_RATE.windowSeconds * 1000;
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowEnd - nowMs) / 1000)), ctx };
    }
  } catch (e) {
    console.error('share rate limit failed', e instanceof Error ? e.message : 'unknown');
  }
  return { allowed: true, retryAfter: 0, ctx };
}

// Call when the token lookup failed (any reason), before answering 404.
export async function recordShareFailure(ctx: RateContext | null, store: RateStore = supabaseStore): Promise<void> {
  if (!ctx) return;
  try {
    await store.hitFail(ctx.ipHash, ctx.windowStart);
  } catch (e) {
    console.error('share rate limit failed', e instanceof Error ? e.message : 'unknown');
  }
}

// Generic on purpose: says nothing about what was limited or why.
export function tooManyRequests(retryAfter: number) {
  return NextResponse.json({ error: 'too many requests' }, {
    status: 429,
    headers: { ...PUBLIC_HEADERS, 'retry-after': String(retryAfter) },
  });
}
