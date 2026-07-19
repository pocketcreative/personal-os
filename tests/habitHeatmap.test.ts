import { describe, it, expect } from 'vitest';
import { dailyCompletionPercents, buildHeatmapWeeks, cellColor } from '@/lib/habitHeatmap';
import type { HabitForStats, HabitLogForStats } from '@/lib/habitStats';

const daily = (id: string): HabitForStats => ({ id, schedule_days: [0, 1, 2, 3, 4, 5, 6], active: true });
const weekdaysOnly = (id: string): HabitForStats => ({ id, schedule_days: [1, 2, 3, 4, 5], active: true });
const log = (habit_id: string, log_date: string, completed: boolean): HabitLogForStats =>
  ({ habit_id, log_date, completed });

describe('dailyCompletionPercents', () => {
  it('returns null for a day with nothing scheduled', () => {
    const percents = dailyCompletionPercents([], [], '2026-07-13', '2026-07-13');
    expect(percents.get('2026-07-13')).toBeNull();
  });

  it('computes 100 when every scheduled habit was completed that day', () => {
    const habits = [daily('h1'), daily('h2')];
    const logs = [log('h1', '2026-07-13', true), log('h2', '2026-07-13', true)];
    const percents = dailyCompletionPercents(habits, logs, '2026-07-13', '2026-07-13');
    expect(percents.get('2026-07-13')).toBe(100);
  });

  it('keeps 4-of-5 distinguishable from 5-of-5 -- the exact bug being fixed', () => {
    const habits = [daily('h1'), daily('h2'), daily('h3'), daily('h4'), daily('h5')];
    const logs = [
      log('h1', '2026-07-13', true), log('h2', '2026-07-13', true),
      log('h3', '2026-07-13', true), log('h4', '2026-07-13', true),
      log('h5', '2026-07-13', false),
    ];
    const percents = dailyCompletionPercents(habits, logs, '2026-07-13', '2026-07-13');
    expect(percents.get('2026-07-13')).toBe(80);
  });

  it('excludes archived habits from the denominator', () => {
    const habits = [daily('h1'), { id: 'h2', schedule_days: [0, 1, 2, 3, 4, 5, 6], active: false }];
    const logs = [log('h1', '2026-07-13', true)];
    const percents = dailyCompletionPercents(habits, logs, '2026-07-13', '2026-07-13');
    expect(percents.get('2026-07-13')).toBe(100);
  });

  it('only counts a habit on the days it is actually scheduled', () => {
    // 2026-07-17 is a Friday (weekday); 2026-07-19 is a Sunday (weekend)
    const habits = [weekdaysOnly('h1')];
    const logs = [log('h1', '2026-07-17', true)];
    const percents = dailyCompletionPercents(habits, logs, '2026-07-17', '2026-07-19');
    expect(percents.get('2026-07-17')).toBe(100);
    expect(percents.get('2026-07-19')).toBeNull();
  });

  it('returns one entry per day in the range, inclusive', () => {
    const percents = dailyCompletionPercents([daily('h1')], [], '2026-07-13', '2026-07-15');
    expect(percents.size).toBe(3);
    expect([...percents.keys()]).toEqual(['2026-07-13', '2026-07-14', '2026-07-15']);
  });
});

describe('buildHeatmapWeeks', () => {
  it('pads a range entirely within one week with nulls on both sides (Sun-start week)', () => {
    // 2026-07-01 is a Wednesday; that week is Sun 2026-06-28 .. Sat 2026-07-04
    expect(buildHeatmapWeeks('2026-07-01', '2026-07-03')).toEqual([
      [null, null, null, '2026-07-01', '2026-07-02', '2026-07-03', null],
    ]);
  });

  it('spans two weeks when the range crosses a week boundary', () => {
    // 2026-06-30 (Tue) through 2026-07-05 (Sun) crosses from one Sun-Sat week into the next
    expect(buildHeatmapWeeks('2026-06-30', '2026-07-05')).toEqual([
      [null, null, '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'],
      ['2026-07-05', null, null, null, null, null, null],
    ]);
  });

  it('every week has exactly 7 entries', () => {
    for (const week of buildHeatmapWeeks('2026-01-01', '2026-07-18')) {
      expect(week).toHaveLength(7);
    }
  });

  it('a single-day range still produces exactly one week', () => {
    expect(buildHeatmapWeeks('2026-07-01', '2026-07-01')).toEqual([
      [null, null, null, '2026-07-01', null, null, null],
    ]);
  });
});

describe('cellColor', () => {
  it('returns the empty color for null (nothing scheduled)', () => {
    expect(cellColor(null)).toBe('rgba(17,17,17,.05)');
  });

  it('returns the empty color for 0', () => {
    expect(cellColor(0)).toBe('rgba(17,17,17,.05)');
  });

  it('buckets 1-25 into the first shade', () => {
    expect(cellColor(1)).toBe('rgba(154,122,46,.28)');
    expect(cellColor(24)).toBe('rgba(154,122,46,.28)');
    expect(cellColor(25)).toBe('rgba(154,122,46,.28)');
  });

  it('buckets 26-50 into the second shade', () => {
    expect(cellColor(26)).toBe('rgba(154,122,46,.52)');
    expect(cellColor(50)).toBe('rgba(154,122,46,.52)');
  });

  it('buckets 51-75 into the third shade', () => {
    expect(cellColor(51)).toBe('rgba(154,122,46,.76)');
    expect(cellColor(75)).toBe('rgba(154,122,46,.76)');
  });

  it('buckets 76-99 into a fourth shade, distinct from both 75 and 100', () => {
    expect(cellColor(76)).toBe('rgba(154,122,46,.88)');
    expect(cellColor(99)).toBe('rgba(154,122,46,.88)');
  });

  it('returns a solid color for exactly 100', () => {
    expect(cellColor(100)).toBe('#9a7a2e');
  });

  it('keeps 75 and 76 visually distinct (the bucket boundary)', () => {
    expect(cellColor(75)).not.toBe(cellColor(76));
  });

  it('keeps 76 and 99 the same shade', () => {
    expect(cellColor(76)).toBe(cellColor(99));
  });

  it('keeps 99 and 100 visually distinct -- the exact bug that was already fixed once', () => {
    expect(cellColor(99)).not.toBe(cellColor(100));
  });
});
