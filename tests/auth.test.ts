import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken, requireEnv } from '@/lib/auth';

const SECRET = 'test-secret';

describe('requireEnv', () => {
  it('returns the value when set', () => {
    process.env.TEST_REQUIRED_VAR = 'present';
    expect(requireEnv('TEST_REQUIRED_VAR')).toBe('present');
    delete process.env.TEST_REQUIRED_VAR;
  });
  it('throws when missing, rather than silently returning undefined/empty', () => {
    delete process.env.TEST_REQUIRED_VAR;
    expect(() => requireEnv('TEST_REQUIRED_VAR')).toThrow('Missing required env var: TEST_REQUIRED_VAR');
  });
});

describe('session tokens', () => {
  it('round-trips a valid token', async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });
  it('rejects a tampered token', async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token + 'x', SECRET)).toBe(false);
  });
  it('rejects wrong secret, expired, and missing tokens', async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, 'other')).toBe(false);
    expect(await verifySessionToken(await createSessionToken(SECRET, -1000), SECRET)).toBe(false);
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
  });
});
