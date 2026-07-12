'use client';
import { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'error';
  text: string;
}

let nextId = 1;

// Mirrors lib/capture.ts's CaptureOutcome + the assistant route's extra
// 'answer'/'error' variants — kept as a loose local shape (rather than
// importing server types into a client component) since we only read a
// few fields off it here.
type AssistantResponse =
  | { type: 'captured'; results: { classification: { summary: string; kind: string } }[] }
  | { type: 'edited'; taskId: string; title: string; summary: string }
  | { type: 'ambiguous'; candidateTitles: string[] }
  | { type: 'no_match' }
  | { type: 'answer'; note: string; ids: string[] }
  | { type: 'error'; message: string };

function describeOutcome(outcome: AssistantResponse): string {
  switch (outcome.type) {
    case 'captured':
      return outcome.results
        .map((r) => `✅ Created: ${r.classification.summary}`)
        .join('\n');
    case 'edited':
      return `✅ Updated "${outcome.title}"${outcome.summary ? ` — ${outcome.summary}` : ''}`;
    case 'ambiguous':
      return `Found a few possible matches — which did you mean? ${outcome.candidateTitles.join(', ')}`;
    case 'no_match':
      return "Couldn't find a task matching that. Want me to create it as new instead?";
    case 'answer':
      return outcome.note || "I didn't find anything useful to say about that.";
    case 'error':
      return `⚠ ${outcome.message}`;
  }
}

function outcomeTouchedTasks(outcome: AssistantResponse): boolean {
  return outcome.type === 'captured' || outcome.type === 'edited';
}

export default function CaptureBox() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

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

  // Keep the most recent message in view as the history grows.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Guard at the top, not just via the button's disabled attribute — the
    // input stays editable while busy, so Enter could otherwise fire a
    // second overlapping request before React re-renders the disabled state.
    const query = text.trim();
    if (!query || busy) return;
    setBusy(true);
    setMessages((m) => [...m, { id: nextId++, role: 'user', text: query }]);
    setText('');

    const res = await fetch('/api/assistant', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: query }),
    }).catch((err) => { console.error(err); return null; });

    const outcome = res ? ((await res.json().catch(() => null)) as AssistantResponse | null) : null;

    if (!outcome) {
      // Text is intentionally restored (not left cleared) on failure so the
      // user's draft isn't lost — matches the previous CaptureBox's spirit.
      setText(query);
      setMessages((m) => [...m, { id: nextId++, role: 'error', text: 'Message failed — check your connection and try again.' }]);
      setBusy(false);
      return;
    }

    setMessages((m) => [...m, { id: nextId++, role: outcome.type === 'error' ? 'error' : 'assistant', text: describeOutcome(outcome) }]);
    if (outcomeTouchedTasks(outcome)) {
      window.dispatchEvent(new Event('capture:done')); // task views listen and refetch
    }
    setBusy(false);
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
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-[min(380px,calc(100vw-40px))] flex-col gap-2 rounded-xl border p-2 backdrop-blur-md"
            style={{
              position: 'absolute', bottom: 64, right: 0, zIndex: 60,
              borderColor: 'var(--ink-2)',
              background: 'color-mix(in oklch, var(--ink-1) 92%, transparent)',
              boxShadow: '0 8px 24px rgba(0,0,0,.15)',
            }}
          >
            {messages.length > 0 && (
              <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 2px' }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      whiteSpace: 'pre-wrap',
                      fontSize: 13,
                      lineHeight: 1.4,
                      padding: '8px 12px',
                      borderRadius: 10,
                      background: m.role === 'user'
                        ? 'var(--accent)'
                        : m.role === 'error'
                          ? 'color-mix(in oklch, var(--danger) 12%, var(--ink-1))'
                          : 'var(--ink-0)',
                      color: m.role === 'user' ? 'var(--ink-0)' : m.role === 'error' ? 'var(--danger)' : 'var(--ink-4)',
                      border: m.role === 'assistant' ? '1px solid var(--ink-2)' : 'none',
                    }}
                  >
                    {m.text}
                  </div>
                ))}
                <div ref={listEndRef} />
              </div>
            )}
            <form onSubmit={submit} className="flex gap-2">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask, create, or update a task…"
                className="flex-1 bg-transparent px-2 text-sm outline-none"
                style={{ color: 'var(--ink-4)' }}
              />
              <button type="submit" disabled={busy}
                className="rounded px-3 py-1 text-sm font-medium"
                style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>
                {busy ? '…' : 'Send'}
              </button>
            </form>
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant — ask, create, or update a task'}
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
