'use client';
import { useTaskDashboard } from '@/lib/useTaskDashboard';
import { useLiveTimer } from '@/lib/useLiveTimer';
import ClockInput from './ClockInput';
import FieldPopover from './FieldPopover';
import TaskDetailSheet from './TaskDetailSheet';
import type { Task } from '@/lib/types';
import { CATEGORY_LABELS, STATUS_LABELS } from '@/lib/types';

const STATUS_DOT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.3)', in_progress: '#eab308', completed: '#2f9e44', archived: 'rgba(154,122,46,.4)',
};
const STATUS_TEXT: Record<Task['status'], string> = {
  not_started: 'rgba(17,17,17,.45)', in_progress: '#a16207', completed: '#227a37', archived: 'rgba(154,122,46,.65)',
};

function MobileTimer({ task, onStart, onStop }: {
  task: Task; onStart: () => void; onStop: () => void;
}) {
  const isCompleted = task.status === 'completed';
  // Completed tasks never count as "running" for display purposes, even if
  // stale local state still has an active_timer (server already auto-closed
  // it — see applyPatch in useTaskDashboard). Don't feed useLiveTimer a live
  // startedAt in that case either, so the displayed time freezes instead of
  // continuing to tick on a card that shows "Completed".
  const liveMin = useLiveTimer(isCompleted ? null : task.active_timer?.started_at ?? null);
  const running = !isCompleted && !!task.active_timer;
  const totalMin = running ? task.actual_time_min + liveMin : task.actual_time_min;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(Math.floor(totalMin % 60)).padStart(2, '0');
  const ss = String(Math.floor((totalMin * 60) % 60)).padStart(2, '0');
  return (
    <div onClick={running ? onStop : onStart} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <span style={{ fontSize: 17, lineHeight: 1 }}>{running ? '⏳' : '⌛'}</span>
      <span style={{
        fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, fontWeight: 600,
        letterSpacing: '.02em', color: isCompleted ? 'rgba(17,17,17,.35)' : (running ? '#9a7a2e' : '#111'),
      }}>{hh}:{mm}:{ss}</span>
    </div>
  );
}

export default function TaskBoardMobile() {
  const d = useTaskDashboard();
  const sfActive = d.statusFilters.length > 0;
  const pfActive = d.priorityFilters.length > 0;

  return (
    <div style={{ background: '#f3f1ec', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 16px', flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ font: "800 22px 'Archivo', sans-serif", color: '#111', letterSpacing: '-0.02em' }}>Task Dashboard</div>
        </div>
        <div style={{ font: "500 12px 'Inter Tight', sans-serif", color: 'rgba(17,17,17,.4)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, overflowX: 'auto' }}>
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {d.tasks.map((task) => {
          const isCompleted = task.status === 'completed';
          return (
            <div key={task.id} style={{
              background: '#fbfaf7', border: '1px solid rgba(17,17,17,.08)', borderRadius: 14,
              padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                <div
                  onClick={() => d.setActiveTaskId(task.id)}
                  style={{
                    font: "600 16px 'Inter Tight', sans-serif",
                    color: isCompleted ? 'rgba(17,17,17,.4)' : '#111',
                    textDecorationLine: isCompleted ? 'line-through' : 'none',
                    textDecorationColor: 'rgba(17,17,17,.25)', flex: 1,
                  }}
                >{task.title}</div>
                <MobileTimer task={task} onStart={() => d.startTimer(task.id)} onStop={() => d.stopTimer(task.id)} />
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <FieldPopover
                  trigger={<span style={{
                    padding: '5px 11px', borderRadius: 20, background: 'rgba(17,17,17,.05)',
                    font: "600 11.5px 'Inter Tight', sans-serif",
                    color: task.category === 'business' ? '#9a7a2e' : 'rgba(17,17,17,.55)',
                  }}>{CATEGORY_LABELS[task.category]}</span>}
                  options={[
                    { label: 'Personal', onSelect: () => d.updateCategory(task.id, 'personal') },
                    { label: 'Business', onSelect: () => d.updateCategory(task.id, 'business') },
                  ]}
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

              <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(17,17,17,.06)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 9.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.35)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Expected</div>
                  <ClockInput size="sm" minutes={task.time_estimate_min ?? 0} onChange={(m) => d.updateExpected(task.id, m)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 9.5px 'Archivo', sans-serif", color: 'rgba(17,17,17,.35)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Actual</div>
                  <ClockInput size="sm" minutes={task.actual_time_min} onChange={(m) => d.updateActual(task.id, m)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {d.activeTask && (
        <TaskDetailSheet
          task={d.activeTask}
          onClose={() => d.setActiveTaskId(null)}
          onSave={(patch) => {
            if (patch.title !== undefined) d.updateName(d.activeTask!.id, patch.title);
            if (patch.description !== undefined) d.updateDescription(d.activeTask!.id, patch.description);
          }}
        />
      )}
    </div>
  );
}
