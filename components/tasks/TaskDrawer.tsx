'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';
import { URGENCIES, URGENCY_LABELS } from '@/lib/types';

export default function TaskDrawer({ task, onSave, onDelete, onClose }: {
  task: Task;
  onSave: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    urgency: task.urgency,
    key: task.key,
    time_estimate_min: task.time_estimate_min?.toString() ?? '',
    due_date: task.due_date ?? '',
    tags: task.tags.join(', '),
  });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const inputStyle = { borderColor: 'var(--ink-2)', background: 'transparent' };

  function save() {
    onSave({
      title: form.title.trim(),
      description: form.description.trim() || null,
      urgency: form.urgency,
      key: form.key,
      time_estimate_min: form.time_estimate_min ? Number(form.time_estimate_min) : null,
      due_date: form.due_date || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[min(420px,95vw)] overflow-y-auto border-l p-5"
      style={{ borderColor: 'var(--ink-2)', background: 'var(--ink-1)' }}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="mono text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--ink-3)' }}>Edit task</h3>
        <button onClick={onClose}>✕</button>
      </div>
      <div className="flex flex-col gap-3 text-sm">
        <input className="rounded border p-2" style={inputStyle} value={form.title}
          onChange={(e) => set('title', e.target.value)} placeholder="Title" />
        <textarea className="min-h-24 rounded border p-2" style={inputStyle} value={form.description}
          onChange={(e) => set('description', e.target.value)} placeholder="Description" />
        <select className="rounded border p-2" style={inputStyle} value={form.urgency}
          onChange={(e) => set('urgency', e.target.value)}>
          {URGENCIES.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.key} onChange={(e) => set('key', e.target.checked)} /> ⭐ Key task
        </label>
        <input className="rounded border p-2" style={inputStyle} value={form.time_estimate_min}
          onChange={(e) => set('time_estimate_min', e.target.value)} placeholder="Projected minutes" inputMode="numeric" />
        <input type="date" className="rounded border p-2" style={inputStyle} value={form.due_date}
          onChange={(e) => set('due_date', e.target.value)} />
        <input className="rounded border p-2" style={inputStyle} value={form.tags}
          onChange={(e) => set('tags', e.target.value)} placeholder="tags, comma, separated" />
        <div className="mt-2 flex justify-between">
          <button onClick={onDelete} className="rounded border px-3 py-1.5"
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>Delete</button>
          <button onClick={save} className="rounded px-4 py-1.5 font-medium"
            style={{ background: 'var(--accent)', color: 'var(--ink-0)' }}>Save</button>
        </div>
      </div>
    </div>
  );
}
