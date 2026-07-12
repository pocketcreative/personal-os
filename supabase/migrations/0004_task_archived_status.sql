-- Add 'archived' as a valid task status, alongside not_started / in_progress
-- / completed. Archived tasks are hidden from the default Task Dashboard
-- view by client-side filtering (lib/useTaskDashboard.ts) and only reappear
-- when the user explicitly filters to them via the Status filter popover or
-- changes their status back.
--
-- Migration 0003 added `status` with an UNNAMED inline check constraint,
-- which Postgres auto-names `tasks_status_check`. This migration drops that
-- constraint and re-adds it with 'archived' included in the allowed values.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it. If the DROP silently no-ops (constraint already had a different name)
-- and the subsequent ADD CONSTRAINT fails due to a conflicting constraint,
-- run `\d tasks` in the SQL editor to find the actual constraint name, drop
-- that one instead, then re-run the ADD CONSTRAINT statement below.
alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('not_started', 'in_progress', 'completed', 'archived'));
