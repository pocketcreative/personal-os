export interface SortableTask {
  id: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'archived';
  key: boolean; // true = "TODAY" priority
}

/**
 * Fixed, always-applied sort rule — ported from the design handoff's
 * taskRank(). Not user-draggable; recomputed on every render. Completed
 * tasks always sort last regardless of priority. Archived tasks sort last
 * of all — they're hidden by default and only appear when explicitly
 * filtered in, so their relative order barely matters.
 */
function rank(t: SortableTask): number {
  if (t.status === 'archived') return 5;
  if (t.status === 'completed') return 4;
  const inProgress = t.status === 'in_progress';
  if (inProgress && t.key) return 0;
  if (!inProgress && t.key) return 1;
  if (inProgress) return 2;
  return 3;
}

export function sortTasks<T extends SortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => rank(a) - rank(b));
}
