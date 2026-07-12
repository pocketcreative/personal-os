'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';

export default function TaskDetailModal({ task, onClose, onSave, onDelete }: {
  task: Task;
  onClose: () => void;
  onSave: (patch: { title?: string; description?: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  function done() {
    if (name !== task.title) onSave({ title: name });
    if (description !== (task.description ?? '')) onSave({ description });
    onClose();
  }

  return (
    <div
      onClick={done}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,17,17,.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 70, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fbfaf7', borderRadius: 12, width: 520, maxWidth: '100%',
          maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ padding: '32px 32px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1, font: "700 21px 'Inter Tight', sans-serif", color: '#111',
              letterSpacing: '-0.01em', padding: '4px 0', border: 'none', outline: 'none', background: 'transparent',
            }}
          />
          <span onClick={done} style={{ cursor: 'pointer', color: 'rgba(17,17,17,.4)', fontSize: 18, padding: 4 }}>✕</span>
        </div>
        <div style={{ padding: '8px 32px 32px' }}>
          <div style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Description
          </div>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this task…"
            style={{
              width: '100%', minHeight: 140, fontSize: 14, lineHeight: 1.5, color: '#111',
              resize: 'vertical', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
              borderRadius: 6, background: '#fff', boxSizing: 'border-box',
              fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          />
        </div>
        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(17,17,17,.08)', display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={() => { if (confirm(`Delete "${task.title}"? This can't be undone.`)) onDelete(); }}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#c0392b', background: 'transparent',
              border: '1px solid rgba(192,57,43,.3)', borderRadius: 7, padding: '10px 18px', cursor: 'pointer',
            }}
          >
            Delete
          </button>
          <button
            onClick={done}
            style={{
              font: "600 13px 'Inter Tight', sans-serif", color: '#fff', background: '#111',
              border: 'none', borderRadius: 7, padding: '10px 22px', cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
