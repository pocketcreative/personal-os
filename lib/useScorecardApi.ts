'use client';
import { useCallback, useEffect, useState } from 'react';

export interface HabitRow { id: string; name: string; sort_order: number; active: boolean; archived_at: string | null }
export interface HabitsData { habits: HabitRow[]; threshold: number }
export interface Point { date: string; pct: number | null }
export interface Period { key: string; avg: number; days: number }
export interface Stats {
  today: string;
  threshold: number;
  firstLogged: string | null;
  summary: { today: number | null; last7: number | null; last30: number | null; allTime: number | null; streak: number };
  heat: Point[];
  last30: Point[];
  weeks: Period[];
  months: Period[];
  years: Period[];
  habitRates: { name: string; done: number; total: number; pct: number }[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}

export function useHabits() {
  const [data, setData] = useState<HabitsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/scorecard/habits').then((r) => json<HabitsData>(r))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);

  const send = useCallback(async (method: 'POST' | 'PATCH', body: unknown) => {
    try {
      const res = await fetch('/api/scorecard/habits', {
        method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      setData(await json<HabitsData>(res));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  return { data, error, send };
}

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/scorecard/stats').then((r) => json<Stats>(r))
      .then((d) => { if (!cancelled) setStats(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, []);
  return { stats, error };
}
