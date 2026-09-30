'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ContentIdea } from '@/lib/types';

export function useContentIdeas() {
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/content-ideas');
    if (res.ok) setIdeas(await res.json());
    else console.error('fetchIdeas failed', res.status, await res.text());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addIdea = useCallback(async (idea: string) => {
    const res = await fetch('/api/content-ideas', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idea }),
    });
    if (!res.ok) { console.error('addIdea failed', res.status, await res.text()); return false; }
    const created = await res.json();
    setIdeas((cur) => [created, ...cur]);
    return true;
  }, []);

  const updateIdea = useCallback(async (id: string, patch: Partial<ContentIdea>) => {
    setIdeas((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const res = await fetch(`/api/content-ideas/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!res.ok) { console.error('updateIdea failed', res.status, await res.text()); load(); }
  }, [load]);

  const deleteIdea = useCallback(async (id: string) => {
    setIdeas((cur) => cur.filter((i) => i.id !== id));
    const res = await fetch(`/api/content-ideas/${id}`, { method: 'DELETE' });
    if (!res.ok) { console.error('deleteIdea failed', res.status, await res.text()); load(); }
  }, [load]);

  return { ideas, loading, addIdea, updateIdea, deleteIdea };
}
