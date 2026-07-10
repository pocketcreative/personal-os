'use client';
import { useEffect, useState } from 'react';

/**
 * SSR-safe media query hook. Defaults to `false` on the server and first
 * client render (no window), then syncs to the real value after mount —
 * matches this app's existing pattern of avoiding hydration mismatches
 * (see components/dashboard/TimerStrip.tsx's clock for the same approach).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [query]);

  return matches;
}
