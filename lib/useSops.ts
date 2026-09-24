'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Sop } from '@/lib/types';

async function fetchSops(): Promise<{ sops: Sop[]; error: string | null }> {
  const res = await fetch('/api/sops');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { sops: [], error: text || `Failed to load SOPs (${res.status})` };
  }
  return { sops: await res.json(), error: null };
}

interface SopsState { sops: Sop[]; loading: boolean; error: string | null; }

// Same load-on-mount / event-refresh pattern as useSkills.
export function useSops() {
  const [state, setState] = useState<SopsState>({ sops: [], loading: true, error: null });
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const result = await fetchSops();
    if (mountedRef.current) setState({ sops: result.sops, loading: false, error: result.error });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    window.addEventListener('sops:refresh', load);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('sops:refresh', load);
    };
  }, [load]);

  return { sops: state.sops, loading: state.loading, error: state.error, reload: load };
}

export async function fetchSop(id: string): Promise<Sop> {
  const res = await fetch(`/api/sops/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Failed to load SOP (${res.status})`);
  return res.json();
}

export async function createSop(title: string): Promise<Sop> {
  const res = await fetch('/api/sops', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Create failed (${res.status})`);
  return res.json();
}

export async function saveSop(id: string, patch: Record<string, unknown>, updated_at: string): Promise<Sop> {
  const res = await fetch(`/api/sops/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...patch, updated_at }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(res.status === 409 ? 'This SOP changed elsewhere -- reload before saving.' : (text || `Save failed (${res.status})`));
  }
  return res.json();
}
