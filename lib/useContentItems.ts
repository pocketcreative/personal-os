'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShareContext } from '@/lib/shareContext';
import type { ContentItem, ContentItemType } from '@/lib/types';
import type { SharedCmsItem } from '@/lib/shares';

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

// The public /share/[token] CMS view gets its items from the share-scoped
// routes instead -- a single GET returns every type + Idea at once (there is
// no per-type share endpoint), so this fetches that once and filters client
// side. SharedCmsItem is missing a few internal-only fields (user_id,
// zernio_post_ids, comment counts, timestamps) that no shared-page component
// actually reads for anything other than existing -- filled in with safe,
// inert defaults so the exact same ContentItem-typed components
// (ContentItemCard, ContentTable, CalendarView) render unmodified.
function sharedItemToContentItem(i: SharedCmsItem): ContentItem {
  return {
    ...i,
    user_id: '',
    zernio_post_ids: [],
    comment_count: 0,
    unresolved_comment_count: 0,
    created_at: '',
    updated_at: '',
  };
}

async function fetchSharedItems(token: string, type?: ContentItemType): Promise<ContentItem[]> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!res.ok) { console.error('fetchSharedItems failed', res.status); return []; }
  const data = await res.json() as { type: string; items?: SharedCmsItem[] };
  const items = (data.items ?? []).map(sharedItemToContentItem);
  return type ? items.filter((i) => i.type === type) : items;
}

async function patchSharedItem(token: string, id: string, patch: Partial<ContentItem>): Promise<Partial<ContentItem> | null> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}/content-items/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchSharedItem failed', res.status, await res.text()); return null; }
  return res.json();
}

// type omitted = every type together, which is exactly what the calendar
// needs (one real query across all 5, see migration 0034's header note).
export function useContentItems(type?: ContentItemType) {
  const share = useShareContext();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    const data = share ? await fetchSharedItems(share.token, type) : await fetchItems(type);
    if (!dirtyRef.current) setItems(data);
    setLoading(false);
  }, [type, share]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // No share-scoped route creates a content item -- a public link only ever
  // edits what's already there (see app/api/share/[token]/content-items/[id]).
  const addItem = useCallback(async (itemType: ContentItemType, name: string) => {
    if (share) return null;
    dirtyRef.current = true;
    const created = await createItem(itemType, name);
    if (created) setItems((cur) => [created, ...cur]);
    return created;
  }, [share]);

  const updateItem = useCallback(async (id: string, patch: Partial<ContentItem>): Promise<ContentItem | null> => {
    dirtyRef.current = true;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    // The share-scoped PATCH only ever returns the few fields it actually
    // saved (see app/api/share/[token]/content-items/[id]'s .select(...)),
    // never a full row -- callers only ever merge this into an existing
    // item (above, and in ItemDetail.tsx), never trust it as a complete one.
    const saved = share ? await patchSharedItem(share.token, id, patch) : await patchItem(id, patch);
    if (saved) setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...saved } : it)));
    else if (!share) load();
    return saved as ContentItem | null;
  }, [load, share]);

  // No share-scoped route deletes a content item either.
  const deleteItem = useCallback(async (id: string) => {
    if (share) return false;
    dirtyRef.current = true;
    setItems((cur) => cur.filter((it) => it.id !== id));
    const ok = await deleteItemApi(id);
    if (!ok) load();
    return ok;
  }, [load, share]);

  return { items, loading, addItem, updateItem, deleteItem, reload: load };
}
