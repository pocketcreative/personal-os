'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task } from '@/lib/types';
import { fetchTasks, patchTask, deleteTask, startTimer } from '@/lib/clientTasks';
import TaskRow from './TaskRow';
import TaskDrawer from './TaskDrawer';
import Panel from '@/components/ui/Panel';

const VIEWS = ['list', 'kanban', 'smart'] as const;
export type View = (typeof VIEWS)[number];

export default function TaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Task | null>(null);
  const dirtyRef = useRef(false); // guard: a mount-time GET must never clobber a fresh edit (guide bug #4)
  // Ids being optimistically completed/deleted right now — load() must not
  // resurrect them if a concurrent capture:done/timer:changed event fires
  // mid-request, before the server has actually processed the removal.
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await fetchTasks('open');
    const withoutPendingRemovals = data.filter((d) => !pendingRemovalRef.current.has(d.id));
    if (!dirtyRef.current) setTasks(withoutPendingRemovals);
    else setTasks((cur) => withoutPendingRemovals.map((d) => cur.find((c) => c.id === d.id && c.updated_at > d.updated_at) ?? d));
  }, []);

  useEffect(() => {
    setView((localStorage.getItem('pos-task-view') as View) || 'list');
    load();
    window.addEventListener('capture:done', load);
    window.addEventListener('timer:changed', load);
    return () => { window.removeEventListener('capture:done', load); window.removeEventListener('timer:changed', load); };
  }, [load]);

  function switchView(v: View) {
    setView(v);
    localStorage.setItem('pos-task-view', v);
  }

  async function applyPatch(id: string, patch: Partial<Task>) {
    dirtyRef.current = true;
    // Stamp a local updated_at so the dirty-merge comparison in load() sees
    // this optimistic edit as newer than whatever the server still has
    // in-flight — without this, a concurrent load() during the round trip
    // would see equal timestamps and let the server's stale pre-edit copy win.
    const optimisticPatch = { ...patch, updated_at: new Date().toISOString() };
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...optimisticPatch } : t)));
    const saved = await patchTask(id, patch);
    if (saved) setTasks((cur) => cur.map((t) => (t.id === id ? saved : t)));
    else load(); // server rejected — resync rather than lie
  }

  async function complete(task: Task) {
    dirtyRef.current = true;
    pendingRemovalRef.current.add(task.id);
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    const saved = await patchTask(task.id, { completed_at: new Date().toISOString() });
    pendingRemovalRef.current.delete(task.id);
    if (!saved) load();
  }

  async function remove(task: Task) {
    dirtyRef.current = true;
    pendingRemovalRef.current.add(task.id);
    setSelected(null);
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    const ok = await deleteTask(task.id);
    pendingRemovalRef.current.delete(task.id);
    if (!ok) load();
  }

  const sorted = [...tasks].sort((a, b) => b.priority_score - a.priority_score);

  return (
    <Panel
      title="Tasks"
      right={
        <div className="flex gap-1">
          {VIEWS.map((v) => (
            <button key={v} onClick={() => switchView(v)}
              className="mono rounded px-2 py-0.5 text-xs uppercase"
              style={{
                background: view === v ? 'var(--ink-2)' : 'transparent',
                color: view === v ? 'var(--ink-4)' : 'var(--ink-3)',
              }}>
              {v}
            </button>
          ))}
        </div>
      }
    >
      {view === 'list' && (
        <div>
          {sorted.length === 0 && <p style={{ color: 'var(--ink-3)' }}>No open tasks. Capture something.</p>}
          {sorted.map((t) => (
            <TaskRow key={t.id} task={t} onComplete={complete} onOpen={setSelected}
              onStartTimer={(task) => startTimer(task.id)} />
          ))}
        </div>
      )}
      {view === 'kanban' && <p style={{ color: 'var(--ink-3)' }}>Kanban lands in the next task.</p>}
      {view === 'smart' && <p style={{ color: 'var(--ink-3)' }}>Smart search lands soon.</p>}

      {selected && (
        <TaskDrawer
          // key forces a remount when the user clicks a different row while
          // the drawer is already open — without it, TaskDrawer's form state
          // (initialized once via useState) would keep showing the PREVIOUS
          // task's stale field values, and saving would apply them to the
          // wrong task's id.
          key={selected.id}
          task={selected}
          onClose={() => setSelected(null)}
          onDelete={() => remove(selected)}
          onSave={(patch) => { applyPatch(selected.id, patch); setSelected(null); }}
        />
      )}
    </Panel>
  );
}
