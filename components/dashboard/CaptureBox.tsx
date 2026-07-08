'use client';
import { useState } from 'react';

export default function CaptureBox() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStatus('busy');
    const res = await fetch('/api/capture', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch((err) => { console.error(err); return null; });
    if (res?.ok) {
      setText('');
      setStatus('done');
      window.dispatchEvent(new Event('capture:done')); // task views listen and refetch
      setTimeout(() => setStatus('idle'), 2000);
    } else {
      console.error('capture failed', res && (await res.text()));
      setStatus('error');
    }
  }

  return (
    <form onSubmit={submit}
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(560px,90vw)] -translate-x-1/2 gap-2 rounded-xl border p-2 backdrop-blur-md"
      style={{ borderColor: 'var(--ink-2)', background: 'color-mix(in oklch, var(--ink-1) 90%, transparent)' }}>
      <input
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Capture anything…"
        className="flex-1 bg-transparent px-2 text-sm outline-none"
      />
      <button type="submit" disabled={status === 'busy'}
        className="rounded px-3 py-1 text-sm font-medium"
        style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
        {status === 'busy' ? '…' : status === 'done' ? '✓' : status === 'error' ? '⚠ retry' : 'Capture'}
      </button>
    </form>
  );
}
