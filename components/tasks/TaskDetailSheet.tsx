'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';

export default function TaskDetailSheet({ task, onClose, onSave, onDelete }: {
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
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fbfaf7', borderRadius: '20px 20px 0 0', width: 390, maxWidth: '100%',
          maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 -10px 40px rgba(0,0,0,.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 3, background: 'rgba(17,17,17,.15)' }} />
        </div>
        <div style={{ padding: '16px 24px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            style={{
              flex: 1, font: "700 19px 'Inter Tight', sans-serif", color: '#111',
              letterSpacing: '-0.01em', border: 'none', outline: 'none', background: 'transparent',
            }}
          />
          <span onClick={done} style={{ cursor: 'pointer', color: 'rgba(17,17,17,.4)', fontSize: 17, padding: 4 }}>✕</span>
        </div>
        <div style={{ padding: '8px 24px 28px' }}>
          <div style={{ font: "700 10px 'Archivo', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Description
          </div>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this task…"
            style={{
              width: '100%', minHeight: 120, fontSize: 14, lineHeight: 1.5, color: '#111',
              resize: 'vertical', padding: '12px 14px', border: '1px solid rgba(17,17,17,.1)',
              borderRadius: 8, background: '#fff', boxSizing: 'border-box',
              fontFamily: "'Inter Tight', sans-serif", outline: 'none',
            }}
          />
        </div>
        <div style={{ padding: '4px 24px 24px' }}>
          <button
            onClick={() => { if (confirm(`Delete "${task.title}"? This can't be undone.`)) onDelete(); }}
            style={{
              width: '100%', font: "600 13px 'Inter Tight', sans-serif", color: '#c0392b', background: 'transparent',
              border: '1px solid rgba(192,57,43,.3)', borderRadius: 8, padding: '11px 0', cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
