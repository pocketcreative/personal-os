'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LinkItem } from '@/lib/types';

export class LinksApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function apiError(res: Response, fallback: string): Promise<LinksApiError> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return new LinksApiError(body?.error || `${fallback} (${res.status})`, res.status);
}

interface LinksState { links: LinkItem[]; loading: boolean; error: string | null; }

// Same load-on-mount / event-refresh pattern as useBoards/useSops.
export function useLinks(status: 'active' | 'archived' = 'active') {
  const [state, setState] = useState<LinksState>({ links: [], loading: true, error: null });
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    let next: LinksState;
    try {
      const res = await fetch(`/api/links?status=${status}`);
      if (!res.ok) throw await apiError(res, 'Failed to load links');
      next = { links: await res.json(), loading: false, error: null };
    } catch (e) {
      next = { links: [], loading: false, error: (e as Error).message };
    }
    if (mountedRef.current) setState(next);
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    window.addEventListener('links:refresh', load);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('links:refresh', load);
    };
  }, [load]);

  return { ...state, reload: load };
}

export async function createLink(patch: Record<string, unknown>): Promise<LinkItem> {
  const res = await fetch('/api/links', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await apiError(res, 'Create failed');
  return res.json();
}

export async function saveLink(id: string, patch: Record<string, unknown>, updated_at: string): Promise<LinkItem> {
  const res = await fetch(`/api/links/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...patch, updated_at }),
  });
  if (!res.ok) {
    const err = await apiError(res, 'Save failed');
    throw res.status === 409 ? new LinksApiError('This link changed elsewhere -- reload before saving.', 409) : err;
  }
  return res.json();
}

export async function deleteLink(id: string): Promise<void> {
  const res = await fetch(`/api/links/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw await apiError(res, 'Delete failed');
}
