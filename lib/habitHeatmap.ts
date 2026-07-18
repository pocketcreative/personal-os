import { addDaysToKey, dateKeyDayOfWeek } from '@/lib/dates';
import type { HabitLogForStats } from '@/lib/habitStats';

/** Number of completed habit_logs per date key, e.g. for shading a heatmap cell. */
export function dailyCompletionCounts(logs: HabitLogForStats[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    if (!log.completed) continue;
    counts.set(log.log_date, (counts.get(log.log_date) ?? 0) + 1);
  }
  return counts;
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
