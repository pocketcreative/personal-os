import { describe, it, expect } from 'vitest';
import { sumSessionMinutes } from '@/lib/timers';

describe('sumSessionMinutes', () => {
  it('sums closed sessions, rounded to minutes', () => {
    expect(sumSessionMinutes([
      { started_at: '2026-07-08T02:00:00Z', ended_at: '2026-07-08T02:25:00Z' },
      { started_at: '2026-07-08T05:00:00Z', ended_at: '2026-07-08T05:35:30Z' },
    ])).toBe(61); // 25 + 35.5 → round 60.5 = 61
  });
  it('counts an open session up to now', () => {
    const now = new Date('2026-07-08T03:00:00Z');
    expect(sumSessionMinutes([{ started_at: '2026-07-08T02:50:00Z', ended_at: null }], now)).toBe(10);
  });
  it('returns 0 for no sessions', () => {
    expect(sumSessionMinutes([])).toBe(0);
  });
});
