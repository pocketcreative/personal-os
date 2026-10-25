import { addDaysToKey, daysBetween, getWeekDates } from '@/lib/dates';

export type Habit = { id: string; name: string; sort_order: number };
export type DayItem = {
  id?: string;
  habit_id: string | null;
  name: string;
  done: boolean;
  sort_order: number;
};
/** One calendar day's score: pct is 0..100, or null when the day has no items. */
export type DayPoint = { date: string; pct: number | null };

/** done / total as 0..100. Zero items returns null (excluded from all stats). */
export function dayScore(items: Pick<DayItem, 'done'>[]): number | null {
  if (items.length === 0) return null;
  return (items.filter((i) => i.done).length / items.length) * 100;
}

/** Fresh unticked snapshot of the active habits, in sort order. */
export function snapshotFromHabits(habits: Habit[]): DayItem[] {
  return [...habits]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((h) => ({ habit_id: h.id, name: h.name, done: false, sort_order: h.sort_order }));
}

/**
 * Sync an existing snapshot to the current active habits (today/future only).
 * Adds new habits unticked, drops archived ones, renames in place, keeps `done`.
 * One-off items (habit_id null) are left alone.
 */
export function syncSnapshot(existing: DayItem[], habits: Habit[]): DayItem[] {
  const byHabit = new Map(habits.map((h) => [h.id, h]));
  const kept = existing
    .filter((i) => i.habit_id === null || byHabit.has(i.habit_id))
    .map((i) => {
      const h = i.habit_id ? byHabit.get(i.habit_id) : undefined;
      return h ? { ...i, name: h.name, sort_order: h.sort_order } : i;
    });
  const have = new Set(kept.map((i) => i.habit_id).filter(Boolean));
  const added = habits
    .filter((h) => !have.has(h.id))
    .map((h) => ({ habit_id: h.id, name: h.name, done: false, sort_order: h.sort_order }));
  return [...kept, ...added].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Daily series from the first logged day through `today`.
 * A day with no snapshot before today scores 0%. Today counts only once it has
 * a snapshot. A snapshot with zero items stays null (excluded).
 */
export function buildSeries(
  firstLoggedDate: string | null,
  today: string,
  itemsByDate: Map<string, Pick<DayItem, 'done'>[]>,
): DayPoint[] {
  if (!firstLoggedDate) return [];
  const out: DayPoint[] = [];
  const span = daysBetween(firstLoggedDate, today);
  for (let n = 0; n <= span; n++) {
    const date = addDaysToKey(firstLoggedDate, n);
    const items = itemsByDate.get(date);
    if (items) out.push({ date, pct: dayScore(items) });
    else if (date < today) out.push({ date, pct: 0 });
  }
  return out;
}

/** Mean of daily % (not total ticks / total items). Null when nothing counts. */
export function mean(points: DayPoint[]): number | null {
  const v = points.filter((p) => p.pct !== null) as { pct: number }[];
  return v.length === 0 ? null : v.reduce((s, p) => s + p.pct, 0) / v.length;
}

export type Grouping = 'week' | 'month' | 'year';
export type PeriodAverage = { key: string; avg: number; days: number };

function periodKey(date: string, g: Grouping): string {
  if (g === 'year') return date.slice(0, 4);
  if (g === 'month') return date.slice(0, 7);
  return getWeekDates(date)[0]; // Monday of that week
}

/** Averages per week (key = Monday), month (YYYY-MM) or year, oldest first. */
export function periodAverages(series: DayPoint[], g: Grouping): PeriodAverage[] {
  const buckets = new Map<string, DayPoint[]>();
  for (const p of series) {
    if (p.pct === null) continue;
    const k = periodKey(p.date, g);
    buckets.set(k, [...(buckets.get(k) ?? []), p]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, pts]) => ({ key, avg: mean(pts)!, days: pts.length }));
}

/** Mean over the last `n` calendar days ending at `today` (inclusive). */
export function trailingAverage(series: DayPoint[], today: string, n: number): number | null {
  const from = addDaysToKey(today, -(n - 1));
  return mean(series.filter((p) => p.date >= from && p.date <= today));
}

/**
 * Consecutive days at or above `threshold`, ending today if today qualifies,
 * otherwise ending yesterday (today may still be in progress).
 */
export function currentStreak(series: DayPoint[], today: string, threshold: number): number {
  const byDate = new Map(series.map((p) => [p.date, p.pct]));
  const qualifies = (d: string) => (byDate.get(d) ?? -1) >= threshold;
  let cursor = qualifies(today) ? today : addDaysToKey(today, -1);
  let streak = 0;
  while (qualifies(cursor)) {
    streak++;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

export type HabitRate = { name: string; done: number; total: number; pct: number };

/** Hit rate per habit (by habit_id, else name) over the given snapshot rows. */
export function perHabitHitRate(
  rows: { date: string; habit_id: string | null; name: string; done: boolean }[],
): HabitRate[] {
  const m = new Map<string, HabitRate>();
  for (const r of rows) {
    if (r.habit_id === null) continue; // one-offs aren't a habit
    const cur = m.get(r.habit_id) ?? { name: r.name, done: 0, total: 0, pct: 0 };
    cur.name = r.name;
    cur.total++;
    if (r.done) cur.done++;
    m.set(r.habit_id, cur);
  }
  return [...m.values()]
    .map((h) => ({ ...h, pct: (h.done / h.total) * 100 }))
    .sort((a, b) => a.pct - b.pct);
}
