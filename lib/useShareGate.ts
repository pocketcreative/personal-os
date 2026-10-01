'use client';
import { useEffect, useState } from 'react';

export type ShareGateState = 'loading' | 'ready' | 'unavailable' | 'password';

// Same password-gate state machine as SharedView's own `load`/`submitPassword`
// (that component keeps its own copy for sop/skill/board, which this hook
// doesn't need to touch) -- pulled out here so the new per-type
// /share/[token]/<tab> pages (SharedMediaPage) can gate on the exact same
// rules without re-fetching the item list themselves (ContentBoard/IdeasTab/
// CalendarView do that on their own, through useContentItems/
// useContentIdeas). `resourceType` lets the caller refuse to render the CMS
// board if the token actually points at a different kind of share (sop,
// skill, board) -- e.g. someone hand-editing the URL.
export function useShareGate(token: string) {
  const [state, setState] = useState<ShareGateState>('loading');
  const [resourceType, setResourceType] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function check(live: () => boolean) {
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (res.status === 401) {
        const body = await res.json().catch(() => null) as { password_required?: boolean } | null;
        if (live() && body?.password_required) { setState('password'); return; }
        throw new Error('unavailable');
      }
      if (!res.ok) throw new Error('unavailable');
      const data = await res.json().catch(() => null) as { type?: string } | null;
      if (live()) { setResourceType(data?.type ?? null); setState('ready'); }
    } catch {
      if (live()) setState('unavailable');
    }
  }

  useEffect(() => {
    let alive = true;
    check(() => alive);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function submitPassword() {
    if (!password || pwBusy) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setPwError(body?.error === 'incorrect password' ? 'Wrong password, try again.' : 'Something went wrong.');
        return;
      }
      setState('loading');
      await check(() => true);
    } finally {
      setPwBusy(false);
    }
  }

  return { state, resourceType, password, setPassword, pwError, pwBusy, submitPassword };
}
