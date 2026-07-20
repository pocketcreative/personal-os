import { describe, it, expect } from 'vitest';
import { localDateKey, dateKeyDayOfWeek, addDaysToKey, getWeekDates, daysBetween } from '@/lib/dates';

describe('localDateKey', () => {
  it('is still "today" at 23:59 SGT (15:59 UTC)', () => {
    expect(localDateKey(new Date('2026-07-08T15:59:00Z'), 'Asia/Singapore')).toBe('2026-07-08');
  });
  it('rolls over at SGT midnight (16:00 UTC), not UTC midnight', () => {
    expect(localDateKey(new Date('2026-07-08T16:00:00Z'), 'Asia/Singapore')).toBe('2026-07-09');
  });
  it('formats as YYYY-MM-DD', () => {
    expect(localDateKey(new Date('2026-01-05T00:00:00Z'), 'Asia/Singapore')).toBe('2026-01-05');
  });
  it('defaults to Asia/Singapore when no timezone is passed', () => {
    expect(localDateKey(new Date('2026-07-08T16:00:00Z'))).toBe('2026-07-09');
  });
  it('threads a different timezone through correctly (UTC has no offset)', () => {
    expect(localDateKey(new Date('2026-07-08T16:00:00Z'), 'UTC')).toBe('2026-07-08');
  });
});

describe('dateKeyDayOfWeek', () => {
  it('returns 0 for a Sunday', () => {
    expect(dateKeyDayOfWeek('2026-07-19')).toBe(0);
  });
  it('returns 5 for a Friday', () => {
    expect(dateKeyDayOfWeek('2026-07-17')).toBe(5);
  });
  it('returns 1 for a Monday', () => {
    expect(dateKeyDayOfWeek('2026-07-13')).toBe(1);
  });
});

describe('addDaysToKey', () => {
  it('adds days within the same month', () => {
    expect(addDaysToKey('2026-07-13', 3)).toBe('2026-07-16');
  });
  it('subtracts days with a negative offset', () => {
    expect(addDaysToKey('2026-07-13', -1)).toBe('2026-07-12');
  });
  it('rolls over a month boundary', () => {
    expect(addDaysToKey('2026-07-31', 1)).toBe('2026-08-01');
  });
  it('adding 0 returns the same date', () => {
    expect(addDaysToKey('2026-07-13', 0)).toBe('2026-07-13');
  });
});

describe('getWeekDates', () => {
  it('returns Monday-Sunday for a date that is itself a Wednesday', () => {
    expect(getWeekDates('2026-07-15')).toEqual([
      '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16',
      '2026-07-17', '2026-07-18', '2026-07-19',
    ]);
  });
  it('returns the same week when given the Monday itself (first slot)', () => {
    expect(getWeekDates('2026-07-13')[0]).toBe('2026-07-13');
  });
  it('returns the same week when given the Sunday itself (last slot, not next week)', () => {
    const week = getWeekDates('2026-07-19');
    expect(week[0]).toBe('2026-07-13');
    expect(week[6]).toBe('2026-07-19');
  });
  it('handles a week that spans a month boundary', () => {
    expect(getWeekDates('2026-08-01')).toEqual([
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30',
      '2026-07-31', '2026-08-01', '2026-08-02',
    ]);
  });
});

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-07-18', '2026-07-18')).toBe(0);
  });
  it('returns a positive count when b is after a', () => {
    expect(daysBetween('2026-07-18', '2026-07-21')).toBe(3);
  });
  it('returns a negative count when b is before a', () => {
    expect(daysBetween('2026-07-21', '2026-07-18')).toBe(-3);
  });
  it('handles a month boundary', () => {
    expect(daysBetween('2026-07-30', '2026-08-02')).toBe(3);
  });
});
