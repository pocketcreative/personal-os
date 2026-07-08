'use client';
import { useState } from 'react';
import type { Task } from '@/lib/types';
import { URGENCIES, URGENCY_LABELS } from '@/lib/types';

export default function KanbanView({ tasks, onDrop, onOpen, onStartTimer }: {
  tasks: Task[];
  /** target urgency + new priority_score (drag = manual rank = pin, handled by PATCH) */
  onDrop: (taskId: string, urgency: Task['urgency'], priorityScore: number) => void;
  onOpen: (t: Task) => void;
  onStartTimer: (t: Task) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  const byTier = (u: Task['urgency']) =>
    tasks.filter((t) => t.urgency === u).sort((a, b) => b.priority_score - a.priority_score);

  /** Score that lands the dragged card at `index` within the tier's current order. */
  function scoreAt(tier: Task[], index: number): number {
    const above = tier[index - 1]?.priority_score;
    const below = tier[index]?.priority_score;
    if (above == null && below == null) return 700;
    if (above == null) return below! + 10;
    if (below == null) return above - 10;
    return (above + below) / 2;
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {URGENCIES.map((u) => {
        const tier = byTier(u).filter((t) => t.id !== dragId);
        return (
          <div key={u}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) onDrop(dragId, u, scoreAt(tier, tier.length));
              setDragId(null);
            }}
            className="min-h-40 rounded-lg border p-2"
            style={{ borderColor: 'var(--ink-2)' }}>
            <h3 className="mono mb-2 text-xs uppercase tracking-widest" style={{ color: 'var(--ink-3)' }}>
              {URGENCY_LABELS[u]} · {byTier(u).length}
            </h3>
            {tier.map((t, i) => (
              <div key={t.id} draggable
                onDragStart={() => setDragId(t.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  if (dragId && dragId !== t.id) onDrop(dragId, u, scoreAt(tier, i));
                  setDragId(null);
                }}
                className="mb-2 cursor-grab rounded-lg border p-2 text-sm"
                style={{ borderColor: 'var(--ink-2)', background: 'var(--ink-1)' }}>
                <button className="block w-full text-left" onClick={() => onOpen(t)}>
                  {t.key && <span style={{ color: 'var(--warn)' }}>⭐ </span>}{t.title}
                </button>
                <div className="mono mt-1 flex items-center justify-between text-xs" style={{ color: 'var(--ink-3)' }}>
                  <span>
                    {t.time_estimate_min != null ? `est ${t.time_estimate_min}m` : 'est —'}
                    <span style={{ color: t.time_estimate_min != null && t.actual_time_min > t.time_estimate_min ? 'var(--danger)' : 'var(--ok)' }}>
                      {' '}→ {t.actual_time_min}m
                    </span>
                  </span>
                  <button onClick={() => onStartTimer(t)} title="Start timer">▶</button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
