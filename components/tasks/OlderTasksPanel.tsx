'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';
import { STATUS_LABELS, doneAt } from '@/lib/types';

// "Sep 3" for this year, "Sep 3, 2025" for any other year.
function formatDone(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

// Full-screen list of every Completed task older than 7 days plus every
// Archived one, newest first. Rows open the same task modal as the board
// (moving a task back is done there, in its Status field).
export default function OlderTasksPanel({ tasks, onOpen, onClose }: {
  tasks: Task[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = [...tasks]
    .sort((a, b) => Date.parse(doneAt(b)) - Date.parse(doneAt(a)))
    .filter((t) => !q || t.title.toLowerCase().includes(q));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: '#fbfaf7', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(16px, 4vw, 40px) clamp(14px, 3vw, 24px) 48px' }}>
        <button
          onClick={onClose}
          style={{
            font: "600 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.6)', background: 'transparent',
            border: 'none', padding: '10px 0', cursor: 'pointer', minHeight: 44,
          }}
        >
          ← Back to tasks
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 16px' }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>
            Older and archived
          </div>
          <span style={{ font: "600 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)' }}>{tasks.length}</span>
        </div>

        <input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          aria-label="Search older and archived tasks"
          style={{
            width: '100%', fontSize: 16, color: '#111', padding: '11px 14px', marginBottom: 14,
            border: '1px solid rgba(17,17,17,.12)', borderRadius: 8, background: '#fff',
            boxSizing: 'border-box', fontFamily: "'Inter Tight', sans-serif", outline: 'none',
          }}
        />

        {rows.length === 0 && (
          <div style={{ font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', padding: '8px 2px' }}>
            {q ? 'Nothing found' : 'Nothing here'}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpen(t.id)}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap',
                gap: '4px 14px', textAlign: 'left', width: '100%', cursor: 'pointer', minHeight: 44,
                background: '#fff', border: '1px solid rgba(17,17,17,.08)', borderRadius: 10, padding: '12px 14px',
              }}
            >
              <span style={{
                flex: '1 1 260px', minWidth: 0, font: "600 14px 'Inter Tight', sans-serif", color: '#111', lineHeight: 1.35,
              }}>
                {t.title}
              </span>
              <span style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.5)', whiteSpace: 'nowrap' }}>
                {STATUS_LABELS[t.status]} · {formatDone(doneAt(t))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
