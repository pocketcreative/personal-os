'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentPiece } from '@/lib/types';
import { CONTENT_STATUSES } from '@/lib/types';

async function fetchAll(): Promise<ContentPiece[]> {
  const res = await fetch('/api/content');
  if (!res.ok) { console.error('fetchContent failed', res.status, await res.text()); return []; }
  return res.json();
}

async function createPiece(title: string, status: ContentPiece['status']): Promise<ContentPiece | null> {
  const res = await fetch('/api/content', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, status }),
  });
  if (!res.ok) { console.error('createContent failed', res.status, await res.text()); return null; }
  return res.json();
}

async function patchPiece(id: string, patch: Partial<ContentPiece>): Promise<ContentPiece | null> {
  const res = await fetch(`/api/content/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchContent failed', res.status, await res.text()); return null; }
  return res.json();
}

async function deletePieceApi(id: string): Promise<boolean> {
  const res = await fetch(`/api/content/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteContent failed', res.status, await res.text());
  return res.ok;
}

async function reorderApi(orderedIds: string[], status: ContentPiece['status']): Promise<boolean> {
  const res = await fetch('/api/content/reorder', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderedIds, status }),
  });
  if (!res.ok) console.error('reorderContent failed', res.status, await res.text());
  return res.ok;
}

function sortColumn(pieces: ContentPiece[]): ContentPiece[] {
  return [...pieces].sort((a, b) => {
    const aOrdered = a.sort_order !== null;
    const bOrdered = b.sort_order !== null;
    if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
    if (aOrdered && bOrdered) return (a.sort_order as number) - (b.sort_order as number);
    return b.created_at.localeCompare(a.created_at); // newest first among never-dragged cards
  });
}

export function useContentBoard() {
  const [pieces, setPieces] = useState<ContentPiece[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    const data = await fetchAll();
    if (!dirtyRef.current) setPieces(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const columns = CONTENT_STATUSES.map((status) => ({
    status,
    pieces: sortColumn(pieces.filter((p) => p.status === status)),
  }));

  const addPiece = useCallback(async (title: string, status: ContentPiece['status'] = 'draft') => {
    const created = await createPiece(title, status);
    if (created) setPieces((cur) => [created, ...cur]);
  }, []);

  const updatePiece = useCallback(async (id: string, patch: Partial<ContentPiece>) => {
    dirtyRef.current = true;
    setPieces((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const saved = await patchPiece(id, patch);
    // Merged rather than replaced: PATCH returns the raw content_pieces row,
    // which carries no comment counts (those are derived on the pieces GET).
    // Swapping the whole object in would blank the "needs re-edit" badge until
    // the next full board reload.
    if (saved) setPieces((cur) => cur.map((p) => (p.id === id ? { ...p, ...saved } : p)));
    else load();
  }, [load]);

  // Local-only. The comment thread has already written to the server; this
  // just keeps the card's badge honest without refetching the whole board.
  const setCommentCounts = useCallback((id: string, total: number, unresolved: number) => {
    setPieces((cur) => cur.map((p) => (
      p.id === id ? { ...p, comment_count: total, unresolved_comment_count: unresolved } : p
    )));
  }, []);

  const deletePiece = useCallback(async (id: string) => {
    dirtyRef.current = true;
    setPieces((cur) => cur.filter((p) => p.id !== id));
    const ok = await deletePieceApi(id);
    if (!ok) load();
  }, [load]);

  // Drop a card into `targetStatus` at position `index` within that column's
  // current cards. Builds the resulting column order and pushes it in one
  // request, so a cross-column move and its landing position commit together.
  const moveCard = useCallback(async (cardId: string, targetStatus: ContentPiece['status'], index: number) => {
    dirtyRef.current = true;
    setPieces((cur) => cur.map((p) => (p.id === cardId ? { ...p, status: targetStatus } : p)));
    const targetColumn = sortColumn(pieces.filter((p) => p.status === targetStatus && p.id !== cardId));
    const orderedIds = [...targetColumn.map((p) => p.id)];
    orderedIds.splice(index, 0, cardId);
    setPieces((cur) => {
      const byId = new Map(cur.map((p) => [p.id, p]));
      orderedIds.forEach((id, i) => { const p = byId.get(id); if (p) p.sort_order = i; });
      return [...cur];
    });
    const ok = await reorderApi(orderedIds, targetStatus);
    if (!ok) load();
  }, [pieces, load]);

  return {
    columns,
    activeId, setActiveId,
    activePiece: pieces.find((p) => p.id === activeId) ?? null,
    addPiece, updatePiece, deletePiece, moveCard, setCommentCounts,
  };
}
