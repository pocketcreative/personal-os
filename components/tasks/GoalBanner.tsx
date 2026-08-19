'use client';
import { useEffect, useRef, useState } from 'react';

export default function GoalBanner() {
  const [id, setId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/goal')
      .then((r) => r.json())
      .then((g) => { setId(g.id); setTitle(g.title); });
  }, []);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(title);
    setEditing(true);
  };

  const save = async () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === title || !id) return;
    setTitle(next); // optimistic
    const res = await fetch('/api/goal', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: next }),
    });
    if (!res.ok) setTitle(title); // revert on failure — no silent swallow
  };

  return (
    <div
      style={{
        background: '#111',
        borderRadius: 8,
        padding: '14px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
      }}
    >
      <span style={{ font: "700 11px 'Archivo', sans-serif", color: 'rgba(255,255,255,.5)', letterSpacing: '.06em', textTransform: 'uppercase', flex: 'none' }}>
        Current Goal
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            font: "700 15px 'Archivo', sans-serif", color: '#fff', letterSpacing: '-0.01em',
            background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,.35)',
            outline: 'none', flex: 1, padding: '0 0 1px',
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          title="Click to edit"
          style={{ font: "700 15px 'Archivo', sans-serif", color: '#fff', letterSpacing: '-0.01em', cursor: 'pointer' }}
        >
          {title || '…'}
        </span>
      )}
    </div>
  );
}
