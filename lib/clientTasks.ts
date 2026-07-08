import type { Task } from '@/lib/types';

export async function fetchTasks(status: 'open' | 'done' = 'open'): Promise<Task[]> {
  const res = await fetch(`/api/tasks?status=${status}`);
  if (!res.ok) { console.error('fetchTasks failed', res.status, await res.text()); return []; }
  return res.json();
}

export async function patchTask(id: string, patch: Partial<Task>): Promise<Task | null> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  if (!res.ok) { console.error('patchTask failed', res.status, await res.text()); return null; }
  return res.json();
}

export async function deleteTask(id: string): Promise<boolean> {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) console.error('deleteTask failed', res.status, await res.text());
  return res.ok;
}

export async function startTimer(taskId: string): Promise<boolean> {
  const res = await fetch('/api/timers/start', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) console.error('startTimer failed', res.status, await res.text());
  else window.dispatchEvent(new Event('timer:changed'));
  return res.ok;
}
