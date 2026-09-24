'use client';
import { useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import TaskCard from './TaskCard';
import TaskDetailModal from './TaskDetailModal';
import GoalBanner from './GoalBanner';
import AddTaskInput from './AddTaskInput';
import FieldPopover from './FieldPopover';
import type { KanbanColumn, Task } from '@/lib/types';
import { AGENT_TAGS, KANBAN_COLUMNS, KANBAN_COLUMN_LABELS, TASK_TYPES, TASK_TYPE_LABELS, URGENCY_LABELS, kanbanColumn } from '@/lib/types';

// One responsive board for both desktop and mobile (replaces the old
// TaskBoardDesktop/TaskBoardMobile list-view split): columns sit in a
// horizontally-scrolling row at every width. On a phone that's a natural
// one-column-at-a-time swipe; on desktop most/all 4 columns fit without
// scrolling. Simpler than maintaining two separate kanban implementations
// for what's fundamentally the same layout at different widths.
const COLUMN_MIN_WIDTH = 280;

// Drag-and-drop: real mouse + touch support via @dnd-kit/core (native HTML5
// drag doesn't work on touch, which is most of how this board gets checked).
// MouseSensor needs a small movement (distance) before a drag "counts", so a
// plain click still opens the card / fires the status popover instead of
// being swallowed as a zero-distance drag. TouchSensor uses delay+tolerance
// instead: a quick swipe (under the delay, or past the tolerance before it
// elapses) is left alone so the board's horizontal column scroll keeps
// working, only a deliberate press-and-hold starts a drag. This is dnd-kit's
// documented pattern for a draggable list that's also a scrollable one —
// don't set touch-action:none on the cards, that would kill the scroll this
// is specifically trying to protect (per the task's own mobile-scroll note).
function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
}

function DraggableTaskCard({ task, onOpen }: {
  task: Task;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'manipulation',
      }}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}

function DroppableColumn({ col, children }: { col: KanbanColumn; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: `1 1 ${COLUMN_MIN_WIDTH}px`, minWidth: COLUMN_MIN_WIDTH, maxWidth: 420,
        scrollSnapAlign: 'start',
        background: isOver ? 'rgba(2,74,221,.05)' : 'rgba(17,17,17,.02)',
        border: isOver ? '1px solid rgba(2,74,221,.35)' : '1px solid rgba(17,17,17,.06)',
        borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
        transition: 'background .12s ease, border-color .12s ease',
      }}
    >
      {children}
    </div>
  );
}

