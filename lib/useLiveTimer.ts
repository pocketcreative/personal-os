'use client';
import { useEffect, useState } from 'react';

/**
 * Live-ticking elapsed minutes for a running timer session, recomputed
 * from Date.now() - startedAt every second (not incrementally accumulated
 * — same pattern as the old global TimerStrip, now instantiated per-row).
 * Returns 0 when startedAt is null (no running session for this task).
 */
export function useLiveTimer(startedAt: string | null): number {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return 0;
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 60_000);
}
