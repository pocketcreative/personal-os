'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push('/');
    else setError('Wrong password.');
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
          <button type="submit" className="rounded p-2 font-medium"
            style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
            Enter
          </button>
        </form>
      </Panel>
    </div>
  );
}
