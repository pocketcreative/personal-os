alter table tasks
  add column category text not null default 'personal'
    check (category in ('personal', 'business')),
  add column status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed'));

-- Backfill: tasks already marked done via completed_at should read as
-- completed, not fall back to the new column's 'not_started' default.
update tasks set status = 'completed' where completed_at is not null;

-- Per-task (not per-user) one-open-session guarantee: a single task can't
-- have two overlapping timer sessions, but different tasks can each run
-- independently now that the one-timer-max-app-wide invariant is retired.
--
-- Migration 0002's per-user index turned out to already be applied live
-- (contrary to the assumption when this migration was drafted — confirmed
-- 2026-07-10 by reproducing a blocked second concurrent timer with error
-- "duplicate key value violates unique constraint timer_sessions_one_open_idx").
-- It must be dropped or it keeps enforcing the old app-wide one-timer rule
-- regardless of this new per-task index.
drop index if exists timer_sessions_one_open_idx;

create unique index timer_sessions_one_open_per_task_idx
  on timer_sessions (task_id)
  where ended_at is null;
