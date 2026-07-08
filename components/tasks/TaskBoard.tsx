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

  const load = useCallback(async () => {
    const data = await fetchTasks('open');
    if (!dirtyRef.current) setTasks(data);
    else setTasks((cur) => data.map((d) => cur.find((c) => c.id === d.id && c.updated_at > d.updated_at) ?? d));
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
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } as Task : t)));
    const saved = await patchTask(id, patch);
    if (saved) setTasks((cur) => cur.map((t) => (t.id === id ? saved : t)));
    else load(); // server rejected — resync rather than lie
  }

  async function complete(task: Task) {
    dirtyRef.current = true;
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    const saved = await patchTask(task.id, { completed_at: new Date().toISOString() });
    if (!saved) load();
  }

  async function remove(task: Task) {
    dirtyRef.current = true;
    setSelected(null);
    setTasks((cur) => cur.filter((t) => t.id !== task.id));
    if (!(await deleteTask(task.id))) load();
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
          task={selected}
          onClose={() => setSelected(null)}
          onDelete={() => remove(selected)}
          onSave={(patch) => { applyPatch(selected.id, patch); setSelected(null); }}
        />
      )}
    </Panel>
  );
}
