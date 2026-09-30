'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentItem, ContentItemType } from '@/lib/types';

async function fetchItems(type?: ContentItemType): Promise<ContentItem[]> {
  const res = await fetch(type ? `/api/content-items?type=${type}` : '/api/content-items');
  if (!res.ok) { console.error('fetchItems failed', res.status, await res.text()); return []; }
  return res.json();
}

async function createItem(type: ContentItemType, name: string): Promise<ContentItem | null> {
  const res = await fetch('/api/content-items', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, name }),
  });
  if (!res.ok) { console.error('createItem failed', res.status, await res.text()); return null; }
  return res.json();
}

async function patchItem(id: string, patch: Partial<ContentItem>): Promise<ContentItem | null> {
  const res = await fetch(`/api/content-items/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchItem failed', res.status, await res.text()); return null; }
  return res.json();
}

async function deleteItemApi(id: string): Promise<boolean> {
  const res = await fetch(`/api/content-items/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteItem failed', res.status, await res.text());
  return res.ok;
}

// type omitted = every type together, which is exactly what the calendar
// needs (one real query across all 5, see migration 0034's header note).
export function useContentItems(type?: ContentItemType) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    const data = await fetchItems(type);
    if (!dirtyRef.current) setItems(data);
    setLoading(false);
  }, [type]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const addItem = useCallback(async (itemType: ContentItemType, name: string) => {
    dirtyRef.current = true;
    const created = await createItem(itemType, name);
    if (created) setItems((cur) => [created, ...cur]);
    return created;
  }, []);

  const updateItem = useCallback(async (id: string, patch: Partial<ContentItem>) => {
    dirtyRef.current = true;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const saved = await patchItem(id, patch);
    if (saved) setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...saved } : it)));
    else load();
    return saved;
  }, [load]);

  const deleteItem = useCallback(async (id: string) => {
    dirtyRef.current = true;
    setItems((cur) => cur.filter((it) => it.id !== id));
    const ok = await deleteItemApi(id);
    if (!ok) load();
    return ok;
  }, [load]);

  return { items, loading, addItem, updateItem, deleteItem, reload: load };
}
