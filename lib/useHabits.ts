'use client';
import { useCallback, useEffect, useState } from 'react';

export interface Habit {
  id: string;
  name: string;
  schedule_days: number[];
  sort_order: number;
  active: boolean;
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

export function useHabits() {
  const [data, setData] = useState<HabitsData | null>(null);

  const load = useCallback(async () => {
    const fresh = await fetchHabits();
    if (fresh) setData(fresh);
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
  const toggleLog = useCallback(async (habitId: string, logDate: string, completed: boolean) => {
    setData((cur) => {
      if (!cur) return cur;
      const others = cur.logs.filter((l) => !(l.habit_id === habitId && l.log_date === logDate));
      return { ...cur, logs: [...others, { habit_id: habitId, log_date: logDate, completed }] };
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
    setData((cur) => cur
      ? { ...cur, habits: cur.habits.map((h) => (h.id === habitId ? { ...h, name } : h)) }
      : cur);
    const ok = await renameHabitApi(habitId, name);
    if (!ok) load();
  }, [load]);

  const archiveHabit = useCallback(async (habitId: string) => {
    setData((cur) => cur ? { ...cur, habits: cur.habits.filter((h) => h.id !== habitId) } : cur);
    const ok = await archiveHabitApi(habitId);
    if (!ok) load();
  }, [load]);

  return { data, toggleLog, addHabit, renameHabit, archiveHabit };
}
