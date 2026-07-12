'use client';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * SSR-safe media query hook via useSyncExternalStore — the React-recommended
 * way to subscribe to external browser state without triggering the
 * set-state-in-effect purity rule. Defaults to `false` on the server and
 * first client render (no window), then syncs to the real value after mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((callback: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }, [query]);

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
