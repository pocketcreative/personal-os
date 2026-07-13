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

// The voice endpoint (app/api/assistant/voice) transcribes only — it never
// runs the transcript through the assistant routing pipeline itself, so the
// user gets a chance to fix a mishearing before it becomes a wrong task/edit.
type VoiceResponse = { type: 'transcript'; transcript: string } | { type: 'error'; message: string };

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

// idle -> recording -> transcribing -> idle (or back to idle on error at
// any point). Kept as a small enum rather than booleans so the mic button
// only ever renders one of three unambiguous states.
type RecState = 'idle' | 'recording' | 'transcribing';

export default function CaptureBox() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [recState, setRecState] = useState<RecState>('idle');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const isBusy = busy || recState !== 'idle';

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

  // Release the mic if the panel is closed mid-recording rather than
  // leaving the browser's recording indicator on with no way to stop it.
  useEffect(() => {
    if (!open && recState === 'recording') {
      mediaRecorderRef.current?.stop();
    }
  }, [open, recState]);

  // Keep the most recent message in view as the history grows.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Auto-grow the textarea to fit typed or voice-transcribed text (up to a
  // cap, then it scrolls) — re-runs on every text change regardless of
  // source, since voice/failure-restore set `text` programmatically and
  // never fire a native input event.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  function appendOutcomeMessages(outcome: AssistantResponse) {
    setMessages((m) => [...m, { id: nextId++, role: outcome.type === 'error' ? 'error' : 'assistant', text: describeOutcome(outcome) }]);
    if (outcomeTouchedTasks(outcome)) {
      window.dispatchEvent(new Event('capture:done')); // task views listen and refetch
    }
  }

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    // Guard at the top, not just via the button's disabled attribute — the
    // input stays editable while busy, so Enter could otherwise fire a
    // second overlapping request before React re-renders the disabled state.
    const query = text.trim();
    if (!query || isBusy) return;
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

    appendOutcomeMessages(outcome);
    setBusy(false);
  }

  async function startRecording() {
    if (isBusy) return;
    if (typeof MediaRecorder === 'undefined') {
      setMessages((m) => [...m, { id: nextId++, role: 'error', text: "Voice recording isn't supported in this browser." }]);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('getUserMedia failed', err);
      setMessages((m) => [...m, { id: nextId++, role: 'error', text: 'Microphone access denied — check your browser permissions.' }]);
      return;
    }

    // Let the browser pick its own supported mimeType rather than
    // hardcoding one — Chrome/Edge/Firefox default to audio/webm (often
    // with a codecs=opus suffix); the backend's transcribeWebm treats any
    // webm-family type the same way.
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      void handleVoiceBlob(blob);
    };
    mediaRecorderRef.current = mr;
    mr.start();
    setRecState('recording');
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecState('transcribing');
  }

  async function handleVoiceBlob(blob: Blob) {
    const form = new FormData();
    form.append('audio', blob, 'voice.webm');

    const res = await fetch('/api/assistant/voice', { method: 'POST', body: form })
      .catch((err) => { console.error(err); return null; });

    const result = res ? ((await res.json().catch(() => null)) as VoiceResponse | null) : null;

    if (!result || result.type !== 'transcript' || !result.transcript.trim()) {
      const message = result?.type === 'error' ? result.message : 'Voice message failed — check your connection and try again.';
      setMessages((m) => [...m, { id: nextId++, role: 'error', text: `⚠ ${message}` }]);
      setRecState('idle');
      return;
    }

    // Drop the transcript into the input for review/editing rather than
    // sending it straight away — Whisper mishearing a short phrase should
    // be catchable before it turns into a wrong task/edit, not after.
    setText(result.transcript);
    setRecState('idle');
    inputRef.current?.focus();
  }

  function onMicClick() {
    if (recState === 'idle') void startRecording();
    else if (recState === 'recording') stopRecording();
    // 'transcribing' — ignore clicks until the round trip finishes.
  }

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 50 }}>
      <style>{`@keyframes ac-mic-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
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
                      overflowWrap: 'break-word',
                      wordBreak: 'break-word',
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
            {recState === 'recording' && (
              <div style={{ fontSize: 12, color: 'var(--danger)', padding: '0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'ac-mic-pulse 1s ease-in-out infinite' }} />
                Recording…
              </div>
            )}
            {recState === 'transcribing' && (
              <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '0 2px' }}>
                🎤 Transcribing…
              </div>
            )}
            <form onSubmit={submit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter inserts a newline — standard
                  // chat-input convention, and what makes multi-line text
                  // (typed or voice-transcribed) actually reviewable here.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit(e);
                  }
                }}
                placeholder="Ask, create, or update a task…"
                rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
                style={{ color: 'var(--ink-4)', maxHeight: 160, overflowY: 'auto' }}
              />
              <button
                type="button"
                onClick={onMicClick}
                disabled={recState === 'transcribing' || (busy && recState === 'idle')}
                aria-label={recState === 'recording' ? 'Stop recording' : 'Record a voice message'}
                title={recState === 'recording' ? 'Stop recording' : 'Record a voice message'}
                className="rounded px-3 py-1 text-sm font-medium"
                style={{
                  background: recState === 'recording' ? 'var(--danger)' : 'var(--ink-0)',
                  color: recState === 'recording' ? '#fff' : 'var(--ink-4)',
                  border: '1px solid var(--ink-2)',
                  animation: recState === 'recording' ? 'ac-mic-pulse 1s ease-in-out infinite' : undefined,
                }}
              >
                {recState === 'transcribing' ? '…' : '🎤'}
              </button>
              <button type="submit" disabled={isBusy}
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
