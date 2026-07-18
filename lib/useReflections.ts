'use client';
import { useCallback, useEffect, useState } from 'react';

export interface ReflectionEntry {
  id: string | null;
  entry_date: string;
  raw_text: string;
  created_at: string | null;
}

export interface ReflectionsData {
  entries: ReflectionEntry[];
  today: string;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; conflictText: string }
  | { ok: false; conflictText: null };

async function fetchReflections(): Promise<ReflectionsData | null> {
  const res = await fetch('/api/reflections');
  if (!res.ok) { console.error('fetchReflections failed', res.status, await res.text()); return null; }
  return res.json();
}

// Module-level, not component state: survives ReflectionsBoard unmounting
// and remounting on client-side navigation away from and back to
// /reflections (same fix, same reasoning, as useHabits.ts's habitsCache —
// see that file's comment). Lets a revisit render the last-known list
// immediately instead of a "Loading…" flash, while load() below still fires
// in the background to catch anything that changed elsewhere since the last
// visit (e.g. a new Telegram reflection).
let reflectionsCache: ReflectionsData | null = null;

/**
 * Fetch one date's entry fresh from the server — deliberately never cached.
 * Called the instant an editor opens for a given date, so editing always
 * starts from the true current server state (which may include a
 * Telegram-appended addition since the list was last loaded) rather than a
 * possibly-stale list snapshot.
 */
export async function fetchEntryFresh(date: string): Promise<{ raw_text: string }> {
  const res = await fetch(`/api/reflections/${date}`);
  if (!res.ok) { console.error('fetchEntryFresh failed', res.status, await res.text()); return { raw_text: '' }; }
  return res.json();
}

export function useReflections() {
  const [data, setData] = useState<ReflectionsData | null>(reflectionsCache);

  const load = useCallback(async () => {
    const fresh = await fetchReflections();
    if (fresh) { reflectionsCache = fresh; setData(fresh); }
  }, []);

  // load()'s setData call happens after an await, not synchronously during
  // this effect's execution — same lint situation as useHabits.ts's mount
  // effect (see that file's comment for the full explanation).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, see useHabits.ts for the same pattern/reasoning
  useEffect(() => { load(); }, [load]);

  /**
   * expectedPreviousText: the text the editor started from. Pass it for a
   * normal save (conflict-checked); omit it (undefined) for an unconditional
   * overwrite (the "Overwrite anyway" path, used only after a 409 has
   * already shown the caller what they'd be discarding).
   */
  const saveEntry = useCallback(async (
    date: string,
    rawText: string,
    expectedPreviousText?: string,
  ): Promise<SaveResult> => {
    const res = await fetch(`/api/reflections/${date}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        expectedPreviousText === undefined
          ? { raw_text: rawText }
          : { raw_text: rawText, expected_previous_text: expectedPreviousText },
      ),
    });
    if (res.status === 409) {
      const json = await res.json();
      return { ok: false, conflictText: json.current_text };
    }
    if (!res.ok) {
      console.error('saveEntry failed', res.status, await res.text());
      return { ok: false, conflictText: null };
    }
    load(); // refresh the list so the saved text (and its preview) is current
    return { ok: true };
  }, [load]);

  return { data, saveEntry };
}
