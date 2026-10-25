import type { SupabaseClient } from '@supabase/supabase-js';
import { USER_ID } from '@/lib/supabase';
import { addDaysToKey, daysBetween, getWeekDates } from '@/lib/dates';
import {
  buildSeries, currentStreak, mean, perHabitHitRate, periodAverages, snapshotFromHabits,
  syncSnapshot, trailingAverage, type DayItem, type Habit,
} from '@/lib/scorecard';

export type StoredItem = DayItem & { id: string };

export async function activeHabits(db: SupabaseClient): Promise<Habit[]> {
  const { data, error } = await db.from('scorecard_habits')
    .select('id, name, sort_order')
    .eq('user_id', USER_ID).eq('active', true).order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadItems(db: SupabaseClient, date: string): Promise<StoredItem[]> {
  const { data, error } = await db.from('scorecard_day_items')
    .select('id, habit_id, name, done, sort_order')
    .eq('user_id', USER_ID).eq('date', date).order('sort_order').order('id');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Rule 1: snapshot on first touch. Rule 2: if `date` is today (or later), sync
 * the existing snapshot to the current template. Past days are never re-synced.
 */
export async function ensureDay(db: SupabaseClient, date: string, today: string) {
  const habits = await activeHabits(db);

  // ignoreDuplicates + select returns a row only if THIS call created the day,
  // so two concurrent first-touches can't both insert the snapshot.
  const { data: created, error: dayErr } = await db.from('scorecard_days')
    .upsert({ user_id: USER_ID, date }, { onConflict: 'user_id,date', ignoreDuplicates: true })
    .select('date');
  if (dayErr) throw new Error(dayErr.message);

  if (created && created.length > 0) {
    const rows = snapshotFromHabits(habits).map((i) => ({ ...i, user_id: USER_ID, date }));
    if (rows.length > 0) {
      const { error } = await db.from('scorecard_day_items').insert(rows);
      if (error) throw new Error(error.message);
    }
  } else if (date >= today) {
    const existing = await loadItems(db, date);
    const next = syncSnapshot(existing, habits);
    const keepIds = new Set(next.map((i) => (i as StoredItem).id).filter(Boolean));
    const removed = existing.filter((i) => !keepIds.has(i.id)).map((i) => i.id);
    if (removed.length > 0) {
      const { error } = await db.from('scorecard_day_items').delete().in('id', removed);
      if (error) throw new Error(error.message);
    }
    for (const i of next.filter((n) => (n as StoredItem).id)) {
      const old = existing.find((e) => e.id === (i as StoredItem).id)!;
      if (old.name !== i.name || old.sort_order !== i.sort_order) {
        const { error } = await db.from('scorecard_day_items')
          .update({ name: i.name, sort_order: i.sort_order }).eq('id', old.id);
        if (error) throw new Error(error.message);
      }
    }
    const added = next.filter((n) => !(n as StoredItem).id)
      .map((i) => ({ ...i, user_id: USER_ID, date }));
    if (added.length > 0) {
      const { error } = await db.from('scorecard_day_items').insert(added);
      if (error) throw new Error(error.message);
    }
  }

  const { data: day, error: noteErr } = await db.from('scorecard_days')
    .select('note').eq('user_id', USER_ID).eq('date', date).single();
  if (noteErr) throw new Error(noteErr.message);
  return { date, today, note: (day?.note as string | null) ?? null, items: await loadItems(db, date) };
}

/** PostgREST caps a response at 1000 rows by default; page through to get everything. */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function getThreshold(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('scorecard_settings').select('streak_threshold')
    .eq('user_id', USER_ID).maybeSingle();
  return (data?.streak_threshold as number | undefined) ?? 80;
}

export async function computeStats(db: SupabaseClient, today: string) {
  const days = await fetchAll<{ date: string }>((a, b) =>
    db.from('scorecard_days').select('date').eq('user_id', USER_ID).order('date').range(a, b));
  const items = await fetchAll<{ date: string; habit_id: string | null; name: string; done: boolean }>((a, b) =>
    db.from('scorecard_day_items').select('date, habit_id, name, done')
      .eq('user_id', USER_ID).order('date').order('id').range(a, b));

  // Seed from days so a snapshot with zero items stays null instead of reading as "missed".
  const byDate = new Map<string, { done: boolean }[]>(days.map((d) => [d.date, []]));
  for (const i of items) byDate.get(i.date)?.push(i);

  const series = buildSeries(days[0]?.date ?? null, today, byDate);
  const threshold = await getThreshold(db);
  const pctByDate = new Map(series.map((p) => [p.date, p.pct]));

  // 26 weeks, Monday-start, ending with the current week (future cells dropped).
  const thisMonday = getWeekDates(today)[0];
  const heatStart = addDaysToKey(thisMonday, -25 * 7);
  const heat = Array.from({ length: daysBetween(heatStart, today) + 1 }, (_, n) => {
    const date = addDaysToKey(heatStart, n);
    return { date, pct: pctByDate.get(date) ?? null };
  });

  const from30 = addDaysToKey(today, -29);
  return {
    today,
    threshold,
    firstLogged: days[0]?.date ?? null,
    summary: {
      today: pctByDate.get(today) ?? null,
      last7: trailingAverage(series, today, 7),
      last30: trailingAverage(series, today, 30),
      allTime: mean(series),
      streak: currentStreak(series, today, threshold),
    },
    heat,
    last30: series.filter((p) => p.date >= from30),
    weeks: periodAverages(series, 'week').slice(-12),
    months: periodAverages(series, 'month').slice(-12),
    years: periodAverages(series, 'year'),
    habitRates: perHabitHitRate(items.filter((i) => i.date >= from30)),
  };
}
