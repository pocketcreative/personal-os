-- Real time-picking for the Content Management System calendar (task: "I want
-- to pick the timing to select on the OS... if I am posting two videos a day
-- ... they might be posted on the same timing which would be better if they
-- are both posted on different timings").
--
-- Schema decision: add a separate nullable `post_time` (time, no timezone)
-- column rather than converting `post_date` to timestamptz. Reasoning:
--   - `post_date` (date-only) is load-bearing all over the calendar: day
--     grouping (CalendarView's `byDate` map keys on the plain YYYY-MM-DD
--     string), the drag-and-drop handler (`updateItem(id, { post_date: date })`
--     where `date` is a droppable day id), the agenda list's month filter.
--     Converting it to timestamptz would touch every one of those call sites
--     for no real benefit.
--   - A separate time column keeps "what day" and "what time of day" as two
--     independently-editable concerns, matching how Brendan actually picks
--     them in the UI (a date field and a time field).
--   - Stored as a naive wall-clock time (no timezone), always interpreted as
--     Asia/Singapore -- same convention the Zernio integration already uses
--     for `scheduled_for` (see lib/zernio.ts: "local (Asia/Singapore) time,
--     no Z suffix"). This is the one format that's actually consistent with
--     what already ships to Zernio, not a new bolted-on shape.
--   - Nullable: an item with no post_time set yet has no time opinion (falls
--     back to a default only at the point of actually scheduling to Zernio,
--     same as before this change -- see lib/contentItemsServer.ts).
--
-- To apply: run via the Supabase Management API SQL endpoint (see
-- reference-supabase-access-token-location in memory), same convention as
-- every other migration in this repo run outside the SQL Editor.

alter table content_items add column post_time time;

comment on column content_items.post_time is
  'Wall-clock Singapore time Brendan picked for this item''s post_date, e.g. 09:00:00. Null = no time chosen yet. This is the time actually sent to Zernio as scheduledFor''s HH:MM when Stage=Scheduled -- see lib/contentItemsServer.ts syncZernioForPatch.';
