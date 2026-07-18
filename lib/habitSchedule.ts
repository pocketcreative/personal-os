const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // index = day-of-week, 0=Sun
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun, for display ordering

/** Human-readable summary of a habit's schedule_days (0=Sun..6=Sat). */
export function describeSchedule(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'Daily';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEK_ORDER.filter((d) => set.has(d)).map((d) => DAY_ABBR[d]).join(', ');
}
