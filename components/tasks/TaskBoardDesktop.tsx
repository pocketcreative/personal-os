'use client';
import { useState } from 'react';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import FieldPopover from './FieldPopover';
import TaskDetailModal from './TaskDetailModal';
import GoalBanner from './GoalBanner';
import AddTaskInput from './AddTaskInput';
import type { Task } from '@/lib/types';
import { STATUS_LABELS, KNOWN_OWNERS, OWNER_LABELS } from '@/lib/types';

// '' (blank) means Brendan — shown as nothing, not the word "Brendan", so
// the column stays quiet except when it's actually telling you something
// (a named teammate, or "ai"). Also covers `undefined` defensively, for a
// moment right after this column ships but before its migration has run.
function ownerCellLabel(owner: string | undefined): string {
  if (!owner) return '';
  return OWNER_LABELS[owner] ?? (owner.charAt(0).toUpperCase() + owner.slice(1));
}
// The popover OPTION for the blank value still needs a real label so
// Brendan knows what selecting it means — that's "Brendan", not blank text.
function ownerOptionLabel(owner: string): string {
  return OWNER_LABELS[owner] ?? (owner.charAt(0).toUpperCase() + owner.slice(1));
}

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', completed: '#2f9e44', archived: 'rgba(154,122,46,.4)',
};
const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.45)', in_progress: '#a16207', completed: '#227a37', archived: 'rgba(154,122,46,.65)',
};

// minmax(0, Nfr) instead of a bare `Nfr` on every flexible column: a plain
// `fr` track still refuses to shrink below its content's min-content width,
// which is what was forcing the whole page to overflow horizontally rather
// than truncating text when the window was narrower than the sum of every
// column's natural width. minmax(0, ...) lets the track actually shrink,
// so ellipsis/line-clamp on the text inside can do its job instead.
//
// Category, Exp./Actual Time, and Timer columns are removed from the UI
// (2026-08-27, Brendan doesn't use them) — the underlying task fields and
// hook methods (updateCategory/updateExpected/updateActual/startTimer/
// stopTimer) are left alone in case he wants them back.
const GRID_COLS = '20px minmax(0,1.6fr) minmax(0,1.6fr) minmax(0,.9fr) minmax(0,1.1fr) minmax(0,.8fr)';

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
    <div style={{ width: '96%', maxWidth: 2200, margin: '0 auto', padding: '56px 0', background: '#f3f1ec' }}>
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

          <GoalBanner />

          {/* Header cells and every task-row's cells are ALL direct children
              of this one grid (each task row below is a display:contents
              wrapper, so its 9 cells fall straight into this shared column
              track instead of forming their own independent grid). That's
              what guarantees the vertical divider lines land in exactly the
              same spot on every row regardless of content height — separate
              per-row grids could round `fr` widths by a sub-pixel or two
              independently of each other, which is what was causing the
              misaligned columns. */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, columnGap: 28 }}>
            <div />
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>Task</div>
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>Description</div>
            <div style={{ ...colStyle, display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>Owner</div>
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>
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
            <div style={{ gridColumn: '1 / -1' }}>
              <AddTaskInput onAdd={d.addTask} />
            </div>

            {d.tasks.map((task) => {
              const isCompleted = task.status === 'completed';
              const draggable = isActive(task);
              const isDragging = draggedId === task.id;
              const isDragOver = dragOverId === task.id && draggedId !== task.id;
              const rowVisual = {
                borderBottom: '1px solid rgba(17,17,17,.08)',
                opacity: isDragging ? 0.4 : 1,
                boxShadow: isDragOver ? 'inset 0 2px 0 0 #9a7a2e' : 'none',
              };
              return (
                <div
                  key={task.id}
                  style={{ display: 'contents' }}
                  draggable={draggable}
                  onDragStart={draggable ? () => setDraggedId(task.id) : undefined}
                  onDragOver={draggable ? (e) => { e.preventDefault(); setDragOverId(task.id); } : undefined}
                  onDragLeave={draggable ? () => setDragOverId((cur) => (cur === task.id ? null : cur)) : undefined}
                  onDrop={draggable ? (e) => { e.preventDefault(); handleDrop(task.id); } : undefined}
                  onDragEnd={draggable ? () => { setDraggedId(null); setDragOverId(null); } : undefined}
                >
                  <div style={{
                    ...rowVisual,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: draggable ? 'grab' : 'default',
                    color: 'rgba(17,17,17,.25)', fontSize: 14, userSelect: 'none',
                  }}>{draggable ? '⠿' : ''}</div>
                  <div
                    onClick={() => d.setActiveTaskId(task.id)}
                    style={{
                      ...rowVisual,
                      padding: '18px 0', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', minWidth: 0,
                    }}
                  >
                    <span style={{
                      font: "500 15px 'Inter Tight', sans-serif",
                      color: isCompleted ? 'rgba(17,17,17,.4)' : '#111',
                      textDecorationLine: isCompleted ? 'line-through' : 'none',
                      textDecorationColor: 'rgba(17,17,17,.25)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{task.title}</span>
                  </div>

                  {/* Description column: a compact one-line signal (mainly
                      "does this need my input"), click to open the full
                      task detail — not meant to show the whole description,
                      that's what clicking in is for. The ⚠️ badge sits
                      top-right of THIS cell specifically when the task
                      needs Brendan's input. */}
                  <div
                    onClick={() => d.setActiveTaskId(task.id)}
                    style={{
                      ...rowVisual, padding: '14px 0', marginLeft: -14, paddingLeft: 14,
                      borderLeft: '1px solid rgba(17,17,17,.08)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', position: 'relative', minWidth: 0,
                    }}
                  >
                    {task.needs_input && (
                      <span
                        title={task.input_note ?? 'Needs your input'}
                        style={{ position: 'absolute', top: '50%', right: 6, transform: 'translateY(-50%)', fontSize: 13, lineHeight: 1 }}
                      >⚠️</span>
                    )}
                    <span style={{
                      font: "500 13px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.65)',
                      paddingRight: task.needs_input ? 20 : 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'block', width: '100%',
                    }}>
                      {task.needs_input && task.input_note
                        ? task.input_note
                        : (task.description || <span style={{ color: 'rgba(17,17,17,.3)' }}>—</span>)}
                    </span>
                  </div>

                  <div style={{ ...rowVisual, padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
                    <FieldPopover
                      trigger={<span style={{
                        font: "600 12px 'Inter Tight', sans-serif",
                        color: task.owner === 'ai' ? '#9a7a2e' : 'rgba(17,17,17,.55)',
                      }}>{ownerCellLabel(task.owner)}</span>}
                      options={KNOWN_OWNERS.map((o) => ({
                        label: ownerOptionLabel(o), onSelect: () => d.updateOwner(task.id, o),
                      }))}
                    />
                  </div>

                  <div style={{ ...rowVisual, padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
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

                  <div style={{ ...rowVisual, padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
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
                </div>
              );
            })}
          </div>
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
            if (patch.owner !== undefined) d.updateOwner(d.activeTask!.id, patch.owner);
            if (patch.needs_input !== undefined) d.updateNeedsInput(d.activeTask!.id, patch.needs_input, patch.input_note ?? null);
          }}
          onDelete={() => { d.deleteTask(d.activeTask!.id); d.setActiveTaskId(null); }}
        />
      )}
    </div>
  );
}
