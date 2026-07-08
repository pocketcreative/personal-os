'use client';
import { useState } from 'react';

export default function CaptureBox() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Guard at the top, not just via the button's disabled attribute — the
    // input stays editable while busy, so Enter could otherwise fire a
    // second overlapping request before React re-renders the disabled state.
    if (!text.trim() || status === 'busy') return;
    setStatus('busy');
    setErrorMessage('');
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
      const body = res ? await res.text().catch(() => '') : '';
      console.error('capture failed', body || '(network error)');
      // Text is intentionally kept (not cleared) on error so the user's draft isn't lost.
      setErrorMessage('Capture failed — check your connection and try again.');
      setStatus('error');
    }
  }

  return (
    <form onSubmit={submit}
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(560px,90vw)] -translate-x-1/2 flex-col gap-1"
    >
      <div className="flex gap-2 rounded-xl border p-2 backdrop-blur-md"
        style={{ borderColor: 'var(--ink-2)', background: 'color-mix(in oklch, var(--ink-1) 90%, transparent)' }}>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Editing after a failure clears the stale error state, rather
            // than leaving "⚠ retry" showing indefinitely with no visible
            // signal of whether the problem is still happening.
            if (status === 'error') { setStatus('idle'); setErrorMessage(''); }
          }}
          placeholder="Capture anything…"
          className="flex-1 bg-transparent px-2 text-sm outline-none"
        />
        <button type="submit" disabled={status === 'busy'}
          className="rounded px-3 py-1 text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
          {status === 'busy' ? '…' : status === 'done' ? '✓' : status === 'error' ? '⚠ retry' : 'Capture'}
        </button>
      </div>
      {errorMessage && (
        <p role="alert" aria-live="polite" className="px-2 text-xs" style={{ color: 'var(--danger)' }}>
          {errorMessage}
        </p>
      )}
    </form>
  );
}
