'use client';
import { useRef, useState } from 'react';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import FieldPopover from './FieldPopover';
import TaskDetailModal from './TaskDetailModal';
import GoalBanner from './GoalBanner';
import NeedsInputBanner from './NeedsInputBanner';
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

// Resizable columns: Task, Description, Owner, Status, Priority (the leading
// 20px drag-handle column is fixed, not user-resizable). Widths are in px,
// not fr — once Brendan can drag a column, "fr" no longer means anything
// stable to save/restore, so this switches the whole row to fixed-width
// tracks the moment a resize happens, persisted per-browser in
// localStorage (a display preference, not data worth a DB round-trip).
const COL_KEYS = ['task', 'description', 'owner', 'status', 'priority'] as const;
const DEFAULT_COL_WIDTHS: Record<(typeof COL_KEYS)[number], number> = {
  task: 380, description: 380, owner: 130, status: 170, priority: 110,
};
const COL_WIDTHS_STORAGE_KEY = 'taskBoardColWidths';
const MIN_COL_WIDTH = 70;

function loadColWidths(): Record<(typeof COL_KEYS)[number], number> {
  if (typeof window === 'undefined') return DEFAULT_COL_WIDTHS;
  try {
    const raw = window.localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
    if (!raw) return DEFAULT_COL_WIDTHS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_COL_WIDTHS, ...parsed };
  } catch {
    return DEFAULT_COL_WIDTHS;
  }
}

// Category, Exp./Actual Time, and Timer columns are removed from the UI
// (2026-08-27, Brendan doesn't use them) — the underlying task fields and
// hook methods (updateCategory/updateExpected/updateActual/startTimer/
// stopTimer) are left alone in case he wants them back.

// Declared outside the component (not inline in render) so it's a stable
// component reference across renders, per react-hooks/static-components —
// an inline function component defined inside render gets recreated (and
// loses any of its own state) on every parent re-render.
function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute', top: 0, bottom: -8, right: -14, width: 10,
        cursor: 'col-resize', zIndex: 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(154,122,46,.25)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    />
  );
}

export default function TaskBoardDesktop() {
  const d = useTaskDashboard();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Lazy initializer (not useEffect-after-mount) so there's no extra render
  // just to swap in the saved widths — SSR/first paint gets the defaults
  // (loadColWidths short-circuits when `window` doesn't exist yet), and the
  // client's real first render already has whatever Brendan last saved.
  const [colWidths, setColWidths] = useState(() => loadColWidths());

  const resizingRef = useRef<{ key: (typeof COL_KEYS)[number]; startX: number; startWidth: number } | null>(null);
  const startResize = (key: (typeof COL_KEYS)[number]) => (e: React.MouseEvent) => {
    e.preventDefault();
    // This write only ever runs inside this returned mousedown handler,
    // never during render itself — calling startResize(key) in JSX just
    // builds and returns the handler below. The static react-hooks/refs
    // check can't see through the two-level closure, hence the disable.
    // eslint-disable-next-line react-hooks/refs
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const next = Math.max(MIN_COL_WIDTH, r.startWidth + (ev.clientX - r.startX));
      setColWidths((prev) => ({ ...prev, [r.key]: next }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setColWidths((prev) => {
        try { window.localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
        return prev;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const GRID_COLS = `20px ${COL_KEYS.map((k) => `${colWidths[k]}px`).join(' ')}`;

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
          <NeedsInputBanner tasks={d.tasks} onSelect={d.setActiveTaskId} />

          {/* Header cells and every task-row's cells are ALL direct children
              of this one grid (each task row below is a display:contents
              wrapper, so its 9 cells fall straight into this shared column
              track instead of forming their own independent grid). That's
              what guarantees the vertical divider lines land in exactly the
              same spot on every row regardless of content height — separate
              per-row grids could round `fr` widths by a sub-pixel or two
              independently of each other, which is what was causing the
              misaligned columns. Wrapped in overflowX:auto so a deliberate
              resize that pushes the total width past the container scrolls
              the table itself instead of the whole page. */}
          <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, columnGap: 28, minWidth: 'max-content' }}>
            <div />
            <div style={{ ...colStyle, position: 'relative', display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>Task<ResizeHandle onMouseDown={startResize('task')} /></div>
            <div style={{ ...colStyle, position: 'relative', display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>Description<ResizeHandle onMouseDown={startResize('description')} /></div>
            <div style={{ ...colStyle, position: 'relative', display: 'flex', alignItems: 'center', font: "700 13px 'Archivo', sans-serif", color: '#111', letterSpacing: '.02em', textTransform: 'uppercase', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>Owner<ResizeHandle onMouseDown={startResize('owner')} /></div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>
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
              <ResizeHandle onMouseDown={startResize('status')} />
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.15)', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 2 }}>
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
              // Native HTML5 drag-and-drop needs a real rendered box to act as
              // both the drag source and the drop target — `display: contents`
              // (used on this row's own wrapper below, purely so its cells fall
              // into the shared grid) strips the element from the box tree
              // entirely, so `draggable`/dragstart/dragover/drop never fired
              // when they lived on that wrapper. Fixed by moving them onto the
              // actual cell divs instead: dragstart/dragend live only on the
              // ⠿ handle cell (that's the one visual grab affordance), while
              // dragover/dragleave/drop are spread onto every real cell in the
              // row so the whole row still acts as a drop target.
              const dropZoneProps = draggable ? {
                onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverId(task.id); },
                onDragLeave: () => setDragOverId((cur) => (cur === task.id ? null : cur)),
                onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(task.id); },
              } : {};
              return (
                <div
                  key={task.id}
                  style={{ display: 'contents' }}
                >
                  <div
                    draggable={draggable}
                    onDragStart={draggable ? () => setDraggedId(task.id) : undefined}
                    onDragEnd={draggable ? () => { setDraggedId(null); setDragOverId(null); } : undefined}
                    {...dropZoneProps}
                    style={{
                    ...rowVisual,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: draggable ? 'grab' : 'default',
                    color: 'rgba(17,17,17,.25)', fontSize: 14, userSelect: 'none',
                  }}>{draggable ? '⠿' : ''}</div>
                  <div
                    onClick={() => d.setActiveTaskId(task.id)}
                    {...dropZoneProps}
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
                    {...dropZoneProps}
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

                  <div {...dropZoneProps} style={{ ...rowVisual, padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
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

                  <div {...dropZoneProps} style={{ ...rowVisual, padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
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

                  <div {...dropZoneProps} style={{ ...rowVisual, padding: '14px 0', marginLeft: -14, paddingLeft: 14, borderLeft: '1px solid rgba(17,17,17,.08)', display: 'flex', alignItems: 'center' }}>
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
