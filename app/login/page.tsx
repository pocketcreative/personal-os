'use client';
import { useState } from 'react';
import Panel from '@/components/ui/Panel';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch((err) => { console.error(err); return null; });
    if (res?.ok) {
      // A full navigation, not router.push(): App Router's client-side
      // navigation can reuse a cached "redirect to /login" result from
      // before the session cookie existed, bouncing straight back here
      // even though login succeeded. window.location forces a real
      // request that middleware re-evaluates with the fresh cookie.
      window.location.href = '/';
      return;
    }
    setBusy(false);
    setError('Wrong password.');
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <Panel title="Access">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" autoFocus
            className="rounded border bg-transparent p-2"
            style={{ borderColor: 'var(--ink-2)' }}
          />
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <button type="submit" disabled={busy} className="rounded p-2 font-medium"
            style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
            {busy ? '…' : 'Enter'}
          </button>
        </form>
      </Panel>
    </div>
  );
}
