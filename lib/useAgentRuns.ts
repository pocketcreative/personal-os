'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AgentRun } from '@/lib/types';

async function fetchAll(): Promise<AgentRun[]> {
  const res = await fetch('/api/agent-runs');
  if (!res.ok) { console.error('fetchAgentRuns failed', res.status, await res.text()); return []; }
  return res.json();
}

async function deleteRunApi(id: string): Promise<boolean> {
  const res = await fetch(`/api/agent-runs/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteAgentRun failed', res.status, await res.text());
  return res.ok;
}

// Polls rather than a realtime subscription -- matches this app's existing
// pattern elsewhere (no Supabase realtime wiring anywhere yet), and a run
// board that's a few seconds stale is a fine tradeoff for not adding a new
// dependency just for this one view.
const POLL_MS = 5000;

export function useAgentRuns() {
  const [runs, setRuns] = useState<AgentRun[]>([]);

  const load = useCallback(async () => {
    setRuns(await fetchAll());
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const deleteRun = useCallback(async (id: string) => {
    setRuns((cur) => cur.filter((r) => r.id !== id));
    const ok = await deleteRunApi(id);
    if (!ok) load();
  }, [load]);

  return { runs, deleteRun };
}
