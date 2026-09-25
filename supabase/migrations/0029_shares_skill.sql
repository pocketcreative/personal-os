-- Shares for skills: allow resource_type 'skill' on the shares table (0028
-- only allowed 'sop' and 'board'). resource_id then points at skills.id.
-- The constraint name is Postgres's auto name for the inline column check in
-- 0028 (<table>_<column>_check).
--
-- To apply: paste this file's contents into the Supabase SQL Editor and run
-- it (same convention as prior migrations in this repo).

alter table shares drop constraint shares_resource_type_check;
alter table shares add constraint shares_resource_type_check
  check (resource_type in ('sop', 'board', 'skill'));
