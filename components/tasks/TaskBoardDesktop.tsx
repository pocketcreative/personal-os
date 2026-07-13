'use client';
import { useState } from 'react';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import { useLiveTimer } from '@/lib/useLiveTimer';
import ClockInput from './ClockInput';
import FieldPopover from './FieldPopover';
import TaskDetailModal from './TaskDetailModal';
import type { Task } from '@/lib/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/types';

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', completed: '#2f9e44', archived: 'rgba(154,122,46,.4)',
};
const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.45)', in_progress: '#a16207', completed: '#227a37', archived: 'rgba(154,122,46,.65)',
};

function TimerCell({ task, onStart, onStop }: {
  task: Task; onStart: () => void; onStop: () => void;
}) {
  const liveMin = useLiveTimer(task.active_timer?.started_at ?? null);
  if (task.status === 'completed') {
    return <span style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)' }}>—</span>;
  }
  const running = !!task.active_timer;
  const totalMin = running ? task.actual_time_min + liveMin : task.actual_time_min;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(Math.floor(totalMin % 60)).padStart(2, '0');
  const ss = String(Math.floor((totalMin * 60) % 60)).padStart(2, '0');
  return (
    <div onClick={running ? onStop : onStart} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>{running ? '⏳' : '⌛'}</span>
      <span style={{
        fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, fontWeight: 600,
        letterSpacing: '.02em', color: running ? '#9a7a2e' : '#111',
      }}>{hh}:{mm}:{ss}</span>
    </div>
  );
}

const GRID_COLS = '20px 2fr .9fr 1.1fr .8fr .9fr .9fr 1fr';

