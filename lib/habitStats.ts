import { addDaysToKey, dateKeyDayOfWeek, localDateKey } from '@/lib/dates';

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

/** The date the habits feature itself launched -- nothing was tracked before this, for any habit. */
export const HABITS_LAUNCH_DATE = '2026-07-18';

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

/**
 * The earliest date a habit's stats should ever consider: the later of the
 * habits-launch date and the habit's own creation date, so a habit added
 * after launch isn't penalized for days before it existed.
 */
export function habitTrackingStart(habitCreatedAt: string, launchDate: string = HABITS_LAUNCH_DATE): string {
  const createdDateKey = localDateKey(new Date(habitCreatedAt));
  return createdDateKey > launchDate ? createdDateKey : launchDate;
}

export interface HabitPeriodStats {
  week: number | null;
  month: number | null;
  year: number | null;
  allTime: number | null;
}

/**
 * Week/Month/Year/All-time completion percentage for a single habit, each
 * period's start clamped forward to habitTrackingStart so nothing before
 * launch or before the habit's own creation is ever counted as "expected".
 */
export function calcHabitPeriodStats(
  habit: HabitForStats & { created_at: string },
  logs: HabitLogForStats[],
  periods: { weekStart: string; monthStart: string; yearStart: string; today: string },
): HabitPeriodStats {
  const trackingStart = habitTrackingStart(habit.created_at);
  const clamp = (natural: string) => (trackingStart > natural ? trackingStart : natural);
  return {
    week: calcCompletionPercent([habit], logs, clamp(periods.weekStart), periods.today),
    month: calcCompletionPercent([habit], logs, clamp(periods.monthStart), periods.today),
    year: calcCompletionPercent([habit], logs, clamp(periods.yearStart), periods.today),
    allTime: calcCompletionPercent([habit], logs, trackingStart, periods.today),
  };
}
