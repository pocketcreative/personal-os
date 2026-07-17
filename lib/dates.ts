/**
 * YYYY-MM-DD for the user's local day. Use for EVERY "what day is it" decision.
 * SGT is UTC+8; naive UTC-based date math (e.g. toISOString().slice(0,10)) rolls
 * the day over 8 hours early for the user. Never bypass this with raw Date math.
 */
export function localDateKey(
  d: Date = new Date(),
  timeZone: string = process.env.USER_TIMEZONE ?? 'Asia/Singapore',
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * Day of week (0=Sun..6=Sat, matching JS Date and Postgres int[] schedule_days
 * convention) for a YYYY-MM-DD key. Pure calendar-date arithmetic via
 * Date.UTC — deliberately NOT tied to any real timezone, since dateKey is
 * already a resolved calendar date (e.g. from localDateKey()), not a moment
 * in time that needs zone conversion.
 */
export function dateKeyDayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** YYYY-MM-DD key `days` calendar days after `dateKey` (negative to go back). */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * The 7 YYYY-MM-DD keys (Monday through Sunday) for the week containing
 * `dateKey`. Monday-start, matching ISO week convention.
 */
export function getWeekDates(dateKey: string): string[] {
  const dow = dateKeyDayOfWeek(dateKey);
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = addDaysToKey(dateKey, diffToMonday);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
}
