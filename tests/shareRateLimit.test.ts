import { describe, expect, it, vi } from 'vitest';
import {
  SHARE_RATE, checkShareRate, clientIp, hashIp, isOverLimit, recordShareFailure, tooManyRequests, windowStartFor,
  type RateStore,
} from '@/lib/shareRateLimit';

// In-memory stand-in for the Supabase counter: one row per (ip hash, window).
function memoryStore() {
  const rows = new Map<string, { views: number; fails: number }>();
  const row = (ip: string, w: string) => {
    const k = `${ip}|${w}`;
    if (!rows.has(k)) rows.set(k, { views: 0, fails: 0 });
    return rows.get(k)!;
  };
  const store: RateStore = {
    async hitView(ip, w) { const r = row(ip, w); r.views++; return { ...r }; },
    async hitFail(ip, w) { row(ip, w).fails++; },
  };
  return { store, rows };
}

const headers = (ip = '203.0.113.7') => new Headers({ 'x-forwarded-for': ip });
const T0 = Date.UTC(2026, 8, 25, 12, 0, 10);

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.7');
  });
  it('falls back to x-real-ip, then null', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ 'x-forwarded-for': ' ' }))).toBeNull();
    expect(clientIp(new Headers({ 'x-forwarded-for': 'x'.repeat(65) }))).toBeNull();
  });
});

describe('hashIp', () => {
  it('is stable, salted, and never contains the raw ip', () => {
    const h = hashIp('203.0.113.7', 'salt-a');
    expect(h).toBe(hashIp('203.0.113.7', 'salt-a'));
    expect(h).not.toBe(hashIp('203.0.113.7', 'salt-b'));
    expect(h).not.toBe(hashIp('203.0.113.8', 'salt-a'));
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain('203');
  });
});

describe('windowStartFor', () => {
  it('floors to the window and rolls over at the boundary', () => {
    expect(windowStartFor(T0)).toBe('2026-09-25T12:00:00.000Z');
    expect(windowStartFor(T0 + 49_000)).toBe('2026-09-25T12:00:00.000Z');
    expect(windowStartFor(T0 + 50_000)).toBe('2026-09-25T12:01:00.000Z');
  });
});

describe('isOverLimit', () => {
  it('blocks past the request limit, and at the failure limit', () => {
    expect(isOverLimit({ views: SHARE_RATE.maxRequests, fails: 0 })).toBe(false);
    expect(isOverLimit({ views: SHARE_RATE.maxRequests + 1, fails: 0 })).toBe(true);
    expect(isOverLimit({ views: 1, fails: SHARE_RATE.maxFailures - 1 })).toBe(false);
    expect(isOverLimit({ views: 1, fails: SHARE_RATE.maxFailures })).toBe(true);
  });
});

describe('checkShareRate', () => {
  it('lets a full board open (JSON + 20 images) several times in a row', async () => {
    const { store } = memoryStore();
    for (let i = 0; i < 5 * 21; i++) {
      expect((await checkShareRate(headers(), store, T0)).allowed).toBe(true);
    }
  });

  it('blocks after the request limit with a Retry-After to the window end', async () => {
    const { store } = memoryStore();
    for (let i = 0; i < SHARE_RATE.maxRequests; i++) await checkShareRate(headers(), store, T0);
    const d = await checkShareRate(headers(), store, T0);
    expect(d.allowed).toBe(false);
    expect(d.retryAfter).toBe(50);
  });

  it('blocks a guesser after the failure allowance, well before the request limit', async () => {
    const { store } = memoryStore();
    for (let i = 0; i < SHARE_RATE.maxFailures; i++) {
      const d = await checkShareRate(headers(), store, T0);
      expect(d.allowed).toBe(true);
      await recordShareFailure(d.ctx, store);
    }
    expect((await checkShareRate(headers(), store, T0)).allowed).toBe(false);
  });

  it('does not let failures from one caller block another', async () => {
    const { store } = memoryStore();
    for (let i = 0; i < SHARE_RATE.maxFailures; i++) {
      await recordShareFailure((await checkShareRate(headers('203.0.113.7'), store, T0)).ctx, store);
    }
    expect((await checkShareRate(headers('203.0.113.7'), store, T0)).allowed).toBe(false);
    expect((await checkShareRate(headers('198.51.100.4'), store, T0)).allowed).toBe(true);
  });

  it('resets in the next window', async () => {
    const { store } = memoryStore();
    for (let i = 0; i < SHARE_RATE.maxFailures; i++) {
      await recordShareFailure((await checkShareRate(headers(), store, T0)).ctx, store);
    }
    expect((await checkShareRate(headers(), store, T0)).allowed).toBe(false);
    expect((await checkShareRate(headers(), store, T0 + 60_000)).allowed).toBe(true);
  });

  it('stores only a hash, never the raw ip', async () => {
    const { store, rows } = memoryStore();
    await checkShareRate(headers('203.0.113.7'), store, T0);
    for (const key of rows.keys()) expect(key).not.toContain('203.0.113.7');
  });

  it('fails open when the counter is unavailable or throws', async () => {
    const unavailable: RateStore = { hitView: async () => null, hitFail: async () => {} };
    expect((await checkShareRate(headers(), unavailable, T0)).allowed).toBe(true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom: RateStore = { hitView: async () => { throw new Error('db down'); }, hitFail: async () => { throw new Error('db down'); } };
    const d = await checkShareRate(headers(), boom, T0);
    expect(d.allowed).toBe(true);
    await expect(recordShareFailure(d.ctx, boom)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('allows and records nothing when the ip is unknown', async () => {
    const { store, rows } = memoryStore();
    const d = await checkShareRate(new Headers(), store, T0);
    expect(d).toEqual({ allowed: true, retryAfter: 0, ctx: null });
    await recordShareFailure(d.ctx, store);
    expect(rows.size).toBe(0);
  });
});

describe('tooManyRequests', () => {
  it('is a generic 429 with Retry-After and no caching', async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'too many requests' });
  });
});
