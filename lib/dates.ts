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
