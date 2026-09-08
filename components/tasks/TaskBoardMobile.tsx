'use client';
import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import { reorderByPointerY, type CardRect } from '@/lib/dragReorder';
import FieldPopover from './FieldPopover';
import OwnerCell from './OwnerCell';
import TaskDetailSheet from './TaskDetailSheet';
import GoalBanner from './GoalBanner';
import NeedsInputBanner from './NeedsInputBanner';
import AddTaskInput from './AddTaskInput';
import type { Task } from '@/lib/types';
import { STATUS_LABELS } from '@/lib/types';

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', completed: '#2f9e44', archived: 'rgba(154,122,46,.4)',
};
const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.45)', in_progress: '#a16207', completed: '#227a37', archived: 'rgba(154,122,46,.65)',
};

const isActive = (t: Task) => t.status !== 'completed' && t.status !== 'archived';

// HTML5 native drag events (used by TaskBoardDesktop) don't fire reliably on
// touch, so this drag handle uses Pointer Events instead — they unify mouse/
// touch/pen with no added dependency. Move/up are tracked via window
// listeners added imperatively on press (see startDrag) rather than
// setPointerCapture — WebKit has a history of inconsistent pointer-capture
// behavior specifically for touch pointers, and the window-listener pattern
// (what most production drag libraries use) works uniformly everywhere.
function DragHandle({ dragging, onPointerDown }: {
  dragging: boolean;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, marginLeft: -8, marginTop: -8, flex: 'none',
        fontSize: 16, color: 'rgba(17,17,17,.3)', touchAction: 'none',
        cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' as const,
      }}
    >⠿</div>
  );
}

