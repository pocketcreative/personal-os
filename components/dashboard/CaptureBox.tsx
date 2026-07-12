'use client';
import { useEffect, useRef, useState } from 'react';

export default function CaptureBox() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input whenever the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes the panel while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
      setTimeout(() => { setStatus('idle'); setOpen(false); }, 900);
    } else {
      const body = res ? await res.text().catch(() => '') : '';
      console.error('capture failed', body || '(network error)');
      // Text is intentionally kept (not cleared) on error so the user's draft isn't lost.
      setErrorMessage('Capture failed — check your connection and try again.');
      setStatus('error');
    }
  }

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 50 }}>
      {open && (
        <>
          {/* Click-outside-to-close overlay + stopPropagation panel — same
              pattern as components/tasks/FieldPopover.tsx. */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="flex w-[min(360px,calc(100vw-40px))] flex-col gap-1"
            style={{ position: 'absolute', bottom: 64, right: 0, zIndex: 60 }}
          >
            <div className="flex gap-2 rounded-xl border p-2 backdrop-blur-md"
              style={{
                borderColor: 'var(--ink-2)',
                background: 'color-mix(in oklch, var(--ink-1) 92%, transparent)',
                boxShadow: '0 8px 24px rgba(0,0,0,.15)',
              }}>
              <input
                ref={inputRef}
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
        </>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close capture' : 'Capture anything'}
        style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: 'var(--ink-0)', fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,.2)', position: 'relative', zIndex: 60,
        }}
      >
        {open ? '✕' : '+'}
      </button>
    </div>
  );
}
