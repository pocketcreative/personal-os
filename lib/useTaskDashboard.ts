'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KanbanColumn, Task } from '@/lib/types';
import { columnPatch } from '@/lib/types';
import { sortTasks } from '@/lib/taskSort';

async function fetchAllTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks?status=all');
  if (!res.ok) { console.error('fetchAllTasks failed', res.status, await res.text()); return []; }
  return res.json();
}

async function createTask(title: string): Promise<Task | null> {
  const res = await fetch('/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!res.ok) { console.error('createTask failed', res.status, await res.text()); return null; }
  return res.json();
}

async function patchTask(id: string, patch: Partial<Task>): Promise<Task | null> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchTask failed', res.status, await res.text()); return null; }
  return res.json();
}

async function deleteTaskApi(id: string): Promise<boolean> {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteTask failed', res.status, await res.text());
  return res.ok;
}

async function startTimerApi(taskId: string): Promise<boolean> {
  const res = await fetch('/api/timers/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) console.error('startTimer failed', res.status, await res.text());
  return res.ok;
}

async function stopTimerApi(taskId: string): Promise<boolean> {
  const res = await fetch('/api/timers/stop', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) console.error('stopTimer failed', res.status, await res.text());
  return res.ok;
}

async function reorderTasksApi(orderedIds: string[]): Promise<boolean> {
  const res = await fetch('/api/tasks/reorder', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderedIds }),
  });
  if (!res.ok) console.error('reorderTasks failed', res.status, await res.text());
  return res.ok;
}

