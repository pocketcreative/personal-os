export interface SortableTask {
  id: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'archived';
  sort_order: number | null; // null = never manually dragged; use the fixed rank() rule
}

/**
 * Fixed, always-applied sort rule — ported from the design handoff's
 * taskRank(). Not user-draggable; recomputed on every render. Completed
 * tasks always sort last regardless of status. Archived tasks sort last
 * of all — they're hidden by default and only appear when explicitly
 * filtered in, so their relative order barely matters.
 *
 * "Today" priority (key) deliberately does NOT factor into rank — it's a
 * filter/badge only (see useTaskDashboard's priorityFilters). It used to
 * boost today-flagged tasks above same-status ones, but that fought with
 * manual drag-to-reorder: marking a different task "today" could shove it
 * above a position the user had deliberately placed something else in.
 */
function rank(t: SortableTask): number {
  if (t.status === 'archived') return 3;
  if (t.status === 'completed') return 2;
  return t.status === 'in_progress' ? 0 : 1;
}

function isDone(t: SortableTask): boolean {
  return t.status === 'completed' || t.status === 'archived';
}

/**
 * Manual drag-to-reorder: among ACTIVE (non-completed, non-archived) tasks,
 * a task the user has dragged (non-null sort_order) sorts ahead of every
 * task that's never been touched (null sort_order), in the exact order the
 * user set (sort_order ascending). Untouched active tasks — including every
 * pre-existing task before this feature shipped, and any brand-new task —
 * fall back to the fixed rank() rule among themselves, so they still land
 * in a sensible bucket instead of dumping below manually-placed low ones.
 *
 * Completed/archived tasks are entirely unaffected by sort_order: they
 * always sort last, in their existing rank() order, never draggable. This
 * holds even defensively if a stray sort_order value somehow ends up on a
 * completed/archived row (shouldn't happen in practice — they're never
 * exposed to the drag UI).
 */
export function sortTasks<T extends SortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aDone = isDone(a);
    const bDone = isDone(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone && bDone) return rank(a) - rank(b);

    // Both active.
    const aOrdered = a.sort_order !== null;
    const bOrdered = b.sort_order !== null;
    if (aOrdered !== bOrdered) return aOrdered ? -1 : 1;
    if (aOrdered && bOrdered) return (a.sort_order as number) - (b.sort_order as number);
    return rank(a) - rank(b);
  });
}
