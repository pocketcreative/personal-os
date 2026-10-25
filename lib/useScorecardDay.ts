'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScorecardItem {
  id: string;
  habit_id: string | null;
  name: string;
  done: boolean;
  sort_order: number;
}
export interface ScorecardDay {
  date: string;
  today: string;
  note: string | null;
  items: ScorecardItem[];
}

type Edit =
  | { toggle: string; done: boolean }
  | { add: string }
  | { remove: string }
  | { note: string };

export function useScorecardDay(date: string | null) {
  const [day, setDay] = useState<ScorecardDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Edits are sent one at a time so a fast run of taps can't land out of order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/scorecard/day/${d}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setDay(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetch(`/api/scorecard/day/${date}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        return res.json() as Promise<ScorecardDay>;
      })
      .then((d) => { if (!cancelled) { setDay(d); setError(null); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [date]);

  const edit = useCallback((patch: Edit) => {
    if (!date) return;
    // Optimistic update for the actions where the result is predictable.
    if ('toggle' in patch) {
      setDay((d) => d && { ...d, items: d.items.map((i) => (i.id === patch.toggle ? { ...i, done: patch.done } : i)) });
    } else if ('remove' in patch) {
      setDay((d) => d && { ...d, items: d.items.filter((i) => i.id !== patch.remove) });
    } else if ('note' in patch) {
      setDay((d) => d && { ...d, note: patch.note || null });
    }
    queue.current = queue.current.then(async () => {
      try {
        const res = await fetch(`/api/scorecard/day/${date}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        const fresh: ScorecardDay = await res.json();
        // Only adopt the server copy once the queue is drained, else it would
        // briefly undo a later optimistic tick.
        queue.current = queue.current.then(() => undefined);
        setDay((cur) => (cur && cur.date === fresh.date ? fresh : cur));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
        void load(date); // roll back to what the server really has
      }
    });
  }, [date, load]);

  // A stale day from the previous date reads as loading until the new one lands.
  return { day: day && day.date === date ? day : null, error, edit };
}
