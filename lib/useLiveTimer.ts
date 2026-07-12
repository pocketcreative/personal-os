'use client';
import { useEffect, useState } from 'react';

/**
 * Live-ticking elapsed minutes for a running timer session, recomputed
 * from Date.now() - startedAt every second (not incrementally accumulated
 * — avoids clock drift). Returns 0 when startedAt is null (no running
 * session for this task).
 */
export function useLiveTimer(startedAt: string | null): number {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return 0;
  // Recomputing from Date.now() every render (not accumulating) is what
  // avoids clock drift for a live-ticking display. A useSyncExternalStore
  // rewrite is possible, but its getSnapshot would return a
  // constantly-drifting value, which risks tripping React's
  // snapshot-consistency checks in ways that are hard to verify are truly
  // benign — not worth that risk for a lint rule on a hook that already
  // works correctly.
  // eslint-disable-next-line react-hooks/purity -- intentional, see comment above
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 60_000);
}
