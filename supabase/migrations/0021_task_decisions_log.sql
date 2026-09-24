-- Adds a "Problems, Solutions & Recommendation" running log to tasks --
-- a running problem -> options considered -> recommended solution write-up,
-- the same pattern Brendan and the orchestrating session already use in
-- Telegram conversation when working through open decisions on a task.
-- Nullable, markdown-formatted free text -- same shape as `description`,
-- not a repurposing of it (description stays the goal/steps/progress log,
-- this is a distinct record of decisions made along the way). Rendered as
-- its own gold-accented section in the task detail view, hidden entirely
-- when null/empty.
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).
alter table tasks
  add column decisions_log text;