export default function TaskBoardDesktop() {
  const d = useTaskDashboard();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const colStyle = { fontFamily: "'Archivo', sans-serif" };

  const isActive = (t: Task) => t.status !== 'completed' && t.status !== 'archived';
  const activeIds = d.tasks.filter(isActive).map((t) => t.id);

  const handleDrop = (overId: string) => {
    if (draggedId && draggedId !== overId) {
      const from = activeIds.indexOf(draggedId);
      const to = activeIds.indexOf(overId);
      if (from !== -1 && to !== -1) {
        const next = [...activeIds];
        next.splice(from, 1);
        next.splice(to, 0, draggedId);
        d.reorderTasks(next);
      }
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <div style={{ maxWidth: 1220, margin: '0 auto', padding: '56px 24px', background: '#f3f1ec' }}>
      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)' }}>
        <div style={{ padding: '40px 44px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 36 }}>
            <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Task Dashboard</div>
            <div style={{
              font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: GRID_COLS,
            columnGap: 28, borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2,
          }}>
            <div />
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase' }}>Task</div>
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Category</div>
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>
              <FieldPopover
                align="left"
                trigger={
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    font: "700 13px 'Archivo', sans-serif",
                    color: d.statusFilters.length > 0 ? '#9a7a2e' : '#111',
                    letterSpacing: '.02em', textTransform: 'uppercase',
                  }}>Status <span style={{ fontSize: 9 }}>▾</span></span>
                }
                options={(['not_started', 'in_progress', 'completed', 'archived'] as const).map((s) => ({
                  label: `${d.statusFilters.includes(s) ? '✓ ' : ''}${STATUS_LABELS[s]}`,
                  onSelect: () => d.toggleStatusFilter(s),
                }))}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>
              <FieldPopover
                align="left"
                trigger={
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    font: "700 13px 'Archivo', sans-serif",
                    color: d.priorityFilters.length > 0 ? '#9a7a2e' : '#111',
                    letterSpacing: '.02em', textTransform: 'uppercase',
                  }}>Priority <span style={{ fontSize: 9 }}>▾</span></span>
                }
                options={([['today', 'Today'], ['dash', '—']] as const).map(([v, label]) => ({
                  label: `${d.priorityFilters.includes(v) ? '✓ ' : ''}${label}`,
                  onSelect: () => d.togglePriorityFilter(v),
                }))}
              />
            </div>
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Exp. Time</div>
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Actual Time</div>
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)' }}>Timer</div>
          </div>

          {d.tasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const draggable = isActive(task);
            const isDragging = draggedId === task.id;
            const isDragOver = dragOverId === task.id && draggedId !== task.id;
            return (
              <div
                key={task.id}
                draggable={draggable}
                onDragStart={draggable ? () => setDraggedId(task.id) : undefined}
                onDragOver={draggable ? (e) => { e.preventDefault(); setDragOverId(task.id); } : undefined}
                onDragLeave={draggable ? () => setDragOverId((cur) => (cur === task.id ? null : cur)) : undefined}
                onDrop={draggable ? (e) => { e.preventDefault(); handleDrop(task.id); } : undefined}
                onDragEnd={draggable ? () => { setDraggedId(null); setDragOverId(null); } : undefined}
                style={{
                  display: 'grid', gridTemplateColumns: GRID_COLS,
                  columnGap: 28, borderBottom: '1px solid rgba(17,17,17,.08)',
                  opacity: isDragging ? 0.4 : 1,
                  boxShadow: isDragOver ? 'inset 0 2px 0 0 #9a7a2e' : 'none',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: draggable ? 'grab' : 'default',
                  color: 'rgba(17,17,17,.25)', fontSize: 14, userSelect: 'none',
                }}>{draggable ? '⠿' : ''}</div>
                <div
                  onClick={() => d.setActiveTaskId(task.id)}
                  style={{
                    font: "500 15px 'Inter Tight', sans-serif",
                    color: isCompleted ? 'rgba(17,17,17,.4)' : '#111',
                    padding: '18px 0', textDecorationLine: isCompleted ? 'line-through' : 'none',
                    textDecorationColor: 'rgba(17,17,17,.25)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                  }}
                >{task.title}</div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <FieldPopover
                    trigger={<span style={{
                      font: "600 12px 'Inter Tight', sans-serif",
                      color: task.category === 'business' ? '#9a7a2e' : 'rgba(17,17,17,.55)',
                    }}>{CATEGORY_LABELS[task.category]}</span>}
                    options={[
                      { label: 'Personal', onSelect: () => d.updateCategory(task.id, 'personal') },
                      { label: 'Business', onSelect: () => d.updateCategory(task.id, 'business') },
                    ]}
                  />
                </div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <FieldPopover
                    trigger={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: "600 12px 'Inter Tight', sans-serif", color: STATUS_TEXT[task.status] }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[task.status] }} />
                        {STATUS_LABELS[task.status]}
                      </span>
                    }
                    options={[
                      { label: 'Not started', onSelect: () => d.updateStatus(task.id, 'not_started') },
                      { label: 'In progress', onSelect: () => d.updateStatus(task.id, 'in_progress') },
                      { label: 'Completed', onSelect: () => d.updateStatus(task.id, 'completed') },
                      { label: 'Archived', onSelect: () => d.updateStatus(task.id, 'archived') },
                    ]}
                  />
                </div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <FieldPopover
                    trigger={
                      task.key
                        ? <span style={{ font: "700 11px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(198,161,91,.14)', padding: '4px 9px', borderRadius: 20, letterSpacing: '.03em' }}>TODAY</span>
                        : <span style={{ font: "600 11px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)' }}>—</span>
                    }
                    options={[
                      { label: 'Today', onSelect: () => d.updatePriority(task.id, true) },
                      { label: '—', onSelect: () => d.updatePriority(task.id, false) },
                    ]}
                  />
                </div>

                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <ClockInput minutes={task.time_estimate_min ?? 0} onChange={(m) => d.updateExpected(task.id, m)} />
                </div>
                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <ClockInput minutes={task.actual_time_min} onChange={(m) => d.updateActual(task.id, m)} />
                </div>
                <div style={{ padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                  <TimerCell task={task} onStart={() => d.startTimer(task.id)} onStop={() => d.stopTimer(task.id)} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 32 }} />
      </div>

      {d.activeTask && (
        <TaskDetailModal
          task={d.activeTask}
          onClose={() => d.setActiveTaskId(null)}
          onSave={(patch) => {
            if (patch.title !== undefined) d.updateName(d.activeTask!.id, patch.title);
            if (patch.description !== undefined) d.updateDescription(d.activeTask!.id, patch.description);
          }}
          onDelete={() => { d.deleteTask(d.activeTask!.id); d.setActiveTaskId(null); }}
        />
      )}
    </div>
  );
}
