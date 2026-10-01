'use client';
import { useCallback, useEffect, useState } from 'react';
import { useShareContext } from '@/lib/shareContext';
import type { ContentIdea } from '@/lib/types';
import type { SharedIdea } from '@/lib/shares';

// Same safe-default treatment as useContentItems' sharedItemToContentItem:
// SharedIdea only carries what the shared Ideas tab actually needs (idea,
// notes, used) -- the rest of ContentIdea is filled in inertly so the exact
// same IdeasTab component renders unmodified.
function sharedIdeaToContentIdea(i: SharedIdea): ContentIdea {
  return { ...i, user_id: '', sort_order: null, created_at: '', updated_at: '' };
}

async function fetchSharedIdeas(token: string): Promise<ContentIdea[]> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!res.ok) { console.error('fetchSharedIdeas failed', res.status); return []; }
  const data = await res.json() as { type: string; ideas?: SharedIdea[] };
  return (data.ideas ?? []).map(sharedIdeaToContentIdea);
}

async function patchSharedIdea(token: string, id: string, patch: Partial<ContentIdea>): Promise<Partial<ContentIdea> | null> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}/content-ideas/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchSharedIdea failed', res.status, await res.text()); return null; }
  return res.json();
}

async function fetchIdeas(): Promise<ContentIdea[]> {
  const res = await fetch('/api/content-ideas');
  if (res.ok) return res.json();
  console.error('fetchIdeas failed', res.status, await res.text());
  return [];
}

async function patchIdea(id: string, patch: Partial<ContentIdea>): Promise<ContentIdea | null> {
  const res = await fetch(`/api/content-ideas/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('updateIdea failed', res.status, await res.text()); return null; }
  return res.json();
}

export function useContentIdeas() {
  const share = useShareContext();
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = share ? await fetchSharedIdeas(share.token) : await fetchIdeas();
    setIdeas(data);
    setLoading(false);
  }, [share]);

  useEffect(() => { load(); }, [load]);

  // No share-scoped route creates an idea -- a public link only edits
  // what's already there.
  const addIdea = useCallback(async (idea: string) => {
    if (share) return false;
    const res = await fetch('/api/content-ideas', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea }),
    });
    if (!res.ok) { console.error('addIdea failed', res.status, await res.text()); return false; }
    const created = await res.json();
    setIdeas((cur) => [created, ...cur]);
    return true;
  }, [share]);

  const updateIdea = useCallback(async (id: string, patch: Partial<ContentIdea>) => {
    setIdeas((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const saved = share ? await patchSharedIdea(share.token, id, patch) : await patchIdea(id, patch);
    if (!saved && !share) load();
  }, [load, share]);

  // No share-scoped route deletes an idea either.
  const deleteIdea = useCallback(async (id: string) => {
    if (share) return;
    setIdeas((cur) => cur.filter((i) => i.id !== id));
    const res = await fetch(`/api/content-ideas/${id}`, { method: 'DELETE' });
    if (!res.ok) { console.error('deleteIdea failed', res.status, await res.text()); load(); }
  }, [load, share]);

  return { ideas, loading, addIdea, updateIdea, deleteIdea };
}
