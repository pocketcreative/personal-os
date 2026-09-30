'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentItemComment } from '@/lib/types';

async function fetchComments(itemId: string): Promise<ContentItemComment[] | null> {
  const res = await fetch(`/api/content-items/${itemId}/comments`);
  if (!res.ok) { console.error('fetchComments failed', res.status, await res.text()); return null; }
  return res.json();
}

// Same shape as lib/useContentComments.ts (the older content_pieces version)
// -- kept as a near-duplicate rather than parameterising one hook over two
// different API base paths, since the two record types (ContentPiece vs
// ContentItem) are genuinely different shapes end to end.
export function useContentItemComments(itemId: string, onCountsChange?: (total: number, unresolved: number) => void) {
  const [comments, setComments] = useState<ContentItemComment[]>([]);
  const [loading, setLoading] = useState(true);
  const onCountsChangeRef = useRef(onCountsChange);
  useEffect(() => { onCountsChangeRef.current = onCountsChange; });

  const report = useCallback((next: ContentItemComment[]) => {
    onCountsChangeRef.current?.(next.length, next.filter((c) => !c.resolved).length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchComments(itemId);
      if (cancelled) return;
      setLoading(false);
      if (!data) return;
      setComments(data);
      report(data);
    })();
    return () => { cancelled = true; };
  }, [itemId, report]);

  const reload = useCallback(async () => {
    const data = await fetchComments(itemId);
    if (!data) return;
    setComments(data);
    report(data);
  }, [itemId, report]);

  const addComment = useCallback(async (body: string, videoTimestampSeconds: number | null) => {
    const res = await fetch(`/api/content-items/${itemId}/comments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body, video_timestamp_seconds: videoTimestampSeconds }),
    });
    if (!res.ok) { console.error('addComment failed', res.status, await res.text()); return false; }
    const created: ContentItemComment = await res.json();
    setComments((cur) => { const next = [...cur, created]; report(next); return next; });
    return true;
  }, [itemId, report]);

  const setResolved = useCallback(async (commentId: string, resolved: boolean) => {
    setComments((cur) => { const next = cur.map((c) => (c.id === commentId ? { ...c, resolved } : c)); report(next); return next; });
    const res = await fetch(`/api/content-items/${itemId}/comments/${commentId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resolved }),
    });
    if (!res.ok) { console.error('setResolved failed', res.status, await res.text()); reload(); }
  }, [itemId, report, reload]);

  const deleteComment = useCallback(async (commentId: string) => {
    setComments((cur) => { const next = cur.filter((c) => c.id !== commentId); report(next); return next; });
    const res = await fetch(`/api/content-items/${itemId}/comments/${commentId}`, { method: 'DELETE' });
    if (!res.ok) { console.error('deleteComment failed', res.status, await res.text()); reload(); }
  }, [itemId, report, reload]);

  return { comments, loading, addComment, setResolved, deleteComment };
}
