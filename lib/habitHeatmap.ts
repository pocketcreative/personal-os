import { addDaysToKey, dateKeyDayOfWeek } from '@/lib/dates';
import { calcCompletionPercent, type HabitForStats, type HabitLogForStats } from '@/lib/habitStats';

/**
 * Percentage of that day's SCHEDULED habits that were completed, one entry
 * per date in range. Reuses calcCompletionPercent (the same function behind
 * the month/year stats) with a single-day window, rather than a separate raw
 * completion count -- a fixed count scale breaks as soon as the habit
 * roster grows past its hardcoded bucket count (this was the actual bug:
 * with 5 habits, a 4-of-5 day and a 5-of-5 day were indistinguishable).
 * Percentage scales correctly regardless of how many habits exist.
 */
export function dailyCompletionPercents(
  habits: HabitForStats[],
  logs: HabitLogForStats[],
  startDate: string,
  endDate: string,
): Map<string, number | null> {
  const percents = new Map<string, number | null>();
  for (let d = startDate; d <= endDate; d = addDaysToKey(d, 1)) {
    percents.set(d, calcCompletionPercent(habits, logs, d, d));
  }
  return percents;
}

/**
 * Sun-Sat week columns (GitHub contribution graph convention — deliberately
 * not this app's own Mon-start weekly grid, since "GitHub-style" is what was
 * asked for) spanning `startDate` through `endDate` inclusive. The first and
 * last week are padded with null for the days that fall outside the range,
 * so every week is always exactly 7 entries and the grid stays rectangular.
 */
export function buildHeatmapWeeks(startDate: string, endDate: string): (string | null)[][] {
  const firstSunday = addDaysToKey(startDate, -dateKeyDayOfWeek(startDate));
  const weeks: (string | null)[][] = [];
  for (let cursor = firstSunday; cursor <= endDate; cursor = addDaysToKey(cursor, 7)) {
    const week: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysToKey(cursor, i);
      week.push(d >= startDate && d <= endDate ? d : null);
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Maps a day's completion percentage to the heatmap cell's background color.
 * Five visually distinct buckets: empty (null or 0%), then increasingly
 * opaque gold for 1-25 / 26-50 / 51-75 / 76-99, with a solid fill reserved
 * for exactly 100 -- see the inline comment below for why 76-99 and 100 must
 * stay visually distinct.
 */
export function cellColor(percent: number | null): string {
  if (percent === null || percent === 0) return 'rgba(17,17,17,.05)';
  if (percent <= 25) return 'rgba(154,122,46,.28)';
  if (percent <= 50) return 'rgba(154,122,46,.52)';
  if (percent <= 75) return 'rgba(154,122,46,.76)';
  // 76-99 gets its own step, distinct from the solid 100% below -- without
  // this, a day with one scheduled habit left undone (e.g. 4-of-5, 80%)
  // renders identically to a fully-completed day, which was the exact bug
  // this heatmap change was meant to fix.
  if (percent < 100) return 'rgba(154,122,46,.88)';
  return '#9a7a2e';
}
