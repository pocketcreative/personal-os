'use client';
import type { Task } from '@/lib/types';
import { URGENCY_LABELS } from '@/lib/types';

export default function TaskRow({ task, onComplete, onOpen, onStartTimer }: {
  task: Task;
  onComplete: (t: Task) => void;
  onOpen: (t: Task) => void;
  onStartTimer: (t: Task) => void;
}) {
  const est = task.time_estimate_min;
  const actual = task.actual_time_min;
  const overColor = est != null && actual > est ? 'var(--danger)' : 'var(--ok)';
  return (
    <div className="flex items-center gap-3 border-b px-2 py-2 text-sm" style={{ borderColor: 'var(--ink-2)' }}>
      <input type="checkbox" checked={false} onChange={() => onComplete(task)} aria-label="complete" />
      <button className="flex-1 text-left" onClick={() => onOpen(task)}>
        {task.key && <span style={{ color: 'var(--warn)' }}>⭐ </span>}
        {task.title}
        {task.tags.length > 0 && (
          <span className="mono ml-2 text-xs" style={{ color: 'var(--ink-3)' }}>{task.tags.join(' · ')}</span>
        )}
      </button>
      <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>{URGENCY_LABELS[task.urgency]}</span>
      <span className="mono text-xs">
        {est != null ? `est ${est}m` : 'est —'}
        <span style={{ color: overColor }}> → {actual}m</span>
      </span>
      <button onClick={() => onStartTimer(task)} title="Start timer" className="mono rounded border px-1.5 text-xs"
        style={{ borderColor: 'var(--ink-2)' }}>▶</button>
      {task.due_date && <span className="mono text-xs" style={{ color: 'var(--ink-3)' }}>{task.due_date}</span>}
    </div>
  );
}