export function useTaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusFilters, setStatusFilters] = useState<Task['status'][]>([]);
  const [priorityFilters, setPriorityFilters] = useState<('today' | 'dash')[]>([]);
  // Kanban board filters (Part 1 spec, 2026-09-24): Agent (multi-select over
  // whatever's actually in agent_tags — not a closed enum), Type, Urgency.
  const [agentFilters, setAgentFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<Task['task_type'][]>([]);
  const [urgencyFilters, setUrgencyFilters] = useState<Task['urgency'][]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await fetchAllTasks();
    const withoutPendingRemovals = data.filter((d) => !pendingRemovalRef.current.has(d.id));
    if (!dirtyRef.current) setTasks(withoutPendingRemovals);
    else setTasks((cur) =>
      withoutPendingRemovals.map((d) => cur.find((c) => c.id === d.id && c.updated_at > d.updated_at) ?? d));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('capture:done', load);
    return () => window.removeEventListener('capture:done', load);
  }, [load]);

  const addTask = useCallback(async (title: string) => {
    const created = await createTask(title);
    if (created) setTasks((cur) => [{ ...created, active_timer: null }, ...cur]);
  }, []);

  const applyPatch = useCallback(async (id: string, patch: Partial<Task>) => {
    dirtyRef.current = true;
    const optimisticPatch = { ...patch, updated_at: new Date().toISOString() };
    setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...optimisticPatch } : t)));
    const saved = await patchTask(id, patch);
    if (saved) setTasks((cur) => cur.map((t) => (t.id === id ? { ...saved, active_timer: t.active_timer } : t)));
    else load();
  }, [load]);

  const deleteTask = useCallback(async (id: string) => {
    dirtyRef.current = true;
    pendingRemovalRef.current.add(id);
    setTasks((cur) => cur.filter((t) => t.id !== id));
    const ok = await deleteTaskApi(id);
    pendingRemovalRef.current.delete(id);
    if (!ok) load();
  }, [load]);

  const startTimer = useCallback(async (taskId: string) => {
    const ok = await startTimerApi(taskId);
    if (ok) load(); // refetch to pick up the new active_timer from the server
  }, [load]);

  const stopTimer = useCallback(async (taskId: string) => {
    const ok = await stopTimerApi(taskId);
    if (ok) load();
  }, [load]);

  // Optimistically stamp each reordered task's sort_order to its new index
  // so the UI doesn't visually snap back while the PATCH round-trips. On
  // failure, resync from the server — same recovery pattern as deleteTask
  // and applyPatch above.
  const reorderTasks = useCallback(async (orderedIds: string[]) => {
    dirtyRef.current = true;
    const now = new Date().toISOString();
    setTasks((cur) => cur.map((t) => {
      const idx = orderedIds.indexOf(t.id);
      return idx === -1 ? t : { ...t, sort_order: idx, updated_at: now };
    }));
    const ok = await reorderTasksApi(orderedIds);
    if (!ok) load();
  }, [load]);

  const toggleFilter = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  // Kanban view shows every stage (Archived is its own column now, not
  // hidden-by-default like the old list view), so statusFilters/
  // priorityFilters are unused by the board itself but kept for now in case
  // another view still wants them — new filtering is additive below.
  const filtered = tasks.filter((t) => {
    const passesStatus = statusFilters.length === 0 ? true : statusFilters.includes(t.status);
    const passesPriority = priorityFilters.length === 0 || priorityFilters.includes(t.key ? 'today' : 'dash');
    const passesAgent = agentFilters.length === 0 || (t.agent_tags ?? []).some((tag) => agentFilters.includes(tag));
    const passesType = typeFilters.length === 0 || typeFilters.includes(t.task_type ?? 'single');
    const passesUrgency = urgencyFilters.length === 0 || urgencyFilters.includes(t.urgency);
    return passesStatus && passesPriority && passesAgent && passesType && passesUrgency;
  });
  const sorted = sortTasks(filtered);

  return {
    tasks: sorted,
    statusFilters, priorityFilters,
    agentFilters, typeFilters, urgencyFilters,
    toggleStatusFilter: (v: Task['status']) => setStatusFilters((f) => toggleFilter(f, v)),
    togglePriorityFilter: (v: 'today' | 'dash') => setPriorityFilters((f) => toggleFilter(f, v)),
    toggleAgentFilter: (v: string) => setAgentFilters((f) => toggleFilter(f, v)),
    toggleTypeFilter: (v: Task['task_type']) => setTypeFilters((f) => toggleFilter(f, v)),
    toggleUrgencyFilter: (v: Task['urgency']) => setUrgencyFilters((f) => toggleFilter(f, v)),
    activeTaskId, setActiveTaskId,
    activeTask: tasks.find((t) => t.id === activeTaskId) ?? null,
    addTask,
    updateCategory: (id: string, category: Task['category']) => applyPatch(id, { category }),
    updateStatus: (id: string, status: Task['status']) => applyPatch(id, { status }),
    // Drag-and-drop between kanban columns: translates the drop target into
    // whatever status/needs_input combo actually produces that column (see
    // columnPatch() in lib/types.ts, the inverse of kanbanColumn()).
    moveToColumn: (id: string, column: KanbanColumn) => applyPatch(id, columnPatch(column)),
    updatePriority: (id: string, today: boolean) => applyPatch(id, { key: today }),
    updateExpected: (id: string, time_estimate_min: number) => applyPatch(id, { time_estimate_min }),
    updateActual: (id: string, actual_time_min: number) => applyPatch(id, { actual_time_min }),
    updateName: (id: string, title: string) => applyPatch(id, { title }),
    updateDescription: (id: string, description: string) => applyPatch(id, { description }),
    updateOwner: (id: string, owner: string) => applyPatch(id, { owner }),
    updateNeedsInput: (id: string, needs_input: boolean, input_note: string | null) =>
      applyPatch(id, { needs_input, input_note }),
    updateAgentTags: (id: string, agent_tags: string[]) => applyPatch(id, { agent_tags }),
    updateTaskType: (id: string, task_type: Task['task_type']) => applyPatch(id, { task_type }),
    updateUrgency: (id: string, urgency: Task['urgency']) => applyPatch(id, { urgency }),
    updateDueDate: (id: string, due_date: string | null) => applyPatch(id, { due_date }),
    updateDecisionsLog: (id: string, decisions_log: string | null) => applyPatch(id, { decisions_log }),
    deleteTask,
    startTimer, stopTimer,
    reorderTasks,
  };
}
