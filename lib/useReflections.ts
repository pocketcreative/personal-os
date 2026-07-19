'use client';
import { useCallback, useEffect, useState } from 'react';
import { mergeConflictingText } from '@/lib/reflectionMerge';

export interface ReflectionEntry {
  id: string | null;
  entry_date: string;
  raw_text: string;
  topic: string | null;
  created_at: string | null;
}

export interface ReflectionsData {
  entries: ReflectionEntry[];
  today: string;
}

export type AutosaveResult =
  | { ok: true; savedText: string; merged: boolean }
  | { ok: false };

async function fetchReflections(): Promise<ReflectionsData | null> {
  const res = await fetch('/api/reflections');
  if (!res.ok) { console.error('fetchReflections failed', res.status, await res.text()); return null; }
  return res.json();
}

// Module-level, not component state: survives ReflectionsBoard unmounting
// and remounting on client-side navigation (same fix, same reasoning, as
// useHabits.ts's habitsCache). Lets a revisit render the last-known list
// immediately instead of a "Loading…" flash.
let reflectionsCache: ReflectionsData | null = null;

/** Fetch one date's entry fresh from the server -- deliberately never cached (see original design rationale in the 2026-07-18 Reflections spec). */
export async function fetchEntryFresh(date: string): Promise<{ raw_text: string; topic: string | null }> {
  const res = await fetch(`/api/reflections/${date}`);
  if (!res.ok) { console.error('fetchEntryFresh failed', res.status, await res.text()); return { raw_text: '', topic: null }; }
  return res.json();
}

async function putEntry(
  date: string,
  rawText: string,
  topic: string | null,
  expectedPreviousText?: string,
): Promise<{ status: number; data: { current_text?: string; error?: string } }> {
  const res = await fetch(`/api/reflections/${date}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      expectedPreviousText === undefined
        ? { raw_text: rawText, topic }
        : { raw_text: rawText, topic, expected_previous_text: expectedPreviousText },
    ),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export function useReflections() {
  const [data, setData] = useState<ReflectionsData | null>(reflectionsCache);

  const load = useCallback(async () => {
    const fresh = await fetchReflections();
    if (fresh) { reflectionsCache = fresh; setData(fresh); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, see useHabits.ts for the same pattern/reasoning
  useEffect(() => { load(); }, [load]);

  /**
   * Saves with conflict-safety, fully self-contained: if the server's
   * raw_text no longer matches `expectedPreviousText` (e.g. a Telegram
   * message landed since this editor last knew the true state), this
   * automatically merges the server's current text with the caller's
   * draft and retries -- unconditionally, since we just read the true
   * current state. The caller never needs to know a conflict happened
   * except to react to `merged: true` in the result (e.g. show a brief
   * non-blocking notice). This is what lets autosave fire without ever
   * interrupting active typing with a blocking dialog.
   */
  const saveEntry = useCallback(async (
    date: string,
    rawText: string,
    topic: string | null,
    expectedPreviousText: string,
  ): Promise<AutosaveResult> => {
    const first = await putEntry(date, rawText, topic, expectedPreviousText);
    if (first.status === 200) {
      load();
      return { ok: true, savedText: rawText, merged: false };
    }
    if (first.status === 409) {
      // expectedPreviousText IS the ancestor: the text this save attempt
      // started from, before the server told us it had since changed.
      const mergedText = mergeConflictingText(first.data.current_text ?? '', rawText, expectedPreviousText);
      const retry = await putEntry(date, mergedText, topic);
      if (retry.status === 200) {
        load();
        return { ok: true, savedText: mergedText, merged: true };
      }
      console.error('saveEntry retry after merge failed', retry.status, retry.data);
      return { ok: false };
    }
    console.error('saveEntry failed', first.status, first.data);
    return { ok: false };
  }, [load]);

  return { data, saveEntry };
}
