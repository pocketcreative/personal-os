import { describe, it, expect } from 'vitest';
import { dailyCompletionCounts, buildHeatmapWeeks } from '@/lib/habitHeatmap';
import type { HabitLogForStats } from '@/lib/habitStats';

const log = (habit_id: string, log_date: string, completed: boolean): HabitLogForStats =>
  ({ habit_id, log_date, completed });

describe('dailyCompletionCounts', () => {
  it('counts completed logs per day, one per matching date key', () => {
    const logs = [
      log('a', '2026-07-01', true),
      log('b', '2026-07-01', true),
      log('a', '2026-07-02', true),
    ];
    const counts = dailyCompletionCounts(logs);
    expect(counts.get('2026-07-01')).toBe(2);
    expect(counts.get('2026-07-02')).toBe(1);
  });

  it('ignores completed:false entries entirely', () => {
    const logs = [log('a', '2026-07-01', false)];
    expect(dailyCompletionCounts(logs).size).toBe(0);
  });

  it('returns undefined (not 0) for a day with no entries at all', () => {
    expect(dailyCompletionCounts([]).get('2026-07-01')).toBeUndefined();
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
