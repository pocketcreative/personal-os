import { addDaysToKey, dateKeyDayOfWeek } from '@/lib/dates';

export interface HabitForStats {
  id: string;
  schedule_days: number[]; // 0=Sun..6=Sat
  active: boolean;
}

export interface HabitLogForStats {
  habit_id: string;
  log_date: string; // YYYY-MM-DD
  completed: boolean;
}

/**
 * Completed / expected check-ins across `habits`, counting only days each
 * habit was scheduled for, from `periodStart` through `today` inclusive.
 * Using *elapsed* days (never past today) so the percentage isn't
 * artificially low right after a month/year boundary. Returns null (not 0)
 * when there was nothing to expect at all — e.g. no active habits — so
 * callers can render "—" instead of a misleading "0%".
 */
export function calcCompletionPercent(
  habits: HabitForStats[],
  logs: HabitLogForStats[],
  periodStart: string,
  today: string,
): number | null {
  const activeHabits = habits.filter((h) => h.active);
  const completedSet = new Set(
    logs.filter((l) => l.completed).map((l) => `${l.habit_id}|${l.log_date}`),
  );

  let expected = 0;
  let completed = 0;
  for (let d = periodStart; d <= today; d = addDaysToKey(d, 1)) {
    const dow = dateKeyDayOfWeek(d);
    for (const h of activeHabits) {
      if (!h.schedule_days.includes(dow)) continue;
      expected += 1;
      if (completedSet.has(`${h.id}|${d}`)) completed += 1;
    }
  }
  return expected === 0 ? null : Math.round((completed / expected) * 100);
}
