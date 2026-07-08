import { describe, it, expect } from 'vitest';
import { localDateKey } from '@/lib/dates';

describe('localDateKey', () => {
  it('is still "today" at 23:59 SGT (15:59 UTC)', () => {
    expect(localDateKey(new Date('2026-07-08T15:59:00Z'), 'Asia/Singapore')).toBe('2026-07-08');
  });
  it('rolls over at SGT midnight (16:00 UTC), not UTC midnight', () => {
    expect(localDateKey(new Date('2026-07-08T16:00:00Z'), 'Asia/Singapore')).toBe('2026-07-09');
  });
  it('formats as YYYY-MM-DD', () => {
    expect(localDateKey(new Date('2026-01-05T00:00:00Z'), 'Asia/Singapore')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
