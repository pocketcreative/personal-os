-- Manual drag-to-reorder for self-prioritization. `sort_order` is nullable
-- with no default: null means "never manually placed, use the fixed
-- taskSort.ts rank() rule" — which is exactly every existing task's
-- current (implicit) state, so no backfill is needed or wanted here.
-- Once a task is dragged, it gets a concrete integer position and sorts
-- ahead of the never-touched (null) ones, in the order the user set.
alter table tasks add column sort_order integer;