export default function TaskKanbanBoard() {
  const d = useTaskDashboard();
  const sensors = useBoardSensors();
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);

  // Agent picker options: the 7 seeded roles plus any free-text tag already
  // in use on a real task, so a custom tag someone typed into the modal
  // still shows up as a filter option afterward.
  const agentOptions = Array.from(new Set([
    ...AGENT_TAGS,
    ...d.tasks.flatMap((t) => t.agent_tags ?? []),
  ]));

  const columns: Record<string, Task[]> = { not_started: [], in_progress: [], needs_review: [], completed: [], archived: [] };
  for (const t of d.tasks) columns[kanbanColumn(t)].push(t);

  function handleDragStart(event: DragStartEvent) {
    const task = d.tasks.find((t) => t.id === event.active.id);
    setDraggingTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingTask(null);
    const overCol = event.over?.id as KanbanColumn | undefined;
    if (!overCol) return;
    const taskId = event.active.id as string;
    const task = d.tasks.find((t) => t.id === taskId);
    if (!task || kanbanColumn(task) === overCol) return;
    d.moveToColumn(taskId, overCol);
  }

  return (
    <div style={{ width: '96%', maxWidth: 2200, margin: '0 auto', padding: 'clamp(16px, 6vw, 56px) 0' }}>
      <div style={{ background: '#fbfaf7', border: '1px solid rgba(0,0,0,.08)', borderRadius: 10, boxShadow: '0 2px 18px rgba(0,0,0,.05)' }}>
        <div style={{ padding: 'clamp(16px, 4vw, 40px) clamp(14px, 3vw, 44px) 8px' }}>
          <div className="board-header" style={{ marginBottom: 20 }}>
            <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Task Dashboard</div>
            <div style={{
              font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)',
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>

          <GoalBanner />

          <div style={{ marginBottom: 16 }}>
            <AddTaskInput onAdd={d.addTask} />
          </div>

          {/* Filters: Agent / Type / Urgency, per spec — Status has no
              filter chip of its own since the 4 columns already are the
              status breakdown. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <FieldPopover
              closeOnSelect={false}
              trigger={
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 20,
                  border: `1px solid ${d.agentFilters.length ? 'rgba(198,161,91,.4)' : 'rgba(17,17,17,.12)'}`,
                  background: d.agentFilters.length ? 'rgba(198,161,91,.1)' : '#fff',
                  font: "600 12px 'Inter Tight', sans-serif", color: d.agentFilters.length ? '#9a7a2e' : '#111',
                }}>Agent <span style={{ fontSize: 8 }}>▾</span></span>
              }
              options={agentOptions.map((a) => ({
                label: `${d.agentFilters.includes(a) ? '✓ ' : ''}${a}`,
                onSelect: () => d.toggleAgentFilter(a),
              }))}
            />
            <FieldPopover
              closeOnSelect={false}
              trigger={
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 20,
                  border: `1px solid ${d.typeFilters.length ? 'rgba(198,161,91,.4)' : 'rgba(17,17,17,.12)'}`,
                  background: d.typeFilters.length ? 'rgba(198,161,91,.1)' : '#fff',
                  font: "600 12px 'Inter Tight', sans-serif", color: d.typeFilters.length ? '#9a7a2e' : '#111',
                }}>Type <span style={{ fontSize: 8 }}>▾</span></span>
              }
              options={TASK_TYPES.map((t) => ({
                label: `${d.typeFilters.includes(t) ? '✓ ' : ''}${TASK_TYPE_LABELS[t]}`,
                onSelect: () => d.toggleTypeFilter(t),
              }))}
            />
            <FieldPopover
              closeOnSelect={false}
              trigger={
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 20,
                  border: `1px solid ${d.urgencyFilters.length ? 'rgba(198,161,91,.4)' : 'rgba(17,17,17,.12)'}`,
                  background: d.urgencyFilters.length ? 'rgba(198,161,91,.1)' : '#fff',
                  font: "600 12px 'Inter Tight', sans-serif", color: d.urgencyFilters.length ? '#9a7a2e' : '#111',
                }}>Urgency <span style={{ fontSize: 8 }}>▾</span></span>
              }
              options={(['today', 'this_week'] as const).map((u) => ({
                label: `${d.urgencyFilters.includes(u) ? '✓ ' : ''}${URGENCY_LABELS[u]}`,
                onSelect: () => d.toggleUrgencyFilter(u),
              }))}
            />
          </div>

          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDraggingTask(null)}>
            <div style={{
              display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 20,
              scrollSnapType: 'x proximity',
            }}>
              {KANBAN_COLUMNS.map((col) => {
                const colTasks = columns[col];
                return (
                  <DroppableColumn key={col} col={col}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      font: "700 11.5px 'Archivo', sans-serif", color: '#111', letterSpacing: '.03em',
                      textTransform: 'uppercase', padding: '2px 2px 6px',
                    }}>
                      {KANBAN_COLUMN_LABELS[col]}
                      <span style={{ color: 'rgba(17,17,17,.35)', fontWeight: 600 }}>{colTasks.length}</span>
                    </div>
                    {colTasks.length === 0 && (
                      <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.3)', padding: '4px 2px' }}>
                        Nothing here
                      </div>
                    )}
                    {colTasks.map((task) => (
                      <DraggableTaskCard
                        key={task.id}
                        task={task}
                        onOpen={() => d.setActiveTaskId(task.id)}
                      />
                    ))}
                  </DroppableColumn>
                );
              })}
            </div>

            <DragOverlay>
              {draggingTask && (
                <div style={{
                  width: COLUMN_MIN_WIDTH - 24, boxShadow: '0 14px 30px rgba(0,0,0,.2)', borderRadius: 10,
                  transform: 'rotate(1.5deg)', cursor: 'grabbing',
                }}>
                  <TaskCard task={draggingTask} onOpen={() => {}} />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
        <div style={{ height: 24 }} />
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
            if (patch.agent_tags !== undefined) d.updateAgentTags(d.activeTask!.id, patch.agent_tags);
            if (patch.task_type !== undefined) d.updateTaskType(d.activeTask!.id, patch.task_type);
            if (patch.urgency !== undefined) d.updateUrgency(d.activeTask!.id, patch.urgency);
            if (patch.due_date !== undefined) d.updateDueDate(d.activeTask!.id, patch.due_date);
            if (patch.decisions_log !== undefined) d.updateDecisionsLog(d.activeTask!.id, patch.decisions_log);
          }}
          onDelete={() => { d.deleteTask(d.activeTask!.id); d.setActiveTaskId(null); }}
          onSendBack={(reason) => { d.sendBack(d.activeTask!.id, reason); d.setActiveTaskId(null); }}
        />
      )}
    </div>
  );
}
