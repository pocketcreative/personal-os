const DEFAULT_TZ = process.env.USER_TIMEZONE ?? 'Asia/Singapore';

/** YYYY-MM-DD for the user's local day. Use for EVERY "what day is it" decision. */
export function localDateKey(d: Date = new Date(), timeZone: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
