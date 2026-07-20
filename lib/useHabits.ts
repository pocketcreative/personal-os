'use client';
import { useCallback, useEffect, useState } from 'react';

export interface Habit {
  id: string;
  name: string;
  schedule_days: number[];
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface HabitLog {
  habit_id: string;
  log_date: string;
  completed: boolean;
}

export interface HabitsData {
  habits: Habit[];
  logs: HabitLog[];
  today: string;
  weekDates: string[];
  monthStart: string;
  yearStart: string;
}

async function fetchHabits(): Promise<HabitsData | null> {
  const res = await fetch('/api/habits');
  if (!res.ok) { console.error('fetchHabits failed', res.status, await res.text()); return null; }
  return res.json();
}

// Module-level, not component state: survives HabitsBoard unmounting and
// remounting on client-side navigation away from and back to /habits (the
// component's own useState resets on every remount, but the module stays
// loaded for the life of the page). Lets a revisit render the last-known
// data immediately instead of a "Loading…" flash, while load() below still
// fires in the background to catch anything that changed elsewhere (e.g.
// toggled from Telegram or another device) since the last visit.
let habitsCache: HabitsData | null = null;

async function toggleLogApi(habitId: string, logDate: string, completed: boolean): Promise<boolean> {
  const res = await fetch(`/api/habits/${habitId}/log`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ log_date: logDate, completed }),
  });
  if (!res.ok) console.error('toggleLog failed', res.status, await res.text());
  return res.ok;
}

async function addHabitApi(name: string): Promise<Habit | null> {
  const res = await fetch('/api/habits', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) { console.error('addHabit failed', res.status, await res.text()); return null; }
  return res.json();
}

async function renameHabitApi(habitId: string, name: string): Promise<boolean> {
  const res = await fetch(`/api/habits/${habitId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) console.error('renameHabit failed', res.status, await res.text());
  return res.ok;
}

async function archiveHabitApi(habitId: string): Promise<boolean> {
  const res = await fetch(`/api/habits/${habitId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ active: false }),
  });
  if (!res.ok) console.error('archiveHabit failed', res.status, await res.text());
  return res.ok;
}

async function updateScheduleApi(habitId: string, scheduleDays: number[]): Promise<boolean> {
  const res = await fetch(`/api/habits/${habitId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schedule_days: scheduleDays }),
  });
  if (!res.ok) console.error('updateSchedule failed', res.status, await res.text());
  return res.ok;
}

export function useHabits() {
  const [data, setData] = useState<HabitsData | null>(habitsCache);

  const load = useCallback(async () => {
    const fresh = await fetchHabits();
    if (fresh) { habitsCache = fresh; setData(fresh); }
  }, []);

  // load()'s setData call happens after an await, not synchronously during
  // this effect's execution, so the cascading-render risk this rule guards
  // against doesn't apply — a genuine fetch-on-mount, same as
  // useTaskDashboard's mount effect (which only dodges this lint rule by
  // coincidence, because it also registers a window listener in the same
  // effect).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, see comment above
  useEffect(() => { load(); }, [load]);

  // Optimistic: flip the checkbox immediately, resync from the server only
  // if the write actually failed — same recovery pattern as
  // useTaskDashboard's applyPatch.
  // Optimistic updates below also write through to habitsCache (not just
  // component state) so a later remount doesn't show pre-update stale data.
  const toggleLog = useCallback(async (habitId: string, logDate: string, completed: boolean) => {
    setData((cur) => {
      if (!cur) return cur;
      const others = cur.logs.filter((l) => !(l.habit_id === habitId && l.log_date === logDate));
      const next = { ...cur, logs: [...others, { habit_id: habitId, log_date: logDate, completed }] };
      habitsCache = next;
      return next;
    });
    const ok = await toggleLogApi(habitId, logDate, completed);
    if (!ok) load();
  }, [load]);

  const addHabit = useCallback(async (name: string) => {
    const created = await addHabitApi(name);
    if (created) load();
    return created;
  }, [load]);

  const renameHabit = useCallback(async (habitId: string, name: string) => {
    setData((cur) => {
      if (!cur) return cur;
      const next = { ...cur, habits: cur.habits.map((h) => (h.id === habitId ? { ...h, name } : h)) };
      habitsCache = next;
      return next;
    });
    const ok = await renameHabitApi(habitId, name);
    if (!ok) load();
  }, [load]);

  const archiveHabit = useCallback(async (habitId: string) => {
    setData((cur) => {
      if (!cur) return cur;
      const next = { ...cur, habits: cur.habits.filter((h) => h.id !== habitId) };
      habitsCache = next;
      return next;
    });
    const ok = await archiveHabitApi(habitId);
    if (!ok) load();
  }, [load]);

  const updateSchedule = useCallback(async (habitId: string, scheduleDays: number[]) => {
    setData((cur) => {
      if (!cur) return cur;
      const next = {
        ...cur,
        habits: cur.habits.map((h) => (h.id === habitId ? { ...h, schedule_days: scheduleDays } : h)),
      };
      habitsCache = next;
      return next;
    });
    const ok = await updateScheduleApi(habitId, scheduleDays);
    if (!ok) load();
  }, [load]);

  return { data, toggleLog, addHabit, renameHabit, archiveHabit, updateSchedule };
}
