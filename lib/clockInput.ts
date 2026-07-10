/** Minutes -> "HH:MM" display string. */
export function formatClock(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes || 0));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Right-to-left digit-fill parser, ported from the design handoff's
 * parseClockInput (Task Dashboard.dc.html): strip non-digits, take the
 * last 4 (HHMM — this app stores minutes, not the mockup's HH:MM:SS
 * seconds-precision), split into HH/MM, clamp MM to 0-59, return total
 * minutes. This makes typing digits into the field behave like a
 * stopwatch/odometer entry — impossible to type letters or malformed values.
 */
export function parseClockInput(raw: string): number {
  let digits = (raw || '').replace(/\D/g, '');
  digits = digits.slice(-4).padStart(4, '0');
  const hh = parseInt(digits.slice(0, 2), 10);
  const mm = Math.min(59, parseInt(digits.slice(2, 4), 10));
  return hh * 60 + mm;
}
