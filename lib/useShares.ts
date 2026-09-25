'use client';
import type { ShareResource, ShareWithStatus } from '@/lib/shares';

// The API returns { error, code } JSON; surface just the message. When the
// table is missing (migration not applied) that message is already the
// friendly "one database step" text.
async function apiError(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error || `${fallback} (${res.status})`);
}

export async function fetchShares(type: ShareResource, id: string): Promise<ShareWithStatus[]> {
  const res = await fetch(`/api/shares?resource_type=${type}&resource_id=${encodeURIComponent(id)}`);
  if (!res.ok) throw await apiError(res, 'Failed to load links');
  return res.json();
}

export async function createShare(type: ShareResource, id: string, expiresOn: string): Promise<ShareWithStatus> {
  const res = await fetch('/api/shares', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resource_type: type, resource_id: id, ...(expiresOn ? { expires_at: expiresOn } : {}) }),
  });
  if (!res.ok) throw await apiError(res, 'Create failed');
  return res.json();
}

export async function setShareRevoked(shareId: string, revoked: boolean): Promise<ShareWithStatus> {
  const res = await fetch(`/api/shares/${encodeURIComponent(shareId)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revoked }),
  });
  if (!res.ok) throw await apiError(res, 'Update failed');
  return res.json();
}
