'use client';
import { useState } from 'react';

// Manual add, bypassing the AI capture pipeline entirely (CaptureBox) --
// straight to POST /api/tasks with just a title, no classification/routing.
export default function AddTaskInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  const submit = () => {
    const t = draft.trim();
    if (t) onAdd(t);
    setDraft('');
    setOpen(false);
  };

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          font: "600 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
          cursor: 'pointer', padding: '14px 2px',
        }}
      >+ Add task</div>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setDraft(''); setOpen(false); } }}
      placeholder="Task title…"
      style={{
        width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(17,17,17,.15)',
        font: "500 16px 'Inter Tight', sans-serif", color: '#111', background: '#fff', boxSizing: 'border-box',
      }}
    />
  );
}