export default function TaskBoardMobile() {
  const d = useTaskDashboard();
  const sfActive = d.statusFilters.length > 0;
  const pfActive = d.priorityFilters.length > 0;
  const activeIds = d.tasks.filter(isActive).map((t) => t.id);

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Card geometry is frozen for the duration of a gesture (captured once on
  // pointer-down) rather than re-measured on every move — see
  // lib/dragReorder.ts. Doesn't need to be React state since nothing reads
  // it during render.
  const dragRectsRef = useRef<CardRect[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropNeighbor, setDropNeighbor] = useState<{ id: string; edge: 'top' | 'bottom' } | null>(null);

  const startDrag = (taskId: string) => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rects: CardRect[] = [];
    for (const id of activeIds) {
      const el = cardRefs.current.get(id);
      if (el) {
        const r = el.getBoundingClientRect();
        rects.push({ id, top: r.top, height: r.height });
      }
    }
    dragRectsRef.current = rects;
    setDragId(taskId);
    setDropNeighbor(null);

    // Track the gesture via window listeners, added/removed for just this
    // gesture's lifetime, rather than setPointerCapture — see DragHandle's
    // comment above. `rects` and `taskId` are closed over directly instead
    // of read back from refs/state, so these can't race a re-render.
    const handleMove = (ev: globalThis.PointerEvent) => {
      const order = reorderByPointerY(rects, taskId, ev.clientY);
      const idx = order.indexOf(taskId);
      if (idx < order.length - 1) setDropNeighbor({ id: order[idx + 1], edge: 'top' });
      else if (idx > 0) setDropNeighbor({ id: order[idx - 1], edge: 'bottom' });
      else setDropNeighbor(null);
    };
    const handleUp = (ev: globalThis.PointerEvent) => {
      const order = reorderByPointerY(rects, taskId, ev.clientY);
      const originalIds = rects.map((r) => r.id);
      if (order.join() !== originalIds.join()) d.reorderTasks(order);
      setDragId(null);
      setDropNeighbor(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  return (
    <div style={{ background: '#f3f1ec', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'clamp(12px, 4vw, 20px) clamp(6px, 2vw, 20px) 0', flex: 'none' }}>
      <div style={{
        background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10,
        boxShadow: '0 2px 18px rgba(0,0,0,.05)', padding: '16px 16px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Task Dashboard</div>
        </div>
        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
        <div style={{ marginTop: 14 }}>
          <GoalBanner />
          <NeedsInputBanner tasks={d.tasks} onSelect={d.setActiveTaskId} />
        </div>
        {/* No overflowX here (deliberately) — the two chips comfortably fit
            any real phone width, and setting overflow-x to a non-visible
            value forces the browser to compute overflow-y as auto too (per
            the CSS overflow spec), which was silently clipping each
            popover's dropdown panel since it opens downward past this row's
            own short height. If more filters get added later and this row
            genuinely needs to scroll, the popover panel will need to escape
            via a portal rather than reintroducing overflow here. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <FieldPopover
            trigger={
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 20,
                border: `1px solid ${sfActive ? 'rgba(198,161,91,.4)' : 'rgba(17,17,17,.12)'}`,
                background: sfActive ? 'rgba(198,161,91,.1)' : '#fff',
                font: "600 12.5px 'Inter Tight', sans-serif", color: sfActive ? '#9a7a2e' : '#111',
              }}>Status <span style={{ fontSize: 8 }}>▾</span></span>
            }
            options={(['not_started', 'in_progress', 'completed', 'archived'] as const).map((s) => ({
              label: `${d.statusFilters.includes(s) ? '✓ ' : ''}${STATUS_LABELS[s]}`,
              onSelect: () => d.toggleStatusFilter(s),
            }))}
          />
          <FieldPopover
            trigger={
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 20,
                border: `1px solid ${pfActive ? 'rgba(198,161,91,.4)' : 'rgba(17,17,17,.12)'}`,
                background: pfActive ? 'rgba(198,161,91,.1)' : '#fff',
                font: "600 12.5px 'Inter Tight', sans-serif", color: pfActive ? '#9a7a2e' : '#111',
              }}>Priority <span style={{ fontSize: 8 }}>▾</span></span>
            }
            options={([['today', 'Today'], ['dash', 'No priority']] as const).map(([v, label]) => ({
              label: `${d.priorityFilters.includes(v) ? '✓ ' : ''}${label}`,
              onSelect: () => d.togglePriorityFilter(v),
            }))}
          />
        </div>
      </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(8px, 3vw, 16px) 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AddTaskInput onAdd={d.addTask} />

        {d.tasks.map((task) => {
          const isCompleted = task.status === 'completed';
          const isDragging = dragId === task.id;
          const dropEdge = dropNeighbor?.id === task.id ? dropNeighbor.edge : null;
          return (
            <div
              key={task.id}
              ref={(el) => { if (el) cardRefs.current.set(task.id, el); else cardRefs.current.delete(task.id); }}
              style={{
                background: '#fbfaf7', border: '1px solid rgba(17,17,17,.08)', borderRadius: 14,
                padding: 16,
                boxShadow: dropEdge === 'top' ? 'inset 0 2px 0 0 #9a7a2e, 0 1px 3px rgba(0,0,0,.03)'
                  : dropEdge === 'bottom' ? 'inset 0 -2px 0 0 #9a7a2e, 0 1px 3px rgba(0,0,0,.03)'
                  : '0 1px 3px rgba(0,0,0,.03)',
                opacity: isDragging ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                {isActive(task) && (
                  <DragHandle dragging={isDragging} onPointerDown={startDrag(task.id)} />
                )}
                <div
                  onClick={() => d.setActiveTaskId(task.id)}
                  style={{ flex: 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      font: "600 16px 'Inter Tight', sans-serif",
                      color: isCompleted ? 'rgba(17,17,17,.4)' : '#111',
                      textDecorationLine: isCompleted ? 'line-through' : 'none',
                      textDecorationColor: 'rgba(17,17,17,.25)',
                    }}>{task.title}</span>
                    {task.needs_input && <span title={task.input_note ?? 'Needs your input'} style={{ fontSize: 13 }}>⚠️</span>}
                  </div>
                  {task.needs_input && task.input_note && (
                    <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: '#9a7a2e', marginTop: 3 }}>{task.input_note}</div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {/* Blank owner still gets a chip now (a faint "+ owner"),
                    since it's the tap target for setting one inline — see
                    OwnerCell. A named teammate or "ai" shows its real
                    label/color as before. */}
                <OwnerCell
                  owner={task.owner}
                  onChange={(value) => d.updateOwner(task.id, value)}
                  fullWidth={false}
                  containerStyle={{ padding: '5px 11px', borderRadius: 20, background: 'rgba(17,17,17,.05)' }}
                  textStyle={{
                    font: "600 11.5px 'Inter Tight', sans-serif",
                    color: /agent|^ai$/i.test(task.owner) ? '#9a7a2e' : task.owner ? 'rgba(17,17,17,.55)' : 'rgba(17,17,17,.35)',
                  }}
                  empty="+ owner"
                />
                <FieldPopover
                  trigger={
                    <span style={{
                      padding: '5px 11px', borderRadius: 20, background: 'rgba(17,17,17,.05)',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      font: "600 11.5px 'Inter Tight', sans-serif", color: STATUS_TEXT[task.status],
                    }}>
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
                <FieldPopover
                  align="right"
                  trigger={
                    task.key
                      ? <span style={{ font: "700 11px 'Inter Tight', sans-serif", color: '#9a7a2e', background: 'rgba(198,161,91,.14)', padding: '5px 11px', borderRadius: 20, letterSpacing: '.03em' }}>TODAY</span>
                      : <span style={{ font: "600 11.5px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.35)', background: 'rgba(17,17,17,.05)', padding: '5px 11px', borderRadius: 20 }}>No priority</span>
                  }
                  options={[
                    { label: 'Today', onSelect: () => d.updatePriority(task.id, true) },
                    { label: 'No priority', onSelect: () => d.updatePriority(task.id, false) },
                  ]}
                />
              </div>
            </div>
          );
        })}

        <AddTaskInput onAdd={d.addTask} />
      </div>

      {d.activeTask && (
        <TaskDetailSheet
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
