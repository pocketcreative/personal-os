'use client';
import { useState } from 'react';
import { formatClock, parseClockInput } from '@/lib/clockInput';

/**
 * HH:MM clock-style input. Digits fill right-to-left like a stopwatch
 * entry (see lib/clockInput.ts) — the user can never type a letter or
 * malformed value. Commits on blur (calling onChange with the parsed
 * minutes), matching the rest of this app's edit-then-blur pattern
 * (e.g. components/dashboard/SessionCard.tsx's focus field).
 */
export default function ClockInput({ minutes, onChange, size = 'md' }: {
  minutes: number;
  onChange: (minutes: number) => void;
  size?: 'md' | 'sm';
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? formatClock(minutes);

  function commit() {
    if (draft === null) return;
    onChange(parseClockInput(draft));
    setDraft(null);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        border: '1px solid rgba(17,17,17,.1)', borderRadius: 5,
        background: '#fff', color: 'rgba(17,17,17,.75)',
        textAlign: 'center', letterSpacing: '.03em',
        width: size === 'sm' ? '100%' : 82,
        fontSize: size === 'sm' ? 13.5 : 14,
        padding: size === 'sm' ? '6px 4px' : '4px 8px',
      }}
    />
  );
}
