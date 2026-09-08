'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentComment } from '@/lib/types';

async function fetchComments(pieceId: string): Promise<ContentComment[] | null> {
  const res = await fetch(`/api/content/${pieceId}/comments`);
  if (!res.ok) { console.error('fetchComments failed', res.status, await res.text()); return null; }
  return res.json();
}

// The comment thread for one piece. Only ever loaded when a piece is actually
// opened -- the board itself works off the counts the pieces GET already
// returns, so nothing here runs for cards you never click into.
export function useContentComments(pieceId: string, onCountsChange?: (total: number, unresolved: number) => void) {
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [loading, setLoading] = useState(true);

  // Held in a ref, not a dependency. Callers pass an inline arrow, so a fresh
  // identity arrives on every render -- depending on it would rebuild the
  // loader each time, re-fire the load effect, re-render, and loop forever.
  const onCountsChangeRef = useRef(onCountsChange);
  useEffect(() => { onCountsChangeRef.current = onCountsChange; });

  // Called explicitly after each successful change rather than from an effect
  // on `comments`, so a failed request never pushes a stale count up to the
  // board card.
  const report = useCallback((next: ContentComment[]) => {
    onCountsChangeRef.current?.(next.length, next.filter((c) => !c.resolved).length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchComments(pieceId);
      if (cancelled) return;
      setLoading(false);
      if (!data) return;
      setComments(data);
      report(data);
    })();
    return () => { cancelled = true; };
  }, [pieceId, report]);

  // Re-pull from the server after a write fails, so the optimistic state
  // doesn't stay ahead of what was actually saved.
  const reload = useCallback(async () => {
    const data = await fetchComments(pieceId);
    if (!data) return;
    setComments(data);
    report(data);
  }, [pieceId, report]);

  const addComment = useCallback(async (body: string, videoTimestampSeconds: number | null) => {
    const res = await fetch(`/api/content/${pieceId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body, video_timestamp_seconds: videoTimestampSeconds }),
    });
    if (!res.ok) { console.error('addComment failed', res.status, await res.text()); return; }
    const created: ContentComment = await res.json();
    setComments((cur) => { const next = [...cur, created]; report(next); return next; });
  }, [pieceId, report]);

  const setResolved = useCallback(async (commentId: string, resolved: boolean) => {
    setComments((cur) => {
      const next = cur.map((c) => (c.id === commentId ? { ...c, resolved } : c));
      report(next);
      return next;
    });
    const res = await fetch(`/api/content/${pieceId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    if (!res.ok) { console.error('setResolved failed', res.status, await res.text()); reload(); }
  }, [pieceId, report, reload]);

  const deleteComment = useCallback(async (commentId: string) => {
    setComments((cur) => { const next = cur.filter((c) => c.id !== commentId); report(next); return next; });
    const res = await fetch(`/api/content/${pieceId}/comments/${commentId}`, { method: 'DELETE' });
    if (!res.ok) { console.error('deleteComment failed', res.status, await res.text()); reload(); }
  }, [pieceId, report, reload]);

  return { comments, loading, addComment, setResolved, deleteComment };
}
